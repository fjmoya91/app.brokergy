// Pruebas del ASISTENTE del instalador en su app (fase 6, services/asistenteInstalador.js),
// con DOBLES: ni modelo, ni BD, ni Drive. El modelo va GUIONIZADO (vuelta → lo que «diría»)
// y el servicio de presupuestos es uno de mentira que apunta lo que se le pide.
//
//   node implementation/backend/scripts/test_asistente_instalador.js
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const AI = require('../services/asistenteInstalador');
const M = require('../services/presupuestoMotor');
const WA = require('../services/presupuestoGrupoWhatsapp');

const RCA = '113a5765-84fb-4012-a17c-1a275aec530c';
const OTRO_CLI = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const SUYO_CLI = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
const SUYO_PRE = 'cccccccc-3333-4333-8333-cccccccccccc';
const AJENO_PRE = 'dddddddd-4444-4444-8444-dddddddddddd';
const LUNES_10 = new Date('2026-11-23T10:00:00+01:00');

let L;
let pasadas = 0;
const pruebas = [];
const prueba = (nombre, fn) => pruebas.push({ nombre, fn });

// ── Dobles ───────────────────────────────────────────────────────────────────
function servicio({ candidatos = null } = {}) {
    const llamadas = { crear: [], actualizar: [], resolver: [], obtener: [] };
    const filas = new Map();
    let n = 40;
    const fila = (entrada, id, numero) => {
        const conceptos = entrada.conceptos?.length ? entrada.conceptos : L.conceptosDe(entrada.obra);
        const c = L.calcularPresupuesto({ conceptos, modo: 'total', total: entrada.total, iva_pct: entrada.iva_pct ?? 21, con_iva: entrada.con_iva });
        return { id, numero, fecha: entrada.fecha, estado: 'EMITIDO', modo: 'total', cliente_id: SUYO_CLI, cliente: { nombre: 'JUAN PÉREZ LÓPEZ', municipio: 'TOMELLOSO' }, obra: entrada.obra, lineas: c.lineas, base: c.base, iva_pct: 21, iva: c.iva, total: c.total, notas: entrada.notas, validez_dias: entrada.validez_dias };
    };
    filas.set(SUYO_PRE, fila({ fecha: '2026-11-20', obra: { tipo: 'aerotermia', equipo: { marca: 'PANASONIC', modelo: 'AQUAREA 9KW' }, caldera: { combustible: 'gasoleo' }, emisor: 'radiadores', extras: [{ clave: 'retirada_caldera' }] }, total: '9000', con_iva: false, notas: 'Mis notas', validez_dias: 15 }, SUYO_PRE, '38/26'));
    const S = {
        async opcionesNuevo() { return { numero: `${n + 1}/26`, fecha: '2026-11-23', iva_pct: 21, notas: 'El presupuesto no incluye la alimentación eléctrica.', validez_dias: 30, emisor: { nombre: 'RCA' } }; },
        async resolverCliente(a) {
            llamadas.resolver.push(a);
            if (a.prescriptorId !== RCA) throw Object.assign(new Error('sin empresa'), { status: 403 });
            if (a.clienteId === OTRO_CLI) throw Object.assign(new Error('Cliente no encontrado.'), { status: 404 });
            if (a.clienteId) return { cliente: { id_cliente: a.clienteId, nombre_razon_social: 'JUAN', apellidos: 'PÉREZ LÓPEZ', tlf: '611222333', municipio: 'TOMELLOSO' }, creado: false };
            if (candidatos) return { cliente: null, creado: false, candidatos };
            return { cliente: { id_cliente: SUYO_CLI, nombre_razon_social: 'JUAN', apellidos: 'PÉREZ LÓPEZ', tlf: a.cliente.tlf }, creado: true };
        },
        async crear(a) {
            llamadas.crear.push(a);
            n += 1;
            const f = fila(a.entrada, `pre-${n}`, a.entrada.numero);
            filas.set(f.id, f);
            return { ...f, cliente_creado: true };
        },
        async obtener(pid, id) {
            llamadas.obtener.push(id);
            const f = pid === RCA && filas.get(id);
            if (!f) throw Object.assign(new Error('Presupuesto no encontrado.'), { status: 404 });
            return f;
        },
        async actualizar(a) {
            llamadas.actualizar.push(a);
            const antes = await S.obtener(a.prescriptorId, a.id);
            const f = fila(a.entrada, a.id, a.entrada.numero || antes.numero);
            filas.set(a.id, f);
            return f;
        },
        async listar() { return [...filas.values()].map(f => ({ id: f.id, numero: f.numero, fecha: f.fecha, estado: f.estado, cliente: f.cliente.nombre, municipio: 'TOMELLOSO', resumen: L.resumenObra(f.obra), base: f.base, total: f.total, obra: null, simulacion: null })); },
        async paraApp(pid, f) { return { id: f.id, numero: f.numero, fecha: f.fecha, cliente: { nombre: f.cliente.nombre, municipio: 'TOMELLOSO' }, obra: f.obra, resumen: L.resumenObra(f.obra), base: Number(f.base), iva_pct: 21, total: Number(f.total), simulacion: null, id_oportunidad: null, vinculado: false }; },
        entradaDesdeFila: (f) => require('../services/presupuestoInstaladorService').entradaDesdeFila(f),
    };
    return { S, llamadas, filas };
}

const OBRA = {
    id: '26RES060_OP12', uuid: 'eeeeeeee-5555-4555-8555-eeeeeeeeeeee', numero_expediente: '26RES060_180', cliente: 'Carmen Ruiz', municipio: 'Tomelloso',
    paso: 4, fase: 'En trámite', quien: 'tu', bono: 3100, telefono: '600000000', cuentas: { margen: 1 },
    tareas: [{ key: 'cifo', que: 'Firma el certificado de la instalación', destino: { tipo: 'accion', accion: 'cifo' } }],
    papeles: [
        { key: 'cifo', nombre: 'El certificado de la instalación', estado: 'Falta tu firma', tono: 'tu', accion: 'cifo' },
        { key: 'cee_final', nombre: 'El certificado energético final', estado: 'Con el técnico', tono: 'nos', accion: null },
        { key: 'factura', nombre: 'La factura', estado: 'Revisada', tono: 'ok', accion: 'factura' },
    ],
};

function datos(opciones = {}) {
    const s = servicio(opciones);
    return {
        ...s,
        datos: {
            obras: async () => [OBRA, { ...OBRA, id: '26RES060_OP13', numero_expediente: null, cliente: 'Pilar Nieto', municipio: 'Argamasilla', quien: 'cli', tareas: [], paso: 2 }],
            obra: async (id) => (id === OBRA.id || id === OBRA.numero_expediente ? OBRA : null),
            catalogo: async () => ({ sin_marcas: false, equipos: [{ id: 101, marca: 'PANASONIC', nombre: 'Aquarea L 9 kW', ref: 'WH-MXC09J3E5', potencia_kw: 9, acs_corto: 'Con depósito', tu_precio: 4200, tarifa: { precio: 3900, distribuidor: 'Electrofil' } }, { id: 102, marca: 'PANASONIC', nombre: 'Aquarea L 12 kW', ref: 'WH-MXC12J9E8', potencia_kw: 12, tu_precio: null, tarifa: null }] }),
            presupuestos: s.S,
        },
    };
}

/** El modelo, con guion: cada vuelta devuelve lo que toca (texto y/o herramientas). */
function modelo(vueltas) {
    const llamadas = [];
    const fn = async ({ messages, onText, tools, system }) => {
        llamadas.push({ messages: JSON.parse(JSON.stringify(messages)), tools, system });
        const v = vueltas[llamadas.length - 1];
        if (!v) throw new Error('el guion se ha acabado');
        const r = typeof v === 'function' ? v(messages) : v;
        const content = [];
        if (r.texto) { for (const trozo of r.texto.match(/[\s\S]{1,7}/g)) onText(trozo); content.push({ type: 'text', text: r.texto }); }
        for (const [i, h] of (r.herramientas || []).entries()) content.push({ type: 'tool_use', id: `tu_${llamadas.length}_${i}`, name: h.name, input: h.input });
        return { content, stop_reason: r.herramientas?.length ? 'tool_use' : 'end_turn', usage: { input_tokens: 1000, output_tokens: 100 }, model: 'claude-sonnet-5-5' };
    };
    fn.llamadas = llamadas;
    return fn;
}

async function hablar({ texto = 'hola', mensajes = null, memoria = null, vueltas, d = datos(), cfg = null, sinModelo = false }) {
    const eventos = [];
    const m = sinModelo ? null : modelo(vueltas);
    await AI.conversar({
        mensajes: mensajes || [{ role: 'user', content: texto }], memoria,
        usuario: { id_usuario: 7, nombre: 'Raúl' }, empresa: RCA, nombreEmpresa: 'RCA',
        emitir: (e) => eventos.push(e), deps: { datos: d.datos, modelo: sinModelo ? undefined : m, logica: L, ahora: LUNES_10, cfg: cfg || AI.config({}) },
    });
    const de = (t) => eventos.filter(e => e.t === t);
    return { eventos, de, texto: de('texto').map(e => e.d).join(''), m, d };
}
const resultadoDe = (m, vuelta) => JSON.parse(m.llamadas[vuelta].messages.at(-1).content[0].content);

// ── Pruebas ──────────────────────────────────────────────────────────────────
prueba('un solo motor: el WhatsApp y la app usan las MISMAS funciones', () => {
    for (const k of ['fusionar', 'faltaObra', 'entradaDe', 'hayAlgo', 'eleccionDe']) assert.strictEqual(WA[k], M[k], k);
});

prueba('lo preparado lo calcula el código: sus tareas con botón y sus presupuestos sin bono', () => {
    const p = AI.preparado({
        obras: [OBRA, { ...OBRA, id: 'X2', tareas: [{ key: 'factura', que: 'Haz la factura de la obra', destino: { tipo: 'accion', accion: 'factura', modo: 'plantilla' } }] }],
        presupuestos: [
            { id: SUYO_PRE, numero: '40/26', cliente: 'Juan Pérez', fecha: '2026-11-20', estado: 'EMITIDO', obra: null, simulacion: null },
            { id: 'x', numero: '30/26', cliente: 'Viejo', fecha: '2026-09-01', estado: 'EMITIDO', obra: null, simulacion: null },
            { id: 'y', numero: '31/26', cliente: 'Anulado', fecha: '2026-11-21', estado: 'ANULADO', obra: null, simulacion: null },
            { id: 'z', numero: '32/26', cliente: 'Ligado', fecha: '2026-11-21', estado: 'EMITIDO', obra: '26RES060_OP9', simulacion: null },
        ],
        nombre: 'Raúl', ahora: LUNES_10,
    });
    assert.strictEqual(p.cosas.length, 3);
    assert.deepStrictEqual(p.cosas.map(c => c.boton), ['Firmar ahora', 'Hacer la factura', 'Calcular el bono']);
    assert.strictEqual(p.cosas[1].modo, 'plantilla');
    assert.strictEqual(p.cosas[2].presupuesto, SUYO_PRE);
    assert.match(p.saludo, /^Buenos días, Raúl\.$/);
    assert.match(p.texto, /3 cosas/);
    assert.strictEqual(p.sugerencias.length, 4);
    const nada = AI.preparado({ obras: [], presupuestos: [], ahora: LUNES_10 });
    assert.strictEqual(nada.cosas.length, 0);
    assert.match(nada.texto, /nada pendiente/);
});

prueba('la memoria del navegador se sanea: ids que no son uuid fuera, textos sin marcas', () => {
    const m = AI.limpiarMemoria({ presupuesto: { id: SUYO_PRE, numero: '40/26', cliente: 'Juan <b>Pérez</b> `rm`' }, obra: { id: "26RES060_OP12'; drop" }, candidatos: [{ id: 'no', nombre: 'X' }, { id: SUYO_CLI, nombre: 'Juan', municipio: 'Tomelloso' }] });
    assert.strictEqual(m.presupuesto.id, SUYO_PRE);
    assert.ok(!/[<>`]/.test(m.presupuesto.cliente));
    assert.strictEqual(m.obra, undefined);
    assert.deepStrictEqual(m.candidatos.map(c => c.id), [SUYO_CLI]);
    assert.match(AI.notaMemoria(m), /40\/26/);
    assert.strictEqual(AI.notaMemoria({}), null);
});

prueba('los botones del texto: como mucho 4 y fuera del texto', () => {
    const r = AI.leerMarcas('Hecho.\n>> Uno | Dos\n>> Tres | Cuatro | Cinco');
    assert.deepStrictEqual(r.opciones, ['Uno', 'Dos', 'Tres', 'Cuatro']);
    assert.strictEqual(r.texto, 'Hecho.');
});

prueba('hace el presupuesto por el motor común: SU empresa, origen app, tarjeta y memoria; el «>>» no se ve', async () => {
    const r = await hablar({
        texto: 'Hazme uno a Juan Pérez López, 611222333, en Tomelloso: cambio de caldera de gasoil por una Panasonic de 9 kW, 9.000 más IVA',
        vueltas: [
            { herramientas: [{ name: 'hacer_presupuesto', input: { cliente: { nombre: 'Juan', apellidos: 'Pérez López', tlf: '611222333', municipio: 'Tomelloso' }, obra: { tipo: 'aerotermia', equipo: { marca: 'Panasonic', potencia_kw: 9 }, caldera: { combustible: 'gasoleo' } }, importe: 9000, con_iva: false } }] },
            { texto: 'Hecho: el 41/26 de Juan Pérez, 9.000 € + IVA.\n>> Calcular el bono | Envíamelo por WhatsApp' },
        ],
    });
    const c = r.d.llamadas.crear;
    assert.strictEqual(c.length, 1);
    assert.strictEqual(c[0].prescriptorId, RCA);
    assert.strictEqual(c[0].origen, 'app');
    assert.strictEqual(c[0].usuarioId, 7);
    assert.strictEqual(c[0].entrada.total, '9000');
    assert.strictEqual(c[0].entrada.con_iva, false);
    assert.ok(c[0].entrada.obra.extras.some(e => e.clave === 'retirada_caldera'), 'la retirada de la caldera, por defecto');
    const t = r.de('tarjeta')[0].tarjeta;
    assert.strictEqual(t.tipo, 'presupuesto');
    assert.strictEqual(t.presupuesto.numero, '41/26');
    assert.strictEqual(t.presupuesto.total, 10890);
    assert.strictEqual(r.de('memoria')[0].memoria.presupuesto.numero, '41/26');
    assert.deepStrictEqual(r.de('sugerencias')[0].opciones, ['Calcular el bono', 'Envíamelo por WhatsApp']);
    assert.ok(!r.texto.includes('>>'), r.texto);
    assert.match(r.texto, /41\/26/);
    assert.strictEqual(r.de('fin').length, 1);
});

prueba('sin decir el IVA, o sin precio, NO crea: devuelve lo que falta', async () => {
    const r = await hablar({
        vueltas: [
            { herramientas: [{ name: 'hacer_presupuesto', input: { cliente: { nombre: 'Juan', apellidos: 'Pérez', tlf: '611222333' }, obra: { tipo: 'aerotermia' }, importe: 9000 } }] },
            { herramientas: [{ name: 'hacer_presupuesto', input: { cliente: { nombre: 'Juan', apellidos: 'Pérez', tlf: '611222333' }, obra: { tipo: 'aerotermia' } } }] },
            { herramientas: [{ name: 'hacer_presupuesto', input: { obra: { tipo: 'aerotermia' }, importe: 9000, con_iva: true } }] },
            { texto: '¿Con IVA o más IVA?' },
        ],
    });
    assert.strictEqual(r.d.llamadas.crear.length, 0);
    assert.match(resultadoDe(r.m, 1).falta, /IVA/);
    assert.match(resultadoDe(r.m, 2).falta, /precio/);
    assert.match(resultadoDe(r.m, 3).falta, /cliente/);
});

prueba('varios clientes que se parecen: pregunta y recuerda los candidatos; luego con su cliente_id', async () => {
    const d = datos({ candidatos: [{ id: SUYO_CLI, nombre: 'JUAN PÉREZ', municipio: 'TOMELLOSO', tlf: '611222333' }, { id: OTRO_CLI, nombre: 'JUAN PÉREZ', municipio: 'SOCUÉLLAMOS', tlf: '622' }] });
    const r = await hablar({
        d, vueltas: [
            { herramientas: [{ name: 'hacer_presupuesto', input: { cliente: { nombre: 'Juan', apellidos: 'Pérez', tlf: '611999888' }, obra: { tipo: 'aerotermia' }, importe: 9000, con_iva: false } }] },
            { texto: '¿Cuál de los dos?\n>> El de Tomelloso | El de Socuéllamos | Es otro' },
        ],
    });
    assert.strictEqual(d.llamadas.crear.length, 0);
    assert.strictEqual(resultadoDe(r.m, 1).candidatos.length, 2);
    const mem = r.de('memoria')[0].memoria;
    assert.strictEqual(mem.candidatos.length, 2);
    // Siguiente turno: la memoria vuelve y el modelo la ve.
    const r2 = await hablar({
        d, texto: 'El de Tomelloso', memoria: mem,
        vueltas: [
            (msgs) => { assert.match(msgs.at(-1).content, /cliente_id bbbbbbbb/); return { herramientas: [{ name: 'hacer_presupuesto', input: { cliente_id: SUYO_CLI, obra: { tipo: 'aerotermia' }, importe: 9000, con_iva: false } }] }; },
            { texto: 'Hecho.' },
        ],
    });
    assert.strictEqual(d.llamadas.crear.length, 1);
    assert.strictEqual(d.llamadas.crear[0].entrada.cliente_id, SUYO_CLI);
    assert.strictEqual(r2.de('memoria').at(-1).memoria.candidatos, null, 'hecho el presupuesto, los candidatos se olvidan');
});

prueba('un cliente_id que NO es suyo: el servicio dice 404 y no se crea nada', async () => {
    const r = await hablar({
        vueltas: [
            { herramientas: [{ name: 'hacer_presupuesto', input: { cliente_id: OTRO_CLI, obra: { tipo: 'aerotermia' }, importe: 9000, con_iva: false } }] },
            { texto: 'No lo encuentro.' },
        ],
    });
    assert.strictEqual(r.d.llamadas.crear.length, 0);
    assert.match(resultadoDe(r.m, 1).error, /no encontrado/i);
});

prueba('cambiar: el MISMO nº, sus notas y su validez; solo el precio conserva los conceptos', async () => {
    const d = datos();
    const r = await hablar({
        d, texto: 'Ponle 9.500', memoria: { presupuesto: { id: SUYO_PRE, numero: '38/26', cliente: 'Juan' } },
        vueltas: [
            { herramientas: [{ name: 'cambiar_presupuesto', input: { id: SUYO_PRE, importe: 9500, con_iva: false } }] },
            { texto: 'Cambiado.' },
        ],
    });
    const a = d.llamadas.actualizar[0];
    assert.strictEqual(a.prescriptorId, RCA);
    assert.strictEqual(a.entrada.numero, '38/26');
    assert.strictEqual(a.entrada.fecha, '2026-11-20');
    assert.strictEqual(a.entrada.total, '9500');
    assert.strictEqual(a.entrada.notas, 'Mis notas');
    assert.strictEqual(a.entrada.validez_dias, 15);
    assert.ok(Array.isArray(a.entrada.conceptos) && a.entrada.conceptos.length, 'conserva el texto que tenía');
    assert.strictEqual(r.de('tarjeta')[0].tarjeta.actualizado, true);
    // Añadir un extra sí rehace los conceptos (como el WhatsApp).
    await hablar({
        d, vueltas: [{ herramientas: [{ name: 'cambiar_presupuesto', input: { id: SUYO_PRE, obra: { extras: [{ clave: 'deposito_inercia', litros: 50 }] } } }] }, { texto: 'Añadido.' }],
    });
    const b = d.llamadas.actualizar[1];
    assert.strictEqual(b.entrada.conceptos, undefined);
    assert.ok(b.entrada.obra.extras.some(e => e.clave === 'deposito_inercia'));
    assert.strictEqual(b.entrada.total, '9500', 'el precio que ya tenía');
});

prueba('cambiar uno AJENO: 404 y no se toca', async () => {
    const d = datos();
    const r = await hablar({ d, vueltas: [{ herramientas: [{ name: 'cambiar_presupuesto', input: { id: AJENO_PRE, importe: 1 } }] }, { texto: 'No.' }] });
    assert.strictEqual(d.llamadas.actualizar.length, 0);
    assert.match(resultadoDe(r.m, 1).error, /no encontrado/i);
});

prueba('ver una obra: tarjeta con lo que le toca y su botón; nunca cuentas ni teléfono', async () => {
    const r = await hablar({ vueltas: [{ herramientas: [{ name: 'ver_obra', input: { id: '26res060_180' } }] }, { texto: 'Te toca firmar.' }] });
    const t = r.de('tarjeta')[0].tarjeta;
    assert.strictEqual(t.tipo, 'obra');
    assert.strictEqual(t.obra.id, '26RES060_OP12');
    assert.deepStrictEqual(t.obra.tareas, [{ key: 'cifo', que: 'Firma el certificado de la instalación', accion: 'cifo', modo: null }]);
    assert.strictEqual(t.obra.te_toca.length, 1);
    const s = JSON.stringify(t) + JSON.stringify(resultadoDe(r.m, 1));
    assert.ok(!/600000000|margen|cuentas/.test(s), s);
});

prueba('buscar un equipo: solo de SU catálogo, con SU precio', async () => {
    const r = await hablar({ vueltas: [{ herramientas: [{ name: 'buscar_equipo', input: { texto: 'panasonic 9kw' } }] }, { texto: '4.200 €.' }] });
    const res = resultadoDe(r.m, 1);
    assert.strictEqual(res.total, 1);
    assert.strictEqual(res.equipos[0].tu_precio_sin_iva, 4200);
});

prueba('mis obras: filtra por nombre y «lo que me toca»', async () => {
    const r = await hablar({ vueltas: [{ herramientas: [{ name: 'mis_obras', input: { buscar: 'pilar' } }, { name: 'mis_obras', input: { solo_lo_que_me_toca: true } }] }, { texto: 'Vale.' }] });
    const res = r.m.llamadas[1].messages.at(-1).content.map(c => JSON.parse(c.content));
    assert.deepStrictEqual(res[0].obras.map(o => o.cliente), ['Pilar Nieto']);
    assert.deepStrictEqual(res[1].obras.map(o => o.id), ['26RES060_OP12']);
});

prueba('el tope diario de mensajes corta ANTES de llamar al modelo', async () => {
    AI._contadores.clear();
    const cfg = AI.config({ ASISTENTE_INSTALADOR_TOPE_DIA: '1' });
    await hablar({ cfg, vueltas: [{ texto: 'Hola.' }] });
    const r = await hablar({ cfg, vueltas: [{ texto: 'no debería' }] });
    assert.strictEqual(r.m.llamadas.length, 0);
    assert.match(r.de('error')[0].mensaje, /Hoy ya/);
    AI._contadores.clear();
});

prueba('el tope diario de presupuestos (el mismo número que el del grupo)', async () => {
    AI._contadores.clear();
    const cfg = AI.config({ PRESUPUESTO_WA_TOPE_DIA: '1' });
    const d = datos();
    const pide = { herramientas: [{ name: 'hacer_presupuesto', input: { cliente: { nombre: 'Juan', apellidos: 'Pérez', tlf: '611222333' }, obra: { tipo: 'aerotermia' }, importe: 9000, con_iva: false } }] };
    await hablar({ d, cfg, vueltas: [pide, { texto: 'Uno.' }] });
    const r = await hablar({ d, cfg, vueltas: [pide, { texto: 'Dos.' }] });
    assert.strictEqual(d.llamadas.crear.length, 1);
    assert.match(resultadoDe(r.m, 1).error, /Hoy ya llevas 1/);
    AI._contadores.clear();
});

prueba('sin clave de la API: lo dice y no revienta', async () => {
    const antes = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    const r = await hablar({ sinModelo: true });
    assert.match(r.de('error')[0].mensaje, /no está encendido/);
    if (antes) process.env.ANTHROPIC_API_KEY = antes;
});

prueba('el historial: solo texto, alternado, acaba en lo suyo', () => {
    const h = AI.limpiarHistorial([{ role: 'assistant', content: 'hola' }, { role: 'user', content: 'a' }, { role: 'user', content: 'b' }, { role: 'system', content: 'x' }]);
    assert.deepStrictEqual(h, [{ role: 'user', content: 'a\n\nb' }]);
    assert.throws(() => AI.limpiarHistorial([{ role: 'assistant', content: 'x' }]));
});

prueba('las instrucciones: nada de enviar, el precio lo dice él', () => {
    const s = AI.textoSistema({ nombre: 'Raúl', empresa: 'RCA', L });
    assert.match(s, /no envías nada/i);
    assert.match(s, /El precio lo dice ÉL/);
    assert.match(s, /deposito_inercia/);
    const nombres = AI.herramientas(L).map(h => h.name);
    assert.deepStrictEqual(nombres, ['mis_obras', 'ver_obra', 'buscar_equipo', 'mis_presupuestos', 'hacer_presupuesto', 'cambiar_presupuesto']);
    // Los botones son cosas que se le PIDEN; nunca lo que hace una tarjeta (mandar, calcular el bono).
    assert.match(s, /Nunca lo que ya hace un botón de una tarjeta/);
});

prueba('quién tiene el asistente: la beta, sin apagar y con la llave de la API (el MISMO criterio para /me y la ruta)', () => {
    const A = require('../utils/appInstalador');
    const u = { id_usuario: 'u1', prescriptor_id: 'EMP-1', rol_nombre: 'INSTALADOR' };
    const env = { APP_INSTALADOR_BETA: 'emp-1', ANTHROPIC_API_KEY: 'x' };
    assert.strictEqual(A.asistenteEncendido(u, env), true);
    assert.strictEqual(A.asistenteEncendido(u, { ...env, ASISTENTE_INSTALADOR_ENABLED: 'false' }), false);
    assert.strictEqual(A.asistenteEncendido(u, { ...env, ANTHROPIC_API_KEY: '' }), false);
    assert.strictEqual(A.asistenteEncendido(u, { ANTHROPIC_API_KEY: 'x' }), false, 'sin la beta, no');
    assert.strictEqual(A.asistenteEncendido({ ...u, rol_nombre: 'DISTRIBUIDOR' }, env), false);
    const ruta = fs.readFileSync(path.join(__dirname, '../routes/instaladorApp.js'), 'utf8');
    assert.match(ruta, /A\.asistenteEncendido\(req\.user\)/);
    const me = fs.readFileSync(path.join(__dirname, '../routes/usuarios.js'), 'utf8');
    assert.match(me, /asistente_instalador: AIN\.asistenteEncendido\(req\.user\)/);
});

(async () => {
    L = await M.logica();
    for (const p of pruebas) {
        try { await p.fn(); pasadas += 1; console.log(`  ✓ ${p.nombre}`); }
        catch (e) { console.log(`  ✗ ${p.nombre}\n    ${e.stack.split('\n').slice(0, 3).join('\n    ')}`); }
    }
    console.log(`\n${pasadas}/${pruebas.length} pruebas bien.`);
    process.exit(pasadas === pruebas.length ? 0 : 1);
})();
