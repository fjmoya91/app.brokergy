// Resolución de contactos de notificación de un prescriptor (instalador/partner).
//
// Un prescriptor puede tener VARIOS interlocutores en `contactos_notificacion`
// (array JSONB de { nombre, tlf, email }). Para compatibilidad, el primero también
// vive espejado en las columnas planas nombre_contacto/tlf_contacto/email_contacto.
//
// - normalizeContactos(arr): limpia/recorta el array para guardarlo en BD.
// - partnerNotifyTargets(p): a quién hay que avisar dado un prescriptor, respetando
//   el toggle `contacto_notificaciones_activas` (si está activo → los contactos
//   alternativos; si no → el contacto principal de la empresa).

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

    // Contacto principal de la empresa.
    return [{
        nombre: p.acronimo || p.razon_social || '',
        email:  p.email || null,
        tlf:    p.tlf || null,
    }];
}

module.exports = { normalizeContactos, partnerNotifyTargets, parseContactos };
