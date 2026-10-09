<!-- conocimiento · área: envolvente-ce3x · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «GENERAR el CEE inicial desde las fotos — skill `generar-cee-inicial` (2026-09-29)»; la introducción y el resto, en esta misma carpeta.

### Con un VÍDEO en vez de fotos — y si no se puede, se PREGUNTA (2026-10-06)

Muchos clientes no mandan fotos de las fachadas sino un vídeo andando por la casa (el apartado
`VIDEO_VIVIENDA`). Medido sobre los vídeos reales de 26RES060_197, _199 y _OP260: **casi siempre es
de DENTRO**, con las persianas o los estores bajados. La skill lo lee y, lo que no puede saber, se lo
pide al propietario por WhatsApp en vez de adivinarlo.

| Qué | Dónde |
|---|---|
| Subir el vídeo a la File API, leerlo, y la 2ª lectura de los fotogramas | [videoEnvolventeService.js](implementation/backend/services/videoEnvolventeService.js) |
| A qué pared va cada hueco, qué se pide, la propuesta para el plan (puro) | [utils/videoEnvolvente.js](implementation/backend/utils/videoEnvolvente.js) |
| Fotogramas (el más nítido de ±0,7 s), hojas de contactos, mosaico | [scripts/cee_inicial_video.py](implementation/backend/scripts/cee_inicial_video.py) (OpenCV; si no, `ffmpeg` + Pillow) |
| Las órdenes | `cee_inicial.js video` · `pedir-fotos` · `aplicar` con `frame:H3` · `leer-pared --fotos frame:F1` |
| El mensaje al propietario | `paredesFotosMsg` en [recordatorios.js](implementation/backend/services/recordatorios.js) |
| «Esperando las fotos» | `agenteIa.esperar` → `cee.agente_ia[fase].esperando`, lo dice `agente_ia.js cola` |
| Pruebas | `node implementation/backend/scripts/test_video_envolvente.js` |

**REGLA — el modelo DESCRIBE; la pared la decide el CÓDIGO.** Al modelo no se le da el plano (si
supiera que hay «una fachada a la calle y dos a un patio», encajaría lo que ve en eso). Devuelve de
cada hueco el momento en que mejor se ve, su planta, el tipo y **a qué da** con lo que se ve por él;
`asignarHuecos` lo pone en la pared solo si, **en su planta, es el único LADO** (fachadas apiladas de la
misma orientación y línea) que encaja. **Patio y espacio libre de la parcela cuentan igual** — desde
una ventana no se distinguen, y en _197 el código elegía «patio» y la ventana era del espacio libre —;
lo que se distingue es la **calle**. Varios lados posibles → **dudoso**, con sus candidatas.

**REGLA — DOS lecturas, de dos modelos.** El vídeo lo mira `gemini-3.6-flash` (con el audio; sitúa
mejor las plantas y no se inventa medidas sin referencia) y cada fotograma, quieto, `gemini-2.5-flash`.
Si el fotograma enseña el hueco **con la persiana o el estor bajados**, lo que dijo el vídeo de a qué da
**no vale** (en _197 el salón «daba a la calle» con la persiana bajada, y su pared real no tiene calle);
si las dos dicen cosas distintas, no se decide. Confianza **alta** solo con las dos de acuerdo.

**REGLA — las marcas de tiempo se piden como «MM:SS» y las convierte el código** (`segundosDe`).
Pedidas como número, el modelo mezclaba los formatos: en OP208 (3:56) devolvió el «352» y el «300»
—3:52 y 3:00 sin los dos puntos— y los huecos de la planta baja salían recortados al final.

**REGLA — lo que no se puede saber NO se adivina: se pide.** `pedir-fotos` compone el WhatsApp con
**una foto por LADO de la casa** (todas sus plantas: el plan de fotos del motor va por planta y en _197
daba 7 peticiones para 4 lados), numeradas, con el **plano de cada una con la pared en rojo** detrás, y
pidiendo que las mande **por WhatsApp con su número** (el enlace de subida tiene una casilla para la
fachada y otra para los patios: con tres paredes en la misma casilla no se sabría cuál es cuál). «No
tiene ventanas» es una respuesta válida y se dice. **En seco por defecto**; `--enviar` solo con el «sí»
del usuario para ese mensaje, y entonces espera a que el texto salga (`whatsapp_queue` en SENT) antes de
mandar los planos — si no, llegarían antes que el texto que los explica.

**Lo que SÍ da casi siempre: el RECUENTO por planta.** Contra lo que confirmó el técnico: en _197 el
vídeo contó exactamente lo mismo (PB 3 ventanas + entrada + puerta al patio; P1 4 balconeras + 2
ventanas) y en _199, 5 + entrada en PB (exacto) y 8 frente a 7 en P1. Sirve para comprobar las fotos
que lleguen después. Si el vídeo ve más plantas que Catastro (escalera con descansillo: _197 contó 3 de
2), se toman por la más cercana y todo baja a «media». Lo visto desde el garaje no se pone. Las medidas
las estima el modelo con una referencia de la imagen y nacen dudosas (sin referencia, la de por defecto).

La lectura se cachea en bruto (`…/video/lectura.json`) y se vuelve a normalizar: cambiar las reglas no
obliga a volver a pagarla.

#### Y el AUDIO, aparte: lo que se DICE junto a cada ventana (2026-10-09)

Lo pidió Fran con 26RES060_226: «cuando nos envíen un vídeo, extrae el audio además de los
fotogramas; uniendo audio y vídeo identificarías dónde están las ventanas». La lectura del vídeo ya
recibía el sonido, pero solo devolvía un resumen (`narracion`) sin ligarlo a ningún hueco, y quien
escribe el plan no oye nada: ve fotogramas. En el 226 la hija del titular grabó los patios por FUERA
diciendo «este sería un patio de luces con dos ventanas, que son dos baños, y la puerta del pasillo»
y «las ventanas que se ven desde el patio de abajo», y la lectura dejó esas ventanas «dudosas» entre
20 fachadas.

| Qué | Dónde |
|---|---|
| Sacar la pista de sonido (`audio_1.aac`) | `cee_inicial_video.py audio`: con `ffmpeg` copia la pista; sin él (el PC no lo tiene) lee las tablas del MP4/MOV (`stsd`/`esds`, `stsz`, `stsc`, `stco`) y escribe cada trama AAC con su cabecera ADTS, sin recodificar (un MP3 dentro se copia tal cual) |
| Transcribirla LITERAL, frase a frase con su `t`/`t_fin` y lo que NOMBRA (huecos, «da a», planta, habitación) | `transcribir` + `normalizarTranscripcion` en [videoEnvolventeService.js](implementation/backend/services/videoEnvolventeService.js) (`gemini-2.5-flash`, sin pensar; en línea hasta 14 MB, si no por la File API; sin pista sacada, oye el propio vídeo) |
| Lo que se dice junto a cada hueco, como lectura de a qué da | `frasesCerca`, `conLoDicho`, `daAFirme` en [utils/videoEnvolvente.js](implementation/backend/utils/videoEnvolvente.js) |
| La hoja de contactos con SUBTÍTULOS y el mosaico con lo dicho | `hoja --subtitulos` y `mosaico` (`dice`) en `cee_inicial_video.py` |

**REGLA — se TRANSCRIBE, no se interpreta.** El modelo copia lo que se dice y solo marca lo que la
frase NOMBRA; qué hueco es y en qué pared va lo sigue decidiendo el código.

**REGLA — lo dicho es una lectura MÁS, con su peso.** Cuenta lo que se oye de 6 s antes a 4 s después
del segundo del hueco (se nombra lo que se va a enseñar). Si el vídeo y el fotograma no dejan ver a qué
da (persiana bajada) vale lo dicho, pero a confianza MEDIA; si lo visto y lo dicho coinciden (patio =
jardín, como en `ENCAJE`) es firme, ALTA; si se contradicen, no se decide; y si cerca del hueco se
nombran dos cosas distintas, solo se enseña.

Medido en el 226: 60 s de vídeo, 6 frases desde el 0:29, transcritas en 3,5-4,7 s (~2.400 tokens). El
audio dijo lo que el código no podía: que la terraza de arriba está sobre la casita, que hay DOS
patios de luces (el de abajo con la cocina y el de arriba con los baños) y desde dónde se graba cada
uno. Con eso y las coordenadas del plano se casaron 20 huecos de patio; el vídeo solo no pasaba de la
puerta de entrada.

⚠️ De paso: `aplicar` numeraba los huecos del plan desde cero aunque se conservaran los de otras
paredes, y salían dos «P1» (CE3X enlaza los puentes térmicos por el nombre y el motor no escribe el
`.cex`). Ahora la numeración salta los nombres ya ocupados. Coste medido: 0,01-0,07 € por vídeo, 30-90 s. El vídeo va a la File API del
proyecto de PAGO y se borra al terminar. ⚠️ El contenedor del asistente necesita `ffmpeg` (añadido al
Dockerfile: hay que reconstruirlo).
