<!-- conocimiento · área: cee · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Introducción de «PRESENTAR el CEE en el Registro — el borrador (2026-09-15)»; cada subsección está en su propio fichero de esta carpeta.

## PRESENTAR el CEE en el Registro — el borrador (2026-09-15)

Inscribir un certificado es rellenar un formulario telemático con datos que la app YA
tiene: el titular, la vivienda, el técnico y las dos calificaciones del propio
certificado. Se tecleaban a mano mirando tres pantallas, y una errata en la referencia
catastral o en el NIF no se descubre hasta que el Registro devuelve el expediente.

Botón **📄 Presentar el CEE**, dentro de **Ayudas CE3X**: un popup con cada casilla lista
para copiar, y un PDF descargable que además **viaja adjunto en el visto bueno** que le
dice al certificador que ya puede presentar.

Desde 2026-10-01 se abre también **directamente** con el botón **📄 Presentar CEE** de la
barra del módulo CEE, detrás de CE3X (solo equipo interno): a dos clics dentro de Ayudas
CE3X no lo encontraba nadie. Es el MISMO `BorradorCeeModal`, portaleado a `body`.

| Qué | Dónde |
|---|---|
| Qué va en cada casilla, las X y los avisos | [logic/borradorCee.js](implementation/frontend/src/features/expedientes/logic/borradorCee.js) |
| Reunir cliente + técnico + certificado, y el PDF | [borradorCeeService.js](implementation/backend/services/borradorCeeService.js) |
| Ruta | `GET /:id/borrador-cee?fase=` (**staffOnly**), en las DOS rutas del módulo CEE |
| Popup | `BorradorCeeModal.jsx`, abierto desde `Ce3xAyudasModal` |
| Adjunto | `POST /:id/approve-cee` con `adjuntarBorrador` (por defecto **sí**), en CAE y en CEE directos |
| Prueba | `node implementation/backend/scripts/test_borrador_cee.mjs` |

**REGLA — NO es una réplica del impreso: es una GUÍA DE RELLENO.** El trámite es
telemático y no hay PDF que rellenar (a diferencia de las fichas RES, regla 41). Lo que
se genera dice qué va en cada casilla, en el orden en que el formulario las pide, **qué X
hay que marcar y cuál dejar sin marcar** — que es justo donde uno se equivoca. Los
apartados 03 (medio de notificación) y el de protección de datos no salen: los
cumplimenta la propia sede.

**REGLA — solo CASTILLA-LA MANCHA.** El formulario replicado es el procedimiento
**020264 (SIACI SJM3)** de la JCCM, y cada comunidad tiene el suyo, con otros apartados y
otras casillas. Fuera de CLM **no se genera**: se dice de qué comunidad es el expediente
y que no hay plantilla para ese registro. Un borrador con los apartados de CLM en un
expediente de Valencia manda a rellenar un formulario que no es el suyo. La comunidad
sale de la provincia del edificio, con el **código postal** como respaldo.

**REGLA — en el apartado 05 manda lo que dice el PROPIO CERTIFICADO.**
`cee_{fase}.identificacion` trae la dirección del edificio tal y como se va a inscribir,
y es contra ella contra la que el Registro compara; solo si el certificado no la trae se
cae al expediente y después a la simulación. Medido en 26RES060_186: `instalacion` está
VACÍA y la dirección buena solo estaba en el `.xml`.

**REGLA — el troceo de la vía se PROPONE, y el original va al lado.** El formulario pide
el tipo de vía, el nombre, el número, el portal, la escalera, la planta y la puerta por
separado, y la app guarda una cadena ("C/ DON SERGIO, 12 - 1ºE"). `trocearVia` solo
traduce una sigla que esté en su tabla, y **lo que no puede repartir con seguridad —un
"5-B-3"— lo deja entero con su aviso** en vez de adivinar planta y puerta. La dirección
guardada se imprime siempre debajo, para poder comprobarlo.

**REGLA — el plazo de UN MES se avisa.** Es lo único de esta hoja que cuesta dinero:
pasado el mes desde la emisión hay que volver a emitir el certificado, con su visita y su
tasa. Se avisa al pasarse y cuando quedan 7 días o menos; dentro de plazo no se dice nada.

**REGLA — la casilla vacía no desaparece, pero tampoco ocupa una fila.** En el formulario
portal, escalera, planta y puerta EXISTEN y saber que van en blanco es lo que se
comprueba; cuatro tarjetas diciendo "no consta" son cuatro pantallazos de scroll entre el
número de la calle y la provincia. Se colapsan en una línea ("En blanco: Portal ·
Escalera · Planta · Puerta") y en el PDF van en una fila, como en el impreso. Solo se
colapsa ESE grupo: un tipo de vía o una provincia en blanco sí son algo que falta —hay que
elegirlos en el desplegable— y esconderlos en gris sería cambiar espacio por despistes.
El popup va además a **DOS COLUMNAS** (una en móvil), y lo que no cabe en media fila —un
párrafo, o un campo con nota— ocupa la fila entera.

**REGLA — los documentos anexados NO se copian: se DESCARGAN.** Un botón de copiar sobre
el nombre de un fichero invita a pegarlo en algún sitio, y lo que hace falta es el
fichero. Si está en la carpeta del CEE se baja de un clic **ya renombrado** con el NIF
delante (`GET /:id/borrador-cee/fichero?fase=&doc=`, que se pide por CLAVE de documento y
nunca por driveId, así que no sirve para bajar el fichero de otro expediente). Lo que no
está se dice en ámbar: es lo que hay que resolver antes de entrar en la sede.

**REGLA — el nombre de descarga es el del fichero que HAY en Drive con el NIF delante,
no uno compuesto.** Medido en 26RES060_187: sus ficheros se llaman
`26RES060_187 - CEE INICIAL_REVISADO.xml` —con `_REVISADO` y con guion normal, no el
largo del nombre canónico—, así que un nombre compuesto por nosotros no habría coincidido
con ninguno. Solo cuando el fichero no está se enseña el esperado, como referencia.

**REGLA — el teléfono y el correo del solicitante caen a su PERSONA DE CONTACTO.** El
formulario los EXIGE y muchos titulares no dan los suyos: quien lleva la obra es un hijo,
la pareja o el instalador, y es SU número el que consta (medido en 26RES060_187: la
titular los tiene los dos en blanco y JUAN ANTONIO, su contacto, los dos rellenos). Sale
dicho con su nombre —no es lo mismo el correo de quien firma que el de quien lleva la
obra— y si no hay ninguno de los dos, se avisa. La cascada es fuente única en
[utils/contactoCliente.js](implementation/frontend/src/utils/contactoCliente.js), que
comparte con la ficha del `.cex` (regla 48.c): vivía dentro de `fichaCe3x.js` y se sacó al
necesitarla la segunda pantalla, porque con dos copias el mismo cliente aparecería
localizable en una y sin datos en la otra.

**REGLA — el borrador LLEVA al trámite, y el PDF también.** Botón «Presentar en la Sede»
en la cabecera del popup (`https://www.jccm.es/sede/tramite/JM3`, otra pestaña) y el mismo
enlace como HIPERVÍNCULO REAL dentro del PDF: un borrador impreso o reenviado por correo
tiene que llevar consigo a dónde se lleva. La sede viaja DENTRO del borrador (`b.sede`) y
no la cablea la pantalla — el día que haya otra comunidad, su botón irá a su propia sede.
En el pie va, aparte, la ficha del procedimiento (requisitos y modelos), que no es donde
se presenta.

**REGLA — el NOMBRE se parte en tres casillas: Nombre · Apellido 1 · Apellido 2.** Es como
las pide el formulario y la app los guarda juntos. `partirApellidos` pega las partículas a
la palabra que siguen («DE LA FUENTE GARCIA» → «DE LA FUENTE» + «GARCIA») y, cuando el
reparto es una conjetura —tres o más palabras sin partícula que marque el corte—, propone
el más frecuente y **lo dice en el propio campo**. Verificado contra el formulario real de
26RES060_187: «RAMOS» + «FERNANDEZ MARCOTE».

**REGLA — lo que se marca DESPUÉS de los campos va después** (`instruccionesFinal`). En el
apartado 05 el recuadro VIVIENDA / TERCIARIO está detrás de la referencia catastral: puesto
al principio, quien recorre el apartado de arriba abajo llega al final buscando qué marcar
y no encuentra nada. Qué casillas son lo dice el `<TipoDeEdificio>` del `.xml`.

**REGLA — lo que VUELVE de la sede se sube desde aquí, por la MISMA función de la
rejilla.** Presentar no termina al enviar: el Registro devuelve el justificante y la
pasarela, el recibo de la tasa. El popup los sube llamando a `gridRef.subirASlot` —el
`handleUpload` de `CeeDocumentsGrid`, expuesto con `useImperativeHandle`—, así que el
justificante dispara su lectura de fecha, marca la fase REGISTRADO, avanza el estado y
ofrece el aviso al cliente exactamente igual que si se soltara en su casilla.
Reimplementarlo sería tener dos versiones de eso y que una se quedara atrás. El recibo de
la tasa no tiene casilla propia: va al cajón **OTROS** como `{nº} – TASA`, renombrando el
fichero antes de subirlo (en un slot múltiple el nombre sale del propio fichero).

**REGLA — el borrador es del equipo interno; al certificador le llega ADJUNTO.** La ruta
es `staffOnly` y el botón no se le pinta (`permiteBorrador`): el visto bueno es el momento
en que puede presentar, y mandárselo antes sería pedirle que presente un certificado que
todavía no hemos revisado. Un fallo del adjunto **nunca tumba el visto bueno**.

**REGLA — el borrador también se GUARDA en la carpeta de su fase** (2026-10-01). Cuando
presenta Brokergy no hay correo que abrir: se abre la carpeta del CEE, de donde salen los
ficheros que se anexan. Casilla **«Guardar el borrador en Drive»** en los dos popups del
visto bueno (marcada, y con CUALQUIER canal: no depende del email) y botón **📁 Guardar en
Drive** en «Presentar el CEE» (`POST /:id/borrador-cee/drive`, staffOnly, en las DOS rutas
del módulo CEE). Cada fase en SU carpeta —`1. CEE/CEE INICIAL|FINAL` en el CAE; `1. CEE`, o
`1. CEE INICIAL`/`2. CEE FINAL`, en un CEE directo— como `{nº} – BORRADOR PRESENTACIÓN
{fase}.pdf`. **Sin sufijo de slot** (`_fdo`/`_reg`/`_etq`): la rejilla reconoce las entregas
del técnico por él. **Se SUSTITUYE** (el nuevo se sube primero y el anterior va a la
papelera: es un derivado que se rehace de un clic) y **no toca los permisos** de la carpeta.
`esBorradorPresentacion` ([ceeUploadService.js](implementation/backend/services/ceeUploadService.js))
lo aparta de los «archivos del CEE»: no se adjunta dos veces al visto bueno ni se le manda
al cliente en la entrega. Se rasteriza UNA vez para adjuntar y guardar
(`borradorCeeService.paraVistoBueno`), y un fallo se devuelve en `borradorDrive` con su
motivo, sin tumbar el aviso.
