import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import jsPDF from 'jspdf';
// El grosor de la firma y el encaje en su recuadro viven aparte: los necesita el
// LIENZO de firma, y arrastrar pdf.js hasta el teléfono para eso sobraba.
import { ANCHO_MAX, ALTO_MAX, LINEA, escalaEstampado, radioParaTrazo, TRAZO_PT } from './trazoFirma';

export { escalaEstampado, radioParaTrazo, TRAZO_PT };

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

/**
 * Estampar la firma y dejar el documento "como salido del escáner".
 *
 * En ScannerApp esto lo hace el motor de Python (PyMuPDF: `stamp` sin rasterizar
 * y `export_scanned` a 200 DPI). Aquí no hay Python delante del cliente, así que
 * lo hace el NAVEGADOR con pdf.js —que ya está en el bundle para el visor de
 * Autofirma— y jsPDF. Y de paso sale gratis lo que allí son dos operaciones: si
 * la página se convierte en imagen, la firma se pinta encima del píxel y no hay
 * que incrustar nada en el PDF.
 *
 * REGLA — la firma manuscrita sale RASTERIZADA, y eso es lo que se quiere. Un
 * documento con texto seleccionable y una firma pegada encima no se parece a lo
 * que se venía recibiendo (un escaneo), y además delata que el "papel" nunca
 * existió. Rasterizado, el resultado es indistinguible de haberlo impreso,
 * firmado y pasado por el escáner — que es exactamente lo que ha ocurrido, solo
 * que sin el papel.
 *
 * REGLA — el que decide DÓNDE cae la firma es `signBoxes.js`, la misma fuente
 * que usa Autofirma. Si el recuadro se mueve al cambiar la plantilla, se mueven
 * las dos firmas a la vez; con una copia de las coordenadas aquí, la electrónica
 * y la manuscrita acabarían cayendo en sitios distintos del mismo documento.
 */

// 150 DPI: un A4 sale a 1240x1754 px. A 200 (lo de ScannerApp, que corre en un
// PC) un móvil de gama media tiene que sostener 3,9 MPx por página y las cinco
// del envío se le atragantan. A 150 el texto se lee sin esfuerzo y cada página
// pesa ~200 KB en JPEG.
const DPI = 150;
const CALIDAD_JPEG = 0.85;

/** Carga un PNG/JPG (data URL o URL) como imagen ya lista para dibujar. */
export function cargarImagen(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('No se pudo leer la imagen.'));
        img.src = src;
    });
}

/**
 * Abre un PDF. SIEMPRE sobre una copia de los bytes.
 *
 * pdf.js TRANSFIERE el array al worker, así que el original se queda vacío
 * (`detached`) en cuanto se abre el documento. Sin la copia, el segundo uso del
 * mismo PDF —volver a firmar tras verlo, o escanear después de haberlo leído en
 * el visor— recibía cero bytes: ni error ni documento, el proceso se quedaba
 * colgado en "preparando tu documento firmado".
 */
export async function cargarPdf(bytes) {
    const origen = bytes instanceof Uint8Array ? bytes.buffer : bytes;
    if (!origen || origen.byteLength === 0) throw new Error('El documento llegó vacío.');
    return pdfjsLib.getDocument({ data: new Uint8Array(origen.slice(0)) }).promise;
}

/**
 * Un lienzo para rasterizar, FUERA del DOM: no se enseña, así que no tiene por
 * qué existir como nodo. Safari trae `OffscreenCanvas` desde 16.4; en un iPhone
 * más viejo se cae al canvas de siempre y todo funciona igual.
 */
function crearLienzo(w, h) {
    if (typeof OffscreenCanvas !== 'undefined') {
        try { return new OffscreenCanvas(w, h); } catch { /* al canvas normal */ }
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    return canvas;
}

/** JPEG (Blob) del lienzo, sea del DOM o de los que no tienen `toBlob`. */
function aBlobJpeg(canvas, calidad) {
    if (canvas.convertToBlob) return canvas.convertToBlob({ type: 'image/jpeg', quality: calidad });
    return new Promise((resolve, reject) => {
        canvas.toBlob(b => (b ? resolve(b) : reject(new Error('No se pudo convertir la imagen.'))), 'image/jpeg', calidad);
    });
}

/**
 * La foto del DNI, a un tamaño razonable para viajar.
 *
 * Un móvil de hoy hace fotos de 4-5 MB, y esas dos caras iban tal cual dentro del
 * Convenio: medido en 26RES060_176, el anexo firmado pesaba 6,7 MB de los que
 * 5,5 eran el DNI. Eso lo sube el cliente por datos móviles, que es justo donde
 * la conexión falla, y no aporta nada: a 1800 px de lado mayor el documento
 * ocupa unos 1200 px de ancho —más que un escaneo a 300 ppp— y el número se lee
 * igual de bien.
 *
 * Ante cualquier duda se devuelve el ORIGINAL: una foto pesada se sube; una foto
 * que se ha estropeado al recomprimir obliga a repetirla, y la está haciendo
 * alguien que ya ha firmado dos documentos.
 */
export async function comprimirImagen(file, { maxLado = 1800, calidad = 0.82 } = {}) {
    if (!file || !(file.type || '').startsWith('image/')) return file;   // un PDF no se toca
    const url = URL.createObjectURL(file);
    try {
        const img = await cargarImagen(url);
        const escala = Math.min(1, maxLado / Math.max(img.width, img.height));
        if (escala === 1 && file.size < 900 * 1024) return file;         // ya venía fina
        const w = Math.max(1, Math.round(img.width * escala));
        const h = Math.max(1, Math.round(img.height * escala));
        const canvas = crearLienzo(w, h);
        const ctx = canvas.getContext('2d');
        // Blanco debajo: un PNG con transparencia se volvería NEGRO en JPEG.
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, w, h);
        const blob = await aBlobJpeg(canvas, calidad);
        canvas.width = canvas.height = 0;
        if (!blob || blob.size >= file.size) return file;                 // no ha mejorado
        return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg',
            { type: 'image/jpeg', lastModified: Date.now() });
    } catch {
        return file;
    } finally {
        URL.revokeObjectURL(url);
    }
}

/** JPEG (data URL) del lienzo, sea del DOM o de los que no tienen `toDataURL`. */
async function aJpeg(canvas, calidad = CALIDAD_JPEG) {
    if (canvas.toDataURL) return canvas.toDataURL('image/jpeg', calidad);
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: calidad });
    return await new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result);
        fr.onerror = () => reject(new Error('No se pudo convertir la página.'));
        fr.readAsDataURL(blob);
    });
}

/** Renderiza una página a un lienzo a `dpi`. Devuelve también su viewport. */
export async function renderizarPagina(doc, numero, dpi = DPI) {
    const page = await doc.getPage(numero);
    const viewport = page.getViewport({ scale: dpi / 72 });
    const canvas = crearLienzo(Math.floor(viewport.width), Math.floor(viewport.height));
    const ctx = canvas.getContext('2d');
    // Fondo blanco explícito: un canvas nace transparente y al pasarlo a JPEG el
    // transparente se vuelve NEGRO. Una página en blanco saldría en negro.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // `intent: 'print'` NO es cosmético: al pintar para pantalla, pdf.js reparte
    // la página en trozos encadenados con `requestAnimationFrame`, y rAF no corre
    // con la pestaña en segundo plano ni con el móvil bloqueado. Medido: el
    // escaneo se quedaba parado PARA SIEMPRE en cuanto la pantalla dejaba de
    // estar a la vista — y que el cliente mire un WhatsApp mientras se prepara su
    // documento es el caso normal, no el raro. Con intención de impresión pinta
    // del tirón; y es además lo que estamos haciendo, imprimir para escanear.
    await page.render({ canvasContext: ctx, viewport, intent: 'print' }).promise;
    return { canvas, viewport, page };
}

/**
 * La caja de firma (puntos PDF, origen abajo-izquierda) en píxeles del canvas.
 * Se convierten las dos esquinas y se toma el rectángulo que forman: así vale
 * también si la página estuviera girada, que es cuando el eje Y no es el que
 * uno se imagina.
 */
function cajaEnCanvas(viewport, box) {
    const [x1, y1] = viewport.convertToViewportPoint(box.llx, box.lly);
    const [x2, y2] = viewport.convertToViewportPoint(box.urx, box.ury);
    return {
        x: Math.min(x1, x2),
        y: Math.min(y1, y2),
        w: Math.abs(x2 - x1),
        h: Math.abs(y2 - y1),
    };
}

/**
 * Pinta la firma dentro de su recuadro: centrada, con su proporción intacta y
 * apoyada sobre la línea, como se firma sobre el papel. Nunca se deforma para
 * llenar la caja — una firma estirada canta a montaje desde el otro lado de la
 * mesa.
 */
export function estamparFirma(canvas, viewport, box, imagen) {
    const caja = cajaEnCanvas(viewport, box);
    // La MISMA cuenta que `escalaEstampado`, pero sobre la caja ya convertida a
    // píxeles del lienzo (aquélla trabaja en puntos, que es lo que necesita el
    // lienzo de firma para saber a qué tamaño acabará su trazo).
    const escala = Math.min(
        (caja.w * ANCHO_MAX) / imagen.width,
        (caja.h * ALTO_MAX) / imagen.height,
    );
    const w = imagen.width * escala;
    const h = imagen.height * escala;
    const x = caja.x + (caja.w - w) / 2;
    const y = caja.y + caja.h - caja.h * LINEA - h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imagen, x, y, w, h);
    return { x, y, w, h, caja };
}

/**
 * La caja de firma de ESTE PDF concreto.
 *
 * `SIGN_BOXES` entrega una FUNCIÓN cuando conviven dos formatos del mismo
 * impreso (regla 41): el oficial lo rellena pdf-lib y la maqueta la rasteriza
 * Chrome, y no firman en la misma página. Se exporta porque el lienzo de firma
 * necesita la misma caja ANTES de estampar nada — de su tamaño sale el grosor
 * del trazo, y con dos criterios distintos se calibraría contra una caja y se
 * estamparía en otra.
 */
export async function resolverCaja(doc, box) {
    if (typeof box !== 'function') return box || null;
    let productor = '';
    try { productor = (await doc.getMetadata())?.info?.Producer || ''; } catch { /* da igual */ }
    return box({ numPaginas: doc.numPages, oficial: /pdf-lib/i.test(productor) });
}

/**
 * Documento firmado y escaneado.
 *
 * @param {ArrayBuffer|Uint8Array} bytes  el PDF original (el borrador de Drive)
 * @param {object} opts
 *   - firma {string}     PNG de la firma (data URL). Sin ella solo se escanea.
 *   - box {object|function}  recuadro de `SIGN_BOXES` donde cae la firma. Puede ser
 *       una FUNCIÓN `({ numPaginas, oficial }) => recuadro`: el mismo documento
 *       convive en dos formatos —el impreso OFICIAL del Ministerio y la maqueta
 *       anterior, que sigue en Drive en los expedientes ya enviados— y la firma no
 *       cae en el mismo sitio. Ver `signBoxes.js`.
 *   - onProgreso {(hecho:number, total:number) => void}
 * @returns {{ blob: Blob, vista: string }} `vista` es la página de la firma ya
 *   rasterizada (data URL), para enseñar cómo ha quedado sin renderizar otra vez.
 *   Solo esa: guardar el JPEG de las cinco páginas para enseñar una era casi un
 *   mega de memoria de más en un móvil que ya está sosteniendo el PDF entero.
 */
export async function firmarYEscanear(bytes, { firma, box, onProgreso } = {}) {
    const doc = await cargarPdf(bytes);
    const total = doc.numPages;
    // Qué formato es este PDF: el impreso oficial lo rellena pdf-lib; la maqueta la
    // rasteriza Chrome ("Skia/PDF"). Mismo criterio que FirmarConCertificadoModal.
    const caja = await resolverCaja(doc, box);
    // Si la plantilla se quedara con menos páginas de las que dice el recuadro,
    // la firma va a la ÚLTIMA: mejor firmada donde se pueda que perdida.
    const paginaFirma = caja ? Math.min(caja.page || total, total) : 0;
    const imagen = firma ? await cargarImagen(firma) : null;

    let pdf = null;
    let vista = null;
    for (let n = 1; n <= total; n++) {
        const { canvas, viewport } = await renderizarPagina(doc, n);
        if (imagen && n === paginaFirma) estamparFirma(canvas, viewport, caja, imagen);

        const jpeg = await aJpeg(canvas);
        if (n === (paginaFirma || 1)) vista = jpeg;

        // El tamaño de la hoja se conserva en PUNTOS, no en píxeles: el PDF que
        // sale mide lo mismo que el que entró (un A4 sigue siendo un A4 al
        // imprimirlo) por mucho que dentro lleve una imagen de 150 DPI.
        const ancho = viewport.width / (DPI / 72);
        const alto = viewport.height / (DPI / 72);
        const orientacion = ancho > alto ? 'landscape' : 'portrait';
        if (!pdf) pdf = new jsPDF({ unit: 'pt', format: [ancho, alto], orientation: orientacion });
        else pdf.addPage([ancho, alto], orientacion);
        pdf.addImage(jpeg, 'JPEG', 0, 0, ancho, alto);

        // Un canvas de 1240x1754 son 8,7 MB en memoria; con cinco páginas vivas
        // a la vez, un móvil justo de RAM tira la pestaña entera.
        canvas.width = canvas.height = 0;
        onProgreso?.(n, total);
    }
    try { doc.destroy(); } catch { /* da igual */ }
    return { blob: pdf.output('blob'), vista };
}
