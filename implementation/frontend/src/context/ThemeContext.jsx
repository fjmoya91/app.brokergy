import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

/**
 * Tema de la app (día / noche).
 *
 * El tema OSCURO es el por defecto (es como ha estado siempre en producción):
 * si no hay nada en localStorage, no se aplica ninguna clase y todo queda igual
 * que antes. El tema CLARO se activa añadiendo la clase `theme-light` en
 * <html> (document.documentElement); el remapeo de colores vive en index.css
 * (mismo mecanismo que el bloque `.partner-accent`).
 *
 * Para evitar el "flash" de tema incorrecto al cargar, la clase también se
 * siembra desde un script inline en index.html ANTES de pintar.
 */

const ThemeContext = createContext(null);
const STORAGE_KEY = 'brokergy-theme';

function getInitialTheme() {
    try {
        const t = localStorage.getItem(STORAGE_KEY);
        if (t === 'light' || t === 'dark') return t;
    } catch (_) { /* localStorage no disponible */ }
    return 'dark'; // por defecto: oscuro (look actual)
}

function applyTheme(theme) {
    const root = document.documentElement;
    if (!root) return;
    if (theme === 'light') root.classList.add('theme-light');
    else root.classList.remove('theme-light');
}

export function ThemeProvider({ children }) {
    const [theme, setThemeState] = useState(getInitialTheme);

    useEffect(() => {
        applyTheme(theme);
        try { localStorage.setItem(STORAGE_KEY, theme); } catch (_) { /* noop */ }
    }, [theme]);

    const setTheme = useCallback((t) => setThemeState(t === 'light' ? 'light' : 'dark'), []);
    const toggleTheme = useCallback(() => setThemeState(p => (p === 'light' ? 'dark' : 'light')), []);

    return (
        <ThemeContext.Provider value={{ theme, setTheme, toggleTheme, isLight: theme === 'light' }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const ctx = useContext(ThemeContext);
    // Fallback defensivo si algún componente se renderiza fuera del provider.
    if (!ctx) return { theme: 'dark', isLight: false, setTheme: () => {}, toggleTheme: () => {} };
    return ctx;
}
