import { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../../../context/AuthContext';
import { NuevoCeeDirectoModal } from '../components/NuevoCeeDirectoModal';
import { CeeDirectoDetailView } from './CeeDirectoDetailView';

// ─────────────────────────────────────────────────────────────────────────────
// CEE directos — los certificados que nos contratan sueltos, fuera del CAE.
//
// El listado responde a una pregunta: ¿de quién es la pelota y desde cuándo?
// Por eso la columna que más pesa no es el estado sino el RESPONSABLE y los días
// parado. Un listado ordenado por número es un archivo; ordenado por lo que está
// esperando, es una cola de trabajo.
// ─────────────────────────────────────────────────────────────────────────────

const API = '/api/cee-directos';

// Búsqueda insensible a tildes (mismo criterio que el resto de buscadores).
const norm = (s) => (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const diasDesde = (iso) => {
    if (!iso) return null;
    const ms = Date.now() - new Date(iso).getTime();
    return ms > 0 ? Math.floor(ms / 86400000) : 0;
};

/**
 * Cuánto lleva parado en su fase actual. Sale del sello `*_desde` que pone
 * `seguimientoTracking` en cada transición — no de `updated_at`, que se mueve
 * con cualquier retoque y diría "0 días" en un expediente parado desde marzo.
 */
const diasParado = (row) => {
    const key = row.fase_activa === 'final' ? 'cee_final_desde' : 'cee_inicial_desde';
    return diasDesde(row.seguimiento?.[key]);
};

const COLOR_ESTADO = (estado) => {
    if (estado === 'FINALIZADO') return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    if (estado.startsWith('PENDIENTE REVISIÓN')) return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    if (estado.startsWith('REVISADO')) return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    if (estado.startsWith('EN ')) return 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20';
    return 'bg-white/[0.04] text-white/45 border-white/10';
};

const Pastilla = ({ children, className = '' }) => (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border whitespace-nowrap ${className}`}>
        {children}
    </span>
);

export function CeeDirectosView({ initialSelectedId = null, onClearInitialSelection }) {
    const { user } = useAuth();
    const rol = (user?.rol || user?.rol_nombre || '').toUpperCase();
    const isStaff = rol === 'ADMIN' || rol === 'TRABAJADOR';

    const [filas, setFilas] = useState([]);
    const [prescriptores, setPrescriptores] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [busqueda, setBusqueda] = useState('');
    // Por defecto se esconde lo terminado: son 28 de 55 y entrar a la pestaña
    // para ver primero el trabajo cerrado de 2024 es empezar por el final.
    const [verFinalizados, setVerFinalizados] = useState(false);
    const [filtroPrescriptor, setFiltroPrescriptor] = useState('');
    const [showNuevo, setShowNuevo] = useState(false);
    const [seleccionado, setSeleccionado] = useState(initialSelectedId);

    const cargar = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await axios.get(API);
            setFilas(data || []);
            setError(null);
        } catch (err) {
            setError(err.response?.data?.error || 'No se pudo cargar el listado.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { cargar(); }, [cargar]);

    // Llegada por `?cee=<id>` (enlace de un mensaje o salto desde el cliente): se
    // abre esa ficha y se consume, para que no vuelva a abrirse al navegar.
    useEffect(() => {
        if (!initialSelectedId) return;
        setSeleccionado(initialSelectedId);
        onClearInitialSelection?.();
    }, [initialSelectedId, onClearInitialSelection]);

    useEffect(() => {
        if (!isStaff) return;
        axios.get('/api/prescriptores').then(r => setPrescriptores(r.data || [])).catch(() => setPrescriptores([]));
    }, [isStaff]);

    const visibles = useMemo(() => {
        const palabras = norm(busqueda).split(/\s+/).filter(Boolean);
        return filas.filter(r => {
            if (!verFinalizados && r.estado === 'FINALIZADO') return false;
            if (filtroPrescriptor && String(r.prescriptor_id) !== filtroPrescriptor) return false;
            if (!palabras.length) return true;
            const heno = norm([r.numero_expediente, r.nombre, r.cliente_nombre, r.municipio, r.certificador_nombre, r.prescriptor_nombre].filter(Boolean).join(' '));
            return palabras.every(w => heno.includes(w));
        });
    }, [filas, busqueda, verFinalizados, filtroPrescriptor]);

    const finalizados = useMemo(() => filas.filter(r => r.estado === 'FINALIZADO').length, [filas]);

    if (seleccionado) {
        return (
            <CeeDirectoDetailView
                id={seleccionado}
                onBack={() => { setSeleccionado(null); cargar(); }}
            />
        );
    }

    return (
        <div className="pb-16">
            {/* ── Cabecera ───────────────────────────────────────────────── */}
            <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-lg md:text-xl font-black text-white uppercase tracking-widest">CEE directos</h1>
                    <p className="text-[11px] text-white/35 mt-1">
                        Certificados de eficiencia energética contratados sueltos. Nada que ver con los CAE.
                    </p>
                </div>
                {isStaff && (
                    <button onClick={() => setShowNuevo(true)}
                        className="min-h-[44px] px-5 rounded-xl bg-brand text-bkg-deep text-[11px] font-black uppercase tracking-widest hover:bg-brand-700 transition-colors">
                        + Nuevo CEE
                    </button>
                )}
            </div>

            {/* ── Filtros ────────────────────────────────────────────────── */}
            <div className="flex flex-wrap items-center gap-2 mb-5">
                <input
                    value={busqueda}
                    onChange={e => setBusqueda(e.target.value)}
                    placeholder="Buscar por número, cliente, municipio o técnico…"
                    className="flex-1 min-w-[220px] bg-white/[0.03] border border-white/10 rounded-xl px-4 min-h-[44px] text-base md:text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-brand/40"
                />
                {/* A ancho automático, el <select> se estira hasta la opción más larga
                    —"INGENIERÍA ENERGÉTICA SOSTENIBLE, S.L"— y en un móvil de 375 px se
                    sale 120 px por la derecha, fuera de la pantalla. */}
                {isStaff && (
                    <select
                        value={filtroPrescriptor}
                        onChange={e => setFiltroPrescriptor(e.target.value)}
                        className="w-full md:w-auto max-w-full bg-white/[0.03] border border-white/10 rounded-xl px-3 min-h-[44px] text-sm text-white/70 focus:outline-none focus:border-brand/40"
                    >
                        <option value="">Todos los prescriptores</option>
                        {prescriptores.map(p => (
                            <option key={p.id_empresa} value={p.id_empresa}>{p.acronimo || p.razon_social}</option>
                        ))}
                    </select>
                )}
                <button
                    onClick={() => setVerFinalizados(v => !v)}
                    className={`min-h-[44px] px-4 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-colors ${
                        verFinalizados ? 'bg-white/[0.06] border-white/20 text-white' : 'border-white/10 text-white/40 hover:text-white/70'
                    }`}>
                    {verFinalizados ? 'Ocultar terminados' : `Ver terminados (${finalizados})`}
                </button>
            </div>

            {error && (
                <div className="mb-5 rounded-xl border border-red-500/30 bg-red-500/[0.07] px-4 py-3 text-xs text-red-300">{error}</div>
            )}

            {loading ? (
                <div className="py-16 text-center text-white/25 text-xs font-black uppercase tracking-widest">Cargando…</div>
            ) : visibles.length === 0 ? (
                <div className="py-16 text-center text-white/25 text-xs font-black uppercase tracking-widest">
                    {filas.length ? 'Nada que coincida con el filtro' : 'Todavía no hay ningún CEE directo'}
                </div>
            ) : (
                <>
                    {/* ── Tabla (escritorio) ─────────────────────────────── */}
                    <div className="hidden md:block rounded-2xl border border-white/[0.06] overflow-hidden">
                        <table className="w-full">
                            <thead>
                                <tr className="bg-white/[0.02] border-b border-white/[0.06]">
                                    {['Expediente', 'Cliente', 'Prescriptor', 'Técnico', 'Estado', 'Parado', ''].map((h, i) => (
                                        <th key={i} className="px-4 py-3 text-left text-[9px] font-black uppercase tracking-widest text-white/30">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {visibles.map(r => {
                                    const dias = diasParado(r);
                                    return (
                                        <tr key={r.id}
                                            onClick={() => setSeleccionado(r.id)}
                                            className="border-b border-white/[0.04] hover:bg-white/[0.02] cursor-pointer transition-colors">
                                            <td className="px-4 py-3">
                                                <div className="font-mono text-brand text-sm font-bold">{r.numero_expediente}</div>
                                                <div className="text-white/70 text-xs mt-0.5 uppercase tracking-wide line-clamp-1">{r.nombre}</div>
                                                <div className="flex gap-1.5 mt-1">
                                                    <Pastilla className={r.alcance === 'DOBLE' ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' : 'bg-white/[0.04] text-white/40 border-white/10'}>
                                                        {r.alcance === 'DOBLE' ? 'Ini+Fin' : 'Único'}
                                                    </Pastilla>
                                                    {r.origen === 'HISTORICO' && (
                                                        <Pastilla className="bg-amber-500/10 text-amber-400 border-amber-500/20">Histórico</Pastilla>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-xs text-white/60">
                                                {r.cliente_nombre || <span className="text-white/20">—</span>}
                                                {r.municipio && <div className="text-white/25 text-[11px] mt-0.5">{r.municipio}</div>}
                                            </td>
                                            <td className="px-4 py-3 text-xs text-white/45">{r.prescriptor_nombre || <span className="text-white/20">Directo</span>}</td>
                                            <td className="px-4 py-3 text-xs text-white/45">{r.certificador_nombre || <span className="text-white/20">Sin asignar</span>}</td>
                                            <td className="px-4 py-3">
                                                <Pastilla className={COLOR_ESTADO(r.estado)}>{r.estado}</Pastilla>
                                                {r.responsable && (
                                                    <div className="text-[10px] text-white/25 mt-1 uppercase tracking-widest">
                                                        Pelota: {r.responsable === 'CERTIFICADOR' ? 'Técnico' : 'Nuestra'}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-xs font-mono tabular-nums">
                                                {dias == null ? <span className="text-white/20">—</span>
                                                    : <span className={dias > 30 ? 'text-red-400 font-black' : dias > 10 ? 'text-amber-400' : 'text-white/40'}>{dias} d</span>}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                {r.drive_folder_link && (
                                                    <a href={r.drive_folder_link} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                                                        className="text-white/25 hover:text-brand transition-colors" title="Abrir carpeta de Drive">📁</a>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* ── Tarjetas (móvil) ───────────────────────────────── */}
                    <div className="md:hidden space-y-3">
                        {visibles.map(r => {
                            const dias = diasParado(r);
                            return (
                                <div key={r.id} onClick={() => setSeleccionado(r.id)}
                                    className="rounded-2xl p-4 bg-bkg-surface/60 border border-white/[0.06] active:scale-[0.99] transition-transform">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0 flex-1">
                                            <div className="font-mono text-brand text-sm font-bold leading-tight">{r.numero_expediente}</div>
                                            <div className="text-white/90 text-xs font-bold mt-0.5 uppercase tracking-wide line-clamp-1">{r.nombre}</div>
                                            {r.cliente_nombre && <div className="text-white/35 text-[11px] mt-0.5">{r.cliente_nombre}</div>}
                                        </div>
                                        <Pastilla className={r.alcance === 'DOBLE' ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' : 'bg-white/[0.04] text-white/40 border-white/10'}>
                                            {r.alcance === 'DOBLE' ? 'Ini+Fin' : 'Único'}
                                        </Pastilla>
                                    </div>

                                    <div className="mt-3 flex flex-wrap items-center gap-2">
                                        <Pastilla className={COLOR_ESTADO(r.estado)}>{r.estado}</Pastilla>
                                        {dias != null && (
                                            <span className={`text-[11px] font-mono ${dias > 30 ? 'text-red-400 font-black' : dias > 10 ? 'text-amber-400' : 'text-white/30'}`}>
                                                {dias} d parado
                                            </span>
                                        )}
                                    </div>

                                    <div className="mt-2 text-[11px] text-white/30">
                                        {r.certificador_nombre || 'Sin técnico asignado'}
                                        {r.prescriptor_nombre ? ` · ${r.prescriptor_nombre}` : ''}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}

            <NuevoCeeDirectoModal
                isOpen={showNuevo}
                onClose={() => setShowNuevo(false)}
                onCreated={(nuevo) => { cargar(); setSeleccionado(nuevo.id); }}
                prescriptores={prescriptores}
            />
        </div>
    );
}

export default CeeDirectosView;
