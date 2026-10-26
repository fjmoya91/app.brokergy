// Lo que el Claude del WhatsApp (VPS) NO puede hacer y el PC de Fran SÍ: PRESENTAR un CEE en la
// sede de la JCCM. En el servidor no hay CE3X (calificar), ni su certificado (firmar), ni su Chrome
// con AutoFirma y la tarjeta (la sede). Así que, cuando Fran contesta «preséntalo» en el grupo:
//
//   EN EL VPS (lo usa el Claude del WhatsApp, ver asistente_instrucciones.md):
//   node scripts/asistente_pc.js presentar <nº> [--fase final] [--enviar]   le hace LA pregunta del pago
//   node scripts/asistente_pc.js confirmar <nº> --texto "<su respuesta>" [--enviar]   con su «sí»: a la cola
//   node scripts/asistente_pc.js cancelar <nº> [--enviar]                   quita lo que no haya empezado
//   node scripts/asistente_pc.js ce3x <nº> --trabajo cee_final|calificar [--fase final] [--fecha AAAA-MM-DD]
//        [--texto "lo que ha decidido Fran"] [--enviar]                     un trabajo que NECESITA CE3X
//   node scripts/asistente_pc.js probar [--enviar]                          encargo de PRUEBA (no paga nada)
//   node scripts/asistente_pc.js noche [--enviar]                           LA ronda de las 21:00: una pregunta
//        para TODOS los CEE de la casa con visto bueno y sin registrar (la lanza el vigilante)
//   node scripts/asistente_pc.js confirmar --lote --texto "<su respuesta>" [--excepto 207,186] [--enviar]
//   node scripts/asistente_pc.js cancelar --lote [--enviar]
//   node scripts/asistente_pc.js cola                                       qué hay y si el PC está vivo
//
//   EN EL PC (tarea programada «Brokergy Trabajos PC», cada 2 min, ver tools/windows/pc_trabajos.vbs):
//   node scripts/asistente_pc.js vuelta [--seco]                            latido + recoge y lanza
//   node scripts/asistente_pc.js estado                                     lo de aquí y lo de allí
//
// - La cola vive en el VPS (scratch/asistente/, fuera de git); el PC la lee y la escribe por ssh, como
//   la memoria del asistente (asistente_memoria.js). Nada de esto toca la BD.
// - UNA pregunta y al principio (skill presentar-cee, 1b): expediente, titular, tasa y tarjeta. El «sí»
//   de Fran (su mensaje literal, que el vigilante solo deja pasar si el AUTOR es él) viaja con el
//   encargo y es la autorización de FIRMAR y de PAGAR esa tasa para ese expediente. Sin ella no hay
//   encargo: `confirmar` exige la pregunta hecha (24 h como mucho).
// - En el PC trabaja Claude Code SIN PANTALLA (`claude -p --chrome`): medido el 19/10/2026, se
//   identifica en la sede con AutoFirma (el vigilante acepta la ventana NSS) y maneja Chrome solo. Pide
//   el PC ENCENDIDO y DESBLOQUEADO; bloqueado o suspendido, el encargo espera y se le dice a Fran.
// - El mensaje FINAL lo manda este script con la respuesta del trabajo: si Claude se corta, Fran se
//   entera igual. Un encargo que falla NO se reintenta solo (podría haber un pago hecho).
// - TRABAJOS CON CE3X (2026-10-22): el CEE final (dos calificaciones con CE3X para el autoconsumo mes
//   a mes) o calificar un .cex. El Claude del WhatsApp se paraba ahí («en tu PC sería…»); ahora los
//   deja en la MISMA cola. No pagan ni firman nada, así que no llevan pregunta: llevan lo que Fran ya
//   ha decidido. Y en el PC van SIN Chrome: solo scripts, ni la sede ni la tarjeta a su alcance.
// - LA RONDA DE LAS 21:00 (2026-10-26, decisión de Fran): en vez de un «preséntalo» por CEE, una sola
//   pregunta con la lista entera (tasa × n = total). Su «sí» encola cada CEE como un encargo propio
//   (la misma pregunta y la misma respuesta en todos), uno detrás de otro; cada uno avisa antes de su
//   pago (el 3DS) y al acabar, y al terminar el último llega el informe del lote. Si uno falla, los que
//   quedan NO se empiezan (vuelven a la lista de mañana). Sin respuesta no se paga nada y la pregunta
//   se repite la noche siguiente.
// - CALIFICAR UNA OBRA DE LA APP DE CERTIFICADORES (`calificar_ext`, 2026-10-25): lo que el servidor
//   deja «por calificar» (el agente o la ventana de la envolvente) llega SOLO a la cola por el
//   vigilante (`/pc-calificar` → `encolarCalificarExt`). Es un trabajo FIJO: sin Claude, se lanza
//   `cee_inicial.js calificar <nº> --escribir` (con el motor levantado), que al acabar llama a
//   producción para el aviso de «listo para revisar». EN SILENCIO: a Fran solo se le escribe si
//   falla («no quiero que me vaya actualizando el proceso», 25/10/2026).
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, execFileSync } = require('child_process');
require(path.join(__dirname, '../node_modules/dotenv')).config({ path: path.join(__dirname, '../.env') });

const [, , ORDEN, ...RESTO] = process.argv;
const bandera = n => RESTO.includes(`--${n}`);
function opt(n) {
    const i = RESTO.indexOf(`--${n}`);
    return i >= 0 && RESTO[i + 1] && !RESTO[i + 1].startsWith('--') ? RESTO[i + 1] : null;
}
const POS = RESTO.filter((a, i) => !a.startsWith('--') && !(i > 0 && RESTO[i - 1].startsWith('--') && !['--enviar', '--seco'].includes(RESTO[i - 1])));

// ─── Dónde ────────────────────────────────────────────────────────────────────
// ASISTENTE_COLA_DIR / PC_TRABAJOS_DIR: solo para las pruebas (test_presentar_noche.js), una cola de usar y tirar.
const DIR = process.env.ASISTENTE_COLA_DIR || path.join(__dirname, '..', 'scratch', 'asistente');   // en el VPS: la cola
const VPS = process.env.ASISTENTE_VPS || 'root@187.77.93.213';
const DIR_REMOTO = process.env.ASISTENTE_DIR_VPS || '/opt/brokergy/implementation/backend/scratch/asistente';
const F = { pendiente: 'presentar_pendiente.json', cola: 'tareas_pc.json', latido: 'pc_latido.json' };
const DIR_PC = process.env.PC_TRABAJOS_DIR || path.join(__dirname, '..', 'scratch', 'pc_trabajos');   // en el PC: el trabajo en curso
const REPO = path.join(__dirname, '..', '..', '..');
const BACKEND = path.join(__dirname, '..');

// El navegador de la cuenta en el que se trabaja: el perfil «BROKERGY» de Chrome (el de la tarjeta).
// Hay dos conectados (perfiles «BROKERGY» y «Francisco Javier»); sin nadie delante hay que elegir.
const CHROME_DEVICE = process.env.PC_CHROME_DEVICE || '591f5db2-ac10-4d5a-858e-89206f5b553a';
const CHROME_PERFIL = process.env.PC_CHROME_PERFIL || 'Profile 1';
const TASA = process.env.PRESENTAR_TASA || '16,39';
const TARJETA = process.env.PRESENTAR_TARJETA || 'la tarjeta guardada en Chrome';
const MAX_MIN = Number(process.env.PC_TRABAJO_MAX_MIN) || 120;
const LATIDO_VIVO_S = 5 * 60;

const ahora = () => Math.floor(Date.now() / 1000);
const hora = t => new Date(t * 1000).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const log = (...a) => console.log(`${new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}`, ...a);
const norm = s => String(s || '').trim().toUpperCase().replace(/\s+/g, '').replace(/-/g, '_');

// ─── Leer y escribir la cola: en el VPS directo; desde el PC, por ssh ────────
// El VPS es Linux (contenedor «asistente», repo en /repo); el PC de Fran, Windows. Mirar si existe
// scratch/asistente/ no vale: el PC lo tiene del vigilante que corría aquí antes.
const enElVps = () => !!process.env.ASISTENTE_COLA_DIR || process.platform !== 'win32';
function ssh(cmd, entrada = null) {
    return execFileSync('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', VPS, cmd],
        { input: entrada, maxBuffer: 16 * 1024 * 1024, windowsHide: true }).toString();
}
function leer(clave) {
    try {
        const txt = enElVps()
            ? fs.readFileSync(path.join(DIR, F[clave]), 'utf8')
            : ssh(`cat ${DIR_REMOTO}/${F[clave]} 2>/dev/null || true`);
        return txt.trim() ? JSON.parse(txt) : null;
    } catch (e) {
        if (e.code === 'ENOENT') return null;
        throw e;
    }
}
function escribir(clave, datos) {
    const txt = `${JSON.stringify(datos, null, 1)}\n`;
    if (enElVps()) {
        const f = path.join(DIR, F[clave]);
        fs.writeFileSync(`${f}.tmp`, txt);
        fs.renameSync(`${f}.tmp`, f);
        return;
    }
    ssh(`cat > ${DIR_REMOTO}/${F[clave]}.tmp && mv ${DIR_REMOTO}/${F[clave]}.tmp ${DIR_REMOTO}/${F[clave]}`, txt);
}
const cola = () => leer('cola') || [];

function estadoPc() {
    const l = leer('latido');
    if (!l) return { vivo: false, texto: 'tu PC no ha dado señales todavía (¿está instalada la tarea programada?)' };
    const hace = ahora() - l.at;
    if (hace > LATIDO_VIVO_S) return { vivo: false, texto: `tu PC no responde desde las ${hora(l.at).split(', ')[1]} del ${hora(l.at).split(', ')[0]} (apagado, suspendido o sin red): lo hará en cuanto lo enciendas` };
    if (l.bloqueado) return { vivo: false, texto: 'tu PC está BLOQUEADO: lo hará en cuanto lo desbloquees' };
    if (l.trabajando) return { vivo: true, texto: `tu PC está con otro encargo (${l.trabajando}): este va después` };
    return { vivo: true, texto: 'tu PC está encendido: empieza en un par de minutos' };
}

async function decir(texto) {
    if (!bandera('enviar')) { console.log(`\n[EN SECO] Le diría a Fran:\n${texto}\n`); return; }
    const r = await require('./asistente_whatsapp').mandarOGuardar(texto);
    console.log(r.enviado ? `Enviado a Fran:\n${texto}` : `WhatsApp caído: guardado en el buzón, saldrá en cuanto vuelva:\n${texto}`);
}

// LA pregunta del pago: la misma por WhatsApp («preséntalo») y en la tarjeta del asistente de la app.
const preguntaPresentar = c => `¿Presento el CEE ${c.fase} de *${c.numero}* (${c.titular})? Lo doy por bueno, en tu PC lo califico en CE3X, lo firmo y pago la tasa de *${TASA} €* con ${TARJETA}. Tú solo tendrás que autorizar el pago en la app del banco.`;

/**
 * Mete en la cola del PC una presentación YA CONFIRMADA (la usan `confirmar` y el «Presentar» de la
 * app, por el vigilante). Si ya hay una igual pendiente o en marcha, no la duplica.
 */
function encolarPresentacion(d) {
    if (!d.numero || !d.fase || !d.pregunta || !d.respuesta) throw new Error('Faltan datos del encargo (número, fase, pregunta o respuesta).');
    const lista = cola();
    const pc = estadoPc();
    const ya = lista.find(t => t.numero === d.numero && t.fase === d.fase && ['pendiente', 'en_curso'].includes(t.estado));
    if (ya) return { ok: true, duplicado: true, tarea: ya, pc };
    const tarea = {
        id: `pres-${d.numero}-${d.fase}-${ahora()}`, tipo: 'presentar', numero: d.numero, fase: d.fase,
        titular: d.titular || null, importe: d.importe || TASA, tarjeta: d.tarjeta || TARJETA,
        pregunta: d.pregunta, pregunta_at: d.pregunta_at || ahora(), respuesta: String(d.respuesta).slice(0, 500),
        confirmado_at: ahora(), origen: d.origen || 'whatsapp', estado: 'pendiente', creado_at: ahora(),
        ...(d.lote ? { lote: d.lote, lote_n: d.lote_n } : {}),
    };
    escribir('cola', [...lista.filter(t => ahora() - (t.creado_at || 0) < 30 * 86400), tarea]);
    escribir('pendiente', (leer('pendiente') || []).filter(x => !(x.numero === d.numero && x.fase === d.fase)));
    return { ok: true, tarea, pc };
}

/**
 * Mete en la cola del PC la calificación de una OBRA de la app de certificadores (la usan el
 * vigilante, por `/pc-calificar`, y `ce3x <nº> --trabajo calificar` con un nº EXT). Sin mensaje a
 * nadie. Si ya hay una igual pendiente o en marcha, no la duplica.
 */
function encolarCalificarExt({ numero, obraId = null } = {}) {
    const n = norm(numero);
    if (!/^\d{4}EXT_\d+$/.test(n)) throw new Error(`«${numero}» no es el número de una obra de la app de certificadores.`);
    const lista = cola();
    const ya = lista.find(t => t.tipo === 'calificar_ext' && t.numero === n && ['pendiente', 'en_curso'].includes(t.estado));
    if (ya) return { ok: true, duplicado: true, tarea: ya };
    const tarea = { id: `calext-${n}-${ahora()}`, tipo: 'calificar_ext', numero: n, obra_id: obraId || null,
        fase: 'inicial', origen: 'app', estado: 'pendiente', creado_at: ahora() };
    escribir('cola', [...lista.filter(t => ahora() - (t.creado_at || 0) < 30 * 86400), tarea]);
    return { ok: true, tarea };
}

// ─── El CEE que se quiere presentar ───────────────────────────────────────────
async function localizarCee(numero, faseOpt) {
    const { createClient } = require(path.join(__dirname, '../node_modules/@supabase/supabase-js'));
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const n = norm(numero);
    const directo = /CEE_?\d+$/.test(n);
    const tabla = directo ? 'cee_directos' : 'expedientes';
    const sel = directo ? 'id, numero_expediente, nombre, seguimiento, agente:cee->agente_ia'
        : 'id, numero_expediente, cliente_id, seguimiento, agente:cee->agente_ia';
    const { data, error } = await sb.from(tabla).select(sel).ilike('numero_expediente', `%${n.replace(/CEE_?/, 'CEE_')}`).limit(5);
    if (error) throw new Error(error.message);
    const filas = (data || []).filter(r => norm(r.numero_expediente).endsWith(n.replace(/CEE_?/, 'CEE_')));
    if (filas.length !== 1) throw new Error(filas.length ? `Hay varios «${numero}»: dime el número completo.` : `No encuentro «${numero}».`);
    const r = filas[0];
    const seg = r.seguimiento || {};
    // La fase: la que se diga; si no, la primera que no esté registrada.
    const fase = faseOpt || (String(seg.cee_inicial || '').toUpperCase() !== 'REGISTRADO' ? 'inicial' : 'final');
    const sub = String(seg[`cee_${fase}`] || '').toUpperCase();
    if (sub === 'REGISTRADO') throw new Error(`El CEE ${fase} de ${r.numero_expediente} ya está REGISTRADO: presentarlo otra vez sería pagar dos tasas.`);
    if (r.agente?.[fase]?.estado === 'trabajando') throw new Error(`El CEE ${fase} de ${r.numero_expediente} todavía lo está preparando el Agente IA: espera a que te avise de que está listo.`);
    let titular = r.nombre || null;
    if (!directo && r.cliente_id) {
        const { data: c } = await sb.from('clientes').select('nombre_razon_social, apellidos').eq('id_cliente', r.cliente_id).maybeSingle();
        titular = [c?.nombre_razon_social, c?.apellidos].filter(Boolean).join(' ').trim() || null;
    }
    return { numero: r.numero_expediente, fase, titular: titular || 'sin titular en la ficha' };
}

// ─── VPS: la pregunta, el sí, cancelar, probar, cola ─────────────────────────
async function presentar() {
    if (!POS[0]) throw new Error('Uso: presentar <nº> [--fase final] [--enviar]');
    const c = await localizarCee(POS[0], opt('fase'));
    const yaEnCola = cola().find(t => t.numero === c.numero && t.fase === c.fase && ['pendiente', 'en_curso'].includes(t.estado));
    if (yaEnCola) {
        await decir(`El CEE ${c.fase} de *${c.numero}* ya está encargado a tu PC (${yaEnCola.estado === 'en_curso' ? 'lo está presentando ahora' : 'en cola'}).`);
        return;
    }
    const pc = estadoPc();
    const pregunta = preguntaPresentar(c);
    const pendientes = (leer('pendiente') || []).filter(p => !(p.numero === c.numero && p.fase === c.fase));
    pendientes.push({ numero: c.numero, fase: c.fase, titular: c.titular, importe: TASA, tarjeta: TARJETA, pregunta, at: ahora() });
    if (bandera('enviar')) escribir('pendiente', pendientes);
    await decir(`${pregunta}\n\nContesta *sí* y lo hago.${pc.vivo ? '' : `\n_Ojo: ${pc.texto}._`}`);
}

async function confirmar() {
    if (bandera('lote')) return confirmarLote();
    if (!POS[0]) throw new Error('Uso: confirmar <nº> --texto "<respuesta literal de Fran>" [--enviar]');
    const texto = opt('texto');
    if (!texto) throw new Error('Falta --texto con la respuesta LITERAL de Fran: es la autorización del pago.');
    const n = norm(POS[0]);
    const pendientes = leer('pendiente') || [];
    const p = pendientes.find(x => norm(x.numero).endsWith(n) && (!opt('fase') || x.fase === opt('fase')));
    if (!p) throw new Error(`No hay ninguna pregunta de presentar pendiente para «${POS[0]}»: primero \`presentar ${POS[0]}\`.`);
    if (ahora() - p.at > 24 * 3600) throw new Error(`La pregunta de ${p.numero} es de hace más de 24 h: vuelve a hacerla con \`presentar\`.`);
    if (!bandera('enviar')) {
        console.log(`[EN SECO] Encolaría la presentación de ${p.numero} (${p.fase}) con la respuesta «${texto}».`);
        return;
    }
    const r = encolarPresentacion({ ...p, pregunta_at: p.at, respuesta: texto, origen: 'whatsapp' });
    await decir(r.duplicado ? `*${p.numero}* ya está en la cola de tu PC.`
        : `Hecho: se lo paso a tu PC; ${r.pc.texto}. Te aviso cuando empiece y cuando esté registrado.`);
}

// ─── La ronda de las 21:00: UNA pregunta para todos ───────────────────────────
const euros = n => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const tasaNum = () => Number(String(TASA).replace(',', '.'));
const corto = n => String(n).replace(/^.*_/, '');           // 26RES060_207 → 207, para «menos el 207»

// Lo que se presenta esta noche: el MISMO criterio que `presentar_cee.js pendientes` (de la casa, con
// visto bueno y sin registrar), menos lo que ya está en la cola, lo que tiene un encargo antiguo a otra
// persona sin cerrar (podría estar presentado: dos tasas) y lo que `localizarCee` no deja presentar.
async function listaDeLaNoche() {
    const { listaPendientes } = require('./presentar_cee');
    const enCola = cola().filter(t => t.tipo === 'presentar' && ['pendiente', 'en_curso'].includes(t.estado));
    const items = [], fuera = [];
    for (const p of (await listaPendientes()).filter(x => x.casa)) {
        if (enCola.some(t => t.numero === p.numero && t.fase === p.fase)) { fuera.push(`${p.numero} (${p.fase}): ya está en la cola de tu PC`); continue; }
        if (p.encargo) { fuera.push(`${p.numero} (${p.fase}): tiene un encargo de presentación antiguo sin cerrar (${p.encargo}); puede estar ya presentado`); continue; }
        try {
            const c = await localizarCee(p.numero, p.fase);
            items.push({ numero: c.numero, fase: c.fase, titular: c.titular, quedan: p.plazo?.quedan ?? null, firmado: p.firmado });
        } catch (e) { fuera.push(`${p.numero} (${p.fase}): ${e.message}`); }
    }
    return { items, fuera };
}

function preguntaNoche(items) {
    const n = items.length;
    const lineas = items.map((c, i) => `${i + 1}. *${c.numero}* · ${c.fase} · ${c.titular}${c.quedan != null ? ` · quedan ${c.quedan} días` : ''}`);
    return `*CEE para presentar esta noche* (${n}, tuyos y con tu visto bueno):\n${lineas.join('\n')}\n\n`
        + `Los doy por buenos y, uno detrás de otro, en tu PC los califico en CE3X si hace falta, los firmo y los presento pagando la tasa de *${TASA} €* de cada uno con ${TARJETA}: `
        + `*${n} × ${TASA} € = ${euros(n * tasaNum())} €*. Antes de cada pago te escribo para que lo autorices en la app del banco.`;
}

async function noche() {
    const { items, fuera } = await listaDeLaNoche();
    const notaFuera = fuera.length ? `\n\n_Fuera de la lista:_\n${fuera.map(f => `• ${f}`).join('\n')}` : '';
    if (!items.length) {
        log(`Ronda de la noche: nada que presentar.${fuera.length ? ` Fuera: ${fuera.join(' | ')}` : ''}`);
        return;
    }
    const pc = estadoPc();
    const pregunta = preguntaNoche(items);
    const lote = `noche-${new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' })}`;
    // La pregunta de esta noche sustituye a la de anoche, si no se contestó.
    const pendientes = (leer('pendiente') || []).filter(p => !p.lote);
    pendientes.push({ lote, items, importe: TASA, total: euros(items.length * tasaNum()), tarjeta: TARJETA, pregunta, at: ahora() });
    if (bandera('enviar')) escribir('pendiente', pendientes);
    await decir(`${pregunta}\n\nContesta *sí* y empiezo. Para dejar alguno fuera: «sí, menos el ${corto(items[items.length - 1].numero)}». `
        + `Si no contestas, no presento nada y mañana te lo vuelvo a preguntar.${pc.vivo ? '' : `\n_Ojo: ${pc.texto}._`}${notaFuera}`);
}

// Con su «sí» a la pregunta de la noche: cada CEE de la lista, a la cola, con la pregunta y la respuesta.
async function confirmarLote() {
    const texto = opt('texto');
    if (!texto) throw new Error('Falta --texto con la respuesta LITERAL de Fran: es la autorización de los pagos.');
    const p = (leer('pendiente') || []).filter(x => x.lote).sort((a, b) => b.at - a.at)[0];
    if (!p) throw new Error('No hay ninguna pregunta de la noche pendiente: primero `noche`.');
    if (ahora() - p.at > 24 * 3600) throw new Error(`La pregunta de la noche (${p.lote}) es de hace más de 24 h: no vale como autorización.`);
    const excepto = String(opt('excepto') || '').split(/[,\s]+/).map(norm).filter(Boolean);
    const sobran = excepto.filter(x => !p.items.some(c => norm(c.numero).endsWith(x)));
    if (sobran.length) throw new Error(`--excepto: ${sobran.join(', ')} no está en la lista de la noche (${p.items.map(c => c.numero).join(', ')}).`);
    // Un «sí, menos…» sin --excepto encolaría justo lo que ha dejado fuera.
    if (!excepto.length && /\b(menos|excepto|salvo|quita|sin el|sin la|no presentes)\b/i.test(texto)) {
        throw new Error('Su respuesta deja algo fuera: dilo con --excepto <nº,…> (o pregúntale cuál).');
    }
    const van = p.items.filter(c => !excepto.some(x => norm(c.numero).endsWith(x)));
    if (!van.length) throw new Error('Con lo que deja fuera no queda ninguno: no hay nada que encolar (usa `cancelar --lote`).');
    if (!bandera('enviar')) {
        console.log(`[EN SECO] Encolaría ${van.length} presentaciones (${van.map(c => c.numero).join(', ')}) con la respuesta «${texto}».`);
        return;
    }
    let nuevos = 0;
    let pc = estadoPc();
    for (const c of van) {
        const r = encolarPresentacion({
            ...c, importe: p.importe, tarjeta: p.tarjeta, pregunta: p.pregunta, pregunta_at: p.at, respuesta: texto,
            origen: 'whatsapp', lote: p.lote, lote_n: van.length,
        });
        if (!r.duplicado) nuevos += 1;
        pc = r.pc;
    }
    escribir('pendiente', (leer('pendiente') || []).filter(x => x.lote !== p.lote));
    await decir(`Hecho: le paso ${nuevos} CEE a tu PC, uno detrás de otro (${van.map(c => c.numero).join(', ')}); `
        + `${pc.texto}. Te escribo antes de cada pago y, al acabar, el resumen.${excepto.length ? `\nFuera: ${p.items.filter(c => !van.includes(c)).map(c => c.numero).join(', ')}.` : ''}`);
}

async function cancelarLote() {
    const pend = leer('pendiente') || [];
    const lista = cola();
    const quitarPend = pend.filter(x => x.lote);
    const quitarCola = lista.filter(t => t.lote && t.estado === 'pendiente');
    const enCurso = lista.find(t => t.lote && t.estado === 'en_curso');
    if (bandera('enviar')) {
        escribir('pendiente', pend.filter(x => !x.lote));
        escribir('cola', lista.map(t => (quitarCola.includes(t) ? { ...t, estado: 'cancelada', cancelada_at: ahora() } : t)));
    }
    const partes = [];
    if (quitarPend.length) partes.push('no presento nada de la lista de esta noche');
    if (quitarCola.length) partes.push(`quito de la cola ${quitarCola.map(t => t.numero).join(', ')}`);
    const enMarcha = enCurso ? ` *${enCurso.numero}* ya lo está presentando tu PC y ese no lo paro desde aquí (podría quedar a medias con la tasa pagada).` : '';
    await decir(partes.length ? `Cancelado: ${partes.join(' y ')}.${enMarcha}` : `No había nada de la ronda de la noche pendiente.${enMarcha}`);
}

async function cancelar() {
    if (bandera('lote')) return cancelarLote();
    if (!POS[0]) throw new Error('Uso: cancelar <nº> [--enviar]');
    const n = norm(POS[0]);
    const pend = leer('pendiente') || [];
    const lista = cola();
    const quitarPend = pend.filter(x => norm(x.numero).endsWith(n));
    const quitarCola = lista.filter(t => norm(t.numero || '').endsWith(n) && t.estado === 'pendiente');
    const enCurso = lista.find(t => norm(t.numero || '').endsWith(n) && t.estado === 'en_curso');
    if (bandera('enviar')) {
        escribir('pendiente', pend.filter(x => !quitarPend.includes(x)));
        escribir('cola', lista.map(t => (quitarCola.includes(t) ? { ...t, estado: 'cancelada', cancelada_at: ahora() } : t)));
    }
    await decir(enCurso
        ? `*${enCurso.numero}* ya lo está presentando tu PC y no lo paro desde aquí (podría quedar a medias con la tasa pagada). Si hace falta, páralo en el PC.`
        : (quitarPend.length || quitarCola.length ? `Cancelado: no presento *${(quitarPend[0] || quitarCola[0]).numero}*.` : `No había nada pendiente de «${POS[0]}».`));
}

// ─── Trabajos con CE3X ────────────────────────────────────────────────────────
// Catálogo cerrado: el PC no recibe órdenes libres, recibe UNO de estos trabajos con las decisiones
// de Fran como datos. `pasos` es lo que se le pide al Claude del PC.
const TRABAJOS_CE3X = {
    cee_final: {
        que: 'el CEE final',
        pasos: (t) => `1. Lee C:\\Proyectos\\app.brokergy\\skills\\generar-cee-final\\SKILL.md entero y síguelo (RES060 copiando el inicial; RES093 desde la medida; un RES080 NO: para y dilo, no tiene comando único).
2. node scripts/agente_ia.js empezar ${t.numero} --fase final (sin --reasignar).
3. EN SECO: node scripts/cee_final.js ${t.numero} --fecha=${t.fecha}. Mira lo que imprime contra las decisiones de Fran de arriba (equipos, hibridación, ACS, depósito). Si algo no casa con ellas o hay una duda que ellas no resuelven, PARA y pregúntaselo en tu respuesta final: no lo decidas tú.
4. Con todo claro: el mismo comando con --escribir. Comprueba «✓ XML del CEE final CARGADO en la app» y que NO diga «CERTIFICADO INCOMPLETO» (si lo dice, el final NO está hecho: dilo).`,
    },
    calificar: {
        que: 'la calificación con CE3X',
        pasos: (t) => `1. node scripts/cee_inicial.js listo ${t.numero}${t.fase === 'final' ? ' --fase final' : ''} EN SECO: califica con CE3X y dice si el XML valida.
2. Si valida y no hay «certificado incompleto»: el mismo comando con --escribir (canónico + XML y PDF a Drive + XML cargado en la app). Si no, PARA y di por qué.`,
    },
};

async function ce3x() {
    const def = TRABAJOS_CE3X[opt('trabajo')];
    if (!POS[0] || !def) throw new Error(`Uso: ce3x <nº> --trabajo ${Object.keys(TRABAJOS_CE3X).join('|')} [--fase final] [--fecha AAAA-MM-DD] [--texto "…"] [--enviar]`);
    const fase = opt('trabajo') === 'cee_final' ? 'final' : (opt('fase') || 'inicial');
    const fecha = opt('fecha') || new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error(`--fecha tiene que ser AAAA-MM-DD («${fecha}»).`);
    const numero = await comprobarNumero(POS[0], fase);
    // Una obra de la app de certificadores no lleva Claude en el PC: su trabajo es fijo.
    if (/EXT_\d+$/.test(numero)) {
        if (opt('trabajo') !== 'calificar') throw new Error(`${numero} es una obra de la app de certificadores: solo se califica (un solo certificado, sin CEE final).`);
        if (!bandera('enviar')) { console.log(`[EN SECO] Encolaría la calificación de ${numero} (calificar_ext).`); return; }
        const r = encolarCalificarExt({ numero });
        const pc = estadoPc();
        await decir(r.duplicado ? `La calificación de *${numero}* ya está en la cola de tu PC.`
            : `Le paso a tu PC la calificación de *${numero}*; ${pc.texto}. Cuando esté, te llega el aviso de la app de «listo para revisar».`);
        return;
    }
    const lista = cola();
    const ya = lista.find(t => t.tipo === 'ce3x' && t.numero === numero && t.trabajo === opt('trabajo') && ['pendiente', 'en_curso'].includes(t.estado));
    if (ya) { await decir(`${def.que.charAt(0).toUpperCase()}${def.que.slice(1)} de *${numero}* ya está encargado a tu PC (${ya.estado === 'en_curso' ? 'lo está haciendo ahora' : 'en cola'}).`); return; }
    const tarea = {
        id: `ce3x-${opt('trabajo')}-${numero}-${ahora()}`, tipo: 'ce3x', trabajo: opt('trabajo'), numero, fase, fecha,
        indicaciones: String(opt('texto') || '').slice(0, 1500), origen: 'whatsapp', estado: 'pendiente', creado_at: ahora(),
    };
    if (bandera('enviar')) escribir('cola', [...lista.filter(t => ahora() - (t.creado_at || 0) < 30 * 86400), tarea]);
    else console.log(`[EN SECO] Encolaría:\n${JSON.stringify(tarea, null, 1)}`);
    const pc = estadoPc();
    await decir(`Aquí no hay CE3X: le paso ${def.que} de *${numero}* a tu PC; ${pc.texto}. Te aviso cuando esté.`);
}

// Que el número exista (expediente, CEE directo u obra de la app de certificadores) y que esa fase no
// esté ya REGISTRADA. A diferencia de `localizarCee`, NO para si el Agente IA lo tiene «trabajando»:
// es justo quien lo encarga.
async function comprobarNumero(numero, fase) {
    const { createClient } = require(path.join(__dirname, '../node_modules/@supabase/supabase-js'));
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const n = norm(numero);
    if (/^\d{4}EXT_\d+$/.test(n)) {
        const { data: obra, error: e } = await sb.from('certapp_obras').select('numero_expediente, estado').eq('numero_expediente', n).maybeSingle();
        if (e) throw new Error(e.message);
        if (!obra) throw new Error(`No encuentro la obra «${numero}» de la app de certificadores.`);
        if (obra.estado === 'ARCHIVADA') throw new Error(`La obra ${n} está ARCHIVADA: no se califica.`);
        return obra.numero_expediente;
    }
    const directo = /CEE_?\d+$/.test(n);
    const { data, error } = await sb.from(directo ? 'cee_directos' : 'expedientes').select('numero_expediente, seguimiento')
        .ilike('numero_expediente', `%${n.replace(/CEE_?/, 'CEE_')}`).limit(5);
    if (error) throw new Error(error.message);
    const filas = (data || []).filter(r => norm(r.numero_expediente).endsWith(n.replace(/CEE_?/, 'CEE_')));
    if (filas.length !== 1) throw new Error(filas.length ? `Hay varios «${numero}»: dime el número completo.` : `No encuentro «${numero}».`);
    if (String(filas[0].seguimiento?.[`cee_${fase}`] || '').toUpperCase() === 'REGISTRADO') throw new Error(`El CEE ${fase} de ${filas[0].numero_expediente} ya está REGISTRADO: no se rehace.`);
    return filas[0].numero_expediente;
}

async function probar() {
    const lista = cola();
    const tarea = { id: `prueba-${ahora()}`, tipo: 'prueba', estado: 'pendiente', creado_at: ahora() };
    if (bandera('enviar')) escribir('cola', [...lista, tarea]);
    const pc = estadoPc();
    await decir(`Prueba encargada a tu PC (no presenta ni paga nada: solo abre la web de la JCCM en Chrome); ${pc.texto}.`);
}

function verCola() {
    const pc = estadoPc();
    console.log(`PC: ${pc.texto}`);
    const pend = leer('pendiente') || [];
    console.log(`\nPreguntas de presentar esperando el «sí» de Fran: ${pend.length || 'ninguna'}`);
    for (const p of pend) {
        if (p.lote) console.log(`  - RONDA DE LA NOCHE ${p.lote} · preguntado ${hora(p.at)} · ${p.items.length} CEE (${p.items.map(c => `${c.numero} ${c.fase}`).join(', ')}) · ${p.total} € → confirmar --lote`);
        else console.log(`  - ${p.numero} (${p.fase}) · preguntado ${hora(p.at)} · ${p.titular}`);
    }
    const lista = cola().slice(-10);
    console.log(`\nCola del PC (últimas ${lista.length}):`);
    for (const t of lista) console.log(`  - ${t.id} · ${t.estado}${t.resumen ? ` · ${t.resumen.slice(0, 120)}` : ''}`);
}

// ─── PC: la vuelta ────────────────────────────────────────────────────────────
const ACTUAL = path.join(DIR_PC, 'actual.json');
const vivo = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
function bloqueado() {
    // Con la pantalla de bloqueo (o la de inicio de sesión) delante corre LogonUI.exe: ni AutoFirma
    // ni un clic «real» funcionan ahí.
    try { return /LogonUI\.exe/i.test(execFileSync('tasklist', ['/FI', 'IMAGENAME eq LogonUI.exe', '/NH'], { windowsHide: true }).toString()); } catch { return false; }
}

function promptPresentar(t) {
    const faseOpt = t.fase === 'final' ? ' --fase final' : '';
    return `Trabajas SIN nadie delante en el PC de Fran: te ha lanzado la tarea programada «Brokergy Trabajos PC». Encargo ${t.id}: PRESENTAR en el Registro de la JCCM el CEE ${t.fase} de ${t.numero} (titular: ${t.titular}).

LA AUTORIZACIÓN, de Fran ${t.origen === 'app' ? 'en el asistente de la app (solo lo ven los ADMIN, con su sesión)' : 'por WhatsApp (el sistema solo deja pasar mensajes cuyo autor es él)'}:
- Pregunta que se le hizo (${hora(t.pregunta_at)}): «${t.pregunta}»
- Su respuesta (${hora(t.confirmado_at)}): «${t.respuesta}»
Es su «doy por válido» para FIRMAR este CEE y su «sí» al PAGO de esa tasa (${t.importe} €, ${t.tarjeta}) para ESTE expediente: la confirmación del apartado 1b de la skill presentar-cee. No vuelvas a preguntar. Si la sede pide OTRO importe, o esa tarjeta no está en Chrome, PARA y avísale.${t.lote ? `
La pregunta era por la LISTA de la ronda de la noche (${t.lote}); este encargo es SOLO ${t.numero} (${t.fase}): un pago de ${t.importe} €, nunca el total. Los demás de la lista son otros encargos: no los toques. Si su respuesta deja fuera ESTE expediente, PARA sin pagar.` : ''}

CÓMO LE HABLAS (desde C:\\Proyectos\\app.brokergy\\implementation\\backend): node scripts/asistente_whatsapp.js decir "texto" --enviar
Solo tres veces: al empezar («Empiezo a presentar ${t.numero}…»), cuando toque autorizar el pago («Autoriza ahora en la app de tu banco el pago de ${t.importe} €») y si algo te para. El mensaje FINAL no lo mandes tú: escríbelo como tu respuesta final (2-4 líneas: nº de registro y fecha, o en qué punto y por qué has parado) y el sistema se lo envía.

PASOS (los scripts, en C:\\Proyectos\\app.brokergy\\implementation\\backend):
1. Lee C:\\Proyectos\\app.brokergy\\skills\\presentar-cee\\SKILL.md entero y síguelo tal cual. Montaje: comprobar_montaje.ps1 -Titular MOYA_LOPEZ; sin «MONTAJE LISTO», para.
2. Solo si en la carpeta de la fase sigue el borrador «_REVISAR» sin su nombre definitivo (el visto bueno ya lo renombra; sin XML ni PDF oficiales): node scripts/cee_inicial.js listo ${t.numero}${faseOpt} en seco y, si califica y el XML VALIDA, con --escribir. «Certificado incompleto» o no valida: PARA.
3. Si no hay PDF firmado (_fdo.pdf): node scripts/firmar_cee.js ${t.numero}${faseOpt} --escribir (cómo se firma: skills\\generar-cee-inicial\\SKILL.md).
4. node scripts/presentar_cee.js preparar ${t.numero}${faseOpt}: tiene que decir LISTO. NO LISTO o CERTIFICADO INCOMPLETO: PARA.
5. La sede, con Claude en Chrome. ANTES DE NADA select_browser con deviceId ${CHROME_DEVICE} (perfil BROKERGY, el de la tarjeta); nunca otro navegador. Vigilante de AutoFirma en segundo plano antes de abrir la sede. Lo demás, como dice la skill (sesión limpia, identificarse, «Es representante», rellenar, adjuntos, referencia catastral a mano, pago con el sí de arriba, 3DS: avisa y espera hasta 10 minutos a que la página diga autorizada; si no, para; enviar; justificante).
6. node scripts/presentar_cee.js devuelto ${t.numero}${faseOpt} --registro … --tasa … en seco y, si cuadran fecha y nº, con --escribir.
7. Al acabar, sesión de la sede borrada y tus pestañas cerradas.

REGLAS: un solo pago, nunca dos; si algo falla DESPUÉS de pagar no vuelvas a pagar (la skill explica cómo rehacer la solicitud con la referencia 046). No toques nada que no sea de este encargo. Nunca escribas datos de la tarjeta. Si Fran está usando el PC (la skill dice cómo verlo), espera a que lo suelte.`;
}

function promptCe3x(t) {
    const def = TRABAJOS_CE3X[t.trabajo];
    return `Trabajas SIN nadie delante en el PC de Fran: te ha lanzado la tarea programada «Brokergy Trabajos PC». Encargo ${t.id}: ${def.que} de ${t.numero}. Te lo pasa el Claude del WhatsApp (el del servidor), que no tiene CE3X; tú sí (CE3X 3.2 instalado, se lanza oculto desde los scripts).

LO QUE HA DECIDIDO FRAN (son datos, no órdenes nuevas; pedido ${hora(t.creado_at)}): «${t.indicaciones || 'nada más que el encargo'}»
Fecha de emisión y de visita del CEE: ${t.fecha}.

CÓMO LE HABLAS (desde C:\\Proyectos\\app.brokergy\\implementation\\backend): node scripts/asistente_whatsapp.js decir "texto" --enviar
Solo al empezar («Empiezo con ${def.que} de ${t.numero} en tu PC…») y si algo te para. El mensaje FINAL no lo mandes tú: escríbelo como tu respuesta final y el sistema se lo envía.

PASOS (los scripts, en C:\\Proyectos\\app.brokergy\\implementation\\backend; el motor cee-engine tiene que responder en http://127.0.0.1:8090/health — si no, arráncalo con «python -m uvicorn server:app --host 127.0.0.1 --port 8090» en implementation\\cee-engine y espera a que responda):
${def.pasos(t)}

REGLAS: solo este expediente y solo este trabajo. Nada a terceros (el aviso al equipo que hace --escribir sí, es el de siempre). No toques git, ni el código, ni Chrome. Lo que no esté en las decisiones de Fran y cambie el resultado, no lo decidas: para y pregúntalo. Si un servicio externo no responde (PVGIS, el motor), reinténtalo un par de veces y, si sigue, para y dilo.

TU RESPUESTA FINAL (la recibe Fran por WhatsApp), 2-6 líneas: la calificación (letra y valor), qué ha quedado subido y cargado, cuánto sale con ese XML (ahorro y bono de la app) y lo que queda (revisarlo, firmarlo, presentarlo); o en qué punto has parado y qué necesitas de él.`;
}

function promptPrueba() {
    return `Trabajas SIN nadie delante en el PC de Fran: es una PRUEBA del encargo por WhatsApp. No preguntes nada a nadie. Con las herramientas de Claude en Chrome: select_browser con deviceId ${CHROME_DEVICE} (perfil BROKERGY); tabs_context_mcp con createIfEmpty true; navega a https://www.jccm.es/ ; lee el título de la página; cierra tu pestaña. Nada más. Tu respuesta final, en una línea: «Prueba hecha: tu PC maneja Chrome (perfil BROKERGY) sin nadie delante; la web de la JCCM responde («<título>»).», o qué ha fallado.`;
}

const promptDe = t => (t.tipo === 'prueba' ? promptPrueba() : t.tipo === 'ce3x' ? promptCe3x(t) : promptPresentar(t));
const cabecera = t => (t.tipo === 'prueba' ? 'PC · prueba'
    : t.tipo === 'ce3x' ? `PC · ${TRABAJOS_CE3X[t.trabajo]?.que || t.trabajo} de ${t.numero}`
        : t.tipo === 'calificar_ext' ? `PC · calificar ${t.numero} (app de certificadores)` : `PC · presentar ${t.numero}`);

// ─── calificar_ext: un trabajo FIJO, sin Claude ──────────────────────────────
// La línea con la que `cee_inicial.js calificar` dice que lo ha calificado Y que producción ha
// mandado el aviso. Se busca en su salida: vale también si la vuelta que lo vigilaba murió.
const MARCA_CALIFICADA = '@@CALIFICADA_OK';
const MOTOR = process.env.CEE_ENGINE_URL || 'http://127.0.0.1:8090';

async function motorVivo() {
    try { return (await fetch(`${MOTOR}/health`, { signal: AbortSignal.timeout(4000) })).ok; } catch { return false; }
}
// REGLA — el motor se levanta en el host y el puerto de CEE_ENGINE_URL, no en un 8090 fijo. En el PC
// el 8090 es la vista previa de la copia principal, con el código a medias de otras sesiones; el PC
// (brokergy-pc) tiene el suyo en el 8093. Con el 8090 fijo, tras reiniciar el PC se arrancaba donde no
// se miraba y la calificación fallaba (25/10/2026, 2026EXT_1).
function hostPuertoMotor(url = MOTOR) {
    const u = new URL(url);
    return { host: u.hostname, puerto: u.port || (u.protocol === 'https:' ? '443' : '80') };
}
// El motor (cee-engine) tiene que responder: `calificar` rehace el .cex desde la receta. Si no está,
// se levanta como dice su README y se espera hasta 90 s.
async function asegurarMotor() {
    if (await motorVivo()) return null;
    const { host, puerto } = hostPuertoMotor();
    spawn(process.env.PC_PYTHON || 'python', ['-m', 'uvicorn', 'server:app', '--host', host, '--port', puerto],
        { cwd: path.join(REPO, 'implementation', 'cee-engine'), detached: true, stdio: 'ignore', windowsHide: true }).unref();
    for (let i = 0; i < 45; i++) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise(r => setTimeout(r, 2000));
        // eslint-disable-next-line no-await-in-loop
        if (await motorVivo()) return null;
    }
    return `el motor (cee-engine) no responde en ${MOTOR} ni arrancándolo`;
}

function lanzarCalificarExt(t) {
    fs.mkdirSync(DIR_PC, { recursive: true });
    const logF = path.join(DIR_PC, `${t.id}.log`);
    const out = fs.openSync(logF, 'w');
    const hijo = spawn(process.execPath, [path.join(__dirname, 'cee_inicial.js'), 'calificar', t.numero, '--escribir'],
        { cwd: BACKEND, windowsHide: true, stdio: ['ignore', out, out] });
    const actual = { id: t.id, tipo: t.tipo, trabajo: null, numero: t.numero, pid: hijo.pid, inicio: ahora(), log: logF };
    fs.writeFileSync(ACTUAL, JSON.stringify(actual, null, 1));
    return { hijo, actual };
}

/** Cómo acabó: bien solo si su salida trae la MARCA (calificado y avisado). */
function resultadoCalificarExt(logF, motivoCorte) {
    let txt = '';
    try { txt = fs.readFileSync(logF, 'utf8'); } catch { /* sin salida */ }
    const ok = !motivoCorte && txt.includes(MARCA_CALIFICADA);
    const cola = txt.split(/\r?\n/).filter(l => l.trim() && !l.includes(MARCA_CALIFICADA)).slice(-12).join('\n');
    return { ok, texto: motivoCorte || cola || 'sin salida' };
}

function asegurarChrome() {
    // Sin Chrome abierto no hay extensión con la que hablar. Abre (o trae) una ventana del perfil BROKERGY.
    const exe = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe')].find(f => fs.existsSync(f));
    if (!exe) return 'no encuentro chrome.exe';
    spawn(exe, [`--profile-directory=${CHROME_PERFIL}`, 'about:blank'], { detached: true, stdio: 'ignore', windowsHide: false }).unref();
    return null;
}

// La vuelta NO suelta el trabajo: lo lanza y se queda esperándolo (con el latido) hasta que acaba.
// Medido el 19/10/2026: un `claude -p` lanzado «desligado» (detached) muere sin escribir una línea en
// cuanto sale el proceso que lo lanzó, pase el prompt por una tubería o por un fichero. La tarea
// programada no arranca otra vuelta mientras esta siga viva (MultipleInstances = IgnoreNew).
function lanzar(t) {
    fs.mkdirSync(DIR_PC, { recursive: true });
    const logF = path.join(DIR_PC, `${t.id}.jsonl`);
    const promptF = path.join(DIR_PC, `${t.id}.prompt.txt`);
    fs.writeFileSync(promptF, promptDe(t));
    const out = fs.openSync(logF, 'w');
    const prueba = t.tipo === 'prueba';
    // Un trabajo con CE3X solo lleva scripts: sin --chrome ni sus herramientas (ni la sede ni la tarjeta).
    const conChrome = t.tipo !== 'ce3x';
    const args = ['/d', '/c', 'claude', '-p', ...(conChrome ? ['--chrome'] : []),
        '--permission-mode', 'dontAsk',
        '--allowedTools', 'Bash', 'Read', 'Glob', 'Grep', 'Write', 'Edit', 'Skill', ...(conChrome ? ['mcp__claude-in-chrome__*'] : []),
        '--output-format', 'stream-json', '--verbose',
        '--max-turns', prueba ? '20' : '250',
        '--model', prueba ? 'sonnet' : (process.env.PC_MODELO || 'opus')];
    // Sin las claves de la API: este script carga el .env del backend, que lleva ANTHROPIC_API_KEY (el
    // asistente de la app), y con ella Claude Code deja la cuenta de claude.ai, APAGA Chrome y cobra a la
    // API (medido el 19/10/2026: «solo hay conectado acescam-mail»). Tiene que ir con la sesión de Fran.
    const env = { ...process.env };
    for (const k of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN', 'ANTHROPIC_BASE_URL']) delete env[k];
    // El prompt entra por un FICHERO (stdin), no por la línea de órdenes: es largo y lleva comillas.
    const hijo = spawn(process.env.ComSpec || 'cmd.exe', args, { cwd: REPO, env, windowsHide: true, stdio: [fs.openSync(promptF, 'r'), out, out] });
    const actual = { id: t.id, tipo: t.tipo, trabajo: t.trabajo || null, numero: t.numero || null, lote: t.lote || null, pid: hijo.pid, inicio: ahora(), log: logF };
    fs.writeFileSync(ACTUAL, JSON.stringify(actual, null, 1));
    return { hijo, actual };
}

// Espera al trabajo con el latido cada minuto; si se pasa de MAX_MIN, lo para.
function esperar(hijo, actual) {
    return new Promise((resolve) => {
        const latir = () => {
            try { escribir('latido', { at: ahora(), host: os.hostname(), bloqueado: bloqueado(), trabajando: actual.numero || actual.tipo }); } catch (e) { log('Latido fallido:', e.message); }
        };
        const reloj = setInterval(() => {
            latir();
            if (ahora() - actual.inicio > MAX_MIN * 60) {
                try { execFileSync('taskkill', ['/PID', String(hijo.pid), '/T', '/F'], { windowsHide: true }); } catch { /* ya no está */ }
                clearInterval(reloj);
                resolve(`Lo he parado: llevaba más de ${MAX_MIN} minutos sin terminar.`);
            }
        }, 60_000);
        hijo.on('exit', () => { clearInterval(reloj); latir(); resolve(null); });
        hijo.on('error', (e) => { clearInterval(reloj); resolve(`No se ha podido lanzar Claude Code: ${e.message}`); });
    });
}

function leerResultado(logF) {
    let txt = '';
    try { txt = fs.readFileSync(logF, 'utf8'); } catch { return null; }
    const res = txt.split(/\r?\n/).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean).reverse().find(e => e.type === 'result');
    return res ? { ok: res.subtype === 'success' && !res.is_error, texto: String(res.result || '').trim(), coste: res.total_cost_usd } : null;
}

// El informe del lote, cuando ya no queda ninguno por hacer (null mientras quede alguno).
function informeLote(lista, lote) {
    const del = lista.filter(t => t.lote === lote);
    if (!del.length || del.some(t => ['pendiente', 'en_curso'].includes(t.estado))) return null;
    const hechos = del.filter(t => t.estado === 'hecha');
    const primera = s => String(s || '').split('\n').map(l => l.trim()).filter(Boolean)[0]?.slice(0, 160) || '';
    const linea = t => (t.estado === 'hecha' ? `✓ *${t.numero}* — ${primera(t.resumen)}`
        : t.estado === 'fallida' ? `✗ *${t.numero}* — no terminó: ${primera(t.resumen)}`
            : `· *${t.numero}* — no empezado (${/^No empezado/.test(t.resumen || '') ? 'paré tras el fallo anterior' : 'cancelado'}): vuelve a la lista de mañana`);
    return `*Presentación de la noche: ${hechos.length} de ${del.length}*\n${del.map(linea).join('\n')}`
        + (hechos.length ? `\nTasas pagadas: ${hechos.length} × ${del[0].importe} € = ${euros(hechos.length * tasaNum())} €.` : '')
        + (del.some(t => t.estado === 'fallida') ? '\n_Lo que no terminó no lo reintento: si llegó a pagar, hay que mirarlo antes (la referencia 046)._' : '');
}

async function terminar(actual, motivoCorte = null) {
    const fijo = actual.tipo === 'calificar_ext';
    const res = fijo ? resultadoCalificarExt(actual.log, motivoCorte) : (motivoCorte ? null : leerResultado(actual.log));
    const ok = !!res?.ok && !motivoCorte;
    const resumen = (res?.texto || motivoCorte || 'el trabajo se ha cortado sin dar respuesta').slice(0, 1500);
    let lista = cola().map(t => (t.id === actual.id ? { ...t, estado: ok ? 'hecha' : 'fallida', terminado_at: ahora(), resumen } : t));
    // De la ronda de la noche: si este no ha terminado, los que quedan del lote NO se empiezan (un 3DS
    // sin autorizar o la sede caída pararían igual a los siguientes); vuelven a la lista de mañana.
    if (actual.lote && !ok) {
        lista = lista.map(t => (t.lote === actual.lote && t.estado === 'pendiente'
            ? { ...t, estado: 'cancelada', cancelada_at: ahora(), resumen: `No empezado: ${actual.numero} no terminó.` } : t));
    }
    escribir('cola', lista);
    const cab = cabecera(actual);
    const pie = ok || actual.tipo === 'prueba' ? ''
        : actual.tipo === 'ce3x' || fijo ? '\n\n_No lo reintento solo: cuando lo mires, pídemelo otra vez._'
            : '\n\n_No lo reintento solo: si llegó a pagar, hay que mirarlo antes (la referencia 046)._';
    // La calificación de una obra de la app va en silencio: el aviso de «listo» lo manda producción.
    if (!(fijo && ok)) await require('./asistente_whatsapp').mandarOGuardar(`*${cab}*${ok ? '' : ' — NO ha terminado'}\n${resumen}${pie}`);
    const informe = actual.lote ? informeLote(lista, actual.lote) : null;
    if (informe) await require('./asistente_whatsapp').mandarOGuardar(informe);
    fs.renameSync(ACTUAL, path.join(DIR_PC, `${actual.id}.fin.json`));
    log(`Terminado ${actual.id}: ${ok ? 'OK' : 'FALLÓ'}`);
}

async function vuelta() {
    fs.mkdirSync(DIR_PC, { recursive: true });
    const seco = bandera('seco');
    // Lo que no salió porque el WhatsApp estaba caído (el mensaje final de un trabajo, p. ej.).
    if (!seco) { try { const n = await require('./asistente_whatsapp').vaciarBuzon(); if (n) log(`Buzón: ${n} mensaje(s) enviados con retraso.`); } catch { /* sigue caído */ } }
    const actual = fs.existsSync(ACTUAL) ? JSON.parse(fs.readFileSync(ACTUAL, 'utf8')) : null;
    const estaBloqueado = bloqueado();
    // 1. El latido: el Claude del WhatsApp lo mira para decirle a Fran si el PC está.
    if (!seco) escribir('latido', { at: ahora(), host: os.hostname(), bloqueado: estaBloqueado, trabajando: actual ? (actual.numero || actual.tipo) : null });
    // 2. Un trabajo que se quedó sin cerrar: la vuelta que lo vigilaba murió (PC reiniciado o
    //    suspendido, sesión cerrada). Si Claude sigue vivo, se espera; si no, se cierra con lo que haya.
    if (actual) {
        if (vivo(actual.pid)) { log(`Sigue en marcha ${actual.id} (pid ${actual.pid}), sin vuelta que lo vigile.`); return; }
        // Un calificar_ext se juzga por su salida (la MARCA), haya o no vuelta que lo vigilara.
        const cortado = actual.tipo === 'calificar_ext' || leerResultado(actual.log) ? null
            : 'El trabajo se cortó a medias (¿se apagó, suspendió o reinició el PC?).';
        if (!seco) await terminar(actual, cortado);
        return;
    }
    // 3. Nada en marcha: ¿hay encargo?
    const lista = cola();
    const t = lista.find(x => x.estado === 'pendiente' && ['presentar', 'prueba', 'ce3x', 'calificar_ext'].includes(x.tipo));
    if (!t) return;
    // Bloqueado no hay AutoFirma ni clic «real»; un trabajo con CE3X solo lanza scripts, pero CE3X es una
    // aplicación de escritorio y con la sesión bloqueada no se ha medido: espera igual.
    if (estaBloqueado) { log(`Hay encargo (${t.id}) pero el PC está bloqueado: espera.`); return; }
    if (seco) {
        log(`[EN SECO] Lanzaría ${t.id}.`);
        console.log(t.tipo === 'calificar_ext' ? `node scripts/cee_inicial.js calificar ${t.numero} --escribir` : promptDe(t));
        return;
    }
    escribir('cola', lista.map(x => (x.id === t.id ? { ...x, estado: 'en_curso', tomado_at: ahora(), pc: os.hostname() } : x)));
    if (t.tipo === 'calificar_ext') {
        const sinMotor = await asegurarMotor();
        if (sinMotor) {
            fs.writeFileSync(ACTUAL, JSON.stringify({ id: t.id, tipo: t.tipo, numero: t.numero, pid: 0, inicio: ahora(), log: path.join(DIR_PC, `${t.id}.log`) }, null, 1));
            await terminar({ id: t.id, tipo: t.tipo, numero: t.numero, log: path.join(DIR_PC, `${t.id}.log`) }, `No lo he podido calificar: ${sinMotor}.`);
            return;
        }
        const { hijo, actual: enMarcha } = lanzarCalificarExt(t);
        log(`Lanzado ${t.id} (pid ${hijo.pid}): cee_inicial.js calificar ${t.numero} --escribir; lo espero.`);
        const corte = await esperar(hijo, enMarcha);
        await terminar(enMarcha, corte);
        return;
    }
    if (t.tipo !== 'ce3x') {
        const errChrome = asegurarChrome();
        if (errChrome) log(`Aviso: ${errChrome}.`);
        await new Promise(r => setTimeout(r, 8000));                 // que Chrome conecte la extensión
    }
    const { hijo, actual: enMarcha } = lanzar(t);
    log(`Lanzado ${t.id} (pid ${hijo.pid}); lo espero.`);
    const corte = await esperar(hijo, enMarcha);
    await terminar(enMarcha, corte);
}

function estado() {
    const actual = fs.existsSync(ACTUAL) ? JSON.parse(fs.readFileSync(ACTUAL, 'utf8')) : null;
    console.log(actual ? `En marcha aquí: ${actual.id} desde ${hora(actual.inicio)} (pid ${actual.pid}, ${vivo(actual.pid) ? 'vivo' : 'TERMINADO, pendiente de cerrar'})` : 'Nada en marcha en este PC.');
    console.log(`Pantalla bloqueada: ${bloqueado() ? 'sí' : 'no'}\n`);
    verCola();
}

const ORDENES = { presentar, noche, confirmar, cancelar, ce3x, probar, cola: verCola, vuelta, estado };
if (require.main === module) {
    (async () => {
        const f = ORDENES[ORDEN];
        if (!f) { console.log('Órdenes: presentar · noche · confirmar · cancelar · ce3x · probar · cola (VPS) · vuelta · estado (PC)'); process.exit(1); }
        await f();
    })().catch((e) => { console.error(`ERROR: ${e.message}`); process.exit(1); });
}

module.exports = { estadoPc, localizarCee, preguntaPresentar, encolarPresentacion, encolarCalificarExt, TASA, TARJETA, TRABAJOS_CE3X,
    MARCA_CALIFICADA, _promptCe3x: promptCe3x, _resultadoCalificarExt: resultadoCalificarExt,
    _hostPuertoMotor: hostPuertoMotor, _asegurarMotor: asegurarMotor,
    _preguntaNoche: preguntaNoche, _informeLote: informeLote, _promptPresentar: promptPresentar,
    _confirmarLote: confirmarLote, _cancelarLote: cancelarLote, _terminar: terminar };
