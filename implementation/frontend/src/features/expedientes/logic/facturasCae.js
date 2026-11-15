/**
 * facturasCae — qué parte de cada factura de obra COMPUTA para el expediente CAE.
 *
 * REGLA — una factura se registra ENTERA, pero al CAE solo cuenta lo subvencionable
 * (Fran, 03/11/2026). Los verificadores han empezado a requerir que, cuando la misma
 * factura lleva aerotermia y placas solares, se separe el coste subvencionable del
 * que no lo es: en un RES060 solo cuenta lo de la bomba de calor, y la fotovoltaica
 * queda fuera aunque esté en el total. Y una factura que es SOLO de placas se guarda
 * igual —sirve para estudiar a qué precio se están cobrando las placas y hacer venta
 * cruzada— pero no computa ni viaja al verificador.
 *
 * Por eso `importe_sin_iva` sigue siendo la BASE de la factura (lo que dice el papel)
 * y lo que va al Anexo, a la solicitud de verificación, al CE3X y a la
 * sobrefinanciación es `importeCae(f)`:
 *
 *   · `computa_cae === false`  → la factura entera fuera (0 €).
 *   · si no, la base MENOS las partidas del `desglose` marcadas `computa: false`.
 *
 * Se RESTA lo excluido en vez de sumar lo que computa porque el desglose del OCR no
 * siempre cuadra con la base (descuentos, una línea que no se leyó): así solo sale
 * de la inversión lo que alguien ha dicho expresamente que no cuenta, y el resto
 * —con su descuento— se queda donde estaba.
 *
 * Sin `desglose` (las facturas de antes del 03/11/2026) todo computa, igual que antes.
 *
 * Espejo CJS para el backend: `backend/utils/facturasCae.js` (lo comprueba
 * `scripts/test_facturas_cae.mjs`).
 */

const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};
const r2 = (n) => Math.round(n * 100) / 100;

/** Partidas que acompañan a cualquier actuación: nunca salen solas de la inversión. */
export const PARTIDAS_NEUTRAS = ['OBRA_CIVIL', 'MANO_OBRA', 'OTROS'];

export const ETIQUETA_PARTIDA = {
    AEROTERMIA: 'Aerotermia', ACS: 'ACS', EMISORES: 'Unidades terminales',
    VENTANAS: 'Ventanas', CUBIERTA: 'Cubierta', FACHADA: 'Fachada', SUELO: 'Suelo',
    FOTOVOLTAICA: 'Fotovoltaica', OBRA_CIVIL: 'Obra civil', MANO_OBRA: 'Mano de obra', OTROS: 'Otros',
};

/** ¿La factura cuenta para el CAE (aunque sea en parte)? */
export function facturaComputa(f) {
    return !!f && f.computa_cae !== false;
}

/** € de la factura que NO computan para el CAE (nunca más que la base). */
export function importeNoComputable(f) {
    if (!f) return 0;
    const base = num(f.importe_sin_iva);
    if (f.computa_cae === false) return base;
    const fuera = (Array.isArray(f.desglose) ? f.desglose : [])
        .filter(d => d && d.computa === false)
        .reduce((s, d) => s + num(d.importe), 0);
    return r2(Math.min(base, Math.max(0, fuera)));
}

/** € de la factura que computan para el CAE: la inversión que se declara. */
export function importeCae(f) {
    if (!f) return 0;
    return r2(Math.max(0, num(f.importe_sin_iva) - importeNoComputable(f)));
}

/** Inversión CAE del expediente: Σ importeCae de sus facturas. */
export function inversionCae(facturas) {
    return r2((Array.isArray(facturas) ? facturas : []).reduce((s, f) => s + importeCae(f), 0));
}

/** Las partidas que se han dejado fuera, para decirlo: «Fotovoltaica 3.200 €». */
export function partidasNoComputables(f) {
    if (!f) return [];
    return (Array.isArray(f.desglose) ? f.desglose : [])
        .filter(d => d && (f.computa_cae === false || d.computa === false) && num(d.importe) > 0)
        .map(d => ({ partida: d.partida, etiqueta: ETIQUETA_PARTIDA[d.partida] || d.partida, importe: r2(num(d.importe)) }));
}
