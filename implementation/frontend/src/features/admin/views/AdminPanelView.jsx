import React, { useState, useEffect } from 'react';
import axios from 'axios';

export function AdminPanelView({ onLoadOpportunity }) {
    const [oportunidades, setOportunidades] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [oportunidadToDelete, setOportunidadToDelete] = useState(null);
    const [deleting, setDeleting] = useState(false);

    // CRM States
    const [updatingStatus, setUpdatingStatus] = useState(null);
    const [historyModalOp, setHistoryModalOp] = useState(null);
    const [deletingHistory, setDeletingHistory] = useState(false);
    const [showHistoryDeleteConfirm, setShowHistoryDeleteConfirm] = useState(false);
    const [newComment, setNewComment] = useState('');
    const [addingComment, setAddingComment] = useState(false);
    const [showCommentForm, setShowCommentForm] = useState(false);
    const [modalError, setModalError] = useState(null);
    const [showStats, setShowStats] = useState(true);

    // Filter Stats
    const [filters, setFilters] = useState({
        id_oportunidad: '',
        referencia_cliente: '',
        ref_catastral: '',
        estado: ''
    });

    useEffect(() => {
        fetchOportunidades();
    }, []);

    const fetchOportunidades = async () => {
        setLoading(true);
        try {
            const res = await axios.get('/api/oportunidades');
            setOportunidades(res.data);
            setError(null);
        } catch (err) {
            console.error('Error fetching oportunidades:', err);
            setError('Error al cargar las oportunidades desde Supabase.');
        } finally {
            setLoading(false);
        }
    };

    // Auto-dismiss error after 5 seconds
    useEffect(() => {
        if (error) {
            const timer = setTimeout(() => setError(null), 5000);
            return () => clearTimeout(timer);
        }
    }, [error]);

    const handleDelete = async () => {
        if (!oportunidadToDelete) return;
        setDeleting(true);
        try {
            await axios.delete(`/api/oportunidades/${oportunidadToDelete.id_oportunidad}`);
            setOportunidades(prev => prev.filter(op => op.id_oportunidad !== oportunidadToDelete.id_oportunidad));
            setOportunidadToDelete(null);
        } catch (err) {
            console.error('Error al eliminar:', err);
            setError('Error interno al eliminar la oportunidad.');
        } finally {
            setDeleting(false);
        }
    };

    const handleStatusChange = async (e, op) => {
        e.stopPropagation();
        const nuevoEstado = e.target.value;
        const currentEstado = op.datos_calculo?.estado || 'PTE ENVIAR';

        if (nuevoEstado === currentEstado) return;

        setUpdatingStatus(op.id_oportunidad);
        try {
            await axios.patch(`/api/oportunidades/${op.id_oportunidad}/estado`, { nuevo_estado: nuevoEstado });

            // Refrescar localmente (evitamos hacer reload entero)
            setOportunidades(prev => prev.map(o => {
                if (o.id_oportunidad === op.id_oportunidad) {
                    const clonedDatos = { ...(o.datos_calculo || {}) };
                    clonedDatos.estado = nuevoEstado;
                    const hist = clonedDatos.historial || [];
                    clonedDatos.historial = [...hist, {
                        estado: nuevoEstado,
                        fecha: new Date().toISOString(),
                        usuario: 'Administrador'
                    }];
                    return { ...o, datos_calculo: clonedDatos };
                }
                return o;
            }));
        } catch (err) {
            console.error('Error al actualizar estado:', err);
            setError('Error al actualizar el estado de la oportunidad.');
        } finally {
            setUpdatingStatus(null);
        }
    };

    const handleDeleteHistory = async (id) => {
        setDeletingHistory(true);
        try {
            await axios.delete(`/api/oportunidades/${id}/historial`);

            // Actualizar localmente
            const updated = prev => prev.map(o => {
                if (o.id_oportunidad === id) {
                    return {
                        ...o,
                        datos_calculo: {
                            ...(o.datos_calculo || {}),
                            historial: []
                        }
                    };
                }
                return o;
            });
            setOportunidades(updated);

            // También actualizar el objeto del modal si está abierto
            if (historyModalOp && historyModalOp.id_oportunidad === id) {
                setHistoryModalOp(prev => ({
                    ...prev,
                    datos_calculo: {
                        ...(prev.datos_calculo || {}),
                        historial: []
                    }
                }));
            }
            setShowHistoryDeleteConfirm(false);
        } catch (err) {
            console.error('Error al borrar historial:', err);
            setError('Error al borrar el historial de la oportunidad.');
        } finally {
            setDeletingHistory(false);
        }
    };

    const handleAddComment = async () => {
        if (!newComment.trim() || !historyModalOp) return;

        setAddingComment(true);
        setModalError(null);
        try {
            const id = historyModalOp.id_oportunidad;
            console.log('[Frontend] Enviando comentario a /api/oportunidades/' + id + '/comentarios');
            const res = await axios.post(`/api/oportunidades/${id}/comentarios`, { comentario: newComment });

            const updatedOp = res.data.data;

            // Actualizar localmente
            setOportunidades(prev => prev.map(o => o.id_oportunidad === id ? updatedOp : o));
            setHistoryModalOp(updatedOp);
            setNewComment('');
            setShowCommentForm(false);
        } catch (err) {
            console.error('[Frontend] Error completo al añadir comentario:', err);
            const status = err.response?.status;
            const msg = err.response?.data?.error || err.message || 'Error desconocido';
            const detail = err.response?.data?.details || '';
            setModalError(`Error (${status || 'Red'}): ${msg}. ${detail}`);
        } finally {
            setAddingComment(false);
        }
    };

    const handleDeleteEntry = async (entryId) => {
        if (!historyModalOp) return;
        const id = historyModalOp.id_oportunidad;

        try {
            const res = await axios.delete(`/api/oportunidades/${id}/historial/${entryId}`);
            const updatedOp = res.data.data;

            // Actualizar localmente
            setOportunidades(prev => prev.map(o => o.id_oportunidad === id ? updatedOp : o));
            setHistoryModalOp(updatedOp);
        } catch (err) {
            console.error('Error al eliminar entrada del historial:', err);
            setError('Error al eliminar la nota.');
        }
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'ENVIADA': return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
            case 'ACEPTADA': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
            case 'RECHAZADA': return 'bg-red-500/10 text-red-400 border-red-500/30';
            default: return 'bg-slate-500/10 text-slate-400 border-slate-500/30'; // PTE ENVIAR
        }
    };

    const filteredOportunidades = oportunidades.filter(op => {
        return (
            (filters.id_oportunidad === '' || op.id_oportunidad.toLowerCase().includes(filters.id_oportunidad.toLowerCase())) &&
            (filters.referencia_cliente === '' || (op.referencia_cliente || '').toLowerCase().includes(filters.referencia_cliente.toLowerCase())) &&
            (filters.ref_catastral === '' || op.ref_catastral.toLowerCase().includes(filters.ref_catastral.toLowerCase())) &&
            (filters.estado === '' || (op.datos_calculo?.estado || 'PTE ENVIAR') === filters.estado)
        );
    });

    // Cálculos financieros dinámicos basados en filtros
    const financialStats = filteredOportunidades.reduce((acc, op) => {
        const cae = op.datos_calculo?.result?.financials?.caeBonus || 0;
        const profit = op.datos_calculo?.result?.financials?.profitBrokergy || 0;
        return {
            totalCae: acc.totalCae + cae,
            totalProfit: acc.totalProfit + profit
        };
    }, { totalCae: 0, totalProfit: 0 });

    const stats = {
        total: oportunidades.length,
        pending: oportunidades.filter(op => (op.datos_calculo?.estado || 'PTE ENVIAR') === 'PTE ENVIAR').length,
        sent: oportunidades.filter(op => op.datos_calculo?.estado === 'ENVIADA').length,
        accepted: oportunidades.filter(op => op.datos_calculo?.estado === 'ACEPTADA').length,
        rejected: oportunidades.filter(op => op.datos_calculo?.estado === 'RECHAZADA').length,
    };

    return (
        <div className="animate-fade-in w-full max-w-[1600px] mx-auto px-4 sm:px-6 py-8">
            {/* ─── Header ─── */}
            <header className="mb-4 md:mb-6 flex flex-wrap items-center justify-between gap-3 pb-4 relative">
                <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent"></div>
                <div className="flex items-center gap-3 md:gap-6 min-w-0">
                    <h2 className="text-xl md:text-2xl font-black text-white flex items-center gap-2 md:gap-3 whitespace-nowrap">
                        <div className="p-1 md:p-1.5 bg-gradient-to-br from-amber-500/20 to-orange-600/10 rounded-lg border border-amber-500/20">
                            <svg className="w-4 h-4 md:w-5 md:h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                            </svg>
                        </div>
                        Panel de Control
                    </h2>

                    {!showStats && (
                        <div className="hidden md:flex items-center gap-4 animate-in fade-in slide-in-from-left-4 duration-500">
                            <div className="h-4 w-px bg-white/10 mx-2"></div>
                            <div className="flex flex-col">
                                <span className="text-[9px] uppercase tracking-tighter font-black text-emerald-400/50">Bono CAE</span>
                                <span className="text-sm font-bold text-emerald-400 leading-none">
                                    {financialStats.totalCae.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}
                                </span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[9px] uppercase tracking-tighter font-black text-cyan-400/50">Beneficio</span>
                                <span className="text-sm font-bold text-cyan-400 leading-none">
                                    {financialStats.totalProfit.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-2 md:gap-3">
                    <button
                        onClick={() => setShowStats(!showStats)}
                        className={`px-2 md:px-3 py-2 rounded-xl border transition-all flex items-center gap-1.5 md:gap-2 text-[10px] font-black uppercase tracking-wider ${
                            showStats 
                                ? 'bg-amber-500/10 border-amber-500/20 text-amber-500' 
                                : 'bg-white/[0.04] border-white/[0.06] text-white/40 hover:text-white hover:bg-white/[0.08]'
                        }`}
                        title={showStats ? 'Ocultar Resumen' : 'Mostrar Resumen'}
                    >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            {showStats 
                                ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                                : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                            }
                        </svg>
                        <span className="hidden sm:inline">{showStats ? 'Ocultar Resumen' : 'Mostrar Resumen'}</span>
                    </button>
                    <div className="h-6 w-px bg-white/10"></div>
                    <button
                        onClick={fetchOportunidades}
                        className="p-2 md:px-4 md:py-2 bg-white/[0.04] hover:bg-white/[0.08] text-white rounded-xl transition-all border border-white/[0.06] flex items-center gap-2 text-[10px] font-black uppercase tracking-wider hover:border-white/15 active:scale-95"
                        title="Refrescar datos"
                    >
                        <svg className={`w-3.5 h-3.5 md:w-3 md:h-3 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        <span className="hidden md:inline">Refrescar</span>
                    </button>
                </div>
            </header>

            {error && (
                <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 font-medium text-sm flex items-center gap-3">
                    <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {error}
                </div>
            )}

            {/* ─── Panel de Resumen Financiero y Estados ─── */}
            {showStats && (
                <div className="animate-in fade-in slide-in-from-top-4 duration-500">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 mb-3 md:mb-4">
                        {/* Bono CAE Card */}
                        <div className="relative overflow-hidden p-4 rounded-xl border border-emerald-500/15"
                             style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.06) 0%, rgba(6,78,59,0.03) 100%)' }}>
                            <div className="relative flex justify-between items-center">
                                <div className="flex items-center gap-3">
                                    <div className="p-1.5 bg-emerald-500/10 rounded-lg border border-emerald-500/10">
                                        <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                    </div>
                                    <div>
                                        <span className="text-[9px] uppercase tracking-wider font-black text-emerald-400/50 block">Bono CAE</span>
                                        <div className="text-xl md:text-2xl font-black text-emerald-400 leading-none">
                                            {financialStats.totalCae.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                                        </div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <span className="text-[10px] text-white/20 font-medium block">{filteredOportunidades.length} ops</span>
                                    <span className="text-[8px] text-emerald-400/40 uppercase font-bold tracking-widest">Live</span>
                                </div>
                            </div>
                        </div>

                        {/* Beneficio Brokergy Card */}
                        <div className="relative overflow-hidden p-4 rounded-xl border border-cyan-500/15"
                             style={{ background: 'linear-gradient(135deg, rgba(6,182,212,0.06) 0%, rgba(8,47,73,0.03) 100%)' }}>
                            <div className="relative flex justify-between items-center">
                                <div className="flex items-center gap-3">
                                    <div className="p-1.5 bg-cyan-500/10 rounded-lg border border-cyan-500/10">
                                        <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                                        </svg>
                                    </div>
                                    <div>
                                        <span className="text-[9px] uppercase tracking-wider font-black text-cyan-400/50 block">Beneficio</span>
                                        <div className="text-xl md:text-2xl font-black text-cyan-400 leading-none">
                                            {financialStats.totalProfit.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                                        </div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <span className="text-[10px] text-white/20 font-medium block">{filteredOportunidades.length} ops</span>
                                    <span className="text-[8px] text-cyan-400/40 uppercase font-bold tracking-widest">Live</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Status Filter Cards */}
                    <div className="flex overflow-x-auto gap-2 pb-2 mb-4 md:mb-6 md:grid md:grid-cols-5 md:overflow-visible md:pb-0 snap-x snap-mandatory scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
                        {[
                            { label: 'Total', count: stats.total, filter: '', dotColor: 'bg-white/30', borderActive: 'border-amber-500/40', iconColor: 'text-white/30',
                              icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                            },
                            { label: 'Pendientes', count: stats.pending, filter: 'PTE ENVIAR', dotColor: 'bg-amber-500', borderActive: 'border-amber-500/40', iconColor: 'text-amber-500/40',
                              icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            },
                            { label: 'Enviadas', count: stats.sent, filter: 'ENVIADA', dotColor: 'bg-blue-400', borderActive: 'border-blue-500/40', iconColor: 'text-blue-400/40',
                              icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            },
                            { label: 'Aceptadas', count: stats.accepted, filter: 'ACEPTADA', dotColor: 'bg-emerald-400', borderActive: 'border-emerald-500/40', iconColor: 'text-emerald-400/40',
                              icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            },
                            { label: 'Rechazadas', count: stats.rejected, filter: 'RECHAZADA', dotColor: 'bg-red-400', borderActive: 'border-red-500/40', iconColor: 'text-red-400/40',
                              icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            }
                        ].map((stat, i) => (
                            <button
                                key={i}
                                onClick={() => setFilters(prev => ({ ...prev, estado: stat.filter }))}
                                className={`relative py-2.5 px-3 rounded-xl border flex items-center justify-between transition-all duration-200 hover:bg-white/[0.03] active:scale-[0.97] min-w-[140px] md:min-w-0 snap-start shrink-0 md:shrink ${
                                    filters.estado === stat.filter 
                                        ? `${stat.borderActive} bg-white/[0.04] shadow-lg` 
                                        : 'border-white/[0.06] hover:border-white/10'
                                }`}
                            >
                                <div className="flex items-center gap-2">
                                    <span className={`w-1.5 h-1.5 rounded-full ${stat.dotColor} ${filters.estado === stat.filter ? 'animate-pulse' : 'opacity-60'}`}></span>
                                    <span className="text-[9px] uppercase tracking-wider font-bold text-white/35">{stat.label}</span>
                                </div>
                                <div className={`text-sm font-black tracking-tight ${stat.count > 0 ? 'text-white' : 'text-white/15'}`}>{stat.count}</div>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* ─── Data Table ─── */}
            <div className="rounded-2xl border border-white/[0.06] overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)' }}>
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                                <th className="p-3.5 text-[10px] font-black uppercase tracking-[0.15em] text-white/25 w-24 border-b border-white/[0.06]">ID</th>
                                <th className="p-3.5 text-[10px] font-black uppercase tracking-[0.15em] text-white/25 border-b border-white/[0.06]">Ref. Cliente</th>
                                <th className="p-3.5 text-[10px] font-black uppercase tracking-[0.15em] text-white/25 border-b border-white/[0.06]">Ref. Catastral</th>
                                <th className="p-3.5 text-[10px] font-black uppercase tracking-[0.15em] text-white/25 text-right border-b border-white/[0.06]">Demanda</th>
                                <th className="p-3.5 text-[10px] font-black uppercase tracking-[0.15em] text-emerald-400/40 text-right border-b border-white/[0.06]">Bono CAE</th>
                                <th className="p-3.5 text-[10px] font-black uppercase tracking-[0.15em] text-cyan-400/40 text-right border-b border-white/[0.06]">Beneficio Brokergy</th>
                                <th className="p-3.5 text-[10px] font-black uppercase tracking-[0.15em] text-white/25 border-b border-white/[0.06]">Fecha</th>
                                <th className="p-3.5 text-[10px] font-black uppercase tracking-[0.15em] text-white/25 border-b border-white/[0.06]">Estado</th>
                            </tr>
                            {/* Fila de Filtros */}
                            <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                                <td className="p-2.5 border-b border-white/[0.06]">
                                    <input
                                        type="text"
                                        placeholder="Filtrar ID..."
                                        className="w-full bg-black/30 border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-[10px] text-white placeholder-white/20 focus:outline-none focus:border-amber-500/40 focus:bg-black/40 transition-all"
                                        value={filters.id_oportunidad}
                                        onChange={e => setFilters(prev => ({ ...prev, id_oportunidad: e.target.value }))}
                                    />
                                </td>
                                <td className="p-2.5 border-b border-white/[0.06]">
                                    <input
                                        type="text"
                                        placeholder="Filtrar Cliente..."
                                        className="w-full bg-black/30 border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-[10px] text-white placeholder-white/20 focus:outline-none focus:border-amber-500/40 focus:bg-black/40 transition-all"
                                        value={filters.referencia_cliente}
                                        onChange={e => setFilters(prev => ({ ...prev, referencia_cliente: e.target.value }))}
                                    />
                                </td>
                                <td className="p-2.5 border-b border-white/[0.06]">
                                    <input
                                        type="text"
                                        placeholder="Filtrar Catastro..."
                                        className="w-full bg-black/30 border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-[10px] text-white placeholder-white/20 focus:outline-none focus:border-amber-500/40 focus:bg-black/40 transition-all"
                                        value={filters.ref_catastral}
                                        onChange={e => setFilters(prev => ({ ...prev, ref_catastral: e.target.value }))}
                                    />
                                </td>
                                <td className="p-2.5 border-b border-white/[0.06]"></td>
                                <td className="p-2.5 border-b border-white/[0.06]"></td>
                                <td className="p-2.5 border-b border-white/[0.06]"></td>
                                <td className="p-2.5 border-b border-white/[0.06]"></td>
                                <td className="p-2.5 border-b border-white/[0.06]">
                                    <select
                                        className="w-full bg-black/30 border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-[10px] text-white focus:outline-none focus:border-amber-500/40 transition-all cursor-pointer"
                                        value={filters.estado}
                                        onChange={e => setFilters(prev => ({ ...prev, estado: e.target.value }))}
                                    >
                                        <option value="">TODOS</option>
                                        <option value="PTE ENVIAR">PTE ENVIAR</option>
                                        <option value="ENVIADA">ENVIADA</option>
                                        <option value="ACEPTADA">ACEPTADA</option>
                                        <option value="RECHAZADA">RECHAZADA</option>
                                    </select>
                                </td>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.04]">
                            {loading && filteredOportunidades.length === 0 ? (
                                <tr>
                                    <td colSpan="8" className="p-12 text-center">
                                        <div className="flex flex-col items-center gap-3">
                                            <svg className="w-6 h-6 text-white/15 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                            </svg>
                                            <span className="text-white/20 text-sm">Cargando oportunidades...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredOportunidades.length === 0 ? (
                                <tr>
                                    <td colSpan="8" className="p-12 text-center">
                                        <div className="flex flex-col items-center gap-3">
                                            <svg className="w-8 h-8 text-white/10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                            </svg>
                                            <span className="text-white/20 text-sm">No se encontraron oportunidades</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredOportunidades.map((op) => {
                                    const caeBonus = op.datos_calculo?.result?.financials?.caeBonus || 0;
                                    return (
                                        <tr
                                            key={op.id}
                                            className="hover:bg-white/[0.03] transition-colors duration-150 cursor-pointer group"
                                            onClick={() => onLoadOpportunity && onLoadOpportunity(op)}
                                        >
                                            <td className="p-3.5 text-xs font-mono text-cyan-400/80 whitespace-nowrap">{op.id_oportunidad}</td>
                                            <td className="p-3.5 text-sm text-white/90 font-medium max-w-[140px] truncate" title={op.referencia_cliente}>{op.referencia_cliente || '-'}</td>
                                            <td className="p-3.5 text-[11px] font-mono text-white/30">{op.ref_catastral}</td>
                                            <td className="p-3.5 text-sm text-white/40 font-mono text-right">
                                                {op.demanda_calefaccion ? parseFloat(op.demanda_calefaccion).toFixed(2) : '-'}
                                            </td>
                                            <td className="p-3.5 text-sm font-bold text-emerald-400 text-right">
                                                {caeBonus > 0 ? caeBonus.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }) : '-'}
                                            </td>
                                            <td className="p-3.5 text-sm font-bold text-cyan-400 text-right">
                                                {op.datos_calculo?.result?.financials?.profitBrokergy ? op.datos_calculo.result.financials.profitBrokergy.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }) : '-'}
                                            </td>
                                            <td className="p-3.5 text-[11px] text-white/25 whitespace-nowrap font-mono">
                                                {new Date(op.created_at).toLocaleDateString('es-ES')}
                                            </td>
                                            <td className="p-3.5" onClick={e => e.stopPropagation()}>
                                                <div className="flex items-center gap-2">
                                                    <select
                                                        value={op.datos_calculo?.estado || 'PTE ENVIAR'}
                                                        onChange={(e) => handleStatusChange(e, op)}
                                                        disabled={updatingStatus === op.id_oportunidad}
                                                        className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1.5 rounded-lg border outline-none cursor-pointer transition-all appearance-none ${getStatusColor(op.datos_calculo?.estado || 'PTE ENVIAR')} ${updatingStatus === op.id_oportunidad ? 'opacity-50' : ''}`}
                                                    >
                                                        <option value="PTE ENVIAR" className="bg-slate-800 text-slate-300">PTE ENVIAR</option>
                                                        <option value="ENVIADA" className="bg-slate-800 text-blue-400">ENVIADA</option>
                                                        <option value="ACEPTADA" className="bg-slate-800 text-emerald-400">ACEPTADA</option>
                                                        <option value="RECHAZADA" className="bg-slate-800 text-red-500">RECHAZADA</option>
                                                    </select>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setHistoryModalOp(op); }}
                                                        className="text-white/15 hover:text-white p-1 rounded-lg hover:bg-white/[0.06] transition-all"
                                                        title="Ver historial de estados"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                        </svg>
                                                    </button>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setOportunidadToDelete(op);
                                                        }}
                                                        className="p-1 text-white/10 hover:text-red-400 transition-all rounded-lg hover:bg-red-500/10 opacity-0 group-hover:opacity-100"
                                                        title="Eliminar Oportunidad"
                                                    >
                                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                        {filteredOportunidades.length > 0 && (
                            <tfoot>
                                <tr style={{ background: 'rgba(255,255,255,0.03)' }} className="border-t border-white/[0.08]">
                                    <td colSpan="4" className="p-3.5 text-right">
                                        <span className="text-[10px] uppercase tracking-[0.15em] font-black text-white/20">Totales</span>
                                    </td>
                                    <td className="p-3.5 text-right">
                                        <span className="text-sm font-black text-emerald-400">
                                            {financialStats.totalCae.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                                        </span>
                                    </td>
                                    <td className="p-3.5 text-right">
                                        <span className="text-sm font-black text-cyan-400">
                                            {financialStats.totalProfit.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                                        </span>
                                    </td>
                                    <td colSpan="2" className="p-3.5">
                                        <span className="text-[10px] text-white/15 font-medium">{filteredOportunidades.length} registros</span>
                                    </td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </div>

            {/* Modal de Confirmación de Borrado */}
            {oportunidadToDelete && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={(e) => e.stopPropagation()}>
                    <div className="bg-slate-900 border border-white/10 p-6 rounded-2xl w-full max-w-sm shadow-2xl relative" onClick={e => e.stopPropagation()}>
                        <div className="absolute top-0 right-0 p-4">
                            <button
                                onClick={() => setOportunidadToDelete(null)}
                                className="text-white/40 hover:text-white transition-colors"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                            <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            ¿Eliminar Oportunidad?
                        </h3>
                        <p className="text-white/60 text-sm mb-6 mt-4">
                            Se eliminarán todos los datos y ahorros calculados de esta oportunidad, liberando su Referencia Catastral. <br /><br />Esta acción es <strong>irreversible</strong>.
                        </p>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => setOportunidadToDelete(null)}
                                className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg transition-colors text-sm font-bold tracking-wider"
                                disabled={deleting}
                            >
                                CANCELAR
                            </button>
                            <button
                                onClick={handleDelete}
                                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors text-sm font-bold tracking-wider flex items-center gap-2"
                                disabled={deleting}
                            >
                                {deleting ? (
                                    <>
                                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        BORRANDO...
                                    </>
                                ) : 'SÍ, BORRAR'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Modal de Huella Temporal (Historial) */}
            {historyModalOp && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => setHistoryModalOp(null)}>
                    <div className="bg-slate-900 border border-slate-700/50 p-6 rounded-2xl w-full max-w-lg shadow-2xl relative" onClick={e => e.stopPropagation()}>
                        <div className="absolute top-0 right-0 p-4">
                            <button onClick={() => { setHistoryModalOp(null); setShowHistoryDeleteConfirm(false); setModalError(null); }} className="text-slate-400 hover:text-white transition-colors">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-white flex items-center gap-3">
                                <svg className="w-6 h-6 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                Historial de Estados
                            </h3>
                            {(historyModalOp.datos_calculo?.historial || []).length > 0 && (
                                <button
                                    onClick={() => setShowHistoryDeleteConfirm(true)}
                                    disabled={deletingHistory}
                                    className="text-[10px] font-black uppercase tracking-tighter px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg transition-all flex items-center gap-2 group mr-8"
                                >
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                    BORRAR HISTORIAL
                                </button>
                            )}
                        </div>

                        {showHistoryDeleteConfirm ? (
                            <div className="py-8 text-center animate-in fade-in zoom-in duration-200">
                                <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/20">
                                    <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                </div>
                                <h4 className="text-white font-bold mb-2 text-lg">¿Borrar todo el historial?</h4>
                                <p className="text-slate-400 text-sm mb-8 px-6">
                                    Esta acción eliminará permanentemente todos los registros de cambios de estado de esta oportunidad.
                                </p>
                                <div className="flex gap-3 justify-center">
                                    <button
                                        onClick={() => setShowHistoryDeleteConfirm(false)}
                                        className="px-6 py-2 bg-white/5 hover:bg-white/10 text-white rounded-xl transition-colors text-xs font-black uppercase tracking-widest"
                                        disabled={deletingHistory}
                                    >
                                        CANCELAR
                                    </button>
                                    <button
                                        onClick={() => handleDeleteHistory(historyModalOp.id_oportunidad)}
                                        className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl transition-colors text-xs font-black uppercase tracking-widest flex items-center gap-2 shadow-lg shadow-red-600/20"
                                        disabled={deletingHistory}
                                    >
                                        {deletingHistory ? (
                                            <>
                                                <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                </svg>
                                                BORRANDO...
                                            </>
                                        ) : 'SÍ, BORRAR TODO'}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="mb-6 p-4 bg-white/5 rounded-xl border border-white/5 flex gap-4 text-sm justify-between items-center">
                                    <div>
                                        <span className="block text-slate-400 text-xs mb-1 uppercase tracking-wider">Oportunidad</span>
                                        <span className="text-cyan-400 font-mono font-bold">{historyModalOp.id_oportunidad}</span>
                                    </div>
                                    <div className="text-right">
                                        <span className="block text-slate-400 text-xs mb-1 uppercase tracking-wider">Ref. Cliente</span>
                                        <span className="text-white font-medium">{historyModalOp.referencia_cliente || '-'}</span>
                                    </div>
                                </div>

                                {/* Botón para mostrar/ocultar formulario de comentario */}
                                {!showCommentForm ? (
                                    <div className="mb-6 flex justify-center">
                                        <button
                                            onClick={() => setShowCommentForm(true)}
                                            className="px-4 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border border-amber-500/30 rounded-xl transition-all flex items-center gap-2 group text-xs font-black uppercase tracking-widest"
                                        >
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                                            </svg>
                                            Nueva Nota
                                        </button>
                                    </div>
                                ) : (
                                    <div className="mb-8 p-4 bg-white/5 rounded-2xl border border-amber-500/30 group animate-in fade-in slide-in-from-top-2 duration-200">
                                        <div className="flex justify-between items-center mb-3">
                                            <label className="block text-[10px] font-black uppercase tracking-widest text-amber-500/80 px-1">Nueva Nota del Cliente</label>
                                            <button
                                                onClick={() => { setShowCommentForm(false); setNewComment(''); }}
                                                className="text-slate-500 hover:text-white transition-colors"
                                            >
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                            </button>
                                        </div>
                                        <div className="flex gap-3">
                                            <textarea
                                                autoFocus
                                                value={newComment}
                                                onChange={(e) => setNewComment(e.target.value)}
                                                placeholder="Escribe una actualización o nota sobre este cliente..."
                                                className="flex-1 bg-black/30 border border-white/5 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-white/20 min-h-[80px] resize-none custom-scrollbar"
                                            />
                                            <button
                                                onClick={handleAddComment}
                                                disabled={addingComment || !newComment.trim()}
                                                className={`self-end p-3 rounded-xl border border-amber-500/20 text-amber-500 hover:bg-amber-500/10 transition-all active:scale-95 disabled:opacity-30 disabled:pointer-events-none disabled:grayscale shadow-lg shadow-amber-500/10`}
                                                title="Añadir Nota"
                                            >
                                                {addingComment ? (
                                                    <svg className="w-6 h-6 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                    </svg>
                                                ) : (
                                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                                    </svg>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {modalError && (
                                    <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs font-medium animate-in slide-in-from-top-1 duration-200">
                                        <div className="flex items-center gap-2 mb-1 uppercase font-black tracking-widest text-[10px]">
                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                            Error al Procesar
                                        </div>
                                        {modalError}
                                    </div>
                                )}

                                <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                                    {(historyModalOp.datos_calculo?.historial || []).length === 0 ? (
                                        <div className="text-center py-10">
                                            <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4 border border-white/10">
                                                <svg className="w-8 h-8 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                            </div>
                                            <p className="text-slate-500 text-sm">No hay registros aún.</p>
                                        </div>
                                    ) : (
                                        [...(historyModalOp.datos_calculo.historial)].reverse().map((registro, idx, arr) => {
                                            const isComment = registro.tipo === 'comentario';
                                            return (
                                                <div key={idx} className="relative pl-6 pb-4 last:pb-0">
                                                    {idx !== arr.length - 1 && (
                                                        <div className="absolute left-[11px] top-6 bottom-0 w-[2px] bg-slate-700"></div>
                                                    )}
                                                    <div className={`absolute left-0 top-1.5 w-6 h-6 rounded-full border-2 flex items-center justify-center ${isComment ? 'bg-indigo-900/40 border-indigo-500/50' : 'bg-slate-800 border-slate-600'}`}>
                                                        {isComment ? (
                                                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-400"></div>
                                                        ) : (
                                                            <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                                                        )}
                                                    </div>

                                                    <div className={`border rounded-xl p-4 ml-4 transition-all hover:border-white/20 ${isComment ? 'bg-indigo-500/5 border-indigo-500/20' : 'bg-slate-800/50 border-slate-700/50'}`}>
                                                        <div className="flex justify-between items-start mb-2">
                                                            {isComment ? (
                                                                <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20 flex items-center gap-1.5">
                                                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                                                                    </svg>
                                                                    Nota Manual
                                                                </span>
                                                            ) : (
                                                                <span className={`text-xs font-bold uppercase tracking-wider px-2 py-1 rounded-md border ${getStatusColor(registro.estado)}`}>
                                                                    {registro.estado}
                                                                </span>
                                                            )}
                                                            <span className="text-xs text-slate-400 font-mono">
                                                                {new Date(registro.fecha).toLocaleString('es-ES', {
                                                                    day: '2-digit', month: '2-digit', year: 'numeric',
                                                                    hour: '2-digit', minute: '2-digit'
                                                                })}
                                                            </span>
                                                        </div>

                                                        <div className={`text-sm ${isComment ? 'text-indigo-100/90 italic' : 'text-slate-300'}`}>
                                                            {isComment ? registro.texto : `Estado cambiado a ${registro.estado}`}
                                                        </div>

                                                        <div className="flex justify-between items-center mt-3 pt-2 border-t border-white/5">
                                                            <div className="text-[10px] text-slate-500 flex items-center gap-1.5 uppercase tracking-tighter">
                                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                                                </svg>
                                                                Por: <span className="text-slate-400 font-bold">{registro.usuario || 'Sistema'}</span>
                                                            </div>

                                                            {isComment && (
                                                                <button
                                                                    onClick={() => handleDeleteEntry(registro.id)}
                                                                    className="p-1 text-slate-600 hover:text-red-400 transition-colors"
                                                                    title="Eliminar Nota"
                                                                >
                                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                                    </svg>
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
