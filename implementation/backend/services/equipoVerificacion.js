// ═══════════════════════════════════════════════════════════════════════════════
// EL EQUIPO DE VERIFICACIÓN de un lote: quién lo verifica y cómo se le contacta.
// Ver docs/conocimiento/lotes/el-equipo-de-verificacion-del-lote.md.
//
// Sale de DOS sitios, que se completan:
//   1. El PDF del PLAN DE VERIFICACIÓN (slot `plan_verificacion`, fase 4): su
//      «2. Equipo de verificación» trae al VERIFICADOR JEFE con nombre, email y
//      teléfono, y al REVISOR TÉCNICO solo con el nombre (Marwen, 2026).
//   2. El CORREO con el que llega el plan («Plan de verificacion CAE-1991
//      (LOTE-2026-014)», de cae@marwen.es): «Soy Laura Gómez Ruiz, verificador
//      jefe…», «Correo de contacto: lgomez@marwen.es» y, EN COPIA, el email de cada
//      miembro del equipo — el del revisor solo está ahí.
//
// REGLA — un email solo se le pone a una persona si ESTÁ escrito junto a ella (en el
// plan) o si su dirección CASA con su nombre (`psanz` ↔ Francisco Jesús
// CHARRIEL). Nunca se compone un email a partir del nombre.
//
// Se guarda en la entrada del documento (`documentos_so[plan_verificacion].equipo`),
// como los códigos del certificado CAE: identifica al papel, no toca nada más.
// ═══════════════════════════════════════════════════════════════════════════════
const supabase = require('./supabaseClient');

const lower = (s) => String(s || '').trim().toLowerCase();
const nowIso = () => new Date().toISOString();
const sinTildes = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const tokensNombre = (nombre) => sinTildes(nombre).toLowerCase().replace(/[^a-z\s]/g, ' ')
    .split(/\s+/).filter(Boolean);

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[a-z]{2,}$/i;
const limpioEmail = (e) => {
    const v = lower(e).replace(/^mailto:/, '');
    return EMAIL_RE.test(v) ? v : null;
};

// Buzones genéricos: nunca son de una persona del equipo.
const GENERICOS = /^(cae|info|noreply|no-reply|notificaciones|administracion|contabilidad)@/i;
// Nuestros propios dominios no son del verificador.
const PROPIOS = /@(brokergy\.es|s2e2\.es)$/i;

/** «900 12 34 56» / «+34900123456» → «900123456». Lo que no parece un teléfono, null. */
function telefonoLimpio(t) {
    if (!t) return null;
    let d = String(t).replace(/[^\d+]/g, '');
    if (d.startsWith('+34')) d = d.slice(3);
    else if (d.startsWith('0034')) d = d.slice(4);
    d = d.replace(/\D/g, '');
    return d.length >= 9 && d.length <= 12 ? d : null;
}

/**
 * ¿La dirección es de esa persona? Casa la parte de antes de la @ con la inicial de
 * su nombre + uno de sus apellidos («lgomez» ↔ Laura MARTÍN Cuesta), o con un
 * apellido de 5 letras o más precedido de la inicial. No adivina nada más.
 */
function emailCasaConNombre(email, nombre) {
    const local = lower(email).split('@')[0].replace(/[^a-z]/g, '');
    const t = tokensNombre(nombre);
    if (!local || t.length < 2) return false;
    const ini = t[0][0];
    if (!local.startsWith(ini)) return false;
    return t.slice(1).some(ap => ap.length >= 3 && (local === ini + ap || (ap.length >= 5 && local.includes(ap))));
}

/**
 * Lo que dice el CORREO del plan.
 * @param {{asunto, texto, cc?: string[], para?: string[]}} c
 */
function leerCorreoPlan({ asunto = '', texto = '', cc = [], para = [] } = {}) {
    const plano = String(texto || '').replace(/\s+/g, ' ');
    const jefe = plano.match(/Soy\s+([^,]{3,80}?),\s*verificador(?:a)?\s+jef[ea]/i);
    const contacto = plano.match(/Correo de contacto:\s*([^\s<>,;]+@[^\s<>,;]+)/i);
    const exp = `${asunto} ${plano}`.match(/\bCAE-\d{3,6}\b/i);
    const emails = [...new Set([...cc, ...para].map(limpioEmail).filter(Boolean))]
        .filter(e => !GENERICOS.test(e) && !PROPIOS.test(e));
    return {
        expediente_cae: exp ? exp[0].toUpperCase() : null,
        jefe_nombre: jefe ? jefe[1].trim() : null,
        contacto: contacto ? limpioEmail(contacto[1].replace(/[.)]+$/, '')) : null,
        emails,
    };
}

const persona = (p) => ({ nombre: p?.nombre || null, email: limpioEmail(p?.email), telefono: telefonoLimpio(p?.telefono) });
const vacia = (p) => !p || (!p.nombre && !p.email && !p.telefono);

/**
 * Junta lo del plan, lo del correo y lo que ya hubiera (lo ya guardado solo rellena
 * huecos: lo nuevo manda).
 * @param {{ plan?: object, correo?: object, previo?: object }} fuentes
 * @returns {object|null} `{ verificador_jefe, revisor_tecnico, organismo, expediente_cae, fuentes, actualizado_at }`
 */
function componerEquipo({ plan = null, correo = null, previo = null } = {}) {
    const jefe = persona(plan?.verificador_jefe);
    const revisor = persona(plan?.revisor_tecnico);

    if (correo) {
        if (!jefe.nombre && correo.jefe_nombre) jefe.nombre = correo.jefe_nombre;
        // «Correo de contacto» es el del verificador jefe (lo dice el propio correo:
        // «contacte al verificador jefe asignado… Correo de contacto: …»).
        if (!jefe.email && correo.contacto) jefe.email = correo.contacto;
        // Las copias: a cada uno, la suya — solo si casa con su nombre.
        for (const e of correo.emails || []) {
            if (e === jefe.email || e === revisor.email) continue;
            if (!revisor.email && revisor.nombre && emailCasaConNombre(e, revisor.nombre)) revisor.email = e;
            else if (!jefe.email && jefe.nombre && emailCasaConNombre(e, jefe.nombre)) jefe.email = e;
        }
    }

    for (const [p, ant] of [[jefe, previo?.verificador_jefe], [revisor, previo?.revisor_tecnico]]) {
        if (!ant) continue;
        // Lo guardado rellena huecos, pero un email de OTRA persona no se arrastra.
        if (!p.nombre) p.nombre = ant.nombre || null;
        if (!p.email && ant.email && (!p.nombre || !ant.nombre || ant.nombre === p.nombre)) p.email = ant.email;
        if (!p.telefono && ant.telefono && (!ant.nombre || ant.nombre === p.nombre)) p.telefono = ant.telefono;
    }

    if (vacia(jefe) && vacia(revisor)) return null;
    const fuentes = [...new Set([...(previo?.fuentes || []), ...(plan ? ['plan'] : []), ...(correo ? ['correo'] : [])])];
    return {
        verificador_jefe: vacia(jefe) ? null : jefe,
        revisor_tecnico: vacia(revisor) ? null : revisor,
        organismo: plan?.organismo || previo?.organismo || null,
        expediente_cae: plan?.expediente_cae || correo?.expediente_cae || previo?.expediente_cae || null,
        fuentes,
        actualizado_at: nowIso(),
    };
}

/** Lee el PDF del plan y lo junta con lo que ya hubiera. Lanza si el lector falla. */
async function equipoDePdf(buffer, { previo = null, correo = null } = {}) {
    const { leerPlanVerificacion } = require('./loteOcrService');
    const plan = await leerPlanVerificacion(buffer);
    return { plan, equipo: componerEquipo({ plan, correo, previo }) };
}

/** Una línea para el historial: «Laura Gómez Ruiz (jefe) · Pedro Antonio Sanz Vidal (revisor)». */
function resumenEquipo(eq) {
    if (!eq) return '';
    return [
        eq.verificador_jefe?.nombre && `${eq.verificador_jefe.nombre} (verificador jefe)`,
        eq.revisor_tecnico?.nombre && `${eq.revisor_tecnico.nombre} (revisor técnico)`,
    ].filter(Boolean).join(' · ');
}

// ── Guardar el plan (y su equipo) en el lote ─────────────────────────────────

/**
 * Cuelga el equipo de la entrada del plan y, si el lote aún no tiene el PDF, lo
 * archiva en su carpeta de documentación como si se hubiera subido a mano. Rellena
 * el nº de expediente del verificador si faltaba. Relee `documentos_so` justo antes
 * de escribir.
 */
async function guardarPlanEnLote(lote, { buffer = null, nombreOriginal = null, equipo, origen, usuario = 'SISTEMA' }) {
    const driveService = require('./driveService');
    const { CARPETA_DOCS, nombreDocLote, LOTE_DOC_SLOTS } = require('./loteDocs');
    const { data: fresh, error } = await supabase.from('lotes')
        .select('id, codigo, drive_folder_id, documentos_so, historial, expediente_verificador').eq('id', lote.id).maybeSingle();
    if (error || !fresh) throw new Error(`lote ${lote.codigo}: ${error?.message || 'no encontrado'}`);
    const docs = Array.isArray(fresh.documentos_so) ? [...fresh.documentos_so] : [];
    const historial = Array.isArray(fresh.historial) ? [...fresh.historial] : [];
    let idx = docs.findIndex(d => d?.key === 'plan_verificacion');
    let archivado = false;

    if (idx < 0) {
        if (!buffer) throw new Error('el lote no tiene el plan y no hay PDF que archivar');
        if (!fresh.drive_folder_id) throw new Error('el lote no tiene carpeta en Drive');
        const carpeta = await driveService.getOrCreateSubfolder(fresh.drive_folder_id, CARPETA_DOCS(fresh.codigo))
            || fresh.drive_folder_id;
        const base = nombreDocLote('plan_verificacion', { codigo: fresh.codigo });
        const name = /\.pdf$/i.test(base) ? base : `${base}.pdf`;
        // Si ya está en Drive con su nombre (alguien lo dejó allí a mano), se enlaza ese.
        const yaId = await driveService.findFileByName(carpeta, name).catch(() => null);
        const saved = yaId
            ? { id: yaId, link: `https://drive.google.com/file/d/${yaId}/view` }
            : await driveService.saveFileToFolder(carpeta, name, 'application/pdf', buffer);
        if (!saved?.id) throw new Error('no se pudo guardar el plan en Drive');
        docs.push({
            key: 'plan_verificacion', tipo: 'plan_verificacion',
            label: LOTE_DOC_SLOTS.plan_verificacion.label,
            expediente_id: null, file_name: name, anchor: null, fixedBox: null,
            draft_link: saved.link, draft_file_id: saved.id,
            original_file_name: nombreOriginal || null,
            signed_link: null, signed_file_id: null, sent_at: null, signed_at: null,
            uploaded_at: nowIso(), origen: origen || null,
        });
        idx = docs.length - 1;
        archivado = true;
        historial.push({
            id: `${Date.now()}_doc_plan_verificacion`, tipo: 'sistema',
            texto: `Archivado "${docs[idx].label}" (${name})${origen ? `, del ${origen}` : ''}.`,
            fecha: nowIso(), usuario,
        });
    }

    docs[idx] = { ...docs[idx], equipo };
    const update = { documentos_so: docs, historial, updated_at: nowIso() };
    if (equipo) {
        historial.push({
            id: `${Date.now()}_equipo_verificacion`, tipo: 'sistema',
            texto: `Equipo de verificación: ${resumenEquipo(equipo)}${origen ? `, del ${origen}` : ''}.`,
            fecha: nowIso(), usuario,
        });
    }
    if (!fresh.expediente_verificador && equipo?.expediente_cae) update.expediente_verificador = equipo.expediente_cae;
    const { error: eUp } = await supabase.from('lotes').update(update).eq('id', lote.id);
    if (eUp) throw new Error(`guardar el plan en ${fresh.codigo}: ${eUp.message}`);
    // El plan NO mueve el estado del lote (`estadoSegunDocs` no lo mira): no se
    // sincroniza, para que archivarlo no toque nada más que su entrada.
    return { archivado, documento: docs[idx] };
}

// ── El buzón: los correos «Plan de verificacion CAE-… (LOTE-…)» ──────────────
// El mismo buzón que lee firmadosSoCorreo (LOTE_SO_SMTP_*), en SOLO LECTURA. Un lote
// cuyo plan ya trae el equipo del CORREO no se vuelve a mirar (salvo `forzar`).

const DIAS_ATRAS = 120;
const INTERVALO_MS = 30 * 60 * 1000;
const activo = () => String(process.env.PLAN_VERIFICACION_CORREO_ENABLED || '').toLowerCase() === 'true';

/**
 * @param {{ dryRun?: boolean, dias?: number, forzar?: boolean, lote?: string }} opts
 *        `dryRun` (por defecto) solo dice lo que haría; `lote` mira solo ese código.
 * @returns {Promise<Array>} un informe por correo
 */
async function importarPlanesDelBuzon(opts = {}) {
    const { dryRun = true, dias = DIAS_ATRAS, forzar = false, lote: soloLote = null } = opts;
    const { ImapFlow } = require('imapflow');
    const { simpleParser } = require('mailparser');
    const { codigosLote } = require('./firmadosSoCorreo');
    const user = process.env.LOTE_SO_SMTP_USER;
    const pass = process.env.LOTE_SO_SMTP_PASS;
    if (!user || !pass) throw new Error('Faltan LOTE_SO_SMTP_USER / LOTE_SO_SMTP_PASS: no se puede leer el buzón');

    const { data: lotes, error } = await supabase.from('lotes')
        .select('id, codigo, documentos_so, expediente_verificador');
    if (error) throw new Error(`lotes: ${error.message}`);
    const loteDe = Object.fromEntries((lotes || []).map(l => [String(l.codigo || '').toUpperCase(), l]));

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
            const uids = await client.search({ since: new Date(Date.now() - dias * 864e5), subject: 'Plan de verificaci' }, { uid: true });
            const cabeceras = [];
            if (uids?.length) {
                for await (const m of client.fetch(uids, { uid: true, envelope: true }, { uid: true })) cabeceras.push(m);
            }
            // Lo más nuevo primero: si llegaron dos planes del mismo lote, manda el último.
            cabeceras.sort((a, b) => new Date(b.envelope?.date || 0) - new Date(a.envelope?.date || 0));
            const hechos = new Set();

            for (const m of cabeceras) {
                const env = m.envelope || {};
                const asunto = env.subject || '';
                const informe = { asunto, fecha: env.date, lote: null, accion: null, motivo: null, equipo: null };
                informes.push(informe);
                if (!/plan de verificaci/i.test(asunto) || /^\s*(re|rv|fw|fwd)\s*:/i.test(asunto)) {
                    if (soloLote) { informes.pop(); continue; }
                    informe.accion = 'ignorado'; informe.motivo = 'no es el correo del plan'; continue;
                }
                const codigos = codigosLote(asunto);
                if (codigos.length !== 1) { informe.accion = 'ignorado'; informe.motivo = 'sin un código de lote en el asunto'; continue; }
                informe.lote = codigos[0];
                if (soloLote && codigos[0] !== String(soloLote).toUpperCase()) { informes.pop(); continue; }
                const lote = loteDe[codigos[0]];
                if (!lote) { informe.accion = 'ignorado'; informe.motivo = 'el lote no existe en la app'; continue; }
                if (hechos.has(lote.codigo)) { informe.accion = 'ignorado'; informe.motivo = 'hay un plan más reciente de este lote'; continue; }
                hechos.add(lote.codigo);
                const plan = (lote.documentos_so || []).find(d => d?.key === 'plan_verificacion');
                if (!forzar && plan?.equipo?.fuentes?.includes('correo')) {
                    informe.accion = 'ya_estaba'; informe.motivo = 'el equipo ya se leyó de este correo'; informe.equipo = plan.equipo; continue;
                }

                const msg = await client.fetchOne(String(m.uid), { source: true }, { uid: true });
                const parsed = await simpleParser(msg.source);
                const dirs = (campo) => (parsed[campo]?.value || []).map(v => v.address);
                const correo = leerCorreoPlan({ asunto, texto: parsed.text || '', cc: dirs('cc'), para: dirs('to') });
                const pdfs = (parsed.attachments || [])
                    .filter(a => lower(a.contentType) === 'application/pdf' || /\.pdf$/i.test(a.filename || ''));
                const pdf = pdfs.find(a => /plan/i.test(a.filename || '')) || pdfs[0] || null;

                let equipo = null; let avisoLector = null;
                if (pdf) {
                    try { ({ equipo } = await equipoDePdf(pdf.content, { previo: plan?.equipo || null, correo })); }
                    catch (e) { avisoLector = `no se pudo leer el PDF (${e.message}); va solo lo del correo`; }
                }
                if (!equipo) equipo = componerEquipo({ correo, previo: plan?.equipo || null });
                informe.equipo = equipo;
                informe.motivo = avisoLector;
                if (!equipo) { informe.accion = 'ignorado'; informe.motivo = 'ni el PDF ni el correo dicen quién verifica'; continue; }
                if (!plan && !pdf) { informe.accion = 'ignorado'; informe.motivo = 'el lote no tiene el plan y el correo no lo adjunta'; continue; }

                const fechaEs = env.date ? new Date(env.date).toLocaleDateString('es-ES') : '';
                informe.archivaria = !plan;
                if (dryRun) { informe.accion = 'en_seco'; continue; }
                const r = await guardarPlanEnLote(lote, {
                    buffer: pdf?.content || null, nombreOriginal: pdf?.filename || null, equipo,
                    origen: `correo del verificador${fechaEs ? ` del ${fechaEs}` : ''}`, usuario: 'CORREO VERIFICADOR',
                });
                informe.accion = r.archivado ? 'archivado' : 'actualizado';
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
        const informes = await importarPlanesDelBuzon({ dryRun: false, dias: 30 });
        const hechos = informes.filter(i => i.accion === 'archivado' || i.accion === 'actualizado');
        if (hechos.length) console.log(`[PlanVerificacion] ${hechos.map(i => `${i.lote}: ${resumenEquipo(i.equipo)}`).join(' · ')}`);
    } catch (e) {
        console.error('[PlanVerificacion] barrido:', e.message);
    } finally {
        barriendo = false;
    }
}

let handle = null;
function start() {
    if (handle) return;
    if (!activo()) {
        console.log('[PlanVerificacion] APAGADO (PLAN_VERIFICACION_CORREO_ENABLED != true). El equipo se lee al subir el plan a mano.');
        return;
    }
    setTimeout(barrer, 90 * 1000);
    handle = setInterval(barrer, INTERVALO_MS);
    console.log(`[PlanVerificacion] mirando el buzón por los planes de verificación (cada ${Math.round(INTERVALO_MS / 60000)} min)`);
}

module.exports = {
    activo, start, barrer, importarPlanesDelBuzon, guardarPlanEnLote,
    equipoDePdf, componerEquipo, leerCorreoPlan, emailCasaConNombre, telefonoLimpio, resumenEquipo,
};
