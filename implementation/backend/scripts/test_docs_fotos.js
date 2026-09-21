/**
 * test_docs_fotos — el gestor de fotografías, sin tocar Drive ni Supabase.
 *
 * Cubre lo que se rompe en silencio:
 *   1. La SUBIDA EN TANDA: un solo listado de Drive, índices consecutivos que no
 *      pisan lo que ya hay, y un fallo suelto que no se lleva por delante las
 *      demás fotos.
 *   2. El ALCANCE nuevo: el apartado de HIBRIDACIÓN y la fusión del depósito de
 *      ACS con la unidad interior cuando son la misma máquina.
 *
 * Drive y Supabase se sustituyen por dobles en `require.cache` antes de cargar
 * el servicio: nada de esto habla con producción.
 *
 *   node implementation/backend/scripts/test_docs_fotos.js
 */

const path = require('path');

// ── Dobles ──────────────────────────────────────────────────────────────────
const drive = {
    llamadas: { listar: 0, subir: 0, carpeta: 0, borrar: 0 },
    ficheros: [],            // lo que "ya hay" en la carpeta
    fallarCon: new Set(),    // nombres que fallan al subir
    _reset() { this.llamadas = { listar: 0, subir: 0, carpeta: 0, borrar: 0 }; this.ficheros = []; this.fallarCon = new Set(); },
};
const driveDoble = {
    async getOrCreateSubfolder() { drive.llamadas.carpeta++; return 'SUB'; },
    async getOrCreateSubfolderNormalized() { drive.llamadas.carpeta++; return 'SUBF'; },
    async findSubfolderByName() { return null; },
    async findSubfolderByNameNormalized() { return null; },
    async listFilesByPrefix() { drive.llamadas.listar++; return drive.ficheros.slice(); },
    async listFiles() { return drive.ficheros.slice(); },
    async deleteFile() { drive.llamadas.borrar++; },
    async saveFileToFolder(_sub, nombre) {
        drive.llamadas.subir++;
        if (drive.fallarCon.has(nombre)) throw new Error('Drive dijo que no');
        return { id: `id-${nombre}`, link: `https://drive/${nombre}` };
    },
};
const rpcs = [];
const supabaseDoble = {
    from() {
        return {
            select() { return this; },
            eq() { return this; },
            update() { return this; },
            // La carpeta del expediente ya existe: `ensureDriveFolder` sale por ahí
            // y el test no tiene que simular la creación.
            async maybeSingle() { return { data: { id: 'U1', id_oportunidad: 'OP1', datos_calculo: { drive_folder_id: 'FOLDER' } } }; },
        };
    },
    async rpc(nombre, args) { rpcs.push({ nombre, args }); return { error: null }; },
};

const req = (rel) => require.resolve(path.join(__dirname, '..', rel));
require.cache[req('services/driveService.js')] = { id: 'drive', filename: 'drive', loaded: true, exports: driveDoble };
require.cache[req('services/supabaseClient.js')] = { id: 'sb', filename: 'sb', loaded: true, exports: supabaseDoble };

const svc = require('../services/reformaUploadService');
const { acsEquipoPropio } = require('../services/docsAlcance');

// ── Utilidades del test ─────────────────────────────────────────────────────
let fallos = 0;
function ok(cond, txt, detalle) {
    if (cond) { console.log(`  ✓ ${txt}`); return; }
    fallos++;
    console.log(`  ✗ ${txt}${detalle ? `\n      ${detalle}` : ''}`);
}
const foto = (nombre) => ({ originalname: nombre, mimetype: 'image/jpeg', buffer: Buffer.from('x') });
const SLOT_MULTI = { key: 'FOTO_VENTANAS_ANTES', multiple: true, label: 'Ventanas' };
const SLOT_UNICO = { key: 'VIDEO_VIVIENDA', multiple: false, label: 'Vídeo' };

// ── 1. Subida en tanda ──────────────────────────────────────────────────────
async function tanda() {
    console.log('\n1. Subida en TANDA');

    drive._reset();
    rpcs.length = 0;
    let r = await svc.subirFicherosASlot({
        oportunidadUuid: 'U1', datosCalculo: {}, slotDef: SLOT_MULTI,
        archivos: [foto('a.jpg'), foto('b.jpg'), foto('c.jpg')],
    });
    ok(r.subidas.length === 3, 'suben las tres');
    ok(drive.llamadas.listar === 1, 'UN solo listado de Drive para toda la tanda',
        `listados: ${drive.llamadas.listar}`);
    ok(drive.llamadas.carpeta === 1, 'la subcarpeta se resuelve una vez');
    ok(r.subidas.map(s => s.name).join() === 'FOTO_VENTANAS_ANTES_1.jpg,FOTO_VENTANAS_ANTES_2.jpg,FOTO_VENTANAS_ANTES_3.jpg',
        'índices consecutivos', r.subidas.map(s => s.name).join());
    ok(rpcs.length === 3 && rpcs.every(x => x.nombre === 'reforma_append'), 'una entrada por foto en la BD');

    // La subcarpeta queda CACHEADA: una segunda tanda no vuelve a pedirla.
    drive.llamadas.carpeta = 0;
    await svc.subirFicherosASlot({ oportunidadUuid: 'U1', datosCalculo: {}, slotDef: SLOT_MULTI, archivos: [foto('d.jpg')] });
    ok(drive.llamadas.carpeta === 0, 'la subcarpeta no se vuelve a buscar (cacheada)');

    // Los índices NO pisan lo que ya está en Drive aunque la BD no lo sepa
    // (fotos migradas o copiadas a mano).
    drive._reset();
    drive.ficheros = [{ id: 'x', name: 'FOTO_VENTANAS_ANTES_7.jpg' }];
    r = await svc.subirFicherosASlot({
        oportunidadUuid: 'U1', datosCalculo: {}, slotDef: SLOT_MULTI, archivos: [foto('e.jpg'), foto('f.jpg')],
    });
    ok(r.subidas.map(s => s.name).join() === 'FOTO_VENTANAS_ANTES_8.jpg,FOTO_VENTANAS_ANTES_9.jpg',
        'el índice sigue al mayor que hay en Drive, no al de la BD', r.subidas.map(s => s.name).join());

    // Un fallo suelto no se lleva por delante el resto.
    drive._reset();
    drive.fallarCon = new Set(['FOTO_VENTANAS_ANTES_2.jpg']);
    r = await svc.subirFicherosASlot({
        oportunidadUuid: 'U1', datosCalculo: {}, slotDef: SLOT_MULTI,
        archivos: [foto('a.jpg'), foto('b.jpg'), foto('c.jpg')],
    });
    ok(r.subidas.length === 2 && r.fallidas.length === 1, 'parcial: dos dentro, una fuera',
        `subidas=${r.subidas.length} fallidas=${r.fallidas.length}`);
    ok(r.fallidas[0].originalname === 'b.jpg', 'se dice CUÁL se quedó fuera');

    // Slot de una sola foto: entra la primera y se retira la anterior.
    drive._reset();
    drive.ficheros = [{ id: 'viejo', name: 'VIDEO_VIVIENDA.mp4' }];
    r = await svc.subirFicherosASlot({
        oportunidadUuid: 'U1', datosCalculo: {}, slotDef: SLOT_UNICO, archivos: [foto('1.jpg'), foto('2.jpg')],
    });
    ok(r.subidas.length === 1 && r.subidas[0].name === 'VIDEO_VIVIENDA.jpg', 'slot único: solo la primera');
    ok(drive.llamadas.borrar === 1, 'la versión anterior se retira');
    ok(drive.llamadas.listar === 1, 'y sin pedirle a Drive un segundo listado para borrarla');
}

// ── 2. Alcance ──────────────────────────────────────────────────────────────
function alcance() {
    console.log('\n2. Apartados según el ALCANCE');

    const base = { estado: 'ACEPTADA', inputs: { boilerHeatingType: 'Caldera de Gas', fuelType: 'gas' } };
    const claves = (dc) => svc.buildDocChecklist(dc).map(s => s.key);

    ok(!claves(base).includes('FOTO_HIBRIDACION'), 'sin hibridación NO se pide su foto');
    ok(claves({ ...base, alcance: { hibridacion: true } }).includes('FOTO_HIBRIDACION'),
        'una ficha híbrida pide la foto de las dos máquinas conectadas');
    ok(claves({ ...base, docs_overrides: { FOTO_HIBRIDACION: { enabled: true } } }).includes('FOTO_HIBRIDACION'),
        'y el admin puede activarla a mano');

    // La etiqueta de la unidad interior avisa de que lleva el depósito dentro.
    const conjunto = svc.buildDocChecklist({ ...base, alcance: { acs: true, acs_equipo_propio: false } })
        .find(s => s.key === 'FOTO_UNIDAD_INTERIOR');
    ok(/depósito/i.test(conjunto?.label || ''), 'con el depósito integrado, la unidad interior lo dice',
        conjunto?.label);
    const aparte = svc.buildDocChecklist({ ...base, alcance: { acs: true, acs_equipo_propio: true } })
        .find(s => s.key === 'FOTO_UNIDAD_INTERIOR');
    ok(!/depósito/i.test(aparte?.label || ''), 'con el ACS aparte, la etiqueta no cambia', aparte?.label);

    console.log('\n3. ¿El ACS es OTRA máquina? (docsAlcance)');
    ok(acsEquipoPropio(null) === null, 'sin instalación no se afirma nada');
    ok(acsEquipoPropio({}) === null, 'con los dos nodos en blanco tampoco');
    ok(acsEquipoPropio({ aerotermia_cal: { aerotermia_db_id: 7 }, aerotermia_acs: { aerotermia_db_id: 7 } }) === false,
        'mismo modelo del catálogo → UNA máquina');
    ok(acsEquipoPropio({ aerotermia_cal: { aerotermia_db_id: 7 }, aerotermia_acs: { aerotermia_db_id: 9 } }) === true,
        'modelos distintos → dos aparatos');
    ok(acsEquipoPropio({ misma_aerotermia_acs: true }) === false, 'el flag activo también basta');
}

(async () => {
    console.log('── Gestor de fotografías ────────────────────────────────');
    await tanda();
    alcance();
    console.log(`\n${fallos ? `✗ ${fallos} comprobación(es) fallida(s)` : '✓ todo correcto'}\n`);
    process.exit(fallos ? 1 : 0);
})();
