// ═══════════════════════════════════════════════════════════════════════════════
// EL INFORME DE VERIFICACIÓN, EL DICTAMEN Y LA FACTURA DEL VERIFICADOR, solos: del
// correo de Marwen al lote (regla 225, 18/11/2026, Fran: «Acabamos de recibir el
// informe de verificación y dictamen. A ver cómo se podría automatizar»).
// Ver docs/conocimiento/lotes/la-api-de-marwen-v1-6.md («El cierre de la verificación, solo»).
//
// Marwen manda, al cerrar la verificación, dos correos al buzón de los firmados
// (LOTE_SO_SMTP_*):
//   · «Informe de verificación y Dictamen CAE-2059 (LOTE-2026-018)» con
//     «06. Informe de Verificacion_CAE-2059_2F.pdf» y «08. Dictamen Favorable_CAE-2059_2F.pdf»;
//   · «Factura Expediente CAE-2059 (LOTE-2026-018)» con «FV20261486 …pdf» (los
//     antiguos, solo «Factura expediente CAE-1834», sin el lote: se busca por el CAE).
// La API no descarga los documentos del EXPEDIENTE: llegan por aquí.
//
// Cada PDF entra por `subirDocumentoLote` (routes/lotes.js), la MISMA de «Subir» en la
// fase 4, que ya hace la lectura de cada uno:
//   · informe  → lee y CASA los ahorros e inversiones verificados (`proponerAhorrosVerificados`);
//   · dictamen → sella su nº, fecha y decisión en la entrada (`proponerDatosDictamen`);
//   · factura  → su BASE IMPONIBLE a `coste_verificacion`, cotejada con el lote.
// Primero el informe y luego el dictamen: el dictamen se casa por el ahorro verificado.
//
// REGLA — el ahorro verificado se PROPONE, nunca se escribe solo (con él se factura al
// S.O. y se le paga al cliente): esto lo trae y lo lee; aplicarlo sigue siendo la
// revisión de la fase 4. El aviso a Fran dice lo leído, si cuadra y lo que queda.
//
// REGLA — un slot que ya tiene documento NO se toca: estos no son múltiples y subir
// otro lo REEMPLAZARÍA (Marwen manda a veces el mismo correo dos veces: CAE-1834).
//
// Nace APAGADO (VERIFICACION_CORREO_ENABLED=true): local escribe en PRODUCCIÓN.
// `importarVerificacionDelBuzon({ dryRun: true })` dice lo que haría.
// ═══════════════════════════════════════════════════════════════════════════════
const supabase = require('./supabaseClient');

const INTERVALO_MS = 10 * 60 * 1000;
const DIAS_ATRAS = 7;
const USUARIO = 'CORREO VERIFICADOR';

const activo = () => String(process.env.VERIFICACION_CORREO_ENABLED || '').toLowerCase() === 'true';
const adminPhone = () => process.env.WHATSAPP_ADMIN_CHAT || '34623926179';
const adminEmail = () => process.env.ADMIN_EMAIL || 'franciscojavier.moya.s2e2@gmail.com';
const APP_BASE = (process.env.FRONTEND_URL && /^https:\/\//i.test(process.env.FRONTEND_URL)
    ? process.env.FRONTEND_URL : 'https://app.brokergy.es').replace(/\/+$/, '');
const kwh = (n) => (Number.isFinite(Number(n)) ? Number(n).toLocaleString('es-ES') : '?');
const eur = (n) => (Number.isFinite(Number(n)) ? Number(n).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '?');

// ── Puras (las prueban los tests) ────────────────────────────────────────────

/** El asunto de Marwen → { tipo: 'cierre'|'factura', cae, lote|null }, o null. */
function leerAsunto(asunto) {
    const a = String(asunto || '');
    if (/^\s*(re|rv|fw|fwd)\s*:/i.test(a)) return null;
    const cae = ((a.match(/CAE-\d+/i) || [])[0] || '').toUpperCase() || null;
    const lote = ((a.match(/LOTE-\d{4}-\d{3}/i) || [])[0] || '').toUpperCase() || null;
    if (!cae && !lote) return null;
    if (/informe de verificaci/i.test(a) || /dictamen/i.test(a)) return { tipo: 'cierre', cae, lote };
    if (/^\s*factura\b/i.test(a)) return { tipo: 'factura', cae, lote };
    return null;
}

/** A qué slot del lote va cada PDF del correo. */
function slotDePdf(nombre, tipo) {
    const n = String(nombre || '');
    if (tipo === 'factura') return 'factura_verificador';
    if (/dictamen/i.test(n)) return 'dictamen_favorable';
    if (/informe\s*de\s*verificaci/i.test(n)) return 'informe_verificacion';
    return null;
}

const ORDEN = { informe_verificacion: 1, dictamen_favorable: 2, factura_verificador: 3 };

/**
 * ¿Se sube este PDF a ese slot? `lote` = { codigo, expediente_verificador, documentos_so }.
 * @returns {{ subir: boolean, motivo: string|null }}
 */
function decidirDocumento({ lote, slot, cae }) {
    if (!lote) return { subir: false, motivo: 'el lote no existe en la app' };
    if (!slot) return { subir: false, motivo: 'no es el informe, el dictamen ni la factura' };
    const verif = String(lote.expediente_verificador || '').toUpperCase();
    if (cae && verif && verif !== String(cae).toUpperCase()) {
        return { subir: false, motivo: `el lote es del expediente ${verif}, no del ${cae}` };
    }
    const ya = (lote.documentos_so || []).find(d => d?.key === slot);
    if (ya) return { subir: false, motivo: `el lote ya tiene ${slot === 'factura_verificador' ? 'la factura del verificador' : slot === 'dictamen_favorable' ? 'el dictamen' : 'el informe de verificación'}${ya.original_file_name ? ` («${ya.original_file_name}»)` : ''}` };
    return { subir: true, motivo: null };
}

/** El aviso a Fran con lo leído de un correo (uno o varios documentos subidos). */
function textoAviso(inf) {
    const l = [];
    const sub = (inf.subidos || []);
    const doc = (slot) => sub.find(s => s.slot === slot);
    const informe = doc('informe_verificacion');
    const dictamen = doc('dictamen_favorable');
    const factura = doc('factura_verificador');
    // Lo que ha FALLADO va lo PRIMERO: el WhatsApp es solo el texto (sin título) y
    // un «no cuadra» enterrado tras «Ha llegado el cierre…» no se lee (Fran, 18/11/2026).
    const problemas = problemasDe(inf);
    if (problemas.length) l.push(`⚠ HAY QUE REVISAR — ${inf.lote}${inf.subido_por ? ` (subido a mano por ${inf.subido_por})` : ''}:`, ...problemas.map(p => `- ${p}`), '');
    if (informe || dictamen) l.push(`Ha llegado el cierre de la verificación del ${inf.lote}${inf.cae ? ` (${inf.cae})` : ''} y está subido al lote${[informe && 'el informe de verificación', dictamen && 'el dictamen'].filter(Boolean).length ? `: ${[informe && 'el informe de verificación', dictamen && 'el dictamen'].filter(Boolean).join(' y ')}` : ''}.`);
    if (dictamen) {
        const d = dictamen.dictamen || {};
        l.push(d.numero_dictamen || d.decision
            ? `Dictamen ${d.numero_dictamen || ''}${d.decision ? ` · ${d.decision}` : ''}${d.fecha_emision ? ` · ${d.fecha_emision}` : ''}${Number(d.total_kwh) > 0 ? ` · ${kwh(d.total_kwh)} kWh` : ''}.`.replace(/\s+·/g, ' ·')
            : 'No se ha podido leer la cabecera del dictamen.');
    }
    if (informe) {
        const a = informe.ahorros || {};
        if (a.leido === false) l.push(`No se han podido leer los ahorros del informe (${a.error || 'sin motivo'}): «Leer los ahorros del informe» en la fase 4.`);
        else {
            const filas = a.filas || [];
            const casadas = filas.filter(f => f.expediente_id);
            l.push(`Ahorro verificado: ${kwh(a.total?.suma)} kWh en ${filas.length} actuación(es)${a.total?.total ? (a.total.cuadra ? ', cuadra con el total del informe' : `, NO cuadra con el total del informe (${kwh(a.total.total)})`) : ''}; ${casadas.length} de ${filas.length} casadas con su expediente.`);
            for (const f of filas) l.push(`- ${f.numero_expediente || f.expediente_leido || `actuación ${f.orden ?? '?'}`}: ${kwh(f.ahorro_kwh)} kWh${f.inversion_eur != null ? ` · ${eur(f.inversion_eur)} €` : ''}${f.avisos?.length ? ` (${f.avisos.join(' ')})` : ''}`);
            const otros = (a.avisos || []).filter(x => !filas.some(f => (f.avisos || []).includes(x)));
            if (otros.length) l.push(`Avisos: ${otros.join(' · ')}`);
            if (a.faltan?.length) l.push(`Expedientes del lote que el informe no cita: ${a.faltan.map(x => x.numero_expediente || x).join(', ')}.`);
            // Desde el 18/11/2026 (regla 226) lo que casa sin duda se GUARDA SOLO.
            const solos = a.aplicados_solos || [];
            const revisar = a.por_revisar || [];
            if (solos.length) l.push('', `Guardados solos en su expediente: ${solos.length} (${solos.map(x => x.numero_expediente).join(', ')}).`);
            if (a.ya_estaban?.length) l.push(`Ya estaban registrados: ${a.ya_estaban.join(', ')}.`);
            if (revisar.length) {
                l.push(`Por REVISAR a mano (fase 4, «Leer los ahorros del informe»): ${revisar.map(f => f.numero_expediente || f.expediente_leido || `actuación ${f.orden ?? '?'}`).join(', ')}`
                    + `${a.motivo_revisar ? ` — ${a.motivo_revisar}` : ''}.`);
            }
            const menores = a.menores || [];
            if (menores.length) {
                l.push('', `⚠ Verificado MENOR que lo declarado en ${menores.length}:`);
                for (const m of menores) {
                    l.push(`- ${m.numero_expediente}: ${kwh(m.kwh_verificado)} de ${kwh(m.kwh_declarado)} kWh · bono ${eur(m.bono_verificado)} € en vez de ${eur(m.bono_declarado)} € (−${eur(m.diferencia)} €)`);
                }
                l.push('Antes de pagarles, en la fase 7 se decide en cada uno: subirle el precio para pagarle lo acordado, o pagarle lo verificado. Sin decidir no entran en la remesa.');
            }
            l.push('', 'Falta registrar la inversión del dictamen: fase 4, «Leer el dictamen».');
        }
    }
    if (factura) {
        const f = factura;
        if (l.length) l.push('');
        l.push(`Factura del verificador${f.ocr?.numero_factura ? ` ${f.ocr.numero_factura}` : ''} subida al ${inf.lote}: ${Number(f.importe) > 0 ? `base ${eur(f.importe)} € → coste de verificación` : 'no se ha leído el importe: escríbelo en la fase 4'}.`);
        if (f.ocr?.avisos?.length) l.push(`Avisos de la factura: ${f.ocr.avisos.join(' · ')}`);
    }
    for (const e of inf.errores || []) l.push(`No se ha podido subir ${e.fichero}: ${e.error}`);
    l.push('', `${APP_BASE}?tab=lotes`);
    const titulo = `${problemas.length ? '⚠ REVISAR · ' : ''}${informe || dictamen
        ? `Verificación cerrada — ${inf.lote}${dictamen?.dictamen?.decision ? ` · ${dictamen.dictamen.decision}` : ''}`
        : `Factura del verificador — ${inf.lote}`}`;
    return { titulo, texto: l.join('\n'), problemas };
}

/**
 * Lo que NO ha ido solo y necesita a una persona, una línea por cosa: el informe
 * sin leer o que no cuadra, ahorros sin guardar, verificados MENORES que lo
 * declarado (regla 226), el dictamen o la factura sin leer y lo que no se subió.
 */
function problemasDe(inf) {
    const out = [];
    const sub = inf.subidos || [];
    const informe = sub.find(s => s.slot === 'informe_verificacion');
    const dictamen = sub.find(s => s.slot === 'dictamen_favorable');
    const factura = sub.find(s => s.slot === 'factura_verificador');
    if (informe) {
        const a = informe.ahorros || {};
        if (a.leido === false) out.push('No se han podido leer los ahorros del informe: NO se ha guardado ninguno.');
        else {
            if (a.total?.cuadra === false) {
                out.push(`La suma de las actuaciones (${kwh(a.total.suma)} kWh) NO cuadra con el total del informe (${kwh(a.total.total)} kWh): NO se ha guardado ningún ahorro.`);
            } else if ((a.por_revisar || []).length) {
                const r = a.por_revisar;
                out.push(`${r.length} ahorro${r.length === 1 ? '' : 's'} sin guardar, por revisar: ${r.map(f => f.numero_expediente || f.expediente_leido || `actuación ${f.orden ?? '?'}`).join(', ')}.`);
            }
            if (a.faltan?.length) out.push(`El informe no cita ${a.faltan.length} expediente${a.faltan.length === 1 ? '' : 's'} del lote: ${a.faltan.map(x => x.numero_expediente || x).join(', ')}.`);
            if ((a.menores || []).length) out.push(`Verificado MENOR que lo declarado en ${a.menores.map(m => m.numero_expediente).join(', ')}: decidir en la fase 7 antes de pagar.`);
        }
    }
    if (dictamen && !(dictamen.dictamen?.numero_dictamen || dictamen.dictamen?.decision)) out.push('No se ha podido leer la cabecera del dictamen.');
    if (factura && !(Number(factura.importe) > 0)) out.push('No se ha leído el importe de la factura del verificador.');
    if (factura?.ocr?.avisos?.length) out.push(`La factura tiene avisos: ${factura.ocr.avisos.join(' · ')}`);
    for (const e of inf.errores || []) out.push(`No se ha podido subir ${e.fichero}: ${e.error}`);
    return out;
}

// ── Con efectos ──────────────────────────────────────────────────────────────

async function avisarAdmin({ titulo, texto }) {
    try { await require('./whatsappService').sendText(adminPhone(), texto); }
    catch (e) { console.warn('[VerificacionCorreo] aviso WhatsApp:', e.message); }
    try {
        const emailService = require('./emailService');
        await emailService.sendMail({
            to: adminEmail(),
            from: process.env.ALERT_EMAIL_FROM || emailService.getFallbackSender() || undefined,
            subject: titulo, text: texto,
            html: `<pre style="font-family:system-ui,sans-serif;white-space:pre-wrap">${texto.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</pre>`,
        });
    } catch (e) { console.warn('[VerificacionCorreo] aviso email:', e.message); }
}

/**
 * Subido A MANO en la fase 4 (no por el correo): si algo no ha ido solo, el MISMO
 * aviso por WhatsApp y email (Fran, 18/11/2026: «sí, avisa también»). Si todo ha ido
 * bien no se manda nada: quien lo sube ya lo ve en pantalla. Nunca lanza.
 * @returns {Promise<string[]>} los problemas avisados
 */
async function avisarSubidaAMano(inf) {
    try {
        const aviso = textoAviso(inf);
        if (!aviso.problemas.length) return [];
        await avisarAdmin(aviso);
        return aviso.problemas;
    } catch (e) {
        console.warn('[VerificacionCorreo] aviso de subida a mano:', e.message);
        return [];
    }
}

async function buscarLote({ lote, cae }) {
    const cols = 'id, codigo, expediente_verificador, documentos_so';
    if (lote) return (await supabase.from('lotes').select(cols).eq('codigo', lote).maybeSingle()).data || null;
    if (cae) {
        const { data } = await supabase.from('lotes').select(cols).eq('expediente_verificador', cae);
        return data?.length === 1 ? data[0] : null;           // dos lotes con el mismo CAE: no se adivina
    }
    return null;
}

/**
 * Mira el buzón y sube a su lote el informe, el dictamen y la factura de Marwen.
 * @param {{ dryRun?: boolean, dias?: number, lote?: string, avisos?: boolean }} opts
 */
async function importarVerificacionDelBuzon(opts = {}) {
    const { dryRun = true, dias = DIAS_ATRAS, lote: soloLote = null } = opts;
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
            const uids = await client.search({ since: new Date(Date.now() - dias * 864e5), from: 'marwen' }, { uid: true });
            const cabeceras = [];
            if (uids?.length) for await (const m of client.fetch(uids, { uid: true, envelope: true }, { uid: true })) cabeceras.push(m);
            cabeceras.sort((a, b) => new Date(a.envelope?.date || 0) - new Date(b.envelope?.date || 0));

            for (const m of cabeceras) {
                const asunto = m.envelope?.subject || '';
                const a = leerAsunto(asunto);
                if (!a) continue;
                const lote = await buscarLote(a);
                const codigo = lote?.codigo || a.lote || null;
                if (soloLote && codigo !== String(soloLote).toUpperCase()) continue;
                const inf = { asunto, fecha: m.envelope?.date || null, tipo: a.tipo, lote: codigo, cae: a.cae, documentos: [], subidos: [], errores: [] };
                informes.push(inf);
                if (!lote) { inf.accion = 'nada'; inf.motivo = a.lote ? 'el lote no existe en la app' : `no hay un único lote con el expediente ${a.cae}`; continue; }

                const msg = await client.fetchOne(String(m.uid), { source: true }, { uid: true });
                const parsed = await simpleParser(msg.source);
                const pdfs = (parsed.attachments || [])
                    .filter(x => /pdf/i.test(x.contentType || '') || /\.pdf$/i.test(x.filename || ''))
                    .map(x => ({ x, slot: slotDePdf(x.filename, a.tipo) }))
                    .sort((p, q) => (ORDEN[p.slot] || 9) - (ORDEN[q.slot] || 9));
                if (a.tipo === 'factura' && pdfs.length > 1) pdfs.splice(1);   // una factura por correo

                for (const { x, slot } of pdfs) {
                    // El lote se relee: el documento anterior del mismo correo ya está.
                    const fresco = await buscarLote({ lote: lote.codigo });
                    const dec = decidirDocumento({ lote: fresco, slot, cae: a.cae });
                    inf.documentos.push({ fichero: x.filename, slot, subir: dec.subir, motivo: dec.motivo });
                    if (!dec.subir || dryRun) continue;
                    try {
                        const { subirDocumentoLote } = require('../routes/lotes');
                        const r = await subirDocumentoLote(lote.id, slot, { buffer: x.content, fileName: x.filename, usuario: USUARIO });
                        inf.subidos.push({
                            slot, fichero: x.filename, importe: r.documento?.importe ?? null,
                            ocr: r.ocr || null, ahorros: r.ahorros || null, dictamen: r.dictamen?.dictamen || r.documento?.dictamen || null,
                        });
                    } catch (e) {
                        inf.errores.push({ fichero: x.filename, error: e.message });
                        console.error(`[VerificacionCorreo] ${lote.codigo} ${x.filename}:`, e.message);
                    }
                }
                inf.accion = dryRun
                    ? (inf.documentos.some(d => d.subir) ? 'en_seco' : 'nada')
                    : (inf.subidos.length ? 'subido' : inf.errores.length ? 'error' : 'nada');
                if (!dryRun && avisos && (inf.subidos.length || inf.errores.length)) await avisarAdmin(textoAviso(inf));
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
        const informes = await importarVerificacionDelBuzon({ dryRun: false });
        const hechos = informes.filter(i => ['subido', 'error'].includes(i.accion));
        if (hechos.length) console.log(`[VerificacionCorreo] ${hechos.map(i => `${i.lote}: ${i.subidos.map(s => s.slot).join(', ') || i.accion}`).join(' · ')}`);
    } catch (e) {
        console.error('[VerificacionCorreo] barrido:', e.message);
    } finally {
        barriendo = false;
    }
}

let handle = null;
function start() {
    if (handle) return;
    if (!activo()) {
        console.log('[VerificacionCorreo] APAGADO (VERIFICACION_CORREO_ENABLED != true). El informe, el dictamen y la factura del verificador se suben a mano.');
        return;
    }
    setTimeout(barrer, 110 * 1000);
    handle = setInterval(barrer, INTERVALO_MS);
    console.log(`[VerificacionCorreo] mirando el buzón por el informe, el dictamen y la factura del verificador (cada ${Math.round(INTERVALO_MS / 60000)} min)`);
}

module.exports = { activo, start, barrer, importarVerificacionDelBuzon, leerAsunto, slotDePdf, decidirDocumento, textoAviso, avisarSubidaAMano, USUARIO };
