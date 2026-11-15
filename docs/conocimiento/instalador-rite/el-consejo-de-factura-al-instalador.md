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
- **EN PAUSA** (Fran, 13/11/2026): «de momento no funciona bien introducir los precios» en el Word
  descargado (el número, la fecha y los importes van en cuadros de texto y columnas de la
  conversión desde PDF). Mientras tanto, a RCA también se le manda el email HTML de siempre con
  el recuadro «Texto recomendado para la factura» y el botón «Copiar el concepto».
- **Pendiente de decidir** (13/11/2026): la marca en la ficha de qué instalador recibe el Word, y
  engancharlo al envío del aviso (adjunto con `whatsappService.sendMedia`, documento, junto al
  enlace de subida).
