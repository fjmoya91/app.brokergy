/**
 * Layout común para los pasos del funnel.
 * Pregunta grande arriba, contenido en medio, botón "Continuar" abajo.
 */

import React from 'react';

export function StepLayout({ question, subtitle, children, onContinue, canContinue = true, continueLabel = 'Continuar', continueCls, continueIcon }) {
    // Clases del botón: si se pasa continueCls se usa como override del fondo/color;
    // el resto (tamaño, forma, disabled) siempre se aplica.
    const btnBase = 'w-full sm:max-w-xs px-8 py-4 font-black uppercase tracking-widest text-sm rounded-2xl transition-all flex items-center justify-center gap-2';
    const btnEnabled = continueCls
        ? `${continueCls} shadow-lg`
        : 'bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-bkg-deep shadow-lg shadow-amber-500/20';
    const btnDisabled = 'from-white/10 to-white/10 bg-white/10 text-white/30 cursor-not-allowed';

    return (
        <div className="animate-fade-in">
            <div className="text-center mb-8">
                <h2 className="text-2xl md:text-4xl font-black text-white tracking-tight leading-tight">
                    {question}
                </h2>
                {subtitle && (
                    <p className="text-white/50 text-sm md:text-base mt-3 max-w-2xl mx-auto">
                        {subtitle}
                    </p>
                )}
            </div>

            <div className="space-y-3 max-w-2xl mx-auto">
                {children}
            </div>

            {onContinue && (
                <div className="mt-10 flex justify-center">
                    <button
                        type="button"
                        onClick={onContinue}
                        disabled={!canContinue}
                        className={`${btnBase} ${canContinue ? btnEnabled : btnDisabled}`}
                    >
                        {continueIcon && <span className="flex-shrink-0">{continueIcon}</span>}
                        {continueLabel}
                    </button>
                </div>
            )}
        </div>
    );
}
