// Resumen económico de un lote (mismo modelo que el detalle), reutilizable en la
// lista de lotes Y en LoteDetailModal. Usa expedientes_eco (lista) o expedientes (detalle).
//
// Devuelve el ESTIMADO (como hasta ahora) y, en paralelo, el VERIFICADO (sobre el
// ahorro manual del verificador, en kWh) — porque la factura al S.O. se emite por el
// importe verificado. `hasVerif` indica si algún expediente ya tiene verificado;
// `fullyVerif` si lo tienen todos (el verificado del lote solo es completo entonces).
import { computeExpedienteFinancials } from '../../expedientes/logic/expedienteFinancials';

// Equivalencia financiera del CAE (€/MWh): lo que le costaría al Sujeto Obligado
// cumplir su obligación pagando al FNEE en vez de comprando CAEs. Es la referencia
// contra la que se mide lo que se ahorra viniendo con nosotros.
// Valor de 2026 fijado por el usuario (2026-08-04). REVISAR EN 2027: hay que
// actualizarlo a mano cuando salga el del año nuevo.
export const EQUIVALENCIA_FINANCIERA = 198.62;

/**
 * Resumen agregado de VARIOS lotes — el cuadro de mando de la vista de Lotes,
 * pensado para sentarse a revisar con el Sujeto Obligado: cuánto ahorro le hemos
 * llevado, cuánto nos paga, cuánto le cuesta la verificación y cuánto se ahorra
 * frente a la equivalencia financiera.
 *
 * Cada lote aporta su ahorro VERIFICADO si lo tiene completo (que es lo que de
 * verdad se factura) y el estimado si todavía no. `nEstimados` dice cuántos van
 * por estimación, para no leer el total como si fuera definitivo.
 */
export function computeLotesResumen(lotes) {
    const list = Array.isArray(lotes) ? lotes : [];
    const t = {
        nLotes: list.length, nExpedientes: 0, nEstimados: 0, nSinOferta: 0,
        ahorroMwh: 0, pagoCliente: 0, pagoBrokergy: 0, pagoVerificador: 0,
        beneficio: 0, docsPendientes: 0, porEstado: {},
    };

    for (const l of list) {
        const eco = computeLoteEco(l);
        const usaVerif = eco.fullyVerif && eco.ahorroMwhVerif > 0;
        const mwh = usaVerif ? eco.ahorroMwhVerif : eco.ahorroMwh;
        if (!usaVerif) t.nEstimados += 1;

        t.ahorroMwh += mwh;
        t.pagoCliente += usaVerif ? eco.pagoClienteVerif : eco.pagoCliente;
        t.pagoVerificador += eco.costeVerif;
        // Lo que el S.O. nos paga por ese lote = su ahorro × la oferta pactada.
        // Sin oferta pactada no hay pago del S.O. que sumar, y el beneficio de ese lote
        // cae al margen por expediente (`beneficioActual`): se cuenta aparte para poder
        // decir que el beneficio no es exactamente pago del S.O. − pago a clientes.
        if (eco.ofertaLote != null) t.pagoBrokergy += eco.ofertaLote * mwh;
        else t.nSinOferta += 1;
        t.beneficio += (usaVerif ? eco.beneficioLoteVerif : eco.beneficioLote) ?? eco.beneficioActual;

        t.nExpedientes += l?.num_expedientes ?? (l?.expedientes || []).length;
        t.docsPendientes += (l?.documentos_so || []).filter(d => d?.signed_link && !d?.validado_at).length;
        const e = l?.estado || '—';
        t.porEstado[e] = (t.porEstado[e] || 0) + 1;
    }

    // Lo que le cuesta al S.O. y lo que se ahorra frente a la equivalencia financiera.
    const costeSo = t.pagoBrokergy + t.pagoVerificador;
    const costeSoMwh = t.ahorroMwh > 0 ? costeSo / t.ahorroMwh : null;
    const ahorroSoMwh = costeSoMwh != null ? EQUIVALENCIA_FINANCIERA - costeSoMwh : null;

    return {
        ...t,
        ahorroGwh: t.ahorroMwh / 1000,
        costeSo, costeSoMwh,
        equivalenciaFinanciera: EQUIVALENCIA_FINANCIERA,
        ahorroSoMwh,
        ahorroSoTotal: ahorroSoMwh != null ? ahorroSoMwh * t.ahorroMwh : null,
        ahorroSoPct: ahorroSoMwh != null ? (ahorroSoMwh / EQUIVALENCIA_FINANCIERA) * 100 : null,
        verificadorMwh: t.ahorroMwh > 0 ? t.pagoVerificador / t.ahorroMwh : null,
        brokergyMwh: t.ahorroMwh > 0 ? t.pagoBrokergy / t.ahorroMwh : null,
        // Margen medio de Brokergy: lo que queda por cada MWh una vez pagado el cliente.
        margenMwh: t.ahorroMwh > 0 ? t.beneficio / t.ahorroMwh : null,
    };
}

export function computeLoteEco(lote) {
    const exps = (lote && (lote.expedientes_eco || lote.expedientes)) || [];
    const base = exps.reduce((a, e) => {
        const f = computeExpedienteFinancials(e);
        a.ahorroKwh += f.savingsKwh || 0;
        a.pagoCliente += f.cae || 0;
        a.beneficioActual += f.profit || 0;
        a.nTotal += 1;
        // Verificado: solo expedientes con dato del verificador.
        if (f.savingsKwhVerificado != null) {
            a.ahorroKwhVerif += f.savingsKwhVerificado || 0;
            a.pagoClienteVerif += f.caeVerificado || 0;
            a.beneficioActualVerif += f.profitVerificado || 0;
            a.nVerif += 1;
        }
        return a;
    }, { ahorroKwh: 0, pagoCliente: 0, beneficioActual: 0, ahorroKwhVerif: 0, pagoClienteVerif: 0, beneficioActualVerif: 0, nVerif: 0, nTotal: 0 });

    const ahorroMwh = base.ahorroKwh / 1000;
    const ahorroMwhVerif = base.ahorroKwhVerif / 1000;
    const costeVerif = Number(lote?.coste_verificacion) || 0;
    const ofertaLote = (lote?.oferta_lote != null && lote?.oferta_lote !== '') ? Number(lote.oferta_lote) : null;
    const hasVerif = base.nVerif > 0;
    const fullyVerif = base.nTotal > 0 && base.nVerif === base.nTotal;

    // Desglose €/MWh (sobre el estimado, modelo Excel del usuario).
    // El coste de verificación NO entra en nuestro coste: lo paga el SUJETO OBLIGADO
    // (decisión usuario 2026-08-04). Se sigue calculando porque hace falta para saber
    // lo que le sale a él la operación, pero nuestro margen es oferta − pago cliente.
    const mediaCliente = ahorroMwh > 0 ? base.pagoCliente / ahorroMwh : 0;
    const costeVerifMwh = ahorroMwh > 0 ? costeVerif / ahorroMwh : 0;
    const totalMwh = mediaCliente;
    const margen = ofertaLote != null ? ofertaLote - mediaCliente : null;

    const beneficioLote = ofertaLote != null ? (ofertaLote * ahorroMwh - base.pagoCliente) : null;
    // Beneficio del lote sobre el VERIFICADO (lo que se factura al S.O., medido en kWh).
    const beneficioLoteVerif = (ofertaLote != null && hasVerif) ? (ofertaLote * ahorroMwhVerif - base.pagoClienteVerif) : null;

    // ── Lo que le AHORRAMOS al Sujeto Obligado ────────────────────────────────
    // Su alternativa es pagar la equivalencia financiera; con nosotros paga lo que
    // nos compra (oferta) más la verificación que contrata él. La diferencia es su
    // ahorro, y es el argumento con el que se negocia el precio.
    const costeSoMwh = ofertaLote != null ? ofertaLote + costeVerifMwh : null;
    const ahorroSoMwh = costeSoMwh != null ? EQUIVALENCIA_FINANCIERA - costeSoMwh : null;
    const ahorroSoTotal = ahorroSoMwh != null ? ahorroSoMwh * ahorroMwh : null;
    const ahorroSoPct = ahorroSoMwh != null ? (ahorroSoMwh / EQUIVALENCIA_FINANCIERA) * 100 : null;

    return {
        ...base,
        ahorroMwh, ahorroMwhVerif,
        costeVerif, ofertaLote,
        hasVerif, fullyVerif,
        mediaCliente, costeVerifMwh, totalMwh, margen,
        beneficioLote, beneficioLoteVerif,
        beneficio: beneficioLote != null ? beneficioLote : base.beneficioActual,
        equivalenciaFinanciera: EQUIVALENCIA_FINANCIERA,
        costeSoMwh, ahorroSoMwh, ahorroSoTotal, ahorroSoPct,
    };
}
