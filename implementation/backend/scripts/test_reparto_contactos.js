// Reparto de avisos por ROL en un partner — sin BD y sin enviar nada.
//
//   node implementation/backend/scripts/test_reparto_contactos.js
//
// Cubre el caso que lo motivó (INSTOTERMA SL: la Memoria RITE salía al móvil del
// comercial) y las salvaguardas que impiden que el arreglo cambie de destinatario
// a quien no lo ha pedido.

const {
    partnerNotifyTarget, partnerNotifyTargets, contactosDePartner,
    repartoPartner, rolDeDocumento, normalizeContactos,
} = require('../services/notifyContacts');

let fallos = 0;
function comprueba(titulo, real, esperado) {
    const ok = JSON.stringify(real) === JSON.stringify(esperado);
    if (!ok) fallos++;
    console.log(`${ok ? '  ok  ' : ' FALLO'} · ${titulo}`);
    if (!ok) console.log(`        esperado: ${JSON.stringify(esperado)}\n        real:     ${JSON.stringify(real)}`);
}
const canal = (t) => ({ nombre: t.nombre, tlf: t.tlf, general: t.general, sinRol: t.sinRol });

// ── 1. El caso INSTOTERMA ─────────────────────────────────────────────────────
// Carlos es el comercial y su móvil es el `tlf` de la EMPRESA; Jesús es el
// representante legal (el que firma el CIFO) Y el técnico, con su propio número.
const instoterma = {
    razon_social: 'INSTOTERMA SL', es_autonomo: false,
    nombre_responsable: 'JESÚS', apellidos_responsable: 'DUEÑAS RUIZ',
    tlf_responsable: null, email_responsable: null,
    tlf: '654547040', email: 'instoterma@hotmail.com',
    contacto_notificaciones_activas: true,
    contactos_notificacion: [
        { nombre: 'CARLOS', tlf: '654547040', email: 'carlos@instoterma.com', cargo: 'COMERCIAL', roles: ['comercial'] },
        { nombre: 'JESÚS', tlf: '654547042', email: 'instoterma@hotmail.com', cargo: 'TÉCNICO', roles: ['tecnico'] },
    ],
};
console.log('\n1. INSTOTERMA SL — comercial y técnico repartidos');
comprueba('la Memoria RITE / el CIFO van a Jesús',
    canal(partnerNotifyTarget(instoterma, 'tecnico')),
    { nombre: 'Jesús', tlf: '654547042', general: false, sinRol: false });
comprueba('las fotos y el seguimiento van a Carlos',
    canal(partnerNotifyTarget(instoterma, 'comercial')),
    { nombre: 'Carlos', tlf: '654547040', general: false, sinRol: false });
comprueba('el representante legal NO es un destinatario por sí mismo',
    contactosDePartner(instoterma).some(c => c.id === 'rep'), false);

// ── 2. Sin nadie marcado para el rol ──────────────────────────────────────────
// 50 de los 70 instaladores no tienen ni un contacto: no puede bloquear el envío,
// pero tiene que decir que va al canal general y sin ponerle nombre de persona —
// era justo lo que fallaba ("Jesús · 654547040", que es el número de Carlos).
const soloEmpresa = {
    razon_social: 'CLIMA EJEMPLO SL', es_autonomo: false,
    nombre_responsable: 'JESÚS', tlf: '600000000', email: 'info@ejemplo.es',
    contactos_notificacion: [],
};
console.log('\n2. Ficha sin contactos — respaldo al canal general');
comprueba('cae al teléfono general, marcado como tal y SIN nombre de persona',
    canal(partnerNotifyTarget(soloEmpresa, 'tecnico')),
    { nombre: null, tlf: '600000000', general: true, sinRol: true });

// ── 3. Autónomo ───────────────────────────────────────────────────────────────
// Ahí la persona SÍ es la empresa: se le saluda por su nombre.
const autonomo = {
    razon_social: 'VICENTE GUERRERO TOLOSA', es_autonomo: true,
    nombre_responsable: 'VICENTE', apellidos_responsable: 'GUERRERO TOLOSA',
    tlf: '600111222', email: 'vicente@ejemplo.es', contactos_notificacion: [],
};
console.log('\n3. Autónomo — un solo interlocutor para todo');
comprueba('recibe lo técnico, y con su nombre',
    canal(partnerNotifyTarget(autonomo, 'tecnico')),
    { nombre: 'Vicente', tlf: '600111222', general: true, sinRol: true });
comprueba('y también lo comercial',
    partnerNotifyTarget(autonomo, 'comercial').tlf, '600111222');

// ── 4. Contacto único que vale para todo ──────────────────────────────────────
const unoParaTodo = {
    razon_social: 'DOS ROLES SL', es_autonomo: false, tlf: '600999888', email: 'e@e.es',
    contacto_notificaciones_activas: true,
    contactos_notificacion: [{ nombre: 'ANA', tlf: '611000000', email: 'ana@e.es', roles: ['comercial', 'tecnico'] }],
};
console.log('\n4. Una sola persona marcada para los dos roles');
comprueba('recibe lo técnico', partnerNotifyTarget(unoParaTodo, 'tecnico').tlf, '611000000');
comprueba('recibe lo comercial', partnerNotifyTarget(unoParaTodo, 'comercial').tlf, '611000000');

// ── 5. Fichas ANTERIORES al reparto ───────────────────────────────────────────
// No se les adivina el rol: se comportan exactamente como antes.
const legadoConDesvio = {
    razon_social: 'LEGADO SL', tlf: '600222333', email: 'e@e.es',
    contacto_notificaciones_activas: true,
    contactos_notificacion: [{ nombre: 'VICTORIA', tlf: '655000111', email: 'v@e.es' }],
};
const legadoSinDesvio = { ...legadoConDesvio, contacto_notificaciones_activas: false };
console.log('\n5. Fichas sin roles marcados — el comportamiento NO cambia');
comprueba('con el desvío activo, sigue recibiendo el contacto de siempre',
    partnerNotifyTarget(legadoConDesvio, 'tecnico').tlf, '655000111');
comprueba('con el desvío APAGADO, se sigue escribiendo a la empresa',
    canal(partnerNotifyTarget(legadoSinDesvio, 'tecnico')),
    { nombre: null, tlf: '600222333', general: true, sinRol: true });

// ── 6. Un rol marcado manda aunque el desvío esté apagado ─────────────────────
const rolPeseADesvio = {
    ...legadoSinDesvio,
    contactos_notificacion: [{ nombre: 'VICTORIA', tlf: '655000111', email: 'v@e.es', roles: ['tecnico'] }],
};
console.log('\n6. Marcar un rol ES la decisión');
comprueba('lo técnico va a Victoria aunque el interruptor viejo esté apagado',
    partnerNotifyTarget(rolPeseADesvio, 'tecnico').tlf, '655000111');
comprueba('y lo comercial sigue yendo a la empresa',
    canal(partnerNotifyTarget(rolPeseADesvio, 'comercial')).general, true);

// ── 7. Qué rol pide cada documento ────────────────────────────────────────────
console.log('\n7. El documento pide su rol');
comprueba('el CIFO firmado es del técnico', rolDeDocumento('cert_cifo_signed_link'), 'tecnico');
comprueba('el certificado RITE es del técnico', rolDeDocumento('cert_rite_drive_link'), 'tecnico');
comprueba('el anexo fotográfico es del comercial', rolDeDocumento('anexo_fotografico_signed_link'), 'comercial');

// ── 8. Saneado de lo que se guarda ────────────────────────────────────────────
console.log('\n8. Normalización de lo que llega del formulario');
comprueba('un rol inventado no se guarda',
    normalizeContactos([{ nombre: 'X', tlf: '600', roles: ['tecnico', 'jefe'] }])[0].roles, ['tecnico']);
comprueba('sin roles, array vacío (no null)',
    normalizeContactos([{ nombre: 'X', tlf: '600' }])[0].roles, []);

// ── 9. El resumen que pinta la ficha ──────────────────────────────────────────
console.log('\n9. Resumen "quién recibe qué"');
const r = repartoPartner(instoterma);
comprueba('dice quién es el técnico', r.tecnico.nombre, 'Jesús');
comprueba('dice quién es el comercial', r.comercial.nombre, 'Carlos');
comprueba('y avisa cuando falta alguien', repartoPartner(soloEmpresa).tecnico.sinRol, true);

console.log(`\n${fallos ? `❌ ${fallos} comprobacion(es) fallidas` : '✅ Todo correcto'}\n`);
process.exit(fallos ? 1 : 0);
