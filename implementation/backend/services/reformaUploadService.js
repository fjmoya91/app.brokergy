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

// ===========================================================================
// CHECKLIST DOCUMENTAL UNIFICADO (espina del enlace único)
// ---------------------------------------------------------------------------
// buildDocChecklist(datosCalculo) deriva, a partir de las respuestas de la
// simulación (inputs del calculador del instalador) O del landing_funnel, el
// conjunto completo de slots de documentación del expediente, etiquetados por
// FASE (ANTES / DESPUÉS de la obra) y con gating (pre_aceptacion).
//
// Se computa ON-READ: NO se persiste en BD (evita duplicar labels/help y que
// se queden obsoletos). En BD solo viven el ESTADO (docs_status) y los ficheros
// (reforma_uploads). Es determinista sobre datos_calculo, ya guardado.
// ===========================================================================

const PHASE = { ANTES: 'ANTES', DESPUES: 'DESPUES' };

/** Normaliza distintas fuentes (inputs del calculador o landing_funnel) a selectores de slot. */
function deriveSelectors(datosCalculo = {}) {
    const inputs = datosCalculo.inputs || {};
    const funnel = datosCalculo.landing_funnel || {};

    const reforma = {
        ventanas: inputs.reformaVentanas !== undefined ? !!inputs.reformaVentanas : !!funnel.reforma_elementos?.ventanas,
        cubierta: inputs.reformaCubierta !== undefined ? !!inputs.reformaCubierta : !!funnel.reforma_elementos?.cubierta,
        suelo:    inputs.reformaSuelo    !== undefined ? !!inputs.reformaSuelo    : !!funnel.reforma_elementos?.suelo,
        paredes:  inputs.reformaParedes  !== undefined ? !!inputs.reformaParedes  : !!funnel.reforma_elementos?.paredes,
    };
    const changeAcs = inputs.changeAcs !== undefined ? !!inputs.changeAcs : !!funnel.incluir_acs;

    // ¿Hay caldera de combustión que se va a sustituir?
    const fuel = String(inputs.fuelType || '').toLowerCase();
    const heating = String(inputs.boilerHeatingType || '');
    let hayCaldera;
    if (funnel.combustible_actual) {
        hayCaldera = BOILER_COMBUSTIBLE.includes(funnel.combustible_actual);
    } else if (heating) {
        hayCaldera = heating !== 'No tiene Calefacción';
    } else if (fuel) {
        hayCaldera = !fuel.includes('elect'); // gas_natural, gasoleo, propano... = combustión
    } else {
        hayCaldera = true; // caso típico CAE: cambio de caldera por aerotermia
    }
    return { reforma, changeAcs, hayCaldera };
}

/**
 * Devuelve el checklist documental completo como ARRAY ordenado de slots:
 *   { key, label, help, accept, multiple, required, gating, fase }
 * Reutiliza las claves de slot legacy donde existen (no huérfana subidas previas).
 */
function buildDocChecklist(datosCalculo = {}) {
    const sel = deriveSelectors(datosCalculo);
    const slots = [];
    const push = (s) => slots.push(s);

    // ───────── ANTES DE LA OBRA ─────────
    if (sel.hayCaldera) {
        push({ key: 'FOTO_CALDERA_ANTES', fase: PHASE.ANTES, required: true, gating: 'pre_aceptacion', multiple: true, accept: 'image/*',
               label: 'Caldera actual (instalada)', help: 'Vista general de la caldera en su sala. Puedes añadir varias perspectivas.' });
        push({ key: 'FOTO_PLACA_CALDERA_ANTES', fase: PHASE.ANTES, required: true, gating: 'pre_aceptacion', multiple: true, accept: 'image/*',
               label: 'Placa de la caldera', help: 'La etiqueta del fabricante. Acércate hasta que se lean marca, modelo y potencia.' });
    }
    push({ key: 'FOTO_FACHADA_PRINCIPAL', fase: PHASE.ANTES, required: false, multiple: true, accept: 'image/*',
           label: 'Fachada de la calle (completa)', help: 'Para ver cuántas ventanas hay y su tamaño.' });
    push({ key: 'FOTO_PATIOS_INTERIORES', fase: PHASE.ANTES, required: false, multiple: true, accept: 'image/*',
           label: 'Patios interiores', help: 'Paredes que dan a patios, con sus ventanas.' });
    push({ key: 'VIDEO_VIVIENDA', fase: PHASE.ANTES, required: false, multiple: false, accept: 'video/*',
           label: 'Vídeo recorriendo la vivienda', help: 'Un vídeo corto mostrando estancias, ventanas y accesos al exterior.' });
    push({ key: 'DOC_PLANOS', fase: PHASE.ANTES, required: false, multiple: true, accept: 'application/pdf,image/*',
           label: 'Planos o croquis', help: 'Si los tienes. Si no, con el vídeo nos vale.' });
    if (sel.reforma.ventanas) push({ key: 'FOTO_VENTANAS_ANTES', fase: PHASE.ANTES, required: false, multiple: true, accept: 'image/*', label: 'Ventanas a sustituir (antes)', help: 'Las que vais a cambiar.' });
    if (sel.reforma.cubierta) push({ key: 'FOTO_CUBIERTA_ANTES', fase: PHASE.ANTES, required: false, multiple: true, accept: 'image/*', label: 'Cubierta / tejado (antes)' });
    if (sel.reforma.paredes)  push({ key: 'FOTO_FACHADA_ANTES', fase: PHASE.ANTES, required: false, multiple: true, accept: 'image/*', label: 'Fachada a aislar (antes)' });
    if (sel.reforma.suelo)    push({ key: 'FOTO_SUELO_ANTES', fase: PHASE.ANTES, required: false, multiple: true, accept: 'image/*', label: 'Suelo (antes)' });
    if (sel.changeAcs)        push({ key: 'FOTO_ACS_ANTES', fase: PHASE.ANTES, required: false, multiple: true, accept: 'image/*', label: 'Sistema de ACS actual', help: 'Termo eléctrico o conexión de ACS de la caldera.' });

    // ───────── DESPUÉS DE LA OBRA ─────────
    push({ key: 'FOTO_UNIDAD_EXTERIOR', fase: PHASE.DESPUES, required: false, multiple: true, accept: 'image/*', label: 'Unidad exterior nueva (instalada)' });
    push({ key: 'FOTO_UNIDAD_EXTERIOR_PLACA', fase: PHASE.DESPUES, required: false, multiple: true, accept: 'image/*', label: 'Placa de la unidad exterior' });
    push({ key: 'FOTO_UNIDAD_INTERIOR_PLACA', fase: PHASE.DESPUES, required: false, multiple: true, accept: 'image/*', label: 'Placa de la unidad interior / hidrokit' });
    if (sel.changeAcs) push({ key: 'FOTO_ACS_DEPOSITO', fase: PHASE.DESPUES, required: false, multiple: true, accept: 'image/*', label: 'Depósito de ACS / inercia (con placa)' });
    push({ key: 'FOTO_CALDERA_DESMONTADA', fase: PHASE.DESPUES, required: false, multiple: true, accept: 'image/*', label: 'Caldera antigua desmontada / hueco' });
    if (sel.reforma.ventanas) push({ key: 'FOTO_VENTANAS_DESPUES', fase: PHASE.DESPUES, required: false, multiple: true, accept: 'image/*', label: 'Ventanas nuevas (después)' });
    if (sel.reforma.cubierta) push({ key: 'FOTO_CUBIERTA_DESPUES', fase: PHASE.DESPUES, required: false, multiple: true, accept: 'image/*', label: 'Cubierta terminada' });
    if (sel.reforma.paredes)  push({ key: 'FOTO_FACHADA_DESPUES', fase: PHASE.DESPUES, required: false, multiple: true, accept: 'image/*', label: 'Aislamiento de fachada terminado' });
    push({ key: 'DOC_FACTURAS', fase: PHASE.DESPUES, required: false, multiple: true, accept: 'application/pdf,image/*', label: 'Facturas de la instalación' });
    push({ key: 'DOC_RITE', fase: PHASE.DESPUES, required: false, multiple: false, accept: 'application/pdf,image/*', label: 'Certificado RITE' });

    return slots;
}

/**
 * URL de miniatura pública de Drive (sin pasar por backend ni Supabase).
 * Usa el CDN lh3.googleusercontent.com/d/{id}=w{size}: se sirve antes que el
 * endpoint /thumbnail tras subir el fichero (menos latencia de generación).
 */
function driveThumb(driveId, size = 400) {
    return driveId ? `https://lh3.googleusercontent.com/d/${driveId}=w${size}` : null;
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

/** ¿El fichero `fileName` pertenece al slot `slotKey`? (exacto o `slotKey_N`) */
function fileBelongsToSlot(fileName, slotKey) {
    const base = String(fileName || '').replace(/\.[a-z0-9]+$/i, '');
    if (base === slotKey) return true;
    if (base.startsWith(slotKey + '_')) {
        const rest = base.slice(slotKey.length + 1);
        return /^\d+$/.test(rest); // solo sufijo numérico (_1, _2…); evita colisión con slots más largos
    }
    return false;
}

/**
 * Construye la vista de documentación de un expediente (checklist + estado por
 * foto + miniaturas). Fuente única para el endpoint público (token) y el admin.
 *
 * RECONCILIA con Drive: lista la subcarpeta y muestra lo que REALMENTE hay,
 * fusionando los metadatos de reforma_uploads (estado/motivo/subido_por) por
 * nombre. Así la vista nunca queda desincronizada con Drive (si una escritura
 * en BD se perdiera, la foto sigue apareciendo). El estado por foto vive en la
 * BD; el estado del slot es un resumen derivado.
 */
async function buildDocsView(opp) {
    const dc = opp.datos_calculo || {};
    const checklist = buildDocChecklist(dc);
    const uploads = dc.reforma_uploads || {};

    // Listar la carpeta de documentos una sola vez (reconciliación)
    let driveFiles = [];
    try {
        const folderId = dc.drive_folder_id || dc.inputs?.drive_folder_id;
        if (folderId) {
            const subId = await driveService.findSubfolderByName(folderId, SUBCARPETA_DOCS);
            if (subId) driveFiles = await driveService.listFiles(subId);
        }
    } catch (e) { console.warn('[Docs] reconciliación Drive:', e.message); }

    const slots = checklist.map(s => {
        const dbByName = new Map((uploads[s.key] || []).map(it => [it.name, it]));
        const driveForSlot = driveFiles.filter(f => fileBelongsToSlot(f.name, s.key));

        // Si Drive devolvió ficheros del slot, esa es la verdad de existencia;
        // si Drive no respondió (lista vacía por error), caemos a la BD.
        const source = driveForSlot.length > 0
            ? driveForSlot.map(f => {
                const db = dbByName.get(f.name) || {};
                return {
                    name: f.name,
                    link: f.webViewLink || db.link || null,
                    at: db.at || null,
                    driveId: f.id,
                    thumb: driveThumb(f.id),
                    estado: db.estado || 'subida',
                    motivo: db.motivo || null,
                    subido_por: db.subido_por || null
                };
            })
            : (uploads[s.key] || []).map(it => ({
                name: it.name, link: it.link, at: it.at,
                driveId: it.driveId || null, thumb: driveThumb(it.driveId),
                estado: it.estado || 'subida', motivo: it.motivo || null, subido_por: it.subido_por || null
            }));

        let estado = 'pendiente';
        if (source.length) {
            if (source.some(i => i.estado === 'rechazada')) estado = 'rechazada';
            else if (source.every(i => i.estado === 'validada')) estado = 'validada';
            else estado = 'subida';
        }
        return { ...s, estado, items: source };
    });

    return {
        id_oportunidad: opp.id_oportunidad,
        cliente: opp.referencia_cliente || '',
        aceptada: dc.estado === 'ACEPTADA',
        slots
    };
}

/**
 * Notifica (WhatsApp + email) a quien subió una foto que ha sido RECHAZADA,
 * con el motivo y el enlace para volver a subirla. Background-safe.
 *   subidoPor: 'cliente' | 'instalador' | 'admin'
 */
async function notifyRechazo({ opp, slotLabel, motivo, subidoPor }) {
    const dc = opp.datos_calculo || {};
    const link = buildUploadLink(opp.id, dc.upload_token || '');
    let phone = null, email = null, nombre = '';

    try {
        if (subidoPor === 'instalador') {
            const insId = opp.instalador_asociado_id || opp.prescriptor_id;
            if (insId) {
                const { data: p } = await supabase.from('prescriptores')
                    .select('razon_social, tlf, tlf_contacto, email, email_contacto')
                    .eq('id_empresa', insId).maybeSingle();
                if (p) { phone = p.tlf || p.tlf_contacto; email = p.email || p.email_contacto; nombre = p.razon_social || ''; }
            }
        } else {
            // cliente (también para 'admin'/desconocido: avisamos al cliente por defecto)
            if (opp.cliente_id) {
                const { data: c } = await supabase.from('clientes')
                    .select('nombre_razon_social, tlf, persona_contacto_tlf, email, persona_contacto_email')
                    .eq('id_cliente', opp.cliente_id).maybeSingle();
                if (c) { phone = c.tlf || c.persona_contacto_tlf; email = c.email || c.persona_contacto_email; nombre = c.nombre_razon_social || ''; }
            }
        }
    } catch (e) { console.warn('[Reforma] resolviendo contacto rechazo:', e.message); }

    const msg =
`Hola${nombre ? ` *${nombre}*` : ''} 👋

Revisando la documentación del expediente *${opp.id_oportunidad}* hemos visto que una foto no nos sirve y necesitamos que la repitas:

📷 *${slotLabel}*
⚠️ Motivo: ${motivo}

🔗 Vuelve a subirla aquí (puedes hacerlo desde el móvil):
${link}

¡Gracias!
*BROKERGY — Ingeniería Energética*`;

    if (phone) whatsappService.sendText(phone, msg).catch(err => console.warn('[Reforma] WA rechazo:', err.message));
    if (email) {
        emailService.sendMail({
            to: email,
            subject: `Foto a repetir · Expediente ${opp.id_oportunidad}`,
            html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#222">
                <h2 style="color:#FF6D00">Hola ${nombre || ''},</h2>
                <p>Revisando la documentación del expediente <strong>${opp.id_oportunidad}</strong> hemos visto que una foto no nos sirve:</p>
                <p style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:12px"><strong>📷 ${slotLabel}</strong><br/>⚠️ Motivo: ${motivo}</p>
                <p style="margin:24px 0"><a href="${link}" style="background:#FF6D00;color:#fff;padding:14px 24px;border-radius:10px;text-decoration:none;font-weight:bold">Volver a subir la foto</a></p>
                <p style="color:#888;font-size:12px">Si el botón no funciona, copia este enlace:<br>${link}</p>
                <p style="color:#888;font-size:12px">BROKERGY — Ingeniería Energética</p>
            </div>`,
            text: `Hola ${nombre || ''}, necesitamos que repitas la foto "${slotLabel}" del expediente ${opp.id_oportunidad}. Motivo: ${motivo}. Súbela aquí: ${link}`
        }).catch(err => console.warn('[Reforma] email rechazo:', err.message));
    }
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
    PHASE,
    getReformaSlots,
    getAerotermiaSlots,
    getLeadSlots,
    getSlotDef,
    isValidSlot,
    buildDocChecklist,
    buildDocsView,
    deriveSelectors,
    driveThumb,
    notifyRechazo,
    generateUploadToken,
    buildUploadLink,
    attachUploadToken,
    ensureDriveFolder,
    sendReformaUploadNotifications
};
