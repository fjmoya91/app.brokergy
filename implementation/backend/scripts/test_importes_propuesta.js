// Importes que se sellan en cada versión de la propuesta (utils/importesPropuesta.js).
//   node implementation/backend/scripts/test_importes_propuesta.js
const assert = require('assert');
const { importesDe, describirCambios } = require('../utils/importesPropuesta');

let n = 0;
const t = (nombre, fn) => { fn(); n++; console.log('  ✓', nombre); };

// 26RES080_OP76 v1 (19/10/2026): el PDF dice CAE 5.262 + IRPF 9.000 sobre 15.000.
// Se selló 2.255, la rama de solo aerotermia recalculada al enviar.
const op76 = {
    result: {
        financials: { presupuesto: 15000, presupuestoFotovoltaica: 0, caeBonus: 2255.4, irpfDeduction: 9000, totalAyuda: 11255.4 },
        financialsRes080: { presupuesto: 15000, presupuestoFotovoltaica: 0, caeBonus: 5261.52636, irpfDeduction: 9000, totalAyuda: 14261.52636 },
    },
    inputs: { isReforma: true, comparativaReforma: false },
};

t('solo reforma → sella la reforma, la que imprime el PDF (OP76: 5.262, no 2.255)', () => {
    assert.deepStrictEqual(importesDe(op76.result, op76.inputs), {
        inversion: 15000, caeBonus: 5262, irpfDeduction: 9000, totalAyuda: 14262, rama: 'reforma',
    });
});

t('comparativa → la principal es solo aerotermia y la reforma va aparte', () => {
    const imp = importesDe(op76.result, { isReforma: true, comparativaReforma: true });
    assert.strictEqual(imp.rama, 'comparativa');
    assert.strictEqual(imp.caeBonus, 2255);
    assert.deepStrictEqual(imp.reforma, { inversion: 15000, caeBonus: 5262, irpfDeduction: 9000, totalAyuda: 14262 });
});

t('comparativa sin decir (null) cuenta como comparativa, igual que el PDF', () => {
    assert.strictEqual(importesDe(op76.result, { isReforma: true }).rama, 'comparativa');
});

t('reforma marcada pero sin rama de reforma calculada → solo aerotermia', () => {
    const imp = importesDe({ financials: op76.result.financials }, { isReforma: true, comparativaReforma: false });
    assert.strictEqual(imp.rama, 'aerotermia');
    assert.strictEqual(imp.caeBonus, 2255);
    assert.strictEqual(imp.reforma, undefined);
});

t('RES060 → solo aerotermia, como siempre', () => {
    const imp = importesDe({ financials: { presupuesto: 9000, caeBonus: 2939.2, irpfDeduction: 3600, totalAyuda: 6539.2 } }, {});
    assert.deepStrictEqual(imp, { inversion: 9000, caeBonus: 2939, irpfDeduction: 3600, totalAyuda: 6539, rama: 'aerotermia' });
});

t('la inversión es presupuesto + fotovoltaica (la de la portada), nunca null si hay presupuesto', () => {
    const imp = importesDe({ financials: { presupuesto: 12000, presupuestoFotovoltaica: 4500.4, caeBonus: 1 } }, {});
    assert.strictEqual(imp.inversion, 16500);
    assert.strictEqual(importesDe({ financials: { caeBonus: 1 } }, {}).inversion, null);
});

t('sin result no revienta', () => {
    assert.deepStrictEqual(importesDe(null, null), {
        inversion: null, caeBonus: null, irpfDeduction: null, totalAyuda: null, rama: 'aerotermia',
    });
});

// ── describirCambios ────────────────────────────────────────────────────────

const v = (importes) => ({ importes });

t('misma rama: solo las cifras que cambian, sin sufijo', () => {
    // 26RES080_OP60 v1 → v3: el PDF pasó de 2.897 € a 4.312 €.
    const a = v({ inversion: 12294, caeBonus: 2897, irpfDeduction: 3000, totalAyuda: 5897, rama: 'reforma' });
    const b = v({ inversion: 12294, caeBonus: 4312, irpfDeduction: 3000, totalAyuda: 7312, rama: 'reforma' });
    assert.strictEqual(describirCambios(a, b), 'bono CAE 2.897 € → 4.312 €; ayuda total 5.897 € → 7.312 €');
});

t('sin cambios lo dice', () => {
    const a = v({ inversion: 1, caeBonus: 2, irpfDeduction: 3, totalAyuda: 5, rama: 'reforma' });
    assert.strictEqual(describirCambios(a, a), 'sin cambios en los importes');
});

t('cambio de rama: lo dice y NO resta el bono de una opción al de la otra', () => {
    const a = v({ inversion: 15000, caeBonus: 2255, irpfDeduction: 9000, totalAyuda: 11255 }); // antigua: sin rama
    const b = v({ inversion: 15000, caeBonus: 5262, irpfDeduction: 9000, totalAyuda: 14262, rama: 'reforma' });
    assert.strictEqual(describirCambios(a, b), 'propuesta solo aerotermia → solo reforma');
});

t('de comparativa a solo reforma: compara la reforma con la reforma', () => {
    const a = v({ inversion: 15000, caeBonus: 2255, irpfDeduction: 9000, totalAyuda: 11255, rama: 'comparativa',
        reforma: { inversion: 15000, caeBonus: 5000, irpfDeduction: 9000, totalAyuda: 14000 } });
    const b = v({ inversion: 15000, caeBonus: 5262, irpfDeduction: 9000, totalAyuda: 14262, rama: 'reforma' });
    assert.strictEqual(describirCambios(a, b),
        'propuesta comparativa aerotermia / reforma → solo reforma; bono CAE con reforma 5.000 € → 5.262 €; ayuda total con reforma 14.000 € → 14.262 €');
});

t('comparativa → comparativa: cada opción con su sufijo', () => {
    const base = { inversion: 9000, caeBonus: 2000, irpfDeduction: 3000, totalAyuda: 5000, rama: 'comparativa' };
    const a = v({ ...base, reforma: { inversion: 20000, caeBonus: 4000, irpfDeduction: 6000, totalAyuda: 10000 } });
    const b = v({ ...base, caeBonus: 2100, totalAyuda: 5100, reforma: { inversion: 20000, caeBonus: 4000, irpfDeduction: 6000, totalAyuda: 10000 } });
    assert.strictEqual(describirCambios(a, b), 'bono CAE solo aerotermia 2.000 € → 2.100 €; ayuda total solo aerotermia 5.000 € → 5.100 €');
});

t('una inversión null (versiones antiguas) no se compara', () => {
    const a = v({ inversion: null, caeBonus: 2, irpfDeduction: 3, totalAyuda: 5, rama: 'reforma' });
    const b = v({ inversion: 15000, caeBonus: 2, irpfDeduction: 3, totalAyuda: 5, rama: 'reforma' });
    assert.strictEqual(describirCambios(a, b), 'sin cambios en los importes');
});

t('sin importes en alguna de las dos → no afirma nada', () => {
    assert.strictEqual(describirCambios({}, v({ caeBonus: 1 })), '');
    assert.strictEqual(describirCambios(null, v({ caeBonus: 1 })), '');
});

console.log(`\n${n} pruebas OK`);
