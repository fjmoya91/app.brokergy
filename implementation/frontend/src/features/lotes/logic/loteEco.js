// Resumen económico de un lote (mismo modelo que el detalle), reutilizable en la
// lista de lotes Y en LoteDetailModal. Usa expedientes_eco (lista) o expedientes (detalle).
//
// Devuelve el ESTIMADO (como hasta ahora) y, en paralelo, el VERIFICADO (sobre el
// ahorro manual del verificador, en kWh) — porque la factura al S.O. se emite por el
// importe verificado. `hasVerif` indica si algún expediente ya tiene verificado;
// `fullyVerif` si lo tienen todos (el verificado del lote solo es completo entonces).
import { computeExpedienteFinancials } from '../../expedientes/logic/expedienteFinancials';

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
    const mediaCliente = ahorroMwh > 0 ? base.pagoCliente / ahorroMwh : 0;
    const costeVerifMwh = ahorroMwh > 0 ? costeVerif / ahorroMwh : 0;
    const totalMwh = mediaCliente + costeVerifMwh;
    const margen = ofertaLote != null ? ofertaLote - totalMwh : null;

    const beneficioLote = ofertaLote != null ? (ofertaLote * ahorroMwh - base.pagoCliente - costeVerif) : null;
    // Beneficio del lote sobre el VERIFICADO (lo que se factura al S.O., medido en kWh).
    const beneficioLoteVerif = (ofertaLote != null && hasVerif) ? (ofertaLote * ahorroMwhVerif - base.pagoClienteVerif - costeVerif) : null;

    return {
        ...base,
        ahorroMwh, ahorroMwhVerif,
        costeVerif, ofertaLote,
        hasVerif, fullyVerif,
        mediaCliente, costeVerifMwh, totalMwh, margen,
        beneficioLote, beneficioLoteVerif,
        beneficio: beneficioLote != null ? beneficioLote : base.beneficioActual,
    };
}
