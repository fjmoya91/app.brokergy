// node scripts/test_esperas_whatsapp.js — lo que se le PIDE a alguien por WhatsApp y se
// le recuerda si no contesta (services/esperasWhatsapp.js) y cómo sabe la sesión si un
// mensaje nuestro lo ha mandado la app o una persona (whatsappService `_propios`).
// Sin red ni BD: horario, plazos, textos, acuses y el interruptor.
const path = require('path');
require(path.join(__dirname, '../node_modules/dotenv')).config({ path: path.join(__dirname, '../.env'), quiet: true });
const esperas = require('../services/esperasWhatsapp');
const { _propios } = require('../services/whatsappService');
const { FIRMA } = require('../services/recordatorios');

let fallos = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fallos++; };

(async () => {
    // ── Horario: la franja de la casa, de 7 a 21 h de Madrid, y un recordatorio solo de lunes a
    //    viernes (noviembre = CET, UTC+1). Contestar, también el fin de semana. ──
    const horario = require('../utils/horarioWhatsapp');
    ok(esperas.enHorario(new Date('2026-11-09T09:00:00Z')), 'lunes 10:00: en horario');
    ok(esperas.enHorario(new Date('2026-11-09T06:30:00Z')), 'lunes 7:30: en horario');
    ok(!esperas.enHorario(new Date('2026-11-09T05:30:00Z')), 'lunes 6:30: fuera');
    ok(!esperas.enHorario(new Date('2026-11-09T20:30:00Z')), 'lunes 21:30: fuera');
    ok(!esperas.enHorario(new Date('2026-11-14T10:00:00Z')), 'sábado 11:00: no se insiste');
    ok(horario.puedeContestar(new Date('2026-11-14T10:00:00Z')), 'sábado 11:00: sí se contesta');
    ok(!horario.puedeContestar(new Date('2026-11-14T22:30:00Z')), 'sábado 23:30: no se contesta');
    ok(horario.siguienteApertura(new Date('2026-11-14T22:30:00Z')).toISOString() === '2026-11-15T06:00:00.000Z',
        'contestar a lo del sábado a las 23:30 → domingo 7:00');
    ok(esperas.siguienteHabil(new Date('2026-11-13T20:30:00Z')).toISOString() === '2026-11-16T06:00:00.000Z',
        'recordar el viernes a las 21:30 → lunes 7:00');
    ok(esperas.venceTras(new Date('2026-11-12T09:00:00Z'), 48).toISOString() === '2026-11-16T06:00:00.000Z',
        'pedido el jueves a las 10:00, 48 h → cae en sábado → lunes 7:00');
    ok(esperas.venceTras(new Date('2026-11-09T09:00:00Z'), 48).toISOString() === '2026-11-11T09:00:00.000Z',
        'pedido el lunes a las 10:00, 48 h → miércoles 10:00');

    // ── El recordatorio: tú, por el nombre de pila, lo pedido, el enlace y la salida ──
    const cli = esperas.textoRecordatorio({
        nombre: 'ANA GARCÍA LÓPEZ', quien: 'CLIENTE', numero: '26RES060_178', motivo: 'DOCUMENTACION',
        pedido: ['Foto de la placa de la caldera', 'Factura de la instalación'],
        enviado_at: '2026-11-09T09:00:00Z', enlace: 'https://app.brokergy.es/subir/abc',
    });
    ok(cli.startsWith('Hola Ana, ¿qué tal?'), 'cliente: saluda por el nombre de pila');
    ok(cli.includes('lo que te pedimos el 9 de noviembre'), 'cliente: dice cuándo se le pidió');
    ok(cli.includes('· Foto de la placa de la caldera') && cli.includes('· Factura de la instalación'), 'cliente: la lista de lo pedido');
    ok(cli.includes('https://app.brokergy.es/subir/abc'), 'cliente: el enlace de subida');
    ok(cli.includes('Si ya lo has mandado por otro lado, dímelo y lo busco.'), 'cliente: la salida de «ya lo mandé»');
    ok(cli.trim().endsWith(FIRMA), 'cliente: firma de la casa');
    ok(!cli.includes('26RES060_178'), 'cliente: sin nº de expediente');
    ok(!/\p{Extended_Pictographic}/u.test(cli), 'cliente: sin emojis');
    ok(!/disculp|perd[oó]n|lament/i.test(cli), 'cliente: sin tono de disculpa');

    const ins = esperas.textoRecordatorio({
        nombre: 'Jose Antonio', quien: 'INSTALADOR', numero: '26RES060_178', motivo: 'CEE_INICIAL',
        pedido: [], enviado_at: '2026-11-10T09:00:00Z',
    });
    ok(ins.startsWith('Hola Jose Antonio, ¿qué tal?'), 'instalador: nombre de dos palabras, entero');
    ok(ins.includes('del expediente *26RES060_178*'), 'instalador: con el nº de expediente');
    ok(ins.includes('lo que nos falta para el certificado energético'), 'sin lista: dice QUÉ se esperaba');
    ok(!/se sube desde el móvil/.test(ins), 'sin enlace: no promete uno');
    ok(esperas.textoRecordatorio({ quien: 'CLIENTE', motivo: 'DOCUMENTACION', enviado_at: '2026-11-10T09:00:00Z' })
        .startsWith('Hola, ¿qué tal?'), 'sin nombre: «Hola, ¿qué tal?»');

    // ── Qué escribió (para el resumen) y qué es solo un acuse (no cierra la espera) ──
    ok(esperas.describirMensaje({ type: 'image', body: '' }) === 'una foto', 'foto');
    ok(esperas.describirMensaje({ type: 'ptt' }) === 'una nota de voz', 'nota de voz');
    ok(esperas.describirMensaje({ type: 'chat', body: 'Te lo mando  esta tarde' }) === '«Te lo mando esta tarde»', 'texto, entre comillas');
    ok(esperas.esAcuse({ type: 'chat', body: 'Vale, gracias' }), '«Vale, gracias» es un acuse');
    ok(esperas.esAcuse({ type: 'chat', body: 'Mañana te lo mando' }), '«Mañana te lo mando» es un acuse');
    ok(!esperas.esAcuse({ type: 'chat', body: '¿Qué foto necesitas?' }), 'una pregunta NO es un acuse');
    ok(!esperas.esAcuse({ type: 'image', body: '' }), 'una foto NO es un acuse');
    ok(!esperas.esAcuse({ type: 'chat', body: 'La caldera la quitamos el martes pero el instalador no me ha dado la factura todavía' }),
        'una explicación larga NO es un acuse');

    // La respuesta automática de un WhatsApp Business no es una respuesta (26RES080_76, 09/11/2026).
    const t0 = Date.parse('2026-11-09T09:00:00Z');
    const auto = 'Hola! Gracias por escribirnos! Si es algo urgente en tu hogar 🔧🏠, cuéntanos qué ocurre y te ayudamos lo antes posible.';
    ok(esperas.esAutomatica({ body: auto, timestamp: t0 / 1000 + 20 }, t0), 'la respuesta automática a los 20 s: automática');
    ok(!esperas.esAutomatica({ body: auto, timestamp: t0 / 1000 + 3 * 3600 }, t0), 'el mismo texto tres horas después: de una persona');
    ok(!esperas.esAutomatica({ body: 'Hola Fran. Gracias por tu mensaje. Te escribo ahora y ya me contestas cuando puedas.', timestamp: t0 / 1000 + 60 }, t0),
        '«Gracias por tu mensaje, te escribo ahora» al minuto: de una persona');

    // ── ¿Lo ha mandado la app o una persona? ──
    _propios.marcarPropio('Hola Ana,\n\nTe escribo por lo que te pedimos');
    ok(_propios.esDelSistema({ body: 'Hola Ana, Te escribo  por lo que te pedimos' }), 'lo apuntado por la app: del sistema');
    ok(!_propios.esDelSistema({ body: 'Hola Ana, Te escribo por lo que te pedimos' }), 'la marca se consume: el mismo texto otra vez es de una persona');
    ok(!_propios.esDelSistema({ body: 'Ana, te llamo luego' }), 'lo no apuntado: de una persona');
    _propios.marcarPropio('', { adjunto: true });
    ok(_propios.esDelSistema({ body: '', hasMedia: true }), 'un adjunto sin pie tras mandar uno: del sistema');
    ok(!_propios.esDelSistema({ body: '', hasMedia: true }), 'otro adjunto sin pie, sin marca: de una persona');

    // ── Apagado no hace nada, y fuera de horario la vuelta no escribe a nadie ──
    const antes = process.env.ESPERAS_ENABLED;
    process.env.ESPERAS_ENABLED = 'false';
    ok(await esperas.abrir({ tel: '600111222', motivo: 'DOCUMENTACION' }) === null, 'apagado: no abre nada');
    ok((await esperas.vuelta()).motivo === 'apagado', 'apagado: la vuelta no corre');
    ok((await esperas.vuelta({ seco: true, ahora: new Date('2026-11-14T10:00:00Z') })).motivo === 'fuera de horario',
        'en seco, un sábado: fuera de horario');
    process.env.ESPERAS_ENABLED = 'true';
    ok(await esperas.abrir({ tel: '600111222', motivo: 'INVENTADO' }) === null, 'un motivo fuera del catálogo no se abre');
    ok(await esperas.abrir({ tel: '', motivo: 'DOCUMENTACION' }) === null, 'sin teléfono no se abre');
    if (antes === undefined) delete process.env.ESPERAS_ENABLED; else process.env.ESPERAS_ENABLED = antes;
    ok(esperas.modo() === (process.env.ESPERAS_MODO === 'real' ? 'real' : 'copia'), 'sin ESPERAS_MODO=real, modo copia');

    console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo bien.');
    process.exit(fallos ? 1 : 0);
})();
