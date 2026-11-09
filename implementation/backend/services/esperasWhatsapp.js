// ============================================================================
// esperasWhatsapp.js — el agente sabe a quién le hemos PEDIDO algo por WhatsApp,
// si ha CONTESTADO y cuándo toca INSISTIR (agente autónomo, fase 1, 2026-11-09).
//
// Hasta ahora lo que se pedía por WhatsApp se quedaba en el aire: nadie miraba si
// el cliente había contestado, y nadie se lo recordaba (medido el 08/11/2026:
// pedidos de 2 y 4 días sin una sola insistencia; la ronda de WhatsApp, que lo
// habría visto, no termina una pasada desde el 03/11). Fran pidió (09/11/2026)
// que, si se le escribe a alguien, el sistema sepa al momento si ha contestado y,
// si no, que insista él.
//
//   · ABRIR: cuando la casa PIDE algo (POST /:id/solicitar-faltantes, el pedido
//     del agente tras la aceptación) nace una ESPERA en `wa_esperas`, con lo pedido
//     y el enlace. Una sola abierta por teléfono + obra + motivo: un segundo pedido
//     la RENUEVA (plazo nuevo, mismos intentos).
//   · CERRAR AL MOMENTO: el mensaje que entra de ese teléfono (el listener de la
//     sesión, `alMensajeEntrante`) la marca CONTESTADA; una subida por el enlace
//     (`cerrarPorSubida`, desde uploadNotifier) la marca CERRADA. Sin esperar a
//     ninguna ronda: es el «webhook» que pedía Fran, y ya lo da la sesión.
//   · CALLARSE si escribe una persona: un mensaje NUESTRO que no ha salido por la
//     app (Fran desde el móvil) pausa el chat `PAUSA_HUMANA_H` horas
//     (`alMensajePropio`, tabla `wa_chat_pausas`). Ese chat lo lleva él.
//   · INSISTIR (`vuelta`, cada 5 min, de 7 a 21 h de lunes a viernes): lo que vence
//     sin respuesta se RECUERDA con plantilla (sin IA) hasta `max_intentos`; después
//     queda VENCIDA y va al resumen. En MODO COPIA (el de salida) no se le escribe a
//     nadie: el recordatorio se apunta y Fran lo ve en el resumen de las 9:00.
//   · RESUMEN (`resumen`): lo que contestaron, lo recordado (o lo que se habría
//     recordado) y lo que no contesta. Lo manda el repaso de las 9:00 del asistente
//     en el MISMO mensaje: dos avisos a la misma hora son ruido (el parte se apagó
//     por eso).
//
// Topes en el CÓDIGO, no en el prompt: horario, un recordatorio al día por
// persona, `TOPE_DIA` y `TOPE_HORA` y unos pocos por vuelta. Los textos y los
// enlaces los pone el código.
//
// Nace APAGADO (`ESPERAS_ENABLED`): local escribe en la BD de producción y la
// sesión de WhatsApp es la del VPS. `ESPERAS_MODO=real` para escribir de verdad;
// cualquier otra cosa es modo copia. Nada aquí lanza: cuelga de la sesión que usa
// TODA la app y de rutas que ya han enviado su mensaje.
// ============================================================================

const supabase = require('./supabaseClient');
const { FIRMA, nombreSaludo, nombrePila } = require('./recordatorios');

const num = (v, d) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : d; };
const CFG = {
    primerAvisoH: num(process.env.ESPERAS_PRIMER_AVISO_H, 48),    // del pedido al primer recordatorio
    siguienteH: num(process.env.ESPERAS_SIGUIENTE_H, 48),         // de un recordatorio al siguiente paso
    maxIntentos: num(process.env.ESPERAS_MAX_INTENTOS, 1),        // recordatorios antes de darla por VENCIDA
    topeDia: num(process.env.ESPERAS_TOPE_DIA, 30),
    topeHora: num(process.env.ESPERAS_TOPE_HORA, 8),
    porVuelta: num(process.env.ESPERAS_POR_VUELTA, 3),
    pausaHumanaH: num(process.env.ESPERAS_PAUSA_HUMANA_H, 24),
};
const horario = require('../utils/horarioWhatsapp');

const activo = () => process.env.ESPERAS_ENABLED === 'true';
const modo = () => (process.env.ESPERAS_MODO === 'real' ? 'real' : 'copia');
const ult9 = (t) => String(t || '').replace(/\D/g, '').slice(-9) || null;
const recorta = (s, n) => { const v = String(s || '').trim(); return v.length > n ? `${v.slice(0, n - 1)}…` : v; };

// Catálogo CERRADO de lo que se espera. `que` es cómo se nombra en el recordatorio.
const MOTIVOS = {
    DOCUMENTACION: { que: 'la documentación' },
    CEE_INICIAL: { que: 'lo que nos falta para el certificado energético' },
};
const QUIEN = new Set(['CLIENTE', 'CONTACTO', 'INSTALADOR', 'CERTIFICADOR', 'OTRO']);

// ─── Horario (Madrid) ────────────────────────────────────────────────────────
// Un recordatorio es escribir SIN que nos hayan escrito: la franja de la casa
// (7–21 h) y de lunes a viernes (utils/horarioWhatsapp.js, fuente única).
const enHorario = (d = new Date()) => horario.puedeInsistir(d);
/** La primera hora hábil a partir de `d` (ella misma si ya lo es). */
const siguienteHabil = (d = new Date()) => horario.siguienteApertura(d, { insistir: true });
/** `horas` después de `desde`, cayendo siempre en horario hábil. */
const venceTras = (desde, horas) => siguienteHabil(new Date(desde.getTime() + horas * 3_600_000));

const fechaCorta = (iso) => new Date(iso).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'long' });

// ─── Los textos (fuente única, sin IA) ──────────────────────────────────────
/**
 * El recordatorio. Corto, en tono de seguimiento y sin reproche: se le recuerda
 * lo que se le pidió y dónde subirlo, y se le da la salida de «ya lo mandé por
 * otro lado», que es lo más frecuente y no tiene por qué saberlo la app.
 */
function textoRecordatorio(e, { enlace = null } = {}) {
    // De tú y por el nombre de pila («Ana García López» → «Ana»); un nombre de dos
    // palabras («Jose Antonio», «Instalaciones Plaza») se deja entero.
    const completo = nombreSaludo(e.nombre);
    const nombre = completo.split(/\s+/).length >= 3 ? nombrePila(completo) : completo;
    const hola = nombre ? `Hola ${nombre}, ¿qué tal?` : 'Hola, ¿qué tal?';
    const intermediario = e.quien === 'INSTALADOR' || e.quien === 'CONTACTO';
    const deLaObra = intermediario && e.numero ? ` del expediente *${e.numero}*` : '';
    const pedido = (Array.isArray(e.pedido) ? e.pedido : []).filter(Boolean).slice(0, 8);
    const lista = pedido.length ? `\n${pedido.map(p => `· ${p}`).join('\n')}\n` : '';
    const que = MOTIVOS[e.motivo]?.que || 'lo que te pedimos';
    const url = enlace || e.enlace;
    const dondeSubir = url ? `\nCuando lo tengas, se sube desde el móvil aquí:\n${url}\n` : '';
    return `${hola}\n\nTe escribo por ${pedido.length ? 'lo que te pedimos' : que} el ${fechaCorta(e.enviado_at)}${deLaObra}:${lista || '\n'}${dondeSubir}\nSi ya lo has mandado por otro lado, dímelo y lo busco.\n\n¡Gracias!\n${FIRMA}`;
}

/** Cómo se describe en el resumen lo que escribió (sin el contenido entero). */
function describirMensaje(msg) {
    const tipo = String(msg?.type || 'chat');
    const cuerpo = recorta(String(msg?.body || '').replace(/\s+/g, ' '), 140);
    if (tipo === 'chat' || tipo === 'text') return cuerpo ? `«${cuerpo}»` : 'un mensaje';
    const nombres = { image: 'una foto', video: 'un vídeo', document: 'un documento', ptt: 'una nota de voz', audio: 'un audio', sticker: 'un sticker' };
    return `${nombres[tipo] || 'un adjunto'}${cuerpo && tipo !== 'ptt' ? ` («${cuerpo}»)` : ''}`;
}

// ─── Abrir y cerrar ──────────────────────────────────────────────────────────
/**
 * La casa le ha PEDIDO algo a alguien por WhatsApp. Nunca lanza.
 * @returns {Promise<{id:number, renovada:boolean}|null>}
 */
async function abrir({ tel, quien = 'CLIENTE', nombre = null, expedienteId = null, oportunidadId = null, numero = null,
    motivo, pedido = [], enlace = null, texto = null, origen = null, ahora = new Date() } = {}) {
    try {
        if (!activo()) return null;
        const tel9 = ult9(tel);
        if (!tel9 || !MOTIVOS[motivo]) return null;
        const fila = {
            tel9, quien: QUIEN.has(quien) ? quien : 'OTRO', nombre: nombre ? recorta(nombre, 120) : null,
            expediente_id: expedienteId, oportunidad_id: oportunidadId, numero, motivo,
            pedido: (Array.isArray(pedido) ? pedido : []).map(p => recorta(p, 160)).filter(Boolean).slice(0, 12),
            enlace: enlace ? String(enlace).replace(/[).,;:!?»"']+$/, '') : null,
            texto: texto ? recorta(texto, 600) : null, origen,
            enviado_at: ahora.toISOString(), vence_at: venceTras(ahora, CFG.primerAvisoH).toISOString(),
            max_intentos: CFG.maxIntentos, updated_at: ahora.toISOString(),
        };
        let q = supabase.from('wa_esperas').select('id').eq('estado', 'ABIERTA').eq('tel9', tel9).eq('motivo', motivo);
        q = numero ? q.eq('numero', numero) : q.is('numero', null);
        const { data: previa } = await q.limit(1).maybeSingle();
        if (previa?.id) {
            const { error } = await supabase.from('wa_esperas').update(fila).eq('id', previa.id);
            if (error) throw new Error(error.message);
            abiertos.tels.add(tel9);
            return { id: previa.id, renovada: true };
        }
        const { data, error } = await supabase.from('wa_esperas').insert(fila).select('id').single();
        if (error) throw new Error(error.message);
        abiertos.tels.add(tel9);
        return { id: data.id, renovada: false };
    } catch (e) {
        console.warn('[esperas] abrir:', e.message);
        return null;
    }
}

/** Cierra lo ABIERTO que cumpla el filtro. Devuelve cuántas. Nunca lanza. */
async function cerrar(filtro, { estado, respuesta }) {
    try {
        let q = supabase.from('wa_esperas').update({
            estado, respuesta: respuesta ? recorta(respuesta, 200) : null,
            cerrado_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }).eq('estado', 'ABIERTA');
        for (const [k, v] of Object.entries(filtro)) q = q.eq(k, v);
        const { data, error } = await q.select('id, numero');
        if (error) throw new Error(error.message);
        return data || [];
    } catch (e) {
        console.warn('[esperas] cerrar:', e.message);
        return [];
    }
}

// Los teléfonos con algo abierto, en memoria: cada mensaje que entra a la sesión
// pasa por aquí y casi nunca es de alguien a quien esperamos. Se refresca cada 2 min.
const abiertos = { at: 0, tels: new Set() };
async function telsAbiertos() {
    if (Date.now() - abiertos.at < 120_000) return abiertos.tels;
    const { data, error } = await supabase.from('wa_esperas').select('tel9').eq('estado', 'ABIERTA').limit(2000);
    if (error) throw new Error(error.message);
    abiertos.tels = new Set((data || []).map(r => r.tel9));
    abiertos.at = Date.now();
    return abiertos.tels;
}

// Un @lid no lleva el teléfono: se resuelven, en UNA llamada a la sesión, los de
// los pocos teléfonos que esperan algo (como `aceptacionAgente.telDeChat`).
const lidDe = new Map();      // tel9 → «…@lid»
async function telDeChat(chatId, candidatos) {
    if (chatId.endsWith('@c.us')) return ult9(chatId);
    if (!chatId.endsWith('@lid')) return null;
    for (const [t, lid] of lidDe) if (lid === chatId && candidatos.includes(t)) return t;
    const faltan = candidatos.filter(t => !lidDe.has(t)).slice(0, 200);
    const client = require('./whatsappService').getClient?.();
    if (faltan.length && client?.getContactLidAndPhone) {
        try {
            const r = await Promise.race([
                client.getContactLidAndPhone(faltan.map(t => `34${t}@c.us`)),
                new Promise((_, rej) => setTimeout(() => rej(new Error('plazo')), 15_000)),
            ]);
            (r || []).forEach((x, i) => {
                const lid = x?.lid ? String(x.lid._serialized || x.lid) : null;
                const t = ult9(x?.pn?._serialized || x?.pn || '') || faltan[i];
                if (lid && t) lidDe.set(t, lid);
            });
        } catch { /* se reintenta con el siguiente mensaje */ }
    }
    for (const [t, lid] of lidDe) if (lid === chatId && candidatos.includes(t)) return t;
    return null;
}

/**
 * ¿Es solo un ACUSE («vale», «ok, gracias», «mañana te lo mando»)? Un texto corto,
 * sin pregunta ni enlace. No cierra la espera: lo pedido sigue sin llegar, y el
 * recordatorio a su hora es justo lo que hace falta. Lo demás (un adjunto, una
 * pregunta, una explicación) lo tiene que leer alguien: CONTESTADA.
 */
function esAcuse(msg) {
    const tipo = String(msg?.type || 'chat');
    if (tipo !== 'chat' && tipo !== 'text') return false;
    const t = String(msg?.body || '').trim();
    return t.length > 0 && t.length <= 60 && !/[?¿]/.test(t) && !/https?:\/\//i.test(t);
}

/**
 * ¿Es la RESPUESTA AUTOMÁTICA de un WhatsApp Business («¡Gracias por escribirnos! Si es
 * algo urgente…»)? Llega a los pocos minutos de nuestro mensaje, es de plantilla y suele
 * llevar emojis o ser larga. Medido el 09/11/2026: la de un instalador (26RES080_76) se
 * contaba como contestada. Las tres cosas a la vez: una persona que da las gracias por
 * el mensaje («Gracias por tu mensaje, te escribo ahora») no debe quedarse sin cerrar.
 */
const PATRON_AUTO = /gracias por (escribir|contactar|tu mensaje|su mensaje|ponerte en contacto|comunicarte)|(te|le|os) (responderemos|atenderemos|contestaremos)|en breve|lo antes posible|fuera de(l)? horario|horario de atenci[oó]n|mensaje autom[aá]tico|respuesta autom[aá]tica/i;
function esAutomatica(msg, enviadoAtMs) {
    const t = String(msg?.body || '');
    const cuando = Number(msg?.timestamp) ? Number(msg.timestamp) * 1000 : Date.now();
    const delta = cuando - (Number(enviadoAtMs) || 0);
    return delta >= 0 && delta < 10 * 60_000 && PATRON_AUTO.test(t) && (/\p{Extended_Pictographic}/u.test(t) || t.length > 120);
}

/** Un mensaje que ENTRA (listener de la sesión). Si es de alguien a quien esperamos, CONTESTADA. */
async function alMensajeEntrante(msg) {
    try {
        if (!activo() || !msg || msg.fromMe || msg.isStatus) return;
        const chatId = String(msg.from || '');
        if (!chatId.endsWith('@c.us') && !chatId.endsWith('@lid')) return;
        const tels = await telsAbiertos();
        if (!tels.size) return;
        const tel9 = await telDeChat(chatId, [...tels]);
        if (!tel9) return;
        const { data: filas } = await supabase.from('wa_esperas').select('id, acciones, enviado_at')
            .eq('estado', 'ABIERTA').eq('tel9', tel9).limit(10);
        const ultimoPedido = Math.max(0, ...(filas || []).map(e => Date.parse(e.enviado_at) || 0));
        const tipo = esAutomatica(msg, ultimoPedido) ? 'automatica' : esAcuse(msg) ? 'acuse' : null;
        if (tipo) {
            // No cierra: se apunta, y la espera sigue hasta que conteste de verdad o venza.
            for (const e of filas || []) {
                await supabase.from('wa_esperas').update({
                    ...(tipo === 'acuse' ? { respuesta: describirMensaje(msg) } : {}), updated_at: new Date().toISOString(),
                    acciones: accion(e, { accion: tipo, texto: recorta(msg.body, 60) }),
                }).eq('id', e.id);
            }
            return;
        }
        const cerradas = await cerrar({ tel9 }, { estado: 'CONTESTADA', respuesta: describirMensaje(msg) });
        if (cerradas.length) {
            tels.delete(tel9);
            console.log(`[esperas] contestó ${tel9}: ${cerradas.map(c => c.numero || c.id).join(', ')}`);
        }
    } catch (e) {
        console.warn('[esperas] mensaje entrante:', e.message);
    }
}

/** La quita una persona: ya está hablado y no hace falta insistir. */
async function cancelar(id, quien = 'ADMIN') {
    const r = await cerrar({ id }, { estado: 'CANCELADA', respuesta: `La ha quitado ${quien}` });
    return r.length > 0;
}

/** Han subido por el ENLACE (uploadNotifier, al cerrar la tanda): lo pedido de esa obra, CERRADO. */
async function cerrarPorSubida(oportunidadUuid, detalle = 'Ha subido documentación por el enlace') {
    if (!activo() || !oportunidadUuid) return [];
    return cerrar({ oportunidad_id: oportunidadUuid }, { estado: 'CERRADA', respuesta: detalle });
}

// ─── Callarse si escribe una persona ─────────────────────────────────────────
const pausadoHasta = new Map();   // chatId → ms (para no escribir en la BD con cada mensaje suyo)
/**
 * Un mensaje NUESTRO (message_create, fromMe). `delSistema` lo decide la sesión:
 * lo ha mandado la app. Si no, lo ha escrito Fran a mano y ese chat lo lleva él.
 */
async function alMensajePropio({ msg, delSistema }) {
    try {
        if (!activo() || delSistema || !msg) return;
        const chatId = String(msg.to || '');
        if (!chatId.endsWith('@c.us') && !chatId.endsWith('@lid')) return;
        const hasta = Date.now() + CFG.pausaHumanaH * 3_600_000;
        if ((pausadoHasta.get(chatId) || 0) > hasta - 3_600_000) return;   // ya pausado hace menos de 1 h
        pausadoHasta.set(chatId, hasta);
        // Un @lid se apunta TAMBIÉN por su número: la vuelta pregunta por teléfono y,
        // tras un reinicio, no sabe qué @lid es de quién.
        const ids = new Set([chatId]);
        if (chatId.endsWith('@lid')) {
            const conocido = [...lidDe].find(([, lid]) => lid === chatId)?.[0];
            if (conocido) ids.add(`34${conocido}@c.us`);
            else {
                const client = require('./whatsappService').getClient?.();
                try {
                    const r = client?.getContactLidAndPhone ? await Promise.race([
                        client.getContactLidAndPhone([chatId]),
                        new Promise((_, rej) => setTimeout(() => rej(new Error('plazo')), 15_000)),
                    ]) : null;
                    const t = ult9(r?.[0]?.pn?._serialized || r?.[0]?.pn || '');
                    if (t) { ids.add(`34${t}@c.us`); lidDe.set(t, chatId); }
                } catch { /* queda solo por el @lid */ }
            }
        }
        const filas = [...ids].map(id => ({
            chat_id: id, hasta: new Date(hasta).toISOString(),
            motivo: 'Le ha escrito una persona de la casa', updated_at: new Date().toISOString(),
        }));
        const { error } = await supabase.from('wa_chat_pausas').upsert(filas);
        if (error) throw new Error(error.message);
    } catch (e) {
        console.warn('[esperas] mensaje propio:', e.message);
    }
}

/** Hasta cuándo está pausado el chat de ese teléfono (por su @c.us o por su @lid), o null. */
async function pausaDe(tel9) {
    const ids = [`34${tel9}@c.us`];
    if (lidDe.has(tel9)) ids.push(lidDe.get(tel9));
    const { data } = await supabase.from('wa_chat_pausas').select('hasta').in('chat_id', ids);
    const hasta = Math.max(0, ...(data || []).map(r => Date.parse(r.hasta) || 0));
    return hasta > Date.now() ? new Date(hasta) : null;
}

// ─── La vuelta ───────────────────────────────────────────────────────────────
async function enlaceDe(e) {
    if (e.enlace || !e.oportunidad_id) return e.enlace || null;
    try { return await require('./reformaUploadService').uploadLinkSiExiste(e.oportunidad_id); } catch { return null; }
}
const accion = (e, a) => [...(Array.isArray(e.acciones) ? e.acciones : []), { at: new Date().toISOString(), ...a }].slice(-10);

/**
 * Lo que vence: recordar, posponer o dar por VENCIDA. En modo copia no se le
 * escribe a nadie. `seco`: no escribe nada y devuelve lo que haría.
 * @returns {Promise<{hecho:Array, motivo?:string}>}
 */
async function vuelta({ seco = false, ahora = new Date() } = {}) {
    const hecho = [];
    try {
        if (!seco && !activo()) return { hecho, motivo: 'apagado' };
        if (!enHorario(ahora)) return { hecho, motivo: 'fuera de horario' };
        const { data: filas, error } = await supabase.from('wa_esperas').select('*')
            .eq('estado', 'ABIERTA').lte('vence_at', ahora.toISOString()).order('vence_at').limit(25);
        if (error) throw new Error(error.message);
        if (!filas?.length) return { hecho };

        // Topes del día y de la hora (lo recordado de verdad; lo copiado no gasta).
        const inicioDia = new Date(ahora); inicioDia.setHours(0, 0, 0, 0);
        const { data: hoy } = await supabase.from('wa_esperas').select('tel9, recordado_at, acciones')
            .gte('recordado_at', inicioDia.toISOString()).limit(500);
        const reales = (hoy || []).filter(r => (r.acciones || []).some(a => a.accion === 'recordado' && a.modo === 'real' && a.at >= inicioDia.toISOString()));
        let enviadosDia = reales.length;
        let enviadosHora = reales.filter(r => Date.parse(r.recordado_at) > ahora.getTime() - 3_600_000).length;
        const yaHoy = new Set((hoy || []).map(r => r.tel9));
        let enEstaVuelta = 0;

        for (const e of filas) {
            const m = modo();
            // 1. Agotada: VENCIDA, y al resumen.
            if (e.intentos >= e.max_intentos) {
                hecho.push({ id: e.id, numero: e.numero, accion: 'vencida' });
                if (!seco) await supabase.from('wa_esperas').update({
                    estado: 'VENCIDA', cerrado_at: ahora.toISOString(), updated_at: ahora.toISOString(),
                    acciones: accion(e, { accion: 'vencida' }),
                }).eq('id', e.id);
                continue;
            }
            // 2. Ese chat lo lleva una persona: se espera a que acabe la pausa.
            const pausa = await pausaDe(e.tel9);
            if (pausa) {
                hecho.push({ id: e.id, numero: e.numero, accion: 'pausa', hasta: pausa.toISOString() });
                if (!seco) await supabase.from('wa_esperas').update({
                    vence_at: siguienteHabil(pausa).toISOString(), updated_at: ahora.toISOString(),
                    acciones: accion(e, { accion: 'pausa', hasta: pausa.toISOString() }),
                }).eq('id', e.id);
                continue;
            }
            // 3. Topes: uno al día por persona; del día, de la hora y de la vuelta.
            if (yaHoy.has(e.tel9)) {
                hecho.push({ id: e.id, numero: e.numero, accion: 'manana', motivo: 'ya se le ha escrito hoy' });
                if (!seco) await supabase.from('wa_esperas').update({ vence_at: venceTras(ahora, 16).toISOString(), updated_at: ahora.toISOString() }).eq('id', e.id);
                continue;
            }
            if (enEstaVuelta >= CFG.porVuelta) break;
            if (m === 'real' && (enviadosDia >= CFG.topeDia || enviadosHora >= CFG.topeHora)) break;

            // 4. Recordar (o, en modo copia, apuntar lo que se habría mandado).
            const texto = textoRecordatorio(e, { enlace: await enlaceDe(e) });
            hecho.push({ id: e.id, numero: e.numero, accion: m === 'real' ? 'recordado' : 'copia', tel9: e.tel9, texto });
            enEstaVuelta += 1;
            yaHoy.add(e.tel9);
            if (seco) continue;
            if (m === 'real') {
                const out = await require('./whatsappService').sendText(`34${e.tel9}`, texto);
                if (out && out.ok === false) throw new Error(out.error || 'WhatsApp no lo ha aceptado');
                enviadosDia += 1; enviadosHora += 1;
            }
            await supabase.from('wa_esperas').update({
                intentos: e.intentos + 1, recordado_at: ahora.toISOString(),
                vence_at: venceTras(ahora, CFG.siguienteH).toISOString(), updated_at: ahora.toISOString(),
                acciones: accion(e, { accion: 'recordado', modo: m, texto: recorta(texto, 600) }),
            }).eq('id', e.id);
        }
    } catch (e) {
        console.warn('[esperas] vuelta:', e.message);
        return { hecho, motivo: e.message };
    }
    return { hecho };
}

// ─── El resumen de las 9:00 ──────────────────────────────────────────────────
const quienTxt = (e) => `${nombreSaludo(e.nombre) || e.tel9}${e.quien && e.quien !== 'CLIENTE' ? ` (${e.quien.toLowerCase()})` : ''}`;
/**
 * Lo que ha pasado desde `desde` (por defecto, las últimas 24 h), en un bloque de
 * texto para WhatsApp. Vacío si no hay nada: entonces no se dice nada. Nunca lanza.
 */
async function resumen({ desde = new Date(Date.now() - 24 * 3_600_000) } = {}) {
    try {
        const d = desde.toISOString();
        const [{ data: cerradas }, { data: recordadas }, { count: abiertas }] = await Promise.all([
            supabase.from('wa_esperas').select('numero, nombre, quien, tel9, estado, respuesta, pedido, enviado_at')
                .gte('cerrado_at', d).order('cerrado_at').limit(60),
            supabase.from('wa_esperas').select('numero, nombre, quien, tel9, acciones')
                .gte('recordado_at', d).order('recordado_at').limit(60),
            supabase.from('wa_esperas').select('id', { count: 'exact', head: true }).eq('estado', 'ABIERTA'),
        ]);
        const lin = [];
        const contestaron = (cerradas || []).filter(e => e.estado === 'CONTESTADA' || e.estado === 'CERRADA');
        const vencidas = (cerradas || []).filter(e => e.estado === 'VENCIDA');
        if (contestaron.length) {
            lin.push(`*Han contestado (${contestaron.length})*`);
            contestaron.slice(0, 8).forEach(e => lin.push(`• ${e.numero || '—'} · ${quienTxt(e)}: ${e.respuesta || 'ha escrito'}`));
            if (contestaron.length > 8) lin.push(`  …y ${contestaron.length - 8} más`);
        }
        const copias = [];
        const reales = [];
        for (const e of recordadas || []) {
            const ult = [...(e.acciones || [])].reverse().find(a => a.accion === 'recordado' && a.at >= d);
            if (!ult) continue;
            (ult.modo === 'real' ? reales : copias).push({ ...e, texto: ult.texto });
        }
        if (reales.length) {
            lin.push(`*Recordatorios enviados (${reales.length})*`);
            reales.slice(0, 8).forEach(e => lin.push(`• ${e.numero || '—'} · ${quienTxt(e)}`));
        }
        if (copias.length) {
            lin.push(`*Habría recordado (${copias.length}, en modo copia: no ha salido nada)*`);
            copias.slice(0, 8).forEach(e => lin.push(`• ${e.numero || '—'} · ${quienTxt(e)}`));
            lin.push(`Ejemplo, a ${quienTxt(copias[0])}:\n${String(copias[0].texto || '').split('\n').map(l => `> ${l}`).join('\n')}`);
        }
        if (vencidas.length) {
            lin.push(`*No contestan tras recordárselo (${vencidas.length})*`);
            vencidas.slice(0, 8).forEach(e => lin.push(`• ${e.numero || '—'} · ${quienTxt(e)}, pedido el ${fechaCorta(e.enviado_at)}`));
        }
        if (!lin.length) return '';
        lin.push(`_Esperando respuesta: ${abiertas || 0}._`);
        return lin.join('\n');
    } catch (e) {
        console.warn('[esperas] resumen:', e.message);
        return '';
    }
}

/** Lo abierto, para la pantalla o un script (sin el texto entero). */
async function listar({ estado = 'ABIERTA', limite = 200 } = {}) {
    const { data, error } = await supabase.from('wa_esperas')
        .select('id, numero, nombre, quien, tel9, motivo, pedido, origen, enviado_at, vence_at, intentos, max_intentos, estado, respuesta, cerrado_at')
        .eq('estado', estado).order('vence_at').limit(limite);
    if (error) throw new Error(error.message);
    return data || [];
}

let handle = null;
function start() {
    if (handle) return;
    if (!activo()) {
        console.log('[esperas] APAGADO (ESPERAS_ENABLED != true): nadie vigila si contestan a lo que se les pide.');
        return;
    }
    try {
        const ws = require('./whatsappService');
        ws.onMessage(alMensajeEntrante);
        if (typeof ws.onMensajePropio === 'function') ws.onMensajePropio(alMensajePropio);
    } catch (e) {
        console.warn('[esperas] sin sesión de WhatsApp:', e.message);
    }
    setTimeout(() => vuelta(), 2 * 60 * 1000);
    handle = setInterval(() => vuelta(), 5 * 60 * 1000);
    console.log(`[esperas] activo en modo ${modo().toUpperCase()}: recordatorio a las ${CFG.primerAvisoH} h, ${CFG.maxIntentos} intento(s), pausa de ${CFG.pausaHumanaH} h si escribe una persona.`);
}

module.exports = {
    start, abrir, cancelar, cerrarPorSubida, alMensajeEntrante, alMensajePropio, vuelta, resumen, listar,
    // para las pruebas
    textoRecordatorio, describirMensaje, esAcuse, esAutomatica, enHorario, siguienteHabil, venceTras, activo, modo, CFG, MOTIVOS,
};
