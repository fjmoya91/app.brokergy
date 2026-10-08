#!/usr/bin/env node
/**
 * Prueba qué RAZONAMIENTO y qué TEMPERATURA se le mandan a cada modelo de Gemini
 * (utils/geminiAjustes.js). Sin argumentos no llama a nada.
 *
 *   node implementation/backend/scripts/test_gemini_ajustes.js
 *   node implementation/backend/scripts/test_gemini_ajustes.js --vivo [modelo,modelo…]
 *
 * Con `--vivo` manda a cada modelo una petición de TEXTO (ningún dato de clientes)
 * por `llamarGemini`, el camino de los lectores, sin razonar y razonando: si un
 * modelo rechaza los parámetros, sale aquí y no en una lectura de verdad. Pasarlo
 * antes de cambiar `GEMINI_MODEL` o cualquier otro modelo.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { ajustesGemini, versionGemini } = require('../utils/geminiAjustes');

let fallos = 0;
const ok = (cond, msg) => {
    console.log(`${cond ? '  ✓' : '  ✗'} ${msg}`);
    if (!cond) fallos++;
};
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log('\n── La versión sale del nombre ──');
ok(igual(versionGemini('gemini-2.5-flash'), [2, 5]), 'gemini-2.5-flash → 2.5');
ok(igual(versionGemini('models/gemini-3.6-flash'), [3, 6]), 'con el prefijo models/ también');
ok(igual(versionGemini('gemini-3-flash-preview'), [3, 0]), 'gemini-3-flash-preview → 3.0');
ok(versionGemini('gemini-flash-latest') === null, 'un alias sin versión no tiene versión (se trata como nuevo)');

console.log('\n── La serie 2.5 sigue con thinkingBudget y temperatura (thinkingLevel le da 400) ──');
ok(igual(ajustesGemini('gemini-2.5-flash', { pensamiento: 0, temperatura: 0 }),
    { temperature: 0, thinkingConfig: { thinkingBudget: 0 } }), 'sin razonar: thinkingBudget 0 + temperature 0, como siempre');
ok(igual(ajustesGemini('gemini-2.5-flash', { pensamiento: 1024, temperatura: 0 }),
    { temperature: 0, thinkingConfig: { thinkingBudget: 1024 } }), 'un presupuesto se respeta tal cual');
ok(igual(ajustesGemini('gemini-2.5-flash', { pensamiento: null, temperatura: 0 }), { temperature: 0 }),
    'pensar = lo del modelo: no se manda thinkingConfig');
ok(igual(ajustesGemini('gemini-2.5-flash', { temperatura: 0.4 }), { temperature: 0.4 }), 'la variación del reintento llega');

console.log('\n── Gemini 3: thinkingLevel; nunca thinkingBudget ──');
ok(igual(ajustesGemini('gemini-3.5-flash', { pensamiento: 0, temperatura: 0 }),
    { temperature: 0, thinkingConfig: { thinkingLevel: 'minimal' } }), '3.5-flash (bot): minimal + temperatura 0, que respeta');
ok(igual(ajustesGemini('gemini-3.5-flash-lite', { pensamiento: 0 }), { thinkingConfig: { thinkingLevel: 'minimal' } }),
    '3.5-flash-lite: minimal (thinkingBudget 0 le daba 400)');
ok(igual(ajustesGemini('gemini-3.6-flash', { pensamiento: 0, temperatura: 0.4 }), { thinkingConfig: { thinkingLevel: 'minimal' } }),
    '3.6-flash: minimal y SIN temperatura (la ignora)');
ok(igual(ajustesGemini('gemini-3.7-flash', { pensamiento: 0, temperatura: 0 }), { thinkingConfig: { thinkingLevel: 'low' } }),
    '3.7-flash: low (minimal le da 400)');
ok(igual(ajustesGemini('gemini-3.8-flash', { pensamiento: 0 }), { thinkingConfig: { thinkingLevel: 'low' } }), '3.8-flash: low');
ok(igual(ajustesGemini('gemini-flash-latest', { pensamiento: 0, temperatura: 0 }), { thinkingConfig: { thinkingLevel: 'low' } }),
    'un alias sin versión: lo más restrictivo (low, sin temperatura)');
ok(igual(ajustesGemini('gemini-3.1-pro', { pensamiento: 0 }), { thinkingConfig: { thinkingLevel: 'low' } }),
    'un Pro: low (minimal es solo de los Flash)');
ok(igual(ajustesGemini('gemini-3.6-flash', { pensamiento: 1024 }), { thinkingConfig: { thinkingLevel: 'low' } }), 'presupuesto ≤ 2048 → low');
ok(igual(ajustesGemini('gemini-3.6-flash', { pensamiento: 8192 }), { thinkingConfig: { thinkingLevel: 'medium' } }), 'presupuesto ≤ 8192 → medium');
ok(igual(ajustesGemini('gemini-3.6-flash', { pensamiento: 24576 }), { thinkingConfig: { thinkingLevel: 'high' } }), 'más → high');
ok(igual(ajustesGemini('gemini-3.6-flash', { pensamiento: -1 }), {}), '-1 (dinámico) = lo del modelo');
ok(igual(ajustesGemini('gemini-3.6-flash', { pensamiento: null }), {}), 'pensar en 3.6: no se manda nada');

async function vivo(modelos) {
    const { llamarGemini } = require('../services/placaOcrService');
    const schema = { type: 'OBJECT', properties: { texto: { type: 'STRING' } }, required: ['texto'] };
    console.log('\n── En vivo: una petición de texto por modelo, por `llamarGemini` ──');
    for (const modelo of modelos) {
        for (const pensar of [false, true]) {
            try {
                const r = await llamarGemini([], {
                    prompt: 'Devuelve en "texto" la palabra hola.', schema, modelo, pensar,
                    etiqueta: `vivo:${modelo}`, deadline: 60000, maxTokens: pensar ? null : 256,
                });
                ok(/hola/i.test(r?.texto || ''), `${modelo} ${pensar ? 'pensando' : 'sin razonar'} → «${r?.texto}»`);
            } catch (e) {
                ok(false, `${modelo} ${pensar ? 'pensando' : 'sin razonar'} → ${e.message}`);
            }
        }
    }
}

(async () => {
    const i = process.argv.indexOf('--vivo');
    if (i >= 0) {
        const lista = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1].split(',')
            : [...new Set([process.env.GEMINI_MODEL || 'gemini-2.5-flash', process.env.BOT_WHATSAPP_MODEL,
                process.env.PLACA_OCR_MODELO_SERIE || 'gemini-3.6-flash', process.env.VIDEO_OCR_MODELO || 'gemini-3.6-flash']
                .filter(Boolean))];
        await vivo(lista);
    }
    console.log(fallos ? `\n✗ ${fallos} fallo(s)` : '\n✓ todo bien');
    process.exit(fallos ? 1 : 0);
})();
