#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * A QUÉ DOCUMENTO va cada firmado que devuelve el S.O. Sin base de datos, sin
 * Drive y sin red: son funciones puras.
 *
 * Lo que vigila es el fallo que no se ve: el nº de expediente es un PREFIJO de
 * otro (26RES060_10 dentro de 26RES060_105), así que un emparejamiento por
 * "contiene" registra la ficha firmada en el expediente del vecino — y de ahí
 * viaja al ZIP y al verificador sin que nadie lo note.
 *
 *   node scripts/test_firmados_so.js
 * ─────────────────────────────────────────────────────────────────────────────
 */
const { identificar, contieneNumero, representanteDe } = require('../services/firmadosSo');
const { firmanteCoincide, normalizarNombre } = require('../utils/firmasPdf');

let fallos = 0;
const ok = (cond, texto) => {
    console.log(`${cond ? '  ✓' : '  ✗'} ${texto}`);
    if (!cond) fallos++;
};

// Los documentos que el S.O. tiene que firmar en un lote de cinco actuaciones.
const CANDIDATOS = [
    { key: 'anexo_i', file_name: '2. Anexo I LOTE-2026-004.pdf' },
    { key: 'ficha_a', expediente_id: 'a', file_name: '26RES060_10 - Ficha RES060.pdf' },
    { key: 'ficha_b', expediente_id: 'b', file_name: '26RES060_105 - Ficha RES060_rev1.pdf' },
    { key: 'ficha_c', expediente_id: 'c', file_name: '26RES080_53 - Ficha RES080.pdf' },
    { key: 'solicitud_verificacion', file_name: '1. Solicitud de Verificación LOTE-2026-004.pdf' },
];
const NUMS = { a: '26RES060_10', b: '26RES060_105', c: '26RES080_53' };
const id = (nombre, asignado) => identificar(nombre, CANDIDATOS, NUMS, 'LOTE-2026-004').key || asignado || null;

console.log('\n🔎 El nº de expediente que es PREFIJO de otro');
ok(contieneNumero('26RES060105FICHARES060', '26RES060_105') === true, '26RES060_105 se reconoce en su propia ficha');
ok(contieneNumero('26RES060105FICHARES060', '26RES060_10') === false, '26RES060_10 NO se cuela en la ficha del _105');
ok(contieneNumero('26RES06010FICHARES060', '26RES060_10') === true, '26RES060_10 se reconoce en la suya');
ok(id('26RES060_10 - Ficha RES060_fdo.pdf') === 'ficha_a', 'la ficha del _10 va a su expediente');
ok(id('26RES060_105 - Ficha RES060_rev1_fdo.pdf') === 'ficha_b', 'la ficha del _105 va al suyo');

console.log('\n🔎 Los nombres con los que vuelven de verdad');
for (const [nombre, esperado] of [
    ['26RES080_53 - Ficha RES080 (1).pdf', 'ficha_c'],                       // copia descargada dos veces
    ['26RES080_53 - Ficha RES080_signed.pdf', 'ficha_c'],                    // sufijo del firmador
    ['E1-3-1 - 26RES060_105 - Ficha RES060_rev1_fdo.pdf', 'ficha_b'],        // ya renombrado a mano
    ['LOTE-2026-004 - Anexo I Listado Cesion_fdo.pdf', 'anexo_i'],
    ['ANEXO I LISTADO CESION firmado.pdf', 'anexo_i'],
    ['1. Solicitud de Verificación LOTE-2026-004_fdo.pdf', 'solicitud_verificacion'],
]) ok(id(nombre) === esperado, `"${nombre}" → ${esperado}`);

console.log('\n🔎 Lo que NO se adivina');
ok(id('firmado.pdf') === null, 'un nombre que no dice nada se devuelve sin asignar');
ok(id('documento (2).pdf') === null, 'tampoco se elige "el primero que quede libre"');

console.log('\n🔎 El representante legal sale de la ficha del S.O.');
ok(representanteDe({ nombre_responsable: 'PEDRO JOSÉ', apellidos_responsable: 'LÓPEZ MONTERO', nif_responsable: '06239730Z' }).nif === '06239730Z',
    'sin representante distinto manda el responsable');
ok(representanteDe({ nombre_responsable: 'A', representante_distinto: true, representante_nombre: 'PEDRO', representante_apellidos: 'LÓPEZ', representante_dni: '999Z' }).nif === '999Z',
    'con representante distinto manda el representante');

console.log('\n🔎 Comparar el certificado con quien se espera');
const cert = { nombre: 'PEDRO JOSE LOPEZ MONTERO', nif: '06239730Z', cn: '06239730Z PEDRO JOSE LOPEZ (R: A13035266)' };
ok(firmanteCoincide(cert, { nombre: 'PEDRO JOSÉ LÓPEZ MONTERO', nif: '06239730Z' }).por === 'nif', 'el NIF es prueba y manda');
ok(firmanteCoincide(cert, { nombre: 'PEDRO JOSÉ LÓPEZ MONTERO' }).coincide === true, 'sin NIF, casa por nombre aunque el certificado no lleve tildes');
ok(firmanteCoincide(cert, { nombre: 'FRANCISCO JAVIER MOYA LÓPEZ' }).coincide === false, 'otra persona no cuela por compartir un apellido');
ok(firmanteCoincide(cert, { nombre: 'Pedro', nif: '06282551D' }).coincide === false, 'con NIF distinto no vale que el nombre suene');
ok(normalizarNombre('LÓPEZ MONTERO, Pedro-José') === 'LOPEZ MONTERO PEDRO JOSE', 'normalización de nombres');

console.log(fallos ? `\n❌ ${fallos} comprobación(es) han fallado\n` : '\n✅ Todo correcto\n');
process.exit(fallos ? 1 : 0);
