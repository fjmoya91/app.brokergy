/**
 * whatsappClientesSync — el chat de cada cliente, con su TIPO y su ESTADO.
 *
 * Gemelo de `whatsappInstaladoresSync` para la cartera de clientes: deja el chat
 * del TITULAR con las etiquetas de lo que se le tramita (RES060 · RES080 ·
 * RES093 · TER100 · TER173 · CEE) y de en qué punto está (EN CURSO · PROPUESTA ·
 * CERRADO). Tipo y estado salen de la MISMA función que pinta el listado de
 * Clientes (`clientesEtiquetas.js`), con los MISMOS datos (`clientesRelaciones`):
 * el chat no puede decir una cosa y la pantalla otra.
 *
 * ─── REGLAS ───────────────────────────────────────────────────────────────────
 *
 * REGLA — solo se usan etiquetas que YA EXISTEN en WhatsApp. No se pueden crear
 * desde aquí (WhatsApp no lo expone), así que lo que no exista se dice en el
 * informe ("crea RES093 en el móvil") y se sigue con el resto.
 *
 * REGLA — el TIPO se añade y no se quita nunca; el ESTADO es EXCLUSIVO. Un
 * cliente que tuvo un RES080 lo sigue teniendo aunque esté cerrado, pero no
 * puede estar a la vez "EN CURSO" y "CERRADO": al poner uno se quitan los otros
 * estados GESTIONADOS (y solo esos). Las demás etiquetas del chat (Pagado, SAT…)
 * son trabajo de otra persona y viajan intactas, porque `poner()` deja la lista
 * COMPLETA que se le mande.
 *
 * REGLA — solo el teléfono del TITULAR, y solo si es INEQUÍVOCO. Se salta:
 *   · el número que es de un PARTNER (su ficha, su responsable o un contacto de
 *     notificación): hay fichas de cliente con el móvil del instalador, y
 *     etiquetarlo pondría "CERRADO" en el chat donde se habla de TREINTA obras;
 *   · el número que comparten VARIOS clientes (medido: uno está en cinco fichas).
 * Tampoco la persona de contacto: muchas veces es el comercial del partner.
 *
 * REGLA — no se CREAN chats. Solo se etiquetan conversaciones que ya existen
 * (`chatAbierto`): abrir cuatrocientos chats vacíos llenaría la lista del móvil.
 *
 * ⚠️ Habla con la sesión REAL del VPS, de la que dependen todos los envíos:
 * `dryRun` por defecto, pausa entre chats, a TROZOS (nginx corta al minuto) y
 * se corta tras varios tiempos de espera seguidos.
 */

const path = require('path');
const { pathToFileURL } = require('url');
const supabase = require('./supabaseClient');
const waLabels = require('./whatsappLabels');
const { cargarRelaciones } = require('./clientesRelaciones');

const PAUSA_MS = Number(process.env.WA_SYNC_PAUSA_MS || 1500);
const FALLOS_SEGUIDOS_MAX = Number(process.env.WA_SYNC_FALLOS_MAX || 3);
const LIMITE = Number(process.env.WA_SYNC_LIMITE || 12);

// Nombre de la etiqueta en WhatsApp para cada tipo y estado. Se admiten
// variantes porque la etiqueta la crea una persona desde el móvil.
const ETIQUETAS_TIPO = {
    RES060: ['RES060'], RES080: ['RES080'], RES093: ['RES093'],
    TER100: ['TER100'], TER173: ['TER173'], CEE: ['CEE', 'CEE DIRECTO', 'CEE DIRECTOS'],
};
const ETIQUETAS_ESTADO = {
    EN_CURSO: ['EN CURSO'],
    PROPUESTA: ['PROPUESTA', 'PROPUESTA ENVIADA'],
    CERRADO: ['CERRADO', 'FINALIZADO'],
};

const espera = (ms) => new Promise(r => setTimeout(r, ms));
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
const nueve = (t) => { const d = String(t || '').replace(/\D/g, ''); return d.length >= 9 ? d.slice(-9) : null; };

let _logica = null;
function logica() {
    if (!_logica) {
        _logica = import(pathToFileURL(path.join(__dirname,
            '../../frontend/src/features/clientes/logic/clientesEtiquetas.js')).href);
    }
    return _logica;
}

/** Resuelve cada tipo/estado a la etiqueta real de la cuenta (o null si no existe). */
function resolverEtiquetas(existentes) {
    const porNombre = new Map(existentes.map(l => [norm(l.name), l]));
    const buscar = (nombres) => nombres.map(n => porNombre.get(norm(n))).find(Boolean) || null;
    const tipo = {}, estado = {}, faltan = [];
    for (const [k, ns] of Object.entries(ETIQUETAS_TIPO)) { tipo[k] = buscar(ns); if (!tipo[k]) faltan.push(ns[0]); }
    for (const [k, ns] of Object.entries(ETIQUETAS_ESTADO)) { estado[k] = buscar(ns); if (!estado[k]) faltan.push(ns[0]); }
    return { tipo, estado, faltan };
}

/** Teléfonos que NO se pueden atribuir a un solo cliente. */
async function telefonosVetados(clientes) {
    const veto = new Map(); // nueve → motivo
    const { data: partners, error } = await supabase.from('prescriptores')
        .select('razon_social, tlf, tlf_responsable, contactos_notificacion');
    if (error) throw new Error(`No se han podido leer los partners: ${error.message}`);
    for (const p of partners || []) {
        const tels = [p.tlf, p.tlf_responsable,
            ...(Array.isArray(p.contactos_notificacion) ? p.contactos_notificacion.map(c => c?.tlf) : [])];
        for (const t of tels) { const n = nueve(t); if (n) veto.set(n, `es un teléfono de ${p.razon_social}`); }
    }
    const cuenta = new Map();
    for (const c of clientes) { const n = nueve(c.tlf); if (n) cuenta.set(n, (cuenta.get(n) || 0) + 1); }
    for (const [n, k] of cuenta) if (k > 1 && !veto.has(n)) veto.set(n, `lo comparten ${k} clientes`);
    return veto;
}

/**
 * Qué etiquetas debe llevar el chat: las que ya tiene, MÁS sus tipos, con su
 * estado actual en lugar de los otros estados gestionados.
 */
function etiquetasObjetivo(actuales, { tipos, estado }, mapa) {
    const idsEstado = new Set(Object.values(mapa.estado).filter(Boolean).map(l => String(l.id)));
    const set = new Set(actuales.map(String));
    const añadir = [], quitar = [];
    for (const t of tipos) {
        const l = mapa.tipo[t];
        if (l && !set.has(String(l.id))) { set.add(String(l.id)); añadir.push(l.name); }
    }
    const le = estado && mapa.estado[estado];
    if (le) {
        for (const id of [...set]) {
            if (idsEstado.has(id) && id !== String(le.id)) {
                set.delete(id);
                quitar.push(Object.values(mapa.estado).find(x => x && String(x.id) === id)?.name || id);
            }
        }
        if (!set.has(String(le.id))) { set.add(String(le.id)); añadir.push(le.name); }
    }
    return { lista: [...set], añadir, quitar };
}

/**
 * Repasa la cartera. `desde` es el índice por el que seguir: va a trozos de
 * `limite` teléfonos y devuelve `siguiente` hasta que es null.
 */
async function sincronizar({ dryRun = true, desde = 0, pausaMs = PAUSA_MS, limite = LIMITE } = {}) {
    const mapa = resolverEtiquetas(await waLabels.listar());
    const { etiquetasCliente, estadoCliente } = await logica();

    const { data: clientes, error } = await supabase.from('clientes')
        .select('id_cliente, nombre_razon_social, apellidos, tlf').order('id_cliente');
    if (error) throw new Error(`No se han podido leer los clientes: ${error.message}`);
    const rel = await cargarRelaciones(clientes.map(c => c.id_cliente), { internos: true });
    const veto = await telefonosVetados(clientes);

    const candidatos = [];
    const informe = {
        dryRun, faltanEtiquetas: mapa.faltan, clientes: clientes.length,
        candidatos: 0, cambiados: 0, yaAlDia: 0, sinConversacion: 0,
        vetados: [], errores: [], detalle: [], siguiente: null,
    };
    for (const c of clientes) {
        const r = { ...c, ...(rel.get(c.id_cliente) || {}) };
        // También los tipos solo PRESUPUESTADOS: en el chat interesa ver que
        // se le propuso un RES080 aunque aún no tenga expediente.
        const tipos = etiquetasCliente(r).map(t => t.tipo);
        const estadoRaw = estadoCliente(r);
        const estado = ETIQUETAS_ESTADO[estadoRaw] ? estadoRaw : null;
        if (!tipos.length && !estado) continue;
        const nombre = `${c.nombre_razon_social || ''} ${c.apellidos || ''}`.trim();
        const n = nueve(c.tlf);
        if (!n) continue;
        if (veto.has(n)) { informe.vetados.push({ cliente: nombre, tlf: n, motivo: veto.get(n) }); continue; }
        candidatos.push({ nombre, n, tipos, estado });
    }
    informe.candidatos = candidatos.length;

    let fallosSeguidos = 0;
    const fin = Math.min(candidatos.length, desde + limite);
    for (let i = desde; i < fin; i++) {
        const cand = candidatos[i];
        try {
            const chatId = await waLabels.chatAbierto(cand.n);
            fallosSeguidos = 0;
            if (!chatId) { informe.sinConversacion++; continue; }
            const actuales = await waLabels.deChat(chatId);
            const obj = etiquetasObjetivo(actuales, cand, mapa);
            if (!obj.añadir.length && !obj.quitar.length) { informe.yaAlDia++; continue; }
            if (!dryRun) await waLabels.poner(chatId, obj.lista);
            informe.cambiados++;
            informe.detalle.push({ cliente: cand.nombre, tlf: cand.n, añadir: obj.añadir, quitar: obj.quitar });
        } catch (err) {
            informe.errores.push({ cliente: cand.nombre, tlf: cand.n, error: err.message });
            fallosSeguidos = err.plazoAgotado ? fallosSeguidos + 1 : 0;
            if (fallosSeguidos >= FALLOS_SEGUIDOS_MAX) {
                informe.abortado = `${fallosSeguidos} tiempos de espera seguidos: la sesión de WhatsApp no responde. `
                    + 'Se corta para no seguir insistiendo; vuelve a lanzarlo cuando esté conectada.';
                return informe;
            }
        }
        if (pausaMs) await espera(pausaMs);
    }
    informe.siguiente = fin < candidatos.length ? fin : null;
    return informe;
}

module.exports = { sincronizar, etiquetasObjetivo, resolverEtiquetas, ETIQUETAS_TIPO, ETIQUETAS_ESTADO };
