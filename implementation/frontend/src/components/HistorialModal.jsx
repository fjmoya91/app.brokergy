import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const STATUS_COLORS = {
    'PTE ENVIAR': 'bg-slate-500/20 text-slate-300 border-slate-500/40',
    'EN CURSO':   'bg-blue-500/20 text-blue-300 border-blue-500/40',
    'ENVIADA':    'bg-amber-500/20 text-amber-300 border-amber-500/40',
    'ACEPTADA':   'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
};
const getStatusColor = (estado) => STATUS_COLORS[estado] || 'bg-slate-500/20 text-slate-300 border-slate-500/40';

export function HistorialModal({ isOpen, onClose, idOportunidad, referenciaCliente }) {
    const { user } = useAuth();

    const [historial, setHistorial]                 = useState([]);
    const [loading, setLoading]                     = useState(false);
    const [filter, setFilter]                       = useState('all');
    const [showNoteForm, setShowNoteForm]           = useState(false);
    const [newComment, setNewComment]               = useState('');
    const [addingComment, setAddingComment]         = useState(false);
    const [editingEntryId, setEditingEntryId]       = useState(null);
    const [editingText, setEditingText]             = useState('');
    const [updatingEntry, setUpdatingEntry]         = useState(false);
    const [deletingEntry, setDeletingEntry]         = useState(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deletingHistory, setDeletingHistory]     = useState(false);
    const [modalError, setModalError]               = useState(null);

    const fetchHistorial = useCallback(async () => {
        if (!idOportunidad) return;
        setLoading(true);
        setModalError(null);
        try {
            const res = await axios.get(`/api/oportunidades/${idOportunidad}`);
            setHistorial(res.data?.datos_calculo?.historial || []);
        } catch {
            setModalError('Error al cargar el historial.');
        } finally {
            setLoading(false);
        }
    }, [idOportunidad]);

    useEffect(() => {
        if (isOpen) {
            fetchHistorial();
            setFilter('all');
            setShowNoteForm(false);
            setNewComment('');
            setEditingEntryId(null);
            setShowDeleteConfirm(false);
            setModalError(null);
        }
    }, [isOpen, fetchHistorial]);

    const handleAddComment = async () => {
        if (!newComment.trim() || !idOportunidad) return;
        setAddingComment(true);
        setModalError(null);
        try {
            await axios.post(`/api/oportunidades/${idOportunidad}/comentarios`, { comentario: newComment.trim() });
            setNewComment('');
            setShowNoteForm(false);
            await fetchHistorial();
        } catch {
            setModalError('Error al guardar la nota.');
        } finally {
            setAddingComment(false);
        }
    };

    const handleEditEntry = async (entryId) => {
        if (!editingText.trim()) return;
        setUpdatingEntry(true);
        setModalError(null);
        try {
            await axios.put(`/api/oportunidades/${idOportunidad}/historial/${entryId}`, { texto: editingText });
            setEditingEntryId(null);
            await fetchHistorial();
        } catch {
            setModalError('Error al editar la nota.');
        } finally {
            setUpdatingEntry(false);
        }
    };

    const handleDeleteEntry = async (entryId) => {
        setDeletingEntry(entryId);
        setModalError(null);
        try {
            await axios.delete(`/api/oportunidades/${idOportunidad}/historial/${entryId}`);
            await fetchHistorial();
        } catch {
            setModalError('Error al eliminar la nota.');
        } finally {
            setDeletingEntry(null);
        }
    };

    const handleDeleteHistory = async () => {
        setDeletingHistory(true);
        setModalError(null);
        try {
            await axios.delete(`/api/oportunidades/${idOportunidad}/historial`);
            setHistorial([]);
            setShowDeleteConfirm(false);
        } catch {
            setModalError('Error al borrar el historial.');
        } finally {
            setDeletingHistory(false);
        }
    };

    if (!isOpen) return null;

    const filtered = [...historial]
        .filter(h => {
            if (filter === 'notes') return h.tipo === 'comentario';
            if (filter === 'status') return h.tipo !== 'comentario';
            return true;
        })
        .reverse();

    return (
        <div
            className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
            onClick={onClose}
        >
            <div
                className="bg-bkg-surface border border-white/[0.1] p-6 rounded-2xl w-full max-w-lg shadow-2xl relative"
                onClick={e => e.stopPropagation()}
            >
                {/* Close */}
                <div className="absolute top-0 right-0 p-4">
                    <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Header */}
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold text-white flex items-center gap-3">
                        <svg className="w-6 h-6 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Historial de Estados
                    </h3>
                    <div className="flex items-center gap-2 mr-8">
                        <div className="flex bg-black/40 p-1 rounded-xl border border-white/[0.06] mr-2">
                            {['all', 'notes', 'status'].map(f => (
                                <button
                                    key={f}
                                    onClick={() => setFilter(f)}
                                    className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${filter === f ? 'bg-brand text-black shadow-lg shadow-brand/20' : 'text-white/40 hover:text-white/60'}`}
                                >
                                    {f === 'all' ? 'TODO' : f === 'notes' ? 'NOTAS' : 'ESTADOS'}
                                </button>
                            ))}
                        </div>
                        {historial.length > 0 && (
                            <button
                                onClick={() => setShowDeleteConfirm(true)}
                                disabled={deletingHistory}
                                className="text-[10px] font-black uppercase tracking-tighter px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg transition-all flex items-center gap-2"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                                BORRAR
                            </button>
                        )}
                    </div>
                </div>

                {/* Oportunidad info */}
                <div className="mb-6 p-4 bg-white/5 rounded-xl border border-white/5 flex gap-4 text-sm justify-between items-center">
                    <div>
                        <span className="block text-slate-400 text-xs mb-1 uppercase tracking-wider">Oportunidad</span>
                        <span className="text-cyan-400 font-mono font-bold">{idOportunidad}</span>
                    </div>
                    {referenciaCliente && (
                        <div className="text-right">
                            <span className="block text-slate-400 text-xs mb-1 uppercase tracking-wider">Ref. Cliente</span>
                            <span className="text-white font-medium">{referenciaCliente}</span>
                        </div>
                    )}
                </div>

                {/* Confirm delete all */}
                {showDeleteConfirm ? (
                    <div className="py-8 text-center animate-in fade-in zoom-in duration-200">
                        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/20">
                            <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        </div>
                        <h4 className="text-white font-bold mb-2 text-lg">¿Borrar todo el historial?</h4>
                        <p className="text-slate-400 text-sm mb-8 px-6">Esta acción eliminará permanentemente todos los registros.</p>
                        <div className="flex gap-3 justify-center">
                            <button
                                onClick={() => setShowDeleteConfirm(false)}
                                disabled={deletingHistory}
                                className="px-6 py-2 bg-white/5 hover:bg-white/10 text-white rounded-xl transition-colors text-xs font-black uppercase tracking-widest"
                            >
                                CANCELAR
                            </button>
                            <button
                                onClick={handleDeleteHistory}
                                disabled={deletingHistory}
                                className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl transition-colors text-xs font-black uppercase tracking-widest flex items-center gap-2 shadow-lg shadow-red-600/20"
                            >
                                {deletingHistory ? 'BORRANDO...' : 'SÍ, BORRAR TODO'}
                            </button>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Nueva nota button / form */}
                        {!showNoteForm ? (
                            <div className="mb-6 flex justify-center">
                                <button
                                    onClick={() => setShowNoteForm(true)}
                                    className="px-4 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border border-amber-500/30 rounded-xl transition-all flex items-center gap-2 text-xs font-black uppercase tracking-widest"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                                    </svg>
                                    Nueva Nota
                                </button>
                            </div>
                        ) : (
                            <div className="mb-8 p-4 bg-white/5 rounded-2xl border border-amber-500/30 animate-in fade-in slide-in-from-top-2 duration-200">
                                <div className="flex justify-between items-center mb-3">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-amber-500/80 px-1">Nueva Nota del Cliente</label>
                                    <button onClick={() => { setShowNoteForm(false); setNewComment(''); }} className="text-slate-500 hover:text-white transition-colors">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                                <div className="flex gap-3">
                                    <textarea
                                        autoFocus
                                        value={newComment}
                                        onChange={e => setNewComment(e.target.value)}
                                        placeholder="Escribe una actualización o nota sobre este cliente..."
                                        className="flex-1 bg-black/30 border border-white/5 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-white/20 min-h-[80px] resize-none"
                                    />
                                    <button
                                        onClick={handleAddComment}
                                        disabled={addingComment || !newComment.trim()}
                                        className="self-end p-3 rounded-xl border border-amber-500/20 text-amber-500 hover:bg-amber-500/10 transition-all active:scale-95 disabled:opacity-30"
                                    >
                                        {addingComment ? (
                                            <svg className="w-6 h-6 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" strokeWidth="4" />
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
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
                            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs flex items-center gap-2">
                                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                {modalError}
                            </div>
                        )}

                        {/* Timeline */}
                        <div className="space-y-4 max-h-[55vh] overflow-y-auto pr-2 custom-scrollbar">
                            {loading ? (
                                <div className="flex justify-center py-10">
                                    <svg className="w-8 h-8 text-brand animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                    </svg>
                                </div>
                            ) : filtered.length === 0 ? (
                                <div className="text-center py-10">
                                    <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4 border border-white/10">
                                        <svg className="w-8 h-8 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                    </div>
                                    <p className="text-slate-500 text-sm">No hay registros aún.</p>
                                </div>
                            ) : (
                                filtered.map((registro, idx, arr) => {
                                    const isComment = registro.tipo === 'comentario';
                                    const isEditing = editingEntryId === registro.id;
                                    return (
                                        <div key={idx} className="relative pl-6 pb-4 last:pb-0">
                                            {idx !== arr.length - 1 && (
                                                <div className="absolute left-[11px] top-6 bottom-0 w-[2px] bg-slate-700" />
                                            )}
                                            <div className={`absolute left-0 top-1.5 w-6 h-6 rounded-full border-2 flex items-center justify-center ${isComment ? 'bg-indigo-900/40 border-indigo-500/50' : 'bg-slate-800 border-slate-600'}`}>
                                                <div className={`w-2 h-2 rounded-full ${isComment ? 'bg-indigo-400' : 'bg-amber-500'}`} />
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
                                                    {isComment ? (
                                                        isEditing ? (
                                                            <div className="flex flex-col gap-2">
                                                                <textarea
                                                                    autoFocus
                                                                    value={editingText}
                                                                    onChange={e => setEditingText(e.target.value)}
                                                                    className="w-full bg-black/40 border border-brand/30 rounded-lg p-2 text-xs text-white focus:outline-none min-h-[60px] resize-none"
                                                                />
                                                                <div className="flex justify-end gap-2">
                                                                    <button
                                                                        onClick={() => setEditingEntryId(null)}
                                                                        className="px-2 py-1 bg-white/5 hover:bg-white/10 text-white/60 rounded text-[9px] font-black uppercase tracking-widest"
                                                                    >
                                                                        CANCELAR
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleEditEntry(registro.id)}
                                                                        disabled={updatingEntry || !editingText.trim()}
                                                                        className="px-2 py-1 bg-brand text-black rounded text-[9px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 disabled:opacity-50"
                                                                    >
                                                                        {updatingEntry ? 'GUARDANDO...' : 'GUARDAR'}
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ) : registro.texto
                                                    ) : `Estado cambiado a ${registro.estado}`}
                                                </div>

                                                <div className="flex justify-between items-center mt-3 pt-2 border-t border-white/5">
                                                    <div className="text-[10px] text-slate-500 flex items-center gap-1.5 uppercase tracking-tighter">
                                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                                        </svg>
                                                        Por: <span className="text-slate-400 font-bold">{registro.usuario || 'Sistema'}</span>
                                                    </div>

                                                    {isComment && (
                                                        <div className="flex items-center gap-1">
                                                            {user?.rol === 'ADMIN' && (
                                                                <button
                                                                    onClick={() => { setEditingEntryId(registro.id); setEditingText(registro.texto); }}
                                                                    className="p-1 text-slate-600 hover:text-brand transition-colors"
                                                                    title="Editar Nota"
                                                                >
                                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                                                    </svg>
                                                                </button>
                                                            )}
                                                            <button
                                                                onClick={() => handleDeleteEntry(registro.id)}
                                                                disabled={deletingEntry === registro.id}
                                                                className="p-1 text-slate-600 hover:text-red-400 transition-colors disabled:opacity-30"
                                                                title="Eliminar Nota"
                                                            >
                                                                {deletingEntry === registro.id ? (
                                                                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                                                        <circle className="opacity-25" cx="12" cy="12" r="10" strokeWidth="4" />
                                                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                                                    </svg>
                                                                ) : (
                                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                                    </svg>
                                                                )}
                                                            </button>
                                                        </div>
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
    );
}
