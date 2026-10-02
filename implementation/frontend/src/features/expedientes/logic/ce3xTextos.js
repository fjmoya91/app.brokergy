import { buildMedidaMejora } from './ce3xFinal.js';
import { tieneFotovoltaica, potenciaTexto, normalizarFotovoltaica } from './fotovoltaica.js';
import { autoconsumoMaximo } from './autoconsumoMaximo.js';
import { parseEmisionesTotalesFromXml } from '../../calculator/logic/xmlCeeParser.js';
import { justificacionMedida } from '../../cee-envolvente/logic/justificacionMedidas.js';

// ─── ce3xTextos.js ───────────────────────────────────────────────────────────
// La CAJA DE HERRAMIENTAS del certificador: lo que hay que teclear a mano en
// CE3X y que no se puede sacar del .xml.
//
// Por qué existe: el CE3X tiene un puñado de cuadros que se rellenan SIEMPRE
// con lo mismo —el conjunto de medidas de mejora, las pruebas realizadas en la
// visita— y que hoy se escriben de memoria o se pegan del último certificado.
// Escritos de memoria salen cada vez distintos; pegados del anterior arrastran
// la vivienda de otro. Aquí están una vez, y se copian.
//
// Hay DOS clases de texto y no se mezclan:
//   · FIJOS — no dependen del expediente (el autoconsumo, las pruebas).
//   · REDACTADOS — la medida de la aerotermia, que se escribe con los datos de
//     ESTE expediente. Su redacción NO se hace aquí: se pide a
//     `buildMedidaMejora`, la misma que usan el popup «Datos del equipo» y el
//     encargo al certificador. Si se redactara otra vez, el certificador podría
//     leer un criterio en el WhatsApp del encargo y ver otro en pantalla.
//
// REGLA — un texto se copia TAL CUAL va a la casilla. Nada de rótulos, viñetas
// añadidas ni comillas de adorno: lo que se copia se pega en un cuadro del
// CE3X y cualquier añadido hay que borrarlo a mano justo ahí.
//
// REGLA — el reparto en `campos` es el de las CASILLAS del programa, no el de
// la pantalla. El conjunto de medidas del autoconsumo son tres casillas
// separadas y por eso se copian por separado; las pruebas son UN cuadro de
// texto y se copia entero.

// Las pruebas, comprobaciones e inspecciones de la visita. Es un párrafo largo
// que se pega en el cuadro homónimo del CE3X y viaja al PDF del certificado.
export const PRUEBAS_CERTIFICADOR = `Se ha realizado la visita al inmueble, llevando a cabo las siguientes verificaciones:

-Medición de alturas y longitudes de las fachadas.
-Medición de los huecos y acristalamientos.
-Verificación, ubicación y medición de los voladizos.
-Comprobación de distancias, alturas y ubicaciones de los edificios que proyectan sombras sobre el inmueble.
-Revisión de las instalaciones del inmueble.
-Dado que no se dispone de información detallada sobre las capas que conforman las particiones interiores y los forjados, se ha considerado una masa media para las particiones interiores.

La información relativa a la propiedad del inmueble objeto del presente Certificado Energético ha sido proporcionada verbalmente por el cliente.

Para la certificación energética, se ha utilizado la "consulta descriptiva y gráfica de datos catastrales" obtenida de la Dirección General del Catastro.

El Certificado Energético se ha elaborado conforme a la normativa vigente y ofrece información exclusivamente sobre la eficiencia energética del inmueble.

Las cifras sobre el consumo de energía y las emisiones de CO2 expresadas en este Certificado Energético han sido obtenidas mediante el uso profesional del programa reconocido CE3X, bajo condiciones teóricas normales de uso. Por lo tanto, los valores reales de ambos conceptos pueden variar según las condiciones de funcionamiento del inmueble y otros factores.

El técnico certificador advierte que la calificación obtenida podría verse afectada si se modifican los datos contemplados en el momento de la visita.

Para el cálculo del SCOP se han utilizado las fichas técnicas de los fabricantes correspondientes a la zona climática de la vivienda analizada.
Para el cálculo de la producción de energía fotovoltaica se ha recurrido al software reconocido PVGIS.`;

// Las RECOMENDACIONES DE USO del edificio: el apartado 1 del Anexo III del
// certificado («Recomendaciones de uso del edificio o parte del edificio», art.
// 8 del RD 390/2021). En CE3X 3.1 es la casilla «Recomendaciones para un uso
// eficiente» de «Opciones del informe» (la 8.ª del informe, que la 2.3 no tiene).
//
// REGLA — son de USO, no de obra: lo que puede hacer quien vive en el edificio
// sin gastar dinero. Las mejoras de instalación o envolvente van en el apartado
// 2 (las medidas de mejora) y repetirlas aquí las contaría dos veces. Las cifras
// son las de las guías de ahorro del IDAE (19-21 °C de día, 15-17 °C de noche,
// ~7 % de consumo por grado de más; 26 °C en verano) y la de 60 °C de
// acumulación, la de prevención de la legionela (RD 487/2022).
//
// La primera línea va en negrita en el PDF (CE3X la mete en un <h1>): es un
// encabezado, no una recomendación.
const RECOMENDACIONES_RESIDENCIAL = `Recomendaciones para un uso eficiente de la energía en la vivienda:
-Calefacción: mantener la temperatura de consigna entre 19 y 21 °C durante el día y entre 15 y 17 °C por la noche. Cada grado de más incrementa el consumo de calefacción en torno a un 7 %.
-Refrigeración: fijar la temperatura de consigna en torno a 26 °C. Una diferencia con el exterior de más de 12 °C no es necesaria para el confort y dispara el consumo.
-Programar la calefacción y la refrigeración con el termostato o cronotermostato según los horarios de ocupación, reduciendo la consigna cuando la vivienda esté desocupada. En bombas de calor y suelo radiante es más eficiente mantener una temperatura estable que hacer encendidos y apagados frecuentes.
-No cubrir los radiadores ni las unidades interiores con muebles, cortinas o ropa, y regular cada estancia con sus válvulas termostáticas, cerrando las de las estancias que no se usen.
-Mantener puertas y ventanas cerradas con la calefacción o la refrigeración en marcha. Para renovar el aire bastan 10 minutos de ventilación al día.
-En invierno, subir persianas y abrir cortinas en las horas de sol y cerrarlas al anochecer. En verano, proteger los huecos del sol en las horas centrales del día con persianas o toldos y ventilar por la noche, cuando el aire exterior es más fresco.
-Agua caliente sanitaria: mantener la temperatura de acumulación en 60 °C para prevenir la legionela, ducharse en lugar de bañarse, no dejar el grifo abierto y usar griferías con aireadores o limitadores de caudal.
-Realizar el mantenimiento periódico de las instalaciones térmicas por empresa habilitada, conforme al RITE: limpieza de filtros de los equipos de climatización, purga de los radiadores al inicio de la temporada y revisión de la caldera o la bomba de calor.
-Revisar el estado de burletes y juntas de puertas y ventanas para evitar infiltraciones de aire.
-Iluminación y electrodomésticos: aprovechar la luz natural, usar lámparas LED, elegir aparatos de clase energética alta y apagarlos del todo en lugar de dejarlos en espera.`;

// Las mismas en un edificio de uso TERCIARIO. Las temperaturas no se fijan con
// cifras de vivienda: en un local o un edificio público las limita la propia
// normativa (IT 3.8 del RITE) según su uso, y se remite a ella.
const RECOMENDACIONES_TERCIARIO = `Recomendaciones para un uso eficiente de la energía en el edificio:
-Calefacción y refrigeración: ajustar las temperaturas de consigna a los límites que fija la normativa para el uso del edificio (IT 3.8 del RITE). Cada grado de más en calefacción, o de menos en refrigeración, aumenta el consumo de forma apreciable.
-Programar los sistemas de climatización y ventilación según los horarios de ocupación y apagarlos o reducir su consigna fuera de ellos y en las zonas sin uso.
-Mantener cerradas puertas exteriores y ventanas con la climatización en marcha; en los accesos con mucho tránsito, usar el vestíbulo o las puertas automáticas.
-No obstruir los emisores ni las rejillas de impulsión y retorno con mobiliario o materiales.
-Aprovechar la radiación solar en invierno y proteger los huecos del sol en verano con las protecciones solares de que disponga el edificio.
-Agua caliente sanitaria: mantener la temperatura de acumulación en 60 °C para prevenir la legionela y usar griferías temporizadas o con limitadores de caudal.
-Realizar el mantenimiento periódico de las instalaciones térmicas por empresa habilitada, conforme al RITE, incluida la limpieza de filtros y la revisión de los generadores.
-Iluminación: aprovechar la luz natural, sectorizar el encendido por zonas, usar detectores de presencia en zonas de paso y aseos, y lámparas LED.
-Apagar equipos informáticos, de oficina y de iluminación al final de la jornada en lugar de dejarlos en espera.`;

/** El texto de recomendaciones de uso que toca, por el programa de CE3X. */
export function recomendacionesUso({ terciario = false } = {}) {
    return terciario ? RECOMENDACIONES_TERCIARIO : RECOMENDACIONES_RESIDENCIAL;
}

/**
 * Un texto del informe tal y como hay que escribirlo en CE3X 3.1.
 *
 * REGLA — en la 3.1 cada salto de línea lleva un `<br>` delante. CE3X 3.1 mete
 * el texto TAL CUAL en el XML del certificado como `data:text/html,<h1>…</h1>`,
 * y en HTML un salto de línea es un espacio: el PDF oficial sale con todo el
 * cuadro en un solo párrafo (medido con xml2cert el 02/10/2026; con `<br>` cada
 * línea sale en la suya). En la 2.3 NO: su PDF no es HTML y el `<br>` saldría
 * impreso. Es el mismo criterio que `informe_a_31` del motor.
 */
export function textoInformeCe3x31(texto) {
    const t = String(texto || '');
    if (!t || /<br\s*\/?>/i.test(t)) return t;
    return t.replace(/\r?\n/g, '<br>\n');
}

// El conjunto de medidas del AUTOCONSUMO FOTOVOLTAICO.
//
// REGLA — solo tiene sentido en el CEE FINAL. La característica dice
// expresamente "derivado del uso de la aerotermia": en el certificado del
// estado inicial esa aerotermia todavía no existe, así que proponerlo ahí
// describiría una vivienda que no es la del certificado.
// La casilla «Otros datos» del conjunto de medidas. Se copia a mano en CE3X y
// también viaja dentro del `.cex` que escribe el motor, así que vive aquí una
// sola vez: dos copias dirían plazos distintos.
export const OTROS_DATOS_MEDIDA = 'Plazo de amortización aproximado de 3 años.';

export const MEDIDA_AUTOCONSUMO = [
    {
        campo: 'Nombre conjunto medidas mejora',
        valor: 'AUTOCONSUMO FOTOVOLTAICO',
    },
    {
        campo: 'Características',
        parrafo: true,
        valor: 'Se propone como medida de mejora la instalación de autoconsumo fotovoltaico '
            + 'para reducir el consumo de energía primaria no renovable derivado del uso de la aerotermia',
    },
    {
        campo: 'Otros datos',
        valor: 'Plazo de amortización estimado de 3 años.',
    },
];

/** "el SCOP y el SEER" — para decir en una línea qué falta del párrafo. */
const enumerarFaltan = (arr) => (arr.length <= 1
    ? (arr[0] || '')
    : `${arr.slice(0, -1).join(', ')} y ${arr[arr.length - 1]}`);

const num2 = (n) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * El TECHO de autoconsumo declarable, con la fase de la que sale.
 *
 * REGLA — manda el CEE FINAL. Es donde se teclea esta medida (la característica
 * habla del consumo derivado del uso de la aerotermia) y su consumo eléctrico
 * es otro: con la bomba de calor puesta, el edificio gasta más electricidad y
 * el techo sube. Sin certificado final se cae al inicial, pero se DICE de cuál
 * es — declarar el del inicial creyéndolo del final se queda corto.
 *
 * El total eléctrico se rescata del XML crudo igual que en la barra ⚡: los CEE
 * cargados antes de que el parser leyera ese dato no lo tienen en el objeto
 * guardado, así que sin el rescate esto solo valdría para lo que se suba hoy.
 */
export function techoAutoconsumo(expediente) {
    const cee = expediente?.cee || {};
    for (const [fase, key, xmlKey] of [
        ['final', 'cee_final', 'xml_final'],
        ['inicial', 'cee_inicial', 'xml_inicial'],
    ]) {
        const sec = cee[key];
        const conTotal = sec?.emisionesTotalElectrico
            ? sec
            : { ...sec, ...parseEmisionesTotalesFromXml(cee[xmlKey]) };
        const auto = autoconsumoMaximo(conTotal);
        if (auto) return { ...auto, fase };
    }
    return null;
}

/**
 * Las chuletas de CE3X de ESTE expediente, en el orden en que se teclean.
 *
 * @param {object|null} expediente  con `instalacion` VIVA (ver la nota del popup)
 * @param {object} opts.modelos     fichas del catálogo ya traídas, por id
 * @returns {Array} secciones `{ id, titulo, resumen, nota?, aviso?, campos[] }`
 */
export function buildCe3xTextos(expediente, { modelos = {} } = {}) {
    const secciones = [];

    // ── La medida de la ACTUACIÓN, redactada ─────────────────────────────────
    // Va primero: es la medida que describe la obra de este expediente. Solo
    // aparece si el expediente declara equipo nuevo — en un CEE directo, que no
    // tiene instalación detrás, no hay actuación que redactar.
    const medida = expediente ? buildMedidaMejora(expediente, { modelos }) : null;
    if (medida) {
        secciones.push({
            id: 'medida_actuacion',
            titulo: 'Conjunto de medidas de mejora',
            resumen: 'La actuación de este expediente',
            aviso: medida.aviso || null,
            // Lo que no consta se queda como hueco VISIBLE "___" y se dice cuál:
            // un párrafo al que le falta el SCOP y no lo avisa se pega tal cual.
            nota: medida.faltan.length
                ? `⚠ Falta ${enumerarFaltan(medida.faltan)} en el expediente: donde va "___" hay que completarlo antes de pegarlo.`
                : null,
            campos: [
                { campo: 'Características', parrafo: true, valor: medida.texto },
                { campo: 'Otros datos', valor: OTROS_DATOS_MEDIDA },
            ],
        });
    }

    // ── Autoconsumo: MEJORA que proponer, o instalación que YA EXISTE ────────
    // REGLA — a quien ya tiene placas no se le propone ponerlas. Esa medida
    // describe una vivienda que no es la suya, y lo que el certificado necesita
    // es lo contrario: declarar la generación existente en el estado actual. El
    // dato lo contesta el cliente en la captación (`instalacion.fotovoltaica`).
    const fv = normalizarFotovoltaica(expediente?.instalacion?.fotovoltaica);

    // El TECHO de kWh que se puede declarar. Va DENTRO de la chuleta y no solo
    // en la barra ⚡ de la rejilla: es el último dato que se teclea de esta
    // medida, y tenerlo que ir a buscar a otra parte de la pantalla —con el
    // CE3X delante— es donde se acaba escribiendo una cifra de memoria.
    //
    // Se copia en CRUDO y con punto decimal (va a un formulario, no a un texto),
    // pero se ENSEÑA en formato español: la cifra hay que reconocerla de un
    // vistazo contra la de la barra.
    const techo = techoAutoconsumo(expediente);
    const campoTecho = techo && {
        campo: 'Autoconsumo máximo declarable',
        valor: `${num2(techo.kwhAnio)} kWh/año`,
        copia: techo.kwhAnio.toFixed(2),
        nota: `${num2(techo.emisiones)} kgCO₂/año ÷ ${String(techo.factor).replace('.', ',')}`
            + ` (factor de paso de la electricidad) · del CEE ${techo.fase}`,
    };
    // Sin ese dato no hay barra ⚡ a la que remitir: se dice por qué, en vez de
    // mandar a buscar un número que no está en ninguna parte.
    const notaSinTecho = techo
        ? null
        : 'No se puede calcular el máximo declarable: el CEE cargado no trae el total de emisiones por '
            + 'electricidad (pasa con los leídos por OCR de un PDF).';

    if (tieneFotovoltaica(fv)) {
        const p = potenciaTexto(fv);
        secciones.push({
            id: 'fv_existente',
            titulo: 'Autoconsumo fotovoltaico YA INSTALADO',
            resumen: 'Va en el estado actual, no como mejora',
            aviso: `La vivienda ya tiene autoconsumo fotovoltaico${p ? ` de ${p}` : ''}: hay que declararlo `
                + 'como instalación EXISTENTE (contribuciones energéticas), no proponerlo como medida de mejora.',
            nota: [
                p ? null : 'La potencia no consta en el expediente: hay que pedírsela al cliente (factura de la instalación o boletín eléctrico) antes de declararla.',
                notaSinTecho,
            ].filter(Boolean).join(' · ') || null,
            // El techo vale igual para la generación EXISTENTE: no se puede
            // declarar más autoconsumo que electricidad gasta el edificio.
            campos: campoTecho ? [campoTecho] : [],
        });
    } else {
        secciones.push({
            id: 'medida_autoconsumo',
            titulo: 'Conjunto de medidas de mejora',
            resumen: 'Autoconsumo fotovoltaico',
            nota: [
                notaSinTecho,
                fv.estado ? null : 'En el expediente no consta si la vivienda YA tiene placas: si las tiene, esta medida no aplica.',
            ].filter(Boolean).join(' · ') || null,
            campos: campoTecho ? [...MEDIDA_AUTOCONSUMO, campoTecho] : MEDIDA_AUTOCONSUMO,
        });
    }

    // Las dos casillas de texto de «Opciones del informe». Se enseña el texto
    // llano y se COPIA en la forma de la 3.1 (con `<br>`), que es con la que se
    // certifica desde el 01/10/2026; la de la 2.3, aparte.
    const notaBr = 'Se copia para CE3X 3.1, con <br> al final de cada línea: sin ellos el PDF del '
        + 'certificado junta todo el texto en un párrafo. Para CE3X 2.3, la casilla de abajo.';
    secciones.push({
        id: 'pruebas_certificador',
        titulo: 'Pruebas, comprobaciones e inspecciones',
        resumen: 'Realizadas por el técnico certificador',
        nota: notaBr,
        campos: [
            { campo: 'Para CE3X 3.1', parrafo: true, valor: PRUEBAS_CERTIFICADOR,
                copia: textoInformeCe3x31(PRUEBAS_CERTIFICADOR) },
            { campo: 'Para CE3X 2.3', valor: 'El mismo texto, sin los <br>', copia: PRUEBAS_CERTIFICADOR },
        ],
    });

    const recomendaciones = recomendacionesUso({
        terciario: /TER\d/i.test(String(expediente?.numero_expediente || '')),
    });
    secciones.push({
        id: 'recomendaciones_uso',
        titulo: 'Recomendaciones para un uso eficiente',
        resumen: 'Anexo III · 1. Recomendaciones de uso (solo CE3X 3.1)',
        nota: notaBr.replace(' Para CE3X 2.3, la casilla de abajo.', ' La 2.3 no tiene esta casilla.'),
        campos: [
            { campo: 'Texto completo', parrafo: true, valor: recomendaciones,
                copia: textoInformeCe3x31(recomendaciones) },
        ],
    });

    // La JUSTIFICACIÓN de cada medida (Anexo III, 3: «Propuesta de secuencia
    // temporal»). En CE3X 3.1 es la casilla «Justificación» de cada conjunto de
    // medidas; los .cex que genera la app ya la llevan, esto es para teclearla
    // a mano en una medida que se haya definido en CE3X.
    const conAerotermia = !!medida;
    const JUST = [
        ['Aislamiento de cubierta', 'cubierta'],
        ['Aislamiento de fachada', 'fachada'],
        ['Sustitución de ventanas', 'ventanas'],
        ['Sustitución por aerotermia', 'aerotermia'],
        ['Hibridación con aerotermia', 'hibridacion'],
        ['Retirada de la caldera de apoyo', 'retirada'],
        ['Autoconsumo fotovoltaico', 'autoconsumo'],
    ];
    secciones.push({
        id: 'justificacion_medidas',
        titulo: 'Justificación de las medidas',
        resumen: 'Anexo III · 3. Secuencia temporal (solo CE3X 3.1)',
        nota: 'Una por conjunto de medidas, en su casilla «Justificación». Orden de ejecución: '
            + 'primero la envolvente, después el generador y al final el autoconsumo.',
        campos: JUST.map(([campo, tipo]) => ({
            campo,
            parrafo: true,
            valor: justificacionMedida(tipo, { conAerotermia }).justificacion,
        })),
    });

    return secciones;
}
