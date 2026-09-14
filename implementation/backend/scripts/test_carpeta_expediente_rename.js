/**
 * Al mover la carpeta de un expediente por su estado, también se endereza su
 * NOMBRE al patrón `{nº expediente} - {CLIENTE}`. Antes solo se movía: un
 * expediente migrado (o al que se le cambió el cliente después) podía arrastrar
 * un nombre que no decía de quién era la carpeta — 25RES060_79 seguía llamándose
 * "... C. CHILE N. 1 (DIMAS) PEDRO MUÑOZ" en vez de su cliente real.
 *
 * Prueba pura, con Supabase y Drive simulados (patrón de test_caida_bd_no_miente.js):
 *   node implementation/backend/scripts/test_carpeta_expediente_rename.js
 */
const CLIENTES = {
    'cli-1': { nombre_razon_social: 'JOSÉ MARÍA', apellidos: 'OLMEDO LÓPEZ' },
};

const supabaseStub = {
    from(nombre) {
        const q = {
            select: () => q,
            eq: (campo, valor) => { q._eq = { campo, valor }; return q; },
            maybeSingle: async () => {
                if (nombre === 'clientes') {
                    const c = CLIENTES[q._eq?.valor];
                    return { data: c || null, error: null };
                }
                if (nombre === 'oportunidades') {
                    return { data: { folder: 'folder-1', folder_inputs: null, link: null }, error: null };
                }
                return { data: null, error: null };
            },
        };
        return q;
    },
};

const drive = {
    nombres: { 'folder-1': '25RES060_79 - JOSE MARIA C. CHILE N. 1 (DIMAS) PEDRO MUÑOZ' },
    renombres: [],
    movimientos: [],
    async getFileMetadata(id) { return { name: this.nombres[id] }; },
    async renameFolder(id, nuevo) { this.renombres.push({ id, nuevo }); this.nombres[id] = nuevo; return true; },
    async moveFolder(id, destino) { this.movimientos.push({ id, destino }); return true; },
    sanitizeWindowsSegment(s) { return String(s || '').replace(/[\\/:*?"<>|]/g, ' ').replace(/[ .]+$/g, ''); },
};

const rutaSupabase = require.resolve('../services/supabaseClient');
require.cache[rutaSupabase] = { id: rutaSupabase, filename: rutaSupabase, loaded: true, exports: supabaseStub };
const rutaDrive = require.resolve('../services/driveService');
require.cache[rutaDrive] = { id: rutaDrive, filename: rutaDrive, loaded: true, exports: drive };

const { syncExpedienteFolder } = require('../services/expedienteFolderSync');

let fallos = 0;
const comprobar = (ok, texto, detalle) => {
    console.log(`${ok ? '  ✅' : '  ❌'} ${texto}${ok ? '' : `\n       → ${detalle || ''}`}`);
    if (!ok) fallos++;
};

(async () => {
    console.log('\n1) Carpeta con nombre basura de un migrado → se renombra al mover');
    const exp1 = {
        id: 'exp-1', numero_expediente: '25RES060_79', estado: 'DOC. COMPLETA',
        lote_id: null, oportunidad_id: 'op-1', cee: {}, cliente_id: 'cli-1',
    };
    const r1 = await syncExpedienteFolder(exp1, { motivo: 'test' });
    comprobar(r1.moved === true, 'se mueve la carpeta', JSON.stringify(r1));
    comprobar(r1.renamed === true, 'se marca como renombrada', JSON.stringify(r1));
    comprobar(
        drive.renombres.length === 1 && drive.renombres[0].nuevo === '25RES060_79 - JOSÉ MARÍA OLMEDO LÓPEZ',
        'el nombre nuevo es "{nº} - {CLIENTE}"',
        JSON.stringify(drive.renombres)
    );

    console.log('\n2) Segunda pasada con el nombre ya correcto → NO vuelve a renombrar (idempotente)');
    const r2 = await syncExpedienteFolder(exp1, { motivo: 'test-2' });
    comprobar(r2.renamed === false, 'no renombra de más', JSON.stringify(r2));
    comprobar(drive.renombres.length === 1, 'sigue habiendo un solo renombrado', JSON.stringify(drive.renombres));

    console.log('\n3) Expediente SIN cliente vinculado → no se inventa ningún nombre');
    drive.nombres['folder-2'] = 'ALGO RARO SIN NÚMERO';
    supabaseStub.from = ((orig) => (nombre) => {
        const q = orig(nombre);
        if (nombre === 'oportunidades') {
            const origMaybe = q.maybeSingle;
            q.maybeSingle = async () => ({ data: { folder: 'folder-2', folder_inputs: null, link: null }, error: null });
        }
        return q;
    })(supabaseStub.from);
    const exp2 = {
        id: 'exp-2', numero_expediente: '25RES060_80', estado: 'DOC. COMPLETA',
        lote_id: null, oportunidad_id: 'op-2', cee: {}, cliente_id: null,
    };
    const r3 = await syncExpedienteFolder(exp2, { motivo: 'test-3' });
    comprobar(r3.renamed === false, 'sin cliente_id no renombra', JSON.stringify(r3));
    comprobar(drive.nombres['folder-2'] === 'ALGO RARO SIN NÚMERO', 'el nombre de la carpeta no se toca', drive.nombres['folder-2']);

    console.log(fallos ? `\n❌ ${fallos} fallo(s)\n` : '\n✅ Todo OK\n');
    process.exit(fallos ? 1 : 0);
})();
