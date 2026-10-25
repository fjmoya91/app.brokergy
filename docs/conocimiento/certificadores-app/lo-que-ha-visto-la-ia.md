<!-- conocimiento · área: certificadores-app · las rutas de los enlaces son relativas a la raíz del repo -->

## «Lo que ha visto la IA» — la fase 5 de la ficha (2026-10-25)

Lo pidió Fran en «MEJORAS APP CEE» (`C:\Proyectos\MEJORAS APP CEE.docx`): muchas preguntas del
cuestionario se contestan solas con el Catastro y con lo que se ve en las fotos; que la IA lo mire
**antes de gastar el crédito**, gratis, y que el certificador solo **confirme** o conteste las dudas.
Y de paso: «al no tener todas las respuestas no me deja generar» → el barrido ya solo bloquea lo que
la IA no puede sacar de ningún sitio.

### La ficha por fases

Una fase por pantalla (`?fase=<id>` en la URL), en este orden (`FASE_IDS` en
[cuestionario.js](implementation/frontend/src/certificadores/logic/cuestionario.js); lo que pinta cada
una, en [fasesFicha.js](implementation/frontend/src/certificadores/obra/fasesFicha.js)):

1. `inmueble` — la vivienda (Catastro) · 2. `titular` · 3. `proposito` — para qué es (**varios a la
vez**: `cuestionario.propositos`; la columna `proposito` guarda el primero, por compatibilidad) ·
4. `fotos` — el propietario por enlace o el certificador en la vivienda · 5. `visto_ia` — lo que ha
visto la IA · 6. `generar` — medidas de mejora, equipos sin placa y «Pedir el certificado».

Las fases hechas se resumen arriba en una tarjeta con «Cambiar». `cuestionario.fases_ok` guarda las
confirmadas (solo ids de `FASE_IDS`).

> `fasesFicha.js` se llamaba `fases.js`: en Windows `import './Fases'` encontraba antes `fases.js`
> que `Fases.jsx` (el disco no distingue mayúsculas) y el build fallaba. **Un fichero de lógica no
> se llama como un componente cambiando solo la mayúscula.**

**REGLA — el barrido solo BLOQUEA referencia catastral, dirección y municipio, nombre del titular y
«para qué».** Todo lo demás es un aviso («la IA completará N cosas, se puede pedir igual»): lo que
falte lo pone la IA con lo de su época o lo habitual, y queda dicho con su origen.

### De dónde sale cada dato: el ORIGEN

Cada dato deducido lleva su origen en `cuestionario.origen[clave]` (`ORIGENES`); **un valor sin
origen lo contestó el certificador y nada lo pisa nunca.** Cuánto vale cada origen (`RANGO_ORIGEN`):

| Origen | Etiqueta | Rango | ¿Dato o supuesto? |
|---|---|---|---|
| `HABITUAL` | Lo habitual | 1 | supuesto |
| `EPOCA` | Su época | 2 | supuesto |
| `STREETVIEW` | Street View | 3 | supuesto |
| `FOTO` | Fotos | 4 | dato |
| `CATASTRO` · `PLACA` | Catastro · Placa | 5 | dato |

- Uno peor no pisa a uno mejor (lo de la época no pisa lo que se vio en Street View).
- **Un supuesto no quita una duda**: si el tipo de casa solo lo dice Street View, se sigue
  preguntando si es aislada, pareada o adosada (`duda()` y `esCasa` en `deduccionesCatastro`).
- Al generador le llega el valor con su origen en palabras («Casa adosada (visto en las fotos)»).

### La pantalla: el guion de CE3X (25/10/2026, segunda vuelta)

Fran, con la primera versión delante: «que siga el mismo guion que con CE3X para que la curva de
aprendizaje sea más rápida» y «menos preguntas, ir más a lo directo». La fase 5 ya no es una lista de
preguntas: son **las pestañas de CE3X** (`PESTANAS_CE3X` en
[fasesFicha.js](implementation/frontend/src/certificadores/obra/fasesFicha.js)) —Datos generales ·
Envolvente térmica (Cubierta, Muro de fachada, Partición interior, Suelo, Huecos) · Instalaciones
(el equipo de calefacción con el nombre que le da CE3X según sea solo calefacción, mixto o bomba de
calor; ACS; refrigeración; contribuciones)— con **UNA línea por elemento** (`lineaElemento`: lo que
hay en una frase, sus notas y el origen menos fiable). «Cambiar» abre las preguntas de ese elemento
(las mismas de `pasos.js`, por `PREGUNTA_POR_CLAVE`); un elemento sin nada dice «Sin dato: CE3X pondrá
lo de su año». Las dudas (las de la IA primero; las del Catastro si la IA no pregunta ya lo mismo)
van arriba, cortas y con foto. En [VistoIa.jsx](implementation/frontend/src/certificadores/obra/VistoIa.jsx).

Lo del Catastro y la época lo deduce la pantalla (`deduccionesCatastro`, puro, sin red); lo que hay
que VER lo mira el servidor (abajo). `aplicarDeducciones` mete los dos en el formulario y se guarda
con el autoguardado; `contestar` escribe la respuesta a una duda (sin origen: la contestó él).

### Lo que mira el servidor — `POST /api/certapp/obras/:id/visto-ia`

[vistoIa.js](implementation/backend/services/certapp/vistoIa.js), con `certappOnly` +
`obraDeLaCuenta` (ajena 404) y solo en BORRADOR (409 `OBRA_CERRADA`; archivada, 409 `ARCHIVADA`).

- **Las fotos**: hasta 14 imágenes y 15 MB, las que más dicen primero (fachada principal 3, fachadas
  3, ventanas 2, cubierta, patios, placa de la caldera 2, caldera, placa y equipo de aerotermia y de
  termo, aire exterior, placas solares). Cada una va rotulada «FOTO n · apartado».
- **Street View, solo si no hay fotos de fachada** y la obra tiene coordenadas: metadata (gratis) y
  una imagen con el rumbo del panorama a la casa (~0,007 €). La clave nunca va al navegador.
- **Gemini** (`llamarGemini`, pensar 2048, 6000 tokens, 120 s) con esquema: `datos[{clave, valor,
  confianza, foto, por_que}]` y `dudas[{clave, pregunta, opciones[{label, valor}], foto, por_que}]`.
  Solo las claves que se ven (`VISIBLES`: tipo de edificio, plantas, cubierta, fachada y su
  aislamiento, marco, vidrio, persianas, calefacción y caldera, emisor, marca, potencia, año, ACS,
  litros, aires y placas).

**REGLA — no escribe en la obra: PROPONE.** Devuelve la propuesta; la pantalla la aplica sin pisar
lo contestado. Así el servidor no compite con lo que se está tecleando.

**REGLA — solo lo que se VE.** Lo de confianza baja se descarta; un «no hay» no se concluye por no
verlo (`aire_acondicionado: false` y `placas_fv: 'NO'` desde Street View se ignoran); una duda solo
si es sobre algo que se ve en una foto concreta, con al menos dos opciones, y como mucho seis. El
origen: `PLACA` si sale de la foto de una placa, `FOTO` si de otra foto, `STREETVIEW` si de la calle.

Respuesta:

```json
{ "at": "…", "propuesta": { "valores": {}, "origen": {}, "notas": {}, "fotos": {} },
  "dudas": [], "fuentes": { "fotos": 3, "streetview": false, "placa": true },
  "uso": { "hoy": 2, "max_dia": 15 } }
```

Sin nada que mirar (ni fotos ni Street View) → resultado vacío, sin llamar a nadie y sin gastar tope.

**REGLA — gratis para el certificador, con tope**: `CERTAPP_VISTO_IA_MAX_DIA` por cuenta y día (15,
desde las 00:00 de Madrid) y `CERTAPP_VISTO_IA_MAX_OBRA` por obra (6), contados en `certapp_eventos`
(tipo `VISTO_IA`), más una reserva en memoria para que dos clics a la vez no pasen los dos.

| Código | Cuándo |
|---|---|
| 409 `VISTO_IA_EN_CURSO` | Ya se está mirando esa obra |
| 429 `VISTO_IA_TOPE` · `VISTO_IA_TOPE_OBRA` | Tope del día · de la obra |
| 503 `VISTO_IA_APAGADO` · `VISTO_IA_SIN_CLAVE` | `CERTAPP_VISTO_IA_ENABLED=false` · sin `GEMINI_API_KEY` |

### Lo medido (25/10/2026)

En seco sobre 2026EXT_2 (Argamasilla de Alba, 2004): 14 s, 5 datos y 3 dudas, menos de 0,01 € por
vez. En seco = `mirar(obra, cuenta, { dry: true })`: mira y devuelve, pero no apunta el evento.

Tras tocarlo: `test_certapp_unidad.js` (deducciones, orígenes, `convertir`, `elegirFotos`) y
`test_certapp_rutas.js` (visto-ia ajena 404 y pedida 409).
