// ─────────────────────────────────────────────────────────────────────────────
// Revisar la envolvente PARED A PARED con el teclado (2026-10-29, lo pidió Fran:
// «que la usabilidad sea la mejor posible»).
//
// Una casa trae ~25 paredes y cada una se miraba pinchándola con el ratón, se le
// ponían sus huecos con el ratón y se daba por revisada con el ratón. Con esto,
// la mano se queda en el teclado:
//
//   Intro      dar la pared por revisada y pasar a la siguiente por mirar
//   → / ←      pared siguiente / anterior (todas, en el orden del plano)
//   V / P      añadir una ventana / una puerta a la pared abierta
//   Supr       quitar el ÚLTIMO hueco de la pared (Ctrl+Z lo devuelve)
//   A          abrir el asistente
//
// REGLA — un atajo NUNCA se roba dentro de un campo, con un modificador pulsado
// (Ctrl+Z es de `useDeshacer`), sobre un botón o enlace con el foco (Intro es su
// clic), dentro de un popup, ni con la pestaña de la envolvente escondida (la
// ventana no se desmonta: se esconde).
//
// Puro y sin React, para probarlo: `node implementation/backend/scripts/test_atajos_pared.mjs`.
// ─────────────────────────────────────────────────────────────────────────────

//: Lo que hace cada tecla. `e.key` en minúscula; «Supr» es `Delete` en el teclado español.
const TECLAS = {
    enter: 'revisada',
    arrowright: 'siguiente',
    arrowleft: 'anterior',
    v: 'ventana',
    p: 'puerta',
    delete: 'quitar',
    a: 'asistente',
};

//: Los atajos, para enseñarlos en la columna (`Atajos` del panel).
export const ATAJOS_PARED = [
    ['Intro', 'pared revisada y a la siguiente'],
    ['→ · ←', 'pared siguiente · anterior'],
    ['V · P', 'añadir ventana · puerta'],
    ['Supr', 'quitar el último hueco'],
    ['A', 'abrir el asistente'],
];

//: El nombre del evento con el que se abre el asistente desde fuera.
export const EVENTO_ABRIR_ASISTENTE = 'envolvente:abrir-asistente';

/** ¿El foco está en algo que escribe? Ahí la tecla es del campo. */
export function enUnCampo(el) {
    if (!el) return false;
    if (el.isContentEditable) return true;
    return /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName || '');
}

/**
 * Qué acción pide una tecla, o `null` si no es nuestra. `e` es el evento (o algo
 * con su forma: `key`, `ctrlKey`, `metaKey`, `altKey`, `target`).
 */
export function accionDeTecla(e) {
    if (!e || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return null;
    const accion = TECLAS[String(e.key || '').toLowerCase()];
    if (!accion) return null;
    const t = e.target;
    if (enUnCampo(t)) return null;
    // Intro sobre un botón o un enlace es SU clic.
    if (accion === 'revisada' && t && /^(BUTTON|A)$/.test(t.tagName || '')) return null;
    // Dentro de un popup (el asistente, leer una foto, una pregunta), nada.
    if (t?.closest?.('[role="dialog"]')) return null;
    return accion;
}

/**
 * La pared vecina de `desde` en el orden del plano (planta, nombre de Catastro),
 * dando la vuelta en los extremos. Se saltan las APARTADAS: no se miran.
 * Sin pared abierta, `paso` 1 da la primera y -1 la última.
 * `plantas` (las de `plano.plantas`, de abajo arriba) dice el orden de las
 * plantas: por su id en texto, la planta 1 salía antes que la baja.
 */
export function paredVecina(muros, desde, paso, esFuera = () => false, plantas = []) {
    const orden = new Map((plantas || []).map((p, i) => [p.id ?? p, i]));
    const lista = Object.values(muros || {})
        .filter(m => !esFuera(m))
        .sort((a, b) => (orden.get(a.planta) ?? 99) - (orden.get(b.planta) ?? 99)
                        || String(a.planta).localeCompare(String(b.planta))
                        || String(a.id).localeCompare(String(b.id), 'es', { numeric: true }));
    if (!lista.length) return null;
    const i = lista.findIndex(m => m.id === desde);
    if (i < 0) return (paso < 0 ? lista[lista.length - 1] : lista[0]).id;
    return lista[(i + paso + lista.length) % lista.length].id;
}
