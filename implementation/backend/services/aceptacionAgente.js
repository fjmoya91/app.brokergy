// ============================================================================
// aceptacionAgente.js — al ACEPTAR el cliente, el agente revisa lo que hay para el
// CEE inicial: pide lo que falte o, si está todo, se pone con el certificado.
//
// Antes el acuse de aceptación le mandaba al cliente la lista GENÉRICA de
// documentos, aunque ya nos hubiera mandado la mitad (o una foto de la etiqueta que
// no es la placa: 26RES060_245, 22/10/2026), y Fran tenía que pedirle a Claude
// «revisa qué le falta y pídeselo». Ahora (decisión de Fran, 22/10/2026):
//
//   · Al aceptar —desde el enlace del cliente (routes/public.js) o marcándolo el
//     equipo en la app (PATCH /oportunidades/:id/estado)— el servidor le ENCARGA la
//     revisión al Claude del WhatsApp (`pedirTarea`, el mismo `/tarea` que el
//     asistente de la app) con un texto que compone AQUÍ.
//   · El acuse al cliente solo dice que revisaremos lo que tenemos y que nos
//     pondremos en contacto para pedir lo que falte (`acuseRevision`).
//   · El agente mira (`scripts/aceptacion.js estado`), y si falta algo se lo PIDE
//     él mismo al cliente o al instalador (`aceptacion.js pedir --enviar`): ese
//     envío está autorizado de antemano, es la ÚNICA excepción al «nada sale a un
//     tercero sin el envíala de Fran». Fuera de 9 a 21 h no sale: se PROGRAMA y lo
//     manda este servidor a las 9:00 (`despachar`). Si no falta nada, hace el CEE.
//   · Cuando llega lo pedido —por el enlace de subida (`uploadNotifier`) o como
//     fotos al WhatsApp (`alMensajeEntrante`)— le vuelve a encargar la revisión
//     (`retomar`), hasta `MAX_RONDAS`.
//   · VIGILANTE: si a las 24 h de un encargo el agente no ha pedido nada ni ha
//     empezado el CEE, se avisa al chat de administración (`vigilar`). Al cliente le
//     hemos dicho «nos pondremos en contacto»; un trabajo caído no puede callarlo.
//
// El estado vive en `expedientes.documentacion.aceptacion_agente` (clave
// protegida del autoguardado), escrito con la RPC de MERGE. Además, un ÍNDICE
// pequeño en `app_settings` (`aceptacion_agente_seguimiento`) dice qué
// expedientes están en marcha y con qué teléfono: el mensaje que entra por
// WhatsApp y el despachador no pueden recorrer `documentacion` de toda la tabla.
//
// Apagado con `ACEPTACION_AGENTE_ENABLED` distinto de 'true' (en LOCAL, apagado:
// local escribe en producción). Apagado, o si el Claude del WhatsApp no contesta,
// el acuse sale como siempre, con la lista de documentos.
// ============================================================================

const supabase = require('./supabaseClient');

const CLAVE_DOC = 'aceptacion_agente';
const CLAVE_INDICE = 'aceptacion_agente_seguimiento';
// Rondas de «revisa y pide»: la de la aceptación y las que abren las subidas o las
// fotos por WhatsApp. Pasado esto, el agente ya no retoma solo y se lo deja a Fran.
const MAX_RONDAS = Number(process.env.ACEPTACION_AGENTE_MAX_RONDAS) || 4;
// Horas sin que el agente pida nada ni empiece el CEE antes de avisar a Fran.
const VIGILANTE_H = Number(process.env.ACEPTACION_AGENTE_VIGILANTE_H) || 24;
// Silencio tras la última foto que entra por WhatsApp antes de retomar (una
// ráfaga de 12 fotos es UNA revisión, no doce).
const VENTANA_WA_MS = (Number(process.env.ACEPTACION_AGENTE_WA_MIN) || 10) * 60_000;
// Horario en el que se le escribe a un cliente (hora de Madrid), [desde, hasta).
const HORA_DESDE = 9;
const HORA_HASTA = 21;
// Lo que lleva más de esto en el índice sin cerrarse se suelta.
const CADUCA_DIAS = 45;

const activo = () => process.env.ACEPTACION_AGENTE_ENABLED === 'true';
const ahoraIso = () => new Date().toISOString();
const ult9 = (t) => String(t || '').replace(/\D/g, '').slice(-9) || null;

// El texto del acuse cuando el agente se encarga de la documentación (palabras de
// Fran, 22/10/2026). `tu`: se le habla al propio cliente; si no, a su contacto.
const acuseRevision = (tu = true) => (tu
    ? 'Ahora revisaremos la documentación que ya tenemos de tu vivienda y nos volveremos a poner en contacto contigo para pedirte lo que nos falte.'
    : 'Ahora revisaremos la documentación que ya tenemos de la vivienda y nos volveremos a poner en contacto con vosotros para pediros lo que nos falte.');

// ─── Horario ─────────────────────────────────────────────────────────────────
function horaMadrid(d = new Date()) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('es-ES', {
        timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(d).map(x => [x.type, x.value]));
    return { h: Number(p.hour), m: Number(p.minute) };
}
const enHorario = (d = new Date()) => { const { h } = horaMadrid(d); return h >= HORA_DESDE && h < HORA_HASTA; };
/** El próximo «abre el horario» (las 9:00 de Madrid). */
function siguienteApertura(d = new Date()) {
    if (enHorario(d)) return d;
    const { h, m } = horaMadrid(d);
    const min = (h >= HORA_HASTA ? (24 - h + HORA_DESDE) : (HORA_DESDE - h)) * 60 - m;
    const out = new Date(d.getTime() + min * 60_000);
    out.setSeconds(0, 0);
    return out;
}

// ─── Destinatarios ───────────────────────────────────────────────────────────
/**
 * A QUIÉN van los avisos al cliente: lo dice la FICHA. Con los avisos desviados
 * a su persona de contacto (o al partner) le llegan a ella, con el nombre del
 * titular para que sepa de quién es; sin desvío, al propio cliente.
 *
 * @param {string|null} idCliente
 * @param {{tlf?, email?, saludo?}} porDefecto  lo que tecleó el cliente al aceptar
 * @returns {Promise<{tlf, email, saludo, titular: string|null}>}  `titular` solo con desvío
 */
async function destinatarioCliente(idCliente, porDefecto = {}) {
    const dest = { tlf: porDefecto.tlf || null, email: porDefecto.email || null, saludo: porDefecto.saludo || '', titular: null };
    if (!idCliente) return dest;
    const { data: cli } = await supabase.from('clientes')
        .select('nombre_razon_social, apellidos, tlf, email, notificaciones_contacto_activas, persona_contacto_nombre, persona_contacto_tlf, persona_contacto_email')
        .eq('id_cliente', idCliente).maybeSingle();
    if (!cli) return dest;
    const desvio = cli.notificaciones_contacto_activas === true || cli.notificaciones_contacto_activas === 'true';
    if (desvio && (cli.persona_contacto_tlf || cli.persona_contacto_email)) {
        return {
            tlf: cli.persona_contacto_tlf || null,
            email: cli.persona_contacto_email || null,
            saludo: cli.persona_contacto_nombre || '',
            titular: require('./recordatorios').capitalizar(
                `${cli.nombre_razon_social || ''} ${cli.apellidos || ''}`.trim()),
        };
    }
    return {
        tlf: dest.tlf || cli.tlf || null,
        email: dest.email || cli.email || null,
        saludo: dest.saludo || cli.nombre_razon_social || '',
        titular: null,
    };
}

/**
 * El INSTALADOR de la obra, a su contacto COMERCIAL (fotos y documentación de la
 * obra son asunto comercial, regla 44). Sin nadie marcado, el canal general de la
 * empresa, saludando en genérico.
 * @returns {Promise<{tlf, saludo, empresa}|null>}
 */
async function destinatarioInstalador(opp) {
    const id = opp?.instalador_asociado_id || opp?.prescriptor_id;
    if (!id) return null;
    const { PARTNER_CONTACT_FIELDS, partnerNotifyTarget } = require('./notifyContacts');
    const { data: p } = await supabase.from('prescriptores').select(`id_empresa, ${PARTNER_CONTACT_FIELDS}`).eq('id_empresa', id).maybeSingle();
    if (!p) return null;
    const t = partnerNotifyTarget(p, 'comercial');
    return t?.tlf ? { tlf: t.tlf, saludo: t.nombre || '', empresa: p.acronimo || p.razon_social || '' } : null;
}

// ─── El encargo ──────────────────────────────────────────────────────────────
const MOTIVOS = {
    aceptacion: (n) => `El cliente de ${n} acaba de ACEPTAR la propuesta. Si aceptó desde su enlace, ya se le ha dicho que revisaremos su documentación y que le pediremos lo que falte.`,
    subida: (n, r) => `En ${n} acaban de SUBIR documentación por el enlace después de que pidiéramos lo que faltaba (ronda ${r} de ${MAX_RONDAS}).`,
    whatsapp: (n, r, tel) => `En ${n} acaban de mandar fotos, vídeos o documentos por WHATSAPP (chat ${tel}) después de que pidiéramos lo que faltaba (ronda ${r} de ${MAX_RONDAS}). Primero llévalos a la obra con la skill alta-oportunidad: \`node scripts/alta_oportunidad.js chat ${tel} --bajar todo\`, míralos y \`documentar --op ${n} --plan docs.json\` (en seco y --escribir).`,
};

/** El encargo que le llega al Claude del WhatsApp. Lo compone el SERVIDOR. */
function instruccion(numero, { motivo = 'aceptacion', ronda = 1, tel = null } = {}) {
    const porque = (MOTIVOS[motivo] || MOTIVOS.aceptacion)(numero, ronda, tel);
    return `${porque} Revisa si hay todo lo necesario para el CEE INICIAL y actúa sin preguntarme:
1. \`node scripts/aceptacion.js estado ${numero}\`: lo que tiene según la app (el mismo criterio que el parte), las notas del alta, si ya hay un borrador del CEE inicial y a quién se le escribe.
2. MIRA tú las fotos que haya: que la placa de la caldera se LEA (marca, modelo, potencia; una etiqueta con solo el código de artículo no vale) y que las fachadas sean de esta casa. Si el alta vino de un WhatsApp con cosas sin subir, súbelas antes a la obra con la skill alta-oportunidad (documentar). Las fachadas que falten, primero con Street View (orden \`streetview\` de generar-cee-inicial); los patios, solo si la vivienda los tiene.
3. Si falta algo que solo pueden darnos ellos: \`node scripts/aceptacion.js pedir ${numero} --texto "<lo que falta, en lenguaje de casa, una línea por cosa>" [--slots K1,K2] [--a instalador]\` en seco, revísalo y repítelo con --enviar. Por defecto va al CLIENTE; \`--a instalador\` cuando lo tiene el instalador (las fotos o la placa que hizo él, o si el alta vino de su chat y el cliente no las tiene). Ese envío está AUTORIZADO por Fran (22/10/2026) sin preguntarle: es la única excepción. Fuera de 9 a 21 h el script lo programa para las 9:00. Después dime en el grupo qué has pedido y a quién, y apúntalo en el cuaderno.
4. Si NO falta nada, haz el CEE inicial con la skill generar-cee-inicial, entera. Si \`estado\` dice que YA hay un borrador del CEE inicial (lo hizo el Agente IA en la oportunidad), PARTE DE ÉL: completa lo que le faltaba con lo nuevo (\`aplicar\` conserva lo hecho y añade encima; los huecos estimados, mídelos con las fotos nuevas) en vez de empezar otro.
Si el cliente aporta su propio CEE, si un técnico externo ya tiene el encargo o si algo no cuadra, no pidas ni generes nada: cuéntamelo.`;
}

/** Sella el estado del agente en el expediente (RPC de MERGE: solo esa clave). */
async function sellar(expedienteId, cambios) {
    const { error } = await supabase.rpc('merge_expediente_doc_json', {
        p_expediente_id: expedienteId, p_field: CLAVE_DOC, p_value: cambios,
    });
    if (error) console.warn('[aceptacion-agente] sello:', error.message);
}

// ─── El índice (app_settings) ────────────────────────────────────────────────
let cacheIndice = null;      // { t, valor }
async function leerIndice({ fresco = false } = {}) {
    if (!fresco && cacheIndice && Date.now() - cacheIndice.t < 60_000) return cacheIndice.valor;
    const { data, error } = await supabase.from('app_settings').select('value').eq('key', CLAVE_INDICE).maybeSingle();
    if (error) throw new Error(`app_settings: ${error.message}`);
    let v = {};
    try { v = typeof data?.value === 'string' ? JSON.parse(data.value) : (data?.value || {}); } catch { v = {}; }
    if (!v || typeof v !== 'object' || Array.isArray(v)) v = {};
    cacheIndice = { t: Date.now(), valor: v };
    return v;
}
async function guardarIndice(v) {
    const { error } = await supabase.from('app_settings').upsert(
        { key: CLAVE_INDICE, value: JSON.stringify(v), updated_at: ahoraIso() }, { onConflict: 'key' });
    if (error) throw new Error(`app_settings: ${error.message}`);
    cacheIndice = { t: Date.now(), valor: v };
}
/** Apunta (o actualiza) un expediente en el índice. `tels` se acumulan. */
async function apuntar(expedienteId, datos = {}) {
    try {
        const v = await leerIndice({ fresco: true });
        const prev = v[expedienteId] || { desde: ahoraIso(), tels: [] };
        const tels = [...new Set([...(prev.tels || []), ...(datos.tels || []).map(ult9).filter(Boolean)])];
        v[expedienteId] = { ...prev, ...datos, tels };
        await guardarIndice(v);
    } catch (e) { console.warn('[aceptacion-agente] índice:', e.message); }
}
async function quitar(ids) {
    try {
        const v = await leerIndice({ fresco: true });
        let cambia = false;
        for (const id of [].concat(ids)) if (v[id]) { delete v[id]; cambia = true; }
        if (cambia) await guardarIndice(v);
    } catch (e) { console.warn('[aceptacion-agente] índice:', e.message); }
}

async function encargar({ expediente, motivo, ronda, tel = null }) {
    const { pedirTarea } = require('./asistenteCanal');
    const n = expediente.numero_expediente;
    const r = await pedirTarea({
        texto: instruccion(n, { motivo, ronda, tel }),
        clave: `aceptacion:${n}`,
        acuse: motivo === 'aceptacion'
            ? `Han aceptado ${n}: reviso su documentación y pido lo que falte o, si está todo, me pongo con el CEE inicial.`
            : `Ha llegado documentación de ${n}${motivo === 'whatsapp' ? ' por WhatsApp' : ''}: la reviso y, si ya está todo, me pongo con el CEE inicial.`,
    });
    if (r.ok) {
        await sellar(expediente.id, { ronda, revision_at: ahoraIso(), motivo });
        await apuntar(expediente.id, { numero: n, oportunidad_id: expediente.oportunidad_id || null });
    }
    return r;
}

/**
 * Tras la aceptación: le encarga la revisión al agente. Nunca lanza.
 * @returns {Promise<{ok: boolean, motivo?: string}>}  `ok` = el agente se encarga
 *   (y el acuse puede decir «revisaremos»); si no, el acuse lleva la lista de siempre.
 */
async function encargarTrasAceptacion(numeroExpediente, { ceeAportado = false } = {}) {
    try {
        if (!activo()) return { ok: false, motivo: 'apagado (ACEPTACION_AGENTE_ENABLED)' };
        if (ceeAportado) return { ok: false, motivo: 'el cliente aporta su CEE' };
        if (!numeroExpediente) return { ok: false, motivo: 'sin expediente' };
        const { data: expediente } = await supabase.from('expedientes')
            .select('id, numero_expediente, oportunidad_id').eq('numero_expediente', numeroExpediente).maybeSingle();
        if (!expediente) return { ok: false, motivo: 'expediente no encontrado' };
        return await encargar({ expediente, motivo: 'aceptacion', ronda: 1 });
    } catch (e) {
        return { ok: false, motivo: e.message };
    }
}

const sinEncargar = (exp) => { const s = exp?.seguimiento?.cee_inicial; return !s || s === 'PTE_ENVIO_CERT'; };

/**
 * Ha llegado documentación (subida por el enlace o fotos por WhatsApp): si el
 * agente había PEDIDO algo y el CEE inicial sigue sin encargar, vuelve a revisar.
 * Cada llegada es una ronda, hasta MAX_RONDAS. Nunca lanza.
 */
async function retomar(oportunidadUuid, { motivo = 'subida', tel = null } = {}) {
    try {
        if (!activo() || !oportunidadUuid) return;
        const { data: expediente } = await supabase.from('expedientes')
            .select(`id, numero_expediente, oportunidad_id, seguimiento, aa:documentacion->${CLAVE_DOC}`)
            .eq('oportunidad_id', oportunidadUuid).maybeSingle();
        const aa = expediente?.aa;
        if (!aa?.pedido_at) return;
        if (!sinEncargar(expediente)) return;   // ya lo tiene alguien (agente o técnico)
        const ronda = (Number(aa.ronda) || 1) + 1;
        if (ronda > MAX_RONDAS) return;
        await encargar({ expediente, motivo, ronda, tel });
    } catch (e) {
        console.warn('[aceptacion-agente] retomar:', e.message);
    }
}
const retomarTrasSubida = (oportunidadUuid) => retomar(oportunidadUuid, { motivo: 'subida' });

/**
 * Lo pedido, apuntado: sello, historial e índice (con el teléfono, para reconocer
 * las fotos que vuelvan por WhatsApp). Lo usan el script y el despachador.
 */
async function registrarPedido({ expedienteId, oportunidadId, numero, lineas, tel, saludo, a = 'cliente' }) {
    const ahora = ahoraIso();
    await sellar(expedienteId, { pedido_at: ahora, pedido: lineas, pedido_a: tel, pedido_quien: a, programado: null });
    // Historial, sin reescribir `documentacion`: la RPC de MERGE con una lista
    // AÑADE (jsonb `||`); solo si aún no hay historial se crea la lista.
    const entrada = { id: `${Date.now()}_pedido_aceptacion`, tipo: 'pedido_aceptacion', fecha: ahora, usuario: 'CLAUDE',
        texto: `Pedido por WhatsApp a ${saludo || (a === 'instalador' ? 'el instalador' : 'el cliente')}${a === 'instalador' ? ' (instalador)' : ''} para el CEE inicial: ${lineas.join(' · ')}` };
    const { data: h } = await supabase.from('expedientes').select('historial:documentacion->historial').eq('id', expedienteId).maybeSingle();
    const { error } = Array.isArray(h?.historial)
        ? await supabase.rpc('merge_expediente_doc_json', { p_expediente_id: expedienteId, p_field: 'historial', p_value: [entrada] })
        : await supabase.rpc('set_expediente_doc_field', { p_oportunidad_id: oportunidadId, p_field: 'historial', p_value: [entrada] });
    if (error) console.warn('[aceptacion-agente] historial:', error.message);
    await apuntar(expedienteId, { numero, oportunidad_id: oportunidadId, tels: [tel] });
}

/** Fuera de horario: se guarda para que `despachar` lo mande al abrir. */
async function programar({ expedienteId, oportunidadId, numero, mensaje, lineas, tel, saludo, a = 'cliente' }) {
    const para = siguienteApertura().toISOString();
    await sellar(expedienteId, { programado: { para, mensaje, lineas, tel, saludo, a, creado_at: ahoraIso() } });
    await apuntar(expedienteId, { numero, oportunidad_id: oportunidadId });
    return para;
}

// ─── Lo que corre en el servidor (VPS) ───────────────────────────────────────
function avisarAdmin(texto) {
    const whatsappService = require('./whatsappService');
    return whatsappService.sendText(process.env.WHATSAPP_ADMIN_CHAT || '34623926179', texto)
        .catch(e => console.warn('[aceptacion-agente] aviso admin:', e.message));
}

/**
 * Una vuelta: manda lo programado que ya toca, avisa de lo que lleva VIGILANTE_H
 * sin moverse y suelta del índice lo cerrado. Nunca lanza.
 */
async function vuelta() {
    try {
        const v = await leerIndice({ fresco: true });
        const ids = Object.keys(v);
        if (!ids.length) return;
        const { data: exps, error } = await supabase.from('expedientes')
            .select(`id, numero_expediente, oportunidad_id, seguimiento, aa:documentacion->${CLAVE_DOC}`)
            .in('id', ids);
        if (error) throw new Error(error.message);
        const porId = new Map((exps || []).map(e => [e.id, e]));
        const soltar = [];
        const ahora = Date.now();
        for (const id of ids) {
            const e = porId.get(id);
            const aa = e?.aa || {};
            const caducado = ahora - (Date.parse(v[id]?.desde || '') || ahora) > CADUCA_DIAS * 86_400_000;
            if (!e || !sinEncargar(e) || caducado) { soltar.push(id); continue; }

            // 1. Lo programado fuera de horario.
            const prog = aa.programado;
            if (prog?.para && Date.parse(prog.para) <= ahora && enHorario()) {
                const whatsappService = require('./whatsappService');
                try {
                    const out = await whatsappService.sendText(prog.tel, prog.mensaje);
                    if (out && out.ok === false) throw new Error(out.error || 'WhatsApp no lo ha aceptado');
                    await registrarPedido({ expedienteId: e.id, oportunidadId: e.oportunidad_id, numero: e.numero_expediente,
                        lineas: prog.lineas || [], tel: prog.tel, saludo: prog.saludo, a: prog.a });
                    console.log(`[aceptacion-agente] ${e.numero_expediente}: pedido programado enviado.`);
                } catch (err) {
                    console.warn(`[aceptacion-agente] ${e.numero_expediente}: no ha salido el pedido programado:`, err.message);
                }
                continue;
            }

            // 2. El vigilante: encargado hace VIGILANTE_H y ni ha pedido ni ha empezado.
            const rev = Date.parse(aa.revision_at || '') || 0;
            const pidio = aa.pedido_at && aa.pedido_at > aa.revision_at;
            if (rev && !pidio && !prog && aa.alertado_para !== aa.revision_at && ahora - rev > VIGILANTE_H * 3_600_000) {
                const link = `${process.env.FRONTEND_URL || 'https://app.brokergy.es'}?exp=${encodeURIComponent(e.numero_expediente)}`;
                await avisarAdmin(`⚠️ *${e.numero_expediente}*: Claude empezó a revisar su documentación el ${new Date(rev).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })} y, ${VIGILANTE_H} h después, no ha pedido nada ni ha empezado el CEE inicial. Al cliente se le dijo que le contactaríamos: míralo.\n${link}`);
                await sellar(e.id, { alertado_para: aa.revision_at });
            }
        }
        if (soltar.length) await quitar(soltar);
    } catch (e) {
        console.warn('[aceptacion-agente] vuelta:', e.message);
    }
}

// Fotos que vuelven por WhatsApp: teléfono → temporizador de la ráfaga.
const rafagas = new Map();
const lidCache = new Map();   // ult9 → «…@lid»
const MEDIA = new Set(['image', 'video', 'document', 'ptt', 'audio']);

async function telDeChat(chatId, candidatos) {
    if (chatId.endsWith('@c.us')) return ult9(chatId);
    if (!chatId.endsWith('@lid')) return null;
    // Un @lid no lleva el teléfono: se resuelve el de los pocos que esperan algo.
    const client = require('./whatsappService').getClient?.();
    for (const t of candidatos) {
        if (!lidCache.has(t) && client?.getContactLidAndPhone) {
            try {
                const r = await client.getContactLidAndPhone([`34${t}@c.us`]);
                const lid = r?.[0]?.lid;
                if (lid) lidCache.set(t, String(lid._serialized || lid));
            } catch { /* se reintenta en el siguiente mensaje */ }
        }
        if (lidCache.get(t) === chatId) return t;
    }
    return null;
}

/**
 * Un mensaje que ENTRA por WhatsApp (asistenteCanal): si trae fotos, vídeo o un
 * documento de alguien a quien el agente le pidió algo, cuando la ráfaga calla se
 * retoma la revisión. Solo cuesta mirar el índice (cacheado). Nunca lanza.
 */
async function alMensajeEntrante(msg) {
    try {
        if (!activo() || !msg || msg.fromMe || !(msg.hasMedia || MEDIA.has(msg.type))) return;
        const v = await leerIndice();
        const esperando = Object.entries(v).filter(([, d]) => d.tels?.length);
        if (!esperando.length) return;
        const tel = await telDeChat(String(msg.from || ''), [...new Set(esperando.flatMap(([, d]) => d.tels))]);
        if (!tel) return;
        const [, datos] = esperando.find(([, d]) => d.tels.includes(tel)) || [];
        if (!datos?.oportunidad_id) return;
        clearTimeout(rafagas.get(tel));
        const t = setTimeout(() => { rafagas.delete(tel); retomar(datos.oportunidad_id, { motivo: 'whatsapp', tel }); }, VENTANA_WA_MS);
        if (typeof t.unref === 'function') t.unref();
        rafagas.set(tel, t);
    } catch (e) {
        console.warn('[aceptacion-agente] mensaje entrante:', e.message);
    }
}

let handle = null;
function start() {
    if (handle) return;
    if (!activo()) {
        console.log('[aceptacion-agente] APAGADO (ACEPTACION_AGENTE_ENABLED != true): la documentación tras la aceptación la revisa una persona.');
        return;
    }
    setTimeout(vuelta, 90 * 1000);
    handle = setInterval(vuelta, 5 * 60 * 1000);
    console.log(`[aceptacion-agente] activo: pedidos programados y vigilante (${VIGILANTE_H} h), cada 5 min.`);
}

module.exports = {
    activo, acuseRevision, destinatarioCliente, destinatarioInstalador, instruccion,
    encargarTrasAceptacion, retomar, retomarTrasSubida, alMensajeEntrante,
    registrarPedido, programar, sellar, vuelta, start,
    enHorario, siguienteApertura, sinEncargar,
    CLAVE_DOC, MAX_RONDAS,
};
