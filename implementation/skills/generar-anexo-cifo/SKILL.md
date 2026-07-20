---
name: generar-anexo-cifo
description: Genera el CIFO / Certificado de Instalación (RES060, RES093) o el Certificado Final de Obra (RES080) de un expediente BROKERGY con EL MISMO FORMATO que la app y lo deja en "6. ANEXOS CAE" enlazado en su slot, listo para revisar y firmar — igual que el Anexo Fotográfico. Úsalo cuando el usuario pida "genera el CIFO del expediente NNN", "prepara el certificado de instalación", "monta el CIFO", "genera el certificado final de obra / el RES080". El backend detecta la tipología (RES060/RES093/RES080), valida, genera, fusiona las fichas técnicas, guarda en Drive y enlaza el slot; si falta algo no crítico lo registra como incidencia LEVE y genera igual, y si es imposible generar un certificado válido lo registra como incidencia GRAVE y no genera. NO audita (auditar-expediente) ni rellena el expediente completo (rellenar-expediente).
---

# Generar CIFO / Certificado Final de Obra (RES060 · RES093 · RES080)

> **Versión:** 2026-07-20 · v4 — generación por BACKEND (mismo builder que la app). Un solo modo.
> Cubre RES060 y RES093 (Certificado de Instalación / CIFO) y RES080 (Certificado Final de Obra).
> El tool `generar_cifo` detecta la tipología por el número de expediente; tú no eliges plantilla.

Objetivo: dejar el **CIFO generado en Drive** ("6. ANEXOS CAE") y **enlazado en su slot**
(`documentacion.cert_cifo_drive_link`), con **la/s ficha/s técnica/s fusionadas**, **listo para revisar
y firmar** por el flujo existente de la app (`/firmar-anexos/:id`). Exactamente el mismo PDF que si el
usuario pulsara "Guardar en Drive" en el modal del CIFO de la app.

**Cómo funciona (importante):** ya NO se dibuja el PDF a mano. El backend de app.brokergy tiene el tool
`generar_cifo`, que usa **el mismo módulo de maquetación que el modal del frontend**
(`features/expedientes/logic/cifoDoc.js`), imprime desde Supabase, descarga/fusiona las fichas técnicas
y guarda en Drive. Por eso el resultado es **byte-idéntico** al de la app. Tu trabajo aquí es
**preparar los datos en la app** (si falta algo deducible, cargarlo como en `rellenar-expediente`) y
**disparar la generación** — igual que en el Anexo Fotográfico.

**Principio rector:** la app es la fuente de verdad. El CIFO imprime lo que hay cargado en Supabase; no
metas datos "provisionales". Lo que no se pueda justificar/cargar → incidencia y, si es crítico, no se
genera.

## Herramientas
- **MCP de BROKERGY** (canal con la app, sin claves): camino preferente.
  - `estado_cifo(numero)` — LECTURA: tipología, si **puede_generar**, `datos_faltan` (lo que BLOQUEA) y
    `avisos` (leves), y si ya está generado/firmado. Úsalo SIEMPRE antes de generar.
  - `generar_cifo(numero, force?)` — ESCRITURA: genera el PDF, fusiona fichas técnicas, guarda en
    "6. ANEXOS CAE" y enlaza `cert_cifo_drive_link`. Registra por su cuenta las incidencias (LEVE por lo
    que falte, GRAVE si no se puede generar). `force:true` solo para regenerar sobre un CIFO ya firmado.
- **MCP de Supabase** (`execute_sql`, project_id `okfeopwetlxdffrsbfqw`): para **completar datos** que
  falten y sean deducibles (SCOP y método, ηi por placa, series, fechas, `cambio_acs`, `url_eprel`,
  enlaces de ficha técnica…), con la misma lógica de `rellenar-expediente`. Escribe en la app y vuelve
  a generar.
- **MCP de Google Drive** (`search_files`, `read_file_content`, `copy_file`, `create_file`): para
  localizar/copiar una ficha técnica al expediente si el enlace de su slot no existe. Solo COPIA y CREA.
- **WebFetch** a la API pública de EPREL — solo para VALIDAR el ηs de una ficha si tienes que corregir
  el SCOP (la descarga del binario EPREL la resuelve el backend/flujo de la app).
- `registrar_incidencia(numero, texto, severidad, procedencia:'AGENTE_IA')` solo si detectas algo que el
  backend no cubre; las incidencias por datos que faltan las escribe ya `generar_cifo`.

## Entrada
`numero_expediente` (ej. `26RES060_165`). Si no lo da el usuario, pídelo en una línea.

---

## Procedimiento

### 1. Leer el estado
Llama a `estado_cifo(numero)`. Te dice:
- `tipologia` — **RES060**, **RES093** (Certificado de Instalación / CIFO) o **RES080** (Certificado
  Final de Obra). Las tres se generan por esta skill; el backend elige la plantilla correcta.
- `puede_generar` — si `true`, puedes generar directamente (paso 3).
- `datos_faltan[]` — lo que **BLOQUEA** (sin esto el certificado sería inválido). En RES060/RES093: sin
  demanda/superficie del CEE, sin SCOP, sin empresa instaladora, sin carpeta de Drive. En RES080: sin la
  comparativa energética (los dos CEE inicial y final en XML, o las emisiones manuales), sin carpeta.
- `avisos[]` — cosas LEVES que no impiden generar (p.ej. falta la ficha técnica → se genera sin ese
  anexo; método EPREL sin `url_eprel`; faltan fechas).
- `ya_generado` / `ya_firmado`.

### 2. Completar lo que falta y sea deducible (solo si `puede_generar=false`)
Para cada ítem de `datos_faltan`, intenta resolverlo con la misma lógica de `rellenar-expediente`
(leer CEE/XML, placas, RITE, facturas, presupuesto) y **escríbelo en Supabase**:
- **Demanda/superficie** → del CEE (`cee.cee_final` si está registrado; si no, `cee.cee_inicial`). El
  backend ya usa el inicial cuando no hay final válido, así que basta con que el CEE tenga los datos.
- **SCOP** (`instalacion.aerotermia_cal.scop` + `metodo_scop`) → del catálogo `public.aerotermia`, de la
  ficha técnica o de EPREL (valida el ηs y recalcula `2,5·(ηs+3%+0%)` si el método es EPREL).
- **ηi** (`caldera_antigua_cal.rendimiento_id`) → tramo por el año de la placa; nunca `default`.
- **Empresa instaladora** → asegurar el instalador vinculado en la FK del expediente/oportunidad.
- **Series / fechas / `cambio_acs`** → placas, facturas, RITE.
- **RES080** — comparativa energética: necesita los DOS CEE (`cee.cee_inicial` **y** `cee.cee_final` en
  XML, o `cee.emisiones_manual` si el CEE es manual). Sin eso el AE_TOTAL no existe y no se genera. La
  envolvente (aislamiento, ventanas: marca/modelo/U/g/permeabilidad) se lee de `documentacion.envolvente`
  (pestaña Envolvente); si falta, complétala ahí. El director redactor y las descripciones usan los
  valores estándar de BROKERGY.

Lo que **no** sea deducible NO lo inventes: `generar_cifo` lo dejará como incidencia (GRAVE si bloquea).
Vuelve a llamar a `estado_cifo` para confirmar que ya `puede_generar`.

**Anexos del SCOP (automático — no tienes que montarlos tú):** al generar, el backend adjunta y fusiona
TODO lo que justifica el SCOP:
- La **ficha técnica** de la aerotermia (cal y ACS). Si no está en el slot del expediente pero el modelo
  la tiene en el catálogo `aerotermia`, la **copia** a "3. FICHAS TÉCNICAS Y CERTIFICACIONES" y rellena el
  slot. Si el modelo no tiene FT ni en el expediente ni en el catálogo → aviso LEVE (se genera sin ella).
- Si `metodo_scop = 'eprel'` y hay `url_eprel`, **descarga** el Fiche y el Label de la API pública de
  EPREL, los guarda en Drive y los adjunta (idempotente por nombre). Si la descarga falla → aviso LEVE
  "adjuntar EPREL a mano".
- **Enriquece el catálogo**: si a la fila del modelo (`aerotermia`) le falta `eprel` o `ficha_tecnica` y
  ahora los tenemos, los rellena — así la **próxima vez** que se use ese modelo ya salen OK. El resultado
  de `generar_cifo` te dice en `catalogo_actualizado` qué filas se tocaron.

Solo tienes que asegurarte de que el equipo tenga su **modelo del catálogo** (`aerotermia_db_id`) y, si
el método es EPREL, la **`url_eprel`** en `instalacion.aerotermia_cal`. El resto lo monta el backend.

### 3. Generar
Llama a `generar_cifo(numero)`. El backend:
1. Valida (si hay bloqueantes → registra incidencia **GRAVE**, no genera, y te devuelve `blocking[]`).
2. Imprime el CIFO con el formato oficial de la app, **fusiona las fichas técnicas** al final.
3. Lo guarda en **"6. ANEXOS CAE"** como `<num> - Certificado CIFO.pdf` y enlaza
   `cert_cifo_drive_link`.
4. Registra como incidencia **LEVE** cada aviso pendiente (FT ausente, EPREL sin URL, fechas…).
5. NO toca `cert_cifo_signed_link` (eso lo escribe el flujo de firma).

Devuelve `link`, `tipologia`, `anexos[]`, `avisos[]` e `incidencias_leves`. Si ya hay un CIFO FIRMADO,
responde `needsConfirm`: confirma con el usuario y, solo si de verdad quiere regenerar (invalida la
firma), vuelve a llamar con `force:true`.

### 4. Informe final
Resume al usuario:
- Enlace al CIFO generado (el de "6. ANEXOS CAE") y su tipología.
- Fichas técnicas fusionadas (`anexos[]`).
- Incidencias LEVE registradas (con qué falta) y, si no se generó, las GRAVE con el motivo.
- Recuerda que la firma va por el flujo de la app (`/firmar-anexos/:id`): esta skill deja el CIFO
  **generado y enlazado**, listo para enviarlo a firmar; no lo envía por sí sola salvo que lo pidas.

## Reglas
- **Un solo modo**: la generación es SIEMPRE por `generar_cifo` (backend). No dibujes el PDF a mano ni
  con scripts locales — eso producía un formato distinto al de la app.
- **La app manda**: si un dato no está en Supabase, cárgalo primero; el CIFO imprime lo que hay.
- **Incidencias**: LEVE por defecto para lo que falte; el backend sube a GRAVE (y no genera) solo si es
  imposible un CIFO válido. No dupliques incidencias que ya escribe `generar_cifo`.
- **No regenerar sobre firmado** sin confirmación (`force:true`).
- **RES080** (Certificado Final de Obra): lo firma el director redactor de BROKERGY (no el instalador);
  necesita la comparativa energética de los DOS CEE (inicial y final en XML, o emisiones manuales) para
  el AE_TOTAL. La envolvente/ventanas salen de `documentacion.envolvente`. Comparte el mismo slot
  `cert_cifo_drive_link` que el CIFO (un expediente es RES060/093 O RES080, nunca ambos).
- **Idempotente**: regenerar sustituye el borrador y actualiza el slot.
