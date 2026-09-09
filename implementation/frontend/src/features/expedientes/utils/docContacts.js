// ─── Contactos a los que dirigir un documento del expediente ──────────────────
// Fuente ÚNICA de "a quién puedo escribir por este expediente": la usan el envío
// de anexos (EnviarAnexosModal), el del CIFO y la documentación RITE
// (CertificadoCifoModal / EnviarBorradorRiteModal) y el aviso de rechazo de un
// documento (DocumentacionModule).
//
// ESPEJO EXACTO del backend: services/notifyContacts.js. Los dos tienen que
// decidir igual — el popup enseña quién va a recibirlo y el backend es quien lo
// manda cuando nadie elige (parte diario, avisos automáticos).
//
// REGLA — el ROL manda: un instalador tiene COMERCIAL (obra, fotos, propuestas) y
// TÉCNICO (Memoria RITE, certificado, CIFO para firmar), y cada envío pide el
// suyo. Antes solo había una lista plana y el popup preseleccionaba "los de
// notificaciones": por eso la Memoria RITE de INSTOTERMA acabó en el móvil del
// comercial.
//
// REGLA — el REPRESENTANTE LEGAL no es un contacto. `nombre_responsable` es
// quien FIRMA el CIFO, una identidad documental. Ofrecerlo como destinatario es
// lo que producía el fallo: 67 de los 70 instaladores no tienen
// `tlf_responsable`, así que su NOMBRE salía pegado al TELÉFONO DE LA EMPRESA y
// la lista decía "Jesús · 654547040" cuando ese número era de Carlos. Ahora el
// respaldo es el canal general de la empresa, y se llama por su nombre.

/** Un teléfono sirve para WhatsApp si tiene al menos 9 dígitos. */
export const phoneValid = (ph) => (ph || '').replace(/[^0-9]/g, '').length >= 9;

/** Los dos roles, con lo que recibe cada uno (se enseña en la ficha del partner). */
export const ROLES = ['comercial', 'tecnico'];
export const ROL_LABEL = { comercial: 'Comercial', tecnico: 'Técnico' };
export const ROL_RECIBE = {
    comercial: 'Propuestas, documentación de la obra y seguimiento',
    tecnico: 'Memoria RITE, certificado de instalación y CIFO para firmar',
};

const esVerdadero = (v) => v === true || v === 'true' || v === 1;

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
        out.push({ id: 'cli', label: nombre || 'Cliente', saludo: cli.nombre_razon_social || '', sublabel: 'Titular', phone: tlf, email: cli.email || '', roles: [], general: false });
    }
    if (cli.persona_contacto_nombre && (cli.persona_contacto_tlf || cli.persona_contacto_email)) {
        out.push({
            id: 'cli_contacto', label: cli.persona_contacto_nombre, saludo: cli.persona_contacto_nombre,
            sublabel: 'Persona de contacto',
            phone: cli.persona_contacto_tlf || '', email: cli.persona_contacto_email || '',
            roles: [], general: false,
        });
    }
    return out;
}

/** Lee el array de contactos venga como array o como texto JSON. */
function parseContactos(raw) {
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string' && raw.trim()) {
        try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch { return []; }
    }
    return [];
}

const rolesDe = (c) => ROLES.filter(r => (Array.isArray(c?.roles) ? c.roles : []).includes(r));

/**
 * Contactos del instalador: las personas dadas de alta + el canal GENERAL de la
 * empresa como último recurso, dicho con esas palabras.
 */
export function instaladorContacts(pres = {}) {
    const out = [];
    parseContactos(pres.contactos_notificacion).forEach((c, i) => {
        if (c && (c.tlf || c.email)) {
            out.push({
                id: `c${i}`, label: c.nombre || 'Contacto', saludo: c.nombre || '',
                sublabel: c.cargo || 'Persona de contacto',
                phone: c.tlf || '', email: c.email || '',
                roles: rolesDe(c), general: false,
            });
        }
    });
    // Fichas antiguas con el contacto plano y sin migrar al array.
    if (!out.length && pres.nombre_contacto && (pres.tlf_contacto || pres.email_contacto)) {
        out.push({
            id: 'contacto', label: pres.nombre_contacto, saludo: pres.nombre_contacto,
            sublabel: 'Persona de contacto', phone: pres.tlf_contacto || '', email: pres.email_contacto || '',
            roles: [], general: false,
        });
    }

    // El canal general. En un AUTÓNOMO lleva su nombre (la persona ES la empresa);
    // en una sociedad va sin saludo, para no llamar por el nombre de una persona a
    // un teléfono que coge otra.
    const genPhone = pres.tlf || pres.telefono || pres.landing_telefono_contacto || '';
    const genEmail = pres.email || '';
    if (genPhone || genEmail) {
        const autonomo = esVerdadero(pres.es_autonomo);
        out.push({
            id: 'empresa',
            label: autonomo
                ? ([pres.nombre_responsable, pres.apellidos_responsable].filter(Boolean).join(' ') || pres.razon_social || 'Profesional')
                : (pres.razon_social || pres.acronimo || 'La empresa'),
            saludo: autonomo ? (pres.nombre_responsable || '') : '',
            sublabel: autonomo ? 'Trabajador autónomo' : 'Teléfono y email generales de la empresa',
            phone: genPhone, email: genEmail, roles: [], general: true,
        });
    }
    return out;
}

/**
 * Los contactos que cubren un rol. Espejo de `contactosPara` del backend.
 *
 * Un contacto SIN roles vale para todo, pero solo si la ficha tenía activado el
 * desvío de siempre: hay 3 instaladores con un contacto dado de alta y el
 * interruptor apagado a propósito, y encenderlos de rebote sería empezar a
 * escribir a alguien que hoy no recibe nada.
 */
export function contactosPara(pres = {}, rol = null) {
    const lista = instaladorContacts(pres).filter(c => !c.general);
    if (!lista.length) return [];
    const conRol = rol ? lista.filter(c => c.roles.includes(rol)) : [];
    if (conRol.length) return conRol;
    if (!esVerdadero(pres.contacto_notificaciones_activas)) return [];
    return lista.filter(c => !c.roles.length);
}

/**
 * Los ids que hay que traer marcados al abrir un envío.
 * @param {'cliente'|'instalador'} target
 * @param {'comercial'|'tecnico'} rol  qué asunto se está mandando
 */
export function defaultContactIds(target, cli, pres, rol = null) {
    if (target !== 'instalador') {
        const first = clienteContacts(cli)[0];
        return first ? [first.id] : [];
    }
    const elegidos = contactosPara(pres, rol);
    if (elegidos.length) return elegidos.map(c => c.id);
    const lista = instaladorContacts(pres);
    return lista.length ? [lista[lista.length - 1].id] : [];   // el canal general
}

/** Compatibilidad: un solo id (el rechazo de un documento escribe a uno). */
export function defaultContactId(target, cli, pres, rol = null) {
    return defaultContactIds(target, cli, pres, rol)[0] || null;
}

/**
 * Lo que hay que DECIRLE a quien envía sobre este destinatario, o null si no hay
 * nada que advertir. Un desvío silencioso al teléfono de la empresa es
 * exactamente el fallo que esto viene a arreglar: si no hay nadie marcado para el
 * asunto, se envía igual — pero se dice, y con el nombre del partner delante.
 */
export function avisoReparto(pres = {}, rol = null, contacto = null) {
    if (!rol || !contacto) return null;
    if (!contacto.general) return null;
    if (esVerdadero(pres.es_autonomo)) return null;   // la persona ES la empresa
    const quien = pres.acronimo || pres.razon_social || 'este instalador';
    return `En ${quien} no consta un contacto marcado como ${ROL_LABEL[rol].toUpperCase()}: esto va al teléfono y email generales de la empresa. Puedes cambiarlo aquí, o repartirlo en su ficha para las próximas veces.`;
}
