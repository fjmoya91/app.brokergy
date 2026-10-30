/**
 * QUÉ HA CAMBIADO al volver a medir (`logic/cambiosAlMedir.js`): lo que la
 * ventana resalta unos segundos y dice en una línea.
 *
 * Lo que puede romperse en silencio: que ABRIR la ventana (no había nada antes)
 * o DESHACER (mismo edificio) se lean como un cambio, y que una pared dibujada
 * a mano —que el motor no devuelve— salga como perdida.
 *
 *   node implementation/backend/scripts/test_cambios_al_medir.mjs
 */
import { cambiosAlMedir, paredesResaltadas, textoCambios }
    from '../../frontend/src/features/cee-envolvente/logic/cambiosAlMedir.js';

let fallos = 0;
const ok = (cond, que) => {
    console.log(`${cond ? '  ✓' : '  ✗'} ${que}`);
    if (!cond) fallos++;
};

const m = (id, extra = {}) => ({ id, planta: 'P0', ...extra });

console.log('Lo que NO es un cambio');
ok(cambiosAlMedir({}, { FBE1: m('FBE1') }) === null, 'abrir la ventana (no había nada antes)');
ok(cambiosAlMedir({ FBE1: m('FBE1') }, { FBE1: m('FBE1') }, {}, []) === null, 'medir y que salga lo mismo');

console.log('Paredes nuevas, renombradas y huecos sin pared');
const viejos = {
    FBE1: m('FBE1'),
    FBS1: m('FBS1'),
    FBS2: m('FBS2', { huecos: [{ nombre: 'V3' }, { nombre: 'V4' }] }),
    D1: m('D1', { subtipo: 'DIBUJADA' }),
};
const nuevo = { FBE1: m('FBE1'), FBS3: m('FBS3'), FBO1: m('FBO1'), FBO2: m('FBO2') };
// FBS1 es hoy FBS3 (el motor la ha renumerado); FBS2 se fue con el cuerpo.
const c = cambiosAlMedir(viejos, nuevo, { FBS1: 'FBS3' }, ['FBS2']);
ok(JSON.stringify(c.nuevas) === JSON.stringify(['FBO1', 'FBO2']), `nuevas FBO1 y FBO2 (salen ${c.nuevas})`);
ok(c.renombradas.length === 1 && c.renombradas[0].de === 'FBS1' && c.renombradas[0].a === 'FBS3',
   'FBS1 ahora es FBS3');
ok(c.huecosSinPared === 2, 'los dos huecos de FBS2 se quedan sin pared');
ok(!c.nuevas.includes('D1'), 'la pared dibujada a mano no cuenta (la pone el trabajo después)');

const res = paredesResaltadas(c);
ok(res.has('FBO1') && res.has('FBS3') && !res.has('FBE1'), 'se resaltan las nuevas y la renombrada, no la de siempre');
ok(paredesResaltadas(null).size === 0, 'sin cambios, nada resaltado');

const t = textoCambios(c);
ok(t.includes('2 paredes nuevas (FBO1, FBO2)') && t.includes('FBS1 ahora es FBS3')
   && t.includes('2 huecos se han quedado sin pared'), `en palabras: «${t}»`);
ok(textoCambios({ nuevas: ['A', 'B', 'C', 'D', 'E', 'F'], renombradas: [], huecosSinPared: 0 }, 4)
   .includes('y 2 más'), 'una lista larga se corta');

console.log(fallos ? `\n✗ ${fallos} fallo(s)` : '\n✓ todo bien');
process.exit(fallos ? 1 : 0);
