// ─────────────────────────────────────────────────────────────────────────────
// Flags de rol centralizados.
//
// Roles internos de Brokergy:
//   · ADMIN       → lo ve y lo hace todo.
//   · TRABAJADOR  → opera como ADMIN PERO: no ve el margen/beneficio de Brokergy
//                   y no puede borrar (oportunidades, expedientes, partners…).
//   · CERTIFICADOR→ solo sus expedientes, sin cifras económicas.
//
// Capacidades ORTOGONALES:
//   · isStaff       → equipo interno operativo (ADMIN o TRABAJADOR).
//   · canSeeMargin  → ver lo que gana Brokergy (SOLO ADMIN).
//   · canDelete     → borrar registros (SOLO ADMIN).
//
// El backend es la barrera real (capa los payloads y devuelve 403); estos flags
// son para la UI (mostrar/ocultar y avisar).
// ─────────────────────────────────────────────────────────────────────────────
export function getRoleFlags(user) {
    const rol = (user?.rol || '').toUpperCase();
    const id = user?.id_rol ? Number(user.id_rol) : null;

    const isAdmin = rol === 'ADMIN' || id === 1;
    const isTrabajador = rol === 'TRABAJADOR' || id === 8;
    const isCertificador = rol === 'CERTIFICADOR' || id === 4;
    const isStaff = isAdmin || isTrabajador;

    return {
        isAdmin,
        isTrabajador,
        isCertificador,
        isStaff,
        // Partner = cualquier no-interno (instalador/distribuidor/cliente…).
        isPartner: !isStaff && !isCertificador,
        // Único que ve el margen/beneficio de Brokergy.
        canSeeMargin: isAdmin,
        // Único que puede borrar registros.
        canDelete: isAdmin,
    };
}

// Mensaje estándar cuando un no-admin intenta borrar.
export const DELETE_FORBIDDEN_MSG = 'Solo un administrador puede borrar. Por favor, contacta con el administrador.';
