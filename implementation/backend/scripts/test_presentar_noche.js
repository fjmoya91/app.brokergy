// Pruebas de la ronda de presentar de las 21:00 (asistente_pc.js noche / confirmar --lote / terminar).
// Sin red ni BD: la cola va a una carpeta temporal y el WhatsApp se sustituye por un buzón de mentira.
//   node scripts/test_presentar_noche.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'noche-'));
process.env.ASISTENTE_COLA_DIR = path.join(tmp, 'cola');
process.env.PC_TRABAJOS_DIR = path.join(tmp, 'pc');
process.env.PRESENTAR_TASA = '16,39';
fs.mkdirSync(process.env.ASISTENTE_COLA_DIR);
fs.mkdirSync(process.env.PC_TRABAJOS_DIR);

const enviados = [];
require.cache[require.resolve('./asistente_whatsapp')] = {
    id: 'mock', filename: 'mock', loaded: true,
    exports: { mandarOGuardar: async (t) => { enviados.push(t); return { enviado: true }; } },
};

const COLA = f => path.join(process.env.ASISTENTE_COLA_DIR, f);
const leer = f => { try { return JSON.parse(fs.readFileSync(COLA(f), 'utf8')); } catch { return null; } };
const ahora = () => Math.floor(Date.now() / 1000);
const ITEMS = [
    { numero: '26RES060_207', fase: 'inicial', titular: 'TITULAR A', quedan: 10 },
    { numero: '2026CEE_59', fase: 'inicial', titular: 'TITULAR B', quedan: 29 },
    { numero: '26RES093_15', fase: 'final', titular: 'TITULAR C', quedan: 40 },
];

// Carga el módulo con los argumentos de la orden (los lee al cargarse, como cuando se lanza).
function cargar(...argv) {
    delete require.cache[require.resolve('./asistente_pc')];
    process.argv = [process.argv[0], 'asistente_pc.js', ...argv];
    return require('./asistente_pc');
}
function pendienteLote(at = ahora()) {
    const pc = cargar();
    fs.writeFileSync(COLA('presentar_pendiente.json'), JSON.stringify([{
        lote: 'noche-2026-10-26', items: ITEMS, importe: '16,39', total: '49,17', tarjeta: 'la Mastercard', pregunta: pc._preguntaNoche(ITEMS), at,
    }]));
    fs.writeFileSync(COLA('tareas_pc.json'), '[]');
}

let ok = 0;
async function caso(nombre, fn) {
    await fn();
    ok += 1;
    console.log(`  ✓ ${nombre}`);
}

(async () => {
    await caso('la pregunta lleva la lista y tasa × n = total', async () => {
        const t = cargar()._preguntaNoche(ITEMS);
        for (const c of ITEMS) assert.match(t, new RegExp(c.numero));
        assert.match(t, /3 × 16,39 € = 49,17 €/);
        assert.match(t, /Antes de cada pago te escribo/);
    });

    await caso('«sí, menos el 207» sin --excepto NO encola', async () => {
        pendienteLote();
        await assert.rejects(cargar('confirmar', '--lote', '--texto', 'sí, menos el 207', '--enviar')._confirmarLote(), /--excepto/);
        assert.deepStrictEqual(leer('tareas_pc.json'), []);
    });

    await caso('--excepto que no está en la lista: error', async () => {
        pendienteLote();
        await assert.rejects(cargar('confirmar', '--lote', '--texto', 'sí', '--excepto', '999', '--enviar')._confirmarLote(), /no está en la lista/);
    });

    await caso('una pregunta de hace más de 24 h no autoriza', async () => {
        pendienteLote(ahora() - 25 * 3600);
        await assert.rejects(cargar('confirmar', '--lote', '--texto', 'sí', '--enviar')._confirmarLote(), /más de 24 h/);
        assert.deepStrictEqual(leer('tareas_pc.json'), []);
    });

    await caso('en seco no escribe nada', async () => {
        pendienteLote();
        await cargar('confirmar', '--lote', '--texto', 'sí')._confirmarLote();
        assert.deepStrictEqual(leer('tareas_pc.json'), []);
        assert.strictEqual(leer('presentar_pendiente.json').length, 1);
    });

    await caso('«sí, menos el 207» con --excepto 207: encola los otros dos, en orden, con la pregunta y la respuesta', async () => {
        pendienteLote();
        enviados.length = 0;
        await cargar('confirmar', '--lote', '--texto', 'sí, menos el 207', '--excepto', '207', '--enviar')._confirmarLote();
        const cola = leer('tareas_pc.json');
        assert.deepStrictEqual(cola.map(t => t.numero), ['2026CEE_59', '26RES093_15']);
        for (const t of cola) {
            assert.strictEqual(t.estado, 'pendiente');
            assert.strictEqual(t.lote, 'noche-2026-10-26');
            assert.strictEqual(t.importe, '16,39');
            assert.strictEqual(t.respuesta, 'sí, menos el 207');
            assert.match(t.pregunta, /3 × 16,39 €/);
        }
        assert.strictEqual(cola[1].fase, 'final');
        assert.deepStrictEqual(leer('presentar_pendiente.json'), []);
        assert.match(enviados[0], /le paso 2 CEE/);
        assert.match(enviados[0], /Fuera: 26RES060_207/);
    });

    await caso('el prompt del PC: SOLO este expediente, un pago, nunca el total', async () => {
        const t = leer('tareas_pc.json')[0];
        const p = cargar()._promptPresentar(t);
        assert.match(p, /este encargo es SOLO 2026CEE_59/);
        assert.match(p, /un pago de 16,39 €, nunca el total/);
        assert.match(p, /deja fuera ESTE expediente, PARA sin pagar/);
    });

    await caso('si el primero NO termina, el resto del lote no se empieza y llega el informe', async () => {
        const cola = leer('tareas_pc.json');
        cola[0].estado = 'en_curso';
        fs.writeFileSync(COLA('tareas_pc.json'), JSON.stringify(cola));
        const actual = { id: cola[0].id, tipo: 'presentar', numero: cola[0].numero, lote: cola[0].lote, log: path.join(tmp, 'pc', 'x.jsonl') };
        fs.writeFileSync(path.join(process.env.PC_TRABAJOS_DIR, 'actual.json'), JSON.stringify(actual));
        enviados.length = 0;
        await cargar()._terminar(actual, 'Lo he parado: el 3DS no se autorizó en 10 minutos.');
        const fin = leer('tareas_pc.json');
        assert.deepStrictEqual(fin.map(t => t.estado), ['fallida', 'cancelada']);
        assert.strictEqual(enviados.length, 2);
        assert.match(enviados[0], /NO ha terminado/);
        assert.match(enviados[1], /Presentación de la noche: 0 de 2/);
        assert.match(enviados[1], /✗ \*2026CEE_59\* — no terminó/);
        assert.match(enviados[1], /26RES093_15\* — no empezado \(paré tras el fallo anterior\)/);
        assert.doesNotMatch(enviados[1], /Tasas pagadas/);
    });

    await caso('si terminan todos: informe con lo pagado; mientras quede uno, sin informe', async () => {
        pendienteLote();
        await cargar('confirmar', '--lote', '--texto', 'sí', '--enviar')._confirmarLote();
        const logF = path.join(tmp, 'pc', 'ok.jsonl');
        fs.writeFileSync(logF, `${JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'Registrado con el nº 2026/123456 el 26/10.\nTasa pagada.' })}\n`);
        for (let i = 0; i < 3; i += 1) {
            const cola = leer('tareas_pc.json');
            cola[i].estado = 'en_curso';
            fs.writeFileSync(COLA('tareas_pc.json'), JSON.stringify(cola));
            const actual = { id: cola[i].id, tipo: 'presentar', numero: cola[i].numero, lote: cola[i].lote, log: logF };
            fs.writeFileSync(path.join(process.env.PC_TRABAJOS_DIR, 'actual.json'), JSON.stringify(actual));
            enviados.length = 0;
            await cargar()._terminar(actual);
            if (i < 2) assert.strictEqual(enviados.length, 1, 'sin informe mientras quedan');
        }
        assert.strictEqual(enviados.length, 2);
        assert.match(enviados[1], /Presentación de la noche: 3 de 3/);
        assert.match(enviados[1], /✓ \*26RES060_207\* — Registrado con el nº 2026\/123456/);
        assert.match(enviados[1], /Tasas pagadas: 3 × 16,39 € = 49,17 €/);
    });

    await caso('cancelar --lote quita la pregunta y lo que no ha empezado', async () => {
        pendienteLote();
        fs.writeFileSync(COLA('tareas_pc.json'), JSON.stringify([
            { id: 'a', tipo: 'presentar', numero: '26RES060_207', lote: 'noche-2026-10-25', estado: 'en_curso', creado_at: ahora() },
            { id: 'b', tipo: 'presentar', numero: '2026CEE_59', lote: 'noche-2026-10-25', estado: 'pendiente', creado_at: ahora() },
            { id: 'c', tipo: 'presentar', numero: '26RES060_1', estado: 'pendiente', creado_at: ahora() },
        ]));
        enviados.length = 0;
        await cargar('cancelar', '--lote', '--enviar')._cancelarLote();
        assert.deepStrictEqual(leer('tareas_pc.json').map(t => t.estado), ['en_curso', 'cancelada', 'pendiente']);
        assert.deepStrictEqual(leer('presentar_pendiente.json'), []);
        assert.match(enviados[0], /ya lo está presentando tu PC/);
    });

    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(`\n${ok} casos OK`);
})().catch((e) => { console.error(e); fs.rmSync(tmp, { recursive: true, force: true }); process.exit(1); });
