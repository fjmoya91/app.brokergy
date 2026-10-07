<!-- conocimiento · área: envolvente-ce3x · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## El ACS que hace OTRA máquina también se escribe (2026-09-14)

CE3X se negó a calcular la medida de mejora de 26RES060_187:

> **La instalación de ACS no está bien definida. El porcentaje de demanda
> cubierta debe ser el 100 %.**

No era la medida: era que el `.cex` declaraba UN solo equipo. La obra monta una
**BAXI IRIDIUM 12** para calefacción y una **BAXI BC ACS 150 IN** para el agua,
y del segundo aparato solo salía un aviso pidiéndole al certificador que lo
añadiera a mano en CE3X. **Un aviso no rellena una casilla**: con el ACS cubierto
al 0 %, CE3X no deja calcular ni la medida ni el certificado.

| Qué | Dónde |
|---|---|
| Qué equipo resuelve el ACS y con qué rendimiento | `equipoDeAcs()` en [fichaCe3x.js](implementation/frontend/src/features/cee-envolvente/logic/fichaCe3x.js) |
| Cómo se llama (título del conjunto **y** casilla del equipo) | `nombreAcsCe3x()` en [ce3xFinal.js](implementation/frontend/src/features/expedientes/logic/ce3xFinal.js) |
| Cómo se escribe en el fichero | `equipo_acs()` en [generar_cex.py](implementation/cee-engine/tools/generar_cex.py) |
| Pruebas | `node implementation/backend/scripts/test_cex_final.mjs` · `pytest implementation/cee-engine/tests/test_equipos.py` |

**REGLA — una obra con el ACS APARTE son DOS equipos, y los dos se escriben.**
`instalacionNueva` devuelve `extras`, que entran tanto en la instalación del CEE
final como en el `datosInstalaciones` de la medida de mejora —la medida es TODO
lo que se instala, igual que su título (regla del nombre del conjunto)—. El de
ACS cubre el **100 %** de esa demanda: es el único aparato que la produce, y es
exactamente lo que CE3X comprueba antes de dejar calcular.

**REGLA — en el slot ACS, la casilla [6] manda sobre la FORMA del [7]**, igual
que en el mixto y en el de calefacción. Medido sobre el corpus: de los **544**
equipos del slot ACS, **205 declaran el rendimiento CONOCIDO** (183 de ellos
bombas de calor) y en **204 de esos 205** el campo [7] es el MISMO trío que el
[2] — sin interruptores y sin cola, porque un COP ensayado no tiene nada que
aproximar:

```
['BOMBA DE CALOR ACS THERMOR VM 150', 'ACS', ['334','',''],
 'Bomba de Calor - Caudal Ref. Variable', 'Electricidad',
 [['141.0','100'], ['',''], ['','']], 'Conocido (Ensayado/justificado)',
 ['334','',''], [False], 'Edificio Objeto']
```

Un **TERMO** va por la otra rama —`Efecto Joule`, estimado al 100 %—, que son
los 260 casos más frecuentes del corpus. Y **sin SCOP_dhw no se escribe nada**:
declarar «conocido» con la casilla vacía deja el equipo tan mal definido como no
ponerlo, y además inventaría un rendimiento.

**REGLA — el DEPÓSITO cuelga de la máquina que calienta el agua.** Si el ACS va
aparte, los litros son de ESA máquina, no del equipo de calefacción — que además
es un slot de 9 campos, sin sitio donde escribirlos. El motor sigue heredando el
depósito del `.cex` que se copia cuando el expediente no lo declara.

⚠️ **Y el CEE FINAL salía SIN NINGUNA INSTALACIÓN, en silencio.** Se descubrió
tirando de este hilo: `equipoConAjustes` exigía **potencia** para escribir
cualquier equipo, y la potencia es de la cola con la que CE3X ESTIMA el
rendimiento de una caldera — una bomba de calor declara su SCOP ensayado y esa
cola ni existe. La aerotermia se caía a `null` y, como `ajustes` viene vacío, ni
siquiera salía el aviso. Ahora la potencia (y el aislamiento, y el rendimiento de
combustión) solo se exigen y solo se escriben cuando el rendimiento es
`estimado`.

⚠️ `tools/generar_cex.py` de `C:\Proyectos\CEE` **ya NO es idéntico** al de la
app (1.548 líneas frente a 1.884: no tiene ni `equipo_acs`). El que se despliega
es el de la app; el otro se quedó atrás.
