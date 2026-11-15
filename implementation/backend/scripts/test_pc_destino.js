// Pruebas de los VARIOS PCs de la cola (asistente_pc.js): nombre de cada PC, destino del encargo,
// la pregunta «¿en el otro o lo enciendes?», `confirmar --pc`, `mover` y que dos PCs no cojan el mismo.
// Sin red ni BD: la cola va a una carpeta temporal y el WhatsApp se sustituye por un buzón de mentira.
//   node scripts/test_pc_destino.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcdest-'));
process.env.ASISTENTE_COLA_DIR = path.join(tmp, 'cola');
process.env.PC_TRABAJOS_DIR = path.join(tmp, 'pc');
process.env.PRESENTAR_TASA = '16,39';
fs.mkdirSync(process.env.ASISTENTE_COLA_DIR);
fs.mkdirSync(process.env.PC_TRABAJOS_DIR);

const enviados = [];
require.cache[require.resolve('./asistente_whatsapp')] = {
    id: 'mock', filename: 'mock', loaded: true,
    exports: { mandarOGuardar: async (t) => { enviados.push(t); return { enviado: true }; }, vaciarBuzon: async () => 0 },
};

const COLA = f => path.join(process.env.ASISTENTE_COLA_DIR, f);
const leer = f => { try { return JSON.parse(fs.readFileSync(COLA(f), 'utf8')); } catch { return null; } };
const poner = (f, d) => fs.writeFileSync(COLA(f), JSON.stringify(d));
const ahora = () => Math.floor(Date.now() / 1000);

// Carga el módulo con el entorno y los argumentos de la orden (los lee al cargarse).
function cargar(env, ...argv) {
    for (const k of ['PC_NOMBRE', 'PC_PRESENTAR', 'PC_CE3X']) delete process.env[k];
    Object.assign(process.env, env);
    delete require.cache[require.resolve('./asistente_pc')];
    process.argv = [process.argv[0], 'asistente_pc.js', ...argv];
    return require('./asistente_pc');
}
function limpiar() {
    for (const f of fs.readdirSync(process.env.ASISTENTE_COLA_DIR)) fs.rmSync(COLA(f), { recursive: true, force: true });
    enviados.length = 0;
}
// FIRMA apagado hace 20 min, OFICINA encendido y libre.
function firmaApagadoOficinaEncendido() {
    poner('pc_latido_FIRMA.json', { at: ahora() - 20 * 60, pc: 'FIRMA', host: 'pc-firma', bloqueado: false, trabajando: null });
    poner('pc_latido_OFICINA.json', { at: ahora() - 30, pc: 'OFICINA', host: 'pc-oficina', bloqueado: false, trabajando: null });
}
const pendientePresentar = (extra = {}) => poner('presentar_pendiente.json', [{
    numero: '26RES060_207', fase: 'inicial', titular: 'TITULAR A', importe: '16,39', tarjeta: 'la Mastercard',
    pregunta: '¿Presento el CEE inicial de *26RES060_207* (TITULAR A)?…', at: ahora(), ...extra,
}]);
// Lo que imprime una función (para la vuelta en seco).
async function salida(fn) {
    const orig = console.log;
    const lineas = [];
    console.log = (...a) => lineas.push(a.join(' '));
    try { await fn(); } finally { console.log = orig; }
    return lineas.join('\n');
}

let ok = 0;
async function caso(nombre, fn) {
    limpiar();
    await fn();
    ok += 1;
    console.log(`  ✓ ${nombre}`);
}

(async () => {
    await caso('sin PC_PRESENTAR: como antes (sin destino, «tu PC», cualquiera lo coge)', async () => {
        poner('pc_latido.json', { at: ahora() - 30, host: 'brokergy-pc', bloqueado: false, trabajando: null });   // el fichero viejo
        const pc = cargar({});
        const e = pc.estadoPc();
        assert.strictEqual(e.vivo, true);
        assert.match(e.texto, /^tu PC está encendido/);
        assert.deepStrictEqual(Object.keys(pc.latidos()), ['BROKERGY_PC']);
        const r = pc.encolarPresentacion({ numero: '26RES060_207', fase: 'inicial', pregunta: 'p', respuesta: 'sí' });
        assert.strictEqual(r.tarea.destino, null);
        const pcOtro = cargar({ PC_NOMBRE: 'OFICINA' }, 'vuelta', '--seco');
        assert.match(await salida(() => pcOtro._vuelta()), /\[EN SECO\] Lanzaría pres-26RES060_207/);
    });

    await caso('el PC de presentar no responde y otro sí: LA pregunta de dónde', async () => {
        firmaApagadoOficinaEncendido();
        const e = cargar({ PC_PRESENTAR: 'firma' }).estadoPc();
        assert.strictEqual(e.vivo, false);
        assert.strictEqual(e.pc, 'FIRMA');
        assert.deepStrictEqual(e.alternativas, ['OFICINA']);
        assert.match(e.texto, /tu PC \*FIRMA\* no responde desde las/);
        assert.match(e.pregunta, /¿Lo hago en \*OFICINA\*, que está encendido, o esperas a encender \*FIRMA\*\?/);
        const nota = cargar({ PC_PRESENTAR: 'FIRMA' })._notaPc(e, 'Contesta *sí* y lo hago.');
        assert.match(nota, /Contesta \*sí\* \(espero a \*FIRMA\*\) o \*sí, en OFICINA\*/);
    });

    await caso('los dos apagados: aviso, sin pregunta de dónde', async () => {
        poner('pc_latido_FIRMA.json', { at: ahora() - 20 * 60, pc: 'FIRMA' });
        poner('pc_latido_OFICINA.json', { at: ahora() - 30, pc: 'OFICINA', bloqueado: true });
        const pc = cargar({ PC_PRESENTAR: 'FIRMA' });
        const e = pc.estadoPc();
        assert.strictEqual(e.pregunta, null);
        assert.match(pc._notaPc(e, 'Contesta *sí* y lo hago.'), /Contesta \*sí\* y lo hago\.\n_Ojo: tu PC \*FIRMA\* no responde/);
    });

    await caso('--pc solo si su respuesta lo dice (o «el otro» siendo el único encendido)', async () => {
        firmaApagadoOficinaEncendido();
        const pc = cargar({ PC_PRESENTAR: 'FIRMA' });
        assert.strictEqual(pc._comprobarCambioDePc(null, 'FIRMA', 'sí'), 'FIRMA');
        assert.strictEqual(pc._comprobarCambioDePc('oficina', 'FIRMA', 'Sí, en Oficina'), 'OFICINA');
        assert.strictEqual(pc._comprobarCambioDePc('OFICINA', 'FIRMA', 'sí, hazlo en el otro'), 'OFICINA');
        assert.strictEqual(pc._comprobarCambioDePc('OFICINA', 'FIRMA', 'sí, aquí'), 'OFICINA');
        assert.throws(() => pc._comprobarCambioDePc('OFICINA', 'FIRMA', 'sí'), /no dice que lo haga OFICINA/);
        assert.throws(() => pc._comprobarCambioDePc('CASA', 'FIRMA', 'sí, en casa'), /No conozco ningún PC llamado/);
    });

    await caso('confirmar: «sí» espera a FIRMA; «sí, en OFICINA» con --pc va a OFICINA', async () => {
        firmaApagadoOficinaEncendido();
        pendientePresentar();
        await cargar({ PC_PRESENTAR: 'FIRMA' }, 'confirmar', '26RES060_207', '--texto', 'sí', '--enviar')._confirmar();
        let t = leer('tareas_pc.json')[0];
        assert.strictEqual(t.destino, 'FIRMA');
        assert.match(enviados.pop(), /se lo paso a \*FIRMA\*.*Si prefieres que lo haga \*OFICINA\*.*«hazlo en OFICINA»/s);
        limpiar();
        firmaApagadoOficinaEncendido();
        pendientePresentar();
        await cargar({ PC_PRESENTAR: 'FIRMA' }, 'confirmar', '26RES060_207', '--texto', 'sí, en oficina', '--pc', 'OFICINA', '--enviar')._confirmar();
        t = leer('tareas_pc.json')[0];
        assert.strictEqual(t.destino, 'OFICINA');
        assert.strictEqual(t.respuesta, 'sí, en oficina');
        // Un «sí» a secas con --pc OFICINA: no encola nada.
        limpiar();
        firmaApagadoOficinaEncendido();
        pendientePresentar();
        await assert.rejects(cargar({ PC_PRESENTAR: 'FIRMA' }, 'confirmar', '26RES060_207', '--texto', 'sí', '--pc', 'OFICINA', '--enviar')._confirmar(), /no dice que lo haga OFICINA/);
        assert.strictEqual(leer('tareas_pc.json'), null);
    });

    await caso('la vuelta solo coge lo SUYO (o lo que no tiene destino)', async () => {
        poner('tareas_pc.json', [
            { id: 'pres-A-inicial-1', tipo: 'presentar', numero: 'A', fase: 'inicial', destino: 'FIRMA', estado: 'pendiente', creado_at: ahora(), pregunta_at: ahora(), confirmado_at: ahora() },
            { id: 'ce3x-calificar-B-1', tipo: 'ce3x', trabajo: 'calificar', numero: 'B', fase: 'inicial', destino: null, estado: 'pendiente', creado_at: ahora() },
        ]);
        const oficina = await salida(() => cargar({ PC_NOMBRE: 'oficina' }, 'vuelta', '--seco')._vuelta());
        assert.match(oficina, /Lanzaría ce3x-calificar-B-1/);
        assert.doesNotMatch(oficina, /pres-A/);
        const firma = await salida(() => cargar({ PC_NOMBRE: 'FIRMA' }, 'vuelta', '--seco')._vuelta());
        assert.match(firma, /Lanzaría pres-A-inicial-1/);
    });

    await caso('tomar un encargo es atómico, y lo ya tomado no se vuelve a coger', async () => {
        const pc = cargar({ PC_NOMBRE: 'FIRMA' });
        assert.strictEqual(pc._tomar('pres-A-inicial-1'), true);
        assert.strictEqual(pc._tomar('pres-A-inicial-1'), false);
        assert.throws(() => pc._tomar('../fuera'), /Id de encargo raro/);
        // Su «en curso» se perdió (dos PCs escribiendo la cola): sigue «pendiente» pero ya está tomado.
        poner('tareas_pc.json', [
            { id: 'pres-A-inicial-1', tipo: 'presentar', numero: 'A', fase: 'inicial', destino: null, estado: 'pendiente', creado_at: ahora(), pregunta_at: ahora(), confirmado_at: ahora() },
        ]);
        fs.mkdirSync(COLA('tomas/pres-A-inicial-1'), { recursive: true });
        const out = await salida(() => cargar({ PC_NOMBRE: 'OFICINA' }, 'vuelta', '--seco')._vuelta());
        assert.doesNotMatch(out, /Lanzaría/);
    });

    await caso('mover: lo pendiente cambia de PC con su respuesta; lo que está en curso, no', async () => {
        firmaApagadoOficinaEncendido();
        poner('tareas_pc.json', [
            { id: 'pres-26RES060_207-inicial-1', tipo: 'presentar', numero: '26RES060_207', fase: 'inicial', destino: 'FIRMA', estado: 'pendiente', creado_at: ahora() },
            { id: 'pres-26RES060_208-inicial-1', tipo: 'presentar', numero: '26RES060_208', fase: 'inicial', destino: 'FIRMA', estado: 'en_curso', pc: 'FIRMA', creado_at: ahora() },
        ]);
        await cargar({ PC_PRESENTAR: 'FIRMA' }, 'mover', '207', '--pc', 'OFICINA', '--texto', 'hazlo en el otro', '--enviar')._mover();
        const [a, b] = leer('tareas_pc.json');
        assert.strictEqual(a.destino, 'OFICINA');
        assert.deepStrictEqual([a.movido[0].de, a.movido[0].a, a.movido[0].texto], ['FIRMA', 'OFICINA', 'hazlo en el otro']);
        assert.strictEqual(b.destino, 'FIRMA');
        assert.match(enviados.pop(), /\*26RES060_207\* lo hace \*OFICINA\*; tu PC \*OFICINA\* está encendido/);
        await cargar({ PC_PRESENTAR: 'FIRMA' }, 'mover', '208', '--pc', 'OFICINA', '--texto', 'en oficina', '--enviar')._mover();
        assert.match(enviados.pop(), /ya lo está haciendo \*FIRMA\*: no lo cambio de PC a medias/);
        assert.strictEqual(leer('tareas_pc.json')[1].destino, 'FIRMA');
    });

    await caso('la ronda de la noche: confirmar --lote --pc manda TODO el lote a ese PC', async () => {
        firmaApagadoOficinaEncendido();
        const items = [{ numero: '26RES060_207', fase: 'inicial', titular: 'A' }, { numero: '2026CEE_59', fase: 'inicial', titular: 'B' }];
        poner('presentar_pendiente.json', [{ lote: 'noche-2026-11-15', items, importe: '16,39', total: '32,78', tarjeta: 'la Mastercard', pregunta: 'p', at: ahora() }]);
        await cargar({ PC_PRESENTAR: 'FIRMA' }, 'confirmar', '--lote', '--texto', 'sí, en OFICINA', '--pc', 'OFICINA', '--enviar')._confirmar();
        const cola = leer('tareas_pc.json');
        assert.strictEqual(cola.length, 2);
        assert.ok(cola.every(t => t.destino === 'OFICINA' && t.lote === 'noche-2026-11-15'));
        assert.match(enviados.pop(), /le paso 2 CEE a \*OFICINA\*/);
    });

    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(`\n${ok} casos OK`);
})().catch((e) => { console.error(e); process.exit(1); });
