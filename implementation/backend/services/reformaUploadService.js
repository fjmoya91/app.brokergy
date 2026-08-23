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
const docsAlcance = require('./docsAlcance');
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
        slots.push({ key: 'DOC_CEE_PREVIO', label: 'Certificado energético previo', help: 'PDF (y los archivos .cex/.xml si los tienes).', accept: ACCEPT_CEE, required: false, multiple: true });
    }
    if (ej) slots.push({ key: 'DOC_CEE_POSTERIOR', label: 'Certificado energético posterior', help: 'El emitido tras la reforma.', accept: ACCEPT_CEE, required: false, multiple: true });
    if (funnel.reforma_facturas === 'si' || ej) slots.push({ key: 'DOC_FACTURAS', label: 'Facturas de la reforma', accept: ACCEPT_DOC, required: false, multiple: true });

    slots.push({ key: 'OTROS', label: 'Otros documentos', help: 'Cualquier otra cosa que quieras aportar.', accept: ACCEPT_CEE, required: false, multiple: true, named: true });
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
    slots.push({ key: 'OTROS', label: 'Otros documentos o fotos', help: 'Cualquier cosa más que quieras aportar.', accept: ACCEPT_DOC, required: false, multiple: true, named: true });
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

// Material que se pide ÚNICAMENTE para que el certificador levante el CEE
// inicial y para cerrar la simulación. Con ese CEE ya REGISTRADO el material
// cumplió su función y el slot DESAPARECE del checklist (ver el final de
// buildDocChecklist): seguir enseñándolo manda al cliente a hacer fotos que
// nadie va a mirar y esconde, entre casillas muertas, lo que sí falta.
//
// El PRESUPUESTO entra aquí: solo manda mientras no hay factura, y a estas
// alturas la inversión que declara el Anexo sale ya de la factura.
// La caldera y su placa NO entran: de ahí salen el Anexo Fotográfico y los
// datos del equipo antiguo del CIFO.
const CEE_CAPTACION_SLOTS = new Set([
    'FOTO_FACHADA_PRINCIPAL',
    'FOTO_PATIOS_INTERIORES',
    'VIDEO_VIVIENDA',
    'DOC_PLANOS',
    'DOC_CEE_EXISTENTE',
    'DOC_PRESUPUESTO',
]);

// Slots cuya foto se sube SIEMPRE a resolución original: son primeros planos de la
// PLACA DE CARACTERÍSTICAS, y de ahí se leen marca, modelo, potencia y nº de serie
// (van al CIFO y al Anexo I). Reducirlas aunque sea un poco puede dejar el serial
// ilegible, así que el redimensionado del navegador las respeta.
//
// ⚠️ NO incluye FOTO_PLACAS_SOLARES: ahí "placas" son los paneles solares, no una
// etiqueta de datos — un `includes('PLACA')` la metería aquí por error.
// FOTO_ACS_DEPOSITO sí entra: su ayuda pide expresamente que se vea la etiqueta.
const FULL_RES_SLOTS = new Set([
    'FOTO_PLACA_CALDERA_ANTES',
    'FOTO_UNIDAD_EXTERIOR_PLACA',
    'FOTO_UNIDAD_INTERIOR_PLACA',
    'FOTO_ACS_DEPOSITO',
]);

// Apartados de foto que el ADMIN puede AÑADIR a un expediente cuando el alcance
// cambia a posteriori (p.ej. añadir ventanas a un RES060 de aerotermia). Cada
// concepto habilita uno o varios slots (antes/después) vía docs_overrides[slot].enabled.
// El backend valida contra esta lista (no se habilita cualquier clave arbitraria).
const ADDABLE_CONCEPTS = [
    { id: 'caldera',  label: 'Caldera actual + su placa (antes)', slots: ['FOTO_CALDERA_ANTES', 'FOTO_PLACA_CALDERA_ANTES'] },
    { id: 'ventanas', label: 'Ventanas (antes y después)', slots: ['FOTO_VENTANAS_ANTES', 'FOTO_VENTANAS_DESPUES'] },
    { id: 'cubierta', label: 'Cubierta / tejado (antes y después)', slots: ['FOTO_CUBIERTA_ANTES', 'FOTO_CUBIERTA_DESPUES'] },
    { id: 'fachada',  label: 'Aislamiento de fachada (antes y después)', slots: ['FOTO_FACHADA_ANTES', 'FOTO_FACHADA_DESPUES'] },
    { id: 'suelo',    label: 'Suelo (antes y después)', slots: ['FOTO_SUELO_ANTES', 'FOTO_SUELO_DESPUES'] },
    { id: 'acs',      label: 'ACS: sistema actual + depósito', slots: ['FOTO_ACS_ANTES', 'FOTO_ACS_DEPOSITO'] },
    { id: 'placas',   label: 'Placas solares (después)', slots: ['FOTO_PLACAS_SOLARES'] },
    { id: 'suelo_radiante', label: 'Armario del suelo radiante (después)', slots: ['FOTO_ARMARIO_SUELO_RADIANTE'] },
    // Unidad terminal de AGUA que NO es suelo radiante (radiadores). Es la pareja
    // del armario de colectores: en la ficha, el emisor existente es quien fija la
    // temperatura de impulsión y con ella el SCOP que se declara, así que hay que
    // poder enseñarlo. Uno u otro, nunca los dos (ver conceptsFromInstalacion).
    { id: 'emisores', label: 'Radiadores / unidad terminal (antes)', slots: ['FOTO_EMISORES_ANTES'] },
    // Calentamiento de agua de piscina (AE_CAP de la ficha TER100). La ficha exige
    // informe fotográfico "antes y después de la instalación de la bomba de calor",
    // y el circuito de piscina es una actuación aparte de la de calefacción/ACS.
    { id: 'piscina', label: 'Piscina: instalación actual + bomba de calor nueva', slots: ['FOTO_PISCINA_ANTES', 'FOTO_PISCINA_BDC'] },
];
const ADDABLE_SLOT_KEYS = new Set(ADDABLE_CONCEPTS.flatMap(c => c.slots));

// ───────────────────────────────────────────────────────────────────────────
// ENVOLVENTE → APARTADOS DE FOTO (RES080)
// ---------------------------------------------------------------------------
// En un RES080 el ALCANCE REAL de la obra lo declara el admin en la pestaña
// Envolvente (`expedientes.documentacion.envolvente`), no la simulación: los
// expedientes migrados de AppSheet o dados de alta por XML no traen
// `inputs.reformaVentanas` ni `landing_funnel.reforma_elementos`, así que el
// checklist se quedaba SIN slots de ventanas/cubierta/fachada — y sin slot no
// hay dónde subir la foto, el Anexo Fotográfico no la recoge (collectPhotoGroups
// deriva sus conceptos del checklist) y la tool MCP responde "no hay fotos".
//
// La Envolvente alimenta el MISMO mecanismo que el botón "Añadir apartado de
// obra" (`docs_overrides[slot].enabled`), así que no hay una segunda fuente de
// verdad que mantener: solo se rellena automáticamente lo que el admin habría
// tenido que marcar a mano.
//
// Solo AÑADE, nunca quita: desmarcar una casilla de la Envolvente no puede
// borrar un apartado que ya tenga fotos subidas. Para quitarlo está el toggle
// del propio "Añadir apartado de obra".
const ENVOLVENTE_CONCEPTS = [
    { conceptId: 'ventanas', test: (e) => e.sustituye_ventanas === true },
    { conceptId: 'cubierta', test: (e) => e.aislamiento_cubierta === true },
    { conceptId: 'fachada',  test: (e) => e.aislamiento_muros === true },
];

/** Ids de ADDABLE_CONCEPTS que la envolvente de un RES080 declara como actuación. */
function conceptsFromEnvolvente(envolvente) {
    const env = envolvente || {};
    return ENVOLVENTE_CONCEPTS.filter(c => c.test(env)).map(c => c.conceptId);
}

/**
 * Ids de ADDABLE_CONCEPTS que declara la pestaña INSTALACIÓN del expediente:
 *   · emisor: la unidad terminal EXISTENTE es la que fija la temperatura de
 *     impulsión y con ella el SCOP declarado, así que se documenta siempre —
 *     con suelo radiante, el armario de colectores; con radiadores, el radiador.
 *     Uno u otro: son el mismo dato visto por sus dos formas. Los emisores
 *     aire-aire de un RES080 (splits/conductos) no entran: esa foto ya es la de
 *     la unidad interior.
 *   · piscina: si el expediente TER100 incluye calentamiento de agua de piscina,
 *     ese circuito es una actuación aparte que hay que documentar antes/después.
 * Ambos los fija el admin en Instalación, después de la simulación.
 */
function conceptsFromInstalacion(instalacion) {
    const inst = instalacion || {};
    const emisor = String(inst.tipo_emisor || '').toLowerCase();
    const ids = [];
    // Solo el SUELO RADIANTE genera apartado propio. Los RADIADORES dejaron de
    // pedirse (2026-08-11): lo que justifica la temperatura de impulsión —y con
    // ella el SCOP declarado— es `instalacion.tipo_emisor`, que ya viaja al CIFO;
    // la foto no añadía nada al expediente y sí una casilla que rellenar. Sigue
    // en ADDABLE_CONCEPTS para que el admin pueda reactivarla si un verificador
    // llega a reclamarla.
    if (emisor === 'suelo_radiante') ids.push('suelo_radiante');
    if (inst.piscina?.activa === true) ids.push('piscina');
    return ids;
}

/**
 * Los mismos apartados que `conceptsFromInstalacion`, pero en forma de
 * `docs_overrides` para poder computarlos ON-READ sin escribir en BD.
 * `syncInstalacionConcepts` los PERSISTE al guardar el expediente; esto permite
 * que el barrido de un expediente que aún no se ha vuelto a guardar ya los vea.
 */
function overridesFromInstalacion(instalacion) {
    const slots = ADDABLE_CONCEPTS
        .filter(c => conceptsFromInstalacion(instalacion).includes(c.id))
        .flatMap(c => c.slots);
    return Object.fromEntries(slots.map(k => [k, { enabled: true }]));
}

/**
 * Habilita en `datos_calculo.docs_overrides` los apartados de foto que declara
 * la Envolvente del expediente. Idempotente y seguro de llamar en cada guardado
 * o antes de generar el anexo (auto-reparación de expedientes migrados).
 *
 * @returns {Promise<string[]>} slots recién habilitados (vacío si no había nada que hacer)
 */
async function syncEnvolventeConcepts(oportunidadUuid, envolvente, datosCalculo = null) {
    return enableConcepts(oportunidadUuid, conceptsFromEnvolvente(envolvente), datosCalculo);
}

/**
 * Igual que `syncEnvolventeConcepts` pero para lo que declara la pestaña
 * Instalación (emisor). Solo añade: cambiar el emisor a radiadores no borra un
 * apartado que ya tenga fotos — para quitarlo está "Añadir apartado de obra".
 */
async function syncInstalacionConcepts(oportunidadUuid, instalacion, datosCalculo = null) {
    return enableConcepts(oportunidadUuid, conceptsFromInstalacion(instalacion), datosCalculo);
}

/** Núcleo común: habilita los slots de esos conceptos que el checklist aún no ofrece. */
async function enableConcepts(oportunidadUuid, conceptIds, datosCalculo = null) {
    if (!oportunidadUuid) return [];
    if (!conceptIds.length) return [];

    // Slots que el concepto pide y que el checklist actual NO ofrece todavía.
    let dc = datosCalculo;
    if (!dc) {
        const { data } = await supabase.from('oportunidades').select('datos_calculo').eq('id', oportunidadUuid).maybeSingle();
        dc = data?.datos_calculo || {};
    }
    // Contra el checklist CON alcance, que es el que se ve de verdad. Con el
    // checklist crudo, un apartado que el alcance poda (p.ej. ACS en un
    // expediente sin ACS) contaba como "ya visible" y el override no se llegaba a
    // escribir: el admin lo añadía y no aparecía nada.
    const yaVisibles = new Set(
        (await checklistForOportunidad({ id: oportunidadUuid, datos_calculo: dc })).map(s => s.key)
    );
    const pendientes = ADDABLE_CONCEPTS
        .filter(c => conceptIds.includes(c.id))
        .flatMap(c => c.slots)
        .filter(k => !yaVisibles.has(k));
    if (!pendientes.length) return [];

    const hechos = [];
    for (const slot of pendientes) {
        const { error } = await supabase.rpc('set_doc_concept_enabled', { p_id: oportunidadUuid, p_slot: slot, p_enabled: true });
        if (error) { console.warn('[Docs] enableConcepts:', slot, error.message); continue; }
        hechos.push(slot);
    }
    if (hechos.length) console.log(`[Docs] Apartados habilitados (${conceptIds.join(', ')}): ${hechos.join(', ')}`);
    return hechos;
}

// Formatos admitidos por el selector de archivos. Generosos: cualquier imagen + PDF
// valen para todas las casillas de foto/documento (el backend NO filtra por formato:
// se comprobó subiendo el mismo fichero como .jpg y como .jpeg — ambos 200).
//
// ⚠️ Las EXTENSIONES van explícitas además del comodín `image/*`. En Windows el
// navegador expande `image/*` consultando el registro, y una extensión sin
// `Content Type` allí aparece EN GRIS en el diálogo de archivos: el usuario no puede
// elegirla aunque el servidor la acepte sin problema. Verificado en la máquina del
// usuario: `.jpeg` sí está mapeada, pero `.webp` y `.heic` NO — y `.heic` es el
// formato por defecto del iPhone, que es de donde vienen casi todas estas fotos.
// Listarlas a mano hace que el selector no dependa del registro.
const EXT_FOTO = '.jpg,.jpeg,.jpe,.jfif,.png,.webp,.heic,.heif,.bmp,.tif,.tiff,.gif,.avif';
const EXT_VIDEO = '.mp4,.mov,.m4v,.3gp,.avi,.mkv,.webm';
const ACCEPT_FOTO = `image/*,${EXT_FOTO},application/pdf,.pdf`;
const ACCEPT_DOC = `application/pdf,.pdf,image/*,${EXT_FOTO}`;
const ACCEPT_VIDEO = `video/*,${EXT_VIDEO}`;
// Slots "Otros" (catch-all): foto, documento o vídeo.
const ACCEPT_CUALQUIERA = `image/*,${EXT_FOTO},application/pdf,.pdf,video/*,${EXT_VIDEO}`;
// CEE: PDF/foto + los ficheros del certificado (.cex/.xml), que no tienen MIME propio.
const ACCEPT_CEE = `application/pdf,.pdf,image/*,${EXT_FOTO},.cex,.xml`;

/**
 * Altas por CALCULADORA (sin funnel): qué aparato da el ACS, deducido del par
 * calefacción/ACS de los inputs. Si los dos apuntan al mismo tipo, es la misma
 * caldera y no hay nada aparte que fotografiar → cadena vacía.
 */
function tipoAcsDesdeInputs(inputs = {}) {
    const acs = String(inputs.boilerAcsType || '').trim().toLowerCase();
    const cal = String(inputs.boilerHeatingType || '').trim().toLowerCase();
    if (!acs || !cal || acs === cal) return '';   // misma caldera (o no consta)
    if (acs.includes('termo')) return 'termo';
    if (acs.includes('butano') || acs.includes('glp') || acs.includes('propano')) return 'butano';
    if (acs.includes('gasoil') || acs.includes('gasóleo') || acs.includes('gasoleo')) return 'gasoleo';
    if (acs.includes('gas')) return 'gas';
    return 'otro';
}

/**
 * Etiquetas del apartado "ACS actual" según QUÉ aparato calienta hoy el agua.
 * Nombrar el aparato es la diferencia entre que el cliente sepa qué fotografiar
 * y que no: "Sistema de ACS actual" no significa nada fuera de una oficina.
 */
const ACS_INICIAL_LABEL = {
    termo:   { label: 'Termo eléctrico actual', help: 'El termo eléctrico que hay hoy instalado.',
               cliente: 'Tu termo eléctrico actual', helpCliente: 'El depósito del agua caliente que tienes ahora, entero. Si tiene una pegatina con los datos, hazle otra foto de cerca.' },
    butano:  { label: 'Calentador de butano / GLP actual', help: 'El calentador de butano o propano que da hoy el agua caliente.',
               cliente: 'Tu calentador de butano', helpCliente: 'El calentador que tienes ahora, con la bombona si está al lado.' },
    solar:   { label: 'Placas solares térmicas actuales', help: 'Los captadores solares y su depósito.',
               cliente: 'Tus placas solares del agua caliente', helpCliente: 'Los paneles del tejado y, si lo ves, el depósito al que van.' },
    gas:     { label: 'Calentador de gas actual', cliente: 'Tu calentador de gas' },
    gasoleo: { label: 'Calentador de gasóleo actual', cliente: 'Tu calentador de gasóleo' },
    otro:    { label: 'Sistema de ACS actual (independiente de la caldera)',
               cliente: 'El aparato que calienta hoy el agua', helpCliente: 'El que da el agua caliente, que no es la caldera de la calefacción.' },
};

/**
 * Normaliza distintas fuentes a selectores de slot, en este orden de prioridad:
 *
 *   1. `datosCalculo.alcance` — lo que declara el EXPEDIENTE (services/docsAlcance).
 *   2. `inputs`               — la simulación del instalador.
 *   3. `landing_funnel`       — las respuestas del funnel del lead.
 *
 * MANDA EL EXPEDIENTE. La oportunidad es el punto de partida: dice lo que se
 * pensaba hacer el día de la simulación, y el expediente lo que se hace de
 * verdad. Un alcance a `null` (el expediente no lo ha declarado todavía) NO es
 * un `false`: solo entonces se cae al escalón siguiente, para que un expediente
 * recién creado no apague apartados que la oportunidad sí pedía.
 */
function deriveSelectors(datosCalculo = {}) {
    const inputs = datosCalculo.inputs || {};
    const funnel = datosCalculo.landing_funnel || {};
    const alc = datosCalculo.alcance || {};

    // Primer valor no-null/undefined de la cascada.
    const pick = (...vals) => { for (const v of vals) if (v !== null && v !== undefined) return v; return undefined; };

    // ── Elementos de ENVOLVENTE ──────────────────────────────────────────────
    // En un RES080 el alcance real lo declara la pestaña Envolvente del
    // expediente; en las fichas de sustitución de caldera (RES060/093/TER100) no
    // hay obra de envolvente que documentar, así que ninguno de estos apartados
    // procede salvo que el admin lo añada a mano.
    const env = alc.envolvente || null;
    const reforma = {
        ventanas: !!pick(env?.ventanas, inputs.reformaVentanas, funnel.reforma_elementos?.ventanas, false),
        cubierta: !!pick(env?.cubierta, inputs.reformaCubierta, funnel.reforma_elementos?.cubierta, false),
        suelo:    !!pick(env?.suelo,    inputs.reformaSuelo,    funnel.reforma_elementos?.suelo,    false),
        paredes:  !!pick(env?.fachada,  inputs.reformaParedes,  funnel.reforma_elementos?.paredes,  false),
        // Las placas solares no son envolvente y no las declara ninguna ficha CAE:
        // siguen saliendo solo de la simulación.
        placas:   !!pick(inputs.reformaPlacas, funnel.reforma_elementos?.placas, false),
    };
    // La ficha de sustitución de caldera no contempla obra de envolvente.
    if (alc.esSustitucionCaldera === true) {
        reforma.ventanas = reforma.cubierta = reforma.suelo = reforma.paredes = false;
    }

    // ── ACS ──────────────────────────────────────────────────────────────────
    // Mismo criterio que el CIFO y las fichas (regla 12.b): fuera de alcance si
    // `cambio_acs === false` o si el equipo nuevo es un termo eléctrico.
    const changeAcs = !!pick(alc.acs, inputs.changeAcs, funnel.incluir_acs, false);

    // ── Unidad terminal ──────────────────────────────────────────────────────
    // El SUELO RADIANTE tiene ARMARIO DE COLECTORES, y esa foto (circuitos,
    // válvulas y conexión con la bomba de calor) no la cubre ningún otro
    // apartado. Los RADIADORES ya no se fotografían: ver conceptsFromInstalacion.
    const emisorTipo = String(pick(alc.emisor, inputs.emitterType, funnel.emisor_tipo, '')).toLowerCase();
    const sueloRadiante = emisorTipo === 'suelo_radiante';

    // ── Piscina (TER100) ─────────────────────────────────────────────────────
    const piscina = alc.piscina === true;

    // ── El GENERADOR DE CALOR que se sustituye ───────────────────────────────
    // Se documenta SIEMPRE que haya calefacción, sea del tipo que sea. Antes esto
    // preguntaba "¿hay caldera de COMBUSTIÓN?" y, si no la había, el expediente
    // se quedaba sin ninguna foto del estado inicial: medido en 26RES080_OP54
    // (radiadores eléctricos) — no se le pedía una sola foto de lo que se iba a
    // sustituir, que es justo lo que justifica el ahorro de un RES080.
    //
    // Solo se calla cuando la vivienda declara que NO tiene calefacción: ahí no
    // hay nada que fotografiar.
    const fuel = String(inputs.fuelType || '').toLowerCase();
    const heating = String(inputs.boilerHeatingType || '');
    const hayCaldera = heating !== 'No tiene Calefacción'
        && funnel.combustible_actual !== 'ninguno'
        && funnel.combustible_actual !== 'sin_calefaccion';

    // ¿Ese generador quema algo (caldera) o es eléctrico (radiadores, acumuladores,
    // splits)? No decide SI se pide la foto, decide CÓMO se le llama: a nadie con
    // radiadores eléctricos hay que pedirle "una foto de su caldera", y menos aún
    // "la caldera vieja ya quitada" cuando nunca tuvo una.
    const calderaEsCombustion = funnel.combustible_actual
        ? BOILER_COMBUSTIBLE.includes(funnel.combustible_actual)
        : (fuel ? !fuel.includes('elect') : true);

    // Hibridación (RES093): la caldera antigua NO se desmonta, se conserva y
    // trabaja en paralelo con la bomba de calor. Cambia el apartado "caldera
    // desmontada" del DESPUÉS por "depósito de ACS junto a la caldera antigua".
    const hibridacion = !!pick(alc.hibridacion, inputs.hibridacion, datosCalculo.hibridacion, false);

    // ── El sistema de ACS EXISTENTE ──────────────────────────────────────────
    // `changeAcs` dice si la ACTUACIÓN toca el ACS; esto dice si hay que
    // documentar el que YA HABÍA, que no es lo mismo. En un RES080 el ahorro se
    // justifica comparando el antes con el después y el ACS entra en esa tabla de
    // emisiones (en 26RES080_OP54: 7,91 → 7,59 kg CO₂/m²), así que el aparato que
    // hay hoy se fotografía aunque la obra no lo sustituya. En una ficha de
    // sustitución de caldera, si el ACS queda fuera del alcance no cambia nada y
    // no se pide (regla 12.b).
    //
    // QUÉ APARATO ES lo dice el paso 5 del funnel (`boiler_acs_type`):
    //   misma_caldera → lo calienta la propia caldera → NO hay foto que hacer,
    //                   la de la caldera ya está pedida más arriba.
    //   termo | butano | solar | gas | gasoleo → es OTRO aparato: sí se pide, y
    //                   se le llama por su nombre ("Tu termo eléctrico actual"),
    //                   porque "sistema de ACS" no le dice nada a nadie.
    //   no_tengo → no hay agua caliente que fotografiar.
    const acsTipo = String(pick(funnel.boiler_acs_type, '')).toLowerCase();
    // El toggle del expediente solo cuenta cuando dice `false` (ver docsAlcance):
    // el `true` es el valor de siembra, no una declaración.
    const acsOtroAparato = alc.acs_misma_caldera === false;
    // Altas por CALCULADORA (sin funnel): que el aparato de ACS no coincida con el
    // de calefacción ya dice que el agua la calienta otra cosa.
    const acsTipoInputs = tipoAcsDesdeInputs(inputs);
    const acsSinAgua = acsTipo === 'no_tengo';
    const acsLoDaLaCaldera = !acsOtroAparato && !acsTipoInputs
        && (acsTipo ? acsTipo === 'misma_caldera' : true);
    const acsInicial = !acsLoDaLaCaldera && !acsSinAgua
        && (changeAcs || alc.ficha === 'RES080' || acsOtroAparato || !!acsTipoInputs
            || (!!acsTipo && acsTipo !== 'misma_caldera'));
    // Nombre del aparato para la etiqueta. Si el expediente contradice al funnel
    // (toggle a "no es la misma caldera"), el tipo del funnel ya no vale: se cae a
    // "otro", que es lo único que se sabe con certeza.
    const acsInicialTipo = (acsOtroAparato && (!acsTipo || acsTipo === 'misma_caldera'))
        ? 'otro'
        : (acsTipo && acsTipo !== 'misma_caldera' ? acsTipo : (acsTipoInputs || ''));

    return { reforma, changeAcs, acsInicial, acsInicialTipo, hayCaldera, calderaEsCombustion, hibridacion, sueloRadiante, piscina };
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
        const comb = sel.calderaEsCombustion;
        push({ key: 'FOTO_CALDERA_ANTES', fase: PHASE.ANTES, required: true, gating: 'pre_aceptacion', multiple: true, accept: ACCEPT_FOTO,
               label: comb ? 'Caldera actual (instalada)' : 'Sistema de calefacción actual',
               help: comb
                   ? 'Vista general de la caldera en su sala. Puedes añadir varias perspectivas.'
                   : 'El equipo de calefacción que se va a sustituir (radiadores eléctricos, acumuladores, splits…), instalado.' });
        push({ key: 'FOTO_PLACA_CALDERA_ANTES', fase: PHASE.ANTES, required: true, gating: 'pre_aceptacion', multiple: true, accept: ACCEPT_FOTO,
               label: comb ? 'Placa de la caldera' : 'Placa del equipo de calefacción',
               help: 'La etiqueta del fabricante. Acércate hasta que se lean marca, modelo y potencia.' });
    }
    // Unidad terminal EXISTENTE con radiadores. YA NO SE PIDE de oficio: la
    // temperatura de impulsión con la que se declara el SCOP la fija
    // `instalacion.tipo_emisor`, que ya viaja al CIFO, y la foto no añadía nada
    // al expediente. Queda como apartado que el admin puede activar a mano
    // ("Añadir apartado de obra") si un verificador llega a reclamarla — de ahí
    // el selector fijo a `false`: solo entra por override.
    if (want('FOTO_EMISORES_ANTES', false)) push({ key: 'FOTO_EMISORES_ANTES', fase: PHASE.ANTES, required: false, multiple: true, accept: ACCEPT_FOTO,
           label: 'Radiadores existentes', help: 'Una foto de un radiador tipo de la vivienda. Es la unidad terminal que se conserva y la que fija la temperatura de impulsión del equipo nuevo.' });
    // ── Lo que define LA ACTUACIÓN va primero ────────────────────────────────
    // El material de CONTEXTO (fachada de la calle, patios, vídeo, planos, CEE,
    // presupuesto) se empuja detrás. Iba delante y el resultado era que en un
    // RES080 de cubierta la foto del tejado caía en el paso 7 de 8, detrás de
    // cuatro cosas opcionales: parecía que no se pedía. Lo que identifica la obra
    // tiene que ser lo primero que se ve.
    if (want('FOTO_ACS_ANTES', sel.acsInicial)) {
        const t = ACS_INICIAL_LABEL[sel.acsInicialTipo] || null;
        push({ key: 'FOTO_ACS_ANTES', fase: PHASE.ANTES, required: false, multiple: true, accept: ACCEPT_FOTO,
               label: t?.label || 'Sistema de ACS actual',
               help: t?.help || 'El termo eléctrico, el acumulador o el calentador que da hoy el agua caliente.' });
    }
    if (want('FOTO_VENTANAS_ANTES', sel.reforma.ventanas)) push({ key: 'FOTO_VENTANAS_ANTES', fase: PHASE.ANTES, required: false, multiple: true, accept: ACCEPT_FOTO, label: 'Ventanas a sustituir (antes)', help: 'Las que vais a cambiar.' });
    if (want('FOTO_CUBIERTA_ANTES', sel.reforma.cubierta)) push({ key: 'FOTO_CUBIERTA_ANTES', fase: PHASE.ANTES, required: false, multiple: true, accept: ACCEPT_FOTO, label: 'Cubierta / tejado (antes)', help: 'El tejado tal y como está hoy, antes de aislarlo.' });
    if (want('FOTO_FACHADA_ANTES', sel.reforma.paredes))  push({ key: 'FOTO_FACHADA_ANTES', fase: PHASE.ANTES, required: false, multiple: true, accept: ACCEPT_FOTO, label: 'Fachada a aislar (antes)' });
    if (want('FOTO_SUELO_ANTES', sel.reforma.suelo))    push({ key: 'FOTO_SUELO_ANTES', fase: PHASE.ANTES, required: false, multiple: true, accept: ACCEPT_FOTO, label: 'Suelo (antes)' });
    // Piscina (TER100): el circuito se declara en la pestaña Instalación, nunca
    // en la simulación — llega por el alcance del expediente o por docs_overrides.
    if (want('FOTO_PISCINA_ANTES', sel.piscina)) push({ key: 'FOTO_PISCINA_ANTES', fase: PHASE.ANTES, required: false, multiple: true, accept: ACCEPT_FOTO, label: 'Calentamiento de piscina actual', help: 'El equipo que calienta hoy el agua de la piscina y su conexión con el circuito.' });

    // ── Material de CONTEXTO (para que el certificador levante el CEE inicial) ──
    push({ key: 'FOTO_FACHADA_PRINCIPAL', fase: PHASE.ANTES, required: false, multiple: true, accept: ACCEPT_FOTO,
           label: 'Fachada de la calle (completa)', help: 'Para ver cuántas ventanas hay y su tamaño.' });
    push({ key: 'FOTO_PATIOS_INTERIORES', fase: PHASE.ANTES, required: false, multiple: true, accept: ACCEPT_FOTO,
           label: 'Patios interiores', help: 'Paredes que dan a patios, con sus ventanas.' });
    push({ key: 'VIDEO_VIVIENDA', fase: PHASE.ANTES, required: false, multiple: false, prescindible: true, accept: ACCEPT_VIDEO,
           label: 'Vídeo recorriendo la vivienda', help: 'Un vídeo corto mostrando estancias, ventanas y accesos al exterior.' });
    push({ key: 'DOC_PLANOS', fase: PHASE.ANTES, required: false, multiple: true, prescindible: true, accept: ACCEPT_DOC,
           label: 'Planos o croquis', help: 'PDF o foto (.pdf, .png, .jpg…). Si no los tienes, con el vídeo nos vale.' });
    // CEE EXISTENTE: el certificado energético actual de la vivienda (si ya lo tiene).
    // optionalAlways → nunca pasa a obligatorio al ACEPTAR (no toda vivienda tiene CEE previo).
    // mergePdf → puede aportarse como PDF directo O como fotos de las páginas; cuando estén
    // todas, el cliente/admin pulsa "Unir en un PDF" y el backend las funde en un único PDF.
    push({ key: 'DOC_CEE_EXISTENTE', fase: PHASE.ANTES, required: false, multiple: true, optionalAlways: true, mergePdf: true, accept: ACCEPT_DOC,
           label: 'Certificado de Eficiencia Energética existente', help: 'El CEE actual de la vivienda, si ya tienes uno. Puede ser un PDF o varias fotos de sus páginas: cuando estén todas, pulsa “Unir en un PDF” para juntarlas en un único documento.' });
    // PRESUPUESTO de la obra. Es la pareja "antes" de DOC_FACTURAS: la inversión que
    // el Anexo declara sale de la FACTURA, pero mientras no la haya el presupuesto es
    // lo que fija el importe de la simulación (y de él se leen ya los equipos).
    // optionalAlways: no toda obra llega con presupuesto formal, y reclamárselo a un
    // cliente que ya tiene la factura no tiene sentido.
    push({ key: 'DOC_PRESUPUESTO', fase: PHASE.ANTES, required: false, multiple: true, optionalAlways: true, accept: ACCEPT_DOC,
           label: 'Presupuesto de la obra', help: 'El presupuesto del instalador (PDF o foto). De él sacamos el importe de la inversión y los equipos previstos.' });
    // `optionalAlways` como su gemelo OTROS_DESPUES: es un cajón de sastre, no un
    // documento con nombre — reclamárselo a nadie ("súbeme otros") no significa nada.
    push({ key: 'OTROS_ANTES', fase: PHASE.ANTES, required: false, multiple: true, named: true, optionalAlways: true, prescindible: true, accept: ACCEPT_CUALQUIERA,
           label: 'Otros (antes de la obra)', help: 'PDF, fotos, vídeos u otros archivos que no encajen en las categorías anteriores. Al subirlos se te pedirá un nombre para guardarlos identificados.' });

    // ───────── DESPUÉS DE LA OBRA ─────────
    push({ key: 'FOTO_UNIDAD_EXTERIOR', fase: PHASE.DESPUES, required: false, multiple: true, accept: ACCEPT_FOTO,
           label: 'Unidad exterior nueva (instalada)', help: 'La máquina nueva que va fuera (en fachada, terraza o patio), ya colocada y conectada.' });
    push({ key: 'FOTO_UNIDAD_EXTERIOR_PLACA', fase: PHASE.DESPUES, required: false, multiple: true, accept: ACCEPT_FOTO,
           label: 'Placa de la unidad exterior', help: 'La etiqueta de datos de la máquina de fuera. Acércate hasta que se lean marca, modelo y número de serie.' });
    // La unidad INTERIOR en sí (no su placa). Existía en el mapa de actuaciones del
    // Anexo y el generador la recogía de Drive, pero el checklist no la emitía: era
    // un slot fantasma, imposible de subir ("Tipo de documento no válido" = el POST
    // no encuentra el slot en el checklist). Nació `optionalAlways` para no añadir
    // exigencias al reactivarlo; se le quitó porque el equipo instalado es justo lo
    // que documenta el Anexo Fotográfico: la app la marcaba como "falta esta foto"
    // y en cambio "solicitar lo que falta" nunca llegaba a pedirla.
    push({ key: 'FOTO_UNIDAD_INTERIOR', fase: PHASE.DESPUES, required: false, multiple: true, accept: ACCEPT_FOTO,
           label: 'Unidad interior / ACS', help: 'La unidad de dentro (split, hidrokit o depósito) ya instalada.' });
    push({ key: 'FOTO_UNIDAD_INTERIOR_PLACA', fase: PHASE.DESPUES, required: false, multiple: true, accept: ACCEPT_FOTO,
           label: 'Placa de la unidad interior / DEPOSITO ACS', help: 'La etiqueta de datos de la unidad de dentro o del depósito de agua caliente. Que se lean marca, modelo y número de serie.' });
    if (want('FOTO_ARMARIO_SUELO_RADIANTE', sel.sueloRadiante)) push({ key: 'FOTO_ARMARIO_SUELO_RADIANTE', fase: PHASE.DESPUES, required: false, multiple: true, accept: ACCEPT_FOTO,
           label: 'Armario del suelo radiante (colectores)', help: 'El armario de colectores abierto: que se vean los circuitos, las válvulas y la conexión con el equipo nuevo.' });
    if (want('FOTO_ACS_DEPOSITO', sel.changeAcs)) push({ key: 'FOTO_ACS_DEPOSITO', fase: PHASE.DESPUES, required: false, multiple: true, accept: ACCEPT_FOTO,
           label: 'Depósito de ACS / inercia', help: 'El depósito del agua caliente ya instalado. Incluye una foto donde se vea su etiqueta de datos.' });
    if (want('FOTO_PISCINA_BDC', sel.piscina)) push({ key: 'FOTO_PISCINA_BDC', fase: PHASE.DESPUES, required: false, multiple: true, accept: ACCEPT_FOTO,
           label: 'Bomba de calor de piscina instalada', help: 'El equipo nuevo de piscina ya montado y conectado. Incluye una foto de su placa de características (marca, modelo y nº de serie).' });
    // El generador antiguo, ya retirado. Solo si había alguno: sin calefacción
    // previa no hay nada que desmontar. Y si lo que había NO era una caldera
    // (radiadores eléctricos, acumuladores…), no se le puede pedir "la caldera
    // vieja" a quien nunca tuvo una.
    if (sel.hayCaldera) push({ key: 'FOTO_CALDERA_DESMONTADA', fase: PHASE.DESPUES, required: false, multiple: true, accept: ACCEPT_FOTO,
           label: sel.hibridacion ? 'Depósito de ACS junto a la caldera antigua'
                 : sel.calderaEsCombustion ? 'Caldera antigua desmontada / hueco'
                 : 'Equipo de calefacción antiguo retirado',
           help: sel.hibridacion
               ? 'En una hibridación la caldera antigua se conserva. Haz una foto del nuevo depósito de agua caliente junto a la caldera que se mantiene.'
               : sel.calderaEsCombustion
                   ? 'La caldera vieja ya retirada, o el hueco que ha quedado en la pared tras quitarla.'
                   : 'El equipo antiguo ya desmontado, o el hueco que ha dejado en la pared.' });
    if (want('FOTO_VENTANAS_DESPUES', sel.reforma.ventanas)) push({ key: 'FOTO_VENTANAS_DESPUES', fase: PHASE.DESPUES, required: false, multiple: true, accept: ACCEPT_FOTO, label: 'Ventanas nuevas (después)', help: 'Las ventanas nuevas ya instaladas.' });
    if (want('FOTO_CUBIERTA_DESPUES', sel.reforma.cubierta)) push({ key: 'FOTO_CUBIERTA_DESPUES', fase: PHASE.DESPUES, required: false, multiple: true, accept: ACCEPT_FOTO, label: 'Cubierta terminada', help: 'La cubierta o tejado ya terminado tras la obra.' });
    if (want('FOTO_FACHADA_DESPUES', sel.reforma.paredes))  push({ key: 'FOTO_FACHADA_DESPUES', fase: PHASE.DESPUES, required: false, multiple: true, accept: ACCEPT_FOTO, label: 'Aislamiento de fachada terminado', help: 'La fachada ya aislada y terminada.' });
    if (want('FOTO_SUELO_DESPUES', sel.reforma.suelo))    push({ key: 'FOTO_SUELO_DESPUES', fase: PHASE.DESPUES, required: false, multiple: true, accept: ACCEPT_FOTO, label: 'Suelo terminado (después)', help: 'El suelo ya aislado y terminado.' });
    if (want('FOTO_PLACAS_SOLARES', sel.reforma.placas))  push({ key: 'FOTO_PLACAS_SOLARES', fase: PHASE.DESPUES, required: false, multiple: true, accept: ACCEPT_FOTO, label: 'Placas solares instaladas', help: 'Las placas fotovoltaicas o solares térmicas ya montadas.' });
    push({ key: 'VIDEO_REFORMA', fase: PHASE.DESPUES, required: false, optionalAlways: true, prescindible: true, multiple: false, accept: ACCEPT_VIDEO, label: 'Vídeo de la reforma (opcional)', help: 'Recorrido en vídeo de la instalación ya terminada.' });
    push({ key: 'DOC_FACTURAS', fase: PHASE.DESPUES, required: false, multiple: true, accept: ACCEPT_DOC, label: 'Facturas de la instalación', help: 'Las facturas de los materiales y de la instalación (en PDF o foto).' });
    // CEE POSTERIOR a la obra. Existía en los slots del enlace público de /reforma
    // (getReformaSlots) pero NO en este checklist, que es contra el que valida el POST
    // de subida: subir aquí el certificado final daba "Tipo de documento no válido".
    // optionalAlways: solo lo tienen las obras ya ejecutadas.
    push({ key: 'DOC_CEE_POSTERIOR', fase: PHASE.DESPUES, required: false, multiple: true, optionalAlways: true, prescindible: true, mergePdf: true, accept: ACCEPT_CEE,
           label: 'Certificado de Eficiencia Energética posterior', help: 'El CEE emitido una vez terminada la reforma (PDF y, si lo tienes, el .xml/.cex).' });
    // Certificado RITE. `optionalAlways` a propósito: lo emite y lo entrega el
    // INSTALADOR (con su habilitación de Industria), no el cliente. Marcárselo
    // como "obligatorio" al cliente es reclamarle un documento que no puede
    // emitir; se le ofrece por si ya lo tiene en la mano, y `aportaInstalador`
    // hace que la UI lo diga en vez de dejarlo como una tarea suya pendiente.
    // A Brokergy se lo pedimos al instalador por su propio canal (parte diario).
    push({ key: 'DOC_RITE', fase: PHASE.DESPUES, required: false, optionalAlways: true, multiple: false, aportaInstalador: true, accept: ACCEPT_DOC,
           label: 'Certificado RITE', help: 'Lo emite el instalador al terminar la obra. Si ya lo tienes, súbelo; si no, no te preocupes: se lo pedimos nosotros directamente.' });
    push({ key: 'OTROS_DESPUES', fase: PHASE.DESPUES, required: false, optionalAlways: true, prescindible: true, multiple: true, named: true, accept: ACCEPT_CUALQUIERA,
           label: 'Otros (después de la obra)', help: 'PDF, fotos, vídeos u otros archivos que no encajen en las categorías anteriores. Al subirlos se te pedirá un nombre para guardarlos identificados.' });

    // Tras ACEPTAR (ya es expediente), la documentación pasa a ser obligatoria:
    //   · ANTES: imprescindible para emitir el CEE inicial / tramitar el CAE.
    //   · DESPUÉS (núcleo técnico): unidades, placas, caldera desmontada, reformas,
    //     facturas y RITE — necesarios para el Anexo Fotográfico y el CIFO. Solo
    //     quedan opcionales los marcados optionalAlways (vídeo, "otros", CEE previo).
    if (datosCalculo.estado === 'ACEPTADA') {
        for (const s of slots) {
            if (!s.optionalAlways) s.required = true;
        }
    }

    // ── El CEE inicial ya registrado cierra el material de CAPTACIÓN ──────────
    // Fachada, patios, vídeo, planos, CEE previo y presupuesto no son
    // documentación del expediente: son el material con el que el certificador
    // levanta el CEE inicial y con el que se cierra la simulación. Una vez ese
    // CEE está REGISTRADO ya cumplieron su función, así que el apartado
    // DESAPARECE — dejarlo visible (aunque fuera como "opcional") llenaba la
    // pantalla del móvil de casillas muertas y escondía lo que sí falta.
    // La caldera y su placa NO entran aquí: de ahí salen el Anexo Fotográfico y
    // los datos del equipo antiguo del CIFO.
    //
    // Lo que ya se hubiera subido a uno de estos apartados NO se pierde: sigue en
    // Drive y `buildDocsView` lo enseña en el cajón "Otras fotos y documentos ya
    // aportados", que lista la carpeta entera.
    //
    // El flag lo pone `docsAlcance` (o el barrido) porque este servicio solo ve
    // la oportunidad, y el estado del CEE vive en el expediente.
    const podados = datosCalculo.cee_inicial_registrado === true
        ? slots.filter(s => !CEE_CAPTACION_SLOTS.has(s.key))
        : slots;

    // El navegador reduce las fotos grandes antes de subirlas (una foto de móvil
    // ronda los 5-12 MB y por una línea normal tarda una eternidad). Los slots de
    // PLACA se marcan para que suban intactas: de ahí se lee el nº de serie.
    for (const s of podados) {
        if (FULL_RES_SLOTS.has(s.key)) s.fullRes = true;
    }

    // Nombre en lenguaje de cliente, junto al técnico (no lo sustituye).
    conLabelCliente(podados);
    // Excepciones que la tabla plana (por clave de slot) no puede expresar, porque
    // dependen de QUÉ hay instalado. Van después de la tabla, pisándola.
    const reetiquetar = (key, label, help) => {
        const s = podados.find(x => x.key === key);
        if (s) { s.labelCliente = label; if (help) s.helpCliente = help; }
    };
    // El ACS inicial se nombra por el aparato que hay (termo, butano, solar…). La
    // tabla LABEL_CLIENTE es plana por slot y no puede expresarlo, así que va aquí.
    if (ACS_INICIAL_LABEL[sel.acsInicialTipo]) {
        const t = ACS_INICIAL_LABEL[sel.acsInicialTipo];
        reetiquetar('FOTO_ACS_ANTES', t.cliente, t.helpCliente);
    }
    if (!sel.calderaEsCombustion) {
        // Calefacción eléctrica: no hay caldera, y llamarla así confunde.
        reetiquetar('FOTO_CALDERA_ANTES', 'Cómo calientas hoy la casa',
            'Los radiadores eléctricos, los acumuladores o los aparatos de aire que usas ahora. Si son varios iguales, con uno basta.');
        reetiquetar('FOTO_PLACA_CALDERA_ANTES', 'La pegatina del aparato de calefacción',
            'La etiqueta con letras y números que lleva pegada. Acércate hasta que se lean.');
        reetiquetar('FOTO_CALDERA_DESMONTADA', 'El aparato viejo, ya retirado',
            'El equipo antiguo ya quitado, o el hueco que ha dejado en la pared.');
    }
    // En una HIBRIDACIÓN la caldera antigua NO se desmonta: se conserva y trabaja
    // en paralelo. Decirle ahí "La caldera vieja, ya quitada" le pediría una foto
    // de algo que no va a pasar. El texto técnico ya lo contempla; aquí hay que
    // repetir la excepción porque la tabla es plana, por clave de slot.
    if (sel.hibridacion) {
        const s = podados.find(x => x.key === 'FOTO_CALDERA_DESMONTADA');
        if (s) {
            s.labelCliente = 'El depósito nuevo, junto a tu caldera de siempre';
            s.helpCliente = 'Tu caldera no se quita: se queda trabajando con la máquina nueva. Haz una foto donde salgan las dos.';
        }
    }

    return podados;
}

// ───────────────────────────────────────────────────────────────────────────
// LENGUAJE DE CASA — cómo se le nombra cada apartado AL CLIENTE.
// ---------------------------------------------------------------------------
// Las etiquetas de `buildDocChecklist` son las TÉCNICAS y no se tocan: con esos
// mismos nombres trabaja el admin y con ellos casan el Anexo Fotográfico y el
// CIFO. Pero "Placa de la unidad interior / DEPOSITO ACS" lo escribió un
// ingeniero: un propietario no sabe qué es una placa, ni un hidrokit, ni la
// inercia. Y el que no entiende lo que se le pide, no sube nada — o sube otra
// cosa y hay que rechazársela.
//
// Aquí vive la traducción. Viaja como `labelCliente` / `helpCliente` y SOLO la
// usa el enlace público; si un slot no está en la tabla, se cae a la etiqueta
// técnica de siempre.
//
// Criterio de redacción:
//   · Se nombra el objeto por lo que el cliente ve, no por su función
//     ("la máquina nueva de fuera", no "unidad exterior").
//   · "Pegatina" en vez de "placa de características": es lo que parece.
//   · Se dice qué hacer, no qué documentar ("acércate hasta que se lean").
//   · Lo que puede saltarse, se dice ("si no lo tienes, no pasa nada").
const LABEL_CLIENTE = {
    // ── ANTES ──
    FOTO_CALDERA_ANTES:        { label: 'Tu caldera actual', help: 'Una foto de la caldera entera, en el sitio donde está puesta. Si puedes, sácala desde un par de ángulos.' },
    FOTO_PLACA_CALDERA_ANTES:  { label: 'La pegatina de la caldera', help: 'La etiqueta con letras y números que lleva pegada. Acércate hasta que se lean bien: de ahí sacamos la marca y el modelo.' },
    FOTO_EMISORES_ANTES:       { label: 'Un radiador de tu casa', help: 'Con uno cualquiera nos vale.' },
    FOTO_FACHADA_PRINCIPAL:    { label: 'Tu casa vista desde la calle', help: 'Apártate lo suficiente para que salga entera, con todas sus ventanas.' },
    FOTO_PATIOS_INTERIORES:    { label: 'Las paredes que dan a un patio', help: 'Si tu casa tiene patio, una foto de cada pared que dé a él.' },
    VIDEO_VIVIENDA:            { label: 'Un vídeo andando por tu casa', help: 'Camina despacio por las habitaciones enseñando las ventanas y las puertas que dan a la calle. Un minuto basta.' },
    DOC_PLANOS:                { label: 'Los planos de tu casa', help: 'Si los tienes a mano. Si no, no pasa nada: con el vídeo nos apañamos.' },
    DOC_CEE_EXISTENTE:         { label: 'El certificado energético de tu casa', help: 'Es el papel con la letra de colores, de la A a la G. Si no lo tienes, sáltalo. Puedes mandarlo en PDF o fotografiar sus hojas.' },
    DOC_PRESUPUESTO:           { label: 'El presupuesto del instalador', help: 'El papel donde te dice lo que cuesta la obra. Vale una foto.' },
    FOTO_ACS_ANTES:            { label: 'Cómo calientas hoy el agua', help: 'El termo eléctrico, o el sitio por donde la caldera calienta el agua de la ducha.' },
    FOTO_VENTANAS_ANTES:       { label: 'Las ventanas de ahora', help: 'Las que vais a cambiar, tal y como están hoy.' },
    FOTO_CUBIERTA_ANTES:       { label: 'El tejado, antes de la obra' },
    FOTO_FACHADA_ANTES:        { label: 'La fachada, antes de aislarla' },
    FOTO_SUELO_ANTES:          { label: 'El suelo, antes de la obra' },
    FOTO_PISCINA_ANTES:        { label: 'Cómo se calienta hoy la piscina', help: 'El aparato que calienta el agua y por dónde va conectado.' },
    OTROS_ANTES:               { label: 'Cualquier otra cosa que quieras mandarnos', help: 'Fotos, papeles o vídeos que no encajen arriba. Te pediremos que le pongas un nombre.' },

    // ── DESPUÉS ──
    FOTO_UNIDAD_EXTERIOR:      { label: 'La máquina nueva de fuera', help: 'La que han colocado en la fachada, la terraza o el patio, ya instalada y conectada.' },
    FOTO_UNIDAD_EXTERIOR_PLACA:{ label: 'La pegatina de la máquina de fuera', help: 'La etiqueta con letras y números. Acércate hasta que se lean: de ahí sale el número de serie, y sin él no podemos tramitar la ayuda.' },
    FOTO_UNIDAD_INTERIOR:      { label: 'La máquina nueva de dentro', help: 'Lo que han puesto dentro de casa: un aparato colgado en la pared o un depósito grande.' },
    FOTO_UNIDAD_INTERIOR_PLACA:{ label: 'La pegatina de la máquina de dentro', help: 'La etiqueta con letras y números del aparato de dentro o del depósito. Que se lean bien.' },
    FOTO_ARMARIO_SUELO_RADIANTE:{ label: 'El armario del suelo radiante, abierto', help: 'El armario empotrado con los tubos y las llaves. Ábrelo para que se vea por dentro.' },
    FOTO_ACS_DEPOSITO:         { label: 'El depósito del agua caliente', help: 'El depósito nuevo ya instalado. Haz también una foto de su pegatina, de cerca.' },
    FOTO_CALDERA_DESMONTADA:   { label: 'La caldera vieja, ya quitada', help: 'La caldera antigua fuera, o el hueco que ha dejado en la pared.' },
    FOTO_PISCINA_BDC:          { label: 'La máquina nueva de la piscina', help: 'El aparato ya montado y conectado. Y otra foto de su pegatina, de cerca.' },
    FOTO_VENTANAS_DESPUES:     { label: 'Las ventanas nuevas, ya puestas' },
    FOTO_CUBIERTA_DESPUES:     { label: 'El tejado, ya terminado' },
    FOTO_FACHADA_DESPUES:      { label: 'La fachada, ya terminada' },
    FOTO_SUELO_DESPUES:        { label: 'El suelo, ya terminado' },
    FOTO_PLACAS_SOLARES:       { label: 'Las placas solares, ya puestas' },
    VIDEO_REFORMA:             { label: 'Un vídeo de cómo ha quedado', help: 'Opcional. Un paseo corto por la instalación terminada.' },
    DOC_FACTURAS:             { label: 'Las facturas de la obra', help: 'En PDF o en papel: si es papel, hazle una foto. Puedes mandarlas todas de una vez.' },
    DOC_CEE_POSTERIOR:         { label: 'El certificado energético nuevo', help: 'El que se hace una vez terminada la obra, si ya lo tienes.' },
    DOC_RITE:                  { label: 'El certificado de la instalación (RITE)', help: 'Es el papel que firma tu instalador al terminar. Si te lo ha dado, súbelo; si no, no te preocupes: se lo pedimos nosotros.' },
    OTROS_DESPUES:             { label: 'Cualquier otra cosa que quieras mandarnos', help: 'Fotos, papeles o vídeos que no encajen arriba. Te pediremos que le pongas un nombre.' },
};

/**
 * Añade a cada slot su nombre en lenguaje de cliente (`labelCliente`/`helpCliente`).
 * No sustituye nada: el frontend elige cuál enseñar según quién esté mirando.
 */
function conLabelCliente(slots) {
    for (const s of slots) {
        const t = LABEL_CLIENTE[s.key];
        if (!t) continue;
        s.labelCliente = t.label;
        // Una entrada sin `help` conserva la ayuda técnica: mejor la de siempre
        // que ninguna. La hibridación cambia el texto de FOTO_CALDERA_DESMONTADA
        // en tiempo de construcción, así que ahí tampoco se pisa.
        if (t.help) s.helpCliente = t.help;
    }
    return slots;
}

/**
 * Checklist de una oportunidad CON el alcance del expediente ya resuelto.
 *
 * Es lo que deben usar las rutas que VALIDAN un slot (subir, borrar, unir en
 * PDF): la vista poda apartados según el expediente, y si la validación se
 * hiciera sobre el checklist "crudo" las dos superficies discreparían — subir a
 * un slot que la vista ya no ofrece respondería 200, y peor aún, un slot podado
 * seguiría siendo un destino válido para quien conserve la URL antigua.
 *
 * `opp` necesita al menos { id, datos_calculo }.
 */
async function checklistForOportunidad(opp) {
    const { datosCalculo } = await docsAlcance.enriquecer(opp);
    return buildDocChecklist(datosCalculo);
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
/**
 * Slots que TIENEN fichero en Drive, mirando "12. DOCUMENTOS PARA CEE".
 *
 * Drive es la fuente de verdad (regla 20). `reforma_uploads` solo se rellena
 * cuando la foto entra por `POST /api/public/reforma-docs/:uuid/:slot`; una foto
 * puede estar en Drive SIN estar en la BD: expedientes migrados, o la skill del
 * Anexo Fotográfico, que clasifica y copia ficheros con el MCP de Drive. En esos
 * casos el anexo y el popup SÍ las veían (ambos reconcilian) pero el barrido no,
 * y seguía pidiendo fotos que ya estaban. Este helper es lo que los iguala.
 *
 * Devuelve un Set de claves de slot. Nunca lanza: sin Drive, Set vacío y el
 * barrido cae al comportamiento anterior (solo BD).
 */
async function driveSlotsPresentes(datosCalculo) {
    const presentes = new Set();
    try {
        const dc = datosCalculo || {};
        const folderId = dc.drive_folder_id || dc.inputs?.drive_folder_id;
        if (!folderId) return presentes;
        const subId = await driveService.findSubfolderByName(folderId, SUBCARPETA_DOCS);
        if (!subId) return presentes;
        const files = await driveService.listFiles(subId);
        if (!files?.length) return presentes;
        for (const s of buildDocChecklist(dc)) {
            if (files.some(f => fileBelongsToSlot(f.name, s.key))) presentes.add(s.key);
        }
    } catch (e) {
        console.warn('[Docs] driveSlotsPresentes:', e.message);
    }
    return presentes;
}

// ───────────────────────────────────────────────────────────────────────────
// APARTADOS ATADOS A LA UNIDAD TERMINAL
// ---------------------------------------------------------------------------
// Cada familia de emisor tiene SU foto y son excluyentes: el suelo radiante
// tiene armario de colectores, los radiadores se ven a simple vista y los
// aire-aire (splits/conductos de un RES080) no tienen ninguna — esa foto ya es
// la de la unidad interior.
//
// El problema es que `syncInstalacionConcepts` habilitaba estos apartados por
// override y el override QUEDA PERSISTIDO: si luego cambia el emisor —o
// simplemente el expediente viene de cuando la foto de radiadores se pedía de
// oficio— el apartado sigue apareciendo en un expediente que no lo necesita.
// Medido sobre 26RES080_63 (emisor `conductos`): pedía el armario del suelo
// radiante, que ahí no existe.
//
// Se retira SOLO si el expediente declara un emisor DISTINTO (un emisor sin
// declarar no decide nada) y SOLO si el apartado está vacío: si alguien llegó a
// subir la foto, se conserva. Para volver a pedirlo está "Añadir apartado de obra".
const SLOT_EMISOR = {
    FOTO_ARMARIO_SUELO_RADIANTE: 'suelo_radiante',
    // Los radiadores ya no se piden de oficio (ver conceptsFromInstalacion); esto
    // barre además el override heredado de cuando sí se pedían.
    FOTO_EMISORES_ANTES: null,
};

/** ¿Este apartado pertenece a un emisor que NO es el de este expediente? */
function emisorDesencaja(slotKey, emisor) {
    if (!(slotKey in SLOT_EMISOR)) return false;
    if (!emisor) return false;                     // no consta → no se decide nada
    return SLOT_EMISOR[slotKey] !== emisor;        // null !== cualquier emisor → siempre desencaja
}

// ---------------------------------------------------------------------------
// Caché de IDs de subcarpeta de Drive.
// ---------------------------------------------------------------------------
// Buscar "12. DOCUMENTOS PARA CEE" dentro de la carpeta del expediente costaba
// ~0,9 s y se repetía en CADA carga de la vista — para devolver siempre lo
// mismo: una subcarpeta se crea una vez y ya no se mueve ni se renombra. Se
// cachea el ID de por vida del proceso.
//
// Solo se cachea el ID, NUNCA el contenido: Drive sigue siendo la fuente de
// verdad de qué ficheros hay (regla 20) y esa lista sí cambia a cada subida.
// Un ID que dejara de valer (carpeta borrada a mano) se descarta al fallar el
// listado, así que el siguiente intento la vuelve a buscar.
const subfolderIdCache = new Map(); // `${folderId}::${nombre}` → id

async function subfolderIdCached(folderId, nombre, normalizado = false) {
    const key = `${folderId}::${nombre}`;
    if (subfolderIdCache.has(key)) return subfolderIdCache.get(key);
    const id = normalizado
        ? await driveService.findSubfolderByNameNormalized(folderId, nombre)
        : await driveService.findSubfolderByName(folderId, nombre);
    if (id) subfolderIdCache.set(key, id); // un null no se cachea: la carpeta puede crearse después
    return id;
}

/** Olvida el ID cacheado de una subcarpeta (si un listado falla, puede haber dejado de existir). */
function olvidarSubfolder(folderId, nombre) {
    subfolderIdCache.delete(`${folderId}::${nombre}`);
}

async function buildDocsView(opp, opts = {}) {
    // El ALCANCE del expediente manda sobre la simulación: qué ficha es, si se
    // toca el ACS, qué unidad terminal hay, qué envolvente se rehabilita y si el
    // CEE inicial ya está registrado. Sin esto la vista pedía material que el
    // expediente ya no necesita. Ver services/docsAlcance.js.
    const { datosCalculo: dc, alcance } = await docsAlcance.enriquecer(opp);
    const checklist = buildDocChecklist(dc);
    const uploads = dc.reforma_uploads || {};
    const overrides = dc.docs_overrides || {}; // { <slot>: { waived: bool } }

    // Reconciliación con Drive. Eran CUATRO llamadas EN SERIE (buscar carpeta +
    // listar, dos veces) ≈ 1,9 s con el cliente mirando una pantalla vacía. Ahora
    // las dos cadenas van EN PARALELO y la búsqueda de carpeta sale de caché.
    // Las FACTURAS viven en su propia carpeta "5. FACTURAS" (unificadas con el
    // alta del admin), de ahí las dos cadenas.
    let driveFiles = [];
    let facturasFiles = [];
    try {
        const folderId = dc.drive_folder_id || dc.inputs?.drive_folder_id;
        if (folderId) {
            const listarSub = async (nombre, normalizado) => {
                const subId = await subfolderIdCached(folderId, nombre, normalizado);
                if (!subId) return [];
                try {
                    return await driveService.listFiles(subId);
                } catch (e) {
                    // El ID cacheado ya no vale (carpeta movida o borrada a mano):
                    // se olvida para que la próxima carga la vuelva a buscar.
                    olvidarSubfolder(folderId, nombre);
                    throw e;
                }
            };
            [driveFiles, facturasFiles] = await Promise.all([
                listarSub(SUBCARPETA_DOCS, false),
                // Búsqueda tolerante: "5. FACTURAS" y "5.FACTURAS" son la misma carpeta.
                listarSub(SUBCARPETA_FACTURAS, true),
            ]);
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

    /** ¿Este apartado tiene ya algún fichero (en Drive o registrado en BD)? */
    const tieneMaterial = (key) => (uploads[key]?.length > 0)
        || driveFiles.some(f => fileBelongsToSlot(f.name, key));

    // Limpieza de apartados heredados que ya no procede pedir.
    // `syncInstalacionConcepts` habilitaba "emisores" automáticamente en todo
    // expediente con radiadores, y ese override quedó persistido en
    // `docs_overrides`. Ahora que la foto de radiadores no se pide, un override
    // antiguo la resucitaría en expedientes que nunca la van a necesitar. Se
    // quita SOLO si está vacía: si alguien llegó a subir la foto, se conserva
    // (nunca escondemos material ya aportado).
    // Apartados PRESCINDIBLES: vídeos, planos, "Otros" y el CEE posterior. No
    // alimentan ningún documento del expediente (el CEE final lo emite NUESTRO
    // certificador, no el cliente) y en un expediente EN CURSO solo alargan la
    // pantalla del móvil con casillas que nadie va a reclamar.
    //
    // Se ocultan SOLO al cliente (`audience: 'cliente'`, que pasa la ruta pública)
    // y SOLO si están vacíos: el admin los conserva —los usa para archivar
    // material suelto— y lo ya subido no se esconde jamás.
    const ocultarPrescindibles = opts.audience === 'cliente' && dc.estado === 'ACEPTADA';

    const checklistVivo = checklist.filter(s => {
        if (emisorDesencaja(s.key, alcance.emisor)) return tieneMaterial(s.key);
        if (ocultarPrescindibles && s.prescindible) return tieneMaterial(s.key);
        return true;
    });

    const slots = checklistVivo.map(s => {
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
            accept: ACCEPT_CUALQUIERA,
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
        shown: c.slots.some(k => checklistVivo.some(s => s.key === k)),
        enabled: c.slots.some(k => overrides[k]?.enabled === true),
        hasPhotos: c.slots.some(k => (slots.find(s => s.key === k)?.items?.length > 0)),
    }));

    return {
        id_oportunidad: opp.id_oportunidad,
        // Con expediente, la cabecera enseña su número oficial (26RESxxx_NN) en vez
        // del id de oportunidad (..._OPxx). Ambos salen ya del alcance resuelto:
        // antes esto costaba una segunda consulta a `expedientes`.
        numero_expediente: alcance.numero_expediente,
        cliente: opp.referencia_cliente || '',
        aceptada: dc.estado === 'ACEPTADA',
        // Fecha en que el cliente/instalador comunicó el fin de obra desde el enlace
        // (null = aún no lo ha hecho) → el botón "He terminado la obra".
        fin_obra: alcance.fin_obra,
        // Contexto de por qué se pide lo que se pide. La UI lo usa para explicar
        // el alcance ("RES060 · sin ACS") en vez de limitarse a enseñar una lista.
        alcance: {
            ficha: alcance.ficha,
            acs: alcance.acs,
            emisor: alcance.emisor,
            cee_inicial_registrado: alcance.cee_inicial_registrado,
        },
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
    FULL_RES_SLOTS,
    getReformaSlots,
    getAerotermiaSlots,
    getLeadSlots,
    getSlotDef,
    isValidSlot,
    fileBelongsToSlot,
    driveSlotsPresentes,
    sanitizeOtrosLabel,
    parseOtrosLabel,
    buildNamedFileBase,
    buildDocChecklist,
    checklistForOportunidad,
    buildDocsView,
    conceptsFromEnvolvente,
    syncEnvolventeConcepts,
    conceptsFromInstalacion,
    overridesFromInstalacion,
    syncInstalacionConcepts,
    CEE_CAPTACION_SLOTS,
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
