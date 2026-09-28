#!/usr/bin/env node
/**
 * El PROGRAMA de CE3X —residencial, pequeño o gran terciario— en la ficha.
 *
 *   node implementation/backend/scripts/test_tipo_ce3x.mjs
 *
 * Sin BD, sin Drive y sin motor. Lo que se comprueba es el juicio de la ficha:
 * qué tipo se PROPONE, qué campos de los datos generales se mandan según el
 * tipo, de dónde sale la demanda de ACS de un terciario, la iluminación por
 * planta y qué se pregunta antes de generar. Lo que escribe el motor con ello
 * lo vigila `cee-engine/tests/test_terciario.py`.
 */
import { pathToFileURL } from 'url';
import path from 'path';

const raiz = path.join(import.meta.dirname, '../../frontend/src/features');
const F = await import(pathToFileURL(path.join(raiz, 'cee-envolvente/logic/fichaCe3x.js')).href);

let fallos = 0;
const comprueba = (que, real, esperado) => {
    const ok = JSON.stringify(real) === JSON.stringify(esperado);
    if (!ok) { fallos++; console.log(`  MAL  ${que}\n       esperado ${JSON.stringify(esperado)}\n       salió    ${JSON.stringify(real)}`); }
    else console.log(`  ok   ${que}`);
};

// Una casa de dos plantas (120 + 80 m²).
const geometria = {
    elementos: [],
    modelo: {
        spaces: [{ floor: 0, area: 120, attrs: { habitable: true } },
                 { floor: 1, area: 80, attrs: { habitable: true } }],
        floors: [{ nivel: 0, planta: 'PB' }, { nivel: 1, planta: 'P1' }],
        catastro: { inmueble: { antiguedad: 1990, direccion: 'CL MAYOR 3, ABENOJAR, CIUDAD REAL' } },
    },
    parametros: { floor_height_m: 3 },
};
const ficha = (expediente, ajustes) => F.fichaCe3x({ expediente, geo: { geometria }, ajustes });
const ter = { numero_expediente: '26TER100_9', cee: { acs_method: 'manual', dacs_manual: 20000 } };
const res = { numero_expediente: '26RES060_9', cee: {} };

console.log('\n── Qué tipo se PROPONE');
comprueba('un TER100 se propone como pequeño terciario',
          F.tipoCe3xDe({}, ter), { tipo: 'pequeno_terciario', elegido: false });
comprueba('un TER173 también',
          F.tipoCe3xSugerido({ numero_expediente: '26TER173_2' }), 'pequeno_terciario');
comprueba('una oportunidad con el sector terciario declarado también',
          F.tipoCe3xSugerido({ numero_expediente: '26RES060_OP9',
                               oportunidades: { datos_calculo: { inputs: { sector: 'terciario' } } } }),
          'pequeno_terciario');
comprueba('un RES060 es residencial', F.tipoCe3xDe({}, res), { tipo: 'residencial', elegido: false });
comprueba('lo elegido manda sobre lo propuesto',
          F.tipoCe3xDe({ tipo_ce3x: 'gran_terciario' }, res), { tipo: 'gran_terciario', elegido: true });
comprueba('un tipo inventado no se da por elegido',
          F.tipoCe3xDe({ tipo_ce3x: 'hospital' }, res).elegido, false);

console.log('\n── Datos generales según el tipo');
{
    const r = ficha(res, { tipo_ce3x: 'residencial' });
    comprueba('residencial: tipo de edificio y sin perfil de uso',
              [r.ficha.tipo_edificio_ce3x, r.ficha.generales.tipo_edificio?.valor,
               r.ficha.generales.perfil_uso], ['residencial', 'Unifamiliar', undefined]);
    comprueba('residencial: el nombre del edificio es el de siempre',
              r.ficha.administrativos.nombre_edificio.valor, 'UNIFAMILIAR EN CL MAYOR 3');
    comprueba('residencial: sin iluminación', r.ficha.iluminacion, undefined);
    comprueba('residencial: el ACS por defecto sigue siendo 140', r.ficha.generales.demanda_acs.valor, 140);
}
{
    const r = ficha(ter, { tipo_ce3x: 'pequeno_terciario', perfil_uso: 'Intensidad Baja - 24h',
                           ambito: 'Local' });
    comprueba('terciario: perfil de uso y ámbito, sin tipo de vivienda',
              [r.ficha.generales.perfil_uso.valor, r.ficha.generales.ambito.valor,
               r.ficha.generales.tipo_edificio], ['Intensidad Baja - 24h', 'Local', undefined]);
    comprueba('terciario: un LOCAL se nombra como local',
              r.ficha.administrativos.nombre_edificio.valor, 'LOCAL EN CL MAYOR 3');
    // D_ACS 20.000 kWh/año = L · 0,001162 · 365 · 46  →  1.025 l/día.
    comprueba('terciario: la ACS sale de la D_ACS del expediente, no del 140',
              r.ficha.generales.demanda_acs.valor, 1025);
    comprueba('terciario: el informe no habla de «la vivienda analizada»',
              r.ficha.informe.pruebas.includes('vivienda analizada'), false);
    comprueba('terciario: la ventilación es 0,8 fija, no la tabla por año de una vivienda',
              r.ficha.generales.ventilacion.valor, 0.8);
    const aMano = ficha(ter, { tipo_ce3x: 'pequeno_terciario', ventilacion: 1 });
    comprueba('terciario: la ventilación puesta a mano manda',
              aMano.ficha.generales.ventilacion, { valor: 1, de: 'puesto a mano por el certificador' });
}
{
    const r = ficha(res, { tipo_ce3x: 'residencial' });
    comprueba('residencial: la ventilación sigue saliendo de la tabla por año',
              r.ficha.generales.ventilacion.de, 'la MISMA renovación/hora que usó la simulación');
}
{
    const r = ficha(ter, { tipo_ce3x: 'pequeno_terciario', perfil_uso: 'Intensidad Baja - 10h' });
    comprueba('un perfil que CE3X no tiene no se manda', r.ficha.generales.perfil_uso.valor, null);
}

console.log('\n── La demanda de ACS de un terciario');
comprueba('con litros del certificado, esos',
          F.litrosAcsDelExpediente({ cee: { dacs_litros_dia: 480 } }), 480);
comprueba('en modo CTE (dormitorios de UNA vivienda) no se deduce nada',
          F.litrosAcsDelExpediente({ cee: { acs_method: 'cte', num_rooms: 3 } }), null);
comprueba('sin D_ACS, nada', F.litrosAcsDelExpediente({ cee: {} }), null);

console.log('\n── La iluminación por planta');
{
    const il = F.iluminacionCe3x({ ilum_actividad: 'Aulas y laboratorios',
                                   ilum_por_nivel: { 1: { actividad: 'Religioso en general' } } },
                                 [{ nivel: 0, planta: 'PB', area: 120 }, { nivel: 1, planta: 'P1', area: 80 }]);
    comprueba('el edificio: la actividad con la lámpara LED y los lux que propone CE3X',
              il.defecto, { actividad: 'Aulas y laboratorios', lampara: 'LED', iluminancia: 500 });
    comprueba('la planta que es otra cosa arrastra SUS lux',
              il.por_nivel, { 1: { actividad: 'Religioso en general', lampara: 'LED', iluminancia: 200 } });
    // P = VEEI · S · E / 100: 1,754 · 120 · 500 / 100 = 1.053 W; 1,754 · 80 · 200 / 100 = 281 W.
    comprueba('la potencia de cada planta es la cuenta de CE3X',
              il.filas.map(f => f.potencia), [1053, 281]);
    comprueba('sin actividad no hay iluminación', F.iluminacionCe3x({}, []).defecto, null);
}

console.log('\n── Qué se pregunta antes de generar');
{
    const r = ficha(ter, { tipo_ce3x: 'pequeno_terciario' });
    const claves = r.faltan.map(p => p.clave);
    comprueba('a un terciario sin perfil ni actividad se le preguntan',
              ['perfil_uso', 'ilum_actividad'].every(k => claves.includes(k)), true);
    comprueba('con la D_ACS en el expediente, la ACS no se pregunta',
              claves.includes('demanda_acs'), false);
    const sinDacs = ficha({ numero_expediente: '26TER100_9', cee: {} }, { tipo_ce3x: 'gran_terciario' });
    const p = sinDacs.faltan.find(x => x.clave === 'demanda_acs');
    comprueba('sin D_ACS se pregunta, y SIN proponer el 140 de una vivienda', p?.propuesto, null);
    comprueba('en el final no se pregunta nada',
              F.faltaPorPreguntar({}, { fase: 'final', tipo: 'pequeno_terciario' }), []);
}

console.log(fallos ? `\n✗ ${fallos} fallo(s)` : '\n✓ todo en orden');
process.exit(fallos ? 1 : 0);
