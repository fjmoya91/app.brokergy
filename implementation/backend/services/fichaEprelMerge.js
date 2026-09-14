// ============================================================================
// fichaEprelMerge.js — la ficha del catálogo lleva TAMBIÉN los papeles del EPREL
// ----------------------------------------------------------------------------
// `aerotermia.ficha_tecnica` es de donde sale el anexo del CIFO: la ruta
// /fichas-tecnicas/auto-copy copia ESE fichero a la carpeta del expediente. Si
// ahí solo está la ficha comercial del fabricante, el verificador se queda sin
// lo que ACREDITA el SCOP declarado cuando éste se calcula por el Anexo IV —la
// ficha del producto del Rgto. (UE) 811/2013 y la etiqueta energética, que son
// los documentos oficiales del registro EPREL.
//
// Esto existía ya como script de consola (`scripts/combinar_ficha_eprel.js`),
// que buscaba los dos PDF entre los hermanos de Drive de la ficha. Aquí vive el
// NÚCLEO para que lo comparta el popup que salta en el expediente cuando el
// catálogo no puede justificar el SCOP_dhw de un conjunto: quien no tiene acceso
// a la consola necesitaba a otra persona para arreglar un dato que tiene delante.
//
// REGLA — el orden NO es arbitrario: ficha del fabricante → ficha del producto
// EPREL → etiqueta. Es el mismo con el que se venían anexando a mano al CIFO, y
// es el que espera quien lo revisa.
//
// REGLA — la ficha anterior NO se borra ni se reemplaza en Drive. El combinado
// se sube como fichero nuevo en la misma carpeta y `ficha_tecnica` pasa a
// apuntarlo. Una ficha técnica es la prueba de un dato que puede estar ya
// impreso en un certificado firmado.
//
// REGLA — si una pieza no se puede leer, ABORTA. Subir al catálogo una ficha a
// la que le falta el papel que justifica el SCOP no se queda en un expediente:
// baja a todos los que lleven ese modelo, y nadie se entera hasta el
// requerimiento. Mismo criterio que fichaConsolidada.js.
// ============================================================================

const { PDFDocument } = require('pdf-lib');
const supabase = require('./supabaseClient');
const { getFileContent, getFileMetadata, saveFileToFolder } = require('./driveService');
const { CARPETAS } = require('./catalogoFichas');

/** El fileId de Drive dentro de cualquiera de las formas de URL que guarda el catálogo. */
function driveIdFrom(url) {
    const s = String(url || '');
    const m = s.match(/\/d\/([a-zA-Z0-9_-]+)/) || s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    return m && m[1] ? m[1] : null;
}

/** Windows y Drive no se llevan bien con estos caracteres en un nombre de fichero. */
const limpiarNombre = (s) => String(s || 'FICHA')
    .replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120);

/**
 * Añade a la ficha técnica del modelo los PDF del EPREL que se acaban de aportar.
 *
 * @param {string|number} modelId  fila de `aerotermia`
 * @param {Array<{nombre:string, buffer:Buffer}>} piezas  los PDF del EPREL, en orden
 * @returns {Promise<{ok:boolean, motivo?:string, link?:string, paginas?:number, partes?:Array}>}
 */
async function anexarEprelAFicha(modelId, piezas) {
    const lista = (piezas || []).filter(p => p && p.buffer && p.buffer.length);
    if (!modelId) return { ok: false, motivo: 'sin_modelo' };
    if (!lista.length) return { ok: false, motivo: 'sin_piezas' };

    const { data: eq, error } = await supabase
        .from('aerotermia')
        .select('id, marca, modelo_comercial, modelo_conjunto, ficha_tecnica')
        .eq('id', modelId)
        .single();
    if (error || !eq) return { ok: false, motivo: 'modelo_no_encontrado' };

    const modelo = eq.modelo_comercial || eq.modelo_conjunto || `id=${eq.id}`;

    // La ficha actual encabeza el combinado. Puede no existir todavía: entonces el
    // EPREL ES la ficha del modelo, que es mejor que dejar el hueco vacío.
    const partes = [];
    const ftId = driveIdFrom(eq.ficha_tecnica);
    let carpetaId = null;
    if (ftId) {
        try {
            const meta = await getFileMetadata(ftId, 'id, name, parents');
            carpetaId = meta && meta.parents && meta.parents[0];
            const buf = await getFileContent(ftId);
            if (!buf || !buf.length) return { ok: false, motivo: 'ficha_ilegible' };
            partes.push({ rotulo: 'Ficha técnica del fabricante', buffer: buf });
        } catch (e) {
            // Un enlace que apunta a un fichero borrado no es "no tiene ficha": es
            // una referencia rota, y unir sobre ella perdería el documento que el
            // catálogo dice tener. Se dice, no se sustituye en silencio.
            return { ok: false, motivo: 'ficha_no_accesible', detalle: e.message };
        }
    }
    lista.forEach(p => partes.push({ rotulo: p.nombre || 'EPREL', buffer: p.buffer }));

    // Sin carpeta resuelta (modelo sin ficha previa) va a la del catálogo, que es
    // donde viven todas: nunca dentro de la carpeta de un expediente.
    if (!carpetaId) carpetaId = CARPETAS.aerotermia.id;

    const merged = await PDFDocument.create();
    const detalle = [];
    for (const p of partes) {
        let doc;
        try {
            doc = await PDFDocument.load(p.buffer, { ignoreEncryption: true });
        } catch (e) {
            return { ok: false, motivo: 'pdf_ilegible', pieza: p.rotulo, detalle: e.message };
        }
        const pages = await merged.copyPages(doc, doc.getPageIndices());
        pages.forEach(pg => merged.addPage(pg));
        detalle.push({ nombre: p.rotulo, paginas: doc.getPageCount() });
    }

    const out = Buffer.from(await merged.save());
    const fileName = `${limpiarNombre(`${eq.marca || ''} ${modelo}`)} - FT + EPREL.pdf`;
    const subido = await saveFileToFolder(carpetaId, fileName, 'application/pdf', out);
    if (!subido) return { ok: false, motivo: 'drive_error' };

    const { error: upErr } = await supabase
        .from('aerotermia')
        // `ficha_tecnica_partes` dice QUÉ trae dentro el PDF. Se escribe siempre que
        // se toca la ficha: una nota de "conjunto" que sobrevive a la ficha que
        // describe miente con toda la autoridad de un registro (ver fichaConsolidada).
        .update({
            ficha_tecnica: subido.link,
            ficha_tecnica_partes: { unido_at: new Date().toISOString(), partes: detalle },
        })
        .eq('id', eq.id);
    if (upErr) return { ok: false, motivo: 'db_error', detalle: upErr.message };

    console.log(`[fichaEprelMerge] ${eq.marca} ${modelo} ← ${fileName} (${merged.getPageCount()} pág.)`);
    return { ok: true, link: subido.link, driveId: subido.id, paginas: merged.getPageCount(), partes: detalle };
}

module.exports = { anexarEprelAFicha, driveIdFrom };
