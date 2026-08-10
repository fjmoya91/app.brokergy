// ─── seguimientoLote — un mensaje, varios expedientes ─────────────────────────
//
// Prepara y envía el recordatorio agrupado por destinatario que propone
// `seguimientoRadar.agruparPorDestinatario`.
//
// LA DIFERENCIA CON EL ENVÍO DE UNO EN UNO no es solo de comodidad. Cuatro mensajes
// idénticos con un número de expediente distinto cada uno son ruido para quien los
// recibe, invitan a que conteste solo al último y dejan cuatro hilos abiertos donde
// debería haber uno.
//
// POR ESO NO SE PUEDE DELEGAR EN `notify-certificador`: esa ruta manda UN mensaje por
// llamada, así que N llamadas serían N mensajes — justo lo que se quiere evitar. Aquí
// el mensaje sale UNA vez y luego se sella expediente por expediente, para que cada
// uno conserve su rastro en el historial y su marca de anti-insistencia.
//
// Los TEXTOS siguen siendo fuente única (`recordatorios.js`), igual que en el envío
// individual.

const supabase = require('./supabaseClient');
const emailService = require('./emailService');
const whatsappService = require('./whatsappService');
const recordatorios = require('./recordatorios');
const { markCertContact } = require('./seguimientoTracking');

const FRONTEND = () => process.env.FRONTEND_URL || 'https://app.brokergy.es';

// Cómo se comporta cada tipo de acción en modo lote.
const TIPOS_LOTE = {
    'cert-registro': {
        destinatario: 'CERTIFICADOR', asunto: (n) => `${n} certificados pendientes de registrar en Industria`,
        plantilla: recordatorios.certRegistroLoteWa, fase: true,
    },
    'cert-emision': {
        destinatario: 'CERTIFICADOR', asunto: (n) => `${n} certificados pendientes de entrega`,
        plantilla: recordatorios.certEmisionLoteWa, fase: true,
    },
    'fin-obra': {
        destinatario: 'INSTALADOR', asunto: (n) => `¿Cómo van tus ${n} obras pendientes?`,
        plantilla: recordatorios.finObraLoteWa,
    },
    'recordar-firma': {
        destinatario: 'AMBOS', asunto: (n) => `Documentación pendiente de firma en ${n} expedientes`,
        plantilla: recordatorios.firmaLoteWa,
    },
};

/** El enlace que hay que darle a esta persona para ESTE expediente. */
function urlDe(tipo, fila) {
    const base = FRONTEND();
    if (tipo === 'cert-registro') {
        try {
            const ceeUploadService = require('./ceeUploadService');
            const phase = fila.scope === 'final' ? 'final' : 'inicial';
            const tok = ceeUploadService.ceeUploadSignature(fila.expediente_id, phase);
            return { url: `${base}/subir-cee/${fila.expediente_id}?token=${tok}&phase=${phase}`, urlLabel: '📤' };
        } catch { return {}; }
    }
    if (tipo === 'recordar-firma') {
        const ruta = fila.scope === 'INSTALADOR' ? 'subir-cifo' : 'firmar-anexos';
        return { url: `${base}/${ruta}/${fila.expediente_id}`, urlLabel: '✍️' };
    }
    // fin-obra: el enlace de subida se resuelve aparte (lleva token de la oportunidad).
    return {};
}

/**
 * Compone el borrador del mensaje de un grupo.
 * @param {object} grupo  el que devuelve `agruparPorDestinatario`
 * @returns {Promise<{mensaje, asunto, destinatario, items, error?}>}
 */
async function prepararLote(grupo) {
    const def = TIPOS_LOTE[grupo.tipo];
    if (!def) return { error: 'Tipo de acción no soportado en bloque.' };

    // El enlace de subida de fotos vive en la oportunidad y lleva su propio token.
    const enlacesSubida = new Map();
    if (grupo.tipo === 'fin-obra') {
        const reformaUploadService = require('./reformaUploadService');
        const { data: exps } = await supabase.from('expedientes')
            .select('id, oportunidad_id').in('id', grupo.filas.map(f => f.expediente_id));
        for (const e of exps || []) {
            if (!e.oportunidad_id) continue;
            try { enlacesSubida.set(e.id, await reformaUploadService.ensureUploadLink(e.oportunidad_id)); }
            catch (err) { console.warn('[Lote] ensureUploadLink:', err.message); }
        }
    }

    const items = grupo.filas.map(f => {
        const link = grupo.tipo === 'fin-obra'
            ? (enlacesSubida.has(f.expediente_id) ? { url: enlacesSubida.get(f.expediente_id), urlLabel: '📸' } : {})
            : urlDe(grupo.tipo, f);
        return {
            expediente_id: f.expediente_id,
            numExp: f.numero_expediente,
            cliente: f.cliente_nombre,
            detalle: f.detalle,
            dias: f.dias,
            scope: f.scope,
            ...link,
        };
    });

    const contacto = await resolverContacto(def.destinatario === 'AMBOS'
        ? grupo.destinatario.tipo : def.destinatario, grupo.destinatario.id);
    if (!contacto.tlf && !contacto.email) {
        return { error: `No hay teléfono ni email de ${grupo.destinatario.nombre || 'este destinatario'}. Complétalo en su ficha.` };
    }

    const mensaje = def.plantilla({
        certName: grupo.destinatario.nombre || contacto.nombre || 'Técnico',
        destinatario: contacto.nombre || grupo.destinatario.nombre,
        esInstalador: grupo.destinatario.tipo === 'INSTALADOR',
        items,
    });

    return { mensaje, asunto: def.asunto(items.length), destinatario: contacto, items };
}

/** Teléfono y email del destinatario, respetando la persona de notificaciones. */
async function resolverContacto(tipo, id) {
    if (tipo === 'CLIENTE') {
        const { data: c } = await supabase.from('clientes')
            .select('nombre_razon_social, apellidos, tlf, email, persona_contacto_nombre, persona_contacto_tlf, persona_contacto_email, notificaciones_contacto_activas')
            .eq('id_cliente', id).maybeSingle();
        const notif = c?.notificaciones_contacto_activas === true || c?.notificaciones_contacto_activas === 'true';
        const nom = c ? `${c.nombre_razon_social || ''} ${c.apellidos || ''}`.trim() : null;
        return {
            nombre: (notif ? (c?.persona_contacto_nombre || nom) : nom) || null,
            tlf: (notif ? (c?.persona_contacto_tlf || c?.tlf) : (c?.tlf || c?.persona_contacto_tlf)) || null,
            email: (notif ? (c?.persona_contacto_email || c?.email) : (c?.email || c?.persona_contacto_email)) || null,
        };
    }
    // CERTIFICADOR / INSTALADOR — ambos viven en `prescriptores`.
    const { data: p } = await supabase.from('prescriptores')
        .select('razon_social, acronimo, tlf, tlf_contacto, landing_telefono_contacto, email, email_contacto, nombre_contacto, contacto_notificaciones_activas')
        .eq('id_empresa', id).maybeSingle();
    const useContact = p?.contacto_notificaciones_activas === true || p?.contacto_notificaciones_activas === 'true';
    return {
        nombre: (useContact ? (p?.nombre_contacto || p?.razon_social) : (p?.razon_social || p?.acronimo)) || null,
        tlf: (useContact ? (p?.tlf_contacto || p?.tlf) : (p?.tlf || p?.tlf_contacto || p?.landing_telefono_contacto)) || null,
        email: (useContact ? (p?.email_contacto || p?.email) : (p?.email || p?.email_contacto)) || null,
    };
}

/**
 * Envía el lote: UN mensaje, y después una marca por expediente.
 *
 * El sellado NO es opcional ni cosmético: es lo que hace que el expediente recuerde
 * que se reclamó (historial) y que el parte no lo vuelva a ofrecer mañana
 * (`documentacion.recordatorios`). Si fallara, el mensaje ya ha salido; por eso se
 * sella después del envío y los errores se registran sin tumbar la operación.
 *
 * @param {object} grupo
 * @param {{canales:string[], mensaje:string, asunto?:string, usuario?:string, expedientes?:string[]}} opts
 */
async function enviarLote(grupo, { canales = [], mensaje, asunto, usuario = 'PARTE DE SEGUIMIENTO', expedientes = null }) {
    const def = TIPOS_LOTE[grupo.tipo];
    if (!def) throw new Error('Tipo de acción no soportado en bloque.');
    if (!canales.length) throw new Error('Selecciona al menos un canal.');
    if (!mensaje?.trim()) throw new Error('El mensaje no puede estar vacío.');

    // Se puede enviar a un subconjunto: en la app se pueden desmarcar expedientes
    // concretos del grupo.
    const filas = expedientes?.length
        ? grupo.filas.filter(f => expedientes.includes(f.expediente_id))
        : grupo.filas;
    if (!filas.length) throw new Error('No has seleccionado ningún expediente.');

    const contacto = await resolverContacto(
        def.destinatario === 'AMBOS' ? grupo.destinatario.tipo : def.destinatario, grupo.destinatario.id);

    const enviados = [];
    if (canales.includes('whatsapp')) {
        if (!contacto.tlf) throw new Error('No hay teléfono para el WhatsApp.');
        try {
            const r = await whatsappService.sendText(contacto.tlf, mensaje);
            enviados.push(r?.state === 'READY' ? 'WhatsApp' : 'WhatsApp (encolado)');
        } catch (e) {
            console.warn('[Lote] WhatsApp:', e.message);
            enviados.push('WhatsApp (encolado)');
        }
    }
    if (canales.includes('email')) {
        if (!contacto.email) throw new Error('No hay email para enviar.');
        const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#222;font-size:15px;line-height:24px">${
            mensaje.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                   .replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')
                   .replace(/_([^_\n]+)_/g, '<em>$1</em>')
                   .replace(/\r\n|\r|\n/g, '<br>')
        }</div>`;
        await emailService.sendMail({ to: contacto.email, subject: asunto || def.asunto(filas.length), text: mensaje, html });
        enviados.push('Email');
    }
    if (!enviados.length) throw new Error('No se pudo enviar por ningún canal.');

    // ── Rastro, expediente por expediente ────────────────────────────────────
    // La clave y la fase salen de CADA fila, no del grupo: un mismo mensaje puede
    // reclamar el CEE inicial de una obra y el final de otra, y sellar las dos con la
    // misma fase dejaría la mitad marcada donde no toca.
    const claveDe = (f) => (grupo.tipo === 'fin-obra' ? 'fin-obra' : `${grupo.tipo}:${f.scope || 'inicial'}`);
    const nDest = contacto.nombre || grupo.destinatario.nombre || grupo.destinatario.tipo;
    const at = new Date().toISOString();

    for (const f of filas) {
        try {
            const { data: exp } = await supabase.from('expedientes')
                .select('documentacion, seguimiento').eq('id', f.expediente_id).maybeSingle();
            const doc = exp?.documentacion || {};
            const historial = Array.isArray(doc.historial) ? [...doc.historial] : [];
            historial.push({
                id: `${Date.now()}_lote_${f.expediente_id.slice(0, 6)}`,
                tipo: grupo.destinatario.tipo === 'CERTIFICADOR' ? 'notificacion_certificador' : 'solicitud_docs',
                // Se deja constancia de que fue un envío AGRUPADO y de cuántos iban:
                // si no, leyendo el historial parece un mensaje individual y no se
                // entiende por qué el texto habla de varios expedientes.
                texto: `Recordatorio en bloque (${filas.length} expedientes) enviado a ${nDest} vía ${enviados.join(' + ')} — ${grupo.etiqueta}`,
                target: grupo.destinatario.tipo,
                fecha: at,
                usuario,
            });

            const seguimiento = exp?.seguimiento || {};
            if (grupo.destinatario.tipo === 'CERTIFICADOR') {
                markCertContact(seguimiento, f.scope === 'final' ? 'final' : 'inicial', at);
            }

            await supabase.from('expedientes')
                .update({ documentacion: { ...doc, historial }, seguimiento, updated_at: at })
                .eq('id', f.expediente_id);

            await supabase.rpc('merge_expediente_doc_json', {
                p_expediente_id: f.expediente_id,
                p_field: 'recordatorios',
                p_value: { [claveDe(f)]: { at, target: grupo.destinatario.tipo, canales, origen: 'parte-lote' } },
            });
        } catch (e) {
            console.warn(`[Lote] sellar ${f.numero_expediente}:`, e.message);
        }
    }

    return {
        ok: true,
        canales: enviados,
        expedientes: filas.length,
        destinatario: nDest,
        resumen: `Enviado a ${nDest} · ${filas.length} expediente${filas.length === 1 ? '' : 's'} · ${enviados.join(' + ')}`,
    };
}

module.exports = { prepararLote, enviarLote, resolverContacto, TIPOS_LOTE };
