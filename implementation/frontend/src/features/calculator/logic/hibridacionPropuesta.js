/**
 * HIBRIDACIÓN EN LA PROPUESTA — ¿cuánto cobra el cliente si RETIRA la caldera y
 * cuánto si la MANTIENE en apoyo? (2026-10-01)
 *
 * Con «Hibridación» marcada la simulación calcula el bono con la caldera en
 * servicio (RES093: el ahorro se pondera por el C_b). Pero el cliente casi
 * siempre puede elegir: si la desmonta, la bomba cubre el 100 % y el bono es el
 * de una sustitución (C_b = 1). La propuesta enseña las DOS cifras: una como
 * precio de la propuesta y la otra al lado, en color, diciendo cuánto cambia.
 *
 * REGLA — quien prepara la propuesta elige cuál va de PRECIO PRINCIPAL
 * (`inputs.hibridacionPropuesta`):
 *   · 'retira'   → el precio es SIN caldera; al lado, en rojo/naranja, cuánto
 *                  MENOS cobraría si la mantiene.
 *   · 'mantiene' → el precio es MANTENIENDO la caldera (lo de siempre); al lado,
 *                  en verde, cuánto MÁS cobraría si la retira.
 * Por defecto 'mantiene': es lo que la simulación ya calculaba y lo que se
 * enviaba hasta hoy.
 *
 * REGLA — «retirar» es DESMONTARLA Y SACARLA DE LA VIVIENDA. Dejarla en casa,
 * aunque sea desconectada, no vale: a efectos del CAE sigue siendo una
 * hibridación. Y se justifica con DOS fotos del mismo hueco: con la caldera
 * instalada y una vez quitada. El texto lo dice siempre que hay comparativa.
 *
 * Solo en la propuesta de AEROTERMIA: en una reforma (RES080) el ahorro sale de
 * los certificados y esta comparativa no es la que se tramita.
 */

export const HIBRIDACION_PROPUESTA = { RETIRA: 'retira', MANTIENE: 'mantiene' };

const cierto = (v) => v === true || v === 'true' || v === 1 || v === '1';

/** `normalizeData` pasa los enums a MAYÚSCULAS: se compara sin caja. */
export function modoHibridacionPropuesta(inputs) {
    return String(inputs?.hibridacionPropuesta || '').trim().toLowerCase() === HIBRIDACION_PROPUESTA.RETIRA
        ? HIBRIDACION_PROPUESTA.RETIRA
        : HIBRIDACION_PROPUESTA.MANTIENE;
}

const fmt = (n) => new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: 0, maximumFractionDigits: 0, useGrouping: true,
}).format(Math.round(Number(n) || 0));

/**
 * Las dos opciones de la propuesta, o null si no hay nada que comparar (sin
 * hibridación, en reforma, o si las dos cifras salen iguales).
 *
 * `principal` es la que va en la tabla y en los indicadores; `alternativa`, la
 * que se cita al lado. `conCaldera` / `sinCaldera` son siempre las mismas,
 * elija quien elija.
 */
export function opcionesHibridacion(result, inputs) {
    if (!cierto(inputs?.hibridacion) || cierto(inputs?.isReforma)) return null;
    const conCaldera = result?.financials;
    const sinCaldera = result?.financialsSinCaldera;
    if (!conCaldera || !sinCaldera) return null;
    const diferencia = Math.round(sinCaldera.caeBonus || 0) - Math.round(conCaldera.caeBonus || 0);
    if (diferencia <= 0) return null;
    const modo = modoHibridacionPropuesta(inputs);
    const retira = modo === HIBRIDACION_PROPUESTA.RETIRA;
    return {
        modo,
        retira,
        conCaldera,
        sinCaldera,
        principal: retira ? sinCaldera : conCaldera,
        alternativa: retira ? conCaldera : sinCaldera,
        diferencia,
    };
}

/**
 * El `result` que pinta la propuesta: con 'retira', los financieros SIN caldera
 * pasan a ser los de la propuesta (tabla, indicadores, cláusula y mensaje), y
 * los de la hibridación se guardan aparte para citarlos.
 */
export function resultParaPropuesta(result, inputs) {
    const op = opcionesHibridacion(result, inputs);
    if (!op || !op.retira) return result;
    return { ...result, financials: op.sinCaldera, financialsConCaldera: op.conCaldera };
}

/** La línea de color que va debajo del Bono CAE en la tabla. */
export function lineaTablaHibridacion(op) {
    if (!op) return null;
    return op.retira
        ? { tono: 'menos', texto: `Si mantiene la caldera en apoyo (hibridación): ${fmt(op.conCaldera.caeBonus)} € — ${fmt(op.diferencia)} € menos` }
        : { tono: 'mas', texto: `Si retira la caldera: ${fmt(op.sinCaldera.caeBonus)} € — ${fmt(op.diferencia)} € más` };
}

/**
 * MANTENIENDO LA CALDERA, EL BONO DEPENDE DEL CRITERIO QUE ACEPTE EL VERIFICADOR
 * (2026-10-21, decisión del usuario). La cobertura de la bomba se puede medir
 * sobre la carga de diseño (demanda y horas: el criterio que DEFENDEMOS, con
 * expedientes ya favorables) o sobre la potencia de la caldera instalada (el que
 * pueden exigir, y da bastante menos). Las dos cifras se le dicen al cliente
 * ANTES de aceptar, en un mensaje aparte, para que nadie pueda decir que no lo
 * sabía. El porqué de las horas no se explica: solo las dos cifras.
 *
 * Sale de `result.hipotesisHibridacion` (CalculatorView, los dos métodos con el
 * mismo SCOP y clima), elija lo que elija el selector «Base del % de cobertura».
 * null si no hay hibridación, en reforma, sin potencia de la caldera (ni tecleada
 * ni en la placa) o si el criterio de la caldera no da menos.
 */
export function hipotesisHibridacion(result, inputs) {
    if (!cierto(inputs?.hibridacion) || cierto(inputs?.isReforma)) return null;
    const h1 = result?.hipotesisHibridacion?.demanda;
    const h2 = result?.hipotesisHibridacion?.caldera;
    if (!h1 || !h2) return null;
    const defendida = Math.round(h1.caeBonus || 0);
    const potencia = Math.round(h2.caeBonus || 0);
    if (defendida <= potencia) return null;
    const sin = Math.round(result?.financialsSinCaldera?.caeBonus || 0);
    // Qué cifra lleva la propuesta adjunta, si es una de las dos (con «retirando»
    // es la de sin caldera y no se cita).
    const conCaldera = Math.round(result?.financials?.caeBonus || 0);
    const enPropuesta = modoHibridacionPropuesta(inputs) === HIBRIDACION_PROPUESTA.RETIRA ? null
        : conCaldera === defendida ? 1 : conCaldera === potencia ? 2 : null;
    return {
        defendida,
        potencia,
        potenciaCaldera: h2.potenciaCaldera,
        sinCaldera: sin > defendida ? sin : null,
        enPropuesta,
    };
}

const kw = (n) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(Number(n) || 0);

/** El recuadro que explica las dos opciones, debajo de la tabla. */
export function avisoHibridacion(op, hip = null) {
    if (!op && !hip) return null;
    const parrafos = [];
    let titulo = 'Bono manteniendo la caldera en apoyo';
    if (op) {
        titulo = op.retira
            ? 'Bono calculado RETIRANDO la caldera'
            : 'Bono calculado MANTENIENDO la caldera en apoyo';
        parrafos.push(op.retira
            ? `El Bono Energético CAE de esta propuesta (${fmt(op.sinCaldera.caeBonus)} €) supone retirar la caldera actual y que la aerotermia cubra toda la calefacción. Si decide mantenerla funcionando en apoyo (hibridación), el bono sería de ${fmt(op.conCaldera.caeBonus)} €: ${fmt(op.diferencia)} € menos.`
            : `El Bono Energético CAE de esta propuesta (${fmt(op.conCaldera.caeBonus)} €) supone mantener la caldera actual funcionando en apoyo de la aerotermia (hibridación). Si decide retirarla, el bono subiría a ${fmt(op.sinCaldera.caeBonus)} €: ${fmt(op.diferencia)} € más.`);
    }
    if (hip) {
        parrafos.push(`Manteniendo la caldera, el importe depende del criterio que se acepte en la verificación del expediente: lo solicitaremos por ${fmt(hip.defendida)} €, pero si se exige justificarlo con la potencia de la caldera instalada (${kw(hip.potenciaCaldera)} kW), el bono bajaría a ${fmt(hip.potencia)} €.`);
    }
    if (op) {
        parrafos.push('Retirar la caldera significa desmontarla y sacarla de la vivienda: no vale dejarla en casa, aunque esté desconectada. Para justificarlo hay que aportar una foto del hueco con la caldera instalada y otra del mismo hueco una vez quitada.');
    }
    return { titulo, parrafos };
}

/**
 * El mensaje APARTE con las dos hipótesis (WhatsApp: burbuja propia, la última;
 * email: al final del cuerpo). `b2b`: al partner, en tercera persona para que
 * pueda reenviárselo al cliente.
 */
export function mensajeHipotesisHibridacion(hip, { b2b = false } = {}) {
    if (!hip) return '';
    const t = b2b
        ? { si: 'Si el cliente mantiene su caldera', suya: 'que tiene instalada', retira: 'Si el cliente retira la caldera', cierre: 'No sabremos cuál de los dos aplican hasta que revisen el expediente; por eso os lo indicamos ya, para que el cliente lo tenga claro antes de decidir.' }
        : { si: 'Si decides mantener tu caldera', suya: 'que tienes instalada', retira: 'Si retiras la caldera', cierre: 'No sabremos cuál de los dos aplican hasta que revisen el expediente; por eso te lo indicamos ya desde ahora, para que lo tengas en cuenta al decidir.' };
    const nota = (n) => (hip.enPropuesta === n ? ' _(es la cifra de la propuesta adjunta)_' : '');
    const lineas = [
        '⚠️ *Importante: el bono si se mantiene la caldera*',
        `${t.si} funcionando junto a la aerotermia, el importe del Bono Energético CAE depende del criterio que se acepte en la verificación del expediente:`,
        `1️⃣ *Criterio que vamos a defender:* lo solicitaremos por *${fmt(hip.defendida)} €*${nota(1)}. Ya hemos tenido expedientes favorables con este criterio.`,
        `2️⃣ *Si no nos lo dan por válido* y nos piden justificarlo con la potencia de la caldera ${t.suya} (${kw(hip.potenciaCaldera)} kW), el bono bajaría a *${fmt(hip.potencia)} €*${nota(2)}.`,
        t.cierre,
    ];
    if (hip.sinCaldera) {
        lineas.push(`${t.retira} (desmontarla y sacarla de la vivienda), esto no aplica: el bono sería de *${fmt(hip.sinCaldera)} €*.`);
    }
    return lineas.join('\n\n');
}

/** Las líneas del mensaje de envío (WhatsApp / email). `b2b`: al partner, en tercera persona. */
export function mensajeHibridacion(op, { b2b = false } = {}) {
    if (!op) return '';
    const sujeto = b2b ? 'el cliente' : '';
    const cifras = op.retira
        ? (b2b
            ? `⚠️ *Caldera:* el bono está calculado RETIRANDO la caldera. Si ${sujeto} la mantiene en apoyo (hibridación), el bono sería de *${fmt(op.conCaldera.caeBonus)} €* (${fmt(op.diferencia)} € menos).`
            : `⚠️ *Caldera:* el bono está calculado RETIRANDO tu caldera. Si prefieres mantenerla en apoyo (hibridación), el bono sería de *${fmt(op.conCaldera.caeBonus)} €* (${fmt(op.diferencia)} € menos).`)
        : (b2b
            ? `💡 *Caldera:* el bono está calculado MANTENIENDO la caldera en apoyo. Si ${sujeto} la retira, el bono subiría a *${fmt(op.sinCaldera.caeBonus)} €* (${fmt(op.diferencia)} € más).`
            : `💡 *Caldera:* el bono está calculado MANTENIENDO tu caldera en apoyo. Si la retiras, el bono subiría a *${fmt(op.sinCaldera.caeBonus)} €* (${fmt(op.diferencia)} € más).`);
    const retirar = 'Retirarla significa desmontarla y sacarla de la vivienda (no vale dejarla en casa desconectada), y se justifica con una foto del hueco con la caldera instalada y otra del mismo hueco una vez quitada.';
    return `${cifras} ${retirar}`;
}
