// ─── certapp/avisos.js — WhatsApp y email de la app de certificadores ────────
// REGLA — nada sale a terceros desde local: sin CERTAPP_AVISOS_ENABLED=true no
// se manda NADA (ni al equipo ni al certificador): se escribe en el log como
// «[certapp seco] …». Local escribe en la Supabase y el Drive de producción, pero
// sus avisos no salen.
//
// REGLA — un aviso NUNCA rompe la operación que lo dispara: todo va en
// try/catch y devuelve qué canales salieron. El buzón de Hostinger tiene una
// cuota de 100 emails al día compartida con el CRM: aquí se manda lo justo
// (invitación, recuperar, confirmación de la beta, entrega) y un fallo de cuota
// solo se apunta en el log.
// ─────────────────────────────────────────────────────────────────────────────
const { encendido, nombreApp, escapeHtml } = require('./comun');

const activos = () => encendido('CERTAPP_AVISOS_ENABLED');

function seco(destino, asunto, cuerpo) {
    console.log(`[certapp seco] ${destino} — ${asunto}\n${String(cuerpo || '').slice(0, 1500)}`);
}

/**
 * Al equipo de BROKERGY (WHATSAPP_ADMIN_CHAT y ADMIN_EMAIL, los de los CEE
 * directos). `soloWhatsapp` para lo corto y frecuente (beta, sugerencias), que
 * no gaste cuota de email.
 * @returns {Promise<{ seco?: true, canales: string[] }>}
 */
async function avisarEquipo({ asunto, cuerpo, soloWhatsapp = false }) {
    if (!activos()) { seco('equipo', asunto, cuerpo); return { seco: true, canales: [] }; }
    try {
        if (soloWhatsapp) {
            const wa = process.env.WHATSAPP_ADMIN_CHAT;
            if (!wa) return { canales: [] };
            await require('../whatsappService').sendText(wa, cuerpo);
            return { canales: ['whatsapp'] };
        }
        const canales = await require('../ceeDirectoProceso').avisarEquipo({ asunto, cuerpo });
        return { canales: canales || [] };
    } catch (e) {
        console.warn('[certapp] aviso al equipo sin enviar:', e.message);
        return { canales: [], error: e.message };
    }
}

/**
 * A una persona de fuera (el certificador o quien se apunta a la beta).
 * @param {{ email?: string, telefono?: string }} destino
 * @param {{ asunto: string, html?: string, texto: string, whatsapp?: string }} mensaje
 */
async function avisarPersona(destino, { asunto, html, texto, whatsapp }) {
    const canales = [];
    if (!activos()) {
        seco(`${destino.email || ''}${destino.telefono && whatsapp ? ` / ${destino.telefono}` : ''}`, asunto, texto);
        return { seco: true, canales };
    }
    if (destino.email) {
        try {
            await require('../emailService').sendMail({ to: destino.email, subject: asunto, html: html || undefined, text: texto });
            canales.push('email');
        } catch (e) {
            console.warn(`[certapp] email a ${destino.email} sin enviar${e.isQuotaError ? ' (cuota del buzón)' : ''}:`, e.message);
        }
    }
    if (destino.telefono && whatsapp) {
        try {
            await require('../whatsappService').sendText(destino.telefono, whatsapp);
            canales.push('whatsapp');
        } catch (e) { console.warn(`[certapp] WhatsApp a ${destino.telefono} sin enviar:`, e.message); }
    }
    return { canales };
}

/** Al certificador de una cuenta (email y, si lo pide el aviso y tiene teléfono, WhatsApp). */
function avisarCertificador(cuenta, mensaje) {
    return avisarPersona({ email: cuenta?.email, telefono: cuenta?.telefono }, mensaje);
}

/**
 * Email con la identidad de marca (las piezas de emailService), para que el
 * certificador reciba lo mismo que un cliente de BROKERGY.
 * @param {{ titulo, preheader, saludo?, parrafos: string[], boton?: { href, label }, nota? }} p
 *        Los párrafos van en TEXTO (se escapan aquí).
 */
function plantilla({ titulo, preheader, saludo, parrafos = [], boton, nota }) {
    const { brandEmailShell, emailP, emailButton, emailBox, BRAND } = require('../emailService');
    const contenido =
        (saludo ? emailP(escapeHtml(saludo)) : '') +
        parrafos.filter(Boolean).map(p => emailP(escapeHtml(p), { pre: true })).join('') +
        (boton ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 22px;"><tr><td align="center">${emailButton(escapeHtml(boton.href), escapeHtml(boton.label))}</td></tr></table>` : '') +
        (nota ? emailBox(emailP(escapeHtml(nota), { size: 13, color: BRAND.muted, mb: 0, center: true }), { mb: 18 }) : '') +
        (boton ? emailP(`Si el botón no funciona, copia este enlace en el navegador:<br><a href="${escapeHtml(boton.href)}" style="color:${BRAND.greenDark};text-decoration:none;word-break:break-all;">${escapeHtml(boton.href)}</a>`, { size: 12, color: BRAND.muted, mb: 0, center: true }) : '');
    return brandEmailShell({
        preheader: preheader || titulo,
        title: titulo,
        pill: null,
        contentHtml: contenido,
        footerNote: `${escapeHtml(nombreApp())} &copy; ${new Date().getFullYear()} · BROKERGY`,
    });
}

/** El mismo mensaje en texto plano (para el `text` del email y el log en seco). */
function textoPlano({ titulo, saludo, parrafos = [], boton, nota }) {
    return [titulo, '', saludo, ...parrafos, boton ? `${boton.label}: ${boton.href}` : '', nota, '', nombreApp()]
        .filter(v => v != null).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

module.exports = { avisarEquipo, avisarCertificador, avisarPersona, plantilla, textoPlano, activos };
