/**
 * «Faltan N para generar» (`faltaParaGenerar`, logic/pendientes.js).
 *
 * El número de la tira y la lista que abre salen de la MISMA función, y tienen
 * que contar lo mismo que ya se contaba: paredes sin mirar = `resumen.sinTocar`,
 * medidas = `pendientesDe`. Y separar lo que IMPIDE generar de lo que se revisa
 * después.
 *
 *   node implementation/backend/scripts/test_falta_para_generar.mjs
 */
import { faltaParaGenerar, pendientesDe }
    from '../../frontend/src/features/cee-envolvente/logic/pendientes.js';

let fallos = 0;
const ok = (cond, que) => {
    console.log(`${cond ? '  ✓' : '  ✗'} ${que}`);
    if (!cond) fallos++;
};

const plantas = [{ id: 'P00', nombre: 'Planta baja' }, { id: 'P01', nombre: 'Planta 1' }];
const muros = {
    FBE1: { id: 'FBE1', planta: 'P00', tipo: 'FACHADA', huecos: [{ nombre: 'V1', estado: 'medido' }] },
    FBE2: { id: 'FBE2', planta: 'P00', tipo: 'FACHADA', huecos: [{ nombre: 'V2', estado: 'dudoso', ancho: 1.2, alto: 1 }] },
    FBE10: { id: 'FBE10', planta: 'P00', tipo: 'FACHADA', huecos: [] },
    FBS1: { id: 'FBS1', planta: 'P00', tipo: 'FACHADA', huecos: [], revisada: true },
    MED1: { id: 'MED1', planta: 'P00', tipo: 'MEDIANERA', huecos: [] },
    F1N1: { id: 'F1N1', planta: 'P01', tipo: 'FACHADA', huecos: [], sinRumbo: true },
    APART: { id: 'APART', planta: 'P01', tipo: 'FACHADA', huecos: [], fuera: true },
};
const pestanas = [
    { id: 'administrativos', etiqueta: 'Datos administrativos', estado: '! falta el técnico', tono: 'aviso' },
    { id: 'generales', etiqueta: 'Datos generales', estado: '2 sin rellenar', tono: 'aviso' },
    { id: 'envolvente', etiqueta: 'Envolvente térmica', estado: '! falta la entrada', tono: 'aviso' },
    { id: 'instalaciones', etiqueta: 'Instalaciones', estado: '✓ completo', tono: 'ok' },
];
const base = { muros, lucernarios: {}, plantas, pestanas, necesitaRumbo: m => !!m.sinRumbo };

const f = faltaParaGenerar({ ...base, entrada: null, ventanas: false });
const de = g => f.items.filter(i => i.grupo === g).map(i => i.clave);

console.log('Lo que IMPIDE generar');
ok(de('bloquea').includes('entrada'), 'sin entrada');
ok(de('bloquea').includes('rumbo|F1N1'), 'una fachada sin rumbo, con su pared');
ok(de('bloquea').includes('pestana|administrativos'), 'un «! falta…» de otra pestaña');
ok(!de('bloquea').includes('pestana|envolvente'), 'la pestaña de la envolvente no se cuenta dos veces');
ok(f.bloquean === 3, `bloquean 3 (salen ${f.bloquean})`);

console.log('Lo que se revisa después');
ok(de('aviso').includes('pestana|generales') && de('aviso').includes('ventanas'),
   '«2 sin rellenar» y las ventanas sin decir son aviso, no bloqueo');
ok(!f.items.some(i => i.clave === 'pestana|instalaciones'), 'una pestaña completa no sale');

console.log('Paredes sin mirar = resumen.sinTocar');
ok(JSON.stringify(de('pared')) === JSON.stringify(['pared|FBE10', 'pared|F1N1']),
   `FBE10 y F1N1, en el orden del plano (salen ${de('pared').join(', ')})`);
ok(!de('pared').includes('pared|FBS1'), 'la dada por revisada no');
ok(!de('pared').includes('pared|MED1'), 'la medianera no');
ok(!de('pared').includes('pared|APART'), 'la apartada no');

console.log('Medidas = pendientesDe');
ok(de('medida').length === pendientesDe(muros, {}, plantas).length && de('medida')[0].includes('V2'),
   'la V2 dudosa, la V1 medida no');
const v2 = f.items.find(i => i.grupo === 'medida');
ok(v2.ir.muro === 'FBE2' && v2.ir.planta === 'P00', 'y lleva a su pared');

console.log('Con todo hecho');
const hecho = faltaParaGenerar({
    muros: { FBE1: muros.FBE1 }, lucernarios: {}, plantas, entrada: 'FBE1', ventanas: true,
    pestanas: [{ id: 'instalaciones', estado: '✓ completo', tono: 'ok' }],
});
ok(hecho.items.length === 0 && hecho.bloquean === 0, 'no falta nada');

console.log(fallos ? `\n✗ ${fallos} fallo(s)` : '\n✓ todo bien');
process.exit(fallos ? 1 : 0);
