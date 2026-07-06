/**
 * ceeOcrService — Extracción de datos de un Certificado de Eficiencia Energética (CEE)
 * a partir de su PDF (o imágenes unidas en PDF), usando un LLM multimodal.
 *
 * Proveedor conmutable por env `CEE_OCR_PROVIDER` (gemini | openai). Por defecto gemini.
 *   - gemini: Gemini 2.5 Flash vía generativelanguage API (PDF nativo + responseSchema).
 *             Requiere GEMINI_API_KEY (+ opcional GEMINI_MODEL).
 *   - openai: GPT-4.1-mini (Responses API con input_file). Requiere OPENAI_API_KEY
 *             (+ opcional OPENAI_MODEL). [Implementado como alternativa; probado: gemini.]
 *
 * El prompt localiza los datos por ETIQUETAS ANCLA (no por número de página, que varía
 * según el nº de huecos/cerramientos de cada vivienda). Validado 100% contra CEE real.
 */

const { PDFDocument } = require('pdf-lib');

const PROVIDER = (process.env.CEE_OCR_PROVIDER || 'gemini').toLowerCase();
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';

// Reintentos con backoff ante errores TRANSITORIOS del proveedor (rate limit / modelo
// sobrecargado). El free tier de Gemini devuelve 503 "high demand" con cierta frecuencia
// bajo carga — sin esto, cada pico obligaba al usuario a repetir la subida a mano.
const RETRYABLE_STATUS = new Set([429, 500, 503]);
const MAX_RETRIES = 3;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─────────────────────────────────────────────────────────────────────────────
// Prompt de extracción (validado contra CEE real, procedimiento CEXv2.x / CE3X)
// ─────────────────────────────────────────────────────────────────────────────
const EXTRACTION_PROMPT = `Eres un extractor de datos de Certificados de Eficiencia Energética de Edificios (CEE) de España (procedimiento CEXv2.x / CE3X). Te doy el PDF de un CEE. Extrae EXACTAMENTE los siguientes datos y devuélvelos en JSON según el esquema.

REGLAS CRÍTICAS:
- Localiza los datos por sus ETIQUETAS, NO por el número de página (el maquetado varía según el nº de cerramientos/huecos).
- Devuelve los números como decimales con punto (ej. 6.84). Si en el PDF hay coma decimal, conviértela a punto.
- Si un valor no existe o aparece como "-", devuelve null.
- No inventes valores.

QUÉ EXTRAER Y DÓNDE:
- referencia_catastral: la "Ref. Catastral" / "Referencia/s catastral/es" (cabecera o identificación del edificio).
- identificacion: dirección, municipio, provincia, código postal (cp) y "Zona climática".
- fecha_certificado: la "Fecha" del certificado (formato YYYY-MM-DD).
- fecha_visita: "Fecha de realización de la visita del técnico certificador" (Anexo IV) en YYYY-MM-DD.
- superficie_habitable_m2: "Superficie habitable [m²]" (Anexo I, apartado SUPERFICIE).
- demandas.calefaccion_kwh_m2_ano: "Demanda de calefacción [kWh/m² año]" (Anexo II, calificación parcial de la demanda).
- demandas.refrigeracion_kwh_m2_ano: "Demanda de refrigeración [kWh/m² año]".
- emisiones.calefaccion / acs / refrigeracion: "Emisiones calefacción/ACS/refrigeración [kgCO2/m² año]" (Anexo II, calificación en EMISIONES). OJO: son las EMISIONES (kgCO2/m² año), NO la energía primaria (kWh/m² año).
- acs_litros_dia: "Demanda diaria de ACS a 60° (litros/día)" (Instalaciones de Agua Caliente Sanitaria, Anexo I).
- servicios.calefaccion / acs / refrigeracion: para cada servicio, del generador correspondiente (Generadores de calefacción, Generadores de refrigeración, Instalaciones de ACS) extrae:
    - combustible: el "Tipo de Energía" (ej. "Electricidad", "Gas natural", "Gasóleo C", "GLP", "Biomasa"...).
    - rendimiento_estacional_pct: el "Rendimiento Estacional [%]" (ej. 623.0). Es un porcentaje, devuélvelo tal cual (623.0, no 6.23).
  Si un servicio no tiene generador (p.ej. no hay refrigeración), pon combustible y rendimiento a null.`;

// ─────────────────────────────────────────────────────────────────────────────
// Esquema de salida (subset OpenAPI que acepta Gemini responseSchema)
// ─────────────────────────────────────────────────────────────────────────────
const _serv = {
  type: 'OBJECT',
  properties: {
    combustible: { type: 'STRING', nullable: true },
    rendimiento_estacional_pct: { type: 'NUMBER', nullable: true },
  },
};
const GEMINI_SCHEMA = {
  type: 'OBJECT',
  properties: {
    referencia_catastral: { type: 'STRING', nullable: true },
    identificacion: {
      type: 'OBJECT',
      properties: {
        direccion: { type: 'STRING', nullable: true },
        municipio: { type: 'STRING', nullable: true },
        provincia: { type: 'STRING', nullable: true },
        cp: { type: 'STRING', nullable: true },
        zona_climatica: { type: 'STRING', nullable: true },
      },
    },
    fecha_certificado: { type: 'STRING', nullable: true },
    fecha_visita: { type: 'STRING', nullable: true },
    superficie_habitable_m2: { type: 'NUMBER', nullable: true },
    demandas: {
      type: 'OBJECT',
      properties: {
        calefaccion_kwh_m2_ano: { type: 'NUMBER', nullable: true },
        refrigeracion_kwh_m2_ano: { type: 'NUMBER', nullable: true },
      },
    },
    emisiones: {
      type: 'OBJECT',
      properties: {
        calefaccion: { type: 'NUMBER', nullable: true },
        acs: { type: 'NUMBER', nullable: true },
        refrigeracion: { type: 'NUMBER', nullable: true },
      },
    },
    acs_litros_dia: { type: 'NUMBER', nullable: true },
    servicios: {
      type: 'OBJECT',
      properties: { calefaccion: _serv, acs: _serv, refrigeracion: _serv },
    },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Utilidades PDF: unir imágenes en un único PDF (una por página)
// pdf-lib solo embebe JPG y PNG: detectamos por bytes mágicos y omitimos el resto.
// ─────────────────────────────────────────────────────────────────────────────
async function imagesToPdf(images) {
  const pdfDoc = await PDFDocument.create();
  let added = 0, skipped = 0;
  for (const buffer of images) {
    try {
      const isPng = buffer.length > 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
      const isJpg = buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
      let img;
      if (isPng) img = await pdfDoc.embedPng(buffer);
      else if (isJpg) img = await pdfDoc.embedJpg(buffer);
      else { skipped++; continue; }
      const { width, height } = img.scale(1);
      const page = pdfDoc.addPage([width, height]);
      page.drawImage(img, { x: 0, y: 0, width, height });
      added++;
    } catch (e) {
      console.warn('[ceeOcr] no se pudo embeber una imagen:', e.message);
      skipped++;
    }
  }
  const pdf = Buffer.from(await pdfDoc.save());
  return { pdf, added, skipped };
}

/**
 * Normaliza una lista de ficheros subidos (multer) a un único PDF listo para OCR.
 * - Si hay ≥1 PDF, usa el primero tal cual.
 * - Si no, une todas las imágenes en un PDF (una por página).
 * @param {Array<{buffer:Buffer, mimetype:string, originalname:string}>} files
 * @returns {Promise<{pdf:Buffer, source:'pdf'|'images', added:number, skipped:number}>}
 */
async function normalizeToPdf(files) {
  if (!files || files.length === 0) throw new Error('No se recibió ningún fichero.');

  const isPdf = (f) => (f.mimetype === 'application/pdf') || /\.pdf$/i.test(f.originalname || '');
  const pdfFile = files.find(isPdf);
  if (pdfFile) {
    return { pdf: pdfFile.buffer, source: 'pdf', added: 1, skipped: 0 };
  }

  const images = files
    .filter((f) => (f.mimetype || '').startsWith('image/') || /\.(jpe?g|png)$/i.test(f.originalname || ''))
    .map((f) => f.buffer);
  if (images.length === 0) {
    throw new Error('Los ficheros no son PDF ni imágenes JPG/PNG embebibles.');
  }
  const { pdf, added, skipped } = await imagesToPdf(images);
  if (added === 0) throw new Error('No se pudo convertir ninguna imagen a PDF (formatos no soportados, p.ej. HEIC).');
  return { pdf, source: 'images', added, skipped };
}

// ─────────────────────────────────────────────────────────────────────────────
// Adaptador Gemini
// ─────────────────────────────────────────────────────────────────────────────
async function extractWithGemini(pdfBuffer) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('Falta GEMINI_API_KEY en el entorno.');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
  const body = {
    contents: [{
      role: 'user',
      parts: [
        { text: EXTRACTION_PROMPT },
        { inline_data: { mime_type: 'application/pdf', data: pdfBuffer.toString('base64') } },
      ],
    }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: GEMINI_SCHEMA,
      temperature: 0,
    },
  };

  let res, text;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
    });
    text = await res.text();
    if (res.ok) break;
    if (!RETRYABLE_STATUS.has(res.status) || attempt === MAX_RETRIES) break;
    const waitMs = Math.round(900 * 2 ** attempt + Math.random() * 300);
    console.warn(`[ceeOcr] Gemini ${res.status} (intento ${attempt + 1}/${MAX_RETRIES + 1}), reintentando en ${waitMs}ms…`);
    await sleep(waitMs);
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
  const out = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!out) throw new Error('Gemini no devolvió contenido extraído.');
  return JSON.parse(out);
}

// ─────────────────────────────────────────────────────────────────────────────
// Adaptador OpenAI (alternativa conmutable). Responses API con input_file (PDF base64).
// ─────────────────────────────────────────────────────────────────────────────
async function extractWithOpenAI(pdfBuffer) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('Falta OPENAI_API_KEY en el entorno.');

  const payload = JSON.stringify({
    model: OPENAI_MODEL,
    temperature: 0,
    input: [{
      role: 'user',
      content: [
        { type: 'input_text', text: EXTRACTION_PROMPT + '\n\nDevuelve SOLO el JSON, sin texto adicional.' },
        { type: 'input_file', filename: 'cee.pdf', file_data: `data:application/pdf;base64,${pdfBuffer.toString('base64')}` },
      ],
    }],
  });

  let res, text;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: payload,
    });
    text = await res.text();
    if (res.ok) break;
    if (!RETRYABLE_STATUS.has(res.status) || attempt === MAX_RETRIES) break;
    const waitMs = Math.round(900 * 2 ** attempt + Math.random() * 300);
    console.warn(`[ceeOcr] OpenAI ${res.status} (intento ${attempt + 1}/${MAX_RETRIES + 1}), reintentando en ${waitMs}ms…`);
    await sleep(waitMs);
  }
  if (!res.ok) {
    let msg = text.slice(0, 300);
    try { msg = JSON.parse(text)?.error?.message || msg; } catch { /* noop */ }
    const err = new Error(`OpenAI ${res.status}: ${msg}`);
    err.status = res.status;
    throw err;
  }
  const data = JSON.parse(text);
  // Responses API: output_text agregado, o recorrer output[].content[].text
  let out = data.output_text;
  if (!out && Array.isArray(data.output)) {
    out = data.output.flatMap((o) => (o.content || [])).map((c) => c.text).filter(Boolean).join('');
  }
  if (!out) throw new Error('OpenAI no devolvió contenido extraído.');
  out = out.trim().replace(/^```json\s*/i, '').replace(/```$/, '').trim();
  return JSON.parse(out);
}

/**
 * Extrae los datos del CEE a partir del buffer de un PDF.
 * @param {Buffer} pdfBuffer
 * @returns {Promise<object>} JSON estructurado (ver GEMINI_SCHEMA)
 */
async function extractCeeFromPdf(pdfBuffer) {
  if (!pdfBuffer || pdfBuffer.length === 0) throw new Error('PDF vacío.');
  if (PROVIDER === 'openai') return extractWithOpenAI(pdfBuffer);
  return extractWithGemini(pdfBuffer);
}

module.exports = {
  PROVIDER,
  normalizeToPdf,
  imagesToPdf,
  extractCeeFromPdf,
};
