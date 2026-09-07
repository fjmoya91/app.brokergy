import { buildMedidaMejora } from './ce3xFinal.js';
import { tieneFotovoltaica, potenciaTexto, normalizarFotovoltaica } from './fotovoltaica.js';

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
const PRUEBAS_CERTIFICADOR = `Se ha realizado la visita al inmueble, llevando a cabo las siguientes verificaciones:

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

// El conjunto de medidas del AUTOCONSUMO FOTOVOLTAICO.
//
// REGLA — solo tiene sentido en el CEE FINAL. La característica dice
// expresamente "derivado del uso de la aerotermia": en el certificado del
// estado inicial esa aerotermia todavía no existe, así que proponerlo ahí
// describiría una vivienda que no es la del certificado.
const MEDIDA_AUTOCONSUMO = [
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
                { campo: 'Otros datos', valor: 'Plazo de amortización aproximado de 3 años.' },
            ],
        });
    }

    // ── Autoconsumo: MEJORA que proponer, o instalación que YA EXISTE ────────
    // REGLA — a quien ya tiene placas no se le propone ponerlas. Esa medida
    // describe una vivienda que no es la suya, y lo que el certificado necesita
    // es lo contrario: declarar la generación existente en el estado actual. El
    // dato lo contesta el cliente en la captación (`instalacion.fotovoltaica`).
    const fv = normalizarFotovoltaica(expediente?.instalacion?.fotovoltaica);
    if (tieneFotovoltaica(fv)) {
        const p = potenciaTexto(fv);
        secciones.push({
            id: 'fv_existente',
            titulo: 'Autoconsumo fotovoltaico YA INSTALADO',
            resumen: 'Va en el estado actual, no como mejora',
            aviso: `La vivienda ya tiene autoconsumo fotovoltaico${p ? ` de ${p}` : ''}: hay que declararlo `
                + 'como instalación EXISTENTE (contribuciones energéticas), no proponerlo como medida de mejora.',
            nota: p
                ? null
                : 'La potencia no consta en el expediente: hay que pedírsela al cliente (factura de la instalación o boletín eléctrico) antes de declararla.',
            campos: [],
        });
    } else {
        secciones.push({
            id: 'medida_autoconsumo',
            titulo: 'Conjunto de medidas de mejora',
            resumen: 'Autoconsumo fotovoltaico',
            // El techo de kWh que se puede declarar sale del propio certificado y se
            // enseña —con su cuenta— en la barra de cada fase. Aquí solo va el texto.
            nota: 'El máximo de autoconsumo declarable en kWh/año sale del propio CEE: está en la barra ⚡ de cada fase.'
                + (fv.estado ? '' : ' · En el expediente no consta si la vivienda YA tiene placas: si las tiene, esta medida no aplica.'),
            campos: MEDIDA_AUTOCONSUMO,
        });
    }

    secciones.push({
        id: 'pruebas_certificador',
        titulo: 'Pruebas, comprobaciones e inspecciones',
        resumen: 'Realizadas por el técnico certificador',
        campos: [
            { campo: 'Texto completo', parrafo: true, valor: PRUEBAS_CERTIFICADOR },
        ],
    });

    return secciones;
}
