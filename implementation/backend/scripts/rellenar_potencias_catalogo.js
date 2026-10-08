#!/usr/bin/env node
/**
 * rellenar_potencias_catalogo.js — BARRIDO de las potencias que faltan en el
 * catálogo de aerotermia, leyéndolas de la FICHA TÉCNICA de cada modelo.
 *
 * CE3X 3.1 pide la potencia de cada equipo (calefacción, ACS, refrigeración) y
 * sin ella no escribe el XML del certificado. La app la saca de
 * `aerotermia.potencia_calefaccion`, que es la MISMA columna de la que sale la
 * Memoria RITE: rellenarla aquí hace que el CEE y la memoria digan lo mismo.
 *
 *   node scripts/rellenar_potencias_catalogo.js            → en SECO: lee y enseña
 *   node scripts/rellenar_potencias_catalogo.js --execute  → además escribe
 *   node scripts/rellenar_potencias_catalogo.js --id=503   → solo ese modelo
 *
 * REGLA — el modelo LEE; qué se escribe lo decide el código. Se le pide la línea
 * literal de donde sale la potencia (la evidencia que se enseña) y solo se
 * escribe con confianza alta y un valor razonable (0,3-60 kW). En una bomba de
 * calor de ACS la potencia es la de la BOMBA, nunca la de la resistencia de
 * apoyo ni la suma de las dos. Solo rellena HUECOS: lo ya escrito no se toca.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { PDFDocument } = require('pdf-lib');
const supabaseMod = require('../services/supabaseClient');
const driveService = require('../services/driveService');
const { ajustesGemini } = require('../utils/geminiAjustes');

const supabase = supabaseMod.supabase || supabaseMod;
const EXECUTE = process.argv.includes('--execute');
const SOLO_ID = (process.argv.find(a => a.startsWith('--id=')) || '').split('=')[1];
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const MAX_PAGINAS = 8;

const PROMPT = `Eres un lector de FICHAS TÉCNICAS de bombas de calor (aerotermia para calefacción o bombas de calor para agua caliente sanitaria).

DEVUELVE, leyendo SOLO lo que pone el documento:
- potencia_calefaccion_kw: la POTENCIA CALORÍFICA (térmica) NOMINAL de la bomba de calor en kW, como TEXTO tal cual aparece (p. ej. "8,00" o "1.6"). Si da varias condiciones de ensayo, la de A7/W35 para calefacción; en una bomba de calor de ACS, la potencia calorífica de la BOMBA (compresor) en su condición nominal. NUNCA la potencia de la resistencia eléctrica de apoyo, ni la suma bomba + resistencia, ni la potencia ABSORBIDA/eléctrica. Si viene en W, conviértela a kW. null si no aparece con claridad.
- potencia_frigorifica_kw: la potencia frigorífica nominal en kW (A35/W18 o A35/W7), como texto; null si no aparece.
- linea: la línea o fila literal de donde sacas la potencia calorífica (rótulo + valor).
- confianza: "alta" si la potencia calorífica aparece rotulada sin ambigüedad para ESTE modelo; "baja" si dudas (varios modelos en la tabla y no sabes cuál, o no está clara).

El modelo que buscamos es: {{MODELO}}. Si la ficha cubre varios modelos, coge SOLO la columna de éste.`;

const SCHEMA = {
    type: 'OBJECT',
    properties: {
        potencia_calefaccion_kw: { type: 'STRING', nullable: true },
        potencia_frigorifica_kw: { type: 'STRING', nullable: true },
        linea: { type: 'STRING', nullable: true },
        confianza: { type: 'STRING', enum: ['alta', 'baja'] },
    },
    required: ['confianza'],
};

function driveIdFrom(url) {
    const s = String(url || '');
    return (s.match(/\/d\/([\w-]{20,})/) || s.match(/[?&]id=([\w-]{20,})/) || [])[1] || null;
}

/** "1,6" · "1.600" (W) · "8.00" → número en kW, o null. */
function aKw(txt) {
    if (txt == null) return null;
    let s = String(txt).trim().replace(/\s/g, '');
    const enW = /w$/i.test(s) && !/kw$/i.test(s);
    s = s.replace(/k?w$/i, '');
    if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '');
    s = s.replace(',', '.');
    let v = parseFloat(s);
    if (!(v > 0)) return null;
    if (enW || v > 200) v = v / 1000;
    return Math.round(v * 100) / 100;
}

async function primerasPaginas(buf) {
    try {
        const src = await PDFDocument.load(buf, { ignoreEncryption: true });
        if (src.getPageCount() <= MAX_PAGINAS) return buf;
        const out = await PDFDocument.create();
        (await out.copyPages(src, [...Array(MAX_PAGINAS).keys()])).forEach(p => out.addPage(p));
        return Buffer.from(await out.save());
    } catch { return buf; }
}

async function leer(pdf, modelo) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
        body: JSON.stringify({
            contents: [{ role: 'user', parts: [
                { text: PROMPT.replace('{{MODELO}}', modelo) },
                { inline_data: { mime_type: 'application/pdf', data: pdf.toString('base64') } },
            ] }],
            generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, ...ajustesGemini(MODEL, { temperatura: 0 }) },
        }),
    });
    const txt = await res.text();
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${txt.slice(0, 200)}`);
    return JSON.parse(JSON.parse(txt)?.candidates?.[0]?.content?.parts?.[0]?.text || '{}');
}

(async () => {
    let q = supabase.from('aerotermia')
        .select('id, marca, modelo_comercial, modelo_conjunto, modelo_ud_exterior, ficha_tecnica, potencia_calefaccion, potencia_frigorifica')
        .or('potencia_calefaccion.is.null,potencia_calefaccion.lte.0');
    if (SOLO_ID) q = q.eq('id', SOLO_ID);
    const { data, error } = await q;
    if (error) throw error;
    console.log(`${data.length} modelos sin potencia de calefacción · ${EXECUTE ? 'ESCRIBIENDO' : 'en SECO'}\n`);

    let escritos = 0;
    for (const m of data) {
        const nombre = `${m.id} · ${m.marca} ${m.modelo_comercial || m.modelo_conjunto || ''}`;
        const id = driveIdFrom(m.ficha_tecnica);
        if (!id) { console.log(`– ${nombre}: sin ficha técnica en Drive → a mano`); continue; }
        try {
            const pdf = await primerasPaginas(await driveService.getFileContent(id));
            const r = await leer(pdf, [m.marca, m.modelo_comercial, m.modelo_ud_exterior].filter(Boolean).join(' '));
            const kw = aKw(r.potencia_calefaccion_kw);
            const kwFrio = aKw(r.potencia_frigorifica_kw);
            const ok = r.confianza === 'alta' && kw >= 0.3 && kw <= 60;
            console.log(`${ok ? '✓' : '?'} ${nombre}: ${kw ?? '—'} kW${kwFrio ? ` · frío ${kwFrio} kW` : ''} (${r.confianza})\n    «${r.linea || ''}»`);
            if (ok && EXECUTE) {
                const upd = { potencia_calefaccion: kw };
                if (kwFrio > 0 && !(m.potencia_frigorifica > 0)) upd.potencia_frigorifica = kwFrio;
                const { error: e2 } = await supabase.from('aerotermia').update(upd)
                    .eq('id', m.id).or('potencia_calefaccion.is.null,potencia_calefaccion.lte.0');
                if (e2) throw e2;
                escritos++;
            }
        } catch (e) {
            console.log(`✗ ${nombre}: ${e.message}`);
        }
    }
    console.log(`\n${EXECUTE ? `Escritos: ${escritos}` : 'En seco: no se ha escrito nada (añade --execute).'}`);
})().catch(e => { console.error(e); process.exit(1); });
