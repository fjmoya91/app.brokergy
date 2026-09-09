// ─── A quién se le escribe de un partner, y de qué ────────────────────────────
//
// Un instalador no tiene UN interlocutor: tiene el COMERCIAL (con el que se
// habla de la obra, las fotos y la propuesta) y el TÉCNICO (el que firma la
// Memoria RITE y el CIFO). Hasta 2026-09-09 la app no distinguía: había un solo
// interruptor, `contacto_notificaciones_activas`, que decía "manda a los
// contactos alternativos o al representante" sin saber DE QUÉ se estaba
// escribiendo. Consecuencia medida en INSTOTERMA SL: la Memoria RITE, que firma
// Jesús (654547042), salía al 654547040 — el móvil de Carlos, el comercial.
//
// REGLA — el ROL del contacto decide, y el ASUNTO del envío pide un rol. Cada
// persona de `contactos_notificacion` lleva `roles: ['comercial'|'tecnico']`, y
// quien envía pide `partnerNotifyTargets(p, 'tecnico')`. Si lo decidiera cada
// pantalla, el parte diario y el popup mandarían la misma cosa a personas
// distintas — el mismo motivo por el que los textos son fuente única en
// `recordatorios.js`.
//
// REGLA — el REPRESENTANTE LEGAL no es un buzón. `nombre_responsable` es quien
// FIRMA (va impreso en el CIFO y en su recuadro de firma, ver `firmanteCifo`):
// es una identidad documental. Usarlo además como destinatario por defecto es lo
// que producía el fallo, porque **67 de los 70 instaladores no tienen
// `tlf_responsable`** y su nombre acababa pegado al teléfono de la empresa: la
// app enseñaba "Jesús · 654547040" y ese número era de Carlos. Cuando no hay
// contacto para el rol se cae al canal GENERAL de la empresa y se dice que lo es.
//
// REGLA — al canal general de una EMPRESA se saluda en genérico. Las plantillas
// de `recordatorios.js` ya hacen `nombreSaludo(destinatario) ? '¡Hola X!' :
// '¡Hola!'`, así que basta con no inventar un nombre: "¡Hola Jesús!" en un
// número que coge otra persona es peor que "¡Hola!". En un AUTÓNOMO sí se saluda
// por su nombre, porque ahí la persona SÍ es la empresa.

// `capitalizar` vive en recordatorios.js (no importa nada, no hay ciclo): es la
// misma con la que se escriben los nombres de cliente en los mensajes.
const { capitalizar } = require('./recordatorios');

// ─── Los DOS roles ────────────────────────────────────────────────────────────
// Son dos y no tres a propósito (decisión 2026-09-09): hoy al instalador no se
// le manda nada de administración. Añadir un tercero es una entrada más aquí y
// una casilla más en su ficha; nada más.
const ROLES = ['comercial', 'tecnico'];

const ROL_LABEL = {
    comercial: 'Comercial',
    tecnico: 'Técnico',
};

// Qué recibe cada rol. Es lo que se le enseña a quien rellena la ficha: sin esta
// frase, "comercial" y "técnico" son dos etiquetas que cada uno interpreta a su
// manera y el reparto vuelve a salir mal.
const ROL_RECIBE = {
    comercial: 'Propuestas, documentación de la obra y seguimiento',
    tecnico: 'Memoria RITE, certificado de instalación y CIFO para firmar',
};

/** Los `select` de la BD que necesita `partnerNotifyTargets` para decidir. */
const PARTNER_CONTACT_FIELDS = 'razon_social, acronimo, es_autonomo, nombre_responsable, apellidos_responsable, tlf, tlf_responsable, tlf_contacto, landing_telefono_contacto, email, email_responsable, email_contacto, nombre_contacto, contacto_notificaciones_activas, contactos_notificacion';

/**
 * Nombre con el que SALUDAR a un partner en un mensaje.
 *
 * El de la PERSONA DE CONTACTO, bien escrito ("Hola José Antonio"): en la ficha
 * los nombres se guardan en MAYÚSCULAS porque el formulario las fuerza, y
 * "¡Hola JOSÉ ANTONIO!" se lee como un grito. Solo el nombre de pila —
 * `nombre_responsable` ya es solo eso — porque con los apellidos deja de ser un
 * saludo y parece un encabezado de expediente.
 *
 * Si no consta la persona, el de la EMPRESA y TAL CUAL está escrito: una razón
 * social no se capitaliza ("AGUAHORRO, SL" → "Aguahorro, Sl" sería peor).
 *
 * OJO: esto sigue siendo lo correcto para el CERTIFICADOR (5 de 7 son autónomos
 * y se les saluda por su nombre). Para el canal general de una EMPRESA, quien
 * decide es `contactosDePartner`, que deja el nombre VACÍO a propósito.
 */
function saludoPartner(p) {
    const nombre = (p?.nombre_responsable || '').trim();
    if (nombre) return capitalizar(nombre);
    return p?.acronimo || p?.razon_social || '';
}

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
 * Roles declarados de un contacto, saneados contra `ROLES`.
 *
 * Un contacto SIN roles no es un contacto sin uso: es uno de los ~20 partners
 * que ya tenían contactos antes de que existiera el reparto, y de los que no
 * sabemos qué era cada uno. Adivinarlo sería peor que no repartir, así que se
 * comporta como hasta ahora — vale para TODO (ver `contactosPara`).
 */
function rolesDe(c) {
    const raw = Array.isArray(c?.roles) ? c.roles : [];
    return ROLES.filter(r => raw.includes(r));
}

/**
 * Normaliza el array de contactos para persistir: recorta strings, descarta
 * entradas sin ningún dato y limita campos a { nombre, tlf, email, cargo, roles }.
 */
function normalizeContactos(value) {
    return parseContactos(value)
        .map(c => ({
            nombre: (c?.nombre || '').toString().trim(),
            tlf:    (c?.tlf || '').toString().trim(),
            email:  (c?.email || '').toString().trim().toLowerCase(),
            cargo:  (c?.cargo || '').toString().trim(),
            roles:  rolesDe(c),
        }))
        .filter(c => c.nombre || c.tlf || c.email);
}

/**
 * El canal GENERAL de la empresa: su teléfono y su email de ficha.
 *
 * Es el respaldo cuando nadie cubre el rol, y **50 de los 70 instaladores no
 * tienen ni un contacto dado de alta**, así que no es un caso raro: es el más
 * frecuente. Por eso no puede bloquear un envío — pero sí tiene que decir lo que
 * es, para que nadie lo confunda con el móvil de una persona.
 *
 * En un AUTÓNOMO lleva su nombre (la persona ES la empresa). En una sociedad va
 * SIN nombre, y las plantillas saludan "¡Hola!".
 */
function canalGeneral(p) {
    const tlf = p?.tlf || p?.landing_telefono_contacto || '';
    const email = p?.email || '';
    if (!tlf && !email) return null;
    const esAutonomo = p?.es_autonomo === true || p?.es_autonomo === 'true';
    return {
        id: 'empresa',
        nombre: esAutonomo ? saludoPartner(p) : '',
        etiqueta: esAutonomo
            ? ([p?.nombre_responsable, p?.apellidos_responsable].filter(Boolean).join(' ').trim() || p?.razon_social || 'Profesional')
            : (p?.razon_social || p?.acronimo || 'La empresa'),
        cargo: esAutonomo ? 'Trabajador autónomo' : 'Teléfono y email generales de la empresa',
        tlf: tlf || '',
        email: email || '',
        roles: [],
        general: true,
        esAutonomo,
    };
}

/**
 * TODOS los destinatarios posibles de un partner, en el orden en que se ofrecen.
 *
 * Fuente única de la lista que ven el popup de envío (vía las rutas que la
 * sirven) y la resolución automática. Antes esta composición estaba copiada en
 * cuatro sitios —`docContacts.js`, `EnviarBorradorRiteModal`,
 * `resolveSolicitudContacto` y `seguimientoLote`— y cada copia elegía un
 * respaldo distinto.
 */
function contactosDePartner(p) {
    if (!p) return [];
    const out = normalizeContactos(p.contactos_notificacion)
        .filter(hasChannel)
        .map((c, i) => ({
            id: `c${i}`,
            nombre: c.nombre ? capitalizar(c.nombre) : '',
            etiqueta: c.nombre || 'Contacto',
            cargo: c.cargo || '',
            tlf: c.tlf || '',
            email: c.email || '',
            roles: c.roles,
            general: false,
        }));

    // Respaldo de las fichas antiguas que solo tienen el contacto plano y nunca
    // llegaron a migrarse al array.
    if (!out.length && (p.nombre_contacto || p.tlf_contacto || p.email_contacto)) {
        out.push({
            id: 'contacto',
            nombre: p.nombre_contacto ? capitalizar(p.nombre_contacto) : '',
            etiqueta: p.nombre_contacto || 'Contacto',
            cargo: '',
            tlf: p.tlf_contacto || '',
            email: p.email_contacto || '',
            roles: [],
            general: false,
        });
    }

    const general = canalGeneral(p);
    if (general) out.push(general);
    return out;
}

/**
 * Los contactos que cubren un rol. Sin `rol` → todos los que no son el general.
 *
 * Un contacto SIN roles marcados cuenta para CUALQUIERA: es una ficha anterior
 * al reparto y su comportamiento no puede cambiar por una migración que nadie ha
 * revisado. En cuanto alguien le marca un rol, deja de valer para el otro — que
 * es justo lo que se le está pidiendo al marcarlo.
 */
function contactosPara(p, rol) {
    const lista = contactosDePartner(p).filter(c => !c.general);
    if (!lista.length) return [];

    const conRol = rol ? lista.filter(c => c.roles.includes(rol)) : [];
    if (conRol.length) return conRol;

    // Nadie marcado para este asunto: mandan los contactos SIN repartir, pero solo
    // si la ficha tenía activado el desvío de siempre. Hay 3 instaladores con un
    // contacto dado de alta y el interruptor APAGADO a propósito (Esther, David,
    // Pedro): encenderlos de rebote sería empezar a escribir a tres personas que
    // hoy no reciben nada, y eso no lo ha pedido nadie. Un rol marcado sí manda
    // siempre — marcarlo ES la decisión.
    const desvioActivo = p?.contacto_notificaciones_activas === true
        || p?.contacto_notificaciones_activas === 'true'
        || p?.contacto_notificaciones_activas === 1;
    if (!desvioActivo) return [];
    return lista.filter(c => !c.roles.length);
}

/**
 * A quién avisar de un asunto de este partner: [{ nombre, email, tlf, general }].
 *
 * @param {object} p    fila de `prescriptores` (con PARTNER_CONTACT_FIELDS)
 * @param {string} rol  'comercial' | 'tecnico'. Sin rol → los contactos de siempre.
 *
 * Nunca devuelve [] salvo que la ficha no tenga NINGÚN dato de contacto.
 */
function partnerNotifyTargets(p, rol = null) {
    if (!p) return [];
    const elegidos = contactosPara(p, rol);
    if (elegidos.length) {
        return elegidos.map(c => ({
            nombre: c.nombre || null,
            email: c.email || null,
            tlf: c.tlf || null,
            general: false,
        }));
    }
    const general = canalGeneral(p);
    return general
        ? [{ nombre: general.nombre || null, email: general.email || null, tlf: general.tlf || null, general: true }]
        : [];
}

/**
 * El destinatario ÚNICO de un asunto, en la forma { nombre, tlf, email } que
 * esperan `resolveSolicitudContacto` y `seguimientoLote.resolverContacto`.
 *
 * Devuelve además `general` y `sinRol` para que la pantalla pueda DECIRLO: un
 * desvío silencioso al teléfono de la empresa es exactamente el fallo que esto
 * viene a arreglar.
 */
function partnerNotifyTarget(p, rol = null) {
    const [primero] = partnerNotifyTargets(p, rol);
    const cubierto = !!rol && contactosDePartner(p).some(c => !c.general && c.roles.includes(rol));
    return {
        nombre: primero?.nombre || null,
        tlf: primero?.tlf || null,
        email: primero?.email || null,
        general: !!primero?.general,
        // `sinRol` = nadie está marcado para este asunto en la ficha. No impide
        // enviar; es lo que el popup enseña en ámbar para poder arreglarlo.
        sinRol: !!rol && !cubierto,
    };
}

/**
 * Qué rol pide un DOCUMENTO del expediente.
 *
 * Existe para que el reparto no se decida a ojo en cada ruta: el CIFO y todo lo
 * del RITE los firma el técnico; lo demás (fotos, anexos del cliente, facturas)
 * es del comercial. Se consulta al rechazar un documento y al reclamar su firma.
 */
function rolDeDocumento(field) {
    const f = String(field || '').toLowerCase();
    if (f.includes('cifo') || f.includes('rite')) return 'tecnico';
    return 'comercial';
}

/** Resumen "quién recibe qué" de una ficha, para pintarlo sin recalcularlo. */
function repartoPartner(p) {
    return ROLES.reduce((acc, rol) => {
        const t = partnerNotifyTarget(p, rol);
        acc[rol] = {
            label: ROL_LABEL[rol],
            recibe: ROL_RECIBE[rol],
            nombre: t.nombre,
            tlf: t.tlf,
            email: t.email,
            general: t.general,
            sinRol: t.sinRol,
        };
        return acc;
    }, {});
}

module.exports = {
    ROLES, ROL_LABEL, ROL_RECIBE, PARTNER_CONTACT_FIELDS,
    normalizeContactos, parseContactos, rolesDe,
    contactosDePartner, contactosPara, canalGeneral,
    partnerNotifyTargets, partnerNotifyTarget, repartoPartner, rolDeDocumento,
    saludoPartner,
};
