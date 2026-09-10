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

import { LOTE_ESTADOS } from '../loteConstants.js';

const eur = (n) => `${Number(n || 0).toLocaleString('es-ES', { maximumFractionDigits: 0 })} €`;

/**
 * ¿El lote sigue en el tramo en el que ESTA petición tiene sentido?
 *
 * `LOTE_ESTADOS` está en orden, así que el tramo se expresa por su último estado:
 * comparar posiciones es más honesto que enumerar los estados excluidos, que hay
 * que ampliar cada vez que se añade uno.
 */
const hastaEstado = (lote, ultimo) => {
    const i = LOTE_ESTADOS.indexOf(lote?.estado);
    const tope = LOTE_ESTADOS.indexOf(ultimo);
    // Un estado que no está en la lista (los migrados traen los suyos) no se
    // descarta: se prefiere ofrecer de más, que lo corrige una persona, a esconder
    // un lote que sí había que reclamar.
    return i < 0 || i <= tope;
};
const num = (n, d = 1) => Number(n || 0).toLocaleString('es-ES', { maximumFractionDigits: d });

/** La factura del verificador de un lote, si está subida. */
export const facturaVerificadorDe = (lote) =>
    (lote?.documentos_so || []).find(d => d?.key === 'factura_verificador') || null;

/**
 * ¿La verificación de este lote ya se ha HECHO?
 *
 * Es lo que decide si le corresponde una factura del verificador. Se mira por el
 * HECHO —el informe o el dictamen están subidos— y no por el estado, que se mueve
 * a mano y en los lotes anteriores a la app no describe este tramo.
 */
const haVerificado = (lote) => (lote?.documentos_so || [])
    .some(d => (d?.key === 'informe_verificacion' || d?.key === 'dictamen_favorable')
        && (d.draft_link || d.draft_file_id || d.signed_link));

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
        // REGLA — un lote al que todavía NO le toca no se cuenta ni se nombra. El
        // verificador factura cuando ha verificado: listar como "se queda fuera" un
        // lote que aún está esperando la oferta —o uno de antes de la app, ya
        // cobrado— llena de ruido justo la caja que hay que mirar antes de pedir
        // dinero. Mismo criterio que `soloSiExiste` en el índice del paquete.
        if (!haVerificado(l)) continue;
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
        // Cómo se llama lo que viaja: el popup y el acuse del envío lo dicen por su
        // nombre ("3 facturas a jesus@…"), y con un sustantivo genérico el mismo
        // acuse valdría para cualquier cosa.
        sustantivo: { sing: 'factura', plur: 'facturas' },
        // Lo que se adjunta, una línea por lote. Vive AQUÍ y no en el popup: es
        // parte de lo que la petición decide, y el popup es el mismo para todas.
        docs: conFactura.map(x => ({
            key: x.lote.id,
            label: `${x.lote.codigo} · ${x.factura?.numero_factura || 'Factura del verificador'}`,
            detail: [
                x.importe ? eur(x.importe) : null,
                x.pedidoAt ? `pedido el ${fmtFecha(x.pedidoAt)}${x.veces > 1 ? ` · ${x.veces} veces` : ''}` : null,
            ].filter(Boolean).join(' · ') || null,
        })),
        // Y los que se QUEDAN FUERA, con su motivo: callarlo es peor que excluirlos
        // —se manda el correo creyendo que van los cuatro—.
        fuera: sinFactura.length ? {
            lotes: sinFactura,
            resumen: `${sinFactura.map(l => l.codigo).join(', ')} (sin factura)`,
            aviso: `${sinFactura.length === 1 ? 'no tiene' : 'no tienen'} subida la factura del verificador,`
                + ' así que no hay nada que adjuntar. Súbela en su fase 4 y vuelve a entrar si quieres'
                + ' reclamarla en este mismo correo.',
        } : null,
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

/** La oferta de verificación de un lote, si está subida. */
export const ofertaDe = (lote) =>
    (lote?.documentos_so || []).find(d => d?.key === 'oferta_verificacion') || null;

/**
 * FIRMA DE LAS OFERTAS DE VERIFICACIÓN.
 *
 * El verificador manda su oferta lote a lote, y el SUJETO OBLIGADO es quien tiene
 * que firmarla —es él quien contrata la verificación—. Hasta que no vuelven
 * firmadas, el verificador no arranca, así que son cuatro trámites idénticos
 * bloqueando cuatro lotes a la vez.
 *
 * Hasta ahora solo se podían mandar de una en una, desde la fase 3 de cada lote:
 * cuatro correos iguales el mismo día, que es la forma de que no conteste a
 * ninguno. Esta petición hace lo mismo que la del pago —UN correo con las cuatro
 * ofertas adjuntas y el resumen delante— porque es exactamente el mismo gesto.
 *
 * REGLA — una oferta ya FIRMADA sale de la petición. Pedir que firme lo que ya ha
 * firmado hace dudar de si su firma llegó, y lo siguiente es que la mande otra vez.
 * Y un lote SIN oferta subida se queda fuera y se dice: lo que falta ahí es
 * pedírsela al verificador, no al S.O.
 *
 * REGLA — pedirlo una vez NO cierra la petición, igual que el pago: el sello
 * convierte el botón en "volver a pedir" y el correo en un recordatorio.
 */
function firmaOfertas(lotes) {
    const pendientes = [];
    const sinOferta = [];
    const firmadas = [];

    for (const l of lotes || []) {
        // REGLA — un lote que YA PASÓ de aquí no entra, ni siquiera para decir que
        // le falta. Medido el 10/09/2026: LOTE-2025-002 y 003, ya SUBIDOS A MITECO,
        // tienen su oferta sin `signed_link` (se firmó fuera de la app, o no se
        // registró) y la petición proponía pedirle al S.O. que firmara la oferta de
        // un lote presentado hace meses. Y en el "se quedan fuera" salían seis
        // lotes, entre ellos uno ya cobrado: un aviso que aparece siempre y nunca
        // hay que atender es el que enseña a ignorar la lista entera.
        if (!hastaEstado(l, 'PTE. FIRMA OFERTA S.O.')) continue;
        const o = ofertaDe(l);
        if (!o || !(o.draft_link || o.draft_file_id)) { sinOferta.push(l); continue; }
        if (o.signed_link) { firmadas.push({ lote: l, oferta: o }); continue; }
        pendientes.push({
            lote: l,
            oferta: o,
            pedidoAt: o.sent_at || null,
            pedidoA: o.firma_solicitada_to || null,
            veces: Number(o.firma_solicitada_veces) || 0,
        });
    }

    const nuevos = pendientes.filter(x => !x.pedidoAt);
    const yaPedidos = pendientes.filter(x => x.pedidoAt);
    const reinsistencia = pendientes.length > 0 && nuevos.length === 0;
    const ultimaAt = yaPedidos.map(x => x.pedidoAt).sort().pop() || null;
    const dias = diasDesde(ultimaAt);
    const destinoPrevio = yaPedidos.map(x => x.pedidoA).find(Boolean) || null;
    const codigos = pendientes.map(x => x.lote.codigo).filter(Boolean);

    return {
        id: 'firma_ofertas',
        aplicable: pendientes.length > 0,
        reinsistencia,
        ultimaAt,
        dias,
        destinoPrevio,
        // El botón dice CUÁNTAS son: es lo que decide si se manda hoy o se espera a
        // que llegue la oferta del lote que falta.
        etiqueta: (reinsistencia ? 'Volver a pedir la firma' : 'Pedir la firma de las ofertas')
            + ` · ${pendientes.length}`,
        nota: [
            ultimaAt
                ? `Pedido ${haceTexto(dias)} (${fmtFecha(ultimaAt)})${destinoPrevio ? ` a ${destinoPrevio}` : ''}`
                    + (yaPedidos.some(x => x.veces > 1) ? ' · ya recordado' : '')
                : null,
            firmadas.length ? `${firmadas.length} ya firmada${firmadas.length === 1 ? '' : 's'}` : null,
        ].filter(Boolean).join(' · ') || null,
        titulo: reinsistencia
            ? 'Recordar al Sujeto Obligado la firma de las ofertas'
            : 'Pedir al Sujeto Obligado que firme las ofertas de verificación',
        asunto: reinsistencia
            ? 'Recordatorio: ofertas de verificación pendientes de firma'
            : 'Ofertas de verificación para firma',
        etiquetaPill: 'Firma de las ofertas',
        lotes: pendientes,
        nuevos,
        yaPedidos,
        firmadas,
        sustantivo: { sing: 'oferta', plur: 'ofertas' },
        docs: pendientes.map(x => ({
            key: x.lote.id,
            label: `${x.lote.codigo} · ${x.oferta?.file_name || 'Oferta de verificación'}`,
            detail: [
                x.lote.n_expedientes ? `${x.lote.n_expedientes} actuaciones` : null,
                x.pedidoAt ? `pedido el ${fmtFecha(x.pedidoAt)}${x.veces > 1 ? ` · ${x.veces} veces` : ''}` : null,
            ].filter(Boolean).join(' · ') || null,
        })),
        fuera: sinOferta.length ? {
            lotes: sinOferta,
            resumen: `${sinOferta.map(l => l.codigo).join(', ')} (sin oferta)`,
            aviso: `${sinOferta.length === 1 ? 'no tiene' : 'no tienen'} subida la oferta del verificador.`
                + ' Eso se le pide al VERIFICADOR, no al S.O.: súbela en su fase 3 y vuelve a entrar'
                + ' si quieres mandarla en este mismo correo.',
        } : null,
        bloqueo: pendientes.length ? null
            : firmadas.length && !sinOferta.length
                ? 'Las ofertas de verificación de estos lotes ya están firmadas.'
                : 'Ninguno de estos lotes tiene subida la oferta del verificador.',
        mensaje: ({ saludo }) => (reinsistencia
            ? mensajeRecordatorioOfertas({ saludo, codigos, ultimaAt })
            : mensajeFirmaOfertas({ saludo, codigos })),
    };
}

function mensajeFirmaOfertas({ saludo, codigos }) {
    const lista = codigos.length === 1
        ? `la oferta de verificación del lote ${codigos[0]}`
        : `las ${codigos.length} ofertas de verificación de los lotes ${codigos.join(' · ')}`;

    return `${saludo}

Os adjunto ${lista}, que ha emitido la entidad verificadora.

${codigos.length === 1 ? 'Lote' : 'Lotes'}: ${codigos.join(' · ')}

Necesitamos que ${codigos.length === 1 ? 'la firméis' : 'las firméis'} y ${codigos.length === 1 ? 'nos la devolváis' : 'nos las devolváis'}: la verificación no arranca hasta que ${codigos.length === 1 ? 'la oferta esté firmada' : 'las ofertas estén firmadas'}, y con ${codigos.length === 1 ? 'ella' : 'ellas'} en la mano el verificador ya puede ponerse con ${codigos.length === 1 ? 'el lote' : 'los lotes'}.

Podéis ${codigos.length === 1 ? 'devolvérnosla' : 'devolvérnoslas'} firmada${codigos.length === 1 ? '' : 's'} en este mismo correo.

Un saludo,
BROKERGY · Ingeniería Energética`;
}

function mensajeRecordatorioOfertas({ saludo, codigos, ultimaAt }) {
    const lista = codigos.length === 1 ? `del lote ${codigos[0]}` : `de los lotes ${codigos.join(' · ')}`;

    return `${saludo}

Os escribo para recordaros que siguen pendientes de firma las ofertas de verificación ${lista}, que os remití el ${fmtFecha(ultimaAt)}.

- ${codigos.length === 1 ? 'Lote' : 'Lotes'}: ${codigos.join(' · ')}

Os ${codigos.length === 1 ? 'la adjunto' : 'las adjunto'} de nuevo para que ${codigos.length === 1 ? 'la tengáis' : 'las tengáis'} a mano. Hasta que no ${codigos.length === 1 ? 'esté firmada' : 'estén firmadas'}, la entidad verificadora no arranca con ${codigos.length === 1 ? 'ese lote' : 'esos lotes'}, así que es lo único que frena ahora mismo la tramitación.

¿Podéis confirmarme si ${codigos.length === 1 ? 'podéis firmarla' : 'podéis firmarlas'} esta semana?

Un saludo,
BROKERGY · Ingeniería Energética`;
}

// El ORDEN es el de prioridad: la firma de las ofertas va primero porque bloquea
// el arranque de la verificación, mientras que el pago se reclama con el trabajo
// ya hecho.
const PETICIONES = [firmaOfertas, pagoVerificacion];

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

/**
 * TODAS las que hoy se pueden hacer, en orden de prioridad.
 *
 * Con una sola petición el cuadro de mando pintaba un botón; ahora pueden coincidir
 * dos —firmar las ofertas de unos lotes y reclamar el pago de otros— y esconder la
 * segunda detrás de la primera obliga a resolver una para descubrir que había otra.
 */
export function peticionesAplicables(lotes, resumen) {
    return peticionesDisponibles(lotes, resumen).filter(p => p.aplicable);
}

export default { peticionesDisponibles, peticionPrincipal, peticionesAplicables, facturaVerificadorDe, ofertaDe };
