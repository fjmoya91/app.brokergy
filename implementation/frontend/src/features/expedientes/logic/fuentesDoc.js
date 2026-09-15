// ─── Las tipografías de los documentos, AUTO-ALOJADAS ────────────────────────
//
// REGLA — un documento NUNCA pide su fuente a Google Fonts. El PDF lo rasteriza
// Puppeteer en el servidor abriendo y cerrando un Chrome en CADA documento (sin
// caché entre uno y otro), así que un `<link>`/`@import` a fonts.googleapis.com
// significa volver a descargarla en cada generación y depender de que llegue a
// tiempo.
//
// Cuando no llegaba, el resultado no era "parecido": el contenedor solo tiene
// fonts-liberation y ninguna de las familias del respaldo (Arial, Roboto, Segoe
// UI, Noto Sans) existe, así que `fc-match sans-serif` devolvía **Liberation
// MONO**. La propuesta 26RES060_OP193 salió ENTERA en Courier y así la recibió
// el cliente (15/09/2026). Hay además un `fontconfig-local.conf` en la imagen
// como red de seguridad, pero la fuente correcta no puede depender de la red.
//
// Los ficheros viven en `frontend/public/fonts` con el nombre
// `{slug}-{peso}-{subset}.woff2` y los sirve el propio nginx de la app.
//
// Vive en su PROPIO módulo, y no dentro de cifoDoc.js, porque lo necesitan
// también `docGenerators.js` (Convenio de Cesión) y la propuesta — y cifoDoc ya
// importa docGenerators: tenerlo allí creaba un CICLO de imports que, al
// evaluarse `ANEXO_CESION_CSS` en el top-level, dejaba las constantes de rango
// en su zona muerta y reventaba los dos documentos enteros.

const FONT_LATIN = 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';
const FONT_LATINEXT = 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF';

/** Las familias de cada documento: [nombre CSS, slug del fichero, pesos].
 *
 * Los pesos son los que cada documento pedía en su `<link>`: no se añaden "por
 * si acaso" — cada peso son dos ficheros más que el navegador puede acabar
 * descargando, y una cara que no se usa no se echa de menos. */
export const FUENTE_CIFO = [['Instrument Sans', 'InstrumentSans', [400, 500, 600, 700]]];
export const FUENTE_INTER = [['Inter', 'Inter', [400, 500, 600, 700, 800, 900]]];
// Factura al S.O.: Manrope para el cuerpo y Archivo para los rótulos gordos.
export const FUENTE_FACTURA_SO = [
    ['Manrope', 'Manrope', [400, 500, 600, 700, 800]],
    ['Archivo', 'Archivo', [600, 700, 800]],
];
// Anexo Fotográfico: Manrope de cuerpo y Space Grotesk en los titulares.
export const FUENTE_ANEXO_FOTO = [
    ['Space Grotesk', 'SpaceGrotesk', [400, 500, 600, 700]],
    ['Manrope', 'Manrope', [400, 500, 600, 700, 800]],
];

/**
 * De dónde se sirven las fuentes cuando quien llama no lo dice.
 *
 * Node-safe: estos documentos se generan TAMBIÉN en el servidor (cifoService, la
 * skill del Anexo Fotográfico, el MCP), donde no hay `window` ni
 * `import.meta.env`. En relativo no valdría: Puppeteer rasteriza con
 * `setContent`, o sea sobre `about:blank`, y ahí no hay base que resolver.
 * Mismo respaldo que `ASSET_URL` de cifoService, que sirve esos mismos ficheros.
 */
export function origenApp() {
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_APP_URL) return import.meta.env.VITE_APP_URL;
    if (typeof window !== 'undefined' && window.location) return window.location.origin;
    if (typeof process !== 'undefined' && process.env) {
        return process.env.CIFO_ASSET_URL || process.env.VITE_APP_URL || process.env.FRONTEND_URL || 'https://app.brokergy.es';
    }
    return 'https://app.brokergy.es';
}

/**
 * Las `@font-face` de un documento, servidas desde la propia app.
 * @param {string} [appUrl]  origen; si no se pasa, lo resuelve `origenApp()`
 * @param {Array}  fams      familias; por defecto la del CIFO
 */
export function buildFontFaces(appUrl = origenApp(), fams = FUENTE_CIFO) {
    let out = '';
    for (const [name, slug, weights] of fams) {
        for (const w of weights) {
            for (const [sub, range] of [['latin', FONT_LATIN], ['latinext', FONT_LATINEXT]]) {
                out += `@font-face{font-family:'${name}';font-style:normal;font-weight:${w};font-display:swap;src:url('${appUrl}/fonts/${slug}-${w}-${sub}.woff2') format('woff2');unicode-range:${range};}`;
            }
        }
    }
    return out;
}
