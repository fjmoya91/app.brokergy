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

    return {
        contactos,
        contactoPrincipal,
        notifyEmail,
        notifyPhone,
        ccSugerencias,
        repNombre: [p.nombre_responsable, p.apellidos_responsable].filter(Boolean).join(' ') || undefined,
        repNif: p.nif_responsable || undefined,
    };
}
