// ============================================================================
// cobroForm.js — FUENTE ÚNICA del formulario de CONFIRMACIÓN DE COBRO.
// ----------------------------------------------------------------------------
// Lo que se le pasa al cliente cuando su CAE está concedido y vamos a ingresarle
// el bono. Sustituye al formulario de Tally ("⚡ Confirmación de Datos de Pago y
// Optimización de tu Aerotermia") metiéndolo dentro de la app, que es donde ya
// están sus datos y donde su respuesta puede servir para algo.
//
// Hace DOS trabajos a la vez, y ese orden no es casual:
//   1. CONFIRMAR LOS DATOS DE COBRO (IBAN incluido) — el trabajo de verdad, el
//      que evita el ingreso a una cuenta equivocada. Va AL FINAL: es lo que el
//      cliente ha venido a hacer, y ponerlo primero haría que cerrara la pestaña
//      antes de contestar lo demás.
//   2. CUALIFICAR para la venta cruzada (tarifa eléctrica · fotovoltaica ·
//      gestión de la deducción). Son preguntas de una sola pulsación.
//
// REGLA — el formulario NUNCA retiene el cobro. Es una confirmación de datos, no
// un peaje: quien no quiera contestar la venta cruzada pasa de largo (los tres
// bloques comerciales son OPCIONALES) y llega igual a la pantalla del IBAN. El
// único bloque obligatorio es el suyo.
//
// Módulo JS PURO: lo consumen la vista pública y el backend por import() dinámico
// (cobroService) — ver [[project_backend_importa_frontend_esm]].
// ============================================================================

import { FV } from '../../expedientes/logic/fotovoltaica.js';

/** Tipo de IVA aplicado al coste de gestión. */
export const IVA = 0.21;

/**
 * Coste de gestión por defecto cuando el expediente no lo trae (€ sin IVA).
 * Es el MISMO valor de reserva que usa `calculation.js` para `certificatesCost`:
 * si aquí fuera otro, el formulario le anunciaría al cliente una cifra distinta
 * de la que la simulación le descontó.
 */
export const COSTE_GESTION_DEFECTO = 250;

/**
 * Euros con dos decimales y punto de miles SIEMPRE: "1.840,00 €".
 * ⚠️ `toLocaleString('es-ES')` NO agrupa los números de cuatro cifras (saca
 * "1840,00 €"), y aquí casi todas las ayudas son de cuatro cifras. Mismo motivo
 * que el formateador propio de la guía del IRPF.
 */
export function eurEs(n) {
    const v = Number(n) || 0;
    const [ent, dec] = Math.abs(v).toFixed(2).split('.');
    // Espacio que NO se corta (U+00A0): "250,00 / €" partido en dos renglones se lee mal.
    return `${v < 0 ? '-' : ''}${ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec}\u00A0€`;
}

/**
 * Los tres bloques comerciales, en el orden en que se le enseñan.
 *
 * `lead` marca la respuesta que genera una OPORTUNIDAD comercial: es la que se
 * lista después en "a quién llamo". Las demás también se guardan — saber que un
 * cliente ya tiene quien le lleve la renta ahorra la llamada.
 */
export const BLOQUES = [
    {
        id: 'tarifa',
        icono: '⚡',
        titulo: 'Tu tarifa de luz',
        pregunta: '¿Has revisado la potencia contratada y la tarifa desde que tienes la aerotermia?',
        ayuda: 'Con aerotermia sube el consumo eléctrico y baja el de gas o gasóleo. Si la potencia y la tarifa se quedan como estaban, es fácil acabar pagando de más todos los meses.',
        // `destacado` se pinta aparte, en verde: es el argumento, y dentro del
        // párrafo de ayuda se leía como un dato más.
        destacado: 'Al 90 % de nuestros clientes les hemos mejorado la tarifa, y ahora también pagan menos luz.',
        lead: 'no_revisado',
        opciones: [
            {
                value: 'no_revisado',
                icono: '🔍',
                label: 'No lo he revisado',
                sub: 'Quiero que me la reviséis: gratis y sin compromiso',
                corto: 'Quiere estudio de tarifa',
            },
            {
                value: 'ajustado',
                icono: '👍',
                label: 'Sí, ya lo tengo ajustado',
                sub: 'Estoy conforme con lo que pago ahora',
                corto: 'Tarifa ya ajustada',
            },
        ],
    },
    {
        id: 'solar',
        icono: '☀️',
        titulo: 'Placas solares',
        pregunta: '¿Tienes placas solares fotovoltaicas?',
        ayuda: 'Tu aerotermia funciona con electricidad. Con placas en el tejado esa electricidad la produces tú: en las horas de sol la máquina calienta tu casa y tu agua casi gratis, y lo que te sobra se descuenta de la factura. (Hablamos de las placas que producen luz, no de las del agua caliente.)',
        destacado: 'Aerotermia y placas solares: la combinación que más baja lo que pagas de luz.',
        lead: FV.FUTURO,
        // Sale precontestado con lo que el cliente dijo en la captación
        // (`instalacion.fotovoltaica`): aquí solo lo confirma o lo corrige.
        // Fuente única de los valores: logic/fotovoltaica.js.
        opciones: [
            {
                value: FV.SI,
                icono: '☀️',
                label: 'Sí, ya las tengo instaladas',
                sub: 'Ya produzco mi propia electricidad',
                corto: 'Ya tiene placas',
            },
            {
                value: FV.FUTURO,
                icono: '🌤️',
                label: 'No, pero me interesa ponerlas',
                sub: 'Quiero saber cuánto me ahorraría: estudio gratis y sin compromiso',
                corto: 'Quiere estudio de fotovoltaica',
            },
            {
                value: FV.NO,
                icono: '🚫',
                label: 'No, y de momento no me interesa',
                sub: 'Prefiero dejarlo como está',
                corto: 'No le interesan las placas',
            },
        ],
    },
    {
        id: 'fiscalidad',
        icono: '💰',
        titulo: 'Tu deducción en la Renta',
        pregunta: '¿Quieres que te ayudemos a aplicar la deducción del IRPF por la reforma?',
        ayuda: 'La rehabilitación energética desgrava en la Renta, pero hay que declararla bien y con los certificados en la mano. Estamos preparando un servicio para llevarlo por ti.',
        lead: 'si',
        opciones: [
            {
                value: 'si',
                icono: '📄',
                label: 'Sí, me interesa',
                sub: 'Avisadme cuando esté disponible',
                corto: 'Quiere gestión del IRPF',
            },
            {
                value: 'no',
                icono: '🙅',
                label: 'No, gracias',
                sub: 'Ya tengo quien me lleve la declaración',
                corto: 'Ya tiene gestor',
            },
        ],
    },
];

/**
 * El bloque de la FORMA DE PAGO del coste de gestión.
 *
 * REGLA — solo se le pregunta a quien asume ese coste. Si el expediente lleva
 * "Descuento Certificados", Brokergy ya lo absorbió y su Convenio de Cesión no
 * menciona ninguna deducción: pedirle aquí que elija cómo paga contradiría el
 * contrato que firmó. Lo decide `bloquesPara`, nunca la vista.
 */
export function bloquePago(costeSinIva, bono = null) {
    const base = Number(costeSinIva) > 0 ? Number(costeSinIva) : COSTE_GESTION_DEFECTO;
    const iva = Math.round(base * IVA * 100) / 100;
    const total = Math.round((base + iva) * 100) / 100;
    const eur = eurEs;
    // Con el bono a la vista, cada opción dice lo que LE LLEGA: es la cifra que de
    // verdad compara quien elige, no el importe de los honorarios.
    const b = Number(bono) > 0 ? Math.round(Number(bono) * 100) / 100 : null;
    const recibeDescuento = b != null ? Math.max(0, Math.round((b - base) * 100) / 100) : null;
    return {
        id: 'forma_pago',
        icono: '💳',
        titulo: 'Cómo prefieres pagar la gestión',
        pregunta: '¿Cómo prefieres abonar nuestros honorarios?',
        // REGLA — las dos opciones NO cuestan lo mismo, y eso se dice antes de
        // elegir. El descuento se aplica sobre la BASE, sin IVA; la factura lleva
        // el IVA encima. Presentarlas como dos formas de pagar lo mismo escondería
        // la única diferencia que le importa al cliente.
        ayuda: `No te cobramos nada por adelantado. Ahora que vas a cobrar la ayuda toca liquidar la gestión: ${eur(base)}. Si lo descontamos del ingreso te cuesta eso, sin IVA; por factura hay que sumarle el IVA (${eur(total)}) y el ingreso no sale hasta que esté pagada.`,
        importe_sin_iva: base,
        importe_iva: iva,
        importe_total: total,
        bono: b,
        recibe_descuento: recibeDescuento,
        recibe_factura: b,
        opciones: [
            {
                value: 'descuento',
                icono: '✂️',
                label: `Descontádmelo del ingreso (${eur(base)})`,
                sub: recibeDescuento != null
                    ? `Recibes ${eur(recibeDescuento)} en cuanto confirmes tu cuenta: la gestión ya descontada, sin IVA y sin más trámites. Lo más rápido y lo más barato.`
                    : `Lo más rápido y lo más barato: recibes el bono con la gestión ya descontada, sin IVA y sin más trámites.`,
                corto: 'Descuento sobre el bono',
                recomendada: true,
            },
            {
                value: 'factura',
                icono: '🧾',
                label: `Prefiero que me paséis factura (${eur(total)})`,
                // Las dos consecuencias, en el orden en que le duelen: primero que
                // cobra más tarde, después que le cuesta más.
                sub: b != null
                    ? `Recibes ${eur(b)}, pero solo después de abonar la factura: te retrasa el cobro y te cuesta ${eur(iva)} más, porque por factura hay que repercutir el IVA que en el descuento no se aplica.`
                    : `Te retrasa el cobro —el ingreso no sale hasta que la factura esté abonada— y te cuesta ${eur(iva)} más, porque por factura hay que repercutir el IVA que en el descuento no se aplica.`,
                corto: 'Factura aparte',
                desaconsejada: true,
                aviso: `Más lento y ${eur(iva)} más caro`,
            },
        ],
    };
}

/**
 * Qué bloques se le enseñan a ESTE cliente y con qué viene precontestado.
 *
 * @param {object} ctx
 *   @param {boolean} ctx.clienteAsumeCoste  false si Brokergy absorbió los certificados
 *   @param {number}  ctx.costeGestion       € sin IVA del coste de gestión
 *   @param {string}  ctx.solarPrevio        estado de `instalacion.fotovoltaica` (si consta)
 *   @param {object}  ctx.respuestas         lo ya contestado (para reabrir el enlace)
 */
export function bloquesPara(ctx = {}) {
    const { clienteAsumeCoste = true, costeGestion = 0, solarPrevio = null, respuestas = {}, bono = null } = ctx;
    const bloques = BLOQUES.map(b => ({
        ...b,
        // El precontestado del bloque solar sale de lo que ya nos dijo en la
        // captación. Volver a preguntárselo de cero después de haberlo contestado
        // es lo que hace que un formulario parezca que no se lee.
        valor: respuestas[b.id] ?? (b.id === 'solar' ? solarPrevio : null) ?? null,
        heredado: b.id === 'solar' && respuestas.solar == null && !!solarPrevio,
    }));
    if (clienteAsumeCoste) {
        const p = bloquePago(costeGestion, bono);
        bloques.push({ ...p, valor: respuestas[p.id] ?? null, heredado: false });
    }
    return bloques;
}

/**
 * El contexto que decide qué se le enseña a ESTE cliente, sacado del expediente.
 *
 * REGLA — el bloque de la forma de pago solo sale si el cliente ASUME el coste de
 * gestión. Con "Descuento Certificados" activo, Brokergy ya lo absorbió y su
 * Convenio de Cesión firmado no menciona ninguna deducción.
 *
 * REGLA — manda el EXPEDIENTE, como en el panel económico
 * (`expedienteFinancials.js`): primero lo que se corrigió en su Económico
 * (`instalacion.economico_override`), después la simulación. La calculadora guarda
 * `discountCertificates` / `certificatesCost` y el expediente
 * `discount_certificates` / `certificates_cost`: se leen los dos, o el formulario
 * le preguntaría por la forma de pago a quien su panel dice que no paga nada.
 */
export function contextoCobro(exp) {
    const datos = exp?.oportunidades?.datos_calculo || {};
    const inputs = datos.inputs || {};
    const result = datos.result || {};
    const ov = exp?.instalacion?.economico_override || {};
    const si = (v) => v === true || v === 'true';
    const flag = ov.discount_certificates ?? inputs.discount_certificates ?? inputs.discountCertificates;
    const brokergyAsume = si(flag);
    const num = (v) => (Number(v) > 0 ? Number(v) : 0);
    // Lo que de verdad se le descuenta: lo corregido en el expediente, o lo que
    // calculó la simulación que aceptó. Solo si no hay nada, el valor por defecto.
    const coste = num(ov.certificates_cost)
        || num(result.caeMaintenanceCost)
        || num(inputs.certificates_cost)
        || num(inputs.certificatesCost)
        || 0;
    return {
        clienteAsumeCoste: !brokergyAsume,
        costeGestion: coste,
        solarPrevio: exp?.instalacion?.fotovoltaica?.estado || null,
        respuestas: exp?.documentacion?.cobro?.respuestas || {},
    };
}

/** IBAN sin espacios y en mayúsculas: un cambio de formato no es un cambio de cuenta. */
export const normalizarIban = (v) => String(v ?? '').replace(/[\s-]+/g, '').toUpperCase();

/** IBAN en bloques de cuatro, como lo enseña el banco. */
export const ibanEnBloques = (v) => normalizarIban(v).replace(/(.{4})(?=.)/g, '$1 ');

/**
 * IBAN para un MENSAJE: país, control y entidad a la vista —el banco es lo que
 * el cliente reconoce— y los cuatro últimos dígitos; el resto, oculto.
 * "ES5931902099174643243118" → "ES59 3190 •••• •••• •••• 3118".
 *
 * REGLA — en un WhatsApp o un email el IBAN NUNCA va entero. Esos mensajes se
 * reenvían, se quedan en móviles ajenos y se leen por encima del hombro; el número
 * completo solo se enseña detrás del enlace con token.
 */
export function mascaraIban(v) {
    const s = normalizarIban(v);
    if (s.length < 12) return null;
    const ocultos = s.length - 12;
    const medio = '•'.repeat(ocultos).replace(/(.{4})(?=.)/g, '$1 ');
    return `${s.slice(0, 4)} ${s.slice(4, 8)} ${medio} ${s.slice(-4)}`.replace(/\s+/g, ' ').trim();
}

/**
 * El esfuerzo de la tramitación, contado con lo que DE VERDAD pasó en ese
 * expediente. Con requerimientos se dice cuántos —es lo que el cliente no ve y lo
 * que más trabajo ha costado—; sin ninguno se cuenta el proceso, sin inventárselos:
 * decirle a un cliente que hemos contestado requerimientos que no hubo es una
 * mentira que se descubre a la primera pregunta.
 *
 * Devuelve la frase SIN el punto final: quien la usa decide cómo sigue
 * ("…por fin lo tenemos aquí: el pago ya nos ha llegado").
 */
export function textoEsfuerzo(requerimientos = 0, { numExp = null, titular = null } = {}) {
    const n = Math.max(0, Number(requerimientos) || 0);
    const exp = numExp ? ` (${numExp})` : '';
    const de = titular ? `el expediente de ${titular}${exp}` : `tu expediente${exp}`;
    if (n >= 1) {
        return `No ha sido fácil: para sacar adelante ${de} hemos tenido que contestar ${n === 1 ? 'un requerimiento' : `${n} requerimientos`} durante la tramitación, documento a documento. Pero por fin lo tenemos aquí`;
    }
    return `Ha sido un proceso largo —la verificación de ${de}, su presentación ante el Ministerio y la emisión de los certificados de ahorro—, pero por fin lo tenemos aquí`;
}

const eurMsg = eurEs;

/**
 * El mensaje que se le manda cuando el Sujeto Obligado ya nos ha pagado y toca
 * hacerle el ingreso. FUENTE ÚNICA del texto (la llaman la ficha, el lote y el
 * parte por `cobroService.mensajeCobro`).
 *
 * Orden, y no es casual: primero la noticia (es la razón por la que va a abrir el
 * enlace), después el MOTIVO de pedirle la cuenta —la seguridad, no un trámite
 * nuestro—, la cuenta que tenemos para que la reconozca, el enlace, y lo demás.
 *
 * REGLA — no se promete FECHA de ingreso: una fecha aquí es una reclamación en dos
 * semanas. El IMPORTE sí se dice, pero solo el VERIFICADO (con el lote ya cobrado,
 * es el que se transfiere); con el estimado no se dice ninguno.
 *
 * @param {object} p
 *   @param {string}  p.nombre       nombre con el que se saluda (null → "Hola")
 *   @param {string}  p.numExp       nº de expediente (opcional)
 *   @param {string}  p.link         enlace del formulario
 *   @param {string}  p.ibanMascara  la cuenta que consta, enmascarada (null si no hay)
 *   @param {boolean} p.tercero      lo lee la persona de contacto, no el titular
 *   @param {string}  p.titular      nombre del titular (para el `tercero`)
 *   @param {boolean} p.partner      la persona de contacto es el partner: a él no se le
 *                                   enseña ni la cuenta enmascarada de su cliente
 *   @param {object}  p.pago         bloquePago(...) si el cliente asume el coste, o null
 *   @param {number}  p.bono         la ayuda VERIFICADA a ingresar (null → no se dice importe)
 *   @param {number}  p.requerimientos cuántos requerimientos se contestaron (0 → el proceso)
 */
export function componerMensajeCobro({
    nombre, numExp, link, ibanMascara, tercero = false, titular, partner = false, pago = null,
    bono = null, requerimientos = 0,
}) {
    const b = Number(bono) > 0 ? Number(bono) : null;
    const tu = tercero ? 'su' : 'tu';
    const te = tercero ? 'le' : 'te';
    const esfuerzo = textoEsfuerzo(requerimientos, { numExp, titular: tercero ? (titular || 'el titular') : null });

    // Lo que se le va a ingresar. Con descuento es la cifra que recibe sin hacer
    // nada más, y por eso va en negrita; la de la factura va al lado para que
    // elija sabiendo lo que se juega.
    let importe = [];
    if (b != null) {
        importe = ['', `💶 ${tercero ? 'Su' : 'Tu'} ayuda: *${eurMsg(b)}*`];
        if (pago) {
            const recibe = Math.max(0, b - pago.importe_sin_iva);
            importe.push(
                `Descontando nuestros honorarios (${eurMsg(pago.importe_sin_iva)}), ${te} ingresaremos *${eurMsg(recibe)}*. `
                + `Si ${tercero ? 'prefiere' : 'prefieres'} pagarlos aparte con factura (${eurMsg(pago.importe_total)}, IVA incluido), ${te} ingresaremos los ${eurMsg(b)} una vez abonada. Se elige en el enlace.`,
            );
        } else {
            importe.push(`${tercero ? 'Se la' : 'Te la'} ingresaremos íntegra.`);
        }
    }
    // Sin importe que anunciar, los honorarios se explican DESPUÉS del enlace:
    // "en el mismo enlace…" delante del enlace no se entiende.
    const honorariosTras = (b == null && pago)
        ? ['', `En el mismo enlace se elige cómo liquidar nuestros honorarios (${eurMsg(pago.importe_sin_iva)}): descontados del ingreso, o con una factura aparte de ${eurMsg(pago.importe_total)} (IVA incluido) que habría que abonar antes de recibirlo.`]
        : [];

    if (tercero) {
        return [
            nombre ? `¡Hola ${nombre}! 🎉` : '¡Hola! 🎉',
            '',
            `${esfuerzo}: el pago de ${tu} ayuda ya nos ha llegado y vamos a hacerle el ingreso.`,
            ...importe,
            '',
            `Por seguridad, antes de cualquier transferencia confirmamos con cada titular su número de cuenta.${(!partner && ibanMascara) ? ` La que tenemos es:\n\n*${ibanMascara}*\n` : ''}`,
            '¿Le puedes hacer llegar este enlace para que lo confirme? Le llevará menos de un minuto:',
            '',
            link,
            ...honorariosTras,
            '',
            'Cualquier duda, contesta a este mensaje.',
        ].join('\n');
    }

    const cuenta = ibanMascara
        ? [
            'Por seguridad, antes de hacer cualquier transferencia confirmamos con cada cliente su número de cuenta. Este es el que tenemos:',
            '',
            `*${ibanMascara}*`,
            '',
            '¿Es correcto? Confírmalo aquí, te llevará menos de un minuto:',
        ]
        : [
            'Por seguridad, antes de hacer la transferencia necesitamos tu número de cuenta y un justificante de que es tuya (un recibo o una captura del banco donde se vea tu nombre junto al IBAN). Indícanoslo aquí, te llevará un minuto:',
        ];

    return [
        nombre ? `¡Enhorabuena, ${nombre}! 🎉` : '¡Enhorabuena! 🎉',
        '',
        `${esfuerzo}: el pago de tu ayuda ya nos ha llegado y vamos a hacerte el ingreso.`,
        ...importe,
        '',
        ...cuenta,
        '',
        link,
        ...honorariosTras,
        '',
        'De paso te hacemos tres preguntas rápidas y opcionales por si podemos ahorrarte algo más. Por ejemplo, al 90 % de nuestros clientes les hemos mejorado la tarifa de la luz y ahora también pagan menos.',
        '',
        'Cualquier duda, contesta a este mensaje.',
    ].join('\n');
}

/**
 * Qué hay que hacer con la forma de pago elegida, dicho para quien prepara la
 * transferencia. La factura es el caso que se olvida: hay que emitirla y cobrarla
 * ANTES de ingresar, y si nadie lo dice se transfiere el bono entero.
 */
export function tareaFormaPago(valor, costeGestion = 0) {
    const p = bloquePago(costeGestion);
    if (valor === 'descuento') {
        return { tono: 'ok', texto: `Descontar ${eurMsg(p.importe_sin_iva)} (sin IVA) del ingreso` };
    }
    if (valor === 'factura') {
        return { tono: 'aviso', texto: `Emitir factura de ${eurMsg(p.importe_total)} (IVA incl.) y cobrarla ANTES del ingreso` };
    }
    return null;
}

/** Etiqueta corta de una respuesta, para el resumen interno. */
export function etiquetaRespuesta(bloqueId, valor, costeGestion = 0) {
    if (valor == null) return null;
    const b = BLOQUES.find(x => x.id === bloqueId)
        || (bloqueId === 'forma_pago' ? bloquePago(costeGestion) : null);
    return b?.opciones.find(o => o.value === valor)?.corto || String(valor);
}

/**
 * Las oportunidades comerciales que deja este formulario, ya redactadas.
 * Es lo que alimenta la lista de "a quién llamo" y el aviso al staff: sin esto,
 * las respuestas se quedarían enterradas en un JSONB que nadie abre.
 */
export function leadsDe(respuestas = {}) {
    return BLOQUES
        .filter(b => respuestas[b.id] === b.lead)
        .map(b => ({ id: b.id, icono: b.icono, texto: b.opciones.find(o => o.value === b.lead).corto }));
}
