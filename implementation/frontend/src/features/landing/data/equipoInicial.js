/**
 * «Calcular una obra con este equipo» (app del instalador, fase 4).
 *
 * El Catálogo abre la Nueva simulación con un equipo ya elegido:
 *   equipoInicial = { id, marca, nombre, precio_sin_iva, origen: 'tu_precio' | 'tarifa' | null }
 *
 * Qué se hace con él, y nada más:
 *   1. El PRESUPUESTO de la aerotermia arranca con su precio (el del instalador o, si no
 *      lo tiene, la tarifa) + IVA al 21 %, porque el importe del embudo es el TOTAL CON
 *      IVA (regla de StepDocsObra). Es editable: entra como «importe a mano» en
 *      `docs_obra` (reforma) o como «Sí, hay un presupuesto» en el paso 8 (caldera).
 *   2. El MODELO queda elegido en la calculadora (`inputs.aerothermiaModel`) y, con el
 *      modelo del catálogo leído (`GET /api/aerotermia/:id`, el mismo que usa la
 *      calculadora), su SCOP, temporada y potencia salen de `scopsParaClima`: lo MISMO
 *      que haría el efecto de CalculatorForm al elegirlo a mano. Ese efecto no corre en
 *      una oportunidad ya guardada (`isPersistent`), por eso se aplica aquí, al crearla.
 *      Si el modelo no se puede leer, queda solo preseleccionado y el SCOP es el de
 *      siempre: no se inventa uno.
 * Ver docs/conocimiento/instalador-app/app-del-instalador-fase-4.md.
 */
import { scopsParaClima, climaScopForzado } from '../../calculator/logic/calculation.js';

export const IVA_EQUIPO_PCT = 21;

/** El precio sin IVA del equipo → el total con IVA que espera el embudo (euros redondos). */
export function totalConIvaEquipo(equipo) {
    const p = Number(equipo?.precio_sin_iva);
    if (!Number.isFinite(p) || p <= 0) return 0;
    return Math.round(p * (1 + IVA_EQUIPO_PCT / 100));
}

/** El mismo salto de temperatura que CalculatorForm según el emisor. */
export function temperaturaDeEmisor(emitterType) {
    if (emitterType === 'radiadores_convencionales') return 55;
    if (emitterType === 'radiadores_baja_temp') return 45;
    return 35;
}

const positivo = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);

/**
 * Aplica el equipo a los `calculatorInputs` (los MUTA y los devuelve).
 * `leerModelo(id)` devuelve la fila del catálogo; se inyecta para poder probarlo.
 */
export async function aplicarEquipoInicial(inputs, equipo, leerModelo) {
    if (!inputs || !equipo?.id) return inputs;
    inputs.aerothermiaModel = String(equipo.id);
    let modelo = null;
    try { modelo = leerModelo ? await leerModelo(equipo.id) : null; } catch { modelo = null; }
    if (!modelo || String(modelo.id) !== String(equipo.id)) return inputs;

    const s = scopsParaClima({
        modelo,
        modeloAcs: inputs.changeAcs ? null : modelo,
        zona: inputs.zona,
        temp: temperaturaDeEmisor(inputs.emitterType),
        clima: climaScopForzado(inputs),
    });
    if (positivo(s.scopHeating)) inputs.scopHeating = s.scopHeating;
    if (s.scopTemporada) inputs.scopTemporada = s.scopTemporada;
    if (positivo(s.scopAcs)) inputs.scopAcs = s.scopAcs;
    const potencia = positivo(modelo.potencia_calefaccion) || positivo(modelo.potencia_nominal_35);
    if (potencia) inputs.potenciaBomba = potencia;
    return inputs;
}

/** Documento «importe a mano» para `docs_obra`, con la MISMA forma que `docManual` de StepDocsObra. */
export function docDelEquipo(equipo) {
    const total = totalConIvaEquipo(equipo);
    if (!total) return null;
    return {
        id: `presupuesto-catalogo-${equipo.id}`,
        tipo: 'presupuesto',
        slot: 'DOC_PRESUPUESTO',
        doc: {
            tipo: 'presupuesto',
            numero_factura: '',
            fecha_factura: null,
            importe_total: total,
            importe_sin_iva: Math.round((total / (1 + IVA_EQUIPO_PCT / 100)) * 100) / 100,
            iva_pct: IVA_EQUIPO_PCT,
            iva_estimado: true,
            partidas: [],
            origen: 'manual',
        },
        equipos: [],
        files: [],
    };
}

/**
 * Documento para `docs_obra` desde un PRESUPUESTO hecho en la app del instalador (22/11/2026):
 * su número, su fecha y sus importes DE VERDAD (`iva_estimado: false`: el IVA lo puso él).
 * `presupuesto` = lo que arma `simulacionDesde` (logic/presupuestoApp.js).
 */
export function docDelPresupuesto(presupuesto) {
    const total = positivo(presupuesto?.total_con_iva);
    if (!total) return null;
    const pct = positivo(presupuesto.iva_pct) || IVA_EQUIPO_PCT;
    const base = positivo(presupuesto.base) || Math.round((total / (1 + pct / 100)) * 100) / 100;
    return {
        id: `presupuesto-app-${presupuesto.id}`,
        tipo: 'presupuesto',
        slot: 'DOC_PRESUPUESTO',
        doc: {
            tipo: 'presupuesto',
            numero_factura: presupuesto.numero || '',
            fecha_factura: presupuesto.fecha || null,
            importe_total: total,
            importe_sin_iva: base,
            iva_pct: pct,
            iva_estimado: false,
            partidas: [],
            origen: 'manual',
        },
        equipos: [],
        files: [],
    };
}

// Lo contestado para el bono en el PRESUPUESTO (asistente o grupo de WhatsApp, 23/11/2026) → las
// claves del embudo (useFunnelState), para dejarlo MARCADO: los pasos se ven igual y se cambian.
// Lo que el embudo no tiene igual (el GLP) se deja sin marcar; leña y pellet son su «biomasa».
const EMISOR_EMBUDO = { radiadores: 'radiadores_convencionales', suelo: 'suelo_radiante', fancoils: 'fancoils' };
const COMBUSTIBLE_EMBUDO = { gas: 'gas', gasoleo: 'gasoleo', electrica: 'electrica', carbon: 'carbon', lena: 'biomasa', pellets: 'biomasa', ninguna: 'no_tiene' };
/** `presupuesto` = lo que arma `simulacionDesde`. Pura. */
export function embudoDesdePresupuesto(presupuesto) {
    const s = presupuesto || {};
    const o = {};
    if (EMISOR_EMBUDO[s.emisor]) o.emisor_tipo = EMISOR_EMBUDO[s.emisor];
    if (s.acs === true || s.acs === false) o.incluir_acs = s.acs;
    if (COMBUSTIBLE_EMBUDO[s.combustible]) o.combustible_actual = COMBUSTIBLE_EMBUDO[s.combustible];
    return o;
}
