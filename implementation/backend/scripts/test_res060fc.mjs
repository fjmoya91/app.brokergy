#!/usr/bin/env node
/**
 * Fichas con FACTOR DE CORRECCIÓN (borrador DGPLACE): RES060FC y las de hibridación
 * en paralelo por zona (RES090FC…RES094FC), con sus avisos de elegibilidad.
 *
 *   node implementation/backend/scripts/test_res060fc.mjs
 */
import { pathToFileURL } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logic = (f) => pathToFileURL(path.join(__dirname, '../../frontend/src/features/calculator/logic', f)).href;
const fcMod = await import(logic('res060fc.js'));
const { estadoFc } = await import(logic('avisoFc.js'));
const { calculateRes060FC, cbParaleloFc, provIndex, contextoCalderaFc, tramiteFc } = fcMod;

let fallos = 0;
const ok = (c, m) => { console.log(`${c ? '  ✓' : '  ✗'} ${m}`); if (!c) fallos++; };
const cerca = (a, b, tol = 1) => Math.abs(a - b) <= tol;
const tiene = (r, tono, trozo) => (r.avisos || []).some((a) => a.tono === tono && a.texto.includes(trozo));

// Ciudad Real, 1995, unifamiliar, 150 m², gasóleo 85-97 (η 0,70), SCOP 4 / 2,6, con ACS.
const BASE = {
    provinciaCode: '13', anio: 1995, tipo: 'unifamiliar', zona: 'D3', superficie: 150,
    boilerEff: 0.70, boilerId: 'oil_85_97', scopHeating: 4, scopAcs: 2.6, changeAcs: true, dacs: 2731.4,
};

console.log('\n── El f_C se aplica UNA vez (la RES060FC lo escribe dos en el ACS: errata) ──');
{
    const r = calculateRes060FC({ ...BASE, cef: 1e9 });
    const ahc = 96.4 * 150 * (1 / 0.7 - 1 / 4);
    const aha = 2731.4 * (1 / 0.7 - 1 / 2.6);
    ok(cerca(r.ahc, ahc) && cerca(r.aha, aha), `AES = calefacción ${Math.round(ahc)} + ACS ${Math.round(aha)} (sin f_C dentro)`);
    ok(cerca(r.cae, 2 * (ahc + aha)), `AE = AES × 2 = ${Math.round(2 * (ahc + aha))} kWh (da ${Math.round(r.cae)})`);
    ok(r.cae < 2 * (ahc + 2 * aha) - 1000, 'ya no sale el f_C² en el ACS');
    ok(r.ficha === 'RES060FC' && r.fc === 2 && r.q === 96.4 && r.yearLabel === '1981-2007', 'ficha, f_C de unifamiliar y Anexo IV');
}

console.log('\n── El tope del 70 % y de dónde sale el CEF ──');
{
    const r = calculateRes060FC({ ...BASE, cef: 20000 });
    ok(r.limitedByTope && cerca(r.cae, 0.7 * 20000 * 2), 'con CEF 20.000 manda el tope: 0,70·20.000·2 = 28.000');
    const cee = { superficieHabitable: 100, energiaFinalVectores: { GasoleoC: { global: 300, calefaccion: 270 }, Elec: { global: 20, calefaccion: 0 } } };
    const c = calculateRes060FC({ ...BASE, ceeInicial: cee, qCalefaccion: 30000 });
    ok(c.cefFuente === 'cee' && cerca(c.cefTotal, 32000) && cerca(c.cefCalefaccion, 27000), 'CEF del CEE inicial: Σ vectores × S (32.000 total · 27.000 calefacción)');
    const e = calculateRes060FC({ ...BASE, qCalefaccion: 30000 });
    ok(e.cefFuente === 'estimado' && cerca(e.cefTotal, (30000 + 2731.4) / 0.7), 'sin CEE: (demanda + D_ACS) ÷ η');
    const s = calculateRes060FC({ ...BASE });
    ok(s.cefFuente === null && s.tope === null && tiene(s, 'aviso', 'tope del 70'), 'sin ningún consumo: sin tope y avisándolo');
}

console.log('\n── El caso de la captura (Cuenca, 1930, 820 m², η 0,70, SCOP 4,6) ──');
{
    const caso = { provinciaCode: '16', anio: 1930, tipo: 'unifamiliar', zona: 'D2', superficie: 820, boilerEff: 0.70,
        scopHeating: 4.6, scopAcs: 4.6, changeAcs: false, dacs: 2731.4, qCalefaccion: 215 * 820 };
    const est = calculateRes060FC(caso);
    ok(est.limitedByTope && cerca(est.cae, 358063, 2), `CEF estimado: lo corta el tope → ${Math.round(est.cae)} kWh`);
    ok(tiene(est, 'aviso', '1,45 veces'), 'y avisa de que con el CEE puede subir');
    const conCee = calculateRes060FC({ ...caso, ceeInicial: { superficieHabitable: 820, energiaFinalVectores: { G: { global: 420, calefaccion: 400 } } } });
    ok(!conCee.limitedByTope && cerca(conCee.cae, 459240, 2), `CEF del CEE (420 kWh/m²): techo técnico → ${Math.round(conCee.cae)} kWh`);
}

console.log('\n── Hibridación: la ficha de SU zona, con su C_b y el CEF de calefacción ──');
{
    ok(cerca(cbParaleloFc('D3', 0.5), 0.8045, 0.0006), 'D, 50 % → 0,8045 (= BIVALENCE_TABLE)');
    ok(cbParaleloFc('D3', 0.15) === 0 && cbParaleloFc('E1', 0.15) === 0, 'D y E: hasta el 15 %, 0');
    ok(cerca(cbParaleloFc('E1', 0.17), 0.144, 0.0005), 'E1, 17 % → interpola del 15 % (0) al 20 % (0,36): 0,144');
    ok(cerca(cbParaleloFc('C2', 0.15), 0.3527, 0.0005) && cbParaleloFc('C2', 0.10) === 0, 'C: 10 % → 0; 15 % → 0,3527');
    ok(cerca(cbParaleloFc('A4', 0.30), 0.7558, 0.0005) && cerca(cbParaleloFc('B3', 0.30), 0.6747, 0.0005), 'A y B tienen su propia tabla');
    ok(cbParaleloFc('D3', 1) === 1 && cerca(cbParaleloFc('D3', 0.975), 0.992, 0.0006), 'del 95 al 100 % sube a 1 (la vigente se quedaba en 0,984)');
    const cee = { superficieHabitable: 150, energiaFinalVectores: { G: { global: 330, calefaccion: 300 } } };
    const h = calculateRes060FC({ ...BASE, ceeInicial: cee, hibridacion: { coverage: 0.5, refPower: 10, cb: 0.8 } });
    const sinHib = calculateRes060FC({ ...BASE, ceeInicial: cee });
    ok(h.ficha === 'RES093FC' && h.zonaCb === 'D1-D3', 'D3 → RES093FC');
    ok(cerca(h.aes, sinHib.aes * h.cb, 0.5), 'el C_b pondera calefacción y ACS');
    ok(cerca(h.cef, 300 * 150) && cerca(sinHib.cef, 330 * 150), 'tope con el CEF de CALEFACCIÓN (no el total)');
    ok(calculateRes060FC({ ...BASE, zona: 'C2', hibridacion: { coverage: 0.5, refPower: 10 } }).ficha === 'RES092FC', 'C2 → RES092FC');
    const sinPot = calculateRes060FC({ ...BASE, hibridacion: { coverage: 0, refPower: 0, cb: 1 } });
    ok(sinPot.cb === 1 && tiene(sinPot, 'aviso', 'potencias'), 'sin potencias: el C_b de la app y avisándolo');
    const sinZona = calculateRes060FC({ ...BASE, zona: null, hibridacion: { coverage: 0.5, refPower: 10 } });
    ok(sinZona.ficha === 'RES093FC' && tiene(sinZona, 'aviso', 'zona climática'), 'sin zona: la D y avisándolo');
}

console.log('\n── Tipología: bloque 3, piso por plantas del edificio, en cualquier caja ──');
{
    const piso = calculateRes060FC({ ...BASE, tipo: 'PISO', cef: 1e9 });
    ok(piso.clase === 'piso' && piso.fc === 2.5 && piso.q === 58.8, "'PISO' en mayúsculas es un piso (f_C 2,5, tabla 1-3 plantas)");
    ok(piso.faltanPlantas && tiene(piso, 'aviso', '42,5 kWh/m²'), 'sin plantas: avisa con la cifra de la tabla de ≥4');
    const piso4 = calculateRes060FC({ ...BASE, tipo: 'piso', plantasEdificio: '4+', cef: 1e9 });
    ok(piso4.q === 42.5 && !piso4.faltanPlantas, 'con 4 o más plantas: tabla de ≥4 (42,5)');
    ok(calculateRes060FC({ ...BASE, tipo: 'piso', plantasEdificio: 6 }).q === 42.5, 'un número de plantas también vale (6 → ≥4)');
    const bloque = calculateRes060FC({ ...BASE, tipo: 'piso', bloque: true, plantasEdificio: '1-3', cef: 1e9 });
    ok(bloque.clase === 'bloque' && bloque.fc === 3, 'un bloque es f_C 3 aunque se guarde como piso');
    ok(calculateRes060FC({ ...BASE, tipo: 'hilera' }).fc === 2, 'adosada = unifamiliar');
}

console.log('\n── Provincia por código o por NOMBRE, y año ──');
{
    ok(provIndex('13') === 12 && provIndex('CIUDAD REAL') === 12 && provIndex('Ciudad Real') === 12, 'Ciudad Real por código y por nombre');
    ok(provIndex('A Coruña') === 14 && provIndex('La Rioja') === 25 && provIndex('Illes Balears') === 6 && provIndex('BALEARES') === 6, 'nombres con artículo y en las dos lenguas');
    ok(provIndex('Vizcaya') === 47 && provIndex('Gerona') === 16 && provIndex('Alicante') === 2, 'nombres en castellano');
    ok(calculateRes060FC({ ...BASE, provinciaCode: 'Santa Cruz de Tenerife' }).noAnexoData, 'Canarias: sin datos en el Anexo IV');
    ok(calculateRes060FC({ ...BASE, provinciaCode: 'Narnia' }) === null && calculateRes060FC({ ...BASE, provinciaCode: '' }) === null, 'sin provincia válida → null');
    const sinAnio = calculateRes060FC({ ...BASE, anio: null });
    ok(sinAnio.anioSupuesto && sinAnio.yearLabel === '1981-2007' && tiene(sinAnio, 'aviso', 'año de construcción'), 'sin año: 1981-2007 y avisándolo');
    const tramo = (a) => calculateRes060FC({ ...BASE, anio: a }).yearLabel;
    ok(tramo(1940) === '≤1940' && tramo(1941) === '1941-1960' && tramo(2007) === '1981-2007' && tramo(2008) === '2008-2012' && tramo(2020) === '>2019', 'los tramos del Anexo IV');
}

console.log('\n── η: el Anexo II del borrador en las dos filas de gas de condensación ──');
{
    ok(calculateRes060FC({ ...BASE, boilerId: 'gas_post98_cond_auto', boilerEff: 0.83 }).eta === 0.85, 'gas ≥1998, condensación, encendido auto: 85 % (vigente 83 %)');
    ok(calculateRes060FC({ ...BASE, boilerId: 'gas_pre98_cond', boilerEff: 0.85 }).eta === 0.83, 'gas <1998, condensación: 83 % (vigente 85 %)');
    ok(calculateRes060FC({ ...BASE }).eta === 0.70, 'el resto, el mismo');
}

console.log('\n── Elegibilidad ──');
{
    const el = (contexto, extra = {}) => calculateRes060FC({ ...BASE, cef: 1e9, ...extra, contexto });
    ok(el({ sinCalefaccion: true }).elegible === false, 'sin calefacción: no se puede pedir');
    ok(el({ inicioObra: '2026-03-01' }).elegible === false, 'obra iniciada antes del 22/03/2026: no');
    ok(el({ inicioObra: '2026-03-22' }).elegible === true && el({ inicioObra: '2026-04-10' }).elegible === true, 'desde el 22/03/2026: sí');
    ok(el({ finObra: '2027-12-05' }).elegible === false, 'facturas de diciembre de 2027: no');
    ok(el({ tramite: 'presentado' }).elegible === false, 'ya presentado a MITECO con la ficha vigente: no');
    ok(el({ tramite: 'verificacion' }).elegible === true && tiene(el({ tramite: 'verificacion' }), 'aviso', 'pierde'), 'en lote o verificación: aviso');
    ok(el({ ceeFinal: { emisionesLetra: 'B', epnrLetra: 'G' } }).elegible === false, 'zona D y CEE final con G: no');
    ok(el({ ceeFinal: { emisionesLetra: 'B', epnrLetra: 'C' } }).elegible === true, 'zona D y CEE final B/C: sí');
    ok(el({ ceeFinal: { epnrLetra: 'G' } }, { zona: 'C2' }).elegible === true, 'zona C: la letra no se exige');
    ok(el({ ceeFinal: { epnrLetra: 'G' } }, { hibridacion: { coverage: 0.5, refPower: 10 } }).elegible === true, 'hibridación: su ficha no exige la letra');
    ok(tiene(el({}), 'info', 'A a la E'), 'zona D sin CEE final: lo recuerda');
    const bio = el({ combustible: 'biomasa' });
    ok(bio.elegible === true && tiene(bio, 'aviso', 'FÓSIL'), 'biomasa: duda, no bloqueo');
    ok(tiene(el({}), 'info', 'cupo') && tiene(el({}), 'info', 'inercia'), 'plazos, cupo y requisitos, siempre');
    ok(el({}).avisos[0].tono !== 'info' || el({}).avisos.every((a) => a.tono === 'info'), 'los avisos van de más a menos grave');
}

console.log('\n── Contexto de la caldera y de la tramitación ──');
{
    ok(contextoCalderaFc({ boilerHeatingType: 'No tiene Calefacción' }).sinCalefaccion, "'No tiene Calefacción' → sin calefacción");
    ok(contextoCalderaFc({}, 'sin_calefaccion').sinCalefaccion, "rendimiento 'sin_calefaccion' → sin calefacción");
    ok(contextoCalderaFc({ boilerId: 'electric' }).combustible === 'electrica', 'caldera eléctrica');
    ok(contextoCalderaFc({ fuelType: 'pellets' }).combustible === 'biomasa', 'pellets → biomasa');
    ok(contextoCalderaFc({ boilerHeatingType: 'Gasoil' }).combustible === 'fosil', 'gasóleo → fósil');
    ok(!contextoCalderaFc({ boilerHeatingType: 'No tiene Calefacción' }, 'oil_post98').sinCalefaccion,
        "«No tiene Calefacción» en el tipo con una caldera de gasóleo elegida: manda la caldera (24 oportunidades así)");
    ok(contextoCalderaFc({ boilerHeatingType: 'No tiene Calefacción', boilerId: 'default' }).sinCalefaccion, 'sin fila de caldera, el tipo sí cuenta');
    ok(contextoCalderaFc({ boilerHeatingType: 'BIOMASA' }, 'solid_auto').combustible === 'biomasa'
        && contextoCalderaFc({ boilerHeatingType: 'Carbon' }, 'solid_auto').combustible === 'fosil', 'combustible sólido: biomasa o carbón según lo declarado');
    ok(tramiteFc('SUBIDO A MITECO') === 'presentado' && tramiteFc('CAE EMITIDO – PTE PAGO BROKERGY') === 'presentado' && tramiteFc('FINALIZADO') === 'presentado', 'subido, emitido o finalizado → presentado');
    ok(tramiteFc('ENVIADO A VERIFICADOR') === 'verificacion' && tramiteFc('PTE FIN EXPTE', 'lote-1') === 'verificacion', 'en verificación o en lote');
    ok(tramiteFc('PTE FIN EXPTE') === null && tramiteFc(null) === null, 'lo demás, nada');
}

console.log('\n── El aviso de la propuesta no anuncia un FC que no se puede pedir ──');
{
    const fc = calculateRes060FC({ ...BASE, cef: 1e9 });
    const result = { res060fc: fc, financials: { caeBonus: 1000 }, financialsRes060FC: { caeBonus: 4000 } };
    ok(estadoFc(result, {}).procede, 'elegible y mayor: procede');
    const no = calculateRes060FC({ ...BASE, cef: 1e9, contexto: { sinCalefaccion: true } });
    const e = estadoFc({ ...result, res060fc: no }, {});
    ok(!e.procede && e.motivo.includes('no se podría pedir'), 'no elegible: no procede y dice por qué');
}

console.log(`\n${fallos ? `❌ ${fallos} FALLO(S)` : '✅ Todo correcto'}\n`);
process.exit(fallos ? 1 : 0);
