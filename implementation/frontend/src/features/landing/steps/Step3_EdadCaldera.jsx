import React, { useEffect } from 'react';
import { IconCard } from '../components/IconCard';
import { StepLayout } from '../components/StepLayout';

export function Step3_EdadCaldera({ funnel, updateFunnel, onNext }) {
    // Si el combustible es electricidad, este paso se salta (rendimiento siempre 1.0)
    useEffect(() => {
        if (funnel.combustible_actual === 'electrica') {
            updateFunnel({ edad_caldera: 'no_se' });
            onNext();
        }
    }, [funnel.combustible_actual]);

    const select = (edad) => {
        updateFunnel({ edad_caldera: edad });
        setTimeout(onNext, 250);
    };

    return (
        <StepLayout
            question="¿Cuántos años tiene tu caldera?"
            subtitle="A más antigua, más probable que esté perdiendo dinero por ineficiencia."
        >
            <IconCard
                icon="🆕"
                title="Menos de 10 años"
                subtitle="Caldera moderna, normalmente de condensación"
                selected={funnel.edad_caldera === '<10'}
                onClick={() => select('<10')}
            />
            <IconCard
                icon="⏳"
                title="Entre 10 y 20 años"
                subtitle="Tecnología intermedia, rendimiento medio"
                selected={funnel.edad_caldera === '10-20'}
                onClick={() => select('10-20')}
            />
            <IconCard
                icon="👴"
                title="Más de 20 años"
                subtitle="Caldera antigua, gran margen de ahorro"
                selected={funnel.edad_caldera === '>20'}
                onClick={() => select('>20')}
                badge="🔥 Ahorro alto"
            />
            <IconCard
                icon="❓"
                title="No lo sé"
                subtitle="Calculamos con una estimación conservadora"
                selected={funnel.edad_caldera === 'no_se'}
                onClick={() => select('no_se')}
            />
        </StepLayout>
    );
}
