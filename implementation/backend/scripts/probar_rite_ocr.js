/**
 * Prueba el lector del CERTIFICADO RITE contra un PDF REAL, sin pasar por la app y
 * SIN escribir nada en el expediente.
 *
 *   node scripts/probar_rite_ocr.js <driveFileId|ruta.pdf> [numero_expediente]
 *
 * Con el número de expediente además cruza el emplazamiento leído contra el que
 * consta en la app, que es lo que hay que mirar cuando una comprobación no
 * convence: casi siempre el problema no es lo que lee, sino contra qué se compara.
 */
require('dotenv').config();
const fs = require('fs');
const supabase = require('../services/supabaseClient');
const { leerCertificadoRite } = require('../services/riteOcrService');
const { comprobarEmplazamiento, fechaPruebasDe } = require('../services/riteCertificado');

const esES = (f) => (f ? String(f).split('-').reverse().join('/') : '—');

(async () => {
    const [, , origen, numExpediente] = process.argv;
    if (!origen) {
        console.error('Uso: node scripts/probar_rite_ocr.js <driveFileId|ruta.pdf> [numero_expediente]');
        process.exit(1);
    }

    let buffer;
    if (fs.existsSync(origen)) {
        buffer = fs.readFileSync(origen);
    } else {
        const driveService = require('../services/driveService');
        buffer = await driveService.getFileContent(origen);
        if (!buffer) { console.error('No se pudo descargar el fichero de Drive.'); process.exit(1); }
    }
    console.log(`PDF: ${(buffer.length / 1024).toFixed(0)} KB`);

    const t0 = Date.now();
    const lectura = await leerCertificadoRite(buffer);
    console.log(`\nLeído en ${((Date.now() - t0) / 1000).toFixed(1)}s (${lectura.paginas_leidas ?? '?'} pág. enviadas)`);
    console.log(`  Fechas de pruebas : ${lectura.fechas_pruebas.map(esES).join(' · ') || '—'}`);
    console.log(`  → la que se anota : ${esES(fechaPruebasDe(lectura))}`);
    console.log(`  Fecha de firma    : ${esES(lectura.fecha_firma)}`);
    console.log(`  Emplazamiento     : ${lectura.direccion || '—'} · ${lectura.municipio || '—'}`);
    console.log(`  Ref. catastral    : ${lectura.referencia_catastral || '—'}`);

    if (!numExpediente) return;

    const { data: exp } = await supabase
        .from('expedientes')
        .select('id, oportunidad_id, numero_expediente, instalacion, doc_pruebas:documentacion->fecha_pruebas_cert_instalacion')
        .eq('numero_expediente', numExpediente)
        .maybeSingle();
    if (!exp) { console.error(`\nNo existe el expediente ${numExpediente}.`); return; }

    const { data: op } = await supabase.from('oportunidades')
        .select('id, ref_catastral, referencia_cliente, cliente_id, datos_calculo')
        .eq('id', exp.oportunidad_id).maybeSingle();
    const { data: cliente } = op?.cliente_id
        ? await supabase.from('clientes')
            .select('nombre_razon_social, apellidos, dni, tlf, email, direccion, municipio, provincia, codigo_postal')
            .eq('id_cliente', op.cliente_id).maybeSingle()
        : { data: null };

    console.log(`\nContra ${exp.numero_expediente} (en la app consta fecha de pruebas ${esES(exp.doc_pruebas)}):`);
    for (const c of comprobarEmplazamiento(lectura, exp, op, cliente)) {
        const marca = c.estado === 'ok' ? '✓' : c.estado === 'revisar' ? '⚠️' : '·';
        console.log(`  ${marca} ${c.campo}: leído "${c.leido || '—'}" · expediente "${c.esperado || '—'}"`);
        console.log(`      ${c.nota}`);
    }
})().catch(e => { console.error(e); process.exit(1); });
