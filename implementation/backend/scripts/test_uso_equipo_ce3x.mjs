#!/usr/bin/env node
/**
 * CAMBIAR EL USO de un equipo en la pestaña de Instalaciones.
 *
 *   node implementation/backend/scripts/test_uso_equipo_ce3x.mjs
 *
 * Por defecto la caldera de la oportunidad sale como «Equipo mixto de
 * calefacción y ACS», y casi siempre lo es. Cuando no —la caldera da solo la
 * calefacción y el agua un termo, o al revés—, se cambia el uso y se añade el
 * otro equipo. Esto prueba el JUICIO de la ficha: qué uso se acepta, qué
 * campos arrastra cada uno, que los equipos añadidos son de su fase, y qué
 * conserva el CEE final del inicial. Lo que escribe el motor con ello lo
 * vigila `cee-engine/tests/test_equipos.py`.
 *
 * Sin BD, sin Drive y sin motor.
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

const CALDERA = {
    slot: 'mixto2', nombre: 'CALDERA ROCA', generador: 'Caldera Estándar',
    combustible: 'Gasóleo-C', aislamiento: 'Sin aislamiento', rend_combustion: '75',
    potencia: '24', superficie_calefaccion: 120, superficie_acs: 120,
    acumulacion: { volumen: 150 },
};

// ── 1. La REGLA de la forma: la decide el combustible ────────────────────────
console.log('\n1. Qué campos lleva un equipo lo decide el COMBUSTIBLE, no el uso');
comprueba('una caldera de gasóleo se estima como caldera', F.porCombustion(CALDERA), true);
comprueba('una caldera de gasóleo de SOLO ACS, también',
          F.porCombustion({ ...CALDERA, slot: 'ACS' }), true);
comprueba('unos radiadores eléctricos, no',
          F.porCombustion({ slot: 'calefaccion', combustible: 'Electricidad' }), false);
comprueba('un termo recién añadido (sin combustible tecleado), no',
          F.porCombustion({ slot: 'ACS' }), false);
comprueba('una bomba de calor ensayada, no',
          F.porCombustion({ slot: 'mixto2', combustible: 'Electricidad', rendimiento: 'conocido' }),
          false);

// ── 2. Qué usos se ofrecen ───────────────────────────────────────────────────
console.log('\n2. Los usos que se ofrecen son los que el motor sabe escribir');
const usos = (eq, o) => F.usosDeEquipo(eq, o).map(u => u.valor);
comprueba('una caldera (estimada) del expediente',
          usos({}, { principal: true }), ['mixto2', 'calefaccion', 'ACS']);
//: … solo frío o frío y calor: el `climatizacion` ESTIMADO está medido (258 del
//: corpus) desde 2026-09-29 — es el aire que también calienta (2026CEE_60).
comprueba('un equipo añadido estimado puede ser además un aire acondicionado',
          usos({}), ['mixto2', 'calefaccion', 'ACS', 'refrigeracion', 'climatizacion']);
comprueba('una bomba de calor ensayada, también con frío',
          usos({ rendimiento: 'conocido' }, { principal: true }),
          ['mixto3', 'climatizacion', 'mixto2', 'calefaccion', 'ACS']);

// ── 3. La caldera del expediente pasa a SOLO calefacción ─────────────────────
console.log('\n3. La caldera pasa a SOLO calefacción');
{
    const { equipo, cambioDeUso } = F.equipoConAjustes(CALDERA, { slot: 'calefaccion' },
                                                       { superficie: 120 });
    comprueba('el uso', equipo.slot, 'calefaccion');
    comprueba('pierde la superficie y el % de ACS',
              [equipo.superficie_acs, equipo.pct_acs], [undefined, undefined]);
    comprueba('y el depósito (es del equipo que da el agua)', equipo.acumulacion, undefined);
    comprueba('conserva su potencia y su aislamiento (sigue siendo una caldera)',
              [equipo.potencia, equipo.aislamiento], ['24', 'Sin aislamiento']);
    comprueba('devuelve qué servicio deja', cambioDeUso?.deja, ['acs']);
    comprueba('solo, se dice que queda sin cubrir el ACS',
              F.avisoCambioDeUso(cambioDeUso, []).includes('queda sin cubrir el ACS'), true);
    comprueba('con un termo que lo da, no se dice (sería un aviso que no hay que atender)',
              F.avisoCambioDeUso(cambioDeUso, [{ slot: 'ACS' }]).includes('sin cubrir'), false);
}

// ── 4. La caldera pasa a SOLO ACS ────────────────────────────────────────────
console.log('\n4. La caldera pasa a SOLO ACS');
{
    const { equipo } = F.equipoConAjustes(CALDERA, { slot: 'ACS' }, { superficie: 120 });
    comprueba('el uso', equipo.slot, 'ACS');
    comprueba('sin la superficie de calefacción', equipo.superficie_calefaccion, undefined);
    comprueba('con la de ACS y su depósito',
              [equipo.superficie_acs, equipo.acumulacion?.volumen], [120, 150]);
    comprueba('y su potencia: la cola de caldera la exige', equipo.potencia, '24');
}

// ── 5. Un uso que el motor no sabe escribir no entra ─────────────────────────
console.log('\n5. Un uso imposible no se cuela');
{
    const { equipo } = F.equipoConAjustes(CALDERA, { slot: 'mixto3' }, { superficie: 120 });
    comprueba('un mixto3 estimado no existe: se queda en lo que era', equipo.slot, 'mixto2');
}

// ── 6. Una aerotermia ensayada cambia de uso y pide su rendimiento ───────────
console.log('\n6. La aerotermia (ensayada) con frío pide el SEER');
{
    const aero = { slot: 'mixto2', nombre: 'AEROTERMIA', generador: 'Bomba de Calor - Caudal Ref. Variable',
                   combustible: 'Electricidad', rendimiento: 'conocido',
                   rend_calefaccion: '434', rend_acs: '300', superficie_calefaccion: 120,
                   superficie_acs: 120 };
    const sin = F.equipoConAjustes(aero, { slot: 'mixto3' }, { superficie: 120 });
    comprueba('sin el de refrigeración no se escribe', sin.equipo, null);
    comprueba('y dice cuál falta', sin.falta, 'falta el rendimiento de refrigeración');
    const con = F.equipoConAjustes(aero, { slot: 'mixto3', rend_refrigeracion: 416 },
                                   { superficie: 120 });
    comprueba('con él, sí', [con.equipo?.slot, con.equipo?.rend_refrigeracion], ['mixto3', '416']);
    const cal = F.equipoConAjustes(aero, { slot: 'calefaccion' }, { superficie: 120 });
    comprueba('en solo calefacción suelta el rendimiento de ACS',
              [cal.equipo.slot, cal.equipo.rend_acs, cal.equipo.rend_calefaccion],
              ['calefaccion', undefined, '434']);
}

// ── 7. Los equipos AÑADIDOS ──────────────────────────────────────────────────
console.log('\n7. Los añadidos: termo, radiadores eléctricos, aerotermo');
{
    const termo = F.equipoAnadido({ slot: 'ACS', nombre: 'TERMO' }, { superficie: 120 });
    comprueba('un termo: efecto Joule, electricidad, rendimiento nominal y sin potencia',
              [termo.equipo.generador, termo.equipo.combustible, termo.equipo.rend_nominal,
               termo.equipo.potencia], ['Efecto Joule', 'Electricidad', '100.0', undefined]);

    const rad = F.equipoAnadido({ slot: 'calefaccion', nombre: 'RADIADORES',
                                  generador: 'Efecto Joule', combustible: 'Electricidad' },
                                { superficie: 120 });
    comprueba('unos radiadores eléctricos se escriben SIN potencia',
              [!!rad.equipo, rad.equipo?.potencia, rad.equipo?.rend_nominal],
              [true, undefined, '100.0']);

    const calderaAcs = F.equipoAnadido({ slot: 'ACS', nombre: 'CALDERA ACS',
                                         generador: 'Caldera Estándar', combustible: 'Gas Natural' },
                                       { superficie: 120 });
    comprueba('una caldera de gas para el ACS SÍ pide su potencia', calderaAcs.equipo, null);

    const aerotermo = F.equipoAnadido({ slot: 'ACS', nombre: 'AEROTERMO',
                                        generador: 'Bomba de Calor - Caudal Ref. Variable',
                                        combustible: 'Electricidad', rendimiento: 'conocido',
                                        rend_acs: 279 }, { superficie: 120 });
    comprueba('un aerotermo con su COP ensayado',
              [aerotermo.equipo?.rendimiento, aerotermo.equipo?.rend_acs], ['conocido', '279']);

    const sinCop = F.equipoAnadido({ slot: 'ACS', nombre: 'AEROTERMO',
                                     generador: 'Bomba de Calor - Caudal Ref. Variable',
                                     combustible: 'Electricidad', rendimiento: 'conocido' },
                                   { superficie: 120 });
    comprueba('ensayado y sin COP no se escribe', sinCop.equipo, null);
    comprueba('y se dice', sinCop.avisos.some(a => a.includes('falta el de ACS')), true);

    const mixto3 = F.equipoAnadido({ slot: 'mixto3', nombre: 'X', generador: 'Bomba de Calor',
                                     combustible: 'Electricidad' }, { superficie: 120 });
    comprueba('un mixto3 estimado no se escribe', mixto3.equipo, null);
}

// ── 8. La ficha entera: caldera en solo calefacción + termo, y POR FASE ──────
console.log('\n8. La ficha: caldera de solo calefacción + termo, cada cosa en su fase');
const PANASONIC = { aerotermia_db_id: 447, marca: 'PANASONIC', modelo: 'AQUAREA',
                    modelo_ud_exterior: 'WH-WDG16ME5' };
const expediente = {
    numero_expediente: '26RES060_9',
    instalacion: {
        tipo_emisor: 'radiadores_convencionales', cambio_acs: true,
        misma_aerotermia_acs: false, misma_caldera_acs: true,
        caldera_antigua_cal: { rendimiento_id: 'oil_85_97', marca: 'ROCA', modelo: 'P30' },
        potencia_caldera_kw: 24,
        aerotermia_cal: { ...PANASONIC, scop: 4.34 },
        aerotermia_acs: { ...PANASONIC, scop: 3 },
    },
    cee: { cee_inicial: { superficieHabitable: 120, demandaCalefaccion: 150 } },
    oportunidades: { datos_calculo: { inputs: {}, zona: 'D3' } },
};
const geometria = {
    elementos: [],
    modelo: { spaces: [{ floor: 0, area: 120, attrs: { habitable: true } }],
              floors: [{ nivel: 0, planta: 'PB' }],
              catastro: { inmueble: { antiguedad: 1990, direccion: 'CL MAYOR 3, ABENOJAR, CIUDAD REAL' } } },
    parametros: { floor_height_m: 2.8 },
};
const ficha = (fase, ajustes) => F.fichaCe3x({ expediente, geo: { geometria }, ajustes, fase });
const ajustes = {
    instalacion: { slot: 'calefaccion' },
    equipos_extra: [{ slot: 'ACS', nombre: 'TERMO ELECTRICO' }],
};
{
    const ini = ficha('inicial', ajustes);
    comprueba('el inicial lleva DOS equipos: la caldera y el termo',
              (ini.ficha.instalaciones || []).map(e => e.slot), ['calefaccion', 'ACS']);
    comprueba('la tarjeta del expediente es la caldera, aunque haya añadidos',
              ini.equipos.principal.slot, 'calefaccion');
    comprueba('con la caldera sin ACS, no se pregunta por SU depósito',
              ini.faltan.some(p => p.clave === 'acumulacion_litros'), false);

    const fin = ficha('final', ajustes);
    comprueba('el final NO repite el termo del inicial (lo lleva el fichero que copia)',
              (fin.ficha.instalaciones || []).map(e => e.slot), ['mixto2']);
    comprueba('y como la aerotermia da calefacción y ACS, no conserva nada',
              fin.equipos.conservados, []);

    const soloCal = ficha('final', { ...ajustes, instalacion_final: { slot: 'calefaccion' } });
    comprueba('con la aerotermia en solo calefacción, el termo del inicial SE CONSERVA',
              soloCal.equipos.conservados,
              [{ nombre: 'TERMO ELECTRICO', slot: 'ACS', pct: { acs: 100 } }]);

    const conExtra = ficha('final', { ...ajustes, equipos_extra_final: [
        { slot: 'ACS', nombre: 'AEROTERMO', generador: 'Bomba de Calor - Caudal Ref. Variable',
          combustible: 'Electricidad', rendimiento: 'conocido', rend_acs: 279 }],
        instalacion_final: { slot: 'calefaccion' } });
    comprueba('un equipo añadido en la cara del FINAL entra en el final',
              (conExtra.ficha.instalaciones || []).map(e => e.nombre),
              ['AEROTERMIA PANASONIC AQUAREA (WH-WDG16ME5)', 'AEROTERMO']);
    comprueba('…y entonces el termo del inicial ya no se conserva',
              conExtra.equipos.conservados, []);

    const medida = (ficha('inicial', { ...ajustes, instalacion_final: { slot: 'calefaccion' },
                                        equipos_extra_final: [{ slot: 'ACS', nombre: 'TERMO NUEVO' }] })
        .ficha.medidas || [])[0];
    comprueba('la MEDIDA de mejora dice lo mismo que la cara del final',
              (medida?.instalaciones || []).map(e => `${e.slot}:${e.nombre}`),
              ['calefaccion:AEROTERMIA PANASONIC AQUAREA (WH-WDG16ME5)', 'ACS:TERMO NUEVO']);
}

// ── 9. La caldera ELÉCTRICA existente ya se escribe ──────────────────────────
console.log('\n9. Una caldera eléctrica: efecto Joule, sin potencia ni aislamiento');
{
    const { equipo } = F.instalacionExistente({
        expediente: { ...expediente, instalacion: { ...expediente.instalacion,
            caldera_antigua_cal: { rendimiento_id: 'electric' } } },
        superficie: 120 });
    comprueba('se escribe', !!equipo, true);
    comprueba('por efecto Joule y con electricidad',
              [equipo?.generador, equipo?.combustible], ['Efecto Joule', 'Electricidad']);
    comprueba('con el nominal de la tabla y sin cola de caldera',
              [equipo?.rend_nominal, equipo?.potencia, equipo?.aislamiento],
              ['100', undefined, undefined]);
}

console.log(fallos ? `\n✗ ${fallos} fallo(s)` : '\n✓ todo en orden');
process.exit(fallos ? 1 : 0);
