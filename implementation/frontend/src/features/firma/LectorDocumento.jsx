import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cargarPdf } from './escaneado';
import { useIsMobile } from '../../utils/useIsMobile';

/**
 * El documento, para leerlo antes de firmar.
 *
 * Antes vivía encajado en la tarjeta de `/firmar-anexos`: un A4 dentro de una
 * caja de 520 px dentro de una página con márgenes. En un móvil eso deja el
 * cuerpo del texto a unos 6 px — se ve que hay un documento, pero no se lee. Y
 * lo que se le pide al cliente es justamente que lo LEA antes de firmar.
 *
 * DOS CARAS. En el MÓVIL, pantalla completa y página a página, con zoom: ahí
 * cada píxel cuenta y el dedo pasa hojas. En el ORDENADOR esa misma pantalla
 * completa estiraba el A4 a todo el ancho del monitor —se veía medio título y
 * había que desplazarse para leer una línea—, así que allí es un visor de PDF
 * como cualquier otro: ventana centrada, las páginas una debajo de otra a un
 * ancho de lectura, scroll continuo y las herramientas arriba. El corte es el
 * de `useIsMobile` (767 px), el mismo que usa el CSS de toda la app.
 *
 * Va portaleado a `document.body` por lo mismo que el `SignaturePad` (regla
 * 29.b): la tarjeta lleva `backdrop-blur`, que ancla cualquier `position:fixed`.
 */

const Icono = ({ d, className = 'w-5 h-5', w = 2 }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={w}>
        <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
);
const D_CERRAR = 'M6 18L18 6M6 6l12 12';
const D_IZQ = 'M15 19l-7-7 7-7';
const D_DER = 'M9 5l7 7-7 7';
const D_MAS = 'M12 6v12m6-6H6';
const D_MENOS = 'M18 12H6';
const D_FUERA = 'M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14';

/** Pasos de zoom del móvil. El 1 es "ajustado al ancho de la pantalla". */
const ZOOMS = [1, 1.6, 2.2];
/**
 * Tope de píxeles del lienzo. Un A4 al zoom máximo en una pantalla de 400 px con
 * densidad 3 pide 11 MPx (44 MB de memoria), y un móvil modesto tira la pestaña.
 */
const MAX_PIXELES = 4_000_000;

/**
 * Cuánto se espera a que pdf.js abra el documento antes de dar la vía alterna.
 *
 * No es una precaución de manual: pdf.js crea su worker con `type: "module"` y,
 * si el navegador no lo arranca PERO tampoco lanza un error, la promesa no
 * resuelve NUNCA — no hay plazo interno ni fallback. Se ve como una hoja en
 * blanco eterna, sin aviso, que es justo lo que peor se explica por teléfono.
 * Medido en un Android real donde el mismo enlace funcionaba en el ordenador.
 */
const PLAZO_MS = 15000;

/**
 * Abre el PDF con pdf.js, con el plazo de `PLAZO_MS`. Lo comparten las dos
 * caras del lector: el documento es el mismo y la forma de fallar, también.
 */
function useDocumentoPdf(buffer, onLeido) {
    const docRef = useRef(null);
    const [total, setTotal] = useState(0);
    const [estado, setEstado] = useState('cargando'); // cargando | listo | sin_visor
    const [motivo, setMotivo] = useState(null);

    const avisar = useRef(onLeido);
    useEffect(() => { avisar.current = onLeido; });

    useEffect(() => {
        let vivo = true;
        let plazo = null;
        (async () => {
            try {
                const doc = await Promise.race([
                    cargarPdf(buffer),
                    new Promise((_, rechaza) => {
                        plazo = setTimeout(() => rechaza(new Error('El visor no ha respondido a tiempo.')), PLAZO_MS);
                    }),
                ]);
                clearTimeout(plazo);
                if (!vivo) { try { doc.destroy(); } catch { /* da igual */ } return; }
                docRef.current = doc;
                setTotal(doc.numPages);
                setEstado('listo');
                if (doc.numPages <= 1) avisar.current?.();
            } catch (e) {
                clearTimeout(plazo);
                if (!vivo) return;
                // El motivo se enseña en pequeño: si vuelve a pasar en el móvil de
                // alguien, es lo único que permite saber por qué sin tenerlo delante.
                console.error('[lector] no se pudo abrir el documento:', e);
                setMotivo(e?.message || 'Error desconocido');
                setEstado('sin_visor');
            }
        })();
        return () => { vivo = false; clearTimeout(plazo); try { docRef.current?.destroy(); } catch { /* da igual */ } };
    }, [buffer]);

    return { docRef, total, estado, motivo, avisar };
}

const Cargando = () => (
    <div className="h-full flex flex-col items-center justify-center gap-3">
        <svg className="w-8 h-8 animate-spin text-brand" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
        <p className="text-white/40 text-[11px] font-black uppercase tracking-widest">Abriendo el documento…</p>
    </div>
);

/**
 * El navegador no sabe pintar el PDF: se abre fuera y se le cree cuando dice
 * que lo ha leído. Es la vía de escape — sin ella, el proceso se queda muerto.
 */
function SinVisor({ urlDescarga, motivo, abierto, onAbrir, onLeidoFuera, escritorio }) {
    return (
        <div className="h-full flex flex-col items-center justify-center gap-4 px-6 text-center">
            <div className="w-14 h-14 rounded-full bg-amber-500/15 border border-amber-400/30 flex items-center justify-center">
                <Icono d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" className="w-7 h-7 text-amber-300" />
            </div>
            <div>
                <h2 className="text-white font-black uppercase tracking-widest text-sm">Tu navegador no puede mostrarlo aquí</h2>
                <p className="text-white/50 text-[13px] leading-relaxed mt-2 max-w-xs">
                    {escritorio
                        ? 'Ábrelo en otra pestaña, léelo y vuelve a esta ventana para firmarlo.'
                        : 'Ábrelo con el lector de tu teléfono, léelo y vuelve a esta pantalla para firmarlo.'}
                </p>
            </div>
            <a href={urlDescarga} target="_blank" rel="noopener noreferrer" onClick={onAbrir}
                className="w-full max-w-xs py-4 rounded-xl bg-gradient-to-r from-brand to-brand-700 text-bkg-deep font-black text-sm uppercase tracking-widest flex items-center justify-center gap-2">
                <Icono d={D_FUERA} className="w-5 h-5" /> Abrir el documento
            </a>
            {abierto && (
                <button onClick={onLeidoFuera}
                    className="w-full max-w-xs py-3 rounded-xl border border-white/15 bg-white/[0.03] text-white/70 text-[11px] font-black uppercase tracking-widest">
                    Ya lo he leído
                </button>
            )}
            <p className="text-white/20 text-[10px] font-mono max-w-xs break-words">{motivo}</p>
        </div>
    );
}

export function LectorDocumento(props) {
    const movil = useIsMobile();
    return movil ? <LectorMovil {...props} /> : <LectorEscritorio {...props} />;
}

// ─── MÓVIL: pantalla completa, página a página ───────────────────────────────
function LectorMovil({ buffer, titulo, urlDescarga, onLeido, onCerrar, pie }) {
    const canvasRef = useRef(null);
    const scrollRef = useRef(null);
    const { docRef, total, estado, motivo, avisar } = useDocumentoPdf(buffer, onLeido);
    const [pagina, setPagina] = useState(1);
    const [zoom, setZoom] = useState(0);
    const [abierto, setAbierto] = useState(false);    // ¿lo abrió en su lector?

    const pintar = useCallback(async () => {
        const doc = docRef.current;
        const canvas = canvasRef.current;
        const caja = scrollRef.current;
        if (!doc || !canvas || !caja) return;
        const page = await doc.getPage(pagina);
        const base = page.getViewport({ scale: 1 });
        const anchoCss = Math.max(240, caja.clientWidth) * ZOOMS[zoom];
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        let escala = (anchoCss / base.width) * dpr;
        // Recorte por memoria: más vale un pelo menos de nitidez que una pestaña
        // que se cierra sola a mitad de lectura.
        const pixeles = base.width * escala * base.height * escala;
        if (pixeles > MAX_PIXELES) escala *= Math.sqrt(MAX_PIXELES / pixeles);
        const viewport = page.getViewport({ scale: escala });
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${Math.floor(anchoCss)}px`;
        canvas.style.height = 'auto';
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport }).promise;
    }, [pagina, zoom, docRef]);

    useLayoutEffect(() => { if (estado === 'listo') pintar(); }, [estado, pintar]);
    useEffect(() => {
        let t;
        const onResize = () => { clearTimeout(t); t = setTimeout(() => pintar(), 150); };
        window.addEventListener('resize', onResize);
        window.addEventListener('orientationchange', onResize);
        return () => {
            clearTimeout(t);
            window.removeEventListener('resize', onResize);
            window.removeEventListener('orientationchange', onResize);
        };
    }, [pintar]);

    const ir = (n) => {
        const destino = Math.min(Math.max(1, n), total);
        setPagina(destino);
        scrollRef.current?.scrollTo({ top: 0, left: 0 });
        if (destino >= total) avisar.current?.();
    };

    const leidoFuera = () => { setAbierto(true); avisar.current?.(); };

    return createPortal(
        <div className="fixed inset-0 z-[60] bg-bkg-deep flex flex-col">
            {/* Cabecera */}
            <div className="shrink-0 flex items-center gap-3 px-3 py-3 border-b border-white/10 bg-bkg-surface"
                style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
                <button onClick={onCerrar} aria-label="Cerrar"
                    className="w-10 h-10 rounded-xl border border-white/10 bg-white/[0.03] text-white/60 flex items-center justify-center shrink-0">
                    <Icono d={D_CERRAR} />
                </button>
                <div className="min-w-0 flex-1">
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-brand">Lee y firma</p>
                    <p className="text-[13px] font-bold text-white truncate">{titulo}</p>
                </div>
                {estado === 'listo' && total > 0 && (
                    <span className="text-[10px] font-black uppercase tracking-wider text-white/40 shrink-0">
                        {pagina}/{total}
                    </span>
                )}
            </div>

            {/* El documento */}
            <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto bg-black/40 p-2">
                {estado === 'cargando' && <Cargando />}
                {estado === 'sin_visor' && (
                    <SinVisor urlDescarga={urlDescarga} motivo={motivo} abierto={abierto}
                        onAbrir={() => setAbierto(true)} onLeidoFuera={leidoFuera} />
                )}
                {estado === 'listo' && (
                    <div className="flex justify-center">
                        <canvas ref={canvasRef} className="bg-white rounded shadow-2xl" style={{ display: 'block' }} />
                    </div>
                )}
            </div>

            {/* Barra de abajo: pasar páginas, zoom y firmar. Pegada, porque es lo
                que se usa sin parar mientras se lee. */}
            <div className="shrink-0 border-t border-white/10 bg-bkg-surface px-3 pt-2 pb-3 space-y-2"
                style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
                {estado === 'listo' && (
                    <div className="flex items-center gap-2">
                        <button onClick={() => ir(pagina - 1)} disabled={pagina <= 1} aria-label="Página anterior"
                            className="w-12 h-11 rounded-xl border border-white/10 bg-white/[0.03] text-white/70 disabled:opacity-25 flex items-center justify-center">
                            <Icono d={D_IZQ} />
                        </button>
                        <div className="flex-1 flex items-center justify-center gap-2">
                            <button onClick={() => setZoom(z => Math.max(0, z - 1))} disabled={zoom === 0} aria-label="Reducir"
                                className="w-11 h-11 rounded-xl border border-white/10 bg-white/[0.03] text-white/70 disabled:opacity-25 flex items-center justify-center">
                                <Icono d={D_MENOS} />
                            </button>
                            <span className="text-[10px] font-black uppercase tracking-wider text-white/40 w-14 text-center">
                                {Math.round(ZOOMS[zoom] * 100)}%
                            </span>
                            <button onClick={() => setZoom(z => Math.min(ZOOMS.length - 1, z + 1))} disabled={zoom === ZOOMS.length - 1} aria-label="Ampliar"
                                className="w-11 h-11 rounded-xl border border-white/10 bg-white/[0.03] text-white/70 disabled:opacity-25 flex items-center justify-center">
                                <Icono d={D_MAS} />
                            </button>
                        </div>
                        <button onClick={() => ir(pagina + 1)} disabled={pagina >= total} aria-label="Página siguiente"
                            className="w-12 h-11 rounded-xl border border-brand/40 bg-brand/10 text-brand disabled:opacity-25 flex items-center justify-center">
                            <Icono d={D_DER} />
                        </button>
                    </div>
                )}
                {pie}
            </div>
        </div>,
        document.body,
    );
}

// ─── ORDENADOR: un visor de PDF de verdad ────────────────────────────────────
/** Zoom del escritorio, sobre el ANCHO DE LECTURA (no sobre el de la ventana). */
const ZOOMS_PC = [0.75, 1, 1.25, 1.5, 2];
/**
 * Ancho de una página al 100 %. Un A4 a ~860 px deja el cuerpo del texto a un
 * tamaño que se lee sin acercarse; a todo el ancho de un monitor sale enorme y
 * hay que desplazarse para ver media línea.
 */
const ANCHO_LECTURA = 860;
/** Tope por PÁGINA: aquí se pintan todas a la vez (un anexo son 2-4). */
const MAX_PIXELES_PAGINA = 6_000_000;

function LectorEscritorio({ buffer, titulo, urlDescarga, onLeido, onCerrar, pie }) {
    const scrollRef = useRef(null);
    const finRef = useRef(null);
    const paginasRef = useRef([]);   // contenedor de cada página: por dónde va y saltar
    const lienzosRef = useRef([]);
    const generacion = useRef(0);
    const { docRef, total, estado, motivo, avisar } = useDocumentoPdf(buffer, onLeido);
    const [tamanos, setTamanos] = useState([]);   // [{ w, h }] de cada página a escala 1
    const [hueco, setHueco] = useState(0);         // ancho útil del área de lectura
    const [zoom, setZoom] = useState(1);
    const [pagina, setPagina] = useState(1);
    const [abierto, setAbierto] = useState(false);

    // El tamaño de cada página ANTES de pintarla: así el scroll no salta mientras
    // se rasterizan, y la barra ya sabe cuánto documento hay.
    useEffect(() => {
        if (estado !== 'listo') return;
        let vivo = true;
        (async () => {
            const doc = docRef.current;
            const t = [];
            for (let i = 1; i <= doc.numPages; i++) {
                const vp = (await doc.getPage(i)).getViewport({ scale: 1 });
                t.push({ w: vp.width, h: vp.height });
            }
            if (vivo) setTamanos(t);
        })().catch(e => console.error('[lector] tamaños:', e));
        return () => { vivo = false; };
    }, [estado, docRef]);

    // Ancho disponible: la ventana puede cambiar de tamaño con el visor abierto.
    useLayoutEffect(() => {
        const caja = scrollRef.current;
        if (!caja) return undefined;
        const medir = () => setHueco(caja.clientWidth);
        medir();
        const ro = new ResizeObserver(medir);
        ro.observe(caja);
        return () => ro.disconnect();
    }, [estado]);

    const anchoPagina = Math.round(Math.min(Math.max(hueco - 64, 320), ANCHO_LECTURA) * ZOOMS_PC[zoom]);

    // Pinta TODAS las páginas. Una generación por pasada: si cambia el zoom a
    // mitad, la pasada vieja se retira sola.
    useEffect(() => {
        const doc = docRef.current;
        if (estado !== 'listo' || !doc || !tamanos.length || !hueco) return;
        const gen = ++generacion.current;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        (async () => {
            for (let i = 0; i < tamanos.length; i++) {
                const canvas = lienzosRef.current[i];
                if (!canvas) continue;
                const page = await doc.getPage(i + 1);
                if (gen !== generacion.current) return;
                const base = page.getViewport({ scale: 1 });
                let escala = (anchoPagina / base.width) * dpr;
                const pixeles = base.width * escala * base.height * escala;
                if (pixeles > MAX_PIXELES_PAGINA) escala *= Math.sqrt(MAX_PIXELES_PAGINA / pixeles);
                const viewport = page.getViewport({ scale: escala });
                // Se pinta en un lienzo aparte y se copia al final: así, al cambiar
                // el zoom, la página no se queda en blanco mientras se rasteriza.
                const tmp = document.createElement('canvas');
                tmp.width = Math.floor(viewport.width);
                tmp.height = Math.floor(viewport.height);
                const tctx = tmp.getContext('2d');
                tctx.fillStyle = '#ffffff';
                tctx.fillRect(0, 0, tmp.width, tmp.height);
                await page.render({ canvasContext: tctx, viewport }).promise;
                if (gen !== generacion.current) return;
                canvas.width = tmp.width;
                canvas.height = tmp.height;
                canvas.getContext('2d').drawImage(tmp, 0, 0);
            }
        })().catch(e => console.error('[lector] pintar:', e));
    }, [estado, tamanos, anchoPagina, hueco, docRef]);

    // Por qué página va: la última cuyo borde de arriba ya ha pasado el primer
    // tercio de la vista.
    const alDesplazar = () => {
        const caja = scrollRef.current;
        if (!caja) return;
        const linea = caja.scrollTop + caja.clientHeight / 3;
        let n = 1;
        paginasRef.current.forEach((el, i) => { if (el && el.offsetTop <= linea) n = i + 1; });
        setPagina(n);
    };

    // "Leído" = ha llegado al final del documento: lo mismo que pasar a la última
    // página en el móvil.
    useEffect(() => {
        const fin = finRef.current;
        const caja = scrollRef.current;
        if (!fin || !caja || !tamanos.length) return undefined;
        const io = new IntersectionObserver((ents) => {
            if (ents.some(e => e.isIntersecting)) avisar.current?.();
        }, { root: caja, threshold: 0 });
        io.observe(fin);
        return () => io.disconnect();
    }, [tamanos, avisar]);

    const ir = (n) => {
        const destino = Math.min(Math.max(1, n), total);
        const el = paginasRef.current[destino - 1];
        if (el) scrollRef.current?.scrollTo({ top: el.offsetTop - 16, behavior: 'smooth' });
    };

    // El teclado, como en cualquier visor: flechas para pasar hojas y Ctrl +/−
    // para el zoom (sin robarle al navegador el suyo fuera del visor).
    useEffect(() => {
        const onKey = (e) => {
            if (e.target?.closest?.('input, textarea, [contenteditable="true"]')) return;
            const mod = e.ctrlKey || e.metaKey;
            if (mod && (e.key === '+' || e.key === '=')) { e.preventDefault(); setZoom(z => Math.min(ZOOMS_PC.length - 1, z + 1)); }
            else if (mod && e.key === '-') { e.preventDefault(); setZoom(z => Math.max(0, z - 1)); }
            else if (!mod && e.key === 'ArrowRight') { e.preventDefault(); ir(pagina + 1); }
            else if (!mod && e.key === 'ArrowLeft') { e.preventDefault(); ir(pagina - 1); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    });

    const leidoFuera = () => { setAbierto(true); avisar.current?.(); };
    const btn = 'h-9 min-w-9 px-2 rounded-lg border border-white/10 bg-white/[0.03] text-white/70 hover:text-white hover:border-white/25 disabled:opacity-25 disabled:hover:border-white/10 flex items-center justify-center transition-colors';

    return createPortal(
        <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6">
            <div className="w-full max-w-5xl h-full max-h-[94vh] bg-bkg-surface border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
                {/* Cabecera y herramientas */}
                <div className="shrink-0 flex items-center gap-4 px-4 py-3 border-b border-white/10">
                    <div className="min-w-0 flex-1">
                        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-brand">Lee y firma</p>
                        <p className="text-[14px] font-bold text-white truncate">{titulo}</p>
                    </div>
                    {estado === 'listo' && total > 0 && (
                        <div className="flex items-center gap-1.5 shrink-0">
                            <button onClick={() => ir(pagina - 1)} disabled={pagina <= 1} aria-label="Página anterior" title="Página anterior (←)" className={btn}>
                                <Icono d={D_IZQ} className="w-4 h-4" />
                            </button>
                            <span className="text-[11px] font-bold text-white/60 tabular-nums w-24 text-center">Página {pagina} de {total}</span>
                            <button onClick={() => ir(pagina + 1)} disabled={pagina >= total} aria-label="Página siguiente" title="Página siguiente (→)" className={btn}>
                                <Icono d={D_DER} className="w-4 h-4" />
                            </button>
                            <span className="w-px h-6 bg-white/10 mx-2" />
                            <button onClick={() => setZoom(z => Math.max(0, z - 1))} disabled={zoom === 0} aria-label="Reducir" title="Reducir (Ctrl −)" className={btn}>
                                <Icono d={D_MENOS} className="w-4 h-4" />
                            </button>
                            <span className="text-[11px] font-bold text-white/60 tabular-nums w-12 text-center">{Math.round(ZOOMS_PC[zoom] * 100)}%</span>
                            <button onClick={() => setZoom(z => Math.min(ZOOMS_PC.length - 1, z + 1))} disabled={zoom === ZOOMS_PC.length - 1} aria-label="Ampliar" title="Ampliar (Ctrl +)" className={btn}>
                                <Icono d={D_MAS} className="w-4 h-4" />
                            </button>
                            <span className="w-px h-6 bg-white/10 mx-2" />
                            <a href={urlDescarga} target="_blank" rel="noopener noreferrer" title="Abrir el PDF en otra pestaña" className={btn}>
                                <Icono d={D_FUERA} className="w-4 h-4" />
                            </a>
                        </div>
                    )}
                    <button onClick={onCerrar} aria-label="Cerrar" title="Cerrar" className={`${btn} ml-2`}>
                        <Icono d={D_CERRAR} className="w-4 h-4" />
                    </button>
                </div>

                {/* Las páginas, una debajo de otra */}
                <div ref={scrollRef} onScroll={alDesplazar} className="flex-1 min-h-0 overflow-auto bg-black/40">
                    {estado === 'cargando' && <Cargando />}
                    {estado === 'sin_visor' && (
                        <SinVisor escritorio urlDescarga={urlDescarga} motivo={motivo} abierto={abierto}
                            onAbrir={() => setAbierto(true)} onLeidoFuera={leidoFuera} />
                    )}
                    {estado === 'listo' && (
                        <div className="flex flex-col items-center gap-8 py-8 px-8 w-max min-w-full">
                            {tamanos.map((t, i) => (
                                <div key={i} ref={el => { paginasRef.current[i] = el; }} className="relative">
                                    <canvas ref={el => { lienzosRef.current[i] = el; }}
                                        className="bg-white rounded-sm shadow-[0_8px_30px_rgba(0,0,0,0.45)] block"
                                        style={{ width: anchoPagina, height: Math.round(anchoPagina * t.h / t.w) }} />
                                    <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] font-bold text-white/30 tabular-nums">{i + 1} / {tamanos.length}</span>
                                </div>
                            ))}
                            <div ref={finRef} className="h-px w-full" />
                        </div>
                    )}
                </div>

                {/* Firmar: centrado y a ancho de botón, no de monitor */}
                <div className="shrink-0 border-t border-white/10 px-4 py-3">
                    <div className="max-w-md mx-auto space-y-2">{pie}</div>
                </div>
            </div>
        </div>,
        document.body,
    );
}

export default LectorDocumento;
