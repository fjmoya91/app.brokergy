/**
 * Un mismo vecino que vuelve al funnel NO estrena oportunidad.
 *
 * El caso que lo motiva (26RES060_OP113 / OP179, medido el 11/09/2026): Manuela
 * rellenó el formulario público en junio y otra vez en septiembre. No dio email
 * ni DNI las dos veces — solo el móvil, una con "+34" y otra sin — así que el
 * upsert de clientes no la reconoció, le estrenó ficha, y la comprobación de
 * "¿ya hay un LEAD de esta vivienda?", que exigía el MISMO cliente_id, ya no
 * podía casar nada. Resultado: dos oportunidades sobre la misma vivienda.
 *
 *   node implementation/backend/scripts/test_lead_duplicado.js
 */

const { tlf9, mismoTitular } = require('../services/leadService');

let fallos = 0;
function comprobar(titulo, real, esperado) {
    const ok = real === esperado;
    if (!ok) fallos++;
    console.log(`${ok ? '  ✓' : '  ✗'} ${titulo}${ok ? '' : `  → esperaba ${esperado}, salió ${real}`}`);
}

console.log('\n── El teléfono, con prefijo o sin él, es el mismo ──');
comprobar('+34 y sin prefijo dan los mismos 9 dígitos', tlf9('+34672358309'), tlf9('672358309'));
comprobar('espacios y guiones no cuentan', tlf9('672 35 83 09'), '672358309');
comprobar('un teléfono a medias no empareja a nadie', tlf9('6723'), null);
comprobar('vacío no empareja a nadie', tlf9(''), null);
comprobar('null no empareja a nadie', tlf9(null), null);

console.log('\n── El caso real: Manuela, sin email ni DNI ──');
const junio = { email: null, dni: null, tlf: '+34672358309' };
const septiembre = { nombre: 'MANUELA', apellidos: 'Jiménez Bellon', email: null, dni: null, tlf: '672358309' };
comprobar('la reconoce por el móvil', mismoTitular(septiembre, junio), true);

console.log('\n── Email y DNI siguen mandando ──');
comprobar('mismo email aunque cambie el teléfono',
    mismoTitular({ email: 'A@Mail.com', tlf: '600000001' }, { email: 'a@mail.com', tlf: '600000002' }), true);
comprobar('mismo DNI aunque cambie el teléfono',
    mismoTitular({ dni: '12345678z', tlf: '600000001' }, { dni: '12345678Z', tlf: '600000002' }), true);

console.log('\n── Lo que NO puede casar ──');
comprobar('dos vecinos distintos de la misma vivienda',
    mismoTitular({ email: 'uno@mail.com', tlf: '600000001' }, { email: 'otro@mail.com', tlf: '600000002' }), false);
comprobar('sin ningún dato de contacto no se empareja a ciegas',
    mismoTitular({ email: null, dni: null, tlf: null }, { email: null, dni: null, tlf: null }), false);
comprobar('un cliente que no existe', mismoTitular(septiembre, null), false);
comprobar('emails distintos no casan por tener el teléfono vacío',
    mismoTitular({ email: 'uno@mail.com' }, { email: 'otro@mail.com' }), false);

console.log('\n── El teléfono NO identifica a una persona fuera de su vivienda ──');
console.log('  (medido: el 695615330 figura en 5 fichas de clientes distintos y el');
console.log('   610171667 en 4 — son móviles de instalador o comercial. Por eso esta');
console.log('   comparación solo se usa DENTRO de una misma referencia catastral, en');
console.log('   buscarLeadPrevio, y nunca para deduplicar la base de clientes.)');

console.log(fallos === 0 ? '\n✅ Todo correcto\n' : `\n❌ ${fallos} comprobación(es) fallida(s)\n`);
process.exit(fallos === 0 ? 0 : 1);
