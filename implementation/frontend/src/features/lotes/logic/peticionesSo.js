// ─────────────────────────────────────────────────────────────────────────────
// Qué se le puede PEDIR al Sujeto Obligado sobre un CONJUNTO de lotes.
//
// Los envíos que ya existen son de UN documento de UN lote (firmar el Anexo I,
// firmar la oferta). Éstos son de otra naturaleza: se le escribe una vez por
// varios lotes a la vez, porque así es como se trabaja con él —"te mando las
// facturas de los lotes 001 a 004"—, y mandarle cuatro correos iguales el mismo
// día es la forma de que no conteste a ninguno.
//
// REGLA — una petición solo se ofrece si HOY se puede pedir. El botón no se
// deshabilita con un tooltip: si no hay nada que pedir, no hay botón. Y cuando lo
// hay, DICE lo que va a pedir y por cuánto, para no tener que abrirlo para saberlo.
//
// Para añadir una petición nueva basta con otra entrada en `PETICIONES`: la
// decisión, el texto del correo y el asunto viven aquí, no repartidos por la
// pantalla y la ruta.
// ─────────────────────────────────────────────────────────────────────────────

const eur = (n) => `${Number(n || 0).toLocaleString('es-ES', { maximumFractionDigits: 0 })} €`;
const num = (n, d = 1) => Number(n || 0).toLocaleString('es-ES', { maximumFractionDigits: d });

/** La factura del verificador de un lote, si está subida. */
export const facturaVerificadorDe = (lote) =>
    (lote?.documentos_so || []).find(d => d?.key === 'factura_verificador') || null;

/** Días naturales transcurridos desde una fecha ISO. */
const diasDesde = (iso) => {
    const t = Date.parse(iso || '');
    return Number.isFinite(t) ? Math.max(0, Math.floor((Date.now() - t) / 86400000)) : null;
};

export const fmtFecha = (iso) => {
    const d = new Date(iso || '');
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-ES');
};

const haceTexto = (dias) =>
    dias === null ? '' : dias === 0 ? 'hoy' : dias === 1 ? 'ayer' : `hace ${dias} días`;

/**
 * PAGO DE LA VERIFICACIÓN.
 *
 * El verificador emite su factura AL SUJETO OBLIGADO (es él quien contrata la
 * verificación), pero se la remitimos nosotros y somos quienes le pedimos que la
 * pague: hasta que no lo hace, el verificador no acepta encargos nuevos.
 *
 * REGLA — pedirlo una vez NO cierra la petición. Que se lo hayamos pedido no
 * significa que lo haya pagado, y si no paga hay que insistir: el sello no apaga
 * el botón, lo convierte en "volver a pedir" y el correo, en un recordatorio que
 * dice desde cuándo está pendiente. Sin esto el envío desaparecía de la pantalla
 * sin dejar rastro de que había salido. Mismo criterio que la reinsistencia del
 * parte diario.
 *
 * Un lote sin factura no se puede reclamar —no habría nada que adjuntar— y se
 * dice aparte, porque lo que falta ahí es subirla.
 *
 * REGLA — una factura ya PAGADA sale de la reclamación. Reclamar a quien ya pagó
 * es la peor forma de reclamar, y además desvirtúa el importe que anuncia el botón:
 * lo que se pide es lo que queda por cobrar, no todo lo facturado. El pago se marca
 * en la fila de la factura (fase 4), con o sin justificante.
 */
function pagoVerificacion(lotes, resumen) {
    const conFactura = [];
    const sinFactura = [];
    const pagadas = [];

    for (const l of lotes || []) {
        const f = facturaVerificadorDe(l);
        if (!f) { sinFactura.push(l); continue; }
        if (f.pagado_at) { pagadas.push({ lote: l, factura: f, pagadoAt: f.pagado_at }); continue; }
        conFactura.push({
            lote: l,
            factura: f,
            pedidoAt: f.pago_solicitado_at || null,
            pedidoA: f.pago_solicitado_to || null,
            veces: Number(f.pago_solicitado_veces) || 0,
        });
    }

    // El importe de cada factura: el que se leyó del PDF y, si esa factura se subió
    // antes de que la app supiera leerlo, el coste de verificación del lote —que es
    // la misma cifra tecleada a mano y la que ya sale en el resumen—. Sin este
    // respaldo el botón anunciaba 1.564 € donde había 6.447.
    const importeDe = (x) => Number(x.factura?.importe) || Number(x.lote?.coste_verificacion) || 0;
    for (const x of conFactura) x.importe = importeDe(x);
    const importe = conFactura.reduce((a, x) => a + x.importe, 0);

    const nuevos = conFactura.filter(x => !x.pedidoAt);
    const yaPedidos = conFactura.filter(x => x.pedidoAt);
    // Se reinsiste cuando NINGUNO está por pedir. Con mezcla —dos ya pedidos y uno
    // nuevo— sale el correo de siempre con los tres adjuntos: es un solo correo por
    // varios lotes, que es la razón de ser de esta petición.
    const reinsistencia = conFactura.length > 0 && nuevos.length === 0;
    const ultimaAt = yaPedidos.map(x => x.pedidoAt).sort().pop() || null;
    const dias = diasDesde(ultimaAt);
    const destinoPrevio = yaPedidos.map(x => x.pedidoA).find(Boolean) || null;

    return {
        id: 'pago_verificacion',
        aplicable: conFactura.length > 0,
        reinsistencia,
        ultimaAt,
        dias,
        destinoPrevio,
        // El botón dice a la vez QUÉ se pide y POR CUÁNTO: es lo que decide si se
        // manda hoy o se espera a que entre otro lote.
        etiqueta: (reinsistencia ? 'Volver a pedir el pago' : 'Pedir el pago de la verificación')
            + (importe > 0 ? ` · ${eur(importe)}` : ''),
        // Lo ya hecho, bajo el botón: sin esta línea, un envío que ya salió no
        // dejaba ninguna señal en la pantalla y no se sabía si había llegado a irse.
        nota: [
            ultimaAt
                ? `Pedido ${haceTexto(dias)} (${fmtFecha(ultimaAt)})${destinoPrevio ? ` a ${destinoPrevio}` : ''}`
                    + (yaPedidos.some(x => x.veces > 1) ? ' · ya recordado' : '')
                : null,
            // Lo ya cobrado se dice aquí: sin esta línea, un importe más bajo del
            // esperado parece un fallo del cálculo en vez de la mitad ya pagada.
            pagadas.length ? `${pagadas.length} ya pagada${pagadas.length === 1 ? '' : 's'}` : null,
        ].filter(Boolean).join(' · ') || null,
        titulo: reinsistencia
            ? 'Recordar al Sujeto Obligado el pago de la verificación'
            : 'Pedir al Sujeto Obligado el pago de la verificación',
        asunto: reinsistencia
            ? 'Recordatorio: facturas de verificación pendientes de pago'
            : 'Facturas de verificación pendientes de pago',
        etiquetaPill: 'Pago de la verificación',
        lotes: conFactura,
        nuevos,
        sinFactura,
        pagadas,
        yaPedidos,
        importe,
        bloqueo: conFactura.length ? null
            : pagadas.length && !sinFactura.length
                ? 'Las facturas del verificador de estos lotes ya están pagadas.'
                : 'Ninguno de estos lotes tiene subida la factura del verificador.',
        mensaje: ({ saludo }) => (reinsistencia
            ? mensajeRecordatorio({ saludo, conFactura, importe, ultimaAt })
            : mensajePagoVerificacion({ saludo, conFactura, resumen, importe })),
    };
}

// El texto que se manda. Editable antes de enviar, pero sale escrito: quien lo
// abre casi nunca lo cambia y tenerlo que redactar cada vez es lo que hace que un
// envío se posponga.
function mensajePagoVerificacion({ saludo, conFactura, resumen, importe }) {
    const codigos = conFactura.map(x => x.lote.codigo).filter(Boolean);
    const lista = codigos.length === 1
        ? `al lote ${codigos[0]}`
        : `a los lotes ${codigos.join(' · ')}`;

    return `${saludo}

En este correo adjunto las facturas que hay pendientes de pago al verificador correspondientes ${lista}.

A modo resumen:

- Ahorro total de los lotes: ${num(resumen?.ahorroGwh, 2)} GWh
- Coste de verificación: ${eur(importe)}
- Ahorro neto que va a suponer este conjunto de lotes (teniendo ya en cuenta los costes de verificación): ${eur(resumen?.ahorroSoTotal)}

Cuando podáis, haced el pago de estas facturas a la entidad verificadora para que podamos solicitar nuevos informes de verificación.

Próximos pasos:

Tenemos que subir a la plataforma del Ministerio ${codigos.length === 1 ? 'el lote' : `los ${codigos.length} lotes`}, así que os propongo ir un día de esta semana a vuestras instalaciones o la que viene por allí para dejarlo subido, o si lo preferís lo hacemos por ANYDESK.

Decidme qué días os viene mejor y me adapto a vuestra disponibilidad.

Un saludo,
BROKERGY · Ingeniería Energética`;
}

// El RECORDATORIO no puede ser el mismo correo otra vez: quien lo recibe ya lo ha
// leído, y lo que necesita saber es desde cuándo está pendiente y qué se frena
// mientras tanto. Las facturas se vuelven a adjuntar para que no tenga que ir a
// buscar el correo anterior.
function mensajeRecordatorio({ saludo, conFactura, importe, ultimaAt }) {
    const codigos = conFactura.map(x => x.lote.codigo).filter(Boolean);
    const lista = codigos.length === 1 ? `del lote ${codigos[0]}` : `de los lotes ${codigos.join(' · ')}`;

    return `${saludo}

Os escribo para recordaros que siguen pendientes de pago las facturas del verificador ${lista}, que os remití el ${fmtFecha(ultimaAt)}.

- Importe pendiente: ${eur(importe)}
- ${codigos.length === 1 ? 'Lote' : 'Lotes'}: ${codigos.join(' · ')}

Os las adjunto de nuevo para que las tengáis a mano. Hasta que no estén pagadas, la entidad verificadora no acepta encargos nuevos, así que es lo único que frena ahora mismo la tramitación de los lotes siguientes.

¿Podéis confirmarme si tienen ya fecha de pago prevista?

Un saludo,
BROKERGY · Ingeniería Energética`;
}

const PETICIONES = [pagoVerificacion];

/**
 * Peticiones que hoy se le pueden hacer al S.O. sobre estos lotes.
 * @param {Array} lotes    los que se están viendo (respetan el filtro de la lista)
 * @param {object} resumen `computeLotesResumen(lotes)` — sus cifras van en el correo
 */
export function peticionesDisponibles(lotes, resumen) {
    return PETICIONES.map(f => f(lotes, resumen));
}

/** La primera que se puede hacer, o null. Es la que propone el botón. */
export function peticionPrincipal(lotes, resumen) {
    return peticionesDisponibles(lotes, resumen).find(p => p.aplicable) || null;
}

export default { peticionesDisponibles, peticionPrincipal, facturaVerificadorDe };
