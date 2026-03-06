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
            await axios.delete(`/api/oportunidades/${oportunidadToDelete.ref_catastral}`);
            setOportunidades(prev => prev.filter(op => op.ref_catastral !== oportunidadToDelete.ref_catastral));
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
            setOportunidades(prev => prev.map(o => {
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
            }));

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

    const getStatusColor = (status) => {
        switch (status) {
            case 'ENVIADA': return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
            case 'ACEPTADA': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
            case 'RECHAZADA': return 'bg-red-500/10 text-red-400 border-red-500/30';
            default: return 'bg-slate-500/10 text-slate-400 border-slate-500/30'; // PTE ENVIAR
        }
    };

    return (
        <div className="animate-fade-in w-full max-w-[1400px] mx-auto px-4 py-8">
            <header className="mb-8 flex justify-between items-end border-b border-white/10 pb-4">
                <div>
                    <h2 className="text-3xl font-black text-white flex items-center gap-3">
                        <svg className="w-8 h-8 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                        Panel de Control
                    </h2>
                    <p className="text-white/60 mt-2 text-sm uppercase tracking-widest font-bold">
                        Gestión de Oportunidades
                    </p>
                </div>
                <button
                    onClick={fetchOportunidades}
                    className="p-2 bg-white/5 hover:bg-white/10 text-white rounded-lg transition-colors border border-white/10 flex items-center gap-2 text-xs font-bold tracking-wider"
                >
                    <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Refrescar
                </button>
            </header>

            {error && (
                <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 font-medium">
                    {error}
                </div>
            )}

            <div className="glass-card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-white/5 border-b border-white/10">
                                <th className="p-3 text-[11px] font-black uppercase tracking-wider text-slate-400">ID</th>
                                <th className="p-3 text-[11px] font-black uppercase tracking-wider text-slate-400">Ref. Cliente</th>
                                <th className="p-3 text-[11px] font-black uppercase tracking-wider text-slate-400">Ref. Catastral</th>
                                <th className="p-3 text-[11px] font-black uppercase tracking-wider text-slate-400">Demanda</th>
                                <th className="p-3 text-[11px] font-black uppercase tracking-wider text-slate-400">Bono CAE</th>
                                <th className="p-3 text-[11px] font-black uppercase tracking-wider text-slate-400">Fecha</th>
                                <th className="p-3 text-[11px] font-black uppercase tracking-wider text-slate-400">Estado</th>
                                <th className="p-3 text-[11px] font-black uppercase tracking-wider text-slate-400 text-center">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {loading && oportunidades.length === 0 ? (
                                <tr>
                                    <td colSpan="8" className="p-8 text-center text-slate-500">Cargando oportunidades...</td>
                                </tr>
                            ) : oportunidades.length === 0 ? (
                                <tr>
                                    <td colSpan="8" className="p-8 text-center text-slate-500">No hay oportunidades guardadas todavía.</td>
                                </tr>
                            ) : (
                                oportunidades.map((op) => {
                                    const caeBonus = op.datos_calculo?.result?.financials?.caeBonus || 0;
                                    return (
                                        <tr
                                            key={op.id}
                                            className="hover:bg-white/[0.04] transition-colors cursor-pointer group"
                                            onClick={() => onLoadOpportunity && onLoadOpportunity(op)}
                                        >
                                            <td className="p-3 text-xs font-mono text-cyan-400 whitespace-nowrap">{op.id_oportunidad}</td>
                                            <td className="p-3 text-sm text-white font-medium max-w-[140px] truncate" title={op.referencia_cliente}>{op.referencia_cliente || '-'}</td>
                                            <td className="p-3 text-[11px] font-mono text-slate-300">{op.ref_catastral}</td>
                                            <td className="p-3 text-sm text-green-400 font-mono">
                                                {op.demanda_calefaccion ? parseFloat(op.demanda_calefaccion).toFixed(2) : '-'}
                                            </td>
                                            <td className="p-3 text-sm font-bold text-lime-400">
                                                {caeBonus > 0 ? caeBonus.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }) : '-'}
                                            </td>
                                            <td className="p-3 text-[11px] text-slate-400 whitespace-nowrap">
                                                {new Date(op.created_at).toLocaleDateString('es-ES')}
                                            </td>
                                            <td className="p-3" onClick={e => e.stopPropagation()}>
                                                <div className="flex items-center gap-2">
                                                    <select
                                                        value={op.datos_calculo?.estado || 'PTE ENVIAR'}
                                                        onChange={(e) => handleStatusChange(e, op)}
                                                        disabled={updatingStatus === op.id_oportunidad}
                                                        className={`text-xs font-bold uppercase tracking-wider px-2 py-1.5 rounded-md border outline-none cursor-pointer transition-colors appearance-none ${getStatusColor(op.datos_calculo?.estado || 'PTE ENVIAR')} ${updatingStatus === op.id_oportunidad ? 'opacity-50' : ''}`}
                                                    >
                                                        <option value="PTE ENVIAR" className="bg-slate-800 text-slate-300">PTE ENVIAR</option>
                                                        <option value="ENVIADA" className="bg-slate-800 text-blue-400">ENVIADA</option>
                                                        <option value="ACEPTADA" className="bg-slate-800 text-emerald-400">ACEPTADA</option>
                                                        <option value="RECHAZADA" className="bg-slate-800 text-red-500">RECHAZADA</option>
                                                    </select>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setHistoryModalOp(op); }}
                                                        className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-white/10 transition-colors"
                                                        title="Ver historial de estados"
                                                    >
                                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            </td>
                                            <td className="p-4 text-right">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setOportunidadToDelete(op);
                                                    }}
                                                    className="p-2 text-white/20 hover:text-red-400 transition-colors rounded-lg hover:bg-red-500/10 opacity-0 group-hover:opacity-100"
                                                    title="Eliminar Oportunidad"
                                                >
                                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                    </svg>
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
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
                            <button onClick={() => { setHistoryModalOp(null); setShowHistoryDeleteConfirm(false); }} className="text-slate-400 hover:text-white transition-colors">
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

                                <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                                    {(historyModalOp.datos_calculo?.historial || []).length === 0 ? (
                                        <div className="text-center py-10">
                                            <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4 border border-white/10">
                                                <svg className="w-8 h-8 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                            </div>
                                            <p className="text-slate-500 text-sm">No hay registros de cambios de estado.</p>
                                        </div>
                                    ) : (
                                        [...(historyModalOp.datos_calculo.historial)].reverse().map((registro, idx, arr) => (
                                            <div key={idx} className="relative pl-6 pb-4 last:pb-0">
                                                {idx !== arr.length - 1 && (
                                                    <div className="absolute left-[11px] top-6 bottom-0 w-[2px] bg-slate-700"></div>
                                                )}
                                                <div className="absolute left-0 top-1.5 w-6 h-6 rounded-full bg-slate-800 border-2 border-slate-600 flex items-center justify-center">
                                                    <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                                                </div>

                                                <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 ml-4">
                                                    <div className="flex justify-between items-start mb-2">
                                                        <span className={`text-xs font-bold uppercase tracking-wider px-2 py-1 rounded-md border ${getStatusColor(registro.estado)}`}>
                                                            {registro.estado}
                                                        </span>
                                                        <span className="text-xs text-slate-400 font-mono">
                                                            {new Date(registro.fecha).toLocaleString('es-ES', {
                                                                day: '2-digit', month: '2-digit', year: 'numeric',
                                                                hour: '2-digit', minute: '2-digit'
                                                            })}
                                                        </span>
                                                    </div>
                                                    <div className="text-xs text-slate-500 mt-2 flex items-center gap-1.5">
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                                        </svg>
                                                        Cambiado por: <span className="text-slate-300">{registro.usuario || 'Sistema'}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))
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
