// ─── presupuestoService.js ───────────────────────────────────────────────────
// PRESUPUESTOS con N PARTIDAS del catálogo de ARTÍCULOS (pestaña Facturación).
//
//   borrador (editor o MCP)  →  enviar (PDF + enlace)  →  el cliente acepta en
//   /aceptar-cee/:token      →  si alguna partida es un CEE, nace su expediente
//
// Viven en la MISMA tabla que las ofertas de CEE (`cee_ofertas`) y reutilizan su
// envío, su PDF y su aceptación (`ceeOfertaService`): un presupuesto de partidas
// es una fila con `lineas`. Aquí solo lo propio: el catálogo, guardar las
// partidas (con sus totales en columnas, para que el listado no lea el JSONB),
// editar, duplicar y rechazar.
//
// Qué es una partida y cómo se calcula: `features/facturacion/logic/
// presupuesto.js` (fuente única con el editor, el PDF y el MCP).
// ─────────────────────────────────────────────────────────────────────────────

const path = require('path');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const supabase = require('./supabaseClient');
const ofertas = require('./ceeOfertaService');
const { htmlToPdf } = require('./pdfService');

const TABLA = ofertas.TABLA;
const ARTICULOS = 'articulos';

let _logica = null;
function logica() {
    if (!_logica) _logica = import(pathToFileURL(path.join(__dirname, '../../frontend/src/features/facturacion/logic/presupuesto.js')).href);
    return _logica;
}
let _plantilla = null;
function plantilla() {
    if (!_plantilla) _plantilla = import(pathToFileURL(path.join(__dirname, '../../frontend/src/features/cee-directo/logic/ofertaCee.js')).href);
    return _plantilla;
}

const error = (msg, status = 400) => Object.assign(new Error(msg), { status });
const num = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(String(v).replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
};

// ── Catálogo ────────────────────────────────────────────────────────────────

const COLS_ART = 'id, appsheet_id, nombre, familia, precio, iva_pct, suplido, variantes, arrastra, genera, activo, orden, usos';

async function articulos({ todos = false } = {}) {
    let q = supabase.from(ARTICULOS).select(COLS_ART).order('familia').order('orden').order('usos', { ascending: false });
    if (!todos) q = q.eq('activo', true);
    const { data, error: e } = await q;
    if (e) throw error(e.message, 503);
    return (data || []).map(a => ({ ...a, precio: Number(a.precio), iva_pct: Number(a.iva_pct) }));
}

/** Un artículo saneado: lo que llega del navegador no entra tal cual. */
function sanearArticulo(d = {}) {
    const texto = (v, n) => String(v ?? '').trim().slice(0, n);
    const nombre = texto(d.nombre, 300);
    if (!nombre) throw error('El artículo necesita un nombre');
    const suplido = !!d.suplido;
    const variantes = (Array.isArray(d.variantes) ? d.variantes : [])
        .filter(v => v && texto(v.nombre, 120))
        .slice(0, 30)
        .map(v => ({
            id: texto(v.id, 20) || crypto.randomBytes(4).toString('hex'),
            nombre: texto(v.nombre, 120),
            precio: Math.round((num(v.precio) ?? 0) * 100) / 100,
        }));
    const arrastra = (Array.isArray(d.arrastra) ? d.arrastra : [])
        .filter(a => a && a.articulo_id)
        .slice(0, 10)
        .map(a => ({ articulo_id: String(a.articulo_id), uds: num(a.uds) || 1 }));
    return {
        nombre,
        familia: texto(d.familia, 40).toUpperCase() || 'OTROS',
        precio: Math.round((num(d.precio) ?? 0) * 100) / 100,
        iva_pct: suplido ? 0 : (num(d.iva_pct) ?? 21),
        suplido,
        variantes,
        arrastra,
        genera: d.genera === 'CEE_UNICO' || d.genera === 'CEE_DOBLE' ? d.genera : null,
        activo: d.activo !== false,
        orden: Math.round(num(d.orden) ?? 100),
        appsheet_id: d.appsheet_id != null && String(d.appsheet_id).trim() ? String(d.appsheet_id).trim() : null,
    };
}

async function guardarArticulo(datos, id = null) {
    const fila = { ...sanearArticulo(datos), updated_at: new Date().toISOString() };
    if (id && fila.arrastra.some(a => a.articulo_id === id)) throw error('Un artículo no puede arrastrarse a sí mismo');
    const q = id
        ? supabase.from(ARTICULOS).update(fila).eq('id', id)
        : supabase.from(ARTICULOS).insert(fila);
    const { data, error: e } = await q.select(COLS_ART).single();
    if (e) throw error(e.message, 500);
    return data;
}

// ── Partidas ────────────────────────────────────────────────────────────────

/**
 * Las líneas que se guardan. Lo que manda el EDITOR ya viene construido desde el
 * catálogo y con lo tocado a mano: solo se sanea. Lo que manda el MCP puede
 * venir como «artículo + variante + uds» (`expandir_arrastre`): entonces se
 * construye aquí con el catálogo y sus partidas arrastradas (las tasas).
 */
async function construirLineas(lineas = [], { expandir = false } = {}) {
    const L = await logica();
    if (!expandir) return L.sanearLineas(lineas);
    const catalogo = await articulos({ todos: true });
    const out = [];
    for (const l of (Array.isArray(lineas) ? lineas : [])) {
        const art = l.articulo_id ? catalogo.find(a => String(a.id) === String(l.articulo_id)) : null;
        if (!art) {
            // Una partida libre (sin artículo): tal cual.
            if (String(l.descripcion || '').trim()) out.push(L.lineaDeArticulo({ nombre: l.descripcion, precio: l.precio, iva_pct: l.ivaPct ?? 21, suplido: !!l.suplido }, { uds: l.uds, dtoPct: l.dtoPct, detalle: l.detalle }));
            continue;
        }
        if (art.variantes?.length && l.variante_id && !L.varianteDe(art, l.variante_id)) {
            throw error(`«${art.nombre}» no tiene la variante «${l.variante_id}». Tiene: ${art.variantes.map(v => v.nombre).join(', ')}`);
        }
        out.push(...L.lineasDeArticulo(art, catalogo, {
            varianteId: l.variante_id || null, uds: l.uds ?? 1,
            precio: num(l.precio), dtoPct: num(l.dtoPct) ?? 0, detalle: l.detalle || '',
            sinArrastre: !!l.sin_arrastre,
        }));
    }
    return L.sanearLineas(out);
}

/** Las columnas que se derivan de las líneas (totales, resumen, CEE que abre). */
async function derivados(lineas) {
    const L = await logica();
    const t = L.totalesLineas(lineas);
    return { neto: t.neto, iva: t.iva, total: t.total, concepto: L.conceptoDeLineas(lineas) || null, alcance: L.alcanceDeLineas(lineas) };
}

/** Uso del catálogo: los más usados salen primero al buscar. Best-effort. */
async function contarUsos(lineas = []) {
    const ids = [...new Set(lineas.filter(l => l.articulo_id && !l.arrastrada_de).map(l => l.articulo_id))];
    for (const id of ids) {
        try {
            const { data } = await supabase.from(ARTICULOS).select('usos').eq('id', id).maybeSingle();
            if (data) await supabase.from(ARTICULOS).update({ usos: (data.usos || 0) + 1 }).eq('id', id);
        } catch { /* el contador no tumba un presupuesto */ }
    }
}

// ── Lectura ─────────────────────────────────────────────────────────────────

const COLS_LISTA = 'id, numero, token, estado, alcance, precio, dto_pct, iva_pct, tasa, num_tasas, neto, iva, total, concepto, cliente_id, prescriptor_id, municipio, direccion, envios, created_at, aceptada_at, rechazada_at, visto_at, cee_directo_id';

/**
 * Listado de la pestaña: TODOS los presupuestos (los de partidas y las ofertas
 * de CEE antiguas). Sin el JSONB de las líneas: total y resumen van en columnas;
 * una oferta antigua los calcula de sus columnas de siempre.
 */
async function listar({ estados = null, q = '' } = {}) {
    let query = supabase.from(TABLA).select(COLS_LISTA).order('created_at', { ascending: false }).limit(500);
    if (Array.isArray(estados) && estados.length) query = query.in('estado', estados);
    const { data, error: e } = await query;
    if (e) throw error(e.message, 503);
    const filas = data || [];

    const P = await plantilla();
    const L = await logica();
    const clientes = {};
    const ids = [...new Set(filas.map(f => f.cliente_id).filter(Boolean))];
    for (let i = 0; i < ids.length; i += 100) {
        const { data: cs } = await supabase.from('clientes').select('id_cliente, nombre_razon_social, apellidos, dni').in('id_cliente', ids.slice(i, i + 100));
        for (const c of cs || []) clientes[c.id_cliente] = c;
    }
    const expedientes = {};
    const facturasCee = {};   // cee_directo_id → números de su documentacion.facturas_emitidas
    const exIds = [...new Set(filas.map(f => f.cee_directo_id).filter(Boolean))];
    for (let i = 0; i < exIds.length; i += 100) {
        // Solo el subcampo de las facturas (regla 22): las claves son los números.
        const { data: es, error: e2 } = await supabase.from('cee_directos')
            .select('id, numero_expediente, facturas:documentacion->facturas_emitidas').in('id', exIds.slice(i, i + 100));
        if (e2) throw error(e2.message, 503);
        for (const x of es || []) {
            expedientes[x.id] = x.numero_expediente;
            facturasCee[x.id] = x.facturas && typeof x.facturas === 'object' ? Object.keys(x.facturas) : [];
        }
    }
    const facturasDe = await facturasDeLaPagina(filas, facturasCee);

    let out = filas.map(f => {
        const c = clientes[f.cliente_id];
        const viejo = f.total == null;
        const t = viejo ? P.totalesOferta(f) : null;
        const envios = Array.isArray(f.envios) ? f.envios : [];
        return {
            id: f.id, numero: f.numero, estado: f.estado, alcance: f.alcance,
            cliente_id: f.cliente_id, cliente_nombre: c ? ofertas.nombreCliente(c) : '', cliente_dni: c?.dni || '',
            prescriptor_id: f.prescriptor_id,
            concepto: f.concepto || (viejo ? P.conceptoOferta(f).replace(/^./, s => s.toUpperCase()) : ''),
            neto: viejo ? t.neto : Number(f.neto), iva: viejo ? t.iva : Number(f.iva), total: viejo ? t.total : Number(f.total),
            municipio: f.municipio, direccion: f.direccion,
            created_at: f.created_at, aceptada_at: f.aceptada_at, rechazada_at: f.rechazada_at, visto_at: f.visto_at,
            ultimo_envio: envios.length ? envios[envios.length - 1] : null,
            cee_directo_id: f.cee_directo_id, numero_expediente: expedientes[f.cee_directo_id] || null,
            antiguo: viejo,
            // Las facturas VIVAS del presupuesto (mismo criterio que `facturasDelPresupuesto`):
            // con alguna, el listado dice «facturado · nº» y no ofrece «Facturar».
            facturas: facturasDe(f),
        };
    });
    const busca = L.normalizarTexto(q);
    if (busca) {
        out = out.filter(f => L.normalizarTexto(`${f.numero} ${f.cliente_nombre} ${f.cliente_dni} ${f.concepto} ${f.municipio || ''} ${f.numero_expediente || ''}`).includes(busca));
    }
    return out;
}

/**
 * Las facturas VIVAS de cada presupuesto de la página, EN LOTE (sin una consulta por
 * fila): el mismo criterio que `facturaService.facturasDelPresupuesto` —las que nacieron
 * de él y, si abrió un CEE directo, las emitidas desde ese CEE, mirando también la ficha
 * del CEE porque lo importado de AppSheet llegó a `facturas_emitidas` sin `cee_directo_id`
 * (2026PCEE_1…8, 26ING_78–86)—. Una RECTIFICADA no cuenta, ni una rectificativa: la
 * rectificativa hereda el `presupuesto_id` de la original, y si anuló la factura entera el
 * presupuesto vuelve a estar por facturar. Devuelve `f => [{ id, numero, estado, tipo }]`.
 */
async function facturasDeLaPagina(filas, facturasCee = {}) {
    const porPresupuesto = {}, porCee = {}, porNumero = {};
    const cols = 'id, numero, estado, tipo, presupuesto_id, cee_directo_id';
    const leer = async (col, ids) => {
        for (let i = 0; i < ids.length; i += 100) {
            const { data, error: e } = await supabase.from('facturas_emitidas').select(cols).in(col, ids.slice(i, i + 100));
            if (e) throw error(e.message, 503);
            for (const x of data || []) {
                if (x.numero) porNumero[x.numero] = x;
                if (x.presupuesto_id) (porPresupuesto[x.presupuesto_id] ||= new Map()).set(x.id, x);
                if (x.cee_directo_id) (porCee[x.cee_directo_id] ||= new Map()).set(x.id, x);
            }
        }
    };
    await leer('presupuesto_id', [...new Set(filas.map(f => f.id))]);
    await leer('cee_directo_id', [...new Set(filas.map(f => f.cee_directo_id).filter(Boolean))]);
    // Los números de la ficha del CEE que no han salido arriba (importados sin `cee_directo_id`):
    // se buscan por número para saber su estado de verdad (cobrada, rectificada) y abrirla.
    const sueltos = [...new Set(Object.values(facturasCee).flat())].filter(n => !porNumero[n]);
    await leer('numero', sueltos);
    const viva = (x) => x.estado !== 'RECTIFICADA' && (!x.tipo || x.tipo === 'F1');
    const corta = (x) => ({ id: x.id, numero: x.numero, estado: x.estado, tipo: x.tipo || 'F1' });
    return (f) => {
        const todas = new Map([...(porPresupuesto[f.id] || new Map())]);
        if (f.cee_directo_id) for (const [k, x] of porCee[f.cee_directo_id] || new Map()) todas.set(k, x);
        for (const numero of facturasCee[f.cee_directo_id] || []) {
            const x = porNumero[numero];
            if (x) todas.set(x.id, x);
            else todas.set(`cee:${numero}`, { id: null, numero, estado: 'EMITIDA', tipo: 'F1' });
        }
        return [...todas.values()].filter(viva).map(corta);
    };
}

/** El presupuesto entero, para el editor y el MCP. */
async function detalle(id) {
    const o = await ofertas.cargar(id);
    if (!o) return null;
    const P = await plantilla();
    const t = P.totalesOferta(o);
    const dest = ofertas.destinoDe(o.cliente);
    let numeroExpediente = null;
    if (o.cee_directo_id) {
        const { data } = await supabase.from('cee_directos').select('numero_expediente').eq('id', o.cee_directo_id).maybeSingle();
        numeroExpediente = data?.numero_expediente || null;
    }
    return {
        ...o,
        // Una oferta antigua se enseña con sus líneas calculadas (no editables:
        // al duplicarla nace ya con partidas).
        lineas: Array.isArray(o.lineas) ? t.lineas : null,
        lineas_calculadas: t.lineas,
        neto: t.neto, iva: t.iva, total: t.total, suplidos: t.tasas,
        concepto: o.concepto || P.conceptoOferta(o),
        url_aceptacion: ofertas.urlAceptacion(o.token),
        destino: dest,
        numero_expediente: numeroExpediente,
    };
}

async function buscarPorNumero(numero) {
    const { data } = await supabase.from(TABLA).select('id').eq('numero', String(numero || '').trim()).maybeSingle();
    return data?.id || null;
}

// ── Alta y edición ──────────────────────────────────────────────────────────

/**
 * Crea el presupuesto como BORRADOR. Enviarlo es otro paso (`enviar`): así el
 * MCP puede enseñarlo antes, y un fallo de WhatsApp no deja nada a medias.
 */
async function crear(datos = {}, { usuarioId = null, usuarioNombre = null } = {}) {
    const lineas = await construirLineas(datos.lineas, { expandir: !!datos.expandir_arrastre });
    if (!lineas.length) throw error('El presupuesto no tiene ninguna partida');
    const { clienteId, clienteCreado } = await ofertas.resolverCliente(datos);
    const P = await plantilla();
    const { MAX_OBSERVACIONES } = await logica();
    const fila = {
        cliente_id: clienteId,
        prescriptor_id: datos.prescriptor_id || null,
        lineas,
        ...(await derivados(lineas)),
        // Columnas de la oferta antigua: sin sentido aquí (las cifras son las líneas).
        precio: null, tasa: 0, num_tasas: 0, dto_pct: 0,
        ...ofertas.inmuebleDe(datos),
        // Texto libre para el cliente; sin él, nada (la política de entrega la pone el PDF
        // siempre, y si llega aquí —un duplicado de uno antiguo— no se guarda dos veces).
        observaciones: P.observacionesCliente(datos.observaciones).slice(0, MAX_OBSERVACIONES) || null,
        token: crypto.randomBytes(16).toString('hex'),
        estado: 'BORRADOR',
        historial: [{ fecha: new Date().toISOString(), texto: 'Presupuesto creado', usuario: usuarioNombre }],
        created_by: usuarioId,
    };
    const { data, error: e } = await supabase.from(TABLA).insert(fila).select('id, numero').single();
    if (e) {
        if (clienteCreado) await supabase.from('clientes').delete().eq('id_cliente', clienteId);
        throw error(e.message, 500);
    }
    contarUsos(lineas);
    return { id: data.id, numero: data.numero, _clienteCreado: clienteCreado, cliente_id: clienteId };
}

/** Editar: solo mientras el cliente no ha contestado (BORRADOR o ENVIADA). */
async function actualizar(id, datos = {}, { usuarioNombre = null } = {}) {
    const o = await ofertas.cargar(id);
    if (!o) throw error('Presupuesto no encontrado', 404);
    if (!['BORRADOR', 'ENVIADA'].includes(o.estado)) throw error(`El presupuesto está ${o.estado.toLowerCase()}: ya no se edita (duplícalo)`, 409);
    const upd = { updated_at: new Date().toISOString() };
    if (datos.lineas !== undefined) {
        const lineas = await construirLineas(datos.lineas, { expandir: !!datos.expandir_arrastre });
        if (!lineas.length) throw error('El presupuesto no tiene ninguna partida');
        Object.assign(upd, { lineas, ...(await derivados(lineas)), precio: null, tasa: 0, num_tasas: 0, dto_pct: 0 });
    }
    if (datos.cliente_id || datos.cliente_nuevo) {
        const { clienteId } = await ofertas.resolverCliente(datos);
        upd.cliente_id = clienteId;
    }
    if (datos.prescriptor_id !== undefined) upd.prescriptor_id = datos.prescriptor_id || null;
    if (datos.observaciones !== undefined) {
        upd.observaciones = (await plantilla()).observacionesCliente(datos.observaciones).slice(0, (await logica()).MAX_OBSERVACIONES) || null;
    }
    if (['direccion', 'municipio', 'provincia', 'codigo_postal', 'ccaa', 'ref_catastral'].some(k => datos[k] !== undefined)) {
        Object.assign(upd, ofertas.inmuebleDe({ ...o, ...datos }));
    }
    upd.historial = [...(o.historial || []), { fecha: upd.updated_at, texto: o.estado === 'ENVIADA' ? 'Editado después de enviarlo' : 'Editado', usuario: usuarioNombre }];
    const { error: e } = await supabase.from(TABLA).update(upd).eq('id', id).in('estado', ['BORRADOR', 'ENVIADA']);
    if (e) throw error(e.message, 500);
    return { id, numero: o.numero };
}

/**
 * Duplicar: el 80 % de los presupuestos son repeticiones. Nace BORRADOR, con
 * las mismas partidas, cliente, partner, inmueble y observaciones. De una oferta
 * antigua salen sus líneas calculadas, ya como partidas.
 */
async function duplicar(id, { usuarioId = null, usuarioNombre = null } = {}) {
    const o = await ofertas.cargar(id);
    if (!o) throw error('Presupuesto no encontrado', 404);
    let lineas = o.lineas;
    if (!Array.isArray(lineas)) {
        const P = await plantilla();
        const alc = o.alcance === 'DOBLE' ? 'CEE_DOBLE' : 'CEE_UNICO';
        lineas = P.totalesOferta(o).lineas.map((l, i) => ({
            descripcion: l.descripcion, uds: l.uds, precio: l.precio, dtoPct: l.dtoPct, ivaPct: l.ivaPct,
            suplido: l.ivaPct === 0, genera: i === 0 ? alc : null,
        }));
    }
    return crear({
        cliente_id: o.cliente_id, prescriptor_id: o.prescriptor_id, lineas,
        direccion: o.direccion, ref_catastral: o.ref_catastral, ccaa: o.ccaa, provincia: o.provincia,
        municipio: o.municipio, codigo_postal: o.codigo_postal, observaciones: o.observaciones,
    }, { usuarioId, usuarioNombre: `${usuarioNombre || ''} (duplicado de ${o.numero})`.trim() });
}

async function rechazar(id, usuario = null) {
    const o = await ofertas.cargar(id);
    if (!o) throw error('Presupuesto no encontrado', 404);
    if (!['ENVIADA', 'BORRADOR'].includes(o.estado)) throw error(`El presupuesto ya está ${o.estado.toLowerCase()}`, 409);
    const ahora = new Date().toISOString();
    const { error: e } = await supabase.from(TABLA).update({
        estado: 'RECHAZADA', rechazada_at: ahora, updated_at: ahora,
        historial: [...(o.historial || []), { fecha: ahora, texto: 'Rechazado por el cliente', usuario }],
    }).eq('id', id).in('estado', ['ENVIADA', 'BORRADOR']);
    if (e) throw error(e.message, 500);
    return { ok: true };
}

/** El mensaje que saldría y a quién, sin enviar nada (vista previa del MCP). */
async function previsualizarEnvio(id) {
    const o = await ofertas.cargar(id);
    if (!o) throw error('Presupuesto no encontrado', 404);
    const P = await plantilla();
    const { total } = P.totalesOferta(o);
    return {
        numero: o.numero, estado: o.estado, total,
        destino: ofertas.destinoDe(o.cliente),
        mensaje: await ofertas.mensajePorDefecto(o),
        adjunto: `Presupuesto ${o.numero}.pdf`,
        url_aceptacion: ofertas.urlAceptacion(o.token),
    };
}

/**
 * El PDF de lo que hay en el EDITOR, sin guardar nada: el mismo rasterizado del
 * servidor que viaja al cliente, para verlo descargado antes de enviarlo (la vista
 * previa del editor es el HTML en el navegador). Del cliente solo se usan los
 * campos que imprime la cabecera; el enlace del botón, el del presupuesto si ya
 * existe.
 */
async function pdfBorrador(datos = {}) {
    const P = await plantilla();
    const { MAX_OBSERVACIONES } = await logica();
    const lineas = await construirLineas(datos.lineas);
    if (!lineas.length) throw error('El presupuesto no tiene ninguna partida');
    const c = datos.cliente || {};
    const CAMPOS = ['nombre_razon_social', 'apellidos', 'dni', 'direccion', 'codigo_postal', 'municipio', 'provincia', 'tlf', 'email'];
    const cliente = Object.fromEntries(CAMPOS.map(k => [k, String(c[k] ?? '').trim().slice(0, 200)]));
    const guardado = /^[0-9a-f-]{36}$/i.test(String(datos.id || '')) ? await ofertas.cargar(datos.id) : null;
    const o = {
        numero: guardado?.numero || null, created_at: guardado?.created_at || null, lineas,
        ...ofertas.inmuebleDe(datos),
        observaciones: P.observacionesCliente(datos.observaciones).slice(0, MAX_OBSERVACIONES),
    };
    const html = P.buildOfertaCeeHtml(o, { cliente, firmaUrl: guardado?.token ? ofertas.urlAceptacion(guardado.token) : '#' });
    return { buffer: await htmlToPdf(html), filename: `Presupuesto ${o.numero || 'BORRADOR'}.pdf` };
}

module.exports = {
    articulos, guardarArticulo, sanearArticulo, construirLineas,
    listar, detalle, buscarPorNumero, crear, actualizar, duplicar, rechazar, previsualizarEnvio, pdfBorrador,
};
