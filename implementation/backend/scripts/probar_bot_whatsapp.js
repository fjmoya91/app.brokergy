#!/usr/bin/env node
/**
 * Prueba EN SECO del bot de WhatsApp: construye el dossier de un teléfono real
 * y pide la respuesta al asistente, SIN tocar WhatsApp y SIN escribir en la
 * bandeja. Es la forma de ajustar el META PROMPT (`services/botPrompt.js`) sin
 * gastar mensajes reales ni arriesgar la sesión.
 *
 *   node scripts/probar_bot_whatsapp.js                    → batería de casos
 *   node scripts/probar_bot_whatsapp.js 615492728 "¿qué documentación falta?"
 *   VER_DOSSIER=1 node scripts/probar_bot_whatsapp.js      → enseña el dossier
 *
 * El dossier es lo primero que hay que mirar cuando una respuesta no convence:
 * casi siempre el problema no es cómo redacta, sino que le falta el dato.
 */

require('dotenv').config();
const botContexto = require('../services/botContexto');
const botCerebro = require('../services/botCerebro');
const { redactarDossier } = require('../services/botPrompt');
// La firma la pone el orquestador, no el modelo: se aplica aquí también para
// que lo que se lee en la prueba sea EXACTAMENTE lo que recibiría el cliente.
const { asegurarFirma } = require('../services/botWhatsapp');

// Casos que cubren las decisiones que importan: contestar bien, no hablar de
// dinero, no adelantar la obra, callar ante una cortesía y escalar a ciegas.
const CASOS = [
    { nota: 'Documentación (la pregunta más repetida)', txt: 'Buenas tardes\n¿Qué documentación es la que tenemos que aportar?\nGracias' },
    { nota: 'Siguiente paso', txt: 'Hola, ¿cuál es el siguiente paso?' },
    { nota: '¿Puedo empezar la obra?', txt: '¿Ya puedo empezar la obra? El instalador quiere venir el lunes' },
    { nota: 'DINERO → debe ESCALAR', txt: '¿Cuánto voy a cobrar del bono al final?' },
    { nota: 'Cortesía → debe CALLAR', txt: '¡Gracias! 👍' },
    { nota: 'Pide una persona → debe ESCALAR', txt: 'Prefiero que me llame alguien por teléfono' },
];

async function probar(tlf, texto, nota) {
    console.log('\n' + '='.repeat(78));
    console.log(`CASO: ${nota}   ·   tlf ${tlf}`);
    console.log('PREGUNTA: ' + texto.replace(/\n/g, ' ⏎ '));
    console.log('-'.repeat(78));

    const ctx = await botContexto.construirContexto(tlf);
    if (process.env.VER_DOSSIER === '1') {
        console.log('\n----- DOSSIER -----\n' + redactarDossier(ctx) + '\n----- FIN -----\n');
    }
    try {
        const d = await botCerebro.pensar(ctx, texto);
        console.log(`>> ACCIÓN: ${d.accion}`);
        if (d.motivo) console.log(`>> MOTIVO (interno): ${d.motivo}`);
        if (d.mensaje) console.log('>> MENSAJE AL CLIENTE (tal cual saldría):\n' + asegurarFirma(d.mensaje));
    } catch (e) {
        console.log('!! ERROR: ' + e.message);
    }
}

(async () => {
    const [tlfArg, txtArg] = process.argv.slice(2);

    if (tlfArg && txtArg) {
        await probar(tlfArg.replace(/\D/g, ''), txtArg, 'manual');
        process.exit(0);
    }

    // Sin argumentos: hace falta un teléfono contra el que probar. Se pide
    // explícitamente en vez de coger uno "cualquiera" de la base, para que
    // quien ejecute esto sepa de qué expediente está viendo la respuesta.
    const tlf = tlfArg ? tlfArg.replace(/\D/g, '') : process.env.BOT_PRUEBA_TLF;
    if (!tlf) {
        console.error('Uso: node scripts/probar_bot_whatsapp.js <telefono> ["mensaje"]');
        console.error('     (o exporta BOT_PRUEBA_TLF para la batería completa)');
        process.exit(1);
    }
    for (const c of CASOS) await probar(tlf, c.txt, c.nota);
    process.exit(0);
})();
