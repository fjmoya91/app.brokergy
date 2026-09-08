/**
 * registroCeeOcrService — Lee la FECHA REAL de registro del justificante del CEE.
 *
 * Hasta ahora, al subir el justificante de registro (slot REGISTRO de la rejilla del
 * CEE, o el enlace público del certificador) la app sellaba
 * `documentacion.fecha_registro_cee_{fase}` con el día de la SUBIDA. Y eso solo es
 * verdad cuando el técnico lo sube el mismo día: en cuanto se sube un registro viejo
 * —un expediente que se pone al día, un migrado, un certificado que llevaba semanas
 * en el correo— el expediente queda diciendo que se registró hoy.
 *
 * No es un dato decorativo: de la fecha de registro del CEE inicial cuelgan el plazo
 * de la obra, el devengo de la facturación del certificador (que factura por hito de
 * registro) y la comprobación de que las facturas no son anteriores al registro
 * (`facturaIncidencias`). Una fecha inventada convierte todo eso en errores que no
 * lo son — y esconde los que sí.
 *
 * La fecha está IMPRESA en la primera página del justificante, en la frase literal
 * del registro autonómico:
 *
 *     «Este es el número de registro 3014080/2025 solicitado el 19/07/2025 a las 09:35:54»
 *
 * Gemelo pequeño de `riteOcrService`, del que reutiliza `primerasPaginas` y `aISO`:
 * es la MISMA conversión de fecha y la misma razón para recortar el PDF, y tenerla
 * dos veces es tenerla mal el día que se corrija una sola.
 *
 * ── COSTE ────────────────────────────────────────────────────────────────────
 * Solo se envía la PRIMERA PÁGINA (258 tokens/página): la frase del registro está
 * siempre ahí y detrás vienen los acuses de firma, que se pagarían igual. Medido:
 * ~640 tokens de entrada, ~0,0003 € por lectura.
 *
 * REGLA — el modelo solo LEE; la fecha la decide el código. `resolverFechaRegistro`
 * es determinista: reextrae la fecha de la frase citada (que es la evidencia que
 * puede comprobar una persona), la convierte y descarta lo imposible. Si la lectura
 * no da nada, se cae a la fecha de subida — que es el comportamiento de siempre— y
 * se DICE, en vez de afirmar en silencio algo que no se ha comprobado.
 */

const { primerasPaginas, aISO } = require('./riteOcrService');
const ceeOcrService = require('./ceeOcrService');

const PROVIDER = 'gemini';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const RETRYABLE_STATUS = new Set([429, 500, 503]);
const MAX_RETRIES = 2;
// Hay una persona esperando a que termine la subida: pasado el plazo se sella la
// fecha de subida y se avisa, que es mejor que dejar el fichero sin registrar.
const DEADLINE_MS = Number(process.env.REGISTRO_CEE_OCR_TIMEOUT_MS) || 30000;
const MAX_PAGINAS = Number(process.env.REGISTRO_CEE_OCR_MAX_PAGINAS) || 1;

// El CEE nace con el RD 47/2007: una fecha anterior no es un registro de CEE, es
// una lectura equivocada (un número de expediente, una fecha de la plantilla…).
const ANIO_MIN = 2007;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PROMPT = `Eres un lector de JUSTIFICANTES DE REGISTRO de Certificados de Eficiencia Energética (CEE) de los registros autonómicos españoles. Te doy la primera página del justificante.

DEVUELVE, transcribiendo literalmente lo que veas:
- fecha_registro: la fecha en que el certificado quedó REGISTRADO / PRESENTADO / SOLICITADO ante el registro autonómico, en formato dd/mm/aaaa. Es la fecha que acompaña al número de registro, normalmente en una frase del tipo "Este es el número de registro 3014080/2025 solicitado el 19/07/2025 a las 09:35:54", o en un recuadro "Fecha de registro" / "Fecha de presentación" / "Fecha de entrada".
- frase: la frase COMPLETA y literal de donde has sacado esa fecha, tal cual está escrita en el documento. Si la fecha viene en un recuadro sin frase, transcribe el rótulo y el valor.
- numero_registro: el número de registro tal cual (por ejemplo "3014080/2025"). null si no se lee.

REGLAS:
- NO inventes ni completes nada que no se lea con claridad: es preferible null a una fecha adivinada. Una fecha equivocada aquí desplaza plazos y facturación de todo el expediente.
- La fecha va SIEMPRE como texto dd/mm/aaaa, nunca como número ni en otro formato.
- NO confundas la fecha de registro con: la fecha de emisión o de firma del certificado, la fecha de la visita del técnico, la fecha de validez o caducidad, ni la fecha de descarga o impresión del documento.
- Si el documento muestra varias fechas, la que se pide es la asociada al NÚMERO DE REGISTRO.`;

const SCHEMA = {
    type: 'OBJECT',
    properties: {
        fecha_registro: { type: 'STRING', nullable: true },
        frase: { type: 'STRING', nullable: true },
        numero_registro: { type: 'STRING', nullable: true },
    },
    required: ['fecha_registro'],
};

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
        console.warn(`[registroCeeOcr] Gemini ${res.status} (intento ${intento + 1}), reintentando en ${espera}ms…`);
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
    console.log(`[registroCeeOcr] Gemini ${GEMINI_MODEL} ${((Date.now() - t0) / 1000).toFixed(1)}s · in=${uso.promptTokenCount ?? '?'} out=${uso.candidatesTokenCount ?? '?'}`);
    const out = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!out) throw new Error('Gemini no devolvió contenido.');
    return JSON.parse(out);
}

/**
 * La fecha que va detrás de "solicitado el", "presentado el", "con fecha", "de
 * fecha" o "fecha de registro/presentación/entrada" dentro de la frase citada.
 *
 * Es la red determinista sobre la lectura: la frase es la EVIDENCIA (lo que puede
 * comprobar una persona abriendo el PDF), así que si contiene una fecha, ésa manda
 * sobre el campo que el modelo haya aislado. Un justificante trae varias fechas y
 * aislar la buena es justo donde un modelo se puede equivocar; copiar la frase
 * entera, no.
 */
function fechaDesdeFrase(frase) {
    const s = String(frase || '');
    const FECHA = '(\\d{1,2}[/\\-.]\\d{1,2}[/\\-.]\\d{2,4})';
    const patrones = [
        new RegExp(`(?:solicitad|present|registrad|inscrit)\\w*\\s+(?:el\\s+)?(?:d[ií]a\\s+)?${FECHA}`, 'i'),
        new RegExp(`(?:con|de)\\s+fecha\\s+(?:de\\s+)?${FECHA}`, 'i'),
        new RegExp(`fecha\\s+(?:de\\s+)?(?:registro|presentaci[oó]n|entrada)\\s*:?\\s*${FECHA}`, 'i'),
    ];
    for (const re of patrones) {
        const m = s.match(re);
        if (m) return aISO(m[1]);
    }
    return null;
}

/**
 * Lee el justificante y devuelve lo que pone, sin juzgarlo.
 * @param {Array<{buffer:Buffer, mimetype:string, originalname:string}>|Buffer} entrada
 * @returns {Promise<{fecha_registro:string|null, frase:string|null, numero_registro:string|null, paginas_leidas:number|null}>}
 */
async function leerJustificanteRegistro(entrada) {
    const pdfEntero = Buffer.isBuffer(entrada)
        ? entrada
        : (await ceeOcrService.normalizeToPdf(entrada)).pdf;

    const { pdf, paginas } = await primerasPaginas(pdfEntero, MAX_PAGINAS);
    const bruto = await llamarGemini(pdf);

    const limpia = (v) => { const s = String(v ?? '').trim(); return s && s !== '--' ? s : null; };
    return {
        fecha_registro: aISO(bruto?.fecha_registro),
        frase: limpia(bruto?.frase),
        numero_registro: limpia(bruto?.numero_registro),
        paginas_leidas: paginas,
    };
}

/**
 * QUÉ fecha se sella. Determinista y con la evidencia citada.
 *
 * @param {Buffer|Array} entrada justificante recién subido (buffer, o los ficheros
 *        del formulario si llegan como fotos sueltas) o bajado de Drive.
 * @param {{hoy?:string}} [opts] `hoy` en ISO, para poder probarlo sin depender del reloj.
 * @returns {Promise<{fecha:string, origen:'justificante'|'subida', leida:string|null,
 *                    numero_registro:string|null, frase:string|null, aviso:string|null}>}
 *          `fecha` NUNCA es null: si no se puede leer, es la de subida — el
 *          justificante ya está archivado y la fase tiene que quedar registrada.
 */
async function resolverFechaRegistro(entrada, { hoy } = {}) {
    const fechaSubida = hoy || new Date().toISOString().slice(0, 10);
    const base = { fecha: fechaSubida, origen: 'subida', leida: null, numero_registro: null, frase: null, aviso: null };

    const vacio = !entrada
        || (Buffer.isBuffer(entrada) && !entrada.length)
        || (Array.isArray(entrada) && !entrada.length);
    if (vacio) {
        return { ...base, aviso: 'No se pudo leer el justificante: se ha guardado la fecha de hoy. Compruébala.' };
    }

    let lectura;
    try {
        lectura = await leerJustificanteRegistro(entrada);
    } catch (e) {
        console.warn('[registroCeeOcr] lectura fallida:', e.message);
        return { ...base, aviso: `No se pudo leer la fecha del justificante (${e.message}): se ha guardado la fecha de hoy. Compruébala.` };
    }

    // La frase citada manda sobre el campo aislado: es la evidencia comprobable.
    const fecha = fechaDesdeFrase(lectura.frase) || lectura.fecha_registro;
    const salida = {
        ...base,
        leida: fecha,
        numero_registro: lectura.numero_registro,
        frase: lectura.frase,
    };

    if (!fecha) {
        return { ...salida, aviso: 'El justificante no dice con claridad su fecha de registro: se ha guardado la fecha de hoy. Compruébala.' };
    }
    // Una fecha futura o anterior al RD 47/2007 no es una fecha de registro: es una
    // lectura mal hecha, y sellarla sería peor que sellar la de hoy.
    if (fecha > fechaSubida) {
        return { ...salida, aviso: `El justificante parece fechado el ${fecha}, que es posterior a hoy: se ha guardado la fecha de hoy. Compruébala.` };
    }
    if (Number(fecha.slice(0, 4)) < ANIO_MIN) {
        return { ...salida, aviso: `La fecha leída (${fecha}) es anterior a ${ANIO_MIN} y no puede ser la de un registro de CEE: se ha guardado la fecha de hoy. Compruébala.` };
    }

    return { ...salida, fecha, origen: 'justificante' };
}

/**
 * ¿Este fichero que acaba de subirse es el justificante de registro? Y si lo es,
 * ¿de qué fecha?
 *
 * Lo usan las DOS rutas `/documents/upload` (CAE y CEE directos), que son
 * genéricas: suben cualquier fichero a cualquier carpeta y no saben de fases. El
 * slot lo manda el navegador, pero una versión anterior cargada puede no mandarlo:
 * el nombre canónico (`… – CEE INICIAL_reg.pdf`) basta para reconocerlo, igual que
 * hace `matchSlot`.
 *
 * Devuelve null cuando no procede, para que quien llama no tenga que decidirlo.
 * Nunca lanza: la subida ya ha terminado y no puede fallar por la lectura.
 */
async function fechaRegistroDeSubida({ slotId, fileName, buffer }) {
    const esRegistro = slotId === 'registro'
        || /_reg\.pdf$/i.test(String(fileName || ''));
    if (!esRegistro || !Buffer.isBuffer(buffer) || !buffer.length) return null;
    try {
        return await resolverFechaRegistro(buffer);
    } catch (e) {
        console.warn('[registroCeeOcr] fechaRegistroDeSubida:', e.message);
        return null;
    }
}

module.exports = {
    PROVIDER,
    leerJustificanteRegistro,
    resolverFechaRegistro,
    fechaRegistroDeSubida,
    fechaDesdeFrase,
};
