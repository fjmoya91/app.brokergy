// node implementation/backend/scripts/test_nombre_contacto_cliente.js
// Lo puro del renombrado de contactos: qué prefijo se reconoce, qué nº se pone.
const assert = require('assert');
const { leerPrefijo, codigoCorto, obraDelContacto, nombreNuevo } = require('../utils/nombreContactoCliente');

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepStrictEqual(a, b, m); n++; };

// ── Prefijos que SÍ son de la casa ───────────────────────────────────────────
eq(leerPrefijo('RES080 Irene Lopez (Gonzagarri)'), { ficha: 'RES080', prefijo: 'RES080', resto: 'Irene Lopez (Gonzagarri)' });
eq(leerPrefijo('RES060 - Miguel Angel Buitrago (Inst. Miguelturra)').resto, 'Miguel Angel Buitrago (Inst. Miguelturra)');
eq(leerPrefijo('RES060_170 Antonio (Jose Pacheco)').resto, 'Antonio (Jose Pacheco)');
eq(leerPrefijo('26RES080_78 Juan Manuel').ficha, 'RES080');
eq(leerPrefijo('RES060-08 Ruben Casarrubios').resto, 'Ruben Casarrubios');
eq(leerPrefijo('RES060_179 - ROBERTO PASCUAL').resto, 'ROBERTO PASCUAL');
eq(leerPrefijo('Res069 Raquel (Segundo ISM)').ficha, 'RES069');
eq(leerPrefijo('CEEI Carmen').ficha, 'CEE');
eq(leerPrefijo('2026CEE_48 - Carlos HERNANDO').ficha, 'CEE');
eq(leerPrefijo('RES060 (Carmelo ARGAMAS Inst. Miguelturra)').resto, '(Carmelo ARGAMAS Inst. Miguelturra)');
eq(leerPrefijo('TER100 - Hostal 82 Elena').resto, 'Hostal 82 Elena');

// ── …y los que NO (se parecen, pero son otra cosa) ───────────────────────────
for (const s of ['Termia Jesus Carnero', 'Teresa Alonso Gil', 'TERE (hidroestufa)', 'RESERVAS Hotel',
    'RESGONZA', 'RES Socuellamos Jose', 'Irene Lopez', '']) {
    eq(leerPrefijo(s), null, s);
}

// ── Código corto: sin el año ─────────────────────────────────────────────────
eq(codigoCorto('26RES080_87'), 'RES080_87');
eq(codigoCorto('26RES060_OP246'), 'RES060_OP246');
eq(codigoCorto('2026CEE_54'), 'CEE_54');
eq(codigoCorto('26TER173_1'), 'TER173_1');

// ── El nombre nuevo conserva lo de detrás letra a letra ─────────────────────
eq(nombreNuevo('RES080 Irene Lopez (Gonzagarri)', 'RES080_87'), 'RES080_87 Irene Lopez (Gonzagarri)');
eq(nombreNuevo('RES060 - MARTIN (ISM)', 'RES060_12'), 'RES060_12 MARTIN (ISM)');
eq(nombreNuevo('RES060_170 Antonio (Jose Pacheco)', 'RES060_170'), 'RES060_170 Antonio (Jose Pacheco)');
eq(nombreNuevo('Irene Lopez', 'RES080_87'), null);

// ── Qué obra ─────────────────────────────────────────────────────────────────
const exp = (numero, estado = 'PTE. FIN OBRA', created_at = '2026-01-01', oportunidad_id = null) =>
    ({ numero_expediente: numero, estado, created_at, oportunidad_id });
const op = (id_oportunidad, estado = 'ENVIADA', created_at = '2026-01-01', id = id_oportunidad) =>
    ({ id, id_oportunidad, estado, created_at });

// Con expediente manda el expediente, aunque haya oportunidad.
eq(obraDelContacto({ expedientes: [exp('26RES080_87', 'PTE. CEE INICIAL', '2026-09-01', 'o1')],
    oportunidades: [op('26RES080_OP66', 'ACEPTADA', '2026-08-01', 'o1')] }, 'RES080').codigo, 'RES080_87');
// Sin expediente, la oportunidad.
eq(obraDelContacto({ oportunidades: [op('26RES060_OP246')] }, 'RES060').codigo, 'RES060_OP246');
// La oportunidad que ya tiene expediente no cuenta.
eq(obraDelContacto({ expedientes: [], oportunidades: [op('26RES060_OP1', 'ACEPTADA', '2026-01-01', 'x')] }, 'RES060').codigo, 'RES060_OP1');
// Desempata la ficha que ya dice el nombre.
eq(obraDelContacto({ expedientes: [exp('26RES060_10', 'FINALIZADO', '2026-01-01'), exp('26RES080_20', 'PTE. FIN OBRA', '2025-01-01')] }, 'RES080').codigo, 'RES080_20');
// Dos de la misma ficha: si una sola sigue abierta, es esa.
eq(obraDelContacto({ expedientes: [exp('26RES060_10', 'FINALIZADO', '2026-05-01'), exp('26RES060_20', 'PTE. FIN OBRA', '2026-01-01')] }, 'RES060').codigo, 'RES060_20');
// Dos abiertas: se pregunta.
ok(obraDelContacto({ expedientes: [exp('26RES060_10'), exp('26RES060_20')] }, 'RES060').ambiguo, 'dos abiertas → ambiguo');
// Lo rechazado solo si no hay otra cosa.
eq(obraDelContacto({ expedientes: [exp('26RES060_10', 'RECHAZADO'), exp('26RES060_20')] }, 'RES060').codigo, 'RES060_20');
// CEE → su CEE directo.
eq(obraDelContacto({ cee_directos: [{ numero_expediente: '2026CEE_54', estado: 'REGISTRADO' }] }, 'CEE').codigo, 'CEE_54');
// Sin nada: null.
eq(obraDelContacto({}, 'RES060'), null);

console.log(`✓ ${n} comprobaciones`);
