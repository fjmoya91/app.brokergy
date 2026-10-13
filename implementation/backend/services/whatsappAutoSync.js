/**
 * whatsappAutoSync — etiquetas y nombre del cliente en WhatsApp, SOLOS.
 *
 * Hasta ahora el chat de cada cliente se etiquetaba (RES060 · EN CURSO…) y su
 * contacto se renombraba con el nº de obra («RES080 Irene» → «RES080_87 Irene»)
 * pulsando un botón de repaso en el panel de WhatsApp. Aquí se hace solo:
 *
 *  · AL MOMENTO, cuando nace o cambia algo del cliente (alta de la ficha, de una
 *    oportunidad, aceptación y expediente nuevo): `programarCliente(id)` lo
 *    apunta y, un minuto después —para juntar los avisos de una misma operación—,
 *    se etiqueta su chat y se pone el nº de su obra delante de su nombre.
 *  · CADA 6 H (en horario de oficina), un repaso de todo: los cambios de estado
 *    de un expediente no pasan por un único sitio, y el repaso los recoge.
 *
 * REGLAS (las de los repasos manuales, que son los que se reutilizan):
 *  - Las etiquetas: `whatsappClientesSync` — solo el TITULAR, nunca un teléfono
 *    de partner o compartido, solo etiquetas y chats que ya existen.
 *  - El nombre: solo el PREFIJO de la casa en un contacto que ya lo lleva; con
 *    varias obras posibles o una ficha distinta en el nombre, NO se toca.
 *  - WhatsApp LIMITA las ediciones de la agenda (429): una cada 20 s y se para
 *    al primer 429 hasta el siguiente repaso.
 *  - Nace APAGADO (`WA_AUTO_SYNC=true` para encenderlo, solo en el VPS): en
 *    local la sesión de WhatsApp es la misma cuenta de la empresa.
 */

const whatsappService = require('./whatsappService');
const contactos = require('./whatsappContactos');
const { cargarRelaciones } = require('./clientesRelaciones');
const supabase = require('./supabaseClient');
const { leerPrefijo, obraDelContacto } = require('../utils/nombreContactoCliente');
const { nueve } = require('../utils/agendaWhatsapp');

const num = (v, d) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : d; };
const CONFIG = {
    activo: String(process.env.WA_AUTO_SYNC || 'false').toLowerCase() === 'true',
    esperaMs: num(process.env.WA_AUTO_SYNC_ESPERA_MS, 60_000),
    pausaAgendaMs: num(process.env.WA_CONTACTOS_PAUSA_MS, 20_000),
    repasoMs: num(process.env.WA_AUTO_SYNC_REPASO_MS, 6 * 3600_000),
    horaDesde: 9, horaHasta: 20,          // Madrid
};

const espera = (ms) => new Promise(r => setTimeout(r, ms));
const pendientes = new Map();             // id_cliente → motivo
let temporizador = null;
let corriendo = false;
const historial = [];                     // lo último que ha hecho, para el panel
function anotar(x) {
    historial.unshift({ at: new Date().toISOString(), ...x });
    historial.length = Math.min(historial.length, 40);
}

/** Apunta un cliente para sincronizar su WhatsApp en breve. Nunca lanza. */
function programarCliente(idCliente, motivo = '') {
    try {
        if (!CONFIG.activo || !idCliente) return;
        pendientes.set(String(idCliente), motivo);
        if (!temporizador) temporizador = setTimeout(() => { temporizador = null; procesar().catch(() => {}); }, CONFIG.esperaMs);
    } catch { /* nunca tumba lo que lo llamó */ }
}

/** El nº de obra al que apunta el contacto del titular (o null si es dudoso). */
async function renombrarTitular(c, rel, { dryRun = false } = {}) {
    const n = nueve(c.tlf);
    if (!n) return { accion: 'sin_telefono' };
    const info = await contactos.datos(`34${n}@c.us`);
    const p = leerPrefijo(info.nombre);
    if (!p) return { accion: 'sin_prefijo' };   // solo la convención de la casa
    const obra = obraDelContacto(rel, p.ficha);
    if (!obra || obra.ambiguo) return { accion: obra?.ambiguo ? 'ambiguo' : 'sin_obra' };
    const { renombrarUno } = require('./whatsappNombresClientes');
    return renombrarUno({ telefono: n, codigo: obra.numero, dryRun });
}

/**
 * EN SECO: lo que el automático le haría a ESTE cliente (etiquetas del chat y
 * nombre en la agenda), sin tocar nada. Para revisarlo antes de encenderlo.
 * Funciona aunque `WA_AUTO_SYNC` esté apagado.
 */
async function probarCliente(idCliente) {
    if (!whatsappService.isReady()) {
        const e = new Error('WhatsApp no está conectado.');
        e.status = 503;
        throw e;
    }
    const waClientesSync = require('./whatsappClientesSync');
    const etiquetas = await waClientesSync.sincronizar({ dryRun: true, ids: [String(idCliente)], limite: 5, pausaMs: 0 });
    const { data: c, error } = await supabase.from('clientes').select('id_cliente, tlf').eq('id_cliente', idCliente).maybeSingle();
    if (error || !c) {
        const e = new Error(error ? 'La base de datos no responde.' : 'Cliente no encontrado.');
        e.status = error ? 503 : 404;
        throw e;
    }
    const veto = await waClientesSync.telefonosVetados((await supabase.from('clientes').select('tlf')).data || []);
    const rel = await cargarRelaciones([c.id_cliente], { internos: true });
    const nombre = veto.has(nueve(c.tlf))
        ? { accion: 'vetado', motivo: veto.get(nueve(c.tlf)) }
        : await renombrarTitular(c, rel.get(c.id_cliente), { dryRun: true });
    return {
        activo: CONFIG.activo,
        etiquetas: { cambios: etiquetas.detalle, yaAlDia: etiquetas.yaAlDia, sinConversacion: etiquetas.sinConversacion,
            vetados: etiquetas.vetados, faltanEtiquetas: etiquetas.faltanEtiquetas },
        nombre,
    };
}

async function procesar() {
    if (corriendo) { programarDeNuevo(); return; }
    if (!whatsappService.isReady()) { programarDeNuevo(5 * 60_000); return; }
    corriendo = true;
    const lote = new Map(pendientes);
    pendientes.clear();
    try {
        const ids = [...lote.keys()];
        const waClientesSync = require('./whatsappClientesSync');
        const etiquetas = await waClientesSync.sincronizar({ dryRun: false, ids, limite: ids.length + 5, pausaMs: 1500 });
        anotar({ que: 'etiquetas', clientes: ids.length, cambiados: etiquetas.cambiados, errores: etiquetas.errores.length });

        const { data: fichas, error } = await supabase.from('clientes').select('id_cliente, tlf').in('id_cliente', ids);
        if (error) throw new Error(error.message);
        const veto = await waClientesSync.telefonosVetados(
            (await supabase.from('clientes').select('tlf')).data || []);
        const rel = await cargarRelaciones(ids, { internos: true });
        for (const c of fichas || []) {
            if (veto.has(nueve(c.tlf))) continue;
            try {
                const r = await renombrarTitular(c, rel.get(c.id_cliente));
                if (r.accion === 'renombrado') {
                    anotar({ que: 'nombre', cliente: c.id_cliente, antes: r.antes, despues: r.despues, motivo: lote.get(c.id_cliente) });
                    await espera(CONFIG.pausaAgendaMs);
                }
            } catch (e) {
                anotar({ que: 'nombre', cliente: c.id_cliente, error: e.message });
                if (e.limitado) break;           // 429: se para hasta el próximo repaso
            }
        }
        // El nombre de WhatsApp que guarda la ficha para el buscador.
        const waAgenda = require('./whatsappAgenda');
        waAgenda.olvidarAgenda();
        for (const id of ids) { try { await waAgenda.whatsappDeCliente(id); } catch { /* siguiente */ } }
    } catch (e) {
        anotar({ que: 'error', error: e.message });
        for (const [k, v] of lote) if (!pendientes.has(k)) pendientes.set(k, v);   // se reintenta
        programarDeNuevo(5 * 60_000);
    } finally {
        corriendo = false;
    }
}

function programarDeNuevo(ms = CONFIG.esperaMs) {
    if (!temporizador && pendientes.size) temporizador = setTimeout(() => { temporizador = null; procesar().catch(() => {}); }, ms);
}

const horaMadrid = () => Number(new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', hourCycle: 'h23' }).format(new Date()));

/**
 * El REPASO de todo: etiquetas de toda la cartera (a trozos), nombres de la
 * agenda con prefijo (a trozos y despacio) y el nombre de WhatsApp de cada ficha
 * para el buscador. Devuelve el informe; `forzar` salta el horario.
 */
async function repasar({ forzar = false } = {}) {
    if (!forzar && (!CONFIG.activo || horaMadrid() < CONFIG.horaDesde || horaMadrid() >= CONFIG.horaHasta)) {
        return { saltado: true };
    }
    if (!whatsappService.isReady()) return { saltado: true, motivo: 'WhatsApp no está conectado' };
    const informe = { etiquetas: 0, nombres: 0, buscador: null, limitado: false };
    const waClientesSync = require('./whatsappClientesSync');
    let desde = 0;
    for (let i = 0; i < 100 && desde != null; i++) {
        const r = await waClientesSync.sincronizar({ dryRun: false, desde });
        informe.etiquetas += r.cambiados;
        if (r.abortado) { informe.abortado = r.abortado; break; }
        desde = r.siguiente;
    }
    const { renombrar } = require('./whatsappNombresClientes');
    let despuesDe = null;
    for (let i = 0; i < 200; i++) {
        const r = await renombrar({ dryRun: false, despuesDe });
        informe.nombres += r.renombrados;
        if (r.limitado || r.abortado) { informe.limitado = !!r.limitado; break; }
        if (!r.siguiente) break;
        despuesDe = r.siguiente;
        await espera(CONFIG.pausaAgendaMs);   // el límite de la agenda: una edición cada 20 s
    }
    const waAgenda = require('./whatsappAgenda');
    waAgenda.olvidarAgenda();
    informe.buscador = await waAgenda.sincronizarNombres({ dryRun: false });
    anotar({ que: 'repaso', ...informe, buscador: informe.buscador?.cambios });
    return informe;
}

let intervalo = null;
/** Arranca el repaso periódico (lo llama server.js). Apagado si `WA_AUTO_SYNC` no está. */
function iniciar() {
    if (!CONFIG.activo || intervalo) return;
    intervalo = setInterval(() => { repasar().catch(e => anotar({ que: 'error', error: e.message })); }, CONFIG.repasoMs);
    if (intervalo.unref) intervalo.unref();
    console.log(`[wa-auto] Sincronización automática de WhatsApp ACTIVA (repaso cada ${Math.round(CONFIG.repasoMs / 3600_000)} h).`);
}

function estado() {
    return { activo: CONFIG.activo, pendientes: pendientes.size, corriendo, historial };
}

module.exports = { programarCliente, probarCliente, repasar, iniciar, estado, CONFIG };
