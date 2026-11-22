// =============================================================================
// probar_presupuesto_wa.js — BANCO MANUAL del agente de presupuestos del grupo de
// WhatsApp del instalador, con el CEREBRO REAL y sin escribir nada en producción.
//
//   node scripts/probar_presupuesto_wa.js "mensaje 1" "mensaje 2" … \
//        --env C:\Proyectos\app.brokergy\implementation\backend\.env \
//        --instalador 113a5765-84fb-4012-a17c-1a275aec530c \
//        [--out <carpeta para los PDF>] [--catastro] [--cerebro auto|api|oauth|local]
//
// Cada argumento es UN turno del instalador (un mensaje, o el texto de un audio). Imprime,
// turno a turno, lo que ha entendido el cerebro (JSON) y lo que habría mandado al grupo.
//
// Lo que NO hace, por construcción:
//  - no envía ningún WhatsApp (el envío es la consola) ni encarga nada al asistente;
//  - la conversación (`instalador_wa_pedidos`) va EN MEMORIA;
//  - el servicio de presupuestos va «sin guardar»: el cliente tal cual (no se busca ni se da
//    de alta), el presupuesto calculado con la lógica de la app sin gastar número, y el PDF
//    compuesto por el servicio real si existe (solo LEE la plantilla y la ficha del
//    instalador) a `--out`; si el servicio aún no existe, un PDF simulado;
//  - con `--catastro` consulta Google y el Catastro DE VERDAD (solo lectura, en serie) y mira
//    en la BD si la vivienda ya tiene oportunidad (solo lectura); sin él, una vivienda
//    inventada a partir de la dirección.
// Lo único que GASTA es el modelo (API: céntimos por turno; oauth/local: la suscripción).
// =============================================================================
'use strict';

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const opcion = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const bandera = (n) => args.includes(n);
const CON_VALOR = new Set(['--env', '--instalador', '--out', '--cerebro', '--autor']);
const mensajes = args.filter((a, i) => !a.startsWith('--') && !CON_VALOR.has(args[i - 1]));

const envPath = opcion('--env');
if (envPath) {
    if (!fs.existsSync(envPath)) { console.error(`No existe ${envPath}`); process.exit(1); }
    require('dotenv').config({ path: envPath });
}
// Pase lo que pase en ese .env: este banco no escribe al grupo ni guarda (ver arriba).
process.env.PRESUPUESTO_WA_ENABLED = 'true';
if (opcion('--cerebro')) process.env.PRESUPUESTO_WA_CEREBRO = opcion('--cerebro');

const instalador = opcion('--instalador');
if (!instalador || !mensajes.length) {
    console.error('Uso: node scripts/probar_presupuesto_wa.js "mensaje 1" ["mensaje 2" …] --env <.env> --instalador <id_empresa> [--out <carpeta>] [--catastro] [--cerebro auto|api|oauth|local]');
    process.exit(1);
}
const out = path.resolve(opcion('--out') || path.join(__dirname, '..', 'scratch', 'probar_presupuesto_wa'));
const conCatastro = bandera('--catastro');
const GRUPO = 'banco@g.us';
const AUTOR = String(opcion('--autor') || '600000000');

const A = require('../services/presupuestoGrupoWhatsapp');
const Cerebro = require('../services/presupuestoPedidoCerebro');
const V = require('../services/viviendaCandidata');
const horario = require('../utils/horarioWhatsapp');

const cita = (t) => String(t || '').split('\n').map(l => `    │ ${l}`).join('\n');

(async () => {
    const L = await A.logica();
    let real = null;
    try { real = require('../services/presupuestoInstaladorService'); } catch (e) {
        console.log(`(el servicio de presupuestos aún no está: ${e.message.split('\n')[0]}; el PDF será simulado)`);
    }
    fs.mkdirSync(out, { recursive: true });

    const filas = [];
    let n = 0;
    const cfg = A.config({ PRESUPUESTO_WA_ENABLED: 'true', PRESUPUESTO_WA_GRUPOS: `${GRUPO}=${instalador}`, PRESUPUESTO_WA_MODO: 'real' });
    const viviendaFalsa = {
        async candidatos(q) {
            const nCalle = (/(\d{1,4})/.exec(String(q.direccion || '')) || [])[1] || '1';
            return { tipo: 'una', rcFachada: null, vivienda: { rc: `0000000XX000${nCalle.padStart(1, '0')}N0001ZZ`.slice(0, 20), direccion: String(q.direccion || '').toUpperCase(), municipio: q.municipio || null, superficie: 120, anio: 1980 } };
        },
        async porRc(rc) { return { tipo: 'una', rcFachada: null, vivienda: { rc, direccion: '(dirección de esa RC)', municipio: null, superficie: 100, anio: 1985 } }; },
        async fachada() { return null; },
        describir: V.describir,
        cambiarNumero: V.cambiarNumero,
    };
    const deps = {
        cfg,
        logica: L,
        vistos: new Set(),
        autorizado: async () => true,
        cerebro: Cerebro,
        presupuestos: A.servicioSinGuardar(real, L, { pdfSimulado: !real }),
        vivienda: conCatastro ? V : viviendaFalsa,
        oportunidadesDeLaRc: conCatastro
            ? (rc) => require('../utils/altaOportunidad').oportunidadesDeLaRc(require('../services/supabaseClient'), rc)
            : async () => [],
        pedirTarea: async ({ texto, clave }) => {
            console.log(`  ▸ ENCARGARÍA al asistente (${clave}) — NO se manda:\n${cita(texto)}`);
            return { ok: false, motivo: 'banco: no se encarga' };
        },
        enviar: {
            texto: async (c, t) => console.log(`  ▸ AL GRUPO (texto):\n${cita(t)}`),
            documento: async (c, f, o) => {
                const ruta = path.join(out, f.filename);
                fs.writeFileSync(ruta, f.buffer);
                console.log(`  ▸ AL GRUPO (PDF ${f.filename} → ${ruta}), con pie:\n${cita(o.caption)}`);
                if (o.textoDespues) console.log(`  ▸ AL GRUPO (burbuja):\n${cita(o.textoDespues)}`);
            },
            imagen: async (c, f, o) => {
                const ruta = path.join(out, f.filename);
                fs.writeFileSync(ruta, f.buffer);
                console.log(`  ▸ AL GRUPO (foto ${ruta}), con pie:\n${cita(o.caption)}`);
            },
        },
        copiar: null,
        avisarEquipo: async (t) => console.log(`  ▸ AVISO AL EQUIPO (no se manda):\n${cita(t)}`),
        pedidos: {
            async abierto(chat, autor) { return filas.filter(f => f.chat_id === chat && f.autor === autor && f.estado === 'ABIERTO').slice(-1)[0] || null; },
            async crear(f) { const r = { created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...f, id: `banco-${++n}` }; filas.push(r); return r; },
            async guardar(id, c) { Object.assign(filas.find(x => x.id === id), JSON.parse(JSON.stringify(c))); },
            async presupuestosHoy() { return 0; },
        },
    };

    // Fuera de la franja de la casa el motor PROGRAMA; en el banco se hace como si fueran las 12.
    let ahora = new Date();
    if (!horario.puedeContestar(ahora)) ahora = new Date(horario.siguienteApertura(ahora).getTime() + 5 * 3_600_000);

    console.log(`Banco del agente de presupuestos · instalador ${instalador} · cerebro ${Cerebro.proveedor()} · Catastro ${conCatastro ? 'REAL (solo lectura)' : 'simulado'} · PDF en ${out}\n`);
    for (let i = 0; i < mensajes.length; i++) {
        console.log(`── Turno ${i + 1} ─────────────────────────────────────────`);
        console.log(`  ◂ INSTALADOR:\n${cita(mensajes[i])}`);
        const t0 = Date.now();
        // eslint-disable-next-line no-await-in-loop
        const r = await A.procesar({ chatId: GRUPO, autorTel: AUTOR, mensajes: [{ id: `banco-msg-${i + 1}`, texto: mensajes[i] }], ahora: new Date(ahora.getTime() + i * 60_000), deps });
        if (r.extraccion) console.log(`  ▸ EL CEREBRO HA ENTENDIDO (${((Date.now() - t0) / 1000).toFixed(1)} s):\n${cita(JSON.stringify(r.extraccion, null, 2))}`);
        const fila = filas.slice(-1)[0];
        console.log(`  = ${r.ignorado ? `ignorado: ${r.ignorado}` : r.fallo ? `FALLO: ${r.fallo}` : `pedido ${fila?.estado || '—'}${fila?.espera ? `, espera «${fila.espera}»` : ''}`}\n`);
    }
})().catch((e) => { console.error(e); process.exitCode = 1; });
