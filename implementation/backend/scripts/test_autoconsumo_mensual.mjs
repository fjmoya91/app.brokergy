// Prueba del AUTOCONSUMO MES A MES de CE3X 3.2 (decisión del usuario, 08/10/2026):
// cada mes se declara lo menor entre lo que producen las placas (PVGIS) y el
// consumo eléctrico de ese mes, que sale del XML del certificado.
//
//   node implementation/backend/scripts/test_autoconsumo_mensual.mjs
//
// Contrasta la estimación con los consumos EXACTOS que dio el propio CE3X 3.2
// (oráculo, 08/10/2026) en dos edificios: el anual tiene que casar al 0,1 %.
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const front = (p) => pathToFileURL(path.join(aqui, '../../frontend/src/features', p)).href;
const AM = await import(front('expedientes/logic/autoconsumoMensual.js'));
const { leerConsumoElectricoDeTexto } = await import(front('calculator/logic/xmlCeeParser.js'));
const { consumoMensualDelCee } = await import(front('expedientes/logic/ce3xTextos.js'));

let n = 0;
const ok = (t) => { n++; console.log(`  ✓ ${t}`); };

// ── Los perfiles: doce meses que suman 1, en las doce zonas ─────────────────
for (const [z, p] of Object.entries(AM.PERFILES)) {
    for (const k of ['cal', 'ref']) {
        assert.equal(p[k].length, 12, `${z}.${k}`);
        assert.ok(Math.abs(p[k].reduce((a, b) => a + b, 0) - 1) < 0.002, `${z}.${k} suma 1`);
    }
}
assert.equal(Object.keys(AM.PERFILES).length, 12);
ok('los perfiles de las doce zonas peninsulares suman 1 (calefacción y refrigeración)');
assert.ok(Math.abs(AM.REPARTO_DIAS.reduce((a, b) => a + b, 0) - 1) < 1e-9);
ok('el ACS se reparte por los días del mes, como CE3X');

assert.equal(AM.perfilDeZona('d3').zona, 'D3');
assert.equal(AM.perfilDeZona('D3').exacta, true);
assert.equal(AM.perfilDeZona('B1').zona[0], 'B');            // Canarias: la misma letra
assert.equal(AM.perfilDeZona('B1').exacta, false);
assert.equal(AM.perfilDeZona('').zona, AM.ZONA_POR_DEFECTO);
ok('una zona sin perfil cae en la de su letra más cercana (y se dice)');

// ── Contra lo que calcula CE3X 3.2 ──────────────────────────────────────────
// «3.1..cex» con las placas en el edificio (D3, 221 m²) y la medida de
// autoconsumo de 2026CEE_58 (D3, 142 m²): los consumos que da CE3X mes a mes
// (los de sus avisos, más los que se sacan forzando el aviso en los doce).
const CASOS = [
    { nombre: 'edificio con placas (221 m²)', c: { cal: 34.99, ref: 3.44, acs: 12.5, ilu: 0, superficie: 221, zona: 'D3' },
      ce3x: [1738.94, 1364.46, 1260.46, 965.77, 598.91, 302.77, 508.3, 517.14, 304.98, 691.73, 1299.28, 1702.03] },
    { nombre: 'medida de 2026CEE_58 (142 m²)', c: { cal: 62.70, ref: 9.175, acs: 0, ilu: 0, superficie: 142, zona: 'D3' },
      ce3x: [1713.94, 1327.7, 1202.74, 871.88, 435.94, 109.34, 478.54, 505.52, 112.18, 541.02, 1228.3, 1674.18] },
];
for (const k of CASOS) {
    const m = AM.consumoElectricoMensual(k.c);
    const exacto = k.ce3x.reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(m.anual - exacto) / exacto < 0.002, `${k.nombre}: ${m.anual} frente a ${exacto}`);
    // Mes a mes es una ESTIMACIÓN (el reparto es la media de la zona): en
    // invierno, cerca; en los meses de paso puede irse (por eso en el PC manda CE3X).
    for (const i of [0, 1, 11]) assert.ok(Math.abs(m.meses[i] - k.ce3x[i]) / k.ce3x[i] < 0.08);
}
ok('el consumo anual casa con el de CE3X al 0,2 %, y los meses de invierno al 8 %');

// ── La regla: lo menor de los dos, cada mes ─────────────────────────────────
const pvgis = [528, 573, 695, 719, 776, 777, 842, 833, 739, 666, 528, 494];      // 2026CEE_58, 5 kWp
const r = AM.autoconsumoMensual(pvgis, CASOS[1].ce3x);
assert.deepEqual(r.recortados, [4, 5, 6, 7, 8, 9]);                           // mayo a octubre
assert.deepEqual(r.meses.slice(4, 10), [435, 109, 478, 505, 112, 541]);         // al kWh de debajo
assert.deepEqual(r.meses.slice(0, 4), pvgis.slice(0, 4));
assert.equal(r.anual, 5717);
ok('2026CEE_58: seis meses recortados a su consumo, 8.170 → 5.717 kWh/año');
assert.deepEqual(AM.autoconsumoMensual(pvgis, null).meses, pvgis);
ok('sin consumo conocido no se recorta (va la producción, y lo dice quien llama)');
assert.equal(AM.autoconsumoMensual([1, 2, 3], null), null);
ok('sin los doce meses de producción no hay reparto');

// ── El XML: v2.0 y v3.0, y en MAYÚSCULAS (como lo guarda la BD) ─────────────
const V20 = `<?xml version="1.0"?><DatosEnergeticosDelEdificio version="2.0">
<DatosGeneralesyGeometria><SuperficieHabitable>160.00</SuperficieHabitable></DatosGeneralesyGeometria>
<ZonaClimatica>D3</ZonaClimatica>
<EnergiaFinalVectores><GasNatural><Calefaccion>50</Calefaccion><Global>50</Global><ACS>0</ACS><Refrigeracion>0</Refrigeracion><Iluminacion>0</Iluminacion></GasNatural>
<ElectricidadPeninsular><Calefaccion>0.00</Calefaccion><Global>20.30</Global><ACS>16.81</ACS><Refrigeracion>3.50</Refrigeracion><Iluminacion>0.00</Iluminacion></ElectricidadPeninsular>
</EnergiaFinalVectores></DatosEnergeticosDelEdificio>`;
const V30 = `<?xml version="1.0"?><DatosEnergeticosDelEdificio version="3.0"><DatosEdificio>
<ZonaClimatica>D3</ZonaClimatica><SuperficieUtil>221.0</SuperficieUtil></DatosEdificio>
<Global><AreaRef>221.00</AreaRef></Global>
<Indicadores><EnergiaFinalVectores><Vector><Nombre>ELECTRICIDAD</Nombre><Consumo><Tot>-2.48</Tot><Acs>12.50</Acs><Ilu>0.00</Ilu><Cal>34.99</Cal><Ven>0.00</Ven><Ref>3.44</Ref></Consumo></Vector>
<Vector><Nombre>GASOLEO</Nombre><Consumo><Tot>112.06</Tot><Acs>0</Acs><Ilu>0</Ilu><Cal>112.06</Cal><Ven>0</Ven><Ref>0</Ref></Consumo></Vector></EnergiaFinalVectores></Indicadores>
</DatosEnergeticosDelEdificio>`;
for (const [x, esperado] of [[V20, { cal: 0, ref: 3.5, acs: 16.81, superficie: 160 }],
                             [V30, { cal: 34.99, ref: 3.44, acs: 12.5, superficie: 221 }]]) {
    for (const t of [x, x.toUpperCase()]) {
        const c = leerConsumoElectricoDeTexto(t);
        for (const [k, v] of Object.entries(esperado)) assert.equal(c[k], v, k);
        assert.equal(c.zona, 'D3');
    }
}
ok('el XML de la 2.3 (v2.0) y de la 3.x (v3.0) se lee igual, también en mayúsculas');
ok('en el v3.0 se leen los servicios, no el <Tot> (que ya descuenta las placas)');
assert.equal(leerConsumoElectricoDeTexto(''), null);
assert.equal(leerConsumoElectricoDeTexto('<x/>'), null);
ok('un XML sin el dato devuelve null, nunca ceros');

// ── Qué certificado manda: el final si está, si no el inicial ───────────────
const conFinal = consumoMensualDelCee({ cee: { xml_inicial: V20, xml_final: V30 } });
assert.equal(conFinal.fase, 'final');
assert.equal(consumoMensualDelCee({ cee: { xml_inicial: V20 } }).fase, 'inicial');
assert.equal(consumoMensualDelCee({ cee: {} }), null);
ok('manda el CEE FINAL si está cargado; si no, el inicial (y dice cuál)');

console.log(`\n${n} comprobaciones ✓`);
