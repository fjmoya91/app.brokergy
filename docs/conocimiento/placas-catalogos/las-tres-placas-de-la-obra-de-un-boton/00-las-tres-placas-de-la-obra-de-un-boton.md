<!-- conocimiento · área: placas-catalogos · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Introducción de «Las TRES placas de la obra, de un botón (2026-09-15)»; cada subsección está en su propio fichero de esta carpeta.

## Las TRES placas de la obra, de un botón (2026-09-15)

Botón **✨ Leer placas** en la cabecera del módulo **Instalación**. Lee de una vez la
placa de la **caldera que se retira** y las de la bomba de calor que se pone —**unidad
exterior** y **unidad interior**— y rellena con ellas marca, modelo, nº de serie y
potencia. Es el hermano mayor del lector de la placa de caldera (regla 27.d), que solo
vive en la ventana de la envolvente y solo mira la caldera.

Todo eso lleva meses en Drive: el instalador sube cada etiqueta a su slot y los tres
están en `FULL_RES_SLOTS` **precisamente para que esos caracteres se lean**. El que más
duele es el **nº de serie de la unidad exterior**, que va impreso en el CIFO, en el Anexo I
y en la memoria RITE, y sin el cual no se tramita la ayuda. Medido el 15/09/2026 sobre
producción: **56** expedientes tienen esa foto y **69** la de la caldera; de estos últimos,
**29 no tienen ni la marca escrita**.

| Qué | Dónde |
|---|---|
| Lectura de las placas del equipo nuevo + cruce con el catálogo | [placaEquipoOcrService.js](implementation/backend/services/placaEquipoOcrService.js) |
| Lectura de la caldera (reutilizada tal cual) | [placaOcrService.js](implementation/backend/services/placaOcrService.js) |
| Ruta | `POST /api/expedientes/:id/placas/ocr`, **staffOnly** |
| Superficie | `LeerPlacasModal` + botón en el `headerAction` de Instalación |
| Prueba de lo determinista | `node implementation/backend/scripts/test_placa_equipo.js` |
| Contra un expediente real, sin escribir | `node implementation/backend/scripts/probar_placas.js 26RES080_66` |
| Qué modelo leería mejor, y por cuánto | `node implementation/backend/scripts/comparar_modelos_ocr.js` |

**REGLA — LA PLACA SE LEE SOLA.** Nada de fotos «de contexto» junto a la etiqueta.
Medido sobre dos placas reales, tres vueltas por combinación y `temperature: 0`:

|  | solo la placa | placa + foto del aparato |
|---|---|---|
| 26RES080_66 (DAIKIN, etiqueta nítida) | **3/3 ✓** | 0/3 ✗ — lee `1802773` |
| 26RES080_64 (PANASONIC, en diagonal) | **3/3 ✓** | 0/3 ✗ — lee `5621802034` |

Doce de doce con la placa sola; **cero de seis** en cuanto entra una segunda foto. Y
falla en **UN DÍGITO en medio del número**, que es la peor forma de fallar: el resultado
parece bueno y nadie lo contrasta. Tampoco es azar que se corrija repitiendo —sale igual
las tres veces—, así que no vale leer dos veces y comparar. La foto del aparato entero
solo se manda cuando NO hay foto de la placa, que es el único caso en que aporta algo
(la marca).
⚠️ Es de esperar el mismo efecto en `placaOcrService`, que sí manda hasta dos fotos de
contexto **a propósito** (en una caldera antigua la marca suele estar solo en el frontal).
Ahí el equilibrio es otro y no se ha tocado; lo que de aquel servicio se usa en este botón
es sobre todo la POTENCIA, que va en la línea literal y sí sobrevive al contexto.

**REGLA — UNA LECTURA POR UNIDAD.** La exterior y la interior son dos aparatos con dos
placas y dos nºs de serie que se parecen mucho. Mandarlas juntas es pedirle al modelo que
decida cuál es cuál, y confundirlas escribe en el CIFO el nº de serie del aparato que no
es. No hace falta que lo decida: el SLOT del que sale cada foto ya lo dice. Una unidad sin
fotos no se manda a leer.

**REGLA — el nº de serie sale de su LÍNEA LITERAL, no del número aislado.** Es la misma
regla que la potencia de la caldera: se le pide la línea entera con su rótulo
(`serie_texto`) y el valor lo saca `serieDesdeTexto()`, determinista. Esa línea es además
la EVIDENCIA que se enseña en el popup, para contrastar el número sin abrir la foto. Si
las dos lecturas no concuerdan **se avisa y no se traga**.
⚠️ **NO se corta por el primer espacio**: un nº de serie puede venir escrito por bloques y
los espacios son suyos — la placa de 26RES080_79 pone `S/N:1KK018 038JAP D8D5BJF 0134`, y
quedarse con `1KK018` deja el número a un cuarto. Ahí el código determinista era PEOR que
el modelo, y por eso el criterio es *«¿está lo aislado dentro de la línea?»*, no
*«¿es igual al primer bloque?»*.

**REGLA — el EQUIPO lo decide el catálogo, no el modelo.** `casarConCatalogo()` compara
códigos normalizados (solo letras y cifras) contra `modelo_ud_exterior`,
`modelo_ud_interior`, `modelo_conjunto` y `modelo_comercial`. Casa exacto, y por prefijo
solo cuando uno es el otro más un sufijo de ≤2 caracteres —el catálogo guarda la
Panasonic como `WH-MDC07J3E5` y su placa dice `WH-MDC07J3E5-1`—.
⚠️ Un código **puramente numérico no casa nunca por prefijo**: THERMOR referencia sus
unidades exteriores con seis cifras (`526672`, `527038`), y ahí un prefijo emparejaría dos
equipos distintos y podría morder un trozo de nº de serie.

**REGLA — con VARIOS candidatos no se elige ninguno, pero se PREGUNTA.** Una misma unidad
exterior se vende con varias interiores: medido, el DAIKIN `ERLA16DAV37` casa con **cinco**
filas del catálogo. Primero se desempata con la OTRA unidad, que es justo lo que las
distingue y lo tenemos leído de su propia placa (así se resolvió 26RES080_66, id 249); si
aun así quedan varias, el popup los lista y se elige de un clic. Elegir por el usuario
sería declarar el SCOP y adjuntar la ficha técnica de otra máquina; no ofrecerlos sería un
callejón sin salida.

**REGLA — por la INTERIOR no se casa una fila cuya exterior es OTRA de la leída** (2026-10-02).
Una misma interior se vende con varias exteriores —la Panasonic All in One `WH-ADC0309K3E5` va
con la UDZ03, 05, 07 y 09—, y casar solo por ella daba por bueno el kit de 5 kW en una obra de
9 (26RES060_143) y, en el alta de la skill, lo tomaba por un duplicado. Si la exterior leída no
está en el catálogo, el equipo NO está: eso es lo que se dice.

**REGLA — se tolera lo que el OCR confunde, NO lo que distingue dos equipos** (2026-10-18).
La placa de una AEROSUN CONFORT 12 se leyó «NTI-12/1IEN» (26RES060_136), «NT2-12IRFN» y
«NTI-12IHN» (26RES060_196), y el catálogo la guarda como «CONFORT 12 (NTII-12IIEN)» (id 60):
nombre comercial delante, el código entre paréntesis y una racha de íes que el lector cuenta
mal o lee como unos. `casan` no veía nada, no salían candidatos y, aplicado por la ruta, el
expediente que tuviera la CONFORT 9 (id 72) se quedaba con la 9 y la serie de la 12. Ahora el
cruce va en tres pasadas, y solo pasa a la siguiente si la anterior no casa NADA (así una
lectura limpia nunca acaba casando por la vía tolerante con otra fila):
1. `casan`, como siempre (exacto o sufijo ≤2).
2. `casanOcr`: la misma `claveOcr` —I, 1, l y | son el mismo trazo y una racha cuenta como
   uno; fuera separadores, «/» y paréntesis— en alguna variante del código (entero, lo de
   dentro del paréntesis, lo de fuera, las piezas de «ADVANCED 12 - HM-M1-A5» y, solo en lo
   LEÍDO, sin las palabras de delante), **y las cifras de 2+ dígitos enteras en los dos lados**:
   «NTII-9IIEN» ≠ «NTII-12IIEN», «12» ≠ «112», «12» ≠ «2». Casa y elige como la 1.
3. `parecido`: mismo arranque, todas las cifras del catálogo enteras en lo leído y ≤35 % de
   caracteres distintos. **Un parecido NUNCA elige solo**, ni siendo uno: va a `candidatos`
   (`aproximados: true`) con un aviso que lo nombra. Si el que consta está entre ellos, se
   queda, pero el aviso pide mirar la foto.
Medido el 18/10/2026 sobre el catálogo (401 códigos de unidad distintos): la pasada 2 **no
confunde ningún par**; la 3 acercaría 153 pares, por eso solo propone. Los numéricos puros
(THERMOR) siguen casando solo exactos. Y un modelo escrito que la lectura reconoce como el
mismo ya no sale como CONFLICTO (era ruido: «CONFORT 12 (NTII-12IIEN)» frente a «NTI-12/1IEN»).

**REGLA — la serie de una placa que es de OTRO equipo solo entra CON ese equipo** (2026-10-18).
Si el expediente ya tiene equipo y la placa de la ud. exterior es de otro (el catálogo la casa
con otra fila, o no se parece al modelo que consta), su nº de serie y su modelo van marcados
`con_equipo` («— solo si se cambia el equipo») y al aplicar **solo se escriben si se aplica
también el equipo de la placa**. Casilla del equipo desmarcada → no entran, y se avisa.

**REGLA — el SCOP no se calcula aquí.** El servicio devuelve el `aerotermia_db_id` y el
SCOP lo resuelven `getScopFromModel` / `getScopSeason` de `calculation.js`, importadas por
ESM como ya hace `cifoService`. Son las MISMAS del desplegable, así que un equipo rellenado
por la placa y otro elegido a mano no pueden dar números distintos. Solo se escribe si se
ha podido resolver: un equipo con el id del catálogo y el SCOP del anterior es peor que uno
sin id.
⚠️ La fila que se le pasa tiene que llevar las columnas del SCOP de CALEFACCIÓN
(`scop_cal_*`, `eta_*`): sin ellas `getScopFromModel` cae a su reserva (4,5 a 35 °C, 3,2 a
55 °C) con temporada «medio», y eso se escribía en el expediente (26RES060_143: 4,5 donde la
ficha dice 5,75). El `select` de la ruta las pide desde el 2026-10-02.

**REGLA — se PROPONE, y al aplicar solo se rellenan HUECOS.** Lo escrito lo puso una
persona con el aparato delante. Lo que difiere sale como CONFLICTO, con las dos versiones a
la vista, y **no se toca**. Sustituir un equipo del catálogo ya elegido no es rellenar: esa
casilla nace desmarcada y dice a quién sustituye.

**REGLA — al aplicar se escribe lo REVISADO, no una lectura nueva.** El popup devuelve la
lectura que el usuario ha tenido delante (`lectura` en el body). Releer costaría una segunda
llamada y —lo grave— podría dar otro resultado, así que se escribiría algo que nadie ha
visto. Mismo criterio que `overrides.cesion` en el Anexo I.

**REGLA — ELEGIR UN CANDIDATO ES APLICARLO.** La casilla del equipo nace apagada justo
cuando hay varios candidatos —porque entonces no hay ningún equipo propuesto que marcar—,
así que la elección del usuario llegaba al servidor y se descartaba con ella. Medido en
26RES060_167: eligió el id 238 y el expediente se guardó sin equipo. Un `equipo_id` que
casa con uno de los candidatos ES la autorización; `aplicar_equipo` solo manda cuando no
ha habido elección.

**REGLA — UN CONJUNTO RESUELVE SU BLOQUE DE ACS ENTERO (regla 49), no a medias.** Si el
equipo del catálogo trae el depósito dentro y el ACS entra en el alcance, se escribe el
nodo con `nodoAcsDesdeConjunto()` —la MISMA función del desplegable de Instalación—: mismo
modelo, mismo `aerotermia_db_id`, mismas referencias de placa, y **propio solo el SCOP_dhw**,
que la misma bomba rinde mucho menos calentando agua a 55-60°.
⚠️ **Y se propone aunque el equipo de calefacción YA conste**: ahí no hay nada que casar,
pero el bloque de ACS puede seguir vacío —es como llega un expediente cuyo equipo se eligió
a mano en su desplegable (26RES060_167)—, y «el equipo ya es ese» apagaba también el ACS.
Por eso el equipo vigente es `catalogo.modelo?.id ?? aero.aerotermia_db_id`, y si el que
consta está entre los candidatos la placa lo CONFIRMA: el aviso de «elige cuál es» se calla,
porque un aviso que no se puede atender enseña a no leer los avisos.
⚠️ **Rellenar no puede BORRAR**: `nodoAcsDesdeConjunto` copia el nodo de calefacción, así
que sus huecos (aquí, el nº de serie que falta por no haber foto de la ud. exterior) no
pueden vaciar lo que el nodo de ACS ya tuviera escrito.

**REGLA — UN BIBLOC SON DOS APARATOS, y el de dentro tiene su propia serie.** Que el
catálogo venda el conjunto como UNA fila no lo convierte en una sola máquina: la unidad
exterior y la interior van atornilladas en sitios distintos, cada una con su placa y su nº
de serie — por eso se piden las dos fotos. El de la interior va al **nodo de ACS**, y no
por convención: en un conjunto ese aparato ES el que calienta y acumula el agua, y es el
que el CIFO declara en **«Nº serie equipo ACS»** (`acsNuSerieEx`), una fila APARTE de «Nº
serie unidad exterior». Medido en 26RES060_167: esa fila del CIFO salía **«—»** teniendo
el dato leído en Drive, porque `nodoAcsDesdeConjunto` copia el nodo de calefacción —cuya
serie es la de la exterior— y el campo estaba además OCULTO en pantalla bajo un texto que
afirmaba «lo imprimen una sola vez, con su mismo nº de serie». En un bibloc eso es falso.
✅ **VERIFICADO sobre los documentos**, no sobre el JSON: con la serie puesta, el CIFO
imprime `Nº serie unidad exterior: EXT-111` y `Nº serie equipo ACS: 5601076`, y el Anexo I
`Ud. exterior: EXT-111 | Ud. interior: 5601076`. Sin ella, el Anexo I ya pintaba ahí la
raya de guiones bajos —o sea que el hueco se veía en el documento— y el CIFO, «—».
⚠️ **En un MONOBLOC no se escribe**: hay un solo aparato y su serie es la de la unidad
exterior. Medido sobre producción: de los 43 conjuntos con las dos series puestas, **16 de
18 biblocs las tienen distintas** y **18 de 25 monoblocs la misma**, así que el patrón real
ya era éste. El rótulo del campo también cambia según el caso (`esBibloc`).
⚠️ **Series distintas en los dos nodos NO los convierten en dos máquinas**: `mismaMaquina()`
compara por `aerotermia_db_id`, no por serie. Con el ACS fuera de alcance ese nodo no
describe nada de la obra, y entonces sí se guarda como registro en
`aerotermia_cal.numero_serie_ud_interior` (el nombre no es nuevo: una skill ya lo había
escrito así en 3 expedientes, y no lo leía nadie).
⚠️ **De quién es la placa lo dice el MODELO leído, no el slot**: si casa con la ud.
interior del equipo, es la del conjunto y su serie va ahí; si es otro aparato —en
26RES080_64 ese slot traía un termo ARISTON «NUOS PRIMO 200 HC A+»—, es el equipo de ACS y
su serie es suya.

⚠️ **PENDIENTE, preexistente y NO tocado**: en un MONOBLOC con la misma serie en los dos
nodos (18 expedientes), el Anexo I imprime igualmente la línea `Ud. interior: <la misma>`.
El propio código dice que repetirla ahí «le dice al verificador que hay dos equipos donde
solo hay uno», pero solo lo evita para acumuladores (`acsEsAcumulador`), no para monoblocs.
Cambiarlo altera un documento oficial ya emitido en esos expedientes, así que se deja
anotado —y vigilado por `test_placa_acs_conjunto.mjs`— para decidirlo aparte.

**REGLA — esa placa puede ser de OTRO aparato, y se distingue por el MODELO.**
`aerotermia_cal.numero_serie` es el de la unidad EXTERIOR y solo ése: es lo que el CIFO y
el Anexo I imprimen como «nº de serie ud. exterior», y meter ahí el del aparato de dentro
sería declarar una máquina por otra. Pero el de la interior tampoco puede tirarse —medido
en 26RES060_167: la placa estaba, se leyó «MFG.NO. : 5601076» y el dato se perdía—, y su
sitio es el nodo de ACS, que describe el aparato de dentro cuando la actuación toca el
agua caliente. Solo si el ACS está en alcance, el expediente YA lo declara aparte
(`misma_aerotermia_acs === false`) y el equipo NO es un conjunto: con el flag activo ese
nodo es un CLON que mantiene la app, y con un conjunto el nodo lo escribe entero la regla
de arriba —escribir además campos sueltos lo dejaría con nº de serie y sin equipo, y un
nodo sin firma hace que `mismaMaquina()` lea DOS máquinas donde hay una—.
⚠️ **Se escribe el nº de serie y `modelo_ud_interior`, NUNCA la marca ni `modelo`.** Esos
dos entran en la firma con la que `mismaMaquina()` decide si el ACS es una SEGUNDA
máquina, y de ese veredicto cuelgan qué SCOP_dhw se declara y qué equipos imprime el CIFO.
Rellenar un hueco no puede cambiar de paso lo que el expediente dice que hay instalado.

**REGLA — la placa del slot «ud. interior» solo es de la bomba de calefacción si es SU
interior** (2026-10-18). El slot dice dónde se subió la foto, no de qué máquina es. Con una
aerotermia MONOBLOC y el ACS aparte, el lector proponía el modelo del equipo de ACS como
`modelo_ud_interior` de la calefacción: en 26RES060_195 (Aerosun Advanced 12 `HM-M1-A5`, id 163,
monobloc + bomba de ACS `HTW-AT-V100MR290A`) y, en 26RES060_196, un termo CORBERÓ que ni es de la
obra. Ese campo lo imprimen el CIFO y el Anexo I («Ud. interior: …»): declaraba dos aparatos
donde hay uno, y uno de otra máquina. Ahora la placa describe la bomba de calefacción solo si
casa con su ud. interior, o si el equipo puede tenerla y nada dice que sea otro aparato:
**no** si el equipo (el que consta o el casado) no tiene ud. interior en el catálogo, ni si
casa con el equipo de ACS declarado aparte, ni si su marca no tiene que ver con la de la
exterior. Entonces no se escribe ni su modelo ni su marca en la calefacción, y se avisa.
Si es el equipo de ACS aparte, su serie va a ese nodo (como antes); si el ACS aparte YA declara
un modelo y la placa no es ése, **no va a ninguna parte** (el termo ajeno no se cuela en el
nodo de ACS); y si es la ud. interior de la propia bomba, su serie se guarda como registro en
`aerotermia_cal.numero_serie_ud_interior`. Verificado leyendo de verdad las placas en Drive de
26RES060_136, _195 y _196, sin escribir: ninguna propuesta a la «ud. interior» y los avisos dicen
por qué. Pruebas: `test_placa_equipo.js` y `test_placas_instalacion.js` (casos h-l).
⚠️ El popup (`Candidatos` de `LeerPlacasModal.jsx`) solo pinta la lista con **2 o más**
candidatos, así que un único PARECIDO solo se ve en el aviso; la ruta sí acepta `equipo_id`
con él (lo usa la skill).

**REGLA — si falta la placa de la UD. EXTERIOR se dice al leer, no al generar.** Es el dato
que imprimen el CIFO, el Anexo I y la memoria RITE, así que su hueco necesita explicación
ahí mismo: es donde se puede hacer algo —pedírsela al instalador—. Lo demás se rellena
igual; que falte una placa no puede dejar sin rellenar las otras dos. Al generar el
documento, `validateExpediente` ya lo reclama por su nombre («Número de Serie Ud.
Exterior»), que es la red de abajo.

⚠️ **La pantalla no se refresca sola si no se la obliga.** `InstalacionModule` guarda su
propia copia del expediente y solo la resiembra cuando cambia el ID
(`useEffect([expediente?.id])`), así que recargar el expediente tras escribir desde fuera
NO bastaba: los huecos recién rellenados seguían en blanco y había que refrescar el
navegador a mano. Se resuelve con `key={expediente?.instalacion?.placas_ocr?.at}` en el
módulo — el sello solo cambia al aplicar una lectura, así que no interrumpe mientras se
escribe.

⚠️ **`placa_ocr` y `placas_ocr` están en la BLACKLIST de `normalizeData`.** Sus claves son
técnicas (`caldera.marca`) y el popup las traduce buscándolas en un mapa: en MAYÚSCULAS
(`CALDERA.MARCA`) dejaba de encontrarlas, y de paso convertía la línea literal de la placa
—que es la EVIDENCIA— en algo que ya no es lo que pone la etiqueta. Mismo gotcha que
`fotovoltaica` y `envolvente`.

La huella queda en `instalacion.placas_ocr` —qué se leyó, de qué fotos, quién y cuándo
(solo metadatos, regla 21)—, y ahí es además donde se guarda el **nº de serie de la unidad
INTERIOR**: se lee, pero el expediente no tiene campo propio para él y no se inventa uno
que ningún documento leería.
