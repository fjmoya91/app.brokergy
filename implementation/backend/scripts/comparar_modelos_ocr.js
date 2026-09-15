#!/usr/bin/env node
/**
 * comparar_modelos_ocr — Qué modelo de Gemini lee bien una placa, y a qué precio.
 *
 *   node scripts/comparar_modelos_ocr.js <foto.jpg> <lo que pone de verdad> [modelos]
 *   node scripts/comparar_modelos_ocr.js placa.jpg 1650773 gemini-2.5-flash,gemini-3.1-flash-lite
 *
 * Existe para NO decidir de oídas el día que haya que cambiar de modelo —y ese día
 * llegará: `gemini-2.5-flash-lite` ya responde 404 «no longer available to new
 * users»—. Lee la MISMA foto con cada modelo, con y sin «pensar», y enseña si
 * acierta, cuántos tokens gasta y cuánto cuesta la lectura.
 *
 * ⚠️ Lo que se compara es el COSTE POR LECTURA, no el precio por token. Medido
 * sobre una placa real: la misma foto son 445 tokens de entrada en 2.5-flash y
 * 1.251 en los 3.x — casi el triple—, así que un modelo con precio unitario más
 * bajo puede salir MÁS CARO leyendo imágenes. Los 3.x tokenizan la imagen con más
 * detalle.
 *
 * La verdad (el segundo argumento) se saca mirando la foto, no de otra máquina.
 */
require('dotenv').config();
const fs = require('fs');

const FOTO = process.argv[2];
const VERDAD = process.argv[3];          // lo que de verdad pone la placa
const MODELOS = (process.argv[4] || 'gemini-2.5-flash').split(',');

const PROMPT = `Eres un lector de PLACAS DE CARACTERÍSTICAS de bombas de calor (aerotermia).

DEVUELVE:
- modelo: el código de modelo TAL CUAL está impreso.
- numero_serie: el número de serie / "MFG.NO." / "SERIAL No." / "S/N", sin espacios.
- serie_texto: la LÍNEA COMPLETA Y LITERAL donde aparece ese número, con su rótulo y sus separadores, tal como está impresa (p. ej. "MFG.NO. : 1650773"). Cópiala entera.

REGLAS:
- NO inventes ni completes caracteres que no se lean con claridad: es preferible null a un valor adivinado.
- Transcribe dígito a dígito lo que veas, sin corregir ni completar.`;

const SCHEMA = {
    type: 'OBJECT',
    properties: {
        modelo: { type: 'STRING', nullable: true },
        numero_serie: { type: 'STRING', nullable: true },
        serie_texto: { type: 'STRING', nullable: true },
    },
};

// $/1M tokens (tarifa oficial de pago, sept. 2026)
const PRECIOS = {
    'gemini-2.5-flash': [0.30, 2.50],
    'gemini-2.5-flash-lite': [0.10, 0.40],
    'gemini-3.1-flash-lite': [0.25, 1.50],
    'gemini-3.5-flash-lite': [0.30, 2.50],
    'gemini-3.5-flash': [1.50, 9.00],
    'gemini-3.6-flash': [0.75, 3.75],
    'gemini-3.7-flash': [0.75, 3.75],
    'gemini-3.8-flash': [0.75, 3.75],
};

async function leer(modelo, buffer, pensar) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`;
    const generationConfig = {
        responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0,
    };
    if (!pensar) generationConfig.thinkingConfig = { thinkingBudget: 0 };

    const t0 = Date.now();
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
        body: JSON.stringify({
            contents: [{ role: 'user', parts: [
                { text: PROMPT },
                { inline_data: { mime_type: 'image/jpeg', data: buffer.toString('base64') } },
            ] }],
            generationConfig,
        }),
    });
    const txt = await res.text();
    if (!res.ok) {
        let m = txt.slice(0, 160);
        try { m = JSON.parse(txt)?.error?.message?.slice(0, 160) || m; } catch { /* noop */ }
        return { error: `${res.status} ${m}` };
    }
    const data = JSON.parse(txt);
    const u = data.usageMetadata || {};
    const out = JSON.parse(data.candidates[0].content.parts[0].text);
    return {
        ...out,
        segs: ((Date.now() - t0) / 1000).toFixed(1),
        in: u.promptTokenCount, outTok: u.candidatesTokenCount, think: u.thoughtsTokenCount || 0,
    };
}

(async () => {
    const buffer = fs.readFileSync(FOTO);
    console.log(`\nFoto: ${FOTO}  (${Math.round(buffer.length / 1024)} KB)`);
    console.log(`La placa dice de verdad: ${VERDAD}\n`);
    console.log('modelo                        pensando  serie leída      ok   tokens(in/out/think)  €/lectura   s');
    console.log('─'.repeat(108));

    for (const modelo of MODELOS) {
        for (const pensar of [false, true]) {
            // eslint-disable-next-line no-await-in-loop
            const r = await leer(modelo, buffer, pensar).catch((e) => ({ error: e.message }));
            if (r.error) { console.log(`${modelo.padEnd(30)}${(pensar ? 'sí' : 'no').padEnd(10)}✗ ${r.error}`); continue; }
            const [pin, pout] = PRECIOS[modelo] || [0, 0];
            const coste = (r.in * pin + (r.outTok + r.think) * pout) / 1e6;
            const ok = String(r.numero_serie || '').replace(/\s/g, '') === VERDAD ? '✓' : '✗';
            console.log(
                `${modelo.padEnd(30)}${(pensar ? 'sí' : 'no').padEnd(10)}`
                + `${String(r.numero_serie || '—').padEnd(17)}${ok.padEnd(5)}`
                + `${`${r.in}/${r.outTok}/${r.think}`.padEnd(22)}`
                + `${coste.toFixed(6).padEnd(12)}${r.segs}`,
            );
            if (r.serie_texto) console.log(`${' '.repeat(40)}línea: «${r.serie_texto}»`);
        }
    }
    console.log('');
})().catch((e) => { console.error(e); process.exit(1); });
