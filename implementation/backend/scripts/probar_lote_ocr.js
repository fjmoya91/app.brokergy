/**
 * Prueba los lectores de los documentos del lote contra un PDF REAL de Drive, sin
 * pasar por la app ni escribir nada.
 *
 *   node scripts/probar_lote_ocr.js factura <driveFileId>
 *   node scripts/probar_lote_ocr.js informe <driveFileId> [loteId]
 *
 * Con `loteId` en el informe, además casa las actuaciones contra los expedientes
 * de ese lote y enseña la propuesta tal cual la vería el panel — que es lo que hay
 * que mirar cuando una lectura no convence: casi siempre el problema no es lo que
 * lee, sino contra qué se compara.
 */
require('dotenv').config();
const driveService = require('../services/driveService');
const supabase = require('../services/supabaseClient');
const { leerFacturaVerificador, leerInformeVerificacion } = require('../services/loteOcrService');
const { casarActuaciones, contrastarTotal, verificarFacturaDelLote } = require('../services/loteVerificados');

(async () => {
    const [, , modo, fileId, loteId] = process.argv;
    if (!modo || !fileId) {
        console.error('Uso: node scripts/probar_lote_ocr.js <factura|informe> <driveFileId> [loteId]');
        process.exit(1);
    }
    const t0 = Date.now();
    const buffer = await driveService.getFileContent(fileId);
    if (!buffer) { console.error('No se pudo descargar el fichero de Drive.'); process.exit(1); }
    console.log(`Descargado: ${(buffer.length / 1024).toFixed(0)} KB`);

    if (modo === 'factura') {
        const f = await leerFacturaVerificador(buffer);
        console.log(JSON.stringify(f, null, 2));
        if (loteId) {
            const { data: lote } = await supabase.from('lotes').select('*').eq('id', loteId).maybeSingle();
            const { data: v } = lote?.verificador_id
                ? await supabase.from('prescriptores').select('id_empresa, razon_social, cif').eq('id_empresa', lote.verificador_id).maybeSingle()
                : { data: null };
            console.log('\nComprobación:', verificarFacturaDelLote(f, lote, v ? { ...v, nombre_empresa: v.razon_social } : null));
        }
    } else {
        const inf = await leerInformeVerificacion(buffer);
        console.log(`\n${inf.expediente_cae} · ${inf.id_verificacion} · ${inf.fecha_informe}`);
        console.log(`${inf.entidad_verificadora} · ${inf.dictamen}`);
        console.log(`Total declarado: ${inf.total_kwh?.toLocaleString('es-ES')} kWh\n`);
        for (const a of inf.actuaciones) {
            console.log(`  ${a.orden}. ${a.expediente} · ${a.ahorro_kwh?.toLocaleString('es-ES')} kWh · ${a.ficha} · ${a.titular}`);
        }
        const suma = inf.actuaciones.reduce((s, a) => s + (a.ahorro_kwh || 0), 0);
        console.log(`\n  suma = ${suma.toLocaleString('es-ES')} kWh (${suma === inf.total_kwh ? 'cuadra' : 'NO cuadra con el total'})`);

        if (loteId) {
            // Sin join: `expedientes` tiene más de una relación con `clientes`.
            const { data: exps, error } = await supabase.from('expedientes')
                .select('id, numero_expediente, cliente_id, instalacion').eq('lote_id', loteId);
            if (error) throw new Error(error.message);
            const cliIds = [...new Set((exps || []).map(e => e.cliente_id).filter(Boolean))];
            const { data: clis } = cliIds.length
                ? await supabase.from('clientes').select('id, nombre_razon_social').in('id', cliIds)
                : { data: [] };
            const cliMap = new Map((clis || []).map(c => [c.id, c.nombre_razon_social]));
            const expedientes = (exps || []).map(e => ({
                id: e.id, numero_expediente: e.numero_expediente, instalacion: e.instalacion,
                cliente_nombre: cliMap.get(e.cliente_id) || null,
            }));
            const r = casarActuaciones(inf.actuaciones, expedientes);
            console.log('\nCasación:');
            for (const f of r.filas) {
                console.log(`  ${f.expediente_leido} → ${f.numero_expediente || '—'} (${f.casado_por || 'sin casar'})`
                    + `${f.avisos.length ? ' ⚠ ' + f.avisos.join(' | ') : ''}`);
            }
            if (r.avisos.length) console.log('  ' + r.avisos.join('\n  '));
            console.log('  total:', contrastarTotal(inf, r.filas));
        }
    }
    console.log(`\n${((Date.now() - t0) / 1000).toFixed(1)}s`);
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
