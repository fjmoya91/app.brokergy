/**
 * AVISO DEL FACTOR DE CORRECCIÓN (ficha RES060FC) — lo que se le cuenta al cliente
 * cuando la revisión de la ficha que está en consulta pública le daría MÁS bono.
 *
 * Fuente ÚNICA de la decisión (¿procede ofrecerlo?) y del texto. Hoy lo consume el
 * mensaje de envío de la propuesta (`ProposalModal.buildCaption` + el toggle de
 * `EnviarPropuestaModal`); si algún día va a otra superficie, se importa de aquí.
 *
 * REGLA — el importe del FC NO es una promesa, y el texto lo dice con esas palabras.
 * La ficha RES060FC es un BORRADOR en consulta pública: puede cambiar y puede no
 * aprobarse. Un mensaje que anuncie 2.645 € sin decirlo convierte una posibilidad en
 * un compromiso, y el cliente firma la propuesta contando con un dinero que nadie le
 * ha prometido. Por eso el párrafo termina SIEMPRE repitiendo la cifra firme, que es
 * la de la propuesta que lleva delante.
 *
 * REGLA — solo se ofrece si el FC es MAYOR. Es la razón de ser del aviso ("hay
 * propuestas muy bajas que con el FC mejorarían"). Si sale igual o menor, decírselo
 * al cliente no le da nada que decidir y le mete una duda sobre la única cifra firme.
 *
 * REGLA — solo cuando la propuesta incluye la opción de AEROTERMIA. La RES060FC es la
 * revisión de la ficha RES060 (sustitución de caldera): en una propuesta que solo
 * ofrece rehabilitación (RES080) esa ficha no es la que se va a tramitar, y aplicarle
 * su factor sería prometer el bono de otra actuación.
 *
 * REGLA — es del flujo INTERNO. Lo decide quien envía (staff), caso a caso y con el
 * toggle apagado por defecto: hay clientes a los que esperar a enero les compensa y
 * otros a los que no. Nunca sale solo.
 */

/** Cuándo está previsto que entre en vigor la ficha revisada. */
export const FC_ENTRADA_VIGOR = 'enero de 2027';

/**
 * Desde cuándo podrían acogerse las actuaciones YA EJECUTADAS, según el borrador.
 * Es lo que permite decirle al cliente que no tiene que esperar para hacer la obra.
 */
export const FC_ACTUACIONES_DESDE = 'marzo de 2026';

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
 * ¿Procede ofrecer el aviso del FC en esta simulación, y si no, POR QUÉ?
 *
 * REGLA — devuelve SIEMPRE un estado con motivo, nunca null a secas. Un control
 * que desaparece sin explicación no se distingue de uno roto: el usuario no sabe
 * si es que su propuesta no lo admite o si la app ha dejado de funcionar.
 *
 * Compara SIEMPRE el bono de la opción de aerotermia (`result.financials`) contra
 * el que daría la ficha revisada (`result.financialsRes060FC`), que es la misma
 * comparación que hace la tarjeta RES060FC de la calculadora — no contra el bono
 * de la reforma, que se calcula con otra ficha.
 *
 * @returns {{procede:boolean, motivo:(string|null), actual:number, fc:number,
 *            extra:number, dosOpciones:boolean}}
 */
export function estadoFc(result, inputs) {
    const no = (motivo) => ({ procede: false, motivo, actual: 0, fc: 0, extra: 0, dosOpciones: false });

    const isReforma = cierto(inputs?.isReforma);
    // Propuesta de SOLO reforma: la ficha que se tramita no es la RES060.
    if (isReforma && inputs?.comparativaReforma === false) {
        return no('esta propuesta es solo de rehabilitación (RES080) y el factor de corrección revisa la ficha RES060');
    }

    const fc = result?.res060fc;
    if (!fc) return no('falta la provincia de la vivienda, y la demanda del Anexo IV va por provincia');
    if (fc.noAnexoData) return no(`el Anexo IV del borrador no trae datos para ${fc.provinciaNombre || 'esta provincia'}`);
    if (!(fc.cae > 0) || !result?.financialsRes060FC) return no('con esta ficha el ahorro computable sale a cero');

    const actual = Math.round(result?.financials?.caeBonus || 0);
    const conFc = Math.round(result.financialsRes060FC.caeBonus || 0);
    if (!(conFc > actual)) {
        return no(`con la ficha nueva el bono NO sube (saldrían ${fmt(conFc)} € frente a los ${fmt(actual)} € de esta propuesta)`);
    }

    return {
        procede: true,
        motivo: null,
        actual,
        fc: conFc,
        extra: conFc - actual,
        // Con comparativa (aerotermia + reforma) el bono de arriba es el de la Opción 1:
        // hay que nombrarla, o el cliente no sabe a cuál de las dos se refiere el aviso.
        dosOpciones: isReforma && inputs?.comparativaReforma !== false,
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
 * @param {number}  fc           Bono que saldría con la ficha revisada.
 * @param {boolean} tuteo        true = cliente final; false = partner/instalador.
 * @param {boolean} dosOpciones  La propuesta lleva aerotermia + reforma.
 */
export function lineaFactorCorreccion({ actual = 0, fc = 0, tuteo = true, dosOpciones = false } = {}) {
    const t = (a, b) => (tuteo ? a : b);
    const cual = dosOpciones ? 'de la Opción 1 (aerotermia)' : 'de la instalación de aerotermia';

    const p1 = `📅 *Cambio de normativa previsto — el bono podría ser mayor.* El Ministerio tiene en consulta pública una revisión de la ficha con la que se calcula este Bono Energético (incorpora un factor de corrección). Si se aprueba tal y como está el borrador, el bono ${cual} pasaría de *${fmt(actual)} €* a unos *${fmt(fc)} €*.`;

    const p2 = `Su entrada en vigor está prevista para ${FC_ENTRADA_VIGOR}, y el borrador contempla que puedan acogerse también las actuaciones ejecutadas desde ${FC_ACTUACIONES_DESDE} en adelante. Esta obra entra en ese supuesto, así que ${t('no tienes que esperar a nada: puedes ejecutarla cuando te venga bien', 'el cliente no tiene que esperar a nada: la obra puede ejecutarse cuando os venga bien')} y, si finalmente se aprueba y ${t('te', 'le')} resulta más beneficioso, ${t('tramitaríamos tu bono', 'tramitaríamos el bono')} en ${FC_ENTRADA_VIGOR.split(' ')[0]} con la ficha nueva.`;

    const p3 = `Es un borrador en consulta pública: puede cambiar o no llegar a aprobarse, así que esa cifra no está garantizada. El importe firme de esta propuesta es el de *${fmt(actual)} €*.`;

    return `${p1}\n\n${p2}\n\n${p3}`;
}
