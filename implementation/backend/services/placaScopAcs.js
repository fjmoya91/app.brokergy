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
 * EL RECORTE SE GUARDA COMO RECUADRO, NO COMO IMÁGEN RECORTADA
 * ---------------------------------------------------------------------------
 * Cuatro números en % (`x`,`y`,`w`,`h`) más la relación de aspecto de la foto
 * (`ar`), que es lo que hace falta para encuadrarla en el documento. Así:
 *  · el ORIGINAL se conserva en Drive — un recorte mal hecho se deshace;
 *  · el certificado sale igual generándolo desde la app o desde el backend (MCP),
 *    porque el recuadro viaja en el expediente y no en el popup;
 *  · en BD solo hay metadatos (regla 21): una imagen recortada en base64 dentro
 *    de un JSONB es justo lo que tumbó la BD en julio.
 * Se sanea aquí y no en la ruta: lo que llega del navegador no se escribe a ciegas.
 */
function sanearRecorte(r) {
    if (!r || typeof r !== 'object') return null;
    const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
    const x = n(r.x), y = n(r.y), w = n(r.w), h = n(r.h), ar = n(r.ar);
    if ([x, y, w, h, ar].some((v) => v === null)) return null;
    // Un recuadro fuera de la foto, o de tamaño cero, no encuadra nada.
    if (w <= 0 || h <= 0 || ar <= 0) return null;
    if (x < 0 || y < 0 || x + w > 100.01 || y + h > 100.01) return null;
    // Recortes ridículos (<5 %) suelen ser un arrastre sin querer, y en el
    // certificado se verían como un borrón ampliado.
    if (w < 5 || h < 5) return null;
    const r4 = (v) => Math.round(v * 100) / 100;
    return { x: r4(x), y: r4(y), w: r4(w), h: r4(h), ar: r4(ar) };
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

    const guardado = exp?.instalacion?.placa_scop_acs || {};
    const { elegida, aviso } = elegir(lista, guardado.driveId || null);
    // El recorte es de ESA foto: si la elegida es otra, no se arrastra.
    const recorte = elegida && guardado.driveId === elegida.driveId ? sanearRecorte(guardado.recorte) : null;

    const src = conImagen ? await dataUri(elegida.driveId) : null;
    if (conImagen && !src) {
        return {
            aplica: true, elegida, candidatas: lista, src: null, recorte,
            aviso: 'La foto de la placa está en Drive pero no se ha podido descargar.',
        };
    }
    return { aplica: true, elegida, candidatas: lista, src, recorte, aviso };
}

/**
 * La placa de un expediente, por su id. Carga el expediente, resuelve su carpeta
 * y devuelve lo mismo que `resolverPlacaAcs`.
 *
 * ⚠️ El `select` vive AQUÍ y no en la ruta a propósito: pedir una columna que no
 * existe hace fallar la consulta ENTERA y el expediente llega como `null`, o sea
 * un 404 sobre un expediente que sí existe — y en la pantalla eso no se ve como
 * un error, se ve como que la función no hace nada. Pasó el 17/09/2026 con
 * `drive_folder_id`, que NO es una columna de `expedientes` (mismo gotcha que
 * `prescriptores.telefono`). Con el select aquí, `probar_placa_scop_acs.js`
 * ejerce exactamente lo que corre en producción.
 */
async function placaDeExpediente(expedienteId, { conImagen = false } = {}) {
    const supabase = require('./supabaseClient');
    const { carpetaDeExpediente } = require('./expedienteFolderSync');

    const { data: exp, error } = await supabase
        .from('expedientes')
        .select('id, oportunidad_id, numero_expediente, instalacion')
        .eq('id', expedienteId)
        .maybeSingle();
    if (error) throw new Error(`No se pudo leer el expediente: ${error.message}`);
    if (!exp) return { exp: null };

    const folderId = await carpetaDeExpediente(exp).catch(() => null);
    return { exp, folderId, placa: await resolverPlacaAcs(exp, folderId, { conImagen }) };
}

module.exports = { SLOT, ANCHO, aplicaAnexoVi, candidatas, dataUri, elegir, sanearRecorte, resolverPlacaAcs, placaDeExpediente };
