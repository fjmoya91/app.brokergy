// ─── Sincronizador de carpetas de Drive por estado ────────────────────────────
//
// Mueve la carpeta de Drive de un expediente (o de un lote entero) a la carpeta
// de estado que le toca según driveFolders.js. Se llama desde TODOS los sitios
// que cambian el estado de un expediente o le asignan certificador.
//
// Tres reglas que no hay que romper:
//   1. NUNCA bloquea la respuesta HTTP: quien llame lo hace en setImmediate y
//      esta función no lanza jamás (Drive puede fallar; la app no se entera).
//   2. Es IDEMPOTENTE: driveService.moveFolder no escribe si la carpeta ya está
//      en el destino, así que llamar de más solo cuesta un GET.
//   3. Un expediente LOTEADO no se mueve por su cuenta: su carpeta vive dentro de
//      la del lote y es el estado del LOTE el que arrastra al grupo.

const supabase = require('./supabaseClient');
const driveService = require('./driveService');
const {
    carpetaObjetivoExpediente,
    carpetaObjetivoLote,
    carpetaObjetivoOportunidad,
    nombreCarpeta,
} = require('./driveFolders');

// Campos mínimos para decidir el destino (nada de JSONB pesados: `cee` se pide
// entero porque de él sale `certificador_id`, pero nunca `documentacion`).
// `cliente_id` se añade para poder enderezar el NOMBRE de la carpeta (ver abajo).
const CAMPOS_DECISION = 'id, numero_expediente, estado, lote_id, oportunidad_id, cee, cliente_id';

/**
 * Nombre de cliente para la carpeta del expediente: el mismo `{nombre} {apellidos}`
 * en MAYÚSCULAS que usan createExpediente y migrateExpedienteProgram. Null si no
 * hay cliente vinculado o no se encuentra — nunca se inventa un nombre.
 */
async function nombreClienteParaCarpeta(clienteId) {
    if (!clienteId) return null;
    const { data: cliente } = await supabase
        .from('clientes').select('nombre_razon_social, apellidos').eq('id_cliente', clienteId).maybeSingle();
    if (!cliente) return null;
    const full = `${cliente.nombre_razon_social || ''} ${cliente.apellidos || ''}`.trim().toUpperCase().replace(/\s+/g, ' ');
    return full || null;
}

/**
 * Endereza el NOMBRE de la carpeta del expediente al patrón `{nº} - {CLIENTE}`.
 * Va junto al movimiento porque es el mismo chokepoint: un expediente migrado (o
 * uno al que se le cambió el cliente después) arrastra un nombre que no dice de
 * quién es la carpeta — medido en 25RES060_79, cuya carpeta seguía llamándose
 * "... C. CHILE N. 1 (DIMAS) PEDRO MUÑOZ" en vez de su cliente real. Solo escribe
 * si el nombre difiere, mismo criterio idempotente que `moveFolder`.
 */
async function asegurarNombreCarpeta(folderId, exp) {
    if (!folderId || !exp?.numero_expediente) return false;
    const nombreCliente = await nombreClienteParaCarpeta(exp.cliente_id);
    if (!nombreCliente) return false; // sin cliente vinculado: no se inventa el nombre
    const esperado = driveService.sanitizeWindowsSegment(`${exp.numero_expediente} - ${nombreCliente}`);
    const meta = await driveService.getFileMetadata(folderId, 'name');
    if (!meta || meta.name === esperado) return false;
    return driveService.renameFolder(folderId, esperado);
}

/**
 * Resuelve el expediente (por UUID o nº) + el id/enlace de su carpeta raíz de Drive.
 * La carpeta vive SIEMPRE dentro de datos_calculo de la oportunidad (JSONB).
 */
async function resolveExpedienteDriveFolder(idParam) {
    let { data: exp } = await supabase
        .from('expedientes').select('*').eq('id', idParam).maybeSingle();
    if (!exp) {
        const { data: expSeq } = await supabase
            .from('expedientes').select('*').eq('numero_expediente', idParam).maybeSingle();
        exp = expSeq;
    }
    if (!exp) return { exp: null, driveFolderId: null, driveLink: null };

    const { data: op } = await supabase
        .from('oportunidades').select('id, datos_calculo').eq('id', exp.oportunidad_id).maybeSingle();
    let datos = op?.datos_calculo || {};
    if (typeof datos === 'string') { try { datos = JSON.parse(datos); } catch (e) { datos = {}; } }

    let driveFolderId = datos?.drive_folder_id || datos?.inputs?.drive_folder_id || exp.drive_folder_id || null;
    let driveLink = datos?.drive_folder_link || null;
    if (!driveFolderId && driveLink) {
        const m = String(driveLink).match(/folders\/([A-Za-z0-9_-]+)/);
        if (m) driveFolderId = m[1];
    }
    if (driveFolderId && !driveLink) driveLink = `https://drive.google.com/drive/folders/${driveFolderId}`;
    return { exp, driveFolderId, driveLink };
}

// Versión ligera: solo el id de la carpeta. Proyecta los subcampos del JSONB en vez
// de traerse `datos_calculo` entero (regla 22 de CLAUDE.md) y admite un expediente
// parcial: si le falta `oportunidad_id` lo resuelve por su id.
async function carpetaDeExpediente(exp) {
    let opId = exp?.oportunidad_id;
    if (!opId && exp?.id) {
        const { data } = await supabase
            .from('expedientes').select('oportunidad_id').eq('id', exp.id).maybeSingle();
        opId = data?.oportunidad_id;
    }
    if (!opId) return exp?.drive_folder_id || null;

    const { data: op } = await supabase
        .from('oportunidades')
        .select('folder:datos_calculo->>drive_folder_id, folder_inputs:datos_calculo->inputs->>drive_folder_id, link:datos_calculo->>drive_folder_link')
        .eq('id', opId).maybeSingle();

    let folderId = op?.folder || op?.folder_inputs || exp?.drive_folder_id || null;
    // Hay oportunidades antiguas que solo guardaron el ENLACE de la carpeta.
    if (!folderId && op?.link) {
        const m = String(op.link).match(/folders\/([A-Za-z0-9_-]+)/);
        if (m) folderId = m[1];
    }
    return folderId;
}

/**
 * Recoloca la carpeta de un expediente según su estado.
 * @param {string|object} expOrId - UUID del expediente o la fila ya cargada.
 * @param {{ motivo?: string, destino?: string, ignorarLote?: boolean }} [opts]
 *        destino: fuerza una carpeta concreta (lo usa el alta en lote).
 * @returns {Promise<{ moved: boolean, motivo?: string, destino?: string }>}
 */
async function syncExpedienteFolder(expOrId, opts = {}) {
    try {
        let exp = typeof expOrId === 'string' ? null : expOrId;
        if (!exp || exp.estado === undefined || exp.lote_id === undefined
            || exp.cee === undefined || exp.oportunidad_id === undefined) {
            const id = typeof expOrId === 'string' ? expOrId : expOrId?.id;
            if (!id) return { moved: false, motivo: 'sin expediente' };
            const { data } = await supabase
                .from('expedientes').select(CAMPOS_DECISION).eq('id', id).maybeSingle();
            if (!data) return { moved: false, motivo: 'expediente no encontrado' };
            exp = data;
        }

        const destino = opts.destino || carpetaObjetivoExpediente(exp, { ignorarLote: opts.ignorarLote });
        if (!destino) {
            return { moved: false, motivo: exp.lote_id ? 'en lote (manda el lote)' : 'sin destino para el estado' };
        }

        const folderId = await carpetaDeExpediente(exp);
        if (!folderId) return { moved: false, motivo: 'sin carpeta en Drive' };

        const renamed = await asegurarNombreCarpeta(folderId, exp).catch(() => false);
        const ok = await driveService.moveFolder(folderId, destino);
        const ref = exp.numero_expediente || exp.id;
        console.log(`[FolderSync] ${ref} (${exp.estado}) → ${nombreCarpeta(destino)}${opts.motivo ? ` · ${opts.motivo}` : ''} · ${ok ? 'OK' : 'FALLO'}${renamed ? ' · renombrada' : ''}`);
        return { moved: !!ok, destino, renamed };
    } catch (err) {
        console.error('[FolderSync] Error moviendo carpeta de expediente:', err.message);
        return { moved: false, motivo: err.message };
    }
}

/**
 * Recoloca la carpeta de un LOTE según su estado. Los expedientes del lote van
 * dentro, así que este único movimiento los arrastra a todos.
 */
async function syncLoteFolder(lote, opts = {}) {
    try {
        if (!lote?.drive_folder_id) return { moved: false, motivo: 'lote sin carpeta en Drive' };
        const destino = carpetaObjetivoLote(lote.estado);
        const ok = await driveService.moveFolder(lote.drive_folder_id, destino);
        console.log(`[FolderSync] Lote ${lote.codigo || lote.id} (${lote.estado}) → ${nombreCarpeta(destino)}${opts.motivo ? ` · ${opts.motivo}` : ''} · ${ok ? 'OK' : 'FALLO'}`);
        return { moved: !!ok, destino };
    } catch (err) {
        console.error('[FolderSync] Error moviendo carpeta de lote:', err.message);
        return { moved: false, motivo: err.message };
    }
}

/**
 * Mete las carpetas de unos expedientes DENTRO de la carpeta del lote.
 * A partir de aquí ya no se mueven solos.
 */
async function absorberExpedientesEnLote(loteFolderId, exps) {
    const res = [];
    for (const e of (exps || [])) {
        const r = await syncExpedienteFolder(e, { destino: loteFolderId, motivo: 'entra en lote' });
        res.push({ exp: e.numero_expediente || e.id, ...r });
    }
    return res;
}

/**
 * Saca la carpeta de un expediente de la del lote y la devuelve a la carpeta que
 * le toque por su estado (normalmente "05. DOC. COMPLETA").
 */
async function devolverExpedienteDeLote(expOrId, opts = {}) {
    return syncExpedienteFolder(expOrId, { ...opts, ignorarLote: true, motivo: opts.motivo || 'sale del lote' });
}

/** Recoloca la carpeta de una OPORTUNIDAD (aún sin expediente) por su estado. */
async function syncOportunidadFolder(folderId, estado, opts = {}) {
    try {
        if (!folderId) return { moved: false, motivo: 'sin carpeta en Drive' };
        const destino = carpetaObjetivoOportunidad(estado);
        if (!destino) return { moved: false, motivo: `estado de oportunidad sin carpeta: ${estado}` };
        const ok = await driveService.moveFolder(folderId, destino);
        console.log(`[FolderSync] Oportunidad ${opts.ref || folderId} (${estado}) → ${nombreCarpeta(destino)} · ${ok ? 'OK' : 'FALLO'}`);
        return { moved: !!ok, destino };
    } catch (err) {
        console.error('[FolderSync] Error moviendo carpeta de oportunidad:', err.message);
        return { moved: false, motivo: err.message };
    }
}

// Azúcar para los call-sites: dispara la sincronización sin esperar y sin que un
// fallo de Drive pueda tumbar la petición en curso.
function syncExpedienteFolderAsync(expOrId, opts = {}) {
    setImmediate(() => { syncExpedienteFolder(expOrId, opts).catch(() => {}); });
}

module.exports = {
    resolveExpedienteDriveFolder,
    carpetaDeExpediente,
    syncExpedienteFolder,
    syncExpedienteFolderAsync,
    syncLoteFolder,
    absorberExpedientesEnLote,
    devolverExpedienteDeLote,
    syncOportunidadFolder,
};
