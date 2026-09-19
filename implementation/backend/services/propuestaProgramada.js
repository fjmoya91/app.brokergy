// ─────────────────────────────────────────────────────────────────────────────
// PROGRAMAR el envío de una propuesta — el despachador.
//
// El envío de una propuesta lo orquesta el navegador (EnviarPropuestaModal):
// decide a quién, por dónde y con qué texto, registra la versión —que rasteriza
// y archiva el PDF— y luego manda el email y el WhatsApp. Programarlo significa
// que ese MISMO recorrido lo hace el servidor a la hora elegida, con el
// ordenador de quien lo programó apagado.
//
// REGLA — el despachador NO vuelve a decidir nada. El plan llega hecho desde el
// popup (grupos, mensajes por persona, canales, el HTML del documento) y aquí
// solo se replica. Si recompusiera el mensaje o volviera a resolver los
// destinatarios, saldría una propuesta distinta de la que se revisó antes de
// pulsar — y nadie estaría delante para verlo.
//
// REGLA — se delega en las MISMAS rutas que usa el navegador
// (`propuesta/version`, `send-proposal`, `propuesta/version/:v`, `estado`),
// llamadas con `x-internal-key` igual que hace `routes/acciones.js`. Así el
// número de versión, el PDF archivado en Drive, la vista web del enlace, el
// movimiento de la carpeta y la línea del historial son los mismos que si lo
// hubieras enviado a mano. Una segunda implementación de "enviar una propuesta"
// diverge el día que se toque una de las dos.
//
// REGLA — si el PDF no se puede preparar, NO sale nada. Es el mismo criterio que
// el envío manual y que el CIFO: una propuesta que no queda archivada es
// exactamente el agujero que el versionado cerró.
//
// REGLA — nace APAGADO (`PROPUESTA_PROGRAMADA_ENABLED`). Dos backends contra la
// misma base —el del VPS y el de tu portátil— barrerían la misma tabla, y el
// claim atómico evita el envío doble pero no evita que salga desde LOCAL, con
// su WhatsApp y su SMTP. La palanca es la misma idea que `CEE_ENTREGA_AUTO` y
// `BOT_WHATSAPP_ENABLED`.
// ─────────────────────────────────────────────────────────────────────────────

const axios = require('axios');
const supabase = require('./supabaseClient');
const whatsappService = require('./whatsappService');
const emailService = require('./emailService');

const TABLA = 'propuestas_programadas';

// Columnas que se pueden leer sin arrastrar el documento entero: `html_pdf` y
// `html_email` pesan ~350 KB cada una (regla 21), así que NUNCA van en una
// consulta que devuelva varias filas ni en nada que vea el frontend.
const SIN_HTML = 'id, oportunidad_id, id_oportunidad, enviar_at, estado, creada_por, created_at, enviada_at, cancelada_at, cancelada_por, version, resultado, error';

const API = () => `http://127.0.0.1:${process.env.PORT_EFECTIVO || process.env.PORT || 3000}/api`;
const cabeceraInterna = () => ({ 'x-internal-key': process.env.INTERNAL_API_KEY || '' });

const activo = () => String(process.env.PROPUESTA_PROGRAMADA_ENABLED || '').toLowerCase() === 'true';

const INTERVALO_MS = Number(process.env.PROPUESTA_PROGRAMADA_INTERVALO_MS || 60 * 1000);
// Cuánto se admite programar hacia adelante. Más allá de esto el documento que
// se archivó deja de describir la obra de la que se habla.
const MAX_DIAS = Number(process.env.PROPUESTA_PROGRAMADA_MAX_DIAS || 90);
// Margen mínimo: programar "para dentro de diez segundos" es enviar ahora, y el
// barrido tarda hasta un minuto en verlo.
const MIN_MS = 60 * 1000;

const adminPhone = () => process.env.WHATSAPP_ADMIN_CHAT || '34623926179';
const adminEmail = () => process.env.ADMIN_EMAIL || 'franciscojavier.moya.s2e2@gmail.com';

const fechaEs = (iso) => {
    try {
        return new Date(iso).toLocaleString('es-ES', {
            timeZone: 'Europe/Madrid',
            day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit',
        });
    } catch (_) { return iso; }
};

// ── Validación de la fecha ───────────────────────────────────────────────────
// Devuelve { ok, at, motivo }. La hora llega en ISO desde el navegador (que la
// compone en la zona del usuario), así que aquí solo se compara contra ahora.
function validarFecha(valor) {
    const at = new Date(valor);
    if (!valor || Number.isNaN(at.getTime())) return { ok: false, motivo: 'La fecha y hora no son válidas.' };
    const ahora = Date.now();
    if (at.getTime() < ahora + MIN_MS) return { ok: false, motivo: 'Esa hora ya ha pasado. Elige al menos un minuto por delante.' };
    if (at.getTime() > ahora + MAX_DIAS * 24 * 3600 * 1000) return { ok: false, motivo: `No se puede programar a más de ${MAX_DIAS} días.` };
    return { ok: true, at };
}

// ── Alta ─────────────────────────────────────────────────────────────────────
async function crear({ oportunidad, enviarAt, plan, htmlPdf, htmlEmail, usuario }) {
    const v = validarFecha(enviarAt);
    if (!v.ok) { const e = new Error(v.motivo); e.status = 400; throw e; }
    if (!htmlPdf) { const e = new Error('Falta el documento de la propuesta.'); e.status = 400; throw e; }
    if (!plan?.grupos?.length) { const e = new Error('El envío no tiene destinatarios.'); e.status = 400; throw e; }

    const { data, error } = await supabase
        .from(TABLA)
        .insert({
            oportunidad_id: oportunidad.id,
            id_oportunidad: oportunidad.id_oportunidad,
            enviar_at: v.at.toISOString(),
            plan,
            html_pdf: htmlPdf,
            html_email: htmlEmail || null,
            creada_por: usuario || null,
        })
        .select(SIN_HTML)
        .single();
    if (error) throw new Error(`No se pudo programar el envío: ${error.message}`);
    return data;
}

/** Lo programado de una oportunidad, lo último primero. Nunca con el HTML. */
async function listar(oportunidadUuid, { soloPendientes = false } = {}) {
    let q = supabase.from(TABLA).select(SIN_HTML).eq('oportunidad_id', oportunidadUuid);
    if (soloPendientes) q = q.eq('estado', 'PENDIENTE');
    const { data, error } = await q.order('created_at', { ascending: false }).limit(20);
    if (error) { console.warn('[PropProg] listar:', error.message); return []; }
    return data || [];
}

/**
 * Retira un envío programado. Solo se puede sobre lo que aún está PENDIENTE:
 * una que ya está ENVIANDO tiene el PDF rasterizándose y puede haber salido.
 */
async function cancelar(id, { usuario = null, motivo = null } = {}) {
    const { data, error } = await supabase
        .from(TABLA)
        .update({
            estado: 'CANCELADA',
            cancelada_at: new Date().toISOString(),
            cancelada_por: usuario,
            error: motivo,
            // El documento ya no hace falta y son ~350 KB por fila.
            html_pdf: null, html_email: null,
        })
        .eq('id', id)
        .eq('estado', 'PENDIENTE')
        .select(SIN_HTML)
        .maybeSingle();
    if (error) throw new Error(`No se pudo cancelar: ${error.message}`);
    return data;   // null = ya no estaba pendiente
}

/** Cancela TODO lo pendiente de una oportunidad. Lo usa el envío a mano: si la
 *  propuesta acaba de salir, la programada la mandaría por segunda vez. */
async function cancelarPendientes(oportunidadUuid, { usuario = null, motivo = null } = {}) {
    const pendientes = await listar(oportunidadUuid, { soloPendientes: true });
    const out = [];
    for (const p of pendientes) {
        try { const c = await cancelar(p.id, { usuario, motivo }); if (c) out.push(c); }
        catch (e) { console.warn('[PropProg] cancelarPendientes:', e.message); }
    }
    return out;
}

// ── El envío ─────────────────────────────────────────────────────────────────

/**
 * Replica el recorrido del popup de envío. Devuelve { estado, version, envios }.
 * No lanza: cualquier fallo se traduce a un resultado que se persiste y se avisa.
 */
async function enviar(fila) {
    const plan = fila.plan || {};
    const idLegible = fila.id_oportunidad;
    const out = [];

    // 1. Versión: rasteriza el HTML que se revisó, reserva número y archiva el
    //    PDF en "0. PROPUESTAS". Devuelve el PDF que van a llevar los canales.
    let version = null, pdfBase64 = null, fileName = `Propuesta_${idLegible}.pdf`, cambios = '';
    try {
        const { data } = await axios.post(`${API()}/oportunidades/${encodeURIComponent(idLegible)}/propuesta/version`, {
            html: fila.html_pdf,
            destinatarios: plan.destinatarios || [],
            canales: plan.canales || [],
            versionImpresa: plan.versionImpresa || null,
            result: plan.result || null,
            inputs: plan.inputs || null,
            usuario: plan.usuario || fila.creada_por || null,
        }, { headers: cabeceraInterna(), timeout: 180000 });
        version = data?.version || null;
        pdfBase64 = data?.pdfBase64 || null;
        cambios = data?.cambios || '';
        if (data?.fileName) fileName = data.fileName;
    } catch (e) {
        const msg = e.response?.data?.message || e.response?.data?.error || e.message;
        return { estado: 'ERROR', version: null, envios: [], error: `No se pudo preparar el PDF de la propuesta: ${msg}` };
    }
    if (!pdfBase64) {
        return { estado: 'ERROR', version, envios: [], error: 'No se pudo preparar el PDF de la propuesta.' };
    }

    let clienteOk = false;

    for (const grupo of (plan.grupos || [])) {
        // ── EMAIL: uno por empresa, con copia real ──────────────────────────
        if (grupo.email?.to) {
            try {
                await axios.post(`${API()}/pdf/send-proposal`, {
                    // `html` alimenta la vista web del enlace público y el paso a
                    // ENVIADA. El ADJUNTO es el PDF ya archivado — el mismo que va
                    // por WhatsApp.
                    html: fila.html_email || null,
                    pdfBase64,
                    to: grupo.email.to,
                    cc: grupo.email.cc?.length ? grupo.email.cc : undefined,
                    userName: grupo.email.userName || '',
                    summaryData: { ...(grupo.email.summaryData || {}), version },
                    customMessage: grupo.email.mensaje || null,
                }, { headers: cabeceraInterna(), timeout: 120000 });
                out.push({
                    channel: 'email', status: 'ok',
                    text: `${grupo.email.label || grupo.email.userName || grupo.email.to} → ${grupo.email.to}${grupo.email.cc?.length ? ` (+${grupo.email.cc.length} en copia)` : ''}`,
                });
                if (grupo.modo === 'CLIENTE') clienteOk = true;
            } catch (e) {
                out.push({ channel: 'email', status: 'fail', text: `${grupo.email.label || grupo.email.to}: ${e.response?.data?.message || e.response?.data?.error || e.message}` });
            }
        }

        // ── WHATSAPP: no tiene copia, va uno a cada persona ─────────────────
        // Se llama al SERVICIO y no a `/api/whatsapp/send-media`: esa ruta es un
        // envoltorio de cuatro líneas sin lógica propia, y pasar por HTTP
        // significaría subirse el PDF en base64 a sí mismo una vez por persona.
        for (const w of (grupo.whatsapps || [])) {
            try {
                const r = await whatsappService.sendMedia(
                    String(w.phone).replace(/[^0-9]/g, ''),
                    { base64: pdfBase64, filename: fileName, mimetype: 'application/pdf' },
                    { caption: w.mensaje || '', asDocument: true }
                );
                if (r && r.ok === false) throw new Error(r.error || 'WhatsApp no confirmó la entrega');
                out.push({ channel: 'whatsapp', status: 'ok', text: `${w.label || w.phone} → ${w.phone}` });
                if (grupo.modo === 'CLIENTE') clienteOk = true;
            } catch (e) {
                out.push({ channel: 'whatsapp', status: 'fail', text: `${w.label || w.phone}: ${e.message}` });
            }
        }
    }

    // 2. Sellar en la versión a quién llegó y por dónde (+ línea de historial).
    if (version) {
        try {
            await axios.patch(`${API()}/oportunidades/${encodeURIComponent(idLegible)}/propuesta/version/${version}`,
                { envios: out, cambios, usuario: plan.usuario || fila.creada_por || null },
                { headers: cabeceraInterna(), timeout: 60000 });
        } catch (e) { console.warn('[PropProg] sellado de la versión:', e.message); }
    }

    // 3. ENVIADA si le llegó al cliente. Por la ruta, que además mueve la
    //    carpeta de Drive (regla 2) — replicarlo aquí la dejaría en
    //    "01. OPORTUNIDADES" con la propuesta ya entregada.
    if (clienteOk) {
        try {
            await axios.patch(`${API()}/oportunidades/${encodeURIComponent(idLegible)}/estado`,
                { nuevo_estado: 'ENVIADA', usuario: plan.usuario || fila.creada_por || null },
                { headers: cabeceraInterna(), timeout: 60000 });
        } catch (e) { console.warn('[PropProg] paso a ENVIADA:', e.message); }
    }

    // 4. La nota adicional, al historial (exista o no en el mensaje).
    if (plan.nota && String(plan.nota).trim()) {
        try {
            await axios.post(`${API()}/oportunidades/${encodeURIComponent(idLegible)}/comentarios`,
                { comentario: `📝 Nota de la propuesta: ${String(plan.nota).trim()}`, usuario: plan.usuario || fila.creada_por || null },
                { headers: cabeceraInterna(), timeout: 30000 });
        } catch (e) { console.warn('[PropProg] nota:', e.message); }
    }

    const anyOk = out.some(r => r.status === 'ok');
    return {
        estado: anyOk ? 'ENVIADA' : 'ERROR',
        version, envios: out,
        error: anyOk ? null : 'No salió por ningún canal.',
    };
}

// ── Aviso al staff ───────────────────────────────────────────────────────────
// Un envío programado sale con nadie delante: si no se avisa, "¿llegó mi
// propuesta?" no tiene respuesta hasta que alguien abre el expediente. Y un
// fallo silencioso es peor que no haber programado nada.
async function avisar(fila, res) {
    const ok = res.estado === 'ENVIADA';
    const fallos = (res.envios || []).filter(e => e.status === 'fail');
    const exitos = (res.envios || []).filter(e => e.status === 'ok');
    const enlace = `${process.env.FRONTEND_URL || 'https://app.brokergy.es'}?tab=oportunidades`;

    const titulo = ok
        ? (fallos.length ? `⚠️ Propuesta programada enviada A MEDIAS — ${fila.id_oportunidad}` : `📤 Propuesta programada enviada — ${fila.id_oportunidad}`)
        : `❌ Propuesta programada NO enviada — ${fila.id_oportunidad}`;

    const lineas = [
        `*${titulo}*`,
        '',
        `Estaba programada para el ${fechaEs(fila.enviar_at)}${fila.creada_por ? ` por ${fila.creada_por}` : ''}.`,
        res.version ? `Versión ${res.version}.` : '',
        '',
        ...exitos.map(e => `✅ ${e.channel === 'email' ? 'Email' : 'WhatsApp'}: ${e.text}`),
        ...fallos.map(e => `❌ ${e.channel === 'email' ? 'Email' : 'WhatsApp'}: ${e.text}`),
        res.error ? `\n${res.error}` : '',
        '',
        `🔗 ${enlace}`,
    ].filter(l => l !== '');

    const texto = lineas.join('\n');
    try { await whatsappService.sendText(adminPhone(), texto); }
    catch (e) { console.warn('[PropProg] aviso WhatsApp:', e.message); }
    try {
        await emailService.sendMail({
            to: adminEmail(),
            // Buzón SECUNDARIO: los avisos internos no gastan la cuota del que
            // escribe a clientes.
            from: process.env.ALERT_EMAIL_FROM || emailService.getFallbackSender() || undefined,
            subject: titulo,
            text: texto,
            html: `<pre style="font-family:system-ui,sans-serif;white-space:pre-wrap">${texto.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</pre>`,
        });
    } catch (e) { console.warn('[PropProg] aviso email:', e.message); }
}

// ── Barrido ──────────────────────────────────────────────────────────────────
let barriendo = false;

async function despachar() {
    if (!activo() || barriendo) return;
    barriendo = true;
    try {
        const { data, error } = await supabase
            .from(TABLA)
            .select('id')
            .eq('estado', 'PENDIENTE')
            .lte('enviar_at', new Date().toISOString())
            .order('enviar_at', { ascending: true })
            .limit(5);
        if (error) { console.warn('[PropProg] barrido:', error.message); return; }
        if (!data?.length) return;

        for (const { id } of data) {
            // CLAIM ATÓMICO. Es lo que impide que dos backends contra la misma
            // base manden la propuesta dos veces al mismo cliente: el segundo
            // update no encuentra la fila en PENDIENTE y se retira.
            const { data: tomada, error: claimErr } = await supabase
                .from(TABLA)
                .update({ estado: 'ENVIANDO', despachada_at: new Date().toISOString() })
                .eq('id', id)
                .eq('estado', 'PENDIENTE')
                .select('*')
                .maybeSingle();
            if (claimErr || !tomada) continue;

            console.log(`[PropProg] enviando la propuesta programada de ${tomada.id_oportunidad}…`);
            let res;
            try {
                res = await enviar(tomada);
            } catch (e) {
                res = { estado: 'ERROR', version: null, envios: [], error: e.message };
            }

            await supabase.from(TABLA).update({
                estado: res.estado,
                enviada_at: res.estado === 'ENVIADA' ? new Date().toISOString() : null,
                version: res.version,
                resultado: res.envios || [],
                error: res.error || null,
                // El documento ya está archivado en Drive como versión: aquí eran
                // ~700 KB que no vuelve a leer nadie.
                html_pdf: null, html_email: null,
            }).eq('id', id);

            await avisar(tomada, res);
        }
    } catch (e) {
        console.error('[PropProg] excepción en el barrido:', e.message);
    } finally {
        barriendo = false;
    }
}

let handle = null;
function start() {
    if (handle) return;
    if (!activo()) {
        console.log('[PropProg] despachador APAGADO (PROPUESTA_PROGRAMADA_ENABLED != true). Lo programado no saldrá desde aquí.');
        return;
    }
    setTimeout(despachar, 30 * 1000);
    handle = setInterval(despachar, INTERVALO_MS);
    console.log(`[PropProg] despachador de propuestas programadas iniciado (cada ${Math.round(INTERVALO_MS / 1000)} s)`);
}

module.exports = {
    TABLA, SIN_HTML,
    activo, validarFecha,
    crear, listar, cancelar, cancelarPendientes,
    enviar, despachar, start,
    MAX_DIAS,
};
