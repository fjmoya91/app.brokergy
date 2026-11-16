// =============================================================================
// contestador_consultas.js — lo que puede MIRAR el INVESTIGADOR del contestador
// de WhatsApp antes de contestar (16/11/2026).
//
// Fran (16/11/2026): «hay WhatsApp que contestas a los clientes como "Recibido, lo
// miro y te digo" y eso no me gusta porque no da contestación. Quiero que seas lo
// más autónomo posible». Lo que el cerebro rápido (sin herramientas) escala, antes
// de llegar a Fran pasa por un `claude -p` CON herramientas que investiga y
// contesta (scripts/contestador_claude.js `investigar`). Este script es su ÚNICA
// puerta a la base de datos: el Bash del investigador solo puede ejecutar esto.
//
// REGLA — de SOLO LECTURA por construcción: el candado (utils/candadoBd.js) se pone
// ANTES de cargar nada, así que ningún `insert/update/upsert/delete/rpc` sale del
// proceso, aunque una consulta lo intentara.
//
//   node scripts/contestador_consultas.js buscar <número o nombre>
//   node scripts/contestador_consultas.js expediente <26RES060_208>
//   node scripts/contestador_consultas.js oportunidad <26RES060_OP376>
//   node scripts/contestador_consultas.js cee <2026CEE_58>
//   node scripts/contestador_consultas.js manual <palabras>        (docs/conocimiento)
//   node scripts/contestador_consultas.js consultas                (fichas ya contestadas de normativa, IRPF…)
//
// Devuelve JSON por la salida estándar, recortado. Los `enlace` que salen son de la
// APP (para el equipo): al cliente no se le escribe ninguno (el contestador quita las
// direcciones que escribe el modelo y solo pone las de sus MARCAS).
// =============================================================================

const path = require('path');
const fs = require('fs');
process.env.DOTENV_CONFIG_QUIET = 'true';   // la salida es JSON: nada de avisos de dotenv delante
require(path.join(__dirname, '../node_modules/dotenv')).config({ path: path.join(__dirname, '../.env'), quiet: true });

const bloqueadas = require('../utils/candadoBd').candado();
const supabase = require('../services/supabaseClient');

const MAX_SALIDA = 14_000;
const recorta = (s, n) => { const t = String(s ?? ''); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const redondeo = (v) => (Number.isFinite(Number(v)) && Number(v) ? Math.round(Number(v)) : null);
const norm = (s) => String(s || '').trim().toUpperCase().replace(/\s+/g, '').replace(/-/g, '_');
const DIR_CONSULTAS = path.join(process.env.CONOCIMIENTO_DIR || path.join(__dirname, '..', '..', '..', 'docs', 'conocimiento'), 'consultas');

function herramienta(nombre) {
    const h = require('../services/asistenteApp').HERRAMIENTAS.find(x => x.name === nombre);
    if (!h) throw new Error(`no hay herramienta ${nombre}`);
    return h;
}

/**
 * Lo que dice la SIMULACIÓN de una oportunidad, en claro. Pura (se prueba sin red).
 * Las cifras son las que lleva la PROPUESTA al cliente (ProposalModal): el «Bono
 * Energético» es `financials.caeBonus`, la deducción del IRPF `irpfDeduction` y el
 * total `totalAyuda`. Redondeadas: son una ESTIMACIÓN hasta el CEE final.
 */
function resumenSimulacion(dc) {
    const r = dc?.result || {};
    const f = r.financials || {};
    const i = dc?.inputs || {};
    const fRes080 = r.financialsRes080 || null;
    return {
        bono_energetico_estimado: redondeo(f.caeBonus),
        deduccion_irpf_estimada: redondeo(f.irpfDeduction),
        total_ayudas_estimado: redondeo(f.totalAyuda),
        presupuesto_considerado: redondeo(f.presupuestoTotal ?? f.presupuesto ?? i.presupuesto),
        presupuesto_es_estimado: !!i.presupuestoEstimado,
        incluye_irpf_en_la_propuesta: i.includeIrpf !== false,
        ahorro_anual_estimado_eur: redondeo(r.annualSavings?.ahorroAnual),
        ...(fRes080 ? { reforma_res080: { bono: redondeo(fRes080.caeBonus), irpf: redondeo(fRes080.irpfDeduction), total: redondeo(fRes080.totalAyuda) } } : {}),
        nota: 'Cifras de la simulación (las mismas que lleva la propuesta). Son estimaciones: el importe final sale del certificado energético final.',
    };
}

async function oportunidad(id) {
    const s = norm(id);
    const { data: o, error } = await supabase.from('oportunidades')
        .select('id_oportunidad, estado, ficha, prescriptor, referencia_cliente, created_at, updated_at, is_reforma, hibridacion, cliente_id, '
            + 'inputs:datos_calculo->inputs, result:datos_calculo->result, historial:datos_calculo->historial, timeline:datos_calculo->timeline, '
            + 'uploads:datos_calculo->reforma_uploads, origen:datos_calculo->origen')
        // «264» → …OP264; «26RES060_OP264», «OP264» o una migrada («MIG-mq294rt3-qykmw»: sin OP,
        // 16/11/2026 se daba por inexistente), tal cual y sin mirar mayúsculas.
        .ilike('id_oportunidad', /^\d+$/.test(s) ? `%OP${s}` : `%${s}`)
        .limit(3);
    if (error) throw new Error(error.message);
    if (!o?.length) return { error: `No hay ninguna oportunidad ${s}.` };
    const op = o.find(x => x.id_oportunidad.toUpperCase() === s.toUpperCase()) || o[0];
    const i = op.inputs || {};
    const { data: exp } = await supabase.from('expedientes').select('numero_expediente, estado').eq('id_oportunidad_ref', op.id_oportunidad).limit(1);
    const hist = Array.isArray(op.historial) ? op.historial : [];
    const tl = Array.isArray(op.timeline) ? op.timeline : [];
    const subidos = op.uploads && typeof op.uploads === 'object'
        ? Object.entries(op.uploads).filter(([, v]) => (Array.isArray(v) ? v.length : !!v)).map(([k, v]) => `${k}${Array.isArray(v) ? ` (${v.length})` : ''}`)
        : [];
    return {
        oportunidad: op.id_oportunidad,
        estado: op.estado,
        propuesta: ['ENVIADA', 'PRE-ACEPTADO', 'ACEPTADA'].includes(op.estado) ? 'ENVIADA al cliente' : (op.estado === 'PTE ENVIAR' ? 'preparada, AÚN NO se le ha enviado' : op.estado),
        expediente: exp?.[0] ? `${exp[0].numero_expediente} (${exp[0].estado})` : null,
        ficha: op.ficha, reforma: !!op.is_reforma, hibridacion: !!op.hibridacion,
        partner: op.prescriptor || null,
        cliente: op.referencia_cliente || null,
        alta: op.created_at, ultimo_cambio: op.updated_at,
        vivienda: {
            direccion: i.direccion || null, municipio: i.municipio || null, provincia: i.provincia || null,
            superficie: i.superficie || null, anio: i.anio || null,
            caldera_actual: [i.fuelType, i.boilerHeatingType].filter(Boolean).join(' · ') || null,
            emisor: i.emitterType || null,
            aerotermia: [i.aerothermiaModel, i.customModelName].filter(Boolean).join(' · ') || null,
            titulares: i.numOwners || null,
        },
        simulacion: resumenSimulacion({ inputs: i, result: op.result }),
        documentos_subidos: subidos.slice(0, 30),
        ultimo_historial: hist.slice(-6).map(h => recorta(typeof h === 'string' ? h : JSON.stringify(h), 240)),
        ultimos_hitos: tl.slice(-6).map(h => recorta(typeof h === 'string' ? h : JSON.stringify(h), 200)),
    };
}

async function ceeDirecto(numero) {
    const s = norm(numero);
    const { data, error } = await supabase.from('cee_directos')
        .select('numero_expediente, nombre, alcance, municipio, provincia, direccion, estado, cobrado, created_at, updated_at, notas, seguimiento, origen, '
            + 'ficheros:cee->cee_files, visita_inicial:cee->fecha_visita_cee_inicial, firma_inicial:cee->fecha_firma_cee_inicial')
        .ilike('numero_expediente', /^\d+$/.test(s) ? `%_${s}` : `%${s}%`).limit(3);
    if (error) throw new Error(error.message);
    if (!data?.length) return { error: `No hay ningún CEE directo ${s}.` };
    const c = data.find(x => x.numero_expediente === s) || data[0];
    const corto = (v) => (v == null ? null : recorta(typeof v === 'string' ? v : JSON.stringify(v), 1500));
    // Qué ficheros del CEE hay ya (sin los enlaces de Drive: no son para el cliente).
    const hay = (fase) => Object.entries(c.ficheros?.[fase] || {}).filter(([, v]) => (Array.isArray(v) ? v.length : !!v)).map(([k]) => k);
    return {
        cee_directo: c.numero_expediente, cliente: c.nombre, alcance: c.alcance, estado: c.estado,
        vivienda: [c.direccion, c.municipio, c.provincia].filter(Boolean).join(', '),
        cobrado: !!c.cobrado, alta: c.created_at, ultimo_cambio: c.updated_at, origen: c.origen || null,
        notas: corto(c.notas), seguimiento: corto(c.seguimiento),
        cee_inicial: { visita: c.visita_inicial || null, firma: c.firma_inicial || null, ficheros: hay('inicial') },
        cee_final: { ficheros: hay('final') },
        nota: 'Un CEE directo es un certificado suelto (no un expediente de ayudas CAE). Lo que pide cada uno: docs/conocimiento/cee-directos/.',
    };
}

function consultas() {
    let ficheros = [];
    try { ficheros = fs.readdirSync(DIR_CONSULTAS).filter(f => f.endsWith('.md')); } catch { return { error: 'La carpeta de consultas no está en este servidor.' }; }
    return {
        carpeta: DIR_CONSULTAS,
        fichas: ficheros.map((f) => {
            const t = fs.readFileSync(path.join(DIR_CONSULTAS, f), 'utf8');
            const titulo = (t.match(/^#{1,2}\s+(.+)$/m) || [])[1] || f;
            return { fichero: f, titulo: recorta(titulo, 200) };
        }),
        como: 'Lee con Read la ficha que encaje (ruta completa = carpeta + fichero) y contesta con lo que diga. Si ninguna encaja, es de Fran.',
    };
}

async function main() {
    const [orden, ...resto] = process.argv.slice(2);
    const arg = resto.join(' ').trim();
    let r;
    if (orden === 'buscar' && arg) r = await herramienta('buscar').run({ texto: arg });
    else if (orden === 'expediente' && arg) r = await herramienta('estado_expediente').run({ numero: arg });
    else if (orden === 'oportunidad' && arg) r = await oportunidad(arg);
    else if (orden === 'cee' && arg) r = await ceeDirecto(arg);
    else if (orden === 'manual' && arg) r = require('../services/asistenteApp').buscarEnManual(arg);
    else if (orden === 'consultas') r = consultas();
    else r = { error: 'Uso: buscar <texto> · expediente <nº> · oportunidad <OP> · cee <nº> · manual <palabras> · consultas' };
    if (bloqueadas.length) r = { ...r, _aviso: `intentó escribir y no se le ha dejado: ${bloqueadas.join(', ')}` };
    const s = JSON.stringify(r, null, 1);
    process.stdout.write(s.length > MAX_SALIDA ? `${s.slice(0, MAX_SALIDA)}\n[… recortado]` : s);
    process.stdout.write('\n');
}

if (require.main === module) {
    // Sin process.exit: en Windows corta a medias las conexiones que se cierran (assert de libuv).
    main().catch((e) => { process.stdout.write(`${JSON.stringify({ error: e.message })}\n`); process.exitCode = 1; });
}

module.exports = { resumenSimulacion };
