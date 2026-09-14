#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Siembra la TARIFA DE VERIFICACIÓN orientativa de un verificador.
 *
 * La tabla que pasó MARWEN (09/2026) para las actuaciones que van en lote:
 *
 *      1 actuación  →   900 €      (900 €/act)
 *      5            → 2.000 €      (400 €/act)
 *     10            → 3.600 €      (360 €/act)
 *     15            → 4.400 €      (293 €/act)
 *
 * Es la referencia contra la que se compara luego su oferta y su factura. NO es
 * lo que se paga: eso sigue siendo `lotes.coste_verificacion`, que sale de la
 * factura de verdad.
 *
 * Se ENSEÑA antes de escribir (en seco por defecto) porque un precio tecleado a
 * ciegas en la ficha de la empresa equivocada se compara luego contra los lotes
 * de otro, y nadie lo nota.
 *
 *   node scripts/sembrar_tarifa_verificacion.js B23627375
 *   node scripts/sembrar_tarifa_verificacion.js B23627375 --execute
 *   node scripts/sembrar_tarifa_verificacion.js MARWEN --execute
 * ─────────────────────────────────────────────────────────────────────────────
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const supabase = require('../services/supabaseClient');
const { getTarifas, saveTarifas } = require('../services/tarifasVerificacion');

const TARIFA_ORIENTATIVA = {
    id: 'lote-res',
    nombre: 'Actuaciones en lote',
    fichas: ['RES060', 'RES080', 'RES093', 'TER100'],
    nota: 'Tarifa orientativa facilitada por el verificador (09/2026). Importes sin IVA.',
    tramos: [
        { actuaciones: 1, importe: 900 },
        { actuaciones: 5, importe: 2000 },
        { actuaciones: 10, importe: 3600 },
        { actuaciones: 15, importe: 4400 },
    ],
};

(async () => {
    const args = process.argv.slice(2);
    const execute = args.includes('--execute');
    const clave = args.find(a => !a.startsWith('--'));
    if (!clave) {
        console.error('Falta el NIF o el acrónimo del verificador.\n  node scripts/sembrar_tarifa_verificacion.js B23627375 [--execute]');
        process.exit(1);
    }

    // Solo verificadores: el mismo NIF de una certificadora no puede acabar con
    // una tarifa de verificación colgada de su ficha.
    const { data, error } = await supabase
        .from('prescriptores')
        .select('id_empresa, razon_social, acronimo, cif, tipo_empresa')
        .eq('tipo_empresa', 'VERIFICADOR');
    if (error) { console.error('Error leyendo prescriptores:', error.message); process.exit(1); }

    const norm = (s) => String(s || '').toUpperCase().replace(/[\s.-]/g, '');
    const buscado = norm(clave);
    const encontrados = (data || []).filter(p => norm(p.cif) === buscado || norm(p.acronimo) === buscado);

    if (!encontrados.length) {
        console.error(`No hay ningún VERIFICADOR con NIF o acrónimo "${clave}".`);
        console.error('Verificadores dados de alta:', (data || []).map(p => `${p.acronimo || p.razon_social} (${p.cif})`).join(' · ') || '— ninguno —');
        process.exit(1);
    }
    // Con dos candidatos no se elige: escribir el precio en la ficha equivocada
    // es justo el fallo que este script no puede cometer en silencio.
    if (encontrados.length > 1) {
        console.error('Hay más de un verificador que encaja; afina el NIF:');
        encontrados.forEach(p => console.error(`  · ${p.acronimo || p.razon_social} — ${p.cif}`));
        process.exit(1);
    }

    const v = encontrados[0];
    console.log(`\nVerificador: ${v.acronimo || v.razon_social} (${v.cif})`);

    const actual = await getTarifas(v.id_empresa);
    if (actual.tarifas.length) {
        console.log('\n⚠ Ya tiene tarifas registradas:');
        actual.tarifas.forEach(t => console.log(`   · ${t.nombre}: ${t.tramos.map(x => `${x.actuaciones}→${x.importe} €`).join(', ')}`));
        console.log('   Este script las REEMPLAZARÍA. Si son distintas, edítalas desde su ficha.');
    }

    console.log('\nSe escribirá:');
    console.log(`   ${TARIFA_ORIENTATIVA.nombre} · ${TARIFA_ORIENTATIVA.fichas.join(' · ')}`);
    TARIFA_ORIENTATIVA.tramos.forEach(t => {
        console.log(`   ${String(t.actuaciones).padStart(3)} actuaciones → ${String(t.importe).padStart(6)} €   (${(t.importe / t.actuaciones).toFixed(0)} €/act.)`);
    });

    if (!execute) {
        console.log('\n(en seco — vuelve a lanzarlo con --execute para escribirlo)\n');
        process.exit(0);
    }

    await saveTarifas(v.id_empresa, { tarifas: [TARIFA_ORIENTATIVA] }, 'script sembrar_tarifa_verificacion');
    console.log('\n✅ Tarifa registrada. Se ve en su ficha (Prescriptores) y en cada lote suyo.\n');
    process.exit(0);
})().catch(e => { console.error('Error:', e.message); process.exit(1); });
