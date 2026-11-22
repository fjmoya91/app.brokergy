// ─── Tarea — una cosa que le toca al instalador, y adónde le lleva ────────────
// El DESTINO lo decide el backend (`destinoDe` en routes/instaladorApp.js):
//   · { tipo: 'oportunidad', id }          → la oportunidad, dentro de la app;
//   · { tipo: 'accion', accion, modo? }    → se hace DENTRO de la obra (fase 2):
//     firmar el certificado (`cifo`), subir el RITE (`rite`) o hacer la factura
//     (`factura`, en su plantilla o subiéndola). Ningún destino lleva un enlace con
//     token: la sesión basta.
import React from 'react';

export function propsDestino(destino, { onAbrirOportunidad, onAccion } = {}) {
    if (destino?.tipo === 'oportunidad' && destino.id && onAbrirOportunidad) return { as: 'button', type: 'button', onClick: () => onAbrirOportunidad(destino.id) };
    if (destino?.tipo === 'accion' && destino.accion && onAccion) return { as: 'button', type: 'button', onClick: () => onAccion(destino) };
    return null;
}

/** Botón según el destino. Sin destino (o sin quien lo abra) no se pinta: no hay adónde ir. */
export function Destino({ destino, onAbrirOportunidad, onAccion, className, children, ...resto }) {
    const p = propsDestino(destino, { onAbrirOportunidad, onAccion });
    if (!p) return null;
    const { as: Tag, ...attrs } = p;
    return <Tag className={className} {...attrs} {...resto}>{children}</Tag>;
}

/** El verbo del botón de cada tarea. */
export const VERBO = { propuesta: 'Pasársela', cifo: 'Firmar ahora', rite: 'Subirla', factura: 'Hacerla' };
