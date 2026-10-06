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

1. **Baja el vídeo**, mira cuánto dura y si tiene sonido, y hace su **hoja de contactos** (`hoja_1.jpg`).
2. **Gemini lo mira entero** (`gemini-3.6-flash`, con el audio): estancias, plantas y, de cada hueco,
   el momento en que mejor se ve, el tipo, a qué da y qué se ve por él. ~30-60 s y céntimos.
3. Saca el **fotograma más nítido** de ±0,7 s de cada hueco (`cee_inicial_video.py`, OpenCV).
4. **Otro modelo** (`gemini-2.5-flash`) mira cada fotograma quieto: si se ve el exterior, a qué da y
   dónde está el hueco en la imagen (la marca para la envolvente).
5. **El código** pone cada hueco en su pared (`utils/videoEnvolvente.js`). Lo que no se puede decidir
   queda **DUDOSO** con sus candidatas.
6. Deja `mosaico.jpg` (cada hueco con su fotograma y la pared propuesta), `fotogramas/` y `video.json`
   con la **PROPUESTA para el plan** (`propuesta.huecos`, `propuesta.fotos`, `propuesta.lucernarios`).

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

1. **Mira `mosaico.jpg` y la hoja de contactos** junto a `plano.png` y `plano_satelite.png`. Tú ves más
   que el código: un patio de baldosas con barbacoa que en la vista aérea solo está a un lado, la
   fachada de enfrente que solo puede ser de la calle. Si con eso una pared queda clara, **decídelo tú**
   en el plan y dilo en `decisiones` («H10: el patio de baldosas del fotograma es el SE de la vista aérea»).
2. Lo asignado (y lo que tú resuelvas) va al plan: copia de `video.json → propuesta` los huecos de cada
   pared (`foto: "frame:H3"`, su `box`) y `fotos[pared]: ["frame:H3"]`. Con `aplicar --escribir`, cada
   fotograma se SUBE a «1. CEE / CEE INICIAL / FOTOS ENVOLVENTE», pegado a su pared y con el hueco
   marcado, y queda anotado de qué vídeo y de qué segundo sale.
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

- ~0,01-0,07 € por vídeo (lectura con audio + comprobación de fotogramas); se cachea en
  `…/brokergy-cee-inicial/<nº>/video/lectura.json` y no se vuelve a pagar salvo `--refrescar`.
- En el PC hace falta **OpenCV** (`pip install opencv-python`) para los fotogramas; sin él, el
  ejecutable **`ffmpeg`** con Pillow (lo que lleva el contenedor del asistente).
- El vídeo se sube a la **File API** de Gemini (proyecto de pago) y se **borra** al terminar.
