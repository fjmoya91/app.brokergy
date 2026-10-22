/**
 * Las cifras que IMPRIME la propuesta: cada total es la suma de lo impreso, y el
 * coste de nuestros servicios es el mismo en la portada, la cláusula 2 y el convenio.
 *
 *   node implementation/backend/scripts/test_cifras_propuesta.mjs
 */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import path from 'node:path';

const aqui = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const raiz = path.resolve(aqui, '../../frontend/src/features/calculator/logic');
const { cifrasPropuesta, costesServicio, TARIFA_TOTAL } =
    await import(pathToFileURL(path.join(raiz, 'cifrasPropuesta.js')).href);
const { calculateFinancials } = await import(pathToFileURL(path.join(raiz, 'calculation.js')).href);
const { importesDe } = createRequire(import.meta.url)('../utils/importesPropuesta.js');

let ok = 0;
const t = (nombre, fn) => { fn(); ok++; console.log(`✓ ${nombre}`); };

// 26RES060_OP279 (22/10/2026): «CAE 5.161 € + IRPF 5.772 €» y una ayuda de 10.932 €.
const op279 = { presupuesto: 9619.5, caeBonus: 5160.6, irpfDeduction: 5771.7, irpfDeductionPerOwner: 5771.7, numOwners: 1, irpfCaeAmount: 0, caeMaintenanceCost: 0, totalBeneficioFiscal: 10932.3, totalAyuda: 10932.3, porcentajeCubierto: 100, costeFinal: 0 };

t('la ayuda total es la suma de lo impreso (OP279: 5.161 + 5.772 = 10.933)', () => {
    const c = cifrasPropuesta(op279);
    assert.equal(c.caeBonus, 5161);
    assert.equal(c.irpfDeduction, 5772);
    assert.equal(c.totalAyuda, 10933);
    assert.equal(c.totalBeneficioFiscal, 10933);
    assert.equal(c.costeFinal, 0);
    assert.equal(c.porcentajeCubierto, 100);
});

t('la inversión neta = inversión impresa + servicios − ayuda impresa', () => {
    const c = cifrasPropuesta({ presupuesto: 12000.4, presupuestoFotovoltaica: 3000.4, caeBonus: 2000.4, irpfDeductionPerOwner: 4500.4, numOwners: 2, irpfCaeAmount: 300.4, caeMaintenanceCost: 250 });
    assert.equal(c.presupuestoTotal, 15000);
    assert.equal(c.irpfDeduction, 9000);
    assert.equal(c.caeNeto, 1700);
    assert.equal(c.totalAyuda, 10700);
    assert.equal(c.costeFinal, 15000 + 250 - 10700);
});

t('sin rama (null) devuelve null: la comparativa sigue sabiendo que no hay reforma', () => {
    assert.equal(cifrasPropuesta(null), null);
    assert.equal(cifrasPropuesta(undefined), undefined);
});

t('con calculateFinancials real, el total cuadra con sus componentes impresos', () => {
    const fin = calculateFinancials({ savingsKwh: 51606, presupuesto: 9619.5, caePriceClient: 100, caePriceSO: 150, discountCertificates: true });
    const c = cifrasPropuesta(fin);
    assert.equal(c.totalAyuda, c.caeBonus - c.irpfCaeAmount + c.irpfDeduction);
    assert.equal(c.caeMaintenanceCost, 0);
});

t('sin descuento: se descuentan del bono los 250 € del convenio, no 252,78 «+ IVA»', () => {
    const fin = cifrasPropuesta(calculateFinancials({ savingsKwh: 30000, presupuesto: 10000, caePriceClient: 100, caePriceSO: 150 }));
    const s = costesServicio({ fin });
    assert.equal(s.aPagar, 250);
    assert.equal(s.gratis, false);
    assert.equal(s.tarifa, 702.78);
    assert.equal(s.descuento, 452.78);
    assert.equal(s.promocion, 'Promoción BROKERGY');
});

t('con descuento y colaborador: 0 € y la bonificación es del colaborador', () => {
    const fin = cifrasPropuesta(calculateFinancials({ savingsKwh: 30000, presupuesto: 10000, caePriceClient: 100, caePriceSO: 150, discountCertificates: true }));
    const s = costesServicio({ fin, descuentoCertificados: true, colaborador: 'RCA INSTALACIONES' });
    assert.equal(s.aPagar, 0);
    assert.equal(s.gratis, true);
    assert.equal(s.descuento, TARIFA_TOTAL);
    assert.equal(s.promocion, 'Bonificación por la colaboración con RCA INSTALACIONES');
});

t('con descuento y sin colaborador: promoción de BROKERGY', () => {
    const s = costesServicio({ fin: { caeMaintenanceCost: 0 }, descuentoCertificados: true, colaborador: null });
    assert.equal(s.promocion, 'Promoción BROKERGY');
});

t('la versión sella la MISMA ayuda total que imprime el PDF', () => {
    const imp = importesDe({ financials: op279 }, {});
    assert.equal(imp.totalAyuda, cifrasPropuesta(op279).totalAyuda);
    assert.equal(imp.irpfDeduction, 5772);
});

console.log(`\n${ok} comprobaciones OK`);
