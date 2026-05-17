import React from 'react';
import { IconCard } from '../components/IconCard';
import { StepLayout } from '../components/StepLayout';

export function Step3_EdadCaldera({ funnel, updateFunnel, onNext }) {
    // Nota: si combustible es eléctrico, este paso NO se monta — el filtrado se
    // hace en LandingFunnelView.activeSteps. Esto evita el bucle de navegación
    // que aparecía con auto-skip por useEffect (volvía atrás → re-skipeaba).
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
                        <p className="text-white/40 text-xs leading-relaxed">
                            <strong className="text-white/70">Pista:</strong> las de condensación
                            tienen una <strong className="text-amber-400">manguera fina por debajo</strong>
                            {' '}que evacúa agua. También aparece en la placa de fabricación.
                            <br />
                            <span className="text-white/30">(Las calderas estancas también pueden tener tubo
                            blanco pero NO esa manguera de condensados.)</span>
                        </p>
                    </div>
                    <div className="space-y-3">
                        <IconCard
                            icon="💧"
                            title="Sí, tiene manguera de condensados"
                            subtitle="Tubo fino por debajo que evacúa agua, o se indica en la placa"
                            selected={funnel.condensacion === 'si'}
                            onClick={() => selectCondensacion('si')}
                        />
                        <IconCard
                            icon="🏭"
                            title="No, sin manguera de condensados"
                            subtitle="Caldera convencional (atmosférica o estanca sin condensación)"
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
