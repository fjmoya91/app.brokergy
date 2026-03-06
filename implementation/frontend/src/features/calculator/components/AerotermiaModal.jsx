import React, { useState, useMemo } from 'react';

/**
 * AerotermiaModal - Component for quick machine power estimation
 */
export function AerotermiaModal({ isOpen, onClose, demand, surface, zone }) {
    const [applySafetyFactor, setApplySafetyFactor] = useState(false);

    const calculation = useMemo(() => {
        if (!demand || !surface || !zone) return null;

        // Apply 10% reduction as requested by user
        const demandAdjusted = demand * 0.90;
        const totalEnergy = demandAdjusted * surface;

        const zoneChar = zone.charAt(0).toUpperCase();
        let hours = 2000;
        if (zoneChar === 'A' || zoneChar === 'B') hours = 1600;
        else if (zoneChar === 'C') hours = 1900;
        else if (zoneChar === 'D') hours = 2100;
        else if (zoneChar === 'E') hours = 2300;

        const basePower = totalEnergy / hours;
        const neededPower = applySafetyFactor ? basePower * 1.2 : basePower;

        const commercialSizes = [4, 6, 8, 10, 12, 16];
        let recommendedMachine = null;
        let isCascade = false;

        if (neededPower > 16) {
            isCascade = true;
            recommendedMachine = "Instalación en Cascada (2+ unidades)";
        } else {
            recommendedMachine = commercialSizes.find(size => size >= neededPower) || 16;
            recommendedMachine = `${recommendedMachine} kW`;
        }

        const insulationWarning = demand > 150;

        return {
            basePower,
            neededPower,
            recommendedMachine,
            isCascade,
            insulationWarning
        };
    }, [demand, surface, zone, applySafetyFactor]);

    const formatNumber = (val) => {
        const num = typeof val === 'number' ? val : parseFloat(val);
        if (num === null || num === undefined || isNaN(num)) return '0';
        const d = (num % 1 === 0) ? 0 : 2;
        return new Intl.NumberFormat('es-ES', {
            minimumFractionDigits: d,
            maximumFractionDigits: d,
            useGrouping: true
        }).format(num);
    };

    if (!isOpen || !calculation) return null;

    return (
        <div
            className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl animate-fade-in"
            onClick={onClose}
        >
            <div
                className="glass-card w-full max-w-md overflow-hidden border-white/20 shadow-[0_0_50px_rgba(34,197,94,0.15)] animate-slide-up"
                onClick={e => e.stopPropagation()}
            >
                {/* Compact Header */}
                <div className="bg-gradient-to-r from-emerald-900/40 to-lime-900/40 p-4 border-b border-white/5 flex items-center justify-between relative">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500 to-lime-500 flex items-center justify-center shadow-lg shadow-emerald-500/20 text-slate-900">
                            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="3" y="6" width="18" height="12" rx="2" />
                                <circle cx="8" cy="12" r="3" />
                                <path d="M16 10v4" strokeLinecap="round" />
                                <path d="M19 10v4" strokeLinecap="round" />
                            </svg>
                        </div>
                        <h2 className="text-lg font-bold text-white tracking-tight flex flex-col leading-none gap-0.5">
                            <span>Aerotermia</span>
                            <span className="text-[9px] text-emerald-400 font-bold uppercase tracking-widest opacity-80">Estimación Rápida</span>
                        </h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white rounded-full transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="p-5 space-y-4 bg-[#0B0F17]">
                    {/* Main Result Area - Fixed Height for Stability */}
                    <div className="relative p-6 rounded-2xl bg-white/5 border border-white/10 flex flex-col items-center justify-center h-40 group hover:border-emerald-500/30 transition-all">
                        <p className={`text-[10px] font-black uppercase tracking-[0.2em] mb-2 ${applySafetyFactor ? 'text-amber-400' : 'text-emerald-400'}`}>
                            {applySafetyFactor ? 'Máquina Recomendada' : 'Potencia Teórica'}
                        </p>

                        <div className="flex items-baseline gap-2">
                            <span className={`text-5xl font-black tracking-tighter ${applySafetyFactor
                                ? (calculation.isCascade ? 'text-red-400' : 'text-white')
                                : 'text-white'
                                }`}>
                                {applySafetyFactor
                                    ? calculation.recommendedMachine.replace(' kW', '')
                                    : formatNumber(calculation.basePower, 1)
                                }
                            </span>
                            <span className="text-xl font-medium text-white/40">kW</span>
                        </div>

                        {applySafetyFactor && calculation.isCascade && (
                            <div className="absolute bottom-3 text-red-400 text-[10px] font-bold uppercase flex items-center gap-1 bg-red-500/10 px-2 py-1 rounded">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M12 5v.01" />
                                </svg>
                                Requiere Cascada
                            </div>
                        )}

                        {!applySafetyFactor && (
                            <div className="absolute bottom-3 text-white/20 text-[9px]">
                                * Ajuste real -10% aplicado
                            </div>
                        )}
                    </div>

                    {/* Compact Control Row */}
                    <div
                        className="flex items-center justify-between p-3 px-4 bg-white/5 rounded-xl border border-white/10 hover:bg-white/10 transition-colors cursor-pointer group"
                        onClick={() => setApplySafetyFactor(!applySafetyFactor)}
                    >
                        <div className="flex flex-col">
                            <span className="text-xs font-bold text-white group-hover:text-emerald-300 transition-colors">Factor de Seguridad (1.20)</span>
                            <span className="text-[9px] text-white/30 font-medium">Incluir consumo ACS y pérdidas</span>
                        </div>
                        <div className={`w-8 h-4 rounded-full p-0.5 transition-colors ${applySafetyFactor ? 'bg-emerald-500' : 'bg-white/10'}`}>
                            <div className={`w-3 h-3 bg-white rounded-full shadow-sm transition-transform ${applySafetyFactor ? 'translate-x-4' : 'translate-x-0'}`}></div>
                        </div>
                    </div>

                    {/* Warnings & Footer */}
                    <div className="space-y-3">
                        {calculation.insulationWarning && (
                            <div className="p-2.5 bg-red-500/10 rounded-lg border border-red-500/10 flex items-start gap-2">
                                <span className="text-red-400 text-lg leading-none mt-0.5">•</span>
                                <p className="text-red-300/90 text-[10px] leading-tight">
                                    <span className="font-bold">Demanda alta detectada.</span> Se recomienda mejorar el aislamiento para evitar sobredimensionar la instalación.
                                </p>
                            </div>
                        )}

                        <p className="text-[9px] text-white/20 text-center leading-relaxed px-4">
                            Cálculos aproximados según CTE. Consulta siempre con el fabricante antes de la instalación.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
