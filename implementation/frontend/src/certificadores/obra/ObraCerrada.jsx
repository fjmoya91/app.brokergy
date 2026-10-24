// ─── ObraCerrada — la obra ya pedida: EN_PREPARACION, LISTO, VALIDADO ───────
// EN_PREPARACION: «estamos preparándolo» + historial (certapp_eventos).
// LISTO / VALIDADO: las descargas (`enlaces` del GET /obras/:id: pdf, cex, xml,
// croquis = descargas firmadas relativas; carpeta = su Drive, compartido con su
// email), «Revisar en la envolvente», «Validar» y «Pedir que lo regeneremos».
// AVISO (el mismo del email de entrega): lo que se cambia a mano en el .cex con
// CE3X NO vuelve a la envolvente.
// Desde que la obra deja BORRADOR, el inmueble, el titular y el cuestionario
// quedan CONGELADOS en el servidor (PUT → 409 OBRA_CERRADA): aquí solo se leen.
// `revisar-de-nuevo` tiene tope (409 SIN_REVISIONES): se dice con calma.
// Debajo del certificado, «¿Algo mal en este certificado? Avísanos» y lo que nos ha
// contado de esta obra con nuestra respuesta (incidencias/Incidencias.jsx).
import { useState } from 'react';
import axios from 'axios';
import { API, errorDe, fecha, haceCuanto, mensajeError, urlDe } from '../api';
import { EMAIL_CONTACTO } from '../marca';
import { Enlace } from '../router';
import { Aviso, Hoja, useToast } from '../ui/piezas';
import {
    CheckDibujado, IcoCarpeta, IcoDescarga, IcoDoc, IcoPlano, IcoRecargar, IcoReloj, IcoSello, Spinner,
} from '../ui/Iconos';
import { estadoDe } from './comun';
import { FotosObra } from './Fotos';
import { IncidenciasObra } from '../incidencias/Incidencias';

const DESCARGAS = [
    { k: 'pdf', label: 'Certificado', sub: 'PDF', Ico: IcoDoc },
    { k: 'cex', label: 'Archivo CE3X', sub: '.cex (3.2)', Ico: IcoDescarga },
    { k: 'xml', label: 'XML', sub: 'para el registro', Ico: IcoDescarga },
    { k: 'croquis', label: 'Croquis', sub: 'PDF', Ico: IcoPlano },
];

export function ObraCerrada({ o, resumen = [] }) {
    const { obra, form, eventos, enlaces } = o;
    const toast = useToast();
    const [validar, setValidar] = useState(false);
    const [revisar, setRevisar] = useState(false);
    const [nota, setNota] = useState('');
    const [ocupado, setOcupado] = useState(false);
    const [error, setError] = useState(null);
    const [sinRevisiones, setSinRevisiones] = useState(false);
    const est = obra.estado;
    const entregado = est === 'LISTO' || est === 'VALIDADO';
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

    const ctx = {
        form, obra, slots: o.slots, editable: false,
        setCampo: () => {}, setC: () => {}, setTitular: () => {}, setDecision: () => {},
        subir: async () => ({ ok: false }), quitar: async () => ({ ok: false }), subiendo: {}, docsError: o.docsError, recargarDocs: o.recargarDocs,
    };

    return (
        <div className="ca-col">
            <section className="ca-card ca-pad ca-in">
                <div className="ca-filete" />
                <div className="ca-fila-top">
                    <p className="ca-eyebrow" style={{ margin: 0 }}>{obra.numero_expediente}</p>
                    <span className={`ca-chip ${estadoDe(est).chip}`}>{estadoDe(est).label}</span>
                </div>

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
                        <div className="ca-descargas">
                            {DESCARGAS.map((d) => {
                                const { k, label, sub, Ico } = d;
                                const href = urlDe(enlaces?.[k]);
                                return href ? (
                                    <a key={k} className="ca-desc" href={href} target="_blank" rel="noreferrer"><Ico size={18} />{label}<small>{sub}</small></a>
                                ) : (
                                    <span key={k} className="ca-desc ca-desc-no" aria-disabled="true"><Ico size={18} />{label}<small>Aún no está</small></span>
                                );
                            })}
                        </div>
                        {urlDe(enlaces?.carpeta) && (
                            <a className="ca-fila" href={urlDe(enlaces.carpeta)} target="_blank" rel="noreferrer" style={{ marginTop: 10 }}>
                                <span className="ca-ico-tile ca-tile-crema" aria-hidden="true"><IcoCarpeta /></span>
                                <span><b>Tu carpeta en Google Drive</b><small>Compartida con tu email</small></span>
                            </a>
                        )}
                        <div className="ca-btns">
                            {est === 'LISTO' && (
                                <button type="button" className="ca-btn ca-btn-pri" onClick={() => setValidar(true)}><IcoSello /> Validar el certificado</button>
                            )}
                            <Enlace to={urlEnvolvente} className="ca-btn ca-btn-sec"><IcoPlano /> Revisar en la envolvente</Enlace>
                        </div>
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

            {eventos?.length > 0 && (
                <>
                    <h2 className="ca-sec">Historial</h2>
                    <div className="ca-card ca-pad">
                        <ul className="ca-hist">
                            {eventos.slice(0, 20).map(e => (
                                <li key={e.id || `${e.created_at}-${e.tipo}`}>{e.texto || e.tipo}<small title={fecha(e.created_at, true)}>{haceCuanto(e.created_at)}</small></li>
                            ))}
                        </ul>
                    </div>
                </>
            )}

            {(inmueble.length > 0 || titular.length > 0) && (
                <>
                    <h2 className="ca-sec">La obra</h2>
                    <div className="ca-card ca-pad">
                        <dl className="ca-dl">{[...inmueble, ...titular].map(([k, v]) => <div key={k}><dt>{k}</dt><dd className={k === 'Referencia catastral' ? 'ca-mono' : undefined}>{v}</dd></div>)}</dl>
                        <p className="ca-peq" style={{ marginTop: 12 }}>
                            Desde que se pidió el certificado, estos datos y las respuestas ya no se cambian aquí.
                            {entregado ? ' Si hay que corregir algo, cámbialo en la envolvente y pide que lo regeneremos.' : ''}
                        </p>
                    </div>
                </>
            )}

            {resumen.length > 0 && (
                <>
                    <h2 className="ca-sec">Lo que contestaste</h2>
                    <div className="ca-card ca-pad">
                        <dl className="ca-dl">{resumen.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
                    </div>
                </>
            )}

            <h2 className="ca-sec">Fotos y documentos</h2>
            <FotosObra ctx={ctx} obraId={obra.id} soloVer />

            <Hoja abierta={validar} titulo="Validar el certificado" onCerrar={() => setValidar(false)}
                pie={<div className="ca-btns"><button type="button" className="ca-btn ca-btn-pri" disabled={ocupado} onClick={() => accion('validar', null, 'Certificado validado.')}>{ocupado ? <Spinner /> : <IcoSello />} Sí, lo doy por bueno</button></div>}>
                <p className="ca-txt">Al validarlo nos dices que lo has revisado y que está bien. Lo firmas y lo registras tú, como siempre.</p>
                {error && <p className="ca-error" role="alert">{error}</p>}
            </Hoja>

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
