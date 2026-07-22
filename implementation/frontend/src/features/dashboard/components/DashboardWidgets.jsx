// ============================================================================
// DashboardWidgets.jsx — Piezas visuales del Cuadro de Mando.
//
// Gráficas en SVG/CSS a mano: el proyecto no lleva librería de charts y meter una
// por dos barras horizontales no compensa (peso + tema propio que pelear).
// ============================================================================
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { eur, energiaCorta } from '../logic/dashboardAgg';

// Comparación sin tildes ni mayúsculas: buscar "peseta" debe encontrar
// "INSTALACIONES PESETA" y "andres" debe encontrar "ANDRÉS".
const norm = s => (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Tailwind purga las clases construidas por interpolación, así que cada tono se
// escribe entero. El id coincide con `color` de FASES.
export const TONOS = {
    slate:   { texto: 'text-white/70',    suave: 'text-white/40',      borde: 'border-white/10',           fondo: 'bg-white/[0.03]',        barra: 'bg-white/25',      punto: 'bg-white/40' },
    amber:   { texto: 'text-amber-400',   suave: 'text-amber-400/50',  borde: 'border-amber-500/20',       fondo: 'bg-amber-500/[0.06]',    barra: 'bg-amber-500/70',  punto: 'bg-amber-400' },
    blue:    { texto: 'text-blue-400',    suave: 'text-blue-400/50',   borde: 'border-blue-500/20',        fondo: 'bg-blue-500/[0.06]',     barra: 'bg-blue-500/70',   punto: 'bg-blue-400' },
    violet:  { texto: 'text-violet-400',  suave: 'text-violet-400/50', borde: 'border-violet-500/20',      fondo: 'bg-violet-500/[0.06]',   barra: 'bg-violet-500/70', punto: 'bg-violet-400' },
    emerald: { texto: 'text-emerald-400', suave: 'text-emerald-400/50',borde: 'border-emerald-500/20',     fondo: 'bg-emerald-500/[0.06]',  barra: 'bg-emerald-500/70',punto: 'bg-emerald-400' },
    brand:   { texto: 'text-brand',       suave: 'text-brand/50',      borde: 'border-brand/20',           fondo: 'bg-brand/[0.06]',        barra: 'bg-brand/70',      punto: 'bg-brand' }
};

// ─── Avatar de partner ───────────────────────────────────────────────────────
// Logo de la empresa si lo tiene; si no, sus iniciales. Da un ancla visual para
// reconocer al instalador de un vistazo sin leer razones sociales larguísimas.
export function AvatarPartner({ logo, nombre, size = 20 }) {
    const iniciales = (nombre || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();
    const estilo = { width: size, height: size, fontSize: Math.round(size * 0.42) };
    if (logo) {
        return <img src={logo} alt="" style={estilo}
            className="rounded object-contain bg-white/90 border border-white/10 shrink-0" />;
    }
    return (
        <span style={estilo}
            className="rounded bg-brand/15 text-brand border border-brand/20 flex items-center justify-center font-black shrink-0">
            {iniciales}
        </span>
    );
}

// ─── Filtro desplegable con buscador y selección múltiple ────────────────────
// Sustituye al <select> nativo: con 38 instaladores hay que poder escribir para
// encontrarlos, y hace falta marcar varios a la vez (p.ej. dos instaladores).
// `value` es un Set; VACÍO significa "todos" (no hay opción "Todos" que marcar).
// El buscador solo aparece cuando la lista lo justifica.
export function FiltroBuscable({ label, value, onChange, opciones, umbralBusqueda = 8, etiquetaTodos = 'Todos' }) {
    const [abierto, setAbierto] = useState(false);
    const [query, setQuery] = useState('');
    const caja = useRef(null);
    const input = useRef(null);

    useEffect(() => {
        if (!abierto) return;
        const fuera = (e) => { if (caja.current && !caja.current.contains(e.target)) setAbierto(false); };
        const esc = (e) => { if (e.key === 'Escape') setAbierto(false); };
        document.addEventListener('mousedown', fuera);
        document.addEventListener('keydown', esc);
        input.current?.focus();
        return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', esc); };
    }, [abierto]);

    const buscable = opciones.length > umbralBusqueda;
    const visibles = useMemo(() => {
        if (!query.trim()) return opciones;
        const q = norm(query);
        return opciones.filter(o => norm(o.label).includes(q));
    }, [opciones, query]);

    const activo = value.size > 0;
    const unica = value.size === 1 ? opciones.find(o => value.has(o.value)) : null;
    const resumen = !activo ? etiquetaTodos : (unica ? unica.label : `${value.size} seleccionados`);

    const alternar = (v) => {
        const siguiente = new Set(value);
        if (siguiente.has(v)) siguiente.delete(v); else siguiente.add(v);
        onChange(siguiente);
    };

    return (
        <div className="flex flex-col gap-1 min-w-0" ref={caja}>
            <span className="text-[8px] font-black uppercase tracking-widest text-white/25 px-1">{label}</span>
            <div className="relative">
                <button
                    type="button"
                    onClick={() => { setAbierto(v => !v); setQuery(''); }}
                    aria-label={`${label}: ${resumen}`}
                    aria-expanded={abierto}
                    aria-haspopup="listbox"
                    className={`w-full flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[10px] font-black uppercase tracking-wider transition-colors border min-w-[108px] max-w-[190px] ${
                        activo ? 'bg-brand/10 border-brand/30 text-brand' : 'bg-bkg-deep border-white/[0.08] text-white hover:border-white/20'
                    }`}
                >
                    {unica?.logo !== undefined && unica && <AvatarPartner logo={unica.logo} nombre={unica.label} size={16} />}
                    <span className="truncate flex-1 text-left">{resumen}</span>
                    <svg className={`w-3 h-3 shrink-0 transition-transform ${abierto ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
                    </svg>
                </button>

                {abierto && (
                    <div className="absolute z-50 mt-1 w-[280px] max-w-[85vw] rounded-xl border border-white/10 bg-bkg-surface shadow-2xl overflow-hidden animate-fade-in">
                        {buscable && (
                            <div className="p-2 border-b border-white/[0.06]">
                                <input
                                    ref={input}
                                    value={query}
                                    onChange={e => setQuery(e.target.value)}
                                    placeholder="Escribe para buscar..."
                                    className="no-uppercase w-full bg-bkg-deep border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-[11px] text-white placeholder-white/25 focus:outline-none focus:border-brand/40"
                                />
                            </div>
                        )}
                        {/* El panel NO se cierra al marcar: la gracia de la multiselección
                            es encadenar varios clics sin tener que reabrirlo cada vez. */}
                        <div className="max-h-[280px] overflow-y-auto py-1">
                            {visibles.length === 0 && (
                                <p className="px-3 py-4 text-[10px] font-bold text-white/25 text-center">Sin resultados</p>
                            )}
                            {visibles.map(o => {
                                const marcado = value.has(o.value);
                                return (
                                    <button
                                        key={o.value}
                                        type="button"
                                        role="option"
                                        aria-selected={marcado}
                                        onClick={() => alternar(o.value)}
                                        className={`w-full flex items-center gap-2 px-3 py-2 text-left text-[11px] font-bold transition-colors ${
                                            marcado ? 'bg-brand/10 text-brand' : 'text-white/70 hover:bg-bkg-hover hover:text-white'
                                        }`}
                                    >
                                        <span className={`w-3.5 h-3.5 rounded shrink-0 border flex items-center justify-center transition-colors ${
                                            marcado ? 'bg-brand border-brand text-bkg-deep' : 'border-white/20'
                                        }`}>
                                            {marcado && (
                                                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" />
                                                </svg>
                                            )}
                                        </span>
                                        {o.logo !== undefined && <AvatarPartner logo={o.logo} nombre={o.label} size={20} />}
                                        <span className="truncate flex-1">{o.label}</span>
                                        {o.count != null && <span className="text-[9px] text-white/25 tabular-nums shrink-0">{o.count}</span>}
                                    </button>
                                );
                            })}
                        </div>
                        {activo && (
                            <button
                                type="button"
                                onClick={() => onChange(new Set())}
                                className="w-full px-3 py-2 text-[9px] font-black uppercase tracking-widest text-white/40 hover:text-brand border-t border-white/[0.06] transition-colors"
                            >
                                Quitar selección ({value.size})
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Tarjeta de KPI ──────────────────────────────────────────────────────────
// `composicion` (opcional): { pct, etiquetaFirme, etiquetaResto }. Es lo que
// distingue "de los 11,65 GWh totales, 6,22 son firmes" en vez de esconder esa
// relación en un texto diminuto — de un vistazo se ve la proporción, no hay que
// hacer la resta de cabeza para entender por qué las dos cifras no coinciden.
export function KpiCard({ label, valor, unidad, sub, tono = 'brand', icono, destacado = false, composicion }) {
    const t = TONOS[tono] || TONOS.brand;
    return (
        <div className={`relative overflow-hidden rounded-2xl border ${t.borde} ${t.fondo} p-4 sm:p-5 transition-all hover:border-white/20`}>
            <div className="flex items-start justify-between gap-3">
                <span className={`text-[9px] uppercase tracking-widest font-black ${t.suave} leading-tight`}>{label}</span>
                {icono && <div className={`${t.texto} opacity-60 shrink-0`}>{icono}</div>}
            </div>
            <div className="mt-2 flex items-baseline gap-1.5 flex-wrap">
                <span className={`${destacado ? 'text-3xl sm:text-4xl' : 'text-2xl sm:text-3xl'} font-black ${t.texto} leading-none tabular-nums`}>
                    {valor}
                </span>
                {unidad && <span className={`text-xs font-black ${t.suave}`}>{unidad}</span>}
            </div>
            {composicion && (
                <div className="mt-2.5" title={`${composicion.etiquetaFirme} · el resto (${composicion.etiquetaResto}) aún puede caerse`}>
                    <div className="h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden flex">
                        <div className={`h-full ${t.barra}`} style={{ width: `${Math.min(100, Math.max(0, composicion.pct))}%` }} />
                    </div>
                    <div className="flex items-center justify-between mt-1 text-[9px] font-bold">
                        <span className={t.texto}>{composicion.etiquetaFirme}</span>
                        <span className="text-white/25">{composicion.etiquetaResto}</span>
                    </div>
                </div>
            )}
            {sub && <p className="mt-2 text-[10px] text-white/30 font-bold leading-snug">{sub}</p>}
        </div>
    );
}

// ─── Embudo por fase ─────────────────────────────────────────────────────────
// Barras horizontales proporcionales a la facturación. Cada fila es clicable
// para filtrar por esa fase: el embudo es también el selector, y admite VARIAS
// a la vez (p.ej. "en ejecución" + "listo para lote") sumándolas en los totales.
// `faseSel` es un Set; vacío = sin filtro de fase.
export function EmbudoFases({ datos, faseSel, onToggleFase, mostrarBeneficio }) {
    const [abiertas, setAbiertas] = useState(() => new Set());
    const max = Math.max(...datos.map(d => d.facturacion), 1);

    const alternarAbierta = (id) => setAbiertas(prev => {
        const s = new Set(prev);
        if (s.has(id)) s.delete(id); else s.add(id);
        return s;
    });

    return (
        <div className="space-y-1.5">
            {datos.map(({ fase, count, mwh: mwhTotal, facturacion, profit, profitDisponible, subEstados = [], esCaptacion }) => {
                const t = TONOS[fase.color] || TONOS.slate;
                const activo = faseSel.has(fase.id);
                const abierta = abiertas.has(fase.id);
                const pct = Math.max((facturacion / max) * 100, count > 0 ? 1.5 : 0);
                const energia = energiaCorta(mwhTotal);
                // La captación son oportunidades, no expedientes: no filtra los KPIs,
                // solo se despliega para ver de qué está compuesta.
                const seleccionable = !esCaptacion && count > 0;

                return (
                    <div
                        key={fase.id}
                        className={`rounded-xl border transition-all ${
                            activo ? `${t.borde} ${t.fondo}` : abierta ? 'border-white/10 bg-bkg-hover/40' : 'border-transparent hover:bg-bkg-hover/60'
                        }`}
                    >
                        <div className="flex items-stretch">
                            <button
                                onClick={() => seleccionable ? onToggleFase(fase.id) : (count > 0 && alternarAbierta(fase.id))}
                                title={seleccionable
                                    ? `${fase.desc} — clic para ${activo ? 'quitar del' : 'añadir al'} filtro`
                                    : fase.desc}
                                aria-pressed={seleccionable ? activo : undefined}
                                disabled={count === 0}
                                className="flex-1 min-w-0 text-left px-3 py-2.5 group disabled:cursor-default"
                            >
                                <div className="flex items-center gap-3 mb-1.5">
                                    {seleccionable ? (
                                        activo ? (
                                            <span className={`w-3.5 h-3.5 rounded shrink-0 flex items-center justify-center ${t.barra}`}>
                                                <svg className="w-2.5 h-2.5 text-bkg-deep" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" />
                                                </svg>
                                            </span>
                                        ) : (
                                            <span className="w-3.5 h-3.5 rounded shrink-0 border border-white/15 group-hover:border-white/30 flex items-center justify-center">
                                                <span className={`w-1.5 h-1.5 rounded-full ${t.punto}`} />
                                            </span>
                                        )
                                    ) : (
                                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ml-1 ${t.punto}`} />
                                    )}
                                    <span className={`text-[10px] font-black uppercase tracking-widest ${activo ? t.texto : 'text-white/60'} truncate`}>
                                        {fase.label}
                                    </span>
                                    <span className="text-[10px] font-black text-white/25 tabular-nums shrink-0">{count}</span>
                                    <span className="flex-1" />
                                    <span className={`text-xs font-black tabular-nums ${activo ? t.texto : 'text-white/70'} shrink-0`}>
                                        {eur(facturacion)}
                                    </span>
                                </div>
                                <div className="h-1.5 w-full rounded-full bg-white/[0.04] overflow-hidden">
                                    <div className={`h-full rounded-full ${t.barra} transition-all duration-500`} style={{ width: `${pct}%` }} />
                                </div>
                                <div className="flex items-center gap-3 mt-1.5 text-[9px] font-bold text-white/25 tabular-nums">
                                    <span>{energia.valor} {energia.unidad}</span>
                                    {mostrarBeneficio && profitDisponible && (
                                        <span className="text-emerald-400/40">margen {eur(profit)}</span>
                                    )}
                                    {esCaptacion && <span className="text-white/20 normal-case">no suma a los totales</span>}
                                </div>
                            </button>

                            {/* Desplegar el detalle va aparte del filtro: son dos intenciones
                                distintas y mezclarlas obliga a elegir una de las dos. */}
                            {count > 0 && (
                                <button
                                    onClick={() => alternarAbierta(fase.id)}
                                    aria-expanded={abierta}
                                    aria-label={`${abierta ? 'Ocultar' : 'Ver'} el detalle de ${fase.label}`}
                                    title={`${abierta ? 'Ocultar' : 'Ver'} en qué situación están`}
                                    className="px-2.5 flex items-center text-white/20 hover:text-brand transition-colors"
                                >
                                    <svg className={`w-3.5 h-3.5 transition-transform ${abierta ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </button>
                            )}
                        </div>

                        {abierta && (
                            <div className="px-3 pb-2.5 pt-1 space-y-0.5 animate-fade-in">
                                {subEstados.map(s => {
                                    const e = energiaCorta(s.mwh);
                                    return (
                                        // <a target="_blank">, no onClick+window.open: un enlace real
                                        // nunca lo frena un bloqueador de popups y da gratis el clic
                                        // central / Ctrl+clic / "abrir en pestaña nueva" del navegador.
                                        <a
                                            key={s.estado}
                                            href={s.href}
                                            target="_blank"
                                            rel="noopener"
                                            title={`Ver ${esCaptacion ? 'las oportunidades' : 'los expedientes'} en «${s.estado}»`}
                                            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-bkg-hover text-left group/sub transition-colors"
                                        >
                                            <span className="w-1 h-1 rounded-full bg-white/20 shrink-0" />
                                            <span className="text-[9px] font-black uppercase tracking-wider text-white/45 truncate flex-1 min-w-0 group-hover/sub:text-white/80 transition-colors">
                                                {s.estado}
                                            </span>
                                            <span className="text-[9px] font-black text-white/25 tabular-nums shrink-0">{s.count}</span>
                                            <span className="text-[9px] font-bold text-white/25 tabular-nums shrink-0 w-16 text-right">{e.valor} {e.unidad}</span>
                                            <span className="text-[9px] font-black text-white/50 tabular-nums shrink-0 w-[72px] text-right">{eur(s.facturacion)}</span>
                                            <svg className="w-3 h-3 text-white/10 group-hover/sub:text-brand transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
                                            </svg>
                                        </a>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

// ─── Bandeja "requiere tu atención" ──────────────────────────────────────────
// Lo que convierte el panel en pantalla de inicio: no dice cuánto hay, dice qué
// hacer hoy. Cada aviso con destino navega a su listado ya filtrado (en pestaña
// nueva); los que no tienen filtro equivalente en el listado se muestran igual
// pero sin flecha, para no prometer una navegación que no existe.
export function BandejaAccion({ avisos }) {
    const vivos = avisos.filter(a => a.count > 0);

    if (!vivos.length) {
        return (
            <div className="py-8 text-center">
                <div className="w-9 h-9 mx-auto mb-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                    <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                </div>
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400/60">Nada pendiente</p>
                <p className="text-[9px] font-bold text-white/20 mt-1">Con los filtros actuales no hay avisos.</p>
            </div>
        );
    }

    return (
        <div className="space-y-1">
            {vivos.map(a => {
                const t = TONOS[a.tono] || TONOS.slate;
                const Cuerpo = (
                    <>
                        <span className={`w-6 h-6 rounded-lg shrink-0 flex items-center justify-center ${t.fondo} ${t.texto}`}>
                            {a.icono}
                        </span>
                        <span className={`text-base font-black tabular-nums shrink-0 ${t.texto}`}>{a.count}</span>
                        <span className="flex-1 min-w-0">
                            <span className="block text-[10px] font-black uppercase tracking-wider text-white/70 truncate">{a.titulo}</span>
                            {a.detalle && <span className="block text-[9px] font-bold text-white/25 truncate">{a.detalle}</span>}
                        </span>
                        {a.href && (
                            <svg className="w-3.5 h-3.5 text-white/15 group-hover:text-brand transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
                            </svg>
                        )}
                    </>
                );
                const clases = `w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl border ${t.borde} ${t.fondo} transition-all`;
                return a.href ? (
                    <a key={a.id} href={a.href} target="_blank" rel="noopener"
                       title={a.ayuda} className={`${clases} hover:brightness-125 group`}>
                        {Cuerpo}
                    </a>
                ) : (
                    <div key={a.id} title={a.ayuda} className={clases}>{Cuerpo}</div>
                );
            })}
        </div>
    );
}

// ─── Ranking horizontal ──────────────────────────────────────────────────────
// Para "por año", "por CCAA", "por instalador"… Muestra el top y resume el resto.
export function Ranking({ datos, limite = 6, vacio = 'Sin datos' }) {
    if (!datos.length) {
        return <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest py-6 text-center">{vacio}</p>;
    }
    const top = datos.slice(0, limite);
    const resto = datos.slice(limite);
    const max = Math.max(...top.map(d => d.facturacion), 1);
    return (
        <div className="space-y-2.5">
            {top.map(d => (
                <div key={d.key}>
                    <div className="flex items-center gap-2 mb-1">
                        {d.logo !== undefined && <AvatarPartner logo={d.logo} nombre={d.label} size={18} />}
                        <span className="text-[10px] font-black text-white/70 truncate flex-1" title={d.label}>{d.label}</span>
                        <span className="text-[9px] font-bold text-white/25 tabular-nums shrink-0">{d.count}</span>
                        <span className="text-[10px] font-black text-white/60 tabular-nums shrink-0">{eur(d.facturacion)}</span>
                    </div>
                    <div className="h-1 w-full rounded-full bg-white/[0.04] overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-brand to-brand-700 transition-all duration-500"
                             style={{ width: `${Math.max((d.facturacion / max) * 100, 1.5)}%` }} />
                    </div>
                </div>
            ))}
            {resto.length > 0 && (
                <p className="text-[9px] font-bold text-white/20 uppercase tracking-widest pt-1">
                    +{resto.length} más · {eur(resto.reduce((s, d) => s + d.facturacion, 0))}
                </p>
            )}
        </div>
    );
}

// ─── Contenedor de sección ───────────────────────────────────────────────────
export function Panel({ titulo, accion, children, className = '' }) {
    return (
        <div className={`rounded-2xl border border-white/[0.06] bg-bkg-surface/60 p-4 sm:p-5 shadow-xl ${className}`}>
            <div className="flex items-center justify-between gap-3 mb-4">
                <h2 className="text-[10px] font-black uppercase tracking-widest text-white/40">{titulo}</h2>
                {accion}
            </div>
            {children}
        </div>
    );
}
