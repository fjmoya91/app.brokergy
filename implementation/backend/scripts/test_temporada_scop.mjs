// ============================================================================
// test_temporada_scop.mjs — de QUÉ temporada salen las horas equivalentes del C_b.
// ----------------------------------------------------------------------------
// Las horas del Rgto. (UE) 811/2013 (medio 2.066 · frío 2.465 · cálido 1.336) son
// las de la MISMA temporada en la que se declara el SCOP APLICADO:
//
//     zona cálida + TENEMOS el SCOP cálido            → horas de clima cálido
//     zona cálida y NO lo tenemos (se aplica el medio) → horas de clima medio
//
// La zona dice qué COLUMNA del catálogo se mira; el catálogo dice si existe. Eso
// lo resuelve `resolveScop` y se SELLA al elegir el equipo (`getScopSeason`).
//
//   1. Lo SELLADO manda siempre (expediente → oportunidad), tolerante a MAYÚSCULAS
//      —`normalizeData` deja 'CALIDO' en la BD— y aunque contradiga a la zona.
//   2. Hay EQUIPO del catálogo y nadie selló: no consta que publique SCOP cálido,
//      así que no se afirma → 'medio'. Es el caso de 26RES060_OP3 (THERMOR sin
//      columna cálida en D3), y `sellar_temporada_scop.js` lo resuelve de raíz.
//   3. SCOP TECLEADO A MANO (sin equipo): no hay ficha que consultar y manda la
//      ZONA — cálida salvo E1 (decisión del usuario, 2026-09-22).
//   4. Sin zona NO se afirma que sea cálida: 'medio' (Anexo III de la RES060).
//   5. NO-REGRESIÓN: el método 'caldera' no usa las horas, así que su C_b no se
//      mueve; y un expediente con la temporada sellada da el mismo C_b que antes.
//   6. La cascada de la CALCULADORA y la del EXPEDIENTE son la misma función: una
//      oportunidad y su expediente no pueden dar dos C_b distintos.
//
//   node implementation/backend/scripts/test_temporada_scop.mjs
// ============================================================================
import { pathToFileURL } from 'url';
import { readFileSync } from 'fs';
import path from 'path';

const raiz = path.resolve(import.meta.dirname, '../../frontend/src/features');
const imp = (rel) => import(pathToFileURL(path.join(raiz, rel)).href);

const {
    resolveClimateSeason, resolveHybridInputs, calculateHybridization,
    zoneClimateSeason, HE_ACTIVE_MODE_HOURS, HE_DEFAULT_SEASON,
} = await imp('calculator/logic/calculation.js');

let fallos = 0;
const ok = (nombre, cond, detalle = '') => {
    if (cond) { console.log(`  ✓ ${nombre}`); return; }
    fallos++;
    console.log(`  ✗ ${nombre}${detalle ? ' — ' + detalle : ''}`);
};
const cerca = (a, b, tol = 0.0001) => Math.abs(a - b) <= tol;

// ── 1 · Lo SELLADO manda ─────────────────────────────────────────────────────
console.log('\n1 · La temporada sellada manda sobre la zona');
{
    const inst = { aerotermia_cal: { scop_temporada: 'medio' } };
    ok('sello del expediente sobre zona D3 (cálida)',
        resolveClimateSeason(inst, { zona: 'D3' }, 'D3') === 'medio');

    // `normalizeData` sube el sub-árbol a MAYÚSCULAS: 37 expedientes lo tienen así.
    ok("'CALIDO' en mayúsculas se lee igual",
        resolveClimateSeason({ aerotermia_cal: { scop_temporada: 'CALIDO' } }, {}, 'E1') === 'calido');

    ok('sello de la OPORTUNIDAD cuando el expediente no lo trae',
        resolveClimateSeason({}, { inputs: { scopTemporada: 'medio' } }, 'D3') === 'medio');

    ok('el sello del expediente gana al de la oportunidad',
        resolveClimateSeason(inst, { inputs: { scopTemporada: 'calido' } }, 'D3') === 'medio');
}

// ── 2 · Con EQUIPO del catálogo y sin sello no se afirma nada ────────────────
console.log('\n2 · Equipo del catálogo sin sellar → medio (no consta que sea cálido)');
{
    // 26RES060_OP3: THERMOR Áurea+ AHP60-10 en D3. Su fila del catálogo NO tiene
    // columna cálida a 35 °C, así que el 4,53 guardado ES el dato medio: le tocan
    // 2.066 h aunque la vivienda esté en zona cálida. La zona sola diría 'calido'.
    ok('oportunidad con aerothermiaModel',
        resolveClimateSeason({}, { inputs: { aerothermiaModel: '166', zona: 'D3' } }, 'D3') === 'medio');
    ok('expediente con aerotermia_db_id',
        resolveClimateSeason({ aerotermia_cal: { aerotermia_db_id: 166 } }, { zona: 'D3' }, 'D3') === 'medio');
    ok('el SELLO sigue mandando sobre el equipo',
        resolveClimateSeason(
            { aerotermia_cal: { aerotermia_db_id: 166, scop_temporada: 'calido' } }, {}, 'D3') === 'calido');
    // 'custom' es el modelo escrito a mano de la calculadora: no es catálogo.
    ok("'custom' cuenta como tecleado a mano",
        resolveClimateSeason({}, { inputs: { aerothermiaModel: 'custom', zona: 'D3' } }, 'D3') === 'calido');
    ok('cadena vacía cuenta como tecleado a mano',
        resolveClimateSeason({}, { inputs: { aerothermiaModel: '', zona: 'D3' } }, 'D3') === 'calido');
}

// ── 3 · Sin equipo manda la ZONA ─────────────────────────────────────────────
console.log('\n3 · SCOP tecleado a mano: la temporada la fija la zona');
{
    for (const z of ['A3', 'B4', 'C2', 'D1', 'D2', 'D3']) {
        ok(`${z} → cálido (1.336 h)`, resolveClimateSeason({}, {}, z) === 'calido');
    }
    ok('E1 → medio (2.066 h)', resolveClimateSeason({}, {}, 'E1') === 'medio');
    ok('minúsculas: d3 → cálido', resolveClimateSeason({}, {}, 'd3') === 'calido');

    // La zona se busca en el propio `opSource` cuando el llamante no la pasa,
    // tanto en `datos_calculo.zona` como en `datos_calculo.inputs.zona`.
    ok('zona desde datos_calculo.zona', resolveClimateSeason({}, { zona: 'D3' }) === 'calido');
    ok('zona desde datos_calculo.inputs.zona',
        resolveClimateSeason({}, { inputs: { zona: 'D3' } }) === 'calido');
    ok('zona desde instalacion.zona_climatica',
        resolveClimateSeason({ zona_climatica: 'D3' }, {}) === 'calido');
}

// ── 4 · Sin zona NO se inventa ───────────────────────────────────────────────
console.log('\n4 · Sin zona conocida se declara clima medio');
{
    ok('sin nada → medio', resolveClimateSeason({}, {}) === HE_DEFAULT_SEASON);
    ok("HE_DEFAULT_SEASON sigue siendo 'medio'", HE_DEFAULT_SEASON === 'medio');
    ok('llamada sin argumentos no revienta', resolveClimateSeason() === 'medio');
    // `zoneClimateSeason` sí asume D3 cuando la llaman sin zona (es la convención de
    // los documentos), pero la cascada NO le deja decidir eso: son cosas distintas.
    ok('zoneClimateSeason(undefined) asume D3 y la cascada no lo usa',
        zoneClimateSeason(undefined) === 'calido' && resolveClimateSeason({}, {}) === 'medio');
}

// ── 5 · Efecto sobre el C_b ──────────────────────────────────────────────────
console.log('\n5 · Efecto sobre el C_b (el caso medido: D3, 12 kW, 20.950 kWh/año)');
{
    const caso = { demandAnnual: 20950, heatPumpPower: 12 };
    const medio = calculateHybridization({ ...caso, climateSeason: 'medio' });
    const calido = calculateHybridization({ ...caso, climateSeason: 'calido' });

    ok('horas: medio 2.066 · cálido 1.336',
        medio.hHE === 2066 && calido.hHE === 1336 && HE_ACTIVE_MODE_HOURS.frio === 2465);
    ok('con las horas del cálido la carga de diseño SUBE',
        calido.pDesign > medio.pDesign,
        `${medio.pDesign.toFixed(2)} → ${calido.pDesign.toFixed(2)} kW`);
    ok('…y el C_b BAJA (el medio era el más favorable)',
        calido.cb < medio.cb,
        `${(medio.cb * 100).toFixed(2)} % → ${(calido.cb * 100).toFixed(2)} %`);
    ok('cifras exactas: 98,40 % → 95,31 %',
        cerca(medio.cb, 0.984) && cerca(calido.cb, 0.9531),
        `${medio.cb} / ${calido.cb}`);

    // El método 'caldera' compara potencias: las horas no intervienen.
    const porCaldera = (season) => calculateHybridization({
        ...caso, method: 'caldera', boilerPower: 27.8, climateSeason: season,
    }).cb;
    ok("el método 'caldera' NO se mueve con la temporada",
        porCaldera('medio') === porCaldera('calido'));
}

// ── 6 · No-regresión de los expedientes ya sellados ──────────────────────────
console.log('\n6 · Un expediente con la temporada sellada no cambia');
{
    // 26RES093_3 (SUBIDO A MITECO): sello MEDIO en zona D3. Su C_b tiene que seguir
    // saliendo con las horas del clima medio pese a estar en una zona cálida.
    const inst = { aerotermia_cal: { scop_temporada: 'MEDIO' }, potencia_bomba: 10.1, potencia_caldera: 28.7 };
    const op = { zona: 'D3', inputs: { hibridacionMetodo: 'demanda' } };
    const r = calculateHybridization({
        demandAnnual: 27322, ...resolveHybridInputs(inst, op, op.zona),
    });
    ok('sigue con 2.066 h', r.hHE === 2066, `${r.hHE} h`);
    ok('el sello viaja en el resultado', r.climateSeason === 'medio');

    // 26RES093_8: sello CALIDO. Ya iba con 1.336 h antes del cambio.
    const r8 = calculateHybridization({
        demandAnnual: 35257,
        ...resolveHybridInputs({ aerotermia_cal: { scop_temporada: 'CALIDO' }, potencia_bomba: 12 }, { zona: 'D3' }, 'D3'),
    });
    ok('un sello CALIDO sigue en 1.336 h', r8.hHE === 1336);
}

// ── 7 · La misma cascada en las dos superficies ──────────────────────────────
console.log('\n7 · La calculadora y el expediente deciden con la MISMA función');
{
    // La oportunidad: SCOP tecleado a mano, sin modelo → manda la zona.
    const inputsOportunidad = { zona: 'D3', potenciaBomba: 12, scopHeating: 5 };
    const temporadaCalc = resolveClimateSeason({}, inputsOportunidad, inputsOportunidad.zona);
    // Su expediente, todavía sin equipo del catálogo elegido.
    const temporadaExpediente = resolveClimateSeason({}, { inputs: inputsOportunidad }, 'D3');
    ok('misma temporada en los dos lados',
        temporadaCalc === temporadaExpediente && temporadaCalc === 'calido');

    // Y la vista de la calculadora la resuelve por ahí, no por su cuenta.
    const vista = readFileSync(path.join(raiz, 'calculator/views/CalculatorView.jsx'), 'utf8');
    ok('CalculatorView usa resolveClimateSeason',
        /climateSeason:\s*resolveClimateSeason\(/.test(vista));

    // Los 11 consumidores piden la temporada por `resolveHybridInputs` CON zona:
    // sin ella volverían a caer a 'medio' en silencio.
    const fuentes = [
        'expedientes/components/FichaRes093Modal.jsx',
        'expedientes/components/InstalacionModule.jsx',
        'expedientes/logic/ce3xFinal.js',
        'expedientes/logic/cifoDoc.js',
        'expedientes/logic/expedienteFinancials.js',
        'expedientes/logic/fichaRes093Html.js',
        'expedientes/logic/terciario.js',
        'expedientes/views/ExpedienteDetailView.jsx',
        'expedientes/views/ExpedientesView.jsx',
    ].map((rel) => [rel, readFileSync(path.join(raiz, rel), 'utf8')]);
    const backend = path.resolve(import.meta.dirname, '..', 'services');
    fuentes.push(['services/cifoService.js', readFileSync(path.join(backend, 'cifoService.js'), 'utf8')]);
    fuentes.push(['services/expedienteFinancialsNode.js', readFileSync(path.join(backend, 'expedienteFinancialsNode.js'), 'utf8')]);

    const sinZona = fuentes.filter(([, src]) =>
        [...src.matchAll(/resolveHybridInputs\(([^)]*)\)/g)]
            .some((m) => m[1].split(',').length < 3));
    ok(`los ${fuentes.length} consumidores pasan la zona`,
        sinZona.length === 0, sinZona.map(([f]) => f).join(', '));
}

console.log(fallos === 0
    ? '\n✅ La temporada del SCOP sale de una sola cascada.\n'
    : `\n❌ ${fallos} comprobación(es) fallida(s).\n`);
process.exit(fallos === 0 ? 0 : 1);
