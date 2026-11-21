// ─── Tarea — una cosa que le toca al instalador, y adónde le lleva ────────────
// El DESTINO lo decide el backend (`destinoDe` en routes/instaladorApp.js):
//   · { tipo: 'oportunidad', id } → la oportunidad, dentro de la app;
//   · { tipo: 'enlace', url }     → la página que ya existe (firmar el certificado,
//     subir el RITE, hacer la factura), en una pestaña aparte para no perder la app.
// El token de la factura viaja SOLO dentro del enlace de su propia obra.
import React from 'react';

export function propsDestino(destino, onAbrirOportunidad) {
    if (destino?.tipo === 'enlace' && destino.url) return { as: 'a', href: destino.url, target: '_blank', rel: 'noopener noreferrer' };
    if (destino?.tipo === 'oportunidad' && destino.id) return { as: 'button', type: 'button', onClick: () => onAbrirOportunidad(destino.id) };
    return null;
}

/** Botón o enlace según el destino. Sin destino no se pinta (no hay adónde ir). */
export function Destino({ destino, onAbrirOportunidad, className, children, ...resto }) {
    const p = propsDestino(destino, onAbrirOportunidad);
    if (!p) return null;
    const { as: Tag, ...attrs } = p;
    return <Tag className={className} {...attrs} {...resto}>{children}</Tag>;
}

/** El verbo del botón de cada tarea. */
export const VERBO = { propuesta: 'Enviarla', cifo: 'Firmar ahora', rite: 'Subirla', factura: 'Hacerla' };
