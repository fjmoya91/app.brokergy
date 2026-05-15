import React from 'react';
import { IconCard } from '../components/IconCard';
import { StepLayout } from '../components/StepLayout';

export function Step2_Combustible({ funnel, updateFunnel, onNext }) {
    const select = (combustible) => {
        // sub_solido ya no se usa: cada combustible es top-level.
        updateFunnel({ combustible_actual: combustible, sub_solido: null });
        setTimeout(onNext, 250);
    };

    const isBiomasa = funnel.combustible_actual === 'biomasa';

    return (
        <StepLayout
            question="¿Con qué se calienta hoy tu vivienda?"
            subtitle="Esto nos ayuda a calcular cuánto puedes ahorrar."
        >
            <IconCard
                icon="🔥"
                title="Gas natural o butano"
                subtitle="Caldera de gas (la más común en España)"
                selected={funnel.combustible_actual === 'gas'}
                onClick={() => select('gas')}
            />
            <IconCard
                icon="🛢️"
                title="Gasóleo / Diésel"
                subtitle="Caldera con depósito de combustible líquido"
                selected={funnel.combustible_actual === 'gasoleo'}
                onClick={() => select('gasoleo')}
            />
            <IconCard
                icon="⚡"
                title="Electricidad"
                subtitle="Radiadores eléctricos o caldera eléctrica"
                selected={funnel.combustible_actual === 'electrica'}
                onClick={() => select('electrica')}
            />
            <IconCard
                icon="⚫"
                title="Carbón"
                subtitle="Estufa o caldera de carbón"
                selected={funnel.combustible_actual === 'carbon'}
                onClick={() => select('carbon')}
            />
            <IconCard
                icon="🪵"
                title="Biomasa"
                subtitle="Pellets, leña o hueso de aceituna"
                selected={funnel.combustible_actual === 'biomasa'}
                onClick={() => select('biomasa')}
            />

            {/* Warning Ministerio cuando es biomasa */}
            {isBiomasa && (
                <div className="mt-4 p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl animate-fade-in">
                    <div className="flex gap-3">
                        <span className="text-2xl flex-shrink-0">⚠️</span>
                        <div>
                            <div className="text-amber-300 font-bold text-sm mb-1">Aviso importante</div>
                            <p className="text-white/70 text-xs leading-relaxed">
                                Las ayudas CAE para sustituir biomasa (pellets, leña, hueso) por aerotermia
                                están en revisión por el Ministerio. Continúa con la simulación y un técnico
                                verificará personalmente si tu caso es elegible antes de la propuesta formal.
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </StepLayout>
    );
}
