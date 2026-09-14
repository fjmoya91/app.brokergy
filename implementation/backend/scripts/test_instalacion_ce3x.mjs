// ─────────────────────────────────────────────────────────────────────────────
// Lo que se teclea en INSTALACIONES tiene que llegar al equipo que se escribe.
//
// De aquí sale un dato que va dentro de un certificado: qué caldera hay, con qué
// combustible y qué parte de la demanda cubre. Lo que la app deriva del
// expediente está probado por otro lado; esto prueba lo OTRO — que lo que pone
// una persona mande sobre lo derivado, que se pueda rescatar un equipo que no se
// escribía, y que nada se invente cuando faltan datos.
//
//     node implementation/backend/scripts/test_instalacion_ce3x.mjs
// ─────────────────────────────────────────────────────────────────────────────
import { equipoAnadido, equipoConAjustes }
    from '../../frontend/src/features/cee-envolvente/logic/fichaCe3x.js';

let fallos = 0;
const ok = (cond, que) => { if (!cond) { fallos++; console.log('  ✗ ' + que); }
                            else console.log('  ✓ ' + que); };

const BASE = {
    slot: 'mixto2', nombre: 'CALDERA ROCA P-30-4', generador: 'Caldera Estándar',
    combustible: 'Carbón', aislamiento: 'Sin aislamiento', rend_combustion: '60',
    potencia: '15.3', superficie_calefaccion: 165, superficie_acs: 165,
};

console.log('\n1. Sin ajustes, el equipo NO cambia');
{
    const { equipo, avisos } = equipoConAjustes(BASE, {}, { superficie: 165 });
    ok(equipo.combustible === 'Carbón' && equipo.potencia === '15.3', 'sale igual');
    ok(avisos.length === 0, 'y sin avisos');
}

console.log('\n2. Lo tecleado manda, y se dice');
{
    const { equipo, avisos } = equipoConAjustes(BASE, {
        combustible: 'Gas Natural', potencia: '24', acumulacion: true,
        litros_acumulacion: '150', pct_acs: '50',
    }, { superficie: 165 });
    ok(equipo.combustible === 'Gas Natural', 'el combustible');
    ok(equipo.potencia === '24', 'la potencia');
    ok(equipo.acumulacion?.volumen === 150, 'el depósito de 150 l');
    ok(equipo.pct_acs === '50', 'el 50 % de ACS');
    ok(avisos.some(a => a.includes('a mano el certificador')), 'consta que lo puso él');
    ok(avisos.some(a => a.includes('50 % de la demanda de ACS')), 'y que falta el otro 50 %');
}

console.log('\n3. Un equipo de SOLO calefacción pierde el ACS y el depósito');
{
    const { equipo } = equipoConAjustes({ ...BASE, acumulacion: { volumen: 150 } },
        { slot: 'calefaccion' }, { superficie: 165 });
    ok(equipo.slot === 'calefaccion', 'el slot');
    ok(equipo.superficie_acs === undefined, 'sin superficie de ACS');
    ok(equipo.acumulacion === undefined, 'sin depósito');
}

console.log('\n4. Se RESCATA un equipo que no se escribía (falta la potencia)');
{
    const { equipo } = equipoConAjustes(null, {
        nombre: 'CALDERA ROCA', generador: 'Caldera Estándar',
        combustible: 'Gasóleo-C', potencia: '20', rend_combustion: '75',
    }, { superficie: 165 });
    ok(!!equipo, 'ahora sí se escribe');
    ok(equipo.superficie_calefaccion === 165, 'con la superficie del edificio');
}

console.log('\n5. Sin los cuatro imprescindibles, NO se inventa nada');
{
    const { equipo, avisos } = equipoConAjustes(null, { nombre: 'ALGO' }, { superficie: 165 });
    ok(equipo === null, 'sigue sin escribirse');
    ok(avisos.some(a => a.includes('faltan')), 'y se dice qué falta');
}

console.log('\n6. Lo NO comprobado en un .cex real se avisa');
{
    const { avisos } = equipoConAjustes(BASE, { generador: 'Caldera Condensación' },
                                        { superficie: 165 });
    ok(avisos.some(a => a.includes('no se ha comprobado')), 'sale el aviso');
    const limpio = equipoConAjustes(BASE, { generador: 'Caldera Estándar' }, { superficie: 165 });
    ok(!limpio.avisos.some(a => a.includes('no se ha comprobado')), 'y con una medida, no');
}

console.log('\n7. Un TERMO añadido: la caldera da la mitad del agua y él la otra');
{
    const { equipo } = equipoAnadido({
        slot: 'ACS', nombre: 'TERMO ACS', pct_acs: '50', superficie_acs: '82.5',
    }, { superficie: 165 });
    ok(equipo.slot === 'ACS', 'es un equipo de ACS');
    ok(equipo.generador === 'Efecto Joule', 'con el generador que le toca por defecto');
    ok(equipo.combustible === 'Electricidad', 'y su combustible');
    ok(equipo.rend_nominal === '100.0', 'y su rendimiento nominal');
    ok(equipo.superficie_acs === 82.5 && equipo.pct_acs === '50', 'con su mitad del ACS');
    ok(equipo.potencia === undefined, 'y SIN potencia: eso es de una caldera');
}

console.log('\n8. Un AIRE ACONDICIONADO añadido');
{
    const { equipo } = equipoAnadido({
        slot: 'refrigeracion', nombre: 'AIRE ACONDICIONADO', pct_refrigeracion: '10',
        superficie_refrigeracion: '16.5',
    }, { superficie: 165 });
    ok(equipo.generador === 'Maquina frigorífica', 'el generador, como lo escribe el fichero');
    ok(equipo.rend_nominal === '250.0', 'y su rendimiento nominal');
    ok(equipo.superficie_acs === undefined, 'sin nada de ACS');
}

console.log('\n9. Un equipo añadido a medias NO se escribe');
{
    const { equipo, avisos } = equipoAnadido({ slot: 'ACS' }, { superficie: 165 });
    ok(equipo === null, 'no se escribe');
    ok(avisos.some(a => a.includes('faltan nombre')), 'y se dice qué le falta');
    const caldera = equipoAnadido({ slot: 'calefaccion', nombre: 'OTRA CALDERA',
                                    combustible: 'Gas Natural' }, { superficie: 165 });
    ok(caldera.equipo === null, 'una caldera sin potencia tampoco');
    ok(caldera.avisos.some(a => a.includes('potencia nominal')), 'y se dice por qué');
}

console.log(fallos ? `\n${fallos} FALLOS\n` : '\nTodo correcto\n');
process.exit(fallos ? 1 : 0);
