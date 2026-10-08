/**
 * justificanteOcrService — Lee el JUSTIFICANTE DE TITULARIDAD BANCARIA (certificado
 * del banco, extracto o captura de la banca online): el IBAN y los titulares.
 *
 * Al subirlo desde la ficha del cliente, lo leído RELLENA el IBAN si la ficha no lo
 * tiene y, si lo tiene, COMPRUEBA que número y titular casan. El juicio (normalizar
 * el IBAN con sus espacios o guiones, el dígito de control, quién es el titular) es
 * de `utils/justificanteBancario.js`, determinista: el modelo solo LEE.
 *
 * ── COSTE (lo mínimo posible) ────────────────────────────────────────────────
 * Se manda SOLO la primera página (a Gemini un PDF le cuesta 258 tokens por página,
 * y un certificado bancario cabe en una), una imagen se manda convertida a esa
 * misma página de PDF (258 tokens fijos, frente a las teselas que cuesta una foto
 * grande), sin razonamiento y con la salida acotada. ~600 tokens de entrada y
 * ~60 de salida: unos 0,0003 € por lectura.
 */

const { PDFDocument } = require('pdf-lib');
const { primerasPaginas } = require('./riteOcrService');
const { ajustesGemini } = require('../utils/geminiAjustes');

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const DEADLINE_MS = Number(process.env.JUSTIFICANTE_OCR_TIMEOUT_MS) || 25000;
const RETRYABLE = new Set([429, 500, 503]);

const PROMPT = `Documento bancario español (certificado de titularidad, extracto o captura de la banca online). Devuelve:
- iban: el IBAN de la cuenta tal como aparece, sin espacios ni guiones. Si hay dígitos ocultos, pon * en su lugar. null si no aparece.
- titulares: nombre completo de cada TITULAR de la cuenta (no autorizados, no el banco). [] si no aparece.
No inventes ni completes caracteres que no se lean.`;

const SCHEMA = {
    type: 'OBJECT',
    properties: {
        iban: { type: 'STRING', nullable: true },
        titulares: { type: 'ARRAY', items: { type: 'STRING' } },
    },
    required: ['titulares'],
};

/** Imagen → PDF de una página (lo mismo que hace la ruta al guardarla). */
async function aPdf(buf, mime) {
    if (!mime || mime === 'application/pdf') return buf;
    const doc = await PDFDocument.create();
    const img = mime === 'image/png' ? await doc.embedPng(buf) : await doc.embedJpg(buf);
    const { width, height } = img.scale(1);
    doc.addPage([width, height]).drawImage(img, { x: 0, y: 0, width, height });
    return Buffer.from(await doc.save());
}

async function llamarGemini(pdf) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('Falta GEMINI_API_KEY en el entorno.');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
    const body = JSON.stringify({
        contents: [{ role: 'user', parts: [
            { text: PROMPT },
            { inline_data: { mime_type: 'application/pdf', data: pdf.toString('base64') } },
        ] }],
        generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: SCHEMA,
            maxOutputTokens: 256,
            ...ajustesGemini(GEMINI_MODEL, { pensamiento: 0, temperatura: 0 }),
        },
    });
    const t0 = Date.now();
    let res, text;
    for (let intento = 0; intento <= 2; intento++) {
        const restante = t0 + DEADLINE_MS - Date.now();
        if (restante <= 0) throw new Error('La lectura superó el plazo.');
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), restante);
        try {
            res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey }, body, signal: ctrl.signal });
            text = await res.text();
        } catch (e) {
            if (e.name === 'AbortError') throw new Error('La lectura superó el plazo.');
            throw e;
        } finally { clearTimeout(t); }
        if (res.ok || !RETRYABLE.has(res.status) || intento === 2) break;
        await new Promise(r => setTimeout(r, 800 * 2 ** intento));
    }
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${String(text || '').slice(0, 200)}`);
    const data = JSON.parse(text);
    const uso = data?.usageMetadata || {};
    console.log(`[justificanteOcr] ${GEMINI_MODEL} ${((Date.now() - t0) / 1000).toFixed(1)}s · in=${uso.promptTokenCount ?? '?'} out=${uso.candidatesTokenCount ?? '?'}`);
    const out = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!out) throw new Error('Gemini no devolvió contenido.');
    return { ...JSON.parse(out), tokens: { in: uso.promptTokenCount ?? null, out: uso.candidatesTokenCount ?? null } };
}

/**
 * @param {Buffer} buf  el fichero tal como llega (PDF o imagen)
 * @param {string} mime
 * @returns {Promise<{iban:string|null, titulares:string[], tokens:object}>}
 */
async function leerJustificante(buf, mime) {
    const pdfEntero = await aPdf(buf, mime);
    const { pdf } = await primerasPaginas(pdfEntero, 1);
    const r = await llamarGemini(pdf);
    return {
        iban: r?.iban ? String(r.iban).trim() : null,
        titulares: (Array.isArray(r?.titulares) ? r.titulares : []).map(s => String(s || '').trim()).filter(Boolean),
        tokens: r.tokens,
    };
}

module.exports = { leerJustificante, aPdf };
