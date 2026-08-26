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

// Los dos que se entregan, en este orden (el certificado primero: es lo que el
// cliente ha comprado; el registro es la prueba de que está presentado).
const SLOTS_ENTREGA = ['pdf', 'registro'];

const ETIQUETA_SLOT = { pdf: 'certificado firmado', registro: 'justificante de registro' };

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

    const email = cli?.email || null;
    const tlf = cli?.tlf || cli?.telefono || cli?.movil || null;
    if (!email && !tlf) faltan.push('El cliente no tiene ni email ni teléfono en su ficha');

    return {
        puede: faltan.length === 0,
        faltan,
        yaEntregado: sello,
        destinatario: { nombre: nombreCliente(cli), email, tlf },
        ficheros: {
            pdf: enDrive.pdf ? enDrive.pdf.name : null,
            registro: enDrive.registro ? enDrive.registro.name : null
        }
    };
}

/** Texto del mensaje. Sale de aquí y no de cada ruta: es el mismo por los dos canales. */
function mensaje(row, fase) {
    const faseLabel = estados.nombreFase(row, uploads.normalizePhase(fase));
    const nombre = nombreCliente(row.cliente);
    const pila = nombre ? ` ${nombre.split(/\s+/)[0]}` : '';
    return `¡Hola${pila}!\n\n`
        + `Ya tienes tu *${faseLabel}* registrado (expediente ${row.numero_expediente}).\n\n`
        + `Te adjuntamos el certificado firmado y el justificante de registro. `
        + `Guárdalos: son los documentos que te van a pedir.\n\n`
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
            + `con ${st.ficheros.pdf} + ${st.ficheros.registro}`);
        return { enviado: false, motivo: 'AUTO_DESACTIVADO', simulado: st };
    }

    const adjuntos = await uploads.getSlotAttachments(row, ph, SLOTS_ENTREGA);
    // Cinturón: `estado()` los vio en Drive, pero entre la comprobación y la
    // descarga alguien puede haberlos movido. Mandar un email de entrega SIN el
    // certificado deja al cliente esperando algo que ya se dio por enviado.
    if (adjuntos.length < SLOTS_ENTREGA.length) {
        return { enviado: false, motivo: 'ADJUNTOS_NO_DESCARGABLES', faltan: ['No se han podido descargar los ficheros de Drive'] };
    }

    const cuerpo = opts.mensaje?.trim() || mensaje(row, ph);
    const faseLabel = estados.nombreFase(row, ph);
    const canales = [];
    const errores = [];

    if (st.destinatario.email) {
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

    if (st.destinatario.tlf) {
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
            + `${opts.manual ? '' : ' (AUTOMÁTICO)'}`,
        usuario: opts.usuario || null
    });

    console.log(`[cee-entrega] ${row.numero_expediente} entregado por ${canales.join('+')}`);
    return { enviado: true, canales, errores, ficheros: adjuntos.map(a => a.filename) };
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

module.exports = {
    SLOTS_ENTREGA,
    autoActivado,
    estado,
    mensaje,
    entregar,
    intentarEntregaAsync
};
