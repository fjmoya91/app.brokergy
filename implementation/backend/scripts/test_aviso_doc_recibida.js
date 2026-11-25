#!/usr/bin/env node
/**
 * test_aviso_doc_recibida — la documentación que llega NO se le avisa a Fran (25/11/2026),
 * pero la cadena interna sigue: el agente retoma y se cierran las esperas.
 * Sin red ni BD: los servicios se sustituyen en la caché de `require`.
 *
 *   node scripts/test_aviso_doc_recibida.js
 */
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:1';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'x';
process.env.SUPABASE_KEY = process.env.SUPABASE_KEY || 'x';
process.env.UPLOAD_NOTIFY_WINDOW_MS = '50';

const path = require('path');
const assert = require('assert');

const llamadas = { wa: 0, email: 0, retomar: 0, esperas: 0 };
const fingir = (rel, exports) => {
    const f = require.resolve(path.join(__dirname, '..', 'services', rel));
    require.cache[f] = { id: f, filename: f, loaded: true, exports };
};
fingir('whatsappService', { sendText: async () => { llamadas.wa++; return { ok: true }; } });
fingir('emailService', { sendMail: async () => { llamadas.email++; }, getFallbackSender: () => null });
fingir('aceptacionAgente', { retomarTrasSubida: async () => { llamadas.retomar++; } });
fingir('esperasWhatsapp', { cerrarPorSubida: async () => { llamadas.esperas++; } });
// Contexto mínimo para cuando el aviso está encendido.
const sb = {
    from: () => sb, select: () => sb, eq: () => sb,
    maybeSingle: async () => ({ data: { id: 'u', id_oportunidad: 'OP1', numero_expediente: 'EXP1' }, error: null }),
};
fingir('supabaseClient', sb);
fingir('certClienteData', { buildCertClienteData: () => ({ data: { nombre: 'X', direccion: 'Y' } }) });

const un = require('../services/uploadNotifier');
const esperar = (ms) => new Promise(r => setTimeout(r, ms));
let fallos = 0;
const ok = async (txt, fn) => {
    try { await fn(); console.log(`✓ ${txt}`); } catch (e) { fallos++; console.log(`✗ ${txt}: ${e.message}`); }
};

(async () => {
    await ok('por defecto (sin AVISO_DOC_RECIBIDA_ENABLED) no sale ni WhatsApp ni email, y la cadena sigue', async () => {
        delete process.env.AVISO_DOC_RECIBIDA_ENABLED;
        Object.keys(llamadas).forEach(k => { llamadas[k] = 0; });
        un.registrarSubida({ oportunidadUuid: 'u1', slotKey: 'FOTO_PLACA', slotLabel: 'Placa', subidoPor: 'cliente', cantidad: 3 });
        un.registrarSubida({ oportunidadUuid: 'u1', slotKey: 'FOTO_CALDERA', slotLabel: 'Caldera', subidoPor: 'cliente' });
        await esperar(200);
        assert.deepStrictEqual(llamadas, { wa: 0, email: 0, retomar: 1, esperas: 1 });
    });
    await ok('con AVISO_DOC_RECIBIDA_ENABLED=true vuelve el resumen de siempre (WhatsApp + email)', async () => {
        process.env.AVISO_DOC_RECIBIDA_ENABLED = 'true';
        Object.keys(llamadas).forEach(k => { llamadas[k] = 0; });
        un.registrarSubida({ oportunidadUuid: 'u2', slotKey: 'FOTO_PLACA', slotLabel: 'Placa', subidoPor: 'instalador' });
        await esperar(200);
        assert.deepStrictEqual(llamadas, { wa: 1, email: 1, retomar: 1, esperas: 1 });
        delete process.env.AVISO_DOC_RECIBIDA_ENABLED;
    });
    await ok('el FIN DE OBRA es un hito: avisa siempre', async () => {
        Object.keys(llamadas).forEach(k => { llamadas[k] = 0; });
        sb.rpc = async () => ({ error: null });
        await un.notificarFinObra({ oportunidadUuid: 'u3', quien: 'cliente' });
        assert.strictEqual(llamadas.wa, 1);
    });
    await ok('las rondas del agente van en silencio y piden SOLO el hito', async () => {
        delete require.cache[require.resolve('../services/aceptacionAgente')];
        const a = require('../services/aceptacionAgente');
        const t = a.instruccion('26RES060_187', { motivo: 'subida', ronda: 2 });
        assert.ok(/NO se lo cuentes a Fran/.test(t), 'lo pedido no se cuenta');
        assert.ok(/CEE inicial hecho/.test(t), 'pide el hito');
        assert.ok(!/dime en el grupo/.test(t), 'no pide el informe de cada ronda');
    });
    console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo bien');
    process.exit(fallos ? 1 : 0);
})();
