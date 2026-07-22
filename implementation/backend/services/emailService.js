const nodemailer = require('nodemailer');
const supabase = require('./supabaseClient');

/**
 * Servicio de email para Brokergy
 * Usa SMTP de Hostinger con la cuenta brokergy@brokergy.es
 */

// ─── Remitente configurable ──────────────────────────────────────────────────
// El nombre visible y la dirección del remitente se pueden editar desde la ficha
// de admin (tabla app_settings). Se autentica SIEMPRE con la cuenta SMTP de
// process.env (SMTP_USER): la dirección "from" debe ser de ese mismo dominio para
// que el correo no caiga en spam. Si no hay valor en BD, se usan los defaults.
const DEFAULT_FROM_NAME = process.env.EMAIL_FROM_NAME || 'BROKERGY · Ingeniería Energética';
const DEFAULT_FROM_ADDRESS = process.env.EMAIL_FROM || process.env.SMTP_USER || 'brokergy@brokergy.es';
const SENDER_TTL_MS = 60 * 1000;
let senderCache = null;
let senderCachedAt = 0;

async function getSender() {
    if (senderCache && (Date.now() - senderCachedAt) < SENDER_TTL_MS) return senderCache;
    let name = DEFAULT_FROM_NAME;
    let address = DEFAULT_FROM_ADDRESS;
    try {
        const { data } = await supabase
            .from('app_settings')
            .select('key, value')
            .in('key', ['email_from_name', 'email_from_address']);
        if (data) {
            const map = Object.fromEntries(data.map(r => [r.key, r.value]));
            if (map.email_from_name) name = map.email_from_name;
            if (map.email_from_address) address = map.email_from_address;
        }
    } catch (err) {
        console.error('[Email] No se pudo leer el remitente configurado, usando defaults:', err.message);
    }
    senderCache = { name, address };
    senderCachedAt = Date.now();
    return senderCache;
}

// Invalida la caché del remitente (se llama tras editar el ajuste en /api/settings)
function invalidateSenderCache() {
    senderCache = null;
    senderCachedAt = 0;
}

const escapeHtml = (str) => String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

// Filas de la ficha "Datos del cliente" que reciben los certificadores.
// La dirección de INSTALACIÓN y el domicilio del CLIENTE son cosas distintas:
// el domicilio solo se lista cuando difiere (`certClienteData` lo deja a null si no).
// `full` en false = versión reducida (encargo del CEE final, que ya se envió completa).
const clienteDataRows = (clienteData, { full = true } = {}) => {
    if (!clienteData) return [];
    const link = (href, txt, color) => `<a href="${href}" style="color:${color};text-decoration:none;">${escapeHtml(txt)}</a>`;
    const direccionInstalacion = clienteData.direccionInstalacion || clienteData.direccion;
    return [
        clienteData.nombre ? ['Nombre y apellidos', escapeHtml(clienteData.nombre)] : null,
        full && clienteData.dni ? ['DNI', escapeHtml(clienteData.dni)] : null,
        full && clienteData.tlf ? ['Teléfono', link(`tel:${escapeHtml(clienteData.tlf)}`, clienteData.tlf, BRAND.greenDark)] : null,
        full && clienteData.email ? ['Email', link(`mailto:${escapeHtml(clienteData.email)}`, clienteData.email, BRAND.greenDark)] : null,
        clienteData.refCatastral ? ['Referencia Catastral', escapeHtml(clienteData.refCatastral)] : null,
        direccionInstalacion ? ['Dirección de la instalación', escapeHtml(direccionInstalacion)] : null,
        clienteData.direccionCliente ? ['Domicilio del cliente', escapeHtml(clienteData.direccionCliente)] : null,
    ];
};

// Misma ficha, en texto plano (fallback de los clientes de correo sin HTML).
const clienteDataText = (clienteData) => {
    if (!clienteData) return '';
    const direccionInstalacion = clienteData.direccionInstalacion || clienteData.direccion;
    const rows = [
        clienteData.nombre ? `Cliente: ${clienteData.nombre}` : null,
        clienteData.dni ? `DNI: ${clienteData.dni}` : null,
        clienteData.tlf ? `Tlf: ${clienteData.tlf}` : null,
        clienteData.email ? `Email: ${clienteData.email}` : null,
        clienteData.refCatastral ? `Ref. Catastral: ${clienteData.refCatastral}` : null,
        direccionInstalacion ? `Dirección de la instalación: ${direccionInstalacion}` : null,
        clienteData.direccionCliente ? `Domicilio del cliente: ${clienteData.direccionCliente}` : null,
    ].filter(Boolean);
    return rows.length ? rows.join('\n') + '\n\n' : '';
};

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.hostinger.com',
    port: parseInt(process.env.SMTP_PORT || '465'),
    secure: true, // SSL
    auth: {
        user: process.env.SMTP_USER || 'brokergy@brokergy.es',
        pass: process.env.SMTP_PASS,
    },
    tls: {
        rejectUnauthorized: false // Para evitar problemas con certificados en desarrollo
    }
});

// ─── Transporters dedicados (enviar-como) ────────────────────────────────────
// Hostinger NO deja que la cuenta SMTP principal (brokergy@) ponga un `From:` de
// otra dirección del dominio: rechaza el envío ("all recipients were rejected").
// Para enviar REALMENTE desde otra dirección (p.ej. el correo al S.O. desde
// franciscojavier.moya@brokergy.es) hay que autenticarse con ESE buzón. Aquí se
// crea un transporter dedicado por cuenta configurada vía env; si no hay
// credenciales, no se crea y el `from` de esa dirección cae a la cuenta principal.
const altTransporters = {};
if (process.env.LOTE_SO_SMTP_USER && process.env.LOTE_SO_SMTP_PASS) {
    altTransporters[process.env.LOTE_SO_SMTP_USER.toLowerCase()] = nodemailer.createTransport({
        host: process.env.LOTE_SO_SMTP_HOST || process.env.SMTP_HOST || 'smtp.hostinger.com',
        port: parseInt(process.env.LOTE_SO_SMTP_PORT || process.env.SMTP_PORT || '465'),
        secure: true,
        auth: { user: process.env.LOTE_SO_SMTP_USER, pass: process.env.LOTE_SO_SMTP_PASS },
        tls: { rejectUnauthorized: false },
    });
    console.log(`[Email] Transporter dedicado activo para ${process.env.LOTE_SO_SMTP_USER}`);
}

/**
 * Envía un email genérico
 */
const sendMail = async ({ to, cc, subject, html, text, attachments, replyTo, from: fromOverride }) => {
    const sender = await getSender();
    // Dirección "from" efectiva. Por defecto, el remitente configurado. `fromOverride`
    // (opcional) permite pedir otra dirección (p.ej. el correo al S.O.). Admite string
    // ("addr" o "Nombre <addr>") u objeto { name?, address }.
    let fromName = sender.name;
    let fromAddress = sender.address;
    if (typeof fromOverride === 'string' && fromOverride.trim()) {
        const m = fromOverride.match(/<([^>]+)>/);
        fromAddress = (m ? m[1] : fromOverride).trim();
        if (fromOverride.includes('<')) {
            const nm = fromOverride.split('<')[0].replace(/"/g, '').trim();
            if (nm) fromName = nm;
        }
    } else if (fromOverride && fromOverride.address) {
        fromAddress = fromOverride.address;
        if (fromOverride.name) fromName = fromOverride.name;
    }

    // Selección de transporter: si hay uno dedicado autenticado como `fromAddress`, se
    // usa (puede enviar como sí mismo). Si no, y la dirección NO es la de la cuenta SMTP
    // principal, se revierte al remitente principal para no provocar rechazo del SMTP
    // ("all recipients were rejected") por enviar-como no autorizado.
    const mainUser = (process.env.SMTP_USER || DEFAULT_FROM_ADDRESS).toLowerCase();
    const alt = altTransporters[fromAddress.toLowerCase()];
    let activeTransporter = transporter;
    if (alt) {
        activeTransporter = alt;
    } else if (fromAddress.toLowerCase() !== mainUser && fromAddress.toLowerCase() !== sender.address.toLowerCase()) {
        console.warn(`[Email] Sin cuenta SMTP dedicada para "${fromAddress}"; se envía desde ${sender.address}. Configura LOTE_SO_SMTP_USER/PASS para enviar realmente desde esa dirección.`);
        fromAddress = sender.address;
        fromName = sender.name;
    }
    const from = `"${fromName}" <${fromAddress}>`;

    // `cc` admite string o array. Se descartan los vacíos y los que ya estén en `to`,
    // para no mandar el mismo correo dos veces a la misma persona.
    const toList = (Array.isArray(to) ? to : [to]).filter(Boolean).map(e => String(e).trim().toLowerCase());
    const ccList = (Array.isArray(cc) ? cc : [cc])
        .filter(Boolean)
        .map(e => String(e).trim())
        .filter(e => !toList.includes(e.toLowerCase()));

    try {
        const info = await activeTransporter.sendMail({
            from,
            to,
            cc: ccList.length ? ccList : undefined,
            replyTo: replyTo || undefined,
            subject,
            html,
            text: text || subject,
            attachments
        });
        console.log(`[Email] Enviado a ${to}${ccList.length ? ` (cc: ${ccList.join(', ')})` : ''}: ${info.messageId}`);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error(`[Email] Error enviando a ${to}: [${error.code}] ${error.message}`);
        if (error.response) console.error(`[Email] SMTP response: ${error.response}`);
        throw error;
    }
};

const verifySmtp = () => transporter.verify();

/**
 * Envía email de recuperación de contraseña con plantilla HTML Brokergy
 */
const sendPasswordResetEmail = async (to, resetLink, userName) => {
    const subject = 'Recupera tu contraseña — Brokergy';
    
    const html = brandEmailShell({
        preheader: 'Restablece la contraseña de tu cuenta Brokergy.',
        title: 'Recupera tu contraseña',
        pill: null,
        contentHtml:
            (userName ? emailP(`Hola <strong>${escapeHtml(userName.toUpperCase())}</strong>,`) : '') +
            emailP('Hemos recibido una solicitud para restablecer la contraseña de tu cuenta en Brokergy. Si no realizaste esta solicitud, simplemente ignora este correo.', { color: BRAND.muted }) +
            `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 22px;"><tr><td align="center">${emailButton(resetLink, 'Restablecer Contraseña')}</td></tr></table>` +
            emailBox(
                emailP('⏳ Este enlace expira en <strong>1 hora</strong>.', { size: 13, color: BRAND.muted, mb: 0, center: true }),
                { mb: 18 }
            ) +
            emailP(`Si el botón no funciona, copia y pega este enlace en tu navegador:<br><a href="${resetLink}" style="color:${BRAND.greenDark};text-decoration:none;word-break:break-all;">${resetLink}</a>`, { size: 12, color: BRAND.muted, mb: 0, center: true }),
        footerNote: `Brokergy Analytics &copy; ${new Date().getFullYear()}`,
    });

    const text = `Recuperar Contraseña — Brokergy\n\n${userName ? `Hola ${userName},\n\n` : ''}Hemos recibido una solicitud para restablecer tu contraseña. Haz clic en el siguiente enlace:\n\n${resetLink}\n\nEste enlace expira en 1 hora.\n\nSi no solicitaste este cambio, ignora este correo.\n\nBrokergy Analytics`;

    return sendMail({ to, subject, html, text });
};

/**
 * Envía un resumen de propuesta al lead cuando elige "enviar por email"
 * en el funnel público. No requiere PDF, solo los números clave.
 */
const sendLeadSummaryEmail = async ({
    to, nombre, idOportunidad,
    cae = 0, irpf = 0, neta = 0, ahorro = 0,
    uploadLink = null,
    type = 'completa', isReforma = false,
    fuelLabel = null, co2 = 0,
    presupuestoEstimado = false, partner = null,
    edadCaldera = null, timeline = null,
}) => {
    const { productNoun, fuelDependPhrase, urgencyLine, presupuestoNote, AHORRO_LOW_THRESHOLD } = require('./leadMessages');
    const fmtEur = (n) => `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0, useGrouping: 'always' }).format(Math.abs(Number(n) || 0))} €`;
    const primerNombre = (nombre || '').split(' ')[0] || 'cliente';
    const total = Number(cae) + Number(irpf);
    const esSuave = type === 'suave';
    const prod = productNoun(isReforma);            // 'tu reforma' | 'el cambio a aerotermia'
    const partnerName = partner && partner.nombre ? partner.nombre : null;
    // El cliente es del instalador → el contacto del email es el del instalador.
    const partnerContact = partnerName
        ? [partner.tel, partner.email || 'info@brokergy.es'].filter(Boolean).join(' · ')
        : null;

    // Asunto según tipo / co-branding
    const subject = esSuave
        ? `Hemos recibido tu solicitud — ${idOportunidad}`
        : (partnerName
            ? `Tu propuesta de ayudas con ${partnerName} — ${idOportunidad}`
            : `Tu propuesta de ayudas — ${idOportunidad}`);

    const cobrandHeader = partnerName
        ? emailP(`en colaboración con <strong style="color:${BRAND.orangeDark};">${escapeHtml(partnerName)}</strong>`, { size: 13, color: BRAND.muted, mb: 16, center: true })
        : '';

    const subtitle = esSuave
        ? `Hemos recibido tu solicitud para ${prod}`
        : (isReforma ? 'Tu estimación de ayudas por la reforma' : 'Tu estimación de ayudas energéticas');

    // ── Bloque de cifras (solo propuesta completa) ──
    const ahorroLabel = isReforma ? 'Ahorro en factura' : 'Ahorro en calefacción';
    const showAhorro = Number(ahorro) >= AHORRO_LOW_THRESHOLD;
    const urg = urgencyLine(edadCaldera, timeline);

    const cifrasBlock = esSuave ? '' : (
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:22px;"><tr>
           <td width="48%" valign="top" style="background:${BRAND.greenTint};border:1px solid ${BRAND.green};border-radius:12px;padding:16px;text-align:center;">
             <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:${BRAND.greenDark};margin-bottom:6px;">Ayuda total estimada</div>
             <div style="font-size:26px;font-weight:800;color:${BRAND.greenDark};">${fmtEur(total)}</div>
             <div style="font-size:10px;color:${BRAND.greenDark};margin-top:4px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">incluye CAE${Number(irpf) > 0 ? ' + IRPF' : ''}</div>
           </td>
           <td width="4%"></td>
           <td width="48%" valign="top" style="background:${BRAND.orangeTint};border:1px solid ${BRAND.orange};border-radius:12px;padding:16px;text-align:center;">
             <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:${BRAND.orangeDark};margin-bottom:6px;">Tu inversión neta</div>
             <div style="font-size:26px;font-weight:800;color:${BRAND.orangeDark};">${fmtEur(neta)}${presupuestoEstimado ? '<span style="font-size:15px;">*</span>' : ''}</div>
             <div style="font-size:10px;color:${BRAND.orangeDark};margin-top:4px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">tras todas las ayudas</div>
           </td>
         </tr></table>` +
        (presupuestoEstimado ? emailP(`* ${escapeHtml(presupuestoNote(partner))}`, { size: 11, color: BRAND.muted, mb: 18 }) : '') +
        emailBox(
            emailDataTable([
                ['Bono Energético CAE', `<span style="color:${BRAND.greenDark};">${fmtEur(cae)}</span>`],
                Number(irpf) > 0 ? ['Deducción en el IRPF', `<span style="color:${BRAND.greenDark};">${fmtEur(irpf)}</span>`] : null,
                showAhorro ? [ahorroLabel, `${fmtEur(ahorro)}/año`] : null,
                ['Ayuda total estimada', `<span style="color:${BRAND.greenDark};">${fmtEur(total)}</span>`],
            ]),
            { mb: showAhorro && !urg ? 22 : 12 }
        ) +
        (!showAhorro ? emailP(`Además, ganas en confort estable todo el año y dejas de depender ${fuelDependPhrase(fuelLabel)} y de sus subidas de precio.`, { size: 12, color: BRAND.muted, mb: urg ? 10 : 22 }) : '') +
        (urg ? emailP(urg, { size: 12, color: BRAND.orangeDark, mb: 22 }) : '')
    );

    // ── Bloque suave (mensaje sin cifras) ──
    const suaveBlock = esSuave ? emailBox(
        emailP('Un técnico revisará tu expediente', { bold: true, mb: 8, center: true }) +
        emailP('Lo estudiará un especialista y te contactará lo antes posible para darte una propuesta de ayudas a tu medida.', { size: 13, color: BRAND.muted, mb: 0, center: true }),
        { bg: BRAND.orangeTint, border: BRAND.orange, mb: 22 }
    ) : '';

    const uploadBlock = uploadLink ? emailBox(
        emailP(`📸 ${esSuave ? 'Adelanta el proceso' : 'Ayúdanos a afinar tu propuesta'}`, { bold: true, mb: 6, center: true }) +
        emailP('Sube algunas fotos de tu vivienda e instalación actual. 2 minutos desde el móvil.', { size: 12, color: BRAND.muted, mb: 14, center: true }) +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">${emailButton(uploadLink, 'Subir fotos y documentos')}</td></tr></table>`,
        { bg: BRAND.greenTint, border: BRAND.green, mb: 22 }
    ) : '';

    const nextStepBlock = emailBox(
        (esSuave ? '' : emailP('Un técnico de Brokergy revisará tu expediente y te contactará en breve con la propuesta definitiva.', { size: 13, color: BRAND.muted, mb: 6, center: true })) +
        emailP(`Ref: <strong style="color:${BRAND.orangeDark};font-family:monospace;">${escapeHtml(idOportunidad)}</strong>`, { size: 11, color: BRAND.muted, mb: 0, center: true }),
        { bg: BRAND.orangeTint, border: BRAND.orange, mb: 0 }
    );

    const html = brandEmailShell({
        preheader: subtitle,
        title: 'Tu simulación',
        pill: esSuave ? PILL.neutral('Solicitud recibida') : PILL.info('Estimación de ayudas'),
        contentHtml:
            cobrandHeader +
            emailP(`¡Hola, ${escapeHtml(primerNombre)}!`, { size: 18, bold: true, mb: 6 }) +
            emailP(subtitle, { color: BRAND.muted, mb: 22 }) +
            cifrasBlock + suaveBlock + uploadBlock + nextStepBlock,
        footerNote: (partnerName ? `en colaboración con ${escapeHtml(partnerName)}${partnerContact ? ' · ' + escapeHtml(partnerContact) : ''}<br>` : '') + 'Estimación teórica sujeta a verificación técnica.',
    });

    const text = esSuave
        ? `Hemos recibido tu solicitud para ${prod}.\n\nHola ${primerNombre},\n\nUn técnico revisará tu expediente y te contactará lo antes posible para darte una propuesta de ayudas a tu medida.\n${uploadLink ? `\nPuedes adelantar el proceso subiendo fotos aquí: ${uploadLink}\n` : ''}\nRef: ${idOportunidad}\n\nBrokergy · brokergy.es`
        : `Tu propuesta de Brokergy${partnerName ? ` (en colaboración con ${partnerName})` : ''}\n\nHola ${primerNombre},\n\nAquí tienes tu estimación de ayudas para ${prod}:\n\nBono CAE: ${fmtEur(cae)}\n${Number(irpf) > 0 ? `Deducción IRPF: ${fmtEur(irpf)}\n` : ''}Ayuda total: ${fmtEur(total)}\nTu inversión neta: ${fmtEur(neta)}\n${showAhorro ? `${ahorroLabel}: ${fmtEur(ahorro)}/año\n` : ''}${presupuestoEstimado ? `\n${presupuestoNote(partner)}\n` : ''}\nRef: ${idOportunidad}\n\nBrokergy · brokergy.es`;

    return sendMail({ to, subject, html, text, replyTo: partner && partner.email ? partner.email : undefined });
};

/**
 * Envía la propuesta en PDF al cliente por correo
 */
const sendProposalEmail = async ({ to, userName, pdfBuffer, tableImageBase64, summaryData, customMessage = null }) => {
    const isB2B = summaryData.mode === 'PARTNER' || summaryData.mode === 'INSTALADOR';
    // Mensaje editado en el popup de envío (homogéneo con anexos). Si viene, se muestra
    // como intro antes del resumen, con *negritas* estilo WhatsApp.
    const customMessageHtml = customMessage
        ? emailP(escapeHtml(customMessage).replace(/\*(.*?)\*/g, '<b>$1</b>'), { pre: true, mb: 22 })
        : '';
    // Saludo/intro por defecto (cuando no hay mensaje editado). Si hay customMessage, ese texto lo sustituye.
    const greetingHtml = customMessage ? customMessageHtml : (
        emailP(`¡Hola, ${escapeHtml(userName || (isB2B ? 'equipo' : 'cliente'))}!`, { size: 20, bold: true, mb: 20 }) +
        (isB2B ? emailP(`Te adjuntamos la propuesta de ayudas para el expediente de vuestro cliente <strong>${escapeHtml(summaryData.clienteName || '')}</strong> (Exp. ${escapeHtml(summaryData.id)}).`, { color: BRAND.muted }) : '')
    );
    const subject = isB2B
        ? `Propuesta cliente ${summaryData.clienteName || ''} [Exp. ${summaryData.id}] — Brokergy`
        : `Propuesta Bono Energético CAE — Brokergy (${summaryData.id})`;

    // Si tenemos imagen de la tabla, la adjuntamos como CID
    const attachments = [
        {
            filename: `Propuesta_Brokergy_${summaryData.id}.pdf`,
            content: pdfBuffer
        }
    ];

    let tableHtml = summaryData.htmlTable || '';
    
    // Si tenemos imagen de la tabla (captura real), la adjuntamos y la mostramos DESPUÉS o EN VEZ DE
    if (tableImageBase64 && tableImageBase64.includes('base64')) {
        attachments.push({
            filename: 'resumen-ahorro.png',
            content: tableImageBase64.split('base64,')[1],
            encoding: 'base64',
            cid: 'summary-table'
        });
        // Si hay captura real, la preferimos sobre el HTML generado (es más fiel)
        tableHtml = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 22px;"><tr><td style="border-radius:12px;overflow:hidden;border:1px solid ${BRAND.border};"><img src="cid:summary-table" alt="Resumen Ahorro" style="width:100%;display:block;"></td></tr></table>`;
    }

    const proposalUrl = `${process.env.FRONTEND_URL || 'https://app.brokergy.es'}/api/public/propuesta/${summaryData.urlId || summaryData.id}`;
    const firmaUrl = `${process.env.FRONTEND_URL || 'https://app.brokergy.es'}/firma/${summaryData.urlId || summaryData.id}`;

    const casosHtml = summaryData.isBoth ? (
        emailP('Tal y como acordamos, te adjunto la simulación de las ayudas para tu proyecto, presentando las siguientes opciones para tu vivienda:', { color: BRAND.muted, mb: 20 }) +
        emailBox(
            emailP('Opción 1: Solo aerotermia', { size: 13, bold: true, color: BRAND.orangeDark, mb: 10 }) +
            emailP(`Ayuda directa Bono CAE de <strong>${summaryData.fAero.caeBonus}</strong>. Sumando deducciones IRPF (${summaryData.fAero.irpfDeduction}), alcanzarías un total de:`, { size: 14, color: BRAND.muted, mb: 12 }) +
            emailP(summaryData.fAero.totalAyuda, { size: 20, bold: true, mb: 0 }),
            { mb: 15 }
        ) +
        emailBox(
            emailP('Opción 2: Mejora de envolvente', { size: 13, bold: true, color: BRAND.orangeDark, mb: 10 }) +
            emailP(`En este caso, la ayuda del Bono CAE asciende a <strong>${summaryData.f80.caeBonus}</strong>. Sumando las deducciones del IRPF (${summaryData.f80.irpfDeduction}), el total llegaría a:`, { size: 14, color: BRAND.muted, mb: 12 }) +
            emailP(summaryData.f80.totalAyuda, { size: 24, bold: true, color: BRAND.orangeDark, mb: 0 }),
            { bg: BRAND.orangeTint, border: BRAND.orange, mb: 22 }
        )
    ) : summaryData.isOnlyReforma ? (
        emailP('Tal y como acordamos, te adjunto la simulación de las ayudas para tu expediente de Reforma Energética, donde detallamos los ahorros que puedes obtener.', { color: BRAND.muted, mb: 15 }) +
        emailP(`🔹 <strong>Bono Energético:</strong> Podrías obtener una ayuda de <strong style="color:${BRAND.orangeDark};font-size:19px;">${summaryData.f80.caeBonus}</strong> gestionada a través de BROKERGY.`, { color: BRAND.muted, mb: 15 }) +
        emailP(`Además, el importe estimado de deducciones en el IRPF sería de <strong style="color:${BRAND.greenDark};">${summaryData.f80.irpfDeduction}</strong>.`, { color: BRAND.muted, mb: 15 }) +
        emailBox(
            emailP('Resumen total de ayudas', { size: 13, bold: true, color: BRAND.orangeDark, center: true, mb: 5 }) +
            emailP(`Hasta ${summaryData.f80.totalAyuda}`, { size: 30, bold: true, center: true, mb: 0 }),
            { bg: BRAND.orangeTint, border: BRAND.orange, mb: 22 }
        )
    ) : (
        emailP('Ya hemos podido realizar los cálculos de las ayudas a las que puedes optar para tu instalación de aerotermia.', { color: BRAND.muted, mb: 15 }) +
        emailP(`🔹 <strong>Bono Energético:</strong> Podrías obtener una ayuda de <strong style="color:${BRAND.orangeDark};font-size:19px;">${summaryData.caeBonus}</strong> gracias al Bono Energético BROKERGY.`, { color: BRAND.muted, mb: 15 }) +
        emailP(`Además, si en tu caso puedes acogerte a las deducciones en el IRPF, el importe estimado sería de <strong style="color:${BRAND.greenDark};">${summaryData.irpfDeduction}</strong>.`, { color: BRAND.muted, mb: 15 }) +
        emailBox(
            emailP('Resumen total de ayudas', { size: 13, bold: true, color: BRAND.orangeDark, center: true, mb: 5 }) +
            emailP(`Hasta ${summaryData.totalAyuda}`, { size: 30, bold: true, center: true, mb: 0 }),
            { bg: BRAND.orangeTint, border: BRAND.orange, mb: 22 }
        )
    );

    const irpfNote = !isB2B
        ? emailP('💡 Recordatorio: Para las deducciones del IRPF debes contar con retenciones aplicables. Nosotros dejaremos toda la parte técnica preparada para tu solicitud.', { size: 13, color: BRAND.muted, mb: 22 })
        : '';

    const pasosHtml = `<h3 style="margin:8px 0 12px;font-size:16px;font-weight:700;color:${BRAND.text};">Pasos a seguir:</h3>` +
        (isB2B
            ? `<ul style="margin:0 0 18px;padding:0 0 0 20px;font-size:14px;line-height:1.8;color:${BRAND.muted};"><li>El cliente debe <strong>aceptar el presupuesto de instalación</strong>.</li><li>El cliente debe <strong>aceptar la propuesta</strong> adjunta en PDF. Es vital presentar el CEE Inicial antes de cualquier factura para no perder las ayudas.</li></ul>` + emailP('Podéis compartir este enlace de firma directamente con el cliente:', { size: 14, color: BRAND.muted })
            : `<ul style="margin:0 0 18px;padding:0 0 0 20px;font-size:14px;line-height:1.8;color:${BRAND.muted};"><li><strong>Aceptar el presupuesto</strong> al instalador.</li><li><strong>Aceptar la propuesta</strong> adjunta en PDF. Es vital presentar el Certificado Inicial antes de cualquier factura para asegurar las deducciones fiscales.</li></ul>`);

    const botonesHtml = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:22px;"><tr><td align="center" style="padding-bottom:12px;">${emailButton(proposalUrl, '📄 Ver propuesta online', BRAND.orange)}</td></tr><tr><td align="center">${emailButton(firmaUrl, `✍️ ${isB2B ? 'Enlace de firma para el cliente' : 'Aceptar y firmar'}`)}</td></tr></table>`;

    const html = brandEmailShell({
        preheader: isB2B ? `Propuesta para ${summaryData.clienteName || 'vuestro cliente'} (Exp. ${summaryData.id}).` : 'Aquí tienes tu propuesta de ayudas energéticas.',
        title: 'Tu propuesta',
        pill: PILL.info('Propuesta de ayudas'),
        contentHtml:
            greetingHtml + casosHtml + irpfNote + tableHtml + pasosHtml + botonesHtml +
            emailP(`Quedo a ${isB2B ? 'vuestra' : 'tu'} disposición para cualquier duda o aclaración.`, { size: 14, color: BRAND.muted, center: true, mb: 0 }),
        footerNote: `<a href="https://brokergy.es" style="color:${BRAND.greenDark};text-decoration:none;">brokergy.es</a>`,
    });

    const text = isB2B
        ? `¡Hola, ${userName}!\n\nAdjuntamos la propuesta para vuestro cliente ${summaryData.clienteName || ''} (Exp. ${summaryData.id}).\n\nEnlace de firma para el cliente: ${process.env.FRONTEND_URL || 'https://app.brokergy.es'}/firma/${summaryData.urlId || summaryData.id}\n\nBROKERGY · Ingeniería Energética`
        : `¡Hola, ${userName}!\n\nYa hemos calculado las ayudas para tu instalación de aerotermia.\n\n🔹 Bono Energético CAE: ${summaryData.caeBonus}\n🔹 Deducciones IRPF: ${summaryData.irpfDeduction}\n\nResumen total ayudas: Hasta ${summaryData.totalAyuda}\n\nPasos a seguir:\n1. Aceptar presupuesto al instalador.\n2. Aceptar propuesta adjunta.\n\n📄 Ver propuesta online:\n${process.env.FRONTEND_URL || 'https://app.brokergy.es'}/api/public/propuesta/${summaryData.urlId || summaryData.id}\n\nPuedes firmar directamente aquí: ${process.env.FRONTEND_URL || 'https://app.brokergy.es'}/firma/${summaryData.urlId || summaryData.id}\n\nQuedo a tu disposición.\n\nBROKERGY · Ingeniería Energética`;

    return sendMail({ to, subject, html, text, attachments });
};

/**
 * Envía el email de confirmación tras recibir la aceptación de la propuesta
 */
const sendAcceptanceNotificationEmail = async ({ to, userName, numeroExpediente, uploadLink }) => {
    const subject = `Aceptación recibida [Exp ${numeroExpediente || ''}] — Brokergy`;

    const whatsAppLink = `https://wa.me/34623926179?text=${encodeURIComponent(`Hola, soy ${userName}. Mi número de expediente es ${numeroExpediente || 'A consultar'}. Aquí envío la documentación solicitada.`)}`;

    const html = brandEmailShell({
        preheader: 'Hemos recibido la aceptación de tu propuesta.',
        title: 'Aceptación recibida',
        pill: PILL.success('Aceptación recibida'),
        contentHtml:
            emailP(`¡Hola, ${escapeHtml(userName || 'cliente')}!`, { size: 20, bold: true, mb: 20 }) +
            emailP('Hemos recibido correctamente la aceptación de tu propuesta. <strong>Muchas gracias por confiar en Brokergy.</strong>', { color: BRAND.muted, mb: 15 }) +
            (numeroExpediente ? emailBox(emailP(`Tu número de expediente asignado es: <strong style="color:${BRAND.orangeDark};">${escapeHtml(numeroExpediente)}</strong>`, { mb: 0 }), { bg: BRAND.orangeTint, border: BRAND.orange, mb: 22 }) : '') +
            emailP('A partir de este momento, uno de nuestros certificadores comenzará a preparar el <strong>Certificado de Eficiencia Energética inicial</strong>. Es muy importante que este certificado quede emitido y registrado <strong>antes de la última factura de la obra</strong>, ya que, de lo contrario, podrían surgir problemas para aplicar las deducciones fiscales. Además, este documento es necesario para tramitar correctamente tu expediente CAE.', { color: BRAND.muted, mb: 22 }) +
            emailBox(
                emailP('📁 Documentación previa necesaria', { size: 14, bold: true, color: BRAND.orangeDark, mb: 12 }) +
                `<ul style="margin:0;padding:0 0 0 18px;font-size:14px;line-height:1.8;color:${BRAND.muted};"><li>Planos de la vivienda o croquis de distribución.</li><li>Foto general de la caldera existente.</li><li>Foto de la placa de características de la caldera, bien legible.</li><li>Si la caldera ya no está instalada, fotos del hueco donde estaba.</li><li>Fotos de los radiadores (al menos uno por estancia) o del colector, si hay suelo radiante.</li><li>Vídeo corto recorriendo la vivienda, mostrando estancias, ventanas, puertas y accesos al exterior.</li><li>Fotos de las fachadas o paredes exteriores, incluyendo ventanas y puertas.</li><li>Si vas a cambiar ventanas o mejorar aislamiento, fotos y presupuesto.</li></ul>`,
                { mb: 22 }
            ) +
            emailP('No hace falta que nos lo envíes todo de una sola vez; puedes mandarlo poco a poco conforme lo vayas recopilando.', { size: 14, color: BRAND.muted, mb: 15 }) +
            emailP('<strong>Importante:</strong> procura que las fotos tengan buena luz y que las placas de características se vean perfectamente, para evitar retrasos en la tramitación.', { size: 14, color: BRAND.orangeDark, mb: 22 }) +
            `<h3 style="margin:8px 0 15px;font-size:16px;font-weight:700;color:${BRAND.text};">Puedes enviarlo por:</h3>` +
            (uploadLink ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;"><tr><td align="center">${emailButton(uploadLink, '📂 Subir documentación aquí')}</td></tr></table>` : '') +
            `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:22px;"><tr>
               <td width="48%" style="background:${BRAND.soft};border:1px solid ${BRAND.border};border-radius:10px;padding:15px;text-align:center;">
                 <div style="font-size:11px;text-transform:uppercase;color:${BRAND.muted};font-weight:800;margin-bottom:5px;">Email</div>
                 <a href="mailto:info@brokergy.es?subject=${encodeURIComponent(`Documentación Expediente ${numeroExpediente || ''}`)}" style="color:${BRAND.text};text-decoration:none;font-weight:700;font-size:14px;">info@brokergy.es</a>
               </td>
               <td width="4%"></td>
               <td width="48%" style="background:${BRAND.greenTint};border:1px solid ${BRAND.green};border-radius:10px;padding:15px;text-align:center;">
                 <div style="font-size:11px;text-transform:uppercase;color:${BRAND.greenDark};font-weight:800;margin-bottom:5px;">WhatsApp</div>
                 <a href="${whatsAppLink}" style="color:${BRAND.text};text-decoration:none;font-weight:700;font-size:14px;">623 926 179</a>
               </td>
             </tr></table>` +
            emailP('En cuanto recibamos la documentación, continuaremos con la tramitación de tu expediente.', { size: 14, color: BRAND.muted, center: true, mb: 0 }),
        footerNote: `Un saludo, Equipo BROKERGY · <a href="https://brokergy.es" style="color:${BRAND.greenDark};text-decoration:none;">brokergy.es</a>`,
    });

    const text = `¡Hola, ${userName}!\n\nHemos recibido correctamente la aceptación de tu propuesta. Muchas gracias.\n\n${numeroExpediente ? `Tu número de expediente es: ${numeroExpediente}\n\n` : ''}A partir de ahora, comenzaremos a preparar el Certificado de Eficiencia Energética inicial.\n\nNecesitamos que nos envíes la siguiente documentación:\n- Planos o croquis.\n- Fotos de la caldera y su placa.\n- Fotos de radiadores/colector.\n- Vídeo corto de la vivienda.\n- Fotos de fachadas y ventanas.\n\n${uploadLink ? `Puedes subir tu documentación directamente aquí:\n${uploadLink}\n\nO también p` : `P`}uedes enviarlo por:\nEmail: info@brokergy.es\nWhatsApp: 623 926 179\n\nUn saludo,\nEquipo BROKERGY`;

    return sendMail({ to, subject, html, text });
};

/**
 * Envía anexos (Anexo I, Anexo Cesión, etc.) por correo
 */
const sendAnnexEmail = async ({ to, cc, userName, attachments, customMessage, summaryData, from }) => {
    const docType = summaryData?.docType || 'Documentación';
    const subject = `${docType} — Brokergy (${summaryData.id})`;
    
    // Extraer el enlace de firma para renderizarlo como BOTÓN centrado (no texto).
    const firmaUrl = (customMessage || '').match(/https?:\/\/[^\s]+/)?.[0] || null;
    const bodyMsg = firmaUrl ? String(customMessage).replace(firmaUrl, '').replace(/\n{3,}/g, '\n\n').trim() : customMessage;
    // Convertir formato WhatsApp (*bold*) a HTML (<b>bold</b>)
    const formattedMessage = bodyMsg ? escapeHtml(bodyMsg).replace(/\*(.*?)\*/g, '<b>$1</b>') : null;
    const attachCount = Array.isArray(attachments) ? attachments.length : 0;
    const firmaButton = firmaUrl
        ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 22px 0;"><tr><td align="center">${emailButton(firmaUrl, '🖊️ Firmar / subir mis anexos', BRAND.orange)}</td></tr></table>`
        : '';

    const html = brandEmailShell({
        preheader: `${docType} de tu expediente ${summaryData.id}.`,
        title: docType,
        pill: PILL.info('Documentación'),
        contentHtml:
            emailP(formattedMessage || `Hola, ${escapeHtml(userName || 'cliente')}. Adjuntamos la documentación solicitada relativa a tu expediente ${escapeHtml(summaryData.id)}.`, { pre: true, mb: firmaButton ? 8 : 22 }) +
            firmaButton +
            (attachCount ? emailP(`📎 Se adjunta${attachCount > 1 ? 'n' : ''} ${attachCount} archivo(s) a este correo.`, { size: 12, color: BRAND.muted, center: true, mb: 22 }) : '') +
            emailP('Quedamos a tu disposición para cualquier duda o aclaración.', { size: 13, color: BRAND.muted, center: true, mb: 0 }),
        footerNote: `<a href="https://brokergy.es" style="color:${BRAND.greenDark};text-decoration:none;">brokergy.es</a>`,
    });

    const text = customMessage || `Hola ${userName},\n\nAdjuntamos la documentación solicitada (${docType}) para tu expediente ${summaryData.id}.\n\nQuedamos a tu disposición.\n\nBROKERGY · Ingeniería Energética`;

    return sendMail({ to, cc, subject, html, text, attachments, from });
};

/**
 * Notifica a la administración (ADMIN) de que un distribuidor ha aceptado una oportunidad.
 */
const sendAdminNotificationEmail = async ({ numeroExpediente, clientName, address, distributorName, installerName, notes, expedienteId }) => {
    const to = 'franciscojavier.moya.s2e2@gmail.com';
    const subject = `${numeroExpediente || 'S/N'} – ACEPTACION DE EXPEDIENTE`;
    const deepLink = `${process.env.FRONTEND_URL || 'https://app.brokergy.es'}?exp=${numeroExpediente || ''}`;

    const html = brandEmailShell({
        preheader: `${clientName || 'Un cliente'} ha aceptado la propuesta — expediente ${numeroExpediente || 'nuevo'}.`,
        title: 'Aceptación de expediente',
        pill: PILL.success('Expediente aceptado'),
        contentHtml:
            emailP('¡Hola BROKERGY! 👋', { size: 16, mb: 20 }) +
            emailP(`El cliente <strong>${escapeHtml(clientName || 'S/N')}</strong> ha firmado y aceptado la propuesta desde el portal público. Se ha generado un nuevo expediente automáticamente.`, { color: BRAND.muted, mb: 22 }) +
            emailBox(emailDataTable([
                ['Expediente', `<span style="color:${BRAND.orangeDark};">${escapeHtml(numeroExpediente || 'PENDIENTE')}</span>`],
                ['Cliente', escapeHtml(clientName || 'S/N')],
                ['Dirección', escapeHtml(address || 'S/N')],
                ['Instalador', escapeHtml(installerName || 'No asignado')],
                notes ? ['Notas', `<em>"${escapeHtml(notes)}"</em>`] : null,
            ]), { mb: 22 }) +
            emailP('Debes ponerte en contacto con el cliente para iniciar el expediente para realizar el Certificado de Eficiencia Energética.', { color: BRAND.muted, mb: 22 }) +
            `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">${emailButton(deepLink, '🚀 Gestionar expediente', BRAND.orange)}</td></tr></table>`,
        footerNote: 'Sistema Automático Brokergy',
    });

    const text = `ACEPTACIÓN DE EXPEDIENTE: ${numeroExpediente}\n\nDistribuidor: ${distributorName}\nCliente: ${clientName}\nDirección: ${address}\nInstalador: ${installerName}\n\nAcceso directo: ${deepLink}`;

    return sendMail({ to, subject, html, text });
};

const sendCertificadorNotificationEmail = async ({
    to, certName, expedienteNum, clienteName, clienteData,
    ficha, tipoActuacion,
    ceeFolderLink, portalLink, ackLink,
    // RES060/RES093
    demandaPerM2,       // kWh/m²·año (q_net)
    superficieRef,      // m²
    // RES080
    ahorroObjetivo,     // kWh/año
    // Prioridad y mensaje libre del admin
    priority = 'normal',
    adminMessage = null,
    // Cuerpo del mensaje totalmente editado en el modal (sustituye al saludo + intro)
    customMessage = null,
}) => {
    const isReforma = ficha === 'RES080';
    const tipoLabel = tipoActuacion || (isReforma ? 'REFORMA' : ficha === 'RES093' ? 'HIBRIDACIÓN' : 'AEROTERMIA');
    const clienteUpper = (clienteName || '').toUpperCase().trim();
    const isUrgent = priority === 'urgent';
    const subject = `${isUrgent ? '🚨 URGENTE — ' : ''}“${expedienteNum} ENCARGO CEE (${tipoLabel}) – “${clienteUpper}”`;

    const adminMessageHtml = (adminMessage && !customMessage) ? emailBox(
        emailP('💬 Mensaje de Brokergy', { size: 11, bold: true, color: BRAND.orangeDark, mb: 8 }) +
        emailP(escapeHtml(adminMessage), { size: 14, pre: true, mb: 0 }),
        { bg: BRAND.orangeTint, border: BRAND.orange, mb: 22 }
    ) : '';

    // Bloque de saludo + introducción. Si el admin ha editado el mensaje en el modal,
    // ese texto sustituye al saludo/intro por defecto (manteniendo el resto de la plantilla).
    const introBlockHtml = customMessage
        ? emailP(escapeHtml(customMessage), { pre: true, mb: 16 })
        : (
            emailP(`Hola ${escapeHtml(certName || 'técnico')}!`, { size: 19, bold: true, mb: 6 }) +
            emailP(`Te asignamos el expediente <strong style="color:${BRAND.orangeDark};">${escapeHtml(expedienteNum)}</strong>${clienteName ? ` del cliente <strong>${escapeHtml(clienteName)}</strong>` : ''} para la emisión del Certificado de Eficiencia Energética.`, { color: BRAND.muted, mb: 16 }) +
            emailP('A continuación encontrarás las <strong>directrices técnicas</strong> que debes tener en cuenta para que los valores del certificado sean compatibles con la propuesta comercial presentada al cliente:', { color: BRAND.muted, mb: 22 })
        );

    const directrizHtml = isReforma ? emailBox(
        emailP('⚡ Directriz Técnica — RES080', { size: 11, bold: true, color: BRAND.orangeDark, mb: 6 }) +
        emailP(`Para garantizar el éxito del expediente, el ahorro energético certificado debe situarse, como <strong>objetivo de seguridad</strong>, <strong>por encima</strong> de los <strong style="color:${BRAND.orangeDark};">${ahorroObjetivo ? Math.round(ahorroObjetivo).toLocaleString('es-ES') + ' kWh/año' : '—'}</strong> estimados en la propuesta comercial.`, { size: 14, color: BRAND.muted, mb: 12 }) +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
           <td width="${demandaPerM2 ? '48%' : '100%'}" valign="top" style="background:${BRAND.card};border:1px solid ${BRAND.border};border-radius:8px;padding:14px;text-align:center;">
             <div style="font-size:11px;color:${BRAND.muted};text-transform:uppercase;letter-spacing:1px;">Ahorro mínimo esperado</div>
             <div style="font-size:24px;font-weight:800;color:${BRAND.orangeDark};margin-top:4px;">${ahorroObjetivo ? Math.round(ahorroObjetivo).toLocaleString('es-ES') + ' kWh/año' : 'Consultar propuesta'}</div>
           </td>
           ${demandaPerM2 ? `<td width="4%"></td><td width="48%" valign="top" style="background:${BRAND.card};border:1px solid ${BRAND.border};border-radius:8px;padding:14px;text-align:center;"><div style="font-size:11px;color:${BRAND.muted};text-transform:uppercase;letter-spacing:1px;">Demanda calefacción</div><div style="font-size:24px;font-weight:800;color:${BRAND.orangeDark};margin-top:4px;">${demandaPerM2.toFixed(1).replace('.', ',')} kWh/m²·año</div></td>` : ''}
         </tr></table>`,
        { bg: BRAND.orangeTint, border: BRAND.orange, mb: 22 }
    ) : emailBox(
        emailP(`⚡ Directriz Técnica — ${escapeHtml(ficha || 'RES060/RES093')}`, { size: 11, bold: true, color: BRAND.orangeDark, mb: 6 }) +
        emailP(`Para garantizar el éxito del expediente, la demanda específica de calefacción certificada debe situarse, como <strong>objetivo de seguridad</strong>, <strong>por encima</strong> del valor estimado en la propuesta comercial${superficieRef ? `, y la <strong>superficie útil habitable</strong> del certificado no debe ser <strong>inferior</strong> a la indicada` : ''}.`, { size: 14, color: BRAND.muted, mb: 12 }) +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
           <td width="${superficieRef ? '48%' : '100%'}" valign="top" style="background:${BRAND.card};border:1px solid ${BRAND.border};border-radius:8px;padding:16px;text-align:center;">
             <div style="font-size:11px;color:${BRAND.muted};text-transform:uppercase;letter-spacing:1px;">Demanda mínima esperada</div>
             <div style="font-size:26px;font-weight:800;color:${BRAND.orangeDark};margin-top:4px;">${demandaPerM2 ? demandaPerM2.toFixed(1).replace('.', ',') + ' kWh/m²·año' : 'Consultar propuesta'}</div>
           </td>
           ${superficieRef ? `<td width="4%"></td><td width="48%" valign="top" style="background:${BRAND.card};border:1px solid ${BRAND.border};border-radius:8px;padding:16px;text-align:center;"><div style="font-size:11px;color:${BRAND.muted};text-transform:uppercase;letter-spacing:1px;">Superficie mínima</div><div style="font-size:26px;font-weight:800;color:${BRAND.orangeDark};margin-top:4px;">${superficieRef.toLocaleString('es-ES', { maximumFractionDigits: 2 })} m²</div></td>` : ''}
         </tr></table>`,
        { bg: BRAND.orangeTint, border: BRAND.orange, mb: 22 }
    );

    // Bloque de datos del cliente (solo si hay info)
    const clienteInfoHtml = clienteData ? emailBox(
        emailP('📋 Datos del cliente', { size: 11, bold: true, color: BRAND.muted, mb: 12 }) +
        emailDataTable(clienteDataRows(clienteData)),
        { mb: 22 }
    ) : '';

    const botonesHtml = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">` +
        (ackLink ? `<tr><td align="center" style="padding-bottom:12px;">${emailButton(ackLink, '✅ Aceptar Encargo')}</td></tr>` : '') +
        (portalLink ? `<tr><td align="center" style="padding-bottom:12px;">${emailButton(portalLink, '🔗 Acceder al Portal', BRAND.orange)}</td></tr>` : '') +
        (ceeFolderLink ? `<tr><td align="center">${emailOutlineButton(ceeFolderLink, '📁 Acceder a Carpeta CEE')}</td></tr>` : '') +
        `</table>` +
        (ceeFolderLink ? emailP('Tienes acceso de <strong>edición</strong> a la carpeta de documentos del expediente. Sube ahí el certificado emitido.', { size: 12, color: BRAND.muted, center: true, mb: 0 }) : '');

    const html = brandEmailShell({
        preheader: `Encargo CEE (${tipoLabel}) del expediente ${expedienteNum}.`,
        title: 'Encargo de Certificado',
        pill: isUrgent ? PILL.warning('Encargo urgente', '🚨') : PILL.neutral('Nuevo encargo', '📩'),
        contentHtml:
            introBlockHtml + directrizHtml + clienteInfoHtml + adminMessageHtml +
            `<h3 style="margin:8px 0 12px;font-size:14px;font-weight:700;color:${BRAND.text};">Accesos directos:</h3>` +
            botonesHtml +
            `<div style="height:20px;line-height:20px;font-size:0;">&nbsp;</div>` +
            emailP('Ante cualquier duda técnica, contacta con Brokergy antes de emitir el certificado.', { size: 13, color: BRAND.muted, center: true, mb: 0 }),
        footerNote: `<a href="https://brokergy.es" style="color:${BRAND.greenDark};text-decoration:none;">brokergy.es</a>`,
    });

    const clienteText = clienteDataText(clienteData);

    const urgentText = isUrgent ? '🚨 URGENTE 🚨\n\n' : '';
    const adminMsgText = adminMessage ? `\nMensaje de Brokergy:\n${adminMessage}\n\n` : '';
    const linksText = `${ackLink ? 'Para aceptar el encargo haz clic aquí: ' + ackLink + '\n\n' : ''}${portalLink ? 'Portal: ' + portalLink + '\n' : ''}${ceeFolderLink ? 'Carpeta CEE: ' + ceeFolderLink : ''}`;
    const text = customMessage
        ? `${customMessage}\n\n${linksText}\n\nBROKERGY · Ingeniería Energética`
        : `${urgentText}Hola ${certName}!\n\nTe asignamos el expediente ${expedienteNum}.\n\n${clienteText}${isReforma ? `Ahorro mínimo esperado: ${ahorroObjetivo ? Math.round(ahorroObjetivo) + ' kWh/año' : 'Consultar propuesta'}` : `Demanda mínima esperada: ${demandaPerM2 ? demandaPerM2.toFixed(1).replace('.', ',') + ' kWh/m²·año' : 'Consultar propuesta'}${superficieRef ? `\nSuperficie mínima: ${superficieRef.toLocaleString('es-ES', { maximumFractionDigits: 2 })} m²` : ''}`}\n\n${adminMsgText}${linksText}\n\nBROKERGY · Ingeniería Energética`;

    return sendMail({ to, subject, html, text });
};

/**
 * Notifica al certificador para que emita el CEE FINAL
 */
const sendCertificadorFinalNotificationEmail = async ({
    to, certName, expedienteNum, clienteName, clienteData,
    ficha, tipoActuacion,
    ceeFolderLink, portalLink, ackLink,
    priority = 'normal',
    adminMessage = null,
    customMessage = null,
}) => {
    const isReforma = ficha === 'RES080';
    const tipoLabel = tipoActuacion || (isReforma ? 'REFORMA' : ficha === 'RES093' ? 'HIBRIDACIÓN' : 'AEROTERMIA');
    const clienteUpper = (clienteName || '').toUpperCase().trim();
    const isUrgent = priority === 'urgent';
    const subject = `${isUrgent ? '🚨 URGENTE — ' : ''}“${expedienteNum} ENCARGO CEE FINAL (${tipoLabel}) – “${clienteUpper}”`;

    const adminMessageHtml = (adminMessage && !customMessage) ? emailBox(
        emailP('💬 Mensaje de Brokergy', { size: 11, bold: true, color: BRAND.orangeDark, mb: 8 }) +
        emailP(escapeHtml(adminMessage), { size: 14, pre: true, mb: 0 }),
        { bg: BRAND.orangeTint, border: BRAND.orange, mb: 22 }
    ) : '';

    const introBlockHtml = customMessage
        ? emailP(escapeHtml(customMessage), { pre: true, mb: 16 })
        : (
            emailP(`¡Hola ${escapeHtml(certName || 'técnico')}!`, { size: 19, bold: true, mb: 6 }) +
            emailP(`Ya puedes proceder a la emisión del <strong style="color:${BRAND.orangeDark};">Certificado de Eficiencia Energética FINAL</strong> para el expediente <strong>${escapeHtml(expedienteNum)}</strong>.`, { color: BRAND.muted, mb: 16 }) +
            emailP('Toda la documentación necesaria (facturas, memorias de instalación, fotos de fin de obra) ya está disponible en la carpeta compartida.', { color: BRAND.muted, mb: 22 })
        );

    const clienteInfoHtml = clienteData ? emailBox(
        emailP('📋 Datos del cliente', { size: 11, bold: true, color: BRAND.muted, mb: 12 }) +
        emailDataTable(clienteDataRows(clienteData, { full: false })),
        { mb: 22 }
    ) : '';

    const botonesHtml = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">` +
        (portalLink ? `<tr><td align="center" style="padding-bottom:12px;">${emailButton(portalLink, '🔗 Acceder al Portal', BRAND.orange)}</td></tr>` : '') +
        (ceeFolderLink ? `<tr><td align="center">${emailOutlineButton(ceeFolderLink, '📁 Acceder a Carpeta CEE')}</td></tr>` : '') +
        `</table>`;

    const html = brandEmailShell({
        preheader: `Encargo CEE FINAL (${tipoLabel}) del expediente ${expedienteNum}.`,
        title: 'Encargo CEE Final',
        pill: isUrgent ? PILL.warning('Encargo urgente', '🚨') : PILL.neutral('Nuevo encargo', '📩'),
        contentHtml:
            introBlockHtml + clienteInfoHtml + adminMessageHtml +
            `<h3 style="margin:8px 0 12px;font-size:14px;font-weight:700;color:${BRAND.text};">Accesos directos:</h3>` +
            botonesHtml +
            `<div style="height:20px;line-height:20px;font-size:0;">&nbsp;</div>` +
            emailP('Por favor, una vez emitido, sube el registro y la etiqueta a la misma carpeta o al portal.', { size: 13, color: BRAND.muted, center: true, mb: 0 }),
        footerNote: `<a href="https://brokergy.es" style="color:${BRAND.greenDark};text-decoration:none;">brokergy.es</a>`,
    });

    const urgentText = isUrgent ? '🚨 URGENTE 🚨\n\n' : '';
    const adminMsgText = adminMessage ? `\nMensaje de Brokergy:\n${adminMessage}\n\n` : '';
    const linksText = `${ackLink ? 'Para aceptar el encargo haz clic aquí: ' + ackLink + '\n\n' : ''}${ceeFolderLink ? 'Documentación disponible en: ' + ceeFolderLink : ''}`;
    const text = customMessage
        ? `${customMessage}\n\n${linksText}\n\nBROKERGY · Ingeniería Energética`
        : `${urgentText}¡Hola ${certName}!\n\nYa puedes emitir el CEE FINAL para el expediente ${expedienteNum}.\n\n${adminMsgText}${linksText}\n\nBROKERGY · Ingeniería Energética`;

    return sendMail({ to, subject, html, text });
};

/**
 * Recordatorio suave al certificador
 */
const sendCertificadorReminderEmail = async ({
    to, certName, expedienteNum, clienteName, clienteData,
    ficha, tipoActuacion, ceeFolderLink, portalLink, ackLink,
    adminMessage = null,
    customMessage = null,
}) => {
    const tipoLabel = tipoActuacion || 'CEE';
    const clienteUpper = (clienteName || '').toUpperCase().trim();
    const subject = `Recordatorio: ${expedienteNum} (${tipoLabel}) – ${clienteUpper}`;

    const adminMessageHtml = (adminMessage && !customMessage) ? emailBox(
        emailP('💬 Mensaje de Brokergy', { size: 11, bold: true, color: BRAND.muted, mb: 8 }) +
        emailP(escapeHtml(adminMessage), { size: 14, pre: true, mb: 0 }),
        { mb: 22 }
    ) : '';

    const introBlockHtml = customMessage
        ? emailP(escapeHtml(customMessage), { pre: true, mb: 16 })
        : (
            emailP(`¡Hola ${escapeHtml(certName || 'técnico')}! 👋`, { size: 19, bold: true, mb: 6 }) +
            emailP(`Te escribimos para recordarte que tienes pendiente el encargo del expediente <strong>${escapeHtml(expedienteNum)}</strong>${clienteName ? ` de <strong>${escapeHtml(clienteName)}</strong>` : ''}.`, { color: BRAND.muted, mb: 16 }) +
            emailP('¿Podrías darnos una estimación de fecha de entrega? Nos ayudaría mucho para la planificación.', { color: BRAND.muted, mb: 22 })
        );

    const botonesHtml = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">` +
        (portalLink ? `<tr><td align="center" style="padding-bottom:12px;">${emailButton(portalLink, '🔗 Acceder al Portal', BRAND.orange)}</td></tr>` : '') +
        (ceeFolderLink ? `<tr><td align="center">${emailOutlineButton(ceeFolderLink, '📁 Carpeta CEE')}</td></tr>` : '') +
        `</table>`;

    const html = brandEmailShell({
        preheader: `Recordatorio del encargo pendiente ${expedienteNum}.`,
        title: 'Recordatorio de CEE',
        pill: PILL.warning('Recordatorio', '⏰'),
        contentHtml:
            introBlockHtml + adminMessageHtml + botonesHtml +
            `<div style="height:20px;line-height:20px;font-size:0;">&nbsp;</div>` +
            emailP('Gracias por tu colaboración.', { size: 13, color: BRAND.muted, center: true, mb: 0 }),
    });

    const adminMsgText = adminMessage ? `\nMensaje de Brokergy:\n${adminMessage}\n\n` : '';
    const linksText = `${portalLink ? 'Portal: ' + portalLink + '\n' : ''}${ceeFolderLink ? 'Carpeta CEE: ' + ceeFolderLink : ''}`;
    const text = customMessage
        ? `${customMessage}\n\n${linksText}\n\nBROKERGY · Ingeniería Energética`
        : `¡Hola ${certName}!\n\nTe recordamos que tienes pendiente el expediente ${expedienteNum}${clienteName ? ` (${clienteName})` : ''}.\n\n${adminMsgText}¿Podrías darnos una estimación de fecha?\n\nBROKERGY · Ingeniería Energética`;

    return sendMail({ to, subject, html, text });
};

/**
 * Aviso urgente al certificador
 */
const sendCertificadorUrgentEmail = async ({
    to, certName, expedienteNum, clienteName, clienteData,
    ficha, tipoActuacion, ceeFolderLink, portalLink, ackLink,
    adminMessage = null,
    customMessage = null,
}) => {
    const tipoLabel = tipoActuacion || 'CEE';
    const clienteUpper = (clienteName || '').toUpperCase().trim();
    const subject = `⚠️ URGENTE: ${expedienteNum} (${tipoLabel}) – ${clienteUpper}`;

    const adminMessageHtml = (adminMessage && !customMessage) ? emailBox(
        emailP('💬 Mensaje de Brokergy', { size: 11, bold: true, color: BRAND.orangeDark, mb: 8 }) +
        emailP(escapeHtml(adminMessage), { size: 14, pre: true, mb: 0 }),
        { bg: BRAND.orangeTint, border: BRAND.orange, mb: 22 }
    ) : '';

    const introBlockHtml = customMessage
        ? emailP(escapeHtml(customMessage), { pre: true, mb: 16 })
        : (
            emailP(`Hola ${escapeHtml(certName || 'técnico')},`, { size: 19, bold: true, mb: 6 }) +
            emailP(`Necesitamos con <strong style="color:${BRAND.orangeDark};">carácter urgente</strong> la documentación del expediente <strong>${escapeHtml(expedienteNum)}</strong>${clienteName ? ` de <strong>${escapeHtml(clienteName)}</strong>` : ''}.`, { color: BRAND.muted, mb: 16 }) +
            emailP('Es importante que lo priorices para poder cumplir con los plazos establecidos en el programa de ayudas. Por favor, contacta con nosotros lo antes posible si hay algún impedimento.', { color: BRAND.muted, mb: 22 })
        );

    const botonesHtml = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">` +
        (portalLink ? `<tr><td align="center" style="padding-bottom:12px;">${emailButton(portalLink, '🔗 Acceder al Portal', BRAND.orange)}</td></tr>` : '') +
        (ceeFolderLink ? `<tr><td align="center">${emailOutlineButton(ceeFolderLink, '📁 Carpeta CEE')}</td></tr>` : '') +
        `</table>`;

    const html = brandEmailShell({
        preheader: `Aviso urgente sobre el expediente ${expedienteNum}.`,
        title: 'Aviso urgente',
        pill: PILL.warning('Aviso urgente', '🚨'),
        contentHtml:
            emailBox(emailP('⚠️ Aviso Urgente', { bold: true, color: BRAND.orangeDark, center: true, mb: 0 }), { bg: BRAND.orangeTint, border: BRAND.orange, mb: 22 }) +
            introBlockHtml + adminMessageHtml + botonesHtml +
            `<div style="height:20px;line-height:20px;font-size:0;">&nbsp;</div>` +
            emailP('Quedamos a la espera de tu respuesta.', { size: 13, color: BRAND.muted, center: true, mb: 0 }),
    });

    const adminMsgText = adminMessage ? `\nMensaje de Brokergy:\n${adminMessage}\n\n` : '';
    const linksText = `${portalLink ? 'Portal: ' + portalLink + '\n' : ''}${ceeFolderLink ? 'Carpeta CEE: ' + ceeFolderLink : ''}`;
    const text = customMessage
        ? `⚠️ URGENTE\n\n${customMessage}\n\n${linksText}\n\nBROKERGY · Ingeniería Energética`
        : `⚠️ URGENTE\n\nHola ${certName},\n\nNecesitamos con carácter urgente la documentación del expediente ${expedienteNum}${clienteName ? ` (${clienteName})` : ''}.\n\n${adminMsgText}Por favor, priorízalo para cumplir plazos.\n\nBROKERGY · Ingeniería Energética`;

    return sendMail({ to, subject, html, text });
};

/**
 * Notifica a BROKERGY que un técnico ha terminado el CEE y solicita revisión
 * Soporta priority + techMessage + datos del cliente + carpeta CEE, homogéneo
 * con el email de encargo al certificador.
 */
const sendReviewRequestEmailToAdmin = async ({
    expedienteId, numExp, certName, certPhone, certEmail, phase,
    clienteName, clienteData,
    portalLink, ceeFolderLink,
    openLocalLink = null,
    approveLink = null,
    priority = 'normal',
    techMessage = null,
    isResend = false,
}) => {
    const to = 'franciscojavier.moya.s2e2@gmail.com'; // Email de administración
    const phaseLabel = phase === 'final' ? 'FINAL' : 'INICIAL';
    const isUrgent = priority === 'urgent';
    const clienteUpper = (clienteName || '').toUpperCase().trim();
    const resendPrefix = isResend ? '🔁 REENVÍO — ' : '';
    const subject = `${isUrgent ? '🚨 URGENTE — ' : ''}${resendPrefix}📢 REVISIÓN SOLICITADA — CEE ${phaseLabel} — ${numExp}${clienteUpper ? ` — “${clienteUpper}”` : ''}`;

    const finalPortalLink = portalLink || `${process.env.FRONTEND_URL || 'https://app.brokergy.es'}/?exp=${expedienteId}`;

    const resendNote = isResend ? emailBox(
        emailP('🔁 Reenvío — Ya había una solicitud previa', { size: 12, bold: true, color: BRAND.muted, center: true, mb: 0 }),
        { bg: BRAND.grayTint, border: BRAND.border, mb: 22 }
    ) : '';

    const techMessageHtml = techMessage ? emailBox(
        emailP('💬 Mensaje del técnico', { size: 11, bold: true, color: BRAND.orangeDark, mb: 8 }) +
        emailP(escapeHtml(techMessage), { size: 14, pre: true, mb: 0 }),
        { bg: BRAND.orangeTint, border: BRAND.orange, mb: 22 }
    ) : '';

    // Bloque "Quién solicita la revisión" (certName + tlf + email del cert si los tenemos)
    const certInfoHtml = emailBox(
        emailP('👤 Técnico que solicita la revisión', { size: 11, bold: true, color: BRAND.muted, mb: 12 }) +
        emailDataTable([
            certName ? ['Nombre', escapeHtml(certName)] : null,
            certPhone ? ['Teléfono', `<a href="tel:${escapeHtml(certPhone)}" style="color:${BRAND.greenDark};text-decoration:none;">${escapeHtml(certPhone)}</a>`] : null,
            certEmail ? ['Email', `<a href="mailto:${escapeHtml(certEmail)}" style="color:${BRAND.greenDark};text-decoration:none;">${escapeHtml(certEmail)}</a>`] : null,
        ]),
        { mb: 22 }
    );

    // Bloque "Datos del cliente"
    const clienteInfoHtml = clienteData ? emailBox(
        emailP('📋 Datos del cliente', { size: 11, bold: true, color: BRAND.muted, mb: 12 }) +
        emailDataTable(clienteDataRows(clienteData)),
        { mb: 22 }
    ) : '';

    // Botón de carpeta: preferimos abrir la carpeta LOCAL del expediente (https →
    // lanza el protocolo brokergylocal: en el navegador). Si no hay enlace local,
    // caemos a la carpeta CEE en Drive. Con enlace local dejamos además un enlace
    // pequeño a Drive como respaldo.
    const folderRowsHtml = openLocalLink
        ? `<tr><td align="center" style="padding-bottom:6px;">${emailOutlineButton(openLocalLink, '📂 Abrir carpeta local del expediente')}</td></tr>` +
          (ceeFolderLink ? `<tr><td align="center" style="padding-bottom:12px;">${emailP(`¿No se abre? <a href="${ceeFolderLink}" style="color:${BRAND.greenDark};text-decoration:none;">Abrir la carpeta CEE en Google Drive</a>`, { size: 11, color: BRAND.muted, center: true, mb: 0 })}</td></tr>` : '')
        : (ceeFolderLink ? `<tr><td align="center" style="padding-bottom:12px;">${emailOutlineButton(ceeFolderLink, '📁 Abrir Carpeta CEE')}</td></tr>` : '');

    const botonesHtml = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">` +
        `<tr><td align="center" style="padding-bottom:12px;">${emailButton(finalPortalLink, '🔗 Ver Expediente', BRAND.orange)}</td></tr>` +
        folderRowsHtml +
        (approveLink ? `<tr><td align="center" style="padding-top:6px;">${emailButton(approveLink, '✅ Dar Visto Bueno')}</td></tr><tr><td align="center" style="padding-top:8px;">${emailP('Al pulsar autorizas el registro en Industria y se avisa al técnico automáticamente por <strong>email y WhatsApp</strong>.', { size: 11, color: BRAND.muted, center: true, mb: 0 })}</td></tr>` : '') +
        `</table>`;

    const html = brandEmailShell({
        preheader: `${certName || 'El técnico'} ha subido el .CEX del CEE ${phaseLabel} del expediente ${numExp}.`,
        title: 'Revisión solicitada',
        pill: isUrgent ? PILL.warning('Revisión urgente', '🚨') : PILL.info('Revisión solicitada'),
        contentHtml:
            resendNote +
            emailP('Solicitud de Revisión Técnica', { size: 18, bold: true, mb: 6 }) +
            emailP(`El técnico <strong>${escapeHtml(certName || 'Técnico')}</strong> ha subido el archivo <strong>.CEX</strong> del <strong>CEE ${phaseLabel}</strong> para el expediente <strong style="color:${BRAND.orangeDark};">${escapeHtml(numExp)}</strong>${clienteName ? ` del cliente <strong>${escapeHtml(clienteName)}</strong>` : ''}.`, { color: BRAND.muted, mb: 16 }) +
            emailP('El expediente está pendiente de tu revisión para validar y autorizar la presentación.', { color: BRAND.muted, mb: 22 }) +
            certInfoHtml + clienteInfoHtml + techMessageHtml +
            `<h3 style="margin:8px 0 12px;font-size:14px;font-weight:700;color:${BRAND.text};">Accesos directos:</h3>` +
            botonesHtml +
            `<div style="height:20px;line-height:20px;font-size:0;">&nbsp;</div>` +
            emailP(approveLink ? 'Revisa el .CEX y, si todo es correcto, pulsa <strong>Dar Visto Bueno</strong> (o hazlo desde el portal).' : 'Una vez revisado el .CEX, pulsa <strong>Validar y Autorizar Presentación</strong> en el portal.', { size: 13, color: BRAND.muted, center: true, mb: 0 }),
        footerNote: 'Notificación automática · ERP',
    });

    const clienteText = clienteDataText(clienteData);

    const urgentText = isUrgent ? '🚨 URGENTE 🚨\n\n' : '';
    const techMsgText = techMessage ? `\nMensaje del técnico:\n${techMessage}\n\n` : '';
    const approveText = approveLink ? `\n✅ Dar visto bueno (un clic, avisa al técnico por email + WhatsApp):\n${approveLink}\n` : '';
    const folderText = openLocalLink
        ? `Abrir carpeta local del expediente: ${openLocalLink}\n${ceeFolderLink ? 'Carpeta CEE (Drive): ' + ceeFolderLink + '\n' : ''}`
        : (ceeFolderLink ? 'Carpeta CEE: ' + ceeFolderLink + '\n' : '');
    const text = `${urgentText}SOLICITUD DE REVISIÓN TÉCNICA\n\nEl técnico ${certName || 'Técnico'} ha subido el .CEX del CEE ${phaseLabel} del expediente ${numExp}.\n\n${clienteText}${techMsgText}Ver expediente: ${finalPortalLink}\n${folderText}${approveText}\nBROKERGY · Ingeniería Energética`;

    return sendMail({ to, subject, html, text });
};

/**
 * Notifica a BROKERGY que un técnico ha aceptado el encargo a través del enlace de correo
 */
const sendCertifierAcceptedAdminNotification = async (expedienteId, numExp, certName, phase, clienteData = null) => {
    const to = 'franciscojavier.moya.s2e2@gmail.com'; // Email de administración
    const subject = `✅ ENCARGO ACEPTADO — ${numExp} — ${certName}`;

    const clienteNombre = clienteData?.nombre || null;
    const direccion = clienteData?.direccionInstalacion || clienteData?.direccion || null;

    const dataRows = [
        ['Expediente', escapeHtml(numExp)],
        ...(clienteNombre ? [['Cliente', escapeHtml(clienteNombre)]] : []),
        ...(direccion ? [['Dirección', escapeHtml(direccion)]] : []),
        ['Estado', 'EN TRABAJO (actualizado automáticamente)'],
    ];

    const html = brandEmailShell({
        preheader: `${certName} ha aceptado el encargo del ${phase} — ${numExp}.`,
        title: 'Encargo aceptado',
        pill: PILL.success('Encargo aceptado'),
        contentHtml:
            emailP(`El técnico <strong>${escapeHtml(certName)}</strong> ha aceptado el encargo del <strong>${escapeHtml(phase)}</strong>.`, { mb: 22 }) +
            emailBox(emailDataTable(dataRows), { mb: 22 }) +
            `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">${emailButton(`${process.env.FRONTEND_URL || 'https://app.brokergy.es'}/?exp=${expedienteId}`, 'Ver Expediente')}</td></tr></table>`,
        footerNote: 'Notificación automática de BROKERGY ERP',
    });

    const textLines = [
        `El técnico ${certName} ha aceptado el encargo del ${phase} para el expediente ${numExp}.`,
        ...(clienteNombre ? [`Cliente: ${clienteNombre}`] : []),
        ...(direccion ? [`Dirección: ${direccion}`] : []),
    ];

    return sendMail({ to, subject, html, text: textLines.join('\n') });
};

/**
 * Notifica al certificador que el administrador ha validado su CEE (Inicial o Final)
 */
// ─── DISEÑO EMAILS CERTIFICADOR (tema claro, barra degradado, logo, pill) ─────
const CERT_LOGO_URL = 'https://app.brokergy.es/logo-brokergy-circular.png';

// Quita del cuerpo las líneas de enlace (🔗/📁/📥/📤 y URLs sueltas): en el diseño
// nuevo los enlaces van como BOTONES, no como texto plano dentro del mensaje.
function stripCertLinkLines(text) {
    return String(text || '')
        .split('\n')
        .filter(line => {
            const t = line.trim();
            if (/^(🔗|📁|📥|📤|📄|📝)/.test(t)) return false;
            if (/^https?:\/\/\S+$/.test(t)) return false;
            return true;
        })
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

// ── Paleta de marca (tema claro) y helpers de componentes de email ───────────
const BRAND = {
    bg: '#F3F4F1', card: '#FFFFFF', border: '#E8E9E4', soft: '#F8F9F6',
    text: '#1A1A1A', muted: '#667085',
    green: '#8DC63F', greenDark: '#5C9A1B', greenTint: '#EEF6E1',
    orange: '#F7941D', orangeDark: '#C77700', orangeTint: '#FCEFDA',
    grayTint: '#F1F2EC', grayText: '#8A8F7A',
};

// Presets de pill de estado (emoji + colores).
const PILL = {
    success: (text, emoji = '✅') => ({ emoji, text, bg: BRAND.greenTint, color: BRAND.greenDark }),
    warning: (text, emoji = '⚠️') => ({ emoji, text, bg: BRAND.orangeTint, color: BRAND.orangeDark }),
    neutral: (text, emoji = '🕒') => ({ emoji, text, bg: BRAND.grayTint, color: BRAND.grayText }),
    info:    (text, emoji = '📩') => ({ emoji, text, bg: '#E8F0FB', color: '#2563A6' }),
};

// Botón relleno (fondo de color, texto blanco).
function emailButton(href, label, bg = BRAND.green) {
    return `<table role="presentation" cellpadding="0" cellspacing="0" align="center"><tr><td style="border-radius:8px;background:${bg};"><a href="${href}" style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:700;color:#FFFFFF;text-decoration:none;">${label}</a></td></tr></table>`;
}
// Botón outline (borde oscuro, texto oscuro).
function emailOutlineButton(href, label) {
    return `<table role="presentation" cellpadding="0" cellspacing="0" align="center"><tr><td style="border-radius:8px;border:1.5px solid #1A1A1A;"><a href="${href}" style="display:inline-block;padding:11px 22px;font-size:14px;font-weight:700;color:#1A1A1A;text-decoration:none;">${label}</a></td></tr></table>`;
}
// Alias histórico usado por el email de visto bueno.
const certButton = (href, label, bg) => emailButton(href, label, bg);

// Párrafo de cuerpo. opts: {size,color,mb,center,pre,bold}
function emailP(html, opts = {}) {
    const size = opts.size || 15, color = opts.color || BRAND.text;
    const mb = opts.mb != null ? opts.mb : 18;
    return `<p style="margin:0 0 ${mb}px 0;font-size:${size}px;line-height:1.6;color:${color};${opts.center ? 'text-align:center;' : ''}${opts.pre ? 'white-space:pre-wrap;' : ''}${opts.bold ? 'font-weight:700;' : ''}">${html}</p>`;
}
// Caja destacada (fondo suave, borde).
function emailBox(innerHtml, opts = {}) {
    const bg = opts.bg || BRAND.soft, border = opts.border || BRAND.border;
    const mb = opts.mb != null ? opts.mb : 22;
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${bg};border:1px solid ${border};border-radius:10px;margin-bottom:${mb}px;"><tr><td style="padding:${opts.pad || '20px 22px'};">${innerHtml}</td></tr></table>`;
}
// Tabla de datos (label/valor) para resúmenes de expediente.
function emailDataTable(rows) {
    const body = rows.filter(Boolean).map(([k, v]) =>
        `<tr><td style="padding:5px 0;font-size:13px;color:${BRAND.muted};white-space:nowrap;vertical-align:top;">${k}</td><td style="padding:5px 0 5px 14px;font-size:13px;color:${BRAND.text};font-weight:700;">${v || '—'}</td></tr>`
    ).join('');
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${body}</table>`;
}

// Shell de marca para TODOS los emails (cliente/instalador/certificador): barra
// degradado, cabecera con logo + título, pill opcional, cuerpo y footer.
// pill = { emoji, text, bg, color } | null. contentHtml = cuerpo central.
function brandEmailShell({ preheader, title, pill, contentHtml, footerNote }) {
    const note = footerNote || 'Este mensaje se ha generado automáticamente, por favor no respondas a este correo.';
    const pillHtml = pill ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:20px;"><tr><td style="background:${pill.bg};border-radius:20px;padding:6px 14px;"><span style="font-size:12px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:${pill.color};">${pill.emoji} ${escapeHtml(pill.text)}</span></td></tr></table>` : '';
    return `<!DOCTYPE html>
<html lang="es" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.bg};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader || '')}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg};font-family:Arial,Helvetica,sans-serif;">
<tr><td align="center" style="padding:40px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;">
<tr><td style="height:5px;line-height:5px;font-size:0;background-color:${BRAND.greenDark};background-image:linear-gradient(90deg,${BRAND.orange},${BRAND.green});border-radius:14px 14px 0 0;">&nbsp;</td></tr>
<tr><td style="background:${BRAND.card};border:1px solid ${BRAND.border};border-top:none;border-radius:0 0 14px 14px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-bottom:1px solid ${BRAND.border};">
    <tr><td style="padding:28px 40px;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td valign="middle" style="width:52px;padding-right:16px;"><img src="${CERT_LOGO_URL}" width="48" height="48" alt="Brokergy" style="display:block;border-radius:50%;"></td>
        <td valign="middle">
          <p style="margin:0 0 2px 0;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${BRAND.muted};">BROKERGY · Ingeniería Energética</p>
          <h1 style="margin:0;font-size:22px;line-height:1.25;color:${BRAND.text};font-weight:700;">${escapeHtml(title)}</h1>
        </td>
      </tr></table>
    </td></tr>
  </table>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td style="padding:32px 40px 36px 40px;">
      ${pillHtml}
      ${contentHtml}
    </td></tr>
  </table>
</td></tr>
<tr><td align="center" style="padding:28px 16px 8px;"><p style="margin:0;font-size:12px;color:${BRAND.muted};line-height:1.6;font-family:Arial,Helvetica,sans-serif;">BROKERGY · Ingeniería Energética<br>${note}</p></td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

// Compat: firma antigua certEmailShell → brandEmailShell + botón "Abrir Expediente".
function certEmailShell({ preheader, title, pillEmoji, pillText, pillBg, pillColor, contentHtml, expedienteId, portalLink }) {
    const openLink = portalLink || (expedienteId ? `https://app.brokergy.es/?exp=${expedienteId}` : null);
    const cta = openLink ? `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:4px;">
        <tr><td align="center" style="font-size:13px;line-height:1.6;color:${BRAND.muted};padding-bottom:14px;">Si lo prefieres, puedes abrir el expediente directamente en la app:</td></tr>
        <tr><td align="center">${emailOutlineButton(openLink, '📁 Abrir Expediente')}</td></tr>
      </table>` : '';
    return brandEmailShell({
        preheader, title,
        pill: pillText ? { emoji: pillEmoji, text: pillText, bg: pillBg, color: pillColor } : null,
        contentHtml: contentHtml + cta,
    });
}

const sendCertificadorApproveNotification = async (to, certName, numExp, phaseLabel, portalLink, folderLink, adminMessage = null, customMessage = null, extra = {}) => {
    // El asunto SIEMPRE empieza por el nº de expediente.
    const subject = `${numExp} · Visto Bueno ${phaseLabel}`;
    const presentFolderLink = extra.presentFolderLink || null; // carpeta CEE INICIAL/FINAL (descarga)
    const ceeUploadLink = extra.ceeUploadLink || null;         // popup de subida del CEE registrado
    const attachments = Array.isArray(extra.attachments) ? extra.attachments : undefined;
    const GREEN = '#8DC63F';

    // Cuerpo: el mensaje editado (sin las líneas de enlace, que van como botones) o el texto por defecto.
    const bodyText = stripCertLinkLines(customMessage || adminMessage || '');
    const firstName = (certName || '').trim().split(/\s+/)[0] || 'técnico';
    const bodyParagraphs = bodyText
        ? `<p style="margin:0 0 22px 0;font-size:15px;line-height:1.6;color:#1A1A1A;white-space:pre-wrap;">${escapeHtml(bodyText)}</p>`
        : `<p style="margin:0 0 18px 0;font-size:15px;line-height:1.6;color:#1A1A1A;">¡Hola ${escapeHtml(firstName)}! 👋</p>
           <p style="margin:0 0 18px 0;font-size:15px;line-height:1.6;color:#1A1A1A;">Hemos revisado el <strong>${phaseLabel}</strong> del expediente <strong>${numExp}</strong> y tiene nuestro visto bueno. Ya puedes proceder a registrarlo en Industria.</p>
           <p style="margin:0 0 22px 0;font-size:15px;line-height:1.6;color:#1A1A1A;">¡Gracias!</p>`;

    const stepsBox = (presentFolderLink || ceeUploadLink) ? `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8F9F6;border:1px solid #E8E9E4;border-radius:10px;margin-bottom:22px;">
        <tr><td style="padding:24px 22px 2px 22px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${presentFolderLink ? `<tr><td align="center" style="padding-bottom:22px;">
              <p style="margin:0 0 12px 0;font-size:14px;font-weight:700;color:#1A1A1A;text-align:center;">1 · Descarga los archivos para presentarlos</p>
              ${certButton(presentFolderLink, `📄 Descargar CEE (${phaseLabel})`, GREEN)}
            </td></tr>` : ''}
            ${ceeUploadLink ? `<tr><td align="center" style="padding-bottom:22px;">
              <p style="margin:0 0 12px 0;font-size:14px;font-weight:700;color:#1A1A1A;text-align:center;">2 · Una vez presentado en Industria, puedes subirlo directamente aquí</p>
              <p style="margin:0 0 14px 0;font-size:13px;line-height:1.6;color:#667085;text-align:center;">Sube el CEE registrado (etiqueta energética + justificante de registro). Se guardará automáticamente en el expediente.</p>
              ${certButton(ceeUploadLink, '📤 Subir CEE registrado', GREEN)}
            </td></tr>` : ''}
          </table>
        </td></tr>
      </table>` : '';

    const attachNote = (attachments && attachments.length)
        ? `<p style="margin:0 0 18px 0;font-size:12px;color:#667085;text-align:center;">📎 Se adjuntan ${attachments.length} archivo(s) del CEE a este correo.</p>`
        : '';

    // Ficha del cliente: el certificador la necesita a mano al registrar en Industria.
    const filas = clienteDataRows(extra.clienteData).filter(Boolean);
    const clienteBox = filas.length ? `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8F9F6;border:1px solid #E8E9E4;border-radius:10px;margin-bottom:22px;">
        <tr><td style="padding:18px 22px;">
          <p style="margin:0 0 12px 0;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#667085;">📋 Datos del cliente</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${filas.map(([k, v]) => `<tr>
              <td style="padding:4px 0;font-size:13px;color:#667085;width:42%;">${escapeHtml(k)}</td>
              <td style="padding:4px 0;font-size:13px;color:#1A1A1A;font-weight:600;">${v}</td>
            </tr>`).join('')}
          </table>
        </td></tr>
      </table>` : '';

    const html = certEmailShell({
        preheader: `Tu ${phaseLabel} ha sido validado — ya puedes registrarlo en Industria.`,
        title: 'Certificado Validado',
        pillEmoji: '✅', pillText: 'Visto Bueno', pillBg: '#EEF6E1', pillColor: '#5C9A1B',
        contentHtml: bodyParagraphs + clienteBox + stepsBox + attachNote,
        portalLink,
    });

    const text = customMessage || `Hola ${certName}, el ${phaseLabel} ha sido validado. Puedes proceder a registrarlo.`;
    return sendMail({ to, subject, html, text, attachments });
};

/**
 * Notifica al cliente que el CEE Inicial ha sido presentado
 */
const sendCeeInicialRegistradoClientEmail = async (to, clientName, numExp, portalLink) => {
    const subject = `✅ CEE INICIAL PRESENTADO — ${numExp}`;
    
    const html = brandEmailShell({
        preheader: `El CEE Inicial de tu expediente ${numExp} ya ha sido presentado.`,
        title: 'Certificado presentado',
        pill: PILL.success('Certificado presentado'),
        contentHtml:
            emailP(`¡Hola <strong>${escapeHtml(clientName)}</strong>! 👋`, { mb: 15 }) +
            emailP(`Te escribimos para comunicarte que ya ha sido presentado el Certificado de Eficiencia Energética INICIAL de tu expediente <strong>${escapeHtml(numExp)}</strong>.`, { color: BRAND.muted, mb: 22 }) +
            emailBox(emailP('Desde este momento ya se pueden emitir facturas y pagos.', { bold: true, color: BRAND.greenDark, mb: 0 }), { bg: BRAND.greenTint, border: BRAND.green, mb: 22 }) +
            emailP('📸 <strong>Recuerda hacerle fotografías a todo:</strong>', { mb: 8 }) +
            `<ul style="margin:0 0 18px;padding:0 0 0 18px;font-size:14px;line-height:1.7;color:${BRAND.muted};"><li>Caldera existente y placa de fabricación.</li><li>Desmontaje de la caldera.</li><li>Montaje de la aerotermia.</li><li>Fotos de las nuevas placas de fabricación (tanto de la exterior como interior).</li></ul>` +
            emailP('Las fotos son la parte más importante del proceso para que podamos argumentar ante el ministerio que se ha realizado la reforma.', { size: 14, color: BRAND.muted, mb: 22 }) +
            `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:22px;"><tr><td align="center">${emailButton(portalLink, 'Subir Fotografías')}</td></tr></table>` +
            emailP('Una vez finalizada la obra, debes comunicárnoslo por aquí para proceder con el CEE Final y el resto de la documentación.', { size: 14, color: BRAND.muted, center: true, mb: 0 }),
    });

    return sendMail({ to, subject, html, text: `Hola ${clientName}, el CEE INICIAL ha sido presentado. Ya se pueden emitir facturas y pagos. Por favor, recuerda tomar fotografías de todo el proceso de la obra.` });
};

/**
 * Notifica a Admin/Partner que el CEE (Inicial o Final) ha sido presentado
 */
const sendCeeRegistradoStaffEmail = async (to, isPartner, numExp, clientName, ubicacion, techName, phaseLabel, portalLink, notifyClientLink = null) => {
    // El asunto SIEMPRE empieza por el nº de expediente (mismo criterio que el resto
    // de emails): es por lo que se busca y se ordena en la bandeja.
    const subject = `${numExp} · ✅ Registro ${phaseLabel} presentado`;

    const html = brandEmailShell({
        preheader: `Justificante de registro del ${phaseLabel} presentado — ${numExp}.`,
        title: 'Registro presentado',
        pill: PILL.success('Registro presentado'),
        contentHtml:
            emailP(`Se ha subido correctamente el justificante de registro del <strong>${escapeHtml(phaseLabel)}</strong>.`, { mb: 22 }) +
            emailBox(emailDataTable([
                ['Expediente', escapeHtml(numExp || '')],
                ['Cliente', escapeHtml(clientName || '')],
                ['Ubicación', escapeHtml(ubicacion || '')],
                // Si el expediente no tiene certificador asignado, no pintamos la fila
                // en vez de dejar un guion suelto.
                techName ? ['Certificador', escapeHtml(techName)] : null,
            ])) +
            (phaseLabel === 'CEE INICIAL'
                ? emailBox(emailP('Desde este momento ya se pueden emitir facturas y pagos.', { bold: true, color: BRAND.greenDark, mb: 0 }), { bg: BRAND.greenTint, border: BRAND.green })
                : '') +
            (notifyClientLink && !isPartner
                ? emailBox(
                    emailP('👆 Acción requerida', { bold: true, color: BRAND.greenDark, center: true, mb: 6 }) +
                    emailP('Pulsa el botón para enviar la notificación al cliente.', { size: 13, color: BRAND.muted, center: true, mb: 16 }) +
                    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">${emailButton(notifyClientLink, '📱 Notificar al Cliente')}</td></tr></table>` +
                    emailP('Enlace de uso único · Válido 7 días', { size: 11, color: BRAND.muted, center: true, mb: 0 }),
                    { bg: BRAND.greenTint, border: BRAND.green })
                : '') +
            `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:4px;"><tr><td align="center">${emailOutlineButton(portalLink, '📁 Ver Expediente')}</td></tr></table>`,
    });

    return sendMail({ to, subject, html, text: `El justificante de registro del ${phaseLabel} ha sido presentado para el expediente ${numExp} del cliente ${clientName}. ${notifyClientLink && !isPartner ? 'Enlace para notificar al cliente: ' + notifyClientLink : ''}` });
};

/**
 * Avisa al equipo de que el cliente ha completado/actualizado sus datos por el
 * enlace público (email, teléfono, DNI/CIF, IBAN, justificante bancario).
 * Lleva la ficha del cliente (titular + dirección de la instalación) porque el
 * nº de expediente solo no dice de quién es el expediente.
 */
// Construye (sin enviar) asunto+HTML+texto, para poder previsualizarlo sin SMTP.
function buildDatosClienteCompletadosEmail({ numExp, partes, clienteData, portalLink }) {
    const subject = `${numExp} · 📝 Datos del cliente completados`;
    const nombre = clienteData?.nombre || '';

    const html = brandEmailShell({
        preheader: `${nombre ? nombre + ' — ' : ''}${partes} · ${numExp}`,
        title: 'Datos del cliente completados',
        pill: PILL.success('Datos completados'),
        contentHtml:
            emailP(`El cliente ha completado sus datos del expediente <strong>${escapeHtml(numExp)}</strong>.`, { mb: 22 }) +
            emailBox(emailDataTable([
                ['Expediente', escapeHtml(numExp || '')],
                ...clienteDataRows(clienteData),
                ['Actualizado', escapeHtml(partes || '')],
            ])) +
            emailBox(
                emailP('👉 Ya puedes generar y enviar los anexos al cliente para que los firme.', { bold: true, color: BRAND.greenDark, mb: 0 }),
                { bg: BRAND.greenTint, border: BRAND.green }
            ) +
            (portalLink
                ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:4px;"><tr><td align="center">${emailOutlineButton(portalLink, '📁 Ver Expediente')}</td></tr></table>`
                : ''),
    });

    const text = `Datos del cliente completados — ${numExp}\n\n${clienteDataText(clienteData)}Actualizado: ${partes}\n\nYa puedes generar y enviar los anexos al cliente para que los firme.${portalLink ? '\n\n' + portalLink : ''}`;
    return { subject, html, text };
}

const sendDatosClienteCompletadosEmail = async ({ to, numExp, partes, clienteData, portalLink }) => {
    const { subject, html, text } = buildDatosClienteCompletadosEmail({ numExp, partes, clienteData, portalLink });
    return sendMail({ to, subject, html, text });
};

/**
 * Email genérico de entrega de un documento (CIFO al instalador, RES080 al
 * cliente…) con la MISMA identidad visual de marca que los emails al certificador
 * (brandEmailShell). El `message` es el texto editable del modal (admite
 * *negritas*); si contiene el `primaryLink`, esa línea se quita del cuerpo y el
 * enlace se renderiza como botón destacado.
 */
// Construye (sin enviar) el HTML+texto del email de documento. Exportado aparte
// para poder previsualizarlo/testearlo sin SMTP.
function buildDocumentEmailHtml({ subject, title, message, primaryLink, primaryLabel, secondaryNote, pill }) {
    const rawLines = String(message || '').split('\n');
    const bodyLines = primaryLink
        ? rawLines.filter(l => !l.includes(primaryLink))
        : rawLines;
    const cleaned = bodyLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    const bodyHtml = escapeHtml(cleaned)
        .replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br>');

    const buttonBlock = primaryLink
        ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 20px 0;"><tr><td align="center">${emailButton(primaryLink, primaryLabel || 'Abrir enlace', BRAND.orange)}</td></tr></table>`
        : '';
    const noteBlock = secondaryNote
        ? emailP(secondaryNote, { size: 13, color: BRAND.muted, center: true, mb: 0 })
        : '';

    // pill puede venir ya resuelto ({emoji,text,bg,color}) o como {tone,text,emoji}.
    const resolvedPill = pill
        ? (pill.bg ? pill : (PILL[pill.tone] || PILL.neutral)(pill.text, pill.emoji))
        : null;

    const html = brandEmailShell({
        preheader: subject,
        title: title || 'BROKERGY · Ingeniería Energética',
        pill: resolvedPill,
        contentHtml: emailP(bodyHtml, { mb: buttonBlock ? 22 : 6 }) + buttonBlock + noteBlock,
    });
    return { html, text: cleaned };
}

const sendDocumentEmail = async ({ to, subject, title, message, primaryLink, primaryLabel, secondaryNote, attachments, pill }) => {
    const { html, text } = buildDocumentEmailHtml({ subject, title, message, primaryLink, primaryLabel, secondaryNote, pill });
    return sendMail({ to, subject, html, text, attachments });
};

module.exports = {
    sendDocumentEmail,
    buildDocumentEmailHtml,
    sendMail,
    getSender,
    invalidateSenderCache,
    verifySmtp,
    sendPasswordResetEmail,
    sendLeadSummaryEmail,
    sendProposalEmail,
    sendAcceptanceNotificationEmail,
    sendAnnexEmail,
    sendAdminNotificationEmail,
    sendCertificadorNotificationEmail,
    sendCertificadorFinalNotificationEmail,
    sendCertificadorReminderEmail,
    sendCertificadorUrgentEmail,
    sendReviewRequestEmailToAdmin,
    sendCertifierAcceptedAdminNotification,
    sendCertificadorApproveNotification,
    sendCeeInicialRegistradoClientEmail,
    sendCeeRegistradoStaffEmail,
    sendDatosClienteCompletadosEmail,
    buildDatosClienteCompletadosEmail
};
