// ============================================================================
// test_coste_verificacion.mjs — el coste del INFORME DE VERIFICACIÓN en la simulación.
// ----------------------------------------------------------------------------
//   1. NO-REGRESIÓN: sin coste tecleado, `calculateFinancials` devuelve lo de siempre.
//   2. El coste NO toca el beneficio de Brokergy: lo paga el SUJETO OBLIGADO
//      (decisión 2026-08-04, la misma que aplica `lotes/logic/loteEco.js`).
//   3. Su repercusión en €/MWh es coste ÷ MWh de la actuación, y por eso el mismo
//      informe pesa muy distinto según el tamaño del expediente.
//   4. El TECHO de lo que se le puede pedir al S.O. es la equivalencia financiera
//      menos esa repercusión: por encima, le sale más barato pagar al FNEE.
//   5. La equivalencia financiera es UNA sola (la de `calculation.js`), y `loteEco`
//      la reexporta: dos copias divergirían el año que el Ministerio la cambie.
//
//   node implementation/backend/scripts/test_coste_verificacion.mjs
// ============================================================================
import { pathToFileURL } from 'url';
import path from 'path';

const raiz = path.resolve(import.meta.dirname, '../../frontend/src/features');
const imp = (rel) => import(pathToFileURL(path.join(raiz, rel)).href);

const { calculateFinancials, EQUIVALENCIA_FINANCIERA } = await imp('calculator/logic/calculation.js');
// `loteEco.js` no se puede importar desde Node (sus imports van sin extension, que es
// lo que resuelve vite y Node no), asi que su reexport se comprueba sobre el FUENTE.
const { readFileSync } = await import('fs');
const fuenteLoteEco = readFileSync(path.join(raiz, 'lotes/logic/loteEco.js'), 'utf8');

let fallos = 0;
const cerca = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;
function ok(nombre, cond, detalle = '') {
    if (cond) { console.log(`  ✓ ${nombre}`); return; }
    fallos++;
    console.log(`  ✗ ${nombre}${detalle ? ' — ' + detalle : ''}`);
}

// Un expediente corriente: 30.000 kWh de ahorro, 100 €/MWh al cliente, 160 al S.O.
const BASE = {
    presupuesto: 12000, savingsKwh: 30000, caePriceClient: 100, caePriceSO: 160,
    aplicarIrpfCae: false, numOwners: 1,
};

console.log('\n1. Sin coste tecleado no cambia nada');
{
    const sin = calculateFinancials(BASE);
    const cero = calculateFinancials({ ...BASE, costeVerificacion: 0 });
    ok('omitirlo == 0', cerca(sin.profitBrokergy, cero.profitBrokergy, 1e-9) && cerca(sin.caeBonus, cero.caeBonus, 1e-9));
    ok('beneficio = (160 − 100) × 30 MWh', cerca(sin.profitBrokergy, 60 * 30), `${sin.profitBrokergy.toFixed(2)} €`);
    ok('sin coste, no se repercute nada', sin.costeVerifMwh === 0 && cerca(sin.costeSoMwh, 160));
}

console.log('\n2. El coste lo paga el S.O.: NO toca nuestro beneficio');
{
    const sin = calculateFinancials(BASE);
    const con = calculateFinancials({ ...BASE, costeVerificacion: 450 });
    ok('profitBrokergy idéntico', cerca(con.profitBrokergy, sin.profitBrokergy, 1e-9),
        `${con.profitBrokergy.toFixed(2)} vs ${sin.profitBrokergy.toFixed(2)}`);
    ok('el bono del cliente tampoco se mueve', cerca(con.caeBonus, sin.caeBonus, 1e-9));
}

console.log('\n3. La repercusión depende del TAMAÑO de la actuación');
{
    const grande = calculateFinancials({ ...BASE, savingsKwh: 110000, costeVerificacion: 1500 });
    const pequeno = calculateFinancials({ ...BASE, savingsKwh: 10000, costeVerificacion: 1500 });
    ok('1.500 € sobre 110 MWh = 13,64 €/MWh', cerca(grande.costeVerifMwh, 1500 / 110),
        `${grande.costeVerifMwh.toFixed(2)}`);
    ok('1.500 € sobre 10 MWh = 150 €/MWh', cerca(pequeno.costeVerifMwh, 150),
        `${pequeno.costeVerifMwh.toFixed(2)}`);
    ok('le cuesta al S.O. = precio + repercusión', cerca(grande.costeSoMwh, 160 + 1500 / 110));
    ok('y en euros = bono del S.O. + el informe', cerca(grande.costeSoTotal, 160 * 110 + 1500));
}

console.log('\n4. El TECHO: hasta dónde se le puede pedir');
{
    const r = calculateFinancials({ ...BASE, savingsKwh: 30000, costeVerificacion: 450 });
    const repercutido = 450 / 30;                       // 15 €/MWh
    ok('techo = equivalencia − repercusión', cerca(r.techoPrecioSo, EQUIVALENCIA_FINANCIERA - repercutido),
        `${r.techoPrecioSo.toFixed(2)} €/MWh`);
    ok('a 160 €/MWh todavía se ahorra', r.ahorroSoMwh > 0,
        `${r.ahorroSoMwh.toFixed(2)} €/MWh · ${Math.round(r.ahorroSoTotal)} €`);
    console.log(`     → le cuesta ${r.costeSoMwh.toFixed(2)} €/MWh · techo ${r.techoPrecioSo.toFixed(2)} · se ahorra ${r.ahorroSoMwh.toFixed(2)} (${Math.round(r.ahorroSoPct)} %)`);

    // Un informe desproporcionado para un expediente pequeño: al S.O. deja de salirle.
    const malo = calculateFinancials({ ...BASE, savingsKwh: 8000, costeVerificacion: 1500 });
    ok('con 1.500 € sobre 8 MWh, al S.O. ya NO le sale', malo.ahorroSoMwh < 0,
        `le cuesta ${malo.costeSoMwh.toFixed(2)} frente a ${EQUIVALENCIA_FINANCIERA}`);
    ok('y el techo se queda por debajo del precio pedido', malo.techoPrecioSo < 160,
        `${malo.techoPrecioSo.toFixed(2)} €/MWh`);
}

console.log('\n5. La equivalencia financiera es UNA sola');
{
    ok('el valor vigente es 198,62 \u20ac/MWh (2026)', EQUIVALENCIA_FINANCIERA === 198.62, String(EQUIVALENCIA_FINANCIERA));
    ok('loteEco la REEXPORTA y no la redefine',
        fuenteLoteEco.includes('export { EQUIVALENCIA_FINANCIERA } from')
        && !/export const EQUIVALENCIA_FINANCIERA\s*=/.test(fuenteLoteEco));
}

console.log('\n6. Un coste negativo o basura no rompe el cálculo');
{
    for (const v of [-500, 'abc', null, undefined, '']) {
        const r = calculateFinancials({ ...BASE, costeVerificacion: v });
        if (!(r.costeVerificacion === 0 && r.costeVerifMwh === 0 && cerca(r.costeSoMwh, 160))) {
            fallos++; console.log(`  ✗ costeVerificacion=${JSON.stringify(v)} → ${r.costeVerificacion}`);
        }
    }
    ok('se ignora lo que no sea un importe positivo', true);
}


console.log('\n7. NADA de lo que ya exist\u00eda cambia \u2014 ni con coste ni sin \u00e9l');
{
    // Los campos que `calculateFinancials` devolv\u00eda ANTES de que existiera el coste de
    // verificaci\u00f3n. Los leen el panel econ\u00f3mico del expediente, los lotes, el cuadro de
    // mando, la landing, la propuesta y el gemelo de Node: si el coste contaminara uno
    // solo, el mismo expediente dar\u00eda cifras distintas seg\u00fan por d\u00f3nde se mirase.
    const CAMPOS_PREVIOS = [
        'presupuesto', 'presupuestoFotovoltaica', 'presupuestoTotal',
        'caeBonus', 'irpfCaeAmount', 'caeNeto',
        'irpfDeduction', 'irpfDeductionPerOwner', 'numOwners',
        'totalBeneficioFiscal', 'totalAyuda', 'porcentajeCubierto', 'costeFinal',
        'caeMaintenanceCost', 'legalizationCost', 'irpfRate', 'irpfCap',
        'caePriceBrokergy', 'profitBrokergy', 'totalPrescriptor', 'prescriptorMode',
        'finalPriceClient', 'itpCost', 'itpPercent', 'includeItp',
        'titularType', 'isParticular', 'includeIVA',
    ];

    // Un barrido de casos reales, no uno solo: el que se rompe siempre es el que no se prob\u00f3.
    const CASOS = [
        ['vivienda corriente', {}],
        ['con ITP', { includeItp: true, itpPercent: 6 }],
        ['Brokergy asume certificados', { discountCertificates: true }],
        ['con legalizaci\u00f3n', { includeLegalization: true, legalizationPrice: 200, installerNoCard: true }],
        ['con comisi\u00f3n al cliente', { caePricePrescriptor: 10, prescriptorMode: 'client' }],
        ['con comisi\u00f3n a Brokergy', { caePricePrescriptor: 10, prescriptorMode: 'brokergy' }],
        ['empresa con IVA', { titularType: 'empresa', includeIVA: true, includeIrpf: false }],
        ['piso al 40 %', { tipo: 'piso', participation: 50 }],
        ['bloque de 85 viviendas', { esBloque: true, numOwners: 85 }],
        ['con IRPF sobre el CAE', { aplicarIrpfCae: true }],
        ['sin deducci\u00f3n', { includeIrpf: false }],
        ['ahorro peque\u00f1o', { savingsKwh: 4000 }],
        ['ahorro RES080 grande', { savingsKwh: 210000, presupuesto: 68000 }],
    ];

    let iguales = 0;
    for (const [nombre, extra] of CASOS) {
        const params = { ...BASE, ...extra };
        const sin = calculateFinancials(params);
        // El mismo caso con un coste de verificaci\u00f3n tecleado, y con uno enorme.
        for (const coste of [450, 12000]) {
            const con = calculateFinancials({ ...params, costeVerificacion: coste });
            const distintos = CAMPOS_PREVIOS.filter(k => {
                const a = sin[k], b = con[k];
                return (typeof a === 'number' && typeof b === 'number') ? !cerca(a, b, 1e-9) : a !== b;
            });
            if (distintos.length) {
                fallos++;
                console.log(`  \u2717 ${nombre} (coste ${coste} \u20ac) \u2014 cambian: ${distintos.join(', ')}`);
            } else iguales++;
        }
    }
    ok(`${CASOS.length} casos \u00d7 2 importes: ning\u00fan campo anterior se mueve`, iguales === CASOS.length * 2);

    // Y sin el par\u00e1metro, el objeto es EL MISMO que con 0 (lo que reciben los 15
    // consumidores que no lo pasan: expedientes, lotes, dashboard, landing\u2026).
    const a = calculateFinancials(BASE);
    const b = calculateFinancials({ ...BASE, costeVerificacion: 0 });
    ok('omitirlo devuelve exactamente lo mismo que 0',
        JSON.stringify(a) === JSON.stringify(b));
}

console.log(fallos === 0 ? '\n✅ Todo correcto\n' : `\n❌ ${fallos} comprobacion(es) fallidas\n`);
process.exit(fallos === 0 ? 0 : 1);
