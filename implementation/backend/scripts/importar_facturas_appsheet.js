#!/usr/bin/env node
// ─── importar_facturas_appsheet.js ───────────────────────────────────────────
// Trae a `facturas_emitidas` (pestaña Facturación) lo emitido en AppSheet: las
// series ING (FACTURAS + DETALLE FACTURA) y FML (FACTURAS FML + DETALLE FACTURA
// FML) de la hoja «APP PPTO Y FACTURAS». Lo hace facturaService.importarLibro, lo
// mismo que el botón «Importar de AppSheet» de la pestaña.
//
// - Las importadas llevan origen APPSHEET y NO se encadenan en VERI*FACTU: no las
//   generó este sistema.
// - Una que ya está (mismo número) no se toca; solo se le copia el COBRO si la
//   hoja dice otra cosa (mientras AppSheet conviva, la hoja manda en ESTADO).
// - Las cifras son las de la HOJA; si sus líneas no suman lo mismo, se avisa.
//
// En SECO por defecto. `--escribir` escribe en la Supabase de PRODUCCIÓN.
//
//   node scripts/importar_facturas_appsheet.js                → las dos series, en seco
//   node scripts/importar_facturas_appsheet.js --serie FML    → solo FML, en seco
//   node scripts/importar_facturas_appsheet.js --escribir     → escribe
// ─────────────────────────────────────────────────────────────────────────────
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const facturas = require('../services/facturaService');

const ESCRIBIR = process.argv.includes('--escribir');
const iSerie = process.argv.indexOf('--serie');
const SERIES = iSerie > -1 ? [String(process.argv[iSerie + 1] || '').toUpperCase()] : ['ING', 'FML'];

async function main() {
    if (SERIES.some(s => !['ING', 'FML'].includes(s))) throw new Error('--serie tiene que ser ING o FML');
    for (const serie of SERIES) {
        const r = await facturas.importarLibro({ serie, escribir: ESCRIBIR });
        console.log(`\n── ${serie}: ${r.en_hoja} facturas en la hoja · ${r.nuevas} nuevas para la app · ${r.cobros.length} cobros que cambian`);
        for (const m of r.muestra) console.log(`   ${m}`);
        for (const c of r.cobros.slice(0, 20)) console.log(`   cobro ${c.numero}: ${c.de} → ${c.a}`);
        if (r.descuadres.length) {
            console.log(`   ⚠ ${r.descuadres.length} descuadres (se guarda la cifra de la hoja):`);
            for (const d of r.descuadres.slice(0, 20)) console.log(`     ${d}`);
        }
    }
    console.log(ESCRIBIR ? '\n✓ Escrito.' : '\nNada escrito. Para escribir: node scripts/importar_facturas_appsheet.js --escribir');
}

main().catch(e => { console.error('✗', e.message); process.exitCode = 1; });
