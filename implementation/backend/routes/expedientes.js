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
const emailService = require('../services/emailService');
const whatsappService = require('../services/whatsappService');
const reformaUploadService = require('../services/reformaUploadService');
const { mergeDocumentacion } = require('../utils/mergeDocumentacion');
const anexoFotograficoService = require('../services/anexoFotograficoService');
const cifoService = require('../services/cifoService');
const { applyStatus, stampSeguimientoTimestamps, markCertContact } = require('../services/seguimientoTracking');
const { partnerNotifyTargets, normalizeContactos } = require('../services/notifyContacts');
const { buildCertClienteData } = require('../services/certClienteData');
const { getCertificadorNombre } = require('../services/certificadorLookup');
const { avanzarEstado } = require('../utils/expedienteEstados');

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
        const clientMsg = `¡Hola *${clienteName}*! 👋\n\nTe comunicamos que ya ha sido presentado el *Certificado de Eficiencia Energética FINAL* de tu expediente *${numExp}*.\n\n¡Muchas gracias!\n*BROKERGY — Ingeniería Energética*`;
        const staffMsg = `✅ *REGISTRO CEE FINAL PRESENTADO*\nExpediente: ${numExp}\nCliente: ${clienteFull}\n\nSe ha subido el justificante de registro del CEE Final al sistema.\n\nVer expediente:\n🔗 ${expedienteLink}`;
        return { CLIENTE: clientMsg, PARTNER: staffMsg, ADMIN: staffMsg };
    }
    // ── CEE INICIAL ──
    const clientMsg = `¡Hola *${clienteName}*! 👋\n\nTe escribimos para comunicarte que ya ha sido presentado el *Certificado de Eficiencia Energética INICIAL* de tu expediente *${numExp}*.\n\n*Desde este momento ya se pueden emitir facturas y pagos*\n\n📸 Recuerda hacerle fotografías a todo:\n• *Caldera existente y placa de fabricación.*\n• *Desmontaje de la caldera.*\n• *Montaje de la aerotermia.*\n• *Fotos de las nuevas placas de fabricación* (tanto de la unidad exterior como de la interior).\n\nLas fotos son la parte más importante del proceso para que podamos argumentar ante el ministerio que se ha realizado la reforma.\n\nPuedes subirlas directamente al expediente a través de este enlace:\n🔗 ${portalLink}\n\nUna vez finalizada la obra, debes comunicárnoslo por aquí para proceder con el CEE Final y el resto de la documentación.\n\n📄 Y cuando quieras, puedes *consultar el estado de tu expediente* y el bono que cobrarás aquí:\n🔗 ${(portalLink || '').replace('/subir-docs/', '/mi-expediente/')}\n\n¡Muchas gracias!\n*BROKERGY — Ingeniería Energética*`;
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
            supabase.from('oportunidades').select('id, id_oportunidad, referencia_cliente, ficha, ref_catastral, datos_calculo, prescriptor_id').eq('id', simple.oportunidad_id).single()
        ]);

        // Recuperamos el instalador asignado (desde Instalacion o el genérico de Oportunidades)
        let assignedPrescriptor = null;
        const targetInstId = simple.instalacion?.instalador_id || op?.prescriptor_id;
        
        if (targetInstId) {
            const { data: presInfo } = await supabase
                .from('prescriptores')
                .select('*')
                .eq('id_empresa', targetInstId)
                .single();
            if (presInfo) assignedPrescriptor = presInfo;
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

    const grupoCliente = [
        mk('datos_personales', 'Datos personales', 'CLIENTE', datosPersOk, ['anexos', 'final'], datosPersOk ? null : 'Faltan: ' + faltanPers.join(', ')),
        mk('numero_cuenta', 'Nº de cuenta (IBAN)', 'CLIENTE', ibanOk, ['anexos', 'final'], ibanOk ? c.numero_cuenta : 'Sin IBAN'),
        mk('justificante', 'Justificante titularidad bancaria', 'CLIENTE', justifOk, ['final'], null, justifLink),
        mk('anexo_i_firmado', 'Anexo I firmado', 'CLIENTE', anexoIFirmado, ['final'], cicloAnexoI.detalle, doc.anexo_i_signed_link, cicloAnexoI),
        mk('cesion_firmado', 'Anexo Cesión firmado', 'CLIENTE', cesionFirmado, ['final'], cicloCesion.detalle, doc.anexo_cesion_signed_link, cicloCesion),
        mk('anexo_fotografico_firmado', 'Anexo Fotográfico firmado', 'CLIENTE', anexoFotoFirmado, ['final'], cicloFoto.detalle, doc.anexo_fotografico_signed_link, cicloFoto),
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
    const riteOk = present(doc.cert_rite_drive_link) || present(doc.cert_rite_signed_link) || (Array.isArray(uploads.DOC_RITE) && uploads.DOC_RITE.length > 0);
    const facturaOk = nFacturas > 0;
    const cicloCifo = cicloDoc(present(doc.cert_cifo_drive_link), doc.cert_cifo_sent_at, cifoOk);
    const grupoInstalador = [
        mk('cifo', 'Certificado CIFO (firmado)', 'INSTALADOR', cifoOk, ['final'], cicloCifo.detalle, doc.cert_cifo_signed_link, cicloCifo),
        // RITE y factura no viajan para firma: o los tenemos o no. Sin eje temporal.
        mk('rite', 'Certificado RITE', 'INSTALADOR', riteOk, ['final'], null, doc.cert_rite_drive_link || doc.cert_rite_signed_link, { situacion: riteOk ? 'OK' : 'SIN_EMITIR' }),
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
    try { slots = reformaUploadService.buildDocChecklist(datos) || []; } catch (e) { console.warn('[checklist] buildDocChecklist:', e.message); }
    // Reconciliación con Drive, IGUAL que hacen el popup de fotos (buildDocsView) y
    // el Anexo Fotográfico (collectPhotoGroups). Sin esto el barrido solo miraba
    // `reforma_uploads`, así que una foto que llegó a Drive por otra vía —expediente
    // migrado, o la skill del anexo copiando con el MCP de Drive— seguía saliendo
    // como pendiente aunque el anexo ya la estuviera usando. Drive manda (regla 20).
    const enDrive = await reformaUploadService.driveSlotsPresentes(datos);
    const grupoFotos = slots
        .filter(s => s.key !== 'DOC_RITE' && s.key !== 'DOC_FACTURAS')
        .map(s => {
            const waived = !!overrides[s.key]?.waived;
            const arr = uploads[s.key] || [];
            const subida = (Array.isArray(arr) && arr.length > 0) || enDrive.has(s.key);
            const requerida = !waived && !!s.required;
            const obj = requerida ? ['final'] : [];
            // El recuento sale de la BD; si la foto solo está en Drive (arr vacío) no
            // sabemos cuántas son sin volver a listar, así que se dice de dónde viene.
            const detalle = waived
                ? 'No necesario'
                : (subida
                    ? (arr.length > 0 ? `${arr.length} archivo(s)` : 'Aportada (en Drive)')
                    : (requerida ? 'Requerida — sin subir' : 'Opcional'));
            // `fase`, `required` y `subida` se exponen para "solicitar lo que falta"
            // (presente mezcla subida||waived y no basta para saber si hay fichero).
            return mk(s.key, s.label || s.key, 'CUALQUIERA', subida || waived, obj, detalle, null, { waived, fase: s.fase, required: !!s.required, subida });
        });

    const todos = [...grupoCliente, ...grupoInstalador, ...grupoCertificador, ...grupoFotos];
    const faltanPara = (objetivo) => todos.filter(i => i.objetivos.includes(objetivo) && !i.presente).map(i => i.label);

    // ── PISTAS PARALELAS ─────────────────────────────────────────────────────
    // Las tres cosas que pueden estar en la calle A LA VEZ, cada una en manos de
    // alguien distinto. Esto es lo que responde "dime qué falta" sin tener que
    // exprimir un único `estado` lineal que no da para tanto.
    const armarPista = (id, label, responsable, items) => {
        const pendientes = items.filter(i => !i.presente);
        const situacion = pendientes.length === 0 ? 'OK' : peorSituacion(pendientes.map(i => i.situacion || 'SIN_EMITIR'));
        const esperas = pendientes.map(i => i.dias_esperando).filter(d => typeof d === 'number');
        return {
            id, label, responsable, situacion,
            listo: pendientes.length === 0,
            // Días que llevamos esperando a que nos devuelvan lo más antiguo.
            dias_esperando: esperas.length ? Math.max(...esperas) : null,
            pendientes: pendientes.map(i => ({
                key: i.key, label: i.label, situacion: i.situacion || 'SIN_EMITIR',
                dias_esperando: i.dias_esperando ?? null, detalle: i.detalle || null,
            })),
        };
    };

    const pistas = [
        armarPista('cee_final', 'CEE final', 'CERTIFICADOR', grupoCertificador),
        armarPista('anexos_cliente', 'Anexos para firma', 'CLIENTE',
            grupoCliente.filter(i => ['anexo_i_firmado', 'cesion_firmado', 'anexo_fotografico_firmado'].includes(i.key))),
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
            { responsable: 'INSTALADOR', label: 'Instalador', items: grupoInstalador },
            { responsable: 'CERTIFICADOR', label: 'Certificador', items: grupoCertificador },
            { responsable: 'CUALQUIERA', label: 'Cualquiera (fotos)', items: grupoFotos },
        ],
        pistas,
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
function buildSolicitudAcciones(checklist, { expId, uploadBase }) {
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
    const anexoIFalta = cliPend.find(i => i.key === 'anexo_i_firmado');
    const cesionFalta = cliPend.find(i => i.key === 'cesion_firmado');
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
function buildSolicitudPendientes(checklist, { hayInstalador }) {
    const items = (r) => (checklist.grupos.find(g => g.responsable === r)?.items || []);
    const out = [];
    const cliPend = items('CLIENTE').filter(i => !i.presente);
    const insPend = items('INSTALADOR').filter(i => !i.presente);

    // Los anexos se GENERAN con IBAN+justificante: mientras falten datos, la firma
    // no se incluye por defecto (el admin puede forzarla desde el checklist).
    const datosFaltan = cliPend.some(i => i.key === 'numero_cuenta' || i.key === 'justificante');
    for (const i of cliPend) {
        if (i.key === 'datos_personales') continue;          // los completa Brokergy (adminPendiente)
        if (i.key === 'anexo_fotografico_firmado') continue; // sin flujo público de firma todavía
        const tipo = (i.key === 'numero_cuenta' || i.key === 'justificante') ? 'dato' : 'firma';
        const espera = tipo === 'firma' && datosFaltan;
        out.push({ key: i.key, label: i.label, tipo, fase: null, required: true, waived: false, ownerDefault: 'CLIENTE', flujo: 'firmar-anexos', defaultIncluido: !espera, nota: espera ? 'Los anexos se generan con el IBAN y el justificante; la firma se pedirá cuando estén.' : (i.detalle || null) });
    }

    const riteFalta = insPend.some(i => i.key === 'rite');
    const factFalta = insPend.some(i => i.key === 'factura');
    for (const i of insPend) {
        if (i.key === 'rite') out.push({ key: 'rite', label: 'Certificado RITE (y memoria firmada)', tipo: 'doc', fase: 'DESPUES', required: true, waived: false, ownerDefault: 'INSTALADOR', flujo: 'subir-rite', defaultIncluido: true });
        if (i.key === 'factura') out.push({ key: 'factura', label: 'Factura(s) de la obra', tipo: 'doc', fase: 'DESPUES', required: true, waived: false, ownerDefault: 'INSTALADOR', flujo: 'subir-docs', slot: 'DOC_FACTURAS', defaultIncluido: true });
        if (i.key === 'cifo') {
            // El CIFO se GENERA con los datos del RITE y de las facturas: hasta
            // tenerlos no se incluye por defecto (el admin puede forzarlo).
            const listo = !riteFalta && !factFalta;
            out.push({ key: 'cifo', label: i.label, tipo: 'firma', fase: 'DESPUES', required: true, waived: false, ownerDefault: 'INSTALADOR', flujo: 'subir-cifo', defaultIncluido: listo, nota: listo ? null : 'Se genera con el RITE y la factura; se pedirá cuando estén.' });
        }
    }

    for (const f of items('CUALQUIERA')) {
        if (f.subida) continue; // ya aportada
        const ownerDefault = (f.fase === 'DESPUES' && hayInstalador) ? 'INSTALADOR' : 'CLIENTE';
        out.push({ key: f.key, label: f.label, tipo: 'foto', fase: f.fase || null, required: !!f.required, waived: !!f.waived, ownerDefault, flujo: 'subir-docs', slot: f.key, defaultIncluido: !!f.required && !f.waived });
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
        const acciones = buildSolicitudAcciones(checklist, { expId: exp.id, uploadBase });

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
            pendientes: buildSolicitudPendientes(checklist, { hayInstalador }),
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
            try { await whatsappService.sendText(tlf, mensaje); sent.push('WhatsApp'); }
            catch (e) { console.warn('[solicitar-faltantes] WA:', e.message); sent.push('WhatsApp (encolado)'); }
        }
        if (channels.includes('email')) {
            if (!email) return res.status(400).json({ error: 'No hay email para enviar. Indica uno.' });
            const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#222;white-space:pre-wrap;line-height:1.5">${mensaje.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>`;
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
        const solicitadoTxt = solicitado.length ? `. Pedido: ${solicitado.join('; ')}` : '';
        historial.push({
            id: Date.now().toString() + '_solicitud',
            tipo: 'solicitud_docs',
            texto: `Solicitud de documentación enviada a ${target === 'CLIENTE' ? 'Cliente' : 'Instalador'}${destLabel} vía ${sent.join(' + ')}${solicitadoTxt}`,
            solicitado,
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
                const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#222;white-space:pre-wrap;line-height:1.5">${mensaje.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>`;
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
const DOCUMENTO_VALIDABLE_LABELS = {
    anexo_i_signed_link: 'Anexo I',
    anexo_cesion_signed_link: 'Anexo Cesión de Ahorro',
    cert_cifo_signed_link: 'Certificado CIFO',
    ficha_res060_signed_link: 'Ficha RES',
    anexo_fotografico_signed_link: 'Anexo Fotográfico',
    cert_rite_signed_link: 'Certificado RITE',
    facturas_combined_link: 'FACTURAS',
};

// Documentos que, al firmarse con certificado, quedan VALIDADOS automáticamente
// (verde) y se copian a la carpeta de auditoría "10. EXPEDIENTE CAE" en el mismo
// paso — no necesitan un click de validación aparte. El Anexo Fotográfico lo firma
// internamente Brokergy/instalador, así que la firma ya es su validación final.
// El Anexo de Cesión entra aquí porque la contrafirma de Brokergy es el último
// paso del documento: si lo firmamos nosotros es que ya lo hemos dado por bueno.
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
                const prevId = await driveService.findFileByName(auditFolderId, copyName);
                if (prevId) await driveService.deleteFile(prevId);
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
// Igual que /documentos/validar pero para los documentos del CEE INICIAL (viven en
// la columna `cee` del expediente, no en `documentacion`): el PDF firmado del CEE
// (slot "pdf", suffix _fdo.pdf) y el Registro (slot "registro", sin firma digital
// — solo hace falta que exista). Copia a "10. EXPEDIENTE CAE" igual que el resto.
// Body: { field: 'inicial_pdf' | 'inicial_registro' }
const CEE_VALIDABLE = {
    inicial_pdf: { slot: 'pdf', label: 'CEE Inicial Firmado' },
    inicial_registro: { slot: 'registro', label: 'CEE Inicial Registro' },
};

router.post('/:id/documentos/validar-cee', enforceAuth, async (req, res) => {
    try {
        const field = String(req.body?.field || '').trim();
        const spec = CEE_VALIDABLE[field];
        if (!spec) return res.status(400).json({ error: `field inválido (esperado uno de: ${Object.keys(CEE_VALIDABLE).join(', ')})` });

        const { data: exp, error } = await supabase.from('expedientes').select('*, oportunidades(*)').eq('id', req.params.id).single();
        if (error || !exp) return res.status(404).json({ error: 'Expediente no encontrado' });

        const ceeObj = exp.cee || {};
        const link = ceeObj.cee_files?.inicial?.[spec.slot];
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
                const copyName = `${exp.numero_expediente || ''} - ${spec.label}.pdf`.trim();
                const prevId = await driveService.findFileByName(auditFolderId, copyName);
                if (prevId) await driveService.deleteFile(prevId);
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

        // Marca el campo firmado y limpia un posible rechazo previo del mismo doc.
        const docObj = exp.documentacion || {};
        const docsRechazados = { ...(docObj.docs_rechazados || {}) };
        delete docsRechazados[field];
        const newDoc = { ...docObj, [field]: saved.link, docs_rechazados: docsRechazados };
        // Si Brokergy firma el Anexo de Cesión (contrafirma tras el cliente), marcar
        // la firma de Brokergy como completada.
        if (field === 'anexo_cesion_signed_link') newDoc.cesion_firmado_brokergy = true;

        // Auto-validación (verde) + copia a auditoría "10. EXPEDIENTE CAE" para los
        // documentos que la firma da por validados directamente (Anexo Fotográfico).
        let auditLink = null;
        const autoValidated = AUTO_VALIDATE_ON_SIGN.has(field);
        if (autoValidated) {
            newDoc.docs_validados = { ...(docObj.docs_validados || {}), [field]: new Date().toISOString() };
            try {
                const auditFolderId = await driveService.getOrCreateSubfolderNormalized(driveFolderId, '10. EXPEDIENTE CAE');
                const baseLabel = DOCUMENTO_VALIDABLE_LABELS[field] || field.replace(/_/g, ' ');
                const copyName = `${exp.numero_expediente || ''} - ${baseLabel}.pdf`.trim();
                const prevAudit = await driveService.findFileByName(auditFolderId, copyName);
                if (prevAudit) { try { await driveService.deleteFile(prevAudit); } catch (_) {} }
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
router.post('/:id/anexo-fotografico/generar', internalKeyOrAuth, async (req, res) => {
    try {
        const result = await anexoFotograficoService.generateAndSaveAnexo(req.params.id);
        if (!result.ok) return res.status(422).json(result);
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
// Genera el Certificado CIFO (RES060/RES093) con el MISMO builder que el modal
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
        const { target, type, channels = ['email', 'whatsapp'] } = req.body; 

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
                const intro = `¡Hola ${clienteName}! 👋\n\nTe escribimos para comunicarte que ya ha sido presentado el Certificado de Eficiencia Energética ${labelType} de tu expediente ${numExp}.`;
                const body = type === 'inicial' 
                    ? `${intro}\n\n${photoTextEmail}\n\n${closingTextEmail}`
                    : `${intro}\n\nYa puedes proceder con los siguientes pasos de tu expediente.\n\n¡Muchas gracias!\nBROKERGY — Ingeniería Energética`;
                await emailService.sendMail({ to: cli.email, subject, text: body }).catch(e => console.error('Error Email Cliente:', e.message));
            }

            // WhatsApp (Negritas)
            const cliWaPhone = (cli.notificaciones_contacto_activas && cli.persona_contacto_tlf) ? cli.persona_contacto_tlf : cli.tlf;
            if (sendWA && cliWaPhone && whatsappService) {
                const waIntro = `¡Hola *${clienteName}*! 👋\n\nTe escribimos para comunicarte que ya ha sido presentado el *Certificado de Eficiencia Energética ${labelType.toUpperCase()}* de tu expediente *${numExp}*.`;
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
                            const intro = `¡Hola ${partnerName}! 👋\n\nTe informamos que ya se ha presentado el Certificado de Eficiencia Energética ${labelType} de tu cliente:`;
                            const info = `Cliente: ${clienteFull}\nDirección: ${ubicacion}\nExpediente: ${numExp}`;
                            const body = type === 'inicial'
                                ? `${intro}\n\n${info}\n\n${photoTextEmail}\n\n${closingTextEmail}`
                                : `${intro}\n\n${info}\n\nEl proceso continúa según lo previsto.\n\n¡Muchas gracias!\nBROKERGY — Ingeniería Energética`;
                            await emailService.sendMail({ to: c.email, subject: partnerSubject, text: body }).catch(e => console.error('Error Email Partner:', e.message));
                        }

                        // WhatsApp (Negritas)
                        if (sendWA && c.tlf && whatsappService) {
                            const waIntro = `¡Hola *${partnerName}*! 👋\n\nTe informamos que ya se ha presentado el *Certificado de Eficiencia Energética ${labelType.toUpperCase()}* de tu cliente:`;
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

¡Hola BROKERGY! 👋
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

        if (!['RES060', 'RES080', 'RES093'].includes(ficha)) {
            return res.status(400).json({ error: 'ficha inválida (debe ser RES060, RES080 o RES093)' });
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

        // ── Notificaciones admin con enlace one-tap (fire-and-forget post-save) ──
        if (_notifyAdminCeeInicial) {
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

        if (_notifyAdminCeeFinal) {
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
//   { id, texto, estado:'ABIERTA'|'SUBSANADA', fecha, usuario, resuelta_at, resuelta_por }

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

// Marcar como SUBSANADA (botón OK)
router.patch('/:id/incidencias/:incId/resolver', staffOnly, async (req, res) => {
    try {
        const loaded = await loadIncidencias(req.params.id);
        if (!loaded) return res.status(404).json({ error: 'No encontrado.' });
        const inc = loaded.incidencias.find(i => i.id === req.params.incId);
        if (!inc) return res.status(404).json({ error: 'Incidencia no encontrada.' });

        inc.estado = 'SUBSANADA';
        inc.resuelta_at = new Date().toISOString();
        inc.resuelta_por = incidenciaUsuario(req);

        const saved = await saveIncidencias(req.params.id, loaded.docObj, loaded.incidencias);
        if (!saved) return res.status(500).json({ error: 'Error al actualizar la incidencia.' });
        res.status(200).json(saved);
    } catch (error) {
        res.status(500).json({ error: 'Error del servidor.' });
    }
});

// Reabrir (volver a ABIERTA)
router.patch('/:id/incidencias/:incId/reabrir', staffOnly, async (req, res) => {
    try {
        const loaded = await loadIncidencias(req.params.id);
        if (!loaded) return res.status(404).json({ error: 'No encontrado.' });
        const inc = loaded.incidencias.find(i => i.id === req.params.incId);
        if (!inc) return res.status(404).json({ error: 'Incidencia no encontrada.' });

        inc.estado = 'ABIERTA';
        inc.resuelta_at = null;
        inc.resuelta_por = null;

        const saved = await saveIncidencias(req.params.id, loaded.docObj, loaded.incidencias);
        if (!saved) return res.status(500).json({ error: 'Error al reabrir la incidencia.' });
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

        const loaded = await loadIncidencias(req.params.id);
        if (!loaded) return res.status(404).json({ error: 'No encontrado.' });
        const inc = loaded.incidencias.find(i => i.id === req.params.incId);
        if (!inc) return res.status(404).json({ error: 'Incidencia no encontrada.' });

        inc.texto = texto;
        if (body.procedencia !== undefined) inc.procedencia = normProcedencia(body.procedencia);
        if (body.severidad !== undefined) inc.severidad = normSeveridad(body.severidad);
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

// ─── POST /api/expedientes/:id/facturas/generar-pdf ───────────────────────────
// Combina TODAS las facturas de la carpeta "5. FACTURAS" en un único PDF
// "{numero_expediente} - FACTURAS.pdf" (conservando los originales). Requiere que
// haya al menos una factura y que TODAS estén validadas
// (documentacion.facturas[].validada === true).
router.post('/:id/facturas/generar-pdf', enforceAuth, async (req, res) => {
    try {
        const { data: exp, error: expErr } = await supabase
            .from('expedientes')
            .select('id, numero_expediente, documentacion, oportunidad_id')
            .eq('id', req.params.id)
            .maybeSingle();
        if (expErr || !exp) return res.status(404).json({ error: 'Expediente no encontrado' });

        const facturas = Array.isArray(exp.documentacion?.facturas) ? exp.documentacion.facturas : [];
        if (!facturas.length) return res.status(400).json({ error: 'El expediente no tiene facturas.' });
        if (!facturas.every(f => f && f.validada)) {
            return res.status(400).json({ error: 'Todas las facturas deben estar validadas antes de generar el PDF único.' });
        }

        const { data: op } = await supabase
            .from('oportunidades').select('datos_calculo, id_oportunidad').eq('id', exp.oportunidad_id).single();
        const driveFolderId = op?.datos_calculo?.drive_folder_id || op?.datos_calculo?.inputs?.drive_folder_id;
        if (!driveFolderId) return res.status(400).json({ error: 'La oportunidad no tiene carpeta de Drive configurada.' });

        const driveService = require('../services/driveService');
        const { combineFilesToPdf } = require('../services/facturasCombineService');

        // Carpeta "5. FACTURAS" (resolución tolerante para no crear duplicados).
        const facturasFolderId = await driveService.getOrCreateSubfolderNormalized(driveFolderId, reformaUploadService.SUBCARPETA_FACTURAS);

        const numExp = (exp.numero_expediente || op?.id_oportunidad || 'EXPEDIENTE').trim();
        const outName = `${numExp} - FACTURAS.pdf`;

        // Ficheros origen: todo lo de "5. FACTURAS" salvo el propio combinado y subcarpetas (OLD).
        const all = await driveService.listFiles(facturasFolderId);
        const sources = all
            .filter(f => f.mimeType !== 'application/vnd.google-apps.folder')
            .filter(f => f.name !== outName)
            .sort((a, b) => String(a.name).localeCompare(String(b.name), 'es', { numeric: true }));
        if (!sources.length) return res.status(400).json({ error: 'No se han encontrado ficheros de factura en Drive.' });

        const combined = await combineFilesToPdf(sources);
        if (!combined) return res.status(500).json({ error: 'No se pudo generar el PDF (formatos no soportados).' });

        // Reemplaza el combinado anterior si existía (mismo nombre → un único fichero).
        try {
            const prev = await driveService.findFileByName(facturasFolderId, outName);
            if (prev) await driveService.deleteFile(prev);
        } catch (e) { /* no bloquear la regeneración */ }

        const saved = await driveService.saveFileToFolder(facturasFolderId, outName, 'application/pdf', combined.buffer);
        if (!saved?.link) return res.status(500).json({ error: 'No se pudo guardar el PDF en Drive.' });

        // Copia también a la carpeta de auditoría "10. EXPEDIENTE CAE" (todas las
        // facturas están validadas para llegar aquí): deja el original en
        // "5. FACTURAS" y reúne el combinado junto al resto de documentación validada.
        let auditLink = null;
        try {
            const auditFolderId = await driveService.getOrCreateSubfolderNormalized(driveFolderId, '10. EXPEDIENTE CAE');
            const prevAudit = await driveService.findFileByName(auditFolderId, outName);
            if (prevAudit) await driveService.deleteFile(prevAudit);
            const copied = await driveService.copyFile(saved.id, auditFolderId, outName);
            if (copied?.link) auditLink = copied.link;
        } catch (copyErr) {
            console.warn('[facturas/generar-pdf] No se pudo copiar a "10. EXPEDIENTE CAE":', copyErr.message);
        }

        res.json({
            success: true,
            drive_link: saved.link,
            drive_id: saved.id,
            name: outName,
            count: sources.length,
            pages: combined.pages,
            skipped: combined.skipped,
            audit_link: auditLink
        });
    } catch (err) {
        console.error('Error POST expedientes/:id/facturas/generar-pdf:', err);
        res.status(500).json({ error: 'Error al generar el PDF de facturas', details: err.message });
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
const RITE_PRESENCE = (val) => {
    if (val === 0 || val === false) return true; // 0 / false son valores válidos
    if (!val) return false;
    if (typeof val === 'string' && (val.trim() === '' || val.includes('_____') || val === '—')) return false;
    return true;
};

function validateMemoriaRite({ exp, cli, op, pres }) {
    const missing = [];
    const inst = exp.instalacion || {};
    const doc = exp.documentacion || {};
    const inputs = (op?.datos_calculo?.inputs) || {};
    const cal = inst.aerotermia_cal || {};
    const acs = inst.aerotermia_acs || {};
    const P = RITE_PRESENCE;

    // Titular
    if (!P(exp.numero_expediente)) missing.push('Número de Expediente');
    if (!P(cli?.nombre_razon_social)) missing.push('Nombre / Razón Social Cliente');
    if (!P(cli?.apellidos)) missing.push('Apellidos Cliente');
    if (!P(cli?.dni || cli?.dni_nie)) missing.push('DNI / NIE Cliente');
    if (!P(cli?.direccion)) missing.push('Dirección Cliente');
    if (!P(cli?.municipio)) missing.push('Municipio Cliente');
    if (!P(cli?.provincia)) missing.push('Provincia Cliente');
    if (!P(cli?.codigo_postal)) missing.push('Código Postal Cliente');

    // Ubicación / cálculo
    if (!P(inputs.superficie)) missing.push('Superficie (Cálculo / Toma de datos)');
    if (!P(inputs.zona)) missing.push('Zona Climática (Cálculo)');
    if (!P(inputs.plantas)) missing.push('Nº de Plantas (Cálculo)');
    if (!P(inst.ref_catastral || op?.ref_catastral || inputs.rc)) missing.push('Referencia Catastral (Instalación)');

    // Equipo calefacción
    if (!P(cal.marca)) missing.push('Marca Aerotermia Calefacción (Instalación)');
    if (!P(cal.modelo)) missing.push('Modelo Aerotermia Calefacción (Instalación)');
    // En cascada, TODAS las unidades deben tener nº de serie: la memoria RITE los
    // concatena en una única casilla y ninguno puede faltar.
    for (const n of unidadesSinSerie(cal)) {
        missing.push(countUnidadesAero(cal) > 1
            ? `Nº Serie Aerotermia Calefacción — equipo ${n} (Instalación)`
            : 'Nº Serie Aerotermia Calefacción (Instalación)');
    }
    if (!P(cal.potencia)) missing.push('Potencia Aerotermia Calefacción (Instalación)');

    // Equipo ACS (solo si hay cambio de ACS)
    const hasAcs = inst.cambio_acs === true || inst.cambio_acs === 'si';
    if (hasAcs) {
        if (!P(acs.marca)) missing.push('Marca Aerotermia ACS (Instalación)');
        if (!P(acs.modelo)) missing.push('Modelo Aerotermia ACS (Instalación)');
        for (const n of unidadesSinSerie(acs)) {
            missing.push(countUnidadesAero(acs) > 1
                ? `Nº Serie Aerotermia ACS — equipo ${n} (Instalación)`
                : 'Nº Serie Aerotermia ACS (Instalación)');
        }
        if (!P(acs.potencia)) missing.push('Potencia Aerotermia ACS (Instalación)');
    }

    // Emisor
    if (!P(inst.tipo_emisor)) missing.push('Tipo de Emisor (Instalación)');

    // Instalador (prescriptor)
    if (!pres) {
        missing.push('Instalador asignado (Instalación)');
    } else {
        if (!P(pres.razon_social)) missing.push('Razón Social Instalador (ficha Partner)');
        if (!P(pres.cif)) missing.push('CIF Instalador (ficha Partner)');
        if (!P(pres.nombre_responsable)) missing.push('Nombre Responsable Técnico (ficha Partner)');
        if (!P(pres.apellidos_responsable)) missing.push('Apellidos Responsable Técnico (ficha Partner)');
        if (!P(pres.nif_responsable || pres.tecnico_firmante_dni)) missing.push('NIF Responsable Técnico (ficha Partner)');
        if (!P(pres.numero_carnet_rite)) missing.push('Nº Empresa RITE (ficha Partner)');
        if (!P(pres.municipio)) missing.push('Municipio Instalador (ficha Partner)');
    }

    // Fecha de pruebas: se toma de la factura; si no hay factura, vale la fecha
    // de pruebas introducida a mano (documentacion.fecha_pruebas_cert_instalacion).
    const tieneFechaFactura = Array.isArray(doc.facturas) && doc.facturas.length && P(doc.facturas[0]?.fecha_factura);
    if (!tieneFechaFactura && !P(doc.fecha_pruebas_cert_instalacion)) {
        missing.push('Fecha de Factura o Fecha de Pruebas (Documentación)');
    }

    return missing;
}

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
    return { expPayload, instaladorPayload };
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
    let pres = null;
    const targetInstId = exp.instalacion?.instalador_id || op?.prescriptor_id || exp.instalador_asociado_id;
    if (targetInstId) {
        const { data: p } = await supabase.from('prescriptores').select('*').eq('id_empresa', targetInstId).maybeSingle();
        pres = p;
    }
    return { exp, cli, op, normalizedDatos, pres };
}

// Llama al microservicio y devuelve los ficheros [{name,mimetype,base64}].
async function generarRiteFiles(expPayload, instaladorPayload) {
    const RITE_SERVICE_URL = process.env.RITE_SERVICE_URL || 'http://localhost:8090';
    const { data } = await axios.post(
        `${RITE_SERVICE_URL}/generar-rite-json`,
        { exp: expPayload, instalador: instaladorPayload, fecha_firma: null },
        { timeout: 90000, maxBodyLength: Infinity, maxContentLength: Infinity });
    return data?.files;
}

router.post('/:id/memoria-rite/generate', enforceAuth, async (req, res) => {
    try {
        // 1) Cargar contexto (exp + cliente + oportunidad + instalador)
        const ctx = await loadRiteContext(req.params.id);
        if (!ctx) return res.status(404).json({ error: 'Expediente no encontrado' });
        const { exp, cli, op, normalizedDatos, pres } = ctx;

        // 2) Validación (defensa en profundidad; el frontend ya valida y abre el popup)
        const missing = validateMemoriaRite({ exp, cli, op: { ...op, datos_calculo: normalizedDatos }, pres });
        if (missing.length > 0) {
            return res.status(422).json({ error: 'Faltan datos para generar la Memoria RITE', missing });
        }

        // 3) Generar vía microservicio
        const { expPayload, instaladorPayload } = buildRitePayloads({ exp, cli, op, normalizedDatos, pres });
        let files;
        try {
            files = await generarRiteFiles(expPayload, instaladorPayload);
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
        for (const f of files) {
            const buffer = Buffer.from(f.base64, 'base64');

            // Versionado: si ya existe un fichero con ese nombre, moverlo a OLD
            // como `{base}_OLD`, `{base}_OLD1`, `{base}_OLD2`…
            const existingId = await findFileByName(riteFolderId, f.name);
            if (existingId) await archiveExistingToOld(riteFolderId, existingId, f.name);

            const result = await saveFileToFolder(riteFolderId, f.name, f.mimetype, buffer);
            if (!result) return res.status(500).json({ error: `Error al subir '${f.name}' a Drive` });
            try { await setFolderPublic(result.id, 'reader'); } catch (e) { /* no bloqueante */ }

            // Distinguir por nombre: memoria .docx, memoria .pdf, guía JE6, borrador.
            const name = (f.name || '').toUpperCase();
            if (name.endsWith('.DOCX')) memoriaLink = result.link;
            else if (name.includes('BORRADOR_CERTIFICADO')) borradorLink = result.link;
            else if (name.includes('GUIA_JE6')) guiaLink = result.link;
            else if (name.includes('MEMORIA_RITE') && name.endsWith('.PDF')) memoriaPdfLink = result.link;
        }

        if (!memoriaLink) return res.status(500).json({ error: 'No se obtuvo el enlace de la Memoria RITE' });

        return res.json({
            cert_rite_drive_link: memoriaLink,
            memoria_rite_pdf_link: memoriaPdfLink,
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
        const { exp, cli, op, normalizedDatos, pres } = ctx;
        if (!pres) return res.status(400).json({ error: 'El expediente no tiene instalador asignado' });

        // Destinatarios. Si el frontend manda `recipients` (varios contactos elegidos
        // en el popup), se envía a todos. Compatibilidad: `to`/`phone` = un solo
        // destinatario; si no llega nada, fallback al contacto del prescriptor.
        const useContact = pres.contacto_notificaciones_activas === true || pres.contacto_notificaciones_activas === 'true';
        let destinatarios;
        if (Array.isArray(recipients) && recipients.length) {
            destinatarios = recipients.map(r => ({
                nombre: (r?.nombre || '').toString().trim(),
                email: (r?.email || '').toString().trim(),
                tlf: (r?.phone || r?.tlf || '').toString().trim(),
            }));
        } else {
            const instEmail = ((to || (useContact ? (pres.email_contacto || pres.email) : pres.email)) || '').trim();
            const instTlf = ((phone || (useContact ? (pres.tlf_contacto || pres.tlf || pres.telefono) : (pres.tlf || pres.telefono))) || '').trim();
            destinatarios = [{
                nombre: useContact ? (pres.nombre_contacto || pres.razon_social || '') : (pres.nombre_responsable || pres.razon_social || ''),
                email: instEmail, tlf: instTlf,
            }];
        }

        // Generar ficheros frescos vía microservicio
        const { expPayload, instaladorPayload } = buildRitePayloads({ exp, cli, op, normalizedDatos, pres });
        let files;
        try {
            files = await generarRiteFiles(expPayload, instaladorPayload);
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
                        const safeMsg = (message || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                        const html = `
                          <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;border:1px solid #eee;border-radius:12px;overflow:hidden">
                            <div style="background:linear-gradient(135deg,#f59e0b,#ea580c);padding:24px 28px;color:#fff">
                              <h1 style="margin:0;font-size:20px;letter-spacing:.5px">BROKERGY</h1>
                              <p style="margin:4px 0 0;font-size:12px;opacity:.9">Ingeniería Energética · Documentación RITE</p>
                            </div>
                            <div style="padding:24px 28px;color:#222;font-size:14px;line-height:1.6;white-space:pre-wrap">${safeMsg}</div>
                            <div style="padding:0 28px 24px;color:#555;font-size:12px">
                              📎 Adjuntos: <b>Memoria Técnica RITE</b> (Word${memoriaPdf ? ' y PDF' : ''}) y <b>Borrador del Certificado de Instalación Térmica</b> (PDF).
                            </div>
                          </div>`;
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
        const { expPayload, instaladorPayload } = buildRitePayloads({ exp, cli, op, normalizedDatos, pres });
        let files;
        try {
            files = await generarRiteFiles(expPayload, instaladorPayload);
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
            const out = { xml: null, pdf: null, cex: null, registro: null, etiqueta: null, otros: [] };
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
router.post('/:id/notify-certificador', enforceAuth, async (req, res) => {
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

        // ── Envío de comunicaciones ──────────────────────────────────────────────
        const channels = [];
        const phaseLabel = phase === 'final' ? 'CEE Final' : 'CEE Inicial';
        const templateLabels = { standard: 'Encargo', reminder: 'Recordatorio', urgent: 'Urgente' };

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

                let waMsg = '';
                if (customMessage) {
                    // El admin ha editado el texto (suele incluir ya el enlace de la carpeta). Solo
                    // añadimos el enlace de la carpeta si el cuerpo no trae ninguna URL, y la firma.
                    const hasUrl = /https?:\/\//i.test(customMessage);
                    const carpetaWa = (ceeFolderLink && !hasUrl) ? `\n\n📁 Carpeta de documentos:\n${ceeFolderLink}` : '';
                    waMsg = `${customMessage}${carpetaWa}\n\n*BROKERGY · Ingeniería Energética*`;
                } else if (template === 'reminder') {
                    waMsg = `¡Hola *${certName}*! 👋\n\nTe recordamos que tienes pendiente el *${phaseLabel}* del expediente *${expedienteNum}*${clienteName ? ` (${clienteName})` : ''}.\n\n¿Podrías darnos una estimación de fecha de entrega?${adminMsgWa}\n\n${ceeFolderLink ? '📁 Carpeta: ' + ceeFolderLink + '\n' : ''}${portalLink ? '🔗 Portal: ' + portalLink + '\n' : ''}\n¡Gracias!\n*BROKERGY · Ingeniería Energética*`;
                } else if (template === 'urgent') {
                    waMsg = `*⚠️ AVISO URGENTE*\n\nHola *${certName}*, necesitamos con urgencia el *${phaseLabel}* del expediente *${expedienteNum}*${clienteName ? ` (${clienteName})` : ''}.\n\nEs importante que lo priorices para cumplir con los plazos del programa.${adminMsgWa}\n\n${ceeFolderLink ? '📁 Carpeta: ' + ceeFolderLink + '\n' : ''}${portalLink ? '🔗 Portal: ' + portalLink + '\n' : ''}\nQuedamos a la espera.\n*BROKERGY · Ingeniería Energética*`;
                } else if (phase === 'final') {
                    waMsg = `${urgentWaPrefix}¡Hola *${certName}*! 👋\n\nYa puedes presentar el *CEE FINAL* del expediente *${expedienteNum}*${clienteName ? ` (${clienteName})` : ''}.\n\nToda la documentación de obra ya está en la carpeta compartida.${adminMsgWa}\n\n${ceeFolderLink ? '📁 Carpeta: ' + ceeFolderLink + '\n' : ''}${portalLink ? '🔗 Portal: ' + portalLink + '\n' : ''}\n¡Gracias!\n*BROKERGY · Ingeniería Energética*`;
                } else {
                    waMsg = `${urgentWaPrefix}¡Hola *${certName}*! 👋\n\nTe hemos asignado el expediente *${expedienteNum}*${clienteName ? ` (${clienteName})` : ''} para el *CEE Inicial*.\n\nTienes toda la documentación en la carpeta y el portal.${adminMsgWa}\n\n${ceeFolderLink ? '📁 Carpeta: ' + ceeFolderLink + '\n' : ''}${portalLink ? '🔗 Portal: ' + portalLink + '\n' : ''}\n¡Gracias!\n*BROKERGY · Ingeniería Energética*`;
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
                const userName = req.user?.rol_nombre === 'ADMIN'
                    ? 'ADMINISTRADOR'
                    : (req.user?.acronimo || req.user?.razon_social || 'SISTEMA');

                const priorityTag = priority === 'urgent' ? ' · 🚨 URGENTE' : '';
                const sentBody = customMessage || adminMessage;
                const msgTag = sentBody ? `\n💬 Mensaje: "${sentBody}"` : '';
                historial.push({
                    id: Date.now().toString() + '_certnotif',
                    tipo: 'notificacion_certificador',
                    texto: `Notificación ${phaseLabel} (${templateLabels[template] || 'Estándar'}${priorityTag}) enviada a ${certName} vía ${channels.join(' + ')}${msgTag}`,
                    fecha: new Date().toISOString(),
                    usuario: userName,
                    priority,
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
            texto: `BROKERGY ha revisado y dado el VISTO BUENO al ${phaseLabel}. Se autoriza su registro en Industria.${bodyMsg ? ` Nota: ${bodyMsg}` : ''}`,
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
                    { presentFolderLink, ceeUploadLink, attachments, clienteData: clienteDataAp }
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
                    : `✅ *Visto bueno* — ${phaseLabel}\n\nHola ${certName}, ya tienes luz verde para registrar el ${phaseLabel} del expediente ${exp.numero_expediente} en Industria.${expedienteWa}${ceeLinksBlock}\n\n*BROKERGY · Ingeniería Energética*`;
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
// Body: { base64: string, type: 'cal'|'acs', numexpte?: string }
router.post('/:id/fichas-tecnicas/upload', enforceAuth, async (req, res) => {
    const { base64, type, numexpte } = req.body;
    if (!base64 || !type) return res.status(400).json({ error: 'Faltan campos requeridos.' });
    console.log(`[FT] Subiendo ficha técnica tipo=${type} para expediente ${req.params.id} (base64 len=${base64.length})`);

    try {
        const { data: exp, error: expErr } = await supabase
            .from('expedientes')
            .select('id, oportunidad_id, numero_expediente, documentacion')
            .eq('id', req.params.id)
            .single();
        if (expErr || !exp) return res.status(404).json({ error: 'Expediente no encontrado' });
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
        const suffix = type === 'acs' ? 'ACS' : 'CALEFACCION';
        const fileName = `${expteNum} - FT AEROTERMIA ${suffix}.pdf`;

        const fileBuffer = Buffer.from(base64.split(',')[1] || base64, 'base64');
        // Debug: verificar que el buffer empieza con %PDF-
        const headerBytes = fileBuffer.slice(0, 8).toString('utf8');
        console.log(`[FT] Buffer subida: ${fileBuffer.length} bytes, header="${headerBytes}" (debe empezar por %PDF-)`);
        const result = await saveFileToFolder(ftFolderId, fileName, 'application/pdf', fileBuffer);
        if (!result) return res.status(500).json({ error: 'Error al subir a Drive.' });

        const linkField = type === 'acs' ? 'ft_aerotermia_acs_link' : 'ft_aerotermia_cal_link';
        const idField   = type === 'acs' ? 'ft_aerotermia_acs_id'   : 'ft_aerotermia_cal_id';
        const docObj = { ...(exp.documentacion || {}), [linkField]: result.link, [idField]: result.id };
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
    const { type } = req.params; // 'cal' | 'acs'
    const wantInfo = req.query.info === '1' || req.query.info === 'true';
    try {
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

        const suffix = type === 'acs' ? 'ACS' : 'CALEFACCION';
        const fileName = `${exp.numero_expediente} - FT AEROTERMIA ${suffix}.pdf`;
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
// Body: { type: 'cal'|'acs', force?: boolean }
// Responde 200 { link, driveId, copied, source } o 400 { error, model? }
router.post('/:id/fichas-tecnicas/auto-copy', enforceAuth, async (req, res) => {
    const { type, force } = req.body;
    if (!['cal', 'acs'].includes(type)) {
        return res.status(400).json({ error: 'bad_type', message: 'type debe ser cal o acs' });
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

        // Resolver el modelo aerotermia que aplica a este "type"
        const inst = exp.instalacion || {};
        let aeroNode;
        if (type === 'cal') {
            aeroNode = inst.aerotermia_cal;
        } else {
            // Para ACS: si misma_aerotermia_acs, usar el de calefacción
            aeroNode = inst.misma_aerotermia_acs ? inst.aerotermia_cal : inst.aerotermia_acs;
        }
        const aeroDbId = aeroNode?.aerotermia_db_id;
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

        const suffix = type === 'acs' ? 'ACS' : 'CALEFACCION';
        const fileName = `${exp.numero_expediente} - FT AEROTERMIA ${suffix}.pdf`;

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

        const linkField = type === 'acs' ? 'ft_aerotermia_acs_link' : 'ft_aerotermia_cal_link';
        const idField   = type === 'acs' ? 'ft_aerotermia_acs_id'   : 'ft_aerotermia_cal_id';
        const docObj = { ...(exp.documentacion || {}), [linkField]: result.link, [idField]: result.id };
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
        const vistoBuenoMsg = `¡Hola ${tecnico}! 👋\n\nHemos revisado el ${phaseLabel} del expediente ${exp.numero_expediente}${cliProper} y tiene nuestro visto bueno. Ya puedes proceder a registrarlo en Industria.${expedienteLink}${ceeLinksBlock}\n\n¡Gracias!`;

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

module.exports = router;
// Expuesto para pruebas y para quien necesite el barrido sin pasar por HTTP
// (p. ej. el MCP al responder "qué falta en el expediente NNN").
module.exports.buildChecklistData = buildChecklistData;
