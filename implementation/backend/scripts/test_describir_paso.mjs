/**
 * QUÉ deshace «Deshacer» (`logic/describirPaso.js` y `sitio` de useDeshacer).
 *
 * El botón dice «Deshacer: V3 movida de FBE1 a FBE3» comparando las dos fotos
 * de la pila. Lo que puede romperse en silencio: decir algo que no ha pasado
 * (la selección no es un cambio) o callarse lo que sí.
 *
 *   node implementation/backend/scripts/test_describir_paso.mjs
 */
import { cambiosEntre, describirPaso }
    from '../../frontend/src/features/cee-envolvente/logic/describirPaso.js';
import { sitio } from '../../frontend/src/features/cee-envolvente/logic/useDeshacer.js';

let fallos = 0;
const ok = (cond, que) => {
    console.log(`${cond ? '  ✓' : '  ✗'} ${que}`);
    if (!cond) fallos++;
};

const V3 = { uid: 'u3', nombre: 'V3', tipo: 'ventana', ancho: 1.2, alto: 1, estado: 'dudoso' };
const foto = (trabajo, ajustes = {}) => ({ trabajo: { entrada: 'FBE1', sel: null, huecos: {}, ...trabajo }, ajustes });
const base = foto({ huecos: { FBE1: [V3], FBE3: [] } });

console.log('Huecos');
ok(describirPaso(base, foto({ huecos: { FBE1: [], FBE3: [V3] } })) === 'V3 movida de FBE1 a FBE3', 'movida');
ok(describirPaso(foto({ huecos: { FBE1: [] } }), foto({ huecos: { FBE1: [V3] } })) === 'V3 añadida a FBE1', 'añadida');
ok(describirPaso(base, foto({ huecos: { FBE1: [], FBE3: [] } })) === 'V3 quitada de FBE1', 'quitada');
ok(describirPaso(base, foto({ huecos: { FBE1: [{ ...V3, estado: 'medido' }], FBE3: [] } })) === 'V3 dada por buena',
   'dada por buena');
ok(describirPaso(base, foto({ huecos: { FBE1: [{ ...V3, ancho: 1.4 }], FBE3: [] } })) === 'medidas de V3',
   'medidas cambiadas');

console.log('Paredes');
ok(describirPaso(base, foto({ huecos: base.trabajo.huecos, excluidas: ['FBE2'] })) === 'FBE2 apartada', 'apartada');
ok(describirPaso(foto({ huecos: base.trabajo.huecos, revisadas: ['FBE2'] }), base) === 'FBE2 ya no está revisada',
   'quitar «revisada»');
ok(describirPaso(base, foto({ huecos: base.trabajo.huecos, tipos: { FBE2: 'MEDIANERA' } })) === 'el tipo de FBE2',
   'el tipo, con el nombre de la pared');
ok(describirPaso(base, foto({ huecos: base.trabajo.huecos, entrada: 'FBE3' })) === 'la entrada por FBE3', 'la entrada');

console.log('Ajustes y lo que no es un cambio');
ok(describirPaso(base, foto(base.trabajo, { ventanas: { vidrio: 'DOBLE' } })) === 'cómo son las ventanas',
   'los ajustes de la ficha, por su nombre');
ok(describirPaso(base, foto({ ...base.trabajo, sel: 'FBE3' })) === null, 'cambiar la selección no es un cambio');
ok(describirPaso(base, base) === null, 'la misma foto, nada');
const varios = describirPaso(base, foto({ huecos: { FBE1: [], FBE3: [V3] }, excluidas: ['FBE2'], revisadas: ['FBE4'] }));
ok(varios === 'V3 movida de FBE1 a FBE3 · FBE2 apartada y 1 más', `varios a la vez, con tope: «${varios}»`);
ok(cambiosEntre(base, foto({ huecos: base.trabajo.huecos, paredes: { D1: {} } })).includes('una pared dibujada o movida'),
   'lo que no tiene nombre fino se dice en general');

console.log('El sitio en la pila');
const pila = [base, foto({ huecos: { FBE1: [], FBE3: [V3] } }), foto({ huecos: { FBE1: [], FBE3: [V3] }, excluidas: ['FBE2'] })];
const s2 = sitio(pila, 2);
ok(s2.deshace === 'FBE2 apartada' && s2.rehace === null, 'al final: deshace el último, nada que rehacer');
const s1 = sitio(pila, 1);
ok(s1.deshace === 'V3 movida de FBE1 a FBE3' && s1.rehace === 'FBE2 apartada', 'en medio: los dos');
ok(sitio(pila, 0).deshace === null, 'al principio, nada que deshacer');

console.log(fallos ? `\n✗ ${fallos} fallo(s)` : '\n✓ todo bien');
process.exit(fallos ? 1 : 0);
