#!/usr/bin/env node
// Pruebas PURAS de la ronda de WhatsApp (sin BD, sin WhatsApp, sin Gemini).
//   node implementation/backend/scripts/test_ronda_whatsapp.js
'use strict';
process.env.WHATSAPP_ENABLED = 'false';
const assert = require('assert');
const IA = require('../services/rondaWhatsappIA');
const Informe = require('../services/rondaWhatsappInforme');
const ronda = require('../services/rondaWhatsapp');

let ok = 0;
const prueba = (nombre, fn) => {
    try { fn(); ok++; console.log(`  ✓ ${nombre}`); }
    catch (e) { console.error(`  ✗ ${nombre}\n    ${e.message}`); process.exitCode = 1; }
};

console.log('Enlaces: los pone el código');
const E = { '{ENLACE_SUBIR}': 'https://app.brokergy.es/subir-docs/abc?token=0123456789abcdef', '{ENLACE_FIRMAR}': 'https://app.brokergy.es/firmar-anexos/xyz' };
prueba('la marca se cambia por la URL, sola en su línea', () => {
    const r = IA.sustituirEnlaces('Súbelas aquí:{ENLACE_SUBIR}¡Gracias!', E);
    assert.strictEqual(r.texto, `Súbelas aquí:\n${E['{ENLACE_SUBIR}']}\n¡Gracias!`);
    assert.deepStrictEqual(r.usados, ['{ENLACE_SUBIR}']);
    assert.deepStrictEqual(r.problemas, []);
});
prueba('una URL escrita por el modelo se quita y se avisa (aunque se parezca a la buena)', () => {
    const r = IA.sustituirEnlaces('Mira https://app.brokergy.es/subir-docs/abc?token=01234 ya', E);
    assert.ok(!r.texto.includes('http'));
    assert.strictEqual(r.problemas.length, 1);
});
prueba('una marca que no existe se quita y se avisa', () => {
    const r = IA.sustituirEnlaces('Aquí: {ENLACE_RARO}', E);
    assert.ok(!r.texto.includes('{'));
    assert.ok(r.problemas[0].includes('{ENLACE_RARO}'));
});
prueba('los enlaces del dossier pasan a marcas y el mapa guarda la URL', () => {
    const d = { enlaces: { subir_documentacion: 'https://x/subir', firmar_anexos: 'https://x/firmar', aceptar_propuesta: null, ver_mi_expediente: null } };
    const m = IA.enlacesAMarcas(d);
    assert.strictEqual(d.enlaces.subir_documentacion, '{ENLACE_SUBIR}');
    assert.strictEqual(d.enlaces.aceptar_propuesta, null);
    assert.strictEqual(m['{ENLACE_FIRMAR}'], 'https://x/firmar');
    assert.strictEqual(Object.keys(m).length, 2);
});

console.log('Párrafos: los junta el código');
prueba('lista de párrafos → separados por línea en blanco', () => {
    assert.strictEqual(IA.juntarParrafos({ parrafos: ['¡Hola Paloma!', ' Sobre la obra… ', ''] }), '¡Hola Paloma!\n\nSobre la obra…');
});
prueba('si llega un texto suelto (formato viejo) se respeta', () => {
    assert.strictEqual(IA.juntarParrafos({ mensaje: 'Hola' }), 'Hola');
});

console.log('Avisos de la app: no son promesas de nadie');
prueba('un mensaje nuestro que está en la cola de envío es automático', () => {
    const envios = new Set([IA.huella('¡Hola Juan! Tu propuesta *26RES060_OP12* ya está lista…')]);
    assert.ok(IA.esAutomatico({ de_mi: true, tipo: 'chat', texto: '¡Hola Juan!  Tu propuesta 26RES060_OP12 ya está lista…' }, envios));
    assert.ok(!IA.esAutomatico({ de_mi: true, tipo: 'chat', texto: 'Mañana te lo miro' }, envios));
    assert.ok(!IA.esAutomatico({ de_mi: false, tipo: 'chat', texto: '¡Hola Juan! Tu propuesta…' }, envios));
});
prueba('la firma corporativa delata un aviso aunque no esté en la cola', () => {
    assert.ok(IA.esAutomatico({ de_mi: true, tipo: 'chat', texto: 'Te recordamos…\n\n*BROKERGY — Ingeniería Energética*' }, new Set()));
});
prueba('una promesa NUESTRA de un aviso automático se descarta y se cuenta', () => {
    const r = IA.validarAnalisis({
        adjuntos: [], preguntas_sin_contestar: [], resumen_por_obra: [], obra_de_la_conversacion: '',
        promesas: [
            { quien: 'NOSOTROS', que: 'dejar preparada la parte técnica para el IRPF', origen: 'AVISO_AUTOMATICO' },
            { quien: 'NOSOTROS', que: 'llamarle el lunes', origen: 'PERSONA' },
            { quien: 'ELLOS', que: 'mandar la factura', origen: 'AVISO_AUTOMATICO' },
        ],
    }, []);
    assert.strictEqual(r.promesas.length, 2);
    assert.strictEqual(r.promesas_descartadas, 1);
});

console.log('El código valida la obra');
prueba('un código fuera de la lista es dudoso; NUEVA se conserva', () => {
    const r = IA.validarAnalisis({
        adjuntos: [{ n: 1, obra: '26RES060_187' }, { n: 2, obra: '26RES060_999' }, { n: 3, obra: 'NUEVA' }],
        preguntas_sin_contestar: [], promesas: [], resumen_por_obra: [], obra_de_la_conversacion: '26RES060_999',
    }, [{ codigo: '26RES060_187' }]);
    assert.deepStrictEqual(r.adjuntos.map(a => a.obra), ['26RES060_187', '', 'NUEVA']);
    assert.strictEqual(r.obra_de_la_conversacion, '');
});

console.log('Propuestas: solo se acepta lo que se envió');
prueba('PTE ENVIAR y LEAD no tienen propuesta que aceptar', () => {
    assert.strictEqual(IA.estadoPropuesta({ tipo: 'oportunidad', estado: 'PTE ENVIAR' }), 'SIN_ENVIAR');
    assert.strictEqual(IA.estadoPropuesta({ tipo: 'oportunidad', estado: 'LEAD' }), 'SIN_ENVIAR');
    assert.strictEqual(IA.estadoPropuesta({ tipo: 'oportunidad', estado: 'ENVIADA' }), 'ENVIADA');
    assert.strictEqual(IA.estadoPropuesta({ tipo: 'oportunidad', estado: 'ACEPTADA' }), 'ACEPTADA_SIN_EXPEDIENTE');
    assert.strictEqual(IA.estadoPropuesta({ tipo: 'expediente', estado: 'PTE. FIN OBRA' }), null);
});

console.log('Quién escribe');
prueba('la oficina de un instalador puesta como contacto de clientes es el instalador', () => {
    const personas = [
        { tipo: 'partner', id: 'p1', nombre: 'JOSE VICENTE RUIZ SL', rol: 'INSTALADOR' },
        { tipo: 'cliente', id: 'c1', nombre: 'MARIA', via: 'persona de contacto' },
        { tipo: 'cliente', id: 'c2', nombre: 'PEDRO', via: 'persona de contacto' },
    ];
    assert.strictEqual(ronda._rolDe(personas), 'instalador');
    assert.ok(ronda._tituloDe(personas, 'Paloma').startsWith('JOSE VICENTE RUIZ SL (contacto en 2 fichas de cliente)'));
    assert.strictEqual(ronda._rolDe([...personas, { tipo: 'cliente', id: 'c3', nombre: 'X', via: 'titular' }]), 'ambos');
    assert.strictEqual(ronda._rolDe([{ tipo: 'cliente', id: 'c', nombre: 'A', via: 'titular' }]), 'cliente');
});

console.log('Gasto: pensar solo donde hace falta, y nada en un «gracias»');
const { ajustesGemini } = require('../utils/geminiAjustes');
prueba('con UNA obra no se piensa; con varias, un tope corto', () => {
    assert.strictEqual(IA.pensamientoPara({ obras: [{}], conAdjuntos: true }), 0);
    assert.strictEqual(IA.pensamientoPara({ obras: [{}, {}], conAdjuntos: false }), 512);
    assert.strictEqual(IA.pensamientoPara({ obras: [{}, {}], conAdjuntos: true }), 1024);
});
prueba('el tope llega a cada modelo en SU idioma (presupuesto en la 2.5, nivel en la 3.5-lite)', () => {
    assert.deepStrictEqual(ajustesGemini('gemini-2.5-flash', { pensamiento: 1024 }).thinkingConfig, { thinkingBudget: 1024 });
    assert.deepStrictEqual(ajustesGemini('gemini-2.5-flash', { pensamiento: 0 }).thinkingConfig, { thinkingBudget: 0 });
    assert.deepStrictEqual(ajustesGemini('gemini-3.5-flash-lite', { pensamiento: 0 }).thinkingConfig, { thinkingLevel: 'minimal' });
    assert.deepStrictEqual(ajustesGemini('gemini-3.5-flash-lite', { pensamiento: 1024 }).thinkingConfig, { thinkingLevel: 'low' });
});
prueba('el coste se cuenta con el precio de cada modelo', () => {
    const u = (modelo) => ({ modelo, in: 1e6, out: 1e6, think: 0 });
    assert.strictEqual(IA.costeLlamada(u('gemini-2.5-flash')), 2.80);
    assert.strictEqual(IA.costeLlamada(u('gemini-2.5-flash-lite')).toFixed(2), '0.50');
    assert.strictEqual(IA.costeLlamada(u('gemini-3.1-flash-lite')), 1.75);
    assert.strictEqual(IA.costeLlamada(u('gemini-desconocido')), 2.80, 'lo que no está en la tabla, como el 2.5 Flash');
    assert.strictEqual(IA.costeLlamada({ modelo: 'gemini-2.5-flash', in: 0, out: 0, think: 1e6 }), 2.50, 'pensar se cobra como salida');
});
prueba('un chat cuyo NUEVO es solo cortesía no se analiza; con una foto o una pregunta, sí', () => {
    const t = 1000;
    assert.ok(ronda._soloCortesia([{ de_mi: false, tipo: 'chat', texto: 'Muchas gracias Fran', t }], 0));
    assert.ok(!ronda._soloCortesia([{ de_mi: false, tipo: 'chat', texto: 'gracias', t }, { de_mi: false, tipo: 'image', texto: '', t }], 0));
    assert.ok(!ronda._soloCortesia([{ de_mi: false, tipo: 'chat', texto: '¿Cuándo viene el técnico?', t }], 0));
    assert.ok(!ronda._soloCortesia([{ de_mi: true, tipo: 'chat', texto: 'gracias', t }], 0), 'si no hay nada suyo, no es «solo cortesía»');
    assert.ok(!ronda._soloCortesia([{ de_mi: false, tipo: 'chat', texto: 'gracias', t: 10 }], 500), 'lo viejo no cuenta');
});

console.log('El resumen de WhatsApp: corto, y en fase 1 no invita a contestar');
const base = (extra = {}) => ({
    fecha: '2026-10-20', generada_at: '2026-10-20T03:30:00Z', ventana: 'Desde el 19/10, 05:00', fallos: [],
    coste: { eur: 0.4, llamadas: 10, reintentos: 0 }, tiempos: { min: '9.0' }, chats: [],
    resumen: {
        telefonos: 444, conChat: 374, activos: 0, porRol: {}, cont: { fotos: 0, documentos: 0, audios: 0, videos: 0, yaColocadas: 0 },
        adjuntos: 0, asignados: 0, asignadosAlta: 0, nuevas: 0, dudosos: 0, noRelacionados: 0, fotosEnObra: 0, conSlot: 0, slotHueco: 0,
        preguntas: 0, promesasEllos: 0, promesasEllosPend: 0, promesasNos: 0, promesasNosPend: 0, promesasDescartadas: 0,
        enlaces: 0, problemasEnlaces: 0, sinEnviar: [], soloNuestros: 0, soloCortesia: 0, sinAnalizar: 0, borr: { RESPONDER: 0, ESCALAR: 0, CALLAR: 0, MANO: 0 },
    },
    ...extra,
});
prueba('sin nada nuevo no hay mensaje', () => {
    assert.strictEqual(Informe.resumenWhatsapp(base()), null);
});
prueba('con algo, sale corto, dice que es en prueba y NO pide «sí C1»', () => {
    const chat = {
        ref: 'C1', titulo: 'AGUAHORRO, SL — «José»', rolTexto: 'Instalador', adjuntosObra: 3, obrasTocadas: ['26RES093_6'],
        analisis: { promesas: [{ quien: 'NOSOTROS', que: 'llamar a José el lunes', para_cuando: '2026-10-19', cumplida: false, obra: '' }] },
        borrador: { accion: 'ESCALAR', motivo: 'se queja del retraso' },
    };
    const r = base({ chats: [chat] });
    Object.assign(r.resumen, { activos: 1, adjuntos: 3, asignados: 3, preguntas: 1, sinEnviar: ['26RES060_OP300'] });
    const wa = Informe.resumenWhatsapp(r);
    assert.ok(wa.length < 1500, `largo: ${wa.length}`);
    assert.ok(wa.includes('En prueba'));
    assert.ok(wa.includes('26RES060_OP300'));
    assert.ok(wa.includes('llamar a José el lunes'));
    assert.ok(!/\bs[ií]\s+C\d/i.test(wa), 'no puede invitar a contestar «sí C1»');
});
prueba('con chats sin analizar (Gemini sin crédito) lo dice ARRIBA y sale aunque no haya nada más', () => {
    const r = base({ aviso: 'Gemini se ha quedado sin crédito y 24 chats se han quedado sin analizar.' });
    Object.assign(r.resumen, { activos: 24, sinAnalizar: 24 });
    const wa = Informe.resumenWhatsapp(r);
    assert.ok(wa, 'tiene que salir');
    const segunda = wa.split('\n')[1];
    assert.ok(segunda.startsWith('⚠️ *Incompleto:*') && segunda.includes('24 chats'), 'en la segunda línea');
    assert.ok(!wa.includes('..'));
    assert.ok(Informe.informeHtml(r).includes('Incompleto'));
    assert.ok(Informe.informeMarkdown(r).includes('Incompleto'));
});
prueba('el email escapa lo que viene del chat', () => {
    const r = base({ chats: [{ ref: 'C1', titulo: '<script>x</script>', rolTexto: 'Cliente', mensajes: 1, suyos: 1, ultimo: '—', obras: [], filas: [], sinLeer: [] }] });
    const html = Informe.informeHtml(r);
    assert.ok(!html.includes('<script>x'));
    assert.ok(html.includes('&lt;script&gt;'));
});

console.log(`\n${ok} pruebas bien${process.exitCode ? ', con FALLOS' : ''}.`);
