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
const { partnerNotifyTargets } = require('./notifyContacts');

const SUBCARPETA_DOCS = '12. DOCUMENTOS PARA CEE'; // misma que usa /firma y scan-photos
// Nombre CANÓNICO tal cual viene en la plantilla de Drive (con espacio tras el punto).
// La resolución de carpeta es tolerante (getOrCreateSubfolderNormalized), así que
// "5. FACTURAS" y "5.FACTURAS" se tratan como la MISMA carpeta y no se duplican.
const SUBCARPETA_FACTURAS = '5. FACTURAS'; // TODAS las facturas (admin y cliente/instalador) van aquí
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
        slots.push({ key: 'FOTO_CALDERA_ANTES', label: 'Foto de la caldera antigua', help: 'El sistema de calefacción que había antes.', accept: ACCEPT_FOTO, required: true, multiple: false });
        slots.push({ key: 'FOTO_PLACA_CALDERA_ANTES', label: 'Foto de la placa de la caldera', help: 'La etiqueta con los datos del fabricante.', accept: ACCEPT_FOTO, required: true, multiple: false });
    }
    if (els.ventanas) slots.push({ key: 'FOTO_VENTANAS_ANTES', label: 'Fotos de las ventanas (antes)', help: 'Las ventanas que vas a cambiar.', accept: ACCEPT_FOTO, required: false, multiple: true });
    if (els.cubierta) slots.push({ key: 'FOTO_CUBIERTA_ANTES', label: 'Fotos de la cubierta / tejado (antes)', accept: ACCEPT_FOTO, required: false, multiple: true });
    if (els.paredes) slots.push({ key: 'FOTO_FACHADA_ANTES', label: 'Fotos de la fachada (antes)', accept: ACCEPT_FOTO, required: false, multiple: true });
    if (els.suelo) slots.push({ key: 'FOTO_SUELO_ANTES', label: 'Fotos del suelo (antes)', accept: ACCEPT_FOTO, required: false, multiple: true });
    if (els.placas) slots.push({ key: 'FOTO_PLACAS_SOLARES', label: 'Fotos de las placas solares', accept: ACCEPT_FOTO, required: false, multiple: true });

    if (funnel.reforma_cee_previo === 'si' || funnel.reforma_cee_ambos === 'si') {
        slots.push({ key: 'DOC_CEE_PREVIO', label: 'Certificado energético previo', help: 'PDF (y los archivos .cex/.xml si los tienes).', accept: 'application/pdf,image/*,.cex,.xml', required: false, multiple: true });
    }
    if (ej) slots.push({ key: 'DOC_CEE_POSTERIOR', label: 'Certificado energético posterior', help: 'El emitido tras la reforma.', accept: 'application/pdf,image/*,.cex,.xml', required: false, multiple: true });
    if (funnel.reforma_facturas === 'si' || ej) slots.push({ key: 'DOC_FACTURAS', label: 'Facturas de la reforma', accept: 'application/pdf,image/*', required: false, multiple: true });

    slots.push({ key: 'OTROS', label: 'Otros documentos', help: 'Cualquier otra cosa que quieras aportar.', accept: 'application/pdf,image/*,.cex,.xml', required: false, multiple: true, named: true });
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
        slots.push({ key: 'FOTO_CALDERA_ANTES', label: 'Foto de tu caldera actual', help: 'Una foto general del sistema que vas a cambiar.', accept: ACCEPT_FOTO, required: false, multiple: false });
        slots.push({ key: 'FOTO_PLACA_CALDERA_ANTES', label: 'Foto de la placa / etiqueta', help: 'La etiqueta con marca, modelo y potencia.', accept: ACCEPT_FOTO, required: false, multiple: false });
    }
    slots.push({ key: 'FOTO_FACHADA_PRINCIPAL', label: 'Foto de la fachada principal', help: 'Para valorar dónde podría ir la unidad exterior.', accept: ACCEPT_FOTO, required: false, multiple: true });
    slots.push({ key: 'FOTO_PATIOS_INTERIORES', label: 'Foto de patios interiores', help: 'Si tu vivienda tiene patios interiores, una foto de cada uno.', accept: ACCEPT_FOTO, required: false, multiple: true });
    slots.push({ key: 'FOTO_PATIO_LUCES', label: 'Foto del patio de luces (si lo hay)', help: 'Solo si tu edificio tiene patio de luces.', accept: ACCEPT_FOTO, required: false, multiple: true });
    slots.push({ key: 'OTROS', label: 'Otros documentos o fotos', help: 'Cualquier cosa más que quieras aportar.', accept: 'application/pdf,image/*', required: false, multiple: true, named: true });
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

// Apartados de foto que el ADMIN puede AÑADIR a un expediente cuando el alcance
// cambia a posteriori (p.ej. añadir ventanas a un RES060 de aerotermia). Cada
// concepto habilita uno o varios slots (antes/después) vía docs_overrides[slot].enabled.
// El backend valida contra esta lista (no se habilita cualquier clave arbitraria).
const ADDABLE_CONCEPTS = [
    { id: 'caldera',  label: 'Caldera actual + su placa (antes)', slots: ['FOTO_CALDERA_ANTES', 'FOTO_PLACA_CALDERA_ANTES'] },
    { id: 'ventanas', label: 'Ventanas (antes y después)', slots: ['FOTO_VENTANAS_ANTES', 'FOTO_VENTANAS_DESPUES'] },
    { id: 'cubierta', label: 'Cubierta / tejado (antes y después)', slots: ['FOTO_CUBIERTA_ANTES', 'FOTO_CUBIERTA_DESPUES'] },
    { id: 'fachada',  label: 'Aislamiento de fachada (antes y después)', slots: ['FOTO_FACHADA_ANTES', 'FOTO_FACHADA_DESPUES'] },
    { id: 'suelo',    label: 'Suelo (antes)', slots: ['FOTO_SUELO_ANTES'] },
    { id: 'acs',      label: 'ACS: sistema actual + depósito', slots: ['FOTO_ACS_ANTES', 'FOTO_ACS_DEPOSITO'] },
];
const ADDABLE_SLOT_KEYS = new Set(ADDABLE_CONCEPTS.flatMap(c => c.slots));

// Formatos admitidos por el selector de archivos. Generosos: cualquier imagen + PDF
// valen para todas las casillas de foto/documento (el backend no filtra por formato).
const ACCEPT_FOTO = 'image/*,application/pdf';
const ACCEPT_DOC = 'application/pdf,image/*';
const ACCEPT_VIDEO = 'video/*';

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

    // Hibridación (RES093): la caldera antigua NO se desmonta, se conserva y
    // trabaja en paralelo con la bomba de calor. Cambia el apartado "caldera
    // desmontada" del DESPUÉS por "depósito de ACS junto a la caldera antigua".
    const hibridacion = inputs.hibridacion === true || datosCalculo.hibridacion === true;

    return { reforma, changeAcs, hayCaldera, hibridacion };
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

    // Apartados habilitados a mano por el admin para ESTE expediente (alcance
    // ampliado a posteriori, p.ej. añadir ventanas a un RES060 de aerotermia).
    // Viven en datos_calculo.docs_overrides[<slot>].enabled === true.
    const enabledSet = new Set(Object.entries(datosCalculo.docs_overrides || {})
        .filter(([, v]) => v && v.enabled === true).map(([k]) => k));
    // ¿Incluir este slot? Si lo pide la simulación O el admin lo habilitó a mano.
    const want = (slotKey, selector) => !!selector || enabledSet.has(slotKey);

    // ───────── ANTES DE LA OBRA ─────────
    // La caldera sale por la simulación (hayCaldera) O porque el admin la activó a mano
    // ("Añadir apartado de obra" → Caldera), útil en expedientes migrados/eléctricos
    // donde no se dedujo caldera pero sí hace falta documentarla para el Anexo Fotográfico.
    if (sel.hayCaldera || enabledSet.has('FOTO_CALDERA_ANTES') || enabledSet.has('FOTO_PLACA_CALDERA_ANTES')) {
        push({ key: 'FOTO_CALDERA_ANTES', fase: PHASE.ANTES, required: true, gating: 'pre_aceptacion', multiple: true, accept: ACCEPT_FOTO,
               label: 'Caldera actual (instalada)', help: 'Vista general de la caldera en su sala. Puedes añadir varias perspectivas.' });
        push({ key: 'FOTO_PLACA_CALDERA_ANTES', fase: PHASE.ANTES, required: true, gating: 'pre_aceptacion', multiple: true, accept: ACCEPT_FOTO,
               label: 'Placa de la caldera', help: 'La etiqueta del fabricante. Acércate hasta que se lean marca, modelo y potencia.' });
    }
    push({ key: 'FOTO_FACHADA_PRINCIPAL', fase: PHASE.ANTES, required: false, multiple: true, accept: ACCEPT_FOTO,
           label: 'Fachada de la calle (completa)', help: 'Para ver cuántas ventanas hay y su tamaño.' });
    push({ key: 'FOTO_PATIOS_INTERIORES', fase: PHASE.ANTES, required: false, multiple: true, accept: ACCEPT_FOTO,
           label: 'Patios interiores', help: 'Paredes que dan a patios, con sus ventanas.' });
    push({ key: 'VIDEO_VIVIENDA', fase: PHASE.ANTES, required: false, multiple: false, accept: ACCEPT_VIDEO,
           label: 'Vídeo recorriendo la vivienda', help: 'Un vídeo corto mostrando estancias, ventanas y accesos al exterior.' });
    push({ key: 'DOC_PLANOS', fase: PHASE.ANTES, required: false, multiple: true, accept: ACCEPT_DOC,
           label: 'Planos o croquis', help: 'PDF o foto (.pdf, .png, .jpg…). Si no los tienes, con el vídeo nos vale.' });
    // CEE EXISTENTE: el certificado energético actual de la vivienda (si ya lo tiene).
    // optionalAlways → nunca pasa a obligatorio al ACEPTAR (no toda vivienda tiene CEE previo).
    // mergePdf → puede aportarse como PDF directo O como fotos de las páginas; cuando estén
    // todas, el cliente/admin pulsa "Unir en un PDF" y el backend las funde en un único PDF.
    push({ key: 'DOC_CEE_EXISTENTE', fase: PHASE.ANTES, required: false, multiple: true, optionalAlways: true, mergePdf: true, accept: 'application/pdf,image/*',
           label: 'Certificado de Eficiencia Energética existente', help: 'El CEE actual de la vivienda, si ya tienes uno. Puede ser un PDF o varias fotos de sus páginas: cuando estén todas, pulsa “Unir en un PDF” para juntarlas en un único documento.' });
    if (want('FOTO_VENTANAS_ANTES', sel.reforma.ventanas)) push({ key: 'FOTO_VENTANAS_ANTES', fase: PHASE.ANTES, required: false, multiple: true, accept: ACCEPT_FOTO, label: 'Ventanas a sustituir (antes)', help: 'Las que vais a cambiar.' });
    if (want('FOTO_CUBIERTA_ANTES', sel.reforma.cubierta)) push({ key: 'FOTO_CUBIERTA_ANTES', fase: PHASE.ANTES, required: false, multiple: true, accept: ACCEPT_FOTO, label: 'Cubierta / tejado (antes)' });
    if (want('FOTO_FACHADA_ANTES', sel.reforma.paredes))  push({ key: 'FOTO_FACHADA_ANTES', fase: PHASE.ANTES, required: false, multiple: true, accept: ACCEPT_FOTO, label: 'Fachada a aislar (antes)' });
    if (want('FOTO_SUELO_ANTES', sel.reforma.suelo))    push({ key: 'FOTO_SUELO_ANTES', fase: PHASE.ANTES, required: false, multiple: true, accept: ACCEPT_FOTO, label: 'Suelo (antes)' });
    if (want('FOTO_ACS_ANTES', sel.changeAcs))        push({ key: 'FOTO_ACS_ANTES', fase: PHASE.ANTES, required: false, multiple: true, accept: ACCEPT_FOTO, label: 'Sistema de ACS actual', help: 'Termo eléctrico o conexión de ACS de la caldera.' });
    push({ key: 'OTROS_ANTES', fase: PHASE.ANTES, required: false, multiple: true, named: true, accept: 'image/*,application/pdf,video/*',
           label: 'Otros (antes de la obra)', help: 'PDF, fotos, vídeos u otros archivos que no encajen en las categorías anteriores. Al subirlos se te pedirá un nombre para guardarlos identificados.' });

    // ───────── DESPUÉS DE LA OBRA ─────────
    push({ key: 'FOTO_UNIDAD_EXTERIOR', fase: PHASE.DESPUES, required: false, multiple: true, accept: ACCEPT_FOTO,
           label: 'Unidad exterior nueva (instalada)', help: 'La máquina nueva que va fuera (en fachada, terraza o patio), ya colocada y conectada.' });
    push({ key: 'FOTO_UNIDAD_EXTERIOR_PLACA', fase: PHASE.DESPUES, required: false, multiple: true, accept: ACCEPT_FOTO,
           label: 'Placa de la unidad exterior', help: 'La etiqueta de datos de la máquina de fuera. Acércate hasta que se lean marca, modelo y número de serie.' });
    push({ key: 'FOTO_UNIDAD_INTERIOR_PLACA', fase: PHASE.DESPUES, required: false, multiple: true, accept: ACCEPT_FOTO,
           label: 'Placa de la unidad interior / DEPOSITO ACS', help: 'La etiqueta de datos de la unidad de dentro o del depósito de agua caliente. Que se lean marca, modelo y número de serie.' });
    if (want('FOTO_ACS_DEPOSITO', sel.changeAcs)) push({ key: 'FOTO_ACS_DEPOSITO', fase: PHASE.DESPUES, required: false, multiple: true, accept: ACCEPT_FOTO,
           label: 'Depósito de ACS / inercia', help: 'El depósito del agua caliente ya instalado. Incluye una foto donde se vea su etiqueta de datos.' });
    push({ key: 'FOTO_CALDERA_DESMONTADA', fase: PHASE.DESPUES, required: false, multiple: true, accept: ACCEPT_FOTO,
           label: sel.hibridacion ? 'Depósito de ACS junto a la caldera antigua' : 'Caldera antigua desmontada / hueco',
           help: sel.hibridacion
               ? 'En una hibridación la caldera antigua se conserva. Haz una foto del nuevo depósito de agua caliente junto a la caldera que se mantiene.'
               : 'La caldera vieja ya retirada, o el hueco que ha quedado en la pared tras quitarla.' });
    if (want('FOTO_VENTANAS_DESPUES', sel.reforma.ventanas)) push({ key: 'FOTO_VENTANAS_DESPUES', fase: PHASE.DESPUES, required: false, multiple: true, accept: ACCEPT_FOTO, label: 'Ventanas nuevas (después)', help: 'Las ventanas nuevas ya instaladas.' });
    if (want('FOTO_CUBIERTA_DESPUES', sel.reforma.cubierta)) push({ key: 'FOTO_CUBIERTA_DESPUES', fase: PHASE.DESPUES, required: false, multiple: true, accept: ACCEPT_FOTO, label: 'Cubierta terminada', help: 'La cubierta o tejado ya terminado tras la obra.' });
    if (want('FOTO_FACHADA_DESPUES', sel.reforma.paredes))  push({ key: 'FOTO_FACHADA_DESPUES', fase: PHASE.DESPUES, required: false, multiple: true, accept: ACCEPT_FOTO, label: 'Aislamiento de fachada terminado', help: 'La fachada ya aislada y terminada.' });
    push({ key: 'VIDEO_REFORMA', fase: PHASE.DESPUES, required: false, multiple: false, accept: ACCEPT_VIDEO, label: 'Vídeo de la reforma (opcional)', help: 'Recorrido en vídeo de la instalación ya terminada.' });
    push({ key: 'DOC_FACTURAS', fase: PHASE.DESPUES, required: false, multiple: true, accept: ACCEPT_DOC, label: 'Facturas de la instalación', help: 'Las facturas de los materiales y de la instalación (en PDF o foto).' });
    push({ key: 'DOC_RITE', fase: PHASE.DESPUES, required: false, multiple: false, accept: ACCEPT_DOC, label: 'Certificado RITE', help: 'Lo emite el instalador: es el certificado de la instalación térmica (RITE) que debe entregar al terminar la obra.' });
    push({ key: 'OTROS_DESPUES', fase: PHASE.DESPUES, required: false, multiple: true, named: true, accept: 'image/*,application/pdf,video/*',
           label: 'Otros (después de la obra)', help: 'PDF, fotos, vídeos u otros archivos que no encajen en las categorías anteriores. Al subirlos se te pedirá un nombre para guardarlos identificados.' });

    // Tras ACEPTAR (ya es expediente), TODA la documentación de ANTES pasa a ser
    // obligatoria (es imprescindible para emitir el CEE inicial / tramitar el CAE).
    // Las de DESPUÉS siguen opcionales hasta que la obra avance (no tiene sentido
    // exigirlas si aún no se ha instalado nada).
    if (datosCalculo.estado === 'ACEPTADA') {
        for (const s of slots) {
            if (s.fase === PHASE.ANTES && !s.optionalAlways) s.required = true;
        }
    }

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
 * Enlace UNIFICADO de subida de documentación/fotos para enviar al cliente.
 * Garantiza el token (idempotente) y devuelve `/subir-docs/:uuid?token=` — la
 * MISMA superficie donde admin valida fotos. Sustituye al antiguo `/firma/:uuid`
 * en todos los avisos al cliente (aceptación, CEE inicial, recordatorios).
 * Si algo falla, cae al enlace `/firma` para no dejar al cliente sin enlace.
 */
async function ensureUploadLink(oportunidadUuid) {
    try {
        const { token } = await attachUploadToken(oportunidadUuid);
        return buildUploadLink(oportunidadUuid, token);
    } catch (e) {
        console.warn('[Docs] ensureUploadLink fallback /firma:', e.message);
        return `${FRONTEND()}/firma/${oportunidadUuid}`;
    }
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

    // Idempotente: si ya tiene token, no lo regeneramos (evita churn que invalidaría
    // el token que el frontend ya tiene en mano → 403 espurios en subida/miniaturas).
    if (opp.datos_calculo?.upload_token) {
        return { token: opp.datos_calculo.upload_token, opp };
    }

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

/** ¿El fichero `fileName` pertenece al slot `slotKey`?
 *   - exacto:        `OTROS_ANTES.pdf`
 *   - numerado:      `OTROS_ANTES_3.jpg`  (slot múltiple legacy)
 *   - con etiqueta:  `OTROS_ANTES__Presupuesto de ventanas.pdf`  (slots `named`)
 * El doble guion bajo separa la clave del slot de la etiqueta legible que el
 * usuario escribió al subir. Ningún slot legacy genera esa forma, así que no
 * colisiona con slots cuya clave sea prefijo de otra (p.ej. FOTO_UNIDAD_EXTERIOR
 * vs FOTO_UNIDAD_EXTERIOR_PLACA, que el sufijo solo-dígitos ya distinguía). */
function fileBelongsToSlot(fileName, slotKey) {
    const base = String(fileName || '').replace(/\.[a-z0-9]+$/i, '');
    if (base === slotKey) return true;
    if (base.startsWith(slotKey + '__')) return true; // etiqueta legible (slots named)
    if (base.startsWith(slotKey + '_')) {
        const rest = base.slice(slotKey.length + 1);
        return /^\d+$/.test(rest); // solo sufijo numérico (_1, _2…); evita colisión con slots más largos
    }
    return false;
}

/**
 * Saneamiento de la etiqueta legible que el usuario da a un documento "Otros".
 * Se conserva tal cual para mostrarla (acentos, espacios, mayúsculas), solo se
 * quitan los caracteres que romperían un nombre de fichero o el separador `__`.
 */
function sanitizeOtrosLabel(label) {
    return String(label || '')
        .replace(/[\\/:*?"<>|\r\n\t]+/g, ' ') // caracteres ilegales en nombres de fichero
        .replace(/_{2,}/g, '_')               // el doble guion bajo es el separador → colápsalo
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80);
}

/** Extrae la etiqueta legible del nombre `slotKey__etiqueta.ext`, o null. */
function parseOtrosLabel(fileName, slotKey) {
    const base = String(fileName || '').replace(/\.[a-z0-9]+$/i, '');
    const sep = slotKey + '__';
    if (!base.startsWith(sep)) return null;
    return base.slice(sep.length) || null;
}

/**
 * Construye el nombre de fichero de un documento "Otros" con etiqueta legible,
 * garantizando que no colisione con los ya presentes en el slot (`prevEntries`).
 * Devuelve solo la base (sin extensión); el llamador añade `.${ext}`.
 */
function buildNamedFileBase(slotKey, label, prevEntries = []) {
    const safe = sanitizeOtrosLabel(label) || 'documento';
    const taken = new Set(
        (prevEntries || [])
            .map(e => String(e?.name || '').replace(/\.[a-z0-9]+$/i, ''))
    );
    let candidate = `${slotKey}__${safe}`;
    if (!taken.has(candidate)) return candidate;
    for (let n = 2; n < 1000; n++) {
        candidate = `${slotKey}__${safe} (${n})`;
        if (!taken.has(candidate)) return candidate;
    }
    return `${slotKey}__${safe} (${Date.now()})`;
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
async function buildDocsView(opp, opts = {}) {
    const dc = opp.datos_calculo || {};
    const checklist = buildDocChecklist(dc);
    const uploads = dc.reforma_uploads || {};
    const overrides = dc.docs_overrides || {}; // { <slot>: { waived: bool } }

    // Listar la carpeta de documentos una sola vez (reconciliación)
    let driveFiles = [];
    let facturasFiles = [];
    try {
        const folderId = dc.drive_folder_id || dc.inputs?.drive_folder_id;
        if (folderId) {
            const subId = await driveService.findSubfolderByName(folderId, SUBCARPETA_DOCS);
            if (subId) driveFiles = await driveService.listFiles(subId);
            // Las FACTURAS viven en su propia carpeta "5. FACTURAS" (unificadas con el
            // alta del admin). Se reconcilian aparte para el slot DOC_FACTURAS.
            // Búsqueda tolerante para no fallar si la carpeta tiene/omite el espacio.
            const factId = await driveService.findSubfolderByNameNormalized(folderId, SUBCARPETA_FACTURAS);
            if (factId) facturasFiles = await driveService.listFiles(factId);
        }
    } catch (e) { console.warn('[Docs] reconciliación Drive:', e.message); }

    const rollupEstado = (source) => {
        if (!source.length) return 'pendiente';
        if (source.some(i => i.estado === 'rechazada')) return 'rechazada';
        if (source.every(i => i.estado === 'validada')) return 'validada';
        return 'subida';
    };

    // IDs de Drive ya "consumidos" por algún slot del checklist → para detectar huérfanos.
    const consumedDriveIds = new Set();

    const slots = checklist.map(s => {
        const dbByName = new Map((uploads[s.key] || []).map(it => [it.name, it]));
        // Las facturas se reconcilian contra "5.FACTURAS"; el resto contra "12. DOCUMENTOS PARA CEE".
        const folderFiles = s.key === 'DOC_FACTURAS' ? facturasFiles : driveFiles;
        const driveForSlot = folderFiles.filter(f => fileBelongsToSlot(f.name, s.key));
        driveForSlot.forEach(f => consumedDriveIds.add(f.id));

        // Si Drive devolvió ficheros del slot, esa es la verdad de existencia;
        // si Drive no respondió (lista vacía por error), caemos a la BD.
        const source = driveForSlot.length > 0
            ? driveForSlot.map(f => {
                const db = dbByName.get(f.name) || {};
                return {
                    name: f.name,
                    label: s.named ? parseOtrosLabel(f.name, s.key) : null,
                    link: f.webViewLink || db.link || null,
                    at: db.at || null,
                    driveId: f.id,
                    thumb: driveThumb(f.id),
                    mimeType: f.mimeType || null,
                    estado: db.estado || 'subida',
                    motivo: db.motivo || null,
                    subido_por: db.subido_por || null
                };
            })
            : (uploads[s.key] || []).map(it => ({
                name: it.name,
                label: s.named ? parseOtrosLabel(it.name, s.key) : null,
                link: it.link, at: it.at,
                driveId: it.driveId || null, thumb: driveThumb(it.driveId),
                mimeType: it.mimeType || null,
                estado: it.estado || 'subida', motivo: it.motivo || null, subido_por: it.subido_por || null
            }));

        // Override del admin: "no necesario" → deja de ser obligatorio (y se marca waived).
        // baseRequired conserva la obligatoriedad original (para reactivar al "volver a pedir").
        const waived = !!overrides[s.key]?.waived;
        return { ...s, baseRequired: !!s.required, required: waived ? false : s.required, waived, estado: rollupEstado(source), items: source };
    });

    // ── Catch-all: archivos en la carpeta de Drive que NO encajan en ningún slot
    // del checklist (fotos legacy, volcados de WhatsApp, slots no aplicables al
    // caso —p.ej. caldera cuando hayCaldera=false—, PDFs sueltos…).
    // Se muestran SIEMPRE, al final de la fase ANTES, para poder revisarlos a
    // golpe de vista. Garantiza que ninguna foto de la carpeta quede invisible.
    const FOLDER_MIME = 'application/vnd.google-apps.folder';
    const leftover = driveFiles.filter(f => !consumedDriveIds.has(f.id) && f.mimeType !== FOLDER_MIME);
    if (leftover.length) {
        const dbByName = new Map((uploads['OTROS_EXISTENTES'] || []).map(it => [it.name, it]));
        const items = leftover.map(f => {
            const db = dbByName.get(f.name) || {};
            return {
                name: f.name,
                label: String(f.name || '').replace(/\.[a-z0-9]+$/i, '') || null,
                link: f.webViewLink || db.link || null,
                at: db.at || null,
                driveId: f.id,
                thumb: driveThumb(f.id),
                mimeType: f.mimeType || null,
                estado: db.estado || 'subida',
                motivo: db.motivo || null,
                subido_por: db.subido_por || null
            };
        });
        slots.push({
            key: 'OTROS_EXISTENTES',
            fase: PHASE.ANTES,
            required: false,
            multiple: true,
            existing: true,
            accept: 'image/*,application/pdf,video/*',
            label: 'Otras fotos y documentos ya aportados',
            help: 'Material que ya está en la carpeta del expediente y no encaja en las casillas anteriores.',
            estado: rollupEstado(items),
            items
        });
    }

    // RITE unificado (reflejo inverso, SOLO admin): si el Certificado RITE está
    // como enlace manual en el expediente (documentacion.cert_rite_drive_link) y el
    // slot DOC_RITE del popup no tiene fichero, marcarlo como "aportado en
    // Documentación" para que también aquí se vea que lo tenemos. No se expone al
    // cliente/instalador (enlace Drive = solo admin, regla RBAC).
    if (opts.includeManualRite) {
        try {
            const { data: exp } = await supabase
                .from('expedientes')
                .select('documentacion')
                .eq('oportunidad_id', opp.id)
                .maybeSingle();
            const docExp = exp?.documentacion || {};
            // RITE manual → chip en el slot DOC_RITE
            const riteLink = docExp.cert_rite_drive_link || null;
            if (riteLink) {
                const riteSlot = slots.find(s => s.key === 'DOC_RITE');
                if (riteSlot && !(riteSlot.items?.length)) riteSlot.externalRite = { link: riteLink };
            }
            // FACTURAS del expediente que NO están ya como fichero en el slot del popup
            // (las añadidas directamente en Documentación, en la carpeta "5.FACTURAS").
            const facturas = Array.isArray(docExp.facturas) ? docExp.facturas : [];
            if (facturas.length) {
                const factSlot = slots.find(s => s.key === 'DOC_FACTURAS');
                if (factSlot) {
                    const haveIds = new Set((factSlot.items || []).map(it => it.driveId).filter(Boolean));
                    const haveLinks = new Set((factSlot.items || []).map(it => it.link).filter(Boolean));
                    const ext = facturas
                        .filter(f => f.drive_link && !haveIds.has(f.drive_id) && !haveLinks.has(f.drive_link))
                        .map((f, i) => ({ link: f.drive_link, label: f.numero_factura ? `Factura ${f.numero_factura}` : `Factura ${i + 1}` }));
                    if (ext.length) factSlot.externalDocs = ext;
                }
            }
        } catch (e) { console.warn('[Docs] reflejo manual RITE/facturas:', e.message); }
    }

    // Catálogo de apartados añadibles + su estado actual (para el botón "Añadir apartado").
    //  - shown: ya está en el checklist (visible para subir)
    //  - enabled: habilitado a mano por override
    //  - hasPhotos: tiene alguna foto subida (no permitir quitarlo si las tiene)
    const addableConcepts = ADDABLE_CONCEPTS.map(c => ({
        id: c.id,
        label: c.label,
        slots: c.slots,
        shown: c.slots.some(k => checklist.some(s => s.key === k)),
        enabled: c.slots.some(k => overrides[k]?.enabled === true),
        hasPhotos: c.slots.some(k => (slots.find(s => s.key === k)?.items?.length > 0)),
    }));

    // Si la oportunidad ya ha sido ACEPTADA es un expediente: en la cabecera
    // mostramos su número de expediente oficial (26RESxxx_NN) en vez del id de
    // oportunidad (..._OPxx). El nombre del cliente ya viaja en `cliente`.
    let numeroExpediente = null;
    if (dc.estado === 'ACEPTADA') {
        try {
            const { data: exp } = await supabase
                .from('expedientes')
                .select('numero_expediente')
                .eq('oportunidad_id', opp.id)
                .maybeSingle();
            numeroExpediente = exp?.numero_expediente || null;
        } catch (e) { console.warn('[Docs] numero_expediente cabecera:', e.message); }
    }

    return {
        id_oportunidad: opp.id_oportunidad,
        numero_expediente: numeroExpediente,
        cliente: opp.referencia_cliente || '',
        aceptada: dc.estado === 'ACEPTADA',
        slots,
        addableConcepts
    };
}

/**
 * Unifica el Certificado RITE: cuando se sube/borra el slot DOC_RITE en el popup,
 * refleja el enlace en expedientes.documentacion.cert_rite_drive_link — el campo que
 * leen el módulo de Documentación, el CIFO y las vistas del lifecycle (el "agente").
 * Background-safe: no lanza, solo loguea. p_value=null limpia el campo.
 */
async function syncRiteToExpediente(oportunidadId, link) {
    try {
        const { error } = await supabase.rpc('set_expediente_doc_field', {
            p_oportunidad_id: oportunidadId,
            p_field: 'cert_rite_drive_link',
            p_value: link || null
        });
        if (error) console.warn('[RITE] sync a expediente:', error.message);
    } catch (e) { console.warn('[RITE] sync a expediente:', e.message); }
}

/**
 * Unifica FACTURAS: al subir un PDF en el slot DOC_FACTURAS del popup, crea una
 * entrada en expedientes.documentacion.facturas[] (Nº/fecha/importe en blanco + PDF
 * enlazado, origen 'popup', drive_id para dedup). Así Documentación la muestra y el
 * agente la cuenta (num_facturas). Idempotente por drive_id. Background-safe.
 */
async function addFacturaToExpediente(oportunidadId, link, driveId) {
    try {
        const factura = { numero_factura: '', fecha_factura: null, importe_sin_iva: 0, drive_link: link, drive_id: driveId, origen: 'popup' };
        const { error } = await supabase.rpc('append_expediente_factura', { p_oportunidad_id: oportunidadId, p_factura: factura });
        if (error) console.warn('[Factura] add a expediente:', error.message);
    } catch (e) { console.warn('[Factura] add a expediente:', e.message); }
}

/** Quita del expediente la factura (origen popup) con ese drive_id. Background-safe. */
async function removeFacturaFromExpediente(oportunidadId, driveId) {
    try {
        if (!driveId) return;
        const { error } = await supabase.rpc('remove_expediente_factura_by_driveid', { p_oportunidad_id: oportunidadId, p_drive_id: driveId });
        if (error) console.warn('[Factura] remove de expediente:', error.message);
    } catch (e) { console.warn('[Factura] remove de expediente:', e.message); }
}

/**
 * Notifica (WhatsApp + email) a quien subió una foto que ha sido RECHAZADA,
 * con el motivo y el enlace para volver a subirla. Background-safe.
 *   subidoPor: 'cliente' | 'instalador' | 'admin'
 */
async function notifyRechazo({ opp, slotLabel, motivo, subidoPor }) {
    const dc = opp.datos_calculo || {};
    const link = buildUploadLink(opp.id, dc.upload_token || '');
    // Lista de destinatarios. Para el instalador puede haber VARIOS interlocutores
    // (partnerNotifyTargets respeta el toggle de notificaciones). Para el cliente, uno.
    let targets = [];

    try {
        if (subidoPor === 'instalador') {
            const insId = opp.instalador_asociado_id || opp.prescriptor_id;
            if (insId) {
                const { data: p } = await supabase.from('prescriptores')
                    .select('razon_social, acronimo, tlf, tlf_contacto, email, email_contacto, nombre_contacto, contacto_notificaciones_activas, contactos_notificacion')
                    .eq('id_empresa', insId).maybeSingle();
                if (p) targets = partnerNotifyTargets(p);
            }
        } else {
            // cliente (también para 'admin'/desconocido: avisamos al cliente por defecto)
            if (opp.cliente_id) {
                const { data: c } = await supabase.from('clientes')
                    .select('nombre_razon_social, tlf, persona_contacto_tlf, email, persona_contacto_email')
                    .eq('id_cliente', opp.cliente_id).maybeSingle();
                if (c) targets = [{
                    nombre: c.nombre_razon_social || '',
                    tlf: c.tlf || c.persona_contacto_tlf || null,
                    email: c.email || c.persona_contacto_email || null,
                }];
            }
        }
    } catch (e) { console.warn('[Reforma] resolviendo contacto rechazo:', e.message); }

    for (const t of targets) {
        const nombre = t.nombre || '';
        const phone = t.tlf, email = t.email;

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
    SUBCARPETA_FACTURAS,
    PHASE,
    ADDABLE_CONCEPTS,
    ADDABLE_SLOT_KEYS,
    getReformaSlots,
    getAerotermiaSlots,
    getLeadSlots,
    getSlotDef,
    isValidSlot,
    fileBelongsToSlot,
    sanitizeOtrosLabel,
    parseOtrosLabel,
    buildNamedFileBase,
    buildDocChecklist,
    buildDocsView,
    syncRiteToExpediente,
    addFacturaToExpediente,
    removeFacturaFromExpediente,
    deriveSelectors,
    driveThumb,
    notifyRechazo,
    generateUploadToken,
    buildUploadLink,
    ensureUploadLink,
    attachUploadToken,
    ensureDriveFolder,
    sendReformaUploadNotifications
};
