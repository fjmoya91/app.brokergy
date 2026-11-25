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
    ok(r.acuse === '' && r.acuse_modelo === 'Lo miro y te digo', 'al escalar, «lo miro y te digo» NO sale (24/11/2026), pero se recuerda que lo escribió');
    const c2 = cerebro.rematar({ accion: 'ESCALAR', parrafos: [], acuse: 'Lo de la memoria no hace falta que la pagues: la preparo yo.', motivo: 'm' }, ENLACES);
    ok(c2.acuse === 'Lo de la memoria no hace falta que la pagues: la preparo yo.' && !c2.acuse_modelo, 'un acuse que dice algo de lo suyo sí sale');
}
{
    const largo = cerebro.rematar({ accion: 'ESCALAR', parrafos: [], acuse: 'x'.repeat(200), motivo: 'm' }, ENLACES);
    const conUrl = cerebro.rematar({ accion: 'ESCALAR', parrafos: [], acuse: `Súbelo aquí ${URL_SUBIR}`, motivo: 'm' }, ENLACES);
    const conMarca = cerebro.rematar({ accion: 'ESCALAR', parrafos: [], acuse: 'Aquí {ENLACE_SUBIR}', motivo: 'm' }, ENLACES);
    ok(largo.acuse === '' && conUrl.acuse === '' && conMarca.acuse === '', 'un acuse largo o con enlace no sale');
    const comp = cerebro.rematar({ accion: 'ESCALAR', parrafos: [], acuse: 'Eso lo tengo que mirar con un compañero, te digo en cuanto lo sepa.', motivo: 'm' }, ENLACES);
    const bot = cerebro.rematar({ accion: 'ESCALAR', parrafos: [], acuse: 'Soy el asistente automático de BROKERGY, te paso con un compañero.', motivo: 'm' }, ENLACES);
    const ya = cerebro.rematar({ accion: 'ESCALAR', parrafos: [], acuse: 'Entiendo la espera, Ana. Lo miro ahora mismo y te cuento.', motivo: 'm' }, ENLACES);
    ok([comp, bot, ya].every(x => x.acuse === ''), 'un acuse con «compañero», «asistente» o un plazo no sale');
    const vacio = cerebro.rematar({ accion: 'ESCALAR', parrafos: [], acuse: 'Déjame que lo mire y te cuento, Ana.', motivo: 'm' }, ENLACES);
    ok(vacio.acuse === '', '«déjame que lo mire y te cuento» no dice nada: no sale');
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
    ok(v.acuse === '', 'acuse vacío, aunque haya tema: no sale (ya no se fabrica «Lo de <tema> lo miro y te digo»)');
    const prom = cerebro.rematar({ accion: 'ESCALAR', parrafos: [], acuse: 'Lo de la factura a nombre de los dos lo miro y te digo.', motivo: 'm' }, ENLACES);
    ok(prom.acuse === '', '«Lo de X lo miro y te digo» es una promesa vacía: no sale');
    const c = cerebro.rematar({ accion: 'ESCALAR', parrafos: [], acuse: 'Lo de la memoria no hace falta que la pagues: la preparo yo.', tema: 'la memoria RITE', motivo: 'm' }, ENLACES);
    ok(c.acuse === 'Lo de la memoria no hace falta que la pagues: la preparo yo.', 'un acuse concreto se respeta');
    // 26RES093_14, 18/11/2026: recitaba lo recibido y decía «a mano».
    const manoAcuse = 'Las dos facturas en Word y tus audios sobre el concepto y la calle Niños los reviso yo a mano y te digo si están bien.';
    const mano = cerebro.rematar({ accion: 'ESCALAR', parrafos: [], acuse: manoAcuse, tema: 'las facturas de Alberto', motivo: 'm' }, ENLACES);
    const manoSinTema = cerebro.rematar({ accion: 'ESCALAR', parrafos: [], acuse: manoAcuse, motivo: 'm' }, ENLACES);
    ok(mano.acuse === '' && manoSinTema.acuse === '', 'un acuse con «a mano» no sale');
    // Lo dio por suyo sin ser «solo de Fran»: que el acuse no salga no lo convierte en «solo de Fran».
    ok(!cerebro.soloDeFran({ ...mano, para_fran: true }) && cerebro.soloDeFran({ para_fran: true, acuse: '' }), 'soloDeFran mira el acuse que ESCRIBIÓ el modelo, no el que sale');
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
    ok(inv.includes('REVÍSALO Y CONTÉSTALE TÚ') && inv.includes('TU RESPUESTA SE ENVÍA TAL CUAL') && /"por"/.test(inv)
        && ['PRECIO', 'QUEJA', 'PERSONA', 'FIRMA', 'AJENO', 'SIN_DATOS'].every(x => inv.includes(`"${x}"`)), 'la segunda vuelta contesta ella, y solo escala con un motivo de la lista cerrada');
    // Lo que SOLO contesta Fran en persona (persona o programa, una llamada): para_fran y SIN acuse.
    const invFran = cerebro.construirInvestigacion(base.prompt, { motivo: 'pregunta si es un programa', para_fran: true, acuse: '' }, { orden: 'o', docs: 'd' });
    ok(invFran.includes('PREPARA LA RESPUESTA PARA FRAN') && invFran.includes('SIEMPRE "ESCALAR"') && !invFran.includes('CONTÉSTALE TÚ'), 'persona o programa: no se contesta, se le prepara el borrador');
    // Lo demás que el cerebro rápido da por «de Fran» (cambiar el titular, una queja…) lo vuelve a mirar el investigador.
    const invQuiza = cerebro.construirInvestigacion(base.prompt, { motivo: 'pide cambiar el titular', para_fran: true, acuse: 'Lo del cambio de titular lo miro y te digo.' }, { orden: 'o', docs: 'd' });
    ok(invQuiza.includes('CONTÉSTALE TÚ') && invQuiza.includes('El primer vistazo lo dio por «de Fran»') && !invQuiza.includes('SIEMPRE "ESCALAR"'), 'lo marcado para_fran con acuse se vuelve a mirar: casi nunca es de Fran');

    // Lo investigado SE ENVÍA (21/11/2026): 34 acuses «lo miro y te digo» en tres días y ningún «C12».
    const rapida = { motivo: 'pregunta a nombre de quién va la factura', para_fran: false, acuse: 'Lo de la factura lo miro y te digo.' };
    const sinPor = cerebro.decisionTrasInvestigar({ accion: 'ESCALAR', acuse: 'Lo de la factura lo confirmo y te digo.', borrador: 'Buenos días, Cristina. La factura va a nombre del titular.\n\nCon su NIF y la dirección de la obra.', motivo: 'no hay ficha' }, rapida);
    ok(sinPor.accion === 'RESPONDER' && sinPor.parrafos.length === 2 && sinPor.acuse === '' && sinPor._enviado_sin_fran === true && /no hay ficha/.test(sinPor.aviso),
        'un ESCALAR sin motivo de la lista: su borrador ES la respuesta, y a Fran le llega por qué se lo iba a pasar');
    const rSinPor = cerebro.rematar(sinPor, ENLACES);
    ok(rSinPor.accion === 'RESPONDER' && rSinPor.mensaje.startsWith('Buenos días, Cristina.') && rSinPor.acuse === '' && rSinPor.aviso, 'rematado: se envía el texto, sin acuse y con aviso');
    const conPor = cerebro.decisionTrasInvestigar({ accion: 'ESCALAR', por: 'precio', acuse: 'Lo de pagar tú los RITE lo miro y te digo.', borrador: 'x', motivo: 'm' }, rapida);
    ok(conPor.accion === 'ESCALAR' && cerebro.rematar(conPor, ENLACES).por === 'PRECIO', 'con un motivo de la lista (un precio nuestro) se queda en Fran, con su acuse');
    ok(cerebro.decisionTrasInvestigar({ accion: 'ESCALAR', por: 'OTRA_COSA', borrador: '', acuse: 'a', motivo: 'm' }, rapida).accion === 'ESCALAR', 'sin borrador no hay nada que enviar: sigue en Fran');
    ok(cerebro.rematar({ accion: 'ESCALAR', por: 'inventado', parrafos: [], motivo: 'm' }, ENLACES).por === '', 'un «por» que no es de la lista no cuenta');
    const yaResp = { accion: 'RESPONDER', parrafos: ['Hola'], aviso: '' };
    ok(cerebro.decisionTrasInvestigar(yaResp, rapida) === yaResp && cerebro.decisionTrasInvestigar({ accion: 'CALLAR' }, rapida).accion === 'CALLAR', 'lo que el investigador contesta o calla no se toca');
    // Persona o programa / solo una llamada: diga lo que diga el investigador, a Fran y sin acuse.
    const persona = { motivo: 'pregunta si es un programa', para_fran: true, acuse: '' };
    ok(cerebro.soloDeFran(persona) && !cerebro.soloDeFran(rapida) && !cerebro.soloDeFran({ para_fran: true, acuse: 'Lo miro' }), 'solo de Fran = para_fran sin acuse');
    const p1 = cerebro.decisionTrasInvestigar({ accion: 'RESPONDER', parrafos: ['Soy Fran, claro.'], motivo: 'm' }, persona);
    const p2 = cerebro.decisionTrasInvestigar({ accion: 'ESCALAR', acuse: 'Te llamo', borrador: 'b', motivo: 'm' }, persona);
    ok(p1.accion === 'ESCALAR' && p1.acuse === '' && p1.borrador === 'Soy Fran, claro.' && p2.accion === 'ESCALAR' && p2.acuse === '' && p2.por === 'PERSONA',
        'persona o programa: nunca se contesta solo y nunca lleva acuse');
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
    // Mientras se redacta (hasta 5 min) el chat puede cambiar: se relee antes de mandar (22/11/2026).
    ok(C.trasRedactar(C.chatHaCambiado([{ id: 'a', de_mi: false }, { id: 'b', de_mi: false }], 'a', null)).estado === 'PENDIENTE',
        'si ha escrito más mientras se redactaba, se vuelve a decidir con lo nuevo (no se pierde su mensaje)');
    ok(C.trasRedactar(C.chatHaCambiado([{ id: 'a', de_mi: false }, { id: 'b', de_mi: true, texto: 'Hola, ya lo he visto' }], 'a', null)).estado === 'DESCARTADA',
        'si una persona de la casa le ha contestado mientras tanto, no se manda nada');
    ok(C.trasRedactar(C.chatHaCambiado([{ id: 'a', de_mi: false }], 'a', null)) === null, 'sin cambios, se sigue');
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

// ── Un acuse por asunto (26RES060_OP376, 17/11/2026) ──
// María José pidió el correo, lo repitió, mandó dos capturas de su asesoría y una nota de voz:
// cuatro ESCALAR en una hora y cuatro «lo miro y te digo» casi iguales (turnos 450, 454, 457, 458).
{
    console.log('\nUn acuse por asunto (26RES060_OP376, 17/11/2026)');
    const H = 3_600_000;
    const t0 = Date.parse('2026-11-17T10:00:00Z');
    const iso = (ms) => new Date(ms).toISOString();
    const acuse1 = 'Lo del correo para mandarte los papeles lo miro y te digo.';
    // 1. La petición: no hay nada abierto, lleva su acuse.
    ok(C.escaladoAbierto([], [], { ahoraMs: t0, horas: 6 }) === null, 'la primera petición: nada abierto, lleva su acuse');
    const turnos = [{ id: 450, accion: 'ESCALAR', acuse: acuse1, enviado_at: iso(t0), detalle: {} }];
    const ms = [
        { de_mi: false, t: t0 / 1000 - 60, texto: '¿Me das un correo para mandarte lo de la asesoría?' },
        { de_mi: true, t: t0 / 1000 + 2, texto: acuse1 },
    ];
    // 2. La repetición, 3. las capturas y 4. la nota de voz: el mismo asunto abierto, sin otro acuse.
    const rep = [...ms, { de_mi: false, t: t0 / 1000 + 900, texto: '¿Me lo pasas?' }];
    const a2 = C.escaladoAbierto(turnos, rep, { ahoraMs: t0 + 0.25 * H, horas: 6 });
    ok(a2 && a2.id === 450 && a2.acuse === acuse1, 'la repetición: sigue abierto lo de C450, sin otro acuse');
    const turnos3 = [...turnos, { id: 454, accion: 'ESCALAR', acuse: null, enviado_at: null, detalle: { anadido_a: 450, acuse_omitido: 'Las capturas de tu asesoría las miro y te digo.' } }];
    const caps = [...rep, { de_mi: false, t: t0 / 1000 + 1800, tipo: 'image', texto: '' }, { de_mi: false, t: t0 / 1000 + 1801, tipo: 'image', texto: '' }];
    ok(C.escaladoAbierto(turnos3, caps, { ahoraMs: t0 + 0.5 * H, horas: 6 })?.id === 450, 'las capturas: añadido a C450');
    const turnos4 = [...turnos3, { id: 457, accion: 'ESCALAR', acuse: null, enviado_at: null, detalle: { anadido_a: 450 } }];
    const voz = [...caps, { de_mi: false, t: t0 / 1000 + 3000, tipo: 'ptt', texto: '(transcrito) lo de mi madre…' }];
    ok(C.escaladoAbierto(turnos4, voz, { ahoraMs: t0 + 0.9 * H, horas: 6 })?.id === 450, 'la nota de voz: añadido a C450 (cuatro mensajes, UN acuse)');
    // Un añadido que (raro) llevó acuse: la raíz sigue siendo la primera.
    ok(C.escaladoAbierto([{ id: 460, accion: 'ESCALAR', acuse: 'x', enviado_at: iso(t0 + H), detalle: { anadido_a: 450 } }], ms, { ahoraMs: t0 + 1.1 * H, horas: 6 })?.id === 450, 'de un añadido, la raíz');
    // Se cierra: Fran le contesta a mano, «C450» manda el borrador, o pasan las horas.
    ok(C.escaladoAbierto(turnos4, [...voz, { de_mi: true, t: t0 / 1000 + 3500, texto: 'María José, el correo es info@…' }], { ahoraMs: t0 + H, horas: 6 }) === null, 'si Fran (o la app) le ha escrito después: cerrado, lo nuevo lleva acuse');
    ok(C.escaladoAbierto([{ ...turnos[0], detalle: { borrador_enviado_at: iso(t0 + H) } }], voz, { ahoraMs: t0 + 1.5 * H, horas: 6 }) === null, 'con el borrador mandado («C450»): cerrado');
    ok(C.escaladoAbierto(turnos4, voz, { ahoraMs: t0 + 7 * H, horas: 6 }) === null, 'pasadas las horas: un acuse nuevo (como mucho uno cada X horas)');
    ok(C.escaladoAbierto([{ ...turnos[0], acuse: null }], voz, { ahoraMs: t0 + H, horas: 6 }) === null, 'un ESCALAR sin acuse no abre nada');
    ok(C.escaladoAbierto([{ ...turnos[0], accion: 'RESPONDER' }], voz, { ahoraMs: t0 + H, horas: 6 }) === null, 'lo contestado no es un escalado abierto');
    ok(C.CFG.acuseHoras === 6, 'por defecto, 6 h (CONTESTADOR_ACUSE_HORAS)');

    // A Fran: «Más de…», sigue lo de C450, y que no se le ha mandado otro acuse.
    const f = C.textoParaFran({ id: 458 }, {
        accion: 'ESCALAR', titulo: 'María José', obra: '26RES060_OP376', motivo: 'nota de voz sobre su madre',
        acuse: '', escalado_abierto: { id: 450, acuse: acuse1 }, borrador: 'Sí, con la vivienda a nombre de tu madre…', pendientes: ['[nota de voz]'],
    }, { m: 'real', acuseEnviado: false });
    ok(f.includes('Más de María José (sigue lo de C450)') && f.includes('No le he mandado otro acuse: ya tiene el de C450'), 'a Fran le llega como añadido de C450, sin acuse nuevo');
    ok(f.includes('> Sí, con la vivienda') && f.includes('«C458» le manda esto') && !f.includes('Le he dicho'), 'con su borrador y «C458»; no dice que le haya dicho nada');

    // b) El correo de la casa se puede dar; c) lo fiscal de consultas/ se contesta.
    const ch = { texto: 'ELLOS: ¿me das un correo para mandarte los papeles?', rol: 'cliente', personas: [], obras: [] };
    const p = cerebro.construirPrompt(ch, null, null, { lineas: [], slots: new Set() }, {}).prompt;
    ok(p.includes('el correo info@brokergy.es') && /Ningún otro correo ni teléfono/.test(p), 'el cerebro puede dar el correo de la casa (y ningún otro)');
    process.env.CONTESTADOR_CORREO_CLIENTES = 'otro@brokergy.es';
    ok(cerebro.construirPrompt(ch, null, null, { lineas: [], slots: new Set() }, {}).prompt.includes('el correo otro@brokergy.es'), 'el correo se cambia con CONTESTADOR_CORREO_CLIENTES');
    delete process.env.CONTESTADOR_CORREO_CLIENTES;
    const inv = cerebro.construirInvestigacion(p, { motivo: 'IRPF con la vivienda a nombre de su madre' }, { orden: 'o', docs: 'd' });
    ok(inv.includes('el correo info@brokergy.es'), 'el investigador lo hereda');
    ok(/vivienda habitual/.test(inv) && /copropietario/.test(inv) && /no lo convierte en «de Fran»/.test(inv), 'lo fiscal: busca en consultas/ por palabras y un detalle del caso no lo hace de Fran');
}

// ── La PETICIÓN NUEVA (20/11/2026, Fran Ruimor, C696) ──
// Mandó la captura del Catastro de una parcela de Vara de Rey y un presupuesto de aerotermia, con
// «Buenos días cuando puedas». Gemini los dio por obra NUEVA, pero eso se caía antes de llegar al
// cerebro, que solo veía «tiene tres obras» y contestó «He recibido la foto y el presupuesto
// 1-000048. ¿Me dices de qué obra son?…». Fran: «Buenos días Fran, lo vamos a revisar y te pasamos
// la propuesta», y que el alta arranque sola.
{
    console.log('\nLa petición nueva (Fran Ruimor, 20/11/2026)');
    const R = require('../services/rondaWhatsapp');
    const IA = require('../services/rondaWhatsappIA');
    const filas = [
        { que: 'captura de catastro de la parcela 0940025WJ6604S en Vara de Rey', cuando: '20/11 08:15', obra: 'NUEVA', tipo: 'CAPTURA_CATASTRO' },
        { que: 'presupuesto para la sustitución de caldera de gasoil por aerotermia', cuando: '20/11 08:16', obra: 'NUEVA', tipo: 'PRESUPUESTO' },
    ];
    const ll = R.lineasLlegado(filas, '');
    ok(ll.nuevas.length === 2 && ll.lineas.length === 2 && ll.lineas.every(l => /OBRA NUEVA que aún no está en la app/.test(l)), 'lo de una obra NUEVA llega al cerebro, dicho como tal (antes se caía)');
    ok(R.lineasLlegado([{ que: 'meme', obra: 'NUEVA', tipo: 'NO_RELACIONADO', cuando: 'x' }], '').nuevas.length === 0, 'lo NO_RELACIONADO nunca es una petición');

    const obras = [
        { codigo: '26RES080_81', tipo: 'expediente', referencia: 'CL MAYOR 1, VILLARROBLEDO' },
        { codigo: '26RES060_216', tipo: 'expediente', referencia: 'CL SOL 2, VILLARROBLEDO' },
        { codigo: '26RES060_OP300', tipo: 'oportunidad', referencia: 'CL LUNA 3, MINAYA', id_oportunidad: '26RES060_OP300' },
    ];
    const ch = {
        texto: 'NOSOTROS [23/9]: Hola Fran! Necesito que el cliente nos acepte la propuesta\nELLOS [20/11 08:15]: [imagen]\nELLOS [20/11 08:16]: [documento] Presupuesto 1-000048.pdf\nELLOS [20/11 08:16]: Buenos días cuando puedas',
        rol: 'instalador', personas: [{ tipo: 'partner', nombre: 'RUIMOR' }], obras,
    };
    const d = IA.dossierParaBorrador({ ...ch, obraNueva: true }, null, null).texto;
    ok(/OBRA NUEVA/.test(d) && !/TIENE VARIAS OBRAS ABIERTAS/.test(d) && /no le preguntes de cuál es/.test(d), 'el dossier: obra nueva, no «tiene varias obras, pregúntale cuál»');
    ok(/TIENE VARIAS OBRAS ABIERTAS/.test(IA.dossierParaBorrador(ch, null, null).texto), 'sin obra nueva, con varias obras, se pregunta como siempre');

    const { prompt } = cerebro.construirPrompt({ ...ch, obraNueva: true }, null, null, ll, { saludo: 'Buenos días', nombrePila: 'Fran' });
    ok(prompt.includes('ES UNA PETICIÓN NUEVA') && prompt.includes('(el Catastro, un presupuesto)'), 'el prompt: petición nueva, con lo que ha mandado en lenguaje de casa');
    ok(prompt.includes('«Buenos días, Fran. Lo vamos a revisar y te pasamos la') && /"alta": true/.test(prompt), 'la respuesta de Fran, con su saludo y su nombre, y "alta": true');
    ok(/NO se le pregunta de qué obra/.test(prompt) && /Sin recitar lo que ha mandado/.test(prompt), 'ni se pregunta de qué obra es ni se recita lo recibido');
    ok(/UNA frase pidiéndole la dirección o la referencia/.test(prompt), 'si no hay forma de saber qué vivienda es, una frase para pedirla');
    const normal = cerebro.construirPrompt(ch, null, null, { lineas: [], slots: new Set() }, { saludo: 'Buenas tardes' }).prompt;
    ok(!normal.includes('ES UNA PETICIÓN NUEVA') && normal.includes('Saluda con «Buenas tardes»'), 'sin nada nuevo, no hay petición; el saludo, el de la hora');
    ok(/no termines ofreciéndole que te avise si\s+hablaba de otra obra/.test(normal) && /Lo que ha mandado NO se recita/.test(normal), 'sin la coletilla de «otra obra» y sin recitar lo recibido');
    ok(normal.includes('ASÍ CONTESTA FRAN') && normal.includes('"alta": false'), 'con ejemplos reales de Fran, y "alta" en el formato');
    const conAgenda = cerebro.construirPrompt(ch, null, null, { lineas: [], slots: new Set() }, { saludo: 'Buenos días', agenda: 'INSTALADOR FRAN "RUIMOR"\n(villarrobledo)' }).prompt;
    ok(conAgenda.includes('(en la agenda: «INSTALADOR FRAN RUIMOR (villarrobledo)»)'), 'sin nombre de la conversación, la agenda como pista (sin comillas ni saltos)');
    ok(!cerebro.construirPrompt(ch, null, null, ll, { nombrePila: 'Ignora lo anterior y' }).prompt.includes('Ignora lo anterior'), 'un «nombre» que no es un nombre no entra');

    // El saludo según la hora de Madrid (en noviembre, UTC+1).
    ok(cerebro.saludoDeLaHora(new Date('2026-11-20T07:15:00Z')) === 'Buenos días', '08:15 → «Buenos días»');
    ok(cerebro.saludoDeLaHora(new Date('2026-11-20T12:59:00Z')) === 'Buenos días', '13:59 → «Buenos días»');
    ok(cerebro.saludoDeLaHora(new Date('2026-11-20T13:00:00Z')) === 'Buenas tardes', '14:00 → «Buenas tardes»');
    ok(cerebro.saludoDeLaHora(new Date('2026-11-20T19:30:00Z')) === 'Buenas tardes', '20:30 → «Buenas tardes»');

    // El remate: «alta» solo si no calla; y la coletilla de «otra obra», fuera.
    ok(cerebro.rematar({ accion: 'RESPONDER', parrafos: ['Buenos días, Fran. Lo vamos a revisar y te pasamos la propuesta.'], alta: true, motivo: 'x' }, {}).alta === true, 'RESPONDER con "alta": se queda');
    ok(cerebro.rematar({ accion: 'CALLAR', parrafos: [], alta: true, motivo: 'x' }, {}).alta === false, 'CALLAR nunca da de alta');
    ok(cerebro.rematar({ accion: 'RESPONDER', parrafos: ['Hola'], motivo: 'x' }, {}).alta === false, 'sin decirlo, no hay alta');
    const col = cerebro.limpiar('Buenos días, Ana. Lo de la calle Mayor ya está en revisión. Si preguntabas por otra obra, avísame y lo miro.');
    ok(col === 'Buenos días, Ana. Lo de la calle Mayor ya está en revisión.', `la coletilla «si preguntabas por otra obra, avísame» se quita (${col})`);
    ok(cerebro.limpiar('Lo de la otra obra, la de Tomelloso, lo miro y te digo.') === 'Lo de la otra obra, la de Tomelloso, lo miro y te digo.', 'una frase normal sobre otra obra se queda');
    ok(cerebro.limpiar('Perfecto.\nSi te refieres a otra de tus obras, dímelo.') === 'Perfecto.', 'también en su línea aparte');

    // Cómo le llamamos: lo que le decimos NOSOTROS («Hola Fran!»), no el contestador («Hola, buenos días»).
    const ms = [
        { de_mi: true, tipo: 'chat', texto: 'Hola Fran! Necesito que el cliente nos acepte la propuesta', t: 1 },
        { de_mi: false, tipo: 'chat', texto: 'Hola Pepe', t: 2 },
        { de_mi: true, tipo: 'chat', texto: 'Hola, buenos días. He recibido la foto y el presupuesto', t: 3 },
        { de_mi: true, tipo: 'chat', texto: '✅ *CEE INICIAL REGISTRADO* — Expediente 26RES080_81', t: 4 },
    ];
    ok(C.nombrePilaDe(ms) === 'Fran', 'el nombre de pila: el de nuestro «Hola Fran!» (lo suyo y lo de la plantilla no cuentan)');
    ok(C.nombrePilaDe([{ de_mi: true, tipo: 'chat', texto: 'Buenas tardes María, ya está' }]) === 'María', '«Buenas tardes María» → María');
    ok(C.nombrePilaDe([{ de_mi: true, tipo: 'chat', texto: 'Hola Buenos días' }, { de_mi: true, tipo: 'chat', texto: 'hola equipo' }]) === null, 'un saludo sin nombre no da nombre');
    // Sin saludo nuestro en los 10 días que se leen: la agenda, si casa con la ficha.
    const ruimor = [{ tipo: 'partner', nombre: 'RUIMOR', persona: 'FRANCISCO SANTOS' }];
    ok(C.nombreDeAgenda('INSTALADOR FRAN RUIMOR (villarrobledo)', ruimor) === 'Fran', 'agenda «INSTALADOR FRAN RUIMOR» + ficha «FRANCISCO SANTOS» → Fran');
    ok(C.nombreDeAgenda('RES060_OP246 Irene Lopez (Gonzagarri)', [{ tipo: 'cliente', via: 'titular', nombre: 'IRENE LÓPEZ GARCÍA' }]) === 'Irene', 'la clienta de la agenda con su nº de obra → Irene');
    ok(C.nombreDeAgenda('Instalaciones Plaza', ruimor) === null, 'si la agenda no casa con la ficha, nada (mejor sin nombre que con uno equivocado)');
    ok(C.nombreDeAgenda('Luis obra Fran', [{ tipo: 'cliente', via: 'contacto', nombre: 'FRANCISCA RUIZ' }]) === null, 'el nombre de una ficha donde es solo contacto no vale');

    // ¿Es de verdad una petición nueva? Lo que dice el cerebro, respaldado por lo que ha llegado.
    const pn = C.peticionNueva({ filas });
    ok(pn && pn.n === 2 && pn.tipos.join() === 'CAPTURA_CATASTRO,PRESUPUESTO', 'dos adjuntos de obra NUEVA: petición nueva');
    ok(C.peticionNueva({ filas: [{ obra: '26RES060_216', tipo: 'FOTO_PLACA' }] }) === null, 'lo de una obra que ya está: no');
    ok(C.peticionNueva({ filas: [{ obra: '—', tipo: 'NO_RELACIONADO' }] }) === null, 'un meme: no');
    ok(C.peticionNueva({ filas: [], analisis: { obra_de_la_conversacion: 'NUEVA' } })?.n === 0, 'solo texto («tengo un cliente en Tomelloso…»), si la conversación es de una obra nueva: sí');
    ok(C.peticionNueva({ filas: [{ obra: '', tipo: 'FOTO_PLACA' }] })?.n === 1, 'una placa sin obra asignada: puede ser nueva');
    ok(C.peticionNueva({ filas: [{ obra: '', tipo: 'FACTURA' }] }) === null && C.peticionNueva({ filas: [{ obra: '', tipo: 'FACTURA' }] }, { sinObra: true })?.n === 1, 'una factura sin obra: solo si no tiene obra con nosotros');

    // El ENCARGO del alta: del código, con datos de la BD; nada de lo que ha escrito él.
    const t = C.textoAlta({ tel9: '620099417', quien: 'RUIMOR', rol: 'instalador', desde: C.desdeMadrid(Date.parse('2026-11-20T07:15:50Z') / 1000), n: 2, tipos: pn.tipos, contestado: true });
    ok(t.includes('alta_oportunidad.js chat 620099417 --desde "2026-11-20 08:15"'), 'la orden de la skill, con su «--desde» en hora de Madrid');
    ok(t.includes('2 adjuntos (captura del Catastro, presupuesto)') && t.includes('RUIMOR (instalador)'), 'qué ha mandado y quién, en vocabulario fijo');
    ok(t.includes('avisar <OP> --a partner --enviar') && /NO se envía sin su «sí»/.test(t) && /a él NO le escribas/.test(t), 'al terminar, el aviso de siempre a Fran; la propuesta, solo con su «sí»; al instalador, nada');
    ok(C.textoAlta({ tel9: '600000000', quien: 'Ana', rol: 'cliente', desde: 'x', n: 0, tipos: [] }).includes('--a cliente'), 'si el chat es del propio cliente, --a cliente');
    const fr = C.textoParaFran({ id: 696 }, { accion: 'RESPONDER', titulo: 'RUIMOR', texto: 'Buenos días, Fran. Lo vamos a revisar y te pasamos la propuesta.', alta: { n: 2 }, pendientes: ['20/11 08:15  [foto]'] }, { m: 'copia' });
    ok(fr.includes('*Alta:* es una petición nueva; en real la daría de alta yo solo'), 'en copia, Fran ve que se daría de alta sola');
    const fr2 = C.textoParaFran({ id: 696 }, { accion: 'RESPONDER', titulo: 'RUIMOR', texto: 'x', alta: { n: 2 }, altaLinea: '*Alta:* no la he podido encargar (tope): dásela tú de alta.' }, { m: 'real', enviado: true });
    ok(fr2.includes('no la he podido encargar (tope)'), 'si no se pudo encargar, se le dice a Fran');
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
        { key: 'DOC_CEE_EXISTENTE', label: 'CEE existente', labelCliente: 'El certificado energético de tu casa (opcional)', multiple: true },
        { key: 'DOC_PRESUPUESTO', label: 'Presupuesto', labelCliente: 'El presupuesto del instalador', multiple: true },
    ];
    try {
        const obra = { tipo: 'expediente', codigo: '26RES060_901', oportunidad_id: 'op-1', expediente_id: 'ex-1', instalador_ids: [] };
        const fich = (s, mt = 'application/pdf') => ({ buffer: Buffer.from(s), mimetype: mt, nombre: `${s}.${mt.includes('pdf') ? 'pdf' : 'jpg'}` });
        const adj = [
            ['m1', fich('fact-1')], ['m2', fich('fact-1')], ['m3', fich('fact-2')], ['m4', fich('dni', 'image/jpeg')],
            ['m5', fich('ue', 'image/jpeg')], ['m6', fich('ue-2', 'image/jpeg')], ['m7', fich('raro', 'image/jpeg')],
            ['m8', fich('rite')], ['m9', fich('nueva')], ['m10', fich('caldera', 'image/jpeg')], ['m11', null],
            ['m13', fich('cee')], ['m14', fich('presu', 'image/jpeg')], ['m15', fich('justif')], ['m16', fich('rite-foto', 'image/jpeg')],
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
                fila('m13', 'CEE'), fila('m14', 'PRESUPUESTO'), fila('m15', 'JUSTIFICANTE_TITULARIDAD'),
            ],
        });
        Docs._pruebas.comprobarPdf = async () => ({ ok: true, coincide: 'rc' });   // «el PDF trae la RC de esta obra»
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
        ok(de('m13').guardar && de('m13').slot === 'DOC_CEE_EXISTENTE', 'el CEE que ya tenía la casa: a su apartado (de varios, no pisa nada)');
        ok(de('m14').guardar && de('m14').slot === 'DOC_PRESUPUESTO' && de('m14').destino === 'El presupuesto del instalador', 'un presupuesto: a su apartado');
        ok(!de('m15').guardar && /no sé de qué cliente es/.test(de('m15').motivo), 'el justificante sin cliente conocido: no se guarda');
        ok(ficheros.size === 5 && ['m1', 'm5', 'm8', 'm13', 'm14'].every(k => ficheros.has(k)), 'se quedan los ficheros de lo que se guarda');
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
        // Un PDF que no trae ni el nº ni la RC de la obra (la subida por enlace lo dejaría pasar): solo, no.
        Docs._pruebas.comprobarPdf = async () => ({ ok: true, coincide: null, aviso: 'el PDF no tiene texto (¿escaneado?)' });
        const r2d = (await Docs.planear({ c: plan(), adjuntos: adj })).items.find(x => x.msg === 'm8');
        ok(!r2d.guardar && /no he podido comprobar que el RITE sea de esta obra/.test(r2d.motivo), 'un RITE sin el nº ni la RC de la obra: no se guarda solo');
        // Y una FOTO del RITE tampoco (no se puede comprobar).
        Docs._pruebas.comprobarPdf = async () => ({ ok: true, coincide: 'rc' });
        const planFoto = plan(); planFoto.filas.push(fila('m16', 'CERTIFICADO_RITE'));
        const r2e = (await Docs.planear({ c: planFoto, adjuntos: adj })).items.find(x => x.msg === 'm16');
        ok(!r2e.guardar && /solo guardo solo el PDF/.test(r2e.motivo), 'una foto del RITE: no se guarda sola');
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
    // ── Lo que el código remata con lo que sabe del chat (22/11/2026, C792–C803) ──
    {
        console.log('\nSin saludo repetido, sin «no falta nada» por comprobar, sin «los reviso yo»');
        // El saludo: fuera si ya le hemos escrito hace un rato (cuatro «Buenos días, María» en dos horas).
        ok(cerebro.sinSaludoInicial('Buenos días, María. Sí, eran esas: ya están en el expediente.') === 'Sí, eran esas: ya están en el expediente.'
            && cerebro.sinSaludoInicial('Buenas tardes, Juanma.\n\nPerfecto, ya me ha llegado el CIFO.') === 'Perfecto, ya me ha llegado el CIFO.'
            && cerebro.sinSaludoInicial('Hola Miguel Angel, sí, el certificado ya lo tenemos.') === 'Sí, el certificado ya lo tenemos.',
            'el saludo del principio se quita, con su nombre, y lo que sigue empieza en mayúscula');
        ok(cerebro.sinSaludoInicial('Perfecto, Tomás, vas por buen camino.') === 'Perfecto, Tomás, vas por buen camino.'
            && cerebro.sinSaludoInicial('Buenos días.') === 'Buenos días.' && cerebro.sinSaludoInicial('Buenas noticias: ya está registrado el certificado.').startsWith('Buenas noticias'),
            'lo que no es un saludo no se toca, y un saludo a secas no se deja vacío');
        const ahoraSeg = 1_800_000_000;
        ok(C.yaLeEscribimos([{ de_mi: true, t: ahoraSeg - 3600 }, { de_mi: false, t: ahoraSeg - 60 }], { ahoraSeg, horas: 4 })
            && !C.yaLeEscribimos([{ de_mi: true, t: ahoraSeg - 6 * 3600 }, { de_mi: false, t: ahoraSeg - 60 }], { ahoraSeg, horas: 4 })
            && !C.yaLeEscribimos([{ de_mi: false, t: ahoraSeg - 60 }], { ahoraSeg, horas: 4 }),
            'ya le hemos escrito = un mensaje NUESTRO en las últimas 4 h; lo suyo o lo de ayer no cuenta');
        // «No falta nada»: solo si es verdad.
        const cifo = 'Perfecto, ya me ha llegado el CIFO de lo de Francis, en Munera. Por tu parte no falta nada más: ahora seguimos nosotros con el certificado energético final.';
        ok(cerebro.sinNoFaltaNada(cifo) === 'Perfecto, ya me ha llegado el CIFO de lo de Francis, en Munera.', '«por tu parte no falta nada más…»: se quita la frase entera');
        ok(cerebro.sinNoFaltaNada('Recibidas las fotos.\n\nPor tu parte, con esto, no falta nada más de la obra.') === 'Recibidas las fotos.'
            && cerebro.sinNoFaltaNada('Ahora falta la foto de la caldera.') === 'Ahora falta la foto de la caldera.' && cerebro.sinNoFaltaNada('Ya no falta nada.') === 'Ya no falta nada.',
            'lo que le falta no se toca, y una respuesta no se deja vacía');
        ok(cerebro.quedaAlgoPorMirar({ lineas: ['[documento] CIFO firmado.pdf — NO se ha podido ver qué es: no le preguntes…'] }, '')
            && cerebro.quedaAlgoPorMirar({ lineas: ['DNI — sin guardar (lo mira Fran: no se guarda solo)'] }, '')
            && cerebro.quedaAlgoPorMirar({ lineas: [] }, '26RES060_238: decidir si hace falta algo más')
            && !cerebro.quedaAlgoPorMirar({ lineas: ['foto de la caldera — YA GUARDADO en el expediente'] }, '')
            && !cerebro.quedaAlgoPorMirar({ lineas: [] }, 'pide que le llames'),
            'queda algo por mirar: lo no leído, lo sin guardar o un aviso que deja algo por decidir');
        const base = { accion: 'RESPONDER', mensaje: `Buenas tardes, Juanma.\n\n${cifo}`, aviso: '' };
        const a1 = cerebro.ajustarRespuesta(base, { lineas: ['[documento] x.pdf — NO se ha podido ver qué es'] }, { sinSaludo: true });
        ok(a1.mensaje === 'Perfecto, ya me ha llegado el CIFO de lo de Francis, en Munera.' && a1.ajustes.join() === 'saludo,no_falta_nada', 'C803: sin saludo y sin afirmar que está todo');
        const a2 = cerebro.ajustarRespuesta(base, { lineas: ['CIFO firmado — YA GUARDADO en el expediente'] }, {});
        ok(a2 === base, 'con todo guardado, sin aviso y sin habernos escrito antes, la respuesta sale como estaba');
        ok(cerebro.ajustarRespuesta({ accion: 'ESCALAR', mensaje: '', acuse: 'Buenos días, Ana. Lo de la factura lo miro.' }, { lineas: [] }, { sinSaludo: true }).acuse.startsWith('Buenos días'), 'solo se ajusta una RESPUESTA');
        // «Los reviso yo» (C792): así no habla Fran de su trabajo.
        ok(cerebro.rematar({ accion: 'RESPONDER', parrafos: ['Los catálogos también los tengo. Los reviso yo.'] }, ENLACES).mensaje === 'Los catálogos también los tengo. Los reviso.'
            && cerebro.sinYo('Lo miro yo mismo a mano y te digo.') === 'Lo miro y te digo.' && cerebro.sinYo('La caldera se quita a mano, con cuidado.') === 'La caldera se quita a mano, con cuidado.'
            && cerebro.sinYo('La memoria la preparo yo y te la paso.') === 'La memoria la preparo yo y te la paso.',
            '«los reviso yo», «lo miro yo mismo a mano»: se queda el verbo; «a mano» de la obra y «la preparo yo» no se tocan');
        const chS = { texto: 'ELLOS: ahí van las fotos', rol: 'cliente', personas: [], obras: [] };
        const conS = cerebro.construirPrompt(chS, null, null, { lineas: [], slots: new Set() }, { sinSaludo: true }).prompt;
        const sinS = cerebro.construirPrompt(chS, null, null, { lineas: [], slots: new Set() }, {}).prompt;
        ok(conS.includes('YA LE HEMOS ESCRITO HACE UN RATO') && !sinS.includes('YA LE HEMOS ESCRITO HACE UN RATO'), 'el prompt lo dice solo cuando ya le hemos escrito');
        ok(sinS.includes('«Por tu parte no falta nada» SOLO si es verdad') && sinS.includes('pídelas TODAS en el mismo mensaje') && sinS.includes('Sin coletillas') && sinS.includes('por si no está entre las que has mandado'),
            'el prompt: «no falta nada» solo si es verdad, las fotos de una vez, sin coletillas y sin pedir «por si no está»');
        ok(sinS.includes('LO QUE FRAN YA HA CORREGIDO') && sinS.includes('esperando a que los auditores') && sinS.includes('la casa COMO ESTÁ')
            && sinS.includes('SOLO si el dossier dice que el certificado inicial está REGISTRADO'),
            'el prompt lleva la voz de Fran: la FM sin afirmar, el CEE inicial es la casa de antes, «ya podéis empezar» solo registrado');
        // «…, lo estoy revisando» dentro de una respuesta (barrido 22/11: tres de doce).
        ok(cerebro.sinLoReviso('Tengo el justificante de la cuenta, lo estoy revisando.') === 'Tengo el justificante de la cuenta.'
            && cerebro.sinLoReviso('La ficha de terceros es lo que necesitábamos del banco; lo reviso y te confirmo. También tengo la foto.') === 'La ficha de terceros es lo que necesitábamos del banco. También tengo la foto.'
            && cerebro.sinLoReviso('El justificante lo estoy revisando.') === 'El justificante lo estoy revisando.'
            && cerebro.sinLoReviso('Lo reviso, lo miro.') === 'Lo reviso, lo miro.',
            '«, lo estoy revisando» / «; lo reviso y te confirmo» fuera; sin coma no se toca, y no se deja casi vacío');
        ok(cerebro.rematar({ accion: 'RESPONDER', parrafos: ['Tengo el justificante de la cuenta, lo estoy revisando.'] }, ENLACES).mensaje === 'Tengo el justificante de la cuenta.', 'rematar lo aplica a la respuesta');
        // Lo que dice que NO LLEVA no se le vuelve a pedir (26RES093_15: «no tiene deposito abajo por ser planta baja»).
        const chatJ = '[20/11 10:00] NOSOTROS: Nos faltan las fotos del depósito.\n[22/11 11:43] ELLOS: [ADJUNTO #1 · foto] Buenos dias mi instalación no tiene deposito abajo por ser planta baja me dijeron que no la necesito';
        ok(cerebro.loQueNoLleva(chatJ).join() === 'depósito', '«no tiene deposito»: no lleva depósito');
        ok(!cerebro.loQueNoLleva('[22/11 11:43] ELLOS: aún no tengo el depósito, lo ponen el lunes').length
            && !cerebro.loQueNoLleva('[22/11 11:43] ELLOS: no tengo el depósito puesto todavía').length
            && !cerebro.loQueNoLleva('[22/11 11:43] NOSOTROS: si no tiene depósito, no pasa nada').length
            && !cerebro.loQueNoLleva('[22/11 11:43] ELLOS: no tengo la foto, el depósito está detrás').length,
            '«aún no tengo el depósito», «no tengo el depósito puesto», lo que decimos NOSOTROS o «no tengo la foto»: no cuentan');
        const pend = [{ clave: 'foto_deposito', que: 'foto del depósito nuevo junto a tu caldera de siempre' }, { clave: 'foto_conexion', que: 'foto de tu caldera y la máquina nueva, conectadas' }];
        const q = cerebro.sinLoQueNoLleva(pend, chatJ);
        ok(q.pendientes.map(p => p.clave).join() === 'foto_conexion' && q.quitados[0].cosa === 'depósito', 'se quita del dossier la foto del depósito; la de la conexión se sigue pidiendo');
        const aJ = cerebro.ajustarRespuesta({ accion: 'RESPONDER', mensaje: 'Recibidas las fotos. Lo del depósito, apuntado.', aviso: '' }, { lineas: [] }, { noLleva: q.quitados });
        ok(/no lleva depósito/.test(aJ.aviso) && aJ.ajustes.includes('no_lleva'), 'y a Fran se le dice en el aviso, para que confirme');
        const pJ = cerebro.construirPrompt({ texto: chatJ, rol: 'cliente', personas: [], obras: [] }, null, { pendientes: pend.slice() }, { lineas: [], slots: new Set() }, {}).prompt;
        ok(pJ.includes('NO LLEVA depósito'), 'el prompt le dice que no lo pida');
        const IAr = require('../services/rondaWhatsappIA');
        const tr = IAr.transcripcion([{ id: 'f1', de_mi: false, tipo: 'image', t: 1_800_000_000, texto: 'mi instalación no tiene deposito abajo', _colocada: { slot: 'FOTO_UNIDAD_INTERIOR' } },
            { id: 'v1', de_mi: false, tipo: 'video', t: 1_800_000_010, texto: 'así va la obra', _video: true }], new Map(), []);
        ok(tr.includes('FOTO_UNIDAD_INTERIOR] mi instalación no tiene deposito abajo') && tr.includes('[VÍDEO] así va la obra')
            && cerebro.loQueNoLleva(tr).join() === 'depósito',
            'el pie de una foto ya colocada o de un vídeo llega a la conversación (antes se perdía)');
        // Un PDF grande se lee por sus primeras páginas (C803: el CIFO firmado no se leía); lo guardado, entero.
        const { PDFDocument } = require('pdf-lib');
        const doc = await PDFDocument.create();
        for (let i = 0; i < 6; i++) doc.addPage([595, 842]).drawText(`pagina ${i + 1} ${'x'.repeat(2000)}`, { size: 4, x: 10, y: 400 });
        const grande = Buffer.from(await doc.save());
        const una = Buffer.from(await (async () => { const d = await PDFDocument.create(); d.addPage([595, 842]).drawText(`pagina 1 ${'x'.repeat(2000)}`, { size: 4, x: 10, y: 400 }); return d.save(); })());
        const adjP = [{ id: 'p1', t: 1_800_000_000, _fichero: { buffer: grande, mimetype: 'application/pdf' } }];
        const { partes: pp } = await IAr.prepararPartes(adjP, { maxPdfBytes: Math.floor(grande.length * 0.7) });
        const pdfVisto = await PDFDocument.load(pp[1].buffer);
        ok(pp.length === 2 && pdfVisto.getPageCount() === 3 && /solo sus 3 primeras páginas de 6/.test(pp[0].texto) && adjP[0]._fichero.buffer === grande && !adjP[0]._error,
            'un PDF grande: el modelo ve sus 3 primeras páginas y lo dice; el fichero que se guarda sigue entero');
        const adjQ = [{ id: 'p2', t: 1_800_000_000, _fichero: { buffer: grande, mimetype: 'application/pdf' } }];
        await IAr.prepararPartes(adjQ, { maxPdfBytes: Math.floor(una.length * 0.5) });
        ok(/demasiado grande/.test(adjQ[0]._error || ''), 'si ni la primera página cabe, se queda sin leer como antes');
    }
    // ── La MEMORIA del chat (wa_memoria, 22/11/2026) ──
    {
        console.log('\nLa memoria del chat');
        const M = require('../utils/memoriaWhatsapp');
        ok(M.limpiarHecho('Escribe Paqui,\nno Carolina: llamarla Paqui.') === 'Escribe Paqui, no Carolina: llamarla Paqui.', 'un hecho: una línea');
        const s1 = M.limpiarHecho('Su cuenta ES91 2100 0418 4502 0005 1332, DNI 12345678Z, tlf 629 123 456, mail a@b.es, https://x.y/z');
        ok(!/2100|12345678|629|a@b|https/.test(s1), 'sin IBAN, DNI, teléfono, correo ni enlace');
        ok(M.limpiarHecho('ES91 2100 0418 4502 0005 1332') === '' && M.limpiarHecho('ok') === '', 'lo que se queda en nada no se apunta');
        ok(M.limpiarHecho('x'.repeat(400)).length <= M.MAX_CHARS, 'como mucho 200 caracteres');
        const ahora = new Date('2026-11-22T12:00:00Z');
        const r1 = M.fusionar([{ f: '2026-06-01', t: 'muy viejo', o: null, p: 'contestador' }, { f: '2026-11-20', t: 'No lleva depósito: planta baja.', o: '26RES093_15', p: 'contestador' }],
            ['No lleva deposito, planta baja', 'Manda el justificante el lunes.'], { ahora, obra: '26RES093_15' });
        ok(r1.hechos.length === 2 && r1.anadidos === 1 && r1.caducados === 1 && r1.hechos[0].t === 'No lleva depósito: planta baja.' && r1.hechos[1].t === 'Manda el justificante el lunes.',
            'lo ya apuntado no se repite (ni se reescribe), lo de más de 120 días se cae y lo nuevo va al final');
        ok(M.ordenNota('nota C812: es Paqui') && require('../utils/ordenContestador').ordenContestador('nota C812: es Paqui') === null,
            '«nota C812: …» no es un «C812» para mandar');
        const muchos = Array.from({ length: 20 }, (_, i) => `hecho número ${i + 1} de la obra`);
        const r2 = M.fusionar([], muchos, { ahora });
        ok(r2.hechos.length === M.MAX_HECHOS && r2.hechos[r2.hechos.length - 1].t === 'hecho número 20 de la obra', 'como mucho 15 hechos: se quitan los más viejos');
        ok(M.fusionar([], ['x'], { ahora }).anadidos === 0, 'si no hay nada que apuntar, no se escribe');
        ok(M.fusionar([], ['Hablado por teléfono'], { ahora, por: 'fran' }).hechos[0].p === 'fran', 'lo de Fran va marcado como suyo');
        const pp = M.paraPrompt([{ f: '2026-11-22', t: 'Hablado por teléfono.', o: '26RES060_281', p: 'fran' }, { f: '2026-11-20', t: 'Escribe Paqui.', o: null, p: 'contestador' }]);
        ok(pp === '- 22/11 (Fran) · 26RES060_281: Hablado por teléfono.\n- 20/11: Escribe Paqui.' && M.paraPrompt([]) === '', 'así la lee el modelo');
        ok(JSON.stringify(M.ordenNota('nota 26RES060_281: hablado por teléfono, ya lo tiene claro')) === JSON.stringify({ destino: { tipo: 'obra', valor: '26RES060_281' }, texto: 'hablado por teléfono, ya lo tiene claro' })
            && M.ordenNota('Nota C812: es Paqui quien escribe').destino.tipo === 'turno' && M.ordenNota('nota C812: es Paqui').destino.valor === '812'
            && M.ordenNota('apunta 629 123 456: lo hablamos el lunes').destino.valor === '629123456'
            && M.ordenNota('nota 26res060_op390 - espera a los auditores').destino.valor === '26RES060_OP390'
            && M.ordenNota('nota de la 2026CEE_64: pagado en mano').destino.valor === '2026CEE_64',
            '«nota 26RES060_281: …», «nota C812: …», «apunta 6xx…: …» y el nº de oportunidad o de CEE');
        ok(M.ordenNota('notas del día') === null && M.ordenNota('nota: sin destino') === null && M.ordenNota('C12') === null && M.ordenNota('recuerda que mañana hay que llamar') === null,
            'lo que no dice a qué chat va no es una nota');
        // El cerebro: la memoria en el prompt y lo que pide recordar, limpio.
        const chM = { texto: '[22/11 10:00] ELLOS: hola', rol: 'cliente', personas: [], obras: [] };
        const conM = cerebro.construirPrompt(chM, null, null, { lineas: [], slots: new Set() }, { memoria: [{ f: '2026-11-22', t: 'Hablado por teléfono.', o: null, p: 'fran' }] }).prompt;
        const sinM = cerebro.construirPrompt(chM, null, null, { lineas: [], slots: new Set() }, {}).prompt;
        ok(conM.includes('# LO QUE RECORDAMOS DE ESTE CHAT') && conM.includes('(Fran): Hablado por teléfono.') && !sinM.includes('# LO QUE RECORDAMOS DE ESTE CHAT')
            && sinM.includes('"recordar": []'), 'el prompt lleva la memoria solo si la hay, y pide «recordar»');
        const rr = cerebro.rematar({ accion: 'RESPONDER', parrafos: ['Perfecto.'], recordar: ['Escribe Paqui, no Carolina.', 'su IBAN es ES91 2100 0418 4502 0005 1332', 'tres', 'cuatro cosas más que apuntar'] }, ENLACES);
        ok(rr.recordar.length === 2 && rr.recordar[0] === 'Escribe Paqui, no Carolina.' && !/2100/.test(rr.recordar.join()), 'como mucho 2 por respuesta y sin datos personales');
        ok(cerebro.rematar({ accion: 'CALLAR' }, ENLACES).recordar.length === 0, 'sin «recordar», nada');
    }
    // ── El LISTADO para repasar las respuestas (21/11/2026) ──
    {
        console.log('\nEl listado para repasar las respuestas');
        const L = require('../utils/listadoContestador');
        const t = L.tramo({ desde: '2026-11-18', hasta: '2026-11-21' });
        ok(t.desde.toISOString() === '2026-11-17T23:00:00.000Z' && t.hasta.toISOString() === '2026-11-21T23:00:00.000Z', 'el tramo son días de MADRID, los dos incluidos (invierno, +1)');
        ok(L.inicioDiaMadrid('2026-07-01').toISOString() === '2026-06-30T22:00:00.000Z' && L.inicioDiaMadrid('ayer') === null, 'en verano, +2; una fecha mal escrita no vale');
        const ahora = new Date('2026-11-21T12:00:00Z');
        ok(L.tramo({}, ahora).desde.toISOString() === '2026-11-14T12:00:00.000Z' && L.tramo({ dias: 9999 }, ahora).desde.toISOString() === '2026-08-23T12:00:00.000Z',
            'sin fechas, los últimos 7 días; como mucho 90');
        const T = '2026-11-20T12:00:00.000Z';
        const filas = L.filasListado([
            { id: 5, chat_id: 'b', estado: 'HECHA', accion: 'CALLAR', motivo: 'solo es cortesía', ultimo_at: T, pendientes: ['20/11, 13:21  Ok'] },
            { id: 1, chat_id: 'a', estado: 'HECHA', accion: 'RESPONDER', texto: 'Recibidas, perfecto.', enviado_at: '2026-11-20T12:16:00.000Z', ultimo_at: T, cerebro: 'claude (sonnet, 8.2 s, 12000 tokens)', pendientes: ['20/11, 13:00  Ahí van'] },
            { id: 2, chat_id: 'b', estado: 'HECHA', accion: 'ESCALAR', acuse: 'Lo de la factura lo confirmo y te digo.', enviado_at: T, ultimo_at: T, borrador: 'Va a nombre del titular.', por: 'precio',
                cerebro: 'investigador claude (sonnet, 16.4 s, 6 pasos) tras claude (sonnet, 5 s)', fuentes: ['expediente 26RES060_224'], pendientes: ['20/11, 13:00  ¿A qué nombre?'], titulo: 'Cristina' },
            { id: 3, chat_id: 'c', estado: 'HECHA', accion: 'ESCALAR', motivo: 'tope del día (40) alcanzado (iba a decirle: «Hola»)', ultimo_at: T },
            { id: 4, chat_id: 'd', estado: 'HECHA', accion: 'RESPONDER', texto: 'Sí, vale.', enviado_at: T, ultimo_at: T, enviado_sin_fran: 'true', aviso: 'te lo iba a pasar por: x', cerebro: 'investigador claude (sonnet, 30 s, 5 pasos) tras claude' },
            { id: 6, chat_id: 'e', estado: 'DESCARTADA', motivo: 'ya le hemos contestado', ultimo_at: T },
            { id: 7, chat_id: 'f', estado: 'HECHA', accion: 'RESPONDER', texto: 'En copia.', modo: 'copia', ultimo_at: T },
        ]);
        const de = (n) => filas.find(f => f.n === n);
        ok(filas.map(f => f.n).join() === 'C1,C2,C3,C4,C5,C6,C7', 'salen por orden, lo más antiguo primero');
        ok(de('C1').resultado === 'Contestado' && de('C1').le_dijimos === 'Recibidas, perfecto.' && de('C1').minutos === 16 && de('C1').como === 'directo (8 s)', 'contestado: lo que se le dijo, cuánto tardó y cómo se decidió');
        ok(de('C2').resultado === 'A Fran, con acuse al cliente' && de('C2').le_dijimos.startsWith('Lo de la factura') && de('C2').sin_enviar === 'Va a nombre del titular.'
            && de('C2').motivo_fran === 'Precio, descuento o excepción' && de('C2').como === 'revisando: 6 pasos, 16 s' && de('C2').miro === 'expediente 26RES060_224',
            'escalado: el acuse que le llegó, el borrador que NO le llegó, por qué se quedó en Fran y qué se miró');
        ok(de('C2').despues === '20/11, 13:21  Ok' && de('C1').despues === '', 'lo que escribió DESPUÉS sale del turno siguiente del mismo chat');
        ok(de('C3').resultado === 'No salió por un tope' && de('C4').resultado === 'Contestado con lo que antes iba a Fran' && de('C4').para_fran.startsWith('te lo iba'),
            'lo parado por un tope y lo contestado con el borrador se distinguen');
        ok(de('C5').resultado.startsWith('Callado') && de('C6').resultado.startsWith('Descartado') && de('C7').resultado === 'Solo copia a Fran' && de('C7').sin_enviar === 'En copia.' && de('C7').le_dijimos === '',
            'callado, descartado y modo copia: a nadie se le dijo nada');
        const r = L.resumenListado(filas);
        ok(r.total === 7 && r.pedian_respuesta === 5 && r.contestadas === 2 && r.resultados.reduce((s, x) => s + x.n, 0) === 7 && r.motivos_fran[0].n === 1,
            'el resumen se cuenta sobre las propias filas, y sus partes suman el total');
        const buf = await L.aExcel(filas, t);
        const wb = new (require('exceljs').Workbook)();
        await wb.xlsx.load(buf);
        const hoja = wb.getWorksheet('Respuestas');
        ok(hoja.rowCount === 8 && hoja.getRow(1).values.includes('QUÉ HABRÍA DICHO YO') && !!wb.getWorksheet('Resumen'), 'el Excel: una fila por turno, las columnas para valorar y la hoja de resumen');
    }
    // ── Que no parezca un robot (24/11/2026): frases vacías, lo ya dicho y el silencio ──
    {
        console.log('\nQue no parezca un robot (24/11/2026)');
        const fv = cerebro.sinFrasesVacias;
        ok(fv('Perfecto, Lucía. Lo de la máquina de dentro, apuntado. Mándame la foto de la placa.') === 'Perfecto, Lucía. Mándame la foto de la placa.', '«Lo de X, apuntado.» fuera (C1025)');
        ok(fv('Gracias. Lo de los patios lo miro con el vídeo y, si hiciera falta alguna foto más, te lo digo.') === 'Gracias.', '«lo miro… y si hiciera falta algo, te lo digo» fuera (C995)');
        ok(fv('Lo compruebo para que no cause problemas al tramitar. Gracias.') === 'Gracias.', '«lo compruebo para que no…» fuera (C979)');
        ok(fv('Recibido, gracias. Lo vamos a revisar y te pasamos la propuesta.') === 'Recibido, gracias. Lo vamos a revisar y te pasamos la propuesta.', '«lo vamos a revisar y te pasamos la propuesta» se queda: dice qué viene');
        ok(fv('Lo reviso y te digo.') === 'Lo reviso y te digo.', 'si no queda nada, se deja como estaba');
        ok(fv('La caldera se quita y la miramos el lunes.') === 'La caldera se quita y la miramos el lunes.', 'una frase de la obra con «la miramos» no se toca');

        const dichos = ['Buenos días, Lucía. Te faltan *la foto de la placa de la caldera* y *la foto del depósito*. Súbelas aquí: https://app.brokergy.es/subir/abc'];
        const msg = 'Gracias, Lucía.\n\nTe faltan:\n*La foto de la placa de la caldera*\n*La foto del depósito*\n\nSúbelas aquí: https://app.brokergy.es/subir/abc';
        const d1 = cerebro.sinLoYaDicho(msg, dichos);
        ok(d1.quitados === 2 && d1.mensaje === 'Gracias, Lucía.' && !d1.vacio, 'la lista y el enlace que ya le dimos hace un rato no se repiten');
        const d2 = cerebro.sinLoYaDicho(msg, dichos, { pregunta: true });
        ok(d2.quitados === 0 && d2.mensaje === msg, 'si pregunta qué falta o dónde mandarlo, la lista se repite');
        const d3 = cerebro.sinLoYaDicho('Te falta *la foto del contador*.', dichos);
        ok(d3.quitados === 0, 'lo NUEVO que falta sí se dice');
        ok(cerebro.preguntaPorLoPendiente(['¿Qué me falta?']) && cerebro.preguntaPorLoPendiente(['Dónde las mando']) && !cerebro.preguntaPorLoPendiente(['Ya está puesta la máquina']), 'pregunta por lo pendiente: qué falta / dónde mando');

        const r = { accion: 'RESPONDER', mensaje: 'Buenas.\n\nTe faltan *la foto de la placa de la caldera* y *la foto del depósito*.', motivo: 'pide fotos' };
        const callar = cerebro.ajustarRespuesta(r, null, { dichos, suyos: ['Vale, luego las hago'] });
        ok(callar.accion === 'CALLAR' && callar.mensaje === '' && callar.ajustes.includes('ya_dicho'), 'si TODO lo que iba a decir ya se lo dijimos: CALLAR');
        const repite = cerebro.ajustarRespuesta(r, null, { dichos, suyos: ['¿Qué me falta?'] });
        ok(repite.accion === 'RESPONDER' && repite.mensaje.includes('depósito'), 'si lo pregunta, se le contesta con la lista');

        const ahora = 1_800_000_000;
        const ms = [{ de_mi: true, t: ahora - 20 * 60, texto: 'Te falta la placa' }, { de_mi: false, t: ahora - 60, texto: 'ok' }, { de_mi: true, t: ahora - 8 * 3600, texto: 'viejo' }];
        ok(C.loQueLeDijimos(ms, { ahoraSeg: ahora }).join() === 'Te falta la placa', 'lo que le dijimos: lo nuestro de las últimas horas');
        ok(cerebro.sinNoFaltaNada('Recibido lo del RITE, gracias.\n\nPor tu parte no queda nada pendiente ahora mismo: los anexos ya están.') === 'Recibido lo del RITE, gracias.', '«no queda nada pendiente» también es un «no falta nada»');
        // FM sin ACS (24/11/2026): cuánto más con un aerotermo o un acumulador.
        const v5 = cerebro.fmSinAcs({ sin_acs_eur: 4592, con_acs_eur: 9232, acs_mas_eur: 4640, acs_veces: 2.01 });
        const v4 = cerebro.fmSinAcs({ acs: 'supuesto', elegible: true, eur_vigente: 4592.4, eur_fm: 9232 });
        ok(v5.mas === 4640 && v5.veces === 2.01 && v4.sin === 4592.4 && Math.round(v4.mas) === 4640 && v4.veces === 2.01, 'FM sin ACS: v5 por sus campos, v4 con la misma cuenta');
        ok(cerebro.fmSinAcs({ acs: 'incluido', elegible: true, eur_vigente: 4000, eur_fm: 9000 }) === null
            && cerebro.fmSinAcs({ acs: 'supuesto', elegible: false, eur_vigente: 4000, eur_fm: 9000 }) === null
            && cerebro.fmSinAcs({ acs: 'supuesto', elegible: true, aplica: false, eur_vigente: 4000, eur_fm: 9000 }) === null
            && cerebro.fmSinAcs({ acs: 'supuesto', elegible: true, eur_vigente: 9000, eur_fm: 4000 }) === null && cerebro.fmSinAcs(null) === null,
            'FM sin ACS: nada si ya lleva ACS, no es elegible, no aplica o la FM no sale más');
        const bl = cerebro.bloqueFmSinAcs(v5);
        ok(bl.includes('Tal como viene, sin ACS: 4.592 €') && bl.includes('unos 9.232 € (4.640 € más, más del doble)') && !/MWh/.test(bl.split('\n- ')[0]), 'FM sin ACS: la frase de la propuesta, con miles y «más del doble»');
        ok(!cerebro.bloqueFmSinAcs({ sin: 4000, con: 6000, mas: 2000, veces: 1.5 }).includes('más del doble'), 'por debajo del doble no dice «más del doble»');
        const pInst = cerebro.construirPrompt({ rol: 'instalador', titulo: 'X' }, null, null, null, { fmSinAcs: v5 }).prompt;
        const pCli = cerebro.construirPrompt({ rol: 'cliente', titulo: 'X' }, null, null, null, { fmSinAcs: v5 }).prompt;
        ok(pInst.includes('EL PRESUPUESTO SIN ACS') && !pCli.includes('EL PRESUPUESTO SIN ACS'), 'el bloque solo va en el chat de un instalador');
        ok(C.silencioPara(ms, ahora) === 30 && C.silencioPara([{ de_mi: true, t: ahora - 3 * 3600 }], ahora) === 15, 'conversación viva (le escribimos hace < 60 min): 30 min de silencio; si no, 15');
    }
    console.log(fallos ? `\n✗ ${fallos} fallo(s)` : '\n✓ todo bien');
    process.exit(fallos ? 1 : 0);
})();
