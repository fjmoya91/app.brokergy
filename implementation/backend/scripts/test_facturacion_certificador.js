// Prueba del ciclo completo de facturación con un Supabase SIMULADO: devengo,
// conciliación, sellado y desellado de un CEE directo, sin tocar producción.
const path = require('path');
const BACK = path.join(__dirname, '..');

const DATOS = {
    expedientes: [{
        id: 'exp-1', numero_expediente: '26RES060_157', estado: 'PTE. CEE FINAL', cliente_id: 'cli-1',
        seguimiento: { cee_inicial: 'REGISTRADO' },
        documentacion: { fecha_registro_cee_inicial: '2026-08-07' },
        instalacion: { direccion: 'CL MAYOR 3', municipio: 'VILLAR DE LA ENCINA', provincia: 'CUENCA' },
        cee: { certificador_id: 'CERT' },
    }],
    cee_directos: [
        {   // DOBLE y registrado: devenga honorario + las dos tasas.
            id: 'cee-1', numero_expediente: '2026CEE_54', estado: 'REGISTRADO', cliente_id: 'cli-1',
            alcance: 'DOBLE', direccion: 'CL CALVARIO 20', municipio: 'COFRENTES', provincia: 'VALENCIA',
            seguimiento: { cee_inicial: 'REGISTRADO' },
            documentacion: { fecha_registro_cee_inicial: '2026-08-20' },
            cee: { certificador_id: 'CERT' },
        },
        {   // ÚNICO: no existe CEE final, así que NO puede devengar su tasa.
            id: 'cee-2', numero_expediente: '2026CEE_60', estado: 'REGISTRADO', cliente_id: 'cli-1',
            alcance: 'UNICO', direccion: 'CL SOL 1', municipio: 'TOMELLOSO', provincia: 'CIUDAD REAL',
            seguimiento: { cee_inicial: 'REGISTRADO' },
            documentacion: { fecha_registro_cee_inicial: '2026-08-21' },
            cee: { certificador_id: 'CERT' },
        },
    ],
    clientes: [{ id_cliente: 'cli-1', nombre_razon_social: 'JUAN', apellidos: 'PÉREZ', municipio: null, provincia: null, direccion: null }],
    app_settings: [],
    prescriptores: [{ id_empresa: 'CERT', razon_social: 'RAQUEL MONCAYO TERRIZA', cif: '71355161F', tipo_empresa: 'CERTIFICADOR' }],
};

const rpcs = [];
const updates = [];

const consulta = (tabla) => {
    let filas = JSON.parse(JSON.stringify(DATOS[tabla] || []));
    const api = {
        select: () => api,
        eq(campo, valor) {
            if (campo === 'cee->>certificador_id') filas = filas.filter(f => f.cee?.certificador_id === valor);
            else filas = filas.filter(f => String(f[campo]) === String(valor));
            return api;
        },
        neq(campo, valor) { filas = filas.filter(f => String(f[campo]) !== String(valor)); return api; },
        in(campo, vals) { filas = filas.filter(f => vals.includes(f[campo])); return api; },
        maybeSingle: () => Promise.resolve({ data: filas[0] || null, error: null }),
        single: () => Promise.resolve({ data: filas[0] || null, error: null }),
        update(patch) { updates.push({ tabla, patch }); return { eq: () => Promise.resolve({ error: null }) }; },
        then: (res) => res({ data: filas, error: null }),
    };
    return api;
};

const fake = {
    from: consulta,
    rpc: (nombre, args) => { rpcs.push({ nombre, args }); return Promise.resolve({ error: null }); },
};

const p = require.resolve(path.join(BACK, 'services/supabaseClient.js'));
require.cache[p] = { id: p, filename: p, loaded: true, exports: fake };

const svc = require(path.join(BACK, 'services/certificadorFacturacion.js'));

(async () => {
    let fallos = 0;
    const comprueba = (ok, txt) => { console.log(ok ? '  OK  ' : '  FALLA', txt); if (!ok) fallos++; };

    const items = [
        { tipo: 'trabajo', descripcion: '(26RES060_157)_VILLAR DE LA ENCINA (CUENCA)', unidades: 1, importe: 60 },
        { tipo: 'trabajo', descripcion: '(2026CEE_54)_COFRENTES (VALENCIA)', unidades: 1, importe: 60 },
        { tipo: 'trabajo', descripcion: '(2026CEE_60)_TOMELLOSO (C.REAL)', unidades: 1, importe: 60 },
        { tipo: 'suplido', descripcion: '(2026CEE_54)_COFRENTES (VALENCIA)', unidades: 2, importe: 20.38 },
        { tipo: 'suplido', descripcion: '(2026CEE_60)_TOMELLOSO (C.REAL)', unidades: 1, importe: 16.39 },
    ];

    const out = await svc.conciliarFactura('CERT', { numero: 'AP02082026MOD', fecha: '2026-08-31', items, nifs: ['71355161F'] });

    console.log('\n=== CONCILIACIÓN ===');
    for (const l of out.lineas) {
        console.log(' ', l.confianza.padEnd(9), (l.match?.numero_expediente || '—').padEnd(13),
            'origen=' + String(l.match?.origen), '|', l.conceptos.map(c => c.concepto).join(',') || '—', '|', l.aviso || '');
    }

    comprueba(out.emisor.estado === 'OK', 'el emisor se verifica por NIF');
    comprueba(out.lineas[1].match?.numero_expediente === '2026CEE_54', 'el CEE directo 2026CEE_54 se empareja por su número');
    comprueba(out.lineas[1].match?.origen === 'CEE', 'y viaja marcado como origen CEE (para abrir ?cee=)');
    comprueba(out.lineas[0].match?.origen === 'CAE', 'un expediente del CAE sigue marcado como CAE');
    comprueba(out.lineas[3].conceptos.length === 2, 'un CEE DOBLE devenga las dos tasas');
    comprueba(out.lineas[4].conceptos.length === 1, 'un CEE ÚNICO devenga UNA sola tasa (no hay CEE final que registrar)');
    comprueba(!out.lineas[4].aviso, 'y no avisa de nada: cobra 1 tasa y hay 1 devengada');

    // Sellado: cada fila tiene que ir a SU tabla con SU RPC.
    rpcs.length = 0;
    await svc.sellar('CERT', {
        factura: 'AP02082026MOD', fecha: '2026-08-31', usuario: 'test',
        conceptos: [
            { expediente_id: 'exp-1', concepto: 'honorario' },
            { expediente_id: 'cee-1', concepto: 'honorario' },
            { expediente_id: 'cee-1', concepto: 'tasa_inicial' },
        ],
    });
    console.log('\n=== SELLADO ===');
    rpcs.forEach(r => console.log(' ', r.nombre, JSON.stringify(Object.keys(r.args))));
    comprueba(rpcs.some(r => r.nombre === 'merge_expediente_doc_json' && r.args.p_expediente_id === 'exp-1'),
        'el expediente CAE se sella con merge_expediente_doc_json');
    comprueba(rpcs.some(r => r.nombre === 'merge_cee_directo_doc_json' && r.args.p_id === 'cee-1'),
        'el CEE directo se sella con merge_cee_directo_doc_json');
    comprueba(rpcs.every(r => r.args.p_field === 'fact_cert'), 'los dos sellan el campo fact_cert');

    // Desellar: el id es de otra tabla y hay que encontrarlo igual.
    DATOS.cee_directos[0].documentacion.fact_cert = { honorario: { factura: 'X' } };
    updates.length = 0;
    await svc.desellar('CERT', { expediente_id: 'cee-1', concepto: 'honorario' });
    console.log('\n=== DESELLADO ===');
    console.log(' ', JSON.stringify(updates));
    comprueba(updates[0]?.tabla === 'cee_directos', 'quitar el sello de un CEE directo escribe en cee_directos');

    console.log(fallos ? `\n${fallos} COMPROBACIONES FALLIDAS` : '\nTODAS LAS COMPROBACIONES PASAN');
    process.exit(fallos ? 1 : 0);
})().catch(e => { console.error('ERR', e); process.exit(1); });
