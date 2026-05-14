/**
 * Tarjeta clicable grande con icono + título + (opcional) subtítulo.
 * Bloque base de TODOS los pasos del funnel.
 *
 * Diseño: tap-target >48px, icono 64-96px, texto centrado. Estado seleccionado
 * con borde brand y glow. Mobile-first: en móvil ocupa el ancho completo,
 * en desktop forma grid de 2-3 columnas según el contenedor.
 */

import React from 'react';

export function IconCard({ icon, title, subtitle, selected, onClick, badge, disabled }) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={`group relative w-full text-left p-6 rounded-2xl border-2 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed ${
                selected
                    ? 'border-amber-400 bg-amber-400/10 shadow-[0_0_30px_rgba(251,191,36,0.15)]'
                    : 'border-white/10 bg-white/[0.03] hover:border-amber-400/40 hover:bg-white/[0.05]'
            }`}
        >
            {badge && (
                <span className="absolute top-3 right-3 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/30">
                    {badge}
                </span>
            )}
            <div className="flex items-center gap-4">
                <div className={`flex-shrink-0 text-5xl md:text-6xl transition-transform group-hover:scale-110 ${selected ? 'scale-110' : ''}`}>
                    {icon}
                </div>
                <div className="flex-1 min-w-0">
                    <div className={`font-bold text-base md:text-lg leading-tight ${selected ? 'text-amber-300' : 'text-white'}`}>
                        {title}
                    </div>
                    {subtitle && (
                        <div className="text-white/50 text-xs md:text-sm mt-1 leading-snug">
                            {subtitle}
                        </div>
                    )}
                </div>
                {selected && (
                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-amber-400 flex items-center justify-center">
                        <svg className="w-4 h-4 text-bkg-deep" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                )}
            </div>
        </button>
    );
}
