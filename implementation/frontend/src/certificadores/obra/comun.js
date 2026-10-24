// ─── comun.js — lo que comparten las pantallas de una obra ───────────────────
// Estados, el formulario editable que se compone de la fila de `certapp_obras`,
// lo que se manda al guardar (solo lo cambiado), y la obra «como la ve el
// barrido» (con las fotos de `/docs`). Las preguntas, opciones y fotos NO viven
// aquí: su fuente única es logic/cuestionario.js.
import { CUESTIONARIO_VACIO } from '../logic/cuestionario';

export const ESTADOS = {
    BORRADOR: { label: 'Borrador', chip: 'ca-chip-gris', texto: 'Rellenando el cuestionario' },
    EN_PREPARACION: { label: 'En preparación', chip: 'ca-chip-naranja', texto: 'La IA lo está preparando' },
    LISTO: { label: 'Listo para revisar', chip: 'ca-chip-verde', texto: 'Ya puedes revisarlo' },
    VALIDADO: { label: 'Validado', chip: 'ca-chip-tinta', texto: 'Dado por bueno' },
    ARCHIVADA: { label: 'Archivada', chip: 'ca-chip-gris', texto: 'Archivada' },
};
export const estadoDe = (e) => ESTADOS[e] || { label: e || '—', chip: 'ca-chip-gris', texto: '' };

export const TITULAR_VACIO = { nombre: '', apellidos: '', nif: '', telefono: '', email: '' };

// Las claves de la obra que edita la ficha (PUT /obras/:id parcial).
export const CLAVES_INMUEBLE = ['direccion', 'municipio', 'provincia', 'codigo_postal', 'superficie_catastro', 'anio_construccion'];
export const CLAVES_FORM = ['proposito', 'en_vivienda', 'titular', 'cuestionario', ...CLAVES_INMUEBLE];

const txt = (v) => (v == null ? '' : String(v));

/** El formulario editable de una obra (con los vacíos rellenos: comparar es estable). */
export function formDe(obra = {}) {
    return {
        proposito: obra.proposito || '',
        en_vivienda: obra.en_vivienda === true ? true : obra.en_vivienda === false ? false : null,
        titular: { ...TITULAR_VACIO, ...(obra.titular || {}) },
        cuestionario: { ...CUESTIONARIO_VACIO, ...(obra.cuestionario || {}) },
        direccion: txt(obra.direccion),
        municipio: txt(obra.municipio),
        provincia: txt(obra.provincia),
        codigo_postal: txt(obra.codigo_postal),
        superficie_catastro: txt(obra.superficie_catastro),
        anio_construccion: txt(obra.anio_construccion),
    };
}

const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Las claves que han cambiado respecto a lo último guardado, o null. */
export function cambiosDe(form, persistido) {
    if (!form || !persistido) return null;
    const c = {};
    for (const k of CLAVES_FORM) if (!igual(form[k], persistido[k])) c[k] = form[k];
    return Object.keys(c).length ? c : null;
}

const numONull = (v) => {
    const s = String(v ?? '').replace(',', '.').trim();
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
};

/** Lo que viaja en el PUT (números como números, vacíos como null). */
export function aPayload(cambios) {
    const p = { ...cambios };
    if ('superficie_catastro' in p) p.superficie_catastro = numONull(p.superficie_catastro);
    if ('anio_construccion' in p) {
        const n = numONull(p.anio_construccion);
        p.anio_construccion = n == null ? null : Math.round(n);
    }
    if ('proposito' in p && !p.proposito) p.proposito = null;
    return p;
}

/** La obra como la mira `barrido()`: lo del formulario + las fotos de `/docs`. */
export function obraParaBarrido(obra, form, slots) {
    if (!obra) return {};
    const f = form || formDe(obra);
    return {
        ...obra,
        ...f,
        superficie_catastro: numONull(f.superficie_catastro),
        documentacion: { ...(obra.documentacion || {}), reforma_uploads: slots || obra.documentacion?.reforma_uploads || {} },
    };
}

/** `/docs` → `{ [slot]: [ficheros] }` (acepta `{ slots }` o el objeto suelto). */
export function normalizarSlots(data) {
    const s = data?.slots && typeof data.slots === 'object' ? data.slots : data;
    if (!s || typeof s !== 'object' || Array.isArray(s)) return {};
    const out = {};
    for (const [k, v] of Object.entries(s)) if (Array.isArray(v)) out[k] = v;
    return out;
}

/** Nombre corto para listar una obra. */
export function nombreObra(o = {}) {
    const t = o.titular || {};
    const titular = [t.nombre, t.apellidos].filter(Boolean).join(' ').trim();
    return o.nombre || titular || o.direccion || o.numero_expediente || 'Obra sin nombre';
}

/** Dirección en una línea. */
export function direccionObra(o = {}) {
    return [o.direccion, [o.codigo_postal, o.municipio].filter(Boolean).join(' ')].filter(Boolean).join(', ') || '—';
}

// ── Reducir las fotos antes de subirlas ──────────────────────────────────────
// En la visita se sube por datos móviles: una foto de 5 MB por placa son minutos.
// Se reduce a 2.560 px por el lado largo (las placas se siguen leyendo) en JPEG
// 0,86. Solo JPEG/PNG/WebP que pesen más de 1,5 MB; el resto (HEIC, vídeo, PDF)
// se sube tal cual. Si algo falla, se sube el original.
export async function reducirImagen(file, lado = 2560, calidad = 0.86) {
    try {
        if (!/^image\/(jpeg|png|webp)$/i.test(file.type) || file.size < 1.5 * 1024 * 1024) return file;
        if (typeof createImageBitmap !== 'function') return file;
        const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
        const k = Math.min(1, lado / Math.max(bmp.width, bmp.height));
        if (k >= 1 && file.type === 'image/jpeg') { bmp.close?.(); return file; }
        const w = Math.round(bmp.width * k);
        const h = Math.round(bmp.height * k);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
        bmp.close?.();
        const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', calidad));
        if (!blob || blob.size >= file.size) return file;
        const nombre = file.name.replace(/\.(png|webp|jpe?g)$/i, '') + '.jpg';
        return new File([blob], nombre, { type: 'image/jpeg', lastModified: file.lastModified });
    } catch {
        return file;
    }
}

export async function reducirTodas(files) {
    const out = [];
    for (const f of files) out.push(await reducirImagen(f)); // de una en una: memoria del móvil
    return out;
}

/** Qué acepta el selector de ficheros de un apartado. */
export function aceptaDe(slot) {
    if (slot?.video) return 'video/*';
    if (slot?.documento) return 'image/*,application/pdf,.pdf,.xml,.cex,.dwg,.dxf';
    return 'image/*';
}
