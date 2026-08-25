#!/usr/bin/env node
/**
 * Robustez del camino de ENTRADA del bot de WhatsApp, contra un cliente FALSO.
 *
 * Lo que se protege aquí no es el bot: es la SESIÓN DE WHATSAPP, que es la
 * misma con la que la app manda los partes, los encargos al certificador y las
 * entregas de CEE. Un mensaje entrante desemboca en llamadas a Puppeteer, y si
 * una se cuelga sin plazo, el cerrojo del barrido no se suelta y el bot deja de
 * contestar PARA SIEMPRE sin decir nada.
 *
 *   node scripts/test_bot_robustez.js
 *
 * Comprueba, sin tocar WhatsApp de verdad:
 *   · Chrome colgado → corta por plazo, no bloquea.
 *   · Chrome que revienta → no propaga la excepción.
 *   · 6 consultas simultáneas → UNA sola llamada a Puppeteer (de-dupe).
 *   · 5 mensajes a la vez → UNA fila en la bandeja (candado por chat), o el
 *     cliente recibiría cinco respuestas a la misma pregunta.
 *   · Las notificaciones de sistema de WhatsApp no despiertan al bot.
 *
 * Usa la BD real, pero solo con un chat de pruebas que borra al empezar y al
 * terminar.
 */
//  1) Chrome colgado no bloquea ni deja el bot mudo.
//  2) Mensajes simultáneos → UNA sola consulta de etiqueta (de-dupe).
//  3) Mensajes simultáneos → UNA sola fila en la bandeja (candado).
process.env.BOT_WHATSAPP_ENABLED = 'true';
process.env.BOT_WHATSAPP_PLAZO_WA_MS = '1500';   // plazo corto para la prueba
process.env.BOT_WHATSAPP_ETIQUETA = 'MOIA';
// La lista blanca se fija AQUÍ y no se hereda del `.env`: si el entorno trae
// una lista real (el chat con el que se esté probando de verdad), el chat
// ficticio de este test quedaría fuera y todo pasaría como "no etiquetado" sin
// que el fallo tenga nada que ver con lo que se está midiendo.
const CHAT = '34988888888@c.us';
process.env.BOT_WHATSAPP_CHATS_PRUEBA = CHAT;

require('dotenv').config();
const path = require('node:path').join(__dirname, '..') + '/';

// Se sustituye el servicio de WhatsApp por uno falso ANTES de cargar el bot.
const wsPath = require.resolve(path + 'services/whatsappService.js');
let modo = 'ok';
let llamadas = 0;
// El bot NO usa `getLabels()`/`getChatLabels()` de la librería: pasan por
// `serialize()`, que WhatsApp rompió (ver botWhatsapp). Lee las colecciones
// directamente con `pupPage.evaluate`, así que el doble tiene que ofrecer eso
// mismo — un mock del método viejo daría por buena una vía que ya no se usa.
const ETIQUETAS = [{ id: 'lbl-moia', name: 'MOIA' }, { id: 'lbl-otra', name: 'PAGADO' }];
const ETIQUETAS_POR_CHAT = { [CHAT]: ['lbl-moia'] };

// `evaluate(fn, ...args)` ejecuta `fn` dentro del navegador. Aquí se ejecuta en
// el propio proceso con un `window.require` de mentira, para que el código bajo
// prueba sea EXACTAMENTE el que corre en producción.
// Historial del chat que ve la recuperación. `t` va en segundos, como WhatsApp.
const ahora = () => Math.floor(Date.now() / 1000);
let HISTORIAL = [];

async function evaluateFalso(fn, ...args) {
    llamadas++;
    if (modo === 'colgado') return new Promise(() => {});      // nunca resuelve
    if (modo === 'error') throw new Error('Chrome se ha ido');
    await new Promise(r => setTimeout(r, 50));
    global.window = {
        require: (mod) => (mod !== 'WAWebCollections' ? null : {
            Label: {
                getModelsArray: () => ETIQUETAS.map(l => ({ id: l.id, name: l.name })),
                // Qué chats lleva cada etiqueta. Lo usa la recuperación de
                // arranque para saber a quién repasar.
                get: (id) => ({
                    labelItemCollection: {
                        getModelsArray: () => Object.entries(ETIQUETAS_POR_CHAT)
                            .filter(([, ids]) => ids.includes(String(id)))
                            .map(([chat]) => ({ parentType: 'Chat', parentId: chat })),
                    },
                }),
            },
            Chat: {
                get: (id) => ({
                    labels: ETIQUETAS_POR_CHAT[id] || [],
                    msgs: { getModelsArray: () => HISTORIAL },
                }),
                getModelsArray: () => [],
            },
        }),
    };
    try { return await fn(...args); } finally { delete global.window; }
}

const respaldo = (valor) => {
    if (modo === 'colgado') return new Promise(() => {});
    if (modo === 'error') throw new Error('Chrome se ha ido');
    return valor;
};

const fake = {
    getStatus: () => ({ ready: true }),
    isReady: () => true,
    onMessage: () => () => {},
    sendText: async () => ({ ok: true }),
    getClient: () => ({
        pupPage: { evaluate: evaluateFalso },
        // Los métodos de la librería siguen existiendo como respaldo. Si el bot
        // acabara llamándolos, el contador de `llamadas` lo delataría.
        // El respaldo tiene que sufrir la MISMA avería: es el mismo Chrome. Un
        // respaldo que responde bien mientras el navegador está colgado haría
        // pasar el test por un camino que en la realidad no existe.
        getLabels: async () => { llamadas++; return respaldo(ETIQUETAS); },
        getChatLabels: async () => { llamadas++; return respaldo([{ id: 'lbl-moia', name: 'MOIA' }]); },
        getChatsByLabelId: async () => { llamadas++; return respaldo([]); },
    }),
};

require.cache[wsPath] = { id: wsPath, filename: wsPath, loaded: true, exports: fake };

const bot = require(path + 'services/botWhatsapp.js');
const supabase = require(path + 'services/supabaseClient.js');
const ok = (c, t) => console.log(`${c ? '  OK  ' : ' FALLO'} · ${t}`);

(async () => {
    await supabase.from('whatsapp_bot_mensajes').delete().eq('chat_id', CHAT);

    // ── 1. Chrome COLGADO ───────────────────────────────────────────────────
    modo = 'colgado';
    let t0 = Date.now();
    const r = await bot.estaEtiquetado(CHAT);
    let ms = Date.now() - t0;
    ok(r === false && ms < 4000, `Chrome colgado: corta en ${ms} ms y devuelve false (no se cuelga)`);

    // ── 2. Chrome que revienta ──────────────────────────────────────────────
    modo = 'error';
    bot._limpiarCacheEtiquetas();
    const r2 = await bot.estaEtiquetado(CHAT);
    ok(r2 === false, 'Chrome que lanza excepción: devuelve false sin propagar');

    // ── 3. DE-DUPE: 6 consultas a la vez → 1 sola llamada ──────────────────
    modo = 'ok';
    bot._limpiarCacheEtiquetas();
    llamadas = 0;
    const res = await Promise.all(Array.from({ length: 6 }, () => bot.estaEtiquetado(CHAT)));
    // Con la caché vacía la primera consulta gasta DOS evaluates: uno para
    // resolver el id de nuestra etiqueta (se cachea de por vida del proceso) y
    // otro para leer las del chat. Lo que se mide aquí es el de-dupe: sin él
    // serían 12, una tanda por cada llamada simultánea.
    ok(llamadas <= 2, `6 consultas simultáneas → ${llamadas} llamada(s) a Puppeteer (sin de-dupe serían 12)`);
    ok(res.every(v => v === true), 'las 6 devuelven el mismo resultado');

    // ── 4. CACHÉ: otra tanda no vuelve a preguntar ─────────────────────────
    llamadas = 0;
    await bot.estaEtiquetado(CHAT);
    ok(llamadas === 0, `segunda tanda → ${llamadas} llamadas (cacheado)`);

    // ── 5. CANDADO: 5 mensajes a la vez → 1 sola fila ──────────────────────
    const msg = (txt, i) => ({ from: CHAT, type: 'chat', body: txt, id: { _serialized: `x${i}` }, _data: { notifyName: 'Prueba' } });
    await Promise.all(['Buenas tardes', '¿Qué documentación', 'hay que aportar?', 'Gracias', '👍']
        .map((t, i) => bot.onMensajeEntrante(msg(t, i))));
    const { data } = await supabase.from('whatsapp_bot_mensajes').select('id, mensajes_n, pregunta').eq('chat_id', CHAT);
    ok(data.length === 1, `5 mensajes simultáneos → ${data.length} fila(s) en la bandeja (debe ser 1)`);
    ok(data[0]?.mensajes_n === 5, `agrupados los 5 en la misma fila (mensajes_n=${data[0]?.mensajes_n})`);

    // ── 6. Tipos de sistema de WhatsApp ────────────────────────────────────
    const antes = data.length;
    await bot.onMensajeEntrante({ from: CHAT, type: 'e2e_notification', body: '' });
    await bot.onMensajeEntrante({ from: CHAT, type: 'notification_template', body: '' });
    const { data: d2 } = await supabase.from('whatsapp_bot_mensajes').select('id, mensajes_n').eq('chat_id', CHAT);
    ok(d2.length === antes && d2[0].mensajes_n === 5, 'las notificaciones de sistema no entran en la bandeja');

    // ── 7. RECUPERAR lo que llegó con el backend parado ────────────────────
    // Es lo que corre en cada deploy: si se equivoca, o pierde mensajes de
    // clientes o despierta conversaciones viejas de golpe.
    await supabase.from('whatsapp_bot_mensajes').delete().eq('chat_id', CHAT);
    bot._limpiarCacheEtiquetas();
    bot._resetRecuperacion();

    // a) El cliente escribió y NADIE contestó despues -> se recupera.
    HISTORIAL = [
        { id: { fromMe: true }, body: 'Buenas, te paso el enlace', t: ahora() - 3600 },
        { id: { fromMe: false }, body: 'Que documentacion hace falta?', t: ahora() - 120 },
    ];
    await bot._recuperarPerdidos();
    let res7 = await supabase.from('whatsapp_bot_mensajes').select('id, pregunta').eq('chat_id', CHAT);
    ok(res7.data.length === 1 && res7.data[0].pregunta.includes('documentacion'),
        `mensaje sin atender -> recuperado (${res7.data.length} fila)`);

    // b) Ya esta en la bandeja -> no se duplica.
    bot._resetRecuperacion();
    await bot._recuperarPerdidos();
    res7 = await supabase.from('whatsapp_bot_mensajes').select('id').eq('chat_id', CHAT);
    ok(res7.data.length === 1, `segunda pasada -> sigue habiendo ${res7.data.length} fila (no duplica)`);

    // c) Si YA se contesto (hay un mensaje nuestro despues), no se toca.
    await supabase.from('whatsapp_bot_mensajes').delete().eq('chat_id', CHAT);
    bot._resetRecuperacion();
    HISTORIAL = [
        { id: { fromMe: false }, body: 'Que documentacion hace falta?', t: ahora() - 300 },
        { id: { fromMe: true }, body: 'Te lo explico: hace falta...', t: ahora() - 60 },
    ];
    await bot._recuperarPerdidos();
    res7 = await supabase.from('whatsapp_bot_mensajes').select('id').eq('chat_id', CHAT);
    ok(res7.data.length === 0, 'ya contestado por alguien -> NO se recupera');

    // d) Demasiado viejo -> no se despierta la conversacion.
    bot._resetRecuperacion();
    HISTORIAL = [{ id: { fromMe: false }, body: 'hola de hace dos dias', t: ahora() - 48 * 3600 }];
    await bot._recuperarPerdidos();
    res7 = await supabase.from('whatsapp_bot_mensajes').select('id').eq('chat_id', CHAT);
    ok(res7.data.length === 0, 'mensaje de hace 48 h -> NO se recupera (fuera de ventana)');

    await supabase.from('whatsapp_bot_mensajes').delete().eq('chat_id', CHAT);
    console.log('\nbandeja limpiada.');
    process.exit(0);
})().catch(e => { console.error(' FALLO · el test se rompió:', e.message); process.exit(1); });
