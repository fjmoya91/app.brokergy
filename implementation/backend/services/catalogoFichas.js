// ============================================================================
// catalogoFichas.js — la ficha técnica que se sube a un expediente VUELVE al
// catálogo del modelo.
// ----------------------------------------------------------------------------
// El catálogo (`aerotermia`, `ventanas_marcos`, `ventanas_cristales`) guarda la
// ficha de cada modelo para que el CIFO y el certificado RES080 la adjunten
// solos. Pero la ficha aparece casi siempre por el otro lado: alguien la busca
// para UN expediente concreto y la sube ahí. Sin este camino de vuelta, el
// siguiente expediente con el mismo equipo la vuelve a buscar desde cero — y el
// hueco del catálogo se queda vacío para siempre.
//
// REGLA — el fichero del catálogo NO puede vivir dentro de la carpeta de un
// expediente. Ahí lo puede mover, renombrar o borrar cualquiera que ordene ese
// expediente, y el día que pase, la auto-copia deja de funcionar para todos los
// demás sin que nadie se entere. Se copia a la carpeta del catálogo:
//
//   · aerotermia  → 06. CALIDAD / 01. FICHAS TECNICAS AEROTERMIA
//   · marco       → 06. CALIDAD / 06. VENTANAS / 01. MARCOS
//   · cristal     → 06. CALIDAD / 06. VENTANAS / 02. CRISTALES
//
// Los ids van por variable de entorno con el valor real de respaldo (mismo
// criterio que la carpeta de producción de los CEE directos): son carpetas
// estables que no se mueven, y resolverlas por nombre en cada llamada serían dos
// consultas más a Drive por subida.
//
// REGLA — nunca se pisa una ficha en silencio. `guardarFichaEnCatalogo` solo
// escribe si el modelo NO tiene ficha, salvo que quien llama pase
// `sustituir: true` — que es lo que hace la casilla del popup, con el aviso
// delante. Un PDF equivocado en el catálogo se propaga a todos los expedientes
// que vengan detrás.
// ============================================================================

const supabase = require('./supabaseClient');
const {
    getFileContent, saveFileToFolder, archiveExistingToOld, findFileByName,
} = require('./driveService');

const CARPETAS = {
    aerotermia: {
        id: process.env.DRIVE_CATALOGO_AEROTERMIA_ID || '1baFvuN4Gd-xGGHyeol6PYuFx6g9qO8Gv',
        nombre: '01. FICHAS TECNICAS AEROTERMIA',
    },
    marco: {
        id: process.env.DRIVE_CATALOGO_MARCOS_ID || '1GZbBTHajZ78X7RcVIu-YWNYEn85mIvUv',
        nombre: '01. MARCOS',
    },
    cristal: {
        id: process.env.DRIVE_CATALOGO_CRISTALES_ID || '15Sd1FytSI5A-dw-51UMf5tsLNVSKEN6R',
        nombre: '02. CRISTALES',
    },
};

/** Tabla y columnas de cada catálogo. `campos` son los que hacen falta para el nombre. */
const TABLAS = {
    aerotermia: {
        tabla: 'aerotermia',
        select: 'id, marca, modelo_comercial, modelo_conjunto, ficha_tecnica, eprel',
        nombre: (r) => [r.marca, r.modelo_comercial || r.modelo_conjunto].filter(Boolean).join(' '),
    },
    marco: {
        tabla: 'ventanas_marcos',
        select: 'id, marca, serie, apertura, ficha_tecnica',
        nombre: (r) => [r.marca, r.serie, r.apertura].filter(Boolean).join(' '),
    },
    cristal: {
        tabla: 'ventanas_cristales',
        select: 'id, fabricante, gama, composicion, ficha_tecnica',
        nombre: (r) => [r.fabricante, r.gama, r.composicion].filter(Boolean).join(' '),
    },
};

/** Windows y Drive no se llevan bien con estos caracteres en un nombre de fichero. */
function limpiarNombre(s) {
    return String(s || 'FICHA').replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120);
}

/**
 * Copia a la carpeta del catálogo el fichero que acaba de subirse al expediente
 * y lo enlaza en el modelo.
 *
 * @param {'aerotermia'|'marco'|'cristal'} kind
 * @param {string} modelId       fila del catálogo
 * @param {object} opts
 * @param {Buffer} [opts.buffer]  contenido; si no viene se baja de `driveId`
 * @param {string} [opts.driveId] fichero ya en Drive del que copiar el contenido
 * @param {boolean} [opts.sustituir] permite pisar una ficha que ya exista
 * @param {string} [opts.campo]   'ficha_tecnica' (por defecto) o 'eprel' en aerotermia
 * @returns {{ ok:boolean, motivo?:string, modelo?:string, link?:string, driveId?:string }}
 */
async function guardarFichaEnCatalogo(kind, modelId, opts = {}) {
    const cfg = TABLAS[kind];
    const carpeta = CARPETAS[kind];
    if (!cfg || !carpeta) return { ok: false, motivo: 'kind_no_valido' };
    if (!modelId) return { ok: false, motivo: 'sin_modelo' };

    const campo = opts.campo === 'eprel' && kind === 'aerotermia' ? 'eprel' : 'ficha_tecnica';

    const { data: fila, error } = await supabase.from(cfg.tabla).select(cfg.select).eq('id', modelId).single();
    if (error || !fila) return { ok: false, motivo: 'modelo_no_encontrado' };

    const modelo = cfg.nombre(fila);
    if (String(fila[campo] || '').trim() && !opts.sustituir) {
        // No es un error: es el caso normal de "ya la tenía". Quien llama lo
        // cuenta como "no hacía falta", no como fallo.
        return { ok: false, motivo: 'ya_tiene_ficha', modelo };
    }

    let buffer = opts.buffer;
    if (!buffer && opts.driveId) buffer = await getFileContent(opts.driveId);
    if (!buffer || !buffer.length) return { ok: false, motivo: 'sin_contenido', modelo };

    const fileName = `${limpiarNombre(modelo)} - FT.pdf`;

    // Si ya hubiera un fichero con ese nombre (una ficha anterior del mismo
    // modelo), se ARCHIVA en OLD en vez de borrarse: una ficha técnica es la
    // prueba de un dato que puede estar ya impreso en un certificado.
    try {
        const previo = await findFileByName(carpeta.id, fileName);
        if (previo) await archiveExistingToOld(carpeta.id, previo, fileName);
    } catch (e) {
        console.warn(`[catalogoFichas] no se pudo archivar la ficha previa de "${modelo}": ${e.message}`);
    }

    const subido = await saveFileToFolder(carpeta.id, fileName, 'application/pdf', buffer);
    if (!subido) return { ok: false, motivo: 'drive_error', modelo };

    const { error: upErr } = await supabase
        .from(cfg.tabla)
        .update({ [campo]: subido.link })
        .eq('id', modelId);
    if (upErr) return { ok: false, motivo: 'db_error', modelo };

    console.log(`[catalogoFichas] ${kind} "${modelo}" ← ${fileName} (${subido.id})`);
    return { ok: true, modelo, link: subido.link, driveId: subido.id, campo };
}

module.exports = { guardarFichaEnCatalogo, CARPETAS, TABLAS };
