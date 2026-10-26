# Vídeo promo de cee.brokergy.es

Vertical 9:16 (1080×1920), 30 s a 30 fps, sin sonido. Lo que se ve dentro del móvil son pantallas
recreadas con el CSS (`ui/estilo.js`) y los iconos de la app de certificadores, con datos de demo.
Decisiones y reglas: `docs/conocimiento/certificadores-app/00-la-app-de-certificadores.md` («El vídeo promo»).

## Ficheros

| Qué | Dónde |
|---|---|
| Guion y tiempos (titulares, pantallas, llamada final) | `src/Promo.jsx` (`T`, `TITULARES`, `PANTALLAS`) |
| Las pantallas del móvil | `src/pantallas.jsx` |
| El móvil (marco, isla, barra de estado) | `src/Movil.jsx` |
| Movimiento (todo por número de fotograma) | `src/anim.jsx` |
| Tipografías, logos y fotos de ejemplo | `public/` (las fotos son las del tutorial de la app) |

## Renderizar

```bash
npm install
npx remotion studio src/index.js          # para verlo y ajustar
npx remotion bundle src/index.js --out-dir=out/bundle
npx remotion render out/bundle PromoVertical out/promo-cee-9x16.mp4 --crf=20
npx remotion render out/bundle PromoVertical out/promo-cee-web.mp4 --scale=0.5 --crf=26
npx remotion still out/bundle PromoVertical out/promo-cee-poster.jpg --frame=760 --scale=0.5 --image-format=jpeg
```

En este PC: el puerto 3000 está ocupado (`--port=3477`) y se usa el Chrome de puppeteer
(`--browser-executable=…/chrome-win64/chrome.exe`).

La versión web y el póster se copian a `frontend/public/certificadores/promo-cee.mp4` y `promo-cee.jpg`.
`out/` no va a git.

## Ojo

- Nada de animaciones CSS (`.ca-in`): Remotion pinta cada fotograma por separado.
- La palabra en lima va con `z-index:-1` dentro de un titular con `isolation:isolate`, como en la landing.
- Los textos dicen solo lo que la app hace: sin cifras, testimonios ni logos.
