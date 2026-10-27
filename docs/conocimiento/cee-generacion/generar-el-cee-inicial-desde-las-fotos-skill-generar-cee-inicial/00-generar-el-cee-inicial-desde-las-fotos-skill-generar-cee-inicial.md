<!-- conocimiento · área: cee-generacion · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Introducción de «GENERAR el CEE inicial desde las fotos — skill `generar-cee-inicial` (2026-09-29)»; cada subsección está en su propio fichero de esta carpeta, salvo las del CROQUIS y el contorno del adosado, que desde el 13/10/2026 están en `docs/conocimiento/envolvente-ce3x/el-croquis-de-la-vivienda/`.

## GENERAR el CEE inicial desde las fotos — skill `generar-cee-inicial` (2026-09-29)

El gemelo de `revisar-cee`: aquél mira el `.cex` que ENTREGA el certificador; éste se lo da ya hecho.
De las fotos del expediente saca la caldera actual (placa), la aerotermia real (placa), los huecos de
cada fachada, y escribe `{nº} - CEE INICIAL_REVISAR.cex` con la aerotermia como medida de mejora —y el
mismo trabajo en la ventana de la envolvente, en ámbar lo que hay que confirmar—. Si la aerotermia no
está en el catálogo, la da de alta con su ficha técnica, su EPREL y su Keymark.

| Qué | Dónde |
|---|---|
| El orquestador (estado · placas · fotos · paredes · leer-pared · eprel · alta-aerotermia · aplicar) | [scripts/cee_inicial.js](implementation/backend/scripts/cee_inicial.js) |
| El plano de paredes sobre la cartografía **y sobre la foto aérea** (PNOA, con la fecha del vuelo), en PNG | [scripts/cee_inicial_plano.py](implementation/backend/scripts/cee_inicial_plano.py) — teselas de [logic/ortofoto.js](implementation/frontend/src/features/cee-envolvente/logic/ortofoto.js) |
| Lo SEÑALADO, sin React (lo usan el hook de la ventana y la skill) | [logic/senalado.js](implementation/frontend/src/features/cee-envolvente/logic/senalado.js) — `estadoDeTrabajo`, `senaladoDe` |
| La skill y su referencia (formato del plan, alta de aerotermia) | `skills/generar-cee-inicial/` |
| Pruebas | `test_senalado.mjs` · `test_placa_ocr.js` · `test_placa_equipo.js` · `test_ortofoto.mjs` |

**La VISTA AÉREA es un dato más para decidir, no para medir** (2026-09-30): `paredes` deja
`satelite.png` (la foto sola) y `plano_satelite.png`. Con ella se ve qué hay al otro lado de cada
pared, por dónde entra el coche (dónde cae el garaje del croquis), lo construido que no consta, el
tipo de cubierta y las placas del tejado. Los tejados salen desplazados (no es ortoimagen verdadera)
y la foto puede ser anterior a la obra: si las fotos del cliente la contradicen, mandan ellas.

**REGLA — `loSenalado` es UNA función y vive fuera de React.** Estaba dentro de
`usePlanoEnvolvente`, así que un script no podía componer lo que la ventana le manda al motor sin
copiarlo — y una copia es un `.cex` que dice otra cosa del mismo edificio. `senalado.js` es puro
(imports con `.js`, probable desde Node); el hook solo le pasa su estado.

**REGLA — el modelo solo LEE; el plan lo escribe quien ha mirado las fotos.** `leer-pared` PROPONE
(medido en 26RES060_OP246: tomó la máquina exterior por una ventana y se dejó una balconera), y cada
lectura de placa se contrasta con su foto. Lo leído nace `dudoso`. Lo que no se puede afirmar no se
escribe: un nº de serie manuscrito, el polígono de un garaje que Catastro no dibuja.

**REGLA — ningún dato del catálogo sin documento.** `alta-aerotermia` exige el SCOP de clima CÁLIDO a
35 y 55 °C escrito en una ficha, comprueba que cuadra con su η (SCOP = 2,5·(η+3)/100), usa el MISMO
`buildPayload` que la pantalla del catálogo, no duplica un modelo que ya casa por su código de placa y
guarda la ficha UNIDA (fabricante recortado + EPREL + etiqueta) con `ficha_tecnica_partes` en la forma
de `fichaConsolidada`. Nace `is_validated: false`. ⚠️ Un mismo modelo puede tener VARIOS registros
EPREL (uno por importador) y no todos publican los tres climas: se elige el que los trae.

**REGLA — en una OPORTUNIDAD, `aplicar` cambia la aerotermia de la SIMULACIÓN** con los mismos campos
que «Leer la placa» de la calculadora (`aerothermiaModel`, `scopHeating`, `scopTemporada`…, por
`oportunidad_merge_inputs`): el resultado de la propuesta queda DESFASADO hasta que se abra la
calculadora y se guarde, y se anota en el historial. En un EXPEDIENTE no se toca: la aerotermia se
cambia desde Instalación («Leer placas»), que recalcula el ahorro.
Con el ACS en OTRA máquina (un aerotermo, `aerothermiaModelAcs`) el `scopAcs` NO se pisa con el de la
aerotermia de calefacción (2026-10-21, 26RES060_OP318: el MIDEA RSJ-15/185 de 3,45 pasaba a 3,00), y
en seco su marca y modelo salen del catálogo como en `ceeEnvolventeCex` (sin ellos la medida llevaba «___»).

**Placas — dos lecturas que fallaban, medidas en OP246**: una SERRA CALOR italiana con la tabla
multilingüe *Input 49,8 / Output 43* salía a 49,8 kW (consumo) — `elegirPotencia` reconoce ya
*Output / Puissance rendue / Potenza utile* como útil e *Input / Puissance du foyer* como consumo, y la
línea literal tolera las kcal entre corchetes; y «Caldaia/Boiler/Chaudière» (o su trozo «DAIA») se
leía como la marca. En la MIDEA, el nº de serie salía el **EAN-13** del código de barras
(`esEan13`, con su dígito de control, lo descarta).

⚠️ `paredFotoService.escribir` actualiza ahora el objeto que tiene en la mano: dos escrituras seguidas
desde un script se pisaban (la segunda reemplazaba la clave con lo de antes de la primera).

**REGLA — la aerotermia de la medida sale del PRESUPUESTO, y el presupuesto se busca en DOS sitios**
(2026-10-08, 26RES060_209): el slot `DOC_PRESUPUESTO` y la carpeta `0. PRESUPUESTO` del Drive del
expediente. En el 209 el slot solo tenía la cifra estimada (12.000 €, sin partidas) y el presupuesto
del instalador —DAIKIN ERGA08EAV3H7 + «máquina interior con ACS»— estaba en la carpeta; el primer
`.cex` salió con la aerotermia GENÉRICA de la simulación (SCOP 4) y hubo que rehacerlo. La genérica
(`aerotermia_generica`) es el último recurso. En un EXPEDIENTE el equipo se escribe con `proponerPlacas`
(la función del botón «Leer placas», `equipoId` + códigos de las dos unidades), que resuelve el SCOP
por emisor y zona y el ACS del conjunto; si el presupuesto no nombra la interior y hay varias, se
pregunta cuál.

**Lo que Fran pide en CADA CEE pasa a ser lo de por defecto** (2026-10-09, 26RES060_225 — revisadas
las conversaciones anteriores): (a) **fechas de firma y de visita = HOY** (`fechas` del plan; lo pidió
en 26RES060_223, _225, _228, 26RES080_OP60, 2026CEE_54 y 2026CEE_63); (b) **lo mandado por WhatsApp
se lleva primero a la obra** con `alta-oportunidad documentar` y, al terminar, el nº de obra va al
nombre del chat (`renombrar`, con `--anteponer` si es el chat del propio cliente sin el prefijo de la
casa); (c) **la medida de mejora es TODO el presupuesto**: cada equipo, también el de ACS aparte con
sus LITROS (`instalacion.aerotermia_acs.litros`; sin ellos sale «SIN depósito») — en el 225 el LASIAN
ATHERIA 100 los tenía vacíos. Y (d) un **patio que Catastro no dibuja** (el 225 tiene dos y Catastro
cuenta uno como vivienda) no recorta la superficie: sus huecos van a la fachada de su orientación más
probable, en ámbar y dicho. Está en la skill, «Lo que hay que poner SIEMPRE», puntos 17-19.

**Sin placas, DOS medidas: 1) la aerotermia, 2) la aerotermia + placas, cada una con su justificación**
(decisión de Fran, 2026-10-10, tras ver el apartado 3 del Anexo III de 26RES060_188 en blanco).
**REGLA — la 2.ª medida se dimensiona con lo que CE3X calcula que consume la vivienda CON la
aerotermia**, no con el CEE de la caldera (en un inicial casi no hay electricidad que cubrir):
`segundaMedidaFv` en `cee_inicial.js aplicar` califica el `.cex` recién escrito, lee la energía final de
la medida de aerotermia en su XML (`leerConsumoDeMedidaDeTexto`, solo los servicios que son
electricidad: el ACS que se queda en la caldera es gas), la reparte por meses
(`consumoElectricoMensual`) y se la pasa a `medidasCe3x` como `consumoMedida`: kWp = 90 % de ese
consumo con PVGIS, cada mes lo menor entre producción y consumo, 1.000 €/kWp (los criterios del CEE
final, regla 127), y vuelve a pedir el `.cex` con `["aerotermia", "aerotermia_fv"]`. Las
justificaciones dicen el porqué del orden (`justificacionMedidas.js`, `conFvDespues` y
`secuencial`): con la bomba de calor funcionando se conocen sus consumos reales y las placas se
ajustan a ellos (potencia pico, módulos, acumulación, potencia contratada, ACS en horas de sol) sin
sobredimensionar. La medida 1 sigue siendo la del informe y la que reproduce el CEE final; la revisión
del CEE coge la primera con bomba de calor y cita la otra como «además». **No va** —y la salida lo
marca con «PREGUNTAR:» para que la skill lo consulte— en una hibridación (el XML no separa el gas de
la caldera), sin CE3X en el PC o sin PVGIS; con placas ya instaladas tampoco (van en Instalaciones),
con placas en la obra es una sola medida (`aerotermia_fv` sola, con el texto combinado) y en un RES080
la medida es el previsto. `fv_segunda: false` la quita. Medido en seco sobre el plan de 26RES060_188:
19.703 kWh/año con la aerotermia → 10,78 kWp, 11.257 kWh/año declarados, ahorro de EPnr 86,4 % →
94,2 %. Está en la skill, «Lo que hay que poner SIEMPRE», punto 20.

**Con una caldera de BIOMASA la justificación de la aerotermia es otra** (2026-10-14, 26RES060_233,
pellets): la biomasa es renovable y casi no emite, así que la bomba de calor SOLA empeora la energía
primaria no renovable y las emisiones (CE3X: −358 % y −25 % en la medida 1; +56 % de emisiones con las
placas en la 2.ª), y el texto general decía que era «la medida que más las reduce». Ahora
(`TEXTO_BIOMASA` en `justificacionMedidas.js`) se justifica por lo que sí mejora —energía final,
partículas, mantenimiento, frío— y dice que por sí sola no reduce la EPnr ni el CO2 y que la completa
el autoconsumo. Biomasa = fila `solid_*` con `fuelType: 'pellets'` (el mismo criterio que
`instalacionExistente`: el carbón comparte fila y sigue con el texto de siempre). Prueba:
`test_medidas_mejora.mjs`, bloque 10.

**Y la justificación de las placas dice QUÉ se electrifica según quién da el ACS** (2026-10-27,
26RES060_250, Fran: «mejora el texto de la justificación»): la caldera de gasóleo daba solo la
calefacción y el ACS ya lo hacía un termo eléctrico que se queda, y el texto decía «tras la
electrificación de la calefacción y del agua caliente sanitaria», falso. `acsTrasLaMedida`
(`fichaCe3x.js`) mira quién da el ACS en el edificio mejorado y lo pasa como `acs` a
`justificacionMedida('autoconsumo' | 'aerotermia_fv')`: lo que se instala (la bomba, o un termo NUEVO de
la medida) → el texto de siempre; un **termo eléctrico que ya estaba** → «la electrificación de la
calefacción, que se suma al termo eléctrico que ya produce el agua caliente sanitaria»; una **caldera
que se queda** con el ACS → solo «la electrificación de la calefacción», y las horas de sol son para la
climatización, no para el agua.

**Y de `_REVISAR` a LISTO PARA FIRMAR, una orden: `listo`** (2026-10-19, sustituye a los scripts sueltos
de 26RES060_188, _231 y _237). Cuando Fran pide «dámelo listo para firmar»: CE3X 3.2 califica el
`_REVISAR.cex` de Drive, CALCULA las medidas y guarda el `.cex` calculado (`calificarCex(…,
{ guardarCalculado: true })`; si el XML no valida, para — regla 140); con `--escribir`, `.cex` y `.xml`
con nombre canónico por la MISMA subida que el técnico (`subidaCeePublica`, lo anterior a OLD), el PDF
SIN firmar como `{nº} – CEE INICIAL.pdf` (el que busca `firmar_cee.js`) y el XML en la app como «Cargar
CEE» (`cee_{fase}`, `xml_{fase}`, combustibles, fechas en `cee` y en `documentacion` por la RPC de valor
suelto, y `ajusteAcsLitros` fuera de RES080). Vale para expediente, CEE directo (`subirCeeDirecto`;
en uno de un solo certificado el rótulo es «CEE») y `--fase final`; en una oportunidad solo califica.
Con un `_fdo.pdf` en la carpeta o la fase REGISTRADA no escribe sin `--forzar`. **No firma**. El agente
de la API (`tools/banco-cee-api`) la corre solo en seco y deja los canónicos en su carpeta de trabajo.
Probado en seco sobre 26RES060_237 (detecta los canónicos ya subidos y el firmado), 26RES060_OP300 y
2026CEE_55 (registrado: para).
