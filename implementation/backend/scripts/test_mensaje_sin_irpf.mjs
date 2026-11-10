// El mensaje de la propuesta SIN deducción del IRPF (empresa / terciario / 0 €).
// node implementation/backend/scripts/test_mensaje_sin_irpf.mjs [--ver]
import { mensajeSinIrpf, propuestaSinIrpf } from '../../frontend/src/features/calculator/logic/mensajeSinIrpf.js';

let fallos = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fallos++; };
const ver = process.argv.includes('--ver');

ok(propuestaSinIrpf([0]) && propuestaSinIrpf([undefined, null]) && propuestaSinIrpf([0.4]), 'sin IRPF: 0, vacío o menos de 0,5 €');
ok(!propuestaSinIrpf([1200]) && !propuestaSinIrpf([0, 900]), 'con IRPF en alguna opción: el mensaje de siempre');

// 26TER100_OP389: empresa, terciario, una opción.
const base = { saludo: '¡Hola Autoservicio!', numero: '26TER100_OP389', enlaceDebajo: '👇 Más abajo te dejo el enlace para aceptarla.', terciario: true };
let m = mensajeSinIrpf({ ...base, caso: 'aero', bono: 5027 });
if (ver) console.log(`\n${m}\n`);
ok(/^💰 \*BONO ENERGÉTICO CAE: 5\.027 €\*$/m.test(m), 'la ayuda en su propia línea y en negrita entera');
ok(!/IRPF|retenciones|ambas opciones|Resumen total|Opción 1/.test(m), 'sin IRPF, sin «ambas opciones», sin «Opción 1»');
ok(/Para avanzar/.test(m) && /Más abajo/.test(m), 'con los pasos y el aviso del enlace');

m = mensajeSinIrpf({ ...base, caso: 'dos', bonoAero: 5027, bonoReforma: 8100 });
ok(/\*Opción 1 — Solo aerotermia: 5\.027 €\*/.test(m) && /\*Opción 2.*8\.100 €\*/.test(m) && !/IRPF/.test(m), 'dos opciones de verdad: las dos cifras, sin IRPF');

m = mensajeSinIrpf({ ...base, caso: 'cee', conCee: 3000, ceeNuevo: 4200 });
ok(/Opción A.*3\.000/.test(m) && /Opción B.*4\.200/.test(m) && /el edificio/.test(m) && !/IRPF/.test(m), 'CEE aportado: A y B, «el edificio» en terciario, sin IRPF');
ok(/Indicarnos si usamos tu CEE/.test(m), 'CEE aportado: el paso de elegir');

m = mensajeSinIrpf({ ...base, b2b: true, caso: 'reforma', bono: 7000, cliente: 'AUTOSERVICIO RODRIGUEZ SL', saludo: '¡Hola Pepe!' });
if (ver) console.log(`\n${m}\n`);
ok(/el cliente podría obtener esta ayuda/.test(m) && /\*BONO ENERGÉTICO CAE: 7\.000 €\*/.test(m) && /la reforma energética/.test(m) && /vuestra disposición/.test(m), 'al partner: tercera persona y reforma');

console.log(fallos ? `\n✗ ${fallos} fallo(s)` : '\n✓ todo correcto');
process.exit(fallos ? 1 : 0);
