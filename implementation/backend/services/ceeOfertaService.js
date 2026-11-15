// ─── ceeOfertaService.js ─────────────────────────────────────────────────────
// OFERTAS de Certificado de Eficiencia Energética (CEE directos).
//
//   alta + envío (PDF + enlace)  →  el cliente acepta en /aceptar-cee/:token
//   →  se completa su ficha      →  nace el expediente {AAAA}CEE_{n}
//
// Es el gemelo PEQUEÑO de la propuesta CAE: mismo gesto (se le manda un PDF y un
// enlace; al aceptar se completan sus datos), pero sin oportunidad, sin versión
// ni ficha — y el número de expediente NO existe hasta que el cliente dice que
// sí. Una oferta rechazada no puede comerse un número del correlativo global.
//
// Qué se calcula y cómo se ve el PDF lo decide `features/cee-directo/logic/
// ofertaCee.js` (fuente única con el popup y la página pública). Aquí solo se
// orquesta: guardar, rasterizar, enviar y aceptar.
// ─────────────────────────────────────────────────────────────────────────────

const path = require('path');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const supabase = require('./supabaseClient');
const { htmlToPdf } = require('./pdfService');
const emailService = require('./emailService');
const whatsappService = require('./whatsappService');
const driveService = require('./driveService');
const ceeDirectos = require('./ceeDirectoService');
const { normalizeCliente } = require('../utils/normalization');
const { marcarSiElPartnerLoPide } = require('./avisosAlPartner');

const TABLA = 'cee_ofertas';
const FRONTEND = () => process.env.FRONTEND_URL || 'https://app.brokergy.es';
const adminPhone = () => process.env.WHATSAPP_ADMIN_CHAT || '34623926179';
const adminEmail = () => process.env.ADMIN_EMAIL || 'franciscojavier.moya.s2e2@gmail.com';

let _mod = null;
/** La plantilla vive en el frontend (ESM): se carga una vez por proceso. */
function modulo() {
    if (!_mod) {
        const url = pathToFileURL(path.join(__dirname, '../../frontend/src/features/cee-directo/logic/ofertaCee.js')).href;
        _mod = import(url);
    }
    return _mod;
}

let _cuest = null;
/** Las preguntas de climatización (mismo módulo que la página pública). */
function cuestionarioMod() {
    if (!_cuest) {
        const url = pathToFileURL(path.join(__dirname, '../../frontend/src/features/cee-directo/logic/cuestionarioCee.js')).href;
        _cuest = import(url);
    }
    return _cuest;
}

const urlAceptacion = (token) => `${FRONTEND()}/aceptar-cee/${token}`;
/**
 * Lo pide un INSTALADOR para un cliente suyo (2026-11-10): el presupuesto va a su
 * nombre y se le factura a él, pero el certificado es del PROPIETARIO, que lo
 * indica él al aceptar. Solo tiene sentido si hay un certificado que hacer.
 */
const esParaTercero = (o) => !!(o?.para_tercero && o?.alcance);
const nombreCliente = (c) => (c ? `${c.nombre_razon_social || ''} ${c.apellidos || ''}`.trim() : '');
// Un presupuesto de partidas (pestaña Facturación) no tiene por qué ser de un CEE.
const nombreFichero = (o) => (Array.isArray(o.lineas) ? `Presupuesto ${o.numero}.pdf` : `Oferta CEE ${o.numero}.pdf`);
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** Número suelto, admitiendo la coma decimal. */
const numero = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(String(v).replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
};

// ── Lectura ─────────────────────────────────────────────────────────────────

async function conCliente(row) {
    if (!row) return null;
    const [{ data: cliente }, { data: prescriptor }] = await Promise.all([
        supabase.from('clientes').select('*').eq('id_cliente', row.cliente_id).maybeSingle(),
        row.prescriptor_id
            ? supabase.from('prescriptores').select('id_empresa, razon_social, acronimo').eq('id_empresa', row.prescriptor_id).maybeSingle()
            : Promise.resolve({ data: null })
    ]);
    return { ...row, cliente, prescriptor };
}

async function cargar(id) {
    const { data } = await supabase.from(TABLA).select('*').eq('id', id).maybeSingle();
    return conCliente(data);
}

async function cargarPorToken(token) {
    if (!/^[a-f0-9]{32}$/i.test(String(token || ''))) return null;
    const { data } = await supabase.from(TABLA).select('*').eq('token', token).maybeSingle();
    // Un BORRADOR no ha salido de casa: su enlace todavía no existe para nadie.
    if (data?.estado === 'BORRADOR') return null;
    return conCliente(data);
}

/**
 * La PRIMERA vez que el cliente abre el enlace: el listado lo enseña como
 * «visto», que es lo que dice a quién llamar. Best-effort.
 */
async function marcarVisto(oferta) {
    if (!oferta?.id || oferta.visto_at || oferta.estado !== 'ENVIADA') return;
    try {
        await supabase.from(TABLA).update({ visto_at: new Date().toISOString() }).eq('id', oferta.id).is('visto_at', null);
    } catch (e) { console.warn('[presupuesto visto]', e.message); }
}

/**
 * Listado para la pestaña CEE directos: sin JSONB pesados (se piden columnas;
 * las partidas NO, el total ya va en su columna). Solo los presupuestos que
 * abren un CEE (`alcance`): uno de solo legalización o consultoría vive en la
 * pestaña Facturación y aquí sería una fila sin expediente posible.
 */
async function listar({ estados = ['ENVIADA'] } = {}) {
    const { data, error } = await supabase.from(TABLA)
        .select('id, numero, token, alcance, precio, dto_pct, iva_pct, tasa, num_tasas, total, estado, cliente_id, prescriptor_id, municipio, direccion, envios, created_at, aceptada_at, cee_directo_id')
        .in('estado', estados)
        .not('alcance', 'is', null)
        .order('created_at', { ascending: false })
        .limit(200);
    if (error) throw new Error(error.message);
    const filas = data || [];
    const ids = [...new Set(filas.map(f => f.cliente_id).filter(Boolean))];
    const clientes = {};
    // Por lotes: un `.in()` con la lista entera revienta al crecer la base.
    for (let i = 0; i < ids.length; i += 100) {
        const { data: cs } = await supabase.from('clientes')
            .select('id_cliente, nombre_razon_social, apellidos')
            .in('id_cliente', ids.slice(i, i + 100));
        for (const c of cs || []) clientes[c.id_cliente] = nombreCliente(c);
    }
    const m = await modulo();
    return filas.map(f => ({
        ...f,
        cliente_nombre: clientes[f.cliente_id] || '',
        total: f.total != null ? Number(f.total) : m.totalesOferta(f).total,
        ultimo_envio: Array.isArray(f.envios) && f.envios.length ? f.envios[f.envios.length - 1] : null,
        envios: undefined
    }));
}

// ── Alta ────────────────────────────────────────────────────────────────────

/**
 * Crea la oferta. No envía nada: lo hace `enviar`, para que un fallo de
 * WhatsApp no deje una oferta a medio crear ni un envío sin número.
 */
async function crear(datos = {}, { usuarioId = null, usuarioNombre = null } = {}) {
    const m = await modulo();
    const { clienteId, clienteCreado } = await resolverCliente(datos);
    datos = { ...datos, cliente_id: clienteId };

    const alcance = m.alcanceDe(datos.alcance);
    const precio = numero(datos.precio);
    if (!(precio > 0)) throw Object.assign(new Error('El precio tiene que ser mayor que cero'), { status: 400 });
    const tasa = numero(datos.tasa);

    const fila = {
        cliente_id: datos.cliente_id,
        prescriptor_id: datos.prescriptor_id || null,
        alcance,
        precio: r2(precio),
        dto_pct: Math.min(100, Math.max(0, numero(datos.dto_pct) || 0)),
        iva_pct: numero(datos.iva_pct) ?? m.IVA_DEFECTO,
        tasa: r2(tasa ?? m.TASA_REGISTRO_CLM),
        num_tasas: m.numTasasDe(alcance),
        ...inmuebleDe(datos),
        // Solo el texto libre para el cliente: la política de entrega sale sola en el PDF.
        observaciones: m.observacionesCliente(datos.observaciones) || null,
        token: crypto.randomBytes(16).toString('hex'),
        estado: 'ENVIADA',
        historial: [{ fecha: new Date().toISOString(), texto: 'Oferta creada', usuario: usuarioNombre }],
        created_by: usuarioId
    };
    const { data, error } = await supabase.from(TABLA).insert(fila).select().single();
    if (error) throw new Error(error.message);
    return { ...(await conCliente(data)), _clienteCreado: clienteCreado };
}

/** Los campos del inmueble tal como se guardan en la fila. */
function inmuebleDe(datos = {}) {
    return {
        direccion: datos.direccion || null,
        ref_catastral: datos.ref_catastral ? String(datos.ref_catastral).toUpperCase().trim() : null,
        ccaa: datos.ccaa || null,
        provincia: datos.provincia || null,
        municipio: datos.municipio || null,
        codigo_postal: datos.codigo_postal || null,
    };
}

/**
 * El cliente del presupuesto: el elegido (`cliente_id`) o una ALTA RÁPIDA
 * (`cliente_nuevo`: nombre y, si se tienen, teléfono y email). Lo usan la oferta
 * de CEE y el presupuesto de partidas (`presupuestoService`).
 */
async function resolverCliente(datos = {}) {
    let clienteCreado = false;
    if (!datos.cliente_id && datos.cliente_nuevo?.nombre?.trim()) {
        // ALTA RÁPIDA: de quien pregunta por WhatsApp solo hay un nombre y un
        // teléfono, y con eso tiene que poder salir la oferta. El resto (DNI,
        // apellidos, domicilio) lo completa él al aceptar. NO se busca una ficha
        // por el teléfono: un mismo móvil figura en fichas de personas distintas
        // (regla 47) y casar por ahí le mandaría la oferta a nombre de otro.
        const n = datos.cliente_nuevo;
        const { data: nuevo, error: eCli } = await supabase.from('clientes').insert(normalizeCliente({
            nombre_razon_social: String(n.nombre).trim(),
            tlf: n.tlf || null,
            email: n.email || null,
            prescriptor_id: datos.prescriptor_id || null
        })).select('id_cliente').single();
        if (eCli) throw new Error(`No se pudo dar de alta al cliente: ${eCli.message}`);
        // Si su partner pide TODOS los avisos de sus clientes, nace con el desvío.
        await marcarSiElPartnerLoPide(nuevo.id_cliente);
        datos = { ...datos, cliente_id: nuevo.id_cliente };
        clienteCreado = true;
    }
    if (!datos.cliente_id) throw Object.assign(new Error('Hay que indicar el cliente del presupuesto'), { status: 400 });
    const { data: cli } = await supabase.from('clientes').select('id_cliente').eq('id_cliente', datos.cliente_id).maybeSingle();
    if (!cli) throw Object.assign(new Error('El cliente indicado no existe'), { status: 400 });
    return { clienteId: datos.cliente_id, clienteCreado };
}

/**
 * Deshace un alta que no llegó a salir: la oferta y, si se creó con ella, la
 * ficha rápida del cliente — una ficha con solo un nombre, de alguien a quien no
 * se le ha mandado nada, es ruido en la base de clientes.
 */
async function descartar(oferta) {
    if (!oferta?.id) return;
    await supabase.from(TABLA).delete().eq('id', oferta.id);
    if (oferta._clienteCreado && oferta.cliente_id) {
        await supabase.from('clientes').delete().eq('id_cliente', oferta.cliente_id);
    }
}

// ── PDF ─────────────────────────────────────────────────────────────────────

async function htmlDe(oferta) {
    const m = await modulo();
    return m.buildOfertaCeeHtml(oferta, { cliente: oferta.cliente || {}, firmaUrl: urlAceptacion(oferta.token) });
}

async function pdfDe(oferta) {
    const html = await htmlDe(oferta);
    return { buffer: await htmlToPdf(html), filename: nombreFichero(oferta) };
}

// ── Envío ───────────────────────────────────────────────────────────────────

/**
 * Manda la oferta por los canales elegidos. El PDF se genera UNA vez y ese
 * mismo buffer viaja por email y por WhatsApp (mismo criterio que la propuesta
 * CAE: dos rasterizados serían dos documentos).
 *
 * Todo o nada en el PDF: si no se puede preparar, no sale nada. Por canal, en
 * cambio, se informa de cada resultado — un WhatsApp caído no puede tapar un
 * email que sí salió.
 */
/**
 * El mensaje que acompaña al PDF. Un presupuesto de partidas cuenta QUÉ se le
 * presupuesta (una partida por línea); la oferta antigua, su frase del CEE.
 */
async function mensajePorDefecto(oferta) {
    const m = await modulo();
    const { total, tasas } = m.totalesOferta(oferta);
    const url = urlAceptacion(oferta.token);
    const conLineas = Array.isArray(oferta.lineas);
    return m.mensajeOferta({
        nombre: destinoDe(oferta.cliente).nombre || nombreCliente(oferta.cliente),
        numero: oferta.numero, alcance: oferta.alcance,
        total, tasas, url, inmueble: m.direccionInmueble(oferta),
        ...(conLineas ? { partidas: (await partidasMod()).partidasDe(oferta.lineas), abreCee: !!oferta.alcance } : {}),
        paraTercero: esParaTercero(oferta),
    });
}

let _part = null;
function partidasMod() {
    if (!_part) _part = import(pathToFileURL(path.join(__dirname, '../../frontend/src/features/facturacion/logic/presupuesto.js')).href);
    return _part;
}

/**
 * A quién le llega: con el desvío de contacto activo, a su persona de contacto
 * (mismo criterio que el popup y que /firma/:id).
 */
function destinoDe(c) {
    if (!c) return { email: '', tlf: '', nombre: '' };
    if (c.notificaciones_contacto_activas && (c.persona_contacto_tlf || c.persona_contacto_email)) {
        return {
            email: c.persona_contacto_email || c.email || '',
            tlf: c.persona_contacto_tlf || c.tlf || '',
            nombre: c.persona_contacto_nombre || nombreCliente(c),
        };
    }
    return { email: c.email || '', tlf: c.tlf || '', nombre: nombreCliente(c) };
}

async function enviar(oferta, { canales = [], email, tlf, mensaje, usuario = null } = {}) {
    // Un BORRADOR se envía (y pasa a ENVIADA); uno ya enviado se REENVÍA.
    if (!['ENVIADA', 'BORRADOR'].includes(oferta.estado)) throw Object.assign(new Error(`El presupuesto está ${oferta.estado.toLowerCase()} y ya no se envía`), { status: 409 });
    // Sin destinatario explícito (el MCP no dicta teléfonos), el de la ficha.
    const dest = destinoDe(oferta.cliente);
    if (email === undefined) email = dest.email;
    if (tlf === undefined) tlf = dest.tlf;
    const quiereEmail = canales.includes('email') && email;
    const quiereWa = canales.includes('whatsapp') && tlf;
    if (!quiereEmail && !quiereWa) throw Object.assign(new Error('No hay ningún canal con destinatario'), { status: 400 });

    const url = urlAceptacion(oferta.token);
    // Un mensaje editado en el popup ANTES de que existiera el número lleva los
    // marcadores del borrador: aquí se cambian por el número y el enlace reales.
    const texto = ((mensaje && String(mensaje).trim()) || await mensajePorDefecto(oferta))
        .replace(/\(nº de (oferta|presupuesto)\)/g, oferta.numero || '')
        .replace(/\(enlace para aceptar\)/g, url);
    const conLineas = Array.isArray(oferta.lineas);

    const { buffer, filename } = await pdfDe(oferta);

    const resultados = {};
    if (quiereEmail) {
        try {
            await emailService.sendDocumentEmail({
                to: email,
                subject: conLineas ? `Tu presupuesto · ${oferta.numero}` : `Tu presupuesto de certificado energético · ${oferta.numero}`,
                title: conLineas ? 'Tu presupuesto' : 'Tu presupuesto de certificado energético',
                message: texto,
                primaryLink: url,
                primaryLabel: conLineas ? 'Aceptar el presupuesto' : 'Aceptar la oferta',
                attachments: [{ filename, content: buffer, contentType: 'application/pdf' }],
                pill: { tone: 'info', text: `Presupuesto ${oferta.numero}`, emoji: '📄' }
            });
            resultados.email = { ok: true, to: email };
        } catch (e) {
            resultados.email = { ok: false, error: e.message };
        }
    }
    if (quiereWa) {
        try {
            // El texto va PRIMERO y aparte (sendMedia lo parte por sí solo al
            // llevar saltos de línea) y detrás el PDF.
            await whatsappService.sendMedia(tlf,
                { base64: buffer.toString('base64'), filename, mimetype: 'application/pdf' },
                { caption: texto, asDocument: true });
            resultados.whatsapp = { ok: true, to: tlf };
        } catch (e) {
            resultados.whatsapp = { ok: false, error: e.message };
        }
    }

    const canalesOk = Object.entries(resultados).filter(([, r]) => r.ok).map(([k]) => k);
    const envio = {
        at: new Date().toISOString(), canales: canalesOk, email: quiereEmail ? email : null,
        tlf: quiereWa ? tlf : null, usuario,
        ...(canalesOk.length < Object.keys(resultados).length
            ? { errores: Object.entries(resultados).filter(([, r]) => !r.ok).map(([k, r]) => `${k}: ${r.error}`) }
            : {})
    };
    if (canalesOk.length) {
        const envios = [...(Array.isArray(oferta.envios) ? oferta.envios : []), envio];
        const historial = [...(Array.isArray(oferta.historial) ? oferta.historial : []),
            { fecha: envio.at, texto: `Enviada por ${canalesOk.join(' y ')}`, usuario }];
        const upd = { envios, historial, updated_at: envio.at };
        if (oferta.estado === 'BORRADOR') upd.estado = 'ENVIADA';
        // El paso de BORRADOR a ENVIADA solo si sigue en borrador (un envío
        // doble no debe pisar una aceptación que haya llegado entre medias).
        let q = supabase.from(TABLA).update(upd).eq('id', oferta.id);
        if (upd.estado) q = q.eq('estado', 'BORRADOR');
        await q;
        oferta.estado = upd.estado || oferta.estado;
    }
    return { resultados, canalesOk, url, mensaje: texto };
}

async function anular(id, usuario = null) {
    const o = await cargar(id);
    if (!o) throw Object.assign(new Error('Oferta no encontrada'), { status: 404 });
    if (!['ENVIADA', 'BORRADOR'].includes(o.estado)) throw Object.assign(new Error(`El presupuesto ya está ${o.estado.toLowerCase()}`), { status: 409 });
    const historial = [...(o.historial || []), { fecha: new Date().toISOString(), texto: 'Anulado', usuario }];
    await supabase.from(TABLA).update({ estado: 'ANULADA', historial, updated_at: new Date().toISOString() }).eq('id', id);
    return { ok: true };
}

// ── Vista pública ───────────────────────────────────────────────────────────

/** Lo que ve el cliente al abrir el enlace. Sin datos internos (partner, historial). */
async function vistaPublica(oferta) {
    const m = await modulo();
    const { lineas, neto, iva, total } = m.totalesOferta(oferta);
    const c = oferta.cliente || {};
    // El email y el teléfono salen de donde el cliente los recibe: con el desvío
    // activo, de su persona de contacto (mismo criterio que /firma/:id).
    const desvio = c.notificaciones_contacto_activas && !c.contacto_es_partner;
    let numeroExpediente = null;
    let docs = null;
    if (oferta.cee_directo_id) {
        const { data } = await supabase.from('cee_directos').select('id, numero_expediente, portal_token').eq('id', oferta.cee_directo_id).maybeSingle();
        numeroExpediente = data?.numero_expediente || null;
        // Ya aceptada, el mismo enlace le sigue dejando subir las fotos del CEE.
        if (data) docs = { expedienteId: data.id, token: data.portal_token || await require('./ceeDirectoDocsService').asegurarToken(data) };
    }
    // Ya aceptado un presupuesto con informe: su número y SU enlace (documentación,
    // en qué punto está y, cobrado, el firmado).
    let informe = null;
    if (oferta.informe_id) {
        const { data } = await supabase.from('informes').select('id, numero, portal_token').eq('id', oferta.informe_id).maybeSingle();
        if (data) informe = { numero: data.numero, enlace: require('./informeService').enlaceCliente(data) };
        if (!numeroExpediente) numeroExpediente = data?.numero || null;
    }
    return {
        numero: oferta.numero,
        fecha: oferta.created_at,
        estado: oferta.estado,
        alcance: oferta.alcance,
        // Sin CEE no hay cuestionario de climatización ni fotos para el técnico.
        abre_cee: !!oferta.alcance,
        concepto: m.conceptoOferta(oferta),
        lineas: lineas.map(l => ({ descripcion: l.descripcion, detalle: l.detalle || '', uds: l.uds, precio: l.precio, dto_pct: l.dtoPct || 0, iva_pct: l.ivaPct, suplido: !!l.suplido })),
        neto, iva, total,
        observaciones: m.observacionesCliente(oferta.observaciones),
        aceptada_at: oferta.aceptada_at,
        aceptada_por: oferta.aceptada_por,
        numero_expediente: numeroExpediente,
        docs,
        informe,
        // Lo pide un instalador: «Tus datos» son los suyos (los de la factura) y el
        // certificado es del PROPIETARIO, que rellena él. Si ya se aceptó, el
        // propietario que dio (para enseñarlo en «ya está aceptado»).
        para_tercero: esParaTercero(oferta),
        propietario: esParaTercero(oferta) ? await propietarioPublico(oferta) : null,
        cliente: {
            nombre_razon_social: c.nombre_razon_social || '',
            apellidos: c.apellidos || '',
            dni_cif: c.dni || '',
            email: (desvio ? c.persona_contacto_email : c.email) || c.email || c.persona_contacto_email || '',
            telefono: (desvio ? c.persona_contacto_tlf : c.tlf) || c.tlf || c.persona_contacto_tlf || '',
            domicilio: {
                direccion: c.direccion || '', codigo_postal: c.codigo_postal || '',
                municipio: c.municipio || '', provincia: c.provincia || ''
            }
        },
        inmueble: {
            direccion: oferta.direccion || '',
            codigo_postal: oferta.codigo_postal || '',
            municipio: oferta.municipio || '',
            provincia: oferta.provincia || '',
            ref_catastral: oferta.ref_catastral || ''
        }
    };
}

/** El propietario ya dado (tras aceptar), con lo justo para la página pública. */
async function propietarioPublico(oferta) {
    if (!oferta.propietario_cliente_id) return null;
    const { data: p } = await supabase.from('clientes').select('nombre_razon_social, apellidos')
        .eq('id_cliente', oferta.propietario_cliente_id).maybeSingle();
    return p ? { nombre: nombreCliente(p) } : null;
}

// ── Aceptación ──────────────────────────────────────────────────────────────

const txt = (v) => (v == null ? '' : String(v).trim());

/**
 * El PROPIETARIO de la vivienda de un presupuesto «para un cliente suyo»: es quien
 * sale en el certificado (regla «el que va en el certificado es el CLIENTE»).
 *
 * - Con un DNI que ya tiene otra ficha, ESA es la persona: se usa y solo se le
 *   rellenan los huecos (no se pisa lo que ya teníamos de ella).
 * - Si no, nace su ficha, con el inmueble como domicilio y el partner del
 *   presupuesto.
 * - Si la visita se coordina con el INSTALADOR (o el propietario no ha dado ni
 *   móvil ni email), su ficha nace con el DESVÍO de contacto al instalador: el
 *   técnico y los avisos le llegan a él, por el mismo camino que todo cliente con
 *   persona de contacto. A una ficha que ya existía no se le cambia el desvío: le
 *   desviaría también los avisos de lo que ya tenga con nosotros.
 */
async function resolverPropietario(oferta, form, { pagadorId, inm }) {
    const p = form.propietario || {};
    const dni = txt(p.dni).toUpperCase().replace(/[\s.-]/g, '');
    const tlf = txt(p.telefono);
    const email = txt(p.email);
    const coordina = form.coordina_visita === 'propietario' && (tlf || email) ? 'propietario' : 'instalador';

    let existente = null;
    if (dni) {
        const { data } = await supabase.from('clientes').select('*').eq('dni', dni).limit(1);
        existente = data?.[0] || null;
    }
    // El DNI del propietario no puede ser el del propio instalador: sería
    // emitir el certificado a nombre de quien no es el dueño.
    if (existente && existente.id_cliente === pagadorId) {
        throw Object.assign(new Error('El DNI del propietario es el mismo que el tuyo. Pon los datos del dueño de la vivienda.'), { status: 400 });
    }

    if (existente) {
        const upd = {};
        if (!existente.apellidos && txt(p.apellidos)) upd.apellidos = txt(p.apellidos);
        if (!existente.tlf && tlf) upd.tlf = tlf;
        if (!existente.email && email) upd.email = email;
        if (!existente.direccion && inm.direccion) {
            Object.assign(upd, { direccion: inm.direccion, codigo_postal: inm.codigo_postal, municipio: inm.municipio, provincia: inm.provincia });
        }
        if (Object.keys(upd).length) {
            const { error } = await supabase.from('clientes').update(normalizeCliente(upd)).eq('id_cliente', existente.id_cliente);
            if (error) throw new Error(`No se pudieron guardar los datos del propietario: ${error.message}`);
        }
        return { propietarioId: existente.id_cliente, creado: false, coordina };
    }

    const { data: pag } = await supabase.from('clientes')
        .select('nombre_razon_social, apellidos, tlf, email, persona_contacto_nombre, persona_contacto_tlf, persona_contacto_email')
        .eq('id_cliente', pagadorId).maybeSingle();
    // Con quién se habla en la empresa del instalador: su persona de contacto si
    // la tiene (la empresa tiene nombre, pero quien coge el teléfono es alguien).
    const contactoPagador = {
        nombre: txt(pag?.persona_contacto_nombre) || nombreCliente(pag),
        tlf: txt(pag?.persona_contacto_tlf) || txt(pag?.tlf) || txt(form.telefono),
        email: txt(pag?.persona_contacto_email) || txt(pag?.email) || txt(form.email),
    };
    const fila = {
        nombre_razon_social: txt(p.nombre),
        apellidos: txt(p.apellidos) || null,
        dni: dni || null,
        tlf: tlf || null,
        email: email || null,
        direccion: inm.direccion, codigo_postal: inm.codigo_postal, municipio: inm.municipio, provincia: inm.provincia,
        prescriptor_id: oferta.prescriptor_id || null,
        ...(coordina === 'instalador' ? {
            notificaciones_contacto_activas: true,
            persona_contacto_nombre: contactoPagador.nombre || null,
            persona_contacto_tlf: contactoPagador.tlf || null,
            persona_contacto_email: contactoPagador.email || null,
        } : {}),
    };
    const { data: nuevo, error } = await supabase.from('clientes').insert(normalizeCliente(fila)).select('id_cliente').single();
    if (error) throw new Error(`No se pudo dar de alta al propietario: ${error.message}`);
    return { propietarioId: nuevo.id_cliente, creado: true, coordina };
}

/**
 * El partner del CEE cuando lo pide un instalador: el del presupuesto y, si no se
 * puso, el partner que tenga el MISMO CIF que el instalador (así la factura y la
 * entrega le reconocen como «el partner que trae el encargo»).
 */
async function partnerDelPagador(oferta, pagadorId) {
    if (oferta.prescriptor_id) return oferta.prescriptor_id;
    const { data: pag } = await supabase.from('clientes').select('dni').eq('id_cliente', pagadorId).maybeSingle();
    const cif = txt(pag?.dni).toUpperCase();
    if (!cif) return null;
    const { data } = await supabase.from('prescriptores').select('id_empresa').eq('cif', cif).limit(1);
    return data?.[0]?.id_empresa || null;
}

/**
 * Completa la ficha del cliente con lo que ha escrito. Mismo reparto que la
 * aceptación de la propuesta CAE: con el desvío de contacto activo, el email y
 * el teléfono son los de su persona de contacto; si la persona de contacto es
 * el partner, no se pisan.
 *
 * El DNI es único en `clientes`: si ya lo tiene OTRA ficha, esa es la persona y
 * se usa esa (la oferta se reasigna), en vez de fallar la aceptación.
 */
async function completarCliente(oferta, f) {
    let clienteId = oferta.cliente_id;
    const dni = txt(f.dni_cif).toUpperCase();
    if (dni) {
        const { data: otro } = await supabase.from('clientes').select('id_cliente')
            .eq('dni', dni).neq('id_cliente', clienteId).limit(1);
        if (otro && otro.length) clienteId = otro[0].id_cliente;
    }
    const { data: cur } = await supabase.from('clientes')
        .select('notificaciones_contacto_activas, contacto_es_partner').eq('id_cliente', clienteId).maybeSingle();

    const upd = {
        nombre_razon_social: txt(f.nombre_razon_social),
        apellidos: txt(f.apellidos) || null,
        dni: dni || null
    };
    if (cur?.contacto_es_partner) {
        // La persona de contacto es el partner: lo que teclee el cliente no la pisa.
    } else if (cur?.notificaciones_contacto_activas) {
        upd.persona_contacto_email = txt(f.email) || null;
        upd.persona_contacto_tlf = txt(f.telefono) || null;
    } else {
        upd.email = txt(f.email) || null;
        upd.tlf = txt(f.telefono) || null;
    }
    // Su DOMICILIO (el CEE va a su nombre). Solo si lo ha dado: una ficha que ya
    // tenía dirección no se vacía porque el formulario llegue sin ella.
    const dom = f.domicilio || {};
    if (txt(dom.direccion)) {
        upd.direccion = txt(dom.direccion);
        upd.codigo_postal = txt(dom.codigo_postal) || null;
        upd.municipio = txt(dom.municipio) || null;
        upd.provincia = txt(dom.provincia) || null;
    }
    const { error } = await supabase.from('clientes').update(normalizeCliente(upd)).eq('id_cliente', clienteId);
    if (error) throw new Error(`No se pudieron guardar tus datos: ${error.message}`);
    return clienteId;
}

/**
 * El cliente acepta. Idempotente: una segunda pulsación devuelve el mismo
 * expediente, no otro. El paso a ACEPTADA es un claim ATÓMICO (`eq estado
 * ENVIADA`): dos pulsaciones simultáneas no pueden crear dos expedientes.
 */
async function aceptar(token, form = {}) {
    const oferta = await cargarPorToken(token);
    if (!oferta || oferta.estado === 'BORRADOR') throw Object.assign(new Error('Esta oferta no existe o el enlace no es correcto'), { status: 404 });
    if (oferta.estado === 'ANULADA') throw Object.assign(new Error('Esta oferta ha sido anulada. Ponte en contacto con nosotros y te enviamos una nueva.'), { status: 409 });
    if (oferta.estado === 'RECHAZADA') throw Object.assign(new Error('Este presupuesto está cerrado. Ponte en contacto con nosotros y te enviamos uno nuevo.'), { status: 409 });
    if (oferta.estado === 'ACEPTADA') {
        return { yaAceptada: true, numeroExpediente: (await vistaPublica(oferta)).numero_expediente };
    }

    // El inmueble solo es obligatorio si hay un CEE que hacer en él.
    const tercero = esParaTercero(oferta);
    const obligatorios = [['nombre_razon_social', 'el nombre'], ['dni_cif', 'el DNI / CIF'], ['email', 'el email'], ['telefono', 'el teléfono'],
        ...(oferta.alcance ? [['direccion', 'la dirección del inmueble'], ['municipio', 'el municipio del inmueble']] : [])];
    for (const [k, etiqueta] of obligatorios) {
        if (!txt(form[k])) throw Object.assign(new Error(`Falta ${etiqueta}`), { status: 400 });
    }
    if (tercero) {
        // El certificado va a nombre del propietario: sin su nombre y su DNI no
        // se puede registrar.
        const p = form.propietario || {};
        if (!txt(p.nombre)) throw Object.assign(new Error('Falta el nombre del propietario de la vivienda'), { status: 400 });
        if (!txt(p.dni)) throw Object.assign(new Error('Falta el DNI del propietario de la vivienda'), { status: 400 });
        if (txt(p.dni).toUpperCase().replace(/[\s.-]/g, '') === txt(form.dni_cif).toUpperCase().replace(/[\s.-]/g, '')) {
            throw Object.assign(new Error('El DNI del propietario es el mismo que el tuyo. Pon los datos del dueño de la vivienda.'), { status: 400 });
        }
    }
    const cond = txt(form.condiciones_version);
    const aceptadaPor = `${txt(form.nombre_razon_social)} ${txt(form.apellidos)}`.trim();
    const ahora = new Date().toISOString();

    // Claim atómico ANTES de crear nada.
    const { data: claim } = await supabase.from(TABLA)
        .update({ estado: 'ACEPTADA', aceptada_at: ahora, aceptada_por: aceptadaPor,
                  condiciones_version: /^[\w.-]{1,20}$/.test(cond) ? cond : null, updated_at: ahora })
        .eq('id', oferta.id).eq('estado', 'ENVIADA').select('id');
    if (!claim || !claim.length) {
        const otra = await cargarPorToken(token);
        return { yaAceptada: true, numeroExpediente: (await vistaPublica(otra)).numero_expediente };
    }

    // La ficha del propietario que se crea al aceptar (si el alta falla después, se quita).
    let propietarioCreado = null;
    try {
        const clienteId = await completarCliente(oferta, form);

        // El inmueble: el formulario llega RELLENO con lo que puso el equipo, y
        // lo que el cliente haya corregido MANDA — el Catastro no da el piso ni
        // la puerta, y quien sabe cuál es su vivienda es él. Un campo vacío no
        // borra lo que ya había.
        const rcForm = txt(form.ref_catastral).toUpperCase().replace(/[^A-Z0-9]/g, '');
        const inm = {
            direccion: txt(form.direccion) || oferta.direccion || null,
            codigo_postal: txt(form.codigo_postal) || oferta.codigo_postal || null,
            municipio: txt(form.municipio) || oferta.municipio || null,
            provincia: txt(form.provincia) || oferta.provincia || null,
            // La comunidad solo vale si el municipio sigue siendo el de la oferta.
            ccaa: (!txt(form.municipio) || txt(form.municipio).toUpperCase() === String(oferta.municipio || '').toUpperCase()) ? (oferta.ccaa || null) : null,
            ref_catastral: (rcForm.length === 14 || rcForm.length === 20) ? rcForm : (oferta.ref_catastral || null)
        };

        const m = await modulo();
        const { total } = m.totalesOferta(oferta);

        if (!oferta.alcance) {
            // Sin CEE (una legalización, una memoria, una consultoría…) no nace
            // ningún expediente: el presupuesto queda ACEPTADO, con los datos del
            // cliente ya completos para facturarle, y se avisa al equipo.
            await supabase.from(TABLA).update({
                cliente_id: clienteId,
                direccion: inm.direccion, codigo_postal: inm.codigo_postal, municipio: inm.municipio,
                provincia: inm.provincia, ref_catastral: inm.ref_catastral,
                historial: [...(oferta.historial || []), { fecha: ahora, texto: `Aceptado por ${aceptadaPor}`, usuario: 'Cliente' }]
            }).eq('id', oferta.id);
            const ofertaFinal = { ...oferta, ...inm, cliente_id: clienteId };
            // Con un artículo que GENERA un informe (memoria, legalización…), nace
            // su 2026INF_n con carpeta propia (Fran, 05/11/2026: «todo lo que no
            // sea CAE ni CEE»). Si falla, la aceptación se deshace (abajo), como
            // cuando falla el expediente de un CEE.
            const informe = generaInforme(oferta) ? await crearInforme(ofertaFinal, { clienteId, inm, aceptadaPor }) : null;
            setImmediate(() => avisarSinCee({ oferta: ofertaFinal, form, total, fmtEur: m.fmtEur, informe })
                .catch(e => console.error('[presupuesto aviso]', e.message)));
            return {
                yaAceptada: false, numeroExpediente: informe?.numero || null, sinExpediente: !informe,
                ...(informe ? { informe: { numero: informe.numero, enlace: require('./informeService').enlaceCliente(informe) } } : {}),
            };
        }

        // Lo que ha contestado de climatización: viaja al expediente para que lo
        // vea el equipo y el técnico antes de la visita.
        const cq = await cuestionarioMod();
        // Para un cliente del instalador: el CEE es del PROPIETARIO y quien paga
        // (y recibe la factura y los certificados) es el instalador, `clienteId`.
        let propietario = null;
        if (tercero) {
            propietario = await resolverPropietario(oferta, form, { pagadorId: clienteId, inm });
            propietarioCreado = propietario.creado ? propietario.propietarioId : null;
        }
        const cuestionario = {
            ...cq.sanearCuestionario(form.cuestionario || {}),
            ...(propietario ? { coordina_visita: propietario.coordina } : {}),
            contestado_at: ahora,
        };
        const p = form.propietario || {};
        const nombreExp = (propietario ? `${txt(p.nombre)} ${txt(p.apellidos)}`.trim() : aceptadaPor).toUpperCase()
            || nombreCliente(oferta.cliente).toUpperCase();
        const prescriptorExp = tercero ? await partnerDelPagador(oferta, clienteId) : oferta.prescriptor_id;

        const ofertaFinal = { ...oferta, ...inm, cliente_id: clienteId };
        const creado = await ceeDirectos.crearExpediente({
            nombre: nombreExp,
            alcance: oferta.alcance,
            cliente_id: propietario ? propietario.propietarioId : clienteId,
            pagador_cliente_id: propietario ? clienteId : null,
            prescriptor_id: prescriptorExp,
            ...inm,
            documentacion: {
                cuestionario,
                // Con partidas, viajan ELLAS (la factura sale de lo aceptado: ver
                // `facturaCee.lineasPorDefecto`); las columnas de la oferta
                // antigua, solo si no las hay.
                oferta: Array.isArray(oferta.lineas)
                    ? { id: oferta.id, numero: oferta.numero, total, lineas: oferta.lineas, aceptada_at: ahora }
                    : { id: oferta.id, numero: oferta.numero, total, precio: Number(oferta.precio), dto_pct: Number(oferta.dto_pct || 0), tasa: Number(oferta.tasa), num_tasas: oferta.num_tasas, aceptada_at: ahora }
            },
            notas: `Nace de la aceptación de la oferta ${oferta.numero} (${m.fmtEur(total)}).`
                + (propietario ? ` Lo pide ${aceptadaPor} para su cliente: se le factura a él y la visita se coordina con ${propietario.coordina === 'propietario' ? 'el propietario' : 'él'}.` : '')
        }, {
            // La carpeta tiene que existir YA: la misma pantalla le deja subir las
            // fotos para el CEE en cuanto acepta.
            esperarCarpeta: true,
            // Con la carpeta ya creada, se archiva AHÍ el PDF de lo que aceptó.
            onCarpeta: async (carpeta, exp) => {
                if (!carpeta?.subcarpetas) return;
                const destino = Object.entries(carpeta.subcarpetas).find(([n]) => n.toUpperCase().includes('PRESUPUESTO'))?.[1];
                if (!destino) return;
                const cliFresco = (await conCliente({ ...ofertaFinal })).cliente;
                const { buffer, filename } = await pdfDe({ ...ofertaFinal, cliente: cliFresco });
                await driveService.saveFileToFolder(destino, `${exp.numero_expediente} – ${filename}`, 'application/pdf', buffer);
            }
        });

        await supabase.from(TABLA).update({
            cee_directo_id: creado.id, cliente_id: clienteId,
            ...(propietario ? { propietario_cliente_id: propietario.propietarioId } : {}),
            direccion: inm.direccion, codigo_postal: inm.codigo_postal, municipio: inm.municipio,
            provincia: inm.provincia, ref_catastral: inm.ref_catastral,
            historial: [...(oferta.historial || []), { fecha: ahora, texto: `Aceptada por ${aceptadaPor}${propietario ? ` para ${nombreExp}` : ''} → ${creado.numero_expediente}`, usuario: 'Cliente' }]
        }).eq('id', oferta.id);

        await ceeDirectos.anotarHistorial(creado.id, {
            tipo: 'CLIENTE',
            texto: propietario
                ? `EXPEDIENTE CREADO AL ACEPTAR ${aceptadaPor.toUpperCase()} LA OFERTA ${oferta.numero} (${m.fmtEur(total)}) PARA SU CLIENTE ${nombreExp}: SE LE FACTURA A ${aceptadaPor.toUpperCase()}`
                : `EXPEDIENTE CREADO AL ACEPTAR EL CLIENTE LA OFERTA ${oferta.numero} (${m.fmtEur(total)})`,
            usuario: `Cliente (${aceptadaPor})`
        });

        // Un CEE y además un informe en el mismo presupuesto: el informe nace
        // aparte, pero el CEE ya existe, así que su fallo no deshace nada: se avisa.
        if (generaInforme(oferta)) {
            await crearInforme(ofertaFinal, { clienteId, inm, aceptadaPor, avisar: true })
                .catch(e => console.error(`[presupuesto ${oferta.numero}] el informe no se ha creado:`, e.message));
        }

        setImmediate(() => avisar({ oferta: ofertaFinal, expediente: creado, form, total, fmtEur: m.fmtEur, resumen: cq.resumenCuestionario(cuestionario), propietario: propietario ? nombreExp : null }).catch(e =>
            console.error('[oferta-cee aviso]', e.message)));

        // La confirmación al CLIENTE no sale aquí: justo después de aceptar se le
        // deja subiendo las fotos, y un "nos falta la fachada" en ese mismo minuto
        // llegaría mientras la está subiendo. Sale cuando pulsa "He terminado"
        // (o "lo subo luego"); y si cierra la página sin pulsar nada, a los 30
        // minutos. Ese respaldo vive en memoria: un reinicio en esa ventana se lo
        // come (el equipo ya tiene su aviso con el enlace al expediente).
        const t = setTimeout(() => confirmarAlCliente(token, { motivo: 'automatico' })
            .catch(e => console.warn('[oferta-cee confirmación diferida]', e.message)), CONFIRMACION_DIFERIDA_MS);
        if (t.unref) t.unref();

        const docs = require('./ceeDirectoDocsService');
        return {
            yaAceptada: false, numeroExpediente: creado.numero_expediente, expedienteId: creado.id,
            // Con esto la misma pantalla le deja subir las fotos para el CEE.
            docsToken: await docs.asegurarToken(creado)
        };
    } catch (err) {
        // Sin expediente la oferta no puede quedar como aceptada: se devuelve al
        // estado anterior para que el cliente pueda volver a intentarlo.
        await supabase.from(TABLA).update({ estado: 'ENVIADA', aceptada_at: null, aceptada_por: null })
            .eq('id', oferta.id);
        // Una ficha de propietario recién nacida y sin expediente es ruido: al
        // reintentar se crearía otra igual (o chocaría por el DNI). Solo si no
        // llegó a tener nada colgando.
        if (propietarioCreado) {
            const { data: usa } = await supabase.from('cee_directos').select('id').eq('cliente_id', propietarioCreado).limit(1);
            if (!usa?.length) await supabase.from('clientes').delete().eq('id_cliente', propietarioCreado);
        }
        throw err;
    }
}

/** Aviso al equipo (WhatsApp + email). Nunca tumba la aceptación. */
async function avisar({ oferta, expediente, form, total, fmtEur, resumen = [], propietario = null }) {
    const nombre = `${txt(form.nombre_razon_social)} ${txt(form.apellidos)}`.trim();
    const enlace = `${FRONTEND()}/?cee=${expediente.id}`;
    const inmueble = [oferta.direccion, oferta.municipio].filter(Boolean).join(', ');
    const p = form.propietario || {};
    const staff = [
        '✅ *OFERTA CEE ACEPTADA*',
        '',
        `Oferta: *${oferta.numero}* · ${fmtEur(total)}`,
        `Expediente creado: *${expediente.numero_expediente}*`,
        ...(propietario
            ? [
                `Lo pide (y se le factura): ${nombre} · ${txt(form.telefono)} · ${txt(form.email)}`,
                `Propietario (va en el certificado): ${propietario} · ${txt(p.dni).toUpperCase()}${txt(p.telefono) ? ` · ${txt(p.telefono)}` : ''}`,
            ]
            : [`Cliente: ${nombre} · ${txt(form.telefono)} · ${txt(form.email)}`]),
        `Alcance: ${oferta.alcance === 'DOBLE' ? 'CEE inicial y final' : 'un certificado'}`,
        inmueble ? `Inmueble: ${inmueble}` : 'Inmueble: ⚠️ sin dirección — completarla antes de encargar',
        ...(resumen.length ? ['', ...resumen.map(([k, v]) => `• ${k}: ${v}`)] : []),
        '',
        `Siguiente paso: encargar el CEE a un técnico → ${enlace}`
    ].join('\n');
    try { await whatsappService.sendText(adminPhone(), staff); } catch (e) { console.warn('[oferta-cee] WA staff:', e.message); }
    try {
        await emailService.sendMail({
            to: adminEmail(),
            subject: `Oferta ${oferta.numero} aceptada → ${expediente.numero_expediente}`,
            text: staff.replace(/\*/g, ''),
            html: `<pre style="font-family:inherit;white-space:pre-wrap">${staff.replace(/\*/g, '').replace(/</g, '&lt;')}</pre>`
        });
    } catch (e) { console.warn('[oferta-cee] email staff:', e.message); }

}

/**
 * Presupuesto SIN CEE aceptado: aviso al equipo y acuse al cliente en el acto
 * (aquí no hay fotos que subir, así que no se espera a «He terminado»).
 * Nunca tumba la aceptación.
 */
/** ¿Lleva alguna partida que abre un INFORME o un CIT? (`genera: 'INFORME'` / `'CIT'` del catálogo) */
const generaInforme = (oferta) => Array.isArray(oferta.lineas) && oferta.lineas.some(l => l?.genera === 'INFORME' || l?.genera === 'CIT');

/** Nace el informe del presupuesto aceptado, con el PDF de lo aceptado en su carpeta. */
async function crearInforme(ofertaFinal, { clienteId, inm, aceptadaPor, avisar = false }) {
    let pdf = null;
    try {
        const cliFresco = (await conCliente({ ...ofertaFinal })).cliente;
        pdf = await pdfDe({ ...ofertaFinal, cliente: cliFresco });
    } catch (e) { console.warn('[presupuesto → informe] PDF:', e.message); }
    const informe = await require('./informeService').desdePresupuesto(ofertaFinal, { clienteId, inmueble: inm, aceptadaPor, pdf, avisar });
    await supabase.from(TABLA).update({ informe_id: informe.id }).eq('id', ofertaFinal.id);
    return informe;
}

async function avisarSinCee({ oferta, form, total, fmtEur, informe = null }) {
    const nombre = `${txt(form.nombre_razon_social)} ${txt(form.apellidos)}`.trim();
    const partidas = Array.isArray(oferta.lineas) ? (await partidasMod()).partidasDe(oferta.lineas) : [];
    const inmueble = [oferta.direccion, oferta.municipio].filter(Boolean).join(', ');
    const staff = [
        '✅ *PRESUPUESTO ACEPTADO*',
        '',
        `Presupuesto: *${oferta.numero}* · ${fmtEur(total)}`,
        `Cliente: ${nombre} · ${txt(form.telefono)} · ${txt(form.email)}`,
        ...(inmueble ? [`Inmueble: ${inmueble}`] : []),
        ...(partidas.length ? ['', ...partidas.map(p => `• ${p}`)] : []),
        '',
        informe
            ? `Abierto el *${informe.numero}* (${informe.titulo}). Siguiente paso: ${informe.linea === 'CIT' ? 'hacer la memoria RITE' : 'redactarlo'} → ${FRONTEND()}/?informe=${informe.id}`
            : `Siguiente paso: ponerse en marcha y facturar → ${FRONTEND()}/?tab=facturacion`
    ].join('\n');
    try { await whatsappService.sendText(adminPhone(), staff); } catch (e) { console.warn('[presupuesto] WA staff:', e.message); }
    try {
        await emailService.sendMail({
            to: adminEmail(),
            subject: `Presupuesto ${oferta.numero} aceptado`,
            text: staff.replace(/\*/g, ''),
            html: `<pre style="font-family:inherit;white-space:pre-wrap">${staff.replace(/\*/g, '').replace(/</g, '&lt;')}</pre>`
        });
    } catch (e) { console.warn('[presupuesto] email staff:', e.message); }

    const { data: cli } = await supabase.from('clientes').select('*').eq('id_cliente', oferta.cliente_id).maybeSingle();
    const dest = destinoDe(cli);
    const primer = String(dest.nombre || nombre).split(/\s+/)[0] || '';
    const texto = [
        primer ? `¡Hola ${primer.charAt(0).toUpperCase()}${primer.slice(1).toLowerCase()}!` : '¡Hola!', '',
        `Hemos recibido la aceptación de tu presupuesto *${oferta.numero}*. *¡Muchas gracias por confiar en Brokergy!*`, '',
        'Nos ponemos en marcha y en breve te contamos los siguientes pasos.', '',
        // Con informe: su número y SU enlace, para subir la documentación y, al
        // final, recoger el documento firmado.
        ...(informe ? [`Tu número es *${informe.numero}*. Si tienes a mano la documentación (${informe.linea === 'CIT' ? 'la factura de la instalación y fotos de las placas de los equipos' : 'presupuesto del instalador, fichas técnicas…'}), súbela aquí; en este mismo enlace verás cómo va:`,
            `👉 ${require('./informeService').enlaceCliente(informe)}`, ''] : []),
        '¡Quedamos a tu disposición para cualquier duda!',
        '*BROKERGY — Ingeniería Energética*'
    ].join('\n');
    if (dest.tlf) {
        try { await whatsappService.sendText(dest.tlf, texto); } catch (e) { console.warn('[presupuesto] WA cliente:', e.message); }
    }
    if (dest.email) {
        try {
            await emailService.sendDocumentEmail({
                to: dest.email,
                subject: `Presupuesto ${oferta.numero} aceptado`,
                title: 'Hemos recibido tu aceptación',
                message: texto,
                pill: { tone: 'success', text: 'Presupuesto aceptado' }
            });
        } catch (e) { console.warn('[presupuesto] email cliente:', e.message); }
    }
}

const CONFIRMACION_DIFERIDA_MS =Number(process.env.OFERTA_CEE_CONFIRMACION_MS) || 30 * 60 * 1000;
const confirmando = new Set();   // candado: "He terminado" y el respaldo pueden coincidir

/**
 * Confirmación de la aceptación AL CLIENTE, con el enlace para completar la
 * documentación si falta algo (la fachada, o nada de patios, vídeo y planos).
 * Una sola vez por expediente (`documentacion.confirmacion_cliente`).
 */
async function confirmarAlCliente(token, { motivo = 'cliente' } = {}) {
    const oferta = await cargarPorToken(token);
    if (!oferta || oferta.estado !== 'ACEPTADA' || !oferta.cee_directo_id) {
        throw Object.assign(new Error('Esta oferta no está aceptada'), { status: 409 });
    }
    const id = oferta.cee_directo_id;
    if (confirmando.has(id)) return { enviado: false, motivo: 'EN_CURSO' };
    confirmando.add(id);
    try {
        const row = await ceeDirectos.cargar(id);
        if (!row) return { enviado: false, motivo: 'NO_EXISTE' };
        if (row.documentacion?.confirmacion_cliente) return { enviado: false, motivo: 'YA_ENVIADA' };

        const docs = require('./ceeDirectoDocsService');
        const f = await docs.faltan(row);
        const pedir = [...f.obligatorios, ...f.recomendados];
        const url = pedir.length ? await docs.enlace(row, pedir) : null;

        // Si lo pidió un instalador para su cliente, quien acaba de aceptar —y está
        // subiendo las fotos— es él: la confirmación es para él.
        const contacto = row.pagador ? ceeDirectos.contactoCliente(row.pagador) : ceeDirectos.contactoCliente(row.cliente);
        const coordinaPropietario = row.pagador && row.documentacion?.cuestionario?.coordina_visita === 'propietario';
        const propietarioNombre = row.pagador ? nombreCliente(row.cliente) : null;
        const primer = (String(contacto.nombre || '').split(/\s+/)[0] || '');
        const saludo = primer ? `¡Hola ${primer.charAt(0).toUpperCase()}${primer.slice(1).toLowerCase()}!` : '¡Hola!';
        // Misma redacción que el acuse de aceptación del CAE (routes/public.js).
        const bloqueDocs = !pedir.length ? ['¡Gracias por las fotos! Ya tenemos lo necesario para preparar el certificado.', '']
            : [
                f.obligatorios.length
                    ? '📁 *Para poder hacer tu certificado necesitamos* (puedes enviarlo poco a poco):'
                    : '📁 *Si puedes, envíanos también* (le ahorra trabajo al técnico en la visita):',
                ...docs.lineasPeticion(pedir).map(l => `• ${l}`),
                '',
                '🔗 *Puedes subir tu documentación aquí:*',
                url,
                '',
            ];
        // Con los DOS certificados, el inicial describe la vivienda ANTES de la
        // obra: hecho después, ya no sirve (p. ej. para la deducción del IRPF).
        const avisoObra = String(row.alcance || '').toUpperCase() === 'DOBLE'
            ? ['Como vas a necesitar el certificado de antes y el de después de la obra, es importante que el inicial quede hecho *antes de empezar la obra*: te avisaremos en cuanto esté.', '']
            : [];
        const texto = [
            saludo, '',
            `Hemos recibido la aceptación de tu presupuesto *${oferta.numero}*. *¡Muchas gracias por confiar en Brokergy!*`, '',
            `Tu número de expediente asignado es: *${row.numero_expediente}*`, '',
            ...(propietarioNombre ? [`El certificado irá a nombre de *${propietarioNombre}*.`, ''] : []),
            ...avisoObra,
            ...bloqueDocs,
            coordinaPropietario
                ? `En los próximos días el técnico certificador se pondrá en contacto con ${propietarioNombre} para concertar la visita.`
                : 'En los próximos días el técnico certificador se pondrá en contacto contigo para concertar la visita.', '',
            '¡Quedamos a tu disposición para cualquier duda!',
            '*BROKERGY — Ingeniería Energética*'
        ].join('\n');

        const canales = [];
        if (contacto.tlf) {
            try { await whatsappService.sendText(contacto.tlf, texto); canales.push('whatsapp'); } catch (e) { console.warn('[oferta-cee] WA cliente:', e.message); }
        }
        if (contacto.email) {
            try {
                await emailService.sendDocumentEmail({
                    to: contacto.email,
                    subject: `Presupuesto ${oferta.numero} aceptado · expediente ${row.numero_expediente}`,
                    title: 'Hemos recibido tu aceptación',
                    message: texto,
                    ...(url ? { primaryLink: url, primaryLabel: 'Subir la documentación' } : {}),
                    pill: { tone: 'success', text: 'Presupuesto aceptado' }
                });
                canales.push('email');
            } catch (e) { console.warn('[oferta-cee] email cliente:', e.message); }
        }
        await ceeDirectos.mergeDoc(id, 'confirmacion_cliente', {
            at: new Date().toISOString(), canales, motivo, faltaban: f.etiquetas, enlace: url
        });
        await ceeDirectos.anotarHistorial(id, {
            tipo: 'CLIENTE',
            texto: `CONFIRMACIÓN DE LA ACEPTACIÓN AL CLIENTE${canales.length ? ` POR ${canales.join(' Y ').toUpperCase()}` : ' (NO SALIÓ POR NINGÚN CANAL)'}`
                + (pedir.length ? ` · CON ENLACE PARA SUBIR: ${f.etiquetas.join(', ').toUpperCase()}` : ' · DOCUMENTACIÓN COMPLETA'),
            usuario: null
        });
        return { enviado: canales.length > 0, canales, faltaban: f.etiquetas };
    } finally {
        confirmando.delete(id);
    }
}

module.exports = {
    TABLA, urlAceptacion, cargar, cargarPorToken, listar, crear, descartar, enviar, anular,
    htmlDe, pdfDe, vistaPublica, aceptar, confirmarAlCliente, marcarVisto,
    // Para el presupuesto de partidas (presupuestoService):
    conCliente, resolverCliente, inmuebleDe, destinoDe, mensajePorDefecto, nombreCliente
};
