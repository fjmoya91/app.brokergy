/**
 * reformaUploadService — soporte del enlace único de subida de documentación
 * para los leads del formulario /reforma.
 *
 * Responsabilidades:
 *   - Definir los SLOTS de subida aplicables según las respuestas del funnel.
 *   - Generar el token del enlace único (estilo cee.ack_token).
 *   - Asegurar la carpeta Drive del lead (la crea si no existe).
 *   - Enviar el enlace por WhatsApp + email al cliente y avisar al grupo admin.
 *
 * NO modifica el flujo estándar de /calcula-tu-ayuda: solo se invoca desde la
 * ruta /api/landing/lead cuando el lead viene con origen === 'reforma'.
 */

const crypto = require('crypto');
const supabase = require('./supabaseClient');
const driveService = require('./driveService');
const emailService = require('./emailService');
const whatsappService = require('./whatsappService');

const SUBCARPETA_DOCS = '12. DOCUMENTOS PARA CEE'; // misma que usa /firma y scan-photos
const BOILER_COMBUSTIBLE = ['gas', 'gasoleo', 'carbon', 'biomasa'];
const FRONTEND = () => process.env.FRONTEND_URL || 'https://app.brokergy.es';

/**
 * Devuelve los slots de subida que aplican a un lead concreto.
 *
 * Soporta DOS flujos:
 *   - 'reforma' (origen=reforma): obra ya hecha/a medias → fotos del antes,
 *     elementos rehabilitados, facturas, CEE previo/posterior.
 *   - 'aerotermia' (origen omitido o cualquier otro): el cliente quiere cambiar
 *     a aerotermia → fotos de la caldera actual, sitio donde irá la UE, factura
 *     de luz/gas. Más ligero y orientado a preparar la oferta.
 */
function getLeadSlots(funnel = {}, origen = 'aerotermia') {
    if (origen === 'reforma') return getReformaSlots(funnel);
    return getAerotermiaSlots(funnel);
}

function getReformaSlots(funnel = {}) {
    const els = funnel.reforma_elementos || {};
    const ej = funnel.obra_estado === 'ejecutada';
    const huboCaldera = BOILER_COMBUSTIBLE.includes(funnel.combustible_actual) || !!els.caldera;
    const slots = [];

    if (huboCaldera) {
        slots.push({ key: 'FOTO_CALDERA_ANTES', label: 'Foto de la caldera antigua', help: 'El sistema de calefacción que había antes.', accept: 'image/*', required: true, multiple: false });
        slots.push({ key: 'FOTO_PLACA_CALDERA_ANTES', label: 'Foto de la placa de la caldera', help: 'La etiqueta con los datos del fabricante.', accept: 'image/*', required: true, multiple: false });
    }
    if (els.ventanas) slots.push({ key: 'FOTO_VENTANAS_ANTES', label: 'Fotos de las ventanas (antes)', help: 'Las ventanas que vas a cambiar.', accept: 'image/*', required: false, multiple: true });
    if (els.cubierta) slots.push({ key: 'FOTO_CUBIERTA_ANTES', label: 'Fotos de la cubierta / tejado (antes)', accept: 'image/*', required: false, multiple: true });
    if (els.paredes) slots.push({ key: 'FOTO_FACHADA_ANTES', label: 'Fotos de la fachada (antes)', accept: 'image/*', required: false, multiple: true });
    if (els.suelo) slots.push({ key: 'FOTO_SUELO_ANTES', label: 'Fotos del suelo (antes)', accept: 'image/*', required: false, multiple: true });
    if (els.placas) slots.push({ key: 'FOTO_PLACAS_SOLARES', label: 'Fotos de las placas solares', accept: 'image/*', required: false, multiple: true });

    if (funnel.reforma_cee_previo === 'si' || funnel.reforma_cee_ambos === 'si') {
        slots.push({ key: 'DOC_CEE_PREVIO', label: 'Certificado energético previo', help: 'PDF (y los archivos .cex/.xml si los tienes).', accept: 'application/pdf,image/*,.cex,.xml', required: false, multiple: true });
    }
    if (ej) slots.push({ key: 'DOC_CEE_POSTERIOR', label: 'Certificado energético posterior', help: 'El emitido tras la reforma.', accept: 'application/pdf,image/*,.cex,.xml', required: false, multiple: true });
    if (funnel.reforma_facturas === 'si' || ej) slots.push({ key: 'DOC_FACTURAS', label: 'Facturas de la reforma', accept: 'application/pdf,image/*', required: false, multiple: true });

    slots.push({ key: 'OTROS', label: 'Otros documentos', help: 'Cualquier otra cosa que quieras aportar.', accept: 'application/pdf,image/*,.cex,.xml', required: false, multiple: true });
    return slots;
}

/**
 * Slots para leads del funnel principal (cambio a aerotermia).
 * Lo mínimo y útil: caldera actual + fachadas/patios donde puede ir la
 * unidad exterior. Las facturas y el cuadro eléctrico los recoge el técnico
 * en la visita / llamada posterior.
 */
function getAerotermiaSlots(funnel = {}) {
    const huboCaldera = BOILER_COMBUSTIBLE.includes(funnel.combustible_actual);
    const slots = [];

    if (huboCaldera) {
        slots.push({ key: 'FOTO_CALDERA_ANTES', label: 'Foto de tu caldera actual', help: 'Una foto general del sistema que vas a cambiar.', accept: 'image/*', required: false, multiple: false });
        slots.push({ key: 'FOTO_PLACA_CALDERA_ANTES', label: 'Foto de la placa / etiqueta', help: 'La etiqueta con marca, modelo y potencia.', accept: 'image/*', required: false, multiple: false });
    }
    slots.push({ key: 'FOTO_FACHADA_PRINCIPAL', label: 'Foto de la fachada principal', help: 'Para valorar dónde podría ir la unidad exterior.', accept: 'image/*', required: false, multiple: true });
    slots.push({ key: 'FOTO_PATIOS_INTERIORES', label: 'Foto de patios interiores', help: 'Si tu vivienda tiene patios interiores, una foto de cada uno.', accept: 'image/*', required: false, multiple: true });
    slots.push({ key: 'FOTO_PATIO_LUCES', label: 'Foto del patio de luces (si lo hay)', help: 'Solo si tu edificio tiene patio de luces.', accept: 'image/*', required: false, multiple: true });
    slots.push({ key: 'OTROS', label: 'Otros documentos o fotos', help: 'Cualquier cosa más que quieras aportar.', accept: 'application/pdf,image/*', required: false, multiple: true });
    return slots;
}

function isValidSlot(funnel, slotKey, origen = 'aerotermia') {
    return getLeadSlots(funnel, origen).some(s => s.key === slotKey);
}

function getSlotDef(funnel, slotKey, origen = 'aerotermia') {
    return getLeadSlots(funnel, origen).find(s => s.key === slotKey) || null;
}

function generateUploadToken(seed = '') {
    return crypto.createHash('sha256')
        .update(`${seed}-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`)
        .digest('hex')
        .slice(0, 32);
}

/** Construye el enlace público de subida. */
function buildUploadLink(oportunidadUuid, token) {
    return `${FRONTEND()}/subir-docs/${oportunidadUuid}?token=${token}`;
}

/**
 * Genera y persiste el token de subida en datos_calculo (merge no destructivo)
 * e inicializa reforma_uploads. Devuelve { token, datosCalculo }.
 */
async function attachUploadToken(oportunidadUuid) {
    const { data: opp, error } = await supabase
        .from('oportunidades')
        .select('id, id_oportunidad, referencia_cliente, datos_calculo')
        .eq('id', oportunidadUuid)
        .maybeSingle();
    if (error || !opp) throw new Error('Oportunidad no encontrada para adjuntar token');

    const token = generateUploadToken(oportunidadUuid);
    const datosCalculo = {
        ...(opp.datos_calculo || {}),
        upload_token: token,
        reforma_uploads: opp.datos_calculo?.reforma_uploads || {}
    };
    const { error: updErr } = await supabase
        .from('oportunidades')
        .update({ datos_calculo: datosCalculo })
        .eq('id', oportunidadUuid);
    if (updErr) throw new Error(`No se pudo guardar el token: ${updErr.message}`);

    return { token, opp: { ...opp, datos_calculo: datosCalculo } };
}

/**
 * Asegura que la oportunidad tiene carpeta Drive. La crea (clonando plantilla)
 * si no existe y persiste drive_folder_id/link en datos_calculo. Idempotente.
 */
async function ensureDriveFolder(oportunidadUuid) {
    const { data: opp, error } = await supabase
        .from('oportunidades')
        .select('id, id_oportunidad, referencia_cliente, datos_calculo')
        .eq('id', oportunidadUuid)
        .maybeSingle();
    if (error || !opp) throw new Error('Oportunidad no encontrada');

    const existing = opp.datos_calculo?.drive_folder_id || opp.datos_calculo?.inputs?.drive_folder_id;
    if (existing) return existing;

    const ref = opp.referencia_cliente || opp.id_oportunidad;
    const folder = await driveService.setupOpportunityFolder(opp.id_oportunidad, ref);
    if (!folder?.id) throw new Error('No se pudo crear la carpeta de Drive');

    const datosCalculo = {
        ...(opp.datos_calculo || {}),
        drive_folder_id: folder.id,
        drive_folder_link: folder.link || null
    };
    await supabase.from('oportunidades').update({ datos_calculo: datosCalculo }).eq('id', oportunidadUuid);
    return folder.id;
}

/**
 * Notifica al cliente (WhatsApp + email) y al grupo admin con el enlace de subida.
 * Pensado para ejecutarse en background (setImmediate).
 */
async function sendReformaUploadNotifications({ contacto, idOportunidad, uploadLink, slots }) {
    const nombre = contacto?.nombre || 'cliente';
    const listaDocs = (slots || [])
        .filter(s => s.key !== 'OTROS')
        .map(s => `• ${s.label}`)
        .join('\n') || '• Fotos del estado anterior y documentación de la reforma.';

    // WhatsApp cliente
    if (contacto?.tlf) {
        const msg =
`¡Hola *${nombre}*! 👋

Gracias por tu interés en las ayudas de Brokergy. Hemos registrado tu solicitud con la referencia *${idOportunidad}*.

Para poder analizar tu caso y tramitar la ayuda necesitamos que nos subas algunos documentos y fotos:

${listaDocs}

🔗 *Sube tu documentación aquí (puedes hacerlo desde el móvil, foto a foto):*
${uploadLink}

¡Quedamos a tu disposición!
*BROKERGY — Ingeniería Energética*`;
        whatsappService.sendText(contacto.tlf, msg).catch(err => console.warn('[Reforma] WhatsApp cliente:', err.message));
    }

    // Email cliente
    if (contacto?.email) {
        try {
            const itemsHtml = (slots || []).filter(s => s.key !== 'OTROS').map(s => `<li>${s.label}</li>`).join('');
            await emailService.sendMail({
                to: contacto.email,
                subject: `Sube tu documentación · Solicitud ${idOportunidad}`,
                html: `
                  <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#222">
                    <h2 style="color:#FF6D00">Hola ${nombre},</h2>
                    <p>Gracias por tu interés en las ayudas de Brokergy. Tu referencia es <strong>${idOportunidad}</strong>.</p>
                    <p>Para analizar tu caso necesitamos que nos subas:</p>
                    <ul>${itemsHtml}</ul>
                    <p style="margin:24px 0">
                      <a href="${uploadLink}" style="background:#FF6D00;color:#fff;padding:14px 24px;border-radius:10px;text-decoration:none;font-weight:bold">Subir mi documentación</a>
                    </p>
                    <p style="color:#888;font-size:12px">Puedes hacerlo desde el móvil, foto a foto. Si el botón no funciona, copia este enlace:<br>${uploadLink}</p>
                    <p style="color:#888;font-size:12px">BROKERGY — Ingeniería Energética</p>
                  </div>`,
                text: `Hola ${nombre}, sube tu documentación (ref ${idOportunidad}) aquí: ${uploadLink}`
            });
        } catch (e) {
            console.warn('[Reforma] Email cliente:', e.message);
        }
    }

    // Aviso al grupo admin (BROKERGY - Expedientes)
    try {
        const adminMsg = `🆕 *LEAD REFORMA (web)*\n\nRef *${idOportunidad}*\n👤 ${nombre}${contacto?.tlf ? `\n📞 ${contacto.tlf}` : ''}${contacto?.email ? `\n✉ ${contacto.email}` : ''}\n\nEnlace de subida de documentación enviado al cliente.`;
        whatsappService.sendText(process.env.WHATSAPP_ADMIN_CHAT || '34623926179', adminMsg).catch(() => {});
    } catch { /* noop */ }
}

module.exports = {
    SUBCARPETA_DOCS,
    getReformaSlots,
    getAerotermiaSlots,
    getLeadSlots,
    getSlotDef,
    isValidSlot,
    generateUploadToken,
    buildUploadLink,
    attachUploadToken,
    ensureDriveFolder,
    sendReformaUploadNotifications
};
