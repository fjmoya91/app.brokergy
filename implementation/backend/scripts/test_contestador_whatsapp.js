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
