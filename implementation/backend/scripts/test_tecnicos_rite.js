// Varios técnicos que pueden firmar la Memoria RITE (FONCAMAN, 2026-11-06).
// Comprueba, SIN escribir nada: (1) la elección por DNI (`aplicarTecnicoRite`),
// (2) que `loadRiteContext` trae la lista y el de por defecto, y (3) con
// --generar y el rite-generator levantado (RITE_SERVICE_URL), que la memoria
// sale a nombre del de por defecto o del elegido.
//
//   node scripts/test_tecnicos_rite.js [nº expediente] [--generar]
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const assert = require('assert');
const { aplicarTecnicoRite } = require('../utils/instaladorFirmante');

const args = process.argv.slice(2);
const num = args.find(a => !a.startsWith('--')) || null;
const generar = args.includes('--generar');

const P = {
    tecnico_firmante_distinto: true,
    tecnico_firmante_nombre: 'FRANCISCO JAVIER', tecnico_firmante_apellidos: 'MANJAVACAS LIZCANO',
    tecnico_firmante_dni: '06263712F', tecnico_firmante_carnet_rite: '460000330',
    tecnicos_firmantes_rite: [{ nombre: 'ANTONIO', apellidos: 'MANJAVACAS LIZCANO', dni: '06221962W', carnet: null }],
};
assert.strictEqual(aplicarTecnicoRite(P, null), P, 'sin elección: el de por defecto');
assert.strictEqual(aplicarTecnicoRite(P, '06263712F'), P, 'el de por defecto por DNI: igual');
assert.strictEqual(aplicarTecnicoRite(P, '06221962w').tecnico_firmante_nombre, 'ANTONIO', 'elige por DNI, sin distinguir mayúsculas');
assert.strictEqual(aplicarTecnicoRite(P, '06221962W').tecnico_firmante_carnet_rite, '', 'sin carné no hereda el del de por defecto');
assert.strictEqual(aplicarTecnicoRite(P, '11111111H'), P, 'un DNI que no está en la ficha: el de por defecto');
console.log('✓ elección del técnico');

(async () => {
    if (!num) { console.log('\n✅ Todo correcto (sin expediente: solo la lógica)'); return; }
    const { _rite } = require('../routes/expedientes');
    const ctx = await _rite.loadRiteContext(num);
    assert(ctx, `no existe ${num}`);
    const lista = ctx.pres?.tecnicos_firmantes_rite || [];
    console.log(`${num}: firma por defecto ${ctx.pres.tecnico_firmante_nombre} ${ctx.pres.tecnico_firmante_apellidos} · otros: ${lista.map(t => t.nombre).join(', ') || '—'} · elegido en el expediente: ${ctx.exp.documentacion?.memoria_rite_tecnico?.dni || '—'}`);
    if (!generar) { console.log('\n✅ Todo correcto'); return; }

    const JSZip = require('jszip');
    const textoDocx = async (files) => {
        const f = (files || []).find(x => (x.name || '').toUpperCase().endsWith('.DOCX'));
        assert(f, 'el servicio no devolvió la memoria en Word');
        const zip = await JSZip.loadAsync(Buffer.from(f.base64, 'base64'));
        return (await zip.file('word/document.xml').async('string')).replace(/<[^>]+>/g, '');
    };
    for (const dni of [null, ...lista.map(t => t.dni)]) {
        const pres = aplicarTecnicoRite(ctx.pres, dni);
        const { expPayload, instaladorPayload, fechas } = _rite.buildRitePayloads({ ...ctx, pres });
        const txt = await textoDocx(await _rite.generarRiteFiles(expPayload, instaladorPayload, fechas));
        const quien = `${pres.tecnico_firmante_nombre} ${pres.tecnico_firmante_apellidos}`;
        const otros = [ctx.pres, ...lista.map(t => aplicarTecnicoRite(ctx.pres, t.dni))]
            .filter(o => o.tecnico_firmante_dni !== pres.tecnico_firmante_dni);
        // La memoria imprime NOMBRE y CARNÉ de quien la suscribe (el DNI no).
        const plano = txt.replace(/\s+/g, ' ');
        assert(plano.includes(quien), `la memoria no lleva el nombre de ${quien}`);
        for (const o of otros) {
            const suNombre = `${o.tecnico_firmante_nombre} ${o.tecnico_firmante_apellidos}`;
            assert(!plano.includes(suNombre), `la memoria lleva también a ${suNombre}`);
            if (o.tecnico_firmante_carnet_rite) assert(!plano.includes(o.tecnico_firmante_carnet_rite), `la memoria lleva el carné de ${suNombre}`);
        }
        console.log(`✓ memoria a nombre de ${quien} (${pres.tecnico_firmante_dni}${pres.tecnico_firmante_carnet_rite ? ' · carné ' + pres.tecnico_firmante_carnet_rite : ''})`);
    }
    console.log('\n✅ Todo correcto');
})().catch(e => { console.error('✕', e.message); process.exit(1); }).finally(() => setTimeout(() => process.exit(), 200));
