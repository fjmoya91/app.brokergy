/**
 * PRESUPUESTO ESTIMADO — cuando la simulación se calcula sin tener el presupuesto real.
 *
 * Fuente ÚNICA de la cifra de referencia y de lo que hay que contarle al cliente.
 * La consumen las cuatro superficies donde esto sale a la luz:
 *   · el funnel            (funnelToInputs → inputs.presupuestoEstimado)
 *   · la calculadora       (ResultsPanel / CalculatorForm: aviso al staff)
 *   · la PROPUESTA         (ProposalModal: portada, tabla, aviso, nota y mensaje de envío)
 *   · los mensajes al lead (backend leadMessages.presupuestoNote, por import() ESM)
 *
 * REGLA — el bono CAE NO depende del presupuesto y la DEDUCCIÓN sí. Es lo único que
 * el cliente necesita saber para decidir si espera al presupuesto definitivo o no:
 * el CAE se calcula sobre el ahorro de energía CERTIFICADO (kWh), así que el importe
 * que se le promete se mantiene tal cual; la deducción del IRPF es un porcentaje del
 * coste total de la ejecución IVA incluido, así que se mueve con el presupuesto. Decir
 * solo "es estimado" deja al cliente pensando que TODA la propuesta puede caerse.
 *
 * REGLA — sin deducción, ese segundo párrafo NO se escribe. En un titular empresa
 * (`includeIrpf: false`) o en un caso sin derecho a deducción, advertir de un efecto
 * sobre algo que no existe solo añade ruido a la única cifra que sí es firme.
 */

/** Media nacional de referencia para vivienda unifamiliar. */
export const PRESUPUESTO_ESTIMADO_EUR = 15000;

const fmt = (n) => `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(Number(n) || 0)} €`;

/**
 * ¿La simulación se calculó con el presupuesto de referencia en vez de con uno real?
 *
 * Lo sella el funnel (`funnelToInputs`) y lo LEVANTA cualquiera que teclee un
 * presupuesto en la calculadora: a partir de ese momento ya hay una cifra real y la
 * propuesta no puede seguir diciendo que es estimada.
 */
export function esPresupuestoEstimado(inputs) {
    return !!inputs?.presupuestoEstimado;
}

/**
 * El aviso, en sus dos registros: `tuteo` para el cliente final (funnel/landing) y
 * usted para la propuesta de la app.
 *
 * @param {boolean} conIrpf  Hay deducción en juego. Con false se omite su párrafo.
 * @param {boolean} tuteo    Tratamiento de tú (mensajes al lead) o de usted (propuesta).
 * @param {number}  importe  Cifra usada. Por defecto la de referencia.
 * @param {string}  quien    A quién pedirle el presupuesto real (el instalador partner).
 * @returns {{titulo: string, parrafos: string[]}}
 */
export function avisoPresupuestoEstimado({
    conIrpf = true,
    tuteo = false,
    importe = PRESUPUESTO_ESTIMADO_EUR,
    quien = null,
} = {}) {
    const t = (a, b) => (tuteo ? a : b);
    // Con partner, el cierre es una PETICIÓN (a él se le pide el presupuesto); sin
    // partner, una promesa. Encadenar las dos ("cuando lo tengas, pídeselo a X")
    // se contradice: si ya lo tienes, no hay nada que pedir.
    const cierre = quien
        ? t(`Pídele a ${quien} el presupuesto real de la instalación y te enviaremos la propuesta actualizada con las cifras exactas.`,
            `Solicite a ${quien} el presupuesto real de la instalación y le enviaremos la propuesta actualizada con las cifras exactas.`)
        : t('En cuanto lo tengas, te enviaremos la propuesta actualizada con las cifras exactas.',
            'En cuanto se disponga del presupuesto definitivo, le enviaremos la propuesta actualizada con las cifras exactas.');

    const parrafos = [
        `Esta propuesta se ha calculado con un presupuesto ESTIMADO de ${fmt(importe)} (media de referencia para vivienda unifamiliar), porque todavía no ${t('nos has facilitado', 'consta')} el de la instalación. ${cierre}`,
        `El Bono Energético CAE NO cambia: se calcula sobre el ahorro de energía certificado, no sobre el coste de la obra. El importe indicado se mantiene sea cual sea el presupuesto final.`,
    ];

    if (conIrpf) {
        parrafos.push(
            `Lo que sí variará es la deducción en el IRPF: es un porcentaje del coste total de la ejecución de la obra, IVA incluido. Si el presupuesto definitivo es mayor o menor, la deducción sube o baja con él (siempre hasta su límite legal), y con ella la inversión neta final.`
        );
    }

    return { titulo: `Presupuesto estimado de ${fmt(importe)}`, parrafos };
}

/** El mismo aviso en un solo párrafo, para WhatsApp / email / notas al pie. */
export function lineaPresupuestoEstimado(opts = {}) {
    return avisoPresupuestoEstimado(opts).parrafos.join(' ');
}
