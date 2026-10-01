/**
 * Las FOTOS de las paredes desde el teléfono (el croquis móvil): qué pared hay
 * bajo el dedo, y la foto lista para subir.
 *
 * Lo geométrico es puro y se prueba desde Node
 * (`scripts/test_foto_movil.mjs`); `prepararFoto` necesita el navegador.
 */

/** Distancia de un punto a una polilínea (en las unidades del lienzo: metros). */
export function distanciaAPared(p, svg) {
    let mejor = Infinity;
    for (let i = 1; i < (svg || []).length; i++) {
        const [ax, ay] = svg[i - 1], [bx, by] = svg[i];
        const dx = bx - ax, dy = by - ay;
        const l2 = dx * dx + dy * dy;
        const t = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / l2)) : 0;
        const d = Math.hypot(p[0] - (ax + t * dx), p[1] - (ay + t * dy));
        if (d < mejor) mejor = d;
    }
    return mejor;
}

/**
 * La pared que hay bajo el dedo: la MÁS CERCANA dentro de `radio`. Con dos
 * paredes cerca gana la más próxima — un dedo no apunta con precisión de ratón,
 * así que el radio es generoso, pero nunca elige una pared lejana.
 * Solo paredes con `id` (las que tienen dónde guardar su foto).
 */
export function paredEnPunto(muros, p, radio) {
    let elegida = null, mejor = radio;
    for (const m of muros || []) {
        if (!m?.id) continue;
        const d = distanciaAPared(p, m.svg);
        if (d <= mejor) { mejor = d; elegida = m.id; }
    }
    return elegida;
}

/** El punto que queda a mitad del recorrido de una pared (para su distintivo). */
export function mitadDePared(svg) {
    const tramos = [];
    let total = 0;
    for (let i = 1; i < (svg || []).length; i++) {
        const l = Math.hypot(svg[i][0] - svg[i - 1][0], svg[i][1] - svg[i - 1][1]);
        tramos.push(l);
        total += l;
    }
    if (!tramos.length) return svg?.[0] || [0, 0];
    let falta = total / 2;
    for (let i = 0; i < tramos.length; i++) {
        if (falta <= tramos[i] || i === tramos.length - 1) {
            const t = tramos[i] > 0 ? Math.min(1, falta / tramos[i]) : 0;
            return [svg[i][0] + (svg[i + 1][0] - svg[i][0]) * t, svg[i][1] + (svg[i + 1][1] - svg[i][1]) * t];
        }
        falta -= tramos[i];
    }
    return svg[0];
}

/** Un uid para un hueco (el mismo formato que `nuevoUid` del plano). */
export const uidHueco = () => Math.random().toString(36).slice(2, 10);

/**
 * La foto, lista para subir por datos móviles, y su RELACIÓN DE ASPECTO (con
 * ella el lector cruza la escala de la pared con la de la puerta).
 *
 * Se reduce a 2560 px de lado mayor: sobra para contar ventanas y estimar su
 * medida, y una foto de móvil de 4-5 MB por fachada, en una obra con poca
 * cobertura, es la que se queda a medias. Ante cualquier duda, el ORIGINAL.
 */
export async function prepararFoto(file, { maxLado = 2560, calidad = 0.86 } = {}) {
    if (!file || !(file.type || '').startsWith('image/')) return { file, aspecto: null };
    const url = URL.createObjectURL(file);
    try {
        const img = await new Promise((resolve, reject) => {
            const i = new Image();
            i.onload = () => resolve(i);
            i.onerror = () => reject(new Error('no se puede leer la foto'));
            i.src = url;
        });
        const w0 = img.naturalWidth, h0 = img.naturalHeight;
        const aspecto = h0 ? w0 / h0 : null;
        const escala = Math.min(1, maxLado / Math.max(w0, h0));
        if (escala === 1 && file.size < 1.5 * 1024 * 1024) return { file, aspecto };
        const w = Math.max(1, Math.round(w0 * escala)), h = Math.max(1, Math.round(h0 * escala));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, w, h);
        const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', calidad));
        canvas.width = canvas.height = 0;
        if (!blob || blob.size >= file.size) return { file, aspecto };
        const nombre = (file.name || 'foto').replace(/\.[^.]+$/, '') + '.jpg';
        return { file: new File([blob], nombre, { type: 'image/jpeg', lastModified: Date.now() }), aspecto };
    } catch {
        return { file, aspecto: null };
    } finally {
        URL.revokeObjectURL(url);
    }
}

/** La relación de aspecto de una imagen ya servida (una foto que ya tenía la pared). */
export function aspectoDeUrl(url) {
    return new Promise((resolve) => {
        const i = new Image();
        i.onload = () => resolve(i.naturalHeight ? i.naturalWidth / i.naturalHeight : null);
        i.onerror = () => resolve(null);
        i.src = url;
    });
}
