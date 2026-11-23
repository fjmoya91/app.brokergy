// =============================================================================
// El MOTOR del presupuesto del instalador, sin canal (fase 6, 22/11/2026).
//
// Lo usan los DOS sitios donde el instalador pide un presupuesto hablando:
//   - el grupo de WhatsApp (`presupuestoGrupoWhatsapp.js`): el modelo solo EXTRAE y la
//     conversación la lleva el código (regla 238);
//   - el asistente de la app (`asistenteInstalador.js`): el modelo llama a una
//     herramienta con los MISMOS campos, que se validan con el MISMO `validar` del
//     extractor y se resuelven aquí.
//
// Aquí está lo que decide: qué se sabe ya (`fusionar`), qué falta (`faltaObra`), quién es
// el cliente (`clienteDelPedido`: SUYO, por DNI → teléfono → nombre; varios, a elegir),
// lo que va por defecto (`prepararObra`), y crear o cambiar el presupuesto por el servicio
// de siempre (`crearDelPedido` reintenta con el nº sugerido si el suyo está cogido;
// `cambiarDelPedido` conserva el nº). Lo que se le DICE al instalador lo pone cada canal.
//
// No escribe a nadie ni sabe de WhatsApp ni de HTTP: recibe el servicio de presupuestos
// (`S`: el real o el «sin guardar» del modo copia y del banco) y devuelve datos.
// =============================================================================

const path = require('path');
const { pathToFileURL } = require('url');

// ─── La lógica pura del presupuesto (ESM, la misma que la app) ───────────────
let _logica = null;
function logica() {
    if (!_logica) _logica = import(pathToFileURL(path.join(__dirname, '../../frontend/src/features/instalador/logic/presupuesto.js')).href);
    return _logica;
}

const limpio = (v) => (v === null || v === undefined ? '' : String(v).replace(/[\u0000-\u001f\u007f`]+/g, ' ').replace(/\s+/g, ' ').trim());
const idDe = (c) => c?.id_cliente ?? c?.id ?? null;
const nombreDe = (c) => limpio([c?.nombre || c?.nombre_razon_social, c?.apellidos].filter(Boolean).join(' '));
const titulo = (s) => limpio(s).toLowerCase().replace(/(^|[\s-])([a-záéíóúñü])/g, (m, a, b) => a + b.toUpperCase());
const mascara = (t) => { const d = String(t || '').replace(/\D/g, ''); return d.length >= 3 ? `···${d.slice(-3)}` : ''; };
const hoy = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(d);
const eleccionDe = (txt) => { const m = /^\s*(?:el|la|opci[oó]n|n[uú]mero|n[ºo°])?\s*(\d{1,2})\s*[.)ºª]?\s*$/i.exec(String(txt || '')); return m ? Number(m[1]) : null; };

/** Los catálogos que se le enseñan al modelo y con los que se valida lo que devuelve. */
function catalogosDe(L) {
    return { TIPOS_OBRA: L.TIPOS_OBRA, COMBUSTIBLES: L.COMBUSTIBLES, EMISORES: L.EMISORES, EXTRAS: L.EXTRAS.map(e => ({ clave: e.clave, etiqueta: e.etiqueta, litros: e.litros || null })) };
}

// ─── El estado del pedido (puro) ─────────────────────────────────────────────

/** Mezcla lo extraído en lo que ya se sabía: lo dicho ahora MANDA; lo no dicho no borra. Pura. */
function fusionar(p, ext) {
    const n = JSON.parse(JSON.stringify(p || {}));
    n.cliente = n.cliente || {};
    for (const [k, v] of Object.entries(ext.cliente || {})) if (v) n.cliente[k] = v;
    n.obra = n.obra || {};
    const o = ext.obra || {};
    if (o.tipo === 'aerotermia_acs') { n.obra.tipo = 'aerotermia'; n.obra.acs = true; } else if (o.tipo) n.obra.tipo = o.tipo;
    const eq = o.equipo || {};
    n.obra.equipo = { ...(n.obra.equipo || {}) };
    for (const k of ['marca', 'modelo', 'potencia_kw']) if (eq[k] !== null && eq[k] !== undefined) n.obra.equipo[k] = eq[k];
    if (o.caldera?.combustible) n.obra.caldera = { combustible: o.caldera.combustible };
    if (o.acs === true || o.acs === false) n.obra.acs = o.acs;
    if (o.emisor) n.obra.emisor = o.emisor;
    for (const k of ['direccion', 'municipio', 'descripcion']) if (o[k]) n.obra[k] = o[k];
    if ((o.extras || []).length || (o.extras_quitar || []).length) {
        const lista = Array.isArray(n.obra.extras) ? n.obra.extras.filter(Boolean) : [];
        for (const e of o.extras || []) {
            const i = lista.findIndex(x => x.clave === e.clave);
            if (i >= 0) lista[i] = { ...lista[i], ...e }; else lista.push(e);
        }
        n.obra.extras = lista.filter(x => !(o.extras_quitar || []).some(q => q.clave === x.clave));
        n.quitados = [...new Set([...(n.quitados || []), ...(o.extras_quitar || []).map(q => q.clave)])]
            .filter(k => !(o.extras || []).some(e => e.clave === k));
    }
    if (ext.importe !== null && ext.importe !== undefined) { n.importe = ext.importe; n.con_iva = !!ext.con_iva; }
    if (['simulacion', 'ambos'].includes(ext.quiere)) n.quiere_sim = true;
    return n;
}

/** ¿Ha dicho algo que sirva? Pura. */
function hayAlgo(ext) {
    if (!ext) return false;
    if (ext.quiere !== 'nada') return true;
    const o = ext.obra || {};
    return Object.values(ext.cliente || {}).some(Boolean) || !!o.tipo || Object.values(o.equipo || {}).some(v => v !== null)
        || !!o.caldera?.combustible || o.acs !== null || !!o.emisor || (o.extras || []).length > 0 || (o.extras_quitar || []).length > 0
        || !!o.direccion || !!o.descripcion || ext.importe !== null || !!ext.respuesta_vivienda || !!ext.eleccion
        || !!ext.numero_otro || !!ext.referencia_catastral;
}

/** Lo que falta de la OBRA para hacer el presupuesto, en una frase. Pura. */
function faltaObra(p) {
    const o = p.obra || {};
    const falta = [];
    if (!o.tipo) falta.push('qué obra es (cambio de caldera por aerotermia, solo agua caliente, aire acondicionado u otra)');
    else if (o.tipo === 'otro' && !o.descripcion) falta.push('qué incluye la obra');
    if (!(p.importe > 0)) falta.push('el precio (y si es con el IVA incluido o más IVA)');
    return falta.length ? `Para hacerlo me falta ${falta.join(' y ')}.` : null;
}

/** Si no dice el tipo pero sí un equipo o la caldera que se quita, es una aerotermia (lo decide la casa). Pura. */
function conTipoPorDefecto(p) {
    const o = p.obra || {};
    if (!o.tipo && (o.equipo?.marca || o.equipo?.modelo || o.caldera?.combustible)) return { ...p, obra: { ...o, tipo: 'aerotermia' } };
    return p;
}

/** La entrada del servicio de presupuestos. Pura. */
function entradaDe(p, opciones, ahora) {
    const o = p.obra || {};
    const obra = {
        tipo: o.tipo,
        direccion: o.direccion || p.cliente?.direccion || '',
        codigo_postal: o.codigo_postal || p.cliente?.codigo_postal || '',
        municipio: o.municipio || p.cliente?.municipio || '',
        provincia: o.provincia || p.cliente?.provincia || '',
        equipo: { aerotermia_id: null, marca: o.equipo?.marca || '', modelo: o.equipo?.modelo || '', potencia_kw: o.equipo?.potencia_kw ?? null },
        caldera: { combustible: o.caldera?.combustible || null },
        acs: o.acs === true,
        emisor: o.emisor || 'radiadores',
        extras: o.extras || [],
        descripcion: o.descripcion || '',
        ...(p.vivienda?.rc ? { ref_catastral: p.vivienda.rc } : {}),
    };
    return {
        numero: p.presupuesto?.numero || opciones?.numero,
        fecha: p.presupuesto?.fecha || opciones?.fecha || hoy(ahora),
        ...(p.cliente_id ? { cliente_id: p.cliente_id } : { cliente: { ...p.cliente } }),
        obra,
        modo: 'total',
        total: String(p.importe),
        con_iva: !!p.con_iva,
        iva_pct: opciones?.iva_pct ?? 21,
        notas: opciones?.notas ?? '',
        validez_dias: opciones?.validez_dias ?? 30,
    };
}

// Lo del cliente que se CORRIGE al cambiar un presupuesto (en su ficha también). Nombre y DNI no:
// cambian QUIÉN es y van por la app (presupuestoInstaladorService · CLIENTE_CORREGIBLE).
const CLIENTE_CORREGIBLE = ['direccion', 'codigo_postal', 'municipio', 'provincia', 'tlf'];
/** Del cliente, lo corregible que tenga escrito (lo que ha dicho el instalador). Pura. */
const dichoDelCliente = (c) => Object.fromEntries(CLIENTE_CORREGIBLE.filter(k => limpio(c?.[k])).map(k => [k, limpio(c[k])]));
const igual = (a, b) => limpio(a).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
    === limpio(b).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

/**
 * Los datos del cliente que ha dicho y son DISTINTOS de lo que ya tiene el pedido (`p`): eso es una
 * corrección («la localidad es Argamasilla de Alba»), no una repetición. Pura.
 */
function correccionCliente(ext, p = null) {
    const c = ext?.cliente || {};
    const ya = p?.cliente || {};
    return Object.fromEntries(CLIENTE_CORREGIBLE.filter(k => limpio(c[k]) && !igual(c[k], ya[k])).map(k => [k, limpio(c[k])]));
}

/**
 * ¿Lo que ha dicho cambia el presupuesto ya hecho? (importe, extras, equipo y, con el pedido `p`,
 * un dato del cliente o de la obra distinto del que tiene). Pura.
 */
function cambiaElPresupuesto(ext, p = null) {
    const o = ext.obra || {};
    if (ext.importe !== null || (o.extras || []).length > 0 || (o.extras_quitar || []).length > 0
        || !!o.equipo?.marca || !!o.equipo?.modelo || o.equipo?.potencia_kw !== null && o.equipo?.potencia_kw !== undefined) return true;
    if (!p) return false;
    return Object.keys(correccionCliente(ext, p)).length > 0
        || ['direccion', 'municipio'].some(k => limpio(o[k]) && !igual(o[k], p.obra?.[k]));
}

/**
 * Lo que ha cambiado en lo IMPRESO entre dos filas del presupuesto, en palabras del instalador.
 * Vacío = el PDF sale igual (y no se le manda otra vez diciendo «actualizado»). Pura.
 */
function queCambia(antes, despues, eur = (n) => `${n} €`) {
    if (!antes || !despues) return null;
    const out = [];
    const nombres = { direccion: 'dirección', codigo_postal: 'código postal', municipio: 'localidad', provincia: 'provincia', tlf: 'teléfono' };
    for (const [k, txt] of Object.entries(nombres)) {
        const a = antes.cliente?.[k] || ''; const d = despues.cliente?.[k] || '';
        if (!igual(a, d)) out.push(`${txt}: ${d ? titulo(d) : '(vacío)'}`);
    }
    for (const k of ['direccion', 'municipio']) {
        const a = antes.obra?.[k] || ''; const d = despues.obra?.[k] || '';
        if (!igual(a, d) && !out.some(x => x.startsWith(nombres[k]))) out.push(`${nombres[k]} de la obra: ${d ? titulo(d) : '(vacía)'}`);
    }
    if (Number(antes.base) !== Number(despues.base) || Number(antes.total) !== Number(despues.total)) out.push(`precio: ${eur(despues.base)} + IVA`);
    const lineas = (f) => (Array.isArray(f.lineas) ? f.lineas : []).map(l => limpio(l.texto)).join('\n');
    if (lineas(antes) !== lineas(despues)) out.push('lo que incluye');
    return out;
}

/** De la ficha del cliente, solo los datos que se imprimen / encargan (nada de ids internos ni JSONB). */
function soloDatos(c) {
    if (!c) return {};
    const nombre = c.nombre || c.nombre_razon_social || null;
    const r = { nombre, apellidos: c.apellidos || null, dni: c.dni || c.nif || null, tlf: c.tlf || c.telefono || null, direccion: c.direccion || null, codigo_postal: c.codigo_postal || null, municipio: c.municipio || null, provincia: c.provincia || null };
    return Object.fromEntries(Object.entries(r).filter(([, v]) => v));
}

/**
 * El pedido de un presupuesto YA HECHO, para cambiarlo: lo que hay en su fila, con la
 * forma de `fusionar`. Así «ponle 9.500» se mezcla sobre lo que tiene y no sobre nada. Pura.
 */
function pedidoDesdeFila(fila, entradaDesdeFila) {
    const e = entradaDesdeFila(fila);
    const o = e.obra || {};
    return {
        cliente_id: fila.cliente_id || null,
        cliente: soloDatos({ ...e.cliente, nif: fila.cliente?.nif }),
        obra: {
            tipo: o.tipo || null, equipo: { marca: o.equipo?.marca || '', modelo: o.equipo?.modelo || '', potencia_kw: o.equipo?.potencia_kw ?? null },
            caldera: { combustible: o.caldera?.combustible || null }, acs: o.acs === true, emisor: o.emisor || 'radiadores',
            extras: Array.isArray(o.extras) ? o.extras : [], direccion: o.direccion || '', municipio: o.municipio || '',
            codigo_postal: o.codigo_postal || '', provincia: o.provincia || '', descripcion: o.descripcion || '',
        },
        importe: Number(e.total) || 0,
        con_iva: !!e.con_iva,
        presupuesto: { id: fila.id, numero: fila.numero, fecha: fila.fecha, base: fila.base, total: fila.total },
        ...(o.ref_catastral ? { vivienda: { rc: o.ref_catastral } } : {}),
    };
}

// ─── Los pasos (con el servicio inyectado) ───────────────────────────────────

/** Las opciones de un presupuesto nuevo (nº, fecha, IVA, notas, validez, quién lo firma). */
async function opcionesDe(S, prescriptorId) {
    const o = await S.opcionesNuevo({ prescriptorId });
    return { numero: o.numero, fecha: o.fecha, iva_pct: o.iva_pct, notas: o.notas, validez_dias: o.validez_dias, emisor: o.emisor?.nombre || null };
}

/**
 * El CLIENTE del pedido, antes de nada. Toca `p` (cliente_id, cliente, candidatos, lista).
 * @returns {Promise<{ listo: true } | { pregunta: 'cliente' } | { pregunta: 'contacto', nombre }
 *   | { pregunta: 'candidatos', candidatos, lista } | { pregunta: 'eleccion', n }>}
 */
async function clienteDelPedido(S, { prescriptorId, usuarioId = null, p, eleccion = null }) {
    if (p.cliente_id || p.cliente_listo) return { listo: true };
    if (p.candidatos?.length && eleccion) {
        const c = p.candidatos[eleccion - 1];
        if (!c) return { pregunta: 'eleccion', n: p.candidatos.length };
        const rc = await S.resolverCliente({ prescriptorId, usuarioId, clienteId: c.id });
        p.cliente_id = idDe(rc.cliente) || c.id; p.cliente = { ...p.cliente, ...soloDatos(rc.cliente), ...dichoDelCliente(p.cliente) };
        delete p.candidatos; delete p.lista;
        return { listo: true };
    }
    const c = p.cliente || {};
    if (!c.nombre) return { pregunta: 'cliente' };
    if (!c.tlf && !c.direccion && !c.dni) return { pregunta: 'contacto', nombre: titulo(nombreDe(c)) };
    const rc = await S.resolverCliente({ prescriptorId, usuarioId, cliente: c });
    if (rc.candidatos?.length > 1) {
        p.candidatos = rc.candidatos.slice(0, 9).map(x => ({ id: idDe(x), nombre: nombreDe(x), municipio: x.municipio || null, tlf: mascara(x.tlf) }));
        p.lista = p.candidatos.map(x => `${titulo(x.nombre)}${x.municipio ? ` (${titulo(x.municipio)}${x.tlf ? `, ${x.tlf}` : ''})` : x.tlf ? ` (${x.tlf})` : ''}`);
        return { pregunta: 'candidatos', candidatos: p.candidatos, lista: p.lista };
    }
    p.cliente_id = idDe(rc.cliente);
    p.cliente = { ...c, ...soloDatos(rc.cliente), ...dichoDelCliente(c) };
    p.cliente_creado = !!rc.creado;
    if (!p.cliente_id) p.cliente_listo = true;      // sin guardar (modo copia / banco): con los datos tal cual
    return { listo: true };
}

/**
 * La OBRA y el IMPORTE: tipo por defecto, qué falta y lo que va marcado por defecto (retirar
 * la caldera en una sustitución) más lo dicho, salvo lo que haya pedido quitar.
 * @returns {{ p, falta: string|null, espera?: 'obra'|'importe' }}  (`p` puede ser otro objeto)
 */
function prepararObra(p, L) {
    const q = conTipoPorDefecto(p);
    const falta = faltaObra(q);
    if (falta) return { p: q, falta, espera: !q.obra?.tipo ? 'obra' : 'importe' };
    const dichos = q.obra.extras || [];
    q.obra.extras = [...dichos, ...L.extrasPorDefecto(q.obra)
        .filter(d => !dichos.some(x => x.clave === d.clave) && !(q.quitados || []).includes(d.clave))];
    return { p: q, falta: null };
}

/**
 * Se CREA por el servicio de siempre; si su nº ya está cogido, una vez más con el sugerido.
 * Lo que ha DICHO del cliente (dirección, localidad, CP, provincia, teléfono) va como
 * `corregirCliente`: es lo que se imprime aunque su ficha diga otra cosa (23/11/2026, RCA: la ficha
 * de Gregoria González decía «La Macía de Alba», mal oído, y él dictó «Argamasilla de Alba»).
 */
async function crearDelPedido(S, { prescriptorId, usuarioId = null, origen, p, op, ahora }) {
    let entrada = entradaDe(p, op, ahora);
    const d = dichoDelCliente(p.cliente);
    const corregirCliente = Object.keys(d).length ? d : null;
    let filaP;
    try {
        filaP = await S.crear({ prescriptorId, usuarioId, origen, entrada, corregirCliente });
    } catch (e) {
        if (e.status === 409 && e.code === 'NUMERO_REPETIDO' && e.sugerido) {
            entrada = { ...entrada, numero: e.sugerido };
            filaP = await S.crear({ prescriptorId, usuarioId, origen, entrada, corregirCliente });
        } else throw e;
    }
    return { filaP, entrada };
}

/**
 * Se CAMBIA el presupuesto ya hecho, con el MISMO nº y fecha, sobre el MISMO cliente (el de la
 * fila: buscarlo otra vez por el nombre podría dar otro) y corrigiendo en su ficha lo que el
 * pedido dice distinto de lo que salió IMPRESO (dirección, localidad, CP, provincia, teléfono).
 * Devuelve también `cambios` (de `queCambia`; `null` si no se pudo leer cómo estaba).
 */
async function cambiarDelPedido(S, { prescriptorId, usuarioId = null, p, op, ahora, eur }) {
    const antes = S.obtener ? await S.obtener(prescriptorId, p.presupuesto.id).catch(() => null) : null;
    const clienteId = p.cliente_id || antes?.cliente_id || null;
    const base = entradaDe(clienteId ? { ...p, cliente_id: clienteId } : p, op, ahora);
    const entrada = { ...base, numero: p.presupuesto.numero, fecha: p.presupuesto.fecha };
    const corregir = antes ? correccionCliente({ cliente: p.cliente }, { cliente: antes.cliente }) : {};
    const corregirCliente = Object.keys(corregir).length ? corregir : null;
    const filaP = await S.actualizar({ prescriptorId, usuarioId, id: p.presupuesto.id, entrada, corregirCliente });
    if (filaP?.cliente_id) p.cliente_id = filaP.cliente_id;
    return { filaP, entrada, cambios: queCambia(antes, filaP, eur) };
}

module.exports = {
    logica, catalogosDe,
    fusionar, hayAlgo, faltaObra, conTipoPorDefecto, entradaDe, cambiaElPresupuesto, correccionCliente, queCambia, soloDatos, pedidoDesdeFila,
    opcionesDe, clienteDelPedido, prepararObra, crearDelPedido, cambiarDelPedido,
    // utilidades que comparten los dos canales
    limpio, idDe, nombreDe, titulo, mascara, hoy, eleccionDe,
};
