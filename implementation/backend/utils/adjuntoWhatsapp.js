'use strict';

/**
 * Los datos del adjunto, SIN los campos internos del modelo de WhatsApp Web.
 *
 * `whatsapp-web.js` compone el mensaje de un adjunto esparciendo el MODELO
 * `MediaData` que devuelve `processMediaData`:
 *
 *     { id: newMsgKey, from, to, ..., ...mediaOptions, ...mediaOptions.toJSON() }
 *
 * Los modelos de WhatsApp Web guardan cada propiedad en un `__x_<nombre>`, y
 * uno de ellos es **`__x_id`, que vale 1**: al caer en el objeto del mensaje
 * pisa la clave que lo identifica, y al construirlo `getValidatedSender` recibe
 * `undefined` y revienta ("Data passed to getter must include an id property
 * (it's how we memoize) but got undefined", o su gemelo "must be a valid model
 * or a plain object"). Eso dejaba SIN SALIR todos los adjuntos; el texto sí
 * sale, porque un mensaje de texto no pasa por aquí.
 *
 * Se quitan las claves internas (`__*`) y NADA MÁS: los valores buenos siguen
 * llegando por `toJSON()`, que la propia librería esparce a continuación.
 * Medido contra el objeto de antes (17/09/2026): se caen 32 claves, TODAS
 * internas, y ni un valor cambia — clientUrl, deprecatedMms3Url, directPath,
 * mediaKey, encFilehash, filehash, size, mimetype, filename y type se
 * conservan idénticos.
 *
 * ⚠️ Esta función se ejecuta DENTRO de la página de WhatsApp Web (se inyecta
 * por su código fuente), así que no puede usar nada de fuera de ella.
 */
function soloDatosDelAdjunto(modelo) {
    if (!modelo || typeof modelo !== 'object') return modelo;
    var plano = {};
    var claves = Object.keys(modelo);
    for (var i = 0; i < claves.length; i++) {
        if (claves[i].indexOf('__') !== 0) plano[claves[i]] = modelo[claves[i]];
    }
    if (typeof modelo.toJSON === 'function') Object.assign(plano, modelo.toJSON());
    return plano;
}

module.exports = { soloDatosDelAdjunto };
