'use strict';

/**
 * El mensaje que ACABAMOS de enviar, buscado entre los del chat, cuando
 * `client.sendMessage()` no lo devuelve.
 *
 * `whatsapp-web.js` (1.34.7) termina el envío con
 * `Msg.get(newMsgKey._serialized)`: si el mensaje ya no está bajo esa clave,
 * `sendMessage()` resuelve `undefined` aunque haya salido. Sin id,
 * `confirmarEntrega()` no tenía qué mirar y se saltaba el ACK sin decir nada:
 * la cola marcaba SENT y `sendMedia` devolvía `{ ok: true, id: null }`.
 * Medido el 05/11/2026 con los dos primeros WhatsApp a dos clientes de Pedro
 * Cruz (chats nuevos): texto y vídeo en el chat, y ningún ACK comprobado.
 *
 * Se elige el más reciente que cumple TODO esto:
 *   · lo hemos mandado nosotros (`fromMe`);
 *   · va a ese chat, por su número o por su `@lid` (`usuarios`);
 *   · es de este envío (`t` >= `desde`, en segundos);
 *   · es lo que se mandó: un texto con ESE cuerpo, o un adjunto (con ese
 *     pie, si lo llevaba).
 * Si no hay ninguno, `null`: no se adivina (un falso negativo duplica envíos).
 *
 * ⚠️ Se ejecuta DENTRO de la página de WhatsApp Web (se inyecta por su código
 * fuente), así que no puede usar nada de fuera de ella.
 *
 * @param {Array<{id:string, fromMe:boolean, remoteUser:string, t:number,
 *                type:string, body?:string, caption?:string}>} mensajes
 * @param {{usuarios:string[], desde:number, tipo:'texto'|'adjunto',
 *          texto?:string, pie?:string}} criterio
 * @returns {string|null} el id serializado del mensaje
 */
function elegirEnviado(mensajes, criterio) {
    if (!Array.isArray(mensajes) || !criterio) return null;
    var usuarios = criterio.usuarios || [];
    var limpio = function (s) { return String(s == null ? '' : s).trim(); };
    var mejor = null;
    for (var i = 0; i < mensajes.length; i++) {
        var m = mensajes[i];
        if (!m || !m.id || !m.fromMe) continue;
        if (usuarios.indexOf(m.remoteUser) === -1) continue;
        if (!(m.t >= criterio.desde)) continue;
        if (criterio.tipo === 'texto') {
            if (m.type !== 'chat' || limpio(m.body) !== limpio(criterio.texto)) continue;
        } else {
            if (m.type === 'chat') continue;
            if (limpio(criterio.pie) && limpio(m.caption) !== limpio(criterio.pie)) continue;
        }
        if (!mejor || m.t >= mejor.t) mejor = m;
    }
    return mejor ? mejor.id : null;
}

module.exports = { elegirEnviado };
