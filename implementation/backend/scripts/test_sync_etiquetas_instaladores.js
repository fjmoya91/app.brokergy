#!/usr/bin/env node
/**
 * Prueba de las decisiones PURAS de la sincronización de instaladores con
 * WhatsApp: qué teléfonos se miran de una ficha y con qué nombre se guardaría
 * cada uno en la agenda.
 *
 *   node scripts/test_sync_etiquetas_instaladores.js
 *
 * No toca la BBDD ni WhatsApp: es lo único de esta función que se puede
 * comprobar en LOCAL, porque la sesión de WhatsApp solo existe en el VPS.
 */

const { telefonosDeInstalador } = require('../services/whatsappInstaladoresSync');

let fallos = 0;
const comprueba = (titulo, real, esperado) => {
    const ok = JSON.stringify(real) === JSON.stringify(esperado);
    console.log(`${ok ? '✅' : '❌'} ${titulo}`);
    if (!ok) {
        fallos++;
        console.log('   esperado:', JSON.stringify(esperado));
        console.log('   real    :', JSON.stringify(real));
    }
};
const resumen = (p) => telefonosDeInstalador(p)
    .map(t => `${t.origen}:${t.e164}:${[t.nombre, t.apellido].filter(Boolean).join(' ')}`);

// ── 1. Empresa con responsable y contacto: tres chats, cada uno con su nombre ──
comprueba('Empresa: el contacto lleva la razón social detrás',
    resumen({
        razon_social: 'ATERSOL SOLUCIONES SL',
        tlf: '967040644', tlf_responsable: '611222333',
        nombre_responsable: 'Noelia', apellidos_responsable: 'Escobar',
        contactos_notificacion: [{ nombre: 'Administración', tlf: '600 999 888' }],
    }),
    [
        'empresa:34967040644:ATERSOL SOLUCIONES SL',
        'responsable:34611222333:Noelia Escobar (ATERSOL SOLUCIONES SL)',
        'contacto:34600999888:Administración (ATERSOL SOLUCIONES SL)',
    ]);

// ── 2. El MISMO teléfono repetido en tres campos es UN chat ───────────────────
// Es el caso corriente en un autónomo, y sin deduplicar se le guardaría tres
// veces el mismo número con tres nombres distintos.
comprueba('Un teléfono repetido en varios campos sale una sola vez, con el nombre de la empresa',
    resumen({
        razon_social: 'JOSÉ LUIS CARNICERO ESCUDERO', es_autonomo: true,
        tlf: '649374229', tlf_responsable: '649 374 229',
        nombre_responsable: 'JOSÉ LUIS', apellidos_responsable: 'CARNICERO ESCUDERO',
        contactos_notificacion: [{ nombre: 'Él mismo', tlf: '+34 649-374-229' }],
    }),
    ['empresa:34649374229:JOSÉ LUIS CARNICERO ESCUDERO']);

// ── 3. Autónomo: no se repite su nombre entre paréntesis detrás de sí mismo ────
comprueba('Autónomo con otro teléfono de contacto: sin coletilla redundante',
    resumen({
        razon_social: 'RAMÓN CARRASCO ALHAMBRA', es_autonomo: true,
        tlf: '600111222', tlf_responsable: '600111222',
        nombre_responsable: 'RAMÓN', apellidos_responsable: 'CARRASCO ALHAMBRA',
    }),
    ['empresa:34600111222:RAMÓN CARRASCO ALHAMBRA']);

// ── 4. Sin teléfono de empresa, manda el del responsable ──────────────────────
comprueba('Sin tlf de empresa se usa el del responsable',
    resumen({
        razon_social: 'INSTALACIONES HINAREJOS, S.L.',
        tlf: null, tlf_responsable: '666777888',
        nombre_responsable: 'Pedro', apellidos_responsable: 'Hinarejos',
    }),
    ['responsable:34666777888:Pedro Hinarejos (INSTALACIONES HINAREJOS, S.L.)']);

// ── 5. Basura: ni teléfonos cortos ni fichas sin nombre ───────────────────────
comprueba('Un teléfono corto no genera chat',
    resumen({ razon_social: 'X SL', tlf: '123', contactos_notificacion: [{ nombre: 'A', tlf: '' }] }),
    []);

comprueba('Una ficha sin razón social ni nombres no propone guardar nada',
    resumen({ razon_social: '', tlf: '600111222' }),
    []);

// ── 6. Un contacto sin nombre hereda el de la empresa ─────────────────────────
comprueba('Contacto sin nombre: se guarda con la razón social',
    resumen({ razon_social: 'GARVEL S.C.', tlf: '610171667', contactos_notificacion: [{ nombre: '', tlf: '620000111' }] }),
    ['empresa:34610171667:GARVEL S.C.', 'contacto:34620000111:GARVEL S.C.']);

console.log(fallos ? `\n${fallos} prueba(s) fallidas.` : '\nTodo correcto.');
process.exit(fallos ? 1 : 0);
