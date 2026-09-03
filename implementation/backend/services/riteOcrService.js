/**
 * riteOcrService — Lee el CERTIFICADO DE INSTALACIÓN TÉRMICA (RITE) que nos
 * devuelve el instalador.
 *
 * El certificado trae, en un recuadro al pie, las FECHAS DE LAS PRUEBAS realizadas
 * con resultado satisfactorio, y esa fecha es la que manda en la app: de ella salen
 * `documentacion.fecha_pruebas_cert_instalacion` y, con ella, las fechas de inicio y
 * fin de actuación del CIFO (`calcCifo`). Hasta ahora se tecleaba mirando el PDF, y
 * cuando no se tecleaba la app CONJETURABA la fecha desde las facturas — en una
 * reforma, la primera factura puede ser la de las ventanas, así que el CIFO acababa
 * fechado en una obra que no es la instalación térmica.
 *
 * Gemelo pequeño de `facturaOcrService` / `catastroOcrService`: mismo proveedor,
 * `temperature: 0`, `thinkingBudget: 0` y los mismos reintentos ante 429/500/503,
 * reutilizando `ceeOcrService.normalizeToPdf` (varias fotos se unen en un PDF antes
 * de leer). No se bifurcó ninguno de aquéllos: leer 21 campos de un CEE de 30
 * páginas y localizar seis fechas en un impreso de una hoja no comparten ni prompt
 * ni esquema.
 *
 * ── COSTE ────────────────────────────────────────────────────────────────────
 * A Gemini un PDF le cuesta 258 tokens POR PÁGINA, y este documento llega a menudo
 * con los acuses de recibo electrónicos detrás (registro de Industria, ficheros de
 * firma): son páginas que no dicen nada de lo que buscamos y se pagan igual. Por eso
 * se recorta a la PRIMERA PÁGINA antes de enviarlo — el impreso oficial cabe entero
 * ahí, con su recuadro de pruebas y su emplazamiento. Medido: ~0,0003 € por lectura.
 *
 * REGLA: el modelo solo LEE. Qué fecha se escribe, si el emplazamiento cuadra y qué
 * se avisa lo decide `riteCertificado.js`, que es determinista.
 */

const { PDFDocument } = require('pdf-lib');
const ceeOcrService = require('./ceeOcrService');

const PROVIDER = 'gemini';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const RETRYABLE_STATUS = new Set([429, 500, 503]);
const MAX_RETRIES = 2;
// Igual que el del Catastro: aquí hay una persona esperando delante del expediente
// y una lectura de medio minuto ya no ahorra frente a teclear seis fechas.
const DEADLINE_MS = Number(process.env.RITE_OCR_TIMEOUT_MS) || 45000;
// Páginas que se envían a leer. El impreso oficial es UNA; se manda una segunda por
// si alguna comunidad lo emite a doble hoja. Todo lo que venga detrás (acuses,
// ficheros de firma) no aporta nada y se pagaría a 258 tokens la página.
const MAX_PAGINAS = Number(process.env.RITE_OCR_MAX_PAGINAS) || 2;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PROMPT = `Eres un lector de CERTIFICADOS DE INSTALACIÓN TÉRMICA (RITE) españoles. Te doy el impreso oficial de una comunidad autónoma.

DEVUELVE, transcribiendo literalmente lo que veas:
- fechas_pruebas: TODAS las fechas que aparezcan en el recuadro "PRUEBAS REALIZADAS CON RESULTADO SATISFACTORIO" (prueba de los equipos, estanqueidad de tuberías, pruebas finales UNE-EN 12599, ajuste y equilibrado, eficiencia energética…), en formato dd/mm/aaaa y en el orden en que aparecen. Las casillas sin fecha (guiones, vacías) NO se incluyen. Si no hay ninguna, array vacío.
- fecha_firma: la fecha de la firma electrónica del certificado (suele ir al pie, en la línea "Firmado por … con código y fecha de registro …"), en dd/mm/aaaa. null si no se lee.
- direccion: la dirección del recuadro "EMPLAZAMIENTO DE LA INSTALACIÓN", tal cual, con su número.
- municipio: el municipio de ese mismo recuadro.
- referencia_catastral: la referencia catastral de ese recuadro, sin espacios ni guiones y en MAYÚSCULAS.

REGLAS:
- NO inventes ni completes datos que no se lean con claridad: es preferible null a un valor adivinado.
- Las fechas van SIEMPRE como texto dd/mm/aaaa, nunca como número ni en otro formato.
- NO confundas la fecha de las pruebas con la de la firma ni con la fecha de emisión o de registro.
- No confundas la dirección del EMPLAZAMIENTO con el domicilio del titular ni con el de la empresa instaladora.`;

const SCHEMA = {
    type: 'OBJECT',
    properties: {
        fechas_pruebas: { type: 'ARRAY', items: { type: 'STRING' } },
        fecha_firma: { type: 'STRING', nullable: true },
        direccion: { type: 'STRING', nullable: true },
        municipio: { type: 'STRING', nullable: true },
        referencia_catastral: { type: 'STRING', nullable: true },
    },
    required: ['fechas_pruebas'],
};

/**
 * Las primeras `MAX_PAGINAS` del PDF. Si no se puede recortar (PDF cifrado, roto o
 * que pdf-lib no sepa abrir) se devuelve el original: leer de más cuesta unos
 * céntimos, no leer no cuesta nada pero tampoco sirve.
 */
async function primerasPaginas(pdfBuffer, maxPaginas = MAX_PAGINAS) {
    try {
        const src = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
        const total = src.getPageCount();
        if (total <= maxPaginas) return { pdf: pdfBuffer, paginas: total, recortado: false };
        const out = await PDFDocument.create();
        const paginas = await out.copyPages(src, [...Array(maxPaginas).keys()]);
        paginas.forEach((p) => out.addPage(p));
        return { pdf: Buffer.from(await out.save()), paginas: maxPaginas, recortado: true, totalOriginal: total };
    } catch (e) {
        console.warn('[riteOcr] no se pudo recortar el PDF, se envía entero:', e.message);
        return { pdf: pdfBuffer, paginas: null, recortado: false };
    }
}

async function llamarGemini(pdfBuffer) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('Falta GEMINI_API_KEY en el entorno.');

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
    const body = {
        contents: [{
            role: 'user',
            parts: [
                { text: PROMPT },
                { inline_data: { mime_type: 'application/pdf', data: pdfBuffer.toString('base64') } },
            ],
        }],
        generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: SCHEMA,
            temperature: 0,
            thinkingConfig: { thinkingBudget: 0 },
        },
    };

    const t0 = Date.now();
    const finPlazo = t0 + DEADLINE_MS;
    let res, text;
    for (let intento = 0; intento <= MAX_RETRIES; intento++) {
        const restante = finPlazo - Date.now();
        if (restante <= 0) { const e = new Error('La lectura superó el plazo.'); e.status = 504; throw e; }
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), restante);
        try {
            res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
                body: JSON.stringify(body),
                signal: ctrl.signal,
            });
        } catch (e) {
            if (e.name === 'AbortError') { const err = new Error('La lectura superó el plazo.'); err.status = 504; throw err; }
            throw e;
        } finally { clearTimeout(t); }

        text = await res.text();
        if (res.ok) break;
        if (!RETRYABLE_STATUS.has(res.status) || intento === MAX_RETRIES) break;
        const espera = Math.round(800 * 2 ** intento + Math.random() * 300);
        if (Date.now() + espera >= finPlazo) break;
        console.warn(`[riteOcr] Gemini ${res.status} (intento ${intento + 1}), reintentando en ${espera}ms…`);
        await sleep(espera);
    }

    if (!res.ok) {
        let msg = String(text || '').slice(0, 300);
        try { msg = JSON.parse(text)?.error?.message || msg; } catch { /* noop */ }
        const err = new Error(`Gemini ${res.status}: ${msg}`);
        err.status = res.status;
        throw err;
    }

    let data;
    try { data = JSON.parse(text); } catch { throw new Error('Respuesta de Gemini no es JSON.'); }
    const uso = data?.usageMetadata || {};
    console.log(`[riteOcr] Gemini ${GEMINI_MODEL} ${((Date.now() - t0) / 1000).toFixed(1)}s · in=${uso.promptTokenCount ?? '?'} out=${uso.candidatesTokenCount ?? '?'}`);
    const out = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!out) throw new Error('Gemini no devolvió contenido.');
    return JSON.parse(out);
}

// ── Normalización determinista ───────────────────────────────────────────────
// Igual que con los importes del OCR de lotes: las fechas se piden como TEXTO y
// las convierte el código. Un `date` pedido al modelo llega en el formato que le
// parezca (dd/mm, mm/dd, con el año a dos cifras) y una fecha de pruebas mal leída
// viaja hasta el CIFO.

/** 'dd/mm/aaaa' (o dd-mm-aaaa, dd.mm.aa) → 'aaaa-mm-dd'. null si no es una fecha. */
function aISO(valor) {
    const s = String(valor || '').trim();
    let m = s.match(/(\d{1,2})[/\-. ](\d{1,2})[/\-. ](\d{2,4})/);
    if (m) {
        const d = +m[1], mes = +m[2];
        let a = +m[3];
        if (a < 100) a += a < 70 ? 2000 : 1900;
        if (d < 1 || d > 31 || mes < 1 || mes > 12 || a < 1990 || a > 2100) return null;
        return `${a}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
    return m ? m[0] : null;
}

/**
 * @param {Array<{buffer:Buffer, mimetype:string, originalname:string}>|Buffer} entrada
 *        ficheros del formulario, o el PDF ya normalizado.
 * @returns {Promise<{fechas_pruebas:string[], fecha_firma:string|null, direccion:string|null,
 *                    municipio:string|null, referencia_catastral:string|null, paginas_leidas:number|null}>}
 */
async function leerCertificadoRite(entrada) {
    const pdfEntero = Buffer.isBuffer(entrada)
        ? entrada
        : (await ceeOcrService.normalizeToPdf(entrada)).pdf;

    const { pdf, paginas } = await primerasPaginas(pdfEntero);
    const bruto = await llamarGemini(pdf);

    const fechas = [...new Set((bruto?.fechas_pruebas || []).map(aISO).filter(Boolean))].sort();
    const limpia = (v) => { const s = String(v ?? '').trim(); return s && s !== '--' ? s : null; };

    return {
        fechas_pruebas: fechas,
        fecha_firma: aISO(bruto?.fecha_firma),
        direccion: limpia(bruto?.direccion),
        municipio: limpia(bruto?.municipio),
        referencia_catastral: limpia(bruto?.referencia_catastral)?.toUpperCase().replace(/[^A-Z0-9]/g, '') || null,
        paginas_leidas: paginas,
    };
}

module.exports = { PROVIDER, leerCertificadoRite, primerasPaginas, aISO };
