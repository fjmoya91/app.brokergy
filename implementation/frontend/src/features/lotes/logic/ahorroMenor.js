// ============================================================================
// ahorroMenor.js — el verificado sale MENOR que lo declarado: ¿qué le pagamos?
// ----------------------------------------------------------------------------
// Fran, 18/11/2026: «si en algún caso es menos, cuando vayamos a pagar los lotes
// nos salte un aviso, para que autoricemos el pago, decidamos si subimos el precio
// al cliente para pagarle lo que se acordó o por el contrario se le paga sobre lo
// verificado».
//
// Dos decisiones, por expediente, y solo ADMIN (es dinero):
//   · 'acordado'   → se le SUBE el precio por MWh (economico_override.cae_client_rate)
//                    lo justo para que el bono sobre el VERIFICADO sea el declarado.
//                    El margen baja, y así lo cuentan el panel y el lote.
//   · 'verificado' → se le paga sobre lo verificado, al precio de siempre.
//
// Funciones PURAS: las usan el panel de la fase 7 y el servidor (cobroService y
// pagoClientesService, por import ESM), así el aviso y la remesa dicen lo mismo.
//
// REGLA — «lo acordado» es el bono DECLARADO: el ahorro del expediente (el del CEE
// que se presentó al verificador) al precio pactado. Se CONGELA al decidir: al subir
// el precio, el bono declarado recalculado también sube y ya no sirve de referencia.
//
// REGLA — el bono es LINEAL en el ahorro (MWh × precio, con el descuento del
// prescriptor y el IVA de la empresa como factores fijos), así que el verificado al
// precio pactado es `bono declarado × kWh verificado ÷ kWh declarado`, aunque ya se
// haya subido el precio.
//
// REGLA — una decisión vale mientras los dos ahorros sean los MISMOS que cuando se
// tomó. Si llega otro informe con otra cifra (o cambia el declarado), vuelve a estar
// pendiente: lo autorizado era pagar ESA diferencia, no otra.
// ============================================================================

/** Por debajo de 1 € no es «menos»: es el redondeo del verificador a kWh enteros. */
export const UMBRAL_EUR = 1;

export const DECISIONES = ['acordado', 'verificado'];

const r2 = (v) => Math.round(Number(v) * 100) / 100;
const mismo = (a, b) => Math.abs(Number(a) - Number(b)) < 0.005;

/**
 * El estado del expediente frente a su verificado.
 *
 * @param {object} fin       lo que devuelve `computeExpedienteFinancials(exp)`
 * @param {object} decision  `documentacion.cobro.ahorro_menor` (o null)
 * @returns {null | {
 *     kwh_declarado, kwh_verificado, bono_declarado, bono_verificado, diferencia,
 *     pendiente: boolean, decision: 'acordado'|'verificado'|null, bono_a_pagar,
 *     decision_caducada: boolean, decidido: object|null }}
 *   null si no hay verificado o no es menor (no hay nada que decidir).
 */
export function estadoAhorroMenor(fin, decision = null) {
    const kd = Number(fin?.savingsKwh);
    const kv = Number(fin?.savingsKwhVerificado);
    if (!(kd > 0) || !(kv > 0)) return null;

    const d = decision && DECISIONES.includes(decision.decision) ? decision : null;
    // El declarado congelado al decidir vale mientras el ahorro declarado no cambie:
    // subir el precio mueve el bono recalculado, no los kWh.
    const congelado = d && mismo(d.kwh_declarado, kd) && Number(d.bono_declarado) > 0;
    const bonoD = congelado ? Number(d.bono_declarado) : Number(fin?.cae);
    if (!(bonoD > 0)) return null;
    const bonoV = r2(bonoD * kv / kd);
    const diferencia = r2(bonoD - bonoV);
    if (diferencia < UMBRAL_EUR) return null;

    const vigente = congelado && mismo(d.kwh_verificado, kv);
    const decisionVigente = vigente ? d.decision : null;
    return {
        kwh_declarado: Math.round(kd * 100) / 100,
        kwh_verificado: kv,
        bono_declarado: r2(bonoD),
        bono_verificado: bonoV,
        diferencia,
        pendiente: !vigente,
        decision: decisionVigente,
        bono_a_pagar: decisionVigente === 'acordado' ? r2(bonoD) : decisionVigente === 'verificado' ? bonoV : null,
        // Había una decisión, pero era para OTRAS cifras: se vuelve a pedir.
        decision_caducada: !!d && !vigente,
        decidido: vigente ? { por: d.por || null, at: d.at || null, precio_antes: d.precio_antes ?? null, precio_nuevo: d.precio_nuevo ?? null } : null,
    };
}

/**
 * El precio por MWh que hace que el bono sobre el VERIFICADO sea el declarado.
 * Se resuelve con DOS evaluaciones de la propia economía (`bonoAPrecio(p)`, lineal
 * en el precio): así entran el descuento del prescriptor y el IVA de la empresa sin
 * escribir la fórmula otra vez. Seis decimales: en 126 MWh el error es < 0,001 €.
 */
export function precioParaAcordado(bonoAPrecio, precioActual, objetivo) {
    const p0 = Number(precioActual);
    const b0 = Number(bonoAPrecio(p0));
    const b1 = Number(bonoAPrecio(p0 + 10));
    const pendiente = (b1 - b0) / 10;
    if (!(pendiente > 0)) return null;
    return Math.round((p0 + (Number(objetivo) - b0) / pendiente) * 1e6) / 1e6;
}

/** La línea del aviso, para el panel y el correo. */
export function textoAhorroMenor(est, { eur = (v) => `${Number(v).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` } = {}) {
    if (!est) return '';
    const kwh = (v) => `${Number(v).toLocaleString('es-ES', { maximumFractionDigits: 0 })} kWh`;
    return `Verificado ${kwh(est.kwh_verificado)} de ${kwh(est.kwh_declarado)} declarados: `
        + `${eur(est.bono_verificado)} en vez de ${eur(est.bono_declarado)} (−${eur(est.diferencia)})`;
}
