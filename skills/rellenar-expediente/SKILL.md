---
name: rellenar-expediente
description: "Rellena en Supabase un expediente CAE de BROKERGY a partir de su documentación en Drive (facturas, cesión, RITE, CIFO, placas), enlaza slots y devuelve informe hecho/pendiente."
---

# Rellenar expediente CAE (asistente de datos)

Rellena en Supabase todos los campos que se puedan deducir de la documentación de un expediente, deja
trazabilidad de qué se hizo y qué falta, y al reaportar solo procesa lo nuevo.

**Referencia maestra:** `05. PRODUCCIÓN\00. AUDITOR CAE\MAPA_DE_DATOS_CAE.md` (campo ↔ documento ↔ subcarpeta ↔ regla). Consúltala ante cualquier duda de mapeo.

- Proyecto Supabase: `app.brokergy` → project_id `okfeopwetlxdffrsbfqw`.
- Herramientas: MCP de Supabase (`execute_sql`) y MCP de Google Drive (`search_files`, `read_file_content`, `get_file_metadata`, `copy_file`). ⚠️ **El MCP de Drive solo COPIA y CREA: no mueve ni borra.** Se pueden rellenar slots/copiar a su subcarpeta, pero NO limpiar duplicados/basura ni mover lo descolocado (eso lo hace la app o el usuario; repórtalo como pendiente).
- Principio: **datos → Supabase directo** (`expedientes`, `oportunidades`, **`clientes`**). **Documentos**: este skill SÍ reconcilia el Drive — copia a la carpeta de la app (en `01. BROKERGY-APP EXPEDIENTES`) los documentos del expediente original (en `RES080`/`RES060`) que falten (ver paso 2) **y los enlaza en sus slots** (paso 4, bloque "Slots de documentos").

## ⚠️ ALCANCE POR TIPOLOGÍA (regla de inversión — NO equivocarse)
- **RES060 = SOLO aerotermia** (sustitución del generador). La inversión = facturas de la aerotermia.
- **RES080 = AISLAMIENTO + INSTALACIONES TÉRMICAS**. La inversión incluye **TODO**: envolvente (ventanas, aislamiento de fachada/cubierta, trasdosados) **Y** las instalaciones térmicas asociadas (aerotermia, bomba de calor, suelo radiante, etc.). **NUNCA** cargues en un RES080 solo las facturas de la envolvente: suma también las de la aerotermia/instalación térmica del mismo cliente/vivienda.
- En un RES080 el "principio de independencia" NO separa envolvente de la instalación térmica del mismo inmueble: ambas son la misma actuación y se suman a la inversión (control de no-sobrefinanciación sobre el total). El **RITE** de la instalación térmica SÍ está en alcance (alimenta fechas inicio/fin).
- Caso de referencia: **26RES080_54 (Esther López Perona)** → ventanas + aislamiento (lana, pladur) + aerotermia Toshiba Estía Gamma 65 + suelo radiante = **20.060,16 € s/IVA** (7 facturas).

## Entrada
El usuario indica el expediente por `numero_expediente` (ej. `25RES060_65`) o por `drive_folder_id`.
Si no lo da, pídelo en una línea. Si no se deduce del nombre, confirma si es **RES060** (solo aerotermia) o **RES080** (aislamiento + instalaciones térmicas).

## Procedimiento

### 1. Resolver el expediente y leer el estado incremental
```sql
select e.id exp_id, e.numero_expediente, e.estado, e.seguimiento->'estado_relleno' estado_relleno,
       e.cliente_id, e.instalador_asociado_id,
       o.id op_id, o.instalador_asociado_id op_instalador, o.datos_calculo->>'drive_folder_id' folder_id,
       e.instalacion, e.documentacion
from expedientes e join oportunidades o on o.id=e.oportunidad_id
where e.numero_expediente = :num;
```
Lee `seguimiento.estado_relleno` (ver MAPA_DE_DATOS §5). Los campos en `ok` **no se reprocesan** salvo que haya un documento más reciente que `ultima_revision`. Procesa solo `pendiente`, `revisar` o lo nuevo.

### 2. Carpeta de la app + reconciliar con el expediente ORIGINAL (copiar lo que falte)

**2.1 Subcarpetas de la app (destino).** Lista con `search_files` (`parentId = '<drive_folder_id>' and mimeType = 'application/vnd.google-apps.folder'`) y guarda el `id` de cada subcarpeta destino.

**2.2 Localizar el expediente ORIGINAL (fuente de los documentos).** Los expedientes nuevos de la app viven en `05. PRODUCCIÓN\01. BROKERGY-APP EXPEDIENTES\…`, pero la documentación original suele estar en `05. PRODUCCIÓN\RES080\<estado>\…` (si RES080) o `05. PRODUCCIÓN\RES060\<estado>\…` (si RES060), dentro de una subcarpeta de estado (`03. DOC COMPLETA`, `01. EN CURSO`, …). Búscala con `search_files` por número de expediente: `title contains '<num_expediente>' and mimeType = 'application/vnd.google-apps.folder'`.
- ⚠️ **En expedientes YA EXISTENTES, casi toda la documentación buena (CIFO, CEE, anexos, RITE, factura) está en la subcarpeta `10. EXPEDIENTE CAE`** (el "En" final). Míra ahí PRIMERO; no asumas que está repartida por las subcarpetas 0–9 (pueden estar a la vez en su slot y duplicadas en "10. EXPEDIENTE CAE").
- Puede haber **duplicados/variantes**: sufijos (`(DIMAS)`, ` - <APELLIDOS>`), copias en `MAKE_EXPEDIENTES` (estructura antigua), carpetas vacías o de plantilla. **Elige la que CONTENGA la documentación real** (CEE, facturas, anexos firmados, RITE): verifica con `search_files parentId=...` antes de copiar.
- ⚠️ El original puede estar **REPARTIDO**: facturas/RITE/CEE/fotos/presupuesto en la carpeta de `RES080`/`RES060`, pero los **anexos generados** (Anexo Cesión `_fdo`, Certificado de Fin de Obra, Anexo I) en `MAKE_EXPEDIENTES`. Mira en ambos sitios. Si hay ambigüedad real, pregunta.

**2.3 Copiar lo que falte → carpeta de la app.** Por cada documento del original, si NO existe ya en su subcarpeta destino (match por título), cópialo con `copy_file(fileId, parentId=<subcarpeta destino>)`:
- Mapeo por tipo → subcarpeta: facturas→`5. FACTURAS`; presupuesto/oferta→`0. PRESUPUESTO`; fotos/vídeos→`2. FOTOS Y VIDEOS` (a `ANTES`/`DESPUES` si las hay); FT/certificaciones→`3. FICHAS TÉCNICAS Y CERTIFICACIONES`; CEE/`.xml`/`.cex`→`1. CEE` (`CEE INICIAL`/`CEE FINAL`); anexos firmados/CIFO/Ficha/Cesión/Certificado fin de obra→`6. ANEXOS CAE`; RITE/memoria RITE→`7. LEGALIZACION RITE`; resto→`4. OTRA DOCUMENTACION`.
- **Idempotente**: si ya hay un fichero con ese título en destino, salta (no dupliques). Los `.xml` del CEE pueden estar ya por la migración → saltar.
- **No copies basura**: calculadoras `.xlsm`, plantillas (`PLANTILLA*`), Docs editables cuando exista su PDF firmado (`_fdo`), ficheros de otros clientes, subcarpetas plantilla (`24RES0XX_XX …`).
- Un fichero copiado dentro de una carpeta de la app **hereda** su compartición (MAPA §4.2) → el visor lo abre. Apunta el `viewUrl` del **fichero NUEVO** (el de la carpeta de la app) como `drive_link` en Supabase, nunca el del original.
- (Alternativa local: ambas rutas cuelgan de `C:\Users\Usuario\Mi unidad\…`; se podría `Copy-Item` y dejar que Drive sincronice, pero `copy_file` da el id/enlace al instante y es lo preferido. Para muchos ficheros, delega la copia a un subagente y que devuelva un manifiesto con los `newFileId`/`viewUrl`.)

**2.4 Documentos a localizar y leer** (ya en la carpeta de la app reconciliada):
- ⚠️ **Barre TODA la carpeta del expediente, incluida la RAÍZ y `10. EXPEDIENTE CAE`** (no solo las subcarpetas esperadas): hay documentos que cuelgan de la raíz (p.ej. el Certificado de Titularidad Bancaria) y, en expedientes existentes, el grueso en `10. EXPEDIENTE CAE`.
- **Facturas** → `5. FACTURAS` y/o `5. FACTURACIÓN` (¡revisa ambas!).
- **Presupuesto** → `0. PRESUPUESTO` *(necesario para el cruce ACS y como posible fecha de inicio)*
- **Fotos de placas** → buscar en **DOS** carpetas: `2. FOTOS Y VIDEOS` (subcarpetas `ANTES`/`DESPUES`) **y** `12. DOCUMENTOS PARA CEE`.
- **Certificado RITE** → `7. LEGALIZACION RITE` (de la instalación térmica; en RES080 también está en alcance).
- **Anexo de Cesión / CIFO / Certificado Fin de Obra / anexos** → `6. ANEXOS CAE`, `10. EXPEDIENTE CAE`
- **CEE / XML** → `1. CEE` (subcarpetas `CEE INICIAL` y `CEE FINAL`; el `*_informeMedidasMejora.pdf` trae INSTALACIONES TÉRMICAS y ANÁLISIS TÉCNICO por servicio)
- **FT de equipos / materiales** → `3. FICHAS TÉCNICAS Y CERTIFICACIONES`

### 3. Extraer datos (lee cada documento con `read_file_content`)

> **El CIFO (Certificado de Instalación / Fin de Obra) es la FUENTE DE LA VERDAD para equipos, SCOP, fechas y comparativa existente↔nueva.** Léelo SIEMPRE y completo (incluido su Anexo I y la FT adjunta). El mapeo al catálogo (`aerotermia_db_id`) NO sustituye al CIFO: si catálogo ≠ CIFO, manda el CIFO y el catálogo se corrige.

**a) Facturas** (`5. FACTURAS` / `5. FACTURACIÓN`): por cada PDF, saca `numero_factura`, `fecha_factura` (ISO), `importe_sin_iva` (base, no total). Cuidado con anticipos: la inversión es la suma de **líneas de obra**, no de los totales. No confundas facturas con justificantes de transferencia/pago.
- ⚠️ **La fecha se lee DD-MM-AA (formato español), y el año de dos cifras es 20AA.** `06-09-26` es el **6 de septiembre de 2026** (`2026-09-06`), NO el 26 de septiembre de 2006. El primer grupo es el DÍA, nunca el año. Si la fecha que sacas cae en un año anterior al del expediente, la has leído del revés: vuelve al PDF. (Caso real: factura 74-26 de 26RES080_69, que entró como 2006-09-26 y disparó una incidencia falsa de "factura anterior al CEE inicial".)
- ⚠️ **NIF del emisor y del cliente: el DNI se imprime a menudo sin el cero de la izquierda.** `N.I.F. 1.234.567-L` en la factura y `01234567L` en la base son **el mismo documento**: compara rellenando a 8 cifras y no marques `revisar` por un cero. (CIF `B…` y NIE `X/Y/Z…` no llevan relleno.)
- **Unidades terminales (radiadores, suelo radiante, fancoils):** en **RES060/RES093/TER100 NO pueden aparecer facturadas** — esas fichas solo sustituyen el generador y el emisor existente es el que fija la Tª de impulsión y el SCOP; si aparecen, marca **revisar** y avisa (la obra no encaja en la ficha, o la factura debe decir que es solo conexión/adaptación). En **RES080 sí pueden ir**, pero anota sus **m²**: tienen que cubrir la superficie sobre la que se justifica el ahorro (S del CEE). Menos metros que la S justificada → **revisar** (26RES080_69: 119 m² de suelo radiante contra 122 m² justificados).
- **Selección de facturas según tipología (ver bloque ALCANCE arriba):**
  - RES060 → solo las facturas de la aerotermia.
  - RES080 → **todas**: envolvente (ventanas, aislamiento, trasdosados) **+** instalaciones térmicas (aerotermia, suelo radiante, bomba de calor).
- Construye:
  - `documentacion.facturas` = `[{numero_factura, fecha_factura, importe_sin_iva, concepto, drive_link}]`
  - `datos_calculo.presupuesto` = Σ `importe_sin_iva`.
- Si el `presupuesto` previo (migrado/oferta) no cuadra con la Σ de bases de factura → ajústalo a la factura y marca **revisar** (la inversión real es la factura; afecta al control de no-sobrefinanciación).
- ⚠️ **Hay que archivar y presentar TODAS las facturas que existan** (anticipos incluidos). Que una factura exista (consta en la app/contabilidad) pero NO esté archivada en `5. FACTURAS` ni enlazada en su slot es **GRAVE** (bloquea el envío), no un simple aviso. Solo es admisible que falte si esa factura realmente no existe todavía.
- **Guarda CADA factura en su slot de la app**: por cada factura, además de `numero_factura`/`fecha_factura`/`importe_sin_iva`/`concepto`, rellena su **`drive_link`** dentro de `documentacion.facturas[]` con el enlace del PDF (el de la carpeta de la app). Una entrada por factura; empareja por `numero_factura`. Sin `drive_link`, la app muestra la factura como NO cargada aunque el PDF exista en `5. FACTURAS`.

**b) Certificado RITE** (`7. LEGALIZACION RITE`): extrae la **fecha de pruebas** (apartado "PRUEBAS REALIZADAS CON RESULTADO SATISFACTORIO"). Esa fecha alimenta Inicio/Fin del CIFO (paso d) y `documentacion.fecha_pruebas_cert_instalacion`. **Extrae también la FECHA DE FIRMA del certificado de instalación → `documentacion.fecha_firma_cert_instalacion`: es la fecha de la FIRMA ELECTRÓNICA que figura en el propio documento** (sello/registro de la firma digital, p.ej. la línea eDICE "Firmado por … con código y fecha de registro NNNN - DD/MM/AAAA hh:mm" o el panel de firma del PDF). Formato ISO `AAAA-MM-DD`. ⚠️ NO la confundas con la fecha de pruebas (suele ser posterior): pruebas = ejecución; firma = registro/firma del certificado. Si el PDF está aplanado y no muestra fecha de firma legible → déjala en `pendiente` (no inventes). Apunta `cert_rite_drive_link` y `memoria_rite_pdf_link`. La Memoria Técnica del RITE da marca/modelo/potencias del generador, la **potencia nominal** (`instalacion.potencia_bomba`) y el tipo de emisor (verifícalo contra el CIFO).

**c) Nº de serie y equipos** (CIFO/Certificado Fin de Obra + fotos de placas en `2. FOTOS Y VIDEOS` y `12. DOCUMENTOS PARA CEE`): lee la comparativa del CIFO y las imágenes (visión/OCR) y rellena:
- `instalacion.caldera_antigua_cal.numero_serie` / `.marca` / `.modelo`
- `instalacion.aerotermia_cal.numero_serie` (ud. exterior) / `.marca` / `.modelo`
- `instalacion.aerotermia_acs.numero_serie` / `.marca` / `.modelo`
- `instalacion.aerotermia_cal/acs.aerotermia_db_id`: mapea marca+modelo a `public.aerotermia` (`select id,marca,modelo_comercial from aerotermia where marca ilike ... and modelo_comercial ilike ...`).
Si una placa no existe o no es legible → marca el campo como **pendiente** con motivo. **Nunca inventes un número de serie.**

> ⚠️ **El equipo de ACS y el de calefacción son DISTINTOS: no compartas datos entre ellos.**
> - **Nº de serie ACS ≠ nº de serie de la unidad exterior de calefacción.** El CIFO da los dos por separado (en 25RES060_57: ud. exterior `8D00250218050019` vs equipo ACS `GKOGXLE0G0031R36UYS5`). No copies el de calefacción en el bloque ACS.
> - **El modelo de ACS sale del CIFO/FT, no del nombre del catálogo.** En 25RES060_57 el CIFO dice `BOMBA CALOR ACS LASIAN 150 S2` (FT `ACUM. ACS CON BOMBA DE CALOR 150 S2`); se había mapeado a una fila errónea (`db_id 90 'LASIAN ATHERIA 150 S2'`).

> **Jerarquía de fuente para marca/modelo/nº de serie del equipo** (de mayor a menor prioridad):
> 1. **Fotos finales** (placa de la unidad, en `2. FOTOS Y VIDEOS/DESPUES` o `12. DOCUMENTOS PARA CEE`): la verdad sobre el terreno. Si existen, se cogen de aquí.
> 2. **Certificado de Fin de Obra / CIFO y factura**: el modelo/serie debe **coincidir** con la foto final. Si **no coincide → WARNING** (`revisar`, indicando ambos valores). Ojo unidades DUO: el certificado puede dar dos nº de serie (ud. exterior vs equipo ACS); confírmalos con placa.
> 3. **Presupuesto** (`0. PRESUPUESTO`): si el expediente está **EN CURSO** y aún no hay fotos finales ni factura, se coge marca/modelo del presupuesto, **provisional** (`numero_serie: pendiente`, a re-contrastar).
>
> El **nº de serie** solo sale de placa, certificado o factura (nunca del presupuesto): si no hay ninguno → `pendiente`.

> **Validar el catálogo contra el CIFO (no al revés).** Tras mapear `aerotermia_db_id`, COMPARA los valores de la fila de catálogo (modelo, SCOP, `deposito_acs_incluido`, FT) con lo que dice el CIFO/FT. Si difieren (p.ej. SCOPdhw catálogo 3,1 vs CIFO 3,98, o modelo con coletilla 'ATHERIA' que no aparece en el CIFO), **la fila de catálogo está mal**: no la uses tal cual, crea/duplica la entrada correcta y avisa en el chat. Caso 25RES060_57: `db_id 90` tenía SCOPdhw 3,1 y `deposito_acs_incluido=true` cuando el CIFO da 3,98 por Anexo VI (no conjunto).

> **Modelo ausente del catálogo `public.aerotermia`:** si el equipo (aerotermia o termo ACS) no está, **añádelo**: 1) inserta la marca en `public.aerotermia_marcas` si no existe (FK `fk_aerotermia_marcas` sobre `aerotermia.marca`); 2) inserta la fila en `public.aerotermia` con los SCOP de la FT/EN; 3) **HEREDA la FT de la fila hermana** (ver abajo) y solo si de verdad no existe, genera/sube una y enlázala en `aerotermia.ficha_tecnica`; 4) deja `is_validated=false` hasta confirmar con FT oficial. Relación útil: **ηacs = SCOPdhw / 2,5 × 100** (verificado con filas Toshiba). No mapees a un modelo "parecido" — antes de tener fila válida, `db_id`/`scop` quedan **revisar/pendiente**.
>
> ⚠️ **ANTES de decir "falta la ficha técnica", BÚSCALA EN EL CATÁLOGO.** Las FT de Panasonic, Daikin, Toshiba y compañía son **de familia**, no de par exacto: un mismo PDF cubre todas las combinaciones exterior+interior de una serie y potencia, y suele estar YA enlazado en las filas hermanas. Declarar "falta FT" sin mirar ahí genera una incidencia GRAVE falsa y le manda al instalador a buscar un documento que ya tienes.
> ```sql
> -- fila hermana = misma marca + misma familia/serie + misma potencia
> select id, modelo_ud_exterior, modelo_ud_interior, ficha_tecnica, eprel
> from aerotermia
> where marca = :marca
>   and (modelo_ud_exterior = :ext or modelo_comercial ilike '%'||:serie||'%')
>   and nullif(ficha_tecnica,'') is not null
> order by (modelo_ud_exterior = :ext) desc, id;
> ```
> Si devuelve algo, **copia `ficha_tecnica` y `eprel` a la fila nueva** en el propio INSERT y no registres incidencia por la FT. Lo que sí puede faltar de verdad es el **PDF EPREL** del par exacto (columna `eprel`, casi siempre vacía): esa es la incidencia real, y es **LEVE**, no GRAVE. Solo es GRAVE si no hay FT en ninguna fila de la familia.
> *Fallo real 26RES060_138 (07/08/2026): se creó la fila 523 (PANASONIC WH-WDG12ME5 + WH-SDC0916M3E5) y se registró GRAVE "falta FT", cuando las filas 127, 446, 449, 451-453 y 460-462 de la misma familia ya apuntaban todas al mismo PDF de FT.*

**c-quater) Rendimiento de la caldera antigua (ηi).** Rellena `instalacion.caldera_antigua_cal.rendimiento_id` (y `caldera_antigua_acs.rendimiento_id`) — **NO lo dejes en `default` (0,92)**. El **AÑO** que decide el tramo SIEMPRE es el de la **PLACA DE FABRICACIÓN** del equipo (marcado CE + año, p.ej. `CE 0099 ★★★ 2005`), **NO** el año de construcción del edificio del CEE (suelen diferir). Fuente del año/identificación por prioridad: (1) **foto de la placa de fabricación** (marca, modelo, nº serie, año CE); (2) si no hay placa, **busca el modelo en internet** para datar el año de fabricación/comercialización; (3) **CIFO** existente (coge su ηi y descripción). El **CEE inicial** da marca/modelo/combustible pero **NO** el año real de fabricación.
- ⚠️ **Condensación vs SIN condensación: por el modelo/placa, NUNCA por defecto.** Determina si la caldera antigua es de condensación o convencional/atmosférica a partir del modelo real (placa/foto), no asumas condensación. Es un dato crítico: cambia el tramo de ηi y, con ello, el AETOTAL. Caso 25RES060_57: ROCA VICTORIA 20/20F (placa 07/2007) es **atmosférica/sin condensación** → `gas_post98_auto` (ηi 0,73); marcarla "de condensación" habría inflado el rendimiento base y falseado el ahorro.
- Enum disponible: `oil_pre85`, `oil_85_97`, `oil_post98` (gasóleo ≥1998 sin condensación), `oil_cond` (gasóleo condensación), `gas_post98_auto` (gas ≥1998 sin condensación, encendido automático, ηi≈0,73), `gas_post98_cond_auto` (gas condensación), `solid_man_no_cal`, `electric`. ⚠️ Verifica el combustible: si CEE/RITE dicen **gasóleo** pero el CIFO lo clasificó como **gas** (o al revés), usa el del CIFO y deja **revisar** con la discrepancia.

**c-ter) ¿La actuación incluye ACS, o es SOLO calefacción?** ⚠️ **COMPROBAR SIEMPRE antes de fijar el SCOPdhw.** No te fíes solo de `cambio_acs`; verifícalo con TRES fuentes y deja constancia:
1. **Presupuesto** (`0. PRESUPUESTO`) y **Factura** (`5. FACTURAS`): ¿aparece un **acumulador / interacumulador / depósito de ACS / agua caliente sanitaria**? → hay ACS. Si solo hay **depósito de inercia** (buffer de calefacción), tuberías aerotermia↔inercia y desmontaje de caldera → **solo calefacción**. (Ojo: "depósito de inercia" ≠ "acumulador ACS".)
2. **CEE inicial** (`1. CEE/CEE INICIAL`, `*_informeMedidasMejora.pdf`): mira INSTALACIONES TÉRMICAS. Si la aerotermia figura **solo como "Generador de calefacción"** y no como generador de ACS → solo calefacción. En el ANÁLISIS TÉCNICO, un ahorro de ACS nulo o **negativo en energía primaria** confirma que el ACS no se mejora.
3. **Certificado de Fin de Obra / CIFO**: confirma qué servicios declara (un equipo DUO con su tabla ACS rellena → hay ACS).

Decisión:
- **Solo calefacción** → `instalacion.cambio_acs = false`; `scopAcs`/SCOPdhw = **N/A** (no es error ni revisar aunque el catálogo tenga `scop_dhw = 0`); no exijas FT de ACS ni Anexo IV/VI de ACS.
- **Calefacción + ACS** → `cambio_acs = true`; aplica el SCOPdhw de c-bis y exige su justificación (FT con SCOPdhw o cálculo del Anexo IV/VI de la ficha RES060).

**c-bis) SCOP REAL desde el catálogo — ES EL MOTIVO DE LA MIGRACIÓN.** El SCOP NO se copia del valor viejo NI del certificado registrado: la migración existe precisamente para corregir SCOP mal elegidos. Se coge el **REAL** desde `public.aerotermia` por **modelo + emisor + clima**, validado contra el CIFO.
- Clima = **cálido** (todas las zonas de BROKERGY; la zona la resuelve la app desde la ref. catastral).
- **Emisor: verifícalo contra RITE + factura, NO contra el dato guardado.** Si el **RITE** indica radiadores (tabla "RESUMEN DE CARGAS TÉRMICAS" con emisor `RADIADOR …`) o la factura trae radiadores/toalleros/limpieza de circuito de radiadores → `tipo_emisor = radiadores_convencionales`. Si hay suelo radiante → `suelo_radiante`. **Si el emisor guardado no cuadra con RITE/factura, CORRÍGELO** (no solo "revisar"). Tª impulsión: `suelo_radiante` → columna **35** · `radiadores_convencionales` → columna **55**.
- **Calefacción:** `instalacion.aerotermia_cal.scop` = `scop_cal_calido_{35|55}` del modelo + `metodo_scop='catalogo'`. Si está vacío/0 → cae a `scop_cal_medio_{35|55}` y marca **revisar** (hueco de catálogo).
- **`metodo_scop` del ACS lo decide el CIFO (su Anexo), no el flag del catálogo.** Lee en el Anexo del CIFO qué método usó: **Anexo VI / Caso 3 (depósito NO suministrado como conjunto)** → `independiente`; **Anexo IV (depósito integrado/conjunto)** → `conjunto`. Si el flag del catálogo (`deposito_acs_incluido`) contradice al CIFO, manda el CIFO y deja **revisar** el catálogo.
- **ACS con acumulador/termo SEPARADO → Anexo VI (NO uses `scop_dhw_*`).** Marca **Acumulador ACS** + `instalacion.aerotermia_acs.metodo_scop='independiente'`. La app ya está programada para calcular sola `SCOPdhw = COP_A7/55 × Fc(zona)` usando el campo **`cop_a7_55`** del catálogo. **No hardcodees** el valor de `aerotermia_acs.scop`. (En 25RES060_57 el CIFO usó Anexo VI: COP14 3,58 × Fc 1,113 = SCOPdhw **3,98**.)
- **ACS por depósito INTEGRADO en la unidad interior de la aerotermia (hidrokit con acumulador, p.ej. Daikin Altherma EBVX/ETVX 180/230 L) → DEPÓSITO CONJUNTO (Anexo IV).** Pon `instalacion.aerotermia_acs.metodo_scop='conjunto'` y `aerotermia_acs.scop = scop_dhw_calido` del catálogo (clima cálido); añade `litros` y `potencia`. Caso patrón en BD: **26RES060_144** (Daikin, conjunto, scop 3,77).
- ⚠️ **Expediente YA REGISTRADO**: el SCOP real (cal y ACS) puede quedar por debajo del declarado en el certificado registrado y, por tanto, bajar el ahorro respecto a los kWh ya registrados. **Es lo correcto al migrar.** No conserves el del certificado: pon el real y **coméntalo SIEMPRE en el chat** para que el usuario confirme el recálculo.
- SQL de referencia (calefacción):
```sql
select coalesce(nullif(case when emisor ilike '%suelo%' then a.scop_cal_calido_35 else a.scop_cal_calido_55 end,0),
                case when emisor ilike '%suelo%' then a.scop_cal_medio_35 else a.scop_cal_medio_55 end) as scop_cal
from aerotermia a where a.id = :cal_db_id;
-- ACS acumulador (informativo; el cálculo final lo hace la app con metodo_scop='independiente'):
select cop_a7_55 from aerotermia where id = :acs_db_id;
```

**d) Fechas del CIFO** (regla BROKERGY): candidatos = todas las fechas de factura + la fecha de pruebas del RITE (hay un helper opcional `scripts/compute_fechas_cifo.py` si está disponible).
- `fecha_inicio_cifo` = la **PRIMERA (más antigua)** entre {facturas, pruebas RITE}.
- `fecha_fin_cifo` = la **ÚLTIMA (más reciente)** entre {facturas, pruebas RITE}.
- Cruza con el Certificado de Fin de Obra si declara inicio/fin (deben cuadrar).

**e) Cliente + Precio CAE (Anexo de Cesión de Ahorros)** — en `6. ANEXOS CAE` (busca `*Cesión*`/`*CESION*`/`*cesion*`, prefiere el `_fdo` firmado). Lee el PDF y saca los datos del **Cedente**:
- `clientes.nombre_razon_social` (nombre) · `clientes.apellidos` · `clientes.dni` (DNI/NIE) · `clientes.email` · `clientes.tlf` · `clientes.numero_cuenta` (IBAN, del bloque "forma de pago" **o**, en su defecto, del **Certificado de Titularidad Bancaria** del cliente — verifica que el titular/CIF coincide).
- ⚠️ **El titular del expediente es el CEDENTE del ahorro; la persona de contacto (a veces un familiar) NO es el titular.** Caso 25RES060_57: el titular (confirmado por DNI + Certif. Titularidad) es una persona y quien escribe es un familiar, que es solo contacto (el email es de él/ella).
- **Precio CAE** = el importe del incentivo de la **cláusula Cuarta** → `instalacion.economico_override.cae_client_rate` en **€/MWh** (numérico, sin símbolo). ⚠️ El anexo puede expresarlo en **€/kWh** (plantillas antiguas, p.ej. `0,090 €/kWh`) o en **€/MWh**; el campo de la app es **€/MWh**, así que si viene en €/kWh **multiplica ×1000** (0,090 €/kWh = 90 €/MWh). Cruza: `rate(€/MWh) × (ahorro kWh ÷ 1000) ≈ total €` de la cláusula. El total en € lo recalcula la app (`results.caeBonus`); no lo guardes.
- Vínculo: `expedientes.cliente_id = clientes.id_cliente` (PK de `clientes` = `id_cliente`). **Rellena solo lo que falte**; si un dato ya existe y DIFIERE, no lo machaques → márcalo **revisar** (¡`clientes.dni` tiene constraint UNIQUE!). Si el cliente ya está completo, el paso sirve para **verificar** contra el anexo.
- ⚠️ **Cliente duplicado por DNI:** antes de rellenar, busca `select id_cliente, nombre_razon_social from clientes where dni = :dni`. Si **ya existe** un registro COMPLETO con ese DNI (aunque tenga 0 expedientes) y el expediente apunta a un **placeholder vacío**, **re-vincula** el expediente a ese registro (`update expedientes set cliente_id = :id_completo where id = :exp_id`) en vez de rellenar el placeholder. Marca el placeholder huérfano para que el usuario lo borre. Caso de referencia: **25RES060_78**.

- **Justificante de titularidad bancaria → slot propio (obligatorio).** El IBAN del cliente puede venir del **Certificado de Titularidad Bancaria** (no solo del Anexo de Cesión). Ubicación variable: a veces en la **RAÍZ** del expediente, o en `9. PAGO A CLIENTE` / `6. ANEXOS CAE`. Además de `clientes.numero_cuenta`, **rellena el slot** `documentacion.justificante_titularidad_link` con el enlace del PDF: **si queda vacío la app DA ERROR**.

**e-bis) Instalador (empresa instaladora del CIFO).** Del CIFO saca: razón social, CIF, persona técnica/representante y carnet RITE. Busca la empresa en `prescriptores` (PK `id_empresa`, tipo INSTALADOR): `select id_empresa, razon_social, cif from prescriptores where cif = :cif or razon_social ilike :rs`. Si no existe, créala. **Vincúlala en las TRES referencias (no solo el JSON):**
- `instalacion.instalador_id` = `prescriptores.id_empresa`
- **`expedientes.instalador_asociado_id` = `prescriptores.id_empresa`** (FK real)
- **`oportunidades.instalador_asociado_id` = `prescriptores.id_empresa`** (FK real)
⚠️ Caso 25RES060_57: el instalador (J.PORRERO-HIJOS, S.L., B13306170) estaba solo en `instalacion.instalador_id` y las dos FK en NULL → la app lo veía vacío. Verifica también el **certificador** (`oportunidades.certificador_asociado_id`) por si está igual de huérfano.

**f) Envolvente — solo RES080 (Certificado de Fin de Obra / Ficha RES080)** — en `6. ANEXOS CAE` / `10. EXPEDIENTE CAE`. Del Certificado de Fin de Obra (y, de apoyo, la Ficha RES080) saca los mismos campos que rellenan el módulo **Envolvente** de la app → `documentacion.envolvente`:
- Ventanas: `sustituye_ventanas`(bool) · `num_ventanas` · `marco_existente_material` · `permeabilidad_existente` · `cristal_existente_composicion` · `marco_nuevo_material` · `marco_nuevo_marca` · `marco_nuevo_modelo` · `marco_nuevo_transmitancia`(Uf) · `cristal_nuevo_marca` · `cristal_nuevo_modelo` · `cristal_nuevo_composicion` · `cristal_nuevo_transmitancia`(Ug) · `permeabilidad_nueva` · `cristal_nuevo_factor_solar`(g) · `descripcion_ventanas`.
- Cerramientos: `actua_cerramientos`(bool) · `aislamiento_muros`(bool) · `aislamiento_muros_tipo` · `aislamiento_muros_material` · `aislamiento_muros_espesor`(cm) · `aislamiento_muros_conductividad`(λ W/mK) · `aislamiento_cubierta`(bool) · `aislamiento_cubierta_tipo` · `aislamiento_cubierta_material` · `aislamiento_cubierta_espesor` · `aislamiento_cubierta_conductividad` · `descripcion_cerramientos`.
- El Certificado de Fin de Obra también trae **equipos térmicos** (caldera antigua, aerotermia cal/ACS, marca/modelo/serie, emisor) e **hitos** (inicio/fin) → úsalo como fuente de c) y d) cuando no haya placa. Lo que no aparezca → **pendiente** (no inventar). En **RES060 esta sección de envolvente es N/A**.

### 4. Escribir en Supabase
Un `UPDATE` por fila, mergeando JSON con `||` (no machacar lo que ya hay, sobre todo `drive_folder_id`, `origen`, `result`). Para sub-objetos (aerotermia_cal/acs, caldera_antigua_*) merge anidado: `instalacion->'aerotermia_cal' || jsonb_build_object(...)`.
```sql
update oportunidades set datos_calculo = datos_calculo || jsonb_build_object('presupuesto', :inv) where id=:op_id;
update expedientes set
  instalacion   = coalesce(instalacion,'{}') || :instalacion_patch,
  documentacion = coalesce(documentacion,'{}') || :doc_patch
where id=:exp_id;
```
- **`clientes`** (UPDATE por `id_cliente`): set solo de campos vacíos/placeholder; **nunca** pises un `dni` distinto al existente (UNIQUE).
- **Precio CAE**: `instalacion = instalacion || jsonb_build_object('economico_override', coalesce(instalacion->'economico_override','{}'::jsonb) || jsonb_build_object('cae_client_rate', <num>))`.
- **Instalador (las TRES referencias):**
```sql
update expedientes  set instalador_asociado_id = :id_empresa,
       instalacion = coalesce(instalacion,'{}') || jsonb_build_object('instalador_id', :id_empresa) where id = :exp_id;
update oportunidades set instalador_asociado_id = :id_empresa where id = :op_id;
```
- **Envolvente (RES080)**: `documentacion = documentacion || jsonb_build_object('envolvente', coalesce(documentacion->'envolvente','{}'::jsonb) || jsonb_build_object(...))`.

**Slots de documentos (OBLIGATORIO — es lo que lee el visor de la app).** Por cada documento ya copiado a la carpeta de la app, rellena su slot en `documentacion` con el `viewUrl` del fichero (el de la carpeta de la app, no el original). **Si el slot queda vacío, la app muestra el documento como "no cargado" aunque el PDF exista en Drive.** Prefiere la versión firmada (`_fdo`) en el campo `*_signed_link`. Slots:
- **Anexo I (actuación)** → `anexo_i_signed_link` (y `anexo_i_drive_link` si hay versión sin firmar)
- **Anexo de Cesión de Ahorros** → `anexo_cesion_signed_link` (`anexo_cesion_drive_link`)
- **Certificado RITE** → `cert_rite_signed_link` / `cert_rite_drive_link` (+ `memoria_rite_pdf_link` si hay memoria)
- **Informe fotográfico** → `anexo_fotografico_signed_link` (`anexo_fotografico_drive_link`)
- **CIFO / Certificado de Instalación** → `cert_cifo_signed_link` / `cert_cifo_drive_link`
- **Ficha RES060/080** → `ficha_res060_signed_link` / `ficha_res060_drive_link`
- **FT de equipos** → `ft_aerotermia_cal_link`/`ft_aerotermia_cal_id` y `ft_aerotermia_acs_link`/`ft_aerotermia_acs_id` (la del ACS debe ser la del equipo ACS real, no la del de calefacción)
- **Justificante titularidad** → `documentacion.justificante_titularidad_link`
- **Facturas** → `documentacion.facturas[].drive_link`
```sql
update expedientes set documentacion = coalesce(documentacion,'{}') || jsonb_build_object(
  'anexo_i_signed_link', :anexo_i, 'anexo_cesion_signed_link', :cesion,
  'cert_rite_signed_link', :rite, 'anexo_fotografico_signed_link', :foto,
  'cert_cifo_signed_link', :cifo, 'ficha_res060_signed_link', :ficha
) where id = :exp_id;
```
Cualquier slot que no tenga documento → déjalo en `pendiente` en el estado incremental con el motivo (qué falta subir).

### 5. Actualizar el estado incremental
Escribe `expedientes.seguimiento.estado_relleno` (esquema en MAPA_DE_DATOS §5): por cada campo `{estado: ok|pendiente|na|revisar, fuente, valor|motivo}`, `ultima_revision = now()`, y la lista `pendientes`. Incluye siempre `cambio_acs` (fuente CEE+presupuesto+factura) y `scop_dhw` (`na` si solo calefacción). Para RES080 añade `tipo_actuacion` y los campos de envolvente a cruzar con el CIFO RES080. Añade también: `cliente` (campos rellenados/verificados, fuente=Anexo Cesión), `precio_cae` (€/MWh + total € de cruce), `instalador` (vinculado en las 2 FK sí/no), `envolvente` (ok/pendiente por bloque), `doc_links` (qué slots quedaron enlazados / pendientes) y `docs_copiados` (cuántos/qué se copió en el paso 2).
```sql
update expedientes set seguimiento = coalesce(seguimiento,'{}') || jsonb_build_object('estado_relleno', :estado_relleno) where id=:exp_id;
```

### 5-bis. Verificación final obligatoria (asserts duros)
Antes de escribir el estado incremental y cerrar, ejecuta estos chequeos automáticos. Si alguno falla → NO cierres el relleno: deja el campo en `revisar`, corrige y avísalo en el chat.

**a) Serie / modelo del ACS ≠ unidad de calefacción.** Causa real del fallo en 25RES060_57: se copió la serie de calefacción `8D00250218050019` en el bloque ACS, cuando la serie real del equipo ACS (LASIAN 150 S2) era `GK0GXLE0G0031R36UYS5`.
```sql
select numero_expediente
from expedientes
where id = :exp_id
  and instalacion->>'cambio_acs' = 'true'
  and instalacion->'aerotermia_acs'->>'numero_serie'
    = instalacion->'aerotermia_cal'->>'numero_serie';
```
Debe devolver **0 filas**. Si devuelve el expediente → la serie ACS está copiada de calefacción = ERROR. La serie del ACS solo es válida desde placa del depósito ACS / factura / CIFO del equipo ACS. Aplica el mismo criterio al `modelo` y a la FT enlazada (`ft_aerotermia_acs_link` debe ser la del equipo ACS, no la del de calefacción).

**b) Coherencia método ↔ tipo de equipo ACS.** Termo / acumulador ACS SEPARADO (p.ej. LASIAN 150 S2, "ACUM. ACS CON BOMBA DE CALOR") → `aerotermia_acs.metodo_scop='independiente'` (Anexo VI). Depósito integrado en la unidad interior de la aerotermia (hidrokit, p.ej. Daikin Altherma) → `'conjunto'` (Anexo IV). Manda el Anexo del CIFO.

**c) Facturas completas y enlazadas.** Todas las facturas existentes archivadas y con `documentacion.facturas[].drive_link` no nulo; Σ bases s/IVA = inversión.

**d) DACS = demanda de ACS del CEE INICIAL.** Lee la demanda de ACS (kWh/m²·año) de los XML de los dos CEE (`Demanda/EdificioObjeto/ACS` en los de CE3X 2.3; `Indicadores/Demanda/Acs` en los de CE3X 3.1, `version="3.0"`). Iguales → ok. Distintas → `revisar` + incidencia LEVE «DACS CEE inicial X ≠ CEE final Y → se usa la inicial», y comprueba que `dacs` (método XML) = demanda inicial × S. Si `dacs` sale de la final → corrígelo a la inicial y avísalo en el chat (cambia el ahorro).

### 6. Informe hecho / pendiente
Devuelve al usuario, de forma breve:
- **Rellenado** (campo → valor → fuente), incluyendo explícitamente **Cliente** (Anexo Cesión), **Precio CAE** (€/MWh), **Instalador** (vinculado en FK) y, en RES080, **Envolvente**.
- **Documentos copiados** (origen → subcarpeta destino) y **slots enlazados** (Anexo I, Cesión, RITE, Informe fotográfico, CIFO, Ficha, FT), con lo omitido.
- **Pendiente de aportar** (campo/slot → qué falta), priorizado.
- **A revisar** (discrepancias detectadas → WARNING/ERROR con la regla; p.ej. SCOP certificado-vs-catálogo, catálogo-vs-CIFO, serie ACS vs calefacción, emisor, DACS inicial vs final).
- **Alcance de la actuación**: RES060 (solo aerotermia) / RES080 (envolvente + instalación térmica), y si es *solo calefacción* o *calefacción + ACS* y en qué se basa.
Cierra indicando qué documento concreto debe subir para cerrar lo pendiente, de modo que al reaportar solo se procese eso.

## Reglas no negociables
- **Alcance:** RES060 = solo aerotermia. RES080 = aislamiento + instalaciones térmicas → suma TODAS las facturas (envolvente + aerotermia/suelo radiante). El RITE de la instalación térmica está en alcance en RES080.
- No inventar datos: lo que no esté en un documento → `pendiente` con motivo.
- **Facturas:** archivar y enlazar TODAS las que existan (anticipo + resto). Falta de una factura existente = **GRAVE** (bloquea), no aviso. Σ bases s/IVA = inversión. Fecha **DD-MM-AA** (año 20AA) y DNI a 8 cifras antes de acusar de nada; unidades terminales prohibidas en RES060/RES093/TER100 y con m² ≥ S justificada en RES080.
- **El CIFO manda sobre el catálogo.** Equipos, SCOP, método y series se validan contra el CIFO/FT; si la fila de catálogo difiere, está mal → corrígela/duplícala, no la uses tal cual.
- **ACS ≠ calefacción:** nº de serie, modelo, SCOP y FT del ACS son los del equipo de ACS (del CIFO), nunca los de la unidad de calefacción. **Chequeo duro (paso 5-bis):** la aserción SQL `aerotermia_acs.numero_serie = aerotermia_cal.numero_serie` debe dar **0 filas**; si coinciden, está mal copiado de calefacción.
- **Antes de tocar el SCOPdhw, decide el alcance ACS (c-ter) cruzando CEE inicial + presupuesto + factura.** Solo calefacción → SCOPdhw = N/A; depósito de inercia ≠ acumulador ACS. `metodo_scop` lo decide el Anexo del CIFO (VI=independiente / IV=conjunto), no el flag del catálogo.
- **Equipos:** fotos finales > certificado/factura > presupuesto. Foto final y certificado/factura **deben coincidir** (mismatch = WARNING). Modelo ausente del catálogo → añadirlo (`is_validated=false`), no mapear a otro modelo.
- **Antes de declarar que falta un documento, búscalo donde ya podría estar.** La FT vive en `aerotermia.ficha_tecnica` de las filas hermanas de la familia (no solo en `3. FICHAS TÉCNICAS Y CERTIFICACIONES`); al crear una fila nueva, hereda `ficha_tecnica` y `eprel`. Una incidencia GRAVE por un documento que sí existía cuesta credibilidad y trabajo al instalador.
- **SCOP = valor REAL del catálogo (motivo de la migración):** NO conserves el del certificado. Calefacción = `scop_cal_calido_{35|55}` según emisor (radiadores→55, suelo radiante→35, verificado con RITE/factura). Si baja el ahorro vs el cert registrado, es correcto: coméntalo en el chat.
- **Caldera antigua (ηi):** año del tramo por la **PLACA DE FABRICACIÓN** (no el del edificio); **condensación/sin condensación por el modelo real, nunca por defecto**; combustible y encendido del CIFO. Nunca `default`.
- **Instalador:** vincúlalo en `expedientes.instalador_asociado_id` Y `oportunidades.instalador_asociado_id` (FK reales), además del JSON `instalacion.instalador_id`. Datos del CIFO; debe existir en `prescriptores` (tipo INSTALADOR).
- **Slots de documentos:** enlaza SIEMPRE Anexo I, Anexo Cesión, Cert RITE, Informe fotográfico, CIFO, Ficha, FT **y CADA factura (`documentacion.facturas[].drive_link`, una por factura)** en sus slots de `documentacion`. Slot vacío = la app lo da por no cargado. Usa el enlace del fichero **ya en la carpeta de la app**.
- **Cliente:** datos y nº de cuenta del **Anexo de Cesión** (titular = cedente, no el contacto); rellena solo lo que falte y **nunca pises un `dni` distinto** (UNIQUE). Duplicado por DNI → re-vincula al registro completo.
- **Precio CAE** = €/MWh de la cláusula Cuarta del Anexo Cesión (convierte si viene en €/kWh) → `instalacion.economico_override.cae_client_rate`. El total € es derivado.
- **Envolvente (RES080)** del Certificado de Fin de Obra / Ficha RES080 → `documentacion.envolvente`. En RES060 es N/A.
- Coincidencia exacta en variables de cálculo (SCOP, DACS, DCAL, S); identificadores idénticos; direcciones = WARNING.
- **DACS = CEE INICIAL (criterio fijo, 17/09/2026).** La demanda de ACS debe ser igual en el CEE inicial y en el final. Al cargar `dacs` / `xmlDemandData` usa SIEMPRE la del CEE inicial (× S). Si la del CEE final es distinta, NO la sustituyas: marca `revisar` (WARNING) con los dos valores «DACS CEE inicial X ≠ CEE final Y → se usa la inicial» y regístralo como LEVE. Si el CEE final aún no está registrado, avisa para que el certificador la iguale.
- Idempotencia: clave `numero_expediente`. No dupliques; actualiza. No tocar `datos_calculo.result` (lo calcula el motor de la app).
- **Copia de documentos**: el MCP de Drive solo copia/crea (no mueve ni borra). Copia a la subcarpeta correcta lo que falte (idempotente por título, sin plantillas/calculadoras) y enlaza el slot; la limpieza de duplicados/basura la hace la app/el usuario.