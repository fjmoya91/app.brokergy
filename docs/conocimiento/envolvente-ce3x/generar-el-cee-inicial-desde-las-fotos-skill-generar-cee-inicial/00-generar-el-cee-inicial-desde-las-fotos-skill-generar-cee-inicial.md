<!-- conocimiento · área: envolvente-ce3x · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Introducción de «GENERAR el CEE inicial desde las fotos — skill `generar-cee-inicial` (2026-09-29)»; cada subsección está en su propio fichero de esta carpeta.

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

**Placas — dos lecturas que fallaban, medidas en OP246**: una SERRA CALOR italiana con la tabla
multilingüe *Input 49,8 / Output 43* salía a 49,8 kW (consumo) — `elegirPotencia` reconoce ya
*Output / Puissance rendue / Potenza utile* como útil e *Input / Puissance du foyer* como consumo, y la
línea literal tolera las kcal entre corchetes; y «Caldaia/Boiler/Chaudière» (o su trozo «DAIA») se
leía como la marca. En la MIDEA, el nº de serie salía el **EAN-13** del código de barras
(`esEan13`, con su dígito de control, lo descarta).

⚠️ `paredFotoService.escribir` actualiza ahora el objeto que tiene en la mano: dos escrituras seguidas
desde un script se pisaban (la segunda reemplazaba la clave con lo de antes de la primera).
