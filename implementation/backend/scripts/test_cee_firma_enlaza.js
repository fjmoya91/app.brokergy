// Prueba de que el CEE FIRMADO queda ENLAZADO en su hueco (`cee.cee_files[fase].pdf`)
// al guardarlo con `ceeFirmaService.guardarCertificado` (scripts/firmar_cee.js y la
// página pública de firma), SIN tocar nada real: Drive, Supabase y la lectura de
// firmas van simulados en memoria.
//
// El fallo (06/11/2026, 26RES060_126 y _228): se subía el `_fdo.pdf` a Drive pero
// no se enlazaba, y `validar-cee` (que copia lo ENLAZADO) no lo llevaba a «10.
// EXPEDIENTE CAE».
//
//   node implementation/backend/scripts/test_cee_firma_enlaza.js

const path = require('path');
const assert = require('assert');

const B = path.join(__dirname, '..');
const stub = (rel, exports) => {
    const f = require.resolve(path.join(B, rel));
    require.cache[f] = { id: f, filename: f, loaded: true, exports };
};

// ─── Estado de mentira ───────────────────────────────────────────────────────
let fila, escrituras, updates, subidas, falloRpc;
function reiniciar({ ficheros, validados } = {}) {
    fila = { ficheros, validados };
    escrituras = []; updates = []; subidas = []; falloRpc = null;
}

stub('services/supabaseClient', {
    from: (tabla) => {
        let sel = '';
        const q = {
            select: (s) => { sel = s; return q; },
            eq: () => q,
            update: (v) => { updates.push([tabla, v]); return q; },
            maybeSingle: async () => {
                if (tabla === 'prescriptores') return { data: null };
                if (/cee_files/.test(sel)) return { data: fila };
                return { data: { id: 'exp-1', numero_expediente: '99RES060_9', cee: { certificador_id: null, cee_files: { final: { xml: 'x' } } } } };
            },
        };
        return q;
    },
});
stub('services/driveService', {});
stub('services/ceeUploadService', {
    resolveDriveFolderId: async () => 'raiz',
    uploadCeeFile: async (_d, fase, num, slot) => {
        subidas.push([fase, slot]);
        return { link: `https://drive/${fase}_fdo`, id: 'f1', fileName: `${num} – CEE ${fase.toUpperCase()}_fdo.pdf` };
    },
});
stub('services/ceeEnvolventeCex', {
    expedienteStub: (o, id) => ({ id, negocio: o }),
    setCeeField: async (e, campo, valor) => {
        if (falloRpc && campo === falloRpc) throw new Error('RPC caída');
        assert.strictEqual(e.negocio, 'cae');
        assert.strictEqual(e.id, 'exp-1');
        escrituras.push([campo, JSON.parse(JSON.stringify(valor))]);
    },
});
stub('utils/firmasPdf', {
    leerFirmasPdf: () => ({ esPdf: true, firmada: true, firmantes: [{ nombre: 'FRANCISCO JAVIER MOYA', fecha: '07/11/2026' }], integridad: { ok: true } }),
    firmanteCoincide: () => true,
});
stub('utils/ceeFechas', { fechaFirmaCee: () => '2026-11-07' });

const svc = require('../services/ceeFirmaService');

const pruebas = [];
const prueba = (nombre, fn) => pruebas.push([nombre, fn]);
const campo = (c) => escrituras.filter(([k]) => k === c).map(([, v]) => v);

prueba('el firmado del FINAL queda enlazado en cee_files.final.pdf, sin perder lo que había', async () => {
    reiniciar({ ficheros: { inicial: { pdf: 'ini', xml: 'ix' }, final: { xml: 'fx', cex: 'fc' } } });
    const r = await svc.guardarCertificado('exp-1', 'final', Buffer.from('%PDF'));
    assert.strictEqual(r.enlazado, true);
    assert.deepStrictEqual(subidas, [['final', 'pdf']]);
    const [ceeFiles] = campo('cee_files');
    assert.deepStrictEqual(ceeFiles, {
        inicial: { pdf: 'ini', xml: 'ix' },
        final: { xml: 'fx', cex: 'fc', pdf: 'https://drive/final_fdo' },
    });
});

prueba('el INICIAL también, en su hueco (y un expediente sin cee_files no rompe)', async () => {
    reiniciar({ ficheros: null });
    const r = await svc.guardarCertificado('exp-1', 'INICIAL', Buffer.from('%PDF'));
    assert.strictEqual(r.enlazado, true);
    assert.deepStrictEqual(campo('cee_files'), [{ inicial: { pdf: 'https://drive/inicial_fdo' } }]);
});

prueba('nunca reescribe el cee ENTERO: solo claves por la RPC', async () => {
    reiniciar({ ficheros: {} });
    await svc.guardarCertificado('exp-1', 'final', Buffer.from('%PDF'));
    assert.deepStrictEqual(updates, [], 'ningún .update() sobre expedientes');
    assert.deepStrictEqual(escrituras.map(([k]) => k).sort(), ['cee_files', 'firma_cee_final']);
    const [sello] = campo('firma_cee_final');
    assert.strictEqual(sello.fecha_firma, '07/11/2026');
    assert.strictEqual(sello.coincide, true);
});

prueba('si el hueco estaba VALIDADO, vuelve a ámbar (solo ese hueco)', async () => {
    reiniciar({ ficheros: {}, validados: { final_pdf: { at: 'x' }, final_xml: { at: 'y' }, inicial_pdf: { at: 'z' } } });
    await svc.guardarCertificado('exp-1', 'final', Buffer.from('%PDF'));
    assert.deepStrictEqual(campo('docs_validados'), [{ final_xml: { at: 'y' }, inicial_pdf: { at: 'z' } }]);
});

prueba('sin validación previa, docs_validados no se toca', async () => {
    reiniciar({ ficheros: {}, validados: { final_xml: { at: 'y' } } });
    await svc.guardarCertificado('exp-1', 'final', Buffer.from('%PDF'));
    assert.deepStrictEqual(campo('docs_validados'), []);
});

prueba('si el enlace falla, NO calla: enlazado=false y un aviso que lo dice', async () => {
    reiniciar({ ficheros: {} });
    falloRpc = 'cee_files';
    const r = await svc.guardarCertificado('exp-1', 'final', Buffer.from('%PDF'));
    assert.strictEqual(r.enlazado, false);
    assert.ok(r.comprobacion.avisos.some(a => /NO se ha enlazado/.test(a)), r.comprobacion.avisos.join(' | '));
    assert.ok(campo('firma_cee_final')[0].avisos.some(a => /NO se ha enlazado/.test(a)), 'el sello guarda el aviso');
});

(async () => {
    let mal = 0;
    for (const [nombre, fn] of pruebas) {
        try { await fn(); console.log(`  ✓ ${nombre}`); }
        catch (e) { mal++; console.log(`  ✗ ${nombre}\n      ${e.message}`); }
    }
    console.log(mal ? `\n${mal} de ${pruebas.length} FALLAN` : `\n${pruebas.length} de ${pruebas.length} OK`);
    process.exit(mal ? 1 : 0);
})();
