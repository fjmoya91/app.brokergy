<!-- conocimiento · área: firma · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## Autofirma no falla igual en todos los ordenadores (2026-09-16)

Varios clientes reportaron que el enlace de firma "no les funciona": abren el Anexo o
el CIFO, pulsan **Firmar con Autofirma** y no pasa nada, o les sale un aviso del
Gobierno diciendo que no tienen Autofirma instalado — teniéndola.

La causa está en cómo elige camino `autoscript.js`: en cualquier PC de escritorio usa
SIEMPRE un **WebSocket seguro contra `wss://127.0.0.1:<puerto>`**, y ese camino exige
tres cosas a la vez que en la máquina del firmante no controlamos:

1. **Autofirma ≥ 1.7** — las anteriores no tienen modo WebSocket.
2. Su **certificado SSL local** ("AutoFirma ROOT") instalado y **VIGENTE** en el
   almacén del navegador. Caduca; y un perfil de Firefox creado después de instalar
   Autofirma no lo tiene, porque Firefox lleva su propio almacén.
3. Que ningún antivirus ni proxy corte `127.0.0.1`.

Si falla cualquiera de las tres, el síntoma es el mismo y no distingue una cosa de la
otra. Y la petición se hace con **versión de protocolo 4**, que una Autofirma vieja
rechaza de plano.

| Qué | Dónde |
|---|---|
| Elegir camino, caer al siguiente y traducir el error | [features/firma/autofirma.js](implementation/frontend/src/features/firma/autofirma.js) |
| Servidor intermedio (los dos servlets) + diagnóstico | [routes/afirmaStorage.js](implementation/backend/routes/afirmaStorage.js) |
| Superficie (una sola, la comparten las 9 pantallas que firman) | `FirmarConCertificadoModal.jsx` |
| Prueba | `node implementation/backend/scripts/test_autofirma_caminos.mjs` |

### Tres caminos, y solo se cae al siguiente si NO se llegó a Autofirma

| Camino | Cómo habla | Qué versiones cubre |
|---|---|---|
| `websocket` | `wss://127.0.0.1:<puerto>` | Autofirma ≥ 1.7 con su certificado local vigente |
| `servidor` | `afirma://sign?…&stservlet=<nuestro origen>/api/…` | **cualquiera desde la 1.5**: ni puertos ni certificados locales, solo que el SO sepa abrir `afirma://` |
| `servidor-compat` | lo mismo con **`ver=1`** | instalaciones antiguas que rechazan la versión 4 del protocolo |

**REGLA — automáticos van DOS, no tres.** Medido en un navegador real sin Autofirma
instalada: el WebSocket tarda **~15 s** en rendirse y el servidor intermedio **~45 s**,
así que encadenar además el modo compatible deja al firmante más de minuto y medio
delante de una pantalla quieta para acabar leyendo un error. Y no lo arregla: si no
responde NADA, repetir lo mismo con otra versión de protocolo tampoco va a responder.
El tercero vive **a un clic** en el propio mensaje de error ("Mi Autofirma es antigua ·
probar en modo compatible"), para la instalación vieja de verdad — que es rara — sin
que lo paguen todos los demás en espera.

**REGLA — un intento nuevo solo se lanza si el anterior NO llegó a Autofirma.** Si el
firmante llegó a ver la ventana y canceló, o su certificado no sirve, reintentar
abriría Autofirma otra vez encima de él. Se clasifica **por el CÓDIGO** (`AS6200xx` es
un enum cerrado de `autoscript.js`) y solo se cae al texto cuando no lo hay: el mensaje
se traduce y se reescribe entre versiones, y un `includes` sobre él envejece sin que
nadie lo note.

**REGLA — los diálogos propios de `autoscript.js` van APAGADOS**
(`SupportDialog.enableSupportDialog(false)`). No es estética: mientras su diálogo de
error está abierto, **el fallo NO llega a nuestro callback** —autoscript solo llama al
`errorCB` si el diálogo está deshabilitado o el usuario pulsa cancelar—, así que con
ellos activos el fallback automático no llegaría a dispararse nunca. Además se quedan
encima del modal, y lo que anuncian ("no tiene Autofirma instalado") es justo lo que
todavía no se sabe.

**REGLA — un documento GRANDE se salta el WebSocket** (>3 MB). Ahí Autofirma responde
`AS620018` ("excede de la memoria disponible") y el firmado no vuelve nunca al
navegador: es el "se firma pero vuelve a la pantalla anterior" del Anexo Fotográfico.
Probarlo primero solo gasta medio minuto de espera antes del camino que sí funciona.

⚠️ **El `setServlets` que había en el modal NO hacía nada.** `AppAfirmaWebSocketClient`
no expone ese método, y el servidor intermedio solo entra en juego si
`setForceWSMode(true)` — que, pese al nombre, significa *"forzar modo WebService"*, no
*"forzar WebSocket"*. O sea: la protección que el comentario decía tener para los
ficheros grandes llevaba desde el principio sin estar activa.

### ⛔ EL SERVIDOR INTERMEDIO ESTÁ APAGADO — corrompía la firma (2026-09-17)

Estuvo activo **un día** y estropeó las tres firmas de **26RES060_179**:

| Documento | Cómo quedó |
|---|---|
| Convenio de Cesión firmado | **TRUNCADO** en Drive (382.347 B, sin `%%EOF`) |
| Anexo I firmado | **TRUNCADO** (313.723 B) |
| CIFO firmado (9,5 MB) | vuelve con la **firma INVÁLIDA**: *«el rango de bytes de la firma no es válido»* |

Ese mensaje es lo que dice un lector cuando el PDF **se ha alterado DESPUÉS de
firmarlo**, y el `SAF_28` («no es un PDF o es un PDF no soportado») que sale al
intentar firmar encima es lo mismo visto desde el otro lado.

**Barridos los 300 PDF firmados de producción: 295 íntegros, y los 3 rotos son
todos de ese expediente** — o sea, exactamente los que pasaron por ese camino.
Todo lo anterior fue por WebSocket y está bien.

**La causa está en el trayecto de VUELTA.** Autofirma sube su resultado a nuestro
servlet como `application/x-www-form-urlencoded`, y ahí **un `+` del Base64 se
decodifica como ESPACIO** — es lo que manda el estándar para ese tipo de
contenido. El navegador de ida lo evita mandando Base64 **url-safe** (`-` y `_`,
ver `sendData` en `autoscript.js`); Autofirma no.

**REGLA — una firma que no vale es lo peor que puede producir esta app.** Por eso
el camino se apaga ENTERO (`SERVIDOR_INTERMEDIO_ACTIVO = false`) y con él el botón
de «modo compatible», que pasa por lo mismo — no se deja detrás de una condición
«por si acaso». El comportamiento vuelve a ser el de antes: **solo WebSocket**.
Verificado en el bundle desplegado: `planDeIntentos` es `return [WEBSOCKET]`.

**Para reactivarlo hay que arreglar el servlet y COMPROBARLO con un PDF firmado de
verdad**, no con el flujo simulado: `afirmaStorage.js` tiene que leer el cuerpo en
CRUDO y no dejar que `+` se convierta en espacio en el `dat` — y la prueba es
abrir el PDF que vuelve y ver su firma válida, porque todo lo demás (la conexión,
el resultado que llega, el fichero que se guarda) **parecía correcto**.

⚠️ **Lo que enseñó este fallo**: el daño no se ve en ninguna pantalla. El fichero
se sube, el expediente lo da por firmado, el modal lo pinta —pdf.js reconstruye el
índice de un PDF roto— y solo se descubre al abrirlo con un lector que valide la
firma. Un camino de firma nuevo no se da por bueno hasta ver **la firma validada
en un lector**.

### Un PDF ROTO se para ANTES de abrir Autofirma

`pdfIncompleto()` mira los dos extremos del base64 (`%PDF-` al principio, `%%EOF`
en la cola) y, si el documento está incompleto, ni se abre Autofirma: se dice que
el documento está dañado y que hay que volver a generarlo. Sin eso, el firmante ve
`SAF_28`, que suena a «formato raro» y no a «este fichero está roto».

**REGLA — NO se repara.** Reescribir el PDF con pdf-lib le arreglaría el índice y
de paso **invalidaría la firma que ya lleva dentro**. Y un PDF truncado tampoco
vale como firmado: su firma abarca unos bytes que ya no están.

### El parche de `autoscript.js`

Tres líneas idénticas (una por cada cliente de conexión) que leen la versión del
protocolo de un global en vez de tenerla cableada:

```js
var PROTOCOL_VERSION = (typeof window !== 'undefined' && window.AFIRMA_PROTOCOL_VERSION) || 4;
```

Sin el global se comporta **exactamente** como el original (4). Una Autofirma vieja
rechaza un `ver` mayor del que conoce y una nueva acepta los menores, así que rebajarlo
es lo único que permite hablar con las dos. Es un fichero VENDORIZADO de 6.000 líneas: el
test comprueba que las tres siguen parcheadas, para que una actualización de la
librería no se las lleve por delante en silencio.

### Lo que ve el firmante

Antes, cualquier fallo salía como `Autofirma: es.gob.afirma.standalone.ApplicationNotFoundException`.
Ahora cada caso dice **qué ha pasado y qué hacer**, en ese orden, y el **código** queda
a la vista para poder decirlo por teléfono — es lo único que distingue "no la tengo
instalada" de "no me deja usar el certificado". Mientras se reintenta por otra vía se
anuncia ("Autofirma no ha respondido por la vía habitual. Probando por…"): sin eso la
espera se alarga sin explicación y la ventana se cierra.

**REGLA — nadie se queda sin salida.** En el CIFO y en los anexos, la misma pantalla
ofrece **subir el documento ya firmado** con otra herramienta, y al cliente además la
**firma a mano con el móvil** (regla 34), que no depende de Autofirma para nada.

### Por qué hay diagnóstico

Lo que llega por teléfono es *"no me funciona el enlace"*, y con eso no se arregla
nada: el mismo síntoma lo dan una Autofirma antigua, un certificado local caducado y un
antivirus. `POST /api/afirma-diagnostico` deja en el log del backend en qué máquina y
con qué código ha fallado. **Ahí NO entra el documento ni ningún dato del firmante**:
navegador, caminos probados y código. Es pública porque los enlaces de firma del
cliente y del instalador lo son, así que el cuerpo va limitado y no se guarda en BD.
Para leerlo: `docker logs brokergy-backend | grep autofirma`.

⚠️ **Lo que aquí NO se puede afirmar**: nada de esto se ha probado contra una Autofirma
real de cada versión — no hay forma de tener instaladas la 1.6, la 1.7 y la 1.9 a la
vez. Lo verificado es la negociación (con un Autofirma simulado, las 10 pruebas del
script) y que el fichero parcheado es el que se sirve. Si un cliente vuelve a fallar,
**lo primero es su línea del log**, no volver a suponer.
