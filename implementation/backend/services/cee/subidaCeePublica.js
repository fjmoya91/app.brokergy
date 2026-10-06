// ─── subidaCeePublica.js ─────────────────────────────────────────────────────
// Lo que pasa cuando alguien SIN SESIÓN sube un fichero del CEE por un enlace
// nuestro: el técnico por `/subir-cee` (o `/cee-directo-upload`) y quien PRESENTA
// el certificado por `/presentar/…` (presentacionCeeService).
//
// Vivía dentro de las dos rutas de `routes/public.js`. Se sacó al necesitarlo la
// tercera superficie: el justificante de REGISTRO es el hito que cierra la fase
// —lee su fecha, marca REGISTRADO, avanza el estado, avisa al equipo y, en un CEE
// directo, dispara la entrega al cliente— y con dos copias de eso una se queda
// atrás el día que se toque la otra.
//
// `quien` solo cambia CÓMO se cuenta en el historial y en el aviso («el
// certificador», «Eva · presentación»); lo que se hace es lo mismo.

const supabase = require('../supabaseClient');
const ceeUploadService = require('../ceeUploadService');
const { invalidarValidacionCee } = require('../../utils/docValidacion');

const QUIEN_TECNICO = { texto: 'el certificador', usuario: 'CERTIFICADOR' };

function error(status, msg) { const e = new Error(msg); e.status = status; return e; }

/**
 * Sube un fichero a un slot del CEE de un expediente CAE.
 * @returns {{success, slot, link, name, registrado, fecha_registro, aviso_fecha}}
 */
async function subirCae({ expedienteId, fase, slot, buffer, mimetype, quien = QUIEN_TECNICO }) {
    const ph = fase === 'final' ? 'final' : 'inicial';
    if (!buffer?.length) throw error(400, 'No se ha recibido ningún archivo');
    if (!ceeUploadService.CEE_SLOTS.find(s => s.id === slot)) throw error(400, 'Tipo de documento no válido');

    const { data: exp } = await supabase.from('expedientes').select('*').eq('id', expedienteId).maybeSingle();
    if (!exp) throw error(404, 'Expediente no encontrado');

    const driveFolderId = await ceeUploadService.resolveDriveFolderId(exp);
    if (!driveFolderId) throw error(400, 'El expediente no tiene carpeta de Drive');

    const numExp = exp.numero_expediente || expedienteId;
    const uploaded = await ceeUploadService.uploadCeeFile(driveFolderId, ph, numExp, slot, buffer, mimetype);

    // Persistir el enlace en cee.cee_files[section][slot] (igual que la app).
    const cee = exp.cee || {};
    const ceeFiles = cee.cee_files || {};
    ceeFiles[ph] = { ...(ceeFiles[ph] || {}), [slot]: uploaded.link };
    cee.cee_files = ceeFiles;
    // Fichero nuevo ⇒ la validación anterior del slot ya no vale (igual que al
    // subirlo desde la app en CeeDocumentsGrid): vuelve a ámbar.
    const ceeActualizado = invalidarValidacionCee(cee, ph, slot);
    await supabase.from('expedientes').update({ cee: ceeActualizado, updated_at: new Date().toISOString() }).eq('id', expedienteId);
    // Fichero nuevo ⇒ la revisión previa que hubiera en el freno ya no vale.
    if (slot === 'xml' || slot === 'cex') require('./revisionTecnico').olvidar(expedienteId, ph);

    // Al subir el REGISTRO → misma notificación/transición que la app. La fecha
    // se LEE del justificante (regla 27.c); si no se puede, se cae a hoy y se dice.
    let registrado = false, fechaRegistro = null, avisoFecha = null;
    if (slot === 'registro') {
        const { resolverFechaRegistro } = require('../registroCeeOcrService');
        const lectura = await resolverFechaRegistro(buffer);
        avisoFecha = lectura.aviso;
        const r = await ceeUploadService.markCeeRegistradoFromUpload(exp, ph, {
            fechaRegistro: lectura.origen === 'justificante' ? lectura.fecha : null,
            quien,
        });
        registrado = !!r.ok;
        fechaRegistro = r.fechaRegistro || lectura.fecha;
    }

    return { success: true, slot, link: uploaded.link, name: uploaded.fileName, registrado, fecha_registro: fechaRegistro, aviso_fecha: avisoFecha };
}

/**
 * Sube un fichero a un slot del CEE de un CEE DIRECTO. El justificante de
 * REGISTRO cierra la fase y es una de las dos mitades de la entrega al cliente.
 */
async function subirCeeDirecto({ id, fase, slot, buffer, mimetype, quien = QUIEN_TECNICO }) {
    const ceeDirectoUploads = require('../ceeDirectoUploadService');
    const svcCeeDirecto = require('../ceeDirectoService');
    const ph = fase === 'final' ? 'final' : 'inicial';
    if (!buffer?.length) throw error(400, 'No se ha recibido ningún archivo');
    if (!ceeDirectoUploads.CEE_SLOTS.find(sl => sl.id === slot)) throw error(400, 'Tipo de documento no válido');

    const row = await svcCeeDirecto.cargar(id, { conRelaciones: false });
    if (!row) throw error(404, 'Expediente no encontrado');
    if (!row.drive_folder_id) throw error(400, 'El expediente no tiene carpeta de Drive');

    const subido = await ceeDirectoUploads.uploadFile(row, ph, slot, buffer, mimetype);

    const cee = row.cee || {};
    const ceeFiles = cee.cee_files || {};
    ceeFiles[ph] = { ...(ceeFiles[ph] || {}), [slot]: subido.link };
    cee.cee_files = ceeFiles;
    // Fichero nuevo ⇒ la validación anterior del slot deja de valer y vuelve a
    // ámbar, igual que al subirlo desde la app.
    const patch = { cee: invalidarValidacionCee(cee, ph, slot) };

    // El justificante de REGISTRO es el hito: cierra la fase. Se sella aquí y
    // no en un segundo paso porque quien lo sube no vuelve a entrar.
    let registrado = false, fechaRegistro = null, avisoFecha = null;
    const key = ph === 'final' ? 'cee_final' : 'cee_inicial';
    if (slot === 'registro' && row.seguimiento?.[key] !== 'REGISTRADO') {
        // La fecha sale del justificante, no del día de la subida. Misma lectura que en el CAE.
        const { resolverFechaRegistro } = require('../registroCeeOcrService');
        const lectura = await resolverFechaRegistro(buffer);
        fechaRegistro = lectura.fecha;
        avisoFecha = lectura.aviso;
        patch.seguimiento = { ...(row.seguimiento || {}), [key]: 'REGISTRADO' };
        patch.documentacion = {
            ...(row.documentacion || {}),
            [`fecha_registro_${key}`]: lectura.fecha
        };
        registrado = true;
    }

    await svcCeeDirecto.guardar(row.id, patch, { seguimientoPrev: row.seguimiento });

    if (registrado) {
        // Otra de las dos mitades de la condición de entrega: si el expediente ya
        // estaba cobrado, el cliente recibe su certificado sin que nadie se acuerde.
        require('../ceeDirectoEntrega')
            .intentarEntregaAsync(row.id, ph, `registro subido por ${quien.texto}`);
        // Si aún NO está cobrado, se le avisa de que ya está registrado (una vez por fase).
        setImmediate(() => require('../ceeDirectoEntrega')
            .avisarRegistrado(row.id, ph, { manual: false })
            .catch(e => console.warn('[cee-directo-upload aviso cliente]', e.message)));

        const [aa, mm, dd] = String(fechaRegistro).split('-');
        await svcCeeDirecto.anotarHistorial(row.id, {
            tipo: 'CEE',
            texto: `${(ph === 'final' ? 'CEE FINAL' : 'CEE INICIAL')} REGISTRADO EL ${dd}/${mm}/${aa}`
                + ` — JUSTIFICANTE SUBIDO POR ${String(quien.texto).toUpperCase()}${avisoFecha ? ' (FECHA DE LA SUBIDA: EL JUSTIFICANTE NO SE PUDO LEER)' : ''}`,
            usuario: null
        });
        // Aviso al equipo: lo siguiente es cobrarlo y entregárselo al cliente.
        // Best-effort, fuera de la respuesta.
        setImmediate(async () => {
            try {
                const wa = process.env.WHATSAPP_ADMIN_CHAT;
                const texto = `✅ ${row.numero_expediente} — ${ph === 'final' ? 'CEE FINAL' : 'CEE'} REGISTRADO por ${quien.texto}.`;
                if (wa) await require('../whatsappService').sendText(wa, texto);
                if (process.env.ADMIN_EMAIL) {
                    await require('../emailService').sendMail({
                        to: process.env.ADMIN_EMAIL,
                        subject: `${row.numero_expediente} — CEE registrado`,
                        text: texto, html: `<p>${texto}</p>`
                    });
                }
            } catch (e) { console.error('[cee-directo-upload aviso]', e.message); }
        });
    }

    return { success: true, slot, link: subido.link, name: subido.fileName, registrado, fecha_registro: fechaRegistro, aviso_fecha: avisoFecha };
}

module.exports = { subirCae, subirCeeDirecto, QUIEN_TECNICO };
