/**
 * Header común a todos los pasos del funnel.
 * Botón "Atrás" + ProgressBar visible + número de paso "X de N".
 */

import React from 'react';

export function StepHeader({ currentStep, totalSteps, onBack, canGoBack = true }) {
    const progress = Math.min(100, Math.round((currentStep / totalSteps) * 100));

    return (
        <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
                <button
                    type="button"
                    onClick={onBack}
                    disabled={!canGoBack}
                    className="flex items-center gap-2 text-white/40 hover:text-amber-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-xs uppercase tracking-widest font-bold py-2"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                    </svg>
                    Atrás
                </button>
                <span className="text-[10px] font-black uppercase tracking-widest text-white/30">
                    Paso {currentStep} de {totalSteps}
                </span>
            </div>
            <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                <div
                    className="h-full bg-gradient-to-r from-amber-500 to-amber-300 transition-all duration-500 ease-out rounded-full"
                    style={{ width: `${progress}%` }}
                />
            </div>
        </div>
    );
}
