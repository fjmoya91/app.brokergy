import React, { useState } from 'react';
import { IconCard } from '../components/IconCard';
import { StepLayout } from '../components/StepLayout';

function NoTieneModal({ onGoToReforma, onClose }) {
    const [mode, setMode] = useState('warning'); // 'warning' | 'dead_end'

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center px-4"
            style={{ background: 'var(--reforma-glass)', backdropFilter: 'blur(6px)' }}
        >
            <div
                className="w-full max-w-sm rounded-3xl p-6 animate-fade-in shadow-2xl shadow-amber-900/40"
                style={{ background: 'var(--reforma-amber-panel)', border: '1px solid rgba(245,158,11,0.35)' }}
            >
                {mode === 'warning' ? (
                    <>
                        {/* Aviso en estilo marca — mismo patrón que warning biomasa */}
                        <div className="flex items-start gap-3 mb-5 p-4 rounded-2xl"
                             style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
                            <span className="text-xl flex-shrink-0">⚠️</span>
                            <div>
                                <div className="text-amber-300 font-black text-sm mb-1">
                                    Esto requiere Reforma integral
                                </div>
                                <p className="text-white/60 text-xs leading-relaxed">
                                    Las ayudas CAE requieren{' '}
                                    <strong className="text-white/90">sustituir una calefacción existente</strong>.
                                    Sin sistema previo, solo son accesibles si también se mejora la envolvente
                                    (ventanas, aislamiento, fachada…).
                                </p>
                            </div>
                        </div>

                        <div className="flex flex-col gap-3">
                            <button
                                onClick={() => onGoToReforma && onGoToReforma()}
                                className="w-full py-4 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-900 font-black uppercase tracking-widest text-sm shadow-lg shadow-amber-500/20 transition-all"
                            >
                                🏗️ Ir a Reforma integral
                            </button>
                            <button
                                onClick={() => setMode('dead_end')}
                                className="w-full py-3 rounded-2xl border text-white/50 hover:text-white/80 font-bold text-sm transition-all"
                                style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}
                            >
                                No vamos a hacer reforma
                            </button>
                            <div className="text-center pt-1">
                                <button
                                    onClick={onClose}
                                    className="text-white/25 hover:text-white/55 text-[11px] font-black uppercase tracking-widest transition-colors"
                                >
                                    ← Atrás
                                </button>
                            </div>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="text-center mb-6">
                            <div className="text-5xl mb-4">😔</div>
                            <h3 className="text-white font-black text-xl mb-3 tracking-tight leading-tight">
                                Sin reforma no podemos tramitarlo
                            </h3>
                            <div className="text-white/55 text-sm leading-relaxed space-y-3">
                                <p>
                                    Las ayudas CAE exigen{' '}
                                    <strong className="text-white/90">sustituir un sistema de calefacción ya existente</strong>.
                                    Sin calefacción previa, el programa solo cubre la instalación si va acompañada
                                    de mejoras en la envolvente del edificio.
                                </p>
                                <p>
                                    Si en algún momento decides hacer esas mejoras,{' '}
                                    <strong className="text-amber-400">podremos tramitar la ayuda</strong>.
                                </p>
                            </div>
                        </div>
                        <div className="text-center">
                            <button
                                onClick={onClose}
                                className="text-white/25 hover:text-white/55 text-[11px] font-black uppercase tracking-widest transition-colors"
                            >
                                ← Cambiar mi respuesta
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

export function Step2_Combustible({ funnel, updateFunnel, onNext, onGoToReforma }) {
    const [showModal, setShowModal] = useState(false);

    const select = (combustible) => {
        if (combustible === 'no_tiene') {
            updateFunnel({ combustible_actual: 'no_tiene', sub_solido: null });
            setShowModal(true);
            return;
        }
        setShowModal(false);
        updateFunnel({ combustible_actual: combustible, sub_solido: null });
        setTimeout(onNext, 250);
    };

    const handleClose = () => {
        setShowModal(false);
        updateFunnel({ combustible_actual: null });
    };

    const isBiomasa = funnel.combustible_actual === 'biomasa';

    return (
        <>
            <StepLayout
                question="¿Con qué se calienta hoy tu vivienda?"
                subtitle="Esto nos ayuda a calcular cuánto puedes ahorrar."
            >
                <IconCard
                    icon="🔥"
                    title="Gas natural o butano"
                    subtitle="Caldera de gas (la más común en España)"
                    selected={funnel.combustible_actual === 'gas'}
                    onClick={() => select('gas')}
                />
                <IconCard
                    icon="🛢️"
                    title="Gasóleo / Diésel"
                    subtitle="Caldera con depósito de combustible líquido"
                    selected={funnel.combustible_actual === 'gasoleo'}
                    onClick={() => select('gasoleo')}
                />
                <IconCard
                    icon="⚡"
                    title="Electricidad"
                    subtitle="Radiadores eléctricos o caldera eléctrica"
                    selected={funnel.combustible_actual === 'electrica'}
                    onClick={() => select('electrica')}
                />
                <IconCard
                    icon="⚫"
                    title="Carbón"
                    subtitle="Estufa o caldera de carbón"
                    selected={funnel.combustible_actual === 'carbon'}
                    onClick={() => select('carbon')}
                />
                <IconCard
                    icon="🪵"
                    title="Biomasa"
                    subtitle="Pellets, leña o hueso de aceituna"
                    selected={funnel.combustible_actual === 'biomasa'}
                    onClick={() => select('biomasa')}
                />
                <IconCard
                    icon="🚫"
                    title="No tenía calefacción"
                    subtitle="No había ningún sistema central de calefacción"
                    selected={funnel.combustible_actual === 'no_tiene'}
                    onClick={() => select('no_tiene')}
                />

                {isBiomasa && (
                    <div className="mt-4 p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl animate-fade-in">
                        <div className="flex gap-3">
                            <span className="text-2xl flex-shrink-0">⚠️</span>
                            <div>
                                <div className="text-amber-300 font-bold text-sm mb-1">Aviso importante</div>
                                <p className="text-white/70 text-xs leading-relaxed">
                                    Las ayudas CAE para sustituir biomasa (pellets, leña, hueso) por aerotermia
                                    están en revisión por el Ministerio. Continúa con la simulación y un técnico
                                    verificará personalmente si tu caso es elegible antes de la propuesta formal.
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </StepLayout>

            {showModal && (
                <NoTieneModal
                    onGoToReforma={onGoToReforma}
                    onClose={handleClose}
                />
            )}
        </>
    );
}
