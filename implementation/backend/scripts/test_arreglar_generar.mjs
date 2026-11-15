/**
 * Cuando el `.cex` NO sale, el asistente dice cómo arreglarlo
 * (`logic/arreglarGenerar.js`), y entiende «déjalo listo para firmar»
 * (`pideListo`, `soloOrden` de `logic/asistenteEnvolvente.js`).
 *
 * Una casa con una partición pasada a FACHADA sin rumbo (PVBS1, como en
 * 2026EXT_3), una pared dibujada sin trazo y sin rumbo, la entrada sin señalar
 * y un «! falta…» de otra pestaña. Sin red y sin Claude.
 *
 *   node implementation/backend/scripts/test_arreglar_generar.mjs
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const LOGIC = path.join(AQUI, '../../frontend/src/features/cee-envolvente/logic');
const de = async (f) => import(pathToFileURL(path.join(LOGIC, f)).href);
const G = await de('arreglarGenerar.js');
const A = await de('asistenteEnvolvente.js');
const { faltaParaGenerar } = await de('pendientes.js');
const { tipoDe, esFuera } = await de('tiposPared.js');
const { rumboDe } = await de('senalado.js');

let ok = 0;
const prueba = (nombre, fn) => {
    try { fn(); ok += 1; console.log(`  ✓ ${nombre}`); }
    catch (e) { console.error(`  ✗ ${nombre}\n    ${e.message}`); process.exitCode = 1; }
};

// La MISMA regla que `necesitaRumbo` (usePlanoEnvolvente.js, que es un hook y no
// se importa en Node).
const necesitaRumbo = (m) => !esFuera(m) && tipoDe(m) === 'FACHADA' && !rumboDe(m);

const PLANO = () => {
    const lista = [
        { id: 'FBE1', tipo: 'FACHADA', orientacion: 'N', largo: 12, svg: [[0, 0], [12, 0]], huecos: [] },
        // Una partición que separa la casa del garaje, pasada a fachada a mano:
        // vertical en el lienzo, así que da al este o al oeste.
        { id: 'PVBS1', tipo: 'PARTICION_VERTICAL', tipo_manual: 'FACHADA', largo: 9,
          svg: [[5, 0], [5, 9]], huecos: [] },
        // Una pared sin trazo del que sacar los lados: no hay botones que ofrecer.
        { id: 'PBX1', tipo: 'PARTICION_VERTICAL', tipo_manual: 'FACHADA', largo: 3, huecos: [] },
        { id: 'MBE1', tipo: 'MEDIANERA', largo: 9, svg: [[0, 9], [0, 0]], huecos: [] },
    ];
    return { plantas: [{ id: 'pb', nivel: 0, nombre: 'Planta baja', muros: lista }],
             muros: Object.fromEntries(lista.map(m => [m.id, m])), zonas: [], catalogo: [],
             elegidas: null, fase: 'inicial', defecto: null, sel: null };
};
const pestanas = [
    { id: 'instalaciones', etiqueta: 'Instalaciones', estado: '! falta el generador', tono: 'aviso' },
    { id: 'generales', etiqueta: 'Datos generales', estado: '2 sin rellenar', tono: 'aviso' },
];

console.log('Lo que hay que arreglar');
prueba('cada fachada sin rumbo con trazo es una pregunta con sus DOS lados; lo demás que bloquea, con su «Ir»', () => {
    const ctx = PLANO();
    const falta = faltaParaGenerar({ muros: ctx.muros, lucernarios: {}, plantas: ctx.plantas,
                                     entrada: null, ventanas: true, pestanas, necesitaRumbo });
    const { preguntas, otros } = G.arreglosParaGenerar({ falta, muros: ctx.muros });
    assert.deepEqual(preguntas.map(p => p.muro), ['PVBS1']);
    assert.deepEqual(preguntas[0].opciones, ['E', 'O']);
    assert.equal(preguntas[0].pared, 'PVBS1');
    assert.deepEqual(preguntas[0].ir, { muro: 'PVBS1', planta: undefined });
    // Sin trazo, la pared va a «otros» (se arregla en su panel); y la entrada y
    // el «! falta…» de Instalaciones también. «2 sin rellenar» no bloquea.
    assert.deepEqual(otros.map(o => o.clave).sort(), ['entrada', 'pestana|instalaciones', 'rumbo|PBX1']);
    assert.ok(otros.find(o => o.clave === 'pestana|instalaciones').ir.apartado === 'instalaciones');
});
prueba('sin nada que lo pare, no hay ni preguntas ni otros (el motivo irá a Claude)', () => {
    const { preguntas, otros } = G.arreglosParaGenerar({ falta: { items: [
        { clave: 'ventanas', grupo: 'aviso', texto: 'Di cómo son las ventanas' }] }, muros: {} });
    assert.equal(preguntas.length + otros.length, 0);
    assert.deepEqual(G.arreglosParaGenerar({}), { preguntas: [], otros: [] });
});

console.log('Contestar');
prueba('las respuestas son las operaciones de siempre: se validan y ponen el rumbo de la persona', () => {
    const ctx = PLANO();
    const preguntas = [{ clave: 'rumbo|PVBS1', muro: 'PVBS1', pared: 'PVBS1', opciones: ['E', 'O'] },
                       { clave: 'rumbo|OTRA', muro: 'OTRA', pared: 'OTRA', opciones: ['N', 'S'] }];
    const ops = G.operacionesDeRumbos(preguntas, { 'rumbo|PVBS1': 'O' });
    assert.deepEqual(ops, [{ op: 'cambiar_pared', pared: 'PVBS1', rumbo: 'O' }]);   // solo la contestada
    const v = A.validarOperaciones(ops, ctx);
    assert.deepEqual(v.errores, []);
    assert.equal(v.pasos.length, 1);
    assert.match(v.pasos[0].texto, /PVBS1: da al O/);
    const muros = A.transformarMuros(ctx.muros, v.pasos);
    assert.equal(muros.PVBS1.orientacion_manual, 'O');
    assert.ok(!necesitaRumbo(muros.PVBS1), 'ya no le falta el rumbo');
    assert.equal(ctx.muros.PVBS1.orientacion_manual, undefined);   // el original no se toca
});

console.log('El motivo del motor');
prueba('va a Claude entero y recortado, y solo un 422 es «se puede arreglar»', () => {
    const t = G.textoDelFallo('PVBS1 se escribe como FACHADA y no tiene orientacion.\n Las particiones…');
    assert.match(t, /^Al generar el \.cex ha fallado: «PVBS1 se escribe como FACHADA y no tiene orientacion\. Las particiones…»/);
    assert.ok(G.textoDelFallo('x'.repeat(5000)).length < 800);
    assert.ok(G.esFalloDelMotor({ original: { response: { status: 422 } } }));
    assert.ok(G.esFalloDelMotor({ response: { status: 422 } }));
    assert.ok(!G.esFalloDelMotor({ original: { response: { status: 500 } } }));
    assert.ok(!G.esFalloDelMotor({ original: { code: 'ERR_NETWORK' } }));
    assert.ok(!G.esFalloDelMotor(null));
    assert.equal(G.MAX_REINTENTOS_SOLOS, 2);
});

console.log('«Déjalo listo para firmar»');
prueba('pideListo: el visto bueno, dicho de varias formas', () => {
    for (const t of ['déjalo listo para firmar', 'Dale el visto bueno', 'déjamelo listo',
                     'y que quede listo para la firma', 'PVBS1 da al sur y déjalo listo',
                     'ponlo para que lo firme']) assert.ok(A.pideListo(t), t);
    for (const t of ['genera el CEE', 'la V3 es de PVC', 'está listo el plano?', 'bueno, vale'])
        assert.ok(!A.pideListo(t), t);
});
prueba('soloOrden: una orden sin nada que corregir no pasa por Claude', () => {
    for (const t of ['genéralo', 'Regenéralo, por favor', 'déjalo listo para firmar',
                     'genéralo y déjalo listo para firmar', 'dale el visto bueno', 'vale, genera el cee',
                     'haz el certificado']) assert.ok(A.soloOrden(t), t);
    for (const t of ['PVBS1 da al sur y genéralo', 'la V3 es de PVC y déjalo listo para firmar',
                     'quita la aerotermia', 'el garaje llega al fondo, y genéralo']) assert.ok(!A.soloOrden(t), t);
});

console.log(`\n${ok} pruebas bien${process.exitCode ? ', ALGUNA MAL' : ''}.`);
