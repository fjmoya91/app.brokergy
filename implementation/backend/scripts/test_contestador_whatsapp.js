// node scripts/test_contestador_whatsapp.js — el CONTESTADOR de WhatsApp
// (services/contestadorWhatsapp.js + contestadorCerebro.js), sin red ni BD:
// el remate del código (enlaces, emojis, firma, RESPONDER vacío → ESCALAR, acuse),
// el plazo de silencio con la franja, los teléfonos de la casa, el mensaje a Fran
// y que el prompt lleve las marcas y no las URL.
const path = require('path');
require(path.join(__dirname, '../node_modules/dotenv')).config({ path: path.join(__dirname, '../.env'), quiet: true });
// Nada de lo de abajo debe arrancar el contestador ni tocar la sesión.
process.env.CONTESTADOR_ENABLED = 'false';
process.env.CONTESTADOR_SILENCIO_MIN = '15';
const C = require('../services/contestadorWhatsapp');
const cerebro = require('../services/contestadorCerebro');

let fallos = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fallos++; };

const URL_SUBIR = 'https://app.brokergy.es/subir/tok123';
const ENLACES = { '{ENLACE_SUBIR}': URL_SUBIR };

// ── El remate: lo que escribe el modelo pasa por el código antes de salir ──
{
    const r = cerebro.rematar({
        accion: 'responder',
        parrafos: ['Hola Ana, recibida la factura, perfecto.', '📸 Puedes subir las fotos aquí:\n{ENLACE_SUBIR}', 'Un saludo'],
        motivo: 'acuse de la factura',
    }, ENLACES);
    ok(r.accion === 'RESPONDER', 'la acción se normaliza a mayúsculas');
    ok(!/📸/u.test(r.mensaje), 'fuera los emojis');
    ok(!/^[ \t]/m.test(r.mensaje), 'sin el hueco que deja el emoji al principio de la línea');
    ok(r.mensaje.includes(`aquí:\n${URL_SUBIR}`), 'la marca pasa a la URL real, debajo de su frase');
    ok(!/un saludo/i.test(r.mensaje), 'fuera la firma');
    ok(r.enlaces.length === 1 && r.enlaces[0].url === URL_SUBIR, 'se apunta el enlace usado');
}
{
    const r = cerebro.rematar({ accion: 'RESPONDER', parrafos: ['Mira aquí: https://app.brokergy.es/subir/inventado'], motivo: 'x' }, ENLACES);
    ok(!r.mensaje.includes('inventado') && r.problemas_enlaces.length === 1, 'una URL escrita por el modelo se quita y se avisa');
}
{
    const r = cerebro.rematar({ accion: 'RESPONDER', parrafos: ['  ', '😊'], motivo: '' }, ENLACES);
    ok(r.accion === 'ESCALAR' && r.mensaje === '', 'un RESPONDER vacío (o solo un emoji) pasa a ESCALAR');
}
{
    const r = cerebro.rematar({ accion: 'NI_IDEA', parrafos: ['Hola'], motivo: '' }, ENLACES);
    ok(r.accion === 'ESCALAR' && r.mensaje === '', 'una acción desconocida es ESCALAR y no se manda nada');
}
{
    const r = cerebro.rematar({ accion: 'ESCALAR', parrafos: ['Te cuento: cobras 3.000 €'], acuse: 'Lo miro y te digo', motivo: 'pregunta cuánto cobra' }, ENLACES);
    ok(r.mensaje === '', 'al escalar no sale el texto del modelo');
    ok(r.acuse === 'Lo miro y te digo', 'al escalar sí sale el acuse corto');
}
{
    const largo = cerebro.rematar({ accion: 'ESCALAR', parrafos: [], acuse: 'x'.repeat(200), motivo: 'm' }, ENLACES);
    const conUrl = cerebro.rematar({ accion: 'ESCALAR', parrafos: [], acuse: `Súbelo aquí ${URL_SUBIR}`, motivo: 'm' }, ENLACES);
    const conMarca = cerebro.rematar({ accion: 'ESCALAR', parrafos: [], acuse: 'Aquí {ENLACE_SUBIR}', motivo: 'm' }, ENLACES);
    ok(largo.acuse === '' && conUrl.acuse === '' && conMarca.acuse === '', 'un acuse largo o con enlace no sale');
    const comp = cerebro.rematar({ accion: 'ESCALAR', parrafos: [], acuse: 'Eso lo tengo que mirar con un compañero, te digo en cuanto lo sepa.', motivo: 'm' }, ENLACES);
    const bot = cerebro.rematar({ accion: 'ESCALAR', parrafos: [], acuse: 'Soy el asistente automático de BROKERGY, te paso con un compañero.', motivo: 'm' }, ENLACES);
    const ya = cerebro.rematar({ accion: 'ESCALAR', parrafos: [], acuse: 'Entiendo la espera, Ana. Lo miro ahora mismo y te cuento.', motivo: 'm' }, ENLACES);
    ok([comp, bot, ya].every(x => x.acuse === 'Lo miro y te digo.'), 'un acuse con «compañero», «asistente» o un plazo pasa al de siempre');
    const bien = cerebro.rematar({ accion: 'ESCALAR', parrafos: [], acuse: 'Déjame que lo mire y te cuento, Ana.', motivo: 'm' }, ENLACES);
    ok(bien.acuse === 'Déjame que lo mire y te cuento, Ana.', 'un acuse bueno se respeta');
}
{
    const r = cerebro.rematar({ accion: 'CALLAR', parrafos: ['De nada'], motivo: 'cortesía' }, ENLACES);
    ok(r.accion === 'CALLAR' && r.mensaje === '' && r.acuse === '', 'CALLAR no manda nada');
}
ok(cerebro.limpiar('Hola,\n\n\n\nBROKERGY') === 'Hola,', 'la firma BROKERGY se quita');
ok(cerebro.limpiar('Hola 👍🏽 Ana') === 'Hola Ana', 'emoji con tono de piel: fuera, sin doble espacio');

// ── El plazo: 15 min de silencio, y si cae fuera de la franja, a las 7:00 (nov = UTC+1) ──
ok(C.plazoDesde(new Date('2026-11-10T10:00:00Z')).toISOString() === '2026-11-10T10:15:00.000Z',
    'martes 11:00 → contesta a las 11:15');
ok(C.plazoDesde(new Date('2026-11-10T19:50:00Z')).toISOString() === '2026-11-11T06:00:00.000Z',
    'martes 20:50 → los 15 min caen pasadas las 21 h → miércoles 7:00');
ok(C.plazoDesde(new Date('2026-11-14T02:00:00Z')).toISOString() === '2026-11-14T06:00:00.000Z',
    'sábado 3:00 → sábado 7:00 (contestar, también el fin de semana)');

// ── Los teléfonos de la casa no se contestan nunca ──
{
    const antes = { a: process.env.ASISTENTE_WHATSAPP_TEL, b: process.env.WHATSAPP_ADMIN_CHAT, c: process.env.ADMIN_WHATSAPP };
    process.env.ASISTENTE_WHATSAPP_TEL = '34600000001';
    process.env.WHATSAPP_ADMIN_CHAT = '34600000002@c.us';
    delete process.env.ADMIN_WHATSAPP;
    ok(C.esDeLaCasa('600000001') && C.esDeLaCasa('600000002'), 'el chat de Fran y el de administración son de la casa');
    ok(!C.esDeLaCasa('600000003'), 'un cliente no es de la casa');
    for (const [k, v] of [['ASISTENTE_WHATSAPP_TEL', antes.a], ['WHATSAPP_ADMIN_CHAT', antes.b], ['ADMIN_WHATSAPP', antes.c]]) {
        if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
}

// ── El mensaje a Fran (al grupo) ──
{
    const d = {
        accion: 'RESPONDER', titulo: 'Ana García (cliente)', obra: '26RES060_999',
        pendientes: ['10/11 10:02  [documento] factura.pdf', '10/11 10:03  Ahí va la factura'],
        texto: `Hola Ana, recibida la factura.\n${URL_SUBIR}`,
    };
    const copia = C.textoParaFran({ id: 12 }, d, { m: 'copia' });
    ok(copia.startsWith('*C12 · Contestaría a Ana García (cliente)* · 26RES060_999'), 'copia: número C12, a quién y la obra');
    ok(copia.includes('> 10/11 10:03  Ahí va la factura'), 'copia: lo que escribió, citado');
    ok(copia.includes(`> ${URL_SUBIR}`), 'copia: lo que le contestaría, citado entero');
    ok(copia.includes('«manda C12»'), 'copia: dice cómo mandarlo');
    const real = C.textoParaFran({ id: 12 }, d, { m: 'real', enviado: true });
    ok(real.startsWith('*C12 · He contestado a') && !real.includes('manda C12'), 'real: «he contestado», sin «manda»');
    const esc = C.textoParaFran({ id: 13 }, { accion: 'ESCALAR', titulo: 'Ana', motivo: 'pregunta cuánto cobra', acuse: 'Lo miro y te digo', pendientes: [] }, { m: 'real', acuseEnviado: true });
    ok(esc.startsWith('*C13 · Para ti: Ana*') && esc.includes('Por qué te lo paso: pregunta cuánto cobra'), 'escalar: para ti, con el porqué');
    ok(esc.includes('Le he dicho: «Lo miro y te digo»'), 'escalar en real: el acuse que se le ha mandado');
    const largo = C.textoParaFran({ id: 1 }, { accion: 'ESCALAR', titulo: 'X'.repeat(200), pendientes: [] }, { m: 'copia' });
    ok(largo.split('\n')[0].length < 100, 'el título no se desborda');
}

// ── El prompt: lleva el conocimiento, la tarea y las MARCAS, nunca la URL ──
{
    const ch = { rol: 'cliente', personas: [{ tipo: 'cliente', id: 'c1', nombre: 'Ana García' }], obras: [], texto: '[10/11 10:03] ELLOS: Ahí va la factura' };
    const dossier = {
        numero_expediente: '26RES060_999', referencia: 'C/ Mayor 1', fase: 'PTE_DOCUMENTACION',
        pendientes: [{ clave: 'factura', texto: 'Factura de la instalación' }, { clave: 'fotos', texto: 'Fotos de la obra' }],
        enlaces: { subir_documentacion: URL_SUBIR },
    };
    const llegado = { lineas: ['factura.pdf → Factura de la instalación'], slots: new Set(['factura']) };
    const { prompt, enlaces } = cerebro.construirPrompt(ch, { tipo: 'expediente', codigo: '26RES060_999' }, dossier, llegado);
    ok(prompt.includes('{ENLACE_SUBIR}') && !prompt.includes(URL_SUBIR), 'el prompt lleva la marca, no la URL');
    ok(enlaces['{ENLACE_SUBIR}'] === URL_SUBIR, 'el mapa de marcas sale con la URL real');
    ok(!dossier.pendientes.some(p => p.clave === 'factura'), 'lo que acaba de llegar no se vuelve a pedir');
    ok(prompt.includes('TU TAREA AHORA') && prompt.includes('SEIS LÍNEAS'), 'la tarea de Fran va al final, con el tope de líneas');
    ok(prompt.includes('Ahí va la factura'), 'el prompt lleva la conversación');
}

// ── La respuesta automática de su WhatsApp Business no es suya (sin reloj) ──
{
    const { pareceAutomatica, esAutomatica } = require('../services/esperasWhatsapp');
    const deEmpresa = 'Hola! Gracias por escribirnos!\nSi es algo urgente en tu hogar 🔧🏠, cuéntanos qué ocurre y te ayudamos lo antes posible.';
    ok(pareceAutomatica(deEmpresa), 'la de un instalador (WhatsApp Business) tiene forma de automática');
    ok(!pareceAutomatica('Gracias por tu mensaje, te lo mando luego'), 'una persona que da las gracias, no');
    ok(!pareceAutomatica('Ya me han instalado la aerotermia'), 'un mensaje normal, no');
    const t = Date.parse('2026-11-09T19:43:42Z');
    ok(!esAutomatica({ body: deEmpresa, timestamp: t / 1000 }, t - 12 * 60_000), 'las esperas (con reloj de 10 min) no la verían: por eso el contestador va sin reloj');
}

// ── El interruptor ──
ok(!C.activo(), 'con CONTESTADOR_ENABLED distinto de true, no hace nada');
ok(C.modo() === (process.env.CONTESTADOR_MODO === 'real' ? 'real' : 'copia'), 'modo copia salvo CONTESTADOR_MODO=real');

console.log(fallos ? `\n✗ ${fallos} fallo(s)` : '\n✓ todo bien');
process.exit(fallos ? 1 : 0);
