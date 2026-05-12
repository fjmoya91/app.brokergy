import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { AerotermiaDetailModal } from '../components/AerotermiaDetailModal';
import { AerotermiaMarcaModal } from '../components/AerotermiaMarcaModal';

function Badge({ children, color = 'default' }) {
    const colors = {
        default: 'bg-white/5 text-white/50 border-white/10',
        brand:   'bg-brand/10 text-brand border-brand/20',
        blue:    'bg-sky-500/10 text-sky-400 border-sky-500/20',
        green:   'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
        amber:   'bg-amber-500/10 text-amber-400 border-amber-500/20',
    };
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest border ${colors[color]}`}>
            {children}
        </span>
    );
}

function fmt(val) {
    if (val === null || val === undefined || val === '') return '—';
    return Number(val).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function AerotermiaView() {
    const [equipos, setEquipos] = useState([]);
    const [marcas, setMarcas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [filtroMarca, setFiltroMarca] = useState('');
    const [filtroQ, setFiltroQ] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [viewMode, setViewMode] = useState('brands'); // 'brands' | 'models'
    const [equipoDetail, setEquipoDetail] = useState(null);
    const [equipoToDelete, setEquipoToDelete] = useState(null);
    const [deleting, setDeleting] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [showMarcas, setShowMarcas] = useState(false);
    const itemsPerPage = 20;

    const fetchEquipos = async (marca = '') => {
        setLoading(true);
        try {
            const params = {};
            if (marca) params.marca = marca;
            const res = await axios.get('/api/aerotermia', { params });
            setEquipos(res.data);
            setError(null);
        } catch (err) {
            console.error('Error fetching aerotermia:', err);
            setError('Error al cargar los equipos.');
        } finally {
            setLoading(false);
        }
    };

    const fetchMarcas = async () => {
        try {
            const res = await axios.get('/api/aerotermia/marcas');
            setMarcas(res.data);
        } catch (err) {
            console.error('Error al cargar marcas:', err);
        }
    };

    useEffect(() => { fetchMarcas(); }, []);
    useEffect(() => {
        fetchEquipos(filtroMarca);
        setCurrentPage(1);
    }, [filtroMarca]);
    useEffect(() => { setCurrentPage(1); }, [filtroQ]);

    const handleDelete = async () => {
        if (!equipoToDelete) return;
        setDeleting(true);
        try {
            await axios.delete(`/api/aerotermia/${equipoToDelete.id}`);
            setEquipos(prev => prev.filter(e => e.id !== equipoToDelete.id));
            setEquipoToDelete(null);
        } catch (err) {
            console.error('Error eliminando equipo:', err);
        } finally {
            setDeleting(false);
        }
    };

    const filteredEquipos = React.useMemo(() => {
        if (!filtroQ) return equipos;
        const q = filtroQ.toLowerCase();
        return equipos.filter(e =>
            (e.marca || '').toLowerCase().includes(q) ||
            (e.modelo_comercial || '').toLowerCase().includes(q) ||
            (e.modelo_conjunto || '').toLowerCase().includes(q)
        );
    }, [equipos, filtroQ]);

    const totalPages = Math.max(1, Math.ceil(filteredEquipos.length / itemsPerPage));
    const paginated = filteredEquipos.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    // Mapeo de logos para acceso rápido
    const marcasMap = React.useMemo(() => {
        const map = {};
        marcas.forEach(m => {
            const nombre = m.nombre || m.marca || (typeof m === 'string' ? m : '');
            const logo = m.logo || m.logo_marca || null;
            if (nombre) map[nombre.toUpperCase()] = logo;
        });
        return map;
    }, [marcas]);

    return (
        <div className="flex flex-col h-full">
            {/* ── Header ── */}
            <div className="px-6 sm:px-10 py-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 relative">
                <div className="absolute top-0 right-0 w-64 h-64 bg-sky-500/[0.03] rounded-full blur-[100px] pointer-events-none" />
                <div>
                    <h1 className="text-3xl font-black text-white uppercase tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-white via-white to-white/40">
                        Aerotermia
                    </h1>
                    <p className="text-[10px] text-sky-400 uppercase tracking-[0.3em] mt-1 font-black">
                        {filtroQ ? `${filteredEquipos.length} resultado${filteredEquipos.length !== 1 ? 's' : ''}` : `${equipos.length} equipo${equipos.length !== 1 ? 's' : ''} en catálogo`}
                    </p>
                </div>
                <div className="flex flex-wrap gap-3">
                    <button
                        onClick={() => setShowNew(true)}
                        className="flex items-center gap-3 px-6 py-3.5 bg-gradient-to-r from-brand to-brand-700 text-bkg-deep font-black text-[11px] uppercase tracking-widest rounded-2xl shadow-xl shadow-brand/10 hover:shadow-brand/30 hover:-translate-y-0.5 transition-all active:scale-[0.98]"
                    >
                        <svg className="w-4 h-4 font-bold text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
                        </svg>
                        Nuevo Equipo
                    </button>
                </div>
            </div>

            {/* ── Filtros / Navegación ── */}
            <div className="px-6 sm:px-10 pb-4 flex flex-col sm:flex-row gap-4 items-center">
                {viewMode === 'models' && filtroMarca && (
                    <div className="flex items-center gap-4 bg-white/[0.03] border border-white/[0.06] rounded-2xl p-2 pr-4 shadow-inner group">
                        <button
                            onClick={() => {
                                setFiltroMarca('');
                                setViewMode('brands');
                            }}
                            className="p-3 bg-white/5 border border-white/10 rounded-xl text-white/40 hover:text-white hover:bg-white/10 transition-all"
                            title="Volver a marcas"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" />
                            </svg>
                        </button>
                        
                        <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center p-1.5 shrink-0 shadow-lg">
                            {marcasMap[filtroMarca.toUpperCase()] ? (
                                <img src={marcasMap[filtroMarca.toUpperCase()]} alt={filtroMarca} className="w-full h-full object-contain" />
                            ) : (
                                <span className="text-black/20 font-black text-xs uppercase tracking-tighter">{filtroMarca.charAt(0)}</span>
                            )}
                        </div>
                        
                        <div className="flex flex-col">
                            <h3 className="text-xs font-black text-white uppercase tracking-widest">{filtroMarca}</h3>
                            <button 
                                onClick={() => setShowMarcas(true)}
                                className="text-[9px] text-sky-400 uppercase tracking-widest font-black hover:text-sky-300 transition-colors flex items-center gap-1"
                            >
                                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                                Editar Marca
                            </button>
                        </div>
                    </div>
                )}

                {/* Búsqueda modelo */}
                <div className="relative flex-1 max-w-xl group">
                    <div className="absolute -inset-1 bg-gradient-to-r from-brand/20 to-transparent rounded-2xl blur opacity-0 group-focus-within:opacity-100 transition-opacity" />
                    <div className="relative flex items-center">
                        <svg className="absolute left-4 w-4 h-4 text-white/20 group-focus-within:text-brand transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input
                            type="text"
                            placeholder="Buscar por marca o modelo..."
                            value={filtroQ}
                            onChange={e => {
                                const val = e.target.value;
                                setFiltroQ(val);
                                if (val) {
                                    setFiltroMarca('');   // limpia filtro de marca para buscar en todo
                                    setViewMode('models');
                                } else {
                                    setViewMode('brands'); // al borrar, vuelve a vista de marcas
                                }
                            }}
                            className="w-full bg-bkg-surface border border-white/[0.06] rounded-2xl pl-11 pr-4 py-3.5 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-brand/40 focus:ring-4 focus:ring-brand/5 transition-all"
                        />
                    </div>
                </div>
            </div>

            {/* ── Lista ── */}
            <div className="flex-1 overflow-y-auto px-6 sm:px-10 py-4">
                {loading && (
                    <div className="flex items-center justify-center py-20 text-white/30">
                        <svg className="w-5 h-5 animate-spin mr-2" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        <span className="text-sm uppercase tracking-widest font-bold">Cargando...</span>
                    </div>
                )}

                {error && (
                    <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm mb-4">{error}</div>
                )}

                {!loading && viewMode === 'models' && filteredEquipos.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                        <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-4">
                            <svg className="w-8 h-8 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2v-4M9 21H5a2 2 0 01-2-2v-4m0 0h18" />
                            </svg>
                        </div>
                        <p className="text-white/30 text-xs uppercase tracking-widest font-bold">
                            {filtroMarca || filtroQ ? 'Sin resultados para los filtros aplicados' : 'No hay equipos en el catálogo'}
                        </p>
                        {!filtroMarca && !filtroQ && (
                            <button
                                onClick={() => setShowNew(true)}
                                className="mt-4 px-4 py-2 bg-brand/10 border border-brand/20 text-brand text-xs font-black uppercase tracking-widest rounded-lg hover:bg-brand/20 transition-all"
                            >
                                Añadir primer equipo
                            </button>
                        )}
                    </div>
                )}

                {/* ── Vista de Marcas (Grid) ── */}
                {viewMode === 'brands' && !loading && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {marcas.map(m => {
                            // Adaptar para soportar ambos esquemas (nuevo .nombre / antiguo .marca)
                            const name = (m.nombre || m.marca || (typeof m === 'string' ? m : ''))
                            const logo = m.logo || m.logo_marca || null;
                            
                            if (!name) return null;
                            
                            return (
                                <button
                                    key={name}
                                    onClick={() => {
                                        setFiltroMarca(name);
                                        setViewMode('models');
                                    }}
                                    className="group relative bg-bkg-surface border border-white/[0.04] rounded-[2rem] p-6 flex flex-col items-center justify-center gap-6 hover:border-brand/40 hover:bg-white/[0.02] transition-all hover:-translate-y-2 active:scale-95 overflow-hidden"
                                >
                                    <div className="absolute inset-0 bg-gradient-to-br from-brand/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                    
                                    {/* Logo Container - Larger */}
                                    <div className="w-full h-32 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center overflow-hidden p-4 group-hover:scale-110 transition-transform duration-500">
                                        {logo ? (
                                            <img src={logo} alt={name} className="w-full h-full object-contain filter drop-shadow-2xl" />
                                        ) : (
                                            <span className="text-white/10 font-black text-4xl tracking-tighter">{(name || '?').charAt(0)}</span>
                                        )}
                                    </div>

                                    <div className="flex flex-col items-center gap-1">
                                        <span className="text-[12px] font-black text-white group-hover:text-brand uppercase tracking-[0.2em] transition-colors">
                                            {name}
                                        </span>
                                        <div className="h-1 w-0 group-hover:w-8 bg-brand rounded-full transition-all duration-300" />
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* ── Vista de Modelos (Lista) ── */}
                {viewMode === 'models' && !loading && paginated.length > 0 && (
                    <div className="space-y-2">
                        {paginated.map(equipo => (
                            <div
                                key={equipo.id}
                                onClick={() => setEquipoDetail(equipo)}
                                className="bg-bkg-surface border border-white/[0.04] rounded-[1.25rem] p-4 hover:border-brand/40 hover:bg-bkg-elevated transition-all group cursor-pointer relative overflow-hidden"
                            >
                                <div className="absolute top-0 left-0 bottom-0 w-1 bg-gradient-to-b from-sky-500/0 via-sky-500/20 to-sky-500/0 opacity-0 group-hover:opacity-100 transition-opacity" />

                                <div className="flex items-center gap-4">
                                    {/* Logo */}
                                    <div className="w-12 h-12 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center flex-shrink-0 overflow-hidden">
                                        {(equipo.logo_marca || marcasMap[equipo.marca?.toUpperCase()]) ? (
                                            <img 
                                                src={equipo.logo_marca || marcasMap[equipo.marca?.toUpperCase()]} 
                                                alt={equipo.marca} 
                                                className="w-full h-full object-contain p-1" 
                                            />
                                        ) : (
                                            <span className="text-white/20 font-black text-xs">{(equipo.marca || '?').charAt(0).toUpperCase()}</span>
                                        )}
                                    </div>

                                    {/* Info principal */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex flex-wrap items-center gap-2 mb-1">
                                            <Badge color="blue">{equipo.marca}</Badge>
                                            {equipo.tipo && <Badge>{equipo.tipo}</Badge>}
                                            {equipo.potencia_calefaccion && (
                                                <Badge color="amber">{fmt(equipo.potencia_calefaccion)} kW</Badge>
                                            )}
                                            {equipo.deposito_acs_incluido && (
                                                <Badge color="green">ACS</Badge>
                                            )}
                                            {equipo.is_validated && (
                                                <span className="flex items-center gap-1 text-[8px] font-black text-emerald-400 uppercase tracking-widest bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                                                    OK
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-white font-black text-sm truncate">{equipo.modelo_comercial || '—'}</p>
                                        <p className="text-white/30 text-[11px] truncate mt-0.5">{equipo.modelo_conjunto || ''}</p>
                                    </div>

                                    {/* SCOPs clave */}
                                    <div className="hidden sm:flex items-center gap-8 flex-shrink-0 text-right">
                                        {/* SCOP 35 */}
                                        <div className="flex flex-col gap-0.5 min-w-[100px]">
                                            <p className="text-[9px] text-white/20 uppercase tracking-widest font-black mb-1">SCOP 35°</p>
                                            <div className="flex items-center gap-4 justify-end">
                                                <div className="flex flex-col leading-none">
                                                    <span className="text-[7px] text-emerald-400/40 uppercase font-black tracking-tighter mb-0.5">Cal.</span>
                                                    <span className="text-white font-black text-xs">{fmt(equipo.scop_cal_calido_35) || '—'}</span>
                                                </div>
                                                <div className="flex flex-col leading-none border-l border-white/5 pl-4">
                                                    <span className="text-[7px] text-sky-400/40 uppercase font-black tracking-tighter mb-0.5">Med.</span>
                                                    <span className="text-white/60 font-black text-xs">{fmt(equipo.scop_cal_medio_35) || '—'}</span>
                                                </div>
                                            </div>
                                        </div>
                                        
                                        {/* SCOP 55 */}
                                        <div className="flex flex-col gap-0.5 min-w-[100px]">
                                            <p className="text-[9px] text-white/20 uppercase tracking-widest font-black mb-1">SCOP 55°</p>
                                            <div className="flex items-center gap-4 justify-end">
                                                <div className="flex flex-col leading-none">
                                                    <span className="text-[7px] text-emerald-400/40 uppercase font-black tracking-tighter mb-0.5">Cal.</span>
                                                    <span className="text-white font-black text-xs">{fmt(equipo.scop_cal_calido_55) || '—'}</span>
                                                </div>
                                                <div className="flex flex-col leading-none border-l border-white/5 pl-4">
                                                    <span className="text-[7px] text-sky-400/40 uppercase font-black tracking-tighter mb-0.5">Med.</span>
                                                    <span className="text-white/60 font-black text-xs">{fmt(equipo.scop_cal_medio_55) || '—'}</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* SEER */}
                                        <div className="flex flex-col min-w-[40px] pt-1">
                                            <p className="text-[9px] text-white/20 uppercase tracking-widest font-black mb-1">SEER</p>
                                            <p className="text-white font-black text-xs">{fmt(equipo.seer) || '—'}</p>
                                        </div>
                                    </div>

                                    {/* Eliminar */}
                                    <button
                                        onClick={e => { e.stopPropagation(); setEquipoToDelete(equipo); }}
                                        className="opacity-0 group-hover:opacity-100 p-2 rounded-lg text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-all flex-shrink-0"
                                        title="Eliminar equipo"
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Paginación */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-2 mt-6">
                        <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="px-3 py-1.5 rounded-lg border border-white/10 text-white/40 hover:text-white hover:border-white/20 text-xs font-bold transition-all disabled:opacity-30"
                        >
                            ← Anterior
                        </button>
                        <span className="text-xs text-white/30 font-bold uppercase tracking-widest px-3">
                            {currentPage} / {totalPages}
                        </span>
                        <button
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            className="px-3 py-1.5 rounded-lg border border-white/10 text-white/40 hover:text-white hover:border-white/20 text-xs font-bold transition-all disabled:opacity-30"
                        >
                            Siguiente →
                        </button>
                    </div>
                )}
            </div>

            {/* Modal detalle/edición */}
            <AerotermiaDetailModal
                isOpen={!!equipoDetail}
                equipo={equipoDetail}
                onClose={() => setEquipoDetail(null)}
                onUpdated={updated => {
                    setEquipos(prev => prev.map(e => e.id === updated.id ? { ...e, ...updated } : e));
                    setEquipoDetail(null);
                }}
            />

            {/* Modal nuevo equipo */}
            <AerotermiaDetailModal
                isOpen={showNew}
                equipo={null}
                isNew
                onClose={() => setShowNew(false)}
                onCreated={created => {
                    setEquipos(prev => [created, ...prev]);
                    fetchMarcas();
                    setShowNew(false);
                }}
            />

            {/* Modal gestión de marcas */}
            <AerotermiaMarcaModal 
                isOpen={showMarcas}
                onClose={() => setShowMarcas(false)}
                initialBrandName={filtroMarca}
                onUpdated={() => {
                    fetchMarcas();
                    fetchEquipos();
                }}
            />

            {/* Confirmar eliminación */}
            {equipoToDelete && (
                <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
                    <div className="bg-bkg-deep border border-white/[0.08] rounded-2xl max-w-sm w-full p-6 shadow-2xl">
                        <div className="w-12 h-12 bg-red-500/20 rounded-xl flex items-center justify-center mx-auto mb-4 border border-red-500/30">
                            <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <h3 className="text-white font-black text-center uppercase tracking-widest mb-2">Eliminar Equipo</h3>
                        <p className="text-white/40 text-sm text-center mb-6">
                            ¿Eliminar <strong className="text-white">{equipoToDelete.marca} — {equipoToDelete.modelo_comercial}</strong>? Esta acción no se puede deshacer.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setEquipoToDelete(null)}
                                className="flex-1 py-2.5 rounded-xl border border-white/10 text-white/60 hover:text-white font-bold text-sm transition-all"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleDelete}
                                disabled={deleting}
                                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black text-sm uppercase tracking-wider transition-all disabled:opacity-50"
                            >
                                {deleting ? 'Eliminando...' : 'Eliminar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
