// ═══════════════════════════════════════════════════════════════════════════════
// EL INFORME DE INEXACTITUDES, solo: del correo de Marwen al lote, y al Claude del
// servidor para que prepare la contestación (regla 224, 18/11/2026, Fran: «cuando
// llega informe de inexactitudes que se suban a la app y a ser posible que CLAUDE se
// ponga a preparar la contestación»).
// Ver docs/conocimiento/lotes/la-api-de-marwen-v1-6.md («El informe de inexactitudes, solo»).
//
// Marwen manda cada informe por correo («Inexactitudes_v3 del expediente CAE-2035
// (LOTE-2026-015)», de cae@marwen.es, con «05. Inexactitudes_CAE-2035_v3.pdf») al
// buzón de los firmados (LOTE_SO_SMTP_*). La API NO lo descarga (solo da las
// inexactitudes ya estructuradas, con límite de consultas): el PDF llega por aquí.
//
//   1. SUBIR: `subirDocumentoLote(…, 'informe_inexactitudes')` de routes/lotes.js, la
//      MISMA de «Subir» en la fase 4: Drive con su nombre canónico, cada inexactitud
//      registrada como incidencia de su expediente (regla 159) y el lote a
//      REQUERIMIENTO VERIFICADOR.
//   2. ENCARGAR la contestación al Claude del WhatsApp (`asistenteCanal.pedirTarea`,
//      el mismo `/tarea` del agente tras la aceptación), con un texto que compone el
//      SERVIDOR. Prepara, no envía: nada sale al S.O., al cliente, al instalador ni a
//      Marwen sin el «sí» de Fran, y el escrito lo firma él.
//   3. AVISAR a Fran (WhatsApp y email) de qué ha llegado y de si Claude se ha puesto.
//
// REGLA — un informe se identifica por el NOMBRE de su PDF y solo entra si es más
// nuevo que el último del lote: las versiones de Marwen se saltan números (v1, v2,
// v3, v5…) y no casan con la ronda de la app (su «_v1» es nuestro informe 2).
//
// Dos interruptores, nacen APAGADOS (local escribe en PRODUCCIÓN):
//   INEXACTITUDES_CORREO_ENABLED=true   sube los informes del buzón al lote.
//   INEXACTITUDES_AGENTE_ENABLED=true   además le encarga la contestación a Claude.
// `importarInformesDelBuzon({ dryRun: true })` dice lo que haría.
// ═══════════════════════════════════════════════════════════════════════════════
const supabase = require('./supabaseClient');

const INTERVALO_MS = 10 * 60 * 1000;
const DIAS_ATRAS = 7;
const USUARIO = 'CORREO VERIFICADOR';

const activo = () => String(process.env.INEXACTITUDES_CORREO_ENABLED || '').toLowerCase() === 'true';
const activoAgente = () => String(process.env.INEXACTITUDES_AGENTE_ENABLED || '').toLowerCase() === 'true';
const nowIso = () => new Date().toISOString();
const adminPhone = () => process.env.WHATSAPP_ADMIN_CHAT || '34623926179';
const adminEmail = () => process.env.ADMIN_EMAIL || 'franciscojavier.moya.s2e2@gmail.com';
const APP_BASE = (process.env.FRONTEND_URL && /^https:\/\//i.test(process.env.FRONTEND_URL)
    ? process.env.FRONTEND_URL : 'https://app.brokergy.es').replace(/\/+$/, '');

// ── Puras (las prueban los tests) ────────────────────────────────────────────

/** «Inexactitudes_v3 del expediente CAE-2035 (LOTE-2026-015)» → { version, cae, lote }. */
function leerAsunto(asunto) {
    const a = String(asunto || '');
    if (/^\s*(re|rv|fw|fwd)\s*:/i.test(a)) return null;          // una respuesta, no el aviso
    if (!/inexactitudes/i.test(a)) return null;
    const lote = (a.match(/LOTE-\d{4}-\d{3}/i) || [])[0];
    if (!lote) return null;
    const v = a.match(/inexactitudes(?:_v(\d+))?/i);
    return {
        version: v?.[1] ? Number(v[1]) : 0,
        cae: ((a.match(/CAE-\d+/i) || [])[0] || '').toUpperCase() || null,
        lote: lote.toUpperCase(),
    };
}

/** «05. Inexactitudes_CAE-2041_v1 (1).pdf» → «05. inexactitudes_cae-2041_v1». */
const nombreNorm = (n) => String(n || '').toLowerCase().replace(/\.pdf$/i, '').replace(/\s*\(\d+\)\s*$/, '').trim();

/** La versión de Marwen que lleva el nombre del PDF (sin sufijo = 0). */
function versionDeNombre(n) {
    const m = nombreNorm(n).match(/_v(\d+)$/);
    return m ? Number(m[1]) : 0;
}

/**
 * ¿Se sube este PDF al lote? `lote` = { codigo, expediente_verificador, documentos_so }.
 * @returns {{ subir: boolean, motivo: string|null }}
 */
function decidirInforme({ lote, nombre, cae, fecha = null }) {
    if (!lote) return { subir: false, motivo: 'el lote no existe en la app' };
    if (!nombre) return { subir: false, motivo: 'el correo no trae el PDF del informe' };
    const verif = String(lote.expediente_verificador || '').toUpperCase();
    if (cae && verif && verif !== String(cae).toUpperCase()) {
        return { subir: false, motivo: `el lote es del expediente ${verif}, no del ${cae}` };
    }
    // Un informe de inexactitudes REABRE el lote (subirDocumentoLote lo devuelve a
    // REQUERIMIENTO VERIFICADOR). Si llegó ANTES que el informe de verificación o el
    // dictamen que ya tiene el lote, es una ronda vieja que se quedó sin subir: no se
    // sube solo (LOTE-2026-014, v3 del 12/11 con el dictamen del 13/11 y en el MITECO).
    const llego = Date.parse(fecha || '') || null;
    const cierre = (lote.documentos_so || [])
        .filter(d => ['informe_verificacion', 'dictamen_favorable'].includes(d?.tipo || d?.key) && d.uploaded_at)
        .map(d => Date.parse(d.uploaded_at)).filter(Boolean);
    if (cierre.length && (!llego || llego < Math.max(...cierre))) {
        return { subir: false, motivo: 'el lote ya tiene informe de verificación o dictamen posterior a este informe: subirlo lo reabriría (si de verdad toca, a mano)' };
    }
    const informes = (lote.documentos_so || []).filter(d => d?.tipo === 'informe_inexactitudes');
    if (informes.some(d => nombreNorm(d.original_file_name) === nombreNorm(nombre))) {
        return { subir: false, motivo: 'ese informe ya está en el lote' };
    }
    const v = versionDeNombre(nombre);
    const conNombre = informes.filter(d => d.original_file_name);
    const ultima = conNombre.length ? Math.max(...conNombre.map(d => versionDeNombre(d.original_file_name))) : -1;
    if (v <= ultima) return { subir: false, motivo: `el lote ya tiene un informe más nuevo (v${ultima})` };
    return { subir: true, motivo: null };
}

/** Las inexactitudes que siguen ABIERTAS en lo leído (las que hay que contestar). */
const abiertasDe = (items = []) => items.filter(i => !/cerrad/i.test(String(i.estado || '')));

/**
 * El encargo para el Claude del servidor. Lo compone el SERVIDOR (no un modelo) y
 * le dice qué preparar y qué NO hacer. `inf` = lo que devolvió la subida.
 */
function instruccionContestacion(inf) {
    const abiertas = abiertasDe(inf.items);
    const lista = abiertas.map(i => `- nº ${i.n} (actuación ${i.actuaciones || '¿?'}): ${String(i.hecho || '').replace(/\s+/g, ' ').slice(0, 400)}`).join('\n');
    const ronda = inf.ronda;
    return `Ha llegado por correo el informe de inexactitudes ${inf.version_verificador ? `v${inf.version_verificador} ` : ''}del ${inf.lote} (${inf.cae || 'expediente del verificador'}, Marwen) y ya está en la app como «Informe de inexactitudes ${ronda}», con cada inexactitud registrada como incidencia de su expediente. Siguen ABIERTAS y hay que contestar:
${lista || '- (ninguna abierta según lo leído: compruébalo)'}

PREPARA la contestación, sin enviar nada a nadie (ni al S.O., ni al cliente, ni al instalador, ni a Marwen):
1. Lee docs/conocimiento/lotes/las-inexactitudes-del-verificador-se-registran-y-la-respuesta-se-arma-sola.md y contestar-inexactitudes-en-el-portal-de-marwen.md, y el escrito de la ronda anterior (\`node implementation/backend/scripts/bajar_requerimiento_lote.js ${inf.lote} --ronda ${Math.max(1, ronda - 1)} --destino <tu carpeta>\`), que es el modelo de tono y de forma.
2. Por cada inexactitud abierta, mira el expediente de su actuación (la incidencia, los documentos, el cálculo, las fotos, el catálogo) y decide qué la contesta: un documento corregido, uno nuevo, o una aclaración. Si cambia un dato del listado del lote (fechas, ahorro, UTM…), hace falta además el Anexo I del lote firmado de nuevo.
3. Lo que dependa solo de nosotros y no mueva el ahorro, los importes ni las fechas declaradas, déjalo hecho en la app (p. ej. una ficha técnica que falta en el catálogo). Lo que sí los mueva, NO lo cambies: proponlo con la cifra de antes y la de después.
4. Redacta el escrito de contestación como BORRADOR, en un .txt dentro de «${ronda}. REQUERIMIENTO» del lote («00 - CONTESTACION ${inf.cae || ''} - ${inf.lote}.txt»), con el mismo esquema que el anterior: una sección por inexactitud abierta y la lista de documentos _v1 que se aportan. No lo firmes ni lo conviertas en el escrito definitivo: lo firma Fran.
5. Lo que haya que pedir o volver a firmar a un tercero (S.O., cliente, instalador, fabricante), prepáralo en borrador y no lo mandes.
Al terminar, cuéntame en el grupo, por inexactitud: qué dice, qué propones, qué has dejado hecho, qué falta y de quién, y lo que tenga que decidir yo, en una pregunta concreta.`;
}

function textoAviso(inf) {
    const abiertas = abiertasDe(inf.items);
    const t = inf.totales || {};
    const lineas = [
        `Ha llegado el informe de inexactitudes ${inf.version_verificador ? `v${inf.version_verificador} ` : ''}del ${inf.lote}${inf.cae ? ` (${inf.cae})` : ''} y está subido al lote como «Informe de inexactitudes ${inf.ronda}».`,
        inf.leido === false
            ? `No se han podido leer sus inexactitudes (${inf.error || 'sin motivo'}): regístralas desde la fila del informe («Volver a leer»).`
            : `${(inf.items || []).length} inexactitud(es): ${abiertas.length} abierta(s)${abiertas.length ? ` (nº ${abiertas.map(i => i.n).join(', ')})` : ''}${t.cerradas ? ` · ${t.cerradas} incidencia(s) cerradas por el verificador` : ''}${t.nuevas ? ` · ${t.nuevas} incidencia(s) nuevas` : ''}${t.reabiertas ? ` · ${t.reabiertas} reabiertas` : ''}.`,
        ...abiertas.map(i => `- nº ${i.n} (E${String(i.actuaciones || '?').replace(/\s*,\s*/g, ', E')}): ${String(i.hecho || '').replace(/\s+/g, ' ').slice(0, 220)}`),
        '',
        inf.encargo?.ok
            ? 'Claude se ha puesto a preparar la contestación (borrador del escrito y lo que haya que corregir). No envía nada: te lo cuenta en el grupo.'
            : `Claude no se ha puesto con la contestación${inf.encargo?.motivo ? ` (${inf.encargo.motivo})` : ''}.`,
        `${APP_BASE}?tab=lotes`,
    ];
    return { titulo: `Inexactitudes ${inf.version_verificador ? `v${inf.version_verificador} ` : ''}— ${inf.lote}${abiertas.length ? ` · ${abiertas.length} abierta(s)` : ''}`, texto: lineas.join('\n') };
}

// ── Con efectos ──────────────────────────────────────────────────────────────

async function avisarAdmin({ titulo, texto }) {
    try { await require('./whatsappService').sendText(adminPhone(), texto); }
    catch (e) { console.warn('[InexactitudesCorreo] aviso WhatsApp:', e.message); }
    try {
        const emailService = require('./emailService');
        await emailService.sendMail({
            to: adminEmail(),
            from: process.env.ALERT_EMAIL_FROM || emailService.getFallbackSender() || undefined,
            subject: titulo, text: texto,
            html: `<pre style="font-family:system-ui,sans-serif;white-space:pre-wrap">${texto.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</pre>`,
        });
    } catch (e) { console.warn('[InexactitudesCorreo] aviso email:', e.message); }
}

/** Le encarga la contestación al Claude del WhatsApp. Nunca lanza. */
async function encargarContestacion(inf) {
    if (!activoAgente()) return { ok: false, motivo: 'apagado (INEXACTITUDES_AGENTE_ENABLED)' };
    if (inf.leido === false) return { ok: false, motivo: 'no se han podido leer las inexactitudes' };
    if (!abiertasDe(inf.items).length) return { ok: false, motivo: 'no queda ninguna abierta' };
    const { pedirTarea } = require('./asistenteCanal');
    return pedirTarea({
        texto: instruccionContestacion(inf),
        clave: `inexactitudes:${inf.lote}:${inf.ronda}`,
        acuse: `Ha llegado el informe de inexactitudes del ${inf.lote}: preparo la contestación (sin enviar nada) y te cuento.`,
    });
}

/**
 * Mira el buzón y sube al lote cada informe nuevo de Marwen.
 * @param {{ dryRun?: boolean, dias?: number, lote?: string, encargar?: boolean, avisos?: boolean }} opts
 *   `dryRun` (por defecto) no escribe ni manda; `encargar`/`avisos` (por defecto, si no
 *   es en seco) encargan la contestación y avisan a Fran.
 */
async function importarInformesDelBuzon(opts = {}) {
    const { dryRun = true, dias = DIAS_ATRAS, lote: soloLote = null } = opts;
    const encargar = opts.encargar ?? !dryRun;
    const avisos = opts.avisos ?? !dryRun;
    const { ImapFlow } = require('imapflow');
    const { simpleParser } = require('mailparser');
    const user = process.env.LOTE_SO_SMTP_USER;
    const pass = process.env.LOTE_SO_SMTP_PASS;
    if (!user || !pass) throw new Error('Faltan LOTE_SO_SMTP_USER / LOTE_SO_SMTP_PASS: no se puede leer el buzón');

    const informes = [];
    const client = new ImapFlow({
        host: process.env.LOTE_SO_IMAP_HOST || 'imap.hostinger.com',
        port: Number(process.env.LOTE_SO_IMAP_PORT || 993),
        secure: true, auth: { user, pass }, logger: false,
    });
    await client.connect();
    try {
        const lock = await client.getMailboxLock('INBOX', { readOnly: true });
        try {
            const uids = await client.search({ since: new Date(Date.now() - dias * 864e5), from: 'marwen', subject: 'Inexactitudes' }, { uid: true });
            const cabeceras = [];
            if (uids?.length) for await (const m of client.fetch(uids, { uid: true, envelope: true }, { uid: true })) cabeceras.push(m);
            // Por orden de llegada: si llegan dos del mismo lote, entran en su orden.
            cabeceras.sort((a, b) => new Date(a.envelope?.date || 0) - new Date(b.envelope?.date || 0));

            for (const m of cabeceras) {
                const asunto = m.envelope?.subject || '';
                const a = leerAsunto(asunto);
                if (!a) continue;
                if (soloLote && a.lote !== String(soloLote).toUpperCase()) continue;
                const inf = { asunto, fecha: m.envelope?.date || null, lote: a.lote, cae: a.cae, version_verificador: a.version, accion: null, motivo: null };
                informes.push(inf);

                // El lote se relee en cada correo: el anterior pudo subir un informe.
                const { data: lote, error } = await supabase.from('lotes')
                    .select('id, codigo, expediente_verificador, documentos_so').eq('codigo', a.lote).maybeSingle();
                if (error) throw new Error(`lotes: ${error.message}`);

                const msg = await client.fetchOne(String(m.uid), { source: true }, { uid: true });
                const parsed = await simpleParser(msg.source);
                const pdfs = (parsed.attachments || []).filter(x => /pdf/i.test(x.contentType || '') || /\.pdf$/i.test(x.filename || ''));
                const pdf = pdfs.find(x => /inexactitud/i.test(x.filename || '')) || pdfs[0] || null;
                inf.fichero = pdf?.filename || null;

                const dec = decidirInforme({ lote, nombre: pdf?.filename, cae: a.cae, fecha: m.envelope?.date || null });
                if (!dec.subir) { inf.accion = 'nada'; inf.motivo = dec.motivo; continue; }
                if (dryRun) { inf.accion = 'en_seco'; inf.motivo = `subiría «${pdf.filename}» al lote y registraría sus inexactitudes`; continue; }

                try {
                    const { subirDocumentoLote } = require('../routes/lotes');
                    const sub = await subirDocumentoLote(lote.id, 'informe_inexactitudes', {
                        buffer: pdf.content, fileName: pdf.filename, usuario: USUARIO,
                    });
                    const r = sub.inexactitudes || {};
                    Object.assign(inf, {
                        accion: 'subido', key: sub.documento?.key,
                        ronda: r.ronda || Number(String(sub.documento?.key || '').split('_').pop()) || null,
                        leido: r.leido !== false, error: r.error || null,
                        items: r.items || [], totales: r.totales || {}, sin_casar: r.sin_casar || [],
                    });
                    inf.encargo = encargar ? await encargarContestacion(inf) : { ok: false, motivo: 'sin encargo (prueba)' };
                    if (avisos) await avisarAdmin(textoAviso(inf));
                } catch (e) {
                    inf.accion = 'error'; inf.motivo = e.message;
                    console.error(`[InexactitudesCorreo] ${a.lote}:`, e.message);
                    if (avisos) await avisarAdmin({ titulo: `Inexactitudes sin subir — ${a.lote}`, texto: `Ha llegado «${asunto}» pero no se ha podido subir al lote: ${e.message}\nSúbelo a mano en la fase 4.\n${APP_BASE}?tab=lotes` });
                }
            }
        } finally {
            lock.release();
        }
    } finally {
        await client.logout().catch(() => {});
    }
    return informes;
}

let barriendo = false;
async function barrer() {
    if (!activo() || barriendo) return;
    barriendo = true;
    try {
        const informes = await importarInformesDelBuzon({ dryRun: false });
        const hechos = informes.filter(i => ['subido', 'error'].includes(i.accion));
        if (hechos.length) console.log(`[InexactitudesCorreo] ${hechos.map(i => `${i.lote}: ${i.accion}${i.motivo ? ` — ${i.motivo}` : ''}${i.encargo ? ` · Claude: ${i.encargo.ok ? 'sí' : i.encargo.motivo}` : ''}`).join(' · ')}`);
    } catch (e) {
        console.error('[InexactitudesCorreo] barrido:', e.message);
    } finally {
        barriendo = false;
    }
}

let handle = null;
function start() {
    if (handle) return;
    if (!activo()) {
        console.log('[InexactitudesCorreo] APAGADO (INEXACTITUDES_CORREO_ENABLED != true). El informe de inexactitudes se sube a mano.');
        return;
    }
    setTimeout(barrer, 100 * 1000);
    handle = setInterval(barrer, INTERVALO_MS);
    console.log(`[InexactitudesCorreo] mirando el buzón por los informes de inexactitudes (cada ${Math.round(INTERVALO_MS / 60000)} min)${activoAgente() ? ' · Claude prepara la contestación' : ''}`);
}

module.exports = {
    activo, activoAgente, start, barrer, importarInformesDelBuzon, encargarContestacion,
    leerAsunto, nombreNorm, versionDeNombre, decidirInforme, abiertasDe, instruccionContestacion, textoAviso,
};
