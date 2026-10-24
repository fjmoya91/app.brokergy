// El punto del PAGO A LOS CLIENTES en la tarjeta del lote (24/10/2026).
//
// El estado del lote no se mueve al pagar: LOTE-2025-001 seguía diciendo
// «PTE. PAGO BROKERGY A CLIENTE» con los cinco transferidos y el justificante
// subido. El backend resume los sellos de `documentacion.cobro` de cada expediente
// en `lote.pago_clientes` (pagoClientesService.resumenPagoLote: pasos y nº de
// expediente, sin importes) y aquí se decide qué se pinta:
//   · todos transferidos      → la chapa pasa a «PAGADO A CLIENTES»
//   · alguno transferido      → «PAGADO EXCEPTO N» y quién falta, con su paso
//   · ninguno                 → la chapa de siempre y el SUBESTADO debajo
//                               (sin pedir · cuenta pedida · confirmadas · remesa)

const ESTADO_PAGO = 'PTE. PAGO BROKERGY A CLIENTE';

const PASO_TXT = {
    sin_pedir: 'sin pedir la cuenta',
    pedida: 'cuenta pedida, sin confirmar',
    confirmada: 'cuenta confirmada, sin remesa',
    remesa: 'en remesa, falta el justificante',
};

const TONO = {
    ok: 'text-emerald-300',
    avance: 'text-sky-300',
    pendiente: 'text-amber-300/90',
    nada: 'text-white/45',
};

const BADGE_PAGADO = 'bg-emerald-500/25 text-emerald-200 border-emerald-400/50';
const BADGE_PARCIAL = 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30';

/**
 * @returns {null | { etiqueta?: string, badge?: string, detalle: string, tono: string, titulo?: string }}
 *   `etiqueta`/`badge` solo cuando sustituyen a la chapa del estado.
 */
export function puntoPagoClientes(lote) {
    const p = lote?.pago_clientes;
    if (lote?.estado !== ESTADO_PAGO || !p?.total) return null;
    const { total, pagado, remesa, confirmada, pedida, avisados, pendientes = [] } = p;
    const lista = pendientes.map(x => `${x.numero_expediente} · ${PASO_TXT[x.paso] || x.paso}`).join('\n');

    if (pagado === total) {
        const sinAvisar = total - (avisados || 0);
        return {
            etiqueta: 'PAGADO A CLIENTES',
            badge: BADGE_PAGADO,
            detalle: sinAvisar ? `✓ ${total}/${total} transferidos · falta avisar a ${sinAvisar}` : `✓ ${total}/${total} transferidos y avisados`,
            tono: sinAvisar ? TONO.pendiente : TONO.ok,
        };
    }
    if (pagado > 0) {
        const faltan = total - pagado;
        return {
            etiqueta: `PAGADO EXCEPTO ${faltan}`,
            badge: BADGE_PARCIAL,
            detalle: faltan === 1
                ? `Falta ${pendientes[0].numero_expediente} · ${PASO_TXT[pendientes[0].paso] || pendientes[0].paso}`
                : `Faltan ${pendientes.map(x => x.numero_expediente).join(', ')}`,
            tono: TONO.pendiente,
            titulo: lista,
        };
    }
    if (remesa > 0) {
        return { detalle: `🏦 Remesa generada (${remesa}/${total}) · falta subir el justificante`, tono: TONO.avance, titulo: lista };
    }
    if (confirmada === total) {
        return { detalle: `✓ Cuentas confirmadas ${total}/${total} · lista para la remesa`, tono: TONO.ok };
    }
    if (pedida + confirmada > 0) {
        const sinPedir = p.sin_pedir ? ` · ${p.sin_pedir} sin pedir` : '';
        return { detalle: `📨 Cuenta pedida · ${confirmada}/${total} confirmadas${sinPedir}`, tono: TONO.avance, titulo: lista };
    }
    return { detalle: 'Sin pedir la cuenta a los clientes', tono: TONO.nada };
}
