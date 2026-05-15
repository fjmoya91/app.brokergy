import React from 'react';
import { StepLayout } from '../components/StepLayout';

// Tramos simplificados (3 opciones reales + "no lo sé")
const TIERS = [
    { value: 1000, label: 'Menos de 1.500 €',  hint: 'Vivienda pequeña o uso bajo' },
    { value: 2000, label: 'Entre 1.500 y 2.500 €', hint: 'Lo más común en unifamiliar' },
    { value: 3500, label: 'Más de 2.500 €', hint: 'Vivienda grande o uso intensivo' }
];

export function Step7_Gasto({ funnel, updateFunnel, onNext }) {
    const select = (value) => {
        updateFunnel({ gasto_anual_eur: value });
        setTimeout(onNext, 250);
    };

    return (
        <StepLayout
            question="¿Cuánto te gastas al año en calefacción y agua caliente?"
            subtitle="Una estimación aproximada. Si lo sabes, el cálculo será más preciso."
        >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {TIERS.map(t => (
                    <button
                        key={t.value}
                        type="button"
                        onClick={() => select(t.value)}
                        className={`group p-4 md:p-5 rounded-2xl border-2 transition-all text-left ${
                            funnel.gasto_anual_eur === t.value
                                ? 'border-amber-400 bg-amber-400/10'
                                : 'border-white/10 bg-white/[0.03] hover:border-amber-400/40 hover:bg-white/[0.05]'
                        }`}
                    >
                        <div className="flex items-center gap-3">
                            <div className="text-3xl md:text-4xl flex-shrink-0">💶</div>
                            <div className="flex-1 min-w-0">
                                <div className={`font-bold text-sm md:text-base ${funnel.gasto_anual_eur === t.value ? 'text-amber-300' : 'text-white'}`}>
                                    {t.label}
                                </div>
                                <div className="text-white/40 text-[10px] md:text-xs mt-0.5">{t.hint}</div>
                            </div>
                        </div>
                    </button>
                ))}
                <button
                    type="button"
                    onClick={() => select(0)}
                    className={`group p-4 md:p-5 rounded-2xl border-2 transition-all text-left ${
                        funnel.gasto_anual_eur === 0
                            ? 'border-amber-400 bg-amber-400/10'
                            : 'border-white/10 bg-white/[0.03] hover:border-amber-400/40 hover:bg-white/[0.05]'
                    }`}
                >
                    <div className="flex items-center gap-3">
                        <div className="text-3xl md:text-4xl flex-shrink-0">🤷</div>
                        <div className="flex-1 min-w-0">
                            <div className={`font-bold text-sm md:text-base ${funnel.gasto_anual_eur === 0 ? 'text-amber-300' : 'text-white'}`}>
                                No lo sé
                            </div>
                            <div className="text-white/40 text-[10px] md:text-xs mt-0.5">Calculamos con la media de tu zona</div>
                        </div>
                    </div>
                </button>
            </div>
        </StepLayout>
    );
}
