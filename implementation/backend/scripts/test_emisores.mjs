// ============================================================================
// test_emisores.mjs — el emisor INICIAL y los FINALES de un expediente.
// ----------------------------------------------------------------------------
//   · RES060/093/TER  → inicial y final son EL MISMO (se deriva, no se pregunta).
//   · RES080          → el inicial se declara (puede ser NINGUNO) y hay un emisor
//                       por equipo instalado.
//   · Un expediente SIN los campos nuevos se comporta como antes del cambio.
//
//   node implementation/backend/scripts/test_emisores.mjs
// ============================================================================
const F = '../../frontend/src/features/expedientes';
const {
    emisorInicial, emisoresFinales, emisoresFinalesMixtos, sinEmisorInicial,
    generadorCe3x, emisorLabelDocumento, EMISOR_NINGUNO,
} = await import(`${F}/logic/emisores.js`);
const { buildCe3xFinal, buildMedidaMejora } = await import(`${F}/logic/ce3xFinal.js`);
const { esSinCalefaccion, BOILER_EFFICIENCIES } = await import('../../frontend/src/features/calculator/logic/calculation.js');

let ok = 0, ko = 0;
const check = (c, msg, extra) => {
    if (c) { ok++; console.log(`  ✓ ${msg}`); }
    else { ko++; console.log(`  ✗ ${msg}${extra !== undefined ? ` → ${extra}` : ''}`); }
};

const modelos = { 549: { seer: 6.6 }, 548: { seer: 6.4 } };

// Un RES080 real: no había calefacción, y se instalan un conductos y un split.
const res080 = {
    numero_expediente: '26RES080_76',
    instalacion: {
        tipo_emisor: 'conductos', tipo_emisor_inicial: EMISOR_NINGUNO,
        cambio_acs: false, cambio_calefaccion: true,
        caldera_antigua_cal: { tipo_equipo: 'No tiene calefacción', rendimiento_id: 'sin_calefaccion' },
        aerotermia_cal: {
            marca: 'GREE', modelo: 'U-MATCH CDT 24', aerotermia_db_id: 549, scop: 4.1, numero_serie: 'UM-1',
            equipos_extra: [{ marca: 'GREE', modelo: 'PULAR 18', aerotermia_db_id: 548, scop: 4.0, numero_serie: 'PU-1', tipo_emisor: 'splits' }],
        },
    },
    cee: { cee_inicial: { superficieHabitable: 120 } }, documentacion: {},
};

console.log('\n1. RES080 — inicial y finales son cosas distintas');
{
    check(emisorInicial(res080) === EMISOR_NINGUNO, 'el inicial es "ninguno"', emisorInicial(res080));
    check(sinEmisorInicial(res080), 'y se reconoce como "no tenía calefacción"');
    const f = emisoresFinales(res080);
    check(f.length === 2, 'hay un emisor por equipo instalado', f.length);
    check(f[0].tipo_emisor === 'conductos' && f[1].tipo_emisor === 'splits', 'cada equipo con el suyo',
        f.map(x => x.tipo_emisor).join('/'));
    check(emisoresFinalesMixtos(res080), 'y se detectan como MIXTOS');
}

console.log('\n2. En RES060 el inicial se DERIVA del final, aunque se declare otro');
{
    // El `tipo_emisor_inicial` está puesto a propósito: en una ficha de sustitución
    // NO puede mandar — la obra cambia el generador, no la distribución.
    const res060 = {
        numero_expediente: '26RES060_10',
        instalacion: {
            tipo_emisor: 'radiadores_convencionales', tipo_emisor_inicial: 'splits',
            cambio_acs: false, caldera_antigua_cal: { rendimiento_id: 'oil_pre85' },
            aerotermia_cal: { marca: 'DAIKIN', modelo: 'ALTHERMA 3', scop: 3.5, numero_serie: 'S1',
                equipos_extra: [{ marca: 'DAIKIN', modelo: 'ALTHERMA 3', scop: 3.4, numero_serie: 'S2', tipo_emisor: 'conductos' }] },
        },
        cee: {}, documentacion: {},
    };
    check(emisorInicial(res060) === 'radiadores_convencionales', 'el inicial ES el final', emisorInicial(res060));
    const f = emisoresFinales(res060);
    check(f.every(x => x.tipo_emisor === 'radiadores_convencionales'),
        'y el emisor por unidad tampoco manda: todas comparten el del expediente', f.map(x => x.tipo_emisor).join('/'));
    check(!emisoresFinalesMixtos(res060), 'nunca son mixtos en una ficha de sustitución');
}

console.log('\n3. Un expediente SIN los campos nuevos se comporta como antes');
{
    const viejo = {
        numero_expediente: '26RES080_44',
        instalacion: { tipo_emisor: 'suelo_radiante', cambio_acs: false,
            caldera_antigua_cal: { rendimiento_id: 'gas_pre98_mural' },
            aerotermia_cal: { marca: 'X', modelo: 'Y', scop: 4, numero_serie: 'S' } },
        cee: {}, documentacion: {},
    };
    check(emisorInicial(viejo) === 'suelo_radiante', 'el inicial cae al de siempre', emisorInicial(viejo));
    check(!emisoresFinalesMixtos(viejo), 'y no hay mezcla que declarar');
    check(emisorLabelDocumento(viejo) === 'Suelo Radiante (35°C)', 'el certificado imprime la etiqueta de siempre',
        emisorLabelDocumento(viejo));
}

console.log('\n4. CE3X: un bloque POR GENERADOR cuando no son del mismo tipo');
{
    const { bloque } = buildCe3xFinal(res080, { modelos });
    check(/\*1\)/.test(bloque) && /\*2\)/.test(bloque), 'salen dos bloques numerados');
    check(bloque.includes('Bomba de calor aire-aire (conductos)'), 'el primero, conductos');
    check(bloque.includes('Bomba de calor aire-aire (split)'), 'el segundo, split');
    check(bloque.includes('UM-1') && bloque.includes('PU-1'), 'cada uno con SU nº de serie');
    check(/SEER 6,60/.test(bloque) && /SEER 6,40/.test(bloque), 'y con SU SEER, no el menor del conjunto');
    check(bloque.includes('LA VIVIENDA NO TENÍA CALEFACCIÓN') && bloque.includes('Gas Natural'),
        'y se le dice que marque Gas Natural en «otros combustibles»');
}

console.log('\n5. CE3X: sin mezcla, la cascada se sigue agrupando en UN bloque');
{
    const casc = JSON.parse(JSON.stringify(res080));
    delete casc.instalacion.aerotermia_cal.equipos_extra[0].tipo_emisor;
    casc.instalacion.aerotermia_cal.equipos_extra[0].modelo = 'U-MATCH CDT 24';
    casc.instalacion.aerotermia_cal.equipos_extra[0].aerotermia_db_id = 549;
    const { bloque } = buildCe3xFinal(casc, { modelos });
    check(!/\*2\)/.test(bloque), 'un solo bloque de equipo');
    check(!bloque.includes('GENERADORES DISTINTOS'), 'y sin el aviso de generadores distintos');
    check(/en cascada/.test(buildMedidaMejora(casc, { modelos })?.texto || ''), 'la medida sí dice "en cascada"');
}

console.log('\n6. La medida de mejora no llama "cascada" a dos equipos distintos');
{
    const t = buildMedidaMejora(res080, { modelos })?.texto || '';
    check(!/cascada/.test(t), 'no dice cascada', t);
    check(/de conductos/.test(t) && /de split/.test(t), 'los enumera con su unidad terminal', t);
    check(/^Instalación de/.test(t), 'y es una INSTALACIÓN, no una sustitución (no había nada que retirar)', t);
}

console.log('\n7. "No tiene calefacción" se declara con el η y el combustible de la oportunidad');
{
    const fila = BOILER_EFFICIENCIES.find(b => b.id === 'sin_calefaccion');
    check(!!fila, 'la entrada existe en BOILER_EFFICIENCIES');
    check(fila.value === 0.92, 'con η 0,92 — el mismo que aplica la calculadora', fila.value);
    check(fila.label.split(',')[0].trim() === 'No tiene calefacción',
        'y el CIFO/RES080 imprimen "No tiene calefacción" como combustible', fila.label.split(',')[0]);
    check(esSinCalefaccion('sin_calefaccion') && !esSinCalefaccion('electric'), 'el helper distingue el caso');
    check(generadorCe3x('suelo_radiante') === 'Bomba de Calor - Caudal Ref. Variable',
        'el aire-agua conserva su tipo de generador de siempre', generadorCe3x('suelo_radiante'));
}

console.log('\n8. El SCOP que se declara sigue siendo el MENOR de los equipos');
{
    // Dos generadores independientes no cambian el criterio conservador de la
    // cascada: el certificado declara UN SCOP y no puede ser el mejor de los dos.
    const { withScopAplicado, scopAplicado } = await import(`${F}/logic/aerotermiaUnits.js`);
    const aero = withScopAplicado(res080.instalacion.aerotermia_cal);
    check(aero.scop === 4.0, 'el aplicado es el del PULAR (4,00), no el del U-MATCH', aero.scop);
    check(aero.scop_propio === 4.1, 'y el propio del equipo 1 se conserva', aero.scop_propio);
    check(scopAplicado(aero) === 4.0, 'scopAplicado coincide', scopAplicado(aero));
}

console.log(`\n═══ ${ok} correctas · ${ko} fallos ═══`);
process.exit(ko ? 1 : 0);
