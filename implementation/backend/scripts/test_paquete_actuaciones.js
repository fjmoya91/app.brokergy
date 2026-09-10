#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * PRUEBA EN SECO del paquete de actuaciones de un lote.
 *
 * Comprueba, expediente por expediente, si la app sabe localizar CADA pieza del
 * índice "E{n}-…". No escribe NADA: ni Drive, ni base de datos.
 *
 * Se contrasta contra los lotes YA PRESENTADOS (LOTE-2025-002 / 003 / 2026-004):
 * si ahí falta algo, es que la app no sabe encontrar un documento que sí existe
 * —el mapeo está mal— y no que el expediente esté incompleto.
 *
 *   node scripts/test_paquete_actuaciones.js LOTE-2026-004
 *   node scripts/test_paquete_actuaciones.js LOTE-2026-004 --gestor
 * ─────────────────────────────────────────────────────────────────────────────
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const supabase = require('../services/supabaseClient');
const { construirPaquete } = require('../services/envioGestorService');

(async () => {
    const codigo = process.argv[2];
    const modo = process.argv.includes('--gestor') ? 'gestor' : 'expediente';
    if (!codigo) { console.error('Uso: node scripts/test_paquete_actuaciones.js <CODIGO-LOTE> [--gestor]'); process.exit(1); }

    const { data: lote } = await supabase.from('lotes').select('id, codigo, estado').eq('codigo', codigo).maybeSingle();
    if (!lote) { console.error(`No existe el lote ${codigo}`); process.exit(1); }

    console.log(`\n📦 ${lote.codigo} · ${lote.estado} · paquete "${modo}" · EN SECO (no escribe en Drive)\n`);
    // `--zip` arma el ZIP DE VERDAD (baja los ficheros, con sus nombres finales) y
    // lo escribe en disco, sin tocar Drive: es la única forma de comprobar que el
    // paquete de un lote ya presentado se abre y trae lo que dice.
    const conZip = process.argv.includes('--zip');
    const r = await construirPaquete(lote.id, { modo, dryRun: true, zipEnMemoria: conZip });

    if (conZip) {
        const fs = require('fs');
        const os = require('os');
        for (const a of r.actuaciones.filter(x => x.zip && x.zip.buffer)) {
            const dest = path.join(process.env.ZIP_DIR || os.tmpdir(), `${lote.codigo}-${a.zip.nombre}`);
            fs.writeFileSync(dest, a.zip.buffer);
            console.log(`   guardado ${dest} · ${(a.zip.bytes / 1048576).toFixed(1)} MB`);
        }
        console.log('');
    }

    if (!r.convenio_so) {
        console.log('⚠️  El Sujeto Obligado no tiene CONVENIO CAE registrado en su ficha:');
        console.log('    todas las actuaciones saldrán bloqueadas por la pieza E{n}-1.\n');
    }

    for (const a of r.actuaciones) {
        const cab = `E${a.n} · ${a.numero_expediente} (${a.ficha})`;
        console.log(`${a.ok ? '✅' : '⛔'} ${cab} — ${a.n_ficheros}/${a.piezas.length} piezas`);
        // Se distingue de dónde ha salido cada pieza: `manual` y `drive` cuentan
        // como presentes, pero significan que la app no la tiene apuntada y que el
        // paquete depende de una copia que alguien colocó a mano.
        const MARCA = {
            falta:  (ob) => ob ? '✗ FALTA   ' : '· leve    ',
            // El fichero EXISTIÓ y ya no está: no es lo mismo que no tenerlo, porque
            // el documento se generó y se firmó — hay que volver a subirlo o
            // re-enlazarlo, no rehacerlo.
            roto:   (ob) => ob ? '✗ ROTO    ' : '· roto    ',
            no_procede: () => '– no proc.',
            manual: () => '⚠ a mano  ',
            drive:  () => '⚠ de Drive',
        };
        for (const p of a.piezas) {
            if (p.estado === 'ok') continue;
            console.log(`     ${MARCA[p.estado](p.obligatorio)} ${(p.cod || 'anexo').padEnd(5)} ${p.etiqueta}`);
        }
        if (process.argv.includes('--verbose')) {
            for (const p of a.piezas.filter(x => x.estado === 'ok')) console.log(`     ✓ ${p.nombre}`);
        }
        console.log('');
    }

    const ok = r.actuaciones.filter(a => a.ok).length;
    console.log('──────────── RESUMEN ────────────');
    console.log(`Actuaciones completas : ${ok}/${r.actuaciones.length}`);
    for (const b of r.bloqueados) console.log(`  ⛔ ${b}`);
    console.log('');
    process.exit(0);
})().catch(e => { console.error('❌', e.message); process.exit(1); });
