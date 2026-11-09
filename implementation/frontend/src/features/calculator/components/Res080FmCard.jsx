import React from 'react';

// Tarjeta «Vía FM · RES080_FM» de la calculadora (solo ADMIN, como la de la RES060_FM):
// la rehabilitación profunda con factor multiplicador sobre la parte de la bomba
// (logic/res080fm.js). Enseña la cifra con sus avisos y deja teclear los kWh/año de
// los dos CEE SIMULADOS (`inputs.efSimBC` / `inputs.efSimRest`); sin ellos, la cifra
// es una estimación desde el CEE inicial y el final, y lo dice.

const fmt = (v, d = 0) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: d, minimumFractionDigits: d }).format(v || 0);

export function Res080FmCard({ result, inputs, onInputChange, onOpenDetail }) {
    const fm = result?.res080fm;
    if (!fm) return null;
    const vigKwh = result.res080?.ahorroEnergiaFinalTotal || 0;
    const vigEur = result.financialsRes080?.caeBonus || 0;
    const fmEur = result.financialsRes080FM?.caeBonus || 0;
    const mx = Math.max(fm.cae, vigKwh, 1);
    const diffEur = fmEur - vigEur;
    const avisos = (fm.avisos || []).filter((a) => a.tono !== 'info');
    const campo = (clave, rotulo, ayuda, valorEstimado, fuente) => (
        <label className="flex flex-col gap-1 min-w-0">
            <span className="text-[9px] font-black uppercase tracking-widest text-violet-300/80">{rotulo}</span>
            <input
                type="number"
                min="0"
                step="1"
                value={inputs?.[clave] ?? ''}
                placeholder={valorEstimado > 0 ? `≈ ${fmt(valorEstimado)} (estimado)` : 'kWh/año'}
                onChange={(e) => {
                    const v = e.target.value;
                    onInputChange((prev) => ({ ...prev, [clave]: v === '' ? null : v }));
                }}
                className="bg-slate-900 border border-violet-500/30 rounded-lg px-3 py-1.5 text-xs text-white tabular-nums focus:outline-none focus:border-violet-400"
            />
            <span className="text-[9.5px] text-slate-500 leading-snug">{ayuda}{fuente === 'cee' ? ' · de su CEE' : ''}</span>
        </label>
    );

    return (
        <div className="mt-4 glass-card overflow-hidden border-violet-500/30 shadow-[0_0_20px_rgba(139,92,246,0.1)]">
            <div className="bg-violet-900/40 py-2 px-4 border-b border-violet-500/20 flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-violet-400"></div>
                    <span className="text-xs font-bold uppercase tracking-wider text-violet-300">Vía FM · RES080_FM · BOE 7/11/2026</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    {fm.elegible === false && (
                        <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-red-500/20 text-red-300 border border-red-500/30">No elegible</span>
                    )}
                    <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${fm.estimada || fm.sinSimulados
                        ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
                        : 'bg-lime-500/20 text-lime-300 border border-lime-500/30'}`}>
                        {fm.sinSimulados ? 'Sin simulados' : fm.estimada ? 'Simulados estimados' : 'Simulados de los CEE'}
                    </span>
                    {onOpenDetail && (
                        <button type="button" onClick={onOpenDetail}
                            className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-violet-500/20 text-violet-200 border border-violet-400/40 hover:bg-violet-500/35 transition-all cursor-pointer">
                            🔍 Ver desglose
                        </button>
                    )}
                </div>
            </div>
            <div className="p-4 space-y-4">
                {avisos.length > 0 && (
                    <ul className="space-y-1.5">
                        {avisos.map((a, i) => (
                            <li key={i} className={`text-[11px] leading-snug px-3 py-1.5 rounded-lg border-l-2 ${a.tono === 'bloquea' ? 'bg-red-500/10 border-red-400 text-red-200' : 'bg-amber-500/10 border-amber-400 text-amber-100'}`}>
                                {a.texto}
                            </li>
                        ))}
                    </ul>
                )}

                <div className="space-y-3">
                    <div className="flex justify-between items-baseline gap-3">
                        <span className="text-[10px] font-black uppercase tracking-widest text-violet-300">RES080_FM (vía FM)</span>
                        <span className="flex items-baseline gap-2">
                            <span className="text-2xl font-black text-violet-300 tabular-nums">{fm.estimada ? '≈ ' : ''}{fmt(fm.cae)} <span className="text-[10px] font-bold text-violet-400/60 uppercase">kWh/año</span></span>
                            <span className="text-sm font-bold text-violet-200 tabular-nums">{fmt(fmEur)} €</span>
                        </span>
                    </div>
                    <div className="h-3 rounded-full bg-white/10 overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-400 transition-all duration-300" style={{ width: `${(100 * fm.cae / mx)}%` }}></div>
                    </div>
                    <div className="flex justify-between items-baseline gap-3">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">RES080 vigente</span>
                        <span className="flex items-baseline gap-2">
                            <span className="text-xl font-black text-white/80 tabular-nums">{fmt(vigKwh)} <span className="text-[10px] font-bold text-white/40 uppercase">kWh/año</span></span>
                            <span className="text-sm font-bold text-white/60 tabular-nums">{fmt(vigEur)} €</span>
                        </span>
                    </div>
                    <div className="h-3 rounded-full bg-white/10 overflow-hidden">
                        <div className="h-full rounded-full bg-white/40" style={{ width: `${(100 * vigKwh / mx)}%` }}></div>
                    </div>
                    {fm.cae > 0 && (
                        <p className={`text-[11px] font-bold ${diffEur >= 0 ? 'text-lime-300' : 'text-red-300'}`}>
                            × {fmt(fm.factor, 3)} · {diffEur >= 0 ? '+' : ''}{fmt(diffEur)} € de bono al cliente
                            <span className="font-normal text-slate-500"> · fórmula literal (pondera con consumos); por ahorros saldría × {fmt(fm.factorAhorros, 3)}</span>
                        </p>
                    )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-white/5">
                    {campo('efSimBC', 'EF_simBC · solo la bomba', 'CEE simulado con SOLO la sustitución de la caldera (doc. 11).', fm.simBCFuente ? 0 : fm.efSimBC, fm.simBCFuente)}
                    {campo('efSimRest', 'EF_simRest · todo menos la bomba', 'CEE simulado con la envolvente y la caldera de antes (doc. 10).', fm.simRestFuente ? 0 : fm.efSimRest, fm.simRestFuente)}
                </div>
            </div>
        </div>
    );
}
