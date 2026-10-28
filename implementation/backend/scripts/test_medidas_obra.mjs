/**
 * Las MEDIDAS que pidió la obra (app de certificadores) frente a las que
 * escribe el `.cex` (`medidasObra.js`). Caso de partida: 2026EXT_1 (28/10/2026),
 * gasóleo sin placas y sin medidas elegidas: la receta llevaba la aerotermia
 * como medida LIBRE y la pestaña decía «ninguna».
 *
 *   node implementation/backend/scripts/test_medidas_obra.mjs
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const LOGIC = path.join(AQUI, '../../frontend/src/features/cee-envolvente/logic');
const M = await import(pathToFileURL(path.join(LOGIC, 'medidasObra.js')).href);
const A = await import(pathToFileURL(path.join(LOGIC, 'certappObra.js')).href);

let ok = 0;
const prueba = (nombre, fn) => {
    try { fn(); ok += 1; console.log(`  ✓ ${nombre}`); }
    catch (e) { console.error(`  ✗ ${nombre}\n    ${e.message}`); process.exitCode = 1; }
};

const obraGasoleo = { cuestionario: { calefaccion: 'gasoleo', placas_fv: 'NO', medidas: [] } };
const libreAero = M.aerotermiaGenericaLibre({ calefaccion: 'gasoleo', superficie: 128 });

console.log('\nLO QUE PIDIÓ LA OBRA');
prueba('sin elegir, las sugeridas: aerotermia y aerotermia + placas', () => {
    assert.deepEqual(M.medidasPedidasDeLaObra(obraGasoleo), { ids: ['AEROTERMIA', 'AEROTERMIA_FV'], sugeridas: true });
});
prueba('elegidas, mandan las elegidas', () => {
    const o = { cuestionario: { ...obraGasoleo.cuestionario, medidas: ['PLACAS_FV', 'VENTANAS', 'INVENTADA'] } };
    assert.deepEqual(M.medidasPedidasDeLaObra(o), { ids: ['PLACAS_FV', 'VENTANAS'], sugeridas: false });
});
prueba('el adaptador de la obra las lleva, con la calefacción', () => {
    const e = A.certappObraComoExpediente({ ...obraGasoleo, titular: {} });
    assert.equal(e.medidas_obra.calefaccion, 'gasoleo');
    assert.deepEqual(e.medidas_obra.ids, ['AEROTERMIA', 'AEROTERMIA_FV']);
});

console.log('\nLA AEROTERMIA GENÉRICA (la que deja el PC)');
prueba('mismo nombre, inversión y equipo que la de 2026EXT_1', () => {
    assert.equal(libreAero.nombre, 'SUSTITUCIÓN DE LA CALDERA DE GASÓLEO POR AEROTERMIA (CALEFACCIÓN Y ACS)');
    assert.equal(libreAero.inversion, 15000);
    const i = libreAero.instalaciones[0];
    assert.equal(i.generador, 'Bomba de Calor - Caudal Ref. Variable');
    assert.equal(i.rend_calefaccion, '400'); assert.equal(i.rend_acs, '300');
    assert.equal(i.superficie_calefaccion, 128);
    assert.ok(libreAero.justificacion && libreAero.secuencia === 2);
});
prueba('sin caldera que sustituir (o de biomasa), no se compone', () => {
    assert.equal(M.aerotermiaGenericaLibre({ calefaccion: 'aerotermia' }), null);
    assert.equal(M.aerotermiaGenericaLibre({ calefaccion: 'biomasa' }), null);
    assert.equal(M.aerotermiaGenericaLibre({}), null);
});
prueba('los equipos se leen en una línea', () => {
    assert.match(M.equiposDeLibre(libreAero)[0], /AEROTERMIA GENÉRICA.*rend\. 400 %.*128 m²/);
});

console.log('\nEL CRUCE');
const catalogo = [
    { id: 'aerotermia', titulo: 'Sustitución por aerotermia', disponible: false },
    { id: 'aerotermia_fv', titulo: 'Aerotermia + placas', disponible: false },
    { id: 'autoconsumo', titulo: 'Autoconsumo', disponible: true, datos: { nombre: 'INSTALACIÓN FOTOVOLTAICA' } },
];
prueba('2026EXT_1: la aerotermia va como libre; la de placas falta y la pone el PC', () => {
    const c = M.cruceMedidasObra({ pedidas: ['AEROTERMIA', 'AEROTERMIA_FV'], marcadas: [], catalogo, libres: [libreAero] });
    assert.equal(c[0].va, true); assert.match(c[0].como, /CALDERA DE GASÓLEO/);
    assert.equal(c[1].va, false); assert.match(c[1].falta, /PVGIS/);
});
prueba('sin la libre, la aerotermia falta y se ofrece ponerla', () => {
    const [a] = M.cruceMedidasObra({ pedidas: ['AEROTERMIA'], catalogo, libres: [] });
    assert.equal(a.va, false); assert.equal(a.componible, true);
});
prueba('una del catálogo marcada cuenta; disponible y sin marcar, se pide marcarla', () => {
    assert.equal(M.cruceMedidasObra({ pedidas: ['PLACAS_FV'], marcadas: ['autoconsumo'], catalogo })[0].va, true);
    assert.match(M.cruceMedidasObra({ pedidas: ['PLACAS_FV'], marcadas: [], catalogo })[0].falta, /márcala/);
});
prueba('ventanas y aislamientos: por el nombre de la libre, o que la pone el PC', () => {
    const v = { nombre: 'SUSTITUCIÓN DE VENTANAS' };
    assert.equal(M.cruceMedidasObra({ pedidas: ['VENTANAS'], libres: [v] })[0].va, true);
    assert.match(M.cruceMedidasObra({ pedidas: ['AISLAMIENTO_CUBIERTA'], libres: [v] })[0].falta, /PC/);
});

console.log(`\n${ok} pruebas bien${process.exitCode ? ' — ALGUNA HA FALLADO' : ''}.\n`);
