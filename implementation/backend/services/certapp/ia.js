// ─── certapp/ia.js — pedir el CEE de una obra (al equipo y, si toca, a la IA) ─
// Al pulsar «Generar certificado» el certificador ya ha gastado su crédito y la
// obra está EN_PREPARACION. Aquí:
//   1. SIEMPRE se avisa al equipo de BROKERGY (WhatsApp + email): UN mensaje de
//      encargo, con el certificador, el cliente, la vivienda y el enlace a la obra
//      en el admin (lo que contestó está allí). En la beta, alguien mira cada pedido.
//   2. Solo con CERTAPP_IA_AUTO=true se le encarga al Claude del WhatsApp por la
//      cola de siempre (ceeIa.pedir con negocio 'ext'), EN SILENCIO: ni acuse ni
//      avisos a mitad; el siguiente mensaje es el de «listo para revisar», cuando
//      CE3X lo ha calificado en el PC (certapp/entrega.alTerminarIa). Si falla, no
//      se deshace nada: la obra sigue EN_PREPARACION y el equipo ya está avisado
//      (lo pide a mano desde el admin con «Pedir a la IA»).
// ─────────────────────────────────────────────────────────────────────────────
const avisos = require('./avisos');
const { encendido, certappUrl, nombreCompleto } = require('./comun');

const enlaceAdmin = (obra) => `${certappUrl()}/admin/obras/${obra.id}`;

/** Encarga el CEE a la cola de la IA (negocio 'ext'). Lanza si no se puede. */
async function encargarIa(obra, { usuario, rehacer = false }) {
    return require('../ceeIa').pedir({ negocio: 'ext', id: obra.id, usuario, rehacer: !!rehacer, fase: 'inicial' });
}

/**
 * El aviso del ENCARGO al equipo: quién lo pide, para quién y el número; nada más
 * (Fran, 25/10/2026: «uno de encargo, con los datos del certificador, el cliente
 * y el número de obra, y poco más»). Lo que contestó está en el admin.
 */
function textoEncargo(obra, cuenta, { iaAuto }) {
    const titular = obra.titular || {};
    const cliente = [titular.nombre, titular.apellidos].filter(Boolean).join(' ') || obra.nombre || '—';
    const quien = nombreCompleto(cuenta) || cuenta?.email || 'un certificador';
    const contacto = [cuenta?.email, cuenta?.telefono].filter(Boolean).join(' · ');
    return [
        `🧾 Encargo de CEE · ${obra.numero_expediente}`,
        `Certificador: ${quien}${cuenta?.empresa ? ` (${cuenta.empresa})` : ''}${contacto ? ` · ${contacto}` : ''}`,
        `Cliente: ${cliente}`,
        `Vivienda: ${[obra.direccion, obra.municipio].filter(Boolean).join(', ') || '—'}`,
        ...(iaAuto ? [] : ['La IA automática está apagada: pídelo desde el admin.']),
        `Ver la obra: ${enlaceAdmin(obra)}`,
    ].join('\n');
}

/**
 * @param {object} obra   fila de certapp_obras (ya EN_PREPARACION)
 * @param {object} cuenta fila de certapp_cuentas
 * @returns {Promise<{ equipo: object, ia: { auto: boolean, ok?: boolean, motivo?: string, trabajo_id?: string } }>}
 */
async function pedirCee(obra, cuenta, { forzarIa = false, por = null } = {}) {
    const iaAuto = encendido('CERTAPP_IA_AUTO') || forzarIa;
    const cuerpo = textoEncargo(obra, cuenta, { iaAuto });
    const equipo = await avisos.avisarEquipo({ asunto: `Encargo de CEE · ${obra.numero_expediente}`, cuerpo });

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
    return { equipo, ia };
}

module.exports = { pedirCee, encargarIa, enlaceAdmin, textoEncargo };
