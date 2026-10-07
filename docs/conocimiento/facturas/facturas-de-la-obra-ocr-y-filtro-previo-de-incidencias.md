<!-- conocimiento · área: facturas · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## Facturas de la obra — OCR y filtro previo de incidencias (2026-08-03)

Modal **FACTURAS DE LA OBRA** (pestaña Documentación → "Gestionar"). Sueltas el PDF y la app lo
sube a "5. FACTURAS", lo LEE y lo cruza con el expediente. **Solo ADMIN**: aquí hay importes.

### El OCR es el mismo camino que el del CEE
[facturaOcrService.js](implementation/backend/services/facturaOcrService.js) es el gemelo de
`ceeOcrService.js`: Gemini 2.5 Flash con `responseSchema`, `temperature: 0` y reintentos 429/500/503,
reutilizando `ceeOcrService.normalizeToPdf` (une fotos sueltas en un PDF antes de leer). Coste real
medido: **< 0,002 € por factura**, ~11 s. Ruta: `POST /api/expedientes/:id/facturas/ocr` (multipart,
NO base64 en JSON).

**REGLA — la IA solo LEE; el juicio es de las reglas.** El modelo devuelve el desglose con cada línea
clasificada en un enum cerrado de `partida` (AEROTERMIA · ACS · EMISORES · VENTANAS · CUBIERTA ·
FACHADA · SUELO · FOTOVOLTAICA · OBRA_CIVIL · MANO_OBRA · OTROS). Quién decide qué es incidencia es
[facturaIncidencias.js](implementation/backend/services/facturaIncidencias.js), determinista y con la
evidencia literal citada, para que cualquiera pueda reproducir por qué saltó.

### Lo que mira (mismo criterio que el §4B de la skill `auditar-expediente`)
- **GRAVE `UNIDADES_TERMINALES`** — en RES060/RES093/TER100 (`esSustitucionCaldera`), una línea
  `EMISORES` es incidencia: **la ficha no admite cambiar ni ampliar las unidades terminales**. La
  actuación es sustituir el GENERADOR, y el emisor existente es el que fija la temperatura de
  impulsión y con ella el SCOP. RES080 exento (ahí sí cabe obra de emisores). ⚠️ Conectar o purgar
  los emisores YA EXISTENTES es `OBRA_CIVIL`, no `EMISORES` — probado: no da falso positivo.
- **GRAVE**: `TITULAR` (NIF del cliente ≠ el del expediente) · `EMISOR` (no factura el instalador
  asociado, que es quien firma el CIFO — ver abajo: en RES080 solo si la factura lleva la
  TÉRMICA) · `ALCANCE` (partida fuera de la ficha) ·
  `ALCANCE_SIN_EQUIPO` (única factura sin la bomba de calor) · `DUPLICADA` · `SERIE_DISTINTA` ·
  `FECHA` (futura) · `SOBREFINANCIACION`.
- **LEVE**: `SIN_EQUIPO` (falta marca / modelo / nº de serie — lo ideal es que la factura lo cite) ·
  `SIN_DESGLOSE` · `DIRECCION` · `SIN_CLIENTE` · `SIN_FECHA`.
- **El `EMISOR` de un RES080 solo se exige en la factura de la TÉRMICA.** Una rehabilitación la
  ejecutan VARIOS gremios: la bomba de calor la pone el instalador, las ventanas el carpintero, la
  cubierta el albañil, la fachada el aplicador del SATE. Que esas facturas las emita otra empresa
  **es lo normal**, y marcarlas en GRAVE sacaba un aviso rojo en casi todas las facturas de
  envolvente de todos los RES080 — un aviso que sale siempre y nunca hay que atender es el que
  enseña a ignorar la lista entera. Salta si la factura incluye `AEROTERMIA` o `ACS`, que es lo que
  firma quien emite el certificado y la memoria RITE. En RES060/RES093/TER no hay tal reparto: la
  actuación ES la bomba de calor, así que cualquier factura del expediente tiene que ser suya.
- **LEVE `FECHA`** (anterior al CEE inicial) — y aquí manda la **FIRMA** del CEE inicial, **no su
  REGISTRO**. El certificado de partida existe desde que lo firma el técnico; inscribirlo es un
  trámite posterior, del certificador y de la administración, que se toma sus semanas: comparando
  contra el registro se marcaba como GRAVE una factura emitida con el certificado ya en la mano
  (medido en 26RES080_59 — factura del 09/07/2026 contra un registro del 31/07). Es LEVE porque la
  fecha de una factura **no es la fecha en que se ejecutó la obra**: se factura un anticipo, o el
  material por delante. Lo que el verificador compara es el INICIO DE ACTUACIÓN que declara el CIFO,
  y esa comprobación sigue siendo dura en
  [cifoFechas.js](implementation/frontend/src/features/expedientes/logic/cifoFechas.js), que además
  distingue el tramo firma→registro (LEVE solo en RES080; en las fichas de sustitución la ficha
  exige el CEE REGISTRADO antes de la actuación). Sin fecha de firma se compara con el registro
  **diciéndolo** y se pide rellenarla. La cascada de dónde sale esa fecha —`cee.fecha_firma_cee_*`,
  el `fechaFirma` del certificado parseado y el espejo en `documentacion`— es fuente única en
  [utils/ceeFechas.js](implementation/backend/utils/ceeFechas.js).

**Las incidencias se PROPONEN, no se registran solas.** El modal las lista con casilla, GRAVES
primero; solo las marcadas se dan de alta vía `POST /:id/incidencias` con `procedencia: AGENTE_IA`.

### La factura que sube el CLIENTE también se lee sola (2026-08-11)
[facturaAutoOcr.js](implementation/backend/services/facturaAutoOcr.js), disparado en `setImmediate`
desde la subida pública al slot `DOC_FACTURAS`. Antes esa fila llegaba al admin con nº, fecha e
importe **en blanco** y había que abrir el PDF y teclearlos.

- El cliente **no espera ni lo ve**: la respuesta ya se ha devuelto cuando arranca el OCR.
- Completa la fila que `append_expediente_factura` dejó vacía, con la RPC
  **`update_expediente_factura_by_driveid`** (MERGE `||` sobre el objeto, solo la fila de ese
  `drive_id`). Un read-modify-write del array se pisaría con cualquier otra escritura sobre
  `documentacion` — mismo motivo que la regla 19.
- **Solo rellena huecos** y marca `origen: 'popup+ocr'` + `ocr_pendiente_revision: true`. En el modal
  de Facturas sale el aviso "Leída automáticamente — comprueba nº, fecha e importe", que desaparece
  en cuanto el admin toca cualquier campo o la valida. Lo ha leído una máquina de un fichero que
  subió el cliente y que puede ser cualquier cosa (un albarán, un presupuesto, una foto movida).
- **NO levanta incidencias**: eso sigue siendo del modal del admin, con una persona confirmando.

### PDF único de facturas — por qué salían duplicados
**REGLA — el combinado se construye desde `documentacion.facturas[]`, NUNCA listando la carpeta.**
Listar "5. FACTURAS" metía en el PDF cualquier fichero suelto. Caso real (26RES060_159): la misma
factura subida dos veces con 3 minutos de diferencia → el combinado la incluía **dos veces**, y esa
inversión duplicada es la que viaja al verificador (`Σ facturas[].importe_sin_iva` es la inversión
del Anexo y de la solicitud). Además:
- **Borrar o reemplazar una factura ARCHIVA su PDF** en `5. FACTURAS/OLD` (`archiveExistingToOld`).
  Antes solo se quitaba la fila del JSON y el fichero seguía contando.
- **Lock en memoria + `findFilesByName` (plural)**: dos POST solapados creaban dos combinados con el
  mismo nombre (Drive lo permite) y el borrado previo solo se llevaba uno. El front lo guarda además
  con un `useRef` (el estado de React se confirma un render tarde y no frena la reentrada).
- **Repara referencias muertas**: si el `drive_id` registrado está en la papelera pero hay un gemelo
  vivo con el mismo nombre en la carpeta, lo usa y lo avisa, en vez de fallar.
- La respuesta trae `huerfanos[]` (ficheros de la carpeta que no son de ninguna factura registrada).
- **El combinado vive en DOS carpetas a propósito**: el de trabajo en "5. FACTURAS" y la copia para
  el auditor en "10. EXPEDIENTE CAE". Se dice en la UI porque parecía que se generaba dos veces.
