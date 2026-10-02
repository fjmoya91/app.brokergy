// ─── justificacionMedidas.js ─────────────────────────────────────────────────
// La JUSTIFICACIÓN de cada medida de mejora y su lugar en la SECUENCIA.
//
// En CE3X 3.1 cada conjunto de medidas lleva dos campos nuevos —`ordenPrioridad`
// y `justificacion`— que imprime el apartado 3 del Anexo III del certificado:
// «Propuesta de secuencia temporal de las medidas de mejora» (orden de
// ejecución + JUSTIFICACIÓN). Sin ellos ese cuadro sale vacío.
//
// REGLA — la SECUENCIA es la de la buena práctica: primero la ENVOLVENTE
// (reducir la demanda), después el GENERADOR (dimensionado a la demanda ya
// reducida) y al final las RENOVABLES (ajustadas al consumo eléctrico que
// resulte). Cada texto dice por qué va en su sitio, así que se leen bien juntos
// y en el orden que los imprime el certificado.
//
// REGLA — sin rayas, letras griegas ni subíndices (CO2, no CO₂): el texto va a
// un .cex, que se guarda en latin-1, y un carácter fuera tumba el fichero.
//
// REGLA — el texto va en LLANO y sin el nombre de la medida: el nombre lo pone
// el motor delante («NOMBRE: …») con el que tenga el conjunto en el fichero
// (el certificador puede haberlo reescrito), y los `<br>` de la 3.1 también.

//: El orden de ejecución de cada familia de medidas.
export const SECUENCIA = { envolvente: 1, generador: 2, renovable: 3 };

const DESPUES_ENVOLVENTE = 'Se ejecuta en primer lugar, junto al resto de actuaciones sobre la '
    + 'envolvente: reducir la demanda antes de intervenir en las instalaciones permite dimensionar '
    + 'los nuevos equipos a la demanda real del edificio, con menor potencia, menor inversión y '
    + 'mejor rendimiento estacional.';

const TEXTOS = {
    cubierta: ({ u }) => 'La cubierta es el cerramiento con mayores pérdidas por transmisión del '
        + 'edificio: es el más expuesto a la intemperie, recibe la radiación solar directa en verano '
        + 'y por ella escapa el aire caliente que asciende en invierno. Su transmitancia actual'
        + `${u ? ` (${u} W/m²·K)` : ''} está muy por encima de la que exige hoy el Código Técnico de la `
        + 'Edificación, por lo que aislarla es la actuación de envolvente con mejor relación entre '
        + 'inversión y reducción de la demanda de calefacción y refrigeración, y mejora además el '
        + `confort de las estancias bajo cubierta en verano. ${DESPUES_ENVOLVENTE}`,

    fachada: ({ u }) => 'Las fachadas son la mayor superficie de la envolvente en contacto con el '
        + `exterior y, con una transmitancia actual${u ? ` de ${u} W/m²·K` : ' elevada'}, son responsables `
        + 'de una parte importante de las pérdidas de calor del edificio, a las que se suman los '
        + 'puentes térmicos de frentes de forjado y pilares. Su aislamiento reduce la demanda de '
        + 'calefacción y refrigeración, elimina el riesgo de condensaciones superficiales y mejora '
        + `el confort junto a los muros. ${DESPUES_ENVOLVENTE}`,

    ventanas: () => 'Los huecos actuales, con acristalamiento de baja prestación y marcos sin '
        + 'rotura de puente térmico, tienen una transmitancia muy superior a la del resto de la '
        + 'envolvente y son la principal vía de infiltraciones de aire no controladas. Su sustitución '
        + 'por carpinterías con rotura de puente térmico y doble acristalamiento bajo emisivo reduce '
        + 'las pérdidas por transmisión y por infiltración, limita las ganancias solares en verano, '
        + `elimina las condensaciones y mejora el aislamiento acústico. ${DESPUES_ENVOLVENTE}`,

    aerotermia: () => 'El generador de combustión actual, de bajo rendimiento estacional, concentra '
        + 'la mayor parte del consumo de energía primaria no renovable y de las emisiones de CO2 del '
        + 'edificio. Su sustitución por una bomba de calor aerotérmica, que aprovecha la energía '
        + 'renovable contenida en el aire exterior con un rendimiento estacional (SCOP) varias veces '
        + 'superior al de una caldera, es la medida que más reduce el consumo de energía primaria no '
        + 'renovable y las emisiones de todas las analizadas, y se integra en la instalación existente '
        + 'sin modificar los emisores. Se ejecuta después de las mejoras de la envolvente, si las hay, '
        + 'para dimensionar el equipo a la demanda ya reducida.',

    hibridacion: () => 'La calefacción del edificio depende de una caldera de combustión que '
        + 'concentra la mayor parte de su consumo de energía primaria no renovable. Incorporar una '
        + 'bomba de calor aerotérmica funcionando en paralelo con la caldera existente permite cubrir '
        + 'con energía renovable del aire exterior la mayor parte de la demanda anual, reservando la '
        + 'caldera para los periodos de máxima demanda y temperaturas exteriores más bajas, en los que '
        + 'la bomba de calor rinde menos. Es una solución de menor inversión que la sustitución '
        + 'completa, aprovecha el generador y los emisores existentes y garantiza el servicio en todo '
        + 'momento. Se ejecuta después de las mejoras de la envolvente, si las hay.',

    retirada: () => 'Con la bomba de calor ya en funcionamiento, la caldera que permanece como '
        + 'apoyo aporta el único consumo de combustible fósil que queda en el edificio. Ampliar la '
        + 'cobertura de la bomba de calor al 100 % de la demanda y retirar la caldera elimina ese '
        + 'consumo y sus emisiones directas de CO2, y suprime el mantenimiento y las inspecciones '
        + 'periódicas del generador de combustión.',

    autoconsumo: ({ conAerotermia }) => (conAerotermia
        ? 'Tras la electrificación de la calefacción y del agua caliente sanitaria, el consumo de '
          + 'energía del edificio pasa a ser fundamentalmente eléctrico y la bomba de calor es su '
          + 'principal consumidor. '
        : 'El consumo eléctrico del edificio (climatización, agua caliente, iluminación y equipos) '
          + 'supone una parte relevante de su consumo de energía primaria no renovable. ')
        + 'Una instalación de autoconsumo fotovoltaico cubre una parte de ese consumo con energía '
        + 'renovable generada en el propio edificio, lo que reduce directamente el consumo de energía '
        + 'primaria no renovable y las emisiones de CO2, con un periodo de amortización corto. Su '
        + 'producción se aprovecha mejor programando en las horas de sol la preparación del agua '
        + 'caliente sanitaria y la climatización. Se propone en último lugar porque su potencia debe '
        + 'ajustarse al consumo eléctrico que resulte de las medidas anteriores, evitando '
        + 'sobredimensionar la instalación.',
};

const FAMILIA = {
    cubierta: 'envolvente', fachada: 'envolvente', ventanas: 'envolvente',
    aerotermia: 'generador', hibridacion: 'generador', retirada: 'generador',
    autoconsumo: 'renovable',
};

/** Los tipos de medida con justificación, en el orden en que se ejecutan. */
export const TIPOS_JUSTIFICACION = Object.keys(TEXTOS)
    .sort((a, b) => SECUENCIA[FAMILIA[a]] - SECUENCIA[FAMILIA[b]]);

/**
 * La justificación de una medida y su lugar en la secuencia.
 *
 * @param {string} tipo  cubierta | fachada | ventanas | aerotermia | hibridacion
 *                       | retirada | autoconsumo
 * @param {object} ctx   `u` (transmitancia actual, en texto), `conAerotermia`
 * @returns {{ justificacion: string, secuencia: number } | null}
 */
export function justificacionMedida(tipo, ctx = {}) {
    const f = TEXTOS[tipo];
    if (!f) return null;
    return { justificacion: f(ctx), secuencia: SECUENCIA[FAMILIA[tipo]] };
}
