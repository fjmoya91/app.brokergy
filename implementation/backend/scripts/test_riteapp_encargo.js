// ─── test_riteapp_encargo.js — «hazme esta memoria», de punta a punta, EN SECO ─
// Regla 245. Sin BD, sin Drive y sin Catastro de verdad: se sustituyen por unos
// dobles en memoria (Supabase, Drive y getByRC). El GENERADOR sí es el de verdad
// (RITE_SERVICE_URL, por defecto http://localhost:8090): levántalo antes con
//   cd implementation/rite-generator && python -m uvicorn server:app --port 8090
// Sin él, las pruebas que generan se saltan y lo dicen.
//
//   node implementation/backend/scripts/test_riteapp_encargo.js
// ─────────────────────────────────────────────────────────────────────────────
const assert = require('assert');
const path = require('path');
const axios = require('axios');

// ── Supabase en memoria (lo justo que usan memorias.js y encargo.js) ─────────
const tablas = { riteapp_cuentas: [], riteapp_memorias: [], riteapp_movimientos: [], prescriptores: [], aerotermia: [] };
let correlativo = 0;
const uuid = () => require('crypto').randomUUID();
function consulta(tabla) {
    const filtros = []; let op = 'select'; let valor = null; let limite = null;
    const q = {
        select() { return q; }, order() { return q; },
        eq(c, v) { filtros.push(r => String(r[c]) === String(v)); return q; },
        neq(c, v) { filtros.push(r => String(r[c]) !== String(v)); return q; },
        ilike(c, v) { filtros.push(r => String(r[c] || '').toLowerCase() === String(v).toLowerCase().replace(/%/g, '')); return q; },
        is(c, v) { filtros.push(r => (r[c] ?? null) === v); return q; },
        in(c, vs) { filtros.push(r => vs.map(String).includes(String(r[c]))); return q; },
        or(expr) { const t = expr.split(',')[0].split('.ilike.')[1].replace(/%/g, '').toLowerCase(); filtros.push(r => JSON.stringify(r).toLowerCase().includes(t)); return q; },
        limit(n) { limite = n; return q; },
        insert(f) { op = 'insert'; valor = f; return q; },
        update(f) { op = 'update'; valor = f; return q; },
        async maybeSingle() { const { data } = await q; return { data: data[0] || null, error: null }; },
        async single() { const { data } = await q; return { data: data[0] || null, error: data[0] ? null : { message: 'no rows' } }; },
        then(res, rej) {
            try {
                const filas = tablas[tabla];
                if (op === 'insert') {
                    const f = { id: uuid(), created_at: new Date().toISOString(), historial: [], ficheros: {}, generaciones: 0, credito_consumido: false, estado: tabla === 'riteapp_memorias' ? 'BORRADOR' : undefined, ...valor };
                    if (tabla === 'riteapp_memorias') { correlativo++; f.numero = `2026RIT_${correlativo}`; }
                    if (f.estado === undefined) delete f.estado;
                    filas.push(f); return Promise.resolve({ data: [f], error: null }).then(res, rej);
                }
                let out = filas.filter(r => filtros.every(fn => fn(r)));
                if (op === 'update') out.forEach(r => Object.assign(r, valor));
                if (limite) out = out.slice(0, limite);
                return Promise.resolve({ data: out, error: null }).then(res, rej);
            } catch (e) { return Promise.reject(e).then(res, rej); }
        },
    };
    return q;
}
const fakeSupabase = {
    from: consulta,
    async rpc(nombre, { p_memoria_id }) {
        assert.strictEqual(nombre, 'riteapp_consumir_credito_memoria');
        const m = tablas.riteapp_memorias.find(x => x.id === p_memoria_id);
        if (m.credito_consumido) return { data: -2, error: null };
        const c = tablas.riteapp_cuentas.find(x => x.id === m.cuenta_id);
        if (!(c.creditos > 0)) return { data: -1, error: null };
        c.creditos--; m.credito_consumido = true; return { data: c.creditos, error: null };
    },
};

// ── Drive en memoria ─────────────────────────────────────────────────────────
const drive = new Map(); // id → { id, name, parent, mimeType, buffer, modifiedTime }
const FOLDER = 'application/vnd.google-apps.folder';
const nuevo = (o) => { const id = 'f' + (drive.size + 1); drive.set(id, { id, modifiedTime: new Date().toISOString(), ...o }); return id; };
const fakeDrive = {
    async findSubfolderByName(p, n) { return [...drive.values()].find(f => f.parent === p && f.name === n && f.mimeType === FOLDER)?.id || null; },
    async createSubfolder(p, n) { return nuevo({ parent: p, name: n, mimeType: FOLDER }); },
    async getOrCreateSubfolder(p, n) { return (await fakeDrive.findSubfolderByName(p, n)) || fakeDrive.createSubfolder(p, n); },
    sanitizeWindowsSegment: (s) => String(s).replace(/[<>:"/\\|?*]/g, ' ').trim(),
    async findFileByName(p, n) { return [...drive.values()].find(f => f.parent === p && f.name === n)?.id || null; },
    async archiveExistingToOld(p, id, n) { const old = await fakeDrive.getOrCreateSubfolder(p, 'OLD'); Object.assign(drive.get(id), { parent: old, name: n.replace(/(\.[a-z]+)$/i, '_OLD$1') }); },
    async saveFileToFolder(p, n, mime, buffer) { const id = nuevo({ parent: p, name: n, mimeType: mime, buffer }); return { id, link: `drive://${id}` }; },
    async listFiles(p) { return [...drive.values()].filter(f => f.parent === p); },
    async getFileContent(id) { return drive.get(id)?.buffer || null; },
};

// ── Catastro de mentira (una vivienda de Toledo) ─────────────────────────────
const fakeCatastro = {
    async getByRC(rc) {
        if (rc.startsWith('0000')) { const e = new Error('no'); e.code = 'RC_NOT_FOUND'; throw e; }
        return { rc, street: 'CL EJEMPLO 1', address: 'CL EJEMPLO 1 45001 TOLEDO (TOLEDO)', municipality: 'TOLEDO', province: 'TOLEDO',
            postalCode: '45001', totalSurface: 120, summaryByType: { VIVIENDA: 110, ALMACEN: 10 }, floors: { total: 2 }, utm: { x: 1, y: 2 }, yearBuilt: 1985, use: 'Residencial' };
    },
};

const B = path.join(__dirname, '..');
const poner = (rel, exp) => { const p = require.resolve(path.join(B, rel)); require.cache[p] = { id: p, filename: p, loaded: true, exports: exp }; };
poner('services/supabaseClient', fakeSupabase);
poner('services/driveService', fakeDrive);
poner('services/catastroService', fakeCatastro);
// Los CIT del CRM (informeService): lo justo que usan encargo.desdeInforme y memorias.alCit.
const informes = [];
const subidasCit = [];
const notasCit = [];
poner('services/informeService', {
    async cargar(id) { return informes.find(i => i.id === id || i.numero === id) || null; },
    async anotar(id, texto) { notasCit.push({ id, texto }); },
    async subir(row, clase, { nombre, buffer }) { subidasCit.push({ informe: row.numero, clase, nombre, pdf: buffer.slice(0, 4).toString() }); return {}; },
});
process.env.RITEAPP_DRIVE_FOLDER_ID = 'raiz';
drive.set('raiz', { id: 'raiz', name: 'raiz', mimeType: FOLDER });

const E = require('../services/riteapp/encargo');
const M = require('../services/riteapp/memorias');

// Datos: un partner (sin cuenta en la app) y un modelo del catálogo.
tablas.prescriptores.push({ id_empresa: uuid(), razon_social: 'INSTALACIONES EJEMPLO SL', cif: 'B00000000', email: 'instalador@example.com',
    numero_carnet_rite: '130000000', tiene_carnet_rite: true, nombre_responsable: 'ANA', apellidos_responsable: 'PRUEBA PRUEBA', nif_responsable: '00000000T', municipio: 'TOLEDO' });
tablas.aerotermia.push({ id: 901, marca: 'MARCAX', modelo_comercial: 'AIRE 8 MONO', tipo: 'MONOBLOCK', potencia_calefaccion: 8, refrigerante: 'R32' },
    { id: 902, marca: 'MARCAX', modelo_comercial: 'AIRE 12 MONO', tipo: 'MONOBLOCK', potencia_calefaccion: 12, refrigerante: 'R32' });

let ok = 0;
const t = async (nombre, fn) => { await fn(); ok++; console.log(`  ✓ ${nombre}`); };

(async () => {
    let hayGenerador = true;
    try { await axios.get(`${process.env.RITE_SERVICE_URL || 'http://localhost:8090'}/health`, { timeout: 2000 }); } catch { hayGenerador = false; }
    console.log(`«Hazme esta memoria» (app RITE) — generador ${hayGenerador ? 'levantado' : 'NO levantado: no se genera'}`);

    const pedido = {
        instalador: { cif: 'B00000000' },
        ref_catastral: '1234567VK1113A0001AB',
        titular: { nombre: 'Juan', apellidos: 'Pérez López', nif: '00000001R', sexo: 'H' },
        equipo: { texto: 'marcax aire', numero_serie: 'SN-123' },
        fecha_pruebas: '2026-11-20',
    };

    let primera;
    await t('con un equipo AMBIGUO: queda en borrador y devuelve las opciones', async () => {
        const r = await E.hazMemoria(pedido);
        assert.strictEqual(r.generada, false);
        assert.strictEqual(r.opciones_equipo.length, 2);
        assert.ok(r.faltan.includes('Marca Aerotermia Calefacción (Instalación)'));
        assert.strictEqual(r.memoria.estado, 'BORRADOR');
        primera = r.memoria;
    });

    await t('el partner sin cuenta: se le crea una PENDIENTE, sin créditos, con su firmante', async () => {
        assert.strictEqual(tablas.riteapp_cuentas.length, 1);
        const c = tablas.riteapp_cuentas[0];
        assert.strictEqual(c.estado, 'PENDIENTE');
        assert.strictEqual(c.creditos, 0);
        assert.strictEqual(c.numero_empresa_rite, '130000000');
        assert.strictEqual(c.representante_nombre, 'ANA');
    });

    await t('el Catastro rellena la vivienda: superficie de VIVIENDA, plantas y zona', async () => {
        const m = tablas.riteapp_memorias[0];
        assert.strictEqual(m.datos.vivienda.superficie, 110);
        assert.strictEqual(m.datos.vivienda.plantas, 2);
        assert.ok(/^[A-E]\d?/.test(m.datos.vivienda.zona || ''), `zona: ${m.datos.vivienda.zona}`);
        assert.strictEqual(m.datos.estancias.modo, 'rapido');
        assert.ok(m.datos.estancias.plantas.length === 2, 'dos plantas propuestas');
    });

    await t('completar con el modelo elegido y estancias EXTENDIDAS', async () => {
        const r = await E.completar(primera.id, {
            equipo: { aerotermia_id: 901, numero_serie: 'SN-123' },
            estancias: { modo: 'extendido', w_elemento: 110, plantas: [
                { planta: '0', locales: [{ tipo: 'salon', elementos: 18 }, { tipo: 'cocina', elementos: 8 }, { tipo: 'aseo', elementos: 3 }] },
                { planta: '1', locales: [{ tipo: 'dormitorio', elementos: 10 }, { tipo: 'dormitorio', elementos: 8 }, { tipo: 'bano', elementos: 4 }] },
            ] },
        }, { generar: hayGenerador });
        assert.deepStrictEqual(r.faltan, [], r.faltan.join(' | '));
        const salon = r.tabla.filas.find(f => f.nombre.startsWith('SAL'));
        assert.strictEqual(salon.potencia_w, 18 * 110);
        if (hayGenerador) {
            assert.strictEqual(r.generada, true);
            assert.strictEqual(r.memoria.estado, 'GENERADA');
            assert.deepStrictEqual(r.documentos.map(d => d.clase).sort(), ['BORRADOR_CERT', 'GUIA_JE6', 'MEMORIA_DOCX', 'MEMORIA_PDF']);
        }
    });

    await t('lo de BROKERGY NO gasta créditos', async () => {
        assert.strictEqual(tablas.riteapp_memorias[0].credito_consumido, false);
    });

    if (hayGenerador) {
        await t('regenerar: la anterior va a OLD y se lista como versión anterior', async () => {
            const m = await M.obtener(primera.id);
            const c = await M.cuentaPorId(m.cuenta_id);
            await M.generar(m, c, { origen: 'BROKERGY' });
            const d = await M.documentos(await M.obtener(primera.id));
            assert.strictEqual(d.actuales.length, 4);
            assert.strictEqual(d.anteriores.length, 4);
            assert.ok(d.anteriores.every(x => /_OLD\./.test(x.nombre)));
        });

        await t('un fichero solo se sirve si es de ESA memoria', async () => {
            const m = await M.obtener(primera.id);
            const { actuales } = await M.documentos(m);
            const f = await M.fichero(m, actuales.find(x => x.clase === 'MEMORIA_PDF').id);
            assert.ok(f.buffer.slice(0, 4).toString() === '%PDF');
            await assert.rejects(M.fichero(m, 'raiz'), e => e.code === 'DOCUMENTO_NO_ENCONTRADO');
        });

        await t('el instalador: sin créditos no genera (402) y con uno gasta solo la primera vez', async () => {
            const c = tablas.riteapp_cuentas[0];
            const m = await M.crear(c, (await M.obtener(primera.id)).datos);
            await assert.rejects(M.generar(m, c, { origen: 'instalador' }), e => e.code === 'SIN_CREDITOS');
            c.creditos = 1;
            await M.generar(await M.obtener(m.id), c, { origen: 'instalador' });
            assert.strictEqual(c.creditos, 0);
            await M.generar(await M.obtener(m.id), c, { origen: 'instalador' });   // regenerar: gratis
            assert.strictEqual(c.creditos, 0);
        });
    }

    // ── Unificación con el CRM: la memoria de un CIT ────────────────────────
    const partner = tablas.prescriptores[0];
    informes.push(
        { id: uuid(), numero: '2026CIT_7', linea: 'CIT', prescriptor_id: partner.id_empresa, ref_catastral: '1234567VK1113A0001AB',
            cliente: { nombre_razon_social: 'LUISA', apellidos: 'GÓMEZ RUIZ', dni: '00000002W', tlf: '600000000' } },
        { id: uuid(), numero: '2026INF_3', linea: 'INF', prescriptor_id: partner.id_empresa, cliente: {} },
    );
    let delCit;
    await t('desde un CIT: la crea con su instalador, el cliente como titular y el Catastro; una sola por CIT', async () => {
        const r = await E.desdeInforme('2026CIT_7', { por: 'equipo@brokergy' });
        assert.strictEqual(r.existia, false);
        delCit = tablas.riteapp_memorias.find(m => m.id === r.memoria.id);
        assert.strictEqual(delCit.informe_id, informes[0].id);
        assert.strictEqual(delCit.origen, 'BROKERGY');
        assert.strictEqual(delCit.datos.titular.nombre, 'LUISA');
        assert.strictEqual(delCit.datos.titular.nif, '00000002W');
        assert.strictEqual(delCit.datos.vivienda.superficie, 110);
        assert.strictEqual(delCit.cuenta_id, tablas.riteapp_cuentas[0].id, 'la cuenta del partner, la misma');
        const otra = await E.desdeInforme(informes[0].id);
        assert.strictEqual(otra.existia, true);
        assert.strictEqual(otra.memoria.id, delCit.id);
        await assert.rejects(E.desdeInforme('2026INF_3'), e => e.code === 'NO_ES_CIT');
    });

    await t('el enlace del instalador: 32 hex, sirve para ESA memoria; mal o caducado, no', async () => {
        const { url } = await M.crearEnlace(delCit);
        const token = url.split('/completar/')[1];
        assert.ok(/^[0-9a-f]{32}$/.test(token), url);
        assert.strictEqual((await M.porToken(token)).id, delCit.id);
        await assert.rejects(M.porToken('a'.repeat(32)), e => e.code === 'ENLACE_NO_VALIDO' && e.status === 404);
        await assert.rejects(M.porToken('../x'), e => e.code === 'ENLACE_NO_VALIDO');
        const viejo = tablas.riteapp_memorias.find(m => m.id === delCit.id).enlace_caduca_at;
        tablas.riteapp_memorias.find(m => m.id === delCit.id).enlace_caduca_at = '2020-01-01T00:00:00Z';
        await assert.rejects(M.porToken(token), e => e.code === 'ENLACE_CADUCADO' && e.status === 410);
        tablas.riteapp_memorias.find(m => m.id === delCit.id).enlace_caduca_at = viejo;
        const nuevo = (await M.crearEnlace(delCit)).url.split('/completar/')[1];
        await assert.rejects(M.porToken(token), e => e.code === 'ENLACE_NO_VALIDO', 'uno nuevo anula el anterior');
        assert.strictEqual((await M.porToken(nuevo)).id, delCit.id);
    });

    if (hayGenerador) {
        await t('generada (aunque sea desde el enlace): no gasta y sube al CIT como VERSIÓN FINAL (PDF y Word)', async () => {
            const c = tablas.riteapp_cuentas[0];
            c.creditos = 0;
            await M.guardarDatos(await M.obtener(delCit.id), { instalacion: { tipo_emisor: 'radiadores_convencionales', aerotermia_cal: { aerotermia_db_id: 901, marca: 'MARCAX', modelo: 'AIRE 8 MONO', potencia: 8, numero_serie: 'SN-9' } }, fechas: { pruebas: '2026-11-21' } });
            const r = await M.generar(await M.obtener(delCit.id), c, { origen: 'instalador' });
            assert.strictEqual(r.memoria.estado, 'GENERADA');
            assert.strictEqual(c.creditos, 0);
            assert.strictEqual(tablas.riteapp_memorias.find(m => m.id === delCit.id).credito_consumido, false);
            assert.deepStrictEqual(subidasCit.map(x => x.clase), ['FINAL_PDF', 'FINAL_WORD']);
            assert.strictEqual(subidasCit[0].pdf, '%PDF');
            assert.ok(r.cit.ok && r.cit.numero === '2026CIT_7');
            assert.ok(notasCit.some(n => /generada en la app RITE/.test(n.texto)));
        });
    }

    await t('una referencia que no existe: 404 claro', async () => {
        await assert.rejects(E.hazMemoria({ ...pedido, ref_catastral: '0000000AA0000A0001AA' }), e => e.code === 'RC_NOT_FOUND' && e.status === 404);
    });

    await t('instalador desconocido: 404 con qué hacer', async () => {
        await assert.rejects(E.hazMemoria({ ...pedido, instalador: { cif: 'B99999999' } }), e => e.code === 'INSTALADOR_NO_ENCONTRADO');
    });

    console.log(`\n${ok} pruebas OK`);
})().catch(e => { console.error('✗', e.stack || e); process.exit(1); });
