---
name: generar-anexo-fotografico
description: >-
  Genera el ANEXO FOTOGRÁFICO (reportaje fotográfico de las actuaciones) de un expediente CAE de
  BROKERGY y lo deja listo para firma. Úsalo cuando el usuario pida "genera/crea/prepara el anexo
  fotográfico del expediente NNN", "monta el reportaje fotográfico", o "deja las fotos del anexo listas
  para firmar". La skill: (1) mira las fotos ya nombradas por slot en "12. DOCUMENTOS PARA CEE"; (2) si
  faltan, CLASIFICA las fotos sueltas de "2. FOTOS Y VIDEOS" distinguiendo ANTES (situación inicial) de
  DESPUÉS (actuación ejecutada) y las renombra al slot correcto; (3) dispara la generación del PDF, que
  se guarda en "6. ANEXOS CAE" y queda enlazado en el expediente. NO rellena datos del expediente (eso
  es rellenar-expediente) ni audita (eso es auditar-expediente).
---

# Generar Anexo Fotográfico (reportaje de actuaciones)

Objetivo: dejar el **Anexo Fotográfico** del expediente generado en Drive ("6. ANEXOS CAE") y enlazado
en la app, **listo para revisar y firmar**, a partir de las fotos de la reforma.

El documento agrupa las fotos por **ACTUACIÓN** (sustitución de caldera por aerotermia, sustitución de
ventanas, aislamiento de cubierta/fachada…), y dentro de cada una por **fase ANTES / DESPUÉS**. Por eso
lo único que de verdad importa es que cada foto acabe en su **slot** correcto dentro de
`12. DOCUMENTOS PARA CEE`. La maquetación (portada, índice, rejillas, pies) la hace el backend.

## Herramientas
- **MCP de BROKERGY** (canal con la app): `estado_anexo_fotografico` (lectura: qué slots espera el
  expediente y cuáles ya tienen foto) y `generar_anexo_fotografico` (genera el PDF y lo enlaza). Es el
  camino preferente porque no necesita ninguna clave.
- **MCP de Google Drive**: `search_files`, `get_file_metadata`, `read_file_content` /
  `download_file_content`, `copy_file`, `create_file`. ⚠️ **Drive solo COPIA y CREA: no mueve ni borra.**
  Puedes copiar una foto a `12. DOCUMENTOS PARA CEE` con su nombre de slot, pero NO borrar duplicados ni
  limpiar (eso lo hace la app o el usuario; repórtalo como pendiente).
- **MCP de Supabase** (`execute_sql`, project_id `okfeopwetlxdffrsbfqw`): solo como respaldo para
  resolver el `drive_folder_id` si hiciera falta.

## Entrada
El usuario indica el expediente por `numero_expediente` (ej. `26RES080_58`). Si no lo da, pídelo en una
línea.

---

## Procedimiento

### 1. Leer el estado del anexo
Llama a `estado_anexo_fotografico(numero)`. Te devuelve:
- `drive_folder_id` — la carpeta del expediente en Drive.
- `slots[]` — los slots de foto que ESTE expediente espera, cada uno con `key`, `label`, `fase`
  (`ANTES`/`DESPUES`), `multiple` (si admite varias) y `actuacion`. **Esta es tu lista de destinos
  válidos**: solo estos nombres de slot cuentan para el anexo.
- `presentes[]` — slots que YA tienen foto en `12. DOCUMENTOS PARA CEE` (con `count`).
- `faltan[]` — slots sin ninguna foto todavía.
- `anexo_link_actual` — si ya había un anexo generado (se regenerará/actualizará).

Si `faltan` está vacío y `presentes` cubre lo esperado → salta al paso 4 (generar). Si faltan slots,
sigue al paso 2 para intentar completarlos desde las fotos sueltas.

### 2. Localizar las fotos candidatas en Drive
Bajo `drive_folder_id`, lista las subcarpetas con `search_files`
(`'<drive_folder_id>' in parents and mimeType='application/vnd.google-apps.folder'`) y quédate con:
- **`12. DOCUMENTOS PARA CEE`** — destino final; aquí ya pueden estar las fotos buenas y renombradas.
- **`2. FOTOS Y VIDEOS`** — fuente de las fotos sueltas del instalador/cliente. Suele tener subcarpetas
  **`ANTES`** y **`DESPUES`**: si existen, **el nombre de la subcarpeta ya te da la fase** (úsalo como
  señal fuerte). Si no están separadas, las fotos vienen mezcladas y tendrás que clasificarlas tú.

Lista los ficheros de imagen de cada carpeta (`search_files parentId=...`, quédate con jpg/jpeg/png/
webp/heic). Ignora vídeos (`.mp4`, `.mov`) para el anexo.

### 3. Clasificar y renombrar (el núcleo de la skill)
Para cada slot en `faltan` (y solo esos: **no dupliques** lo que ya está en `presentes`), busca entre
las candidatas la(s) foto(s) que le correspondan. **Mira la imagen** (`read_file_content` /
`download_file_content`) cuando el nombre no lo deje claro.

**ANTES (situación inicial) vs DESPUÉS (actuación ejecutada):**
- **ANTES** = lo viejo que se retira: caldera antigua (de gasóleo/gas, chapa esmaltada, quemador,
  cuadros analógicos), su **placa** de características, depósito de gasóleo, sistema de ACS antiguo
  (termo), ventanas viejas a sustituir, fachada/cubierta antes de aislar.
- **DESPUÉS** = lo nuevo instalado: **unidad exterior** de aerotermia (equipo moderno en fachada/patio,
  marcas Daikin/Toshiba/Mitsubishi/…), su **placa**, unidad interior/hidrokit, depósito de ACS nuevo,
  hueco vacío donde estaba la caldera desmontada, ventanas nuevas ya puestas, fachada/cubierta terminada.
- Señales de apoyo: la subcarpeta `ANTES`/`DESPUES`; la fecha de la foto (`get_file_metadata`) — las de
  después suelen ser posteriores; el propio nombre del fichero.

**Slot correcto dentro de la fase** (usa las `key` que te dio `estado_anexo_fotografico`; las más
habituales):
- `FOTO_CALDERA_ANTES` = foto general de la caldera/generador antiguo.
- `FOTO_PLACA_CALDERA_ANTES` = primer plano de la **placa/etiqueta** de la caldera (marca, modelo,
  potencia, nº de serie). Distínguela de la foto general: la placa es un plano cercano de la etiqueta.
- `FOTO_ACS_ANTES` = sistema de agua caliente anterior (termo eléctrico o conexión de ACS).
- `FOTO_UNIDAD_EXTERIOR` = unidad exterior nueva instalada.
- `FOTO_UNIDAD_EXTERIOR_PLACA` = placa/etiqueta de la unidad exterior.
- `FOTO_UNIDAD_INTERIOR` / `FOTO_UNIDAD_INTERIOR_PLACA` = unidad interior/hidrokit y su placa.
- `FOTO_ACS_DEPOSITO` = depósito de ACS nuevo.
- `FOTO_CALDERA_DESMONTADA` = hueco/estado tras retirar la caldera antigua.
- `FOTO_VENTANAS_ANTES` / `FOTO_VENTANAS_DESPUES` = ventanas a sustituir / ventanas nuevas.
- `FOTO_CUBIERTA_ANTES/DESPUES`, `FOTO_FACHADA_ANTES/DESPUES`, `FOTO_SUELO_ANTES`, `FOTO_PLACAS_SOLARES`
  según lo que devuelva `slots[]`.

**Regla de oro:** ante la duda de fase o de slot, **no adivines**: deja esa foto fuera y anótala como
"revisar". Etiquetar mal una foto corrompe un documento que se firma y se presenta al ministerio; es
peor que dejar el slot vacío.

**Nombrado al copiar a `12. DOCUMENTOS PARA CEE`:**
- Slot de una sola foto (`multiple=false`): `FOTO_<SLOT>.<ext>` (ej. `FOTO_PLACA_CALDERA_ANTES.jpg`).
- Slot con varias (`multiple=true`): `FOTO_<SLOT>_1.<ext>`, `FOTO_<SLOT>_2.<ext>`… continuando la
  numeración si ya había alguna en `presentes` (no reutilices un índice existente).
- Copia con `copy_file(fileId, parentId=<id de "12. DOCUMENTOS PARA CEE">, name="<nombre_slot>.<ext>")`.
  Si tu `copy_file` no permite renombrar, descarga la foto y créala con `create_file` con ese nombre en
  esa carpeta. Mantén la extensión original.
- El fichero copiado hereda la compartición de la carpeta → el proxy de miniaturas y el anexo lo verán.

Ve marcando qué has colocado. Cuando termines, **relee** el estado con `estado_anexo_fotografico` para
confirmar que los slots que querías completar ya figuran en `presentes`.

### 4. Generar el anexo
Llama a `generar_anexo_fotografico(numero)`. El backend recopila las fotos de `12. DOCUMENTOS PARA CEE`,
construye el PDF con el diseño oficial, lo guarda en **`6. ANEXOS CAE`** como `<numExpte> - Anexo
Fotografico.pdf` y deja el enlace en el expediente (`documentacion.anexo_fotografico_drive_link`).
Devuelve `link`, `numPhotos`, `numActuaciones` y el desglose por grupo.

Si responde que **no hay fotos** por slot, es que el paso 3 no colocó ninguna: revisa que copiaste a la
carpeta correcta con el nombre de slot exacto.

### 5. Informe final
Resume al usuario:
- Enlace al PDF generado (el de `6. ANEXOS CAE`).
- Qué actuaciones y cuántas fotos por fase entraron.
- Qué slots quedaron **sin cubrir** y por qué (no había foto / foto dudosa dejada para revisar), para
  que el usuario complete o valide antes de enviar a firma.
- Recuerda que la firma se recoge por el flujo existente de la app (`/firmar-anexos/:id`): esta skill
  deja el anexo **generado y enlazado**, listo para enviarlo a firmar; no lo envía por sí sola salvo que
  el usuario lo pida.

## Notas y límites
- **Idempotente**: no re-copies fotos ya presentes; regenerar el anexo simplemente sustituye el PDF.
- **No borra nada**: si hay duplicados o fotos mal colocadas en `12. DOCUMENTOS PARA CEE`, repórtalo; no
  puedes limpiarlos desde aquí.
- **Solo actuaciones**: las fotos de contexto (fachada de la calle, patios interiores, patio de luces)
  NO van al anexo aunque existan; el backend ya las excluye.
- Si el expediente aún no tiene fotos del DESPUÉS (obra sin ejecutar/terminar), el anexo saldrá solo con
  el ANTES: es correcto, avísalo.
