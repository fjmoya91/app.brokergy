import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useIsMobile } from '../../../utils/useIsMobile';
import { telefonoDe, emailDe } from '../../../utils/contactoPrescriptor';

// ─────────────────────────────────────────────────────────────────────────────
// Selector del TÉCNICO CERTIFICADOR de un expediente.
//
// Dos caras del mismo control, porque asignar técnico se hace en dos sitios muy
// distintos:
//
//  · ESCRITORIO — el desplegable compacto de siempre, dentro de la fila de
//    cabecera del módulo CEE. Se conserva BYTE-IDÉNTICO (mismas clases, mismo
//    portal a body, misma altura): la regla de oro de la adaptación móvil de
//    este CRM es que el escritorio no cambia.
//
//  · MÓVIL — el desplegable no valía: vivía en una fila de `flex` sin envolver
//    junto al título y dos grupos de pestañas, así que quedaba EMPUJADO FUERA de
//    la pantalla (el módulo recorta con overflow-hidden, o sea que ni siquiera se
//    podía arrastrar hasta él). Aquí pasa a ser una tarjeta a todo el ancho con
//    el técnico a la vista, y el buscador se abre como hoja inferior a pantalla
//    completa — el mismo patrón del envío en bloque de Seguimiento: cabecera
//    fija, un solo eje de scroll y área segura del iPhone.
//
// El teléfono y el email van EN LA FILA de cada técnico, no escondidos: se elige
// certificador por zona y por quién coge el teléfono, y desde el móvil lo
// siguiente que se hace es llamarle.
// ─────────────────────────────────────────────────────────────────────────────

const norm = (s) => (s || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// Coincide si TODAS las palabras escritas aparecen en algún campo del técnico:
// así "lanuza cr" encuentra "LANUZA CERTIFICACIONES · CIUDAD REAL". Mismo
// criterio que el picker de partners, para que buscar se comporte igual en toda
// la app.
const coincide = (c, consulta) => {
    const palabras = norm(consulta).split(/\s+/).filter(Boolean);
    if (!palabras.length) return true;
    const heno = norm([c.acronimo, c.razon_social, c.cif, c.municipio, c.provincia].filter(Boolean).join(' '));
    return palabras.every(w => heno.includes(w));
};

const nombreDe = (c) => c?.razon_social || c?.acronimo || 'Sin nombre';

function Logo({ c, size = 'w-9 h-9' }) {
    return c?.logo_empresa ? (
        <img src={c.logo_empresa} alt="" className={`${size} rounded-lg object-contain bg-white/5 shrink-0`} />
    ) : (
        <div className={`${size} rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0`}>
            <span className="text-sm font-black text-white/25">{nombreDe(c).charAt(0).toUpperCase()}</span>
        </div>
    );
}

// ─── Escritorio: el desplegable de siempre ───────────────────────────────────
function DesktopSelect({ value, onChange, options, placeholder, disabled }) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [coords, setCoords] = useState(null); // posición fixed del menú (portal)
    const containerRef = useRef(null);
    const inputRef = useRef(null);
    const menuRef = useRef(null);

    const selected = options.find(o => String(o.value) === String(value));
    const filtered = query
        ? options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()))
        : options;

    // Cierra al hacer click fuera del botón Y fuera del menú (que vive en un portal a body).
    useEffect(() => {
        const handler = (e) => {
            if (containerRef.current?.contains(e.target)) return;
            if (menuRef.current?.contains(e.target)) return;
            setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Calcula la posición del menú respecto al viewport (position:fixed). Como el menú
    // se renderiza en un portal a document.body, ningún overflow/z-index de los paneles
    // padre lo puede recortar ni tapar. Abre hacia abajo, o hacia arriba si no hay sitio.
    useEffect(() => {
        if (!open) return;
        const update = () => {
            const r = containerRef.current?.getBoundingClientRect();
            if (!r) return;
            const MENU_H = 300;
            const spaceBelow = window.innerHeight - r.bottom;
            const openUp = spaceBelow < MENU_H && r.top > spaceBelow;
            setCoords({
                left: r.left,
                width: Math.max(r.width, 240),
                top: openUp ? undefined : r.bottom + 4,
                bottom: openUp ? (window.innerHeight - r.top + 4) : undefined,
            });
        };
        update();
        window.addEventListener('scroll', update, true);
        window.addEventListener('resize', update);
        return () => {
            window.removeEventListener('scroll', update, true);
            window.removeEventListener('resize', update);
        };
    }, [open]);

    const handleOpen = () => {
        if (disabled) return;
        setQuery('');
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 0);
    };

    const handleSelect = (optValue) => {
        onChange(optValue);
        setOpen(false);
    };

    return (
        <div ref={containerRef} className="relative">
            <button
                type="button"
                onClick={handleOpen}
                disabled={disabled}
                className={`w-full flex items-center justify-between bg-white/[0.03] border rounded-xl px-4 py-2 text-[10px] font-black uppercase outline-none transition-all text-left ${
                    disabled
                        ? 'border-white/10 text-white/40 cursor-not-allowed'
                        : 'border-brand/30 text-brand cursor-pointer hover:border-brand/50'
                }`}
            >
                <span className="truncate">{selected ? selected.label : placeholder}</span>
                <svg className={`w-3 h-3 ml-2 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {open && coords && createPortal(
                <div
                    ref={menuRef}
                    style={{
                        position: 'fixed',
                        left: coords.left,
                        width: coords.width,
                        top: coords.top,
                        bottom: coords.bottom,
                        zIndex: 9999,
                    }}
                    className="bg-bkg-elevated border border-white/10 rounded-xl shadow-2xl overflow-hidden"
                >
                    <div className="p-2 border-b border-white/5">
                        <input
                            ref={inputRef}
                            type="text"
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder="Buscar certificador..."
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-white/30 outline-none focus:border-brand/40"
                        />
                    </div>
                    <ul className="max-h-48 overflow-y-auto">
                        <li
                            onClick={() => handleSelect('')}
                            className="px-4 py-2 text-[10px] font-black uppercase text-white/30 hover:bg-white/5 cursor-pointer tracking-widest"
                        >
                            {placeholder}
                        </li>
                        {filtered.length === 0 && (
                            <li className="px-4 py-2 text-[10px] text-white/20 italic">Sin resultados</li>
                        )}
                        {filtered.map(o => (
                            <li
                                key={o.value}
                                onClick={() => handleSelect(o.value)}
                                className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest cursor-pointer transition-colors ${
                                    String(value) === String(o.value)
                                        ? 'bg-brand/20 text-brand'
                                        : 'text-white/70 hover:bg-white/5'
                                }`}
                            >
                                {o.label}
                            </li>
                        ))}
                    </ul>
                </div>,
                document.body
            )}
        </div>
    );
}

// ─── Móvil: tarjeta + hoja inferior ──────────────────────────────────────────
function MobileSheet({ certificadores, value, onChange, onClose }) {
    const [consulta, setConsulta] = useState('');
    const filtrados = useMemo(
        () => certificadores.filter(c => coincide(c, consulta)),
        [certificadores, consulta]
    );

    const elegir = (id) => { onChange(id); onClose(); };

    return createPortal(
        // No se cierra al tocar fuera por accidente: el gesto de desplazar la lista
        // roza el borde constantemente. Se cierra con la X o con "Sin técnico".
        <div className="fixed inset-0 z-[900] bg-black/75 backdrop-blur-sm flex items-end justify-center">
            <div className="w-full bg-bkg-surface border-t border-white/10 rounded-t-3xl shadow-2xl h-[88dvh] flex flex-col overflow-hidden">
                <div className="shrink-0 flex items-start gap-3 px-4 pt-4 pb-3 border-b border-white/[0.06]">
                    <div className="flex-1 min-w-0">
                        <h2 className="text-[15px] font-black text-white leading-tight">Asignar técnico</h2>
                        <p className="text-[11px] font-bold text-brand mt-0.5">
                            {certificadores.length} certificador{certificadores.length === 1 ? '' : 'es'} en la agenda
                        </p>
                    </div>
                    <button onClick={onClose} aria-label="Cerrar"
                        className="shrink-0 w-10 h-10 -mt-1 -mr-1 rounded-xl text-white/35 active:bg-white/5 flex items-center justify-center">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                <div className="shrink-0 px-4 py-3 border-b border-white/[0.06]">
                    <div className="relative">
                        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input
                            type="text"
                            value={consulta}
                            onChange={e => setConsulta(e.target.value)}
                            placeholder="Buscar por nombre, CIF o provincia…"
                            className="w-full bg-bkg-deep border border-white/10 rounded-xl pl-9 pr-3 py-3 text-base text-white placeholder:text-white/25 focus:outline-none focus:border-brand/50"
                        />
                    </div>
                </div>

                {/* UN solo eje de scroll: las filas no llevan altura propia. */}
                <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-3 space-y-1.5">
                    {filtrados.map(c => {
                        const elegido = String(value) === String(c.id_empresa);
                        const tel = telefonoDe(c);
                        const mail = emailDe(c);
                        return (
                            <button
                                key={c.id_empresa}
                                type="button"
                                onClick={() => elegir(c.id_empresa)}
                                className={`w-full flex items-center gap-3 p-3 rounded-2xl text-left border transition-all active:scale-[0.99] ${
                                    elegido ? 'border-brand bg-brand/10' : 'border-white/[0.06] bg-white/[0.02]'
                                }`}
                            >
                                <Logo c={c} />
                                <span className="flex-1 min-w-0">
                                    <span className="block text-[13px] font-black text-white leading-tight break-words">
                                        {nombreDe(c)}
                                    </span>
                                    <span className="block text-[11px] text-white/35 truncate normal-case mt-0.5">
                                        {[tel, mail].filter(Boolean).join(' · ') || 'Sin teléfono ni email en su ficha'}
                                    </span>
                                </span>
                                {elegido && (
                                    <svg className="w-5 h-5 text-brand shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                    </svg>
                                )}
                            </button>
                        );
                    })}
                    {filtrados.length === 0 && (
                        <p className="p-8 text-center text-white/20 text-xs italic uppercase tracking-widest">
                            Ningún técnico coincide
                        </p>
                    )}
                </div>

                <div className="shrink-0 px-4 pt-3 border-t border-white/[0.06]"
                    style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}>
                    <button
                        type="button"
                        onClick={() => elegir('')}
                        className="w-full py-3 rounded-xl border border-white/10 text-white/45 font-bold text-[11px] uppercase tracking-wider active:bg-white/5"
                    >
                        Dejar sin técnico asignado
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}

export function TecnicoPicker({ certificadores = [], value, onChange, disabled = false }) {
    const isMobile = useIsMobile();
    const [abierto, setAbierto] = useState(false);

    const seleccionado = useMemo(
        () => certificadores.find(c => String(c.id_empresa) === String(value)) || null,
        [certificadores, value]
    );

    if (!isMobile) {
        return (
            <DesktopSelect
                value={value || ''}
                onChange={onChange}
                disabled={disabled}
                placeholder="Certificador no asignado"
                options={certificadores.map(c => ({ value: c.id_empresa, label: c.razon_social || c.acronimo }))}
            />
        );
    }

    const tel = telefonoDe(seleccionado);
    const mail = emailDe(seleccionado);

    return (
        <>
            <button
                type="button"
                disabled={disabled}
                onClick={() => setAbierto(true)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border text-left transition-all min-h-[60px] active:scale-[0.99] ${
                    disabled ? 'border-white/10 opacity-50'
                        : seleccionado ? 'border-brand/40 bg-brand/[0.06]' : 'border-dashed border-brand/40 bg-brand/[0.04]'
                }`}
            >
                {seleccionado ? <Logo c={seleccionado} size="w-9 h-9" /> : (
                    <div className="w-9 h-9 rounded-lg bg-brand/10 border border-brand/20 flex items-center justify-center shrink-0">
                        <svg className="w-[18px] h-[18px] text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                    </div>
                )}
                <span className="flex-1 min-w-0">
                    <span className="block text-[9px] font-black uppercase tracking-[0.2em] text-white/30 leading-none mb-1">
                        Técnico certificador
                    </span>
                    <span className={`block text-[13px] font-black leading-tight break-words ${seleccionado ? 'text-white' : 'text-brand'}`}>
                        {seleccionado ? nombreDe(seleccionado) : 'Sin asignar · toca para asignar'}
                    </span>
                </span>
                <svg className="w-4 h-4 text-white/25 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                </svg>
            </button>

            {/* Ya asignado: lo siguiente desde el móvil es llamarle o escribirle. */}
            {seleccionado && (tel || mail) && (
                <div className="flex gap-2 mt-2">
                    {tel && (
                        <a href={`tel:${tel}`}
                            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-white/10 text-white/60 text-[11px] font-bold active:bg-white/5">
                            📞 <span className="truncate normal-case">{tel}</span>
                        </a>
                    )}
                    {mail && (
                        <a href={`mailto:${mail}`}
                            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-white/10 text-white/60 text-[11px] font-bold active:bg-white/5">
                            ✉️ <span className="truncate normal-case">{mail}</span>
                        </a>
                    )}
                </div>
            )}

            {abierto && (
                <MobileSheet
                    certificadores={certificadores}
                    value={value}
                    onChange={onChange}
                    onClose={() => setAbierto(false)}
                />
            )}
        </>
    );
}

export default TecnicoPicker;
