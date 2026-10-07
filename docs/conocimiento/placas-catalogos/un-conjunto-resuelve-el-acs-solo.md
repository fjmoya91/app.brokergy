<!-- conocimiento · área: placas-catalogos · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## Un CONJUNTO resuelve el ACS solo (2026-09-13)

Muchos equipos del catálogo traen el acumulador DENTRO — lo que en obra se llama un
**conjunto** (all-in-one, compacto, hidrokit con depósito). Esa misma máquina calienta
el agua, pero la app obligaba a volver a elegir marca y modelo en la columna de ACS:
medido, **41 expedientes** tienen el mismo modelo tecleado dos veces, y en los que se
elegía otro por error se declaraban DOS máquinas donde hay una.

| Qué | Dónde |
|---|---|
| Qué ACS da un modelo del catálogo (método, justificante, qué falta) | [logic/acsCatalogo.js](implementation/frontend/src/features/expedientes/logic/acsCatalogo.js) |
| ¿El nodo de ACS es OTRA máquina? | `acsEsOtraMaquina` en [aerotermiaUnits.js](implementation/frontend/src/features/expedientes/logic/aerotermiaUnits.js) (+ su espejo CJS) |
| Popup que arregla el catálogo (η_wh del Anexo IV · COP A7/55 del Anexo VI) | `EprelAcsModal.jsx` → `PATCH /api/aerotermia/:id/datos-acs` (**staffOnly**) |
| Unir el EPREL a la ficha del catálogo | [fichaEprelMerge.js](implementation/backend/services/fichaEprelMerge.js) (núcleo compartido con `scripts/combinar_ficha_eprel.js`) |
| Pruebas | `node implementation/backend/scripts/test_acs_conjunto.mjs` |
| Qué expedientes declaran hoy un SCOP que el catálogo no sostiene (solo LEE) | `node implementation/backend/scripts/revisar_acs_expedientes.js` |

**REGLA — "lleva depósito" y "produce ACS" NO son lo mismo.** `deposito_acs_incluido`
dice lo primero; los datos (`scop_dhw_*`, `eta_acs_*`, `cop_a7_55`) dicen lo segundo.
Confundirlos estaba costando por los dos lados: **79 equipos producen ACS SIN depósito
integrado** (el depósito va aparte, que es el supuesto del Anexo VI) y **27 llevan
depósito sin ningún dato de ACS**. Por eso el badge del catálogo dice ahora **CONJUNTO**
(con sus litros) y **ACS** por separado, y la columna de SCOP ACS de esa pantalla
aparece cuando hay SCOP_dhw — no cuando hay depósito, que dejaba en blanco la columna
de esos 79.

**REGLA — el desplegable de ACS solo ofrece lo que puede JUSTIFICAR un SCOP_dhw.** Sin
ese filtro, elegir un modelo sin datos no daba error: `getScopAcsFromModel` cae a un
**3,0 inventado** que acaba impreso en el CIFO. Quedan 389 de 490. **Lo ya guardado no
se esconde nunca** aunque el filtro lo dejara fuera —el desplegable se quedaría vacío y
el siguiente guardado borraría el equipo—: se conserva a la vista y se avisa de que su
SCOP no sale de ninguna parte.

**REGLA — el SCOP_dhw sale de la FICHA si la ficha lo trae; si no, del Anexo IV.** El
valor del fabricante es el más directo de defender (226 de los 253 conjuntos lo tienen);
el Anexo IV (2,5 · η_wh, con el η_wh del EPREL) es el método propio del conjunto. El
**Anexo VI NO es una alternativa**: su enunciado es "depósito **no** suministrado como
conjunto", así que solo aplica a los equipos sin depósito integrado. En un conjunto sin
ninguno de los dos datos no se inventa un tercero.

**REGLA — lo que falta se arregla en el CATÁLOGO, no en el expediente.** Con esos 27
conjuntos salta un popup que pide el η_wh del EPREL y **anexa su PDF a la ficha técnica
del modelo** —que es el fichero que el CIFO adjunta como justificante—: se teclea UNA
vez y queda resuelto para todos los expedientes que lleven ese equipo. Mismo criterio
que el popup de datos del RITE. Se puede salir sin rellenar: es un hueco del catálogo,
no un error del expediente.

**REGLA — el conjunto hereda el equipo, NUNCA el SCOP.** Con `misma_aerotermia_acs` en
true el nodo de ACS es un CLON del de calefacción, así que **se declaraba el SCOP de
calefacción como SCOP_dhw** — y la misma bomba rinde mucho menos calentando agua a
55-60°. Por eso el autorrelleno deja los dos nodos con el mismo modelo y la misma serie
pero con el flag en **false** y su SCOP propio, que es exactamente lo que la gente ya
hacía a mano (33 de esos 41 expedientes tienen los dos SCOP distintos).

**REGLA — dos nodos no son dos máquinas: lo decide `acsEsOtraMaquina`, no el flag.** Al
bajar el flag a false, cuatro validaciones habrían empezado a pedir "el nº de serie de
la ud. interior (ACS)" de una máquina que ya lo declaró, y a avisar de que las dos
series coinciden cuando coincidir es lo correcto (`routes/expedientes.js`,
`cifoService`, `DocumentacionModule`, `EnviarAnexosModal`). Un nodo de ACS **vacío** sí
sigue reclamándose: es un hueco por rellenar, no un conjunto resuelto.

**REGLA — se rellenan HUECOS, nunca se pisa lo escrito.** El autorrelleno no toca un
ACS ya decidido aparte (un termo, un acumulador o **otro modelo**) ni rehace el SCOP,
el método o los litros que se hayan ajustado a mano mientras siga siendo el mismo
equipo — y salta en cada cambio del bloque de calefacción, también al teclear su nº de
serie.

⚠️ **El flag `deposito_acs_incluido` tiene RUIDO en el catálogo, y el síntoma es
`litros_acs` vacío.** 27 modelos lo tenían puesto sin litros y sin ningún dato de ACS,
y todos son bombas de CALEFACCIÓN de 4 a 18 kW. **11 ya están corregidos**
(`scripts/flag_conjunto_acs_mal_puesto.sql`), y en los 11 la prueba es documental y del
propio fabricante: los 6 **SIME SHP M PRO** por su ficha de gama (Rgto. 811/2013, que las
declara monobloque para calefacción, sin perfil de ACS ni volumen de acumulación), y otros
5 porque su registro **EPREL es `spaceheaters`** —la categoría de CALEFACTOR, distinta de
la del combinado que además da ACS— o su informe **Keymark** dice *"Application: Heating"*.
**Quitar el flag no mueve ninguna cifra guardada**: solo se lee al ELEGIR el modelo, y los
SCOP viven persistidos en `instalacion`.

**REGLA — la ficha de una GAMA no prueba lo que lleva UN modelo.** Es lo que impide cerrar
los 16 que quedan: el mismo PDF cubre la variante con depósito y la que no, así que
mencionar un perfil de carga de ACS no dice que ESE modelo lo lleve. Lo que sí distingue es
la CATEGORÍA EPREL (`spaceheaters` vs combinado) o el Keymark. Y el error existe en los dos
sentidos: los **GREE VERSATI IV MB 12 y 16** SÍ producen ACS —su Keymark declara
"Calefacción/ACS" con perfil de carga XL—, así que ahí lo que falta no es quitar el flag
sino rellenar sus datos de ACS.

**REGLA — el COP A7/W55 NO está en la ficha de producto, sino en las TABLAS DE
RENDIMIENTO.** La ficha del Rgto. 811/2013 declara SCOP por clima y η_s; el punto de
ensayo A7/W55 vive en la tabla de datos técnicos del catálogo (fila DB = 7 °C, columna
LWT = 55 °C, EN 14511) o en el informe **Keymark** (EN 14511-2, *Medium temperature*). De
ahí salieron los 6 de las SIME y 3 más. Cada valor se comprueba contra su propia fila
(**COP = HC / PI**), que es la verificación que la tabla trae dentro.

⚠️ **El único COP que había estaba MAL**: la SHP M PRO 010 tenía 3,650, que es su
**A7/W45** copiado de la columna de al lado — un 18 % por encima del real (3,10). Con él,
25RES060_68 declara un SCOP_dhw de 4,06 donde le corresponderían 3,45.

⚠️ **Un documento COMPARTIDO entre modelos trae un bloque por modelo — hay que leerlos
todos, no solo el primero.** BAXI certifica su Keymark por PAREJA ("Iridium 4/6",
"Iridium 12/14"): el enlace de `ficha_tecnica` del 6 kW y del 14 kW YA apunta al PDF
correcto, con su propio bloque `Model Iridium X MR` dentro. La primera lectura se quedó
con el primer bloque del texto plano y por eso parecían "sin COP propio"; leyendo el
documento entero cada uno tiene su ensayo: 6 kW → 3,20 (distinto del 4 kW: 3,24) y
14 kW → 3,04 (distinto del 12 kW: 3,15). Los 5 IRIDIUM tienen ya su COP completo.

No se siembra a ojo —de ese número sale el SCOP_dhw que se declara—: el aviso del
expediente ofrece **"Completarlo ahora"**, que abre el mismo popup en modo Anexo VI y
escribe el COP en el catálogo. Un COP fuera de 1,5-6 se rechaza: por encima suele ser el
COP a 35 °C copiado por error.

⚠️ **Con la prioridad "ficha primero", el método `conjunto` no se activa hoy en ningún
modelo**: los 179 que tienen η_wh tienen además SCOP_dhw de ficha. Entrará en juego en
cuanto el popup rellene el η_wh de alguno de los 27, que es justo para lo que existe.
