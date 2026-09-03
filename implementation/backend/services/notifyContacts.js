// Resolución de contactos de notificación de un prescriptor (instalador/partner).
//
// Un prescriptor puede tener VARIOS interlocutores en `contactos_notificacion`
// (array JSONB de { nombre, tlf, email }). Para compatibilidad, el primero también
// vive espejado en las columnas planas nombre_contacto/tlf_contacto/email_contacto.
//
// - normalizeContactos(arr): limpia/recorta el array para guardarlo en BD.
// - partnerNotifyTargets(p): a quién hay que avisar dado un prescriptor, respetando
//   el toggle `contacto_notificaciones_activas` (si está activo → los contactos
//   alternativos; si no → la persona de contacto de la ficha, o la empresa si esa
//   persona no tiene tlf/email propios).

/** Parsea el array de contactos venga como array o como string JSON. */
function parseContactos(value) {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string' && value.trim()) {
        try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; }
        catch { return []; }
    }
    return [];
}

/** Una entrada es válida si tiene al menos teléfono o email. */
function hasChannel(c) {
    return !!((c?.tlf && String(c.tlf).trim()) || (c?.email && String(c.email).trim()));
}

/**
 * Normaliza el array de contactos para persistir: recorta strings, descarta
 * entradas sin ningún dato y limita campos a { nombre, tlf, email, cargo }.
 */
function normalizeContactos(value) {
    return parseContactos(value)
        .map(c => ({
            nombre: (c?.nombre || '').toString().trim(),
            tlf:    (c?.tlf || '').toString().trim(),
            email:  (c?.email || '').toString().trim().toLowerCase(),
            cargo:  (c?.cargo || '').toString().trim(),
        }))
        .filter(c => c.nombre || c.tlf || c.email);
}

/**
 * Devuelve la lista de destinatarios { nombre, email, tlf } a los que dirigir las
 * notificaciones de un prescriptor.
 *  · Si `contacto_notificaciones_activas` y hay contactos alternativos → esos
 *    contactos (los que tengan algún canal).
 *  · En caso contrario → el contacto principal de la empresa.
 * Nunca devuelve [] salvo que no exista ningún dato de contacto.
 */
function partnerNotifyTargets(p) {
    if (!p) return [];
    const redirectActive = p.contacto_notificaciones_activas === true
        || p.contacto_notificaciones_activas === 'true'
        || p.contacto_notificaciones_activas === 1;

    if (redirectActive) {
        const contactos = normalizeContactos(p.contactos_notificacion).filter(hasChannel);
        if (contactos.length) {
            return contactos.map(c => ({
                nombre: c.nombre || p.acronimo || p.razon_social || '',
                email:  c.email || null,
                tlf:    c.tlf || null,
            }));
        }
        // Fallback al contacto plano si el array está vacío pero hay columnas planas.
        if (p.nombre_contacto || p.tlf_contacto || p.email_contacto) {
            return [{
                nombre: p.nombre_contacto || p.acronimo || p.razon_social || '',
                email:  (p.email_contacto || p.email) || null,
                tlf:    (p.tlf_contacto || p.tlf) || null,
            }];
        }
    }

    // Contacto principal: se avisa al teléfono/email PROPIOS de la persona de
    // contacto si los tiene (tlf_responsable/email_responsable), y si no, a los
    // de la empresa. Es lo que significa "la persona de contacto es la misma de
    // las notificaciones": cambia POR DÓNDE se avisa.
    //
    // El NOMBRE con el que se saluda sigue siendo el de la EMPRESA a propósito.
    // Cambiarlo al de la persona alteraría el tono de todos los avisos
    // automáticos (medido: 42 de 78 partners pasarían de "Hola AGUAHORRO, SL" a
    // "Hola JOSÉ ANTONIO BARBA ALFARO", con el nombre completo y en mayúsculas),
    // y eso es una decisión de redacción aparte, no parte de la unificación.
    return [{
        nombre: p.acronimo || p.razon_social || '',
        email:  p.email_responsable || p.email || null,
        tlf:    p.tlf_responsable || p.tlf || null,
    }];
}

module.exports = { normalizeContactos, partnerNotifyTargets, parseContactos };
