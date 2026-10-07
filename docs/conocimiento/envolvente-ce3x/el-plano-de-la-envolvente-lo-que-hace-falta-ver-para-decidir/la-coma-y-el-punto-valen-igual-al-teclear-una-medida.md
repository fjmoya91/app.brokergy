<!-- conocimiento · área: envolvente-ce3x · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «El plano de la envolvente: lo que hace falta VER para decidir (2026-09-13)»; la introducción y el resto, en esta misma carpeta.

### La COMA y el PUNTO valen igual al teclear una medida (2026-09-21)

Lo dijo el certificador: *«si pongo 2.2 o 2,2 es lo mismo. y eso da error.»* Y no
era un error visible: era un **0 guardado como medida buena**.

Un `<input type="number">` devuelve **cadena vacía** mientras lo escrito no sea
un número completo, y `Number('')` es **0**. Medido en su Chrome, tecleando en
el ancho de una ventana:

| se teclea | el campo devuelve | se guarda |
|---|---|---|
| `2,2` | `"2.2"` | 2,2 ✓ |
| `2.2` | pasa por `2.` → `""` | **0** |
| `2,` | `"2"` (se come la coma) | 2 |
| borrarlo para reescribirlo | `""` | **0** |

Y como **tocar una medida la da por CONFIRMADA** (`cambiaHueco` pone
`estado: 'medido'`), ese 0 quedaba marcado como medida comprobada por el
certificador: una ventana de 0 m² que va al `.cex` sin que nada lo delate.

| Qué | Dónde |
|---|---|
| Leer y escribir el número (puro, probable desde Node) | [numeroDecimal.js](implementation/frontend/src/utils/numeroDecimal.js) |
| El campo | [CampoDecimal.jsx](implementation/frontend/src/components/CampoDecimal.jsx) |
| Prueba | `node implementation/backend/scripts/test_numero_decimal.mjs` |

**REGLA — mientras se escribe manda el TEXTO, no el número.** Un campo
controlado por el número se pelea con quien lo teclea: al escribir «2,» el valor
ya es 2, y si el componente reescribe «2» la coma desaparece debajo de los dedos.
El texto vive en el campo hasta que se sale de él (`onBlur`), y entonces se
enseña el número de verdad, con su coma.

**REGLA — lo que no es un número NO vale 0: no vale nada.** `aNumero` devuelve
**`null`**, que no es 0, y de esa diferencia depende todo lo de arriba. Un campo
a medias no es un error y no se avisa de nada: se deja escribir, no se guarda, y
al salir vuelve a enseñar el último valor bueno.

**REGLA — vaciar el campo significa cosas distintas y lo dice quien lo pone**
(`alVaciar`). En la U de la pared significa «vuelve a la de su época»; en el
ancho de una ventana no significa nada, porque una ventana siempre mide algo, y
ahí el vacío no puede escribir un cero.

⚠️ Va con `inputMode="decimal"`, así que en el móvil sale el teclado numérico
igual. Lo que se pierde de un `type="number"` son las flechitas y la rueda del
ratón, que sobre una medida es justo lo que no se quiere: pasar el ratón por
encima cambiaba el ancho de una ventana sin tocar nada.

Son los **nueve** campos numéricos de la ventana: las dos medidas de cada hueco
y la U de la pared (`PanelPared`), la U de la ficha, los números del equipo, los
litros del depósito, la superficie y el porcentaje de cada servicio
(`PanelesFicha`) y los dos de `EnvolventeView`.

**Los contadores se fueron a una línea.** Cuatro cajas (medidos · dudosos · sin
tocar · m² de hueco) ocupaban la primera fila y eran lo primero que se veía,
cuando al entrar la única tarea es señalar la entrada. Lo que hace falta —por
dónde se entra, si está guardado y cuánto queda— cabe en un renglón, y el estado
de cada pared ya se ve en el plano por su color.

⚠️ El aviso de «no cierres con trabajo sin guardar» NO cuenta la pared
seleccionada (`hayCambios` la excluye). Se guarda —es cómodo volver donde
estabas— pero preguntando por ella el navegador corta la salida cada vez que se
pulsa una pared y se cierra, y un aviso que salta siempre se responde que sí sin
leerlo, que es justo cuando se pierde algo.

**REGLA — la CALDERA EXISTENTE se vuelca de la oportunidad, no se teclea.**
`instalacionExistente()` compone el equipo de CE3X con lo que ya se rellenó:
`rendimiento_id` (el `boilerId` del funnel) da el rendimiento de combustión de
la MISMA tabla que usó la simulación, `misma_caldera_acs` decide si el equipo es
`mixto2` o solo calefacción, y las superficies salen de la habitable. El
aislamiento va al caso DESFAVORABLE («Sin aislamiento»), que es lo que pusieron
los certificadores en los dos expedientes reales, y sale dicho.

⚠️ **El `boilerId` del carbón y el de la biomasa son el MISMO** (`solid_*`): lo
que los separa es `inputs.fuelType`, que la oportunidad sí guarda (comprobado en
26RES060_OP181: «carbon»).

⚠️ **Las cadenas del desplegable de combustible de CE3X están LEÍDAS, no
deducidas**: de `.cex` guardados por el propio CE3X con cada una
(`ejemplos/GAS_NATURAL.cex`, `CARBON.cex`, `PELLETS.cex`, `GLP.cex`) salen
`Gas Natural` · `Carbón` · `BiomasaDens` · `GLP`, además del `Gasóleo-C` de los
expedientes reales. `BiomasaDens` no se parece a nada que se hubiera adivinado,
y de ahí la regla: `FACTORES_PASO` de la app NO sirve —sus nombres son otros
(«Gasoleo Calefacción»)—. La **ELECTRICIDAD sigue pendiente**:
`ELECTRICIDAD.cex` es byte a byte idéntico a `CARBON.cex` (mismo MD5), o sea que
se guardó sin tocar el desplegable; puede que una caldera eléctrica se declare
por efecto Joule y no lleve combustible. Lo no verificado NO se escribe: una
cadena que CE3X no reconozca deja el campo vacío sin avisar. Igual con la
POTENCIA, que está en la placa y no en el expediente.

⚠️ **Un `.cex` se guarda en LATIN-1** (pickle de protocolo 0). Una raya larga o
unas comillas tipográficas —que en castellano salen solas— rompían la escritura
con un «codec can't encode character» que solo daba una posición en bytes.
`pickle0.Emisor` las cambia por su equivalente y, lo que aun así no quepa, lo
dice con el carácter y el texto delante.

⚠️ **Y las CABECERAS HTTP también van en latin-1.** Los avisos de `/cex` viajan
ahí (el cuerpo es binario), así que un aviso con una raya reventaba la respuesta
entera **con el `.cex` ya escrito**: se perdía un fichero hecho, por un guion.
Se serializan escapados a ASCII; el JSON sigue siendo válido.

**La ventana RETOMA sola.** Si el expediente ya tiene trabajo guardado, la
geometría se pide al abrir y se entra directo al plano: volver a la pantalla de
«traer la envolvente» es un paso de más cuando ya se estuvo ahí. La geometría no
se guarda —es el modelo entero, megas (regla 21)— pero el motor la tiene en
caché y no vuelve a preguntar a Catastro.

**El plano ocupa el ANCHO cuando hay una sola planta** (la rejilla de dos
columnas estaba pensada para dos), con tope de `56vh`: a ancho completo, una
casa casi cuadrada pide 900 px y se salía del modal.

⚠️ **El motor hay que REINICIARLO tras tocarlo, y `/health` lo dice.** Python
importa una vez por proceso: si lleva levantado desde antes del cambio, lo que
se prueba es el código de antes y el resultado parece bueno (me pasó tres veces
seguidas). `/health` devuelve `codigo_at` (lo cargado) y `codigo_en_disco_at`, y
`probar_cex_envolvente.js` avisa cuando no coinciden.

⚠️ **`uvicorn --reload` NO vale en Windows**: levanta un hijo por
`multiprocessing` y al matar al padre el hijo queda HUÉRFANO sirviendo el código
viejo. Llegué a tener TRES servidores compartiendo el 8090, con `netstat`
mostrando PIDs que ya no existían y respondiendo el más antiguo. Sin `--reload`,
y para cerrarlo `taskkill /PID x /T` (el árbol, no solo el padre).

⚠️ `cee-engine` **comparte el puerto 8090 con `rite-generator`** en el
`launch.json`, así que los dos no pueden estar levantados a la vez.
