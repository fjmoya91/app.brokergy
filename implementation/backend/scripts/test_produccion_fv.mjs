// Prueba de la producción fotovoltaica (PVGIS): la regla de tres kWp ⇄ kWh, el
// reparto mensual que SUMA EXACTO, la ubicación del expediente y la lectura de
// la respuesta de PVGIS. Sin red salvo con --en-vivo (una consulta real a PVGIS).
//
//   node implementation/backend/scripts/test_produccion_fv.mjs [--en-vivo]

import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const require = createRequire(import.meta.url);
const aqui = path.dirname(fileURLToPath(import.meta.url));
const FV = await import(pathToFileURL(path.join(aqui,
    '../../frontend/src/features/expedientes/logic/produccionFv.js')).href);
const pvgis = require('../services/pvgisService');

let fallos = 0;
const ok = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fallos++; };
const suma = (a) => a.reduce((x, y) => x + y, 0);

// Respuesta REAL de PVcalc (PVGIS 5.3) para 39.1598, -3.0183 (Tomelloso),
// 1 kWp, ángulos óptimos, 14 % — medida el 02/10/2026.
const RESPUESTA = {
    inputs: {
        location: { latitude: 39.1598, longitude: -3.0183, elevation: 665.0 },
        meteo_data: { radiation_db: 'PVGIS-SARAH3', meteo_db: 'ERA5', year_min: 2005, year_max: 2023, use_horizon: true },
        mounting_system: { fixed: { slope: { value: 36, optimal: true }, azimuth: { value: -4, optimal: true }, type: 'free-standing' } },
        pv_module: { technology: 'c-Si', peak_power: 1.0, system_loss: 14.0 },
    },
    outputs: {
        monthly: { fixed: [111.13, 118.1, 142.94, 147.61, 158.4, 156.61, 168.83, 166.23, 150.1, 137.35, 109.12, 107.46]
            .map((E_m, i) => ({ month: i + 1, E_m })) },
        totals: { fixed: { E_y: 1673.88, 'H(i)_y': 2159.44, l_total: -22.49 } },
    },
};

// ── 1. Lectura de la respuesta ──────────────────────────────────────────────
const esp = pvgis.normalizar(RESPUESTA, { perdidas: 14 });
ok(esp.anual === 1673.88, `específica anual 1.673,88 kWh/kWp (${esp.anual})`);
ok(esp.mensual.length === 12 && esp.mensual[0] === 111.13 && esp.mensual[6] === 168.83, 'los 12 meses, en su orden');
ok(esp.inclinacion === 36 && esp.orientacion === -4 && esp.optimos === true, 'ángulos óptimos 36° / −4°');
ok(esp.anios?.join('-') === '2005-2023' && esp.base_radiacion === 'PVGIS-SARAH3', 'base y años de la serie');
ok(/^PVGIS 5\.3/.test(esp.fuente), `fuente «${esp.fuente}»`);
{
    let lanzo = false;
    try { pvgis.normalizar({ outputs: {} }); } catch (e) { lanzo = e.status === 502; }
    ok(lanzo, 'una respuesta sin meses es un 502, no un 0');
}

// ── 2. Reparto que suma EXACTO ──────────────────────────────────────────────
const r = FV.repartir(4334, esp.mensual);
ok(suma(r) === 4334, `4.334 kWh repartidos suman 4.334 (${suma(r)})`);
ok(r.every(Number.isInteger), 'en kWh enteros');
ok(r[6] > r[11], 'julio produce más que diciembre');
const r1 = FV.repartir(1000, [1, 1, 1]);
ok(suma(r1) === 1000 && Math.max(...r1) - Math.min(...r1) <= 1, `1.000 en tres partes: ${r1.join(' · ')}`);
ok(FV.repartir(0, esp.mensual).every(v => v === 0), 'nada que repartir → ceros');

// ── 3. La regla de tres ─────────────────────────────────────────────────────
const p3 = FV.produccionDe(esp, 3);
ok(p3.anual === Math.round(3 * 1673.88) && suma(p3.mensual) === p3.anual,
    `3 kWp → ${p3.anual} kWh/año, y sus meses suman lo mismo`);
const kwp = FV.kwpPara(esp, 4815.38);
ok(kwp === 2.88, `4.815,38 kWh/año ⇒ ${kwp} kWp (4.815,38 ÷ 1.673,88)`);
const vuelta = FV.produccionDe(esp, kwp);
ok(Math.abs(vuelta.anual - 4815.38) < 0.01 * 4815.38, `y de vuelta ${kwp} kWp → ${vuelta.anual} kWh (±1 %)`);
const m = FV.mensualDe(esp, 4334);
ok(suma(m) === 4334 && m.length === 12, 'el declarable repartido por meses suma lo declarado');
ok(FV.kwpPara(esp, 0) === null && FV.produccionDe(esp, 0) === null && FV.produccionDe(null, 3) === null,
    'sin dato no se inventa nada');
ok(FV.tsvMensual([1, 2, 3]) === '1\t2\t3', 'los doce meses se copian separados por tabuladores');

// ── 4. Parámetros y ubicación ───────────────────────────────────────────────
ok(JSON.stringify(FV.paramsPvgis({})) === '{}', 'sin nada → ángulos óptimos y 14 %');
ok(JSON.stringify(FV.paramsPvgis({ inclinacion: 30, orientacion: -20, perdidas: 14, montaje: 'building' }))
    === '{"inclinacion":30,"orientacion":-20,"montaje":"building"}', 'con tejado: inclinación, orientación y montaje');
ok(FV.nombreOrientacion(-4) === 'Sur' && FV.nombreOrientacion(-90) === 'Este' && FV.nombreOrientacion(50) === 'Suroeste',
    'nombre de la orientación');
ok(JSON.stringify(FV.ubicacionDeExpediente({ instalacion: { coord_x: '497300', coord_y: '4334300' } }))
    === '{"utm_x":497300,"utm_y":4334300}', 'la UTM sembrada por el Catastro');
ok(FV.ubicacionDeExpediente({ ref_catastral: '9412508VJ8691S0001AB' })?.rc === '9412508VJ8691S0001AB',
    'un CEE directo: su referencia catastral');
ok(FV.ubicacionDeExpediente({ instalacion: {} }) === null, 'sin nada → null');

const u = await pvgis.resolverUbicacion({ utm_x: 497300, utm_y: 4334300 });
ok(Math.abs(u.lat - 39.16) < 0.02 && Math.abs(u.lon + 3.03) < 0.03,
    `UTM 30 → ${u.lat.toFixed(4)}, ${u.lon.toFixed(4)} (Tomelloso)`);
{
    let st = null;
    try { await pvgis.resolverUbicacion({ utm_x: 4334300, utm_y: 497300 }); } catch (e) { st = e.status; }
    ok(st === 422, 'una UTM con las cifras cambiadas no se manda a PVGIS (422)');
    st = null;
    try { await pvgis.resolverUbicacion({}); } catch (e) { st = e.status; }
    ok(st === 400, 'sin ubicación → 400');
}
const lim = pvgis.limpiar({ lat: 39.15981234, lon: -3.0183, inclinacion: '35', orientacion: '', perdidas: 'x' });
ok(lim.lat === 39.1598 && lim.inclinacion === 35 && lim.orientacion === 0 && lim.perdidas === 14,
    'parámetros limpios: 4 decimales, orientación Sur por defecto, pérdidas 14 %');

// ── 5. La medida de autoconsumo del .cex lleva los kWp de PVGIS ────────────
{
    const { medidasCe3x, AUTOCONSUMO_DECLARABLE } = await import(pathToFileURL(path.join(aqui,
        '../../frontend/src/features/cee-envolvente/logic/fichaCe3x.js')).href);
    ok(AUTOCONSUMO_DECLARABLE === 0.9, 'el 90 % sigue saliendo de fichaCe3x (reexportado)');
    // 26RES060_186: 3.809,97 kgCO₂ ÷ 0,331 = 11.510,48 → se declaran 10.359.
    const exp = {
        numero_expediente: '26RES060_186',
        instalacion: { tipo_emisor: 'radiadores_convencionales', cambio_acs: true,
                       aerotermia_cal: { aerotermia_db_id: 447, marca: 'PANASONIC', modelo: 'X', scop: 4.34 } },
        documentacion: {},
        cee: { cee_final: { superficieHabitable: 165, emisionesTotalElectrico: 3809.97 } },
        oportunidades: { datos_calculo: { inputs: {}, zona: 'D3' } },
    };
    const sin = medidasCe3x({ expediente: exp, superficie: 165, fase: 'final' });
    const fvSin = sin.medidas.find(m => m.nombre === 'AUTOCONSUMO FOTOVOLTAICO')?.instalaciones?.[0];
    ok(fvSin && fvSin.potencia_pico_kwp === undefined, 'sin PVGIS la medida va como siempre (sin kWp)');

    const con = medidasCe3x({ expediente: exp, superficie: 165, fase: 'final', autoconsumoFv: esp });
    const fvCon = con.medidas.find(m => m.nombre === 'AUTOCONSUMO FOTOVOLTAICO')?.instalaciones?.[0];
    ok(fvCon?.generacion_electrica_kwh === 10359, `declara 10.359 kWh/año (${fvCon?.generacion_electrica_kwh})`);
    ok(fvCon?.potencia_pico_kwp === FV.kwpPara(esp, 10359), `con PVGIS lleva ${fvCon?.potencia_pico_kwp} kWp (10.359 ÷ 1.673,88)`);
    ok(suma(fvCon?.generacion_mensual_kwh || []) === 10359, 'y su reparto mensual suma lo declarado');
    const cat = con.catalogo.find(m => m.id === 'autoconsumo');
    ok(/kWp \(PVGIS\)/.test(cat.resumen) && /PVGIS/.test(cat.nota || ''), 'el catálogo lo dice en el resumen y en la nota');
    ok(cat.kwh_techo === 11510, `y trae el techo entero para avisar (${cat.kwh_techo})`);
    const tecleado = medidasCe3x({ expediente: exp, superficie: 165, fase: 'final', autoconsumoFv: esp, autoconsumoKwh: 5000 });
    ok(tecleado.medidas.find(m => m.nombre === 'AUTOCONSUMO FOTOVOLTAICO')?.instalaciones?.[0]?.potencia_pico_kwp
        === FV.kwpPara(esp, 5000), 'con los kWh TECLEADOS, los kWp salen de esos kWh');
}

// ── 6. En vivo (opcional) ───────────────────────────────────────────────────
if (process.argv.includes('--en-vivo')) {
    const t0 = Date.now();
    const vivo = await pvgis.produccionEspecifica({ lat: 39.1598, lon: -3.0183 });
    ok(vivo.anual > 1400 && vivo.anual < 2000, `PVGIS en vivo: ${vivo.anual} kWh/kWp·año (${Date.now() - t0} ms)`);
    const t1 = Date.now();
    const otra = await pvgis.produccionEspecifica({ lat: 39.15981, lon: -3.01829 });
    ok(otra.cacheado === true && Date.now() - t1 < 50, 'la segunda consulta del mismo sitio sale de la caché');
    let st = null;
    try { await pvgis.produccionEspecifica({ lat: 39.0, lon: -15.0 }); } catch (e) { st = e.status; }
    ok(st === 422, 'un punto en el mar: PVGIS no tiene datos (422)');
}

console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTodo bien.');
process.exit(fallos ? 1 : 0);
