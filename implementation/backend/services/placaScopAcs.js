/**
 * LA PLACA DE LA UNIDAD EXTERIOR, DENTRO DEL CIFO
 * ---------------------------------------------------------------------------
 * Cuando el SCOP_dhw se justifica por el ANEXO VI (bomba de calor aerotérmica
 * con depósito de ACS no suministrado como conjunto), el certificado declara
 * `SCOP_dhw = COP · F_c`. Y el COP a A7/W55 **muchas fichas técnicas no lo
 * publican**: está en la PLACA DE CARACTERÍSTICAS del equipo. Sin enseñarla, el
 * verificador ve un COP que no encuentra en la documentación aportada y abre una
 * inexactitud — pasó el 16/09/2026 («El valor de SCOPdhw utilizado en el cálculo
 * no coincide con el indicado en la documentación técnica aportada»).
 *
 * REGLA — la foto NO se sube otra vez: ya está en Drive. El instalador la sube a
 * «la pegatina de la máquina de fuera» (`FOTO_UNIDAD_EXTERIOR_PLACA`), que está
 * en `FULL_RES_SLOTS` precisamente para que esos caracteres se lean, y es la
 * misma de la que el lector de placas saca el nº de serie. Drive es la fuente de
 * verdad de qué ficheros hay (regla 20): no se mira `reforma_uploads`.
 *
 * REGLA — con VARIAS fotos se elige, y la elección se guarda. Una unidad exterior
 * puede tener dos etiquetas (la de datos y la del refrigerante) y cuál lleva el
 * COP lo sabe quien las mira. La elegida vive en `instalacion.placa_scop_acs`
 * (solo el driveId y su nombre — regla 21); si ese fichero ya no está en Drive se
 * cae a la primera, en vez de dejar el certificado sin justificante.
 */
const axios = require('axios');
const driveService = require('./driveService');
const reformaUploadService = require('./reformaUploadService');
const { SUBCARPETA_DOCS } = require('./placaOcrService');

const SLOT = 'FOTO_UNIDAD_EXTERIOR_PLACA';

// Ancho al que se pide la imagen. La placa se lee AMPLIANDO el PDF, así que no
// puede ir a tamaño de miniatura; pero la original de un móvil son 3-5 MB y el
// certificado se manda por email. 1600 px es lo que usa el Anexo Fotográfico para
// las placas menos 600, y aquí la foto se imprime además a página completa.
const ANCHO = 1600;

const IMG_EXT = /\.(jpe?g|png|webp|heic|heif|bmp|tiff?)$/i;
const esImagen = (f) => (f.mimeType || '').startsWith('image/') || IMG_EXT.test(f.name || '');

/** ¿Este expediente justifica su SCOP_dhw por el Anexo VI? */
function aplicaAnexoVi(instalacion) {
    return (instalacion?.aerotermia_acs?.metodo_scop || 'ficha') === 'independiente';
}

/** Las fotos del slot que hay HOY en la carpeta, por el mismo criterio de nombre con que se subieron. */
async function candidatas(folderId) {
    if (!folderId) return [];
    const subfolderId = await driveService.findSubfolderByName(folderId, SUBCARPETA_DOCS);
    if (!subfolderId) return [];
    const ficheros = (await driveService.listFiles(subfolderId)) || [];
    return ficheros
        .filter(esImagen)
        .filter((f) => reformaUploadService.fileBelongsToSlot(f.name, SLOT))
        .sort((a, b) => String(a.name).localeCompare(String(b.name), 'es', { numeric: true }))
        .map((f) => ({ driveId: f.id, name: f.name, mimeType: f.mimeType || 'image/jpeg' }));
}

/**
 * La imagen como data URI. Va DENTRO del HTML porque el PDF lo rasteriza
 * Puppeteer con `setContent` sobre un documento `about:blank`: una URL relativa
 * no tiene base que resolver y una autenticada no lleva sesión.
 *
 * Se pide a Drive ya reducida (mismo camino que el proxy de miniaturas), y solo
 * si eso falla se bajan los bytes originales: mejor un certificado que pesa de
 * más que uno sin el justificante de su propio COP.
 */
async function dataUri(driveId, ancho = ANCHO) {
    const tryFetch = async (url) => {
        try {
            const r = await axios.get(url, {
                responseType: 'arraybuffer', timeout: 9000, maxRedirects: 5,
                validateStatus: (s) => s === 200,
            });
            const type = r.headers['content-type'] || 'image/jpeg';
            if (!String(type).startsWith('image/')) return null;
            return { buf: Buffer.from(r.data), type };
        } catch { return null; }
    };
    let img = await tryFetch(`https://lh3.googleusercontent.com/d/${driveId}=w${ancho}`);
    if (!img) img = await tryFetch(`https://drive.google.com/thumbnail?id=${driveId}&sz=w${ancho}`);
    if (!img) {
        const buf = await driveService.getFileContent(driveId).catch(() => null);
        if (!buf?.length) return null;
        img = { buf, type: 'image/jpeg' };
    }
    return `data:${img.type};base64,${img.buf.toString('base64')}`;
}

/**
 * Cuál de las fotos del slot se imprime.
 *
 * Con VARIAS, manda la que eligió una persona: una unidad exterior puede llevar
 * dos etiquetas (la de datos y la del refrigerante) y cuál trae el COP lo sabe
 * quien las mira. Si esa foto ya no está en Drive se cae a la primera **y se
 * dice**: dejar el certificado sin justificante sería peor, pero cambiar de foto
 * en silencio es cambiar lo que el verificador va a ver.
 */
function elegir(lista, guardadaId) {
    if (!lista.length) return { elegida: null, aviso: null };
    const guardada = guardadaId ? lista.find((c) => c.driveId === guardadaId) : null;
    return {
        elegida: guardada || lista[0],
        aviso: guardadaId && !guardada
            ? 'La foto elegida ya no está en Drive: se usa la primera que hay.'
            : null,
    };
}

/**
 * Qué placa se va a imprimir en el CIFO de este expediente.
 *
 * @param {object} exp          expediente (con `instalacion`)
 * @param {string} folderId     carpeta de Drive del expediente
 * @param {object} opts
 * @param {boolean} opts.conImagen  true → descarga la imagen y devuelve `src`
 * @returns {Promise<{aplica:boolean, elegida:object|null, candidatas:object[], src:string|null, aviso:string|null}>}
 */
async function resolverPlacaAcs(exp, folderId, { conImagen = false } = {}) {
    const aplica = aplicaAnexoVi(exp?.instalacion);
    if (!aplica) return { aplica: false, elegida: null, candidatas: [], src: null, aviso: null };

    const lista = await candidatas(folderId).catch(() => []);
    if (!lista.length) {
        return {
            aplica: true, elegida: null, candidatas: [], src: null,
            aviso: 'No hay ninguna foto de la placa de la unidad exterior en el expediente. '
                + 'El COP a A7/W55 del que sale el SCOP_dhw no siempre viene en la ficha técnica: '
                + 'sin la placa, el verificador no puede comprobarlo. La sube el instalador desde su '
                + 'enlace, en «la pegatina de la máquina de fuera».',
        };
    }

    const { elegida, aviso } = elegir(lista, exp?.instalacion?.placa_scop_acs?.driveId || null);

    const src = conImagen ? await dataUri(elegida.driveId) : null;
    if (conImagen && !src) {
        return {
            aplica: true, elegida, candidatas: lista, src: null,
            aviso: 'La foto de la placa está en Drive pero no se ha podido descargar.',
        };
    }
    return { aplica: true, elegida, candidatas: lista, src, aviso };
}

module.exports = { SLOT, ANCHO, aplicaAnexoVi, candidatas, dataUri, elegir, resolverPlacaAcs };
