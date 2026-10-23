// ─────────────────────────────────────────────────────────────────────────────
// LOS FIRMADOS DEL S.O. QUE LLEGAN POR CORREO — se registran solos.
//
// El S.O. contesta al correo «Anexo I · Listado Cesión + Fichas RES» (o al de la
// oferta, o al del requerimiento) con los PDF firmados, y había que bajarlos del
// correo y soltarlos en la fase 2 del lote. Aquí lo hace el servidor: cada 15 min
// mira el buzón al que contesta el S.O. —franciscojavier.moya@brokergy.es, en
// Hostinger, con la MISMA cuenta `LOTE_SO_SMTP_*` con la que se le escribe— y
// pasa los adjuntos por `procesarFirmados`, el mismo camino que la suelta a mano:
// lee las firmas del PDF, identifica cada ficha por su nº de expediente y la
// registra con su `_fdo` (regla 40).
//
// REGLA — se registra solo lo LIMPIO. Lo que en pantalla pediría confirmación
// (firma de otro apoderado, Anexo I con una sola firma, un PDF que no se sabe de
// quién es) aquí NO se fuerza: se queda sin registrar y se AVISA con el motivo.
// Sin nadie delante no hay quien diga «sí, es de este».
//
// REGLA — lo ya firmado NO se reemplaza (`noReemplazar`). Reenviar el mismo
// correo, o que el S.O. conteste dos veces, no puede pisar lo registrado. Una
// re-firma por requerimiento no choca: al pedirla se borra el `signed_link`.
//
// REGLA — el buzón se LEE, no se toca: se abre en solo lectura, no se marca nada
// como leído ni se mueve. El correo sigue llegando a Gmail igual que siempre.
// Qué correos están ya vistos se guarda en `app_settings`.
//
// REGLA — solo cuenta un correo de un CONTACTO del S.O. de ESE lote, con el
// código del lote (`LOTE-2025-012`) en el asunto o en los adjuntos, y que traiga
// algún documento firmable del lote o conteste a una petición de firma. El resto
// (facturas, la contestación a la solicitud de emisión) no es asunto de esto.
//
// REGLA — nace APAGADO (`FIRMADOS_SO_CORREO_ENABLED`, solo `true` en el VPS): el
// local escribe en la Supabase y el Drive de producción, y dos servidores leyendo
// el mismo buzón registrarían dos veces.
//
// En seco, contra el buzón real: node scripts/probar_firmados_correo.js
// ─────────────────────────────────────────────────────────────────────────────
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const supabase = require('./supabaseClient');
const { procesarFirmados } = require('./firmadosSo');

const activo = () => String(process.env.FIRMADOS_SO_CORREO_ENABLED || '').toLowerCase() === 'true';
const INTERVALO_MS = 15 * 60 * 1000;
// Cuántos días hacia atrás se mira. Con el barrido cada 15 min bastaría con uno;
// diez cubren un servidor parado unos días sin volver a leer el buzón entero.
const DIAS_ATRAS = 10;
const CLAVE_VISTOS = 'firmados_so_correo:vistos';
const MAX_VISTOS = 500;

const adminPhone = () => process.env.WHATSAPP_ADMIN_CHAT || '34623926179';
const adminEmail = () => process.env.ADMIN_EMAIL || 'franciscojavier.moya.s2e2@gmail.com';
const APP_BASE = process.env.FRONTEND_URL || 'https://app.brokergy.es';

// Un dominio de correo gratuito no identifica a una empresa: ahí solo vale la
// dirección exacta del contacto.
const DOMINIOS_PUBLICOS = /^(gmail|googlemail|hotmail|outlook|live|msn|yahoo|ymail|icloud|me|aol|gmx|proton|protonmail|telefonica|movistar)\./i;

const lower = (s) => String(s || '').trim().toLowerCase();
const dominioDe = (email) => lower(email).split('@')[1] || '';
const RE_LOTE = /LOTE-\d{4}-\d{3}/gi;
// Los asuntos con los que se le PIDE firmar algo (emailService / EnviarLoteDocModal):
// una contestación a uno de ellos es, por definición, la devolución de los firmados.
const RE_PETICION_FIRMA = /anexo i|listado cesi|fichas res|firmar|nueva firma/i;

const fechaEs = (d) => new Date(d).toLocaleString('es-ES', {
    timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

/** Códigos de lote distintos que aparecen en los textos dados. */
function codigosLote(...textos) {
    const set = new Set();
    for (const t of textos) for (const m of String(t || '').match(RE_LOTE) || []) set.add(m.toUpperCase());
    return [...set];
}

/** ¿Lleva algún PDF? Se mira la estructura, sin bajar el correo. */
function nombresPdf(nodo, out = []) {
    if (!nodo) return out;
    const nombre = nodo.dispositionParameters?.filename || nodo.parameters?.name || '';
    if (lower(nodo.type) === 'application/pdf' || /\.pdf$/i.test(nombre)) out.push(nombre);
    for (const h of nodo.childNodes || []) nombresPdf(h, out);
    return out;
}

/** Direcciones y dominios desde los que escribe el S.O. (su ficha). */
function contactosSo(so) {
    let contactos = so?.contactos_notificacion;
    if (typeof contactos === 'string') { try { contactos = JSON.parse(contactos || '[]'); } catch { contactos = []; } }
    const emails = new Set(
        [so?.email, so?.email_contacto, so?.email_responsable, ...(Array.isArray(contactos) ? contactos : []).map(c => c?.email)]
            .map(lower).filter(e => e.includes('@')),
    );
    const dominios = new Set([...emails].map(dominioDe).filter(d => d && !DOMINIOS_PUBLICOS.test(d)));
    return { emails, dominios };
}

const esDelSo = (remitente, contactos) =>
    contactos.emails.has(lower(remitente)) || contactos.dominios.has(dominioDe(remitente));

async function leerVistos() {
    const { data, error } = await supabase.from('app_settings').select('value').eq('key', CLAVE_VISTOS).maybeSingle();
    if (error) throw new Error(`app_settings: ${error.message}`);
    if (!data?.value) return [];
    try { const v = typeof data.value === 'string' ? JSON.parse(data.value) : data.value; return Array.isArray(v) ? v : []; }
    catch { return []; }
}

async function guardarVistos(vistos) {
    const { error } = await supabase.from('app_settings').upsert(
        { key: CLAVE_VISTOS, value: JSON.stringify(vistos.slice(-MAX_VISTOS)), updated_at: new Date().toISOString() },
        { onConflict: 'key' });
    if (error) throw new Error(`app_settings: ${error.message}`);
}

const ESTADOS_A_REVISAR = new Set(['revisar', 'sin_firma', 'firma_rota', 'sin_identificar', 'duplicado', 'error', 'no_pdf']);

/** El texto del aviso (WhatsApp y email): lo registrado, lo que hay que mirar y lo que falta. */
function textoAviso(correo, informe) {
    const reg = informe.resultados.filter(r => r.registrado);
    const rev = informe.resultados.filter(r => !r.registrado && ESTADOS_A_REVISAR.has(r.estado));
    const ya = informe.resultados.filter(r => r.estado === 'ya_registrado');
    const anteriores = informe.resultados.filter(r => r.estado === 'anterior');
    const nombre = (r) => r.expediente ? `${r.expediente}` : (r.etiqueta || r.fichero);
    const titulo = rev.length
        ? `📥 Firmados del S.O. por correo — ${informe.codigo} (hay que revisar ${rev.length})`
        : `📥 Firmados del S.O. registrados — ${informe.codigo}`;
    return {
        titulo,
        texto: [
            `*${titulo}*`,
            `De: ${correo.de} · ${fechaEs(correo.fecha)}`,
            `Asunto: ${correo.asunto}`,
            '',
            reg.length ? `✅ Registrados (${reg.length}): ${reg.map(nombre).join(' · ')}` : null,
            rev.length ? `⚠️ Sin registrar, para revisar (${rev.length}):` : null,
            ...rev.map(r => `  · ${r.fichero}${r.expediente ? ` (${r.expediente})` : ''} — ${r.avisos.join(' ') || r.estado}`),
            rev.length ? '  Si son buenos, suéltalos en la fase 2 del lote para confirmarlos.' : null,
            informe.paquete?.texto ? `📦 ${informe.paquete.texto}` : null,
            ya.length ? `ℹ️ Ya estaban registrados: ${ya.length}` : null,
            anteriores.length ? `ℹ️ De una ronda de firma anterior, no se usan: ${anteriores.map(nombre).join(' · ')}` : null,
            informe.pendientes.length
                ? `⏳ Sigue faltando: ${informe.pendientes.map(p => p.expediente || p.etiqueta).join(' · ')}`
                : '🎉 El lote tiene ya todos sus firmados.',
            '',
            `🔗 ${APP_BASE}?tab=lotes`,
        ].filter(l => l !== null).join('\n'),
    };
}

async function avisar(correo, informe) {
    const { titulo, texto } = textoAviso(correo, informe);
    // Require diferido: whatsappService arranca su propio cliente al cargarse.
    try { await require('./whatsappService').sendText(adminPhone(), texto); }
    catch (e) { console.warn('[FirmadosCorreo] aviso WhatsApp:', e.message); }
    try {
        const emailService = require('./emailService');
        await emailService.sendMail({
            to: adminEmail(),
            from: process.env.ALERT_EMAIL_FROM || emailService.getFallbackSender() || undefined,
            subject: titulo,
            text: texto,
            html: `<pre style="font-family:system-ui,sans-serif;white-space:pre-wrap">${texto.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</pre>`,
        });
    } catch (e) { console.warn('[FirmadosCorreo] aviso email:', e.message); }
}

/**
 * Mira el buzón y registra los firmados del S.O. que hayan llegado.
 *
 * @param {object} opts
 *   - `dryRun`   solo analiza: no registra, no avisa y no marca nada como visto.
 *   - `dias`     cuántos días hacia atrás.
 *   - `revisarVistos`  vuelve a mirar también los ya vistos (para el script).
 *   - `avisos`   mandar el aviso al admin (por defecto, si no es en seco).
 * @returns {Promise<Array>} un informe por correo mirado
 */
async function revisarBuzon(opts = {}) {
    const { dryRun = false, dias = DIAS_ATRAS, revisarVistos = false } = opts;
    const avisos = opts.avisos ?? !dryRun;
    const user = process.env.LOTE_SO_SMTP_USER;
    const pass = process.env.LOTE_SO_SMTP_PASS;
    if (!user || !pass) throw new Error('Faltan LOTE_SO_SMTP_USER / LOTE_SO_SMTP_PASS: no se puede leer el buzón');

    // Los S.O. que tienen lotes, con sus contactos. Sin ninguno no hay nada que buscar.
    const { data: lotes, error: eLotes } = await supabase.from('lotes').select('id, codigo, sujeto_obligado_id');
    if (eLotes) throw new Error(`lotes: ${eLotes.message}`);
    const loteDeCodigo = Object.fromEntries((lotes || []).map(l => [String(l.codigo || '').toUpperCase(), l]));
    const soIds = [...new Set((lotes || []).map(l => l.sujeto_obligado_id).filter(Boolean))];
    if (!soIds.length) return [];
    const { data: sos, error: eSo } = await supabase.from('prescriptores')
        .select('id_empresa, razon_social, email, email_contacto, email_responsable, contactos_notificacion').in('id_empresa', soIds);
    if (eSo) throw new Error(`prescriptores: ${eSo.message}`);
    const contactosDe = Object.fromEntries((sos || []).map(s => [s.id_empresa, contactosSo(s)]));
    const todos = Object.values(contactosDe).reduce((acc, c) => {
        c.dominios.forEach(d => acc.add(d));
        c.emails.forEach(e => { if (!c.dominios.has(dominioDe(e))) acc.add(e); });
        return acc;
    }, new Set());
    if (!todos.size) return [];

    const vistos = await leerVistos();
    const yaVisto = new Set(vistos.map(v => v.id));
    const nuevosVistos = [];
    const informes = [];

    const client = new ImapFlow({
        host: process.env.LOTE_SO_IMAP_HOST || 'imap.hostinger.com',
        port: Number(process.env.LOTE_SO_IMAP_PORT || 993),
        secure: true,
        auth: { user, pass },
        logger: false,
    });
    await client.connect();
    try {
        const lock = await client.getMailboxLock('INBOX', { readOnly: true });
        try {
            // El FROM de IMAP busca por subcadena: «interalco.es» trae a cualquiera
            // de la empresa. Se filtra después contra el S.O. de cada lote.
            const criterios = [...todos].map(t => ({ from: t }));
            const busqueda = { since: new Date(Date.now() - dias * 864e5) };
            if (criterios.length === 1) Object.assign(busqueda, criterios[0]); else busqueda.or = criterios;
            const uids = await client.search(busqueda, { uid: true });
            if (!uids || !uids.length) return informes;

            const cabeceras = [];
            for await (const m of client.fetch(uids, { uid: true, envelope: true, bodyStructure: true }, { uid: true })) {
                cabeceras.push(m);
            }

            for (const m of cabeceras) {
                const env = m.envelope || {};
                const id = env.messageId || `uid:${m.uid}`;
                if (!revisarVistos && yaVisto.has(id)) continue;
                const de = env.from?.[0] || {};
                const correo = {
                    id, uid: m.uid, asunto: env.subject || '', fecha: env.date,
                    remitente: lower(de.address), de: de.name ? `${de.name} <${lower(de.address)}>` : lower(de.address),
                };
                const pdfs = nombresPdf(m.bodyStructure);
                const informe = { ...correo, lote: null, accion: null, motivo: null, resultado: null };
                informes.push(informe);
                const visto = (motivo) => { informe.motivo = motivo; nuevosVistos.push({ id, at: new Date().toISOString(), lote: informe.lote, motivo }); };

                if (!pdfs.length) { informe.accion = 'ignorado'; visto('sin PDF'); continue; }
                const codigos = codigosLote(correo.asunto).length ? codigosLote(correo.asunto) : codigosLote(...pdfs);
                if (codigos.length !== 1) {
                    informe.accion = 'ignorado';
                    visto(codigos.length ? `nombra ${codigos.length} lotes (${codigos.join(', ')})` : 'sin código de lote');
                    continue;
                }
                const lote = loteDeCodigo[codigos[0]];
                informe.lote = codigos[0];
                if (!lote) { informe.accion = 'ignorado'; visto(`${codigos[0]} no existe en la app`); continue; }
                const contactos = contactosDe[lote.sujeto_obligado_id];
                if (!contactos || !esDelSo(correo.remitente, contactos)) {
                    informe.accion = 'ignorado'; visto('el remitente no es un contacto del S.O. de ese lote'); continue;
                }

                // Ahora sí: se baja el correo entero y se sacan los PDF.
                const msg = await client.fetchOne(String(m.uid), { source: true }, { uid: true });
                const parsed = await simpleParser(msg.source);
                const ficheros = (parsed.attachments || [])
                    .filter(a => lower(a.contentType) === 'application/pdf' || /\.pdf$/i.test(a.filename || ''))
                    .map(a => ({ nombre: String(a.filename || 'adjunto.pdf').split(/[\\/]/).pop(), buffer: a.content }));
                if (!ficheros.length) { informe.accion = 'ignorado'; visto('sin PDF'); continue; }

                const origen = `correo de ${correo.remitente}, ${fechaEs(correo.fecha)}`;
                const seco = await procesarFirmados(lote.id, ficheros, { dryRun: true, noReemplazar: true, origen, recibidoAt: correo.fecha });
                const relevante = RE_PETICION_FIRMA.test(correo.asunto) || seco.resultados.some(r => r.doc);
                if (!relevante) { informe.accion = 'ignorado'; informe.resultado = seco; visto('no trae documentos firmables del lote'); continue; }

                const res = dryRun
                    ? seco
                    : await procesarFirmados(lote.id, ficheros, { noReemplazar: true, usuario: 'CORREO S.O.', origen, recibidoAt: correo.fecha });
                informe.accion = dryRun ? 'en_seco' : 'procesado';
                informe.resultado = res;
                const hayAlgo = res.resultados.some(r => r.registrado || ESTADOS_A_REVISAR.has(r.estado));
                if (avisos && hayAlgo) await avisar(correo, res);
                visto(`${res.registrados} registrados`);
            }
        } finally {
            lock.release();
        }
    } finally {
        await client.logout().catch(() => {});
    }

    if (!dryRun && nuevosVistos.length) {
        const sinRepetir = vistos.filter(v => !nuevosVistos.some(n => n.id === v.id));
        await guardarVistos([...sinRepetir, ...nuevosVistos]);
    }
    return informes;
}

// ── Barrido ──────────────────────────────────────────────────────────────────
let barriendo = false;

async function barrer() {
    if (!activo() || barriendo) return;
    barriendo = true;
    try {
        const informes = await revisarBuzon();
        const hechos = informes.filter(i => i.accion === 'procesado');
        if (hechos.length) {
            console.log(`[FirmadosCorreo] ${hechos.map(i => `${i.lote}: ${i.resultado.registrados} registrados`).join(' · ')}`);
        }
    } catch (e) {
        // Un fallo (buzón, BD) no marca nada como visto: se reintenta en el siguiente barrido.
        console.error('[FirmadosCorreo] barrido:', e.message);
    } finally {
        barriendo = false;
    }
}

let handle = null;
function start() {
    if (handle) return;
    if (!activo()) {
        console.log('[FirmadosCorreo] APAGADO (FIRMADOS_SO_CORREO_ENABLED != true). Los firmados del S.O. hay que soltarlos a mano.');
        return;
    }
    setTimeout(barrer, 60 * 1000);
    handle = setInterval(barrer, INTERVALO_MS);
    console.log(`[FirmadosCorreo] vigilando el buzón de firmados del S.O. (cada ${Math.round(INTERVALO_MS / 60000)} min)`);
}

module.exports = {
    activo, revisarBuzon, barrer, start,
    // Exportados para las pruebas
    codigosLote, nombresPdf, contactosSo, esDelSo, textoAviso,
};
