import React from 'react';
import { IconCard } from '../components/IconCard';
import { StepLayout } from '../components/StepLayout';

/**
 * Paso 5 — ACS (agua caliente sanitaria).
 *
 * Dos preguntas en una pantalla:
 *   A) ¿Qué tienes HOY para el agua caliente? → boiler_acs_type
 *   B) ¿Quieres incluir el ACS en la aerotermia? → incluir_acs
 *
 * El campo boilerAcsType se usa en la calculadora interna para el cálculo
 * RES080 (reforma estimada). Si el cliente dice que no tiene, usamos
 * 'Butano' como referencia por defecto (criterio negocio).
 */
export function Step5_ACS({ funnel, updateFunnel, onNext }) {
    const heatingLabel = (() => {
        switch (funnel.combustible_actual) {
            case 'gas': return 'Gas';
            case 'gasoleo': return 'Gasóleo';
            case 'electrica': return 'electricidad';
            case 'solido': return 'biomasa';
            default: return null;
        }
    })();

    const acsAnswered = !!funnel.boiler_acs_type;
    const includeAcsAnswered = funnel.incluir_acs !== null && funnel.incluir_acs !== undefined;

    const canContinue = acsAnswered && includeAcsAnswered;

    const selectAcs = (val) => updateFunnel({ boiler_acs_type: val });
    const selectIncluir = (val) => updateFunnel({ incluir_acs: val });

    return (
        <StepLayout
            question="Vamos con el agua caliente"
            subtitle="Dos preguntas rápidas para afinar tu ahorro."
            onContinue={onNext}
            canContinue={canContinue}
        >
            {/* Pregunta A — qué tiene hoy */}
            <div>
                <div className="text-amber-300 text-xs font-black uppercase tracking-widest mb-3 text-center">
                    1. ¿Cómo calientas el agua caliente HOY?
                </div>
                <div className="space-y-3">
                    {heatingLabel && (
                        <IconCard
                            icon="🔁"
                            title={`La misma caldera de ${heatingLabel}`}
                            subtitle="Si tu caldera te da calefacción y agua caliente"
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
                        icon="🍾"
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
                </div>
            </div>

            {/* Pregunta B — incluir en aerotermia */}
            {acsAnswered && (
                <div className="mt-8 pt-6 border-t border-white/10 animate-fade-in">
                    <div className="text-amber-300 text-xs font-black uppercase tracking-widest mb-3 text-center">
                        2. ¿Quieres que la aerotermia te dé también el agua caliente?
                    </div>
                    <div className="space-y-3">
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
                            subtitle="Mantienes tu sistema actual de agua caliente"
                            selected={funnel.incluir_acs === false}
                            onClick={() => selectIncluir(false)}
                        />
                    </div>
                </div>
            )}
        </StepLayout>
    );
}
