---
name: alta-aerotermia
description: 'Da de alta (o completa) una AEROTERMIA en el catálogo de BROKERGY a partir de su MODELO, con TODA la documentación que justifica su SCOP: busca en internet la ficha técnica ORIGINAL del fabricante, la ficha y la etiqueta EPREL y el certificado HP KEYMARK, saca de ellos el SCOP/η en clima CÁLIDO y MEDIO a 35 y 55 °C, el COP A7/W55, la potencia y el SEER, y guarda en el catálogo UNA ficha técnica unida (páginas originales del fabricante + EPREL + etiqueta + Keymark + cualquier otro documento que justifique un dato) que se anexa sola a los certificados de cada expediente. Úsalo cuando el usuario pase un modelo de bomba de calor: "da de alta la MHC-V12WD2N7-B2E30", "busca la documentación de esta aerotermia", "justifica el SCOP de este equipo", "mete este modelo en el catálogo", "esta aerotermia no tiene Keymark/ficha". Nunca se inventa ni se compone un documento propio: solo páginas originales, y un número que no esté escrito en un documento no entra.'
---

# Alta de una aerotermia con su documentación

El objetivo: que cuando se justifique un expediente con ese equipo, **la ficha técnica del
catálogo lleve dentro todos los documentos de los que salen los cálculos** (SCOP de calefacción,
SCOP_dhw por el Anexo VI, potencia, SEER), y que cualquiera pueda comprobar cada número.

- **Nada propio, nada inventado.** La FT es la unión de **páginas originales**: del manual del
  fabricante, de la ficha EPREL, de la etiqueta, del informe Keymark, del certificado. Se pueden
  quitar páginas que no aportan (un manual de 30 páginas se queda en las que justifican), nunca
  rehacer, resumir ni escribir encima. Los documentos **enteros** se guardan además en
  `01. FICHAS TECNICAS AEROTERMIA / ORIGINALES / {modelo}` (`--originales`).
- **Todo documento que justifique un dato es bueno, y va como anexo.** Si los rendimientos salen de
  un manual, de un informe de ensayo o de cualquier otro sitio, sus páginas entran en la FT.
- **Un número que no esté ESCRITO en un documento que se guarda no entra en el catálogo.** Lo que no
  se encuentre se deja vacío y se DICE.
- Proyecto Supabase `app.brokergy` → `okfeopwetlxdffrsbfqw`. Se ejecuta en el PC (repo + `.env`):
  en Code por la shell, en Cowork por Desktop Commander. Ver [comun/entorno.md](comun/entorno.md).

## La herramienta

`implementation/backend/scripts/cee_inicial.js` (desde `implementation/backend`):

| Orden | Qué hace |
|---|---|
| `eprel <código> [--out DIR]` | Busca el modelo en EPREL (calefactores, calentadores de agua, aire acondicionado) y baja su **ficha de producto (ES)** y su **etiqueta** de cada registro |
| `keymark <código> --url <titular o subtipo> [--out DIR]` | Recorre los subtipos del titular en heatpumpkeymark.com, elige el patrón **más específico** que case (`MHC-V12WD2N7-B2***`), imprime sus η/SCOP por clima y el COP A7/W35-W55, y baja el **informe** y el **certificado** |
| `alta-aerotermia --json datos.json --ficha … --eprel-fiche … --eprel-label … --anexo … [--originales] [--actualizar <id>] [--escribir]` | Comprueba el SCOP contra su η, une la FT, deja una copia local para mirarla y, con `--escribir`, da de alta (o corrige la fila `--actualizar <id>`) y guarda la FT en el catálogo |

Sin `--escribir` no toca nada. **Siempre primero en seco**, y mirar la copia local de la FT.

## Paso a paso

### 1. ¿Ya está?

```sql
select id, modelo_comercial, modelo_ud_exterior, scop_cal_calido_35, scop_cal_calido_55,
       scop_cal_medio_35, scop_cal_medio_55, cop_a7_55, seer, eprel, url_keymark, ficha_tecnica_partes
from aerotermia where modelo_ud_exterior ilike '%<código>%' or modelo_conjunto ilike '%<código>%';
```

Ojo con los parecidos: **un sufijo cambia el modelo** (`-E30` y `-B2E30` son gamas distintas, con
otros rendimientos). Si la fila existe pero está a medias o mal (sin cálido 35, con el SEER o el
COP de otro modelo, sin ficha del fabricante o sin Keymark), se **corrige** con `--actualizar <id>`;
nunca se duplica. Si un expediente ya la usa, su copia del equipo NO cambia sola: se avisa para
volver a elegir el modelo en Instalación.

### 2. EPREL

```bash
node scripts/cee_inicial.js eprel <código> --out <dir>
```

La ficha EPREL da η (y potencia) en clima **medio** 35/55 y, a menudo, cálido/frío. Suele dejar
**en blanco el cálido a 35 °C** (aparece «- %»): entonces hay que sacarlo del Keymark o del manual.
Si hay varios registros del mismo modelo, se usa el que publique más climas.

### 3. Keymark

El listado completo del Keymark no responde: se busca la página del **titular** en internet
(`heatpumpkeymark <marca> <modelo>` → «GD Midea Heating & Ventilating Equipment Co., Ltd.», etc.;
la URL buena es la `www.heatpumpkeymark.com/en/nc/ps-keymark/certificate-holders/?…holder…`) y:

```bash
node scripts/cee_inicial.js keymark <código> --url "<url del titular o del subtipo>" --out <dir>
```

Recorre los subtipos (tarda unos minutos; la web se cae a ratos con «TYPO3 Exception» y la orden
reintenta). El **informe** (`generatePdf`) trae TODOS los modelos del subtipo: a la FT van la
**portada** y las páginas de **«Model <patrón>»** (4-5 páginas: Average, Colder, Warmer). En el
informe, `EN 14511-2 | Heating` «Low/Medium temperature» son **A7/W35 y A7/W55** → el COP A7/W55.
El **certificado** del organismo (1 página) también va.

### 4. Ficha técnica del fabricante

Buscar el **Technical Data Manual** / Datenblatt / ficha del fabricante (web oficial del fabricante
primero). Comprobar que el documento CUBRE el modelo exacto: los manuales usan comodines
(`MHC-V12WD2N7-B***`) y una «explicación de modelos» al pie (`-BE30` = con resistencia de 3 kW); si
el Keymark y el EPREL dan los mismos η que el manual para ese patrón, el manual vale. De él suelen
salir el **COP A7/W55** (tabla de capacidades «Water 47/55, Ambient 7/6»), la **potencia** y la
**refrigeración** (ηs,c a 7 °C y a 18 °C). Elegir las páginas: portada, tablas ErP (η por clima,
35/55), las fichas de producto donde está el modelo, refrigeración y la tabla A7/W55.

### 5. El datos.json

| Columna | De dónde | Criterio |
|---|---|---|
| `scop_cal_calido_35/55`, `eta_calida_35/55` | Keymark (Warmer) o EPREL | **Obligatorio**: justifica zonas A-D |
| `scop_cal_medio_35/55`, `eta_media_35/55` | Keymark (Average) o EPREL | Zona E y Anexo III |
| `cop_a7_55` | Keymark EN 14511-2 «Medium temperature» o tabla 47/55 del manual | Justifica el SCOP_dhw por el Anexo VI |
| `potencia_calefaccion` | Prated (Keymark/EPREL) | |
| `seer`, `potencia_frigorifica` | Manual: ηs,c **a 18 °C** → SEER = 2,5·(ηs,c+3)/100 | Mismo criterio que el resto del catálogo (id 565); decirlo |
| `refrigerante`, `tipo` (MONOBLOCK/BIBLOCK) | Keymark / manual | |
| `deposito_acs_incluido`, `litros_acs`, `scop_dhw_*`, `eta_acs_*` | Solo si es un CONJUNTO con depósito | Ver `generar-cee-inicial/referencia/alta-aerotermia.md` |
| `eprel` | `https://eprel.ec.europa.eu/screen/product/<grupo>/<registro>` | |
| `url_keymark` | URL del SUBTIPO con su `cHash` | |
| `is_validated` | `false` | Lo valida una persona |

Cuando dos documentos discrepan en decimales (manual 192,7 % y Keymark 192 %), manda el
**certificado** (Keymark/EPREL) y se dice. `SCOP = 2,5·(η+3)/100`: la orden avisa si no cuadran.

### 6. Unir y escribir

```bash
node scripts/cee_inicial.js alta-aerotermia --json datos.json \
  --ficha "manual.pdf:1,3-5,…|<Marca> <gama> · Technical Data Manual (<código doc>)" \
  --eprel-fiche "eprel_fiche_NNN_ES.pdf|EPREL NNN · ficha de producto (ES)" \
  --eprel-label "eprel_label_NNN.pdf|EPREL NNN · etiqueta energética" \
  --anexo "keymark_informe.pdf:1,26-29|HP KEYMARK <registro> · datos <patrón>" \
  --anexo "keymark_certificado.pdf|HP KEYMARK · certificado <registro>" \
  [--actualizar <id>] --originales
# mirar la copia local que imprime («copia para revisarla») y después lo mismo con --escribir
```

- `fichero:páginas` recorta (páginas del ORIGINAL); `|Nombre` es como se enseña la pieza en el
  gestor de anexos («📎 Conjunto de 5 documentos · 21 págs»).
- Un PDF con la estructura dañada (pasa con certificados de organismos) se reescribe con PyMuPDF,
  mismo contenido, y se dice.
- La FT va a `01. FICHAS TECNICAS AEROTERMIA` como `{marca} {modelo} - FT.pdf`; la anterior del
  mismo nombre se archiva en OLD.

### 7. Informe final

Tabla con cada valor y el documento y la página de donde sale; lo que faltó; la fila (id) y el
enlace de la FT; y qué expedientes u oportunidades usan el modelo y deben volver a elegirlo.

## Caso de referencia

**MIDEA MHC-V12WD2N7-B2E30** (M-thermal **Nature** R290 12 kW, 1~, resistencia 3 kW) → **id 571**
(07/10/2026). Otra sesión la había dado de alta a medias (solo EPREL, sin cálido 35, con el SEER y
el COP del modelo `-E30`) y se corrigió con `--actualizar 571`.

| Dato | Valor | Fuente |
|---|---|---|
| η/SCOP cálido 35 · 55 | 269 % / 6,80 · 192 % / 4,88 | Keymark ICIM-PDC-000226 (EPREL no publica el cálido 35) |
| η/SCOP medio 35 · 55 | 194,5 % / 4,94 · 155,4 % / 3,96 | Keymark (EPREL 2603840: 194 % / 155 %) |
| COP A7/W55 | 3,25 (11,9 kW / 3,662 kW) | Keymark EN 14511-2 y TDM MD23IU-051A (pág. impresa 21) |
| SEER · P frigorífica | 7,03 (ηs,c 278,2 % a 18 °C) · 12,0 kW | TDM (pág. impresa 15) |
| Potencia | 12,1 kW (Prated) | Keymark / TDM |

Keymark: titular «GD Midea Heating & Ventilating Equipment», subtipo «M thermal N series 12 14 16
kW» (modelos `-B***` y `-B2***`, mismos datos). El manual de la gama Arctic (`-E30`, 2023) **no**
vale para la B2E30: otros rendimientos (184 % / 142 %) y 65 dB frente a 54 dB.
