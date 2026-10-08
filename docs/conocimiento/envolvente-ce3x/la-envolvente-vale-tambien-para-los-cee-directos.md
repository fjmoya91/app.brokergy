<!-- conocimiento · área: envolvente-ce3x · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## La envolvente vale también para los CEE DIRECTOS (2026-09-16)

El botón **CE3X** está en el módulo CEE, y el módulo CEE se monta igual sobre el
expediente CAE y sobre un CEE contratado suelto. Pero la ventana pedía el
encargo a `/api/expedientes/:id` y contestaba **«Ese expediente no existe»**: son
dos tablas y el mismo UUID no vale en las dos. Para levantar el `.cex` de un CEE
suelto había que hacerlo entero a mano en CE3X.

| Qué | Dónde |
|---|---|
| Un CEE directo con la FORMA de un expediente | [logic/ceeDirecto.js](implementation/frontend/src/features/cee-envolvente/logic/ceeDirecto.js) — `ceeDirectoComoExpediente` |
| De qué negocio es esta ventana, y cómo se compone cada URL | [logic/apiEnvolvente.js](implementation/frontend/src/features/cee-envolvente/logic/apiEnvolvente.js) |
| Dónde se escribe y en qué carpeta cae el `.cex` | `esCeeDirecto` · `setCeeField` · `carpetaFase` · `sufijoCex` en [ceeEnvolventeCex.js](implementation/backend/services/ceeEnvolventeCex.js) |
| RPC | `set_cee_directo_cee_field` (`scripts/cee_envolvente_cee_directos.sql`) |
| Probarlo de punta a punta, sin escribir en Drive | `node implementation/backend/scripts/probar_cex_envolvente.js 2026CEE_55 --cee` |

**REGLA — se ADAPTA la fila, no se bifurca la lógica.** La ficha, el plano y la
dirección de instalación están escritos contra `instalacion.ref_catastral`,
`instalacion.municipio`, `instalacion.zona_climatica`… y en `cee_directos` eso
son COLUMNAS sueltas, porque allí no hay una instalación que describir.
`ceeDirectoComoExpediente` las compone en un `instalacion` sintético y todo lo
demás —`fichaCe3x`, `buildInstalacionAddress`, el subtítulo— funciona sin
enterarse. Es el mismo criterio con el que el módulo CEE se monta sobre las dos
tablas: un `if (esCeeDirecto)` dentro de `fichaCe3x` habría que mantenerlo dos
veces y una de las dos se queda atrás sin que nada lo diga.

**REGLA — el ADAPTADOR es fuente única con la ventana.** La pantalla pinta la
misma fila que el backend usa para componer el `.cex`, así que vive en el
frontend y el backend lo carga por `import()` ESM (mismo patrón que `fichaCe3x`).
Con dos adaptadores, la dirección que se enseña y la que se escribe en el fichero
saldrían de sitios distintos.

**REGLA — el ORIGEN viaja explícito (`?origen=cee`), nunca se busca en qué tabla
está ese UUID.** Una búsqueda a ciegas es la forma de escribir el trabajo del
certificador en el negocio equivocado. Lo pone `CeeModule.abrirEnvolvente` desde
su `apiBase` —que ya sabe de qué negocio es— y lo lee `apiEnvolvente.js` de la
dirección de la ventana; de ahí sale en todas las llamadas. No se usa `?cee=`:
ese parámetro ya significa «abre este CEE directo» en el dashboard y lleva un id
dentro, y dos cosas distintas con el mismo nombre acaban leyéndose la una por la
otra.

**REGLA — la ZONA CLIMÁTICA y el AÑO no vienen de ninguna oportunidad.** La zona
la deriva `ceeDirectoService` del municipio cada vez que se toca la dirección
(`zona_climatica`, columna de la tabla) y el año lo da Catastro con la
geometría. Las transmitancias salen de la MISMA Guía de Transmitancias que en el
CAE (desde el 08/10/2026, los «Estimados» de CE3X 3.2, `transmitanciasCe3x.js`,
regla 129): no cambia porque el encargo sea de otro negocio.

**REGLA — lo que no hay, se TECLEA y se dice.** En un CEE suelto no hay
`instalacion`: la caldera que hay y el equipo que se pone los escribe el
certificador en la pestaña de Instalaciones, que ya sabía recogerlos
(`equipoConAjustes`). Por eso ahí **no se pinta el botón de leer la placa** —esa
ruta escribe en la instalación de un expediente CAE, y un botón que da 404 es
peor que no tenerlo— y se dice en su sitio qué hay que teclear.

**REGLA — un encargo de ALCANCE ÚNICO no tiene fase FINAL.** Su fichero se llama
`{nº} - CEE_REVISAR.cex` y vive en `1. CEE`: un «final» saldría con el MISMO
nombre en la MISMA carpeta y archivaría en OLD el que se acaba de generar. La
pantalla no ofrece el botón (`dosFases`) y la ruta responde **409** —un navegador
sin refrescar lo seguiría mandando—. En un encargo DOBLE son `1. CEE INICIAL` y
`2. CEE FINAL`, y el final se hace copiando el inicial, como en el CAE.

**REGLA — qué CONSTRUCCIONES cuentan se guarda en el propio encargo.** En el CAE
eso vive en la oportunidad, que es donde una persona lo marcó en la ficha técnica
y de donde salió la superficie que se presupuestó (regla 50); aquí no hay
oportunidad, así que va a `cee.construcciones_elegidas` y queda anotado en su
historial — cambia la superficie que mide el certificado.

Las **fotos de cada cerramiento** (regla 54) funcionan igual: se suben a
`1. CEE/FOTOS ENVOLVENTE` y las CANDIDATAS salen de `4. DOCUMENTACIÓN PARA CEE`,
donde no hay slots `FOTO_*` que casar —no hay obra que documentar—, así que se
ofrece toda imagen que esté dentro.

⚠️ De paso se arreglaron dos cosas del camino de las fotos que estaban ROTAS en
los DOS negocios: `paredFotoService.carpeta` y `ceeEnvolventeCex.sustituirImagen`
le pasaban el EXPEDIENTE entero a `ensureCeeSectionFolder`, que espera el id de
la carpeta de Drive y devuelve `{ id, link }` — las llamadas a Drive iban con
`[object Object]`, así que subir una foto a un cerramiento o sustituir la foto de
fachada del `.cex` no funcionaba nunca.

⚠️ **Una planta puede llegar como MULTIPOLÍGONO y el motor moría.** Catastro
dibuja algunas viviendas en dos cuerpos que no se tocan (la casa y su anejo al
fondo del patio), y entonces la huella de esa planta es un `MultiPolygon`:
`segmentar()` hacía `poly.exterior` y lo que llegaba a la pantalla era un
`'MultiPolygon' object has no attribute 'exterior'`. Medido en la parcela
9412508VJ8691S (la del 2026CEE_55), que ahora sale con 28 elementos. Cada trozo
tiene sus propias paredes y todas cuentan, así que se segmentan todos con la
numeración corrida; para un polígono suelto la salida es **idéntica** a la de
siempre —de ella cuelgan las superficies de fachada de todo lo ya medido— y eso
está vigilado en `tests/test_orientation.py`.
