<!-- conocimiento · área: catastro · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Estaba escrito dentro de «⚠️ Skills: UNA sola fuente para Code y Cowork», en el CLAUDE.md antiguo.

### Módulo Catastro — Cambios profundos (2026-05-19)

Este módulo es **crítico para la app** (búsqueda de propiedades por coords/RC) y tiene historia compleja con el WAF del Catastro desde IPs de datacenter. Lo que sigue es lo aprendido empíricamente — **léelo antes de tocar `catastroService.js`**.

#### Endpoints — WCF JSON (no ASMX/XML)

La app usa los **WCF JSON** del Catastro, NO los ASMX legados, porque el WAF del Catastro bloquea la familia ASMX desde IPs de datacenter (devuelve `400` con HTML "No se puede procesar su petición"). Los WCF JSON sirven los mismos datos sin ese filtro.

| Operación | URL | Params (case-sensitive) |
|---|---|---|
| Coords → RC | `https://ovc.catastro.meh.es/OVCServWeb/OVCWcfCallejero/COVCCoordenadas.svc/json/Consulta_RCCOOR` | `SRS=EPSG:4326&CoorX={lng}&CoorY={lat}` |
| RC → datos completos | `https://ovc.catastro.meh.es/OVCServWeb/OVCWcfCallejero/COVCCallejero.svc/json/Consulta_DNPRC` | `Provincia=&Municipio=&RefCat={RC}` |
| RC → coordenadas UTM | `https://ovc.catastro.meh.es/OVCServWeb/OVCWcfCallejero/COVCCoordenadas.svc/json/Consulta_CPMRC` | `Provincia=&Municipio=&SRS=EPSG:25830&RefCat={RC14}` |

**Diferencias críticas con el ASMX**:
- Param `CoorX/CoorY` (no `Coordenada_X/_Y`)
- Param `RefCat` (no `RC`)
- Estructura raíz JSON: `consulta_dnprcResult`, `Consulta_RCCOORResult`, `Consulta_CPMRCResult` (no `consulta_dnp`, `consulta_coordenadas`)
- `bico.lcons` es array directo (no `bico.lcons.cons[]`)
- Tipo de catastro viene en `bico.finca.ltp`

#### Cliente HTTP — REGLA DE ORO

**NO USAR `axios` con el Catastro.** El WAF detecta el orden de headers de axios (`Accept` antes que `User-Agent`) y bloquea. Usar el helper `catastroGet(url, opts)` definido en [catastroService.js](implementation/backend/services/catastroService.js) que envuelve `http.request` puro.

`catastroGet` cumple obligatoriamente:
- `family: 4` (IPv4 forzado — Happy Eyeballs en IPv6 dispara el WAF)
- Headers en orden: `User-Agent`, `Accept`, `Accept-Encoding: identity`
- UA = `"Mozilla/5.0 (compatible; Brokergy/1.0; +https://app.brokergy.es)"` — UAs muy específicos (Chrome desktop completo, `curl/*`, `PostmanRuntime/*`) son bloqueados; UAs identificables genéricos pasan.

#### Estrategia de búsqueda por coords

`getRCByCoords(lat, lng)` en [catastroService.js](implementation/backend/services/catastroService.js) — orden:

1. **Cache LRU** (30 días por coords redondeadas) → 0 peticiones
2. **Petición central** → si acierta, 1 petición total
3. Si la central falla: **2 puntos en SERIE** (N, E ~11m offsets) con **800ms de sleep entre cada uno**. Para en el primer acierto.

**No** usar `Promise.all` con varias coords — el WAF rechaza ráfagas paralelas desde IPs datacenter (TCP reset / 400 HTML).

#### Monitor de rate-limit ([catastroMonitor.js](implementation/backend/services/catastroMonitor.js))

- `CONSECUTIVE_403_THRESHOLD = 1` — al primer error WAF, modo BLOQUEADO + alerta WhatsApp/email al admin.
- En modo BLOQUEADO, `shouldSkipRequest()` corta tráfico (no quemar más quota).
- Ping cada 5 min al endpoint `Consulta_RCCOOR` (Puerta del Sol) detecta recuperación → `recordSuccess()` desbloquea.
- `isRateLimitResponse(err, body)` detecta: status 403, "limite de peticiones", "peticion denegada", "no se puede procesar".

#### Un CORTE DE RED no es el WAF, y se reintenta UNA vez (2026-10-02)

El WAF CONTESTA (400/403 con su HTML); un `read ECONNRESET` o un plazo agotado no traen
respuesta ninguna. Medido el 02/10/2026: la búsqueda automática del CEE de "Nueva
simulación" (`6112410VH6961S0001AX`) murió en un ECONNRESET y la misma consulta,
repetida, dio 200. `getByRC` llama a `catastroGetReintentando`: **un** reintento, en
SERIE y tras 1,2 s, solo si no hubo respuesta (`esCorteDeRed`); lo que vuelve con
estado —400/403/404— no se repite. Si vuelve a fallar sale como `CATASTRO_UNREACHABLE`
(antes salía con el código crudo, porque `http.request` no pone `error.request` como
axios) y `/search` responde **503** con un texto legible, no un 500 "Search failed".
En el funnel, la referencia del CEE nace ESCRITA en el buscador (`initialQuery`) y el
error dice de qué referencia se trata: reintentar es pulsar Buscar.

#### La referencia catastral se LEE de una foto (2026-08-27)

La referencia llega casi siempre en una imagen —captura del recibo del IBI, foto de la
escritura, pantallazo de un WhatsApp— y copiar 20 caracteres alfanuméricos a mano es
donde se cuela la errata. Y una errata ahí **no da un error legible**: el Catastro
contesta "no encontrado", que se lee como que la vivienda no está dada de alta.

En el buscador (`CatastroSearchBox`, modo REFERENCIA) hay un lector: se elige la imagen,
se **arrastra** o se **pega con Ctrl+V** —que es como llega una captura desde WhatsApp
Web— y la referencia leída **se busca sola**, sin un paso intermedio de confirmar: es el
gesto que se iba a hacer a continuación de todos modos.

| Qué | Dónde |
|---|---|
| Lectura (prompt + esquema + validación) | [catastroOcrService.js](implementation/backend/services/catastroOcrService.js) |
| Ruta | `POST /api/catastro/ocr-rc` (multipart `files[]`), **staffOnly** |
| Superficie | `CatastroSearchBox`, prop `permiteFotoRc` |

**REGLA — el modelo solo LEE; qué es una referencia lo decide el código.** `normalizarRC`
(14 o 20 caracteres alfanuméricos, sin separadores) y `extraerReferencias` son
deterministas. Al prompt se le prohíbe expresamente completar caracteres que no se lean
—vale más un array vacío que una referencia adivinada, porque una adivinada busca la
vivienda de otro— y se le enumeran las cadenas largas con las que NO debe confundirla
(nº de recibo, NIF, IBAN, finca registral, nº de serie). Medido sobre cuatro capturas
reales-tipo: las cuatro correctas, ~2 s cada una.

**REGLA — con VARIAS referencias en la imagen se pregunta.** Una ficha catastral trae la
de la parcela (14) y la del inmueble (20); elegir por el usuario sería adivinar cuál es
su vivienda. Se enseñan las dos rotuladas y con el contexto leído (dirección o titular)
para poder comprobarlo. Con una sola, se busca directamente.

**REGLA — el lector es del flujo INTERNO, no de la landing.** Detrás hay una llamada de
pago a un LLM: la ruta es `staffOnly` y el botón solo se pinta con `permiteFotoRc`
(`isInternal` en `LandingFunnelView`, `isStaff` en `App.jsx`). Un partner que lo viera
solo se llevaría un 403.

Es un **gemelo pequeño** de `ceeOcrService`, del que reutiliza `normalizeToPdf` (varias
fotos se unen en un PDF antes de leer). No se bifurcó aquel: leer 21 campos de un CEE de
30 páginas y localizar una cadena en una captura no comparten prompt ni esquema.

#### Frontend — Auto-parse de dirección catastral

En `ClienteDetailModal.jsx`, el botón **"Usar Catastro"** junto al input de dirección parsea strings tipo `"CL DON SERGIO 15 13700 TOMELLOSO (CIUDAD REAL)"` y rellena CCAA/Provincia/Municipio/CP automáticamente (matching por sufijo o fallback por dígitos del CP). Función `parseCatastroAddressFull()`.

#### La foto de fachada llega ROTA una de cada tres (2026-09-16)

Catastro guarda fotos de fachada **cortadas**: cabecera y EXIF buenos, los datos
de la imagen a medias y sin fin de JPEG. Medido sobre 20 viviendas reales, **6
llegan así** — idénticas byte a byte en tres descargas seguidas y también
bajándolas de su servidor sin pasar por la app, o sea que están rotas en origen
y no hay reintento que las arregle.

**Y el navegador no lo delata**: un `<img>` dispara `load` y declara 1024×768,
pero no pinta un píxel; en un lienzo sale NEGRA, y `createImageBitmap` —que es
por donde pasa la portada de la propuesta— lanza "The source image could not be
decoded". Así que la portada de 26RES080_OP62 salió sin su foto sin que nada lo
dijera, y parecía que se había cambiado algo.

**REGLA — no se sirve una foto que no se puede pintar.** `fachadaCompleta(buf)`
([catastroService.js](implementation/backend/services/catastroService.js))
exige que el fin de JPEG esté **DESPUÉS del inicio del scan**: el `FFD9` de un
fichero cortado es el de la miniatura del EXIF, que va en la cabecera. Y no vale
exigirlo al final del fichero — Catastro escribe relleno detrás de imágenes que
se ven perfectamente (medido en 4410205WJ0641S0001JH: 330.687 bytes cuya imagen
acaba en el 62.354).

**REGLA — de una foto rota se rescata su MINIATURA EXIF**, que suele estar
entera (4 de las 6 medidas). `GET /api/catastro/image/:rc` la sirve en su lugar
y, si tampoco la hay, responde **404**: el frontend ya lo trata como "sin foto
registrada", que es la verdad.

⚠️ Esas miniaturas son de **160×120**, no de 640×480 como las de una foto sana.
Para la ficha catastral sobran (se mira para reconocer la casa); en la **portada
de la propuesta** se descartan por debajo de 400 px de ancho — estirada a 218 px
se ve peor que el hueco que deja no ponerla.

**⚠️ CORRECCIÓN (2026-09-28): no están CORTADAS, tienen el CIERRE ESTROPEADO.**
Todas las "rotas" terminan exactamente en `FF 00`, justo donde va el `FF D9` que
cierra un JPEG; la foto sana de al lado termina en `FF D9`. La imagen llega
ENTERA. Probado en Chrome sobre cuatro —26RES080_OP62 (la que motivó la regla),
26RES060_OP240, 8973004VH9887S0001UW y 3894512VH9739S0001ZA—: tal cual,
`createImageBitmap` falla; con el cierre añadido se pintan enteras y sin franja
gris. La prueba dura: 8973004VH9887S0001UW lleva marcadores de reinicio cada 320
bloques y trae los 7 que le tocan a una imagen de 640×480. Con la regla de arriba,
dos de esas cuatro se quedaban SIN foto (no traen miniatura) y las otras dos con
la miniatura de 160×120 — la portada de 26RES060_OP240 salía sin su fachada.

**REGLA — el cierre se RESTAURA en origen** (`cerrarFachada`, dentro de
`getFacadeImage`): así lo reciben igual la portada, la ficha catastral y el `.cex`.
Se AÑADE `FF D9`, nunca se quita un byte, y **solo con esa firma exacta** (datos
después del scan que acaban en `FF 00`, sin fin de JPEG detrás del scan). Un
fichero cortado de verdad, por cualquier otro sitio, sigue siendo lo que era y la
ruta hace lo de siempre: su miniatura o un 404.

```bash
node implementation/backend/scripts/test_fachada_rota.mjs
```

#### Diagnóstico rápido si vuelve a fallar en VPS

```bash
ssh root@<VPS> 'docker exec brokergy-backend node -e "
const https=require(\"https\");
const o={host:\"ovc.catastro.meh.es\",port:443,family:4,path:\"/OVCServWeb/OVCWcfCallejero/COVCCoordenadas.svc/json/Consulta_RCCOOR?SRS=EPSG:4326&CoorX=-3.6841&CoorY=40.4292\",method:\"GET\",headers:{\"User-Agent\":\"Mozilla/5.0 (compatible; Brokergy/1.0)\",\"Accept\":\"application/json\",\"Accept-Encoding\":\"identity\"}};
https.request(o,r=>{let d=\"\"; r.on(\"data\",c=>d+=c); r.on(\"end\",()=>console.log(\"status=\"+r.statusCode+\" body=\"+d.substring(0,200)));}).end();"'
```

- Si da `200` con `<pc1>` → el catastro funciona; mirar logs del backend, no es problema de IP.
- Si da `400` con HTML "No se puede procesar" → IP del VPS en lista del WAF. Esperar 30-60 min (suele liberarse solo). Si persiste >2 h, sospechar cambio en el WAF y revisar UA / orden de headers.
- También: `curl -s https://app.brokergy.es/api/catastro/status` muestra el estado del monitor en producción.
