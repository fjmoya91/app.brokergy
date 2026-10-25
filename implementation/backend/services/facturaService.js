// ─── facturaService.js ───────────────────────────────────────────────────────
// FACTURAS de la pestaña Facturación (fase 2): borrador → EMITIR → PDF → enviar
// → cobrada. Y el registro, en `facturas_emitidas`, de TODO lo que factura la app
// (también las facturas de los CEE directos y de la gestión CAE, que se emiten
// en sus servicios y se anotan aquí con `registrarEmitida`) y de lo que se
// emitió en AppSheet (`importarLibro`).
//
//   · NÚMERO. Las ordinarias los sigue reservando la hoja de AppSheet
//     (facturaSheetService: la fila ES la reserva, y AppSheet numera contra la
//     misma serie mientras conviva). Las RECTIFICATIVAS van en su serie
//     específica, `R-{YY}{SERIE}_{n}`, que numera esta tabla (índice único).
//   · Lo que se emite NO se borra ni se cambia: se rectifica. Un BORRADOR sí.
//   · Los datos del cliente y del emisor se FOTOGRAFÍAN al emitir.
//   · VERI*FACTU: cada emisión deja su registro con la huella encadenada al
//     anterior del MISMO emisor (verifactuService). El envío a la AEAT está
//     apagado hasta tener el certificado; sin él, la factura sale sin QR.
//
// Qué es una línea y cómo se calcula: `features/facturacion/logic/factura.js`
// (fuente única con el editor, el PDF y el MCP). Ver
// docs/conocimiento/facturacion/facturas-desde-la-app.md.
// ─────────────────────────────────────────────────────────────────────────────
const path = require('path');
const { pathToFileURL } = require('url');
const supabase = require('./supabaseClient');
const { htmlToPdf } = require('./pdfService');
const hoja = require('./facturaSheetService');
const verifactu = require('./verifactuService');
const { normalizeCliente } = require('../utils/normalization');

const TABLA = 'facturas_emitidas';
const EMISORES = 'facturacion_emisores';

let _logica = null;
function logica() {
    if (!_logica) _logica = import(pathToFileURL(path.join(__dirname, '../../frontend/src/features/facturacion/logic/factura.js')).href);
    return _logica;
}

const error = (msg, status = 400) => Object.assign(new Error(msg), { status });
const txt = (v) => (v == null ? '' : String(v).trim());
const r2 = (n) => Math.round(Number(n || 0) * 100) / 100;
const hoyMadrid = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(new Date());
const aHoja = (iso) => { const [y, m, d] = String(iso || '').split('-'); return y && m && d ? `${d}/${m}/${y}` : ''; };
const DE_OTRO = { CEE_DIRECTO: 'del CEE directo', GESTION_CAE: 'de la gestión CAE del expediente' };
const anota = (row, texto, usuario) => [...(Array.isArray(row?.historial) ? row.historial : []), { fecha: new Date().toISOString(), texto, usuario: usuario || null }];

// ── Emisores ────────────────────────────────────────────────────────────────

async function emisores() {
    const { data, error: e } = await supabase.from(EMISORES).select('*').order('serie');
    if (e) throw error(e.message, 503);
    return data || [];
}

async function emisor(serie) {
    const { data, error: e } = await supabase.from(EMISORES).select('*').eq('serie', String(serie || 'ING').toUpperCase()).maybeSingle();
    if (e) throw error(e.message, 503);
    return data || null;
}

/** Alta o cambio de los datos de un emisor (solo ADMIN: llevan un IBAN). */
async function guardarEmisor(serie, d = {}) {
    const L = await logica();
    const s = String(serie || '').toUpperCase();
    if (!L.serieValida(s)) throw error(`La serie «${serie}» no existe (hay: ${Object.keys(L.SERIES).join(', ')})`);
    const fila = {
        serie: s,
        razon_social: txt(d.razon_social).slice(0, 200),
        nif: txt(d.nif).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20),
        direccion: txt(d.direccion).slice(0, 200) || null, cp: txt(d.cp).slice(0, 10) || null,
        municipio: txt(d.municipio).slice(0, 100) || null, provincia: txt(d.provincia).slice(0, 100) || null,
        tlf: txt(d.tlf).slice(0, 30) || null, email: txt(d.email).slice(0, 200) || null,
        banco: txt(d.banco).slice(0, 80) || null, iban: txt(d.iban).toUpperCase().slice(0, 40) || null,
        irpf_pct: Math.min(100, Math.max(0, Number(d.irpf_pct ?? L.SERIES[s].irpfPct) || 0)),
        observaciones: d.observaciones == null ? null : String(d.observaciones).slice(0, L.MAX_OBS_FACTURA),
        persona_fisica: !!d.persona_fisica,
        activo: d.activo !== false,
        updated_at: new Date().toISOString(),
    };
    if (!fila.razon_social || !fila.nif) throw error('El emisor necesita nombre y NIF');
    if (!L.validarNif(fila.nif).valido) throw error(`El NIF «${fila.nif}» no es válido`);
    const { data, error: e } = await supabase.from(EMISORES).upsert(fila, { onConflict: 'serie' }).select('*').single();
    if (e) throw error(e.message, 500);
    return data;
}

// ── Cliente ─────────────────────────────────────────────────────────────────

/** La ficha del cliente tal como va a la factura. */
function clienteDeFicha(c) {
    if (!c) return {};
    return {
        razon_social: `${c.nombre_razon_social || ''} ${c.es_empresa ? '' : (c.apellidos || '')}`.trim(),
        cif: c.dni, direccion: c.direccion, cp: c.codigo_postal, municipio: c.municipio, provincia: c.provincia,
        tlf: c.tlf, email: c.email, es_empresa: !!c.es_empresa,
    };
}

async function fichaCliente(id) {
    if (!id) return null;
    const { data } = await supabase.from('clientes').select('*').eq('id_cliente', id).maybeSingle();
    return data || null;
}

/**
 * Lo tecleado para ESTA factura que no dice la ficha (`cliente_propio`). Es lo
 * único del borrador que manda al emitir: el resto lo pone la ficha de ese día,
 * así que un NIF o un domicilio corregidos después de guardar el borrador llegan.
 */
function propiosFrenteAFicha(tecleado = {}, ficha = {}) {
    const igual = (a, b) => String(a ?? '').trim().toUpperCase() === String(b ?? '').trim().toUpperCase();
    return Object.fromEntries(Object.entries(stripVacios(tecleado || {}))
        .filter(([k, v]) => k !== 'es_empresa' && k !== 'persona_fisica' && !igual(v, ficha[k])));
}

/** El cliente de un alta: por id (su ficha), nuevo (alta rápida) o tecleado. */
async function resolverCliente(datos = {}) {
    if (datos.cliente_nuevo?.nombre && !datos.cliente_id) {
        const ofertas = require('./ceeOfertaService');
        const { clienteId } = await ofertas.resolverCliente({ cliente_nuevo: datos.cliente_nuevo });
        // La ficha recién creada nace con los datos fiscales tecleados (el alta
        // rápida solo pone nombre, teléfono y email): es suya, no se pisa nada.
        const t = datos.cliente || {};
        const fiscal = stripVacios({
            dni: t.cif ? String(t.cif).replace(/[\s.-]/g, '') : null, direccion: t.direccion,
            codigo_postal: t.cp, municipio: t.municipio, provincia: t.provincia,
        });
        if (Object.keys(fiscal).length || t.es_empresa) {
            const { error: e } = await supabase.from('clientes')
                .update(normalizeCliente({ ...fiscal, es_empresa: !!t.es_empresa })).eq('id_cliente', clienteId);
            if (e) console.warn('[facturas] la ficha nueva se queda sin los datos fiscales:', e.message);
        }
        datos = { ...datos, cliente_id: clienteId };
    }
    if (datos.cliente_id) {
        const c = await fichaCliente(datos.cliente_id);
        if (!c) throw error('El cliente no existe', 404);
        const ficha = clienteDeFicha(c);
        const propio = propiosFrenteAFicha(datos.cliente, ficha);
        return { cliente_id: c.id_cliente, cliente: { ...ficha, ...propio }, cliente_propio: Object.keys(propio).length ? propio : null };
    }
    if (datos.cliente?.razon_social) return { cliente_id: null, cliente: datos.cliente, cliente_propio: null };
    throw error('Hay que indicar a quién se factura');
}

// ── Lectura ─────────────────────────────────────────────────────────────────

const COLS_LISTA = 'id, serie, tipo, numero, estado, fecha, vencimiento, fecha_pago, cliente_id, cliente_nombre, cliente_nif, concepto, neto, iva, irpf, total, expediente, presupuesto_id, cee_directo_id, rectifica_id, rectifica_numero, origen, enviada_at, emitida_at, created_at';

/**
 * El listado de la pestaña con sus cifras (sin leer las líneas: regla 22).
 * `resumen` son las del periodo filtrado: facturado (base), cobrado, pendiente
 * y vencido (con IVA, lo que se mueve en el banco).
 */
async function listar({ serie = null, anio = null, estado = null, q = '' } = {}) {
    const L = await logica();
    let query = supabase.from(TABLA).select(COLS_LISTA)
        .order('fecha', { ascending: false, nullsFirst: true }).order('created_at', { ascending: false }).limit(2000);
    if (serie) query = query.eq('serie', String(serie).toUpperCase());
    if (anio && /^\d{4}$/.test(String(anio))) query = query.gte('fecha', `${anio}-01-01`).lte('fecha', `${anio}-12-31`);
    const { data, error: e } = await query;
    if (e) throw error(e.message, 503);
    const hoy = hoyMadrid();
    let filas = (data || []).map(f => ({ ...f, neto: Number(f.neto), iva: Number(f.iva), irpf: Number(f.irpf), total: Number(f.total), visible: L.estadoVisible(f, hoy) }));
    const busca = L.normalizarTexto(q);
    if (busca) filas = filas.filter(f => L.normalizarTexto(`${f.numero || ''} ${f.cliente_nombre || ''} ${f.cliente_nif || ''} ${f.concepto || ''} ${f.expediente || ''}`).includes(busca));
    if (estado) filas = filas.filter(f => f.visible.clave === String(estado).toUpperCase() || f.estado === String(estado).toUpperCase());

    const emitidas = filas.filter(f => f.estado !== 'BORRADOR');
    const suma = (xs, k) => r2(xs.reduce((s, f) => s + f[k], 0));
    const pendientes = emitidas.filter(f => f.visible.clave === 'PENDIENTE' || f.visible.clave === 'VENCIDA');
    return {
        facturas: filas,
        resumen: {
            n: emitidas.length,
            facturado: suma(emitidas, 'neto'),
            facturado_total: suma(emitidas, 'total'),
            cobrado: suma(emitidas.filter(f => f.estado === 'PAGADA'), 'total'),
            pendiente: suma(pendientes, 'total'),
            vencido: suma(pendientes.filter(f => f.visible.clave === 'VENCIDA'), 'total'),
            n_vencidas: pendientes.filter(f => f.visible.clave === 'VENCIDA').length,
            borradores: filas.length - emitidas.length,
        },
    };
}

async function cargar(id) {
    const { data, error: e } = await supabase.from(TABLA).select('*').eq('id', id).maybeSingle();
    if (e) throw error(e.message, 503);
    return data || null;
}

async function cargarPorNumero(numero) {
    const { data } = await supabase.from(TABLA).select('*').eq('numero', txt(numero)).maybeSingle();
    return data || null;
}

/** La factura entera, para el editor y el MCP. */
async function detalle(id) {
    const f = await cargar(id);
    if (!f) return null;
    const L = await logica();
    const t = L.calcularFactura({ lineas: f.lineas || [], irpfPct: f.irpf_pct });
    const [em, rect, ficha] = await Promise.all([
        f.emisor ? Promise.resolve(null) : emisor(f.serie),
        supabase.from(TABLA).select('id, numero, estado, total, fecha').eq('rectifica_id', f.id),
        f.estado === 'BORRADOR' && f.cliente_id ? fichaCliente(f.cliente_id).catch(() => null) : null,
    ]);
    // Un borrador enseña lo que saldría al emitir: la ficha de hoy y lo propio encima.
    if (ficha) f.cliente = L.sanearCliente({ ...clienteDeFicha(ficha), ...stripVacios(f.cliente_propio || {}) });
    return {
        ...f,
        neto: Number(f.neto), iva: Number(f.iva), irpf: Number(f.irpf), total: Number(f.total),
        emisor: f.emisor || em,
        calculo: t,
        visible: L.estadoVisible(f, hoyMadrid()),
        // Lo que diría «Emitir» ahora (el MCP lo enseña antes de pedir el «sí»).
        revision: f.estado === 'BORRADOR' ? L.revisarParaEmitir(f) : null,
        rectificativas: rect.data || [],
        verifactu_activo: verifactu.activo(),
    };
}

// ── Borrador ────────────────────────────────────────────────────────────────

async function filaBorrador(datos = {}, base = {}) {
    const L = await logica();
    let lineas = datos.lineas;
    if (Array.isArray(lineas) && datos.expandir_arrastre) {
        lineas = await require('./presupuestoService').construirLineas(lineas, { expandir: true });
    }
    const serie = (datos.serie || base.serie || 'ING').toUpperCase();
    const em = await emisor(serie);
    const s = L.sanearFactura({
        serie,
        lineas: lineas ?? base.lineas,
        irpf_pct: datos.irpf_pct ?? (datos.serie && datos.serie !== base.serie ? em?.irpf_pct : base.irpf_pct) ?? em?.irpf_pct,
        fecha: datos.fecha !== undefined ? datos.fecha : base.fecha,
        vencimiento: datos.vencimiento !== undefined ? datos.vencimiento : base.vencimiento,
        fecha_operacion: datos.fecha_operacion !== undefined ? datos.fecha_operacion : base.fecha_operacion,
        observaciones: datos.observaciones !== undefined ? datos.observaciones : (base.id ? base.observaciones : (em?.observaciones ?? null)),
        expediente: datos.expediente !== undefined ? datos.expediente : base.expediente,
        cliente: datos.cliente || base.cliente || {},
    });
    return { s, derivados: L.derivados({ lineas: s.lineas, irpf_pct: s.irpf_pct, cliente: s.cliente }) };
}

async function crear(datos = {}, { usuarioId = null, usuarioNombre = null, origen = 'APP' } = {}) {
    const { cliente_id, cliente, cliente_propio } = await resolverCliente(datos);
    const { s, derivados } = await filaBorrador({ ...datos, cliente });
    if (!s.lineas.length) throw error('La factura no tiene ninguna partida');
    const fila = {
        serie: s.serie, tipo: 'F1', estado: 'BORRADOR',
        fecha: s.fecha || hoyMadrid(), vencimiento: s.vencimiento, fecha_operacion: s.fecha_operacion,
        cliente_id, cliente: s.cliente, cliente_propio, lineas: s.lineas, irpf_pct: s.irpf_pct,
        observaciones: s.observaciones, expediente: s.expediente,
        presupuesto_id: datos.presupuesto_id || null, cee_directo_id: datos.cee_directo_id || null,
        origen, ...derivados,
        historial: anota(null, 'Borrador creado', usuarioNombre), created_by: usuarioId,
    };
    if (!fila.vencimiento) fila.vencimiento = (await logica()).sumarDias(fila.fecha, (await logica()).VENCIMIENTO_DIAS);
    const { data, error: e } = await supabase.from(TABLA).insert(fila).select('id').single();
    if (e) throw error(e.message, 500);
    return { id: data.id };
}

/** Editar: solo un BORRADOR. Lo emitido se rectifica. */
async function actualizar(id, datos = {}, { usuarioNombre = null } = {}) {
    const f = await cargar(id);
    if (!f) throw error('Factura no encontrada', 404);
    if (f.estado !== 'BORRADOR') throw error(`La factura ${f.numero} ya está emitida: no se cambia, se rectifica`, 409);
    let cliente_id = f.cliente_id;
    let cliente = f.cliente;
    let cliente_propio = f.cliente_propio || null;
    if (datos.cliente_id !== undefined || datos.cliente_nuevo) {
        ({ cliente_id, cliente, cliente_propio } = await resolverCliente(datos));
    } else if (datos.cliente && f.cliente_id) {
        ({ cliente_id, cliente, cliente_propio } = await resolverCliente({ cliente_id: f.cliente_id, cliente: { ...(f.cliente_propio || {}), ...datos.cliente } }));
    } else if (datos.cliente) {
        cliente = { ...f.cliente, ...datos.cliente };
    }
    const { s, derivados } = await filaBorrador({ ...datos, cliente }, f);
    if (!s.lineas.length) throw error('La factura no tiene ninguna partida');
    const upd = {
        serie: s.serie, fecha: s.fecha, vencimiento: s.vencimiento, fecha_operacion: s.fecha_operacion,
        cliente_id, cliente: s.cliente, cliente_propio, lineas: s.lineas, irpf_pct: s.irpf_pct, observaciones: s.observaciones,
        expediente: s.expediente, ...derivados,
        ...(datos.motivo_rectificacion !== undefined ? { motivo_rectificacion: txt(datos.motivo_rectificacion).slice(0, 500) || null } : {}),
        updated_at: new Date().toISOString(), historial: anota(f, 'Borrador editado', usuarioNombre),
    };
    const { error: e } = await supabase.from(TABLA).update(upd).eq('id', id).eq('estado', 'BORRADOR');
    if (e) throw error(e.message, 500);
    return { id };
}

async function borrar(id) {
    const f = await cargar(id);
    if (!f) throw error('Factura no encontrada', 404);
    if (f.estado !== 'BORRADOR' || f.numero) throw error('Solo se borra un borrador: una factura emitida se rectifica', 409);
    const { error: e } = await supabase.from(TABLA).delete().eq('id', id).eq('estado', 'BORRADOR');
    if (e) throw error(e.message, 500);
    return { ok: true };
}

/**
 * Duplicar (la de FML es la misma cada mes): nace BORRADOR con fecha de hoy,
 * el mismo cliente y partidas, y el MES del concepto y de la fecha de
 * operación avanzado uno («– septiembre 2026» → «– octubre 2026»).
 */
async function duplicar(id, { usuarioId = null, usuarioNombre = null } = {}) {
    const f = await cargar(id);
    if (!f) throw error('Factura no encontrada', 404);
    const L = await logica();
    const fecha = hoyMadrid();
    const ficha = f.cliente_id ? await fichaCliente(f.cliente_id) : null;
    return crear({
        serie: f.serie, cliente_id: ficha ? f.cliente_id : undefined, cliente: ficha ? (f.cliente_propio || undefined) : f.cliente,
        lineas: (f.lineas || []).map(l => ({ ...l, key: undefined, uds: Math.abs(Number(l.uds) || 1), descripcion: L.avanzarMes(l.descripcion), detalle: L.avanzarMes(l.detalle) })),
        irpf_pct: f.irpf_pct, fecha, fecha_operacion: f.fecha_operacion ? L.avanzarMes(f.fecha_operacion) : null,
        observaciones: f.observaciones, expediente: f.expediente,
    }, { usuarioId, usuarioNombre: `${usuarioNombre || ''} (copia de ${f.numero || 'un borrador'})`.trim() });
}

/**
 * Las facturas VIVAS de un presupuesto: las que nacieron de él y, si abrió un CEE
 * directo, las que se emitieron desde ese CEE. Esas se registran con
 * `cee_directo_id` y sin presupuesto, y el registro es best-effort: por eso se
 * mira también la ficha del CEE. Solo cuentan las ORDINARIAS (F1) que no estén
 * anuladas: una rectificativa hereda el `presupuesto_id`, y la que anula la factura
 * entera deja el presupuesto otra vez por facturar.
 */
async function facturasDelPresupuesto(o) {
    let q = supabase.from(TABLA).select('id, numero, estado, tipo');
    q = o.cee_directo_id ? q.or(`presupuesto_id.eq.${o.id},cee_directo_id.eq.${o.cee_directo_id}`) : q.eq('presupuesto_id', o.id);
    const { data, error: e } = await q;
    if (e) throw error(e.message, 503);
    const vivas = (data || []).filter(x => x.tipo === 'F1' && x.estado !== 'RECTIFICADA').map(({ tipo, ...x }) => x);
    if (o.cee_directo_id) {
        const { data: cd, error: e2 } = await supabase.from('cee_directos')
            .select('facturas:documentacion->facturas_emitidas').eq('id', o.cee_directo_id).maybeSingle();
        if (e2) throw error(e2.message, 503);
        const registradas = new Set((data || []).map(x => x.numero));
        for (const numero of Object.keys(cd?.facturas || {})) {
            if (!registradas.has(numero)) vivas.push({ id: null, numero, estado: 'EMITIDA' });
        }
    }
    return vivas;
}

/**
 * Facturar un PRESUPUESTO aceptado: sus partidas tal cual, a su cliente. Si ya
 * tiene una factura (que no esté rectificada), se dice cuál en vez de hacer otra.
 */
async function desdePresupuesto(presupuestoId, { usuarioId = null, usuarioNombre = null, otraMas = false } = {}) {
    const ofertas = require('./ceeOfertaService');
    const o = await ofertas.cargar(presupuestoId);
    if (!o) throw error('Presupuesto no encontrado', 404);
    if (!otraMas) {
        const ya = await facturasDelPresupuesto(o);
        if (ya.length) throw Object.assign(error(`El presupuesto ${o.numero} ya tiene factura: ${ya.map(x => x.numero || 'un borrador').join(', ')}`, 409), { facturas: ya });
    }
    let lineas = o.lineas;
    if (!Array.isArray(lineas)) {
        const P = await import(pathToFileURL(path.join(__dirname, '../../frontend/src/features/cee-directo/logic/ofertaCee.js')).href);
        lineas = P.totalesOferta(o).lineas.map(l => ({ descripcion: l.descripcion, uds: l.uds, precio: l.precio, dtoPct: l.dtoPct, ivaPct: l.ivaPct, suplido: l.ivaPct === 0 }));
    }
    let expediente = null;
    if (o.cee_directo_id) {
        const { data } = await supabase.from('cee_directos').select('numero_expediente').eq('id', o.cee_directo_id).maybeSingle();
        expediente = data?.numero_expediente || null;
    }
    return crear({
        serie: 'ING', cliente_id: o.cliente_id, lineas, presupuesto_id: o.id, cee_directo_id: o.cee_directo_id || null, expediente,
    }, { usuarioId, usuarioNombre: `${usuarioNombre || ''} (del presupuesto ${o.numero})`.trim() });
}

// ── Rectificar ──────────────────────────────────────────────────────────────

/**
 * Prepara la RECTIFICATIVA de una factura emitida (art. 15 RD 1619/2012), como
 * BORRADOR para revisarla: por defecto ANULA la factura entera (sus líneas en
 * negativo); con `lineas`, rectifica solo eso (por diferencias). R1 si el
 * motivo es de los del art. 80 LIVA (impago, descuento posterior, devolución…);
 * R4 en el resto, que es lo normal (un error).
 */
async function rectificar(id, { motivo = '', tipo = 'R4', lineas = null, usuarioId = null, usuarioNombre = null } = {}) {
    const f = await cargar(id);
    if (!f) throw error('Factura no encontrada', 404);
    if (f.estado === 'BORRADOR') throw error('Un borrador no se rectifica: se edita', 409);
    if (f.estado === 'RECTIFICADA') throw error(`La factura ${f.numero} ya está rectificada por completo`, 409);
    if (f.tipo !== 'F1') throw error('Una rectificativa no se rectifica desde aquí: rectifica la factura original', 409);
    if (!txt(motivo)) throw error('Una rectificativa tiene que decir por qué rectifica');
    const L = await logica();
    const { data: ya } = await supabase.from(TABLA).select('id, numero').eq('rectifica_id', f.id).eq('estado', 'BORRADOR');
    if (ya?.length) throw error('Esta factura ya tiene una rectificativa en borrador: termínala o bórrala', 409);
    const fila = {
        serie: f.serie, tipo: tipo === 'R1' ? 'R1' : 'R4', estado: 'BORRADOR',
        fecha: hoyMadrid(), vencimiento: null, fecha_operacion: f.fecha_operacion,
        // El destinatario de la rectificada, tal cual se emitió (aunque su ficha cambie).
        cliente_id: f.cliente_id, cliente: f.cliente, cliente_propio: f.cliente_id ? f.cliente : null,
        lineas: Array.isArray(lineas) ? L.sanearFactura({ lineas }).lineas : L.lineasRectificativa(f.lineas || []),
        irpf_pct: f.irpf_pct, observaciones: f.observaciones, expediente: f.expediente,
        presupuesto_id: f.presupuesto_id, cee_directo_id: f.cee_directo_id,
        rectifica_id: f.id, rectifica_numero: f.numero, motivo_rectificacion: txt(motivo).slice(0, 500),
        origen: 'APP', historial: anota(null, `Rectificativa de ${f.numero} (${txt(motivo)})`, usuarioNombre), created_by: usuarioId,
    };
    Object.assign(fila, L.derivados(fila));
    const { data, error: e } = await supabase.from(TABLA).insert(fila).select('id').single();
    if (e) throw error(e.message, 500);
    return { id: data.id };
}

// ── Emitir ──────────────────────────────────────────────────────────────────

/** Las líneas como las quiere la hoja: el ARTÍCULO es el id de AppSheet. */
async function lineasParaHoja(lineas) {
    const C = await import(pathToFileURL(path.join(__dirname, '../../frontend/src/features/cee-directo/logic/facturaCee.js')).href);
    return lineas.map(l => ({
        ...C.calcularLinea(l),
        articulo_id: l.appsheet_id || (l.suplido || Number(l.ivaPct) === 0 ? (C.ARTICULO_TASA_POR_IMPORTE[String(r2(l.precio))] || '') : '')
            || (l.genera === 'CEE_DOBLE' ? C.ARTICULO_CEE.DOBLE : l.genera === 'CEE_UNICO' ? C.ARTICULO_CEE.UNICO : ''),
    }));
}

/** El siguiente número de rectificativa de la serie: `R-26ING_1`. */
async function siguienteRectificativa(serie, fecha) {
    const L = await logica();
    const { data, error: e } = await supabase.from(TABLA).select('correlativo').eq('serie', serie).neq('tipo', 'F1')
        .not('numero', 'is', null).order('correlativo', { ascending: false }).limit(1);
    if (e) throw error(e.message, 503);
    const n = (data?.[0]?.correlativo || 0) + 1;
    return { numero: L.numeroRectificativa(serie, n, fecha), correlativo: n };
}

/**
 * Encadena el registro de VERI*FACTU de una factura ya numerada: huella sobre
 * la última del MISMO emisor. El índice único (vf_nif, vf_orden) impide que dos
 * emisiones a la vez cuelguen del mismo eslabón: si choca, se vuelve a leer.
 */
async function encadenar(f, { ahora = new Date() } = {}) {
    if (f.vf_huella) return { ya: true };
    const L = await logica();
    const em = f.emisor || {};
    const nif = txt(em.nif || em.cif).toUpperCase();
    if (!nif) throw error('La factura no tiene NIF de emisor');
    const C = await import(pathToFileURL(path.join(__dirname, '../../frontend/src/features/cee-directo/logic/facturaCee.js')).href);
    const lineasCalculadas = (f.lineas || []).map(C.calcularLinea);
    for (let intento = 0; intento < 4; intento++) {
        const { data: ult } = await supabase.from(TABLA).select('numero, fecha, vf_orden, vf_huella')
            .eq('vf_nif', nif).not('vf_orden', 'is', null).order('vf_orden', { ascending: false }).limit(1);
        const a = ult?.[0] || null;
        const anterior = a ? { nif, numSerie: a.numero, fecha: verifactu.fechaVf(a.fecha), huella: a.vf_huella } : null;
        const rectificada = f.rectifica_id ? await cargar(f.rectifica_id) : null;
        const reg = verifactu.registroAlta({
            emisor: { nif, razon_social: em.razon_social || em.razonSocial },
            factura: { ...f, concepto: f.concepto || L.conceptoDeLineas(f.lineas || []) || null, rectifica_fecha: rectificada?.fecha || null },
            lineasCalculadas, anterior, ahora,
        });
        const orden = (a?.vf_orden || 0) + 1;
        const vf = {
            registro: reg.registro, importe_total: reg.importeTotal, cuota_total: reg.cuotaTotal, avisos: reg.avisos,
            estado: verifactu.activo() ? 'PENDIENTE' : 'NO_REMITIDO', entorno: verifactu.ENTORNO,
        };
        const { error: e } = await supabase.from(TABLA).update({ vf_nif: nif, vf_orden: orden, vf_huella: reg.huella, verifactu: vf })
            .eq('id', f.id).is('vf_huella', null);
        if (!e) return { huella: reg.huella, orden, vf };
        if (!/duplicate|unique/i.test(e.message)) throw error(e.message, 500);
    }
    throw error('No se ha podido encadenar el registro de VERI*FACTU (cuatro choques seguidos)', 409);
}

const enCurso = new Set();

/**
 * EMITE un borrador: número, foto del cliente y del emisor, registro en la hoja
 * de AppSheet, cadena de VERI*FACTU y PDF. Un número emitido no se tira: si el
 * PDF falla después, la factura queda emitida y el PDF se rehace.
 */
async function emitir(id, { usuario = null } = {}) {
    if (enCurso.has(id)) throw error('Ya se está emitiendo esta factura', 409);
    enCurso.add(id);
    try {
        const f = await cargar(id);
        if (!f) throw error('Factura no encontrada', 404);
        if (f.estado !== 'BORRADOR' || f.numero) throw error(`La factura ya está emitida (${f.numero})`, 409);
        const L = await logica();
        // Lo que se emite es la ficha de HOY (si el borrador cuelga de un cliente),
        // con lo tecleado solo para esta factura encima (`cliente_propio`).
        let cliente = f.cliente;
        if (f.cliente_id) {
            const c = await fichaCliente(f.cliente_id);
            if (c) cliente = L.sanearCliente({ ...clienteDeFicha(c), ...stripVacios(f.cliente_propio || {}) });
        }
        const fecha = f.fecha || hoyMadrid();
        const { errores, avisos } = L.revisarParaEmitir({ ...f, cliente, fecha });
        if (errores.length) throw Object.assign(error(errores.join(' ')), { errores, avisos });
        const em = await emisor(f.serie);
        if (!em || !em.activo) throw error(`Faltan los datos del emisor de la serie ${f.serie}: dalos de alta en Facturación → Emisores`);
        const emisorFoto = { razon_social: em.razon_social, nif: em.nif, direccion: em.direccion, cp: em.cp, municipio: em.municipio, provincia: em.provincia, tlf: em.tlf, email: em.email, banco: em.banco, iban: em.iban, persona_fisica: em.persona_fisica };
        const t = L.calcularFactura({ lineas: f.lineas, irpfPct: f.irpf_pct });
        const vencimiento = t.total > 0 ? (f.vencimiento || L.sumarDias(fecha, L.VENCIMIENTO_DIAS)) : null;

        // 1 · El número. Ordinaria: la hoja lo reserva. Rectificativa: esta tabla.
        let numero, correlativo = null, hojaId = null;
        const totalesHoja = { neto: t.neto, iva: t.iva, descuento: t.descuento, total: t.total, irpf: t.irpf, irpfPct: t.irpfPct };
        const paraHoja = { serie: f.serie, expediente: f.expediente, cliente, fechaIso: fecha, vencimientoIso: vencimiento || fecha, lineas: await lineasParaHoja(f.lineas), totales: totalesHoja, observaciones: f.observaciones, estado: 'ENVIADA' };
        if (f.tipo === 'F1') {
            const r = await hoja.emitir(paraHoja);
            numero = r.numero; hojaId = r.id;
            const m = L.RE_ORDINARIA.exec(numero);
            correlativo = m ? Number(m[3]) : null;
        } else {
            for (let intento = 0; intento < 4 && !numero; intento++) {
                const s = await siguienteRectificativa(f.serie, fecha);
                const { error: e } = await supabase.from(TABLA).update({ numero: s.numero, correlativo: s.correlativo }).eq('id', f.id).is('numero', null);
                if (!e) { numero = s.numero; correlativo = s.correlativo; }
                else if (!/duplicate|unique/i.test(e.message)) throw error(e.message, 500);
            }
            if (!numero) throw error('No se ha podido reservar el número de la rectificativa', 409);
            try { hojaId = (await hoja.emitir({ ...paraHoja, numero })).id; }
            catch (e) { avisos.push(`No se ha anotado en la hoja de AppSheet: ${e.message}`); }
        }

        // 2 · El registro: emitida, con sus fotos. Desde aquí el número es suyo.
        const ahora = new Date().toISOString();
        const upd = {
            numero, correlativo, hoja_id: hojaId, estado: 'EMITIDA', fecha, vencimiento,
            cliente, emisor: emisorFoto, ...L.derivados({ lineas: f.lineas, irpf_pct: f.irpf_pct, cliente }),
            emitida_at: ahora, updated_at: ahora,
            historial: anota(f, `Emitida ${numero} (${L.fmtEur(t.total)})`, usuario),
        };
        const { error: eUpd } = await supabase.from(TABLA).update(upd).eq('id', f.id);
        if (eUpd) {
            // El número ya está en la hoja: no se pierde, se dice dónde está.
            throw error(`La factura ${numero} se ha reservado en la hoja (fila ${hojaId}) pero no se ha podido guardar aquí: ${eUpd.message}. No la vuelvas a emitir: avisa para enlazarla.`, 500);
        }
        let emitida = { ...f, ...upd };

        // 3 · VERI*FACTU (la cadena). Best-effort: no deshace la emisión.
        try {
            const vf = await encadenar(emitida);
            emitida = { ...emitida, vf_huella: vf.huella, vf_orden: vf.orden, verifactu: vf.vf };
            if (vf.vf?.avisos?.length) avisos.push(...vf.vf.avisos);
        } catch (e) {
            avisos.push(`Registro VERI*FACTU pendiente: ${e.message}`);
            console.error('[factura] verifactu:', e.message);
        }

        // 4 · Una rectificativa que ANULA la factura entera la deja RECTIFICADA.
        if (emitida.rectifica_id) {
            const orig = await cargar(emitida.rectifica_id);
            if (orig && r2(Number(orig.total) + t.total) === 0) {
                await supabase.from(TABLA).update({ estado: 'RECTIFICADA', updated_at: ahora, historial: anota(orig, `Rectificada por ${numero}`, usuario) }).eq('id', orig.id);
                // La hoja solo conoce ENVIADA y PAGADA: no se le pone ninguna de las
                // dos (sería falso), se le deja escrito en sus observaciones.
                if (orig.hoja_id) hoja.actualizar(orig.hoja_id, { 'OBSERVACIONES': hoja._internos.texto(`${orig.observaciones ? `${orig.observaciones} · ` : ''}RECTIFICADA POR ${numero}`) }, orig.serie)
                    .catch(e => console.warn('[factura] rectificada en la hoja:', e.message));
            }
        }

        // 5 · El PDF.
        let pdf = null, errorPdf = null;
        try { pdf = await generarPdf(emitida); }
        catch (e) { errorPdf = e.message; console.error('[factura] PDF:', e.message); }

        return { id: f.id, numero, total: t.total, pdf, errorPdf, avisos };
    } finally {
        enCurso.delete(id);
    }
}

const stripVacios = (o = {}) => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => v != null && v !== ''));

// ── PDF ─────────────────────────────────────────────────────────────────────

/** El QR de VERI*FACTU de una factura emitida, solo si el registro se remite. */
async function qrDe(f) {
    if (!f.numero || !f.vf_huella || !verifactu.activo()) return null;
    const url = verifactu.urlQr({
        nif: f.vf_nif, numSerie: f.numero, fecha: verifactu.fechaVf(f.fecha),
        importe: f.verifactu?.importe_total ?? f.total,
    });
    return { dataUri: await verifactu.qrDataUri(url), leyenda: 'VERI*FACTU', url };
}

async function htmlDe(f) {
    const L = await logica();
    const em = f.emisor || await emisor(f.serie);
    const rectificada = f.rectifica_id ? await cargar(f.rectifica_id) : null;
    const payload = L.payloadPdf(f, em, { qr: await qrDe(f), rectificada });
    return L.buildFacturaHtml(payload);
}

/** Genera el PDF de una factura EMITIDA, lo archiva y lo anota. */
async function generarPdf(f) {
    const L = await logica();
    const buffer = await htmlToPdf(await htmlDe(f));
    const nombre = L.nombrePdfFactura(f.numero, f.cliente?.razon_social);
    const driveService = require('./driveService');

    // 1 · Carpeta FACTURAS de la hoja (de donde lo abre AppSheet).
    let guardado = null;
    if (f.hoja_id) guardado = await hoja.guardarPdf({ id: f.hoja_id, numero: f.numero, razonSocial: f.cliente?.razon_social || '', buffer, serie: f.serie });

    // 2 · La carpeta del expediente de un CEE directo (no pública: lleva importes).
    let copiaId = null;
    if (f.cee_directo_id) {
        try {
            const { data: x } = await supabase.from('cee_directos').select('drive_folder_id').eq('id', f.cee_directo_id).maybeSingle();
            const sub = x?.drive_folder_id ? await driveService.findSubfolderByName(x.drive_folder_id, '3. PRESUPUESTO Y FACTURAS') : null;
            if (sub) {
                for (const fid of await driveService.findFilesByName(sub, nombre)) await driveService.deleteFile(fid);
                copiaId = (await driveService.saveFileToFolder(sub, nombre, 'application/pdf', buffer))?.id || null;
            }
        } catch (e) { console.warn('[factura] copia en el expediente:', e.message); }
    }

    // 3 · Contabilidad: las de BROKERGY (ING) a «ING - SERVICIOS DE INGENIERIA /
    // FACTURAS VENTAS»; las FML son del AUTÓNOMO y van a SU carpeta, «FML -
    // SERVICIOS AUTONOMO / VENTAS», y una copia a los GASTOS de la sociedad
    // («ING / FACTURAS GASTOS», en el mes que factura): para ella es un gasto.
    let contabilidad = null;
    if (f.serie === 'ING' || f.serie === 'FML') {
        const { archivarFacturaIngenieria, archivarFacturaAutonomo, archivarFmlComoGastoSl } = require('./facturaContabilidad');
        try {
            const archivar = f.serie === 'FML' ? archivarFacturaAutonomo : archivarFacturaIngenieria;
            const r = await archivar({ pdf: buffer, fecha: f.fecha, fileName: nombre });
            contabilidad = { id: r.id, ruta: r.ruta };
        } catch (e) { contabilidad = { error: e.message }; console.warn('[factura] contabilidad:', e.message); }
        if (f.serie === 'FML') {
            try {
                const g = await archivarFmlComoGastoSl({ pdf: buffer, fecha: f.fecha, concepto: `${f.concepto || ''} ${f.fecha_operacion || ''}`, fileName: nombre });
                contabilidad = { ...contabilidad, gasto_sl: { id: g.id, ruta: g.ruta } };
            } catch (e) { contabilidad = { ...contabilidad, gasto_sl: { error: e.message } }; console.warn('[factura] gasto de la SL:', e.message); }
        }
    }

    // Sin fila en la hoja (no debería): a la carpeta FACTURAS igualmente.
    if (!guardado) {
        const r = await driveService.saveFileToFolder(process.env.APPSHEET_FACTURAS_FOLDER_ID || '1v32LiN17naTvgjZyIn2mEnTRVoC0PAQW', nombre, 'application/pdf', buffer);
        guardado = { driveId: r?.id || null, link: r?.webViewLink || null, nombre };
    }
    const pdf = { driveId: guardado.driveId, link: guardado.link, nombre, copiaId, contabilidad, at: new Date().toISOString() };
    await supabase.from(TABLA).update({ pdf, updated_at: new Date().toISOString() }).eq('id', f.id);
    return pdf;
}

/** El PDF: el archivado si es una emitida; un BORRADOR se pinta al vuelo (no se guarda). */
async function pdfDe(id) {
    const f = await cargar(id);
    if (!f) throw error('Factura no encontrada', 404);
    const L = await logica();
    if (f.estado === 'BORRADOR') {
        return { buffer: await htmlToPdf(await htmlDe(f)), filename: L.nombrePdfFactura(null, f.cliente?.razon_social), f };
    }
    const driveService = require('./driveService');
    let buffer = f.pdf?.driveId ? await driveService.getFileContent(f.pdf.driveId).catch(() => null) : null;
    // Una importada de AppSheet: su PDF está en la carpeta FACTURAS con su nombre.
    if (!buffer?.length && f.origen === 'APPSHEET' && f.pdf?.nombre) {
        try {
            const [fid] = await driveService.findFilesByName(process.env.APPSHEET_FACTURAS_FOLDER_ID || '1v32LiN17naTvgjZyIn2mEnTRVoC0PAQW', f.pdf.nombre);
            if (fid) buffer = await driveService.getFileContent(fid);
        } catch { /* sin PDF: se dice abajo */ }
    }
    if (!buffer?.length && f.origen !== 'APPSHEET') {
        await generarPdf(f);
        const again = await cargar(id);
        buffer = again.pdf?.driveId ? await driveService.getFileContent(again.pdf.driveId) : null;
    }
    if (!buffer?.length) throw error(f.origen === 'APPSHEET' ? 'Esta factura se hizo en AppSheet: su PDF está en la carpeta FACTURAS de la hoja' : 'No se ha podido obtener el PDF de la factura', 502);
    return { buffer, filename: f.pdf?.nombre || L.nombrePdfFactura(f.numero, f.cliente?.razon_social), f };
}

async function rehacerPdf(id) {
    const f = await cargar(id);
    if (!f) throw error('Factura no encontrada', 404);
    if (f.estado === 'BORRADOR') throw error('Un borrador no tiene PDF archivado', 409);
    if (f.origen === 'APPSHEET') throw error('Esta factura se hizo en AppSheet: su PDF es el de allí', 409);
    if (DE_OTRO[f.origen]) throw error(`Esta factura es ${DE_OTRO[f.origen]} ${f.expediente || ''}: su PDF se rehace desde allí`.replace(/\s+:/, ':'), 409);
    return generarPdf(f);
}

// ── Envío ───────────────────────────────────────────────────────────────────

/** A quién y con qué texto saldría, SIN enviar (vista previa del editor y del MCP). */
async function previsualizarEnvio(id) {
    const f = await cargar(id);
    if (!f) throw error('Factura no encontrada', 404);
    const L = await logica();
    const ficha = f.cliente_id ? await fichaCliente(f.cliente_id) : null;
    const ofertas = require('./ceeOfertaService');
    const destino = ficha ? ofertas.destinoDe(ficha) : { nombre: f.cliente?.razon_social || '', email: f.cliente?.email || '', tlf: f.cliente?.tlf || '' };
    const em = f.emisor || await emisor(f.serie);
    const mensaje = L.mensajeFacturaGeneral({
        nombre: destino.nombre, esEmpresa: !!(ficha?.es_empresa ?? f.cliente?.es_empresa), numero: f.numero, total: Number(f.total),
        vencimiento: f.vencimiento, lineas: f.lineas || [], emisor: em, serie: f.serie,
        rectifica: f.rectifica_numero ? { numero: f.rectifica_numero, motivo: f.motivo_rectificacion } : null,
    });
    return { numero: f.numero, estado: f.estado, total: Number(f.total), destino, mensaje, adjunto: L.nombrePdfFactura(f.numero, f.cliente?.razon_social) };
}

async function enviar(id, { canales = [], email, tlf, mensaje, usuario = null } = {}) {
    const f = await cargar(id);
    if (!f) throw error('Factura no encontrada', 404);
    if (f.estado === 'BORRADOR') throw error('Primero hay que emitirla: un borrador no se envía', 409);
    const prev = await previsualizarEnvio(id);
    if (email === undefined) email = prev.destino.email;
    if (tlf === undefined) tlf = prev.destino.tlf;
    const quiereEmail = canales.includes('email') && txt(email);
    const quiereWa = canales.includes('whatsapp') && txt(tlf);
    if (!quiereEmail && !quiereWa) throw error('No hay ningún canal con destinatario');
    const { buffer, filename } = await pdfDe(id);
    const texto = txt(mensaje) || prev.mensaje;

    const resultados = {};
    if (quiereEmail) {
        try {
            await require('./emailService').sendDocumentEmail({
                to: txt(email), subject: `Factura ${f.numero}`, title: `Factura ${f.numero}`, message: texto,
                attachments: [{ filename, content: buffer, contentType: 'application/pdf' }],
                pill: { tone: 'info', text: `Factura ${f.numero}`, emoji: '🧾' },
            });
            resultados.email = { ok: true, to: txt(email) };
        } catch (e) { resultados.email = { ok: false, error: e.message }; }
    }
    if (quiereWa) {
        try {
            await require('./whatsappService').sendMedia(txt(tlf), { base64: buffer.toString('base64'), filename, mimetype: 'application/pdf' }, { caption: texto, asDocument: true });
            resultados.whatsapp = { ok: true, to: txt(tlf) };
        } catch (e) { resultados.whatsapp = { ok: false, error: e.message }; }
    }
    const canalesOk = Object.entries(resultados).filter(([, r]) => r.ok).map(([k]) => k);
    if (canalesOk.length) {
        const at = new Date().toISOString();
        const envio = { at, canales: canalesOk, email: quiereEmail ? txt(email) : null, tlf: quiereWa ? txt(tlf) : null, usuario };
        await supabase.from(TABLA).update({
            envios: [...(Array.isArray(f.envios) ? f.envios : []), envio], enviada_at: at, updated_at: at,
            historial: anota(f, `Enviada por ${canalesOk.join(' y ')}`, usuario),
        }).eq('id', f.id);
    }
    return { resultados, canalesOk };
}

// ── Cobro ───────────────────────────────────────────────────────────────────

/** Cobrada (o deshacerlo). Se marca también en la hoja: es el mismo hecho. */
async function cobro(id, { pagada = true, fecha = null, usuario = null } = {}) {
    const f = await cargar(id);
    if (!f) throw error('Factura no encontrada', 404);
    if (!['EMITIDA', 'PAGADA'].includes(f.estado)) throw error(`La factura está ${f.estado.toLowerCase()}: no se cobra`, 409);
    // La de un CEE directo o de la gestión CAE se cobra en su expediente: allí
    // está el candado del cobro (y la remesa), que esto se saltaría.
    if (DE_OTRO[f.origen]) throw error(`Esta factura es ${DE_OTRO[f.origen]} ${f.expediente || ''}: márcala cobrada desde allí`.replace(/\s+:/, ':'), 409);
    const fechaPago = pagada ? (/^\d{4}-\d{2}-\d{2}$/.test(fecha || '') ? fecha : hoyMadrid()) : null;
    const { error: e } = await supabase.from(TABLA).update({
        estado: pagada ? 'PAGADA' : 'EMITIDA', fecha_pago: fechaPago, updated_at: new Date().toISOString(),
        historial: anota(f, pagada ? `Cobrada el ${aHoja(fechaPago)}` : 'Cobro deshecho', usuario),
    }).eq('id', f.id);
    if (e) throw error(e.message, 500);
    let avisoHoja = null;
    if (f.hoja_id) {
        try { await hoja.actualizar(f.hoja_id, { 'ESTADO': pagada ? 'PAGADA' : 'ENVIADA', 'FECHA DE PAGO': pagada ? aHoja(fechaPago) : '' }, f.serie); }
        catch (err) { avisoHoja = `No se ha marcado en la hoja de AppSheet: ${err.message}`; }
    }
    return { ok: true, estado: pagada ? 'PAGADA' : 'EMITIDA', fecha_pago: fechaPago, avisoHoja };
}

// ── Lo que emiten otros servicios ───────────────────────────────────────────

/**
 * Anota en `facturas_emitidas` una factura que ha emitido OTRO servicio (CEE
 * directos, gestión CAE) con su número de la hoja, y la encadena en VERI*FACTU.
 * Best-effort para quien llama: nunca tumba su emisión.
 */
async function registrarEmitida({ origen, serie = 'ING', numero, hojaId = null, fecha, vencimiento = null, cliente = {}, clienteId = null,
    lineas = [], observaciones = null, expediente = null, ceeDirectoId = null, estado = 'EMITIDA', pdf = null, usuario = null }) {
    if (!hoja.ES_LIBRO_REAL) return { omitida: 'libro de prueba' };
    try {
        const L = await logica();
        if (await cargarPorNumero(numero)) return { ya: true };
        // En la réplica del CEE la tasa va al 0 % sin la marca: es un suplido.
        const ls = L.sanearFactura({ lineas: lineas.map(l => ({ ...l, suplido: l.suplido || (Number(l.ivaPct) === 0 && /tasa/i.test(l.descripcion || '')) })) }).lineas;
        const cli = L.sanearCliente(cliente);
        const em = await emisor(serie);
        const m = L.RE_ORDINARIA.exec(numero);
        const fila = {
            serie, tipo: 'F1', numero, correlativo: m ? Number(m[3]) : null, estado: estado === 'PAGADA' ? 'PAGADA' : 'EMITIDA',
            fecha, vencimiento, cliente_id: clienteId, cliente: cli, lineas: ls, irpf_pct: 0, observaciones, expediente,
            cee_directo_id: ceeDirectoId, origen, hoja_id: hojaId, pdf,
            emisor: em ? { razon_social: em.razon_social, nif: em.nif, direccion: em.direccion, cp: em.cp, municipio: em.municipio, provincia: em.provincia, tlf: em.tlf, email: em.email, banco: em.banco, iban: em.iban } : null,
            ...L.derivados({ lineas: ls, irpf_pct: 0, cliente: cli }),
            emitida_at: new Date().toISOString(), historial: anota(null, `Emitida ${numero} desde ${origen === 'CEE_DIRECTO' ? 'el CEE directo' : 'la gestión CAE'}`, usuario),
        };
        const { data, error: e } = await supabase.from(TABLA).insert(fila).select('*').single();
        if (e) throw new Error(e.message);
        if (data.emisor) await encadenar(data).catch(err => console.warn('[factura] verifactu de', numero, err.message));
        return { id: data.id };
    } catch (e) {
        console.warn(`[factura] no se ha registrado ${numero} en facturas_emitidas:`, e.message);
        return { error: e.message };
    }
}

/**
 * Lo que le pasa DESPUÉS a una factura emitida por otro servicio: su PDF, un
 * envío o un cambio de fecha. Un cambio de fecha deja dicho en el registro de
 * VERI*FACTU que hay que subsanarlo (la huella se calculó con la fecha vieja).
 */
async function actualizarRegistrada(numero, { pdf, envio, fecha, vencimiento, usuario = null } = {}) {
    if (!hoja.ES_LIBRO_REAL) return;
    try {
        const f = await cargarPorNumero(numero);
        if (!f) return;
        const at = new Date().toISOString();
        const cambios = { updated_at: at };
        if (pdf) cambios.pdf = pdf;
        if (envio) {
            cambios.envios = [...(Array.isArray(f.envios) ? f.envios : []), envio];
            cambios.enviada_at = envio.at || at;
            cambios.historial = anota(f, `Enviada por ${(envio.canales || []).join(' y ') || 'otro mensaje'}`, usuario);
        }
        if (fecha && fecha !== f.fecha) {
            cambios.fecha = fecha;
            if (vencimiento) cambios.vencimiento = vencimiento;
            cambios.historial = anota({ ...f, historial: cambios.historial || f.historial }, `Fecha cambiada del ${aHoja(f.fecha)} al ${aHoja(fecha)}`, usuario);
            if (f.verifactu) {
                cambios.verifactu = { ...f.verifactu, avisos: [...(f.verifactu.avisos || []), `La fecha se cambió después del registro (${aHoja(f.fecha)} → ${aHoja(fecha)}): hay que subsanarlo antes de remitirlo`] };
            }
        }
        await supabase.from(TABLA).update(cambios).eq('id', f.id);
    } catch (e) { console.warn('[factura] actualizar', numero, e.message); }
}

/** El cobro de una factura emitida por otro servicio (CEE directo), por su número. */
async function marcarCobroPorNumero(numero, { pagada, fecha = null } = {}) {
    if (!hoja.ES_LIBRO_REAL) return;
    try {
        const f = await cargarPorNumero(numero);
        if (!f || !['EMITIDA', 'PAGADA'].includes(f.estado)) return;
        await supabase.from(TABLA).update({ estado: pagada ? 'PAGADA' : 'EMITIDA', fecha_pago: pagada ? (fecha || hoyMadrid()) : null, updated_at: new Date().toISOString() }).eq('id', f.id);
    } catch (e) { console.warn('[factura] cobro de', numero, e.message); }
}

// ── El libro de AppSheet ────────────────────────────────────────────────────

/**
 * Trae a la tabla lo que se emitió en AppSheet (origen APPSHEET), y el cobro de
 * lo que ya estaba (la hoja manda en ESTADO mientras AppSheet conviva). En SECO
 * por defecto: devuelve lo que haría. NO se encadena en VERI*FACTU: esas
 * facturas no las generó este sistema.
 */
async function importarLibro({ serie = 'ING', escribir = false } = {}) {
    const L = await logica();
    const S = String(serie).toUpperCase();
    const [libro, articulos, clientesHoja] = await Promise.all([hoja.libro(S), hoja.articulos(), hoja.clientesHoja()]);
    const nombreArt = new Map(articulos.map(a => [String(a.id), a]));
    const { data: existentes, error: e } = await supabase.from(TABLA).select('id, numero, estado, fecha_pago').eq('serie', S);
    if (e) throw error(e.message, 503);
    const porNumero = new Map((existentes || []).map(x => [x.numero, x]));
    const em = await emisor(S);

    // Cliente de la app por NIF (una consulta, no una por factura).
    const nifs = [...new Set(libro.map(f => f.cliente_nif).filter(Boolean))];
    const clientesApp = new Map();
    for (let i = 0; i < nifs.length; i += 100) {
        const { data } = await supabase.from('clientes').select('id_cliente, dni').in('dni', nifs.slice(i, i + 100));
        for (const c of data || []) clientesApp.set(String(c.dni).toUpperCase().replace(/[^A-Z0-9]/g, ''), c.id_cliente);
    }

    const nuevas = [], cobros = [], descuadres = [];
    for (const f of libro) {
        const estado = f.estado === 'PAGADA' ? 'PAGADA' : 'EMITIDA';
        const ya = porNumero.get(f.numero);
        if (ya) {
            if (['EMITIDA', 'PAGADA'].includes(ya.estado) && ya.estado !== estado) cobros.push({ id: ya.id, numero: f.numero, de: ya.estado, a: estado, fecha_pago: f.fecha_pago });
            continue;
        }
        const lineas = L.sanearFactura({
            lineas: f.lineas.map(l => {
                const a = nombreArt.get(l.articulo_id);
                const desc = a?.nombre || (l.articulo_id ? `Artículo ${l.articulo_id}` : 'Concepto');
                return { ...l, appsheet_id: l.articulo_id || null, articulo_id: null, descripcion: desc, suplido: Number(l.ivaPct) === 0 && /tasa|\*/i.test(desc) };
            }),
        }).lineas;
        const irpfPct = f.irpf && f.neto ? Math.round(f.irpf / f.neto * 10000) / 100 : 0;
        const t = L.calcularFactura({ lineas, irpfPct });
        if (Math.abs(t.total - f.total) > 0.02) descuadres.push(`${f.numero}: la hoja dice ${L.fmtEur(f.total)} y sus líneas suman ${L.fmtEur(t.total)}`);
        const cli = clientesHoja.get(f.cliente_nif) || { cif: f.cliente_nif };
        nuevas.push({
            serie: S, tipo: 'F1', numero: f.numero, correlativo: Number(L.RE_ORDINARIA.exec(f.numero)?.[3]) || null, estado,
            fecha: f.fecha, vencimiento: f.vencimiento, fecha_pago: estado === 'PAGADA' ? f.fecha_pago : null,
            cliente_id: clientesApp.get(f.cliente_nif) || null, cliente: L.sanearCliente(cli),
            cliente_nombre: L.sanearCliente(cli).razon_social || null, cliente_nif: f.cliente_nif || null,
            lineas, concepto: L.derivados({ lineas, irpf_pct: irpfPct }).concepto,
            // Las cifras, las de la HOJA: es lo que se facturó.
            neto: r2(f.neto), iva: r2(f.iva), irpf_pct: irpfPct, irpf: r2(f.irpf), descuento: r2(f.descuento), total: r2(f.total),
            observaciones: f.observaciones, expediente: f.expediente, origen: 'APPSHEET', hoja_id: f.id,
            emisor: em ? { razon_social: em.razon_social, nif: em.nif } : null,
            pdf: f.pdf ? { ruta: f.pdf, nombre: f.pdf.split('/').pop() } : null,
            historial: [{ fecha: new Date().toISOString(), texto: 'Importada del libro de AppSheet', usuario: null }],
        });
    }
    if (escribir) {
        for (let i = 0; i < nuevas.length; i += 200) {
            const { error: eIns } = await supabase.from(TABLA).upsert(nuevas.slice(i, i + 200), { onConflict: 'numero', ignoreDuplicates: true });
            if (eIns) throw error(eIns.message, 500);
        }
        for (const c of cobros) {
            await supabase.from(TABLA).update({ estado: c.a, fecha_pago: c.a === 'PAGADA' ? c.fecha_pago : null, updated_at: new Date().toISOString() }).eq('id', c.id);
        }
    }
    return { serie: S, en_hoja: libro.length, nuevas: nuevas.length, cobros, descuadres, escrito: escribir, muestra: nuevas.slice(-3).map(n => `${n.numero} · ${n.cliente_nombre} · ${L.fmtEur(n.total)} · ${n.estado}`) };
}

/** El número que TOCARÍA (vista previa: el de verdad se reserva al emitir). */
async function proximoNumero(serie = 'ING', { tipo = 'F1', fecha = null } = {}) {
    const s = String(serie).toUpperCase();
    if (tipo && tipo !== 'F1') return (await siguienteRectificativa(s, fecha || hoyMadrid())).numero;
    return hoja.proximoNumero(s);
}

module.exports = {
    TABLA, emisores, emisor, guardarEmisor, listar, cargar, cargarPorNumero, detalle, crear, actualizar, borrar, duplicar,
    desdePresupuesto, facturasDelPresupuesto, rectificar, emitir, encadenar, generarPdf, pdfDe, rehacerPdf, htmlDe, previsualizarEnvio, enviar, cobro,
    registrarEmitida, actualizarRegistrada, marcarCobroPorNumero, importarLibro, proximoNumero, clienteDeFicha,
};
