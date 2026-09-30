/**
 * test_ventanas_subida — subir una foto DE UNA VENTANA, renombrarla y
 * reasignarla, sin tocar Drive ni Supabase (dobles en `require.cache`, como
 * test_docs_fotos.js).
 *
 *   node implementation/backend/scripts/test_ventanas_subida.js
 */

const path = require('path');

const driveDoble = {
    async getOrCreateSubfolder() { return 'SUB'; },
    async getOrCreateSubfolderNormalized() { return 'SUBF'; },
    async findSubfolderByName() { return null; },
    async findSubfolderByNameNormalized() { return null; },
    async listFilesByPrefix() { return []; },
    async listFiles() { return []; },
    async deleteFile() {},
    async saveFileToFolder(_sub, nombre) { return { id: `id-${nombre}`, link: `https://drive/${nombre}` }; },
};
const rpcs = [];
const supabaseDoble = {
    from() {
        return {
            select() { return this; }, eq() { return this; }, update() { return this; },
            async maybeSingle() { return { data: { id: 'U1', id_oportunidad: 'OP1', datos_calculo: { drive_folder_id: 'FOLDER' } } }; },
        };
    },
    async rpc(nombre, args) { rpcs.push({ nombre, args }); return { error: null }; },
};
const req = (rel) => require.resolve(path.join(__dirname, '..', rel));
require.cache[req('services/driveService.js')] = { id: 'drive', filename: 'drive', loaded: true, exports: driveDoble };
require.cache[req('services/supabaseClient.js')] = { id: 'sb', filename: 'sb', loaded: true, exports: supabaseDoble };

const svc = require('../services/reformaUploadService');

let fallos = 0;
function ok(cond, txt, detalle) {
    if (cond) { console.log(`  ✓ ${txt}`); return; }
    fallos++;
    console.log(`  ✗ ${txt}${detalle ? `\n      ${detalle}` : ''}`);
}
const foto = (n) => ({ originalname: n, mimetype: 'image/jpeg', buffer: Buffer.from('x') });
const ANTES = { key: 'FOTO_VENTANAS_ANTES', multiple: true, label: 'Ventanas' };
const CALDERA = { key: 'FOTO_CALDERA_ANTES', multiple: true, label: 'Caldera' };

(async () => {
    console.log('\n1. Subir con la ventana');
    rpcs.length = 0;
    let r = await svc.subirFicherosASlot({
        oportunidadUuid: 'U1', datosCalculo: {}, slotDef: ANTES,
        archivos: [foto('a.jpg'), foto('b.jpg')], ventana: { ventana: 'v2', nombre: ' Cocina ' },
    });
    const entradas = rpcs.filter(x => x.nombre === 'reforma_append').map(x => x.args.p_entry);
    ok(entradas.length === 2 && entradas.every(e => e.ventana === 'V2' && e.ventana_nombre === 'Cocina'),
        'cada foto queda guardada como de la Ventana 2 · Cocina', JSON.stringify(entradas));
    ok(r.subidas.every(s => s.ventana === 'V2'), 'la respuesta dice de qué ventana es (para pintarla sin recargar)');

    rpcs.length = 0;
    await svc.subirFicherosASlot({
        oportunidadUuid: 'U1', datosCalculo: {}, slotDef: CALDERA,
        archivos: [foto('c.jpg')], ventana: { ventana: 'V2', nombre: 'Cocina' },
    });
    const e2 = rpcs.find(x => x.nombre === 'reforma_append').args.p_entry;
    ok(!('ventana' in e2), 'en un apartado que no es de ventanas la ventana se ignora');

    rpcs.length = 0;
    await svc.subirFicherosASlot({
        oportunidadUuid: 'U1', datosCalculo: {}, slotDef: ANTES,
        archivos: [foto('d.jpg')], ventana: { ventana: 'lo que sea', nombre: 'x' },
    });
    const e3 = rpcs.find(x => x.nombre === 'reforma_append').args.p_entry;
    ok(!e3.ventana, 'un id que no es una ventana: la foto entra igual, sin ventana');

    console.log('\n1b. «Subir todas a la vez» del antes: cada foto, una ventana');
    rpcs.length = 0;
    r = await svc.subirFicherosASlot({
        oportunidadUuid: 'U1', datosCalculo: {}, slotDef: ANTES,
        archivos: [foto('e.jpg'), foto('f.jpg'), foto('g.jpg')], ventanasPorFichero: ['V3', 'V4', 'basura'],
    });
    const tanda = rpcs.filter(x => x.nombre === 'reforma_append').map(x => x.args.p_entry.ventana || null);
    ok(JSON.stringify(tanda) === JSON.stringify(['V3', 'V4', null]),
        'cada foto con SU ventana, en su orden; un id malo entra sin ventana', JSON.stringify(tanda));
    ok(r.subidas.map(s => s.ventana).join() === 'V3,V4,', 'y la respuesta lo dice foto a foto');

    console.log('\n2. Renombrar una ventana (en los DOS apartados)');
    rpcs.length = 0;
    const dc = { reforma_uploads: {
        FOTO_VENTANAS_ANTES: [{ name: 'A1', ventana: 'V2', ventana_nombre: null }, { name: 'A2', ventana: 'V1' }],
        FOTO_VENTANAS_DESPUES: [{ name: 'D1', ventana: 'V2', ventana_nombre: null }],
    } };
    r = await svc.actualizarVentanas('U1', dc, { accion: 'renombrar', ventana: 'V2', nombre: 'Cocina' });
    ok(r.ok && r.fotos === 2, 'renombra las 2 fotos de la V2', JSON.stringify(r));
    const porSlot = Object.fromEntries(rpcs.map(x => [x.args.p_slot, x.args.p_array]));
    ok(porSlot.FOTO_VENTANAS_ANTES?.find(i => i.name === 'A1').ventana_nombre === 'Cocina'
        && porSlot.FOTO_VENTANAS_ANTES.find(i => i.name === 'A2').ventana_nombre === undefined,
    'en el antes solo cambia la V2');
    ok(porSlot.FOTO_VENTANAS_DESPUES?.[0].ventana_nombre === 'Cocina', 'y también en el después');

    console.log('\n3. Asignar una foto a una ventana');
    rpcs.length = 0;
    r = await svc.actualizarVentanas('U1', { reforma_uploads: { FOTO_VENTANAS_DESPUES: [{ name: 'D9', estado: 'validada' }] } },
        { accion: 'asignar', slot: 'FOTO_VENTANAS_DESPUES', name: 'D9', ventana: 'V3', nombre: 'Baño' });
    const arr = rpcs[0]?.args.p_array || [];
    ok(r.ok && arr[0].ventana === 'V3' && arr[0].estado === 'validada', 'se asigna sin perder su estado', JSON.stringify(arr));

    rpcs.length = 0;
    r = await svc.actualizarVentanas('U1', { reforma_uploads: {} },
        { accion: 'asignar', slot: 'FOTO_VENTANAS_ANTES', name: 'SOLO_EN_DRIVE.jpg', driveId: 'X', ventana: 'V1' });
    ok(r.ok && rpcs[0]?.args.p_array[0].name === 'SOLO_EN_DRIVE.jpg', 'una foto que solo está en Drive se da de alta al asignarla');

    r = await svc.actualizarVentanas('U1', {}, { accion: 'asignar', slot: 'FOTO_CALDERA_ANTES', name: 'x', ventana: 'V1' });
    ok(!r.ok, 'no se asignan ventanas fuera de sus apartados');
    r = await svc.actualizarVentanas('U1', {}, { accion: 'borrar-todo' });
    ok(!r.ok, 'una acción desconocida no hace nada');

    console.log(fallos ? `\n${fallos} FALLO(S)\n` : '\nTodo correcto\n');
    process.exit(fallos ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
