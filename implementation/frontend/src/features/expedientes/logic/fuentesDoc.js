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

/** Las familias de cada documento: [nombre CSS, slug del fichero, pesos]. */
export const FUENTE_CIFO = [['Instrument Sans', 'InstrumentSans', [400, 500, 600, 700]]];
export const FUENTE_INTER = [['Inter', 'Inter', [400, 500, 600, 700, 800, 900]]];

/**
 * Las `@font-face` de un documento, servidas desde la propia app.
 * @param {string} appUrl  origen de la app (en Node llega por parámetro)
 * @param {Array}  fams    familias; por defecto la del CIFO
 */
export function buildFontFaces(appUrl, fams = FUENTE_CIFO) {
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
