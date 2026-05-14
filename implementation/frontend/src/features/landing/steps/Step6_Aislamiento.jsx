import React from 'react';
import { IconCard } from '../components/IconCard';
import { StepLayout } from '../components/StepLayout';

export function Step6_Aislamiento({ funnel, updateFunnel, onNext }) {
    const selectInsulation = (estado) => {
        updateFunnel({ insulation_state: estado });
        // Si NO es reforma, avanzamos. Si es reforma, mostramos las casillas
        // de elementos a renovar antes de seguir.
        if (!funnel.isReforma) setTimeout(onNext, 250);
    };

    const toggleElemento = (key) => {
        const next = { ...funnel.reforma_elementos, [key]: !funnel.reforma_elementos?.[key] };
        updateFunnel({ reforma_elementos: next });
    };

    return (
        <StepLayout
            question="¿Cómo de bien está aislada tu vivienda?"
            subtitle="Una vivienda mal aislada pierde calor: a mejor aislamiento, mejor funciona la aerotermia."
            onContinue={funnel.isReforma && funnel.insulation_state ? onNext : null}
            canContinue={!!funnel.insulation_state}
        >
            <IconCard
                icon="🥶"
                title="Pasamos frío, ventanas viejas, paredes finas"
                selected={funnel.insulation_state === 'sin_aislamiento'}
                onClick={() => selectInsulation('sin_aislamiento')}
            />
            <IconCard
                icon="😐"
                title="Antigua, con ventanas ya cambiadas"
                selected={funnel.insulation_state === 'antigua_aislamiento_medio'}
                onClick={() => selectInsulation('antigua_aislamiento_medio')}
            />
            <IconCard
                icon="🙂"
                title="Reformada hace tiempo, se está bien"
                selected={funnel.insulation_state === 'antigua_mal_aislamiento'}
                onClick={() => selectInsulation('antigua_mal_aislamiento')}
            />
            <IconCard
                icon="😎"
                title="Muy bien aislada, nueva o muy reformada"
                selected={funnel.insulation_state === 'bien_aislada'}
                onClick={() => selectInsulation('bien_aislada')}
            />

            {/* Sub-pregunta para reforma integral: qué elementos quiere mejorar */}
            {funnel.isReforma && funnel.insulation_state && (
                <div className="mt-6 pt-6 border-t border-white/10 animate-fade-in">
                    <div className="text-center text-amber-300 text-xs font-black uppercase tracking-widest mb-4">
                        ¿Qué quieres mejorar en la reforma? (marca todos los que apliquen)
                    </div>
                    <div className="space-y-3">
                        <IconCard
                            icon="🪟"
                            title="Ventanas"
                            selected={!!funnel.reforma_elementos?.ventanas}
                            onClick={() => toggleElemento('ventanas')}
                        />
                        <IconCard
                            icon="🏠"
                            title="Cubierta / tejado"
                            selected={!!funnel.reforma_elementos?.cubierta}
                            onClick={() => toggleElemento('cubierta')}
                        />
                        <IconCard
                            icon="🧱"
                            title="Fachada (paredes exteriores)"
                            selected={!!funnel.reforma_elementos?.paredes}
                            onClick={() => toggleElemento('paredes')}
                        />
                        <IconCard
                            icon="⬇️"
                            title="Suelo"
                            selected={!!funnel.reforma_elementos?.suelo}
                            onClick={() => toggleElemento('suelo')}
                        />
                    </div>
                </div>
            )}
        </StepLayout>
    );
}
