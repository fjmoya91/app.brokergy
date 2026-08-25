/**
 * whatsappLabels — las etiquetas de WhatsApp Business, desde la app.
 *
 * Las etiquetas son de WhatsApp, no del bot: se usan para organizar la cartera
 * (Pagado, EN CURSO, ACEPTADO, DISTRIBUIDOR…) y una de ellas, además, enciende
 * el asistente. Por eso viven en su propio módulo y no dentro de `botWhatsapp`.
 *
 * ─── POR QUÉ NO SE USA LA LIBRERÍA ───────────────────────────────────────────
 * `client.getLabels()`, `chat.getLabels()` y `chat.changeLabels()` pasan todas
 * por `getLabelModel()`, que hace `label.serialize()` y lee `label.hexColor`.
 * WhatsApp cambió ese modelo y la llamada revienta con un error minificado —
 * medido el 25/08/2026 contra una cuenta Business con 16 etiquetas: la
 * colección se lee perfectamente y lo que falla es serializarla.
 *
 * Aquí se leen las colecciones directamente. Es deuda a propósito: cuando
 * whatsapp-web.js publique el arreglo, esto se puede tirar.
 */

const whatsappService = require('./whatsappService');

// El plazo es del mismo Chrome que usa el bot, así que se hereda de su
// variable si no hay una propia: dos módulos que hablan con el mismo navegador
// no pueden rendirse en momentos distintos, y tener que configurar dos números
// para lo mismo se acaba olvidando.
const PLAZO_MS = Number(process.env.WA_LABELS_PLAZO_MS
    || process.env.BOT_WHATSAPP_PLAZO_WA_MS
    || 15_000);

/** Corta cualquier espera contra Puppeteer: ese Chrome lo usa toda la app. */
function conPlazo(promesa, ms, etiqueta) {
    let t;
    return Promise.race([
        promesa,
        new Promise((_, rechaza) => {
            t = setTimeout(() => {
                const e = new Error(`Timeout en ${etiqueta} (${ms / 1000}s)`);
                e.plazoAgotado = true;
                rechaza(e);
            }, ms);
        }),
    ]).finally(() => clearTimeout(t));
}

function cliente() {
    const c = whatsappService.getClient?.();
    if (!c) {
        const e = new Error('WhatsApp no está conectado. Conéctalo desde el panel y vuelve a intentarlo.');
        e.datoInvalido = true;
        throw e;
    }
    return c;
}

/** Error "de dato", para que las rutas devuelvan 400 y no 500. */
function deDato(mensaje) {
    const e = new Error(mensaje);
    e.datoInvalido = true;
    return e;
}

// ───────────────────────────────────────────────────────────────────────────
// LEER
// ───────────────────────────────────────────────────────────────────────────

/**
 * Todas las etiquetas de la cuenta: `[{ id, name, color }]`.
 *
 * `hexColor` es lo que WhatsApp pinta al lado del nombre. Se lee con cuidado
 * (dentro de su propio try) porque es justo la propiedad que rompió la librería:
 * si un día también falla, se prefiere una etiqueta sin color a no tener
 * etiquetas.
 */
async function listar() {
    const client = cliente();
    const labels = await conPlazo(client.pupPage.evaluate(() => {
        const C = window.require('WAWebCollections');
        if (!C || !C.Label) return null;
        // El color se busca por varios nombres: `hexColor` es el que usaba la
        // librería y ya devuelve null (medido el 25/08/2026), así que WhatsApp
        // lo ha movido. Se prueban los candidatos y, si ninguno vale, se
        // devuelve el ÍNDICE tal cual en vez de inventarse un color: una
        // etiqueta con el color equivocado se reconoce peor que una sin color.
        const hex = (v) => (typeof v === 'string' && /^#?[0-9a-f]{6,8}$/i.test(v)
            ? (v.startsWith('#') ? v : `#${v}`) : null);
        return C.Label.getModelsArray().map(l => {
            let color = null, indice = null;
            try { color = hex(l.hexColor) || hex(l.color) || null; } catch (_) { /* movido */ }
            try {
                const n = l.colorIndex ?? l.colorIdx;
                if (Number.isInteger(n)) indice = n;
            } catch (_) { /* movido */ }
            return { id: String(l.id), name: String(l.name || ''), color, indice };
        });
    }), PLAZO_MS, 'listar etiquetas');

    if (!labels) {
        throw deDato('Esta cuenta de WhatsApp no tiene etiquetas. Solo existen en WhatsApp Business.');
    }
    return labels;
}

/** Ids de las etiquetas que lleva un chat. */
async function deChat(chatId) {
    const client = cliente();
    const ids = await conPlazo(client.pupPage.evaluate((id) => {
        const C = window.require('WAWebCollections');
        const chat = C && C.Chat && C.Chat.get(id);
        if (!chat) return null;
        return (chat.labels || []).map(String);
    }, chatId), PLAZO_MS, 'etiquetas del chat');

    // Un chat que todavía no existe no lleva etiquetas: eso es una respuesta
    // válida, no un error. Antes se lanzaba y la ficha de cualquier cliente al
    // que aún no se le había escrito salía en rojo.
    return ids || [];
}

/**
 * El id con el que WhatsApp conoce a este número, preguntándoselo a WhatsApp.
 *
 * No se puede componer a mano por dos motivos: WhatsApp está migrando de
 * `34612345678@c.us` a identificadores opacos `@lid`, y un id inventado no da
 * error al etiquetarlo — simplemente no hace nada, que es peor que fallar.
 *
 * `queryWidExists` es la consulta que hace el propio WhatsApp cuando escribes un
 * número nuevo: devuelve su id real, o nada si ese número no tiene WhatsApp.
 */
async function widDeTelefono(telefono) {
    const client = cliente();
    const nueve = String(telefono || '').replace(/\D/g, '').slice(-9);
    if (nueve.length < 9) throw deDato('Ese número no parece un teléfono.');
    const completo = `34${nueve}@c.us`;

    // Si ya hay conversación, ese es el id bueno y nos ahorramos preguntar.
    const yaAbierto = await conPlazo(client.pupPage.evaluate((clasico) => {
        const C = window.require('WAWebCollections');
        if (!C || !C.Chat) return null;
        if (C.Chat.get(clasico)) return clasico;
        // Puede estar abierto bajo su `@lid`: se busca por el número dentro del id.
        const nueve = clasico.replace(/\D/g, '').slice(-9);
        const hit = C.Chat.getModelsArray().find(ch => {
            const u = ch.id && ch.id.user ? String(ch.id.user) : '';
            return u.slice(-9) === nueve;
        });
        return hit ? hit.id._serialized : null;
    }, completo), PLAZO_MS, 'buscar chat abierto');
    if (yaAbierto) return yaAbierto;

    // Y si no, se le pregunta a WhatsApp si ese número existe.
    const wid = await conPlazo(client.pupPage.evaluate(async (numero) => {
        const w = window.require('WAWebWidFactory').createWid(numero);
        const r = await window.require('WAWebQueryExistsJob').queryWidExists(w);
        return r && r.wid ? r.wid._serialized : null;
    }, completo), PLAZO_MS, 'comprobar el número en WhatsApp');

    if (!wid) {
        throw deDato('Ese número no tiene WhatsApp (o no se ha podido comprobar). '
            + 'Revisa que esté bien escrito.');
    }
    return wid;
}

/**
 * Devuelve el chat de ese id, CREÁNDOLO si todavía no existe.
 *
 * Una etiqueta se pone sobre un chat, y si nunca le has escrito a ese cliente no
 * hay chat que etiquetar. `findOrCreateLatestChat` es lo mismo que hace WhatsApp
 * cuando abres una conversación nueva desde la agenda: prepara el chat sin
 * enviar nada.
 *
 * ⚠️ Efecto visible: a partir de ese momento el chat aparece en la lista del
 * móvil, vacío. No se le manda nada al cliente ni se le notifica — es
 * exactamente lo que pasa si abres su conversación y no escribes.
 */
async function asegurarChat(chatId) {
    const client = cliente();
    const ok = await conPlazo(client.pupPage.evaluate(async (id) => {
        const C = window.require('WAWebCollections');
        if (C && C.Chat && C.Chat.get(id)) return 'existia';
        const wid = window.require('WAWebWidFactory').createWid(id);
        const r = await window.require('WAWebFindChatAction').findOrCreateLatestChat(wid);
        return r && r.chat ? 'creado' : null;
    }, chatId), PLAZO_MS, 'preparar el chat');

    if (!ok) throw deDato('No se ha podido preparar la conversación en WhatsApp con ese número.');
    return ok;   // 'existia' | 'creado'
}

/**
 * Compatibilidad: el id del chat de un teléfono, creándolo si hace falta.
 * Es lo que usan las rutas y el bot.
 */
async function chatIdDeTelefono(telefono, { crear = false } = {}) {
    const wid = await widDeTelefono(telefono);
    if (crear) await asegurarChat(wid);
    return wid;
}

// ───────────────────────────────────────────────────────────────────────────
// ESCRIBIR
// ───────────────────────────────────────────────────────────────────────────

/**
 * Deja el chat con EXACTAMENTE estas etiquetas.
 *
 * Así es como funciona la operación de WhatsApp por dentro (no hay un "añade
 * ésta"): se le pasan las que quedan y las que se van. Por eso quien llame
 * tiene que mandar la lista COMPLETA, no solo la que cambia — mandar una sola
 * le borraría al chat todas las demás, que son de otra persona y de otro
 * trabajo.
 */
async function poner(chatId, labelIds) {
    const client = cliente();
    const destino = [...new Set((labelIds || []).map(String))];

    // Se validan contra las que existen: un id inventado no da error, se ignora
    // en silencio, y quien lo pidió se queda pensando que la puso.
    const existentes = new Set((await listar()).map(l => l.id));
    const desconocidas = destino.filter(id => !existentes.has(id));
    if (desconocidas.length) {
        throw deDato(`Estas etiquetas ya no existen en WhatsApp: ${desconocidas.join(', ')}. Recarga la lista.`);
    }

    // Si la conversación no existe todavía, se prepara: etiquetar a un cliente
    // al que aún no has escrito es un caso normal —lo das de alta y lo clasificas
    // antes de hablar con él— y no tendría sentido obligar a mandarle un mensaje
    // para poder ponerle una etiqueta.
    await asegurarChat(chatId);

    await conPlazo(client.pupPage.evaluate(async (chatId, destino) => {
        const Conn = window.require('WAWebConnModel').Conn;
        if (['smba', 'smbi'].indexOf(Conn.platform) === -1) {
            throw new Error('Las etiquetas solo existen en WhatsApp Business.');
        }
        const C = window.require('WAWebCollections');
        const chat = C.Chat.get(chatId);
        if (!chat) throw new Error('Ese chat ya no existe en WhatsApp.');

        const actuales = (chat.labels || []).map(String);
        const acciones = [
            ...destino.map(id => ({ id, type: 'add' })),
            ...actuales.filter(id => !destino.includes(id)).map(id => ({ id, type: 'remove' })),
        ];
        if (!acciones.length) return true;
        await C.Label.addOrRemoveLabels(acciones, [chat]);
        return true;
    }, chatId, destino), PLAZO_MS, 'guardar etiquetas');

    return destino;
}

/** Añade o quita UNA etiqueta, conservando el resto. */
async function alternar(chatId, labelId, { quitar = false } = {}) {
    const actuales = await deChat(chatId);
    const id = String(labelId);
    const destino = quitar
        ? actuales.filter(x => x !== id)
        : [...new Set([...actuales, id])];
    await poner(chatId, destino);
    return destino;
}

module.exports = { listar, deChat, poner, alternar, chatIdDeTelefono, widDeTelefono, asegurarChat, _conPlazo: conPlazo };
