import React, { useState, useMemo } from 'react';
import { fmtDateTime, humanDays, daysSince } from '../logic/seguimientoTime';

// ─── ComunicacionesCertificador ──────────────────────────────────────────────
// Muestra la trazabilidad REAL de la comunicación admin ⇄ certificador, leyendo
// `expediente.documentacion.historial`. Hasta ahora ese historial se escribía en
// cada notify-certificador / cert-ack / notify-review / approve-cee pero NO se
// renderizaba en ninguna parte (el HistorialModal del expediente lee el historial
// de la OPORTUNIDAD, que es otro almacén). Esto resuelve el "no me deja constancia
// y no recuerdo si se lo he enviado".

// Metadatos visuales por tipo de entrada del historial.
const TIPO_META = {
    notificacion_certificador: {
        label: 'Aviso al certificador',
        dir: '→',
        color: 'brand',
        icon: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
    },
    confirmacion_certificador: {
        label: 'Confirmación del certificador',
        dir: '←',
        color: 'emerald',
        icon: 'M5 13l4 4L19 7',
    },
    notificacion_tecnica: {
        label: 'Revisión solicitada (técnico)',
        dir: '←',
        color: 'blue',
        icon: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9',
    },
    aprobacion_tecnica: {
        label: 'Visto bueno de Brokergy',
        dir: '→',
        color: 'emerald',
        icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
    },
    informativo: {
        label: 'Informativo',
        dir: '•',
        color: 'slate',
        icon: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    },
};

// Tipos que consideramos "comunicación con el certificador".
const COMM_TIPOS = Object.keys(TIPO_META);

// El `tipo` puede venir en MAYÚSCULAS porque normalizeData() del PUT /:id pone en
// mayúsculas todos los strings al re-guardar el expediente. Normalizamos a minúsculas
// para casar con TIPO_META / COMM_TIPOS de forma robusta.
const normTipo = (t) => (typeof t === 'string' ? t.toLowerCase() : t);

const COLOR_CLASSES = {
    brand:   { dot: 'bg-brand', text: 'text-brand', chip: 'bg-brand/10 border-brand/30 text-brand' },
    emerald: { dot: 'bg-emerald-500', text: 'text-emerald-400', chip: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' },
    blue:    { dot: 'bg-blue-500', text: 'text-blue-400', chip: 'bg-blue-500/10 border-blue-500/30 text-blue-400' },
    slate:   { dot: 'bg-slate-500', text: 'text-slate-300', chip: 'bg-slate-500/10 border-slate-500/30 text-slate-300' },
};

const FILTERS = [
    { id: 'all',   label: 'Todo' },
    { id: 'sent',  label: 'Enviado al cert.' },
    { id: 'recv',  label: 'Recibido del cert.' },
];

export function ComunicacionesCertificador({ expediente }) {
    const [filter, setFilter] = useState('all');

    const entries = useMemo(() => {
        const hist = expediente?.documentacion?.historial || [];
        return hist
            .filter(h => COMM_TIPOS.includes(normTipo(h.tipo)))
            .filter(h => {
                if (filter === 'all') return true;
                const dir = TIPO_META[normTipo(h.tipo)]?.dir;
                if (filter === 'sent') return dir === '→';
                if (filter === 'recv') return dir === '←';
                return true;
            })
            .slice()
            .reverse(); // más reciente primero
    }, [expediente?.documentacion?.historial, filter]);

    const totalComms = (expediente?.documentacion?.historial || []).filter(h => COMM_TIPOS.includes(normTipo(h.tipo))).length;

    // Última comunicación (de cualquier dirección) para el resumen superior.
    const lastEntry = useMemo(() => {
        const hist = (expediente?.documentacion?.historial || []).filter(h => COMM_TIPOS.includes(normTipo(h.tipo)));
        return hist.length ? hist[hist.length - 1] : null;
    }, [expediente?.documentacion?.historial]);
    const lastDays = lastEntry ? daysSince(lastEntry.fecha) : null;

    if (totalComms === 0) {
        return (
            <div className="p-10 text-center bg-white/[0.01] border border-dashed border-white/10 rounded-2xl">
                <div className="w-12 h-12 rounded-full bg-white/[0.03] border border-white/10 flex items-center justify-center mx-auto mb-3">
                    <svg className="w-6 h-6 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                </div>
                <p className="text-white/30 font-black uppercase tracking-widest text-[10px]">Sin comunicaciones registradas con el certificador</p>
                <p className="text-white/15 text-[10px] mt-1">Cada aviso, confirmación o visto bueno quedará registrado aquí automáticamente.</p>
            </div>
        );
    }

    return (
        <div className="space-y-5">
            {/* Resumen superior */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-white/40">
                    <span className="text-white/60 font-black">{totalComms}</span> registro{totalComms !== 1 ? 's' : ''}
                    {lastDays != null && (
                        <span className="ml-1 text-white/30">· última {humanDays(lastDays)}</span>
                    )}
                </div>
                <div className="flex bg-black/40 p-1 rounded-xl border border-white/[0.06]">
                    {FILTERS.map(f => (
                        <button
                            key={f.id}
                            onClick={() => setFilter(f.id)}
                            className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${
                                filter === f.id ? 'bg-brand text-black shadow-lg shadow-brand/20' : 'text-white/40 hover:text-white/60'
                            }`}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Timeline */}
            <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1 custom-scrollbar">
                {entries.length === 0 ? (
                    <p className="text-center text-white/20 text-[10px] font-bold uppercase tracking-widest py-8">Sin registros para este filtro</p>
                ) : entries.map((e, idx) => {
                    const meta = TIPO_META[normTipo(e.tipo)] || TIPO_META.informativo;
                    const c = COLOR_CLASSES[meta.color] || COLOR_CLASSES.slate;
                    const isUrgent = e.priority === 'urgent';
                    return (
                        <div key={e.id || idx} className="relative pl-5">
                            <div className={`absolute left-0 top-2 w-2.5 h-2.5 rounded-full ${c.dot} shadow-[0_0_8px_currentColor]`} />
                            <div className={`border rounded-xl p-4 ml-2 transition-all hover:border-white/15 ${isUrgent ? 'bg-red-500/[0.04] border-red-500/20' : 'bg-white/[0.02] border-white/[0.06]'}`}>
                                <div className="flex items-start justify-between gap-3 mb-1.5">
                                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[9px] font-black uppercase tracking-widest ${c.chip}`}>
                                        <span className="text-[11px] leading-none">{meta.dir}</span>
                                        {meta.label}
                                    </span>
                                    <span className="text-[10px] text-white/30 font-mono whitespace-nowrap shrink-0">{fmtDateTime(e.fecha)}</span>
                                </div>
                                <p className="text-[12px] text-white/70 leading-relaxed whitespace-pre-line">{e.texto}</p>
                                <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/[0.04]">
                                    <span className="text-[9px] text-white/30 font-bold uppercase tracking-wider">Por: <span className="text-white/50">{e.usuario || 'Sistema'}</span></span>
                                    {isUrgent && (
                                        <span className="text-[9px] font-black uppercase tracking-widest text-red-400 bg-red-500/10 border border-red-500/30 px-2 py-0.5 rounded">🚨 Urgente</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
