// ============================================================================
// fichaTer173.js — Valores de la Ficha TER173 (hibridación en paralelo, terciario).
//
// A diferencia de sus hermanas RES060/RES080/RES093/TER100, esta ficha NO tiene
// maqueta HTML: nace después de que los impresos del Ministerio se publicaran como
// PDF de formulario, así que el documento es SIEMPRE el oficial relleno
// (formularioOficialService + logic/fichasFormulario.js). No hay borradores en
// Drive del formato antiguo, que es lo único que justificaba conservar la réplica
// en HTML de las otras cuatro.
//
// REGLA — este fichero NO calcula: los números salen de logic/terciario.js, la
// MISMA derivación que alimentan el CIFO y el panel económico. Aquí solo se
// formatean y se decide qué sale como "no aplica".
//
// Imports CON extensión: además de Vite, este módulo se carga por import()
// dinámico desde Node (comparación de impresos y pruebas). Node ESM no resuelve
// rutas sin extensión.
// ============================================================================
import { deriveTerciarioVars, TER173_VIDA_UTIL, TER173_FP } from './terciario.js';
import { calcCifo } from './calcCifo.js';

const NO_APLICA = 'no aplica';

const dec2 = (v) => (Number(v) || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ent = (v) => Math.round(Number(v) || 0).toLocaleString('es-ES');
const coma2 = (v) => (Number(v) || 0).toFixed(2).replace('.', ',');

const formatFecha = (isoDate) => {
    if (!isoDate) return '—';
    const d = new Date(isoDate + 'T00:00:00');
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }).replace('.', '');
};

/**
 * Valores ya formateados de la ficha. Los consumen el impreso oficial
 * (logic/fichasFormulario.js) y la cabecera del modal, que así enseña exactamente
 * las cifras que se van a imprimir.
 */
export function deriveFichaTer173(expediente) {
    const exp = expediente || {};
    const doc = exp.documentacion || {};
    const ter = deriveTerciarioVars(exp);

    // Mismos fallbacks de fecha que el CIFO, para que ambos documentos coincidan.
    const fechas = calcCifo(doc);

    return {
        ter,
        // El factor de ponderación se imprime en las TRES tablas de resultado y en el
        // impreso son tres casillas distintas: sale de un solo sitio.
        fp: String(TER173_FP),
        eta: coma2(ter.boilerEff),
        // Fuera del alcance → "no aplica" (no 0): la ficha debe dejar ver el alcance.
        // Con el valor a la vista, el verificador podría multiplicarlo y obtener un
        // ahorro que no forma parte de la actuación.
        dcal: ter.alcance.calefaccion ? coma2(ter.dcalRaw) : NO_APLICA,
        s: ter.alcance.calefaccion ? coma2(ter.sRaw) : NO_APLICA,
        dacs: ter.alcance.acs ? dec2(ter.dacsRaw) : NO_APLICA,
        dcap: ter.alcance.piscina ? dec2(ter.dcap) : NO_APLICA,
        scopCal: ter.alcance.calefaccion ? (ter.scopCal ? coma2(ter.scopCal) : '—') : NO_APLICA,
        scopAcs: ter.alcance.acs ? (ter.scopAcs ? coma2(ter.scopAcs) : '—') : NO_APLICA,
        scopPool: ter.alcance.piscina ? (ter.scopPool ? coma2(ter.scopPool) : '—') : NO_APLICA,
        aeCal: ter.alcance.calefaccion ? ent(ter.savings.aeCal) : NO_APLICA,
        aeAcs: ter.alcance.acs ? ent(ter.savings.aeAcs) : NO_APLICA,
        aeCap: ter.alcance.piscina ? ent(ter.savings.aeCap) : NO_APLICA,
        // AE_TOTAL = (AE_C + AE_ACS + AE_CAP) · C_b — apartado 4 de la ficha.
        aeTotal: ent(ter.savingsKwh),
        // ⚠️ El impreso oficial de la TER173 NO tiene casilla para el C_b: su tabla
        // de resultado son AE_C · AE_ACS · AE_CAP · AE_TOTAL · D_i. Así que el total
        // impreso NO es la suma de los tres sumandos impresos, y quien la revise
        // necesita saber por qué. Estas dos cifras existen para poder explicarlo —
        // en el modal, y sobre todo en el apartado del C_b del CIFO, que es el
        // documento donde el cálculo se desarrolla paso a paso.
        cb: coma2(ter.cb * 100) + '%',
        cbTantoPorUno: (Number(ter.cb) || 0).toFixed(3).replace('.', ','),
        cbIncompleto: ter.cbIncompleto,
        aeTotalSinCb: ent(ter.savingsSinCb),
        vidaUtil: TER173_VIDA_UTIL,
        fechaInicio: formatFecha(fechas.inicio || doc.fecha_inicio_cifo || doc.fecha_visita_cee_inicial),
        fechaFin: formatFecha(fechas.fin || doc.fecha_fin_cifo || doc.fecha_firma_cee_final),
    };
}
