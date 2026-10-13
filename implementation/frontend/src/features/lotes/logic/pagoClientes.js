// En qué punto está el PAGO de los clientes de un lote, a partir de las filas de
// `GET /api/lotes/:id/cobros` (cada una trae `pago: { remesa, transferencia, resena }`).

/** Cuántos van en cada paso: remesa → transferido → avisado → reseña programada. */
export function resumenPago(filas = []) {
    const enRemesa = filas.filter(f => f.pago?.remesa);
    const transferidas = filas.filter(f => f.pago?.transferencia);
    const sinAvisar = transferidas.filter(f => !f.pago.transferencia.aviso_at);
    const resenasProg = filas.filter(f => f.pago?.resena?.programada_para && !f.pago.resena.enviada_at && !f.pago.resena.cancelada_at);
    return { enRemesa, transferidas, sinAvisar, resenasProg };
}
