// ═══════════════════════════════════════════════════════════════════════════════
// LA OFERTA DEL VERIFICADOR, sola: de beCAE al lote y del lote al Sujeto Obligado.
// Ver docs/conocimiento/lotes/la-api-de-marwen-v1-6.md («La oferta, sola»).
//
// Cuando Marwen emite la oferta de un lote enviado por API, la deja en los
// documentos de la solicitud en beCAE (tipo `oferta`) y manda un correo. beCAE no
// tiene webhooks, así que:
//   · Cada INTERVALO_MS se mira beCAE para los lotes CANDIDATOS: con solicitud de
//     beCAE (`verificacion_api.num_solicitud`) y SIN oferta en el lote.
//   · El correo de Marwen que habla de una oferta (en el buzón de los firmados,
//     `LOTE_SO_SMTP_*`, solo lectura) adelanta esa mirada: es solo el AVISO; el PDF
//     que cuenta es el de beCAE.
//
// Lo que hace con una oferta nueva es lo MISMO que haría una persona:
//   1. TRAER: `subirDocumentoLote(…, 'oferta_verificacion')` de routes/lotes.js —
//      la lógica de la ruta `POST /:id/documentos/:slot`, no una copia—: Drive con
//      su nombre canónico, importe leído a `coste_verificacion`, historial, estado.
//   2. ENVIAR: `enviarDocumentoLote(…)` — la de `POST /:id/enviar-documento/:key`—
//      con el texto de `frontend/…/lotes/logic/mensajesDocLote.js`, el mismo que
//      sale en el modal al cargarla a mano. Al contacto de notificaciones del S.O.,
//      con copia a Brokergy, solo por email (como el modal por defecto).
//
// NO se envía (se avisa al admin por WhatsApp y email, y lo manda una persona):
//   · si no se ha leído el importe, o el lector ha dejado avisos;
//   · si el S.O. no tiene email de notificaciones;
//   · si la oferta ya consta enviada (`sent_at`): nunca se le manda dos veces.
//
// Nace APAGADO (OFERTA_VERIFICADOR_AUTO != 'true'): local escribe en PRODUCCIÓN y
// esto le escribe al Sujeto Obligado. `revisarOfertas({ dryRun: true })` dice lo
// que haría sin escribir ni mandar nada.
//
// LA SOLICITUD, sola (18/11/2026, Fran: «automatízalo», regla 222). Con su propio
// interruptor (SOLICITUD_SO_AUTO, nace APAGADO). Para el lote con solicitud de beCAE
// que aún no ha salido al S.O. (fase 2):
//   1. Si el lote no tiene la solicitud del verificador, se TRAE de beCAE
//      (`traerSolicitudDeBecae`, la misma de `GET /:id/marwen`).
//   2. Se ESPERA `ESPERA_SOLICITUD_MS` desde que la solicitud llegó al lote: casi
//      siempre llega segundos después de pulsar «Enviar por API», con Fran delante
//      y el popup «¿La enviamos al S.O.?» abierto; si la manda él, va con su firma
//      de Proveedor en el Anexo I. El automático solo cubre lo que se quedó sin mandar.
//   3. ENVIAR = `enviarAlSo(…)`, la de `POST /:id/enviar-so`, con los documentos y
//      el texto de `frontend/…/lotes/logic/envioSoDocs.js`, los MISMOS del popup.
//      **El Anexo I va SIN la firma de Brokergy** (el servidor no tiene el
//      certificado): decidido por Fran el 18/11/2026; se contrafirma a la vuelta con
//      `scripts/contrafirmar_anexo_i_lote.js`. Mes en curso, fecha del convenio por
//      defecto, firma el apoderado PRINCIPAL y sin aviso por WhatsApp (como el popup
//      por defecto).
//   Se RETIENE (y se avisa UNA vez por solicitud) si falta el email del S.O., la
//   oferta del lote (€/MWh, columna Precio), alguna ficha o el ahorro de alguna fila.
//
// LA OFERTA FIRMADA, a beCAE (18/11/2026, Fran: «automatiza también la subida de la
// oferta firmada», regla 223). Con su interruptor (OFERTA_FIRMADA_BECAE_AUTO, nace
// APAGADO). Subirla ES ACEPTAR la oferta. Para el lote con solicitud de beCAE cuya
// oferta ha vuelto FIRMADA por el S.O. (`signed_file_id`) y aún no se ha subido:
//   · por `subirABecae(…, 'oferta_firmada')`, la MISMA del botón «⬆ Aceptar la
//     oferta en beCAE» (primero en seco, luego de verdad);
//   · solo si la firmada es la de la oferta VIGENTE en beCAE (la última): su nombre
//     original casa con el de beCAE. Si Marwen emitió otra después, se retiene;
//   · pasada `ESPERA_OFERTA_FIRMADA_MS` desde que se registró la firmada, por si la
//     sube una persona;
//   · se avisa a Fran de que queda aceptada (o de por qué no se ha subido, una vez).
// ═══════════════════════════════════════════════════════════════════════════════
const path = require('path');
const { pathToFileURL } = require('url');
const supabase = require('./supabaseClient');
const marwenService = require('./marwenService');

const INTERVALO_MS = 15 * 60 * 1000;
const INTERVALO_CORREO_MS = 5 * 60 * 1000;
const USUARIO = 'BECAE AUTO';
const SLOT = 'oferta_verificacion';

const ESPERA_SOLICITUD_MS = 60 * 60 * 1000;

const activo = () => String(process.env.OFERTA_VERIFICADOR_AUTO || '').toLowerCase() === 'true';
const activoSolicitud = () => String(process.env.SOLICITUD_SO_AUTO || '').toLowerCase() === 'true';
const activoOfertaFirmada = () => String(process.env.OFERTA_FIRMADA_BECAE_AUTO || '').toLowerCase() === 'true';
const ESPERA_OFERTA_FIRMADA_MS = 30 * 60 * 1000;
const nowIso = () => new Date().toISOString();
const adminPhone = () => process.env.WHATSAPP_ADMIN_CHAT || '34623926179';
const adminEmail = () => process.env.ADMIN_EMAIL || 'franciscojavier.moya.s2e2@gmail.com';
const APP_BASE = (process.env.FRONTEND_URL && /^https:\/\//i.test(process.env.FRONTEND_URL)
    ? process.env.FRONTEND_URL : 'https://app.brokergy.es').replace(/\/+$/, '');

// Fuente única de los textos y los contactos del S.O. (ESM del frontend).
let _logica = null;
const logica = () => (_logica ||= Promise.all([
    import(pathToFileURL(path.join(__dirname, '../../frontend/src/features/lotes/logic/mensajesDocLote.js')).href),
    import(pathToFileURL(path.join(__dirname, '../../frontend/src/features/lotes/logic/soContactos.js')).href),
    import(pathToFileURL(path.join(__dirname, '../../frontend/src/features/lotes/logic/envioSoDocs.js')).href),
    import(pathToFileURL(path.join(__dirname, '../../frontend/src/features/lotes/logic/docEnvio.js')).href),
    import(pathToFileURL(path.join(__dirname, '../../frontend/src/features/lotes/logic/loteProceso.js')).href),
]).then(([m, c, e, d, p]) => ({ ...m, ...c, ...e, docParaEnvio: d.docParaEnvio, docTieneContenido: d.docTieneContenido, analizarProceso: p.analizarProceso, solicitudValida: p.solicitudValida, solicitudGeneradaPorApp: p.solicitudGeneradaPorApp })));

// Require diferido: routes/lotes.js arrastra media app y este servicio se carga al
// arrancar el servidor.
const rutasLotes = () => require('../routes/lotes');

/**
 * ¿Sale sola? Pura (la prueban los tests). `documento` es la entrada que deja la
 * subida; `ocr`, lo que devolvió el lector; `notifyEmail`, el del S.O.
 * Devuelve `{ enviar, motivos[] }`.
 */
function decidirEnvio({ documento, ocr, notifyEmail }) {
    const motivos = [];
    if (!documento) motivos.push('la oferta no ha quedado en el lote');
    if (documento?.sent_at) motivos.push(`ya consta enviada (${documento.sent_at})`);
    if (!(Number(documento?.importe) > 0)) motivos.push('no se ha leído el importe de la oferta');
    if (ocr && ocr.leido === false) motivos.push(`el lector no ha podido leerla${ocr.error ? ` (${ocr.error})` : ''}`);
    const avisos = Array.isArray(ocr?.avisos) ? ocr.avisos.filter(Boolean) : [];
    if (avisos.length) motivos.push(`el lector ha dejado avisos: ${avisos.join(' · ')}`);
    if (!notifyEmail) motivos.push('el Sujeto Obligado no tiene email de notificaciones');
    return { enviar: motivos.length === 0, motivos };
}

/** Lotes con solicitud de beCAE y sin oferta todavía. Solo lee columnas pequeñas. */
async function candidatos({ lote: soloLote = null } = {}) {
    let q = supabase.from('lotes')
        .select('id, codigo, estado, verificacion_api, documentos_so')
        .not('verificacion_api->>num_solicitud', 'is', null);
    if (soloLote) q = q.eq('codigo', String(soloLote).toUpperCase());
    const { data, error } = await q;
    if (error) throw new Error(`lotes: ${error.message}`);
    return (data || []).map(l => ({
        ...l,
        num_solicitud: String(l.verificacion_api?.num_solicitud || '').trim() || null,
        oferta: (l.documentos_so || []).find(d => d?.key === SLOT) || null,
    }));
}

function textoAviso(inf) {
    const imp = Number(inf.importe) > 0 ? `${Number(inf.importe).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € (base)` : 'sin leer';
    if (inf.accion === 'enviada') {
        return {
            titulo: `Oferta de verificación enviada al S.O. — ${inf.lote}`,
            texto: [
                `Oferta de verificación del ${inf.lote} traída de beCAE y enviada al Sujeto Obligado.`,
                `Importe: ${imp}.`,
                `Para: ${inf.to}${inf.cc?.length ? ` (cc: ${inf.cc.join(', ')})` : ''}.`,
                ...(inf.warnings?.length ? ['', `Avisos del envío: ${inf.warnings.join(' · ')}`] : []),
                '', `${APP_BASE}?tab=lotes`,
            ].join('\n'),
        };
    }
    return {
        titulo: `Oferta de verificación sin enviar — ${inf.lote}`,
        texto: [
            `La oferta de verificación del ${inf.lote} ya está en el lote (traída de beCAE), pero NO se ha enviado al Sujeto Obligado:`,
            ...inf.motivos.map(m => `- ${m}`),
            `Importe: ${imp}.`,
            '', 'Revísala y mándala desde la fase 3 del lote.',
            `${APP_BASE}?tab=lotes`,
        ].join('\n'),
    };
}

async function avisarAdmin(inf) {
    const { titulo, texto } = textoAviso(inf);
    try { await require('./whatsappService').sendText(adminPhone(), texto); }
    catch (e) { console.warn('[OfertaAuto] aviso WhatsApp:', e.message); }
    try {
        const emailService = require('./emailService');
        await emailService.sendMail({
            to: adminEmail(),
            from: process.env.ALERT_EMAIL_FROM || emailService.getFallbackSender() || undefined,
            subject: titulo,
            text: texto,
            html: `<pre style="font-family:system-ui,sans-serif;white-space:pre-wrap">${texto.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</pre>`,
        });
    } catch (e) { console.warn('[OfertaAuto] aviso email:', e.message); }
}

// Lo decidido se sella en `verificacion_api.oferta_auto`: qué documento de beCAE se
// trajo y qué se hizo con él. Releído justo antes para no pisar otra escritura.
async function sellar(loteId, datos) {
    const { data } = await supabase.from('lotes').select('verificacion_api').eq('id', loteId).maybeSingle();
    const api = data?.verificacion_api || {};
    await supabase.from('lotes').update({
        verificacion_api: { ...api, oferta_auto: { ...(api.oferta_auto || {}), ...datos } },
        updated_at: nowIso(),
    }).eq('id', loteId);
}

/**
 * Mira beCAE para cada candidato y trae (y, si procede, envía) la oferta.
 * `dryRun` (por defecto) no escribe ni manda: dice lo que haría.
 * `avisos` manda el aviso al admin (por defecto, si no es en seco).
 * Devuelve un informe por lote.
 */
async function revisarOfertas(opts = {}) {
    const { dryRun = true, lote: soloLote = null } = opts;
    const avisos = opts.avisos ?? !dryRun;
    if (!marwenService.isConfigured()) throw new Error('Falta MARWEN_API_KEY: no se puede consultar beCAE');

    const informes = [];
    for (const c of await candidatos({ lote: soloLote })) {
        const inf = { lote: c.codigo, num_solicitud: c.num_solicitud, accion: null, motivos: [] };
        informes.push(inf);
        if (c.oferta) {
            inf.accion = 'nada';
            inf.motivos.push(c.oferta.sent_at ? 'la oferta ya está en el lote y enviada al S.O.' : 'la oferta ya está en el lote');
            continue;
        }
        if (!c.num_solicitud) { inf.accion = 'nada'; inf.motivos.push('sin nº de solicitud de beCAE'); continue; }

        let docs;
        try { docs = await marwenService.documentos(c.num_solicitud); }
        catch (e) {
            if (e.status === 503 || e.status === 504) throw e;   // beCAE caído: se reintenta en la próxima
            inf.accion = 'error'; inf.motivos.push(`beCAE: ${e.message}`); continue;
        }
        const ofertas = docs.filter(d => d?.type === 'oferta');
        if (!ofertas.length) { inf.accion = 'nada'; inf.motivos.push('beCAE aún no ofrece la oferta'); continue; }
        if (docs.some(d => d?.type === 'oferta_firmada')) {
            inf.accion = 'nada'; inf.motivos.push('en beCAE ya está la oferta firmada'); continue;
        }
        // Si hay varias, la última (beCAE las lista por orden de alta).
        const of = ofertas[ofertas.length - 1];
        inf.oferta_becae = { id: of.id, name: of.name };
        if (String(c.verificacion_api?.oferta_auto?.doc_id || '') === String(of.id)) {
            inf.accion = 'nada'; inf.motivos.push('esa oferta de beCAE ya se trajo (y se quitó del lote a mano)'); continue;
        }

        if (dryRun) { inf.accion = 'en_seco'; inf.motivos.push('traería la oferta de beCAE y decidiría el envío'); continue; }

        try {
            const f = await marwenService.descargarDocumento(c.num_solicitud, of.id);
            if (!/pdf/i.test(f.contentType) && f.buffer.slice(0, 4).toString() !== '%PDF') {
                inf.accion = 'error'; inf.motivos.push(`beCAE no ha devuelto un PDF (${f.contentType})`); continue;
            }
            const { subirDocumentoLote, enviarDocumentoLote } = rutasLotes();
            const sub = await subirDocumentoLote(c.id, SLOT, {
                buffer: f.buffer, fileName: f.nombre || of.name || null, usuario: USUARIO,
            });
            inf.importe = sub.documento?.importe ?? null;
            await sellar(c.id, { doc_id: of.id, traida_at: nowIso() });

            const L = await logica();
            const lote = sub.lote;
            const { notifyEmail } = L.deriveSoEnvio(lote?.sujeto_obligado || {});
            const dec = decidirEnvio({ documento: sub.documento, ocr: sub.ocr, notifyEmail });
            inf.motivos = dec.motivos;
            if (!dec.enviar) {
                inf.accion = 'retenida';
                await sellar(c.id, { retenida_at: nowIso(), motivos: dec.motivos });
                if (avisos) await avisarAdmin(inf);
                continue;
            }

            const cc = [L.CC_BROKERGY].filter(e => e && e !== notifyEmail);
            const env = await enviarDocumentoLote(c.id, sub.documento.key, {
                to: notifyEmail, cc, channels: { email: true, whatsapp: false },
                customMessage: L.mensajeDocLote(lote, sub.documento),
                usuario: USUARIO, noReenviar: true,
            });
            Object.assign(inf, { accion: 'enviada', to: notifyEmail, cc, warnings: env.warnings || [] });
            await sellar(c.id, { enviada_at: nowIso(), to: notifyEmail });
            if (avisos) await avisarAdmin(inf);
        } catch (e) {
            inf.accion = 'error'; inf.motivos.push(e.message);
            console.error(`[OfertaAuto] ${c.codigo}:`, e.message);
            if (avisos) await avisarAdmin({ ...inf, motivos: [`fallo al traerla o enviarla: ${e.message}`] });
        }
    }
    return informes;
}

// ═══ LA SOLICITUD → Anexo I + fichas + solicitud al S.O. (regla 222) ═══════════

/**
 * ¿Sale sola la fase 2? Pura (la prueban los tests).
 * `lote` = el lote COMPLETO (`loteCompleto`); `docs` = los de `docsEnvioSo`;
 * `totales` = los del Anexo I; `ahora` en ms.
 */
function decidirEnvioSo({ lote, docs, totales, notifyEmail, solicitud, solicitudOk, yaEnviado, ahora = Date.now(), espera = ESPERA_SOLICITUD_MS, tieneContenido = d => !!(d?.html || d?.pdfBase64 || d?.formulario) }) {
    const motivos = [];
    if (yaEnviado) motivos.push('el lote ya se envió al S.O.');
    if (!solicitudOk) motivos.push('el lote no tiene la solicitud descargada del verificador');
    const nExp = (lote?.expedientes || []).length;
    if (!nExp) motivos.push('el lote no tiene expedientes');
    if (!notifyEmail) motivos.push('el Sujeto Obligado no tiene email de notificaciones');
    if (!(Number(lote?.oferta_lote) > 0)) motivos.push('el lote no tiene la Oferta lote (€/MWh): la columna Precio del Anexo I saldría vacía');
    const vacios = (docs || []).filter(d => !tieneContenido(d));
    if (vacios.length) motivos.push(`no se ha podido preparar: ${vacios.map(d => d.label || d.fileName).join(', ')}`);
    if (nExp && (docs || []).filter(d => d.tipo === 'ficha_res').length !== nExp) motivos.push('no hay una ficha por expediente');
    if (totales && (totales.numActuaciones !== nExp || !(totales.ahorroMwh > 0))) {
        motivos.push(`el Anexo I no cuadra: ${totales.numActuaciones} actuaciones y ${totales.ahorroMwh} MWh para ${nExp} expedientes`);
    }
    // La espera NO es un motivo para avisar: es dejarle el sitio a quien está delante.
    const llegada = Date.parse(solicitud?.uploaded_at || solicitud?.signed_at || '') || null;
    const esperando = !!llegada && (ahora - llegada) < espera;
    return { enviar: motivos.length === 0 && !esperando, esperando, motivos };
}

function textoAvisoSo(inf) {
    const app = `${APP_BASE}?tab=lotes`;
    if (inf.accion === 'enviada') {
        return {
            titulo: `Anexo I, fichas y solicitud enviados al S.O. — ${inf.lote}`,
            texto: [
                `La solicitud del ${inf.lote} llegó de beCAE y se ha enviado al Sujeto Obligado el Anexo I, ${inf.fichas} ficha(s) RES y la solicitud para que los firme.`,
                `Para: ${inf.to}${inf.cc?.length ? ` (cc: ${inf.cc.join(', ')})` : ''}.`,
                '', 'El Anexo I va SIN tu firma de Proveedor: cuando el S.O. lo devuelva firmado, hay que contrafirmarlo (contrafirmar_anexo_i_lote.js).',
                ...(inf.warnings?.length ? ['', `Avisos del envío: ${inf.warnings.join(' · ')}`] : []),
                '', app,
            ].join('\n'),
        };
    }
    return {
        titulo: `Solicitud de beCAE sin enviar al S.O. — ${inf.lote}`,
        texto: [
            `La solicitud del ${inf.lote} ya está en el lote (de beCAE), pero NO se ha enviado al Sujeto Obligado:`,
            ...inf.motivos.map(m => `- ${m}`),
            '', 'Revísalo y mándalo desde la fase 2 del lote («Anexo I» → «Enviar al S.O.»).',
            app,
        ].join('\n'),
    };
}

async function avisarAdminTexto({ titulo, texto }) {
    try { await require('./whatsappService').sendText(adminPhone(), texto); }
    catch (e) { console.warn('[SolicitudAuto] aviso WhatsApp:', e.message); }
    try {
        const emailService = require('./emailService');
        await emailService.sendMail({
            to: adminEmail(),
            from: process.env.ALERT_EMAIL_FROM || emailService.getFallbackSender() || undefined,
            subject: titulo, text: texto,
            html: `<pre style="font-family:system-ui,sans-serif;white-space:pre-wrap">${texto.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</pre>`,
        });
    } catch (e) { console.warn('[SolicitudAuto] aviso email:', e.message); }
}

async function sellarSolicitud(loteId, datos) {
    const { data } = await supabase.from('lotes').select('verificacion_api').eq('id', loteId).maybeSingle();
    const api = data?.verificacion_api || {};
    await supabase.from('lotes').update({
        verificacion_api: { ...api, solicitud_auto: { ...(api.solicitud_auto || {}), ...datos } },
        updated_at: nowIso(),
    }).eq('id', loteId);
}

// Identidad de la solicitud que hay en el lote: el aviso de «retenida» sale UNA vez
// por solicitud, no cada 15 minutos.
const idSolicitud = (s) => String(s?.draft_file_id || s?.uploaded_at || '');

/**
 * Para cada lote con solicitud de beCAE que aún no salió al S.O.: trae la solicitud
 * si falta y, pasada la espera, envía el Anexo I, las fichas y la solicitud.
 * `dryRun` (por defecto) no escribe ni manda: dice lo que haría.
 */
async function revisarSolicitudes(opts = {}) {
    const { dryRun = true, lote: soloLote = null, ahora = Date.now() } = opts;
    const avisos = opts.avisos ?? !dryRun;
    if (!marwenService.isConfigured()) throw new Error('Falta MARWEN_API_KEY: no se puede consultar beCAE');
    const L = await logica();

    const informes = [];
    for (const c of await candidatos({ lote: soloLote })) {
        const inf = { lote: c.codigo, num_solicitud: c.num_solicitud, accion: null, motivos: [] };
        informes.push(inf);
        const proc = L.analizarProceso(c);
        if (proc.soEnviado) { inf.accion = 'nada'; inf.motivos.push('ya se envió al S.O.'); continue; }
        if (!c.num_solicitud) { inf.accion = 'nada'; inf.motivos.push('sin nº de solicitud de beCAE'); continue; }

        try {
            let solicitud = proc.solicitud;
            // 1) Traerla si falta (mismas condiciones que GET /:id/marwen).
            if (!proc.solicitudOk) {
                if (solicitud?.signed_link || solicitud?.sent_at) {
                    inf.accion = 'nada'; inf.motivos.push('la solicitud del lote es la de la app y ya salió: lo decide una persona'); continue;
                }
                if (dryRun) { inf.accion = 'en_seco'; inf.motivos.push('traería la solicitud de beCAE (si la ofrece) y esperaría antes de enviar'); continue; }
                const r = await rutasLotes().traerSolicitudDeBecae(c, c.num_solicitud, { usuario: USUARIO });
                if (!r?.archivada) { inf.accion = 'nada'; inf.motivos.push(`solicitud no traída: ${r?.motivo || 'sin motivo'}`); continue; }
                inf.solicitud_traida = true;
                solicitud = r.documento || null;
            }

            // 2) El lote COMPLETO, como lo ve la ficha, y lo que mandaría el popup.
            const lote = await rutasLotes().loteCompleto(c.id);
            const so = lote?.sujeto_obligado || {};
            const { notifyEmail } = L.deriveSoEnvio(so);
            const firmante = L.representanteElegido(so, 'principal');
            const docs = L.docsEnvioSo(lote, { repNombre: firmante?.nombre || undefined, repNif: firmante?.nif || undefined });
            const totales = L.totalesAnexo(lote);
            const procLote = L.analizarProceso(lote);
            solicitud = procLote.solicitud || solicitud;
            const dec = decidirEnvioSo({
                lote, docs, totales, notifyEmail, solicitud, ahora,
                solicitudOk: procLote.solicitudOk, yaEnviado: procLote.soEnviado,
                tieneContenido: L.docTieneContenido,
            });
            Object.assign(inf, { fichas: docs.filter(d => d.tipo === 'ficha_res').length, to: notifyEmail, firmante: firmante?.nombre || null });
            inf.motivos = dec.motivos;
            if (dec.esperando && !dec.motivos.length) {
                inf.accion = 'esperando';
                inf.motivos = [`la solicitud llegó hace ${Math.round((ahora - Date.parse(solicitud.uploaded_at || solicitud.signed_at)) / 60000)} min: se espera ${Math.round(ESPERA_SOLICITUD_MS / 60000)} por si la envía una persona (con su firma)`];
                continue;
            }
            if (!dec.enviar) {
                inf.accion = 'retenida';
                const ya = c.verificacion_api?.solicitud_auto;
                const avisada = ya?.retenida_para && ya.retenida_para === idSolicitud(solicitud);
                if (!dryRun && !avisada) {
                    await sellarSolicitud(c.id, { retenida_at: nowIso(), retenida_para: idSolicitud(solicitud), motivos: dec.motivos });
                    if (avisos) await avisarAdminTexto(textoAvisoSo(inf));
                }
                continue;
            }
            if (dryRun) { inf.accion = 'en_seco'; inf.motivos = [`enviaría Anexo I + ${inf.fichas} ficha(s) + solicitud a ${notifyEmail}`]; continue; }

            // 3) Enviar por la MISMA función que el popup, con su texto y sus documentos.
            const cc = [L.CC_BROKERGY].filter(e => e && e !== notifyEmail);
            const env = await rutasLotes().enviarAlSo(c.id, {
                to: notifyEmail, cc, channels: { email: true, whatsapp: false },
                customMessage: L.mensajeEnvioSo(lote, totales),
                summaryData: { id: lote.codigo || 'LOTE', docType: 'Anexo I · Listado Cesión + Fichas RES' },
                docs: docs.map(L.docParaEnvio),
                solicitud: null, avisoWhatsApp: null,
                usuario: USUARIO, noReenviar: true,
            });
            Object.assign(inf, { accion: 'enviada', cc, warnings: env.warnings || [] });
            await sellarSolicitud(c.id, { enviada_at: nowIso(), to: notifyEmail, anexo_sin_firma_proveedor: true });
            if (avisos) await avisarAdminTexto(textoAvisoSo(inf));
        } catch (e) {
            inf.accion = 'error'; inf.motivos.push(e.message);
            console.error(`[SolicitudAuto] ${c.codigo}:`, e.message);
            if (avisos && !dryRun) await avisarAdminTexto(textoAvisoSo({ ...inf, accion: 'retenida', motivos: [`fallo al preparar o enviar: ${e.message}`] }));
        }
    }
    return informes;
}

// ═══ LA OFERTA FIRMADA → beCAE (= aceptarla, regla 223) ═════════════════════════

/** «02. V20261827_Oferta_Estandarizada_1F_fdo (1).pdf» → «02. v20261827_oferta_estandarizada_1f». */
const nombreOferta = (n) => String(n || '').toLowerCase().replace(/\.pdf$/i, '').replace(/\s*\(\d+\)\s*$/, '')
    .replace(/_fdo$/i, '').trim();

/**
 * ¿Se acepta sola la oferta en beCAE? Pura (la prueban los tests).
 * `oferta` = la entrada `oferta_verificacion` del lote; `seco` = lo que devuelve
 * `subirABecae(…, { seco: true })`; `ahora` en ms.
 * @returns {{ aceptar: boolean, esperando: boolean, nada: string|null, motivos: string[] }}
 */
function decidirAceptarOferta({ oferta, seco, ahora = Date.now(), espera = ESPERA_OFERTA_FIRMADA_MS }) {
    if (!oferta?.signed_file_id) return { aceptar: false, esperando: false, nada: 'la oferta no ha vuelto firmada', motivos: [] };
    if (seco?.ya_en_becae?.length) return { aceptar: false, esperando: false, nada: 'en beCAE ya está la oferta firmada', motivos: [] };
    const motivos = [...(seco?.bloqueo || [])];
    const ofertas = seco?.ofertas_becae || [];
    const vigente = ofertas[ofertas.length - 1] || null;
    if (!vigente) motivos.push('beCAE no tiene oferta');
    else if (!oferta.original_file_name) motivos.push(`no consta qué oferta de beCAE es la firmada (la vigente es «${vigente.name}»)`);
    else if (nombreOferta(oferta.original_file_name) !== nombreOferta(vigente.name)) {
        motivos.push(`la firmada es la de «${oferta.original_file_name}» y la vigente en beCAE es «${vigente.name}»`);
    }
    if (!seco?.ficheros?.length) motivos.push('no hay fichero que subir');
    const llegada = Date.parse(oferta.signed_at || '') || null;
    const esperando = !!llegada && (ahora - llegada) < espera;
    return { aceptar: motivos.length === 0 && !esperando, esperando, nada: null, motivos };
}

function textoAvisoOfertaFirmada(inf) {
    const app = `${APP_BASE}?tab=lotes`;
    if (inf.accion === 'aceptada') {
        return {
            titulo: `Oferta aceptada en beCAE — ${inf.lote}`,
            texto: [
                `La oferta de verificación del ${inf.lote}, firmada por el S.O., se ha subido a beCAE: queda ACEPTADA${inf.estado_solicitud ? ` (solicitud ${inf.num_solicitud}: ${inf.estado_solicitud})` : ''}.`,
                `Fichero: ${(inf.ficheros || []).join(', ')}.`,
                '', app,
            ].join('\n'),
        };
    }
    return {
        titulo: `Oferta firmada sin subir a beCAE — ${inf.lote}`,
        texto: [
            `La oferta firmada del ${inf.lote} está en el lote, pero NO se ha subido a beCAE (no está aceptada):`,
            ...inf.motivos.map(m => `- ${m}`),
            '', 'Revísala y acéptala desde «⚡ beCAE en vivo» del lote («⬆ Aceptar la oferta en beCAE»).',
            app,
        ].join('\n'),
    };
}

async function sellarOfertaFirmada(loteId, datos) {
    const { data } = await supabase.from('lotes').select('verificacion_api').eq('id', loteId).maybeSingle();
    const api = data?.verificacion_api || {};
    await supabase.from('lotes').update({
        verificacion_api: { ...api, oferta_firmada_auto: { ...(api.oferta_firmada_auto || {}), ...datos } },
        updated_at: nowIso(),
    }).eq('id', loteId);
}

/**
 * Para cada lote con solicitud de beCAE y la oferta firmada en el lote sin subir:
 * la sube a beCAE (= la acepta). `dryRun` (por defecto) solo dice lo que haría.
 */
async function revisarOfertasFirmadas(opts = {}) {
    const { dryRun = true, lote: soloLote = null, ahora = Date.now() } = opts;
    const avisos = opts.avisos ?? !dryRun;
    if (!marwenService.isConfigured()) throw new Error('Falta MARWEN_API_KEY: no se puede consultar beCAE');

    const informes = [];
    for (const c of await candidatos({ lote: soloLote })) {
        const api = c.verificacion_api || {};
        if (!c.oferta?.signed_file_id) continue;                     // sin firmada: no es candidato
        const inf = { lote: c.codigo, num_solicitud: c.num_solicitud, accion: null, motivos: [] };
        informes.push(inf);
        if (api.subidas?.oferta_firmada) { inf.accion = 'nada'; inf.motivos.push(`ya se subió a beCAE (${api.subidas.oferta_firmada.at})`); continue; }
        if (api.oferta_firmada_auto?.ya_en_becae_at) { inf.accion = 'nada'; inf.motivos.push('en beCAE ya estaba la oferta firmada'); continue; }

        try {
            let seco;
            try { seco = await rutasLotes().subirABecae(c.id, { tipo: 'oferta_firmada', seco: true, usuario: USUARIO }); }
            catch (e) {
                if (e.status === 409 && /ya est. la oferta firmada/i.test(e.message)) {
                    inf.accion = 'nada'; inf.motivos.push('en beCAE ya está la oferta firmada');
                    if (!dryRun) await sellarOfertaFirmada(c.id, { ya_en_becae_at: nowIso() });
                    continue;
                }
                if (e.status === 409) { inf.accion = 'nada'; inf.motivos.push(e.message); continue; }
                throw e;
            }
            const dec = decidirAceptarOferta({ oferta: c.oferta, seco, ahora });
            if (dec.nada) {
                inf.accion = 'nada'; inf.motivos.push(dec.nada);
                if (!dryRun && /ya est/.test(dec.nada)) await sellarOfertaFirmada(c.id, { ya_en_becae_at: nowIso() });
                continue;
            }
            inf.motivos = dec.motivos;
            inf.ficheros = (seco.ficheros || []).map(f => f.nombre);
            if (dec.esperando && !dec.motivos.length) {
                inf.accion = 'esperando';
                inf.motivos = [`la firmada se registró hace ${Math.round((ahora - Date.parse(c.oferta.signed_at)) / 60000)} min: se espera ${Math.round(ESPERA_OFERTA_FIRMADA_MS / 60000)} por si la sube una persona`];
                continue;
            }
            if (!dec.aceptar) {
                inf.accion = 'retenida';
                const avisada = api.oferta_firmada_auto?.retenida_para === c.oferta.signed_file_id;
                if (!dryRun && !avisada) {
                    await sellarOfertaFirmada(c.id, { retenida_at: nowIso(), retenida_para: c.oferta.signed_file_id, motivos: dec.motivos });
                    if (avisos) await avisarAdminTexto(textoAvisoOfertaFirmada(inf));
                }
                continue;
            }
            if (dryRun) { inf.accion = 'en_seco'; inf.motivos = [`subiría a beCAE ${inf.ficheros.join(', ')} (= aceptar la oferta)`]; continue; }

            const r = await rutasLotes().subirABecae(c.id, { tipo: 'oferta_firmada', usuario: USUARIO });
            Object.assign(inf, { accion: 'aceptada', estado_solicitud: r.estado_solicitud || null, num_solicitud: r.num_solicitud || c.num_solicitud });
            await sellarOfertaFirmada(c.id, { aceptada_at: nowIso(), estado_solicitud: r.estado_solicitud || null });
            if (avisos) await avisarAdminTexto(textoAvisoOfertaFirmada(inf));
        } catch (e) {
            if (e.status === 503 || e.status === 504) throw e;        // beCAE caído: en la próxima
            inf.accion = 'error'; inf.motivos.push(e.message);
            console.error(`[OfertaFirmadaAuto] ${c.codigo}:`, e.message);
            if (avisos && !dryRun) await avisarAdminTexto(textoAvisoOfertaFirmada({ ...inf, accion: 'retenida', motivos: [`fallo al subirla: ${e.message}`] }));
        }
    }
    return informes;
}

let revisando = false;
async function barrer(motivo = 'consulta periódica') {
    if ((!activo() && !activoSolicitud() && !activoOfertaFirmada()) || revisando) return;
    revisando = true;
    const log = (tag, informes) => {
        const hechos = informes.filter(i => ['enviada', 'aceptada', 'retenida', 'error'].includes(i.accion));
        if (hechos.length) console.log(`[${tag}] (${motivo}) ${hechos.map(i => `${i.lote}: ${i.accion}${i.motivos.length ? ` — ${i.motivos.join('; ')}` : ''}`).join(' · ')}`);
    };
    try {
        if (activoSolicitud()) {
            try { log('SolicitudAuto', await revisarSolicitudes({ dryRun: false })); }
            catch (e) { console.error('[SolicitudAuto] barrido:', e.message); }
        }
        if (activo()) {
            try { log('OfertaAuto', await revisarOfertas({ dryRun: false })); }
            catch (e) { console.error('[OfertaAuto] barrido:', e.message); }
        }
        if (activoOfertaFirmada()) {
            try { log('OfertaFirmadaAuto', await revisarOfertasFirmadas({ dryRun: false })); }
            catch (e) { console.error('[OfertaFirmadaAuto] barrido:', e.message); }
        }
    } finally {
        revisando = false;
    }
}

// ── El correo de Marwen como DISPARADOR ─────────────────────────────────────────
// Solo mira cabeceras (remitente de Marwen y «oferta» en el asunto) en el buzón de
// los firmados, en solo lectura. Un correo nuevo adelanta la consulta a beCAE.
let ultimoUid = null;
async function hayCorreoDeOferta() {
    const user = process.env.LOTE_SO_SMTP_USER;
    const pass = process.env.LOTE_SO_SMTP_PASS;
    if (!user || !pass) return false;
    const { ImapFlow } = require('imapflow');
    const client = new ImapFlow({
        host: process.env.LOTE_SO_IMAP_HOST || 'imap.hostinger.com',
        port: Number(process.env.LOTE_SO_IMAP_PORT || 993),
        secure: true, auth: { user, pass }, logger: false,
    });
    await client.connect();
    try {
        const lock = await client.getMailboxLock('INBOX', { readOnly: true });
        try {
            const uids = await client.search({ since: new Date(Date.now() - 2 * 864e5), from: 'marwen', subject: 'oferta' }, { uid: true });
            const max = (uids || []).reduce((a, b) => Math.max(a, b), 0);
            const primera = ultimoUid === null;
            const nuevo = max > (ultimoUid || 0);
            ultimoUid = Math.max(max, ultimoUid || 0);
            // En el primer vistazo no se dispara: la consulta del arranque ya mira beCAE.
            return !primera && nuevo;
        } finally { lock.release(); }
    } finally {
        await client.logout().catch(() => {});
    }
}

async function vigilarCorreo() {
    if (!activo()) return;
    try { if (await hayCorreoDeOferta()) await barrer('correo de Marwen'); }
    catch (e) { console.warn('[OfertaAuto] buzón:', e.message); }
}

let handles = null;
function start() {
    if (handles) return;
    if (!activo()) console.log('[OfertaAuto] APAGADO (OFERTA_VERIFICADOR_AUTO != true). La oferta de beCAE se trae y se envía a mano.');
    if (!activoSolicitud()) console.log('[SolicitudAuto] APAGADO (SOLICITUD_SO_AUTO != true). El Anexo I, las fichas y la solicitud se mandan al S.O. a mano.');
    if (!activoOfertaFirmada()) console.log('[OfertaFirmadaAuto] APAGADO (OFERTA_FIRMADA_BECAE_AUTO != true). La oferta firmada se sube a beCAE (= se acepta) a mano.');
    if (!activo() && !activoSolicitud() && !activoOfertaFirmada()) return;
    setTimeout(barrer, 2 * 60 * 1000);
    handles = [setInterval(barrer, INTERVALO_MS)];
    if (activo()) handles.push(setInterval(vigilarCorreo, INTERVALO_CORREO_MS));
    console.log(`[beCAE auto] mirando beCAE cada ${Math.round(INTERVALO_MS / 60000)} min: ${[activoSolicitud() && 'la solicitud → S.O.', activo() && 'la oferta → S.O. (y al llegar un correo de Marwen)', activoOfertaFirmada() && 'la oferta firmada → beCAE'].filter(Boolean).join(' · ')}`);
}

module.exports = {
    activo, activoSolicitud, activoOfertaFirmada, start, barrer, revisarOfertas, decidirEnvio, candidatos, textoAviso,
    revisarSolicitudes, decidirEnvioSo, textoAvisoSo, ESPERA_SOLICITUD_MS,
    revisarOfertasFirmadas, decidirAceptarOferta, textoAvisoOfertaFirmada, nombreOferta, ESPERA_OFERTA_FIRMADA_MS,
};
