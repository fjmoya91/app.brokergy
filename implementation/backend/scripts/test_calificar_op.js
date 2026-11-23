// Pruebas de la calificación del CEE inicial de una OPORTUNIDAD en la cola del PC (`calificar_op`,
// 23/11/2026) y de su aviso automático al instalador. No toca la BD ni envía nada: Supabase y el
// WhatsApp son de mentira.
//   node implementation/backend/scripts/test_calificar_op.js
'use strict';
const path = require('path');

let ok = 0, ko = 0;
const prueba = (nombre, cond, extra = '') => {
    if (cond) { ok++; console.log(`  ✓ ${nombre}`); }
    else { ko++; console.log(`  ✗ ${nombre}${extra ? `\n      ${extra}` : ''}`); }
};

// ── 1. Cómo se juzga la salida de `cee_inicial.js calificar <OP> --escribir` ──
const pc = require('./asistente_pc');
const BIEN = [
    '══ 26RES060_OP999 · inicial ══',
    'CE3X lo califica: emisiones 41,2 E · EPNR 180,3 E',
    '✓ XML del CEE inicial CARGADO en la SIMULACIÓN de la oportunidad: 120 m² · dem. cal 95 · ACS 18 · E/E',
    '  ahorro 9.000 kWh → 12.500 kWh · bono 2.436 € → 3.210 € · ayuda total 2.436 € → 3.210 € · precio CAE 100 €/MWh',
    '✓ Revisión del partner CERRADA: WhatsApp a chat del instalador',
].join('\n');

console.log('Resultado de la calificación');
const r1 = pc._resultadoCalificarOp(BIEN, null);
prueba('cargado en la simulación → bien', r1.ok, JSON.stringify(r1));
prueba('a Fran le cuenta la calificación y el bono antes → después', r1.texto.includes('CE3X lo califica') && r1.texto.includes('bono 2.436 € → 3.210 €'), r1.texto);
prueba('y que el instalador ya tiene la cifra', r1.texto.includes('Instalador AVISADO con la cifra nueva'), r1.texto);
const r2 = pc._resultadoCalificarOp(BIEN.split('\n').slice(0, 4).join('\n'), null);
prueba('sin revisión abierta: lo dice (la propuesta, cuando diga Fran)', r2.ok && r2.texto.includes('no había revisión abierta'), r2.texto);
const r3 = pc._resultadoCalificarOp('CE3X lo califica: …\n✗ CERTIFICADO INCOMPLETO: falta la medida\n✓ XML del CEE inicial CARGADO en la SIMULACIÓN …', null);
prueba('«CERTIFICADO INCOMPLETO» → mal, aunque diga cargado', !r3.ok && r3.texto.includes('CERTIFICADO INCOMPLETO'), r3.texto);
const r4 = pc._resultadoCalificarOp('En este equipo no hay CE3X 3.2', null);
prueba('sin la línea de cargado → mal, con lo último que dijo', !r4.ok && r4.texto.includes('no hay CE3X'), r4.texto);
const r5 = pc._resultadoCalificarOp(BIEN, 'Lo he parado: llevaba más de 60 minutos sin terminar.');
prueba('cortado por tiempo → mal, con el motivo', !r5.ok && r5.texto.startsWith('Lo he parado'), r5.texto);

// ── 2. El aviso: con `chat_id` va a ESE chat, no a los teléfonos de la ficha ──
console.log('\nAviso al instalador (cerrarRevision)');
const enviados = [];
const parches = [];
const filaOp = {
    id: 'uuid-op', id_oportunidad: '26RES060_OP999', prescriptor_id: 'P1', instalador_asociado_id: null, direccion: 'CL EJEMPLO 1',
    peticion: { por: 'ALTA AUTOMÁTICA', origen: 'alta_whatsapp', at: '2026-11-23T15:00:00Z', bono: 2436, chat_id: '120363000000000000@g.us' },
};
const supa = {
    from: (tabla) => {
        const q = { select: () => q, eq: () => q, in: () => q, limit: () => q, order: () => q,
            maybeSingle: async () => (tabla === 'oportunidades' ? { data: filaOp, error: null }
                : { data: { id_empresa: 'P1', telefono: '600000000' }, error: null }) };
        return q;
    },
    rpc: async (nombre, args) => { parches.push({ nombre, args }); return { error: null }; },
};
require.cache[require.resolve('../services/supabaseClient')] = { id: 'x', filename: 'x', loaded: true, exports: supa };
require.cache[require.resolve('../services/whatsappService')] = { id: 'y', filename: 'y', loaded: true,
    exports: { sendText: async (a, t) => { enviados.push({ a, t }); return { ok: true }; } } };
const { cerrarRevision } = require('../services/revisionPartner');

(async () => {
    const r = await cerrarRevision('uuid-op', { antes: { bono: 2436 }, despues: { bono: 3210 } });
    prueba('cierra la revisión', r.cerrada, JSON.stringify(r));
    prueba('UN mensaje, al chat del instalador', enviados.length === 1 && enviados[0].a === '120363000000000000@g.us', JSON.stringify(enviados.map(e => e.a)));
    prueba('con el bono nuevo y el enlace a la oportunidad', /3\.210 €/.test(enviados[0]?.t || '') && (enviados[0]?.t || '').includes('/?op=26RES060_OP999'), enviados[0]?.t);
    prueba('saluda sin nombre («Hola,»: es un grupo)', (enviados[0]?.t || '').startsWith('Hola,'), enviados[0]?.t);
    prueba('marca resuelta ANTES de avisar, con antes → después',
        parches[0]?.nombre === 'oportunidad_merge_inputs' && parches[0].args.p_patch.peticion_revision.resuelta_at
        && parches[0].args.p_patch.peticion_revision.bono_despues === 3210, JSON.stringify(parches[0]));

    // Resuelta ya: no se repite.
    filaOp.peticion = { ...filaOp.peticion, resuelta_at: '2026-11-23T16:00:00Z' };
    const otra = await cerrarRevision('uuid-op', { antes: { bono: 2436 }, despues: { bono: 3210 } });
    prueba('una segunda carga no vuelve a escribir', !otra.cerrada && enviados.length === 1, JSON.stringify(otra));

    // ── 3. La franja: la cola no coge un calificar_op fuera de 7 a 21 h ──
    console.log('\nFranja de la casa');
    const H = require(path.join(__dirname, '../utils/horarioWhatsapp'));
    prueba('a las 3:00 (Madrid) no se contesta', !H.puedeContestar(new Date('2026-11-24T02:00:00Z')));
    prueba('a las 10:00 (Madrid) sí', H.puedeContestar(new Date('2026-11-24T09:00:00Z')));

    console.log(`\n${ok} bien, ${ko} mal`);
    process.exit(ko ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
