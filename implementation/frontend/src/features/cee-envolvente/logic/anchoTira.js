import { useEffect, useState } from 'react';

// El ANCHO de una tira del plano (Vivienda, Cubierta, Lucernarios, la paleta de
// la pizarra), medido en la propia tira. Lo que manda es lo que mide la
// TARJETA —en «Las dos» son dos de ~470 px aunque la pantalla tenga 1920—, no
// la pantalla, y Tailwind 3 no tiene container queries. Con él, cada tira
// ACORTA sus etiquetas en vez de partirlas en dos líneas (ver
// `components/TiraPlano.jsx`). Va aparte porque un fichero de componentes que
// exporta funciones rompe el fast refresh de Vite.

/**
 * El ancho de contenido de una tira, en px (0 hasta la primera medida).
 * Devuelve `[ref, ancho]`: el `ref` es una función, así que vale aunque la tira
 * cambie de raíz (de la tira normal al modo de dibujo y vuelta).
 * Va ANTES de cualquier `return` del componente que lo use (regla 62).
 */
export function useAnchoTira() {
    const [el, setEl] = useState(null);
    const [ancho, setAncho] = useState(0);
    useEffect(() => {
        if (!el || typeof ResizeObserver === 'undefined') return undefined;
        const ro = new ResizeObserver(([e]) => setAncho(Math.round(e.contentRect.width)));
        ro.observe(el);
        return () => ro.disconnect();
    }, [el]);
    return [setEl, ancho];
}

/** ¿Es la tira más estrecha que `umbral`? Sin medir todavía (0), no. */
export const estrecha = (ancho, umbral) => ancho > 0 && ancho < umbral;
