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
        ayuda: 'Con aerotermia sube el consumo eléctrico y baja el de gas o gasóleo. Si la tarifa se queda como estaba, es fácil acabar pagando de más todos los meses.',
        lead: 'no_revisado',
        opciones: [
            {
                value: 'no_revisado',
                icono: '🔍',
                label: 'No lo he revisado',
                sub: 'Me interesa que le echéis un vistazo, sin compromiso',
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
        ayuda: 'Son el mejor acompañante de la aerotermia: producen la electricidad que la máquina consume. Las fotovoltaicas hacen ELECTRICIDAD — no son las del agua caliente.',
        lead: FV.FUTURO,
        // Sale precontestado con lo que el cliente dijo en la captación
        // (`instalacion.fotovoltaica`): aquí solo lo confirma o lo corrige.
        // Fuente única de los valores: logic/fotovoltaica.js.
        opciones: [
            {
                value: FV.SI,
                icono: '☀️',
                label: 'Sí, ya las tengo instaladas',
                sub: 'Autoconsumo eléctrico ya funcionando',
                corto: 'Ya tiene placas',
            },
            {
                value: FV.FUTURO,
                icono: '🌤️',
                label: 'No, pero me interesa ponerlas',
                sub: 'Me gustaría un estudio de viabilidad, sin compromiso',
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
export function bloquePago(costeSinIva) {
    const base = Number(costeSinIva) > 0 ? Number(costeSinIva) : COSTE_GESTION_DEFECTO;
    const iva = Math.round(base * IVA * 100) / 100;
    const total = Math.round((base + iva) * 100) / 100;
    const eur = (n) => `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
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
        opciones: [
            {
                value: 'descuento',
                icono: '✂️',
                label: `Descontádmelo del ingreso (${eur(base)})`,
                sub: `Lo más rápido y lo más barato: recibes el bono con la gestión ya descontada, sin IVA y sin más trámites.`,
                corto: 'Descuento sobre el bono',
                recomendada: true,
            },
            {
                value: 'factura',
                icono: '🧾',
                label: `Prefiero que me paséis factura (${eur(total)})`,
                // Las dos consecuencias, en el orden en que le duelen: primero que
                // cobra más tarde, después que le cuesta más.
                sub: `Te retrasa el cobro —el ingreso no sale hasta que la factura esté abonada— y te cuesta ${eur(iva)} más, porque por factura hay que repercutir el IVA que en el descuento no se aplica.`,
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
    const { clienteAsumeCoste = true, costeGestion = 0, solarPrevio = null, respuestas = {} } = ctx;
    const bloques = BLOQUES.map(b => ({
        ...b,
        // El precontestado del bloque solar sale de lo que ya nos dijo en la
        // captación. Volver a preguntárselo de cero después de haberlo contestado
        // es lo que hace que un formulario parezca que no se lee.
        valor: respuestas[b.id] ?? (b.id === 'solar' ? solarPrevio : null) ?? null,
        heredado: b.id === 'solar' && respuestas.solar == null && !!solarPrevio,
    }));
    if (clienteAsumeCoste) {
        const p = bloquePago(costeGestion);
        bloques.push({ ...p, valor: respuestas[p.id] ?? null, heredado: false });
    }
    return bloques;
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
