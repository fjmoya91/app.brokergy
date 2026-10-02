#!/usr/bin/env node
// Pruebas de lo determinista de la skill `alta-oportunidad` — sin WhatsApp,
// sin Drive y sin base de datos.
//
//   node scripts/test_alta_oportunidad.js
const assert = require('assert');
const path = require('path');
const { registerHooks } = require('node:module');
const { pathToFileURL } = require('url');

registerHooks({
    resolve(specifier, context, nextResolve) {
        try { return nextResolve(specifier, context); } catch (e) {
            if (!/^\.\.?\//.test(specifier) || /\.[cm]?jsx?$/.test(specifier)) throw e;
            for (const suf of ['.js', '.jsx', '/index.js']) {
                try { return nextResolve(specifier + suf, context); } catch { /* siguiente */ }
            }
            throw e;
        }
    },
});

const alta = require('../utils/altaOportunidad');
const conv = require('../services/whatsappConversacion');

let ok = 0;
const prueba = async (nombre, fn) => {
    try { await fn(); ok += 1; console.log(`  ✓ ${nombre}`); } catch (e) { console.error(`  ✗ ${nombre}\n    ${e.message}`); process.exitCode = 1; }
};

(async () => {
    console.log('Conversación');
    const T = 1_790_000_000;
    const ms = [
        { id: 'a', t: T, de_mi: true, tipo: 'chat' },                 // un aviso nuestro, días antes
        { id: 'b', t: T + 3 * 86400, de_mi: false, tipo: 'chat' },     // «te paso otro presupuesto…»
        { id: 'c', t: T + 3 * 86400 + 600, de_mi: false, tipo: 'document' },
        { id: 'd', t: T + 3 * 86400 + 660, de_mi: false, tipo: 'image' },
        { id: 'e', t: T + 3 * 86400 + 900, de_mi: false, tipo: 'chat' }, // nombre y DNI
        { id: 'f', t: T + 3 * 86400 + 1500, de_mi: true, tipo: 'chat' }, // nuestra respuesta
    ];

    await prueba('el bloque es la última ráfaga suya, cortada por el silencio de antes', () => {
        const b = alta.bloquePeticion(ms);
        assert.deepStrictEqual(b.mensajes.map(m => m.id), ['b', 'c', 'd', 'e', 'f']);
        assert.match(b.motivo, /silencio de 72 h/);
    });
    await prueba('con --desde manda la fecha indicada', () => {
        const b = alta.bloquePeticion(ms, { desdeSeg: T + 3 * 86400 + 650 });
        assert.deepStrictEqual(b.mensajes.map(m => m.id), ['d', 'e', 'f']);
    });
    await prueba('sin nada suyo no hay petición', () => {
        assert.strictEqual(alta.bloquePeticion([{ id: 'x', t: T, de_mi: true }]).mensajes.length, 0);
    });
    await prueba('la hora se lee en MADRID (verano UTC+2, invierno UTC+1)', () => {
        assert.strictEqual(alta.segundosMadrid('2026-10-01 16:20'), Date.UTC(2026, 9, 1, 14, 20) / 1000);
        assert.strictEqual(alta.segundosMadrid('2026-12-01 16:20'), Date.UTC(2026, 11, 1, 15, 20) / 1000);
        assert.throws(() => alta.segundosMadrid('1/10/2026'));
    });
    await prueba('una tarjeta de contacto da el nombre y el teléfono (waid manda)', () => {
        const v = conv.leerVcard('BEGIN:VCARD\nVERSION:3.0\nFN:Juan Marido\nitem1.TEL;waid=34612345678:+34 612 34 56 78\nEND:VCARD');
        assert.deepStrictEqual(v, { nombre: 'Juan Marido', telefonos: ['34612345678'] });
        assert.strictEqual(conv.leerVcard('hola'), null);
    });
    await prueba('los mensajes del sistema no cuentan; las notas de voz se pueden bajar', () => {
        const n = conv.normalizarMensajes([
            { id: '1', tipo: 'e2e_notification', t: T },
            { id: '2', tipo: 'ptt', t: T + 1, mimetype: 'audio/ogg; codecs=opus', size: 1000 },
            { id: '3', tipo: 'image', t: T + 2, viewOnce: true, mimetype: 'image/jpeg' },
            { id: '4', tipo: 'vcard', t: T + 3, vcard: 'BEGIN:VCARD\nFN:X\nTEL:612345678\nEND:VCARD' },
        ], { corteSeg: T - 10 });
        assert.deepStrictEqual(n.map(m => m.id), ['2', '3', '4']);
        assert.strictEqual(n[0].descargable, true);
        assert.strictEqual(n[0].mimetype, 'audio/ogg');
        assert.strictEqual(n[1].descargable, false);       // «ver una vez»: WhatsApp no deja bajarlo
        assert.deepStrictEqual(n[2].contactos[0].telefonos, ['612345678']);
    });
    await prueba('buscar sin tildes ni mayúsculas', () => {
        assert.strictEqual(conv.normaliza('ISM Alejandro Administración'), 'ism alejandro administracion');
    });

    console.log('El inmueble');
    const cons = [
        { type: 'VIVIENDA', code: '1/00/01', floor: '00', surface: 141 },
        { type: 'VIVIENDA', code: '1/01/01', floor: '01', surface: 34 },
        { type: 'ALMACEN', code: '1/00/02', floor: '00', surface: 20 },
    ];
    await prueba('por defecto cuentan las de VIVIENDA (lo mismo que la ficha técnica)', () => {
        const s = alta.seleccionConstrucciones(cons);
        assert.deepStrictEqual(s.indices, [0, 1]);
        assert.strictEqual(s.superficie, 175);
    });
    await prueba('una VIVIENDA no se puede quitar (26RES060_OP250: la planta 1 de 34 m² cuenta)', () => {
        const s = alta.seleccionConstrucciones(cons, ['1/00/01']);
        assert.deepStrictEqual(s.indices, [0, 1]);
        assert.strictEqual(s.superficie, 175);
    });
    await prueba('el plan solo AÑADE lo que no es vivienda, y lo dice; un código que no existe se avisa', () => {
        const s = alta.seleccionConstrucciones(cons, ['1/00/02', '9/99/99']);
        assert.deepStrictEqual(s.indices, [0, 1, 2]);
        assert.strictEqual(s.superficie, 195);
        assert.ok(s.avisos.some(a => /9\/99\/99/.test(a)));
        assert.ok(s.avisos.some(a => /1\/00\/02.*ALMACEN/.test(a)));
    });
    await prueba('una RC con VARIAS viviendas: vivienda_construcciones cuenta solo la suya y lo dice', () => {
        // 9302601VJ7190S0001XL: el bajo y el 1º sin división horizontal (2026-10-01).
        const dos = [
            { type: 'VIVIENDA', code: '01/00/01', surface: 150 },
            { type: 'VIVIENDA', code: '01/00/02', surface: 35 },
            { type: 'APARCAMIENTO', code: '01/00/03', surface: 35 },
            { type: 'VIVIENDA', code: '01/01/01', surface: 166 },
        ];
        const alto = alta.seleccionConstrucciones(dos, null, ['01/01/01']);
        assert.deepStrictEqual(alto.indices, [3]);
        assert.strictEqual(alto.superficie, 166);
        assert.ok(alto.avisos.some(a => /01\/00\/01 \(150 m²\)/.test(a) && /01\/00\/02 \(35 m²\)/.test(a)));
        const bajo = alta.seleccionConstrucciones(dos, null, ['01/00/01', '01/00/02']);
        assert.strictEqual(bajo.superficie, 185);
        assert.throws(() => alta.seleccionConstrucciones(dos, null, ['01/00/03']), /VIVIENDA/);
        assert.throws(() => alta.seleccionConstrucciones(dos, null, ['01/09/09']), /01\/09\/09/);
    });
    await prueba('sin ninguna vivienda en el Catastro cuenta todo (como el formulario)', () => {
        const s = alta.seleccionConstrucciones([{ type: 'ALMACEN', code: 'a', surface: 50 }, { type: 'OFICINA', code: 'b', surface: 30 }]);
        assert.strictEqual(s.superficie, 80);
    });

    await prueba('orientación y patios: valores de los desplegables de la calculadora', () => {
        assert.deepStrictEqual(alta.ajustesEdificio({ orientacion: 'n', patios: 1 }), { orientacion: 'N', patios: 1 });
        assert.deepStrictEqual(alta.ajustesEdificio({}), {});
        assert.throws(() => alta.ajustesEdificio({ orientacion: 'norte' }));
        assert.throws(() => alta.ajustesEdificio({ patios: 7 }));
    });

    console.log('El plan → el funnel');
    await prueba('sin emisor declarado, RADIADORES convencionales; sustitución de caldera', () => {
        const f = alta.funnelDesdePlan({ caldera: { combustible: 'gasoleo', edad: '10-20' } });
        assert.strictEqual(f.emisor_tipo, 'radiadores_convencionales');
        assert.strictEqual(f.isReforma, false);
        assert.strictEqual(f.reforma_elementos.caldera, true);
        assert.strictEqual(f.boiler_acs_type, 'misma_caldera');
        assert.strictEqual(f.incluir_acs, false);
        assert.strictEqual(f.placas_estado, null);   // sin declarar ≠ «no»
    });
    await prueba('sin calefacción: combustible null y ACS «no tengo»', () => {
        const f = alta.funnelDesdePlan({ caldera: null });
        assert.strictEqual(f.combustible_actual, null);
        assert.strictEqual(f.reforma_sin_caldera, true);
        assert.strictEqual(f.boiler_acs_type, 'no_tengo');
    });
    await prueba('valores fuera de la lista se rechazan (no se adivina)', () => {
        assert.throws(() => alta.funnelDesdePlan({ caldera: { combustible: 'gasoil' } }), /gasoleo/);
        assert.throws(() => alta.funnelDesdePlan({ caldera: { combustible: 'gas' }, emisor: 'radiadores' }));
        assert.throws(() => alta.funnelDesdePlan({ caldera: { combustible: 'gas' }, placas: 'quizas' }));
    });
    await prueba('el contacto limpia DNI y teléfono', () => {
        const c = alta.contactoDesdePlan({ cliente: { nombre: 'Ana', dni: '12345678-z', tlf: '+34 612 34 56 78' } });
        assert.strictEqual(c.dni, '12345678Z');
        assert.strictEqual(c.tlf, '612345678');
        assert.throws(() => alta.contactoDesdePlan({ cliente: {} }));
    });
    await prueba('el presupuesto entra a DOC_PRESUPUESTO aunque no se repita; un apartado raro se rechaza', () => {
        const d = alta.documentosDelPlan({
            presupuesto: { fichero: 'p.pdf' },
            documentos: [{ fichero: 'placa.jpg', slot: 'foto_placa_caldera_antes' }],
        }, '/tmp');
        assert.deepStrictEqual(d.map(x => x.slot), ['FOTO_PLACA_CALDERA_ANTES', 'DOC_PRESUPUESTO']);
        assert.throws(() => alta.documentosDelPlan({ documentos: [{ fichero: 'x.jpg', slot: 'FOTO_RANDOM' }] }));
    });

    console.log('El funnel → los inputs → el resultado (las MISMAS funciones del formulario)');
    const FRONT = path.join(__dirname, '..', '..', 'frontend', 'src', 'features');
    const { funnelToCalculatorInputs } = await import(pathToFileURL(path.join(FRONT, 'landing/data/funnelToInputs.js')).href);
    const { computeFullCalculatorResult } = await import(pathToFileURL(path.join(FRONT, 'landing/data/landingCalculation.js')).href);
    await prueba('una sustitución de gasóleo con radiadores da RES060, ahorro y bono', () => {
        const funnel = alta.funnelDesdePlan({ caldera: { combustible: 'gasoleo', edad: '10-20', condensacion: 'no' }, acs: { incluir: true } });
        const inputs = funnelToCalculatorInputs(funnel, {
            rc: '0000000AA0000A0001AA', yearBuilt: 2008, superficieCalefactable: 141,
            summaryByType: { VIVIENDA: 175 }, floors: { total: 2 }, climateInfo: { climateZone: 'D3' },
            provinceCode: '13', participation: '100,00',
        }, { mode: 'internal' });
        assert.strictEqual(inputs.boilerId, 'oil_post98');
        assert.strictEqual(inputs.emitterType, 'radiadores_convencionales');
        assert.strictEqual(inputs.changeAcs, true);
        assert.strictEqual(inputs.superficieCalefactable, 141);
        const r = computeFullCalculatorResult(inputs);
        assert.ok(r.savings.savingsKwh > 0, 'sin ahorro');
        assert.ok(r.financials.caeBonus > 0, 'sin bono');
    });
    await prueba('fachada al NORTE y un patio suben la demanda (lo que se hizo a mano en 26RES060_OP250)', () => {
        const funnel = alta.funnelDesdePlan({ caldera: { combustible: 'gasoleo', edad: '10-20' } });
        const base = funnelToCalculatorInputs(funnel, {
            rc: 'x', yearBuilt: 2008, superficieCalefactable: 175, summaryByType: { VIVIENDA: 175 },
            floors: { total: 2 }, climateInfo: { climateZone: 'D3' }, provinceCode: '13', participation: '100,00',
        }, { mode: 'internal' });
        const sin = computeFullCalculatorResult(base).q_net;
        const con = computeFullCalculatorResult({ ...base, ...alta.ajustesEdificio({ orientacion: 'N', patios: 1 }) }).q_net;
        assert.ok(con > sin * 1.1, `N + 1 patio no sube lo esperado (${sin} → ${con})`);
    });

    console.log('El CEE que aporta el cliente');
    await prueba('el plan: modo por defecto comparativa, el PDF va solo a DOC_CEE_EXISTENTE, sin .xml', () => {
        const c = alta.ceeDelPlan({ cee: { fichero: 'cee.pdf' } });
        assert.strictEqual(c.modo, 'comparativa');
        assert.throws(() => alta.ceeDelPlan({ cee: { fichero: 'cee.pdf', modo: 'otro' } }));
        assert.throws(() => alta.ceeDelPlan({ cee: { fichero: 'cee.xml' } }), /PDF/);
        const d = alta.documentosDelPlan({ cee: { fichero: 'cee.pdf' }, documentos: [{ fichero: 'reg.pdf', slot: 'DOC_CEE_EXISTENTE' }] }, '/tmp');
        assert.deepStrictEqual(d.map(x => x.slot), ['DOC_CEE_EXISTENTE', 'DOC_CEE_EXISTENTE']);
        // El mismo fichero en `documentos` y en `cee` no se sube dos veces.
        assert.strictEqual(alta.documentosDelPlan({ cee: { fichero: 'cee.pdf' }, documentos: [{ fichero: 'cee.pdf', slot: 'DOC_CEE_EXISTENTE' }] }, '/tmp').length, 1);
    });
    const seed = await import(pathToFileURL(path.join(FRONT, 'calculator/logic/ceeSeed.js')).href);
    const { computeCeeComparison } = await import(pathToFileURL(path.join(FRONT, 'calculator/logic/ceeComparison.js')).href);
    // El caso de 26RES060_OP252: CEE de 217 m² y 133,4 kWh/m²·año en una casa de 255 m².
    const ceeCliente = {
        referencia_catastral: '9813003VJ7191S0001HD', superficie_habitable_m2: 217, pdfBase64: 'JVBERi0x', _files: [{}],
        demandas: { calefaccion_kwh_m2_ano: 133.4 }, servicios: { calefaccion: { combustible: 'Gasóleo-C' } },
    };
    const inputsCasa = () => {
        const funnel = alta.funnelDesdePlan({ caldera: { combustible: 'gasoleo', edad: '>20' }, acs: { incluir: true } });
        return funnelToCalculatorInputs(funnel, {
            rc: 'x', yearBuilt: 2006, superficieCalefactable: 255, summaryByType: { VIVIENDA: 255 },
            floors: { total: 2 }, climateInfo: { climateZone: 'D3' }, provinceCode: '13', participation: '100,00',
        }, { mode: 'internal' });
    };
    await prueba('comparativa: el CEE se guarda SIN el PDF, la simulación sigue estimada y salen DOS cifras', () => {
        const p = seed.ceeParaComparativa(ceeCliente);
        assert.ok(!('pdfBase64' in p.cee_previo) && !('_files' in p.cee_previo), 'el PDF no puede ir al JSONB (regla 21)');
        assert.ok(!('demandMode' in p), 'la comparativa no cambia el modo');
        assert.strictEqual(p.manualDemand, 133.4);
        const inputs = { ...inputsCasa(), ...p };
        assert.strictEqual(inputs.demandMode, 'estimated');
        const c = computeCeeComparison(inputs);
        assert.ok(c, 'sin comparativa');
        assert.notStrictEqual(Math.round(c.conCee.cae), Math.round(c.ceeNuevo.cae), 'las dos cifras coinciden: la propuesta no la enseñaría');
        // «CEE nuevo» es lo que guarda la simulación; «con tu CEE», 133,4 × 217.
        assert.strictEqual(Math.round(c.ceeNuevo.cae), Math.round(computeFullCalculatorResult(inputs).financials.caeBonus));
    });
    await prueba('modo cee: la simulación usa el certificado y la comparativa se anula (por eso no es el modo por defecto)', () => {
        const inputs = inputsCasa();
        Object.assign(inputs, seed.seedInputsFromCees({ inicial: ceeCliente, inputs }));
        assert.strictEqual(inputs.demandMode, 'manual');
        assert.strictEqual(computeFullCalculatorResult(inputs).q_net, 133.4);
        const c = computeCeeComparison(inputs);
        assert.strictEqual(Math.round(c.conCee.cae), Math.round(c.ceeNuevo.cae));
    });

    console.log(`\n${ok} pruebas correctas${process.exitCode ? ' — HAY FALLOS' : ''}`);
})();
