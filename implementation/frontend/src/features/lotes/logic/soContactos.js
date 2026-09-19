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
const limpio = (s) => String(s || '').trim();
// El NIF se compara sin guiones ni espacios y en mayúsculas: en la ficha está
// "06239730Z" y en los documentos se ha escrito "06239730-Z".
export const nifNorm = (s) => String(s || '').toUpperCase().replace(/[^0-9A-Z]/g, '');

// ─── Representantes legales que pueden FIRMAR por la empresa ─────────────────
// REGLA — una empresa puede tener VARIOS apoderados, y cuál firma cada documento
// lo decide una persona. El PRINCIPAL sigue saliendo de las columnas de siempre
// (`representante_distinto` → `representante_*`, y si no `nombre_responsable`),
// que es lo que lee el resto de la app; los demás viven en `representantes`, una
// lista de APODERADOS ADICIONALES. No se duplica el principal ahí: dos sitios
// contestando a "quién firma" es una contradicción esperando a ocurrir.

export function parseRepresentantes(raw) {
    let arr = raw;
    if (typeof raw === 'string') {
        try { arr = JSON.parse(raw || '[]'); } catch { arr = []; }
    }
    return (Array.isArray(arr) ? arr : [])
        .map(r => ({
            nombre: limpio(r?.nombre),
            apellidos: limpio(r?.apellidos),
            nif: limpio(r?.nif),
            cargo: limpio(r?.cargo),
        }))
        .filter(r => r.nombre || r.apellidos || r.nif);
}

// Lista de firmantes de un S.O., el principal primero. Cada uno lleva un `id`
// estable (`principal`, `r0`, `r1`…) con el que viaja la elección.
export function representantesSo(so) {
    const p = so || {};
    const principal = p.representante_distinto
        ? { nombre: [p.representante_nombre, p.representante_apellidos].filter(Boolean).join(' ').trim(), nif: limpio(p.representante_dni) }
        : { nombre: [p.nombre_responsable, p.apellidos_responsable].filter(Boolean).join(' ').trim(), nif: limpio(p.nif_responsable) };

    const out = [];
    if (principal.nombre || principal.nif) {
        out.push({ id: 'principal', nombre: principal.nombre, nif: principal.nif, cargo: '', principal: true });
    }
    parseRepresentantes(p.representantes).forEach((r, i) => {
        const nombre = [r.nombre, r.apellidos].filter(Boolean).join(' ').trim();
        // Un apoderado que repita el NIF del principal es el mismo: no se ofrece dos veces.
        if (out.some(x => x.nif && r.nif && nifNorm(x.nif) === nifNorm(r.nif))) return;
        out.push({ id: `r${i}`, nombre, nif: r.nif, cargo: r.cargo, principal: false });
    });
    return out;
}

// El firmante elegido, o el principal si la elección ya no existe (se borró de la
// ficha). Nunca devuelve `undefined` habiendo alguno declarado: un documento sin
// representante sale con la casilla vacía.
export function representanteElegido(so, id) {
    const lista = representantesSo(so);
    return lista.find(r => r.id === id) || lista[0] || null;
}

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
    const representantes = representantesSo(p);

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
        // Firmantes declarados, el principal primero. `repNombre`/`repNif` son los
        // de ese principal — y salen de `representantesSo`, que es también lo que
        // el backend comprueba cuando el documento vuelve firmado: si aquí se
        // resolviera de otra forma, el documento diría un nombre y la comprobación
        // esperaría otro.
        representantes,
        repNombre: representantes[0]?.nombre || undefined,
        repNif: representantes[0]?.nif || undefined,
    };
}
