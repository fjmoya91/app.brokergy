import React, { useState, useEffect } from 'react';
import { readPhaseTime, fmtDate, humanDays, STALE_CLASSES } from '../logic/seguimientoTime';

const STATUS_CONFIG = {
    cee_inicial: {
        title: 'Certificado Energético Inicial',
        color: 'amber',
        options: [
            { id: 'ASIGNADO', label: 'Asignado a Técnico' },
            { id: 'EN_TRABAJO', label: 'Técnico Trabajando' },
            { id: 'PTE_REVISION', label: 'Pendiente Revisión' },
            { id: 'REVISADO', label: 'Revisado y Listo' },
            { id: 'PTE_PRESENTACION', label: 'Pendiente presentación' },
            { id: 'REGISTRADO', label: 'Registrado' }
        ]
    },
    cee_final: {
        title: 'Certificado Energético Final',
        color: 'emerald',
        options: [
            { id: 'ASIGNADO', label: 'Asignado a Técnico' },
            { id: 'EN_TRABAJO', label: 'Técnico Trabajando' },
            { id: 'PTE_REVISION', label: 'Pendiente Revisión' },
            { id: 'REVISADO', label: 'Revisado y Listo' },
            { id: 'PTE_PRESENTACION', label: 'Pendiente presentación' },
            { id: 'REGISTRADO', label: 'Registrado' }
        ]
    },
    anexos: {
        title: 'Documentación y Anexos',
        color: 'brand',
        options: [
            { id: 'PTE_EMITIR', label: 'Pendiente de emitir' },
            { id: 'PTE_ENVIAR', label: 'Pendiente de enviar' },
            { id: 'ENVIADO', label: 'Enviado' },
            { id: 'FIRMADOS', label: 'Firmados' }
        ]
    }
};

export function SeguimientoModule({ expediente, onSave, saving }) {
    const [local, setLocal] = useState({
        cee_inicial: 'ASIGNADO',
        cee_final: 'ASIGNADO',
        anexos: 'PTE_EMITIR',
        ...(expediente?.seguimiento || {})
    });

    const [hasChanges, setHasChanges] = useState(false);
    // Claves que el usuario ha tocado a mano en esta sesión de edición. Solo esas se
    // envían: `local` arrastra los defaults de arriba ('ASIGNADO'…) para las claves
    // que aún no existen, y mandarlo entero degradaba subestados que nadie tocó.
    const [dirty, setDirty] = useState(() => new Set());

    useEffect(() => {
        if (expediente?.seguimiento) {
            setLocal({
                cee_inicial: 'ASIGNADO',
                cee_final: 'ASIGNADO',
                anexos: 'PTE_EMITIR',
                ...expediente.seguimiento
            });
            setHasChanges(false);
            setDirty(new Set());
        }
    }, [expediente?.seguimiento]);

    const updateStatus = (key, val) => {
        setLocal(prev => ({ ...prev, [key]: val }));
        setDirty(prev => new Set(prev).add(key));
        setHasChanges(true);
    };

    const handleSave = () => {
        if (!onSave) return;
        // Solo los subestados cambiados a mano. `seguimiento_manual` autoriza al
        // backend a aceptar una regresión desde REGISTRADO (que si no, protege).
        const patch = {};
        for (const key of dirty) patch[key] = local[key];
        if (!Object.keys(patch).length) return;
        onSave({ seguimiento: patch, seguimiento_manual: true });
    };

    return (
        <div className="space-y-8 py-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {Object.entries(STATUS_CONFIG).map(([key, config]) => {
                    const currentId = local[key];
                    const currentIndex = config.options.findIndex(o => o.id === currentId);
                    const phaseTime = readPhaseTime(local, key);
                    const isFinalState = currentIndex === config.options.length - 1;

                    return (
                        <div key={key} className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6 flex flex-col h-full group hover:border-white/10 transition-all">
                            <div className="flex items-center gap-3 mb-3">
                                <div className={`w-2 h-2 rounded-full ${
                                    config.color === 'amber' ? 'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]' :
                                    config.color === 'emerald' ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' :
                                    'bg-brand shadow-[0_0_10px_rgba(0,183,255,0.5)]'
                                }`} />
                                <h3 className="text-[11px] font-black text-white uppercase tracking-widest leading-none mt-1">
                                    {config.title}
                                </h3>
                            </div>

                            {/* Tiempo en el estado actual (color por antigüedad) */}
                            <div className="mb-5 min-h-[24px]">
                                {phaseTime.diasEnEstado != null && !isFinalState ? (
                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[9px] font-black uppercase tracking-widest ${STALE_CLASSES[phaseTime.nivel]}`}>
                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                        {phaseTime.diasEnEstado === 0 ? 'Hoy' : `${phaseTime.diasEnEstado} día${phaseTime.diasEnEstado !== 1 ? 's' : ''} en este estado`}
                                    </span>
                                ) : isFinalState ? (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[9px] font-black uppercase tracking-widest text-emerald-400 border-emerald-500/30 bg-emerald-500/10">
                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                        Completado
                                    </span>
                                ) : (
                                    <span className="text-[9px] text-white/20 font-bold uppercase tracking-widest">Sin registro de fecha</span>
                                )}
                            </div>

                            <div className="flex-1 space-y-3">
                                {config.options.map((opt, idx) => {
                                    const isDone = idx < currentIndex;
                                    const isCurrent = idx === currentIndex;
                                    const tsIso = phaseTime.ts?.[opt.id];

                                    return (
                                        <button
                                            key={opt.id}
                                            onClick={() => updateStatus(key, opt.id)}
                                            className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                                                isCurrent
                                                    ? 'bg-white/10 border-white/20 text-white shadow-lg'
                                                    : isDone
                                                        ? 'bg-transparent border-transparent text-white/40'
                                                        : 'bg-transparent border-transparent text-white/10 hover:text-white/30'
                                            }`}
                                        >
                                            <div className={`w-5 h-5 rounded-full flex items-center justify-center border-2 shrink-0 transition-all ${
                                                isCurrent ? 'border-brand bg-brand text-bkg-deep' :
                                                isDone ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500' :
                                                'border-white/10 text-transparent'
                                            }`}>
                                                {(isDone || isCurrent) && (
                                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                )}
                                            </div>
                                            <span className={`flex-1 text-[11px] font-black uppercase tracking-wider ${isCurrent ? 'text-white' : ''}`}>
                                                {opt.label}
                                            </span>
                                            {tsIso && (isDone || isCurrent) && (
                                                <span className="text-[9px] font-mono text-white/30 shrink-0">{fmtDate(tsIso)}</span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Última comunicación al certificador (solo fases CEE) */}
                            {(key === 'cee_inicial' || key === 'cee_final') && phaseTime.lastContacto && (
                                <div className="mt-4 pt-3 border-t border-white/[0.04] flex items-center gap-2">
                                    <svg className="w-3 h-3 text-white/20 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                                    <span className="text-[9px] text-white/30 font-bold uppercase tracking-wider">
                                        Último aviso al cert.: <span className="text-white/50">{fmtDate(phaseTime.lastContacto)}</span>
                                    </span>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {hasChanges && (
                <div className="flex justify-end pt-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-3 px-8 py-3.5 bg-brand text-bkg-deep font-black text-[11px] uppercase tracking-widest rounded-xl hover:shadow-xl hover:shadow-brand/20 active:scale-95 transition-all disabled:opacity-50"
                    >
                         <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                        {saving ? 'Guardando...' : 'Aplicar Cambios Seguimiento'}
                    </button>
                </div>
            )}
            
            <div className="mt-8 p-6 bg-white/[0.02] border border-white/[0.04] rounded-2xl">
                 <div className="flex items-center gap-3 mb-4">
                    <svg className="w-4 h-4 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <h4 className="text-[10px] font-black text-white/40 uppercase tracking-widest">Resumen de Pendientes</h4>
                 </div>
                 <div className="space-y-1">
                    {Object.entries(STATUS_CONFIG).map(([key, config]) => {
                        const current = config.options.find(o => o.id === local[key]);
                        const isFinal = current?.id === config.options[config.options.length - 1].id;
                        
                        return (
                            <div key={key} className="flex items-center justify-between py-1 border-b border-white/[0.02] last:border-0">
                                <span className="text-[10px] text-white/30 font-bold uppercase tracking-wider">{config.title}</span>
                                <span className={`text-[10px] font-black uppercase tracking-widest ${isFinal ? 'text-emerald-400' : 'text-amber-400'}`}>
                                    {current?.label}
                                </span>
                            </div>
                        );
                    })}
                 </div>
            </div>
        </div>
    );
}
