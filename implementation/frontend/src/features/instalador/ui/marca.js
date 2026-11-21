// ─── marca.js — la MARCA del instalador en su app (fase 5) ───────────────────
// Con su color (`landing_color_primary` de su ficha), la app pinta con él lo que
// marca «dónde estoy» (la casilla activa de la barra y del menú, el nombre de su
// empresa). Se usa la variante para PAPEL CLARO de `partnerTheme.js`
// (`--accent-text-claro`, ya oscurecida hasta 4.5:1 sobre el crema) y aquí se
// vuelve a comprobar contra el fondo MÁS OSCURO donde va (el gris de la casilla
// activa del menú, #f1efeb): si no llega a AA, se oscurece un poco más; si ni así,
// se queda el de BROKERGY. Sin color, nada cambia: el naranja de siempre.
//
// La acción principal de cada tarjeta SIGUE en naranja (estilo «carta de pago»):
// la marca del instalador no compite con «lo que te toca».
import { buildAccentVars } from '../../../utils/partnerTheme.js';

const hexRgb = (h) => {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(h || '').trim());
    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null;
};
const relLum = ([r, g, b]) => {
    const a = [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
};
const toHex = (rgb) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

/** Contraste WCAG entre dos colores «#rrggbb». */
export function contraste(a, b) {
    const x = hexRgb(a); const y = hexRgb(b);
    if (!x || !y) return 0;
    const L1 = relLum(x); const L2 = relLum(y);
    return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
}

// Los fondos sobre los que va el color de la marca: blanco (barra, menú), el papel
// crema y el gris de la casilla activa del menú lateral.
export const FONDOS_MARCA = ['#ffffff', '#faf9f7', '#f1efeb'];
const AA = 4.5;

/**
 * Las variables CSS de la marca, o null (= se queda la de BROKERGY).
 * `{ '--marca': '#…', '--marca-rgb': 'r, g, b' }`, con contraste ≥ 4.5:1 sobre los tres fondos.
 */
export function varsDeMarca(hex) {
    const base = buildAccentVars(hex);
    if (!base) return null;
    let rgb = hexRgb(base['--accent-text-claro']);
    if (!rgb) return null;
    const peor = () => Math.min(...FONDOS_MARCA.map((f) => contraste(toHex(rgb), f)));
    for (let i = 0; i < 12 && peor() < AA; i += 1) rgb = rgb.map((v) => v * 0.92);
    if (peor() < AA) return null;
    const color = toHex(rgb);
    // La casilla activa del menú pasa del tinte naranja al gris: con otro color no casaría.
    return { '--marca': color, '--marca-rgb': hexRgb(color).join(', '), '--marca-fondo': '#f1efeb' };
}
