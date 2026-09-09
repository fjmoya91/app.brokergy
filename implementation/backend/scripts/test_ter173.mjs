/**
 * test_ter173.mjs — la ficha TER173, de la fórmula al impreso oficial.
 * ---------------------------------------------------------------------------
 * TER173 es la hibridación en paralelo del sector TERCIARIO: los tres sumandos de
 * la TER100 (calefacción · ACS · piscina) ponderados por el coeficiente de
 * cobertura por bivalencia de la RES093:
 *
 *     AE_TOTAL = (AE_C + AE_ACS + AE_CAP) · C_b
 *
 * Lo que se comprueba aquí es justo lo que no da error cuando se rompe:
 *   · que el C_b pondera los TRES servicios y no solo la calefacción,
 *   · que la tabla del Anexo IV es la que ya usa la RES093 (se compara valor a
 *     valor con el PDF del Ministerio),
 *   · que un TER173 SIN datos de hibridación se detecta (`cbIncompleto`) en vez de
 *     calcular con C_b = 1, que da un ahorro MÁS ALTO que el real y va firmado,
 *   · y que las 22 casillas del impreso oficial quedan escritas.
 *
 * No toca la base de datos, ni Drive, ni envía nada.
 *
 *   node implementation/backend/scripts/test_ter173.mjs
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { rellenar } = require('../services/formularioOficialService');
const { PDFDocument, PDFTextField } = require('pdf-lib');
const { FICHAS, correlativoInicial, detectPrograma, esHibridacion, esTerciario } = require('../utils/fichas');

const F = '../../frontend/src/features/expedientes';
const { fichaFormulario } = await import(`${F}/logic/fichasFormulario.js`);
const { deriveTerciarioVars, esTer173, fichaTerciaria } = await import(`${F}/logic/terciario.js`);
const { deriveFichaTer173 } = await import(`${F}/logic/fichaTer173.js`);
const { getCb, BIVALENCE_TABLE, calculateTerciario, BOILER_EFFICIENCIES } = await import('../../frontend/src/features/calculator/logic/calculation.js');
const { resolveDacs, ACS_METHOD } = await import(`${F}/logic/demandaAcs.js`);
const { fichaDesdeInputs, SECTORES } = await import(`${F}/logic/expedienteTaxonomia.js`);

let ok = 0, ko = 0;
const check = (c, msg, extra) => {
    if (c) { ok++; console.log(`  ✓ ${msg}`); }
    else { ko++; console.log(`  ✗ ${msg}${extra !== undefined ? ` → ${extra}` : ''}`); }
};
const casi = (a, b, tol = 0.5) => Math.abs(a - b) <= tol;

// ─── El expediente de laboratorio ────────────────────────────────────────────
// Un hotel en zona D3 con caldera de gasóleo hibridada con aerotermia, ACS con el
// mismo equipo y piscina climatizada. Números redondos para poder comprobar la
// aritmética a mano.
const base = {
    numero_expediente: '26TER173_1',
    oportunidades: { ficha: 'TER173', datos_calculo: { inputs: {}, zona: 'D3' } },
    clientes: { nombre_razon_social: 'HOTEL EJEMPLO SL', dni: 'B13123456', municipio: 'Tomelloso', provincia: 'Ciudad Real' },
    instalacion: {
        ref_catastral: '0005721VJ8100N0001TP', ccaa: 'Castilla-La Mancha',
        cambio_calefaccion: true, cambio_acs: true, misma_aerotermia_acs: true,
        caldera_antigua_cal: { rendimiento_id: 'default' },   // η_i = 0,92
        aerotermia_cal: { scop: 4.00, numero_serie: 'SERIE-1' },
        // Hibridación por POTENCIA DE CALDERA: 40 kW de bomba sobre 80 kW de caldera
        // = 50 % de cobertura → C_b = 0,8045 (valor exacto de la tabla).
        hibridacion: true, hibridacion_metodo: 'caldera',
        potencia_bomba: 40, potencia_caldera: 80,
        piscina: { activa: true, demanda_kwh: 30000, scop: 3.00, equipo: { numero_serie: 'SERIE-PIS' } },
    },
    // D_C = 100 kWh/m²·año · S = 1.000 m² → Q_H = 100.000 kWh/año
    cee: { cee_inicial: { demandaCalefaccion: 100, superficieHabitable: 1000, demandaACS: 20 } },
    documentacion: { fecha_inicio_cifo: '2026-01-12', fecha_fin_cifo: '2026-02-28' },
};
const con = (patch) => ({ ...base, ...patch });

console.log('═══ Ficha TER173 · hibridación en paralelo, sector terciario ═══');

// ── 1. La ficha se reconoce por todas las vías ──────────────────────────────
console.log('\n1. TER173 se reconoce y no se confunde con TER100 ni con RES093');
check(FICHAS.includes('TER173'), 'está en la lista de fichas del backend');
check(correlativoInicial('TER173') === 1, 'su correlativo arranca en 1 (no hay heredados)', correlativoInicial('TER173'));
check(detectPrograma({ numero_expediente: '26TER173_1' }, {}) === 'TER173', 'el número de expediente la identifica');
check(detectPrograma({}, { ficha: 'TER173', datos_calculo: { inputs: { hibridacion: true } } }) === 'TER173',
    'declarada en la oportunidad MANDA sobre `hibridacion` en los inputs (si no, saldría RES093)');
check(esHibridacion('TER173') && esHibridacion('RES093'), 'cuenta como hibridación, igual que la RES093');
check(esTerciario('TER173') && esTerciario('TER100'), 'y como terciaria, igual que la TER100');
check(fichaTerciaria({ numero_expediente: '26TER173_1' }) === 'TER173' && esTer173(base), 'el módulo del terciario la resuelve');
check(fichaTerciaria({ numero_expediente: '26TER100_3' }) === 'TER100', 'y sigue distinguiendo la TER100');

// ── 2. La tabla del Anexo IV es la MISMA que la del Anexo III de la RES093 ───
console.log('\n2. La tabla del C_b coincide con el Anexo IV del PDF oficial');
{
    // Copiada del Anexo IV de la ficha TER173 (columna AEROTERMIA), tal cual.
    const ANEXO_IV = [[20, 39.46], [25, 48.28], [30, 56.44], [35, 63.80], [40, 70.22], [45, 75.67],
                      [50, 80.45], [55, 84.57], [60, 88.08], [65, 90.81], [70, 92.99], [75, 94.80],
                      [80, 96.08], [85, 97.07], [90, 97.84], [95, 98.38]];
    const desajustes = ANEXO_IV.filter(([pct, cb]) => {
        const fila = BIVALENCE_TABLE.find(r => Math.abs(r.coverage * 100 - pct) < 0.001);
        return !fila || Math.abs(fila.cb * 100 - cb) > 0.001;
    });
    check(desajustes.length === 0, `los ${ANEXO_IV.length} escalones del Anexo IV están en BIVALENCE_TABLE`,
        JSON.stringify(desajustes));
    check(casi(getCb(0.50), 0.8045, 1e-6), 'al 50 % de cobertura, C_b = 0,8045', getCb(0.50));
    // Interpolación lineal entre 50 % (0,8045) y 55 % (0,8457): a mitad, 0,8251.
    check(casi(getCb(0.525), 0.8251, 0.0005), 'interpola linealmente entre escalones', getCb(0.525));
}

// ── 3. El C_b pondera los TRES servicios (apartado 4 de la ficha) ───────────
// ── 2.b. El η_i sale del Anexo VIII de la propia ficha ──────────────────────
console.log('\n2.b La tabla de rendimientos de caldera coincide con el Anexo VIII');
{
    // Copiada del Anexo VIII de la ficha TER173 (tabla B.3, "rendimiento estacional
    // por defecto basado en el combustible, la antigüedad y el tipo de caldera"),
    // que es de donde sale el η_i cuando no consta el de la instalación existente.
    const ANEXO_VIII = [
        ['gas_pre79', 0.55], ['gas_79_97', 0.65], ['gas_pre98_mural', 0.65],
        ['gas_pre98_cap_alta', 0.68], ['gas_pre98_cap_baja', 0.72], ['gas_pre98_cond', 0.85],
        ['gas_post98_piloto', 0.69], ['gas_post98_auto', 0.73],
        ['gas_post98_cond_piloto', 0.79], ['gas_post98_cond_auto', 0.83],
        ['oil_pre85', 0.65], ['oil_85_97', 0.70], ['oil_post98', 0.79], ['oil_cond', 0.83],
        ['solid_man_no_cal', 0.55], ['solid_man_cal', 0.60],
        ['solid_auto', 0.60], ['solid_auto_cal', 0.65],
    ];
    const desajustes = ANEXO_VIII.filter(([id, v]) => {
        const fila = BOILER_EFFICIENCIES.find(b => b.id === id);
        return !fila || Math.abs(fila.value - v) > 1e-9;
    });
    check(desajustes.length === 0, `las ${ANEXO_VIII.length} filas del Anexo VIII están en BOILER_EFFICIENCIES`,
        JSON.stringify(desajustes));
}

console.log('\n3. AE_TOTAL = (AE_C + AE_ACS + AE_CAP) · C_b');
{
    const t = deriveTerciarioVars(base);
    // A mano, con η_i = 0,92:
    //   AE_C   = (1/0,92 − 1/4,00) · 100.000 = 83.695,65
    //   AE_ACS = (1/0,92 − 1/4,00) ·  20.000 = 16.739,13   (D_ACS = 20 × 1.000)
    //   AE_CAP = (1/0,92 − 1/3,00) ·  30.000 = 22.608,70
    const aeC = (1 / 0.92 - 1 / 4) * 100000;
    const aeAcs = (1 / 0.92 - 1 / 4) * 20000;
    const aeCap = (1 / 0.92 - 1 / 3) * 30000;
    check(casi(t.savings.aeCal, aeC), `AE_C = ${aeC.toFixed(2)}`, t.savings.aeCal);
    check(casi(t.savings.aeAcs, aeAcs), `AE_ACS = ${aeAcs.toFixed(2)}`, t.savings.aeAcs);
    check(casi(t.savings.aeCap, aeCap), `AE_CAP = ${aeCap.toFixed(2)}`, t.savings.aeCap);
    check(casi(t.cb, 0.8045, 1e-6), 'C_b = 0,8045 (40 kW de bomba sobre 80 kW de caldera)', t.cb);
    check(casi(t.savingsSinCb, aeC + aeAcs + aeCap), 'Σ AE sin ponderar', t.savingsSinCb);
    check(casi(t.savingsKwh, (aeC + aeAcs + aeCap) * 0.8045), 'AE_TOTAL lleva el C_b aplicado al TOTAL', t.savingsKwh);
    // Lo que de verdad separa esto de "el C_b solo a la calefacción": si únicamente
    // ponderara AE_C, el total sería 106.681 en vez de 98.989 — un 7,8 % de más, y
    // ese exceso es ahorro que sigue aportando la caldera.
    const soloCal = aeC * 0.8045 + aeAcs + aeCap;
    check(!casi(t.savingsKwh, soloCal, 100), 'y NO se pondera solo la calefacción', `solo-cal daría ${soloCal.toFixed(0)}`);
}

// ── 4. TER100 no cambia: su C_b es 1 ────────────────────────────────────────
console.log('\n4. La TER100 sigue sin ponderar (su ficha es de sustitución total)');
{
    const t100 = deriveTerciarioVars(con({ numero_expediente: '26TER100_3', oportunidades: { ficha: 'TER100', datos_calculo: { inputs: {} } } }));
    check(t100.cb === 1, 'C_b = 1', t100.cb);
    check(casi(t100.savingsKwh, t100.savingsSinCb), 'AE_TOTAL es la suma cruda de los tres sumandos');
    check(!t100.cbIncompleto, 'y no reclama datos de hibridación que su ficha no usa');
}

// ── 5. Sin datos de hibridación, se DETECTA (no se calcula con C_b = 1) ─────
console.log('\n5. Un TER173 sin potencias no se calcula como si fuera una sustitución');
{
    const sinPot = deriveTerciarioVars(con({
        instalacion: { ...base.instalacion, potencia_bomba: 0, potencia_caldera: 0 },
    }));
    check(sinPot.cbIncompleto === true, 'queda marcado `cbIncompleto` para que el CIFO lo bloquee');
    check(sinPot.cb === 1, 'el C_b cae a 1 (no se penaliza a ciegas), pero avisado', sinPot.cb);
}

// ── 6. El alcance: un servicio fuera NO entra en la fórmula ─────────────────
console.log('\n6. Un servicio fuera del alcance queda fuera de la suma');
{
    const soloAcs = deriveTerciarioVars(con({
        instalacion: { ...base.instalacion, cambio_calefaccion: false, piscina: { activa: false } },
    }));
    check(soloAcs.savings.aeCal === 0 && soloAcs.savings.aeCap === 0, 'calefacción y piscina no suman');
    check(soloAcs.savings.aeAcs > 0, 'el ACS sí');
    check(casi(soloAcs.savingsKwh, soloAcs.savings.aeAcs * 0.8045), 'y el C_b se aplica igual', soloAcs.savingsKwh);
}

// ── 7. El impreso OFICIAL se rellena entero ─────────────────────────────────
console.log('\n7. Las 22 casillas del impreso oficial quedan escritas');
{
    const form = fichaFormulario('TER173', base);
    check(form.plantilla === 'TER173', 'el formulario apunta a la plantilla TER173', form.plantilla);
    const { pdf, avisos } = await rellenar(form.plantilla, form.campos, { fdo: form.fdo });
    check(avisos.length === 0, 'el impreso acepta TODOS los campos (ni una errata de nombre)', avisos.join(' · '));

    const doc = await PDFDocument.load(pdf);
    const escritos = {};
    for (const f of doc.getForm().getFields()) {
        if (f instanceof PDFTextField) escritos[f.getName()] = f.getText() || '';
    }
    check(doc.getPageCount() === 5, 'el PDF tiene las 5 páginas del impreso', doc.getPageCount());
    // Los tres apartados, con los sufijos que el formulario le pone a los repetidos.
    for (const [campo, esperado] of [
        ['ni', '0,92'], ['SCOP', '4,00'], ['Dc', '100,00'], ['S', '1000,00'], ['Fp', '1'],
        ['ni-0', '0,92'], ['SCOPdhw', '4,00'], ['Fp-0', '1'],
        ['FP', '1'], ['ni-1', '0,92'], ['SCOPpwh', '3,00'], ['Di', '15'],
    ]) {
        check(escritos[campo] === esperado, `${campo} = "${esperado}"`, escritos[campo]);
    }
    const vacios = Object.entries(escritos).filter(([, v]) => !String(v).trim()).map(([k]) => k);
    check(vacios.length === 0, 'no queda ni una casilla en blanco', vacios.join(', '));

    const d = deriveFichaTer173(base);
    check(escritos['AEtotal'] === d.aeTotal, 'el AE_TOTAL impreso es el ponderado', `${escritos['AEtotal']} vs ${d.aeTotal}`);
    // ⚠️ Y por eso NO es la suma de los tres sumandos que el impreso sí escribe: su
    // tabla de resultado no reserva casilla para el C_b. Lo explica el CIFO.
    const suma = [d.aeCal, d.aeAcs, d.aeCap].reduce((a, v) => a + Number(String(v).replace(/\./g, '')), 0);
    check(suma !== Number(d.aeTotal.replace(/\./g, '')),
        'el impreso NO tiene casilla de C_b: su total no cuadra con la suma (lo explica el CIFO)',
        `Σ=${suma} · total=${d.aeTotal}`);
}

// ── 8. Con el ACS fuera de alcance, "no aplica" (regla 12.b) ────────────────
console.log('\n8. Fuera de alcance se imprime "no aplica", nunca 0');
{
    const exp = con({ instalacion: { ...base.instalacion, cambio_acs: false, piscina: { activa: false } } });
    const form = fichaFormulario('TER173', exp);
    const { pdf } = await rellenar(form.plantilla, form.campos, {});
    const doc = await PDFDocument.load(pdf);
    const g = (n) => doc.getForm().getTextField(n).getText();
    check(g('DACS') === 'no aplica', 'D_ACS = "no aplica"', g('DACS'));
    check(g('SCOPdhw') === 'no aplica', 'SCOP_dhw = "no aplica"', g('SCOPdhw'));
    check(g('DCAP') === 'no aplica', 'D_CAP = "no aplica"', g('DCAP'));
    check(g('SCOPpwh') === 'no aplica', 'SCOP_pwh = "no aplica"', g('SCOPpwh'));
}

// ── 9. calculateTerciario: el C_b es un parámetro, no una rama ──────────────
console.log('\n9. La fórmula es UNA, con el C_b como parámetro');
{
    const args = { q_net_heating: 100000, dacs: 20000, dcap: 0, boilerEff: 0.92, scopHeating: 4, scopAcs: 4, changeHeating: true, changeAcs: true };
    const sinCb = calculateTerciario(args);
    const conCb = calculateTerciario({ ...args, cb: 0.8045 });
    check(sinCb.cb === 1, 'sin C_b, vale 1 (comportamiento TER100)', sinCb.cb);
    check(casi(conCb.savingsKwh, sinCb.savingsKwh * 0.8045), 'con C_b, el total se pondera', conCb.savingsKwh);
    check(casi(conCb.aeCal, sinCb.aeCal) && casi(conCb.aeAcs, sinCb.aeAcs), 'los sumandos NO se tocan (son los que imprime la ficha)');
}

// ── 10. De la CALCULADORA al EXPEDIENTE: el mismo número ────────────────────
// Es el riesgo de verdad de poder crear un TER173 desde la oportunidad: que la
// propuesta que firma el cliente y el expediente que nace de ella calculen
// ahorros distintos. Aquí se recorre el camino entero con los mismos datos.
console.log('\n10. La propuesta y el expediente que nace de ella dan lo MISMO');
{
    // (a) Lo que el ADMIN marca en la calculadora, con un CEE cargado.
    const xml = { demandaCalefaccion: 100, superficieHabitable: 1000, demandaACS: 20 };
    const inputs = {
        sector: SECTORES.TERCIARIO,
        hibridacion: true, hibridacionMetodo: 'caldera', potenciaBomba: 40, potenciaCaldera: 80,
        changeHeating: true, changeAcs: true,
        acsMethod: ACS_METHOD.XML, numRooms: 4, dacsManual: 0,
        piscinaActiva: true, dcap: 30000, scopPool: 3,
        boilerId: 'default', scopHeating: 4, scopAcs: 4,
        demandMode: 'real', xmlDemandData: xml,
    };

    check(fichaDesdeInputs(inputs) === 'TER173', 'la calculadora la reconoce como TER173', fichaDesdeInputs(inputs));
    check(detectPrograma({}, { datos_calculo: { inputs } }) === 'TER173',
        'y el backend la guarda como TER173', detectPrograma({}, { datos_calculo: { inputs } }));

    // (b) El ahorro tal y como lo calcula la CALCULADORA (CalculatorView).
    const dacsCalc = resolveDacs(
        { acs_method: inputs.acsMethod, num_rooms: inputs.numRooms, dacs_manual: inputs.dacsManual },
        { demandaACS: xml.demandaACS, superficieHabitable: xml.superficieHabitable },
    ).value;
    check(casi(dacsCalc, 20000), 'la D_ACS sale del CEE cargado: 20 kWh/m²·año × 1.000 m²', dacsCalc);
    check(!casi(dacsCalc, 2731.4, 1), 'y NO el 2.731,4 cableado que usaba antes', dacsCalc);

    const savingsCalc = calculateTerciario({
        q_net_heating: xml.demandaCalefaccion * xml.superficieHabitable,
        dacs: dacsCalc,
        dcap: inputs.dcap,
        boilerEff: BOILER_EFFICIENCIES.find(b => b.id === inputs.boilerId).value,
        scopHeating: inputs.scopHeating, scopAcs: inputs.scopAcs, scopPool: inputs.scopPool,
        changeHeating: true, changeAcs: true, changePool: true,
        cb: getCb(inputs.potenciaBomba / inputs.potenciaCaldera),
    }).savingsKwh;

    // (c) El EXPEDIENTE que `expedienteService` siembra a partir de esos inputs.
    const expediente = {
        numero_expediente: '26TER173_1',
        oportunidades: { ficha: 'TER173', datos_calculo: { inputs } },
        instalacion: {
            cambio_calefaccion: inputs.changeHeating !== false,
            cambio_acs: true, misma_aerotermia_acs: true,
            caldera_antigua_cal: { rendimiento_id: inputs.boilerId },
            aerotermia_cal: { scop: inputs.scopHeating },
            hibridacion: true,
            hibridacion_metodo: inputs.hibridacionMetodo,
            potencia_bomba: inputs.potenciaBomba,
            potencia_caldera: inputs.potenciaCaldera,
            piscina: { activa: inputs.piscinaActiva, demanda_kwh: inputs.dcap, scop: inputs.scopPool },
        },
        cee: {
            cee_inicial: xml,
            acs_method: inputs.acsMethod,
            dacs_manual: inputs.dacsManual,
            num_rooms: inputs.numRooms,
        },
    };
    const savingsExp = deriveTerciarioVars(expediente).savingsKwh;

    check(casi(savingsCalc, savingsExp, 1),
        'el ahorro de la propuesta y el del expediente COINCIDEN',
        `propuesta ${Math.round(savingsCalc)} · expediente ${Math.round(savingsExp)}`);
    check(savingsCalc > 0, 'y no es cero', Math.round(savingsCalc));

    // (d) Sin heredar el alcance, el expediente daría OTRA cifra. Es lo que pasaba
    //     antes de que `expedienteService` copiase piscina y D_ACS de la simulación.
    const sinHeredar = deriveTerciarioVars({
        ...expediente,
        instalacion: { ...expediente.instalacion, piscina: { activa: false } },
        cee: { cee_inicial: xml },   // sin acs_method → cae al modo 'xml' por defecto
    }).savingsKwh;
    check(!casi(sinHeredar, savingsExp, 100),
        'y sin heredar la piscina, el expediente daría otra cosa (por eso se hereda)',
        `${Math.round(sinHeredar)} vs ${Math.round(savingsExp)}`);
}

console.log(`\n═══ ${ok} correctas · ${ko} fallos ═══`);
process.exit(ko ? 1 : 0);
