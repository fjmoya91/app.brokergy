/**
 * test_serie_acs_flag — El nº de serie del equipo de ACS lo decide el DATO, no
 * el flag `misma_aerotermia_acs`.
 *
 *   node implementation/backend/scripts/test_serie_acs_flag.mjs
 *
 * El caso real: 26RES080_34, un CONJUNTO BIBLOC (THERMOR AUREA DUO 11, id 94 del
 * catálogo en los DOS nodos). Es UNA máquina — por eso el flag sigue en true y
 * `mismaMaquina()` los reconoce — pero DOS aparatos: la unidad exterior
 * (075076300000022) y la de dentro, que es la que calienta y acumula el agua
 * (002425200000056), cada una con su placa.
 *
 * Con el flag en true, el CIFO, el Anexo I y el certificado RES080 leían la serie
 * del nodo de CALEFACCIÓN, así que imprimían la de la unidad exterior en la fila
 * de la interior — teniendo la buena guardada. Medido el 16/09/2026 sobre
 * producción: 8 expedientes, todos con SCOP_dhw propio (25RES060_36 · _39 · _41,
 * 26RES060_102 · _107, 26RES080_34 · _59 · _66).
 */
import path from 'path';
import { pathToFileURL, fileURLToPath } from 'url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const front = (p) => pathToFileURL(path.join(aqui, '../../frontend/src', p)).href;

const units = await import(front('features/expedientes/logic/aerotermiaUnits.js'));
const gen   = await import(front('features/expedientes/utils/docGenerators.js'));
const cifo  = await import(front('features/expedientes/logic/cifoDoc.js'));

let fallos = 0;
const ok = (cond, msg) => { console.log(`  ${cond ? '✓' : '✗'} ${msg}`); if (!cond) fallos++; };

const SERIE_EXT = '075076300000022';
const SERIE_INT = '002425200000056';

const equipo = (serie, scop) => ({
    aerotermia_db_id: 94, marca: 'THERMOR', modelo: 'AUREA DUO 11',
    modelo_ud_exterior: '527035', modelo_conjunto: 'AUREA DUO 11 55ºC',
    numero_serie: serie, scop, metodo_scop: 'ficha',
});

// El estado tal cual está en la BD: flag TRUE y el nodo de ACS con su propia
// serie y su propio SCOP_dhw (3,15 frente a 6,13 de calefacción).
const inst = {
    cambio_acs: true,
    misma_aerotermia_acs: true,
    aerotermia_cal: equipo(SERIE_EXT, 6.13),
    aerotermia_acs: { ...equipo(SERIE_INT, 3.15), metodo_scop: 'conjunto' },
    tipo_emisor: 'suelo_radiante',
    caldera_antigua_cal: { tipo_equipo: 'Caldera', rendimiento_id: 'default' },
};

const expediente = (i, num = '26RES080_34') => ({
    numero_expediente: num, instalacion: i, documentacion: {}, cee: {},
    clientes: { nombre_razon_social: 'CLIENTE' },
    oportunidades: { datos_calculo: { inputs: {} } },
});

const serieCifo = (i, num) => cifo.deriveCifoData({
    expediente: expediente(i, num), results: { savingsKwh: 1000 },
}).acsNuSerieEx;
const lineasAnexo = (i, num) => gen.deriveAnexoI(expediente(i, num), {}, {}, {}).serialsLineas.join('  |  ');

console.log('\n── El dato está guardado y los documentos lo ignoraban ──────────');
ok(units.acsSerieDeclarada(inst), 'el nodo de ACS declara su propio nº de serie');
ok(!units.acsEsOtraMaquina(inst), 'y aun así sigue siendo UNA sola máquina (mismo id de catálogo)');

console.log('\n── CIFO · «Nº serie equipo ACS» ────────────────────────────────');
ok(serieCifo(inst) === SERIE_INT, `imprime ${serieCifo(inst)} (antes: ${SERIE_EXT}, el de la exterior)`);
ok(units.formatSeries(inst.aerotermia_cal) === SERIE_EXT, 'la fila de la unidad EXTERIOR no se mueve');

console.log('\n── Anexo I · recuadro de números de serie ──────────────────────');
ok(lineasAnexo(inst).includes(`Ud. interior: ${SERIE_INT}`), `${lineasAnexo(inst)}`);
ok(lineasAnexo(inst).includes(`Ud. exterior: ${SERIE_EXT}`), 'la línea de la exterior conserva la suya');

console.log('\n── Y lo que NO cambia ──────────────────────────────────────────');
// Monobloc: un solo aparato. El nodo de ACS no declara serie propia, así que
// sigue cayendo a la de calefacción — que es lo correcto.
const monobloc = {
    ...inst,
    aerotermia_acs: { ...equipo('', 3.15), metodo_scop: 'conjunto' },
};
ok(!units.acsSerieDeclarada(monobloc), 'sin serie en el nodo de ACS no hay nada propio que declarar');
ok(serieCifo(monobloc) === SERIE_EXT, `CIFO sigue imprimiendo la de la exterior (${serieCifo(monobloc)})`);

// Las dos series iguales (18 monoblocs reales): el resultado es el mismo número,
// así que ningún documento emitido se mueve.
const iguales = { ...inst, aerotermia_acs: { ...equipo(SERIE_EXT, 3.15), metodo_scop: 'conjunto' } };
ok(serieCifo(iguales) === SERIE_EXT, 'con la MISMA serie en los dos nodos el documento no cambia');

// El SCOP_dhw y el equipo siguen colgando del flag, a propósito: cambiarlos
// movería cifras de expedientes ya emitidos (regla 12.c).
const d = cifo.deriveCifoData({ expediente: expediente(inst), results: { savingsKwh: 1000 } });
ok(d.acsNuMod === 'AUREA DUO 11 · 527035' || d.acsNuMod.includes('AUREA DUO 11'),
   `el MODELO del ACS no lo toca este cambio (${d.acsNuMod})`);

console.log(`\n${fallos ? `❌ ${fallos} FALLO(S)` : '✅ Todo correcto'}\n`);
process.exit(fallos ? 1 : 0);
