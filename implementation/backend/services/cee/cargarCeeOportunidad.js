'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// El XML del CEE INICIAL que hacemos NOSOTROS, cargado en la SIMULACIÓN de una
// OPORTUNIDAD: la propuesta pasa a calcular con la demanda del certificado.
//
// Decisión de Fran (22/10/2026, 26RES060_OP321): «siempre que te pida que hagas
// el CEE lo cargas en el XML de la oportunidad». Antes solo se cargaba al
// aceptarla, y la propuesta seguía con la demanda ESTIMADA (un ático de 226 m²
// simulado como piso intermedio: 1.058 € de bono frente a 4.491 € con el CEE).
//
// Entra por las MISMAS funciones que la calculadora con un `.xml` en «Nueva
// simulación»: `parseCeeXml` → `ceeFromXml` → `seedInputsFromCees` (modo
// manual, `xmlDemandData` para que el expediente nazca con este CEE como
// inicial) → `computeFullCalculatorResult`.
//
// REGLA — el CEE va marcado como NUESTRO (`propio` → `cee_previo.origen =
// 'brokergy'`): con él no hay comparativa «con tu CEE / CEE nuevo BROKERGY», que
// es solo para el CEE que APORTA el cliente (ceeSeed.ceeEsPropio).
// REGLA — no sustituye el CEE que aportó el CLIENTE sin `forzar`: su comparativa
// es lo que se le ofrece.
// REGLA — un RES080 no: su ahorro sale de DOS certificados (inicial y previsto,
// `alta_oportunidad` con `cee_xml`), no de la demanda de uno.
// ─────────────────────────────────────────────────────────────────────────────
const path = require('path');
const { pathToFileURL } = require('url');
const supabase = require('../supabaseClient');
const previstoSrv = require('./previstoRes080');
const { sellarPrecioCae } = require('../../utils/precioCae');
const { sellarGuiaTransmitancias } = require('../../utils/guiaTransmitancias');
const { redondearScopsInputs } = require('../../utils/scopRedondeo');
require('../../utils/esmSinExtension');

const FRONT = path.join(__dirname, '../../../frontend/src');
const esm = f => import(pathToFileURL(path.join(FRONT, f)).href);

/** Lo que se le dice a quien lo carga: demanda, ahorro, bono y precio. */
function cifras(inputs, result) {
    const fin = result?.financials || {};
    return {
        demanda: Number(inputs?.demandMode === 'manual' ? inputs.manualDemand : result?.demanda) || null,
        ahorroKwh: Number(result?.savings?.savingsKwh) || 0,
        bono: Number(fin.caeBonus) || 0,
        total: Number(fin.totalAyuda) || 0,
        precio: Number(inputs?.caePriceClient) || null,
    };
}

/**
 * @param {string} oportunidadId  uuid de la oportunidad
 * @param {string} xmlTexto       el XML de CE3X 3.x
 * @param {object} [o]
 * @param {string}  [o.fileName]       con qué nombre consta (el del `.xml` en Drive)
 * @param {boolean} [o.escribir]       sin él, solo dice qué cargaría y cuánto saldría
 * @param {boolean} [o.forzar]         sustituir el CEE que aportó el cliente
 * @param {number}  [o.precioCliente]  €/MWh al cliente (la tarifa de la propuesta)
 * @returns {{ cargado, omitido?, parsed?, antes?, despues? }}
 */
async function cargarCeeEnOportunidad(oportunidadId, xmlTexto,
    { fileName = null, escribir = false, forzar = false, precioCliente = null } = {}) {
    const { data: op, error } = await supabase.from('oportunidades')
        .select('id, id_oportunidad, ficha, inputs:datos_calculo->inputs, result:datos_calculo->result')
        .eq('id', oportunidadId).maybeSingle();
    if (error) throw new Error(`No se ha podido leer la oportunidad: ${error.message}`);
    if (!op) throw new Error('No existe la oportunidad.');
    const inputs = op.inputs || {};
    if (op.ficha === 'RES080' || inputs.isReforma) {
        return { cargado: false, omitido: 'RES080: el ahorro sale del inicial Y el previsto (alta_oportunidad con cee_xml), no de un solo CEE' };
    }

    const parsed = await previstoSrv.leerXml(xmlTexto);
    if (fileName) parsed._fileName = fileName;
    const { ceeFromXml } = await esm('features/cee/ceeExtract.js');
    const { seedInputsFromCees, ceeEsPropio } = await esm('features/calculator/logic/ceeSeed.js');
    const { computeFullCalculatorResult } = await esm('features/landing/data/landingCalculation.js');

    if (inputs.cee_previo && !ceeEsPropio(inputs.cee_previo) && !forzar) {
        return { cargado: false, parsed,
                 omitido: 'la simulación ya tiene un CEE que aportó el CLIENTE (su comparativa): no se sustituye sin --forzar' };
    }

    const cee = ceeFromXml(parsed);
    const nuevos = { ...inputs, ...seedInputsFromCees({ inicial: cee, inputs, propio: true }) };
    if (Number(precioCliente) > 0) nuevos.caePriceClient = Number(precioCliente);
    const result = computeFullCalculatorResult(nuevos);
    if (!result?.financials) throw new Error('La calculadora no da resultado con este CEE.');
    const antes = cifras(inputs, op.result);
    const despues = cifras(nuevos, result);
    if (!escribir) return { cargado: false, omitido: 'en seco', parsed, antes, despues };

    // Lo mismo que hace el guardado de la calculadora con los inputs (POST /oportunidades).
    const guardar = await redondearScopsInputs(nuevos);
    const existente = { datos_calculo: { inputs } };
    sellarPrecioCae(guardar, existente);
    sellarGuiaTransmitancias(guardar, existente);
    const { error: eIn } = await supabase.rpc('oportunidad_merge_inputs', { p_id: op.id, p_patch: guardar });
    if (eIn) throw new Error(`No se han podido guardar los inputs: ${eIn.message}`);

    // `result` y el historial no tienen RPC: se relee justo antes (anotarOportunidad).
    const { data: fresca, error: eDc } = await supabase.from('oportunidades')
        .select('datos_calculo').eq('id', op.id).maybeSingle();
    if (eDc) throw new Error(eDc.message);
    const dc = fresca?.datos_calculo || {};
    const eur = n => `${Math.round(n).toLocaleString('es-ES')} €`;
    const texto = `📄 CEE inicial de BROKERGY cargado en la simulación (${fileName || 'XML'}): `
        + `${parsed.superficieHabitable ?? '—'} m² · demanda de calefacción ${parsed.demandaCalefaccion ?? '—'} kWh/m²·año · `
        + `${parsed.emisionesLetra || '—'}/${parsed.epnrLetra || '—'}. Ahorro ${Math.round(antes.ahorroKwh).toLocaleString('es-ES')} → `
        + `${Math.round(despues.ahorroKwh).toLocaleString('es-ES')} kWh/año · bono ${eur(antes.bono)} → ${eur(despues.bono)}`
        + (despues.precio !== antes.precio ? ` (precio CAE al cliente ${antes.precio} → ${despues.precio} €/MWh)` : '')
        + '. Sin comparativa «con tu CEE»: el certificado es nuestro.';
    const historial = [...(Array.isArray(dc.historial) ? dc.historial : []),
        { id: `${Date.now()}_cee_brokergy`, tipo: 'comentario', texto, fecha: new Date().toISOString(), usuario: 'CLAUDE' }];
    const { error: eUp } = await supabase.from('oportunidades')
        .update({ datos_calculo: { ...dc, result, historial }, demanda_calefaccion: despues.demanda })
        .eq('id', op.id);
    if (eUp) throw new Error(`No se ha podido guardar el resultado: ${eUp.message}`);
    return { cargado: true, parsed, antes, despues };
}

module.exports = { cargarCeeEnOportunidad };
