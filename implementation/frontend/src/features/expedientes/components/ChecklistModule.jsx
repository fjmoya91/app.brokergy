import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { JustificanteUploader } from './JustificanteUploader';
import { SolicitarFaltantesModal } from './SolicitarFaltantesModal';
import { useAuth } from '../../../context/AuthContext';

// Barrido del expediente (Fase 1, solo lectura): SOLO lo que falta para poder
// (a) generar los anexos para firma y (b) cerrar el expediente final.
// Diseño centrado en lo pendiente: lo ya recibido y lo "no necesario" NO se
// listan (solo se cuentan al pie), para evitar scroll y ruido.

const RESP = {
    CLIENTE:      { label: 'Cliente',      dot: 'bg-brand',       text: 'text-brand' },
    INSTALADOR:   { label: 'Instalador',   dot: 'bg-sky-400',     text: 'text-sky-400' },
    CERTIFICADOR: { label: 'Certificador', dot: 'bg-teal-400',    text: 'text-teal-400' },
    CUALQUIERA:   { label: 'Fotos',        dot: 'bg-violet-400',  text: 'text-violet-400' },
};

// Pastilla-resumen de un objetivo (con barra de progreso done/total).
function GoalPill({ titulo, sub, total, done }) {
    const faltan = Math.max(0, total - done);
    const listo = faltan === 0;
    const pct = total > 0 ? Math.round((done / total) * 100) : 100;
    return (
        <div className={`rounded-xl border px-4 py-3 ${listo ? 'border-emerald-400/25 bg-emerald-500/[0.06]' : 'border-amber-400/25 bg-amber-500/[0.05]'}`}>
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-[12px] font-black uppercase tracking-wider text-white truncate">{titulo}</p>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-white/30">{sub}</p>
                </div>
                <span className={`text-[11px] font-black uppercase tracking-widest shrink-0 ${listo ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {listo ? '✓ Listo' : `Faltan ${faltan}`}
                </span>
            </div>
            <div className="mt-2.5 h-1 rounded-full bg-white/5 overflow-hidden">
                <div className={`h-full rounded-full transition-all ${listo ? 'bg-emerald-400' : 'bg-amber-400'}`} style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-1 text-[9px] font-bold uppercase tracking-widest text-white/25">{done}/{total} completado</p>
        </div>
    );
}

// ─── Pistas paralelas ────────────────────────────────────────────────────────
// El CEE final (certificador), los anexos de firma (cliente) y el CIFO
// (instalador) viajan A LA VEZ y a manos distintas. El `estado` del expediente es
// un único valor lineal y no puede contar las tres, así que el "quién tiene la
// pelota ahora mismo" se lee aquí, pista a pista y con su reloj.
const SITUACION = {
    OK:          { txt: 'Listo',        cls: 'border-emerald-400/25 bg-emerald-500/[0.06]', acento: 'text-emerald-400', dot: 'bg-emerald-400' },
    ESPERANDO:   { txt: 'Esperando',    cls: 'border-sky-400/25 bg-sky-500/[0.06]',         acento: 'text-sky-400',     dot: 'bg-sky-400' },
    SIN_ENVIAR:  { txt: 'Sin enviar',   cls: 'border-amber-400/25 bg-amber-500/[0.05]',     acento: 'text-amber-400',   dot: 'bg-amber-400' },
    SIN_EMITIR:  { txt: 'Sin generar',  cls: 'border-white/10 bg-white/[0.02]',             acento: 'text-white/45',    dot: 'bg-white/30' },
};

function PistaCard({ pista }) {
    const s = SITUACION[pista.situacion] || SITUACION.SIN_EMITIR;
    const resp = RESP[pista.responsable] || RESP.CUALQUIERA;
    return (
        <div className={`rounded-xl border px-3.5 py-3 ${s.cls}`}>
            <div className="flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.dot}`} />
                <p className="text-[11px] font-black uppercase tracking-wider text-white truncate flex-1">{pista.label}</p>
                <span className={`text-[9px] font-black uppercase tracking-widest shrink-0 ${s.acento}`}>{s.txt}</span>
            </div>
            {/* El reloj se etiqueta explícitamente: una pista puede estar "sin generar"
                (lo peor que la bloquea) y a la vez llevar 16 días esperando OTRO de sus
                documentos. Sin la palabra "esperando", "Sin generar · 16 d" se lee mal. */}
            <p className={`mt-0.5 text-[9px] font-bold uppercase tracking-widest ${resp.text}`}>
                {resp.label}
                {typeof pista.dias_esperando === 'number' && (
                    <span className="text-white/30"> · esperando {pista.dias_esperando} d</span>
                )}
            </p>
            {pista.pendientes.length > 0 && (
                <ul className="mt-2 space-y-0.5">
                    {pista.pendientes.map(it => (
                        <li key={it.key} className="text-[10px] text-white/45 leading-snug truncate" title={it.detalle || it.label}>
                            {it.detalle || it.label}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

// Fila compacta de un ítem PENDIENTE. `action` = botón opcional a la derecha.
function PendingRow({ it, action }) {
    const bloqueaAnexos = it.objetivos?.includes('anexos');
    return (
        <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.05]">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${bloqueaAnexos ? 'bg-amber-400' : 'bg-white/30'}`} />
            <span className="text-[13px] font-medium text-white/85 truncate flex-1">{it.label}</span>
            {bloqueaAnexos && <span className="text-[8px] font-black uppercase tracking-wider text-amber-300/80 border border-amber-400/20 rounded px-1 py-0.5 shrink-0">anexos</span>}
            {it.detalle && it.detalle !== 'Requerida — sin subir' && <span title={it.detalle} className="text-[10px] text-white/30 truncate max-w-[35%]">{it.detalle}</span>}
            {action}
        </div>
    );
}

export function ChecklistModule({ expediente, onChanged }) {
    const { user } = useAuth();
    const isAdmin = (user?.rol || '').toUpperCase() === 'ADMIN' || (user?.rol_nombre || '').toUpperCase() === 'ADMIN' || Number(user?.id_rol) === 1;
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [showSolicitar, setShowSolicitar] = useState(false);
    const [waiving, setWaiving] = useState(null); // slot en vuelo

    const load = useCallback(async () => {
        if (!expediente?.id) return;
        setLoading(true); setError(null);
        try {
            const { data } = await axios.get(`/api/expedientes/${expediente.id}/checklist`);
            setData(data);
        } catch (e) {
            setError(e.response?.data?.error || 'No se pudo cargar el barrido.');
        } finally {
            setLoading(false);
        }
    }, [expediente?.id]);

    useEffect(() => { load(); }, [load]);
    // Re-sincroniza si el justificante cambia (p.ej. subido desde la ficha del cliente).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { load(); }, [expediente?.documentacion?.justificante_titularidad_link]);

    // Marcar una foto como "no necesario" (o volver a pedirla) SIN salir del barrido.
    // Mismo endpoint que el popup de fotos y "Solicitar lo que falta": el override
    // (docs_overrides[slot].waived) vive en la OPORTUNIDAD y persiste en el expediente.
    const opId = data?.oportunidad_id || expediente?.oportunidad_id;
    const handleWaive = useCallback(async (slot, waived) => {
        if (!opId || !slot) return;
        setWaiving(slot);
        try {
            await axios.post(`/api/oportunidades/${opId}/docs/${slot}/waive`, { waived });
            await load();
            if (onChanged) onChanged();
        } catch (e) {
            setError(e.response?.data?.error || 'No se pudo marcar como no necesario.');
        } finally {
            setWaiving(null);
        }
    }, [opId, load, onChanged]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-8 gap-3 text-white/40">
                <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" /></svg>
                <span className="text-[11px] font-black uppercase tracking-widest">Calculando lo que falta…</span>
            </div>
        );
    }
    if (error) {
        return (
            <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-red-400/20 bg-red-500/[0.06]">
                <span className="text-[12px] text-red-400">⚠️ {error}</span>
                <button onClick={load} className="text-[10px] font-black uppercase tracking-widest text-white/50 hover:text-white">Reintentar</button>
            </div>
        );
    }
    if (!data) return null;

    const allItems = (data.grupos || []).flatMap(g => g.items.map(i => ({ ...i, responsable: g.responsable })));
    const goalStat = (goal) => {
        const items = allItems.filter(i => i.objetivos?.includes(goal));
        const done = items.filter(i => i.presente).length;
        return { total: items.length, done };
    };
    const anexos = goalStat('anexos');
    const final = goalStat('final');

    const recibidos = allItems.filter(i => i.presente && !i.waived).length;
    const noNecesarios = allItems.filter(i => i.waived).length;

    // Grupos con SOLO lo pendiente (no presente).
    const gruposPend = (data.grupos || [])
        .map(g => ({ ...g, pend: g.items.filter(i => !i.presente) }))
        .filter(g => g.pend.length > 0);
    const todoListo = gruposPend.length === 0;
    const hayContactables = gruposPend.some(g => g.responsable === 'CLIENTE' || g.responsable === 'INSTALADOR');

    return (
        <div className="space-y-5">
            {/* Pistas en marcha: quién tiene la pelota AHORA, en paralelo */}
            {(data.pistas || []).length > 0 && (
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/35">En marcha ahora</span>
                        <div className="flex-1 h-px bg-white/5" />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {data.pistas.map(p => <PistaCard key={p.id} pista={p} />)}
                    </div>
                </div>
            )}

            {/* Objetivos */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <GoalPill titulo="Generar anexos" sub="Para que el cliente los firme" total={anexos.total} done={anexos.done} />
                <GoalPill titulo="Expediente final" sub="Para cerrar el expediente" total={final.total} done={final.done} />
            </div>

            {/* Solicitar lo que falta (admin) — mensaje + enlace de subida por destinatario */}
            {isAdmin && hayContactables && (
                <button
                    onClick={() => setShowSolicitar(true)}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-brand/10 border border-brand/30 text-brand text-[11px] font-black uppercase tracking-widest hover:bg-brand/20 transition-all active:scale-[0.99]"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                    Solicitar lo que falta a cliente / instalador
                </button>
            )}

            {/* Solo lo pendiente */}
            {todoListo ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                    <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-400/30 flex items-center justify-center mb-3">
                        <svg className="w-7 h-7 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    </div>
                    <p className="text-sm font-black uppercase tracking-widest text-emerald-400">¡Todo recibido!</p>
                    <p className="text-[11px] text-white/40 mt-1">No falta nada por aportar en este expediente.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {gruposPend.map(g => {
                        const st = RESP[g.responsable] || RESP.CUALQUIERA;
                        return (
                            <div key={g.responsable}>
                                <div className="flex items-center gap-2 mb-2">
                                    <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                                    <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${st.text}`}>{st.label}</span>
                                    <span className="text-[10px] font-bold text-white/25">· faltan {g.pend.length}</span>
                                    <div className="flex-1 h-px bg-white/5" />
                                </div>
                                <div className="space-y-1.5">
                                    {g.pend.map(it => (
                                        it.key === 'justificante' && expediente?.id ? (
                                            <JustificanteUploader key={it.key} variant="row" label={it.label}
                                                expedienteId={expediente.id}
                                                onUploaded={() => { load(); if (onChanged) onChanged(); }} />
                                        ) : (
                                            <PendingRow key={it.key} it={it}
                                                // Solo las fotos se pueden marcar "no necesario" desde aquí
                                                // (mismo waive que el popup); el resto no es opcional.
                                                action={isAdmin && g.responsable === 'CUALQUIERA' && opId ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleWaive(it.key, true)}
                                                        disabled={waiving === it.key}
                                                        title="Marcar como no necesario (se guarda en el expediente)"
                                                        className="shrink-0 text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-lg border border-white/10 text-white/35 hover:text-amber-300 hover:border-amber-400/30 hover:bg-amber-400/[0.06] transition-all disabled:opacity-40"
                                                    >
                                                        {waiving === it.key ? '…' : '🚫 No necesario'}
                                                    </button>
                                                ) : null}
                                            />
                                        )
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Pie: contadores de lo que NO se lista + actualizar */}
            <div className="flex items-center justify-between pt-1 border-t border-white/5">
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/25">
                    {recibidos} recibido{recibidos === 1 ? '' : 's'}{noNecesarios > 0 ? ` · ${noNecesarios} no necesario${noNecesarios === 1 ? '' : 's'}` : ''}
                </span>
                <button onClick={load} className="text-[10px] font-black uppercase tracking-widest text-white/30 hover:text-brand transition-colors flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    Actualizar
                </button>
            </div>

            {showSolicitar && (
                <SolicitarFaltantesModal
                    isOpen={showSolicitar}
                    onClose={() => setShowSolicitar(false)}
                    expedienteId={expediente.id}
                    grupos={data.grupos}
                    numeroExpediente={data.numero_expediente}
                />
            )}
        </div>
    );
}

export default ChecklistModule;
