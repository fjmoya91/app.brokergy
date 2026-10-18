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

// ── 18/10/2026 · el RÓTULO de la segunda línea del Anexo I ─────────────────
console.log('\n── Anexo I · una bomba de calor de ACS APARTE no es una «ud. interior» ──');
// 26RES060_195: aerotermia MONOBLOC (Aerosun Advanced 12, id 163) + bomba de
// calor de ACS independiente (HTW-AT-V100MR290A, id 537), flag en false. El
// monobloc no tiene ud. interior: la línea se rotula como la fila del CIFO.
const aparte = {
    cambio_acs: true, misma_aerotermia_acs: false,
    aerotermia_cal: { aerotermia_db_id: 163, marca: 'AEROSUN', modelo: 'ADVANCED 12', numero_serie: 'IN2601309004-053', scop: 4.6 },
    aerotermia_acs: { aerotermia_db_id: 537, marca: 'HTW', modelo: 'HTW-AT-V100MR290A', numero_serie: 'AX24031603070524088', scop: 3.1 },
    caldera_antigua_cal: { tipo_equipo: 'Caldera', rendimiento_id: 'default' },
};
ok(units.acsEsOtraMaquina(aparte), 'el ACS lo da OTRA máquina del catálogo');
ok(lineasAnexo(aparte, '26RES060_195') === 'Ud. exterior: IN2601309004-053  |  Equipo ACS: AX24031603070524088',
   lineasAnexo(aparte, '26RES060_195'));
ok(!lineasAnexo(aparte, '26RES060_195').includes('Ud. interior'), 'y no dice «Ud. interior», que el monobloc no tiene');
ok(serieCifo(aparte, '26RES060_195') === 'AX24031603070524088', `el CIFO declara la misma serie en «Nº serie equipo ACS» (${serieCifo(aparte, '26RES060_195')})`);

console.log('\n── Anexo I · un monobloc no repite su serie como «ud. interior» ──');
// 26RES060_136: monobloc Aerosun Confort 12 que da también el ACS (flag en true,
// nodo de ACS sin serie). Antes: «Ud. exterior: X | Ud. interior: X».
const mono136 = {
    cambio_acs: true, misma_aerotermia_acs: true,
    aerotermia_cal: { aerotermia_db_id: 60, marca: 'AEROSUN', modelo: 'CONFORT 12', numero_serie: 'IN2601306006-030', scop: 4.6 },
    aerotermia_acs: { aerotermia_db_id: 60, marca: 'AEROSUN', modelo: 'CONFORT 12', numero_serie: '' },
    caldera_antigua_cal: { tipo_equipo: 'Caldera', rendimiento_id: 'default' },
};
ok(lineasAnexo(mono136, '26RES060_136') === 'Ud. exterior: IN2601306006-030', lineasAnexo(mono136, '26RES060_136'));
// Las dos series iguales en los dos nodos (el autorrelleno de un conjunto): la misma.
ok(lineasAnexo(iguales) === `Ud. exterior: ${SERIE_EXT}`, `con la MISMA serie en los dos nodos, una sola línea (${lineasAnexo(iguales)})`);
// El bibloc con la serie de la de dentro sigue con sus dos líneas (arriba).
ok(lineasAnexo(inst).includes(`Ud. interior: ${SERIE_INT}`), 'el bibloc conserva su «Ud. interior» con la serie propia');

// ── 18/10/2026 · CUÁNDO sale la serie del equipo de ACS (regla del usuario) ──
// Sale con un aerotermo de ACS (arriba) y con un ACUMULADOR del que tenemos la
// placa; NO sale si no se actúa sobre el ACS o si se pone un TERMO ELÉCTRICO.
console.log('\n── Anexo I · cuándo sale la serie del equipo de ACS ──');
const base = {
    misma_aerotermia_acs: false,
    aerotermia_cal: { aerotermia_db_id: 163, marca: 'AEROSUN', modelo: 'ADVANCED 12', numero_serie: 'IN2601309004-053', scop: 4.6 },
    caldera_antigua_cal: { tipo_equipo: 'Caldera', rendimiento_id: 'default' },
};
const acumulador = { ...base, cambio_acs: true,
    aerotermia_acs: { tipo_equipo_nuevo: 'acumulador', es_acumulador: true, marca: 'AEROSUN', modelo: 'BWT200', numero_serie: 'B4625000ACS', scop: 2.9 } };
ok(lineasAnexo(acumulador) === 'Ud. exterior: IN2601309004-053  |  Equipo ACS: B4625000ACS',
   `acumulador con su placa: ${lineasAnexo(acumulador)}`);
const acumSinPlaca = { ...acumulador, aerotermia_acs: { ...acumulador.aerotermia_acs, numero_serie: '' } };
ok(lineasAnexo(acumSinPlaca) === 'Ud. exterior: IN2601309004-053', `acumulador sin serie: no se inventa (${lineasAnexo(acumSinPlaca)})`);
const termo = { ...base, cambio_acs: true,
    aerotermia_acs: { tipo_equipo_nuevo: 'TERMO_ELECTRICO', marca: 'CORBERO', modelo: 'CTWBDR100', numero_serie: 'TERMO123' } };
ok(lineasAnexo(termo) === 'Ud. exterior: IN2601309004-053', `termo eléctrico: su serie no sale (${lineasAnexo(termo)})`);
const sinAcs = { ...aparte, cambio_acs: false };
ok(lineasAnexo(sinAcs) === 'Ud. exterior: IN2601309004-053', `sin actuar sobre el ACS: solo la exterior (${lineasAnexo(sinAcs)})`);

console.log(`\n${fallos ? `❌ ${fallos} FALLO(S)` : '✅ Todo correcto'}\n`);
process.exit(fallos ? 1 : 0);
