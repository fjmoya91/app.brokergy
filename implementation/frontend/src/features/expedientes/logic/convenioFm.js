// ============================================================================
// convenioFm.js — El Convenio de Cesión de un expediente de la vía del FACTOR
// MULTIPLICADOR (26RES060FM_N / 26RES093FM_N) cubre LAS DOS fichas a la vez.
//
// Fran (08/11/2026): «que aparezca en el anexo de cesión que se solicitará por un
// ahorro con factor multiplicador, de tanto, y que si por causas que no se pudiese
// justificar, porque se agotase o por otra causa, se solicitaría por el ahorro de
// la ficha normal. De este modo, si luego se rechaza, no hay que volver a firmar
// otro anexo de cesión».
//
// Así que el Convenio FM declara una ficha PRINCIPAL (la FM, con su ahorro y su
// precio) y una SUBSIDIARIA (la general, la de siempre), y autoriza desde la firma
// a pasar de una a otra sin novarlo. Las cifras salen de las MISMAS fuentes que la
// pestaña Económico del expediente (ExpedienteDetailView → calcResults):
//   · principal  → results.res060fc.cae      + results.financialsRes060FC.caeBonus
//   · subsidiaria→ results.savingsKwh        + results.caeBonus
// Con un requerimiento vivo (`results.viaUnica`) el ahorro ya es el VERIFICADO de
// la vía presentada y el Convenio vuelve a una sola cifra.
//
// Detalle: docs/conocimiento/expedientes/la-via-del-factor-multiplicador-en-el-expediente.md
// ============================================================================

import { esNumeroFm } from './viaFm.js';
import { viaFmDesdeDatosCalculo } from '../../calculator/logic/viaFm.js';

/** La ficha general a la que se vuelve si la FM no se puede justificar. */
export const fichaGeneralDeFm = (numero) => (/RES093FM_/i.test(String(numero || '')) ? 'RES093' : 'RES060');

const num = (v) => {
    const n = typeof v === 'number' ? v : parseFloat(v);
    return Number.isFinite(n) ? n : 0;
};

/**
 * Las dos cifras del Convenio FM, o null si el expediente no es FM.
 * `rateMwh`: el precio de la ficha general (getClientCaeRate). El de la FM es el que
 * selló la oportunidad (`cae_client_rate_fm`, solo cuando difiere); si no, el mismo.
 */
export function cifrasConvenioFm(expediente = {}, results = {}, { rateMwh } = {}) {
    if (!esNumeroFm(expediente?.numero_expediente)) return null;
    // El Convenio es lo que se FIRMA: nunca con la cifra estimada de la simulación.
    return cifrasViaFm(expediente, results, { rateMwh, estimar: false });
}

/**
 * Las dos cifras (FM y vigente) de CUALQUIER RES060/RES093, vaya ya por la FM o
 * no: es lo que enseña el panel «Vía FM» para decidir si merece la pena pasar, y
 * lo que lleva el aviso al cliente de esperar al 15/01/2027. Mismas fuentes que el
 * Convenio (arriba). `gana` = lo que el CLIENTE gana con la FM (€), o null.
 */
export function cifrasViaFm(expediente = {}, results = {}, { rateMwh, estimar = true } = {}) {
    const numero = expediente?.numero_expediente;
    const opIn = expediente?.oportunidades?.datos_calculo?.inputs || {};
    const rateGeneral = num(rateMwh);
    const rateFm = num(opIn.cae_client_rate_fm) || rateGeneral;
    const eur = (kwh, rate, calculado) => {
        if (calculado != null && Number.isFinite(num(calculado)) && num(calculado) > 0) return num(calculado);
        return kwh > 0 && rate > 0 ? (kwh / 1000) * rate : null;
    };
    const kwhFm = num(results?.res060fc?.cae);
    const kwhGeneral = num(results?.savingsKwh);
    const fm = { kwh: kwhFm, rateMwh: rateFm, eur: eur(kwhFm, rateFm, results?.financialsRes060FC?.caeBonus) };
    const general = { kwh: kwhGeneral, rateMwh: rateGeneral, eur: eur(kwhGeneral, rateGeneral, results?.caeBonus) };
    const avisos = Array.isArray(results?.res060fc?.avisos) ? results.res060fc.avisos : [];
    const fichaGeneral = /RES093/i.test(String(numero || '')) ? 'RES093' : 'RES060';
    // Sin CEE la pestaña Económico no calcula (no hay demanda ni superficie): se usa la
    // cifra de la SIMULACIÓN, la de la columna «Vía FM» de Oportunidades, marcada como
    // estimada. La definitiva la da el CEE (08/11/2026: 13 obras sin CEE se quedaban sin
    // cifras en el panel y con el WhatsApp sin importes).
    if (estimar && !(kwhFm > 0) && !(kwhGeneral > 0)) {
        const est = estimadaSimulacion(expediente, fichaGeneral);
        if (est) return est;
    }
    return {
        // Con requerimiento el ahorro es el verificado de UNA vía: no hay alternativa que ofrecer.
        doble: !results?.viaUnica,
        fichaGeneral,
        fm,
        general,
        mismoPrecio: Math.abs(rateFm - rateGeneral) < 1e-9,
        gana: fm.eur > 0 && general.eur > 0 ? fm.eur - general.eur : null,
        // Lo que el motor dice que IMPIDE pedirla (fechas de obra, aire-aire…).
        bloquea: avisos.filter((a) => a?.tono === 'bloquea').map((a) => a.texto).filter(Boolean),
        estimada: false,
    };
}

/**
 * Las dos cifras desde la simulación de la oportunidad, o null: el resumen guardado
 * (`datos_calculo.via_fm`, solo ADMIN) o, si aún no está guardado (al desplegar,
 * ninguna lo tenía), recalculado al momento con la misma función que el relleno.
 */
function estimadaSimulacion(expediente, fichaGeneral) {
    const dc = expediente?.oportunidades?.datos_calculo;
    let via = dc?.via_fm || null;
    if (!via && dc?.result) {
        try { via = viaFmDesdeDatosCalculo(dc); } catch { via = null; }
    }
    if (!via || via.aplica === false) return null;
    const kwhFm = num(via.mwh_fm) * 1000;
    const kwhGeneral = num(via.mwh_vigente) * 1000;
    if (!(kwhFm > 0) && !(kwhGeneral > 0)) return null;
    const eurFm = num(via.eur_fm) || null;
    const eurGeneral = num(via.eur_vigente) || null;
    const rate = (kwh, eur) => (kwh > 0 && eur > 0 ? eur / (kwh / 1000) : 0);
    return {
        doble: true,
        fichaGeneral,
        fm: { kwh: kwhFm, rateMwh: num(via.precio_fm) || rate(kwhFm, eurFm), eur: eurFm },
        general: { kwh: kwhGeneral, rateMwh: num(via.precio_vigente) || rate(kwhGeneral, eurGeneral), eur: eurGeneral },
        mismoPrecio: !via.precio_fm,
        gana: eurFm > 0 && eurGeneral > 0 ? eurFm - eurGeneral : null,
        bloquea: via.elegible === false ? [via.motivo || 'El cálculo de la simulación dice que no se puede pedir por la vía FM.'] : [],
        estimada: true,
        acs: via.acs || null,
    };
}

/** Desde cuándo se puede PRESENTAR por la vía FM (y hasta cuándo). */
export const FM_PRESENTACION = { desde: '2027-01-15', hasta: '2027-12-31', desdeTxt: '15 de enero de 2027' };

/**
 * El WhatsApp que propone al cliente ESPERAR al 15/01/2027 para pedirlo por la
 * vía FM (Fran, 08/11/2026: «que le podamos enviar un mensaje al cliente para que,
 * si está de acuerdo, se espere a partir del 15/01 para presentarlo»). Sin emojis,
 * sin presentarse y en borrador: sale solo desde el popup, con el «Enviar».
 * `tercero`: lo lee la persona de contacto, no el titular.
 */
export function mensajeEsperaFm({ saludo = '', numero = '', cifras = null, tercero = false } = {}) {
    const fm = eurMsg(cifras?.fm?.eur);
    const general = eurMsg(cifras?.general?.eur);
    const su = tercero ? 'su' : 'tu';
    const hola = saludo ? `Hola ${saludo},` : 'Hola,';
    const cifrasTxt = fm && general
        ? `En ${tercero ? 'su caso' : 'tu caso'}, el incentivo estimado pasaría de unos *${general}* a unos *${fm}*.`
        : `En ${tercero ? 'su caso' : 'tu caso'}, el incentivo estimado sería bastante más alto.`;
    return [
        hola,
        '',
        `Te escribo por el expediente de ${tercero ? 'la aerotermia de tu cliente' : 'tu aerotermia'} (${numero}). El Ministerio acaba de publicar una ficha nueva, la del *factor multiplicador*, que para obras como ${tercero ? 'esta' : 'la tuya'} reconoce bastante más ahorro. ${cifrasTxt}`,
        '',
        `La condición es el plazo: esa ficha solo se puede presentar a partir del *${FM_PRESENTACION.desdeTxt}*, así que ${su} expediente se presentaría a partir de esa fecha en lugar de ahora, y el cobro llegaría más tarde. Además tiene un cupo limitado: si se agotara, o no se pudiera justificar por cualquier otro motivo, se tramitaría por la ficha de siempre, con el importe de siempre.`,
        '',
        `Para esta ficha hará falta que ${tercero ? 'el titular firme' : 'firmes'} la nueva versión del convenio (ya recoge los dos casos) y que ${tercero ? 'nos paséis' : 'nos pases'} las facturas de la luz del invierno pasado. Lo demás lo preparamos nosotros.`,
        '',
        `¿${tercero ? 'Os parece' : 'Te parece'} bien que esperemos para pedirlo por la ficha nueva? Con que me contestes *sí* es suficiente.`,
    ].join('\n');
}

const eurMsg = (v) => (v > 0 ? `${Math.round(v).toLocaleString('es-ES', { useGrouping: true })} €` : null);

/**
 * La línea del mensaje con el que se ENVÍA el Convenio FM al cliente: el importe
 * que se anuncia es el de la vía FM, y se le dice —sin tecnicismos— que si no se
 * pudiera justificar se tramita por la ficha general, que el convenio ya lo
 * recoge y que no tendrá que firmar nada más. Sin cifras, no se escribe.
 */
export function lineaMensajeConvenioFm(cifras) {
    if (!cifras?.doble) return '';
    const general = eurMsg(cifras.general?.eur);
    if (!general) return '';
    return `ℹ️ *Vía del factor multiplicador.* Ese importe es el de la vía del factor multiplicador, que es por la que lo vamos a pedir. Si por cualquier motivo no se pudiera justificar, se tramitaría por la ficha general, con un importe estimado de *${general}*. El convenio ya recoge los dos casos, así que no tendrías que volver a firmar nada.`;
}

/**
 * Las causas por las que se pasa a la ficha general, en una frase. Es lo que hace
 * que no haga falta otro convenio: la autorización ya está firmada.
 */
// El cupo de la vía FM se reparte por orden de fecha de resolución (1.287 GWh, el 15 %
// de la obligación de 2026: avisos de res060fc.js), así que «agotarse» es una causa real.
export const CAUSAS_SUBSIDIARIA_FM = 'por no reunir alguno de sus requisitos, por haberse agotado el cupo de ahorro de la ficha o haber dejado esta de estar vigente, por no admitirla el verificador o el órgano competente, o por cualquier otra causa';
