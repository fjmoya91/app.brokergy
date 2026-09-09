/**
 * whatsappContactos — la AGENDA de WhatsApp, desde la app.
 *
 * Hermano pequeño de `whatsappLabels`: aquél clasifica el chat, éste le pone
 * nombre. Van separados porque son dos cosas distintas para el usuario —una
 * etiqueta se quita y se pone todos los días; un contacto guardado se
 * sincroniza al TELÉFONO y ahí se queda— y porque la regla que los gobierna es
 * distinta (ver `guardarSiFalta`).
 *
 * Igual que en `whatsappLabels`, se habla con las colecciones de WhatsApp Web
 * por `pupPage.evaluate`. Aquí no hay alternativa en la librería: whatsapp-web.js
 * expone `saveOrEditAddressbookContact`, pero solo sabe ESCRIBIR — no hay forma
 * de preguntar antes si el contacto ya está guardado, que es justo lo que hace
 * falta para no renombrarle a nadie lo que tiene puesto.
 *
 * ⚠️ REGLA 39: por aquí NO puede colarse `getChatById`/`getChats`/`sendSeen`.
 * En WhatsApp Web 2.3000.x dejan la sesión enviando sin ACK hasta que se cae, y
 * de esa sesión depende TODO lo automático de la app.
 */

const whatsappService = require('./whatsappService');
const { _conPlazo: conPlazo } = require('./whatsappLabels');

const PLAZO_MS = Number(process.env.WA_CONTACTOS_PLAZO_MS
    || process.env.BOT_WHATSAPP_PLAZO_WA_MS
    || 15_000);

function cliente() {
    const c = whatsappService.getClient?.();
    if (!c) {
        const e = new Error('WhatsApp no está conectado. Conéctalo desde el panel y vuelve a intentarlo.');
        e.datoInvalido = true;
        throw e;
    }
    return c;
}

/**
 * Qué sabe WhatsApp de ese contacto: `{ enAgenda, nombre, pushname }`.
 *
 * `enAgenda` es lo que decide si se le puede tocar el nombre. Se leen las dos
 * banderas que usa WhatsApp (`isAddressBookContact` en las versiones nuevas,
 * `isMyContact` en las viejas) porque han ido cambiando de nombre, y basta con
 * que una diga que sí.
 */
async function datos(chatId) {
    const client = cliente();
    return conPlazo(client.pupPage.evaluate((id) => {
        const C = window.require('WAWebCollections');
        const c = C && C.Contact && C.Contact.get(id);
        if (!c) return { enAgenda: false, nombre: null, pushname: null };
        return {
            enAgenda: !!(c.isAddressBookContact || c.isMyContact),
            nombre: c.name || null,        // el que TÚ le pusiste en la agenda
            pushname: c.pushname || null,  // el que él se ha puesto en su WhatsApp
        };
    }, chatId), PLAZO_MS, 'leer el contacto');
}

/**
 * Guarda el contacto en la agenda, sincronizándolo al teléfono.
 *
 * `syncToAddressbook: true` es lo que hace que aparezca también en el móvil y no
 * solo en WhatsApp Web; sin eso, el nombre se quedaría en este dispositivo y
 * quien mire el chat desde el teléfono seguiría viendo un número.
 */
async function guardar(telefonoE164, nombre, apellido = '') {
    const client = cliente();
    const numero = String(telefonoE164 || '').replace(/\D/g, '');
    if (numero.length < 10) {
        const e = new Error(`Teléfono no válido para la agenda: ${telefonoE164}`);
        e.datoInvalido = true;
        throw e;
    }
    await conPlazo(client.pupPage.evaluate(async (num, nom, ape) => {
        await window.require('WAWebSaveContactAction').saveContactAction({
            firstName: nom,
            lastName: ape || '',
            phoneNumber: num,
            prevPhoneNumber: num,
            syncToAddressbook: true,
            username: undefined,
        });
    }, numero, nombre, apellido), PLAZO_MS, 'guardar el contacto');
    return true;
}

/**
 * Guarda el contacto SOLO si no lo tienes ya guardado.
 *
 * REGLA — un nombre que ya está en la agenda NO se toca, nunca. Lo puso una
 * persona, muchas veces con el apodo por el que de verdad la conoce ("Paco el
 * de las calderas"), y machacarlo con la razón social de la BBDD es hacerle
 * perder la referencia en su propio teléfono. Aquí solo se rellena el hueco de
 * quien entra como número suelto.
 *
 * Devuelve 'guardado' | 'ya_estaba'.
 */
async function guardarSiFalta(chatId, telefonoE164, nombre, apellido = '') {
    const info = await datos(chatId);
    if (info.enAgenda || info.nombre) return { accion: 'ya_estaba', nombre: info.nombre };
    await guardar(telefonoE164, nombre, apellido);
    return { accion: 'guardado', nombre: [nombre, apellido].filter(Boolean).join(' ') };
}

module.exports = { datos, guardar, guardarSiFalta };
