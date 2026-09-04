// ─── ce3xTextos.js ───────────────────────────────────────────────────────────
// La CAJA DE HERRAMIENTAS del certificador: los textos que hay que teclear a
// mano en CE3X y que no dependen del expediente.
//
// Por qué existe: el CE3X tiene un puñado de cuadros que se rellenan SIEMPRE
// con lo mismo —el conjunto de medidas de mejora, las pruebas realizadas en la
// visita— y que hoy se escriben de memoria o se pegan del último certificado.
// Escritos de memoria salen cada vez distintos; pegados del anterior arrastran
// la vivienda de otro. Aquí están una vez, y se copian.
//
// REGLA — un texto se copia TAL CUAL va a la casilla. Nada de rótulos, viñetas
// añadidas ni comillas de adorno: lo que se copia se pega en un cuadro del
// CE3X y cualquier añadido hay que borrarlo a mano justo ahí.
//
// REGLA — el reparto en `campos` es el de las CASILLAS del programa, no el de
// la pantalla. El conjunto de medidas son tres casillas separadas y por eso se
// copian por separado; las pruebas son UN cuadro de texto y se copia entero.
//
// Para añadir otra chuleta basta con otra entrada de CE3X_TEXTOS: el popup la
// pinta sola.

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

export const CE3X_TEXTOS = [
    {
        id: 'medida_autoconsumo',
        titulo: 'Conjunto de medidas de mejora',
        resumen: 'Autoconsumo fotovoltaico',
        // El techo de kWh que se puede declarar sale del propio certificado y se
        // enseña —con su cuenta— en la barra de cada fase. Aquí solo va el texto.
        nota: 'El máximo de autoconsumo declarable en kWh/año sale del propio CEE: está en la barra ⚡ de cada fase.',
        campos: [
            { campo: 'Nombre conjunto medidas mejora', valor: 'AUTOCONSUMO FOTOVOLTAICO' },
            {
                campo: 'Características',
                parrafo: true,
                valor: 'Se propone como medida de mejora la instalación de autoconsumo fotovoltaico '
                    + 'para reducir el consumo de energía primaria no renovable derivado del uso de la aerotermia',
            },
            { campo: 'Otros datos', valor: 'Plazo de amortización estimado de 3 años.' },
        ],
    },
    {
        id: 'pruebas_certificador',
        titulo: 'Pruebas, comprobaciones e inspecciones',
        resumen: 'Realizadas por el técnico certificador',
        campos: [
            { campo: 'Texto completo', parrafo: true, valor: PRUEBAS_CERTIFICADOR },
        ],
    },
];
