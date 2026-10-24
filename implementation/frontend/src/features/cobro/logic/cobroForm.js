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
    // REGLA — la gestión BONIFICADA es un regalo de ahora, no lo que firmó: su
    // convenio sí la mencionaba. Se marca desde la fase 7 del lote
    // (`documentacion.cobro.gestion_bonificada`) y, a diferencia de "Descuento
    // Certificados", el mensaje lo DICE: no cobrarle es justo la noticia.
    const bonificada = !brokergyAsume && !!exp?.documentacion?.cobro?.gestion_bonificada;
    return {
        clienteAsumeCoste: !brokergyAsume && !bonificada,
        costeGestion: coste,
        // Lo que se le perdona, sin IVA (el mismo importe que se le habría pedido).
        gestionBonificada: bonificada ? (coste > 0 ? coste : COSTE_GESTION_DEFECTO) : null,
        solarPrevio: exp?.instalacion?.fotovoltaica?.estado || null,
        respuestas: exp?.documentacion?.cobro?.respuestas || {},
    };
}

/**
 * IBAN solo con letras y números, en mayúsculas: un cambio de formato no es un
 * cambio de cuenta. Hay fichas guardadas con guiones ("ES49-…") o una coma suelta.
 * El backend (`normIban` de POST /public/cobro) usa EL MISMO criterio: si divergen,
 * se le pide justificante a quien ha pulsado «Sí, es correcta».
 */
export const normalizarIban = (v) => String(v ?? '').replace(/[^A-Za-z0-9]+/g, '').toUpperCase();

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
 *   @param {number}  p.bonificada   honorarios que se le PERDONAN (€ sin IVA), o null
 */
export function componerMensajeCobro({
    nombre, numExp, link, ibanMascara, tercero = false, titular, partner = false, pago = null,
    bono = null, requerimientos = 0, bonificada = null,
}) {
    const b = Number(bono) > 0 ? Number(bono) : null;
    const tu = tercero ? 'su' : 'tu';
    const te = tercero ? 'le' : 'te';
    const esfuerzo = textoEsfuerzo(requerimientos, { numExp, titular: tercero ? (titular || 'el titular') : null });
    // El REGALO se cuenta como regalo: lo que se le habría cobrado y por qué no.
    // Con requerimientos, el motivo es la espera que ha soportado; si no, la confianza.
    const regalo = Number(bonificada) > 0
        ? `🎁 Además, tenemos un detalle ${tercero ? `con ${titular || 'el titular'}` : 'contigo'}: no ${tercero ? 'le' : 'te'} cobramos nuestros honorarios de gestión (${eurMsg(Number(bonificada))}). `
            + `Es un regalo por ${Number(requerimientos) > 0 ? `${tercero ? 'su' : 'tu'} paciencia durante la tramitación` : `${tercero ? 'su' : 'tu'} confianza`}`
        : null;

    // Lo que se le va a ingresar. Con descuento es la cifra que recibe sin hacer
    // nada más, y por eso va en negrita; la de la factura va al lado para que
    // elija sabiendo lo que se juega.
    let importe = [];
    if (b != null) {
        importe = ['', `💶 ${tercero ? 'Su' : 'Tu'} ayuda: *${eurMsg(b)}*`];
        if (pago) {
            const recibe = Math.max(0, b - pago.importe_sin_iva);
            importe.push(
                `• Descontando nuestros honorarios (${eurMsg(pago.importe_sin_iva)}), ${te} ingresaremos *${eurMsg(recibe)}*.`,
                `• Si ${tercero ? 'prefiere' : 'prefieres'} pagarlos aparte con factura (${eurMsg(pago.importe_total)}, IVA incluido), ${te} ingresaremos los ${eurMsg(b)} una vez abonada.`,
                `${tercero ? 'Lo elige' : 'Lo eliges'} en el mismo enlace donde ${tercero ? 'confirma' : 'confirmas'} la cuenta.`,
            );
        } else if (regalo) {
            importe.push(`${regalo}, así que ${tercero ? 'se la' : 'te la'} ingresaremos íntegra.`);
        } else {
            importe.push(`${tercero ? 'Se la' : 'Te la'} ingresaremos íntegra.`);
        }
    }
    // Sin importe que anunciar, los honorarios se explican tras pedirle que abra
    // el enlace: "en ese mismo enlace…" antes de nombrarlo no se entiende.
    const honorariosTras = (b == null && pago)
        ? ['', `En ese mismo enlace se elige cómo liquidar nuestros honorarios (${eurMsg(pago.importe_sin_iva)}): descontados del ingreso, o con una factura aparte de ${eurMsg(pago.importe_total)} (IVA incluido) que habría que abonar antes de recibirlo.`]
        : (b == null && regalo ? ['', `${regalo}.`] : []);

    // REGLA — el ENLACE va al FINAL, tras la firma, con una línea breve encima
    // («👉 Confirma aquí tu número de cuenta:»). En WhatsApp los dos van en un
    // SEGUNDO mensaje (`separarEnlaceCobro`): así sale con su vista previa y se
    // pulsa sin buscarlo; metido en mitad del texto se veía como
    // un churro de token partido en tres líneas (15/10/2026). Por eso el texto lo
    // anuncia "a continuación 👇", que vale igual para el email.
    if (tercero) {
        return [
            nombre ? `¡Hola ${nombre}! 🎉` : '¡Hola! 🎉',
            '',
            `${esfuerzo}: el pago de ${tu} ayuda ya nos ha llegado y vamos a hacerle el ingreso.`,
            ...importe,
            '',
            `🔒 Por seguridad, antes de cualquier transferencia confirmamos con cada titular su número de cuenta.${(!partner && ibanMascara) ? ` La que tenemos es:\n\n*${ibanMascara}*\n` : ''}`,
            '¿Le puedes reenviar el enlace que te mando a continuación 👇 para que lo confirme? Le llevará menos de un minuto.',
            ...honorariosTras,
            '',
            'Cualquier duda, contesta a este mensaje.',
            '',
            ...FIRMA_COBRO,
            '',
            '👉 Enlace para que confirme su número de cuenta:',
            link,
        ].join('\n');
    }

    const cuenta = ibanMascara
        ? [
            '🔒 Por seguridad, antes de cualquier transferencia confirmamos con cada cliente su número de cuenta. La que tenemos es:',
            '',
            `*${ibanMascara}*`,
            '',
            '¿Es correcta? Confírmalo en el enlace que te mando a continuación 👇 Te llevará menos de un minuto.',
        ]
        : [
            '🔒 Por seguridad, antes de hacer la transferencia necesitamos tu número de cuenta y un justificante de que es tuya (un recibo o una captura del banco donde se vea tu nombre junto al IBAN). Indícanoslo en el enlace que te mando a continuación 👇 Te llevará un minuto.',
        ];

    return [
        nombre ? `¡Enhorabuena, ${nombre}! 🎉` : '¡Enhorabuena! 🎉',
        '',
        `${esfuerzo}: el pago de tu ayuda ya nos ha llegado y vamos a hacerte el ingreso.`,
        ...importe,
        '',
        ...cuenta,
        ...honorariosTras,
        '',
        'Y de paso, tres preguntas rápidas y opcionales por si podemos ahorrarte algo más: al 90 % de nuestros clientes les hemos mejorado la tarifa de la luz y ahora pagan menos.',
        '',
        'Cualquier duda, contesta a este mensaje.',
        '',
        ...FIRMA_COBRO,
        '',
        ibanMascara ? '👉 Confirma aquí tu número de cuenta:' : '👉 Indícanos aquí tu número de cuenta:',
        link,
    ].join('\n');
}

/** La firma del mensaje de cobro: lo firma una persona, no "el equipo". */
export const FIRMA_COBRO = ['Un saludo,', '*Fran Moya*', 'BROKERGY · Ingeniería Energética'];

/**
 * Parte el mensaje de cobro en DOS WhatsApp: el texto y, aparte, el enlace con
 * la línea breve que lo presenta (la que empieza por 👉 justo encima, también si
 * se ha retocado en el popup). El enlace se manda SIEMPRE —aunque se haya borrado
 * al retocar el texto—, porque sin él el mensaje pide algo que no se puede hacer.
 * @returns {{ texto: string, enlace: string|null }}
 */
export function separarEnlaceCobro(mensaje, link) {
    const limpiar = (t) => t.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    const original = String(mensaje || '');
    if (!link) return { texto: limpiar(original), enlace: null };
    const lineas = original.split('\n');
    const i = lineas.findIndex(l => l.includes(link));
    let rotulo = null;
    if (i > 0 && /^\s*👉/u.test(lineas[i - 1])) rotulo = lineas.splice(i - 1, 1)[0].trim();
    const texto = limpiar(lineas.join('\n').split(link).join(''));
    return { texto, enlace: rotulo ? `${rotulo}\n${link}` : link };
}

/**
 * El concepto de la transferencia: lo que el cliente lee en su banco para
 * reconocerla. El guion bajo del nº de expediente no está en el juego de
 * caracteres SEPA, así que va con guion — y el mensaje dice el MISMO texto que
 * verá en el banco.
 */
export function conceptoTransferencia(numExp) {
    return `AYUDA CAE ${String(numExp || '').replace(/_/g, '-')} BROKERGY`.replace(/\s+/g, ' ').trim();
}

/**
 * El aviso de que la transferencia YA está hecha (tras subir el justificante del
 * banco). FUENTE ÚNICA del texto.
 *
 * REGLA — el justificante del banco NO se le adjunta: el de una remesa lleva los
 * nombres, cuentas e importes de TODOS los clientes del lote. Se le dice el importe,
 * la cuenta enmascarada y el concepto con el que lo va a ver.
 *
 * @param {object} p
 *   @param {Array}   p.cuentas   [{ mascara, importe }] — una por cuenta a la que se ingresó
 *   @param {string}  p.concepto  el concepto de la transferencia
 *   @param {number}  p.bonificada  honorarios que se le perdonaron (€ sin IVA), o null
 */
export function componerMensajeTransferencia({
    nombre, tercero = false, titular = null, partner = false, cuentas = [], concepto = null, bonificada = null,
}) {
    const lista = (cuentas || []).filter(c => Number(c?.importe) > 0);
    const total = lista.reduce((s, c) => s + Number(c.importe), 0);
    const saludo = nombre ? `¡Hola ${nombre}! ✅` : '¡Hola! ✅';
    const deQuien = tercero ? `de ${titular || 'el titular'}` : 'tu';
    const aCuenta = (c) => (partner || !c.mascara ? '' : ` a la cuenta *${c.mascara}*`);

    let cuerpo;
    if (lista.length > 1) {
        cuerpo = [
            `Ya hemos hecho las transferencias de la ayuda ${tercero ? `de ${titular || 'el titular'}` : 'de tu vivienda'}, *${eurMsg(total)}* en total:`,
            ...lista.map(c => `• *${eurMsg(c.importe)}*${aCuenta(c)}`),
        ];
    } else {
        const c = lista[0] || {};
        cuerpo = [`Ya hemos hecho la transferencia de ${tercero ? `la ayuda ${deQuien}` : 'tu ayuda'}: *${eurMsg(c.importe || total)}*${aCuenta(c) || (partner ? ' a la cuenta que nos confirmó' : '')}.`];
    }
    const plazo = 'Según el banco, puede tardar uno o dos días hábiles en aparecer en la cuenta.';
    // Lo regalado se recuerda aquí: es cuando ve que la cifra llega entera.
    const regalo = Number(bonificada) > 0
        ? ['', `🎁 Va íntegra: como ${tercero ? 'le' : 'te'} dijimos, nuestros honorarios de gestión (${eurMsg(Number(bonificada))}) corren de nuestra cuenta.`]
        : [];
    return [
        saludo,
        '',
        ...cuerpo,
        ...regalo,
        '',
        concepto ? `En el concepto ${tercero ? 'se verá' : 'verás'} «${concepto}». ${plazo}` : plazo,
        '',
        'Cualquier duda, contesta a este mensaje. ¡Gracias por confiar en BROKERGY!',
    ].join('\n');
}

/**
 * El mensaje de la RESEÑA en Google, que sale programado cuando la transferencia
 * ya debería haber llegado. FUENTE ÚNICA del texto.
 *
 * REGLA — el esfuerzo se cuenta con lo que DE VERDAD pasó, igual que en la
 * enhorabuena: con requerimientos se dice cuántos; sin ninguno, el proceso
 * (verificación, Ministerio, emisión). Pedir una reseña con un requerimiento
 * inventado es lo que la convierte en una mala.
 *
 * @param {object} p
 *   @param {string} p.enlace          el enlace para escribir la reseña en Google
 *   @param {number} p.requerimientos  cuántos se contestaron (0 → el proceso)
 */
export function componerMensajeResena({ nombre, tercero = false, enlace, requerimientos = 0 }) {
    const n = Math.max(0, Number(requerimientos) || 0);
    const vosotros = tercero;
    const porque = n >= 1
        ? `hemos tenido que contestar ${n === 1 ? 'un requerimiento' : `${n} requerimientos`} durante la tramitación, documento a documento, y no hemos parado hasta que todo ha salido adelante`
        : 'la verificación, la presentación ante el Ministerio y la emisión de los certificados tienen sus plazos, y hemos estado encima de cada paso para que todo saliera adelante';
    return [
        nombre ? `¡Hola ${nombre}! 😊` : '¡Hola! 😊',
        '',
        `${vosotros ? 'Esperamos que el ingreso de la ayuda ya esté en la cuenta' : 'Esperamos que ya tengas el ingreso de tu ayuda en la cuenta'}; si no ${vosotros ? 'lo veis' : 'lo ves'}, ${vosotros ? 'decídnoslo' : 'dínoslo'} y lo miramos.`,
        '',
        `Queríamos ${vosotros ? 'daros' : 'darte'} las gracias por la confianza y por la paciencia. Sabemos que todo ha tardado más de lo que nos hubiera gustado: ${porque}.`,
        '',
        `Para nosotros es muy importante ${vosotros ? 'vuestra opinión' : 'tu opinión'}: es lo que ayuda a otras familias a fiarse y dar el paso. Si ${vosotros ? 'os ha gustado' : 'te ha gustado'} cómo lo hemos llevado, ¿nos ${vosotros ? 'dejaríais' : 'dejarías'} una reseña en Google? Es menos de un minuto:`,
        '',
        enlace,
        '',
        '¡Muchas gracias! 🙌',
    ].join('\n');
}

/**
 * Los mensajes que acompañan a la CARTA DE PAGO (PDF adjunto): el WhatsApp, y el
 * asunto y el cuerpo del email. FUENTE ÚNICA del texto (2026-10-22, textos de Fran).
 *
 * REGLA — la cuenta, solo por sus 4 ÚLTIMAS cifras; nunca el IBAN entero.
 *
 * REGLA — el texto PIDE ya la reseña: con la carta no se programa además la
 * petición de reseña de `componerMensajeResena`, o se le pediría dos veces. Al
 * PARTNER no se le pide (es una reseña de BROKERGY en nombre de su cliente).
 *
 * @param {object} p
 *   @param {string}   p.nombre    a quién se saluda (quien RECIBE el mensaje)
 *   @param {number}   p.importe   lo transferido (verificado − honorarios)
 *   @param {string[]} p.ultimos4  las 4 últimas cifras de cada cuenta de abono
 *   @param {string}   p.numero    nº de la carta (CP-2026-0001)
 *   @param {string}   p.expediente nº de expediente: ENCABEZA el asunto (decisión de Fran, 22/10)
 *   @param {string}   p.enlace    enlace de la reseña en Google (null → sin petición)
 *   @param {boolean}  p.tercero   lo lee su persona de contacto, no el titular
 *   @param {string}   p.titular   nombre del titular (con `tercero`)
 *   @param {boolean}  p.partner   el contacto es el partner
 *   @param {object}   p.detalle   { fecha_pago, titular_nombre, vivienda_direccion, actuacion,
 *                                   ahorro_kwh, instalador }: el texto plano del email
 *                                   cuenta lo mismo que su HTML (emailCartaPago)
 */
export function componerMensajeCartaPago({
    nombre, importe, ultimos4 = [], numero, expediente = null, enlace = null, tercero = false, titular = null,
    partner = false, detalle = null,
}) {
    const hola = nombre ? `Hola, ${nombre}` : 'Hola';
    const bono = tercero ? `el Bono CAE de ${titular || 'el titular'}` : 'tu Bono CAE';
    const cuentas = (ultimos4 || []).filter(Boolean);
    const enCuenta = partner || !cuentas.length ? ''
        : `, en la cuenta terminada en ${cuentas.join(' y ')}`;
    const conResena = !!enlace && !partner;

    const whatsapp = [
        `${hola} 👋 Ya ${tercero ? 'hemos transferido' : 'te hemos transferido'} ${bono} de ${eurMsg(importe)}. ${tercero ? 'Os dejamos' : 'Te dejamos'} la carta de pago adjunta como justificante.`,
        ...(conResena ? [`Si ${tercero ? 'estáis contentos' : 'estás contento'} con el trabajo, ¿nos ${tercero ? 'dejáis' : 'dejas'} una reseña en Google? Nos ayuda un montón 🙏 ${enlace}`] : []),
    ].join('\n');

    // Con `detalle` (el email con su HTML de diseño, al TITULAR): el mismo contenido
    // que el HTML, en texto plano. Sin él (persona de contacto o partner), el corto.
    const email = detalle && !tercero && !partner ? [
        `${hola}:`,
        '',
        '¡Buenas noticias! Ya te hemos transferido tu Bono CAE. El ahorro energético de tu reforma ya es dinero en tu bolsillo.',
        '',
        `IMPORTE ABONADO: ${eurMsg(importe)}`,
        `Transferencia del ${detalle.fecha_pago}${cuentas.length ? ` · cuenta terminada en ${cuentas.join(' y ')}` : ''}`,
        `Carta de pago nº ${numero}`,
        '',
        'DETALLE DEL PAGO',
        `Titular: ${detalle.titular_nombre}`,
        `Vivienda: ${detalle.vivienda_direccion}`,
        `Actuación: ${detalle.actuacion}`,
        `Ahorro certificado: ${detalle.ahorro_kwh} kWh`,
        `Instalador: ${detalle.instalador}`,
        `Expediente: ${expediente}`,
        '',
        'Tu carta de pago va adjunta a este email. Es tu justificante oficial del cobro: guárdala junto a la documentación de tu instalación.',
        ...(conResena ? [
            '',
            '¿Te hemos ayudado? Cuéntalo.',
            'Tu reseña ayuda a que más familias de tu zona descubran que pueden cobrar por ahorrar energía. Te lleva menos de un minuto y para nosotros vale muchísimo:',
            enlace,
        ] : []),
        '',
        'Gracias por confiar en nosotros. Cualquier duda, me tienes a un mensaje.',
        'Un abrazo,',
        '',
        'Fran Moya',
        'CEO · BROKERGY · Ingeniería energética',
        '623 926 179 · franciscojavier.moya@brokergy.es · brokergy.es',
    ].join('\n') : [
        `${hola}:`,
        '',
        `¡Buenas noticias! Ya ${tercero ? 'hemos transferido' : 'te hemos transferido'} ${bono}: ${eurMsg(importe)}${enCuenta}.`,
        '',
        `${tercero ? 'Os adjuntamos' : 'Te adjuntamos'} la carta de pago como justificante. ${tercero ? 'Guardadla' : 'Guárdala'} junto a la documentación de ${tercero ? 'la' : 'tu'} instalación.`,
        ...(conResena ? ['', `Si ${tercero ? 'os ha gustado' : 'te ha gustado'} cómo lo hemos llevado, nos ayudaría muchísimo una reseña en Google (${tercero ? 'os lleva' : 'te lleva'} un minuto): ${enlace}`] : []),
        '',
        'Un abrazo,',
        'Fran Moya · BROKERGY',
    ].join('\n');

    // El nº de EXPEDIENTE delante (Fran, 22/10/2026) y la cifra, para que se abra.
    const asunto = tercero || partner
        ? `El Bono CAE de ${eurMsg(importe)} ya está en la cuenta`
        : `Tu Bono CAE de ${eurMsg(importe)} ya está en tu cuenta`;
    return {
        whatsapp,
        email,
        asunto: [expediente, asunto].filter(Boolean).join(' · '),
    };
}

/**
 * El RECORDATORIO que sale a los 2 días hábiles de la carta de pago (24/10/2026, Fran).
 * Un flujo cerrado: ¿te ha llegado? → la reseña → tu documentación. FUENTE ÚNICA.
 *
 * REGLA — la reseña NO es la llave de los documentos. Pedir una reseña a cambio de
 * algo lo prohíbe Google (puede borrarlas o penalizar la ficha) y los certificados
 * son del cliente. El mensaje da primero (la confirmación y su espacio con la
 * documentación para la Renta) y en el mismo sitio pide; la página pone la reseña
 * ARRIBA y la documentación DEBAJO.
 *
 * @param {object} p
 *   @param {string}  p.nombre   a quién se saluda (quien RECIBE el mensaje)
 *   @param {number}  p.importe  lo transferido
 *   @param {string}  p.enlace   la página «¿te ha llegado?» (/cobro/:id/recibido?token=)
 *   @param {boolean} p.tercero  lo lee su persona de contacto, no el titular
 *   @param {string}  p.titular  nombre del titular (con `tercero`)
 */
export function componerMensajeRecordatorioCobro({ nombre, importe, enlace, tercero = false, titular = null }) {
    const hola = nombre ? `Hola, ${nombre}` : 'Hola';
    const bono = tercero ? `el Bono CAE de ${titular || 'el titular'}` : 'tu Bono CAE';
    const cifra = Number(importe) > 0 ? ` (${eurMsg(importe)})` : '';
    const whatsapp = [
        `${hola} 👋 ¿${tercero ? 'Os ha llegado' : 'Te ha llegado'} ya el ingreso de ${bono}${cifra}? Confírmanoslo con un toque aquí:`,
        enlace,
        '',
        `Ahí mismo ${tercero ? 'tenéis' : 'tienes'} también ${tercero ? 'vuestro' : 'tu'} espacio con toda la documentación del expediente (certificados energéticos, etiqueta, facturas…), que ${tercero ? 'os' : 'te'} vendrá bien para la declaración de la Renta 📄`,
    ].join('\n');
    const email = [
        `${hola}:`,
        '',
        `¿${tercero ? 'Os ha llegado' : 'Te ha llegado'} ya el ingreso de ${bono}${cifra}? Confírmanoslo con un toque en este enlace:`,
        enlace,
        '',
        `En la misma página ${tercero ? 'tenéis' : 'tienes'} ${tercero ? 'vuestro' : 'tu'} espacio con toda la documentación del expediente: los certificados energéticos, la etiqueta, las facturas y la guía con los datos para la deducción en la Renta.`,
        '',
        'Un abrazo,',
        'Fran Moya · BROKERGY',
    ].join('\n');
    return {
        whatsapp,
        email,
        asunto: `¿${tercero ? 'Os ha llegado' : 'Te ha llegado'} el ingreso? · Tu documentación para la Renta`,
    };
}

/**
 * La petición de reseña de la página «¿te ha llegado?», con la idea de Fran
 * (24/10/2026): hay muchas familias en su misma situación, esperando su ingreso;
 * queremos que confíen en que, aunque se retrase, sale adelante, y su reseña es lo
 * que hace que sigan confiando. Condensada a dos frases (24/10/2026) para el móvil.
 * Sin emojis: la página los pinta con iconos propios. FUENTE ÚNICA (la página y el demo).
 */
export function textoPeticionResena({ tercero = false } = {}) {
    return {
        titulo: tercero ? '¿Nos ayudáis con una reseña?' : '¿Nos ayudas con una reseña?',
        cuerpo: tercero
            ? 'Muchas familias en vuestra misma situación están esperando su ingreso. Vuestra reseña es lo que más les ayuda a confiar en que, aunque se retrase, sale adelante, como el vuestro.'
            : 'Muchas familias en tu misma situación están esperando su ingreso. Tu reseña es lo que más les ayuda a confiar en que, aunque se retrase, sale adelante, como el tuyo.',
        boton: 'Dejar mi reseña en Google',
        hecho: 'Ya la he dejado',
        gracias: tercero ? 'Mil gracias. Nos ayudáis muchísimo.' : 'Mil gracias. Nos ayudas muchísimo.',
        pie: tercero ? 'Os lleva menos de un minuto.' : 'Te lleva menos de un minuto.',
    };
}

/**
 * El aviso de la CAMPAÑA DE LA RENTA (marzo): «aquí tienes tus documentos». Va a
 * quien tiene expediente con los certificados entregables; si aún no ha dejado
 * reseña (por lo que nos ha dicho), se le pide de paso. FUENTE ÚNICA.
 */
export function componerMensajeCampanaRenta({ nombre, enlace, anio, conResena = false, enlaceResena = null, tercero = false }) {
    const hola = nombre ? `Hola, ${nombre}` : 'Hola';
    const a = Number(anio) || new Date().getFullYear() - 1;
    const whatsapp = [
        `${hola} 👋 Empieza la campaña de la Renta ${a} y ${tercero ? 'os' : 'te'} dejamos a mano toda la documentación de ${tercero ? 'vuestro' : 'tu'} expediente: los certificados energéticos, la etiqueta, las facturas y una guía con los datos exactos que pide Renta Web para la deducción por la reforma.`,
        '',
        `📄 ${enlace}`,
        ...(conResena && enlaceResena ? [
            '',
            `Y si ${tercero ? 'estáis contentos' : 'estás contento'} con cómo lo llevamos, una reseña en Google nos ayuda muchísimo: ${enlaceResena}`,
        ] : []),
    ].join('\n');
    return {
        whatsapp,
        asunto: `Tu documentación para la Renta ${a} · BROKERGY`,
    };
}

// Palabras que en un nombre propio o una calle van en minúscula.
const MINUSCULAS = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'en', 'a', 'al']);

/** "MARIA ELENA ESPUELA LOPEZ-CARRASCO" → "Maria Elena Espuela Lopez-Carrasco". */
export function nombrePropio(v) {
    return String(v || '').trim().toLowerCase().split(/\s+/).filter(Boolean)
        .map((w, i) => (i > 0 && MINUSCULAS.has(w) ? w
            : w.replace(/(^|[-/(])(\p{L})/gu, (_, a, b) => a + b.toUpperCase())))
        .join(' ');
}

/**
 * La dirección de la OBRA para un mensaje: la de la instalación (su propia
 * dirección, si no la de la simulación y, si comparte domicilio, la del cliente),
 * sin las notas internas entre paréntesis («(42 EN CATASTRO)») y con el municipio
 * entre paréntesis. Misma cascada que `buildInstalacionAddress`.
 */
export function direccionObra(exp) {
    const inst = exp?.instalacion || {};
    const dc = exp?.oportunidades?.datos_calculo || {};
    const op = { ...dc, ...(dc.inputs || {}) };
    const cli = inst.misma_direccion === false ? {} : (exp?.clientes || {});
    const limpia = (s) => String(s || '').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').replace(/\s+,/g, ',').trim();
    const calle = limpia(inst.direccion || op.direccion || cli.direccion);
    const muni = limpia(inst.municipio || op.municipio || cli.municipio);
    const c = nombrePropio(calle).replace(/\bnº\s*/gi, 'nº ').replace(/^(c|av|avda|ctra|pza|pl)\b/i, m => m.charAt(0).toUpperCase() + m.slice(1));
    return [c, muni ? `(${nombrePropio(muni)})` : ''].filter(Boolean).join(' ') || null;
}

/**
 * El aviso al INSTALADOR de que sus clientes de un lote ya han COBRADO la ayuda.
 * UN mensaje por instalador y lote, no uno por expediente. FUENTE ÚNICA del texto.
 *
 * REGLA — tono PROFESIONAL: es un partner, no un cliente. Sin emojis ni bromas;
 * de cada cliente, nombre, apellidos, la dirección de la obra y la ayuda que ha
 * cobrado (no el nº de expediente, que el instalador no maneja). Cierra con
 * «¡Seguimos!».
 *
 * @param {object} p
 *   @param {string}  p.nombre         a quién se saluda (null → «Hola:», canal general)
 *   @param {Array}   p.clientes       [{ nombre, direccion, ayuda }]
 *   @param {number}  p.anio           año de las actuaciones (opcional)
 *   @param {number}  p.requerimientos cuántos se contestaron (0 → el proceso)
 */
export function componerMensajeInstaladorCobro({ nombre = null, clientes = [], anio = null, requerimientos = 0 }) {
    const lista = (clientes || []).filter(Boolean);
    const total = lista.reduce((s, c) => s + (Number(c.ayuda) || 0), 0);
    const deAnio = anio ? ` de ${anio}` : '';
    const n = Math.max(0, Number(requerimientos) || 0);
    const tramite = n >= 1
        ? `La tramitación ha requerido contestar ${n === 1 ? 'un requerimiento' : `${n} requerimientos`} del Ministerio hasta la emisión definitiva de los certificados.`
        : 'La tramitación ha incluido la verificación de las actuaciones, su presentación ante el Ministerio y la emisión de los certificados.';
    // Al canal general de una empresa se le escribe en plural (no hay a quién tutear).
    const escribimos = nombre ? 'Te escribimos para comunicarte' : 'Os escribimos para comunicaros';
    const linea = (c) => `• ${c.nombre}${c.direccion ? ` — ${c.direccion}` : ''}: ${eurMsg(Number(c.ayuda) || 0)}`;

    let cuerpo;
    if (lista.length === 1) {
        const c = lista[0];
        cuerpo = [`${escribimos} que ya hemos abonado a ${c.nombre} la ayuda de los Certificados de Ahorro Energético de vuestra instalación${deAnio}${c.direccion ? ` en ${c.direccion}` : ''}: ${eurMsg(Number(c.ayuda) || 0)}.`];
    } else {
        cuerpo = [
            `${escribimos} que ya hemos abonado las ayudas de los Certificados de Ahorro Energético a los clientes de ${lista.length} de vuestras instalaciones${deAnio}:`,
            '',
            ...lista.map(linea),
            '',
            `Importe total abonado: ${eurMsg(total)}.`,
        ];
    }
    return [
        nombre ? `Hola, ${nombre}:` : 'Hola:',
        '',
        ...cuerpo,
        '',
        tramite,
        '',
        'Gracias por vuestra colaboración. Si tenéis nuevas obras en marcha, estaremos encantados de tramitarlas.',
        '',
        '¡Seguimos!',
        '',
        'Un saludo,',
        'El equipo de BROKERGY',
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
