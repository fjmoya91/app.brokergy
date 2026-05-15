/**
 * Overlay a pantalla completa "Calculando tu ayuda...".
 * Se muestra durante el submit del lead. Mensajes que rotan dan sensación
 * de que se está haciendo trabajo serio (aunque la mayor parte del cálculo
 * es instantánea, el delay percibido aumenta la confianza en el resultado).
 */

import React, { useEffect, useState } from 'react';

const MESSAGES = [
    { icon: '📡', label: 'Conectando con bases oficiales del Estado…' },
    { icon: '🏠', label: 'Analizando los datos catastrales de tu vivienda…' },
    { icon: '⚡', label: 'Calculando la demanda energética…' },
    { icon: '💰', label: 'Cruzando con las ayudas CAE disponibles…' },
    { icon: '✨', label: 'Personalizando tu propuesta…' }
];

export function CalculatingOverlay({ visible }) {
    const [idx, setIdx] = useState(0);

    useEffect(() => {
        if (!visible) {
            setIdx(0);
            return;
        }
        const interval = setInterval(() => {
            setIdx(i => (i + 1) % MESSAGES.length);
        }, 700);
        return () => clearInterval(interval);
    }, [visible]);

    if (!visible) return null;

    const current = MESSAGES[idx];

    return (
        <div className="fixed inset-0 z-[400] flex items-center justify-center bg-bkg-deep/95 backdrop-blur-xl animate-fade-in">
            <div className="text-center px-6 max-w-md">
                {/* Spinner */}
                <div className="relative w-32 h-32 mx-auto mb-10">
                    {/* Anillos concéntricos animados */}
                    <div className="absolute inset-0 rounded-full border-4 border-amber-500/20 border-t-amber-400 animate-spin" />
                    <div className="absolute inset-3 rounded-full border-4 border-amber-500/10 border-b-amber-400/70 animate-spin"
                         style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
                    <div className="absolute inset-6 rounded-full border-4 border-amber-500/5 border-r-amber-400/40 animate-spin"
                         style={{ animationDuration: '2s' }} />
                    {/* Icono central que pulsa */}
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-5xl animate-pulse">
                            {current.icon}
                        </div>
                    </div>
                </div>

                {/* Mensaje principal */}
                <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight mb-3">
                    Calculando tu ayuda exacta
                </h2>

                {/* Mensaje rotando */}
                <div className="h-12 flex items-center justify-center">
                    <p key={idx} className="text-amber-400 text-sm md:text-base font-bold animate-fade-in">
                        {current.label}
                    </p>
                </div>

                {/* Dots de progreso */}
                <div className="flex justify-center gap-2 mt-6">
                    {MESSAGES.map((_, i) => (
                        <div
                            key={i}
                            className={`h-1.5 rounded-full transition-all duration-300 ${
                                i === idx ? 'w-8 bg-amber-400' : i < idx ? 'w-1.5 bg-amber-400/60' : 'w-1.5 bg-white/10'
                            }`}
                        />
                    ))}
                </div>

                <p className="text-white/30 text-xs uppercase tracking-widest font-bold mt-8">
                    Esto solo toma unos segundos
                </p>
            </div>
        </div>
    );
}
