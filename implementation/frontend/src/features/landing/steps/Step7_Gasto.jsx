import React from 'react';
import { IconCard } from '../components/IconCard';
import { StepLayout } from '../components/StepLayout';

const TIERS = [
    { value: 500,  label: 'Menos de 500 €' },
    { value: 1000, label: 'Unos 1.000 €' },
    { value: 1500, label: 'Unos 1.500 €' },
    { value: 2000, label: 'Unos 2.000 €' },
    { value: 3000, label: 'Unos 3.000 €' },
    { value: 4000, label: 'Más de 3.500 €' }
];

export function Step7_Gasto({ funnel, updateFunnel, onNext }) {
    const select = (value) => {
        updateFunnel({ gasto_anual_eur: value });
        setTimeout(onNext, 250);
    };

    return (
        <StepLayout
            question="¿Cuánto te gastas al año en calefacción y agua caliente?"
            subtitle="Una estimación aproximada. Cuanto más sepas, más preciso será tu cálculo."
        >
            {TIERS.map(t => (
                <IconCard
                    key={t.value}
                    icon="💶"
                    title={t.label}
                    selected={funnel.gasto_anual_eur === t.value}
                    onClick={() => select(t.value)}
                />
            ))}
            <IconCard
                icon="🤷"
                title="No lo sé, calcúlamelo"
                subtitle="Calculamos con la media nacional según tu zona"
                selected={funnel.gasto_anual_eur === 0}
                onClick={() => select(0)}
            />
        </StepLayout>
    );
}
