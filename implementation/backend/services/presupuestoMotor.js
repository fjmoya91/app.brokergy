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
/** Un SÍ o un NO a secas («sí», «vale, esa», «no»), para cuando el modelo no lo ha marcado. Pura. */
const siNoDe = (txt) => {
    const t = String(txt || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (/^(si|sip|vale|ok|okey|claro|correcto|exacto|esa|es esa|esta|es esta|afirmativo)\b[\s.!,]*(es|esa|esta|la misma|perfecto|vale|gracias)?[\s.!]*$/.test(t)) return 'si';
    if (/^no\b[\s.!,]*(gracias|hace falta|de momento|por ahora)?[\s.!]*$/.test(t)) return 'no';
    return null;
};

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
async function clienteDelPedido(S, { prescriptorId, usuarioId = null, p, eleccion = null, respuesta = null, nuevo = false, conParecidos = false }) {
    if (p.cliente_id || p.cliente_listo) return { listo: true };
    // Contestando a «¿es este?» (los PARECIDOS): SÍ con uno, su número, o NUEVO/NO → se da de alta otro.
    if (p.candidatos?.length && p.parecidos) {
        if (!eleccion && respuesta === 'si' && p.candidatos.length === 1) eleccion = 1;
        if (!eleccion && (nuevo || respuesta === 'no')) {
            delete p.candidatos; delete p.lista; delete p.parecidos;
            p.cliente_nuevo = true;
        }
    }
    if (p.candidatos?.length && eleccion) {
        const c = p.candidatos[eleccion - 1];
        if (!c) return { pregunta: 'eleccion', n: p.candidatos.length };
        const rc = await S.resolverCliente({ prescriptorId, usuarioId, clienteId: c.id });
        p.cliente_id = idDe(rc.cliente) || c.id; p.cliente = { ...p.cliente, ...soloDatos(rc.cliente), ...dichoDelCliente(p.cliente) };
        delete p.candidatos; delete p.lista; delete p.parecidos;
        return { listo: true };
    }
    if (p.candidatos?.length && p.parecidos) return { pregunta: 'parecido', candidatos: p.candidatos, lista: p.lista };
    const c = p.cliente || {};
    if (!c.nombre) return { pregunta: 'cliente' };
    if (!c.tlf && !c.direccion && !c.dni) return { pregunta: 'contacto', nombre: titulo(nombreDe(c)) };
    const rc = await S.resolverCliente({ prescriptorId, usuarioId, cliente: c, parecidos: conParecidos && !p.cliente_nuevo });
    if (rc.parecidos?.length) {
        p.parecidos = true;
        p.candidatos = rc.parecidos.slice(0, 5).map(x => ({ id: x.id, nombre: x.nombre, municipio: x.municipio || null, direccion: x.direccion || null, tlf: x.tlf || null }));
        p.lista = p.candidatos.map(x => `${titulo(x.nombre)}${[x.direccion, x.municipio].filter(Boolean).length ? ` (${[x.direccion && titulo(String(x.direccion).split(',')[0]), x.municipio && titulo(x.municipio)].filter(Boolean).join(', ')})` : ''}`);
        return { pregunta: 'parecido', candidatos: p.candidatos, lista: p.lista };
    }
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

// ─── La VIVIENDA y el BONO, tras el presupuesto (23/11/2026) ─────────────────
// Fran: «cuando se le diga la dirección, nos confirme la fachada… cuando se haga el presupuesto ya
// se quede registrada la referencia catastral… ¿quieres que te calcule el bono energético? Y ya con
// eso: dime qué tipo de radiadores». El presupuesto sale PRIMERO y la vivienda no lo frena nunca;
// después, la foto del Catastro y, con el SÍ, la RC queda en el presupuesto aunque no pida el bono.
// Las preguntas del bono son SOLO lo que falta, de una en una. Lo usan el grupo (respuestas
// numeradas y SÍ/NO) y el asistente (botones); cada canal pone sus textos.

/** ¿Se le enseña la casa del Catastro tras el presupuesto? Solo en las obras con bono y con calle y pueblo. Pura. */
function conVivienda(obra, cliente = {}) {
    const tipo = obra?.tipo || 'aerotermia';
    return ['aerotermia', 'acs'].includes(tipo)
        && !!limpio(obra?.direccion || cliente?.direccion) && !!limpio(obra?.municipio || cliente?.municipio);
}

/**
 * Busca la vivienda en el Catastro (Google → Catastro EN SERIE, reglas 15-17: lo hace `V`).
 * Por la RC que diga, por otro número de la misma calle o por la dirección del presupuesto.
 * @returns {Promise<{ tipo: 'una'|'varias'|'ninguna'|'sin_direccion', viviendas?, rcFachada?, donde?, dir? }>}
 */
const sinTildes = (s) => limpio(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
/** Sin uso (lista de una parcela) se da por buena; con uso, solo el residencial. Pura. */
const esResidencial = (v) => !v?.uso || /residencial|vivienda/i.test(v.uso);
/** «Argamasilla» vale por «Argamasilla de Alba»; «Madrid» no vale por «Argamasilla de Alba». Pura. */
const mismoPueblo = (a, b) => !!a && !!b && (a.includes(b) || b.includes(a));

async function buscarVivienda(V, { direccion = '', municipio = '', provincia = '', rc = null, numeroOtro = null } = {}) {
    let dir = limpio(direccion);
    let res;
    if (rc) res = await V.porRc(rc);
    else if (numeroOtro && dir) { dir = V.cambiarNumero(dir, numeroOtro); res = await V.candidatos({ direccion: dir, municipio, provincia }); }
    else if (dir) res = await V.candidatos({ direccion: dir, municipio, provincia });
    else return { tipo: 'sin_direccion' };
    if (!res || res.tipo === 'ninguna') return { tipo: 'ninguna', dir };
    let viviendas = res.tipo === 'una' ? [res.vivienda] : (res.viviendas || []);
    // REGLA — por DIRECCIÓN solo vale una VIVIENDA del MISMO pueblo (23/11/2026, grupo de RCA: el audio
    // dio «calle Lambra 15», Google lo llevó a Madrid y se enseñó como la casa un recinto DEPORTIVO de
    // 137.955 m² en El Pardo). Lo que no es residencial, o es de otro municipio, es «no la encuentro».
    // Por la RC que dicta él no se filtra: la ha dicho él.
    if (!rc) {
        const pueblo = sinTildes(municipio);
        viviendas = viviendas.filter(v => esResidencial(v) && (!pueblo || mismoPueblo(pueblo, sinTildes(v.municipio))));
    }
    if (!viviendas.length) return { tipo: 'ninguna', dir };
    const donde = limpio([res.direccion || viviendas[0].direccion, viviendas[0].municipio].filter(Boolean).join(', ')).replace(/\s+\d{5}\b.*$/, '');
    return { tipo: viviendas.length === 1 ? 'una' : 'varias', viviendas, rcFachada: res.rcFachada || viviendas[0].rc, donde, dir };
}

/** Una línea de la lista de viviendas de un edificio: «1º B · 85 m²». Pura. */
const lineaVivienda = (v) => `${v.planta || limpio(v.direccion)}${v.superficie ? ` · ${v.superficie} m²` : ''}`;

/** Cuál ha elegido de las que se le enseñaron: por el nº de la lista, por la RC o con un SÍ si era una. Pura. */
function elegirVivienda(viviendas, { eleccion = null, si = false, rc = null } = {}) {
    const vs = Array.isArray(viviendas) ? viviendas : [];
    if (rc) { const r = limpio(rc).toUpperCase(); const v = vs.find(x => x.rc === r); if (v) return v; }
    if (eleccion && vs[eleccion - 1]) return vs[eleccion - 1];
    if (si && vs.length === 1) return vs[0];
    return null;
}

/** Con el SÍ: la RC se APUNTA en el presupuesto (`obra.ref_catastral`), sin recalcular nada. */
async function apuntarVivienda(S, { prescriptorId, id, vivienda }) {
    if (!S.apuntarVivienda || !vivienda?.rc) return null;      // el «sin guardar» no guarda
    return S.apuntarVivienda({ prescriptorId, id, rc: vivienda.rc });
}

// Las preguntas del bono, en este orden, y cómo se contestan.
const TEXTO_BONO = {
    emisor: '¿Qué tiene la casa para dar la calefacción?',
    acs: '¿La aerotermia da también el agua caliente?',
    caldera: '¿Qué caldera tiene ahora la casa?',
};

/**
 * La siguiente pregunta del bono que FALTA (null = ya está todo). Solo en una aerotermia:
 * el emisor y el agua caliente, si no los ha dicho (`dichas`), y la caldera, si no la tiene. Pura.
 */
function siguientePreguntaBono(obra, dichas = {}) {
    if ((obra?.tipo || 'aerotermia') !== 'aerotermia') return null;
    if (!dichas.emisor) return 'emisor';
    if (!dichas.acs && obra?.acs !== true) return 'acs';
    if (!limpio(obra?.caldera?.combustible)) return 'caldera';
    return null;
}

/** Las respuestas posibles de una pregunta (botones en la app, lista numerada en el grupo). Pura. */
function opcionesBono(pregunta, L) {
    if (pregunta === 'emisor') return L.EMISORES.map(e => ({ valor: e.clave, texto: e.texto }));
    if (pregunta === 'acs') return [{ valor: true, texto: 'Sí, también el agua caliente' }, { valor: false, texto: 'No, solo la calefacción' }];
    if (pregunta === 'caldera') return L.COMBUSTIBLES.map(c => ({ valor: c.clave, texto: c.texto }));
    return [];
}

const PALABRAS_BONO = {
    emisor: [[/suelo/, 'suelo'], [/fan\s*-?\s*coil/, 'fancoils'], [/radiador/, 'radiadores']],
    caldera: [[/gas(oil|oleo|ól|ol)/, 'gasoleo'], [/propano|butano|glp/, 'glp'], [/pellet/, 'pellets'], [/le[nñ]a/, 'lena'],
        [/carb[oó]n/, 'carbon'], [/el[eé]ctric/, 'electrica'], [/\bno\b.*(tiene|hay|caldera)|ninguna|sin caldera/, 'ninguna'], [/\bgas\b/, 'gas']],
};

/**
 * Lo que ha contestado a una pregunta del bono, o null si no se entiende. Vale lo que extrajo el
 * modelo (`ext`), el nº de la lista (`eleccion`), un SÍ/NO (`si`: 'si'|'no') o la palabra. Pura.
 */
function leerRespuestaBono(pregunta, { eleccion = null, si = null, ext = null, texto = '' } = {}, L) {
    const ops = opcionesBono(pregunta, L);
    const vale = (v) => ops.some(o => o.valor === v);
    const t = limpio(texto).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (pregunta === 'emisor') {
        if (vale(ext?.obra?.emisor)) return ext.obra.emisor;
    } else if (pregunta === 'acs') {
        if (ext?.obra?.acs === true || ext?.obra?.acs === false) return ext.obra.acs;
        if (si === 'si') return true;
        if (si === 'no') return false;
    } else if (pregunta === 'caldera') {
        if (vale(ext?.obra?.caldera?.combustible)) return ext.obra.caldera.combustible;
    }
    if (eleccion && ops[eleccion - 1]) return ops[eleccion - 1].valor;
    for (const [re, v] of PALABRAS_BONO[pregunta] || []) if (re.test(t)) return v;
    return null;
}

/**
 * Lo contestado para el bono se escribe en el PRESUPUESTO (el emisor, el agua caliente y la caldera
 * salen en su 1.ª línea): desde su fila, conservando nº, fecha, cliente y precio. Las líneas se
 * rehacen solo si eran las del texto predefinido; si las escribió a mano, se quedan como están.
 * @returns {{ filaP, cambios: string[]|null, aMano: boolean }}  `cambios` vacío = el PDF sale igual
 */
async function completarObra(S, { prescriptorId, id, respuestas = {}, L, eur, entradaDesdeFila }) {
    const antes = await S.obtener(prescriptorId, id);
    const e = entradaDesdeFila(antes);
    const obraAntes = e.obra || {};
    const obra = { ...obraAntes };
    if (respuestas.emisor) obra.emisor = respuestas.emisor;
    if (respuestas.acs === true || respuestas.acs === false) obra.acs = respuestas.acs;
    if (respuestas.caldera) obra.caldera = { ...(obraAntes.caldera || {}), combustible: respuestas.caldera };
    const mismas = (a, b) => JSON.stringify((a || []).map(limpio)) === JSON.stringify((b || []).map(limpio));
    const auto = !e.conceptos?.length || mismas(e.conceptos, L.conceptosDe(obraAntes));
    const entrada = { ...e, obra, conceptos: auto ? L.conceptosDe(obra) : e.conceptos };
    const filaP = await S.actualizar({ prescriptorId, id, entrada });
    return { filaP, cambios: queCambia(antes, filaP, eur), aMano: !auto };
}

module.exports = {
    logica, catalogosDe,
    fusionar, hayAlgo, faltaObra, conTipoPorDefecto, entradaDe, cambiaElPresupuesto, correccionCliente, queCambia, soloDatos, pedidoDesdeFila,
    opcionesDe, clienteDelPedido, prepararObra, crearDelPedido, cambiarDelPedido,
    // la vivienda y el bono, tras el presupuesto
    conVivienda, buscarVivienda, lineaVivienda, elegirVivienda, apuntarVivienda,
    TEXTO_BONO, siguientePreguntaBono, opcionesBono, leerRespuestaBono, completarObra,
    // utilidades que comparten los dos canales
    limpio, idDe, nombreDe, titulo, mascara, hoy, eleccionDe, siNoDe,
};
