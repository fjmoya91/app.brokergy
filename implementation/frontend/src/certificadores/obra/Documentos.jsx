// ─── Documentos — lo que hay en «1. CEE» de la obra, con su visor de PDF ────
// Fran (26/10/2026): «un apartado para ver los documentos, un visor de PDF para
// ver el certificado, y que el mismo visor ya me permita darle a firmar… y subir
// el .cex nuevo o la última versión… para el certificador e incluso nosotros
// como admin». Lo usan ObraCerrada (el certificador) y ObraAdmin (BROKERGY).
//
//   · useDocumentos   (documentosComun.js) GET …/obras/:id/documentos
//                     (services/certapp/documentos.js): lo actual de cada clase,
//                     las versiones anteriores y los .cex del certificador en
//                     cuarentena, con descargas firmadas.
//   · ListaDocumentos el apartado: certificado (firmado o no), XML, .cex, croquis,
//                     «Subir versión nueva», sus .cex y «Versiones anteriores».
//   · VisorPdf        pantalla completa con pdf.js (páginas, zoom, descargar) y un
//                     pie que pone quien lo abre: el «Firmar con AutoFirma».
//
// REGLA — el PDF se pinta AQUÍ, nunca abriendo la descarga en otra pestaña: /fichero
// sale con `CSP: sandbox` (services/certapp/tipos.js) y Chrome no deja pintar un PDF
// así (ERR_BLOCKED_BY_CLIENT, la 2026EXT_1). El visor pide los BYTES y pdf.js los
// pinta; los botones de «Descargar» llevan `download`.
// pdf.js pesa: se carga al abrir el visor, como el modal de firma.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { fecha, mensajeError, urlDe } from '../api';
import { Aviso, ErrorRed, Esqueleto } from '../ui/piezas';
import {
    IcoAbajo, IcoCarpeta, IcoDescarga, IcoDoc, IcoMas, IcoMenos, IcoPlano, IcoSello, IcoSubir, IcoX, Spinner,
} from '../ui/Iconos';
import { CLASES, autorTxt } from './documentosComun';

const pesoTxt = (b) => (b == null ? '' : b >= 1048576 ? `${(b / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/* ── Una fila ─────────────────────────────────────────────────────────────── */
function FilaDoc({ ico, tile = 'ca-tile-crema', titulo, detalle, chip, children }) {
    return (
        <li className="ca-doc">
            <span className={`ca-ico-tile ${tile}`} aria-hidden="true">{ico}</span>
            <span className="ca-doc-txt">
                <b>{titulo}</b>
                {detalle && <small>{detalle}</small>}
                {chip && <span className="ca-doc-chip">{chip}</span>}
            </span>
            <span className="ca-doc-acc">{children}</span>
        </li>
    );
}

const Descargar = ({ doc, etiqueta = 'Descargar', sec = true }) => (
    <a className={`ca-btn ${sec ? 'ca-btn-sec' : 'ca-btn-pri'}`} href={urlDe(doc.url)} download={doc.nombre} aria-label={`Descargar ${doc.nombre}`}>
        <IcoDescarga size={16} /> {etiqueta}
    </a>
);
const EnDrive = ({ doc }) => (doc.drive ? (
    <a className="ca-icobtn" href={doc.drive} target="_blank" rel="noreferrer" title="Abrir en Drive (solo ADMIN)" aria-label="Abrir en Drive"><IcoCarpeta size={16} /></a>
) : null);

/**
 * El apartado «Documentos».
 * @param {object}   d         lo que devuelve useDocumentos
 * @param {(doc, opciones?) => void} onVer   abre el visor (`{ firmar: true }` en el certificado sin firmar)
 * @param {boolean}  admin
 * @param {boolean}  puedeFirmar  el certificador, con la obra entregada
 * @param {object}   [subida]  `{ subir(fichero), subiendo, error }` (solo el certificador)
 */
export function ListaDocumentos({ d, cargando, error, recargar, onVer, admin = false, puedeFirmar = false, subida = null }) {
    const [verOld, setVerOld] = useState(false);
    const input = useRef(null);
    if (cargando && !d) return <Esqueleto alto={68} n={3} />;
    if (error && !d) return <ErrorRed error={error} onReintentar={() => recargar()} titulo="No hemos podido leer los documentos" compacto />;
    if (!d) return null;

    const { certificado, firmado, xml, cex, croquis, anteriores = [], cuarentena = [], firma, firma_anterior: firmaAnterior, xml_resumen: xr } = d;
    const quien = (doc) => `${fecha(doc.fecha, true)} · ${autorTxt(doc.autor, admin)}`;

    return (
        <div>
            {!d.hay && <p className="ca-txt ca-txt-peq" style={{ marginTop: 10 }}>Todavía no hay documentos en la carpeta del certificado.</p>}
            <ul className="ca-docs">
                {(firmado || certificado) && (
                    <FilaDoc
                        ico={firmado ? <IcoSello /> : <IcoDoc />}
                        tile={firmado ? 'ca-tile-verde' : 'ca-tile-naranja'}
                        titulo="Certificado energético"
                        detalle={firmado
                            ? `Firmado${firma?.firmante ? ` por ${firma.firmante}` : ''} el ${fecha(firma?.at || firmado.fecha, true)}${admin && firma?.coincide === false ? ' · ⚠ no parece el certificador' : ''}`
                            : `Sin firmar · versión del ${fecha(certificado.fecha, true)}`}
                        chip={firmado
                            ? <span className="ca-chip ca-chip-verde">Firmado</span>
                            : <span className="ca-chip ca-chip-naranja">{firmaAnterior ? 'Nuevo: firmaste una versión anterior' : 'Sin firmar'}</span>}
                    >
                        {!firmado && puedeFirmar
                            ? <button type="button" className="ca-btn ca-btn-pri" onClick={() => onVer(certificado, { firmar: true })}><IcoSello size={16} /> Ver y firmar</button>
                            : <button type="button" className="ca-btn ca-btn-sec" onClick={() => onVer(firmado || certificado)}>Ver</button>}
                        <EnDrive doc={firmado || certificado} />
                    </FilaDoc>
                )}
                {firmado && certificado && (
                    <li style={{ margin: '-2px 0 0 4px' }}>
                        <button type="button" className="ca-link ca-txt-peq" onClick={() => onVer(certificado)}>Ver el original sin firmar ({fecha(certificado.fecha, true)})</button>
                    </li>
                )}
                {xml && (
                    <FilaDoc ico={<IcoDoc />} titulo={CLASES.xml}
                        detalle={[xr && (xr.consumo || xr.emisiones) ? `${xr.consumo || '—'} en consumo · ${xr.emisiones || '—'} en emisiones` : null,
                            xr?.consumo_kwh_m2 != null ? `${String(xr.consumo_kwh_m2).replace('.', ',')} kWh/m²·año` : null,
                            quien(xml)].filter(Boolean).join(' · ')}>
                        <Descargar doc={xml} /><EnDrive doc={xml} />
                    </FilaDoc>
                )}
                {cex && (
                    <FilaDoc ico={<IcoDescarga />} titulo={CLASES.cex} detalle={`Para abrirlo en CE3X 3.2 · ${quien(cex)}`}>
                        <Descargar doc={cex} /><EnDrive doc={cex} />
                    </FilaDoc>
                )}
                {croquis && (
                    <FilaDoc ico={<IcoPlano />} titulo={CLASES.croquis} detalle={quien(croquis)}>
                        <button type="button" className="ca-btn ca-btn-sec" onClick={() => onVer(croquis)}>Ver</button><EnDrive doc={croquis} />
                    </FilaDoc>
                )}
            </ul>

            {subida && (
                <div style={{ marginTop: 18 }}>
                    <p className="ca-docs-sub">¿Lo has terminado en tu CE3X?</p>
                    <p className="ca-txt ca-txt-peq" style={{ margin: '6px 0 0' }}>
                        Sube el <b>XML</b> o el <b>PDF</b> (firmado o no): pasa a ser el actual y lo anterior queda en «Versiones anteriores».
                        Tu <b>.cex</b> se guarda aparte, como copia tuya: no lo abrimos ni sustituye al nuestro.
                    </p>
                    <input ref={input} type="file" hidden accept=".xml,.pdf,.cex,application/pdf,text/xml,application/xml"
                        onChange={(e) => { subida.subir(e.target.files?.[0]); e.target.value = ''; }} />
                    <div className="ca-btns">
                        <button type="button" className="ca-btn ca-btn-sec" disabled={subida.subiendo} onClick={() => input.current?.click()}>
                            {subida.subiendo ? <Spinner /> : <IcoSubir />} {subida.subiendo ? 'Subiendo…' : 'Subir versión nueva'}
                        </button>
                    </div>
                    {subida.error && <p className="ca-error" role="alert">{subida.error}</p>}
                </div>
            )}

            {cuarentena.length > 0 && (
                <>
                    <p className="ca-docs-sub">{admin ? '.cex que ha subido el certificador' : 'Tus .cex guardados'}</p>
                    {admin && (
                        <Aviso tono="ambar" titulo="No abrir con CE3X sin revisarlo" className="ca-stack">
                            Vienen de fuera: un .cex ejecuta lo que lleva al abrirlo. Se guardan como copia del certificador y nada de la app los abre.
                        </Aviso>
                    )}
                    <ul className="ca-docs ca-docs-old">
                        {cuarentena.map(doc => (
                            <FilaDoc key={doc.id} ico={<IcoDescarga />} titulo={doc.nombre} detalle={`${fecha(doc.fecha, true)} · ${pesoTxt(doc.bytes)}`}>
                                <Descargar doc={doc} /><EnDrive doc={doc} />
                            </FilaDoc>
                        ))}
                    </ul>
                </>
            )}

            {anteriores.length > 0 && (
                <>
                    <button type="button" className="ca-docs-mas" aria-expanded={verOld} onClick={() => setVerOld(v => !v)}>
                        {verOld ? <IcoMenos size={14} /> : <IcoMas size={14} />} Versiones anteriores ({anteriores.length})
                    </button>
                    {verOld && (
                        <ul className="ca-docs ca-docs-old">
                            {anteriores.map(doc => (
                                <FilaDoc key={doc.id} ico={doc.clase === 'firmado' ? <IcoSello /> : <IcoDoc />} titulo={CLASES[doc.clase] || doc.nombre}
                                    detalle={`${quien(doc)}${admin ? ` · ${doc.nombre}` : ''}`}>
                                    {doc.pdf
                                        ? <button type="button" className="ca-btn ca-btn-sec" onClick={() => onVer(doc)}>Ver</button>
                                        : <Descargar doc={doc} />}
                                    <EnDrive doc={doc} />
                                </FilaDoc>
                            ))}
                        </ul>
                    )}
                </>
            )}
        </div>
    );
}

/* ── El visor ─────────────────────────────────────────────────────────────── */
async function cargarPdfjs() {
    const [pdfjs, trabajador] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
    pdfjs.GlobalWorkerOptions.workerSrc = trabajador.default;
    return pdfjs;
}

const ZOOMS = [0.75, 1, 1.25, 1.5, 2, 3];

/**
 * El PDF a pantalla completa. Portaleado a <body> (regla 29.b). Quien lo abre le
 * pone : otro documento es otro visor (sin restos del anterior).
 * @param {object}   doc      { nombre, url, fecha, autor }
 * @param {string}   titulo
 * @param {string}   [detalle]
 * @param {(ctx: { bytes: ArrayBuffer|null, listo: boolean }) => any} [pie]  los botones de abajo
 */
export function VisorPdf({ doc, titulo, detalle, onCerrar, pie }) {
    const [estado, setEstado] = useState({ cargando: true, error: null });
    const [paginas, setPaginas] = useState(0);
    const [zoom, setZoom] = useState(1);
    const [ancho, setAncho] = useState(0);
    const [bytes, setBytes] = useState(null);   // la ORIGINAL: la que se firma o se descarga
    const pdfRef = useRef(null);
    const cuerpoRef = useRef(null);
    const lienzos = useRef([]);
    const cerrarRef = useRef(onCerrar);
    useEffect(() => { cerrarRef.current = onCerrar; });

    // Teclado y scroll del fondo.
    useEffect(() => {
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const alTeclado = (e) => { if (e.key === 'Escape') cerrarRef.current?.(); };
        document.addEventListener('keydown', alTeclado);
        return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', alTeclado); };
    }, []);

    // El ancho disponible (y al girar el móvil).
    useEffect(() => {
        const el = cuerpoRef.current;
        if (!el) return undefined;
        const medir = () => setAncho(el.clientWidth);
        medir();
        const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(medir) : null;
        ro?.observe(el);
        return () => ro?.disconnect();
    }, []);

    // Los bytes (con la descarga firmada) y el documento de pdf.js.
    useEffect(() => {
        let vivo = true;
        (async () => {
            try {
                const { data } = await axios.get(urlDe(doc.url), { responseType: 'arraybuffer' });
                if (!vivo) return;
                setBytes(data);
                const pdfjs = await cargarPdfjs();
                // pdf.js se queda (y vacía) el búfer que recibe: le va una COPIA, la
                // original es la que se firma o se descarga.
                const pdf = await pdfjs.getDocument({ data: new Uint8Array(data.slice(0)) }).promise;
                if (!vivo) { pdf.destroy(); return; }
                pdfRef.current = pdf;
                setPaginas(pdf.numPages);
                setEstado({ cargando: false, error: null });
            } catch (err) {
                if (vivo) setEstado({ cargando: false, error: mensajeError(err, 'No se ha podido abrir el PDF.') });
            }
        })();
        return () => { vivo = false; pdfRef.current?.destroy(); pdfRef.current = null; };
    }, [doc.url]);

    // Pintar las páginas: al ancho del visor (hasta 900 px) por el zoom, nítido en retina.
    useEffect(() => {
        const pdf = pdfRef.current;
        if (!pdf || !paginas || !ancho) return undefined;
        let vivo = true;
        const tareas = [];
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        (async () => {
            for (let i = 1; i <= paginas && vivo; i++) {
                const pagina = await pdf.getPage(i);
                const canvas = lienzos.current[i - 1];
                if (!vivo || !canvas) return;
                const base = pagina.getViewport({ scale: 1 });
                const escala = (Math.min(ancho - 20, 900) / base.width) * zoom;
                const vp = pagina.getViewport({ scale: escala * dpr });
                canvas.width = Math.floor(vp.width);
                canvas.height = Math.floor(vp.height);
                canvas.style.width = `${Math.floor(vp.width / dpr)}px`;
                canvas.style.height = `${Math.floor(vp.height / dpr)}px`;
                const t = pagina.render({ canvasContext: canvas.getContext('2d'), viewport: vp });
                tareas.push(t);
                try { await t.promise; } catch { /* cancelado al cambiar el zoom */ }
            }
        })();
        return () => { vivo = false; tareas.forEach(t => t.cancel()); };
    }, [paginas, ancho, zoom]);

    const descargar = useCallback(() => {
        if (!bytes) return;
        const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
        const a = document.createElement('a');
        a.href = url; a.download = doc.nombre || 'documento.pdf'; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
    }, [bytes, doc.nombre]);

    const iZoom = ZOOMS.indexOf(zoom);
    return createPortal(
        <div className="ca-visor" role="dialog" aria-modal="true" aria-label={titulo}>
            <div className="ca-visor-cab">
                <span className="ca-doc-txt">
                    <b>{titulo}</b>
                    <small>{detalle || doc.nombre}</small>
                </span>
                <span className="ca-visor-zoom">
                    <button type="button" className="ca-icobtn" disabled={iZoom <= 0} onClick={() => setZoom(ZOOMS[iZoom - 1])} aria-label="Alejar"><IcoMenos size={16} /></button>
                    <span>{Math.round(zoom * 100)} %</span>
                    <button type="button" className="ca-icobtn" disabled={iZoom >= ZOOMS.length - 1} onClick={() => setZoom(ZOOMS[iZoom + 1])} aria-label="Acercar"><IcoMas size={16} /></button>
                </span>
                <button type="button" className="ca-icobtn" onClick={onCerrar} aria-label="Cerrar el visor"><IcoX /></button>
            </div>
            <div className="ca-visor-cuerpo" ref={cuerpoRef}>
                {estado.cargando && <div className="ca-visor-estado"><Spinner size={26} /><span>Abriendo el PDF…</span></div>}
                {estado.error && (
                    <div className="ca-visor-estado">
                        <span>{estado.error}</span>
                        <a className="ca-btn ca-btn-sec" href={urlDe(doc.url)} download={doc.nombre}><IcoAbajo size={16} /> Descargarlo</a>
                    </div>
                )}
                {Array.from({ length: paginas }, (_, i) => (
                    <canvas key={i} ref={el => { lienzos.current[i] = el; }} aria-label={`Página ${i + 1} de ${paginas}`} />
                ))}
            </div>
            <div className="ca-visor-pie">
                {pie?.({ bytes, listo: !estado.cargando && !estado.error })}
                <button type="button" className="ca-btn ca-btn-sec" disabled={estado.cargando || !!estado.error} onClick={descargar}><IcoDescarga size={16} /> Descargar</button>
            </div>
        </div>,
        document.body,
    );
}
