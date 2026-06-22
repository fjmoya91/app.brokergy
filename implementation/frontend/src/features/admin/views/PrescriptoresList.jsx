// Prescriptores Management View - Vista tarjetas (2026-06-22)
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../../../context/AuthContext';
import { PrescriptorDetailModal } from './PrescriptorDetailModal';

// Estilo/etiqueta por tipo de partner — clases literales para que Tailwind las incluya.
const TIPO_META = {
    DISTRIBUIDOR:    { plural: 'Distribuidores',    dot: 'bg-blue-400',    badge: 'bg-blue-500/10 text-blue-400 border-blue-500/20',        active: 'bg-blue-500/15 border-blue-400/50 text-blue-200 ring-1 ring-blue-500/20',        accent: 'from-blue-500/70 via-blue-500/20',    icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
    INSTALADOR:      { plural: 'Instaladores',      dot: 'bg-cyan-400',    badge: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',        active: 'bg-cyan-500/15 border-cyan-400/50 text-cyan-200 ring-1 ring-cyan-500/20',        accent: 'from-cyan-500/70 via-cyan-500/20',    icon: 'M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 11-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 011-1h1a2 2 0 100-4H7a1 1 0 01-1-1V7a1 1 0 011-1h3a1 1 0 001-1V4z' },
    CERTIFICADOR:    { plural: 'Certificadores',    dot: 'bg-emerald-400', badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-400/20', active: 'bg-emerald-500/15 border-emerald-400/50 text-emerald-200 ring-1 ring-emerald-500/20', accent: 'from-emerald-500/70 via-emerald-500/20', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
    SUJETO_OBLIGADO: { plural: 'Sujetos Obligados', dot: 'bg-purple-400',  badge: 'bg-purple-500/10 text-purple-400 border-purple-500/20',  active: 'bg-purple-500/15 border-purple-400/50 text-purple-200 ring-1 ring-purple-500/20',  accent: 'from-purple-500/70 via-purple-500/20',  icon: 'M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9' },
    VERIFICADOR:     { plural: 'Verificadores',     dot: 'bg-orange-400',   badge: 'bg-orange-500/10 text-orange-400 border-orange-500/20',  active: 'bg-orange-500/15 border-orange-400/50 text-orange-200 ring-1 ring-orange-500/20',  accent: 'from-orange-500/70 via-orange-500/20',  icon: 'M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z' },
    ADMIN:           { plural: 'Admins',            dot: 'bg-amber-400',    badge: 'bg-amber-500/10 text-amber-500 border-amber-500/20',     active: 'bg-amber-500/15 border-amber-400/50 text-amber-200 ring-1 ring-amber-500/20',     accent: 'from-amber-500/70 via-amber-500/20',     icon: 'M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z' },
    CLIENTE:         { plural: 'Clientes',          dot: 'bg-white/40',     badge: 'bg-white/5 text-white/40 border-white/10',               active: 'bg-white/10 border-white/30 text-white ring-1 ring-white/10',                      accent: 'from-white/40 via-white/10',             icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
};
const FALLBACK_META = { plural: 'Otros', dot: 'bg-white/40', badge: 'bg-white/5 text-white/40 border-white/10', active: 'bg-white/10 border-white/30 text-white ring-1 ring-white/10', accent: 'from-white/40 via-white/10', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857' };
const metaOf = (t) => TIPO_META[t] || FALLBACK_META;
const TIPO_ORDER = ['DISTRIBUIDOR', 'INSTALADOR', 'CERTIFICADOR', 'SUJETO_OBLIGADO', 'VERIFICADOR', 'ADMIN', 'CLIENTE'];


export function PrescriptoresList({ onNavigate }) {
    const { user, refreshProfile } = useAuth();
    const isAdmin = user?.rol?.toUpperCase() === 'ADMIN';
    const isDistributor = user?.rol?.toUpperCase() === 'DISTRIBUIDOR';
    const [prescriptores, setPrescriptores] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await axios.get('/api/prescriptores');
            setPrescriptores(res.data);
            setError(null);
        } catch (err) {
            console.error(err);
            setError('Error al cargar la lista de prescriptores.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    // Modal de detalle / creación (patrón clientes)
    const [modalPrescriptor, setModalPrescriptor] = useState(null);

    const handleNew = () => {
        setModalPrescriptor({}); // objeto vacío = nuevo partner
    };

    const [deleting, setDeleting] = useState(false);
    const [modalConfig, setModalConfig] = useState({
        show: false,
        title: '',
        message: '',
        type: 'confirm',
        onConfirm: null,
        confirmLabel: 'Aceptar',
        cancelLabel: 'Cancelar'
    });

    const handleDelete = async (id, e) => {
        if (e) e.stopPropagation();

        const pres = prescriptores.find(p => p.id_empresa === id);
        const name = pres?.acronimo || pres?.razon_social || 'esta entidad';

        setModalConfig({
            show: true,
            type: 'confirm',
            title: '⚠️ ¿ELIMINAR PERMANENTEMENTE?',
            message: `Vas a borrar a "${name.toUpperCase()}". Esta acción eliminará la empresa, su usuario de acceso y no se podrá deshacer.`,
            confirmLabel: 'SÍ, ELIMINAR',
            cancelLabel: 'CANCELAR',
            onConfirm: async () => {
                setDeleting(true);
                setModalConfig(prev => ({ ...prev, show: false }));
                try {
                    await axios.delete(`/api/prescriptores/${id}`);
                    setModalPrescriptor(null);
                    fetchData();

                    // Mostrar éxito tras borrar
                    setModalConfig({
                        show: true,
                        type: 'success',
                        title: 'ELIMINADO',
                        message: 'La entidad ha sido borrada correctamente.',
                        confirmLabel: 'ENTENDIDO',
                        onConfirm: () => setModalConfig(prev => ({ ...prev, show: false }))
                    });
                } catch (err) {
                    console.error(err);
                    setError(err.response?.data?.error || 'Error al eliminar el prescriptor.');
                } finally {
                    setDeleting(false);
                }
            }
        });
    };


    // Filter logic
    const [searchTerm, setSearchTerm] = useState('');
    const [filterTipo, setFilterTipo] = useState('TODO');

    const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

    // Lista visible (excluye al propio distribuidor si es el rol actual)
    const visiblePrescriptores = prescriptores.filter(p => {
        if (isDistributor && p.id_empresa === user?.prescriptor_id) return false;
        return true;
    });

    const filteredPrescriptores = visiblePrescriptores.filter(p => {
        const q = norm(searchTerm);
        const matchesSearch = !q
            || norm(p.acronimo || p.razon_social).includes(q)
            || norm(p.razon_social).includes(q)
            || norm(p.cif).includes(q);
        const matchesTipo = filterTipo === 'TODO' || p.tipo_empresa === filterTipo;
        return matchesSearch && matchesTipo;
    });

    // Contadores por tipo + chips presentes (ordenados, solo los que existen)
    const typeCounts = visiblePrescriptores.reduce((acc, p) => {
        const t = p.tipo_empresa || 'OTRO';
        acc[t] = (acc[t] || 0) + 1;
        return acc;
    }, {});
    const presentTypes = [
        ...TIPO_ORDER.filter(t => typeCounts[t]),
        ...Object.keys(typeCounts).filter(t => !TIPO_ORDER.includes(t)),
    ];

    return (
        <div className="animate-fade-in w-full text-white pt-10 pb-20 px-2 md:px-6">
            <header className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-2xl md:text-3xl font-black flex items-center gap-4 text-white tracking-tight">
                        <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                            <svg className="w-6 h-6 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                        </div>
                        {isAdmin ? 'Gestión de Prescriptores' : 'Mis Partners Asociados'}
                    </h2>
                    <p className="text-white/40 text-xs mt-2 ml-16 font-medium uppercase tracking-widest">Panel de control de entidades colaboradoras y partners B2B</p>
                </div>
                {isAdmin && (
                    <button
                         onClick={handleNew}
                         className="px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black font-black uppercase tracking-widest text-[10px] rounded-2xl shadow-xl shadow-amber-500/20 transition-all flex items-center gap-2 active:scale-95 whitespace-nowrap"
                    >
                         <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
                         </svg>
                         NUEVO PARTNER
                    </button>
                )}
            </header>

            {/* ─── Barra de filtros (chips por rol + buscador) ─── */}
            <div className="sticky top-0 z-20 -mx-2 md:-mx-6 px-2 md:px-6 py-3 mb-6 bg-bkg-deep/80 backdrop-blur-xl border-b border-white/[0.05]">
                <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                    {/* Chips de tipo/rol — scroll horizontal en móvil */}
                    <div className="flex-1 flex gap-2 overflow-x-auto scrollbar-hide pb-1 -mb-1">
                        {(() => {
                            const isActive = filterTipo === 'TODO';
                            return (
                                <button
                                    onClick={() => setFilterTipo('TODO')}
                                    className={`shrink-0 inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border text-[11px] font-black uppercase tracking-wider transition-all ${isActive ? 'bg-brand/15 border-brand/50 text-brand ring-1 ring-brand/20' : 'bg-white/[0.03] border-white/[0.06] text-white/50 hover:text-white hover:border-white/15'}`}
                                >
                                    Todos
                                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-md ${isActive ? 'bg-brand/20 text-brand' : 'bg-white/5 text-white/40'}`}>{visiblePrescriptores.length}</span>
                                </button>
                            );
                        })()}
                        {presentTypes.map(t => {
                            const meta = metaOf(t);
                            const isActive = filterTipo === t;
                            return (
                                <button
                                    key={t}
                                    onClick={() => setFilterTipo(isActive ? 'TODO' : t)}
                                    className={`shrink-0 inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border text-[11px] font-black uppercase tracking-wider transition-all ${isActive ? meta.active : 'bg-white/[0.03] border-white/[0.06] text-white/50 hover:text-white hover:border-white/15'}`}
                                >
                                    <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                                    {meta.plural}
                                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-md ${isActive ? 'bg-white/15 text-white' : 'bg-white/5 text-white/40'}`}>{typeCounts[t]}</span>
                                </button>
                            );
                        })}
                    </div>

                    {/* Buscador */}
                    <div className="relative lg:w-72 shrink-0">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                            <svg className="w-4 h-4 text-white/25" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                        </div>
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            placeholder="Buscar por nombre o CIF..."
                            className="w-full bg-black/40 border border-white/[0.06] rounded-xl pl-11 pr-10 py-2.5 text-sm font-medium text-white placeholder-white/25 focus:outline-none focus:border-brand/40 focus:bg-black/60 transition-all"
                        />
                        {searchTerm && (
                            <button onClick={() => setSearchTerm('')} className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-white/25 hover:text-white transition-colors">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {error && <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl mb-6 text-sm flex items-center gap-2"><svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>{error}</div>}

            {/* Contador de resultados */}
            {!loading && (
                <div className="flex items-center justify-between mb-4 px-1">
                    <p className="text-[10px] uppercase tracking-[0.25em] font-black text-white/30">
                        {filteredPrescriptores.length} {filteredPrescriptores.length === 1 ? 'partner' : 'partners'}
                        {(filterTipo !== 'TODO' || searchTerm) && <span className="text-white/15"> · filtrado</span>}
                    </p>
                    {(filterTipo !== 'TODO' || searchTerm) && (
                        <button
                            onClick={() => { setFilterTipo('TODO'); setSearchTerm(''); }}
                            className="text-[10px] uppercase tracking-widest font-black text-brand/70 hover:text-brand transition-colors flex items-center gap-1"
                        >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                            Limpiar
                        </button>
                    )}
                </div>
            )}

            {/* ─── Grid de tarjetas ─── */}
            {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className="rounded-3xl border border-white/[0.05] bg-white/[0.02] p-5 animate-pulse">
                            <div className="flex items-start gap-4">
                                <div className="w-16 h-16 rounded-2xl bg-white/[0.04]" />
                                <div className="flex-1 space-y-2 pt-1">
                                    <div className="h-3 bg-white/[0.06] rounded w-3/4" />
                                    <div className="h-2 bg-white/[0.04] rounded w-1/2" />
                                    <div className="h-2 bg-white/[0.04] rounded w-1/3" />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : filteredPrescriptores.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-white/[0.08] bg-white/[0.01] py-20 flex flex-col items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center">
                        <svg className="w-8 h-8 text-white/15" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>
                    <span className="text-white/30 text-xs uppercase tracking-widest font-bold">No se encontraron entidades con los criterios actuales</span>
                    {(filterTipo !== 'TODO' || searchTerm) && (
                        <button
                            onClick={() => { setFilterTipo('TODO'); setSearchTerm(''); }}
                            className="px-4 py-2 bg-brand/10 border border-brand/20 text-brand text-[10px] font-black uppercase tracking-widest rounded-lg hover:bg-brand/20 transition-all"
                        >
                            Limpiar filtros
                        </button>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {filteredPrescriptores.map(p => {
                        const meta = metaOf(p.tipo_empresa);
                        const tipoLabel = p.tipo_empresa === 'CLIENTE' ? 'Cliente Particular' : (p.tipo_empresa || '—').replace(/_/g, ' ');
                        const initials = (p.acronimo || p.razon_social || '?').trim().substring(0, 2).toUpperCase();
                        return (
                            <div
                                key={p.id_empresa}
                                onClick={() => setModalPrescriptor(p)}
                                className="group relative bg-bkg-surface border border-white/[0.05] rounded-3xl p-5 cursor-pointer hover:border-white/15 hover:-translate-y-1 hover:shadow-2xl hover:shadow-black/40 transition-all overflow-hidden"
                            >
                                {/* Acento de color por tipo */}
                                <div className={`absolute top-0 inset-x-0 h-1 bg-gradient-to-r ${meta.accent} to-transparent opacity-60 group-hover:opacity-100 transition-opacity`} />
                                {/* Glow al hover */}
                                <div className="absolute -top-12 -right-12 w-32 h-32 rounded-full bg-white/[0.03] blur-2xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

                                {/* Cabecera: el logo es el protagonista */}
                                <div className="relative flex items-start justify-between gap-2 min-h-[4rem]">
                                    {p.logo_empresa ? (
                                        <div className="h-16 flex items-center max-w-[80%] origin-left group-hover:scale-105 transition-transform">
                                            <img
                                                src={p.logo_empresa}
                                                alt={p.acronimo || p.razon_social || ''}
                                                className="max-h-16 w-auto max-w-full object-contain object-left drop-shadow-[0_2px_10px_rgba(0,0,0,0.55)]"
                                            />
                                        </div>
                                    ) : (
                                        <div className="w-16 h-16 rounded-2xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center shrink-0 overflow-hidden group-hover:scale-105 transition-transform">
                                            <span className="font-black text-white/25 text-lg tracking-tight uppercase">{initials}</span>
                                        </div>
                                    )}

                                    {/* Eliminar (admin) */}
                                    {isAdmin && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDelete(p.id_empresa, e); }}
                                            className="shrink-0 -mr-1 -mt-1 p-2 rounded-lg text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100 max-md:opacity-100"
                                            disabled={deleting}
                                            title="Eliminar partner"
                                        >
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                        </button>
                                    )}
                                </div>

                                {/* Nombre + CIF */}
                                <div className="relative mt-3">
                                    <h3 className="font-black text-white uppercase tracking-tight text-sm leading-tight line-clamp-2 group-hover:text-brand transition-colors">
                                        {p.acronimo || p.razon_social || '—'}
                                    </h3>
                                    {p.acronimo && p.razon_social && (
                                        <p className="text-white/30 text-[11px] truncate mt-0.5 normal-case font-medium">{p.razon_social}</p>
                                    )}
                                    <p className="font-mono text-cyan-400 text-[11px] mt-1.5">{p.cif || '—'}</p>
                                </div>

                                {/* Badges */}
                                <div className="relative flex flex-wrap items-center gap-1.5 mt-4">
                                    {isAdmin && (
                                        <span className={`text-[8px] uppercase tracking-widest font-black border px-2 py-0.5 rounded ${meta.badge}`}>{tipoLabel}</span>
                                    )}
                                    {p.es_autonomo && (
                                        <span className="text-[8px] uppercase tracking-widest font-black border px-2 py-0.5 rounded bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/20">Autónomo</span>
                                    )}
                                </div>

                                {/* Footer: acceso + antigüedad (solo admin) */}
                                {isAdmin && (
                                    <div className="relative mt-4 pt-3 border-t border-white/[0.05] flex items-center justify-between gap-2">
                                        {p.usuarios ? (
                                            <div className="min-w-0 flex items-center gap-2">
                                                <span className={`shrink-0 w-1.5 h-1.5 rounded-full ${p.usuarios.activo ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]' : 'bg-red-400'}`} title={p.usuarios.activo ? 'Acceso activo' : 'Acceso inactivo'} />
                                                <div className="min-w-0">
                                                    <p className="text-[11px] font-bold text-white/70 truncate">{p.usuarios.nombre} {p.usuarios.apellidos || ''}</p>
                                                    <p className="text-[9px] text-white/30 font-mono truncate">{p.usuarios.email}</p>
                                                </div>
                                            </div>
                                        ) : (
                                            <span className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded border bg-white/5 text-white/25 border-white/10">Sin acceso</span>
                                        )}
                                        <span className="shrink-0 text-[9px] font-mono text-white/20">{p.created_at ? new Date(p.created_at).toLocaleDateString() : ''}</span>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Custom Modal Premium */}
            {modalConfig.show && (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
                    <div className={`relative w-full max-w-md bg-bkg-surface border shadow-2xl rounded-2xl overflow-hidden animate-slide-up ${modalConfig.type === 'confirm' ? 'border-red-500/30' : 'border-brand/30'}`}>
                        {/* Header decorativo */}
                        <div className={`h-1.5 w-full bg-gradient-to-r ${modalConfig.type === 'confirm' ? 'from-red-600 to-red-400' : 'from-brand to-brand-700'}`}></div>

                        <div className="p-8">
                            <div className="flex flex-col items-center text-center">
                                {/* Icono */}
                                <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-6 ${modalConfig.type === 'confirm' ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 'bg-brand/10 text-brand border border-brand/20'}`}>
                                    {modalConfig.type === 'confirm' ? (
                                        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                    ) : (
                                        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                    )}
                                </div>

                                <h3 className="text-xl font-black text-white mb-3 tracking-tight uppercase">
                                    {modalConfig.title}
                                </h3>

                                <p className="text-white/50 text-sm leading-relaxed mb-8">
                                    {modalConfig.message}
                                </p>

                                <div className="flex w-full gap-3">
                                    {modalConfig.type === 'confirm' && (
                                        <button
                                            onClick={() => setModalConfig(prev => ({ ...prev, show: false }))}
                                            className="flex-1 py-3.5 px-6 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-white text-[10px] font-black uppercase tracking-[0.2em] transition-all"
                                        >
                                            {modalConfig.cancelLabel}
                                        </button>
                                    )}
                                    <button
                                        onClick={modalConfig.onConfirm}
                                        className={`flex-1 py-3.5 px-6 rounded-xl font-black text-[10px] uppercase tracking-[0.2em] transition-all shadow-lg active:scale-95 ${
                                            modalConfig.type === 'confirm'
                                                ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-600/20'
                                                : 'bg-gradient-to-r from-brand to-brand-700 hover:from-brand-400 hover:to-brand-600 text-black shadow-brand/20'
                                        }`}
                                    >
                                        {modalConfig.confirmLabel}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de detalle / edición / creación de prescriptor */}
            <PrescriptorDetailModal
                isOpen={!!modalPrescriptor}
                prescriptor={modalPrescriptor}
                onNavigate={onNavigate}
                onClose={() => setModalPrescriptor(null)}
                onCreated={(newP) => {
                    setPrescriptores(prev => [newP, ...prev]);
                    setModalPrescriptor(null);
                }}
                onUpdated={(updated) => {
                    setPrescriptores(prev => prev.map(p => p.id_empresa === updated.id_empresa ? { ...p, ...updated } : p));
                    setModalPrescriptor(prev => prev?.id_empresa ? { ...prev, ...updated } : null);
                }}
            />

        </div>
    );
}
