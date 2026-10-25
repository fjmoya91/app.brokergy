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
 * no gaste cuota de email. `whatsapp`: otro texto para el WhatsApp (con sus
 * negritas); el email lleva `cuerpo`.
 * @returns {Promise<{ seco?: true, canales: string[] }>}
 */
async function avisarEquipo({ asunto, cuerpo, whatsapp = null, soloWhatsapp = false }) {
    if (!activos()) { seco('equipo', asunto, whatsapp || cuerpo); return { seco: true, canales: [] }; }
    try {
        if (soloWhatsapp) {
            const wa = process.env.WHATSAPP_ADMIN_CHAT;
            if (!wa) return { canales: [] };
            await require('../whatsappService').sendText(wa, whatsapp || cuerpo);
            return { canales: ['whatsapp'] };
        }
        const canales = await require('../ceeDirectoProceso').avisarEquipo({ asunto, cuerpo, whatsapp });
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

// ── El email con el estilo de la APP (25/10/2026) ───────────────────────────
// Lo pidió Fran: que los emails al certificador se vean como la app (estilo
// «carta de pago», regla 164): papel crema, tarjeta blanca redondeada con el
// filete naranja → verde arriba, titular en Antonio (cae a Arial Narrow donde no
// hay web fonts: Gmail y Outlook), UN botón naranja con la letra en tinta, la
// cifra destacada con el subrayado lima y la firma de una persona con el sello.
// Tablas y estilos en línea: Outlook pinta con el motor de Word (ver las notas
// de emailService: nada de pre-wrap, line-height en px, el padding del botón en
// el <td>).
const C = {
    crema: '#faf9f7', tinta: '#141111', gris: '#55585f', gris2: '#6b6e76', linea: '#ebe9e6',
    naranja: '#ffa000', lima: '#c7f601', verdeTxt: '#4d6b0f',
};
const F = 'font-family:Inter,-apple-system,Segoe UI,Roboto,Arial,Helvetica,sans-serif;';
const FD = "font-family:'Antonio','Arial Narrow','Helvetica Neue',Arial,sans-serif;font-weight:700;";
const nl2br = (s) => String(s).replace(/\r\n|\r|\n/g, '<br>');
const base = () => (process.env.CERTAPP_URL || 'https://cee.brokergy.es').replace(/\/+$/, '');

const pEmail = (html, { size = 15, color = C.gris, mb = 16, center = false, bold = false } = {}) =>
    `<p style="margin:0 0 ${mb}px;${F}font-size:${size}px;line-height:${Math.round(size * 1.58)}px;color:${color};${center ? 'text-align:center;' : ''}${bold ? `font-weight:700;color:${C.tinta};` : ''}">${html}</p>`;

function botonEmail(href, label) {
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:6px auto 22px;"><tr>`
        + `<td bgcolor="${C.naranja}" style="background:${C.naranja};border-radius:14px;padding:16px 28px;text-align:center;">`
        + `<a href="${href}" style="${F}font-size:16px;line-height:20px;font-weight:700;color:#08090c;text-decoration:none;display:inline-block;">${label}</a>`
        + `</td></tr></table>`;
}

/** El segundo enlace, si lo hay: con borde y sin relleno, para que el naranja siga siendo UNO. */
function boton2Email(href, label) {
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:-8px auto 22px;"><tr>`
        + `<td style="border:1.5px solid ${C.tinta};border-radius:14px;padding:13px 24px;text-align:center;">`
        + `<a href="${href}" style="${F}font-size:15px;line-height:19px;font-weight:700;color:${C.tinta};text-decoration:none;display:inline-block;">${label}</a>`
        + `</td></tr></table>`;
}

/**
 * Email con el estilo de la app.
 * @param {{ titulo, preheader?, eyebrow?, saludo?, parrafos?: string[],
 *           cifra?: { valor: string|number, texto: string },
 *           pasos?: Array<[string, string]>, boton?: { href, label }, boton2?: { href, label },
 *           nota?, firma?: boolean }} p
 *        Todo en TEXTO (se escapa aquí). `boton2`: un segundo destino, más discreto.
 */
function plantilla({ titulo, preheader, eyebrow, saludo, parrafos = [], cifra, pasos, boton, boton2, nota, firma = true }) {
    const e = escapeHtml;
    const cifraHtml = cifra
        ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 22px;"><tr><td style="background:${C.crema};border:1px solid ${C.linea};border-radius:18px;padding:18px 20px;">`
            + `<span style="${FD}font-size:52px;line-height:52px;color:${C.tinta};background:${C.lima};padding:0 8px;border-radius:6px;">${e(cifra.valor)}</span>`
            + `<span style="${F}font-size:15px;line-height:22px;font-weight:600;color:${C.gris};padding-left:12px;">${e(cifra.texto)}</span>`
            + `</td></tr></table>`
        : '';
    const pasosHtml = pasos?.length
        ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;border:1px solid ${C.linea};border-radius:18px;">`
            + pasos.map(([t, d], i) => `<tr><td valign="top" width="52" style="width:52px;padding:14px 0 14px 16px;${i ? `border-top:1px solid ${C.linea};` : ''}">`
                + `<div style="width:34px;height:34px;border-radius:17px;background:${C.crema};border:1px solid ${C.linea};text-align:center;${FD}font-size:18px;line-height:34px;color:${C.tinta};">${i + 1}</div></td>`
                + `<td valign="top" style="padding:14px 16px 14px 4px;${i ? `border-top:1px solid ${C.linea};` : ''}">`
                + `<p style="margin:0;${F}font-size:15px;line-height:21px;font-weight:700;color:${C.tinta};">${e(t)}</p>`
                + `<p style="margin:3px 0 0;${F}font-size:14px;line-height:21px;color:${C.gris};">${e(d)}</p></td></tr>`).join('')
            + `</table>`
        : '';
    const contenido =
        (eyebrow ? `<p style="margin:0 0 8px;${F}font-size:11px;line-height:14px;font-weight:800;letter-spacing:.13em;text-transform:uppercase;color:#b33a0a;">${e(eyebrow)}</p>` : '')
        + `<h1 style="margin:0 0 18px;${FD}font-size:32px;line-height:36px;color:${C.tinta};">${e(titulo)}</h1>`
        + (saludo ? pEmail(e(saludo), { bold: true }) : '')
        + parrafos.filter(Boolean).map(p => pEmail(nl2br(e(p)))).join('')
        + cifraHtml + pasosHtml
        + (boton ? botonEmail(e(boton.href), e(boton.label)) : '')
        + (boton2 ? boton2Email(e(boton2.href), e(boton2.label)) : '')
        + (nota ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;"><tr><td style="background:${C.crema};border:1px solid ${C.linea};border-radius:14px;padding:12px 16px;">${pEmail(e(nota), { size: 13, color: C.gris2, mb: 0, center: true })}</td></tr></table>` : '')
        + (boton ? pEmail(`Si el botón no funciona, copia este enlace en el navegador:<br><a href="${e(boton.href)}" style="color:${C.tinta};text-decoration:underline;word-break:break-all;">${e(boton.href)}</a>`, { size: 12, color: C.gris2, mb: 0, center: true }) : '')
        + (firma
            ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:26px;border-top:1px solid ${C.linea};width:100%;"><tr>`
                + `<td width="64" valign="middle" style="width:64px;padding-top:20px;"><img src="${base()}/logo-brokergy-circular.png" width="48" height="48" alt="BROKERGY" style="display:block;border:0;border-radius:24px;"></td>`
                + `<td valign="middle" style="padding-top:20px;"><p style="margin:0;${F}font-size:15px;line-height:20px;font-weight:700;color:${C.tinta};">Fran Moya</p>`
                + `<p style="margin:2px 0 0;${F}font-size:12.5px;line-height:18px;color:${C.gris};">CEO de BROKERGY · Ingeniero colegiado nº 1779 COGITI</p></td></tr></table>`
            : '');

    return `<!DOCTYPE html>
<html lang="es" xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8"><meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<style>table,td,div,p,h1,span,a{font-family:Arial,Helvetica,sans-serif !important;}</style><![endif]-->
<title>${e(titulo)}</title>
</head>
<body style="margin:0;padding:0;background:${C.crema};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${e(preheader || titulo)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.crema}" style="background:${C.crema};">
<tr><td align="center" style="padding:32px 16px;">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">
<tr><td style="padding:0 4px 18px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    <td valign="middle"><img src="${base()}/logo_brokergy_dark.png" height="26" alt="BROKERGY" style="display:block;border:0;height:26px;width:auto;"></td>
    <td valign="middle" style="padding-left:10px;"><span style="${F}font-size:11px;line-height:14px;font-weight:800;letter-spacing:.13em;text-transform:uppercase;color:${C.gris};border-left:1px solid #d9d7d3;padding-left:10px;">${e(nombreApp())}</span></td>
  </tr></table>
</td></tr>
<tr><td height="4" bgcolor="${C.naranja}" style="height:4px;line-height:4px;font-size:0;background-color:${C.naranja};background-image:linear-gradient(90deg,#fca508 0%,#f5c53f 30%,#eee475 55%,#c7d54c 78%,#b5cf38 100%);border-radius:24px 24px 0 0;">&nbsp;</td></tr>
<tr><td bgcolor="#ffffff" style="background:#ffffff;border:1px solid ${C.linea};border-top:none;border-radius:0 0 24px 24px;padding:30px 32px 32px;">
${contenido}
</td></tr>
<tr><td align="center" style="padding:22px 16px 6px;"><p style="margin:0;${F}font-size:11px;line-height:17px;letter-spacing:.14em;text-transform:uppercase;font-weight:700;color:${C.gris2};">${e(nombreApp())} &copy; ${new Date().getFullYear()} · BROKERGY</p></td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;
}

/** El mismo mensaje en texto plano (para el `text` del email y el log en seco). */
function textoPlano({ titulo, saludo, parrafos = [], cifra, pasos, boton, boton2, nota }) {
    return [
        titulo, '', saludo, ...parrafos,
        cifra ? `${cifra.valor} ${cifra.texto}` : null,
        ...(pasos || []).map(([t, d], i) => `${i + 1}. ${t}: ${d}`),
        boton ? `${boton.label}: ${boton.href}` : '', boton2 ? `${boton2.label}: ${boton2.href}` : null, nota, '', nombreApp(),
    ].filter(v => v != null).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

module.exports = { avisarEquipo, avisarCertificador, avisarPersona, plantilla, textoPlano, activos };
