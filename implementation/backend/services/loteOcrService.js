/**
 * loteOcrService — Lectura de los DOS documentos del lote que traen cifras que
 * hasta ahora había que teclear a mano:
 *
 *   · FACTURA DEL VERIFICADOR  → su base imponible es `lotes.coste_verificacion`,
 *     de donde sale el €/MWh que le cuesta la operación al Sujeto Obligado.
 *   · INFORME DE VERIFICACIÓN  → el ahorro verificado de CADA actuación, que es
 *     sobre el que se factura al S.O. y sobre el que se paga al cliente.
 *
 * Es el gemelo de `facturaOcrService` (Gemini 2.5 Flash, `responseSchema`,
 * temperature 0, sin razonamiento, plazo global por debajo del timeout de nginx).
 * No se bifurcó aquel: lee una factura de OBRA con un esquema de partidas y
 * equipos que aquí no pinta nada, y estos dos documentos no comparten ni prompt
 * ni salida.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * REGLA — el modelo solo LEE; el juicio es del código.
 * El modelo transcribe lo que pone el papel. Quién es cada actuación, si la
 * factura es de este lote y si las cifras cuadran lo deciden funciones
 * deterministas (`loteVerificados.js`), para que cualquiera pueda reproducir por
 * qué se propuso un número.
 *
 * REGLA — los números se piden como TEXTO y se parsean aquí.
 * "28.852" es veintiocho mil ochocientos cincuenta y dos, y "1.564,20" son mil
 * quinientos sesenta y cuatro con veinte. Pidiéndolos como NUMBER, el punto de
 * miles español se interpreta como decimal y un ahorro de 28.852 kWh entra como
 * 28,852 — un error de tres órdenes de magnitud sobre el número con el que se
 * paga a un cliente. Se piden literales y los convierte `numeroEs()`, que es
 * determinista y se puede probar.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const RETRYABLE_STATUS = new Set([429, 500, 503]);
const MAX_RETRIES = 3;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Sin razonamiento y con plazo global por debajo del proxy_read_timeout de nginx
// (120 s): mismos motivos, medidos, que en facturaOcrService.
const THINKING_BUDGET = Number.isFinite(Number(process.env.LOTE_OCR_THINKING_BUDGET))
    ? Number(process.env.LOTE_OCR_THINKING_BUDGET)
    : 0;
const DEADLINE_MS = Number(process.env.LOTE_OCR_TIMEOUT_MS) || 100_000;

async function fetchConPlazo(url, opts, restanteMs) {
    if (restanteMs <= 0) {
        const err = new Error(`La lectura superó el plazo de ${Math.round(DEADLINE_MS / 1000)}s.`);
        err.status = 504;
        throw err;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), restanteMs);
    try {
        return await fetch(url, { ...opts, signal: ctrl.signal });
    } catch (e) {
        if (e.name === 'AbortError') {
            const err = new Error(`La lectura superó el plazo de ${Math.round(DEADLINE_MS / 1000)}s.`);
            err.status = 504;
            throw err;
        }
        throw e;
    } finally {
        clearTimeout(t);
    }
}

async function leerConGemini(pdfBuffer, prompt, schema, etiqueta) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('Falta GEMINI_API_KEY en el entorno.');

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
    const body = {
        contents: [{
            role: 'user',
            parts: [
                { text: prompt },
                { inline_data: { mime_type: 'application/pdf', data: pdfBuffer.toString('base64') } },
            ],
        }],
        generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: schema,
            temperature: 0,
            thinkingConfig: { thinkingBudget: THINKING_BUDGET },
        },
    };

    const t0 = Date.now();
    const finPlazo = t0 + DEADLINE_MS;
    let res, text;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        res = await fetchConPlazo(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
            body: JSON.stringify(body),
        }, finPlazo - Date.now());
        text = await res.text();
        if (res.ok) break;
        if (!RETRYABLE_STATUS.has(res.status) || attempt === MAX_RETRIES) break;
        const waitMs = Math.round(900 * 2 ** attempt + Math.random() * 300);
        if (Date.now() + waitMs >= finPlazo) break;
        console.warn(`[loteOcr:${etiqueta}] Gemini ${res.status} (intento ${attempt + 1}/${MAX_RETRIES + 1}), reintentando en ${waitMs}ms…`);
        await sleep(waitMs);
    }
    if (!res.ok) {
        let msg = String(text).slice(0, 300);
        try { msg = JSON.parse(text)?.error?.message || msg; } catch { /* noop */ }
        const err = new Error(`Gemini ${res.status}: ${msg}`);
        err.status = res.status;
        throw err;
    }
    let data;
    try { data = JSON.parse(text); } catch { throw new Error('Respuesta de Gemini no es JSON.'); }
    const u = data?.usageMetadata || {};
    console.log(`[loteOcr:${etiqueta}] ${GEMINI_MODEL} ${((Date.now() - t0) / 1000).toFixed(1)}s · entrada=${u.promptTokenCount ?? '?'} pensados=${u.thoughtsTokenCount ?? 0} salida=${u.candidatesTokenCount ?? '?'}`);
    const out = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!out) throw new Error('Gemini no devolvió contenido extraído.');
    return JSON.parse(out);
}

// ─────────────────────────────────────────────────────────────────────────────
// Conversión de números escritos a la española. Determinista y probada:
//   "28.852" → 28852   ·   "1.564,20" → 1564.2   ·   "350.339 kWh" → 350339
//   "1,564.20" (formato inglés, por si el papel viene así) → 1564.2
// Un valor que no se pueda leer devuelve null: mejor un hueco que un número
// inventado, porque con este número se paga a un cliente.
// ─────────────────────────────────────────────────────────────────────────────
function numeroEs(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (v === null || v === undefined) return null;
    let s = String(v).trim();
    if (!s) return null;
    s = s.replace(/[^\d.,-]/g, '');                       // fuera € kWh, espacios, NBSP
    if (!s || !/\d/.test(s)) return null;
    const ultimaComa = s.lastIndexOf(',');
    const ultimoPunto = s.lastIndexOf('.');
    if (ultimaComa >= 0 && ultimoPunto >= 0) {
        // El separador DECIMAL es el que va más a la derecha; el otro es de miles.
        if (ultimaComa > ultimoPunto) s = s.replace(/\./g, '').replace(',', '.');
        else s = s.replace(/,/g, '');
    } else if (ultimaComa >= 0) {
        // Solo comas: con VARIAS son separador de miles ("1,564,200"); con una
        // sola es el decimal español ("1564,20"), que es como escriben todas las
        // facturas con las que trabajamos.
        s = (s.match(/,/g) || []).length > 1 ? s.replace(/,/g, '') : s.replace(',', '.');
    } else if (ultimoPunto >= 0) {
        // Solo puntos: en España tres dígitos detrás son MILES ("28.852"), que es
        // el caso de todos los ahorros del informe.
        const dec = s.length - ultimoPunto - 1;
        if (dec === 3) s = s.replace(/\./g, '');
    }
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
}

const txt = (v) => {
    const s = (v === null || v === undefined) ? '' : String(v).trim();
    return s || null;
};

// ─────────────────────────────────────────────────────────────────────────────
// 1) FACTURA DEL VERIFICADOR AL SUJETO OBLIGADO
// ─────────────────────────────────────────────────────────────────────────────
const PROMPT_FACTURA = `Eres un lector de facturas. Extrae LITERALMENTE los datos de esta factura emitida por una entidad VERIFICADORA de Certificados de Ahorro Energético (CAE) a su cliente.

Reglas:
- Transcribe, no interpretes. Si un dato no aparece, devuélvelo null. NUNCA inventes ni completes cifras.
- Los importes van como TEXTO, exactamente como están impresos (por ejemplo "1.564,20"). No los conviertas ni los reformatees.
- base_imponible es el importe SIN IVA. total es el importe final CON IVA. No los confundas: si solo hay un importe y no consta IVA, ponlo en total y deja base_imponible a null.
- expediente_cae es el código del expediente de verificación que suele citarse en el concepto, con el formato "CAE-1234".
- lote_codigo es la referencia del pedido del cliente si aparece, con el formato "LOTE-2025-002".
- emisor es quien EMITE la factura (la entidad verificadora); cliente es quien la RECIBE.
- concepto es la descripción de la línea principal, tal cual.`;

const SCHEMA_FACTURA = {
    type: 'OBJECT',
    properties: {
        numero_factura: { type: 'STRING', nullable: true },
        fecha_factura: { type: 'STRING', nullable: true },
        fecha_vencimiento: { type: 'STRING', nullable: true },
        base_imponible: { type: 'STRING', nullable: true },
        iva_pct: { type: 'STRING', nullable: true },
        iva_importe: { type: 'STRING', nullable: true },
        total: { type: 'STRING', nullable: true },
        expediente_cae: { type: 'STRING', nullable: true },
        lote_codigo: { type: 'STRING', nullable: true },
        concepto: { type: 'STRING', nullable: true },
        emisor: {
            type: 'OBJECT',
            properties: { nombre: { type: 'STRING', nullable: true }, nif: { type: 'STRING', nullable: true } },
        },
        cliente: {
            type: 'OBJECT',
            properties: { nombre: { type: 'STRING', nullable: true }, nif: { type: 'STRING', nullable: true } },
        },
    },
};

/**
 * Lee la factura del verificador.
 * @returns {Promise<{numero_factura, fecha_factura, base_imponible:number|null, total:number|null, …}>}
 */
async function leerFacturaVerificador(pdfBuffer) {
    if (!pdfBuffer || !pdfBuffer.length) throw new Error('PDF vacío.');
    const r = await leerConGemini(pdfBuffer, PROMPT_FACTURA, SCHEMA_FACTURA, 'factura') || {};
    return {
        numero_factura: txt(r.numero_factura),
        fecha_factura: txt(r.fecha_factura),
        fecha_vencimiento: txt(r.fecha_vencimiento),
        base_imponible: numeroEs(r.base_imponible),
        iva_pct: numeroEs(r.iva_pct),
        iva_importe: numeroEs(r.iva_importe),
        total: numeroEs(r.total),
        expediente_cae: txt(r.expediente_cae),
        lote_codigo: txt(r.lote_codigo),
        concepto: txt(r.concepto),
        emisor: { nombre: txt(r.emisor?.nombre), nif: txt(r.emisor?.nif) },
        cliente: { nombre: txt(r.cliente?.nombre), nif: txt(r.cliente?.nif) },
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2) INFORME DE VERIFICACIÓN
//
// El informe lista una ficha "N. ACTUACIÓN A VERIFICAR" por expediente, y dentro
// de cada una el "Nombre de la actuación" (que es nuestro nº de expediente) y el
// "Ahorro anual conseguido (kWh)". Al final da el total. Ese total se pide TAMBIÉN
// para poder contrastarlo contra la suma: si no cuadran, alguna actuación se ha
// leído mal y hay que mirarlo antes de tocar ningún expediente.
// ─────────────────────────────────────────────────────────────────────────────
const PROMPT_INFORME = `Eres un lector de informes. Extrae LITERALMENTE los datos de este INFORME DE VERIFICACIÓN CAE emitido por una entidad verificadora.

El informe contiene un bloque por cada actuación verificada, titulado "N. ACTUACIÓN A VERIFICAR". De CADA bloque extrae:
- orden: el número del bloque (1, 2, 3…).
- expediente: el valor del campo "Nombre de la actuación" (por ejemplo "25RES060_72"). Cópialo carácter a carácter, incluido el guion bajo.
- ahorro_kwh: el valor del campo "Ahorro anual conseguido (kWh)", como TEXTO y exactamente como está impreso (por ejemplo "33.432"). No lo conviertas.
- titular: el valor de "Propietario inicial del ahorro".
- ficha: el código de la ficha (por ejemplo "RES060" o "RES080").
- inversion: el valor de "Inversión de la actuación sin IVA (€)", como TEXTO tal cual.

Además, del informe completo:
- expediente_cae: el "Nº Expediente" del apartado de revisión técnica, con formato "CAE-1234".
- id_verificacion: el "ID Verificación" de la primera página.
- total_kwh: el valor de "CANTIDAD TOTAL DE AHORROS ENERGÉTICOS A VERIFICAR", como TEXTO tal cual.
- fecha_informe: la "Fecha de emisión del informe de verificación".
- dictamen: el texto de la propuesta de dictamen.
- entidad_verificadora: el "Nombre de la entidad verificadora".

Reglas:
- Devuelve UNA entrada por bloque de actuación, en el orden en que aparecen. No agrupes ni resumas.
- Transcribe, no interpretes. Si un dato no aparece, null. NUNCA inventes un número de expediente ni un ahorro: si no lo lees con claridad, déjalo a null.
- No confundas el "Ahorro anual conseguido" con cifras que aparezcan en el apartado de inexactitudes (allí se citan valores antiguos o corregidos). El que vale es el del bloque "ACTUACIÓN A VERIFICAR".`;

const SCHEMA_INFORME = {
    type: 'OBJECT',
    properties: {
        expediente_cae: { type: 'STRING', nullable: true },
        id_verificacion: { type: 'STRING', nullable: true },
        fecha_informe: { type: 'STRING', nullable: true },
        dictamen: { type: 'STRING', nullable: true },
        entidad_verificadora: { type: 'STRING', nullable: true },
        total_kwh: { type: 'STRING', nullable: true },
        actuaciones: {
            type: 'ARRAY',
            items: {
                type: 'OBJECT',
                properties: {
                    orden: { type: 'STRING', nullable: true },
                    expediente: { type: 'STRING', nullable: true },
                    ahorro_kwh: { type: 'STRING', nullable: true },
                    titular: { type: 'STRING', nullable: true },
                    ficha: { type: 'STRING', nullable: true },
                    inversion: { type: 'STRING', nullable: true },
                },
            },
        },
    },
};

/**
 * Lee el informe de verificación.
 * @returns {Promise<{expediente_cae, total_kwh:number|null, actuaciones:Array}>}
 */
async function leerInformeVerificacion(pdfBuffer) {
    if (!pdfBuffer || !pdfBuffer.length) throw new Error('PDF vacío.');
    const r = await leerConGemini(pdfBuffer, PROMPT_INFORME, SCHEMA_INFORME, 'informe') || {};
    const actuaciones = (Array.isArray(r.actuaciones) ? r.actuaciones : []).map((a, i) => ({
        orden: numeroEs(a?.orden) ?? (i + 1),
        expediente: txt(a?.expediente),
        ahorro_kwh: numeroEs(a?.ahorro_kwh),
        titular: txt(a?.titular),
        ficha: txt(a?.ficha),
        inversion: numeroEs(a?.inversion),
    }));
    return {
        expediente_cae: txt(r.expediente_cae),
        id_verificacion: txt(r.id_verificacion),
        fecha_informe: txt(r.fecha_informe),
        dictamen: txt(r.dictamen),
        entidad_verificadora: txt(r.entidad_verificadora),
        total_kwh: numeroEs(r.total_kwh),
        actuaciones,
    };
}

module.exports = {
    numeroEs,
    leerFacturaVerificador,
    leerInformeVerificacion,
};
