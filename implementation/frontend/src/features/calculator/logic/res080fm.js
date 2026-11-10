/**
 * ============================================================================
 * RES080_FM — rehabilitación profunda con FACTOR MULTIPLICADOR sobre la parte de
 * la bomba de calor (Resolución DGPLACE de 3/11/2026, BOE-A-2026-23367, págs.
 * 20–22). Es la vía FM del RES080, con el mismo patrón que la RES060_FM
 * (`calculateRes060FM` en res060fc.js): una fuente, nunca sin sus avisos.
 * ============================================================================
 *
 *   AE = (EF_i − EF_f) · (f_M·EF_simBC + EF_simRest) / (EF_simBC + EF_simRest)
 *
 *   EF_i       consumo de energía final del edificio ANTES (CEE previo, registrado)
 *   EF_f       consumo DESPUÉS (CEE posterior, registrado)
 *   EF_simBC   simulado con SOLO la sustitución de la caldera por la bomba
 *   EF_simRest simulado con todo lo demás, manteniendo la caldera
 *   f_M        2 unifamiliar · 2,5 piso con sistema individual · 3 centralizado
 *
 * REGLA — EF_i y EF_f son los del RES080 VIGENTE (`calculateRes080` y sus caminos:
 * energía final declarada, por uso, por emisiones…). La vía FM no recalcula el
 * ahorro: lo multiplica por un cociente. Así las dos vías salen del mismo CEE y la
 * comparativa es limpia.
 *
 * REGLA — la fórmula se calcula LITERAL (FAQ del factor multiplicador, consulta 4):
 * pondera con CONSUMOS, así que cuanto más ahorra la bomba menos pesa f_M. Es lo
 * que aplicará el verificador; la ponderada por AHORROS sale solo como referencia
 * (`caeAhorros`) y nunca como cifra.
 *
 * REGLA — el cociente solo depende de la RAZÓN EF_simBC / EF_simRest. Sin los dos
 * CEE simulados (docs. 10 y 11; no hace falta registrarlos) se ESTIMAN desde los
 * CEE previo y posterior, uso por uso, y la cifra lleva «≈» (`estimada`):
 *   - calefacción y refrigeración: la bomba sola = la energía del posterior con la
 *     demanda del previo (E_f · D_i / D_f); el resto solo = la del previo con la
 *     demanda del posterior (E_i · D_f / D_i);
 *   - ACS: no depende de la envolvente: la bomba sola = la del posterior; el resto
 *     solo = la del previo.
 * Es lineal en la demanda con el rendimiento de cada generador; lo que CE3X haga
 * distinto (pérdidas, sistemas por defecto) lo dirán los simulados de verdad.
 *
 * REGLA — requisito (apartado 2): la obra actúa A LA VEZ sobre la envolvente y
 * sustituye la caldera por bomba. Se comprueba con los CEE: la demanda de
 * calefacción baja y la calefacción pasa de un vector no eléctrico a la
 * electricidad. Lo que no se puede saber se dice (aviso), no se da por bueno.
 *
 * REGLA — combustible SÓLIDO (carbón o biomasa): siempre por la vigente (Fran,
 * 7/11/2026: «si es carbon, biomasa, es decir solido, siempre a la normal»), como
 * en la RES060_FM.
 *
 * Detalle y porqué: docs/conocimiento/calculo/factor-multiplicador-la-resolucion-publicada-res060-fm.md
 */
import { energiaVectorSinFv } from './calculation.js';
import {
    FM_NORMATIVA, FM_INICIO_ACTUACIONES, FM_FIN_FACTURAS, FM_FIN_FACTURAS_CCPP,
    FM_PRESENTACION_HASTA, FM_PRESENTACION_HASTA_CCPP, FM_CUPO_KWH, tipologiaFM,
} from './res060fc.js';

export const FICHA_RES080_FM = 'RES080_FM';

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const pos = (v) => num(v) > 0;
const fechaEs = (iso) => String(iso || '').slice(0, 10).split('-').reverse().join('/');
const n0 = (v) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(Math.round(v || 0));
const n1 = (v) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(v || 0);
const n3 = (v) => new Intl.NumberFormat('es-ES', { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(v || 0);
const hoyIso = () => new Date().toISOString().slice(0, 10);
const SOLIDO = /biomasa|pellet|pelet|carb[oó]n|le[ñn]a|s[oó]lido|astilla|hueso/i;

/** Energía final por USO de un CEE parseado (kWh/m²·año), con el eléctrico en bruto. */
export function usosDeCee(cee) {
    const vecs = Object.values(cee?.energiaFinalVectores || {});
    if (!vecs.length) return null;
    const u = { cal: 0, acs: 0, ref: 0, calElec: 0, calOtros: 0, calSolido: 0 };
    for (const v of vecs) {
        const cal = num(v.calefaccion);
        u.cal += cal;
        u.acs += num(v.acs);
        u.ref += num(v.refrigeracion);
        if (v.esElectrico) u.calElec += cal;
        else {
            u.calOtros += cal;
            if (SOLIDO.test(`${v.nombre || ''} ${v.vectorXml || ''}`)) u.calSolido += cal;
        }
    }
    return u;
}

/** Consumo de energía final del edificio de un CEE parseado (kWh/año), como el RES080 vigente. */
export function efDeCee(cee, superficie = null) {
    const vecs = Object.values(cee?.energiaFinalVectores || {});
    if (!vecs.length) return null;
    const m2 = vecs.reduce((a, v) => a + energiaVectorSinFv(v), 0);
    const S = num(superficie) || num(cee?.superficieHabitable);
    if (!(m2 > 0) || !(S > 0)) return null;
    return m2 * S;
}

// Uno de los dos simulados: el CEE (manda), o los kWh tecleados.
function simulado(cee, kwh, S) {
    const deCee = cee ? efDeCee(cee, num(cee?.superficieHabitable) || S) : null;
    if (deCee > 0) return { ef: deCee, fuente: 'cee' };
    if (pos(kwh)) return { ef: num(kwh), fuente: 'kwh' };
    return null;
}

// Estimación de los dos simulados desde el previo y el posterior (ver la REGLA de arriba).
function estimarSimulados({ ceeInicial, ceeFinal, res080, S }) {
    let ui = usosDeCee(ceeInicial);
    let uf = usosDeCee(ceeFinal);
    // Sin <EnergiaFinalVectores>, lo que el RES080 vigente ya reconstruyó por uso.
    if ((!ui || !uf) && res080 && res080.energiaCalefInicial != null) {
        ui = ui || { cal: num(res080.energiaCalefInicial), acs: num(res080.energiaAcsInicial), ref: num(res080.energiaRefInicial) };
        uf = uf || { cal: num(res080.energiaCalefFinal), acs: num(res080.energiaAcsFinal), ref: num(res080.energiaRefFinal) };
    }
    const dCalI = num(ceeInicial?.demandaCalefaccion);
    const dCalF = num(ceeFinal?.demandaCalefaccion);
    if (!ui || !uf || !(dCalI > 0) || !(dCalF > 0)) return null;
    const dRefI = num(ceeInicial?.demandaRefrigeracion);
    const dRefF = num(ceeFinal?.demandaRefrigeracion);
    // La bomba sola: generador del posterior con la demanda del previo.
    const conDemanda = (e, dDe, dA) => (e > 0 && dDe > 0 && dA > 0 ? e * dA / dDe : e);
    const bcM2 = conDemanda(uf.cal, dCalF, dCalI) + uf.acs + conDemanda(uf.ref, dRefF, dRefI);
    // El resto solo: generador del previo con la demanda del posterior.
    const restM2 = conDemanda(ui.cal, dCalI, dCalF) + ui.acs + conDemanda(ui.ref, dRefI, dRefF);
    if (!(bcM2 > 0) || !(restM2 > 0)) return null;
    return { bc: bcM2 * S, rest: restM2 * S };
}

function avisosRes080Fm(r, ctx) {
    const av = [];
    const add = (tono, texto) => av.push({ tono, texto });
    const finFacturas = ctx.comunidad ? FM_FIN_FACTURAS_CCPP : FM_FIN_FACTURAS;
    const finPresentacion = ctx.comunidad ? FM_PRESENTACION_HASTA_CCPP : FM_PRESENTACION_HASTA;
    const hoy = String(ctx.hoy || hoyIso()).slice(0, 10);

    // ── Lo que impide pedirlo ──
    if (ctx.terciario) add('bloquea', 'Es del sector TERCIARIO (TER100 / TER173): el factor multiplicador solo tiene fichas residenciales.');
    if (r.sinCalefaccion) add('bloquea', 'No hay caldera que sustituir: la RES080_FM exige sustituir la caldera por bomba de calor además de actuar sobre la envolvente.');
    else if (r.solido) add('bloquea', 'La caldera es de combustible SÓLIDO (biomasa o carbón): va siempre por la ficha vigente (decisión de 7/11/2026, como en la RES060_FM).');
    if (r.cambioGenerador === false) add('bloquea', 'Los CEE no reflejan la sustitución de la caldera por bomba: la calefacción del posterior no es eléctrica, o la del previo ya lo era. La RES080_FM pide envolvente Y sustitución a la vez (apartado 2).');
    if (r.envolvente === false) add('bloquea', `La demanda de calefacción no baja (${n1(r.dcalInicial)} → ${n1(r.dcalFinal)} kWh/m²): sin actuación sobre la envolvente no es una rehabilitación profunda (apartado 2). Va por la RES060_FM.`);
    if (ctx.tramite === 'presentado') add('bloquea', 'Ya se ha presentado a MITECO con la ficha vigente: lo resuelto no puede volver a pedir el factor multiplicador.');
    if (ctx.inicioObra && String(ctx.inicioObra).slice(0, 10) < FM_INICIO_ACTUACIONES) {
        add('bloquea', `La actuación empezó el ${fechaEs(ctx.inicioObra)}: el inicio se justifica con una factura posterior al 22/03/2026.`);
    }
    if (ctx.finObra && String(ctx.finObra).slice(0, 10) > finFacturas) {
        add('bloquea', `La última factura es del ${fechaEs(ctx.finObra)}: tienen que ser anteriores al ${ctx.comunidad ? '01/01/2028 (comunidad de propietarios)' : '01/12/2027'}.`);
    }
    if (hoy > finPresentacion) add('bloquea', `El plazo para presentarlo terminó el ${fechaEs(finPresentacion)}.`);
    if (r.sinEf) add('bloquea', 'Sin el consumo de energía final del CEE previo y del posterior (el ahorro RES080) no hay nada que multiplicar.');

    // ── Lo que puede cambiar la cifra o la elegibilidad ──
    if (ctx.tramite === 'verificacion') add('aviso', 'Está en un lote o en verificación: si se presenta a MITECO con la ficha vigente y se resuelve, pierde el factor multiplicador (por FM no se presenta hasta el 15/01/2027).');
    if (r.estimada) {
        const faltan = [!r.simBCFuente && 'el de SOLO la bomba (EF_simBC, doc. 11)', !r.simRestFuente && 'el de todo MENOS la bomba (EF_simRest, doc. 10)'].filter(Boolean).join(' y ');
        add('aviso', `Faltan los CEE simulados: ${faltan}. La cifra FM es una ESTIMACIÓN desde el CEE previo y el posterior (la bomba con la demanda del previo; la envolvente con la caldera del previo). Hay que hacerlos con la misma herramienta que el previo; no hace falta registrarlos.`);
    }
    if (r.sinSimulados) add('aviso', 'Faltan los CEE simulados y no se pueden estimar (hace falta la demanda de calefacción y la energía final por uso de los dos CEE): no hay cifra FM.');
    if (r.envolvente == null && !r.sinSimulados) add('aviso', 'No se ha podido comprobar con los CEE que baje la demanda de calefacción (la envolvente): la ficha exige envolvente y sustitución a la vez.');
    if (r.cambioGenerador == null && !r.sinCalefaccion) add('aviso', 'No se ha podido comprobar con los CEE que la calefacción pase de la caldera a la bomba (electricidad).');
    if (ctx.combustible === 'electrica') add('aviso', 'Caldera ELÉCTRICA: el cuerpo de la Resolución habla de combustibles fósiles. No es seguro que se admita.');

    // ── Lo que se ha aplicado y lo que hay que cumplir ──
    if (r.cae > 0) {
        add('info', `Fórmula literal: el cociente pondera con CONSUMOS (${n3(r.factor)}). Ponderando con los ahorros saldría ${n3(r.factorAhorros)} (${n0(r.caeAhorros)} kWh): solo como referencia, pendiente de consulta al MITECO (FAQ 4).`);
    }
    add('info', `Se presenta del 15/01/2027 al ${fechaEs(finPresentacion)}, con la ficha RES080_FM. Cupo de ${n0(FM_CUPO_KWH / 1e6)} GWh (15 % de la obligación de 2026), por orden de fecha de RESOLUCIÓN: no está garantizado. Lo resuelto con la ficha vigente ya no puede pedirlo.`);
    add('info', 'Requisitos: envolvente y sustitución de la caldera por bomba a la vez; certificado del director o responsable de la obra (elementos, fin de obra y variables de la fórmula); vivienda habitual (facturas del 1/11 al 31/3 del invierno anterior, > 75 kWh/mes); puesta en servicio; CUATRO CEE con la misma herramienta: previo y posterior registrados, y los dos simulados; Anexo A.');

    const orden = { bloquea: 0, aviso: 1, info: 2 };
    return av.sort((a, b) => orden[a.tono] - orden[b.tono]);
}

/**
 * Ahorro por la RES080_FM. Devuelve null solo si no es un RES080 (sin `res080`).
 * Con `cae` 0 y `elegible` false cuando algo lo impide o no hay con qué calcular.
 */
export function calculateRes080FM({
    res080 = null,        // resultado del RES080 vigente (calculateRes080 y sus caminos)
    ceeInicial = null,    // CEE previo parseado
    ceeFinal = null,      // CEE posterior parseado
    ceeSimBC = null,      // CEE simulado con SOLO la bomba (doc. 11), parseado
    ceeSimRest = null,    // CEE simulado con todo MENOS la bomba (doc. 10), parseado
    efSimBC = null,       // o sus kWh/año tecleados
    efSimRest = null,
    tipo,                 // 'unifamiliar' | 'piso' | 'hilera'
    bloque = false,       // edificio con sistema centralizado
    contexto = {},        // { sinCalefaccion, combustible, solido, inicioObra, finObra, tramite, comunidad, hoy }
} = {}) {
    if (!res080) return null;
    const tip = tipologiaFM({ tipo, bloque });
    const fm = tip.fm;
    const efI = num(res080.totalEnergiaInicialAno);
    const efF = num(res080.totalEnergiaFinalAno);
    const ahorroVigente = Math.max(0, num(res080.ahorroEnergiaFinalTotal) || efI - efF);
    const S = num(res080.superficieFinalAplicada) || num(res080.superficieAplicada) || num(ceeFinal?.superficieHabitable) || 0;

    // Los dos simulados: el CEE o los kWh; lo que falte, estimado.
    const bc = simulado(ceeSimBC, efSimBC, S);
    const rest = simulado(ceeSimRest, efSimRest, S);
    const est = (!bc || !rest) ? estimarSimulados({ ceeInicial, ceeFinal, res080, S }) : null;
    const efSimBCv = bc?.ef ?? est?.bc ?? null;
    const efSimRestv = rest?.ef ?? est?.rest ?? null;
    const estimada = (!bc || !rest) && !!est;
    const sinSimulados = !(efSimBCv > 0) || !(efSimRestv > 0);

    const factor = sinSimulados ? null : (fm * efSimBCv + efSimRestv) / (efSimBCv + efSimRestv);
    // Referencia: ponderando con los AHORROS de cada parte (lo lógico; no es la ficha).
    const ahBC = efI - (efSimBCv || 0);
    const ahRest = efI - (efSimRestv || 0);
    const factorAhorros = !sinSimulados && ahBC > 0 && ahRest >= 0 && ahBC + ahRest > 0
        ? (fm * ahBC + ahRest) / (ahBC + ahRest) : null;

    // Requisitos con los CEE: envolvente (baja la demanda) y caldera → bomba.
    const dcalInicial = num(ceeInicial?.demandaCalefaccion);
    const dcalFinal = num(ceeFinal?.demandaCalefaccion);
    const envolvente = dcalInicial > 0 && dcalFinal > 0 ? dcalFinal < dcalInicial * 0.995 : null;
    const ui = usosDeCee(ceeInicial);
    const uf = usosDeCee(ceeFinal);
    const cambioGenerador = ui && uf && ui.cal > 0 && uf.cal > 0
        ? (ui.calOtros > ui.calElec && uf.calElec > uf.calOtros)
        : null;
    const solido = !!contexto.solido || contexto.combustible === 'biomasa' || !!(ui && ui.calSolido > 0 && ui.calSolido >= ui.calOtros / 2);

    const r = {
        normativa: FM_NORMATIVA,
        ficha: FICHA_RES080_FM,
        fm,
        clase: tip.clase,
        tipologiaLabel: tip.label,
        efI, efF,
        ahorroVigente,
        efSimBC: efSimBCv,
        efSimRest: efSimRestv,
        simBCFuente: bc?.fuente || null,     // 'cee' | 'kwh' | null (estimado o sin dato)
        simRestFuente: rest?.fuente || null,
        estimada,
        sinSimulados,
        sinEf: !(efI > 0) || !(efF >= 0) || !(ahorroVigente > 0),
        factor,
        factorAhorros,
        caeAhorros: factorAhorros ? ahorroVigente * factorAhorros : null,
        superficie: S,
        dcalInicial, dcalFinal,
        envolvente,
        cambioGenerador,
        solido,
        sinCalefaccion: !!contexto.sinCalefaccion,
    };
    r.cae = factor ? Math.max(0, ahorroVigente * factor) : 0;
    r.avisos = avisosRes080Fm(r, contexto);
    r.elegible = !r.avisos.some((a) => a.tono === 'bloquea');
    return r;
}
