// Lee justificantes REALES ya subidos y enseña qué diría la comprobación. SOLO LEE.
//   node implementation/backend/scripts/probar_justificante_ocr.js [nº expediente | --n=5]
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const supabase = require('../services/supabaseClient');
const driveService = require('../services/driveService');
const { leerJustificante } = require('../services/justificanteOcrService');
const { evaluarJustificante } = require('../utils/justificanteBancario');

(async () => {
    const arg = process.argv[2] || '';
    const n = Number((arg.match(/--n=(\d+)/) || [])[1]) || 5;
    let q = supabase.from('expedientes').select('numero_expediente, cliente_id, link:documentacion->>justificante_titularidad_link')
        .not('documentacion->>justificante_titularidad_link', 'is', null).order('created_at', { ascending: false });
    q = arg && !arg.startsWith('--') ? q.eq('numero_expediente', arg) : q.limit(n);
    const { data, error } = await q;
    if (error) throw error;
    for (const e of data) {
        const id = (String(e.link).match(/\/d\/([^/?]+)/) || String(e.link).match(/id=([^&]+)/) || [])[1];
        if (!id) { console.log(e.numero_expediente, '· enlace sin id'); continue; }
        try {
            const buf = await driveService.getFileContent(id);
            const { data: c } = await supabase.from('clientes').select('numero_cuenta, nombre_razon_social, apellidos, es_empresa, representante_nombre, representante_apellidos, copropietarios').eq('id_cliente', e.cliente_id).maybeSingle();
            const lectura = await leerJustificante(Buffer.from(buf), 'application/pdf');
            const r = evaluarJustificante(lectura, c || {});
            console.log(`\n${e.numero_expediente} · ${c?.nombre_razon_social} ${c?.apellidos || ''} · ficha ${c?.numero_cuenta || '—'}`);
            console.log(`  leído: ${lectura.iban} · ${lectura.titulares.join(' / ')} · tokens ${lectura.tokens.in}/${lectura.tokens.out}`);
            console.log(`  → ok=${r.ok} iban=${r.iban.estado} titular=${r.titular.estado}${r.rellenar ? ' rellenaría ' + r.rellenar : ''}`);
            r.avisos.forEach(a => console.log('   •', a));
        } catch (err) { console.log(e.numero_expediente, '· error:', err.message); }
    }
})().catch(e => { console.error(e); process.exit(1); });
