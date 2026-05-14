import React from 'react';
import { IconCard } from '../components/IconCard';
import { StepLayout } from '../components/StepLayout';

export function Step5_ACS({ funnel, updateFunnel, onNext }) {
    const select = (incluir) => {
        updateFunnel({ incluir_acs: incluir });
        setTimeout(onNext, 250);
    };

    return (
        <StepLayout
            question="¿Quieres que la aerotermia te dé también el agua caliente?"
            subtitle="Incluir el agua caliente (ducha, grifos) mejora mucho la rentabilidad."
        >
            <IconCard
                icon="🚿"
                title="Sí, también el agua caliente"
                subtitle="Recomendado: te ahorras la factura del termo y de la caldera"
                selected={funnel.incluir_acs === true}
                onClick={() => select(true)}
                badge="Más ahorro"
            />
            <IconCard
                icon="🔥"
                title="No, solo calefacción"
                subtitle="Mantienes tu sistema actual de agua caliente"
                selected={funnel.incluir_acs === false}
                onClick={() => select(false)}
            />
        </StepLayout>
    );
}
