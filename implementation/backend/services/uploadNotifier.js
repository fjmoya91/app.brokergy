/**
 * uploadNotifier — avisa al staff (grupo de WhatsApp + email) cuando el cliente o
 * el instalador suben documentación desde un enlace público (/subir-docs y /firma),
 * y cuando comunican el FIN DE OBRA.
 *
 * Por qué existe la ventana de agrupación: el enlace de subida manda UNA petición
 * POR FOTO. Un aviso por petición llenaría el grupo (una obra normal son 8-15
 * fotos). Se agrupa por oportunidad con una VENTANA DE SILENCIO: la primera
 * subida arranca el temporizador, cada subida nueva lo reinicia y, al cerrarse,
 * sale UN solo aviso con el resumen de la tanda.
 *
 * El buffer vive en MEMORIA: si el contenedor se reinicia dentro de la ventana,
 * esa tanda se queda sin aviso (los ficheros ya están en Drive y en
 * reforma_uploads; lo único que se pierde es el mensaje). Por eso el fin de obra
 * —que sí es un hito— además se persiste en el expediente.
 */

const supabase = require('./supabaseClient');
const emailService = require('./emailService');
const whatsappService = require('./whatsappService');
const { buildCertClienteData } = require('./certClienteData');

// 30 min de silencio antes de mandar el resumen. Configurable por si en temporada
// alta interesa acortarla.
const VENTANA_MS = Number(process.env.UPLOAD_NOTIFY_WINDOW_MS || 30 * 60 * 1000);

const FRONTEND = () => process.env.FRONTEND_URL || 'https://app.brokergy.es';
const adminPhone = () => process.env.WHATSAPP_ADMIN_CHAT || '34623926179';
const adminEmail = () => process.env.ADMIN_EMAIL || 'franciscojavier.moya.s2e2@gmail.com';

// oportunidadUuid → { timer, desde, quien:Set<string>, slots:Map<key,{label,fase,n}> }
const pendientes = new Map();

const QUIEN_TXT = { cliente: 'el CLIENTE', instalador: 'el INSTALADOR', admin: 'BROKERGY' };

/** 'instalador' → "el INSTALADOR (INSTOTERMA SL)"; el resto, su etiqueta. */
const quienTexto = (ctx) => (q) => (
    q === 'instalador' && ctx?.instaladorNombre
        ? `el INSTALADOR (${ctx.instaladorNombre})`
        : (QUIEN_TXT[q] || q)
);

/**
 * Apunta una subida en el buffer y (re)arranca la ventana de silencio.
 * Es SÍNCRONA y no lanza: se puede llamar en la ruta sin envolver en try.
 *
 * @param {string} oportunidadUuid  uuid de `oportunidades.id`
 * @param {string} slotKey          clave del slot (o etiqueta si no hay slots)
 * @param {string} slotLabel        nombre legible para el resumen
 * @param {string} fase             'ANTES' | 'DESPUES' | null
 * @param {string} subidoPor        'cliente' | 'instalador' | 'admin'
 * @param {number} cantidad         nº de ficheros de esta llamada
 */
function registrarSubida({ oportunidadUuid, slotKey, slotLabel, fase = null, subidoPor = 'cliente', cantidad = 1 }) {
    try {
        if (!oportunidadUuid) return;
        // Si lo sube el propio staff desde la app no hay nada que notificar: el
        // aviso existe para enterarnos de lo que llega de FUERA.
        if (subidoPor === 'admin') return;

        let bucket = pendientes.get(oportunidadUuid);
        if (!bucket) {
            bucket = { timer: null, desde: Date.now(), quien: new Set(), slots: new Map() };
            pendientes.set(oportunidadUuid, bucket);
        }
        bucket.quien.add(subidoPor);

        const key = slotKey || slotLabel || 'DOCUMENTO';
        const prev = bucket.slots.get(key);
        if (prev) prev.n += cantidad;
        else bucket.slots.set(key, { label: slotLabel || key, fase, n: cantidad });

        if (bucket.timer) clearTimeout(bucket.timer);
        bucket.timer = setTimeout(() => { vaciar(oportunidadUuid); }, VENTANA_MS);
        // No mantener vivo el proceso solo por este temporizador.
        if (typeof bucket.timer.unref === 'function') bucket.timer.unref();
    } catch (e) {
        console.warn('[UploadNotify] registrarSubida:', e.message);
    }
}

/** Cierra la ventana de una oportunidad y manda el resumen. Background-safe. */
async function vaciar(oportunidadUuid) {
    const bucket = pendientes.get(oportunidadUuid);
    if (!bucket) return;
    pendientes.delete(oportunidadUuid);
    if (bucket.timer) clearTimeout(bucket.timer);

    try {
        const ctx = await cargarContexto(oportunidadUuid);
        if (!ctx) return;

        const total = [...bucket.slots.values()].reduce((a, s) => a + s.n, 0);
        const minutos = Math.max(1, Math.round((Date.now() - bucket.desde) / 60000));
        const detalle = [...bucket.slots.values()]
            .map(s => `• ${s.label}${s.n > 1 ? ` (${s.n})` : ''}${s.fase === 'DESPUES' ? ' — DESPUÉS' : ''}`)
            .join('\n');

        // El nombre de la empresa va pegado a "el INSTALADOR", no al final de la
        // lista: si suben los dos, "el INSTALADOR y el CLIENTE (INSTOTERMA)" haría
        // pensar que la empresa es el cliente.
        const titular = [...bucket.quien].map(quienTexto(ctx)).join(' y ');

        const msg =
`📸 *DOCUMENTACIÓN RECIBIDA*

Expediente: *${ctx.numExp}*
👤 Cliente: ${ctx.clienteNombre}
📍 ${ctx.direccion || 'Dirección sin informar'}
✍️ Ha subido: ${titular}

🗂 *${total} archivo${total === 1 ? '' : 's'}* en los últimos ${minutos} min:
${detalle}

🔗 Ver expediente:
${ctx.expedienteLink}${ctx.driveLink ? `\n📂 Carpeta de Drive:\n${ctx.driveLink}` : ''}`;

        try {
            await whatsappService.sendText(adminPhone(), msg);
        } catch (e) { console.warn('[UploadNotify] WhatsApp admin:', e.message); }

        try {
            await emailService.sendMail({
                to: adminEmail(),
                // Buzón SECUNDARIO: los avisos internos no gastan la cuota del
                // buzón con el que se escribe a clientes e instaladores.
                from: process.env.ALERT_EMAIL_FROM || emailService.getFallbackSender() || undefined,
                subject: `📸 Documentación recibida — ${ctx.numExp} (${total} archivo${total === 1 ? '' : 's'})`,
                html: shellHtml('Documentación recibida', `
                    <p>${escapar(titular)} ha subido <strong>${total} archivo${total === 1 ? '' : 's'}</strong> del expediente <strong>${escapar(ctx.numExp)}</strong>.</p>
                    <p style="margin:0"><strong>Cliente:</strong> ${escapar(ctx.clienteNombre)}<br/>
                       <strong>Dirección:</strong> ${escapar(ctx.direccion || '—')}</p>
                    <ul>${[...bucket.slots.values()].map(s => `<li>${escapar(s.label)}${s.n > 1 ? ` (${s.n})` : ''}${s.fase === 'DESPUES' ? ' — <em>después de la obra</em>' : ''}</li>`).join('')}</ul>
                    <p style="margin:24px 0">
                      <a href="${ctx.expedienteLink}" style="background:#FF6D00;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:bold">Abrir el expediente</a>
                    </p>
                    ${ctx.driveLink ? `<p><a href="${ctx.driveLink}" style="color:#f59e0b;font-weight:bold">Carpeta de Drive</a></p>` : ''}`),
                text: msg,
            });
        } catch (e) { console.warn('[UploadNotify] Email admin:', e.message); }

        console.log(`[UploadNotify] Resumen enviado — ${ctx.numExp}: ${total} archivo(s).`);
    } catch (e) {
        console.error('[UploadNotify] vaciar:', e.message);
    }
}

/**
 * Aviso inmediato de FIN DE OBRA comunicado desde el enlace público.
 * Antes vacía lo que hubiera pendiente, para que el aviso de las fotos no llegue
 * DESPUÉS del "he terminado" y descoloque la lectura del hilo.
 */
async function notificarFinObra({ oportunidadUuid, quien = 'cliente', comentario = '' }) {
    try {
        await vaciar(oportunidadUuid);
        const ctx = await cargarContexto(oportunidadUuid);
        if (!ctx) return { ok: false, reason: 'contexto-no-encontrado' };

        // Se persiste en el expediente (escritura ATÓMICA por campo) para que el
        // hito no dependa de que alguien lea el WhatsApp.
        try {
            const { error } = await supabase.rpc('set_expediente_doc_field', {
                p_oportunidad_id: oportunidadUuid,
                p_field: 'fecha_fin_obra_comunicada',
                p_value: new Date().toISOString(),
            });
            if (error) console.warn('[UploadNotify] persistir fin de obra:', error.message);
        } catch (e) { console.warn('[UploadNotify] persistir fin de obra:', e.message); }

        const titular = quienTexto(ctx)(quien);

        const msg =
`🏁 *FIN DE OBRA COMUNICADO*

Expediente: *${ctx.numExp}*
👤 Cliente: ${ctx.clienteNombre}
📍 ${ctx.direccion || 'Dirección sin informar'}
✍️ Lo comunica: ${titular}${comentario ? `\n💬 "${comentario}"` : ''}

Toca revisar fotos y factura y lanzar el *CEE FINAL*.

🔗 Ver expediente:
${ctx.expedienteLink}`;

        try {
            await whatsappService.sendText(adminPhone(), msg);
        } catch (e) { console.warn('[UploadNotify] WhatsApp fin obra:', e.message); }

        try {
            await emailService.sendMail({
                to: adminEmail(),
                from: process.env.ALERT_EMAIL_FROM || emailService.getFallbackSender() || undefined,
                subject: `🏁 Fin de obra comunicado — ${ctx.numExp}`,
                html: shellHtml('Fin de obra comunicado', `
                    <p>${escapar(titular)} ha comunicado que la obra del expediente <strong>${escapar(ctx.numExp)}</strong> está <strong>terminada</strong>.</p>
                    <p style="margin:0"><strong>Cliente:</strong> ${escapar(ctx.clienteNombre)}<br/>
                       <strong>Dirección:</strong> ${escapar(ctx.direccion || '—')}</p>
                    ${comentario ? `<p style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:12px">💬 ${escapar(comentario)}</p>` : ''}
                    <p>Siguiente paso: revisar fotos y factura y lanzar el <strong>CEE final</strong>.</p>
                    <p style="margin:24px 0">
                      <a href="${ctx.expedienteLink}" style="background:#FF6D00;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:bold">Abrir el expediente</a>
                    </p>`),
                text: msg,
            });
        } catch (e) { console.warn('[UploadNotify] Email fin obra:', e.message); }

        console.log(`[UploadNotify] Fin de obra comunicado — ${ctx.numExp}.`);
        return { ok: true };
    } catch (e) {
        console.error('[UploadNotify] notificarFinObra:', e.message);
        return { ok: false, reason: e.message };
    }
}

/**
 * Ficha mínima para el aviso: nº de expediente, cliente, dirección de la
 * INSTALACIÓN (que no es el domicilio del cliente) y enlaces.
 * Solo lee las claves del JSONB que necesita — nunca `datos_calculo` entero.
 */
async function cargarContexto(oportunidadUuid) {
    const { data: op, error } = await supabase
        .from('oportunidades')
        .select('id, id_oportunidad, referencia_cliente, cliente_id, instalador_asociado_id, prescriptor_id, ref_catastral, inputs:datos_calculo->inputs, driveLink:datos_calculo->>drive_folder_link')
        .eq('id', oportunidadUuid)
        .maybeSingle();
    if (error || !op) {
        console.warn('[UploadNotify] oportunidad no encontrada:', oportunidadUuid, error?.message || '');
        return null;
    }

    const { data: exp } = await supabase
        .from('expedientes')
        .select('id, numero_expediente, instalacion')
        .eq('oportunidad_id', oportunidadUuid)
        .maybeSingle();

    let cli = null;
    if (op.cliente_id) {
        const { data } = await supabase
            .from('clientes')
            .select('nombre_razon_social, apellidos, dni, tlf, email, direccion, codigo_postal, municipio, provincia')
            .eq('id_cliente', op.cliente_id)
            .maybeSingle();
        cli = data || null;
    }

    let instaladorNombre = null;
    const insId = op.instalador_asociado_id || op.prescriptor_id;
    if (insId && String(insId) !== '1') {
        const { data: p } = await supabase.from('prescriptores')
            .select('razon_social, acronimo').eq('id_empresa', insId).maybeSingle();
        instaladorNombre = p?.razon_social || p?.acronimo || null;
    }

    // buildCertClienteData espera la oportunidad con `datos_calculo.inputs`.
    const opForAddr = { ...op, datos_calculo: { inputs: op.inputs || {} } };
    const { data: ficha } = buildCertClienteData(exp, opForAddr, cli);

    const numExp = exp?.numero_expediente || op.id_oportunidad;
    // La provincia puede venir como código INE ("13") y joinAddress la pega al
    // final: "…TOMELLOSO (CIUDAD REAL), (13)". Se recorta para el aviso.
    const direccion = (ficha.direccionInstalacion || ficha.direccion || '')
        .replace(/,?\s*\(\d+\)\s*$/, '')
        .trim() || null;

    return {
        numExp,
        clienteNombre: ficha.nombre || op.referencia_cliente || 'Sin nombre',
        direccion,
        instaladorNombre,
        driveLink: op.driveLink || null,
        expedienteLink: `${FRONTEND()}/?exp=${encodeURIComponent(numExp || '')}`,
    };
}

const escapar = (s) => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

const shellHtml = (titulo, cuerpo) => `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
    <div style="background:linear-gradient(135deg,#f59e0b,#ea580c);padding:20px 28px;">
      <h2 style="margin:0;color:#fff;font-size:16px;">BROKERGY · ${titulo}</h2>
    </div>
    <div style="padding:24px;background:#fff;color:#222;">${cuerpo}</div>
  </div>`;

module.exports = {
    registrarSubida,
    notificarFinObra,
    vaciar,
    VENTANA_MS,
};
