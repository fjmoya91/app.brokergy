/**
 * facturaOcrService — Extracción de los datos de una FACTURA DE OBRA a partir de su
 * PDF (o de fotos unidas en PDF), usando un LLM multimodal. Mismo patrón, mismo
 * proveedor y mismos reintentos que `ceeOcrService` (el OCR del CEE): lo único que
 * cambia es el prompt y el esquema de salida.
 *
 * Proveedor conmutable por env `FACTURA_OCR_PROVIDER` (gemini | openai); si no está,
 * se hereda `CEE_OCR_PROVIDER`. Por defecto gemini (GEMINI_API_KEY).
 *
 * IMPORTANTE — separación de responsabilidades: aquí la IA solo LEE la factura. No
 * juzga nada. Las incidencias (qué está mal respecto del expediente) las decide
 * `facturaIncidencias.js` con reglas deterministas sobre este JSON, para que el
 * criterio sea auditable y no dependa del humor del modelo.
 */

const PROVIDER = (process.env.FACTURA_OCR_PROVIDER || process.env.CEE_OCR_PROVIDER || 'gemini').toLowerCase();
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';

const RETRYABLE_STATUS = new Set([429, 500, 503]);
const MAX_RETRIES = 3;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─────────────────────────────────────────────────────────────────────────────
// Partidas: enum CERRADO. La IA clasifica cada línea; las reglas deciden qué
// hacer con esa clasificación. Si el enum se abre, hay que revisar las reglas de
// alcance de facturaIncidencias.js (dependen de estos valores exactos).
// ─────────────────────────────────────────────────────────────────────────────
const PARTIDAS = [
    'AEROTERMIA',    // bomba de calor: unidad exterior/interior, monobloc, split hidrónico
    'ACS',           // depósito/acumulador/interacumulador/termo de agua caliente sanitaria
    'EMISORES',      // unidades terminales: radiadores, suelo radiante, fancoils, toalleros
    'VENTANAS',
    'CUBIERTA',
    'FACHADA',
    'SUELO',
    'FOTOVOLTAICA',
    'OBRA_CIVIL',    // albañilería, hidráulica, eléctrica, adaptación de lo existente
    'MANO_OBRA',
    'OTROS',
];

const EXTRACTION_PROMPT = `Eres un extractor de datos de FACTURAS de obra españolas (instalaciones térmicas y reformas energéticas). Te doy el PDF (o la foto) de una factura. Extrae EXACTAMENTE los datos que pide el esquema y devuélvelos en JSON.

REGLAS CRÍTICAS:
- Localiza los datos por sus ETIQUETAS y por su posición lógica, NO por número de página.
- Números como decimales con PUNTO (1234.56). Si la factura usa coma decimal y punto de millar, conviértelo (1.234,56 → 1234.56).
- Fechas en formato YYYY-MM-DD.
- Si un dato no aparece, devuelve null. NO INVENTES NADA: es preferible null a un valor deducido.
- No corrijas ni "mejores" los textos: copia las descripciones tal cual figuran.

QUIÉN ES QUIÉN (no los confundas):
- "emisor" = QUIEN EMITE la factura, el instalador/proveedor que cobra (suele ir arriba, con su logo, y su NIF junto al nº de factura).
- "cliente" = A QUIÉN se factura, el destinatario ("Cliente:", "Facturar a:", "Destinatario:", "Sr./Sra.").
  Si dudas: el que tiene cuenta bancaria, CIF de empresa y sello suele ser el EMISOR.

IMPORTES:
- base_imponible = suma de las líneas antes de IVA (aparece como "Base imponible", "Subtotal", "Suma").
- iva_pct = el tipo aplicado (21, 10, 0...). iva_importe = la cuota. total = el total a pagar.
- retencion = la retención de IRPF si la hubiera (número positivo), si no null.
- Si SOLO aparece un total y no hay desglose, pon base_imponible a null y total al importe que veas. No calcules la base tú.

LÍNEAS (lo más importante):
- Una entrada por cada CONCEPTO facturado. Copia su "descripcion" literal.
- "importe_total" es el importe SIN IVA de esa línea.
- "marca", "modelo" y "numero_serie" SOLO si aparecen escritos en esa línea (o inmediatamente asociados a ella). El número de serie suele venir como "Nº serie", "S/N", "SN:" seguido de un código alfanumérico. Si la línea no los cita, null.
- "partida": clasifica cada línea en UNA de estas categorías:
  · AEROTERMIA — bomba de calor aire-agua: unidad exterior, unidad interior/hidrokit, monobloc, equipo de aerotermia.
  · ACS — depósito, acumulador, interacumulador, termo eléctrico o equipo dedicado a agua caliente sanitaria.
  · EMISORES — UNIDADES TERMINALES de emisión de calor: radiadores, suelo radiante (kit, colectores, tubería de suelo radiante, mortero autonivelante para suelo radiante), fancoils, toalleros, splits de aire.
  · VENTANAS / CUBIERTA / FACHADA / SUELO — carpintería y aislamiento de la envolvente.
  · FOTOVOLTAICA — placas solares e inversores.
  · OBRA_CIVIL — albañilería, hidráulica, valvulería, tuberías de conexión, cuadro eléctrico, adaptación de la instalación EXISTENTE, puesta en marcha, retirada de escombros.
  · MANO_OBRA — horas de trabajo, desplazamientos, dirección de obra.
  · OTROS — cualquier cosa que no encaje (tramitaciones, certificados, portes...).
- OJO con EMISORES: clasifica ahí SOLO si se SUMINISTRA o SUSTITUYE una unidad terminal (radiadores nuevos, instalación de suelo radiante, fancoils). La simple CONEXIÓN, adaptación o purgado de los emisores YA EXISTENTES es OBRA_CIVIL, no EMISORES.

- "observaciones": cualquier nota relevante de la factura (forma de pago, referencia a presupuesto, obra a la que corresponde). Máximo 300 caracteres.`;

// ─────────────────────────────────────────────────────────────────────────────
// Esquema de salida (subset OpenAPI que acepta Gemini responseSchema)
// ─────────────────────────────────────────────────────────────────────────────
const _party = {
    type: 'OBJECT',
    properties: {
        nombre: { type: 'STRING', nullable: true },
        nif: { type: 'STRING', nullable: true },
        direccion: { type: 'STRING', nullable: true },
    },
};

const GEMINI_SCHEMA = {
    type: 'OBJECT',
    properties: {
        numero_factura: { type: 'STRING', nullable: true },
        fecha_factura: { type: 'STRING', nullable: true },
        fecha_vencimiento: { type: 'STRING', nullable: true },
        emisor: _party,
        cliente: _party,
        totales: {
            type: 'OBJECT',
            properties: {
                base_imponible: { type: 'NUMBER', nullable: true },
                iva_pct: { type: 'NUMBER', nullable: true },
                iva_importe: { type: 'NUMBER', nullable: true },
                total: { type: 'NUMBER', nullable: true },
                retencion: { type: 'NUMBER', nullable: true },
            },
        },
        lineas: {
            type: 'ARRAY',
            items: {
                type: 'OBJECT',
                properties: {
                    descripcion: { type: 'STRING', nullable: true },
                    cantidad: { type: 'NUMBER', nullable: true },
                    importe_unitario: { type: 'NUMBER', nullable: true },
                    importe_total: { type: 'NUMBER', nullable: true },
                    partida: { type: 'STRING', enum: PARTIDAS, nullable: true },
                    marca: { type: 'STRING', nullable: true },
                    modelo: { type: 'STRING', nullable: true },
                    numero_serie: { type: 'STRING', nullable: true },
                },
            },
        },
        observaciones: { type: 'STRING', nullable: true },
    },
};

// ─────────────────────────────────────────────────────────────────────────────
// Adaptadores de proveedor
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
        console.warn(`[facturaOcr] Gemini ${res.status} (intento ${attempt + 1}/${MAX_RETRIES + 1}), reintentando en ${waitMs}ms…`);
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
                { type: 'input_file', filename: 'factura.pdf', file_data: `data:application/pdf;base64,${pdfBuffer.toString('base64')}` },
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
        console.warn(`[facturaOcr] OpenAI ${res.status} (intento ${attempt + 1}/${MAX_RETRIES + 1}), reintentando en ${waitMs}ms…`);
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
    let out = data.output_text;
    if (!out && Array.isArray(data.output)) {
        out = data.output.flatMap((o) => (o.content || [])).map((c) => c.text).filter(Boolean).join('');
    }
    if (!out) throw new Error('OpenAI no devolvió contenido extraído.');
    out = out.trim().replace(/^```json\s*/i, '').replace(/```$/, '').trim();
    return JSON.parse(out);
}

// ─────────────────────────────────────────────────────────────────────────────
// Saneamiento: el modelo puede devolver el esquema con huecos o con importes en
// negativo (abonos). Dejamos una forma ESTABLE para que las reglas no tengan que
// defenderse de nulls en cada línea.
// ─────────────────────────────────────────────────────────────────────────────
const num = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};
const str = (v) => {
    const s = (v === null || v === undefined) ? '' : String(v).trim();
    return s || null;
};

function sanitize(raw) {
    const r = raw || {};
    const party = (p) => ({ nombre: str(p?.nombre), nif: str(p?.nif), direccion: str(p?.direccion) });
    const lineas = Array.isArray(r.lineas) ? r.lineas : [];
    return {
        numero_factura: str(r.numero_factura),
        fecha_factura: str(r.fecha_factura),
        fecha_vencimiento: str(r.fecha_vencimiento),
        emisor: party(r.emisor),
        cliente: party(r.cliente),
        totales: {
            base_imponible: num(r.totales?.base_imponible),
            iva_pct: num(r.totales?.iva_pct),
            iva_importe: num(r.totales?.iva_importe),
            total: num(r.totales?.total),
            retencion: num(r.totales?.retencion),
        },
        lineas: lineas.map((l) => ({
            descripcion: str(l?.descripcion),
            cantidad: num(l?.cantidad),
            importe_unitario: num(l?.importe_unitario),
            importe_total: num(l?.importe_total),
            partida: PARTIDAS.includes(l?.partida) ? l.partida : 'OTROS',
            marca: str(l?.marca),
            modelo: str(l?.modelo),
            numero_serie: str(l?.numero_serie),
        })),
        observaciones: str(r.observaciones),
    };
}

/**
 * Extrae los datos de la factura a partir del buffer de un PDF.
 * @param {Buffer} pdfBuffer
 * @returns {Promise<object>} JSON saneado (ver GEMINI_SCHEMA)
 */
async function extractFacturaFromPdf(pdfBuffer) {
    if (!pdfBuffer || pdfBuffer.length === 0) throw new Error('PDF vacío.');
    const raw = PROVIDER === 'openai'
        ? await extractWithOpenAI(pdfBuffer)
        : await extractWithGemini(pdfBuffer);
    return sanitize(raw);
}

module.exports = {
    PROVIDER,
    PARTIDAS,
    extractFacturaFromPdf,
};
