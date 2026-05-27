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
    reforma_elementos: { caldera: false, ventanas: false, cubierta: false, suelo: false, paredes: false, placas: false, aires: false },
    reforma_aires_count: null,   // 1 | 2 | 3 | 4 (4 = "4+"). Solo si reforma_elementos.aires === true
    gasto_anual_eur: null,
    presupuesto_modo: null,      // 'tengo' | 'no_se' | 'pide_instalador'
    presupuesto_eur: null,

    // ---- Flujo Reforma (/reforma) ----
    obra_estado: null,           // 'no_empezada' | 'a_medias' | 'ejecutada' | 'nueva'
    reforma_sin_caldera: false,  // true si no había caldera de calefacción → boilerHeatingType 'No tiene Calefacción'
    reforma_facturas: null,      // 'si' | 'no'
    reforma_factura_fecha: null, // 'menos1mes' | 'mas1mes'
    reforma_cee_previo: null,    // 'si' | 'no' | 'nose'  (obra a medias)
    reforma_cee_ambos: null,     // 'si' | 'no'           (obra ejecutada: previo + posterior)
    reforma_fotos: null,         // 'si' | 'no'
    reforma_ejec_fecha: null,    // 'antes2024' | 'desde2024'

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
        return { funnel: parsed.data, currentStep: parsed.currentStep || 0 };
    } catch {
        return null;
    }
}

function saveToStorage(data, currentStep) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ timestamp: Date.now(), data, currentStep }));
    } catch {
        // localStorage lleno o deshabilitado — silenciamos, no es crítico
    }
}

// Caché del estado inicial para no releer localStorage dos veces en el mount
let _storedOnce = undefined;
function getStoredOnce() {
    if (_storedOnce === undefined) _storedOnce = loadFromStorage();
    return _storedOnce;
}

function clearStorage() {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
}

export function useFunnelState(mode = 'public') {
    const isInternal = mode === 'internal';

    const [funnel, setFunnelState] = useState(() =>
        isInternal ? INITIAL_FUNNEL : (getStoredOnce()?.funnel || INITIAL_FUNNEL)
    );
    const [currentStep, setCurrentStepRaw] = useState(() =>
        isInternal ? 0 : (getStoredOnce()?.currentStep || 0)
    );

    // Persistir en localStorage cada vez que cambia el funnel o el paso actual (solo público)
    useEffect(() => {
        if (isInternal) return;
        saveToStorage(funnel, currentStep);
    }, [funnel, currentStep]);

    const updateFunnel = useCallback((patch) => {
        setFunnelState(prev => ({ ...prev, ...patch }));
    }, []);

    const resetFunnel = useCallback(() => {
        setFunnelState(INITIAL_FUNNEL);
        setCurrentStepRaw(0);
        _storedOnce = null; // limpiar caché de mount
        clearStorage();
    }, []);

    const goToStep  = useCallback((step) => setCurrentStepRaw(step), []);
    const goNext    = useCallback(() => setCurrentStepRaw(s => s + 1), []);
    const goBack    = useCallback(() => setCurrentStepRaw(s => Math.max(0, s - 1)), []);

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
