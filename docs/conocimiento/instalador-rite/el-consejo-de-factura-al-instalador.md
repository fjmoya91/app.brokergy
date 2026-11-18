<!-- conocimiento · área: instalador-rite · las rutas de los enlaces son relativas a la raíz del repo -->

## El consejo de factura al instalador (2026-11-11)

Fran, 11/11/2026, a raíz de **26RES060_194**: cuando se le pide al instalador la factura de
la obra, que vaya con **el texto que le recomendamos para el concepto**, listo para copiar.
La factura es lo que más tumba la auditoría del CAE (va a otro nombre, la emite otra empresa,
lleva radiadores nuevos, no separa las placas solares, el nº de serie no es el de la placa…)
y casi siempre por el concepto: el instalador pone lo que pone siempre. Dárselo escrito
evita la vuelta.

**REGLA — el texto, la regla de cuándo y el envío salen de UNA fuente:
[utils/consejoFactura.js](implementation/backend/utils/consejoFactura.js).** El popup, la
ruta de envío, la página pública y los avisos llaman a esas funciones; ninguno compone
el texto por su cuenta. Pruebas: `node implementation/backend/scripts/test_consejo_factura.js`.

### Cuándo se manda (`decidirConsejoFactura`)

**REGLA — se manda si FALTA la factura, o si la que hay tiene una incidencia GRAVE que tumba
la auditoría. Si no, no.** Las que tumban (`GRAVES_QUE_TUMBAN`): `TITULAR`, `EMISOR`,
`UNIDADES_TERMINALES`, `ALCANCE` (no separable), `ALCANCE_SIN_EQUIPO`, `SERIE_DISTINTA`,
`FECHA` (futura) y `DUPLICADA`. Con una GRAVE el mensaje dice además **qué corregir** de esa
factura (una frase por código, `correccion`).

- Las GRAVES se leen de las incidencias **registradas** (`documentacion.incidencias[]`,
  `severidad GRAVE`, `estado ABIERTA`, `tipo` = el código, `slot` vacío o `facturas`), no del
  OCR: el OCR de `facturaIncidencias.js` no se guarda. Una LEVE, una subsanada, una de otro
  slot o una sin código no cuentan.
- «Falta» = `facturasAportadas(doc, reforma_uploads) === 0` (las de `documentacion.facturas`
  más las de `DOC_FACTURAS`, sin repetir). Es la misma cuenta que el checklist de
  `solicitud-info`.
- **RES080 no lleva consejo** (`construirConsejoFactura` devuelve `null`): es una reforma, el
  concepto depende de lo que se haga y no hay texto único.

### El texto (`construirConsejoFactura`)

Dos variantes, las aprobadas por Fran:

- **SUSTITUCIÓN** (RES060, TER100…): «Suministro e instalación de bomba de calor aire-agua
  (aerotermia) marca…, modelo…, nº de serie…, de … kW, para calefacción[ y ACS], en
  sustitución de la caldera existente … (nº de serie …), conectada a los … existentes de la
  vivienda.» · «Desmontaje y retirada de la caldera existente.» · «Material auxiliar,
  conexionado hidráulico y eléctrico, puesta en marcha y pruebas.»
- **HIBRIDACIÓN** (RES093): «…en HIBRIDACIÓN con la caldera existente …, que se mantiene como
  apoyo…» · «Regulación y control para el funcionamiento conjunto…» · «…a la instalación
  existente…», y el aviso «no pongas «sustitución» ni «desmontaje de la caldera»».

Encima, los datos: a nombre de (titular), NIF, dirección de la obra (`componerDireccion`: no
repite el CP/municipio/provincia que ya trae la calle, como pasaba en 26RES060_194) y quién la
emite (el instalador de la obra, mismo criterio que la GRAVE `EMISOR`). Debajo, «Cada línea con
su importe; base imponible e IVA desglosados.» y las cinco reglas «Para que no la rechacen»
(la emite el instalador que firma el certificado, con fecha posterior al registro del CEE
inicial —sin fecha, sin esa coletilla—; marca/modelo/serie los de la placa; nada de emisores
nuevos; lo demás en líneas aparte; anticipos con el mismo concepto).

Lo que no se sabe va **entre corchetes** ([MARCA], [MODELO], [Nº DE SERIE], [XX] kW…) y no se
inventa. Cascada: «N bombas de calor … en cascada»; ACS con otra máquina: una línea más.

### Por dónde sale

| Flujo | Cómo |
|---|---|
| Popup «Solicitar lo que falta» (pestaña Instalador) | `GET solicitud-info` trae `consejo_factura` (decisión, correcciones, textos). Casilla **marcada** si se pide la factura o hay una GRAVE; «Ver lo que se envía» enseña los dos WhatsApp enteros. Manda `consejo_factura: true/false` |
| `POST /:id/solicitar-faltantes` | Al INSTALADOR, si `consejo_factura === true` o `solicitado_keys` trae `factura` (y no viene `false`). **Recalcula** la decisión, nunca se fía del navegador. WA: tras el mensaje, DOS independientes (el consejo; solo el concepto). Email: el texto anuncia «Al final de este correo tienes el texto…» y el recuadro «Texto recomendado para la factura» con el botón «Copiar el concepto». Historial: «Con el texto recomendado para la factura» y `consejo_factura: FALTA/GRAVE` |
| «¿Cómo va la obra?» del parte (acciones `fin-obra` al instalador) | Pasa `consejo_factura: true`: el mensaje ya le pide la factura |
| Aviso de CEE INICIAL registrado al instalador (`ceeRegistradoAviso`) | Si falta `DOC_FACTURAS` y el partner del aviso ES el instalador de la obra: los dos WA detrás del aviso, en orden, y el recuadro en su email (`sendCeeRegistradoStaffEmail(…, consejo)`). La previsualización del reenvío no lo enseña |

**No** van con consejo, a propósito:

- Los recordatorios de las **esperas** (`esperasWhatsapp`, plantillas cortas y apagadas por
  defecto): recuerdan un pedido que ya llevó el consejo y su enlace.
- El **envío en bloque** `fin-obra` (`seguimientoLote`): es UN mensaje al comercial por varias
  obras; un consejo por obra lo convertiría en una ristra.
- `enviar_whatsapp` del **MCP**: manda el borrador que se ha enseñado; añadir mensajes que no
  estaban en el borrador rompería «el borrador se enseña entero».

### La página pública `/consejo-factura/:expedienteId?token=`

[ConsejoFacturaView.jsx](implementation/frontend/src/features/public/views/ConsejoFacturaView.jsx),
estilo «carta de pago» (regla 164), prefijo `.cf-`, mobile first. Botón «Copiar el concepto»
(y uno por línea) con `navigator.clipboard` y, si el navegador lo niega (WebView de WhatsApp),
`execCommand('copy')`; si tampoco, le dice que mantenga pulsado. Con una GRAVE, la tarjeta ámbar
«Qué hay que corregir». `/consejo-factura/demo` sin API (`?hibridacion`, `?grave`, `?huecos`).

**REGLA — la página lleva el NIF del titular: se abre con el `upload_token` de la oportunidad,
el MISMO del enlace de subida (`/subir-docs`) que ya tiene el instalador.** No se inventa un
token nuevo, y el UUID solo (el esquema de `/instalador/:id`) no basta. Ruta
`GET /api/public/consejo-factura/:expedienteId?token=` en `routes/public.js` (router público
por diseño en el auditor): 403 sin token o con otro, 404 si no existe o es RES080, 503 si la BD
falla (regla 38). El token nunca va en la respuesta. Las rutas que envían lo crean si la
oportunidad aún no lo tenía (`crearToken`); `solicitud-info` lo asegura al pedir el enlace.

### El ACS por un INTERACUMULADOR calentado por la bomba — 13/11/2026

Fran, 13/11/2026 (26RES060_283): el depósito Ariston de 100 l **es un interacumulador**, pensado
así para cumplir con la vía FM; no es un termo eléctrico. Con `aerotermia_acs.tipo_equipo_nuevo =
acumulador` (`esAcumuladorAcs`), la línea del ACS dice «Suministro e instalación de
interacumulador de ACS de N litros marca …, modelo …, nº de serie …, calentado por la bomba de
calor», y va DENTRO de la actuación (no en `aparte`).

### Una BOMBA DE CALOR DE ACS aparte, y el modelo de la PLACA — 18/11/2026

26RES060_278 (RCA): Panasonic Aquarea T-CAP R290 para la calefacción y un Ariston NUOS (bomba de
calor de ACS, no un interacumulador) para el agua caliente. El consejo decía «AQUAREA T-CAP R290…
para calefacción y ACS»: el modelo comercial no sale en la placa y la Panasonic no da el ACS.

- Con el ACS en OTRA máquina declarada que NO es un interacumulador de la bomba, la línea de la
  bomba dice **«para calefacción»**; el ACS va en su línea («equipo de producción de ACS»). Con
  interacumulador o sin equipo de ACS declarado, sigue «para calefacción y ACS».
- Si el modelo no contiene el de la placa de la unidad exterior (`modelo_ud_exterior`), va detrás
  entre paréntesis: «modelo AQUAREA T-CAP R290 (WH-WXG09ME5)». Es el que coteja el verificador.

### Lo que va en la misma factura pero FUERA del CAE (`aparte`) — 13/11/2026

`construirConsejoFactura` devuelve además `aparte[]`: líneas que van en la factura con SU importe
pero no son la actuación. Hoy, el **termo eléctrico nuevo** que declara el expediente con el ACS
fuera de la obra (`cambio_acs` false y `aerotermia_acs.tipo_equipo_nuevo = termo_electrico`).
No entra en `lineas` ni en el concepto que se copia, para no mezclarlo con la aerotermia; los
textos de WhatsApp y email no cambian.

### La factura en WORD, sobre la PLANTILLA del instalador (beta con RCA) — 13/11/2026

Fran, 13/11/2026 (26RES060_283): a RCA INSTALACIONES (Ramón Carrasco) se le manda la factura
**en Word, rellena entera salvo número, fecha e importes**, para que solo ponga su correlativo, la
fecha y el precio. Al resto de instaladores, solo el texto del consejo. En los dos casos, el
enlace de subida (`need=DOC_FACTURAS`, `rol=instalador`): al subirla nos llega el aviso de
«documentación recibida».

**REGLA — la factura en Word se rellena sobre una factura REAL del instalador en .docx (su
plantilla), nunca se maqueta de nuevo.** Fran: «debe ser exactamente la misma». La primera
versión (una maqueta copiada de su PDF) no era igual y se descartó el mismo día.

- [services/facturaWordService.js](implementation/backend/services/facturaWordService.js):
  `generarFacturaWord(expedienteId, plantillaBuffer)` → `{ buffer, fileName, consejo, datos,
  cambios }`. Solo LEE la BD. Abre el .docx con `jszip` y cambia el texto de los párrafos por su
  RÓTULO («Cliente:», «Número:», «Fecha:», «CONCEPTO» hasta «PRECIO», «INMUEBLE:», «REF.
  CATASTRAL:», «Observaciones:»), conservando su formato; las cifras «N,NN €» del cuerpo y del
  pie, en blanco. Si falta un rótulo, error (`cambios` cuenta cada uno: el Word convertido desde
  PDF duplica los cuadros de texto, mc:Choice y su VML).
- Datos: líneas, titular, NIF, obra y fecha mínima, de `cargarConsejoFactura` (regla 210); el
  domicilio del cliente en tres líneas (calle / CP y municipio / NIF) sin la nota «(En catastro
  figura …)», que no cabe en el cuadro y se queda en «INMUEBLE:»; la RC de
  `oportunidades.ref_catastral`; las observaciones de la deducción del IRPF (DA 50.ª de la Ley
  35/2006, en la redacción del art. 36.Uno del RDL 7/2026 — la que ya usa RCA) con el
  combustible de la caldera por su fila de rendimiento.
- **Maquetación** (medida con Word en la plantilla de RCA): el concepto se corta en líneas
  (≈38 caracteres la primera, ≈46 las demás), un párrafo por línea con el interlineado que
  domina en la plantilla (285); «INMUEBLE:» y las observaciones, con sangría derecha para no
  invadir PRECIO e IMPORTE; y del hueco vacío hasta «Nº de cuenta» se quitan los párrafos que
  ocupa el texto de más (las columnas son una sección continua: solo cuenta lo que el concepto
  pase de la columna IMPORTE), con tres de margen. `cambios.cabe = false` avisa si no cabe.
  Comprobación: abrirla con Word (COM, `ExportAsFixedFormat`) → una hoja, la cuenta dentro del marco.
- Script: `node implementation/backend/scripts/factura_word.js <nº> --plantilla f.docx [--out f.docx]`.
- La plantilla y el IBAN son del instalador: **nunca en el repo** (es público). Quedan en su
  Drive (la carpeta de contratos de su ficha) cuando se enganche al envío.
- **El email de «Solicitar lo que falta» va con la plantilla de marca** (Fran, 15/11/2026: «no
  tiene la estética del resto»): `emailService.buildSolicitudEmail({ asunto, mensaje, extraHtml })`
  — `brandEmailShell`, un párrafo por bloque y la línea que es solo un enlace como botón
  («Subir la factura», «Subir la documentación», «Copiar el concepto»…); el recuadro del consejo
  va en `extraHtml`. Antes salía en un `<div>` suelto.
- **DESCARTADA** (Fran, 16/11/2026, con capturas): en el Word de Ramón la tabla de precios es una
  hoja de Excel incrustada y «lo coge como campos raros: no puedo escribir el precio ni el importe
  ni nada». No tiene arreglo fiable. La sustituye la factura hecha en la app (abajo). **Vuelve el
  18/11/2026** con la plantilla nueva de RCA, que lleva la tabla en Word: ver «Con el concepto va
  SU FACTURA EN WORD».
  `facturaWordService.js` sigue solo porque la nueva reutiliza sus textos (`observaciones`,
  `combustibleCaldera`, `nombrePropio`).

### La factura hecha EN LA APP, en su plantilla, «como su ERP» — 16/11/2026

Fran, 16/11/2026 (26RES060_283, beta con RCA): «que el instalador ponga su número de factura,
precios y le salga todo relleno como si fuese su ERP»; y «los precios que salgan irán al mismo
sitio que los SLOTS cuando se sube la factura al expediente: el cliente puede subir la factura y
que ya se rellenen los precios, o generarla desde la app directamente».

**REGLA — la factura generada se GUARDA como si el instalador la hubiera subido al apartado
«Facturas» (DOC_FACTURAS): mismo fichero en «5. FACTURAS», misma fila en
`documentacion.facturas[]`, mismo aviso al equipo. Lo único distinto es quién rellena la fila:
aquí no lee el OCR, va con los datos EXACTOS con los que se ha compuesto.** Subir una factura
sigue funcionando igual que antes (el OCR rellena los precios). Las dos entradas, un solo sitio.

**REGLA — la plantilla del instalador NO va en el repo** (es público, y la plantilla lleva sus datos
fiscales, su cuenta y su tipografía). Vive en `PLANTILLAS_FACTURA_DIR/<id del instalador>/` (local)
o en la carpeta de Drive `DRIVE_FOLDER_PLANTILLAS_FACTURA`, subcarpeta con el `id_empresa` del
instalador. Sin plantilla, no se ofrece: el instalador sigue con el texto para copiar.

- **Cómo se compone** ([services/facturaInstaladorService.js](implementation/backend/services/facturaInstaladorService.js)):
  el FONDO es su factura EN BLANCO (la suya exportada por Word una vez, sin cliente, número, fecha
  ni importes), y encima se escribe con pdf-lib + `@pdf-lib/fontkit` y SU fuente (RCA: Segoe UI) en
  las posiciones de `plantilla.json` (pt, `y` desde arriba en la línea base): cliente, número,
  fecha, cada línea del concepto con su cantidad, precio e importe, INMUEBLE, REF. CATASTRAL, las
  observaciones del IRPF y el pie (importe, IVA, total). El concepto se corta por ANCHO real de la
  fuente, no por caracteres. Si el texto pasa del marco (`tabla.fondo`), no se guarda.
- **Qué lleva**: lo mismo que el consejo (regla 210, `cargarConsejoFactura`): líneas + `aparte`,
  en MAYÚSCULAS; el cliente en tres líneas sin «(En catastro figura …)»; la RC de
  `oportunidades.ref_catastral`. Desde el 18/11/2026 el texto SÍ se puede cambiar (ver «Editar
  la factura» abajo).
- **Qué teclea**: nº de factura, fecha y, por línea, cantidad (1 por defecto) y precio sin IVA
  (o, desde el 18/11, un PRECIO TOTAL).
  La primera línea (la bomba de calor) con precio, obligatorio; una línea sin precio sale sin
  importe. Importes en español: con coma, la coma es el decimal; sin coma, «6.000» son miles
  (`num()` del servicio y `leerNum()` de la página, iguales). IVA fijo de la plantilla
  (`iva_pct`, RCA 21 %: va impreso en su pie); `iva = round(base × pct) / 100` en los DOS lados
  (con `base × pct / 100` 7.100,50 € daba 1.491,10 en el PDF y 1.491,11 en pantalla).
- **La fecha**: posterior al registro del CEE inicial (`fechaRegistroCee(exp,'inicial')`) y no
  futura. Lo comprueba el servidor; la página solo lo enseña.
- **La fila** (`patchFila`): pasa por el MISMO `buildPatch` del OCR (`facturaAutoOcr`), así que
  lleva `numero_factura`, `fecha_factura`, `importe_sin_iva`, `importe_con_iva`, `iva_pct`,
  `emisor_nombre`/`emisor_nif` (de su ficha), `partidas` y `desglose` (`desgloseFactura`: lo que
  computa para el CAE, regla 189). Partida por línea: la 1.ª AEROTERMIA, el interacumulador o
  termo ACS, los emisores suministrados EMISORES, el resto OBRA_CIVIL. Además `origen:
  'generada'`, `ocr_pendiente_revision: false`, `concepto` y `generada: { at, por, partidas }`
  (lo tecleado, para volver a abrirla rellena). **No** se marca `validada`: la valida una persona.
- **Rehacerla**: la nueva SUSTITUYE a la que ya generó, revisada o no (desde el 18/11/2026; antes,
  validada, daba 409). Ver «Editar la factura» abajo.
- **Rutas** ([routes/facturaInstalador.js](implementation/backend/routes/facturaInstalador.js),
  montadas en `/api/public/factura-instalador` antes de `/api/public`): `GET /:id`, `POST
  /:id/vista-previa` (el PDF de verdad, aunque falten datos) y `POST /:id/generar` (guarda y
  devuelve el PDF en base64 para descargar). Públicas por diseño (regla 102) con el `upload_token`
  de la oportunidad, comparado en tiempo constante; nunca devuelven enlaces de Drive (regla 1).
  BD caída → 503 (regla 38).
- **Página** ([FacturaObraView.jsx](implementation/frontend/src/features/public/views/FacturaObraView.jsx),
  `/factura-obra/:id?token=`, estilo «carta de pago» `.fo-`, mobile first; `/factura-obra/demo`
  sin API): cliente, nº y fecha, una tarjeta por línea, totales con el total protagonista, «Guardar
  la factura» y la VISTA PREVIA real (pdf.js, se pide 650 ms después de teclear). Al guardar,
  «Descargar el PDF» (para su contabilidad).
- **Por dónde entra**: la página del consejo (`/consejo-factura`, a la que ya llevan el email y
  el WhatsApp de la regla 210) enseña «Hazla aquí, en tu plantilla» solo si su plantilla existe
  (`facturaApp`; `cargarConsejoFactura` devuelve `instaladorId`). Los textos del WhatsApp y del
  email NO cambian.
- **Instalador nuevo**: su factura real en .docx → exportarla EN BLANCO a PDF con Word (fondo) →
  medir las posiciones sobre su PDF → `plantilla.json` + `fondo.pdf` + sus `.ttf` en su carpeta.
  Ejemplo de `plantilla.json`: claves `fondo`, `fuentes {normal, negrita}`, `iva_pct`, `cliente`,
  `numero`, `fecha` (`formato` largo | corto), `tabla` (`cantidad`, `concepto.ancho`, `precio`,
  `importe`, `pitch`, `fondo`), `extra`, `totales`.
- Tras tocarlo: `node implementation/backend/scripts/test_factura_instalador.js` (sin red: dobles
  de Supabase y Drive), `test_consejo_factura.js`, `auditar_rutas_sin_guardian.js` y el build.

### Con el concepto va SU FACTURA EN WORD pre-rellena, y el botón de los importes — 18/11/2026

Fran, 18/11/2026 (26RES060_283, RCA): «quiero que cuando se envíe el concepto también salga
pre-rellena la factura en Word, exactamente igual que la plantilla […] además añade la opción de que
pueda rellenar los importes». RCA mandó una plantilla NUEVA donde la tabla de precios ya es una
tabla de Word normal (CANTIDAD · CONCEPTO · PRECIO · IMPORTE e Importe factura · I.V.A. · TOTAL
FACTURA): en ella sí se escribe. Esto deshace el «DESCARTADA» de arriba para las plantillas con tabla.

**REGLA — si el instalador tiene su Word en la plantilla (`plantilla.json` → `word`), el email del
concepto lo lleva ADJUNTO, pre-relleno, y un recuadro «Tu factura, ya preparada» con el botón
«Rellenar los importes» (/factura-obra), por encima del texto para copiar.** Sale de UNA fuente:
`cargarConsejoFactura(…, { conFactura: true })` devuelve `facturaWord` (el adjunto) y `facturaApp`
(el enlace), y `htmlEmailConsejo(…, opcionesEmail(r))` pinta el recuadro. Lo usan los dos envíos
que ya llevaban el consejo: «Solicitar lo que falta» (`solicitar-faltantes`, canal email) y el aviso
del CEE inicial registrado (`ceeRegistradoAviso` → `sendCeeRegistradoStaffEmail`, `attachments`).
Sin plantilla, el email sale como antes. Generar el Word nunca tumba el envío (`adjuntoFacturaWord`
devuelve null y avisa en el log).

**REGLA — el Word se rellena SOBRE la plantilla, sin tocar nada más** (`rellenarDocumentoTabla`,
[facturaWordService.js](implementation/backend/services/facturaWordService.js)): el cliente (nombre,
calle, CP y municipio, NIF) en TODOS los cuadros que lo llevan —también el «liente:» invisible de la
sombra: si no, el cliente de la plantilla seguía dentro del fichero, oculto—; una FILA por actuación
del consejo (cantidad 1 y su concepto en mayúsculas), copiando la fila de cuerpo de la plantilla
(anchos y bordes; entre filas sin borde inferior, solo la última cierra el cuadro), y una última con
INMUEBLE, REF. CATASTRAL y las observaciones del IRPF. **Número, fecha, PRECIO, IMPORTE y los
totales, en blanco**: sus celdas llevan Segoe UI en la marca de párrafo, así lo que teclea sale en
la letra de la factura y no en la Times de «Normal». Se detecta por la tabla (cabecera CONCEPTO,
PRECIO e IMPORTE); una plantilla sin tabla sigue por `rellenarDocumento` (la de los rótulos).

- **Para quien lo recibe por WhatsApp**: la página del consejo enseña «Descargar mi factura en Word»
  junto a «Hacer la factura aquí» (`facturaWord` en `GET /api/public/consejo-factura/:id`), que
  baja `GET /api/public/factura-instalador/:id/word?token=` (misma comprobación del token). El
  WhatsApp no lleva el .docx como adjunto: se queda en el enlace (el envío de documentos por la
  sesión es frágil, regla 39.b).
- **La página de los importes usa el MISMO diseño**: su fondo es este Word en blanco exportado por
  Word, y `plantilla.json` lleva las posiciones medidas sobre él (RCA: concepto a 9,5 pt, fecha en
  largo a 10,5 pt para que quepa en su cuadro). Las plantillas anteriores quedan en
  `plantilla_v1_17nov.json` y `plantilla_v2_18nov.*`.
- **Plantilla retocada por RCA (18/11/2026, tarde)**: en la primera la sombra de la derecha del
  cuadro iba celda a celda y, al copiar la fila por cada línea, se desbordaba en las esquinas. En la
  nueva la sombra es UNA celda que baja entera (`vMerge`) y la fila de cuerpo tiene un alto MÍNIMO
  de 8.800 twips (llena la hoja hasta los totales). **REGLA — al copiar la fila de cuerpo, las de
  concepto van SIN alto y la última (inmueble y observaciones) se queda con lo que falta hasta ese
  mínimo** (`filasLineas`, alto estimado por renglones de ~51 caracteres × 254 twips): copiado en
  cada fila, cada una ocuparía la hoja entera. Ajustado con Word sobre 26RES060_283 hasta que el
  cuadro acaba en el mismo sitio que la plantilla (700 pt); si un concepto ocupa más de lo estimado,
  Word estira la fila y los totales bajan un poco (hay hoja de sobra). Fondo `fondo_v3.pdf`; totales
  a 765,5 pt y límite del texto (`tabla.fondo`) a 692 pt.
- **Pruebas en local** (escribe en PRODUCCIÓN): `FACTURA_INSTALADOR_EN_SECO=true` hace que «Guardar
  la factura» la componga y la devuelva sin guardar nada (lo lleva la configuración
  `factura-obra-5177` de `.claude/launch.json`).
- Probado el 18/11 con 26RES060_283: el Word sale en una hoja, idéntico a la plantilla (exportado
  por Word); el email de prueba llegó al Gmail de Fran con el adjunto, y no a RCA.

### Editar la factura en la app: precio total, conceptos y sustituir la que hay — 18/11/2026

Fran, 18/11/2026, viendo la factura de 26RES060_283: «un botón por si solo quiere poner el precio
en total y no por partidas […] que se puedan editar los conceptos […] que se pueda editar la factura
a través de la app si fuese necesario, y si se valida se sustituya la existente: puede darse el caso
de errores». La factura que RCA había SUBIDO de esa obra (44/26) llevaba un solo importe.

**REGLA — PRECIO TOTAL (`modo: 'total'`): un solo precio sin IVA para toda la obra, que va en la
PRIMERA línea (la bomba de calor) con cantidad 1; las demás salen sin importe.** En la fila, todo el
importe cae en AEROTERMIA (computa para el CAE igual). `calcular` lo valida («Pon el precio total de
la obra»); en la página es el conmutador «Por partidas | Precio total».

**REGLA — los CONCEPTOS se pueden cambiar, quitar (menos el primero) y añadir (hasta 12, de 700
caracteres como mucho), pero cada línea editada conserva la PARTIDA de la del consejo en su sitio**
(la 1.ª, AEROTERMIA): un instalador que corrige una errata no cambia lo que computa. Las añadidas
toman la partida de su texto (`partidaDe`). Los precios siguen a su línea aunque se vacíe otra (`idx`).
Solo viajan si cambian (`conceptos` en el cuerpo); la fila guarda `generada.conceptos` para volver a
abrirla igual, y «Volver al texto recomendado» lo deshace. La página avisa de que la marca, el modelo
y el nº de serie son los de las placas. Si el texto ya no cabe en la hoja, la vista previa lo dice
(`X-Factura-Desborda: 1`) y no deja guardar.

**REGLA — la factura nueva SUSTITUYE a la que hizo aquí, AUNQUE ESTUVIERA REVISADA, y la nueva vuelve
a revisión** (no hereda `validada`). Con facturas SUBIDAS, la página pregunta, obligatorio, «¿Esta la
sustituye?» (una por factura, o «No, es otra distinta»); al elegir una se traen su nº, su fecha y,
si aún no hay precios, su base como precio total. Se identifican por una REFERENCIA opaca
(`refFactura`: sha256 del `drive_id`, 12 caracteres), nunca por su enlace de Drive (regla 1).

- **Orden al guardar** (`guardarFactura`): primero se SUBE la nueva y se crea su fila; DESPUÉS se
  retiran las sustituidas: su fichero a la PAPELERA de Drive (`deleteFile`, se puede recuperar), su
  entrada de `DOC_FACTURAS` (releída tras subir, para no llevarse la nueva) y su fila. Si la subida
  falla, la de antes sigue en su sitio. El aviso al equipo dice «sustituye a la 44/26» y la fila
  lleva `generada.sustituye` (nº, fecha, origen, si estaba validada).
- `GET` devuelve `facturas` (las subidas con fichero: `ref`, nº, fecha, base, total, validada) y
  `anterior` con `modo`, `conceptos` y `base`.
- Probado el 18/11 con 26RES060_283 en seco (`FACTURA_INSTALADOR_EN_SECO`): sustituyendo a la 44/26,
  precio total 16.836 €, un concepto cambiado y una línea añadida → «Sustituye a la factura 44/26»,
  20.371,56 €; la BD siguió con su única factura. Tests: `test_factura_instalador.js` (12).
