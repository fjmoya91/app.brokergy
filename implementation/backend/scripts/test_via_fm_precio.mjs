/**
 * test_via_fm_precio.mjs — la vía del FACTOR MULTIPLICADOR con SU precio CAE.
 * ---------------------------------------------------------------------------
 * Fran (7/11/2026): «mismo precio para ambos, pero dar la posibilidad de elegir
 * precio por formato de ficha, igual que en RES060 y RES080». Se comprueba:
 *   · el resumen `via_fm` saca el € de la vía FM con su precio (y lo dice);
 *   · sin precio FM tecleado, todo sale igual que antes (mismo €/MWh);
 *   · quien no es ADMIN no ve el precio FM, no lo puede cambiar ni borrar, y su
 *     `via_fm` se rehace en el servidor con él;
 *   · el precio FM no le llega a quien no es ADMIN.
 *
 * No toca la base de datos.
 *
 *   node implementation/backend/scripts/test_via_fm_precio.mjs
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const front = (p) => import(pathToFileURL(path.join(__dirname, '../../frontend/src/features', p)).href);
const { resumenViaFm, precioFinalFm, viaFmDesdeDatosCalculo } = await front('calculator/logic/viaFm.js');
const { FM_NORMATIVA } = await front('calculator/logic/res060fc.js');
const { viaFmAlGuardar } = require('../utils/viaFmAlGuardar');
const { stripDatosCalculoMargin } = require('../utils/financialScrub');

let ok = 0, ko = 0;
const check = (c, msg, extra = '') => {
    if (c) { ok++; console.log(`  ✅ ${msg}`); } else { ko++; console.log(`  ❌ ${msg} ${extra}`); }
};

console.log('1. El precio final del cliente por la vía FM');
{
    // General 100 con 20 €/MWh de comisión restada al cliente → le quedan 80.
    const fin = { finalPriceClient: 80 };
    check(precioFinalFm(fin, { caePriceClient: 100 }) === 80, 'sin precio FM: el mismo precio final');
    check(precioFinalFm(fin, { caePriceClient: 100, caePriceClientFm: 100 }) === 80, 'con el mismo precio: igual');
    check(precioFinalFm(fin, { caePriceClient: 100, caePriceClientFm: 120 }) === 100, 'a 120: la comisión se sigue restando (100)');
    check(precioFinalFm(fin, { caePriceClient: 100 }, 110) === 90, 'un precio pedido aparte (110) manda sobre el tecleado');
}

console.log('\n2. El resumen `via_fm`');
{
    const res = {
        res060fc: { normativa: FM_NORMATIVA, ficha: 'RES060_FM', cae: 50000, elegible: true, avisos: [] },
        savings: { savingsKwh: 25000 },
        financials: { caeBonus: 2500, finalPriceClient: 100, legalizationCost: 0, isParticular: true },
    };
    const igual = resumenViaFm(res, { caePriceClient: 100 }, { hoy: '2026-11-07' });
    check(igual.eur_fm === 5000 && igual.precio_fm === undefined, 'sin precio FM: 50 MWh × 100 = 5.000 € y no dice precio', JSON.stringify(igual));
    const propio = resumenViaFm(res, { caePriceClient: 100, caePriceClientFm: 120 }, { hoy: '2026-11-07' });
    check(propio.eur_fm === 6000, 'a 120 €/MWh: 6.000 €', propio.eur_fm);
    check(propio.precio_fm === 120 && propio.precio_vigente === 100, 'y lo dice (precio_fm / precio_vigente)', JSON.stringify(propio));
    check(propio.eur_vigente === 2500, 'la vigente no se mueve', propio.eur_vigente);
    // La calculadora trae `financialsRes060FC` ya hecho con el precio FM: manda ese.
    const calc = resumenViaFm({ ...res, financialsRes060FC: { caeBonus: 6000 } }, { caePriceClient: 100, caePriceClientFm: 120 });
    check(calc.eur_fm === 6000 && calc.precio_fm === 120, 'con `financialsRes060FC` de la calculadora, su bono');
}

// Una oportunidad mínima que el motor sabe calcular (gasóleo, unifamiliar, Ciudad Real).
const dcBase = () => ({
    inputs: {
        provincia: '13', anio: 1995, tipo: 'unifamiliar', zona: 'D3', superficie: 150,
        boilerEff: 0.79, fuelType: 'gasoil', scopHeating: 3, scopAcs: 2.8, changeAcs: true,
        caePriceClient: 100,
    },
    result: {
        savings: { savingsKwh: 24000 },
        financials: { caeBonus: 2400, finalPriceClient: 100, legalizationCost: 0, isParticular: true },
        Q_net: 24000,
    },
});

console.log('\n3. Guardar quien NO es ADMIN');
{
    const base = viaFmDesdeDatosCalculo(dcBase(), { hoy: '2026-11-07' });
    check(base && base.mwh_fm > 0, 'el motor calcula la oportunidad de prueba', JSON.stringify(base));

    // En la BD la oportunidad tiene precio FM 120; el partner la guarda SIN él
    // (se le quitó al leer) y con un `via_fm` calculado a 100.
    const existente = { datos_calculo: { ...dcBase(), caePriceClientFm: 120, inputs: { ...dcBase().inputs, caePriceClientFm: 120, cae_client_rate_fm: 120 } } };
    const llega = { ...dcBase(), via_fm: { ...base, eur_fm: 1 } };
    await viaFmAlGuardar(llega, existente, false);
    check(llega.inputs.caePriceClientFm === 120 && llega.inputs.cae_client_rate_fm === 120 && llega.caePriceClientFm === 120,
        'el precio FM se RESTAURA (inputs y raíz)', JSON.stringify({ i: llega.inputs.caePriceClientFm, r: llega.caePriceClientFm }));
    check(llega.via_fm.precio_fm === 120 && Math.abs(llega.via_fm.eur_fm - base.mwh_fm * 120) <= 1,
        'y `via_fm` se REHACE con él', JSON.stringify(llega.via_fm));

    // Un partner que intenta ponerlo o cambiarlo: se queda el de la BD (o ninguno).
    const intenta = { ...dcBase(), inputs: { ...dcBase().inputs, caePriceClientFm: 200 } };
    await viaFmAlGuardar(intenta, { datos_calculo: dcBase() }, false);
    check(intenta.inputs.caePriceClientFm === undefined && intenta.via_fm.precio_fm === undefined,
        'no puede estrenar uno', JSON.stringify(intenta.inputs.caePriceClientFm));

    // ADMIN: no se toca nada (su navegador ya lo trae bien).
    const admin = { ...dcBase(), inputs: { ...dcBase().inputs, caePriceClientFm: 140 }, via_fm: { marca: 'navegador' } };
    await viaFmAlGuardar(admin, existente, true);
    check(admin.inputs.caePriceClientFm === 140 && admin.via_fm.marca === 'navegador', 'con ADMIN no se toca nada');
}

console.log('\n4. El precio FM no le llega a quien no es ADMIN');
{
    const dc = { caePriceClientFm: 120, inputs: { caePriceClient: 100, caePriceClientFm: 120, cae_client_rate_fm: 120 }, via_fm: { eur_fm: 1 } };
    const fuera = stripDatosCalculoMargin(dc);
    check(fuera.caePriceClientFm === undefined && fuera.inputs.caePriceClientFm === undefined && fuera.inputs.cae_client_rate_fm === undefined,
        'se quitan las dos claves a cualquier nivel', JSON.stringify(fuera));
    check(fuera.inputs.caePriceClient === 100, 'el precio general (del cliente) se conserva');
}

console.log('\n5. Sin ACS en la simulación (Fran, 07/11/2026: «que sea un aviso»)');
{
    const sin = { ...dcBase(), inputs: { ...dcBase().inputs, changeAcs: false } };
    const con = viaFmDesdeDatosCalculo(dcBase(), { hoy: '2026-11-07' });
    const via = viaFmDesdeDatosCalculo(sin, { hoy: '2026-11-07' });
    check(via.acs === 'supuesto' && via.elegible === true && Math.abs(via.mwh_fm - con.mwh_fm) < 0.01,
        'el resumen lo marca (`acs: supuesto`), sigue elegible y la cifra suma el ACS como si se añadiera', JSON.stringify({ via: via.mwh_fm, con: con.mwh_fm }));
    check(con.acs === undefined, 'con ACS no lleva la marca');
    const sinScop = viaFmDesdeDatosCalculo({ ...sin, inputs: { ...sin.inputs, scopAcs: 0 } }, { hoy: '2026-11-07' });
    // viaFmDesdeDatosCalculo pone SCOP_dhw 3,0 por defecto (como la calculadora): siempre hay uno.
    check(sinScop.acs === 'supuesto', 'sin SCOP_dhw tecleado, el de la app (3,0): también supuesto');

    const { estadoFc, lineaFactorCorreccion } = await front('calculator/logic/avisoFc.js');
    const { calculateRes060FM } = await front('calculator/logic/res060fc.js');
    const fm = calculateRes060FM({ provinciaCode: '13', anio: 1995, tipo: 'unifamiliar', zona: 'D3', superficie: 150,
        boilerEff: 0.79, scopHeating: 3, scopAcs: 2.8, changeAcs: false, qCalefaccion: 24000, contexto: { hoy: '2026-11-07' } });
    const e = estadoFc({ res060fc: fm, financials: { caeBonus: 1000 }, financialsRes060FC: { caeBonus: 5000 } }, {});
    check(e.procede && e.acs === 'supuesto', 'el aviso de la propuesta sabe que falta el ACS', JSON.stringify(e));
    const txtCliente = lineaFactorCorreccion({ ...e, tuteo: true });
    const txtPartner = lineaFactorCorreccion({ ...e, tuteo: false });
    check(/añadir a la instalación el depósito de ACS: esa cifra ya lo tiene en cuenta/.test(txtCliente), 'al cliente: hay que añadir el depósito y la cifra lo cuenta');
    check(/añadir al presupuesto el depósito de ACS/.test(txtPartner), 'al partner: al presupuesto');
    check(!/depósito de ACS/.test(lineaFactorCorreccion({ actual: 1000, fc: 5000 })), 'con ACS, el párrafo no cambia');
}

console.log('\n6. La vía elegida (`inputs.ruta_fm`) no la escribe el guardado de la calculadora');
{
    const { conservarRutaFm } = require('../utils/viaFmAlGuardar');
    const a = conservarRutaFm({ ruta_fm: true }, { datos_calculo: { inputs: {} } });
    check(a.ruta_fm === undefined, 'el navegador (o un partner) no la estrena');
    const b = conservarRutaFm({ ruta_fm: false }, { datos_calculo: { inputs: { ruta_fm: true } } });
    check(b.ruta_fm === true, 'ni la apaga: se queda la de la BD (la puso el conmutador o el expediente)');
    const c = conservarRutaFm({}, { datos_calculo: { inputs: { ruta_fm: false } } });
    check(c.ruta_fm === false, 'un navegador viejo sin la clave no la borra');
    const d = conservarRutaFm({ ruta_fm: true }, null);
    check(d.ruta_fm === undefined, 'oportunidad nueva: sin marca');
}

console.log(`\n═══ ${ok} correctas · ${ko} fallos ═══`);
process.exit(ko ? 1 : 0);
