// ─────────────────────────────────────────────────────────────────────────────
// ¿Este PDF es de ESTE expediente? — se comprueba ANTES de guardar lo que sube un
// tercero por un enlace público (instalador o cliente).
//
// Por qué existe (08/11/2026): el 04/11 FESSA subió desde el enlace de instalador
// del 26RES060_242 el CIFO firmado del 26RES060_182 (otra obra, otro cliente). La
// ruta no miraba de qué expediente era el PDF: quedó en la casilla «CIFO firmado»
// del 242 y nadie lo vio hasta la auditoría de cuatro días después.
//
// Qué se lee: el TEXTO del PDF (capa de texto de cada página) y los VALORES de sus
// campos de formulario —el Anexo I lleva la referencia catastral en un campo, no en
// el texto de la página—, con `mupdf` (ya es dependencia del backend: WebAssembly,
// el mismo en Windows y en el contenedor). Sin IA y sin llamadas fuera: ~0,3 s en
// un CIFO de 12 páginas.
//
// REGLA — se BLOQUEA (422) solo cuando el PDF está identificado como de OTRA obra
// nuestra: lleva el nº de otro expediente que existe, o una referencia catastral
// que es la de otro expediente (los 14 primeros caracteres, el mismo criterio que
// `riteCertificado.refCatastralCasa`). Una RC que simplemente no casa con la del
// expediente (una errata del instalador en eDICE) NO bloquea: eso sigue siendo el
// aviso de la regla 27.b. Si el PDF lleva NUESTRO número, vale aunque traiga otros.
//
// REGLA — lo que no se puede leer NO se bloquea: un escaneado, una foto, un PDF sin
// capa de texto o un fallo al abrirlo pasan, con un aviso en el log (y, quien llama,
// en el mensaje al staff). Un fallo de la BD al buscar la otra obra tampoco bloquea.
// ─────────────────────────────────────────────────────────────────────────────

const supabase = require('../services/supabaseClient');

let _mupdf = null;
// `mupdf` es ESM puro: desde CommonJS se carga con import() dinámico, una vez.
function cargarMupdf() {
    if (!_mupdf) _mupdf = import('mupdf');
    return _mupdf;
}

// Por debajo de esto no hay texto que valga (un escaneado da 0-10 caracteres).
const MIN_TEXTO = 80;
// El nº y la RC están en las primeras hojas; las fichas técnicas unidas detrás no
// hace falta leerlas.
const MAX_PAGINAS = 20;

// Nº de expediente CAE: 26RES060_242, 26RES080_90, 26TER100_2, 26RES060FM_3…
// (no casa con un id de oportunidad, `26RES060_OP117`).
const RE_NUMERO = /(?<![0-9A-Z])\d{2}(?:RES|TER)\d{3}(?:FC|FM)?_\d+(?![0-9])/g;
// Referencia catastral de 20 caracteres: urbana (7 cifras + 2 letras + 4 cifras +
// letra + 4 cifras + 2 letras) o rústica (5 cifras + letra + 12 cifras + 2 letras),
// admitiendo los espacios con que a veces se escribe.
const RE_RC_URBANA = /(?<![0-9A-Z])(\d{7})\s?([A-Z]{2}\d{4}[A-Z])\s?(\d{4})\s?([A-Z]{2})(?![0-9A-Z])/g;
const RE_RC_RUSTICA = /(?<![0-9A-Z])(\d{5}[A-Z]\d{3})\s?(\d{5})\s?(\d{4})\s?([A-Z]{2})(?![0-9A-Z])/g;

const normRc = (s) => String(s || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
const rc14 = (s) => normRc(s).slice(0, 14);

/**
 * Texto de un PDF: capa de texto de las páginas + valores de sus campos de formulario.
 * @returns {Promise<string|null>} null si no se ha podido abrir.
 */
async function leerTextoPdf(buffer, { maxPaginas = MAX_PAGINAS } = {}) {
    if (!buffer || !buffer.length) return null;
    let doc = null;
    try {
        const mupdf = await cargarMupdf();
        doc = mupdf.Document.openDocument(Buffer.from(buffer), 'application/pdf');
        const pdf = typeof doc.asPDF === 'function' ? doc.asPDF() : null;
        const fuente = pdf || doc;
        const n = Math.min(fuente.countPages(), maxPaginas);
        const partes = [];
        for (let i = 0; i < n; i++) {
            const page = fuente.loadPage(i);
            try { partes.push(page.toStructuredText().asText()); } catch (_) { /* página ilegible */ }
            if (pdf && typeof page.getWidgets === 'function') {
                try {
                    for (const w of page.getWidgets() || []) {
                        const v = w.getValue();
                        if (v && v !== 'Off' && v !== 'On') partes.push(String(v));
                    }
                } catch (_) { /* sin formulario */ }
            }
        }
        return partes.join('\n');
    } catch (e) {
        console.warn('[pdfDelExpediente] no se pudo abrir el PDF:', e.message);
        return null;
    } finally {
        try { doc && doc.destroy && doc.destroy(); } catch (_) { }
    }
}

/** Los nº de expediente y las referencias catastrales que aparecen en un texto. */
function identificadoresEnTexto(texto) {
    const t = String(texto || '').toUpperCase();
    const numeros = [...new Set(t.match(RE_NUMERO) || [])];
    const rcs = new Set();
    for (const re of [RE_RC_URBANA, RE_RC_RUSTICA]) {
        for (const m of t.matchAll(re)) rcs.add(normRc(m.slice(1).join('')));
    }
    return { numeros, rcs: [...rcs] };
}

/** Las RC con que el expediente puede aparecer escrito (misma cascada que `buildCertClienteData`). */
function rcsDelExpediente(exp) {
    const op = exp?.oportunidades || {};
    const inputs = op?.datos_calculo?.inputs || {};
    return [...new Set([
        op.ref_catastral, exp?.instalacion?.ref_catastral, inputs.rc, inputs.referencia_catastral,
    ].map(normRc).filter(rc => rc.length >= 14))];
}

async function otroExpedientePorNumero(numero, idPropio) {
    const { data, error } = await supabase
        .from('expedientes').select('id, numero_expediente')
        .eq('numero_expediente', numero).limit(1);
    if (error) throw error;
    const otro = (data || [])[0];
    return otro && otro.id !== idPropio ? otro : null;
}

async function otroExpedientePorRc(rc, idPropio) {
    // Prefijo de 14 caracteres, sin comodines delante: lo hace barato.
    const { data, error } = await supabase
        .from('expedientes').select('id, numero_expediente')
        .ilike('instalacion->>ref_catastral', `${rc14(rc)}%`)
        .neq('id', idPropio).limit(1);
    if (error) throw error;
    return (data || [])[0] || null;
}

/**
 * ¿El PDF que sube un tercero es de ESTE expediente?
 *
 * @param {object} p
 * @param {Buffer} p.buffer
 * @param {string} [p.mimetype]
 * @param {object} p.exp       { id, numero_expediente, instalacion, oportunidades: { ref_catastral, datos_calculo } }
 * @param {string} p.documento cómo se nombra al instalador/cliente: 'CIFO', 'Anexo I'…
 * @param {boolean} [p.femenino] 'Esta Memoria RITE' en vez de 'Este …'
 * @param {boolean} [p.avisarSinIdentificador] avisar si el PDF, legible, no trae ni nº ni RC
 *        (false para un documento que no los lleva nunca, como nuestra Memoria RITE)
 * @returns {Promise<{ ok: true, legible: boolean, coincide: 'numero'|'rc'|null, aviso: string|null }
 *                  | { ok: false, error: string, ajeno: { numero_expediente: string, por: 'numero'|'rc', valor: string } }>}
 */
async function comprobarPdfDelExpediente({ buffer, mimetype, exp, documento, femenino = false, avisarSinIdentificador = true }) {
    const nuestro = String(exp?.numero_expediente || '').toUpperCase();
    const etiqueta = `[pdfDelExpediente] ${nuestro || exp?.id} · ${documento}`;
    const pasa = (legible, coincide, aviso) => {
        if (aviso) console.warn(`${etiqueta}: ${aviso}`);
        return { ok: true, legible, coincide, aviso: aviso || null };
    };

    if (mimetype && String(mimetype).startsWith('image/')) {
        return pasa(false, null, 'es una imagen: no se ha podido comprobar de qué obra es');
    }
    const texto = await leerTextoPdf(buffer);
    if (texto === null) return pasa(false, null, 'no se ha podido abrir el PDF: no se ha comprobado de qué obra es');
    if (texto.replace(/\s+/g, '').length < MIN_TEXTO) {
        return pasa(false, null, 'el PDF no tiene texto (¿escaneado?): no se ha comprobado de qué obra es');
    }

    const { numeros, rcs } = identificadoresEnTexto(texto);
    const este = femenino ? 'Esta' : 'Este';
    const rechazo = (otro, por, valor) => {
        const detalle = por === 'rc' ? ` (referencia catastral ${valor})` : '';
        const error = `${este} ${documento} es del expediente ${otro.numero_expediente}${detalle}, no de este (${nuestro}). `
            + `No se ha guardado: sube el ${documento} de esta obra.`;
        console.warn(`${etiqueta}: RECHAZADO — es del ${otro.numero_expediente} (por ${por === 'rc' ? 'referencia catastral' : 'nº de expediente'} ${valor})`);
        return { ok: false, error, ajeno: { numero_expediente: otro.numero_expediente, por, valor } };
    };

    try {
        // 1. El nº de expediente manda: si está el nuestro, es de esta obra.
        if (nuestro && numeros.includes(nuestro)) return pasa(true, 'numero', null);
        const avisos = [];
        for (const n of numeros) {
            const otro = await otroExpedientePorNumero(n, exp.id);
            if (otro) return rechazo(otro, 'numero', n);
            avisos.push(`lleva el nº ${n}, que no es de ningún expediente`);
        }

        // 2. La referencia catastral, si el PDF la trae.
        const propias = rcsDelExpediente(exp).map(rc14);
        if (rcs.some(rc => propias.includes(rc14(rc)))) return pasa(true, 'rc', avisos.join('; ') || null);
        for (const rc of rcs) {
            const otro = await otroExpedientePorRc(rc, exp.id);
            if (otro) return rechazo(otro, 'rc', rc);
            avisos.push(`lleva la referencia catastral ${rc}, que no es la del expediente${propias.length ? '' : ' (no tiene ninguna registrada)'}`);
        }
        if (!numeros.length && !rcs.length && avisarSinIdentificador) {
            avisos.push('no lleva ni nº de expediente ni referencia catastral');
        }
        return pasa(true, null, avisos.join('; ') || null);
    } catch (e) {
        return pasa(true, null, `no se ha podido comprobar contra la BD (${e.message || e})`);
    }
}

module.exports = { comprobarPdfDelExpediente, leerTextoPdf, identificadoresEnTexto, rcsDelExpediente };
