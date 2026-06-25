// Tema de marca del partner (white-label) con contraste accesible.
//
// A partir del color del partner (`landing_color_primary`) derivamos 3 variables
// CSS que consume el bloque `.partner-accent` de index.css:
//   --accent      → color crudo (rellenos de botones/badges)
//   --accent-on   → texto SOBRE el relleno (blanco si el color es oscuro, casi
//                   negro si es claro) para que el botón siempre se lea
//   --accent-text → el color como TEXTO sobre fondo oscuro, aclarado hasta tener
//                   contraste AA (colores oscuros en crudo quedaban ilegibles)
//
// Se usa tanto en la landing del partner (LandingFunnelView) como en el portal
// interno cuando el partner está logueado (DashboardLayout).

const hexRgb = (h) => {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec((h || '').trim());
    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null;
};
const relLum = ([r, g, b]) => {
    const a = [r, g, b].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
};
const contrast = (L1, L2) => (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
const toHex = ([r, g, b]) => '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
const mixWhite = ([r, g, b], t) => [r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t];
const BG_LUM = relLum([8, 9, 12]); // fondo oscuro de la app (#08090C)

export function buildAccentVars(hex) {
    const rgb = hexRgb(hex);
    if (!rgb) return null;
    const L = relLum(rgb);
    const onAccent = L > 0.4 ? '#08090C' : '#FFFFFF';
    // Aclarar el color como texto hasta contraste AA (4.5:1) sobre el fondo.
    let textRgb = rgb, t = 0;
    while (contrast(relLum(textRgb), BG_LUM) < 4.5 && t < 0.92) { t = Math.min(t + 0.08, 0.92); textRgb = mixWhite(rgb, t); }
    return {
        '--accent': hex,
        '--accent-on': onAccent,
        '--accent-text': toHex(textRgb),
        // Canales R,G,B para reconstruir tintes/glows con opacidad: rgba(var(--accent-rgb), .1)
        '--accent-rgb': rgb.join(', '),
    };
}
