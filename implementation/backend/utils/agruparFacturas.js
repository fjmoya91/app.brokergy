/**
 * Cómo se reparten en FACTURAS los ficheros que se sueltan de una vez.
 *
 * REGLA — cada PDF es UNA factura; las imágenes sueltas son páginas de UNA.
 * `ceeOcrService.normalizeToPdf` está escrita para el caso de las fotos ("varias
 * páginas de un mismo documento") y ante DOS PDF se queda con el primero
 * (`files.find(isPdf)`). Soltando dos facturas a la vez, la segunda no se leía,
 * no se subía a Drive y no dejaba rastro: desaparecía en silencio.
 *
 * Un PDF ya es un documento entero, así que dos PDF son dos facturas. Una foto
 * no lo es —es una hoja—, así que las fotos se agrupan como hasta ahora.
 *
 * Vive aparte para poder probarse sin levantar la ruta entera, y porque el
 * FRONTEND aplica el mismo criterio (`agruparDocumentos` en DocumentacionModule)
 * para mandar una factura por petición: leer cinco en una sola son ~55 s y nginx
 * corta `/api/` a los 120.
 */
const esPdf = (f) =>
    (f?.mimetype === 'application/pdf') || /\.pdf$/i.test(f?.originalname || '');

/**
 * @param {Array<{mimetype?:string, originalname?:string}>} files
 * @returns {Array<Array>} un grupo por factura
 */
function agruparDocumentosFactura(files) {
    const lista = Array.isArray(files) ? files.filter(Boolean) : [];
    const grupos = lista.filter(esPdf).map(f => [f]);
    const imagenes = lista.filter(f => !esPdf(f));
    if (imagenes.length) grupos.push(imagenes);
    return grupos;
}

module.exports = { agruparDocumentosFactura, esPdf };
