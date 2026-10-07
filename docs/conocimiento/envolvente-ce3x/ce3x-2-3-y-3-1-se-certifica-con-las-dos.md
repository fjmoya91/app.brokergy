<!-- conocimiento · área: envolvente-ce3x · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## CE3X 2.3 y 3.1 — se certifica con las DOS (2026-10-02)

Hasta el 30/09/2026 se certificaba con CE3X 2.3; desde el 01/10/2026, con la **3.1**.
La app escribe las dos, **por defecto la 3.1**, y un CEE final hecho sobre un inicial
de la 2.3 sale ya en la 3.1: se convierte al copiarlo, en los dos caminos (la ventana
de la envolvente y «Generar CEE final» desde la medida del técnico).

| Qué | Dónde |
|---|---|
| Qué cambia de una a otra; leer y escribir cada versión | [tools/version_ce3x.py](implementation/cee-engine/tools/version_ce3x.py) |
| Pasar un `.cex` ya hecho a la otra versión (motor `/cex/convertir` y línea de órdenes) | [tools/convertir_cex.py](implementation/cee-engine/tools/convertir_cex.py) |
| La versión en la app: listas de la 3.1 y lo que se propone en cada campo | [logic/versionCe3x.js](implementation/frontend/src/features/cee-envolvente/logic/versionCe3x.js) |
| Dónde se elige | «Datos generales» y «Generar el .cex» de la envolvente (`ajustes.version_ce3x`) · popup «Generar CEE final» (`version_ce3x`) · `cee_final.js --version=` |
| Preguntarle al PROPIO CE3X (abrir, calificar, XML) | [tools/oraculo_ce3x/](implementation/cee-engine/tools/oraculo_ce3x/README.md) |
| Pruebas | `python -m pytest implementation/cee-engine/tests/test_version_ce3x.py` · `node implementation/backend/scripts/test_version_ce3x_app.mjs` |

**Qué cambia** (preguntado a CE3X 3.1 ejecutando su propio código, no a ojo):

| Pickle | 2.3 → 3.1 |
|---|---|
| 0 | `CEXv2.3 Residencial` → `CE3Xv3.1 Residencial` (y los dos terciarios) |
| 1 | 26 → 29: grado de protección, partes protegidas y **uso del edificio**; la titulación pasa a ser un **desplegable** de 21 (lo que no casa sale en el XML como «Otra(.*)») |
| 2 | 21 → 26: normativa «otros», **superficie útil, nº de viviendas o unidades de uso, plantas bajo y sobre rasante** — sin ellos la 3.1 **NO califica**; la normativa pasa de 4 a **7 tramos** |
| 4 | 12 → 14 slots, y cada equipo que no es una caldera ESTIMADA gana su **potencia por servicio** y el **tipo de bomba de calor**: sin ellas califica pero **no escribe el XML**; las placas, su kWp |
| 11 | el informe, 7 → 8 casillas |

**REGLA — el CÁLCULO es el mismo.** Medido con el motor de la 3.1 sobre el mismo
fichero que dio la 2.3: idénticas demandas, emisiones y calificación (26RES093_9: 35,23 D
/ 134,37 C). Ni la normativa ni el tipo de bomba mueven un decimal: un inicial de la 2.3
y un final de la 3.1 siguen siendo comparables.

**REGLA — los escritores del motor siguen en la forma de la 2.3** (medidos sobre 1.600
`.cex` reales) y la versión se aplica en las FRONTERAS: `elevar` al escribir una 3.1, e
`instalaciones_a_23` al leer una, guardando aparte lo que la 2.3 no tiene (potencias,
tipo de bomba, los dos slots nuevos) para devolverlo **intacto** al escribir.

**REGLA — lo que la 3.1 pide de más se PROPONE y se corrige en la pantalla**
(`ajustes.ce3x31`): la superficie útil y las plantas salen de Datos generales, la
titulación de la del técnico, el uso del programa. Viaja al motor en `ficha.ce3x31` y
el motor no lo vuelve a decidir — tampoco la normativa elegida a mano. **El uso tiene
DOS listas** según el programa (`listadoUsoEdificioResidencial` / `...Terciario`): el
terciario no ofrece «Residencial público», así que un hotel va a «Otro».

**REGLA — la potencia sale del EXPEDIENTE** (la unidad, o el catálogo de su modelo) y se
teclea en Instalaciones; lo que no conste lo pone el motor por defecto **y lo dice**. Una
caldera estimada no la lleva aparte: va en su cola y es la que declara su XML.

**REGLA — la potencia va TAMBIÉN en los equipos de cada MEDIDA DE MEJORA** (2026-10-05). Una
medida lleva su instalación en tres sitios (`sistemas*MM`, `datosInstalaciones` y la copia de
`mejoras[1][1]`) y los escritores la componen en la forma de la 2.3: CE3X 3.1 la abría y la
calculaba, pero el diálogo de la medida salía con la potencia en BLANCO (2026CEE_58: los siete
aires de la medida de autoconsumo). `medidas_equipos_a_31` les pasa la MISMA `equipo_a_31` que
a la instalación del edificio —misma potencia para el mismo aparato—, la llama `elevar` (y
`poner_medida` sobre un `.cex` de la 3.1), y `bajar` la deshace (`medidas_equipos_a_23`). Las
potencias de los equipos que solo están en una medida (la aerotermia propuesta) salen de
`medidas[].instalaciones`.

**REGLA — bajar de la 3.1 a la 2.3 solo si no se pierde nada.** Un generador eléctrico o
termosolar de la 3.1, o medidas calculadas con ella, la 2.3 no los sabe abrir: no se
escribe y se dice.

⚠️ **Nunca PUNTOS en el nombre de un `.cex`.** `xml2cert` (el que hace el PDF oficial)
no encuentra el XML: para «EJEMPLO MIGRADO DE 2.3.cex» busca «EJEMPLO MIGRADO DE 2.xml».
Era el ÚNICO fallo del migrado que motivó todo esto — el fichero estaba completo.

⚠️ **Re-emitir un grupo de medidas CALCULADO** (con referencias cíclicas, objetos
`models.*` por REDUCE, `uuid.UUID` y claves no ASCII) es fiel gracias al memo (GET) y a una
lista blanca de clases en `pickle0.py`. Antes, «Poner la medida» sobre un `.cex` con una
medida ya calculada reventaba con `RecursionError` (también en la 2.3).

La revisión del CEE del técnico avisa si entrega un `.cex` de la **2.3 emitido desde el
01/10/2026**, o uno de la 3.1 sin sus datos generales (`version_ce3x` en
`revisionCeeCex.js`).

```bash
python implementation/cee-engine/tools/convertir_cex.py "ruta\x.cex"          # → x_v31.cex al lado
node implementation/backend/scripts/probar_cex_envolvente.js 26RES060_184 --version=2.3
node implementation/backend/scripts/probar_cex_envolvente.js 26RES060_184 --final --base=ini.cex
```

### Los TEXTOS del informe en la 3.1: `<br>` y las RECOMENDACIONES de uso (2026-10-02)

CE3X 3.1 mete los cuadros de texto de «Opciones del informe» TAL CUAL en el XML como
`data:text/html,<h1>…</h1>`, y en HTML un salto de línea es un espacio: el Anexo IV
(pruebas y comprobaciones) salía en el PDF oficial como UN solo párrafo. **REGLA — en la
3.1 cada salto de línea lleva `<br>` delante** (`texto_html_31` en
[version_ce3x.py](implementation/cee-engine/tools/version_ce3x.py), dentro de
`informe_a_31`; medido con `xml2cert`: con `<br>` cada línea sale en la suya y la primera,
en negrita, porque va en el `<h1>`). **En la 2.3 NO**: su PDF no es HTML y el `<br>` saldría
impreso (`informe_a_23` lo quita). La app manda el texto LLANO y el motor, que sabe la
versión, pone los `<br>`; un texto que ya los lleva no se toca.

La casilla 8.ª del informe, que solo tiene la 3.1, es **«Recomendaciones para un uso
eficiente»** → apartado 1 del **Anexo III** (art. 8 RD 390/2021). Se rellena con un texto
genérico de USO (consignas 19-21 °C / 15-17 °C de noche y 26 °C en verano, programación,
ventilación, persianas, ACS a 60 °C, mantenimiento RITE, iluminación), con variante para
terciario: `recomendacionesUso` en [ce3xTextos.js](implementation/frontend/src/features/expedientes/logic/ce3xTextos.js),
que viaja en `informe.recomendaciones` (`informeCe3x` y el «Generar CEE final»). **Solo se
pone si la casilla está VACÍA**: las que escribió el técnico mandan. Las «Ayudas CE3X» copian
los dos textos ya con `<br>` (y el de pruebas, también sin ellos para la 2.3). Comprobado de
punta a punta abriendo el `.cex` con el propio CE3X 3.1 (oráculo) → XML → `xml2cert`. Tras
tocarlo: `python -m pytest implementation/cee-engine/tests/test_version_ce3x.py`.

**Y la «Propuesta de secuencia temporal» (Anexo III, 3)**: en la 3.1 cada conjunto de
medidas (`grupoMedidasMejora`) lleva `ordenPrioridad` ('1', '2'…) y `justificacion`, y el
PDF imprime el orden y une todas las justificaciones en un cuadro. Cada medida de la app
lleva su `justificacion` + `secuencia` ([justificacionMedidas.js](implementation/frontend/src/features/cee-envolvente/logic/justificacionMedidas.js):
cubierta · fachada · ventanas · aerotermia · hibridación · retirada · autoconsumo), y
`medidas_a_31` las escribe: **orden = envolvente (1) → generador (2) → renovables (3)**,
cada texto precedido del NOMBRE del conjunto y acabado en `<br>`. Lo que ya trae el conjunto
(un `.cex` 3.1 del técnico) no se toca; en la 2.3 no se escriben (`medidas_a_23`).

### Y el `.xml` de la 3.1 se LEE igual (2026-10-02)

CE3X 3.1 exporta el XML del certificado en el esquema **v3.0**
(`<DatosEnergeticosDelEdificio version="3.0">`): el mismo certificado con otras etiquetas
(`<DatosEdificio>`, `<Indicadores><Demanda><Cal>`, `<Modelo><Sistemas><Generador>`…). Todos
los lectores de la app miran primero la versión y, si es la 3.0, leen con
[xmlCeeV30.js](implementation/frontend/src/features/calculator/logic/xmlCeeV30.js) y devuelven
**el mismo objeto** que con la 2.3: ningún consumidor sabe de qué versión viene el certificado.

| Qué | Dónde |
|---|---|
| Lector del v3.0 (sin DOM; vale también con el XML en MAYÚSCULAS de la BD) | `xmlCeeV30.js` + su **espejo CJS** [services/cee/xmlCeeV30.js](implementation/backend/services/cee/xmlCeeV30.js) |
| Los cinco lectores públicos del CEE | `xmlCeeParser.js`: `parseCeeXml`, `parseEmisionesTotalesFromXml`, `leerCalificacionesDeTexto`, `leerDatosIrpfDeTexto`, `parseEpnrFromXml` |
| La radiografía de la revisión del CEE | `radiografiaXmlV30` en [radiografiaCee.js](implementation/backend/services/cee/radiografiaCee.js) |
| Huecos y opacos del certificado RES080 | `huecosYOpacosV30` (en `cifoService` y en `CertificadoRes080Modal`) |
| Scripts | `vincular_cee_directos_clientes.js` · `migrar_lote_expedientes.js` |
| Prueba | `node implementation/backend/scripts/test_xml_cee_v30.mjs` |

**REGLA — lo que sale habla el IDIOMA DEL v2.0** allí donde el v2.0 tenía el mismo dato.
Durante la transición conviven en el MISMO expediente un CEE inicial de la 2.3 y un final de la
3.1, y si cada uno hablara su idioma, compararlos daría diferencias que no existen. Por eso la
superficie de un opaco se devuelve BRUTA (el v3.0 la da NETA, sin sus huecos), se quita el «-»
final del nombre del hueco («V1-» es la «V1»), la orientación vuelve a palabras, el vector a su
nombre de la 2.3 (`GASOLEO` → `GasoleoC`) y el factor solar del hueco se recompone MODIFICADO.
Medido sobre el mismo edificio exportado con las dos (26RES093_9): los 10 huecos y los 15 opacos
casan por nombre, superficie y U.

**REGLA — el camino del v2.0 no se toca, y se VIGILA**: el test guarda una huella (hash) de lo
que devuelven los seis lectores con los 462 certificados reales y falla si cambia un byte. En el
repo va la huella, nunca los certificados.

**REGLA — un `<Generador>` con `<EsFicticio/>` NO existe**: es el de sustitución que pone CE3X
3.1 cuando la vivienda no tiene ese servicio (lo normal, una refrigeración que no hay). No se
cuenta: la 2.3 no los escribía, y contarlo declararía un equipo que no está instalado.

**Lo que el v3.0 ya no dice sale `null`, nunca inventado**: el MODO de obtención (solo marca lo
que va POR DEFECTO, así que sin el `.cex` no se sabe si una U es estimada o conocida), el de los
generadores, el coste de una medida (es un TRAMO) y el año de construcción cuando es un tramo
(«1979-2005»). La demanda total no viene: es la suma de las tres, como lo era en la 2.3 en 462 de
462. **Lo que trae de más**: la acumulación de ACS (`<Sistemas><Acumulador>`), que la revisión
enseña aunque no haya `.cex`.

⚠️ **El espejo CJS** existe porque `radiografiaCee` y `cifoService` lo necesitan síncrono y
desde CommonJS no se hace `require()` de un ESM. El cuerpo es el MISMO, carácter a carácter, y el
test lo compara: si cambia la lectura, se cambia en los dos.

⚠️ **Las placas en la 3.1 se declaran de DOS formas, y con los MISMOS kWh dan lo MISMO**:
como contribución renovable anual (lo que traía la 2.3, y lo que conserva CE3X 3.1 al abrir un
fichero de la 2.3) o como «Generación renovable eléctrica» (slot 13, `<GeneradorElectrico>`,
mes a mes). Medido con el propio CE3X 3.1 sobre «EJEMPLO MIGRADO.cex» (7 kWp, 11.803 kWh/año):
las dos dan **127,27 C / 34,03 D**. La diferencia de 26RES093_9 (134,37 con la contribución de
la 2.3 frente a 127,27 con el generador hecho a mano) venía de los **kWh** (11.000 frente a
11.803), no de la forma. Al comparar un inicial con un final (IRPF, revisión), lo que tiene que
cuadrar son los kWh declarados. Cómo lo escribe la app: ver «AUTOCONSUMO con PVGIS».
