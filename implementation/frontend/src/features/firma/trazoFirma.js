/**
 * Qué GROSOR tiene que dejar la firma en el documento, y con qué radio se pinta
 * para conseguirlo.
 *
 * Vive aparte de `escaneado.js` por dos motivos:
 *
 * 1. Es la única parte que necesita el LIENZO de firma, y `escaneado.js` arrastra
 *    pdf.js y jsPDF — 1,4 MB de worker que el teléfono no usa para nada: allí no
 *    se abre ningún PDF, solo se traza y se manda el PNG.
 * 2. Sin dependencias se puede medir desde un script (`check_trazo_firma.mjs`),
 *    que es lo que sostiene las constantes de aquí abajo.
 */

/** Proporción del recuadro que puede ocupar la rúbrica. */
export const ANCHO_MAX = 0.90;
export const ALTO_MAX = 0.82;
/** A qué altura del recuadro se apoya la firma (fracción desde abajo). */
export const LINEA = 0.10;

/**
 * Lo que mide el TRAZO en el documento, en puntos PDF.
 *
 * Es la referencia que se tiene al lado: la firma de Brokergy impresa en la
 * columna del Cesionario del Convenio mide **2,25 pt** de trazo (medido sobre
 * `firma_brokergy.png`: 9,64 px de grosor medio en una imagen de 514 px de alto,
 * estampada a 160 px CSS). Dos firmas en la misma página con grosores distintos
 * es lo que se ve a un metro, antes que ninguna otra cosa del documento.
 *
 * 2 pt queda justo por debajo de esa referencia: es lo que deja una pluma sobre
 * papel y armoniza con la de al lado sin competir con ella.
 */
export const TRAZO_PT = 2.0;

/**
 * De píxeles de la imagen de la firma a puntos del documento.
 *
 * Es la escala que aplica `estamparFirma`, aquí para que el lienzo pueda saber a
 * qué tamaño va a acabar su trazo ANTES de entregarlo. Sin ella el grosor final
 * dependía de lo grande que cada uno firmase, que no es la decisión de nadie:
 * medido, la MISMA punta daba 2,44 pt firmando grande y 5,92 firmando compacto.
 */
export function escalaEstampado(imagen, box) {
    if (!imagen?.width || !imagen?.height || !box) return 0;
    const cajaW = box.urx - box.llx;
    const cajaH = box.ury - box.lly;
    if (!(cajaW > 0) || !(cajaH > 0)) return 0;
    return Math.min((cajaW * ANCHO_MAX) / imagen.width, (cajaH * ALTO_MAX) / imagen.height);
}

/**
 * Relación entre el radio de la punta y el grosor que deja sobre el papel:
 * `grosor_css ≈ A · radio + B`.
 *
 * No es 2·radio porque el plumín de la pluma es plano —adelgaza en los rasgos
 * que siguen su filo— y porque el borde se difumina en la fibra del papel; ese
 * difuminado es el término independiente. Medido barriendo cinco puntas con
 * `scripts/check_trazo_firma.mjs`, que es lo que hay que volver a pasar si algún
 * día se re-porta `ink.js` desde ScannerApp (regla 34: aquél no se parchea).
 */
export const TRAZO_A = 1.83;
export const TRAZO_B = 0.66;

/**
 * Con qué radio hay que repintar la firma para que su trazo mida `TRAZO_PT`.
 *
 * @param {{width:number,height:number}} ink  el PNG ya extraído (para su caja)
 * @param {object} box    recuadro de `SIGN_BOXES` donde va a caer
 * @param {number} scale  píxeles de dispositivo por píxel CSS del lienzo
 * @returns {number|null} radio en px CSS, o null si no hay con qué calcularlo
 */
export function radioParaTrazo(ink, box, scale) {
    if (!scale) return null;
    const esc = escalaEstampado(ink, box);
    if (!(esc > 0)) return null;
    const grosorCss = (TRAZO_PT / esc) / scale;
    return Math.max(0.35, (grosorCss - TRAZO_B) / TRAZO_A);
}
