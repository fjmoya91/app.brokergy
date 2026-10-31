<!-- conocimiento · área: certificadores-app · las rutas de los enlaces son relativas a la raíz del repo -->

## El certificador sube el XML y la app hace el PDF oficial, en el servidor (2026-10-31)

Fran: «¿Es posible que si el certificador genera el xml en su pc y lo sube a la app, la misma app lo
convierta en pdf? Es que está dando errores a los certificadores generar el pdf… sube xml y convierte
a pdf listo para firmar». Y, a la idea de hacerlo en su PC: «si es mi PC, tiene que estar siempre
encendido, y no siempre está». Por eso va en el VPS. La licencia gratuita de las fuentes de Microsoft
la aceptó él el mismo día («Sí, acéptala y móntalo»).

### Qué pasa al subir el XML — [firma.js](implementation/backend/services/certapp/firma.js) (`subirXml`)

1. Se lee en seco (`cargarXmlEnApp`, como antes): si no es un CEE de CE3X con calificación, 422.
2. Un encargo de BROKERGY en BORRADOR tiene que estar ACEPTADO (409 `ENCARGO_SIN_ACEPTAR`, como «Pedir
   el certificado»).
3. **El PDF oficial**: `cexAPdf.pdfDeXml` → en el VPS, el servicio `xml2cert` (abajo); en un PC con
   CE3X, su `xml2cert.exe`. Unos 5 s.
4. Se guardan `{nº} - CEE.xml` y `{nº} - CEE.pdf` en «1. CEE» (lo anterior a OLD), el XML se carga
   en la obra (regla 152) y va al expediente si es un encargo (`enviarDefinitivoAsync`, como antes).
5. La pantalla abre el visor con ese PDF y el botón de firmar. Desde «Pedir el certificado» (BORRADOR)
   la obra pasa a lista para firmar.

| Respuesta | Cuándo |
|---|---|
| 200 `{ tipo: 'xml', fichero, pdf, cargado, estado }` | valida: XML + PDF guardados |
| 422 `XML_NO_VALIDA` (`motivos`) | el `.log` de xml2cert dice que no valida, o hay medidas pendientes, o no sale el PDF (un «___») |
| 422 `XML_CE3X_ANTIGUO` | XML v2.0 (CE3X 2.3): lo firmado tras el 05/10/2026 va en la 3.2 |
| 503 `PDF_NO_DISPONIBLE` | el servicio no responde, está ocupado o se pasa de tiempo |
| 409 `ESTADO_NO_FIRMABLE` | EN_PREPARACION (lo está haciendo la app), o un PDF/.cex en BORRADOR |

**REGLA — un XML que NO VALIDA no se guarda ni se carga** (regla 140): su PDF saldría con la marca
«certificado incompleto» y no se puede registrar. Se le dice por qué con las frases del `.log`.

**REGLA — sin generador, 503 y nada guardado.** «No responde» no es «XML malo»: el certificador lo
vuelve a subir en unos minutos. Nunca se guarda el XML sin su PDF.

**REGLA — en BORRADOR, el XML hecho en su CE3X deja la obra LISTO y NO gasta créditos** (decidido con
Fran: convertir no gasta). Paso condicionado a seguir en BORRADOR, `listo_at`/`entregado_at` y la
carpeta compartida, como en `entrega.entregar`. Solo el XML: un PDF o un `.cex` antes de pedirlo, 409.

**REGLA — un XML nuevo deja sin efecto la firma y el visto bueno.** En VALIDADO vuelve a LISTO
(`validado_at` a null): lo firmado era el PDF anterior y `elegirFicheros` ya no ofrece el firmado. Y el
visto bueno de BROKERGY se ANULA (`vistoBueno.anularSiOtraReceta` sin huella, motivo «El certificador
ha subido su propio XML»): era para NUESTRO `.cex`; sin anularlo, firmar mandaría al CRM el visto bueno
sin aviso (`approve-cee`) de un certificado que nadie ha revisado.

### El servicio `xml2cert` — [implementation/xml2cert](implementation/xml2cert)

El generador oficial (`xml2cert.exe` del IETcc-CSIC, licencia MIT, el de CE3X 3.2:
`moduloXML/xmlcert_20260703`, versión 0.5.0) solo existe para Windows. Va en un contenedor con **Wine**:

| Pieza | Por qué |
|---|---|
| `debian:trixie-slim` (Wine 10) | con Wine 8 (bookworm) no arranca: falta `bcryptprimitives.dll` (Rust ≥ 1.78), medido el 31/10/2026 |
| Java 8 de **Windows** (Temurin) dentro de Wine, en `WINEPATH` | la validación es `bin/jing.jar`, que xml2cert llama como `java` |
| `ttf-mscorefonts-installer` copiadas a `C:\windows\Fonts` de Wine | la plantilla usa Arial, Verdana y Courier New: sin ellas el PDF sale **sin texto** (typst avisa «unknown font family») |
| `xmlcert/` en el repo (exe, `bin/jing.jar`, licencias, un ejemplo) | el GitLab del IETcc pide login; es MIT. ~11 MB comprimido |
| `servidor.js` (Node, sin dependencias) | `POST /pdf` (cuerpo = XML) → `{ pdf: base64, log, salida, codigo, ms }`; `GET /salud` → `{ ok, version }`. Dos a la vez, cola de 20 (más: 503), 90 s de plazo |

Sin puertos publicados: solo lo ve el backend por la red `brokergy` (`XML2CERT_URL=http://xml2cert:8095`
en `docker-compose.yml`). El veredicto no lo da el servicio: el backend lee su `.log` con las mismas
reglas que en el PC (`avisosDelLog`). Así `validarXml` —la última puerta antes de subir un calificado,
`guardarCalificadoEnDrive`— también valida de verdad en el VPS (antes, sin xml2cert, «sin comprobar»).

**REGLA — la imagen se AUTOPRUEBA al construirse**: convierte `examples/Ejemplo30_Informe.xml` y, si no
sale el PDF o aparece «unknown font», no se construye (y `deploy.sh`, con `set -e`, se para). Una
imagen que sale es una que hace PDF con texto.

Medido el 31/10/2026: el ejemplo oficial sale con 15 páginas, Arial y el XML embebido, igual que en
Windows; dos XML reales (2026CEE_59 final, 2026CEE_65 inicial) salen con las mismas páginas que con el
xml2cert del PC (17 y 21), válidos, en ~5 s (en el PC, ~39 s). La imagen pesa ~2,8 GB.

**Para actualizar xml2cert** cuando CE3X traiga uno nuevo: copiar de `C:\Program Files
(x86)\CE3Xv3.2\moduloXML\xmlcert_AAAAMMDD` a `implementation/xml2cert/xmlcert/` lo mismo que hay
(`xml2cert.exe`, `bin/`, `LICENSE`, `CHANGELOG.md`, `README.html`, `timestamp`, el ejemplo), y
desplegar: la autoprueba dice si sigue funcionando.

### En la pantalla

- **«Pedir el certificado»** ([Generar.jsx](implementation/frontend/src/certificadores/obra/Generar.jsx)):
  debajo, «¿Ya lo has hecho en tu CE3X?» → «Subir el XML» (apagado si el encargo de BROKERGY no está
  aceptado). Al terminar, la obra se recarga ya lista para firmar.
- **Documentos → «Subir versión nueva»** ([ObraCerrada.jsx](implementation/frontend/src/certificadores/obra/ObraCerrada.jsx)):
  con un XML, el aviso «XML cargado y PDF oficial hecho: ya puedes firmarlo» y el visor abierto con
  «Firmar con AutoFirma».
- La demo (`?demo=1`) hace lo mismo; un XML con «mal» en el nombre hace de uno que no valida.

### Lo que queda fuera

- La página del encargo del técnico en el CRM (`/subir-cee`, `routes/public.js`) no hace el PDF: el
  técnico de fuera sube XML y PDF como siempre.
- El `.cex` que acompaña a un XML hecho fuera sigue siendo el nuestro (si lo hay); el suyo va a
  cuarentena.

### Pruebas

- `node implementation/backend/scripts/test_certapp_xml_a_pdf.js` (25): el servicio de mentira (válido,
  no valida, inviable, ocupado, caído, «___») y la subida en cada estado (LISTO, BORRADOR, VALIDADO, no
  valida, sin generador, 2.3, encargo sin aceptar, PDF en BORRADOR, en preparación).
- Además: `test_certapp_rutas.js`, `test_certapp_unidad.js`, `test_certapp_visto_bueno.js`,
  `test_cee_incompleto.js`, `test_pdf_del_xml.js`, `auditar_rutas_sin_guardian.js`.
