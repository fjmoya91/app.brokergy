# Cuando el cliente manda un VÍDEO en vez de fotos

Muchas veces no llegan fotos de las fachadas sino un **vídeo andando por la casa** (el apartado
`VIDEO_VIVIENDA`: «camina despacio por las habitaciones enseñando las ventanas»). Medido sobre los
vídeos reales de 26RES060_197, _199 y _OP260 (06/10/2026): **casi siempre es de DENTRO**. Así que la
pregunta no es «qué ventanas tiene esta fachada», sino **a qué pared de fuera da cada ventana que se
ve desde dentro**. Eso no se ve en la imagen: se deduce de la PLANTA y de lo que se ve POR la ventana.

## La orden

```bash
node scripts/cee_inicial.js video <clave>                  # los vídeos de «12.» (o «4.» en un CEE directo)
node scripts/cee_inicial.js video <clave> --archivo v.mp4  # uno local (p. ej. bajado del WhatsApp)
node scripts/cee_inicial.js video <clave> --videos <id>    # solo esos de Drive
node scripts/cee_inicial.js video <clave> --refrescar      # vuelve a pedir la lectura (si no, se cachea)
```

No escribe nada. Hace, en este orden:

1. **Baja el vídeo**, mira cuánto dura y si tiene sonido, y **saca su AUDIO aparte** (`audio_1.aac`;
   sin `ffmpeg`, del propio MP4/MOV, sin recodificar).
2. **Gemini lo mira entero** (`gemini-3.6-flash`, con el audio): estancias, plantas y, de cada hueco,
   el momento en que mejor se ve, el tipo, a qué da y qué se ve por él. ~30-60 s y céntimos.
3. **Transcribe el audio LITERAL**, frase a frase con su segundo y lo que nombra (huecos, «da a»,
   planta, habitación): `transcripcion.json`, ~4 s. `--sin-audio` lo salta.
4. Hace la **hoja de contactos** (`hoja_1.jpg`, un fotograma cada ~3 s) con **lo que se dice debajo
   de cada fotograma** (subtítulos): imagen y voz juntas.
5. Saca el **fotograma más nítido** de ±0,7 s de cada hueco (`cee_inicial_video.py`, OpenCV).
6. **Otro modelo** (`gemini-2.5-flash`) mira cada fotograma quieto: si se ve el exterior, a qué da y
   dónde está el hueco en la imagen (la marca para la envolvente).
7. **Lo que se DICE** de 6 s antes a 4 s después de cada hueco cuenta como otra lectura de a qué da
   (`conLoDicho`): con la persiana bajada vale lo dicho (confianza media); visto y dicho de acuerdo,
   alta; en contra, no se decide.
8. **El código** pone cada hueco en su pared (`utils/videoEnvolvente.js`). Lo que no se puede decidir
   queda **DUDOSO** con sus candidatas.
9. Deja `mosaico.jpg` (cada hueco con su fotograma, la pared propuesta y lo que se dice), `fotogramas/`
   y `video.json` con la **PROPUESTA para el plan** (`propuesta.huecos`, `propuesta.fotos`,
   `propuesta.lucernarios`) y la `transcripcion`. El informe lista cada frase con los huecos que se
   ven mientras se dice (`↔ H8 0:45`).

## Cómo decide el código (y por qué tan prudente)

- Las fachadas se agrupan en **LADOS**: la misma orientación y la misma línea en distintas plantas es el
  mismo lado de la casa (FBNO1 abajo y F1NO1 arriba).
- Un hueco va a una pared si, **en su planta**, es el **único** lado que encaja con lo que se ve por él.
  **PATIO y ESPACIO LIBRE DE LA PARCELA cuentan igual**: desde una ventana no se distinguen (en
  26RES060_197 el código elegía «patio» y la ventana era del espacio libre). Lo que sí se distingue es
  la **CALLE** (acera, coches, casas de enfrente).
- **Dos lecturas**: el vídeo y su fotograma. Si el fotograma enseña el hueco con la **persiana o el
  estor bajados**, lo que dijo el vídeo de a qué da **no vale** (en 26RES060_197 el salón «daba a la
  calle» con la persiana bajada, y su pared real no tiene calle). Si las dos dicen cosas distintas, no
  se decide.
- Confianza **alta** solo con las dos lecturas de acuerdo (o la puerta de entrada ya señalada).
- Si el vídeo ve **más plantas** que Catastro (una escalera con descansillo: en _197 contó 3 de 2), se
  toman por la más cercana, se avisa y todo baja a **media**.
- Lo que se ve **desde el garaje** (o trastero, almacén…) no se pone; la puerta del garaje tampoco.
- Las **medidas**: las estima el modelo con una referencia de la imagen (puerta de paso de 2,03 m,
  radiador, altura del techo, el mueble de al lado) y nacen **dudosas**. Sin referencia, o fuera de lo
  plausible, va la de por defecto (1,30 × 1,30). Medido en _199: las ventanas pequeñas de los baños
  salieron 0,9 × 1,0 (reales 0,8 × 0,8), mejor que el defecto.

## Lo que SÍ da casi siempre: el RECUENTO por planta

Comparado con lo que confirmó el técnico: en 26RES060_197 el vídeo contó exactamente lo mismo (PB 3
ventanas + entrada + puerta al patio; P1 4 balconeras + 2 ventanas); en _199, 5+entrada en PB (exacto) y
8 en P1 (el técnico, 7). Aunque no se sepa la pared, **ese recuento sirve para comprobar** las fotos que
lleguen después: si el plan pone 5 huecos en la planta alta y el vídeo vio 7, falta algo.

## Tu trabajo con el resultado

1. **Mira `mosaico.jpg` y la hoja de contactos** (con sus subtítulos) junto a `plano.png` y
   `plano_satelite.png`, y **lee la transcripción**: lo que se dice («hasta ahí la planta baja», «lo que
   da a la terraza», «el patio de luces de los baños») sitúa cada tramo del vídeo. Tú ves más que el
   código: un patio de baldosas con barbacoa que en la vista aérea solo está a un lado, la fachada de
   enfrente que solo puede ser de la calle. Si con eso una pared queda clara, **decídelo tú** en el plan
   y dilo en `decisiones` («H10: el patio de baldosas del fotograma es el SE de la vista aérea»).
   - Para casar un patio con sus paredes: el orden en que aparecen al **girar la cámara** (hacia la
     derecha = sentido de las agujas del reloj visto desde arriba) contra las coordenadas de las paredes
     (`26RES060_XXX.geo.json` de la caché, `svg` con la Y hacia abajo), y lo que se ve **al fondo**
     cuando se graba desde una ventana de arriba. Caso: 26RES060_226.
   - Si hace falta otro momento que el modelo no eligió, saca su fotograma con
     `cee_inicial_video.py fotogramas <vídeo> pedidos.json <carpeta>/fotogramas` y añádelo a
     `video.json → fotogramas` (`M1`…, con `video_nombre` y `video_drive_id`): entra al plan como `frame:M1`.
2. Lo asignado (y lo que tú resuelvas) va al plan: copia de `video.json → propuesta` los huecos de cada
   pared (`foto: "frame:H3"`, su `box`) y **también** `fotos[pared]: ["frame:H3"]` —el `foto` de un
   hueco solo es su marca; lo que se SUBE y se pega a la pared es lo de `fotos`—. Con `aplicar
   --escribir`, cada fotograma se SUBE a «1. CEE / CEE INICIAL / FOTOS ENVOLVENTE», pegado a su pared y
   con el hueco marcado, y queda anotado de qué vídeo y de qué segundo sale.
3. Lo que **no se puede decidir NO se adivina** → se le piden las fotos al propietario (abajo). No
   escribas el `.cex` con huecos en paredes que no sabes; espera a las fotos.
4. Un **lucernario** visto en el vídeo va a `lucernarios` (ya está en la propuesta).

## Pedir las fotos al propietario

```bash
node scripts/cee_inicial.js pedir-fotos <clave>                    # EN SECO: a quién, el texto y los planos
node scripts/cee_inicial.js pedir-fotos <clave> --paredes FBN1,F1NO1   # otras paredes
node scripts/cee_inicial.js pedir-fotos <clave> --enviar           # SOLO con el «sí» del usuario
```

- Sin `--paredes`, pide las que dejó `video` sin resolver (`video.json → pedir`). Lo «por confirmar»
  (confianza media) no se pide solo: añádelo con `--paredes` si no lo ves claro en el mosaico.
- Se pide **UNA foto por LADO** de la casa (con todas sus plantas), numerada, en lenguaje de cliente
  («La pared que da al patio, la que mira al Sureste · Mide unos 11 m · Que salga ENTERA…»), y detrás
  **el plano de cada una con la pared en rojo** (del plan de fotos del motor). Las paredes de menos de
  1,5 m no se piden.
- El mensaje pide que las mande **por WhatsApp diciendo el número** de cada una (el enlace de subida
  tiene una casilla para la fachada y otra para los patios: con tres paredes en la misma casilla
  volvería a no saberse cuál es cuál), y dice que **«no tiene ventanas» es una respuesta válida**.
- Va al **titular o a su persona de contacto** (el mismo criterio que el resto de avisos al cliente).
- **EN SECO por defecto.** Enséñale al usuario el mensaje y los planos; `--enviar` solo con su «sí»
  para ESE mensaje. Con `--enviar`: texto → espera a que salga → planos, y el CEE queda
  **«esperando las fotos»** (lo dice `agente_ia.js cola`) con una línea en el historial.

## Cuando llegan las fotos

1. Por WhatsApp: llévalas a la carpeta con la skill **`alta-oportunidad`** (modo documentar) a
   `FOTO_FACHADA_PRINCIPAL` / `FOTO_PATIOS_INTERIORES`, guiándote por el número que dijo el cliente.
2. `fotos` y `leer-pared` con cada una, como siempre (escala por la puerta).
3. **Cruza con el recuento del vídeo** por planta y con sus fotogramas (una ventana del vídeo ahora
   tiene su pared). Lo que no cuadre, dilo en `decisiones`.
4. `aplicar` como siempre. Los fotogramas útiles pueden ir también a sus paredes (`frame:H3`).

## Coste y requisitos

- ~0,01-0,07 € por vídeo (lectura con audio + comprobación de fotogramas) y unas milésimas la
  transcripción; se cachean en `…/brokergy-cee-inicial/<nº>/video/lectura.json` y `transcripcion.json`
  y no se vuelven a pagar salvo `--refrescar`.
- En el PC hace falta **OpenCV** (`pip install opencv-python`) para los fotogramas; sin él, el
  ejecutable **`ffmpeg`** con Pillow (lo que lleva el contenedor del asistente). El audio no necesita
  ninguno de los dos en un MP4/MOV con AAC o MP3 (el de los móviles y WhatsApp); otro códec, `ffmpeg`.
- El vídeo se sube a la **File API** de Gemini (proyecto de pago) y se **borra** al terminar.
