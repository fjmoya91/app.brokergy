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

/**
 * PAGO DE LA VERIFICACIÓN.
 *
 * El verificador emite su factura AL SUJETO OBLIGADO (es él quien contrata la
 * verificación), pero se la remitimos nosotros y somos quienes le pedimos que la
 * pague: hasta que no lo hace, el verificador no acepta encargos nuevos.
 *
 * Se puede pedir cuando hay al menos una factura subida y sin pago solicitado.
 * Un lote sin factura no se puede reclamar —no habría nada que adjuntar— y se
 * dice aparte, porque lo que falta ahí es subirla.
 */
function pagoVerificacion(lotes, resumen) {
    const conFactura = [];
    const sinFactura = [];
    const yaPedidos = [];

    for (const l of lotes || []) {
        const f = facturaVerificadorDe(l);
        if (!f) { sinFactura.push(l); continue; }
        if (f.pago_solicitado_at) { yaPedidos.push({ lote: l, factura: f }); continue; }
        conFactura.push({ lote: l, factura: f });
    }

    // El importe de cada factura: el que se leyó del PDF y, si esa factura se subió
    // antes de que la app supiera leerlo, el coste de verificación del lote —que es
    // la misma cifra tecleada a mano y la que ya sale en el resumen—. Sin este
    // respaldo el botón anunciaba 1.564 € donde había 6.447.
    const importeDe = (x) => Number(x.factura?.importe) || Number(x.lote?.coste_verificacion) || 0;
    for (const x of conFactura) x.importe = importeDe(x);
    const importe = conFactura.reduce((a, x) => a + x.importe, 0);
    return {
        id: 'pago_verificacion',
        aplicable: conFactura.length > 0,
        // El botón dice a la vez QUÉ se pide y POR CUÁNTO: es lo que decide si se
        // manda hoy o se espera a que entre otro lote.
        etiqueta: importe > 0
            ? `Pedir el pago de la verificación · ${eur(importe)}`
            : 'Pedir el pago de la verificación',
        titulo: 'Pedir al Sujeto Obligado el pago de la verificación',
        asunto: 'Facturas de verificación pendientes de pago',
        etiquetaPill: 'Pago de la verificación',
        lotes: conFactura,
        sinFactura,
        yaPedidos,
        importe,
        // Motivo por el que NO se puede pedir, para decirlo en vez de callar.
        bloqueo: conFactura.length ? null
            : (yaPedidos.length ? 'Ya se ha pedido el pago de todas las facturas.'
                : 'Ninguno de estos lotes tiene subida la factura del verificador.'),
        mensaje: ({ saludo }) => mensajePagoVerificacion({ saludo, conFactura, resumen, importe }),
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
