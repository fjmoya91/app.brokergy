// ─── Lo que el instalador HACE dentro de una obra (fase 2) ───────────────────
// Ver su presupuesto y subir otro, hacer o subir la factura, firmar el certificado
// de la instalación (CIFO), subir el RITE y las fotos y papeles. Todo con la SESIÓN,
// por `/api/instalador-app/…` (routes/instaladorApp.js): el navegador no ve ningún
// token ni ningún enlace de Drive, y los ficheros llegan por el proxy del servidor.
//
// REGLA — aquí no se rehace NADA de lo que ya hace una página pública: las tarjetas
// de firmar y de subir el RITE son las MISMAS de `/instalador/:id` (FirmarCifoCard,
// SubirRiteCard, FirmarFmDeclaracionCard), la factura es `FacturaObraView` embebida y
// las fotos son el `DocsManager` del enlace. Solo cambian sus RUTAS (`rutas`, `api`).
// Si aquí se firmara distinto que allí, un CIFO rechazado se podría volver a firmar
// por el camino que no comprueba.
//
// REGLA — cada envío va con el popup de la casa (`SendActionOverlay`, 29.b/29.d) por
// `alSubir`, y al terminar la obra y el Inicio se vuelven a pedir (`onCambio`).
import React, { useEffect, useRef, useState } from 'react';
import { SendActionOverlay } from '../../../components/SendActionOverlay';
import { FirmarCifoCard } from '../../public/components/FirmarCifoCard';
import { FirmarFmDeclaracionCard } from '../../public/components/FirmarFmDeclaracionCard';
import { SubirRiteCard } from '../../public/components/SubirRiteCard';
import { CSS_INSTALADOR, IcoChev, IcoOk, IcoPapel, IcoPluma } from '../../public/components/MarcoInstalador';
import { FacturaObraView } from '../../public/views/FacturaObraView';
import { DocsManager } from '../../docs/DocsManager';
import { API_DOCS_INSTALADOR } from '../../docs/docsApi';
import { Icono, Esqueleto, AvisoError, eur } from '../ui/piezas';
import { ElegirFotosView } from './ElegirFotosView';
import { obraDelPresupuesto } from '../logic/presupuestoApp';

const mensaje = (e, porDefecto) => e?.response?.data?.error || e?.response?.data?.message || porDefecto;

// ── El popup de envío ───────────────────────────────────────────────────────
/** `alSubir(textos)(fn)`: enseña el popup mientras `fn()` corre y su resultado al acabar. */
export function useEnvio() {
    const [st, setSt] = useState(null);
    const alSubir = (textos = {}) => async (fn) => {
        setSt({ phase: 'sending', ok: false, textos });
        try {
            const r = await fn();
            // `alAcabar(r)`: textos que dependen de la respuesta (p. ej. un pedido EN SECO).
            setSt({ phase: 'done', ok: true, textos: typeof textos.alAcabar === 'function' ? { ...textos, ...textos.alAcabar(r) } : textos });
            return r;
        } catch (e) {
            setSt({ phase: 'done', ok: false, textos, error: mensaje(e, 'No se ha podido enviar. Inténtalo en un momento.') });
            throw e;
        }
    };
    const overlay = st ? (
        <SendActionOverlay
            phase={st.phase} ok={st.ok} icon="upload"
            sendingTitle={st.textos.enviando || 'Enviando…'}
            okTitle={st.textos.ok || '¡Recibido!'}
            errorTitle={st.textos.error || 'No se ha podido enviar'}
            subtitle={st.ok ? (st.textos.subtitulo || 'Lo revisamos nosotros y, si falta algo, te avisamos.') : ''}
            items={st.ok && st.textos.items ? st.textos.items : []}
            errorText={st.error || ''}
            onClose={() => setSt(null)}
        />
    ) : null;
    return { alSubir, overlay };
}

// ── Un PDF (o una foto) pintado dentro de la app ────────────────────────────
// Nunca en otra pestaña ni con un enlace de Drive (regla 1): se piden los BYTES por
// el proxy y los pinta pdf.js. pdf.js pesa: se carga al abrir. Una foto se enseña tal cual.
const MAX_PAGINAS = 12;
export function HojasPdf({ clave, cargar, nombre = 'documento.pdf', conPie = true }) {
    const contRef = useRef(null);
    const bytesRef = useRef(null);
    const cargarRef = useRef(cargar);
    useEffect(() => { cargarRef.current = cargar; });
    const [estado, setEstado] = useState({ fase: 'cargando', paginas: 0, img: null });

    useEffect(() => {
        let vivo = true;
        let doc = null;
        let urlImg = null;
        setEstado({ fase: 'cargando', paginas: 0, img: null });
        (async () => {
            try {
                const bytes = await cargarRef.current();
                if (!vivo) return;
                bytesRef.current = bytes;
                const cab = new Uint8Array(bytes.slice(0, 5));
                const esPdf = String.fromCharCode(...cab).startsWith('%PDF');
                if (!esPdf) {
                    urlImg = URL.createObjectURL(new Blob([bytes]));
                    setEstado({ fase: 'listo', paginas: 1, img: urlImg });
                    return;
                }
                const { pdfjs } = await import('../../../certificadores/obra/pdfjsCarga');
                // pdf.js se queda (y vacía) el búfer que recibe: le va una COPIA.
                doc = await pdfjs.getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise;
                const cont = contRef.current;
                if (!vivo || !cont) return;
                cont.replaceChildren();
                const ancho = Math.max(240, (cont.clientWidth || 340));
                const dpr = Math.min(window.devicePixelRatio || 1, 2);
                const n = Math.min(doc.numPages, MAX_PAGINAS);
                for (let i = 1; i <= n; i++) {
                    const p = await doc.getPage(i);
                    if (!vivo) return;
                    const vp = p.getViewport({ scale: (ancho / p.getViewport({ scale: 1 }).width) * dpr });
                    const c = document.createElement('canvas');
                    c.width = Math.floor(vp.width);
                    c.height = Math.floor(vp.height);
                    c.setAttribute('role', 'img');
                    c.setAttribute('aria-label', `Página ${i} de ${doc.numPages}`);
                    cont.appendChild(c);
                    await p.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
                }
                if (vivo) setEstado({ fase: 'listo', paginas: doc.numPages, img: null });
            } catch {
                if (vivo) setEstado({ fase: 'error', paginas: 0, img: null });
            }
        })();
        return () => { vivo = false; doc?.destroy(); if (urlImg) URL.revokeObjectURL(urlImg); };
    }, [clave]);

    const descargar = () => {
        if (!bytesRef.current) return;
        const url = URL.createObjectURL(new Blob([bytesRef.current], { type: estado.img ? undefined : 'application/pdf' }));
        const a = document.createElement('a');
        a.href = url; a.download = nombre; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="ia-hojas">
                {estado.img && <img src={estado.img} alt={nombre} style={{ width: '100%', borderRadius: 6 }} />}
                <div ref={contRef} style={{ display: estado.img ? 'none' : 'flex', flexDirection: 'column', gap: 10 }} />
                {estado.fase === 'cargando' && <div className="ia-hojas-estado">Abriendo el documento…</div>}
                {estado.fase === 'error' && <div className="ia-hojas-estado">Ahora mismo no podemos enseñarlo. Prueba otra vez en un momento.</div>}
            </div>
            {conPie && estado.fase === 'listo' && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <span className="ia-pequeno">{estado.paginas > MAX_PAGINAS ? `Primeras ${MAX_PAGINAS} de ${estado.paginas} páginas` : estado.img ? 'Foto' : `${estado.paginas} ${estado.paginas === 1 ? 'página' : 'páginas'}`}</span>
                    <button type="button" className="ia-btn ia-btn-sec ia-btn-peq" onClick={descargar}>Descargar</button>
                </div>
            )}
        </div>
    );
}

// ── Elegir un fichero (PDF o foto) ──────────────────────────────────────────
function ZonaFichero({ file, onPick, accept = 'application/pdf,image/*', texto = 'Elegir el PDF o una foto' }) {
    const ref = useRef(null);
    return (
        <div className="ia-subir">
            <input ref={ref} type="file" accept={accept} onChange={(e) => { onPick(e.target.files?.[0] || null); e.target.value = ''; }} />
            <button type="button" className={`ia-zona${file ? ' sel' : ''}`} onClick={() => ref.current?.click()}>
                <span className="ia-baldosa"><Icono n="subir" size={22} /></span>
                <span style={{ minWidth: 0 }}>
                    {file ? <><b>{file.name}</b><span>{Math.max(1, Math.round(file.size / 1024))} KB · pulsa para cambiarlo</span></>
                        : <><b>{texto}</b><span>Desde el móvil puedes hacerle una foto</span></>}
                </span>
            </button>
        </div>
    );
}

const leerBase64 = (file) => new Promise((ok, ko) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(',')[1] || '');
    r.onerror = () => ko(new Error('No se ha podido leer el archivo.'));
    r.readAsDataURL(file);
});
const MAX_MB = 20;
const ACEPTA = /^(application\/pdf|image\/(jpeg|png|webp|heic|heif))$/i;

// ── La PROPUESTA ────────────────────────────────────────────────────────────
// La prepara y la envía BROKERGY (regla 102: lo que sale de la casa es del equipo
// interno). Aquí el instalador la VE y, si se la hemos mandado solo a él —lo normal—,
// se la PASA a su cliente con SU WhatsApp y el enlace de aceptación de siempre
// (`/firma/<uuid>`, el mismo que ya recibe en nuestro mensaje, regla 100). El enlace
// se arma aquí con el `uuid` de la obra; el PDF llega por el proxy.
const fechaCorta = (iso) => { const d = iso ? new Date(iso) : null; return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' }) : null; };
const soloDigitos = (t) => String(t || '').replace(/\D/g, '').replace(/^(0034|34)(?=\d{9}$)/, '');

export function PropuestaAccion({ obra, api, onCambio, waBrokergy }) {
    const p = obra.propuesta || { estado: 'preparando' };
    const [copiado, setCopiado] = useState(false);
    const [marcando, setMarcando] = useState(false);
    const [fallo, setFallo] = useState(false);
    const enlace = obra.uuid && typeof window !== 'undefined' ? `${window.location.origin}/firma/${obra.uuid}` : null;
    const pila = String(obra.cliente || '').trim().split(/\s+/)[0] || '';
    const texto = enlace ? [
        `Hola${pila ? ` ${pila[0].toUpperCase()}${pila.slice(1).toLowerCase()}` : ''}, te paso la propuesta de la ayuda para tu obra${obra.bono ? `: te corresponde un bono de ${eur(obra.bono)}` : ''}.`,
        '',
        'Para verla y aceptarla, pulsa aquí:',
        enlace,
        '',
        'Se abre una página donde completas tus datos y firmas la aceptación desde el móvil, en un par de minutos.',
    ].join('\n') : '';
    const tel = soloDigitos(obra.telefono);
    const wa = enlace ? `https://wa.me/${tel.length === 9 ? `34${tel}` : ''}?text=${encodeURIComponent(texto)}` : null;
    const fecha = fechaCorta(p.fecha);
    const leToca = p.estado === 'enviada' && p.la_tiene === 'instalador';

    const copiar = async () => {
        try { await navigator.clipboard.writeText(enlace); setCopiado(true); setTimeout(() => setCopiado(false), 2500); } catch { /* sin portapapeles: el enlace se ve abajo */ }
    };
    const yaPasada = async () => {
        setMarcando(true); setFallo(false);
        try { await api.propuestaPasada(obra.id); onCambio?.(); } catch { setFallo(true); } finally { setMarcando(false); }
    };

    const pdf = p.tiene_pdf ? (
        <section className="ia-card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }} aria-label="El documento de la propuesta">
            <p className="ia-eyebrow">El documento{p.version ? ` · versión ${p.version}` : ''}{fecha ? ` · ${fecha}` : ''}</p>
            <HojasPdf clave={`prop-${obra.id}-${p.version}`} nombre={`Propuesta ${obra.id}.pdf`} cargar={() => api.propuestaPdf(obra.id)} />
        </section>
    ) : null;

    if (p.estado === 'preparando') {
        const msg = encodeURIComponent(`Hola, ya he calculado la obra ${obra.id} (${obra.cliente || ''}). ¿Me mandáis la propuesta?`);
        return (
            <>
                <section className="ia-card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }} aria-labelledby="ia-prop-h">
                    <span className="ia-estado nos">La estamos preparando</span>
                    <h2 id="ia-prop-h" className="ia-toca-h" style={{ margin: 0 }}>Todavía no hay propuesta para tu cliente</h2>
                    <p className="ia-pequeno" style={{ margin: 0, fontSize: 14.5, lineHeight: 1.5 }}>
                        Con tu cálculo preparamos la propuesta y te la mandamos por WhatsApp. En cuanto esté, la verás aquí y se la podrás pasar a tu cliente.
                        {obra.bono ? <> Mientras tanto ya puedes decirle que su bono sale por <b style={{ color: 'var(--tinta)' }}>{eur(obra.bono)}</b>.</> : null}
                    </p>
                    {waBrokergy && (
                        <a className="ia-btn ia-btn-sec" href={`https://wa.me/${waBrokergy}?text=${msg}`} target="_blank" rel="noopener noreferrer">
                            <Icono n="whatsapp" size={20} /> ¿Corre prisa? Escríbenos
                        </a>
                    )}
                </section>
                {pdf}
            </>
        );
    }

    if (p.estado === 'aceptada') {
        const cuando = fechaCorta(p.aceptada_el);
        return (
            <>
                <section className="ia-card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }} aria-labelledby="ia-prop-h">
                    <span className="ia-estado ok">Aceptada{cuando ? ` · ${cuando}` : ''}</span>
                    <h2 id="ia-prop-h" className="ia-toca-h" style={{ margin: 0 }}>Tu cliente aceptó la propuesta</h2>
                    <p className="ia-pequeno" style={{ margin: 0, fontSize: 14.5, lineHeight: 1.5 }}>
                        {p.tiene_pdf ? 'Es la que firmó: con ella tramitamos la ayuda. La tienes debajo por si quieres repasarla.' : 'Con ella tramitamos la ayuda.'}
                    </p>
                </section>
                {pdf}
            </>
        );
    }

    return (
        <>
            <section className={`ia-card${leToca ? ' toca' : ''}`} style={{ display: 'flex', flexDirection: 'column', gap: 12 }} aria-labelledby="ia-prop-h">
                <span className={`ia-estado ${leToca ? 'tu' : 'nos'}`}>{leToca ? 'Te toca pasársela' : 'Enviada · esperando a tu cliente'}</span>
                <h2 id="ia-prop-h" className="ia-toca-h" style={{ margin: 0 }}>
                    {leToca ? 'Pásale la propuesta a tu cliente' : 'Tu cliente ya tiene la propuesta'}
                </h2>
                <p className="ia-pequeno" style={{ margin: 0, fontSize: 14.5, lineHeight: 1.5 }}>
                    {leToca
                        ? 'Te la mandamos a ti. Envíasela con tu WhatsApp: le llega el enlace para verla y aceptarla desde el móvil.'
                        : 'Falta que la acepte. Si le ves, recuérdaselo: puedes volver a mandarle el enlace desde aquí.'}
                </p>
                {wa && (
                    <a className={`ia-btn ${leToca ? 'ia-btn-pri' : 'ia-btn-sec'}`} href={wa} target="_blank" rel="noopener noreferrer">
                        <Icono n="whatsapp" size={22} /> {leToca ? 'Enviársela por WhatsApp' : 'Recordárselo por WhatsApp'}
                    </a>
                )}
                {enlace && (
                    <button type="button" className="ia-btn ia-btn-sec" onClick={copiar}>
                        <Icono n={copiado ? 'ok' : 'compartir'} size={20} /> {copiado ? 'Enlace copiado' : 'Copiar el enlace'}
                    </button>
                )}
                {leToca && (
                    <button type="button" className="ia-link" style={{ alignSelf: 'center', minHeight: 44 }} disabled={marcando} onClick={yaPasada}>
                        {marcando ? 'Apuntándolo…' : 'Ya se la he pasado'}
                    </button>
                )}
                {fallo && <div className="ia-aviso tu" role="alert">No hemos podido apuntarlo. Prueba otra vez en un momento.</div>}
            </section>
            {pdf}
        </>
    );
}

// ── El PRESUPUESTO ──────────────────────────────────────────────────────────
const ESTADO_PRESU = {
    subido: { texto: 'Subido', tono: 'ok' },
    estimado: { texto: 'Estimado', tono: 'tu' },
    falta: { texto: 'Falta', tono: 'tu' },
};
export function PresupuestoAccion({ obra, api, alSubir, onCambio, onHacerAqui, onAbrirHecho }) {
    const [p, setP] = useState(null);
    const [error, setError] = useState(false);
    const [n, setN] = useState(0);
    const [file, setFile] = useState(null);
    const [aviso, setAviso] = useState(null);
    const [hechos, setHechos] = useState([]);
    useEffect(() => {
        let vivo = true;
        if (!api.presupuestos || !onHacerAqui) return undefined;
        api.presupuestos().then((r) => { if (vivo) setHechos((r?.presupuestos || []).filter((x) => obraDelPresupuesto(x) === obra.id && x.estado !== 'ANULADO')); }).catch(() => {});
        return () => { vivo = false; };
    }, [api, obra.id, n]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => {
        let vivo = true;
        setError(false);
        api.presupuesto(obra.id).then((d) => { if (vivo) setP(d); }).catch(() => { if (vivo) setError(true); });
        return () => { vivo = false; };
    }, [api, obra.id, n]);

    const elegir = (f) => {
        setAviso(null);
        if (f && !ACEPTA.test(f.type)) { setAviso('Súbelo en PDF o en foto (JPG o PNG).'); return; }
        if (f && f.size > MAX_MB * 1024 * 1024) { setAviso(`El archivo es demasiado grande (máximo ${MAX_MB} MB).`); return; }
        setFile(f);
    };
    const enviar = async () => {
        if (!file) return;
        try {
            const base64 = await leerBase64(file);
            await alSubir({ enviando: 'Subiendo tu presupuesto…', ok: '¡Presupuesto recibido!', subtitulo: 'Queda guardado en la obra. El anterior no se borra: se guarda aparte.' })(
                () => api.subirPresupuesto(obra.id, { fileName: file.name, mimeType: file.type, base64 }));
            setFile(null);
            setN((x) => x + 1);
            onCambio?.();
        } catch { /* el popup ya lo cuenta */ }
    };

    if (error && !p) return <AvisoError onReintentar={() => setN((x) => x + 1)} />;
    if (!p) return <Esqueleto alto={220} n={1} />;
    const est = ESTADO_PRESU[p.estado] || ESTADO_PRESU.falta;
    const f = p.ficheros?.[0];
    return (
        <>
            <section className="ia-card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }} aria-labelledby="ia-presu-h">
                <span className={`ia-estado ${est.tono}`}>{est.texto}</span>
                <h2 id="ia-presu-h" className="ia-toca-h" style={{ margin: 0 }}>
                    {p.estado === 'subido' ? 'Tu presupuesto de esta obra' : p.estado === 'estimado' ? 'La propuesta salió con un presupuesto estimado' : 'Aún no tenemos tu presupuesto'}
                </h2>
                <p className="ia-pequeno" style={{ margin: 0, fontSize: 14.5, lineHeight: 1.5 }}>
                    {p.estado === 'subido'
                        ? <>Es el que usamos para las cuentas{p.importe ? <> ({eur(p.importe)})</> : null}. Si lo cambias, súbelo abajo.</>
                        : p.estado === 'estimado'
                            ? <>Calculamos con {p.importe ? eur(p.importe) : 'una cifra aproximada'}. Sube el que le diste a tu cliente para que las cuentas sean las de verdad.</>
                            : <>Sube el presupuesto que le diste a tu cliente: con él hacemos las cuentas y los papeles de la obra.</>}
                </p>
                {f && <HojasPdf clave={f.id} nombre={f.nombre} cargar={() => api.presupuestoPdf(obra.id, f.id)} />}
            </section>
            {onHacerAqui && (
                <section className="ia-card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }} aria-label="Hacer el presupuesto en la app">
                    <p className="ia-eyebrow">{hechos.length ? 'Hecho en la app' : '¿No lo tienes hecho?'}</p>
                    {hechos.map((h) => (
                        <button key={h.id} type="button" className="ia-fila sin-pad primera" onClick={() => onAbrirHecho?.(h)}>
                            <span className="ia-baldosa" aria-hidden="true"><Icono n="factura" size={20} /></span>
                            <span className="ia-fila-txt"><b>Presupuesto {h.numero}</b><span className="corta">{h.resumen || 'Tu presupuesto'}</span></span>
                            <span className="ia-pr-imp"><b>{eur(h.total)}</b><span>con IVA</span></span>
                        </button>
                    ))}
                    {!hechos.length && <p className="ia-pequeno" style={{ margin: 0, fontSize: 14.5, lineHeight: 1.5 }}>Hazlo aquí en un minuto, con tu plantilla: sale con los datos de esta obra y queda guardado en ella.</p>}
                    <button type="button" className="ia-btn ia-btn-sec" onClick={onHacerAqui}>
                        <Icono n="factura" size={20} /> {hechos.length ? 'Hacer otro aquí' : 'Hacerlo aquí'}
                    </button>
                </section>
            )}
            <section className="ia-card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }} aria-label="Subir el presupuesto">
                <p className="ia-eyebrow">{f ? 'Cambiar el presupuesto' : 'Subir el presupuesto'}</p>
                <ZonaFichero file={file} onPick={elegir} />
                {aviso && <div className="ia-aviso tu" role="alert">{aviso}</div>}
                <button type="button" className="ia-btn ia-btn-pri" disabled={!file} onClick={enviar} style={file ? undefined : { opacity: 0.55 }}>
                    <Icono n="subir" size={22} /> {f ? 'Subir el nuevo' : 'Subir el presupuesto'}
                </button>
            </section>
        </>
    );
}

// ── La FACTURA ──────────────────────────────────────────────────────────────
export function FacturaAccion({ obra, api, alSubir, onCambio }) {
    const facturas = obra.facturas || [];
    const puede = !!obra.es_instaladora;
    const conPlantilla = obra.factura_modo === 'plantilla';
    // Con su plantilla, lo normal es HACERLA aquí (la misma pantalla que le llega por
    // email); si ya la tiene hecha en su programa, subirla está a un toque.
    const [subirla, setSubirla] = useState(false);
    const modo = conPlantilla && !subirla ? 'plantilla' : 'subir';
    const [ver, setVer] = useState(null);
    const [otra, setOtra] = useState(false);
    const [file, setFile] = useState(null);
    const [aviso, setAviso] = useState(null);

    const elegir = (f) => {
        setAviso(null);
        if (f && !ACEPTA.test(f.type)) { setAviso('Súbela en PDF o en foto (JPG o PNG).'); return; }
        if (f && f.size > MAX_MB * 1024 * 1024) { setAviso(`El archivo es demasiado grande (máximo ${MAX_MB} MB).`); return; }
        setFile(f);
    };
    const subir = async () => {
        if (!file) return;
        try {
            await alSubir({ enviando: 'Subiendo tu factura…', ok: '¡Factura recibida!', subtitulo: 'La revisamos nosotros y, si falta algo, te avisamos.' })(
                () => api.subirFactura(obra.id, file));
            setFile(null);
            setOtra(false);
            setSubirla(false);
            onCambio?.();
        } catch { /* el popup ya lo cuenta */ }
    };
    const hacer = !facturas.length || otra;
    const { onHecha: alHacerla, ...propsFactura } = api.facturaProps(obra.id);

    return (
        <>
            {facturas.length > 0 && (
                <section className="ia-card lista" aria-labelledby="ia-facs-h">
                    <p id="ia-facs-h" className="ia-eyebrow" style={{ padding: '0 12px 6px' }}>{facturas.length === 1 ? 'Tu factura' : 'Tus facturas'}</p>
                    {facturas.map((f, i) => (
                        <div key={f.ref} style={{ borderTop: i ? '1px solid var(--linea)' : 0 }}>
                            <div className="ia-fila" style={{ cursor: 'default', borderTop: 0 }}>
                                <span className={`ia-baldosa c ${f.revisada ? 'ok' : 'nos'}`}><Icono n={f.revisada ? 'ok' : 'reloj'} size={20} /></span>
                                <span className="ia-fila-txt">
                                    <b>{f.numero ? `Factura ${f.numero}` : 'Factura'}{f.total ? ` · ${eur(f.total)}` : ''}</b>
                                    <span>{f.revisada ? 'Revisada' : 'Subida · la estamos revisando'}{f.fecha ? ` · ${new Date(f.fecha).toLocaleDateString('es-ES')}` : ''}</span>
                                </span>
                                <button type="button" className="ia-btn ia-btn-sec ia-btn-peq" aria-expanded={ver === f.ref}
                                    onClick={() => setVer(ver === f.ref ? null : f.ref)}>{ver === f.ref ? 'Cerrar' : 'Ver'}</button>
                            </div>
                            {ver === f.ref && (
                                <div style={{ padding: '0 12px 14px' }}>
                                    <HojasPdf clave={f.ref} nombre={`Factura ${f.numero || ''}.pdf`.trim()} cargar={() => api.facturaFichero(obra.id, f.ref)} />
                                </div>
                            )}
                        </div>
                    ))}
                </section>
            )}

            {!puede ? (
                <div className="ia-aviso">La factura de esta obra la hace la empresa que la instala. Aquí puedes verla cuando esté.</div>
            ) : !hacer ? (
                <button type="button" className="ia-btn ia-btn-sec" onClick={() => setOtra(true)}>
                    <Icono n="factura" size={20} /> {conPlantilla ? 'Hacer otra que la sustituya' : 'Subir otra que la sustituya'}
                </button>
            ) : modo === 'plantilla' ? (
                <section aria-label="Hacer la factura" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <FacturaObraView embebida {...propsFactura}
                        alEnviar={alSubir({ enviando: 'Guardando tu factura…', ok: '¡Factura hecha!', subtitulo: 'La tenemos en la obra. La revisamos nosotros y, si falta algo, te avisamos.' })}
                        onHecha={(r) => { alHacerla?.(r); setOtra(false); onCambio?.(); }} />
                    <button type="button" className="ia-link" onClick={() => setSubirla(true)} style={{ alignSelf: 'center' }}>
                        ¿Ya la tienes hecha en tu programa? Súbela
                    </button>
                </section>
            ) : (
                <section className="ia-card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }} aria-label="Subir la factura">
                    <p className="ia-eyebrow n">Subir la factura</p>
                    <p className="ia-pequeno" style={{ margin: 0, fontSize: 14.5, lineHeight: 1.5 }}>
                        La de esta obra, a nombre de tu cliente. Vale el PDF o una foto en la que se lea bien.
                    </p>
                    <ZonaFichero file={file} onPick={elegir} />
                    {aviso && <div className="ia-aviso tu" role="alert">{aviso}</div>}
                    <button type="button" className="ia-btn ia-btn-pri" disabled={!file} onClick={subir} style={file ? undefined : { opacity: 0.55 }}>
                        <Icono n="subir" size={22} /> Subir la factura
                    </button>
                    {subirla && <button type="button" className="ia-link" onClick={() => { setSubirla(false); setFile(null); setAviso(null); }} style={{ alignSelf: 'center' }}>Mejor la hago aquí</button>}
                    {otra && !subirla && <button type="button" className="ia-link" onClick={() => setOtra(false)} style={{ alignSelf: 'center' }}>Dejarlo como está</button>}
                </section>
            )}
        </>
    );
}

// ── El CERTIFICADO de la instalación, el RITE y la declaración del FM ───────
// Lo que pinta `/instalador/:id` (sus tareas, la re-firma, el rechazo y el bloqueo)
// sale de SU ruta: aquí solo se ordena igual y se usan sus mismas tarjetas.
const TAREAS = {
    cifo: { titulo: 'Firmar el certificado de la instalación', resumen: 'Se firma aquí mismo con tu certificado electrónico.', hecho: 'Certificado de la instalación: firmado y recibido', Ico: IcoPluma },
    rite: { titulo: 'Subir la legalización RITE', resumen: 'Sube el certificado tramitado (y la memoria firmada).', hecho: 'Legalización RITE: recibida', Ico: IcoPapel },
    fm_decl: { titulo: 'Firmar la declaración de la tipología', resumen: 'La pide la ficha del factor multiplicador. Se firma aquí mismo.', hecho: 'Declaración de la tipología: firmada y recibida', Ico: IcoPluma },
};
const NUM = ['una', 'dos', 'tres'];

export function TramitesAccion({ obra, api, alSubir, onCambio, foco }) {
    const [info, setInfo] = useState(null);
    const [error, setError] = useState(false);
    const [n, setN] = useState(0);
    const [abierta, setAbierta] = useState(foco || null);
    useEffect(() => {
        let vivo = true;
        setError(false);
        api.instalador(obra.id).then((d) => {
            if (!vivo) return;
            setInfo(d);
            const pend = (d?.tareas || []).filter((t) => !t.hecho);
            setAbierta((prev) => (prev && pend.some((t) => t.key === prev) ? prev : (pend[0]?.key || null)));
        }).catch(() => { if (vivo) setError(true); });
        return () => { vivo = false; };
    }, [api, obra.id, n]);

    const hecho = () => { setN((x) => x + 1); onCambio?.(); };
    if (error && !info) return <AvisoError onReintentar={() => setN((x) => x + 1)} />;
    if (!info) return <Esqueleto alto={200} n={2} />;

    const tareas = (info.tareas || []).filter((t) => TAREAS[t.key]);
    const pendientes = tareas.filter((t) => !t.hecho);
    const hechas = tareas.filter((t) => t.hecho);
    const textos = (k) => ({
        cifo: { enviando: 'Enviando el certificado firmado…', ok: '¡Certificado recibido!' },
        rite: { enviando: 'Subiendo la legalización RITE…', ok: '¡RITE recibido!' },
        fm_decl: { enviando: 'Enviando la declaración firmada…', ok: '¡Declaración recibida!' },
    }[k]);

    return (
        <div className="in ia-in">
            <style>{CSS_INSTALADOR}</style>
            {!tareas.length && <div className="ia-aviso">Ahora mismo no hay nada pendiente por tu parte. Cuando el certificado esté preparado, te avisamos.</div>}
            {tareas.length > 0 && !pendientes.length && (
                <div className="ia-aviso" style={{ marginBottom: 12 }}><b style={{ color: 'var(--verde-txt)' }}>Todo recibido.</b> Tenemos lo tuyo de esta obra: seguimos nosotros con la tramitación.</div>
            )}
            {pendientes.length > 0 && (
                <p className="ia-pequeno" style={{ margin: '0 2px 12px', fontSize: 14.5 }}>
                    {pendientes.length > 1 ? `Te quedan ${NUM[pendientes.length - 1] || pendientes.length} cosas` : 'Te queda una cosa'} en esta obra, y se hace aquí mismo.
                </p>
            )}
            <div className="in-stack">
                {pendientes.map((t, i) => {
                    const meta = TAREAS[t.key];
                    const open = abierta === t.key;
                    const rutas = api.rutas(obra.id, t.key);
                    const alS = alSubir(textos(t.key));
                    return (
                        <div key={t.key} className={`in-card in-tarea ${open ? 'in-tarea-abierta' : ''}`}>
                            {open && <div className="in-filete-fino" />}
                            <button type="button" className="in-tarea-cab" aria-expanded={open} onClick={() => setAbierta(open ? null : t.key)}>
                                <span className="in-ico-tile"><meta.Ico /></span>
                                <span className="in-tarea-cuerpo">
                                    <span className="in-tarea-n">{pendientes.length > 1 ? `Tarea ${i + 1} de ${pendientes.length}` : 'Pendiente'}</span>
                                    <span className="in-tarea-t">{t.refirma ? 'Firmar de nuevo el certificado de la instalación' : meta.titulo}</span>
                                    <span className="in-tarea-r">{t.bloqueado ? 'Lo estamos corrigiendo: de momento no tienes que hacer nada.' : (t.aviso || meta.resumen)}</span>
                                </span>
                                <span className="in-chev"><IcoChev size={20} /></span>
                            </button>
                            {open && (
                                <div className="in-tarea-dentro">
                                    {t.key === 'cifo'
                                        ? <FirmarCifoCard expedienteId={obra.id} info={{ ...info, bloqueado: t.bloqueado, rechazo: t.rechazo, refirma: t.refirma }} onDone={hecho} rutas={rutas} alSubir={alS} />
                                        : t.key === 'fm_decl'
                                            ? <FirmarFmDeclaracionCard expedienteId={obra.id} info={info} onDone={hecho} rutas={rutas} alSubir={alS} />
                                            : <SubirRiteCard expedienteId={obra.id} info={t} onDone={hecho} pideMemoria={!!t.pide_memoria} rutas={rutas} alSubir={alS} />}
                                </div>
                            )}
                        </div>
                    );
                })}
                {hechas.map((t) => (
                    <div key={t.key} className="in-hecha">
                        <span className="in-ico-tile"><IcoOk size={18} /></span>
                        {TAREAS[t.key].hecho}
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── Las FOTOS y los PAPELES ─────────────────────────────────────────────────
// El gestor del enlace de siempre, en claro (`.theme-light`), con las rutas de la
// sesión (API_DOCS_INSTALADOR: sin token en el navegador y sin enlaces de Drive) y en
// la fase del instalador (el DESPUÉS). Lo que falta, arriba. No valida ni rechaza:
// `canValidate` es del equipo interno.
// Fase 3: si su empresa es la INSTALADORA, debajo puede elegir qué fotos de ESTA obra
// enseñar en su página web (ElegirFotosView filtrado a la obra; van «en revisión»).
export function DocsAccion({ obra, api, alSubir, onMiPagina }) {
    const [res, setRes] = useState(null);
    const [eligiendo, setEligiendo] = useState(false);
    const faltan = res ? Math.max(0, res.obligatorias - res.obligatoriasHechas) : null;
    const puedeEnsenar = !!(obra.es_instaladora && api.escaparateObras && alSubir);
    if (eligiendo) {
        return <ElegirFotosView api={api} obra={obra.id} alSubir={alSubir} volverTexto="Fotos y papeles" incrustado
            onVolver={() => setEligiendo(false)} onHecho={() => { setEligiendo(false); onMiPagina?.(); }} />;
    }
    return (
        <>
            {res && (
                <div className={`ia-aviso${faltan || res.rechazadas ? ' tu' : ''}`} role="status">
                    {faltan
                        ? <><b>Te {faltan === 1 ? 'falta 1 cosa imprescindible' : `faltan ${faltan} cosas imprescindibles`}</b> de {res.obligatorias}. Están marcadas abajo.</>
                        : res.rechazadas
                            ? <><b>{res.rechazadas === 1 ? 'Hay 1 foto' : `Hay ${res.rechazadas} fotos`} que hay que repetir.</b> Te decimos abajo por qué.</>
                            : <><b>Tienes todo lo imprescindible.</b> Si quieres, puedes añadir más.</>}
                </div>
            )}
            <div className="ia-docs">
                <div className="theme-light">
                    <DocsManager mode="token" idOrUuid={obra.id} rol="instalador" api={api.docs || API_DOCS_INSTALADOR}
                        embedded compacto onResumen={setRes} />
                </div>
            </div>
            {puedeEnsenar && (
                <section className="ia-card ia-docs-web" aria-label="Tu página web">
                    <p className="ia-eyebrow">Tu página web</p>
                    <p>¿Alguna de estas fotos te sirve para enseñar tu trabajo? Elígela y la miramos antes de publicarla. Solo sale el pueblo.</p>
                    <button type="button" className="ia-btn ia-btn-sec" onClick={() => setEligiendo(true)}>
                        <Icono n="web" size={20} /> Enseñar fotos en mi página
                    </button>
                </section>
            )}
        </>
    );
}
