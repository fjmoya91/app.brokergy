# Vídeo promo de cee.brokergy.es

Vertical 9:16 (1080×1920), 30 fps. Dos composiciones: `PromoVertical` (30 s, **sin sonido**, la de la
landing) y `PromoVerticalVoz` (la misma con **voz en off**, para anuncios: 42 s, porque la voz pide más
tiempo que los rótulos). Lo que se ve dentro del móvil son pantallas recreadas con el CSS (`ui/estilo.js`) y los iconos de la app de certificadores, con datos de demo.
Decisiones y reglas: `docs/conocimiento/certificadores-app/00-la-app-de-certificadores.md` («El vídeo promo»).

## Ficheros

| Qué | Dónde |
|---|---|
| Guion y tiempos (titulares, pantallas, llamada final) | `src/Promo.jsx` (`T`, `TITULARES`, `PANTALLAS`) |
| Las pantallas del móvil | `src/pantallas.jsx` |
| El móvil (marco, isla, barra de estado) | `src/Movil.jsx` |
| Movimiento (todo por número de fotograma) | `src/anim.jsx` |
| Tipografías, logos y fotos de ejemplo | `public/` (las fotos son las del tutorial de la app) |
| Texto de la voz en off y su estilo | `src/locucion.js` |
| Tramos de la versión con voz (cuándo entra cada frase, qué se estira) | `src/Promo.jsx` (`VENTANAS`) |
| La voz generada (un WAV por frase + `duraciones.json`) | `public/voz/` (va a git) |
| El generador de la voz | `scripts/voz.mjs` |

## Renderizar

```bash
npm install
npx remotion studio src/index.js          # para verlo y ajustar
npx remotion bundle src/index.js --out-dir=out/bundle
npx remotion render out/bundle PromoVertical out/promo-cee-9x16.mp4 --crf=20
npx remotion render out/bundle PromoVertical out/promo-cee-web.mp4 --scale=0.5 --crf=26
npx remotion still out/bundle PromoVertical out/promo-cee-poster.jpg --frame=760 --scale=0.5 --image-format=jpeg
npx remotion render out/bundle PromoVerticalVoz out/promo-cee-9x16-voz.mp4 --crf=20
npx remotion render out/bundle PromoVerticalVoz out/promo-cee-voz-web.mp4 --scale=0.5 --crf=26 --audio-bitrate=96k
```

En este PC: el puerto 3000 está ocupado (`--port=3477`) y se usa el Chrome de puppeteer
(`--browser-executable=…/chrome-win64/chrome.exe`).

La versión web y el póster se copian a `frontend/public/certificadores/promo-cee.mp4` y `promo-cee.jpg`,
y la web con voz a `promo-cee-voz.mp4` (la que pone el botón «Activar sonido» de la landing).
`out/` no va a git.

## La voz en off

Gemini TTS (`gemini-3.8-flash-tts`) con la `GEMINI_API_KEY` del backend (la de pago; nunca va a git ni se
imprime). Si se cambia el texto de `src/locucion.js`:

```bash
node --no-warnings scripts/voz.mjs       # todas las frases → public/voz/
node scripts/voz.mjs --solo 7-firma      # solo una
node scripts/voz.mjs --voz Achird --out out/voces/Achird   # para comparar otra voz
```

Cada toma se transcribe y se repite si no dice exactamente el texto (a veces lee la etiqueta de estilo),
se le quitan los pitidos de principio y final y se apunta lo que dura en `public/voz/duraciones.json`.
`Promo.jsx` reparte los tiempos con eso: hay que volver a hacer el bundle.

Voz elegida: **Umbriel**. Probadas (26/10/2026, mismo texto y misma etiqueta), escuchadas también por
`gemini-3.1-pro-preview` haciendo de director de casting:

| Voz / modelo | Resultado |
|---|---|
| **Umbriel** (3.8 Flash TTS) | La elegida: acento peninsular, tono de tú a tú, dice bien «CE tres equis», «guásap», «XML», y las frases empastan entre sí aunque se generen sueltas |
| Achird (3.8 Flash TTS) | Más plana; las frases suenan sueltas, cada una por su lado |
| Sulafat (3.8 Flash TTS, mujer) | Buena opción femenina en el gancho; no se completó (se acabó la cuota del día) |
| Charon (3.8 Flash TTS) | Se come la «E» de «CE tres equis» |
| 2.5 Pro TTS / 3.1 Flash TTS | Más rígidas; la 2.5 con acento latino |

Cuota: **100 peticiones al día por modelo** (nivel 1) y cada toma gasta de 1 a 4 (las repetidas). Si se
acaba, `voz.mjs` lo dice y hay que esperar al día siguiente.

Sin música: no hay ninguna libre de derechos en el repo. Si se añade, va muy baja (`volume≈0.08`) y con
su licencia al lado.

## Ojo

- Nada de animaciones CSS (`.ca-in`): Remotion pinta cada fotograma por separado.
- La palabra en lima va con `z-index:-1` dentro de un titular con `isolation:isolate`, como en la landing.
- Los textos dicen solo lo que la app hace: sin cifras, testimonios ni logos.
