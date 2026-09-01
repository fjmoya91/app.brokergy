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
const { leerFacturaVerificador, leerInformeVerificacion, leerDictamenVerificacion } = require('../services/loteOcrService');
const { casarActuaciones, casarDictamen, contrastarTotal, verificarFacturaDelLote } = require('../services/loteVerificados');

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

    if (modo === 'dictamen') {
        const d = await leerDictamenVerificacion(buffer);
        console.log(`
${d.numero_dictamen} · ${d.expediente_cae} · ${d.fecha_emision} · informe ${d.referencia_informe}`);
        console.log(`${d.organismo} (ENAC ${d.acreditacion_enac}) · ${d.ccaa} · año ${d.anio_finalizacion}`);
        console.log(`${d.decision}`);
        console.log(`Total declarado: ${d.total_kwh?.toLocaleString('es-ES')} kWh
`);
        for (const a of d.actuaciones) {
            console.log(`  ${a.orden}. ${a.ficha} · inversión ${a.inversion_eur?.toLocaleString('es-ES', { minimumFractionDigits: 2 })} € · ${a.ahorro_kwh?.toLocaleString('es-ES')} kWh · ${a.vida_util} años`);
        }
        const suma = d.actuaciones.reduce((s2, a) => s2 + (a.ahorro_kwh || 0), 0);
        const inv = d.actuaciones.reduce((s2, a) => s2 + (a.inversion_eur || 0), 0);
        console.log(`
  suma ahorros = ${suma.toLocaleString('es-ES')} kWh (${suma === d.total_kwh ? 'cuadra' : 'NO cuadra'}) · inversión total = ${inv.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €`);
        if (loteId) {
            const { data: exps } = await supabase.from('expedientes')
                .select('id, numero_expediente, instalacion, doc_facturas:documentacion->facturas').eq('lote_id', loteId);
            const expedientes = (exps || []).map(e => ({
                id: e.id, numero_expediente: e.numero_expediente, instalacion: e.instalacion,
                inversion_actual_eur: Number(e.instalacion?.verificacion?.inversion_verificada_eur)
                    || (Array.isArray(e.doc_facturas) ? e.doc_facturas : []).reduce((a, f) => a + (Number(f?.importe_sin_iva) || 0), 0) || null,
            }));
            const r = casarDictamen(d.actuaciones, expedientes);
            console.log('\nCasación:');
            for (const f of r.filas) {
                console.log(`  ${f.ficha} ${f.ahorro_kwh?.toLocaleString('es-ES')} kWh → ${f.numero_expediente || '—'} (${f.casado_por || 'sin casar'})`
                    + ` · inversión ${f.inversion_eur?.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €`
                    + `${f.avisos.length ? ' ⚠ ' + f.avisos.join(' | ') : ''}`);
            }
            if (r.avisos.length) console.log('  ' + r.avisos.join('\n  '));
        }
    } else if (modo === 'factura') {
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
