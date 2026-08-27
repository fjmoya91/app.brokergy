const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const axios = require('axios');
const supabase = require('../services/supabaseClient');
const { enforceAuth, adminOnly, staffOnly, internalOnly } = require('../middleware/auth');
const { stripDatosCalculoMargin } = require('../utils/financialScrub');
const { getCoordinatesByRC } = require('../services/catastroService');
const { normalizeData } = require('../utils/normalization');
const { unidadesSinSerie, countUnidades: countUnidadesAero } = require('../utils/aerotermiaUnits');
const {
    validateMemoriaRite, resolvePotenciasCatalogo,
    potenciasCatalogoPendientes, situadoEnPendiente, SITUADO_EN_OPCIONES,
    resolveFechasRite, fechaPruebasPendiente
} = require('../utils/riteValidation');
const { resolveFincaInputs } = require('../utils/fincaInputs');
const { resolveInstaladorFirmante } = require('../utils/instaladorFirmante');
const emailService = require('../services/emailService');
const whatsappService = require('../services/whatsappService');
const reformaUploadService = require('../services/reformaUploadService');
const botVinculos = require('../services/botVinculos');
const docsAlcance = require('../services/docsAlcance');
const revisionPendienteNotifier = require('../services/revisionPendienteNotifier');
const recordatorios = require('../services/recordatorios');
const { mergeDocumentacion } = require('../utils/mergeDocumentacion');
const anexoFotograficoService = require('../services/anexoFotograficoService');
const cifoService = require('../services/cifoService');
const { applyStatus, stampSeguimientoTimestamps, markCertContact } = require('../services/seguimientoTracking');
const { partnerNotifyTargets, normalizeContactos } = require('../services/notifyContacts');
const { buildCertClienteData } = require('../services/certClienteData');
const { getCertificadorNombre } = require('../services/certificadorLookup');
const { avanzarEstado } = require('../utils/expedienteEstados');
const { FICHAS } = require('../utils/fichas');
const { syncExpedienteFolderAsync } = require('../services/expedienteFolderSync');

// Qué fichas técnicas pide el CIFO de un expediente (una por MODELO distinto de
// bomba de calor). FUENTE ÚNICA con la app y con cifoService: se importa el módulo
// ESM del frontend, igual que hace cifoService.js con cifoDoc.js. Si esta decisión
// se duplicara aquí, subir a un hueco que el modal ya no enseña respondería 200.
let _fichasTecnicasPromise = null;
function loadFichasTecnicas() {
    if (!_fichasTecnicasPromise) {
        const url = require('url').pathToFileURL(
            require('path').join(__dirname, '../../frontend/src/features/expedientes/logic/fichasTecnicas.js')
        ).href;
        _fichasTecnicasPromise = import(url);
    }
    return _fichasTecnicasPromise;
}

// Qué le falta al INSTALADOR (CIFO por firmar / RITE por registrar) y con qué
// texto se le pide. FUENTE ÚNICA con los dos popups de la app y con la página
// pública del instalador: si se duplicara, el mensaje prometería un documento
// que la página no pide — o al revés.
let _instaladorPendientesPromise = null;
function loadInstaladorPendientes() {
    if (!_instaladorPendientesPromise) {
        const url = require('url').pathToFileURL(
            require('path').join(__dirname, '../../frontend/src/features/expedientes/logic/instaladorPendientes.js')
        ).href;
        _instaladorPendientesPromise = import(url);
    }
    return _instaladorPendientesPromise;
}

// ─── Guard global del módulo Expedientes (INTERNO de Brokergy) ────────────────
// Los expedientes son datos internos: VER y gestionar expedientes está reservado a
// ADMIN y CERTIFICADOR (sus asignados). Los partners (PRESCRIPTOR / INSTALADOR /
// DISTRIBUIDOR) quedan fuera de todo el módulo (lista, detalle, gestión), no solo
// de la UI. Cualquier ruta nueva queda protegida por defecto.
//
// Dos tipos de excepción:
//  1) PÚBLICAS: enlaces firmados de email / acuse del certificador y servido de
//     contenido de ficheros vía Drive. No llevan sesión y validan por su cuenta.
//  2) PARTNER: el único punto donde un partner toca este módulo es "aceptar su
//     oportunidad", que crea el expediente (POST /). El propio handler valida la
//     pertenencia de la oportunidad. NO puede ver ni gestionar el expediente luego.
const PUBLIC_EXPEDIENTE_ROUTES = [
    { method: 'POST', re: /^\/[^/]+\/cert-ack\/?$/ },
    { method: 'GET',  re: /^\/[^/]+\/fichas-tecnicas\/[^/]+\/?$/ },
    { method: 'GET',  re: /^\/[^/]+\/anexos-cifo\/[^/]+\/content\/?$/ },
    { method: 'GET',  re: /^\/[^/]+\/notify-client\/?$/ },
    { method: 'GET',  re: /^\/[^/]+\/approve-cee-from-email\/?$/ },
    // "Abrir carpeta local del expediente": página pública firmada con HMAC que se
    // pincha desde el email de revisión (sin sesión). Su propio handler valida el token.
    { method: 'GET',  re: /^\/[^/]+\/open-local-folder\/?$/ },
    // Anexo fotográfico (generar/estado): su propio middleware (internalKeyOrAuth)
    // exige sesión interna O la clave interna del MCP.
    { method: 'POST', re: /^\/[^/]+\/anexo-fotografico\/generar\/?$/ },
    { method: 'GET',  re: /^\/[^/]+\/anexo-fotografico\/estado\/?$/ },
    // CIFO (generar/estado): mismo patrón: su propio middleware (internalKeyOrAuth)
    // exige sesión interna O la clave interna del MCP.
    { method: 'POST', re: /^\/[^/]+\/cifo\/generar\/?$/ },
    { method: 'GET',  re: /^\/[^/]+\/cifo\/estado\/?$/ },
    // Solicitud de documentación (info + envío WhatsApp/email): también accesible
    // por el MCP con la clave interna (flujo "revisar → pedir al cliente/instalador").
    { method: 'GET',  re: /^\/[^/]+\/solicitud-info\/?$/ },
    { method: 'POST', re: /^\/[^/]+\/solicitar-faltantes\/?$/ },
    // Recordatorio al certificador: mismo patrón. Lo llama la página de acción del
    // parte diario de seguimiento (routes/acciones.js) con la clave interna, para no
    // duplicar el envío ni el sellado del historial. Su middleware es internalKeyOrAuth.
    { method: 'POST', re: /^\/[^/]+\/notify-certificador\/?$/ },
];
const PARTNER_ALLOWED_ROUTES = [
    { method: 'POST', re: /^\/?$/ }, // POST /api/expedientes → aceptar oportunidad (crea expediente)
];
router.use((req, res, next) => {
    const matches = (list) => list.some(r => r.method === req.method && r.re.test(req.path));
    // Públicas y "aceptar oportunidad": dejamos que el middleware propio de cada
    // ruta (ninguno / enforceAuth con check de pertenencia) resuelva el acceso.
    if (matches(PUBLIC_EXPEDIENTE_ROUTES) || matches(PARTNER_ALLOWED_ROUTES)) return next();
    // Resto del módulo: interno (ADMIN / CERTIFICADOR).
    return internalOnly(req, res, next);
});

// ─── Guard mixto: sesión interna O clave interna del MCP ──────────────────────
// Permite el acceso a una ruta tanto al equipo interno (sesión ADMIN/CERTIFICADOR/
// TRABAJADOR) como al servidor MCP (cabecera x-internal-key === INTERNAL_API_KEY).
// Definido aquí arriba (antes que las rutas que lo usan) porque es un `const` y no
// se hoista. Marca req.internalCall = true cuando entra por la clave del MCP.
const internalKeyOrAuth = (req, res, next) => {
    const key = req.headers['x-internal-key'];
    if (key && process.env.INTERNAL_API_KEY && key === process.env.INTERNAL_API_KEY) {
        req.internalCall = true;
        return next();
    }
    return internalOnly(req, res, next);
};

// ─── Ocultar IMPORTES a quien no sea ADMIN ────────────────────────────────────
// Los importes (PRECIO CAE, BENEFICIO BROKERGY, presupuestos…) son SOLO ADMIN.
// El CERTIFICADOR accede al expediente para certificar, pero NO debe ver cifras
// económicas — y no basta con ocultarlas en la UI: hay que sacarlas del payload
// (si no, se ven por DevTools). `datos_calculo` es el estado completo de la
// calculadora y lleva dinero a nivel raíz, en `inputs`, en `result` y en
// `html_propuesta`. Quitamos SOLO las claves de dinero; la energía/demanda
// (surface, Q_net, zona…), la dirección y el estado quedan intactos.
const MONEY_KEYS_DATOS = [
    'caePriceClient', 'caePriceSO', 'caePricePrescriptor', 'prescriptorMode',
    'presupuesto', 'presupuestoEnvolvente', 'presupuestoFotovoltaica',
    'discountCertificates', 'includeCommission', 'includeIrpf', 'includeItp',
    'includeIVA', 'includeLegalization', 'legalizationPrice', 'itpPercent',
    'participation', 'aplicarIrpfCae', 'fuelPrice', 'gastoAnualReal',
    'result', 'html_propuesta',
];
const MONEY_KEYS_INPUTS = [
    'cae_client_rate', 'cae_so_rate', 'cae_prescriptor_rate', 'cae_prescriptor_mode',
    'include_commission', 'discount_certificates', 'certificates_cost',
    'include_legalization', 'legalization_mode', 'presupuesto', 'importe_total',
];
function stripFinancials(exp) {
    if (!exp || typeof exp !== 'object') return exp;
    const out = { ...exp };
    // instalacion: override económico + presupuesto del expediente.
    if (out.instalacion && typeof out.instalacion === 'object') {
        const inst = { ...out.instalacion };
        delete inst.economico_override;
        delete inst.presupuesto_final;
        delete inst.verificacion; // ahorro verificado = base del margen → solo ADMIN
        out.instalacion = inst;
    }
    // datos_calculo: puede venir como objeto anidado en `oportunidades` (detalle)
    // o directamente en la fila (lista RPC). Cubrimos ambos.
    const scrubDatos = (dc) => {
        if (!dc || typeof dc !== 'object') return dc;
        const clean = { ...dc };
        MONEY_KEYS_DATOS.forEach(k => { delete clean[k]; });
        if (clean.inputs && typeof clean.inputs === 'object') {
            const inp = { ...clean.inputs };
            MONEY_KEYS_INPUTS.forEach(k => { delete inp[k]; });
            clean.inputs = inp;
        }
        return clean;
    };
    if (out.oportunidades?.datos_calculo) {
        out.oportunidades = { ...out.oportunidades, datos_calculo: scrubDatos(out.oportunidades.datos_calculo) };
    }
    if (out.datos_calculo) {
        out.datos_calculo = scrubDatos(out.datos_calculo);
    }
    return out;
}

// ─── Ocultar SOLO el MARGEN BROKERGY (para el rol TRABAJADOR) ─────────────────
// El TRABAJADOR opera como ADMIN pero NO debe saber lo que gana Brokergy. A
// diferencia de `stripFinancials` (que quita TODAS las cifras y usa el
// CERTIFICADOR), aquí se CONSERVA lo de cara al cliente (bono CAE del cliente,
// presupuesto de la obra, energía/demanda, propuesta) y se quita únicamente el
// margen: precio CAE de venta al S.O., comisión de prescriptor y beneficio
// Brokergy. Mismas claves que `stripPartnerMargin` de oportunidades.
function stripBrokergyMargin(exp) {
    if (!exp || typeof exp !== 'object') return exp;
    const out = { ...exp };
    // instalacion: override económico manual y ahorro VERIFICADO (base del
    // margen — lleva beneficio Brokergy) → fuera. El presupuesto de la obra
    // (presupuesto_final) es de cara al cliente y se conserva.
    if (out.instalacion && typeof out.instalacion === 'object') {
        const inst = { ...out.instalacion };
        delete inst.economico_override;
        delete inst.verificacion;
        out.instalacion = inst;
    }
    // Capado PROFUNDO del margen en el datos_calculo (raíz y anidado en la
    // oportunidad). Conserva bono del cliente + presupuesto.
    if (out.oportunidades?.datos_calculo) {
        out.oportunidades = { ...out.oportunidades, datos_calculo: stripDatosCalculoMargin(out.oportunidades.datos_calculo) };
    }
    if (out.datos_calculo) out.datos_calculo = stripDatosCalculoMargin(out.datos_calculo);
    return out;
}

// Capa el expediente según el rol del usuario:
//   ADMIN       → completo (ve el margen)
//   TRABAJADOR  → sin margen Brokergy (conserva bono cliente + presupuesto)
//   resto (CERTIFICADOR) → sin ninguna cifra económica
function scrubExpedienteForUser(exp, req) {
    const rol = req.user?.rol_nombre;
    if (rol === 'ADMIN') return exp;
    if (rol === 'TRABAJADOR') return stripBrokergyMargin(exp);
    // CERTIFICADOR (u otros): sin ninguna cifra. Aplicamos también el capado
    // PROFUNDO del margen para que no escape por el snapshot anidado que
    // stripFinancials (borrado plano) no alcanza.
    return stripBrokergyMargin(stripFinancials(exp));
}

// Firma HMAC para el enlace "Dar visto bueno" del email de revisión.
// STATELESS a propósito: NO guardamos el token en `seguimiento` porque el
// autoguardado del módulo (PUT /:id) reemplaza la columna completa desde una copia
// en memoria obsoleta y pisaba el token (race con la subida del .CEX). El endpoint
// recomputa la firma y la compara; la idempotencia (no re-aprobar si ya REVISADO)
// hace innecesario el uso único.
function approveCeeSignature(expId, phase) {
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.JWT_SECRET || 'brokergy-approve-cee';
    return crypto.createHmac('sha256', secret).update(`approve-cee:${expId}:${phase}`).digest('hex');
}
function approveCeeSignatureValid(expId, phase, token) {
    if (!token) return false;
    const expected = approveCeeSignature(expId, phase);
    const a = Buffer.from(String(token));
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Firma HMAC para el enlace público "abrir carpeta local" del email de revisión.
// Evita que se pueda enumerar /open-local-folder para expedientes arbitrarios.
function openFolderSignature(expId) {
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.JWT_SECRET || 'brokergy-open-folder';
    return crypto.createHmac('sha256', secret).update(`open-folder:${expId}`).digest('hex');
}
function openFolderSignatureValid(expId, token) {
    if (!token) return false;
    const expected = openFolderSignature(expId);
    const a = Buffer.from(String(token));
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Resuelve el expediente (por UUID o nº) + el id/enlace de su carpeta raíz de Drive.
// La carpeta vive SIEMPRE dentro de datos_calculo de la oportunidad (JSONB).
// Vive en expedienteFolderSync porque el sincronizador de carpetas por estado la
// necesita también; aquí solo se re-exporta el nombre para no tocar los usos.
const { resolveExpedienteDriveFolder } = require('../services/expedienteFolderSync');

// Reconstruye la ruta LOCAL de Windows (espejo de Google Drive para escritorio) de
// una carpeta de Drive, saneando los nombres como hace Google al espejar.
async function resolveLocalPathFromDriveFolder(driveFolderId) {
    const { getFolderPathSegments, sanitizeWindowsSegment } = require('../services/driveService');
    const rawSegments = await getFolderPathSegments(driveFolderId);
    if (!rawSegments.length) return null;
    const segments = rawSegments.map(sanitizeWindowsSegment);
    const base = (process.env.LOCAL_DRIVE_BASE || 'C:\\Users\\Usuario\\Mi unidad').replace(/[\\/]+$/, '');
    return { path: [base, ...segments].join('\\'), segments, folderName: segments[segments.length - 1] };
}


// ─── Helpers de notificación CEE registrado ───────────────────────────────────
// Extraídos de los IIFE async dentro de PUT /:id para que también se puedan
// re-disparar manualmente desde POST /:id/resend-cee-notifications.

async function loadNotificationContext(expediente) {
    const [{ data: cli }, { data: op }] = await Promise.all([
        supabase.from('clientes').select('*').eq('id_cliente', expediente.cliente_id).single(),
        supabase.from('oportunidades').select('*').eq('id', expediente.oportunidad_id).single()
    ]);

    let techName = 'Técnico no asignado';
    const certId = expediente.cee?.certificador_id;
    if (certId) {
        const { data: certData } = await supabase.from('prescriptores').select('razon_social').eq('id_empresa', certId).maybeSingle();
        if (certData?.razon_social) techName = certData.razon_social;
    }

    let partnerPhone = null;
    let partnerEmail = null;
    // Preferimos el INSTALADOR asociado de la obra; si no, el prescriptor genérico.
    const partnerId = op?.instalador_asociado_id || op?.prescriptor_id;
    if (partnerId && String(partnerId) !== '1') {
        // OJO: prescriptores NO tiene columnas `telefono`/`movil` — seleccionarlas hace
        // que supabase-js devuelva error y pData=null (el partner se quedaba sin avisar).
        const { data: pData } = await supabase.from('prescriptores')
            .select('tlf, tlf_contacto, landing_telefono_contacto, email, email_contacto, nombre_contacto, contacto_notificaciones_activas')
            .eq('id_empresa', partnerId).maybeSingle();
        if (pData) {
            const useContact = pData.contacto_notificaciones_activas === true || pData.contacto_notificaciones_activas === 'true';
            partnerPhone = (useContact ? (pData.tlf_contacto || pData.tlf) : (pData.tlf || pData.tlf_contacto)) || pData.landing_telefono_contacto || null;
            partnerEmail = (useContact ? (pData.email_contacto || pData.email) : (pData.email || pData.email_contacto)) || null;
        }
    }

    return { cli, op, techName, partnerPhone, partnerEmail };
}

// Construye los textos de WhatsApp de la notificación de "CEE registrado", por
// destinatario (CLIENTE / PARTNER / ADMIN). Lo usan el envío y la PREVISUALIZACIÓN
// (POST resend-cee-notifications con preview:true) → única fuente de verdad.
// Nota: el email del cliente/staff se envía con su plantilla HTML; estos textos son
// los del canal WhatsApp (y los que se muestran en el preview).
function buildCeeRegistradoMessages(phase, { numExp, clienteName, clienteFull, portalLink, expedienteLink }) {
    if (phase === 'final') {
        const clientMsg = `¡Hola *${clienteName}*!\n\nTe comunicamos que ya ha sido presentado el *Certificado de Eficiencia Energética FINAL* de tu expediente *${numExp}*.\n\n¡Muchas gracias!\n*BROKERGY — Ingeniería Energética*`;
        const staffMsg = `✅ *REGISTRO CEE FINAL PRESENTADO*\nExpediente: ${numExp}\nCliente: ${clienteFull}\n\nSe ha subido el justificante de registro del CEE Final al sistema.\n\nVer expediente:\n🔗 ${expedienteLink}`;
        return { CLIENTE: clientMsg, PARTNER: staffMsg, ADMIN: staffMsg };
    }
    // ── CEE INICIAL ──
    const clientMsg = `¡Hola *${clienteName}*!\n\nTe escribimos para comunicarte que ya ha sido presentado el *Certificado de Eficiencia Energética INICIAL* de tu expediente *${numExp}*.\n\n*Desde este momento ya se pueden emitir facturas y pagos*\n\n📸 Recuerda hacerle fotografías a todo:\n• *Caldera existente y placa de fabricación.*\n• *Desmontaje de la caldera.*\n• *Montaje de la aerotermia.*\n• *Fotos de las nuevas placas de fabricación* (tanto de la unidad exterior como de la interior).\n\nLas fotos son la parte más importante del proceso para que podamos argumentar ante el ministerio que se ha realizado la reforma.\n\nPuedes subirlas directamente al expediente a través de este enlace:\n🔗 ${portalLink}\n\nUna vez finalizada la obra, debes comunicárnoslo por aquí para proceder con el CEE Final y el resto de la documentación.\n\n📄 Y cuando quieras, puedes *consultar el estado de tu expediente* y el bono que cobrarás aquí:\n🔗 ${(portalLink || '').replace('/subir-docs/', '/mi-expediente/')}\n\n¡Muchas gracias!\n*BROKERGY — Ingeniería Energética*`;
    const staffMsg = `✅ *REGISTRO CEE INICIAL PRESENTADO*\nExpediente: ${numExp}\nCliente: ${clienteFull}\n\nSe ha subido el justificante de registro del CEE Inicial al sistema. Desde este momento ya se pueden emitir facturas y pagos.\n\nVer expediente:\n🔗 ${expedienteLink}`;
    // Mensaje específico para el INSTALADOR: además de avisar, le pedimos las fotos
    // de la obra terminada y la factura, con el enlace de subida acotado a su rol.
    const installerLink = portalLink
        ? `${portalLink}${portalLink.includes('?') ? '&' : '?'}rol=instalador`
        : expedienteLink;
    const partnerMsg = `✅ *CEE INICIAL REGISTRADO* — Expediente ${numExp}\nObra: ${clienteFull}\n\nYa está presentado el CEE Inicial: ya se pueden emitir facturas y pagos. 🎉\n\nPara poder seguir tramitando el expediente necesitamos que nos subas:\n\n📸 *Fotos de la obra terminada* (unidad exterior e interior ya instaladas y sus placas de fabricación).\n🧾 *Factura(s)* de la instalación.\n\nPuedes subirlo de forma rápida y sencilla aquí:\n🔗 ${installerLink}\n\n¡Gracias!\n*BROKERGY — Ingeniería Energética*`;
    return { CLIENTE: clientMsg, PARTNER: partnerMsg, ADMIN: staffMsg };
}

async function notifyCeeInicialRegistrado(expediente, filters = {}) {
    const targets  = filters.targets  || ['CLIENTE', 'PARTNER', 'ADMIN'];
    const chFilter = filters.channels || ['email', 'whatsapp'];
    const tag = `[CEE-INICIAL ${expediente.id}]`;
    try {
        const { cli, op, techName, partnerPhone, partnerEmail } = await loadNotificationContext(expediente);
        if (!cli) {
            console.warn(`${tag} cliente_id=${expediente.cliente_id} no encontrado, abortando notificaciones`);
            return { ok: false, reason: 'cliente-not-found' };
        }

        const numExp = expediente.numero_expediente || op?.id_oportunidad || expediente.id;
        const clienteName = (cli.nombre_razon_social || 'Cliente').trim();
        const clienteFull = `${cli.nombre_razon_social || ''} ${cli.apellidos || ''}`.trim();
        const ubicacion = `${cli.direccion || ''} - ${cli.codigo_postal || ''} ${cli.municipio || ''} (${cli.provincia || ''})`;
        // Enlace UNIFICADO de subida de fotos/docs (/subir-docs/:uuid?token=)
        const portalLink = op?.id
            ? await reformaUploadService.ensureUploadLink(op.id)
            : `https://app.brokergy.es/firma/${expediente.id}`;
        const expedienteLink = `https://app.brokergy.es/?exp=${expediente.id}`;

        const waState = whatsappService.getStatus?.()?.state || 'unknown';
        const cliPhone = (cli.notificaciones_contacto_activas && cli.persona_contacto_tlf) ? cli.persona_contacto_tlf : cli.tlf;
        console.log(`${tag} Disparando notificaciones (targets=[${targets}], channels=[${chFilter}], wa=${waState})`);

        const channels = { whatsapp: [], email: [] };

        // Textos por destinatario (compartidos con la previsualización). El admin puede
        // sobrescribirlos desde el modal de reenvío (filters.overrides).
        const msgs = buildCeeRegistradoMessages('inicial', { numExp, clienteName, clienteFull, portalLink, expedienteLink });
        const overrides = filters.overrides || {};
        if (filters.preview) return { ok: true, preview: msgs };
        const clientMsg = overrides.CLIENTE || msgs.CLIENTE;
        const adminMsg  = overrides.ADMIN  || msgs.ADMIN;
        const partnerMsg = overrides.PARTNER || msgs.PARTNER;

        // --- WHATSAPP ---
        if (chFilter.includes('whatsapp')) {
            if (targets.includes('CLIENTE') && cliPhone) {
                channels.whatsapp.push('cliente');
                // Cada aviso que ya se manda le enseña al bot de WhatsApp de qué
                // obra habla este chat. Es la pista más débil de las tres y la
                // más abundante: no cuesta nada y va en diferido.
                botVinculos.sembrarEnDiferido(cliPhone, expediente.oportunidad_id);
                whatsappService.sendText(cliPhone, clientMsg)
                    .catch(e => console.error(`${tag} WhatsApp Cliente:`, e.message));
            } else if (targets.includes('CLIENTE') && !cliPhone) {
                console.warn(`${tag} Cliente sin teléfono, no se envía WhatsApp`);
            }

            if (targets.includes('ADMIN')) {
                const adminPhone = process.env.WHATSAPP_ADMIN_CHAT || '34623926179';
                channels.whatsapp.push('admin');
                whatsappService.sendText(adminPhone, adminMsg)
                    .catch(e => console.error(`${tag} WhatsApp Admin:`, e.message));
            }

            if (targets.includes('PARTNER') && partnerPhone) {
                channels.whatsapp.push('partner');
                botVinculos.sembrarEnDiferido(partnerPhone, expediente.oportunidad_id);
                whatsappService.sendText(partnerPhone, partnerMsg)
                    .catch(e => console.error(`${tag} WhatsApp Partner:`, e.message));
            }
        }

        // --- EMAIL ---
        if (chFilter.includes('email')) {
            if (targets.includes('CLIENTE') && cli.email) {
                channels.email.push('cliente');
                await emailService.sendCeeInicialRegistradoClientEmail(cli.email, clienteName, numExp, portalLink)
                    .catch(e => console.error(`${tag} Email Cliente:`, e.message));
            }
            if (targets.includes('ADMIN')) {
                channels.email.push('admin');
                await emailService.sendCeeRegistradoStaffEmail('franciscojavier.moya.s2e2@gmail.com', false, numExp, clienteFull, ubicacion, techName, 'CEE INICIAL', expedienteLink)
                    .catch(e => console.error(`${tag} Email Admin:`, e.message));
            }
            if (targets.includes('PARTNER') && partnerEmail) {
                channels.email.push('partner');
                await emailService.sendCeeRegistradoStaffEmail(partnerEmail, true, numExp, clienteFull, ubicacion, techName, 'CEE INICIAL', expedienteLink)
                    .catch(e => console.error(`${tag} Email Partner:`, e.message));
            }
        }

        console.log(`${tag} Disparado: whatsapp=[${channels.whatsapp.join(',')}] email=[${channels.email.join(',')}]`);
        return { ok: true, whatsappState: waState, channels };
    } catch (err) {
        console.error(`${tag} Error en notificaciones:`, err);
        return { ok: false, reason: err.message };
    }
}

async function notifyCeeFinalRegistrado(expediente, filters = {}) {
    const targets  = filters.targets  || ['CLIENTE', 'PARTNER', 'ADMIN'];
    const chFilter = filters.channels || ['email', 'whatsapp'];
    const tag = `[CEE-FINAL ${expediente.id}]`;
    try {
        const { cli, op, techName, partnerPhone, partnerEmail } = await loadNotificationContext(expediente);
        if (!cli) {
            console.warn(`${tag} cliente_id=${expediente.cliente_id} no encontrado, abortando notificaciones`);
            return { ok: false, reason: 'cliente-not-found' };
        }

        const numExp = expediente.numero_expediente || op?.id_oportunidad || expediente.id;
        const clienteName = (cli.nombre_razon_social || 'Cliente').trim();
        const clienteFull = `${cli.nombre_razon_social || ''} ${cli.apellidos || ''}`.trim();
        const ubicacion = `${cli.direccion || ''} - ${cli.codigo_postal || ''} ${cli.municipio || ''} (${cli.provincia || ''})`;
        const expedienteLink = `https://app.brokergy.es/?exp=${expediente.id}`;

        const waState = whatsappService.getStatus?.()?.state || 'unknown';
        const cliPhone = (cli.notificaciones_contacto_activas && cli.persona_contacto_tlf) ? cli.persona_contacto_tlf : cli.tlf;
        console.log(`${tag} Disparando notificaciones (targets=[${targets}], channels=[${chFilter}], wa=${waState})`);

        const channels = { whatsapp: [], email: [] };

        // Textos por destinatario (compartidos con la previsualización) + overrides del admin.
        const msgs = buildCeeRegistradoMessages('final', { numExp, clienteName, clienteFull, portalLink: null, expedienteLink });
        const overrides = filters.overrides || {};
        if (filters.preview) return { ok: true, preview: msgs };
        const clientMsg = overrides.CLIENTE || msgs.CLIENTE;
        const adminMsg  = overrides.ADMIN  || msgs.ADMIN;
        const partnerMsg = overrides.PARTNER || msgs.PARTNER;

        // --- WHATSAPP ---
        if (chFilter.includes('whatsapp')) {
            if (targets.includes('CLIENTE') && cliPhone) {
                channels.whatsapp.push('cliente');
                whatsappService.sendText(cliPhone, clientMsg)
                    .catch(e => console.error(`${tag} WhatsApp Cliente:`, e.message));
            } else if (targets.includes('CLIENTE') && !cliPhone) {
                console.warn(`${tag} Cliente sin teléfono, no se envía WhatsApp`);
            }

            if (targets.includes('ADMIN')) {
                const adminPhone = process.env.WHATSAPP_ADMIN_CHAT || '34623926179';
                channels.whatsapp.push('admin');
                whatsappService.sendText(adminPhone, adminMsg)
                    .catch(e => console.error(`${tag} WhatsApp Admin:`, e.message));
            }

            if (targets.includes('PARTNER') && partnerPhone) {
                channels.whatsapp.push('partner');
                whatsappService.sendText(partnerPhone, partnerMsg)
                    .catch(e => console.error(`${tag} WhatsApp Partner:`, e.message));
            }
        }

        // --- EMAIL ---
        if (chFilter.includes('email')) {
            if (targets.includes('ADMIN')) {
                channels.email.push('admin');
                await emailService.sendCeeRegistradoStaffEmail('franciscojavier.moya.s2e2@gmail.com', false, numExp, clienteFull, ubicacion, techName, 'CEE FINAL', expedienteLink)
                    .catch(e => console.error(`${tag} Email Admin:`, e.message));
            }
            if (targets.includes('PARTNER') && partnerEmail) {
                channels.email.push('partner');
                await emailService.sendCeeRegistradoStaffEmail(partnerEmail, true, numExp, clienteFull, ubicacion, techName, 'CEE FINAL', expedienteLink)
                    .catch(e => console.error(`${tag} Email Partner:`, e.message));
            }
        }

        console.log(`${tag} Disparado: whatsapp=[${channels.whatsapp.join(',')}] email=[${channels.email.join(',')}]`);
        return { ok: true, whatsappState: waState, channels };
    } catch (err) {
        console.error(`${tag} Error en notificaciones:`, err);
        return { ok: false, reason: err.message };
    }
}


// ─── Alertas: CEE entregados y sin revisar ───────────────────────────────────
// El certificador factura al ENTREGAR, no al revisar. Estas dos rutas exponen lo
// que el vigilante (`revisionPendienteNotifier`) manda cada día por WhatsApp y
// email, para poder consultarlo en la app y para probar el aviso a demanda.

// GET /api/expedientes/alertas/revision-pendiente?dias=2
router.get('/alertas/revision-pendiente', staffOnly, async (req, res) => {
    try {
        const dias = req.query.dias !== undefined ? Number(req.query.dias) : undefined;
        if (dias !== undefined && (!Number.isFinite(dias) || dias < 0)) {
            return res.status(400).json({ error: 'El umbral de días no es válido.' });
        }
        const pendientes = await revisionPendienteNotifier.pendientesDeRevision(dias);
        res.json({ umbral_dias: dias ?? revisionPendienteNotifier.DIAS_UMBRAL, total: pendientes.length, pendientes });
    } catch (err) {
        console.error('[GET alertas/revision-pendiente]', err);
        res.status(500).json({ error: err.message || 'No se pudieron calcular los CEE pendientes de revisión' });
    }
});

// POST /api/expedientes/alertas/revision-pendiente/enviar
// Fuerza el aviso ahora (salta el guard de "una vez al día" y la franja horaria).
router.post('/alertas/revision-pendiente/enviar', adminOnly, async (req, res) => {
    try {
        const out = await revisionPendienteNotifier.comprobarYAvisar({ force: true });
        res.json(out);
    } catch (err) {
        console.error('[POST alertas/revision-pendiente/enviar]', err);
        res.status(500).json({ error: err.message || 'No se pudo enviar el aviso' });
    }
});

// ─── GET /api/expedientes ─────────────────────────────────────────────────────
// Lista todos los expedientes usando RPC (1 sola query con JOIN en BD, sin documentacion)
router.get('/', enforceAuth, async (req, res) => {
    try {
        // El guard global del módulo ya garantiza que aquí solo llegan ADMIN,
        // TRABAJADOR y CERTIFICADOR (los expedientes son internos de Brokergy).
        const rol = req.user.rol_nombre;
        const canViewAll   = rol === 'ADMIN' || rol === 'TRABAJADOR';
        const isCertificador = rol === 'CERTIFICADOR';

        // RPC: un solo JOIN en BD — evita 3 round-trips y el timeout por documentacion pesada.
        // v3 (2026-07-22) además NO trae el XML crudo del CEE ni los blobs anidados de
        // `datos_calculo.inputs`, y ya devuelve agregados los contadores de incidencias:
        // el payload bajó de 21 MB a 1,7 MB y se eliminó un segundo query que recorría
        // toda la tabla. Ver scripts/get_expedientes_list_v3.sql.
        const { data: rpcData, error: rpcErr } = await supabase.rpc('get_expedientes_list_v3');
        if (rpcErr) throw rpcErr;

        let data = rpcData || [];

        // ── Filtros por rol ──────────────────────────────────────────────────
        if (isCertificador) {
            if (!req.user.prescriptor_id) return res.json([]);
            data = data.filter(r => String(r.cee?.certificador_id) === String(req.user.prescriptor_id));
        }

        // Capado de cifras por rol: ADMIN completo; TRABAJADOR sin margen
        // Brokergy; CERTIFICADOR sin ninguna cifra económica.
        if (rol !== 'ADMIN') {
            data = data.map(r => scrubExpedienteForUser(r, req));
        }

        // Contador de incidencias ABIERTAS por expediente (el badge rojo neón del listado).
        // Lo agrega ya la RPC: antes esto era un segundo query `select('id,
        // documentacion->incidencias')` SIN filtro, y para leer ese subcampo Postgres
        // descomprimía la columna `documentacion` ENTERA de todas las filas — 1,5 s de
        // media y una de las causas de las caídas del 21/07. Aquí solo se capa por rol:
        // las incidencias son cosa del equipo interno, el certificador no las ve.
        if (!canViewAll) {
            data = data.map(({ incidencias_abiertas, incidencias_graves_abiertas, ...r }) => r);
        }

        res.json(data);
    } catch (err) {
        console.error('Error GET expedientes (RPC):', err);
        res.status(500).json({ error: 'Error al recuperar expedientes', details: err.message });
    }
});

// ─── GET /api/expedientes/:id ─────────────────────────────────────────────────
router.get('/:id', enforceAuth, async (req, res) => {
    try {
        // Obtenemos solo el expediente primero (sin JOINs para evitar errores de ambiguedad de claves foráneas)
        const { data: simple, error } = await supabase
            .from('expedientes')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error || !simple) return res.status(404).json({ error: 'Expediente no encontrado' });

        // Control de acceso: ADMIN y TRABAJADOR ven todo; el CERTIFICADOR solo los
        // expedientes que tiene asignados (mismo criterio que el listado). Los
        // partners ya quedaron fuera por el guard global del módulo.
        if (req.user.rol_nombre !== 'ADMIN' && req.user.rol_nombre !== 'TRABAJADOR') {
            const ownsIt = String(simple.cee?.certificador_id) === String(req.user.prescriptor_id);
            if (!ownsIt) {
                console.warn(`[Expedientes] Acceso denegado a ${req.user.rol_nombre} (${req.user.prescriptor_id}) sobre expediente ${req.params.id}`);
                return res.status(403).json({ error: 'No autorizado para ver este expediente' });
            }
        }

        // Recuperamos los datos relacionados
        const [{ data: cli }, { data: op }] = await Promise.all([
            supabase.from('clientes').select('*').eq('id_cliente', simple.cliente_id).single(),
            supabase.from('oportunidades').select('id, id_oportunidad, referencia_cliente, ficha, ref_catastral, datos_calculo, demanda_calefaccion, prescriptor_id').eq('id', simple.oportunidad_id).single()
        ]);

        // Recuperamos el instalador asignado (desde Instalacion o el genérico de Oportunidades)
        let assignedPrescriptor = null;
        // Instalador que FIRMA los documentos técnicos. Solo se rellena cuando el
        // asignado no está habilitado en Industria y delega en otro: los
        // generadores (CIFO, RES080, RITE) usan este; los envíos y la atribución
        // comercial siguen usando `prescriptores`. Ver utils/instaladorFirmante.js.
        let firmantePrescriptor = null;
        const targetInstId = simple.instalacion?.instalador_id || op?.prescriptor_id;

        if (targetInstId) {
            const { data: presInfo } = await supabase
                .from('prescriptores')
                .select('*')
                .eq('id_empresa', targetInstId)
                .single();
            if (presInfo) assignedPrescriptor = presInfo;
            const r = await resolveInstaladorFirmante(assignedPrescriptor, supabase);
            if (r.delegado) firmantePrescriptor = r.firmante;
        }

        // Lote al que pertenece el expediente (solo-lectura en la ficha): SO y Verificador.
        let lote = null;
        if (simple.lote_id) {
            const { data: loteRow } = await supabase.from('lotes').select('*').eq('id', simple.lote_id).maybeSingle();
            if (loteRow) {
                const presIds = [loteRow.sujeto_obligado_id, loteRow.verificador_id].filter(Boolean);
                let presMap = {};
                if (presIds.length) {
                    const { data: pres } = await supabase.from('prescriptores')
                        .select('id_empresa, razon_social, acronimo, nombre_responsable, apellidos_responsable, nif_responsable')
                        .in('id_empresa', presIds);
                    presMap = Object.fromEntries((pres || []).map(p => [p.id_empresa, p]));
                }
                lote = {
                    id: loteRow.id, codigo: loteRow.codigo, estado: loteRow.estado,
                    anio_actuacion: loteRow.anio_actuacion, ccaa: loteRow.ccaa,
                    sujeto_obligado: presMap[loteRow.sujeto_obligado_id] || null,
                    verificador: presMap[loteRow.verificador_id] || null,
                };
            }
        }

        const payload = {
            ...simple,
            clientes: cli || null,
            oportunidades: op || null,
            prescriptores: assignedPrescriptor,
            prescriptores_firmante: firmantePrescriptor,
            lote
        };
        // Capado de cifras por rol: ADMIN completo; TRABAJADOR sin margen
        // Brokergy; CERTIFICADOR sin ninguna cifra económica.
        return res.json(scrubExpedienteForUser(payload, req));
    } catch (err) {
        console.error('Error GET expedientes/:id:', err);
        res.status(500).json({ error: 'Error al obtener el expediente' });
    }
});

// ─── GET /api/expedientes/:id/checklist ───────────────────────────────────────
// "Barrido" del expediente: qué falta y quién lo aporta (CLIENTE / INSTALADOR /
// CUALQUIERA), más dos objetivos: poder generar los anexos y el expediente final.
// Solo lectura. Las fotos salen de los slots REALES de la app (buildDocChecklist).
// Cómputo reutilizable del barrido. Devuelve { numero_expediente, grupos, objetivos }.
// Lo usan GET /:id/checklist y la lógica de "solicitar lo que falta".
async function buildChecklistData(exp, cli, op) {
    const c = cli || {};
    const doc = exp.documentacion || {};
    const datos = op?.datos_calculo || {};
    const uploads = datos.reforma_uploads || {};
    const overrides = datos.docs_overrides || {}; // { <slot>: { waived, enabled } }

    const present = (v) => {
        if (v == null) return false;
        if (typeof v === 'string') { const t = v.trim(); return !!t && !t.includes('___') && t !== '—'; }
        if (Array.isArray(v)) return v.length > 0;
        return true;
    };
    const mk = (key, label, responsable, presente, obj, detalle, link, extra) => ({
        key, label, responsable, presente: !!presente, objetivos: obj || [], detalle: detalle || null, link: link || null, ...(extra || {}),
    });

    // ── Eje temporal: emitido → enviado → firmado ────────────────────────────
    // El `estado` del expediente es UN valor lineal y no puede representar que a
    // la vez esté el CEE final en el certificador, los anexos en casa del cliente
    // y el CIFO en la del instalador. Esas tres cosas avanzan EN PARALELO, así que
    // el "qué falta" se responde por PISTAS, cada una con su propio ciclo y su
    // propio reloj (desde cuándo estamos esperando).
    const DIA_MS = 86400000;
    const diasDesde = (iso) => {
        if (!iso) return null;
        const t = new Date(iso).getTime();
        if (!Number.isFinite(t)) return null;
        return Math.max(0, Math.floor((Date.now() - t) / DIA_MS));
    };
    // Fecha+hora de envío en horario de España, para que el detalle diga CUÁNDO se
    // envió (más útil que "esperando 0 d" el mismo día del envío).
    const fmtEnvio = (iso) => {
        if (!iso) return null;
        const dt = new Date(iso);
        if (isNaN(dt.getTime())) return null;
        try {
            return dt.toLocaleString('es-ES', {
                timeZone: 'Europe/Madrid',
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
            });
        } catch { return dt.toISOString().slice(0, 16).replace('T', ' '); }
    };

    // Situaciones, de peor a mejor. El orden IMPORTA: la situación de una pista es
    // la peor de sus ítems (lo que de verdad la bloquea).
    const SITUACIONES = ['SIN_EMITIR', 'SIN_ENVIAR', 'ESPERANDO', 'OK'];
    const peorSituacion = (lista) => {
        const idx = lista.map(s => SITUACIONES.indexOf(s)).filter(i => i >= 0);
        return idx.length ? SITUACIONES[Math.min(...idx)] : 'OK';
    };

    // Ciclo de un documento con el modelo de 3 columnas de `documentacion`
    // (borrador en Drive → marcado como enviado → PDF firmado subido).
    const cicloDoc = (emitido, enviadoAt, firmado) => {
        if (firmado) return { situacion: 'OK', enviado_at: enviadoAt || null, dias_esperando: null, detalle: null };
        if (enviadoAt) {
            const d = diasDesde(enviadoAt);
            const cuando = fmtEnvio(enviadoAt);
            // "Enviado el 23/07/2026 15:16 · pte. firma" — y solo si ya lleva días
            // esperando se añade el contador, para no poner "0 d" el mismo día.
            const detalle = cuando
                ? `Enviado ${cuando} · pte. firma${d > 0 ? ` (${d} d)` : ''}`
                : (d === null ? 'Enviado, pendiente de firma' : `Enviado — esperando ${d} d`);
            return { situacion: 'ESPERANDO', enviado_at: enviadoAt, dias_esperando: d, detalle };
        }
        if (emitido) return { situacion: 'SIN_ENVIAR', enviado_at: null, dias_esperando: null, detalle: 'Generado, pendiente de enviar' };
        return { situacion: 'SIN_EMITIR', enviado_at: null, dias_esperando: null, detalle: 'Pendiente de generar' };
    };

    // ── CLIENTE ──
    const camposPers = [['Nombre', c.nombre_razon_social], ['DNI', c.dni || c.dni_nie], ['Dirección', c.direccion], ['CP', c.codigo_postal], ['Municipio', c.municipio], ['Provincia', c.provincia]];
    const faltanPers = camposPers.filter(([, v]) => !present(v)).map(([l]) => l);
    const datosPersOk = faltanPers.length === 0;
    const ibanOk = present(c.numero_cuenta);

    // Justificante bancario: el campo puede estar vacío aunque el PDF YA esté en Drive
    // (p.ej. lo adjuntó el cliente al aceptar y el flujo /aceptar no rellenó el link).
    // Reconciliamos con Drive: si existe el fichero "justificante de titularidad bancaria",
    // lo damos por presente, persistimos el enlace (para poder abrirlo) y no se vuelve a pedir.
    let justifLink = doc.justificante_titularidad_link || null;
    let justifOk = present(justifLink);
    if (!justifOk) {
        const driveFolderId = datos.drive_folder_id || datos.inputs?.drive_folder_id;
        if (driveFolderId) {
            try {
                const driveService = require('../services/driveService');
                const files = await driveService.listFiles(driveFolderId);
                const match = (files || []).find(f => {
                    const n = (f.name || '').toLowerCase();
                    return n.includes('justificante') && n.includes('titularidad');
                });
                if (match) {
                    justifLink = match.webViewLink || match.link || null;
                    justifOk = !!justifLink;
                    // Backfill atómico del campo (self-healing): la próxima vez ya no se escanea Drive.
                    if (justifLink && exp.oportunidad_id) {
                        supabase.rpc('set_expediente_doc_field', {
                            p_oportunidad_id: exp.oportunidad_id,
                            p_field: 'justificante_titularidad_link',
                            p_value: justifLink,
                        }).then(({ error }) => { if (error) console.warn('[checklist] backfill justificante:', error.message); }, () => {});
                    }
                }
            } catch (e) { console.warn('[checklist] reconciliación justificante Drive:', e.message); }
        }
    }

    const anexoIFirmado = present(doc.anexo_i_signed_link);
    const cesionClienteFirmo = present(doc.anexo_cesion_signed_link);
    const cesionBrokergyFirmo = !!doc.cesion_firmado_brokergy;
    const cesionFirmado = cesionClienteFirmo && cesionBrokergyFirmo;
    const anexoFotoFirmado = present(doc.anexo_fotografico_signed_link);

    const cicloAnexoI  = cicloDoc(present(doc.anexo_i_drive_link),           doc.anexo_i_sent_at,           anexoIFirmado);
    const cicloCesion  = cicloDoc(present(doc.anexo_cesion_drive_link),      doc.anexo_cesion_sent_at,      cesionFirmado);
    const cicloFoto    = cicloDoc(present(doc.anexo_fotografico_drive_link), doc.anexo_fotografico_sent_at, anexoFotoFirmado);
    // Matiz propio de la Cesión: la firma es a dos manos y puede faltar la nuestra.
    if (cesionClienteFirmo && !cesionBrokergyFirmo) {
        cicloCesion.situacion = 'ESPERANDO';
        cicloCesion.detalle = 'Cliente firmó — pendiente firma Brokergy';
    }

    // ── Las fotos tienen un DESTINO: el Anexo Fotográfico ─────────────────────
    // Las fotos del expediente no son un fin en sí mismo: se piden para montar el
    // Anexo Fotográfico (y, las del ANTES, para que el certificador haga el CEE).
    // Una vez el Anexo está emitido y FIRMADO, ese material ya cumplió su función:
    // seguir listándolo como "falta" mandaba a reclamar al cliente fotos que no se
    // van a usar. Un rechazo del Anexo lo reabre (habrá que rehacerlo, y puede que
    // con material nuevo).
    const anexoFotoRechazado = !!doc.docs_rechazados?.anexo_fotografico_signed_link;
    const anexoFotoValidado  = !!doc.docs_validados?.anexo_fotografico_signed_link;
    const fotosCerradas = anexoFotoFirmado && !anexoFotoRechazado;
    const motivoFotosCerradas = fotosCerradas
        ? `Cubierta por el Anexo Fotográfico ${anexoFotoValidado ? 'validado' : 'firmado'}`
        : null;

    const grupoCliente = [
        mk('datos_personales', 'Datos personales', 'CLIENTE', datosPersOk, ['anexos', 'final'], datosPersOk ? null : 'Faltan: ' + faltanPers.join(', ')),
        mk('numero_cuenta', 'Nº de cuenta (IBAN)', 'CLIENTE', ibanOk, ['anexos', 'final'], ibanOk ? c.numero_cuenta : 'Sin IBAN'),
        mk('justificante', 'Justificante titularidad bancaria', 'CLIENTE', justifOk, ['final'], null, justifLink),
        mk('anexo_i_firmado', 'Anexo I firmado', 'CLIENTE', anexoIFirmado, ['final'], cicloAnexoI.detalle, doc.anexo_i_signed_link, cicloAnexoI),
        mk('cesion_firmado', 'Anexo Cesión firmado', 'CLIENTE', cesionFirmado, ['final'], cicloCesion.detalle, doc.anexo_cesion_signed_link, cicloCesion),
    ];

    // ── BROKERGY ──
    // El Anexo Fotográfico lo montamos NOSOTROS con las fotos del expediente y
    // después se manda a firmar. Mientras no exista, no hay nada que el cliente
    // pueda aportar: colgarlo de su grupo hacía que un expediente con el Anexo I
    // y la Cesión ya firmados siguiera diciendo "al cliente le falta algo".
    const grupoBrokergy = [
        mk('anexo_fotografico_firmado', 'Anexo Fotográfico firmado', 'BROKERGY', anexoFotoFirmado, ['final'], cicloFoto.detalle, doc.anexo_fotografico_signed_link, cicloFoto),
    ];

    // ── INSTALADOR ──
    // Conteo de facturas DEDUPLICADO por driveId: una factura subida por el instalador
    // queda registrada en documentacion.facturas[] (vía addFacturaToExpediente) Y en
    // reforma_uploads.DOC_FACTURAS; sumar ambas la contaría dos veces. Las del admin
    // solo tienen drive_link (sin drive_id), de ahí el fallback drive_id || drive_link.
    const factSet = new Set();
    (Array.isArray(doc.facturas) ? doc.facturas : []).forEach(f => {
        if (f && (f.drive_id || f.drive_link)) factSet.add(f.drive_id || f.drive_link);
    });
    (Array.isArray(uploads.DOC_FACTURAS) ? uploads.DOC_FACTURAS : []).forEach(u => {
        if (u && (u.driveId || u.link)) factSet.add(u.driveId || u.link);
    });
    const nFacturas = factSet.size;
    const cifoOk = present(doc.cert_cifo_signed_link);
    // El RITE está aportado si nos ha llegado el certificado tramitado o la memoria
    // firmada. `cert_rite_drive_link` NO cuenta cuando lo que guarda es la Memoria
    // que generamos nosotros (fuente única: logic/instaladorPendientes.js): con la
    // regla anterior, generar la memoria daba el RITE por recibido y desbloqueaba
    // la emisión del CIFO sin tener ni un papel del instalador.
    const { estadoInstalador } = await loadInstaladorPendientes();
    const estadoInst = estadoInstalador(doc);
    const riteOk = estadoInst.rite.recibido || (Array.isArray(uploads.DOC_RITE) && uploads.DOC_RITE.length > 0);
    const facturaOk = nFacturas > 0;
    const cicloCifo = cicloDoc(present(doc.cert_cifo_drive_link), doc.cert_cifo_sent_at, cifoOk);
    const grupoInstalador = [
        mk('cifo', 'Certificado CIFO (firmado)', 'INSTALADOR', cifoOk, ['final'], cicloCifo.detalle, doc.cert_cifo_signed_link, cicloCifo),
        // RITE y factura no viajan para firma: o los tenemos o no. Sin eje temporal.
        mk('rite', 'Certificado RITE', 'INSTALADOR', riteOk, ['final'], null, (estadoInst.rite.certificadoRecibido ? doc.cert_rite_drive_link : null) || doc.cert_rite_signed_link, { situacion: riteOk ? 'OK' : 'SIN_EMITIR' }),
        mk('factura', 'Factura de obra', 'INSTALADOR', facturaOk, ['final'], facturaOk ? `${nFacturas} factura(s)` : 'Sin facturas', null, { situacion: facturaOk ? 'OK' : 'SIN_EMITIR' }),
    ];

    // ── CERTIFICADOR ──
    // Aquí el eje temporal no son los `_sent_at` sino el subestado del CEE final y
    // su sello de tiempo (`seguimiento.cee_final_ts`), que ya registra cada salto.
    const ESPERA_CEE_FINAL = {
        ASIGNADO:         'Encargo aceptado — pendiente de visita',
        EN_TRABAJO:       'Técnico trabajando',
        PTE_PRESENTACION: 'Pendiente de que suba el .cex',
        PRESENTADO:       '.cex subido — pendiente de revisar',
        PTE_REVISION:     'Pendiente de nuestra revisión',
        REVISADO:         'Visto bueno dado — pendiente de registrar en Industria',
    };
    const ceeFinalOk = present(doc.fecha_registro_cee_final) || (exp.seguimiento?.cee_final === 'REGISTRADO');
    const segFinal = exp.seguimiento?.cee_final || null;
    let cicloCeeFinal;
    if (ceeFinalOk) {
        cicloCeeFinal = { situacion: 'OK', enviado_at: null, dias_esperando: null,
            detalle: doc.fecha_registro_cee_final ? `Registrado ${doc.fecha_registro_cee_final}` : 'Registrado' };
    } else if (!segFinal || segFinal === 'PTE_ENVIO_CERT') {
        cicloCeeFinal = { situacion: 'SIN_ENVIAR', enviado_at: null, dias_esperando: null,
            detalle: 'Sin enviar el encargo al certificador' };
    } else {
        const enviadoAt = exp.seguimiento?.[`cee_final_ts`]?.[segFinal] || null;
        const d = diasDesde(enviadoAt);
        const base = ESPERA_CEE_FINAL[segFinal] || 'En el certificador';
        cicloCeeFinal = { situacion: 'ESPERANDO', enviado_at: enviadoAt, dias_esperando: d,
            detalle: d === null ? base : `${base} — ${d} d` };
    }
    const grupoCertificador = [
        mk('cee_final', 'CEE Final registrado', 'CERTIFICADOR', ceeFinalOk, ['final'], cicloCeeFinal.detalle, null, cicloCeeFinal),
    ];

    // ── CUALQUIERA (fotos) — slots REALES de la app, excluyendo RITE/Facturas (ya en Instalador).
    let slots = [];
    // `estado: 'ACEPTADA'` forzado: si hay expediente, la oportunidad está aceptada
    // por definición (lo garantiza el trigger de BD), pero en los MIGRADOS la
    // oportunidad es sintética y su `datos_calculo.estado` puede no decirlo. Sin
    // esto, buildDocChecklist devolvía TODOS los slots como opcionales y el barrido
    // de un migrado no exigía ninguna foto.
    // Apartados que declara la pestaña INSTALACIÓN (emisor, piscina) computados
    // ON-READ: `syncInstalacionConcepts` los persiste al GUARDAR el expediente, y
    // sin esto un expediente que no se ha vuelto a tocar desde entonces no vería
    // la foto de su unidad terminal. Se fusionan por slot para no pisar `waived`.
    const overridesInst = reformaUploadService.overridesFromInstalacion(exp.instalacion);
    const overridesConInst = { ...(datos.docs_overrides || {}) };
    for (const [k, v] of Object.entries(overridesInst)) overridesConInst[k] = { ...(overridesConInst[k] || {}), ...v };
    // ALCANCE del expediente (ficha, ACS, emisor, envolvente, CEE inicial
    // registrado). Es la MISMA función que usan el enlace del cliente y el panel
    // del admin: el barrido no puede pedir cosas distintas de las que la app
    // ofrece, o "lo que falta" deja de casar con lo que hay dónde subir.
    // Se calcula sin volver a la BD: el expediente ya está en la mano.
    const alcanceExp = docsAlcance.alcanceFromExpediente(exp, { datos_calculo: datos });
    const datosChecklist = docsAlcance.conAlcance(
        { ...datos, docs_overrides: overridesConInst, estado: 'ACEPTADA' },
        alcanceExp
    );
    try {
        slots = reformaUploadService.buildDocChecklist(datosChecklist) || [];
    } catch (e) { console.warn('[checklist] buildDocChecklist:', e.message); }
    // Reconciliación con Drive, IGUAL que hacen el popup de fotos (buildDocsView) y
    // el Anexo Fotográfico (collectPhotoGroups). Sin esto el barrido solo miraba
    // `reforma_uploads`, así que una foto que llegó a Drive por otra vía —expediente
    // migrado, o la skill del anexo copiando con el MCP de Drive— seguía saliendo
    // como pendiente aunque el anexo ya la estuviera usando. Drive manda (regla 20).
    const enDrive = await reformaUploadService.driveSlotsPresentes(datosChecklist);
    const grupoFotos = slots
        .filter(s => s.key !== 'DOC_RITE' && s.key !== 'DOC_FACTURAS')
        .map(s => {
            const waived = !!overrides[s.key]?.waived;
            const arr = uploads[s.key] || [];
            const subida = (Array.isArray(arr) && arr.length > 0) || enDrive.has(s.key);
            // Un slot `optionalAlways` (CEE previo, vídeos, "Otros antes/después")
            // NUNCA se exige: buildDocChecklist no lo pasa a required ni al ACEPTAR.
            const opcional = !s.required;
            const requerida = !waived && !opcional && !fotosCerradas;
            // NO PROCEDE = falta, pero no hay que pedirlo. Se distingue de "waived"
            // (decisión manual del admin) porque aquí lo decide el propio expediente:
            // o el slot es opcional por naturaleza, o el Anexo Fotográfico ya cerró
            // el capítulo. Ninguno de los dos debe salir en la lista de pendientes.
            const noProcede = !subida && !waived && !requerida;
            const motivo = !noProcede ? null
                : (s.noRequeridoMotivo || (opcional ? 'Opcional — no se pide' : motivoFotosCerradas));
            const obj = requerida ? ['final'] : [];
            // El recuento sale de la BD; si la foto solo está en Drive (arr vacío) no
            // sabemos cuántas son sin volver a listar, así que se dice de dónde viene.
            const detalle = waived
                ? 'No necesario'
                : (subida
                    ? (arr.length > 0 ? `${arr.length} archivo(s)` : 'Aportada (en Drive)')
                    : (requerida ? 'Requerida — sin subir' : motivo));
            // `fase`, `required` y `subida` se exponen para "solicitar lo que falta"
            // (presente mezcla subida||waived y no basta para saber si hay fichero).
            // `required` es el EFECTIVO (ya descontado el cierre por Anexo Fotográfico),
            // que es lo que decide qué viene premarcado en la solicitud.
            return mk(s.key, s.label || s.key, 'CUALQUIERA', subida || waived, obj, detalle, null,
                { waived, fase: s.fase, required: requerida, subida, opcional, no_procede: noProcede, motivo_no_procede: motivo });
        });

    const todos = [...grupoCliente, ...grupoBrokergy, ...grupoInstalador, ...grupoCertificador, ...grupoFotos];
    const faltanPara = (objetivo) => todos.filter(i => i.objetivos.includes(objetivo) && !i.presente).map(i => i.label);

    // ── ¿Lo hemos pedido ya? ─────────────────────────────────────────────────
    // "Falta la factura" no dice lo mismo que "falta la factura y se la pedimos hace
    // 12 días": lo primero es trabajo nuestro, lo segundo es insistir. Cada solicitud
    // enviada queda en `documentacion.historial` (tipo 'solicitud_docs', ver
    // POST /:id/solicitar-faltantes) con la lista de lo pedido; aquí se cruza con el
    // barrido para que cada pendiente diga cuándo se pidió por última vez y cuántas
    // veces. Un documento que ENVIAMOS nosotros (Anexo I, Cesión, CIFO) ya lleva su
    // propio reloj en `{doc}_sent_at` vía cicloDoc: eso es "enviado", esto es "pedido".
    const historialDocs = Array.isArray(doc.historial) ? doc.historial : [];
    // Las solicitudes anteriores a 2026-08 solo guardaban los TEXTOS de lo pedido;
    // desde entonces se guarda también `solicitado_keys` (las claves del barrido).
    // Para las viejas se cruza por etiqueta, con alias donde la solicitud la reescribe.
    const ALIAS_PETICION = {
        'certificado rite (y memoria firmada)': 'rite',
        'factura(s) de la obra': 'factura',
    };
    // ⚠️ TODO se compara en minúsculas. El historial guardado NO conserva la caja:
    // cuando el detalle del expediente autoguarda, `normalizeData` pasa a MAYÚSCULAS
    // el objeto entero, así que en BD conviven entradas `solicitud_docs` y
    // `SOLICITUD_DOCS`, con sus textos y sus claves igual de gritadas. Comparar por
    // igualdad exacta se comía la mayoría de las solicitudes.
    const normLabel = (s) => String(s || '').trim().toLowerCase();
    const peticiones = new Map(); // id (en minúsculas) → { fecha, target, veces }
    const anotaPeticion = (id, s) => {
        if (!id) return;
        const k = normLabel(id);
        const prev = peticiones.get(k);
        peticiones.set(k, { fecha: s.fecha, target: s.target || null, veces: (prev?.veces || 0) + 1 });
    };
    const solicitudes = historialDocs
        .filter(h => h && normLabel(h.tipo) === 'solicitud_docs' && h.fecha)
        .sort((a, b) => Date.parse(a.fecha) - Date.parse(b.fecha));
    for (const s of solicitudes) {
        const keys = Array.isArray(s.solicitado_keys) ? s.solicitado_keys.filter(Boolean) : [];
        if (keys.length) { keys.forEach(k => anotaPeticion(String(k), s)); continue; }
        // Registro legacy: solo textos.
        (Array.isArray(s.solicitado) ? s.solicitado : []).filter(Boolean).forEach(l => {
            const n = normLabel(l);
            anotaPeticion(ALIAS_PETICION[n] || `label:${n}`, s);
        });
    }
    for (const it of todos) {
        if (it.presente || it.no_procede) continue;
        const p = peticiones.get(normLabel(it.key)) || peticiones.get(`label:${normLabel(it.label)}`);
        if (p) it.peticion = { ...p, dias: diasDesde(p.fecha), cuando: fmtEnvio(p.fecha) };
    }
    const ultimaSolicitud = solicitudes.length ? solicitudes[solicitudes.length - 1] : null;

    // ── PISTAS PARALELAS ─────────────────────────────────────────────────────
    // Las tres cosas que pueden estar en la calle A LA VEZ, cada una en manos de
    // alguien distinto. Esto es lo que responde "dime qué falta" sin tener que
    // exprimir un único `estado` lineal que no da para tanto.
    // `enEspera` = de quién dependemos CUANDO el documento ya está en su tejado.
    // Mientras no se ha generado ni enviado, el trabajo es NUESTRO: poner ahí al
    // cliente/instalador ("CLIENTE · sin generar") se leía como si tuviera que
    // generarlo él.
    const armarPista = (id, label, enEspera, items) => {
        const pendientes = items.filter(i => !i.presente);
        const situacion = pendientes.length === 0 ? 'OK' : peorSituacion(pendientes.map(i => i.situacion || 'SIN_EMITIR'));
        const responsable = (situacion === 'SIN_EMITIR' || situacion === 'SIN_ENVIAR') ? 'BROKERGY' : enEspera;
        const esperas = pendientes.map(i => i.dias_esperando).filter(d => typeof d === 'number');
        return {
            id, label, responsable, situacion,
            listo: pendientes.length === 0,
            // Días que llevamos esperando a que nos devuelvan lo más antiguo.
            dias_esperando: esperas.length ? Math.max(...esperas) : null,
            pendientes: pendientes.map(i => ({
                key: i.key, label: i.label, situacion: i.situacion || 'SIN_EMITIR',
                dias_esperando: i.dias_esperando ?? null, detalle: i.detalle || null,
                enviado_at: i.enviado_at ?? null, peticion: i.peticion || null,
            })),
        };
    };

    const pistas = [
        armarPista('cee_final', 'CEE final', 'CERTIFICADOR', grupoCertificador),
        // Anexo I + Cesión: los dos que firma el cliente. El Anexo Fotográfico va
        // en su propia pista porque lo montamos nosotros y no depende de él.
        armarPista('anexos_cliente', 'Anexos para firma', 'CLIENTE',
            grupoCliente.filter(i => ['anexo_i_firmado', 'cesion_firmado'].includes(i.key))),
        armarPista('anexo_fotografico', 'Anexo fotográfico', 'CLIENTE', grupoBrokergy),
        armarPista('cifo_instalador', 'CIFO', 'INSTALADOR',
            grupoInstalador.filter(i => i.key === 'cifo')),
    ];

    return {
        numero_expediente: exp.numero_expediente,
        // El "no necesario" (waive) de una foto se guarda en docs_overrides de la
        // OPORTUNIDAD, así que el barrido expone su id para poder marcarlo desde aquí.
        oportunidad_id: exp.oportunidad_id,
        grupos: [
            { responsable: 'CLIENTE', label: 'Cliente', items: grupoCliente },
            { responsable: 'BROKERGY', label: 'Brokergy', items: grupoBrokergy },
            { responsable: 'INSTALADOR', label: 'Instalador', items: grupoInstalador },
            { responsable: 'CERTIFICADOR', label: 'Certificador', items: grupoCertificador },
            { responsable: 'CUALQUIERA', label: 'Cualquiera (fotos)', items: grupoFotos },
        ],
        pistas,
        // Por qué el bloque de fotos deja de pedir cosas (si es el caso). Se dice en
        // la UI: un barrido que de repente no lista ninguna foto tiene que explicarse.
        fotos: {
            cerradas: fotosCerradas,
            validado: anexoFotoValidado,
            motivo: motivoFotosCerradas,
        },
        // Última solicitud de documentación enviada (a quién y cuándo), para el pie
        // del barrido. El detalle por ítem va en `item.peticion`.
        ultima_solicitud: ultimaSolicitud ? {
            fecha: ultimaSolicitud.fecha,
            cuando: fmtEnvio(ultimaSolicitud.fecha),
            dias: diasDesde(ultimaSolicitud.fecha),
            target: ultimaSolicitud.target || null,
            solicitado: Array.isArray(ultimaSolicitud.solicitado) ? ultimaSolicitud.solicitado : [],
        } : null,
        objetivos: {
            anexos: { listo: faltanPara('anexos').length === 0, faltan: faltanPara('anexos') },
            expediente_final: { listo: faltanPara('final').length === 0, faltan: faltanPara('final') },
        },
    };
}

router.get('/:id/checklist', enforceAuth, async (req, res) => {
    try {
        const { data: exp, error } = await supabase.from('expedientes').select('*').eq('id', req.params.id).single();
        if (error || !exp) return res.status(404).json({ error: 'Expediente no encontrado' });
        const [{ data: cli }, { data: op }] = await Promise.all([
            supabase.from('clientes').select('*').eq('id_cliente', exp.cliente_id).single(),
            supabase.from('oportunidades').select('id, ficha, datos_calculo').eq('id', exp.oportunidad_id).single(),
        ]);
        return res.json(await buildChecklistData(exp, cli, op));
    } catch (err) {
        console.error('[checklist] Error:', err);
        res.status(500).json({ error: 'Error al construir el checklist' });
    }
});

// Construye las ACCIONES a solicitar por destinatario, mapeando cada ítem que falta
// a su flujo público correcto (firma anexos, subir RITE/CIFO, subir fotos/facturas).
// Solo incluye lo que realmente falta. Los enlaces de /subir-docs llevan ?rol=&need=
// para que el destinatario vea ÚNICAMENTE los slots pendientes.
function buildSolicitudAcciones(checklist, { expId, uploadBase, bloqueos = {} }) {
    const FRONTEND = process.env.FRONTEND_URL || 'https://app.brokergy.es';
    const items = (r) => (checklist.grupos.find(g => g.responsable === r)?.items || []);
    const fotos = items('CUALQUIERA');
    const cliPend = items('CLIENTE').filter(i => !i.presente);
    const insPend = items('INSTALADOR').filter(i => !i.presente);
    const fotosAntes = fotos.filter(i => !i.presente && !i.waived && i.fase === 'ANTES' && i.required);
    // Solo lo OBLIGATORIO por defecto (lo opcional —vídeo, "otros"— se puede añadir
    // a mano desde el modal de solicitar, que trabaja sobre `pendientes`).
    const fotosDespues = fotos.filter(i => !i.presente && !i.waived && i.fase === 'DESPUES' && i.required);

    // ── CLIENTE ── (owner=CLIENTE; tituloRelay/notaRelay = 3ª persona para cuando
    // se le pide al instalador en nombre del cliente).
    //
    // SECUENCIA: los anexos (Anexo I / Cesión) se GENERAN con el nº de cuenta y el
    // justificante; no existen hasta tenerlos. Por eso:
    //   · Si faltan datos (IBAN / justificante) → se piden SOLO los datos (no se
    //     menciona la firma todavía: carece de sentido).
    //   · Cuando los datos están → se pide la firma del Anexo I y la Cesión.
    const cliente = [];
    const ibanFalta = cliPend.find(i => i.key === 'numero_cuenta');
    const justifFalta = cliPend.find(i => i.key === 'justificante');
    // Una firma BLOQUEADA no se pide: su borrador todavía no se puede emitir bien
    // (Anexo I sin nº de serie, Cesión sin IBAN) y el firmante devolvería un PDF
    // para tirar. Ver `bloqueosDeFirma`.
    const anexoIFalta = !bloqueos.anexo_i_firmado && cliPend.find(i => i.key === 'anexo_i_firmado');
    const cesionFalta = !bloqueos.cesion_firmado && cliPend.find(i => i.key === 'cesion_firmado');
    const datosFaltan = ibanFalta || justifFalta;

    if (datosFaltan) {
        // FASE A — solo los datos que alimentan los anexos.
        const dataItems = [ibanFalta, justifFalta].filter(Boolean).map(i => i.label);
        cliente.push({
            owner: 'CLIENTE',
            titulo: 'Completa los datos que faltan',
            tituloRelay: 'El cliente debe aportar los datos que faltan',
            url: `${FRONTEND}/firmar-anexos/${expId}`,
            items: dataItems,
            nota: 'Con estos datos preparamos tus anexos; después te llegará el enlace para firmarlos.',
            notaRelay: 'Con estos datos se preparan los anexos; después le llegará al cliente el enlace para firmarlos.',
        });
    } else if (anexoIFalta || cesionFalta) {
        // FASE B — ya hay datos: a firmar.
        cliente.push({
            owner: 'CLIENTE',
            titulo: 'Firma los anexos',
            tituloRelay: 'El cliente debe firmar los anexos',
            url: `${FRONTEND}/firmar-anexos/${expId}`,
            items: [anexoIFalta, cesionFalta].filter(Boolean).map(i => i.label),
            nota: null,
            notaRelay: null,
        });
    }
    if (fotosAntes.length && uploadBase) {
        cliente.push({
            owner: 'CLIENTE',
            titulo: 'Sube las fotos del estado ANTES de la obra',
            tituloRelay: 'Fotos del estado ANTES de la obra',
            url: `${uploadBase}&rol=cliente&need=${fotosAntes.map(i => i.key).join(',')}`,
            items: fotosAntes.map(i => i.label),
            nota: null,
            notaRelay: null,
        });
    }

    // ── INSTALADOR ──
    const instalador = [];
    const riteFalta = !!insPend.find(i => i.key === 'rite');
    const facturaFalta = !!insPend.find(i => i.key === 'factura');
    const cifoFalta = !!insPend.find(i => i.key === 'cifo');
    if (riteFalta) instalador.push({ owner: 'INSTALADOR', titulo: 'Sube el Certificado RITE', url: `${FRONTEND}/subir-rite/${expId}`, items: ['Certificado RITE (y memoria firmada)'], nota: null });
    // El CIFO se GENERA con los datos del RITE y de las facturas: no se pide hasta
    // tenerlos. Si aún faltan, el CIFO llegará después en otro mensaje.
    if (cifoFalta && !riteFalta && !facturaFalta) {
        instalador.push({ owner: 'INSTALADOR', titulo: 'Sube el Certificado CIFO firmado', url: `${FRONTEND}/subir-cifo/${expId}`, items: ['Certificado CIFO firmado'], nota: null });
    }
    const subidaIns = [];
    if (insPend.find(i => i.key === 'factura')) subidaIns.push({ key: 'DOC_FACTURAS', label: 'Factura(s) de la obra' });
    fotosDespues.forEach(i => subidaIns.push({ key: i.key, label: i.label }));
    if (subidaIns.length && uploadBase) {
        instalador.push({
            owner: 'INSTALADOR',
            titulo: 'Sube la factura y las fotos de la instalación terminada',
            url: `${uploadBase}&rol=instalador&need=${subidaIns.map(s => s.key).join(',')}`,
            items: subidaIns.map(s => s.label),
            nota: null,
        });
    }

    // Ítems sin enlace público (los completa Brokergy internamente): se informan aparte.
    const adminCliente = cliPend.filter(i => i.key === 'datos_personales').map(i => i.label);
    return { cliente, instalador, adminCliente };
}

// Lista PLANA de TODO lo pendiente para el modal "Solicitar lo que falta": lo
// obligatorio (incluido por defecto), lo opcional (visible, desmarcado) y lo
// marcado "no necesario" (waived, desmarcado pero reactivable). El frontend
// compone el mensaje a partir de esta lista según lo que el admin marque.
//   { key, label, tipo:'dato'|'firma'|'doc'|'foto', fase, required, waived,
//     ownerDefault, flujo, slot?, defaultIncluido, nota? }
// Nº de serie que le faltan al Anexo I, unidad por unidad (espejo de la
// validación de `validateExpediente('anexo1')` en DocumentacionModule).
// Solo cuenta las unidades DECLARADAS: un RES080 de envolvente no tiene bomba de
// calor y su Anexo I no lleva ninguna serie.
function seriesPendientesAnexoI(exp, op) {
    const inst = exp.instalacion || {};
    const faltan = [];
    const nCal = countUnidadesAero(inst.aerotermia_cal);
    for (const n of unidadesSinSerie(inst.aerotermia_cal)) {
        faltan.push(nCal > 1 ? `el nº de serie de la ud. exterior (equipo ${n})` : 'el nº de serie de la unidad exterior');
    }
    const inputs = op?.datos_calculo?.inputs || {};
    // `normalizeData` sube los strings a MAYÚSCULAS antes de persistir: el valor
    // en BD es 'SI', no 'si'.
    const hayAcs = inst.cambio_acs != null
        ? (inst.cambio_acs === true || String(inst.cambio_acs).toLowerCase() === 'si')
        : !!(inputs.changeAcs === true || inputs.incluir_acs === true);
    if (hayAcs && !inst.misma_aerotermia_acs) {
        const nAcs = countUnidadesAero(inst.aerotermia_acs);
        for (const n of unidadesSinSerie(inst.aerotermia_acs)) {
            faltan.push(nAcs > 1 ? `el nº de serie de la ud. interior/ACS (equipo ${n})` : 'el nº de serie de la unidad interior (ACS)');
        }
    }
    return faltan;
}

// Firmas que NO se pueden pedir todavía porque el documento que hay que firmar
// aún no se puede emitir bien. No es una preferencia de redacción: mandar a
// firmar un Anexo I sin nº de serie o una Cesión sin IBAN devuelve un PDF
// firmado que hay que rechazar y rehacer (ver `rechazoBorrador`, 26RES060_142).
// { <key del pendiente>: 'motivo' }
function bloqueosDeFirma(exp, op, { faltaIban, faltaJustificante }) {
    const out = {};
    const series = seriesPendientesAnexoI(exp, op);
    if (series.length) out.anexo_i_firmado = `Falta ${series.join(', ')} — el Anexo I ${series.length > 1 ? 'los' : 'lo'} declara`;
    const datos = [faltaIban && 'el nº de cuenta (IBAN)', faltaJustificante && 'el justificante de titularidad'].filter(Boolean);
    if (datos.length) out.cesion_firmado = `Falta ${datos.join(' y ')} — la Cesión se redacta con ${datos.length > 1 ? 'esos datos' : 'ese dato'}`;
    return out;
}

function buildSolicitudPendientes(checklist, { hayInstalador, bloqueos = {} }) {
    const items = (r) => (checklist.grupos.find(g => g.responsable === r)?.items || []);
    const out = [];
    const cliPend = items('CLIENTE').filter(i => !i.presente);
    const insPend = items('INSTALADOR').filter(i => !i.presente);
    // Huella de reclamación del barrido, por clave. La arrastramos hasta aquí para
    // que quien redacta el mensaje —persona o agente— sepa si esto es la primera vez
    // que se pide o la tercera, y con qué tono escribir.
    const huella = new Map();
    for (const g of checklist.grupos || []) {
        for (const i of g.items || []) {
            if (i.peticion || i.enviado_at) huella.set(i.key, { peticion: i.peticion || null, enviado_at: i.enviado_at || null });
        }
    }
    const conHuella = (o) => ({ ...o, ...(huella.get(o.key) || { peticion: null, enviado_at: null }) });

    // Los anexos se GENERAN con IBAN+justificante y con los nº de serie: mientras
    // falte ese material, la firma no se puede pedir (`bloqueos`) — no es que no
    // venga premarcada, es que pedirla produce un PDF firmado para tirar.
    for (const i of cliPend) {
        if (i.key === 'datos_personales') continue; // los completa Brokergy (adminPendiente)
        // El Anexo Fotográfico ya no está en este grupo: es del grupo BROKERGY
        // (lo generamos nosotros), y BROKERGY no se "solicita" a nadie.
        const tipo = (i.key === 'numero_cuenta' || i.key === 'justificante') ? 'dato' : 'firma';
        const bloqueo = tipo === 'firma' ? (bloqueos[i.key] || null) : null;
        out.push(conHuella({ key: i.key, label: i.label, tipo, fase: null, required: true, waived: false, ownerDefault: 'CLIENTE', flujo: 'firmar-anexos', bloqueado: !!bloqueo, defaultIncluido: !bloqueo, nota: bloqueo || (i.detalle || null) }));
    }

    const riteFalta = insPend.some(i => i.key === 'rite');
    const factFalta = insPend.some(i => i.key === 'factura');
    for (const i of insPend) {
        if (i.key === 'rite') out.push(conHuella({ key: 'rite', label: 'Certificado RITE (y memoria firmada)', tipo: 'doc', fase: 'DESPUES', required: true, waived: false, ownerDefault: 'INSTALADOR', flujo: 'subir-rite', defaultIncluido: true }));
        if (i.key === 'factura') out.push(conHuella({ key: 'factura', label: 'Factura(s) de la obra', tipo: 'doc', fase: 'DESPUES', required: true, waived: false, ownerDefault: 'INSTALADOR', flujo: 'subir-docs', slot: 'DOC_FACTURAS', defaultIncluido: true }));
        if (i.key === 'cifo') {
            // El CIFO se GENERA con los datos del RITE y de las facturas: hasta
            // tenerlos no se incluye por defecto (el admin puede forzarlo).
            const listo = !riteFalta && !factFalta;
            out.push(conHuella({ key: 'cifo', label: i.label, tipo: 'firma', fase: 'DESPUES', required: true, waived: false, ownerDefault: 'INSTALADOR', flujo: 'subir-cifo', bloqueado: !listo, defaultIncluido: listo, nota: listo ? null : `Falta ${[riteFalta && 'el RITE', factFalta && 'la factura'].filter(Boolean).join(' y ')} — el CIFO se genera con esos datos` }));
        }
    }

    for (const f of items('CUALQUIERA')) {
        if (f.subida) continue; // ya aportada
        const ownerDefault = (f.fase === 'DESPUES' && hayInstalador) ? 'INSTALADOR' : 'CLIENTE';
        // Lo que "no procede" (slot opcional, o fotos ya cubiertas por el Anexo
        // Fotográfico firmado) SIGUE listándose aquí: este modal es justo la
        // superficie donde se decide qué pedir, y el admin puede querer forzarlo.
        // Lo que no hace es venir premarcado — `required` ya es el efectivo.
        out.push(conHuella({ key: f.key, label: f.label, tipo: 'foto', fase: f.fase || null, required: !!f.required, waived: !!f.waived, ownerDefault, flujo: 'subir-docs', slot: f.key, defaultIncluido: !!f.required && !f.waived, noProcede: !!f.no_procede, nota: f.motivo_no_procede || null }));
    }
    return out;
}

// ─── GET /api/expedientes/:id/solicitud-info ──────────────────────────────────
// Contactos (cliente/instalador) + ACCIONES a solicitar (solo lo que falta), cada
// una con su enlace público correcto. Asegura el token de subida (idempotente).
router.get('/:id/solicitud-info', internalKeyOrAuth, async (req, res) => {
    try {
        const { data: exp, error } = await supabase.from('expedientes').select('*').eq('id', req.params.id).single();
        if (error || !exp) return res.status(404).json({ error: 'Expediente no encontrado' });

        const [{ data: cli }, { data: op }, cliente, instalador] = await Promise.all([
            exp.cliente_id ? supabase.from('clientes').select('*').eq('id_cliente', exp.cliente_id).maybeSingle() : Promise.resolve({ data: null }),
            exp.oportunidad_id ? supabase.from('oportunidades').select('id, ficha, datos_calculo').eq('id', exp.oportunidad_id).maybeSingle() : Promise.resolve({ data: null }),
            resolveSolicitudContacto(exp, 'CLIENTE'),
            resolveSolicitudContacto(exp, 'INSTALADOR'),
        ]);

        let uploadBase = null;
        if (exp.oportunidad_id) {
            try { uploadBase = await reformaUploadService.ensureUploadLink(exp.oportunidad_id); }
            catch (e) { console.warn('[solicitud-info] ensureUploadLink:', e.message); }
        }

        const checklist = await buildChecklistData(exp, cli, op);
        // Firmas que no se pueden pedir todavía (Anexo I sin nº de serie, Cesión
        // sin IBAN/justificante). Se leen del propio barrido para no duplicar el
        // criterio de "presente".
        const itemsCliente = checklist.grupos.find(g => g.responsable === 'CLIENTE')?.items || [];
        const noPresente = (k) => !itemsCliente.find(i => i.key === k)?.presente;
        const bloqueos = bloqueosDeFirma(exp, op, {
            faltaIban: noPresente('numero_cuenta'),
            faltaJustificante: noPresente('justificante'),
        });
        const acciones = buildSolicitudAcciones(checklist, { expId: exp.id, uploadBase, bloqueos });

        // Datos de la OBRA (cliente + dirección) para personalizar el mensaje al
        // instalador, que puede llevar varias obras a la vez.
        const obra = {
            cliente: cli ? `${cli.nombre_razon_social || ''} ${cli.apellidos || ''}`.trim() : null,
            direccion: cli
                ? [cli.direccion, [cli.codigo_postal, cli.municipio].filter(Boolean).join(' '), cli.provincia ? `(${cli.provincia})` : null].filter(Boolean).join(', ')
                : null,
        };

        const FRONTEND = process.env.FRONTEND_URL || 'https://app.brokergy.es';
        const hayInstalador = !!(instalador?.nombre || instalador?.tlf || instalador?.email || (instalador?.contactos || []).length);
        res.json({
            numero_expediente: exp.numero_expediente,
            obra,
            cliente: { ...cliente, acciones: acciones.cliente, adminPendiente: acciones.adminCliente },
            instalador: { ...instalador, acciones: acciones.instalador },
            // ── Datos para el checklist interactivo del modal ──
            oportunidad_id: exp.oportunidad_id || null,
            uploadBase,
            urls: {
                firmarAnexos: `${FRONTEND}/firmar-anexos/${exp.id}`,
                subirRite: `${FRONTEND}/subir-rite/${exp.id}`,
                subirCifo: `${FRONTEND}/subir-cifo/${exp.id}`,
            },
            pendientes: buildSolicitudPendientes(checklist, { hayInstalador, bloqueos }),
        });
    } catch (err) {
        console.error('[solicitud-info]', err.message);
        res.status(500).json({ error: 'Error obteniendo datos de solicitud' });
    }
});

// ─── Helper: resuelve el contacto (cliente/instalador) de un expediente ───────
// Resuelve el contacto al que dirigir la solicitud, RESPETANDO la persona de
// notificaciones (mismo criterio que el resto de avisos del sistema):
//   · Cliente: si notificaciones_contacto_activas → persona_contacto_* (nombre/tlf/email)
//   · Instalador: si contacto_notificaciones_activas → nombre_contacto / tlf_contacto / email_contacto
async function resolveSolicitudContacto(exp, target) {
    if (target === 'INSTALADOR') {
        const { data: op } = await supabase
            .from('oportunidades')
            .select('instalador_asociado_id, prescriptor_id')
            .eq('id', exp.oportunidad_id).maybeSingle();
        const insId = op?.instalador_asociado_id || op?.prescriptor_id || null;
        if (!insId) return { nombre: null, tlf: null, email: null, contactos: [] };
        // OJO: prescriptores NO tiene columnas telefono/movil.
        const { data: p, error: pErr } = await supabase.from('prescriptores')
            .select('razon_social, acronimo, es_autonomo, nombre_responsable, apellidos_responsable, tlf, tlf_contacto, landing_telefono_contacto, email, email_contacto, nombre_contacto, contacto_notificaciones_activas, contactos_notificacion')
            .eq('id_empresa', insId).maybeSingle();
        if (pErr) console.warn('[solicitud contacto INSTALADOR]', pErr.message);
        const useContact = p?.contacto_notificaciones_activas === true || p?.contacto_notificaciones_activas === 'true';

        // Lista de TODOS los contactos disponibles del instalador para el selector:
        // representante/empresa + cada persona de contacto de notificaciones.
        const contactos = [];
        const repNombre = [p?.nombre_responsable, p?.apellidos_responsable].filter(Boolean).join(' ').trim()
            || p?.razon_social || p?.acronimo || 'Instalador';
        const repTlf = p?.tlf || p?.landing_telefono_contacto || '';
        if (repTlf || p?.email) {
            contactos.push({ id: 'rep', nombre: repNombre, tlf: repTlf || '', email: p?.email || '', tipo: p?.es_autonomo ? 'Autónomo' : 'Representante' });
        }
        normalizeContactos(p?.contactos_notificacion).forEach((c, i) => {
            if (c.tlf || c.email) contactos.push({ id: `c${i}`, nombre: c.nombre || repNombre, tlf: c.tlf || '', email: c.email || '', tipo: 'Persona de contacto' });
        });

        return {
            nombre: (useContact ? (p?.nombre_contacto || p?.razon_social) : (p?.razon_social || p?.acronimo)) || null,
            tlf: (useContact ? (p?.tlf_contacto || p?.tlf) : (p?.tlf || p?.tlf_contacto || p?.landing_telefono_contacto)) || null,
            email: (useContact ? (p?.email_contacto || p?.email) : (p?.email || p?.email_contacto)) || null,
            contactos,
        };
    }
    // CLIENTE — la tabla clientes NO tiene columna `telefono`, solo `tlf`.
    if (!exp.cliente_id) return { nombre: null, tlf: null, email: null };
    const { data: cli, error: cErr } = await supabase.from('clientes')
        .select('nombre_razon_social, apellidos, tlf, persona_contacto_tlf, persona_contacto_nombre, email, persona_contacto_email, notificaciones_contacto_activas')
        .eq('id_cliente', exp.cliente_id).maybeSingle();
    if (cErr) console.warn('[solicitud contacto CLIENTE]', cErr.message);
    const notif = cli?.notificaciones_contacto_activas === true || cli?.notificaciones_contacto_activas === 'true';
    const nombreCli = cli ? `${cli.nombre_razon_social || ''} ${cli.apellidos || ''}`.trim() : null;
    return {
        nombre: (notif ? (cli?.persona_contacto_nombre || nombreCli) : nombreCli) || null,
        tlf: (notif ? (cli?.persona_contacto_tlf || cli?.tlf) : (cli?.tlf || cli?.persona_contacto_tlf)) || null,
        email: (notif ? (cli?.persona_contacto_email || cli?.email) : (cli?.email || cli?.persona_contacto_email)) || null,
    };
}

// ─── POST /api/expedientes/:id/solicitar-faltantes ────────────────────────────
// Envía (WhatsApp / Email) la solicitud de documentación al cliente o instalador
// y registra la comunicación en el historial del expediente.
// Body: { target: 'CLIENTE'|'INSTALADOR', channels: ['whatsapp','email'], mensaje, asunto? }
router.post('/:id/solicitar-faltantes', internalKeyOrAuth, async (req, res) => {
    try {
        const target = String(req.body?.target || '').toUpperCase();
        const channels = Array.isArray(req.body?.channels) ? req.body.channels : [];
        const mensaje = String(req.body?.mensaje || '').trim();
        const asunto = String(req.body?.asunto || '').trim() || 'Documentación pendiente de tu expediente';
        if (!['CLIENTE', 'INSTALADOR'].includes(target)) return res.status(400).json({ error: 'target inválido' });
        if (!mensaje) return res.status(400).json({ error: 'El mensaje no puede estar vacío' });
        if (!channels.length) return res.status(400).json({ error: 'Selecciona al menos un canal' });

        const { data: exp, error } = await supabase.from('expedientes').select('*').eq('id', req.params.id).single();
        if (error || !exp) return res.status(404).json({ error: 'Expediente no encontrado' });

        const contacto = await resolveSolicitudContacto(exp, target);
        // Overrides del admin: puede dirigir el mensaje a otro teléfono/email/persona.
        const tlf = (String(req.body?.tlf || '').trim()) || contacto.tlf;
        const email = (String(req.body?.email || '').trim()) || contacto.email;
        const nombreDest = (String(req.body?.nombre || '').trim()) || contacto.nombre;
        const sent = [];

        if (channels.includes('whatsapp')) {
            if (!tlf) return res.status(400).json({ error: 'No hay teléfono para enviar el WhatsApp. Indica uno.' });
            botVinculos.sembrarEnDiferido(tlf, exp.oportunidad_id);
            try { await whatsappService.sendText(tlf, mensaje); sent.push('WhatsApp'); }
            catch (e) { console.warn('[solicitar-faltantes] WA:', e.message); sent.push('WhatsApp (encolado)'); }
        }
        if (channels.includes('email')) {
            if (!email) return res.status(400).json({ error: 'No hay email para enviar. Indica uno.' });
            // Los saltos van en <br>: Outlook (motor de Word) ignora `white-space:pre-wrap`
            // y el mensaje llegaba de una pieza, como un párrafo corrido.
            const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#222;font-size:15px;line-height:24px">${mensaje.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r\n|\r|\n/g, '<br>')}</div>`;
            await emailService.sendMail({ to: email, subject: asunto, text: mensaje, html });
            sent.push('Email');
        }
        if (!sent.length) return res.status(400).json({ error: 'No se pudo enviar por los canales elegidos' });

        // Registro en el historial del expediente (trazabilidad)
        const docObj = exp.documentacion || {};
        const historial = docObj.historial || [];
        const userName = req.internalCall ? 'AGENTE IA'
            : (req.user?.rol_nombre === 'ADMIN' ? 'ADMINISTRADOR' : (req.user?.acronimo || req.user?.razon_social || 'SISTEMA'));
        const destLabel = nombreDest ? ` (${nombreDest}${tlf ? ` · ${tlf}` : ''})` : (tlf ? ` (${tlf})` : '');
        // Lista concreta de lo solicitado (para que el agente sepa QUÉ se pidió, no solo a quién).
        const solicitado = Array.isArray(req.body?.solicitado) ? req.body.solicitado.filter(Boolean).map(String) : [];
        // Y las CLAVES del barrido de esos mismos ítems: es lo que permite al barrido
        // decir "la factura se pidió el 21/07" sin tener que casar textos, que cambian
        // (el modal reescribe algunas etiquetas al redactar el mensaje).
        const solicitadoKeys = Array.isArray(req.body?.solicitado_keys) ? req.body.solicitado_keys.filter(Boolean).map(String) : [];
        const solicitadoTxt = solicitado.length ? `. Pedido: ${solicitado.join('; ')}` : '';
        historial.push({
            id: Date.now().toString() + '_solicitud',
            tipo: 'solicitud_docs',
            texto: `Solicitud de documentación enviada a ${target === 'CLIENTE' ? 'Cliente' : 'Instalador'}${destLabel} vía ${sent.join(' + ')}${solicitadoTxt}`,
            solicitado,
            solicitado_keys: solicitadoKeys,
            target,
            fecha: new Date().toISOString(),
            usuario: userName,
        });
        await supabase.from('expedientes')
            .update({ documentacion: { ...docObj, historial }, updated_at: new Date().toISOString() })
            .eq('id', req.params.id);

        res.json({ ok: true, channels: sent, sentTo: email || tlf || null });
    } catch (err) {
        console.error('[solicitar-faltantes]', err.message);
        res.status(500).json({ error: 'Error enviando la solicitud' });
    }
});

// ─── POST /api/expedientes/:id/documentos/rechazar ────────────────────────────
// Rechaza un documento (firmado/factura) marcándolo en documentacion.docs_rechazados,
// limpia su validación previa, registra el rechazo en el historial y —si se elige un
// destinatario— avisa por WhatsApp/Email para que lo corrijan. TODO en una sola
// escritura (read-modify-write de documentacion) para no pisar el historial.
// Body: { field, label?, motivo, target:'CLIENTE'|'INSTALADOR'|'NINGUNO', channels?, mensaje?, tlf?, email?, nombre? }
router.post('/:id/documentos/rechazar', enforceAuth, async (req, res) => {
    try {
        const field = String(req.body?.field || '').trim();
        const label = String(req.body?.label || '').trim() || field;
        const motivo = String(req.body?.motivo || '').trim();
        const target = String(req.body?.target || 'NINGUNO').toUpperCase();
        const channels = Array.isArray(req.body?.channels) ? req.body.channels : [];
        const mensaje = String(req.body?.mensaje || '').trim();
        if (!field) return res.status(400).json({ error: 'field es obligatorio' });
        if (!motivo) return res.status(400).json({ error: 'El motivo del rechazo es obligatorio' });

        const { data: exp, error } = await supabase.from('expedientes').select('*').eq('id', req.params.id).single();
        if (error || !exp) return res.status(404).json({ error: 'Expediente no encontrado' });

        // Aviso al destinatario (si procede). No bloquea el rechazo: si falta el dato
        // de un canal, ese canal se omite (el rechazo se registra igualmente).
        const sent = [];
        let sentTo = null;
        if ((target === 'CLIENTE' || target === 'INSTALADOR') && mensaje) {
            const contacto = await resolveSolicitudContacto(exp, target);
            const tlf = (String(req.body?.tlf || '').trim()) || contacto.tlf;
            const email = (String(req.body?.email || '').trim()) || contacto.email;
            if (channels.includes('whatsapp') && tlf) {
                try { await whatsappService.sendText(tlf, mensaje); sent.push('WhatsApp'); }
                catch (e) { console.warn('[rechazar-doc] WA:', e.message); sent.push('WhatsApp (encolado)'); }
            }
            if (channels.includes('email') && email) {
                const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#222;font-size:15px;line-height:24px">${mensaje.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r\n|\r|\n/g, '<br>')}</div>`;
                try { await emailService.sendMail({ to: email, subject: `Documento a revisar · Expediente ${exp.numero_expediente || ''}`.trim(), text: mensaje, html }); sent.push('Email'); }
                catch (e) { console.warn('[rechazar-doc] Email:', e.message); }
            }
            sentTo = email || tlf || null;
        }

        // Persistir estado de rechazo + historial (una sola escritura).
        const docObj = exp.documentacion || {};
        const docsRechazados = { ...(docObj.docs_rechazados || {}), [field]: { motivo, at: new Date().toISOString(), target } };
        const docsValidados = { ...(docObj.docs_validados || {}) };
        delete docsValidados[field];
        const historial = Array.isArray(docObj.historial) ? [...docObj.historial] : [];
        const userName = req.user?.rol_nombre === 'ADMIN' ? 'ADMINISTRADOR' : (req.user?.acronimo || req.user?.razon_social || 'SISTEMA');
        const avisoTxt = sent.length ? ` · avisado a ${target === 'CLIENTE' ? 'Cliente' : 'Instalador'} vía ${sent.join(' + ')}` : ' · sin aviso';
        historial.push({
            id: Date.now().toString() + '_rechazo_doc',
            tipo: 'rechazo_doc',
            texto: `Documento rechazado: ${label} · Motivo: ${motivo}${avisoTxt}`,
            campo: field, motivo, target,
            fecha: new Date().toISOString(),
            usuario: userName,
        });
        const newDoc = { ...docObj, docs_rechazados: docsRechazados, docs_validados: docsValidados, historial };
        const { error: updErr } = await supabase.from('expedientes')
            .update({ documentacion: newDoc, updated_at: new Date().toISOString() })
            .eq('id', req.params.id);
        if (updErr) throw updErr;

        res.json({ ok: true, channels: sent, sentTo, docs_rechazados: docsRechazados, docs_validados: docsValidados, historial });
    } catch (err) {
        console.error('[rechazar-doc]', err.message);
        res.status(500).json({ error: 'Error al rechazar el documento' });
    }
});

// ─── POST /api/expedientes/:id/documentos/validar ─────────────────────────────
// Marca un documento firmado como VALIDADO (documentacion.docs_validados[field]) y
// copia el fichero a la carpeta de auditoría "10. EXPEDIENTE CAE" (creándola si no
// existe), dejando el original intacto en su carpeta habitual (6. ANEXOS CAE /
// 7. LEGALIZACION RITE). Así toda la documentación validada del CAE queda reunida
// en un único sitio listo para auditoría posterior.
// Body: { field }
// Etiquetas (nombre del fichero en "10. EXPEDIENTE CAE") y helpers de invalidación:
// fuente única en utils/docValidacion.js, compartida con las subidas públicas.
const { DOCUMENTO_VALIDABLE_LABELS, invalidarValidacionDocs } = require('../utils/docValidacion');


// Los dos únicos documentos que firma Brokergy con su certificado. Al firmarlos
// quedan VALIDADOS automáticamente (verde) y se copian a "10. EXPEDIENTE CAE" — no
// necesitan un click de validación aparte, porque si los firmamos nosotros es que ya
// los hemos dado por buenos. Del resto no somos firmantes: se revisan y se validan a
// mano. Mismo conjunto que FIRMABLES_CON_CERTIFICADO en el DocumentacionModule.
const AUTO_VALIDATE_ON_SIGN = new Set(['anexo_fotografico_signed_link', 'anexo_cesion_signed_link']);

function extractDriveFileId(link) {
    if (!link) return null;
    const s = String(link);
    const m = s.match(/\/file\/d\/([A-Za-z0-9_-]+)/) || s.match(/[?&]id=([A-Za-z0-9_-]+)/) || s.match(/\/folders\/([A-Za-z0-9_-]+)/);
    return m ? m[1] : null;
}

// El Certificado RITE no lleva firma digital propia (es gestión manual: un único
// enlace en cert_rite_drive_link, sin versión "_signed" separada). Si aún no se ha
// subido una versión "firmada" específica, se valida/copia directamente el enlace
// manual — no hay firma que comprobar en este documento.
const VALIDAR_LINK_FALLBACK = {
    cert_rite_signed_link: 'cert_rite_drive_link',
};

router.post('/:id/documentos/validar', enforceAuth, async (req, res) => {
    try {
        const field = String(req.body?.field || '').trim();
        if (!field) return res.status(400).json({ error: 'field es obligatorio' });

        const { data: exp, error } = await supabase.from('expedientes').select('*, oportunidades(*)').eq('id', req.params.id).single();
        if (error || !exp) return res.status(404).json({ error: 'Expediente no encontrado' });

        const docObj = exp.documentacion || {};
        const fallbackField = VALIDAR_LINK_FALLBACK[field];
        const link = docObj[field] || (fallbackField && docObj[fallbackField]);
        if (!link) return res.status(400).json({ error: 'El documento aún no tiene un fichero firmado que copiar' });

        let auditLink = null;
        try {
            const op = exp.oportunidades;
            let normalizedDatos = op?.datos_calculo || {};
            if (typeof normalizedDatos === 'string') { try { normalizedDatos = JSON.parse(normalizedDatos); } catch (e) { normalizedDatos = {}; } }
            const driveFolderId = normalizedDatos?.drive_folder_id || normalizedDatos?.inputs?.drive_folder_id || exp.drive_folder_id;
            const fileId = extractDriveFileId(link);

            if (driveFolderId && fileId) {
                const driveService = require('../services/driveService');
                const auditFolderId = await driveService.getOrCreateSubfolderNormalized(driveFolderId, '10. EXPEDIENTE CAE');
                const baseName = DOCUMENTO_VALIDABLE_LABELS[field] || field.replace(/_/g, ' ');
                const copyName = `${exp.numero_expediente || ''} - ${baseName}.pdf`.trim();
                // Re-validación (versión nueva del documento): la copia anterior NO se
                // borra, se archiva en "OLD" como {nombre}_OLD, _OLD1… — igual que
                // /documentos/validar-cee. Si el archivado falla, se borra para no dejar
                // dos ficheros homónimos en la carpeta de auditoría.
                const prevId = await driveService.findFileByName(auditFolderId, copyName);
                if (prevId) {
                    const archived = await driveService.archiveExistingToOld(auditFolderId, prevId, copyName);
                    if (!archived) await driveService.deleteFile(prevId);
                }
                const copied = await driveService.copyFile(fileId, auditFolderId, copyName);
                if (copied?.link) auditLink = copied.link;
            }
        } catch (copyErr) {
            console.warn('[validar-doc] No se pudo copiar a "10. EXPEDIENTE CAE":', copyErr.message);
        }

        const docsValidados = { ...(docObj.docs_validados || {}), [field]: new Date().toISOString() };
        const docsRechazados = { ...(docObj.docs_rechazados || {}) };
        delete docsRechazados[field];
        const newDoc = { ...docObj, docs_validados: docsValidados, docs_rechazados: docsRechazados };
        const { error: updErr } = await supabase.from('expedientes')
            .update({ documentacion: newDoc, updated_at: new Date().toISOString() })
            .eq('id', req.params.id);
        if (updErr) throw updErr;

        res.json({ ok: true, docs_validados: docsValidados, docs_rechazados: docsRechazados, audit_link: auditLink });
    } catch (err) {
        console.error('[validar-doc]', err.message);
        res.status(500).json({ error: 'Error al validar el documento' });
    }
});

// ─── POST /api/expedientes/:id/documentos/validar-cee ─────────────────────────
// Igual que /documentos/validar pero para los documentos del CEE (viven en la
// columna `cee` del expediente, no en `documentacion`): el .XML, el PDF firmado
// (slot "pdf", suffix _fdo.pdf), el Registro (slot "registro") y la Etiqueta
// (slot "etiqueta"), tanto de la fase INICIAL como de la FINAL. Ninguno de ellos
// salvo el PDF lleva firma digital — solo hace falta que exista y sea correcto.
// Copia a "10. EXPEDIENTE CAE" igual que el resto.
// Body: { field: '{inicial|final}_{xml|pdf|registro|etiqueta}' }
// OJO: las etiquetas de inicial_pdf/inicial_registro NO se cambian: son el nombre
// del fichero en la carpeta de auditoría y renombrarlas duplicaría las copias ya
// hechas en expedientes antiguos.
const CEE_VALIDABLE = {
    inicial_xml: { section: 'inicial', slot: 'xml', label: 'CEE Inicial XML', ext: '.xml' },
    inicial_pdf: { section: 'inicial', slot: 'pdf', label: 'CEE Inicial Firmado', ext: '.pdf' },
    inicial_registro: { section: 'inicial', slot: 'registro', label: 'CEE Inicial Registro', ext: '.pdf' },
    inicial_etiqueta: { section: 'inicial', slot: 'etiqueta', label: 'CEE Inicial Etiqueta', ext: '.pdf' },
    final_xml: { section: 'final', slot: 'xml', label: 'CEE Final XML', ext: '.xml' },
    final_pdf: { section: 'final', slot: 'pdf', label: 'CEE Final Firmado', ext: '.pdf' },
    final_registro: { section: 'final', slot: 'registro', label: 'CEE Final Registro', ext: '.pdf' },
    final_etiqueta: { section: 'final', slot: 'etiqueta', label: 'CEE Final Etiqueta', ext: '.pdf' },
};

router.post('/:id/documentos/validar-cee', enforceAuth, async (req, res) => {
    try {
        const field = String(req.body?.field || '').trim();
        const spec = CEE_VALIDABLE[field];
        if (!spec) return res.status(400).json({ error: `field inválido (esperado uno de: ${Object.keys(CEE_VALIDABLE).join(', ')})` });

        const { data: exp, error } = await supabase.from('expedientes').select('*, oportunidades(*)').eq('id', req.params.id).single();
        if (error || !exp) return res.status(404).json({ error: 'Expediente no encontrado' });

        const ceeObj = exp.cee || {};
        const link = ceeObj.cee_files?.[spec.section]?.[spec.slot];
        if (!link) return res.status(400).json({ error: 'El documento aún no tiene un fichero que copiar' });

        let auditLink = null;
        try {
            const op = exp.oportunidades;
            let normalizedDatos = op?.datos_calculo || {};
            if (typeof normalizedDatos === 'string') { try { normalizedDatos = JSON.parse(normalizedDatos); } catch (e) { normalizedDatos = {}; } }
            const driveFolderId = normalizedDatos?.drive_folder_id || normalizedDatos?.inputs?.drive_folder_id || exp.drive_folder_id;
            const fileId = extractDriveFileId(link);

            if (driveFolderId && fileId) {
                const driveService = require('../services/driveService');
                const auditFolderId = await driveService.getOrCreateSubfolderNormalized(driveFolderId, '10. EXPEDIENTE CAE');
                // La extensión real manda (un .xml copiado como .pdf sería ilegible);
                // si Drive no responde, caemos a la esperada por el slot.
                let ext = spec.ext;
                try {
                    const meta = await driveService.getFileMetadata(fileId);
                    const dotIdx = (meta?.name || '').lastIndexOf('.');
                    if (dotIdx > 0) ext = meta.name.substring(dotIdx);
                } catch { /* nos quedamos con spec.ext */ }
                const copyName = `${exp.numero_expediente || ''} - ${spec.label}${ext}`.trim();
                // Re-validación: la copia anterior NO se borra, se archiva en "OLD"
                // como {nombre}_OLD, _OLD1, _OLD2… (trazabilidad de qué se validó antes).
                // Si el archivado falla, borramos para no dejar dos ficheros homónimos.
                const prevId = await driveService.findFileByName(auditFolderId, copyName);
                if (prevId) {
                    const archived = await driveService.archiveExistingToOld(auditFolderId, prevId, copyName);
                    if (!archived) await driveService.deleteFile(prevId);
                }
                const copied = await driveService.copyFile(fileId, auditFolderId, copyName);
                if (copied?.link) auditLink = copied.link;
            }
        } catch (copyErr) {
            console.warn('[validar-cee] No se pudo copiar a "10. EXPEDIENTE CAE":', copyErr.message);
        }

        // A diferencia de /documentos/validar, aquí NO persistimos docs_validados
        // directamente: el frontend (CeeDocumentsGrid) lo hace vía el mismo flujo de
        // guardado que ya usa para el resto del estado `cee` (onManualUpdate + onSave),
        // para no abrir un segundo camino de escritura sobre esa columna.
        res.json({ ok: true, audit_link: auditLink });
    } catch (err) {
        console.error('[validar-cee]', err.message);
        res.status(500).json({ error: 'Error al validar el documento' });
    }
});

// ─── POST /api/expedientes/:id/documentos/firmar-subir ────────────────────────
// Recibe un PDF ya firmado con certificado electrónico (Autofirma, formato PAdES)
// desde el frontend, lo sube a la carpeta de Drive del documento y deja el enlace
// en documentacion[field] (p. ej. ficha_res060_signed_link para el RES080).
// Body: { field, signedPdfBase64, fileName?, subfolderName? }
const FIRMABLE_FIELDS = new Set(Object.keys(DOCUMENTO_VALIDABLE_LABELS));
router.post('/:id/documentos/firmar-subir', enforceAuth, async (req, res) => {
    try {
        console.log(`[firmar-subir] Petición recibida: exp=${req.params.id} field=${req.body?.field} pdf=${Math.round((req.body?.signedPdfBase64?.length || 0) / 1024)}KB`);
        const field = String(req.body?.field || '').trim();
        const signedPdfBase64 = req.body?.signedPdfBase64;
        const subfolderName = String(req.body?.subfolderName || '6. ANEXOS CAE').trim();

        if (!FIRMABLE_FIELDS.has(field)) {
            return res.status(400).json({ error: `field inválido (esperado uno de: ${[...FIRMABLE_FIELDS].join(', ')})` });
        }
        if (!signedPdfBase64 || typeof signedPdfBase64 !== 'string') {
            return res.status(400).json({ error: 'signedPdfBase64 es obligatorio' });
        }

        const { data: exp, error } = await supabase.from('expedientes').select('*, oportunidades(*)').eq('id', req.params.id).single();
        if (error || !exp) return res.status(404).json({ error: 'Expediente no encontrado' });

        const op = exp.oportunidades;
        let datos = op?.datos_calculo || {};
        if (typeof datos === 'string') { try { datos = JSON.parse(datos); } catch (_) { datos = {}; } }
        const driveFolderId = datos?.drive_folder_id || datos?.inputs?.drive_folder_id || exp.drive_folder_id;
        if (!driveFolderId) return res.status(422).json({ error: 'El expediente no tiene carpeta de Drive asociada' });

        const pdfBuffer = Buffer.from(signedPdfBase64, 'base64');
        if (!pdfBuffer.length || pdfBuffer[0] !== 0x25 || pdfBuffer[1] !== 0x50) {
            return res.status(400).json({ error: 'El contenido recibido no es un PDF válido' });
        }

        const driveService = require('../services/driveService');
        const targetFolderId = await driveService.getOrCreateSubfolder(driveFolderId, subfolderName);

        const baseName = (req.body?.fileName || `${exp.numero_expediente || ''} - ${DOCUMENTO_VALIDABLE_LABELS[field] || field} (FIRMADO)`).trim();
        const safeName = baseName.replace(/[\\/<>:"|?*]/g, '_').replace(/\.pdf$/i, '') + '.pdf';

        // Versiona la firma previa: si ya existe una con el mismo nombre, la MUEVE a la
        // subcarpeta "OLD" (renombrada `_OLD`) en vez de borrarla, para conservar el
        // histórico de firmas (re-firmas / re-generaciones del anexo).
        const prevId = await driveService.findFileByName(targetFolderId, safeName);
        if (prevId) {
            try { await driveService.archiveExistingToOld(targetFolderId, prevId, safeName); }
            catch (_) {}
        }

        const saved = await driveService.saveFileToFolder(targetFolderId, safeName, 'application/pdf', pdfBuffer);
        if (!saved?.link) throw new Error('No se pudo guardar el PDF firmado en Drive');

        // Marca el campo firmado y anula la validación/rechazo previos: el fichero es
        // otro, así que el slot vuelve a ámbar (pendiente de revisar) salvo que lo
        // firmemos nosotros (AUTO_VALIDATE_ON_SIGN, más abajo).
        const docObj = exp.documentacion || {};
        const newDoc = invalidarValidacionDocs(
            { ...docObj, [field]: saved.link },
            field,
            { usuario: req.user?.rol_nombre === 'ADMIN' ? 'ADMINISTRADOR' : (req.user?.acronimo || req.user?.razon_social || 'SISTEMA'), origen: 'firmada con certificado' }
        );
        // Si Brokergy firma el Anexo de Cesión (contrafirma tras el cliente), marcar
        // la firma de Brokergy como completada.
        if (field === 'anexo_cesion_signed_link') newDoc.cesion_firmado_brokergy = true;

        // Auto-validación (verde) + copia a auditoría "10. EXPEDIENTE CAE" en el mismo
        // paso, igual que /documentos/validar.
        let auditLink = null;
        const autoValidated = AUTO_VALIDATE_ON_SIGN.has(field);
        if (autoValidated) {
            newDoc.docs_validados = { ...(newDoc.docs_validados || {}), [field]: new Date().toISOString() };
            try {
                const auditFolderId = await driveService.getOrCreateSubfolderNormalized(driveFolderId, '10. EXPEDIENTE CAE');
                const baseLabel = DOCUMENTO_VALIDABLE_LABELS[field] || field.replace(/_/g, ' ');
                const copyName = `${exp.numero_expediente || ''} - ${baseLabel}.pdf`.trim();
                // La copia anterior se archiva en OLD (no se pierde la versión validada
                // previa), y la nueva la sustituye — igual que /documentos/validar.
                const prevAudit = await driveService.findFileByName(auditFolderId, copyName);
                if (prevAudit) {
                    try {
                        const archived = await driveService.archiveExistingToOld(auditFolderId, prevAudit, copyName);
                        if (!archived) await driveService.deleteFile(prevAudit);
                    } catch (_) { try { await driveService.deleteFile(prevAudit); } catch (__) {} }
                }
                const copied = await driveService.copyFile(saved.id, auditFolderId, copyName);
                if (copied?.link) auditLink = copied.link;
            } catch (copyErr) {
                console.warn('[firmar-subir] No se pudo copiar a "10. EXPEDIENTE CAE":', copyErr.message);
            }
        }

        const { error: updErr } = await supabase.from('expedientes')
            .update({ documentacion: newDoc, updated_at: new Date().toISOString() })
            .eq('id', req.params.id);
        if (updErr) throw updErr;

        console.log(`[firmar-subir] Exp ${exp.numero_expediente}: ${field} firmado → ${saved.link}${autoValidated ? ' (validado + auditoría)' : ''}`);
        res.json({ ok: true, field, signed_link: saved.link, validated: autoValidated, audit_link: auditLink });
    } catch (err) {
        console.error('[firmar-subir]', err.message);
        res.status(500).json({ error: 'Error al subir el PDF firmado', details: err.message });
    }
});

// ─── POST /api/expedientes/:id/documentos/cesion-manuscrita ───────────────────
// Monta y sube el Anexo de Cesión firmado A MANO desde la app, igual que ya hacía
// la página pública /firmar-anexos: [escaneo firmado] + [DNI del cliente, las dos
// caras en UNA página] + [DNI del representante de Brokergy como ÚLTIMA página].
//
// Por qué existe: cuando el cliente devuelve el anexo por correo/en mano, el escaneo
// se subía al slot TAL CUAL y quedaba un anexo manuscrito sin identificar a las dos
// partes — el mismo documento que por el enlace público salía completo. El montaje es
// fuente única (utils/dniAnexo.js), así que los dos caminos producen el MISMO PDF.
//
// El DNI del cliente no se pide dos veces: si el expediente ya tiene la página montada
// (`documentacion.dni_link`, típico de un cliente que ya subió el DNI por el enlace),
// se reutiliza y basta con soltar el escaneo. Subir caras nuevas manda sobre ella.
//
// Multipart: cesion (obligatorio) · dni_frontal · dni_trasero (imágenes)
const cesionUpload = require('multer')({
    storage: require('multer').memoryStorage(),
    limits: { fileSize: 30 * 1024 * 1024, files: 3 },
});

router.post('/:id/documentos/cesion-manuscrita', enforceAuth, (req, res, next) => {
    cesionUpload.fields([
        { name: 'cesion', maxCount: 1 },
        { name: 'dni_frontal', maxCount: 1 },
        { name: 'dni_trasero', maxCount: 1 },
    ])(req, res, (err) => {
        if (err) {
            if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Algún fichero supera los 30 MB.' });
            console.error('[cesion-manuscrita] multer:', err.message);
            return res.status(400).json({ error: 'No se pudieron procesar los ficheros.' });
        }
        next();
    });
}, async (req, res) => {
    try {
        const cesionFile = req.files?.cesion?.[0];
        const frontFile = req.files?.dni_frontal?.[0] || null;
        const backFile = req.files?.dni_trasero?.[0] || null;
        if (!cesionFile) return res.status(400).json({ error: 'Falta el Anexo de Cesión firmado (campo "cesion").' });
        if ((frontFile && !backFile) || (!frontFile && backFile)) {
            return res.status(400).json({ error: 'El DNI se anexa por las DOS caras: faltan la delantera o la trasera.' });
        }

        // OJO: `expedientes` NO tiene columna drive_folder_id (la carpeta vive en
        // oportunidades.datos_calculo). Nombrarla aquí hacía que PostgREST devolviera
        // error y la ruta respondiera "Expediente no encontrado" en TODOS los casos.
        const { data: exp, error } = await supabase
            .from('expedientes')
            .select('id, numero_expediente, documentacion, oportunidades!oportunidad_id(datos_calculo)')
            .eq('id', req.params.id)
            .maybeSingle();
        if (error) {
            console.error('[cesion-manuscrita] select:', error.message);
            return res.status(500).json({ error: 'No se pudo leer el expediente', details: error.message });
        }
        if (!exp) return res.status(404).json({ error: 'Expediente no encontrado' });

        let datos = exp.oportunidades?.datos_calculo || {};
        if (typeof datos === 'string') { try { datos = JSON.parse(datos); } catch (_) { datos = {}; } }
        const driveFolderId = datos?.drive_folder_id || datos?.inputs?.drive_folder_id;
        if (!driveFolderId) return res.status(422).json({ error: 'El expediente no tiene carpeta de Drive asociada' });

        const driveService = require('../services/driveService');
        const { buildCesionManuscrita } = require('../utils/dniAnexo');
        const docObj = exp.documentacion || {};
        const numexpte = exp.numero_expediente || exp.id;

        // DNI que ya tuviera el expediente: se baja de Drive solo si no llegan caras
        // nuevas (una petición menos en el caso rápido, que es el habitual).
        // `dni_link` es la página con las dos caras; los expedientes antiguos guardaron
        // las caras SUELTAS (`dni_frontal_link` / `dni_trasero_link`) y ahí se
        // concatenan las dos — el objetivo es no volver a pedir un DNI que ya tenemos.
        const bajarDrive = async (link) => {
            const id = link && extractDriveFileId(link);
            if (!id) return null;
            const buf = await driveService.getFileContent(id);
            return buf?.length ? Buffer.from(buf) : null;
        };
        let dniPdfPrevio = null;
        if (!frontFile) {
            try {
                if (docObj.dni_link) {
                    dniPdfPrevio = await bajarDrive(docObj.dni_link);
                } else if (docObj.dni_frontal_link && docObj.dni_trasero_link) {
                    const { mergePdfs } = require('../utils/dniAnexo');
                    const [f, b] = await Promise.all([bajarDrive(docObj.dni_frontal_link), bajarDrive(docObj.dni_trasero_link)]);
                    if (f && b) dniPdfPrevio = await mergePdfs(f, [b]);
                }
            } catch (e) { console.warn('[cesion-manuscrita] DNI previo no descargable:', e.message); }
        }

        const { pdf, dniPage, incluidos, faltan } = await buildCesionManuscrita(
            cesionFile.buffer,
            cesionFile.mimetype,
            { dniFront: frontFile?.buffer, dniBack: backFile?.buffer, dniPdf: dniPdfPrevio },
        );

        const subfolderId = await driveService.getOrCreateSubfolder(driveFolderId, '6. ANEXOS CAE');
        // El anexo anterior se ARCHIVA en OLD, no se borra (mismo versionado que el
        // resto de firmados): si esta subida corrige una que rechazamos, la mala queda.
        const guardar = async (name, buffer) => {
            const prev = await driveService.findFileByName(subfolderId, name);
            if (prev) {
                try { await driveService.archiveExistingToOld(subfolderId, prev, name); }
                catch (e) { console.warn('[cesion-manuscrita] no se pudo archivar el previo:', e.message); }
            }
            const saved = await driveService.saveFileToFolder(subfolderId, name, 'application/pdf', buffer);
            if (saved?.id) { try { await driveService.setFolderPublic(saved.id, 'reader'); } catch (e) {} }
            return saved;
        };

        const saved = await guardar(`${numexpte} - Anexo Cesión ahorro_fdo.pdf`, pdf);
        if (!saved?.link) throw new Error('No se pudo guardar el anexo montado en Drive');

        // La página de DNI recién montada se guarda aparte: es la que reutilizarán las
        // siguientes subidas (y la que ya usaba el flujo público).
        let dniLink = docObj.dni_link || null;
        if (dniPage) {
            const savedDni = await guardar(`${numexpte} - DNI.pdf`, dniPage);
            if (savedDni?.link) dniLink = savedDni.link;
        }

        const usuario = req.user?.rol_nombre === 'ADMIN' ? 'ADMINISTRADOR' : (req.user?.acronimo || req.user?.razon_social || 'SISTEMA');
        let newDoc = invalidarValidacionDocs(
            {
                ...docObj,
                anexo_cesion_signed_link: saved.link,
                anexo_cesion_firma_tipo: 'manuscrita',
                // El escaneo ya lleva las dos firmas físicas: no falta contrafirma digital.
                cesion_firmado_brokergy: true,
                ...(dniLink ? { dni_link: dniLink } : {}),
            },
            'anexo_cesion_signed_link',
            { usuario, origen: 'firma manuscrita montada desde la app' },
        );
        const historial = Array.isArray(newDoc.historial) ? [...newDoc.historial] : [];
        historial.push({
            id: `${Date.now()}_cesion_manuscrita`,
            tipo: 'doc_montado',
            texto: `Anexo de Cesión manuscrito montado y subido: ${incluidos.join(' + ')}`
                + (faltan.length ? ` · SIN: ${faltan.join(', ')}` : ''),
            campo: 'anexo_cesion_signed_link',
            fecha: new Date().toISOString(),
            usuario,
        });
        newDoc = { ...newDoc, historial };

        const { error: updErr } = await supabase.from('expedientes')
            .update({ documentacion: newDoc, updated_at: new Date().toISOString() })
            .eq('id', req.params.id);
        if (updErr) throw updErr;

        res.json({
            ok: true,
            signed_link: saved.link,
            dni_link: dniLink,
            incluidos,
            faltan,
            documentacion: newDoc,
        });
    } catch (err) {
        console.error('[cesion-manuscrita]', err.message);
        res.status(500).json({ error: 'No se pudo montar el Anexo de Cesión', details: err.message });
    }
});

// ─── GET /api/expedientes/:id/documento-b64/:field ────────────────────────────
// Devuelve en base64 el PDF actual de un documento (por su campo en documentacion)
// para firmarlo con certificado desde la app (p. ej. Brokergy contrafirma el Anexo
// de Cesión ya firmado por el cliente). Si el campo no tiene fichero, 404.
router.get('/:id/documento-b64/:field', enforceAuth, async (req, res) => {
    try {
        const field = String(req.params.field || '').trim();
        if (!FIRMABLE_FIELDS.has(field) && !field.endsWith('_drive_link')) {
            return res.status(400).json({ error: 'field no permitido' });
        }
        const { data: exp, error } = await supabase.from('expedientes').select('documentacion').eq('id', req.params.id).single();
        if (error || !exp) return res.status(404).json({ error: 'Expediente no encontrado' });
        const link = (exp.documentacion || {})[field];
        if (!link) return res.status(404).json({ error: 'El documento no existe todavía' });
        const fileId = extractDriveFileId(link);
        if (!fileId) return res.status(422).json({ error: 'Enlace de Drive no válido' });
        const { getFileContent } = require('../services/driveService');
        const buf = await getFileContent(fileId);
        if (!buf || !buf.length) return res.status(502).json({ error: 'No se pudo descargar el documento' });
        res.json({ pdf: Buffer.from(buf).toString('base64') });
    } catch (err) {
        console.error('[documento-b64]', err.message);
        res.status(500).json({ error: 'Error al obtener el documento' });
    }
});

// ─── POST /api/expedientes/:id/anexo-fotografico/generar ──────────────────────
// Genera el Anexo Fotográfico DESDE las fotos ya nombradas por slot en Drive
// ("12. DOCUMENTOS PARA CEE"), lo guarda en "6. ANEXOS CAE" y deja el enlace en
// documentacion.anexo_fotografico_drive_link. Pensado para el flujo AUTOMÁTICO
// (skill de Cowork vía herramienta MCP) y también accesible por el equipo interno.
//
// Guard: sesión interna (ADMIN/CERTIFICADOR/TRABAJADOR) O la clave interna
// compartida con el servidor MCP. `internalKeyOrAuth` se define arriba (junto al
// guard global del módulo), porque estas rutas lo referencian antes de este punto.
//
// El MODAL del anexo usa esta misma ruta para descargar / firmar / guardar en Drive
// (body: { devolverPdf, guardarEnDrive, photoSizes, recortes }). Antes subía el HTML
// con todas las fotos en base64 y con expedientes grandes daba 413 (64 MB > 50 MB).
// Sin body, el comportamiento es el de siempre: generar y archivar (lo que usa el MCP).
router.post('/:id/anexo-fotografico/generar', internalKeyOrAuth, async (req, res) => {
    try {
        const { devolverPdf, guardarEnDrive, photoSizes, recortes } = req.body || {};
        const result = await anexoFotograficoService.generateAndSaveAnexo(req.params.id, {
            devolverPdf: devolverPdf === true,
            guardarEnDrive: guardarEnDrive !== false,
            photoSizes: photoSizes || {},
            recortes: recortes || {},
        });
        if (!result.ok) return res.status(422).json(result);

        // El PDF se devuelve BINARIO, no en base64 dentro del JSON: un anexo de 67
        // fotos son 20 MB, que en base64 se convierten en 27 MB de texto y obligan al
        // navegador a parsear ese JSON y decodificarlo entero en memoria. Los datos
        // que acompañan al documento viajan en cabeceras.
        if (result.pdfBuffer) {
            res.set({
                'Content-Type': 'application/pdf',
                'Content-Length': result.pdfBuffer.length,
                'X-Num-Photos': String(result.numPhotos ?? ''),
                'X-Num-Actuaciones': String(result.numActuaciones ?? ''),
                'X-Drive-Link': result.link || '',
                // Sin esto el navegador no ve las X-* (petición de distinto origen en dev).
                'Access-Control-Expose-Headers': 'X-Num-Photos, X-Num-Actuaciones, X-Drive-Link',
            });
            return res.send(result.pdfBuffer);
        }
        res.json(result);
    } catch (e) {
        console.error('[anexo-fotografico/generar]', e);
        res.status(500).json({ ok: false, message: 'Error interno al generar el anexo fotográfico', error: e.message });
    }
});

// ─── PUT /api/expedientes/:id/anexo-fotografico/config ────────────────────────
// Ajustes del Anexo Fotográfico que NO son ficheros:
//   · `comentarios` { <SLOT>: 'texto' } — explicación de un concepto; se imprime
//     bajo la banda de su fase, y solo si tiene texto.
//   · `excluidas`   [ 'FOTO_X_1.jpg', … ] — fotos que NO entran en el documento.
//     La foto SIGUE en Drive: es documentación del expediente, solo se omite aquí.
//   · `orden`       { <SLOT>: ['FOTO_X_3.jpg', 'FOTO_X_1.jpg', …] } — orden manual
//     de las fotos dentro de un concepto. El orden de las filas ES el orden del PDF.
// Viven en `documentacion` para que el PDF salga igual por el modal y por el MCP.
// Escritura acotada: relee `documentacion` y toca SOLO estas dos claves, así un
// guardado en paralelo del detalle del expediente no las pisa ni las borra.
// GET: los ajustes VIGENTES en BD. El modal los relee al abrirse en vez de fiarse
// del objeto `expediente` que el frontend tiene en memoria: ese se cargó al entrar
// en el expediente y no se entera de lo que guardó el propio anexo, así que las
// fotos quitadas "reaparecían" y el orden y los comentarios se veían vacíos.
router.get('/:id/anexo-fotografico/config', staffOnly, async (req, res) => {
    try {
        const { data: exp, error } = await supabase
            .from('expedientes').select('documentacion').eq('id', req.params.id).maybeSingle();
        if (error || !exp) return res.status(404).json({ error: 'Expediente no encontrado' });
        const doc = exp.documentacion || {};
        res.json({
            comentarios: doc.anexo_comentarios || {},
            excluidas: doc.anexo_excluidas || [],
            orden: doc.anexo_orden || {},
        });
    } catch (e) {
        console.error('[anexo-fotografico/config GET]', e);
        res.status(500).json({ error: 'No se pudieron leer los ajustes del anexo' });
    }
});

router.put('/:id/anexo-fotografico/config', staffOnly, async (req, res) => {
    try {
        const { comentarios, excluidas, orden } = req.body || {};
        const { data: exp, error } = await supabase
            .from('expedientes').select('documentacion').eq('id', req.params.id).maybeSingle();
        if (error || !exp) return res.status(404).json({ error: 'Expediente no encontrado' });

        const docObj = exp.documentacion || {};
        if (comentarios !== undefined) {
            // Se descartan los vacíos: un comentario borrado no debe dejar rastro
            // (si no, el bloque se imprimiría con una caja vacía).
            docObj.anexo_comentarios = Object.fromEntries(
                Object.entries(comentarios || {})
                    .map(([k, v]) => [k, String(v ?? '').trim()])
                    .filter(([, v]) => v)
            );
        }
        if (excluidas !== undefined) {
            docObj.anexo_excluidas = [...new Set((excluidas || []).filter(Boolean).map(String))];
        }
        if (orden !== undefined) {
            docObj.anexo_orden = Object.fromEntries(
                Object.entries(orden || {})
                    .map(([slot, lista]) => [slot, [...new Set((lista || []).filter(Boolean).map(String))]])
                    .filter(([, lista]) => lista.length)
            );
        }

        const { error: upErr } = await supabase
            .from('expedientes')
            .update({ documentacion: docObj, updated_at: new Date().toISOString() })
            .eq('id', req.params.id);
        if (upErr) throw upErr;

        res.json({
            success: true,
            comentarios: docObj.anexo_comentarios || {},
            excluidas: docObj.anexo_excluidas || [],
            orden: docObj.anexo_orden || {},
        });
    } catch (e) {
        console.error('[anexo-fotografico/config]', e);
        res.status(500).json({ error: 'No se pudieron guardar los ajustes del anexo' });
    }
});

// ─── GET /api/expedientes/:id/anexo-fotografico/estado ─────────────────────────
// Estado ligero (sin descargar imágenes): qué slots de foto espera el expediente
// según sus actuaciones, cuáles ya tienen fotos en "12. DOCUMENTOS PARA CEE" y
// cuáles faltan. Orienta a la skill sobre con qué nombre renombrar cada foto.
router.get('/:id/anexo-fotografico/estado', internalKeyOrAuth, async (req, res) => {
    try {
        const { data: exp, error } = await supabase
            .from('expedientes')
            .select('id, numero_expediente, documentacion, oportunidad_id')
            .eq('id', req.params.id)
            .maybeSingle();
        if (error || !exp) return res.status(404).json({ ok: false, message: 'Expediente no encontrado' });

        const { data: op } = exp.oportunidad_id
            ? await supabase.from('oportunidades').select('id, datos_calculo').eq('id', exp.oportunidad_id).maybeSingle()
            : { data: null };

        // Mismo saneado de alcance que la generación: la Envolvente del RES080
        // habilita sus apartados de foto antes de decir qué falta. Si no, la skill
        // recibiría una lista de slots que no incluye ventanas/cubierta/fachada.
        const dc = await anexoFotograficoService.syncEnvolventeAndReload(exp, op);
        const status = await anexoFotograficoService.getAnexoStatus(dc);
        res.json({
            ok: true,
            numero_expediente: exp.numero_expediente,
            anexo_link_actual: exp.documentacion?.anexo_fotografico_drive_link || null,
            ...status,
        });
    } catch (e) {
        console.error('[anexo-fotografico/estado]', e);
        res.status(500).json({ ok: false, message: 'Error interno', error: e.message });
    }
});

// ─── POST /api/expedientes/:id/cifo/generar ──────────────────────────────────
// Genera el Certificado CIFO (RES060/RES093/TER100) con el MISMO builder que el modal
// (features/expedientes/logic/cifoDoc.js), fusiona las fichas técnicas, lo guarda
// en "6. ANEXOS CAE" y enlaza documentacion.cert_cifo_drive_link. Registra
// incidencias LEVE por lo que falte (y GRAVE, sin generar, si es imposible).
// Flujo AUTOMÁTICO (skill de Cowork vía MCP) y también accesible por el equipo.
router.post('/:id/cifo/generar', internalKeyOrAuth, async (req, res) => {
    try {
        const force = req.body?.force === true;
        const result = await cifoService.generarCifo(req.params.id, { force });
        if (!result.ok) return res.status(422).json(result);
        res.json(result);
    } catch (e) {
        console.error('[cifo/generar]', e);
        res.status(500).json({ ok: false, message: 'Error interno al generar el CIFO', error: e.message });
    }
});

// ─── GET /api/expedientes/:id/cifo/estado ─────────────────────────────────────
// Estado del CIFO: tipología, si puede generarse, qué falta (bloqueante) y avisos.
router.get('/:id/cifo/estado', internalKeyOrAuth, async (req, res) => {
    try {
        const result = await cifoService.getEstadoCifo(req.params.id);
        if (!result.ok && result.message && !result.tipologia) return res.status(404).json(result);
        res.json(result);
    } catch (e) {
        console.error('[cifo/estado]', e);
        res.status(500).json({ ok: false, message: 'Error interno', error: e.message });
    }
});

// ─── POST /api/expedientes/:id/justificante ───────────────────────────────────
// Sube el justificante de titularidad bancaria desde admin (barrido o ficha de
// cliente). Escribe EXACTAMENTE donde la subida pública del cliente: carpeta raíz
// del expediente en Drive (justificante de titularidad bancaria.pdf) y el campo
// documentacion.justificante_titularidad_link. Acepta PDF o imagen (base64).
router.post('/:id/justificante', enforceAuth, async (req, res) => {
    try {
        const { base64, mimeType } = req.body;
        if (!base64 || String(base64).trim() === '') return res.status(400).json({ error: 'Archivo requerido' });
        const { data: exp, error } = await supabase.from('expedientes').select('id, documentacion, oportunidad_id').eq('id', req.params.id).maybeSingle();
        if (error || !exp) return res.status(404).json({ error: 'Expediente no encontrado' });
        const { data: op } = await supabase.from('oportunidades').select('datos_calculo').eq('id', exp.oportunidad_id).single();
        const driveFolderId = op?.datos_calculo?.drive_folder_id || op?.datos_calculo?.inputs?.drive_folder_id;
        if (!driveFolderId) return res.status(400).json({ error: 'El expediente no tiene carpeta Drive configurada' });

        const driveService = require('../services/driveService');
        let buf = Buffer.from(base64, 'base64');
        const mime = mimeType || 'application/pdf';
        if (mime !== 'application/pdf' && mime.startsWith('image/')) {
            const { PDFDocument } = require('pdf-lib');
            const pdfDoc = await PDFDocument.create();
            const img = mime === 'image/png' ? await pdfDoc.embedPng(buf) : await pdfDoc.embedJpg(buf);
            const { width, height } = img.scale(1);
            const page = pdfDoc.addPage([width, height]);
            page.drawImage(img, { x: 0, y: 0, width, height });
            buf = Buffer.from(await pdfDoc.save());
        }
        const name = 'justificante de titularidad bancaria.pdf';
        try { const existing = await driveService.findFileByName(driveFolderId, name); if (existing) await driveService.deleteFile(existing); } catch (e) {}
        const r = await driveService.saveFileToFolder(driveFolderId, name, 'application/pdf', buf);
        if (!r?.link) return res.status(500).json({ error: 'No se pudo guardar en Drive' });
        try { if (r.id) await driveService.setFolderPublic(r.id, 'reader'); } catch (e) {}

        const docUpdate = { ...(exp.documentacion || {}), justificante_titularidad_link: r.link };
        await supabase.from('expedientes').update({ documentacion: docUpdate }).eq('id', req.params.id);
        res.json({ success: true, link: r.link });
    } catch (e) {
        console.error('[justificante upload] Error:', e);
        res.status(500).json({ error: 'Error al subir el justificante', message: e.message });
    }
});

const expedienteService = require('../services/expedienteService');

// ─── POST /api/expedientes/:id/comunicar-cee-inicial ──────────────────────────
// Envía un mensaje automático al cliente informando de la presentación del CEE Inicial
router.post('/:id/comunicar-cee-inicial', enforceAuth, async (req, res) => {
    // Esta ruta ha sido desactivada en favor del endpoint manual /notify-registration.
    // Se mantiene como placeholder para no romper posibles disparadores externos (webhooks).
    console.log(`[Deprecation] Intento de llamada a comunicar-cee-inicial para expediente ${req.params.id}. Ignorado.`);
    res.json({ success: true, message: 'Endpoint deprecado. Use /notify-registration en su lugar.' });
});

// ─── POST /api/expedientes/:id/notify-registration ────────────────────────────
// Envía notificaciones manuales (seleccionadas por el usuario) al registrar un CEE
router.post('/:id/notify-registration', enforceAuth, async (req, res) => {
    try {
        const { id } = req.params;
        // `notifyStaff`: copia del aviso de "registro presentado" al staff. El PUT ya
        // NO lo manda cuando el registro lo sube un admin desde el panel (`notify_staff:
        // false`), así que la decisión es de este popup: si el admin pulsa "Enviar
        // notificaciones", se queda constancia en el buzón; si pulsa "Omitir", no llega
        // nada a nadie — que era justo la queja.
        const { target, type, channels = ['email', 'whatsapp'], notifyStaff = false } = req.body;

        const sendEmail = channels.includes('email');
        const sendWA = channels.includes('whatsapp');

        const { data: exp, error: expErr } = await supabase.from('expedientes').select('*').eq('id', id).single();
        if (expErr || !exp) return res.status(404).json({ error: 'Expediente no encontrado' });

        const [{ data: cli }, { data: op }] = await Promise.all([
            supabase.from('clientes').select('*').eq('id_cliente', exp.cliente_id).single(),
            supabase.from('oportunidades').select('*').eq('id', exp.oportunidad_id).single()
        ]);

        if (!cli || !op) return res.status(404).json({ error: 'Datos de cliente u oportunidad no encontrados' });

        const numExp = (exp.numero_expediente || op.id_oportunidad || '—').trim();
        const clienteName = (cli.nombre_razon_social || 'Cliente').trim();
        const clienteFull = `${cli.nombre_razon_social || ''} ${cli.apellidos || ''}`.trim();
        const ubicacion = `${cli.direccion || ''} - ${cli.codigo_postal || ''} ${cli.municipio || ''} (${cli.provincia || ''})`.trim();
        // Enlace UNIFICADO de subida de fotos/docs (/subir-docs/:uuid?token=)
        const uploadLink = await reformaUploadService.ensureUploadLink(op.id);
        const labelType = type === 'final' ? 'Final' : 'Inicial';

        const photoTextEmail = `📸 Recuerda hacerle fotografías a todo:
• Caldera existente y placa de fabricación.
• Desmontaje de la caldera.
• Montaje de la aerotermia.
• Fotos de las nuevas placas de fabricación (tanto de la unidad exterior como de la interior).

Las fotos son la parte más importante del proceso para que podamos argumentar ante el ministerio que se ha realizado la reforma.

Puedes subirlas directamente al expediente a través de este enlace:
🔗 ${uploadLink}`;

        const photoTextWA = `📸 Recuerda hacerle fotografías a todo:
• *Caldera existente y placa de fabricación.*
• *Desmontaje de la caldera.*
• *Montaje de la aerotermia.*
• *Fotos de las nuevas placas de fabricación* (tanto de la unidad exterior como de la interior).

Las fotos son la parte más importante del proceso para que podamos argumentar ante el ministerio que se ha realizado la reforma.

Puedes subirlas directamente al expediente a través de este enlace:
🔗 ${uploadLink}`;

        const closingTextEmail = `Una vez finalizada la obra, debes comunicárnoslo por aquí para proceder con el CEE Final y el resto de la documentación.\n\n¡Muchas gracias!\nBROKERGY — Ingeniería Energética`;
        const closingTextWA = `Una vez finalizada la obra, debes comunicárnoslo por aquí para proceder con el CEE Final y el resto de la documentación.\n\n¡Muchas gracias!\n*BROKERGY — Ingeniería Energética*`;

        // ─── NOTIFICACIÓN AL CLIENTE ───────────────────────────────────────────
        if (target === 'CLIENTE' || target === 'AMBOS') {
            const subject = `Certificado de Eficiencia Energética ${labelType} presentado - Expediente ${numExp}`;
            
            // Email (Normal)
            if (sendEmail && cli.email) {
                const intro = `¡Hola ${clienteName}!\n\nTe escribimos para comunicarte que ya ha sido presentado el Certificado de Eficiencia Energética ${labelType} de tu expediente ${numExp}.`;
                const body = type === 'inicial' 
                    ? `${intro}\n\n${photoTextEmail}\n\n${closingTextEmail}`
                    : `${intro}\n\nYa puedes proceder con los siguientes pasos de tu expediente.\n\n¡Muchas gracias!\nBROKERGY — Ingeniería Energética`;
                await emailService.sendMail({ to: cli.email, subject, text: body }).catch(e => console.error('Error Email Cliente:', e.message));
            }

            // WhatsApp (Negritas)
            const cliWaPhone = (cli.notificaciones_contacto_activas && cli.persona_contacto_tlf) ? cli.persona_contacto_tlf : cli.tlf;
            if (sendWA && cliWaPhone && whatsappService) {
                const waIntro = `¡Hola *${clienteName}*!\n\nTe escribimos para comunicarte que ya ha sido presentado el *Certificado de Eficiencia Energética ${labelType.toUpperCase()}* de tu expediente *${numExp}*.`;
                const waBody = type === 'inicial'
                    ? `${waIntro}\n\n${photoTextWA}\n\n${closingTextWA}`
                    : `${waIntro}\n\nYa puedes proceder con los siguientes pasos de tu expediente.\n\n¡Muchas gracias!\n*BROKERGY — Ingeniería Energética*`;
                await whatsappService.sendText(cliWaPhone, waBody).catch(e => console.error('Error WA Cliente:', e.message));
            }
        }

        // ─── NOTIFICACIÓN AL PARTNER ───────────────────────────────────────────
        if (target === 'PARTNER' || target === 'AMBOS') {
            if (op.prescriptor_id) {
                const { data: partner } = await supabase.from('prescriptores').select('*').eq('id_empresa', op.prescriptor_id).maybeSingle();
                if (partner) {
                    // Lista de destinatarios (varios interlocutores posibles). Si la
                    // redirección de notificaciones está activa, se avisa a TODOS los
                    // contactos configurados; si no, al contacto principal del partner.
                    const targets = partnerNotifyTargets(partner);
                    console.log(`[Notify] Partner ${partner.id_empresa} → ${targets.length} destinatario(s)`,
                        targets.map(t => ({ email: t.email, tlf: t.tlf })));

                    const partnerSubject = `${numExp} - ${clienteFull} · CEE ${labelType.toUpperCase()} Presentado`;

                    for (const c of targets) {
                        const partnerName = (c.nombre || partner.acronimo || partner.razon_social || 'Partner').trim();

                        // Email (Normal)
                        if (sendEmail && c.email) {
                            const intro = `¡Hola ${partnerName}!\n\nTe informamos que ya se ha presentado el Certificado de Eficiencia Energética ${labelType} de tu cliente:`;
                            const info = `Cliente: ${clienteFull}\nDirección: ${ubicacion}\nExpediente: ${numExp}`;
                            const body = type === 'inicial'
                                ? `${intro}\n\n${info}\n\n${photoTextEmail}\n\n${closingTextEmail}`
                                : `${intro}\n\n${info}\n\nEl proceso continúa según lo previsto.\n\n¡Muchas gracias!\nBROKERGY — Ingeniería Energética`;
                            await emailService.sendMail({ to: c.email, subject: partnerSubject, text: body }).catch(e => console.error('Error Email Partner:', e.message));
                        }

                        // WhatsApp (Negritas)
                        if (sendWA && c.tlf && whatsappService) {
                            const waIntro = `¡Hola *${partnerName}*!\n\nTe informamos que ya se ha presentado el *Certificado de Eficiencia Energética ${labelType.toUpperCase()}* de tu cliente:`;
                            const waInfo = `*Cliente:* *${clienteFull}*\n*Dirección:* ${ubicacion}\n*Expediente:* ${numExp}`;
                            const waBody = type === 'inicial'
                                ? `${waIntro}\n\n${waInfo}\n\n${photoTextWA}\n\n${closingTextWA}`
                                : `${waIntro}\n\n${waInfo}\n\nEl proceso continúa según lo previsto.\n\n¡Muchas gracias!\n*BROKERGY — Ingeniería Energética*`;
                            await whatsappService.sendText(c.tlf, waBody).catch(e => console.error('Error WA Partner:', e.message));
                        }
                    }
                }
            }
        }

        // ─── COPIA AL STAFF ────────────────────────────────────────────────────
        // Sin `notifyClientLink`: el cliente acaba de ser avisado desde aquí, ofrecer
        // el botón de "Notificar al Cliente" solo invitaría a duplicar el aviso.
        if (notifyStaff) {
            const certNombre = await getCertificadorNombre(exp).catch(() => '');
            await emailService.sendCeeRegistradoStaffEmail(
                'franciscojavier.moya.s2e2@gmail.com', false, numExp, clienteFull, ubicacion,
                certNombre, `CEE ${labelType.toUpperCase()}`, `https://app.brokergy.es/expedientes/${id}`
            ).catch(e => console.error('[notify-registration] Email Staff:', e.message));
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Error notify-registration:', err);
        res.status(500).json({ error: 'Error al enviar notificaciones' });
    }
});

// ─── POST /api/expedientes ────────────────────────────────────────────────────
// Crea un nuevo expediente. Requiere oportunidad_id y cliente_id.
// Este endpoint es usado por el panel de administración y por la calculadora (aceptar)
router.post('/', enforceAuth, async (req, res) => {
    try {
        const { oportunidad_id, cliente_id, numero_expediente } = req.body;

        if (!oportunidad_id) return res.status(400).json({ error: 'oportunidad_id es obligatorio' });
        if (!cliente_id)     return res.status(400).json({ error: 'cliente_id es obligatorio' });

        // 1. Obtener la oportunidad para validar pertenencia y obtener datos para notificación
        const { data: op, error: opErr } = await supabase
            .from('oportunidades')
            .select('*, clientes(*)')
            .eq('id', oportunidad_id)
            .single();

        if (opErr || !op) return res.status(404).json({ error: 'Oportunidad no encontrada' });

        // 2. Si no es ADMIN, validar que sea su oportunidad
        if (req.user.rol_nombre !== 'ADMIN') {
            if (String(op.prescriptor_id) !== String(req.user.prescriptor_id)) {
                return res.status(403).json({ error: 'No tienes permiso para aceptar esta oportunidad' });
            }
        }

        // 3. Llamar al servicio centralizado para crear el expediente
        const newExp = await expedienteService.createExpediente(oportunidad_id, cliente_id, numero_expediente);

        // 3b. Registrar aceptación en historial de la oportunidad
        if (op.datos_calculo?.estado !== 'ACEPTADA') {
            const usuarioLabel = req.user.rol_nombre === 'ADMIN'
                ? `Firma Administrador (${req.user.email})`
                : `Firma Partner (${req.user.razon_social || req.user.acronimo || req.user.email})`;
            const historialEntry = {
                id: Date.now().toString() + '_aceptacion',
                tipo: 'cambio_estado',
                estado: 'ACEPTADA',
                fecha: new Date().toISOString(),
                usuario: usuarioLabel,
            };
            const newHistorial = [...(op.datos_calculo?.historial || []), historialEntry];
            supabase.from('oportunidades').update({
                datos_calculo: { ...(op.datos_calculo || {}), estado: 'ACEPTADA', historial: newHistorial }
            }).eq('id', oportunidad_id).then(({ error: hErr }) => {
                if (hErr) console.error('[Expedientes] Error actualizando historial:', hErr.message);
            });
        }

        // 4. Si es una aceptación por parte de un Distribuidor/Instalador, notificar a administración
        if (req.user.rol_nombre !== 'ADMIN') {
            console.log(`[POST /api/expedientes] Notificando aceptación por parte de ${req.user.acronimo || req.user.email}`);
            
            try {
                const client = op.clientes;
                const dc = op.datos_calculo || {};
                const address = dc.inputs?.direccion || 'No especificada';
                const usuarioName = req.user.acronimo || req.user.razon_social || req.user.email || 'DISTRIBUIDOR';
                const finalNumExp = newExp?.numero_expediente || numero_expediente || op.id_oportunidad;
                
                // --- EXTRACCIÓN DE NOTAS ---
                const notesList = dc.historial?.filter(h => h.tipo === 'comentario') || [];
                const notesStr = notesList.length > 0 
                    ? notesList.map(n => `- ${n.texto} (${n.usuario})`).join('\n')
                    : 'Sin notas adicionales.';

                // Deep link para administración
                const deepLink = `${process.env.FRONTEND_URL || 'https://app.brokergy.es'}?exp=${finalNumExp}`;

                // --- WHATSAPP A ADMIN ---
                const adminMsg = 
`*${op.id_oportunidad || 'EXP'} – ACEPTACIÓN (CALCULADORA)*

¡Hola BROKERGY!
Te informamos que el Distribuidor (*${usuarioName}*) ha aceptado un expediente desde la calculadora:

*Cliente:* ${client?.nombre_razon_social || op.referencia_cliente} ${client?.apellidos || ''}
*Dirección:* ${address}
*Expediente:* ${finalNumExp}
*Origen:* Calculadora de Resultados

*NOTAS:*
${notesStr}

🔗 *Acceso Directo:* ${deepLink}

¡Muchas gracias!
*BROKERGY — Ingeniería Energética*`;

                whatsappService.sendText(process.env.WHATSAPP_ADMIN_CHAT || '34623926179', adminMsg)
                    .catch(e => console.warn('[Expedientes POST] Error WhatsApp Admin:', e.message));

                // --- EMAIL A ADMIN ---
                await emailService.sendAdminNotificationEmail({
                    numeroExpediente: finalNumExp,
                    clientName: `${client?.nombre_razon_social || op.referencia_cliente} ${client?.apellidos || ''}`.trim(),
                    address,
                    distributorName: usuarioName,
                    installerName: 'Ver expediente',
                    notes: notesStr,
                    expedienteId: finalNumExp
                }).catch(e => console.warn('[Expedientes POST] Error Email Admin:', e.message));

            } catch (notifErr) {
                console.error('[Expedientes POST] Error en proceso de notificación:', notifErr.message);
            }
        }


        res.status(201).json(newExp);
    } catch (err) {
        console.error('Error POST expedientes:', err);
        res.status(500).json({
            error: 'Error al crear el expediente',
            details: err.message
        });
    }
});

// ─── POST /api/expedientes/migrate-from-xml ───────────────────────────────────
// Crea un expediente "ya en curso" a partir de sus XML de CEE, SIN pasar por
// oportunidades. El servicio crea internamente una oportunidad oculta
// (datos_calculo.origen = 'migracion_xml') de la que cuelga el expediente.
// NOTA: no se aplica normalizeData para no corromper los objetos parseados del XML.
router.post('/migrate-from-xml', enforceAuth, async (req, res) => {
    try {
        if (req.user.rol_nombre === 'CERTIFICADOR') {
            return res.status(403).json({ error: 'No autorizado' });
        }

        const {
            ficha,
            cliente_id,
            numero_expediente = null,
            cee_inicial = null,
            cee_final = null,
            ref_catastral = '',
            fechas = {},
            combustibles = {},
            xml_inicial_base64 = null,
            xml_final_base64 = null
        } = req.body || {};

        if (!FICHAS.includes(ficha)) {
            return res.status(400).json({ error: `ficha inválida (debe ser una de: ${FICHAS.join(', ')})` });
        }
        if (!cliente_id) return res.status(400).json({ error: 'cliente_id es obligatorio' });
        if (!cee_inicial && !cee_final) {
            return res.status(400).json({ error: 'Se requiere al menos un XML (inicial o final)' });
        }

        const newExp = await expedienteService.migrateExpedienteFromXml({
            ficha,
            cliente_id,
            manualNumber: numero_expediente || null,
            ceeInicial: cee_inicial,
            ceeFinal: cee_final,
            refCatastral: ref_catastral,
            fechas,
            combustibles,
            xmlInicialBase64: xml_inicial_base64,
            xmlFinalBase64: xml_final_base64,
            usuario: req.user
        });

        // Devolver con joins para que el front abra el detalle directamente
        const [{ data: cli }, { data: op }] = await Promise.all([
            supabase.from('clientes').select('*').eq('id_cliente', newExp.cliente_id).maybeSingle(),
            supabase.from('oportunidades')
                .select('id, id_oportunidad, referencia_cliente, ficha, ref_catastral, datos_calculo, prescriptor_id')
                .eq('id', newExp.oportunidad_id).maybeSingle()
        ]);

        res.status(201).json({ ...newExp, clientes: cli || null, oportunidades: op || null });
    } catch (err) {
        console.error('Error POST expedientes/migrate-from-xml:', err);
        res.status(500).json({ error: 'Error al migrar el expediente', details: err.message });
    }
});

// Actualizar parcialmente un expediente (cee, instalacion, documentacion)
router.put('/:id', enforceAuth, async (req, res) => {
    try {
        const body = normalizeData(req.body);
        const { cee, instalacion, documentacion, estado, seguimiento } = body;

        const { data: existing, error: fetchErr } = await supabase
            .from('expedientes')
            .select('id, cee, instalacion, documentacion, estado, seguimiento, cliente_id, oportunidad_id, numero_expediente, prioridad')

            .eq('id', req.params.id)
            .single();

        if (fetchErr || !existing) return res.status(404).json({ error: 'Expediente no encontrado' });

        const updates = { updated_at: new Date().toISOString() };
        if (cee !== undefined) {
            updates.cee = { ...existing.cee, ...cee };
            // `cee.estado` es un campo DERIVADO por el servidor (notify-review / approve-cee /
            // cert-ack lo actualizan vía update directo). El módulo del frontend arrastra una
            // copia que puede estar OBSOLETA y la reenviaría en cada guardado, pisando el avance
            // real del estado (bug: quedaba "EN TRABAJO" tras re-subir el XML estando ya en
            // "PENDIENTE REVISIÓN"). Lo preservamos siempre: el módulo NUNCA debe cambiarlo.
            if (existing.cee && 'estado' in existing.cee) {
                updates.cee.estado = existing.cee.estado;
            }
        }
        if (instalacion !== undefined)   updates.instalacion   = { ...existing.instalacion,   ...instalacion };
        if (seguimiento !== undefined) {
            updates.seguimiento = { ...existing.seguimiento, ...seguimiento };

            // REGISTRADO es TERMINAL: el CEE ya está inscrito en Industria. Varios
            // módulos reenvían una copia completa de `seguimiento` que puede estar
            // OBSOLETA (o rellenan el hueco con el default 'ASIGNADO' cuando la clave
            // no existía) y degradaban el subestado sin que nadie lo pidiera — así
            // aparecieron expedientes con fecha de registro pero seguimiento en
            // 'ASIGNADO'. Mismo blindaje que `cee.estado` justo arriba.
            //
            // Para corregir un registro erróneo hay que pedirlo explícitamente:
            // el módulo de Seguimiento manda `seguimiento_manual: true`.
            if (body.seguimiento_manual !== true) {
                for (const clave of ['cee_inicial', 'cee_final']) {
                    if (existing.seguimiento?.[clave] === 'REGISTRADO' && updates.seguimiento[clave] !== 'REGISTRADO') {
                        console.warn(`[PUT expediente ${req.params.id}] Ignorado intento de degradar ${clave}: REGISTRADO → ${updates.seguimiento[clave]}`);
                        updates.seguimiento[clave] = 'REGISTRADO';
                    }
                }
            }

            // Sellar timestamps de transición de subestado (cee_inicial/cee_final/anexos).
            // Es el chokepoint por el que pasan los auto-status de subida de .CEX/registro
            // y los cambios manuales del módulo de Seguimiento.
            stampSeguimientoTimestamps(existing.seguimiento, updates.seguimiento);
        }
        
        // Aviso al staff de "registro presentado": tiene sentido cuando lo sube OTRO
        // (el certificador por su enlace público) — al admin le llega el email con el
        // botón de "Notificar al Cliente". Cuando lo sube el propio admin desde el
        // panel, él ya lo sabe y además tiene delante el popup que le pregunta a quién
        // avisar: mandarle el email igualmente le petaba el buzón y contradecía su
        // "Omitir notificación". Por eso el panel manda `notify_staff: false` y el
        // aviso sale solo si pulsa "Enviar notificaciones" (notify-registration).
        const staffNotify = body.notify_staff !== false;

        // ─── AUTOMATIZACIÓN REGISTRO CEE INICIAL ────────────────────────────────
        // Cuando el CEE Inicial pasa a REGISTRADO:
        //   1. Avanzar estado global a PTE. FIN OBRA (si procede)
        //   2. Generar token de un solo uso para que el admin notifique al cliente
        //      pulsando el enlace que recibirá por WA/email
        let _notifyAdminCeeInicial = null;
        if (seguimiento?.cee_inicial === 'REGISTRADO' && existing.seguimiento?.cee_inicial !== 'REGISTRADO') {
            // Avance desde CUALQUIER estado anterior a la obra, no solo desde
            // 'PTE. CEE INICIAL': cuando el CEE se registra el expediente suele
            // estar ya en 'REVISADO Y LISTO (INICIAL)' y el avance no ocurría.
            const conObra = avanzarEstado(existing.estado, 'PTE. FIN OBRA');
            if (conObra !== existing.estado) updates.estado = conObra;
            const notifyToken = crypto.randomBytes(32).toString('hex');
            if (!updates.seguimiento) updates.seguimiento = { ...existing.seguimiento };
            updates.seguimiento.notify_client_token_inicial = notifyToken;
            updates.seguimiento.notify_client_token_inicial_exp = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 días
            _notifyAdminCeeInicial = { token: notifyToken, expId: req.params.id, exp: existing };
            console.log(`[Automation] Exp ${req.params.id}: CEE INICIAL → REGISTRADO, token generado`);
        }

        // ─── AUTOMATIZACIÓN REGISTRO CEE FINAL ──────────────────────────────────
        let _notifyAdminCeeFinal = null;
        if (seguimiento?.cee_final === 'REGISTRADO' && existing.seguimiento?.cee_final !== 'REGISTRADO') {
            // Registrado el CEE final ya no queda nada del ciclo del certificado:
            // todo lo que falta es documentación que viaja en paralelo (anexos al
            // cliente, CIFO al instalador). Una sola fase macro; el desglose, en las
            // pistas del barrido.
            const conDoc = avanzarEstado(updates.estado || existing.estado, 'PTE FIN EXPTE');
            if (conDoc !== (updates.estado || existing.estado)) updates.estado = conDoc;
            const notifyToken = crypto.randomBytes(32).toString('hex');
            if (!updates.seguimiento) updates.seguimiento = { ...existing.seguimiento };
            updates.seguimiento.notify_client_token_final = notifyToken;
            updates.seguimiento.notify_client_token_final_exp = Date.now() + 7 * 24 * 60 * 60 * 1000;
            _notifyAdminCeeFinal = { token: notifyToken, expId: req.params.id, exp: existing };
            console.log(`[Automation] Exp ${req.params.id}: CEE FINAL → REGISTRADO, token generado`);
        }

        // La etiqueta URGENTE existe para que certificador y admin prioricen el
        // registro del CEE. Una vez registrado, deja de tener sentido.
        if ((_notifyAdminCeeInicial || _notifyAdminCeeFinal) && existing.prioridad === 'URGENTE') {
            updates.prioridad = 'NORMAL';
        }

        // Fusión con las claves protegidas (cifo_extra_annexes + ajustes del Anexo
        // Fotográfico): las escribe su endpoint dedicado, y la copia que reenvía el
        // detalle del expediente al autoguardar es más vieja. Ver utils/mergeDocumentacion.
        let docObj = mergeDocumentacion(existing.documentacion, documentacion);
        
        // Log de historial si cambia el estado (incluyendo el forzado por la automatización superior)
        const activeEstado = updates.estado || estado;
        if (activeEstado !== undefined && activeEstado !== existing.estado) {
            updates.estado = activeEstado;
            const hist = docObj.historial || [];
            const usuarioName = req.user.rol_nombre === 'ADMIN' 
                ? 'ADMINISTRADOR' 
                : (req.user.acronimo || req.user.razon_social || 'PARTNER');
            
            hist.push({
                id: Date.now().toString() + '_status',
                estado: activeEstado,
                fecha: new Date().toISOString(),
                usuario: usuarioName
            });
            docObj.historial = hist;
        }

        // ── Traza de "documento enviado a firmar" ───────────────────────────────
        // `{doc}_sent_at` guarda SOLO la última fecha: si se reenvía un anexo
        // corregido, la anterior se pierde y no queda constancia de que se mandó dos
        // veces. Este es el chokepoint por el que pasan todos los "marcar como
        // enviado" (botón de Documentación, EnviarAnexosModal, CIFO…), así que aquí
        // se deja una entrada en el historial por cada envío. El campo sigue siendo
        // la fuente para el reloj del barrido; esto es la trazabilidad.
        const DOCS_ENVIABLES = {
            anexo_i_sent_at: 'Anexo I',
            anexo_cesion_sent_at: 'Anexo de Cesión de Ahorros',
            anexo_fotografico_sent_at: 'Anexo Fotográfico',
            cert_cifo_sent_at: 'Certificado de Instalación / CIFO',
            cert_rite_sent_at: 'Certificado RITE',
            ficha_res060_sent_at: 'Ficha RES',
            borrador_cert_sent_at: 'Borrador del certificado (instalador)',
        };
        const enviadosAhora = Object.entries(DOCS_ENVIABLES).filter(([campo]) => {
            const antes = existing.documentacion?.[campo] || null;
            const ahora = docObj?.[campo] || null;
            return !!ahora && ahora !== antes;   // null→fecha o fecha→fecha nueva (reenvío)
        });
        if (enviadosAhora.length) {
            const hist = Array.isArray(docObj.historial) ? docObj.historial : [];
            const usuarioName = req.user?.rol_nombre === 'ADMIN'
                ? 'ADMINISTRADOR'
                : (req.user?.acronimo || req.user?.razon_social || 'SISTEMA');
            enviadosAhora.forEach(([campo, label], i) => {
                const reenvio = !!existing.documentacion?.[campo];
                hist.push({
                    id: `${Date.now()}_${i}_envio`,
                    tipo: 'doc_enviado',
                    texto: `${label} ${reenvio ? 'REENVIADO' : 'enviado'} para firma.`,
                    campo,
                    fecha: docObj[campo],
                    usuario: usuarioName,
                });
            });
            docObj.historial = hist;
        }

        // No persistir los blobs base64 de las fotos del Anexo Fotográfico que
        // provienen de Drive (id `drive_*`): la fuente de verdad es Drive y el
        // modal las recarga vía /api/public/anexo-photos. Guardarlas engordaba la
        // fila JSONB con ~MB de base64 y, sobre todo, normalizeData las corrompía
        // (base64 a MAYÚSCULAS → imagen rota). Mismo criterio que cifo_attachments.
        // Las filas manuales (`custom_*`) SÍ se conservan: su base64 es la única copia.
        //
        // 2026-07-22: se descarta además cualquier data-url ya corrupto (`DATA:` en
        // mayúsculas), venga del id que venga. Los 47 MB de fotos que tumbaron la BD
        // eran exactamente eso: base64 en mayúsculas, indescifrable, reescrito una y
        // otra vez por el autoguardado. Ver scripts/purge_corrupt_blobs.sql.
        if (Array.isArray(docObj.photo_attachments)) {
            docObj.photo_attachments = docObj.photo_attachments.map(p => {
                if (!p || !p.file) return p;
                const esDeDrive = String(p.id || '').startsWith('drive_');
                const data = p.file.data;
                const corrupto = typeof data === 'string' && data.startsWith('DATA:');
                return (esDeDrive || corrupto) ? { ...p, file: { name: p.file.name } } : p;
            });
        }

        // `cifo_attachments` son las fichas técnicas del CIFO, que viven en Drive
        // (ft_aerotermia_*_id) desde 2026-05-25. El frontend ya las descarta al cargar
        // (DocumentacionModule.jsx), pero sobrevivían en BD porque el spread de arriba
        // conserva las claves que el cliente no manda: 18 MB de base64 fantasma.
        delete docObj.cifo_attachments;

        updates.documentacion = docObj;


        const { data, error } = await supabase
            .from('expedientes')
            .update(updates)
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;

        // ── Carpeta de Drive según el estado ─────────────────────────────────
        // Este PUT es el chokepoint del desplegable de estado y del guardado del
        // módulo CEE (donde se asigna el certificador), que son los dos hechos que
        // cambian la carpeta: 03. ACEPTADO → 04. EN CURSO → 05 / 13. Ver driveFolders.js.
        const estadoCambio = data.estado !== existing.estado;
        const certAsignado = !existing.cee?.certificador_id && !!data.cee?.certificador_id;
        if (estadoCambio || certAsignado) {
            syncExpedienteFolderAsync(data, { motivo: certAsignado ? 'certificador asignado' : 'cambio de estado' });
        }

        // ── Envolvente → apartados de foto (RES080) ──────────────────────────
        // Guardar la pestaña Envolvente declara el ALCANCE de la obra. Habilitamos
        // los apartados de foto correspondientes (ventanas / cubierta / fachada) en
        // el checklist de la oportunidad, que es de donde beben DocsManager, el
        // Anexo Fotográfico y las tools MCP. Solo añade; para quitar un apartado
        // está el toggle "Añadir apartado de obra" del gestor de documentación.
        if (documentacion?.envolvente && existing.oportunidad_id) {
            setImmediate(() => {
                reformaUploadService
                    .syncEnvolventeConcepts(existing.oportunidad_id, docObj.envolvente)
                    .catch(e => console.warn('[Envolvente] sync apartados:', e.message));
            });
        }

        // ── Instalación → apartados de foto (emisor) ─────────────────────────
        // Mismo mecanismo: marcar SUELO RADIANTE en Instalación habilita el
        // apartado del armario de colectores en el gestor de fotos. Solo añade.
        if (instalacion !== undefined && existing.oportunidad_id) {
            setImmediate(() => {
                reformaUploadService
                    .syncInstalacionConcepts(existing.oportunidad_id, data.instalacion)
                    .catch(e => console.warn('[Instalacion] sync apartados:', e.message));
            });
        }

        // ── Notificaciones admin con enlace one-tap (fire-and-forget post-save) ──
        // `staffNotify === false` (subida desde el panel por un ADMIN): el token queda
        // generado, pero el email NO sale de aquí. Ver comentario en `staffNotify`.
        if (_notifyAdminCeeInicial && staffNotify) {
            const { token, expId, exp: capturedExp } = _notifyAdminCeeInicial;
            setImmediate(async () => {
                try {
                    const [{ data: cli }, { data: op }] = await Promise.all([
                        supabase.from('clientes').select('nombre_razon_social, apellidos, municipio, provincia, codigo_postal, direccion').eq('id_cliente', capturedExp.cliente_id).maybeSingle(),
                        supabase.from('oportunidades').select('id_oportunidad').eq('id', capturedExp.oportunidad_id).maybeSingle()
                    ]);
                    const numExp = capturedExp.numero_expediente || op?.id_oportunidad || expId;
                    const clienteFull = cli ? `${cli.nombre_razon_social || ''} ${cli.apellidos || ''}`.trim() : '';
                    const expedienteLink = `https://app.brokergy.es/expedientes/${expId}`;
                    const notifyLink = `https://app.brokergy.es/api/expedientes/${expId}/notify-client?token=${token}&phase=inicial`;

                    const ubicacion = cli ? `${cli.direccion || ''} - ${cli.codigo_postal || ''} ${cli.municipio || ''} (${cli.provincia || ''})` : '';
                    const certNombre = await getCertificadorNombre(capturedExp);
                    await emailService.sendCeeRegistradoStaffEmail(
                        'franciscojavier.moya.s2e2@gmail.com', false, numExp, clienteFull, ubicacion, certNombre, 'CEE INICIAL', expedienteLink, notifyLink
                    ).catch(e => console.error('[Automation CEE_INI] Email Admin:', e.message));
                } catch (notifErr) {
                    console.error('[Automation CEE_INI REGISTRADO] Admin notification error:', notifErr.message);
                }
            });
        }

        if (_notifyAdminCeeFinal && staffNotify) {
            const { token, expId, exp: capturedExp } = _notifyAdminCeeFinal;
            setImmediate(async () => {
                try {
                    const [{ data: cli }, { data: op }] = await Promise.all([
                        supabase.from('clientes').select('nombre_razon_social, apellidos, municipio, provincia, codigo_postal, direccion').eq('id_cliente', capturedExp.cliente_id).maybeSingle(),
                        supabase.from('oportunidades').select('id_oportunidad').eq('id', capturedExp.oportunidad_id).maybeSingle()
                    ]);
                    const numExp = capturedExp.numero_expediente || op?.id_oportunidad || expId;
                    const clienteFull = cli ? `${cli.nombre_razon_social || ''} ${cli.apellidos || ''}`.trim() : '';
                    const expedienteLink = `https://app.brokergy.es/expedientes/${expId}`;
                    const notifyLink = `https://app.brokergy.es/api/expedientes/${expId}/notify-client?token=${token}&phase=final`;

                    const ubicacion = cli ? `${cli.direccion || ''} - ${cli.codigo_postal || ''} ${cli.municipio || ''} (${cli.provincia || ''})` : '';
                    const certNombre = await getCertificadorNombre(capturedExp);
                    await emailService.sendCeeRegistradoStaffEmail(
                        'franciscojavier.moya.s2e2@gmail.com', false, numExp, clienteFull, ubicacion, certNombre, 'CEE FINAL', expedienteLink, notifyLink
                    ).catch(e => console.error('[Automation CEE_FIN] Email Admin:', e.message));
                } catch (notifErr) {
                    console.error('[Automation CEE_FIN REGISTRADO] Admin notification error:', notifErr.message);
                }
            });
        }

        res.json(data);
    } catch (err) {
        console.error('Error PUT expedientes/:id:', err);
        res.status(500).json({ error: 'Error al actualizar el expediente', details: err.message });
    }
});

// Cambiar cliente vinculado (PATCH /api/expedientes/:id/vincular-cliente)
router.patch('/:id/vincular-cliente', enforceAuth, async (req, res) => {
    const { id } = req.params;
    const { cliente_id } = req.body;
    try {
        if (!cliente_id) return res.status(400).json({ error: 'cliente_id requerido.' });

        const { data: cli, error: cliErr } = await supabase
            .from('clientes')
            .select('id_cliente, nombre_razon_social, apellidos')
            .eq('id_cliente', cliente_id)
            .single();
        if (cliErr || !cli) return res.status(404).json({ error: 'Cliente no encontrado.' });

        const { error: upErr } = await supabase
            .from('expedientes')
            .update({ cliente_id })
            .eq('id', id);
        if (upErr) return res.status(500).json({ error: upErr.message });

        res.json({ success: true, cliente: cli });
    } catch (err) {
        res.status(500).json({ error: 'Error del servidor.' });
    }
});

// Actualizar estado (PATCH /api/expedientes/:id/estado)
router.patch('/:id/estado', enforceAuth, async (req, res) => {
    const { id } = req.params;
    const { nuevo_estado } = req.body;
    try {
        const { data: exp, error: getErr } = await supabase
            .from('expedientes')
            .select('id, estado, documentacion')
            .eq('id', id)
            .single();
            
        if (getErr || !exp) return res.status(404).json({ error: 'No encontrado.' });

        const docObj = exp.documentacion || {};
        const hist = docObj.historial || [];
        
        const usuarioName = req.user.rol_nombre === 'ADMIN' 
            ? 'ADMINISTRADOR' 
            : (req.user.acronimo || req.user.razon_social || 'PARTNER');

        hist.push({
            id: Date.now().toString() + '_status',
            estado: nuevo_estado,
            fecha: new Date().toISOString(),
            usuario: usuarioName
        });
        
        docObj.historial = hist;

        const { data: upData, error: upErr } = await supabase
            .from('expedientes')
            .update({ 
                estado: nuevo_estado,
                documentacion: docObj,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (upErr) return res.status(500).json({ error: 'Error al actualizar estado.' });
        if (upData.estado !== exp.estado) {
            syncExpedienteFolderAsync(upData, { motivo: 'cambio de estado' });
        }
        res.status(200).json(upData);
    } catch (error) {
        res.status(500).json({ error: 'Error del servidor.' });
    }
});

// Añadir un comentario (POST /api/expedientes/:id/comentarios)
router.post('/:id/comentarios', enforceAuth, async (req, res) => {
    const { id } = req.params;
    try {
        const body = normalizeData(req.body);
        const { comentario } = body;
        if (!comentario) return res.status(400).json({ error: 'Comentario vacío.' });
        
        const { data: exp, error: getErr } = await supabase
            .from('expedientes')
            .select('id, documentacion')
            .eq('id', id)
            .single();
            
        if (getErr || !exp) return res.status(404).json({ error: 'No encontrado.' });

        const docObj = exp.documentacion || {};
        const hist = docObj.historial || [];
        
        const usuarioName = req.user.rol_nombre === 'ADMIN' 
            ? 'ADMINISTRADOR' 
            : (req.user.acronimo || req.user.razon_social || 'PARTNER');

        hist.push({
            id: Date.now().toString() + '_comment',
            tipo: 'comentario',
            texto: comentario,
            fecha: new Date().toISOString(),
            usuario: usuarioName
        });
        
        docObj.historial = hist;

        const { data: upData, error: upErr } = await supabase
            .from('expedientes')
            .update({ 
                documentacion: docObj,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (upErr) return res.status(500).json({ error: 'Error al añadir comentario.' });
        res.status(200).json(upData);
    } catch (error) {
        res.status(500).json({ error: 'Error del servidor.' });
    }
});

// Borrar historial completo (DELETE /api/expedientes/:id/historial)
router.delete('/:id/historial', adminOnly, async (req, res) => {
    const { id } = req.params;
    try {
        const { data: exp, error: getErr } = await supabase.from('expedientes').select('documentacion').eq('id', id).single();
        if (getErr || !exp) return res.status(404).json({ error: 'No encontrado.' });

        const docObj = exp.documentacion || {};
        docObj.historial = [];
        
        const { data: upData, error: upErr } = await supabase.from('expedientes').update({ documentacion: docObj, updated_at: new Date().toISOString() }).eq('id', id).select().single();
        if (upErr) return res.status(500).json({ error: 'Error al borrar historial.' });
        res.status(200).json(upData);
    } catch (error) {
        res.status(500).json({ error: 'Error del servidor.' });
    }
});

// Borrar entrada específica (DELETE /api/expedientes/:id/historial/:entryId)
router.delete('/:id/historial/:entryId', adminOnly, async (req, res) => {
    const { id, entryId } = req.params;
    try {
        const { data: exp, error: getErr } = await supabase.from('expedientes').select('documentacion').eq('id', id).single();
        if (getErr || !exp) return res.status(404).json({ error: 'No encontrado.' });

        const docObj = exp.documentacion || {};
        const hist = docObj.historial || [];
        docObj.historial = hist.filter(h => h.id !== entryId);

        const { data: upData, error: upErr } = await supabase.from('expedientes').update({ documentacion: docObj, updated_at: new Date().toISOString() }).eq('id', id).select().single();
        if (upErr) return res.status(500).json({ error: 'Error al borrar entrada.' });
        res.status(200).json(upData);
    } catch (error) {
        res.status(500).json({ error: 'Error del servidor.' });
    }
});

// Actualizar entrada específica (PUT /api/expedientes/:id/historial/:entryId)
router.put('/:id/historial/:entryId', adminOnly, async (req, res) => {
    const { id, entryId } = req.params;
    const { texto } = req.body;
    try {
        if (!texto) return res.status(400).json({ error: 'El texto es obligatorio.' });

        const { data: exp, error: getErr } = await supabase.from('expedientes').select('documentacion').eq('id', id).single();
        if (getErr || !exp) return res.status(404).json({ error: 'No encontrado.' });

        const docObj = exp.documentacion || {};
        const hist = docObj.historial || [];
        
        const entryIndex = hist.findIndex(h => h.id === entryId);
        if (entryIndex === -1) return res.status(404).json({ error: 'Entrada no encontrada.' });

        // Solo permitir editar comentarios
        if (hist[entryIndex].tipo !== 'comentario') {
            return res.status(403).json({ error: 'Solo se pueden editar notas manuales.' });
        }

        hist[entryIndex].texto = texto;
        hist[entryIndex].updated_at = new Date().toISOString();
        
        docObj.historial = hist;

        const { data: upData, error: upErr } = await supabase.from('expedientes').update({ documentacion: docObj, updated_at: new Date().toISOString() }).eq('id', id).select().single();
        if (upErr) return res.status(500).json({ error: 'Error al actualizar entrada.' });
        res.status(200).json(upData);
    } catch (error) {
        res.status(500).json({ error: 'Error del servidor.' });
    }
});

// ─── Incidencias del expediente (control de calidad — SOLO ADMIN) ─────────────
// Viven en documentacion.incidencias[] (mismo patrón JSONB read-modify-write que
// el historial). Cada incidencia:
//   { id, texto, estado:'ABIERTA'|'SUBSANADA', fecha, usuario, resuelta_at, resuelta_por,
//     resolucion, comentarios[] }
// `comentarios[]` es el HILO de seguimiento de la incidencia — lo que permite que un
// tercero entienda cómo se resolvió sin preguntarle a nadie. Cada entrada:
//   { id, texto, autor, tipo:'NOTA'|'RESOLUCION'|'REAPERTURA'|'SEVERIDAD', fecha }
// Lo escriben tanto la app como el MCP (mcp-brokergy/server.js), así que lo que hace
// el agente por chat y lo que se hace a mano acaban en el mismo sitio.

const incidenciaUsuario = (req) =>
    req.user?.rol_nombre === 'ADMIN'
        ? 'ADMINISTRADOR'
        : (req.user?.acronimo || req.user?.razon_social || 'PARTNER');

// Procedencia (origen) de la incidencia. Valor desconocido → REVISION_INTERNA.
const PROCEDENCIAS_VALIDAS = ['REVISION_INTERNA', 'VERIFICACION', 'GESTOR_AUTONOMICO', 'AGENTE_IA'];
const normProcedencia = (p) => PROCEDENCIAS_VALIDAS.includes(p) ? p : 'REVISION_INTERNA';

// Severidad: GRAVE (hay que tomar acción sí o sí) | LEVE (pasable, solo observación).
// Valor desconocido → GRAVE (más seguro: no dejar pasar algo como leve por error).
const SEVERIDADES_VALIDAS = ['LEVE', 'GRAVE'];
const normSeveridad = (s) => SEVERIDADES_VALIDAS.includes(s) ? s : 'GRAVE';

// Tipos válidos de entrada del hilo. NOTA la escribe una persona; el resto las
// genera el sistema al subsanar / reabrir / reclasificar.
const TIPOS_COMENTARIO = ['NOTA', 'RESOLUCION', 'REAPERTURA', 'SEVERIDAD'];

// ── Topes de tamaño del hilo (protección de la BD) ────────────────────────────
// Las incidencias viven dentro de `expedientes.documentacion` (JSONB). Hoy son 720
// bytes de media y toda la columna suma 756 kB en 230 expedientes, así que el hilo
// no es un problema de volumen. El riesgo es OTRO: que alguien (o un agente) pegue
// ahí un log, un XML o un base64 y dispare el trigger de 2 MB por fila — y, sobre
// todo, que Postgres tenga que descomprimir esa columna entera en cada consulta que
// la toque (fue una de las causas de las caídas del 21/07/2026; ver reglas 21 y 22).
// Por eso: texto acotado, número de entradas acotado y nada que huela a fichero.
const MAX_TEXTO_INCIDENCIA = 4000;
const MAX_TEXTO_COMENTARIO = 2000;
const MAX_COMENTARIOS      = 50;

// Devuelve un mensaje de error si el texto no es apto para guardar en el JSONB, o null.
function validarTextoIncidencia(texto, max, que = 'texto') {
    if (texto.length > max) {
        return `El ${que} es demasiado largo (${texto.length} caracteres, máximo ${max}). Resume; los documentos y capturas van a Drive, no a la incidencia.`;
    }
    if (/;base64,|^data:[a-z]+\//i.test(texto)) {
        return `No se pueden guardar ficheros ni imágenes dentro de una incidencia. Súbelo a Drive y pon aquí el enlace.`;
    }
    return null;
}

// Crea una entrada del hilo y la añade a la incidencia (siempre al final: orden
// cronológico). Si se llega al tope, se descarta la NOTA más antigua — las entradas
// de sistema (RESOLUCION/REAPERTURA/SEVERIDAD) no se pierden nunca: son la traza.
function pushComentario(inc, texto, autor, tipo = 'NOTA') {
    const entrada = {
        id: `${Date.now()}_c${Math.random().toString(36).slice(2, 7)}`,
        texto: (texto || '').trim(),
        autor: autor || 'Sistema',
        tipo: TIPOS_COMENTARIO.includes(tipo) ? tipo : 'NOTA',
        fecha: new Date().toISOString(),
    };
    let hilo = [...(inc.comentarios || []), entrada];
    while (hilo.length > MAX_COMENTARIOS) {
        const i = hilo.findIndex(c => c.tipo === 'NOTA');
        hilo.splice(i === -1 ? 0 : i, 1);
    }
    inc.comentarios = hilo;
    return entrada;
}

// Lee documentacion + array de incidencias de un expediente (o null si no existe).
async function loadIncidencias(id) {
    const { data: exp, error } = await supabase
        .from('expedientes').select('documentacion').eq('id', id).single();
    if (error || !exp) return null;
    const docObj = exp.documentacion || {};
    return { docObj, incidencias: docObj.incidencias || [] };
}

// Persiste el array de incidencias y devuelve la lista actualizada.
async function saveIncidencias(id, docObj, incidencias) {
    docObj.incidencias = incidencias;
    const { data: upData, error } = await supabase
        .from('expedientes')
        .update({ documentacion: docObj, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('documentacion')
        .single();
    if (error) return null;
    return upData.documentacion?.incidencias || [];
}

// GET lista de incidencias (ligero — lo usa el modal para refrescar)
router.get('/:id/incidencias', staffOnly, async (req, res) => {
    try {
        const loaded = await loadIncidencias(req.params.id);
        if (!loaded) return res.status(404).json({ error: 'No encontrado.' });
        res.status(200).json(loaded.incidencias);
    } catch (error) {
        res.status(500).json({ error: 'Error del servidor.' });
    }
});

// Crear incidencia
router.post('/:id/incidencias', staffOnly, async (req, res) => {
    try {
        // Sin normalizeData: el texto de la incidencia debe conservar mayúsculas/minúsculas tal cual.
        const body = req.body || {};
        const texto = (body.texto || '').trim();
        if (!texto) return res.status(400).json({ error: 'El texto de la incidencia es obligatorio.' });
        const malTexto = validarTextoIncidencia(texto, MAX_TEXTO_INCIDENCIA, 'texto de la incidencia');
        if (malTexto) return res.status(400).json({ error: malTexto });

        const loaded = await loadIncidencias(req.params.id);
        if (!loaded) return res.status(404).json({ error: 'No encontrado.' });

        loaded.incidencias.push({
            id: Date.now().toString() + '_inc',
            texto,
            procedencia: normProcedencia(body.procedencia),
            severidad: normSeveridad(body.severidad),
            estado: 'ABIERTA',
            fecha: new Date().toISOString(),
            usuario: incidenciaUsuario(req),
            resuelta_at: null,
            resuelta_por: null
        });

        const saved = await saveIncidencias(req.params.id, loaded.docObj, loaded.incidencias);
        if (!saved) return res.status(500).json({ error: 'Error al registrar la incidencia.' });
        res.status(200).json(saved);
    } catch (error) {
        res.status(500).json({ error: 'Error del servidor.' });
    }
});

// Marcar como SUBSANADA (botón OK).
// Body opcional { resolucion } → CÓMO se ha subsanado. Se guarda en inc.resolucion y
// además se apunta en el hilo, que es lo que lee un tercero para entenderlo.
router.patch('/:id/incidencias/:incId/resolver', staffOnly, async (req, res) => {
    try {
        // Sin normalizeData: el texto de la resolución se conserva tal cual se escribe.
        const resolucion = (req.body?.resolucion || '').trim();
        const malResolucion = validarTextoIncidencia(resolucion, MAX_TEXTO_COMENTARIO, 'texto de la resolución');
        if (malResolucion) return res.status(400).json({ error: malResolucion });

        const loaded = await loadIncidencias(req.params.id);
        if (!loaded) return res.status(404).json({ error: 'No encontrado.' });
        const inc = loaded.incidencias.find(i => i.id === req.params.incId);
        if (!inc) return res.status(404).json({ error: 'Incidencia no encontrada.' });

        const usuario = incidenciaUsuario(req);
        inc.estado = 'SUBSANADA';
        inc.resuelta_at = new Date().toISOString();
        inc.resuelta_por = usuario;
        inc.resolucion = resolucion || null;
        pushComentario(inc, resolucion, usuario, 'RESOLUCION');

        const saved = await saveIncidencias(req.params.id, loaded.docObj, loaded.incidencias);
        if (!saved) return res.status(500).json({ error: 'Error al actualizar la incidencia.' });
        res.status(200).json(saved);
    } catch (error) {
        res.status(500).json({ error: 'Error del servidor.' });
    }
});

// Reabrir (volver a ABIERTA). Body opcional { motivo } → por qué se reabre.
// La resolución anterior NO se borra del hilo: la traza tiene que quedar completa.
router.patch('/:id/incidencias/:incId/reabrir', staffOnly, async (req, res) => {
    try {
        const motivo = (req.body?.motivo || '').trim();
        const malMotivo = validarTextoIncidencia(motivo, MAX_TEXTO_COMENTARIO, 'motivo');
        if (malMotivo) return res.status(400).json({ error: malMotivo });

        const loaded = await loadIncidencias(req.params.id);
        if (!loaded) return res.status(404).json({ error: 'No encontrado.' });
        const inc = loaded.incidencias.find(i => i.id === req.params.incId);
        if (!inc) return res.status(404).json({ error: 'Incidencia no encontrada.' });

        const usuario = incidenciaUsuario(req);
        inc.estado = 'ABIERTA';
        inc.resuelta_at = null;
        inc.resuelta_por = null;
        inc.resolucion = null;
        pushComentario(inc, motivo || 'Se reabre: la incidencia sigue sin estar resuelta.', usuario, 'REAPERTURA');

        const saved = await saveIncidencias(req.params.id, loaded.docObj, loaded.incidencias);
        if (!saved) return res.status(500).json({ error: 'Error al reabrir la incidencia.' });
        res.status(200).json(saved);
    } catch (error) {
        res.status(500).json({ error: 'Error del servidor.' });
    }
});

// Reclasificar severidad GRAVE ⇄ LEVE (clic en la propia etiqueta del modal).
// Body { severidad } opcional; si no viene, alterna. Deja traza en el hilo porque
// bajar una GRAVE a LEVE es una decisión que alguien tiene que poder justificar.
router.patch('/:id/incidencias/:incId/severidad', staffOnly, async (req, res) => {
    try {
        const loaded = await loadIncidencias(req.params.id);
        if (!loaded) return res.status(404).json({ error: 'No encontrado.' });
        const inc = loaded.incidencias.find(i => i.id === req.params.incId);
        if (!inc) return res.status(404).json({ error: 'Incidencia no encontrada.' });

        const anterior = normSeveridad(inc.severidad);
        const destino = req.body?.severidad !== undefined
            ? normSeveridad(req.body.severidad)
            : (anterior === 'GRAVE' ? 'LEVE' : 'GRAVE');

        if (destino !== anterior) {
            const usuario = incidenciaUsuario(req);
            inc.severidad = destino;
            inc.updated_at = new Date().toISOString();
            const motivo = (req.body?.motivo || '').trim();
            pushComentario(
                inc,
                `Reclasificada de ${anterior} a ${destino}.${motivo ? ` ${motivo}` : ''}`,
                usuario,
                'SEVERIDAD'
            );
        }

        const saved = await saveIncidencias(req.params.id, loaded.docObj, loaded.incidencias);
        if (!saved) return res.status(500).json({ error: 'Error al cambiar la severidad.' });
        res.status(200).json(saved);
    } catch (error) {
        res.status(500).json({ error: 'Error del servidor.' });
    }
});

// Añadir una nota al hilo de la incidencia (seguimiento, sin cambiar su estado).
router.post('/:id/incidencias/:incId/comentarios', staffOnly, async (req, res) => {
    try {
        // Sin normalizeData: el texto del hilo se conserva tal cual se escribe.
        const texto = (req.body?.texto || '').trim();
        if (!texto) return res.status(400).json({ error: 'El texto de la nota es obligatorio.' });
        const malNota = validarTextoIncidencia(texto, MAX_TEXTO_COMENTARIO, 'texto de la nota');
        if (malNota) return res.status(400).json({ error: malNota });

        const loaded = await loadIncidencias(req.params.id);
        if (!loaded) return res.status(404).json({ error: 'No encontrado.' });
        const inc = loaded.incidencias.find(i => i.id === req.params.incId);
        if (!inc) return res.status(404).json({ error: 'Incidencia no encontrada.' });

        pushComentario(inc, texto, incidenciaUsuario(req), 'NOTA');

        const saved = await saveIncidencias(req.params.id, loaded.docObj, loaded.incidencias);
        if (!saved) return res.status(500).json({ error: 'Error al añadir la nota.' });
        res.status(200).json(saved);
    } catch (error) {
        res.status(500).json({ error: 'Error del servidor.' });
    }
});

// Editar texto de una incidencia
router.put('/:id/incidencias/:incId', staffOnly, async (req, res) => {
    try {
        // Sin normalizeData: el texto de la incidencia debe conservar mayúsculas/minúsculas tal cual.
        const body = req.body || {};
        const texto = (body.texto || '').trim();
        if (!texto) return res.status(400).json({ error: 'El texto es obligatorio.' });
        const malEdicion = validarTextoIncidencia(texto, MAX_TEXTO_INCIDENCIA, 'texto de la incidencia');
        if (malEdicion) return res.status(400).json({ error: malEdicion });

        const loaded = await loadIncidencias(req.params.id);
        if (!loaded) return res.status(404).json({ error: 'No encontrado.' });
        const inc = loaded.incidencias.find(i => i.id === req.params.incId);
        if (!inc) return res.status(404).json({ error: 'Incidencia no encontrada.' });

        inc.texto = texto;
        if (body.procedencia !== undefined) inc.procedencia = normProcedencia(body.procedencia);
        if (body.severidad !== undefined) {
            // Mismo criterio que el toggle de la etiqueta: un cambio de severidad deja traza.
            const anterior = normSeveridad(inc.severidad);
            const destino = normSeveridad(body.severidad);
            inc.severidad = destino;
            if (destino !== anterior) {
                pushComentario(inc, `Reclasificada de ${anterior} a ${destino}.`, incidenciaUsuario(req), 'SEVERIDAD');
            }
        }
        inc.updated_at = new Date().toISOString();

        const saved = await saveIncidencias(req.params.id, loaded.docObj, loaded.incidencias);
        if (!saved) return res.status(500).json({ error: 'Error al actualizar la incidencia.' });
        res.status(200).json(saved);
    } catch (error) {
        res.status(500).json({ error: 'Error del servidor.' });
    }
});

// Borrar incidencia
router.delete('/:id/incidencias/:incId', adminOnly, async (req, res) => {
    try {
        const loaded = await loadIncidencias(req.params.id);
        if (!loaded) return res.status(404).json({ error: 'No encontrado.' });

        const next = loaded.incidencias.filter(i => i.id !== req.params.incId);
        const saved = await saveIncidencias(req.params.id, loaded.docObj, next);
        if (!saved) return res.status(500).json({ error: 'Error al borrar la incidencia.' });
        res.status(200).json(saved);
    } catch (error) {
        res.status(500).json({ error: 'Error del servidor.' });
    }
});

// ─── POST /api/expedientes/:id/facturas/upload ────────────────────────────────
// Sube una factura PDF a la carpeta "5. FACTURAS" de la oportunidad en Drive.
// Body JSON: { base64, fileName, mimeType? }
router.post('/:id/facturas/upload', enforceAuth, async (req, res) => {
    try {
        const { base64, fileName, mimeType = 'application/pdf' } = req.body;
        if (!base64 || !fileName) {
            return res.status(400).json({ error: 'base64 y fileName son obligatorios' });
        }

        // Obtener el expediente para encontrar la oportunidad
        const { data: exp, error: expErr } = await supabase
            .from('expedientes')
            .select('id, oportunidad_id')
            .eq('id', req.params.id)
            .single();
        if (expErr || !exp) return res.status(404).json({ error: 'Expediente no encontrado' });

        // Obtener el drive_folder_id de la oportunidad
        const { data: op } = await supabase
            .from('oportunidades')
            .select('datos_calculo')
            .eq('id', exp.oportunidad_id)
            .single();

        const driveFolderId = op?.datos_calculo?.drive_folder_id || op?.datos_calculo?.inputs?.drive_folder_id;
        if (!driveFolderId) {
            return res.status(400).json({ error: 'La oportunidad no tiene carpeta de Drive configurada' });
        }

        const { getOrCreateSubfolderNormalized, saveFileToFolder } = require('../services/driveService');

        // Buscar/crear la subcarpeta "5. FACTURAS" de forma TOLERANTE a espacios/puntos
        // (la plantilla trae "5. FACTURAS" con espacio; el código antiguo pedía
        // "5.FACTURAS" sin espacio y creaba una carpeta DUPLICADA).
        const facturasFolderId = await getOrCreateSubfolderNormalized(driveFolderId, reformaUploadService.SUBCARPETA_FACTURAS);

        const fileBuffer = Buffer.from(base64, 'base64');
        const result = await saveFileToFolder(facturasFolderId, fileName, mimeType, fileBuffer);

        if (!result) return res.status(500).json({ error: 'Error al subir el archivo a Drive' });

        res.json({ drive_link: result.link, drive_id: result.id });
    } catch (err) {
        console.error('Error POST expedientes/:id/facturas/upload:', err);
        res.status(500).json({ error: 'Error al subir la factura', details: err.message });
    }
});

// ─── Facturas — helpers comunes ───────────────────────────────────────────────
// Id de Drive de una factura. Las facturas antiguas se guardaron solo con
// `drive_link`, así que hay que saber sacarlo del enlace.
function driveIdFromLink(link) {
    const s = String(link || '');
    const m = /\/file\/d\/([A-Za-z0-9_-]{10,})/.exec(s) || /[?&]id=([A-Za-z0-9_-]{10,})/.exec(s);
    return m ? m[1] : null;
}
const facturaDriveId = (f) => (f && (f.drive_id || driveIdFromLink(f.drive_link))) || null;

// Orden del PDF combinado: por fecha de factura y, a igualdad, por nº. Es el orden
// en el que un verificador espera leerlas; no el alfabético del nombre del fichero.
function ordenarFacturas(facturas) {
    return [...facturas].sort((a, b) => {
        const fa = String(a?.fecha_factura || '9999-12-31');
        const fb = String(b?.fecha_factura || '9999-12-31');
        if (fa !== fb) return fa.localeCompare(fb);
        return String(a?.numero_factura || '').localeCompare(String(b?.numero_factura || ''), 'es', { numeric: true });
    });
}

// Resuelve la carpeta "5. FACTURAS" del expediente (tolerante a "5.FACTURAS").
async function carpetaFacturas(op) {
    const driveService = require('../services/driveService');
    const driveFolderId = op?.datos_calculo?.drive_folder_id || op?.datos_calculo?.inputs?.drive_folder_id;
    if (!driveFolderId) return { driveFolderId: null, facturasFolderId: null };
    const facturasFolderId = await driveService.getOrCreateSubfolderNormalized(
        driveFolderId, reformaUploadService.SUBCARPETA_FACTURAS);
    return { driveFolderId, facturasFolderId };
}

// ─── POST /api/expedientes/:id/facturas/generar-pdf ───────────────────────────
// Combina las facturas REGISTRADAS Y VALIDADAS del expediente en un único PDF
// "{numero_expediente} - FACTURAS.pdf" (conservando los originales).
//
// ⚠️ La fuente es `documentacion.facturas[]`, NO el contenido de la carpeta. Antes
// se listaba "5. FACTURAS" entera y cualquier fichero suelto (una factura subida
// dos veces por dos vías, o la versión vieja de un "Reemplazar") acababa dentro del
// combinado: con UNA factura salían DOS copias, y esa inversión duplicada es la que
// viaja al verificador. Lo que no está en la lista validada no entra en el PDF; los
// ficheros sobrantes se devuelven en `huerfanos` para que la app los enseñe.
const generandoCombinado = new Set(); // lock por expediente (evita el doble POST)

router.post('/:id/facturas/generar-pdf', enforceAuth, async (req, res) => {
    const expId = req.params.id;
    // Sin este lock, dos peticiones solapadas listan Drive antes de que ninguna haya
    // escrito y acaban creando DOS ficheros con el mismo nombre (Drive lo permite).
    if (generandoCombinado.has(expId)) {
        return res.status(409).json({ error: 'Ya se está generando el PDF único de este expediente.' });
    }
    generandoCombinado.add(expId);
    try {
        const { data: exp, error: expErr } = await supabase
            .from('expedientes')
            .select('id, numero_expediente, documentacion, oportunidad_id')
            .eq('id', expId)
            .maybeSingle();
        if (expErr || !exp) return res.status(404).json({ error: 'Expediente no encontrado' });

        const facturas = Array.isArray(exp.documentacion?.facturas) ? exp.documentacion.facturas : [];
        if (!facturas.length) return res.status(400).json({ error: 'El expediente no tiene facturas.' });
        if (!facturas.every(f => f && f.validada)) {
            return res.status(400).json({ error: 'Todas las facturas deben estar validadas antes de generar el PDF único.' });
        }

        const { data: op } = await supabase
            .from('oportunidades').select('datos_calculo, id_oportunidad').eq('id', exp.oportunidad_id).single();

        const driveService = require('../services/driveService');
        const { combineFilesToPdf } = require('../services/facturasCombineService');
        const { facturasFolderId, driveFolderId } = await carpetaFacturas(op);
        if (!facturasFolderId) return res.status(400).json({ error: 'La oportunidad no tiene carpeta de Drive configurada.' });

        const numExp = (exp.numero_expediente || op?.id_oportunidad || 'EXPEDIENTE').trim();
        const outName = `${numExp} - FACTURAS.pdf`;

        // Ficheros VIVOS de la carpeta (listFiles ya excluye la papelera).
        const enCarpeta = (await driveService.listFiles(facturasFolderId))
            .filter(f => f.mimeType !== 'application/vnd.google-apps.folder' && f.name !== outName);
        const vivosPorId = new Map(enCarpeta.map(f => [f.id, f]));

        // Origen = las facturas de la lista, en su orden, deduplicadas por id de Drive.
        // Si el id apuntado ya no está vivo (alguien vació el fichero a la papelera y
        // quedó otra copia buena en la carpeta), se REPARA por nombre en vez de fallar.
        const sinPdf = [];
        const reparadas = [];
        const vistos = new Set();
        const sources = [];
        for (const f of ordenarFacturas(facturas)) {
            const etiqueta = f.numero_factura || '(sin nº)';
            let id = facturaDriveId(f);
            if (id && !vivosPorId.has(id)) {
                let nombre = null;
                try { nombre = (await driveService.getFileMetadata(id, 'id, name, trashed'))?.name || null; } catch { /* borrado */ }
                const gemelo = nombre ? enCarpeta.find(x => x.name === nombre) : null;
                if (gemelo) { id = gemelo.id; reparadas.push(`${etiqueta} → ${nombre}`); }
                else id = null;
            }
            if (!id) { sinPdf.push(etiqueta); continue; }
            if (vistos.has(id)) continue;
            vistos.add(id);
            sources.push({ id, name: etiqueta });
        }
        if (sinPdf.length) {
            return res.status(400).json({
                error: `No se encuentra en Drive el PDF de ${sinPdf.length} factura(s): ${sinPdf.join(', ')}. Vuelve a subirlas.`
            });
        }
        if (!sources.length) return res.status(400).json({ error: 'Ninguna factura tiene PDF asociado.' });

        const combined = await combineFilesToPdf(sources);
        if (!combined) return res.status(500).json({ error: 'No se pudo generar el PDF (formatos no soportados).' });

        // Borra TODOS los combinados previos con ese nombre (no solo el primero: si
        // una regeneración anterior dejó dos, hay que llevarse los dos por delante).
        try {
            const previos = await driveService.findFilesByName(facturasFolderId, outName);
            for (const prev of previos) await driveService.deleteFile(prev);
        } catch (e) { /* no bloquear la regeneración */ }

        const saved = await driveService.saveFileToFolder(facturasFolderId, outName, 'application/pdf', combined.buffer);
        if (!saved?.link) return res.status(500).json({ error: 'No se pudo guardar el PDF en Drive.' });

        // Copia también a la carpeta de auditoría "10. EXPEDIENTE CAE" (todas las
        // facturas están validadas para llegar aquí): deja el original en
        // "5. FACTURAS" y reúne el combinado junto al resto de documentación validada.
        let auditLink = null;
        try {
            const auditFolderId = await driveService.getOrCreateSubfolderNormalized(driveFolderId, '10. EXPEDIENTE CAE');
            const previosAudit = await driveService.findFilesByName(auditFolderId, outName);
            for (const prev of previosAudit) await driveService.deleteFile(prev);
            const copied = await driveService.copyFile(saved.id, auditFolderId, outName);
            if (copied?.link) auditLink = copied.link;
        } catch (copyErr) {
            console.warn('[facturas/generar-pdf] No se pudo copiar a "10. EXPEDIENTE CAE":', copyErr.message);
        }

        // Huérfanos: ficheros de "5. FACTURAS" que no son de ninguna factura registrada
        // ni el propio combinado. Son los que antes se colaban en el PDF.
        const huerfanos = enCarpeta
            .filter(f => !vistos.has(f.id))
            .map(f => ({ id: f.id, name: f.name }));

        res.json({
            success: true,
            drive_link: saved.link,
            drive_id: saved.id,
            name: outName,
            count: sources.length,
            pages: combined.pages,
            skipped: combined.skipped,
            audit_link: auditLink,
            huerfanos,
            reparadas
        });
    } catch (err) {
        console.error('Error POST expedientes/:id/facturas/generar-pdf:', err);
        res.status(500).json({ error: 'Error al generar el PDF de facturas', details: err.message });
    } finally {
        generandoCombinado.delete(expId);
    }
});

// ─── DELETE /api/expedientes/:id/facturas/:driveId ────────────────────────────
// Quita una factura del expediente Y archiva su PDF en "5. FACTURAS/OLD".
//
// Antes, borrar la fila en el modal solo la quitaba del JSON: el PDF seguía en la
// carpeta y volvía a entrar en el combinado. Se ARCHIVA en vez de borrar (mismo
// criterio que el resto de la app: nada se pierde, pero deja de contar).
router.delete('/:id/facturas/:driveId', staffOnly, async (req, res) => {
    try {
        const { id, driveId } = req.params;
        const { data: exp, error: expErr } = await supabase
            .from('expedientes').select('id, oportunidad_id, documentacion').eq('id', id).maybeSingle();
        if (expErr || !exp) return res.status(404).json({ error: 'Expediente no encontrado' });

        const { data: op } = await supabase
            .from('oportunidades').select('datos_calculo').eq('id', exp.oportunidad_id).single();

        // 1) Archivar el fichero en OLD (best-effort: si Drive falla, la fila se quita igual;
        //    el combinado ya no lo mira porque va por la lista, no por la carpeta).
        let archivado = null;
        try {
            const driveService = require('../services/driveService');
            const { facturasFolderId } = await carpetaFacturas(op);
            if (facturasFolderId) {
                const meta = await driveService.getFileMetadata(driveId, 'id, name');
                if (meta?.name) archivado = await driveService.archiveExistingToOld(facturasFolderId, driveId, meta.name);
            }
        } catch (e) {
            console.warn('[facturas/delete] no se pudo archivar en OLD:', e.message);
        }

        // 2) Quitar la fila (RPC atómica por oportunidad: no reescribe `documentacion` entera).
        const { error: rpcErr } = await supabase.rpc('remove_expediente_factura_by_driveid', {
            p_oportunidad_id: exp.oportunidad_id, p_drive_id: driveId
        });
        if (rpcErr) return res.status(500).json({ error: 'No se pudo quitar la factura', details: rpcErr.message });

        res.json({ success: true, archivado });
    } catch (err) {
        console.error('Error DELETE expedientes/:id/facturas/:driveId:', err);
        res.status(500).json({ error: 'Error al eliminar la factura', details: err.message });
    }
});

// ─── POST /api/expedientes/:id/facturas/ocr ───────────────────────────────────
// Sueltas la factura y la app hace el resto: la sube a "5. FACTURAS", la LEE con el
// mismo OCR multimodal que ya usamos para los CEE, y pasa un FILTRO PREVIO de
// incidencias cruzándola con el expediente (facturaIncidencias.js).
//
// Devuelve la fila lista para el modal + las incidencias PROPUESTAS. No registra
// ninguna: las confirma una persona. La IA solo lee; el criterio es de las reglas.
//
// ADMIN-only: aquí se leen importes (regla de dinero del módulo).
const facturaUpload = require('multer')({
    storage: require('multer').memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024, files: 20 },
});

// Nombre libre en la carpeta: nunca dos ficheros con el mismo nombre (Drive lo
// permite, y son justo los homónimos los que despistan al reconciliar).
async function nombreLibreEnCarpeta(driveService, folderId, base, ext) {
    let candidate = `${base}${ext}`;
    let n = 2;
    while (await driveService.findFileByName(folderId, candidate)) {
        candidate = `${base}_${n}${ext}`;
        n++;
    }
    return candidate;
}

router.post('/:id/facturas/ocr', adminOnly, (req, res, next) => {
    facturaUpload.array('files', 20)(req, res, (err) => {
        if (err) {
            if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Algún fichero supera los 25 MB.' });
            console.error('[facturaOcr] multer:', err.message);
            return res.status(400).json({ error: 'No se pudieron procesar los ficheros.' });
        }
        next();
    });
}, async (req, res) => {
    try {
        const files = req.files || [];
        if (!files.length) return res.status(400).json({ error: 'No se recibió ningún fichero (campo "files").' });

        const { CEE_ECO_SELECT, rebuildCee } = require('../utils/ceeEcoFields');
        const { data: expRaw, error: expErr } = await supabase
            .from('expedientes')
            .select(`id, numero_expediente, documentacion, instalacion, oportunidad_id, instalador_asociado_id, ${CEE_ECO_SELECT}`)
            .eq('id', req.params.id)
            .maybeSingle();
        if (expErr || !expRaw) return res.status(404).json({ error: 'Expediente no encontrado' });
        const exp = rebuildCee(expRaw);   // nunca traemos cee.xml_* (regla 22)

        const { data: op } = await supabase
            .from('oportunidades')
            .select('id, ficha, datos_calculo, cliente_id, instalador_asociado_id, prescriptor_id')
            .eq('id', exp.oportunidad_id).single();

        // 1) Normalizar a PDF (una foto o varias páginas sueltas se unen antes de leer).
        const ceeOcrService = require('../services/ceeOcrService');
        let pdf;
        try {
            ({ pdf } = await ceeOcrService.normalizeToPdf(files));
        } catch (e) {
            return res.status(400).json({ error: e.message });
        }

        // 2) Leer la factura.
        const facturaOcrService = require('../services/facturaOcrService');
        let ocr;
        try {
            ocr = await facturaOcrService.extractFacturaFromPdf(pdf);
        } catch (e) {
            console.error('[facturaOcr] extracción falló:', e.message);
            return res.status(e.status === 429 ? 429 : 502).json({ error: 'La lectura de la factura falló: ' + e.message });
        }

        // 3) Guardar en "5. FACTURAS" con un nombre que identifique la factura.
        const driveService = require('../services/driveService');
        const { facturasFolderId } = await carpetaFacturas(op);
        if (!facturasFolderId) return res.status(400).json({ error: 'La oportunidad no tiene carpeta de Drive configurada.' });

        const numLimpio = String(ocr.numero_factura || '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
        const base = numLimpio ? `FACTURA_${numLimpio}` : (files[0].originalname || 'FACTURA').replace(/\.[a-z0-9]+$/i, '');
        const fileName = await nombreLibreEnCarpeta(driveService, facturasFolderId, base, '.pdf');
        const saved = await driveService.saveFileToFolder(facturasFolderId, fileName, 'application/pdf', pdf);
        if (!saved?.link) return res.status(500).json({ error: 'La factura se ha leído pero no se pudo guardar en Drive.' });

        // 4) Filtro previo de incidencias (determinista, sobre el JSON del OCR).
        const [{ data: cliente }, { data: instalador }] = await Promise.all([
            op?.cliente_id
                ? supabase.from('clientes').select('nombre_razon_social, apellidos, dni, direccion, municipio, codigo_postal').eq('id_cliente', op.cliente_id).maybeSingle()
                : Promise.resolve({ data: null }),
            (exp.instalador_asociado_id || op?.instalador_asociado_id || op?.prescriptor_id)
                ? supabase.from('prescriptores').select('razon_social, cif').eq('id_empresa', exp.instalador_asociado_id || op.instalador_asociado_id || op.prescriptor_id).maybeSingle()
                : Promise.resolve({ data: null }),
        ]);

        // Bono CAE del cliente para el control de sobrefinanciación (best-effort: si no
        // se puede calcular, esa regla sencillamente no se aplica).
        let caeEstimado = null;
        try {
            const { computeExpedienteFinancialsNode } = require('../services/expedienteFinancialsNode');
            const fin = await computeExpedienteFinancialsNode(exp, op);
            caeEstimado = fin?.cae ?? null;
        } catch (e) { console.warn('[facturaOcr] CAE estimado:', e.message); }

        const { detectarIncidenciasFactura } = require('../services/facturaIncidencias');
        const incidencias = detectarIncidenciasFactura({
            ocr, exp, op, cliente, instalador,
            facturasExistentes: Array.isArray(exp.documentacion?.facturas) ? exp.documentacion.facturas : [],
            caeEstimado,
        });

        // 5) Fila lista para el modal. NO se persiste aquí: la añade el frontend con el
        //    resto de la documentación (una sola forma de guardar el expediente).
        res.json({
            success: true,
            provider: facturaOcrService.PROVIDER,
            factura: {
                numero_factura: ocr.numero_factura || '',
                fecha_factura: ocr.fecha_factura || null,
                importe_sin_iva: ocr.totales?.base_imponible ?? 0,
                drive_link: saved.link,
                drive_id: saved.id,
                origen: 'ocr',
                validada: false,
                // Partidas presentes en la factura (AEROTERMIA, VENTANAS, …). Se
                // persisten porque en una REFORMA hay varias facturas y hace falta
                // saber CUÁL es la de la instalación térmica: de ella sale la fecha
                // de pruebas de la Memoria RITE (ver resolveFechasRite). Son unas
                // pocas etiquetas cortas, no el desglose completo.
                partidas: [...new Set((ocr.lineas || [])
                    .map(l => String(l?.partida || '').trim().toUpperCase())
                    .filter(Boolean))],
            },
            ocr,
            incidencias,
        });
    } catch (err) {
        console.error('Error POST expedientes/:id/facturas/ocr:', err);
        res.status(500).json({ error: 'Error procesando la factura', details: err.message });
    }
});

// ─── POST /api/expedientes/:id/documents/upload ───────────────────────────────
// Sube un documento genérico a una ruta de subcarpetas en Drive.
// Body JSON: { base64, fileName, mimeType, subfolders: ["1.CEE", "CEE INICIAL"] }
router.post('/:id/documents/upload', enforceAuth, async (req, res) => {
    try {
        const { base64, fileName, mimeType, subfolders = [] } = req.body;
        if (!base64 || base64.trim() === '' || !fileName) {
            return res.status(400).json({ error: 'base64 y fileName son obligatorios y no pueden estar vacíos' });
        }

        let { data: exp, error: expErr } = await supabase
            .from('expedientes')
            .select('*')
            .eq('id', req.params.id)
            .maybeSingle();

        // Fallback: Si no se encuentra por UUID, intentar por numero_expediente (para robustez)
        if (!exp) {
            const { data: expSeq } = await supabase
                .from('expedientes')
                .select('*')
                .eq('numero_expediente', req.params.id)
                .maybeSingle();
            exp = expSeq;
        }

        if (!exp) return res.status(404).json({ error: 'Expediente no encontrado' });

        const { data: op } = await supabase
            .from('oportunidades')
            .select('*')
            .eq('id', exp.oportunidad_id)
            .single();

        // Asegurar que datos_calculo es un objeto (si viene como string de la DB)
        let normalizedDatos = op?.datos_calculo || {};
        if (typeof normalizedDatos === 'string') {
            try { normalizedDatos = JSON.parse(normalizedDatos); } catch(e) { normalizedDatos = {}; }
        }

        const driveFolderId = normalizedDatos?.drive_folder_id || normalizedDatos?.inputs?.drive_folder_id || exp.drive_folder_id;
        console.log(`[POST /documents/upload] ExpID: ${req.params.id}, OpID: ${exp.oportunidad_id}`);
        console.log(`[POST /documents/upload] driveFolderId identified: ${driveFolderId}`);

        if (!driveFolderId) {
            console.error(`[POST /documents/upload] Drive folder missing for opportunity ${exp.oportunidad_id}`);
            return res.status(400).json({ error: 'La oportunidad no tiene carpeta de Drive configurada' });
        }

        const { getOrCreateSubfolder, saveFileToFolder, findFileByName, archiveExistingToOld } = require('../services/driveService');

        // Navegar/Crear la estructura de subcarpetas
        let currentFolderId = driveFolderId;
        for (const sub of subfolders) {
            console.log(`[POST /documents/upload] Navigating to subfolder: ${sub} (parent: ${currentFolderId})`);
            currentFolderId = await getOrCreateSubfolder(currentFolderId, sub);
        }
        console.log(`[POST /documents/upload] Final target FolderID: ${currentFolderId}`);

        // Versionado: si ya existe un archivo con el mismo nombre, moverlo a "OLD"
        // como `{base}_OLD`, `{base}_OLD1`, `{base}_OLD2`…
        const existingId = await findFileByName(currentFolderId, fileName);
        if (existingId) {
            const archived = await archiveExistingToOld(currentFolderId, existingId, fileName);
            if (archived) console.log(`[POST /documents/upload] Versionado: '${fileName}' → OLD/'${archived}'`);
        }

        const fileBuffer = Buffer.from(base64, 'base64');
        let result;
        try {
            result = await saveFileToFolder(currentFolderId, fileName, mimeType || 'application/octet-stream', fileBuffer, { throwOnError: true });
        } catch (driveErr) {
            console.error(`[POST /documents/upload] Fallo al subir '${fileName}' a Drive (folder ${currentFolderId}): ${driveErr.message}`);
            return res.status(502).json({ error: `Error al subir el archivo a Drive: ${driveErr.message}` });
        }

        if (!result) return res.status(500).json({ error: 'Error al subir el archivo a Drive' });

        // Hacer el archivo público (anyone with link → reader). Necesario para que el iframe
        // /preview funcione desde el navegador del usuario aunque no esté logueado con la cuenta de Brokergy.
        try {
            const { setFolderPublic } = require('../services/driveService');
            await setFolderPublic(result.id, 'reader');
        } catch (permErr) {
            console.warn(`[POST /documents/upload] No se pudo hacer público el archivo ${result.id}: ${permErr.message}`);
        }

        res.json({ drive_link: result.link, drive_id: result.id });
    } catch (err) {
        console.error('Error POST expedientes/:id/documents/upload:', err);
        res.status(500).json({ error: 'Error al subir el documento', details: err.message });
    }
});

// ─── POST /api/expedientes/:id/memoria-rite/generate ──────────────────────────
// Genera la MEMORIA TÉCNICA RITE (.docx) + la GUÍA DE ALTA JE6 (.pdf) llamando al
// microservicio `rite-generator`, sube ambos ficheros a la subcarpeta Drive
// "7. LEGALIZACION RITE" del expediente (con el OAuth propio de la app) y devuelve
// los enlaces. El frontend persiste cert_rite_drive_link (igual que el CIFO).
//
// El microservicio es un generador puro (sin BD ni Drive): este backend le pasa
// los datos ya resueltos (expediente + cliente + oportunidad + instalador) en la
// misma forma que espera lib/supabase_client.normalizar.

// Construye el payload (exp + instalador) que espera el microservicio RITE.
// Centralizado para que /generate, /send y /files no se desincronicen.
function buildRitePayloads({ exp, cli, op, normalizedDatos, pres }) {
    const expPayload = {
        numero_expediente: exp.numero_expediente,
        instalacion: exp.instalacion || {},
        cee: exp.cee || {},
        documentacion: exp.documentacion || {},
        ref_catastral: op?.ref_catastral || exp.instalacion?.ref_catastral || '',
        datos_calculo: normalizedDatos,
        is_reforma: (op?.is_reforma ?? normalizedDatos?.is_reforma ?? exp.cee?.is_reforma ?? false),
        nombre_razon_social: cli?.nombre_razon_social || '',
        apellidos: cli?.apellidos || '',
        dni: cli?.dni || cli?.dni_nie || '',
        tlf: cli?.tlf || cli?.telefono || '',
        // Sexo del titular → marca la casilla Hombre/Mujer en la Memoria RITE.
        sexo: cli?.sexo || '',
        // Persona jurídica → casilla "Jurídica" en vez de "Física", y sin sexo.
        es_empresa: !!cli?.es_empresa,
        cli_prov: cli?.provincia || '',
        cli_muni: cli?.municipio || '',
        cli_dir: cli?.direccion || '',
        cli_cp: cli?.codigo_postal || ''
    };
    const instaladorPayload = pres ? {
        razon_social: pres.razon_social || '',
        cif: pres.cif || '',
        numero_carnet_rite: pres.numero_carnet_rite || '',
        nombre_responsable: pres.nombre_responsable || '',
        apellidos_responsable: pres.apellidos_responsable || '',
        nif_responsable: pres.nif_responsable || '',
        tecnico_firmante_dni: pres.tecnico_firmante_dni || '',
        tecnico_firmante_distinto: pres.tecnico_firmante_distinto || false,
        tecnico_firmante_nombre: pres.tecnico_firmante_nombre || '',
        tecnico_firmante_apellidos: pres.tecnico_firmante_apellidos || '',
        tecnico_firmante_carnet_rite: pres.tecnico_firmante_carnet_rite || '',
        es_autonomo: pres.es_autonomo || false,
        cargo: pres.cargo || '',
        municipio: pres.municipio || ''
    } : null;
    // Fechas del Certificado de Instalación Térmica. Las resuelve el BACKEND
    // (fuente única en riteValidation) y viajan explícitas al microservicio:
    // así lo que se marca a mano en la app manda sobre la factura, y la fecha
    // de firma deja de ir en null (antes el generador la copiaba de la fecha
    // de pruebas, que además salía de la primera factura registrada).
    const fechas = resolveFechasRite(exp.documentacion || {});
    return { expPayload, instaladorPayload, fechas };
}

// Carga expediente + cliente + oportunidad + instalador (misma resolución que GET /:id).
async function loadRiteContext(idOrNum) {
    let { data: exp } = await supabase.from('expedientes').select('*').eq('id', idOrNum).maybeSingle();
    if (!exp) {
        const { data: bySeq } = await supabase.from('expedientes').select('*').eq('numero_expediente', idOrNum).maybeSingle();
        exp = bySeq;
    }
    if (!exp) return null;
    const [{ data: cli }, { data: op }] = await Promise.all([
        supabase.from('clientes').select('*').eq('id_cliente', exp.cliente_id).maybeSingle(),
        supabase.from('oportunidades').select('*').eq('id', exp.oportunidad_id).maybeSingle()
    ]);
    let normalizedDatos = op?.datos_calculo || {};
    if (typeof normalizedDatos === 'string') { try { normalizedDatos = JSON.parse(normalizedDatos); } catch (e) { normalizedDatos = {}; } }
    let pres = null, presReal = null, firmanteDelegado = false;
    const targetInstId = exp.instalacion?.instalador_id || op?.prescriptor_id || exp.instalador_asociado_id;
    if (targetInstId) {
        const { data: p } = await supabase.from('prescriptores').select('*').eq('id_empresa', targetInstId).maybeSingle();
        // Si el instalador asignado no está habilitado en Industria, la memoria y
        // el certificado van a nombre del instalador habilitado que firma por él.
        // `presReal` conserva el asignado: es a QUIEN se avisa (ver /send).
        const r = await resolveInstaladorFirmante(p, supabase);
        pres = r.firmante;
        presReal = r.real;
        firmanteDelegado = r.delegado;
    }
    // Potencias que no se guardaron en el expediente pero constan en el catálogo del
    // modelo. Se resuelven ANTES de validar y de construir el payload para que el
    // barrido y el documento vean exactamente el mismo dato.
    exp.instalacion = await resolvePotenciasCatalogo(exp.instalacion, supabase);
    // Superficie / zona climática / nº de plantas: los expedientes MIGRADOS no
    // pasan por la calculadora, así que sus `inputs` vienen vacíos. Se rescatan
    // del CEE del propio expediente y del Catastro (con la RC que ya tenemos) y
    // se persisten, en vez de pedírselos al usuario en "DATOS FALTANTES".
    ({ datosCalculo: normalizedDatos } = await resolveFincaInputs(
        { exp, op, datosCalculo: normalizedDatos }, supabase));
    return { exp, cli, op, normalizedDatos, pres, presReal, firmanteDelegado };
}

// ─── GET /api/expedientes/:id/memoria-rite/check ───────────────────────────────
// Barrido de datos faltantes para la Memoria RITE. Es la MISMA función que usa
// /generate, así que el popup del frontend y el 422 del backend nunca divergen:
// el frontend no reimplementa las reglas, las pregunta.
router.get('/:id/memoria-rite/check', enforceAuth, async (req, res) => {
    try {
        const ctx = await loadRiteContext(req.params.id);
        if (!ctx) return res.status(404).json({ error: 'Expediente no encontrado' });
        const { exp, cli, op, normalizedDatos, pres, presReal } = ctx;
        const missing = validateMemoriaRite({ exp, cli, op: { ...op, datos_calculo: normalizedDatos }, pres, presReal });
        // Datos que el frontend pide en un popup antes de generar: las potencias
        // son del MODELO y van al catálogo; el emplazamiento va al expediente.
        const potencias = await potenciasCatalogoPendientes(exp.instalacion, supabase);
        res.json({
            missing, potencias,
            situadoEn: situadoEnPendiente(exp) ? { opciones: SITUADO_EN_OPCIONES } : null,
            // Fecha de pruebas: null si el dato es fiable; si es ambiguo (varias
            // facturas y ninguna identificada como térmica) devuelve la propuesta
            // y las facturas para que el usuario ELIJA en vez de adivinar.
            fechaPruebas: fechaPruebasPendiente(exp.documentacion || {}),
        });
    } catch (err) {
        console.error('Error GET expedientes/:id/memoria-rite/check:', err);
        res.status(500).json({ error: 'Error al validar la Memoria RITE', details: err.message });
    }
});

// Llama al microservicio y devuelve los ficheros [{name,mimetype,base64}].
async function generarRiteFiles(expPayload, instaladorPayload, fechas = {}) {
    const RITE_SERVICE_URL = process.env.RITE_SERVICE_URL || 'http://localhost:8090';
    const { data } = await axios.post(
        `${RITE_SERVICE_URL}/generar-rite-json`,
        {
            exp: expPayload,
            instalador: instaladorPayload,
            fecha_firma: fechas.firma || null,
            fecha_pruebas: fechas.pruebas || null,
        },
        { timeout: 90000, maxBodyLength: Infinity, maxContentLength: Infinity });
    return data?.files;
}

router.post('/:id/memoria-rite/generate', enforceAuth, async (req, res) => {
    try {
        // 1) Cargar contexto (exp + cliente + oportunidad + instalador)
        const ctx = await loadRiteContext(req.params.id);
        if (!ctx) return res.status(404).json({ error: 'Expediente no encontrado' });
        const { exp, cli, op, normalizedDatos, pres, presReal } = ctx;

        // 2) Validación (defensa en profundidad; el frontend ya valida y abre el popup)
        const missing = validateMemoriaRite({ exp, cli, op: { ...op, datos_calculo: normalizedDatos }, pres, presReal });
        if (missing.length > 0) {
            return res.status(422).json({ error: 'Faltan datos para generar la Memoria RITE', missing });
        }

        // 3) Generar vía microservicio
        const { expPayload, instaladorPayload, fechas } = buildRitePayloads({ exp, cli, op, normalizedDatos, pres });
        let files;
        try {
            files = await generarRiteFiles(expPayload, instaladorPayload, fechas);
        } catch (svcErr) {
            const detail = svcErr.response?.data?.detail || svcErr.message;
            console.error('[memoria-rite] Error llamando al microservicio RITE:', detail);
            return res.status(502).json({ error: 'El servicio de generación RITE no está disponible', details: detail });
        }
        if (!Array.isArray(files) || files.length === 0) {
            return res.status(502).json({ error: 'El servicio RITE no devolvió documentos' });
        }

        // 4) Localizar carpeta Drive del expediente
        const driveFolderId = normalizedDatos?.drive_folder_id
            || normalizedDatos?.inputs?.drive_folder_id || exp.drive_folder_id;
        if (!driveFolderId) {
            return res.status(400).json({ error: 'La oportunidad no tiene carpeta de Drive configurada' });
        }

        const {
            getOrCreateSubfolder, saveFileToFolder, setFolderPublic,
            findFileByName, archiveExistingToOld
        } = require('../services/driveService');

        const riteFolderId = await getOrCreateSubfolder(driveFolderId, '7. LEGALIZACION RITE');

        let memoriaLink = null;
        let memoriaPdfLink = null;
        let guiaLink = null;
        let borradorLink = null;
        // A Drive van los MISMOS 3 documentos que se envían al instalador: memoria
        // (.docx), memoria (.pdf) y borrador del certificado. La GUÍA JE6 es una
        // chuleta para copiar los datos en la plataforma de la JCCM, no un
        // documento del expediente: se genera y se puede descargar, pero no se
        // archiva (antes quedaban 4 ficheros en la carpeta).
        const esGuiaJE6 = (f) => (f.name || '').toUpperCase().includes('GUIA_JE6');
        for (const f of files.filter(f => !esGuiaJE6(f))) {
            const buffer = Buffer.from(f.base64, 'base64');

            // Versionado: si ya existe un fichero con ese nombre, moverlo a OLD
            // como `{base}_OLD`, `{base}_OLD1`, `{base}_OLD2`…
            const existingId = await findFileByName(riteFolderId, f.name);
            if (existingId) await archiveExistingToOld(riteFolderId, existingId, f.name);

            const result = await saveFileToFolder(riteFolderId, f.name, f.mimetype, buffer);
            if (!result) return res.status(500).json({ error: `Error al subir '${f.name}' a Drive` });
            try { await setFolderPublic(result.id, 'reader'); } catch (e) { /* no bloqueante */ }

            // Distinguir por nombre: memoria .docx, memoria .pdf, borrador.
            const name = (f.name || '').toUpperCase();
            if (name.endsWith('.DOCX')) memoriaLink = result.link;
            else if (name.includes('BORRADOR_CERTIFICADO')) borradorLink = result.link;
            else if (name.includes('MEMORIA_RITE') && name.endsWith('.PDF')) memoriaPdfLink = result.link;
        }

        if (!memoriaLink) return res.status(500).json({ error: 'No se obtuvo el enlace de la Memoria RITE' });

        return res.json({
            // La Memoria (Word) que generamos NOSOTROS va en su propio campo. Antes
            // se guardaba en `cert_rite_drive_link`, que es donde la subida pública
            // deja el CERTIFICADO RITE que nos devuelve el instalador: generar la
            // memoria dejaba el expediente diciendo que el RITE ya estaba aportado
            // —y esa es la condición que permite emitir el CIFO—. Ver
            // logic/instaladorPendientes.js y scripts/separar_memoria_rite_de_certificado.js.
            memoria_rite_docx_link: memoriaLink,
            memoria_rite_pdf_link: memoriaPdfLink,
            // La guía JE6 ya no se archiva; se devuelve null y el frontend conserva
            // el enlace anterior si el expediente lo tenía de antes.
            memoria_rite_guia_link: guiaLink,
            borrador_cert_rite_link: borradorLink
        });
    } catch (err) {
        console.error('Error POST expedientes/:id/memoria-rite/generate:', err);
        res.status(500).json({ error: 'Error al generar la Memoria RITE', details: err.message });
    }
});

// ─── POST /api/expedientes/:id/memoria-rite/send ──────────────────────────────
// Envía al INSTALADOR (email y/o WhatsApp) la Memoria RITE (.docx) + el Borrador
// del Certificado (.pdf) con un mensaje. Genera los ficheros frescos vía el
// microservicio. Body: { channels: ['email','whatsapp'], message }.
router.post('/:id/memoria-rite/send', enforceAuth, async (req, res) => {
    try {
        const { channels = [], message = '', to, phone, recipients } = req.body || {};
        const chans = Array.isArray(channels) ? channels : [];
        if (!chans.includes('email') && !chans.includes('whatsapp')) {
            return res.status(400).json({ error: 'Indica al menos un canal (email/whatsapp)' });
        }

        const ctx = await loadRiteContext(req.params.id);
        if (!ctx) return res.status(404).json({ error: 'Expediente no encontrado' });
        const { exp, cli, op, normalizedDatos, pres, presReal } = ctx;
        if (!pres) return res.status(400).json({ error: 'El expediente no tiene instalador asignado' });

        // Destinatarios. Si el frontend manda `recipients` (varios contactos elegidos
        // en el popup), se envía a todos. Compatibilidad: `to`/`phone` = un solo
        // destinatario; si no llega nada, fallback al contacto del prescriptor.
        // OJO: el fallback usa el instalador REAL asignado (el que factura y con el
        // que hablamos), no el que firma los documentos por él. Los DATOS del
        // documento sí salen del firmante — ver utils/instaladorFirmante.js.
        const dest0 = presReal || pres;
        const useContact = dest0.contacto_notificaciones_activas === true || dest0.contacto_notificaciones_activas === 'true';
        let destinatarios;
        if (Array.isArray(recipients) && recipients.length) {
            destinatarios = recipients.map(r => ({
                nombre: (r?.nombre || '').toString().trim(),
                email: (r?.email || '').toString().trim(),
                tlf: (r?.phone || r?.tlf || '').toString().trim(),
            }));
        } else {
            const instEmail = ((to || (useContact ? (dest0.email_contacto || dest0.email) : dest0.email)) || '').trim();
            const instTlf = ((phone || (useContact ? (dest0.tlf_contacto || dest0.tlf || dest0.telefono) : (dest0.tlf || dest0.telefono))) || '').trim();
            destinatarios = [{
                nombre: useContact ? (dest0.nombre_contacto || dest0.razon_social || '') : (dest0.nombre_responsable || dest0.razon_social || ''),
                email: instEmail, tlf: instTlf,
            }];
        }

        // Generar ficheros frescos vía microservicio
        const { expPayload, instaladorPayload, fechas } = buildRitePayloads({ exp, cli, op, normalizedDatos, pres });
        let files;
        try {
            files = await generarRiteFiles(expPayload, instaladorPayload, fechas);
        } catch (svcErr) {
            return res.status(502).json({ error: 'El servicio de generación RITE no está disponible', details: svcErr.response?.data?.detail || svcErr.message });
        }
        if (!Array.isArray(files) || !files.length) return res.status(502).json({ error: 'El servicio RITE no devolvió documentos' });
        const U = (f) => (f.name || '').toUpperCase();
        const memoria = files.find(f => U(f).endsWith('.DOCX'));
        const memoriaPdf = files.find(f => U(f).includes('MEMORIA_RITE') && U(f).endsWith('.PDF'));
        const borrador = files.find(f => U(f).includes('BORRADOR_CERTIFICADO'));
        if (!memoria || !borrador) return res.status(500).json({ error: 'Faltan documentos generados (memoria o borrador)' });

        // Se envían 3 ficheros: Memoria (Word) + Memoria (PDF) + Borrador del certificado.
        const docsEnviar = [memoria, memoriaPdf, borrador].filter(Boolean);

        // Envía a UN destinatario por los canales seleccionados. Devuelve el detalle por canal.
        async function sendToOne(dest) {
            const out = { nombre: dest.nombre || '', email: null, whatsapp: null };
            const destEmail = (dest.email || '').trim();
            const destTlf = (dest.tlf || '').trim();

            if (chans.includes('email')) {
                if (!destEmail) { out.email = { ok: false, error: 'Sin email' }; }
                else {
                    try {
                        // Saltos en <br> y maquetado con tablas: Outlook usa el motor de Word,
                        // que ignora `white-space:pre-wrap` (el mensaje llegaba de una pieza).
                        const safeMsg = (message || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r\n|\r|\n/g, '<br>');
                        const html = `
                          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" align="center" style="width:600px;max-width:600px;font-family:Arial,Helvetica,sans-serif;border:1px solid #eee;border-radius:12px;">
                            <tr><td bgcolor="#ea580c" style="background:#ea580c;background-image:linear-gradient(135deg,#f59e0b,#ea580c);padding:24px 28px;color:#fff;border-radius:12px 12px 0 0;">
                              <h1 style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:26px;letter-spacing:.5px;color:#fff;">BROKERGY</h1>
                              <p style="margin:4px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#FFE7D0;">Ingeniería Energética · Documentación RITE</p>
                            </td></tr>
                            <tr><td style="padding:24px 28px;font-family:Arial,Helvetica,sans-serif;color:#222;font-size:14px;line-height:22px;">${safeMsg}</td></tr>
                            <tr><td style="padding:0 28px 24px;font-family:Arial,Helvetica,sans-serif;color:#555;font-size:12px;line-height:18px;">
                              📎 Adjuntos: <b>Memoria Técnica RITE</b> (Word${memoriaPdf ? ' y PDF' : ''}) y <b>Borrador del Certificado de Instalación Térmica</b> (PDF).
                            </td></tr>
                          </table>`;
                        await emailService.sendMail({
                            to: destEmail,
                            subject: `Documentación RITE — Expediente ${exp.numero_expediente}`,
                            html,
                            text: message || '',
                            attachments: docsEnviar.map(f => ({ filename: f.name, content: Buffer.from(f.base64, 'base64') }))
                        });
                        out.email = { ok: true, to: destEmail };
                    } catch (e) { out.email = { ok: false, error: e.message }; }
                }
            }

            if (chans.includes('whatsapp')) {
                if (!destTlf) { out.whatsapp = { ok: false, error: 'Sin teléfono' }; }
                else {
                    try {
                        const st = whatsappService.getStatus();
                        if (!st || !st.ready) throw new Error('WhatsApp no está conectado');
                        // 1º el borrador con el mensaje; luego memoria Word y PDF.
                        const orden = [
                            { f: borrador, caption: message || undefined },
                            { f: memoria, caption: 'Memoria Técnica RITE (Word) — revisar y firmar.' },
                            { f: memoriaPdf, caption: 'Memoria Técnica RITE (PDF) — si no hace falta editar.' }
                        ].filter(x => x.f);
                        for (const { f, caption } of orden) {
                            await whatsappService.sendMedia(destTlf,
                                { base64: f.base64, filename: f.name, mimetype: f.mimetype || 'application/pdf' },
                                { caption, asDocument: true });
                        }
                        out.whatsapp = { ok: true, phone: destTlf };
                    } catch (e) { out.whatsapp = { ok: false, error: e.message }; }
                }
            }
            return out;
        }

        // Envío secuencial (WhatsApp tiene rate-limit propio; evitamos ráfagas).
        const results = [];
        for (const dest of destinatarios) results.push(await sendToOne(dest));

        const anyOk = results.some(r => (r.email && r.email.ok) || (r.whatsapp && r.whatsapp.ok));
        // Compatibilidad: top-level email/whatsapp del primer destinatario.
        const first = results[0] || {};
        return res.status(anyOk ? 200 : 502).json({
            results,
            email: first.email,
            whatsapp: first.whatsapp,
            contacto: { nombre: first.nombre || '', email: (destinatarios[0] || {}).email || '', tlf: (destinatarios[0] || {}).tlf || '' },
        });
    } catch (err) {
        console.error('Error POST expedientes/:id/memoria-rite/send:', err);
        res.status(500).json({ error: 'Error al enviar la documentación RITE', details: err.message });
    }
});

// ─── POST /api/expedientes/:id/memoria-rite/files ─────────────────────────────
// Genera y devuelve los ficheros RITE en base64 (memoria + guía + borrador) SIN
// tocar Drive ni BD. Lo usa el popup para "Descargar".
router.post('/:id/memoria-rite/files', enforceAuth, async (req, res) => {
    try {
        const ctx = await loadRiteContext(req.params.id);
        if (!ctx) return res.status(404).json({ error: 'Expediente no encontrado' });
        const { exp, cli, op, normalizedDatos, pres } = ctx;
        const { expPayload, instaladorPayload, fechas } = buildRitePayloads({ exp, cli, op, normalizedDatos, pres });
        let files;
        try {
            files = await generarRiteFiles(expPayload, instaladorPayload, fechas);
        } catch (svcErr) {
            return res.status(502).json({ error: 'El servicio de generación RITE no está disponible', details: svcErr.response?.data?.detail || svcErr.message });
        }
        if (!Array.isArray(files) || !files.length) return res.status(502).json({ error: 'El servicio RITE no devolvió documentos' });
        return res.json({ files });
    } catch (err) {
        console.error('Error POST expedientes/:id/memoria-rite/files:', err);
        res.status(500).json({ error: 'Error al generar los documentos RITE', details: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/expedientes/:id/instalador/enviar
// ─────────────────────────────────────────────────────────────────────────────
// EL paquete del instalador: el CIFO para firmar, la documentación RITE para
// registrar, o LAS DOS COSAS en un solo mensaje y con un solo enlace.
//
// Por qué existe: al instalador se le pedían por separado y con dos enlaces
// distintos dos tareas que hace del tirón. Ahora el popup comprueba si lo otro
// también falta (fuente única: logic/instaladorPendientes.js) y ofrece mandarlo
// junto — el mismo gesto que el Anexo I + Cesión con el cliente.
//
// REGLA — el adjunto del CIFO se DESCARGA DE DRIVE, no se vuelve a rasterizar.
// Lo que el instalador firma es el PDF que le sirve su enlace público desde
// `cert_cifo_drive_link` (regla 24). Rasterizar el HTML otra vez aquí produciría
// un adjunto que PUEDE no ser byte a byte el mismo documento que va a firmar —
// es justo el fallo que ya se pagó cuando el email y el WhatsApp rasterizaban
// cada uno su propio HTML. Por eso el modal guarda primero (replaceExisting) y
// nos pasa el enlace resultante en `cifoDriveLink`.
//
// REGLA — sin CIFO borrador NO se manda el CIFO. Nunca se genera aquí "por si
// acaso": un CIFO que nadie ha revisado vuelve firmado y hay que rechazarlo.
// Igual con el RITE: solo se genera si el expediente pasa su propia validación
// (GET /memoria-rite/check), que es la que evita memorias con huecos.
//
// Body: { docs:['cifo','rite'], channels:['email','whatsapp'], message,
//         recipients:[{nombre,email,phone}], cifoDriveLink?, plantilla?, from? }
router.post('/:id/instalador/enviar', enforceAuth, async (req, res) => {
    const driveService = require('../services/driveService');
    try {
        const { docs = [], channels = [], message = '', recipients, cifoDriveLink, plantilla = 'primera', from } = req.body || {};
        const wants = ['cifo', 'rite'].filter(k => docs.includes(k));
        const chans = ['email', 'whatsapp'].filter(c => (Array.isArray(channels) ? channels : []).includes(c));
        if (!wants.length) return res.status(400).json({ error: 'Indica al menos un documento (cifo/rite)' });
        if (!chans.length) return res.status(400).json({ error: 'Indica al menos un canal (email/whatsapp)' });

        const ctx = await loadRiteContext(req.params.id);
        if (!ctx) return res.status(404).json({ error: 'Expediente no encontrado' });
        const { exp, cli, op, normalizedDatos, pres, presReal } = ctx;
        const numexpte = exp.numero_expediente || req.params.id;
        const doc = exp.documentacion || {};

        const { estadoInstalador, asuntoInstalador, enlaceInstalador } = await loadInstaladorPendientes();
        const estado = estadoInstalador(doc);
        const APP = process.env.VITE_APP_URL || process.env.APP_URL || 'https://app.brokergy.es';
        const enlace = enlaceInstalador(APP, exp.id);

        // ── Adjuntos ─────────────────────────────────────────────────────────
        // Se preparan TODOS antes de mandar nada: un mensaje que anuncia dos
        // documentos y solo lleva uno es peor que no haberlo mandado.
        const adjuntos = [];   // [{ filename, content: Buffer, mimetype, etiqueta }]

        if (wants.includes('cifo')) {
            // El enlace que acaba de guardar el modal manda sobre el del expediente:
            // el PUT que lo persiste puede no haber aterrizado todavía.
            const link = cifoDriveLink || estado.cifo.borrador;
            if (!link) {
                return res.status(422).json({ error: 'No hay un Certificado CIFO generado que enviar. Genéralo primero desde el expediente.' });
            }
            const m = String(link).match(/\/file\/d\/([A-Za-z0-9_-]+)/) || String(link).match(/[?&]id=([A-Za-z0-9_-]+)/);
            if (!m) return res.status(422).json({ error: 'No se pudo resolver el fichero del CIFO en Drive' });
            let buffer;
            try { buffer = await driveService.getFileContent(m[1]); }
            catch (e) { buffer = null; }
            if (!buffer || !buffer.length) {
                return res.status(502).json({ error: 'No se pudo descargar el CIFO desde Drive. No se ha enviado nada.' });
            }
            adjuntos.push({
                filename: `${numexpte} - Certificado_CIFO.pdf`,
                content: Buffer.from(buffer),
                mimetype: 'application/pdf',
                etiqueta: 'Certificado CIFO — para firmar',
            });
        }

        if (wants.includes('rite')) {
            const { expPayload, instaladorPayload, fechas } = buildRitePayloads({ exp, cli, op, normalizedDatos, pres });
            let files;
            try { files = await generarRiteFiles(expPayload, instaladorPayload, fechas); }
            catch (svcErr) {
                // Todo o nada: un mensaje que anuncia dos documentos y solo lleva uno
                // deja al instalador buscando lo que no llegó. Si el RITE no se puede
                // preparar, se dice y se ofrece la salida (mandar solo el CIFO).
                return res.status(502).json({ error: 'El servicio de generación RITE no está disponible, así que no se ha enviado nada. Desmarca la documentación RITE si quieres mandar solo el CIFO.', details: svcErr.response?.data?.detail || svcErr.message });
            }
            const U = (f) => (f.name || '').toUpperCase();
            const memoria = (files || []).find(f => U(f).endsWith('.DOCX'));
            const memoriaPdf = (files || []).find(f => U(f).includes('MEMORIA_RITE') && U(f).endsWith('.PDF'));
            const borrador = (files || []).find(f => U(f).includes('BORRADOR_CERTIFICADO'));
            if (!memoria || !borrador) return res.status(502).json({ error: 'Faltan documentos generados (memoria o borrador). No se ha enviado nada.' });
            const push = (f, etiqueta) => f && adjuntos.push({
                filename: f.name, content: Buffer.from(f.base64, 'base64'),
                mimetype: f.mimetype || 'application/pdf', etiqueta,
            });
            push(borrador, 'Borrador del Certificado de Instalación Térmica — para copiar en la plataforma');
            push(memoria, 'Memoria Técnica RITE (Word) — revisar y firmar');
            push(memoriaPdf, 'Memoria Técnica RITE (PDF) — si no hace falta editar');
        }

        // ── Destinatarios ────────────────────────────────────────────────────
        // El fallback usa el instalador REAL asignado (con el que hablamos), no el
        // que firma por él ante Industria (ver utils/instaladorFirmante.js).
        const dest0 = presReal || pres || {};
        let destinatarios;
        if (Array.isArray(recipients) && recipients.length) {
            destinatarios = recipients.map(r => ({
                nombre: (r?.nombre || '').toString().trim(),
                email: (r?.email || '').toString().trim(),
                tlf: (r?.phone || r?.tlf || '').toString().trim(),
            }));
        } else {
            const useContact = dest0.contacto_notificaciones_activas === true || dest0.contacto_notificaciones_activas === 'true';
            destinatarios = [{
                nombre: useContact ? (dest0.nombre_contacto || dest0.razon_social || '') : (dest0.nombre_responsable || dest0.razon_social || ''),
                email: ((useContact ? (dest0.email_contacto || dest0.email) : dest0.email) || '').trim(),
                tlf: ((useContact ? (dest0.tlf_contacto || dest0.tlf || dest0.telefono) : (dest0.tlf || dest0.telefono)) || '').trim(),
            }];
        }
        if (!destinatarios.length) return res.status(400).json({ error: 'No hay ningún destinatario' });

        const clienteNombre = [cli?.nombre_razon_social, cli?.apellidos].filter(Boolean).join(' ').trim();
        const subject = asuntoInstalador({ docs: wants, numexpte, clienteNombre, plantilla });
        const pideFirma = wants.includes('cifo');

        let quotaErr = null;
        async function sendToOne(dest) {
            const out = { nombre: dest.nombre || '', email: null, whatsapp: null };

            if (chans.includes('email')) {
                if (!dest.email) out.email = { ok: false, error: 'Sin email' };
                else {
                    try {
                        await emailService.sendDocumentEmail({
                            to: dest.email,
                            from,
                            subject,
                            title: pideFirma
                                ? (wants.includes('rite') ? 'Te faltan dos cosas de esta obra' : 'Firma tu Certificado CIFO')
                                : 'Documentación RITE de tu expediente',
                            message: message || '',
                            primaryLink: enlace,
                            primaryLabel: pideFirma
                                ? (wants.includes('rite') ? '🖊️ Firmar y subir aquí' : '🖊️ Firmar CIFO ahora')
                                : '📎 Subir la documentación RITE',
                            secondaryNote: 'Desde ese enlace se ve lo que falta de esta obra y se resuelve todo en el mismo sitio.'
                                + (pideFirma ? ' Para firmar en el navegador necesitas Autofirma; si lo prefieres, puedes subir el PDF ya firmado.' : ''),
                            pill: pideFirma ? { tone: 'warning', text: 'Pendiente de firma', emoji: '✍️' } : null,
                            attachments: adjuntos.map(a => ({ filename: a.filename, content: a.content })),
                        });
                        out.email = { ok: true, to: dest.email };
                    } catch (e) {
                        if (e?.isQuotaError) quotaErr = e;
                        out.email = { ok: false, error: e.message };
                    }
                }
            }

            if (chans.includes('whatsapp')) {
                if (!dest.tlf) out.whatsapp = { ok: false, error: 'Sin teléfono' };
                else {
                    try {
                        const st = whatsappService.getStatus();
                        if (!st || !st.ready) throw new Error('WhatsApp no está conectado');
                        // El texto va PRIMERO y aparte; cada fichero detrás con una
                        // etiqueta corta. Un mensaje largo como pie de un adjunto hace
                        // que mucha gente no llegue a abrir el fichero.
                        if (message) await whatsappService.sendText(dest.tlf, message);
                        for (const a of adjuntos) {
                            await whatsappService.sendMedia(dest.tlf,
                                { base64: a.content.toString('base64'), filename: a.filename, mimetype: a.mimetype },
                                { caption: a.etiqueta, asDocument: true });
                        }
                        out.whatsapp = { ok: true, phone: dest.tlf };
                    } catch (e) { out.whatsapp = { ok: false, error: e.message }; }
                }
            }
            return out;
        }

        // Secuencial: WhatsApp tiene su propio rate-limit y no admite ráfagas.
        const results = [];
        for (const dest of destinatarios) results.push(await sendToOne(dest));

        const anyOk = results.some(r => (r.email && r.email.ok) || (r.whatsapp && r.whatsapp.ok));

        // Si NADA salió y el motivo fue la cuota del buzón, se responde con el
        // formato que entiende `postEmail` para ofrecer el reenvío desde el
        // alternativo (utils/emailFallback en el frontend).
        if (!anyOk && quotaErr) return emailService.emailErrorResponse(res, quotaErr, 'No se pudo enviar la documentación al instalador.');

        return res.status(anyOk ? 200 : 502).json({ results, docs: wants, enlace });
    } catch (err) {
        console.error('Error POST expedientes/:id/instalador/enviar:', err);
        res.status(500).json({ error: 'Error al enviar la documentación al instalador', details: err.message });
    }
});

// ─── GET /api/expedientes/:id/instalador/estado ───────────────────────────────
// Qué le falta al instalador de este expediente. Lo consulta el popup de envío
// (CIFO y RITE) para saber si tiene que ofrecer el envío conjunto, y con qué
// avisos. Misma función que usa la página pública del instalador.
router.get('/:id/instalador/estado', enforceAuth, async (req, res) => {
    try {
        const { data: exp, error } = await supabase
            .from('expedientes')
            .select('id, numero_expediente, documentacion')
            .eq('id', req.params.id)
            .maybeSingle();
        if (error || !exp) return res.status(404).json({ error: 'Expediente no encontrado' });
        const { estadoInstalador, enlaceInstalador } = await loadInstaladorPendientes();
        const APP = process.env.VITE_APP_URL || process.env.APP_URL || 'https://app.brokergy.es';
        res.json({ ...estadoInstalador(exp.documentacion || {}), enlace: enlaceInstalador(APP, exp.id) });
    } catch (err) {
        console.error('Error GET expedientes/:id/instalador/estado:', err);
        res.status(500).json({ error: 'Error al calcular lo que falta del instalador' });
    }
});

// ─── POST /api/expedientes/:id/documents/make-public ──────────────────────────
// Endpoint utilitario para hacer público un archivo de Drive existente.
// Útil para archivos ya subidos antes de este cambio que siguen dando 403.
// Body: { driveLink?, driveId? }
router.post('/:id/documents/make-public', enforceAuth, async (req, res) => {
    try {
        const { driveLink, driveId } = req.body || {};
        let fileId = driveId;
        if (!fileId && driveLink) {
            // Buscar SOLO en el segmento `/file/d/{ID}` o `/folders/{ID}` para evitar capturar otros tokens largos
            const m = String(driveLink).match(/\/(?:file\/d|folders|drive\/folders)\/([-\w]{20,})/);
            fileId = m ? m[1] : null;
            // Fallback: primera cadena de 25+ chars [-\w]
            if (!fileId) {
                const m2 = String(driveLink).match(/[-\w]{25,}/);
                fileId = m2 ? m2[0] : null;
            }
        }
        if (!fileId) return res.status(400).json({ error: 'No se pudo extraer el ID de Drive del link proporcionado.' });

        console.log(`[make-public] Procesando fileId=${fileId} (link=${driveLink || 'N/A'})`);

        const { setFolderPublic, getFileMetadata } = require('../services/driveService');

        // Verificar primero que el archivo es accesible por la cuenta OAuth de la app.
        const meta = await getFileMetadata(fileId);
        if (!meta) {
            return res.status(404).json({
                error: 'El archivo no existe o la cuenta de Drive de Brokergy no tiene acceso a él. '
                     + 'Probablemente fue subido por otra cuenta de Google. Solución: sustitúyelo subiendo el archivo de nuevo desde la app.',
                fileId
            });
        }

        const ok = await setFolderPublic(fileId, 'reader');
        if (!ok) return res.status(500).json({ error: 'No se pudo cambiar permisos del archivo (ver logs del servidor).' });
        res.json({ ok: true, fileId, fileName: meta.name });
    } catch (err) {
        console.error('Error POST expedientes/:id/documents/make-public:', err);
        res.status(500).json({ error: 'Error al cambiar permisos', details: err.message });
    }
});

// ─── GET /api/expedientes/:id/documents/scan-cee ──────────────────────────────
// Escanea las carpetas 1. CEE / CEE INICIAL y CEE FINAL en Drive y mapea
// los archivos encontrados a los slots por sufijo del nombre.
// Útil para detectar archivos subidos directamente en Drive (fuera de la app).
router.get('/:id/documents/scan-cee', enforceAuth, async (req, res) => {
    try {
        let { data: exp } = await supabase
            .from('expedientes')
            .select('*')
            .eq('id', req.params.id)
            .maybeSingle();
        if (!exp) {
            const { data: expSeq } = await supabase
                .from('expedientes')
                .select('*')
                .eq('numero_expediente', req.params.id)
                .maybeSingle();
            exp = expSeq;
        }
        if (!exp) return res.status(404).json({ error: 'Expediente no encontrado' });

        const { data: op } = await supabase
            .from('oportunidades')
            .select('datos_calculo')
            .eq('id', exp.oportunidad_id)
            .single();

        let normalizedDatos = op?.datos_calculo || {};
        if (typeof normalizedDatos === 'string') {
            try { normalizedDatos = JSON.parse(normalizedDatos); } catch (e) { normalizedDatos = {}; }
        }
        const driveFolderId = op?.drive_folder_id || normalizedDatos?.drive_folder_id || normalizedDatos?.inputs?.drive_folder_id || exp.drive_folder_id;
        if (!driveFolderId) return res.json({ inicial: {}, final: {} });

        const { findSubfolderByName, listFiles } = require('../services/driveService');

        // Mapeo sufijo → slot id (mismo criterio que el frontend en DOCUMENT_SLOTS)
        const matchSlot = (filename) => {
            const lower = (filename || '').toLowerCase();
            if (lower.endsWith('.xml')) return 'xml';
            if (lower.endsWith('.cex')) return 'cex';
            if (lower.endsWith('_reg.pdf')) return 'registro';
            if (lower.endsWith('_etq.pdf')) return 'etiqueta';
            if (lower.endsWith('_fdo.pdf')) return 'pdf';
            return null; // OTROS o desconocido
        };

        const scanSection = async (sectionLabel) => {
            const out = { xml: null, pdf: null, cex: null, registro: null, etiqueta: null, otros: [], sinVincular: {} };
            const ceeRoot = await findSubfolderByName(driveFolderId, '1. CEE');
            if (!ceeRoot) return out;
            const sectionFolder = await findSubfolderByName(ceeRoot, sectionLabel);
            if (!sectionFolder) return out;
            const files = await listFiles(sectionFolder);
            for (const f of files) {
                if (f.mimeType === 'application/vnd.google-apps.folder') continue; // ignorar OLD
                const slot = matchSlot(f.name);
                if (slot === 'otros' || slot === null) {
                    out.otros.push(f.webViewLink);
                } else if (slot === 'xml' || slot === 'cex') {
                    // El .xml y el .cex NO encienden su slot desde Drive. Encender el
                    // slot dice "hecho", y con estos dos no basta con que el fichero
                    // exista: pasar por el slot es lo que PARSEA las demandas del .xml
                    // y lo que mueve el subestado al subir el .cex. Un fichero dejado a
                    // mano en la carpeta ponía el slot en ámbar sin haber calculado
                    // nada. Se informan aparte para poder avisar de que están ahí.
                    if (!out.sinVincular[slot]) out.sinVincular[slot] = f.webViewLink;
                } else if (!out[slot]) {
                    out[slot] = f.webViewLink;
                }
            }
            return out;
        };

        const [inicial, final] = await Promise.all([
            scanSection('CEE INICIAL'),
            scanSection('CEE FINAL')
        ]);

        res.json({ inicial, final });
    } catch (err) {
        console.error('Error GET expedientes/:id/documents/scan-cee:', err);
        res.status(500).json({ error: 'Error al escanear carpeta CEE', details: err.message });
    }
});

// ─── GET /api/expedientes/:id/local-path ──────────────────────────────────────
// Solo ADMIN. Reconstruye la ruta LOCAL de Windows (espejo de Google Drive para
// escritorio) de la carpeta del expediente, subiendo por la cadena de carpetas
// padre en Drive. El frontend la usa para abrir la carpeta con el protocolo
// brokergylocal: y/o copiarla al portapapeles. Configurable con LOCAL_DRIVE_BASE.
router.get('/:id/local-path', staffOnly, async (req, res) => {
    try {
        let { data: exp } = await supabase
            .from('expedientes').select('*').eq('id', req.params.id).maybeSingle();
        if (!exp) {
            const { data: expSeq } = await supabase
                .from('expedientes').select('*').eq('numero_expediente', req.params.id).maybeSingle();
            exp = expSeq;
        }
        if (!exp) return res.status(404).json({ error: 'Expediente no encontrado' });

        // OJO: ni oportunidades ni expedientes tienen columna drive_folder_id;
        // la carpeta vive SIEMPRE dentro de datos_calculo (JSONB).
        const { data: op } = await supabase
            .from('oportunidades')
            .select('id, datos_calculo')
            .eq('id', exp.oportunidad_id)
            .maybeSingle();

        let normalizedDatos = op?.datos_calculo || {};
        if (typeof normalizedDatos === 'string') {
            try { normalizedDatos = JSON.parse(normalizedDatos); } catch (e) { normalizedDatos = {}; }
        }
        let driveFolderId = normalizedDatos?.drive_folder_id || normalizedDatos?.inputs?.drive_folder_id;
        // Fallback robusto: si solo hay enlace, extraer el id de la carpeta del propio link.
        if (!driveFolderId && normalizedDatos?.drive_folder_link) {
            const m = String(normalizedDatos.drive_folder_link).match(/folders\/([A-Za-z0-9_-]+)/);
            if (m) driveFolderId = m[1];
        }
        if (!driveFolderId) {
            return res.status(404).json({ error: 'El expediente no tiene carpeta de Drive asociada' });
        }

        const { getFolderPathSegments, sanitizeWindowsSegment } = require('../services/driveService');
        const rawSegments = await getFolderPathSegments(driveFolderId);
        if (!rawSegments.length) {
            return res.status(502).json({ error: 'No se pudo resolver la ruta de la carpeta en Drive' });
        }
        // Saneo a nombre LOCAL de Windows (Google sustituye \ / : * ? " < > | por espacio)
        const segments = rawSegments.map(sanitizeWindowsSegment);

        const base = (process.env.LOCAL_DRIVE_BASE || 'C:\\Users\\Usuario\\Mi unidad').replace(/[\\/]+$/, '');
        const localPath = [base, ...segments].join('\\');

        res.json({ path: localPath, folderName: segments[segments.length - 1], segments });
    } catch (err) {
        console.error('Error GET expedientes/:id/local-path:', err);
        res.status(500).json({ error: 'Error al resolver la ruta local', details: err.message });
    }
});

// ─── GET /api/expedientes/:id/drive-link ──────────────────────────────────────
// Solo staff. Devuelve el enlace a la carpeta RAÍZ de Drive del expediente. Lo usa
// la ficha del cliente para el botón "Drive" sin tener que cargar el expediente
// completo (datos_calculo es enorme).
router.get('/:id/drive-link', staffOnly, async (req, res) => {
    try {
        const { exp, driveLink } = await resolveExpedienteDriveFolder(req.params.id);
        if (!exp) return res.status(404).json({ error: 'Expediente no encontrado' });
        if (!driveLink) return res.status(404).json({ error: 'El expediente no tiene carpeta de Drive asociada' });
        res.json({ drive_folder_link: driveLink });
    } catch (err) {
        console.error('Error GET expedientes/:id/drive-link:', err);
        res.status(500).json({ error: 'Error al resolver el enlace de Drive', details: err.message });
    }
});

// ─── GET /api/expedientes/:id/open-local-folder ───────────────────────────────
// Endpoint PÚBLICO (token HMAC). El admin lo recibe como botón "Abrir carpeta
// local del expediente" en el email de SOLICITUD DE REVISIÓN. Los clientes de
// correo (Gmail/Outlook) no permiten enlaces con protocolos personalizados
// (brokergylocal:), así que el botón apunta aquí (https) y esta página lanza el
// protocolo en el navegador. Degrada con elegancia a la carpeta de Drive si el
// handler no está instalado o falla la resolución.
router.get('/:id/open-local-folder', async (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    const page = ({ b64 = '', path = '', driveLink = '', error = '' }) => `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>BROKERGY · Carpeta local</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#0a0e1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}
  .card{background:#111827;border:1px solid #334155;border-radius:20px;padding:40px 30px;max-width:480px;width:100%;text-align:center}
  .icon{font-size:48px;margin-bottom:16px}
  h2{color:#10b981;margin-bottom:12px;font-size:22px}
  p{color:#94a3b8;line-height:1.5;margin-bottom:14px;font-size:14px}
  code{display:block;background:#0a0e1a;border:1px solid #334155;border-radius:10px;padding:10px 12px;color:#cbd5e1;font-size:12px;word-break:break-all;margin:10px 0 18px}
  a.btn,button.btn{display:inline-block;border:none;cursor:pointer;font-family:inherit;background:#10b981;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:10px;margin:4px}
  a.ghost{display:inline-block;color:#22d3ee;text-decoration:none;font-size:13px;font-weight:600;margin-top:8px}
  .brand{color:#475569;font-size:11px;margin-top:26px;letter-spacing:.05em}
</style></head>
<body><div class="card">
  <div class="icon">${error ? '⚠️' : '📂'}</div>
  <h2>${error ? 'No se pudo resolver la carpeta' : 'Abriendo la carpeta local…'}</h2>
  ${error
    ? `<p>${error}</p>`
    : `<p>Si no se abre el Explorador de Windows automáticamente, pulsa el botón. Requiere haber instalado una vez <strong>brokergylocal_setup.reg</strong> en este PC.</p>
       <code>${path}</code>
       <button class="btn" onclick="openLocal()">Abrir carpeta local</button>`}
  ${driveLink ? `<p style="margin-top:10px"><a class="ghost" href="${driveLink}" target="_blank" rel="noopener noreferrer">¿No se abre? Abrir en Google Drive →</a></p>` : ''}
  <div class="brand">BROKERGY · Ingeniería Energética</div>
</div>
${error ? '' : `<script>
  var B64=${JSON.stringify(b64)};
  function openLocal(){ try{ window.location.href='brokergylocal:'+B64; }catch(e){} }
  setTimeout(openLocal, 300);
</script>`}
</body></html>`;

    try {
        if (!openFolderSignatureValid(req.params.id, req.query.token)) {
            return res.status(403).send(page({ error: 'El enlace no es válido o ha cambiado.' }));
        }
        const { exp, driveFolderId, driveLink } = await resolveExpedienteDriveFolder(req.params.id);
        if (!exp) return res.status(404).send(page({ error: 'Expediente no encontrado.' }));
        if (!driveFolderId) return res.status(404).send(page({ error: 'El expediente no tiene carpeta de Drive asociada.', driveLink }));

        const local = await resolveLocalPathFromDriveFolder(driveFolderId);
        if (!local) return res.status(502).send(page({ error: 'No se pudo resolver la ruta de la carpeta en Drive.', driveLink }));

        // base64url CONSERVANDO el padding '=' (lo espera el handler .vbs).
        const b64 = Buffer.from(local.path, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
        res.send(page({ b64, path: local.path, driveLink }));
    } catch (err) {
        console.error('Error GET expedientes/:id/open-local-folder:', err);
        res.status(500).send(page({ error: 'Error interno al resolver la carpeta local.' }));
    }
});

// ─── POST /api/expedientes/:id/documents/repair-cee-links ─────────────────────
// Repara los webViewLink rotos en cee.cee_files (todos en mayúsculas por bug histórico).
// Escanea la carpeta CEE en Drive y sustituye cada slot por el link real del archivo.
router.post('/:id/documents/repair-cee-links', enforceAuth, async (req, res) => {
    try {
        console.log(`[repair-cee-links] Inicio para expediente ${req.params.id}`);
        let { data: exp } = await supabase
            .from('expedientes')
            .select('*')
            .eq('id', req.params.id)
            .maybeSingle();
        if (!exp) {
            const { data: expSeq } = await supabase
                .from('expedientes')
                .select('*')
                .eq('numero_expediente', req.params.id)
                .maybeSingle();
            exp = expSeq;
        }
        if (!exp) return res.status(404).json({ error: 'Expediente no encontrado' });

        const { data: op } = await supabase
            .from('oportunidades')
            .select('datos_calculo')
            .eq('id', exp.oportunidad_id)
            .single();
        let normalizedDatos = op?.datos_calculo || {};
        if (typeof normalizedDatos === 'string') {
            try { normalizedDatos = JSON.parse(normalizedDatos); } catch (e) { normalizedDatos = {}; }
        }
        const driveFolderId = normalizedDatos?.drive_folder_id || normalizedDatos?.inputs?.drive_folder_id || exp.drive_folder_id;
        if (!driveFolderId) return res.status(400).json({ error: 'Sin carpeta de Drive' });
        console.log(`[repair-cee-links] driveFolderId=${driveFolderId}`);

        const { findSubfolderByName, listFiles, setFolderPublic } = require('../services/driveService');
        const matchSlot = (filename) => {
            const lower = (filename || '').toLowerCase();
            if (lower.endsWith('.xml')) return 'xml';
            if (lower.endsWith('.cex')) return 'cex';
            if (lower.endsWith('_reg.pdf')) return 'registro';
            if (lower.endsWith('_etq.pdf')) return 'etiqueta';
            if (lower.endsWith('_fdo.pdf')) return 'pdf';
            return null;
        };

        const newFiles = { inicial: { otros: [] }, final: { otros: [] } };
        const ceeRoot = await findSubfolderByName(driveFolderId, '1. CEE');
        console.log(`[repair-cee-links] ceeRoot=${ceeRoot}`);
        if (ceeRoot) {
            for (const sectionLabel of ['CEE INICIAL', 'CEE FINAL']) {
                const sectionKey = sectionLabel.endsWith('INICIAL') ? 'inicial' : 'final';
                const sectionFolder = await findSubfolderByName(ceeRoot, sectionLabel);
                console.log(`[repair-cee-links] ${sectionLabel} folder=${sectionFolder}`);
                if (!sectionFolder) continue;
                const files = await listFiles(sectionFolder);
                console.log(`[repair-cee-links] ${sectionLabel}: ${files.length} archivos`);
                for (const f of files) {
                    if (f.mimeType === 'application/vnd.google-apps.folder') continue; // ignorar OLD
                    const slot = matchSlot(f.name);
                    console.log(`[repair-cee-links]   '${f.name}' → slot=${slot} link=${f.webViewLink}`);
                    if (slot && !newFiles[sectionKey][slot]) {
                        newFiles[sectionKey][slot] = f.webViewLink;
                        // De paso, hacer público el archivo
                        try { await setFolderPublic(f.id, 'reader'); } catch (_) {}
                    } else if (!slot) {
                        newFiles[sectionKey].otros.push(f.webViewLink);
                    }
                }
            }
        }

        // Mergear con el cee actual del expediente, preservando otros campos.
        // IMPORTANTE: sobrescribimos los slots existentes con los del scan (la BD puede tener links corruptos)
        const currentCee = exp.cee || {};
        const updatedCee = {
            ...currentCee,
            cee_files: {
                inicial: { ...(currentCee.cee_files?.inicial || {}), ...newFiles.inicial },
                final:   { ...(currentCee.cee_files?.final   || {}), ...newFiles.final   },
            }
        };

        console.log(`[repair-cee-links] Updating expediente ${exp.id} con:`, JSON.stringify(updatedCee.cee_files));

        const { error: updErr } = await supabase
            .from('expedientes')
            .update({ cee: updatedCee })
            .eq('id', exp.id);
        if (updErr) {
            console.error(`[repair-cee-links] supabase update error:`, updErr);
            return res.status(500).json({ error: 'Error guardando cee_files', details: updErr.message });
        }

        console.log(`[repair-cee-links] ✅ Reparado expediente ${exp.id}`);
        res.json({ ok: true, repaired: newFiles });
    } catch (err) {
        console.error('Error POST expedientes/:id/documents/repair-cee-links:', err);
        res.status(500).json({ error: 'Error al reparar links', details: err.message });
    }
});

// ─── DELETE /api/expedientes/:id/documents/file ───────────────────────────────
// Borra un archivo de Drive (lo manda a papelera).
// Body: { driveLink? , driveId? }
router.delete('/:id/documents/file', enforceAuth, async (req, res) => {
    try {
        const { driveLink, driveId } = req.body || {};
        let fileId = driveId;
        if (!fileId && driveLink) {
            // Extraer ID del webViewLink: https://drive.google.com/file/d/{ID}/view?...
            const m = String(driveLink).match(/[-\w]{25,}/);
            fileId = m ? m[0] : null;
        }
        if (!fileId) return res.status(400).json({ error: 'driveId o driveLink son obligatorios' });

        const { deleteFile } = require('../services/driveService');
        const ok = await deleteFile(fileId);
        if (!ok) return res.status(500).json({ error: 'No se pudo eliminar el archivo de Drive' });
        res.json({ ok: true, deletedId: fileId });
    } catch (err) {
        console.error('Error DELETE expedientes/:id/documents/file:', err);
        res.status(500).json({ error: 'Error al borrar archivo', details: err.message });
    }
});

// ─── POST /api/expedientes/:id/documents/upload-budget ────────────────────────
// Sube el presupuesto del instalador. 
// Nombre fijo: "PRESUPUESTO DE LA INSTALACIÓN.pdf"
// Si ya existe, se renombra el anterior a "..._old.pdf"
// Si es imagen, se convierte a PDF.
router.post('/:id/documents/upload-budget', enforceAuth, async (req, res) => {
    try {
        const { base64, mimeType } = req.body;
        if (!base64) return res.status(400).json({ error: 'base64 es obligatorio' });

        const { data: exp } = await supabase.from('expedientes').select('*, oportunidades(*)').eq('id', req.params.id).maybeSingle();
        if (!exp) return res.status(404).json({ error: 'Expediente no encontrado' });

        const op = exp.oportunidades;
        const driveFolderId = op?.drive_folder_id || exp.drive_folder_id;
        if (!driveFolderId) return res.status(400).json({ error: 'No hay carpeta de Drive' });

        const { getOrCreateSubfolder, findFileByName, renameFolder, deleteFile, saveFileToFolder } = require('../services/driveService');
        const { imageToPdf } = require('../services/pdfService');

        // Carpeta destino: 2.ANEXOS / PRESUPUESTO INSTALADOR
        const anexosId = await getOrCreateSubfolder(driveFolderId, '2.ANEXOS');
        const targetFolderId = await getOrCreateSubfolder(anexosId, 'PRESUPUESTO INSTALADOR');

        const finalFileName = 'PRESUPUESTO DE LA INSTALACIÓN.pdf';
        const oldFileName = 'PRESUPUESTO DE LA INSTALACIÓN_old.pdf';

        // 1. Manejar sustitución (Versioning simple)
        const existingId = await findFileByName(targetFolderId, finalFileName);
        if (existingId) {
            const oldId = await findFileByName(targetFolderId, oldFileName);
            if (oldId) await deleteFile(oldId); // Borrar el _old anterior si existe
            await renameFolder(existingId, oldFileName); // Renombrar el actual a _old
        }

        // 2. Procesar archivo (Convertir a PDF si es imagen)
        let fileBuffer = Buffer.from(base64, 'base64');
        let finalMime = 'application/pdf';

        if (mimeType && (mimeType.includes('image/jpeg') || mimeType.includes('image/png') || mimeType.includes('image/jpg'))) {
            console.log(`[Upload-Budget] Detectada imagen (${mimeType}), convirtiendo a PDF...`);
            fileBuffer = await imageToPdf(base64, mimeType);
        } else if (mimeType && mimeType.includes('pdf')) {
            finalMime = 'application/pdf';
        }

        // 3. Guardar en Drive
        const result = await saveFileToFolder(targetFolderId, finalFileName, finalMime, fileBuffer);
        if (!result) throw new Error('Error al guardar en Drive');

        res.json({ success: true, link: result.link });
    } catch (err) {
        console.error('Error upload-budget:', err);
        res.status(500).json({ error: 'Error al subir presupuesto', details: err.message });
    }
});

// ─── DELETE /api/expedientes/:id ──────────────────────────────────────────────
// Al borrar el expediente, también se mueve la carpeta Drive a la papelera
// (la carpeta vive en la oportunidad asociada — datos_calculo.drive_folder_id).
router.delete('/:id', adminOnly, async (req, res) => {
    try {
        if (req.user.rol_nombre !== 'ADMIN') {
            return res.status(403).json({ error: 'Solo el administrador puede eliminar expedientes' });
        }

        // 1. Obtener el expediente + la oportunidad asociada (para el drive_folder_id)
        const { data: exp, error: getErr } = await supabase
            .from('expedientes')
            .select('id, numero_expediente, oportunidad_id, oportunidades:oportunidad_id(datos_calculo)')
            .eq('id', req.params.id)
            .maybeSingle();
        if (getErr) throw getErr;
        if (!exp) return res.status(404).json({ error: 'Expediente no encontrado' });

        // ¿Es un expediente migrado desde XML? Su oportunidad es sintética (1:1) y
        // debe borrarse junto con el expediente para no dejar huérfanos MIG-*.
        const isSyntheticOp = exp.oportunidades?.datos_calculo?.origen === 'migracion_xml';

        // 2. Mover carpeta Drive a papelera si existe (best-effort, no bloqueante)
        const datosCalculo = exp.oportunidades?.datos_calculo || {};
        const driveFolderId = datosCalculo.drive_folder_id || datosCalculo.inputs?.drive_folder_id;
        let driveDeleted = false;
        if (driveFolderId) {
            try {
                const { deleteFile } = require('../services/driveService');
                driveDeleted = await deleteFile(driveFolderId);
                if (driveDeleted) {
                    console.log(`[DELETE expediente ${exp.numero_expediente}] Carpeta Drive ${driveFolderId} movida a papelera`);
                } else {
                    console.warn(`[DELETE expediente ${exp.numero_expediente}] No se pudo mover la carpeta Drive ${driveFolderId}`);
                }
            } catch (e) {
                console.warn(`[DELETE expediente ${exp.numero_expediente}] Error borrando Drive folder:`, e.message);
            }
        }

        // 3. Borrar el expediente
        const { error } = await supabase
            .from('expedientes')
            .delete()
            .eq('id', req.params.id);
        if (error) throw error;

        // 4. Si la oportunidad era sintética (migración XML), borrarla también
        let syntheticOpDeleted = false;
        if (isSyntheticOp && exp.oportunidad_id) {
            const { error: opDelErr } = await supabase
                .from('oportunidades')
                .delete()
                .eq('id', exp.oportunidad_id);
            if (opDelErr) {
                console.warn(`[DELETE expediente ${exp.numero_expediente}] No se pudo borrar la oportunidad sintética:`, opDelErr.message);
            } else {
                syntheticOpDeleted = true;
                console.log(`[DELETE expediente ${exp.numero_expediente}] Oportunidad sintética ${exp.oportunidad_id} borrada`);
            }
        }

        res.json({ success: true, drive_deleted: driveDeleted, drive_folder_id: driveFolderId || null, synthetic_op_deleted: syntheticOpDeleted });
    } catch (err) {
        console.error('Error DELETE expedientes/:id:', err);
        res.status(500).json({ error: 'Error al eliminar el expediente' });
    }
});



// ─── GET /api/expedientes/proxy/pdf ──────────────────────────────────────────
// Proxy para descargar PDFs externos sin problemas de CORS en el frontend
router.get('/proxy/pdf', enforceAuth, async (req, res) => {
    let { url } = req.query;
    if (!url) return res.status(400).send('URL missing');

    // Transformación automática para enlaces de Google Drive
    if (url.includes('drive.google.com')) {
        // Soporta /file/d/ID/view, /open?id=ID, /file/d/ID/edit, etc.
        const driveIdMatch = url.match(/\/file\/d\/([^\/\?]+)/) || url.match(/[?&]id=([^\&]+)/);
        if (driveIdMatch) {
            url = `https://docs.google.com/uc?export=download&id=${driveIdMatch[1]}`;
            console.log(`[Proxy] Detected Google Drive URL, transformed to: ${url}`);
        }
    }

    try {
        const response = await axios.get(url, { 
            responseType: 'arraybuffer', 
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        const contentType = response.headers['content-type'];
        if (contentType && !contentType.includes('pdf') && !url.includes('download')) {
             console.warn(`[Proxy] Advertencia: El contenido descargado no parece un PDF (${contentType})`);
        }

        res.set('Content-Type', contentType || 'application/pdf');
        res.send(response.data);
    } catch (err) {
        console.error('Error in proxy-pdf:', err.message);
        res.status(500).send('Error fetching PDF');
    }
});

// POST /api/expedientes/:id/notify-certificador
// Asigna un certificador al expediente, le da acceso Editor a la subcarpeta
// "12. DOCUMENTOS PARA CEE" del Drive del expediente, persiste el folder ID en
// Notificar al certificador asignado (multi-canal, multi-plantilla, trazabilidad)
// Body: { certificador_id?, sendEmail?, sendWhatsApp?, phase?, template? }
router.post('/:id/notify-certificador', internalKeyOrAuth, async (req, res) => {
    const driveService = require('../services/driveService');
    const crypto = require('crypto');
    const CEE_FOLDER_NAME = '12. DOCUMENTOS PARA CEE';

    try {
        const { data: exp, error: expErr } = await supabase
            .from('expedientes')
            .select('*')
            .eq('id', req.params.id)
            .single();
        if (expErr || !exp) return res.status(404).json({ error: 'Expediente no encontrado' });

        const bodyCertId = req.body?.certificador_id || null;
        const sendEmail = req.body?.sendEmail === true;
        const sendWhatsApp = req.body?.sendWhatsApp === true;
        const phase = req.body?.phase || 'initial';
        const template = req.body?.template || 'standard';
        const priority = req.body?.priority === 'urgent' ? 'urgent' : 'normal';
        // Dos ejes del mensaje de seguimiento: QUÉ esperamos del certificador
        // ('emision' = falta emitir el .cex | 'registro' = ya tiene el visto bueno y
        // falta registrar en Industria) y con qué tono. Si no viene, se deriva del
        // subestado de seguimiento para que los avisos antiguos sigan funcionando.
        const seguimientoActual = exp.seguimiento || {};
        const subestadoFase = phase === 'final' ? seguimientoActual.cee_final : seguimientoActual.cee_inicial;
        const espera = req.body?.espera === 'registro' || req.body?.espera === 'emision'
            ? req.body.espera
            : (String(subestadoFase || '').toUpperCase() === 'REVISADO' ? 'registro' : 'emision');
        const esRegistro = espera === 'registro';
        const adminMessage = (req.body?.adminMessage || '').trim() || null;
        // Cuerpo del mensaje editado en el modal. Si viene, ES el texto que se envía
        // (sustituye al saludo+intro de la plantilla en email y al cuerpo en WhatsApp).
        const customMessage = (req.body?.customMessage || '').trim() || null;
        const dbCertId = exp.cee?.certificador_id || null;
        const certId = bodyCertId || dbCertId;
        if (!certId) return res.status(400).json({ error: 'El expediente no tiene certificador asignado' });

        // Automatización de estado
        // GUARD: un recordatorio al certificador nunca puede hacer retroceder el
        // expediente (ej: PENDIENTE REVISIÓN → EN CERTIFICADOR). `avanzarEstado`
        // aplica el orden del ciclo de vida en vez de una lista blanca de estados
        // que se quedaba corta en cuanto aparecía uno nuevo.
        const newEstado = phase === 'final' ? 'EN CERTIFICADOR CEE FINAL' : 'EN CERTIFICADOR CEE INICIAL';
        const estadoTrasAviso = avanzarEstado(exp.estado, newEstado);
        if (estadoTrasAviso !== exp.estado) {
            await supabase.from('expedientes').update({ estado: estadoTrasAviso, updated_at: new Date().toISOString() }).eq('id', req.params.id);
        }

        // Persistir el cert si vino en body y difiere del guardado
        let workingCee = { ...(exp.cee || {}) };
        if (bodyCertId && bodyCertId !== dbCertId) {
            workingCee.certificador_id = bodyCertId;
        }

        const [
            { data: cert },
            { data: cli },
            { data: op }
        ] = await Promise.all([
            supabase.from('prescriptores').select('*').eq('id_empresa', certId).maybeSingle(),
            supabase.from('clientes').select('*').eq('id_cliente', exp.cliente_id).maybeSingle(),
            supabase.from('oportunidades').select('*').eq('id', exp.oportunidad_id).maybeSingle()
        ]);

        if (!cert) return res.status(404).json({ error: 'Certificador no encontrado en la base de datos' });
        if (!cert.email && sendEmail) {
            return res.status(400).json({
                error: `El certificador "${cert.razon_social || cert.acronimo || ''}" no tiene email registrado en su ficha. Edítalo desde Prescriptores.`
            });
        }

        const ficha = op?.ficha || 'RES060';
        const dc = op?.datos_calculo || {};
        const result = dc.result || {};
        const inputs = dc.inputs || {};

        // Demanda objetivo: priorizamos kWh/m²·año (q_net) sobre el total (Q_net)
        const superficieRef = parseFloat(inputs.superficieCalefactable) || parseFloat(inputs.surface) || null;
        const demandaPerM2 =
            parseFloat(result.q_net) ||
            parseFloat(inputs.demand_per_m2) ||
            parseFloat(inputs.demandaCalefaccion) ||
            (superficieRef && parseFloat(result.Q_net) ? parseFloat(result.Q_net) / superficieRef : null);
        const demandaObjetivoTotal =
            parseFloat(result.Q_net) ||
            parseFloat(dc.Q_net) ||
            (superficieRef && demandaPerM2 ? superficieRef * demandaPerM2 : null);
        const ahorroObjetivo = parseFloat(result.res080?.ahorroEnergiaFinalTotal) || null;

        const expedienteNum = exp.numero_expediente || op?.id_oportunidad || req.params.id;
        
        // Ficha del cliente para el certificador. Separa la dirección de la
        // INSTALACIÓN del domicilio del CLIENTE (solo se envía si difieren).
        const { data: clienteData } = buildCertClienteData(exp, op, cli);
        const clienteName = clienteData.nombre;

        const certName = cert.razon_social || cert.acronimo || 'Técnico';
        const portalLink = `${process.env.FRONTEND_URL || 'https://app.brokergy.es'}/?exp=${req.params.id}`;

        // Tipo de actuación para el asunto del email
        const tipoActuacion =
            ficha === 'RES080' ? 'REFORMA' :
            ficha === 'RES093' ? 'HIBRIDACIÓN' :
            ficha === 'TER100' ? 'AEROTERMIA TERCIARIO' :
            'AEROTERMIA';

        // ── Drive: localizar subcarpeta CEE y dar permiso Editor al cert ────────
        let ceeFolderId = workingCee.cee_folder_id || null;
        let ceeFolderLink = workingCee.cee_folder_link || null;
        let driveAccessGranted = false;

        const rootFolderId = dc.drive_folder_id || dc.inputs?.drive_folder_id || null;
        if (rootFolderId) {
            try {
                if (!ceeFolderId) {
                    ceeFolderId = await driveService.getOrCreateSubfolder(rootFolderId, CEE_FOLDER_NAME);
                }
                if (ceeFolderId && !ceeFolderLink) {
                    ceeFolderLink = await driveService.getWebViewLink(ceeFolderId);
                }
                // Persistir SIEMPRE la info de carpeta, independiente del grant
                if (ceeFolderId) {
                    workingCee.cee_folder_id = ceeFolderId;
                    workingCee.cee_folder_link = ceeFolderLink;
                }
                // Grant solo si el cert tiene email registrado
                if (ceeFolderId && cert.email) {
                    await driveService.grantPermissionToEmail(ceeFolderId, cert.email, 'writer');
                    driveAccessGranted = true;
                }
            } catch (driveErr) {
                console.error('[notify-certificador] error Drive:', driveErr.message);
                // No bloqueamos: seguimos con el email aunque falle el permiso Drive
            }
        } else {
            console.warn('[notify-certificador] Oportunidad sin drive_folder_id — sin acceso Drive para el cert');
        }

        // ── Token de confirmación (cert-ack) ─────────────────────────────────────
        const ackToken = crypto.createHash('sha256')
            .update(`${req.params.id}-${certId}-${Date.now()}`)
            .digest('hex').slice(0, 32);
        workingCee.ack_token = ackToken;
        workingCee.ack_phase = phase;
        const ackLink = `${process.env.FRONTEND_URL || 'https://app.brokergy.es'}/cert-ack/${req.params.id}?token=${ackToken}&phase=${phase}`;

        // Persistir cee actualizado (cert_id + folder ids + ack_token)
        const seguimiento = exp.seguimiento || { cee_inicial: 'PTE_EMITIR', cee_final: 'PTE_EMITIR', anexos: 'PTE_EMITIR' };
        
        // Solo actualizamos el Roadmap a ASIGNADO si es un nuevo encargo (standard).
        // Si es un recordatorio (reminder) o aviso urgente (urgent), no tocamos el Roadmap para no perder la trazabilidad.
        if (template === 'standard') {
            if (phase === 'final') {
                applyStatus(seguimiento, 'cee_final', 'ASIGNADO');
            } else {
                applyStatus(seguimiento, 'cee_inicial', 'ASIGNADO');
            }
        }
        // Constancia de la última comunicación al certificador (incluye recordatorios/urgentes,
        // que no cambian de subestado pero sí cuentan como "se lo he enviado"). Solo si se
        // va a enviar algo por algún canal — "solo asignar" no cuenta como contacto.
        if (sendEmail || sendWhatsApp) markCertContact(seguimiento, phase);

        const { error: updErr } = await supabase
            .from('expedientes')
            .update({ cee: workingCee, seguimiento, updated_at: new Date().toISOString() })
            .eq('id', req.params.id);
        if (updErr) console.error('[notify-certificador] error persistiendo cee:', updErr.message);

        // Encargado el CEE, el expediente deja de estar "solo aceptado": su carpeta
        // baja de "03. ACEPTADO" a "04. EN CURSO". Si ya venía de más adelante
        // (DOC. COMPLETA de un migrado), carpetaObjetivoExpediente no la retrocede.
        syncExpedienteFolderAsync(
            { ...exp, estado: estadoTrasAviso, cee: workingCee },
            { motivo: 'certificador asignado' }
        );

        // ── Envío de comunicaciones ──────────────────────────────────────────────
        const channels = [];
        const phaseLabel = phase === 'final' ? 'CEE Final' : 'CEE Inicial';
        const templateLabels = { standard: 'Encargo', reminder: 'Recordatorio', urgent: 'Urgente' };

        // Si lo que esperamos es el REGISTRO, el mensaje tiene que llevar el enlace
        // para subir el CEE registrado (etiqueta + justificante) — es la acción que
        // le estamos pidiendo. Mismo enlace firmado que usa el visto bueno.
        let ceeUploadLink = null;
        if (esRegistro) {
            try {
                const ceeUploadService = require('../services/ceeUploadService');
                const normPhase = phase === 'final' ? 'final' : 'inicial';
                const upTok = ceeUploadService.ceeUploadSignature(req.params.id, normPhase);
                const appBase = process.env.FRONTEND_URL || 'https://app.brokergy.es';
                ceeUploadLink = `${appBase}/subir-cee/${req.params.id}?token=${upTok}&phase=${normPhase}`;
            } catch (upErr) {
                console.warn('[notify-certificador] no se pudo preparar el enlace de subida del CEE:', upErr.message);
            }
        }

        // === EMAIL ===
        if (sendEmail) {
            const emailParams = {
                to: cert.email,
                certName,
                expedienteNum,
                clienteName,
                clienteData,
                ficha,
                tipoActuacion,
                ceeFolderLink,
                portalLink,
                ackLink,
                priority,
                adminMessage,
                customMessage,
                espera,
                ceeUploadLink,
            };

            if (template === 'reminder') {
                await emailService.sendCertificadorReminderEmail(emailParams);
            } else if (template === 'urgent') {
                await emailService.sendCertificadorUrgentEmail(emailParams);
            } else if (phase === 'final') {
                await emailService.sendCertificadorFinalNotificationEmail(emailParams);
            } else {
                await emailService.sendCertificadorNotificationEmail({
                    ...emailParams,
                    demandaPerM2,
                    superficieRef,
                    ahorroObjetivo
                });
            }
            channels.push('Email');
        }

        // === WHATSAPP VÍA COLA ===
        if (sendWhatsApp) {
            const certPhone = cert.telefono || cert.movil || cert.tlf || null;
            if (!certPhone) {
                console.warn('[notify-certificador] Certificador sin teléfono para WhatsApp');
            } else {
                const urgentWaPrefix = priority === 'urgent' && template === 'standard' ? '🚨 *URGENTE* 🚨\n\n' : '';
                const adminMsgWa = adminMessage ? `\n💬 *Mensaje:* ${adminMessage}\n` : '';

                // Enlace de subida del CEE registrado: solo aplica en fase de registro.
                const subirWa = (esRegistro && ceeUploadLink)
                    ? `\n\n📤 Sube aquí el ${phaseLabel} registrado (etiqueta + justificante):\n${ceeUploadLink}`
                    : '';

                let waMsg = '';
                if (customMessage) {
                    // El admin ha editado el texto (suele incluir ya el enlace de la carpeta). Solo
                    // añadimos el enlace de la carpeta si el cuerpo no trae ninguna URL, y la firma.
                    const hasUrl = /https?:\/\//i.test(customMessage);
                    const carpetaWa = (ceeFolderLink && !hasUrl) ? `\n\n📁 Carpeta de documentos:\n${ceeFolderLink}` : '';
                    // El de subida sí se añade siempre en fase de registro (es la acción pedida),
                    // salvo que el propio texto ya lo lleve.
                    const subirExtra = (subirWa && !customMessage.includes('/subir-cee/')) ? subirWa : '';
                    waMsg = `${customMessage}${carpetaWa}${subirExtra}\n\n*BROKERGY · Ingeniería Energética*`;
                } else if (template === 'reminder' && esRegistro) {
                    // Plantilla compartida con el parte diario de seguimiento: el
                    // certificador debe recibir el mismo texto le escribas desde aquí
                    // o desde el enlace del parte (services/recordatorios.js).
                    waMsg = recordatorios.certRegistroWa({ certName, phaseLabel, expedienteNum, clienteName, adminMsgWa, subirWa });
                } else if (template === 'urgent' && esRegistro) {
                    waMsg = `🚨 *URGENTE* 🚨\n\nHola *${certName}*, el *${phaseLabel}* del expediente *${expedienteNum}*${clienteName ? ` (${clienteName})` : ''} tiene nuestro visto bueno y todavía *no consta registrado* en Industria.\n\nEl expediente está bloqueado hasta que nos subas la etiqueta y el justificante de registro.${adminMsgWa}${subirWa}\n\n*BROKERGY · Ingeniería Energética*`;
                } else if (template === 'reminder') {
                    waMsg = recordatorios.certEmisionWa({ certName, phaseLabel, expedienteNum, clienteName, adminMsgWa, ceeFolderLink, portalLink });
                } else if (template === 'urgent') {
                    waMsg = `*⚠️ AVISO URGENTE*\n\nHola *${certName}*, necesitamos con urgencia el *${phaseLabel}* del expediente *${expedienteNum}*${clienteName ? ` (${clienteName})` : ''}.\n\nEs importante que lo priorices para cumplir con los plazos del programa.${adminMsgWa}\n\n${ceeFolderLink ? '📁 Carpeta: ' + ceeFolderLink + '\n' : ''}${portalLink ? '🔗 Portal: ' + portalLink + '\n' : ''}\nQuedamos a la espera.\n*BROKERGY · Ingeniería Energética*`;
                } else if (phase === 'final') {
                    waMsg = `${urgentWaPrefix}¡Hola *${certName}*!\n\nYa puedes presentar el *CEE FINAL* del expediente *${expedienteNum}*${clienteName ? ` (${clienteName})` : ''}.\n\nToda la documentación de obra ya está en la carpeta compartida.${adminMsgWa}\n\n${ceeFolderLink ? '📁 Carpeta: ' + ceeFolderLink + '\n' : ''}${portalLink ? '🔗 Portal: ' + portalLink + '\n' : ''}\n¡Gracias!\n*BROKERGY · Ingeniería Energética*`;
                } else {
                    waMsg = `${urgentWaPrefix}¡Hola *${certName}*!\n\nTe hemos asignado el expediente *${expedienteNum}*${clienteName ? ` (${clienteName})` : ''} para el *CEE Inicial*.\n\nTienes toda la documentación en la carpeta y el portal.${adminMsgWa}\n\n${ceeFolderLink ? '📁 Carpeta: ' + ceeFolderLink + '\n' : ''}${portalLink ? '🔗 Portal: ' + portalLink + '\n' : ''}\n¡Gracias!\n*BROKERGY · Ingeniería Energética*`;
                }

                try {
                    const waRes = await whatsappService.sendText(certPhone, waMsg);
                    // sendText siempre encola en BD; si el cliente no está READY, se enviará al reconectar.
                    channels.push(waRes?.state === 'READY' ? 'WhatsApp' : 'WhatsApp (encolado)');
                } catch (waErr) {
                    console.error('[notify-certificador] Error WhatsApp:', waErr.message);
                    channels.push('WhatsApp (encolado)');
                }
            }
        }

        // ── Registro en historial (Trazabilidad) ────────────────────────────────
        if (channels.length > 0) {
            try {
                const docObj = exp.documentacion || {};
                const historial = docObj.historial || [];
                // `origen` distingue en el historial un envío hecho desde el expediente
                // de uno disparado con un clic desde el parte diario.
                const userName = req.internalCall
                    ? (req.body?.origen === 'parte' ? 'PARTE DE SEGUIMIENTO' : 'AGENTE IA')
                    : (req.user?.rol_nombre === 'ADMIN'
                        ? 'ADMINISTRADOR'
                        : (req.user?.acronimo || req.user?.razon_social || 'SISTEMA'));

                const priorityTag = priority === 'urgent' ? ' · 🚨 URGENTE' : '';
                // Qué se le estaba reclamando: sin esto el historial no distingue un
                // recordatorio de emisión de uno de registro.
                const esperaTag = template === 'standard'
                    ? ''
                    : ` · ${esRegistro ? 'Registro en Industria' : 'Emisión del CEE'}`;
                const sentBody = customMessage || adminMessage;
                const msgTag = sentBody ? `\n💬 Mensaje: "${sentBody}"` : '';
                historial.push({
                    id: Date.now().toString() + '_certnotif',
                    tipo: 'notificacion_certificador',
                    texto: `Notificación ${phaseLabel} (${templateLabels[template] || 'Estándar'}${esperaTag}${priorityTag}) enviada a ${certName} vía ${channels.join(' + ')}${msgTag}`,
                    fecha: new Date().toISOString(),
                    usuario: userName,
                    priority,
                    espera,
                    adminMessage,
                    customMessage
                });

                await supabase.from('expedientes')
                    .update({ documentacion: { ...docObj, historial }, updated_at: new Date().toISOString() })
                    .eq('id', req.params.id);

                if (priority === 'urgent') {
                    await supabase.from('expedientes')
                        .update({ prioridad: 'URGENTE' })
                        .eq('id', req.params.id);
                }
            } catch (histErr) {
                console.error('[notify-certificador] Error guardando historial:', histErr.message);
            }
        }

        res.json({
            ok: true,
            sentTo: sendEmail ? cert.email : null,
            certName,
            ceeFolderId,
            ceeFolderLink,
            driveAccessGranted,
            emailSent: sendEmail,
            whatsAppSent: sendWhatsApp && channels.includes('WhatsApp'),
            channels,
            newEstado,
            template
        });
    } catch (err) {
        console.error('[notify-certificador]', err.message);
        res.status(500).json({ error: 'Error procesando la asignación', details: err.message });
    }
});

// ─── POST /api/expedientes/:id/cert-ack ───────────────────────────────────────
// Endpoint PÚBLICO (sin auth) para que el certificador confirme recepción del encargo.
// Protegido por token temporal generado en notify-certificador.
router.post('/:id/cert-ack', async (req, res) => {
    try {
        const { token } = req.body;
        if (!token) return res.status(400).json({ error: 'Token requerido' });

        const { data: exp, error: expErr } = await supabase
            .from('expedientes')
            .select('*')
            .eq('id', req.params.id)
            .single();
        if (expErr || !exp) return res.status(404).json({ error: 'Expediente no encontrado' });

        const cee = exp.cee || {};
        if (cee.ack_token !== token) {
            return res.status(403).json({ error: 'Token inválido o expirado. Es posible que se haya enviado una notificación más reciente.' });
        }

        // La fase REAL es la que se guardó al generar el token, no la del body
        // (evita que un URL manipulado cambie el estado a fase incorrecta)
        const phase = cee.ack_phase || req.body.phase || 'initial';

        // Token válido — marcar como confirmado
        const certId = cee.certificador_id;
        const [{ data: cert }, { data: cli }, { data: op }] = await Promise.all([
            supabase.from('prescriptores').select('razon_social, acronimo').eq('id_empresa', certId).maybeSingle(),
            exp.cliente_id ? supabase.from('clientes').select('*').eq('id_cliente', exp.cliente_id).maybeSingle() : Promise.resolve({ data: null }),
            exp.oportunidad_id ? supabase.from('oportunidades').select('*').eq('id', exp.oportunidad_id).maybeSingle() : Promise.resolve({ data: null }),
        ]);
        const certName = cert?.razon_social || cert?.acronimo || 'Técnico';

        // Ficha del cliente (nombre + dirección de instalación) para dar más contexto en el aviso a BROKERGY
        const { data: clienteData } = buildCertClienteData(exp, op, cli);

        const phaseLabel = phase === 'final' ? 'CEE Final' : 'CEE Inicial';
        const newEstado = phase === 'final' ? 'EN TRABAJO (CEE FINAL)' : 'EN TRABAJO (CEE INICIAL)';
        // El estado global nunca retrocede: la confirmación de un encargo antiguo
        // no puede devolver a "EN TRABAJO" un expediente que ya avanzó.
        const globalEstado = avanzarEstado(exp.estado, newEstado);

        // Invalidar token (uso único)
        cee.ack_token = null;
        cee.ack_confirmed_at = new Date().toISOString();
        cee.ack_confirmed_phase = phase;
        cee.estado = newEstado;

        const seguimiento = exp.seguimiento || { cee_inicial: 'ASIGNADO', cee_final: 'ASIGNADO', anexos: 'PTE_EMITIR' };
        if (phase === 'final') {
            applyStatus(seguimiento, 'cee_final', 'EN_TRABAJO');
        } else {
            applyStatus(seguimiento, 'cee_inicial', 'EN_TRABAJO');
        }

        // Persistimos cee + seguimiento + estado global + historial en una sola escritura
        const docObj = exp.documentacion || {};
        const historial = docObj.historial || [];
        const nowIso = new Date().toISOString();

        // Entry de confirmación (tipo)
        historial.push({
            id: Date.now().toString() + '_certack',
            tipo: 'confirmacion_certificador',
            texto: `El certificador ${certName} ha confirmado la recepción del encargo ${phaseLabel}`,
            fecha: nowIso,
            usuario: certName
        });
        // Entry de cambio de estado (para historial unificado)
        historial.push({
            id: Date.now().toString() + '_status_certack',
            estado: globalEstado,
            fecha: nowIso,
            usuario: certName
        });

        await supabase.from('expedientes')
            .update({
                cee,
                seguimiento,
                estado: globalEstado,
                documentacion: { ...docObj, historial },
                updated_at: nowIso
            })
            .eq('id', req.params.id);

        if (globalEstado !== exp.estado) {
            syncExpedienteFolderAsync({ ...exp, estado: globalEstado, cee }, { motivo: 'cert-ack' });
        }

        // Notificar a BROKERGY por email (de fondo, sin bloquear respuesta)
        setImmediate(async () => {
            try {
                await emailService.sendCertifierAcceptedAdminNotification(exp.id, exp.numero_expediente, certName, phaseLabel, clienteData);
            } catch (mailErr) {
                console.error('[cert-ack] Error enviando notificación a admin:', mailErr.message);
            }
        });

        res.json({ ok: true, certName, phase: phaseLabel, newEstado: cee.estado });
    } catch (err) {
        console.error('[cert-ack]', err.message);
        res.status(500).json({ error: 'Error procesando la confirmación' });
    }
});

// ─── POST /api/expedientes/:id/notify-review ──────────────────────────────
// El certificador notifica que ha subido el CEX y está pendiente de revisión
// Body: { phase, priority?, techMessage? }
router.post('/:id/notify-review', enforceAuth, async (req, res) => {
    try {
        const { phase } = req.body;
        const priority = req.body?.priority === 'urgent' ? 'urgent' : 'normal';
        const techMessage = (req.body?.techMessage || '').trim() || null;

        const { data: exp, error: expErr } = await supabase
            .from('expedientes')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (expErr || !exp) return res.status(404).json({ error: 'Expediente no encontrado' });

        const phaseLabel = phase === 'final' ? 'CEE Final' : 'CEE Inicial';
        const newEstado = phase === 'final' ? 'PENDIENTE REVISIÓN (FINAL)' : 'PENDIENTE REVISIÓN (INICIAL)';

        const userName = req.user?.rol_nombre === 'CERTIFICADOR'
            ? (req.user?.acronimo || req.user?.razon_social)
            : (req.user?.nombre || 'Técnico');

        // ── Datos del certificador (para teléfono/email) y del cliente ────
        const certId = exp.cee?.certificador_id || null;
        const [
            { data: cert } = { data: null },
            { data: cli } = { data: null },
            { data: op } = { data: null }
        ] = await Promise.all([
            certId
                ? supabase.from('prescriptores').select('*').eq('id_empresa', certId).maybeSingle()
                : Promise.resolve({ data: null }),
            exp.cliente_id
                ? supabase.from('clientes').select('*').eq('id_cliente', exp.cliente_id).maybeSingle()
                : Promise.resolve({ data: null }),
            exp.oportunidad_id
                ? supabase.from('oportunidades').select('*').eq('id', exp.oportunidad_id).maybeSingle()
                : Promise.resolve({ data: null }),
        ]);

        const inputs = op?.datos_calculo?.inputs || {};
        // Misma ficha de cliente que en el encargo inicial: dirección de instalación
        // y domicilio del cliente por separado.
        const { data: clienteData } = buildCertClienteData(exp, op, cli);
        const clienteName = clienteData.nombre;

        const certName = (cert?.razon_social || cert?.acronimo) || userName || 'Técnico';
        const certPhone = cert?.telefono || cert?.movil || cert?.tlf || null;
        const certEmail = cert?.email || null;

        const expedienteNum = exp.numero_expediente || op?.id_oportunidad || req.params.id;
        const portalLink = `${process.env.FRONTEND_URL || 'https://app.brokergy.es'}/?exp=${req.params.id}`;
        const ceeFolderLink = exp.cee?.cee_folder_link || null;

        const prevSeguimiento = exp.seguimiento || {};
        const seguimientoKey = phase === 'final' ? 'cee_final' : 'cee_inicial';

        // ¿Es un reenvío? (ya estaba PTE_REVISION antes de esta llamada)
        const isResend = prevSeguimiento[seguimientoKey] === 'PTE_REVISION';

        // Guard: si Brokergy ya dio el visto bueno (REVISADO o REGISTRADO), la nueva subida
        // de .CEX es el definitivo — solo se registra el evento, sin retroceder el estado.
        const postApprovalStates = ['REVISADO', 'REGISTRADO'];
        const isAlreadyApproved = postApprovalStates.includes(prevSeguimiento[seguimientoKey]);

        const docObj = exp.documentacion || {};
        const historial = docObj.historial || [];

        if (isAlreadyApproved) {
            historial.push({
                id: Date.now().toString() + '_cex_def',
                tipo: 'informativo',
                texto: `El certificador ha subido la versión definitiva del .CEX del ${phaseLabel}. El expediente ya estaba revisado y aprobado por BROKERGY; no se requiere nueva revisión.`,
                fecha: new Date().toISOString(),
                usuario: userName || 'Sistema'
            });

            const { error: updErr } = await supabase.from('expedientes')
                .update({ documentacion: { ...docObj, historial }, updated_at: new Date().toISOString() })
                .eq('id', req.params.id);

            if (updErr) throw updErr;

            return res.json({
                ok: true,
                alreadyApproved: true,
                message: 'CEX actualizado. Estado no modificado — el expediente ya estaba aprobado por Brokergy.'
            });
        }

        // Preparar actualizaciones
        const cee = exp.cee || {};
        cee.estado = newEstado;
        // `cee.estado` es la etiqueta de la fase del CEE; el estado GLOBAL solo avanza.
        const globalEstado = avanzarEstado(exp.estado, newEstado);

        const priorityTag = priority === 'urgent' ? ' · 🚨 URGENTE' : '';
        const msgTag = techMessage ? `\n💬 Mensaje: "${techMessage}"` : '';
        const resendTag = isResend ? ' (reenvío)' : '';

        // 1. Notificación técnica (con prioridad y mensaje opcional)
        historial.push({
            id: Date.now().toString() + '_revreq',
            tipo: 'notificacion_tecnica',
            texto: `El técnico ha subido el archivo .CEX del ${phaseLabel}${priorityTag}${resendTag}. PENDIENTE DE REVISIÓN por BROKERGY.${msgTag}`,
            priority,
            techMessage,
            isResend,
            fecha: new Date().toISOString(),
            usuario: userName || 'Sistema'
        });

        // 2. Cambio de estado para historial unificado (solo si no es reenvío)
        if (!isResend) {
            historial.push({
                id: Date.now().toString() + '_status',
                estado: globalEstado,
                fecha: new Date().toISOString(),
                usuario: userName || 'Sistema'
            });
        }

        const seguimiento = exp.seguimiento || { cee_inicial: 'ASIGNADO', cee_final: 'ASIGNADO', anexos: 'PTE_EMITIR' };
        if (phase === 'final') {
            applyStatus(seguimiento, 'cee_final', 'PTE_REVISION');
        } else {
            applyStatus(seguimiento, 'cee_inicial', 'PTE_REVISION');
        }

        // Enlace one-tap "Dar visto bueno" del email al admin. Firma HMAC stateless
        // (ver approveCeeSignature): NO se guarda en `seguimiento` para que el
        // autoguardado del módulo no lo pueda pisar.
        const approvePhaseKey = phase === 'final' ? 'final' : 'inicial';
        const approveCeeToken = approveCeeSignature(req.params.id, approvePhaseKey);

        const { error: updErr } = await supabase.from('expedientes')
            .update({
                cee,
                estado: globalEstado,
                seguimiento,
                documentacion: { ...docObj, historial },
                updated_at: new Date().toISOString()
            })
            .eq('id', req.params.id);

        if (updErr) {
            console.error('Error actualizando Supabase en notify-review:', updErr);
            throw updErr;
        }

        if (globalEstado !== exp.estado) {
            syncExpedienteFolderAsync({ ...exp, estado: globalEstado, cee }, { motivo: 'notify-review' });
        }

        // Enlace one-tap para el email del admin
        const approveLink = `${process.env.FRONTEND_URL || 'https://app.brokergy.es'}/api/expedientes/${req.params.id}/approve-cee-from-email?token=${approveCeeToken}&phase=${approvePhaseKey}`;

        // Enlace "abrir carpeta LOCAL del expediente" (https → lanza brokergylocal:).
        const openFolderToken = openFolderSignature(req.params.id);
        const openLocalLink = `${process.env.FRONTEND_URL || 'https://app.brokergy.es'}/api/expedientes/${req.params.id}/open-local-folder?token=${openFolderToken}`;

        const channels = [];

        // Email rico al admin
        try {
            await emailService.sendReviewRequestEmailToAdmin({
                expedienteId: exp.id,
                numExp: expedienteNum,
                certName,
                certPhone,
                certEmail,
                phase,
                clienteName,
                clienteData,
                portalLink,
                ceeFolderLink,
                openLocalLink,
                approveLink,
                priority,
                techMessage,
                isResend,
            });
            channels.push('Email');
        } catch (mailErr) {
            console.error('Error enviando email a admin notify-review:', mailErr.message);
        }

        // WhatsApp al admin (homogeneidad con el flujo admin → cert)
        try {
            const adminPhone = process.env.WHATSAPP_ADMIN_CHAT;
            if (adminPhone) {
                const urgentWaPrefix = priority === 'urgent' ? '🚨 *URGENTE* 🚨\n\n' : '';
                const resendWaTag = isResend ? ' *(reenvío)*' : '';
                const msgBlock = techMessage ? `\n💬 *Mensaje del técnico:* ${techMessage}\n` : '';
                const clientLine = clienteName ? ` del cliente *${clienteName}*` : '';
                const waMsg = `${urgentWaPrefix}📢 *REVISIÓN SOLICITADA*${resendWaTag}\n\nEl técnico *${certName}* ha subido el *.CEX* del *${phaseLabel}* del expediente *${expedienteNum}*${clientLine}.${msgBlock}\n${certPhone ? '📞 Tlf técnico: ' + certPhone + '\n' : ''}🔗 Ver expediente: ${portalLink}\n${ceeFolderLink ? '📁 Carpeta CEE: ' + ceeFolderLink + '\n' : ''}\n*BROKERGY · Ingeniería Energética*`;
                await whatsappService.sendText(adminPhone, waMsg);
                channels.push('WhatsApp');
            }
        } catch (waErr) {
            console.error('[notify-review] Error WhatsApp admin:', waErr.message);
        }

        res.json({ ok: true, newEstado, priority, isResend, channels });
    } catch (err) {
        console.error('[notify-review]', err.message);
        res.status(500).json({ error: 'Error procesando la solicitud de revisión' });
    }
});

// ─── GET /api/expedientes/:id/approve-cee-links ───────────────────────────
// Devuelve los enlaces que el visto bueno añadirá al mensaje: descarga (carpeta
// CEE INICIAL/FINAL) y subida (popup del CEE registrado). Solo LECTURA — no crea
// carpeta ni cambia permisos (eso lo hace approve-cee al enviar de verdad). Sirve
// para que el admin vea en el preview lo que recibirá el certificador.
router.get('/:id/approve-cee-links', staffOnly, async (req, res) => {
    try {
        const ceeUploadService = require('../services/ceeUploadService');
        const phase = req.query.phase === 'final' ? 'final' : 'inicial';
        // OJO: expedientes NO tiene columna drive_folder_id (vive en datos_calculo).
        const { data: exp } = await supabase
            .from('expedientes').select('id, oportunidad_id').eq('id', req.params.id).maybeSingle();
        if (!exp) return res.status(404).json({ error: 'Expediente no encontrado' });

        const APP_BASE = process.env.FRONTEND_URL || 'https://app.brokergy.es';
        let presentFolderLink = null;
        try {
            const driveFolderId = await ceeUploadService.resolveDriveFolderId(exp);
            if (driveFolderId) presentFolderLink = await ceeUploadService.findCeeSectionFolderLink(driveFolderId, phase);
        } catch (e) { console.warn('[approve-cee-links]', e.message); }

        const upTok = ceeUploadService.ceeUploadSignature(req.params.id, phase);
        const ceeUploadLink = `${APP_BASE}/subir-cee/${req.params.id}?token=${upTok}&phase=${phase}`;

        res.json({ presentFolderLink, ceeUploadLink });
    } catch (err) {
        console.error('[approve-cee-links]', err.message);
        res.status(500).json({ error: 'Error obteniendo enlaces' });
    }
});

// ─── GET /api/expedientes/:id/cert-cliente-data ───────────────────────────
// Ficha del cliente tal y como la recibirá el certificador, más la lista de datos
// que faltan. El popup de envío la usa para avisar antes de mandar un encargo
// incompleto (el certificador no puede visitar sin dirección ni llamar sin teléfono).
router.get('/:id/cert-cliente-data', staffOnly, async (req, res) => {
    try {
        const { data: exp } = await supabase
            .from('expedientes').select('id, cliente_id, oportunidad_id, instalacion').eq('id', req.params.id).maybeSingle();
        if (!exp) return res.status(404).json({ error: 'Expediente no encontrado' });

        const [{ data: cli }, { data: op }] = await Promise.all([
            exp.cliente_id ? supabase.from('clientes').select('*').eq('id_cliente', exp.cliente_id).maybeSingle() : Promise.resolve({ data: null }),
            exp.oportunidad_id ? supabase.from('oportunidades').select('*').eq('id', exp.oportunidad_id).maybeSingle() : Promise.resolve({ data: null }),
        ]);

        const { data, missing } = buildCertClienteData(exp, op, cli);
        res.json({ data, missing, clienteId: exp.cliente_id || null });
    } catch (err) {
        console.error('[cert-cliente-data]', err.message);
        res.status(500).json({ error: 'Error obteniendo los datos del cliente' });
    }
});

// ─── POST /api/expedientes/:id/approve-cee ────────────────────────────────
// Admin aprueba el CEX y autoriza presentación
router.post('/:id/approve-cee', staffOnly, async (req, res) => {
    try {
        const { phase } = req.body;
        const adminMessage = (req.body?.adminMessage || '').trim() || null;
        // Mensaje editado en el popup de "Validar" + canales elegidos.
        const customMessage = (req.body?.customMessage || '').trim() || null;
        // Nota adicional del popup: se añade al final del mensaje (WhatsApp, email e
        // historial). Va aparte del cuerpo para que "Restaurar plantilla" no la borre.
        const notaAdicional = (req.body?.notaAdicional || '').trim() || null;
        const baseMsg = customMessage || adminMessage;
        const bodyMsg = notaAdicional
            ? `${baseMsg ? `${baseMsg}\n\n` : ''}${notaAdicional}`
            : baseMsg;
        // Por compatibilidad: si no se especifica canal, se envía email (comportamiento previo).
        const sendEmail = req.body?.sendEmail !== false;
        const sendWhatsApp = req.body?.sendWhatsApp === true;
        // Adjuntar los archivos del CEE directamente al email (opcional desde el popup).
        const attachFiles = req.body?.attachFiles === true;
        // Prioridad del visto bueno: en 'urgent' el asunto del email y el WhatsApp
        // salen marcados con la alarma 🚨 y queda reflejado en el historial.
        const isUrgent = req.body?.priority === 'urgent';
        const ceeUploadService = require('../services/ceeUploadService');
        const { data: exp, error: expErr } = await supabase
            .from('expedientes')
            .select('*')
            .eq('id', req.params.id)
            .single();
            
        if (expErr || !exp) return res.status(404).json({ error: 'Expediente no encontrado' });

        const phaseLabel = phase === 'final' ? 'CEE Final' : 'CEE Inicial';
        const newEstado = phase === 'final' ? 'REVISADO Y LISTO (FINAL)' : 'REVISADO Y LISTO (INICIAL)';

        // Obtener datos del certificador asignado
        const cee = exp.cee || {};
        let certEmail = null;
        let certName = 'Técnico';
        let certPhone = null;
        if (cee.certificador_id) {
            const { data: cert } = await supabase.from('prescriptores').select('*').eq('id_empresa', cee.certificador_id).maybeSingle();
            if (cert) {
                certEmail = cert.email;
                certName = cert.razon_social || cert.acronimo || 'Técnico';
                certPhone = cert.tlf || cert.tlf_contacto || cert.landing_telefono_contacto || null;
            }
        }

        // Preparar actualizaciones (Estado interno, global y seguimiento)
        cee.estado = newEstado;
        const globalEstado = avanzarEstado(exp.estado, newEstado);

        const seguimiento = exp.seguimiento || { cee_inicial: 'ASIGNADO', cee_final: 'ASIGNADO', anexos: 'PTE_EMITIR' };
        if (phase === 'final') {
            applyStatus(seguimiento, 'cee_final', 'REVISADO');
        } else {
            applyStatus(seguimiento, 'cee_inicial', 'REVISADO');
        }

        const docObj = exp.documentacion || {};
        const historial = docObj.historial || [];

        // Registro de la aprobación
        historial.push({
            id: Date.now().toString() + '_revok',
            tipo: 'aprobacion_tecnica',
            texto: `BROKERGY ha revisado y dado el VISTO BUENO al ${phaseLabel}${isUrgent ? ' (registro solicitado como 🚨 URGENTE)' : ''}. Se autoriza su registro en Industria.${bodyMsg ? ` Nota: ${bodyMsg}` : ''}`,
            fecha: new Date().toISOString(),
            usuario: 'ADMINISTRADOR'
        });

        // Registro de cambio de estado (para el historial unificado)
        historial.push({
            id: Date.now().toString() + '_status_revok',
            estado: globalEstado,
            fecha: new Date().toISOString(),
            usuario: 'ADMINISTRADOR'
        });

        // Actualizar en Supabase (Todo en una sola llamada)
        const { error: updErr } = await supabase.from('expedientes')
            .update({ 
                cee, 
                estado: globalEstado,
                seguimiento,
                documentacion: { ...docObj, historial },
                updated_at: new Date().toISOString()
            })
            .eq('id', req.params.id);

        if (updErr) throw updErr;

        if (globalEstado !== exp.estado) {
            syncExpedienteFolderAsync({ ...exp, estado: globalEstado, cee }, { motivo: 'approve-cee' });
        }

        // Notificar al técnico que ya tiene luz verde, por los canales elegidos.
        // Esperamos los envíos para devolver el estado real de cada canal (sin esto el
        // frontend no podía saber si se envió email/WhatsApp).
        const portalLink = `${process.env.FRONTEND_URL || 'https://app.brokergy.es'}/?exp=${req.params.id}`;
        let emailSent = false;
        let whatsAppSent = false;
        let waReason = null; // 'sin_telefono' | 'encolado' | 'error' | null

        // ── Enlaces del visto bueno: DESCARGA (carpeta CEE INICIAL/FINAL, pública)
        //    + SUBIDA (popup para subir el CEE registrado una vez presentado) ──
        const normPhase = phase === 'final' ? 'final' : 'inicial';
        const APP_BASE = process.env.FRONTEND_URL || 'https://app.brokergy.es';
        let presentFolderLink = null;
        let ceeUploadLink = null;
        let attachments;
        try {
            const driveFolderId = await ceeUploadService.resolveDriveFolderId(exp);
            if (driveFolderId) {
                const section = await ceeUploadService.ensureCeeSectionFolder(driveFolderId, normPhase);
                presentFolderLink = section.link;
                if (attachFiles) {
                    attachments = await ceeUploadService.getCeeSectionAttachments(driveFolderId, normPhase);
                }
            }
            const upTok = ceeUploadService.ceeUploadSignature(req.params.id, normPhase);
            ceeUploadLink = `${APP_BASE}/subir-cee/${req.params.id}?token=${upTok}&phase=${normPhase}`;
        } catch (linkErr) {
            console.warn('[approve-cee] no se pudieron preparar los enlaces del CEE:', linkErr.message);
        }
        const ceeLinksBlock = `${presentFolderLink ? `\n\n📥 Descarga los archivos del ${phaseLabel} para presentarlos:\n${presentFolderLink}` : ''}${ceeUploadLink ? `\n\n📤 Una vez presentado, sube aquí el ${phaseLabel} registrado (etiqueta + justificante):\n${ceeUploadLink}` : ''}`;

        // EMAIL
        if (sendEmail && certEmail) {
            try {
                // Ficha del cliente para que el certificador la tenga a mano al registrar.
                const [{ data: cliAp }, { data: opAp }] = await Promise.all([
                    exp.cliente_id ? supabase.from('clientes').select('*').eq('id_cliente', exp.cliente_id).maybeSingle() : Promise.resolve({ data: null }),
                    exp.oportunidad_id ? supabase.from('oportunidades').select('*').eq('id', exp.oportunidad_id).maybeSingle() : Promise.resolve({ data: null }),
                ]);
                const { data: clienteDataAp } = buildCertClienteData(exp, opAp, cliAp);

                await emailService.sendCertificadorApproveNotification(
                    certEmail, certName, exp.numero_expediente, phaseLabel, portalLink,
                    (cee.cee_folder_link || null), adminMessage, bodyMsg,
                    { presentFolderLink, ceeUploadLink, attachments, clienteData: clienteDataAp, urgent: isUrgent }
                );
                emailSent = true;
            } catch (mailErr) {
                console.error('[approve-cee] Error enviando email de visto bueno al certificador:', mailErr.message);
            }
        }

        // WHATSAPP
        if (sendWhatsApp) {
            if (!certPhone) {
                waReason = 'sin_telefono';
                console.warn('[approve-cee] Certificador sin teléfono para WhatsApp');
            } else {
                // Si el admin no editó el mensaje (fallback), incrustamos el deep-link al
                // expediente. Cuando hay bodyMsg, el enlace ya viene dentro (buildCertApproveMessage).
                const expedienteWa = bodyMsg ? '' : `\n\n🔗 Abre el expediente directamente en la app:\n${portalLink}`;
                const waMsg = bodyMsg
                    ? `${bodyMsg}${ceeLinksBlock}\n\n*BROKERGY · Ingeniería Energética*`
                    : `${isUrgent
                        ? `🚨*¡Urgente ${(certName || '').trim().split(/\s+/)[0] || 'técnico'}!* 🚨\n\nYa tienes luz verde para registrar el ${phaseLabel} del expediente ${exp.numero_expediente} en Industria.\n\n🚨 Te pedimos que lo priorices: necesitamos el registro con carácter URGENTE.`
                        : `✅ *Visto bueno* — ${phaseLabel}\n\nHola ${certName}, ya tienes luz verde para registrar el ${phaseLabel} del expediente ${exp.numero_expediente} en Industria.`
                    }${expedienteWa}${ceeLinksBlock}\n\n*BROKERGY · Ingeniería Energética*`;
                try {
                    const waRes = await whatsappService.sendText(certPhone, waMsg);
                    whatsAppSent = true; // se ha encolado/enviado correctamente
                    if (waRes?.state && waRes.state !== 'READY') waReason = 'encolado';
                } catch (waErr) {
                    console.error('[approve-cee] Error enviando WhatsApp de visto bueno al certificador:', waErr.message);
                    waReason = 'error';
                }
            }
        }

        res.json({ ok: true, newEstado, seguimiento, emailSent, whatsAppSent, waReason, sentTo: emailSent ? certEmail : null });
    } catch (err) {
        console.error('[approve-cee]', err.message);
        res.status(500).json({ error: 'Error aprobando el CEE' });
    }
});

// Regenerar número de expediente (PATCH /api/expedientes/:id/regenerar-numero)
// Se usa cuando se cambia de programa (Aerotermia <-> Reforma) después de creado
router.patch('/:id/regenerar-numero', adminOnly, async (req, res) => {
    try {
        const { targetProgram } = req.body;
        const usuarioName = req.user.rol_nombre === 'ADMIN' 
            ? 'ADMINISTRADOR' 
            : (req.user.acronimo || req.user.razon_social || 'PARTNER');

        const result = await expedienteService.migrateExpedienteProgram(req.params.id, usuarioName, targetProgram);
        res.status(200).json(result);
    } catch (error) {
        console.error('Error al regenerar número:', error.message);
        res.status(500).json({ error: 'Error al regenerar el número de expediente', details: error.message });
    }
});

// ─── POST /api/expedientes/:id/resend-cee-notifications ───────────────────────
// Re-disparo manual (admin) de las notificaciones de CEE registrado.
// Útil cuando la primera ejecución no envió los WhatsApp porque el cliente
// estaba DISCONNECTED, o cuando el usuario quiere insistir al cliente.
router.post('/:id/resend-cee-notifications', enforceAuth, async (req, res) => {
    try {
        if (req.user.rol_nombre !== 'ADMIN') {
            return res.status(403).json({ error: 'Solo ADMIN puede reenviar notificaciones' });
        }
        const phase = (req.body?.phase || '').toLowerCase();
        if (phase !== 'inicial' && phase !== 'final') {
            return res.status(400).json({ error: 'phase debe ser "inicial" o "final"' });
        }

        // Filtros opcionales enviados por el frontend
        const targets  = req.body?.targets  || ['CLIENTE', 'PARTNER', 'ADMIN'];
        const channels = req.body?.channels || ['email', 'whatsapp'];
        const preview  = req.body?.preview === true; // solo devolver los textos, sin enviar
        const overrides = (req.body?.overrides && typeof req.body.overrides === 'object') ? req.body.overrides : null;

        const { data: exp, error } = await supabase.from('expedientes').select('*').eq('id', req.params.id).single();
        if (error || !exp) return res.status(404).json({ error: 'Expediente no encontrado' });

        const seguimientoKey = phase === 'final' ? 'cee_final' : 'cee_inicial';
        if (exp.seguimiento?.[seguimientoKey] !== 'REGISTRADO') {
            return res.status(400).json({ error: `El ${seguimientoKey} no está en estado REGISTRADO` });
        }

        const opts = { targets, channels, preview, overrides };
        const result = phase === 'final'
            ? await notifyCeeFinalRegistrado(exp, opts)
            : await notifyCeeInicialRegistrado(exp, opts);

        return res.json(result);
    } catch (err) {
        console.error('[resend-cee-notifications]', err);
        res.status(500).json({ error: 'Error reenviando notificaciones', details: err.message });
    }
});

// ─── POST /api/expedientes/:id/fichas-tecnicas/upload ────────────────────────
// Sube una ficha técnica PDF a "3. FICHAS TÉCNICAS Y CERTIFICACIONES" en Drive
// Body: { base64: string, type: 'cal'|'acs'|'cal2'…, numexpte?: string }
// El `type` es la clave del hueco que resuelve `resolveFichaSlots` (una ficha por
// modelo distinto de bomba de calor); ver fichasTecnicas.js.
router.post('/:id/fichas-tecnicas/upload', enforceAuth, async (req, res) => {
    const { base64, type, numexpte } = req.body;
    if (!base64 || !type) return res.status(400).json({ error: 'Faltan campos requeridos.' });
    const { parseFtType, ftFileName, ftDocFields, findFichaSlot } = await loadFichasTecnicas();
    if (!parseFtType(type)) return res.status(400).json({ error: 'Tipo de ficha técnica no válido.' });
    console.log(`[FT] Subiendo ficha técnica tipo=${type} para expediente ${req.params.id} (base64 len=${base64.length})`);

    try {
        const { data: exp, error: expErr } = await supabase
            .from('expedientes')
            .select('id, oportunidad_id, numero_expediente, documentacion, instalacion')
            .eq('id', req.params.id)
            .single();
        if (expErr || !exp) return res.status(404).json({ error: 'Expediente no encontrado' });
        // Mismo alcance que la vista: si el expediente no pide ESA ficha (p. ej. el
        // ACS lo resuelve el mismo equipo que la calefacción), subirla dejaría un
        // enlace que ningún documento va a usar y que sí confunde al siguiente.
        if (!findFichaSlot(exp.instalacion, type)) {
            return res.status(400).json({ error: 'Este expediente no lleva esa ficha técnica.' });
        }
        console.log(`[FT] Expediente encontrado: ${exp.numero_expediente}, oportunidad_id=${exp.oportunidad_id}`);

        const { data: op } = await supabase
            .from('oportunidades')
            .select('datos_calculo')
            .eq('id', exp.oportunidad_id)
            .single();

        const driveFolderId = op?.datos_calculo?.drive_folder_id || op?.datos_calculo?.inputs?.drive_folder_id;
        console.log(`[FT] driveFolderId=${driveFolderId}`);
        if (!driveFolderId) return res.status(400).json({ error: 'La oportunidad no tiene carpeta de Drive configurada.' });

        const { findSubfolderByName, createSubfolder, saveFileToFolder } = require('../services/driveService');

        const FOLDER_NAME = '3. FICHAS TÉCNICAS Y CERTIFICACIONES';
        let ftFolderId = await findSubfolderByName(driveFolderId, FOLDER_NAME);
        if (!ftFolderId) ftFolderId = await createSubfolder(driveFolderId, FOLDER_NAME);

        const expteNum = numexpte || exp.numero_expediente || req.params.id;
        const fileName = ftFileName(expteNum, type);

        const fileBuffer = Buffer.from(base64.split(',')[1] || base64, 'base64');
        // Debug: verificar que el buffer empieza con %PDF-
        const headerBytes = fileBuffer.slice(0, 8).toString('utf8');
        console.log(`[FT] Buffer subida: ${fileBuffer.length} bytes, header="${headerBytes}" (debe empezar por %PDF-)`);
        const result = await saveFileToFolder(ftFolderId, fileName, 'application/pdf', fileBuffer);
        if (!result) return res.status(500).json({ error: 'Error al subir a Drive.' });

        const fields = ftDocFields(type);
        const docObj = { ...(exp.documentacion || {}), [fields.link]: result.link, [fields.id]: result.id };
        await supabase.from('expedientes').update({ documentacion: docObj, updated_at: new Date().toISOString() }).eq('id', req.params.id);
        console.log(`[FT] Guardado en Drive: ${fileName} (id=${result.id})`);

        res.json({ link: result.link, driveId: result.id });
    } catch (err) {
        console.error('Error POST expedientes/:id/fichas-tecnicas/upload:', err);
        res.status(500).json({ error: 'Error al subir la ficha técnica.', details: err.message });
    }
});

// ─── GET /api/expedientes/:id/fichas-tecnicas/:type ──────────────────────────
// Busca la ficha técnica directamente en Drive por nombre dentro de
// "3. FICHAS TÉCNICAS Y CERTIFICACIONES" y la sirve si existe.
// No depende de IDs guardados en documentacion — fuente de verdad: Drive.
// Si se pasa ?info=1, devuelve metadatos JSON en lugar del binario (más ligero
// para que el frontend evite descargar el PDF y lo encadene como Drive ID).
router.get('/:id/fichas-tecnicas/:type', async (req, res) => {
    const { type } = req.params; // 'cal' | 'acs' | 'cal2' | 'acs2' …
    const wantInfo = req.query.info === '1' || req.query.info === 'true';
    try {
        const { parseFtType, ftFileName } = await loadFichasTecnicas();
        if (!parseFtType(type)) return res.status(404).send('Tipo de ficha técnica no válido');
        const { data: exp } = await supabase
            .from('expedientes')
            .select('oportunidad_id, numero_expediente')
            .eq('id', req.params.id)
            .single();
        if (!exp) return res.status(404).send('Expediente no encontrado');

        const { data: op } = await supabase
            .from('oportunidades')
            .select('datos_calculo')
            .eq('id', exp.oportunidad_id)
            .single();

        const driveFolderId = op?.datos_calculo?.drive_folder_id || op?.datos_calculo?.inputs?.drive_folder_id;
        if (!driveFolderId) return res.status(404).send('Sin carpeta Drive');

        const { findSubfolderByName, findFileByName, getFileContent, getFileMetadata } = require('../services/driveService');
        const ftFolderId = await findSubfolderByName(driveFolderId, '3. FICHAS TÉCNICAS Y CERTIFICACIONES');
        if (!ftFolderId) return res.status(404).send('Subcarpeta no encontrada');

        const fileName = ftFileName(exp.numero_expediente, type);
        const fileId = await findFileByName(ftFolderId, fileName);
        if (!fileId) return res.status(404).send('Archivo no encontrado en Drive');

        if (wantInfo) {
            const meta = await getFileMetadata(fileId);
            return res.json({
                driveId: fileId,
                fileName,
                link: meta?.webViewLink || `https://drive.google.com/file/d/${fileId}/view`,
                size: meta?.size ? Number(meta.size) : null
            });
        }

        const content = await getFileContent(fileId);
        if (!content) return res.status(404).send('No se pudo leer el archivo');

        console.log(`[FT] Servido "${fileName}" (${content.length} bytes, header="${content.slice(0, 8).toString('utf8')}")`);

        res.setHeader('Content-Type', 'application/octet-stream');
        res.send(content);
    } catch (err) {
        console.error('Error GET expedientes/:id/fichas-tecnicas/:type:', err);
        res.status(500).send('Error');
    }
});

// ─── POST /api/expedientes/:id/fichas-tecnicas/auto-copy ─────────────────────
// Copia la ficha técnica del modelo de aerotermia (campo aerotermia.ficha_tecnica)
// a la subcarpeta "3. FICHAS TÉCNICAS Y CERTIFICACIONES" del expediente.
// Body: { type: 'cal'|'acs'|'cal2'…, force?: boolean }
// Responde 200 { link, driveId, copied, source } o 400 { error, model? }
router.post('/:id/fichas-tecnicas/auto-copy', enforceAuth, async (req, res) => {
    const { type, force } = req.body;
    const { parseFtType, ftFileName, ftDocFields, findFichaSlot } = await loadFichasTecnicas();
    if (!parseFtType(type)) {
        return res.status(400).json({ error: 'bad_type', message: 'type debe ser cal, acs o su variante numerada (cal2, acs2…)' });
    }
    try {
        const { data: exp } = await supabase
            .from('expedientes')
            .select('id, oportunidad_id, numero_expediente, documentacion, instalacion')
            .eq('id', req.params.id)
            .single();
        if (!exp) return res.status(404).json({ error: 'expediente_not_found' });

        const { data: op } = await supabase
            .from('oportunidades')
            .select('datos_calculo')
            .eq('id', exp.oportunidad_id)
            .single();

        const driveFolderId = op?.datos_calculo?.drive_folder_id || op?.datos_calculo?.inputs?.drive_folder_id;
        if (!driveFolderId) return res.status(400).json({ error: 'no_drive_folder' });

        // Resolver el modelo aerotermia que aplica a este hueco. Manda el alcance
        // documental del expediente: si este hueco no le corresponde (p. ej. el ACS
        // lo resuelve el MISMO equipo que la calefacción, o es un termo eléctrico),
        // no hay ficha que copiar — y no se inventa una copia del modelo de al lado.
        const slot = findFichaSlot(exp.instalacion, type);
        if (!slot) {
            return res.status(400).json({ error: 'slot_no_aplica', message: 'Este expediente no lleva esa ficha técnica.' });
        }
        const aeroDbId = slot.modelId;
        if (!aeroDbId) {
            return res.status(400).json({ error: 'no_model', message: 'Selecciona un modelo de aerotermia primero' });
        }

        const { data: equipo } = await supabase
            .from('aerotermia')
            .select('id, marca, modelo_comercial, modelo_conjunto, ficha_tecnica')
            .eq('id', aeroDbId)
            .single();
        if (!equipo) return res.status(400).json({ error: 'model_not_found', aeroDbId });
        const modelLabel = equipo.modelo_comercial || equipo.modelo_conjunto || `id=${aeroDbId}`;

        if (!equipo.ficha_tecnica) {
            return res.status(400).json({ error: 'no_ficha_in_db', model: modelLabel });
        }

        const { findSubfolderByName, createSubfolder, findFileByName, copyFile, deleteFile, getFileMetadata, saveFileToFolder } = require('../services/driveService');

        let ftFolderId = await findSubfolderByName(driveFolderId, '3. FICHAS TÉCNICAS Y CERTIFICACIONES');
        if (!ftFolderId) ftFolderId = await createSubfolder(driveFolderId, '3. FICHAS TÉCNICAS Y CERTIFICACIONES');

        const fileName = ftFileName(exp.numero_expediente, type);

        // Si ya existe y no fuerzan, devolver el existente
        const existingId = await findFileByName(ftFolderId, fileName);
        if (existingId && !force) {
            const meta = await getFileMetadata(existingId);
            return res.json({
                driveId: existingId,
                link: meta?.webViewLink || `https://drive.google.com/file/d/${existingId}/view`,
                copied: false,
                source: 'existing'
            });
        }
        if (existingId && force) {
            await deleteFile(existingId);
        }

        // La ficha del modelo puede vivir en Google Drive (copia Drive→Drive) o en
        // una URL EXTERNA del fabricante/EPREL (descarga HTTP + subida a Drive).
        // Antes solo se contemplaba Drive: cualquier URL externa (p.ej. la ficha de
        // ACS "AEROMAX VM" en ayudasaerotermia.com) devolvía bad_ficha_url y la
        // ficha NO se adjuntaba al CIFO aunque el modelo estuviera seleccionado.
        const fichaUrl = String(equipo.ficha_tecnica);
        const driveMatch = fichaUrl.match(/\/d\/([a-zA-Z0-9_-]+)/) || fichaUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
        const sourceFileId = driveMatch?.[1];

        let result;
        if (sourceFileId) {
            result = await copyFile(sourceFileId, ftFolderId, fileName);
        } else if (/^https?:\/\//i.test(fichaUrl)) {
            let dl;
            try {
                dl = await axios.get(fichaUrl, {
                    responseType: 'arraybuffer',
                    timeout: 20000,
                    maxRedirects: 5,
                    validateStatus: s => s >= 200 && s < 400,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (compatible; Brokergy/1.0; +https://app.brokergy.es)',
                        'Accept': 'application/pdf,*/*'
                    }
                });
            } catch (dlErr) {
                console.error(`[FT auto-copy] descarga externa falló (${fichaUrl}): ${dlErr.message}`);
                return res.status(400).json({ error: 'external_fetch_failed', model: modelLabel, url: fichaUrl });
            }
            const buf = Buffer.from(dl.data);
            const ct = String(dl.headers['content-type'] || '').toLowerCase();
            const isPdf = buf.slice(0, 5).toString('latin1') === '%PDF-' || ct.includes('application/pdf');
            if (!isPdf) {
                // p.ej. una URL a una página de producto HTML, no al PDF de la ficha.
                console.warn(`[FT auto-copy] URL externa no es un PDF (${fichaUrl}, content-type="${ct}")`);
                return res.status(400).json({ error: 'external_not_pdf', model: modelLabel, url: fichaUrl });
            }
            result = await saveFileToFolder(ftFolderId, fileName, 'application/pdf', buf);
            if (result) console.log(`[FT auto-copy] ficha externa descargada y subida (${buf.length} bytes) ← ${fichaUrl}`);
        } else {
            return res.status(400).json({ error: 'bad_ficha_url', model: modelLabel, url: fichaUrl });
        }
        if (!result) return res.status(500).json({ error: 'copy_failed' });

        const fields = ftDocFields(type);
        const docObj = { ...(exp.documentacion || {}), [fields.link]: result.link, [fields.id]: result.id };
        await supabase.from('expedientes')
            .update({ documentacion: docObj, updated_at: new Date().toISOString() })
            .eq('id', req.params.id);

        console.log(`[FT auto-copy] ${fileName} ← modelo "${modelLabel}" (driveId=${result.id})`);
        res.json({ driveId: result.id, link: result.link, copied: true, source: 'model' });
    } catch (err) {
        console.error('Error POST /:id/fichas-tecnicas/auto-copy:', err);
        res.status(500).json({ error: 'internal', message: err.message });
    }
});

// ─── POST /api/expedientes/:id/anexos-cifo/upload ────────────────────────────
// Sube un PDF arbitrario como anexo extra del CIFO a la subcarpeta
// "3. FICHAS TÉCNICAS Y CERTIFICACIONES" del expediente y lo persiste en
// documentacion.cifo_extra_annexes[].
// Body: { base64, fileName, label? }
router.post('/:id/anexos-cifo/upload', enforceAuth, async (req, res) => {
    const { base64, fileName, label } = req.body;
    if (!base64 || !fileName) return res.status(400).json({ error: 'missing_fields' });
    try {
        const { data: exp } = await supabase
            .from('expedientes')
            .select('id, oportunidad_id, numero_expediente')
            .eq('id', req.params.id)
            .single();
        if (!exp) return res.status(404).json({ error: 'expediente_not_found' });

        const { data: op } = await supabase
            .from('oportunidades')
            .select('datos_calculo')
            .eq('id', exp.oportunidad_id)
            .single();
        const driveFolderId = op?.datos_calculo?.drive_folder_id || op?.datos_calculo?.inputs?.drive_folder_id;
        if (!driveFolderId) return res.status(400).json({ error: 'no_drive_folder' });

        const { findSubfolderByName, createSubfolder, saveFileToFolder } = require('../services/driveService');
        let ftFolderId = await findSubfolderByName(driveFolderId, '3. FICHAS TÉCNICAS Y CERTIFICACIONES');
        if (!ftFolderId) ftFolderId = await createSubfolder(driveFolderId, '3. FICHAS TÉCNICAS Y CERTIFICACIONES');

        let safeName = String(fileName).trim().replace(/[\\/<>:"|?*]/g, '_');
        let buffer = Buffer.from(base64.split(',')[1] || base64, 'base64');

        // Si el anexo es una IMAGEN (JPEG/PNG), la convertimos a una página PDF antes
        // de subir, para que se concatene y previsualice EXACTAMENTE igual que el resto
        // de anexos (que son PDF). Antes se guardaba con mimetype 'application/pdf'
        // forzado aunque el archivo fuese una imagen: el merge sí la embebía (por magic
        // bytes) pero la previsualización con pdf.js fallaba y la imagen quedaba
        // "invisible" en el modal → parecía que la imagen no se anexaba. Mismo patrón
        // que /:id/justificante y la subida de facturas.
        const sig = buffer.subarray(0, 4);
        const isJpg = sig[0] === 0xFF && sig[1] === 0xD8 && sig[2] === 0xFF;
        const isPng = sig[0] === 0x89 && sig[1] === 0x50 && sig[2] === 0x4E && sig[3] === 0x47;
        if (isJpg || isPng) {
            const { PDFDocument } = require('pdf-lib');
            const imgPdf = await PDFDocument.create();
            const img = isPng ? await imgPdf.embedPng(buffer) : await imgPdf.embedJpg(buffer);
            const { width, height } = img.scale(1);
            const page = imgPdf.addPage([width, height]);
            page.drawImage(img, { x: 0, y: 0, width, height });
            buffer = Buffer.from(await imgPdf.save());
            safeName = safeName.replace(/\.(jpe?g|png)$/i, '') + '.pdf';
        }

        const result = await saveFileToFolder(ftFolderId, safeName, 'application/pdf', buffer);
        if (!result) return res.status(500).json({ error: 'upload_failed' });

        // Escritura ATÓMICA en documentacion.cifo_extra_annexes (RPC con jsonb_set +
        // bloqueo de fila). Evita el read-modify-write del documentacion completo que
        // se pisaba con subidas/guardados concurrentes (regla #19, ver
        // scripts/cifo_annex_atomic_writes.sql).
        const annex = { driveId: result.id, link: result.link, fileName: safeName, label: label || safeName };
        const { error: rpcErr } = await supabase.rpc('cifo_annex_append', { p_id: req.params.id, p_annex: annex });
        if (rpcErr) throw rpcErr;

        res.json(annex);
    } catch (err) {
        console.error('Error POST /:id/anexos-cifo/upload:', err);
        res.status(500).json({ error: 'internal', message: err.message });
    }
});

// ─── GET /api/expedientes/:id/anexos-cifo/:driveId/content ───────────────────
// Sirve el contenido binario de un anexo extra del CIFO. Solo lo permite si el
// driveId aparece en documentacion.cifo_extra_annexes del expediente (para no
// exponer la Drive API como proxy genérico).
router.get('/:id/anexos-cifo/:driveId/content', async (req, res) => {
    try {
        const { data: exp } = await supabase
            .from('expedientes')
            .select('documentacion')
            .eq('id', req.params.id)
            .single();
        if (!exp) return res.status(404).send('Expediente no encontrado');
        const list = exp.documentacion?.cifo_extra_annexes || [];
        const allowed = list.some(a => a.driveId === req.params.driveId);
        if (!allowed) return res.status(404).send('Anexo no encontrado en el expediente');

        const { getFileContent } = require('../services/driveService');
        const content = await getFileContent(req.params.driveId);
        if (!content) return res.status(404).send('No se pudo leer el archivo');

        res.setHeader('Content-Type', 'application/pdf');
        res.send(content);
    } catch (err) {
        console.error('Error GET anexos-cifo/:driveId/content:', err);
        res.status(500).send('Error');
    }
});

// ─── PUT /api/expedientes/:id/anexos-cifo/prefs ──────────────────────────────
// Guarda el ORDEN de los anexos y las PÁGINAS EXCLUIDAS de cada uno para el
// CIFO (RES060/RES093/TER100) y el Certificado RES080.
// Body: { order: ['aerotermia_cal', 'extra_<driveId>'], excluded: { '<driveId>': [1,2,9] } }
// Escritura atómica vía RPC: no toca el resto de `documentacion` (ver
// scripts/cifo_annex_prefs.sql y utils/mergeDocumentacion.js).
router.put('/:id/anexos-cifo/prefs', enforceAuth, async (req, res) => {
    try {
        const { order, excluded } = req.body || {};

        const cleanOrder = Array.isArray(order)
            ? order.filter(id => typeof id === 'string' && id.length > 0 && id.length <= 200).slice(0, 100)
            : [];

        const cleanExcluded = {};
        for (const [driveId, pages] of Object.entries(excluded || {})) {
            if (typeof driveId !== 'string' || !driveId) continue;
            const list = [...new Set((Array.isArray(pages) ? pages : [])
                .map(p => parseInt(p, 10))
                .filter(n => Number.isFinite(n) && n >= 1 && n <= 5000))]
                .sort((a, b) => a - b);
            if (list.length > 0) cleanExcluded[driveId] = list;
        }

        const prefs = { order: cleanOrder, excluded: cleanExcluded };
        const { error: rpcErr } = await supabase.rpc('cifo_annex_prefs_set', { p_id: req.params.id, p_prefs: prefs });
        if (rpcErr) throw rpcErr;

        res.json(prefs);
    } catch (err) {
        console.error('Error PUT /:id/anexos-cifo/prefs:', err);
        res.status(500).json({ error: 'internal', message: err.message });
    }
});

// ─── DELETE /api/expedientes/:id/anexos-cifo/:driveId ────────────────────────
// Elimina un anexo extra del CIFO (de la lista cifo_extra_annexes y de Drive).
router.delete('/:id/anexos-cifo/:driveId', enforceAuth, async (req, res) => {
    try {
        const { data: exp } = await supabase
            .from('expedientes')
            .select('id')
            .eq('id', req.params.id)
            .single();
        if (!exp) return res.status(404).json({ error: 'expediente_not_found' });

        const { deleteFile } = require('../services/driveService');
        await deleteFile(req.params.driveId);

        // Borrado ATÓMICO en documentacion.cifo_extra_annexes (RPC con jsonb_set +
        // bloqueo de fila). Evita el read-modify-write del documentacion completo.
        const { error: rpcErr } = await supabase.rpc('cifo_annex_remove', { p_id: req.params.id, p_drive_id: req.params.driveId });
        if (rpcErr) throw rpcErr;

        res.json({ success: true });
    } catch (err) {
        console.error('Error DELETE /:id/anexos-cifo/:driveId:', err);
        res.status(500).json({ error: 'internal', message: err.message });
    }
});

// ─── CAPTURAS CE3X DEL CERTIFICADO RES080 ────────────────────────────────────
// Cuando la actuación de reforma incluye VENTANAS, el certificado lleva las
// capturas de pantalla del CE3X con el detalle de los huecos ANTES y DESPUÉS.
// Cada fase admite VARIAS (una vivienda cambia más de un tipo de hueco). Se
// pegan con Ctrl+V sobre el propio visor del certificado.
//
// La IMAGEN va a Drive ("6. ANEXOS CAE"); en `documentacion.ce3x_capturas.<slot>`
// queda solo la LISTA de punteros (regla #21). La escritura es atómica vía RPC
// `res080_ce3x_add/remove` y la clave está protegida en mergeDocumentacion,
// porque el autoguardado del expediente reenvía `documentacion` entera con una
// copia vieja (ver scripts/res080_ce3x_capturas.sql).
const CE3X_SLOTS = { antes: 'ANTES', despues: 'DESPUES' };
const CE3X_SUBCARPETA = '6. ANEXOS CAE';

// Lista de capturas de una fase, tolerante a la forma vieja (objeto suelto).
const ce3xLista = (documentacion, slot) => {
    const val = documentacion?.ce3x_capturas?.[slot];
    if (Array.isArray(val)) return val;
    return val && typeof val === 'object' ? [val] : [];
};

// Extensión a partir del mimetype declarado, acotada a formatos de imagen.
const ce3xExt = (mimeType) => ({
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/webp': 'webp',
}[String(mimeType || '').toLowerCase()] || null);

// Expediente + carpeta Drive de su oportunidad. Devuelve null si falta algo.
async function loadCe3xContext(expId) {
    const { data: exp } = await supabase
        .from('expedientes')
        .select('id, oportunidad_id, numero_expediente, documentacion')
        .eq('id', expId)
        .maybeSingle();
    if (!exp) return { error: 'expediente_not_found', status: 404 };
    const { data: op } = await supabase
        .from('oportunidades')
        .select('datos_calculo')
        .eq('id', exp.oportunidad_id)
        .maybeSingle();
    const folderId = op?.datos_calculo?.drive_folder_id || op?.datos_calculo?.inputs?.drive_folder_id;
    return { exp, folderId };
}

// ─── POST /api/expedientes/:id/res080/ce3x/:slot ─────────────────────────────
// Body: { base64, mimeType }. AÑADE una captura a la fase (no sustituye: para
// quitar una concreta está el DELETE con su driveId).
router.post('/:id/res080/ce3x/:slot', enforceAuth, async (req, res) => {
    const slot = String(req.params.slot || '').toLowerCase();
    if (!CE3X_SLOTS[slot]) return res.status(400).json({ error: 'slot_invalido' });
    const { base64, mimeType } = req.body || {};
    const ext = ce3xExt(mimeType);
    if (!base64 || !ext) return res.status(400).json({ error: 'imagen_invalida' });

    try {
        const { exp, folderId, error, status } = await loadCe3xContext(req.params.id);
        if (error) return res.status(status).json({ error });
        if (!folderId) return res.status(400).json({ error: 'no_drive_folder' });

        const buffer = Buffer.from(String(base64).split(',').pop(), 'base64');
        if (!buffer.length) return res.status(400).json({ error: 'imagen_vacia' });
        // 12 MB: una captura de pantalla no llega ni de lejos; por encima de eso
        // es un fichero que no toca guardar aquí.
        if (buffer.length > 12 * 1024 * 1024) return res.status(413).json({ error: 'imagen_demasiado_grande' });

        const { getOrCreateSubfolder, saveFileToFolder } = require('../services/driveService');
        const destino = await getOrCreateSubfolder(folderId, CE3X_SUBCARPETA);
        if (!destino) return res.status(502).json({ error: 'no_subcarpeta' });

        // Sufijo por el MAYOR índice usado, no por el número de capturas: si se
        // borró la _2 y se sube otra, reutilizar el 2 dejaría dos ficheros con el
        // mismo nombre en Drive (que lo permite) y no se sabría cuál es cuál.
        const lista = ce3xLista(exp.documentacion, slot);
        const idx = lista.reduce((max, c) => Math.max(max, parseInt(c?.idx, 10) || 0), 0) + 1;
        const fileName = `CE3X_VENTANAS_${CE3X_SLOTS[slot]}_${idx}.${ext}`;
        const result = await saveFileToFolder(destino, fileName, mimeType, buffer, { throwOnError: true });
        if (!result) return res.status(502).json({ error: 'upload_failed' });

        const captura = {
            driveId: result.id,
            link: result.link,
            fileName,
            mimeType,
            idx,
            at: new Date().toISOString(),
        };
        const { error: rpcErr } = await supabase.rpc('res080_ce3x_add', {
            p_id: exp.id, p_slot: slot, p_captura: captura,
        });
        if (rpcErr) throw rpcErr;

        res.json(captura);
    } catch (err) {
        console.error('Error POST /:id/res080/ce3x/:slot:', err);
        res.status(500).json({ error: 'internal', message: err.message });
    }
});

// ─── DELETE /api/expedientes/:id/res080/ce3x/:slot/:driveId ──────────────────
router.delete('/:id/res080/ce3x/:slot/:driveId', enforceAuth, async (req, res) => {
    const slot = String(req.params.slot || '').toLowerCase();
    if (!CE3X_SLOTS[slot]) return res.status(400).json({ error: 'slot_invalido' });
    try {
        const { exp, error, status } = await loadCe3xContext(req.params.id);
        if (error) return res.status(status).json({ error });

        // Solo se borra de Drive lo que está registrado en ESTE expediente: la
        // ruta no puede servir de borrado genérico de la Drive API.
        const captura = ce3xLista(exp.documentacion, slot).find(c => c.driveId === req.params.driveId);
        if (!captura) return res.status(404).json({ error: 'captura_no_encontrada' });

        const { deleteFile } = require('../services/driveService');
        try { await deleteFile(captura.driveId); }
        catch (e) { console.warn(`[ce3x] no se pudo borrar ${captura.driveId}: ${e.message}`); }

        const { error: rpcErr } = await supabase.rpc('res080_ce3x_remove', {
            p_id: exp.id, p_slot: slot, p_drive_id: captura.driveId,
        });
        if (rpcErr) throw rpcErr;

        res.json({ success: true });
    } catch (err) {
        console.error('Error DELETE /:id/res080/ce3x/:slot/:driveId:', err);
        res.status(500).json({ error: 'internal', message: err.message });
    }
});

// ─── GET /api/expedientes/:id/res080/ce3x/:slot/:driveId/content ─────────────
// Sirve la imagen para el visor del modal. Solo el driveId registrado en el
// propio expediente (no es un proxy genérico de la Drive API).
router.get('/:id/res080/ce3x/:slot/:driveId/content', enforceAuth, async (req, res) => {
    const slot = String(req.params.slot || '').toLowerCase();
    if (!CE3X_SLOTS[slot]) return res.status(400).send('slot inválido');
    try {
        const { data: exp } = await supabase
            .from('expedientes')
            .select('documentacion')
            .eq('id', req.params.id)
            .maybeSingle();
        const captura = ce3xLista(exp?.documentacion, slot).find(c => c.driveId === req.params.driveId);
        if (!captura) return res.status(404).send('No hay captura');

        const { getFileContent } = require('../services/driveService');
        const content = await getFileContent(captura.driveId);
        if (!content) return res.status(404).send('No se pudo leer la captura');

        res.setHeader('Content-Type', captura.mimeType || 'image/png');
        res.setHeader('Cache-Control', 'private, max-age=60');
        res.send(content);
    } catch (err) {
        console.error('Error GET /:id/res080/ce3x/:slot/:driveId/content:', err);
        res.status(500).send('Error');
    }
});

// Hace público un archivo de Drive (anyone with link → reader)
// Usado para fichas técnicas del modelo de aerotermia que se referencian por enlace
router.post('/drive/make-public', enforceAuth, async (req, res) => {
    const { fileId } = req.body;
    if (!fileId) return res.status(400).json({ error: 'fileId requerido' });
    try {
        const { setFolderPublic } = require('../services/driveService');
        await setFolderPublic(fileId);
        res.json({ ok: true });
    } catch (err) {
        // Si ya es público o no tenemos acceso, no es un error crítico
        console.warn('[drive/make-public] No se pudo hacer público el archivo:', err.message);
        res.json({ ok: false, warning: err.message });
    }
});

// ─── GET /api/expedientes/:id/notify-client ──────────────────────────────────
// Endpoint PÚBLICO (sin auth). El admin lo recibe como enlace one-tap en su WA/email
// cuando el certificador registra el CEE. Al pulsarlo envía las notificaciones
// al cliente (WA + email) y marca el expediente como notificado.
// Query params: token (string), phase (inicial | final)
router.get('/:id/notify-client', async (req, res) => {
    const { token, phase } = req.query;

    const sendHtmlPage = (ok, message) => {
        const color = ok ? '#10b981' : '#ef4444';
        const icon = ok ? '✅' : '❌';
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BROKERGY</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0a0e1a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #fff; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
    .card { background: #111827; border: 1px solid #334155; border-radius: 20px; padding: 40px 30px; max-width: 420px; width: 100%; text-align: center; }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h2 { color: ${color}; margin-bottom: 12px; font-size: 22px; }
    p { color: #94a3b8; line-height: 1.5; margin-bottom: 8px; }
    .brand { color: #475569; font-size: 11px; margin-top: 30px; letter-spacing: 0.05em; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${ok ? '📱' : '⚠️'}</div>
    <h2>${ok ? 'Cliente Notificado' : 'Error'}</h2>
    <p>${message}</p>
    <div class="brand">BROKERGY · Ingeniería Energética</div>
  </div>
</body>
</html>`);
    };

    if (!token || !phase) return sendHtmlPage(false, 'Parámetros inválidos.');
    if (phase !== 'inicial' && phase !== 'final') return sendHtmlPage(false, 'Phase inválida. Usa "inicial" o "final".');

    try {
        const { data: exp, error: expErr } = await supabase
            .from('expedientes')
            .select('*')
            .eq('id', req.params.id)
            .single();
        if (expErr || !exp) return sendHtmlPage(false, 'Expediente no encontrado.');

        const seguimiento = exp.seguimiento || {};
        const tokenField = phase === 'final' ? 'notify_client_token_final' : 'notify_client_token_inicial';
        const expField   = phase === 'final' ? 'notify_client_token_final_exp' : 'notify_client_token_inicial_exp';
        const notifiedField = phase === 'final' ? 'cee_fin_client_notified_at' : 'cee_ini_client_notified_at';

        if (!seguimiento[tokenField]) {
            return sendHtmlPage(false, 'Este enlace ya fue utilizado o no existe.');
        }
        if (seguimiento[tokenField] !== token) {
            return sendHtmlPage(false, 'Token inválido. Es posible que se haya generado un enlace más reciente.');
        }
        const expTimestamp = seguimiento[expField];
        if (expTimestamp && Date.now() > expTimestamp) {
            return sendHtmlPage(false, 'El enlace ha caducado (validez 7 días). Genera uno nuevo desde el panel.');
        }

        // Invalidar token de inmediato (uso único) y marcar como notificado
        const newSeguimiento = {
            ...seguimiento,
            [tokenField]: null,
            [expField]: null,
            [notifiedField]: new Date().toISOString()
        };
        await supabase.from('expedientes')
            .update({ seguimiento: newSeguimiento, updated_at: new Date().toISOString() })
            .eq('id', req.params.id);

        // Enviar notificaciones al cliente (y partners/admin como de costumbre)
        const result = phase === 'final'
            ? await notifyCeeFinalRegistrado(exp)
            : await notifyCeeInicialRegistrado(exp);

        if (!result.ok && result.reason === 'cliente-not-found') {
            return sendHtmlPage(false, 'No se encontró al cliente en la base de datos. Verifícalo en el panel.');
        }

        return sendHtmlPage(true, `El cliente ha sido notificado correctamente por WhatsApp y email sobre el registro del CEE ${phase === 'final' ? 'Final' : 'Inicial'}.`);
    } catch (err) {
        console.error('[notify-client]', err.message);
        return sendHtmlPage(false, 'Error interno del servidor. Inténtalo desde el panel de administración.');
    }
});

// ─── GET /api/expedientes/:id/approve-cee-from-email ──────────────────────────
// Endpoint PÚBLICO (token de un solo uso). El admin lo recibe como botón
// "Dar Visto Bueno" en el email de SOLICITUD DE REVISIÓN. Al pulsarlo:
//   1. Marca el CEE como REVISADO (seguimiento) + estado "REVISADO Y LISTO (...)".
//   2. Avisa al certificador por EMAIL y WhatsApp con el texto de visto bueno
//      (idéntico al que envía la app por defecto).
// Query params: token (string), phase (inicial | final)
router.get('/:id/approve-cee-from-email', async (req, res) => {
    const { token, phase } = req.query;

    const sendHtmlPage = (ok, title, message) => {
        const color = ok ? '#10b981' : '#ef4444';
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BROKERGY</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0a0e1a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #fff; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
    .card { background: #111827; border: 1px solid #334155; border-radius: 20px; padding: 40px 30px; max-width: 440px; width: 100%; text-align: center; }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h2 { color: ${color}; margin-bottom: 12px; font-size: 22px; }
    p { color: #94a3b8; line-height: 1.5; margin-bottom: 8px; }
    .brand { color: #475569; font-size: 11px; margin-top: 30px; letter-spacing: 0.05em; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${ok ? '✅' : '⚠️'}</div>
    <h2>${title}</h2>
    <p>${message}</p>
    <div class="brand">BROKERGY · Ingeniería Energética</div>
  </div>
</body>
</html>`);
    };

    if (!token || !phase) return sendHtmlPage(false, 'Error', 'Parámetros inválidos.');
    if (phase !== 'inicial' && phase !== 'final') return sendHtmlPage(false, 'Error', 'Phase inválida. Usa "inicial" o "final".');

    try {
        const { data: exp, error: expErr } = await supabase
            .from('expedientes').select('*').eq('id', req.params.id).single();
        if (expErr || !exp) return sendHtmlPage(false, 'Error', 'Expediente no encontrado.');

        const seguimiento = exp.seguimiento || {};
        const segKey = phase === 'final' ? 'cee_final' : 'cee_inicial';
        const phaseLabel = phase === 'final' ? 'CEE Final' : 'CEE Inicial';

        // Verificación de la firma HMAC (stateless; no depende de la BD → inmune al
        // pisado por el autoguardado del módulo).
        if (!approveCeeSignatureValid(req.params.id, phase, token)) {
            return sendHtmlPage(false, 'Enlace no válido', 'El enlace no es válido o ha cambiado. Da el visto bueno desde el portal.');
        }

        // Idempotencia: si ya está revisado/registrado, no repetir el envío.
        if (['REVISADO', 'REGISTRADO'].includes(seguimiento[segKey])) {
            return sendHtmlPage(true, 'Ya aprobado', `El ${phaseLabel} del expediente ${exp.numero_expediente || ''} ya tenía el visto bueno. No se ha realizado ninguna acción nueva.`);
        }

        const newEstado = phase === 'final' ? 'REVISADO Y LISTO (FINAL)' : 'REVISADO Y LISTO (INICIAL)';

        // Datos del certificador y del cliente (para el mensaje de visto bueno)
        const cee = exp.cee || {};
        let certEmail = null, certName = 'Técnico', certPhone = null;
        if (cee.certificador_id) {
            const { data: cert } = await supabase.from('prescriptores').select('*').eq('id_empresa', cee.certificador_id).maybeSingle();
            if (cert) {
                certEmail = cert.email || null;
                certName = cert.razon_social || cert.acronimo || 'Técnico';
                certPhone = cert.telefono || cert.movil || cert.tlf || cert.tlf_contacto || cert.landing_telefono_contacto || null;
            }
        }
        let clienteNombre = '';
        if (exp.cliente_id) {
            const { data: cli } = await supabase.from('clientes').select('nombre_razon_social, apellidos').eq('id_cliente', exp.cliente_id).maybeSingle();
            if (cli) clienteNombre = `${cli.nombre_razon_social || ''} ${cli.apellidos || ''}`.trim();
        }

        // Estado + seguimiento + historial
        cee.estado = newEstado;
        const globalEstado = avanzarEstado(exp.estado, newEstado);
        applyStatus(seguimiento, segKey, 'REVISADO');

        const docObj = exp.documentacion || {};
        const historial = docObj.historial || [];
        historial.push({
            id: Date.now().toString() + '_revok_mail',
            tipo: 'aprobacion_tecnica',
            texto: `BROKERGY ha dado el VISTO BUENO al ${phaseLabel} desde el botón del email de solicitud de revisión. Se autoriza su registro en Industria.`,
            fecha: new Date().toISOString(),
            usuario: 'ADMINISTRADOR'
        });
        historial.push({ id: Date.now().toString() + '_status_revok_mail', estado: globalEstado, fecha: new Date().toISOString(), usuario: 'ADMINISTRADOR' });

        await supabase.from('expedientes')
            .update({ cee, estado: globalEstado, seguimiento, documentacion: { ...docObj, historial }, updated_at: new Date().toISOString() })
            .eq('id', req.params.id);

        if (globalEstado !== exp.estado) {
            syncExpedienteFolderAsync({ ...exp, estado: globalEstado, cee }, { motivo: 'approve-cee (email)' });
        }

        // Mensaje de visto bueno IDÉNTICO al que la app envía por defecto (buildCertApproveMessage)
        const ceeUploadService = require('../services/ceeUploadService');
        const portalLink = `${process.env.FRONTEND_URL || 'https://app.brokergy.es'}/?exp=${req.params.id}`;
        const APP_BASE = process.env.FRONTEND_URL || 'https://app.brokergy.es';
        const firstName = (certName || '').trim().split(/\s+/)[0] || '';
        const tecnico = firstName ? firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase() : 'técnico';
        const cliProper = clienteNombre
            ? ' (' + clienteNombre.toLowerCase().split(/\s+/).filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') + ')'
            : '';

        // Enlaces de descarga (carpeta CEE pública) + subida (popup del CEE registrado)
        let presentFolderLink = null;
        let ceeUploadLink = null;
        try {
            const driveFolderId = await ceeUploadService.resolveDriveFolderId(exp);
            if (driveFolderId) {
                const section = await ceeUploadService.ensureCeeSectionFolder(driveFolderId, phase);
                presentFolderLink = section.link;
            }
            const upTok = ceeUploadService.ceeUploadSignature(req.params.id, phase);
            ceeUploadLink = `${APP_BASE}/subir-cee/${req.params.id}?token=${upTok}&phase=${phase}`;
        } catch (linkErr) {
            console.warn('[approve-from-email] enlaces CEE:', linkErr.message);
        }
        const ceeLinksBlock = `${presentFolderLink ? `\n\n📥 Descarga los archivos del ${phaseLabel} para presentarlos:\n${presentFolderLink}` : ''}${ceeUploadLink ? `\n\n📤 Una vez presentado, sube aquí el ${phaseLabel} registrado (etiqueta + justificante):\n${ceeUploadLink}` : ''}`;
        const expedienteLink = `\n\n🔗 Abre el expediente directamente en la app:\n${portalLink}`;
        const vistoBuenoMsg = `¡Hola ${tecnico}!\n\nHemos revisado el ${phaseLabel} del expediente ${exp.numero_expediente}${cliProper} y tiene nuestro visto bueno. Ya puedes proceder a registrarlo en Industria.${expedienteLink}${ceeLinksBlock}\n\n¡Gracias!`;

        // EMAIL + WhatsApp al certificador (automático, ambos canales)
        let emailSent = false, waSent = false;
        if (certEmail) {
            try {
                await emailService.sendCertificadorApproveNotification(
                    certEmail, certName, exp.numero_expediente, phaseLabel, portalLink,
                    (cee.cee_folder_link || null), null, vistoBuenoMsg,
                    { presentFolderLink, ceeUploadLink }
                );
                emailSent = true;
            } catch (e) { console.error('[approve-from-email] email:', e.message); }
        }
        if (certPhone) {
            try {
                await whatsappService.sendText(certPhone, `${vistoBuenoMsg}\n\n*BROKERGY · Ingeniería Energética*`);
                waSent = true;
            } catch (e) { console.error('[approve-from-email] WhatsApp:', e.message); }
        }

        const canales = [emailSent ? '✉️ email' : null, waSent ? '💬 WhatsApp' : null].filter(Boolean).join(' + ')
            || 'ningún canal (revisa el email/teléfono del certificador en su ficha)';
        return sendHtmlPage(true, 'Visto bueno enviado', `Has dado el visto bueno al ${phaseLabel} del expediente ${exp.numero_expediente}. El certificador ya tiene luz verde para registrar y ha sido avisado por ${canales}.`);
    } catch (err) {
        console.error('[approve-cee-from-email]', err.message);
        return sendHtmlPage(false, 'Error', 'Error interno del servidor. Da el visto bueno desde el portal.');
    }
});

// PATCH /api/expedientes/:id/prioridad
router.patch('/:id/prioridad', enforceAuth, async (req, res) => {
    try {
        const { prioridad } = req.body;
        const valid = ['NORMAL', 'ALTA', 'URGENTE'];
        if (!valid.includes(prioridad)) return res.status(400).json({ error: 'Prioridad inválida' });
        const { error } = await supabase.from('expedientes')
            .update({ prioridad, updated_at: new Date().toISOString() })
            .eq('id', req.params.id);
        if (error) return res.status(500).json({ error: error.message });
        res.json({ ok: true, prioridad });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── CHATS DE WHATSAPP VINCULADOS A ESTE EXPEDIENTE ──────────────────────────
//
// El bot resuelve por teléfono, y eso basta para el 85 % de los casos. Falla
// con quien tiene varias obras a la vez — un instalador puede tener 38 vivas en
// el mismo chat—, y ahí hace falta poder decirle a mano de cuál se trata.
//
// La fuente de verdad es `botVinculos`; aquí solo se expone para la ficha.
// staffOnly: es información de contacto, no lleva importes.
// ─────────────────────────────────────────────────────────────────────────────

/** Oportunidad de un expediente (la tabla de vínculos cuelga de ella, porque el
 *  expediente puede no existir todavía cuando la propuesta está sin aceptar). */
async function oportunidadDeExpediente(expedienteId) {
    const { data, error } = await supabase.from('expedientes')
        .select('oportunidad_id').eq('id', expedienteId).maybeSingle();
    if (error || !data) return null;
    return data.oportunidad_id || null;
}

/**
 * Teléfonos que ya constan en el expediente, para poder ELEGIR en vez de
 * teclear. Teclear un móvil a mano es la forma más fácil de vincular el chat
 * equivocado, y ya tenemos los buenos en la ficha del cliente y del instalador.
 */
async function contactosConocidos(exp) {
    const [cliente, instalador] = await Promise.all([
        resolveSolicitudContacto(exp, 'CLIENTE'),
        resolveSolicitudContacto(exp, 'INSTALADOR'),
    ]);
    const out = [];
    const push = (nombre, tlf, papel) => {
        const t = String(tlf || '').replace(/\D/g, '');
        if (t.length < 9) return;
        if (out.some(c => c.telefono.slice(-9) === t.slice(-9))) return;   // ya está
        out.push({ nombre: nombre || papel, telefono: t, papel });
    };
    push(cliente?.nombre, cliente?.tlf, 'Cliente');
    push(instalador?.nombre, instalador?.tlf, 'Instalador');
    // Las personas de contacto del instalador: en muchas empresas quien escribe
    // por WhatsApp no es el número de la ficha, sino el del jefe de obra.
    for (const c of instalador?.contactos || []) push(c.nombre, c.tlf, 'Contacto del instalador');
    return out;
}

// GET /api/expedientes/:id/whatsapp-chats
router.get('/:id/whatsapp-chats', staffOnly, async (req, res) => {
    try {
        const { data: exp } = await supabase.from('expedientes')
            .select('id, oportunidad_id, cliente_id').eq('id', req.params.id).maybeSingle();
        if (!exp?.oportunidad_id) return res.status(404).json({ error: 'Expediente no encontrado' });
        const [chats, contactos] = await Promise.all([
            botVinculos.chatsDe(exp.oportunidad_id),
            contactosConocidos(exp),
        ]);
        res.json({ oportunidad_id: exp.oportunidad_id, chats, contactos });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/expedientes/:id/whatsapp-chats  { telefono, nota? }
// Fija a mano el chat de esta obra. Gana a cualquier pista automática.
router.post('/:id/whatsapp-chats', staffOnly, async (req, res) => {
    try {
        const { telefono, nota } = req.body || {};
        if (!telefono) return res.status(400).json({ error: 'Falta el teléfono' });
        const oppId = await oportunidadDeExpediente(req.params.id);
        if (!oppId) return res.status(404).json({ error: 'Expediente no encontrado' });
        const out = await botVinculos.fijar(telefono, oppId, nota || null);
        res.json({ ok: true, ...out, chats: await botVinculos.chatsDe(oppId) });
    } catch (e) {
        res.status(e.datoInvalido ? 400 : 500).json({ error: e.message });
    }
});

// POST /api/expedientes/:id/whatsapp-chats/:telefono/etiqueta  { quitar? }
//
// Pone (o quita) la etiqueta del bot en el chat de WhatsApp de ese número, sin
// salir de la app. Es la mitad que faltaba: hasta ahora había que asignar el
// chat aquí y luego ir al WhatsApp del móvil a etiquetarlo, y el segundo paso
// se olvida — el síntoma es "lo tengo asignado y no contesta".
//
// adminOnly: encender el bot en un chat es decidir que a ese cliente le va a
// responder una máquina en nombre de BROKERGY.
router.post('/:id/whatsapp-chats/:telefono/etiqueta', adminOnly, async (req, res) => {
    try {
        const bot = require('../services/botWhatsapp');
        const quitar = req.body?.quitar === true;
        const chatId = await bot.chatIdDeTelefono(req.params.telefono);
        const out = await bot.cambiarEtiquetaDelChat(chatId, { quitar });
        res.json({ ok: true, chat_id: chatId, ...out });
    } catch (e) {
        // Casi todos los fallos aquí son de dato o de estado (no hay chat, no
        // es Business, WhatsApp desconectado), no averías del servidor: el
        // mensaje ya viene escrito para que lo lea una persona.
        res.status(400).json({ error: e.message });
    }
});

// GET /api/expedientes/:id/whatsapp-chats/:telefono/etiqueta → ¿está etiquetado?
router.get('/:id/whatsapp-chats/:telefono/etiqueta', staffOnly, async (req, res) => {
    try {
        const bot = require('../services/botWhatsapp');
        const chatId = await bot.chatIdDeTelefono(req.params.telefono);
        res.json({ chat_id: chatId, etiquetado: await bot.estaEtiquetado(chatId) });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// DELETE /api/expedientes/:id/whatsapp-chats/:telefono
router.delete('/:id/whatsapp-chats/:telefono', staffOnly, async (req, res) => {
    try {
        const oppId = await oportunidadDeExpediente(req.params.id);
        if (!oppId) return res.status(404).json({ error: 'Expediente no encontrado' });
        await botVinculos.soltar(req.params.telefono, oppId);
        res.json({ ok: true, chats: await botVinculos.chatsDe(oppId) });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
// Expuesto para pruebas y para quien necesite el barrido sin pasar por HTTP
// (p. ej. el MCP al responder "qué falta en el expediente NNN").
module.exports.buildChecklistData = buildChecklistData;
