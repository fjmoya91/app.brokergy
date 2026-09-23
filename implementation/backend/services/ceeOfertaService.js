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
const nombreCliente = (c) => (c ? `${c.nombre_razon_social || ''} ${c.apellidos || ''}`.trim() : '');
const nombreFichero = (o) => `Oferta CEE ${o.numero}.pdf`;
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
    return conCliente(data);
}

/** Listado para la pestaña: sin JSONB pesados (aquí no los hay, pero se piden columnas). */
async function listar({ estados = ['ENVIADA'] } = {}) {
    const { data, error } = await supabase.from(TABLA)
        .select('id, numero, token, alcance, precio, dto_pct, iva_pct, tasa, num_tasas, estado, cliente_id, prescriptor_id, municipio, direccion, envios, created_at, aceptada_at, cee_directo_id')
        .in('estado', estados)
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
        total: m.totalesOferta(f).total,
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
        datos = { ...datos, cliente_id: nuevo.id_cliente };
        clienteCreado = true;
    }
    if (!datos.cliente_id) throw Object.assign(new Error('Hay que indicar el cliente de la oferta'), { status: 400 });
    const { data: cli } = await supabase.from('clientes').select('id_cliente').eq('id_cliente', datos.cliente_id).maybeSingle();
    if (!cli) throw Object.assign(new Error('El cliente indicado no existe'), { status: 400 });

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
        direccion: datos.direccion || null,
        ref_catastral: datos.ref_catastral ? String(datos.ref_catastral).toUpperCase().trim() : null,
        ccaa: datos.ccaa || null,
        provincia: datos.provincia || null,
        municipio: datos.municipio || null,
        codigo_postal: datos.codigo_postal || null,
        observaciones: datos.observaciones ?? m.observacionesDefecto(alcance),
        token: crypto.randomBytes(16).toString('hex'),
        estado: 'ENVIADA',
        historial: [{ fecha: new Date().toISOString(), texto: 'Oferta creada', usuario: usuarioNombre }],
        created_by: usuarioId
    };
    const { data, error } = await supabase.from(TABLA).insert(fila).select().single();
    if (error) throw new Error(error.message);
    return { ...(await conCliente(data)), _clienteCreado: clienteCreado };
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
async function enviar(oferta, { canales = [], email, tlf, mensaje, usuario = null } = {}) {
    if (oferta.estado !== 'ENVIADA') throw Object.assign(new Error(`La oferta está ${oferta.estado.toLowerCase()} y ya no se envía`), { status: 409 });
    const quiereEmail = canales.includes('email') && email;
    const quiereWa = canales.includes('whatsapp') && tlf;
    if (!quiereEmail && !quiereWa) throw Object.assign(new Error('No hay ningún canal con destinatario'), { status: 400 });

    const m = await modulo();
    const { total, tasas } = m.totalesOferta(oferta);
    const url = urlAceptacion(oferta.token);
    const texto = (mensaje && String(mensaje).trim()) || m.mensajeOferta({
        nombre: nombreCliente(oferta.cliente), numero: oferta.numero, alcance: oferta.alcance,
        total, tasas, url, inmueble: m.direccionInmueble(oferta)
    });

    const { buffer, filename } = await pdfDe(oferta);

    const resultados = {};
    if (quiereEmail) {
        try {
            await emailService.sendDocumentEmail({
                to: email,
                subject: `Tu presupuesto de certificado energético · ${oferta.numero}`,
                title: 'Tu presupuesto de certificado energético',
                message: texto,
                primaryLink: url,
                primaryLabel: 'Aceptar la oferta',
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
        await supabase.from(TABLA).update({ envios, historial, updated_at: envio.at }).eq('id', oferta.id);
    }
    return { resultados, canalesOk, url };
}

async function anular(id, usuario = null) {
    const o = await cargar(id);
    if (!o) throw Object.assign(new Error('Oferta no encontrada'), { status: 404 });
    if (o.estado !== 'ENVIADA') throw Object.assign(new Error(`La oferta ya está ${o.estado.toLowerCase()}`), { status: 409 });
    const historial = [...(o.historial || []), { fecha: new Date().toISOString(), texto: 'Oferta anulada', usuario }];
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
    return {
        numero: oferta.numero,
        fecha: oferta.created_at,
        estado: oferta.estado,
        alcance: oferta.alcance,
        concepto: m.conceptoOferta(oferta),
        lineas: lineas.map(l => ({ descripcion: l.descripcion, uds: l.uds, precio: l.precio, iva_pct: l.ivaPct })),
        neto, iva, total,
        aceptada_at: oferta.aceptada_at,
        aceptada_por: oferta.aceptada_por,
        numero_expediente: numeroExpediente,
        docs,
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

// ── Aceptación ──────────────────────────────────────────────────────────────

const txt = (v) => (v == null ? '' : String(v).trim());

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
    if (!oferta) throw Object.assign(new Error('Esta oferta no existe o el enlace no es correcto'), { status: 404 });
    if (oferta.estado === 'ANULADA') throw Object.assign(new Error('Esta oferta ha sido anulada. Ponte en contacto con nosotros y te enviamos una nueva.'), { status: 409 });
    if (oferta.estado === 'ACEPTADA') {
        return { yaAceptada: true, numeroExpediente: (await vistaPublica(oferta)).numero_expediente };
    }

    for (const [k, etiqueta] of [['nombre_razon_social', 'el nombre'], ['dni_cif', 'el DNI / CIF'], ['email', 'el email'], ['telefono', 'el teléfono'],
        ['direccion', 'la dirección del inmueble'], ['municipio', 'el municipio del inmueble']]) {
        if (!txt(form[k])) throw Object.assign(new Error(`Falta ${etiqueta}`), { status: 400 });
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
        // Lo que ha contestado de climatización: viaja al expediente para que lo
        // vea el equipo y el técnico antes de la visita.
        const cq = await cuestionarioMod();
        const cuestionario = { ...cq.sanearCuestionario(form.cuestionario || {}), contestado_at: ahora };
        const nombreExp = aceptadaPor.toUpperCase() || nombreCliente(oferta.cliente).toUpperCase();

        const ofertaFinal = { ...oferta, ...inm, cliente_id: clienteId };
        const creado = await ceeDirectos.crearExpediente({
            nombre: nombreExp,
            alcance: oferta.alcance,
            cliente_id: clienteId,
            prescriptor_id: oferta.prescriptor_id,
            ...inm,
            documentacion: {
                cuestionario,
                oferta: { id: oferta.id, numero: oferta.numero, total, precio: Number(oferta.precio), dto_pct: Number(oferta.dto_pct || 0), tasa: Number(oferta.tasa), num_tasas: oferta.num_tasas, aceptada_at: ahora }
            },
            notas: `Nace de la aceptación de la oferta ${oferta.numero} (${m.fmtEur(total)}).`
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
            direccion: inm.direccion, codigo_postal: inm.codigo_postal, municipio: inm.municipio,
            provincia: inm.provincia, ref_catastral: inm.ref_catastral,
            historial: [...(oferta.historial || []), { fecha: ahora, texto: `Aceptada por ${aceptadaPor} → ${creado.numero_expediente}`, usuario: 'Cliente' }]
        }).eq('id', oferta.id);

        await ceeDirectos.anotarHistorial(creado.id, {
            tipo: 'CLIENTE',
            texto: `EXPEDIENTE CREADO AL ACEPTAR EL CLIENTE LA OFERTA ${oferta.numero} (${m.fmtEur(total)})`,
            usuario: `Cliente (${aceptadaPor})`
        });

        setImmediate(() => avisar({ oferta: ofertaFinal, expediente: creado, form, total, fmtEur: m.fmtEur, resumen: cq.resumenCuestionario(cuestionario) }).catch(e =>
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
        throw err;
    }
}

/** Aviso al equipo (WhatsApp + email). Nunca tumba la aceptación. */
async function avisar({ oferta, expediente, form, total, fmtEur, resumen = [] }) {
    const nombre = `${txt(form.nombre_razon_social)} ${txt(form.apellidos)}`.trim();
    const enlace = `${FRONTEND()}/?cee=${expediente.id}`;
    const inmueble = [oferta.direccion, oferta.municipio].filter(Boolean).join(', ');
    const staff = [
        '✅ *OFERTA CEE ACEPTADA*',
        '',
        `Oferta: *${oferta.numero}* · ${fmtEur(total)}`,
        `Expediente creado: *${expediente.numero_expediente}*`,
        `Cliente: ${nombre} · ${txt(form.telefono)} · ${txt(form.email)}`,
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

const CONFIRMACION_DIFERIDA_MS = Number(process.env.OFERTA_CEE_CONFIRMACION_MS) || 30 * 60 * 1000;
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

        const contacto = ceeDirectos.contactoCliente(row.cliente);
        const primer = (String(contacto.nombre || '').split(/\s+/)[0] || '');
        const saludo = primer ? `¡Hola ${primer.charAt(0).toUpperCase()}${primer.slice(1).toLowerCase()}!` : '¡Hola!';
        const bloqueDocs = !pedir.length ? ['¡Gracias por las fotos! Ya tenemos lo necesario para preparar el certificado.', '']
            : [
                f.obligatorios.length
                    ? 'Para preparar tu certificado todavía nos falta:'
                    : 'Si puedes, envíanos también (le ahorra trabajo al técnico en la visita):',
                ...f.etiquetas.map(e => `   · ${e}`),
                '',
                `Puedes subirlo aquí cuando quieras: ${url}`,
                '',
            ];
        const texto = [
            saludo, '',
            `Hemos recibido la aceptación de tu presupuesto *${oferta.numero}*. Tu expediente es el *${row.numero_expediente}*.`, '',
            ...bloqueDocs,
            'En los próximos días el técnico certificador se pondrá en contacto contigo para concertar la visita.', '',
            'Gracias por confiar en nosotros.',
            '*BROKERGY* · Ingeniería Energética'
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
    htmlDe, pdfDe, vistaPublica, aceptar, confirmarAlCliente
};
