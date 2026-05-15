import React from 'react';
import { IconCard } from '../components/IconCard';
import { StepLayout } from '../components/StepLayout';

export function Step1_TipoProyecto({ funnel, updateFunnel, onNext }) {
    const select = (value) => {
        updateFunnel({ isReforma: value });
        setTimeout(onNext, 250);
    };

    return (
        <StepLayout
            question="¿Qué mejora te interesa?"
            subtitle="Elige la opción que mejor describe lo que quieres hacer en tu vivienda."
        >
            <IconCard
                icon="🔄"
                title="Solo cambiar mi caldera por aerotermia"
                subtitle="Conservas el resto de tu vivienda como está y ganas eficiencia."
                selected={funnel.isReforma === false}
                onClick={() => select(false)}
            />
            <IconCard
                icon="🏗️"
                title="Reforma integral: aerotermia + mejorar aislamiento"
                subtitle="Cambias la caldera y, además, mejoras ventanas, fachada o cubierta."
                selected={funnel.isReforma === true}
                onClick={() => select(true)}
                badge="Mayor ayuda"
            />
        </StepLayout>
    );
}
