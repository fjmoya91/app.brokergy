import { useCallback, useEffect, useRef, useState } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Deshacer y rehacer el trabajo de la envolvente.
//
// POR QUÉ: aquí no hay botón de guardar — se guarda solo, con un freno de 1,2 s
// (y eso es lo correcto: que alguien se olvide de pulsar no puede costarle el
// trabajo). Pero la otra cara de un autoguardado es que un error también se
// guarda solo: apartar la pared equivocada, borrar una ventana que costó medir
// o pulsar «quitar» en el hueco de al lado se persistía antes de que te dieras
// cuenta, y la única salida era volver a hacerlo a mano.
//
// QUÉ SE DESHACE: el trabajo del plano y los ajustes de la ficha, JUNTOS. Son
// una sola cosa —se guardan en el mismo documento (`cee.envolvente`) y se
// cargan juntos—, así que deshacer uno sin el otro dejaría el expediente
// diciendo dos cosas.
// ─────────────────────────────────────────────────────────────────────────────

//: Cuántos pasos atrás se guardan. Cada uno son ~2 KB en memoria y nunca se
//: escriben: un histórico más largo no sirve para lo que esto resuelve, que es
//: el resbalón de hace un minuto.
const TOPE = 60;

//: Lo que tarda un cambio en convertirse en un PASO. Sin esta espera, teclear
//: «150» en los litros del depósito serían tres pasos y habría que pulsar
//: deshacer tres veces para quitar un número.
const ESPERA_MS = 700;

/**
 * La huella de un estado, para saber si ha cambiado.
 *
 * ⚠️ SIN `sel`: es dónde se está mirando, no trabajo. Contándolo, pulsar una
 * pared sería un paso y deshacer te devolvería la selección anterior en vez de
 * deshacer lo que hiciste. Es el mismo criterio que `hayCambios`, que tampoco
 * pregunta por ella al cerrar la pestaña.
 *
 * Dentro de la FOTO sí viaja, y se restaura: es dónde estabas cuando hiciste
 * ese cambio, así que deshacer te devuelve a mirarlo.
 */
export const huella = (trabajo, ajustes) =>
    JSON.stringify([{ ...(trabajo || {}), sel: null }, ajustes || {}]);

/**
 * Apuntar un paso: la mecánica de la pila, SIN React.
 *
 * Va aparte y exportada porque es lo único de aquí que puede romperse en
 * silencio —un bucle, o no apuntar nunca— y el frontend no tiene banco de
 * pruebas donde montar un hook. Así se comprueba con un `node`.
 *
 * Al apuntar se TRUNCA lo que había por delante: tras deshacer tres pasos y
 * volver a tocar algo, el camino que se abandonó ya no existe. Es lo que hace
 * cualquier editor, y lo contrario —conservar dos futuros— no se puede enseñar
 * con dos botones.
 */
export function apuntar(pila, pos, foto, tope = TOPE) {
    const hasta = pila.slice(0, pos + 1);
    hasta.push(foto);
    const nueva = hasta.length > tope ? hasta.slice(hasta.length - tope) : hasta;
    return { pila: nueva, pos: nueva.length - 1 };
}

/** ¿Este estado es distinto del que está puesto? Es lo que evita el bucle. */
export const esNuevo = (pila, pos, h) => pila[pos]?.h !== h;

/**
 * @param {object}   p
 * @param {object}   p.trabajo     lo que devuelve `usePlanoEnvolvente().trabajo`
 * @param {object}   p.ajustes     los de la ficha (viven en la vista)
 * @param {function} p.onRestaurar (trabajo, ajustes) => void
 */
export function useDeshacer({ trabajo, ajustes, onRestaurar }) {
    const pila = useRef([]);
    //: El sitio y el tamaño van en ESTADO y no se leen de la pila al pintar: de
    //: ellos dependen los dos botones, y un `ref` no repinta (y leerlo durante
    //: el render es justo lo que el linter de React no deja hacer).
    const [hist, setHist] = useState({ pos: -1, largo: 0 });

    //: Por `ref` para no meterla en las dependencias del efecto: la vista la
    //: pasa como flecha en línea, así que cambia de identidad en cada render y
    //: rearmaría el freno sin parar (mismo gotcha que `onGuardado` en la ficha
    //: de un CEE directo).
    const restaurarRef = useRef(onRestaurar);
    useEffect(() => { restaurarRef.current = onRestaurar; }, [onRestaurar]);

    // Se APUNTA un paso cuando el cambio se asienta. El dedupe contra la foto
    // actual es lo que hace que restaurar no se apunte a sí mismo: al volver a
    // un estado, su huella ya es la de `pila[pos]` y no se guarda nada.
    useEffect(() => {
        if (!trabajo) return undefined;
        const h = huella(trabajo, ajustes);
        if (!esNuevo(pila.current, hist.pos, h)) return undefined;
        const t = setTimeout(() => {
            const r = apuntar(pila.current, hist.pos, { h, trabajo, ajustes });
            pila.current = r.pila;
            setHist({ pos: r.pos, largo: r.pila.length });
        }, ESPERA_MS);
        return () => clearTimeout(t);
    }, [trabajo, ajustes, hist.pos]);

    const ir = useCallback((i) => {
        const foto = pila.current[i];
        if (!foto) return false;
        setHist(h => ({ ...h, pos: i }));
        restaurarRef.current?.(foto.trabajo, foto.ajustes);
        return true;
    }, []);

    const deshacer = useCallback(() => ir(hist.pos - 1), [ir, hist.pos]);
    const rehacer = useCallback(() => ir(hist.pos + 1), [ir, hist.pos]);

    // Ctrl+Z / Ctrl+Y (⌘ en Mac).
    //
    // ⚠️ NO dentro de un campo de texto: ahí Ctrl+Z es el del navegador y
    // deshace lo que se está escribiendo, que es lo que uno espera. Robárselo
    // para tirar del histórico de la app sería peor que no tener atajo.
    useEffect(() => {
        const alPulsar = (e) => {
            if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
            const k = String(e.key).toLowerCase();
            if (k !== 'z' && k !== 'y') return;
            if (enUnCampo(document.activeElement)) return;
            const atras = k === 'z' && !e.shiftKey;
            if (atras ? deshacer() : rehacer()) e.preventDefault();
        };
        window.addEventListener('keydown', alPulsar);
        return () => window.removeEventListener('keydown', alPulsar);
    }, [deshacer, rehacer]);

    return {
        deshacer, rehacer,
        puedeDeshacer: hist.pos > 0,
        puedeRehacer: hist.pos >= 0 && hist.pos < hist.largo - 1,
    };
}

function enUnCampo(el) {
    if (!el) return false;
    if (el.isContentEditable) return true;
    return /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName || '');
}

export default useDeshacer;
