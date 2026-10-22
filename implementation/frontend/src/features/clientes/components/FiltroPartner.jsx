import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LogoEmpresa } from '../../../components/LogoEmpresa';

// ─────────────────────────────────────────────────────────────────────────────
// Filtro de PARTNER del listado de Clientes: botón compacto (como los chips de
// Estado y Tipo) que abre un desplegable con BUSCADOR, el LOGO de cada empresa
// y cuántos clientes saldrían al elegirla con los otros filtros como están.
//
// Sustituye a un <select> nativo con ~50 empresas en mayúsculas donde había que
// bajar leyendo hasta dar con la buena. Se busca sin tildes y por palabras
// sueltas, en acrónimo y razón social a la vez ("porrero ism").
// Se ordena por nombre o por nº de clientes; las que se quedarían a CERO con los
// filtros actuales se atenúan y van al final, pero no se esconden.
// La lista se portalea a `body` (regla 29.b): la barra de filtros vive encima de
// un contenedor con scroll.
// ─────────────────────────────────────────────────────────────────────────────

const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const ANCHO = 360;

function IconoDirecto({ size = 28 }) {
    return (
        <span style={{ width: size, height: size }}
            className="shrink-0 rounded-md flex items-center justify-center bg-white/[0.04] border border-dashed border-white/15 text-white/40">
            <svg style={{ width: size * 0.55, height: size * 0.55 }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
        </span>
    );
}

/**
 * @param {Array<{id, label, razon, count}>} opciones   partners (y «Directo»)
 * @param {string|null} value                           id elegido (null = todos)
 * @param {(id: string|null) => void} onChange
 * @param {Record<string,string>} logos                 id -> miniatura
 * @param {number} total                                clientes con «Todos»
 * @param {string} idDirecto                            id de la opción «sin partner»
 */
export function FiltroPartner({ opciones, value, onChange, logos = {}, total = 0, idDirecto }) {
    const [abierto, setAbierto] = useState(false);
    const [consulta, setConsulta] = useState('');
    const [orden, setOrden] = useState('nombre'); // 'nombre' | 'clientes'
    const [activo, setActivo] = useState(0);
    const [rect, setRect] = useState(null);
    const boton = useRef(null);
    const panel = useRef(null);
    const lista = useRef(null);

    // El filtro se recuerda entre visitas: si el partner guardado ya no tiene
    // clientes, se dice (con su ✕ al lado) en vez de enseñar «Todos» con la
    // lista vacía.
    const elegido = opciones.find(o => o.id === value) || (value ? { id: value, label: 'Partner sin clientes', count: 0 } : null);

    const visibles = useMemo(() => {
        const palabras = norm(consulta).split(/\s+/).filter(Boolean);
        const pasa = (o) => {
            if (!palabras.length) return true;
            const heno = norm(`${o.label} ${o.razon || ''} ${o.id === idDirecto ? 'directo sin partner brokergy' : ''}`);
            return palabras.every(w => heno.includes(w));
        };
        const directo = opciones.find(o => o.id === idDirecto);
        const resto = opciones.filter(o => o.id !== idDirecto && pasa(o)).sort((a, b) =>
            (!a.count) - (!b.count)
            || (orden === 'clientes' ? b.count - a.count : 0)
            || a.label.localeCompare(b.label, 'es'));
        // «Todos» y «Directo» arriba, siempre que la búsqueda no los descarte.
        return [
            ...(!palabras.length ? [{ id: null, label: 'Todos los partners', count: total }] : []),
            ...(directo && pasa(directo) ? [directo] : []),
            ...resto,
        ];
    }, [opciones, consulta, orden, total, idDirecto]);

    const abrir = () => {
        setRect(boton.current?.getBoundingClientRect() || null);
        setConsulta('');
        setAbierto(true);
    };
    const cerrar = () => setAbierto(false);
    const elegir = (id) => { onChange(id); cerrar(); };

    // Al abrir, el cursor se pone en lo elegido.
    useEffect(() => {
        if (!abierto) return;
        const i = visibles.findIndex(o => o.id === value);
        setActivo(i >= 0 ? i : 0);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [abierto]);
    useEffect(() => { if (abierto) setActivo(0); }, [consulta]); // eslint-disable-line react-hooks/exhaustive-deps

    // Cerrar al clicar fuera, al redimensionar o si la página se desplaza (la
    // lista es fija y se quedaría flotando lejos de su botón).
    useEffect(() => {
        if (!abierto) return;
        const fuera = (e) => {
            if (!panel.current?.contains(e.target) && !boton.current?.contains(e.target)) cerrar();
        };
        const alScroll = (e) => { if (!panel.current?.contains(e.target)) cerrar(); };
        document.addEventListener('mousedown', fuera);
        window.addEventListener('resize', cerrar);
        window.addEventListener('scroll', alScroll, true);
        return () => {
            document.removeEventListener('mousedown', fuera);
            window.removeEventListener('resize', cerrar);
            window.removeEventListener('scroll', alScroll, true);
        };
    }, [abierto]);

    useEffect(() => {
        if (!abierto) return;
        lista.current?.querySelector(`[data-i="${activo}"]`)?.scrollIntoView({ block: 'nearest' });
    }, [activo, abierto]);

    const teclas = (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); setActivo(i => Math.min(visibles.length - 1, i + 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActivo(i => Math.max(0, i - 1)); }
        else if (e.key === 'Enter') { e.preventDefault(); if (visibles[activo]) elegir(visibles[activo].id); }
        else if (e.key === 'Escape') { e.preventDefault(); cerrar(); boton.current?.focus(); }
    };

    const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
    const ancho = Math.min(ANCHO, vw - 32);
    const izq = rect ? Math.max(16, Math.min(rect.left, vw - ancho - 16)) : 16;
    const arriba = rect ? rect.bottom + 6 : 0;
    const alto = Math.max(220, Math.min(420, vh - arriba - 16));

    const desplegable = abierto && rect && (
        <div ref={panel} onKeyDown={teclas}
            style={{ position: 'fixed', top: arriba, left: izq, width: ancho, maxHeight: alto }}
            className="z-[9000] flex flex-col bg-bkg-surface border border-white/10 rounded-2xl shadow-2xl shadow-black/60 overflow-hidden animate-fade-in">
            <div className="p-2.5 border-b border-white/[0.06] flex items-center gap-2">
                <div className="relative flex-1">
                    <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input autoFocus type="text" value={consulta} onChange={e => setConsulta(e.target.value)}
                        placeholder="Buscar partner…"
                        className="w-full bg-bkg-deep/60 border border-white/[0.08] rounded-lg pl-8 pr-2 py-1.5 text-xs text-white placeholder:text-white/25 focus:outline-none focus:border-brand/50" />
                </div>
                <div className="flex rounded-lg border border-white/[0.08] overflow-hidden text-[9px] font-black uppercase tracking-widest shrink-0">
                    {[['nombre', 'A–Z'], ['clientes', 'Nº']].map(([k, t]) => (
                        <button key={k} type="button" onClick={() => setOrden(k)}
                            title={k === 'nombre' ? 'Ordenar por nombre' : 'Ordenar por nº de clientes'}
                            className={`px-2 py-1.5 transition-colors ${orden === k ? 'bg-brand/15 text-brand' : 'text-white/35 hover:text-white/70'}`}>
                            {t}
                        </button>
                    ))}
                </div>
            </div>

            <div ref={lista} className="overflow-y-auto custom-scrollbar p-1.5">
                {visibles.map((o, i) => {
                    const sel = o.id === value;
                    return (
                        <button key={o.id ?? '__todos__'} type="button" data-i={i}
                            onMouseEnter={() => setActivo(i)} onClick={() => elegir(o.id)}
                            className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-xl text-left transition-colors border ${
                                sel ? 'bg-brand/10 border-brand/25' : i === activo ? 'bg-white/[0.05] border-transparent' : 'border-transparent'
                            } ${o.count ? '' : 'opacity-40'}`}>
                            {o.id === null ? (
                                <span className="w-7 h-7 shrink-0 rounded-md flex items-center justify-center bg-brand/10 border border-brand/20 text-brand">
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                                    </svg>
                                </span>
                            ) : o.id === idDirecto ? <IconoDirecto /> : (
                                <LogoEmpresa logo={logos[o.id] || null} nombre={o.label} size={28} />
                            )}
                            <span className="flex-1 min-w-0">
                                <span className={`block text-[11px] font-black uppercase tracking-tight truncate ${sel ? 'text-brand' : 'text-white/85'}`}>{o.label}</span>
                                {o.razon && norm(o.razon) !== norm(o.label) && (
                                    <span className="block text-[9px] text-white/30 uppercase truncate">{o.razon}</span>
                                )}
                            </span>
                            <span className={`shrink-0 min-w-[26px] text-center px-1.5 py-0.5 rounded-md text-[10px] font-black tabular-nums ${
                                sel ? 'bg-brand/20 text-brand' : 'bg-white/[0.05] text-white/45'}`}>
                                {o.count || 0}
                            </span>
                            {sel && (
                                <svg className="w-3.5 h-3.5 text-brand shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                            )}
                        </button>
                    );
                })}
                {visibles.length === 0 && (
                    <p className="py-8 text-center text-white/25 text-[10px] font-bold uppercase tracking-widest">Ningún partner coincide</p>
                )}
            </div>
        </div>
    );

    return (
        <div className="flex items-center">
            <button ref={boton} type="button" onClick={() => (abierto ? cerrar() : abrir())}
                onKeyDown={e => { if (!abierto && (e.key === 'ArrowDown' || e.key === 'Enter')) { e.preventDefault(); abrir(); } }}
                title={elegido ? (elegido.razon || elegido.label) : 'Filtrar por partner'}
                className={`flex items-center gap-1.5 pl-1 pr-2 py-[3px] border text-[10px] font-black uppercase tracking-widest transition-all max-w-[260px] ${
                    elegido ? 'rounded-l-lg bg-brand/15 text-brand border-brand/40' : 'rounded-lg bg-white/[0.02] text-white/50 border-white/[0.06] hover:text-white/80 hover:border-white/20'
                } ${abierto ? 'ring-1 ring-brand/40' : ''}`}>
                {elegido ? (
                    elegido.id === idDirecto ? <IconoDirecto size={18} /> : <LogoEmpresa logo={logos[elegido.id] || null} nombre={elegido.label} size={18} />
                ) : (
                    <span className="w-[18px] h-[18px] shrink-0 rounded-md flex items-center justify-center bg-white/[0.05] text-white/40">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                    </span>
                )}
                <span className="truncate">{elegido ? elegido.label : 'Todos'}</span>
                {elegido && <span className="opacity-60 tabular-nums">{elegido.count || 0}</span>}
                <svg className={`w-3 h-3 shrink-0 opacity-60 transition-transform ${abierto ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                </svg>
            </button>
            {elegido && (
                <button type="button" onClick={() => onChange(null)} title="Quitar el filtro de partner"
                    className="px-1.5 py-[3px] rounded-r-lg border border-l-0 border-brand/40 bg-brand/15 text-brand/70 hover:text-brand text-[10px] font-black">
                    ✕
                </button>
            )}
            {typeof document !== 'undefined' && desplegable ? createPortal(desplegable, document.body) : null}
        </div>
    );
}

export default FiltroPartner;
