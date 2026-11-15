/**
 * El EQUIPO de verificación del lote (services/equipoVerificacion.js): qué dice el
 * correo del plan, a quién se le pone cada email y cómo se juntan las fuentes.
 * Sin red: no lee el buzón ni llama a Gemini.
 *
 *   node scripts/test_equipo_verificacion.js
 */
const assert = require('assert');
const { leerCorreoPlan, emailCasaConNombre, componerEquipo, telefonoLimpio } = require('../services/equipoVerificacion');

let fallos = 0;
const caso = (nombre, fn) => {
    try { fn(); console.log(`  ✓ ${nombre}`); } catch (e) { fallos++; console.log(`  ✗ ${nombre}\n      ${e.message}`); }
};

// El correo real de CAE-1991 (30/10/2026), en texto plano.
const CORREO_1991 = {
    asunto: 'Plan de verificacion CAE-1991 (LOTE-2026-014)',
    texto: `Plan de verificacion\nPlan de verificacion CAE-1991\n\nSoy Laura Gómez Ruiz, verificador jefe responsable del proceso de\nverificación CAE-1991, correspondiente a 5 actuaciones según ficha RES060,\nlocalizadas en Castilla-La Mancha. Adjunto plan de verificación.\n\nEste es un correo automático y no debe responderlo. Si quiere responder,\npor favor contacte al verificador jefe asignado al expediente. Correo de\ncontacto: lgomez@marwen.es\nAcceder a beCAE <https://cae.marwen.es/control/CAE-1991>`,
    cc: ['lgomez@marwen.es', 'psanz@marwen.es', 'cae@marwen.es'],
    para: ['oficina@brokergy.es'],
};
// Lo que lee el modelo del PDF del mismo plan (medido el 12/11/2026).
const PLAN_1991 = {
    expediente_cae: 'CAE-1991', organismo: 'Grupo Marwen Calsan S.L.',
    verificador_jefe: { nombre: 'Laura Gómez Ruiz', email: 'lgomez@marwen.es', telefono: '900123456' },
    revisor_tecnico: { nombre: 'Pedro Antonio Sanz Vidal', email: null, telefono: null },
};

console.log('\nEl correo del plan');
caso('saca el verificador jefe, el correo de contacto y el expediente', () => {
    const c = leerCorreoPlan(CORREO_1991);
    assert.strictEqual(c.jefe_nombre, 'Laura Gómez Ruiz');
    assert.strictEqual(c.contacto, 'lgomez@marwen.es');
    assert.strictEqual(c.expediente_cae, 'CAE-1991');
});
caso('las copias, sin el buzón genérico ni nuestro propio correo', () => {
    assert.deepStrictEqual(leerCorreoPlan(CORREO_1991).emails, ['lgomez@marwen.es', 'psanz@marwen.es']);
});

console.log('\nUn email solo es de quien casa con su nombre');
caso('lgomez ↔ Laura Gómez Ruiz', () => assert.ok(emailCasaConNombre('lgomez@marwen.es', 'Laura Gómez Ruiz')));
caso('psanz ↔ Pedro Antonio Sanz Vidal (nombre compuesto)', () =>
    assert.ok(emailCasaConNombre('psanz@marwen.es', 'Pedro Antonio Sanz Vidal')));
caso('mrubio ↔ Marta Rubio Rubio', () => assert.ok(emailCasaConNombre('mrubio@marwen.es', 'Marta Rubio Rubio')));
caso('psanz NO es de Laura Gómez', () => assert.ok(!emailCasaConNombre('psanz@marwen.es', 'Laura Gómez Ruiz')));
caso('otra inicial con el mismo apellido no casa', () => assert.ok(!emailCasaConNombre('jgomez@marwen.es', 'Laura Gómez Ruiz')));
caso('con un solo nombre no se adivina', () => assert.ok(!emailCasaConNombre('laura@marwen.es', 'Laura')));

console.log('\nJuntar el plan y el correo');
caso('el revisor recibe SU email de las copias; el jefe conserva el suyo y su teléfono', () => {
    const eq = componerEquipo({ plan: PLAN_1991, correo: leerCorreoPlan(CORREO_1991) });
    assert.deepStrictEqual(eq.verificador_jefe, { nombre: 'Laura Gómez Ruiz', email: 'lgomez@marwen.es', telefono: '900123456' });
    assert.deepStrictEqual(eq.revisor_tecnico, { nombre: 'Pedro Antonio Sanz Vidal', email: 'psanz@marwen.es', telefono: null });
    assert.deepStrictEqual(eq.fuentes, ['plan', 'correo']);
    assert.strictEqual(eq.expediente_cae, 'CAE-1991');
});
caso('solo con el PDF: el revisor se queda sin email (no se compone)', () => {
    const eq = componerEquipo({ plan: PLAN_1991 });
    assert.strictEqual(eq.revisor_tecnico.email, null);
});
caso('solo con el correo: jefe con nombre y email; el revisor, sin nombre, no se inventa', () => {
    const eq = componerEquipo({ correo: leerCorreoPlan(CORREO_1991) });
    assert.deepStrictEqual(eq.verificador_jefe, { nombre: 'Laura Gómez Ruiz', email: 'lgomez@marwen.es', telefono: null });
    assert.strictEqual(eq.revisor_tecnico, null);
});
caso('releer el PDF NO pierde el email del revisor que trajo el correo', () => {
    const previo = componerEquipo({ plan: PLAN_1991, correo: leerCorreoPlan(CORREO_1991) });
    const eq = componerEquipo({ plan: PLAN_1991, previo });
    assert.strictEqual(eq.revisor_tecnico.email, 'psanz@marwen.es');
    assert.deepStrictEqual(eq.fuentes, ['plan', 'correo']);
});
caso('si cambia el revisor, no se arrastra el email del anterior', () => {
    const previo = componerEquipo({ plan: PLAN_1991, correo: leerCorreoPlan(CORREO_1991) });
    const otro = { ...PLAN_1991, revisor_tecnico: { nombre: 'Eva Valdivia Ruiz', email: null, telefono: null } };
    assert.strictEqual(componerEquipo({ plan: otro, previo }).revisor_tecnico.email, null);
});
caso('sin nadie, null', () => assert.strictEqual(componerEquipo({ plan: { verificador_jefe: null, revisor_tecnico: null } }), null));

console.log('\nTeléfonos');
caso('900123456 / +34 900 12 34 56 / 0034… → 900123456', () => {
    for (const t of ['900123456', '+34 900 12 34 56', '0034900123456', '900-12-34-56']) assert.strictEqual(telefonoLimpio(t), '900123456');
});
caso('lo que no es un teléfono, null', () => { assert.strictEqual(telefonoLimpio('SM'), null); assert.strictEqual(telefonoLimpio('1234'), null); });

console.log(fallos ? `\n✗ ${fallos} fallo(s)` : '\n✓ Todo correcto');
process.exit(fallos ? 1 : 0);
