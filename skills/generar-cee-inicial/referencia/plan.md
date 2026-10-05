# El plan de `aplicar`

Un JSON escrito por quien ha mirado las fotos. Todo es opcional salvo lo que se quiera escribir.

```json
{
  "aerotermia_id": 565,
  "placa_aerotermia": {
    "exterior": { "marca": "MIDEA", "modelo": "MHC-V12WD2N7-E30",
                  "numero_serie": "541S7757904A3150100002", "potencia_kw": 12, "refrigerante": "R290" },
    "interior": null
  },
  "caldera": { "nombre": "CALDERA SERRA CALOR", "potencia_kw": 43, "da_acs": false },
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
  "reemplazar": false,
  "ajustes": {}
}
```

| Clave | Qué es | Notas |
|---|---|---|
| `aerotermia_id` | id del catálogo `aerotermia` | En una oportunidad va a los inputs (SCOP del catálogo, temperatura por el emisor) |
| `placa_aerotermia` | lo leído de la placa | Solo metadatos (`inputs.placa_ocr`): el expediente hereda el nº de serie al nacer |
| `caldera.nombre` | nombre del equipo en CE3X | Lo que dice la placa/frontal. Sin marca legible, se omite |
| `caldera.potencia_kw` | potencia **útil** de la placa | En una oportunidad va también a `inputs.potenciaCaldera` |
| `caldera.da_acs` | `false` si el ACS lo hace otro aparato | La caldera pasa a «Equipo de sólo calefacción» |
| `acs_aparte` | el termo (o lo que dé el ACS) | Efecto Joule, electricidad, 100 % del ACS. `litros` solo si se ven |
| `ventanas` | cómo son las ventanas de la vivienda | `vidrio`: Simple · Doble · Doble bajo emisivo. `marco`: Metálico sin RPT · Metálico con RPT · PVC · Madera |
| `entrada` | la pared por la que se entra | Tiene que ser una fachada |
| `huecos[pared]` | los huecos de esa pared | Nombres (`V1`, `P1`) los pone el script. Nacen `dudoso` salvo `"estado":"medido"` |
| `huecos[].foto` + `box` | dónde está el hueco en esa foto | Fracciones del encuadre (el `box` que devuelve `leer-pared`) |
| `huecos[].persiana` | persiana de ESE hueco | Por defecto hereda la de la vivienda; una puerta nunca |
| `huecos[].porc_marco` | % de marco | Puerta de entrada 90 (defecto), de patio acristalada 30-40 |
| `fotos[pared]` | fotos que se pegan a la pared | Solo las de «12. DOCUMENTOS PARA CEE» (fachada, patios, ventanas) |
| `excluidas` | paredes apartadas de la envolvente | Por id |
| `pilares` | pilares integrados contados, `{ "FBN2": 0 }` | Se estiman uno cada 3,5 m con mínimo 2: en un quiebro de 30 cm hay que ponerlo a 0 (a 0 no se escribe el puente) |
| `cuerpos_fuera` / `zonas_fuera` | lo que no es vivienda | Se vuelve a medir. `zonas_fuera`: `[{ "nivel": 0, "uso": "GARAJE"\|"ALMACEN"\|"ESPACIO NO HABITABLE"\|"PORCHE", "poligono": [[x,y],…] }]` en EPSG:25830 (`paredes` imprime las esquinas del edificio). **Solo si el polígono es conocido**: los de la PROPUESTA «DEL CROQUIS CATASTRAL (exacta)» lo son —se copian tal cual—, y los cuerpos que el croquis dice que sobran (`→ sobra en los niveles…`) van a `cuerpos_fuera` por su id |
| `croquis` | DÓNDE está lo que no es vivienda, a mano alzada | `uv` = fracciones de la huella de esa planta (u de OESTE a ESTE, v de SUR a NORTE); o `poligono` en EPSG:25830. El motor lo endereza, lo **ajusta a los m² de Catastro** del uso en esa planta, alinea las paredes y lo guarda como `zonas_fuera`. Sustituye las zonas de SUS plantas. Pasarse por fuera de las paredes no importa (`-0.05`, `1.05`). `croquis_ajustar: false` = tal cual |
| `reemplazar` | `true` = los huecos del plan sustituyen a TODOS los guardados | Por defecto se sustituyen solo las paredes que trae el plan |
| `ajustes` | cualquier otro ajuste de la ventana, tal cual | Se funden sobre los guardados |
| `medidas` | las medidas de mejora que se escriben (`["autoconsumo"]`, `["aerotermia"]`…) | Sin la clave, las que trae marcadas la fase. El autoconsumo necesita sus kWh: del CEE cargado o tecleados en `ajustes.autoconsumo_kwh` (en un CEE directo, siempre tecleados) |

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
