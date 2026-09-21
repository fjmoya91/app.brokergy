/**
 * Mover una ventana de una pared a OTRA.
 *
 * Las ventanas se ponen mirando el plano, y con las dos plantas a la vista y
 * seis fachadas encadenadas es fácil meterla en la pared de al lado. La única
 * salida era quitarla y volver a teclear sus medidas en la buena — y lo que se
 * teclea dos veces se teclea mal una.
 *
 *   node implementation/backend/scripts/test_mudar_hueco.mjs
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const LOGIC = path.join(AQUI, '../../frontend/src/features/cee-envolvente/logic');
const { paredesParaHueco, mudarHueco } =
    await import(pathToFileURL(path.join(LOGIC, 'huecosEnParedes.js')).href);
const { admiteHuecos } =
    await import(pathToFileURL(path.join(LOGIC, 'tiposPared.js')).href);

let ok = 0;
const prueba = (nombre, fn) => {
    try { fn(); ok += 1; console.log(`  ✓ ${nombre}`); }
    catch (e) { console.error(`  ✗ ${nombre}\n    ${e.message}`); process.exitCode = 1; }
};

const V1 = {
    uid: 'u1', nombre: 'V1', tipo: 'ventana', ancho: 2.4, alto: 1.2,
    estado: 'medido', por_que: 'confirmado por el certificador', pos: 0.8,
    vidrio: 'Doble bajo emisivo', cambia: true,
    lectura: { apertura: 'abatible', hojas: 2 },
};

const pared = (id, extra = {}) => ({
    id, tipo: 'FACHADA', planta: 'PB', nivel: 0, largo: 6.9, huecos: [], ...extra });

const MUROS = () => ({
    FBS1: pared('FBS1', { huecos: [{ ...V1 }] }),
    FBS2: pared('FBS2', { largo: 3.4 }),
    F1S1: pared('F1S1', { planta: 'P1', nivel: 1, largo: 4.4 }),
    MBN1: pared('MBN1', { tipo: 'MEDIANERA', largo: 17.63 }),
    PVBS2: pared('PVBS2', { tipo: 'PARTICION_INTERIOR_VERTICAL', largo: 5.26 }),
    FBS9: pared('FBS9', { excluida: true, largo: 1.03 }),
});

console.log('\nA QUÉ PAREDES SE PUEDE LLEVAR');
prueba('solo fachadas: una medianera y una partición no llevan huecos', () => {
    const ids = paredesParaHueco(MUROS(), 'FBS1').map(d => d.id);
    assert.ok(!ids.includes('MBN1'), 'no debería ofrecer la medianera');
    assert.ok(!ids.includes('PVBS2'), 'no debería ofrecer la partición');
});
prueba('ni la que está apartada de la envolvente', () => {
    assert.ok(!paredesParaHueco(MUROS(), 'FBS1').map(d => d.id).includes('FBS9'));
});
prueba('ni la pared en la que ya está', () => {
    assert.ok(!paredesParaHueco(MUROS(), 'FBS1').map(d => d.id).includes('FBS1'));
});
prueba('sí las de OTRA planta, diciendo de cuál son', () => {
    const d = paredesParaHueco(MUROS(), 'FBS1').find(x => x.id === 'F1S1');
    assert.ok(d, 'falta la pared de la planta 1');
    assert.equal(d.planta, 'P1');
});
prueba('van de abajo arriba, que es como se leen en el plano', () => {
    assert.deepEqual(paredesParaHueco(MUROS(), 'FBS1').map(d => d.id),
                     ['FBS2', 'F1S1']);
});
prueba('el desplegable dice el largo y cuántos huecos tiene ya', () => {
    const d = paredesParaHueco(MUROS(), 'FBS1')[0];
    assert.equal(d.largo, 3.4);
    assert.equal(d.huecos, 0);
});

console.log('\nLA MUDANZA');
prueba('la ventana sale de una pared y entra en la otra', () => {
    const v = mudarHueco(MUROS(), 'FBS1', 0, 'FBS2');
    assert.deepEqual(v.FBS1.huecos, []);
    assert.equal(v.FBS2.huecos.length, 1);
});
prueba('llega ENTERA: identidad, nombre, medidas, carpintería y su foto', () => {
    const h = mudarHueco(MUROS(), 'FBS1', 0, 'FBS2').FBS2.huecos[0];
    assert.equal(h.uid, 'u1');
    assert.equal(h.nombre, 'V1');
    assert.equal(h.ancho, 2.4);
    assert.equal(h.alto, 1.2);
    assert.equal(h.estado, 'medido');     // sigue confirmada: no hay que repetirla
    assert.equal(h.vidrio, 'Doble bajo emisivo');
    assert.equal(h.cambia, true);
    assert.deepEqual(h.lectura, { apertura: 'abatible', hojas: 2 });
});
prueba('lo único que NO viaja es dónde caía a lo largo del muro', () => {
    // Ese sitio es del muro viejo; en el nuevo la pondría en un punto cualquiera.
    assert.equal(mudarHueco(MUROS(), 'FBS1', 0, 'FBS2').FBS2.huecos[0].pos, undefined);
});
prueba('queda dicho de dónde viene', () => {
    const h = mudarHueco(MUROS(), 'FBS1', 0, 'FBS2').FBS2.huecos[0];
    assert.match(h.por_que, /movida desde FBS1/);
});
prueba('con el nombre COGIDO en el edificio se le da otro libre', () => {
    const m = MUROS();
    m.FBS2.huecos = [{ uid: 'otro', nombre: 'V1', tipo: 'ventana', ancho: 1, alto: 1 }];
    const h = mudarHueco(m, 'FBS1', 0, 'FBS2').FBS2.huecos[1];
    assert.notEqual(h.nombre, 'V1');
    assert.match(h.nombre, /^V\d+$/);
});
prueba('se respeta el nombre que el certificador puso a mano en la pared', () => {
    const m = MUROS();
    m.FBS1.nombre_manual = 'FACHADA SUR';
    assert.match(mudarHueco(m, 'FBS1', 0, 'FBS2').FBS2.huecos[0].por_que,
                 /desde FACHADA SUR/);
});

console.log('\nLO QUE NO SE HACE');
const intacto = (v, m) => assert.deepEqual(v, m, 'no debería haber tocado nada');
prueba('a una medianera no se muda: no lleva huecos', () => {
    const m = MUROS();
    intacto(mudarHueco(m, 'FBS1', 0, 'MBN1'), m);
});
prueba('ni a una partición, ni a una pared apartada', () => {
    const m = MUROS();
    intacto(mudarHueco(m, 'FBS1', 0, 'PVBS2'), m);
    intacto(mudarHueco(m, 'FBS1', 0, 'FBS9'), m);
});
prueba('a la misma pared no se hace nada', () => {
    const m = MUROS();
    intacto(mudarHueco(m, 'FBS1', 0, 'FBS1'), m);
});
prueba('un destino o un hueco que no existen no dejan nada a medias', () => {
    const m = MUROS();
    intacto(mudarHueco(m, 'FBS1', 0, 'NO_EXISTE'), m);
    intacto(mudarHueco(m, 'FBS1', 7, 'FBS2'), m);
    intacto(mudarHueco(m, 'NO_EXISTE', 0, 'FBS2'), m);
});
prueba('no se toca el mapa original', () => {
    const m = MUROS();
    mudarHueco(m, 'FBS1', 0, 'FBS2');
    assert.equal(m.FBS1.huecos.length, 1);
    assert.equal(m.FBS2.huecos.length, 0);
});

console.log('\nQUIÉN ADMITE HUECOS');
prueba('una fachada sí; una medianera, una partición y una apartada no', () => {
    assert.equal(admiteHuecos({ tipo: 'FACHADA' }), true);
    assert.equal(admiteHuecos({ tipo: 'MEDIANERA' }), false);
    assert.equal(admiteHuecos({ tipo: 'PARTICION_INTERIOR_VERTICAL' }), false);
    assert.equal(admiteHuecos({ tipo: 'FACHADA', excluida: true }), false);
});
prueba('manda lo que diga el certificador sobre lo que dice Catastro', () => {
    assert.equal(admiteHuecos({ tipo: 'FACHADA', tipo_manual: 'MEDIANERA' }), false);
    assert.equal(admiteHuecos({ tipo: 'MEDIANERA', tipo_manual: 'FACHADA' }), true);
});

console.log(`\n${ok} comprobaciones`);
if (process.exitCode) console.error('HAY FALLOS');
else console.log('todo correcto\n');
