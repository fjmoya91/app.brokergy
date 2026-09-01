// ─────────────────────────────────────────────────────────────────────────────
// Contactos del SUJETO OBLIGADO para los envíos del lote (Anexo I, requerimiento,
// oferta de verificación). Antes esta resolución estaba copiada en cada modal;
// aquí es fuente única.
//
// Criterio de CC (decisión usuario 2026-08-03):
//   · En copia va SIEMPRE Brokergy (CC_BROKERGY) — queremos copia de todo lo que
//     sale al S.O.
//   · Los contactos del S.O. NO se copian por defecto: se ofrecen como SUGERENCIA
//     para añadirlos de un clic en el propio modal (chips "+ email").
//   · Todo email se normaliza a minúscula: en la ficha del prescriptor hay datos
//     antiguos en MAYÚSCULAS y no queremos que salgan así en el correo.
// ─────────────────────────────────────────────────────────────────────────────

// Copia interna de Brokergy en todos los envíos al S.O.
export const CC_BROKERGY = 'franciscojavier.moya.s2e2@gmail.com';

const lower = (s) => String(s || '').trim().toLowerCase();

// `contactos_notificacion` puede venir como array o como texto JSON.
export function parseContactosNotificacion(raw) {
    let arr = raw;
    if (typeof raw === 'string') {
        try { arr = JSON.parse(raw || '[]'); } catch { arr = []; }
    }
    return (Array.isArray(arr) ? arr : []).filter(c => c && (c.email || c.tlf));
}

// Resuelve destinatario, teléfono, representante y sugerencias de CC de un S.O.
// `so` = lote.sujeto_obligado (fila enriquecida de `prescriptores`).
export function deriveSoEnvio(so) {
    const p = so || {};
    const contactos = parseContactosNotificacion(p.contactos_notificacion);
    const contactoPrincipal = contactos[0] || null;
    const email = lower(p.email);
    const notifyEmail = lower(p.notify_email) || lower(contactoPrincipal?.email) || email || '';
    const notifyPhone = contactoPrincipal?.tlf || p.tlf || '';

    // Sugerencias: email de la empresa + resto de contactos, sin el destinatario
    // ni la copia interna (que ya va puesta), en minúscula y sin repetidos.
    const ccSugerencias = [...new Set(
        [email, ...contactos.map(c => lower(c.email))]
            .filter(Boolean)
            .filter(e => e !== notifyEmail && e !== CC_BROKERGY)
    )];

    // A quién se le puede escribir: los contactos con email, con su nombre. El
    // correo lo lee una PERSONA, y el saludo tiene que ser el suyo — el
    // representante legal (`repNombre`) es quien FIRMA, que casi nunca es quien
    // recibe el correo del día a día.
    const destinatarios = contactos
        .filter(c => c.email)
        .map(c => ({ nombre: (c.nombre || '').trim(), cargo: c.cargo || '', email: lower(c.email) }));
    // El email de la empresa también vale como destinatario, pero sin nombre.
    if (email && !destinatarios.some(d => d.email === email)) {
        destinatarios.push({ nombre: '', cargo: '', email });
    }
    const nombreDe = (mail) => destinatarios.find(d => d.email === lower(mail))?.nombre || '';

    return {
        contactos,
        contactoPrincipal,
        notifyEmail,
        notifyPhone,
        ccSugerencias,
        destinatarios,
        // Nombre de pila del contacto al que se escribe, presentable: en la ficha
        // los nombres están en MAYÚSCULAS y "Buenos días JESÚS," parece un grito.
        nombreDe,
        nombrePilaDe: (mail) => {
            const n = (nombreDe(mail) || '').trim().split(/\s+/)[0] || '';
            return n ? n.charAt(0).toUpperCase() + n.slice(1).toLowerCase() : '';
        },
        repNombre: [p.nombre_responsable, p.apellidos_responsable].filter(Boolean).join(' ') || undefined,
        repNif: p.nif_responsable || undefined,
    };
}
