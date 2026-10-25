<!-- conocimiento · área: certificadores-app · las rutas de los enlaces son relativas a la raíz del repo -->

## El CEE de una obra: el encargo, la calificación en el PC, el aviso, la entrega y la firma (2026-10-25)

Lo pidió Fran probando la 2026EXT_1: «cuando el certificador pide el CEE me han llegado dos mensajes
prácticamente iguales. Quiero uno de encargo, con el certificador, el cliente y el número de obra, y
poco más; no quiero que me vaya contando el proceso». Y después, nada: «ni me han enviado notificación
por email ni por WhatsApp, ni sé en qué carpeta lo puedo ver». Quería un enlace para ver el PDF y
descargar el `.cex`, firmar el PDF con AutoFirma desde la app y subir el XML «para que esté siempre
el definitivo», y que al certificador le llegue un WhatsApp y un email con la envolvente.

### Lo que pasaba

- **Dos mensajes**: el acuse del vigía («me pongo con ello») y el 🤖 «por calificar» del agente (a
  veces, además, el «me pongo» del propio agente).
- **Y luego nada**: el VPS no tiene CE3X, así que el agente deja el `.cex` **POR CALIFICAR** (sin XML
  ni PDF). El encargo de calificar al PC no admitía obras EXT y `alTerminarIa` (el aviso al equipo o
  la entrega) no se llamaba nunca.

### El circuito ahora

| # | Quién | Qué pasa | Mensajes |
|---|---|---|---|
| 1 | Certificador | «Pedir el certificado» | **Uno** al equipo: `ia.textoEncargo` (nº, certificador con su contacto, cliente, vivienda y enlace al admin; si la IA automática está apagada, lo dice). Y al certificador, **su acuse** (`ia.acuseCertificador`, WhatsApp + email): recibido, qué viene (lo preparamos · lo revisamos · te avisamos) y el enlace a la obra |
| 2 | Agente del VPS | Hace el `.cex` **en silencio**: `ceeIa.pedir` → `pedirTarea({ silencioso: true })`. Si todas las tareas son silenciosas, el vigía no acusa recibo, le dice al agente que no escriba y, si sale bien, no manda nada | ninguno |
| 3 | Agente → PC | Deja el `.cex` por calificar → `agenteIa.terminarExt({ entregable: false })` → `asistenteCanal.encargarCalificarExt` → `POST /pc-calificar` del vigía → `asistente_pc.encolarCalificarExt` → tarea `calificar_ext` en la cola del PC | ninguno (si el encargo falla, el aviso de «por calificar» de antes, con el motivo) |
| 4 | PC de Fran | En su vuelta (cada 2 min): `asegurarMotor` (el uvicorn del motor en el puerto de `CEE_ENGINE_URL`: en el PC, su propio motor en el 8093) y `node scripts/cee_inicial.js calificar <nº> --escribir`, **sin Claude**. Al acabar bien, `avisarCalificadaExt` llama a producción e imprime `@@CALIFICADA_OK <nº>` | solo si falla (no aparece la marca) |
| 5 | Producción | `POST /api/certapp-admin/interno/calificada` (clave interna): exige PDF y XML en «1. CEE» (409 `SIN_CALIFICAR`) → `terminarExt({ calificada: true, entregable: true })` → evento `IA_HECHA` → `alTerminarIa` | con `CERTAPP_ENTREGA_AUTO`, entrega sola; si no, al equipo **«✅ CEE listo para revisar»** (`entrega.textoListoEquipo`: nº, cliente, certificador, calificación, admin y envolvente; sin enlaces de Drive) + email |
| 6 | Equipo | «Entregar» en el admin | al certificador, WhatsApp y email: la obra (ver, descargar el `.cex`, firmar) y **la envolvente** (segundo botón del email) |
| 7 | Cualquiera | Regenera en la envolvente el inicial de una obra ext | se encarga sola al PC (pasos 4 y 5) y la envolvente avisa «se calcula con CE3X, unos minutos» |

El aviso del paso 5 sale de **producción**, también cuando la calificación se lanza en el PC: el
`.env` local tiene apagados `CERTAPP_AVISOS_ENABLED` y compañía, y producción es quien tiene el
interruptor de verdad.

**REGLA — sin calificar no se avisa: se encarga al PC.** Un `.cex` sin XML ni PDF no es un
certificado que se pueda revisar; avisar en ese momento era el segundo mensaje que sobraba.

**REGLA — el PC solo da por buena la calificación si aparece `@@CALIFICADA_OK`.** Es la marca que
imprime `cee_inicial.js` después de que producción haya contestado; sin ella, la tarea falla y el PC
le escribe a Fran con el final del registro (`resultadoCalificarExt`).

**REGLA — el agente encarga la calificación desde el contenedor del vigía, y allí ASISTENTE_URL es
el propio vigía** ([asistente_vigia.js](implementation/backend/scripts/asistente_vigia.js): con
`--servidor`, si falta, `http://localhost:<ASISTENTE_PUERTO>`; lo heredan Claude y los scripts que
lanza). Con la 2026EXT_2 (25/10/2026) faltaba: `encargarCalificarExt` fallaba, salía el aviso de «por
calificar» y el agente lo encargaba a mano con `asistente_pc.js`, que mandaba el «Le paso a tu PC…».
Eran tres mensajes en vez de uno. Tras tocar el vigía: `docker compose restart asistente` (deploy.sh no
lo reinicia), mirando antes `docker logs brokergy-asistente`.

**Los mensajes, en viñetas y con negritas** (Fran, 25/10/2026: «que el WhatsApp salga mejor explicado,
con viñetas, con negrita»): el encargo, el acuse, el «listo para revisar» y la entrega. El email del
encargo lleva el mismo texto sin los asteriscos (`ia.sinNegritas`; los `_` se quedan porque van en el
número); el del certificador es la plantilla de la app (`avisos.plantilla`).

### Lo que ve el certificador

[ObraCerrada.jsx](implementation/frontend/src/certificadores/obra/ObraCerrada.jsx), con la obra LISTO
o VALIDADO: la **calificación** (las letras de consumo y emisiones, del XML cargado), el **certificado
firmado** si lo hay (con fecha y firmante), las descargas (PDF, `.cex`, XML, croquis), su carpeta de
Drive, **«Validar y firmar con AutoFirma»** · «Solo validar» · **«Revisar en la envolvente»**, y
**«¿Lo has terminado en tu CE3X?»** para subir el XML o el PDF definitivos.

El GET `/api/certapp/obras/:id` trae además `cee: { calificacion: { consumo, emisiones } | null,
firma: { at, firmante, via } | null }` (`firma.resumenParaCertificador`, sin enlaces de Drive).

### Firmar y subir el definitivo — [firma.js](implementation/backend/services/certapp/firma.js)

| Ruta (`certappOnly`, obra SUYA o 404) | Qué |
|---|---|
| `GET /obras/:id/cee/para-firmar` | `{ nombre, base64 }`: el PDF que toca firmar (el `pdf` de `elegirFicheros`). Sin entregar, 409 `ESTADO_NO_FIRMABLE`; sin «1. CEE», 409 `SIN_CEE` |
| `POST /obras/:id/cee/firmado` (multipart `fichero`) | El PDF firmado en el navegador → `{ ok, estado, firma, avisos }`. Lo guarda como `{nº} - CEE_fdo.pdf` |
| `POST /obras/:id/cee/definitivo` (multipart `fichero`) | Un `.xml` (se carga en la app) o un `.pdf` (firmado: como el anterior; sin firmar: `{nº} - CEE.pdf`) → `{ ok, tipo, fichero, estado }` |

En la pantalla se firma con el **mismo modal del CRM** (`FirmarConCertificadoModal`, AutoFirma por el
WebSocket local), cargado solo al pulsar (pesa 357 kB por pdf.js), con el recuadro anclado al rótulo
de CE3X (`CEE_SIGN_ANCHOR`) y **sin el logo de BROKERGY** (`rubricImageUrl={null}`): firma un técnico
externo. El firmante se compara con el nombre de la cuenta solo como aviso.

**REGLA — una firma rota no se guarda**: `leerFirmasPdf` (el mismo del CRM). Sin firma, 422
`SIN_FIRMA`; dañada, 422 `FIRMA_ROTA` con `problemas`, y el certificador vuelve a firmar.

**REGLA — firmar es validar**: una obra LISTO pasa a VALIDADO al guardar el firmado (update
condicionado al estado), con el evento `FIRMA`.

**REGLA — el `.cex` no se sube** (415 `CEX_NO`): es un pickle que luego abre CE3X en el equipo de
BROKERGY. Para el registro cuentan el XML y el PDF.

**REGLA — un XML definitivo se lee en seco antes de guardarlo**: `cargarXmlEnApp(…, { escribir:
false })`; si no se puede cargar, 422 `XML_ILEGIBLE`, y sin calificación, 422
`XML_SIN_CALIFICACION`. Solo entonces se guarda `{nº} - CEE.xml` y se carga de verdad (evento
`DEFINITIVO`).

Todo se hace en LISTO o VALIDADO (`ESTADOS_FIRMABLES`); lo que se sustituye va a OLD.

### Los ficheros de «1. CEE» y cuál manda

| Fichero | De quién |
|---|---|
| `{nº} - CEE_REVISAR.cex` · `.xml` · `.pdf` | lo nuestro (la IA y la calificación del PC) |
| `{nº} - CEE INICIAL_CROQUIS.pdf` | el croquis |
| `{nº} - CEE_fdo.pdf` | el firmado (AutoFirma en la app, o un PDF firmado que sube) |
| `{nº} - CEE.xml` · `{nº} - CEE.pdf` | el definitivo que sube el certificador |

**REGLA — de cada clase gana el MÁS RECIENTE** (`elegirFicheros` en
[entrega.js](implementation/backend/services/certapp/entrega.js), por `modifiedTime`, que ahora trae
`driveService.listFiles`). El PDF del certificado tiene que llevar «CEE» y no ser el croquis ni un
`_fdo`; **el firmado solo cuenta si es posterior al PDF**: si se regenera, la firma vieja deja de
valer y vuelve el botón de firmar.

### Dónde están las carpetas

En el Drive de BROKERGY, la raíz **«APP CERTIFICADORES (cee.brokergy.es)»** (`CERTAPP_DRIVE_ROOT_ID`);
dentro, una carpeta por certificador («{NOMBRE} · {email}») y, dentro, una por obra («{nº} - {RC}»)
con «1. CEE» y «4. DOCUMENTACIÓN PARA CEE». En el admin: **«Carpetas de los certificados en Drive»**
en el resumen (`drive.raiz_link`) y «Carpeta de la obra en Drive» en cada obra, con el firmado y la
firma en el bloque «Certificado». Los enlaces de Drive, solo para el ADMIN; el certificador ve su
carpeta porque se comparte con su email.

### Lo que queda

- Al regenerar con la obra LISTO, durante unos minutos conviven el `.cex` nuevo con el XML y el PDF
  viejos, hasta que el PC califica.
- AutoFirma no se puede probar en la demo (`?demo=1`): el modal se abre con el recuadro colocado,
  pero no firma.

Tras tocarlo: `test_certapp_unidad.js` (`elegirFicheros`, los dos mensajes, la marca del PC) y
`test_certapp_rutas.js` (las rutas nuevas sin sesión 401, ajena 404, sin entregar 409; la de
calificada sin clave ni ADMIN, 403).
