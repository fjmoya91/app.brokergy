/**
 * representacionCliente — la copia del documento que ACREDITA LA REPRESENTACIÓN
 * del titular (poder notarial, escritura, nombramiento de administrador…).
 *
 * El Anexo I dice «Se adjunta copia a la presente» junto al poder: esa copia es
 * este fichero, y viaja en el paquete de la actuación (envioGestorService, pieza
 * de la representación). Es del CLIENTE, no del expediente —el mismo poder vale
 * para todas sus obras—, así que su enlace va en `clientes.representacion_doc_link`.
 *
 * El fichero se guarda donde el justificante bancario: en la carpeta raíz de Drive
 * del expediente abierto más reciente del cliente (o de su oportunidad), por la
 * misma decisión (`destinoPrincipal`). El anterior se ARCHIVA en OLD, no se borra:
 * puede ser el que acompaña a un Anexo I ya firmado.
 *
 * Qué datos acredita (tipo, fecha, protocolo): logic/representacion.js.
 */
const supabase = require('./supabaseClient');
const { destinoPrincipal, carpetaDeOportunidad } = require('./justificanteCliente');

const NOMBRE = 'acreditacion de la representacion.pdf';

async function subirRepresentacion(clienteId, { base64, mimeType, expedienteId = null }) {
    const driveService = require('./driveService');
    const { aPdf } = require('./justificanteOcrService');

    const { destino } = await destinoPrincipal(clienteId, expedienteId);
    if (!destino) {
        throw Object.assign(new Error('Este cliente aún no tiene ninguna oportunidad con carpeta de Drive donde guardar el documento.'), { status: 409 });
    }
    const driveFolderId = destino.folder || await carpetaDeOportunidad(destino.oportunidad_id);
    if (!driveFolderId) throw Object.assign(new Error(`${destino.numero} no tiene carpeta de Drive configurada.`), { status: 409 });

    const original = Buffer.from(base64, 'base64');
    const mime = mimeType || 'application/pdf';
    // Una foto del poder se pasa a PDF: el paquete se presenta en PDF.
    const buf = mime.startsWith('image/') ? await aPdf(original, mime) : original;

    try {
        const existing = await driveService.findFileByName(driveFolderId, NOMBRE);
        if (existing) {
            const arch = await driveService.archiveExistingToOld(driveFolderId, existing, NOMBRE);
            if (!arch) await driveService.deleteFile(existing);
        }
    } catch (e) { /* un fallo al archivar no impide subir el nuevo */ }
    const r = await driveService.saveFileToFolder(driveFolderId, NOMBRE, 'application/pdf', buf);
    if (!r?.link) throw Object.assign(new Error('No se pudo guardar en Drive'), { status: 500 });

    const { error } = await supabase.from('clientes').update({ representacion_doc_link: r.link }).eq('id_cliente', clienteId);
    if (error) throw error;
    return { link: r.link, destino: { tipo: destino.tipo, id: destino.id, numero: destino.numero } };
}

/** Quita el documento de la ficha (el fichero se queda en Drive). */
async function quitarRepresentacion(clienteId) {
    const { error } = await supabase.from('clientes').update({ representacion_doc_link: null }).eq('id_cliente', clienteId);
    if (error) throw error;
}

module.exports = { NOMBRE, subirRepresentacion, quitarRepresentacion };
