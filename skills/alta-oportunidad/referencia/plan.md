# El plan de `crear`

Un JSON escrito por quien ha mirado el chat y cada fichero. Va en la carpeta que dejó `chat`
(`scratch/alta-oportunidad/<tel>-<fecha>/`, fuera de git: lleva el DNI). Las rutas de los ficheros son
relativas a esa carpeta.

```json
{
  "chat": {
    "chatId": "38006299820134@lid",
    "nombre": "ISM Alejandro administración",
    "cuando": "01/10/2026 16:23–16:36",
    "mensajes": ["false_…@lid_3EB0…", "…"]
  },
  "prescriptor": "ISM",
  "cliente": {
    "nombre": "MARIA DEL CARMEN",
    "apellidos": "SANCHEZ PULPON",
    "dni": "<el del chat>",
    "tlf": null,
    "email": null,
    "direccion": "C/ HERNAN CORTES, 13"
  },
  "rc": "4714713WJ0641S0001OH",
  "construcciones": [],
  "orientacion": "N",
  "patios": 1,
  "caldera": {
    "combustible": "gasoleo",
    "edad": "10-20",
    "condensacion": "no",
    "rendimiento_id": "oil_post98",
    "marca": "JUNKERS",
    "modelo": "CGW25",
    "potencia_kw": 25,
    "numero_serie": "5830342783",
    "serie_dudosa": true
  },
  "emisor": "radiadores_convencionales",
  "acs": { "actual": "misma_caldera", "incluir": true,
           "equipo": { "marca": "LASIAN", "modelo": "ATHERIA 100" } },
  "aerotermia": { "marca": "CARRIER", "modelo": "30AWH010HM" },
  "placas": null,
  "presupuesto": { "fichero": "01_Presupuesto_aerotermia.pdf", "wa_msg_id": "false_…" },
  "documentos": [
    { "fichero": "03_foto.jpg", "slot": "FOTO_PLACA_CALDERA_ANTES", "wa_msg_id": "false_…" },
    { "fichero": "04_foto.jpg", "slot": "FOTO_CALDERA_ANTES", "wa_msg_id": "false_…" },
    { "fichero": "05_foto.jpg", "slot": "DOC_PLANOS", "wa_msg_id": "false_…" }
  ],
  "decisiones": [
    "Superficie: las dos plantas de VIVIENDA del Catastro (141 + 34 = 175 m²)",
    "Fachada principal al NORTE y 1 patio interior (croquis: «C/ HERNAN CORTES (NORTE)» y «PATIO»)",
    "Caldera de gasóleo de una vivienda de 2008 → «Gasóleo ≥1998 sin condensación» (η 0,79)"
  ]
}
```

| Clave | Qué es | Notas |
|---|---|---|
| `chat` | de dónde salió | Va a `datos_calculo.alta_whatsapp` y al historial. `mensajes` = ids del bloque |
| `prescriptor` | acrónimo, razón social o id del partner que trae la obra | Tiene que casar con UNO. `null` = BROKERGY |
| `cliente.nombre` / `apellidos` / `dni` | el TITULAR | Obligatorio el nombre. Si el DNI ya es de un cliente, se reutiliza esa ficha |
| `cliente.tlf` / `email` | solo si son SUYOS | Un teléfono de otra persona (el marido, el instalador) va en `decisiones` |
| `cliente.direccion` | la que da el instalador | Manda sobre la del Catastro para la ficha del cliente |
| `rc` | referencia de la VIVIENDA (20) | Con una de 14 (parcela) `crear` se niega |
| `construcciones` | códigos `escalera/planta/puerta` que se AÑADEN | Todas las VIVIENDA cuentan SIEMPRE (no se pueden quitar). Aquí solo va lo que el Catastro no da como vivienda y se vive. `catastro <RC>` los lista |
| `orientacion` | `media` · `N` · `NE` · `E` · `SE` · `S` · `SO` · `O` · `NO` | Hacia dónde mira la FACHADA PRINCIPAL (la de la calle). Del croquis o las fotos. Sin dato, `media` |
| `patios` | 0 a 4 | Patios interiores (el croquis los rotula). Sin dato, 0 |
| `fachadas` | 1 a 4 | Fachadas al exterior. Solo si consta (una casa entre medianeras); si no, la de la calculadora |
| `permitir_duplicado` | `true` | Solo si la vivienda ya tiene oportunidad y de verdad es otra alta. Dilo en `decisiones` |
| `caldera.combustible` | `gas` · `gasoleo` · `electrica` · `carbon` · `biomasa` | `"caldera": null` = la vivienda no tiene calefacción |
| `caldera.edad` | `<10` · `10-20` · `>20` · `no_se` | Coherente con `rendimiento_id` |
| `caldera.condensacion` | `si` · `no` · `no_se` | |
| `caldera.rendimiento_id` | fila de `BOILER_EFFICIENCIES` | **Manda** sobre la que deduce el formulario por la edad |
| `caldera.potencia_kw` | potencia **útil** de la placa | Va a `inputs.potenciaCaldera` |
| `caldera.marca` / `modelo` / `numero_serie` / `serie_dudosa` | la placa | `inputs.placa_caldera`: el expediente la hereda al aceptarse (solo huecos; un serie dudoso no) |
| `emisor` | `radiadores_convencionales` (por defecto) · `radiadores_baja_temp` · `suelo_radiante` · `fancoils` | Fija la temperatura del SCOP (55 · 45 · 35 °C) |
| `acs.actual` | `misma_caldera` · `termo` · `butano` · `gas` · `gasoleo` · `solar` · `no_tengo` | Lo que calienta HOY el agua |
| `acs.incluir` | `true` si la obra cambia el ACS | |
| `acs.equipo` | `{ aerotermia_id }` o `{ marca, modelo, scop? }` | Solo si el ACS lo hace OTRA máquina (bomba de calor de ACS). Sin él, el ACS lo da la aerotermia principal |
| `aerotermia` | `{ aerotermia_id }` o `{ marca, modelo, scop?, potencia_kw? }` | `{marca, modelo}` se casa con el catálogo por el código; con varios candidatos pide el id |
| `placas` | `"si"` · `"futuro"` · `"no"` · `null` · o `{ "estado": "si", "kwp": 3.5 }` | Placas fotovoltaicas QUE YA TIENE. `null` = sin declarar |
| `presupuesto` | `{ fichero }` (se lee con OCR) o `{ importe_con_iva }` | Sin él, la propuesta va con el ESTIMADO de 15.000 € y lo dice |
| `documentos[]` | `{ fichero, slot, wa_msg_id? }` | Apartados: `FOTO_CALDERA_ANTES`, `FOTO_PLACA_CALDERA_ANTES`, `FOTO_EMISORES_ANTES`, `FOTO_ACS_ANTES`, `FOTO_FACHADA_PRINCIPAL`, `FOTO_PATIOS_INTERIORES`, `VIDEO_VIVIENDA`, `DOC_PLANOS`, `DOC_CEE_EXISTENTE`, `DOC_PRESUPUESTO`, `OTROS_ANTES`. El presupuesto entra solo |
| `decisiones[]` | lo que se ha decidido y por qué | Al historial. Es lo que revisa una persona |
| `obra_estado` | `no_empezada` (por defecto) | Esta skill da de alta sustituciones de caldera (RES060) |

**Qué va a cada apartado**

| Lo que llega | Apartado |
|---|---|
| La caldera entera (frontal, sala de calderas) | `FOTO_CALDERA_ANTES` |
| La etiqueta de la caldera | `FOTO_PLACA_CALDERA_ANTES` |
| Croquis, plano a mano, planos de la vivienda | `DOC_PLANOS` |
| Fachada desde la calle | `FOTO_FACHADA_PRINCIPAL` |
| Patios / paredes a patio | `FOTO_PATIOS_INTERIORES` |
| Radiadores | `FOTO_EMISORES_ANTES` (solo si el apartado existe: con radiadores no se piden) |
| Termo o depósito actual | `FOTO_ACS_ANTES` |
| CEE anterior | `DOC_CEE_EXISTENTE` |
| La captura o el PDF del Catastro | no se sube (el Catastro se consulta) |

# El plan de `documentar` (la obra YA existe)

Cuando el cliente manda fotos, vídeos o su CEE a una oportunidad o expediente que ya está dado de
alta. Más corto que el de `crear`: solo dice qué fichero va a qué apartado. `obra <nº>` lista los
apartados de ESA obra (con el alcance ya podado) y cuántas fotos tiene ya cada uno.

```json
{
  "obra": "26RES080_OP52",
  "chat": { "nombre": "RES080 Maria José Valdepeñas", "telefono": "34646359217", "cuando": "02/10/2026 12:14–12:29" },
  "documentos": [
    { "fichero": "01_CEE.pdf", "slot": "DOC_CEE_EXISTENTE", "wa_msg_id": "false_…" },
    { "fichero": "02_foto.jpg", "slot": "FOTO_VENTANAS_ANTES", "ventana": "nueva", "ventana_nombre": "Puerta de entrada", "wa_msg_id": "false_…" },
    { "fichero": "03_foto.jpg", "slot": "FOTO_VENTANAS_ANTES", "ventana": "nueva", "wa_msg_id": "false_…" },
    { "fichero": "06_foto.jpg", "slot": "FOTO_CALDERA_ANTES", "wa_msg_id": "false_…" },
    { "fichero": "09_video.mp4", "slot": "VIDEO_VIVIENDA", "wa_msg_id": "false_…" }
  ],
  "decisiones": ["El CEE dice que el ACS es un termo eléctrico; la simulación, que lo da la caldera: revisar"]
}
```

| Clave | Qué es | Notas |
|---|---|---|
| `obra` | nº de oportunidad (`26RES080_OP52`) o de expediente (`26RES080_87`) | `--op` en la orden manda sobre éste |
| `documentos[].slot` | cualquier apartado que `obra` liste para ESA obra | Se valida contra su checklist real: uno podado por el alcance no se acepta |
| `documentos[].ventana` | `"nueva"` o `"V3"` | Solo en `FOTO_VENTANAS_ANTES/_DESPUES`: una ventana por foto. `nueva` numera detrás de las que ya tienen foto; en el DESPUÉS se usa el id de la ventana de antes que corresponde |
| `documentos[].ventana_nombre` | «Puerta de entrada», «Cocina»… | Solo si se ve sin duda; si no, sin nombre (se pone en la app) |
| `decisiones[]` | lo decidido y lo que hay que revisar | Va al historial de la oportunidad |

Todo va a «12. DOCUMENTOS PARA CEE» con el nombre de su apartado (`FOTO_VENTANAS_ANTES_1.jpg`…) —
salvo las facturas (`DOC_FACTURAS`), que van a «5. FACTURAS»—, los mensajes de WhatsApp quedan
apuntados como colocados y el historial dice qué llegó y adónde fue.

**Qué va a cada apartado** (además de la tabla de arriba)

| Lo que llega | Apartado |
|---|---|
| Ventanas, balconeras, puerta de entrada que se cambian (RES080) | `FOTO_VENTANAS_ANTES`, una ventana por foto |
| El tejado o la cubierta que se rehace | `FOTO_CUBIERTA_ANTES` |
| El cuarto de la caldera (aunque no se vea la caldera entera) | `FOTO_CALDERA_ANTES` |
| Vídeo recorriendo la casa | `VIDEO_VIVIENDA` |
| Un termo, un baño, algo que no tiene apartado en ESTA obra | `OTROS_ANTES` (y, si contradice la simulación, a `decisiones`) |
