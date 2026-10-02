---
name: generar-anexo-cifo
description: "Genera el CIFO (Certificado de Instalación / Fin de Obra CAE) de un expediente BROKERGY con sus anexos, listo para firmar, validando SCOP, ηi, fechas, series, DACS y Cb."
---

# Generar CIFO — Certificado de Instalación / Fin de Obra (RES060 · RES080 · RES093)

Objetivo: dejar el **CIFO generado en Drive** (`6. ANEXOS CAE`) y **enlazado en su slot** de la app
(`documentacion.cert_cifo_drive_link`), con **todos sus anexos** (justificación de variables, fichas
técnicas de calefacción y ACS, PDF EPREL si aplica), **listo para revisar y firmar** por el flujo
existente de la app (`/firmar-anexos/:id`). Exactamente el mismo resultado que si el usuario lo generase
desde app.brokergy.

**Principio rector:** el CIFO es el documento que cristaliza las variables del ahorro (las que se envían
al Verificador). Cada valor que aparezca en él debe estar **justificado por un documento** (CEE, XML,
FT, EPREL, placa, factura, RITE) y **coincidir exactamente con lo cargado en la app** (Supabase). Nunca
se genera un CIFO con datos inventados o "provisionales": lo que no se pueda justificar → incidencia y
no se genera.

## Herramientas — dos modos de generación (backend preferente; script local autosuficiente)
- **Modo A — backend (preferente).** `generar_cifo(numero)` del MCP de BROKERGY: genera el PDF con la
  plantilla oficial en el servidor, descarga los PDF EPREL, guarda en Drive y enlaza los slots (mismo
  patrón que `generar_anexo_fotografico`). Especificación del endpoint:
  `ESPECIFICACION_BACKEND_generar_cifo.md`. Si existe `estado_cifo(numero)`, úsalo para leer qué falta.
  **Comprueba PRIMERO si el tool está disponible** (aparece en la lista de tools del MCP): si está, úsalo
  y salta el modo B.
- **Modo B — script local (autosuficiente, mientras el backend no esté desplegado).** Esta skill trae
  `scripts/generar_cifo.py`, que produce el PDF del CIFO replicando la plantilla oficial (portada +
  Anexo I de justificación + Cb en RES093 / EFi-EFf + envolvente en RES080) y **fusiona los anexos**
  (FT cal/ACS + Fiche/Label EPREL). La skill:
  1. Ensambla el **payload JSON** desde Supabase + Drive (esquema documentado en la cabecera del script
     y en §checklist). Todos los valores ya validados (paso 4) y formateados es-ES.
  2. Descarga a local los PDF de anexo que haya que fusionar: FT (`ft_aerotermia_cal/acs_link`) con
     `download_file_content` (Drive) → escribe el binario; **EPREL** con WebFetch/descarga a
     `https://eprel.ec.europa.eu/api/products/{grupo}/{id}/fiches?language=ES` y `/labels?format=PDF`
     (si la descarga del binario falla, se genera sin ese anexo + incidencia LEVE "adjuntar EPREL a mano").
  3. Ejecuta `python3 scripts/generar_cifo.py payload.json <num> - Certificado CIFO.pdf`
     (requiere `reportlab` y `pypdf`: `pip install reportlab pypdf --break-system-packages`).
  4. **Sube** el PDF a `6. ANEXOS CAE` con `create_file` (base64) o copiándolo, **enlaza**
     `documentacion.cert_cifo_drive_link`, registra el EPREL en `cifo_extra_annexes[]` y las FT en
     `ft_aerotermia_*` / `res080_attachments[]`.
  El resultado es el mismo que el backend: CIFO en su carpeta y slot, borrador listo para revisar/firmar.
  ⚠️ El PDF del modo B es una **réplica fiel del contenido** (valores idénticos a la app y a los
  documentos justificantes); la maquetación es la plantilla BROKERGY de esta skill, no el render exacto
  del backend. Cuando el backend `generar_cifo` esté desplegado, la skill conmuta sola al modo A.
- **MCP de Supabase** (`execute_sql`, project_id `okfeopwetlxdffrsbfqw`).
- **MCP de Google Drive** (`search_files`, `read_file_content`, `get_file_metadata`, `copy_file`,
  `create_file`). Solo COPIA y CREA; no mueve ni borra.
- **WebFetch** a la API pública de EPREL — SOLO LECTURA de datos para validar (la descarga del PDF
  binario la hace el backend): `https://eprel.ec.europa.eu/api/products/{grupo}/{id}` con
  grupo ∈ {`spaceheaters` (Reg. 811/2013, aerotermias calefacción), `waterheaters` (Reg. 812/2013,
  bombas de calor ACS)}.
- `registrar_incidencia(numero, texto, severidad, procedencia:'AGENTE_IA')` para todo lo no deducible.

## Entrada
`numero_expediente` (ej. `26RES093_2`). Si no lo da el usuario, pídelo en una línea.

---

## Procedimiento

### 0. Resolver expediente, tipología y estado
```sql
select e.id exp_id, e.numero_expediente, e.estado, o.ficha, o.id op_id,
       o.datos_calculo->>'drive_folder_id' folder_id, o.datos_calculo->>'presupuesto' inversion,
       e.instalacion, e.documentacion, e.cliente_id, e.instalador_asociado_id,
       e.seguimiento->'estado_relleno' estado_relleno
from expedientes e join oportunidades o on o.id = e.oportunidad_id
where e.numero_expediente = :num;
```
- Tipología por el número/ficha: **RES060** (sustitución por aerotermia), **RES080** (rehabilitación:
  envolvente + instalaciones térmicas; su CIFO es el **Certificado Final de Obra CAE**, plantilla
  distinta, lo firma el director redactor de BROKERGY), **RES093** (hibridación con caldera existente;
  añade el coeficiente **Cb**). Si no se deduce, pregunta.
- Si ya existe `cert_cifo_signed_link` (CIFO firmado) → **NO lo machaques**: pregunta al usuario si de
  verdad quiere regenerar (un firmado se sustituye solo si hay corrección de datos; el nuevo borrador
  invalida la firma anterior).

### 1. Checklist de datos del CIFO (por tipología) — completar lo deducible

Recorre el checklist. Lo que falte y sea **deducible de la documentación**, complétalo con la misma
lógica de `rellenar-expediente` (leer CEE/XML, FT, placas, RITE, facturas) y escríbelo en Supabase.
Lo que no sea deducible → `registrar_incidencia` (GRAVE si bloquea el CIFO) y **no generes**.

**Comunes (todas las tipologías):**
| Dato | Campo | Fuente |
|---|---|---|
| Dirección, ref. catastral, coordenadas UTM | `instalacion.ref_catastral`, `coord_x/y` | Catastro/CEE |
| Propietario (nombre, NIF, domicilio, tlf, email) | `clientes.*` | Anexo Cesión / DNI |
| Nº facturas asociadas | `documentacion.facturas[].numero_factura` | Facturas (¡todas!) |
| Fechas inicio/fin | `documentacion.fecha_inicio_cifo/fin` | 1ª factura ↔ pruebas RITE (regla BROKERGY) |
| Equipo antiguo cal.: tipo/marca/modelo/serie/combustible | `instalacion.caldera_antigua_cal` | CEE inicial + placa |
| ηi (tramo por año de PLACA, condensación por modelo real) | `caldera_antigua_cal.rendimiento_id` | placa/internet/CIFO previo. NUNCA `default` |
| Equipo nuevo cal.: marca/modelo/serie ud. exterior | `instalacion.aerotermia_cal` | placa DESPUÉS > CIFO/factura > presupuesto |
| SCOPbdc + método | `aerotermia_cal.scop`, `metodo_scop` | ver paso 2 |
| DCAL, S | del CEE (los verifica el backend contra `datos_calculo`) | CEE inicial |
| DACS | Demanda de ACS del **CEE INICIAL** (XML inicial `Demanda/EdificioObjeto/ACS` × S; en un XML de CE3X 3.1, `Indicadores/Demanda/Acs`) **solo si** el método marcado es XML; si no, **CTE Anejo F** (habitaciones→personas→l/día×0,001162×365×46). Nunca la del CEE final | XML inicial / CTE |
| Instalador (razón social, CIF, domicilio, rep. legal) | `prescriptores` vía FK | CIFO previo/RITE |

**Bloque ACS — regla de oro `cambio_acs`:**
- Antes de nada aplica el check **c-ter** de rellenar-expediente (presupuesto + factura + CEE):
  ¿la actuación incluye ACS?
- `cambio_acs=false` → columna ACS del CIFO = **"no aplica"** / "Se mantiene la instalación
  existente"; SCOPdhw = "no aplica". NO exijas FT de ACS ni EPREL de ACS.
- `cambio_acs=true` → equipo ACS con **su propia** marca/modelo/serie (¡nunca la de calefacción!,
  assert 5-bis de rellenar-expediente), SCOPdhw + método (Anexo IV conjunto / Anexo VI independiente /
  FT), y FT de ACS obligatoria como anexo.

**RES093 / RES09x (además):** coeficiente **Cb** (Anexo III de la ficha):
`Cb = f(% cobertura)`, siendo `% cobertura = Potencia térmica NOMINAL de la bomba de calor (FT, UNE-EN
14511 A7/W35) / CARGA DE DISEÑO PARA CALEFACCIÓN`, interpolando linealmente en la tabla del Anexo III.
Cb en tanto por uno con **tres decimales**.

🚫 **PROHIBIDO: dividir la demanda anual por `th` de RES220/RES230 (3.503 h en D3 o análogas).** Esa
columna se titula *"Horas en calefacción anuales (th)"* y sus notas al pie 3 y 4 dicen *"Solo a efecto
informativo del dato utilizado para el cálculo de Dcal"*: es la duración de la temporada, no horas
equivalentes. *Rechazado por Marwen en CAE-1602 / 26RES093_3, inexactitud importante nº9 (10/08/2026).*

✅ **MÉTODO CORRECTO — horas equivalentes en modo activo (HHE) del Reglamento (UE) 813/2013.**
Es la ÚNICA norma que define la magnitud, es directamente aplicable, y el propio catálogo CAE remite a
ese marco (Anexo II de RES093 → UNE-EN 14825 y Comunicación 2017/C 229/01; Anexo V de RES060 → Rgtos.
813/2013 y 814/2013, exigiendo rendimientos *"al menos, en las condiciones para clima medio"*).

> **Rgto. (UE) 813/2013, Anexo III, punto 4.c) — DOUE L 239/153:** *"La demanda anual de calor de
> referencia QH será la carga de diseño para calefacción Pdesignh multiplicada por las horas anuales
> equivalentes en modo activo HHE de 2 066."*

    QH = DCAL × S            (del CEE registrado: la ficha impone esta fuente)
    Pdesignh = QH / HHE      HHE = 2.066 h clima MEDIO · 2.465 h FRÍO · 1.336 h CÁLIDO (Rgto. 811/2013)
    % cobertura = P_BdC / Pdesignh   →   Cb (tabla Anexo III, interpolación lineal)

**Elección del clima — regla:** usa el clima en el que la FT/EPREL declara el **SCOP que has adoptado**.
Busca la nota al pie del SCOP en la ficha técnica ("condiciones climáticas promedio" → clima MEDIO →
2.066 h). SCOP y HHE son dos parámetros de la MISMA temporada de referencia: mezclarlos es incoherente y
el verificador lo verá. Por defecto, clima medio.

**Comprobación obligatoria en W/m²:** `Pdesignh / S` (la S de la ficha, la del CEE) debe caer en
**50–120 W/m²**. Fuera de rango → revisa antes de firmar. Contrasta además con la demanda de referencia
oficial de la localidad: IDAE/AICIA, *"Escala de calificación energética. Edificios existentes"* (2011),
**Tabla 3.2, pp. 22-23** (p.ej. Ciudad Real unifamiliar 144,3 kWh/m²·año; Madrid 149,8; Burgos 234,2).

**Sanity check de hibridación:** en bivalencia paralelo la BdC cubre ~40-60 % de la potencia punta y
~75-85 % de la energía (Cb). Si te sale Cb > 0,95 la caldera quedaría con < 5 % de la energía: eso no es
una hibridación, y el verificador lo rechaza.

⛔ **NO uses la memoria/proyecto RITE como fuente de la potencia** aunque contenga el resumen de cargas
térmicas: su tabla suele cubrir solo los locales con emisor (caso 26RES093_3: 157,30 m² frente a los
262 m² del CEE), y aportarla invita al verificador a discutir la **S de la fórmula**, que vale mucho más
que el Cb. ⛔ **NO aceptes la potencia nominal de la caldera** que el verificador ofrece como atajo: las
calderas se dimensionan por ACS instantánea y están sobredimensionadas (caso real: Cb 0,613 vs 0,812).

**Ninguna metodología de certificación energética sirve aquí** y conviene decirlo en el anexo: CE3X
interpola sobre casos pre-simulados con CALENER, y HULC/CALENER (DOE-2) y CYPETHERM (EnergyPlus)
resuelven las 8.760 h del año con ficheros climáticos horarios y los perfiles del Anejo D del CTE DB-HE.
**No existe ninguna tabla oficial de "horas de calefacción por provincia"**: el factor de horas solo
existe en el marco de ecodiseño/etiquetado.

La caldera existente **se mantiene** (hibridación): el CIFO no debe decir que se retira, y hay que
aportar **placa de características legible** de esa caldera (justifica ηi) en el informe fotográfico.

**RES080 (además):** es el **Certificado Final de Obra CAE** (plantilla propia):
- `documentacion.envolvente` completa (ventanas: huecos antes/después con U, g, permeabilidad,
  marco/vidrio marca-modelo-Uf-Ug; cerramientos si los hay).
- Comparativa energética **EFi/EFf** de los XML del CEE inicial y final (consumos por servicio,
  factores de paso) → `AETOTAL = FP·(EFi−EFf)`. Ambos XML deben estar en `1. CEE`.
- Anexos: FT aerotermia + FT marco + FT vidrio (Calumen/CE) + DoP ventanas, según
  `res080_attachments[]` (rellenar `file` de cada item).
- Di: 25 años envolvente / 15 instalaciones (lo imprime la plantilla).

### 2. SCOP y su justificación (el corazón del CIFO)

Lee `instalacion.aerotermia_cal.metodo_scop` (y `aerotermia_acs.metodo_scop` si ACS). Casos:

**a) `eprel`** — el SCOP se justifica con la ficha EPREL (Anexo IV ficha RES060):
- `url_eprel` obligatoria (`https://eprel.ec.europa.eu/screen/product/<grupo>/<id>`). Si falta, búscala:
  WebFetch a `https://eprel.ec.europa.eu/api/products/spaceheaters/<id>` o buscador EPREL por
  `modelIdentifier` (el código de la ud. exterior, ej. `524786`).
- **Valida vía WebFetch** el ηs,h del clima y Tª que correspondan (cálido; 35 °C suelo radiante /
  55 °C radiadores — el emisor verificado contra RITE/factura) y recalcula:
  `SCOP = 2,5 × (ηs,h + 3% + 0%)`. Debe cuadrar EXACTO con `aerotermia_cal.scop` (si no: corrige el
  campo o marca ERROR).
- El PDF **Fiche_<id>_ES.pdf** (+ **Label_<id>.pdf**) lo descarga el **backend** al generar y lo
  registra en `cifo_extra_annexes[]`. Si el backend reporta fallo de descarga EPREL → incidencia LEVE
  "adjuntar PDF EPREL a mano" (el CIFO se genera igualmente con el cálculo).
**b) `ficha`** — el SCOP sale de la FT del fabricante: `url_ficha` obligatoria y la FT debe acabar
  anexada (paso 3). El valor debe leerse EN la FT (clima/Tª correctos); si la FT no lo trae → el método
  es inválido: pasa a EPREL o a cálculo firmado, o incidencia.
**c) `catalogo`** — el valor viene de `public.aerotermia` (scop_cal_calido_35/55). Para el CIFO
  necesita respaldo documental: usa la `ficha_tecnica` del catálogo como FT anexa y/o su `eprel`.
  Si la fila del catálogo no tiene ni FT ni EPREL → complétala (paso 2-bis) antes de generar.
**d) ACS:** Anexo IV (conjunto) / Anexo VI (independiente: `SCOPdhw = COP_A7/55 × Fc(zona)`) según el
  tipo de depósito — regla ACS de rellenar-expediente. La justificación que imprime el backend depende
  de `metodo_scop` del bloque ACS.

### 2-bis. Actualizar el catálogo `public.aerotermia` (¡aprovecha el paso!)

Para cada equipo del CIFO (cal y ACS si aplica), localiza su fila (`aerotermia_db_id`):
- Si la fila **no tiene `eprel`** y el expediente tiene `url_eprel` → `update aerotermia set eprel=:url`.
- Si **no tiene `ficha_tecnica`** y hay FT en Drive → guarda el enlace de la FT (el de la carpeta
  compartida de FT del catálogo si existe; si no, el del expediente).
- Si el modelo **no existe** en el catálogo → créalo (marca en `aerotermia_marcas` si falta, fila con
  SCOP de la FT/EPREL, `is_validated=false`) — regla de rellenar-expediente.
- Valida de paso que los SCOP de la fila cuadran con FT/EPREL; si difieren, corrige el catálogo y
  avísalo en el chat (el CIFO manda).

### 3. Anexos de fichas técnicas (cal y ACS)

- La FT de **calefacción** debe estar como PDF en `3. FICHAS TÉCNICAS Y CERTIFICACIONES` del
  expediente y enlazada en `ft_aerotermia_cal_link` + `ft_aerotermia_cal_id`.
  - Si `url_ficha` apunta a un Drive ajeno al expediente → `copy_file` a la carpeta del expediente.
  - Si es una URL externa (web del fabricante) → el backend la descarga al generar; si no puede,
    incidencia LEVE.
- Ídem ACS (`ft_aerotermia_acs_link/id`) **solo si** `cambio_acs=true`. La FT del ACS es la del equipo
  de ACS real (assert: ≠ FT de calefacción salvo equipo DUO justificado).
- En RES080, además, rellena `res080_attachments[]` (aerotermia, rite, marco, cristal, aislamiento).
- El backend **fusiona** estas FT al final del PDF del CIFO (como en 25RES060_63/66) y deja los enlaces
  en sus slots.

### 4. Verificación dura antes de generar (asserts — 0 filas o corregir)
1. `cambio_acs=true` y `aerotermia_acs.numero_serie = aerotermia_cal.numero_serie` → ERROR (serie
   copiada).
2. `fecha_inicio_cifo > fecha_fin_cifo` o fechas incoherentes con facturas/RITE → ERROR.
3. `metodo_scop='eprel'` sin `url_eprel`, o `'ficha'` sin FT anexable → ERROR.
4. SCOP del expediente ≠ SCOP recalculado (EPREL/FT/catálogo, con el emisor del RITE) → ERROR.
5. `rendimiento_id` en `default` o combustible incoherente CEE↔CIFO → ERROR.
6. RES093/RES09x: falta potencia de la bomba o Cb no calculable → ERROR.
6-bis. **RES093/RES09x: `P_proyecto` obtenida dividiendo la demanda por `th` de RES220/RES230
   (3.503 h en D3 o análogas) → ERROR AUTOMÁTICO.** Debe venir de la memoria/proyecto RITE o de un
   cálculo de cargas firmado (jerarquía del paso 1). Assert numérico: `P_proyecto/S_calefactada`
   entre 50 y 120 W/m²; fuera de rango → ERROR.
6-ter. **RES093/RES09x: sin placa de características LEGIBLE de la caldera de combustión que se
   mantiene → ERROR** (sin ella no se sostiene ηi). Igual en RES060 con la caldera sustituida: si la
   foto de placa está borrosa, cortada o no permite leer marca+modelo+potencia, no vale — pídela de
   nuevo o aporta FT/homologación del fabricante.
7. RES080: falta envolvente o alguno de los dos XML (inicial/final) → ERROR.
8. Titular ≠ titular de facturas/RITE/CEE (cruce de NIF) → GRAVE (no generes: el CIFO heredaría la
   incoherencia).
9. **Fechas inicio/fin del CIFO ≠ fechas de la ficha RES ≠ fechas de la solicitud de verificación →
   ERROR.** Las tres tienen que ser idénticas (caso real 26RES093_3: CIFO 29/04/2026 vs ficha y
   solicitud 23/04/2026).
10. **SCOPdhw del CIFO ≠ SCOPdhw de la ficha RES → ERROR** (caso real 26RES060_105: ficha 3,70 vs
   CIFO 2,86). Si `cambio_acs=false`, ambos deben decir "no aplica" — nunca repetir el SCOP de
   calefacción por defecto.
11. **Cabeceras y referencias cruzadas de la plantilla**: el Anexo I no puede citar "ficha RES060"
   si la tipología es RES093/RES080. Comprueba que todo texto impreso cita la ficha `tp` correcta.
12. **DACS (método XML) ≠ demanda de ACS del CEE INICIAL × S → ERROR.** Si la demanda de ACS del CEE final
   es distinta de la del inicial → WARNING «DACS CEE inicial X ≠ CEE final Y → se usa la inicial» (no bloquea:
   se genera con la inicial).
Cualquier assert fallido → incidencia + informe; genera SOLO si todo pasa.

### 5. Generar (modo A si hay backend; si no, modo B con el script local)
**Modo A:** `generar_cifo(numero)`. El backend compone el PDF oficial, descarga EPREL, guarda en
`6. ANEXOS CAE`, enlaza `cert_cifo_drive_link` y devuelve `link`, `numPaginas`, `anexos[]`.

**Modo B (script local):**
1. Ensambla `payload.json` (esquema en la cabecera de `scripts/generar_cifo.py`): identificación,
   propietario, hitos, comparativa cal/ACS, tabla de variables, Anexo I (just_dacs/ni/scop),
   `res093_cb` si RES093, `res080` si RES080, e `instalador`. Pon en `anexos` las rutas locales de las
   FT/EPREL ya descargadas.
2. `pip install reportlab pypdf --break-system-packages` (si faltan) y
   `python3 scripts/generar_cifo.py payload.json "/tmp/<num> - Certificado CIFO.pdf"`.
3. Verifica el PDF (páginas, 3 valores al azar contra Supabase). Súbelo a `6. ANEXOS CAE`
   (`create_file` base64) y enlaza `documentacion.cert_cifo_drive_link`; registra EPREL en
   `cifo_extra_annexes[]` y FT en `ft_aerotermia_*`/`res080_attachments[]`.

En ambos modos el `_fdo` firmado llegará por el flujo de firma y ocupará `cert_cifo_signed_link`; esta
skill no envía a firmar salvo que el usuario lo pida.

### 6. Verificar el resultado y cerrar
- Relee el expediente: `cert_cifo_drive_link` relleno, `cifo_extra_annexes` con el EPREL si tocaba,
  `ft_*` enlazadas. Abre el PDF (read_file_content) y comprueba 3 valores al azar contra Supabase
  (SCOP, fechas, serie) — si algo no cuadra, el backend ha leído otro dato: ERROR e investigar.
- Actualiza `seguimiento.estado_relleno` (clave `cifo`: estado, fecha, link, método SCOP usado).
- Incidencias por todo lo pendiente (EPREL manual, FT no descargable, datos no deducibles).
- Informe final: enlace al CIFO, variables impresas (FP, DCAL, S, DACS, ηi, SCOP, [Cb], AETOTAL),
  anexos incluidos, catálogo actualizado (sí/no), incidencias registradas, y recordatorio de que la
  firma va por `/firmar-anexos/:id`.

## Reglas no negociables
- **La app es la fuente**: el CIFO se imprime desde Supabase; nunca metas en el PDF un dato que no esté
  cargado en la app (si falta, se carga primero — así el Vistazo final CIFO↔app de auditar-expediente
  sale limpio por construcción).
- **Coincidencia EXACTA** en variables de cálculo (SCOP, DACS, DCAL, S, ηi, Cb): el valor impreso = el
  valor de la app = el valor del documento justificante.
- **DACS = CEE INICIAL** (criterio fijo, 17/09/2026): la demanda de ACS debe ser igual en CEE inicial y final. Si difiere, el CIFO imprime la del CEE inicial y se registra un WARNING «DACS CEE inicial X ≠ CEE final Y → se usa la inicial». Nunca imprimas la del CEE final.
- **cambio_acs manda**: solo calefacción → ACS "no aplica" en el CIFO, sin FT ACS ni SCOPdhw.
- **ηi por placa** (año real, condensación por modelo), nunca `default`.
- **Serie ACS ≠ serie calefacción** (si cambio_acs).
- **EPREL**: validar ηs vía API antes de generar; la descarga del PDF es del backend; si falla, LEVE y
  se adjunta a mano (nunca bloquea si el cálculo está validado).
- **Catálogo**: si al expediente le sirvió una FT/EPREL que el catálogo no tenía, actualiza la fila
  (o créala `is_validated=false`) — cada CIFO deja el catálogo mejor de lo que estaba.
- **No regenerar sobre firmado** sin confirmación del usuario.
- **No inventar**: dato no justificable → incidencia y stop.
- Idempotente: regenerar sustituye el borrador; slots por las claves REALES del esquema
  (`cert_cifo_drive_link`, `cert_cifo_signed_link`, `cifo_extra_annexes`, `ft_aerotermia_*`,
  `res080_attachments`).