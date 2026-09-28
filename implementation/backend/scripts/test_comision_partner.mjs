/**
 * La comisión del partner: su % se expresa sobre lo que se le OFRECE AL CLIENTE
 * y el mensaje de la propuesta al partner le dice cuánto ganaría.
 *
 *   node implementation/backend/scripts/test_comision_partner.mjs
 */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../../frontend/src/features/calculator/logic');
const { pctDeComision, comisionDePct, comisionEurMwh, lineaComisionPartner } =
    await import(pathToFileURL(path.join(raiz, 'comisionPartner.js')).href);
const { calculateFinancials } = await import(pathToFileURL(path.join(raiz, 'calculation.js')).href);

let ok = 0;
const t = (nombre, fn) => { fn(); ok++; console.log(`✓ ${nombre}`); };

t('20 €/MWh sobre 100 €/MWh ofrecidos al cliente = 20 %', () => {
    assert.equal(pctDeComision(20, 100), 20);
    assert.equal(comisionDePct(20, 100), 20);
});

t('el % NO depende del precio del S.O. (antes 20/172 = 11,63 %)', () => {
    assert.equal(pctDeComision(20, 100), 20);
    assert.notEqual(pctDeComision(20, 100), 11.63);
});

t('sin precio de cliente no hay % (no divide por cero)', () => {
    assert.equal(pctDeComision(20, 0), 0);
    assert.equal(comisionDePct(20, 0), 0);
});

t('con el toggle apagado la comisión es 0 aunque haya €/MWh', () => {
    assert.equal(comisionEurMwh({ includeCommission: false, caePricePrescriptor: 20 }), 0);
    assert.equal(comisionEurMwh({ includeCommission: true, caePricePrescriptor: 20 }), 20);
});

t('sin comisión no se escribe párrafo', () => {
    assert.equal(lineaComisionPartner({ pct: 20, opciones: [] }), '');
    assert.equal(lineaComisionPartner({ pct: 20, opciones: [{ importe: 0 }] }), '');
});

// El caso de la captura: S.O. 172, cliente 100, comisión 20 €/MWh restada al cliente.
const f = calculateFinancials({
    savingsKwh: 23004, caePriceClient: 100, caePriceSO: 172,
    caePricePrescriptor: 20, prescriptorMode: 'client', presupuesto: 12000,
});

t('el importe del mensaje es el MISMO que "Pago a prescriptor" del panel, con su %', () => {
    const linea = lineaComisionPartner({ pct: pctDeComision(20, 100), opciones: [{ importe: f.totalPrescriptor }] });
    assert.match(linea, /460 € \+ IVA\* \(vuestro 20 % sobre el bono que se le ofrecería al cliente\)/);
    assert.match(linea, /solo si el expediente sale favorable/);
    assert.match(linea, /os avisaremos también a vosotros/);
});

t('al partner NO le llegan los MWh, ni los €/MWh, ni el ahorro', () => {
    const linea = lineaComisionPartner({ pct: 20, opciones: [{ importe: f.totalPrescriptor }] });
    assert.doesNotMatch(linea, /MWh/i);
    assert.doesNotMatch(linea, /ahorro/i);
    assert.doesNotMatch(linea, /23/);
});

t('un % no redondo se enseña con sus decimales (16 €/MWh sobre 95 = 16,84 %)', () => {
    const linea = lineaComisionPartner({ pct: pctDeComision(16, 95), opciones: [{ importe: 300 }] });
    assert.match(linea, /vuestro 16,84 %/);
});

t('con dos opciones sale una viñeta por opción', () => {
    const linea = lineaComisionPartner({ pct: 20, opciones: [
        { etiqueta: 'Opción 1 — solo aerotermia', importe: 460.08 },
        { etiqueta: 'Opción 2 — aerotermia + envolvente', importe: 1234.5 },
    ] });
    assert.match(linea, /\(vuestro 20 % sobre el bono que se le ofrecería al cliente\), según la opción/);
    assert.match(linea, /• Opción 1 — solo aerotermia: \*460 € \+ IVA\*/);
    assert.match(linea, /• Opción 2 — aerotermia \+ envolvente: \*1\.235 € \+ IVA\*/);
    assert.doesNotMatch(linea, /MWh/i);
});

console.log(`\n${ok} comprobaciones correctas.\n`);
console.log('── Párrafo que se añade al mensaje del partner (caso de la captura) ──\n');
console.log(lineaComisionPartner({ pct: pctDeComision(20, 100), opciones: [{ importe: f.totalPrescriptor }] }));
