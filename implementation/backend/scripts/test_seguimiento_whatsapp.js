// node scripts/test_seguimiento_whatsapp.js — el SEGUIMIENTO de las propuestas y del material
// del CEE inicial (services/seguimientoWhatsapp.js, utils/seguimientoPasos.js,
// utils/seguimientoTextos.js) y lo que el contestador saca de la respuesta.
// Sin red ni BD: la cadencia en días hábiles, los textos, el remate del contestador y el interruptor.
const path = require('path');
require(path.join(__dirname, '../node_modules/dotenv')).config({ path: path.join(__dirname, '../.env'), quiet: true });
const Pasos = require('../utils/seguimientoPasos');
const Textos = require('../utils/seguimientoTextos');
const { FIRMA } = require('../services/recordatorios');
const cerebro = require('../services/contestadorCerebro');

let fallos = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fallos++; };
const iso = (d) => (d ? d.toISOString() : null);
const EMOJI = /\p{Extended_Pictographic}/u;

(async () => {
    // ── Días hábiles a las 10:00 de Madrid (noviembre = CET, UTC+1; julio = CEST, UTC+2) ──
    const lun = new Date('2026-11-16T08:00:00Z');          // lunes 9:00
    ok(iso(Pasos.habilesDespues(lun, 0)) === '2026-11-16T09:00:00.000Z', 'lunes 9:00, n=0 → ese lunes a las 10:00');
    ok(iso(Pasos.habilesDespues(new Date('2026-11-16T10:00:00Z'), 0)) === '2026-11-17T09:00:00.000Z', 'lunes 11:00, n=0 → martes 10:00');
    ok(iso(Pasos.habilesDespues(lun, 2)) === '2026-11-18T09:00:00.000Z', 'lunes + 2 hábiles → miércoles 10:00');
    ok(iso(Pasos.habilesDespues(new Date('2026-11-20T09:00:00Z'), 1)) === '2026-11-23T09:00:00.000Z', 'viernes + 1 hábil → lunes');
    ok(iso(Pasos.habilesDespues(new Date('2026-12-07T09:00:00Z'), 1)) === '2026-12-09T09:00:00.000Z', 'lunes 7/12 + 1 → miércoles 9/12 (el 8 es festivo)');
    ok(iso(Pasos.habilesDespues(new Date('2026-12-24T09:00:00Z'), 1)) === '2026-12-28T09:00:00.000Z', 'jueves 24/12 + 1 → lunes 28 (25 festivo y finde)');
    ok(iso(Pasos.habilesDespues(new Date('2026-07-06T06:00:00Z'), 0)) === '2026-07-06T08:00:00.000Z', 'en verano, las 10:00 de Madrid son las 8:00 UTC');
    ok(iso(Pasos.habilesDespues(new Date('2026-11-14T10:00:00Z'), 0)) === '2026-11-16T09:00:00.000Z', 'un sábado, n=0 → lunes');

    // ── PROPUESTA: la escalera ──
    const ahora = new Date('2026-11-16T08:00:00Z');
    let p = Pasos.primerPaso('PROPUESTA', { baseAt: '2026-11-13T12:00:00Z' }, ahora);
    ok(p.fase === 'PRIMERO' && iso(p.proximo) === '2026-11-17T09:00:00.000Z', 'enviada el viernes → «¿la has visto?» el martes (2 hábiles)');
    p = Pasos.primerPaso('PROPUESTA', { baseAt: '2026-11-02T12:00:00Z' }, ahora);
    ok(p.fase === 'PRIMERO' && iso(p.proximo) === '2026-11-16T09:00:00.000Z', 'enviada hace dos semanas (sin seguir) → PRIMERO hoy mismo, no en el pasado');
    p = Pasos.primerPaso('PROPUESTA', { baseAt: '2026-09-01T12:00:00Z' }, ahora);
    ok(p.fase === 'REPASO', 'enviada hace más de 30 días → un REPASO');
    p = Pasos.primerPaso('PROPUESTA', { baseAt: null }, ahora);
    ok(p.fase === 'REPASO', 'sin fecha de envío (migrada) → REPASO');
    p = Pasos.primerPaso('PROPUESTA', { baseAt: '2026-11-13T12:00:00Z', preAceptado: true }, ahora);
    ok(p.fase === 'ACEPTAR', 'PRE-ACEPTADO → el enlace de aceptar');

    let t = Pasos.trasToque('PROPUESTA', 'PRIMERO', { toques: 0, ahora });
    ok(t.fase === 'SEGUNDO' && iso(t.proximo) === '2026-11-23T09:00:00.000Z' && !t.cierra, 'tras PRIMERO → SEGUNDO a los 5 hábiles');
    t = Pasos.trasToque('PROPUESTA', 'SEGUNDO', { toques: 1, ahora });
    ok(t.fase === 'CIERRE' && iso(t.proximo) === '2026-11-25T09:00:00.000Z', 'tras SEGUNDO → CIERRE a los 7 hábiles');
    t = Pasos.trasToque('PROPUESTA', 'CIERRE', { toques: 2, ahora });
    ok(t.cierra && t.fase === null, 'tras CIERRE → se cierra');
    t = Pasos.trasToque('PROPUESTA', 'REPASO', { toques: 0, ahora });
    ok(t.fase === 'CIERRE', 'tras REPASO → CIERRE');
    t = Pasos.trasToque('PROPUESTA', 'ACEPTAR', { toques: 0, ahora });
    ok(t.fase === 'ACEPTAR', 'el primer ACEPTAR → otro ACEPTAR');
    t = Pasos.trasToque('PROPUESTA', 'ACEPTAR', { toques: 1, ahora });
    ok(t.fase === 'CIERRE', 'el segundo ACEPTAR → CIERRE (dos como mucho)');

    // ── Lo que ha contestado ──
    let r = Pasos.trasRespuestaPropuesta({ resultado: 'SIGUE' }, { ahora });
    ok(r.oportunidad === 'PRE-ACEPTADO' && r.fase === 'ACEPTAR' && r.estado === 'ABIERTO' && r.toques === 0, 'SIGUE → PRE-ACEPTADO y el enlace de aceptar (con sus dos toques)');
    r = Pasos.trasRespuestaPropuesta({ resultado: 'NO_SIGUE' }, { ahora });
    ok(r.oportunidad === 'RECHAZADA' && r.estado === 'CERRADO', 'NO_SIGUE → RECHAZADA y cerrado');
    r = Pasos.trasRespuestaPropuesta({ resultado: 'MAS_ADELANTE', cuando: '2027-03-01' }, { ahora });
    ok(r.fase === 'RETOMAR' && iso(r.proximo) === '2027-03-01T09:00:00.000Z' && !r.oportunidad, 'MAS_ADELANTE con fecha → se retoma ESE día, sin tocar la oportunidad');
    r = Pasos.trasRespuestaPropuesta({ resultado: 'MAS_ADELANTE' }, { ahora });
    ok(r.fase === 'RETOMAR' && r.proximo > new Date('2026-12-15T00:00:00Z'), 'MAS_ADELANTE sin fecha → en 30 días');
    r = Pasos.trasRespuestaPropuesta({ resultado: 'MAS_ADELANTE', cuando: '2020-01-01' }, { ahora });
    ok(r.proximo > ahora, 'MAS_ADELANTE con una fecha pasada → no se retoma en el pasado');
    r = Pasos.trasRespuestaPropuesta({ resultado: 'PENSANDO' }, { ahora });
    ok(r.fase === 'SEGUNDO' && !r.oportunidad, 'PENSANDO → un «¿cómo lo ves?» más tarde');

    let s = Pasos.trasRespuestaSinResultado('PROPUESTA', 'PRIMERO', { ahora });
    ok(s.fase === 'SEGUNDO', 'contestó al PRIMERO sin decir nada claro → SEGUNDO');
    s = Pasos.trasRespuestaSinResultado('PROPUESTA', 'CIERRE', { ahora });
    ok(s.fase === 'PREGUNTA', 'contestó antes del CIERRE → una PREGUNTA directa, no «no he sabido nada»');
    ok(Pasos.trasToque('PROPUESTA', 'PREGUNTA', { toques: 2, ahora }).fase === 'CIERRE', 'tras la PREGUNTA → CIERRE');
    s = Pasos.trasRespuestaSinResultado('CEE_INICIAL', 'PEDIDO', { ahora });
    ok(s.fase === 'R1' && iso(s.proximo) === '2026-11-19T09:00:00.000Z', 'CEE: contestó al PEDIDO → R1 en 3 hábiles');

    // ── CEE INICIAL: la escalera ──
    p = Pasos.primerPaso('CEE_INICIAL', { pedidoAt: '2026-11-13T12:00:00Z' }, ahora);
    ok(p.fase === 'R1' && iso(p.proximo) === '2026-11-17T09:00:00.000Z', 'pedido por el agente el viernes → R1 el martes');
    p = Pasos.primerPaso('CEE_INICIAL', { creadoAt: '2026-11-16T07:00:00Z' }, new Date('2026-11-16T07:30:00Z'));
    ok(p.fase === 'PEDIDO' && iso(p.proximo) === '2026-11-17T09:00:00.000Z', 'aceptada hoy y sin pedir → el PEDIDO mañana (un día para el agente)');
    const escalera = [];
    let fase = 'R1';
    for (let i = 1; i <= 10 && fase && fase !== 'AGOTADO'; i++) {
        const x = Pasos.trasToque('CEE_INICIAL', fase, { toques: i, ahora });
        escalera.push(x.fase);
        fase = x.fase;
    }
    ok(escalera.slice(0, 4).join(',') === 'R2,R3,R4,FRAN', `R1 → R2 → R3 → R4 → FRAN (${escalera.join(',')})`);
    ok(escalera[escalera.length - 1] === 'AGOTADO', `y con ${Pasos.MAX_TOQUES_CEE()} toques deja de escribir (AGOTADO), sin cerrarse`);

    // ── Textos ──
    const cli = { quien: 'CLIENTE', nombre: 'ANA MARIA GARCIA LOPEZ' };
    const it = { numero: '26RES060_OP411', cliente: 'ANA MARIA GARCIA LOPEZ', municipio: 'LA SOLANA', enviadaAt: '2026-11-13T12:00:00Z', enlace: 'https://app.brokergy.es/firma/abc' };
    const todos = [];
    for (const f of ['PRIMERO', 'SEGUNDO', 'PREGUNTA', 'CIERRE', 'REPASO', 'ACEPTAR', 'RETOMAR']) {
        const txt = Textos.textoPropuesta(f, cli, [it]);
        todos.push([`cliente ${f}`, txt]);
        ok(txt.startsWith('Hola Ana, ¿qué tal?'), `propuesta ${f} al cliente: de tú y por el nombre de pila`);
    }
    ok(Textos.textoPropuesta('PRIMERO', cli, [it]).includes('https://app.brokergy.es/firma/abc'), 'el PRIMERO lleva el enlace de aceptar');
    ok(!Textos.textoPropuesta('CIERRE', cli, [it]).includes('https://'), 'el CIERRE no lleva enlace');
    ok(Textos.textoPropuesta('CIERRE', cli, [it]).includes('no he sabido nada'), 'CIERRE sin respuesta: «no he sabido nada»');
    ok(Textos.textoPropuesta('CIERRE', cli, [it], { contestado: true }).includes('no he vuelto a saber nada'), 'CIERRE de quien contestó: «no he vuelto a saber nada»');
    ok(Textos.textoPropuesta('PRIMERO', cli, [it]).includes('de La Solana'), 'el pueblo, capitalizado');
    const contacto = { quien: 'CONTACTO', nombre: 'Pedro', titular: 'MARIA PEREZ RUIZ' };
    ok(/la vivienda de Maria Perez Ruiz en La Solana/.test(Textos.textoPropuesta('PRIMERO', contacto, [it])), 'a la persona de contacto: «la vivienda de <titular>»');

    const inst = { quien: 'INSTALADOR', nombre: 'Instalaciones Plaza' };
    const it2 = { numero: '26RES060_OP412', cliente: 'CRISTOBAL DELGADO MORENO', municipio: 'TOMELLOSO', enviadaAt: '2026-11-10T12:00:00Z', enlace: 'https://app.brokergy.es/firma/def' };
    for (const f of ['PRIMERO', 'SEGUNDO', 'PREGUNTA', 'CIERRE', 'REPASO', 'ACEPTAR', 'RETOMAR']) {
        const uno = Textos.textoPropuesta(f, inst, [it2]);
        const varios = Textos.textoPropuesta(f, inst, [it, it2]);
        todos.push([`instalador ${f}`, uno], [`instalador ${f} (2)`, varios]);
        ok(uno.includes('Cristobal Delgado Moreno (Tomelloso)'), `propuesta ${f} al instalador: de qué cliente y pueblo`);
        ok(varios.includes('Ana Maria Garcia (La Solana)') && varios.includes('Cristobal Delgado Moreno (Tomelloso)'), `propuesta ${f} al instalador: varias obras en UN mensaje`);
    }
    ok(!Textos.textoPropuesta('PRIMERO', inst, [it2]).includes('https://'), 'al instalador no se le manda el enlace de aceptar salvo en ACEPTAR');
    ok(Textos.textoPropuesta('ACEPTAR', inst, [it, it2]).includes('https://app.brokergy.es/firma/abc')
        && Textos.textoPropuesta('ACEPTAR', inst, [it, it2]).includes('https://app.brokergy.es/firma/def'), 'ACEPTAR al instalador: el enlace de cada obra');

    const cee = { numero: '26RES060_247', cliente: 'ANA MARIA GARCIA LOPEZ', municipio: 'LA SOLANA', lineas: [Textos.LINEA.caldera, Textos.LINEA.placa], enlace: 'https://app.brokergy.es/subir-docs/x?token=t&need=FOTO_CALDERA_ANTES' };
    for (const f of ['PEDIDO', 'R1', 'R2', 'R3', 'R4', 'FRAN']) {
        const txt = Textos.textoCee(f, cli, [cee]);
        todos.push([`cee cliente ${f}`, txt]);
        ok(txt.includes(Textos.LINEA.placa) && txt.includes('subir-docs'), `CEE ${f} al cliente: lo que falta y el enlace`);
    }
    ok(Textos.textoCee('R2', cli, [cee]).includes(Textos.POR_QUE), 'el R2 dice por qué importa (antes de la obra y su factura)');
    const r3 = Textos.textoCee('R3', inst, [cee], { otroLado: true });
    todos.push(['cee R3 al instalador (otro lado)', r3]);
    ok(r3.includes('Se lo hemos pedido al cliente') && r3.includes('posterior al registro'), 'R3 al instalador: se lo pedimos al cliente y la factura, después del registro');
    const ceeVarios = Textos.textoCee('R2', inst, [cee, { ...cee, numero: '26RES060_250', cliente: 'LUIS ROMERO', municipio: 'ARGAMASILLA DE ALBA', lineas: [Textos.LINEA.vivienda] }]);
    todos.push(['cee R2 instalador (2 obras)', ceeVarios]);
    ok((ceeVarios.match(/subir-docs/g) || []).length === 2, 'CEE al instalador con dos obras: un enlace por obra');
    ok(Textos.textoCee('R1', cli, [{ ...cee, lineas: [] }]) === '', 'CEE sin nada que pedir → no hay mensaje');

    for (const [que, txt] of todos) {
        if (EMOJI.test(txt)) ok(false, `${que}: lleva emojis`);
        if (!txt.trim().endsWith(FIRMA)) ok(false, `${que}: no acaba con la firma`);
        if (/undefined|null|NaN|\[object/.test(txt)) ok(false, `${que}: lleva «undefined/null»: ${txt.slice(0, 80)}`);
        if (/lo siento|perdona|disculp/i.test(txt)) ok(false, `${que}: se disculpa`);
    }
    ok(true, `${todos.length} textos: sin emojis, con la firma, sin huecos y sin disculparse`);

    // ── El contestador: lo que le hemos preguntado y lo que devuelve ──
    const segs = [
        { tipo: 'PROPUESTA', numero: '26RES060_OP411', cliente: 'ANA GARCIA', municipio: 'LA SOLANA', fase: 'SEGUNDO', toques: 1, ultimo_toque_at: '2026-11-16T09:00:00Z' },
        { tipo: 'CEE_INICIAL', numero: '26RES060_247', cliente: 'LUIS ROMERO', municipio: 'TOMELLOSO', fase: 'R2', toques: 2, ultimo_toque_at: '2026-11-16T09:00:00Z', faltan: ['Una foto de la caldera'] },
    ];
    const bloque = cerebro.bloqueSeguimiento(segs);
    ok(bloque.includes('26RES060_OP411 · PROPUESTA') && bloque.includes('26RES060_247 · CEE INICIAL') && bloque.includes('Una foto de la caldera'), 'el bloque del seguimiento dice qué se le preguntó y qué falta');
    const rm = cerebro.rematar({
        accion: 'RESPONDER', parrafos: ['Perfecto, sin problema.'], motivo: 'no sigue',
        seguimiento: [
            { numero: '26res060_op411', resultado: 'no_sigue', nota: 'lo ha hecho con otro' },
            { numero: '26RES060_OP999', resultado: 'QUIZAS' },
            { numero: '', resultado: 'SIGUE' },
            { numero: '26RES060_OP412', resultado: 'MAS_ADELANTE', cuando: 'en marzo' },
        ],
    }, {});
    ok(rm.seguimiento.length === 2 && rm.seguimiento[0].numero === '26RES060_OP411' && rm.seguimiento[0].resultado === 'NO_SIGUE',
        'rematar: el seguimiento se valida (mayúsculas, resultado del catálogo, con número)');
    ok(rm.seguimiento[1].cuando === null, 'rematar: una fecha que no es AAAA-MM-DD se descarta');
    ok(Array.isArray(cerebro.rematar({ accion: 'CALLAR', parrafos: [], motivo: 'x' }, {}).seguimiento), 'rematar: sin seguimiento, lista vacía');
    ok(cerebro.SCHEMA.properties.seguimiento?.items?.properties?.resultado?.enum?.length === 4, 'el SCHEMA (Gemini) lleva el seguimiento');

    // El prompt: la sección solo aparece si hay seguimiento abierto con ese teléfono.
    const ch = { rol: 'cliente', texto: 'ELLOS: No, gracias, al final lo he hecho con otro.' };
    let pr;
    try {
        pr = cerebro.construirPrompt(ch, null, null, { lineas: [] }, { seguimientos: segs }).prompt;
        ok(pr.includes('LO QUE LE HEMOS PREGUNTADO EN EL SEGUIMIENTO') && pr.includes('"seguimiento": []'), 'con seguimiento: el prompt lo cuenta y pide el campo');
        const sin = cerebro.construirPrompt(ch, null, null, { lineas: [] }, {}).prompt;
        ok(!sin.includes('SEGUIMIENTO') && !sin.includes('"seguimiento"'), 'sin seguimiento: el prompt de siempre');
    } catch (e) {
        ok(false, `construirPrompt sin dossier: ${e.message}`);
    }

    // ── El servicio: el interruptor y lo puro ──
    const prev = { en: process.env.SEGUIMIENTO_ENABLED, modo: process.env.SEGUIMIENTO_MODO, prueba: process.env.SEGUIMIENTO_PRUEBA };
    process.env.SEGUIMIENTO_ENABLED = 'false';
    const seg = require('../services/seguimientoWhatsapp');
    ok(!seg.activo(), 'nace apagado (SEGUIMIENTO_ENABLED)');
    ok((await seg.vuelta()).motivo === 'apagado', 'apagado, la vuelta no hace nada');
    ok((await seg.resumen()) === '', 'apagado, el resumen va vacío');
    ok((await seg.paraContestador('600000000')).length === 0, 'apagado, el contestador no ve seguimientos');
    ok((await seg.alContestar('600000000', [{ numero: 'X', resultado: 'SIGUE' }])).length === 0, 'apagado, lo que contesta no toca nada');
    delete process.env.SEGUIMIENTO_MODO;
    ok(seg.modo() === 'copia', 'sin SEGUIMIENTO_MODO=real, modo copia');
    process.env.SEGUIMIENTO_MODO = 'real';
    process.env.SEGUIMIENTO_PRUEBA = '600 111 222';
    ok(seg.modoPara('600111222') === 'real' && seg.modoPara('699999999') === 'copia', 'con SEGUIMIENTO_PRUEBA, lo real solo para esos teléfonos');
    process.env.SEGUIMIENTO_PRUEBA = '';
    ok(seg.modoPara('699999999') === 'real', 'sin lista de prueba, real para todos');
    for (const [k, v] of [['SEGUIMIENTO_ENABLED', prev.en], ['SEGUIMIENTO_MODO', prev.modo], ['SEGUIMIENTO_PRUEBA', prev.prueba]]) {
        if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }

    ok(seg.ultimoEnvio([
        { fecha: '2026-11-01T10:00:00Z', envios: [{ status: 'ok' }] },
        { fecha: '2026-11-10T10:00:00Z', envios: [{ status: 'error' }] },
        { fecha: '2026-11-05T10:00:00Z', envios: [{ ok: true }] },
    ]) === '2026-11-05T10:00:00.000Z', 'el último envío es el último que SALIÓ BIEN');
    ok(seg.ultimoEnvio([]) === null && seg.ultimoEnvio(null) === null, 'sin envíos, null');
    const fila = { tipo: 'CEE_INICIAL', fase: 'R3', destino: 'CLIENTE', tel9: '600111222', nombre: 'Ana', detalle: { otro: { quien: 'INSTALADOR', tel9: '600333444', nombre: 'Plaza' } } };
    ok(seg.destinoDeFila(fila).tel9 === '600333444' && seg.destinoDeFila(fila).otroLado, 'el R3 va al OTRO lado');
    ok(seg.destinoDeFila({ ...fila, fase: 'R2' }).tel9 === '600111222', 'el resto, al de siempre');
    ok(seg.destinoDeFila({ ...fila, detalle: {} }).tel9 === '600111222' && !seg.destinoDeFila({ ...fila, detalle: {} }).otroLado, 'R3 sin otro lado → al mismo');
    ok(seg.enlaceAceptar('abc').endsWith('/firma/abc'), 'el enlace de aceptar es el /firma/:uuid de la oportunidad');

    // El WATCHDOG (16/11/2026, Vicente: seis mensajes de OTRA obra movieron cuatro propuestas dos pasos).
    {
        const V = '691000000';
        const sinToque = { tel9: V, contestado_at: null, detalle: {}, acciones: [{ at: '2026-11-15T21:27:00Z', accion: 'alta' }] };
        ok(!seg.comoRespuesta(sinToque, V).cuenta, 'sin haberle escrito nada en ESE seguimiento, su mensaje no es respuesta');
        const tocada = { ...sinToque, detalle: { escritos: { [V]: '2026-11-16T09:00:00Z' } } };
        ok(seg.comoRespuesta(tocada, V).cuenta && seg.comoRespuesta(tocada, V).avanza, 'el primer mensaje tras el toque es respuesta y mueve la escalera');
        const yaContesto = { ...tocada, contestado_at: '2026-11-16T09:05:00Z' };
        ok(seg.comoRespuesta(yaContesto, V).cuenta && !seg.comoRespuesta(yaContesto, V).avanza, 'los demás de la ráfaga se apuntan, pero no mueven nada');
        const nuevoToque = { ...yaContesto, detalle: { escritos: { [V]: '2026-11-19T09:00:00Z' } } };
        ok(seg.comoRespuesta(nuevoToque, V).avanza, 'tras un toque NUEVO, su respuesta vuelve a mover la escalera');
        ok(!seg.comoRespuesta(tocada, '600999888').cuenta, 'el otro lado no cuenta si a él no se le ha escrito (el R3)');
        const r3 = { ...tocada, detalle: { escritos: { [V]: '2026-11-16T09:00:00Z', '600999888': '2026-11-20T09:00:00Z' } } };
        ok(seg.comoRespuesta(r3, '600999888').avanza, 'tras el R3, lo que conteste el otro lado sí es respuesta');
        const deAntes = { ...sinToque, acciones: [{ at: '2026-11-16T09:00:00Z', accion: 'toque', tel9: V }] };
        ok(seg.comoRespuesta(deAntes, V).avanza, 'una fila sin `escritos` se mira por el toque de sus acciones');
    }

    // Fichas con un nombre PROVISIONAL (15/11/2026: la calle, «PROPIETARIO», «CALDERA CARBÓN»).
    for (const n of ['PROPIETARIO LA SOLANA 55', 'CL GOYA 15 - MOTILLA DEL PALANCAR', 'CALDERA CARBÓN', 'C/ SIETE, 11', 'AVDA. JUAN CARLOS I, 4']) {
        ok(seg.nombreProvisional(n), `«${n}» no es el nombre de una persona`);
    }
    for (const n of ['JUAN CARLOS LARA', 'Mª JOSÉ PESETA', 'CLAUDIA RUIZ', 'CASIMIRO PÉREZ', 'CALIXTO GÓMEZ']) {
        ok(!seg.nombreProvisional(n), `«${n}» sí es un nombre`);
    }
    {
        const T = require('../utils/seguimientoTextos');
        ok(T.deQuien({ ref: true, cliente: 'CL GOYA 15 - MOTILLA DEL PALANCAR', municipio: 'MOTILLA DEL PALANCAR' }) === 'Cl Goya 15 - Motilla del Palancar', 'una calle que ya lleva el pueblo no lo repite');
        ok(!/\(Villanueva/.test(T.deQuien({ ref: true, cliente: 'CL CUESTA DEL JARDIN 9 (INFANTES)', municipio: 'VILLANUEVA DE LOS INFANTES' })), 'una referencia con su paréntesis no lleva otro');
        ok(/^Propietario la Solana 55 \(Argamasilla de Alba\)$/.test(T.deQuien({ ref: true, cliente: 'PROPIETARIO LA SOLANA 55', municipio: 'ARGAMASILLA DE ALBA' })), 'la referencia provisional va ENTERA, con el pueblo');
    }

    console.log(fallos ? `\n${fallos} fallo(s).` : '\nTodo bien.');
    process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
