// node scripts/test_aceptacion_agente.js — la revisión de la documentación tras la
// aceptación (services/aceptacionAgente.js + scripts/aceptacion.js). Sin red: textos,
// interruptor y la clave protegida del autoguardado.
const path = require('path');
require(path.join(__dirname, '../node_modules/dotenv')).config({ path: path.join(__dirname, '../.env'), quiet: true });
const agente = require('../services/aceptacionAgente');
const { componer } = require('./aceptacion');
const { mergeDocumentacion, CLAVES_PROTEGIDAS } = require('../utils/mergeDocumentacion');

let fallos = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fallos++; };

(async () => {
    // El acuse: las palabras de Fran, de tú al cliente y de vosotros a su contacto.
    ok(/revisaremos la documentación que ya tenemos.*contacto contigo para pedirte lo que nos falte/.test(agente.acuseRevision(true)), 'acuse al cliente, de tú');
    ok(/contacto con vosotros para pediros/.test(agente.acuseRevision(false)), 'acuse a la persona de contacto');

    // El encargo lo compone el servidor y lleva los pasos, la autorización y el freno.
    const t = agente.instruccion('26RES060_245');
    ok(t.includes('aceptacion.js estado 26RES060_245') && t.includes('aceptacion.js pedir 26RES060_245'), 'encargo: estado y pedir del expediente');
    ok(/generar-cee-inicial/.test(t) && /AUTORIZADO por Fran/.test(t), 'encargo: CEE inicial si no falta nada, y el envío autorizado');
    ok(/\bCEE\b/.test(t), 'encargo: menciona CEE (el vigilante elige Opus)');
    ok(/SUBIR documentación/.test(agente.instruccion('X', { motivo: 'subida', ronda: 2 })), 'encargo tras una subida');
    const tw = agente.instruccion('X', { motivo: 'whatsapp', ronda: 2, tel: '627856309' });
    ok(/por WHATSAPP/.test(tw) && tw.includes('alta_oportunidad.js chat 627856309 --bajar todo'), 'encargo tras fotos por WhatsApp: primero las lleva a la obra');
    ok(/--a instalador/.test(t) && /PARTE DE ÉL/.test(t), 'encargo: puede pedírselo al instalador y parte del borrador previo');

    // El horario: de 9 a 21 h de Madrid; fuera, a las 9:00 siguientes (23/10/2026 es CEST, UTC+2).
    ok(agente.enHorario(new Date('2026-10-23T08:00:00Z')), '10:00 en Madrid: en horario');
    ok(!agente.enHorario(new Date('2026-10-23T21:30:00Z')), '23:30 en Madrid: fuera');
    ok(agente.siguienteApertura(new Date('2026-10-23T21:30:00Z')).toISOString() === '2026-10-24T07:00:00.000Z', 'a las 23:30 → las 9:00 del día siguiente');
    ok(agente.siguienteApertura(new Date('2026-10-23T05:00:00Z')).toISOString() === '2026-10-23T07:00:00.000Z', 'a las 7:00 → las 9:00 del mismo día');
    ok(agente.sinEncargar({ seguimiento: {} }) && agente.sinEncargar({ seguimiento: { cee_inicial: 'PTE_ENVIO_CERT' } })
        && !agente.sinEncargar({ seguimiento: { cee_inicial: 'EN_TRABAJO' } }), 'sin encargar = el criterio del parte');

    // Apagado, no se encarga nada y el acuse lleva la lista de siempre.
    const antes = process.env.ACEPTACION_AGENTE_ENABLED;
    process.env.ACEPTACION_AGENTE_ENABLED = 'false';
    const r = await agente.encargarTrasAceptacion('26RES060_245');
    ok(r.ok === false && /apagado/.test(r.motivo), 'apagado: no encarga');
    process.env.ACEPTACION_AGENTE_ENABLED = 'true';
    const r2 = await agente.encargarTrasAceptacion('26RES060_245', { ceeAportado: true });
    ok(r2.ok === false && /aporta/.test(r2.motivo), 'con CEE aportado: no encarga');
    process.env.ACEPTACION_AGENTE_ENABLED = antes;

    // El WhatsApp: saludo, lista, enlace y firma; al contacto, de quién es.
    const m = componer({ dest: { saludo: 'SERGIO', titular: null }, numero: '26RES060_245', lineas: ['Foto de la placa'], link: 'https://x/subir' });
    ok(m.startsWith('¡Hola *Sergio*!') && m.includes('• Foto de la placa') && m.includes('https://x/subir') && m.includes('*BROKERGY'), 'mensaje al cliente');
    const m2 = componer({ dest: { saludo: 'Paloma', titular: 'Jose Vicente' }, numero: 'N', lineas: ['a'], link: 'l' });
    ok(m2.includes('de *Jose Vicente*') && m2.includes('Se puede subir aquí'), 'mensaje a la persona de contacto');
    const m3 = componer({ dest: { saludo: '' }, numero: 'N', lineas: ['La placa'], link: 'l', a: 'instalador', cliente: 'Sergio Moya Martinez', direccion: 'CL X 3' });
    ok(m3.startsWith('¡Hola!') && m3.includes('*N* de *Sergio Moya Martinez* (CL X 3)') && m3.includes('• La placa'), 'mensaje al instalador: genérico sin persona, con cliente y obra');
    const m4 = componer({ dest: { saludo: 'CARLOS' }, numero: 'N', lineas: ['a'], link: 'l', a: 'instalador' });
    ok(m4.startsWith('¡Hola *Carlos*!'), 'al contacto comercial, por su nombre');

    // El parte dice qué está haciendo el agente en «Aceptados y sin encargar».
    const { detalleAgente } = require('../services/seguimientoRadar');
    ok(detalleAgente(null) === null, 'parte: sin agente, el detalle de siempre');
    ok(/^Claude revisa su documentación desde el 23\/10/.test(detalleAgente({ revision_at: '2026-10-23T08:00:00Z' })), 'parte: revisando');
    ok(/^Claude le pidió al instalador el 23\/10: La placa/.test(detalleAgente({ revision_at: '2026-10-23T08:00:00Z', pedido_at: '2026-10-23T09:00:00Z', pedido: ['La placa'], pedido_quien: 'instalador' })), 'parte: lo pedido y a quién');
    ok(/9:00/.test(detalleAgente({ revision_at: '2026-10-23T20:00:00Z', programado: { para: '2026-10-24T07:00:00Z' } })), 'parte: lo programado');

    // Un mensaje que entra con el agente apagado no hace nada (ni mira el índice).
    process.env.ACEPTACION_AGENTE_ENABLED = 'false';
    await agente.alMensajeEntrante({ from: '34627856309@c.us', type: 'image', hasMedia: true });
    ok(true, 'mensaje entrante con el agente apagado: no lanza');
    process.env.ACEPTACION_AGENTE_ENABLED = antes;

    // El estado del agente no lo borra el autoguardado.
    ok(CLAVES_PROTEGIDAS.includes(agente.CLAVE_DOC), '`aceptacion_agente` está en CLAVES_PROTEGIDAS');
    const fundido = mergeDocumentacion({ aceptacion_agente: { pedido_at: 'T' } }, { aceptacion_agente: null, otra: 1 });
    ok(fundido.aceptacion_agente?.pedido_at === 'T', 'una copia vieja del navegador no lo pisa');

    console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo bien');
    process.exitCode = fallos ? 1 : 0;
})();
