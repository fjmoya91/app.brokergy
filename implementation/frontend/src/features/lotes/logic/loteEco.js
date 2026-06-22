// Resumen económico de un lote (mismo modelo que el detalle), reutilizable en la
// lista de lotes. Usa expedientes_eco (lista) o expedientes (detalle).
import { computeExpedienteFinancials } from '../../expedientes/logic/expedienteFinancials';

export function computeLoteEco(lote) {
    const exps = (lote && (lote.expedientes_eco || lote.expedientes)) || [];
    const base = exps.reduce((a, e) => {
        const f = computeExpedienteFinancials(e);
        a.ahorroKwh += f.savingsKwh || 0;
        a.pagoCliente += f.cae || 0;
        a.beneficioActual += f.profit || 0;
        return a;
    }, { ahorroKwh: 0, pagoCliente: 0, beneficioActual: 0 });
    const ahorroMwh = base.ahorroKwh / 1000;
    const costeVerif = Number(lote?.coste_verificacion) || 0;
    const ofertaLote = (lote?.oferta_lote != null && lote?.oferta_lote !== '') ? Number(lote.oferta_lote) : null;
    const beneficioLote = ofertaLote != null ? (ofertaLote * ahorroMwh - base.pagoCliente - costeVerif) : null;
    return {
        ...base,
        ahorroMwh,
        ofertaLote,
        costeVerif,
        beneficioLote,
        beneficio: beneficioLote != null ? beneficioLote : base.beneficioActual,
    };
}
