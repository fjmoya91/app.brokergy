// =============================================================================
// contestadorWhatsapp — el CONTESTADOR de WhatsApp: contesta como Fran a quien
// tiene algo vivo con nosotros (fase 2 del agente autónomo, 10/11/2026).
//
// Fran (08-09/11/2026): «que antes de contestar busque en la base de datos y en la
// conversación», «que sea como si estuviese contestando yo realmente». Este
// módulo decide CUÁNDO y A QUIÉN; lo que se dice, `contestadorCerebro`.
//
// Cómo va:
//  1. ENTRA un mensaje 1:1 (listener de la sesión) de un teléfono con obra viva
//     (cliente, persona de contacto o instalador; el universo de la ronda) → se
//     apunta en `wa_contestador` (una fila ABIERTA por chat) con `responder_after`
//     = 15 min de SILENCIO (`CONTESTADOR_SILENCIO_MIN`), o la apertura de la franja
//     (7:00) si es de noche. Cada mensaje suyo nuevo empuja el plazo: se contesta
//     a la RÁFAGA entera, no al «Buenas».
//  2. La VUELTA (cada minuto, en la franja de la casa de 7 a 21 h, todos los días)
//     coge lo vencido, LEE el chat y, si sigue sin contestar, hace lo de la ronda
//     con ese chat (`rondaWhatsapp.procesarChat`: adjuntos, obra, dossier) con
//     Claude como redactor.
//  3. Con la decisión: RESPONDER → se le contesta; ESCALAR → a Fran (y, si hay, una
//     frase de acuse al cliente); CALLAR → nada.
//
// REGLAS:
//  - NACE APAGADO (`CONTESTADOR_ENABLED`): local escribe en producción y la sesión
//    de WhatsApp es la del VPS.
//  - MODO COPIA mientras `CONTESTADOR_MODO` no sea `real`: a nadie de fuera le llega
//    nada; lo que se le habría contestado va al grupo de Fran («BROKERGY - CHAT»)
//    con su número (C12), y «C12» lo envía tal cual (POST /contestador/:id/enviar; con cambios,
//    «C12, dile además…», lo termina de redactar el asistente).
//  - Si ha escrito una PERSONA de la casa en ese chat (`wa_chat_pausas`, la regla de las
//    esperas) NO se calla 24 h: si el otro vuelve a escribir y en `relevoMin` (30) nadie
//    le contesta, contesta el contestador (Fran, 10/11/2026: «aunque yo conteste, no estés
//    24 h sin contestar; si yo estoy un tiempo, sé proactivo, no llego a todo»). Y si ya
//    le ha contestado alguien, no se contesta.
//  - Topes en el CÓDIGO: 3 respuestas al día por chat (un bot del otro lado no puede
//    hacer ping-pong), 40 al día en total, 2 por vuelta; pasado un tope, a Fran.
//  - Certificadores y números sin obra viva: no se les contesta (un técnico se lleva
//    como a un compañero; un número nuevo es de la bienvenida y del modo proactivo).
//  - El chat de Fran y el de administración no se contestan nunca.
// =============================================================================

const supabase = require('./supabaseClient');
const horario = require('../utils/horarioWhatsapp');
const Ronda = require('./rondaWhatsapp');
const IA = require('./rondaWhatsappIA');
const cerebro = require('./contestadorCerebro');
const Docs = require('./contestadorDocumentos');

const num = (v, d) => { const n = Number(v); return Number.isFinite(n) && n >= 0 && v !== '' && v != null ? n : d; };
const CFG = {
    silencioMin: num(process.env.CONTESTADOR_SILENCIO_MIN, 15),
    // Con una persona de la casa en el chat: lo que se le deja para contestar ella antes de relevarla.
    relevoMin: num(process.env.CONTESTADOR_RELEVO_MIN, 30),
    topeDia: num(process.env.CONTESTADOR_TOPE_DIA, 40),
    topeChatDia: num(process.env.CONTESTADOR_TOPE_CHAT_DIA, 3),
    porVuelta: num(process.env.CONTESTADOR_POR_VUELTA, 2),
    diasContexto: 7,
    // Lo suyo más antiguo que esto ya no se contesta solo (al volver de un apagón,
    // contestar a lo de hace cuatro días delata a la máquina): a Fran.
    maxHorasSinContestar: num(process.env.CONTESTADOR_MAX_HORAS, 48),
    purgaDias: 90,
};
const activo = () => process.env.CONTESTADOR_ENABLED === 'true';
const modo = () => (process.env.CONTESTADOR_MODO === 'real' ? 'real' : 'copia');
// GUARDAR lo que manda: de verdad con el modo real o con `CONTESTADOR_GUARDAR=real` (se puede
// guardar solo mientras las respuestas siguen en copia). Nunca al revés: una respuesta real
// dice «ya lo tengo en el expediente», y eso tiene que ser verdad cuando le llega.
const modoGuardar = () => (modo() === 'real' || process.env.CONTESTADOR_GUARDAR === 'real' ? 'real' : 'copia');
const destino = () => process.env.CONTESTADOR_DESTINO || process.env.ASISTENTE_WHATSAPP_GRUPO || process.env.WHATSAPP_ADMIN_CHAT || null;
const TIPOS = new Set(['chat', 'image', 'document', 'ptt', 'audio', 'video', 'location', 'vcard', 'multi_vcard']);
const ult9 = (t) => { const d = String(t || '').replace(/@.*/, '').replace(/\D/g, ''); return d.length >= 9 ? d.slice(-9) : null; };
const recorta = (s, n) => { const v = String(s || '').replace(/\s+/g, ' ').trim(); return v.length > n ? `${v.slice(0, n - 1)}…` : v; };
const horaCorta = (t) => new Date(t * 1000).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
const log = (...a) => console.log('[contestador]', ...a);

/** Los teléfonos de la casa: el chat de Fran y el de administración no se contestan nunca. */
function esDeLaCasa(tel9) {
    return [process.env.ASISTENTE_WHATSAPP_TEL, process.env.WHATSAPP_ADMIN_CHAT, process.env.ADMIN_WHATSAPP]
        .map(ult9).filter(Boolean).includes(tel9);
}

// ─── El universo de la ronda (quién tiene algo vivo), en memoria 10 min ──────
let universo = null;
let universoAt = 0;
let enviosApp = null;
async function cargar() {
    if (!universo || Date.now() - universoAt > 10 * 60_000) {
        const ahora = Math.floor(Date.now() / 1000);
        [universo, enviosApp] = await Promise.all([
            Ronda.cargarUniverso(),
            Ronda.cargarEnviosApp(ahora - (CFG.diasContexto + 1) * 86400),
        ]);
        universoAt = Date.now();
    }
    return { u: universo, envios: enviosApp };
}

// ─── 1. Lo que ENTRA ─────────────────────────────────────────────────────────
const candados = new Map();
function conCandado(clave, tarea) {
    const previo = candados.get(clave) || Promise.resolve();
    const siguiente = previo.catch(() => {}).then(tarea);
    candados.set(clave, siguiente);
    siguiente.finally(() => { if (candados.get(clave) === siguiente) candados.delete(clave); }).catch(() => {});
    return siguiente;
}

/** Con una persona de la casa en el chat (`pausa`), ¿se le sigue dejando a ella lo que el otro
 *  escribió desde `primeroSeg`? Pasados `relevoMin`, no: contesta el contestador. Puro. */
const dejarleAElla = (pausa, primeroSeg, ahoraSeg = Date.now() / 1000) => !!pausa && ahoraSeg - primeroSeg < CFG.relevoMin * 60 - 30;

const plazoDesde = (d = new Date()) => horario.siguienteApertura(new Date(d.getTime() + CFG.silencioMin * 60_000));

async function encolar(chatId, msg) {
    const ahora = new Date();
    const tel9 = chatId.endsWith('@c.us') ? ult9(chatId) : null;
    const campos = {
        ultimo_at: ahora.toISOString(), responder_after: plazoDesde(ahora).toISOString(),
        ultimo_msg_id: msg?.id?._serialized || null, updated_at: ahora.toISOString(),
    };
    const { data: abierta, error } = await supabase.from('wa_contestador').select('id, mensajes')
        .eq('chat_id', chatId).eq('estado', 'PENDIENTE').maybeSingle();
    if (error) throw new Error(error.message);
    if (abierta) {
        await supabase.from('wa_contestador').update({ ...campos, mensajes: (abierta.mensajes || 0) + 1 }).eq('id', abierta.id);
        return;
    }
    const { error: e2 } = await supabase.from('wa_contestador').insert({
        chat_id: chatId, tel9, nombre: recorta(msg?._data?.notifyName || '', 60) || null,
        primero_at: ahora.toISOString(), mensajes: 1, ...campos,
    });
    // Dos mensajes en el mismo instante: el índice único deja entrar a uno y el otro actualiza.
    if (e2 && e2.code === '23505') {
        await supabase.from('wa_contestador').update(campos).eq('chat_id', chatId).eq('estado', 'PENDIENTE');
    } else if (e2) throw new Error(e2.message);
}

/** El listener de la sesión. No hace trabajo: apunta y se va. Nunca lanza. */
async function alMensajeEntrante(msg) {
    try {
        if (!activo() || !msg || msg.fromMe || msg.isStatus) return;
        const chatId = String(msg.from || '');
        if (!chatId.endsWith('@c.us') && !chatId.endsWith('@lid')) return;
        if (!TIPOS.has(String(msg.type || 'chat'))) return;
        if (chatId.endsWith('@c.us')) {
            const t = ult9(chatId);
            if (!t || esDeLaCasa(t)) return;
            // Un número sin nada vivo no se apunta siquiera (el @lid se mira en la vuelta).
            const { u } = await cargar();
            if (!u.porTel.has(t)) return;
        }
        await conCandado(chatId, () => encolar(chatId, msg));
    } catch (e) {
        console.warn('[contestador] mensaje entrante:', e.message);
    }
}

// ─── 2. Mirar UN chat y decidir (sin escribir nada) ──────────────────────────
// `fuente`: { leer, descargarAdjunto, transcribir }. En el VPS, la sesión de aquí;
// en la prueba en seco del PC, las rutas de solo lectura del VPS.
function fuenteLocal() {
    const wc = require('./whatsappConversacion');
    return { leer: (q) => wc.leerConversacion(q), descargarAdjunto: (id) => wc.descargarAdjunto(id), transcribir: (id) => wc.transcribir(id) };
}

/**
 * ¿Qué haría con este chat ahora? No escribe nada (ni en la BD ni por WhatsApp).
 * @param {{ chatId?: string, telefono?: string, enVivo?: boolean, fuente?: object }} q
 *   `enVivo`: lo llama la vuelta (respeta el silencio: si acaba de escribir, ESPERAR).
 * @returns {Promise<object>} { estado: 'DECIDIDO'|'DESCARTADA'|'ESPERAR', accion, texto, acuse, motivo, … }
 */
async function decidir({ chatId = null, telefono = null, enVivo = false, fuente = fuenteLocal() } = {}) {
    const conv = await fuente.leer({ ...(chatId ? { chatId } : { telefono }), dias: CFG.diasContexto });
    const tel9 = ult9(conv.telefono);
    const base = { chat_id: conv.chatId, tel9, nombre: conv.nombre || null };
    const fuera = (motivo) => ({ ...base, estado: 'DESCARTADA', motivo });
    if (conv.grupo) return fuera('es un grupo');
    if (!tel9) return fuera('no se sabe el teléfono del chat');
    if (esDeLaCasa(tel9)) return fuera('es un chat de la casa');

    const pausa = await pausaDe(conv.chatId, tel9);

    const { u, envios } = await cargar();
    const ms = conv.mensajes || [];
    // Lo SUYO pendiente: lo de después de lo último NUESTRO, sea lo que sea. También cuenta lo
    // que salió por la app: ahí van los WhatsApp que manda el asistente por Fran y los de los
    // popups. Seco del 10/11/2026 (un instalador): el asistente le había contestado a las 20:31 por la
    // app y, si eso no contaba, el contestador le volvía a contestar lo mismo. Lo que se pierde
    // (una pregunta y, detrás, un aviso de plantilla) lo recoge la ronda del día siguiente.
    let i = ms.length - 1;
    while (i >= 0 && !ms[i].de_mi) i -= 1;
    const suyos = ms.slice(i + 1);
    if (!suyos.length) return fuera('ya le hemos contestado');
    // La respuesta AUTOMÁTICA de su WhatsApp Business («¡Gracias por escribirnos! Si es algo
    // urgente…») no es suya. Por el texto, sin reloj: la de un instalador llegó 12 min después.
    const esperas = require('./esperasWhatsapp');
    const pendientes = suyos.filter(m => !(m.tipo === 'chat' && esperas.pareceAutomatica(m.texto)));
    if (!pendientes.length) return fuera('lo único suyo es la respuesta automática de su WhatsApp');
    const ultimo = pendientes[pendientes.length - 1];
    const ahoraSeg = Date.now() / 1000;
    // Lo lleva una persona de la casa: se le deja `relevoMin` para contestar ella a lo que el
    // otro ha escrito DESPUÉS de su último mensaje; si no, contesta el contestador (con toda la
    // conversación delante, lo suyo incluido). Antes se callaba 24 h.
    if (dejarleAElla(pausa, pendientes[0].t, ahoraSeg)) {
        return { ...base, estado: 'ESPERAR', motivo: `lo lleva una persona de la casa: le dejo ${CFG.relevoMin} min para contestar` };
    }
    if (enVivo && ahoraSeg - ultimo.t < CFG.silencioMin * 60 - 30) return { ...base, estado: 'ESPERAR', motivo: 'sigue escribiendo' };

    const personas = u.porTel.get(tel9) || [];
    if (!personas.length) return fuera('no tiene nada vivo con nosotros');
    const rol = Ronda.rolDe(personas);
    if (rol === 'certificador') return fuera('es un técnico certificador: se le contesta a mano');

    // El último mensaje DEL CHAT (sea de quien sea): «C12» solo sale si sigue siéndolo.
    const comun = { ...base, rol, titulo: Ronda.tituloDe(personas, null), pendientes: resumenPendientes(pendientes), ultimo_msg_id: ms[ms.length - 1].id };
    if (ahoraSeg - pendientes[0].t > CFG.maxHorasSinContestar * 3600) {
        return { ...comun, estado: 'DECIDIDO', accion: 'ESCALAR', motivo: `lleva ${Math.round((ahoraSeg - pendientes[0].t) / 3600)} h sin contestar: mejor que lo veas tú` };
    }
    const desdeSeg = pendientes[0].t;
    if (Ronda.soloCortesia(ms, desdeSeg)) return { ...comun, estado: 'DECIDIDO', accion: 'CALLAR', motivo: 'solo es cortesía' };

    const c = {
        ref: '', telefono: tel9, titulo: comun.titulo, rol, obras: Ronda.obrasDeChat(personas, u),
        filas: [], sinLeer: [], adjuntosObra: 0, obrasTocadas: [],
    };
    const cont = { fotos: 0, documentos: 0, audios: 0, videos: 0, yaColocadas: 0 };
    const cuenta = { llamadas: 0, in: 0, out: 0, think: 0, reintentos: 0, usd: 0 };
    // Lo que manda se GUARDA donde lo habría guardado la app antes de contestar
    // (contestadorDocumentos, 10/11/2026). Aquí solo se PLANEA: decidir no escribe nada.
    let plan = null;
    const alClasificar = async ({ c: chat, adjuntos }) => { plan = await Docs.planear({ c: chat, adjuntos }); };
    // Al cerebro, además del dossier: cómo está lo del instalador (RITE, CIFO) y lo que ya le
    // pedimos antes, para que lo que le vuelva a pedir suene a lo de entonces.
    const redactar = async (ch, obra, dossier, llegado, cuentaR, opts) => {
        const extra = {};
        if (obra?.expediente_id) {
            try {
                extra.instalador = await Docs.situacionInstalador(obra);
                // Lo que se guarda ahora ya cuenta: si acaba de mandar el RITE, no se le vuelve a pedir.
                const ahora = (plan?.items || []).filter(x => x.guardar && x.obra === obra.codigo);
                if (extra.instalador && ahora.some(x => x.slot === 'DOC_RITE')) extra.instalador.rite.certificado = true;
                if (extra.instalador) extra.instalador.facturas += ahora.filter(x => x.slot === 'DOC_FACTURAS').length;
                if (extra.instalador && dossier && (rol === 'instalador' || rol === 'ambos')) {
                    dossier.enlaces = { ...(dossier.enlaces || {}), subir_instalador: extra.instalador.enlace };
                }
            } catch (e) { log(`situación del instalador ${obra.codigo}: ${e.message}`); }
        }
        if (obra) {
            const ultimoT = ms[ms.length - 1]?.t;
            try { extra.pedidos = await Docs.pedidosAnteriores(tel9, obra, { unica: (c.obras || []).length === 1, hasta: ultimoT ? new Date(ultimoT * 1000) : null }); }
            catch (e) { /* sin lo de antes también se contesta */ }
        }
        return cerebro.redactar(ch, obra, dossier, llegado, cuentaR, { ...(opts || {}), ...extra });
    };
    await Ronda.procesarChat(c, { ms, personas }, {
        cont, cuenta, envios, desdeSeg, fuente,
        modelo: Ronda.CONFIG.modelo(), modeloBorrador: Ronda.CONFIG.modeloBorrador(), redactar, alClasificar,
        siempreRedactar: true,
    });
    const b = c.borrador;
    const detalle = {
        rol, obras: c.obras.length, adjuntos: c.filas.length, gemini_usd: Math.round((cuenta.usd || 0) * 1000) / 1000,
        enlaces: (b?.enlaces || []).map(e => e.marca), problemas_enlaces: b?.problemas_enlaces || [],
    };
    // `guardar`: lo planeado (sin ficheros, va a la fila); `_ficheros`: los ya bajados, para no
    // volver a pedírselos a WhatsApp si se guarda en esta misma vuelta.
    const g = { guardar: plan ? Docs.paraFila(plan.items) : [], _ficheros: plan?.ficheros || null };
    if (!b) return { ...comun, ...g, estado: 'DECIDIDO', accion: 'CALLAR', motivo: 'no espera respuesta', obra: null, detalle };
    if (b.accion === 'MANO') return { ...comun, ...g, estado: 'DECIDIDO', accion: 'ESCALAR', motivo: b.motivo, obra: c.obraBorrador || null, detalle };
    return {
        ...comun, ...g, estado: 'DECIDIDO', accion: b.accion, texto: b.mensaje || '', acuse: b.acuse || '', motivo: b.motivo || '',
        obra: c.obraBorrador || null, cerebro: b.cerebro || 'gemini', detalle,
    };
}

/** Hasta cuándo lo lleva una persona (wa_chat_pausas, por su @lid o por su número), o null. */
async function pausaDe(chatId, tel9) {
    const desdeEsperas = await require('./esperasWhatsapp').pausaDe(tel9);
    const { data, error } = await supabase.from('wa_chat_pausas').select('hasta').in('chat_id', [...new Set([chatId, `34${tel9}@c.us`])]);
    // Con la BD caída no se contesta: ante la duda, callar (se reintenta en la vuelta).
    if (error) { const e = new Error(`la base de datos no responde (pausas): ${error.message}`); e.status = 503; throw e; }
    const hasta = Math.max(desdeEsperas ? desdeEsperas.getTime() : 0, ...(data || []).map(r => Date.parse(r.hasta) || 0));
    return hasta > Date.now() ? new Date(hasta) : null;
}

function resumenPendientes(ms) {
    return ms.slice(-6).map((m) => {
        const que = m.tipo === 'chat' ? recorta(m.texto, 300)
            : `[${{ image: 'foto', document: 'documento', ptt: 'audio', audio: 'audio', video: 'vídeo', location: 'ubicación' }[m.tipo] || m.tipo}]${m.texto ? ` ${recorta(m.texto, 120)}` : ''}`;
        return `${horaCorta(m.t)}  ${que}`;
    });
}

// ─── 3. Hacer lo decidido ────────────────────────────────────────────────────
const cita = (txt) => String(txt || '').split('\n').map(l => `> ${l}`).join('\n');

/**
 * Lo que se ha guardado (o se guardaría) de lo que ha mandado, para Fran. Puro.
 * Sin nada que contar, [].
 */
function lineasGuardar(items) {
    const lista = (items || []).filter(Boolean);
    const linea = (x) => `- ${recorta(x.que || x.tipo, 90)} → ${x.destino || x.slot}${x.obra ? ` (${x.obra})` : ''}`;
    const hechos = lista.filter(x => x.guardar && x.hecho);
    const fallidos = lista.filter(x => x.guardar && !x.hecho && x.error);
    const porHacer = lista.filter(x => x.guardar && !x.hecho && !x.error);
    const no = lista.filter(x => !x.guardar && x.motivo);
    const out = [];
    if (hechos.length) out.push('He guardado en el expediente:', ...hechos.map(linea));
    if (porHacer.length) out.push('Guardaría en el expediente:', ...porHacer.map(linea));
    if (fallidos.length) out.push('No he podido guardar:', ...fallidos.map(x => `${linea(x)}: ${recorta(x.error, 140)}`));
    if (no.length) out.push('No lo guardo yo (míralo tú):', ...no.map(x => `- ${recorta(x.que || x.tipo, 90)}${x.obra && x.obra !== 'NUEVA' ? ` (${x.obra})` : ''}: ${recorta(x.motivo, 120)}`));
    return out;
}

/** El mensaje para Fran (al grupo). Puro. */
function textoParaFran(fila, d, { m = modo(), enviado = false, acuseEnviado = false, mg = modoGuardar() } = {}) {
    const quien = recorta(d.titulo || d.nombre || fila.nombre || d.tel9 || 'sin nombre', 70);
    const obra = d.obra ? ` · ${d.obra}` : '';
    const escribio = (d.pendientes || []).length ? `Escribió:\n${cita(d.pendientes.join('\n'))}` : '';
    const guardar = lineasGuardar(d.guardar);
    const bloqueGuardar = guardar.length ? ['', ...guardar] : [];
    const porGuardar = (d.guardar || []).some(x => x.guardar && !x.hecho && !x.error) && mg === 'copia';
    if (d.accion === 'RESPONDER') {
        return [
            `*C${fila.id} · ${enviado ? 'He contestado a' : 'Contestaría a'} ${quien}*${obra}`,
            escribio,
            ...bloqueGuardar,
            '',
            enviado ? 'Le he dicho:' : 'Le contestaría:',
            cita(d.texto),
            '',
            m === 'copia'
                ? (porGuardar
                    ? `_Modo copia: no he guardado nada y no le ha llegado nada. «C${fila.id}» lo guarda y le manda esto; «C${fila.id}, dile además…» lo cambia._`
                    : `_Modo copia: no le ha llegado nada. «C${fila.id}» se lo manda tal cual; «C${fila.id}, dile además…» lo cambia._`)
                : null,
        ].filter(x => x !== null).join('\n');
    }
    if (d.accion === 'CALLAR') {
        // Solo llega a Fran si hay algo que guardar: no hace falta contestarle, pero lo suyo va al expediente.
        return [
            `*C${fila.id} · ${porGuardar ? 'Guardaría' : 'He guardado'} lo que ha mandado ${quien}*${obra}`,
            escribio,
            ...bloqueGuardar,
            '',
            `No le contesto: ${d.motivo || 'no hace falta'}.`,
            porGuardar ? `_Modo copia: no he guardado nada. «C${fila.id}» lo guarda (sin escribirle); «C${fila.id}, dile…» además le escribe._` : null,
        ].filter(x => x !== null).join('\n');
    }
    return [
        `*C${fila.id} · Para ti: ${quien}*${obra}`,
        escribio,
        ...bloqueGuardar,
        '',
        `Por qué te lo paso: ${d.motivo || 'no lo tengo claro'}`,
        d.acuse ? (acuseEnviado ? `Le he dicho: «${d.acuse}»` : `Le diría mientras: «${d.acuse}»`) : null,
        m === 'copia'
            ? (porGuardar ? `_Modo copia: no le ha llegado nada y no he guardado nada. «C${fila.id}» lo guarda${d.acuse ? ' y le manda el acuse' : ''}; «C${fila.id}, dile que…» le contesta lo que tú digas._`
                : `_Modo copia: no le ha llegado nada.${d.acuse ? ` «C${fila.id}» le manda el acuse;` : ''} «C${fila.id}, dile que…» le contesta lo que tú digas._`)
            : null,
    ].filter(x => x !== null).join('\n');
}

// «Al día» = en las últimas 24 h: un ping-pong con el bot de otro WhatsApp Business
// no respeta la medianoche.
async function respuestasDeHoy(chatId) {
    const desde = new Date(Date.now() - 24 * 3_600_000);
    const { data } = await supabase.from('wa_contestador').select('chat_id').gte('enviado_at', desde.toISOString()).limit(500);
    const filas = data || [];
    return { total: filas.length, chat: filas.filter(f => f.chat_id === chatId).length };
}

async function mandarAFran(texto) {
    const d = destino();
    if (!d) return false;
    const r = await require('./whatsappService').sendText(d, texto);
    return r?.ok !== false;
}

async function actuar(fila, d) {
    const m = modo();
    const mg = modoGuardar();
    const ws = require('./whatsappService');
    const ahora = new Date().toISOString();
    const upd = {
        estado: 'HECHA', accion: d.accion, motivo: recorta(d.motivo, 500) || null, obra: d.obra || null,
        texto: d.texto || null, acuse: d.acuse || null, modo: m, cerebro: d.cerebro || null, tel9: d.tel9 || fila.tel9,
        nombre: fila.nombre || d.nombre || null, ultimo_msg_id: d.ultimo_msg_id || fila.ultimo_msg_id,
        detalle: { ...(d.detalle || {}), rol: d.rol || null, titulo: d.titulo || null, pendientes: d.pendientes || [] },
        updated_at: ahora,
    };
    // 1. GUARDAR lo que ha mandado, ANTES de contestar: la respuesta dice «ya lo tengo en el
    //    expediente». Si algo no entra, no se le dice eso: a Fran, con lo que iba a decirle.
    const items = d.guardar || [];
    if (mg === 'real' && items.some(x => x.guardar && !x.hecho)) {
        const r = await Docs.ejecutar(items, d._ficheros || new Map(), { fuente: fuenteLocal(), rol: d.rol, avisar: true });
        if (r.fallidos.length && d.accion !== 'ESCALAR') {
            const iba = d.accion === 'RESPONDER' ? ` (iba a decirle: «${recorta(d.texto, 200)}»)` : '';
            d.motivo = `no he podido guardar ${r.fallidos.length === 1 ? 'uno de los documentos' : `${r.fallidos.length} documentos`} que ha mandado${iba}`;
            d.accion = 'ESCALAR';
            d.acuse = '';
            Object.assign(upd, { accion: 'ESCALAR', motivo: recorta(d.motivo, 500), acuse: null });
        }
    }
    upd.detalle.guardar = Docs.paraFila(items);
    const quedaPorGuardar = items.some(x => x.guardar && !x.hecho && !x.error);
    if (d.accion === 'CALLAR') {
        // Nada que decirle; pero si hay algo suyo que guardar, Fran lo sabe (en copia, para que
        // diga «C12»; en real, ya está guardado).
        if (items.some(x => x.guardar)) {
            try {
                if (await mandarAFran(textoParaFran(fila, d, { m, mg }))) upd.copia_at = new Date().toISOString();
            } catch (e) { log(`no se pudo avisar a Fran de C${fila.id}: ${e.message}`); }
        }
        await supabase.from('wa_contestador').update(upd).eq('id', fila.id);
        return;
    }
    let enviado = false;
    let acuseEnviado = false;
    if (m === 'real' && quedaPorGuardar) {
        // No debería pasar (en real se guarda siempre antes): por si acaso, no se le dice que lo tenemos.
        d.motivo = `quedan documentos suyos sin guardar (iba a decirle: «${recorta(d.texto || d.acuse, 200)}»)`;
        d.accion = 'ESCALAR';
        d.acuse = '';
        Object.assign(upd, { accion: 'ESCALAR', motivo: recorta(d.motivo, 500), acuse: null });
    }
    if (m === 'real') {
        const hoy = await respuestasDeHoy(fila.chat_id);
        if (d.accion === 'RESPONDER' && (hoy.chat >= CFG.topeChatDia || hoy.total >= CFG.topeDia)) {
            d.motivo = hoy.chat >= CFG.topeChatDia
                ? `ya le he contestado ${hoy.chat} veces hoy: lo dejo para ti (iba a decirle: «${recorta(d.texto, 200)}»)`
                : `tope del día (${CFG.topeDia}) alcanzado (iba a decirle: «${recorta(d.texto, 200)}»)`;
            d.accion = 'ESCALAR';
            upd.accion = 'ESCALAR';
            upd.motivo = recorta(d.motivo, 500);
        } else if (d.accion === 'RESPONDER' || (d.accion === 'ESCALAR' && d.acuse)) {
            const out = await ws.sendText(`34${upd.tel9}`, d.accion === 'RESPONDER' ? d.texto : d.acuse);
            if (out?.ok === false) throw new Error(out.error || 'WhatsApp no lo ha aceptado');
            upd.enviado_at = new Date().toISOString();
            enviado = d.accion === 'RESPONDER';
            acuseEnviado = d.accion === 'ESCALAR';
        }
    }
    // A Fran: todo en modo copia; en real, lo que es para él.
    if (m === 'copia' || d.accion === 'ESCALAR') {
        try {
            if (await mandarAFran(textoParaFran(fila, d, { m, mg, enviado, acuseEnviado }))) upd.copia_at = new Date().toISOString();
        } catch (e) { log(`no se pudo avisar a Fran de C${fila.id}: ${e.message}`); }
    }
    await supabase.from('wa_contestador').update(upd).eq('id', fila.id);
}

// ─── La vuelta ───────────────────────────────────────────────────────────────
let enVuelta = false;
let purgadoEl = null;
async function vuelta({ ahora = new Date() } = {}) {
    if (!activo() || enVuelta) return { hecho: [], motivo: enVuelta ? 'ya hay una vuelta' : 'apagado' };
    if (!horario.puedeContestar(ahora)) return { hecho: [], motivo: 'fuera de horario' };
    const ws = require('./whatsappService');
    if (typeof ws.isReady === 'function' && !ws.isReady()) return { hecho: [], motivo: 'WhatsApp no está listo' };
    enVuelta = true;
    const hecho = [];
    try {
        const hoy = ahora.toISOString().slice(0, 10);
        if (purgadoEl !== hoy) {
            purgadoEl = hoy;
            await supabase.from('wa_contestador').delete().lt('created_at', new Date(ahora.getTime() - CFG.purgaDias * 86_400_000).toISOString());
        }
        const { data: filas, error } = await supabase.from('wa_contestador').select('*')
            .eq('estado', 'PENDIENTE').lte('responder_after', ahora.toISOString()).order('responder_after').limit(CFG.porVuelta);
        if (error) throw new Error(error.message);
        for (const fila of filas || []) {
            try {
                const d = await decidir({ chatId: fila.chat_id, enVivo: true });
                if (d.estado === 'ESPERAR') {
                    await supabase.from('wa_contestador').update({ responder_after: plazoDesde().toISOString(), updated_at: new Date().toISOString() }).eq('id', fila.id);
                    hecho.push({ id: fila.id, estado: 'ESPERAR' });
                    continue;
                }
                if (d.estado === 'DESCARTADA') {
                    await supabase.from('wa_contestador').update({
                        estado: 'DESCARTADA', motivo: recorta(d.motivo, 500), tel9: d.tel9 || fila.tel9, nombre: fila.nombre || d.nombre || null, updated_at: new Date().toISOString(),
                    }).eq('id', fila.id);
                    hecho.push({ id: fila.id, estado: 'DESCARTADA', motivo: d.motivo });
                    continue;
                }
                await actuar(fila, d);
                hecho.push({ id: fila.id, estado: 'HECHA', accion: d.accion });
                log(`C${fila.id} ${d.accion}${d.obra ? ` (${d.obra})` : ''}: ${recorta(d.motivo, 80)}`);
            } catch (e) {
                const intentos = (fila.intentos || 0) + 1;
                // Un fallo de lectura (WhatsApp ocupado) se reintenta; al tercero, ERROR y al resumen.
                await supabase.from('wa_contestador').update({
                    intentos, error: recorta(e.message, 300), updated_at: new Date().toISOString(),
                    ...(intentos >= 3 ? { estado: 'ERROR' } : { responder_after: new Date(Date.now() + 5 * 60_000).toISOString() }),
                }).eq('id', fila.id);
                hecho.push({ id: fila.id, estado: 'FALLO', error: e.message });
                log(`C${fila.id} fallo (${intentos}): ${e.message}`);
                if (e.status === 503 || /no responde|plazo/i.test(e.message)) break;   // la sesión no está para leer
            }
        }
    } catch (e) {
        console.warn('[contestador] vuelta:', e.message);
        return { hecho, motivo: e.message };
    } finally {
        enVuelta = false;
    }
    return { hecho };
}

// ─── «C12»: lo de una copia, tal cual (o con los cambios de Fran) ─────────────
/**
 * Envía lo que el contestador habría dicho (modo copia), con el «sí» de Fran.
 * Comprueba que la conversación no ha cambiado desde entonces.
 */
async function enviarCopia(id, { si, texto: deFran = null } = {}) {
    const e = (msg, status = 400) => { const x = new Error(msg); x.status = status; return x; };
    if (!String(si || '').trim()) throw e('Falta la respuesta literal de Fran («si»).');
    const { data: f, error } = await supabase.from('wa_contestador').select('*').eq('id', Number(id)).maybeSingle();
    if (error) throw e('La base de datos no responde.', 503);
    if (!f) throw e(`No hay ninguna C${id}.`, 404);
    if (f.enviado_at) throw e(`C${id} ya se envió el ${new Date(f.enviado_at).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}.`, 409);
    // «C12, dile además que…»: el texto lo ha terminado de redactar el asistente con lo que dijo
    // Fran (su mensaje es el «sí» para ESTE envío). Pasa por el mismo remate: sin emojis ni firma.
    let propio = null;
    if (deFran != null) {
        propio = cerebro.limpiar(String(deFran));
        if (!propio) throw e('El texto que me pasas está vacío.');
        if (propio.length > 1500) throw e('El texto es demasiado largo para un WhatsApp de respuesta (más de 1.500 caracteres).');
        if (/\{ENLACE_[A-Z_]+\}/.test(propio)) throw e('El texto lleva una marca de enlace sin sustituir ({ENLACE_…}): pon el enlace real o quítalo.');
    }
    const texto = propio || (f.accion === 'RESPONDER' ? f.texto : (f.accion === 'ESCALAR' ? f.acuse : null));
    const items = Array.isArray(f.detalle?.guardar) ? f.detalle.guardar : [];
    const porGuardar = items.filter(x => x.guardar && !x.hecho);
    if (!texto && !porGuardar.length) throw e(`C${id} no tiene nada que mandar ni que guardar (${f.accion}).`, 409);
    if (Date.now() - Date.parse(f.updated_at) > 24 * 3_600_000) throw e(`C${id} tiene más de 24 h: la conversación ya habrá cambiado.`, 409);
    const fuente = fuenteLocal();
    const conv = await fuente.leer({ chatId: f.chat_id, dias: 3 });
    const ms = conv.mensajes || [];
    const ult = ms[ms.length - 1];
    if (ult && ult.id !== f.ultimo_msg_id) {
        throw e(ult.de_mi ? `En el chat de C${id} ya se ha escrito algo después: no lo mando.`
            : `Ha escrito algo más desde C${id}: no lo mando, que la respuesta ya no encaja.`, 409);
    }
    // Primero se GUARDA lo suyo (se vuelve a bajar del chat): la respuesta dice que ya lo
    // tenemos. Si algo no entra, no se manda nada y Fran lo sabe.
    let guardados = 0;
    if (porGuardar.length) {
        const r = await Docs.ejecutar(items, new Map(), { fuente, rol: f.detalle?.rol, avisar: false, por: 'contestador (Fran)' });
        guardados = r.guardados;
        await supabase.from('wa_contestador').update({
            detalle: { ...(f.detalle || {}), guardar: Docs.paraFila(items) }, updated_at: new Date().toISOString(),
        }).eq('id', f.id);
        if (r.fallidos.length) {
            throw e(`No he podido guardar ${r.fallidos.map(x => `${recorta(x.que || x.tipo, 60)} (${recorta(x.error, 100)})`).join('; ')}: `
                + `${texto ? 'no le mando nada' : 'lo demás sí está guardado'}.`, 502);
        }
    }
    const detalle = {
        ...(f.detalle || {}), guardar: items.length ? Docs.paraFila(items) : f.detalle?.guardar, mandado_por_fran: recorta(si, 200),
        ...(propio ? { texto_de_fran: propio } : {}),
    };
    if (!texto) {
        await supabase.from('wa_contestador').update({ detalle, updated_at: new Date().toISOString() }).eq('id', f.id);
        return { ok: true, id: f.id, tel9: f.tel9, texto: null, guardados };
    }
    const out = await require('./whatsappService').sendText(`34${f.tel9}`, texto);
    if (out?.ok === false) throw e(out.error || 'WhatsApp no lo ha aceptado', 502);
    await supabase.from('wa_contestador').update({
        enviado_at: new Date().toISOString(), updated_at: new Date().toISOString(), detalle,
    }).eq('id', f.id);
    return { ok: true, id: f.id, tel9: f.tel9, texto, guardados };
}

// ─── El resumen de las 9:00 (dentro del repaso del asistente) ────────────────
async function resumen({ desde = new Date(Date.now() - 24 * 3_600_000) } = {}) {
    try {
        const { data, error } = await supabase.from('wa_contestador').select('id, estado, accion, motivo, modo, enviado_at, nombre, obra')
            .gte('updated_at', desde.toISOString()).neq('estado', 'PENDIENTE').limit(500);
        if (error) throw new Error(error.message);
        const f = data || [];
        if (!f.length) return '';
        const n = (p) => f.filter(p).length;
        const resp = n(x => x.accion === 'RESPONDER');
        const esc = n(x => x.accion === 'ESCALAR');
        const calla = n(x => x.accion === 'CALLAR');
        const desc = n(x => x.estado === 'DESCARTADA');
        const err = n(x => x.estado === 'ERROR');
        const enviados = n(x => x.enviado_at);
        const copia = modo() === 'copia';
        const partes = [
            resp ? `${resp} ${copia ? 'contestaría' : 'contestadas'}` : null,
            esc ? `${esc} para ti` : null,
            calla ? `${calla} sin contestar (cortesía)` : null,
            desc ? `${desc} ya atendidas o no eran nuestras` : null,
            err ? `${err} con error` : null,
        ].filter(Boolean);
        const lin = [`*Contestador${copia ? ' (en copia)' : ''}*: ${partes.join(' · ')}.`];
        if (copia && enviados) lin.push(`Has mandado ${enviados} con «C…».`);
        return lin.join('\n');
    } catch (e) {
        console.warn('[contestador] resumen:', e.message);
        return '';
    }
}

async function listar({ estado = null, limite = 50 } = {}) {
    let q = supabase.from('wa_contestador')
        .select('id, chat_id, tel9, nombre, estado, accion, motivo, obra, texto, acuse, modo, cerebro, primero_at, responder_after, enviado_at, copia_at, intentos, error')
        .order('updated_at', { ascending: false }).limit(limite);
    if (estado) q = q.eq('estado', estado);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data || [];
}

let handle = null;
function start() {
    if (handle) return;
    if (!activo()) {
        console.log('[contestador] APAGADO (CONTESTADOR_ENABLED != true): nadie contesta solo a los clientes.');
        return;
    }
    try {
        const ws = require('./whatsappService');
        ws.onMessage(alMensajeEntrante);
        // La pausa de 24 h si escribe una persona: la apuntan las esperas. Si estas están
        // apagadas, se engancha aquí su mismo listener (que también mira este interruptor).
        const esperas = require('./esperasWhatsapp');
        if (!esperas.activo() && typeof ws.onMensajePropio === 'function') ws.onMensajePropio(esperas.alMensajePropio);
    } catch (e) {
        console.warn('[contestador] sin sesión de WhatsApp:', e.message);
    }
    handle = setInterval(() => { vuelta().catch(e => console.warn('[contestador] vuelta:', e.message)); }, 60 * 1000);
    console.log(`[contestador] activo en modo ${modo().toUpperCase()}: ${CFG.silencioMin} min de silencio, de ${horario.desde()} a ${horario.hasta()} h, `
        + `${CFG.topeChatDia} al día por chat, cerebro ${process.env.CONTESTADOR_CEREBRO === 'gemini' ? 'Gemini' : 'Claude (respaldo Gemini)'}${process.env.ASISTENTE_URL ? '' : ' — SIN ASISTENTE_URL: irá con Gemini'}.`);
}

module.exports = {
    start, alMensajeEntrante, vuelta, decidir, enviarCopia, resumen, listar, activo, modo, modoGuardar, CFG,
    // para las pruebas
    textoParaFran, lineasGuardar, plazoDesde, esDeLaCasa, resumenPendientes, dejarleAElla,
};
