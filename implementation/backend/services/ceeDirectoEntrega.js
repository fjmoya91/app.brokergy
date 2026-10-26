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
// Se le entrega a quien PAGA (`destinatarioEntrega`): el partner si la factura
// se emitió a su nombre; si no, el cliente.
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
// Y el recibo de la TASA de registro si quien presenta lo ha subido (procedimiento,
// 2026-10-14): el cliente la ha pagado como suplido en nuestra factura. No es un
// requisito: sin él la entrega sale igual.
const OPCIONALES_ENTREGA = ['tasa'];

const ETIQUETA_SLOT = { pdf: 'certificado firmado', registro: 'justificante de registro', etiqueta: 'etiqueta energética', tasa: 'justificante de la tasa', guia: 'guía para la deducción en la Renta' };

// El procedimiento (enlaces del cliente). Lazy: ese servicio carga el de documentación.
const proceso = () => require('./ceeDirectoProceso');

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
 * A quién se le ENTREGA: a quien PAGA, que es a quien se emitió la factura.
 * Si la última factura del encargo es del PARTNER que lo trae, los certificados
 * van al partner —por el teléfono y el email por los que se le mandó la factura,
 * que son los que ya han funcionado— y no al particular que sale en el
 * certificado. Medido en 2026CEE_54: la factura 26ING_81 se emitió a ATERSOL y la
 * entrega automática le llegó a Vicente, que no había pagado nada.
 * Sin factura, o facturada al cliente: su contacto (con el desvío, la persona de
 * contacto), como el resto de avisos.
 */
function destinatarioEntrega(row) {
    const facs = Object.values(row.documentacion?.facturas_emitidas || {})
        .filter(f => f && typeof f === 'object' && f.estado !== 'RECTIFICADA')
        .sort((a, b) => String(a.emitida_at || '').localeCompare(String(b.emitida_at || '')));
    const ultima = facs[facs.length - 1];
    if (ultima?.destino === 'partner' && row.prescriptor) {
        const p = row.prescriptor;
        const envios = Array.isArray(ultima.envios) ? [...ultima.envios].reverse() : [];
        return {
            nombre: p.razon_social || ultima.cliente?.razon_social || null,
            tlf: envios.find(e => e?.tlf)?.tlf || p.tlf || ultima.cliente?.tlf || null,
            email: envios.find(e => e?.email)?.email || p.email || ultima.cliente?.email || null,
            partner: true,
            factura: ultima.numero || null,
        };
    }
    const c = svc.contactoCliente(row.cliente);
    return { nombre: c.nombre || nombreCliente(row.cliente) || null, tlf: c.tlf || null, email: c.email || null, partner: false };
}

/**
 * ¿Se le puede entregar ya? Devuelve lo que falta, sin enviar nada.
 * Es lo que pinta la ficha y lo que consulta el automático: una sola definición
 * de "listo para entregar", para que la pantalla no pueda decir que sí mientras
 * el backend dice que no.
 *
 * @returns {{puede:boolean, faltan:string[], yaEntregado:object|null, destinatario:object, ficheros:object}}
 */
async function estado(row, fase, { sinCobro = false } = {}) {
    const ph = uploads.normalizePhase(fase);
    const key = ph === 'final' ? 'cee_final' : 'cee_inicial';
    const cli = row.cliente || null;

    const sello = row.documentacion?.entrega_cliente?.[ph] || null;

    const enDrive = row.drive_folder_id ? await uploads.scanSection(row, ph, { conTasa: true }) : {};

    const faltan = [];
    // `sinCobro`: el atajo «Entregar sin esperar al pago» (solo ADMIN, a mano).
    if (!row.cobrado && !sinCobro) faltan.push('Marcar el expediente como cobrado');
    if (row.seguimiento?.[key] !== 'REGISTRADO') faltan.push('Que el CEE esté registrado');
    if (!enDrive.pdf) faltan.push('Subir el PDF del CEE firmado');
    if (!enDrive.registro) faltan.push('Subir el justificante de registro');
    if (!enDrive.etiqueta) faltan.push('Subir la etiqueta energética');

    // A quien PAGA (`destinatarioEntrega`): el partner si la factura es suya; si
    // no, el cliente con su desvío a la persona de contacto (como en el CAE).
    const dest = destinatarioEntrega(row);
    const email = dest.email;
    const tlf = dest.tlf;
    if (!email && !tlf) faltan.push(dest.partner ? 'El partner no tiene ni email ni teléfono en su ficha' : 'El cliente no tiene ni email ni teléfono en su ficha');

    // La guía NO es un requisito: si no va, el certificado se entrega igual.
    const guia = guiaIrpf().guiaDeEntregaPublica(await guiaIrpf().guiaDeEntrega(row, ph));

    return {
        puede: faltan.length === 0,
        faltan,
        yaEntregado: sello,
        destinatario: { nombre: dest.nombre || nombreCliente(cli), email, tlf, partner: dest.partner, factura: dest.factura || null },
        ficheros: {
            pdf: enDrive.pdf ? enDrive.pdf.name : null,
            registro: enDrive.registro ? enDrive.registro.name : null,
            etiqueta: enDrive.etiqueta ? enDrive.etiqueta.name : null,
            tasa: enDrive.tasa ? enDrive.tasa.name : null,
            guia: guia?.va ? guia.fichero : null
        },
        // Solo falta el cobro: es lo que el atajo «Entregar sin cobrar» se salta.
        soloFaltaCobro: faltan.length === 1 && !row.cobrado && !sinCobro,
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
function mensaje(row, fase, { textoGuia = '', guia = null, enlaceObra = null, conTasa = false } = {}) {
    const ph = uploads.normalizePhase(fase);
    const faseLabel = estados.nombreFase(row, ph);
    const papeles = `el certificado firmado, el justificante de registro${conTasa ? ', el justificante de la tasa' : ''} y la etiqueta energética`;
    // En un DOBLE, el final se emite con la factura de la instalación (paso 5 del
    // procedimiento): con el ENLACE para subirla, y diciendo que ya está pagado
    // si lo está (la factura cubrió los dos certificados).
    const pagado = row.cobrado ? ' Ya está pagado: no hay nada más que abonar.' : '';
    // Si paga el PARTNER, el mensaje es para la EMPRESA: de quién es el
    // certificado y de qué vivienda, en plural y sin "tu". La guía es del
    // particular (la deducción es suya): se le pide que se la pase.
    const dest = destinatarioEntrega(row);
    if (dest.partner) {
        const obra = svc.obraDe(row);
        const deQuien = [obra.cliente ? `*${obra.cliente}*` : null, obra.direccion ? `(${obra.direccion})` : null].filter(Boolean).join(' ');
        const sigP = estados.esDoble(row) && ph === 'inicial'
            ? (enlaceObra
                ? `Cuando la instalación esté terminada, subid aquí su *factura* y emitimos el *certificado energético final*.${pagado}\n👉 ${enlaceObra}\n\n`
                : `Cuando tengáis la *factura definitiva de la instalación*, avisadnos y emitimos el *certificado energético final*.\n\n`)
            : '';
        const pct = guia?.modalidad || null;
        const parrafoGuia = textoGuia
            ? `Va también una *guía de una página* para que ${obra.cliente ? 'el propietario' : 'vuestro cliente'} se aplique la *deducción${pct ? ` del ${pct} %` : ''}* en su declaración de la Renta, con los datos que le pedirá Renta Web ya rellenos. Pasádsela junto con los certificados.\n\n`
            : '';
        return `¡Hola!\n\n`
            + `Ya está registrado el *${faseLabel}*${deQuien ? ` de ${deQuien}` : ''}, expediente ${row.numero_expediente}.\n\n`
            + `Os adjuntamos ${papeles}.\n\n`
            + sigP
            + parrafoGuia
            + `¡Gracias por confiar en nosotros!\n*BROKERGY · Ingeniería Energética*`;
    }
    // En un encargo DOBLE, con el inicial se le recuerda el paso siguiente: el
    // final se emite cuando la obra está hecha y facturada.
    const siguiente = estados.esDoble(row) && ph === 'inicial'
        ? (enlaceObra
            ? `🔧 *Siguiente paso:* cuando tengas la instalación terminada, sube aquí su *factura* y emitimos tu *certificado energético final*.${pagado}\n👉 ${enlaceObra}\n\n`
            : `Cuando tengas la *factura definitiva de la instalación*, avísanos y emitimos el *certificado energético final*.\n\n`)
        : '';
    // Se saluda a quien RECIBE el mensaje (con el desvío activo, su persona de
    // contacto) y en minúsculas: la ficha guarda el nombre en MAYÚSCULAS y
    // "¡Hola LAURA!" delata la plantilla.
    const nombre = svc.contactoCliente(row.cliente).nombre || nombreCliente(row.cliente);
    const p = nombre ? nombre.split(/\s+/)[0] : '';
    const pila = p ? ` ${p.charAt(0).toUpperCase()}${p.slice(1).toLowerCase()}` : '';
    return `¡Hola${pila}!\n\n`
        + `Ya tienes tu *${faseLabel}* registrado (expediente ${row.numero_expediente}).\n\n`
        + `Te adjuntamos ${papeles}. `
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

    // `sinCobro` solo lo pasa una persona (ruta adminOnly): el automático nunca.
    const sinCobro = !!(opts.manual && opts.sinCobro);
    const st = await estado(row, ph, { sinCobro });

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

    const adjuntos = await uploads.getSlotAttachments(row, ph, [...SLOTS_ENTREGA, ...OPCIONALES_ENTREGA]);
    // Cinturón: `estado()` los vio en Drive, pero entre la comprobación y la
    // descarga alguien puede haberlos movido. Mandar un email de entrega SIN el
    // certificado deja al cliente esperando algo que ya se dio por enviado.
    if (SLOTS_ENTREGA.some(s => !adjuntos.some(a => a.slot === s))) {
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

    let enlaceObra = null;
    if (estados.esDoble(row) && ph === 'inicial') {
        try { enlaceObra = await proceso().enlaceFacturaInstalacion(row); }
        catch (e) { console.warn('[cee-entrega] enlace de la factura de la instalación:', e.message); }
    }
    const cuerpo = opts.mensaje?.trim() || mensaje(row, ph, {
        textoGuia: guia?.texto, guia, enlaceObra, conTasa: adjuntos.some(a => a.slot === 'tasa')
    });
    const faseLabel = estados.nombreFase(row, ph);
    // Por defecto los dos canales; el popup de reenvío puede pedir solo uno.
    const usar = Array.isArray(opts.channels) && opts.channels.length ? opts.channels : ['email', 'whatsapp'];

    if (st.destinatario.email && usar.includes('email')) {
        try {
            await emailService.sendMail({
                to: st.destinatario.email,
                subject: st.destinatario.partner
                    ? `${row.numero_expediente} — ${faseLabel} de ${nombreCliente(row.cliente) || 'vuestro cliente'}`
                    : `${row.numero_expediente} — Tu ${faseLabel}`,
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
                    { base64: a.content.toString('base64'), filename: a.filename, mimetype: a.contentType || 'application/pdf' },
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
            destinatario: { email: st.destinatario.email, tlf: st.destinatario.tlf, ...(st.destinatario.partner ? { partner: st.destinatario.nombre } : {}) },
            automatica: !opts.manual,
            usuario: opts.usuario || null,
            ...(sinCobro && !row.cobrado ? { sin_cobrar: true } : {}),
            ...(errores.length ? { errores } : {})
        }
    });

    await svc.anotarHistorial(row.id, {
        tipo: 'CLIENTE',
        texto: `${faseLabel.toUpperCase()} ENTREGADO ${st.destinatario.partner ? `AL PARTNER (${String(st.destinatario.nombre || '').toUpperCase()}, A QUIEN SE FACTURÓ)` : 'AL CLIENTE'} POR ${canales.join(' Y ').toUpperCase()}`
            + `${guia ? ` + GUÍA DE LA DEDUCCIÓN DEL IRPF (${guia.modalidad} %${guia.ejemplo ? ', CON EJEMPLO' : ''})` : ''}`
            + `${sinCobro && !row.cobrado ? ' — SIN COBRAR (DECISIÓN MANUAL)' : ''}`
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
    return { enviado: true, canales, errores, ficheros: adjuntos.map(a => a.filename), guia: !!guia, destinatario: st.destinatario };
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

/**
 * El texto del aviso de «registrado». Con el PROCEDIMIENTO (2026-10-14) la
 * factura suele haber salido ANTES de registrarse: si hay una emitida y sin
 * cobrar, el aviso la RECUERDA (`facturaPendiente`) en vez de prometer una
 * factura que ya tiene; y en los dos casos lleva el enlace para subir el
 * justificante de pago.
 */
async function textoAviso(row, ph, contacto, factura) {
    const ultima = proceso().ultimaFactura(row);
    const pendiente = !factura && !row.cobrado && ultima ? { numero: ultima.numero, total: ultima.total } : null;
    let enlacePago = null;
    if (!row.cobrado && (factura || pendiente)) {
        try { enlacePago = await proceso().enlacePago(row); }
        catch (e) { console.warn('[cee-directo registrado] enlace de pago:', e.message); }
    }
    return require('./recordatorios').ceeDirectoRegistradoClienteMsg({
        destinatario: contacto.nombre, numExp: row.numero_expediente,
        fase: svc.faseCliente(row, ph), cobrado: !!row.cobrado,
        tercero: contacto.tercero, obra: contacto.tercero ? svc.obraDe(row) : null,
        factura, facturaPendiente: pendiente, enlacePago,
        // El inicial de un DOBLE sin ninguna factura: el cobro se deja para el final.
        cobroAlFinal: estados.esDoble(row) && ph === 'inicial'
    });
}

/** Texto del aviso SIN certificados (no cobrado) — el que manda la rejilla. */
const textoSinCobrar = (row, fase) => {
    const ph = uploads.normalizePhase(fase);
    return textoAviso(row, ph, svc.contactoCliente(row.cliente), null);
};

/** El mensaje de la ENTREGA tal cual saldría (con el enlace de la obra y la tasa), para las vistas previas. */
async function mensajeEntrega(row, fase, st) {
    const ph = uploads.normalizePhase(fase);
    let enlaceObra = null;
    if (estados.esDoble(row) && ph === 'inicial') {
        try { enlaceObra = await proceso().enlaceFacturaInstalacion(row); } catch { /* sin enlace: el texto de siempre */ }
    }
    const guia = st?.guia?.va ? st.guia : null;
    return mensaje(row, ph, { textoGuia: guia?.texto || '', guia, enlaceObra, conTasa: !!st?.ficheros?.tasa });
}

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
            conFactura: conFactura ? await textoAviso(row, ph, contacto, { numero: factura.numero || 'que te adjuntamos', total: factura.total }) : null,
            sinFactura: await textoAviso(row, ph, contacto, null)
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

    const texto = (textoLibre && String(textoLibre).trim()) || await textoAviso(row, ph, contacto, fac ? { numero: fac.numero, total: fac.total } : null);
    const canales = [];
    // Por qué no ha salido cada canal, dicho para quien pulsa: «no se pudo enviar»
    // a secas no dice que el teléfono de la ficha es un apellido (2026CEE_55).
    const errores = [];
    if (!channels.includes('whatsapp') && !channels.includes('email')) errores.push('No se ha elegido ninguna vía (email o WhatsApp)');
    if (channels.includes('whatsapp') && !contacto.tlf) errores.push('WhatsApp: el cliente no tiene teléfono en su ficha');
    if (channels.includes('email') && !contacto.email) errores.push('Email: el cliente no tiene email en su ficha');
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
        catch (e) {
            console.warn('[cee-directo registrado] WA:', e.message);
            errores.push(/no válido|inválido/i.test(e.message)
                ? `WhatsApp: el teléfono de la ficha no es válido («${contacto.tlf}»). Corrígelo en la ficha del cliente${contacto.tercero ? ' (persona de contacto)' : ''}`
                : `WhatsApp: ${e.message}`);
        }
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
        } catch (e) { console.warn('[cee-directo registrado] email:', e.message); errores.push(`Email: ${e.message}`); }
    }
    if (!canales.length) return { enviado: false, motivo: 'ENVIO_FALLIDO', errores, ...(fac ? { factura: { numero: fac.numero, emitida: fac.emitida } } : {}) };
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
    return { enviado: true, canales, errores, ...(fac ? { factura: { numero: fac.numero, total: fac.total, emitida: fac.emitida } } : {}) };
}

// ─── «Entregar todo»: los dos certificados de un DOBLE en UN mensaje ────────
//
// Fran, 25/10/2026 (2026CEE_61): «un botón para enviar todo junto con el texto
// explicativo: 1. CEE inicial 2. etiqueta del inicial 3. CEE final 4. etiqueta del
// final 5. guía IRPF. Todo en un único mensaje». Es lo que se hace cuando las dos
// fases llegan juntas (registradas y cobradas a la vez): en vez de dos entregas
// con el mismo saludo, una sola, con los cinco papeles en ESE orden. Sin el
// justificante de registro ni la tasa: el cliente no los necesita para nada.
//
// Mismas garantías que `entregar`: idempotencia antes que nada (con las dos fases
// ya entregadas no sale sin `reenviar`), adjuntos recomprobados al descargar, a
// quien PAGA, y la guía no frena el envío (si no se puede preparar, van cuatro y
// el texto no la anuncia). Sella las DOS fases, para que el automático no repita.

const ORDEN_TODO = [
    { fase: 'inicial', slot: 'pdf', etiqueta: 'CEE inicial firmado' },
    { fase: 'inicial', slot: 'etiqueta', etiqueta: 'etiqueta energética del CEE inicial' },
    { fase: 'final', slot: 'pdf', etiqueta: 'CEE final firmado' },
    { fase: 'final', slot: 'etiqueta', etiqueta: 'etiqueta energética del CEE final' },
];
const ETIQUETA_GUIA_TODO = 'guía para la deducción en la Renta';

/** ¿Se pueden entregar ya los dos juntos? La definición que usan el popup y el envío. */
async function estadoTodo(row, { sinCobro = false } = {}) {
    const faltan = [];
    const doble = estados.esDoble(row);
    if (!doble) faltan.push('Solo para encargos con CEE inicial y final');
    if (!row.cobrado && !sinCobro) faltan.push('Marcar el expediente como cobrado');

    const enDrive = { inicial: {}, final: {} };
    if (doble) {
        for (const ph of ['inicial', 'final']) {
            enDrive[ph] = row.drive_folder_id ? await uploads.scanSection(row, ph) : {};
            if (row.seguimiento?.[`cee_${ph}`] !== 'REGISTRADO') faltan.push(`Que el CEE ${ph} esté registrado`);
            if (!enDrive[ph].pdf) faltan.push(`Subir el PDF del CEE ${ph} firmado`);
            if (!enDrive[ph].etiqueta) faltan.push(`Subir la etiqueta energética del CEE ${ph}`);
        }
    }

    const dest = destinatarioEntrega(row);
    if (!dest.email && !dest.tlf) faltan.push(dest.partner ? 'El partner no tiene ni email ni teléfono en su ficha' : 'El cliente no tiene ni email ni teléfono en su ficha');

    const guiaInterna = doble ? await guiaIrpf().guiaDeEntrega(row, 'final') : { va: false };
    const guia = guiaIrpf().guiaDeEntregaPublica(guiaInterna);
    const adjuntos = ORDEN_TODO.map(o => ({ ...o, fichero: enDrive[o.fase]?.[o.slot]?.name || null }));
    if (guia?.va) adjuntos.push({ fase: 'final', slot: 'guia', etiqueta: ETIQUETA_GUIA_TODO, fichero: guia.fichero });

    const sellos = row.documentacion?.entrega_cliente || {};
    return {
        puede: faltan.length === 0,
        faltan,
        soloFaltaCobro: faltan.length === 1 && !row.cobrado && !sinCobro,
        // Entregado = las DOS fases selladas. Con una sola, «todo» sigue teniendo
        // sentido (se le manda el juego completo) y el popup lo avisa.
        yaEntregado: sellos.inicial && sellos.final ? { inicial: sellos.inicial, final: sellos.final } : null,
        entregadas: { inicial: sellos.inicial || null, final: sellos.final || null },
        destinatario: { nombre: dest.nombre || nombreCliente(row.cliente), email: dest.email || null, tlf: dest.tlf || null, partner: dest.partner, factura: dest.factura || null },
        adjuntos,
        guia,
        cobrado: !!row.cobrado,
        _guia: guiaInterna,
    };
}

/** El texto del mensaje único. Mismo tono que `mensaje`, con la lista numerada de lo que va. */
function mensajeTodo(row, { guia = null, adjuntos = [] } = {}) {
    const lista = adjuntos.map((a, i) => `${i + 1}. ${a.etiqueta.charAt(0).toUpperCase()}${a.etiqueta.slice(1)}`).join('\n');
    const pagado = row.cobrado ? ' Ya está pagado: no hay nada más que abonar.' : '';
    const dest = destinatarioEntrega(row);
    if (dest.partner) {
        const obra = svc.obraDe(row);
        const deQuien = [obra.cliente ? `*${obra.cliente}*` : null, obra.direccion ? `(${obra.direccion})` : null].filter(Boolean).join(' ');
        const parrafoGuia = guia?.va
            ? `La guía es de una página para que ${obra.cliente ? 'el propietario' : 'vuestro cliente'} se aplique la *deducción${guia.modalidad ? ` del ${guia.modalidad} %` : ''}* en su declaración de la Renta, con los datos que le pedirá Renta Web ya rellenos. Pasádsela junto con los certificados.\n\n`
            : '';
        return `¡Hola!\n\n`
            + `Ya están registrados los dos certificados energéticos${deQuien ? ` de ${deQuien}` : ''}, el *inicial* y el *final* (expediente ${row.numero_expediente}).\n\n`
            + `Os lo mandamos todo junto, en este orden:\n${lista}\n\n`
            + (pagado ? `${pagado.trim()}\n\n` : '')
            + parrafoGuia
            + `¡Gracias por confiar en nosotros!\n*BROKERGY · Ingeniería Energética*`;
    }
    const nombre = svc.contactoCliente(row.cliente).nombre || nombreCliente(row.cliente);
    const p = nombre ? nombre.split(/\s+/)[0] : '';
    const pila = p ? ` ${p.charAt(0).toUpperCase()}${p.slice(1).toLowerCase()}` : '';
    return `¡Hola${pila}!\n\n`
        + `Ya están registrados tus dos certificados energéticos (expediente ${row.numero_expediente}): el *inicial*, de cómo estaba la vivienda antes de la obra, y el *final*, de cómo ha quedado.\n\n`
        + `Te lo mandamos todo junto, en este orden:\n${lista}\n\n`
        + `Guárdalos: son los documentos que te van a pedir.${pagado}\n\n`
        + (guia?.va && guia.texto ? `${guia.texto}\n\n` : '')
        + `¡Gracias por confiar en nosotros!\n*BROKERGY · Ingeniería Energética*`;
}

/** Lo que enseña el popup antes de mandar nada: requisitos, a quién, los adjuntos en orden y el texto. */
async function borradorTodo(id, { sinCobro = false } = {}) {
    const row = await svc.cargar(id);
    if (!row) return null;
    const { _guia, ...st } = await estadoTodo(row, { sinCobro });  // eslint-disable-line no-unused-vars
    return { ...st, numero: row.numero_expediente, mensaje: mensajeTodo(row, { guia: st.guia, adjuntos: st.adjuntos }) };
}

/**
 * Entrega los dos certificados de un DOBLE (y la guía) en UN mensaje.
 * Siempre a mano: el automático sigue entregando fase a fase.
 *
 * @param {string} id
 * @param {object} opts  { reenviar, sinCobro (solo ADMIN, lo comprueba la ruta), mensaje, channels, usuario }
 */
async function entregarTodo(id, opts = {}) {
    const row = await svc.cargar(id);
    if (!row) return { enviado: false, motivo: 'NO_EXISTE' };
    const sinCobro = !!opts.sinCobro;
    const st = await estadoTodo(row, { sinCobro });

    if (st.yaEntregado && !opts.reenviar) {
        return { enviado: false, motivo: 'YA_ENTREGADO', entregadoAt: st.yaEntregado.final.at };
    }
    if (!st.puede) return { enviado: false, motivo: 'FALTAN_REQUISITOS', faltan: st.faltan };

    // Los cuatro de Drive, en el orden pedido. Cinturón: si alguno no baja, no sale nada.
    const porFase = {
        inicial: await uploads.getSlotAttachments(row, 'inicial', ['pdf', 'etiqueta']),
        final: await uploads.getSlotAttachments(row, 'final', ['pdf', 'etiqueta']),
    };
    const adjuntos = [];
    for (const o of ORDEN_TODO) {
        const a = porFase[o.fase].find(x => x.slot === o.slot);
        if (!a) return { enviado: false, motivo: 'ADJUNTOS_NO_DESCARGABLES', faltan: [`No se ha podido descargar de Drive: ${o.etiqueta}`] };
        adjuntos.push({ ...a, fase: o.fase, etiqueta: o.etiqueta });
    }

    const errores = [];
    let guia = null;
    let bufferGuia = null;
    if (st._guia?.va) {
        try {
            const { buffer, filename } = await guiaIrpf().pdfGuiaDeEntrega(st._guia);
            adjuntos.push({ slot: 'guia', fase: 'final', etiqueta: ETIQUETA_GUIA_TODO, filename: filename.replace(' – ', ' - '), content: buffer, contentType: 'application/pdf' });
            guia = st._guia;
            bufferGuia = buffer;
        } catch (e) {
            console.warn(`[cee-entrega todo] ${row.numero_expediente}: la guía del IRPF no se pudo preparar:`, e.message);
            errores.push(`guía de la Renta: ${e.message}`);
        }
    }

    // El texto editado en el popup anunciaba la guía; si al final no se ha podido
    // preparar, dejaría al cliente buscándola: entonces manda el texto generado.
    const editado = opts.mensaje?.trim();
    const cuerpo = editado && (guia || !st._guia?.va)
        ? editado
        : mensajeTodo(row, { guia: guiaIrpf().guiaDeEntregaPublica(guia), adjuntos });
    const usar = Array.isArray(opts.channels) && opts.channels.length ? opts.channels : ['email', 'whatsapp'];
    const canales = [];

    if (st.destinatario.email && usar.includes('email')) {
        try {
            await emailService.sendMail({
                to: st.destinatario.email,
                subject: st.destinatario.partner
                    ? `${row.numero_expediente} — Certificados energéticos inicial y final de ${nombreCliente(row.cliente) || 'vuestro cliente'}`
                    : `${row.numero_expediente} — Tus certificados energéticos (inicial y final)`,
                text: cuerpo.replace(/\*/g, ''),
                html: `<pre style="font-family:inherit;white-space:pre-wrap">${cuerpo.replace(/\*/g, '')}</pre>`,
                attachments: adjuntos.map(a => ({ filename: a.filename, content: a.content, contentType: a.contentType }))
            });
            canales.push('email');
        } catch (e) { errores.push(`email: ${e.message}`); }
    }

    if (st.destinatario.tlf && usar.includes('whatsapp')) {
        try {
            // El texto primero y aparte; detrás cada PDF con su número y su etiqueta.
            await whatsappService.sendText(st.destinatario.tlf, cuerpo);
            for (const [i, a] of adjuntos.entries()) {
                await whatsappService.sendMedia(
                    st.destinatario.tlf,
                    { base64: a.content.toString('base64'), filename: a.filename, mimetype: a.contentType || 'application/pdf' },
                    { caption: `${i + 1}. ${a.etiqueta}`, splitCaption: false }
                );
            }
            canales.push('whatsapp');
        } catch (e) { errores.push(`whatsapp: ${e.message}`); }
    }

    if (!canales.length) return { enviado: false, motivo: 'ENVIO_FALLIDO', errores };

    // Las DOS fases selladas: el automático ya no repite ninguna.
    const at = new Date().toISOString();
    const ficheros = adjuntos.map(a => a.filename);
    const sello = (ph) => ({
        at, canales,
        ficheros: adjuntos.filter(a => a.fase === ph).map(a => a.filename),
        destinatario: { email: st.destinatario.email, tlf: st.destinatario.tlf, ...(st.destinatario.partner ? { partner: st.destinatario.nombre } : {}) },
        automatica: false,
        todo: true,
        usuario: opts.usuario || null,
        ...(sinCobro && !row.cobrado ? { sin_cobrar: true } : {}),
        ...(errores.length ? { errores } : {})
    });
    await svc.mergeDoc(row.id, 'entrega_cliente', { inicial: sello('inicial'), final: sello('final') });

    await svc.anotarHistorial(row.id, {
        tipo: 'CLIENTE',
        texto: `CEE INICIAL Y FINAL ENTREGADOS EN UN SOLO MENSAJE ${st.destinatario.partner ? `AL PARTNER (${String(st.destinatario.nombre || '').toUpperCase()}, A QUIEN SE FACTURÓ)` : 'AL CLIENTE'} POR ${canales.join(' Y ').toUpperCase()}`
            + ` (CERTIFICADOS Y ETIQUETAS${guia ? ` + GUÍA DE LA DEDUCCIÓN DEL IRPF (${guia.modalidad} %${guia.ejemplo ? ', CON EJEMPLO' : ''})` : ''})`
            + `${sinCobro && !row.cobrado ? ' — SIN COBRAR (DECISIÓN MANUAL)' : ''}`,
        usuario: opts.usuario || null
    });

    if (guia) {
        try {
            await guiaIrpf().sellarGuiaEntregada(guia, bufferGuia, {
                canales, destinatario: st.destinatario, ficheros, usuario: opts.usuario || null, automatica: false
            });
        } catch (e) { console.warn('[cee-entrega todo] no se pudo sellar la guía:', e.message); }
    }

    console.log(`[cee-entrega todo] ${row.numero_expediente} entregado por ${canales.join('+')} (${ficheros.length} adjuntos)`);
    return { enviado: true, canales, errores, ficheros, guia: !!guia, destinatario: st.destinatario };
}

module.exports = {
    borradorTodo,
    entregarTodo,
    mensajeTodo,
    avisarRegistrado,
    borradorAviso,
    SLOTS_ENTREGA,
    autoActivado,
    estado,
    mensaje,
    mensajeEntrega,
    textoSinCobrar,
    entregar,
    intentarEntregaAsync,
    destinatarioEntrega
};
