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
const { identificar, contieneNumero, representantesDe, firmantesEsperados } = require('../services/firmadosSo');
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

console.log('\n🔎 Comparar el certificado con quien se espera');
const cert = { nombre: 'PEDRO JOSE LOPEZ MONTERO', nif: '06239730Z', cn: '06239730Z PEDRO JOSE LOPEZ (R: A13035266)' };
ok(firmanteCoincide(cert, { nombre: 'PEDRO JOSÉ LÓPEZ MONTERO', nif: '06239730Z' }).por === 'nif', 'el NIF es prueba y manda');
ok(firmanteCoincide(cert, { nombre: 'PEDRO JOSÉ LÓPEZ MONTERO' }).coincide === true, 'sin NIF, casa por nombre aunque el certificado no lleve tildes');
ok(firmanteCoincide(cert, { nombre: 'FRANCISCO JAVIER MOYA LÓPEZ' }).coincide === false, 'otra persona no cuela por compartir un apellido');
ok(firmanteCoincide(cert, { nombre: 'Pedro', nif: '06282551D' }).coincide === false, 'con NIF distinto no vale que el nombre suene');
ok(normalizarNombre('LÓPEZ MONTERO, Pedro-José') === 'LOPEZ MONTERO PEDRO JOSE', 'normalización de nombres');

// Los apoderados del S.O. y a quién se le exige la firma de cada documento.
// Aquí vive el fallo de hoy: el export apuntaba a un nombre que ya no existía
// (`representanteDe`), así que el módulo ENTERO no se podía cargar y toda la
// subida de firmados respondía "representanteDe is not defined". Este test
// tampoco arrancaba, por eso no lo cazó: exportar y probar van juntos.
(async () => {
    console.log('\n🔎 Los apoderados salen de la ficha del S.O.');
    const soPrincipal = { nombre_responsable: 'PEDRO JOSÉ', apellidos_responsable: 'LÓPEZ MONTERO', nif_responsable: '06239730Z' };
    const reps = await representantesDe(soPrincipal);
    ok(reps.length >= 1 && reps[0].nif === '06239730Z', 'sin representante distinto manda el responsable');
    const repsDistinto = await representantesDe({ nombre_responsable: 'A', representante_distinto: true, representante_nombre: 'PEDRO', representante_apellidos: 'LÓPEZ', representante_dni: '999Z' });
    ok(repsDistinto.length >= 1 && repsDistinto[0].nif === '999Z', 'con representante distinto manda el representante');
    const repsVarios = await representantesDe({ ...soPrincipal, representantes: [{ nombre: 'JESÚS ANTONIO ALMODÓVAR FUENTES', nif: '06236833S', cargo: 'Director de operaciones' }] });
    ok(repsVarios.length === 2 && repsVarios.some(r => r.nif === '06236833S'), 'los apoderados adicionales se suman al principal');
    ok(!await representantesDe(null).then(r => r.length), 'sin ficha de S.O. no se inventa ningún apoderado');

    console.log('\n🔎 A quién se le exige la firma de cada documento');
    const TODOS = [{ nombre: 'PEDRO JOSÉ LÓPEZ MONTERO', nif: '06239730Z' }, { nombre: 'JESÚS ANTONIO ALMODÓVAR FUENTES', nif: '06236833S' }];
    const BROKERGY = { nombre: 'FRANCISCO JAVIER MOYA LÓPEZ', nif: '06282551D' };

    // Sin sello, vale CUALQUIERA de los apoderados: el papel no nombra a ninguno.
    const libre = firmantesEsperados('ficha_a', TODOS, BROKERGY, { nombre: '', nif: '' });
    ok(libre.length === 1 && libre[0].opciones.length === 2, 'sin sello se admite a cualquiera de los dos apoderados');

    // Con sello manda ÉSE: es el nombre IMPRESO en el papel, y una firma de otro
    // apoderado sobre un documento que nombra al primero es lo que hay que mirar.
    const sellada = firmantesEsperados('ficha_a', TODOS, BROKERGY, { nombre: 'JESÚS ANTONIO ALMODÓVAR FUENTES', nif: '06236833S' });
    ok(sellada.length === 1 && sellada[0].opciones.length === 1 && sellada[0].nif === '06236833S',
        'con sello solo vale el apoderado al que se le pidió');

    // El Anexo I lo firman los DOS: el S.O. y Brokergy.
    const anexo = firmantesEsperados('anexo_i', TODOS, BROKERGY, { nombre: '', nif: '' });
    ok(anexo.length === 2 && anexo.some(e => e.rol === 'Brokergy'), 'el Anexo I espera además la firma de Brokergy');
    ok(firmantesEsperados('ficha_a', TODOS, BROKERGY, {}).every(e => e.rol !== 'Brokergy'), 'una ficha NO espera la firma de Brokergy');

    console.log(fallos ? `\n❌ ${fallos} comprobación(es) han fallado\n` : '\n✅ Todo correcto\n');
    process.exit(fallos ? 1 : 0);
})();
