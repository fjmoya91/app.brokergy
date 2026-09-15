// ─── contactoCliente.js ──────────────────────────────────────────────────────
// El teléfono y el correo de un cliente, con su PERSONA DE CONTACTO de respaldo.
//
// Muchos titulares no dan los suyos: quien lleva la obra es un hijo, la pareja o
// el instalador, y es SU número el que está en la ficha —marcado «Notif. aquí»—
// y por el que de verdad se le localiza. Preguntando solo por `tlf` y `email`,
// una pantalla decía «no consta» de un cliente que tiene los dos datos escritos
// dos líneas más abajo (medido en 26RES060_187: los de JUAN ANTONIO).
//
// Vivía dentro de `cee-envolvente/logic/fichaCe3x.js`; se saca aquí en cuanto lo
// necesitó la segunda pantalla (el borrador para presentar el CEE), porque con
// dos copias el mismo cliente aparecería localizable en una y sin datos en la
// otra. Mismo motivo por el que salieron `DireccionEdit` y
// `parseCatastroAddressFull`.
//
// REGLA — el del TITULAR manda cuando existe, y cuando sale del contacto SE DICE
// con su nombre: no es lo mismo el correo de quien firma que el de quien lleva la
// obra, y esa distinción es justo lo que se está comprobando al mirarlo.

const limpiar = (v) => (v === null || v === undefined ? '' : String(v).trim());

/**
 * @param {object} cliente fila de `clientes`
 * @returns {{telefono:string|null, email:string|null,
 *            telefonoDeContacto:boolean, emailDeContacto:boolean,
 *            nombreContacto:string|null}}
 */
export function contactoCliente(cliente) {
    const c = cliente || {};
    const tlf = limpiar(c.tlf) || limpiar(c.telefono);
    const email = limpiar(c.email);
    const tlfC = limpiar(c.persona_contacto_tlf);
    const emailC = limpiar(c.persona_contacto_email);
    return {
        telefono: tlf || tlfC || null,
        email: email || emailC || null,
        telefonoDeContacto: !tlf && !!tlfC,
        emailDeContacto: !email && !!emailC,
        nombreContacto: limpiar(c.persona_contacto_nombre) || null,
    };
}

/** «la persona de contacto (JUAN ANTONIO) de la ficha del cliente». */
export function deQuienEs(nombreContacto) {
    const quien = limpiar(nombreContacto);
    return `persona de contacto${quien ? ` (${quien})` : ''} de la ficha del cliente`;
}
