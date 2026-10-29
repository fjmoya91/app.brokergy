import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AISLAR_PORTAL } from './aislarPortal';

/**
 * EL VISOR DE FOTOS — uno solo para toda la app.
 *
 * Había tres: el del gestor de documentación (rueda y poco más), el del Anexo
 * Fotográfico (dos botones de zoom, y además nadie lo abría) y ninguno en la
 * placa. Las fotos de una obra se miran de verdad —se busca el nº de serie en
 * una placa, se comprueba si el tubo entra donde dice—, así que esto es un
 * visor de los de verdad: se pasa de una a otra con las FLECHAS, se amplía con
 * la RUEDA hacia donde apunta el ratón, se arrastra, se gira, y en el móvil se
 * hace pellizco y se pasa con el dedo.
 *
 * ⚠️ Va PORTALEADO a `document.body` (regla 29.b): abierto desde un modal con
 * `backdrop-filter`, un `fixed` se ancla a ESE modal y el visor saldría
 * recortado a su caja.
 *
 * Qué recibe:
 *   fotos    [{ id, label, src, fuentes?, lowSrc?, descarga?, nota? }]
 *            `src` es la imagen buena; `fuentes` son alternativas por si falla
 *            (Drive: proxy → lh3 → thumbnail), `lowSrc` la borrosa de mientras.
 *   indice   cuál se mira · onIndice(n) para moverse
 *   onCerrar
 *   acciones (foto, i) => ReactNode   botones propios del pie (borrar, validar…)
 *   onEditar (foto, i) => void        si se pasa, sale el botón «Editar»
 *   titulo   rótulo de la cabecera (el apartado, normalmente)
 *
 * El giro y el volteo de aquí son PARA MIRAR: no tocan el fichero. Para dejarla
 * girada está el editor (`EditorImagen`), que sí reescribe los píxeles.
 */

const ZOOM_MIN = 0.1;
const ZOOM_MAX = 12;
const VISTA_0 = { k: 1, tx: 0, ty: 0, rot: 0, fx: 1, fy: 1 };
const NAT_0 = { w: 0, h: 0 };

/** La imagen, con la misma cadena de respaldo que las miniaturas del gestor. */
function ImagenConRespaldo({ fuentes, lowSrc, alt, estilo, onTamano }) {
    const [intento, setIntento] = useState(0);
    const [cargada, setCargada] = useState(false);
    const [muerta, setMuerta] = useState(false);
    // ⚠️ El estado se reinicia con la `key` que pone el padre (el texto de las
    // fuentes), no con un efecto: el padre reconstruye el array en cada render,
    // y un efecto con él como dependencia entraba en bucle (reset → carga →
    // reset → …).
    const lista = useMemo(() => (fuentes || []).filter(Boolean), [fuentes]);

    if (!lista.length) {
        return <div className="text-white/30 text-xs font-bold uppercase tracking-widest">Sin imagen</div>;
    }
    const base = lista[Math.min(intento, lista.length - 1)];
    const vuelta = Math.floor(intento / lista.length);
    const src = vuelta > 0 ? `${base}${base.includes('?') ? '&' : '?'}cb=${vuelta}` : base;

    return (
        <>
            {lowSrc && !cargada && !muerta && (
                <img src={lowSrc} alt="" draggable={false} style={estilo} className="absolute blur-[2px] opacity-60 select-none" />
            )}
            {/* Sin fundido de entrada: al volver a una foto ya vista se quedaba
                un parpadeo en blanco, cuando el navegador la tiene en caché y la
                pinta al instante. */}
            <img
                src={src} alt={alt || ''} draggable={false} style={estilo}
                className="select-none"
                // Una imagen que ya está en CACHÉ puede montarse completa sin
                // disparar `onLoad`, y entonces el visor nunca sabría su tamaño
                // y la pintaría sin ajustar.
                ref={el => { if (el?.complete && el.naturalWidth) { setCargada(true); onTamano?.(el.naturalWidth, el.naturalHeight); } }}
                onLoad={e => { setCargada(true); onTamano?.(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight); }}
                onError={() => {
                    if (intento < lista.length * 3) setTimeout(() => setIntento(a => a + 1), 350);
                    else setMuerta(true);
                }}
            />
            {!cargada && !muerta && !lowSrc && (
                <div className="absolute text-white/40 text-[10px] uppercase tracking-widest animate-pulse">cargando…</div>
            )}
            {muerta && (
                <button onClick={() => { setIntento(0); setMuerta(false); }}
                    className="absolute pointer-events-auto px-4 py-2 rounded-xl bg-white/10 text-amber-300 text-[11px] font-black uppercase tracking-widest">
                    ↻ Reintentar
                </button>
            )}
        </>
    );
}

/** Botón de la barra: mismo tamaño en el móvil (44 px) que en el PC. */
function Bot({ onClick, title, children, activo = false, disabled = false, ancho = false, clase = '' }) {
    return (
        <button
            type="button" onClick={onClick} title={title} aria-label={title} disabled={disabled}
            className={`h-11 ${ancho ? 'px-4' : 'w-11'} shrink-0 rounded-xl ${clase || 'flex'} items-center justify-center text-sm font-black transition-all disabled:opacity-25 disabled:pointer-events-none
                ${activo ? 'bg-brand text-black' : 'bg-white/[0.07] text-white/70 hover:bg-white/15 hover:text-white active:scale-95'}`}>
            {children}
        </button>
    );
}

const Ico = ({ d, className = 'w-5 h-5' }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
);
const D = {
    cerrar: 'M6 18L18 6M6 6l12 12',
    izq: 'M15 19l-7-7 7-7',
    der: 'M9 5l7 7-7 7',
    mas: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7',
    menos: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7',
    ajustar: 'M4 8V4m0 0h4M4 4l5 5m11-5v4m0-4h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5',
    giroIzq: 'M3 10h10a5 5 0 015 5v1m-15-6l4-4m-4 4l4 4',
    giroDer: 'M21 10H11a5 5 0 00-5 5v1m15-6l-4-4m4 4l-4 4',
    descargar: 'M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3',
    editar: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
    pantalla: 'M4 8V4m0 0h4M4 4l5 5m11-5v4m0-4h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5',
    tiras: 'M4 6h16M4 12h16M4 18h16',
};

export function VisorFotos({
    fotos = [], indice = 0, onIndice, onCerrar,
    acciones = null, onEditar = null, titulo = '', pie = null,
}) {
    const cajaRef = useRef(null);      // área de imagen (mide el encaje)
    const raizRef = useRef(null);      // raíz del portal (pantalla completa)
    const [vista, setVista] = useState(VISTA_0);
    const [caja, setCaja] = useState({ w: 0, h: 0 });
    const [natGuardado, setNatGuardado] = useState({ clave: '', w: 0, h: 0 });
    const [tira, setTira] = useState(false);
    const [ayuda, setAyuda] = useState(false);
    const [pantalla, setPantalla] = useState(false);
    const punteros = useRef(new Map());
    const gesto = useRef(null);
    const movido = useRef(false);

    const total = fotos.length;
    const i = Math.max(0, Math.min(indice, total - 1));
    const foto = fotos[i] || null;
    const fuentes = foto ? (foto.fuentes?.length ? foto.fuentes : [foto.src]) : [];
    const claveFoto = fuentes.join('|');

    // ⚠️ El tamaño de la foto va con la CLAVE de su foto y NO se pone a cero en
    // un efecto: una imagen que ya está en caché lo reporta desde su `ref`, en el
    // commit, ANTES de que corran los efectos del visor — y el efecto que lo
    // reiniciaba al cambiar de foto lo borraba justo después: volver a una foto
    // ya vista la pintaba sin ajustar.
    const nat = useMemo(() => (natGuardado.clave === claveFoto ? natGuardado : NAT_0), [natGuardado, claveFoto]);

    // ── Encaje: cuánto hay que escalar la foto para que QUEPA, teniendo en
    // cuenta el giro (a 90° el alto de la foto compite con el ancho de la caja).
    const impar = ((vista.rot % 360) + 360) % 360 % 180 !== 0;
    const base = useMemo(() => {
        if (!nat.w || !nat.h || !caja.w || !caja.h) return 1;
        const dw = impar ? caja.h : caja.w;
        const dh = impar ? caja.w : caja.h;
        return Math.min(dw / nat.w, dh / nat.h);
    }, [nat, caja, impar]);

    const ir = useCallback((n) => {
        if (!total) return;
        const siguiente = (n + total) % total;
        onIndice?.(siguiente);
    }, [total, onIndice]);

    // Al cambiar de foto se vuelve a empezar: el zoom de una no dice nada de la otra.
    useEffect(() => { setVista(VISTA_0); }, [foto?.id, claveFoto]);

    // Medida del área (y al girar la pantalla del móvil).
    useEffect(() => {
        const el = cajaRef.current;
        if (!el) return undefined;
        const medir = () => setCaja({ w: el.clientWidth, h: el.clientHeight });
        medir();
        const ro = new ResizeObserver(medir);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // Lo que ocupa la foto en pantalla ahora mismo (ya girada y ampliada).
    const medidas = useMemo(() => {
        const w = nat.w * base * vista.k;
        const h = nat.h * base * vista.k;
        return impar ? { w: h, h: w } : { w, h };
    }, [nat, base, vista.k, impar]);

    // No se deja escapar la foto: siempre queda un trozo dentro de la caja.
    const sujeta = useCallback((tx, ty, med = medidas) => {
        const mx = Math.max(0, (med.w - caja.w) / 2) + 40;
        const my = Math.max(0, (med.h - caja.h) / 2) + 40;
        return { tx: Math.max(-mx, Math.min(mx, tx)), ty: Math.max(-my, Math.min(my, ty)) };
    }, [medidas, caja]);

    /** Zoom manteniendo quieto el punto (px, py), que va en píxeles de pantalla
     *  medidos desde el CENTRO de la caja. Es lo que hace que la rueda amplíe
     *  hacia donde se está mirando y no hacia el centro. */
    const zoomEn = useCallback((factor, px = 0, py = 0) => {
        setVista(v => {
            const k = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, v.k * factor));
            if (k === v.k) return v;
            const r = k / v.k;
            const tx = px - (px - v.tx) * r;
            const ty = py - (py - v.ty) * r;
            return { ...v, k, tx, ty };
        });
    }, []);

    // ── Rueda del ratón: zoom hacia el cursor. Listener NO pasivo, o la página
    // de debajo scrollea mientras se amplía.
    useEffect(() => {
        const el = cajaRef.current;
        if (!el) return undefined;
        const onWheel = (e) => {
            e.preventDefault();
            const r = el.getBoundingClientRect();
            zoomEn(e.deltaY < 0 ? 1.18 : 1 / 1.18, e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2);
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, [zoomEn]);

    const alternarPantalla = useCallback(() => {
        const el = raizRef.current;
        if (!el) return;
        if (document.fullscreenElement) document.exitFullscreen?.();
        else el.requestFullscreen?.().catch(() => { /* el navegador puede negarse */ });
    }, []);

    // ── Teclado: lo que cualquiera prueba sin que se lo expliquen.
    // ⚠️ En fase de CAPTURA y cortando la propagación: lo que hay debajo también
    // escucha el teclado (las flechas pasan de módulo en el expediente, Esc
    // cierra el modal de detrás) y una tecla del visor no puede hacer DOS cosas.
    // Con Ctrl/Alt/Cmd no se toca nada: Ctrl+R recarga y Ctrl+0 es del navegador.
    useEffect(() => {
        const onKey = (e) => {
            const t = e.target;
            if (t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA' || t?.tagName === 'SELECT' || t?.isContentEditable) return;
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            const hecho = () => { e.preventDefault(); e.stopImmediatePropagation(); };
            const k = e.key;
            if (k === 'Escape') { hecho(); if (pantalla && document.fullscreenElement) document.exitFullscreen?.(); else onCerrar?.(); return; }
            if (k === 'ArrowRight' || k === 'PageDown') { hecho(); ir(i + 1); return; }
            if (k === 'ArrowLeft' || k === 'PageUp') { hecho(); ir(i - 1); return; }
            if (k === 'Home') { hecho(); ir(0); return; }
            if (k === 'End') { hecho(); ir(total - 1); return; }
            if (k === '+' || k === '=') { hecho(); zoomEn(1.3); return; }
            if (k === '-' || k === '_') { hecho(); zoomEn(1 / 1.3); return; }
            if (k === '0') { hecho(); setVista(v => ({ ...v, k: 1, tx: 0, ty: 0 })); return; }
            if (k === '1') { hecho(); setVista(v => ({ ...v, k: base ? 1 / base : 1, tx: 0, ty: 0 })); return; }
            if (k === 'r' || k === 'R') { hecho(); setVista(v => ({ ...v, rot: v.rot + (e.shiftKey ? -90 : 90), tx: 0, ty: 0 })); return; }
            if (k === 'f' || k === 'F') { hecho(); alternarPantalla(); return; }
            if (k === 'h' || k === 'H') { hecho(); setVista(v => ({ ...v, fx: v.fx * -1 })); }
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [i, total, ir, zoomEn, base, onCerrar, pantalla]);

    useEffect(() => {
        const on = () => setPantalla(!!document.fullscreenElement);
        document.addEventListener('fullscreenchange', on);
        return () => document.removeEventListener('fullscreenchange', on);
    }, []);

    // ── Puntero: arrastrar (uno) y pellizcar (dos). Pointer Events sirve igual
    // para el ratón y para el dedo, así que no hay dos caminos que mantener.
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const onPointerDown = (e) => {
        if (e.button === 2) return;
        // Un botón de encima (las flechas, «Reintentar») se queda su clic:
        // capturar aquí el puntero se lo robaba, porque Chrome entrega el
        // `click` al elemento que tiene la captura.
        if (e.target.closest?.('button, a')) return;
        punteros.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        e.currentTarget.setPointerCapture?.(e.pointerId);
        movido.current = false;
        const ps = [...punteros.current.values()];
        if (ps.length === 2) {
            gesto.current = { tipo: 'pellizco', d0: dist(ps[0], ps[1]), k0: vista.k };
        } else {
            gesto.current = { tipo: 'arrastre', x: e.clientX, y: e.clientY, tx: vista.tx, ty: vista.ty };
        }
    };
    const onPointerMove = (e) => {
        if (!punteros.current.has(e.pointerId)) return;
        punteros.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const ps = [...punteros.current.values()];
        const g = gesto.current;
        if (!g) return;
        if (g.tipo === 'pellizco' && ps.length === 2) {
            const d = dist(ps[0], ps[1]);
            if (g.d0 > 0) {
                const r = cajaRef.current?.getBoundingClientRect();
                const cx = (ps[0].x + ps[1].x) / 2 - (r ? r.left + r.width / 2 : 0);
                const cy = (ps[0].y + ps[1].y) / 2 - (r ? r.top + r.height / 2 : 0);
                const objetivo = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, g.k0 * (d / g.d0)));
                setVista(v => {
                    const rr = objetivo / v.k;
                    return { ...v, k: objetivo, tx: cx - (cx - v.tx) * rr, ty: cy - (cy - v.ty) * rr };
                });
            }
            movido.current = true;
            return;
        }
        if (g.tipo === 'arrastre') {
            const dx = e.clientX - g.x;
            const dy = e.clientY - g.y;
            if (Math.abs(dx) > 6 || Math.abs(dy) > 6) movido.current = true;
            // Sin zoom, el arrastre horizontal PASA de foto (lo que se hace en el
            // móvil); con zoom, mueve la foto, que es lo que hace falta entonces.
            if (vista.k <= 1.02) {
                setVista(v => ({ ...v, tx: dx, ty: dy * 0.35 }));
            } else {
                const s = sujeta(g.tx + dx, g.ty + dy);
                setVista(v => ({ ...v, ...s }));
            }
        }
    };
    const onPointerUp = (e) => {
        punteros.current.delete(e.pointerId);
        const g = gesto.current;
        gesto.current = punteros.current.size ? { tipo: 'arrastre', x: e.clientX, y: e.clientY, tx: vista.tx, ty: vista.ty } : null;
        if (!g) return;
        if (g.tipo === 'arrastre' && vista.k <= 1.02) {
            const dx = vista.tx;
            if (total > 1 && Math.abs(dx) > 80) ir(dx < 0 ? i + 1 : i - 1);
            setVista(v => ({ ...v, tx: 0, ty: 0 }));
        }
    };

    const onDobleClic = (e) => {
        const r = cajaRef.current?.getBoundingClientRect();
        const px = r ? e.clientX - r.left - r.width / 2 : 0;
        const py = r ? e.clientY - r.top - r.height / 2 : 0;
        if (vista.k > 1.02) setVista(v => ({ ...v, k: 1, tx: 0, ty: 0 }));
        else zoomEn(2.6, px, py);
    };

    // ¿El clic cae sobre la foto? La envoltura no recibe eventos (el gesto es de
    // la caja), así que el `target` es SIEMPRE la caja y hay que mirarlo por
    // geometría. Sin esto cualquier clic en la foto cerraba el visor, y el doble
    // clic no llegaba nunca a ampliar.
    const sobreLaFoto = (e) => {
        const r = cajaRef.current?.getBoundingClientRect();
        if (!r || !medidas.w) return true;
        const px = e.clientX - r.left - r.width / 2 - vista.tx;
        const py = e.clientY - r.top - r.height / 2 - vista.ty;
        return Math.abs(px) <= medidas.w / 2 && Math.abs(py) <= medidas.h / 2;
    };

    const girar = (g) => setVista(v => ({ ...v, rot: v.rot + g, tx: 0, ty: 0 }));
    const ajustar = () => setVista(v => ({ ...v, k: 1, tx: 0, ty: 0 }));
    const real = () => setVista(v => ({ ...v, k: base ? 1 / base : 1, tx: 0, ty: 0 }));

    if (!foto) return null;

    const pct = Math.round(base * vista.k * 100);
    // Mientras no se sabe su tamaño, la foto se limita a la caja: suelta, una
    // de 4000 px se pintaría a tamaño real durante la carga.
    const estiloImg = nat.w
        ? { width: nat.w * base, height: nat.h * base, maxWidth: 'none' }
        : { maxWidth: caja.w || '100%', maxHeight: caja.h || '100%' };

    return createPortal(
        /* El velo va casi opaco y con el color puesto a mano: abierto sobre el
           gestor, lo de detrás no puede translucir. */
        /* ⚠️ AISLAR_PORTAL: sin él, cada clic del visor subía por React hasta el
           modal que lo abrió, y el del Anexo Fotográfico se cerraba con él. */
        <div ref={raizRef} {...AISLAR_PORTAL}
            style={{ backgroundColor: 'rgba(0,0,0,0.985)' }}
            className="fixed inset-0 z-[9000] backdrop-blur-sm flex flex-col select-none">

            {/* ── Cabecera ── */}
            <div className="shrink-0 flex items-center gap-3 px-3 md:px-5 py-2.5 bg-gradient-to-b from-black/80 to-transparent">
                <div className="min-w-0 flex-1">
                    <p className="text-white font-black uppercase tracking-widest text-[11px] md:text-xs truncate">{foto.label || titulo}</p>
                    {(foto.nota || titulo) && foto.label !== titulo && (
                        <p className="text-white/35 text-[10px] truncate">{foto.nota || titulo}</p>
                    )}
                </div>
                {total > 1 && (
                    <span className="shrink-0 px-2.5 py-1 rounded-lg bg-white/[0.07] text-white/60 text-[11px] font-black tabular-nums">{i + 1} / {total}</span>
                )}
                <Bot onClick={onCerrar} title="Cerrar (Esc)"><Ico d={D.cerrar} /></Bot>
            </div>

            {/* ── Imagen ── */}
            <div ref={cajaRef}
                onPointerDown={onPointerDown} onPointerMove={onPointerMove}
                onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
                onDoubleClick={onDobleClic}
                onClick={e => { if (e.target === e.currentTarget && !movido.current && !sobreLaFoto(e)) onCerrar?.(); }}
                style={{ touchAction: 'none' }}
                className={`relative flex-1 min-h-0 overflow-hidden flex items-center justify-center ${vista.k > 1.02 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in'}`}>
                <div className="pointer-events-none flex items-center justify-center"
                    style={{
                        transform: `translate3d(${vista.tx}px, ${vista.ty}px, 0) rotate(${vista.rot}deg) scale(${vista.k * vista.fx}, ${vista.k * vista.fy})`,
                        transition: gesto.current ? 'none' : 'transform 120ms ease-out',
                    }}>
                    <ImagenConRespaldo
                        key={claveFoto}
                        fuentes={fuentes} lowSrc={foto.lowSrc} alt={foto.label}
                        estilo={estiloImg}
                        onTamano={(w, h) => setNatGuardado(t => (t.clave === claveFoto && t.w === w && t.h === h ? t : { clave: claveFoto, w, h }))}
                    />
                </div>

                {/* Flechas laterales (en el móvil se pasa con el dedo) */}
                {total > 1 && (
                    <>
                        <button onClick={() => ir(i - 1)} title="Anterior (←)" aria-label="Anterior"
                            className="hidden md:flex absolute left-3 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-black/50 hover:bg-black/80 border border-white/10 text-white/70 hover:text-white items-center justify-center transition-all">
                            <Ico d={D.izq} className="w-6 h-6" />
                        </button>
                        <button onClick={() => ir(i + 1)} title="Siguiente (→)" aria-label="Siguiente"
                            className="hidden md:flex absolute right-3 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-black/50 hover:bg-black/80 border border-white/10 text-white/70 hover:text-white items-center justify-center transition-all">
                            <Ico d={D.der} className="w-6 h-6" />
                        </button>
                    </>
                )}

                {/* Aviso del zoom / pista de uso */}
                {vista.k > 1.02
                    ? <span className="absolute top-2 right-3 px-2 py-1 rounded-md bg-black/70 text-white/80 text-[10px] font-black tabular-nums pointer-events-none">{pct}%</span>
                    : (
                        <span className="absolute bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded-md bg-black/55 text-white/40 text-[9px] font-bold uppercase tracking-wider pointer-events-none text-center">
                            <span className="hidden md:inline">Rueda para ampliar · doble clic · flechas para pasar</span>
                            <span className="md:hidden">Pellizca para ampliar · desliza para pasar</span>
                        </span>
                    )}
            </div>

            {/* ── Tira de miniaturas ── */}
            {tira && total > 1 && (
                <div className="shrink-0 px-2 py-2 bg-black/70 border-t border-white/5 overflow-x-auto">
                    <div className="flex gap-2 w-max mx-auto">
                        {fotos.map((f, n) => (
                            <button key={f.id || n} onClick={() => ir(n)} title={f.label}
                                className={`relative w-14 h-14 rounded-lg overflow-hidden border-2 transition-all ${n === i ? 'border-brand scale-105' : 'border-white/10 opacity-55 hover:opacity-100'}`}>
                                <img src={f.lowSrc || f.src} alt="" className="w-full h-full object-cover" draggable={false} />
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Barra de herramientas ──
                En el móvil van en DOS filas: arriba lo que se hace con la foto
                (editar, y lo que ponga la pantalla), abajo los controles. En una
                sola fila no caben y lo importante quedaba fuera de pantalla. */}
            <div className="shrink-0 bg-black/80 border-t border-white/5 px-2 md:px-4 py-2.5">
                {(onEditar || acciones) && (
                    <div className="flex md:hidden items-center justify-center gap-2 pb-2 overflow-x-auto">
                        {onEditar && (
                            <Bot onClick={() => onEditar(foto, i)} title="Recortar y girar" ancho>
                                <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest"><Ico d={D.editar} className="w-4 h-4" />Editar</span>
                            </Bot>
                        )}
                        {acciones ? acciones(foto, i) : null}
                    </div>
                )}
                <div className="flex items-center gap-1.5 md:gap-2 overflow-x-auto">
                    <Bot onClick={() => zoomEn(1 / 1.35)} title="Alejar (−)" disabled={vista.k <= ZOOM_MIN}><Ico d={D.menos} /></Bot>
                    <button onClick={ajustar} title="Ajustar a la pantalla (0)"
                        className="h-11 px-3 shrink-0 rounded-xl bg-white/[0.07] text-white/70 hover:bg-white/15 hover:text-white text-[11px] font-black tabular-nums transition-all">
                        {pct}%
                    </button>
                    <Bot onClick={() => zoomEn(1.35)} title="Ampliar (+)" disabled={vista.k >= ZOOM_MAX}><Ico d={D.mas} /></Bot>
                    <Bot onClick={real} title="Tamaño real (1)" ancho clase="hidden md:flex"><span className="text-[11px] tracking-widest">1:1</span></Bot>

                    <span className="w-px h-7 bg-white/10 mx-0.5 shrink-0" />

                    <Bot onClick={() => girar(-90)} title="Girar a la izquierda (Mayús+R)"><Ico d={D.giroIzq} /></Bot>
                    <Bot onClick={() => girar(90)} title="Girar a la derecha (R)"><Ico d={D.giroDer} /></Bot>
                    <Bot onClick={() => setVista(v => ({ ...v, fx: v.fx * -1 }))} title="Voltear (H)" activo={vista.fx < 0}>
                        <span className="text-base">⇋</span>
                    </Bot>

                    <span className="w-px h-7 bg-white/10 mx-0.5 shrink-0" />

                    {total > 1 && <Bot onClick={() => setTira(t => !t)} title="Miniaturas" activo={tira}><Ico d={D.tiras} /></Bot>}
                    <Bot onClick={alternarPantalla} title="Pantalla completa (F)" activo={pantalla} clase="hidden md:flex"><Ico d={D.pantalla} /></Bot>
                    {(foto.descarga || foto.src) && (
                        <a href={foto.descarga || foto.src} download={foto.nombre || true} target="_blank" rel="noreferrer"
                            title="Descargar" aria-label="Descargar"
                            className="h-11 w-11 shrink-0 rounded-xl flex items-center justify-center bg-white/[0.07] text-white/70 hover:bg-white/15 hover:text-white transition-all">
                            <Ico d={D.descargar} />
                        </a>
                    )}
                    {onEditar && (
                        <Bot onClick={() => onEditar(foto, i)} title="Recortar y girar" ancho clase="hidden md:flex">
                            <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest"><Ico d={D.editar} className="w-4 h-4" />Editar</span>
                        </Bot>
                    )}

                    <span className="flex-1 min-w-[8px]" />

                    {acciones ? <div className="hidden md:flex items-center gap-2 shrink-0">{acciones(foto, i)}</div> : null}
                    <button onClick={() => setAyuda(a => !a)} title="Atajos de teclado"
                        className="hidden md:flex h-11 w-11 shrink-0 rounded-xl items-center justify-center bg-white/[0.04] text-white/35 hover:text-white text-sm font-black">?</button>
                </div>
                {pie ? <div className="mt-2">{pie}</div> : null}
                {ayuda && (
                    <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[10px] text-white/40 font-bold uppercase tracking-wider">
                        <span>← → pasar</span><span>+ − zoom</span><span>0 ajustar</span><span>1 tamaño real</span>
                        <span>R girar</span><span>Mayús+R girar al revés</span><span>H voltear</span><span>F pantalla completa</span><span>Esc cerrar</span>
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
}

export default VisorFotos;
