/**
 * catastroOcrService — Lee la REFERENCIA CATASTRAL de una foto o captura.
 *
 * El caso real: al abrir una nueva simulación, la referencia llega por WhatsApp como
 * una captura del recibo del IBI, de la ficha del Catastro o de una escritura. Teclear
 * 20 caracteres alfanuméricos mirando una foto es lento y se falla — y un carácter mal
 * copiado no da un error claro, da "no encontrado", que parece que la vivienda no está
 * en el Catastro.
 *
 * Gemelo pequeño de `ceeOcrService` (mismo proveedor, mismo `temperature: 0`, mismos
 * reintentos ante 429/500/503) del que reutiliza `normalizeToPdf` — varias fotos se
 * unen en un PDF antes de leer. No se bifurcó aquel: extraer 21 campos de un CEE de 30
 * páginas y localizar una cadena en una captura no comparten ni prompt ni esquema, y
 * meter las dos cosas en la misma función convierte el camino que está en producción
 * en el sitio donde se rompe lo nuevo.
 *
 * El modelo solo LEE: qué es una referencia válida y cuál se busca lo deciden aquí
 * `normalizarRC` y `extraerReferencias`, que son deterministas.
 */

const ceeOcrService = require('./ceeOcrService');

const PROVIDER = 'gemini';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const RETRYABLE_STATUS = new Set([429, 500, 503]);
const MAX_RETRIES = 2;
// Más corto que el del CEE (100 s): aquí hay una persona esperando delante de un
// buscador, y una lectura que tarda medio minuto ya no ahorra nada frente a teclearla.
const DEADLINE_MS = Number(process.env.CATASTRO_OCR_TIMEOUT_MS) || 45000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PROMPT = `Eres un lector de REFERENCIAS CATASTRALES españolas. Te doy una foto o captura de pantalla (recibo del IBI, ficha del Catastro, escritura, nota simple o un mensaje).

La referencia catastral española tiene 20 caracteres alfanuméricos (a veces aparece solo la de la parcela, de 14). En los documentos suele estar partida en bloques separados por espacios o guiones, por ejemplo: "9872023 VH5797S 0001 WX" o "13087A00700123-0000LT".

DEVUELVE:
- referencias: TODAS las referencias catastrales que veas, en el orden en que aparecen, cada una SIN espacios ni guiones y en MAYÚSCULAS. Si no ves ninguna, array vacío.
- etiqueta_principal: si alguna aparece rotulada explícitamente como referencia del INMUEBLE o de la VIVIENDA (frente a la de la PARCELA o la FINCA), escríbela aquí; si no, null.
- contexto: la dirección o el nombre del titular que aparezca junto a la referencia, para que una persona pueda comprobar que es la vivienda correcta. null si no hay.

REGLAS:
- NO inventes ni completes caracteres que no se lean con claridad: es preferible devolver el array vacío a devolver una referencia adivinada.
- NO confundas con la referencia otras cadenas largas del documento: número de recibo, NIF/DNI, IBAN, número de finca registral, código de barras o número de expediente.
- Transcribe los caracteres tal cual los ves. No "corrijas" ceros por letras O ni al revés.`;

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    referencias: { type: 'ARRAY', items: { type: 'STRING' } },
    etiqueta_principal: { type: 'STRING', nullable: true },
    contexto: { type: 'STRING', nullable: true },
  },
  required: ['referencias'],
};

/** Una RC utilizable: sin separadores, en mayúsculas y con la longitud que acepta el Catastro. */
function normalizarRC(valor) {
  const limpio = String(valor || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return /^[A-Z0-9]{14}$|^[A-Z0-9]{20}$/.test(limpio) ? limpio : null;
}

/**
 * Las referencias válidas de la lectura, sin repetidos y con la del INMUEBLE delante.
 *
 * El orden importa: una ficha del Catastro trae a la vez la de la parcela (14) y la del
 * inmueble (20), y la que identifica la vivienda —la que hay que buscar— es la de 20.
 * Empezar por la de la parcela llevaría a la finca entera.
 */
function extraerReferencias(lectura) {
  const vistas = new Set();
  const validas = [];
  for (const bruta of [lectura?.etiqueta_principal, ...(lectura?.referencias || [])]) {
    const rc = normalizarRC(bruta);
    if (rc && !vistas.has(rc)) { vistas.add(rc); validas.push(rc); }
  }
  // Ordenación estable: conserva el orden de lectura dentro de cada longitud.
  return validas.sort((a, b) => b.length - a.length);
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
    console.warn(`[catastroOcr] Gemini ${res.status} (intento ${intento + 1}), reintentando en ${espera}ms…`);
    await sleep(espera);
  }

  if (!res.ok) {
    let msg = text.slice(0, 300);
    try { msg = JSON.parse(text)?.error?.message || msg; } catch { /* noop */ }
    const err = new Error(`Gemini ${res.status}: ${msg}`);
    err.status = res.status;
    throw err;
  }

  let data;
  try { data = JSON.parse(text); } catch { throw new Error('Respuesta de Gemini no es JSON.'); }
  console.log(`[catastroOcr] Gemini ${GEMINI_MODEL} ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  const out = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!out) throw new Error('Gemini no devolvió contenido.');
  return JSON.parse(out);
}

/**
 * @param {Array<{buffer:Buffer, mimetype:string, originalname:string}>} files
 * @returns {Promise<{referencias:string[], contexto:string|null}>}
 */
async function leerReferencias(files) {
  const { pdf } = await ceeOcrService.normalizeToPdf(files);
  const lectura = await llamarGemini(pdf);
  return {
    referencias: extraerReferencias(lectura),
    contexto: lectura?.contexto || null,
  };
}

module.exports = { PROVIDER, leerReferencias, normalizarRC, extraerReferencias };
