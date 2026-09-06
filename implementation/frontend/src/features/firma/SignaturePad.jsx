import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { InkBrush, INSTRUMENTS, applyPaperGrain, extractInk } from './ink';

/**
 * La hoja en blanco donde el cliente firma con el dedo, el lápiz o el ratón.
 *
 * Port de `ScannerApp/src/renderer/components/SignaturePad.tsx`. Los puntos se
 * guardan EN CRUDO (tal y como llegan del puntero) y es el pincel quien los
 * suaviza, así que deshacer o girar el teléfono repintan exactamente el mismo
 * trazo: la semilla del grano viaja con cada trazo.
 *
 * DIFERENCIA con ScannerApp: aquí NO hay selectores. Allí firma quien maneja la
 * app; aquí firma un cliente al que se le está pidiendo un papel, y elegir entre
 * tres plumas y tres grosores es una decisión que no le aporta nada y una
 * pantalla más antes de la única que importa. Va fijo en PLUMA y trazo MEDIO
 * (`INSTRUMENTO`/`PUNTA`), que es lo que más se parece a firmar en papel.
 */

/**
 * La punta se mide en FRACCIÓN DEL ANCHO de la hoja, no en píxeles.
 *
 * Se firma en una hoja de mil y pico píxeles y luego eso se estampa a un cuarto
 * del ancho de un A4: con un radio en píxeles absolutos, el trazo llegaba al
 * documento como un pelo de medio píxel. En proporción, el trazo pesa lo mismo
 * sea cual sea la pantalla en la que se haya firmado.
 */
const NIBS = [
    { key: 'fina', label: 'Fina', factor: 0.0030 },   // ~0,35 mm
    { key: 'media', label: 'Media', factor: 0.0042 },  // ~0,50 mm
    { key: 'gruesa', label: 'Gruesa', factor: 0.0058 }, // ~0,70 mm
];

const INSTRUMENTO = Math.max(0, INSTRUMENTS.findIndex(i => i.key === 'pluma'));
const PUNTA = 1; // media

const Icono = ({ d, className = 'w-5 h-5' }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
);
const D_DESHACER = 'M3 10h10a4 4 0 014 4v1M3 10l4-4M3 10l4 4';
const D_BORRAR = 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M4 7h16M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3';
const D_OK = 'M5 13l4 4L19 7';

/**
 * @param {object} props
 * @param {(ink:{dataUrl:string,width:number,height:number}) => void} props.onAccept
 * @param {() => void} [props.onCancel]  sin él no se pinta la salida
 * @param {string} [props.titulo]        qué se está firmando, arriba a la izquierda
 * @param {string} [props.textoAceptar]
 */
export function SignaturePad({ onAccept, onCancel, titulo, textoAceptar = 'Usar esta firma' }) {
    const canvasRef = useRef(null);
    const sheetRef = useRef(null);
    const brushRef = useRef(null);
    const strokesRef = useRef([]);
    const currentRef = useRef(null);
    const sizeRef = useRef({ width: 0, height: 0, scale: 2 });
    const [empty, setEmpty] = useState(true);

    const tool = INSTRUMENTS[INSTRUMENTO];
    const nibRadius = useCallback(
        () => Math.min(9, Math.max(0.8, sizeRef.current.width * NIBS[PUNTA].factor)),
        [],
    );

    /** Hoja opaca: `darken` necesita un fondo blanco de verdad debajo. */
    const clearSheet = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return null;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return null;
        const { width, height, scale } = sizeRef.current;
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.globalCompositeOperation = 'darken';
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        return ctx;
    }, []);

    const redraw = useCallback(() => {
        const ctx = clearSheet();
        if (!ctx) return;
        const { scale } = sizeRef.current;
        // El grano se deja para el final: tramo a tramo, repintar una firma
        // larga costaba 300 ms y el tirón se notaba al deshacer.
        for (const stroke of strokesRef.current) {
            const brush = new InkBrush(ctx, {
                instrument: tool, radius: nibRadius(), seed: stroke.seed, scale, grain: false,
            });
            stroke.points.forEach((point, i) => (i === 0 ? brush.down(point) : brush.move(point)));
            brush.up();
        }
        if (strokesRef.current.length) applyPaperGrain(ctx, tool);
    }, [clearSheet, nibRadius, tool]);

    /**
     * El lienzo se estira con CSS y de aquí sale solo su resolución interna,
     * medida SOBRE ÉL MISMO: si se midiera la hoja y las dos cifras no
     * coincidieran, el trazo saldría desplazado del dedo.
     *
     * Va con `ResizeObserver` y no con el evento `resize` porque la primera
     * medida buena puede llegar después del primer render (una caja todavía sin
     * maquetar mide 0, y ahí el lienzo se quedaba en el mínimo sin cubrir la
     * hoja). Girar el teléfono repinta desde los trazos guardados: la firma no
     * se pierde.
     */
    useLayoutEffect(() => {
        const sheet = sheetRef.current;
        if (!sheet) return;
        const apply = () => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const box = canvas.getBoundingClientRect();
            const width = Math.round(box.width);
            const height = Math.round(box.height);
            if (width < 2 || height < 2) return;   // todavía sin maquetar
            // x2 sobre la densidad de la pantalla: la firma acaba estampada en
            // un PDF y a tamaño real se le verían los bordes.
            const scale = Math.min(3, (window.devicePixelRatio || 1) * 2);
            const backingWidth = Math.round(width * scale);
            const backingHeight = Math.round(height * scale);
            if (canvas.width === backingWidth && canvas.height === backingHeight) return;
            canvas.width = backingWidth;
            canvas.height = backingHeight;
            sizeRef.current = { width, height, scale };
            redraw();
        };
        apply();
        const observer = new ResizeObserver(apply);
        observer.observe(sheet);
        return () => observer.disconnect();
    }, [redraw]);

    // ---------------------------------------------------------------- trazo
    const toPoint = (event) => {
        const rect = canvasRef.current.getBoundingClientRect();
        return {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
            pressure: event.pointerType === 'pen' ? event.pressure : null,
            t: event.timeStamp,
        };
    };

    const start = (event) => {
        if (event.button !== 0 && event.pointerType === 'mouse') return;
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;
        // Sale del lienzo sin levantar el dedo: el trazo tiene que seguir siendo
        // suyo hasta que se suelte, o se corta a mitad de rasgo.
        try { canvas.setPointerCapture(event.pointerId); } catch { /* sin captura */ }

        const point = toPoint(event);
        const stroke = { points: [point], seed: (Math.random() * 0xffffffff) >>> 0 };
        currentRef.current = stroke;

        const brush = new InkBrush(ctx, {
            instrument: tool, radius: nibRadius(), seed: stroke.seed, scale: sizeRef.current.scale,
        });
        brush.down(point);
        brushRef.current = brush;
        setEmpty(false);
    };

    const move = (event) => {
        const brush = brushRef.current;
        const stroke = currentRef.current;
        if (!brush || !stroke) return;
        // Un lápiz o una pantalla de 120 Hz entregan varias muestras por frame:
        // sin esto se pierden y las curvas rápidas salen aristadas.
        const native = event.nativeEvent;
        const batch = native.getCoalescedEvents?.() || [];
        const events = batch.length ? batch : [native];
        for (const raw of events) {
            const point = toPoint(raw);
            stroke.points.push(point);
            brush.move(point);
        }
    };

    /**
     * Cierra el trazo en curso. Se llama desde el lienzo y también desde la
     * ventana: si la captura del puntero no se pudo tomar y se suelta fuera, el
     * `pointerup` del lienzo no llega nunca y el trazo se quedaba sin guardar —
     * desaparecía en el siguiente repintado.
     */
    const finishStroke = useCallback(() => {
        const brush = brushRef.current;
        const stroke = currentRef.current;
        if (!brush || !stroke) return;
        brush.up();
        brushRef.current = null;
        currentRef.current = null;
        if (stroke.points.length) strokesRef.current.push(stroke);
    }, []);

    useEffect(() => {
        const cerrar = () => finishStroke();
        window.addEventListener('pointerup', cerrar);
        window.addEventListener('pointercancel', cerrar);
        return () => {
            window.removeEventListener('pointerup', cerrar);
            window.removeEventListener('pointercancel', cerrar);
        };
    }, [finishStroke]);

    const end = (event) => {
        try {
            if (canvasRef.current?.hasPointerCapture(event.pointerId)) {
                canvasRef.current.releasePointerCapture(event.pointerId);
            }
        } catch { /* ya liberado */ }
        finishStroke();
    };

    // -------------------------------------------------------------- acciones
    const undo = useCallback(() => {
        strokesRef.current.pop();
        setEmpty(strokesRef.current.length === 0);
        redraw();
    }, [redraw]);

    const clear = useCallback(() => {
        strokesRef.current = [];
        setEmpty(true);
        redraw();
    }, [redraw]);

    const accept = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ink = extractInk(canvas, tool, Math.round(sizeRef.current.scale * 8));
        if (ink) onAccept(ink);
    };

    // --------------------------------------------------------------- render
    //
    // La hoja ES la pantalla y los controles flotan en las esquinas, donde nadie
    // firma. Una barra de 60 px se llevaría el 15 % del alto útil en horizontal,
    // que es justo donde se firma.
    //
    // Va PORTALEADO a `document.body` (regla 29.b): un `position: fixed` se
    // ancla al ancestro más cercano con `backdrop-filter`, y la tarjeta de
    // `/firmar-anexos` lleva `backdrop-blur-xl`. Sin el portal, la "pantalla
    // completa" se recortaba a la caja de esa tarjeta: la hoja quedaba en una
    // franja de 200 px con los botones amontonados encima. Es el mismo motivo
    // por el que `SendActionOverlay` se portalea.
    return createPortal(
        <div className="fixed inset-0 z-[70] bg-white">
            <div ref={sheetRef} className="absolute inset-0 bg-white overflow-hidden">
                <canvas
                    ref={canvasRef}
                    onPointerDown={start}
                    onPointerMove={move}
                    onPointerUp={end}
                    onPointerCancel={end}
                    className="absolute inset-0 w-full h-full cursor-crosshair"
                    style={{ touchAction: 'none' }}
                />
                {/* El aviso va ENCIMA del lienzo, que es blanco opaco: debajo no
                    se vería. Desaparece con el primer trazo. */}
                {empty && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-2">
                        <p className="text-slate-300 text-3xl font-light tracking-wide">Firma aquí</p>
                        <p className="text-slate-300/80 text-xs uppercase tracking-[0.2em] font-bold">Con el dedo o con el lápiz</p>
                    </div>
                )}
                {/* Una línea de renglón: sin ella, en una pantalla entera en
                    blanco la firma sale flotando y a un tamaño cualquiera. */}
                {empty && <div className="absolute left-[12%] right-[12%] bottom-[28%] border-b border-dashed border-slate-200 pointer-events-none" />}
            </div>

            {titulo && (
                <div className="absolute left-3 top-3 pointer-events-none" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Firmando</p>
                    <p className="text-sm font-bold text-slate-700">{titulo}</p>
                </div>
            )}

            {onCancel && (
                <button onClick={onCancel} aria-label="Cancelar"
                    className="absolute right-3 top-3 w-11 h-11 rounded-full bg-white/90 backdrop-blur border border-slate-200 shadow-lg flex items-center justify-center text-slate-500"
                    style={{ marginTop: 'env(safe-area-inset-top)' }}>
                    <Icono d="M6 18L18 6M6 6l12 12" />
                </button>
            )}

            <div className="absolute left-3 bottom-3 flex gap-2" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
                <button onClick={undo} disabled={empty} aria-label="Deshacer"
                    className="w-12 h-12 rounded-full bg-white/90 backdrop-blur border border-slate-200 shadow-lg flex items-center justify-center text-slate-600 disabled:opacity-30">
                    <Icono d={D_DESHACER} />
                </button>
                <button onClick={clear} disabled={empty} aria-label="Borrar"
                    className="w-12 h-12 rounded-full bg-white/90 backdrop-blur border border-slate-200 shadow-lg flex items-center justify-center text-slate-600 disabled:opacity-30">
                    <Icono d={D_BORRAR} />
                </button>
            </div>

            <button onClick={accept} disabled={empty}
                className={`absolute right-3 bottom-3 flex items-center gap-2 px-6 py-3.5 rounded-full font-black text-sm uppercase tracking-widest shadow-xl transition-all ${
                    empty ? 'bg-slate-200 text-slate-400' : 'bg-brand text-bkg-deep active:scale-95'
                }`}
                style={{ marginBottom: 'env(safe-area-inset-bottom)' }}>
                <Icono d={D_OK} className="w-5 h-5" /> {textoAceptar}
            </button>
        </div>,
        document.body,
    );
}

export default SignaturePad;
