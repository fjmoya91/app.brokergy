import React from 'react';
import { IconCard } from '../components/IconCard';
import { StepLayout } from '../components/StepLayout';

export function Step4_Emisores({ funnel, updateFunnel, onNext, isInternal = false }) {
    const ej = funnel.obra_estado === 'ejecutada';

    const select = (tipo) => {
        updateFunnel({ emisor_tipo: tipo });
        setTimeout(onNext, 250);
    };

    return (
        <StepLayout
            question={ej ? "¿Con qué se calentaba cada habitación?" : (isInternal ? "¿Qué calienta cada habitación?" : "¿Qué te calienta cada habitación?")}
            subtitle={ej ? "El sistema que había instalado antes de la reforma." : (isInternal ? "Lo que hay hoy en paredes o suelo. Cuanto mejor, más eficiente será la aerotermia." : "Lo que tienes hoy en paredes o suelo. Cuanto mejor, más eficiente será la aerotermia.")}
        >
            <IconCard
                icon="🪜"
                title="Radiadores tradicionales"
                subtitle="Los típicos de hierro o aluminio, altos y delgados"
                selected={funnel.emisor_tipo === 'radiadores_convencionales'}
                onClick={() => select('radiadores_convencionales')}
            />
            <IconCard
                icon="♨️"
                title="Suelo radiante"
                subtitle="Calor que sale del suelo de la vivienda"
                selected={funnel.emisor_tipo === 'suelo_radiante'}
                onClick={() => select('suelo_radiante')}
                badge="⭐ Ideal"
            />
            <IconCard
                icon="💨"
                title="Fancoils / Split"
                subtitle="Unidades de aire frío/caliente en pared o techo"
                selected={funnel.emisor_tipo === 'fancoils'}
                onClick={() => select('fancoils')}
            />
            <IconCard
                icon="❓"
                title="No lo sé"
                subtitle="Calculamos asumiendo radiadores tradicionales"
                selected={funnel.emisor_tipo === 'no_se'}
                onClick={() => { updateFunnel({ emisor_tipo: 'radiadores_convencionales' }); setTimeout(onNext, 250); }}
            />
        </StepLayout>
    );
}
