// El CANAL de trabajo entre Claude y Fran por WhatsApp (etiqueta MOIA).
//
// Claude trabaja como un compañero más: da de alta una oportunidad, y ANTES de
// enviarle la propuesta al instalador o al cliente le escribe a Fran —desde el
// WhatsApp de la EMPRESA a su móvil PERSONAL— con el resumen y la pregunta:
// «¿se la envío así o la quieres revisar tú?». Lo que Fran conteste decide.
//
//   node scripts/asistente_whatsapp.js avisar 26RES060_OP267 [--a partner] [--nota "…"]   EN SECO
//   node scripts/asistente_whatsapp.js avisar 26RES060_OP267 --enviar                      lo manda
//   node scripts/asistente_whatsapp.js leer [--desde "AAAA-MM-DD HH:MM"] [--esperar 20]    lee lo que ha contestado
//   node scripts/asistente_whatsapp.js decir "texto" [--enviar]                            un mensaje suelto
//
// - El destinatario es el chat del móvil personal de Fran (ASISTENTE_WHATSAPP_TEL),
//   el que lleva la etiqueta MOIA. Nunca otro: este canal no habla con clientes.
// - Todo pasa por el VPS (la sesión de WhatsApp es suya) con la clave interna:
//   /api/whatsapp/send-text para escribir y /api/whatsapp/conversacion para leer.
// - Por defecto EN SECO. `avisar --enviar` deja apuntado en scratch/asistente/ qué
//   oportunidad espera respuesta y desde cuándo, y `leer` parte de ahí.
// - `leer` solo ENSEÑA la respuesta (y transcribe las notas de voz): qué significa
//   lo decide Claude, y enviar la propuesta lo hace `claude_propuesta.js`.
const path = require('path');
const fs = require('fs');
require(path.join(__dirname, '../node_modules/dotenv')).config({ path: path.join(__dirname, '../.env') });
const { createClient } = require(path.join(__dirname, '../node_modules/@supabase/supabase-js'));

const API = String(process.env.BROKERGY_API_URL || 'https://app.brokergy.es').replace(/\/+$/, '');
// El número va en el .env, NUNCA en el código (el repo es público).
const TEL = String(process.env.ASISTENTE_WHATSAPP_TEL || '').replace(/\D/g, '');
// EL CANAL: el grupo «BROKERGY - CHAT» (ASISTENTE_WHATSAPP_GRUPO, «…@g.us») si está configurado; si no,
// el chat 1:1 con Fran. En el grupo SOLO cuentan los mensajes de Fran: lo que escriba otro miembro se
// ignora (cualquiera del grupo podría si no pedirle enviar propuestas o tocar expedientes).
const GRUPO = String(process.env.ASISTENTE_WHATSAPP_GRUPO || '').trim();
const CANAL = GRUPO || TEL;
const ESTADO = path.join(__dirname, '..', 'scratch', 'asistente');
// Los identificadores con los que escribe Fran en un grupo: su número (@c.us) y su @lid, que WhatsApp
// usa cada vez más. El @lid lo comunica el backend con cada aviso (lo ha resuelto él) y se guarda aquí;
// ASISTENTE_WHATSAPP_LID lo siembra.
const IDS_FRAN = path.join(ESTADO, 'fran_ids.json');
function idsDeFran() {
    let ids = [];
    try { ids = JSON.parse(fs.readFileSync(IDS_FRAN, 'utf8')); } catch { /* aún ninguno */ }
    return [...new Set([`${TEL}@c.us`, ...String(process.env.ASISTENTE_WHATSAPP_LID || '').split(',').map(s => s.trim()).filter(Boolean), ...ids])];
}
function apuntarIdDeFran(id) {
    if (!id || !/@(c\.us|lid)$/.test(id) || idsDeFran().includes(id)) return;
    fs.mkdirSync(ESTADO, { recursive: true });
    fs.writeFileSync(IDS_FRAN, JSON.stringify([...idsDeFran(), id]));
}
/** ¿Este mensaje lo ha escrito Fran? En el 1:1 basta con que no sea nuestro; en el grupo, su autor. */
function esDeFran(m) {
    if (m.de_mi) return false;
    return GRUPO ? idsDeFran().includes(m.autor) : true;
}
/** Lee la conversación del canal (el grupo o el 1:1). */
function leerCanal(dias, ms = 60_000) {
    return api('/api/whatsapp/conversacion', { method: 'POST', body: GRUPO ? { chatId: GRUPO, dias } : { telefono: TEL, dias }, ms });
}
const PENDIENTE = path.join(ESTADO, 'pendiente.json');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const [, , ORDEN, ...RESTO] = process.argv;
const bandera = n => RESTO.includes(`--${n}`);
function opt(n) {
    const i = RESTO.indexOf(`--${n}`);
    return i >= 0 && RESTO[i + 1] && !RESTO[i + 1].startsWith('--') ? RESTO[i + 1] : null;
}
const POS = RESTO.filter((a, i) => !a.startsWith('--') && !(i > 0 && RESTO[i - 1].startsWith('--') && !['--enviar'].includes(RESTO[i - 1])));

const miles = (n, dec = 0) => {
    const [ent, frac] = Math.abs(Number(n)).toFixed(dec).split('.');
    return `${Number(n) < 0 ? '-' : ''}${ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}${frac ? `,${frac}` : ''}`;
};
const eur = n => (n == null || n === '' || Number.isNaN(Number(n)) ? '—' : `${miles(n, 0)} €`);
const hora = t => new Date(t * 1000).toLocaleString('es-ES', {
    timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
});

async function api(ruta, { method = 'GET', body = null, binario = false, ms = 120_000 } = {}) {
    const key = process.env.INTERNAL_API_KEY;
    if (!key) throw new Error('Falta INTERNAL_API_KEY en el .env del backend.');
    const r = await fetch(`${API}${ruta}`, {
        method,
        headers: { 'x-internal-key': key, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(ms),
    });
    if (!r.ok) {
        let msg = `${r.status}`;
        try { msg = (await r.json()).error || msg; } catch { /* sin cuerpo */ }
        throw new Error(`${ruta} → ${msg}`);
    }
    if (binario) return { buffer: Buffer.from(await r.arrayBuffer()), mimetype: r.headers.get('content-type') || '' };
    return r.json();
}

async function mandar(texto) {
    if (!TEL) throw new Error('Falta ASISTENTE_WHATSAPP_TEL en el .env (el móvil personal de Fran).');
    const out = await api('/api/whatsapp/send-text', { method: 'POST', body: { phone: CANAL, message: texto } });
    if (out && out.ok === false) throw new Error(out.error || 'WhatsApp no lo ha aceptado');
    return out;
}

// ─── El resumen de una oportunidad ──────────────────────────────────────────

const MODOS = { partner: 'al instalador (partner)', cliente: 'al cliente', instalador: 'al instalador asociado' };

async function resumen(idOp, { a = 'partner', nota = null } = {}) {
    const { data: o, error } = await sb.from('oportunidades')
        .select(`id, id_oportunidad, ficha, prescriptor_id, cliente_id, ref_catastral,
            r:datos_calculo->result, i:datos_calculo->inputs, h:datos_calculo->historial, estado:datos_calculo->>estado`)
        .eq('id_oportunidad', idOp).maybeSingle();
    if (error) throw new Error(error.message);
    if (!o) throw new Error(`No existe la oportunidad ${idOp}.`);
    const [{ data: p }, { data: c }] = await Promise.all([
        o.prescriptor_id ? sb.from('prescriptores').select('razon_social, acronimo').eq('id_empresa', o.prescriptor_id).maybeSingle() : { data: null },
        o.cliente_id ? sb.from('clientes').select('nombre_razon_social, apellidos').eq('id_cliente', o.cliente_id).maybeSingle() : { data: null },
    ]);
    const r = o.r || {};
    const f = r.financials || {};
    const i = o.i || {};
    const sup = Number(i.superficie) || null;
    const kwh = r.savings?.savingsKwh;
    const alta = (o.h || []).filter(e => /alta_whatsapp|Alta automática/.test(`${e.id} ${e.texto || ''}`)).pop();
    const revisar = alta?.texto?.match(/Por revisar: ([^\n]*)/)?.[1];
    const partner = p ? (p.acronimo || p.razon_social) : 'BROKERGY (directo)';
    const cliente = c ? [c.nombre_razon_social, c.apellidos].filter(Boolean).join(' ') : '—';

    const lineas = [
        `*Fran, ya tengo hecha la oportunidad ${o.id_oportunidad}*`,
        `${cliente} · de ${partner}`,
        '',
        `🏠 ${sup ? `${miles(sup)} m²` : '— m²'} · demanda ${r.q_net ? miles(r.q_net, 1) : '—'} kWh/m²·año`,
        `🔥 ${[i.boilerHeatingType || i.fuelType || 'Caldera', i.placa_caldera && [i.placa_caldera.marca, i.placa_caldera.modelo].filter(Boolean).join(' '),
            i.placa_caldera?.potencia_kw && `${miles(i.placa_caldera.potencia_kw, 1)} kW`].filter(Boolean).join(' · ')}`
            + ` · η ${i.boilerEff != null ? miles(i.boilerEff, 2) : '—'}`,
        `♨️ Aerotermia ${i.aerothermiaModel || 'genérica'} · SCOP ${i.scopHeating != null ? miles(i.scopHeating, 2) : '—'}${i.changeAcs ? ' · con ACS' : ' · sin ACS'}`,
        `💶 Presupuesto ${eur(f.presupuesto ?? i.presupuesto)}${i.presupuestoEstimado ? ' (ESTIMADO)' : ''}`,
        '',
        `⚡ Ahorro: *${kwh ? miles(kwh / 1000, 2) : '—'} MWh/año*`,
        `💰 Bono CAE: *${eur(f.caeBonus)}*`,
        `🧾 IRPF: ${eur(f.irpfDeduction)} · Ayuda total: *${eur(f.totalAyuda)}*`,
        `📈 Margen Brokergy: ${eur(f.profitBrokergy)}`,
    ];
    if (revisar) lineas.push('', `⚠️ Por revisar: ${revisar}`);
    if (nota) lineas.push('', `📝 ${nota}`);
    lineas.push(
        '',
        `¿Se la envío así ${MODOS[a] || a} o la quieres revisar tú?`,
        '👉 Contesta *ENVÍALA* o *LA REVISO YO* (o dime qué cambio).',
        `🔗 https://app.brokergy.es/?op=${o.id_oportunidad}`,
    );
    return { texto: lineas.join('\n'), op: o.id_oportunidad, estado: o.estado };
}

async function avisar() {
    const idOp = POS[0];
    if (!idOp) throw new Error('Uso: avisar <26RES060_OPnnn> [--a partner|cliente|instalador] [--nota "…"] [--enviar]');
    const a = opt('a') || 'partner';
    const { texto, op, estado } = await resumen(idOp, { a, nota: opt('nota') });
    console.log(`Para: ${GRUPO ? `el grupo ${GRUPO}` : `${TEL} (chat 1:1 de Fran)`} · oportunidad en ${estado}\n${'─'.repeat(70)}\n${texto}\n${'─'.repeat(70)}`);
    if (!bandera('enviar')) { console.log('EN SECO. Vuelve a lanzarlo con --enviar.'); return; }
    await mandar(texto);
    fs.mkdirSync(ESTADO, { recursive: true });
    fs.writeFileSync(PENDIENTE, JSON.stringify({ op, a, t: Math.floor(Date.now() / 1000), tel: TEL }, null, 2));
    console.log(`✓ Enviado. Esperando respuesta para ${op} (apuntado en ${PENDIENTE}).`);
}

async function decir() {
    const texto = POS.join(' ').trim();
    if (!texto) throw new Error('Uso: decir "texto" [--enviar]');
    console.log(`Para: ${CANAL}\n${texto}`);
    if (!bandera('enviar')) { console.log('EN SECO.'); return; }
    await mandar(texto);
    console.log('✓ Enviado.');
}

// ─── Leer la respuesta ──────────────────────────────────────────────────────

function segundosMadrid(txt) {
    const m = String(txt).match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
    if (!m) throw new Error('--desde va como "AAAA-MM-DD HH:MM" (hora de Madrid)');
    const comoUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
    // Lo que marca el reloj de Madrid en ese instante, leído como si fuera UTC: la diferencia es el huso.
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(comoUtc)).map(x => [x.type, x.value]));
    const enMadrid = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
    return Math.floor((comoUtc - (enMadrid - comoUtc)) / 1000);
}

async function transcribir(m) {
    try {
        const f = await api(`/api/whatsapp/conversacion/adjunto?msg=${encodeURIComponent(m.id)}`, { binario: true });
        const { llamarGemini } = require('../services/placaOcrService');
        const r = await llamarGemini([{ buffer: f.buffer, mimeType: (f.mimetype || 'audio/ogg').split(';')[0] }], {
            prompt: 'Transcribe literalmente esta nota de voz en español. No resumas: copia lo que dice.',
            schema: { type: 'object', properties: { transcripcion: { type: 'string' } }, required: ['transcripcion'] },
            etiqueta: 'asistente', maxTokens: 2048,
        });
        return r.transcripcion;
    } catch (e) {
        return `[nota de voz sin transcribir: ${e.message}]`;
    }
}

async function respuestas(desde) {
    const conv = await leerCanal(3);
    const suyos = (conv.mensajes || []).filter(m => esDeFran(m) && m.t > desde);
    for (const m of suyos) {
        // eslint-disable-next-line no-await-in-loop
        if (/ptt|audio/.test(m.tipo)) m.texto = `🎤 ${await transcribir(m)}`;
    }
    return suyos;
}

async function leer() {
    const pend = fs.existsSync(PENDIENTE) ? JSON.parse(fs.readFileSync(PENDIENTE, 'utf8')) : null;
    const desde = opt('desde') ? segundosMadrid(opt('desde')) : (pend?.t || Math.floor(Date.now() / 1000) - 3600);
    const esperar = Number(opt('esperar')) || 0;             // minutos
    const fin = Date.now() + esperar * 60_000;
    if (pend) console.log(`Esperando respuesta sobre ${pend.op} (avisado ${hora(pend.t)}).`);
    for (;;) {
        // eslint-disable-next-line no-await-in-loop
        const r = await respuestas(desde);
        if (r.length) {
            for (const m of r) console.log(`${hora(m.t)}  FRAN  ${m.texto || `[${m.tipo}]`}`);
            return;
        }
        if (Date.now() >= fin) { console.log('Sin respuesta todavía.'); process.exitCode = 2; return; }
        // eslint-disable-next-line no-await-in-loop
        await new Promise(res => setTimeout(res, 30_000));
    }
}

module.exports = { api, mandar, transcribir, TEL, GRUPO, CANAL, esDeFran, leerCanal, apuntarIdDeFran, idsDeFran };

const ORDENES = { avisar, decir, leer };
if (require.main === module) (async () => {
    const f = ORDENES[ORDEN];
    if (!f) { console.log('Órdenes: avisar <OP> · leer · decir "texto"   (ver la cabecera del fichero)'); return; }
    try { await f(); } catch (e) { console.error(`✗ ${e.message}`); process.exitCode = 1; }
})();
