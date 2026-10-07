# El plan de `aplicar`

Un JSON escrito por quien ha mirado las fotos. Todo es opcional salvo lo que se quiera escribir.

```json
{
  "decisiones": [
    "Garaje en la franja norte: la foto de la fachada norte enseña la puerta de cochera",
    "La medianera este no tiene vecino a la vista en la vista aérea, pero Catastro sí: se deja medianera",
    "Sin foto de la fachada oeste: no se ponen huecos ahí"
  ],
  "aerotermia_id": 565,
  "placa_aerotermia": {
    "exterior": { "marca": "MIDEA", "modelo": "MHC-V12WD2N7-E30",
                  "numero_serie": "541S7757904A3150100002", "potencia_kw": 12, "refrigerante": "R290" },
    "interior": null
  },
  "caldera": { "nombre": "CALDERA SERRA CALOR", "marca": "SERRA CALOR", "modelo": "SC 40",
               "numero_serie": "123456", "potencia_kw": 43, "anio": 2004, "combustible": "gasoleo",
               "da_acs": false },
  "acs_aparte": { "nombre": "TERMO ELÉCTRICO THERMOR", "litros": 80 },
  "ventanas": { "vidrio": "Doble", "marco": "PVC", "persiana": true },
  "entrada": "FBE1",
  "huecos": {
    "FBE1": [
      { "tipo": "puerta", "ancho": 1.0, "alto": 2.2, "por_que": "puerta de entrada (foto de la fachada)" },
      { "tipo": "ventana", "ancho": 1.2, "alto": 1.4, "foto": "<driveId>",
        "box": { "x": 0.23, "y": 0.49, "ancho": 0.13, "alto": 0.15 },
        "por_que": "ventana con reja (foto de la fachada)" }
    ],
    "FBO1": [
      { "tipo": "puerta", "ancho": 1.7, "alto": 2.1, "marco": "PVC", "vidrio": "Doble", "porc_marco": 40,
        "por_que": "puerta de patio acristalada" },
      { "tipo": "ventana", "ancho": 2.4, "alto": 1.6, "persiana": false, "por_que": "galería sin persiana" }
    ]
  },
  "fotos": { "FBE1": ["<driveId>"], "FBO1": ["<driveId>", "<driveId>"] },
  "excluidas": [],
  "cuerpos_fuera": [],
  "croquis": [
    { "nivel": 0, "uso": "GARAJE", "uv": [[-0.05, 0.62], [1.05, 0.62], [1.05, 1.05], [-0.05, 1.05]] },
    { "nivel": 0, "uso": "PORCHE", "uv": [[-0.05, 0.25], [0.38, 0.25], [0.38, 0.60], [-0.05, 0.60]] }
  ],
  "zonas_fuera": [],
  "altura_planta": 3.3,
  "lucernarios": [{ "planta": "P1", "ancho": 2.0, "alto": 3.0, "por_que": "lucernario sobre el patio interior" }],
  "aires": true,
  "reemplazar": false,
  "ajustes": {}
}
```

| Clave | Qué es | Notas |
|---|---|---|
| `aerotermia_id` | id del catálogo `aerotermia` | En una oportunidad va a los inputs (SCOP del catálogo, temperatura por el emisor). En un EXPEDIENTE va a su Instalación (como el desplegable, con el ACS del conjunto); si ya tenía otro equipo, hace falta `"aerotermia_sustituir": true` |
| `altura_planta` | altura de planta en m (p. ej. `3.3`) | El motor mide las fachadas con ella y la ficha la declara. Sin ella, la ya guardada o 2,80 |
| `lucernarios` | `[{ "planta": "P1", "ancho": 2.0, "alto": 3.0, "por_que": "…" }]` | En la cubierta de su planta (la de arriba si se omite). Cada planta del plan sustituye la suya. Nacen dudosos |
| `aires` | `true` (los que confirmó el cliente) o `{ "n": 2, "modo": "refrigeracion", "potencia_kw": 4.65 }` | CAE: máquina frigorífica de sólo refrigeración; CEE directo: `climatizacion`. Sustituyen a los aires ya puestos, nunca se suman. `potencia_kw` = la de refrigeración de cada aparato (split doméstico: 3.000-5.000 frigorías ≈ 3,5-5,8 kW); sin ella, la de por defecto |
| `placa_aerotermia` | lo leído de la placa (`exterior` / `interior`: marca, modelo, nº de serie) | EXPEDIENTE: los nº de serie van a su Instalación (solo huecos, como «Leer placas»). OPORTUNIDAD: a `inputs.placa_ocr` y el expediente los hereda al nacer. `serie_dudosa: true` = ese nº no se escribe |
| `caldera.nombre` | nombre del equipo en CE3X | Lo que dice la placa/frontal. Sin marca legible, se omite. Si coincide con «CALDERA {marca} {modelo}» de la app no se pone como ajuste (lo compone la ficha) |
| `caldera.marca` / `modelo` / `numero_serie` | lo que dice la placa | EXPEDIENTE: a la Instalación (caldera de calefacción y, si es la misma, la de ACS), **solo huecos**; lo distinto sale como conflicto y no se toca. OPORTUNIDAD: a `inputs.placa_caldera`. `serie_dudosa: true` si las dos lecturas no coinciden: entonces no se escribe |
| `caldera.anio` / `combustible` | año de fabricación y combustible de la placa (`gas_natural`, `glp`, `gasoleo`, `pellets`, `carbon`, `electricidad`) | No se escriben: se contrastan con la fila de rendimiento (de la que sale el ahorro) y, si no cuadran, se avisa |
| `caldera.potencia_kw` | potencia **útil** de la placa | EXPEDIENTE: a `potencia_caldera_kw` (y `potencia_caldera` si está vacía), solo hueco. OPORTUNIDAD: a `inputs.potenciaCaldera` y a `placa_caldera` |
| `caldera.da_acs` | `false` si el ACS lo hace otro aparato | La caldera pasa a «Equipo de sólo calefacción» |
| `acs_aparte` | el termo (o lo que dé el ACS) | Efecto Joule, electricidad, 100 % del ACS. `litros` solo si se ven |
| `ventanas` | cómo son las ventanas de la vivienda | `vidrio`: Simple · Doble · Doble bajo emisivo. `marco`: Metálico sin RPT · Metálico con RPT · PVC · Madera |
| `entrada` | la pared por la que se entra | Tiene que ser una fachada |
| `huecos[pared]` | los huecos de esa pared | Nombres (`V1`, `P1`) los pone el script. Nacen `dudoso` salvo `"estado":"medido"` |
| `huecos[].foto` + `box` | dónde está el hueco en esa foto | Fracciones del encuadre (el `box` que devuelve `leer-pared`). Un **fotograma del vídeo** va como `"frame:H3"` (lo deja la orden `video` en `video.json → propuesta`, con su `box`); una foto de **Street View**, como `"sv:SV1"` (orden `streetview`) |
| `huecos[].persiana` | persiana de ESE hueco | Por defecto hereda la de la vivienda; una puerta nunca |
| `huecos[].porc_marco` | % de marco | Puerta de entrada 90 (defecto), de patio acristalada 30-40 |
| `fotos[pared]` | fotos que se pegan a la pared | Las de «12. DOCUMENTOS PARA CEE» (fachada, patios, ventanas) por su id, o fotogramas del vídeo como `"frame:H3"`: con `--escribir` se SUBEN a «1. CEE / CEE INICIAL / FOTOS ENVOLVENTE» con el vídeo y el segundo del que salen. `aplicar` busca `video.json` en la carpeta de trabajo (`--video-dir` si está en otra). Las de **Street View**, como `"sv:SV1"`: se suben igual, marcadas con su panorama y su fecha (`streetview.json`; `--sv-dir` si está en otra carpeta) |
| `excluidas` | paredes apartadas de la envolvente | Por id |
| `tipos` / `orientaciones` | «da contra» corregido a mano: `{ "M1S1": "FACHADA" }` y su rumbo `{ "M1S1": "S" }` | Lo mismo que el panel de la pared. Sale avisado en el `.cex`. Una medianera que en realidad da a la calle |
| `croquis_ajustar` | `false` = el croquis «solo enderezar» | Úsalo cuando la planta tenga **otro inmueble** (el garaje del vecino): el ajuste escala los m² de Catastro a la huella entera y los infla |
| `pilares` | pilares integrados contados, `{ "FBN2": 0 }` | Se estiman uno cada 3,5 m con mínimo 2: en un quiebro de 30 cm hay que ponerlo a 0 (a 0 no se escribe el puente) |
| `cuerpos_fuera` / `zonas_fuera` | lo que no es vivienda | Se vuelve a medir. `zonas_fuera`: `[{ "nivel": 0, "uso": "GARAJE"\|"ALMACEN"\|"ESPACIO NO HABITABLE"\|"PORCHE", "poligono": [[x,y],…] }]` en EPSG:25830 (`paredes` imprime las esquinas del edificio). **Solo si el polígono es conocido**: los de la PROPUESTA «DEL CROQUIS CATASTRAL (exacta)» lo son —se copian tal cual—, y los cuerpos que el croquis dice que sobran (`→ sobra en los niveles…`) van a `cuerpos_fuera` por su id |
| `croquis` | DÓNDE está lo que no es vivienda, a mano alzada | `uv` = fracciones de la huella de esa planta (u de OESTE a ESTE, v de SUR a NORTE); o `poligono` en EPSG:25830. El motor lo endereza, lo **ajusta a los m² de Catastro** del uso en esa planta, alinea las paredes y lo guarda como `zonas_fuera`. Sustituye las zonas de SUS plantas. Pasarse por fuera de las paredes no importa (`-0.05`, `1.05`). `croquis_ajustar: false` = tal cual |
| `reemplazar` | `true` = los huecos del plan sustituyen a TODOS los guardados | Por defecto se sustituyen solo las paredes que trae el plan. **Prohibido** si hay paredes corregidas a mano en la pizarra (ver `medir`) |
| `medir` | las medidas de los huecos que una persona dibujó a mano: `{ "FBS1": { "V3": { "ancho": 1.2, "alto": 1.1 } } }` | Lo ÚNICO que el plan puede hacer sobre una pared tocada en la PIZARRA: la pizarra dice que hay una ventana y dónde, no cuánto mide. Se miden con las fotos y quedan `medido`. Por el NOMBRE del hueco |
| `forzar_mano` | `true` = el plan pisa lo dibujado a mano | Solo si el usuario lo pide expresamente: sin esto, `aplicar` **para** si el plan pone huecos, cambia el tipo o aparta una pared tocada en la pizarra, o si lleva `reemplazar` |
| `ajustes` | cualquier otro ajuste de la ventana, tal cual | Se funden sobre los guardados |
| `tecnico` | quién firma el `.cex` | Por defecto **Fran** (no hace falta ponerlo). Otro: su `id_empresa` de `prescriptores`; ninguno: `false`. Un técnico de verdad asignado en la barra manda |
| `medidas` | las medidas de mejora que se escriben (`["autoconsumo"]`, `["aerotermia"]`, `["aerotermia_fv"]`…) | Sin la clave, las que trae marcadas la fase. El autoconsumo necesita sus kWh: del CEE cargado o tecleados en `ajustes.autoconsumo_kwh` (en un CEE directo, siempre tecleados). **`aerotermia_fv`** = UN conjunto con la aerotermia, su equipo de ACS si va aparte y las placas (ver abajo) |
| `medidas_libres` | medidas que NO están en el catálogo de la ventana: `[{ nombre, caracteristicas, otros_datos, inversion, vida_util, instalaciones: [equipos] }]` | Se ponen con `/cex/medida` (los MISMOS escritores que «Poner la medida»): los equipos que asumen un servicio retiran el generador que lo daba. Caso: CEE directo sin aerotermia con «retirar caldera + 2 splits `climatizacion` + termo `ACS` + placas `renovable`» (2026CEE_57). Usa `"medidas": []` para no duplicar |
| `ajustes.autoconsumo_kwh` | kWh/año de las placas | Con presupuesto de FV: **kWp del presupuesto × producción específica de PVGIS** del tejado |
| `ajustes.autoconsumo_pvgis` | la producción específica de PVGIS (kWh por kWp, anual y 12 meses) y con qué tejado | Forma `{ anual, mensual[12], inclinacion, orientacion, optimos, perdidas, montaje, lat, lon, fuente, consultado }`. Con ella salen los kWp y el reparto mes a mes. Sin ella, el backend pregunta con los ángulos ÓPTIMOS, que sobreestiman unas placas coplanares |
| `ajustes.autoconsumo_inversion` | lo que cuestan las placas | Solo lo suma `aerotermia_fv`. Con el MISMO criterio de IVA que la inversión de la aerotermia (la del presupuesto de la oportunidad, que en un particular va con IVA) |

## RES080: el bloque `previsto`

En un RES080 se hacen DOS certificados: el INICIAL y el **PREVISTO** (la casa con toda la obra
hecha). Con `previsto` en el plan, `aplicar` escribe los dos, mete el previsto como la medida de
mejora del inicial («Nuevo Edificio Definido por el Usuario», calculada por CE3X) y carga el XML del
previsto como **CEE FINAL** en la app (de ahí sale el ahorro del RES080). Ver SKILL.md, «RES080».

```json
"cambian": ["FBO1", "F1O1"],
"cubierta_reforma": { "<planta, como la imprime paredes>": { "entera": true } },
"huecos": { "FBO1": [ { "tipo": "ventana", "ancho": 1.2, "alto": 1.1, "cambia": true } ] },
"previsto": {
  "medidas": ["aerotermia"],
  "ventanas": [ { "que": "cambia", "u_marco": 1.3, "u_vidrio": 1.3, "g": 0.43,
                  "permeabilidad": 3, "descripcion": "PVC con doble vidrio bajo emisivo" } ],
  "aislamiento": [
    { "que": "cambia", "elementos": ["cubierta"], "u": 0.30, "descripcion": "lana mineral de 10 cm" },
    { "que": "cambia", "elementos": ["fachada"], "lambda": 0.035, "espesor": 0.06 }
  ],
  "inversion": 18500
}
```

| Clave | Qué | Notas |
|---|---|---|
| `previsto.medidas` | de qué medidas de la ficha salen los EQUIPOS del previsto | Por defecto las de `medidas`. Las placas (`renovable`) NO entran salvo `con_placas: true` |
| `previsto.ventanas[]` | las ventanas nuevas | `que`: `"cambia"` (las marcadas `cambia: true`), `"todos"` o `["V1","P2"]`. Valores de la ficha / catálogo / presupuesto; sin ellos **U marco 1,3 · U vidrio 1,3 · g 0,43 · 20 % de marco · permeabilidad 3**. Una puerta conserva su % de marco |
| `previsto.aislamiento[]` | lo que se aísla | `elementos`: `fachada` · `cubierta` · `suelo` · `particion`; `que` como arriba (las paredes de `cambian`, la cubierta de `cubierta_reforma`). **`u` (o `lambda` + `espesor` en m) SE PREGUNTA al usuario, nunca se supone.** Una medianera no se aísla; un suelo contra el terreno no admite U conocida (CE3X) |
| `previsto.ventilacion` / `masa_particiones` | | **0,53 y «Ligera» siempre** (decisión del usuario) |
| `previsto.nombre` / `caracteristicas` / `otros` / `justificacion` | los textos de la medida del inicial | Sin ellos se componen: los de la aerotermia + «la sustitución de N ventanas… con marco de U = …» + «el aislamiento térmico de la cubierta con … hasta U = …» |
| `previsto.inversion` / `vida_util` | el análisis económico de la medida | Por defecto facturas, o presupuesto + presupuesto de envolvente; vida 30 años si toca la envolvente. Sin inversión CE3X imprime «coste > 100 000» |

## Aerotermia + ACS + placas en UNA medida (`aerotermia_fv`)

Cuando la obra trae la bomba de calor Y unas placas (un presupuesto de FV aparte), el usuario quiere
UN conjunto de medidas con todo lo que se instala, no dos (26RES060_213, 2026-10-05). Son los MISMOS
equipos de las medidas `aerotermia` y `autoconsumo` juntos; los aires existentes se conservan.

1. **El equipo de la aerotermia y el de ACS, en el EXPEDIENTE** (`aerotermia_id` del plan, o en
   Instalación). Sin ellos la medida no existe. Un «aerotermo» del presupuesto es el equipo de ACS
   aparte (p. ej. JOHNSON MANANTIAL 110 R PLUS = catálogo 499/500, SCOP_dhw 3,74, 110 l).
2. **Lee el presupuesto de FV**: nº de módulos × Wp = kWp (12 × 550 Wp = 6,6 kWp), inversor y el
   importe. «Estructura coplanar» = las placas siguen el tejado: NO uses los ángulos óptimos.
3. **PVGIS con el tejado** (desde `implementation/backend`):
   ```js
   const pv = require('./services/pvgisService');
   const u = await pv.resolverUbicacion({ rc: '<RC>' });
   const r = await pv.produccionEspecifica({ lat: u.lat, lon: u.lon,
       inclinacion: 20, orientacion: 25, montaje: 'building' });   // 0 = Sur, + = Oeste
   ```
   La orientación sale del faldón donde van (la normal de esa fachada en el plano; un tejado a dos
   aguas con la cumbrera paralela a la calle tiene un faldón a la calle y otro al patio). Inclinación
   de un tejado de teja ≈ 20° si no se sabe. Dilo en `decisiones`: son supuestos.
4. **Plan**: `"medidas": ["aerotermia_fv"]`, `ajustes.autoconsumo_kwh` = kWp × `r.anual`,
   `ajustes.autoconsumo_pvgis` = `r` (con `consultado`), `ajustes.autoconsumo_inversion` = importe.
   Con `autoconsumo_inversion` guardado, `aerotermia_fv` sale marcada SOLA (en lugar de la de
   aerotermia), así que regenerar desde la ventana de la envolvente no deja fuera las placas.
5. Al calificar en seco (`--calificar`), comprueba que CE3X no se queja de que el autoconsumo pase
   del 90 % del consumo eléctrico de la medida.

## Medir un hueco desde una foto

1. `leer-pared` da la escala por la **puerta de entrada** (2,05 m de alto). Úsala solo si la puerta
   está en el MISMO plano que el hueco: bajo un porche, la pared está más lejos y todo sale más grande.
2. En una foto escorzada el lado cercano sale más grande: estima la escala localmente con algo del
   mismo plano (la puerta, la puerta del garaje ~3 m, una balconera ~2,10 m).
3. La suma de anchos de una planta no puede pasar del largo de la pared (el script lo comprueba en
   la lectura; en el plan, compruébalo tú).
4. Redondea a 5 cm. Es una estimación: por eso nace `dudoso`.

## Una planta con vivienda, garaje y porche en UN cuerpo

Catastro declara los m² de cada uso por planta pero NO su polígono. Sin delimitar, la planta se mide
ENTERA como vivienda (coherente, pero con la superficie de más). Para que salga lo que haría el
certificador hay que decir DÓNDE está cada cosa:

| Zona (`uso`) | Qué sale en el `.cex` |
|---|---|
| `GARAJE` / `ALMACEN` a la misma altura | La pared de la vivienda contra él: **partición VERTICAL** con espacio no habitable. El forjado de la planta de encima sobre él: **partición horizontal NH inferior**. Su suelo no es de la envolvente |
| `PORCHE` (abierto, «PORCHE 100%») | Es **exterior**: la pared detrás, **fachada**; el forjado de encima, **suelo en contacto con el aire** |

Con el `croquis` no hace falta calcular ni un vértice: se dice DÓNDE y los m² salen de Catastro.
Ejemplo real (26RES060_OP246, Catastro PB: vivienda 39 · aparcamiento 122 · porche 36): «garaje =
franja norte» + «porche = mancha trasera (oeste) en medio» → garaje en L de 121 m² que envuelve el
porche (35,7 m²) y vivienda en la franja sur (38,6 m²), con las paredes alineadas.

Nunca «garaje/espacio enterrado» bajo la planta baja si no hay sótano. Sin saber dónde están, se
PREGUNTA (o se pinta en la ventana con «✏️ Croquis»): inventar la topología es inventar la
superficie calefactada.

### `decisiones` — el porqué, para quien revise

Frases cortas (una por decisión, ≤ 300 caracteres, 12 como mucho) con lo que **no** se ve en el
plano: por qué el garaje va donde va, qué foto se usó para qué fachada, qué se descartó y por qué,
qué se ha supuesto. No repitas lo que el script ya resume solo (aerotermia, caldera, zonas, huecos
por pared, paredes reclasificadas). Se guardan en el sello del Agente IA (`cee.agente_ia[fase].decisiones`)
y se ven en la banda de la ventana de la envolvente y en el croquis PDF.

