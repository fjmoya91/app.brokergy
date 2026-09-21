// reforma.js — lo que se REFORMA en la envolvente, y cómo se llama en el .cex.
//
// El certificador marca en el plano qué ventana se cambia, qué pared se aísla
// y qué parte de la cubierta se rehace. Al .cex eso llega SOLO como un sufijo
// en el NOMBRE («V1 - CAMBIA», «FBE1 CALLE - CAMBIA»): es lo que ve en el
// árbol de CE3X y lo que le dice sobre qué elementos montar la medida de
// mejora. Ni una U se toca (decisión del 2026-09-19).
//
// Es un módulo PURO —sin React ni imports— para poder probarlo desde Node
// (`test_envolvente_cambia.mjs`): el hook importa los suyos sin extensión y
// Node no los resuelve.

//: Tal cual lo escribe el motor (`SUFIJO_CAMBIA` en `generar_cex.py`). Si aquí
//: se escribiera distinto, el hueco y su pared saldrían con dos sufijos.
export const SUFIJO_CAMBIA = ' - CAMBIA';

/** El nombre con el que un hueco se escribe en el .cex. */
export function nombreHueco(h) {
    const n = String(h?.nombre || '').trim();
    return h?.cambia && n && !n.endsWith(SUFIJO_CAMBIA) ? n + SUFIJO_CAMBIA : n;
}
