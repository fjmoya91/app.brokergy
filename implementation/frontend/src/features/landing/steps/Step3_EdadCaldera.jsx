import React, { useEffect } from 'react';
import { IconCard } from '../components/IconCard';
import { StepLayout } from '../components/StepLayout';

export function Step3_EdadCaldera({ funnel, updateFunnel, onNext }) {
    // Si el combustible es electricidad, este paso se salta (rendimiento siempre 1.0)
    useEffect(() => {
        if (funnel.combustible_actual === 'electrica') {
            updateFunnel({ edad_caldera: 'no_se', condensacion: 'no_se' });
            onNext();
        }
    }, [funnel.combustible_actual]);

    const aplicaCondensacion = funnel.combustible_actual === 'gas' || funnel.combustible_actual === 'gasoleo';
    const necesitaCondensacion = aplicaCondensacion && !funnel.condensacion;

    const selectEdad = (edad) => {
        updateFunnel({ edad_caldera: edad });
        // Si no es gas/gasoleo, no preguntamos condensación → avanzar
        if (!aplicaCondensacion) {
            updateFunnel({ condensacion: 'no_se' });
            setTimeout(onNext, 250);
        }
    };

    const selectCondensacion = (val) => {
        updateFunnel({ condensacion: val });
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
                subtitle="Caldera moderna"
                selected={funnel.edad_caldera === '<10'}
                onClick={() => selectEdad('<10')}
            />
            <IconCard
                icon="⏳"
                title="Entre 10 y 20 años"
                subtitle="Tecnología intermedia"
                selected={funnel.edad_caldera === '10-20'}
                onClick={() => selectEdad('10-20')}
            />
            <IconCard
                icon="👴"
                title="Más de 20 años"
                subtitle="Caldera antigua, gran margen de ahorro"
                selected={funnel.edad_caldera === '>20'}
                onClick={() => selectEdad('>20')}
                badge="🔥 Ahorro alto"
            />
            <IconCard
                icon="❓"
                title="No lo sé"
                subtitle="Calculamos con una estimación conservadora"
                selected={funnel.edad_caldera === 'no_se'}
                onClick={() => selectEdad('no_se')}
            />

            {/* Sub-pregunta de condensación si gas o gasóleo */}
            {aplicaCondensacion && funnel.edad_caldera && (
                <div className="mt-6 pt-6 border-t border-white/10 animate-fade-in">
                    <div className="text-center mb-4">
                        <div className="text-amber-300 text-xs font-black uppercase tracking-widest mb-2">
                            ¿Tu caldera es de condensación?
                        </div>
                        <p className="text-white/40 text-xs">
                            Las de condensación suelen sacar el humo por un tubo de plástico blanco
                            por la fachada. Las antiguas usan chimenea metálica.
                        </p>
                    </div>
                    <div className="space-y-3">
                        <IconCard
                            icon="🤍"
                            title="Sí, sale por un tubo blanco"
                            subtitle="Caldera moderna de condensación (más eficiente)"
                            selected={funnel.condensacion === 'si'}
                            onClick={() => selectCondensacion('si')}
                        />
                        <IconCard
                            icon="🏭"
                            title="No, tiene chimenea o conducto metálico"
                            subtitle="Caldera convencional"
                            selected={funnel.condensacion === 'no'}
                            onClick={() => selectCondensacion('no')}
                        />
                        <IconCard
                            icon="❓"
                            title="No lo sé"
                            subtitle="Lo estimamos por la edad de la caldera"
                            selected={funnel.condensacion === 'no_se'}
                            onClick={() => selectCondensacion('no_se')}
                        />
                    </div>
                </div>
            )}
        </StepLayout>
    );
}
