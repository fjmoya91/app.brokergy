// ─── VisorPdf — el PDF a pantalla completa, dentro de la app ────────────────
// Fran (26/10/2026, viendo el certificado de la 2026EXT_1): «no veo que el visor
// sea excesivamente profesional; falta, por ejemplo, el buscador de páginas».
// Va sobre el visor de pdf.js (`pdfjs-dist/web/pdf_viewer.mjs`, el de Firefox):
//   · ir a página (◀ n / N ▶, y escribir el número), miniaturas a la izquierda
//     en el PC;
//   · zoom: automático, ajustar al ancho, página entera, o de 50 a 300 %;
//   · BUSCAR en el texto (Ctrl+F), con las coincidencias resaltadas y ↑ ↓;
//   · el texto se puede seleccionar y copiar (capa de texto);
//   · teclado: ← → páginas, Ctrl + / − zoom, Esc cierra la búsqueda y luego el visor.
// Quien lo abre pone el pie (el «Firmar con AutoFirma») y le da `key={doc.id}`:
// otro documento es otro visor, sin restos del anterior.
//
// REGLA — el PDF se pinta AQUÍ, nunca abriendo la descarga en otra pestaña (ver
// obra/Documentos.jsx): se piden los BYTES con axios y los pinta pdf.js.
// pdf.js pesa: se carga al abrir el visor. `pdf_viewer.mjs` lee pdf.js de
// `globalThis.pdfjsLib` AL CARGARSE: lo deja puesto obra/pdfjsCarga.js, antes.
// pdf.js se queda (y vacía) el búfer que recibe: le va una COPIA; la original es
// la que se firma o se descarga.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { mensajeError, urlDe } from '../api';
import {
    IcoAbajo, IcoAtras, IcoBuscar, IcoDescarga, IcoFlecha, IcoLista, IcoMas, IcoMenos, IcoX, Spinner,
} from '../ui/Iconos';

async function cargarPdfjs() {
    const { pdfjs } = await import('./pdfjsCarga');
    const [visor] = await Promise.all([import('pdfjs-dist/web/pdf_viewer.mjs'), import('pdfjs-dist/web/pdf_viewer.css')]);
    return { pdfjs, visor };
}

const ESCALAS = [
    ['auto', 'Automático'], ['page-width', 'Al ancho'], ['page-fit', 'Página entera'],
    ['0.5', '50 %'], ['0.75', '75 %'], ['1', '100 %'], ['1.25', '125 %'], ['1.5', '150 %'], ['2', '200 %'], ['3', '300 %'],
];
const PRESETS = new Set(['auto', 'page-width', 'page-fit']);
// El visor de pdf.js se maneja asignándole propiedades (currentPageNumber,
// currentScaleValue); fuera del componente, porque vive en un ref.
const poner = (viewer, k, v) => { viewer[k] = v; };
const esMovil = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 699px)').matches;

/** Las miniaturas (PC): se pintan al asomar, a 104 px de ancho. */
function Miniaturas({ pdf, pagina, onIr }) {
    const raizRef = useRef(null);
    useEffect(() => {
        const raiz = raizRef.current;
        if (!raiz || !pdf) return undefined;
        let vivo = true;
        const hechas = new Set();
        const tareas = [];
        const io = new IntersectionObserver((entradas) => {
            entradas.forEach(async (en) => {
                const n = Number(en.target.dataset.n);
                if (!en.isIntersecting || hechas.has(n)) return;
                hechas.add(n);
                const p = await pdf.getPage(n);
                const canvas = en.target.querySelector('canvas');
                if (!vivo || !canvas) return;
                const dpr = Math.min(window.devicePixelRatio || 1, 2);
                const vp = p.getViewport({ scale: (104 / p.getViewport({ scale: 1 }).width) * dpr });
                canvas.width = Math.floor(vp.width);
                canvas.height = Math.floor(vp.height);
                const t = p.render({ canvasContext: canvas.getContext('2d'), viewport: vp });
                tareas.push(t);
                t.promise.catch(() => {});
            });
        }, { root: raiz, rootMargin: '300px 0px' });
        raiz.querySelectorAll('[data-n]').forEach(el => io.observe(el));
        return () => { vivo = false; io.disconnect(); tareas.forEach(t => t.cancel()); };
    }, [pdf]);
    useEffect(() => {
        raizRef.current?.querySelector(`[data-n="${pagina}"]`)?.scrollIntoView({ block: 'nearest' });
    }, [pagina]);
    return (
        <nav className="ca-visor-mini" ref={raizRef} aria-label="Páginas">
            {Array.from({ length: pdf.numPages }, (_, i) => (
                <button key={i} type="button" data-n={i + 1} className={pagina === i + 1 ? 'ca-mini-act' : undefined}
                    onClick={() => onIr(i + 1)} aria-label={`Página ${i + 1}`} aria-current={pagina === i + 1 ? 'page' : undefined}>
                    <canvas />
                    <span>{i + 1}</span>
                </button>
            ))}
        </nav>
    );
}

/**
 * @param {object}   doc      { nombre, url, fecha, autor }
 * @param {string}   titulo
 * @param {string}   [detalle]
 * @param {(ctx: { bytes: ArrayBuffer|null, listo: boolean }) => any} [pie]  los botones de abajo
 */
export function VisorPdf({ doc, titulo, detalle, onCerrar, pie }) {
    const [estado, setEstado] = useState({ cargando: true, error: null });
    const [bytes, setBytes] = useState(null);
    const [pdf, setPdf] = useState(null);
    const [pagina, setPagina] = useState(1);
    const [paginaTxt, setPaginaTxt] = useState('1');
    const [escala, setEscala] = useState({ valor: 'auto', pct: 100 });
    const [miniaturas, setMiniaturas] = useState(() => !esMovil());
    const [buscando, setBuscando] = useState(false);
    const [consulta, setConsulta] = useState('');
    const [resultado, setResultado] = useState(null);   // { actual, total, sinNada }
    const contRef = useRef(null);
    const hojaRef = useRef(null);
    const buscarRef = useRef(null);
    const pdfjsRef = useRef(null);   // { visor, eventBus, viewer }
    const cerrarRef = useRef(onCerrar);
    useEffect(() => { cerrarRef.current = onCerrar; });

    // Los bytes, pdf.js y su visor.
    useEffect(() => {
        let vivo = true;
        let documento = null;
        (async () => {
            try {
                const { data } = await axios.get(urlDe(doc.url), { responseType: 'arraybuffer' });
                if (!vivo) return;
                setBytes(data);
                const { pdfjs, visor } = await cargarPdfjs();
                if (!vivo || !contRef.current) return;
                const eventBus = new visor.EventBus();
                const linkService = new visor.PDFLinkService({ eventBus, externalLinkTarget: visor.LinkTarget.BLANK });
                const findController = new visor.PDFFindController({ eventBus, linkService });
                const viewer = new visor.PDFViewer({
                    container: contRef.current, viewer: hojaRef.current, eventBus, linkService, findController,
                    textLayerMode: 1, removePageBorders: true,
                });
                linkService.setViewer(viewer);
                eventBus.on('pagesinit', () => { poner(viewer, 'currentScaleValue', esMovil() ? 'page-width' : 'auto'); });
                eventBus.on('pagechanging', (e) => { setPagina(e.pageNumber); setPaginaTxt(String(e.pageNumber)); });
                eventBus.on('scalechanging', (e) => setEscala({ valor: e.presetValue || String(e.scale), pct: Math.round(e.scale * 100) }));
                eventBus.on('updatefindmatchescount', (e) => setResultado(r => ({ ...r, actual: e.matchesCount.current, total: e.matchesCount.total })));
                eventBus.on('updatefindcontrolstate', (e) => setResultado({
                    actual: e.matchesCount?.current || 0, total: e.matchesCount?.total || 0, sinNada: e.state === visor.FindState.NOT_FOUND,
                }));
                documento = await pdfjs.getDocument({ data: new Uint8Array(data.slice(0)) }).promise;
                if (!vivo) { documento.destroy(); return; }
                viewer.setDocument(documento);
                linkService.setDocument(documento, null);
                pdfjsRef.current = { visor, eventBus, viewer };
                setPdf(documento);
                setEstado({ cargando: false, error: null });
            } catch (err) {
                if (vivo) setEstado({ cargando: false, error: mensajeError(err, 'No se ha podido abrir el PDF.') });
            }
        })();
        return () => { vivo = false; pdfjsRef.current = null; documento?.destroy(); };
    }, [doc.url]);

    // Al cambiar el ancho (girar el móvil, abrir las miniaturas), lo «ajustado» se reajusta.
    useEffect(() => {
        const el = contRef.current;
        if (!el || typeof ResizeObserver === 'undefined') return undefined;
        const ro = new ResizeObserver(() => {
            const v = pdfjsRef.current?.viewer;
            if (v?.pagesCount && PRESETS.has(v.currentScaleValue)) poner(v, 'currentScaleValue', v.currentScaleValue);
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const ir = useCallback((n) => {
        const v = pdfjsRef.current?.viewer;
        if (!v?.pagesCount) return;
        const p = Math.min(Math.max(1, Math.round(Number(n)) || 1), v.pagesCount);
        poner(v, 'currentPageNumber', p);
        setPaginaTxt(String(p));
    }, []);
    const zoom = useCallback((paso) => {
        const v = pdfjsRef.current?.viewer;
        if (!v?.pagesCount) return;
        if (paso > 0) v.increaseScale(); else v.decreaseScale();
    }, []);
    const buscar = useCallback((q, { otra = false, atras = false } = {}) => {
        pdfjsRef.current?.eventBus.dispatch('find', {
            source: null, type: otra ? 'again' : '', query: q, caseSensitive: false, entireWord: false,
            highlightAll: true, findPrevious: atras, matchDiacritics: false,
        });
    }, []);
    const abrirBusqueda = useCallback(() => {
        setBuscando(true);
        setTimeout(() => { buscarRef.current?.focus(); buscarRef.current?.select(); }, 0);
    }, []);
    const cerrarBusqueda = useCallback(() => {
        setBuscando(false); setConsulta(''); setResultado(null);
        pdfjsRef.current?.eventBus.dispatch('findbarclose', { source: null });
    }, []);

    // Teclado y el scroll del fondo.
    const buscandoRef = useRef(buscando);
    useEffect(() => { buscandoRef.current = buscando; });
    useEffect(() => {
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const alTeclado = (e) => {
            const mod = e.ctrlKey || e.metaKey;
            if (e.key === 'Escape') { e.preventDefault(); if (buscandoRef.current) cerrarBusqueda(); else cerrarRef.current?.(); return; }
            if (mod && e.key.toLowerCase() === 'f') { e.preventDefault(); abrirBusqueda(); return; }
            if (mod && (e.key === '+' || e.key === '=')) { e.preventDefault(); zoom(1); return; }
            if (mod && e.key === '-') { e.preventDefault(); zoom(-1); return; }
            if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target?.tagName || '')) return;
            const v = pdfjsRef.current?.viewer;
            if (!v?.pagesCount) return;
            if (e.key === 'ArrowRight') { e.preventDefault(); v.nextPage(); }
            if (e.key === 'ArrowLeft') { e.preventDefault(); v.previousPage(); }
            if (e.key === 'Home' && mod) { e.preventDefault(); poner(v, 'currentPageNumber', 1); }
            if (e.key === 'End' && mod) { e.preventDefault(); poner(v, 'currentPageNumber', v.pagesCount); }
        };
        document.addEventListener('keydown', alTeclado);
        return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', alTeclado); };
    }, [abrirBusqueda, cerrarBusqueda, zoom]);

    const descargar = useCallback(() => {
        if (!bytes) return;
        const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
        const a = document.createElement('a');
        a.href = url; a.download = doc.nombre || 'documento.pdf'; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
    }, [bytes, doc.nombre]);

    const total = pdf?.numPages || 0;
    const listo = !estado.cargando && !estado.error;
    const enLista = ESCALAS.some(([v]) => v === escala.valor);
    return createPortal(
        <div className="ca-visor" role="dialog" aria-modal="true" aria-label={titulo}>
            <div className="ca-visor-cab">
                {total > 1 && (
                    <button type="button" className={`ca-icobtn ca-visor-solo-pc${miniaturas ? ' ca-icobtn-act' : ''}`} onClick={() => setMiniaturas(m => !m)}
                        aria-pressed={miniaturas} title="Miniaturas de las páginas" aria-label="Miniaturas de las páginas"><IcoLista size={17} /></button>
                )}
                <span className="ca-doc-txt ca-visor-tit">
                    <b>{titulo}</b>
                    <small>{detalle || doc.nombre}</small>
                </span>
                <div className="ca-visor-herr" aria-label="Herramientas del visor">
                    <span className="ca-visor-grupo">
                        <button type="button" className="ca-icobtn" disabled={!listo || pagina <= 1} onClick={() => ir(pagina - 1)} aria-label="Página anterior"><IcoAtras size={16} /></button>
                        <label className="ca-visor-pag">
                            <span className="ca-sr">Página</span>
                            <input inputMode="numeric" value={paginaTxt} disabled={!listo} aria-label={`Página, de ${total}`}
                                onChange={e => setPaginaTxt(e.target.value.replace(/\D/g, '').slice(0, 4))}
                                onKeyDown={e => { if (e.key === 'Enter') { ir(paginaTxt); e.currentTarget.blur(); } }}
                                onBlur={() => ir(paginaTxt)} onFocus={e => e.currentTarget.select()} />
                            <span>/ {total || '–'}</span>
                        </label>
                        <button type="button" className="ca-icobtn" disabled={!listo || pagina >= total} onClick={() => ir(pagina + 1)} aria-label="Página siguiente"><IcoFlecha size={16} /></button>
                    </span>
                    <span className="ca-visor-grupo">
                        <button type="button" className="ca-icobtn ca-visor-zoom-btn" disabled={!listo} onClick={() => zoom(-1)} aria-label="Alejar"><IcoMenos size={16} /></button>
                        <select className="ca-visor-escala" value={enLista ? escala.valor : 'otro'} disabled={!listo} aria-label="Zoom"
                            onChange={e => { const v = pdfjsRef.current?.viewer; if (v?.pagesCount && e.target.value !== 'otro') poner(v, 'currentScaleValue', e.target.value); }}>
                            {!enLista && <option value="otro">{escala.pct} %</option>}
                            {ESCALAS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                        <button type="button" className="ca-icobtn ca-visor-zoom-btn" disabled={!listo} onClick={() => zoom(1)} aria-label="Acercar"><IcoMas size={16} /></button>
                    </span>
                    <button type="button" className={`ca-icobtn${buscando ? ' ca-icobtn-act' : ''}`} disabled={!listo} onClick={() => (buscando ? cerrarBusqueda() : abrirBusqueda())}
                        title="Buscar en el documento (Ctrl+F)" aria-label="Buscar en el documento" aria-pressed={buscando}><IcoBuscar size={17} /></button>
                </div>
                <button type="button" className="ca-icobtn" onClick={onCerrar} aria-label="Cerrar el visor"><IcoX /></button>
            </div>

            {buscando && (
                <div className="ca-visor-buscar" role="search">
                    <IcoBuscar size={16} />
                    <input ref={buscarRef} type="search" value={consulta} placeholder="Buscar en el documento" aria-label="Buscar en el documento"
                        onChange={e => { setConsulta(e.target.value); buscar(e.target.value); }}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); buscar(consulta, { otra: true, atras: e.shiftKey }); } }} />
                    <span className="ca-visor-cuenta" aria-live="polite">
                        {!consulta ? '' : resultado?.sinNada ? 'Sin resultados' : resultado?.total ? `${resultado.actual} de ${resultado.total}` : ''}
                    </span>
                    <button type="button" className="ca-icobtn" disabled={!resultado?.total} onClick={() => buscar(consulta, { otra: true, atras: true })} aria-label="Anterior"><IcoAbajo size={16} style={{ transform: 'rotate(180deg)' }} /></button>
                    <button type="button" className="ca-icobtn" disabled={!resultado?.total} onClick={() => buscar(consulta, { otra: true })} aria-label="Siguiente"><IcoAbajo size={16} /></button>
                    <button type="button" className="ca-icobtn" onClick={cerrarBusqueda} aria-label="Cerrar la búsqueda"><IcoX size={16} /></button>
                </div>
            )}

            <div className="ca-visor-main">
                {pdf && miniaturas && total > 1 && <Miniaturas pdf={pdf} pagina={pagina} onIr={ir} />}
                <div className="ca-visor-lienzo">
                    <div className="ca-visor-cuerpo" ref={contRef}>
                        <div className="pdfViewer" ref={hojaRef} />
                    </div>
                    {estado.cargando && <div className="ca-visor-estado"><Spinner size={26} /><span>Abriendo el PDF…</span></div>}
                    {estado.error && (
                        <div className="ca-visor-estado">
                            <span>{estado.error}</span>
                            <a className="ca-btn ca-btn-sec" href={urlDe(doc.url)} download={doc.nombre}><IcoAbajo size={16} /> Descargarlo</a>
                        </div>
                    )}
                </div>
            </div>

            <div className="ca-visor-pie">
                {pie?.({ bytes, listo })}
                <button type="button" className="ca-btn ca-btn-sec" disabled={!listo} onClick={descargar}><IcoDescarga size={16} /> Descargar</button>
            </div>
        </div>,
        document.body,
    );
}

export default VisorPdf;
