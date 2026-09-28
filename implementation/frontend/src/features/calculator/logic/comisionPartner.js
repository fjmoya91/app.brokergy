/**
 * comisionPartner — la COMISIÓN del partner (prescriptor): cómo se expresa en %
 * y cómo se le anuncia en el mensaje de la propuesta.
 *
 * FUENTE ÚNICA. La usan el panel de margen de la calculadora, la comisión por
 * defecto de la ficha del partner y el mensaje de envío de la propuesta: si cada
 * uno calculara el % a su manera, el partner leería en su mensaje una cifra que
 * no es la que se pactó en su ficha.
 *
 * REGLA — la comisión se GUARDA en €/MWh (es lo que consume `calculateFinancials`)
 * y el % es solo otra forma de teclearla. Ese % se expresa SOBRE LO QUE SE LE
 * OFRECE AL CLIENTE (`caePriceClient`, el precio CAE de la propuesta), no sobre
 * el precio que paga el Sujeto Obligado: es el precio que el partner conoce y el
 * que tiene delante, y con él "un 20 %" significa lo mismo en todas las
 * simulaciones aunque el precio del S.O. cambie de una a otra.
 *
 * REGLA — el precio de referencia es el de la tarifa ANTES de descontar la
 * comisión. Con la comisión restada del cliente (`prescriptorMode: 'client'`) el
 * cliente acaba cobrando 80 €/MWh de los 100 ofrecidos; tomar esos 80 como base
 * haría el % circular (la comisión dependería de sí misma).
 *
 * REGLA — el importe que se le anuncia al partner es el de ESTA simulación, y se
 * dice que es una estimación: se cobra solo si el expediente sale favorable en la
 * verificación y se liquida sobre el ahorro VERIFICADO (la economía verificada del
 * expediente recalcula con los mismos €/MWh), así que puede moverse. Prometerle
 * una cifra cerrada es la forma de tener una discusión el día del pago. Pero esa
 * mecánica NO se le cuenta con cifras: ver `lineaComisionPartner`.
 */

// Se redondea a 2 decimales para que no salga 6.2500000001 al teclear.
const r2 = (n) => Math.round(n * 100) / 100;

/** % que representa la comisión sobre el precio ofrecido al cliente. */
export function pctDeComision(eurMwh, precioCliente) {
    const eur = parseFloat(eurMwh) || 0;
    const base = parseFloat(precioCliente) || 0;
    return base > 0 ? r2((eur / base) * 100) : 0;
}

/** €/MWh que corresponden a un % del precio ofrecido al cliente. */
export function comisionDePct(pct, precioCliente) {
    const p = parseFloat(pct) || 0;
    const base = parseFloat(precioCliente) || 0;
    return r2((base * p) / 100);
}

/** €/MWh de comisión que aplica ESTA simulación (0 si el toggle está apagado). */
export function comisionEurMwh(inputs) {
    if (!inputs?.includeCommission) return 0;
    return Math.max(0, parseFloat(inputs.caePricePrescriptor) || 0);
}

const eurFmt = (n) => new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: 0, maximumFractionDigits: 0, useGrouping: true,
}).format(Math.round(n || 0));

const pctFmt = (n) => new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: 0, maximumFractionDigits: 2, useGrouping: true,
}).format(n || 0);

/**
 * Párrafo del mensaje al PARTNER con lo que ganaría por el expediente.
 *
 * REGLA — al partner se le da su PORCENTAJE y el IMPORTE, y nada más: ni los
 * MWh de ahorro ni los €/MWh. Con esas dos cifras rehace en un segundo el precio
 * al que se vende el ahorro y el margen de BROKERGY; lo que se pactó con él es un
 * %, y eso es lo que se le repite. Por lo mismo, la variación se explica por "el
 * resultado de la verificación", sin hablar del ahorro.
 *
 * @param {number} pct         % pactado, sobre lo ofrecido al cliente (0 = no se dice)
 * @param {Array}  opciones    [{ etiqueta?: string, importe: number }]
 *                             Una sola opción → una línea; varias (comparativa
 *                             aerotermia/envolvente o CEE aportado/nuevo) → una
 *                             viñeta por opción, porque la comisión es distinta en
 *                             cada una y el partner tiene que saber cuál cobra.
 * @returns {string} '' si no hay comisión que anunciar.
 */
export function lineaComisionPartner({ pct = 0, opciones = [] } = {}) {
    const validas = (opciones || []).filter(o => (parseFloat(o?.importe) || 0) > 0);
    if (!validas.length) return '';

    const p = parseFloat(pct) || 0;
    // Se dice SOBRE QUÉ es el %: el mensaje enseña el bono que cobra el cliente,
    // que con la comisión restada a él es MENOR que lo ofrecido, y un "20 %" a
    // secas junto a esa cifra le da otra cuenta (460 sobre 1.840 = 25 %).
    const suPct = p > 0 ? ` (vuestro ${pctFmt(p)} % sobre el bono que se le ofrecería al cliente)` : '';

    let cifra;
    if (validas.length === 1) {
        cifra = `💰 *Vuestra comisión por este expediente: ${eurFmt(validas[0].importe)} € + IVA*${suPct}`;
    } else {
        const lineas = validas
            .map(o => `• ${o.etiqueta}: *${eurFmt(o.importe)} € + IVA*`)
            .join('\n');
        cifra = `💰 *Vuestra comisión por este expediente*${suPct}, según la opción que elija el cliente:\n${lineas}`;
    }

    return `${cifra}\n\nLa comisión se cobra *solo si el expediente sale favorable* en la verificación, y el importe definitivo se ajusta al resultado de esa verificación, así que puede variar algo respecto a esta estimación. Cuando vayamos a hacer el ingreso del bono al cliente, *os avisaremos también a vosotros* para liquidárosla.`;
}
