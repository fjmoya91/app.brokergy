// ─── cuestionarioCee.js ──────────────────────────────────────────────────────
// Las preguntas de CLIMATIZACIÓN que el cliente contesta al aceptar la oferta de
// un CEE directo. Con ellas el técnico llega a la visita sabiendo qué va a
// encontrar, y nos ahorramos la ronda de preguntas por WhatsApp.
//
// Las opciones son las MISMAS del formulario de captación (/reforma: pasos de
// combustible y de agua caliente), con los mismos valores, para que un dato
// signifique lo mismo venga de donde venga. Se añaden solo las que un CEE
// suelto necesita y la captación no pregunta: aires acondicionados, termo además
// de la caldera, y el motivo "placas + deducción del IRPF".
//
// Módulo JS PURO: lo usan la página pública, la ficha del expediente y el
// backend (resumen para el aviso al equipo) por import() ESM.
// ─────────────────────────────────────────────────────────────────────────────

export const CALEFACCION = [
    { value: 'gas', label: 'Gas natural o butano', sub: 'Caldera de gas' },
    { value: 'gasoleo', label: 'Gasóleo', sub: 'Caldera con depósito de combustible' },
    { value: 'electrica', label: 'Electricidad', sub: 'Radiadores o acumuladores eléctricos' },
    { value: 'aerotermia', label: 'Aerotermia / bomba de calor', sub: 'Máquina exterior que calienta agua o aire' },
    { value: 'biomasa', label: 'Biomasa', sub: 'Pellets, leña o hueso de aceituna' },
    { value: 'carbon', label: 'Carbón', sub: 'Estufa o caldera de carbón' },
    { value: 'no_tiene', label: 'No tiene calefacción', sub: 'Ningún sistema de calefacción' },
];

export const ACS = [
    { value: 'misma_caldera', label: 'La misma caldera de la calefacción', sub: 'Una caldera para las dos cosas' },
    { value: 'termo', label: 'Termo eléctrico', sub: 'Depósito con resistencia' },
    { value: 'butano', label: 'Calentador de butano o gas', sub: 'Calentador instantáneo' },
    { value: 'aerotermia', label: 'Aerotermia / bomba de calor', sub: 'Con su depósito de agua caliente' },
    { value: 'solar', label: 'Placas solares térmicas', sub: 'Captadores para el agua caliente' },
    { value: 'no_tengo', label: 'No tengo / no lo sé', sub: '' },
];

export const PLACAS = [
    { value: 'si', label: 'Sí, ya tengo placas fotovoltaicas', sub: 'Autoconsumo eléctrico ya instalado' },
    { value: 'irpf', label: 'Estos certificados son para aplicar la deducción del IRPF por poner placas', sub: 'Voy a ponerlas o acabo de ponerlas' },
    { value: 'futuro', label: 'No, pero me interesa ponerlas', sub: 'Todavía no las tengo' },
    { value: 'no', label: 'No', sub: 'Sin placas fotovoltaicas' },
];

export const CUESTIONARIO_VACIO = {
    calefaccion: '', acs: '', termo_extra: null, aire_acondicionado: null, num_aires: '', placas: '',
};

const labelDe = (lista, v) => lista.find(o => o.value === v)?.label || null;

/**
 * Lo que falta por contestar (para bloquear el botón y decirlo). El termo extra
 * solo se pregunta si el agua la calienta la caldera; con otro aparato sería
 * preguntar dos veces lo mismo.
 */
export function faltanCuestionario(c = {}) {
    const f = [];
    if (!c.calefaccion) f.push('con qué se calienta la vivienda');
    if (!c.acs) f.push('con qué se calienta el agua');
    if (c.acs === 'misma_caldera' && c.termo_extra == null) f.push('si hay además un termo eléctrico');
    if (c.aire_acondicionado == null) f.push('si hay aire acondicionado');
    if (c.aire_acondicionado === true && !(Number(c.num_aires) > 0)) f.push('cuántos aires acondicionados hay');
    if (!c.placas) f.push('lo de las placas solares');
    return f;
}

/** Deja el cuestionario con solo valores conocidos (lo que llega es de un formulario público). */
export function sanearCuestionario(c = {}) {
    const en = (lista, v) => (lista.some(o => o.value === v) ? v : null);
    const n = Math.round(Number(String(c.num_aires ?? '').replace(',', '.')));
    const aa = c.aire_acondicionado === true || c.aire_acondicionado === 'true' ? true
        : (c.aire_acondicionado === false || c.aire_acondicionado === 'false' ? false : null);
    const acs = en(ACS, c.acs);
    return {
        calefaccion: en(CALEFACCION, c.calefaccion),
        acs,
        termo_extra: acs === 'misma_caldera'
            ? (c.termo_extra === true || c.termo_extra === 'true' ? true : (c.termo_extra === false || c.termo_extra === 'false' ? false : null))
            : null,
        aire_acondicionado: aa,
        num_aires: aa ? (Number.isFinite(n) && n > 0 && n < 100 ? n : null) : null,
        placas: en(PLACAS, c.placas),
    };
}

/** El cuestionario en líneas legibles (ficha del expediente, aviso al equipo, encargo). */
export function resumenCuestionario(c) {
    if (!c) return [];
    const l = [];
    const cal = labelDe(CALEFACCION, c.calefaccion);
    if (cal) l.push(['Calefacción', cal]);
    const acs = labelDe(ACS, c.acs);
    if (acs) l.push(['Agua caliente', acs + (c.termo_extra ? ' + termo eléctrico' : '')]);
    if (c.aire_acondicionado != null) {
        l.push(['Aire acondicionado', c.aire_acondicionado ? `Sí${c.num_aires ? ` · ${c.num_aires} ${c.num_aires === 1 ? 'aparato' : 'aparatos'}` : ''}` : 'No']);
    }
    const pl = labelDe(PLACAS, c.placas);
    if (pl) l.push(['Placas fotovoltaicas', c.placas === 'irpf' ? 'CEE para la deducción del IRPF por poner placas' : pl]);
    return l;
}
