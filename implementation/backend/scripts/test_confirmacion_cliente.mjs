// Lo que el cliente confirma de su vivienda al aceptar la propuesta CAE.
// Sin BD ni red: comprueba el módulo puro que comparten la página pública, el
// expediente y el aviso al equipo.
//
//   node implementation/backend/scripts/test_confirmacion_cliente.mjs

import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const mod = await import(pathToFileURL(path.join(aqui, '../../frontend/src/features/expedientes/logic/confirmacionCliente.js')).href);
const {
    CONFIRMACION_VACIA, faltanConfirmacion, sanearConfirmacion, contrasteEmisor,
    tipoEmisorDeDeclarado, fotovoltaicaResuelta, contrasteFotovoltaica, resumenConfirmacion,
} = mod;

let ok = 0;
const t = (nombre, fn) => { fn(); ok++; console.log('  ✓', nombre); };

console.log('Faltan por contestar');
t('vacío: faltan las tres preguntas', () => {
    assert.equal(faltanConfirmacion(CONFIRMACION_VACIA).length, 3);
});
t('con placas, la potencia o «No lo sé» es obligatoria', () => {
    const f = faltanConfirmacion({ emisor: 'radiadores', placas: 'si', aire_acondicionado: false });
    assert.equal(f.length, 1);
    assert.match(f[0], /potencia/);
    assert.equal(faltanConfirmacion({ emisor: 'radiadores', placas: 'si', placas_kwp_nose: true, aire_acondicionado: false }).length, 0);
    assert.equal(faltanConfirmacion({ emisor: 'radiadores', placas: 'si', placas_kwp: 3.5, aire_acondicionado: false }).length, 0);
});
t('sin placas no se pide potencia', () => {
    assert.equal(faltanConfirmacion({ emisor: 'no_se', placas: 'no', aire_acondicionado: false }).length, 0);
});
t('con aire acondicionado, cuántos aparatos', () => {
    const f = faltanConfirmacion({ emisor: 'suelo', placas: 'no', aire_acondicionado: true });
    assert.equal(f.length, 1);
    assert.match(f[0], /cuántos/);
    assert.equal(faltanConfirmacion({ emisor: 'suelo', placas: 'no', aire_acondicionado: true, num_aires: 2 }).length, 0);
});

console.log('Saneado (llega de un formulario público)');
t('valores desconocidos no pasan', () => {
    assert.equal(sanearConfirmacion({ emisor: 'hackeo', placas: 'quizás' }), null);
    assert.equal(sanearConfirmacion(null), null);
});
t('lee MAYÚSCULAS (lo que deja normalizeData) y coma decimal', () => {
    const s = sanearConfirmacion({ emisor: 'SUELO', placas: 'SI', placas_kwp: '3,5' });
    assert.equal(s.emisor, 'suelo');
    assert.deepEqual(s.fotovoltaica, { estado: 'si', potencia_kwp: 3.5, potencia_desconocida: false });
});
t('lee también la forma ya guardada', () => {
    const s = sanearConfirmacion({ emisor: 'radiadores', fotovoltaica: { estado: 'futuro', potencia_kwp: 9 } });
    assert.deepEqual(s.fotovoltaica, { estado: 'futuro', potencia_kwp: null, potencia_desconocida: false });
});
t('aire acondicionado: número entero y con tope; sin aire no hay número', () => {
    const s = sanearConfirmacion({ emisor: 'radiadores', aire_acondicionado: 'true', num_aires: '3' });
    assert.equal(s.aire_acondicionado, true);
    assert.equal(s.num_aires, 3);
    assert.equal(sanearConfirmacion({ emisor: 'radiadores', aire_acondicionado: true, num_aires: 500 }).num_aires, null);
    assert.equal(sanearConfirmacion({ emisor: 'radiadores', aire_acondicionado: false, num_aires: 3 }).num_aires, null);
});
t('«aparatos de aire» ya NO es un emisor (es una pregunta aparte)', () => {
    assert.equal(sanearConfirmacion({ emisor: 'aire' }), null);
});
t('placas sí sin cifra = potencia desconocida', () => {
    const s = sanearConfirmacion({ emisor: 'mixto', placas: 'si', placas_kwp_nose: true });
    assert.equal(s.fotovoltaica.potencia_desconocida, true);
});

console.log('Emisor: contraste con la simulación / el expediente');
t('radiadores sobre radiadores (baja temp. incluida) coincide', () => {
    assert.equal(contrasteEmisor('radiadores', 'radiadores_convencionales').estado, 'coincide');
    assert.equal(contrasteEmisor('radiadores', 'radiadores_baja_temp').estado, 'coincide');
    assert.equal(contrasteEmisor('radiadores', 'RADIADORES_CONVENCIONALES').estado, 'coincide');
});
t('suelo supuesto y radiadores reales: el SCOP real es MÁS BAJO', () => {
    const k = contrasteEmisor('radiadores', 'suelo_radiante');
    assert.equal(k.estado, 'difiere');
    assert.equal(k.sugerido, 'radiadores_convencionales');
    assert.match(k.texto, /MÁS BAJO/);
});
t('radiadores supuestos y suelo real: el SCOP real es MÁS ALTO', () => {
    const k = contrasteEmisor('suelo', 'radiadores_convencionales');
    assert.equal(k.estado, 'difiere');
    assert.equal(k.sugerido, 'suelo_radiante');
    assert.match(k.texto, /MÁS ALTO/);
});
t('las dos cosas: manda la temperatura de los radiadores', () => {
    assert.equal(tipoEmisorDeDeclarado('mixto'), 'radiadores_convencionales');
    assert.equal(contrasteEmisor('mixto', 'radiadores_convencionales').estado, 'coincide');
    const k = contrasteEmisor('mixto', 'suelo_radiante');
    assert.equal(k.estado, 'difiere');
    assert.equal(k.sugerido, 'radiadores_convencionales');
});
t('radiadores frente a un expediente de conductos: difiere', () => {
    const k = contrasteEmisor('radiadores', 'conductos');
    assert.equal(k.estado, 'difiere');
    assert.equal(k.sugerido, 'radiadores_convencionales');
});
t('«No lo sé» no es una diferencia, pero se dice', () => {
    const k = contrasteEmisor('no_se', 'suelo_radiante');
    assert.equal(k.estado, 'sin_dato');
    assert.match(k.texto, /visita/);
});
t('sin emisor en la simulación, se dice', () => {
    const k = contrasteEmisor('radiadores', null, 'la propuesta');
    assert.equal(k.estado, 'difiere');
    assert.match(k.texto, /no declaraba/);
});

console.log('Placas: lo que manda');
t('manda lo que dice el cliente', () => {
    assert.deepEqual(fotovoltaicaResuelta({ estado: 'si', potencia_kwp: 4 }, { estado: 'no' }),
        { estado: 'si', potencia_kwp: 4, potencia_desconocida: false });
});
t('dice SÍ sin saber la potencia: se conserva la que ya tenía la simulación', () => {
    assert.deepEqual(fotovoltaicaResuelta({ estado: 'si' }, { estado: 'si', potencia_kwp: 3.2 }),
        { estado: 'si', potencia_kwp: 3.2, potencia_desconocida: false });
});
t('sin respuesta del cliente, lo de siempre', () => {
    assert.deepEqual(fotovoltaicaResuelta(null, { estado: 'futuro' }),
        { estado: 'futuro', potencia_kwp: null, potencia_desconocida: false });
});
t('contraste de placas', () => {
    assert.equal(contrasteFotovoltaica({ estado: 'si', potencia_kwp: 3 }, { estado: 'no' }).estado, 'difiere');
    assert.equal(contrasteFotovoltaica({ estado: 'no' }, { estado: null }).estado, 'coincide');
    assert.equal(contrasteFotovoltaica({ estado: 'si', potencia_kwp: 3 }, { estado: 'si', potencia_kwp: 5 }).estado, 'difiere');
});

console.log('Resumen para el aviso al equipo');
t('tres líneas, con el aviso donde no casa', () => {
    const l = resumenConfirmacion({
        emisor: 'suelo', fotovoltaica: { estado: 'si', potencia_kwp: 3.5 },
        aire_acondicionado: true, num_aires: 2,
        supuesto: { tipo_emisor: 'radiadores_convencionales', fotovoltaica: { estado: 'no' } },
    });
    assert.equal(l.length, 3);
    assert.equal(l[0].valor, 'Suelo radiante');
    assert.ok(l[0].aviso);
    assert.equal(l[1].valor, 'Sí · 3,5 kWp');
    assert.ok(l[1].aviso);
    assert.equal(l[2].valor, 'Sí · 2 aparatos');
});
t('todo coincide: sin avisos', () => {
    const l = resumenConfirmacion({
        emisor: 'radiadores', fotovoltaica: { estado: 'no' },
        supuesto: { tipo_emisor: 'radiadores_convencionales', fotovoltaica: { estado: 'no' } },
    });
    assert.ok(l.every(x => !x.aviso));
});


// ─── Lo que guarda la ruta de aceptación (/api/public/aceptar) ──────────────
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
process.env.WHATSAPP_ENABLED = 'false';
const { confirmacionDeLaAceptacion } = require('../routes/public.js');

console.log('\nLo que guarda la aceptación');
const dc = { inputs: { emitterType: 'radiadores_convencionales' }, landing_funnel: { placas_estado: 'futuro' } };
const g = await confirmacionDeLaAceptacion(JSON.stringify({ emisor: 'suelo', placas: 'si', placas_kwp: '4,2', aire_acondicionado: true, num_aires: 2, version: '1' }), dc);
t('llega como JSON del multipart y se sanea', () => {
    assert.equal(g.emisor, 'suelo');
    assert.deepEqual(g.fotovoltaica, { estado: 'si', potencia_kwp: 4.2, potencia_desconocida: false });
    assert.equal(g.version, '1');
    assert.equal(g.aire_acondicionado, true);
    assert.equal(g.num_aires, 2);
    assert.ok(g.fecha);
});
t('lleva al lado lo que se SUPUSO al simular (funnel si no hay inputs)', () => {
    assert.equal(g.supuesto.tipo_emisor, 'radiadores_convencionales');
    assert.equal(g.supuesto.fotovoltaica.estado, 'futuro');
});
const sinConf = [
    await confirmacionDeLaAceptacion(undefined, dc),
    await confirmacionDeLaAceptacion('{no es json', dc),
    await confirmacionDeLaAceptacion(JSON.stringify({ emisor: 'x' }), dc),
];
t('sin confirmación (página antigua) o basura: null, y se acepta igual', () => {
    assert.deepEqual(sinConf, [null, null, null]);
});

// ─── El ENCARGO del CEE al certificador (2026-09-29) ─────────────────────────
console.log('\nPara el certificador');
const { bloqueConfirmacionCertificador, airesDeclarados, repartoCien, textoReparto } = mod;
const conf206 = { emisor: 'radiadores', fotovoltaica: { estado: 'si', potencia_kwp: 6 },
                  aire_acondicionado: true, num_aires: 5 };
t('el reparto de 100 entre N aparatos suma siempre 100', () => {
    assert.deepEqual(repartoCien(5), [20, 20, 20, 20, 20]);
    assert.deepEqual(repartoCien(3), [34, 33, 33]);
    for (let n = 1; n <= 20; n++) assert.equal(repartoCien(n).reduce((a, b) => a + b, 0), 100);
    assert.equal(textoReparto(5), '20 % cada uno');
    assert.equal(textoReparto(3), '34, 33 y 33 %');
});
t('CAE (26RES060_206): radiadores, 6 kWp y 5 aires, con cómo declararlos', () => {
    const b = bloqueConfirmacionCertificador({ confirmacion: conf206, cae: true });
    assert.match(b, /CONFIRMADO EL CLIENTE/);
    assert.match(b, /Calefacción: Radiadores/);
    assert.match(b, /Aire acondicionado: Sí · 5 aparatos/);
    assert.match(b, /sólo refrigeración/);
    assert.match(b, /20 % cada uno/);
    assert.match(b, /autoconsumo/);
});
t('CEE directo (2026CEE_60): el cuestionario, y frío y calor si es para la deducción', () => {
    const q = { calefaccion: 'gas', acs: 'misma_caldera', termo_extra: false,
                aire_acondicionado: true, num_aires: 6, placas: 'no' };
    const b = bloqueConfirmacionCertificador({ cuestionario: q, cae: false });
    assert.match(b, /CONTESTADO EL CLIENTE/);
    assert.match(b, /6 aparatos/);
    assert.match(b, /calefacción y refrigeración/);
    assert.deepEqual(airesDeclarados({ cuestionario: q }), { tiene: true, num: 6 });
});
t('sin nada contestado, el bloque va vacío (el encargo no cambia)', () => {
    assert.equal(bloqueConfirmacionCertificador({ confirmacion: null, cae: true }), '');
    assert.equal(bloqueConfirmacionCertificador({ cuestionario: null, cae: false }), '');
});
t('sin aires, no se habla de aires', () => {
    const b = bloqueConfirmacionCertificador({ confirmacion: { ...conf206, aire_acondicionado: false,
                                                                 num_aires: null }, cae: true });
    assert.doesNotMatch(b, /refrigeración/);
    assert.match(b, /Aire acondicionado: No/);
});
console.log(`\n${ok} comprobaciones correctas`);
process.exit(0);
