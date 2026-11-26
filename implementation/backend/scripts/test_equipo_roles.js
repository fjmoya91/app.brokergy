// El reparto del EQUIPO DE AGENTES (regla 246): que ningún bloque del radar se quede
// sin dueño y que «listo para auditar» sean hechos. Sin BD.
//   node implementation/backend/scripts/test_equipo_roles.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const eq = require('../utils/equipoRoles');

// Los bloques se leen del FUENTE del radar: cargarlo arrancaría el cliente de Supabase.
const fuente = fs.readFileSync(path.join(__dirname, '../services/seguimientoRadar.js'), 'utf8');
const cuerpo = fuente.slice(fuente.indexOf('const BLOQUES = {'), fuente.indexOf('\n};', fuente.indexOf('const BLOQUES = {')));
const bloques = [...cuerpo.matchAll(/^ {4}([A-Z_]+): \{/gm)].map(m => m[1]);
assert.ok(bloques.length >= 14, `se esperaban al menos 14 bloques en el radar y se leen ${bloques.length}`);

let fallos = 0;
const prueba = (nombre, fn) => { try { fn(); console.log(`  ✓ ${nombre}`); } catch (e) { fallos++; console.log(`  ✗ ${nombre}\n      ${e.message}`); } };

prueba('cada bloque del radar tiene dueño', () => {
    const sin = bloques.filter(b => !eq.rolDeBloque(b));
    assert.deepStrictEqual(sin, [], `bloques sin dueño en ROL_DE_BLOQUE: ${sin.join(', ')}`);
});
prueba('cada pendiente dice qué toca hacer (el «Siguiente» del resumen)', () => {
    const todos = [...bloques, 'REQUERIMIENTO', 'LISTO_PARA_AUDITAR', ...Object.keys(eq.CAPTACION)];
    const sin = todos.filter(b => !eq.SIGUIENTE[b]);
    assert.deepStrictEqual(sin, [], `sin «siguiente»: ${sin.join(', ')}`);
    assert.strictEqual(eq.fichaDe('26RES060FM_301'), 'RES060FM');
    assert.strictEqual(eq.fichaDe('26TER100_OP392'), 'TER100');
    assert.ok(eq.claseDe('REQUERIMIENTO') < eq.claseDe('REVISION') && eq.claseDe('REVISION') < eq.claseDe('LISTO_PARA_AUDITAR') && eq.claseDe('LISTO_PARA_AUDITAR') < eq.claseDe('FIN_OBRA'));
});
prueba('no hay dueños de bloques que ya no existen', () => {
    const sobran = Object.keys(eq.ROL_DE_BLOQUE).filter(b => !bloques.includes(b));
    assert.deepStrictEqual(sobran, []);
});
prueba('todo dueño es un papel con su ficha en .claude/agents', () => {
    for (const rol of new Set(Object.values(eq.ROL_DE_BLOQUE))) {
        assert.ok(eq.ROLES[rol], `papel desconocido: ${rol}`);
    }
    for (const r of Object.values(eq.ROLES)) {
        const f = path.join(__dirname, '../../../.claude/agents', `${r.agente}.md`);
        assert.ok(fs.existsSync(f), `falta ${f}`);
        assert.ok(new RegExp(`^name: ${r.agente}$`, 'm').test(fs.readFileSync(f, 'utf8')), `${r.agente}.md no declara name: ${r.agente}`);
    }
});
prueba('la captación es la de routes/oportunidades.js', () => {
    const rutas = fs.readFileSync(path.join(__dirname, '../routes/oportunidades.js'), 'utf8');
    const m = rutas.match(/const ESTADOS_CAPTACION = \[([^\]]+)\]/);
    const deLaRuta = m[1].split(',').map(s => s.trim().replace(/'/g, '')).sort();
    assert.deepStrictEqual(Object.keys(eq.CAPTACION).sort(), deLaRuta);
    assert.strictEqual(eq.rolDeOportunidad('enviada'), 'COMERCIAL');
    assert.strictEqual(eq.rolDeOportunidad('ACEPTADA'), null);
    assert.strictEqual(eq.rolDeOportunidad('RECHAZADA'), null);
});
prueba('listo para auditar: los cuatro hechos, sin lote y sin estar ya completo', () => {
    const base = { estado: 'PTE FIN EXPTE', lote_id: null, anexo_i_signed: 'x', anexo_cesion_signed: 'x', cert_cifo_signed: 'x', reg_fin: '2026-11-01' };
    assert.strictEqual(eq.listoParaAuditar(base), true);
    for (const k of ['anexo_i_signed', 'anexo_cesion_signed', 'cert_cifo_signed', 'reg_fin']) {
        assert.strictEqual(eq.listoParaAuditar({ ...base, [k]: null }), false, `sin ${k} no está listo`);
    }
    assert.strictEqual(eq.listoParaAuditar({ ...base, lote_id: 7 }), false);
    assert.strictEqual(eq.listoParaAuditar({ ...base, estado: 'DOC. COMPLETA' }), false);
    assert.strictEqual(eq.listoParaAuditar({ ...base, estado: 'REQUERIMIENTO BROKERGY' }), false);
    assert.strictEqual(eq.enRequerimiento({ estado: 'REQUERIMIENTO VERIFICADOR' }), true);
});

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo bien.');
process.exit(fallos ? 1 : 0);
