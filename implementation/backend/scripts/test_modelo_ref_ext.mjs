/**
 * test_modelo_ref_ext — La referencia de la ud. exterior solo se añade al
 * "Modelo" si DICE algo que el modelo no diga, y SOLO A PARTIR DE AHORA.
 *
 *   node implementation/backend/scripts/test_modelo_ref_ext.mjs
 *
 * El caso que lo motivó (26RES060_157): el CIFO imprimía
 *     "ERLA16DAV37 + EBVX16S23DJ6V · ERLA16DAV37"
 * porque `modelo` se rellena con `modelo_comercial || modelo_conjunto` y ese
 * DAIKIN no tiene comercial propio en el catálogo: acaba llevando el CONJUNTO,
 * que ya contiene la exterior, y detrás se le pegaba otra vez.
 *
 * Medido el 22/09/2026 sobre los 404 equipos del catálogo con referencia
 * exterior: 63 la repiten idéntica y 190 la llevan dentro; 151 aportan algo.
 * En expedientes reales, 50 de 112 imprimían la celda repetida.
 *
 * LO QUE ESTE TEST VIGILA, y es la mitad del encargo: SIN la marca
 * `modelo_sin_repetir` no cambia NI UN CARÁCTER. De eso depende que regenerar
 * el CIFO de los 29 expedientes que ya lo tienen firmado no mueva su documento.
 */
import path from 'path';
import { pathToFileURL, fileURLToPath } from 'url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const front = (p) => pathToFileURL(path.join(aqui, '../../frontend/src', p)).href;

const units = await import(front('features/expedientes/logic/aerotermiaUnits.js'));
const ce3x  = await import(front('features/expedientes/logic/ce3xFinal.js'));

let fallos = 0;
const ok = (cond, msg) => { console.log(`  ${cond ? '✓' : '✗'} ${msg}`); if (!cond) fallos++; };
const eq = (a, b, msg) => ok(a === b, a === b ? msg
    : `${msg}\n      esperado: ${JSON.stringify(b)}\n      obtenido: ${JSON.stringify(a)}`);

/** Casos REALES sacados del catálogo y de expedientes de producción. */
const CASOS = [
    // [qué es, modelo, ud_exterior, cómo debe salir CON la marca]
    ['iguales (catálogo: 63)',       '30AWH 10R', '30AWH 10R',                       '30AWH 10R'],
    ['iguales, otra capitalización', 'ThermaPro ACS-M110', 'THERMAPRO ACS-M110',     'ThermaPro ACS-M110'],
    ['contenida (el caso 157)',      'ERLA16DAV37 + EBVX16S23DJ6V', 'ERLA16DAV37',   'ERLA16DAV37 + EBVX16S23DJ6V'],
    ['contenida con barra (25RES060_36)', 'ALTHERMA 3 EHVX08S18EA6V / ERGA08EAV3H7', 'ERGA08EAV3H7',
                                                                                     'ALTHERMA 3 EHVX08S18EA6V / ERGA08EAV3H7'],
    ['aporta (25RES060_61)',         'GENIA AIR SPLIT 8', 'HA 8-8.2 OS',             'GENIA AIR SPLIT 8 · HA 8-8.2 OS'],
    ['aporta (AEROSUN)',             'CONFORT PLUS 12', 'HL12HG05',                  'CONFORT PLUS 12 · HL12HG05'],
    // Las dos trampas. Casi iguales NO es iguales, y un trozo de palabra no es
    // la referencia: en los dos casos se CONSERVA.
    ['casi iguales (25RES060_32)',   'ALTHERMA 3 ERLA14DV3', 'ERLA14D2V3',           'ALTHERMA 3 ERLA14DV3 · ERLA14D2V3'],
    ['no es pieza (AURUM, 20 casos)','AURUM6VA240K R32', 'AURUM6VA',                 'AURUM6VA240K R32 · AURUM6VA'],
    ['no es pieza (sufijo)',         'ERLA16DAV37X', 'ERLA16DAV37',                  'ERLA16DAV37X · ERLA16DAV37'],
];

console.log('\n1) SIN la marca → el documento sale EXACTAMENTE como salía\n');
for (const [qué, modelo, ext] of CASOS) {
    const antes = [modelo, ext].filter(Boolean).join(' · ');   // la fórmula de siempre
    eq(units.modeloUnidad({ modelo, modelo_ud_exterior: ext }), antes, `${qué}: intacto`);
}

console.log('\n2) CON la marca → la referencia solo si dice algo\n');
for (const [qué, modelo, ext, esperado] of CASOS) {
    eq(units.modeloUnidad({ modelo, modelo_ud_exterior: ext, modelo_sin_repetir: true }), esperado, qué);
}

console.log('\n3) Casos límite\n');
const m = (u) => units.modeloUnidad(u);
eq(m({ modelo: '', modelo_ud_exterior: 'ERLA16DAV37', modelo_sin_repetir: true }), 'ERLA16DAV37',
   'sin modelo, sale la referencia sola');
eq(m({ modelo: '', modelo_ud_exterior: '', modelo_conjunto: 'A + B', modelo_sin_repetir: true }), 'A + B',
   'sin nada, cae al conjunto (como antes)');
eq(m({ modelo: 'X', modelo_sin_repetir: true }), 'X', 'sin referencia, el modelo solo');
eq(m({}), '', 'objeto vacío → cadena vacía');
ok(units.refExtRedundante('ERLA16DAV37 + EBVX16S23DJ6V', ' erla16dav37 ') === true,
   'la comparación normaliza espacios y mayúsculas');
ok(units.refExtRedundante('A + ERLA16DAV37X + ERLA16DAV37', 'ERLA16DAV37') === true,
   'se recorren TODAS las apariciones, no solo la primera');
ok(units.refExtRedundante('ERLA16DAV37X', 'ERLA16DAV37') === false,
   'un sufijo pegado NO cuenta como la referencia');
eq(units.refExtVisible({ modelo_ud_exterior: '', modelo_sin_repetir: true }), '', 'sin referencia devuelve vacío');

console.log('\n4) La cascada sigue agrupando y contando\n');
const uni = (n) => ({
    aerotermia_db_id: 7, marca: 'DAIKIN', modelo: 'ERLA16DAV37 + EBVX16S23DJ6V',
    modelo_ud_exterior: 'ERLA16DAV37', modelo_sin_repetir: true, numero_serie: `S${n}`, scop: 4.2,
    potencia: 16, metodo_scop: 'ficha',
});
const cascada = { ...uni(1), equipos_extra: [uni(2), uni(3)] };
eq(units.formatModelos(cascada), 'ERLA16DAV37 + EBVX16S23DJ6V (×3)', '3 unidades iguales → una línea con ×3');
eq(units.countUnidades(cascada), 3, 'siguen siendo 3 unidades');
eq(units.formatSeries(cascada, { sep: ' / ' }), 'Ud. 1: S1 / Ud. 2: S2 / Ud. 3: S3',
   'las series NO se agrupan: cada equipo queda identificado');
const mixta = { ...uni(1), equipos_extra: [{ ...uni(2), modelo: 'GENIA AIR SPLIT 8', modelo_ud_exterior: 'HA 8-8.2 OS' }] };
eq(units.formatModelos(mixta), 'ERLA16DAV37 + EBVX16S23DJ6V + GENIA AIR SPLIT 8 · HA 8-8.2 OS',
   'dos modelos distintos: cada uno con lo que le toca');

console.log('\n5) El encargo CE3X nombra el equipo igual (la MISMA decisión)\n');
// `buildCe3xFinal` produce el texto que se le manda al certificador para que lo
// teclee en CE3X: es la otra superficie donde la referencia se repetía, allí
// entre paréntesis. Tiene que decidirlo con la misma función que el CIFO.
const expCe3x = (u) => ({
    numero_expediente: '26RES060_157',
    instalacion: { tipo_emisor: 'radiadores_convencionales', cambio_acs: false, aerotermia_cal: u },
    cee: { cee_inicial: { demandaCalefaccion: 90, superficieHabitable: 120 } },
});
const bloqueCon = ce3x.buildCe3xFinal(expCe3x(uni(1))).bloque;
const bloqueSin = ce3x.buildCe3xFinal(expCe3x({ ...uni(1), modelo_sin_repetir: undefined })).bloque;

ok(bloqueCon.includes('ERLA16DAV37 + EBVX16S23DJ6V'), 'el encargo nombra el equipo');
ok(!bloqueCon.includes('(ERLA16DAV37)'), 'CON la marca no repite la referencia entre paréntesis');
ok(bloqueSin.includes('(ERLA16DAV37)'), 'SIN la marca se comporta como antes (la repite)');
ok(ce3x.buildCe3xFinal(expCe3x({ ...uni(1), modelo: 'GENIA AIR SPLIT 8', modelo_ud_exterior: 'HA 8-8.2 OS' }))
      .bloque.includes('(HA 8-8.2 OS)'),
   'una referencia que SÍ aporta se conserva también en el encargo');

console.log(fallos ? `\n✗ ${fallos} fallo(s)\n` : '\n✓ Todo correcto\n');
process.exit(fallos ? 1 : 0);
