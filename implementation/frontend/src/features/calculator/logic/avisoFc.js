/**
 * AVISO DEL FACTOR MULTIPLICADOR (fichas RES060_FM y RES09x_FM) — lo que se le
 * cuenta al cliente cuando la Resolución publicada (BOE-A-2026-23367, BOE de
 * 7/11/2026) le daría MÁS bono que la ficha vigente. El fichero conserva su nombre
 * de cuando era el borrador («FC», factor de corrección).
 *
 * Fuente ÚNICA de la decisión (¿procede ofrecerlo?) y del texto. Hoy lo consume el
 * mensaje de envío de la propuesta (`ProposalModal.buildCaption` + el toggle de
 * `EnviarPropuestaModal`); si algún día va a otra superficie, se importa de aquí.
 *
 * REGLA — el importe del FM NO es una promesa, y el texto lo dice con esas palabras.
 * La Resolución ya está publicada, pero tiene un CUPO (15 % de la obligación de
 * 2026) que se reparte por orden de fecha de resolución, y requisitos propios
 * (vivienda habitual, mantenimiento, fechas). Un mensaje que anuncie 2.645 € sin
 * decirlo convierte una posibilidad en un compromiso. Por eso el párrafo termina
 * SIEMPRE repitiendo la cifra firme, que es la de la propuesta que lleva delante.
 *
 * REGLA — solo se ofrece si el FM es MAYOR. Si sale igual o menor, decírselo al
 * cliente no le da nada que decidir y le mete una duda sobre la única cifra firme.
 *
 * REGLA — cada propuesta con SU ficha FM (09/11/2026, Fran: «tanto en RES060, RES093,
 * RES080, todos»). Con aerotermia, la RES060_FM o la RES09x_FM (`result.res060fc`);
 * en una propuesta SOLO de rehabilitación, la RES080_FM (`result.res080fm`), nunca
 * la RES060_FM: aplicarle el factor de la sustitución sería prometer el bono de otra
 * actuación. Sin los dos CEE simulados la cifra de la RES080_FM es una ESTIMACIÓN
 * (`estimada`) y se dice. Las opciones de la propuesta: `fmPropuesta.js`.
 *
 * REGLA — es del flujo INTERNO. Lo decide quien envía (staff), caso a caso y con el
 * toggle apagado por defecto: hay clientes a los que esperar a 2027 les compensa y
 * otros a los que no. Nunca sale solo.
 */

/** Desde cuándo se puede presentar por la vía del factor multiplicador. */
export const FM_PRESENTACION_DESDE_TXT = '15 de enero de 2027';
/** Alias de cuando era el borrador. */
export const FC_ENTRADA_VIGOR = FM_PRESENTACION_DESDE_TXT;

/**
 * Desde cuándo se acogen las actuaciones YA EJECUTADAS: las iniciadas desde esa
 * fecha (factura posterior al 22/03/2026: FM_INICIO_ACTUACIONES). Es lo que
 * permite decirle al cliente que no tiene que esperar para hacer la obra.
 */
export const FC_ACTUACIONES_DESDE = '22 de marzo de 2026';
/** Las facturas, anteriores a esta fecha (FM_FIN_FACTURAS + 1 día). */
export const FM_FACTURAS_ANTES_DEL_TXT = '1 de diciembre de 2027';

// Mismo formato que el resto del mensaje (`formatNumber` de ProposalModal):
// `useGrouping` explícito, porque el es-ES por defecto NO agrupa los números de
// cuatro cifras y "1493 €" quedaría distinto de los "1.493 €" de arriba.
const fmt = (n) => new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: 0, maximumFractionDigits: 0, useGrouping: true,
}).format(Math.round(Number(n) || 0));

/**
 * Normaliza un booleano que puede llegar como CADENA.
 *
 * `datos_calculo` guarda `isReforma: "false"`, y `!!"false"` es `true`: leído a
 * pelo, una propuesta de aerotermia cargada desde la BD se tomaría por reforma.
 */
const cierto = (v) => v === true || v === 'true' || v === 1 || v === '1';

/**
 * ¿Procede ofrecer el aviso del FM en esta simulación, y si no, POR QUÉ?
 *
 * REGLA — devuelve SIEMPRE un estado con motivo, nunca null a secas. Un control
 * que desaparece sin explicación no se distingue de uno roto: el usuario no sabe
 * si es que su propuesta no lo admite o si la app ha dejado de funcionar.
 *
 * Compara SIEMPRE el bono de la opción de aerotermia (`result.financials`) contra
 * el que daría la ficha FM (`result.financialsRes060FC`), que es la misma
 * comparación que hace la tarjeta FM de la calculadora — no contra el bono de la
 * reforma, que se calcula con otra ficha.
 *
 * @returns {{procede:boolean, motivo:(string|null), actual:number, fc:number,
 *            extra:number, dosOpciones:boolean}}
 */
export function estadoFc(result, inputs) {
    const no = (motivo) => ({ procede: false, motivo, actual: 0, fc: 0, extra: 0, dosOpciones: false });

    const isReforma = cierto(inputs?.isReforma);
    // Propuesta de SOLO reforma: su ficha FM es la RES080_FM, no la RES060_FM.
    if (isReforma && inputs?.comparativaReforma === false) return estadoFm080(result);

    const fc = result?.res060fc;
    if (!fc) return no('faltan la superficie y la demanda de calefacción con las que calcular la ficha FM');
    if (!(fc.cae > 0) || !result?.financialsRes060FC) return no('con esta ficha el ahorro computable sale a cero');
    // Lo que impide pedirlo (sin caldera, sólido, fechas…) lo decide el motor: un
    // bono que no se puede pedir no se anuncia, aunque salga más alto.
    const bloquea = (fc.avisos || []).find((a) => a.tono === 'bloquea');
    if (fc.elegible === false && bloquea) return no(`por el factor multiplicador no se podría pedir (${bloquea.texto})`);

    const actual = Math.round(result?.financials?.caeBonus || 0);
    const conFc = Math.round(result.financialsRes060FC.caeBonus || 0);
    if (!(conFc > actual)) {
        return no(`con el factor multiplicador el bono NO sube (saldrían ${fmt(conFc)} € frente a los ${fmt(actual)} € de esta propuesta)`);
    }

    return {
        procede: true,
        motivo: null,
        ficha: fc.ficha || 'RES060_FM',
        actual,
        fc: conFc,
        extra: conFc - actual,
        // Sin ACS en la simulación (Fran, 07/11/2026): la cifra FM lo SUPONE añadido
        // ('supuesto') o, sin SCOP_dhw, es solo la calefacción ('sin_scop'). El
        // párrafo tiene que decir que hay que añadir el depósito de ACS.
        acs: fc.acsSupuesto ? 'supuesto' : fc.acsSinScop ? 'sin_scop' : null,
        // Consumidor vulnerable (bono social de la luz): la ficha es la «-S», ×1,5.
        vulnerable: /-S$/.test(String(fc.ficha || '')),
        // Con comparativa (aerotermia + reforma) el bono de arriba es el de la Opción 1:
        // hay que nombrarla, o el cliente no sabe a cuál de las dos se refiere el aviso.
        dosOpciones: isReforma && inputs?.comparativaReforma !== false,
    };
}

/**
 * El mismo estado para la RES080_FM (rehabilitación): `result.res080fm` frente al
 * bono RES080 vigente (`result.financialsRes080`). Las mismas reglas que la
 * aerotermia: solo si sale MÁS y nada lo impide.
 */
export function estadoFm080(result) {
    const no = (motivo) => ({ procede: false, motivo, actual: 0, fc: 0, extra: 0, dosOpciones: false });
    const fm = result?.res080fm;
    if (!fm) return no('faltan los CEE de la reforma con los que calcular la ficha RES080_FM');
    const bloquea = (fm.avisos || []).find((a) => a.tono === 'bloquea');
    if (fm.elegible === false && bloquea) return no(`por el factor multiplicador no se podría pedir (${bloquea.texto})`);
    if (!(fm.cae > 0) || !result?.financialsRes080FM) return no('con la ficha RES080_FM el ahorro computable sale a cero');
    const actual = Math.round(result?.financialsRes080?.caeBonus || 0);
    const conFm = Math.round(result.financialsRes080FM.caeBonus || 0);
    if (!(conFm > actual)) {
        return no(`con el factor multiplicador el bono NO sube (saldrían ${fmt(conFm)} € frente a los ${fmt(actual)} € de esta propuesta)`);
    }
    return {
        procede: true,
        motivo: null,
        ficha: fm.ficha || 'RES080_FM',
        actual,
        fc: conFm,
        extra: conFm - actual,
        // Sin los dos CEE simulados, la cifra es una estimación desde el previo y el posterior.
        estimada: !!fm.estimada,
        acs: null,
        dosOpciones: false,
    };
}

/** Atajo: el estado solo cuando procede, o null. */
export function fcMejora(result, inputs) {
    const e = estadoFc(result, inputs);
    return e.procede ? e : null;
}

/**
 * El párrafo, en sus dos registros: al CLIENTE se le tutea; al partner/instalador se
 * le habla de "el cliente", que es a quien tiene que trasladárselo.
 *
 * @param {number}  actual       Bono de la propuesta (firme).
 * @param {number}  fc           Bono que saldría con el factor multiplicador.
 * @param {boolean} tuteo        true = cliente final; false = partner/instalador.
 * @param {boolean} dosOpciones  La propuesta lleva aerotermia + reforma.
 * @param {string|null} acs      `estadoFc().acs`: la simulación no lleva el ACS
 *                               ('supuesto': la cifra ya lo suma; 'sin_scop': no).
 *
 * REGLA — sin ACS, el párrafo dice que hay que AÑADIR EL DEPÓSITO DE ACS para ir
 * por esa vía (la Resolución pide que la bomba dé también el agua caliente) y, si
 * la cifra ya lo supone, que lo supone. Una cifra que cuenta un ACS que el
 * presupuesto no lleva, sin decirlo, es prometer el bono de otra instalación.
 */
export function lineaFactorCorreccion({ actual = 0, fc = 0, tuteo = true, dosOpciones = false, acs = null, ficha = null, estimada = false, vulnerable = false, hoja = false } = {}) {
    const t = (a, b) => (tuteo ? a : b);
    const reforma = String(ficha || '').startsWith('RES080');
    const cual = reforma ? 'de la reforma' : dosOpciones ? 'de la Opción 1 (aerotermia)' : 'de la instalación de aerotermia';
    const que = reforma
        ? 'multiplica el ahorro reconocido a la parte de la bomba de calor en una rehabilitación energética'
        : 'multiplica el ahorro reconocido al cambiar una caldera por una bomba de calor';

    const faltaAcs = acs === 'supuesto' || acs === 'sin_scop'
        ? ` Para ir por esa vía la aerotermia tiene que dar también el agua caliente sanitaria (ACS), así que habría que añadir ${t('a la instalación', 'al presupuesto')} el depósito de ACS${acs === 'supuesto' ? ': esa cifra ya lo tiene en cuenta' : ''}.`
        : '';
    // RES080_FM sin los dos CEE simulados: la cifra es una estimación (logic/res080fm.js).
    const aprox = estimada
        ? ' Es una estimación: para afinarla hay que hacer dos certificados energéticos simulados más, que hacemos nosotros.'
        : '';

    // Consumidor vulnerable (09/11/2026): la cifra ya lleva el ×1,5, y eso hay que
    // ACREDITARLO (bono social de la luz en vigor), o vuelve a la de sin él.
    const vuln = vulnerable
        ? ` Esa cifra ya cuenta el ×1,5 de consumidor vulnerable, por ${t('tener', 'tener el cliente')} el bono social de la luz: habrá que acreditarlo con la factura.`
        : '';

    const p1 = `📅 *Nueva normativa — el bono podría ser mayor.* El BOE del 7 de noviembre de 2026 ha publicado una resolución del Ministerio que ${que} (el «factor multiplicador»). Con ella, el bono ${cual} pasaría de *${fmt(actual)} €* a unos *${fmt(fc)} €*.${vuln}${aprox}${faltaAcs}`;

    const p2 = `Se acogen las actuaciones iniciadas desde el ${FC_ACTUACIONES_DESDE}, con las facturas antes del ${FM_FACTURAS_ANTES_DEL_TXT}, y se presentan a partir del ${FM_PRESENTACION_DESDE_TXT}. Esta obra entra en ese supuesto, así que ${t('no tienes que esperar a nada: puedes ejecutarla cuando te venga bien', 'el cliente no tiene que esperar a nada: la obra puede ejecutarse cuando os venga bien')} y, si ${t('te', 'le')} resulta más beneficioso, ${t('tramitaríamos tu bono', 'tramitaríamos el bono')} a partir del ${FM_PRESENTACION_DESDE_TXT} por esa vía.`;

    // La hoja 2 del PDF lo explica entero: el mensaje remite a ella.
    const verHoja = hoja ? ` ${t('Te lo explicamos', 'Lo explicamos')} en la página 2 de la propuesta.` : '';
    const p3 = `Tiene un cupo limitado que se reparte por orden de resolución, y requisitos propios (entre ellos, que sea la vivienda habitual), así que esa cifra no está garantizada. El importe firme de esta propuesta es el de *${fmt(actual)} €*.${verHoja}`;

    return `${p1}\n\n${p2}\n\n${p3}`;
}
