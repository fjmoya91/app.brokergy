// ============================================================================
// test_bloque_viviendas.mjs — el BLOQUE DE VIVIENDAS, de punta a punta y sin BD.
// ----------------------------------------------------------------------------
// Lo que vigila, y por qué cada cosa:
//
//   1. NO-REGRESIÓN. `calculateSavings` con la calefacción dentro del alcance (el
//      valor por defecto) tiene que devolver EXACTAMENTE lo de siempre. El parámetro
//      `changeHeating` se añadió para los bloques; si moviera una vivienda, movería
//      el ahorro de toda propuesta nueva.
//   2. El servicio que queda FUERA del alcance se cancela (no resta, no suma), que es
//      el mismo mecanismo que el ACS ya tenía.
//   3. Con solo ACS, el ahorro es el término de la ficha: (1/η − 1/SCOP_dhw) · D_ACS.
//   4. La D_ACS de un edificio sale del certificado: kWh/m²·año × superficie útil.
//   5. La deducción del IRPF de un bloque es la del EDIFICIO (60 %), repartida entre
//      propietarios, y no la baja una participación heredada.
//   6. El `<TipoDeEdificio>` del .xml se clasifica sin casar cadenas exactas.
//
//   node implementation/backend/scripts/test_bloque_viviendas.mjs
// ============================================================================
import { pathToFileURL } from 'url';
import path from 'path';

const raiz = path.resolve(import.meta.dirname, '../../frontend/src/features');
const imp = (rel) => import(pathToFileURL(path.join(raiz, rel)).href);

const { calculateSavings, calculateFinancials } = await imp('calculator/logic/calculation.js');
const { resolveDacs, ACS_METHOD } = await imp('expedientes/logic/demandaAcs.js');
const { esBloque, clasificarTipoEdificio, TIPO_INMUEBLE } = await imp('calculator/logic/tipoInmueble.js');

let fallos = 0;
const cerca = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;
function ok(nombre, cond, detalle = '') {
    if (cond) { console.log(`  ✓ ${nombre}`); return; }
    fallos++;
    console.log(`  ✗ ${nombre}${detalle ? ' — ' + detalle : ''}`);
}

// ── 1. No-regresión: una vivienda de siempre ────────────────────────────────
console.log('\n1. Una VIVIENDA no cambia (la calefacción sigue en el alcance por defecto)');
{
    const base = { q_net_heating: 12000, dacs: 2731.4, boilerEff: 0.92, scopHeating: 3.5, scopAcs: 2.8 };
    const sinParam = calculateSavings({ ...base, changeAcs: true });
    const conTrue = calculateSavings({ ...base, changeAcs: true, changeHeating: true });
    ok('omitir changeHeating == changeHeating:true', cerca(sinParam.savingsKwh, conTrue.savingsKwh, 1e-9));

    // El valor de siempre, calculado a mano desde la fórmula de la ficha.
    const esperado = (12000 / 0.92 - 12000 / 3.5) + (2731.4 / 0.92 - 2731.4 / 2.8);
    ok('ahorro = calefacción + ACS', cerca(sinParam.savingsKwh, esperado),
        `${sinParam.savingsKwh.toFixed(2)} vs ${esperado.toFixed(2)}`);

    // Y sin tocar el ACS, el ACS no aporta nada: el caso que ya existía.
    const soloCal = calculateSavings({ ...base, changeAcs: false });
    ok('sin ACS en alcance, solo ahorra la calefacción',
        cerca(soloCal.savingsKwh, 12000 / 0.92 - 12000 / 3.5));
}

// ── 2 y 3. Bloque con caldera centralizada de SOLO ACS ──────────────────────
console.log('\n2. BLOQUE de 85 viviendas, caldera centralizada de solo ACS');
{
    // Caso del edificio de CL Fuenmayor 66-74 (Logroño): 85 viviendas, ~8.000 m²
    // útiles y una demanda de ACS de 20 kWh/m²·año en su certificado.
    const supEdificio = 8000;
    const dacsPorM2 = 20;
    const { value: dacs, mode } = resolveDacs(
        { acs_method: ACS_METHOD.XML },
        { demandaACS: dacsPorM2, superficieHabitable: supEdificio },
    );
    ok('D_ACS = demanda del CEE × superficie útil', cerca(dacs, 160000) && mode === 'xml',
        `${dacs} kWh/año`);

    const r = calculateSavings({
        q_net_heating: 350000,      // la demanda de calefacción del edificio EXISTE…
        dacs,
        boilerEff: 0.92,
        scopHeating: 3.5,
        scopAcs: 2.5,
        changeAcs: true,
        changeHeating: false,       // …pero la actuación NO la alcanza
    });

    const aeAcs = (1 / 0.92 - 1 / 2.5) * 160000;
    ok('el ahorro es solo el término de ACS de la ficha', cerca(r.savingsKwh, aeAcs),
        `${r.savingsKwh.toFixed(0)} vs ${aeAcs.toFixed(0)} kWh/año`);

    // La calefacción que queda fuera NO desaparece del consumo de partida: sigue
    // contando en la energía final anterior, igual que hacía el ACS fuera de alcance.
    ok('la calefacción fuera de alcance no altera el ahorro, pero sí el % sobre el total',
        cerca(r.finalEnergyOld, (350000 + 160000) / 0.92) && r.savingsPercent < 25,
        `E_old=${r.finalEnergyOld.toFixed(0)} · ${r.savingsPercent.toFixed(1)} %`);

    // Y el bono, que es lo que se le presenta a la comunidad.
    const eco = calculateFinancials({
        presupuesto: 120000, savingsKwh: r.savingsKwh, caePriceClient: 100, caePriceSO: 160,
        numOwners: 85, esBloque: true, participation: 100, aplicarIrpfCae: false,
    });
    ok('bono CAE a 100 €/MWh', cerca(eco.caeBonus, (aeAcs / 1000) * 100, 1),
        `${eco.caeBonus.toFixed(0)} €`);
    console.log(`     → AE = ${Math.round(r.savingsKwh).toLocaleString('es-ES')} kWh/año · bono ${Math.round(eco.caeBonus).toLocaleString('es-ES')} €`);
}

// ── 4. Alcance vacío ────────────────────────────────────────────────────────
console.log('\n3. Sin calefacción NI ACS en el alcance no hay ahorro que certificar');
{
    const r = calculateSavings({
        q_net_heating: 350000, dacs: 160000, boilerEff: 0.92,
        scopHeating: 3.5, scopAcs: 2.5, changeAcs: false, changeHeating: false,
    });
    ok('ahorro = 0', cerca(r.savingsKwh, 0), `${r.savingsKwh}`);
}

// ── 5. IRPF ─────────────────────────────────────────────────────────────────
console.log('\n4. La deducción de un BLOQUE es la del edificio (60 %)');
{
    const comun = { presupuesto: 120000, savingsKwh: 100000, caePriceClient: 100, caePriceSO: 160, aplicarIrpfCae: false };

    const bloque = calculateFinancials({ ...comun, numOwners: 85, esBloque: true, tipo: 'unifamiliar' });
    ok('tasa 60 % y tope 9.000 €', bloque.irpfRate === 60 && bloque.irpfCap === 9000);
    ok('se reparte entre los 85 propietarios',
        cerca(bloque.irpfDeductionPerOwner, (120000 / 85) * 0.6, 0.01),
        `${bloque.irpfDeductionPerOwner.toFixed(2)} €/propietario`);

    // Una participación heredada por debajo de 100 no puede bajar la deducción de una
    // obra de la comunidad a la modalidad de vivienda (40 %).
    const conParticipacion = calculateFinancials({ ...comun, numOwners: 85, esBloque: true, tipo: 'piso', participation: 50 });
    ok('ni `tipo: piso` ni participación < 100 la bajan al 40 %', conParticipacion.irpfRate === 60);

    // Y una VIVIENDA sigue exactamente como estaba.
    const piso = calculateFinancials({ ...comun, numOwners: 1, tipo: 'piso' });
    ok('una vivienda en bloque sigue al 40 % / 3.000 €', piso.irpfRate === 40 && piso.irpfCap === 3000);
    const unifamiliar = calculateFinancials({ ...comun, numOwners: 1, tipo: 'unifamiliar' });
    ok('una unifamiliar sigue al 60 % / 9.000 €', unifamiliar.irpfRate === 60 && unifamiliar.irpfCap === 9000);
}

// ── 6. Tipo de edificio del certificado ─────────────────────────────────────
console.log('\n5. El <TipoDeEdificio> del .xml se clasifica por lo que dice, no por una cadena exacta');
{
    const bloques = ['BloqueViviendaCompleto', 'BloqueDeViviendasCompleto', 'Bloque de viviendas completo', 'BLOQUE VIVIENDA COMPLETO'];
    ok('todas las grafías de "bloque completo"', bloques.every(v => clasificarTipoEdificio(v) === TIPO_INMUEBLE.BLOQUE));
    ok('vivienda individual en bloque NO es un bloque', clasificarTipoEdificio('ViviendaIndividualEnBloque') === TIPO_INMUEBLE.VIVIENDA);
    ok('unifamiliar', clasificarTipoEdificio('ViviendaUnifamiliar') === TIPO_INMUEBLE.VIVIENDA);
    ok('terciario', clasificarTipoEdificio('EdificioUsoTerciario') === 'terciario');
    ok('lo desconocido no se afirma', clasificarTipoEdificio('') === null && clasificarTipoEdificio('XYZ') === null);
    ok('esBloque lee el input', esBloque({ tipoInmueble: 'bloque' }) && !esBloque({ tipoInmueble: 'vivienda' }) && !esBloque({}));
}

console.log(fallos === 0 ? '\n✅ Todo correcto\n' : `\n❌ ${fallos} comprobacion(es) fallidas\n`);
process.exit(fallos === 0 ? 0 : 1);
