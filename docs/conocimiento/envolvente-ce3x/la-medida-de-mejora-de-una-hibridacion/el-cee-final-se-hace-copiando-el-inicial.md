<!-- conocimiento · área: envolvente-ce3x · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «La medida de mejora de una HIBRIDACIÓN (2026-09-16)»; la introducción y el resto, en esta misma carpeta.

### El CEE FINAL se hace COPIANDO el inicial (2026-09-13)

El certificado posterior a la obra no se levanta de cero: se abre el inicial, se
quita la caldera, se pone la aerotermia y se guarda. Es como se hace a mano, y
comprobado sobre 26RES060_186 comparando pickle a pickle el `.cex` que generó la
app con el que el certificador guardó desde CE3X: **de los 15 pickles, el único
que cambia de contenido es el 4** (las instalaciones). La envolvente, las
transmitancias, el técnico y las dos imágenes del Catastro ya son las del final.

| Qué | Dónde |
|---|---|
| Qué equipo se escribe (y cuál NO) | `instalacionNueva()` en [fichaCe3x.js](implementation/frontend/src/features/cee-envolvente/logic/fichaCe3x.js) |
| Sustituir UN pickle dejando los demás byte a byte igual | `sustituir_pickle` en [editar_cex.py](implementation/cee-engine/tools/editar_cex.py) |
| Retirar el generador viejo y heredar del fichero | `slots_a_retirar` · `heredar_del_base` en `generar_cex.py` |
| Ruta del motor | `POST /cex/instalaciones` (multipart: el `.cex` base + la ficha) |
| Ruta de la app | `POST /api/cee-envolvente/:id/cex` con `fase: 'final'` |
| Carpeta y nombre | `1. CEE / CEE FINAL` · `{nº} - CEE FINAL_REVISAR.cex` |
| Pruebas | `node implementation/backend/scripts/test_cex_final.mjs` · `probar_cex_envolvente.js 26RES060_186 --final` |

**REGLA — se COPIA, no se regenera.** Dos motivos y ninguno es comodidad: (1) el
inicial ya tiene dentro la foto de fachada y el croquis, así que regenerar sería
volver a pedirle DOS imágenes al mismo WAF del que depende el buscador; (2) si el
certificador corrigió algo al abrirlo en CE3X, su corrección se conserva en vez
de deshacerse sin decirlo. Sin inicial en la carpeta la ruta responde **409**
diciendo que se genere ése primero: el final es el inicial con un cambio, y sin
inicial no hay nada que cambiar.

**REGLA — el generador viejo se RETIRA, y se dice con su nombre.** El CEE final
no lleva la caldera Y la bomba de calor: la caldera se ha quitado — es la
actuación entera. Qué slots se vacían se deduce de los SERVICIOS que asume el
equipo nuevo (`SERVICIOS_DEL_SLOT`), no de una lista escrita a mano: un `mixto2`
retira los generadores de calefacción y ACS, y el día que se escriba un `mixto3`
retirará también la máquina de frío sin que haya que acordarse. Lo que la obra no
toca —las placas solares del slot `renovable`, la iluminación, las bombas de
circulación— se queda.

**REGLA — lo que ya dice el fichero MANDA sobre lo que deduzca la app.** Es la
consecuencia de copiar: la **superficie servida** y el **depósito de ACS** se
heredan del `.cex` base. El depósito sobre todo — es del edificio, no de la
caldera, y nadie lo tira al cambiar el generador; escribir `[False]` porque el
expediente no guarda los litros declararía que la vivienda ha perdido su
acumulación. Lo que el expediente SÍ declare gana (ahí hay un acumulador nuevo de
verdad), y una superficie que difiera sale avisada con las dos cifras.

**REGLA — una placa de bomba de calor declara el rendimiento como CONOCIDO.** El
SCOP viene ensayado en la ficha del fabricante: CE3X no calcula nada. Eso cambia
la casilla `[6]` y con ella **la forma del bloque `[7]`** que va detrás — con
`Estimado según Instalación` son `[aislamiento, rend_combustión, carga, potencia,
…]` y con `Conocido (Ensayado/justificado)` es `[rend_acs, rend_cal, '']`.
Medido sobre los 1.506 `.cex` de producción: de los 138 equipos mixtos con bomba
de calor, **132** lo declaran como conocido, los 138 con combustible
`Electricidad`, y **123 sin acumulación**. El slot de SOLO calefacción son 9
campos con el hueco del ACS vacío (226 casos reales, todos conocidos).

**REGLA — la HIBRIDACIÓN no se escribe.** Ahí la caldera NO se retira: son dos
generadores repartiéndose la demanda, y escribir solo la bomba declararía un
edificio que no existe con el 100 % de la cobertura. Se dice y se para.

**Resultado medido en 26RES060_186**: los **10 campos** del registro salen
idénticos a los que tecleó el certificador (`mixto2` · `['300','434','']` ·
`Bomba de Calor - Caudal Ref. Variable` · `Electricidad` · acumulación de 150 l),
y del fichero entero **solo cambia el pickle 4**.

⚠️ **Un equipo de ACS con el MISMO modelo que el de calefacción es UNA máquina.**
`acsMismoEquipo` exigía `misma_aerotermia_acs`, un flag que baja a `false` en
cuanto alguien rellena el bloque de ACS para poner su SCOP_dhw — que es lo
normal, porque la misma bomba rinde 4,34 en calefacción y 3,00 en ACS. Medidos
**41 expedientes** con el mismo modelo en los dos nodos y el flag en false: a
todos se les decía que declararan DOS equipos en CE3X para una sola máquina. Es
la regla 12.c leída por el otro lado —el flag tampoco puede PARTIR EN DOS una
máquina— y afecta a las superficies CE3X (el popup «Datos del equipo» y el
encargo al certificador), no al CIFO ni al ahorro. De paso, el **SCOP_dhw sale
del nodo de ACS siempre que lo declare**: con el equipo unificado se estaba
tomando el de calefacción, que es el número alto.

⚠️ **La altura de planta por defecto pasa de 2,70 a 2,80 m.** Está en CUATRO
sitios y van juntos: `Opciones.floor_height` (pipeline), el CLI, la ruta
`/envolvente` del motor y el respaldo de `fichaCe3x`. No es cosmético: de ella
salen las superficies de fachada que se miden, así que **las envolventes traídas
antes de este cambio dan otra superficie** — hay que volver a traerlas para que
el `.cex` cuadre con la altura que declara.

⚠️ **Las PARTICIONES se pintan en ROSA** en el plano. Es el único tipo de
cerramiento que no se distingue mirando: una fachada da a la calle y una
medianera al vecino —los dos se ven en el contexto—, pero una partición da a un
local o a un espacio no habitable, que es una DECISIÓN del certificador. Cuenta
como partición lo que va a SALIR como tal en el `.cex`: la pared reclasificada
**y** la medianera marcada como partición; pintar solo la primera dejaría la
mitad con el color de otra cosa.
