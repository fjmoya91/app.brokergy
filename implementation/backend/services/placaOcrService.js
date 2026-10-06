/**
 * placaOcrService — Lee la PLACA DE CARACTERÍSTICAS de la caldera existente.
 *
 * De la placa salen las tres cosas que el expediente NO tiene y que hacen falta
 * para escribir la instalación existente en el `.cex`:
 *
 *   · MARCA y MODELO → el nombre del generador en CE3X («CALDERA VAILLANT
 *     VMW ES 246/5-3»). Sin ellos el equipo va como «CALDERA EXISTENTE».
 *   · POTENCIA (kW)  → es OBLIGATORIA: sin ella `instalacionExistente()` no
 *     escribe el equipo y el certificador la teclea mirando la foto.
 *
 * La foto ya está en el expediente: el instalador la sube al slot
 * `FOTO_PLACA_CALDERA_ANTES` («la etiqueta con marca, modelo y potencia»), que
 * está además en `FULL_RES_SLOTS` para que el navegador no la redimensione. O
 * sea que el dato lleva meses en Drive y se seguía tecleando a mano.
 *
 * Gemelo pequeño de `riteOcrService` / `registroCeeOcrService`: mismo proveedor,
 * `temperature: 0`, `thinkingBudget: 0` y los mismos reintentos ante 429/500/503.
 *
 * ── LAS FOTOS VAN COMO FOTOS, NO COMO PDF ────────────────────────────────────
 * Los otros lectores pasan por `ceeOcrService.normalizeToPdf` porque leen
 * DOCUMENTOS. Aquí no: una placa es un primer plano y lo que se busca —el nº de
 * serie, un «23,3 kW» grabado en relieve— vive en unos pocos píxeles. Meterla en
 * un PDF la recomprime por el camino, que es justo lo que `FULL_RES_SLOTS` evita
 * al subirla. Gemini acepta varias imágenes en la misma petición.
 *
 * ── REGLA: el modelo solo LEE; la POTENCIA la decide el código ───────────────
 * Una placa trae DOS potencias y se parecen: el consumo calorífico (`Qn`,
 * `Hi`, «potencia térmica nominal») y la potencia útil (`Pn`, `P`, «potencia
 * útil»), que es la que pide CE3X. Y casi siempre son RANGOS («Pn 10,9-23,3
 * kW»), porque la caldera modula. Aislar el número bueno de ahí es exactamente
 * donde un modelo se equivoca, así que se le pide la LÍNEA LITERAL y el número
 * lo saca `potenciaDesdeTexto()`, que es determinista — y esa línea es además
 * la EVIDENCIA que se le enseña al certificador para que la contraste sin
 * abrir la foto.
 *
 * ── REGLA: el COMBUSTIBLE se avisa, nunca se aplica ─────────────────────────
 * De él cuelgan el rendimiento de la tabla, el ahorro y la propuesta que el
 * cliente ya firmó. Si la placa dice otro, eso es un hallazgo que mira una
 * persona, no una corrección que se escribe sola.
 */

const driveService = require('./driveService');
const reformaUploadService = require('./reformaUploadService');
const {
    reglasSerie, SCHEMA_SERIE, SCHEMA_SERIE_BASE, elegirSerie, combinarSeries,
} = require('../utils/serieDePlaca');

const PROVIDER = 'gemini';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const RETRYABLE_STATUS = new Set([429, 500, 503]);
const MAX_RETRIES = 2;
const DEADLINE_MS = Number(process.env.PLACA_OCR_TIMEOUT_MS) || 45000;

//: Tope de fotos que se mandan a leer. El slot es `multiple` (se suben varias
//: perspectivas de la misma etiqueta) y cada imagen se paga; con cuatro de la
//: placa ya se ha visto todo lo que hay en ella.
const MAX_PLACAS = Number(process.env.PLACA_OCR_MAX_FOTOS) || 4;
//: Y un par de la caldera entera: la MARCA suele estar en el frontal, en letras
//: grandes, y no en la etiqueta de datos —que a veces solo trae el nº de serie
//: y las potencias—. Sin ellas el modelo lee media respuesta.
const MAX_CONTEXTO = 2;

const SUBCARPETA_DOCS = '12. DOCUMENTOS PARA CEE';
const SLOT_PLACA = 'FOTO_PLACA_CALDERA_ANTES';
const SLOT_CALDERA = 'FOTO_CALDERA_ANTES';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const promptCaldera = (opts = {}) => `Eres un lector de PLACAS DE CARACTERÍSTICAS de calderas de calefacción españolas. Te doy fotos de la etiqueta de datos de una caldera y, a veces, de la caldera entera.

DEVUELVE, transcribiendo literalmente lo que veas:
- marca: el fabricante (VAILLANT, JUNKERS, SAUNIER DUVAL, BAXI, ROCA, FERROLI, ARISTON, VIESSMANN, DOMUSA, BUDERUS, SERRA CALOR…). Puede estar en el frontal de la caldera y no en la etiqueta. «Caldaia», «Chaudière», «Boiler», «Caldera», «Kessel» y sus trozos («…DAIA») son la palabra CALDERA en otro idioma, NUNCA una marca; tampoco la marca del QUEMADOR (Bentone, Riello, Lamborghini…), que es otro aparato atornillado delante.
- modelo: la denominación del modelo tal cual (p. ej. "VMW ES 246/5-3", "CERACLASS EXCELLENCE ZWBE 25-3C", "THEMA CONDENS F25").
${reglasSerie(opts)}
- potencia_texto: la LÍNEA COMPLETA Y LITERAL donde aparece la potencia, con sus símbolos y unidades, tal como está impresa (p. ej. "Pn 80/60°C 10,9-23,3 kW", "Qn = 25,5 kW  Pn = 23,3 kW", "Potencia útil 24 kW", "Potencia kW Sólido 15,3 Líquido 23,3 Gas 23,3"). Cópiala entera; no la resumas ni elijas un número.
- potencias: TODAS las potencias en kW que declare la placa, una por entrada, sin elegir ninguna. Cada entrada lleva "etiqueta" (el rótulo literal que la acompaña: "Pn", "Qn", "Sólido", "Líquido", "Gas", "Potencia útil", "Input", "Output", o "" si no lleva ninguno) y "valor" (el número TAL CUAL, con su coma decimal y su rango si lo tiene: "23,3", "10,9-23,3"). Muchas calderas antiguas son policombustible y declaran una potencia por combustible: transcríbelas todas.
- Las placas antiguas importadas son a menudo una TABLA con cada fila rotulada en varios idiomas. Hay DOS filas de potencia y las dos se transcriben, cada una con su rótulo: la del CONSUMO («Input», «Heat input», «Puissance du foyer», «Portata termica», «Potenza al focolare») y la ÚTIL («Output», «Output into water», «Puissance rendue», «Potenza utile», «Resa»). Ejemplo: una fila «Input · Puissance du foyer · 49,8 kW (42900 kcal/h)» y la siguiente «Output into water · Puissance rendue · 43 kW (37000 kcal/h)» son DOS entradas: {"etiqueta":"Input","valor":"49,8"} y {"etiqueta":"Output","valor":"43"}. Las kcal/h entre paréntesis no son otra potencia.
- combustible: uno de "gas_natural", "glp", "gasoleo", "pellets", "carbon", "electricidad", o null. El GLP incluye propano y butano.
- acs: true si la placa dice que la caldera también produce agua caliente sanitaria (caldera "mixta", con caudal de ACS en l/min), false si es solo calefacción, null si no se dice.
- anio: el año de fabricación (4 cifras) si aparece, si no null.

REGLAS:
- NO inventes ni completes datos que no se lean con claridad: es preferible null a un valor adivinado. Un modelo adivinado acaba impreso en un certificado.
- En potencia_texto copia la línea TAL CUAL, incluidos los rangos y las dos potencias si aparecen las dos. No conviertas ni redondees nada.
- NO confundas la potencia en kW con la presión (bar), el caudal (l/min), la tensión (V) ni el consumo eléctrico (W).`;

//: El modelo nuevo lee con la lista de códigos; el de siempre, sin ella (ver
//: SCHEMA_SERIE_BASE en utils/serieDePlaca: con ella entraba en bucle).
const PROMPT = promptCaldera();
const PROMPT_BASE = promptCaldera({ codigos: false });

const SCHEMA = {
    type: 'OBJECT',
    properties: {
        marca: { type: 'STRING', nullable: true },
        modelo: { type: 'STRING', nullable: true },
        ...SCHEMA_SERIE,
        potencia_texto: { type: 'STRING', nullable: true },
        potencias: {
            type: 'ARRAY',
            items: {
                type: 'OBJECT',
                properties: {
                    etiqueta: { type: 'STRING', nullable: true },
                    valor: { type: 'STRING' },
                },
                required: ['valor'],
            },
        },
        combustible: { type: 'STRING', nullable: true },
        acs: { type: 'BOOLEAN', nullable: true },
        anio: { type: 'INTEGER', nullable: true },
    },
};

const SCHEMA_BASE = {
    type: 'OBJECT',
    properties: {
        marca: { type: 'STRING', nullable: true },
        modelo: { type: 'STRING', nullable: true },
        ...SCHEMA_SERIE_BASE,
        potencia_texto: { type: 'STRING', nullable: true },
        potencias: {
            type: 'ARRAY',
            items: {
                type: 'OBJECT',
                properties: {
                    etiqueta: { type: 'STRING', nullable: true },
                    valor: { type: 'STRING' },
                },
                required: ['valor'],
            },
        },
        combustible: { type: 'STRING', nullable: true },
        acs: { type: 'BOOLEAN', nullable: true },
        anio: { type: 'INTEGER', nullable: true },
    },
};

// ── La potencia, decidida por el código ──────────────────────────────────────

//: Lo que en una placa significa POTENCIA ÚTIL (lo que la caldera entrega al
//: circuito) frente a CONSUMO calorífico (lo que quema). CE3X pide la primera.
//: Con los rótulos de las placas importadas antiguas (italiano, francés, inglés),
//: que son TABLAS con una fila de consumo y otra útil: medido en la SERRA CALOR
//: de 26RES060_OP246, «Input · Puissance du foyer 49,8 kW» y «Output into
//: water · Puissance rendue 43 kW». Sin estos rótulos se tomaba el consumo.
const RE_UTIL = /\b(pn|p\s*n|p(?:ot(?:encia)?)?\.?\s*(?:útil|util|nominal\s+útil|calefacci[óo]n)|output|nutzleistung|puissance\s+rendue|potenza\s+utile|resa)\b/i;
const RE_CONSUMO = /\b(qn|q\s*n|hi|consumo\s+calor[íi]fico|carga\s+t[ée]rmica|input|w[äa]rmebelastung|puissance\s+du\s+foyer|portata\s+termica|potenza\s+al\s+focolare)\b/i;

/** 'util' | 'consumo' | null, según cuál de los dos aparezca MÁS CERCA del número. */
function ultimoCalificador(antes) {
    const fin = (re) => {
        let ult = -1, m;
        const g = new RegExp(re.source, 'gi');
        while ((m = g.exec(antes)) !== null) ult = m.index;
        return ult;
    };
    const u = fin(RE_UTIL), c = fin(RE_CONSUMO);
    if (u < 0 && c < 0) return null;
    return u > c ? 'util' : 'consumo';
}

/**
 * La potencia en kW que se escribe, sacada de la línea literal de la placa.
 *
 * - Si la línea distingue útil y consumo, manda la ÚTIL: es lo que pide CE3X y
 *   son cifras distintas (una caldera de "25,5 kW de consumo" entrega 23,3).
 * - De un RANGO se coge el MÁXIMO: la caldera modula hacia abajo, y su potencia
 *   nominal es el tope.
 *
 * @returns {{kw:number|null, base:'util'|'consumo'|'unica'|null, candidatos:number[]}}
 */
function potenciaDesdeTexto(texto) {
    const s = String(texto || '');
    if (!s.trim()) return { kw: null, base: null, candidatos: [] };

    // Números seguidos (o precedidos en la línea) de kW. Se admite la coma
    // decimal española y el punto: las placas usan las dos.
    const nums = [];
    // Las kcal/h entre corchetes o paréntesis pueden ir ENTRE el número y la
    // unidad («49.8 [42900] Kw», las tablas de las placas importadas antiguas):
    // se saltan, no son otra potencia.
    const re = /(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:-|–|a|hasta)?\s*(\d{1,3}(?:[.,]\d{1,2})?)?\s*(?:[[(][\d.,\s]{1,12}[\])]\s*)?k\s*w/gi;
    let m;
    while ((m = re.exec(s)) !== null) {
        // El calificador que manda es el ÚLTIMO que haya delante del número, no
        // el que esté: en "Qn 25,5 kW Pn 23,3 kW" los dos caen dentro de la
        // misma ventana, y quedarse con "hay un Qn" dejaría sin marcar la cifra
        // que sí es la útil.
        const antes = s.slice(0, m.index).slice(-48);
        const tipo = ultimoCalificador(antes);
        [m[1], m[2]].filter(Boolean).forEach((n) => {
            const v = Number(String(n).replace(',', '.'));
            if (v > 0 && v < 1000) nums.push({ v, util: tipo === 'util', consumo: tipo === 'consumo' });
        });
    }
    if (!nums.length) return { kw: null, base: null, candidatos: [] };

    const utiles = nums.filter((n) => n.util);
    const sinConsumo = nums.filter((n) => !n.consumo);
    const lista = utiles.length ? utiles : (sinConsumo.length ? sinConsumo : nums);
    const kw = Math.max(...lista.map((n) => n.v));
    const base = utiles.length ? 'util' : (nums.every((n) => n.consumo) ? 'consumo' : 'unica');
    return { kw, base, candidatos: [...new Set(nums.map((n) => n.v))].sort((a, b) => a - b) };
}

// ── La placa POLICOMBUSTIBLE ─────────────────────────────────────────────────
// Muchas calderas antiguas de fundición queman lo que se les eche, y su placa
// declara UNA POTENCIA POR COMBUSTIBLE: la ROCA P-30 de 26RES060_186 pone
// «Potencia kW  Sólido 15,3  Líquido 23,3  Gas 23,3». Ahí no hay una potencia
// que leer: hay tres, y cuál vale depende de con qué se esté quemando — que es
// un dato del expediente, no de la foto. Coger la primera, o la mayor, es
// escribir en el certificado una caldera un 52 % más potente que la real.

//: El orden IMPORTA: «gasóleo» contiene «gas», así que lo líquido se comprueba
//: antes y el gas exige que no le siga «óleo/oil».
const FAMILIAS = [
    ['solido', /\b(s[óo]lid|le[ñn]a|carb[óo]n|coke|coque|biomasa|p[ée]l?let|madera)/i],
    ['liquido', /\b(l[íi]quid|gas[óo]leo|gasoil|gas-oil|fuel|di[ée]sel)/i],
    ['gas', /\b(gas|propano|butano|glp|metano)\b/i],
];
//: Fuente única en `utils/combustibleCaldera.js`, que los comparte con la
//: revisión del CEE (allí deciden si un combustible distinto cambia la fila
//: del Anexo VIII o no).
const { FAMILIA_DE_COMBUSTIBLE, NOMBRE_FAMILIA } = require('../utils/combustibleCaldera');

//: Solo para los AVISOS, que los lee una persona en castellano. El valor que
//: viaja al .cex sigue siendo el número, con el punto decimal que escribe CE3X
//: en sus propios ficheros (`V24.0`).
const enKw = (v) => `${String(v).replace('.', ',')} kW`;

/** La familia de combustible que nombra un rótulo de la placa, si nombra alguna. */
function familiaDe(etiqueta) {
    const s = String(etiqueta || '');
    for (const [fam, re] of FAMILIAS) if (re.test(s)) return fam;
    return null;
}

/** Los kW de un valor transcrito ("23,3", "10,9-23,3"): de un rango, el máximo. */
function kwDe(valor) {
    const nums = String(valor || '').match(/\d{1,3}(?:[.,]\d{1,2})?/g) || [];
    const vs = nums.map((n) => Number(n.replace(',', '.'))).filter((v) => v > 0 && v < 1000);
    return vs.length ? Math.max(...vs) : null;
}

/**
 * Qué potencia se escribe, de entre todas las que declara la placa.
 *
 * @param {Array<{etiqueta?:string, valor:string}>} potencias  lo transcrito
 * @param {string|null} combustible  el que declara el EXPEDIENTE ('gasoleo', 'pellets'…)
 * @returns {{kw, base, candidatos, familias, aviso}}
 */
function elegirPotencia(potencias, combustible) {
    const filas = (potencias || [])
        .map((p) => ({ etiqueta: String(p?.etiqueta || '').trim(), kw: kwDe(p?.valor), fam: familiaDe(p?.etiqueta) }))
        .filter((f) => f.kw);
    if (!filas.length) return { kw: null, base: null, candidatos: [], familias: [], aviso: null };

    const candidatos = [...new Set(filas.map((f) => f.kw))].sort((a, b) => a - b);
    const conFamilia = filas.filter((f) => f.fam);

    // ¿Es una placa policombustible? Lo es si declara DOS familias distintas: una
    // sola («Gas 24 kW») es solo el rótulo del combustible de una caldera normal.
    const familias = [...new Set(conFamilia.map((f) => f.fam))];
    if (familias.length > 1) {
        const quiere = FAMILIA_DE_COMBUSTIBLE[combustible] || null;
        const suya = conFamilia.filter((f) => f.fam === quiere);
        const resumen = conFamilia.map((f) => `${f.etiqueta} ${enKw(f.kw)}`).join(' · ');
        if (!suya.length) {
            return {
                kw: null, base: 'multicombustible', candidatos, familias,
                aviso: 'La placa es de una caldera POLICOMBUSTIBLE y declara una potencia por '
                    + `combustible (${resumen}). ${combustible
                        ? 'Ninguna corresponde al que declara el expediente'
                        : 'El expediente no dice con cuál funciona'}: elige tú la que toque.`,
            };
        }
        return {
            kw: Math.max(...suya.map((f) => f.kw)), base: 'multicombustible', candidatos, familias,
            aviso: `La placa es POLICOMBUSTIBLE (${resumen}). Se toma la de `
                + `${NOMBRE_FAMILIA[quiere]}, que es lo que declara el expediente — `
                + 'compruébalo: la potencia cambia con el combustible.',
        };
    }

    // Placa normal: manda la potencia ÚTIL sobre el consumo calorífico.
    const utiles = filas.filter((f) => ultimoCalificador(f.etiqueta) === 'util');
    const sinConsumo = filas.filter((f) => ultimoCalificador(f.etiqueta) !== 'consumo');
    const lista = utiles.length ? utiles : (sinConsumo.length ? sinConsumo : filas);
    return {
        kw: Math.max(...lista.map((f) => f.kw)),
        base: utiles.length ? 'util'
            : (filas.every((f) => ultimoCalificador(f.etiqueta) === 'consumo') ? 'consumo' : 'unica'),
        candidatos, familias, aviso: null,
    };
}

const COMBUSTIBLES = new Set(['gas_natural', 'glp', 'gasoleo', 'pellets', 'carbon', 'electricidad']);
const limpia = (v) => { const s = String(v ?? '').trim(); return s && !/^[-—.]+$/.test(s) ? s : null; };

// ── Gemini ───────────────────────────────────────────────────────────────────

/**
 * Una lectura de fotos contra Gemini.
 *
 * El PROMPT y el ESQUEMA son parámetros porque de aquí tira también
 * `placaEquipoOcrService` (las placas de la bomba de calor NUEVA): lo que cambia
 * entre los dos lectores es QUÉ se lee, no CÓMO se pide —el plazo, los
 * reintentos ante 429/500/503 y la traza del gasto son los mismos—. Tenerlo dos
 * veces es tenerlo mal el día que se corrija uno solo.
 */
/**
 * @param {Object} opts
 * @param {number} [opts.deadline]  cuánto se espera, en ms. Por defecto el de las
 *   PLACAS, que es lo que este servicio lee. Quien lea otra cosa pone el suyo:
 *   inventariar los huecos de una fachada no cuesta lo mismo que sacar tres
 *   campos de una etiqueta, y un plazo pensado para lo segundo corta lo primero
 *   justo cuando el modelo estaba a punto de contestar.
 * @param {boolean} [opts.pensar]  dejar que el modelo RAZONE antes de contestar.
 *
 * ⚠️ `thinkingBudget: 0` es lo correcto para TRANSCRIBIR —una placa se lee, no se
 * razona, y el presupuesto a cero ahorra tokens y tiempo—, pero con una tarea que
 * SÍ exige razonar y un `responseSchema` grande la petición **NO responde nunca**:
 * ni contesta ni falla. Medido sobre la foto de fachada de 26RES060_186, que
 * aguantó 240 s colgada y con `pensar: true` contestó en 13,3 s (2.148 tokens de
 * pensamiento). No es lentitud, es un bloqueo — y por eso no se arregla subiendo
 * el plazo. Prompt largo con schema pequeño va, y schema grande con prompt corto
 * también: es la combinación la que lo dispara.
 */
async function llamarGemini(imagenes, {
    prompt = PROMPT, schema = SCHEMA, etiqueta = 'placaOcr', deadline = DEADLINE_MS,
    pensar = false, modelo = GEMINI_MODEL, resolucion = null, maxTokens = null, temperatura = 0,
} = {}) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('Falta GEMINI_API_KEY en el entorno.');

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`;
    const body = {
        contents: [{
            role: 'user',
            parts: [
                { text: prompt },
                // Además de imágenes en línea admite un FICHERO ya subido a la
                // File API de Gemini (`fileUri`: un vídeo no cabe en línea) y
                // TEXTO suelto entre medias, para rotular cada fichero («VÍDEO 2»).
                ...imagenes.map((i) => (i.texto !== undefined ? { text: String(i.texto) }
                    : i.fileUri ? { file_data: { mime_type: i.mimeType, file_uri: i.fileUri } }
                    : { inline_data: { mime_type: i.mimeType, data: i.buffer.toString('base64') } })),
            ],
        }],
        generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: schema,
            temperature: temperatura,
            // Ver el aviso de la cabecera: a cero es lo correcto para transcribir,
            // y es un bloqueo seguro para lo que hay que razonar.
            ...(pensar ? {} : { thinkingConfig: { thinkingBudget: 0 } }),
            ...(resolucion ? { mediaResolution: resolucion } : {}),
            // Un TOPE de salida. Lo que se pide son unas decenas de campos cortos
            // (~300 tokens), y sin tope una lectura puede entrar en BUCLE: medido el
            // 30/09/2026, gemini-3.6-flash devolvió en un serie_texto miles de
            // «_1_1_1…» y otras se quedaban colgadas hasta el plazo. Con el tope el
            // bucle acaba en una respuesta cortada, que falla rápido y se descarta.
            ...(maxTokens ? { maxOutputTokens: maxTokens } : {}),
        },
    };

    const t0 = Date.now();
    const finPlazo = t0 + (Number(deadline) > 0 ? Number(deadline) : DEADLINE_MS);
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
        console.warn(`[${etiqueta}] Gemini ${res.status} (intento ${intento + 1}), reintentando en ${espera}ms…`);
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
    console.log(`[${etiqueta}] Gemini ${modelo} ${((Date.now() - t0) / 1000).toFixed(1)}s · `
        + `${imagenes.length} foto(s) · in=${uso.promptTokenCount ?? '?'} out=${uso.candidatesTokenCount ?? '?'}`
        + (uso.thoughtsTokenCount ? ` think=${uso.thoughtsTokenCount}` : ''));
    const out = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!out) throw new Error('Gemini no devolvió contenido.');
    if (data?.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
        throw new Error('La lectura se cortó por el tope de salida (el modelo entró en bucle).');
    }
    return JSON.parse(out);
}

//: El SEGUNDO modelo que lee cada placa. Dos modelos distintos se equivocan en
//: sitios distintos —repetir el mismo no, que falla igual—, así que leer con los
//: dos y comparar el nº de serie es lo que detecta el carácter dudoso. Y éste es
//: además el que mejor lee los nºs de serie: medido el 30/09/2026 sobre 37 placas
//: de ud. exterior, 32 frente a 25 del de siempre, y el único que acertó las
//: rachas de ceros («075076300000022»). Vacío = una sola lectura, como antes.
const MODELO_SERIE = process.env.PLACA_OCR_MODELO_SERIE ?? 'gemini-3.6-flash';
//: Lo que se pide son campos cortos (~300 tokens). Ver el tope en `llamarGemini`.
const MAX_TOKENS_PLACA = Number(process.env.PLACA_OCR_MAX_TOKENS) || 1536;

/**
 * Lee las MISMAS fotos con los dos modelos, en paralelo.
 *
 * `base` es el modelo de siempre (GEMINI_MODEL), con el prompt SIN la lista de
 * códigos: de él siguen saliendo marca, modelo, potencias… — lo medido no
 * cambia— y su nº de serie hace de CONTRASTE. `serie` es el segundo, con la lista,
 * que manda en el nº de serie. Una lectura que falle NO tumba la otra;
 * si fallan las dos, se lanza el error de la base.
 *
 * @returns {Promise<{base:object|null, serie:object|null}>}
 */
async function leerDosVeces(imagenes, {
    prompt = PROMPT, schema = SCHEMA, promptBase = PROMPT_BASE, schemaBase = SCHEMA_BASE,
    etiqueta = 'placaOcr',
} = {}) {
    const dos = MODELO_SERIE && MODELO_SERIE !== GEMINI_MODEL;
    // Si una lectura acaba en BUCLE (cortada por el tope), se repite UNA vez con
    // algo de variación: con la decodificación voraz de `temperature: 0` el bucle
    // se repite idéntico, y con un poco de aleatoriedad casi siempre sale. Solo
    // ante el bucle: para cualquier otro fallo, repetir no arregla nada.
    const conReintento = async (o) => {
        try { return await llamarGemini(imagenes, { ...o, maxTokens: MAX_TOKENS_PLACA }); } catch (e) {
            if (!/bucle/.test(e.message)) throw e;
            console.warn(`[${o.etiqueta}] bucle; se repite con variación`);
            return llamarGemini(imagenes, { ...o, maxTokens: MAX_TOKENS_PLACA, temperatura: 0.4 });
        }
    };
    const [rBase, rSerie] = await Promise.allSettled([
        conReintento({ prompt: dos ? promptBase : prompt, schema: dos ? schemaBase : schema, etiqueta }),
        dos
            ? conReintento({ prompt, schema, modelo: MODELO_SERIE, etiqueta: `${etiqueta}+serie` })
            : Promise.resolve(null),
    ]);
    if (rBase.status === 'rejected' && (!dos || rSerie.status === 'rejected')) throw rBase.reason;
    if (rBase.status === 'rejected') console.warn(`[${etiqueta}] la lectura base falló: ${rBase.reason?.message}`);
    if (dos && rSerie.status === 'rejected') console.warn(`[${etiqueta}] la lectura del nº de serie (${MODELO_SERIE}) falló: ${rSerie.reason?.message}`);
    return {
        base: rBase.status === 'fulfilled' ? rBase.value : null,
        serie: dos && rSerie.status === 'fulfilled' ? rSerie.value : null,
    };
}

// ── Las fotos, desde Drive ───────────────────────────────────────────────────

const IMG_EXT = /\.(jpe?g|png|webp|heic|heif|bmp|tiff?)$/i;
const esImagen = (f) => (f.mimeType || '').startsWith('image/') || IMG_EXT.test(f.name || '');
const mimeDe = (f) => ((f.mimeType || '').startsWith('image/') ? f.mimeType : 'image/jpeg');

/**
 * Las fotos de la placa (y un par de la caldera) que hay en "12. DOCUMENTOS
 * PARA CEE", por el MISMO criterio de nombre con el que se subieron
 * (`fileBelongsToSlot`). Drive es la fuente de verdad de qué ficheros hay
 * (regla 20): no se mira `reforma_uploads`.
 *
 * @returns {Promise<{fotos:Array<{name,buffer,mimeType,slot}>, avisos:string[]}>}
 */
async function fotosDeLaCaldera(datosCalculo = {}) {
    const avisos = [];
    const driveFolderId = datosCalculo?.drive_folder_id || datosCalculo?.inputs?.drive_folder_id;
    if (!driveFolderId) return { fotos: [], avisos: ['El expediente no tiene carpeta de Drive.'] };

    const subfolderId = await driveService.findSubfolderByName(driveFolderId, SUBCARPETA_DOCS);
    if (!subfolderId) return { fotos: [], avisos: [`No existe la carpeta «${SUBCARPETA_DOCS}».`] };

    const ficheros = (await driveService.listFiles(subfolderId) || []).filter(esImagen);
    const porSlot = (slot) => ficheros
        .filter((f) => reformaUploadService.fileBelongsToSlot(f.name, slot))
        .sort((a, b) => String(a.name).localeCompare(String(b.name), 'es', { numeric: true }));

    const placas = porSlot(SLOT_PLACA).slice(0, MAX_PLACAS);
    const calderas = porSlot(SLOT_CALDERA).slice(0, MAX_CONTEXTO);

    if (!placas.length && !calderas.length) {
        return { fotos: [], avisos: ['No hay ninguna foto de la caldera ni de su placa en el expediente.'] };
    }
    if (!placas.length) {
        avisos.push('No hay foto de la PLACA, solo de la caldera: la potencia y el nº de serie '
            + 'casi seguro no se leen. Pídele al instalador la etiqueta de cerca.');
    }

    const fotos = [];
    for (const f of [...placas, ...calderas]) {
        // eslint-disable-next-line no-await-in-loop
        const buffer = await driveService.getFileContent(f.id).catch(() => null);
        if (buffer?.length) {
            fotos.push({
                id: f.id, name: f.name, buffer, mimeType: mimeDe(f),
                slot: placas.includes(f) ? SLOT_PLACA : SLOT_CALDERA,
            });
        }
    }
    if (!fotos.length) avisos.push('Las fotos están enlazadas pero no se han podido descargar de Drive.');
    return { fotos, avisos };
}

/**
 * Lee la placa. No escribe nada: devuelve lo leído, lo decidido y sus avisos.
 *
 * @param {Array<{buffer:Buffer, mimetype:string, originalname:string}>|{datos_calculo:object}} entrada
 *        ficheros de un formulario, o el expediente del que sacar sus fotos de Drive.
 */
async function leerPlacaCaldera(entrada, opciones = {}) {
    let fotos = [];
    const avisos = [];

    if (Array.isArray(entrada)) {
        fotos = entrada
            .filter((f) => (f.mimetype || '').startsWith('image/'))
            .slice(0, MAX_PLACAS + MAX_CONTEXTO)
            .map((f) => ({ name: f.originalname, buffer: f.buffer, mimeType: f.mimetype, slot: null }));
        if (!fotos.length) throw Object.assign(new Error('Hay que soltar una FOTO de la placa.'), { status: 400 });
    } else {
        const de = await fotosDeLaCaldera(entrada?.datos_calculo || entrada || {});
        fotos = de.fotos;
        avisos.push(...de.avisos);
        if (!fotos.length) {
            return { leido: null, potencia_kw: null, fotos: [], avisos, sin_fotos: true };
        }
    }

    // DOS lecturas en paralelo con dos modelos distintos: la base (el de siempre)
    // da marca, modelo y potencias —lo medido no cambia—, y la otra manda en el
    // nº de serie. Medido el 30/09/2026 en 26RES093_11: la placa dice
    // «Nº SERIE: 0905326219» (foto girada) y la lectura única había escrito
    // «00053210» en el expediente. Ver `combinarSeries` (utils/serieDePlaca).
    const { base, serie: deSerie } = await leerDosVeces(fotos, { etiqueta: 'placaOcr' });
    const bruto = base || deSerie || {};

    // Se decide sobre las potencias TRANSCRITAS UNA A UNA, que es lo que permite
    // ver que una placa es policombustible. La línea literal queda de red de
    // seguridad para cuando el modelo no las separe.
    let pot = elegirPotencia(bruto?.potencias, opciones.combustible || null);
    if (!pot.kw && pot.base !== 'multicombustible') {
        const porTexto = potenciaDesdeTexto(bruto?.potencia_texto);
        if (porTexto.kw) pot = { ...porTexto, familias: [], aviso: null };
    }
    if (pot.aviso) avisos.push(pot.aviso);

    const combustible = COMBUSTIBLES.has(String(bruto?.combustible || '').toLowerCase())
        ? String(bruto.combustible).toLowerCase() : null;

    if (!pot.kw && pot.base !== 'multicombustible') {
        avisos.push(bruto?.potencia_texto
            ? `No se ha podido sacar la potencia de «${bruto.potencia_texto}»: ponla a mano.`
            : 'En las fotos no se lee ninguna potencia en kW.');
    } else if (pot.base === 'consumo') {
        avisos.push(`La placa solo declara el CONSUMO calorífico (${pot.kw.toString().replace('.', ',')} kW), no la potencia útil. `
            + 'CE3X pide la útil, que es algo menor: compruébalo.');
    }
    const modeloLeido = limpia(bruto?.modelo)?.toUpperCase() || null;
    const serie = combinarSeries(
        deSerie ? elegirSerie(deSerie, { modelo: modeloLeido }) : null,
        base ? elegirSerie(base, { modelo: modeloLeido }) : null,
    );
    if (serie.aviso) avisos.push(serie.aviso);

    if (!bruto?.marca && !bruto?.modelo) {
        avisos.push('No se lee ni la marca ni el modelo. Si la foto es solo de la etiqueta de datos, '
            + 'la marca suele estar en el frontal de la caldera.');
    }

    return {
        leido: {
            marca: limpia(bruto?.marca)?.toUpperCase() || null,
            modelo: limpia(bruto?.modelo)?.toUpperCase() || null,
            numero_serie: serie.serie || null,
            serie_texto: serie.texto || null,
            serie_origen: serie.origen || null,
            serie_confirmada: !!serie.confirmada,
            // Con las dos lecturas en desacuerdo el nº de serie NO se escribe solo:
            // se enseñan las dos alternativas y elige una persona mirando la foto.
            serie_dudosa: !!serie.dudosa,
            serie_alternativas: serie.alternativas?.length ? serie.alternativas : undefined,
            potencia_texto: limpia(bruto?.potencia_texto),
            potencias: (bruto?.potencias || []).filter((p) => kwDe(p?.valor)),
            combustible,
            acs: typeof bruto?.acs === 'boolean' ? bruto.acs : null,
            anio: Number(bruto?.anio) > 1950 && Number(bruto?.anio) <= new Date().getFullYear()
                ? Number(bruto.anio) : null,
        },
        potencia_kw: pot.kw,
        potencia_base: pot.base,
        potencia_candidatos: pot.candidatos,
        potencia_familias: pot.familias || [],
        fotos: fotos.map((f) => ({ id: f.id || null, name: f.name, slot: f.slot })),
        avisos,
    };
}

//: La FUENTE ÚNICA vive en `utils/combustibleCaldera.js`: la comparte la
//: revisión del CEE, que cruza este combustible con el <VectorEnergetico> del
//: certificado y no puede arrastrar Gemini, Drive y el correo para usarla. Se
//: reexporta para que quien ya la pedía aquí no se entere.
const { combustibleDeclarado } = require('../utils/combustibleCaldera');

module.exports = {
    PROVIDER, leerPlacaCaldera, fotosDeLaCaldera, potenciaDesdeTexto, elegirPotencia,
    combustibleDeclarado, SLOT_PLACA, SLOT_CALDERA,
    // Para `placaEquipoOcrService`, que lee otras placas con el mismo cliente.
    llamarGemini, leerDosVeces, SUBCARPETA_DOCS, GEMINI_MODEL, MODELO_SERIE, limpia,
};
