<!-- conocimiento · área: envolvente-ce3x · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## El botón que metía su propio EVENTO dentro del POST (2026-09-18)

La ventana del certificador enseñó «No se pudo construir la envolvente.» y nada
más. Comprobado contra producción: el contenedor `cee-engine` levantado, **la
MISMA referencia catastral (4065305WJ3446E) medida en 34,5 s con un 200** desde
dentro del VPS — y **ni una petición de geometría** en el log de nginx ni en el
del backend. Ninguna. La petición no llegaba a salir del navegador.

**LA CAUSA, que solo se supo al anotar el fallo en el servidor:**

```
"mensaje":"Converting circular structure to JSON --> starting at object with
           constructor 'Window' --- property 'window' closes the circle"
```

`traerGeometria(cuerposFuera = null)` se enganchó al botón con
`onClick={onTraer}`, así que **React le pasaba su `SyntheticEvent` por el
argumento de «los cuerpos que se dejan fuera»**. Ese evento lleva `view: window`,
o sea una referencia circular: el cuerpo del POST no se podía serializar, axios
ni lo mandaba, y por eso no había rastro en ningún log. Entró en `86308b9`
(16/09/2026, 22:21) con los cuerpos excluidos, y el último POST de geometría con
éxito es de ese mismo día a las 15:25 — o sea que **el botón no funcionó ni una
sola vez desde entonces**. La retoma automática sí (pasa una lista), y por eso
los expedientes con trabajo guardado seguían abriendo y nadie lo cazó.

**REGLA — lo que va a viajar en el cuerpo de un POST se NORMALIZA en la función,
no en quien la llama.** `soloLista(v)`: una lista, o nada. Puesta en el sitio que
llama, el siguiente que enganche esa función a un `onClick` vuelve a romperlo sin
enterarse — y el fallo no se ve en la pantalla ni en el servidor.

**REGLA — un cuerpo que no se puede serializar se para ANTES de salir, se dice
que el fallo es NUESTRO y no se reintenta.** Repetir un error de programación da
exactamente el mismo error, y contarlo como un problema de red manda a mirar el
router a quien tiene la red perfecta — que es justo lo que pasó: el certificador
trasladó la incidencia con conexión buena.

| Qué | Dónde |
|---|---|
| Reintento, explicación del fallo y anotación | [pedirEnvolvente.js](implementation/frontend/src/features/cee-envolvente/logic/pedirEnvolvente.js) |
| Ruta del diagnóstico | `POST /api/cee-envolvente/diagnostico` (**internalOnly**, declarada ANTES que `/:expedienteId/…`) |
| Plazo de la pasarela | `location ~ ^/api/cee-envolvente/` con 300 s, a mano en el VPS |
| Prueba | `node implementation/backend/scripts/test_envolvente_fallos.mjs` |

**REGLA — un mensaje de error tiene que decir QUÉ ha pasado.** Esa frase cubría a
la vez el motor caído, Catastro bloqueado, el corte de la pasarela, la sesión
caducada y un tropiezo de la red. Con todas iguales no hay nada que mirar y lo
único que se puede hacer es volver a pulsar a ciegas — que es exactamente lo que
pasó: cuatro aperturas de la página en trece minutos. Ahora cada causa dice lo
suyo **con el paso siguiente pegado**, y el texto del backend se CONSERVA y se le
añade el consejo detrás: sustituirlo pierde el dato (`Catastro: 403`) y dejarlo
solo no dice si hay que esperar, reintentar o avisar.

**REGLA — una petición que NO HA LLEGADO se repite UNA vez, sola.** Sin respuesta
del servidor no ha pasado nada al otro lado. Y es justo el caso que se arregla
solo: una conexión **HTTP/2 reutilizada que el servidor acaba de cerrar tumba el
POST y no el GET** —el navegador reintenta los GET por su cuenta y los POST no—,
que es literalmente lo que se midió ese día (todos los GET de la página en 200 y
el POST sin rastro en ningún log). Un tropiezo de red dura un segundo.

**REGLA — `repetible` lo dice QUIEN LLAMA, nunca se deduce.** Sin respuesta no hay
forma de distinguir «no llegó a salir» de «llegó y se murió el camino de vuelta»,
así que repetir solo es seguro cuando la petición **no escribe nada**: medir el
edificio lo es (lee Catastro, y el motor lo tiene cacheado), escribir el `.cex`
**no** —toca Drive y archivaría en OLD una copia de más—.

**REGLA — un fallo CON respuesta no se repite.** El servidor ya ha contestado que
no, y en un 502 al otro lado está el **WAF del que depende el buscador de la app**:
insistir es la forma de que nos bloquee la IP. Por eso ese mensaje dice
expresamente que no se insista.

**REGLA — lo que falla se ANOTA en el servidor.** Un fallo que solo vive en la
pantalla de quien lo sufre no se puede diagnosticar después: lo que llega por
teléfono es «no me funciona». Mismo patrón que `/api/afirma-diagnostico`, y con el
mismo cuidado — ruta, código y navegador, **nunca** el expediente ni datos de
nadie. Para leerlo: `docker logs brokergy-backend | grep ceeEnvolvente`.

### Y la pasarela cortaba antes que el backend

`/api/` va con `proxy_read_timeout 120s` y el backend espera **180 s** para medir
(`ESPERA_ENVOLVENTE_MS`) y 120 s para escribir el `.cex`. Con nginx cortando
primero, lo que llega al navegador es **su página HTML**: `data.error` no existe y
el mensaje caía en el genérico — la misma frase, otra causa más. Es el mismo fallo
que ya costó un diagnóstico en las rutas de lote (regla 40), así que se le da su
propia `location` con **300 s**, para que el que mande sea el plazo del backend,
que sí explica que ha sido el motor.

Aplicada **a mano en el VPS** (`nginx/nginx.conf`, que está divergido del repo) y
con `docker compose restart nginx`, nunca `reload`, por el gotcha del inodo del
bind-mount. Ver `deploy_workflow`.

⚠️ Lo que aquí **no** se puede afirmar: no hay prueba directa de cuál de las dos
—conexión HTTP/2 medio cerrada o tropiezo de red— tumbó aquella petición, porque
no dejó rastro en ningún sitio. Lo que sí está medido es que **no llegó**, y las
dos se arreglan igual. Si vuelve a pasar, **lo primero es la línea del log**, no
volver a suponer.
