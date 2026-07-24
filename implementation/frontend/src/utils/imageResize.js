/**
 * Reducción de fotos EN EL NAVEGADOR antes de subirlas.
 *
 * Por qué: una foto de móvil ronda los 5-12 MB. En localhost la subida es
 * instantánea (no viaja por red), pero por una línea doméstica cada foto puede
 * tardar minutos, y el instalador o el cliente lo viven como "se ha colgado".
 * Reducirla a 2560 px de lado mayor deja ~600 KB-1 MB sin pérdida visible en un
 * documento A4, y multiplica por diez la velocidad de subida.
 *
 * Qué NO toca (devuelve el fichero ORIGINAL tal cual):
 *   · Slots de PLACA de características (`fullRes`): de ahí se lee el nº de serie.
 *   · Lo que no sea una imagen: PDF, vídeo, .cex/.xml…
 *   · Imágenes ya pequeñas (por debajo del umbral).
 *   · HEIC/HEIF y cualquier formato que el navegador no sepa decodificar.
 *   · Cualquier error inesperado — ante la duda, se sube el original.
 *
 * Nunca lanza: en el peor caso devuelve el fichero que le pasaron.
 */

// Lado mayor tras reducir. 2560 px es más que suficiente para imprimir una foto
// en A4 (a 300 ppp, 2560 px son ~21 cm) y para leer texto grande en la imagen.
const MAX_LADO = 2560;
// Solo se reduce a partir de este tamaño: por debajo no compensa reprocesar.
const UMBRAL_BYTES = 1.5 * 1024 * 1024; // 1,5 MB
const CALIDAD_JPEG = 0.85;

/** ¿El navegador sabe decodificar este fichero como imagen? */
function esImagenProcesable(file) {
    const tipo = (file?.type || '').toLowerCase();
    if (!tipo.startsWith('image/')) return false;
    // HEIC/HEIF: es lo que dispara el iPhone por defecto y la mayoría de
    // navegadores NO lo decodifican. Se sube tal cual (el backend lo acepta).
    if (tipo.includes('heic') || tipo.includes('heif')) return false;
    // Un SVG no es una foto: reescalarlo a mapa de bits sería destructivo.
    if (tipo.includes('svg')) return false;
    return true;
}

/**
 * Devuelve el fichero listo para subir: reducido si procede, o el original.
 *
 * @param {File} file
 * @param {{ fullRes?: boolean }} opts  fullRes → no tocar (fotos de placa)
 * @returns {Promise<File>}
 */
export async function prepararImagenParaSubir(file, opts = {}) {
    try {
        if (!file || opts.fullRes) return file;
        if (file.size <= UMBRAL_BYTES) return file;
        if (!esImagenProcesable(file)) return file;

        // `imageOrientation: 'from-image'` aplica la orientación EXIF al decodificar.
        // Sin esto, las fotos hechas en vertical con el móvil se suben giradas.
        const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
        const { width, height } = bitmap;
        const lado = Math.max(width, height);
        if (lado <= MAX_LADO) { bitmap.close?.(); return file; }

        const escala = MAX_LADO / lado;
        const w = Math.round(width * escala);
        const h = Math.round(height * escala);

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { bitmap.close?.(); return file; }
        ctx.drawImage(bitmap, 0, 0, w, h);
        bitmap.close?.();

        const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', CALIDAD_JPEG));
        // Si el reescalado no ahorra nada (imagen ya optimizada), no compensa
        // sustituirla: se sube la original y se conserva su formato.
        if (!blob || blob.size >= file.size) return file;

        // El NOMBRE se conserva íntegro (incluida la extensión). El backend nombra
        // el fichero en Drive por su slot y solo toma de aquí la extensión; cambiarla
        // no aportaría nada y rompería la correspondencia con lo que ve el usuario.
        return new File([blob], file.name, { type: 'image/jpeg', lastModified: file.lastModified });
    } catch (e) {
        console.warn('[imageResize] No se pudo reducir, se sube el original:', e?.message);
        return file;
    }
}

/** Igual que la anterior pero para una lista. Mantiene el orden. */
export async function prepararImagenesParaSubir(files, opts = {}) {
    const out = [];
    for (const f of files) out.push(await prepararImagenParaSubir(f, opts));
    return out;
}

export const __test__ = { MAX_LADO, UMBRAL_BYTES, CALIDAD_JPEG, esImagenProcesable };
