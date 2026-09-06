import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cargarPdf } from './escaneado';

/**
 * El documento, A PANTALLA COMPLETA, para leerlo antes de firmar.
 *
 * Antes vivía encajado en la tarjeta de `/firmar-anexos`: un A4 dentro de una
 * caja de 520 px dentro de una página con márgenes. En un móvil eso deja el
 * cuerpo del texto a unos 6 px — se ve que hay un documento, pero no se lee. Y
 * lo que se le pide al cliente es justamente que lo LEA antes de firmar, así que
 * la pantalla entera es lo mínimo, con zoom para el que lo necesite.
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

/** Pasos de zoom. El 1 es "ajustado al ancho de la pantalla". */
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

export function LectorDocumento({ buffer, titulo, urlDescarga, onLeido, onCerrar, pie }) {
    const canvasRef = useRef(null);
    const scrollRef = useRef(null);
    const docRef = useRef(null);
    const [total, setTotal] = useState(0);
    const [pagina, setPagina] = useState(1);
    const [zoom, setZoom] = useState(0);
    const [estado, setEstado] = useState('cargando'); // cargando | listo | sin_visor
    const [motivo, setMotivo] = useState(null);
    const [abierto, setAbierto] = useState(false);    // ¿lo abrió en su lector?

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
                setPagina(1);
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
    }, [pagina, zoom]);

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

    // Con el documento abierto fuera, el visor ya no manda: se le cree cuando
    // dice que lo ha leído. Es la vía de escape para un navegador que no puede
    // pintar el PDF — sin ella, el proceso se queda muerto ahí.
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
                {estado === 'cargando' && (
                    <div className="h-full flex flex-col items-center justify-center gap-3">
                        <svg className="w-8 h-8 animate-spin text-brand" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                        <p className="text-white/40 text-[11px] font-black uppercase tracking-widest">Abriendo el documento…</p>
                    </div>
                )}

                {estado === 'sin_visor' && (
                    <div className="h-full flex flex-col items-center justify-center gap-4 px-6 text-center">
                        <div className="w-14 h-14 rounded-full bg-amber-500/15 border border-amber-400/30 flex items-center justify-center">
                            <Icono d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" className="w-7 h-7 text-amber-300" />
                        </div>
                        <div>
                            <h2 className="text-white font-black uppercase tracking-widest text-sm">Tu navegador no puede mostrarlo aquí</h2>
                            <p className="text-white/50 text-[13px] leading-relaxed mt-2 max-w-xs">
                                Ábrelo con el lector de tu teléfono, léelo y vuelve a esta pantalla para firmarlo.
                            </p>
                        </div>
                        <a href={urlDescarga} target="_blank" rel="noopener noreferrer" onClick={() => setAbierto(true)}
                            className="w-full max-w-xs py-4 rounded-xl bg-gradient-to-r from-brand to-brand-700 text-bkg-deep font-black text-sm uppercase tracking-widest flex items-center justify-center gap-2">
                            <Icono d={D_FUERA} className="w-5 h-5" /> Abrir el documento
                        </a>
                        {abierto && (
                            <button onClick={leidoFuera}
                                className="w-full max-w-xs py-3 rounded-xl border border-white/15 bg-white/[0.03] text-white/70 text-[11px] font-black uppercase tracking-widest">
                                Ya lo he leído
                            </button>
                        )}
                        <p className="text-white/20 text-[10px] font-mono max-w-xs break-words">{motivo}</p>
                    </div>
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

export default LectorDocumento;
