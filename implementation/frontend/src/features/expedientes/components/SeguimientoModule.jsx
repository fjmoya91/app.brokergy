import React, { useState, useEffect } from 'react';

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

    useEffect(() => {
        if (expediente?.seguimiento) {
            setLocal({
                cee_inicial: 'ASIGNADO',
                cee_final: 'ASIGNADO',
                anexos: 'PTE_EMITIR',
                ...expediente.seguimiento
            });
            setHasChanges(false);
        }
    }, [expediente?.seguimiento]);

    const updateStatus = (key, val) => {
        setLocal(prev => ({ ...prev, [key]: val }));
        setHasChanges(true);
    };

    const handleSave = () => {
        if (onSave) {
            onSave({ seguimiento: local });
        }
    };

    return (
        <div className="space-y-8 py-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {Object.entries(STATUS_CONFIG).map(([key, config]) => {
                    const currentId = local[key];
                    const currentIndex = config.options.findIndex(o => o.id === currentId);
                    
                    return (
                        <div key={key} className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6 flex flex-col h-full group hover:border-white/10 transition-all">
                            <div className="flex items-center gap-3 mb-6">
                                <div className={`w-2 h-2 rounded-full ${
                                    config.color === 'amber' ? 'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]' : 
                                    config.color === 'emerald' ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 
                                    'bg-brand shadow-[0_0_10px_rgba(0,183,255,0.5)]'
                                }`} />
                                <h3 className="text-[11px] font-black text-white uppercase tracking-widest leading-none mt-1">
                                    {config.title}
                                </h3>
                            </div>

                            <div className="flex-1 space-y-3">
                                {config.options.map((opt, idx) => {
                                    const isDone = idx < currentIndex;
                                    const isCurrent = idx === currentIndex;
                                    
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
                                            <span className={`text-[11px] font-black uppercase tracking-wider ${isCurrent ? 'text-white' : ''}`}>
                                                {opt.label}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
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
