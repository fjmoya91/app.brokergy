/**
 * Revisar la envolvente PARED A PARED con el teclado (`logic/atajosPared.js`).
 *
 * Lo que puede romperse en silencio es que un atajo se ROBE una tecla que no es
 * suya: Intro en un botón con el foco, una «v» escrita en el nombre de una pared,
 * Ctrl+Z del deshacer. Y el orden de «siguiente/anterior», que tiene que ser el
 * del plano y dar la vuelta.
 *
 *   node implementation/backend/scripts/test_atajos_pared.mjs
 */
import { accionDeTecla, enUnCampo, paredVecina }
    from '../../frontend/src/features/cee-envolvente/logic/atajosPared.js';

let fallos = 0;
const ok = (cond, que) => {
    console.log(`${cond ? '  ✓' : '  ✗'} ${que}`);
    if (!cond) fallos++;
};

//: Un «elemento» con lo justo: etiqueta, editable y si está dentro de un popup.
const el = (tagName, { editable = false, enPopup = false } = {}) => ({
    tagName,
    isContentEditable: editable,
    closest: sel => (enPopup && sel === '[role="dialog"]' ? {} : null),
});
const tecla = (key, extra = {}) => ({ key, target: el('DIV'), ...extra });

console.log('Qué hace cada tecla');
ok(accionDeTecla(tecla('Enter')) === 'revisada', 'Intro → revisada');
ok(accionDeTecla(tecla('ArrowRight')) === 'siguiente', '→ → siguiente');
ok(accionDeTecla(tecla('ArrowLeft')) === 'anterior', '← → anterior');
ok(accionDeTecla(tecla('v')) === 'ventana' && accionDeTecla(tecla('V')) === 'ventana', 'v / V → ventana');
ok(accionDeTecla(tecla('p')) === 'puerta', 'p → puerta');
ok(accionDeTecla(tecla('Delete')) === 'quitar', 'Supr → quitar');
ok(accionDeTecla(tecla('a')) === 'asistente', 'a → asistente');
ok(accionDeTecla(tecla('x')) === null, 'otra tecla → nada');

console.log('Lo que NO se roba');
ok(accionDeTecla(tecla('z', { ctrlKey: true })) === null, 'Ctrl+Z es del deshacer');
ok(accionDeTecla(tecla('v', { metaKey: true })) === null, 'Cmd+V es pegar');
ok(accionDeTecla(tecla('ArrowRight', { altKey: true })) === null, 'Alt+→ es del navegador');
ok(accionDeTecla(tecla('v', { repeat: true })) === null, 'una tecla mantenida no pone 20 ventanas');
ok(accionDeTecla(tecla('v', { target: el('INPUT') })) === null, 'en un campo, la «v» se escribe');
ok(accionDeTecla(tecla('Delete', { target: el('TEXTAREA') })) === null, 'en un texto, Supr borra texto');
ok(accionDeTecla(tecla('ArrowLeft', { target: el('SELECT') })) === null, 'en un desplegable, las flechas son suyas');
ok(accionDeTecla(tecla('p', { target: el('DIV', { editable: true }) })) === null, 'en algo editable, nada');
ok(accionDeTecla(tecla('Enter', { target: el('BUTTON') })) === null, 'Intro sobre un botón es su clic');
ok(accionDeTecla(tecla('Enter', { target: el('A') })) === null, 'Intro sobre un enlace es su clic');
ok(accionDeTecla(tecla('v', { target: el('BUTTON') })) === 'ventana', '…pero la «v» con un botón enfocado sí vale');
ok(accionDeTecla(tecla('v', { target: el('DIV', { enPopup: true }) })) === null, 'dentro de un popup, nada');
ok(accionDeTecla(null) === null && accionDeTecla({}) === null, 'sin evento, nada');
ok(enUnCampo(null) === false, 'sin foco no es un campo');

console.log('Pared siguiente y anterior');
const muros = {
    FBE10: { id: 'FBE10', planta: 'P00' },
    FBE2: { id: 'FBE2', planta: 'P00' },
    FBE1: { id: 'FBE1', planta: 'P00' },
    MED1: { id: 'MED1', planta: 'P00', fuera: true },
    F1E1: { id: 'F1E1', planta: 'P01' },
};
const esFuera = m => !!m.fuera;
ok(paredVecina(muros, 'FBE1', 1, esFuera) === 'FBE2', 'FBE1 → FBE2 (orden numérico)');
ok(paredVecina(muros, 'FBE2', 1, esFuera) === 'FBE10', 'FBE2 → FBE10, no FBE10 antes que FBE2');
ok(paredVecina(muros, 'FBE10', 1, esFuera) === 'F1E1', 'acabada la planta baja, la primera');
ok(paredVecina(muros, 'F1E1', 1, esFuera) === 'FBE1', 'da la vuelta al final');
ok(paredVecina(muros, 'FBE1', -1, esFuera) === 'F1E1', 'y al principio');
ok(paredVecina(muros, 'FBE10', 1, esFuera) !== 'MED1', 'se salta la APARTADA');
ok(paredVecina(muros, null, 1, esFuera) === 'FBE1', 'sin pared abierta, → da la primera');
ok(paredVecina(muros, null, -1, esFuera) === 'F1E1', 'y ← la última');
ok(paredVecina({}, null, 1) === null, 'sin paredes, nada');
const alReves = { F1E1: { id: 'F1E1', planta: 'PB1' }, FBE1: { id: 'FBE1', planta: 'PB0X' } };
ok(paredVecina(alReves, null, 1, undefined, [{ id: 'PB0X' }, { id: 'PB1' }]) === 'FBE1',
   'el orden de las plantas lo dicen las plantas del plano, no su id en texto');

console.log(fallos ? `\n✗ ${fallos} fallo(s)` : '\n✓ todo bien');
process.exit(fallos ? 1 : 0);
