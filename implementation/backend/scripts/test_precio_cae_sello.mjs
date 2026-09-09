/**
 * test_precio_cae_sello.mjs — el precio CAE llega al expediente, y solo en las nuevas.
 * ---------------------------------------------------------------------------
 * Aquí se juega dinero por los dos lados:
 *   · si el sello NO se escribe, el precio que se teclea en la calculadora no
 *     llega al expediente y su panel calcula con el respaldo (95 €/MWh, 60 en
 *     RES080) — que es lo que pasaba hasta el 09/09/2026 en 66 expedientes;
 *   · si se escribe de MÁS, le cambia el bono a expedientes ya en marcha.
 *
 * No toca la base de datos.
 *
 *   node implementation/backend/scripts/test_precio_cae_sello.mjs
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { sellarPrecioCae } = require('../utils/precioCae');

const C = await import('../../frontend/src/features/calculator/logic/calculation.js');
const { CAE_PRECIO_CLIENTE_NUEVAS, CAE_PRECIO_CLIENTE_ANTERIOR } = C;
const F = '../../frontend/src/features/expedientes';
const { computeExpedienteFinancials } = await import(`${F}/logic/expedienteFinancials.js`);

let ok = 0, ko = 0;
const check = (c, msg, extra) => {
    if (c) { ok++; console.log(`  ✓ ${msg}`); }
    else { ko++; console.log(`  ✗ ${msg}${extra !== undefined ? ` → ${extra}` : ''}`); }
};

const opConSello = (precio) => ({ datos_calculo: { inputs: { caePriceClient: precio, cae_client_rate: precio } } });
const opSinSello = (precio) => ({ datos_calculo: { inputs: { caePriceClient: precio } } });

console.log('═══ El precio CAE del cliente: sellado, y solo en las nuevas ═══');

console.log('\n1. Una oportunidad NUEVA se lleva su precio puesto');
{
    const inputs = { caePriceClient: 100 };
    sellarPrecioCae(inputs, null);
    check(inputs.cae_client_rate === 100, 'se sella con el precio tecleado', inputs.cae_client_rate);
    check(CAE_PRECIO_CLIENTE_NUEVAS === 100, 'y el que compone la calculadora hoy es 100 €/MWh', CAE_PRECIO_CLIENTE_NUEVAS);
}

console.log('\n2. Una oportunidad ANTERIOR no estrena el sello al reguardarse');
{
    // El caso real: 66 expedientes con un precio tecleado que su panel ignora.
    // Reguardar uno NO puede empezar a aplicárselo: hay obra en marcha sobre la
    // cifra que el panel viene dando.
    const inputs = { caePriceClient: 150 };
    sellarPrecioCae(inputs, opSinSello(150));
    check(inputs.cae_client_rate === undefined, 'no se le pone sello', inputs.cae_client_rate);
    // Y aunque el navegador lo mandara, se quita: el sello lo decide el servidor.
    const forzado = { caePriceClient: 150, cae_client_rate: 150 };
    sellarPrecioCae(forzado, opSinSello(150));
    check(forzado.cae_client_rate === undefined, 'y si llega en el payload, se retira', forzado.cae_client_rate);
}

console.log('\n3. Una ya sellada se mantiene AL DÍA');
{
    // Sellar solo en el alta dejaría el sello viejo al cambiar el precio, y el
    // expediente calcularía con una tarifa que ya nadie ve en la calculadora.
    const inputs = { caePriceClient: 112 };
    sellarPrecioCae(inputs, opConSello(100));
    check(inputs.cae_client_rate === 112, 'el sello sigue al precio nuevo', inputs.cae_client_rate);
}

console.log('\n4. Sin precio no se inventa nada');
{
    const a = {}; sellarPrecioCae(a, null);
    check(a.cae_client_rate === undefined, 'una nueva sin precio no se sella', a.cae_client_rate);
    const b = { caePriceClient: 0 }; sellarPrecioCae(b, null);
    check(b.cae_client_rate === undefined, 'un 0 tampoco (no es un precio)', b.cae_client_rate);
    check(sellarPrecioCae(null, null) === null, 'sin inputs no revienta');
}

console.log('\n5. De punta a punta: lo que ve el panel del expediente');
{
    const exp = (op) => ({
        numero_expediente: '26RES060_999',
        oportunidades: { ficha: 'RES060', ...op },
        instalacion: {
            caldera_antigua_cal: { rendimiento_id: 'oil_post98' },
            aerotermia_cal: { scop: 4 }, cambio_acs: false, misma_aerotermia_acs: true,
        },
        cee: { cee_inicial: { demandaCalefaccion: 100, superficieHabitable: 200, demandaACS: 0 } },
    });
    // Ahorro = (1/0,79 − 1/4) · 20.000 = 20.316 kWh → 20,316 MWh.
    const mwh = 20.316;
    const caeDe = (op) => computeExpedienteFinancials(exp(op)).cae;

    const sinSello = caeDe(opSinSello(112));
    check(Math.abs(sinSello - mwh * CAE_PRECIO_CLIENTE_ANTERIOR.estandar) < 5,
        `una oportunidad ANTERIOR sigue calculando a ${CAE_PRECIO_CLIENTE_ANTERIOR.estandar} €/MWh`, Math.round(sinSello));

    const conSello = caeDe(opConSello(112));
    check(Math.abs(conSello - mwh * 112) < 5, 'una SELLADA calcula con su precio (112 €/MWh)', Math.round(conSello));
    check(conSello > sinSello, 'y por eso el sello cambia la cifra', `${Math.round(sinSello)} € → ${Math.round(conSello)} €`);

    // El override del expediente manda sobre todo lo demás.
    const e = exp(opConSello(112));
    e.instalacion.economico_override = { cae_client_rate: 80 };
    const conOverride = computeExpedienteFinancials(e).cae;
    check(Math.abs(conOverride - mwh * 80) < 5, 'el override del expediente sigue mandando sobre el sello', Math.round(conOverride));
}

console.log('\n5.b Un RES080 anterior conserva SU respaldo, que no es el mismo');
{
    // Los dos CEE lo llevan a la rama RES080, cuyo respaldo es 60 EUR/MWh y no 95.
    const cee = (cal, acs) => ({
        demandaCalefaccion: cal, superficieHabitable: 100, demandaACS: acs,
        emisionesCalefaccion: cal, emisionesACS: acs, emisionesRefrigeracion: 0,
    });
    const exp080 = {
        numero_expediente: '26RES080_999',
        oportunidades: { ficha: 'RES080', datos_calculo: { inputs: { caePriceClient: 150 } } },
        instalacion: {},
        cee: {
            cee_inicial: cee(30, 5), cee_final: cee(10, 2),
            comb_cal_inicial: 'Gasoleo Calefacción', comb_cal_final: 'Electricidad peninsular',
            comb_acs_inicial: 'Gasoleo Calefacción', comb_acs_final: 'Electricidad peninsular',
        },
    };
    const fin = computeExpedienteFinancials(exp080);
    const esperado = (fin.savingsKwh / 1000) * CAE_PRECIO_CLIENTE_ANTERIOR.res080;
    check(fin.savingsKwh > 0, 'el RES080 de laboratorio calcula ahorro', Math.round(fin.savingsKwh));
    check(Math.abs(fin.cae - esperado) < 5,
        'sin sello sigue a ' + CAE_PRECIO_CLIENTE_ANTERIOR.res080 + ' EUR/MWh, pese a tener 150 tecleados',
        Math.round(fin.cae) + ' vs ' + Math.round(esperado));
}

console.log('\n6. RES080 conserva SU respaldo, que no es el mismo');
{
    check(CAE_PRECIO_CLIENTE_ANTERIOR.res080 === 60 && CAE_PRECIO_CLIENTE_ANTERIOR.estandar === 95,
        'los respaldos siguen siendo 95 y 60 €/MWh (lo ya calculado no se mueve)',
        JSON.stringify(CAE_PRECIO_CLIENTE_ANTERIOR));
}

console.log(`\n═══ ${ok} correctas · ${ko} fallos ═══`);
process.exit(ko ? 1 : 0);
