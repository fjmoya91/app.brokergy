#!/usr/bin/env node
/**
 * Vínculo CHAT ↔ EXPEDIENTE: que el bot sepa de qué obra le hablan.
 *
 *   node scripts/test_bot_vinculos.js
 *
 * Comprueba, sobre datos reales y SIN enviar nada:
 *   · Un teléfono con VARIAS obras vivas sale marcado como ambiguo.
 *   · Fijarlo a mano lo resuelve, y el dossier dice que fue "fijado".
 *   · Con un INSTALADOR, la pista débil ('envio') NO decide — se le pregunta,
 *     que es lo acordado: un aviso mandado el martes no dice por cuál de sus
 *     treinta obras pregunta hoy.
 *   · Con un CLIENTE particular, esa misma pista sí vale.
 *   · Lo que el propio cliente aclara en la conversación decide siempre.
 *
 * ⚠️ Trabaja sobre un teléfono REAL, que puede tener vínculos de verdad — uno
 * fijado a mano para una prueba en curso, por ejemplo. El test necesita el chat
 * vacío para empezar (con un vínculo puesto, el primer caso ni se puede
 * plantear), así que los APARTA al empezar y los REPONE al terminar, salga
 * bien o mal. La primera versión los borraba sin más: el 25/08/2026 se llevó
 * por delante el vínculo con el que se estaba probando el bot en ese momento,
 * y el bot volvió a preguntar por cuál de las 33 obras se le hablaba.
 */

require('dotenv').config();
const supabase = require('../services/supabaseClient');
const botVinculos = require('../services/botVinculos');
const botContexto = require('../services/botContexto');

const ok = (c, t) => console.log(`${c ? '  OK  ' : ' FALLO'} · ${t}`);

/** Un teléfono real con varias obras vivas, para no inventarse el caso. */
async function telefonoAmbiguo() {
    const { data: clientes } = await supabase.from('clientes')
        .select('id_cliente, tlf').not('tlf', 'is', null).limit(400);
    const porTlf = new Map();
    for (const c of clientes || []) {
        const k = botContexto.last9(c.tlf);
        if (!k) continue;
        porTlf.set(k, (porTlf.get(k) || 0) + 1);
    }
    // El que más fichas comparte es el candidato más seguro a ser ambiguo.
    const [mejor] = [...porTlf.entries()].sort((a, b) => b[1] - a[1]);
    return mejor?.[0] || null;
}

(async () => {
    const tlf = await telefonoAmbiguo();
    if (!tlf) { console.log('No hay ningún teléfono repetido en la base: nada que probar.'); return; }
    const chat = botVinculos.aChatId(tlf);
    console.log(`Teléfono de prueba: ${tlf}  (${chat})\n`);

    const { data: previos } = await supabase.from('whatsapp_chat_expediente')
        .select('oportunidad_id, origen, fijado, nota').eq('chat_id', chat);
    const yaEstaban = new Set((previos || []).map(v => v.oportunidad_id));

    const vaciar = () => supabase.from('whatsapp_chat_expediente').delete().eq('chat_id', chat);
    const restaurar = async () => {
        await vaciar();
        for (const v of previos || []) {
            await supabase.rpc('wa_vinculo_touch', {
                p_chat: chat, p_opp: v.oportunidad_id,
                p_origen: v.origen, p_fijado: v.fijado, p_nota: v.nota,
            });
        }
        if (yaEstaban.size) console.log(`(repuesto(s) ${yaEstaban.size} vínculo(s) que ya existían)`);
    };

    if (yaEstaban.size) {
        console.log(`(este chat ya tenía ${yaEstaban.size} vínculo(s) de verdad — se apartan y se reponen al final)\n`);
    }
    await vaciar();

    try {
        // ── 1. Sin pistas: ambiguo ──────────────────────────────────────────
        const ctx0 = await botContexto.construirContexto(tlf);
        if (!ctx0.ambiguo) {
            console.log('Este teléfono no resulta ambiguo (una sola obra viva). Nada que probar.');
            return;
        }
        ok(ctx0.ambiguo, `sin pistas → AMBIGUO (${ctx0.asuntos.length} obras), el bot preguntará`);
        const todas = ctx0.asuntos.map(a => a.oportunidad_id);
        // Se elige una obra que NO tuviera vínculo real, para que restaurar al
        // final devuelva de verdad las cosas a su sitio.
        const objetivo = (ctx0.asuntos.find(a => !yaEstaban.has(a.oportunidad_id)) || ctx0.asuntos[0]).oportunidad_id;

        // ── 2. Pista de ENVÍO con un INSTALADOR: NO debe decidir ────────────
        await botVinculos.sembrar(chat, objetivo, 'envio');
        const comoInstalador = await botVinculos.elegir(chat, todas, { permitirEnvio: false });
        ok(comoInstalador === null, 'instalador + pista de envío → NO decide (se le pregunta)');

        const comoCliente = await botVinculos.elegir(chat, todas, { permitirEnvio: true });
        ok(comoCliente?.oportunidad_id === objetivo, 'cliente + pista de envío → SÍ decide');

        // ── 3. Lo que el cliente ACLARA decide siempre ──────────────────────
        await botVinculos.sembrar(chat, objetivo, 'conversacion');
        const trasAclarar = await botVinculos.elegir(chat, todas, { permitirEnvio: false });
        ok(trasAclarar?.motivo === 'conversacion', 'lo aclarado en la conversación decide, también con instalador');

        // ── 4. FIJADO a mano: gana a todo ───────────────────────────────────
        await vaciar();
        await botVinculos.fijar(chat, objetivo, 'prueba automática');
        const ctx1 = await botContexto.construirContexto(tlf);
        ok(!ctx1.ambiguo, 'fijado a mano → deja de ser ambiguo');
        ok(ctx1.elegidoPor === 'fijado', `el dossier dice cómo se eligió ("${ctx1.elegidoPor}")`);
        ok((ctx1.otrosAsuntos || []).length > 0, `y conserva las otras ${ctx1.otrosAsuntos.length} obras para poder ofrecer el cambio`);
        ok(ctx1.asuntos[0]?.oportunidad_id === objetivo, 'el dossier montado es el de la obra fijada');

        // ── 5. Soltar ───────────────────────────────────────────────────────
        await botVinculos.soltar(chat, objetivo);
        const ctx2 = await botContexto.construirContexto(tlf);
        ok(ctx2.ambiguo, 'al soltarlo vuelve a ser ambiguo');
    } finally {
        await restaurar();
    }
    console.log('\nvínculos de prueba retirados.');
})()
    .then(() => process.exit(0))
    .catch(e => { console.error('ERROR en el test:', e.message); process.exit(1); });
