/**
 * justificanteCliente — el justificante de titularidad bancaria visto desde el CLIENTE.
 *
 * El fichero vive donde siempre: la carpeta raíz de Drive del expediente
 * («justificante de titularidad bancaria.pdf») y su enlace en
 * `expedientes.documentacion.justificante_titularidad_link`. Lo que faltaba es poder
 * subirlo y ver si está desde la ficha del cliente abierta FUERA de un expediente
 * (desde Clientes): ahí no había ni la zona de subida ni un «lo tenemos / no lo
 * tenemos».
 *
 * REGLA — una sola forma de guardarlo y leerlo: `subirJustificante` la usan esta
 * ficha y `POST /api/expedientes/:id/justificante` (barrido y ficha dentro del
 * expediente). Guarda en Drive, lo LEE (justificanteOcrService) y lo juzga
 * (utils/justificanteBancario): rellena el IBAN si la ficha no lo tiene y, si lo
 * tiene, comprueba número y titular. AVISA, nunca bloquea.
 *
 * REGLA — el anterior se ARCHIVA en OLD, no se borra: el IBAN viejo puede estar
 * impreso en un Convenio ya firmado, y su justificante es lo que lo acredita.
 */
const supabase = require('./supabaseClient');

const NOMBRE = 'justificante de titularidad bancaria.pdf';
const CERRADOS = new Set(['FINALIZADO', 'RECHAZADO']);
const CAMPOS_CLIENTE = ['numero_cuenta', 'nombre_razon_social', 'apellidos', 'es_empresa', 'representante_nombre', 'representante_apellidos', 'copropietarios'];

const enlaceDrive = id => `https://drive.google.com/file/d/${id}/view`;

/** Carpeta raíz de Drive de una oportunidad (que es también la de su expediente). */
async function carpetaDeOportunidad(oportunidadId) {
    if (!oportunidadId) return null;
    const { data } = await supabase.from('oportunidades')
        .select('f:datos_calculo->>drive_folder_id, fi:datos_calculo->inputs->>drive_folder_id')
        .eq('id', oportunidadId).maybeSingle();
    return data?.f || data?.fi || null;
}

/**
 * Expedientes y oportunidades del cliente, ordenados por dónde se guardaría el
 * justificante: primero los expedientes ABIERTOS (el más reciente), luego los
 * cerrados, y si no tiene ninguno, la oportunidad más reciente con carpeta.
 * Solo escalares y dos claves de `documentacion` (regla 22).
 */
async function destinosDeCliente(clienteId) {
    const CAMPOS = 'id, numero_expediente, estado, created_at, oportunidad_id, link:documentacion->>justificante_titularidad_link, ocr:documentacion->justificante_ocr';
    // Por los DOS caminos, como la ficha (GET /api/clientes/:id): un migrado puede
    // tener el cliente en el expediente y otro en su oportunidad.
    const [porOp, porExp, ops] = await Promise.all([
        supabase.from('expedientes').select(`${CAMPOS}, oportunidades!inner (cliente_id)`).eq('oportunidades.cliente_id', clienteId),
        supabase.from('expedientes').select(CAMPOS).eq('cliente_id', clienteId),
        supabase.from('oportunidades').select('id, id_oportunidad, created_at, f:datos_calculo->>drive_folder_id, fi:datos_calculo->inputs->>drive_folder_id')
            .eq('cliente_id', clienteId).order('created_at', { ascending: false }),
    ]);
    const porId = new Map();
    for (const e of [...(porOp.data || []), ...(porExp.data || [])]) if (e?.id && !porId.has(e.id)) porId.set(e.id, e);
    const exps = [...porId.values()].sort((a, b) => {
        const ca = CERRADOS.has(a.estado) ? 1 : 0, cb = CERRADOS.has(b.estado) ? 1 : 0;
        if (ca !== cb) return ca - cb;
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });
    const conExp = new Set(exps.map(e => e.oportunidad_id));
    const opsSueltas = (ops.data || []).filter(o => !conExp.has(o.id) && (o.f || o.fi));
    return { exps, opsSueltas };
}

/** Dónde va (y de dónde se lee) el justificante. `expedienteId` lo fuerza si es del cliente. */
async function destinoPrincipal(clienteId, expedienteId = null) {
    const { exps, opsSueltas } = await destinosDeCliente(clienteId);
    let exp = expedienteId ? exps.find(e => e.id === expedienteId) : null;
    if (!exp) exp = exps[0] || null;
    if (exp) {
        return { exps, destino: { tipo: 'expediente', id: exp.id, numero: exp.numero_expediente, oportunidad_id: exp.oportunidad_id, exp } };
    }
    const op = opsSueltas[0];
    if (op) return { exps, destino: { tipo: 'oportunidad', id: op.id, numero: op.id_oportunidad, oportunidad_id: op.id, folder: op.f || op.fi } };
    return { exps, destino: null };
}

/**
 * ¿Lo tenemos? Primero el enlace guardado en el expediente de destino, después el
 * de cualquier otro expediente del cliente y, si ninguno lo tiene, la carpeta de
 * Drive (Drive es la fuente de verdad, regla 20: un fichero subido a mano cuenta).
 */
async function estadoJustificante(clienteId, { expedienteId = null } = {}) {
    const { exps, destino } = await destinoPrincipal(clienteId, expedienteId);
    const base = { destino: destino ? { tipo: destino.tipo, id: destino.id, numero: destino.numero } : null };
    const sinLink = exps.filter(e => !e.link && !CERRADOS.has(e.estado)).map(e => e.numero_expediente);

    const propio = destino?.tipo === 'expediente' && destino.exp.link ? destino.exp : null;
    const otro = propio || exps.find(e => e.link);
    if (otro) {
        return { ...base, link: otro.link, en: { tipo: 'expediente', numero: otro.numero_expediente }, ocr: otro.ocr || null, sin_justificante: sinLink.filter(n => n !== otro.numero_expediente) };
    }
    if (destino) {
        try {
            const driveService = require('./driveService');
            const folder = destino.folder || await carpetaDeOportunidad(destino.oportunidad_id);
            const fid = folder ? await driveService.findFileByName(folder, NOMBRE) : null;
            if (fid) {
                const link = enlaceDrive(fid);
                // Se deja escrito, como hace el barrido de "qué falta".
                if (destino.tipo === 'expediente') {
                    supabase.rpc('set_expediente_doc_field', { p_oportunidad_id: destino.oportunidad_id, p_field: 'justificante_titularidad_link', p_value: link })
                        .then(({ error }) => { if (error) console.warn('[justificanteCliente] backfill:', error.message); }, () => {});
                }
                return { ...base, link, en: { tipo: destino.tipo, numero: destino.numero, drive: true }, ocr: null, sin_justificante: [] };
            }
        } catch (e) { console.warn('[justificanteCliente] Drive:', e.message); }
    }
    return { ...base, link: null, en: null, ocr: null, sin_justificante: sinLink };
}

/**
 * Guarda el justificante, lo lee y lo compara con la ficha.
 * @param {object} p
 * @param {string} p.driveFolderId  carpeta raíz de Drive (expediente u oportunidad)
 * @param {Array<{id,oportunidad_id}>} p.expedientes  expedientes en los que se enlaza (el 1º lleva la huella)
 * @param {string|null} p.clienteId
 * @param {string} p.base64 · @param {string} p.mimeType
 * @param {object} [p.clienteForm]  lo que hay en el FORMULARIO abierto (manda sobre la BD)
 */
async function subirJustificante({ driveFolderId, expedientes = [], clienteId, base64, mimeType, clienteForm, usuario }) {
    const driveService = require('./driveService');
    const { leerJustificante, aPdf } = require('./justificanteOcrService');
    const original = Buffer.from(base64, 'base64');
    const mime = mimeType || 'application/pdf';
    const buf = mime.startsWith('image/') ? await aPdf(original, mime) : original;

    // La LECTURA va en paralelo con Drive y nunca tumba la subida.
    const lecturaP = leerJustificante(buf, 'application/pdf').catch(e => { console.warn('[justificante] lectura:', e.message); return null; });

    try {
        const existing = await driveService.findFileByName(driveFolderId, NOMBRE);
        if (existing) {
            const arch = await driveService.archiveExistingToOld(driveFolderId, existing, NOMBRE);
            if (!arch) await driveService.deleteFile(existing);
        }
    } catch (e) { /* un fallo al archivar no impide subir el nuevo */ }
    const r = await driveService.saveFileToFolder(driveFolderId, NOMBRE, 'application/pdf', buf);
    if (!r?.link) throw Object.assign(new Error('No se pudo guardar en Drive'), { status: 500 });
    try { if (r.id) await driveService.setFolderPublic(r.id, 'reader'); } catch (e) {}

    for (const e of expedientes) {
        await supabase.rpc('set_expediente_doc_field', { p_oportunidad_id: e.oportunidad_id, p_field: 'justificante_titularidad_link', p_value: r.link });
    }

    let comprobacion = null;
    const lectura = await lecturaP;
    if (lectura) {
        const { evaluarJustificante } = require('../utils/justificanteBancario');
        let clienteBd = null;
        if (clienteId) {
            const { data } = await supabase.from('clientes').select(CAMPOS_CLIENTE.join(', ')).eq('id_cliente', clienteId).maybeSingle();
            clienteBd = data || null;
        }
        const cliente = { ...(clienteBd || {}) };
        if (clienteForm && typeof clienteForm === 'object') for (const k of CAMPOS_CLIENTE) if (clienteForm[k] !== undefined) cliente[k] = clienteForm[k];
        comprobacion = evaluarJustificante(lectura, cliente);

        // Rellenar SOLO un hueco: ni la ficha guardada ni el formulario tienen IBAN.
        comprobacion.rellenado = false;
        if (comprobacion.rellenar && clienteId && !String(clienteBd?.numero_cuenta || '').trim()) {
            const { error: eUp } = await supabase.from('clientes').update({ numero_cuenta: comprobacion.rellenar }).eq('id_cliente', clienteId);
            if (!eUp) comprobacion.rellenado = true;
            else console.warn('[justificante] rellenar IBAN:', eUp.message);
        }

        // Huella (solo metadatos, regla 21) en cada expediente enlazado.
        const huella = {
            at: new Date().toISOString(),
            por: usuario || null,
            iban_leido: comprobacion.iban.leido || null,
            iban_valido: comprobacion.iban_valido,
            iban_estado: comprobacion.iban.estado,
            titulares: comprobacion.titular.leidos,
            titular_estado: comprobacion.titular.estado,
            ok: comprobacion.ok,
            avisos: comprobacion.avisos,
            rellenado: comprobacion.rellenado,
        };
        for (const e of expedientes) {
            supabase.rpc('merge_expediente_doc_json', { p_expediente_id: e.id, p_field: 'justificante_ocr', p_value: huella })
                .then(({ error }) => { if (error) console.warn('[justificante] huella:', error.message); }, () => {});
        }
    }
    return { link: r.link, comprobacion, lectura_fallida: !lectura };
}

/** Subida desde la ficha del CLIENTE: decide el destino y enlaza los expedientes abiertos que no lo tienen. */
async function subirDesdeCliente(clienteId, { base64, mimeType, clienteForm, expedienteId, usuario }) {
    const { exps, destino } = await destinoPrincipal(clienteId, expedienteId);
    if (!destino) {
        throw Object.assign(new Error('Este cliente aún no tiene ninguna oportunidad con carpeta de Drive donde guardar el justificante.'), { status: 409 });
    }
    const driveFolderId = destino.folder || await carpetaDeOportunidad(destino.oportunidad_id);
    if (!driveFolderId) throw Object.assign(new Error(`${destino.numero} no tiene carpeta de Drive configurada.`), { status: 409 });

    // El mismo fichero vale para todos sus expedientes ABIERTOS que aún no lo tienen:
    // es la misma cuenta. Los que ya tienen uno no se tocan (puede ser otra cuenta).
    const expedientes = [];
    if (destino.tipo === 'expediente') expedientes.push(destino.exp);
    for (const e of exps) {
        if (e.id !== destino.exp?.id && !e.link && !CERRADOS.has(e.estado)) expedientes.push(e);
    }
    const r = await subirJustificante({ driveFolderId, expedientes, clienteId, base64, mimeType, clienteForm, usuario });
    return {
        ...r,
        destino: { tipo: destino.tipo, id: destino.id, numero: destino.numero },
        enlazado_en: expedientes.map(e => e.numero_expediente),
    };
}

module.exports = { NOMBRE, estadoJustificante, subirJustificante, subirDesdeCliente, destinosDeCliente };
