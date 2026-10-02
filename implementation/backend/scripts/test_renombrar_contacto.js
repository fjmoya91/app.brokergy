// node implementation/backend/scripts/test_renombrar_contacto.js
// `renombrarUno`: el contacto del chat que se acaba de trabajar, con el nº de su
// obra. La agenda de WhatsApp se simula: no toca la sesión real.
const assert = require('assert');
const path = require('path');

const agenda = new Map();      // '34646359217@c.us' → { nombre, pushname }
const guardados = [];
const rutaContactos = require.resolve(path.join(__dirname, '..', 'services', 'whatsappContactos'));
require.cache[rutaContactos] = {
    id: rutaContactos, filename: rutaContactos, loaded: true,
    exports: {
        datos: async (chatId) => {
            const c = agenda.get(chatId);
            return { enAgenda: !!c, nombre: c?.nombre || null, pushname: c?.pushname || null };
        },
        guardar: async (numero, nombre) => { guardados.push({ numero, nombre }); return true; },
        guardarSiFalta: async () => ({ accion: 'ya_estaba' }),
    },
};
const { renombrarUno } = require('../services/whatsappNombresClientes');

let n = 0;
const eq = (a, b, m) => { assert.deepStrictEqual(a, b, m); n++; };

(async () => {
    agenda.set('34646359217@c.us', { nombre: 'RES080 Maria José Valdepeñas' });
    agenda.set('34600000001@c.us', { nombre: 'RES060 Pepe (ISM)' });
    agenda.set('34600000002@c.us', { nombre: 'ISM Alejandro administración' });
    agenda.set('34600000003@c.us', { nombre: 'RES080_OP52 Maria José Valdepeñas' });
    agenda.set('34600000005@c.us', { nombre: 'RES080_OP12 Antonio' });

    // En seco por defecto: dice qué haría y no guarda nada.
    let r = await renombrarUno({ telefono: '646359217', codigo: '26RES080_OP52' });
    eq([r.accion, r.antes, r.despues, r.telefono], ['seco', 'RES080 Maria José Valdepeñas', 'RES080_OP52 Maria José Valdepeñas', '34646359217']);
    eq(guardados.length, 0, 'en seco no se guarda');

    // De verdad: solo el prefijo; lo de detrás, letra a letra.
    r = await renombrarUno({ telefono: '+34 646 35 92 17', codigo: '26RES080_OP52', dryRun: false });
    eq([r.accion, r.despues], ['renombrado', 'RES080_OP52 Maria José Valdepeñas']);
    eq(guardados, [{ numero: '34646359217', nombre: 'RES080_OP52 Maria José Valdepeñas' }]);

    // Con expediente, su nº (sin el año).
    r = await renombrarUno({ telefono: '34646359217', codigo: '26RES080_87' });
    eq(r.despues, 'RES080_87 Maria José Valdepeñas');

    // Otra ficha en el nombre: no se toca sin forzarla.
    r = await renombrarUno({ telefono: '34600000001', codigo: '26RES080_OP52', dryRun: false });
    eq([r.accion, r.propuesto], ['revisar', 'RES080_OP52 Pepe (ISM)']);
    r = await renombrarUno({ telefono: '34600000001', codigo: '26RES080_OP52', forzarFicha: true });
    eq([r.accion, r.despues], ['seco', 'RES080_OP52 Pepe (ISM)']);

    // Sin prefijo (el chat de un instalador): no se toca salvo `anteponer`.
    r = await renombrarUno({ telefono: '34600000002', codigo: '26RES060_OP250', dryRun: false });
    eq(r.accion, 'sin_prefijo');
    r = await renombrarUno({ telefono: '34600000002', codigo: '26RES060_OP250', anteponer: true });
    eq([r.accion, r.despues], ['seco', 'RES060_OP250 ISM Alejandro administración']);

    // Ya lo lleva; y otra obra de la misma ficha se sustituye.
    r = await renombrarUno({ telefono: '34600000003', codigo: '26RES080_OP52', dryRun: false });
    eq(r.accion, 'ya_al_dia');
    r = await renombrarUno({ telefono: '34600000005', codigo: '26RES080_OP52' });
    eq(r.despues, 'RES080_OP52 Antonio');

    // No está en la agenda: no se le inventa un nombre.
    r = await renombrarUno({ telefono: '34600000004', codigo: '26RES080_OP52', dryRun: false });
    eq(r.accion, 'sin_agenda');

    // Datos que no valen: 400 (datoInvalido), nunca un 500.
    for (const [t, c] of [['123', '26RES080_OP52'], ['646359217', 'LOTE-2026-004']]) {
        await assert.rejects(renombrarUno({ telefono: t, codigo: c }), e => e.datoInvalido === true);
        n++;
    }
    eq(guardados.length, 1, 'solo se guardó el que se pidió de verdad');

    console.log(`✓ test_renombrar_contacto: ${n} comprobaciones`);
    setTimeout(() => process.exit(0), 50);
})().catch((e) => { console.error(e); process.exit(1); });
