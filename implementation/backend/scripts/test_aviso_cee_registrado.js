// Pruebas del aviso de «CEE INICIAL presentado» (services/ceeRegistradoAviso.js):
// solo se piden las fotos que FALTAN, y el CEE inicial que presenta la casa avisa
// solo al cliente y al instalador, una vez. Sin red: la subida y el aviso van con
// dobles.
//   node scripts/test_aviso_cee_registrado.js
const assert = require('assert');

let ok = 0;
const pruebas = [];
const prueba = (nombre, fn) => pruebas.push([nombre, fn]);

const aviso = require('../services/ceeRegistradoAviso');
const slot = (key, fase, label, labelCliente) => ({ key, fase, label, labelCliente });
const CALDERA = slot('FOTO_CALDERA_ANTES', 'ANTES', 'Caldera actual (instalada)', 'Tu caldera actual');
const PLACA = slot('FOTO_PLACA_CALDERA_ANTES', 'ANTES', 'Placa de la caldera', 'La pegatina de la caldera');
const EXT = slot('FOTO_UNIDAD_EXTERIOR', 'DESPUES', 'Unidad exterior nueva (instalada)', 'La máquina nueva de fuera');
const DESM = slot('FOTO_CALDERA_DESMONTADA', 'DESPUES', 'Caldera antigua desmontada / hueco', 'La caldera vieja, ya quitada');
const FACT = slot('DOC_FACTURAS', 'DESPUES', 'Facturas de la instalación', 'Las facturas de la obra');

prueba('lo que ya tenemos NO se vuelve a pedir, y se dice', () => {
    const pend = { antes: [], despues: [EXT, DESM, FACT], tenemos: [CALDERA, PLACA], link: 'L?need=X' };
    const t = aviso.bloqueFotos(pend, { para: 'cliente' }).texto;
    assert.match(t, /Ya tenemos estas fotos[^\n]*\n• \*Tu caldera actual\*\n• \*La pegatina de la caldera\*/);
    assert.ok(!/Antes de empezar/.test(t), 'no pide nada de antes');
    assert.match(t, /La caldera vieja, ya quitada/);
    assert.match(t, /🔗 L\?need=X/);
});

prueba('lo de ANTES va aparte, con el aviso de que después ya no se puede', () => {
    const pend = { antes: [CALDERA], despues: [EXT], tenemos: [PLACA], link: 'L' };
    const t = aviso.bloqueFotos(pend, { para: 'cliente' }).texto;
    assert.match(t, /\*Antes de empezar la obra\* necesitamos \(después ya no se pueden hacer\):\n• \*Tu caldera actual\*/);
});

prueba('las FACTURAS se le piden al instalador, no al cliente', () => {
    const pend = { antes: [], despues: [EXT, FACT], tenemos: [], link: 'L' };
    assert.ok(!/Factura/.test(aviso.bloqueFotos(pend, { para: 'cliente' }).texto));
    assert.match(aviso.bloqueFotos(pend, { para: 'instalador' }).texto, /🧾 \*Factura\(s\)\* de la instalación/);
});

prueba('al instalador, las etiquetas técnicas; al cliente, las de casa', () => {
    const pend = { antes: [], despues: [EXT], tenemos: [], link: 'L' };
    assert.match(aviso.bloqueFotos(pend, { para: 'instalador' }).texto, /Unidad exterior nueva \(instalada\)/);
    assert.match(aviso.bloqueFotos(pend, { para: 'cliente' }).texto, /La máquina nueva de fuera/);
});

prueba('sin nada que pedir: se dice, y sin enlace', () => {
    const pend = { antes: [], despues: [], tenemos: [CALDERA, PLACA, EXT, DESM], link: 'L' };
    const r = aviso.bloqueFotos(pend, { para: 'cliente' });
    assert.ok(r.completo);
    assert.match(r.texto, /no tienes que mandarnos nada más/);
    assert.ok(!/🔗/.test(r.texto));
});

prueba('si no se ha podido saber qué falta, la lista de SIEMPRE (nunca un aviso sin fotos)', () => {
    const t = aviso.bloqueFotos(null, { para: 'cliente', link: 'L' }).texto;
    assert.match(t, /Recuerda hacerle fotografías a todo/);
    assert.match(t, /Desmontaje de la caldera/);
    assert.match(t, /🔗 L/);
});

prueba('sin asteriscos en el email', () => {
    const pend = { antes: [CALDERA], despues: [], tenemos: [], link: 'L' };
    assert.ok(!/\*/.test(aviso.bloqueFotos(pend, { para: 'cliente', wa: false }).texto));
});

prueba('el enlace del instalador lleva su rol, también con need=', () => {
    assert.strictEqual(aviso.enlaceInstalador('https://x/subir-docs/u?token=t&need=A'), 'https://x/subir-docs/u?token=t&need=A&rol=instalador');
});

prueba('con el desvío, el email es SOLO el del contacto: nunca cae al del titular', () => {
    const base = { nombre_razon_social: 'SALUSTIANO', apellidos: 'MARTINEZ', email: 'titular@x.es', tlf: '600' };
    // 26RES060_253: Félix (partner) sin email → no sale email, y no al buzón del titular.
    const sinEmail = aviso.avisoCliente({ ...base, notificaciones_contacto_activas: true, persona_contacto_nombre: 'Félix', persona_contacto_tlf: '696' });
    assert.strictEqual(sinEmail.tercero, true);
    assert.strictEqual(sinEmail.email, null);
    const conEmail = aviso.avisoCliente({ ...base, notificaciones_contacto_activas: true, persona_contacto_nombre: 'Félix', persona_contacto_email: 'felix@x.es' });
    assert.strictEqual(conEmail.email, 'felix@x.es');
    // Desvío marcado sin nadie detrás: es el titular, con su email.
    assert.strictEqual(aviso.avisoCliente({ ...base, notificaciones_contacto_activas: true }).email, 'titular@x.es');
    // Sin desvío: el titular, y el del contacto de respaldo.
    assert.strictEqual(aviso.avisoCliente(base).email, 'titular@x.es');
    assert.strictEqual(aviso.avisoCliente({ ...base, email: null, persona_contacto_email: 'c@x.es' }).email, 'c@x.es');
});

prueba('CEE_REGISTRO_AVISO_AUTO: encendido salvo «false»', () => {
    const antes = process.env.CEE_REGISTRO_AVISO_AUTO;
    delete process.env.CEE_REGISTRO_AVISO_AUTO; assert.strictEqual(aviso.avisoAutoActivado(), true);
    process.env.CEE_REGISTRO_AVISO_AUTO = 'false'; assert.strictEqual(aviso.avisoAutoActivado(), false);
    process.env.CEE_REGISTRO_AVISO_AUTO = 'true'; assert.strictEqual(aviso.avisoAutoActivado(), true);
    if (antes === undefined) delete process.env.CEE_REGISTRO_AVISO_AUTO; else process.env.CEE_REGISTRO_AVISO_AUTO = antes;
});

// ── El disparo desde lo que devuelve la sede (presentacionCeeService.devolver) ──
function conDobles({ registrado = true, already = false }) {
    const llamadas = { subir: [], avisar: [] };
    const fijar = (rel, exp) => { const p = require.resolve(rel); require.cache[p] = { id: p, filename: p, loaded: true, exports: exp }; };
    fijar('../services/cee/subidaCeePublica', {
        subirCae: async (a) => { llamadas.subir.push(a); return { success: true, registrado, ya_registrado: already }; },
        subirCeeDirecto: async (a) => { llamadas.subir.push(a); return { success: true, registrado }; },
    });
    fijar('../services/ceeRegistradoAviso', {
        ...aviso,
        avisoAutoActivado: () => true,
        avisarTrasPresentar: async (id, o) => { llamadas.avisar.push({ id, ...o }); return { ok: true, texto: 'enviado' }; },
    });
    delete require.cache[require.resolve('../services/presentacionCeeService')];
    return { svc: require('../services/presentacionCeeService'), llamadas };
}
const PDF = { tipo: 'registro', buffer: Buffer.from('%PDF'), mimetype: 'application/pdf', nombreOriginal: 'j.pdf' };
const devolverCon = (svc, { origen = 'expediente', fz = 'inicial', avisar = true }) => svc.devolver(
    { origen, row: { id: 'E1' }, fz, encargo: null, quien: { texto: 'Fran (presentación automática)', usuario: 'FRAN' }, avisar },
    PDF,
);

prueba('CEE inicial presentado por la casa → avisa una vez, y el email al equipo sin botón', async () => {
    const { svc, llamadas } = conDobles({});
    const r = await devolverCon(svc, {});
    assert.strictEqual(llamadas.subir[0].avisoAutomatico, true);
    assert.deepStrictEqual(llamadas.avisar.map(a => a.id), ['E1']);
    assert.strictEqual(llamadas.avisar[0].quien, 'Fran (presentación automática)');
    assert.strictEqual(r.aviso_cliente.texto, 'enviado');
});

prueba('un justificante repetido (ya REGISTRADO) no vuelve a escribir a nadie', async () => {
    const { svc, llamadas } = conDobles({ already: true });
    await devolverCon(svc, {});
    assert.strictEqual(llamadas.avisar.length, 0);
});

prueba('ni el CEE FINAL, ni un CEE directo, ni lo subido por un enlace (sin clave interna)', async () => {
    for (const caso of [{ fz: 'final' }, { origen: 'cee_directo' }, { avisar: false }]) {
        const { svc, llamadas } = conDobles({});
        await devolverCon(svc, caso);
        assert.strictEqual(llamadas.avisar.length, 0, JSON.stringify(caso));
        const sub = llamadas.subir[0] || {};
        if ('avisoAutomatico' in sub) assert.strictEqual(sub.avisoAutomatico, false, JSON.stringify(caso));
    }
});

(async () => {
    for (const [nombre, fn] of pruebas) {
        try { await fn(); ok++; console.log(`  ✓ ${nombre}`); }
        catch (e) { console.error(`  ✗ ${nombre}\n    ${e.message}`); process.exitCode = 1; }
    }
    console.log(`\n${ok}/${pruebas.length} correctas.`);
    process.exit(process.exitCode || 0);
})();
