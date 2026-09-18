// ============================================================================
// revisar_dacs_fases.js — qué expedientes tienen las DOS demandas de ACS
// distintas, y a cuáles de ellos les cambia la cifra el criterio nuevo.
//
//   node implementation/backend/scripts/revisar_dacs_fases.js
//
// SOLO LEE. No escribe ni propone escribir nada, y es deliberado: de la D_ACS
// sale el AE_ACS que firma el CIFO, y en muchos de estos expedientes ese
// documento está ya firmado, presentado o cobrado. Lo que hace falta aquí es la
// lista para decidir uno a uno.
//
// Desde el 2026-09-17 la D_ACS sale del CEE **INICIAL** (criterio del
// verificador: tiene que ser la misma en los dos certificados y, si no lo es,
// manda el de partida — ver `baseAcs` en logic/demandaAcs.js). Los documentos
// que se generen a partir de ahora la usarán; los ya emitidos llevan la del
// final y NADIE los reescribe.
//
// Las tres cosas que distingue, porque piden trabajos distintos:
//
//   1. CIFO ya FIRMADO y ACS en alcance → su documento declara una D_ACS que
//      el criterio actual no daría. No se toca por su cuenta; regenerarlo SÍ
//      cambiaría la cifra (y la puerta lo avisa antes de hacerlo).
//   2. Sin CIFO firmado → se generará ya con la del inicial. No hay nada que
//      hacer, sale para saber cuántos son.
//   3. ACS fuera de alcance, o RES080 → la D_ACS no viaja a su documento
//      (el certificado de un RES080 justifica el ahorro por energía final),
//      así que la diferencia entre certificados es información, no un hallazgo.
// ============================================================================
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const supabase = require('../services/supabaseClient');

const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const TOL = 0.02;
const pct = (a, b) => (b ? ((a - b) / b) * 100 : 0);
const f2 = (v) => v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

(async () => {
    // Campos CONCRETOS del JSONB: `cee` entero trae los dos XML crudos (regla 22).
    const { data, error } = await supabase
        .from('expedientes')
        .select('numero_expediente, lote_id, cee->cee_inicial, cee->cee_final, cee->acs_method,'
            + ' instalacion->cambio_acs, documentacion->cert_cifo_signed_link');
    if (error) { console.error('No se pudieron leer los expedientes:', error.message); process.exitCode = 1; return; }

    const filas = [];
    for (const e of data || []) {
        if ((e.acs_method || 'xml') !== 'xml') continue;          // los demás modos no dependen de la fase
        const ini = num(e.cee_inicial?.demandaACS);
        const fin = num(e.cee_final?.demandaACS);
        if (!(ini > 0 && fin > 0)) continue;                      // sin dos cifras no hay nada que comparar
        if (Math.abs(fin - ini) <= ini * TOL) continue;           // dentro del 2 %: redondeos del .cex
        const es080 = /RES080/i.test(e.numero_expediente || '');
        filas.push({
            n: e.numero_expediente, ini, fin, es080,
            // `cambio_acs` solo APAGA el ACS cuando vale false (regla 12.b).
            alcance: String(e.cambio_acs) !== 'false',
            firmado: !!e.cert_cifo_signed_link,
            loteado: !!e.lote_id,
            entra: !es080 && String(e.cambio_acs) !== 'false',    // ¿viaja la D_ACS a su documento?
        });
    }
    filas.sort((a, b) => String(a.n).localeCompare(String(b.n), 'es'));

    const linea = (x) => `  ${String(x.n).padEnd(16)} ini ${f2(x.ini).padStart(6)} · fin ${f2(x.fin).padStart(6)} kWh/m²·año`
        + `  (${pct(x.ini, x.fin) >= 0 ? '+' : ''}${pct(x.ini, x.fin).toFixed(0)} % al pasar a la del inicial)`
        + `${x.loteado ? ' · LOTEADO' : ''}`;

    const revisar = filas.filter(x => x.entra && x.firmado);
    const pendientes = filas.filter(x => x.entra && !x.firmado);
    const noEntra = filas.filter(x => !x.entra);

    console.log(`\n${filas.length} expedientes tienen las dos demandas de ACS distintas (más del 2 %).\n`);

    console.log(`── A REVISAR: ${revisar.length} con el CIFO ya FIRMADO y el ACS en alcance ──`);
    console.log('   Su documento declara la D_ACS del final. No se reescribe nada: regenerarlo');
    console.log('   cambiaría la cifra (la puerta lo avisa antes).\n');
    revisar.forEach(x => console.log(linea(x)));

    console.log(`\n── SIN CIFO FIRMADO: ${pendientes.length} · saldrán ya con la del inicial ──`);
    pendientes.forEach(x => console.log(linea(x)));

    console.log(`\n── LA D_ACS NO VIAJA A SU DOCUMENTO: ${noEntra.length} ──`);
    console.log('   RES080 (justifica el ahorro por energía final) o ACS fuera de alcance.\n');
    noEntra.forEach(x => console.log(`${linea(x)}${x.es080 ? ' · RES080' : ' · ACS fuera de alcance'}`));

    console.log('');
})();
