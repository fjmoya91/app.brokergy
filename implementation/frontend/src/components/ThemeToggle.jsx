import React from 'react';
import { useTheme } from '../context/ThemeContext';

/**
 * Selector de tema día/noche.
 *
 * - `collapsed`: cuando el sidebar está colapsado (o en barras compactas),
 *   muestra solo un botón-icono que alterna entre claro/oscuro.
 * - por defecto: control segmentado "Oscuro / Claro" a lo ancho.
 */

function SunIcon({ className = 'w-3.5 h-3.5' }) {
    return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
            <circle cx="12" cy="12" r="4" />
            <path strokeLinecap="round" d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32l1.41-1.41" />
        </svg>
    );
}

function MoonIcon({ className = 'w-3.5 h-3.5' }) {
    return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
        </svg>
    );
}

export function ThemeToggle({ collapsed = false, className = '' }) {
    const { isLight, toggleTheme, setTheme } = useTheme();

    if (collapsed) {
        return (
            <button
                type="button"
                onClick={toggleTheme}
                title={isLight ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro'}
                aria-label={isLight ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro'}
                className={`w-10 h-10 flex items-center justify-center rounded-xl border border-white/10 bg-bkg-elevated text-white/60 hover:text-brand hover:border-brand/40 transition-all active:scale-90 ${className}`}
            >
                {isLight ? <MoonIcon className="w-5 h-5" /> : <SunIcon className="w-5 h-5" />}
            </button>
        );
    }

    return (
        <div
            role="group"
            aria-label="Selector de tema"
            className={`flex items-center gap-1 p-1 rounded-xl border border-white/[0.06] bg-bkg-elevated ${className}`}
        >
            <button
                type="button"
                onClick={() => setTheme('dark')}
                aria-pressed={!isLight}
                className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                    !isLight ? 'bg-bkg-hover text-brand shadow-sm' : 'text-white/40 hover:text-white/70'
                }`}
            >
                <MoonIcon /> Oscuro
            </button>
            <button
                type="button"
                onClick={() => setTheme('light')}
                aria-pressed={isLight}
                className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                    isLight ? 'bg-bkg-hover text-brand shadow-sm' : 'text-white/40 hover:text-white/70'
                }`}
            >
                <SunIcon /> Claro
            </button>
        </div>
    );
}
