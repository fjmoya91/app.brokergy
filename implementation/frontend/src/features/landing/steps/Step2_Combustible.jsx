import React from 'react';
import { IconCard } from '../components/IconCard';
import { StepLayout } from '../components/StepLayout';

export function Step2_Combustible({ funnel, updateFunnel, onNext }) {
    const select = (combustible) => {
        // Si no es sólido, limpiamos sub_solido para no contaminar
        updateFunnel({
            combustible_actual: combustible,
            sub_solido: combustible === 'solido' ? funnel.sub_solido : null
        });
        // Si es sólido, mostramos sub-pregunta sin avanzar; si no, seguimos
        if (combustible !== 'solido') setTimeout(onNext, 250);
    };

    const selectSubSolido = (sub) => {
        updateFunnel({ sub_solido: sub });
        setTimeout(onNext, 250);
    };

    const isPellet = funnel.combustible_actual === 'solido' && funnel.sub_solido === 'pellets';

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
                icon="🌳"
                title="Combustible sólido"
                subtitle="Leña, pellets, carbón u hueso de aceituna"
                selected={funnel.combustible_actual === 'solido'}
                onClick={() => select('solido')}
            />

            {/* Sub-pregunta para combustible sólido */}
            {funnel.combustible_actual === 'solido' && (
                <div className="mt-6 pt-6 border-t border-white/10 space-y-3 animate-fade-in">
                    <div className="text-center text-amber-300 text-xs font-black uppercase tracking-widest mb-2">
                        ¿Qué quemas exactamente?
                    </div>
                    <IconCard
                        icon="🪵"
                        title="Leña, orujo o hueso de aceituna"
                        selected={funnel.sub_solido === 'lena'}
                        onClick={() => selectSubSolido('lena')}
                    />
                    <IconCard
                        icon="📦"
                        title="Pellets"
                        selected={funnel.sub_solido === 'pellets'}
                        onClick={() => selectSubSolido('pellets')}
                    />
                    <IconCard
                        icon="⚫"
                        title="Carbón"
                        selected={funnel.sub_solido === 'carbon'}
                        onClick={() => selectSubSolido('carbon')}
                    />

                    {isPellet && (
                        <div className="mt-4 p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl">
                            <div className="flex gap-3">
                                <span className="text-2xl flex-shrink-0">⚠️</span>
                                <div>
                                    <div className="text-amber-300 font-bold text-sm mb-1">Aviso importante</div>
                                    <p className="text-white/70 text-xs leading-relaxed">
                                        Las ayudas CAE para sustituir biomasa (pellets) por aerotermia están en revisión
                                        por el Ministerio. Continúa con la simulación y un técnico verificará personalmente
                                        si tu caso es elegible antes de la propuesta formal.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </StepLayout>
    );
}
