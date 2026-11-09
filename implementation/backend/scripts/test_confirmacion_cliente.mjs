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
    assert.match(b, /3 a 5 kW/);
    assert.match(b, /enfría su estancia, no la casa/);
    assert.match(b, /como mucho el 100 %/);
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

// ─── Aires apuntados en la OPORTUNIDAD (2026-10-15) ──────────────────────────
console.log('\nAires de la oportunidad');
const { conAiresDeOportunidad, normalizarAiresOportunidad, airesDeOportunidad } = mod;
t('se normaliza { tiene, num } y lo sin contestar es null', () => {
    assert.deepEqual(normalizarAiresOportunidad({ tiene: true, num: '3' }), { tiene: true, num: 3 });
    assert.deepEqual(normalizarAiresOportunidad({ tiene: false, num: 4 }), { tiene: false, num: null });
    assert.deepEqual(normalizarAiresOportunidad({ tiene: true, num: 99 }), { tiene: true, num: null });
    assert.equal(normalizarAiresOportunidad({ tiene: null }), null);
    assert.equal(normalizarAiresOportunidad(null), null);
});
t('lo que dice el CLIENTE manda sobre lo de la oportunidad', () => {
    const c = conAiresDeOportunidad(conf206, { tiene: false });
    assert.equal(c, conf206);
    assert.equal(airesDeOportunidad(c), false);
});
t('sin respuesta del cliente, los de la oportunidad, marcados', () => {
    const c = conAiresDeOportunidad({ emisor: 'radiadores' }, { tiene: true, num: 2 });
    assert.equal(c.aire_acondicionado, true);
    assert.equal(c.num_aires, 2);
    assert.equal(c.emisor, 'radiadores');
    assert.ok(airesDeOportunidad(c));
    assert.ok(airesDeOportunidad(mod.sanearConfirmacion(c)), 'la marca sobrevive al saneado');
    assert.deepEqual(airesDeclarados({ confirmacion: c }), { tiene: true, num: 2 });
});
t('el formulario PÚBLICO no puede colar la marca', () => {
    const s = mod.sanearConfirmacion({ aire_acondicionado: true, num_aires: 1, aires_de: 'otra cosa' });
    assert.equal(s.aires_de, undefined);
});
t('encargo sin aceptación: no se pone en boca del cliente', () => {
    const b = bloqueConfirmacionCertificador({ confirmacion: conAiresDeOportunidad(null, { tiene: true, num: 3 }), cae: true });
    assert.match(b, /LO QUE CONSTA DE LA VIVIENDA/);
    assert.doesNotMatch(b, /CONFIRMADO EL CLIENTE/);
    assert.match(b, /Aire acondicionado \(apuntado en la oportunidad\): Sí · 3 aparatos/);
    assert.match(b, /sólo refrigeración/);
});
t('al aceptar, si el cliente dice otra cosa que la oportunidad, se avisa', () => {
    const l = mod.resumenConfirmacion({ ...conf206, supuesto: { aires: { tiene: true, num: 2 } } });
    const aires = l.find(r => r.tema === 'Aire acondicionado');
    assert.match(aires.aviso, /En la oportunidad constaba «Sí · 2 aparatos»/);
    const igual = mod.resumenConfirmacion({ ...conf206, supuesto: { aires: { tiene: true, num: 5 } } });
    assert.equal(igual.find(r => r.tema === 'Aire acondicionado').aviso, null);
});

// ─── El BONO SOCIAL (2026-11-09) ─────────────────────────────────────────────
// BOE-A-2026-23367, Tercero a/b: vulnerable = bono social ELÉCTRICO (RD 897/2017),
// salvo quien lo tiene SOLO por ser familia numerosa sin cumplir la renta.
console.log('\nBono social');
const {
    sanearBonoSocial, faltaBonoSocial, bonoSocialParaSubvenciones, vulnerableFmDeBono,
    preguntaBonoSocial, esNifDeEmpresa, sinBonoSocial, bonoDeclaradoDe, etiquetaBonoSocial,
    etiquetaBonoCliente, vulnerableDeConfirmacion,
} = mod;
const base = { emisor: 'radiadores', placas: 'no', aire_acondicionado: false };
t('a quién se le pregunta: RES060/RES093 completa, RES080 sin familia numerosa, terciario no', () => {
    assert.equal(preguntaBonoSocial('RES060'), 'fm');
    assert.equal(preguntaBonoSocial('RES093'), 'fm');
    assert.equal(preguntaBonoSocial('RES080'), 'anexo');
    assert.equal(preguntaBonoSocial('TER100'), null);
    assert.equal(preguntaBonoSocial('TER173'), null);
    assert.equal(preguntaBonoSocial(undefined), null);
});
t('con un CIF no se pregunta (una empresa no tiene bono social)', () => {
    assert.equal(esNifDeEmpresa('B12345678'), true);
    assert.equal(esNifDeEmpresa('b-1234567-j'), true);
    assert.equal(esNifDeEmpresa('12345678Z'), false);
    assert.equal(esNifDeEmpresa('X1234567L'), false);
    assert.equal(esNifDeEmpresa(''), false);
});
t('obligatoria SOLO si se pregunta; con el de la luz, el tipo y (en fm) la familia numerosa', () => {
    assert.equal(faltanConfirmacion(base).length, 0, 'sin pregunta no falta nada (página sin el bono)');
    assert.deepEqual(faltanConfirmacion(base, { bono: 'fm' }), ['si tienes el bono social']);
    assert.equal(faltanConfirmacion({ ...base, bono: 'no' }, { bono: 'fm' }).length, 0);
    assert.equal(faltanConfirmacion({ ...base, bono: 'no_se' }, { bono: 'fm' }).length, 0);
    assert.equal(faltanConfirmacion({ ...base, bono: 'electrico' }, { bono: 'fm' }).length, 2);
    assert.equal(faltanConfirmacion({ ...base, bono: 'electrico', bono_tipo: 'no_se' }, { bono: 'fm' }).length, 1);
    assert.equal(faltanConfirmacion({ ...base, bono: 'electrico', bono_tipo: 'no_se' }, { bono: 'anexo' }).length, 0);
    assert.equal(faltanConfirmacion({ ...base, bono: 'electrico', bono_tipo: 'severo', bono_fn: false }, { bono: 'fm' }).length, 0);
    assert.equal(faltaBonoSocial({}, null).length, 0);
});
t('saneado estricto: del formulario o de lo guardado, en MAYÚSCULAS también; tipo y F.N. solo con el de la luz', () => {
    assert.deepEqual(sanearBonoSocial({ bono: 'ELECTRICO', bono_tipo: 'Severo', bono_fn: 'false' }),
        { respuesta: 'electrico', tipo: 'severo', familia_numerosa: false });
    assert.deepEqual(sanearBonoSocial({ bono_social: { respuesta: 'TERMICO', tipo: 'severo', familia_numerosa: true } }),
        { respuesta: 'termico', tipo: null, familia_numerosa: null });
    assert.equal(sanearBonoSocial({ bono: 'quizas' }), null);
    assert.equal(sanearBonoSocial({ bono: 'electrico', bono_tipo: 'otro' }).tipo, null);
    assert.equal(sanearBonoSocial(null), null);
});
t('sanearConfirmacion lo guarda anidado, y sin pregunta no aparece', () => {
    const c = sanearConfirmacion({ ...base, bono: 'electrico', bono_tipo: 'vulnerable', bono_fn: false });
    assert.deepEqual(c.bono_social, { respuesta: 'electrico', tipo: 'vulnerable', familia_numerosa: false });
    assert.equal('bono_social' in sanearConfirmacion(base), false);
    assert.deepEqual(sanearConfirmacion(c).bono_social, c.bono_social, 'releer lo guardado da lo mismo');
});
t('Anexo I: el de la luz por su tipo (sin saber cuál, «vulnerables»); el térmico; no / no sé, nada', () => {
    const s = (bono, bono_tipo = '', bono_fn = null) => bonoSocialParaSubvenciones({ bono, bono_tipo, bono_fn });
    assert.deepEqual(s('electrico', 'vulnerable'), { percibe: true, tipos: ['electrico_vulnerable'] });
    assert.deepEqual(s('electrico', 'severo'), { percibe: true, tipos: ['electrico_vulnerable_severo'] });
    assert.deepEqual(s('electrico', 'exclusion'), { percibe: true, tipos: ['electrico_riesgo_exclusion'] });
    assert.deepEqual(s('electrico', 'no_se'), { percibe: true, tipos: ['electrico_vulnerable'] });
    assert.deepEqual(s('termico'), { percibe: true, tipos: ['termico'] });
    assert.equal(s('no'), null);
    assert.equal(s('no_se'), null);
    // Lo guardado ({ respuesta, … }) también vale, y los ids son los de subvenciones.js.
    assert.deepEqual(bonoSocialParaSubvenciones({ respuesta: 'electrico', tipo: 'severo', familia_numerosa: true }).tipos, ['electrico_vulnerable_severo']);
});
const subv = await import(pathToFileURL(path.join(aqui, '../../frontend/src/features/expedientes/logic/subvenciones.js')).href);
t('los ids que siembra son los del Anexo I (leerSubvenciones no los descarta)', () => {
    for (const tipo of ['vulnerable', 'severo', 'exclusion']) {
        const bs = bonoSocialParaSubvenciones({ bono: 'electrico', bono_tipo: tipo });
        const leido = subv.leerSubvenciones({ documentacion: { subvenciones: { bono_social: bs } } });
        assert.equal(leido.bono_social.percibe, true);
        assert.deepEqual(leido.bono_social.tipos, bs.tipos);
    }
    const st = subv.anexoIStates({ documentacion: { subvenciones: { bono_social: bonoSocialParaSubvenciones({ bono: 'termico' }) } } });
    assert.equal(st.bonoSocial[4], true, 'casilla del térmico');
    assert.equal(st.bonoSocial[5], false, '«Ninguno» ya no se marca');
});
t('vulnerable FM: el de la luz sin familia numerosa → sí, casilla «no es F.N.»', () => {
    const v = vulnerableFmDeBono({ bono: 'electrico', bono_tipo: 'vulnerable', bono_fn: false });
    assert.equal(v.vulnerable, true);
    assert.equal(v.anexo_b_casilla, 'no_fn');
    assert.equal(vulnerableFmDeBono({ bono: 'electrico', bono_tipo: 'no_se', bono_fn: false }).vulnerable, true);
});
t('vulnerable FM: familia numerosa con el severo o en exclusión (exigen renta) → sí, casilla «severo»', () => {
    for (const tipo of ['severo', 'exclusion']) {
        const v = vulnerableFmDeBono({ bono: 'electrico', bono_tipo: tipo, bono_fn: true });
        assert.equal(v.vulnerable, true);
        assert.equal(v.anexo_b_casilla, 'severo');
    }
});
t('vulnerable FM: familia numerosa con el de vulnerable (o sin saber cuál) → NO, pendiente de la renta', () => {
    for (const tipo of ['vulnerable', 'no_se']) {
        const v = vulnerableFmDeBono({ bono: 'electrico', bono_tipo: tipo, bono_fn: true });
        assert.equal(v.vulnerable, false);
        assert.match(v.pendiente, /renta/);
    }
});
t('vulnerable FM: el térmico solo, no; no / no sé, no (no sé deja pendiente)', () => {
    assert.equal(vulnerableFmDeBono({ bono: 'termico' }).vulnerable, false);
    assert.match(vulnerableFmDeBono({ bono: 'termico' }).texto, /térmico/);
    assert.equal(vulnerableFmDeBono({ bono: 'no' }).vulnerable, false);
    assert.equal(vulnerableFmDeBono({ bono: 'no_se' }).vulnerable, false);
    assert.ok(vulnerableFmDeBono({ bono: 'no_se' }).pendiente);
    assert.equal(vulnerableFmDeBono(null).vulnerable, false);
    assert.equal(vulnerableDeConfirmacion({ bono_social: { respuesta: 'electrico', tipo: 'severo', familia_numerosa: false } }), true);
    assert.equal(vulnerableDeConfirmacion(null), false);
});
t('etiquetas: para el staff y para el cliente', () => {
    assert.equal(etiquetaBonoSocial({ respuesta: 'electrico', tipo: 'severo', familia_numerosa: false }),
        'Bono social eléctrico · vulnerable severo · no es familia numerosa');
    assert.equal(etiquetaBonoSocial({ respuesta: 'termico' }), 'Solo el bono social térmico');
    assert.equal(etiquetaBonoSocial(null), null);
    assert.equal(etiquetaBonoCliente({ bono: 'electrico', bono_tipo: 'exclusion' }), 'Sí, el de la luz · en riesgo de exclusión social');
    assert.equal(etiquetaBonoCliente({ bono: 'electrico', bono_tipo: 'no_se' }), 'Sí, el de la luz');
    assert.equal(etiquetaBonoCliente({ bono: 'no' }), 'No');
});
t('el bono social NO llega al certificador: ni en el encargo ni por conAiresDeOportunidad', () => {
    const conBono = { ...conf206, bono_social: { respuesta: 'electrico', tipo: 'severo', familia_numerosa: false } };
    assert.equal('bono_social' in conAiresDeOportunidad(conBono, null), false);
    assert.equal('bono_social' in conAiresDeOportunidad({ emisor: 'suelo', bono_social: conBono.bono_social }, { tiene: true, num: 1 }), false);
    const b = bloqueConfirmacionCertificador({ confirmacion: conBono, cae: true });
    assert.doesNotMatch(b, /[Bb]ono/);
    assert.ok(mod.resumenConfirmacion(conBono).every(r => !/[Bb]ono/.test(r.tema)));
    assert.equal(sinBonoSocial(conf206), conf206, 'sin bono, el mismo objeto');
});
t('lo declarado en el expediente: el más reciente entre el expediente y su oportunidad', () => {
    const viejo = { fecha: '2026-11-01T10:00:00Z', bono_social: { respuesta: 'no' } };
    const nuevo = { fecha: '2026-11-09T10:00:00Z', bono_social: { respuesta: 'electrico', tipo: 'vulnerable', familia_numerosa: false } };
    const d = bonoDeclaradoDe({ instalacion: { confirmacion_cliente: viejo }, oportunidades: { datos_calculo: { confirmacion_cliente: nuevo } } });
    assert.equal(d.bono_social.respuesta, 'electrico');
    assert.equal(d.fecha, nuevo.fecha);
    assert.equal(bonoDeclaradoDe({ instalacion: { confirmacion_cliente: { emisor: 'suelo' } } }), null);
    assert.equal(bonoDeclaradoDe(null), null);
});
const conBonoForm = JSON.stringify({ ...base, bono: 'electrico', bono_tipo: 'severo', bono_fn: false, version: '2' });
const gRes = await confirmacionDeLaAceptacion(conBonoForm, dc, { programa: 'RES060', nif: '12345678Z' });
const gTer = await confirmacionDeLaAceptacion(conBonoForm, dc, { programa: 'TER100', nif: '12345678Z' });
const gCif = await confirmacionDeLaAceptacion(conBonoForm, dc, { programa: 'RES060', nif: 'B12345678' });
t('la aceptación lo guarda en confirmacion_cliente; ni en el terciario ni con un CIF', () => {
    assert.deepEqual(gRes.bono_social, { respuesta: 'electrico', tipo: 'severo', familia_numerosa: false });
    assert.equal(gRes.version, '2');
    assert.equal('bono_social' in gTer, false);
    assert.equal('bono_social' in gCif, false);
    assert.equal(gTer.emisor, 'radiadores', 'el resto de la confirmación sigue');
});
// La siembra del expediente NUEVO (createExpediente → semillaBonoSocial).
const { semillaBonoSocial } = require('../services/expedienteService.js');
const { sanearDatosFm } = require('../utils/viaFm.js');
const sRes = await semillaBonoSocial(gRes, 'RES060');
const sHib = await semillaBonoSocial(gRes, 'RES093');
const s080 = await semillaBonoSocial(gRes, 'RES080');
const sTer = await semillaBonoSocial(gRes, 'TER100');
const sFn = await semillaBonoSocial({ bono_social: { respuesta: 'electrico', tipo: 'vulnerable', familia_numerosa: true } }, 'RES060');
const sTerm = await semillaBonoSocial({ bono_social: { respuesta: 'termico' } }, 'RES060');
const sNada = [await semillaBonoSocial(null, 'RES060'), await semillaBonoSocial({ bono_social: { respuesta: 'no' } }, 'RES060')];
t('al crear el expediente: Anexo I + vulnerable FM con su casilla (RES060/RES093)', () => {
    assert.deepEqual(sRes.subvenciones, { bono_social: { percibe: true, tipos: ['electrico_vulnerable_severo'] } });
    assert.equal(sRes.via_fm.vulnerable, true);
    assert.equal(sRes.via_fm.anexo_b_casilla, 'no_fn');
    assert.equal(sRes.via_fm.por, 'aceptación del cliente');
    // La misma forma que escribe PUT /:id/via-fm/datos: resanear no cambia nada.
    const { at, por, ...resto } = sRes.via_fm;
    assert.deepEqual(sanearDatosFm(resto), resto);
    assert.equal(sHib.via_fm.vulnerable, true);
});
t('RES080: solo el Anexo I (la RES080_FM no tiene -S); terciario: nada', () => {
    assert.ok(s080.subvenciones);
    assert.equal('via_fm' in s080, false);
    assert.deepEqual(sTer, {});
});
t('familia numerosa con el de vulnerable: Anexo I sí, vulnerable NO (falta la renta); térmico: solo Anexo I', () => {
    assert.deepEqual(sFn.subvenciones.bono_social.tipos, ['electrico_vulnerable']);
    assert.equal('via_fm' in sFn, false);
    assert.deepEqual(sTerm, { subvenciones: { bono_social: { percibe: true, tipos: ['termico'] } } });
    assert.deepEqual(sNada, [{}, {}]);
});
console.log(`\n${ok} comprobaciones correctas`);
process.exit(0);
