// ─── Contactos a los que dirigir un documento del expediente ──────────────────
// Fuente ÚNICA de "a quién puedo escribir por este expediente": la usan el envío
// de anexos (EnviarAnexosModal) y el aviso de rechazo de un documento
// (DocumentacionModule). Antes vivía suelta dentro del modal de envío, y el modal
// de rechazo solo sabía elegir entre CLIENTE e INSTALADOR — sin poder dirigirse a
// la persona de contacto, que es con quien se habla en la mayoría de instaladores.
//
// Espejo en el backend: services/notifyContacts.js (partnerNotifyTargets), que es
// quien decide el destinatario por defecto cuando aquí no se manda ninguno.

/** Un teléfono sirve para WhatsApp si tiene al menos 9 dígitos. */
export const phoneValid = (ph) => (ph || '').replace(/[^0-9]/g, '').length >= 9;

/** Contactos del cliente final: titular + persona de contacto si la hay. */
// `label` es cómo se LISTA el contacto (nombre y apellidos, para reconocerlo) y
// `saludo` cómo se le LLAMA en el mensaje: solo el nombre. "Hola José Antonio
// Gallego Ortega" es un encabezado de expediente, no un saludo — y el nombre sale
// de su propio campo, así que no hay que adivinar dónde acaba.
export function clienteContacts(cli = {}) {
    const out = [];
    const nombre = [cli.nombre_razon_social, cli.apellidos].filter(Boolean).join(' ').trim();
    const tlf = cli.tlf || cli.telefono || '';
    if (tlf || cli.email) {
        out.push({ id: 'cli', label: nombre || 'Cliente', saludo: cli.nombre_razon_social || '', sublabel: 'Titular', phone: tlf, email: cli.email || '' });
    }
    if (cli.persona_contacto_nombre && (cli.persona_contacto_tlf || cli.persona_contacto_email)) {
        out.push({
            id: 'cli_contacto', label: cli.persona_contacto_nombre, saludo: cli.persona_contacto_nombre,
            sublabel: 'Persona de contacto',
            phone: cli.persona_contacto_tlf || '', email: cli.persona_contacto_email || '',
        });
    }
    return out;
}

/** Contactos del instalador: persona de contacto (o el autónomo) + notificaciones. */
export function instaladorContacts(pres = {}) {
    const out = [];
    const repName = [pres.nombre_responsable, pres.apellidos_responsable].filter(Boolean).join(' ') || pres.razon_social || 'Instalador';
    // La persona de contacto tiene su PROPIO tlf/email (tlf_responsable/
    // email_responsable); si no los tiene, se cae al de la empresa.
    const repPhone = pres.tlf_responsable || pres.tlf || pres.telefono || '';
    const repEmail = pres.email_responsable || pres.email || '';
    if (repPhone || repEmail) {
        out.push({
            id: 'rep', label: repName, saludo: pres.nombre_responsable || '',
            sublabel: pres.es_autonomo ? 'Autónomo' : 'Persona de contacto',
            phone: repPhone, email: repEmail,
        });
    }
    const arr = Array.isArray(pres.contactos_notificacion) ? pres.contactos_notificacion : [];
    if (arr.length) {
        arr.forEach((c, i) => {
            if (c && (c.tlf || c.email)) {
                out.push({ id: `c${i}`, label: c.nombre || 'Contacto', saludo: c.nombre || '', sublabel: 'Persona de contacto', phone: c.tlf || '', email: c.email || '' });
            }
        });
    } else if (pres.nombre_contacto && (pres.tlf_contacto || pres.email_contacto)) {
        out.push({ id: 'contacto', label: pres.nombre_contacto, saludo: pres.nombre_contacto, sublabel: 'Persona de contacto', phone: pres.tlf_contacto || '', email: pres.email_contacto || '' });
    }
    return out;
}

/**
 * Contacto marcado por defecto: si el instalador tiene activado el desvío de
 * notificaciones, se escribe a sus personas de contacto, no al representante.
 */
export function defaultContactId(target, cli, pres) {
    if (target === 'instalador') {
        const list = instaladorContacts(pres);
        const alt = list.filter(c => c.id !== 'rep');
        if (pres?.contacto_notificaciones_activas && alt.length) return alt[0].id;
        return list[0]?.id || null;
    }
    return clienteContacts(cli)[0]?.id || null;
}
