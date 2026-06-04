import React, { useState } from 'react';
import { IconCard } from '../components/IconCard';
import { StepLayout } from '../components/StepLayout';

/**
 * Paso 5 — ACS (agua caliente sanitaria).
 *
 * Se presenta como UN paso del funnel pero internamente se divide en dos
 * sub-pantallas para evitar scroll en móvil:
 *   A) ¿Qué tienes HOY para el agua caliente? → boiler_acs_type
 *   B) ¿Quieres incluir el ACS en la aerotermia? → incluir_acs
 *
 * Auto-avanza de A → B al seleccionar. En B, el botón "Volver" lleva a A.
 * El botón "Atrás" global del funnel (StepHeader) sigue yendo al paso previo.
 */
export function Step5_ACS({ funnel, updateFunnel, onNext, isInternal = false }) {
    const ej = funnel.obra_estado === 'ejecutada';
    // Posesivo neutro en internal (el partner pregunta por su cliente).
    const pos = isInternal ? 'la' : 'tu';

    // Si vuelve a este paso con respuestas, arranca en la sub-pantalla que falta.
    const initialPhase = funnel.boiler_acs_type && (funnel.incluir_acs === null || funnel.incluir_acs === undefined)
        ? 'incluir'
        : 'tipo';
    const [phase, setPhase] = useState(initialPhase);

    // Copy natural de la primera opción "misma caldera" según combustible.
    const mismaInstalacion = (() => {
        const daba = isInternal ? (ej ? 'daba' : 'da') : (ej ? 'te daba' : 'te da');
        switch (funnel.combustible_actual) {
            case 'gas':       return { title: 'La misma caldera de gas',      subtitle: `Si ${pos} caldera de gas ${daba} calefacción y agua caliente` };
            case 'gasoleo':   return { title: 'La misma caldera de gasóleo',  subtitle: `Si ${pos} caldera de gasóleo ${daba} calefacción y agua caliente` };
            case 'carbon':    return { title: 'La misma caldera de carbón',   subtitle: `Si ${pos} caldera ${daba} calefacción y agua caliente` };
            case 'biomasa':   return { title: 'La misma caldera de biomasa',  subtitle: `Si ${pos} caldera ${daba} calefacción y agua caliente` };
            case 'electrica': return null;
            default:          return null;
        }
    })();

    const selectAcs = (val) => {
        updateFunnel({ boiler_acs_type: val });
        // Auto-pasa a la segunda pregunta para que no haya scroll.
        setTimeout(() => setPhase('incluir'), 200);
    };

    const selectIncluir = (val) => {
        updateFunnel({ incluir_acs: val });
        setTimeout(onNext, 200);
    };

    // ── Sub-pantalla A: tipo de ACS actual ───────────────────────────────────
    if (phase === 'tipo') {
        return (
            <StepLayout
                question={ej ? "¿Cómo calentabas el agua caliente ANTES?" : (isInternal ? "¿Cómo se calienta el agua caliente HOY?" : "¿Cómo calientas el agua caliente HOY?")}
                subtitle={isInternal ? "Para calcular el ahorro exacto." : "Para calcular tu ahorro exacto. Te tomará un segundo."}
            >
                {mismaInstalacion && (
                    <IconCard
                        icon="🔁"
                        title={mismaInstalacion.title}
                        subtitle={mismaInstalacion.subtitle}
                        selected={funnel.boiler_acs_type === 'misma_caldera'}
                        onClick={() => selectAcs('misma_caldera')}
                    />
                )}
                <IconCard
                    icon="⚡"
                    title="Termo eléctrico"
                    subtitle="Depósito con resistencia"
                    selected={funnel.boiler_acs_type === 'termo'}
                    onClick={() => selectAcs('termo')}
                />
                <IconCard
                    icon="🛢️"
                    title="Calentador de butano o GLP"
                    subtitle="Bombona de butano o tanque de propano"
                    selected={funnel.boiler_acs_type === 'butano'}
                    onClick={() => selectAcs('butano')}
                />
                <IconCard
                    icon="🌞"
                    title="Placas solares térmicas"
                    subtitle="Captadores solares para agua caliente"
                    selected={funnel.boiler_acs_type === 'solar'}
                    onClick={() => selectAcs('solar')}
                />
                <IconCard
                    icon="❓"
                    title="No tengo / no lo sé"
                    subtitle="Usamos butano como referencia"
                    selected={funnel.boiler_acs_type === 'no_tengo'}
                    onClick={() => selectAcs('no_tengo')}
                />
            </StepLayout>
        );
    }

    // ── Sub-pantalla B: incluir en aerotermia ────────────────────────────────
    return (
        <StepLayout
            question={isInternal ? "¿La aerotermia dará también el agua caliente?" : "¿Quieres que la aerotermia te dé también el agua caliente?"}
            subtitle="Una sola máquina para todo = más ahorro."
        >
            <button
                type="button"
                onClick={() => setPhase('tipo')}
                className="flex items-center gap-2 text-white/40 hover:text-amber-400 transition-colors text-[11px] uppercase tracking-widest font-bold mb-2 mx-auto"
            >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                </svg>
                Cambiar lo del agua caliente actual
            </button>
            <IconCard
                icon="🚿"
                title="Sí, también el agua caliente"
                subtitle="Más ahorro: una sola máquina para todo"
                selected={funnel.incluir_acs === true}
                onClick={() => selectIncluir(true)}
                badge="Más ahorro"
            />
            <IconCard
                icon="🔥"
                title="No, solo calefacción"
                subtitle={isInternal ? "Se mantiene el sistema actual de agua caliente" : "Mantienes tu sistema actual de agua caliente"}
                selected={funnel.incluir_acs === false}
                onClick={() => selectIncluir(false)}
            />
        </StepLayout>
    );
}
