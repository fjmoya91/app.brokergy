/**
 * test_placa_acs_conjunto — El bloque de ACS que deja el lector de placas cuando
 * el equipo es un CONJUNTO (trae el depósito dentro).
 *
 *   node implementation/backend/scripts/test_placa_acs_conjunto.mjs
 *
 * Se monta con el caso REAL de 26RES060_167 (DAIKIN ERLA16D2V37 + EBVX16S18DJ6V,
 * id 238 del catálogo, depósito de 180 l) y comprueba lo único que de verdad
 * importa de ese nodo: que hereda la máquina pero NO su SCOP.
 *
 * ⚠️ La primera versión del botón escribía en ese nodo el nº de serie a secas, sin
 * marca ni modelo. El resultado era peor que no escribir nada: un nodo con serie y
 * sin equipo no tiene firma, así que `mismaMaquina()` no lo reconoce y la app pasa
 * a leer DOS máquinas donde hay una — y de ese veredicto cuelga qué SCOP_dhw se
 * declara en el CIFO. De ahí las dos últimas comprobaciones.
 */
import { pathToFileURL } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const front = (p) => pathToFileURL(path.join(aqui, '../../frontend/src', p)).href;

const acs = await import(front('features/expedientes/logic/acsCatalogo.js'));
const calc = await import(front('features/calculator/logic/calculation.js'));
const units = await import(front('features/expedientes/logic/aerotermiaUnits.js'));

// ── El caso real ─────────────────────────────────────────────────────────────
const nodoCal = {
    aerotermia_db_id: 238, marca: 'DAIKIN', modelo: 'ERLA16D2V37 + EBVX16S18DJ6V',
    modelo_ud_exterior: 'ERLA16D2V37', modelo_ud_interior: 'EBVX16S18DJ6V',
    modelo_conjunto: 'ERLA16D2V37 + EBVX16S18DJ6V',
    // Sin nº de serie: en ese expediente no hay foto de la placa de la ud. exterior.
    numero_serie: '', scop: 4.2, metodo_scop: 'ficha',
};
//: Lo que había en el nodo de ACS: el nº de serie de la ud. INTERIOR, leído de su
//: placa. Es el dato que no puede perderse al rellenar el resto.
const acsPrevio = { numero_serie: '5601076', marca: '', modelo: '' };
const model = {
    id: 238, marca: 'DAIKIN', modelo_comercial: 'ERLA16D2V37 + EBVX16S18DJ6V',
    deposito_acs_incluido: true, litros_acs: '180',
    scop_dhw_medio: '2.900', scop_dhw_calido: '3.775',
    eta_acs_media: '116.000', eta_acs_calida: '139.000',
    eprel: null, ficha_tecnica: 'ficha.pdf', url_keymark: null,
};

// ── Lo que hace la ruta, con las MISMAS funciones ─────────────────────────────
const metodo = acs.metodoAcsDelModelo(model, 'D3');
const nodo = acs.nodoAcsDesdeConjunto(nodoCal, model, {
    metodo: metodo.metodo,
    scop: calc.getScopAcsFromModel(model, 'D3', metodo.metodo),
    litros: acs.litrosAcsCatalogo(model),
});
const vacio = (v) => v === null || v === undefined || String(v).trim() === '';
for (const [k, v] of Object.entries(acsPrevio)) if (vacio(nodo[k]) && !vacio(v)) nodo[k] = v;

const inst = { aerotermia_cal: nodoCal, aerotermia_acs: nodo, misma_aerotermia_acs: false, cambio_acs: true };

let fallos = 0;
const ok = (cond, msg) => { console.log(`  ${cond ? '✓' : '✗'} ${msg}`); if (!cond) fallos++; };

console.log('\n── El nodo de ACS de un conjunto ───────────────────────────────');
ok(metodo.conjunto, 'el catálogo lo declara CONJUNTO (depósito incluido)');
ok(nodo.marca === 'DAIKIN' && nodo.modelo === nodoCal.modelo, 'hereda marca y modelo del de calefacción');
ok(String(nodo.aerotermia_db_id) === '238', 'hereda el id del catálogo (es lo que lo identifica)');
// `litrosAcsCatalogo` devuelve un NÚMERO, aunque la columna sea numeric y llegue
// como cadena desde PostgREST.
ok(Number(nodo.litros) === 180, `trae los litros del depósito (${nodo.litros})`);
ok(!nodo.equipos_extra, 'NO arrastra la cascada del bloque de calefacción');

console.log('\n── Pero el SCOP es PROPIO ──────────────────────────────────────');
ok(Math.abs(Number(nodo.scop) - 3.775) < 0.001, `SCOP_dhw 3,775 y no el 4,2 de calefacción (es ${nodo.scop})`);
ok(Number(nodo.scop) !== Number(nodoCal.scop), 'nunca es el mismo número que el de calefacción');

console.log('\n── Y su nº de serie es el de la UNIDAD INTERIOR ────────────────');
// Un bibloc son DOS aparatos: el de dentro es el que calienta y acumula el agua,
// así que su serie es la que el CIFO declara en «Nº serie equipo ACS» — fila
// aparte de la de la unidad exterior. `nodoAcsDesdeConjunto` copia el nodo de
// calefacción (cuya serie es la de la EXTERIOR), por eso se conserva la que ya
// estuviera puesta: rellenar no puede borrar.
ok(nodo.numero_serie === '5601076', 'conserva el nº de serie de la ud. interior, aunque el de calefacción esté vacío');
ok(nodo.numero_serie !== nodoCal.numero_serie, 'no es el mismo que el de la unidad exterior');

// ── Lo que acaba IMPRESO, que es el motivo de todo lo anterior ───────────────
// Se comprueba sobre los documentos de verdad, no sobre el JSON: el CIFO tiene
// dos filas («Nº serie unidad exterior» y «Nº serie equipo ACS») y el Anexo I un
// recuadro con dos líneas («Ud. exterior» / «Ud. interior»).
const gen = await import(front('features/expedientes/utils/docGenerators.js'));
const serieCifoAcs = (i) => (i.misma_aerotermia_acs
    ? units.formatSeries(i.aerotermia_cal) : units.formatSeries(i.aerotermia_acs));
const lineasAnexoI = (i) => gen.deriveAnexoI(
    { numero_expediente: '26RES060_167', instalacion: i, documentacion: {}, cee: {} }, {}, {}, {},
).serialsLineas.join('  |  ');

ok(serieCifoAcs(inst) === '5601076', `CIFO · «Nº serie equipo ACS» = ${serieCifoAcs(inst)} (antes salía «—»)`);
ok(units.formatSeries(inst.aerotermia_cal) !== '5601076', 'CIFO · la fila de la ud. EXTERIOR no se contamina con ella');
ok(lineasAnexoI(inst).includes('Ud. interior: 5601076'), `Anexo I · ${lineasAnexoI(inst)}`);

console.log('\n── Un MONOBLOC no tiene unidad interior que declarar ───────────');
// 18 expedientes reales están así: un solo aparato y la misma serie en los dos
// nodos. El lector NO escribe ahí la serie de una foto del slot «ud. interior»,
// porque inventaría un segundo equipo.
const monobloc = {
    aerotermia_cal: { ...nodoCal, modelo_ud_interior: '', numero_serie: 'EXT-111' },
    aerotermia_acs: { ...nodo, modelo_ud_interior: '', numero_serie: 'EXT-111' },
    misma_aerotermia_acs: false, cambio_acs: true,
};
ok(serieCifoAcs(monobloc) === 'EXT-111', 'su nº de serie es el de la unidad exterior, como debe');
// ⚠️ HALLAZGO PREEXISTENTE, no lo toca este lector: el Anexo I repite esa serie en
// la línea «Ud. interior» de un equipo que no la tiene. El propio código dice que
// eso «le dice al verificador que hay dos equipos donde solo hay uno», pero solo
// lo evita para acumuladores. Se deja ANOTADO aquí para que no se pierda.
if (lineasAnexoI(monobloc).includes('Ud. interior: EXT-111')) {
    console.log('  ⚠ (preexistente) el Anexo I de un monobloc repite la serie en «Ud. interior»');
}

console.log('\n── Y siguen siendo UNA máquina ─────────────────────────────────');
// Con el mismo `aerotermia_db_id` en los dos nodos, `mismaMaquina()` los reconoce
// y la app deja de pedir por separado el nº de serie del ACS (regla 12.c).
ok(!units.acsEsOtraMaquina(inst), 'la app NO lo lee como un segundo equipo');
ok(units.acsComputaAhorro(inst), 'el ACS computa en el ahorro');

// El nodo a medias que dejaba la primera versión: serie sin equipo.
const aMedias = { aerotermia_cal: nodoCal, aerotermia_acs: { numero_serie: '5601076' }, misma_aerotermia_acs: false };
ok(units.acsEsOtraMaquina(aMedias), 'un nodo con serie y SIN equipo sí se leía como otra máquina (lo que se arregló)');

console.log(`\n${fallos ? `❌ ${fallos} FALLO(S)` : '✅ Todo correcto'}\n`);
process.exit(fallos ? 1 : 0);
