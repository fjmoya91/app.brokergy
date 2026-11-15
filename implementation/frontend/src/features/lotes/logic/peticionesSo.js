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
import { EQUIVALENCIA_FINANCIERA } from '../../calculator/logic/calculation.js';
import { ahorroSoFactura } from './mensajeFacturaSo.js';
import { computeFacturaAmounts, defaultPrecioKwh } from './facturaSoImportes.js';

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
            importe: Number(o.importe) > 0 ? Number(o.importe) : null,
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
    // El PRECIO de cada oferta es el dato por el que el S.O. decide si firma. Sin él
    // el correo le pide firmar cuatro papeles sin decirle cuánto cuesta ninguno, y
    // tiene que abrir los cuatro PDF para saberlo. Los que falten se piden ANTES de
    // abrir el envío y se guardan en su lote — así el correo siguiente ya los trae.
    const faltanImporte = pendientes.filter(x => x.importe == null);

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
        faltanImporte,
        // El importe se escribe donde vive: en el documento del lote.
        campoImporte: { key: 'oferta_verificacion', label: 'Precio de la oferta' },
        sustantivo: { sing: 'oferta', plur: 'ofertas' },
        docs: pendientes.map(x => ({
            key: x.lote.id,
            // Lo que hay que comprobar antes de mandar un correo que pide una firma
            // es QUÉ se firma y POR CUÁNTO: el precio va en la línea, no escondido.
            label: `${x.lote.codigo}${x.importe != null ? ` · ${eur(x.importe)}` : ''}`,
            detail: [
                x.importe == null ? '⚠ sin precio' : null,
                x.oferta?.file_name || 'Oferta de verificación',
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
        // `precios` son los que se acaban de teclear en el popup, que todavía no
        // han vuelto de la base de datos. Sin ellos el correo saldría sin la cifra
        // que se acaba de introducir, que es justo por lo que se pidió.
        mensaje: ({ saludo, precios = {} }) => {
            const lineas = pendientes.map(x => ({
                codigo: x.lote.codigo,
                importe: precios[x.lote.id] != null ? Number(precios[x.lote.id]) : x.importe,
            }));
            return reinsistencia
                ? mensajeRecordatorioOfertas({ saludo, lineas, ultimaAt })
                : mensajeFirmaOfertas({ saludo, lineas });
        },
    };
}

/**
 * El desglose por lote. Va SIEMPRE que se sepa algún precio, y el total solo
 * cuando se saben TODOS: un total al que le falta un sumando es peor que no
 * ponerlo, porque quien lo lee lo da por bueno.
 */
function desglose(lineas) {
    const conPrecio = lineas.filter(l => l.importe != null);
    if (!conPrecio.length) return lineas.map(l => `- ${l.codigo}`).join('\n');
    const filas = lineas.map(l => `- ${l.codigo}: ${l.importe != null ? eur(l.importe) : 'precio por confirmar'}`);
    if (conPrecio.length === lineas.length && lineas.length > 1) {
        filas.push(`- TOTAL: ${eur(conPrecio.reduce((a, l) => a + l.importe, 0))}`);
    }
    return filas.join('\n');
}

function mensajeFirmaOfertas({ saludo, lineas }) {
    const n = lineas.length;
    const una = n === 1;
    const lista = una
        ? `la oferta de verificación del lote ${lineas[0].codigo}`
        : `las ${n} ofertas de verificación de la entidad verificadora`;

    return `${saludo}

Os adjunto ${lista}${una ? ', que ha emitido la entidad verificadora' : ''}:

${desglose(lineas)}

Necesitamos que ${una ? 'la firméis' : 'las firméis'} y ${una ? 'nos la devolváis' : 'nos las devolváis'}: la verificación no arranca hasta que ${una ? 'la oferta esté firmada' : 'las ofertas estén firmadas'}, y con ${una ? 'ella' : 'ellas'} en la mano el verificador ya puede ponerse con ${una ? 'el lote' : 'los lotes'}.

Podéis ${una ? 'devolvérnosla' : 'devolvérnoslas'} firmada${una ? '' : 's'} en este mismo correo.

Un saludo,
BROKERGY · Ingeniería Energética`;
}

function mensajeRecordatorioOfertas({ saludo, lineas, ultimaAt }) {
    const una = lineas.length === 1;

    return `${saludo}

Os escribo para recordaros que ${una ? 'sigue pendiente' : 'siguen pendientes'} de firma ${una ? 'la oferta de verificación' : 'las ofertas de verificación'} que os remití el ${fmtFecha(ultimaAt)}:

${desglose(lineas)}

Os ${una ? 'la adjunto' : 'las adjunto'} de nuevo para que ${una ? 'la tengáis' : 'las tengáis'} a mano. Hasta que no ${una ? 'esté firmada' : 'estén firmadas'}, la entidad verificadora no arranca con ${una ? 'ese lote' : 'esos lotes'}, así que es lo único que frena ahora mismo la tramitación.

¿Podéis confirmarme si ${una ? 'podéis firmarla' : 'podéis firmarlas'} esta semana?

Un saludo,
BROKERGY · Ingeniería Energética`;
}

// Cifras para el correo con el formato español escrito a mano: `toLocaleString`
// no agrupa los números de cuatro cifras ("4883 €") y en Node depende del ICU.
function numEs(n, d = 0) {
    const v = Number(n || 0);
    const [ent, dec] = Math.abs(v).toFixed(d).split('.');
    return `${v < 0 ? '-' : ''}${ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}${dec ? `,${dec}` : ''}`;
}

/** El certificado CAE emitido de un lote (la resolución de inscripción), si está subido. */
export const certificadoCaeDe = (lote) =>
    (lote?.documentos_so || []).find(d => d?.key === 'certificado_cae') || null;

/**
 * La factura de CAE que se GENERARÍA hoy para un lote, con lo mismo que rellena
 * `FacturaSoModal` al abrirla: los códigos y el total del CERTIFICADO (1 CAE = 1 kWh)
 * y el precio de la oferta del lote; lo ya escrito en su borrador manda. `falta` dice
 * lo que impide generarla sin una persona delante (05/11/2026, Fran: «¿no hay un
 * botón para generar las 5 a la vez y enviarlas?»).
 */
export function borradorFacturaCae(lote) {
    const c = certificadoCaeDe(lote)?.cae || {};
    const prev = lote?.factura_so || {};
    const conCodigos = !!(prev.cae_inicial || prev.cae_final);
    const caeInicial = String(prev.cae_inicial || c.cae_inicial || '').trim();
    const caeFinal = String(prev.cae_final || c.cae_final || '').trim();
    const unidadesKwh = Math.round(Number(conCodigos && prev.unidades_kwh ? prev.unidades_kwh : c.total) || 0);
    const precioKwh = Number(prev.precio_kwh) || defaultPrecioKwh(lote);
    const { base, iva, total } = computeFacturaAmounts({ unidadesKwh, precioKwh });
    // El rango de códigos y las unidades tienen que cuadrar (lo avisa también el popup
    // de una factura): si no, se genera a mano, mirándolo.
    const serie = (s) => { const m = String(s || '').match(/CAE_(\d+)_/i); return m ? parseInt(m[1], 10) : null; };
    const a = serie(caeInicial), b = serie(caeFinal);
    const enRango = a != null && b != null ? Math.abs(b - a) + 1 : null;
    const falta = [
        !caeInicial || !caeFinal ? 'los códigos CAE del certificado' : null,
        !(unidadesKwh > 0) ? 'el nº de CAE del certificado' : null,
        !(precioKwh > 0) ? 'el precio (la oferta del lote)' : null,
        enRango != null && unidadesKwh > 0 && enRango !== unidadesKwh ? `que cuadren los códigos (${numEs(enRango)}) con las unidades (${numEs(unidadesKwh)})` : null,
    ].filter(Boolean);
    return {
        numero: prev.numero ? String(prev.numero).trim() : null,
        caeInicial, caeFinal, unidadesKwh, precioKwh, base, iva, total, falta,
    };
}

/**
 * NUESTRAS FACTURAS de venta de los CAE (05/11/2026, Fran: «enviarlas todas a la
 * vez, con lo que les hemos ahorrado y el enlace del panel»).
 *
 * Cuando llegan las resoluciones de inscripción llegan varias juntas (el 05/11/2026,
 * cinco de golpe), y se trabaja igual que con las del verificador: UN correo con
 * todas las facturas adjuntas y el resumen delante.
 *
 * REGLA — solo entra un lote con los CAE EMITIDOS (su certificado subido): antes no
 * hay nada que facturar, y no se nombra.
 * REGLA — la factura tiene que estar GENERADA (con su número y su PDF en Drive): el
 * correo adjunta el PDF que ya está archivado en contabilidad, no uno que se rehace
 * al vuelo con otro número. La que falta y se puede sacar del certificado y de la
 * oferta va a `porGenerar`: el botón pasa a «Generar y enviar» y el popup las genera
 * PRIMERO, enseñando cada una antes (05/11/2026). La que no (sin códigos, sin precio
 * o con un rango que no cuadra) se queda FUERA y se dice por qué.
 * REGLA — una factura ya COBRADA sale del envío: reclamar a quien ya pagó es la peor
 * forma de reclamar.
 * REGLA — el sello va en el CERTIFICADO del lote (`factura_enviada_*`), porque la
 * fila de `facturas_so` no tiene dónde, y como en las otras dos no apaga el botón:
 * lo convierte en "volver a enviar" y el correo en un recordatorio.
 *
 * El correo dice A CUÁNTO LE SALE EL CAE (nuestra factura sin IVA + la verificación,
 * que contrata él) frente a la equivalencia financiera, y el ahorro neto: es la cifra
 * que se quiere que vea. Y lleva el ENLACE de su panel (`/so/:token`), que el popup
 * busca y pasa al mensaje (`enlacePanel`).
 */
// REGLA — UN correo por S.O.: el botón actúa sobre lo filtrado, que puede mezclar
// varios, y una factura de IBERDROLA no puede viajar en el correo a INTERALCO
// (medido el 05/11/2026: el PAQUETE 2 - 2023 se colaba en el de Jesús). Sale una
// petición por S.O., cada una con su nombre en el botón.
function facturasCae(lotes) {
    const porSo = new Map();
    for (const l of lotes || []) {
        if (!certificadoCaeDe(l)) continue;
        const id = String(l?.sujeto_obligado_id || l?.sujeto_obligado?.id_empresa || '');
        if (!porSo.has(id)) porSo.set(id, []);
        porSo.get(id).push(l);
    }
    const grupos = [...porSo.values()].map(facturasCaeDeUnSo).filter(p => p.aplicable);
    return grupos.length ? grupos : [facturasCaeDeUnSo([])];
}

export function facturasCaeDeUnSo(lotes) {
    const conFactura = [];
    const sinFactura = [];
    const porGenerar = [];
    const pagadas = [];
    const so = (lotes || []).map(l => l?.sujeto_obligado).find(Boolean) || null;
    const nombreSo = so?.acronimo || so?.razon_social || null;

    for (const l of lotes || []) {
        const cert = certificadoCaeDe(l);
        if (!cert) continue;
        const f = l?.factura_so || null;
        if (f?.estado === 'PAGADA') { pagadas.push({ lote: l, factura: f }); continue; }
        const generada = f?.numero && (f.drive_file_id || f.drive_link);
        // Sin factura, solo cuenta el lote que AÚN espera el pago del S.O.: uno que ya
        // pasó a pagar a los clientes (los de antes de la app) se cobró fuera de aquí,
        // y nombrarlo como «sin factura» es el aviso que enseña a ignorar la lista.
        if (!generada) {
            if (!hastaEstado(l, 'CAE EMITIDO – PTE PAGO BROKERGY')) continue;
            const borrador = borradorFacturaCae(l);
            if (borrador.falta.length) sinFactura.push(l);
            else porGenerar.push({ lote: l, cert, borrador, importe: borrador.total });
            continue;
        }
        const verif = Number(l?.coste_verificacion) || 0;
        conFactura.push({
            lote: l,
            factura: f,
            cert,
            verif,
            ahorro: ahorroSoFactura({
                unidadesKwh: f.unidades_kwh, base: f.base,
                costeVerif: verif, equivalencia: EQUIVALENCIA_FINANCIERA,
            }),
            importe: Number(f.total) || 0,
            pedidoAt: cert.factura_enviada_at || null,
            pedidoA: cert.factura_enviada_to || null,
            veces: Number(cert.factura_enviada_veces) || 0,
        });
    }

    const importe = conFactura.reduce((a, x) => a + x.importe, 0);
    const importePorGenerar = porGenerar.reduce((a, x) => a + x.importe, 0);
    const nuevos = conFactura.filter(x => !x.pedidoAt);
    const yaPedidos = conFactura.filter(x => x.pedidoAt);
    const reinsistencia = conFactura.length > 0 && nuevos.length === 0 && porGenerar.length === 0;
    const ultimaAt = yaPedidos.map(x => x.pedidoAt).sort().pop() || null;
    const dias = diasDesde(ultimaAt);
    const destinoPrevio = yaPedidos.map(x => x.pedidoA).find(Boolean) || null;
    const resumen = resumenAhorroCae(conFactura);

    return {
        id: 'facturas_cae',
        // Una por S.O.: el id es el de la ruta, la clave distingue los botones.
        clave: `facturas_cae:${so?.id_empresa || (lotes || [])[0]?.sujeto_obligado_id || ''}`,
        aplicable: conFactura.length > 0 || porGenerar.length > 0,
        reinsistencia,
        ultimaAt,
        dias,
        destinoPrevio,
        etiqueta: (reinsistencia ? 'Volver a enviar nuestras facturas'
            : porGenerar.length ? 'Generar y enviar nuestras facturas de CAE' : 'Enviar nuestras facturas de CAE')
            + (nombreSo ? ` a ${nombreSo}` : '')
            + (importe + importePorGenerar > 0 ? ` · ${eur(importe + importePorGenerar)}` : ''),
        nota: [
            porGenerar.length ? `${porGenerar.length} por generar` : null,
            ultimaAt
                ? `Enviadas ${haceTexto(dias)} (${fmtFecha(ultimaAt)})${destinoPrevio ? ` a ${destinoPrevio}` : ''}`
                    + (yaPedidos.some(x => x.veces > 1) ? ' · ya recordado' : '')
                : null,
            pagadas.length ? `${pagadas.length} ya cobrada${pagadas.length === 1 ? '' : 's'}` : null,
        ].filter(Boolean).join(' · ') || null,
        titulo: reinsistencia
            ? 'Recordar al Sujeto Obligado el pago de nuestras facturas'
            : 'Enviar al Sujeto Obligado nuestras facturas de los CAE emitidos',
        asunto: reinsistencia
            ? 'Recordatorio: facturas de CAE pendientes de pago'
            : 'Facturas de los CAE emitidos',
        etiquetaPill: 'Facturas de los CAE',
        // El popup busca el enlace del panel del S.O. y lo pasa al mensaje.
        conEnlacePanel: true,
        lotes: conFactura,
        nuevos,
        sinFactura,
        // Las que el popup genera ANTES de escribir el correo (`borradorFacturaCae`),
        // y todos los lotes del S.O., para rehacer la petición con ellas ya generadas.
        porGenerar,
        todosLotes: lotes || [],
        pagadas,
        yaPedidos,
        importe,
        resumen,
        sustantivo: { sing: 'factura', plur: 'facturas' },
        docs: conFactura.map(x => ({
            key: x.lote.id,
            label: `${x.lote.codigo} · ${x.factura.numero}`,
            detail: [
                `${numEs(x.factura.unidades_kwh)} CAE`,
                x.importe ? `${numEs(x.importe, 2)} € con IVA` : null,
                x.verif ? null : '⚠ sin el coste de verificación',
                x.pedidoAt ? `enviada el ${fmtFecha(x.pedidoAt)}${x.veces > 1 ? ` · ${x.veces} veces` : ''}` : null,
            ].filter(Boolean).join(' · ') || null,
        })),
        fuera: sinFactura.length ? {
            lotes: sinFactura,
            resumen: `${sinFactura.map(l => l.codigo).join(', ')} (sin factura)`,
            aviso: `${sinFactura.length === 1 ? 'tiene' : 'tienen'} los CAE emitidos pero no se puede generar su factura sin mirarla`
                + ` (falta ${sinFactura.map(l => `${l.codigo}: ${borradorFacturaCae(l).falta.join(', ')}`).join('; ')}).`
                + ' Ábrela en su lote («Generar la factura de Brokergy al S.O.» → «Generar y guardar»)'
                + ' y vuelve a entrar si quieres mandarla en este mismo correo.',
        } : null,
        bloqueo: conFactura.length || porGenerar.length ? null
            : pagadas.length && !sinFactura.length
                ? 'Las facturas de estos lotes ya están cobradas.'
                : 'Ninguno de estos lotes con los CAE emitidos tiene la factura generada.',
        mensaje: ({ saludo, enlacePanel = null }) => (reinsistencia
            ? mensajeRecordatorioFacturasCae({ saludo, conFactura, importe, ultimaAt, enlacePanel })
            : mensajeFacturasCae({ saludo, conFactura, resumen, importe, enlacePanel })),
    };
}

/**
 * A cuánto le sale el CAE al S.O. con estos lotes y cuánto se ahorra frente a la
 * equivalencia financiera. Solo con los lotes cuya verificación ya está facturada:
 * sin ella el €/MWh saldría más bajo de lo que de verdad le cuesta.
 */
export function resumenAhorroCae(conFactura) {
    const con = (conFactura || []).filter(x => x.ahorro && x.verif > 0);
    if (!con.length) return null;
    const mwh = con.reduce((a, x) => a + x.ahorro.mwh, 0);
    const coste = con.reduce((a, x) => a + x.ahorro.coste, 0);
    const alternativa = con.reduce((a, x) => a + x.ahorro.alternativa, 0);
    return {
        mwh, coste, alternativa,
        ahorro: alternativa - coste,
        costeMwh: mwh > 0 ? coste / mwh : null,
        equivalencia: EQUIVALENCIA_FINANCIERA,
        nLotes: con.length,
        completo: con.length === (conFactura || []).length,
    };
}

function lineasFacturasCae(conFactura) {
    const filas = conFactura.map(x => {
        const f = x.factura;
        const codigos = f.cae_inicial && f.cae_final ? ` (del ${f.cae_inicial} al ${f.cae_final})` : '';
        return `- ${x.lote.codigo} · factura ${f.numero}: ${numEs(f.unidades_kwh)} CAE${codigos} · ${numEs(x.importe, 2)} €`;
    });
    if (conFactura.length > 1) {
        const cae = conFactura.reduce((a, x) => a + (Number(x.factura.unidades_kwh) || 0), 0);
        const total = conFactura.reduce((a, x) => a + x.importe, 0);
        filas.push(`- TOTAL: ${numEs(cae)} CAE · ${numEs(total, 2)} €`);
    }
    return filas.join('\n');
}

const parrafoPanel = (enlacePanel) => (enlacePanel ? `

Además, os he preparado un panel en el que podéis consultar en todo momento, y en tiempo real, cómo van vuestros lotes y cuánto os queda por cubrir de la obligación:
${enlacePanel}` : '');

function mensajeFacturasCae({ saludo, conFactura, resumen, importe, enlacePanel }) {
    const codigos = conFactura.map(x => x.lote.codigo).filter(Boolean);
    const una = codigos.length === 1;
    const lista = una ? `del lote ${codigos[0]}` : `de los lotes ${codigos.join(' · ')}`;

    // Solo el AHORRO, no a cuánto le sale el CAE (Fran, 05/11/2026: «de momento que
    // no vea a cuánto está pagando el CAE»). Mismo criterio que su panel.
    const bloqueAhorro = resumen?.ahorro > 0 ? `

Trabajar con BROKERGY ${una ? 'en este lote' : 'en este conjunto de lotes'} os ha supuesto un ahorro neto de ${numEs(resumen.ahorro)} € frente a aportar ese ahorro energético al Fondo Nacional de Eficiencia Energética, ya descontado el coste de la verificación${resumen.completo ? '' : ` (calculado sobre los ${resumen.nLotes} lotes con la verificación ya facturada)`}.` : '';

    return `${saludo}

Os adjunto ${una ? 'la factura' : `las ${codigos.length} facturas`} de la venta de los ahorros energéticos ${lista}, cuyos Certificados de Ahorro Energético (CAE) ya están inscritos en el Registro Nacional:

${lineasFacturasCae(conFactura)}

Importes con el IVA (21 %) incluido.${bloqueAhorro}${parrafoPanel(enlacePanel)}

Cuando podáis, haced el pago por transferencia a la cuenta indicada en ${una ? 'la factura' : 'cada factura'}${importe > 0 && !una ? ` (${numEs(importe, 2)} € en total)` : ''}. Quedamos a vuestra disposición para cualquier aclaración.

Un saludo,
BROKERGY · Ingeniería Energética`;
}

function mensajeRecordatorioFacturasCae({ saludo, conFactura, importe, ultimaAt, enlacePanel }) {
    const una = conFactura.length === 1;

    return `${saludo}

Os escribo para recordaros que ${una ? 'sigue pendiente de pago la factura' : 'siguen pendientes de pago las facturas'} de los CAE emitidos que os remití el ${fmtFecha(ultimaAt)}:

${lineasFacturasCae(conFactura)}

Os ${una ? 'la adjunto' : 'las adjunto'} de nuevo para que ${una ? 'la tengáis' : 'las tengáis'} a mano${importe > 0 ? `: ${numEs(importe, 2)} € en total, IVA incluido` : ''}. Con el pago podemos liquidar a los propietarios que os han cedido el ahorro.${parrafoPanel(enlacePanel)}

¿Podéis confirmarme si ${una ? 'tiene' : 'tienen'} ya fecha de pago prevista?

Un saludo,
BROKERGY · Ingeniería Energética`;
}

// El ORDEN es el de prioridad: la firma de las ofertas va primero porque bloquea
// el arranque de la verificación; luego nuestras facturas (es lo que cobramos y lo
// que libera el pago a los clientes) y el pago del verificador, con el trabajo
// ya hecho.
const PETICIONES = [firmaOfertas, facturasCae, pagoVerificacion];

/**
 * Peticiones que hoy se le pueden hacer al S.O. sobre estos lotes.
 * @param {Array} lotes    los que se están viendo (respetan el filtro de la lista)
 * @param {object} resumen `computeLotesResumen(lotes)` — sus cifras van en el correo
 */
export function peticionesDisponibles(lotes, resumen) {
    // Una petición puede devolver VARIAS (nuestras facturas: una por S.O.).
    return PETICIONES.flatMap(f => f(lotes, resumen));
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

export default { peticionesDisponibles, peticionPrincipal, peticionesAplicables, facturaVerificadorDe, ofertaDe, certificadoCaeDe };
