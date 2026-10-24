// ─── comun.js — tipos y estados de una incidencia, como los lee el certificador
// El estado lo decide el equipo en el admin; aquí, en palabras llanas. La misma
// tabla está en el backend (services/certapp/incidencias.js) para el email.

export const TIPOS = [
    { value: 'SUGERENCIA', label: 'Sugerencia' },
    { value: 'MEJORA', label: 'Mejora' },
    { value: 'ERROR', label: 'Algo no va' },
    { value: 'OTRO', label: 'Otro' },
];
export const tipoDe = (t) => TIPOS.find(x => x.value === t)?.label || 'Otro';

/** NUEVA → Recibida · VISTA → En revisión · HECHA → Resuelta · DESCARTADA → Cerrada. */
export const ESTADOS_INC = {
    NUEVA: { label: 'Recibida', chip: 'ca-chip-gris', espera: 'La hemos recibido. Te contestamos aquí y por email.', abierta: true },
    VISTA: { label: 'En revisión', chip: 'ca-chip-naranja', espera: 'La estamos mirando. Te contestamos aquí y por email.', abierta: true },
    HECHA: { label: 'Resuelta', chip: 'ca-chip-verde', espera: 'Resuelta. Si vuelve a pasar, cuéntanoslo otra vez.', abierta: false },
    DESCARTADA: { label: 'Cerrada', chip: 'ca-chip-gris', espera: 'La hemos cerrado.', abierta: false },
};
export const estadoInc = (e) => ESTADOS_INC[e] || ESTADOS_INC.NUEVA;
