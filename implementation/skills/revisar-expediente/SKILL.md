---
name: revisar-expediente
description: >-
  Gestor de la cartera de expedientes CAE de BROKERGY: el agente que repasa los expedientes en curso y
  mueve cada uno a su siguiente acción. Úsalo cuando el usuario diga "revisa la cartera", "qué expedientes
  tenemos en curso", "repasa/gestiona los pendientes", "ponme al día de los expedientes", "empieza con los
  migrados sin revisar", o al empezar el día. Saca el panorama (MCP get_summary + list_pending), agrupa en
  paquetes de 5 por año de actuación + CCAA (criterio de lote), clasifica cada expediente (migrado sin
  revisar → auditar / faltan datos → rellenar / falta documento → generar / falta algo del cliente o
  instalador → pedir por WhatsApp) y ORQUESTA las skills adecuadas en orden: rellenar-expediente,
  auditar-expediente, migrar-expediente, generar-anexo-cifo, generar-anexo-fotografico y enviar-whatsapp.
  NO reimplementa lo que hacen esas skills: las invoca. No cierra estados ni firma; las acciones
  irreversibles (WhatsApp, generar) pasan por el visto bueno del usuario.
---

# Revisar expedientes — gestor de cartera CAE

Repasa los expedientes **activos (no finalizados)** y lleva cada uno a su siguiente paso, encadenando las
skills que ya existen y el MCP de BROKERGY. Es un ORQUESTADOR: decide *qué* skill/acción toca en cada
expediente y la ejecuta en orden; no rehace su trabajo.

- Proyecto Supabase: `app.brokergy` → project_id `okfeopwetlxdffrsbfqw`.
- **Skills que orquesta:** `rellenar-expediente`, `auditar-expediente`, `migrar-expediente`, `generar-anexo-cifo`, `generar-anexo-fotografico`, `enviar-whatsapp`.
- **MCP BROKERGY:** `get_summary`, `list_pending`, `get_expediente`, `datos_contacto_expediente`, `registrar_incidencia`, `listar_incidencias`.

## Principios
- **No dupliques skills, invócalas.** Rellenar rellena; auditar audita; generar genera; enviar-whatsapp comunica; esta skill decide y encadena.
- **Trabajo en PAQUETES DE 5.** La unidad de trabajo es un paquete de hasta 5 expedientes agrupados por **año de actuación** (`documentacion.fecha_fin_cifo`) + **CCAA de la instalación** — el mismo criterio del módulo de Lotes, para que al quedar aptos se puedan lotear directos.
- **Nunca pidas algo que ya tenemos.** Antes de generar cualquier petición al cliente/instalador hay que agotar app + Drive + origen de migración (ver vía B). Lo delega en `enviar-whatsapp`, que trae ese candado.
- **Acciones irreversibles con visto bueno.** WhatsApp y generación de documentos → primero enseñar qué se va a hacer y esperar OK.
- **El alcance facturado manda** (igual que en auditar): factura ↔ CIFO ↔ fotos deben describir lo mismo.

## Entrada
Sin argumentos → repasa la cartera activa, empezando (si el usuario no dice otra cosa) por los **migrados sin
revisar**. Con filtro ("los migrados", "los de X instalador", "los que espera el cliente", ">30 días", un
`numero_expediente`) → acota con los parámetros de `list_pending` (`estado`, `responsable`, `dias_minimos`,
`limit`) o ve directo a ese expediente.

## Procedimiento

### 0. Panorama y paquetes
1. `get_summary` → foto global. `list_pending` (con el filtro) → activos con `estado_actual`, `responsable_bloqueo`, `dias_en_estado_actual`, `campos_pendientes`.
1-bis. **Lee los checkpoints de continuación** (`expedientes.seguimiento->'checkpoint'`) de los expedientes en juego: `estado`, `siguiente_paso`, `responsable`, `falta`, `at`. Es la forma BARATA de saber por dónde nos quedamos y qué falta sin reanalizar nada (ahorra tokens). Prioriza y retoma desde ahí; solo profundiza en un expediente si no tiene checkpoint o está obsoleto.
2. Marca los **MIGRADOS**: `datos_calculo.origen` = `migracion_appsheet`|`migracion_xml`|lote, estado `DOC. COMPLETA APPSHEET`/`PENDIENTE REVISAR EXPTE`, o `seguimiento.migracion_appsheet`.
3. **Migrados sin revisar primero** (no auditados). Agrúpalos en **paquetes de 5 por año(`fecha_fin_cifo`) + CCAA(instalación)**. Si el año no está poblado (típico en AppSheet: solo fechas de CEE), es parte de lo que la revisión debe rellenar antes de poder cerrar el paquete.
4. Presenta los paquetes y la vía propuesta de cada expediente ANTES de actuar.

### 1. Clasificar cada expediente (árbol de decisión; la primera que encaje es la vía)
1. **¿Faltan DATOS en la app** (equipos, series, cliente, precio CAE, envolvente, instalador en FK)? → **vía C: RELLENAR** (auditar sin datos no cierra en APTO).
2. **¿MIGRADO y aún NO "DOC. COMPLETA"** (ni auditado)? → **vía A: AUDITAR**. Si ni está cargado/copiado a la app → antes **`migrar-expediente`**.
3. **¿Obra hecha pero faltan facturas / fotos del DESPUÉS / documento firmado del cliente o instalador?** → **vía B: PEDIR LO QUE FALTA** (solo tras verificar que no lo tenemos).
4. **¿Aceptado, obra AÚN pendiente, sin CEE inicial emitido?** → **vía B (variante CEE):** pide las fotos **opcional-CEE** (patios, vídeo, planos, fachada) que ayudan a emitir el CEE inicial.
5. **¿Datos y documentación completos, pero falta GENERAR un documento interno** (CIFO, Anexo Fotográfico)? → **vía D: GENERAR**.
6. **¿Bloquea el CERTIFICADOR** (visita/registro CEE)? → informa; si lleva muchos días, propón nudge.
7. **¿Completo y correcto?** → propón avanzar a `DOC. COMPLETA` y lotear (lo cierra el usuario en la app).

### 2. Ejecutar la vía

**A) AUDITAR** → invoca **`auditar-expediente`** con el `numero_expediente`. Lee el CIFO como fuente de verdad,
aplica la Matriz de Cruces + el cruce de ALCANCE (factura↔CIFO↔fotos) + los 3 niveles de foto, y — clave para
migrados — **antes de marcar nada como falta, agota el origen de migración** (OLD MIGRADOS y demás): lo que
esté ahí sin copiar es "no copiado en migración" (recuperable con rellenar), no un error ni una petición al
cliente. Registra incidencias en el MCP y da veredicto APTO/NO APTO.

**B) PEDIR LO QUE FALTA** → **primero verifica que NO lo tenemos**, en este orden, y quédate solo con lo que
NO aparezca en NINGUNA fuente:
- a. **Slots de la app** (`documentacion.*_link`, `documentacion.facturas[].drive_link`, `reforma_uploads`).
- b. **Carpeta de Drive del expediente** (`5. FACTURAS`, `12. DOCUMENTOS PARA CEE`, `6. ANEXOS CAE`, `7. LEGALIZACION RITE`, raíz…): si está pero sin enlazar → **no se pide**, se enlaza (vía C).
- c. **Origen de migración** (si es migrado): `RES060`/`RES080\<estado>`, `MAKE_EXPEDIENTES`, `…EXPEDIENTE CAE`, `RES060\12. OLD MIGRADOS A APP BROKERGY` / `RES080\08. OLD MIGRADOS A APP BROKERGY`.

`datos_contacto_expediente` da el "qué falta" del lifecycle, pero es punto de partida, no la verdad: contrástalo
con a/b/c. Aplica los **3 niveles de foto** (opcional-CEE solo si aún no hay CEE inicial; obligatorio final solo
si su concepto está facturado). Con lo que quede genuinamente ausente → invoca **`enviar-whatsapp`** (que
resuelve destinatario/contacto habilitado, redacta en tono BROKERGY, borrador → tu OK → enviar, un rol por
mensaje). Si falta de cliente Y de instalador, son dos mensajes.

**C) RELLENAR** → invoca **`rellenar-expediente`**. Completa Supabase desde Drive (incluida la reconciliación
con el origen de migración) y enlaza slots. Si el expediente iba a auditoría, encadena la **vía A**.

**D) GENERAR** → **`generar-anexo-cifo`** o **`generar-anexo-fotografico`** (o los tools MCP `generar_cifo` /
`generar_anexo_fotografico`). Deja el documento en su slot para revisar/firmar. Confirma antes de generar en lote.

### 3. Cerrar la vuelta
Por expediente: **estado / vía aplicada / resultado** (veredicto de auditoría, WhatsApp enviado y a quién,
documento generado, datos rellenados) y **la siguiente acción y de quién depende**. Cada sub-skill deja su
**checkpoint de continuación** en `seguimiento.checkpoint` (por dónde se quedó + qué falta + responsable);
asegúrate de que cada expediente tocado lo tiene actualizado (si una vía no lo dejó, escríbelo tú). Cierra con
el estado del paquete de 5: cuántos APTO / NO APTO, qué bloquea cada uno, y si el paquete ya está listo para
lotear — ese resumen ES el checkpoint del paquete para la próxima sesión.

## Reglas no negociables
- Orquesta, no reimplementes: usa `rellenar-` / `auditar-` / `migrar-expediente` / `generar-*` / `enviar-whatsapp` tal cual.
- **Nunca pidas algo que ya tenemos:** agota app + Drive + origen de migración antes de que `enviar-whatsapp` mande nada. Lo recuperable (está en Drive/OLD MIGRADOS) se enlaza internamente, no se pide.
- WhatsApp siempre por `enviar-whatsapp`: borrador → visto bueno → enviar, al contacto habilitado, un rol por mensaje.
- Paquetes de 5 por año(CIFO)+CCAA(instalación); migrados sin revisar primero. Loteable solo tras `DOC. COMPLETA`.
- Migrado sin "DOC. COMPLETA" → auditar (migrar antes si ni está cargado). Faltan datos → rellenar antes de auditar.
- No cierres estados ni firmes: eso lo hace el usuario en la app. Tú preparas, pides, generas (borrador) y avisas.
- Independencia por expediente: cada uno con su carpeta, su veredicto y su acción; no agregues datos entre actuaciones del mismo cliente.
- Salida = app (incidencias/estados) + chat (informe y siguiente acción). No generes informes Excel/PDF salvo que el usuario lo pida.
