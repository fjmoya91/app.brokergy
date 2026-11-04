// ─────────────────────────────────────────────────────────────────────────────
// MEMORIA DE PANTALLA de un listado: lo que estabas mirando.
//
// Filtras la cartera por un instalador, abres un expediente y vuelves: el
// listado tiene que seguir como lo dejaste. Hasta ahora los filtros vivían solo
// en el estado del componente, y la vista se REMONTA en cuanto se pulsa su
// pestaña (`navNonce` en App.jsx), se entra por un deep-link o se recarga la
// página — así que había que volver a ponerlos a mano cada vez.
//
// Qué se recuerda: búsqueda, filtros y ordenación. Nunca los DATOS (eso se
// vuelve a pedir al backend) ni nada del negocio.
//
// POR QUÉ `sessionStorage` y no `localStorage`: es la memoria de ESTA sesión de
// trabajo. Un filtro guardado para siempre reaparece días después y deja el
// listado medio vacío sin que nadie recuerde haberlo puesto; al cerrar la
// pestaña se olvida solo. (Las COLUMNAS y sus anchos sí son `localStorage`:
// son una preferencia de pantalla, no una búsqueda de hace un rato.)
//
// Si el navegador no deja escribir (modo privado, almacenamiento capado), no
// pasa nada: se arranca sin memoria y la pantalla funciona igual.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';

const PREFIJO = 'brokergy.vista.';

export function leerVista(clave) {
    try {
        const crudo = sessionStorage.getItem(PREFIJO + clave);
        const obj = crudo ? JSON.parse(crudo) : null;
        return (obj && typeof obj === 'object') ? obj : {};
    } catch {
        return {};
    }
}

export function guardarVista(clave, datos) {
    try { sessionStorage.setItem(PREFIJO + clave, JSON.stringify(datos || {})); } catch { /* sin almacenamiento */ }
}

export function olvidarVista(clave) {
    try { sessionStorage.removeItem(PREFIJO + clave); } catch { /* sin almacenamiento */ }
}

/**
 * Lo guardado la última vez, leído UNA sola vez al montar. Se usa para sembrar
 * los `useState` de los filtros: `useState(memoria.search ?? '')`.
 */
export function useVistaGuardada(clave) {
    return useMemo(() => leerVista(clave), [clave]);
}

/**
 * Guarda el estado de los filtros cada vez que cambia. `datos` es un objeto
 * plano y pequeño; un Set se pasa como array (`[...sel]`).
 */
export function useGuardarVista(clave, datos) {
    const json = JSON.stringify(datos || {});
    useEffect(() => {
        try { sessionStorage.setItem(PREFIJO + clave, json); } catch { /* sin almacenamiento */ }
    }, [clave, json]);
}

/**
 * Dónde habías bajado la lista. SOLO para volver de una ficha a su listado: el
 * sitio se apunta al abrirla (`recordar()`) y se gasta la primera vez que la
 * lista vuelve a estar en pantalla. Cambiar de pestaña no apunta nada, así que
 * se sigue entrando por arriba — que es lo decidido en DashboardLayout (el
 * buscador y el resumen tienen que verse al entrar).
 *
 * Va en su propia clave y no dentro del objeto de los filtros: ese se reescribe
 * entero cada vez que cambia un filtro y se llevaría el sitio por delante.
 *
 * El que scrollea es el <main> del layout, no la ventana: se busca subiendo
 * desde el propio listado (`ancla`). Guardarlo fuera del componente hace que
 * también funcione cuando abrir la ficha DESMONTA la lista (oportunidades, que
 * se abren en la calculadora).
 *
 *   const lista = useScrollLista('expedientes', !!seleccionado, !cargando && filas.length > 0);
 *   <div ref={lista.ancla}> … <tr onClick={() => { lista.recordar(); abrir(f); }}>
 *
 * @param {string}  clave      el mismo nombre de vista que la memoria de filtros
 * @param {boolean} enDetalle  true mientras se ve la ficha (la lista no está en pantalla)
 * @param {boolean} listo      true cuando las filas ya están pintadas (hay altura que recorrer)
 */
export function useScrollLista(clave, enDetalle, listo) {
    const ancla = useRef(null);
    const CLAVE_SCROLL = `${PREFIJO}${clave}.scroll`;

    const scroller = () => ancla.current?.closest('main') || null;

    const recordar = () => {
        const y = scroller()?.scrollTop || 0;
        try {
            if (y > 0) sessionStorage.setItem(CLAVE_SCROLL, String(y));
            else sessionStorage.removeItem(CLAVE_SCROLL);
        } catch { /* sin almacenamiento */ }
    };

    useLayoutEffect(() => {
        if (enDetalle || !listo) return;
        let y = 0;
        try {
            y = Number(sessionStorage.getItem(CLAVE_SCROLL) || 0);
            // Se GASTA: solo se vuelve al sitio en el viaje de ida y vuelta a la
            // ficha, no cada vez que se entra en la pestaña.
            if (y) sessionStorage.removeItem(CLAVE_SCROLL);
        } catch { /* sin almacenamiento */ }
        if (!y) return;
        const main = scroller();
        if (main) main.scrollTop = y;
    }, [CLAVE_SCROLL, enDetalle, listo]);

    return { ancla, recordar };
}
