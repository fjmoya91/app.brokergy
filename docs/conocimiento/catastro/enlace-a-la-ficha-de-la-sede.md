### El ENLACE a la ficha del inmueble en la Sede (2026-10-07)

Fran pulsó el icono del Catastro de la lista de clientes y la Sede le contestó **«No hay
inmuebles en la ubicación seleccionada»**. El enlace era el de siempre:

```
https://www1.sedecatastro.gob.es/CYCBienInmueble/OVCListaBienes.aspx?rc1=7847709&rc2=VJ9374N&RCCompleta=7847709VJ9374N0001DD
```

Ese enlace **no es la ficha**: es un atajo que la Sede RESUELVE y redirige a
`OVCConCiud.aspx?del=..&mun=..&UrbRus=&RefC=<20>`. Y esa resolución depende del navegador:
el mismo enlace, en un navegador limpio, abría la ficha; en el Chrome de Fran (con su sesión
de la Sede) daba el error. El enlace que a él SÍ le abría la ficha era la dirección final:
`OVCConCiud.aspx?UrbRus=U&RefC=7847709VJ9374N0001DD&…&del=13&mun=82`.

| Qué | Dónde |
|---|---|
| Qué pide la Sede (delegación, municipio, referencia de 20, si hay varios inmuebles) | `codigosSede` en [catastroService.js](implementation/backend/services/catastroService.js) |
| A qué página se va (pura, sin red) | `urlSedeCatastro` en el mismo fichero |
| La ruta | `GET /api/catastro/sede/:rc` → 302 ([routes/catastro.js](implementation/backend/routes/catastro.js)) |
| Todos los iconos del frontend | `enlaceSedeCatastro` en [utils/enlacesInmueble.js](implementation/frontend/src/utils/enlacesInmueble.js) (`EnlacesInmueble`: clientes, ficha técnica, envolvente) |
| El «Ver en Catastro» de la página del encargo | `comoLlegar` en [services/encargoTecnico.js](implementation/backend/services/encargoTecnico.js) |
| Prueba | `node implementation/backend/scripts/test_enlace_sede_catastro.js` (`--en-vivo`: contra el Catastro, en serie) |

**REGLA — ningún enlace a la Sede se compone a mano: todos pasan por `/api/catastro/sede/:rc`.**
La app no guarda la delegación ni el municipio de nadie, así que los pone el backend con una
consulta `Consulta_DNPRC` (la de siempre, con `catastroGet`, regla 15). Una vivienda contesta en
0,2-0,4 s y queda en caché 30 días; lo que el Catastro dice que NO existe, un día (la ruta es
pública y no puede convertirse en una forma de preguntarle al WAF por referencias inventadas).
Un error que no es «no existe» no se recuerda: puede ser pasajero.

**REGLA — la ficha exige la referencia de 20.** Con la de 14 (`RefC=7847709VJ9374N`) la Sede
manda a `OVCErrorDatos.aspx` «Error de Datos». Por eso, con una de 14 se usa la de 20 que
devuelve el Catastro si la parcela tiene UN solo inmueble; si tiene varios (un bloque), no hay
una ficha que elegir y se va a la LISTA de la parcela, también con `del` y `mun`.

**REGLA — `mun` es el código del CATASTRO (`dt.cmc`), no el del INE.** En Tomelloso coinciden
(82), en Logroño no: 900 el del Catastro y 89 el del INE. Mismo criterio que `getReformsByRC`.
La delegación es `dt.loine.cp` (la provincia).

**REGLA — `UrbRus` lleva U o R según el `cn` del Catastro** (`UR` / `RU`), como el enlace que a
Fran le funcionaba. Vacío también abre la ficha (es lo que pone la redirección de la propia
Sede) y es lo que va cuando no se sabe — en un bloque, por ejemplo, el `cn` no viene.

**REGLA — si el Catastro no contesta o está bloqueado, se va al atajo de siempre.** Un enlace
que a veces falla es mejor que uno que no abre nada, y el atajo lo resuelve el navegador de
quien pulsa —no la IP del servidor—, así que no castiga al WAF. Un bloqueo (`isRateLimitResponse`)
pasa por el monitor como en el resto del servicio (`record403` → modo BLOQUEADO).

A qué página va cada caso (medido el 07/10/2026, la ruta y la página abierta en el navegador):

| Referencia | Va a | Tiempo |
|---|---|---|
| `7847709VJ9374N0001DD` (urbana, CL AMPARO 9, Tomelloso) | ficha `del=13&mun=82&UrbRus=U` | 0,4 s |
| `7847709VJ9374N` (su parcela, un solo inmueble) | la MISMA ficha, con la de 20 | 0,3 s |
| `13019A01100079` (rústica, polígono 11 parcela 79, Argamasilla de Alba) | ficha `del=13&mun=19&UrbRus=R&RefC=13019A011000790000QZ` | 0,2 s |
| `3121402WN4032S` (bloque de Logroño, 118 inmuebles) | lista `del=26&mun=900&rc1=3121402&rc2=WN4032S` | **4,9 s** |
| `7847709VJ9374N0001` (18: sin los dos de control) | la de su parcela (los 14 primeros) | caché |
| `ZZZZZZZZZZZZZZ` (no existe) | el atajo | 0,07 s |
| `1234` | 400 (y en el frontend, sin botón) | — |

⚠️ La lista de un BLOQUE es lenta de componer: 4,9 s con 118 inmuebles. Por eso la consulta va
con un plazo de **10 s** (las demás del servicio, 8 s).

⚠️ La ruta es **pública a propósito** (está en las abiertas de `auditar_rutas_sin_guardian.js`):
es un enlace que se abre en otra pestaña, sin sesión que mandar, y no lleva ningún dato nuestro.
Responde con `Cache-Control: no-store` para que un atajo de un mal momento no se quede guardado.

⚠️ El enlace de la ficha técnica a la **cartografía** (`Cartografia/mapa.aspx?del=&mun=&refcat=`,
en `PropertySheet`) es OTRO enlace y no se ha tocado.
