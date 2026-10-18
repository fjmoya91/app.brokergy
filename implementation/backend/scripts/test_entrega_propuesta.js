// A quién le ha llegado la propuesta (utils/entregaPropuesta.js).
//   node implementation/backend/scripts/test_entrega_propuesta.js
const assert = require('assert');
const { entregaPropuesta, algunEnvioOk } = require('../utils/entregaPropuesta');

let n = 0;
const t = (nombre, fn) => { fn(); n++; console.log('  ✓', nombre); };

// 26RES060_OP295 tal cual está en la BD: envío antiguo, sin `modo` en la línea.
const op295 = [{
    v: 1,
    destinatarios: [{ modo: 'PARTNER', label: 'INSTALACIONES EJEMPLO', telefono: '600000001' }],
    envios: [{ text: 'INSTALACIONES EJEMPLO → 600000001', status: 'ok', channel: 'whatsapp' }],
}];

t('solo al partner (envío antiguo, por la etiqueta) → instalador, no cliente', () => {
    const e = entregaPropuesta(op295);
    assert.strictEqual(e.cliente, false);
    assert.strictEqual(e.instalador, true);
    assert.deepStrictEqual(e.nombres.instalador, ['INSTALACIONES EJEMPLO']);
});

t('el `modo` de la línea manda sobre la etiqueta', () => {
    const e = entregaPropuesta([{ destinatarios: [{ modo: 'PARTNER', label: 'ANTONIO' }],
        envios: [{ text: 'ANTONIO → 600000000', status: 'ok', channel: 'whatsapp', modo: 'CLIENTE' }] }]);
    assert.strictEqual(e.cliente, true);
    assert.strictEqual(e.instalador, false);
});

t('cliente y partner con el MISMO nombre de pila: se casa por la etiqueta exacta', () => {
    const e = entregaPropuesta([{
        destinatarios: [{ modo: 'CLIENTE', label: 'CLIENTE EJEMPLO' }, { modo: 'INSTALADOR', label: 'INSTALADOR EJEMPLO' }],
        envios: [
            { text: 'CLIENTE EJEMPLO → expertcanete@x.com', status: 'ok', channel: 'email' },
            { text: 'INSTALADOR EJEMPLO → 600000002', status: 'ok', channel: 'whatsapp' },
        ] }]);
    assert.strictEqual(e.cliente, true);
    assert.strictEqual(e.instalador, true);
});

t('TITULAR cuenta como cliente', () => {
    const e = entregaPropuesta([{ envios: [{ text: 'X → 1', status: 'ok', modo: 'TITULAR' }] }]);
    assert.strictEqual(e.cliente, true);
});

t('un envío FALLIDO no cuenta', () => {
    const e = entregaPropuesta([{ destinatarios: [{ modo: 'CLIENTE', label: 'A' }],
        envios: [{ text: 'A: Request failed with status code 502', status: 'fail', channel: 'whatsapp' }] }]);
    assert.strictEqual(e, null);
});

t('copiar el enlace se dice aparte, no es «al cliente»', () => {
    const e = entregaPropuesta([{ envios: [{ channel: 'enlace', status: 'ok', text: 'enlace copiado' }] }]);
    assert.strictEqual(e.enlace, true);
    assert.strictEqual(e.cliente, false);
});

t('se acumula entre versiones: v1 al instalador, v2 al cliente', () => {
    const e = entregaPropuesta([
        ...op295,
        { destinatarios: [{ modo: 'CLIENTE', label: 'EUFISINA' }], envios: [{ text: 'EUFISINA → 1', status: 'ok', channel: 'whatsapp' }] },
    ]);
    assert.strictEqual(e.cliente, true);
    assert.strictEqual(e.instalador, true);
});

t('sin versiones → null', () => {
    assert.strictEqual(entregaPropuesta(undefined), null);
    assert.strictEqual(entregaPropuesta([]), null);
});

t('algunEnvioOk: basta UNO bien, sea a quien sea', () => {
    assert.strictEqual(algunEnvioOk([{ status: 'fail' }, { status: 'ok', modo: 'PARTNER' }]), true);
    assert.strictEqual(algunEnvioOk([{ status: 'fail' }]), false);
    assert.strictEqual(algunEnvioOk(undefined), false);
});

console.log(`\n${n} comprobaciones OK`);
