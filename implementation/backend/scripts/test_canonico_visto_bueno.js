// Prueba del paso a nombre DEFINITIVO al dar el visto bueno
// (services/cee/canonicoAlVistoBueno.js) SIN tocar nada real: Drive, Supabase y
// la carga del XML van simulados en memoria.
//
//   node implementation/backend/scripts/test_canonico_visto_bueno.js

const path = require('path');
const assert = require('assert');

const S = path.join(__dirname, '../services');
const stub = (rel, exports) => {
    const f = require.resolve(path.join(S, rel));
    require.cache[f] = { id: f, filename: f, loaded: true, exports };
};

// ─── Drive de mentira: una carpeta de fase con ficheros y su hora ────────────
let carpeta, old, renombrados, publicos, ceeFiles, cargas;
function reiniciar(ficheros) {
    carpeta = ficheros.map(([name, t], i) => ({ id: `f${i}`, name, t, webViewLink: `https://drive/f${i}` }));
    old = []; renombrados = []; publicos = []; ceeFiles = {}; cargas = [];
}
const porId = id => carpeta.find(f => f.id === id);
stub('driveService', {
    listFiles: async () => carpeta.map(({ id, name, webViewLink }) => ({ id, name, webViewLink })),
    getFileMetadata: async id => ({ id, modifiedTime: new Date(porId(id).t).toISOString() }),
    archiveExistingToOld: async (_c, id, nombre) => { old.push(nombre); carpeta = carpeta.filter(f => f.id !== id); return `${nombre}_OLD`; },
    renameFolder: async (id, nombre) => { renombrados.push([porId(id).name, nombre]); porId(id).name = nombre; return true; },
    setFolderPublic: async id => { publicos.push(id); },
    getWebViewLink: async id => `https://drive/${id}`,
    getFileContent: async () => Buffer.from('<xml/>'),
    findSubfolderByName: async () => 'sub',
});
let negocioCtx = 'cae';
let certCtx = { empresa_cif: 'B-19350222' };   // el de la casa (Fran)
stub('ceeFirmaService', { esDeBrokergy: c => String(c?.empresa_cif || c?.cif || '').replace(/[^A-Z0-9]/gi, '') === 'B19350222' });
stub('ceeEnvolventeCex', {
    cargarExpediente: async () => ({
        certificador: certCtx,
        expediente: negocioCtx === 'cee'
            ? { id: 'cd-1', numero_expediente: '2099CEE_9', alcance: 'UNICO' }
            : { id: 'exp-1', numero_expediente: '99RES080_9' },
        driveFolderId: 'raiz',
    }),
    carpetaFase: async () => ({ id: 'fase' }),
    expedienteStub: (o, id) => ({ id, negocio: o }),
    tablaDe: o => (o === 'cee' ? 'cee_directos' : 'expedientes'),
    setCeeField: async (_e, campo, valor) => { assert.strictEqual(campo, 'cee_files'); ceeFiles = valor; },
});
stub('supabaseClient', {
    from: () => { const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: { ficheros: { inicial: { registro: 'r' } } } }) }; return q; },
});
stub('ceeDirectoUploadService', { sectionLabel: (e) => (String(e?.alcance).toUpperCase() === 'DOBLE' ? 'CEE INICIAL' : 'CEE') });
stub('cee/cargarXmlCee', { cargarXmlEnApp: async (_ctx, fase, _x, o) => { cargas.push([fase, o.fileName, o.forzar]); return { cargado: true }; } });

const { aCanonico, esBorrador } = require('../services/cee/canonicoAlVistoBueno');

const pruebas = [];
const prueba = (nombre, fn) => pruebas.push([nombre, fn]);

prueba('el _REVISAR de la fase pasa a su nombre definitivo, con su XML cargado', async () => {
    negocioCtx = 'cae';
    reiniciar([['99RES080_9 - CEE INICIAL_REVISAR.cex', 10], ['99RES080_9 - CEE INICIAL_REVISAR.xml', 10],
               ['99RES080_9 - CEE INICIAL_REVISAR.pdf', 10]]);
    const r = await aCanonico({ negocio: 'cae', clave: 'exp-1', fase: 'inicial' });
    assert.deepStrictEqual(renombrados.map(x => x[1]).sort(),
        ['99RES080_9 – CEE INICIAL.cex', '99RES080_9 – CEE INICIAL.pdf', '99RES080_9 – CEE INICIAL.xml']);
    assert.strictEqual(r.promovidos.length, 3);
    assert.deepStrictEqual(Object.keys(ceeFiles.inicial).sort(), ['cex', 'registro', 'xml'], 'cex y xml en cee_files, sin perder lo que había');
    assert.deepStrictEqual(cargas, [['inicial', '99RES080_9 – CEE INICIAL.xml', true]]);
    assert.strictEqual(publicos.length, 3);
});

prueba('el PREVISTO de un RES080 no se toca nunca', async () => {
    negocioCtx = 'cae';
    reiniciar([['99RES080_9 - CEE PREVISTO_REVISAR.cex', 99], ['99RES080_9 - CEE INICIAL_REVISAR.cex', 10]]);
    await aCanonico({ negocio: 'cae', clave: 'exp-1', fase: 'inicial' });
    assert.deepStrictEqual(renombrados, [['99RES080_9 - CEE INICIAL_REVISAR.cex', '99RES080_9 – CEE INICIAL.cex']]);
    assert.ok(carpeta.some(f => f.name === '99RES080_9 - CEE PREVISTO_REVISAR.cex'));
    assert.deepStrictEqual(old, []);
});

prueba('manda el más reciente: un canónico más nuevo se queda y el _REVISAR va a OLD', async () => {
    negocioCtx = 'cae';
    reiniciar([['99RES080_9 - CEE INICIAL_REVISAR.cex', 10], ['99RES080_9 – CEE INICIAL.cex', 20]]);
    const r = await aCanonico({ negocio: 'cae', clave: 'exp-1', fase: 'inicial' });
    assert.deepStrictEqual(renombrados, []);
    assert.deepStrictEqual(old, ['99RES080_9 - CEE INICIAL_REVISAR.cex']);
    assert.deepStrictEqual(r.promovidos, []);
    assert.deepStrictEqual(ceeFiles, {}, 'sin promover nada no se toca cee_files');
});

prueba('un canónico más VIEJO va a OLD y el _REVISAR ocupa su nombre; la copia «(1)» también a OLD', async () => {
    negocioCtx = 'cae';
    reiniciar([['99RES080_9 – CEE INICIAL.pdf', 5], ['99RES080_9 - CEE INICIAL_REVISAR.pdf', 10],
               ['99RES080_9 - CEE INICIAL_REVISAR (1).pdf', 30]]);
    await aCanonico({ negocio: 'cae', clave: 'exp-1', fase: 'inicial' });
    assert.deepStrictEqual(renombrados, [['99RES080_9 - CEE INICIAL_REVISAR (1).pdf', '99RES080_9 – CEE INICIAL.pdf']]);
    assert.deepStrictEqual(old.sort(), ['99RES080_9 - CEE INICIAL_REVISAR.pdf', '99RES080_9 – CEE INICIAL.pdf']);
    assert.deepStrictEqual(cargas, [], 'el PDF no carga XML');
});

prueba('CEE directo de UN certificado: «CEE» a secas', async () => {
    negocioCtx = 'cee';
    reiniciar([['2099CEE_9 - CEE_REVISAR.xml', 10], ['2099CEE_9 - CEE INICIAL_REVISAR.xml', 50]]);
    await aCanonico({ negocio: 'cee', clave: 'cd-1', fase: 'inicial' });
    assert.deepStrictEqual(renombrados, [['2099CEE_9 - CEE_REVISAR.xml', '2099CEE_9 – CEE.xml']]);
});

prueba('con un técnico de FUERA no se toca nada: lo presenta él', async () => {
    negocioCtx = 'cae'; certCtx = { cif: '70590504P' };
    reiniciar([['99RES080_9 - CEE INICIAL_REVISAR.cex', 10]]);
    const r = await aCanonico({ negocio: 'cae', clave: 'exp-1', fase: 'inicial' });
    certCtx = { empresa_cif: 'B-19350222' };
    assert.strictEqual(r.ajeno, true);
    assert.deepStrictEqual(renombrados, []); assert.deepStrictEqual(old, []); assert.deepStrictEqual(ceeFiles, {});
});

prueba('el Agente IA cuenta como la casa', async () => {
    negocioCtx = 'cae'; certCtx = { es_agente_ia: true };
    reiniciar([['99RES080_9 - CEE INICIAL_REVISAR.cex', 10]]);
    await aCanonico({ negocio: 'cae', clave: 'exp-1', fase: 'inicial' });
    certCtx = { empresa_cif: 'B-19350222' };
    assert.strictEqual(renombrados.length, 1);
});

prueba('en seco no escribe nada y dice lo que haría', async () => {
    negocioCtx = 'cae';
    reiniciar([['99RES080_9 - CEE INICIAL_REVISAR.xml', 10]]);
    const r = await aCanonico({ negocio: 'cae', clave: 'exp-1', fase: 'inicial', escribir: false });
    assert.deepStrictEqual(renombrados, []); assert.deepStrictEqual(old, []); assert.deepStrictEqual(cargas, []);
    assert.deepStrictEqual(r.promovidos, ['99RES080_9 - CEE INICIAL_REVISAR.xml → 99RES080_9 – CEE INICIAL.xml']);
});

prueba('el croquis y el borrador de presentación no son borradores del CEE', async () => {
    assert.ok(!esBorrador('99RES080_9 - CEE INICIAL_CROQUIS.pdf', 'CEE INICIAL'));
    assert.ok(!esBorrador('99RES080_9 – BORRADOR PRESENTACIÓN CEE INICIAL.pdf', 'CEE INICIAL'));
    assert.ok(esBorrador('26RES060_OP246 - CEE INICIAL_REVISAR.cex', 'CEE INICIAL'), 'el de la oportunidad, sí');
});

(async () => {
    let ok = 0;
    for (const [nombre, fn] of pruebas) {
        try { await fn(); ok++; console.log(`  ✓ ${nombre}`); }
        catch (e) { console.log(`  ✗ ${nombre}\n    ${e.message}`); process.exitCode = 1; }
    }
    console.log(`\n${ok} de ${pruebas.length} pruebas correctas.`);
})();
