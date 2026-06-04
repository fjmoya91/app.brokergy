import React, { useState, useEffect } from 'react';
import { IconCard } from '../components/IconCard';
import { StepLayout } from '../components/StepLayout';

/**
 * Paso 3 — Edad de la caldera + (si aplica) condensación.
 *
 * Para gas/gasóleo se hacen DOS preguntas, en sub-pantallas independientes
 * para evitar scroll en móvil. Para el resto, solo edad → auto-avanza.
 *
 * Nota: si combustible es eléctrico, este paso NO se monta (filtrado en
 * LandingFunnelView.activeSteps).
 */
export function Step3_EdadCaldera({ funnel, updateFunnel, onNext, isInternal = false }) {
    const ej = funnel.obra_estado === 'ejecutada';
    // Posesivo: público se dirige al cliente ("tu"); internal es neutro ("la").
    const pos = isInternal ? 'la' : 'tu';
    const Pos = isInternal ? 'La' : 'Tu';
    const isGasOrGasoleo = funnel.combustible_actual === 'gas' || funnel.combustible_actual === 'gasoleo';

    // Condensación solo aplica para caldera <10 años con gas o gasóleo
    const initialPhase = funnel.edad_caldera === '<10' && isGasOrGasoleo && !funnel.condensacion
        ? 'condensacion'
        : 'edad';
    const [phase, setPhase] = useState(initialPhase);

    // Cada sub-pantalla (edad ↔ condensación) debe empezar arriba del todo, sin scroll.
    // El scroll-to-top del padre solo se dispara al cambiar de paso, no de sub-fase.
    useEffect(() => {
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
    }, [phase]);

    const selectEdad = (edad) => {
        updateFunnel({ edad_caldera: edad });
        // Condensación solo se pregunta para gas/gasóleo con caldera <10 años
        if (isGasOrGasoleo && edad === '<10') {
            setTimeout(() => setPhase('condensacion'), 200);
            return;
        }
        // Para el resto: inferir condensación y avanzar directamente
        const condensacion = edad === '>20' ? 'no' : 'no_se';
        updateFunnel({ condensacion });
        setTimeout(onNext, 200);
    };

    const selectCondensacion = (val) => {
        updateFunnel({ condensacion: val });
        setTimeout(onNext, 200);
    };

    // ── Sub-pantalla A: edad ─────────────────────────────────────────────────
    if (phase === 'edad') {
        return (
            <StepLayout
                question={ej ? `¿Cuántos años tenía ${pos} caldera?` : `¿Cuántos años tiene ${pos} caldera?`}
                subtitle={ej ? "Nos ayuda a calcular la mejora al haberla sustituido." : "A más antigua, más probable que esté perdiendo dinero por ineficiencia."}
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
            </StepLayout>
        );
    }

    // ── Sub-pantalla B: condensación (gas / gasóleo + <10 años) ────────────────────
    return (
        <StepLayout
            question={ej ? `¿Era de condensación ${pos} caldera?` : `¿${Pos} caldera es de condensación?`}
            subtitle="Tip: las de condensación tienen una manguera fina por debajo que evacúa agua."
        >
            <button
                type="button"
                onClick={() => setPhase('edad')}
                className="flex items-center gap-2 text-white/40 hover:text-amber-400 transition-colors text-[11px] uppercase tracking-widest font-bold mb-2 mx-auto"
            >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                </svg>
                Cambiar edad de la caldera
            </button>
            <IconCard
                icon="🏭"
                title="No, sin manguera de condensados"
                subtitle="Caldera convencional (atmosférica o estanca sin condensación)"
                selected={funnel.condensacion === 'no'}
                onClick={() => selectCondensacion('no')}
            />
            <IconCard
                icon="💧"
                title="Sí, tiene manguera de condensados"
                subtitle="Tubo fino por debajo que evacúa agua, o se indica en la placa"
                selected={funnel.condensacion === 'si'}
                onClick={() => selectCondensacion('si')}
            />
            <IconCard
                icon="❓"
                title="No lo sé"
                subtitle="Lo estimamos por la edad de la caldera"
                selected={funnel.condensacion === 'no_se'}
                onClick={() => selectCondensacion('no_se')}
            />
        </StepLayout>
    );
}
