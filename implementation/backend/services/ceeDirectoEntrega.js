// ─── ceeDirectoEntrega.js ────────────────────────────────────────────────────
// Entrega del certificado al cliente, sola, en cuanto se puede.
//
// La condición es DOBLE y las dos mitades llegan en desorden: unas veces se
// cobra y días después el certificador sube el registro; otras el certificado ya
// está registrado y lo que falta es que entre el pago. Por eso NO hay un único
// disparador: la comprobación es la misma función y la llaman los dos sitios
// donde puede cambiar el estado de cosas (marcar cobrado · subir el registro).
// Quien llegue el segundo es el que dispara el envío.
//
//   cobrado ✅  +  justificante de REGISTRO subido ✅  +  PDF firmado subido ✅
//
// Se mandan SOLO dos ficheros: el PDF del CEE firmado y el justificante de
// registro. El `.xml` y el `.cex` son ficheros de trabajo del certificador —el
// cliente no puede abrirlos— y la etiqueta ya va dentro del propio certificado;
// mandarlo todo hace que no sepa cuál de los cinco es "su papel".

const supabase = require('./supabaseClient');
const emailService = require('./emailService');
const whatsappService = require('./whatsappService');
const uploads = require('./ceeDirectoUploadService');
const svc = require('./ceeDirectoService');
const estados = require('../utils/ceeDirectoEstados');

// Los que se entregan, en este orden (el certificado primero: es lo que el
// cliente ha comprado; el registro es la prueba de que está presentado). La
// ETIQUETA va también, en todas las entregas (decisión del usuario, 2026-10-07):
// aunque esté dentro del certificado, es el papel que se cuelga y el que piden
// en una compraventa o un alquiler.
const SLOTS_ENTREGA = ['pdf', 'registro', 'etiqueta'];

const ETIQUETA_SLOT = { pdf: 'certificado firmado', registro: 'justificante de registro', etiqueta: 'etiqueta energética', guia: 'guía para la deducción en la Renta' };

// La guía de la deducción del IRPF viaja con la entrega cuando los certificados
// la acreditan (ver `guiaIrpfService.guiaDeEntrega`). Lazy: ese servicio arrastra
// pdfService y la lógica ESM del frontend, y aquí solo hace falta al entregar.
const guiaIrpf = () => require('./guiaIrpfService');

/**
 * El envío automático se puede apagar. En LOCAL hay que apagarlo:
 * `CEE_ENTREGA_AUTO=false` en el .env — si no, marcar un expediente como cobrado
 * mientras se prueba manda un WhatsApp y un email REALES al cliente de verdad.
 * El botón manual de la ficha sigue funcionando con la variable apagada: ahí hay
 * una persona decidiendo, que es justo lo que falta en el automático.
 */
const autoActivado = () => String(process.env.CEE_ENTREGA_AUTO ?? 'true').toLowerCase() !== 'false';

const nombreCliente = (cli) => cli
    ? `${cli.nombre_razon_social || ''} ${cli.apellidos || ''}`.trim()
    : '';

/**
 * ¿Se le puede entregar ya? Devuelve lo que falta, sin enviar nada.
 * Es lo que pinta la ficha y lo que consulta el automático: una sola definición
 * de "listo para entregar", para que la pantalla no pueda decir que sí mientras
 * el backend dice que no.
 *
 * @returns {{puede:boolean, faltan:string[], yaEntregado:object|null, destinatario:object, ficheros:object}}
 */
async function estado(row, fase) {
    const ph = uploads.normalizePhase(fase);
    const key = ph === 'final' ? 'cee_final' : 'cee_inicial';
    const cli = row.cliente || null;

    const sello = row.documentacion?.entrega_cliente?.[ph] || null;

    const enDrive = row.drive_folder_id ? await uploads.scanSection(row, ph) : {};

    const faltan = [];
    if (!row.cobrado) faltan.push('Marcar el expediente como cobrado');
    if (row.seguimiento?.[key] !== 'REGISTRADO') faltan.push('Que el CEE esté registrado');
    if (!enDrive.pdf) faltan.push('Subir el PDF del CEE firmado');
    if (!enDrive.registro) faltan.push('Subir el justificante de registro');
    if (!enDrive.etiqueta) faltan.push('Subir la etiqueta energética');

    // Mismo destinatario que el resto de avisos al cliente: con el desvío
    // activo, su persona de contacto (como en el CAE).
    const contacto = svc.contactoCliente(cli);
    const email = contacto.email;
    const tlf = contacto.tlf;
    if (!email && !tlf) faltan.push('El cliente no tiene ni email ni teléfono en su ficha');

    // La guía NO es un requisito: si no va, el certificado se entrega igual.
    const guia = guiaIrpf().guiaDeEntregaPublica(await guiaIrpf().guiaDeEntrega(row, ph));

    return {
        puede: faltan.length === 0,
        faltan,
        yaEntregado: sello,
        destinatario: { nombre: contacto.nombre || nombreCliente(cli), email, tlf },
        ficheros: {
            pdf: enDrive.pdf ? enDrive.pdf.name : null,
            registro: enDrive.registro ? enDrive.registro.name : null,
            etiqueta: enDrive.etiqueta ? enDrive.etiqueta.name : null,
            guia: guia?.va ? guia.fichero : null
        },
        guia,
        // Lo que va antes de la entrega: el aviso de «registrado» (con o sin factura).
        registrado: row.seguimiento?.[key] === 'REGISTRADO',
        cobrado: !!row.cobrado,
        avisoRegistrado: row.documentacion?.aviso_registrado?.[ph] || null
    };
}

/**
 * Texto del mensaje. Sale de aquí y no de cada ruta: es el mismo por los dos canales.
 * Con `textoGuia` (el párrafo de `guiaIrpf.textoGuiaEnEntrega`) anuncia la guía
 * de la Renta que va adjunta.
 */
function mensaje(row, fase, { textoGuia = '' } = {}) {
    const ph = uploads.normalizePhase(fase);
    const faseLabel = estados.nombreFase(row, ph);
    // En un encargo DOBLE, con el inicial se le recuerda el paso siguiente: el
    // final se emite cuando la obra está hecha y facturada.
    const siguiente = estados.esDoble(row) && ph === 'inicial'
        ? `Cuando tengas la *factura definitiva de la instalación*, avísanos y emitimos el *certificado energético final*.\n\n`
        : '';
    // Se saluda a quien RECIBE el mensaje (con el desvío activo, su persona de
    // contacto) y en minúsculas: la ficha guarda el nombre en MAYÚSCULAS y
    // "¡Hola LAURA!" delata la plantilla.
    const nombre = svc.contactoCliente(row.cliente).nombre || nombreCliente(row.cliente);
    const p = nombre ? nombre.split(/\s+/)[0] : '';
    const pila = p ? ` ${p.charAt(0).toUpperCase()}${p.slice(1).toLowerCase()}` : '';
    return `¡Hola${pila}!\n\n`
        + `Ya tienes tu *${faseLabel}* registrado (expediente ${row.numero_expediente}).\n\n`
        + `Te adjuntamos el certificado firmado, el justificante de registro y la etiqueta energética. `
        + `Guárdalos: son los documentos que te van a pedir.\n\n`
        + siguiente
        + (textoGuia ? `${textoGuia}\n\n` : '')
        + `¡Gracias por confiar en nosotros!\n*BROKERGY · Ingeniería Energética*`;
}

/**
 * Entrega el certificado al cliente por email y WhatsApp.
 *
 * @param {string} id
 * @param {'inicial'|'final'} fase
 * @param {object} opts
 * @param {boolean} [opts.manual=false]  lo ha pulsado una persona (salta el interruptor
 *                                       del automático, no las condiciones).
 * @param {boolean} [opts.reenviar=false] permite repetir una entrega ya hecha.
 * @param {string}  [opts.usuario]
 * @returns {Promise<{enviado:boolean, motivo?:string, faltan?:string[], canales?:string[]}>}
 */
async function entregar(id, fase, opts = {}) {
    const ph = uploads.normalizePhase(fase);
    const row = await svc.cargar(id);
    if (!row) return { enviado: false, motivo: 'NO_EXISTE' };

    const st = await estado(row, ph);

    // Idempotencia. La comprobación va ANTES que ninguna otra cosa porque los dos
    // disparadores pueden coincidir (marcar cobrado y subir el registro en el
    // mismo minuto) y el cliente recibiría el certificado dos veces.
    if (st.yaEntregado && !opts.reenviar) {
        return { enviado: false, motivo: 'YA_ENTREGADO', entregadoAt: st.yaEntregado.at };
    }
    if (!st.puede) return { enviado: false, motivo: 'FALTAN_REQUISITOS', faltan: st.faltan };

    if (!opts.manual && !autoActivado()) {
        console.log(`[cee-entrega] SIMULADO (CEE_ENTREGA_AUTO=false) → ${row.numero_expediente} `
            + `a ${st.destinatario.email || '—'} / ${st.destinatario.tlf || '—'} `
            + `con ${st.ficheros.pdf} + ${st.ficheros.registro}${st.ficheros.guia ? ` + ${st.ficheros.guia}` : ''}`);
        return { enviado: false, motivo: 'AUTO_DESACTIVADO', simulado: st };
    }

    const adjuntos = await uploads.getSlotAttachments(row, ph, SLOTS_ENTREGA);
    // Cinturón: `estado()` los vio en Drive, pero entre la comprobación y la
    // descarga alguien puede haberlos movido. Mandar un email de entrega SIN el
    // certificado deja al cliente esperando algo que ya se dio por enviado.
    if (adjuntos.length < SLOTS_ENTREGA.length) {
        return { enviado: false, motivo: 'ADJUNTOS_NO_DESCARGABLES', faltan: ['No se han podido descargar los ficheros de Drive'] };
    }

    const canales = [];
    const errores = [];

    // La guía de la Renta, si esta fase es la de "después" y los certificados la
    // acreditan. Si no se puede preparar, el certificado sale igual y SIN el
    // párrafo que la anuncia: un mensaje que promete un adjunto que no llega
    // deja al cliente buscándolo.
    let guia = null;
    let bufferGuia = null;
    const g = await guiaIrpf().guiaDeEntrega(row, ph);
    if (g.va) {
        try {
            const { buffer, filename } = await guiaIrpf().pdfGuiaDeEntrega(g);
            adjuntos.push({ slot: 'guia', filename: filename.replace(' – ', ' - '), content: buffer, contentType: 'application/pdf' });
            guia = g;
            bufferGuia = buffer;
        } catch (e) {
            console.warn(`[cee-entrega] ${row.numero_expediente}: la guía del IRPF no se pudo preparar:`, e.message);
            errores.push(`guía de la Renta: ${e.message}`);
        }
    }

    const cuerpo = opts.mensaje?.trim() || mensaje(row, ph, { textoGuia: guia?.texto });
    const faseLabel = estados.nombreFase(row, ph);
    // Por defecto los dos canales; el popup de reenvío puede pedir solo uno.
    const usar = Array.isArray(opts.channels) && opts.channels.length ? opts.channels : ['email', 'whatsapp'];

    if (st.destinatario.email && usar.includes('email')) {
        try {
            await emailService.sendMail({
                to: st.destinatario.email,
                subject: `${row.numero_expediente} — Tu ${faseLabel}`,
                text: cuerpo.replace(/\*/g, ''),
                html: `<pre style="font-family:inherit;white-space:pre-wrap">${cuerpo.replace(/\*/g, '')}</pre>`,
                attachments: adjuntos.map(a => ({ filename: a.filename, content: a.content, contentType: a.contentType }))
            });
            canales.push('email');
        } catch (e) { errores.push(`email: ${e.message}`); }
    }

    if (st.destinatario.tlf && usar.includes('whatsapp')) {
        try {
            // El texto va PRIMERO y aparte; luego cada PDF con una etiqueta corta.
            // Un mensaje largo como caption de un adjunto hace que mucha gente no
            // llegue a abrir el fichero (mismo criterio que `splitCaption`).
            await whatsappService.sendText(st.destinatario.tlf, cuerpo);
            for (const a of adjuntos) {
                await whatsappService.sendMedia(
                    st.destinatario.tlf,
                    { base64: a.content.toString('base64'), filename: a.filename, mimetype: 'application/pdf' },
                    { caption: ETIQUETA_SLOT[a.slot] || a.filename, splitCaption: false }
                );
            }
            canales.push('whatsapp');
        } catch (e) { errores.push(`whatsapp: ${e.message}`); }
    }

    if (!canales.length) {
        return { enviado: false, motivo: 'ENVIO_FALLIDO', errores };
    }

    // Sello por FASE, no por expediente: en un encargo doble se entrega el inicial
    // y meses después el final, y un sello único daría el segundo por hecho.
    // Va por la RPC de MERGE para no pisar lo que haya escrito la otra fase.
    await svc.mergeDoc(row.id, 'entrega_cliente', {
        [ph]: {
            at: new Date().toISOString(),
            canales,
            ficheros: adjuntos.map(a => a.filename),
            destinatario: { email: st.destinatario.email, tlf: st.destinatario.tlf },
            automatica: !opts.manual,
            usuario: opts.usuario || null,
            ...(errores.length ? { errores } : {})
        }
    });

    await svc.anotarHistorial(row.id, {
        tipo: 'CLIENTE',
        texto: `${faseLabel.toUpperCase()} ENTREGADO AL CLIENTE POR ${canales.join(' Y ').toUpperCase()}`
            + `${guia ? ` + GUÍA DE LA DEDUCCIÓN DEL IRPF (${guia.modalidad} %${guia.ejemplo ? ', CON EJEMPLO' : ''})` : ''}`
            + `${opts.manual ? '' : ' (AUTOMÁTICO)'}`,
        usuario: opts.usuario || null
    });

    // La guía que ha recibido queda en Drive (la sirve el portal) y sellada como
    // enviada, igual que si se hubiera mandado con su botón.
    if (guia) {
        try {
            await guiaIrpf().sellarGuiaEntregada(guia, bufferGuia, {
                canales,
                destinatario: st.destinatario,
                ficheros: adjuntos.map(a => a.filename),
                usuario: opts.usuario || null,
                automatica: !opts.manual
            });
        } catch (e) { console.warn('[cee-entrega] no se pudo sellar la guía:', e.message); }
    }

    console.log(`[cee-entrega] ${row.numero_expediente} entregado por ${canales.join('+')}${guia ? ' (con la guía del IRPF)' : ''}`);
    return { enviado: true, canales, errores, ficheros: adjuntos.map(a => a.filename), guia: !!guia };
}

/**
 * Disparo automático. Se llama en `setImmediate` desde los dos sitios que pueden
 * completar la condición, y NUNCA bloquea ni hace fallar la petición que lo
 * disparó: marcar cobrado tiene que seguir funcionando aunque el email caiga.
 */
function intentarEntregaAsync(id, fase, contexto = '') {
    setImmediate(async () => {
        try {
            const r = await entregar(id, fase, { manual: false });
            if (r.enviado) console.log(`[cee-entrega] disparo automático (${contexto}) OK`);
            else if (r.motivo !== 'FALTAN_REQUISITOS' && r.motivo !== 'YA_ENTREGADO') {
                console.log(`[cee-entrega] disparo automático (${contexto}): ${r.motivo}`);
            }
        } catch (e) {
            console.error('[cee-entrega] disparo automático falló:', e.message);
        }
    });
}

/**
 * Aviso al cliente de que su certificado ya está REGISTRADO — el gemelo del
 * "CEE registrado" del CAE, con texto de CEE suelto (recordatorios.js).
 *
 * No duplica la ENTREGA: si ya está cobrado, la entrega sale sola con los dos
 * PDF y un segundo mensaje contándole lo mismo sobra — ahí no se manda nada.
 * Una vez por fase (`documentacion.aviso_registrado[fase]`), salvo que una
 * persona lo repita a mano. El automático respeta `CEE_ENTREGA_AUTO`.
 *
 * @returns {Promise<{enviado:boolean, motivo?:string, canales?:string[]}>}
 */
const facturas = () => require('./ceeFacturaService');

const textoAviso = (row, ph, contacto, factura) => require('./recordatorios').ceeDirectoRegistradoClienteMsg({
    destinatario: contacto.nombre, numExp: row.numero_expediente,
    fase: svc.faseCliente(row, ph), cobrado: !!row.cobrado,
    tercero: contacto.tercero, obra: contacto.tercero ? svc.obraDe(row) : null,
    factura
});

/**
 * Lo que enseña el popup «Avisar al cliente» antes de mandar nada: a quién (la
 * PERSONA DE CONTACTO si el cliente la tiene), qué factura iría (la ya emitida o
 * la que se emitiría, con su importe) y el texto, con y sin factura.
 */
async function borradorAviso(id, fase) {
    const ph = uploads.normalizePhase(fase);
    const row = await svc.cargar(id);
    if (!row) return null;
    const key = ph === 'final' ? 'cee_final' : 'cee_inicial';
    const contacto = svc.contactoCliente(row.cliente);
    let factura = null;
    try { factura = await facturas().facturaParaAviso(row.id); }
    catch (e) { factura = { modo: 'error', faltan: [e.message] }; }
    const conFactura = factura && factura.modo !== 'error' && !(factura.faltan || []).length;
    return {
        fase: ph,
        faseLabel: estados.nombreFase(row, ph),
        registrado: row.seguimiento?.[key] === 'REGISTRADO',
        cobrado: !!row.cobrado,
        yaAvisado: row.documentacion?.aviso_registrado?.[ph] || null,
        destinatario: { nombre: contacto.nombre || nombreCliente(row.cliente), email: contacto.email || null, tlf: contacto.tlf || null, tercero: !!contacto.tercero },
        factura,
        textos: {
            conFactura: conFactura ? textoAviso(row, ph, contacto, { numero: factura.numero || 'que te adjuntamos', total: factura.total }) : null,
            sinFactura: textoAviso(row, ph, contacto, null)
        }
    };
}

/**
 * Aviso al cliente de que su certificado ya está REGISTRADO — el gemelo del
 * "CEE registrado" del CAE, con texto de CEE suelto (recordatorios.js).
 *
 * Desde el 07/10/2026 lo decide una PERSONA: al subirse el registro te llega el
 * aviso con un enlace a este popup, y ahí se elige si va la FACTURA adjunta
 * (`factura: true`): se emite la de por defecto —o se adjunta la ya emitida— y el
 * mensaje dice que los certificados se envían una vez abonada y pide el
 * justificante de pago. Al marcar cobrado, la entrega sale sola.
 *
 * Con la factura, primero se EMITE: si no se puede, no sale nada (un aviso que
 * promete una factura que no va adjunta deja al cliente buscándola).
 *
 * @returns {Promise<{enviado:boolean, motivo?:string, canales?:string[], factura?:object}>}
 */
async function avisarRegistrado(id, fase, { manual = false, channels = ['whatsapp', 'email'], usuario = null, mensaje: textoLibre = null, factura: conFactura = false } = {}) {
    const ph = uploads.normalizePhase(fase);
    const row = await svc.cargar(id);
    if (!row) return { enviado: false, motivo: 'NO_EXISTE' };
    const clave = ph === 'final' ? 'final' : 'inicial';
    if (!manual && row.documentacion?.aviso_registrado?.[clave]) return { enviado: false, motivo: 'YA_AVISADO' };
    if (!manual && row.cobrado) return { enviado: false, motivo: 'LO_CUBRE_LA_ENTREGA' };
    if (!manual && !autoActivado()) return { enviado: false, motivo: 'AUTO_DESACTIVADO' };

    const contacto = svc.contactoCliente(row.cliente);
    if (!contacto.tlf && !contacto.email) return { enviado: false, motivo: 'SIN_CONTACTO' };

    // La factura, ANTES de mandar nada (puede lanzar: nada sale).
    let fac = null;
    if (conFactura) fac = await facturas().facturaDelAviso(row.id, { usuario });

    const texto = (textoLibre && String(textoLibre).trim()) || textoAviso(row, ph, contacto, fac ? { numero: fac.numero, total: fac.total } : null);
    const canales = [];
    if (channels.includes('whatsapp') && contacto.tlf) {
        try {
            await whatsappService.sendText(contacto.tlf, texto);
            if (fac) {
                await whatsappService.sendMedia(contacto.tlf,
                    { base64: fac.buffer.toString('base64'), filename: fac.filename, mimetype: 'application/pdf' },
                    { caption: `factura ${fac.numero}`, splitCaption: false });
            }
            canales.push('whatsapp');
        }
        catch (e) { console.warn('[cee-directo registrado] WA:', e.message); }
    }
    if (channels.includes('email') && contacto.email) {
        try {
            await emailService.sendMail({
                to: contacto.email,
                subject: `${row.numero_expediente} — Tu certificado energético ya está registrado${fac ? ` · factura ${fac.numero}` : ''}`,
                text: texto.replace(/\*/g, ''),
                html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;color:#222;font-size:15px;line-height:24px">${texto.replace(/\*/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').split('\n').join('<br>')}</div>`,
                ...(fac ? { attachments: [{ filename: fac.filename, content: fac.buffer, contentType: 'application/pdf' }] } : {})
            });
            canales.push('email');
        } catch (e) { console.warn('[cee-directo registrado] email:', e.message); }
    }
    if (!canales.length) return { enviado: false, motivo: 'ENVIO_FALLIDO', ...(fac ? { factura: { numero: fac.numero, emitida: fac.emitida } } : {}) };
    const at = new Date().toISOString();
    await svc.mergeDoc(row.id, 'aviso_registrado', {
        [clave]: { at, canales, to: contacto.email || contacto.tlf, automatico: !manual, ...(fac ? { factura: fac.numero } : {}) }
    });
    if (fac) {
        await facturas().anotarEnvio(row.id, fac.numero, {
            at, canales, email: canales.includes('email') ? contacto.email : null,
            tlf: canales.includes('whatsapp') ? contacto.tlf : null, usuario, con: 'aviso de registrado'
        }).catch(e => console.warn('[cee-directo registrado] envío de la factura:', e.message));
    }
    await svc.anotarHistorial(row.id, {
        tipo: 'CLIENTE',
        texto: `AVISO AL CLIENTE: ${estados.nombreFase(row, ph).toUpperCase()} REGISTRADO, POR ${canales.join(' Y ').toUpperCase()}`
            + `${fac ? ` · CON LA FACTURA ${fac.numero}${fac.emitida ? ' (EMITIDA AHORA)' : ''}` : ''}${manual ? '' : ' (AUTOMÁTICO)'}`,
        usuario
    });
    return { enviado: true, canales, ...(fac ? { factura: { numero: fac.numero, total: fac.total, emitida: fac.emitida } } : {}) };
}

module.exports = {
    avisarRegistrado,
    borradorAviso,
    SLOTS_ENTREGA,
    autoActivado,
    estado,
    mensaje,
    entregar,
    intentarEntregaAsync
};
