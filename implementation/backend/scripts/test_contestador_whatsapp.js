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
    ok(copia.includes('«C12» se lo manda tal cual') && copia.includes('«C12, dile además…» lo cambia'), 'copia: «C12» lo manda, «C12, dile…» lo cambia');
    const real = C.textoParaFran({ id: 12 }, d, { m: 'real', enviado: true });
    ok(real.startsWith('*C12 · He contestado a') && !real.includes('«C12»'), 'real: «he contestado», sin «C12»');
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

// ── Si Fran ha escrito a mano, ya no se calla 24 h: se le deja `relevoMin` y luego contesta él ──
{
    const ahora = 1_794_400_000;
    const pausa = new Date((ahora + 20 * 3600) * 1000);   // la pausa de 24 h de las esperas
    ok(C.dejarleAElla(pausa, ahora - 10 * 60, ahora), 'escribe 10 min después de Fran: se le deja a Fran');
    ok(!C.dejarleAElla(pausa, ahora - 40 * 60, ahora), 'lleva 40 min sin que Fran le conteste: contesta el contestador');
    ok(!C.dejarleAElla(null, ahora - 1 * 60, ahora), 'sin nadie de la casa en el chat: no se espera a nadie');
    ok(C.CFG.relevoMin === 30, 'el relevo, a los 30 min por defecto');
}

// ── El interruptor ──
ok(!C.activo(), 'con CONTESTADOR_ENABLED distinto de true, no hace nada');
ok(C.modo() === (process.env.CONTESTADOR_MODO === 'real' ? 'real' : 'copia'), 'modo copia salvo CONTESTADOR_MODO=real');
{
    const antes = { m: process.env.CONTESTADOR_MODO, g: process.env.CONTESTADOR_GUARDAR };
    delete process.env.CONTESTADOR_MODO; delete process.env.CONTESTADOR_GUARDAR;
    ok(C.modoGuardar() === 'copia', 'guardar: en copia por defecto');
    process.env.CONTESTADOR_GUARDAR = 'real';
    ok(C.modoGuardar() === 'real', 'guardar: de verdad con CONTESTADOR_GUARDAR=real aunque las respuestas sigan en copia');
    delete process.env.CONTESTADOR_GUARDAR; process.env.CONTESTADOR_MODO = 'real';
    ok(C.modoGuardar() === 'real', 'guardar: con el modo real se guarda siempre (la respuesta dice «ya lo tengo»)');
    for (const [k, v] of [['CONTESTADOR_MODO', antes.m], ['CONTESTADOR_GUARDAR', antes.g]]) {
        if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
}

// ── Lo que se GUARDA de lo que manda, en el mensaje a Fran ──
{
    const items = [
        { msg: 'm1', obra: '26RES060_901', tipo: 'FACTURA', que: 'Factura de la aerotermia', slot: 'DOC_FACTURAS', destino: 'Facturas de la instalación', guardar: true },
        { msg: 'm2', obra: '26RES060_901', tipo: 'FACTURA', que: 'Factura del depósito', slot: 'DOC_FACTURAS', destino: 'Facturas de la instalación', guardar: true },
        { msg: 'm3', obra: '26RES060_901', tipo: 'DNI', que: 'DNI del titular', guardar: false, motivo: 'el DNI: no lo guardo solo' },
    ];
    const d = { accion: 'RESPONDER', titulo: 'Instalaciones Ejemplo (instalador)', obra: '26RES060_901', pendientes: [], texto: 'Recibidas las dos facturas.', guardar: items };
    const copia = C.textoParaFran({ id: 21 }, d, { m: 'copia', mg: 'copia' });
    ok(copia.includes('Guardaría en el expediente:\n- Factura de la aerotermia → Facturas de la instalación (26RES060_901)'), 'copia: dice qué guardaría y dónde');
    ok(copia.includes('No lo guardo yo (míralo tú):\n- DNI del titular (26RES060_901): el DNI: no lo guardo solo'), 'copia: lo que no guarda, con el porqué');
    ok(copia.includes('«C21» lo guarda y le manda esto'), 'copia: «C21» guarda y contesta');
    const hechos = items.map(x => (x.guardar ? { ...x, hecho: true } : x));
    const real = C.textoParaFran({ id: 21 }, { ...d, guardar: hechos }, { m: 'copia', mg: 'real' });
    ok(real.includes('He guardado en el expediente:') && !real.includes('Guardaría') && real.includes('«C21» se lo manda tal cual'),
        'guardar real con respuestas en copia: «he guardado» y «manda» solo contesta');
    const fallo = C.lineasGuardar([{ ...items[0], error: 'Google Drive no lo ha aceptado' }]);
    ok(fallo[0] === 'No he podido guardar:' && /Drive no lo ha aceptado$/.test(fallo[1]), 'un fallo al guardar se dice con su error');
    const calla = C.textoParaFran({ id: 22 }, { accion: 'CALLAR', titulo: 'Ana', motivo: 'solo es cortesía', pendientes: [], guardar: items.slice(0, 1) }, { m: 'copia', mg: 'copia' });
    ok(calla.startsWith('*C22 · Guardaría lo que ha mandado Ana*') && calla.includes('(sin escribirle)'), 'callar con algo que guardar: a Fran, y «manda» solo guarda');
    ok(C.lineasGuardar([]).length === 0, 'sin nada que guardar, ni una línea');
}

// ── El prompt: lo del INSTALADOR y lo que ya le pedimos antes ──
{
    const URL_INST = 'https://app.brokergy.es/instalador/ex-1';
    const ch = { rol: 'instalador', personas: [{ tipo: 'instalador', id: 'p1', nombre: 'Instalaciones Ejemplo' }], obras: [], texto: '[10/11 10:03] ELLOS: Te dejo las dos facturas' };
    const dossier = () => ({
        numero_expediente: '26RES060_901', referencia: 'C/ Mayor 1', fase: 'PTE_DOCUMENTACION',
        pendientes: [{ clave: 'factura', texto: 'Factura de la instalación' }, { clave: 'rite', texto: 'Certificado RITE' }],
        enlaces: { subir_documentacion: URL_SUBIR, subir_instalador: URL_INST },
    });
    const llegado = { lineas: ['Factura de la aerotermia (10/11 10:02) — YA GUARDADO en el expediente'], slots: new Set(['DOC_FACTURAS', 'factura']) };
    const situ = { enlace: URL_INST, firma_fran: false, rite: { certificado: false, memoria_preparada: false }, cifo: { firmado: false, enviado_at: null, borrador: null }, facturas: 2 };
    const pedidos = [{ at: '2026-10-20T09:00:00Z', texto: 'Hola, para 26RES060_901 nos falta la factura y el certificado RITE.' }];
    const { prompt, enlaces } = cerebro.construirPrompt(ch, { tipo: 'expediente', codigo: '26RES060_901' }, dossier(), llegado, { instalador: situ, pedidos });
    ok(prompt.includes('# LO DEL INSTALADOR EN ESTA OBRA') && prompt.includes('Certificado RITE (el de Industria): NO lo tenemos'), 'el prompt dice cómo está el RITE');
    ok(prompt.includes('{ENLACE_INSTALADOR}') && !prompt.includes(URL_INST) && enlaces['{ENLACE_INSTALADOR}'] === URL_INST, 'su enlace va como MARCA');
    ok(prompt.includes('pregúntale si ya tiene el certificado RITE'), 'sin RITE ni memoria: se le pregunta si lo tiene');
    ok(prompt.includes('Recibidas\n  las dos facturas, ya las tengo en el expediente') || prompt.includes('ya las tengo en el expediente'), 'lo guardado se acusa en concreto');
    ok(prompt.includes('# LO QUE YA LE HEMOS PEDIDO ANTES') && prompt.includes('nos falta la factura y el certificado RITE') && prompt.includes('palabras PARECIDAS'),
        'lo que ya le pedimos, para decirlo parecido');
    const fran = cerebro.construirPrompt(ch, { tipo: 'expediente', codigo: '26RES060_901' }, dossier(), llegado, { instalador: { ...situ, firma_fran: true } }).prompt;
    ok(fran.includes('los firma y presenta FRAN') && !fran.includes('Su enlace (sube el RITE'), 'si firma Fran con su certificado, no se le piden ni se le da el enlace');
    const cli = cerebro.construirPrompt({ ...ch, rol: 'cliente' }, { tipo: 'expediente', codigo: '26RES060_901' }, { ...dossier(), enlaces: { subir_documentacion: URL_SUBIR } }, llegado, { instalador: situ }).prompt;
    ok(cli.includes('a un cliente no se le piden') && !cli.includes('{ENLACE_INSTALADOR}'), 'a un cliente: lo del instalador no se le pide');
    const sinExtra = cerebro.construirPrompt(ch, { tipo: 'expediente', codigo: '26RES060_901' }, dossier(), { lineas: [], slots: new Set() }).prompt;
    ok(!sinExtra.includes('LO DEL INSTALADOR EN ESTA OBRA') && !sinExtra.includes('LO QUE YA LE HEMOS PEDIDO'), 'sin extra, el prompt de siempre');
    ok(!sinExtra.includes('Perdona la tardanza'), 'contestado a tiempo: sin disculpa');
    const tarde = cerebro.construirPrompt(ch, { tipo: 'expediente', codigo: '26RES060_901' }, dossier(), { lineas: [], slots: new Set() }, { tardeHoras: 130 }).prompt;
    ok(tarde.includes('lleva 5 días esperando') && tarde.includes('«Perdona la tardanza.»'), 'tarde: el cerebro sabe cuánto lleva esperando y lo reconoce');
    const unDia = cerebro.construirPrompt(ch, { tipo: 'expediente', codigo: '26RES060_901' }, dossier(), { lineas: [], slots: new Set() }, { tardeHoras: 20 }).prompt;
    ok(!unDia.includes('Perdona la tardanza'), 'menos de un día: sin disculpa');
}

// ── Instaladores SIN obra viva (16/11/2026, «sí, amplíalo») ──
{
    const porTel = new Map([['600000001', [{ tipo: 'cliente', id: 'c1' }]]]);
    const partners = [
        { id_empresa: 'p1', razon_social: 'INSTALA SL', tipo_empresa: 'INSTALADOR', tlf: '+34 600 000 002', contactos_notificacion: [{ tlf: '600000003' }] },
        { id_empresa: 'p2', razon_social: 'CERT SL', tipo_empresa: 'CERTIFICADOR', tlf: '600000004' },
        { id_empresa: 'p3', razon_social: 'CON OBRA SL', tipo_empresa: 'INSTALADOR', tlf: '600000001' },
    ];
    const m = C.mapaSinObra(partners, porTel);
    ok(m.has('600000002') && m.has('600000003'), 'sin obra: los teléfonos del instalador (también el de avisos) entran');
    ok(!m.has('600000004'), 'sin obra: un certificador no entra');
    ok(!m.has('600000001'), 'sin obra: un teléfono que ya está en el universo no se duplica');
    const k = (t, o) => C.clasificarSinObra(t, { porTel, sinObra: m, esMovil: true, ...o });
    ok(k('600000001') === null, 'con obra viva: el camino de siempre');
    ok(k('600000002')?.tipo === 'registrado', 'partner instalador sin obra: registrado');
    ok(k('611111111', { conocido: 'solicitud de instalador' })?.tipo === 'solicitud', 'solicitud de instalador: se contesta');
    ok(k('611111111', { conocido: 'cliente' }) === null, 'un cliente sin obra viva: no (como antes)');
    ok(k('611111111', { conocido: 'certificador de la app' }) === null, 'un certificador de la app: no');
    ok(k('611111111')?.tipo === 'desconocido', 'no está en la app y es móvil español: desconocido');
    ok(k('611111111', { esMovil: false }) === null, 'no está en la app y no es móvil español: no');
    const ch = { texto: 'ELLOS: Hola, tengo un cliente en Tomelloso', rol: 'instalador', personas: [], obras: [] };
    const r = cerebro.construirPrompt(ch, null, null, { lineas: [], slots: new Set() }, { sinObra: 'desconocido' });
    ok(r.enlaces['{ENLACE_VIDEO_INSTALADORES}'] === cerebro.VIDEO_INSTALADORES(), 'sin obra: el vídeo de instaladores va como marca');
    ok(r.prompt.includes('NO TIENE OBRA CON NOSOTROS') && r.prompt.includes('ANTES de facturar'), 'sin obra: el cerebro tiene el caso G');
    ok(r.prompt.includes('NO es un instalador') && r.prompt.includes('Ante la duda, CALLAR'), 'desconocido: si no es instalador, calla');
    const r2 = cerebro.construirPrompt(ch, null, null, { lineas: [], slots: new Set() }, { sinObra: 'registrado' });
    ok(!r2.prompt.includes('NO es un instalador ni una empresa'), 'registrado: no se le pregunta si es instalador');
    const r3 = cerebro.construirPrompt(ch, null, null, { lineas: [], slots: new Set() }, {});
    ok(!r3.enlaces['{ENLACE_VIDEO_INSTALADORES}'] && !r3.prompt.includes('NO TIENE OBRA CON NOSOTROS'), 'con obra: nada de esto');
    const fin = cerebro.rematar({ accion: 'RESPONDER', parrafos: ['Hola, te paso el vídeo:', '{ENLACE_VIDEO_INSTALADORES}'] }, r.enlaces);
    ok(fin.mensaje.includes(cerebro.VIDEO_INSTALADORES()) && !fin.problemas_enlaces.length, 'la marca del vídeo se cambia por su enlace');
}

// ── Lo atrasado se contesta (ya no va entero a Fran) y lo de Gemini de respaldo, a Fran ──
{
    ok(C.CFG.maxHorasSinContestar >= 168, 'lo de una semana se contesta solo (antes, a partir de 48 h, a Fran)');
    ok(C.CFG.diasContexto * 24 > C.CFG.maxHorasSinContestar, 'la conversación que se lee cubre lo más antiguo que se contesta');
    ok(C.modoDeFila('real', { accion: 'RESPONDER', cerebro: 'claude (claude-sonnet-5-5, 9 s)' }) === 'real', 'real: lo de Claude sale solo');
    ok(C.modoDeFila('real', { accion: 'RESPONDER', cerebro: 'gemini (respaldo: sin JSON)' }) === 'copia', 'real: lo de Gemini de respaldo va a Fran como copia');
    ok(C.modoDeFila('real', { accion: 'ESCALAR', cerebro: 'gemini (respaldo: x)' }) === 'real', 'un ESCALAR de respaldo: su acuse sale igual');
    ok(C.modoDeFila('copia', { accion: 'RESPONDER', cerebro: 'claude' }) === 'copia', 'en copia, todo copia');
}

// ── El INVESTIGADOR (16/11/2026): lo que se iba a escalar se investiga y se contesta ──
{
    // El acuse vacío («Recibido, lo miro y te digo») no contesta nada: con tema, dice de qué.
    ok(!cerebro.acuseConcreto('Recibido, lo miro y te digo') && !cerebro.acuseConcreto('Recibido Manuel, lo miro y te digo.')
        && !cerebro.acuseConcreto('Déjame que lo mire y te cuento, Ana.'), 'acuse vacío: «recibido, lo miro y te digo» (con o sin nombre)');
    ok(cerebro.acuseConcreto('Lo de la factura a nombre de los dos lo miro y te digo.')
        && cerebro.acuseConcreto('Recibidas las fotos de la caldera; lo del bono te lo confirmo con la simulación.'), 'acuse concreto: nombra lo suyo');
    const v = cerebro.rematar({ accion: 'ESCALAR', parrafos: [], acuse: 'Recibido, lo miro y te digo', tema: 'el bono de la calle San Miguel.', motivo: 'm' }, ENLACES);
    ok(v.acuse === 'Lo del bono de la calle San Miguel lo miro y te digo.', 'acuse vacío + tema → «Lo de <tema> lo miro y te digo.»');
    const c = cerebro.rematar({ accion: 'ESCALAR', parrafos: [], acuse: 'Lo de la memoria no hace falta que la pagues: la preparo yo.', tema: 'la memoria RITE', motivo: 'm' }, ENLACES);
    ok(c.acuse === 'Lo de la memoria no hace falta que la pagues: la preparo yo.', 'un acuse concreto se respeta');
    // El borrador para Fran lleva los enlaces puestos; el aviso solo con RESPONDER.
    const b = cerebro.rematar({ accion: 'ESCALAR', parrafos: [], acuse: '', borrador: 'Hola Ana, súbela aquí:\n{ENLACE_SUBIR}\n\nUn saludo', aviso: 'x', fuentes: ['oportunidad OP1', ''], motivo: 'm' }, ENLACES);
    ok(b.borrador.includes(URL_SUBIR) && !/saludo/i.test(b.borrador) && b.aviso === '' && b.fuentes.length === 1, 'ESCALAR: borrador con su enlace y rematado; sin aviso');
    const a = cerebro.rematar({ accion: 'RESPONDER', parrafos: ['La memoria la preparo yo, no tienes que pagarla.'], aviso: 'preparar la Memoria RITE de 26RES060_250', motivo: 'm' }, ENLACES);
    ok(a.aviso === 'preparar la Memoria RITE de 26RES060_250' && a.borrador === '', 'RESPONDER con aviso para Fran');
    ok(cerebro.rematar({ accion: 'ESCALAR', parrafos: [], para_fran: true, motivo: 'm' }, ENLACES).para_fran === true, 'para_fran se respeta');

    // Qué se investiga: lo escalado sin para_fran, con Claude; lo de Fran, no.
    ok(cerebro.debeInvestigar({ accion: 'ESCALAR', para_fran: false, cerebro: 'claude (sonnet, 9 s)' }), 'un ESCALAR normal se investiga');
    ok(cerebro.debeInvestigar({ accion: 'ESCALAR', para_fran: true, cerebro: 'claude' }), 'lo de Fran también pasa por el investigador, para dejarle el borrador');
    ok(!cerebro.debeInvestigar({ accion: 'RESPONDER', cerebro: 'claude' }) && !cerebro.debeInvestigar({ accion: 'CALLAR' }), 'lo contestado o callado, no');
    ok(!cerebro.debeInvestigar({ accion: 'ESCALAR', cerebro: 'gemini (respaldo: sin JSON)' }), 'con Claude caído (Gemini de respaldo) no se investiga');
    ok(!cerebro.debeInvestigar({ accion: 'ESCALAR', cerebro: 'claude' }, { noInvestigar: true }), 'noInvestigar lo apaga');
    process.env.CONTESTADOR_INVESTIGAR = 'false';
    ok(!cerebro.debeInvestigar({ accion: 'ESCALAR', cerebro: 'claude' }), 'CONTESTADOR_INVESTIGAR=false lo apaga');
    delete process.env.CONTESTADOR_INVESTIGAR;

    // La segunda vuelta: mismo prompt, la orden de consultas, el manual y el JSON con borrador.
    const ch = { texto: 'ELLOS: ¿cobraré al menos 5.000 € de bono?', rol: 'cliente', personas: [], obras: [] };
    const base = cerebro.construirPrompt(ch, null, null, { lineas: [], slots: new Set() }, {});
    ok(base.prompt.includes('"para_fran"') && base.prompt.includes('lo mira enseguida un compañero'), 'el cerebro rápido sabe que lo escalado se investiga y marca para_fran');
    ok(!/pregunta CUÁNTO va a cobrar, cuándo exactamente, por facturas nuestras, IRPF o impuestos/.test(base.prompt), 'el dinero y el IRPF ya no van derechos a Fran');
    const inv = cerebro.construirInvestigacion(base.prompt, { motivo: 'pregunta si cobrará 5.000 €' }, { orden: 'node /x/contestador_consultas.js', docs: 'C:\\r\\docs\\conocimiento' });
    ok(inv.startsWith(base.prompt) && inv.includes('pregunta si cobrará 5.000 €'), 'la investigación parte del mismo prompt y del motivo');
    ok(inv.includes('node /x/contestador_consultas.js oportunidad') && inv.includes('C:/r/docs/conocimiento/consultas'), 'lleva la orden de consultas y el manual (consultas/ primero)');
    ok(/"borrador"/.test(inv) && /"aviso"/.test(inv) && /"fuentes"/.test(inv) && /SIMULACIÓN/.test(inv), 'pide borrador, aviso y fuentes, y explica el dinero de la simulación');
    const invFran = cerebro.construirInvestigacion(base.prompt, { motivo: 'se queja: no se fía', para_fran: true }, { orden: 'o', docs: 'd' });
    ok(invFran.includes('PREPARA LA RESPUESTA PARA FRAN') && invFran.includes('SIEMPRE "ESCALAR"') && !invFran.includes('INVESTIGA Y CONTESTA'), 'lo de Fran: no se contesta, se le prepara el borrador');
    // Las rutas viajan como MARCAS (el prompt se arma en el backend, Claude corre en el asistente)
    // y las pone quien lanza Claude: las mismas de su permiso de Bash y de su --add-dir.
    const cc = require('./contestador_claude');
    const conMarcas = cerebro.construirInvestigacion('P', { motivo: 'x' }, { orden: cc.MARCA_ORDEN, docs: cc.MARCA_DOCS });
    const puesto = cc.ponerRutas(conMarcas);
    ok(!puesto.includes('{{') && puesto.includes(`${cc.ORDEN_CONSULTAS()} expediente`) && puesto.includes(`${cc.DOCS().split('\\').join('/')}/consultas`), 'las marcas se cambian por la orden y el manual de donde corre Claude');

    // Lo que le llega a Fran: el borrador y «C12»; lo contestado con aviso, «Para ti».
    const esc = C.textoParaFran({ id: 30 }, {
        accion: 'ESCALAR', titulo: 'Ana', motivo: 'factura a nombre de uno', acuse: 'Lo de la factura lo miro y te digo.',
        borrador: 'Hola Ana, con la factura a tu nombre vale.', fuentes: ['consultas/cae-a-nombre…'], pendientes: [],
    }, { m: 'real', acuseEnviado: true });
    ok(esc.includes('Le he dicho: «Lo de la factura') && esc.includes('> Hola Ana, con la factura') && esc.includes('«C30» le manda esto'), 'ESCALAR con borrador: acuse dicho, borrador y «C30»');
    ok(esc.includes('He mirado: consultas/cae-a-nombre'), 'y lo que ha mirado');
    const resp = C.textoParaFran({ id: 31 }, { accion: 'RESPONDER', titulo: 'Miguel', texto: 'La memoria la preparo yo.', aviso: 'preparar la Memoria RITE de 26RES060_250', pendientes: [] }, { m: 'real', enviado: true });
    ok(resp.includes('He contestado a Miguel') && resp.includes('*Para ti:* preparar la Memoria RITE'), 'RESPONDER con aviso: Fran sabe qué tiene que hacer');

    // «C12» tras el acuse: lo único que puede haber después es ESE acuse.
    const ms = [{ id: 'a', de_mi: false, texto: '¿?' }, { id: 'b', de_mi: true, texto: 'Lo de la factura lo miro y te digo.' }];
    ok(C.chatHaCambiado(ms, 'a', 'Lo de la factura lo miro y te digo.') === null, '«C12» tras el acuse: el chat no ha cambiado');
    ok(C.chatHaCambiado(ms, 'a', null) === 'nuestro', 'sin acuse enviado, lo nuestro de después sí es un cambio');
    ok(C.chatHaCambiado([...ms, { id: 'c', de_mi: false }], 'a', 'Lo de la factura lo miro y te digo.') === 'suyo', 'si ha vuelto a escribir, no se manda');
    ok(C.chatHaCambiado(ms.slice(0, 1), 'a', null) === null && C.chatHaCambiado(ms, 'x', null) === 'nuestro', 'sin nada después, igual; sin su mensaje, cambio');

    // Lo que el investigador lee de la simulación: las cifras de la propuesta, redondeadas.
    const { resumenSimulacion } = require('./contestador_consultas');
    const sim = resumenSimulacion({ inputs: { presupuesto: 10071.85 }, result: { financials: { caeBonus: 3056.97, irpfDeduction: 6043.1, totalAyuda: 9100.08 } } });
    ok(sim.bono_energetico_estimado === 3057 && sim.deduccion_irpf_estimada === 6043 && sim.total_ayudas_estimado === 9100 && sim.presupuesto_considerado === 10072, 'simulación: bono, IRPF y total de la propuesta, redondeados');
    ok(resumenSimulacion({}).bono_energetico_estimado === null, 'sin simulación: null, nunca 0');
}

// ── Lo que NO es de ninguna obra no se pregunta de qué obra es (turno 414, 16/11/2026) ──
// Vicente Alhambra (instalador, 3 obras en Ruidera) mandó, sin texto, el cartel de un curso de
// Johnson sobre aerotermia y CAEs; el cerebro solo veía «[foto]» y le preguntó de qué obra era,
// con sus tres direcciones. Fran tuvo que disculparse a mano.
{
    console.log('\nUn adjunto que no es de obra (16/11/2026)');
    const R = require('../services/rondaWhatsapp');
    const filas = [
        { que: 'Imagen de un curso de formación de Johnson sobre aerotermia y CAEs', cuando: '16/11 19:19', obra: null, tipo: 'OTRO_DOCUMENTO' },
        { que: 'Meme', cuando: '16/11 19:20', obra: '—', tipo: 'NO_RELACIONADO' },
        { que: 'Placa de la caldera', cuando: '16/11 19:21', obra: '26RES060_175', tipo: 'FOTO_PLACA', slot: null },
        { que: 'Factura de otra obra', cuando: '16/11 19:22', obra: '26RES060_176', tipo: 'FACTURA' },
    ];
    const ll = R.lineasLlegado(filas, '26RES060_175');
    ok(ll.lineas.some(l => l.startsWith('Imagen de un curso de formación de Johnson') && /SIN OBRA asignada/.test(l)), 'lo que no tiene obra le llega al cerebro, con lo que es (antes se caía)');
    ok(ll.lineas.some(l => l.startsWith('Meme') && /NO es de ninguna obra/.test(l)), 'lo NO_RELACIONADO, dicho como tal');
    ok(ll.lineas.some(l => l.startsWith('Placa de la caldera')) && !ll.lineas.some(l => l.startsWith('Factura de otra obra')), 'lo de la obra a la que se contesta, sí; lo de otra obra, no (como antes)');
    const ll2 = R.lineasLlegado([], '', ['16/11 19:19 image', '16/11 19:20 audio (transcrito)']);
    ok(ll2.lineas.length === 1 && /NO se ha podido ver qué es: no le preguntes de qué obra es/.test(ll2.lineas[0]), 'lo que no se ha podido ver también llega, y no se pregunta de qué obra es (un audio transcrito ya va en la conversación)');

    // La causa de fondo, medida en el seco: Gemini devolvió 24 adjuntos para UNO (numeró él las fotos
    // viejas de la conversación) y su «#1», una foto de la obra de José Luis, se le pegó al cartel.
    const IA = require('../services/rondaWhatsappIA');
    const obras = [{ codigo: '26RES060_175' }];
    const mal = IA.validarAnalisis({ adjuntos: [
        { n: 1, obra: '26RES060_175', tipo: 'FOTO_OBRA', que_es: 'fotos de la obra de Jose Luis', confianza: 'alta' },
        { n: 24, obra: '', tipo: 'NO_RELACIONADO', que_es: 'cartel de un curso de Johnson', confianza: 'alta' },
    ] }, obras, 1);
    ok(mal.adjuntos.length === 0 && mal.numeracion_dudosa === 2, 'un número de adjunto que no se le dio: nada de lo que dice de los adjuntos vale (queda sin leer, no se guarda)');
    const bien = IA.validarAnalisis({ adjuntos: [{ n: 1, obra: '', tipo: 'NO_RELACIONADO', que_es: 'cartel', confianza: 'alta' }] }, obras, 1);
    ok(bien.adjuntos.length === 1 && !bien.numeracion_dudosa, 'bien numerado: se queda');
    ok(IA.validarAnalisis({ adjuntos: [{ n: 1, obra: '', tipo: 'X' }, { n: 1, obra: '', tipo: 'X' }] }, obras, 2).numeracion_dudosa === 2, 'un número repetido, también dudoso');

    const ch = { texto: 'NOSOTROS [10/11]: Mándame la foto de la máquina de dentro y su pegatina\nELLOS [16/11 19:19]: [imagen]', rol: 'instalador', personas: [], obras: [] };
    const { prompt } = cerebro.construirPrompt(ch, null, null, ll, {});
    ok(prompt.includes('Imagen de un curso de formación de Johnson') && /nunca le preguntes de qué obra es/.test(prompt), 'el prompt lo lleva y dice que no se pregunta de qué obra es');
    ok(/no le listes las direcciones de sus obras/.test(prompt) && /mira lo que ya le hemos pedido/.test(prompt), 'si es de obra: antes, lo ya pedido; y sin listar las direcciones');
    ok(/"aviso"/.test(prompt), 'puede callar y dejarle a Fran una frase');

    const callado = cerebro.rematar({ accion: 'CALLAR', motivo: 'cartel de un curso, no pide nada', aviso: 'Vicente ha mandado el cartel de un curso de Johnson sobre CAEs, el 25/11 en Valdepeñas' }, {});
    ok(callado.accion === 'CALLAR' && /curso de Johnson/.test(callado.aviso), 'CALLAR con aviso: se queda el aviso');
    const t = C.textoParaFran({ id: 414 }, { accion: 'CALLAR', titulo: 'Vicente Alhambra', motivo: 'cartel de un curso', aviso: callado.aviso, pendientes: ['16/11 19:19  [imagen]'] }, { m: 'real' });
    ok(t.includes('Para que lo sepas: Vicente Alhambra') && t.includes('*Para ti:* Vicente ha mandado el cartel') && t.includes('No le contesto'), 'a Fran le llega «para que lo sepas», sin escribirle al instalador');
}

// ── Cómo contesta Fran a una copia: «C4» manda; «C4, dile además…» cambia ──
{
    const { ordenContestador: o } = require('../utils/ordenContestador');
    const ids = (t) => JSON.stringify(o(t)?.tipo === 'mandar' ? o(t).ids : null);
    ok(ids('C4') === '[4]' && ids('c4') === '[4]' && ids('C 4') === '[4]', '«C4» a secas: mandar');
    ok(ids('manda C4') === '[4]' && ids('Manda c4.') === '[4]' && ids('vale C4') === '[4]' && ids('C4 ok') === '[4]' && ids('C4, mándalo') === '[4]', 'con «manda», «vale», «ok»: mandar');
    ok(ids('C2 y C4') === '[2,4]' && ids('C2, C4') === '[2,4]' && ids('C2 C4') === '[2,4]', 'varias a la vez');
    const cam = o('C4, dile además que la factura del depósito también');
    ok(cam?.tipo === 'cambios' && cam.id === 4 && cam.pide === 'dile además que la factura del depósito también', '«C4, dile además…»: con cambios (lo redacta Claude)');
    ok(o('C4 pero dile que mañana paso')?.tipo === 'cambios', '«C4 pero dile…»: con cambios');
    ok(o('Cuántas oportunidades tiene C4 instalaciones') === null && o('consumo') === null && o('C4C5') === null && o('') === null, 'lo demás no es una orden del contestador');
}

// ── Qué se guarda solo (contestadorDocumentos.planear), con la BD de mentira ──
(async () => {
    const supabase = require('../services/supabaseClient');
    const RU = require('../services/reformaUploadService');
    const Docs = require('../services/contestadorDocumentos');
    const orig = { from: supabase.from, rpc: supabase.rpc, checklist: RU.checklistForOportunidad };
    let docExp = {};
    const FILAS = {
        oportunidades: () => ({ id: 'op-1', id_oportunidad: 'OP901', datos_calculo: { reforma_uploads: { FOTO_CALDERA_ANTES: [{ driveId: 'x' }] } } }),
        expedientes: () => ({ id: 'ex-1', oportunidad_id: 'op-1', numero_expediente: '26RES060_901', documentacion: docExp, instalacion: {}, oportunidades: { ref_catastral: null, inputs: {} } }),
    };
    const LISTAS = { whatsapp_media_importada: [] };
    const escrito = [];
    supabase.from = (tabla) => {
        const q = {};
        for (const m of ['select', 'eq', 'in', 'like', 'gte', 'order', 'limit']) q[m] = () => q;
        for (const m of ['insert', 'update', 'upsert', 'delete']) q[m] = () => { escrito.push(`${m} ${tabla}`); return q; };
        q.maybeSingle = async () => ({ data: FILAS[tabla] ? FILAS[tabla]() : null, error: null });
        q.then = (res, rej) => Promise.resolve({ data: LISTAS[tabla] || [], error: null }).then(res, rej);
        return q;
    };
    supabase.rpc = async (n) => { escrito.push(`rpc ${n}`); return { data: null, error: null }; };
    RU.checklistForOportunidad = async () => [
        { key: 'DOC_FACTURAS', label: 'Facturas', labelCliente: 'Facturas de la instalación', multiple: true },
        { key: 'FOTO_UNIDAD_EXTERIOR', label: 'Unidad exterior', multiple: false },
        { key: 'FOTO_CALDERA_ANTES', label: 'Caldera', multiple: false },
    ];
    try {
        const obra = { tipo: 'expediente', codigo: '26RES060_901', oportunidad_id: 'op-1', expediente_id: 'ex-1', instalador_ids: [] };
        const fich = (s, mt = 'application/pdf') => ({ buffer: Buffer.from(s), mimetype: mt, nombre: `${s}.${mt.includes('pdf') ? 'pdf' : 'jpg'}` });
        const adj = [
            ['m1', fich('fact-1')], ['m2', fich('fact-1')], ['m3', fich('fact-2')], ['m4', fich('dni', 'image/jpeg')],
            ['m5', fich('ue', 'image/jpeg')], ['m6', fich('ue-2', 'image/jpeg')], ['m7', fich('raro', 'image/jpeg')],
            ['m8', fich('rite', 'image/jpeg')], ['m9', fich('nueva')], ['m10', fich('caldera', 'image/jpeg')], ['m11', null],
        ].map(([id, f]) => ({ id, t: 1762765200, _fichero: f }));
        const fila = (msg, tipo, extra = {}) => ({ msg, obra: '26RES060_901', tipo, que: `${tipo} ${msg}`, confianza: 'alta', t: 1762765200, ...extra });
        const plan = () => ({
            obras: [obra],
            filas: [
                fila('m1', 'FACTURA', { slot: 'DOC_FACTURAS' }), fila('m2', 'FACTURA', { slot: 'DOC_FACTURAS' }), fila('m3', 'FACTURA', { slot: 'DOC_FACTURAS', confianza: 'media' }),
                fila('m4', 'DNI'), fila('m5', 'FOTO_OBRA', { slot: 'FOTO_UNIDAD_EXTERIOR', confianza_slot: 'alta' }),
                fila('m6', 'FOTO_OBRA', { slot: 'FOTO_UNIDAD_EXTERIOR', confianza_slot: 'alta' }), fila('m7', 'FOTO_OBRA', { slot: 'FOTO_UNIDAD_EXTERIOR', confianza_slot: 'media' }),
                fila('m8', 'CERTIFICADO_RITE', { slot: 'DOC_RITE' }), fila('m9', 'FACTURA', { obra: 'NUEVA' }),
                fila('m10', 'FOTO_PLACA', { slot: 'FOTO_CALDERA_ANTES', confianza_slot: 'alta' }), fila('m11', 'FACTURA'),
                { msg: 'm12', obra: '—', tipo: 'NO_RELACIONADO', que: 'un meme', confianza: 'alta' },
            ],
        });
        Docs._pruebas.comprobarPdf = async () => ({ ok: true });   // «el PDF es de esta obra»
        const c = plan();
        const { items, ficheros } = await Docs.planear({ c, adjuntos: adj });
        const de = (id) => items.find(x => x.msg === id) || {};
        ok(de('m1').guardar && de('m1').slot === 'DOC_FACTURAS' && de('m1').destino === 'Facturas de la instalación', 'una factura clara de una obra: se guarda en sus facturas');
        ok(!de('m2').guardar && /repetido/.test(de('m2').motivo), 'la misma factura dos veces: una sola');
        ok(!de('m3').guardar && /no está claro que sea de 26RES060_901/.test(de('m3').motivo), 'sin confianza ALTA en la obra: no se guarda');
        ok(!de('m4').guardar && /el DNI: no lo guardo solo/.test(de('m4').motivo), 'un DNI no se guarda solo');
        ok(de('m5').guardar && de('m5').slot === 'FOTO_UNIDAD_EXTERIOR', 'una foto clara en un apartado vacío: se guarda');
        ok(!de('m6').guardar && /ya tiene su foto/.test(de('m6').motivo), 'dos fotos al mismo apartado de UNA: solo la primera');
        ok(!de('m7').guardar && /no está claro el apartado/.test(de('m7').motivo), 'sin confianza ALTA en el apartado: no se guarda');
        ok(de('m8').guardar && de('m8').slot === 'DOC_RITE', 'el RITE de un expediente que no lo tiene: se guarda');
        ok(!de('m9').guardar && /aún no está en la app/.test(de('m9').motivo), 'lo de una obra nueva: no se guarda');
        ok(!de('m10').guardar && /ya tiene su foto: no la piso/.test(de('m10').motivo), 'un apartado de UNA que ya tiene foto: no se pisa');
        ok(!de('m11').guardar && /no se ha podido bajar/.test(de('m11').motivo), 'sin fichero: no se guarda');
        ok(!items.some(x => x.msg === 'm12'), 'lo que no es de una obra ni se lista');
        ok(ficheros.size === 3 && ['m1', 'm5', 'm8'].every(k => ficheros.has(k)), 'se quedan los ficheros de lo que se guarda');
        ok(c.filas.find(f => f.msg === 'm1').guardado === true && /DNI/.test(c.filas.find(f => f.msg === 'm4').guardado), 'cada fila queda marcada: guardado o el porqué');
        ok(!JSON.stringify(Docs.paraFila(items)).includes('"buffer"'), 'a la fila va sin ficheros (regla 21)');

        docExp = { cert_rite_drive_link: 'https://drive/x', cert_rite_aportado_at: '2026-11-01T10:00:00Z' };
        const c2 = plan();
        const r2 = await Docs.planear({ c: c2, adjuntos: adj });
        ok(!r2.items.find(x => x.msg === 'm8').guardar && /ya tiene un certificado RITE: no lo piso/.test(r2.items.find(x => x.msg === 'm8').motivo),
            'un expediente que ya tiene certificado RITE: no se pisa');

        // Sin la comprobación de que el PDF es de esa obra (utils/pdfDelExpediente.js), el RITE no entra solo.
        docExp = {};
        Docs._pruebas.comprobarPdf = false;
        const r2b = (await Docs.planear({ c: plan(), adjuntos: adj })).items.find(x => x.msg === 'm8');
        ok(!r2b.guardar && /no lo guardo solo/.test(r2b.motivo), 'sin comprobar que el PDF es de la obra: el RITE no se guarda solo');
        // Y un PDF que no es de esa obra, tampoco.
        Docs._pruebas.comprobarPdf = async () => ({ ok: false, error: 'el PDF es de otra obra' });
        const adjPdf = adj.map(a => (a.id === 'm8' ? { ...a, _fichero: fich('rite-pdf') } : a));
        const r2c = (await Docs.planear({ c: plan(), adjuntos: adjPdf })).items.find(x => x.msg === 'm8');
        ok(!r2c.guardar && /otra obra/.test(r2c.motivo), 'un RITE en PDF de otra obra: no se guarda');
        Docs._pruebas.comprobarPdf = undefined;

        // Ejecutar: lo que ya se colocó (a mano o en otra vuelta) no se repite, y sin fichero no se inventa.
        LISTAS.whatsapp_media_importada = [{ wa_msg_id: 'm1' }];
        const its = [{ msg: 'm1', guardar: true, slot: 'DOC_FACTURAS', oportunidad_id: 'op-1' }, { msg: 'm5', guardar: true, slot: 'FOTO_UNIDAD_EXTERIOR', oportunidad_id: 'op-1' }];
        const r3 = await Docs.ejecutar(its, new Map(), {});
        ok(its[0].hecho && its[0].ya_estaba, 'ejecutar: lo ya colocado cuenta como hecho, sin volver a subirlo');
        ok(!its[1].hecho && /no tengo el fichero/.test(its[1].error) && r3.fallidos.length === 1, 'ejecutar: sin el fichero ni de dónde bajarlo, error (no se dice que está)');
        ok(!escrito.length, `planear y estas pruebas no escriben nada${escrito.length ? ` (${escrito.join(', ')})` : ''}`);
    } catch (e) {
        ok(false, `planear: ${e.stack || e.message}`);
    } finally {
        supabase.from = orig.from; supabase.rpc = orig.rpc; RU.checklistForOportunidad = orig.checklist;
    }
    console.log(fallos ? `\n✗ ${fallos} fallo(s)` : '\n✓ todo bien');
    process.exit(fallos ? 1 : 0);
})();
