// ─── ObraCerrada — la obra ya pedida: EN_PREPARACION, LISTO, VALIDADO ───────
// EN_PREPARACION: «estamos preparándolo» + historial (certapp_eventos).
// LISTO / VALIDADO: la calificación, «Ver y firmar» (o «Ver el certificado
// firmado»), «Solo validar», «Revisar en la envolvente», su carpeta de Drive
// (compartida con su email) y el apartado DOCUMENTOS (obra/Documentos.jsx): lo
// actual de «1. CEE», «Subir versión nueva», sus .cex y las versiones anteriores,
// todo con el visor de PDF de la app.
// AVISO (el mismo del email de entrega): lo que se cambia a mano en el .cex con
// CE3X NO vuelve a la envolvente.
// FIRMA (services/certapp/firma.js): se firma DESDE EL VISOR, el mismo PDF que se
// está viendo, con el modal del CRM, sin el logo de BROKERGY (firma un técnico
// externo). Firmar es validar: una obra LISTO pasa a VALIDADO. Si la firma llega
// rota, el servidor responde 422 y no guarda nada. Al guardarse, el visor se abre
// con el FIRMADO. Lo firmado manda solo si es posterior al PDF: un PDF nuevo deja
// la firma vieja sin efecto y vuelve «Ver y firmar».
// DEFINITIVO: si lo rehace en su CE3X, sube el XML (se carga en la app), el PDF o
// su .cex (a la cuarentena: copia suya, no se abre nunca).
// Desde que la obra deja BORRADOR, el inmueble, el titular y el cuestionario
// quedan CONGELADOS en el servidor (PUT → 409 OBRA_CERRADA): aquí solo se leen.
// `revisar-de-nuevo` tiene tope (409 SIN_REVISIONES): se dice con calma.
// Debajo del certificado, «¿Algo mal en este certificado? Avísanos» y lo que nos ha
// contado de esta obra con nuestra respuesta (incidencias/Incidencias.jsx).
// POR PARTES (Fran, 26/10/2026, alternativa A: «tanto scroll no»): Resumen (el
// certificado, «Lo siguiente» y los atajos), Documentos, Fotos, Datos de la obra e
// Historial, una cada vez con `?parte=`. En el PC van en el menú lateral (useMenuObra);
// en el móvil, en la barra de abajo, con «Más» para el resto.
// ENCARGO DE BROKERGY (obra/Encargo.jsx): arriba del Resumen, en qué punto lo tiene el CRM.
import { Suspense, useState } from 'react';
import { lazyWithReload } from '../../utils/lazyWithReload';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { API, errorDe, fecha, haceCuanto, mensajeError, urlDe } from '../api';
import { EMAIL_CONTACTO } from '../marca';
import { Enlace, navegar, useRuta } from '../router';
import { Aviso, Hoja, useToast } from '../ui/piezas';
import { useMenuObra } from '../ui/menuObra';
import {
    CheckDibujado, IcoCarpeta, IcoCasa, IcoCheck, IcoChevron, IcoDoc, IcoEnviar, IcoImagen, IcoMenu, IcoPlano, IcoRecargar, IcoReloj, IcoSello, Spinner,
} from '../ui/Iconos';
import { estadoDe } from './comun';
import { EncargoBrokergy } from './Encargo';
import { FotosObra } from './Fotos';
import { ListaDocumentos } from './Documentos';
import { HojaPresentar } from './Presentar';
import { VisorPdf } from './VisorPdf';
import { CLASES, aBase64, autorTxt, useDocumentos } from './documentosComun';
import { IncidenciasObra } from '../incidencias/Incidencias';
import { CEE_SIGN_ANCHOR } from '../../features/expedientes/logic/signBoxes';

// El modal de firma del CRM (pdf.js + AutoFirma) pesa: se carga al pulsar «Firmar». Con lazyWithReload
// (ver App.jsx): tras un deploy, el trozo viejo no existe y la pestaña se recarga sola.
const FirmarConCertificadoModal = lazyWithReload(() => import('../../features/expedientes/components/FirmarConCertificadoModal'), { name: 'certapp:firmar' });

// Pantalla táctil (móvil, tableta): AutoFirma no va ahí; se avisa al firmar desde el visor.
const tactil = () => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;

const LETRAS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
const Letra = ({ l }) => (LETRAS.includes(l) ? <span className={`ca-letra ca-letra-${l}`}>{l}</span> : null);

export function ObraCerrada({ o, resumen = [] }) {
    const { obra, form, eventos, enlaces, cee } = o;
    const toast = useToast();
    const { query } = useRuta();
    const [mas, setMas] = useState(false);
    const [validar, setValidar] = useState(false);
    const [revisar, setRevisar] = useState(false);
    const [nota, setNota] = useState('');
    const [ocupado, setOcupado] = useState(false);
    const [error, setError] = useState(null);
    const [sinRevisiones, setSinRevisiones] = useState(false);
    // Firmar: el PDF en base64 abre el modal; `errorFirma` se queda en la tarjeta.
    const [pdfFirmar, setPdfFirmar] = useState(null);
    const [errorFirma, setErrorFirma] = useState(null);
    const [subiendoDef, setSubiendoDef] = useState(false);
    const [errorDef, setErrorDef] = useState(null);
    // El visor: `{ doc, firmar }` (firmar: el certificado sin firmar, con su botón).
    const [visor, setVisor] = useState(null);
    // Presentar en el Registro: el borrador, y lo que devuelve (justificante, etiqueta, otros).
    const [presentar, setPresentar] = useState(false);
    const [subiendoReg, setSubiendoReg] = useState(null);
    const [errorReg, setErrorReg] = useState(null);
    const est = obra.estado;
    const entregado = est === 'LISTO' || est === 'VALIDADO';
    const documentos = useDocumentos(obra.id, { activo: entregado });
    const dd = documentos.datos;
    // Mientras se leen los documentos, lo que ya decía el GET de la obra.
    const firmado = dd ? !!dd.firmado : !!enlaces?.firmado;
    const registrado = dd?.registro || null;
    const cal = cee?.calificacion;
    const t = form?.titular || {};
    const titulo = [t.nombre, t.apellidos].filter(Boolean).join(' ') || obra.direccion || obra.numero_expediente;
    const urlEnvolvente = `/obra/${obra.id}/envolvente?origen=ext`;

    const accion = async (ruta, cuerpo, ok) => {
        setOcupado(true); setError(null);
        try {
            await axios.post(`${API}/obras/${obra.id}/${ruta}`, cuerpo || {});
            setValidar(false); setRevisar(false); setNota('');
            toast(ok);
            await o.cargar({ silencioso: true });
        } catch (err) {
            if (ruta === 'revisar-de-nuevo' && errorDe(err).code === 'SIN_REVISIONES') setSinRevisiones(true);
            else setError(mensajeError(err));
        } finally { setOcupado(false); }
    };
    const abrirRevisar = () => { setError(null); setRevisar(true); };

    const verDoc = (doc, { firmar = false } = {}) => { if (doc) { setErrorFirma(null); setVisor({ doc, firmar }); } };
    const verCertificado = () => (dd?.firmado ? verDoc(dd.firmado) : verDoc(dd?.certificado, { firmar: true }));

    // Firmar desde el visor: el PDF que se está viendo va al modal de AutoFirma y
    // el firmado vuelve al servidor, que comprueba la firma antes de guardarlo.
    const firmarDesdeVisor = (bytes) => {
        setValidar(false); setErrorFirma(null);
        try { setPdfFirmar(aBase64(bytes)); } catch (err) { setErrorFirma(mensajeError(err, 'No se ha podido preparar el certificado para firmarlo.')); }
    };
    const alFirmar = async (firmadoB64) => {
        try {
            const bytes = Uint8Array.from(atob(firmadoB64), c => c.charCodeAt(0));
            const fd = new FormData();
            fd.append('fichero', new Blob([bytes], { type: 'application/pdf' }), `${obra.numero_expediente || 'CEE'} - CEE_fdo.pdf`);
            const { data } = await axios.post(`${API}/obras/${obra.id}/cee/firmado`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
            setPdfFirmar(null);
            toast(data?.avisos?.length ? `Firmado y guardado. Ojo: ${data.avisos[0]}` : 'Firmado y guardado en tu carpeta.', 5000);
            const [nuevos] = await Promise.all([documentos.recargar({ silencioso: true }), o.cargar({ silencioso: true })]);
            // Se ve lo firmado: el visor pasa al PDF con la firma.
            setVisor(nuevos?.firmado ? { doc: nuevos.firmado, firmar: false } : null);
        } catch (err) {
            setPdfFirmar(null);
            setErrorFirma(mensajeError(err, 'Se ha firmado, pero no se ha podido guardar. Vuelve a firmarlo.'));
        }
    };

    // Versión nueva hecha en su CE3X: el XML (se carga en la app), el PDF o su .cex.
    const subirDefinitivo = async (fichero) => {
        if (!fichero) return;
        setErrorDef(null); setSubiendoDef(true);
        try {
            const fd = new FormData();
            fd.append('fichero', fichero, fichero.name);
            const { data } = await axios.post(`${API}/obras/${obra.id}/cee/definitivo`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
            toast({
                xml: 'XML guardado y cargado.', pdf: 'PDF guardado: es el certificado actual.', pdf_firmado: 'PDF firmado guardado.',
                cex: 'Tu .cex está guardado aparte, como copia tuya.',
            }[data?.tipo] || 'Guardado.', 5000);
            await Promise.all([documentos.recargar({ silencioso: true }), o.cargar({ silencioso: true })]);
        } catch (err) {
            setErrorDef(mensajeError(err, 'No se ha podido subir.'));
        } finally { setSubiendoDef(false); }
    };

    // El justificante (se lee su fecha), la etiqueta u otro documento, a la carpeta del certificado.
    const subirRegistro = async (clase, fichero, nombre = '') => {
        if (!fichero) return false;
        setErrorReg(null); setSubiendoReg(clase);
        try {
            const fd = new FormData();
            fd.append('fichero', fichero, fichero.name);
            if (nombre) fd.append('nombre', nombre);
            const { data } = await axios.post(`${API}/obras/${obra.id}/documentos/${clase}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
            toast(clase === 'justificante'
                ? (data?.registro?.leida ? `Justificante guardado: registrado el ${fecha(data.registro.fecha)}.` : (data?.aviso || 'Justificante guardado.'))
                : clase === 'etiqueta' ? 'Etiqueta guardada.' : 'Documento guardado.', 5000);
            await Promise.all([documentos.recargar({ silencioso: true }), o.cargar({ silencioso: true })]);
            return true;
        } catch (err) {
            setErrorReg(mensajeError(err, 'No se ha podido subir.'));
            return false;
        } finally { setSubiendoReg(null); }
    };
    const aSubirJustificante = () => {
        setPresentar(false);
        navegar(aParte('documentos'));
        setTimeout(() => document.getElementById('registro')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
    };

    // Lo que se dio de la obra, tal como quedó al pedirla.
    const inmueble = [
        ['Referencia catastral', obra.ref_catastral],
        ['Dirección', [form?.direccion || obra.direccion, form?.codigo_postal, form?.municipio || obra.municipio, form?.provincia].filter(Boolean).join(', ')],
        ['Superficie', form?.superficie_catastro ? `${form.superficie_catastro} m²` : null],
        ['Año de construcción', form?.anio_construccion],
        ['Zona climática', obra.zona_climatica],
    ].filter(([, v]) => v != null && String(v).trim() !== '');
    const titular = [
        ['Titular', [t.nombre, t.apellidos].filter(Boolean).join(' ')],
        ['NIF', t.nif],
        ['Teléfono', t.telefono],
        ['Email', t.email],
    ].filter(([, v]) => v != null && String(v).trim() !== '');

    // LAS PARTES (Fran, 26/10/2026: «no me gusta trabajar con tanto scroll»; alternativa A):
    // una cada vez, `?parte=`. En el PC, en el menú lateral (useMenuObra); en el móvil,
    // en la barra de abajo (Resumen · Documentos · Fotos · Más).
    const nFotos = Object.values(o.slots || {}).reduce((n, l) => n + (Array.isArray(l) ? l.length : 0), 0);
    const nDocs = dd ? [dd.firmado || dd.certificado, dd.xml, dd.cex, dd.croquis].filter(Boolean).length : null;
    const hayDatos = inmueble.length > 0 || titular.length > 0 || resumen.length > 0;
    const partes = [
        { id: 'resumen', label: 'Resumen' },
        entregado && { id: 'documentos', label: 'Documentos', n: nDocs || undefined },
        { id: 'fotos', label: 'Fotos', n: nFotos || undefined },
        hayDatos && { id: 'datos', label: 'Datos de la obra' },
        eventos?.length > 0 && { id: 'historial', label: 'Historial' },
    ].filter(Boolean);
    const pedida = query.get('parte');
    const parte = partes.some(p => p.id === pedida) ? pedida : 'resumen';
    const aParte = (p) => `/obra/${obra.id}${p === 'resumen' ? '' : `?parte=${p}`}`;
    const irA = (p) => { setMas(false); navegar(aParte(p)); };
    useMenuObra({
        numero: obra.numero_expediente,
        titulo,
        items: [
            ...partes.map(p => ({ id: p.id, label: p.label, to: aParte(p.id), act: p.id === parte, n: p.n })),
            entregado && { id: 'envolvente', label: 'Envolvente', to: urlEnvolvente },
        ].filter(Boolean),
    });

    // Lo siguiente: dónde está el certificado y qué le toca (lo de «Mis obras», en grande).
    const pasos = [
        { t: 'Pedido', s: obra.pedido_at ? fecha(obra.pedido_at, true) : null, ok: true },
        est === 'EN_PREPARACION'
            ? { t: 'Lo estamos preparando', s: 'Te avisamos por WhatsApp y email', act: true }
            : { t: 'Preparado', s: obra.entregado_at ? fecha(obra.entregado_at, true) : null, ok: true },
        est === 'VALIDADO'
            ? { t: firmado ? 'Revisado y firmado' : 'Validado', s: cee?.firma?.at ? fecha(cee.firma.at, true) : null, ok: true }
            : { t: 'Revisarlo y firmarlo', s: est === 'LISTO' ? 'Ábrelo, compruébalo y fírmalo con AutoFirma' : null, act: est === 'LISTO' },
        registrado
            ? { t: 'Registrado', s: registrado.fecha ? fecha(registrado.fecha) : null, ok: true }
            : { t: 'Presentarlo en el Registro', s: 'Con el borrador de «Presentar»; luego sube el justificante', act: est === 'VALIDADO' },
    ];

    // Ya pedida: se añaden fotos (no se quitan). Archivada, nada.
    const ctx = {
        form, obra, slots: o.slots, editable: false, puedeSubir: est !== 'ARCHIVADA',
        setCampo: () => {}, setC: () => {}, setTitular: () => {}, setDecision: () => {},
        subir: o.subir, reintentar: o.reintentar, descartar: o.descartar, pendientes: o.pendientes, quitar: async () => ({ ok: false }), subiendo: o.subiendo || {}, docsError: o.docsError, recargarDocs: o.recargarDocs,
    };

    const sub = [obra.direccion && obra.direccion !== titulo ? obra.direccion : null, obra.municipio].filter(Boolean).join(' · ');
    const enMas = partes.filter(p => !['resumen', 'documentos', 'fotos'].includes(p.id));
    const tabs = [
        { id: 'resumen', label: 'Resumen', ico: <IcoCasa size={22} /> },
        entregado && { id: 'documentos', label: 'Documentos', ico: <IcoDoc size={22} /> },
        { id: 'fotos', label: 'Fotos', ico: <IcoImagen size={22} /> },
    ].filter(Boolean);

    return (
        <div className="ca-pobra">
            <header className="ca-obra-cab ca-in">
                <div>
                    <p className="ca-obra-miga"><Enlace to="/panel">Mis obras</Enlace> › <b>{obra.numero_expediente}</b></p>
                    <div className="ca-obra-tit">
                        <h1 className="ca-display">{titulo}</h1>
                        <span className={`ca-chip ${estadoDe(est).chip}`}>{estadoDe(est).label}</span>
                    </div>
                    {sub && <p className="ca-sub">{sub}</p>}
                </div>
                {entregado && parte !== 'resumen' && (
                    <div className="ca-obra-cab-acc ca-solo-menu">
                        <button type="button" className={`ca-btn ${firmado ? 'ca-btn-sec' : 'ca-btn-pri'}`} disabled={!(dd?.firmado || dd?.certificado)} onClick={verCertificado}>
                            <IcoSello /> {firmado ? 'Ver el certificado' : 'Ver y firmar'}
                        </button>
                        <button type="button" className={`ca-btn ${firmado && !registrado ? 'ca-btn-pri' : 'ca-btn-sec'}`} onClick={() => setPresentar(true)}>
                            <IcoEnviar /> Presentar
                        </button>
                    </div>
                )}
            </header>

            {parte === 'resumen' && (
            <div className="ca-obra-res">
            <div className="ca-parte">
            {/* Un encargo de BROKERGY: en qué punto lo tiene el CRM (revisión, visto bueno, registro). */}
            <EncargoBrokergy o={o} />
            <section className="ca-card ca-pad ca-in" id="obra-certificado">
                <div className="ca-filete" />
                <p className="ca-eyebrow" style={{ margin: 0 }}>El certificado</p>

                {est === 'EN_PREPARACION' && (
                    <>
                        <div className="ca-ico-tile ca-tile-naranja" style={{ marginTop: 16 }} aria-hidden="true"><IcoReloj /></div>
                        <h1 className="ca-display ca-h2" style={{ marginTop: 12 }}>Estamos preparando tu <span className="ca-mark">certificado</span></h1>
                        <p className="ca-txt">Te avisaremos por WhatsApp y email cuando esté listo. {titulo && <>Es el de <b>{titulo}</b>.</>}</p>
                        <div className="ca-btns">
                            <button type="button" className="ca-btn ca-btn-sec" onClick={() => o.cargar({ silencioso: true })}><IcoRecargar /> Ver si ya está</button>
                        </div>
                    </>
                )}

                {entregado && (
                    <>
                        <div style={{ marginTop: 14 }}><CheckDibujado /></div>
                        <h1 className="ca-display ca-h2" style={{ marginTop: 12 }}>
                            {est === 'VALIDADO' ? <>Certificado <span className="ca-mark">validado</span></> : <>Tu certificado está <span className="ca-mark">listo</span></>}
                        </h1>
                        <p className="ca-txt">{titulo}{obra.direccion && titulo !== obra.direccion ? ` · ${obra.direccion}` : ''}</p>
                        {cal && (cal.consumo || cal.emisiones) && (
                            <p className="ca-calif">
                                {cal.consumo && <span><Letra l={cal.consumo} /> en consumo</span>}
                                {cal.emisiones && <span><Letra l={cal.emisiones} /> en emisiones</span>}
                            </p>
                        )}
                        {firmado && (
                            <button type="button" className="ca-fila" onClick={verCertificado} disabled={!dd?.firmado} style={{ marginTop: 14 }}>
                                <span className="ca-ico-tile ca-tile-verde" aria-hidden="true"><IcoSello /></span>
                                <span>
                                    <b>Certificado firmado</b>
                                    <small>{cee?.firma?.at ? `Firmado el ${fecha(cee.firma.at, true)}` : 'Firmado'}{cee?.firma?.firmante ? ` por ${cee.firma.firmante}` : ''} · Ver el PDF</small>
                                </span>
                            </button>
                        )}
                        {registrado && (
                            <button type="button" className="ca-fila" onClick={aSubirJustificante} style={{ marginTop: 8 }}>
                                <span className="ca-ico-tile ca-tile-verde" aria-hidden="true"><IcoCheck /></span>
                                <span>
                                    <b>Registrado</b>
                                    <small>{registrado.fecha ? `El ${fecha(registrado.fecha)}` : 'Con su justificante'} · Ver el justificante</small>
                                </span>
                            </button>
                        )}
                        <div className="ca-btns">
                            {!firmado && (
                                <button type="button" className="ca-btn ca-btn-pri" disabled={!dd?.certificado || !!pdfFirmar} onClick={verCertificado}>
                                    {!dd && documentos.cargando ? <Spinner /> : <IcoSello />} {est === 'LISTO' ? 'Ver, validar y firmar' : 'Ver y firmar'}
                                </button>
                            )}
                            {/* Sin firmar también: el borrador dice que falta el PDF firmado. */}
                            <button type="button" className={`ca-btn ${firmado && !registrado ? 'ca-btn-pri' : 'ca-btn-sec'}`} onClick={() => setPresentar(true)}>
                                <IcoEnviar /> Presentar en el Registro
                            </button>
                            {est === 'LISTO' && (
                                <button type="button" className="ca-btn ca-btn-sec" onClick={() => { setError(null); setValidar(true); }}>Solo validar</button>
                            )}
                            <Enlace to={urlEnvolvente} className="ca-btn ca-btn-sec"><IcoPlano /> Revisar en la envolvente</Enlace>
                        </div>
                        {errorFirma && <p className="ca-error" role="alert">{errorFirma}</p>}
                    </>
                )}

                {est === 'ARCHIVADA' && <p className="ca-txt" style={{ marginTop: 12 }}>Esta obra está archivada.</p>}
            </section>

            {entregado && (
                <Aviso tono="ambar" titulo="Si cambias algo, hazlo en la envolvente" className="ca-in-2">
                    Desde la envolvente se vuelve a generar todo. Lo que cambies a mano en el .cex con CE3X no vuelve a la envolvente
                    (y se perdería si se regenera).{' '}
                    <button type="button" className="ca-link" onClick={abrirRevisar}>He tocado la envolvente: regeneradlo</button>
                </Aviso>
            )}

            <IncidenciasObra obraId={obra.id} numero={obra.numero_expediente} className="ca-stack" />
            </div>

            <aside className="ca-col-lado">
                <section className="ca-card ca-pad ca-in-2">
                    <p className="ca-eyebrow" style={{ margin: 0 }}>Lo siguiente</p>
                    <ol className="ca-sig">
                        {pasos.map(p => (
                            <li key={p.t} className={p.ok ? 'ca-sig-ok' : p.act ? 'ca-sig-act' : 'ca-sig-pend'}>
                                <i aria-hidden="true">{p.ok && <IcoCheck size={12} sw={3} />}</i>
                                <span>{p.act ? <b>{p.t}</b> : p.t}{p.s && <small>{p.s}</small>}</span>
                            </li>
                        ))}
                    </ol>
                </section>
                <div className="ca-obra-atajos">
                    {entregado && (
                        <button type="button" className="ca-fila" onClick={() => irA('documentos')}>
                            <span className="ca-ico-tile ca-tile-crema" aria-hidden="true"><IcoDoc /></span>
                            <span><b>Documentos</b><small>{nDocs == null ? 'El PDF, el XML y el .cex' : `${nDocs} ${nDocs === 1 ? 'fichero' : 'ficheros'} · subir versión nueva`}</small></span>
                            <IcoChevron />
                        </button>
                    )}
                    <button type="button" className="ca-fila" onClick={() => irA('fotos')}>
                        <span className="ca-ico-tile ca-tile-verde" aria-hidden="true"><IcoImagen /></span>
                        <span><b>Fotos</b><small>{nFotos ? `${nFotos} ${nFotos === 1 ? 'foto o documento' : 'fotos y documentos'}` : 'Lo que subiste en la visita'}</small></span>
                        <IcoChevron />
                    </button>
                    {entregado ? (
                        <Enlace to={urlEnvolvente} className="ca-fila">
                            <span className="ca-ico-tile ca-tile-crema" aria-hidden="true"><IcoPlano /></span>
                            <span><b>Envolvente</b><small>El plano, los muros y las ventanas</small></span>
                            <IcoChevron />
                        </Enlace>
                    ) : hayDatos && (
                        <button type="button" className="ca-fila" onClick={() => irA('datos')}>
                            <span className="ca-ico-tile ca-tile-crema" aria-hidden="true"><IcoCasa /></span>
                            <span><b>Datos de la obra</b><small>El inmueble, el titular y tus respuestas</small></span>
                            <IcoChevron />
                        </button>
                    )}
                </div>
            </aside>
            </div>
            )}

            {parte === 'documentos' && entregado && (
                <section className="ca-card ca-pad ca-parte ca-in" id="documentos">
                    <h2 className="ca-display ca-parte-h">Documentos</h2>
                    <p className="ca-txt ca-txt-peq" style={{ marginTop: 4 }}>Lo que hay en la carpeta del certificado. Los PDF se ven aquí mismo.</p>
                    <ListaDocumentos d={dd} cargando={documentos.cargando} error={documentos.error} recargar={documentos.recargar}
                        onVer={verDoc} puedeFirmar={!pdfFirmar}
                        subida={{ subir: subirDefinitivo, subiendo: subiendoDef, error: errorDef }}
                        registro={{ subir: subirRegistro, subiendo: subiendoReg, error: errorReg }} />
                    <div className="ca-btns">
                        <button type="button" className="ca-btn ca-btn-sec" onClick={() => setPresentar(true)}><IcoEnviar /> Ver el borrador para presentar</button>
                    </div>
                    {urlDe(enlaces?.carpeta) && (
                        <a className="ca-fila" href={urlDe(enlaces.carpeta)} target="_blank" rel="noreferrer" style={{ marginTop: 14 }}>
                            <span className="ca-ico-tile ca-tile-crema" aria-hidden="true"><IcoCarpeta /></span>
                            <span><b>Tu carpeta en Google Drive</b><small>Compartida con tu email</small></span>
                        </a>
                    )}
                    {errorFirma && <p className="ca-error" role="alert">{errorFirma}</p>}
                </section>
            )}

            {visor && (
                <VisorPdf
                    key={visor.doc.id}
                    doc={visor.doc}
                    titulo={CLASES[visor.doc.clase] || 'Documento'}
                    detalle={`${visor.doc.actual ? '' : 'Versión anterior · '}${fecha(visor.doc.fecha, true)} · ${autorTxt(visor.doc.autor, false)}`}
                    onCerrar={() => setVisor(null)}
                    pie={({ bytes, listo }) => (visor.firmar && visor.doc.clase === 'certificado' && visor.doc.actual ? (
                        <>
                            <p>{errorFirma
                                ? <span className="ca-error" role="alert">{errorFirma}</span>
                                : tactil() ? 'AutoFirma va en el ordenador: en el móvil puedes revisarlo, y fírmalo luego desde el PC con tu cuenta.'
                                    : est === 'LISTO' ? 'Al firmarlo lo das por bueno (queda validado).' : 'Se firma este mismo PDF con tu certificado, en tu ordenador.'}</p>
                            <button type="button" className="ca-btn ca-btn-pri" disabled={!listo || !!pdfFirmar} onClick={() => firmarDesdeVisor(bytes)}>
                                {pdfFirmar ? <Spinner /> : <IcoSello />} Firmar con AutoFirma
                            </button>
                        </>
                    ) : null)}
                />
            )}

            {parte === 'historial' && eventos?.length > 0 && (
                <section className="ca-card ca-pad ca-parte ca-in" id="historial">
                    <h2 className="ca-display ca-parte-h">Historial</h2>
                    <ul className="ca-hist">
                        {eventos.slice(0, 50).map(e => (
                            <li key={e.id || `${e.created_at}-${e.tipo}`}>{e.texto || e.tipo}<small title={fecha(e.created_at, true)}>{haceCuanto(e.created_at)}</small></li>
                        ))}
                    </ul>
                </section>
            )}

            {parte === 'datos' && (
                <div className="ca-parte ca-in" id="la-obra">
                    {(inmueble.length > 0 || titular.length > 0) && (
                        <section className="ca-card ca-pad">
                            <h2 className="ca-display ca-parte-h">La obra</h2>
                            <dl className="ca-dl">{[...inmueble, ...titular].map(([k, v]) => <div key={k}><dt>{k}</dt><dd className={k === 'Referencia catastral' ? 'ca-mono' : undefined}>{v}</dd></div>)}</dl>
                            <p className="ca-peq" style={{ marginTop: 12 }}>
                                Desde que se pidió el certificado, estos datos y las respuestas ya no se cambian aquí.
                                {entregado ? ' Si hay que corregir algo, cámbialo en la envolvente y pide que lo regeneremos.' : ''}
                            </p>
                        </section>
                    )}
                    {resumen.length > 0 && (
                        <section className="ca-card ca-pad" id="respuestas">
                            <h2 className="ca-display ca-parte-h">Lo que contestaste</h2>
                            <dl className="ca-dl">{resumen.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
                        </section>
                    )}
                </div>
            )}

            {parte === 'fotos' && (
                <div className="ca-parte ca-in" id="fotos">
                    <h2 className="ca-display ca-parte-h">Fotos y documentos</h2>
                    <FotosObra ctx={ctx} obraId={obra.id} soloVer />
                </div>
            )}

            {/* Las partes, abajo (móvil y tableta): Resumen · Documentos · Fotos · Más. */}
            <nav className="ca-partes-inf ca-sin-menu" aria-label="Partes de la obra">
                {tabs.map(t => (
                    <Enlace key={t.id} to={aParte(t.id)} className={`ca-parte-tab${parte === t.id ? ' ca-parte-tab-act' : ''}`} aria-current={parte === t.id ? 'page' : undefined}>
                        {t.ico}{t.label}
                    </Enlace>
                ))}
                <button type="button" className={`ca-parte-tab${enMas.some(p => p.id === parte) ? ' ca-parte-tab-act' : ''}`} onClick={() => setMas(true)} aria-haspopup="dialog">
                    <IcoMenu size={22} />Más
                </button>
            </nav>
            <Hoja abierta={mas} titulo={obra.numero_expediente || 'La obra'} onCerrar={() => setMas(false)}>
                {enMas.map(p => (
                    <button key={p.id} type="button" className="ca-fila" onClick={() => irA(p.id)}>
                        <span className="ca-ico-tile ca-tile-crema" aria-hidden="true">{p.id === 'historial' ? <IcoReloj /> : <IcoCasa />}</span>
                        <span><b>{p.label}</b><small>{p.id === 'historial' ? 'Lo que ha pasado con esta obra' : 'El inmueble, el titular y tus respuestas'}</small></span>
                        <IcoChevron />
                    </button>
                ))}
                {entregado && (
                    <Enlace to={urlEnvolvente} className="ca-fila" onClick={() => setMas(false)}>
                        <span className="ca-ico-tile ca-tile-crema" aria-hidden="true"><IcoPlano /></span>
                        <span><b>Envolvente</b><small>El plano, los muros y las ventanas</small></span>
                        <IcoChevron />
                    </Enlace>
                )}
                {urlDe(enlaces?.carpeta) && (
                    <a className="ca-fila" href={urlDe(enlaces.carpeta)} target="_blank" rel="noreferrer">
                        <span className="ca-ico-tile ca-tile-crema" aria-hidden="true"><IcoCarpeta /></span>
                        <span><b>Tu carpeta en Google Drive</b><small>Compartida con tu email</small></span>
                    </a>
                )}
            </Hoja>

            <Hoja abierta={validar} titulo="Validar el certificado" onCerrar={() => setValidar(false)}
                pie={<div className="ca-btns"><button type="button" className="ca-btn ca-btn-pri" disabled={ocupado} onClick={() => accion('validar', null, 'Certificado validado.')}>{ocupado ? <Spinner /> : <IcoSello />} Sí, lo doy por bueno</button></div>}>
                <p className="ca-txt">
                    Al validarlo nos dices que lo has revisado y que está bien. Si quieres, fírmalo aquí mismo con AutoFirma
                    («Ver, validar y firmar»); si no, lo firmas por tu cuenta. El registro lo haces tú, como siempre.
                </p>
                {error && <p className="ca-error" role="alert">{error}</p>}
            </Hoja>

            {entregado && (
                <HojaPresentar obra={obra} abierta={presentar} onCerrar={() => setPresentar(false)} onSubirJustificante={aSubirJustificante} />
            )}

            {pdfFirmar && createPortal(
                <Suspense fallback={null}>
                    <FirmarConCertificadoModal
                        pdfBase64={pdfFirmar}
                        title={`Firmar el certificado ${obra.numero_expediente || ''}`.trim()}
                        signatureAnchor={CEE_SIGN_ANCHOR}
                        // Sin el logo de BROKERGY: firma un técnico externo.
                        rubricImageUrl={null}
                        productionCity={form?.municipio || obra.municipio || ''}
                        onClose={() => setPdfFirmar(null)}
                        onSigned={alFirmar}
                    />
                </Suspense>,
                document.body,
            )}

            <Hoja abierta={revisar} titulo="Pedir que lo regeneremos" onCerrar={() => setRevisar(false)}
                pie={sinRevisiones
                    ? <div className="ca-btns"><a className="ca-btn ca-btn-pri" href={`mailto:${EMAIL_CONTACTO}?subject=${encodeURIComponent(`Regenerar ${obra.numero_expediente || 'mi certificado'}`)}`}>Escribirnos</a></div>
                    : <div className="ca-btns"><button type="button" className="ca-btn ca-btn-pri" disabled={ocupado} onClick={() => accion('revisar-de-nuevo', { nota }, 'Pedido. Te avisamos cuando esté.')}>{ocupado ? <Spinner /> : <IcoRecargar />} Pedir que lo regeneren</button></div>}>
                {sinRevisiones ? (
                    <Aviso tono="ambar" titulo="Ya has usado las regeneraciones de este certificado">
                        Cada certificado incluye un número de regeneraciones y este ya las ha gastado. Si necesitas otra,
                        escríbenos a <a href={`mailto:${EMAIL_CONTACTO}`}>{EMAIL_CONTACTO}</a> y lo vemos contigo.
                    </Aviso>
                ) : (
                    <p className="ca-txt">Si has cambiado la envolvente, lo volvemos a generar con tus cambios. No gasta otro certificado.</p>
                )}
                {!sinRevisiones && <label className="ca-campo">
                    <span className="ca-label">¿Qué has cambiado? <small>· opcional</small></span>
                    <textarea className="ca-input" rows={4} maxLength={2000} value={nota} onChange={e => setNota(e.target.value)}
                        placeholder="Por ejemplo: he corregido la orientación de la fachada trasera y añadido el garaje." />
                </label>}
                {error && <p className="ca-error" role="alert">{error}</p>}
            </Hoja>
        </div>
    );
}

export default ObraCerrada;
