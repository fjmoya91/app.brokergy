// El TIMBRE del canal de trabajo con Fran (etiqueta MOIA).
//
// Cuando Fran escribe desde su móvil personal (ASISTENTE_WHATSAPP_TEL) al WhatsApp de la empresa,
// este módulo avisa al contenedor «asistente» (ASISTENTE_URL, en la red interna de docker) para
// que lea el chat y se ponga a trabajar. NO lee ni procesa nada: solo toca el timbre. El trabajo
// (transcribir, lanzar a Claude, contestar) lo hace scripts/asistente_vigia.js en ese contenedor.
//
// - Cuelga del listener de entrada de whatsappService, que comparte TODA la app: nunca lanza, y
//   cada mensaje cuesta una comparación de cadenas. El @lid de Fran se resuelve UNA vez (una
//   llamada a la sesión) y se cachea; no se resuelve el de cada mensaje que entre de cualquiera.
// - Sin ASISTENTE_URL o sin ASISTENTE_WHATSAPP_TEL no se engancha (en LOCAL, apagado).
// - Si el contenedor no responde, el vigilante lo recoge igual en su repaso periódico.
// - De los DEMÁS chats 1:1 solo se pasa el chatId (/entrante) para el modo proactivo: ni se lee el
//   chat ni se resuelve su teléfono aquí; eso lo hace el contenedor cuando el chat lleva rato callado.
const whatsappService = require('./whatsappService');

const TEL = String(process.env.ASISTENTE_WHATSAPP_TEL || '').replace(/\D/g, '');
const URL = String(process.env.ASISTENTE_URL || '').replace(/\/+$/, '');
// Si está, el canal es ese GRUPO («BROKERGY - CHAT») y solo cuentan los mensajes de Fran dentro de él;
// su chat 1:1 con la empresa vuelve a ser un chat normal.
const GRUPO = String(process.env.ASISTENTE_WHATSAPP_GRUPO || '').trim();
const PLAZO_MS = 10_000;

let lidDeFran = null;          // «71159068520593@lid», cuando se ha podido resolver
let resolviendo = null;

function conPlazo(promesa, ms) {
    let t;
    return Promise.race([promesa, new Promise((_, rej) => { t = setTimeout(() => rej(new Error('plazo')), ms); })])
        .finally(() => clearTimeout(t));
}

async function resolverLid() {
    if (lidDeFran || resolviendo) return resolviendo;
    const client = whatsappService.getClient?.();
    if (!client?.getContactLidAndPhone) return null;
    resolviendo = conPlazo(client.getContactLidAndPhone([`${TEL}@c.us`]), PLAZO_MS)
        .then(r => {
            const lid = r?.[0]?.lid;
            if (lid) lidDeFran = String(lid._serialized || lid);
            return lidDeFran;
        })
        .catch(() => null)                      // un fallo pasajero no se cachea: se reintenta luego
        .finally(() => { resolviendo = null; });
    return resolviendo;
}

async function esDeFran(chatId) {
    if (chatId === `${TEL}@c.us`) return true;
    if (!chatId.endsWith('@lid')) return false;
    if (!lidDeFran) await resolverLid();
    return !!lidDeFran && chatId === lidDeFran;
}

function tocarTimbre(ruta, cuerpo = null) {
    fetch(`${URL}${ruta}`, {
        method: 'POST',
        headers: { 'x-internal-key': process.env.INTERNAL_API_KEY || '', ...(cuerpo ? { 'Content-Type': 'application/json' } : {}) },
        body: cuerpo ? JSON.stringify(cuerpo) : undefined,
        signal: AbortSignal.timeout(3000),
    }).catch(e => console.warn(`[asistente] el contenedor no ha cogido ${ruta}:`, e.message));
}

async function alMensaje(msg) {
    try {
        if (!msg || msg.fromMe || msg.isStatus) return;
        const chatId = String(msg.from || '');
        // El grupo del asistente: solo lo que escribe FRAN toca el timbre (con su id, que el contenedor
        // apunta para reconocerle al leer el grupo). Lo de otro miembro no hace nada.
        if (GRUPO && chatId === GRUPO) {
            const autor = String(msg.author || '');
            if (autor && await esDeFran(autor)) tocarTimbre('/aviso', { autor });
            return;
        }
        if (!chatId.endsWith('@c.us') && !chatId.endsWith('@lid')) return;   // otros grupos y difusiones fuera
        // Fran → a trabajar (salvo que el canal sea el grupo: entonces su 1:1 es un chat más). Cualquier
        // otro chat → solo su id, para el MODO PROACTIVO (el contenedor espera a que ese chat calle y
        // decide allí si es una petición de un instalador).
        if (await esDeFran(chatId)) { if (!GRUPO) tocarTimbre('/aviso'); return; }
        tocarTimbre('/entrante', { chatId });
    } catch (e) {
        console.warn('[asistente] aviso de mensaje entrante:', e.message);
    }
}

/**
 * Una TAREA que pide la APP, no Fran por WhatsApp: hoy, «Así es como está» en la
 * pizarra del plano de la envolvente (rehacer el CEE sobre lo dibujado a mano).
 * El vigilante la atiende como si Fran se la hubiera escrito, y le contesta por
 * el mismo chat.
 *
 * Al contrario que el timbre, ESPERA la respuesta: quien pulsó el botón tiene
 * que saber si Claude se ha enterado. Nunca lanza.
 *
 * @returns {Promise<{ ok: boolean, motivo?: string }>}
 */
async function pedirTarea({ texto, clave = null, acuse = null } = {}) {
    if (!URL) return { ok: false, motivo: 'El asistente no está conectado en este servidor (falta ASISTENTE_URL).' };
    if (!String(texto || '').trim()) return { ok: false, motivo: 'Tarea vacía.' };
    try {
        const r = await fetch(`${URL}/tarea`, {
            method: 'POST',
            headers: { 'x-internal-key': process.env.INTERNAL_API_KEY || '', 'Content-Type': 'application/json' },
            body: JSON.stringify({ texto: String(texto).slice(0, 6000), clave, acuse }),
            signal: AbortSignal.timeout(5000),
        });
        if (r.status === 202 || r.ok) return { ok: true };
        return { ok: false, motivo: `El asistente ha respondido ${r.status}.` };
    } catch (e) {
        return { ok: false, motivo: `El asistente no responde (${e.message}).` };
    }
}

function start() {
    if (!URL || !TEL) {
        console.log('[asistente] Canal con Fran desactivado (sin ASISTENTE_URL / ASISTENTE_WHATSAPP_TEL).');
        return;
    }
    whatsappService.onMessage(alMensaje);
    console.log(`[asistente] Canal con Fran activo: avisa a ${URL} cuando escribe ${TEL}${GRUPO ? ` en el grupo ${GRUPO}` : ""}.`);
}

module.exports = { start, pedirTarea };
