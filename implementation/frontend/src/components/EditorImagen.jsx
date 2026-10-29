import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ReactCrop, { centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';

/**
 * EL EDITOR DE IMAGEN — uno solo para toda la app.
 *
 * Antes solo recortaba: las esquinas y «Aplicar». Una foto de obra llega
 * tumbada (el móvil pierde la orientación al pasar por WhatsApp) o torcida, y
 * eso no se arreglaba en ningún sitio. Ahora gira de 90 en 90, ENDEREZA por
 * grados —como el visor de Windows—, voltea y recorta con las proporciones de
 * siempre.
 *
 * ⚠️ El giro se aplica a los PÍXELES antes de recortar: la imagen que ve el
 * usuario en el recuadro es la que se va a guardar, así que el recorte no
 * necesita convertir coordenadas y lo que se ve es lo que sale.
 *
 * Dos modos, porque hay dos contratos distintos en la casa:
 *   modo="pixeles"  → onAplicar(dataURL)     · el Anexo Fotográfico, que manda
 *                                              la imagen modificada al PDF.
 *   modo="recuadro" → onAplicar({x,y,w,h,ar}) en % sobre la foto ORIGINAL · la
 *                     placa del Anexo VI (regla 60): el original sigue entero
 *                     en Drive y el encuadre vive en el expediente. Aquí NO hay
 *                     giro ni volteo: el certificado se monta con el recuadro.
 */

const PROPORCIONES = [
    { id: 'libre', label: 'Libre', v: undefined },
    { id: 'orig', label: 'Original', v: 'original' },
    { id: '1', label: '1:1', v: 1 },
    { id: '43', label: '4:3', v: 4 / 3 },
    { id: '34', label: '3:4', v: 3 / 4 },
    { id: '169', label: '16:9', v: 16 / 9 },
];

const Ico = ({ d, className = 'w-4 h-4' }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
);
const D = {
    giroIzq: 'M3 10h10a5 5 0 015 5v1m-15-6l4-4m-4 4l4 4',
    giroDer: 'M21 10H11a5 5 0 00-5 5v1m15-6l-4-4m4 4l-4 4',
    cerrar: 'M6 18L18 6M6 6l12 12',
    reset: 'M4 4v5h5M20 20v-5h-5M20 9A8 8 0 006.3 5.3M4 15a8 8 0 0013.7 3.7',
};

function BotBarra({ onClick, title, children, activo = false }) {
    return (
        <button type="button" onClick={onClick} title={title} aria-label={title}
            className={`h-10 min-w-[2.5rem] px-3 shrink-0 rounded-xl flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-widest transition-all
                ${activo ? 'bg-brand text-black' : 'bg-white/[0.07] text-white/65 hover:bg-white/15 hover:text-white active:scale-95'}`}>
            {children}
        </button>
    );
}

export function EditorImagen({
    abierto = true, src, titulo = '', modo = 'pixeles',
    recorteInicial = null,      // { x, y, w, h } en % (modo recuadro, al reabrir)
    onAplicar, onCancelar,
    onQuitarFoto = null,        // «Quitar foto» (el anexo la saca del documento)
    onQuitarRecorte = null,     // «Quitar recorte» (la placa vuelve a la entera)
    etiquetaAplicar = 'Aplicar',
    calidad = 0.92,
}) {
    const imgRef = useRef(null);
    const [crop, setCrop] = useState();
    const [hecho, setHecho] = useState();          // crop en % (lo que se guarda)
    const [rot, setRot] = useState(0);             // giro de 90 en 90
    const [fino, setFino] = useState(0);           // enderezado APLICADO, −45…45
    const [finoMando, setFinoMando] = useState(0); // lo que marca el deslizador
    const [fx, setFx] = useState(1);
    const [fy, setFy] = useState(1);
    const [prop, setProp] = useState('libre');
    const [trabajo, setTrabajo] = useState(null);  // la imagen ya girada/volteada
    const [preparando, setPreparando] = useState(false);
    const [aplicando, setAplicando] = useState(false);
    const pulsadoEnFondo = useRef(false);

    // El deslizador NO rehace el lienzo en cada paso: con una foto de móvil
    // (4000 px) cada paso es un JPEG entero y arrastrarlo iba a tirones. Se
    // aplica cuando se para, y mientras tanto la foto gira por CSS.
    useEffect(() => {
        if (finoMando === fino) return undefined;
        const t = setTimeout(() => setFino(finoMando), 220);
        return () => clearTimeout(t);
    }, [finoMando, fino]);

    const giraOvoltea = modo === 'pixeles';
    const transformada = giraOvoltea && (rot !== 0 || fino !== 0 || fx < 0 || fy < 0);

    // ── La imagen de trabajo: el original con el giro y el volteo ya aplicados.
    // Se rehace en cada cambio y es la que ve el recuadro de recorte.
    useEffect(() => {
        if (!src) return undefined;
        if (!transformada) { setTrabajo(src); return undefined; }
        let vivo = true;
        setPreparando(true);
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            if (!vivo) return;
            const rad = ((rot + fino) * Math.PI) / 180;
            const cos = Math.abs(Math.cos(rad));
            const sen = Math.abs(Math.sin(rad));
            const w = img.naturalWidth;
            const h = img.naturalHeight;
            const cw = Math.round(w * cos + h * sen);
            const ch = Math.round(w * sen + h * cos);
            const cv = document.createElement('canvas');
            cv.width = cw; cv.height = ch;
            const ctx = cv.getContext('2d');
            // Fondo BLANCO: al enderezar quedan picos vacíos, y estas fotos
            // acaban en un PDF sobre papel blanco. En negro cantarían.
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, cw, ch);
            ctx.translate(cw / 2, ch / 2);
            ctx.rotate(rad);
            ctx.scale(fx, fy);
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, -w / 2, -h / 2, w, h);
            try { setTrabajo(cv.toDataURL('image/jpeg', 0.95)); }
            catch { setTrabajo(src); }   // una imagen de otro origen "mancha" el canvas
            setPreparando(false);
        };
        img.onerror = () => { if (vivo) { setTrabajo(src); setPreparando(false); } };
        img.src = src;
        return () => { vivo = false; };
    }, [src, rot, fino, fx, fy, transformada]);

    // Al girar, el recuadro anterior ya no significa nada: se vuelve a empezar.
    useEffect(() => { setCrop(undefined); setHecho(undefined); }, [rot, fino, fx, fy]);

    const aspectoDe = useCallback((id, el) => {
        const p = PROPORCIONES.find(x => x.id === id);
        if (!p || p.v === undefined) return undefined;
        if (p.v === 'original') return el ? el.width / el.height : undefined;
        return p.v;
    }, []);

    // ⚠️ `makeAspectCrop` SIN relación de aspecto devuelve altura 0 (solo sabe
    // deducirla de una proporción). Con eso, aceptar sin tocar las esquinas
    // guardaba un recuadro de alto CERO: en la placa, una banda vacía en el
    // certificado. Sin proporción, el recuadro de salida se pone a mano.
    const centrar = useCallback((el, id = prop) => {
        const a = aspectoDe(id, el);
        const c = a
            ? centerCrop(makeAspectCrop({ unit: '%', width: 80 }, a, el.width, el.height), el.width, el.height)
            : { unit: '%', x: 5, y: 5, width: 90, height: 90 };
        setCrop(c);
        setHecho(c);
    }, [aspectoDe, prop]);

    const alCargar = (e) => {
        const el = e.currentTarget;
        if (recorteInicial && !transformada) {
            const c = { unit: '%', x: recorteInicial.x, y: recorteInicial.y, width: recorteInicial.w, height: recorteInicial.h };
            setCrop(c); setHecho(c);
            return;
        }
        centrar(el);
    };

    const cambiarProp = (id) => {
        setProp(id);
        if (imgRef.current) centrar(imgRef.current, id);
    };

    const restablecer = () => {
        setRot(0); setFino(0); setFinoMando(0); setFx(1); setFy(1); setProp('libre');
        if (imgRef.current) centrar(imgRef.current, 'libre');
    };

    const aplicar = async () => {
        const el = imgRef.current;
        if (!el) return;
        if (modo === 'recuadro') {
            if (!hecho?.width || !hecho?.height) { onCancelar?.(); return; }
            const ar = el.naturalWidth / el.naturalHeight;
            setAplicando(true);
            await onAplicar?.({ x: hecho.x, y: hecho.y, w: hecho.width, h: hecho.height, ar });
            setAplicando(false);
            return;
        }
        // Modo píxeles: recorte sobre la imagen de trabajo (ya girada). Sin
        // recuadro, se aplica la foto entera — girarla y darle a «Aplicar» tiene
        // que servir para algo.
        setAplicando(true);
        const sx = el.naturalWidth / el.width;
        const sy = el.naturalHeight / el.height;
        const pxs = (hecho?.width && hecho?.height)
            ? {
                x: (hecho.x / 100) * el.width * sx,
                y: (hecho.y / 100) * el.height * sy,
                w: (hecho.width / 100) * el.width * sx,
                h: (hecho.height / 100) * el.height * sy,
            }
            : { x: 0, y: 0, w: el.naturalWidth, h: el.naturalHeight };
        const cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(pxs.w));
        cv.height = Math.max(1, Math.round(pxs.h));
        const ctx = cv.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(el, pxs.x, pxs.y, pxs.w, pxs.h, 0, 0, cv.width, cv.height);
        let dataUrl;
        try { dataUrl = cv.toDataURL('image/jpeg', calidad); }
        catch { setAplicando(false); return; }
        await onAplicar?.(dataUrl);
        setAplicando(false);
    };

    // Esc cancela, Intro aplica: lo que espera cualquiera en un diálogo.
    // ⚠️ En CAPTURA y sin propagar, como el visor: Esc no puede cerrar además el
    // modal de debajo. Intro con el foco en un BOTÓN es de ese botón (con
    // «Cancelar» enfocado, aplicaba); R no se come Ctrl+R ni lo que se escribe.
    useEffect(() => {
        if (!abierto) return undefined;
        const onKey = (e) => {
            const t = e.target;
            const escribiendo = t?.tagName === 'TEXTAREA' || t?.isContentEditable
                || (t?.tagName === 'INPUT' && !['range', 'checkbox', 'radio', 'button'].includes(t.type));
            const hecho = () => { e.preventDefault(); e.stopImmediatePropagation(); };
            if (e.key === 'Escape') { hecho(); onCancelar?.(); }
            else if (e.key === 'Enter' && !escribiendo && t?.tagName !== 'BUTTON' && t?.tagName !== 'A') { hecho(); aplicar(); }
            else if ((e.key === 'r' || e.key === 'R') && giraOvoltea && !escribiendo && !e.ctrlKey && !e.metaKey && !e.altKey) {
                hecho(); setRot(r => r + (e.shiftKey ? -90 : 90));
            }
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [abierto, hecho, modo, giraOvoltea]);

    if (!abierto || !src) return null;

    const aspecto = aspectoDe(prop, imgRef.current);

    return createPortal(
        /* Se cancela solo si el clic EMPIEZA y acaba en el fondo: al soltar fuera
           del diálogo el arrastre de una esquina, el `click` caía en el fondo y
           se perdía todo lo hecho. */
        <div className="fixed inset-0 z-[9010] flex items-center justify-center bg-black/98 backdrop-blur-2xl p-2 md:p-8"
            onMouseDown={e => { pulsadoEnFondo.current = e.target === e.currentTarget; }}
            onClick={e => { if (pulsadoEnFondo.current && e.target === e.currentTarget) onCancelar?.(); pulsadoEnFondo.current = false; }}>
            <div className="bg-[#16181D] border border-white/10 rounded-2xl md:rounded-3xl w-full max-w-5xl max-h-[96vh] flex flex-col overflow-hidden">

                <div className="shrink-0 px-4 md:px-6 py-3 md:py-4 border-b border-white/10 flex justify-between items-center gap-3 bg-white/[0.02]">
                    <h3 className="text-white font-bold uppercase tracking-widest text-[10px] md:text-xs truncate">
                        Editor de imagen{titulo ? ` · ${titulo}` : ''}
                    </h3>
                    <button onClick={() => onCancelar?.()} className="text-white/25 hover:text-white transition-colors shrink-0" aria-label="Cerrar">
                        <Ico d={D.cerrar} className="w-6 h-6" />
                    </button>
                </div>

                {/* min-h-0 deja que el área encoja: el pie con «Aplicar» no se puede perder. */}
                <div className="flex-1 min-h-0 overflow-hidden p-3 md:p-6 flex items-center justify-center bg-black/40 relative">
                    {preparando && (
                        <span className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-lg bg-black/70 text-white/60 text-[10px] font-black uppercase tracking-widest animate-pulse">
                            girando…
                        </span>
                    )}
                    <ReactCrop
                        crop={crop} aspect={aspecto}
                        onChange={(c, pc) => { setCrop(c); setHecho(pc); }}
                        onComplete={(c, pc) => setHecho(pc)}
                        className="max-w-full max-h-full">
                        <img ref={imgRef} src={trabajo || src} alt={titulo || 'Imagen'}
                            className="max-w-full object-contain shadow-2xl"
                            style={{
                                maxHeight: 'calc(96vh - 260px)',
                                transform: finoMando !== fino ? `rotate(${finoMando - fino}deg)` : undefined,
                            }}
                            onLoad={alCargar} />
                    </ReactCrop>
                </div>

                {/* ── Herramientas ── */}
                <div className="shrink-0 border-t border-white/10 bg-black/50 px-3 md:px-6 py-3 space-y-3">
                    <div className="flex items-center gap-1.5 md:gap-2 overflow-x-auto pb-0.5">
                        {giraOvoltea && (
                            <>
                                <BotBarra onClick={() => setRot(r => r - 90)} title="Girar a la izquierda (Mayús+R)"><Ico d={D.giroIzq} /></BotBarra>
                                <BotBarra onClick={() => setRot(r => r + 90)} title="Girar a la derecha (R)"><Ico d={D.giroDer} /></BotBarra>
                                <BotBarra onClick={() => setFx(v => v * -1)} title="Voltear en horizontal" activo={fx < 0}><span className="text-sm">⇋</span></BotBarra>
                                <BotBarra onClick={() => setFy(v => v * -1)} title="Voltear en vertical" activo={fy < 0}><span className="text-sm">⇅</span></BotBarra>
                                <span className="w-px h-7 bg-white/10 mx-0.5 shrink-0" />
                            </>
                        )}
                        {PROPORCIONES.map(p => (
                            <BotBarra key={p.id} onClick={() => cambiarProp(p.id)} title={`Proporción ${p.label}`} activo={prop === p.id}>
                                {p.label}
                            </BotBarra>
                        ))}
                        <span className="flex-1 min-w-[4px]" />
                        <BotBarra onClick={restablecer} title="Dejarla como estaba"><Ico d={D.reset} /></BotBarra>
                    </div>

                    {/* Enderezar: la foto de una placa sale torcida y un grado se nota. */}
                    {giraOvoltea && (
                        <div className="flex items-center gap-3">
                            <span className="text-[9px] font-black uppercase tracking-widest text-white/25 shrink-0 hidden md:inline">Enderezar</span>
                            <input type="range" min={-45} max={45} step={0.5} value={finoMando}
                                onChange={e => setFinoMando(parseFloat(e.target.value))}
                                className="flex-1 accent-brand cursor-pointer" aria-label="Enderezar" />
                            <button onClick={() => { setFinoMando(0); setFino(0); }}
                                className="shrink-0 min-w-[3.5rem] text-[11px] font-black tabular-nums text-white/60 hover:text-white"
                                title="Volver a 0°">{finoMando > 0 ? '+' : ''}{finoMando}°</button>
                        </div>
                    )}

                    <div className="flex flex-col md:flex-row gap-3 justify-between md:items-center">
                        <span className="text-[9px] md:text-[10px] uppercase font-black text-white/20 tracking-widest">
                            {modo === 'recuadro'
                                ? 'Arrastra las esquinas · la foto original no se toca'
                                : 'Arrastra las esquinas para recortar · Intro aplica'}
                        </span>
                        <div className="flex gap-2 md:gap-3 flex-wrap">
                            {onQuitarRecorte && (
                                <button onClick={onQuitarRecorte}
                                    className="px-4 md:px-6 py-2.5 bg-white/5 border border-white/10 text-white/50 text-[11px] font-black rounded-xl uppercase tracking-widest hover:bg-white/10 transition-all">
                                    Quitar recorte
                                </button>
                            )}
                            {onQuitarFoto && (
                                <button onClick={onQuitarFoto}
                                    className="px-4 md:px-6 py-2.5 bg-red-500/10 border border-red-500/30 text-red-400 text-[11px] font-black rounded-xl uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all">
                                    Quitar foto
                                </button>
                            )}
                            <button onClick={() => onCancelar?.()}
                                className="px-5 md:px-8 py-2.5 bg-white/5 text-white/50 text-[11px] font-black rounded-xl uppercase tracking-widest hover:bg-white/10 transition-all">
                                Cancelar
                            </button>
                            <button onClick={aplicar} disabled={aplicando || preparando}
                                className="px-6 md:px-10 py-2.5 bg-brand text-black text-[11px] font-black rounded-xl uppercase tracking-widest hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:hover:scale-100">
                                {aplicando ? 'Aplicando…' : etiquetaAplicar}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}

export default EditorImagen;
