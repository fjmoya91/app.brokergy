/**
 * Hook de estado del funnel + persistencia en localStorage.
 *
 * Si el visitante recarga la página o vuelve más tarde, retomamos donde lo
 * dejó. La persistencia se borra automáticamente cuando se envía el lead
 * (handleSubmitted) o cuando expira (24 horas).
 *
 * Nota: NO guardamos datos sensibles en localStorage (RGPD); el paso 9
 * (contacto) se omite del estado persistido.
 */

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'brokergy_funnel_state_v1';
const EXPIRY_MS = 24 * 60 * 60 * 1000; // 24h

const INITIAL_FUNNEL = {
    // Catastro resuelto (paso 0)
    catastro: null,

    // Pasos del funnel
    isReforma: null,
    combustible_actual: null,    // 'gas' | 'gasoleo' | 'electrica' | 'carbon' | 'biomasa'
    edad_caldera: null,          // '<10' | '10-20' | '>20' | 'no_se'
    condensacion: null,          // 'si' | 'no' | 'no_se' (solo si gas o gasoleo)
    emisor_tipo: null,           // 'radiadores_convencionales' | ...
    boiler_acs_type: null,       // 'misma_caldera' | 'termo' | 'butano' | 'gas' | 'gasoleo' | 'solar' | 'no_tengo'
    incluir_acs: null,
    reforma_elementos: { ventanas: false, cubierta: false, suelo: false, paredes: false },
    gasto_anual_eur: null,
    presupuesto_modo: null,      // 'tengo' | 'no_se' | 'pide_instalador'
    presupuesto_eur: null,

    // Meta
    timeline: null,
    motivacion: null
};

function loadFromStorage() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed?.timestamp || Date.now() - parsed.timestamp > EXPIRY_MS) {
            localStorage.removeItem(STORAGE_KEY);
            return null;
        }
        return parsed.data;
    } catch {
        return null;
    }
}

function saveToStorage(data) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ timestamp: Date.now(), data }));
    } catch {
        // localStorage lleno o deshabilitado — silenciamos, no es crítico
    }
}

function clearStorage() {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
}

export function useFunnelState() {
    const [funnel, setFunnelState] = useState(() => {
        const stored = loadFromStorage();
        return stored || INITIAL_FUNNEL;
    });
    const [currentStep, setCurrentStep] = useState(0);

    // Persistir en localStorage cada vez que cambia el funnel
    useEffect(() => {
        saveToStorage(funnel);
    }, [funnel]);

    const updateFunnel = useCallback((patch) => {
        setFunnelState(prev => ({ ...prev, ...patch }));
    }, []);

    const resetFunnel = useCallback(() => {
        setFunnelState(INITIAL_FUNNEL);
        setCurrentStep(0);
        clearStorage();
    }, []);

    const goToStep = useCallback((step) => setCurrentStep(step), []);
    const goNext = useCallback(() => setCurrentStep(s => s + 1), []);
    const goBack = useCallback(() => setCurrentStep(s => Math.max(0, s - 1)), []);

    return {
        funnel,
        updateFunnel,
        resetFunnel,
        currentStep,
        setCurrentStep: goToStep,
        goNext,
        goBack
    };
}
