---
name: migrar-expediente
description: >-
  Migra un expediente CAE de BROKERGY desde el sistema/carpeta antiguo (AppSheet + Drive de trabajo)
  a la APP nueva (app.brokergy / Supabase), dejándolo cargado y auditado. Úsalo cuando el usuario diga
  "migra el expediente NNN", "pásalo a la app", "migra a la nueva app", "carga el expediente en la app"
  o dé el nombre/cliente de un expediente para migrar. Hace: (0) identidad por NIF y reconciliación
  (placeholder/duplicado/ficha), (1) copia TODA la documentación a la carpeta de la app, (2) rellena
  Supabase desde el CIFO (equipos, SCOP, caldera+ηi, fechas, envolvente RES080, precio CAE, inversión,
  instalador en las FK), (3) enlaza los slots de documentos con el esquema REAL, (4) cruza la PLACA de
  la foto con el CIFO, (5) audita (invoca auditar-expediente) y (6) MUEVE la carpeta original a
  "OLD MIGRADOS" para que no aparezca como pendiente. NO es para rellenar un expediente que ya está
  bien en la app (eso es rellenar-expediente) ni solo auditar (eso es auditar-expediente).
---

# Migrar expediente CAE (AppSheet/Drive → app.brokergy)

Orquesta la migración completa de UN expediente y lo deja "listo para revisar/enviar" y archivado.
Trabaja SIEMPRE sobre un expediente concreto, de forma idempotente (no rehace lo ya correcto).

**Esta skill ENGLOBA las tres labores:** (a) **rellenar** (Fases 2–3: vuelca datos y enlaza documentos, como `rellenar-expediente`), (b) **auditar** (Fase 5: matriz de cruces + 6 patrones + asserts, como `auditar-expediente`) y (c) **registrar TODA anomalía como INCIDENCIA en el MCP de BROKERGY** (`registrar_incidencia`). Nada se corrige "a ojo": si algo no cuadra, se deja como incidencia abierta y como `pendiente`/`revisar` en `estado_relleno`.

- **Supabase**: proyecto `app.brokergy`, project_id `okfeopwetlxdffrsbfqw` (MCP `execute_sql`).
- **Drive MCP**: `search_files`, `copy_file`, `get_file_metadata` (solo crea/copia).
- **Shell local**: ambas rutas cuelgan de `Mi unidad\01. RD 36-2023 (CAES)\05. PRODUCCIÓN`. `cp` y **`mv` entre carpetas SÍ funcionan**; en la carpeta de la app (`01. BROKERGY-APP EXPEDIENTES`) borrar/renombrar in-situ NO ("Operation not permitted").
- **Read** de imágenes para leer placas.
- **Referencia maestra de campos y slots**: `05. PRODUCCIÓN\00. AUDITOR CAE\MAPA_DE_DATOS_CAE.md` (esquema real de `documentacion` + SOP). Consúltala ante cualquier duda de nombres de campo.

## Entrada
El usuario da `numero_expediente` (o el nombre del cliente / etiqueta de carpeta, p.ej. "FESSA FELIX").
⚠️ El nombre de la carpeta puede NO ser el cliente real (suele ser instalador/etiqueta): el titular real
es el **Cedente** del Anexo de Cesión / propietario del CIFO.

## Procedimiento (orden fijo)

### Fase 0 — Identidad y reconciliación (por NIF, NO por número)
La app **renumera**: el número no cruza entre BBDD/carpeta y app; **el NIF sí**.
1. Localiza el expediente en la app y su cliente actual. Si el cliente es un **placeholder** (sin NIF, nombre tipo "X LAS MUSAS"/"FESSA FELIX") o la ficha está mal tipificada, hay que corregir.
2. Saca el **NIF real** del titular del **CIFO/Anexo de Cesión** (Cedente).
3. `select id_cliente,... from clientes where dni = :nif`.
   - Si YA existe un cliente completo con ese NIF y el expediente apunta a un placeholder → **re-vincula** `expedientes.cliente_id` y `oportunidades.cliente_id` al real, y `clientes.id_expediente` al expediente; marca el placeholder para borrar.
   - Si no existe → rellena los datos del cliente (placeholder) desde el Anexo (nombre, apellidos, DNI, email, tlf, IBAN). **Nunca pises un `dni` distinto** (UNIQUE).
4. **Ficha/tipo**: el tipo se marca por `oportunidades.ficha` ('RES060'/'RES080'/'RES093'…). En RES080 `is_reforma=false`. Si el nº dice RES080 pero la ficha está en RES060 (o viceversa) → verifica con el CIFO/envolvente y **corrige** `ficha` (no a ciegas: RES080 tiene envolvente/ventanas; RES060 es solo aerotermia).
5. Renumerar `numero_expediente` en DB es seguro si procede (correlativo suele ser null).

### Fase 1 — Copiar TODA la documentación a la carpeta de la app
- Carpeta app del expediente: `oportunidades.datos_calculo->>'drive_folder_id'` (o búscala en `01. BROKERGY-APP EXPEDIENTES\<estado>\<num - cliente>`). Ya trae subcarpetas 0–12.
- Carpeta ORIGEN: `RES060\<estado>\...` o `RES080\<estado>\...`. La documentación buena suele estar además en la subcarpeta "…- EXPEDIENTE CAE" (el "En" final).
- Copia por carpeta con `cp -n` mapeando a la subcarpeta de la app, preservando anidados (CEE INICIAL/FINAL, FOTOS ANTES/DESPUES). Mapeo de nombres que cambian: `5. FACTURACIÓN`→`5. FACTURAS`; `7. LEGALIZACIÓN`→`7. LEGALIZACION RITE`; `24RESxxx_XX - EXPEDIENTE CAE`→`10. EXPEDIENTE CAE`; `DOCUMENTOS PARA CEE`→`12. DOCUMENTOS PARA CEE`; catastro (`*VJ*0001*`)→`12`; justificante titularidad→raíz.
- **Excluir basura**: `*.xlsm` (calculadoras), `PLANTILLA*`, `*.gdoc`/`*.docx` cuando exista el PDF firmado, `~$*`, `desktop.ini`, carpetas/paths `NO VALIDO`.
- Idempotente por título (`cp -n`). Ficheros grandes/volumen alto: puede tardar; reintenta el resto si un `cp` se corta.

### Fase 2 — Rellenar Supabase desde el CIFO (fuente de la verdad)
Lee el **CIFO** (RES060 = "Certificado de Instalación"; RES080 = "Certificado de Obra Final") COMPLETO.
- **Alcance**: RES060 = solo aerotermia (inversión = facturas de la aerotermia). RES080 = envolvente + instalaciones térmicas (suma TODAS las facturas).
- **Equipos** (`instalacion.aerotermia_cal`/`aerotermia_acs`): marca, modelo, nº serie (ud. exterior vs equipo ACS, **distintos**), SCOP. `aerotermia_db_id`: mapea a `public.aerotermia` por marca+modelo; si no existe, deja `null` y anota "alta catálogo pendiente con FT". **SCOP** = valor real del catálogo por modelo+emisor+clima cálido (validado contra CIFO); si no hay fila, guarda el SCOP del CIFO.
- **ACS**: termo eléctrico → `metodo_scop='termo_electrico'` (rend ~1,0); bomba calor ACS separada/acumulador → `'independiente'` (Anexo VI); depósito integrado en la aerotermia → `'conjunto'` (Anexo IV). `cambio_acs=true` si toca ACS.
- **Caldera antigua** (`caldera_antigua_cal/acs`): marca, modelo, serie y `rendimiento_id` por combustible+año de **placa** (NUNCA `default`): gasóleo≥1998 sin cond.→`oil_post98`; gas≥1998 sin cond. auto→`gas_post98_auto`; etc. Condensación/no según modelo real.
- **`tipo_emisor`**: suelo_radiante (35°) / radiadores_convencionales (55°). Verifícalo con RITE/factura; SCOP alto (~6) → suelo radiante; ~3–4,x → radiadores. Si dudas, ponlo y marca "revisar con RITE".
- **Fechas CIFO** (`documentacion.fecha_inicio_cifo/fecha_fin_cifo` y `expedientes.fecha_fin_cifo`): inicio = la MÁS ANTIGUA de {facturas, pruebas RITE}; fin = la MÁS RECIENTE. Deben cuadrar con el CIFO; si una factura es anterior al inicio declarado → incidencia (patrón verificador #1).
- **Cliente + Precio CAE** (Anexo de Cesión, cláusula Cuarta): `instalacion.economico_override.cae_client_rate` en **€/MWh** (si el anexo da €/kWh, ×1000).
- **Instalador** (del CIFO): vincúlalo en `expedientes.instalador_asociado_id` Y `oportunidades.instalador_asociado_id` (FK reales) + `instalacion.instalador_id`. Créalo en `prescriptores` si no existe.
- **Facturas**: una entrada por factura en `documentacion.facturas[]` (numero, fecha, importe_sin_iva=base, concepto, drive_link) y `datos_calculo.presupuesto` = Σ bases s/IVA. OCR si están escaneadas.
- **RES080 · Envolvente** (`documentacion.envolvente`): ventanas (marco/cristal marca-modelo-transmitancias-permeabilidad) y cerramientos (aislamiento muros/cubierta: tipo, material, espesor, λ) del CIFO.
- Merge JSON con `||` y merge anidado por sub-objeto; no machacar `drive_folder_id`, `origen`, `result`.

### Fase 3 — Enlazar los slots de documentos (esquema REAL — ver MAPA §Anexo)
Usa EXACTAMENTE estas claves (NO inventar). Enlaza el `viewUrl` del PDF **ya copiado a la carpeta de la app** (búscalo por `createdTime > hoy` y su `parentId` = subcarpeta app):
- `cert_cifo_signed_link`, `anexo_cesion_signed_link`, `anexo_i_signed_link`, `cert_rite_signed_link`, `anexo_fotografico_signed_link`, `ficha_res060_signed_link`, `justificante_titularidad_link`.
- RES060 FT: `ft_aerotermia_cal_link`/`_id`, `ft_aerotermia_acs_link`/`_id`.
- **Facturas**: `documentacion.facturas[].drive_link` (una por factura).
- **CEE = NO es slot de enlace** → fechas `fecha_visita/firma/registro_cee_inicial` y `..._final`.
- **RES080 · fichas técnicas en `res080_attachments`** (array), no en `ft_*`: items `{id:'aerotermia'|'rite'|'marco'|'cristal'|'aislamiento', file:<link>, label, required}`. Si la FT no corresponde al modelo instalado → `file:null` + incidencia.

### Fase 4 — Chequeo PLACA ↔ CIFO
Abre la foto de la placa (`2. FOTOS Y VIDEOS/DESPUES` o subcarpeta del equipo) y lee **modelo y nº de serie**. Deben COINCIDIR con el CIFO (y con la factura). Si la FT archivada es de otro modelo → incidencia (falta FT correcta). Denominación literal (sufijos de kit) casi idéntica = LEVE.

### Fase 5 — Auditar y REGISTRAR INCIDENCIAS en el MCP (obligatorio)
Aplica la lógica de `auditar-expediente` sobre lo migrado y **da de alta en el MCP de BROKERGY toda anomalía**. Es parte inseparable de la migración: migrar sin auditar+registrar = migración incompleta.
1. **Salud + idempotencia del MCP**: `get_expediente(numero)` primero. Si responde "sesión expiró"/caído → NO registres a ciegas: vuelca los hallazgos a `INCIDENCIAS_<num>_pendientes.md` en la carpeta del expediente y avisa de reconectar el conector. `listar_incidencias(numero, solo_abiertas=true)` para no duplicar incidencias ya abiertas.
2. **Comprobaciones** (todas): matriz de cruces (ref. catastral, UTM, marca/modelo, **nº serie ACS ≠ calefacción** [assert duro], SCOP cal/dhw a Tª correcta, Dcal/DACS, AETOTAL, inversión), 6 patrones del verificador, firmas por documento, subvención, **placa↔CIFO**, slots enlazados, instalador en las 2 FK, caldera antigua ηi, y **no sobrefinanciación** (CAE+subvención ≤ inversión; si CAE > inversión → incidencia).
3. **Registro**: por cada hallazgo → `registrar_incidencia(numero, texto="qué está mal + acción correctiva", severidad=GRAVE|LEVE, procedencia=AGENTE_IA)`. ERROR→GRAVE, WARNING→LEVE. Refleja lo mismo en `estado_relleno.incidencias_detectadas`.
4. **Veredicto**: **APTO** solo si 0 GRAVE abiertas **y** `estado_relleno` sin `pendiente`/`revisar`; si no, **NO APTO** + lista priorizada (GRAVE primero) en el chat. La incidencia la cierra el usuario en la app tras subsanar.

### Fase 6 — Archivar (mover la carpeta original)
`mv` la carpeta ORIGEN a "OLD MIGRADOS" para que no aparezca como pendiente:
- RES060 → `RES060\12. OLD MIGRADOS A APP BROKERGY\`
- RES080 → `RES080\08. OLD MIGRADOS A APP BROKERGY\` (créala si no existe)
La app REGENERA el nombre de la carpeta de la app al avanzar de estado (no hace falta renombrar a mano).

### Estado incremental
Escribe `expedientes.seguimiento.estado_relleno`: qué se rellenó (campo→valor→fuente), `doc_slots_enlazados`, `placa_cifo_ok`, `incidencias_detectadas`, `pendientes`. Al reaportar, procesa solo lo nuevo.

## Reglas no negociables
- Reconciliar **por NIF** (la app renumera). Titular = Cedente, no la etiqueta de carpeta.
- Placeholder vacío + cliente real por NIF → re-vincular al real (no rellenar el placeholder). Duplicado por DNI → re-vincular.
- **Serie/modelo ACS ≠ unidad de calefacción** (assert duro: 0 filas). SCOP real del catálogo (validado contra CIFO). ηi por placa/combustible, nunca `default`.
- **Slots con nombres EXACTOS**; CEE por fechas; RES080 FT en `res080_attachments`. Enlaza el fichero **ya en la carpeta de la app**.
- **Placa foto = CIFO** (modelo + serie). Factura(s): Σ bases s/IVA = inversión; enlazar cada una.
- **No sobrefinanciación** (CAE+subvención ≤ inversión).
- **Mover la carpeta original a OLD MIGRADOS** al terminar (paso final).
- Idempotencia por `numero_expediente`. No tocar `datos_calculo.result` (lo calcula la app).
- Drive: crear/copiar/mover sí; borrar/renombrar in-situ en la carpeta de la app, NO (repórtalo como pendiente para el usuario/app).

## Salida
Informe breve por fases: identidad (re-vinculación), datos rellenados, documentos copiados + slots enlazados, chequeo placa↔CIFO, veredicto de auditoría (APTO/NO APTO + incidencias priorizadas) y confirmación de archivado en OLD MIGRADOS.
