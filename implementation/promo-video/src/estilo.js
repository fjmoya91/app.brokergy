// ─── El CSS de la app de certificadores, tal cual, dentro del vídeo ─────────
// Se importa la MISMA hoja que pinta cee.brokergy.es (estilo «carta de pago»,
// regla 164): si la app cambia, el vídeo se vuelve a renderizar y sale igual.
// Sus @font-face apuntan a /fonts/… del frontend; aquí se cargan desde
// public/fonts con staticFile y se espera a tenerlas antes de pintar.
import { staticFile } from 'remotion';
import { CSS as CSS_APP } from '../../frontend/src/certificadores/ui/estilo.js';

export const CSS = CSS_APP.replace(/@font-face\{[^}]*\}/g, '');

const FUENTES = [
    ['Antonio', 700, 'Antonio-700-latin.woff2'],
    ...[400, 500, 600, 700, 800].map(w => ['Inter', w, `Inter-${w}-latin.woff2`]),
];

let carga = null;
export function cargarFuentes() {
    if (!carga) {
        carga = Promise.all(FUENTES.map(([familia, peso, fichero]) =>
            new FontFace(familia, `url(${staticFile(`fonts/${fichero}`)}) format('woff2')`, { weight: String(peso) })
                .load()
                .then(f => document.fonts.add(f))));
    }
    return carga;
}
