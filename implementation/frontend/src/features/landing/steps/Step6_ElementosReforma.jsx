import React from 'react';
import { IconCard } from '../components/IconCard';
import { StepLayout } from '../components/StepLayout';

/**
 * Solo se muestra si funnel.isReforma === true.
 * Permite marcar qué elementos quiere mejorar en la reforma envolvente
 * (ventanas, cubierta, fachada, suelo).
 *
 * Si no es reforma, este paso se omite automáticamente desde el container.
 */
export function Step6_ElementosReforma({ funnel, updateFunnel, onNext }) {
    const toggle = (key) => {
        const next = { ...(funnel.reforma_elementos || {}), [key]: !funnel.reforma_elementos?.[key] };
        updateFunnel({ reforma_elementos: next });
    };

    const algunoSeleccionado = Object.values(funnel.reforma_elementos || {}).some(Boolean);

    return (
        <StepLayout
            question="¿Qué quieres mejorar en la reforma?"
            subtitle="Marca todos los elementos en los que vais a actuar."
            onContinue={onNext}
            canContinue={algunoSeleccionado}
        >
            <IconCard
                icon="🪟"
                title="Ventanas"
                subtitle="Cambio de ventanas por modelos más eficientes"
                selected={!!funnel.reforma_elementos?.ventanas}
                onClick={() => toggle('ventanas')}
            />
            <IconCard
                icon="🏠"
                title="Cubierta / tejado"
                subtitle="Aislamiento del techo o tejado"
                selected={!!funnel.reforma_elementos?.cubierta}
                onClick={() => toggle('cubierta')}
            />
            <IconCard
                icon="🧱"
                title="Fachada (paredes exteriores)"
                subtitle="SATE, trasdosado o aislamiento de fachada"
                selected={!!funnel.reforma_elementos?.paredes}
                onClick={() => toggle('paredes')}
            />
            <IconCard
                icon="⬇️"
                title="Suelo"
                subtitle="Aislamiento del suelo de la vivienda"
                selected={!!funnel.reforma_elementos?.suelo}
                onClick={() => toggle('suelo')}
            />
        </StepLayout>
    );
}
