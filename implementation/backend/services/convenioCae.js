// ─────────────────────────────────────────────────────────────────────────────
// EL CONVENIO CAE de un Sujeto Obligado — dónde vive y cómo se registra.
//
// Es la primera pieza del paquete de cada actuación ("E{n}-1"): el MISMO
// documento en las cinco actuaciones de un lote y en todos los lotes de ese S.O.
// Se firma una vez y se cita siempre, así que vive en SU FICHA
// (`prescriptores.convenio_cae_link`) y no en cada lote.
//
// REGLA — el fichero NO puede vivir dentro de la carpeta de un lote ni de un
// expediente. Ahí lo puede mover o borrar cualquiera que ordene esa carpeta, y la
// pieza E{n}-1 dejaría de resolverse para TODOS los demás paquetes sin que nadie
// se entere. Va a una carpeta propia, hermana de las de estado. Mismo criterio
// que el catálogo de fichas técnicas (`catalogoFichas`).
//
// Tres formas de registrarlo, porque el convenio aparece de tres maneras:
//   · `buffer`  — se sube el PDF (lo que hace la ficha del S.O.);
//   · `fileId`  — ya está en Drive y se COPIA a la carpeta del convenio (el caso
//     de los convenios viejos, que solo existen dentro de las carpetas E{n});
//   · `link`    — ya está donde debe estar y solo se apunta.
// ─────────────────────────────────────────────────────────────────────────────
const supabase = require('./supabaseClient');
const driveService = require('./driveService');

const CARPETA = '00. CONVENIOS CAE';

const limpio = (s) => String(s || '').replace(/[\\/<>:"|?*]/g, '_').trim();

/**
 * Carpeta donde viven los convenios. Con `DRIVE_CONVENIOS_CAE_ID` puesta, esa; si
 * no, se crea al lado de las carpetas de estado (hermana de "01. OPORTUNIDADES"),
 * que es donde se busca a mano. El "00." la deja primera en la lista.
 */
async function carpetaConvenios() {
    if (process.env.DRIVE_CONVENIOS_CAE_ID) return process.env.DRIVE_CONVENIOS_CAE_ID;
    const { FOLDERS } = require('./driveFolders');
    const meta = await driveService.getFileMetadata(FOLDERS.OPORTUNIDADES, 'id, parents');
    const padre = meta?.parents?.[0];
    if (!padre) throw new Error('No se pudo resolver la carpeta raíz de Drive para guardar el convenio');
    const id = await driveService.getOrCreateSubfolder(padre, CARPETA);
    if (!id) throw new Error(`No se pudo crear la carpeta "${CARPETA}"`);
    return id;
}

// Nombre canónico: el convenio de cada S.O. se reconoce por su marca.
function nombreConvenio(so) {
    const marca = limpio(so?.acronimo || so?.razon_social || 'SO').toUpperCase();
    return `CONVENIO CAE BROKERGY-${marca}.pdf`;
}

/**
 * Registra el convenio vigente de un Sujeto Obligado.
 *
 * @param {string} soId  `prescriptores.id_empresa`
 * @param {{ buffer?: Buffer, fileId?: string, link?: string|null, fileName?: string }} origen
 * @returns {Promise<{ convenio_cae_link, convenio_cae_nombre, convenio_cae_at, nombre_en_drive }>}
 */
async function registrarConvenio(soId, origen = {}) {
    const { buffer = null, fileId = null, link = undefined, fileName = null } = origen;

    const { data: so } = await supabase.from('prescriptores')
        .select('razon_social, acronimo, tipo_empresa').eq('id_empresa', soId).maybeSingle();
    if (!so) throw new Error('No se encontró el Sujeto Obligado');

    let convenio_cae_link = null;
    let convenio_cae_nombre = null;
    let nombreEnDrive = null;

    if (buffer || fileId) {
        if (buffer && (buffer.length < 5 || buffer[0] !== 0x25 || buffer[1] !== 0x50)) {
            throw new Error('El convenio debe ser un PDF');
        }
        const carpeta = await carpetaConvenios();
        nombreEnDrive = nombreConvenio(so);
        // El convenio nuevo REEMPLAZA al anterior: el vigente es uno solo, y dos
        // ficheros con el mismo nombre en Drive no dicen cuál se está citando. Se
        // ARCHIVA en OLD, nunca se borra — es la prueba de un dato que puede estar
        // ya impreso en paquetes presentados.
        try {
            const previos = await driveService.findFilesByName(carpeta, nombreEnDrive);
            for (const p of (previos || [])) await driveService.archiveExistingToOld(carpeta, p, nombreEnDrive);
        } catch (_) { /* no bloqueante */ }

        const saved = buffer
            ? await driveService.saveFileToFolder(carpeta, nombreEnDrive, 'application/pdf', buffer)
            : await driveService.copyFile(fileId, carpeta, nombreEnDrive);
        if (!saved) throw new Error('No se pudo guardar el convenio en Drive');
        convenio_cae_link = saved.link || (saved.id ? `https://drive.google.com/file/d/${saved.id}/view` : null);
        convenio_cae_nombre = fileName || nombreEnDrive;
    } else if (typeof link === 'string') {
        const l = link.trim();
        if (l && !/drive\.google\.com|docs\.google\.com/.test(l)) {
            throw new Error('El enlace debe ser de Google Drive');
        }
        convenio_cae_link = l || null;
        convenio_cae_nombre = l ? (fileName || 'Convenio CAE') : null;
    } else {
        throw new Error('Falta el PDF del convenio, su id de Drive o su enlace');
    }

    const { data, error } = await supabase.from('prescriptores')
        .update({
            convenio_cae_link, convenio_cae_nombre,
            convenio_cae_at: convenio_cae_link ? new Date().toISOString() : null,
        })
        .eq('id_empresa', soId)
        .select('id_empresa, razon_social, convenio_cae_link, convenio_cae_nombre, convenio_cae_at')
        .single();
    if (error) throw error;
    return { ...data, nombre_en_drive: nombreEnDrive };
}

module.exports = { CARPETA, carpetaConvenios, nombreConvenio, registrarConvenio };
