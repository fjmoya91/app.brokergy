// Prueba del ENCARGO DE PRESENTACIÓN del CEE (services/presentacionCeeService.js)
// SIN tocar nada real: Supabase, Drive, el correo y la subida del justificante
// van simulados en memoria. Ni una petición sale de este proceso.
//
//   node implementation/backend/scripts/test_presentacion_cee.js

const path = require('path');
const assert = require('assert');

const S = path.join(__dirname, '../services');
const stub = (rel, exports) => {
    const f = require.resolve(path.join(S, rel));
    require.cache[f] = { id: f, filename: f, loaded: true, exports };
};

// ─── Datos de mentira ────────────────────────────────────────────────────────
const EXP_ID = '00000000-0000-0000-0000-00000000test';
const CD_ID = '00000000-0000-0000-0000-0000000cdtst';
const db = {
    expedientes: {
        [EXP_ID]: {
            id: EXP_ID, numero_expediente: '99RES060_999', cliente_id: 'cli-1', oportunidad_id: 'op-1',
            seguimiento: { cee_inicial: 'REVISADO' }, documentacion: { historial: [] },
            cee: { fecha_firma_cee_inicial: new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10) },
        },
    },
    cee_directos: {
        [CD_ID]: {
            id: CD_ID, numero_expediente: '2099CEE_9', cliente_id: 'cli-1', alcance: 'UNICO',
            drive_folder_id: 'raiz-cd', seguimiento: {}, documentacion: { historial: [] }, cee: {},
        },
    },
    clientes: { 'cli-1': { id_cliente: 'cli-1', nombre_razon_social: 'PRUEBA', apellidos: 'DE MENTIRA', dni: '00000000T' } },
    app_settings: {},
};

function query(tabla) {
    const q = { _f: {}, _upd: null };
    q.select = () => q;
    q.eq = (k, v) => { q._f[k] = v; return q._upd ? exec() : q; };
    q.update = (v) => { q._upd = v; return q; };
    q.upsert = async (v) => { db[tabla][v.key] = v; return { error: null }; };
    const filas = () => Object.values(db[tabla] || {}).filter(r => Object.entries(q._f).every(([k, v]) => r[k] === v));
    const exec = async () => { for (const r of filas()) Object.assign(r, q._upd); return { error: null }; };
    q.maybeSingle = async () => ({ data: filas()[0] || null, error: null });
    q.single = q.maybeSingle;
    return q;
}
const supabase = {
    from: (t) => query(t === 'clientes' ? 'clientes' : t),
    rpc: async (fn, a) => {
        const tabla = fn === 'set_cee_directo_cee_field' ? 'cee_directos' : 'expedientes';
        const id = a.p_cee_directo_id || a.p_expediente_id;
        db[tabla][id].cee = { ...(db[tabla][id].cee || {}), [a.p_field]: JSON.parse(JSON.stringify(a.p_value)) };
        return { error: null };
    },
};
// clientes se busca por id_cliente: el filtro genérico ya lo resuelve.
db.clientes = { 'cli-1': db.clientes['cli-1'] };

// Drive: dos carpetas de fase con ficheros, incluidos borradores _REVISAR que NO
// pueden viajar nunca.
const carpetas = {
    'raiz-op': { '1. CEE': 'cee-root' },
    'cee-root': { 'CEE INICIAL': 'fase-ini' },
    'raiz-cd': { '1. CEE': 'fase-cd' },
};
const ficheros = {
    'fase-ini': [
        { id: 'f1', name: '99RES060_999 – CEE INICIAL.xml', mimeType: 'text/xml' },
        { id: 'f2', name: '99RES060_999 – CEE INICIAL_REVISAR.xml', mimeType: 'text/xml' },
        { id: 'f3', name: '99RES060_999 - CEE INICIAL_REVISAR.cex', mimeType: 'application/octet-stream' },
        { id: 'f4', name: '99RES060_999 – CEE INICIAL.cex', mimeType: 'application/octet-stream' },
        { id: 'f5', name: '99RES060_999 – CEE INICIAL_fdo.pdf', mimeType: 'application/pdf' },
        { id: 'f6', name: '99RES060_999 – CEE INICIAL_informeMedidasMejora.pdf', mimeType: 'application/pdf' },
        { id: 'f7', name: '99RES060_999 – CEE INICIAL_etq.pdf', mimeType: 'application/pdf' },
        { id: 'f8', name: '99RES060_999 – BORRADOR PRESENTACIÓN CEE INICIAL.pdf', mimeType: 'application/pdf' },
        { id: 'f9', name: '99RES060_999 - CEE INICIAL_CROQUIS.pdf', mimeType: 'application/pdf' },
    ],
    // El CEE directo: sin el PDF firmado → todo o nada.
    'fase-cd': [
        { id: 'c1', name: '2099CEE_9 – CEE.xml', mimeType: 'text/xml' },
        { id: 'c2', name: '2099CEE_9 – CEE.cex', mimeType: 'application/octet-stream' },
        { id: 'c3', name: '2099CEE_9 – CEE_REVISAR_fdo.pdf', mimeType: 'application/pdf' },
    ],
};
stub('supabaseClient.js', supabase);
stub('driveService.js', {
    findSubfolderByName: async (padre, nombre) => carpetas[padre]?.[nombre] || null,
    listFiles: async (id) => (ficheros[id] || []).map(f => ({ ...f, webViewLink: `https://drive/${f.id}` })),
    getFileContent: async (id) => Buffer.from(`contenido ${id}`),
});
const enviados = [];
stub('emailService.js', {
    sendMail: async (m) => { enviados.push(m); return { ok: true }; },
    brandEmailShell: ({ title, contentHtml }) => `<html><h1>${title}</h1>${contentHtml}</html>`,
    emailP: (h) => `<p>${h}</p>`, emailBox: (h) => `<div>${h}</div>`, emailButton: (href, l) => `<a href="${href}">${l}</a>`,
    emailDataTable: (rows) => rows.filter(Boolean).map(([k, v]) => `${k}: ${v}`).join('<br>'),
    PILL: { info: (t) => ({ text: t }), neutral: (t) => ({ text: t }) },
    BRAND: { orange: '#f80', orangeDark: '#c60', orangeTint: '#fed', muted: '#777', text: '#111' }, FONT: '',
});
stub('ceeUploadService.js', {
    ...(() => {
        // matchSlot / esBorradorPresentacion / esCroquis REALES: son el criterio que se prueba.
        const real = jest_require(path.join(S, 'ceeUploadService.js'));
        return { matchSlot: real.matchSlot, esBorradorPresentacion: real.esBorradorPresentacion, esCroquis: real.esCroquis };
    })(),
    sectionLabel: (f) => (f === 'final' ? 'CEE FINAL' : 'CEE INICIAL'),
    resolveDriveFolderId: async () => 'raiz-op',
});
stub('ceeDirectoService.js', {
    cargar: async (id) => db.cee_directos[id] || null,
    anotarHistorial: async (id, e) => { db.cee_directos[id].documentacion.historial.push(e); },
});
stub('ceeDirectoUploadService.js', { sectionLabel: (row) => (String(row.alcance) === 'DOBLE' ? 'CEE INICIAL' : 'CEE') });
stub('ceeDirectoFolders.js', { subcarpetaFase: () => '1. CEE' });
stub('borradorCeeService.js', {
    pdf: async (origen, id, fase) => ({ buffer: Buffer.from('%PDF borrador'), filename: `Borrador presentar CEE ${fase.toUpperCase()} - X.pdf` }),
});
const subidas = [];
stub('cee/subidaCeePublica.js', {
    subirCae: async (a) => { subidas.push(a); return { success: true, registrado: true, fecha_registro: '2026-10-06' }; },
    subirCeeDirecto: async (a) => { subidas.push(a); return { success: true, registrado: true, fecha_registro: '2026-10-06' }; },
});

// Carga el ceeUploadService real con sus dependencias simuladas, solo para sus
// funciones puras de nombres.
function jest_require(f) {
    const saved = require.cache[f];
    delete require.cache[f];
    const m = require(f);
    if (saved) require.cache[f] = saved;
    return m;
}

const svc = require(path.join(S, 'presentacionCeeService.js'));

let ok = 0;
const prueba = async (nombre, fn) => {
    try { await fn(); ok++; console.log(`  ✓ ${nombre}`); }
    catch (e) { console.error(`  ✗ ${nombre}\n    ${e.stack}`); process.exitCode = 1; }
};

(async () => {
    console.log('Encargo de presentación del CEE — prueba sin datos reales\n');

    await prueba('elige SOLO .cex, .xml y PDF firmado, nunca un _REVISAR', async () => {
        const r = svc.elegirFicheros(ficheros['fase-ini'], { numero: '99RES060_999', rotulo: 'CEE INICIAL' });
        assert.deepStrictEqual(r.faltan, []);
        assert.deepStrictEqual(r.ficheros.map(f => f.file.id), ['f5', 'f1', 'f4']);
        assert.ok(r.ficheros.every(f => !/revisar/i.test(f.file.name)));
    });

    await prueba('un PDF firmado con REVISAR en el nombre no cuenta: falta', async () => {
        const r = svc.elegirFicheros(ficheros['fase-cd'], { numero: '2099CEE_9', rotulo: 'CEE' });
        assert.deepStrictEqual(r.faltan, ['Certificado firmado (PDF)']);
    });

    await prueba('estado: lista los tres con el NIF delante', async () => {
        const e = await svc.estado('expediente', EXP_ID, 'inicial');
        assert.deepStrictEqual(e.ficheros.map(f => f.nombre), [
            '00000000T_99RES060_999 – CEE INICIAL_fdo.pdf',
            '00000000T_99RES060_999 – CEE INICIAL.xml',
            '00000000T_99RES060_999 – CEE INICIAL.cex',
        ]);
        assert.ok(e.plazo && e.plazo.quedan >= 24 && e.plazo.quedan <= 26, `plazo ${JSON.stringify(e.plazo)}`);
        assert.strictEqual(e.encargo, null);
    });

    await prueba('correo inválido → 400 y no sale nada', async () => {
        await assert.rejects(svc.encargar('expediente', EXP_ID, 'inicial', { email: 'eva@' }), e => e.status === 400);
        assert.strictEqual(enviados.length, 0);
    });

    await prueba('falta un fichero → 409 y no sale nada (todo o nada)', async () => {
        await assert.rejects(svc.encargar('cee_directo', CD_ID, 'inicial', { email: 'eva@ejemplo.com', nombre: 'Eva' }),
            e => e.status === 409 && /Certificado firmado/.test(e.message));
        assert.strictEqual(enviados.length, 0);
        assert.strictEqual(db.cee_directos[CD_ID].cee.presentacion, undefined);
    });

    await prueba('si el borrador no se puede preparar, no sale nada', async () => {
        const b = require.cache[require.resolve(path.join(S, 'borradorCeeService.js'))].exports;
        const pdf = b.pdf;
        b.pdf = async () => { throw new Error('puppeteer caído'); };
        await assert.rejects(svc.encargar('expediente', EXP_ID, 'inicial', { email: 'eva@ejemplo.com' }), e => e.status === 502);
        b.pdf = pdf;
        assert.strictEqual(enviados.length, 0);
        assert.strictEqual(db.expedientes[EXP_ID].cee.presentacion, undefined);
    });

    let enlace1;
    await prueba('encargar: UN correo con el borrador + los 3 ficheros y sin importes', async () => {
        const r = await svc.encargar('expediente', EXP_ID, 'inicial', { email: ' Eva@Ejemplo.com ', nombre: 'Eva Prueba', nota: 'Ojo con la tasa' });
        assert.strictEqual(enviados.length, 1);
        const m = enviados[0];
        assert.strictEqual(m.to, 'eva@ejemplo.com');
        assert.deepStrictEqual(m.attachments.map(a => a.filename), [
            'Borrador presentar CEE INICIAL - X.pdf',
            '00000000T_99RES060_999 – CEE INICIAL_fdo.pdf',
            '00000000T_99RES060_999 – CEE INICIAL.xml',
            '00000000T_99RES060_999 – CEE INICIAL.cex',
        ]);
        assert.ok(!/€|bono|inversi|margen/i.test(m.html + m.text), 'el correo no lleva importes');
        assert.ok(m.html.includes(r.enlace.replace(/&/g, '&amp;')) && m.text.includes(r.enlace) && m.text.includes('Ojo con la tasa'));
        assert.ok(/\/presentar\/cae\/.+\?fase=inicial&token=[0-9a-f]{64}$/.test(r.enlace));
        enlace1 = r.enlace;
        const enc = db.expedientes[EXP_ID].cee.presentacion.inicial;
        assert.ok(enc.nonce && enc.enviado_at && enc.veces === 1 && enc.email === 'eva@ejemplo.com');
        assert.ok(db.expedientes[EXP_ID].documentacion.historial.some(h => /PRESENTAR/.test(h.texto)));
        assert.ok(db.app_settings.presentador_cee, 'recuerda a quien presenta');
    });

    const tok = (u) => new URL(u).searchParams.get('token');

    await prueba('la página pública abre con el token y no trae importes', async () => {
        const v = await svc.vistaPublica('cae', EXP_ID, 'inicial', tok(enlace1));
        assert.strictEqual(v.numero, '99RES060_999');
        assert.strictEqual(v.ficheros.length, 3);
        assert.ok(!JSON.stringify(v).match(/nonce|€/));
    });

    await prueba('token falso o de otro negocio → 403', async () => {
        await assert.rejects(svc.vistaPublica('cae', EXP_ID, 'inicial', 'a'.repeat(64)), e => e.status === 403);
        await assert.rejects(svc.vistaPublica('cee', EXP_ID, 'inicial', tok(enlace1)), e => e.status === 403);
        await assert.rejects(svc.vistaPublica('cae', EXP_ID, 'final', tok(enlace1)), e => e.status === 403);
    });

    await prueba('descarga: solo las tres claves, ya renombradas', async () => {
        const f = await svc.ficheroPublico('cae', EXP_ID, 'inicial', tok(enlace1), 'cex');
        assert.strictEqual(f.filename, '00000000T_99RES060_999 – CEE INICIAL.cex');
        assert.strictEqual(f.buffer.toString(), 'contenido f4');
        await assert.rejects(svc.ficheroPublico('cae', EXP_ID, 'inicial', tok(enlace1), 'mejoras'), e => e.status === 400);
    });

    let enlace2;
    await prueba('reenviar: enlace nuevo y el anterior deja de valer', async () => {
        const r = await svc.encargar('expediente', EXP_ID, 'inicial', { email: 'eva@ejemplo.com', nombre: 'Eva Prueba' });
        enlace2 = r.enlace;
        assert.notStrictEqual(enlace1, enlace2);
        assert.ok(/^Actualizado/.test(enviados[1].subject));
        await assert.rejects(svc.vistaPublica('cae', EXP_ID, 'inicial', tok(enlace1)), e => e.status === 403);
        await svc.vistaPublica('cae', EXP_ID, 'inicial', tok(enlace2));
        assert.strictEqual(db.expedientes[EXP_ID].cee.presentacion.inicial.veces, 2);
    });

    await prueba('subir el justificante: por la subida común, contado como de quien presenta', async () => {
        const r = await svc.subirDevuelto('cae', EXP_ID, 'inicial', tok(enlace2),
            { tipo: 'registro', buffer: Buffer.from('%PDF'), mimetype: 'application/pdf', nombreOriginal: 'justificante.pdf' });
        assert.ok(r.registrado);
        assert.strictEqual(subidas.length, 1);
        assert.strictEqual(subidas[0].slot, 'registro');
        assert.match(subidas[0].quien.texto, /Eva Prueba \(presentación\)/);
        assert.ok(db.expedientes[EXP_ID].cee.presentacion.inicial.registrado_at);
        await assert.rejects(svc.subirDevuelto('cae', EXP_ID, 'inicial', tok(enlace2),
            { tipo: 'registro', buffer: Buffer.from('x'), mimetype: 'image/png', nombreOriginal: 'foto.png' }), e => e.status === 400);
        await assert.rejects(svc.subirDevuelto('cae', EXP_ID, 'inicial', tok(enlace2),
            { tipo: 'cex', buffer: Buffer.from('x'), mimetype: 'application/pdf', nombreOriginal: 'x.pdf' }), e => e.status === 400);
    });

    await prueba('ya registrado → no se vuelve a encargar', async () => {
        db.expedientes[EXP_ID].seguimiento.cee_inicial = 'REGISTRADO';
        await assert.rejects(svc.encargar('expediente', EXP_ID, 'inicial', { email: 'eva@ejemplo.com' }), e => e.status === 409);
        db.expedientes[EXP_ID].seguimiento.cee_inicial = 'REVISADO';
    });

    await prueba('retirar: el enlace deja de valer', async () => {
        await svc.retirar('expediente', EXP_ID, 'inicial', { usuario: 'test' });
        await assert.rejects(svc.vistaPublica('cae', EXP_ID, 'inicial', tok(enlace2)), e => e.status === 403);
        const e = await svc.estado('expediente', EXP_ID, 'inicial');
        assert.strictEqual(e.encargo.activo, false);
        assert.strictEqual(e.enlace, null);
        assert.ok(!('nonce' in e.encargo), 'el nonce no sale nunca');
    });

    await prueba('CEE directo ÚNICO no tiene fase final', async () => {
        await assert.rejects(svc.estado('cee_directo', CD_ID, 'final'), e => e.status === 400);
    });

    await prueba('bandeja: enlace personal, sin el correo en la URL, y revocable', async () => {
        const u = await svc.enlaceBandeja('Eva@Ejemplo.com');
        assert.ok(/\/presentar\/pendientes\?token=[0-9a-f]{24}\.[0-9a-f]{64}$/.test(u), u);
        assert.ok(!/ejemplo/i.test(u));
        const tk = new URL(u).searchParams.get('token');
        assert.strictEqual(await svc.correoDeBandeja(tk), 'eva@ejemplo.com');
        assert.strictEqual(await svc.enlaceBandeja('eva@ejemplo.com'), u, 'el mismo enlace cada vez');
        await assert.rejects(svc.correoDeBandeja(tk.replace(/.$/, c => (c === 'a' ? 'b' : 'a'))), e => e.status === 403);
        await assert.rejects(svc.correoDeBandeja('basura'), e => e.status === 403);
    });

    await prueba('bandeja: solo lo de SU correo; pendiente con enlace, retirado fuera, presentado un mes', async () => {
        const ahora = Date.parse('2026-10-06T12:00:00Z');
        const filas = [
            { origen: 'expediente', r: { id: 'a', numero_expediente: 'A', seguimiento: {}, ffi: '2026-10-01',
                presentacion: { inicial: { nonce: 'n1', email: 'eva@ejemplo.com', enviado_at: '2026-10-05' } } } },
            { origen: 'expediente', r: { id: 'b', numero_expediente: 'B', seguimiento: {},
                presentacion: { inicial: { nonce: 'n2', email: 'otra@ejemplo.com' } } } },
            { origen: 'expediente', r: { id: 'c', numero_expediente: 'C', seguimiento: {},
                presentacion: { inicial: { nonce: null, email: 'eva@ejemplo.com', retirado_at: '2026-10-02' } } } },
            { origen: 'expediente', r: { id: 'd', numero_expediente: 'D', seguimiento: { cee_final: 'REGISTRADO' }, frf: '2026-09-30',
                presentacion: { final: { nonce: 'n4', email: 'eva@ejemplo.com', registrado_at: '2026-09-30T10:00:00Z' } } } },
            { origen: 'expediente', r: { id: 'e', numero_expediente: 'E', seguimiento: { cee_inicial: 'REGISTRADO' },
                presentacion: { inicial: { nonce: 'n5', email: 'eva@ejemplo.com', registrado_at: '2026-07-01T10:00:00Z' } } } },
            { origen: 'cee_directo', r: { id: 'f', numero_expediente: 'F', alcance: 'UNICO', seguimiento: {},
                presentacion: { inicial: { nonce: 'n6', email: 'EVA@ejemplo.com' } } } },
        ];
        const it = svc.itemsBandeja(filas, 'eva@ejemplo.com', ahora);
        assert.deepStrictEqual(it.map(i => `${i.numero}:${i.hecho ? 'hecho' : 'pend'}`), ['A:pend', 'D:hecho', 'F:pend']);
        const a = it.find(i => i.numero === 'A');
        assert.ok(/\/presentar\/cae\/a\?fase=inicial&token=/.test(a.enlace));
        assert.deepStrictEqual(a.plazo, { limite: '2026-10-31', quedan: 25 });
        assert.strictEqual(it.find(i => i.numero === 'D').enlace, null);
        assert.strictEqual(it.find(i => i.numero === 'F').faseLabel, 'CEE');
        assert.ok(/\/presentar\/cee\/f\?/.test(it.find(i => i.numero === 'F').enlace));
    });

    await prueba('el correo del encargo lleva el enlace a su bandeja', async () => {
        const m = enviados[enviados.length - 1];
        assert.ok(/presentar\/pendientes\?token=/.test(m.text), 'texto');
        assert.ok(/Ver todo lo que tienes pendiente/.test(m.html), 'html');
    });

    console.log(`\n${ok} pruebas correctas${process.exitCode ? ' — HAY FALLOS' : ''}.`);
})();
