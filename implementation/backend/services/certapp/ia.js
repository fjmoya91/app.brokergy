// ─── certapp/ia.js — pedir el CEE de una obra (al equipo y, si toca, a la IA) ─
// Al pulsar «Generar certificado» el certificador ya ha gastado su crédito y la
// obra está EN_PREPARACION. Aquí:
//   1. SIEMPRE se avisa al equipo de BROKERGY (WhatsApp + email): UN mensaje de
//      encargo, con el certificador, el cliente, la vivienda y el enlace a la obra
//      en el admin (lo que contestó está allí). En la beta, alguien mira cada pedido.
//      Y al certificador, su acuse (WhatsApp + email): recibido y qué viene.
//   2. Solo con CERTAPP_IA_AUTO=true se le encarga al Claude del WhatsApp por la
//      cola de siempre (ceeIa.pedir con negocio 'ext'), EN SILENCIO: ni acuse ni
//      avisos a mitad; el siguiente mensaje es el de «listo para revisar», cuando
//      CE3X lo ha calificado en el PC (certapp/entrega.alTerminarIa). Si falla, no
//      se deshace nada: la obra sigue EN_PREPARACION y el equipo ya está avisado
//      (lo pide a mano desde el admin con «Pedir a la IA»).
// ─────────────────────────────────────────────────────────────────────────────
const avisos = require('./avisos');
const { encendido, certappUrl, nombreCompleto, nombreApp } = require('./comun');

const enlaceAdmin = (obra) => `${certappUrl()}/admin/obras/${obra.id}`;

/** Encarga el CEE a la cola de la IA (negocio 'ext'). Lanza si no se puede. */
async function encargarIa(obra, { usuario, rehacer = false }) {
    return require('../ceeIa').pedir({ negocio: 'ext', id: obra.id, usuario, rehacer: !!rehacer, fase: 'inicial' });
}

/** El mismo texto sin las negritas de WhatsApp, para el email (los `_` se quedan: van en los números). */
const sinNegritas = (t) => String(t).replace(/\*/g, '');

/**
 * El aviso del ENCARGO al equipo: quién lo pide, para quién y el número; nada más
 * (Fran, 25/10/2026: «uno de encargo, con los datos del certificador, el cliente
 * y el número de obra, y poco más»). Lo que contestó está en el admin. En
 * WhatsApp va en viñetas y con negritas (Fran, 25/10/2026: «mejor explicado, con
 * viñetas y negrita»); el email lleva el mismo texto sin los asteriscos.
 */
function textoEncargo(obra, cuenta, { iaAuto }) {
    const titular = obra.titular || {};
    const cliente = [titular.nombre, titular.apellidos].filter(Boolean).join(' ') || obra.nombre || '—';
    const quien = nombreCompleto(cuenta) || cuenta?.email || 'un certificador';
    const contacto = [cuenta?.email, cuenta?.telefono].filter(Boolean).join(' · ');
    // Un encargo del CRM: de qué expediente es (sus fotos ya están en él).
    const crm = obra.seguimiento?.crm?.id ? obra.seguimiento.crm : null;
    return [
        `🧾 *Encargo de CEE · ${obra.numero_expediente}*`,
        ...(crm ? [`📌 *Del CRM:* ${crm.numero || crm.id} (${crm.fase === 'final' ? 'CEE final' : 'CEE inicial'}${crm.negocio === 'cee' ? ', CEE directo' : ''}) · sin gastar créditos`] : []),
        '',
        `• *Certificador:* ${quien}${cuenta?.empresa ? ` (${cuenta.empresa})` : ''}`,
        ...(contacto ? [`   ${contacto}`] : []),
        `• *Cliente:* ${cliente}`,
        `• *Vivienda:* ${[obra.direccion, obra.municipio].filter(Boolean).join(', ') || '—'}`,
        '',
        iaAuto ? '🤖 Lo prepara la IA: te aviso cuando esté listo para revisar.'
               : '⚠️ La IA automática está apagada: pídelo desde el admin.',
        `👉 Ver la obra: ${enlaceAdmin(obra)}`,
    ].join('\n');
}

/**
 * El acuse al CERTIFICADOR al pedir el CEE (Fran, 25/10/2026, probando la
 * 2026EXT_2: «a mí como certificador no me está llegando ni WhatsApp ni email de
 * los pasos del CEE»): que sepa que está en marcha y qué viene. El siguiente
 * aviso que recibe es el de la entrega (`entrega.entregar`). Nunca lanza.
 */
async function acuseCertificador(obra, cuenta) {
    try {
        const { enlaceObra } = require('./entrega');
        const donde = [obra.direccion, obra.municipio].filter(Boolean).join(', ');
        const revisamos = !encendido('CERTAPP_ENTREGA_AUTO');
        const p = {
            titulo: `Hemos recibido tu encargo ${obra.numero_expediente}`,
            saludo: cuenta?.nombre ? `Hola ${cuenta.nombre}:` : 'Hola:',
            parrafos: [`Ya estamos con el certificado de ${donde || obra.numero_expediente}.`],
            pasos: [
                ['Lo preparamos', 'La IA hace el .cex con tus fotos y tus respuestas, y lo calculamos con CE3X 3.2.'],
                ...(revisamos ? [['Lo revisamos', 'Alguien del equipo lo mira antes de dártelo.']] : []),
                ['Te avisamos', 'Por WhatsApp y por email en cuanto esté listo, para que lo revises y lo firmes desde la app.'],
            ],
            boton: { href: enlaceObra(obra), label: 'Ver la obra' },
        };
        return await avisos.avisarCertificador(cuenta, {
            asunto: `${p.titulo} — ${nombreApp()}`,
            html: avisos.plantilla({ ...p, preheader: p.parrafos[0] }),
            texto: avisos.textoPlano(p),
            whatsapp: [
                `🧾 *Hemos recibido tu encargo ${obra.numero_expediente}*`,
                ...(donde ? [donde] : []),
                '',
                '• *Lo preparamos:* la IA hace el .cex con tus fotos y tus respuestas, y lo calculamos con CE3X 3.2.',
                ...(revisamos ? ['• *Lo revisamos* antes de dártelo.'] : []),
                '• *Te avisamos* por aquí y por email en cuanto esté listo, para que lo revises y lo firmes.',
                '',
                `👉 Ver la obra: ${enlaceObra(obra)}`,
            ].join('\n'),
        });
    } catch (e) {
        console.warn(`[certapp ia] ${obra?.numero_expediente}: acuse al certificador sin enviar:`, e.message);
        return { canales: [], error: e.message };
    }
}

/**
 * @param {object} obra   fila de certapp_obras (ya EN_PREPARACION)
 * @param {object} cuenta fila de certapp_cuentas
 * @returns {Promise<{ equipo: object, ia: { auto: boolean, ok?: boolean, motivo?: string, trabajo_id?: string } }>}
 */
async function pedirCee(obra, cuenta, { forzarIa = false, por = null } = {}) {
    const iaAuto = encendido('CERTAPP_IA_AUTO') || forzarIa;
    const texto = textoEncargo(obra, cuenta, { iaAuto });
    const equipo = await avisos.avisarEquipo({ asunto: `Encargo de CEE · ${obra.numero_expediente}`, cuerpo: sinNegritas(texto), whatsapp: texto });
    const certificador = await acuseCertificador(obra, cuenta);

    const ia = { auto: encendido('CERTAPP_IA_AUTO') || forzarIa };
    if (ia.auto) {
        try {
            const t = await encargarIa(obra, { usuario: por || `certapp:${cuenta?.email || cuenta?.id}` });
            ia.ok = true;
            ia.trabajo_id = t?.id || null;
        } catch (e) {
            ia.ok = false;
            ia.motivo = e?.message || String(e);
            console.warn(`[certapp ia] ${obra.numero_expediente}: no se ha podido encargar a la IA:`, ia.motivo);
            await avisos.avisarEquipo({
                asunto: `${obra.numero_expediente} — no se ha podido encargar a la IA`,
                cuerpo: `⚠️ ${obra.numero_expediente}: no se ha podido encargar a la IA (${ia.motivo}). Pídelo a mano: ${enlaceAdmin(obra)}`,
                soloWhatsapp: true,
            });
        }
    }
    return { equipo, certificador, ia };
}

module.exports = { pedirCee, encargarIa, enlaceAdmin, textoEncargo, acuseCertificador, sinNegritas };
