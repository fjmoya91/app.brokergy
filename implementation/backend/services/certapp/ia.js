// ─── certapp/ia.js — pedir el CEE de una obra (al equipo y, si toca, a la IA) ─
// Al pulsar «Generar certificado» el certificador ya ha gastado su crédito y la
// obra está EN_PREPARACION. Aquí:
//   1. SIEMPRE se avisa al equipo de BROKERGY (WhatsApp + email, con el resumen
//      del cuestionario y el enlace a la obra en el admin): en la beta, alguien
//      mira cada pedido.
//   2. Solo con CERTAPP_IA_AUTO=true se le encarga al Claude del WhatsApp por la
//      cola de siempre (ceeIa.pedir con negocio 'ext'). Si falla, no se deshace
//      nada: la obra sigue EN_PREPARACION y el equipo ya está avisado (lo pide
//      a mano desde el admin con «Pedir a la IA»).
// ─────────────────────────────────────────────────────────────────────────────
const { cuestionario: logica } = require('./logica');
const avisos = require('./avisos');
const { encendido, certappUrl, nombreCompleto } = require('./comun');

const enlaceAdmin = (obra) => `${certappUrl()}/admin/obras/${obra.id}`;

/** Encarga el CEE a la cola de la IA (negocio 'ext'). Lanza si no se puede. */
async function encargarIa(obra, { usuario, rehacer = false }) {
    return require('../ceeIa').pedir({ negocio: 'ext', id: obra.id, usuario, rehacer: !!rehacer, fase: 'inicial' });
}

/**
 * @param {object} obra   fila de certapp_obras (ya EN_PREPARACION)
 * @param {object} cuenta fila de certapp_cuentas
 * @returns {Promise<{ equipo: object, ia: { auto: boolean, ok?: boolean, motivo?: string, trabajo_id?: string } }>}
 */
async function pedirCee(obra, cuenta, { forzarIa = false, por = null } = {}) {
    let resumen = '';
    try { resumen = (await logica()).resumenTexto(obra); } catch (e) { resumen = '(no se ha podido componer el resumen)'; }
    const quien = nombreCompleto(cuenta) || cuenta?.email || 'un certificador';
    const cuerpo = [
        `🧾 ${obra.numero_expediente} — CEE pedido en la app de certificadores`,
        `Certificador: ${quien}${cuenta?.email ? ` (${cuenta.email})` : ''}${cuenta?.empresa ? ` · ${cuenta.empresa}` : ''}`,
        `Inmueble: ${[obra.direccion, obra.municipio, obra.provincia].filter(Boolean).join(', ') || '—'}`,
        `Ref. catastral: ${obra.ref_catastral || '—'} · Zona ${obra.zona_climatica || '—'} · ${obra.superficie_catastro ? `${obra.superficie_catastro} m²` : 's/ superficie'} · ${obra.anio_construccion || 's/ año'}`,
        '',
        resumen,
        '',
        encendido('CERTAPP_IA_AUTO') || forzarIa ? 'Se le encarga al Claude del WhatsApp (negocio ext).' : 'CERTAPP_IA_AUTO apagado: hay que pedirlo a mano desde el admin.',
        `Abrir: ${enlaceAdmin(obra)}`,
    ].join('\n');
    const equipo = await avisos.avisarEquipo({ asunto: `${obra.numero_expediente} — CEE pedido en la app de certificadores`, cuerpo });

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

module.exports = { pedirCee, encargarIa, enlaceAdmin };
