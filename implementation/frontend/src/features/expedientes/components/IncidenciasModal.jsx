import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

// Procedencia (origen) de la incidencia. Los `value` coinciden con PROCEDENCIAS_VALIDAS del backend.
const PROCEDENCIAS = [
    { value: 'REVISION_INTERNA',  label: 'Revisión interna' },
    { value: 'VERIFICACION',      label: 'Verificación' },
    { value: 'GESTOR_AUTONOMICO', label: 'Gestor Autonómico' },
    { value: 'AGENTE_IA',         label: 'Agente IA' },
];
const PROCEDENCIA_LABEL = Object.fromEntries(PROCEDENCIAS.map(p => [p.value, p.label]));

// Severidad: GRAVE (hay que actuar sí o sí) | LEVE (pasable, solo observación).
const SEVERIDADES = [
    { value: 'GRAVE', label: 'Grave' },
    { value: 'LEVE',  label: 'Leve' },
];

// Mismos topes que el backend (routes/expedientes.js). Las incidencias viven dentro
// de un JSONB: aquí se corta antes de escribir para que nadie pegue un documento
// entero — eso va a Drive, aquí solo el enlace.
const MAX_TEXTO_INCIDENCIA = 4000;
const MAX_TEXTO_COMENTARIO = 2000;

// Mensaje de error del backend si lo hay, o el genérico.
const msgError = (e, fallback) => e?.response?.data?.error || fallback;

// Estilo de cada tipo de entrada del hilo de seguimiento de una incidencia.
// Los `tipo` los pone el backend (routes/expedientes.js) y el MCP.
const COMENTARIO_ESTILO = {
    RESOLUCION: {
        label: 'Subsanada',
        color: 'text-emerald-400',
        dot:   'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]',
        box:   'border-emerald-500/25 bg-emerald-500/[0.06]',
    },
    REAPERTURA: {
        label: 'Reabierta',
        color: 'text-amber-400',
        dot:   'bg-amber-400',
        box:   'border-amber-500/25 bg-amber-500/[0.05]',
    },
    SEVERIDAD: {
        label: 'Reclasificada',
        color: 'text-indigo-300',
        dot:   'bg-indigo-400',
        box:   'border-indigo-500/20 bg-indigo-500/[0.05]',
    },
    NOTA: {
        label: 'Nota',
        color: 'text-slate-300',
        dot:   'bg-slate-500',
        box:   'border-white/10 bg-white/[0.03]',
    },
};

// Modal de Incidencias del expediente (control de calidad — SOLO ADMIN).
// Permite registrar incidencias detectadas (texto libre), comentarlas en un hilo,
// reclasificar su severidad y marcarlas OK (subsanadas) explicando CÓMO se subsanaron.
// Las incidencias viven en documentacion.incidencias[] del expediente; el hilo, en
// incidencia.comentarios[] — lo mismo que escribe el MCP, así que lo que hace el
// agente por chat y lo que se hace aquí a mano acaban en el mismo sitio.
//
// Props:
//   isOpen, onClose
//   expedienteId  → id del expediente
//   onChanged()   → callback tras cada cambio (para refrescar badges del padre)
export function IncidenciasModal({ isOpen, onClose, expedienteId, onChanged }) {
    const [incidencias, setIncidencias] = useState([]);
    const [loading, setLoading]         = useState(false);
    const [error, setError]             = useState(null);

    const [newText, setNewText]   = useState('');
    const [newProcedencia, setNewProcedencia] = useState('REVISION_INTERNA');
    const [newSeveridad, setNewSeveridad] = useState('GRAVE');
    const [adding, setAdding]     = useState(false);
    const [busyId, setBusyId]     = useState(null);

    const [editingId, setEditingId]     = useState(null);
    const [editingText, setEditingText] = useState('');
    const [editingProcedencia, setEditingProcedencia] = useState('REVISION_INTERNA');
    const [editingSeveridad, setEditingSeveridad] = useState('GRAVE');

    // Popup "¿cómo se ha subsanado?" (se abre al pulsar OK) y caja de nota del hilo.
    const [resolveTarget, setResolveTarget] = useState(null);
    const [resolveText, setResolveText]     = useState('');
    const [resolving, setResolving]         = useState(false);
    const [noteFor, setNoteFor]             = useState(null);
    const [noteText, setNoteText]           = useState('');

    const fetchIncidencias = useCallback(async () => {
        if (!expedienteId) return;
        setLoading(true);
        setError(null);
        try {
            const res = await axios.get(`/api/expedientes/${expedienteId}/incidencias`);
            setIncidencias(Array.isArray(res.data) ? res.data : []);
        } catch {
            setError('No se pudieron cargar las incidencias.');
        } finally {
            setLoading(false);
        }
    }, [expedienteId]);

    useEffect(() => {
        if (isOpen) {
            fetchIncidencias();
            setNewText('');
            setNewProcedencia('REVISION_INTERNA');
            setNewSeveridad('GRAVE');
            setEditingId(null);
            setResolveTarget(null);
            setNoteFor(null);
            setError(null);
        }
    }, [isOpen, fetchIncidencias]);

    const applyResult = (data) => {
        setIncidencias(Array.isArray(data) ? data : []);
        onChanged?.();
    };

    const handleAdd = async () => {
        const texto = newText.trim();
        if (!texto || !expedienteId) return;
        setAdding(true);
        setError(null);
        try {
            const res = await axios.post(`/api/expedientes/${expedienteId}/incidencias`, { texto, procedencia: newProcedencia, severidad: newSeveridad });
            applyResult(res.data);
            setNewText('');
            setNewProcedencia('REVISION_INTERNA');
            setNewSeveridad('GRAVE');
        } catch (e) {
            setError(msgError(e, 'Error al registrar la incidencia.'));
        } finally {
            setAdding(false);
        }
    };

    // Marcar subsanada. `resolucion` es opcional pero es lo que permite que un
    // tercero sepa CÓMO se arregló sin preguntar a nadie.
    const handleResolve = async (incId, resolucion) => {
        setResolving(true);
        setBusyId(incId);
        setError(null);
        try {
            const res = await axios.patch(`/api/expedientes/${expedienteId}/incidencias/${incId}/resolver`, { resolucion: resolucion || '' });
            applyResult(res.data);
            setResolveTarget(null);
            setResolveText('');
        } catch (e) {
            setError(msgError(e, 'Error al marcar la incidencia.'));
        } finally {
            setResolving(false);
            setBusyId(null);
        }
    };

    const handleReopen = async (incId) => {
        setBusyId(incId);
        setError(null);
        try {
            const res = await axios.patch(`/api/expedientes/${expedienteId}/incidencias/${incId}/reabrir`);
            applyResult(res.data);
        } catch {
            setError('Error al reabrir la incidencia.');
        } finally {
            setBusyId(null);
        }
    };

    // Reclasificar GRAVE ⇄ LEVE pulsando la propia etiqueta. Queda traza en el hilo.
    const handleToggleSeveridad = async (inc) => {
        const destino = inc.severidad === 'GRAVE' ? 'LEVE' : 'GRAVE';
        setBusyId(inc.id);
        setError(null);
        try {
            const res = await axios.patch(`/api/expedientes/${expedienteId}/incidencias/${inc.id}/severidad`, { severidad: destino });
            applyResult(res.data);
        } catch {
            setError('Error al cambiar la severidad.');
        } finally {
            setBusyId(null);
        }
    };

    const handleAddNota = async (incId) => {
        const texto = noteText.trim();
        if (!texto) return;
        setBusyId(incId);
        setError(null);
        try {
            const res = await axios.post(`/api/expedientes/${expedienteId}/incidencias/${incId}/comentarios`, { texto });
            applyResult(res.data);
            setNoteFor(null);
            setNoteText('');
        } catch (e) {
            setError(msgError(e, 'Error al añadir la nota.'));
        } finally {
            setBusyId(null);
        }
    };

    const handleEdit = async (incId) => {
        const texto = editingText.trim();
        if (!texto) return;
        setBusyId(incId);
        setError(null);
        try {
            const res = await axios.put(`/api/expedientes/${expedienteId}/incidencias/${incId}`, { texto, procedencia: editingProcedencia, severidad: editingSeveridad });
            applyResult(res.data);
            setEditingId(null);
        } catch (e) {
            setError(msgError(e, 'Error al editar la incidencia.'));
        } finally {
            setBusyId(null);
        }
    };

    const handleDelete = async (incId) => {
        setBusyId(incId);
        setError(null);
        try {
            const res = await axios.delete(`/api/expedientes/${expedienteId}/incidencias/${incId}`);
            applyResult(res.data);
        } catch {
            setError('Error al borrar la incidencia.');
        } finally {
            setBusyId(null);
        }
    };

    if (!isOpen) return null;

    const abiertas = incidencias.filter(i => i.estado !== 'SUBSANADA');
    const subsanadas = incidencias.filter(i => i.estado === 'SUBSANADA');
    const byFecha = (a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0);
    // Abiertas primero (graves antes que leves), luego subsanadas.
    const ordered = [
        ...abiertas.filter(i => i.severidad === 'GRAVE').sort(byFecha),
        ...abiertas.filter(i => i.severidad !== 'GRAVE').sort(byFecha),
        ...subsanadas.sort((a, b) => new Date(b.resuelta_at || b.fecha || 0) - new Date(a.resuelta_at || a.fecha || 0)),
    ];
    const gravesAbiertas = abiertas.filter(i => i.severidad === 'GRAVE').length;

    const fmt = (d) => d ? new Date(d).toLocaleString('es-ES', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    }) : '';

    // Hilo de una incidencia. Las subsanadas ANTIGUAS (anteriores al hilo) no tienen
    // entrada de RESOLUCION: se sintetiza una para que la traza no tenga huecos.
    const hiloDe = (inc) => {
        const reales = Array.isArray(inc.comentarios) ? inc.comentarios : [];
        if (inc.estado === 'SUBSANADA' && !reales.some(c => c.tipo === 'RESOLUCION')) {
            return [
                ...reales,
                {
                    id: `${inc.id}_legacy_ok`,
                    tipo: 'RESOLUCION',
                    texto: '',
                    autor: inc.resuelta_por || 'Sistema',
                    fecha: inc.resuelta_at || null,
                    _sinDetalle: true,
                },
            ];
        }
        return reales;
    };

    return (
        <div
            className="fixed inset-0 z-[320] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
            onClick={onClose}
        >
            <div
                className="bg-bkg-surface border border-white/[0.1] p-6 rounded-2xl w-full max-w-lg md:max-w-3xl shadow-2xl relative"
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
                <div className="flex items-center gap-3 mb-6">
                    <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <h3 className="text-xl font-bold text-white">Incidencias</h3>
                    {gravesAbiertas > 0 && (
                        <span className="text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-md border bg-red-500/15 text-red-400 border-red-500/40 shadow-[0_0_10px_rgba(239,68,68,0.45)]">
                            {gravesAbiertas} grave{gravesAbiertas === 1 ? '' : 's'}
                        </span>
                    )}
                    {(abiertas.length - gravesAbiertas) > 0 && (
                        <span className="text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-md border bg-amber-500/15 text-amber-400 border-amber-500/40">
                            {abiertas.length - gravesAbiertas} leve{(abiertas.length - gravesAbiertas) === 1 ? '' : 's'}
                        </span>
                    )}
                </div>

                {/* Nueva incidencia */}
                <div className="mb-5 p-4 bg-white/5 rounded-2xl border border-red-500/20">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-red-400/80 mb-2 px-1">
                        Registrar incidencia detectada
                    </label>
                    <div className="mb-3 grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-[9px] font-black uppercase tracking-widest text-white/40 mb-1 px-1">Severidad</label>
                            <div className="flex gap-1.5">
                                {SEVERIDADES.map(s => {
                                    const active = newSeveridad === s.value;
                                    const isGrave = s.value === 'GRAVE';
                                    return (
                                        <button
                                            key={s.value}
                                            type="button"
                                            onClick={() => setNewSeveridad(s.value)}
                                            className={`flex-1 px-2 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                                                active
                                                    ? (isGrave
                                                        ? 'bg-red-500/20 text-red-300 border-red-500/60 shadow-[0_0_8px_rgba(239,68,68,0.4)]'
                                                        : 'bg-amber-500/20 text-amber-300 border-amber-500/60')
                                                    : 'bg-black/30 text-white/40 border-white/5 hover:text-white/70'
                                            }`}
                                        >
                                            {s.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                        <div>
                            <label className="block text-[9px] font-black uppercase tracking-widest text-white/40 mb-1 px-1">Procedencia</label>
                            <select
                                value={newProcedencia}
                                onChange={e => setNewProcedencia(e.target.value)}
                                className="w-full bg-black/30 border border-white/5 rounded-xl p-2.5 text-sm text-white focus:outline-none focus:border-red-500/40 cursor-pointer"
                            >
                                {PROCEDENCIAS.map(p => (
                                    <option key={p.value} value={p.value} className="bg-bkg-deep text-white">{p.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <textarea
                            value={newText}
                            maxLength={MAX_TEXTO_INCIDENCIA}
                            onChange={e => setNewText(e.target.value)}
                            placeholder="Describe la incidencia detectada en el expediente..."
                            className="flex-1 bg-black/30 border border-white/5 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-red-500/40 min-h-[70px] resize-none"
                        />
                        <button
                            onClick={handleAdd}
                            disabled={adding || !newText.trim()}
                            className="self-end px-4 py-3 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all active:scale-95 disabled:opacity-30 text-[10px] font-black uppercase tracking-widest whitespace-nowrap"
                        >
                            {adding ? 'Guardando...' : 'Registrar'}
                        </button>
                    </div>
                </div>

                {error && (
                    <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs flex items-center gap-2">
                        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {error}
                    </div>
                )}

                {/* Lista */}
                <div className="space-y-3 max-h-[50vh] md:max-h-[58vh] overflow-y-auto pr-2 custom-scrollbar">
                    {loading ? (
                        <div className="flex justify-center py-10">
                            <svg className="w-8 h-8 text-red-500 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                <circle className="opacity-25" cx="12" cy="12" r="10" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                        </div>
                    ) : ordered.length === 0 ? (
                        <div className="text-center py-10">
                            <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4 border border-white/10">
                                <svg className="w-8 h-8 text-emerald-500/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <p className="text-slate-500 text-sm">Sin incidencias registradas.</p>
                        </div>
                    ) : (
                        ordered.map((inc) => {
                            const isOpen = inc.estado !== 'SUBSANADA';
                            const isEditing = editingId === inc.id;
                            const busy = busyId === inc.id;
                            const isGrave = inc.severidad === 'GRAVE';
                            const hilo = hiloDe(inc);
                            return (
                                <div
                                    key={inc.id}
                                    className={`border rounded-xl p-4 transition-all ${
                                        isOpen
                                            ? (isGrave
                                                ? 'bg-red-500/[0.07] border-red-500/40'
                                                : 'bg-amber-500/[0.06] border-amber-500/30')
                                            : 'bg-emerald-500/[0.05] border-emerald-500/20'
                                    }`}
                                >
                                    <div className="flex justify-between items-start mb-2 gap-3">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            {isOpen ? (
                                                // La etiqueta de severidad es un TOGGLE: un clic la pasa de GRAVE a LEVE y al revés.
                                                <button
                                                    type="button"
                                                    onClick={() => handleToggleSeveridad(inc)}
                                                    disabled={busy}
                                                    title={`Pulsa para reclasificar como ${isGrave ? 'LEVE' : 'GRAVE'}`}
                                                    className={`group text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded border transition-all active:scale-95 disabled:opacity-40 flex items-center gap-1 ${
                                                        isGrave
                                                            ? 'text-red-400 bg-red-500/10 border-red-500/40 hover:bg-red-500/20'
                                                            : 'text-amber-400 bg-amber-500/10 border-amber-500/40 hover:bg-amber-500/20'
                                                    }`}
                                                >
                                                    {isGrave ? '⚠ Grave' : 'Leve'}
                                                    <svg className="w-2.5 h-2.5 opacity-40 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                                                    </svg>
                                                </button>
                                            ) : (
                                                <>
                                                    <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30 flex items-center gap-1.5">
                                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                        </svg>
                                                        Subsanada
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleToggleSeveridad(inc)}
                                                        disabled={busy}
                                                        title={`Pulsa para reclasificar como ${isGrave ? 'LEVE' : 'GRAVE'}`}
                                                        className="text-[9px] font-black uppercase tracking-wider text-white/40 bg-white/5 px-1.5 py-0.5 rounded border border-white/10 hover:text-white/80 hover:border-white/25 transition-all active:scale-95 disabled:opacity-40"
                                                    >
                                                        {isGrave ? 'Grave' : 'Leve'}
                                                    </button>
                                                </>
                                            )}
                                            {inc.procedencia && (
                                                <span className="text-[10px] font-black uppercase tracking-wider text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/30 flex items-center gap-1">
                                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                                    </svg>
                                                    {PROCEDENCIA_LABEL[inc.procedencia] || inc.procedencia}
                                                </span>
                                            )}
                                        </div>
                                        <span className="text-[10px] text-slate-400 font-mono shrink-0">{fmt(inc.fecha)}</span>
                                    </div>

                                    {isEditing ? (
                                        <div className="flex flex-col gap-2">
                                            <div className="grid grid-cols-2 gap-2">
                                                <select
                                                    value={editingSeveridad}
                                                    onChange={e => setEditingSeveridad(e.target.value)}
                                                    className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-xs text-white focus:outline-none cursor-pointer"
                                                >
                                                    {SEVERIDADES.map(s => (
                                                        <option key={s.value} value={s.value} className="bg-bkg-deep text-white">{s.label}</option>
                                                    ))}
                                                </select>
                                                <select
                                                    value={editingProcedencia}
                                                    onChange={e => setEditingProcedencia(e.target.value)}
                                                    className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-xs text-white focus:outline-none cursor-pointer"
                                                >
                                                    {PROCEDENCIAS.map(p => (
                                                        <option key={p.value} value={p.value} className="bg-bkg-deep text-white">{p.label}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <textarea
                                                autoFocus
                                                value={editingText}
                                                maxLength={MAX_TEXTO_INCIDENCIA}
                                                onChange={e => setEditingText(e.target.value)}
                                                className="w-full bg-black/40 border border-red-500/30 rounded-lg p-2 text-xs text-white focus:outline-none min-h-[60px] resize-none"
                                            />
                                            <div className="flex justify-end gap-2">
                                                <button
                                                    onClick={() => setEditingId(null)}
                                                    className="px-2 py-1 bg-white/5 hover:bg-white/10 text-white/60 rounded text-[9px] font-black uppercase tracking-widest"
                                                >
                                                    Cancelar
                                                </button>
                                                <button
                                                    onClick={() => handleEdit(inc.id)}
                                                    disabled={busy || !editingText.trim()}
                                                    className="px-2 py-1 bg-brand text-black rounded text-[9px] font-black uppercase tracking-widest disabled:opacity-40"
                                                >
                                                    {busy ? 'Guardando...' : 'Guardar'}
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <p className={`text-sm whitespace-pre-line ${isOpen ? 'text-white/90' : 'text-slate-400'}`}>
                                            {inc.texto}
                                        </p>
                                    )}

                                    {/* Hilo de seguimiento: notas, resolución, reaperturas y reclasificaciones */}
                                    {!isEditing && hilo.length > 0 && (
                                        <div className="mt-3 pl-3 border-l-2 border-white/10 space-y-2">
                                            {hilo.map(c => {
                                                const st = COMENTARIO_ESTILO[c.tipo] || COMENTARIO_ESTILO.NOTA;
                                                return (
                                                    <div key={c.id} className={`rounded-lg border px-3 py-2 ${st.box}`}>
                                                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                            <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                                                            <span className={`text-[9px] font-black uppercase tracking-widest ${st.color}`}>{st.label}</span>
                                                            <span className="text-[9px] text-slate-500 uppercase tracking-wider">
                                                                · {c.autor || 'Sistema'}
                                                            </span>
                                                            <span className="text-[9px] text-slate-600 font-mono ml-auto">{fmt(c.fecha)}</span>
                                                        </div>
                                                        {c.texto ? (
                                                            <p className="text-xs text-white/80 whitespace-pre-line">{c.texto}</p>
                                                        ) : (
                                                            <p className="text-xs text-slate-500 italic">
                                                                Sin detalle registrado — añade una nota si sabes cómo se resolvió.
                                                            </p>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {/* Caja para añadir una nota al hilo */}
                                    {!isEditing && noteFor === inc.id && (
                                        <div className="mt-3 flex flex-col gap-2">
                                            <textarea
                                                autoFocus
                                                value={noteText}
                                                maxLength={MAX_TEXTO_COMENTARIO}
                                                onChange={e => setNoteText(e.target.value)}
                                                placeholder="Nota de seguimiento (qué se ha hecho, qué falta, con quién se ha hablado...)"
                                                className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-white/25 min-h-[56px] resize-none"
                                            />
                                            <div className="flex justify-end gap-2">
                                                <button
                                                    onClick={() => { setNoteFor(null); setNoteText(''); }}
                                                    className="px-2 py-1 bg-white/5 hover:bg-white/10 text-white/60 rounded text-[9px] font-black uppercase tracking-widest"
                                                >
                                                    Cancelar
                                                </button>
                                                <button
                                                    onClick={() => handleAddNota(inc.id)}
                                                    disabled={busy || !noteText.trim()}
                                                    className="px-2 py-1 bg-white/10 hover:bg-white/20 text-white rounded text-[9px] font-black uppercase tracking-widest disabled:opacity-40"
                                                >
                                                    {busy ? 'Guardando...' : 'Añadir nota'}
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {!isEditing && (
                                        <div className="flex justify-between items-center mt-3 pt-2 border-t border-white/5 gap-3">
                                            <div className="text-[10px] text-slate-500 uppercase tracking-tighter">
                                                Por: <span className="text-slate-400 font-bold">{inc.usuario || 'Sistema'}</span>
                                                {!isOpen && inc.resuelta_por && (
                                                    <span className="ml-2 text-emerald-500/70">· OK por {inc.resuelta_por} {inc.resuelta_at ? `(${fmt(inc.resuelta_at)})` : ''}</span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-1">
                                                {noteFor !== inc.id && (
                                                    <button
                                                        onClick={() => { setNoteFor(inc.id); setNoteText(''); }}
                                                        className="px-2 py-1 text-slate-500 hover:text-white border border-transparent hover:border-white/15 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all"
                                                        title="Añadir una nota al hilo"
                                                    >
                                                        + Nota
                                                    </button>
                                                )}
                                                {isOpen ? (
                                                    <button
                                                        onClick={() => { setResolveTarget(inc); setResolveText(''); }}
                                                        disabled={busy}
                                                        className="px-2.5 py-1 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/40 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all active:scale-95 disabled:opacity-40 flex items-center gap-1.5"
                                                        title="Marcar como subsanada"
                                                    >
                                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                        </svg>
                                                        {busy ? '...' : 'OK'}
                                                    </button>
                                                ) : (
                                                    <button
                                                        onClick={() => handleReopen(inc.id)}
                                                        disabled={busy}
                                                        className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all disabled:opacity-40"
                                                        title="Reabrir incidencia"
                                                    >
                                                        Reabrir
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => { setEditingId(inc.id); setEditingText(inc.texto); setEditingProcedencia(inc.procedencia || 'REVISION_INTERNA'); setEditingSeveridad(inc.severidad || 'GRAVE'); }}
                                                    className="p-1 text-slate-600 hover:text-brand transition-colors"
                                                    title="Editar"
                                                >
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                                    </svg>
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(inc.id)}
                                                    disabled={busy}
                                                    className="p-1 text-slate-600 hover:text-red-400 transition-colors disabled:opacity-30"
                                                    title="Eliminar"
                                                >
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                    </svg>
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            {/* Popup "¿cómo se ha subsanado?" — no se cierra al clicar fuera para no perder el texto */}
            {resolveTarget && (
                <div
                    className="fixed inset-0 z-[330] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in"
                    onClick={e => e.stopPropagation()}
                >
                    <div className="bg-[#0F1013] border border-emerald-500/25 rounded-2xl w-full max-w-lg shadow-2xl p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center shrink-0">
                                <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                            <div>
                                <h4 className="text-base font-bold text-white leading-tight">¿Cómo se ha subsanado?</h4>
                                <p className="text-[11px] text-slate-500">
                                    Queda en el hilo de la incidencia para que cualquiera lo entienda sin preguntar.
                                </p>
                            </div>
                        </div>

                        <div className="mb-4 p-3 rounded-xl bg-white/[0.03] border border-white/10 max-h-24 overflow-y-auto custom-scrollbar">
                            <p className="text-xs text-slate-400 whitespace-pre-line">{resolveTarget.texto}</p>
                        </div>

                        <textarea
                            autoFocus
                            value={resolveText}
                            maxLength={MAX_TEXTO_COMENTARIO}
                            onChange={e => setResolveText(e.target.value)}
                            placeholder="Ej.: Se ha regenerado el CEE final como SOLO CALEFACCIÓN y se ha vuelto a subir el .xml. Verificado que cuadra con factura y RITE."
                            className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-emerald-500/40 min-h-[110px] resize-none"
                        />
                        <div className="flex justify-end mb-4 mt-1">
                            <span className={`text-[10px] font-mono ${resolveText.length > MAX_TEXTO_COMENTARIO - 200 ? 'text-amber-400' : 'text-slate-600'}`}>
                                {resolveText.length}/{MAX_TEXTO_COMENTARIO}
                            </span>
                        </div>

                        <div className="flex items-center justify-end gap-2">
                            <button
                                onClick={() => { setResolveTarget(null); setResolveText(''); }}
                                disabled={resolving}
                                className="px-3 py-2 bg-white/5 hover:bg-white/10 text-white/60 rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-40"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => handleResolve(resolveTarget.id, '')}
                                disabled={resolving}
                                className="px-3 py-2 bg-white/5 hover:bg-white/10 text-white/50 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-40"
                                title="Marcar OK sin explicar cómo (no recomendado)"
                            >
                                Sin detalle
                            </button>
                            <button
                                onClick={() => handleResolve(resolveTarget.id, resolveText)}
                                disabled={resolving || !resolveText.trim()}
                                className="px-4 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/50 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 disabled:opacity-30"
                            >
                                {resolving ? 'Guardando...' : 'Guardar y marcar OK'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
