<!-- conocimiento · área: cee-generacion · las rutas de los enlaces son relativas a la raíz del repo -->

## La medida del PREVISTO (RES080) va AUTOCONTENIDA, no como «Nuevo Edificio» (2026-10-10)

**Caso: 26RES080_82.** El inicial del técnico, con el previsto puesto como su medida de mejora por
`cexAPdf.ponerPrevistoComoMedida` («Nuevo Edificio Definido por el Usuario», regla 117), se abría en
CE3X 3.2 con la medida en el árbol, pero **al pulsarla el panel de la derecha se quedaba en blanco**.
El XML y el PDF estaban bien (se sacaron en el momento, con el previsto delante).

**Por qué.** Reproducido con el oráculo, simulando el clic (`tools/oraculo_ce3x/clic_medida.py`):
CE3X revienta en `mejoraEdificioCompleto.calificacion` con «local variable 'f1' referenced before
assignment». Una «Nuevo Edificio» **no lleva el previsto dentro**: cada vez que se pulsa, CE3X vuelve a
LEER el `.cex` del previsto desde la ruta absoluta que guardó (`mejoras`). Medido:

| `mejoras` apunta a… | Al pulsar la medida |
|---|---|
| un `.cex` que existe | abre |
| uno que no existe | el error de arriba, panel en blanco |
| un nombre relativo, aunque el fichero esté junto al inicial | el mismo error (CE3X lo busca en su directorio de trabajo) |

La nuestra era un nombre suelto (`26RES080_82 - CEE PREVISTO.cex`); la del 26RES080_87, la carpeta
temporal de `cexAPdf`, ya borrada. **Los hechos a mano tienen el mismo problema**: el 25RES080_23 guarda
`H:\Mi unidad\…\INTEGRAL.cex`, que deja de existir en cuanto la carpeta del expediente cambia de estado.

**REGLA — la medida del previsto es UN conjunto AUTOCONTENIDO** (decisión del usuario, 2026-10-10):
un `grupoMedidasMejora` como el que monta un certificador (CE126_Juanmi, 26RES080_84), con
«Nuevas Instalaciones» (los equipos del previsto) + una «Adición de Aislamiento Térmico» por cada
tipo de cerramiento que el previsto aísla + una «Sustitución/mejora de Huecos» con las orientaciones
de las ventanas que cambia. Lo construye el propio CE3X (oráculo `medida_previsto.py`,
`_medidas_envolvente` saca las piezas comparando el inicial con el previsto), lo calcula, lo guarda
y escribe el XML. No depende de ningún fichero de fuera. Verificado: el clic abre las cinco entradas
del árbol, y reabierto y recalculado desde cero da el mismo ahorro (24,3 / 57,1 / 94,1 %) y el mismo
coste en el XML («50000-100000», 90.000 €).

**Lo que un conjunto NO puede decir igual que el previsto**, y por eso su ahorro se parece pero no es
idéntico (aceptado por el usuario):

- **La ventilación (0,53) y la masa «Ligera»** del previsto son datos generales, no medidas: el
  conjunto calcula con las del inicial. En el 82: previsto 149 kWh/m² de calefacción, conjunto 175,8.
- **CE3X aplica la medida de huecos por ORIENTACIÓN**: cambia todos los huecos de las fachadas
  marcadas, también una puerta. Solo se marca lo que cambia de verdad (si el % de marco no cambia, la
  casilla va sin marcar y la puerta conserva su 90 %), y lo que no casa sale en los avisos
  (`avisos_medida`). Orden de las nueve casillas, leído del diálogo de CE3X 3.2: Norte, NO, NE, Sur,
  SO, SE, Lucernarios, Oeste, Este.
- **El aislamiento va por TIPO de cerramiento** (todas las fachadas, toda la cubierta): si el
  previsto aísla solo algunas, se avisa.
- **Los textos** (nombre, características, justificación, inversión, vida útil) son los mismos de
  siempre (`previstoRes080.textosDelPrevisto`). La inversión va entera en la primera fila del
  resumen económico y 0 en las demás: el presupuesto es uno.
- **Un conjunto recién creado no lo calcula `calculoMedidasUsuario`** (vuelve sin ahorro y el XML
  revienta en el análisis económico con «'NoneType' object has no attribute 'casoValido'»): se
  calcula con `calificacion()` + `calcularAhorros()`, como en `cex_a_xml.py`.

**REGLA — la fachada se aísla «por el INTERIOR» salvo que el plan diga `exterior: true`**
(decisión del usuario, 26RES080_82). Por el exterior, CE3X pone a los puentes térmicos de la
medida los ψ de un SATE (0,01 · 0,16 · 0,02 · 0,65 · 0,16 · 0,26 · 0,22). Medido en el 82: ψ·L de
229,7 a 29,6 W/K y la demanda de calefacción de 149 a 92,5. El previsto (`tools/previsto.py`) no
toca los puentes, así que con «exterior» la medida del inicial y el CEE final dirían cosas muy
distintas. El texto de la medida dice por dónde va («…de las fachadas por el interior…»).

Fuente única: [tools/oraculo_ce3x/medida_previsto.py](implementation/cee-engine/tools/oraculo_ce3x/medida_previsto.py)
y [services/cee/cexAPdf.js](implementation/backend/services/cee/cexAPdf.js) (`ponerPrevistoComoMedida`).
Para comprobar un `.cex` que «no abre la medida»: `clic_medida.py` con el runner del oráculo.
