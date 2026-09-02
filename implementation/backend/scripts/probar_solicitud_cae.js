/**
 * Genera la SOLICITUD DE EMISIÓN DE CAE de un lote sin subir nada a Drive, para
 * poder mirarla antes de dar el botón por bueno.
 *
 *   node scripts/probar_solicitud_cae.js LOTE-2025-003 [destino.pdf]
 *
 * Usa exactamente el mismo camino que la ruta: `datosDesdeLote` + `faltantes` +
 * `generarSolicitud`. Si algo falta, lo dice en vez de generar un impreso con
 * huecos.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const fs = require('fs');
const supabase = require('../services/supabaseClient');
const svc = require('../services/solicitudCaeService');
const { detectPrograma } = require('../utils/fichas');

const CODIGO = process.argv[2];
const DESTINO = process.argv[3] || path.join(__dirname, `${(CODIGO || 'lote')} - Solicitud emision CAE.pdf`);

(async () => {
    if (!CODIGO) {
        console.error('Uso: node scripts/probar_solicitud_cae.js <CÓDIGO DE LOTE> [destino.pdf]');
        process.exit(1);
    }

    const { data: lote } = await supabase.from('lotes').select('*').eq('codigo', CODIGO).maybeSingle();
    if (!lote) { console.error(`No existe el lote ${CODIGO}`); process.exit(1); }

    const { data: so } = await supabase.from('prescriptores')
        .select('razon_social, cif, codigo_identificacion, nombre_responsable, apellidos_responsable, nif_responsable, municipio')
        .eq('id_empresa', lote.sujeto_obligado_id).maybeSingle();

    const { data: exps } = await supabase.from('expedientes')
        .select('id, numero_expediente, instalacion').eq('lote_id', lote.id);

    const actuaciones = (exps || []).map(e => ({
        numero_expediente: e.numero_expediente,
        ficha: detectPrograma(e),
        n_actuacion: Number(e.instalacion?.verificacion?.orden_actuacion) || null,
        ahorro_kwh: e.instalacion?.verificacion?.ahorro_verificado_kwh,
    }));

    const d = svc.datosDesdeLote(lote, actuaciones, so);
    const faltan = svc.faltantes(d);

    console.log(`${d.codigo_lote} · ${d.razon_social} (${d.nif}) · ${d.ccaa} · ${d.anio}`);
    console.log(`  representante: ${d.representante} (${d.representante_dni}) · firma en ${d.localidad}`);
    console.log(`  código solicitante: ${d.codigo_identificacion}`);
    console.log(`  AHORRO TOTAL: ${d.ahorro_total} kWh`);
    for (const a of d.actuaciones) {
        console.log(`   E${a.n_actuacion}  ${a.numero_expediente.padEnd(14)} ${a.ahorro_kwh.padStart(8)} kWh  ${a.titulo_ficha.slice(0, 60)}`);
    }
    const suma = d.actuaciones.reduce((s, a) => s + Number(a.ahorro_kwh), 0);
    console.log(`  suma de las filas: ${suma} ${String(suma) === d.ahorro_total ? '✓ cuadra con el total' : '✗ NO cuadra'}`);

    if (faltan.length) {
        console.error(`\n✗ No se genera. Falta: ${faltan.join(', ')}`);
        process.exit(1);
    }

    fs.writeFileSync(DESTINO, await svc.generarSolicitud(d));
    console.log(`\n✓ ${svc.nombreSolicitud(d)}\n   → ${DESTINO}`);
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
