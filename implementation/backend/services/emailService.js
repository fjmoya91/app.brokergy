const nodemailer = require('nodemailer');

/**
 * Servicio de email para Brokergy
 * Usa SMTP de Hostinger con la cuenta brokergy@brokergy.es
 */

const escapeHtml = (str) => String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

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

/**
 * Envía un email genérico
 */
const sendMail = async ({ to, subject, html, text, attachments }) => {
    const from = '"BROKERGY · Ingeniería Energética" <brokergy@brokergy.es>';
    
    try {
        const info = await transporter.sendMail({
            from,
            to,
            subject,
            html,
            text: text || subject,
            attachments
        });
        console.log(`[Email] Enviado a ${to}: ${info.messageId}`);
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
    
    const html = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; background-color:#0a0e1a; font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0e1a; padding:40px 20px;">
        <tr>
            <td align="center">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px; background-color:#111827; border-radius:24px; border:1px solid rgba(255,255,255,0.06); overflow:hidden;">
                    
                    <!-- Header gradient bar -->
                    <tr>
                        <td style="height:4px; background:linear-gradient(90deg, #f59e0b, #ea580c);"></td>
                    </tr>
                    
                    <!-- Logo / Brand -->
                    <tr>
                        <td style="padding:40px 40px 20px; text-align:center;">
                            <div style="font-size:28px; font-weight:900; letter-spacing:-0.5px;">
                                <span style="color:#ffffff;">Portal </span>
                                <span style="color:#f59e0b;">BROKERGY</span>
                            </div>
                        </td>
                    </tr>
                    
                    <!-- Icon -->
                    <tr>
                        <td style="text-align:center; padding:10px 40px;">
                            <div style="display:inline-block; width:64px; height:64px; line-height:64px; background-color:rgba(245,158,11,0.1); border-radius:16px; border:1px solid rgba(245,158,11,0.2); font-size:28px; text-align:center;">
                                🔐
                            </div>
                        </td>
                    </tr>
                    
                    <!-- Title -->
                    <tr>
                        <td style="padding:20px 40px 8px; text-align:center;">
                            <h1 style="margin:0; font-size:22px; font-weight:800; color:#ffffff; letter-spacing:-0.3px;">
                                Recuperar Contraseña
                            </h1>
                        </td>
                    </tr>
                    
                    <!-- Message -->
                    <tr>
                        <td style="padding:0 40px 30px; text-align:center;">
                            <p style="margin:0; font-size:14px; line-height:1.6; color:rgba(255,255,255,0.5);">
                                ${userName ? `Hola <strong style="color:rgba(255,255,255,0.8);">${userName.toUpperCase()}</strong>,<br><br>` : ''}
                                Hemos recibido una solicitud para restablecer la contraseña de tu cuenta en Brokergy. 
                                Si no realizaste esta solicitud, simplemente ignora este correo.
                            </p>
                        </td>
                    </tr>
                    
                    <!-- Button -->
                    <tr>
                        <td style="padding:0 40px 30px; text-align:center;">
                            <a href="${resetLink}" target="_blank" style="display:inline-block; padding:14px 40px; background:linear-gradient(135deg, #f59e0b, #ea580c); color:#0a0e1a; font-size:14px; font-weight:800; text-decoration:none; border-radius:12px; letter-spacing:0.3px;">
                                Restablecer Contraseña
                            </a>
                        </td>
                    </tr>
                    
                    <!-- Expiry notice -->
                    <tr>
                        <td style="padding:0 40px 10px; text-align:center;">
                            <p style="margin:0; font-size:12px; color:rgba(255,255,255,0.3);">
                                ⏳ Este enlace expira en <strong style="color:rgba(245,158,11,0.7);">1 hora</strong>.
                            </p>
                        </td>
                    </tr>
                    
                    <!-- Link fallback -->
                    <tr>
                        <td style="padding:0 40px 30px; text-align:center;">
                            <p style="margin:0; font-size:11px; color:rgba(255,255,255,0.2); word-break:break-all;">
                                Si el botón no funciona, copia y pega este enlace en tu navegador:<br>
                                <a href="${resetLink}" style="color:rgba(245,158,11,0.5); text-decoration:none;">${resetLink}</a>
                            </p>
                        </td>
                    </tr>
                    
                    <!-- Divider -->
                    <tr>
                        <td style="padding:0 40px;">
                            <div style="height:1px; background:rgba(255,255,255,0.06);"></div>
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="padding:24px 40px 32px; text-align:center;">
                            <p style="margin:0; font-size:10px; text-transform:uppercase; letter-spacing:2px; font-weight:700; color:rgba(255,255,255,0.15);">
                                Brokergy Analytics &copy; ${new Date().getFullYear()}
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;

    const text = `Recuperar Contraseña — Brokergy\n\n${userName ? `Hola ${userName},\n\n` : ''}Hemos recibido una solicitud para restablecer tu contraseña. Haz clic en el siguiente enlace:\n\n${resetLink}\n\nEste enlace expira en 1 hora.\n\nSi no solicitaste este cambio, ignora este correo.\n\nBrokergy Analytics`;

    return sendMail({ to, subject, html, text });
};

/**
 * Envía la propuesta en PDF al cliente por correo
 */
const sendProposalEmail = async ({ to, userName, pdfBuffer, tableImageBase64, summaryData }) => {
    const isB2B = summaryData.mode === 'PARTNER' || summaryData.mode === 'INSTALADOR';
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
        tableHtml = `
            <div style="margin: 25px 0; border-radius: 16px; overflow: hidden; border: 1px solid rgba(255,255,255,0.08); box-shadow: 0 10px 30px rgba(0,0,0,0.3); background-color: #111827;">
                <img src="cid:summary-table" alt="Resumen Ahorro" style="width: 100%; display: block; border-radius: 15px;">
            </div>
        `;
    }

    const html = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; background-color:#0a0e1a; font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; color:#ffffff;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0e1a; padding:40px 20px;">
        <tr>
            <td align="center">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px; background-color:#111827; border-radius:24px; border:1px solid rgba(255,255,255,0.06); overflow:hidden;">
                    
                    <!-- Header gradient bar -->
                    <tr>
                        <td style="height:4px; background:linear-gradient(90deg, #f59e0b, #ea580c);"></td>
                    </tr>
                    
                    <!-- Logo / Brand -->
                    <tr>
                        <td style="padding:40px 40px 20px;">
                            <div style="font-size:24px; font-weight:900; letter-spacing:-0.5px; text-align:center;">
                                <span style="color:#f59e0b;">BROKERGY </span>
                                <span style="color:#ffffff; font-weight: 500;">· Ingeniería Energética</span>
                            </div>
                        </td>
                    </tr>
                    
                    <!-- Content Body -->
                    <tr>
                        <td style="padding:10px 40px 30px;">
                            <h2 style="margin:0 0 20px; font-size:20px; font-weight:800; color:#ffffff; letter-spacing:-0.3px;">
                                ¡Hola, ${userName || (isB2B ? 'equipo' : 'cliente')}!
                            </h2>

                            ${isB2B ? `
                            <p style="margin:0 0 20px; font-size:15px; line-height:1.6; color:rgba(255,255,255,0.7);">
                                Te adjuntamos la propuesta de ayudas para el expediente de vuestro cliente <strong style="color:#ffffff;">${summaryData.clienteName || ''}</strong> (Exp. ${summaryData.id}).
                            </p>
                            ` : ''}

                            ${summaryData.isBoth ? `
                                <!-- CASO COMPARATIVA -->
                                <p style="margin:0 0 20px; font-size:15px; line-height:1.6; color:rgba(255,255,255,0.7);">
                                    Tal y como acordamos, te adjunto la simulación de las ayudas para tu proyecto, presentando las siguientes opciones para tu vivienda:
                                </p>

                                <!-- OPCION 1 -->
                                <div style="background-color:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:16px; padding:20px; margin-bottom:15px;">
                                    <p style="margin:0 0 10px; font-size:13px; font-weight:700; color:#f59e0b; text-transform:uppercase; letter-spacing:1px;">Opción 1: Solo aerotermia</p>
                                    <p style="margin:0 0 12px; font-size:14px; line-height:1.5; color:rgba(255,255,255,0.6);">
                                        Ayuda directa Bono CAE de <strong style="color:#ffffff;">${summaryData.fAero.caeBonus}</strong>. Sumando deducciones IRPF (${summaryData.fAero.irpfDeduction}), alcanzarías un total de:
                                    </p>
                                    <p style="margin:0; font-size:20px; font-weight:800; color:#ffffff;">${summaryData.fAero.totalAyuda}</p>
                                </div>

                                <!-- OPCION 2 -->
                                <div style="background-color:rgba(245,158,11,0.05); border:1px solid rgba(245,158,11,0.2); border-radius:16px; padding:20px; margin-bottom:25px;">
                                    <p style="margin:0 0 10px; font-size:13px; font-weight:700; color:#f59e0b; text-transform:uppercase; letter-spacing:1px;">Opción 2: Mejora de envolvente</p>
                                    <p style="margin:0 0 12px; font-size:14px; line-height:1.5; color:rgba(255,255,255,0.6);">
                                        En este caso, la ayuda del Bono CAE asciende a <strong style="color:#ffffff;">${summaryData.f80.caeBonus}</strong>. Sumando las deducciones del IRPF (${summaryData.f80.irpfDeduction}), el total llegaría a:
                                    </p>
                                    <p style="margin:0; font-size:24px; font-weight:900; color:#f59e0b;">${summaryData.f80.totalAyuda}</p>
                                </div>
                            ` : summaryData.isOnlyReforma ? `
                                <!-- CASO SOLO REFORMA -->
                                <p style="margin:0 0 15px; font-size:15px; line-height:1.6; color:rgba(255,255,255,0.7);">
                                    Tal y como acordamos, te adjunto la simulación de las ayudas para tu expediente de Reforma Energética, donde detallamos los ahorros que puedes obtener.
                                </p>
                                <p style="margin:0 0 15px; font-size:15px; line-height:1.6; color:rgba(255,255,255,0.7);">
                                    🔹 <strong>Bono Energético:</strong> Podrías obtener una ayuda de <strong style="color:#f59e0b; font-size: 19px;">${summaryData.f80.caeBonus}</strong> gestionada a través de BROKERGY.
                                </p>
                                <p style="margin:0 0 15px; font-size:15px; line-height:1.6; color:rgba(255,255,255,0.7);">
                                    Además, el importe estimado de deducciones en el IRPF sería de <strong style="color:#10b981;">${summaryData.f80.irpfDeduction}</strong>.
                                </p>
                                <div style="background-color:rgba(245,158,11,0.05); border:1px dashed rgba(245,158,11,0.3); border-radius:16px; padding:20px; margin:25px 0; text-align:center;">
                                    <p style="margin:0; font-size:14px; font-weight:600; color:#f59e0b; text-transform:uppercase; letter-spacing:1px;">Resumen total de ayudas</p>
                                    <p style="margin:5px 0 0; font-size:32px; font-weight:900; color:#ffffff;">Hasta ${summaryData.f80.totalAyuda}</p>
                                </div>
                            ` : `
                                <!-- CASO SOLO AEROTERMIA (ORIGINAL) -->
                                <p style="margin:0 0 15px; font-size:15px; line-height:1.6; color:rgba(255,255,255,0.7);">
                                    Ya hemos podido realizar los cálculos de las ayudas a las que puedes optar para tu instalación de aerotermia.
                                </p>
                                <p style="margin:0 0 15px; font-size:15px; line-height:1.6; color:rgba(255,255,255,0.7);">
                                    🔹 <strong>Bono Energético:</strong> Podrías obtener una ayuda de <strong style="color:#f59e0b; font-size: 19px;">${summaryData.caeBonus}</strong> gracias al Bono Energético BROKERGY.
                                </p>
                                <p style="margin:0 0 15px; font-size:15px; line-height:1.6; color:rgba(255,255,255,0.7);">
                                    Además, si en tu caso puedes acogerte a las deducciones en el IRPF, el importe estimado sería de <strong style="color:#10b981;">${summaryData.irpfDeduction}</strong>.
                                </p>
                                <div style="background-color:rgba(245,158,11,0.05); border:1px dashed rgba(245,158,11,0.3); border-radius:16px; padding:20px; margin:25px 0; text-align:center;">
                                    <p style="margin:0; font-size:14px; font-weight:600; color:#f59e0b; text-transform:uppercase; letter-spacing:1px;">Resumen total de ayudas</p>
                                    <p style="margin:5px 0 0; font-size:32px; font-weight:900; color:#ffffff;">Hasta ${summaryData.totalAyuda}</p>
                                </div>
                            `}

                            ${!isB2B ? `
                            <p style="margin:0 0 30px; font-size:13px; line-height:1.6; color:rgba(255,255,255,0.4);">
                                💡 Recordatorio: Para las deducciones del IRPF debes contar con retenciones aplicables. Nosotros dejaremos toda la parte técnica preparada para tu solicitud.
                            </p>
                            ` : ''}

                            ${tableHtml}

                            <h3 style="margin:25px 0 15px; font-size:16px; font-weight:700; color:#ffffff;">Pasos a seguir:</h3>
                            ${isB2B ? `
                            <ul style="margin:0 0 30px; padding:0 0 0 20px; font-size:14px; line-height:1.8; color:rgba(255,255,255,0.6);">
                                <li>El cliente debe <strong>aceptar el presupuesto de instalación</strong>.</li>
                                <li>El cliente debe <strong>aceptar la propuesta</strong> adjunta en PDF. Es vital presentar el CEE Inicial antes de cualquier factura para no perder las ayudas.</li>
                            </ul>
                            <p style="margin:0 0 20px; font-size:14px; line-height:1.6; color:rgba(255,255,255,0.6);">
                                Podéis compartir este enlace de firma directamente con el cliente:
                            </p>
                            ` : `
                            <ul style="margin:0 0 30px; padding:0 0 0 20px; font-size:14px; line-height:1.8; color:rgba(255,255,255,0.6);">
                                <li><strong>Aceptar el presupuesto</strong> al instalador.</li>
                                <li><strong>Aceptar la propuesta</strong> adjunta en PDF. Es vital presentar el Certificado Inicial antes de cualquier factura para asegurar las deducciones fiscales.</li>
                            </ul>
                            `}

                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td align="center" style="padding-bottom: 15px;">
                                        <a href="${process.env.FRONTEND_URL || 'https://app.brokergy.es'}/api/public/propuesta/${summaryData.urlId || summaryData.id}" target="_blank" style="display:inline-block; padding:14px 40px; background-color:#2563eb; color:#ffffff; font-size:15px; font-weight:700; text-decoration:none; border-radius:12px; letter-spacing:0.3px; width: 80%; max-width: 300px;">
                                            📄 VER PROPUESTA ONLINE
                                        </a>
                                    </td>
                                </tr>
                                <tr>
                                    <td align="center">
                                        <a href="${process.env.FRONTEND_URL || 'https://app.brokergy.es'}/firma/${summaryData.urlId || summaryData.id}" target="_blank" style="display:inline-block; padding:14px 40px; background:linear-gradient(135deg, #f59e0b, #ea580c); color:#0a0e1a; font-size:15px; font-weight:900; text-decoration:none; border-radius:12px; letter-spacing:0.3px; width: 80%; max-width: 300px; box-shadow: 0 4px 15px rgba(245,158,11,0.3);">
                                            ✍️ ${isB2B ? 'ENLACE DE FIRMA PARA EL CLIENTE' : 'ACEPTAR Y FIRMAR'}
                                        </a>
                                    </td>
                                </tr>
                            </table>

                            <p style="margin:30px 0 0; font-size:14px; line-height:1.6; color:rgba(255,255,255,0.5); text-align:center;">
                                Quedo a ${isB2B ? 'vuestra' : 'tu'} disposición para cualquier duda o aclaración.
                            </p>
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="padding:10px 40px 40px; text-align:center; background-color:rgba(255,255,255,0.02);">
                            <p style="margin:0; font-size:13px; font-weight:700; color:rgba(255,255,255,0.9);">
                                BROKERGY · Ingeniería Energética
                            </p>
                            <p style="margin:5px 0 0; font-size:12px; color:rgba(255,255,255,0.4);">
                                <a href="https://brokergy.es" style="color:#f59e0b; text-decoration:none;">brokergy.es</a>
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;

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

    const html = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; background-color:#0a0e1a; font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; color:#ffffff;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0e1a; padding:40px 20px;">
        <tr>
            <td align="center">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px; background-color:#111827; border-radius:24px; border:1px solid rgba(255,255,255,0.06); overflow:hidden;">
                    
                    <!-- Header gradient bar -->
                    <tr>
                        <td style="height:4px; background:linear-gradient(90deg, #f59e0b, #ea580c);"></td>
                    </tr>
                    
                    <!-- Logo / Brand -->
                    <tr>
                        <td style="padding:40px 40px 20px;">
                            <div style="font-size:24px; font-weight:900; letter-spacing:-0.5px; text-align:center;">
                                <span style="color:#f59e0b;">BROKERGY </span>
                                <span style="color:#ffffff; font-weight: 500;">· Ingeniería Energética</span>
                            </div>
                        </td>
                    </tr>
                    
                    <!-- Content Body -->
                    <tr>
                        <td style="padding:10px 40px 30px;">
                            <h2 style="margin:0 0 20px; font-size:20px; font-weight:800; color:#ffffff; letter-spacing:-0.3px;">
                                ¡Hola, ${userName || 'cliente'}!
                            </h2>
                            <p style="margin:0 0 15px; font-size:15px; line-height:1.6; color:rgba(255,255,255,0.7);">
                                Hemos recibido correctamente la aceptación de tu propuesta. <strong>Muchas gracias por confiar en Brokergy.</strong>
                            </p>
                            
                            ${numeroExpediente ? `
                            <div style="margin: 20px 0; padding: 15px; background-color: rgba(245,158,11,0.1); border-left: 4px solid #f59e0b; border-radius: 4px;">
                                <p style="margin: 0; font-size: 15px; color: #ffffff;">
                                    Tu número de expediente asignado es: <strong style="color: #f59e0b;">${numeroExpediente}</strong>
                                </p>
                            </div>
                            ` : ''}

                            <p style="margin:0 0 25px; font-size:15px; line-height:1.6; color:rgba(255,255,255,0.7);">
                                A partir de este momento, uno de nuestros certificadores comenzará a preparar el <strong style="color:#f59e0b;">Certificado de Eficiencia Energética inicial</strong>. 
                                Es muy importante que este certificado quede emitido y registrado <strong>antes de la última factura de la obra</strong>, ya que, de lo contrario, podrían surgir problemas para aplicar las deducciones fiscales. Además, este documento es necesario para tramitar correctamente tu expediente CAE.
                            </p>
                            
                            <div style="background-color:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.08); border-radius:16px; padding:25px; margin:25px 0;">
                                <h3 style="margin:0 0 15px; font-size:14px; font-weight:800; color:#f59e0b; text-transform:uppercase; letter-spacing:1px;">📁 Documentación previa necesaria</h3>
                                <ul style="margin:0; padding:0 0 0 18px; font-size:14px; line-height:1.8; color:rgba(255,255,255,0.6);">
                                    <li>Planos de la vivienda o croquis de distribución.</li>
                                    <li>Foto general de la caldera existente.</li>
                                    <li>Foto de la placa de características de la caldera, bien legible.</li>
                                    <li>Si la caldera ya no está instalada, fotos del hueco donde estaba.</li>
                                    <li>Fotos de los radiadores (al menos uno por estancia) o del colector, si hay suelo radiante.</li>
                                    <li>Vídeo corto recorriendo la vivienda, mostrando estancias, ventanas, puertas y accesos al exterior.</li>
                                    <li>Fotos de las fachadas o paredes exteriores, incluyendo ventanas y puertas.</li>
                                    <li>Si vas a cambiar ventanas o mejorar aislamiento, fotos y presupuesto.</li>
                                </ul>
                            </div>

                            <p style="margin:0 0 15px; font-size:14px; line-height:1.6; color:rgba(255,255,255,0.5);">
                                No hace falta que nos lo envíes todo de una sola vez; puedes mandarlo poco a poco conforme lo vayas recopilando.
                            </p>
                            
                            <p style="margin:0 0 20px; font-size:14px; line-height:1.6; color:#f59e0b;">
                                <strong>Importante:</strong> procura que las fotos tengan buena luz y que las placas de características se vean perfectamente, para evitar retrasos en la tramitación.
                            </p>

                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top: 30px;">
                                <tr>
                                    <td>
                                        <h3 style="margin:0 0 15px; font-size:16px; font-weight:700; color:#ffffff;">Puedes enviarlo por:</h3>
                                        
                                        ${uploadLink ? `
                                        <div style="margin-bottom: 20px; text-align: center;">
                                            <a href="${uploadLink}" target="_blank" style="display:inline-block; padding:14px 40px; background:linear-gradient(135deg, #0f8f66, #047857); color:#ffffff; font-size:15px; font-weight:900; text-decoration:none; border-radius:12px; letter-spacing:0.3px; width: 80%; max-width: 300px; box-shadow: 0 4px 15px rgba(16,185,129,0.3);">
                                                📂 SUBIR DOCUMENTACIÓN AQUÍ
                                            </a>
                                        </div>
                                        ` : ''}

                                        <div style="display: flex; gap: 15px; align-items: center; margin-bottom: 20px;">
                                            <div style="flex: 1; background-color:rgba(37,99,235,0.1); border:1px solid rgba(37,99,235,0.2); border-radius:12px; padding:15px; text-align:center;">
                                                <div style="font-size: 11px; text-transform: uppercase; color: #60a5fa; font-weight: 800; margin-bottom: 5px;">Email</div>
                                                <a href="mailto:info@brokergy.es?subject=${encodeURIComponent(`Documentación Expediente ${numeroExpediente || ''}`)}" style="color:#ffffff; text-decoration:none; font-weight:700; font-size: 14px;">info@brokergy.es</a>
                                            </div>
                                            <div style="flex: 1; background-color:rgba(16,185,129,0.1); border:1px solid rgba(16,185,129,0.2); border-radius:12px; padding:15px; text-align:center;">
                                                <div style="font-size: 11px; text-transform: uppercase; color: #34d399; font-weight: 800; margin-bottom: 5px;">WhatsApp</div>
                                                <a href="${whatsAppLink}" style="color:#ffffff; text-decoration:none; font-weight:700; font-size: 14px;">623 926 179</a>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            </table>

                            <p style="margin:30px 0 0; font-size:14px; line-height:1.6; color:rgba(255,255,255,0.5); text-align:center;">
                                En cuanto recibamos la documentación, continuaremos con la tramitación de tu expediente.
                            </p>
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="padding:10px 40px 40px; text-align:center; background-color:rgba(255,255,255,0.02);">
                            <p style="margin:0; font-size:13px; font-weight:700; color:rgba(255,255,255,0.9);">
                                Un saludo,<br>Equipo BROKERGY
                            </p>
                            <p style="margin:10px 0 0; font-size:12px; color:rgba(255,255,255,0.4);">
                                <a href="https://brokergy.es" style="color:#f59e0b; text-decoration:none;">brokergy.es</a>
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;

    const text = `¡Hola, ${userName}!\n\nHemos recibido correctamente la aceptación de tu propuesta. Muchas gracias.\n\n${numeroExpediente ? `Tu número de expediente es: ${numeroExpediente}\n\n` : ''}A partir de ahora, comenzaremos a preparar el Certificado de Eficiencia Energética inicial.\n\nNecesitamos que nos envíes la siguiente documentación:\n- Planos o croquis.\n- Fotos de la caldera y su placa.\n- Fotos de radiadores/colector.\n- Vídeo corto de la vivienda.\n- Fotos de fachadas y ventanas.\n\n${uploadLink ? `Puedes subir tu documentación directamente aquí:\n${uploadLink}\n\nO también p` : `P`}uedes enviarlo por:\nEmail: info@brokergy.es\nWhatsApp: 623 926 179\n\nUn saludo,\nEquipo BROKERGY`;

    return sendMail({ to, subject, html, text });
};

/**
 * Envía anexos (Anexo I, Anexo Cesión, etc.) por correo
 */
const sendAnnexEmail = async ({ to, userName, attachments, customMessage, summaryData }) => {
    const docType = summaryData?.docType || 'Documentación';
    const subject = `${docType} — Brokergy (${summaryData.id})`;
    
    // Convertir formato WhatsApp (*bold*) a HTML (<b>bold</b>)
    const formattedMessage = customMessage ? customMessage.replace(/\*(.*?)\*/g, '<b style="color:#ffffff;">$1</b>') : null;
    
    const html = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; background-color:#0a0e1a; font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; color:#ffffff;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0e1a; padding:40px 20px;">
        <tr>
            <td align="center">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px; background-color:#111827; border-radius:24px; border:1px solid rgba(255,255,255,0.06); overflow:hidden;">
                    
                    <!-- Header gradient bar -->
                    <tr>
                        <td style="height:4px; background:linear-gradient(90deg, #f59e0b, #ea580c);"></td>
                    </tr>
                    
                    <!-- Logo / Brand -->
                    <tr>
                        <td style="padding:40px 40px 20px; text-align:center;">
                            <div style="font-size:24px; font-weight:900; letter-spacing:-0.5px;">
                                <span style="color:#f59e0b;">BROKERGY </span>
                                <span style="color:#ffffff; font-weight: 500;">· Ingeniería Energética</span>
                            </div>
                        </td>
                    </tr>
                    
                    <!-- Content Body -->
                    <tr>
                        <td style="padding:10px 40px 40px;">
                            <div style="font-size:15px; line-height:1.7; color:rgba(255,255,255,0.8); white-space: pre-wrap;">${formattedMessage || `Hola, ${userName || 'cliente'}. Adjuntamos la documentación solicitada relativa a tu expediente ${summaryData.id}.`}</div>
                            
                            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.06); text-align:center;">
                                <p style="margin:0; font-size:13px; color:rgba(255,255,255,0.4);">
                                    Quedamos a tu disposición para cualquier duda o aclaración.
                                </p>
                            </div>
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="padding:20px 40px 40px; text-align:center; background-color:rgba(255,255,255,0.02);">
                            <p style="margin:0; font-size:13px; font-weight:700; color:rgba(255,255,255,0.9);">
                                BROKERGY · Ingeniería Energética
                            </p>
                            <p style="margin:5px 0 0; font-size:12px; color:rgba(255,255,255,0.4);">
                                <a href="https://brokergy.es" style="color:#f59e0b; text-decoration:none;">brokergy.es</a>
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;

    const text = customMessage || `Hola ${userName},\n\nAdjuntamos la documentación solicitada (${docType}) para tu expediente ${summaryData.id}.\n\nQuedamos a tu disposición.\n\nBROKERGY · Ingeniería Energética`;

    return sendMail({ to, subject, html, text, attachments });
};

/**
 * Notifica a la administración (ADMIN) de que un distribuidor ha aceptado una oportunidad.
 */
const sendAdminNotificationEmail = async ({ numeroExpediente, clientName, address, distributorName, installerName, notes, expedienteId }) => {
    const to = 'franciscojavier.moya.s2e2@gmail.com';
    const subject = `${numeroExpediente || 'S/N'} – ACEPTACION DE EXPEDIENTE`;
    const deepLink = `${process.env.FRONTEND_URL || 'https://app.brokergy.es'}?exp=${numeroExpediente || ''}`;

    const html = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; background-color:#0a0e1a; font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; color:#ffffff;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0e1a; padding:40px 20px;">
        <tr>
            <td align="center">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px; background-color:#111827; border-radius:24px; border:1px solid rgba(255,255,255,0.06); overflow:hidden;">
                    <tr>
                        <td style="height:4px; background:linear-gradient(90deg, #f59e0b, #ea580c);"></td>
                    </tr>
                    <tr>
                        <td style="padding:30px 40px; text-align:center;">
                            <div style="font-size:22px; font-weight:900; letter-spacing:-0.5px; color:#f59e0b;">
                                ACEPTACIÓN DE EXPEDIENTE
                            </div>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:0 40px 30px;">
                            <p style="margin:0 0 20px; font-size:16px; line-height:1.6; color:#ffffff;">
                                ¡Hola BROKERGY! 👋
                            </p>
                            <p style="margin:0 0 20px; font-size:15px; line-height:1.6; color:rgba(255,255,255,0.7);">
                                El cliente <strong>${clientName || 'S/N'}</strong> ha firmado y aceptado la propuesta desde el portal público. Se ha generado un nuevo expediente automáticamente.
                            </p>
                            
                            <div style="background-color:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:16px; padding:20px; margin-bottom:25px;">
                                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                                    <tr><td style="padding:5px 0; font-size:13px; color:rgba(255,255,255,0.4); text-transform:uppercase;">Expediente</td></tr>
                                    <tr><td style="padding:0 0 15px; font-size:18px; font-weight:800; color:#f59e0b;">${numeroExpediente || 'PENDIENTE'}</td></tr>
                                    
                                    <tr><td style="padding:5px 0; font-size:13px; color:rgba(255,255,255,0.4); text-transform:uppercase;">Cliente</td></tr>
                                    <tr><td style="padding:0 0 15px; font-size:15px; font-weight:700; color:#ffffff;">${clientName || 'S/N'}</td></tr>
                                    
                                    <tr><td style="padding:5px 0; font-size:13px; color:rgba(255,255,255,0.4); text-transform:uppercase;">Dirección</td></tr>
                                    <tr><td style="padding:0 0 15px; font-size:14px; color:rgba(255,255,255,0.7);">${address || 'S/N'}</td></tr>
                                    
                                    <tr><td style="padding:5px 0; font-size:13px; color:rgba(255,255,255,0.4); text-transform:uppercase;">Instalador</td></tr>
                                    <tr><td style="padding:0 0 15px; font-size:14px; color:rgba(255,255,255,0.7);">${installerName || 'No asignado'}</td></tr>

                                    ${notes ? `
                                    <tr><td style="padding:5px 0; font-size:13px; color:rgba(255,255,255,0.4); text-transform:uppercase;">Notas</td></tr>
                                    <tr><td style="padding:0 0 15px; font-size:14px; color:rgba(255,255,255,0.7); font-style:italic;">"${notes}"</td></tr>
                                    ` : ''}
                                </table>
                            </div>

                            <p style="margin:0 0 30px; font-size:14px; line-height:1.6; color:rgba(255,255,255,0.6);">
                                Debes ponerte en contacto con el cliente para iniciar el expediente para realizar el Certificado de Eficiencia Energética.
                            </p>

                            <div style="text-align:center;">
                                <a href="${deepLink}" target="_blank" style="display:inline-block; padding:14px 40px; background:linear-gradient(135deg, #f59e0b, #ea580c); color:#0a0e1a; font-size:15px; font-weight:900; text-decoration:none; border-radius:12px; letter-spacing:0.3px; box-shadow: 0 4px 15px rgba(245,158,11,0.3);">
                                    🚀 GESTIONAR EXPEDIENTE
                                </a>
                            </div>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:20px 40px 40px; text-align:center; background-color:rgba(255,255,255,0.02);">
                            <p style="margin:0; font-size:12px; color:rgba(255,255,255,0.2); text-transform:uppercase; letter-spacing:1px;">
                                Sistema Automático Brokergy
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;

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
}) => {
    const isReforma = ficha === 'RES080';
    const tipoLabel = tipoActuacion || (isReforma ? 'REFORMA' : ficha === 'RES093' ? 'HIBRIDACIÓN' : 'AEROTERMIA');
    const clienteUpper = (clienteName || '').toUpperCase().trim();
    const isUrgent = priority === 'urgent';
    const subject = `${isUrgent ? '🚨 URGENTE — ' : ''}“${expedienteNum} ENCARGO CEE (${tipoLabel}) – “${clienteUpper}”`;

    const urgentBannerHtml = isUrgent ? `
        <tr><td style="padding:14px 24px; background:linear-gradient(135deg,#dc2626,#991b1b); text-align:center;">
            <p style="margin:0; font-size:13px; font-weight:900; color:#ffffff; letter-spacing:2px; text-transform:uppercase;">🚨 Encargo Urgente 🚨</p>
        </td></tr>
    ` : '';

    const adminMessageHtml = adminMessage ? `
        <div style="background:rgba(245,158,11,0.06); border-left:3px solid #f59e0b; border-radius:10px; padding:16px 20px; margin:22px 0;">
            <p style="margin:0 0 8px; font-size:11px; font-weight:800; color:#f59e0b; text-transform:uppercase; letter-spacing:1.5px;">💬 Mensaje de Brokergy</p>
            <p style="margin:0; font-size:14px; line-height:1.6; color:rgba(255,255,255,0.85); white-space:pre-wrap;">${escapeHtml(adminMessage)}</p>
        </div>
    ` : '';

    const directrizHtml = isReforma ? `
        <div style="background:rgba(245,158,11,0.08); border:1px solid rgba(245,158,11,0.3); border-radius:14px; padding:20px 24px; margin:20px 0;">
            <p style="margin:0 0 6px; font-size:11px; font-weight:800; color:#f59e0b; text-transform:uppercase; letter-spacing:1.5px;">⚡ Directriz Técnica — RES080</p>
            <p style="margin:0 0 10px; font-size:14px; color:rgba(255,255,255,0.65); line-height:1.6;">
                Para garantizar el éxito del expediente, el ahorro energético certificado debe situarse, como <strong style="color:#ffffff;">objetivo de seguridad</strong>, <strong style="color:#ffffff;">por encima</strong> de los <strong style="color:#f59e0b;">${ahorroObjetivo ? Math.round(ahorroObjetivo).toLocaleString('es-ES') + ' kWh/año' : '—'}</strong> estimados en la propuesta comercial.
            </p>
            <div style="display:flex; gap:12px; flex-wrap:wrap;">
                <div style="flex:1; min-width:160px; text-align:center; padding:14px; background:rgba(0,0,0,0.3); border-radius:10px;">
                    <p style="margin:0; font-size:12px; color:rgba(255,255,255,0.4); text-transform:uppercase; letter-spacing:1px;">Ahorro mínimo esperado</p>
                    <p style="margin:4px 0 0; font-size:26px; font-weight:900; color:#f59e0b;">${ahorroObjetivo ? Math.round(ahorroObjetivo).toLocaleString('es-ES') + ' kWh/año' : 'Consultar propuesta'}</p>
                </div>
                ${demandaPerM2 ? `<div style="flex:1; min-width:160px; text-align:center; padding:14px; background:rgba(0,0,0,0.3); border-radius:10px;">
                    <p style="margin:0; font-size:12px; color:rgba(255,255,255,0.4); text-transform:uppercase; letter-spacing:1px;">Demanda calefacción</p>
                    <p style="margin:4px 0 0; font-size:26px; font-weight:900; color:#f59e0b;">${demandaPerM2.toFixed(1).replace('.', ',')} kWh/m²·año</p>
                </div>` : ''}
            </div>
        </div>
    ` : `
        <div style="background:rgba(245,158,11,0.08); border:1px solid rgba(245,158,11,0.3); border-radius:14px; padding:20px 24px; margin:20px 0;">
            <p style="margin:0 0 6px; font-size:11px; font-weight:800; color:#f59e0b; text-transform:uppercase; letter-spacing:1.5px;">⚡ Directriz Técnica — ${ficha || 'RES060/RES093'}</p>
            <p style="margin:0 0 10px; font-size:14px; color:rgba(255,255,255,0.65); line-height:1.6;">
                Para garantizar el éxito del expediente, la demanda específica de calefacción certificada debe situarse, como <strong style="color:#ffffff;">objetivo de seguridad</strong>, <strong style="color:#ffffff;">por encima</strong> del valor estimado en la propuesta comercial.
            </p>
            <div style="text-align:center; padding:18px; background:rgba(0,0,0,0.3); border-radius:10px;">
                <p style="margin:0; font-size:12px; color:rgba(255,255,255,0.4); text-transform:uppercase; letter-spacing:1px;">Demanda mínima esperada</p>
                <p style="margin:4px 0 0; font-size:28px; font-weight:900; color:#f59e0b;">${demandaPerM2 ? demandaPerM2.toFixed(1).replace('.', ',') + ' kWh/m²·año' : 'Consultar propuesta'}</p>
            </div>
        </div>
    `;

    // Bloque de datos del cliente (solo si hay info)
    const clienteInfoHtml = clienteData ? `
        <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:14px; padding:18px 22px; margin:24px 0;">
            <p style="margin:0 0 12px; font-size:11px; font-weight:800; color:rgba(255,255,255,0.55); text-transform:uppercase; letter-spacing:1.5px;">📋 Datos del cliente</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px; line-height:1.7; color:rgba(255,255,255,0.7);">
                ${clienteData.nombre ? `<tr><td style="width:140px; padding:3px 0; color:rgba(255,255,255,0.4); font-size:11px; text-transform:uppercase; letter-spacing:0.5px;">Nombre y apellidos</td><td style="padding:3px 0; color:#ffffff; font-weight:600;">${clienteData.nombre}</td></tr>` : ''}
                ${clienteData.dni ? `<tr><td style="padding:3px 0; color:rgba(255,255,255,0.4); font-size:11px; text-transform:uppercase; letter-spacing:0.5px;">DNI</td><td style="padding:3px 0; color:#ffffff; font-family:monospace;">${clienteData.dni}</td></tr>` : ''}
                ${clienteData.tlf ? `<tr><td style="padding:3px 0; color:rgba(255,255,255,0.4); font-size:11px; text-transform:uppercase; letter-spacing:0.5px;">Teléfono</td><td style="padding:3px 0;"><a href="tel:${clienteData.tlf}" style="color:#f59e0b; text-decoration:none;">${clienteData.tlf}</a></td></tr>` : ''}
                ${clienteData.email ? `<tr><td style="padding:3px 0; color:rgba(255,255,255,0.4); font-size:11px; text-transform:uppercase; letter-spacing:0.5px;">Email</td><td style="padding:3px 0;"><a href="mailto:${clienteData.email}" style="color:#f59e0b; text-decoration:none;">${clienteData.email}</a></td></tr>` : ''}
                ${clienteData.refCatastral ? `<tr><td style="padding:3px 0; color:rgba(255,255,255,0.4); font-size:11px; text-transform:uppercase; letter-spacing:0.5px;">Referencia Catrastral</td><td style="padding:3px 0; color:#ffffff; font-family:monospace; font-size:12px;">${clienteData.refCatastral}</td></tr>` : ''}
                ${clienteData.direccion ? `<tr><td style="padding:3px 0; color:rgba(255,255,255,0.4); font-size:11px; text-transform:uppercase; letter-spacing:0.5px; vertical-align:top;">Dirección completa</td><td style="padding:3px 0; color:#ffffff;">${clienteData.direccion}</td></tr>` : ''}
            </table>
        </div>
    ` : '';

    const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0; padding:0; background-color:#0a0e1a; font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; color:#ffffff;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0e1a; padding:40px 20px;">
        <tr><td align="center">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px; background-color:#111827; border-radius:24px; border:1px solid rgba(255,255,255,0.06); overflow:hidden;">
                <tr><td style="height:4px; background:linear-gradient(90deg, #f59e0b, #ea580c);"></td></tr>
                ${urgentBannerHtml}
                <tr>
                    <td style="padding:40px 40px 10px;">
                        <div style="font-size:22px; font-weight:900; letter-spacing:-0.5px; text-align:center;">
                            <span style="color:#f59e0b;">BROKERGY </span><span style="color:#ffffff; font-weight:500;">· Ingeniería Energética</span>
                        </div>
                    </td>
                </tr>
                <tr>
                    <td style="padding:10px 40px 30px;">
                        <h2 style="margin:0 0 6px; font-size:19px; font-weight:800; color:#ffffff;">Hola ${certName || 'técnico'}!</h2>
                        <p style="margin:0 0 16px; font-size:14px; line-height:1.6; color:rgba(255,255,255,0.6);">
                            Te asignamos el expediente <strong style="color:#f59e0b;">${expedienteNum}</strong>
                            ${clienteName ? `del cliente <strong style="color:#ffffff;">${clienteName}</strong>` : ''} para la emisión del Certificado de Eficiencia Energética.
                        </p>

                        <p style="margin:8px 0 6px; font-size:14px; line-height:1.6; color:rgba(255,255,255,0.6);">
                            A continuación encontrarás las <strong style="color:#ffffff;">directrices técnicas</strong> que debes tener en cuenta para que los valores del certificado sean compatibles con la propuesta comercial presentada al cliente:
                        </p>

                        ${directrizHtml}

                        ${clienteInfoHtml}

                        ${adminMessageHtml}

                        <h3 style="margin:24px 0 12px; font-size:14px; font-weight:700; color:#ffffff;">Accesos directos:</h3>
                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                            ${ackLink ? `
                            <tr><td align="center" style="padding-bottom:12px;">
                                <a href="${ackLink}" target="_blank" style="display:inline-block; padding:14px 32px; background:linear-gradient(135deg, #10b981, #059669); color:#ffffff; font-size:14px; font-weight:800; text-decoration:none; border-radius:10px; width:80%; max-width:280px; box-sizing:border-box; text-align:center; text-transform:uppercase; letter-spacing:1px; box-shadow:0 4px 14px rgba(16,185,129,0.4);">
                                    ✅ Aceptar Encargo
                                </a>
                            </td></tr>` : ''}
                            ${portalLink ? `
                            <tr><td align="center" style="padding-bottom:10px;">
                                <a href="${portalLink}" target="_blank" style="display:inline-block; padding:12px 32px; background:linear-gradient(135deg, #f59e0b, #ea580c); color:#0a0e1a; font-size:14px; font-weight:800; text-decoration:none; border-radius:10px; width:80%; max-width:280px; box-sizing:border-box; text-align:center;">
                                    🔗 Acceder al Portal
                                </a>
                            </td></tr>` : ''}
                            ${ceeFolderLink ? `
                            <tr><td align="center">
                                <a href="${ceeFolderLink}" target="_blank" style="display:inline-block; padding:12px 32px; background-color:rgba(245,158,11,0.12); border:1px solid rgba(245,158,11,0.4); color:#f59e0b; font-size:14px; font-weight:800; text-decoration:none; border-radius:10px; width:80%; max-width:280px; box-sizing:border-box; text-align:center;">
                                    📁 Acceder a Carpeta CEE
                                </a>
                            </td></tr>` : ''}
                        </table>
                        ${ceeFolderLink ? `
                        <p style="margin:14px 0 0; font-size:12px; color:rgba(255,255,255,0.35); text-align:center;">
                            Tienes acceso de <strong style="color:rgba(255,255,255,0.55);">edición</strong> a la carpeta de documentos del expediente. Sube ahí el certificado emitido.
                        </p>` : ''}

                        <p style="margin:28px 0 0; font-size:13px; line-height:1.6; color:rgba(255,255,255,0.35); text-align:center;">
                            Ante cualquier duda técnica, contacta con Brokergy antes de emitir el certificado.
                        </p>
                    </td>
                </tr>
                <tr>
                    <td style="padding:10px 40px 32px; text-align:center; background-color:rgba(255,255,255,0.02); border-top:1px solid rgba(255,255,255,0.04);">
                        <p style="margin:0; font-size:12px; font-weight:700; color:rgba(255,255,255,0.5);">BROKERGY · Ingeniería Energética</p>
                        <p style="margin:4px 0 0; font-size:11px; color:rgba(255,255,255,0.25);"><a href="https://brokergy.es" style="color:#f59e0b; text-decoration:none;">brokergy.es</a></p>
                    </td>
                </tr>
            </table>
        </td></tr>
    </table>
</body>
</html>`;

    const clienteText = clienteData ? [
        clienteData.nombre ? `Cliente: ${clienteData.nombre}` : null,
        clienteData.dni ? `DNI: ${clienteData.dni}` : null,
        clienteData.tlf ? `Tlf: ${clienteData.tlf}` : null,
        clienteData.email ? `Email: ${clienteData.email}` : null,
        clienteData.refCatastral ? `Ref. Catastral: ${clienteData.refCatastral}` : null,
        clienteData.direccion ? `Dirección: ${clienteData.direccion}` : null,
    ].filter(Boolean).join('\n') + '\n\n' : '';

    const urgentText = isUrgent ? '🚨 URGENTE 🚨\n\n' : '';
    const adminMsgText = adminMessage ? `\nMensaje de Brokergy:\n${adminMessage}\n\n` : '';
    const text = `${urgentText}Hola ${certName}!\n\nTe asignamos el expediente ${expedienteNum}.\n\n${clienteText}${isReforma ? `Ahorro mínimo esperado: ${ahorroObjetivo ? Math.round(ahorroObjetivo) + ' kWh/año' : 'Consultar propuesta'}` : `Demanda mínima esperada: ${demandaPerM2 ? demandaPerM2.toFixed(1).replace('.', ',') + ' kWh/m²·año' : 'Consultar propuesta'}`}\n\n${adminMsgText}${ackLink ? 'Para aceptar el encargo haz clic aquí: ' + ackLink + '\n\n' : ''}${portalLink ? 'Portal: ' + portalLink + '\n' : ''}${ceeFolderLink ? 'Carpeta CEE: ' + ceeFolderLink : ''}\n\nBROKERGY · Ingeniería Energética`;

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
}) => {
    const isReforma = ficha === 'RES080';
    const tipoLabel = tipoActuacion || (isReforma ? 'REFORMA' : ficha === 'RES093' ? 'HIBRIDACIÓN' : 'AEROTERMIA');
    const clienteUpper = (clienteName || '').toUpperCase().trim();
    const isUrgent = priority === 'urgent';
    const subject = `${isUrgent ? '🚨 URGENTE — ' : ''}“${expedienteNum} ENCARGO CEE FINAL (${tipoLabel}) – “${clienteUpper}”`;

    const urgentBannerHtml = isUrgent ? `
        <tr><td style="padding:14px 24px; background:linear-gradient(135deg,#dc2626,#991b1b); text-align:center;">
            <p style="margin:0; font-size:13px; font-weight:900; color:#ffffff; letter-spacing:2px; text-transform:uppercase;">🚨 Encargo Urgente 🚨</p>
        </td></tr>
    ` : '';

    const adminMessageHtml = adminMessage ? `
        <div style="background:rgba(245,158,11,0.06); border-left:3px solid #f59e0b; border-radius:10px; padding:16px 20px; margin:22px 0;">
            <p style="margin:0 0 8px; font-size:11px; font-weight:800; color:#f59e0b; text-transform:uppercase; letter-spacing:1.5px;">💬 Mensaje de Brokergy</p>
            <p style="margin:0; font-size:14px; line-height:1.6; color:rgba(255,255,255,0.85); white-space:pre-wrap;">${escapeHtml(adminMessage)}</p>
        </div>
    ` : '';

    const clienteInfoHtml = clienteData ? `
        <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:14px; padding:18px 22px; margin:24px 0;">
            <p style="margin:0 0 12px; font-size:11px; font-weight:800; color:rgba(255,255,255,0.55); text-transform:uppercase; letter-spacing:1.5px;">📋 Datos del cliente</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px; line-height:1.7; color:rgba(255,255,255,0.7);">
                ${clienteData.nombre ? `<tr><td style="width:140px; padding:3px 0; color:rgba(255,255,255,0.4); font-size:11px; text-transform:uppercase; letter-spacing:0.5px;">Nombre y apellidos</td><td style="padding:3px 0; color:#ffffff; font-weight:600;">${clienteData.nombre}</td></tr>` : ''}
                ${clienteData.refCatastral ? `<tr><td style="padding:3px 0; color:rgba(255,255,255,0.4); font-size:11px; text-transform:uppercase; letter-spacing:0.5px;">Referencia Catrastral</td><td style="padding:3px 0; color:#ffffff; font-family:monospace; font-size:12px;">${clienteData.refCatastral}</td></tr>` : ''}
                ${clienteData.direccion ? `<tr><td style="padding:3px 0; color:rgba(255,255,255,0.4); font-size:11px; text-transform:uppercase; letter-spacing:0.5px; vertical-align:top;">Dirección completa</td><td style="padding:3px 0; color:#ffffff;">${clienteData.direccion}</td></tr>` : ''}
            </table>
        </div>
    ` : '';

    const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0; padding:0; background-color:#0a0e1a; font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; color:#ffffff;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0e1a; padding:40px 20px;">
        <tr><td align="center">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px; background-color:#111827; border-radius:24px; border:1px solid rgba(255,255,255,0.06); overflow:hidden;">
                <tr><td style="height:4px; background:linear-gradient(90deg, #f59e0b, #ea580c);"></td></tr>
                ${urgentBannerHtml}
                <tr>
                    <td style="padding:40px 40px 10px;">
                        <div style="font-size:22px; font-weight:900; letter-spacing:-0.5px; text-align:center;">
                            <span style="color:#f59e0b;">BROKERGY </span><span style="color:#ffffff; font-weight:500;">· Ingeniería Energética</span>
                        </div>
                    </td>
                </tr>
                <tr>
                    <td style="padding:10px 40px 30px;">
                        <h2 style="margin:0 0 6px; font-size:19px; font-weight:800; color:#ffffff;">¡Hola ${certName || 'técnico'}!</h2>
                        <p style="margin:0 0 16px; font-size:14px; line-height:1.6; color:rgba(255,255,255,0.6);">
                            Ya puedes proceder a la emisión del <strong style="color:#f59e0b;">Certificado de Eficiencia Energética FINAL</strong> para el expediente <strong style="color:#ffffff;">${expedienteNum}</strong>.
                        </p>

                        <p style="margin:8px 0 20px; font-size:14px; line-height:1.6; color:rgba(255,255,255,0.6);">
                            Toda la documentación necesaria (facturas, memorias de instalación, fotos de fin de obra) ya está disponible en la carpeta compartida.
                        </p>

                        ${clienteInfoHtml}

                        ${adminMessageHtml}

                        <h3 style="margin:24px 0 12px; font-size:14px; font-weight:700; color:#ffffff;">Accesos directos:</h3>
                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                            ${portalLink ? `
                            <tr><td align="center" style="padding-bottom:10px;">
                                <a href="${portalLink}" target="_blank" style="display:inline-block; padding:12px 32px; background:linear-gradient(135deg, #f59e0b, #ea580c); color:#0a0e1a; font-size:14px; font-weight:800; text-decoration:none; border-radius:10px; width:80%; max-width:280px; box-sizing:border-box; text-align:center;">
                                    🔗 Acceder al Portal
                                </a>
                            </td></tr>` : ''}
                            ${ceeFolderLink ? `
                            <tr><td align="center">
                                <a href="${ceeFolderLink}" target="_blank" style="display:inline-block; padding:12px 32px; background-color:rgba(245,158,11,0.12); border:1px solid rgba(245,158,11,0.4); color:#f59e0b; font-size:14px; font-weight:800; text-decoration:none; border-radius:10px; width:80%; max-width:280px; box-sizing:border-box; text-align:center;">
                                    📁 Acceder a Carpeta CEE
                                </a>
                            </td></tr>` : ''}
                        </table>

                        <p style="margin:28px 0 0; font-size:13px; line-height:1.6; color:rgba(255,255,255,0.35); text-align:center;">
                            Por favor, una vez emitido, sube el registro y la etiqueta a la misma carpeta o al portal.
                        </p>
                    </td>
                </tr>
                <tr>
                    <td style="padding:10px 40px 32px; text-align:center; background-color:rgba(255,255,255,0.02); border-top:1px solid rgba(255,255,255,0.04);">
                        <p style="margin:0; font-size:12px; font-weight:700; color:rgba(255,255,255,0.5);">BROKERGY · Ingeniería Energética</p>
                        <p style="margin:4px 0 0; font-size:11px; color:rgba(255,255,255,0.25);"><a href="https://brokergy.es" style="color:#f59e0b; text-decoration:none;">brokergy.es</a></p>
                    </td>
                </tr>
            </table>
        </td></tr>
    </table>
</body>
</html>`;

    const urgentText = isUrgent ? '🚨 URGENTE 🚨\n\n' : '';
    const adminMsgText = adminMessage ? `\nMensaje de Brokergy:\n${adminMessage}\n\n` : '';
    const text = `${urgentText}¡Hola ${certName}!\n\nYa puedes emitir el CEE FINAL para el expediente ${expedienteNum}.\n\n${adminMsgText}${ackLink ? 'Para aceptar el encargo haz clic aquí: ' + ackLink + '\n\n' : ''}Documentación disponible en: ${ceeFolderLink}\n\nBROKERGY · Ingeniería Energética`;

    return sendMail({ to, subject, html, text });
};

/**
 * Recordatorio suave al certificador
 */
const sendCertificadorReminderEmail = async ({
    to, certName, expedienteNum, clienteName, clienteData,
    ficha, tipoActuacion, ceeFolderLink, portalLink, ackLink
}) => {
    const tipoLabel = tipoActuacion || 'CEE';
    const clienteUpper = (clienteName || '').toUpperCase().trim();
    const subject = `Recordatorio: ${expedienteNum} (${tipoLabel}) – ${clienteUpper}`;

    const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0; padding:0; background-color:#0a0e1a; font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; color:#ffffff;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0e1a; padding:40px 20px;">
        <tr><td align="center">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px; background-color:#111827; border-radius:24px; border:1px solid rgba(255,255,255,0.06); overflow:hidden;">
                <tr><td style="height:4px; background:linear-gradient(90deg, #3b82f6, #6366f1);"></td></tr>
                <tr>
                    <td style="padding:40px 40px 10px;">
                        <div style="font-size:22px; font-weight:900; letter-spacing:-0.5px; text-align:center;">
                            <span style="color:#f59e0b;">BROKERGY </span><span style="color:#ffffff; font-weight:500;">· Ingeniería Energética</span>
                        </div>
                    </td>
                </tr>
                <tr>
                    <td style="padding:10px 40px 30px;">
                        <h2 style="margin:0 0 6px; font-size:19px; font-weight:800; color:#ffffff;">¡Hola ${certName || 'técnico'}! 👋</h2>
                        <p style="margin:0 0 16px; font-size:14px; line-height:1.6; color:rgba(255,255,255,0.6);">
                            Te escribimos para recordarte que tienes pendiente el encargo del expediente <strong style="color:#ffffff;">${expedienteNum}</strong>${clienteName ? ` de <strong style="color:#ffffff;">${clienteName}</strong>` : ''}.
                        </p>
                        <p style="margin:8px 0 20px; font-size:14px; line-height:1.6; color:rgba(255,255,255,0.6);">
                            ¿Podrías darnos una estimación de fecha de entrega? Nos ayudaría mucho para la planificación.
                        </p>

                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                            ${portalLink ? `<tr><td align="center" style="padding-bottom:10px;"><a href="${portalLink}" target="_blank" style="display:inline-block; padding:12px 32px; background:linear-gradient(135deg, #3b82f6, #6366f1); color:#ffffff; font-size:14px; font-weight:800; text-decoration:none; border-radius:10px; width:80%; max-width:280px; box-sizing:border-box; text-align:center;">🔗 Acceder al Portal</a></td></tr>` : ''}
                            ${ceeFolderLink ? `<tr><td align="center"><a href="${ceeFolderLink}" target="_blank" style="display:inline-block; padding:12px 32px; background-color:rgba(99,102,241,0.12); border:1px solid rgba(99,102,241,0.4); color:#818cf8; font-size:14px; font-weight:800; text-decoration:none; border-radius:10px; width:80%; max-width:280px; box-sizing:border-box; text-align:center;">📁 Carpeta CEE</a></td></tr>` : ''}
                        </table>

                        <p style="margin:28px 0 0; font-size:13px; line-height:1.6; color:rgba(255,255,255,0.35); text-align:center;">
                            Gracias por tu colaboración.
                        </p>
                    </td>
                </tr>
                <tr>
                    <td style="padding:10px 40px 32px; text-align:center; background-color:rgba(255,255,255,0.02); border-top:1px solid rgba(255,255,255,0.04);">
                        <p style="margin:0; font-size:12px; font-weight:700; color:rgba(255,255,255,0.5);">BROKERGY · Ingeniería Energética</p>
                    </td>
                </tr>
            </table>
        </td></tr>
    </table>
</body>
</html>`;

    const text = `¡Hola ${certName}!\n\nTe recordamos que tienes pendiente el expediente ${expedienteNum}${clienteName ? ` (${clienteName})` : ''}.\n\n¿Podrías darnos una estimación de fecha?\n\nBROKERGY · Ingeniería Energética`;

    return sendMail({ to, subject, html, text });
};

/**
 * Aviso urgente al certificador
 */
const sendCertificadorUrgentEmail = async ({
    to, certName, expedienteNum, clienteName, clienteData,
    ficha, tipoActuacion, ceeFolderLink, portalLink, ackLink
}) => {
    const tipoLabel = tipoActuacion || 'CEE';
    const clienteUpper = (clienteName || '').toUpperCase().trim();
    const subject = `⚠️ URGENTE: ${expedienteNum} (${tipoLabel}) – ${clienteUpper}`;

    const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0; padding:0; background-color:#0a0e1a; font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; color:#ffffff;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0e1a; padding:40px 20px;">
        <tr><td align="center">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px; background-color:#111827; border-radius:24px; border:1px solid rgba(255,255,255,0.06); overflow:hidden;">
                <tr><td style="height:4px; background:linear-gradient(90deg, #ef4444, #dc2626);"></td></tr>
                <tr>
                    <td style="padding:40px 40px 10px;">
                        <div style="font-size:22px; font-weight:900; letter-spacing:-0.5px; text-align:center;">
                            <span style="color:#f59e0b;">BROKERGY </span><span style="color:#ffffff; font-weight:500;">· Ingeniería Energética</span>
                        </div>
                    </td>
                </tr>
                <tr>
                    <td style="padding:10px 40px 30px;">
                        <div style="background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.3); border-radius:14px; padding:16px 20px; margin-bottom:20px; text-align:center;">
                            <p style="margin:0; font-size:12px; font-weight:900; color:#ef4444; text-transform:uppercase; letter-spacing:2px;">⚠️ Aviso Urgente</p>
                        </div>

                        <h2 style="margin:0 0 6px; font-size:19px; font-weight:800; color:#ffffff;">Hola ${certName || 'técnico'},</h2>
                        <p style="margin:0 0 16px; font-size:14px; line-height:1.6; color:rgba(255,255,255,0.6);">
                            Necesitamos con <strong style="color:#ef4444;">carácter urgente</strong> la documentación del expediente <strong style="color:#ffffff;">${expedienteNum}</strong>${clienteName ? ` de <strong style="color:#ffffff;">${clienteName}</strong>` : ''}.
                        </p>
                        <p style="margin:8px 0 20px; font-size:14px; line-height:1.6; color:rgba(255,255,255,0.6);">
                            Es importante que lo priorices para poder cumplir con los plazos establecidos en el programa de ayudas. Por favor, contacta con nosotros lo antes posible si hay algún impedimento.
                        </p>

                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                            ${portalLink ? `<tr><td align="center" style="padding-bottom:10px;"><a href="${portalLink}" target="_blank" style="display:inline-block; padding:12px 32px; background:linear-gradient(135deg, #ef4444, #dc2626); color:#ffffff; font-size:14px; font-weight:800; text-decoration:none; border-radius:10px; width:80%; max-width:280px; box-sizing:border-box; text-align:center;">🔗 Acceder al Portal</a></td></tr>` : ''}
                            ${ceeFolderLink ? `<tr><td align="center"><a href="${ceeFolderLink}" target="_blank" style="display:inline-block; padding:12px 32px; background-color:rgba(239,68,68,0.12); border:1px solid rgba(239,68,68,0.4); color:#ef4444; font-size:14px; font-weight:800; text-decoration:none; border-radius:10px; width:80%; max-width:280px; box-sizing:border-box; text-align:center;">📁 Carpeta CEE</a></td></tr>` : ''}
                        </table>

                        <p style="margin:28px 0 0; font-size:13px; line-height:1.6; color:rgba(255,255,255,0.35); text-align:center;">
                            Quedamos a la espera de tu respuesta.
                        </p>
                    </td>
                </tr>
                <tr>
                    <td style="padding:10px 40px 32px; text-align:center; background-color:rgba(255,255,255,0.02); border-top:1px solid rgba(255,255,255,0.04);">
                        <p style="margin:0; font-size:12px; font-weight:700; color:rgba(255,255,255,0.5);">BROKERGY · Ingeniería Energética</p>
                    </td>
                </tr>
            </table>
        </td></tr>
    </table>
</body>
</html>`;

    const text = `⚠️ URGENTE\n\nHola ${certName},\n\nNecesitamos con carácter urgente la documentación del expediente ${expedienteNum}${clienteName ? ` (${clienteName})` : ''}.\n\nPor favor, priorízalo para cumplir plazos.\n\nBROKERGY · Ingeniería Energética`;

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
    priority = 'normal',
    techMessage = null,
}) => {
    const to = 'franciscojavier.moya.s2e2@gmail.com'; // Email de administración
    const phaseLabel = phase === 'final' ? 'FINAL' : 'INICIAL';
    const isUrgent = priority === 'urgent';
    const clienteUpper = (clienteName || '').toUpperCase().trim();
    const subject = `${isUrgent ? '🚨 URGENTE — ' : ''}📢 REVISIÓN SOLICITADA — CEE ${phaseLabel} — ${numExp}${clienteUpper ? ` — “${clienteUpper}”` : ''}`;

    const finalPortalLink = portalLink || `${process.env.FRONTEND_URL || 'https://app.brokergy.es'}/?exp=${expedienteId}`;

    const urgentBannerHtml = isUrgent ? `
        <tr><td style="padding:14px 24px; background:linear-gradient(135deg,#dc2626,#991b1b); text-align:center;">
            <p style="margin:0; font-size:13px; font-weight:900; color:#ffffff; letter-spacing:2px; text-transform:uppercase;">🚨 Revisión Urgente Solicitada 🚨</p>
        </td></tr>
    ` : '';

    const techMessageHtml = techMessage ? `
        <div style="background:rgba(245,158,11,0.06); border-left:3px solid #f59e0b; border-radius:10px; padding:16px 20px; margin:22px 0;">
            <p style="margin:0 0 8px; font-size:11px; font-weight:800; color:#f59e0b; text-transform:uppercase; letter-spacing:1.5px;">💬 Mensaje del técnico</p>
            <p style="margin:0; font-size:14px; line-height:1.6; color:rgba(255,255,255,0.85); white-space:pre-wrap;">${escapeHtml(techMessage)}</p>
        </div>
    ` : '';

    // Bloque "Quién solicita la revisión" (certName + tlf + email del cert si los tenemos)
    const certInfoHtml = `
        <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:14px; padding:18px 22px; margin:24px 0;">
            <p style="margin:0 0 12px; font-size:11px; font-weight:800; color:rgba(255,255,255,0.55); text-transform:uppercase; letter-spacing:1.5px;">👤 Técnico que solicita la revisión</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px; line-height:1.7; color:rgba(255,255,255,0.7);">
                ${certName ? `<tr><td style="width:140px; padding:3px 0; color:rgba(255,255,255,0.4); font-size:11px; text-transform:uppercase; letter-spacing:0.5px;">Nombre</td><td style="padding:3px 0; color:#ffffff; font-weight:600;">${escapeHtml(certName)}</td></tr>` : ''}
                ${certPhone ? `<tr><td style="padding:3px 0; color:rgba(255,255,255,0.4); font-size:11px; text-transform:uppercase; letter-spacing:0.5px;">Teléfono</td><td style="padding:3px 0;"><a href="tel:${escapeHtml(certPhone)}" style="color:#f59e0b; text-decoration:none;">${escapeHtml(certPhone)}</a></td></tr>` : ''}
                ${certEmail ? `<tr><td style="padding:3px 0; color:rgba(255,255,255,0.4); font-size:11px; text-transform:uppercase; letter-spacing:0.5px;">Email</td><td style="padding:3px 0;"><a href="mailto:${escapeHtml(certEmail)}" style="color:#f59e0b; text-decoration:none;">${escapeHtml(certEmail)}</a></td></tr>` : ''}
            </table>
        </div>
    `;

    // Bloque "Datos del cliente"
    const clienteInfoHtml = clienteData ? `
        <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:14px; padding:18px 22px; margin:24px 0;">
            <p style="margin:0 0 12px; font-size:11px; font-weight:800; color:rgba(255,255,255,0.55); text-transform:uppercase; letter-spacing:1.5px;">📋 Datos del cliente</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px; line-height:1.7; color:rgba(255,255,255,0.7);">
                ${clienteData.nombre ? `<tr><td style="width:140px; padding:3px 0; color:rgba(255,255,255,0.4); font-size:11px; text-transform:uppercase; letter-spacing:0.5px;">Nombre y apellidos</td><td style="padding:3px 0; color:#ffffff; font-weight:600;">${escapeHtml(clienteData.nombre)}</td></tr>` : ''}
                ${clienteData.dni ? `<tr><td style="padding:3px 0; color:rgba(255,255,255,0.4); font-size:11px; text-transform:uppercase; letter-spacing:0.5px;">DNI</td><td style="padding:3px 0; color:#ffffff; font-family:monospace;">${escapeHtml(clienteData.dni)}</td></tr>` : ''}
                ${clienteData.tlf ? `<tr><td style="padding:3px 0; color:rgba(255,255,255,0.4); font-size:11px; text-transform:uppercase; letter-spacing:0.5px;">Teléfono</td><td style="padding:3px 0;"><a href="tel:${escapeHtml(clienteData.tlf)}" style="color:#f59e0b; text-decoration:none;">${escapeHtml(clienteData.tlf)}</a></td></tr>` : ''}
                ${clienteData.email ? `<tr><td style="padding:3px 0; color:rgba(255,255,255,0.4); font-size:11px; text-transform:uppercase; letter-spacing:0.5px;">Email</td><td style="padding:3px 0;"><a href="mailto:${escapeHtml(clienteData.email)}" style="color:#f59e0b; text-decoration:none;">${escapeHtml(clienteData.email)}</a></td></tr>` : ''}
                ${clienteData.refCatastral ? `<tr><td style="padding:3px 0; color:rgba(255,255,255,0.4); font-size:11px; text-transform:uppercase; letter-spacing:0.5px;">Ref. Catastral</td><td style="padding:3px 0; color:#ffffff; font-family:monospace; font-size:12px;">${escapeHtml(clienteData.refCatastral)}</td></tr>` : ''}
                ${clienteData.direccion ? `<tr><td style="padding:3px 0; color:rgba(255,255,255,0.4); font-size:11px; text-transform:uppercase; letter-spacing:0.5px; vertical-align:top;">Dirección completa</td><td style="padding:3px 0; color:#ffffff;">${escapeHtml(clienteData.direccion)}</td></tr>` : ''}
            </table>
        </div>
    ` : '';

    const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0; padding:0; background-color:#0a0e1a; font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; color:#ffffff;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0e1a; padding:40px 20px;">
        <tr><td align="center">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px; background-color:#111827; border-radius:24px; border:1px solid rgba(255,255,255,0.06); overflow:hidden;">
                <tr><td style="height:4px; background:linear-gradient(90deg, #f59e0b, #ea580c);"></td></tr>
                ${urgentBannerHtml}
                <tr>
                    <td style="padding:40px 40px 10px;">
                        <div style="font-size:22px; font-weight:900; letter-spacing:-0.5px; text-align:center;">
                            <span style="color:#f59e0b;">BROKERGY </span><span style="color:#ffffff; font-weight:500;">· Ingeniería Energética</span>
                        </div>
                    </td>
                </tr>
                <tr>
                    <td style="padding:10px 40px 30px;">
                        <h2 style="margin:0 0 6px; font-size:19px; font-weight:800; color:#ffffff;">Solicitud de Revisión Técnica</h2>
                        <p style="margin:0 0 16px; font-size:14px; line-height:1.6; color:rgba(255,255,255,0.6);">
                            El técnico <strong style="color:#ffffff;">${escapeHtml(certName || 'Técnico')}</strong> ha subido el archivo <strong style="color:#f59e0b;">.CEX</strong> del <strong style="color:#ffffff;">CEE ${phaseLabel}</strong> para el expediente <strong style="color:#f59e0b;">${escapeHtml(numExp)}</strong>${clienteName ? ` del cliente <strong style=\"color:#ffffff;\">${escapeHtml(clienteName)}</strong>` : ''}.
                        </p>
                        <p style="margin:8px 0 6px; font-size:14px; line-height:1.6; color:rgba(255,255,255,0.6);">
                            El expediente está pendiente de tu revisión para validar y autorizar la presentación.
                        </p>

                        ${certInfoHtml}

                        ${clienteInfoHtml}

                        ${techMessageHtml}

                        <h3 style="margin:24px 0 12px; font-size:14px; font-weight:700; color:#ffffff;">Accesos directos:</h3>
                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                            <tr><td align="center" style="padding-bottom:10px;">
                                <a href="${finalPortalLink}" target="_blank" style="display:inline-block; padding:14px 32px; background:linear-gradient(135deg, #f59e0b, #ea580c); color:#0a0e1a; font-size:14px; font-weight:800; text-decoration:none; border-radius:10px; width:80%; max-width:280px; box-sizing:border-box; text-align:center; text-transform:uppercase; letter-spacing:1px; box-shadow:0 4px 14px rgba(245,158,11,0.4);">
                                    🔗 Ver Expediente
                                </a>
                            </td></tr>
                            ${ceeFolderLink ? `
                            <tr><td align="center">
                                <a href="${ceeFolderLink}" target="_blank" style="display:inline-block; padding:12px 32px; background-color:rgba(245,158,11,0.12); border:1px solid rgba(245,158,11,0.4); color:#f59e0b; font-size:14px; font-weight:800; text-decoration:none; border-radius:10px; width:80%; max-width:280px; box-sizing:border-box; text-align:center;">
                                    📁 Abrir Carpeta CEE
                                </a>
                            </td></tr>` : ''}
                        </table>

                        <p style="margin:28px 0 0; font-size:13px; line-height:1.6; color:rgba(255,255,255,0.35); text-align:center;">
                            Una vez revisado el .CEX, pulsa <strong style="color:rgba(255,255,255,0.6);">Validar y Autorizar Presentación</strong> en el portal.
                        </p>
                    </td>
                </tr>
                <tr>
                    <td style="padding:10px 40px 32px; text-align:center; background-color:rgba(255,255,255,0.02); border-top:1px solid rgba(255,255,255,0.04);">
                        <p style="margin:0; font-size:12px; font-weight:700; color:rgba(255,255,255,0.5);">BROKERGY · Ingeniería Energética</p>
                        <p style="margin:4px 0 0; font-size:11px; color:rgba(255,255,255,0.25);">Notificación automática · ERP</p>
                    </td>
                </tr>
            </table>
        </td></tr>
    </table>
</body>
</html>`;

    const clienteText = clienteData ? [
        clienteData.nombre ? `Cliente: ${clienteData.nombre}` : null,
        clienteData.dni ? `DNI: ${clienteData.dni}` : null,
        clienteData.tlf ? `Tlf: ${clienteData.tlf}` : null,
        clienteData.email ? `Email: ${clienteData.email}` : null,
        clienteData.refCatastral ? `Ref. Catastral: ${clienteData.refCatastral}` : null,
        clienteData.direccion ? `Dirección: ${clienteData.direccion}` : null,
    ].filter(Boolean).join('\n') + '\n\n' : '';

    const urgentText = isUrgent ? '🚨 URGENTE 🚨\n\n' : '';
    const techMsgText = techMessage ? `\nMensaje del técnico:\n${techMessage}\n\n` : '';
    const text = `${urgentText}SOLICITUD DE REVISIÓN TÉCNICA\n\nEl técnico ${certName || 'Técnico'} ha subido el .CEX del CEE ${phaseLabel} del expediente ${numExp}.\n\n${clienteText}${techMsgText}Ver expediente: ${finalPortalLink}\n${ceeFolderLink ? 'Carpeta CEE: ' + ceeFolderLink + '\n' : ''}\nBROKERGY · Ingeniería Energética`;

    return sendMail({ to, subject, html, text });
};

/**
 * Notifica a BROKERGY que un técnico ha aceptado el encargo a través del enlace de correo
 */
const sendCertifierAcceptedAdminNotification = async (expedienteId, numExp, certName, phase) => {
    const to = 'franciscojavier.moya.s2e2@gmail.com'; // Email de administración
    const subject = `✅ ENCARGO ACEPTADO — ${numExp} — ${certName}`;
    
    const html = `
    <!DOCTYPE html>
    <html lang="es">
    <head><meta charset="UTF-8"></head>
    <body style="background-color:#0a0e1a; font-family:sans-serif; color:#ffffff; padding:40px;">
        <div style="max-width:600px; margin:0 auto; background-color:#111827; border-radius:20px; border:1px solid #334155; padding:30px;">
            <h2 style="color:#10b981; margin-top:0;">Encargo Aceptado</h2>
            <p style="color:#ffffff;">El técnico <strong>${certName}</strong> ha aceptado el encargo del <strong>${phase}</strong>.</p>
            <hr style="border:0; border-top:1px solid #1e293b; margin:20px 0;">
            <p style="font-size:14px; color:#94a3b8;">
                <strong>Expediente:</strong> ${numExp}<br>
                El estado del expediente ha cambiado automáticamente a "EN TRABAJO".
            </p>
            <div style="margin-top:30px; text-align:center;">
                <a href="${process.env.FRONTEND_URL || 'https://app.brokergy.es'}/?exp=${expedienteId}" style="display:inline-block; padding:12px 24px; background-color:#10b981; color:#000000; font-weight:bold; text-decoration:none; border-radius:10px;">Ver Expediente</a>
            </div>
            <p style="font-size:10px; color:#475569; margin-top:30px; text-align:center;">Notificación automática de BROKERGY ERP</p>
        </div>
    </body>
    </html>
    `;

    return sendMail({ to, subject, html, text: `El técnico ${certName} ha aceptado el encargo del ${phase} para el expediente ${numExp}.` });
};

/**
 * Notifica al certificador que el administrador ha validado su CEE (Inicial o Final)
 */
const sendCertificadorApproveNotification = async (to, certName, numExp, phaseLabel, portalLink, folderLink) => {
    const subject = `✅ VISTO BUENO — ${phaseLabel} — ${numExp}`;
    
    const html = `
    <!DOCTYPE html>
    <html lang="es">
    <head><meta charset="UTF-8"></head>
    <body style="background-color:#0a0e1a; font-family:sans-serif; color:#ffffff; padding:40px;">
        <div style="max-width:600px; margin:0 auto; background-color:#111827; border-radius:20px; border:1px solid #334155; padding:30px;">
            <h2 style="color:#10b981; margin-top:0;">Certificado Validado</h2>
            <p style="color:#ffffff;">Hola <strong>${certName}</strong>, el equipo de BROKERGY ha revisado y dado el visto bueno al archivo .CEX del <strong>${phaseLabel}</strong>.</p>
            <hr style="border:0; border-top:1px solid #1e293b; margin:20px 0;">
            <p style="font-size:14px; color:#94a3b8;">
                <strong>Expediente:</strong> ${numExp}<br><br>
                Ya tienes luz verde para <strong>registrarlo en Industria</strong>. Una vez registrado, por favor sube la Etiqueta Energética y el justificante de registro a la carpeta compartida o al portal.
            </p>
            <div style="margin-top:30px; text-align:center;">
                ${portalLink ? `<a href="${portalLink}" style="display:inline-block; margin-right:10px; padding:12px 24px; background-color:#10b981; color:#000000; font-weight:bold; text-decoration:none; border-radius:10px;">Ir al Portal</a>` : ''}
                ${folderLink ? `<a href="${folderLink}" style="display:inline-block; padding:12px 24px; border:1px solid #10b981; color:#10b981; font-weight:bold; text-decoration:none; border-radius:10px;">Abrir Carpeta</a>` : ''}
            </div>
            <p style="font-size:10px; color:#475569; margin-top:30px; text-align:center;">Notificación automática de BROKERGY ERP</p>
        </div>
    </body>
    </html>
    `;

    return sendMail({ to, subject, html, text: `Hola ${certName}, el ${phaseLabel} ha sido validado. Puedes proceder a registrarlo.` });
};

/**
 * Notifica al cliente que el CEE Inicial ha sido presentado
 */
const sendCeeInicialRegistradoClientEmail = async (to, clientName, numExp, portalLink) => {
    const subject = `✅ CEE INICIAL PRESENTADO — ${numExp}`;
    
    const html = `
    <!DOCTYPE html>
    <html lang="es">
    <head><meta charset="UTF-8"></head>
    <body style="background-color:#0a0e1a; font-family:sans-serif; color:#ffffff; padding:40px;">
        <div style="max-width:600px; margin:0 auto; background-color:#111827; border-radius:20px; border:1px solid #334155; padding:30px;">
            <h2 style="color:#10b981; margin-top:0;">Certificado Presentado</h2>
            <p style="color:#ffffff;">¡Hola <strong>${clientName}</strong>! 👋</p>
            <p style="color:#ffffff;">Te escribimos para comunicarte que ya ha sido presentado el Certificado de Eficiencia Energética INICIAL de tu expediente <strong>${numExp}</strong>.</p>
            
            <div style="background-color:rgba(16, 185, 129, 0.1); border-left:4px solid #10b981; padding:15px; margin:20px 0;">
                <p style="color:#10b981; margin:0; font-weight:bold;">Desde este momento ya se pueden emitir facturas y pagos.</p>
            </div>

            <p style="color:#ffffff;">📸 <strong>Recuerda hacerle fotografías a todo:</strong></p>
            <ul style="color:#94a3b8; line-height:1.6;">
                <li>Caldera existente y placa de fabricación.</li>
                <li>Desmontaje de la caldera.</li>
                <li>Montaje de la aerotermia.</li>
                <li>Fotos de las nuevas placas de fabricación (tanto de la exterior como interior).</li>
            </ul>
            <p style="color:#94a3b8; font-size:14px;">Las fotos son la parte más importante del proceso para que podamos argumentar ante el ministerio que se ha realizado la reforma.</p>
            
            <div style="margin-top:30px; text-align:center;">
                <a href="${portalLink}" style="display:inline-block; padding:12px 24px; background-color:#10b981; color:#000000; font-weight:bold; text-decoration:none; border-radius:10px;">Subir Fotografías</a>
            </div>

            <p style="color:#94a3b8; font-size:14px; margin-top:20px;">Una vez finalizada la obra, debes comunicárnoslo por aquí para proceder con el CEE Final y el resto de la documentación.</p>

            <hr style="border:0; border-top:1px solid #1e293b; margin:30px 0;">
            <p style="font-size:10px; color:#475569; text-align:center;">BROKERGY — Ingeniería Energética</p>
        </div>
    </body>
    </html>
    `;

    return sendMail({ to, subject, html, text: `Hola ${clientName}, el CEE INICIAL ha sido presentado. Ya se pueden emitir facturas y pagos. Por favor, recuerda tomar fotografías de todo el proceso de la obra.` });
};

/**
 * Notifica a Admin/Partner que el CEE (Inicial o Final) ha sido presentado
 */
const sendCeeRegistradoStaffEmail = async (to, isPartner, numExp, clientName, ubicacion, techName, phaseLabel, portalLink) => {
    const subject = `✅ REGISTRO ${phaseLabel} PRESENTADO — ${numExp}`;
    
    const html = `
    <!DOCTYPE html>
    <html lang="es">
    <head><meta charset="UTF-8"></head>
    <body style="background-color:#0a0e1a; font-family:sans-serif; color:#ffffff; padding:40px;">
        <div style="max-width:600px; margin:0 auto; background-color:#111827; border-radius:20px; border:1px solid #334155; padding:30px;">
            <h2 style="color:#10b981; margin-top:0;">Registro Presentado</h2>
            <p style="color:#ffffff;">Se ha subido correctamente el justificante de registro del <strong>${phaseLabel}</strong>.</p>
            <hr style="border:0; border-top:1px solid #1e293b; margin:20px 0;">
            <table style="width:100%; font-size:14px; color:#94a3b8; border-collapse: collapse;">
                <tr><td style="padding:4px 0;"><strong>Expediente:</strong></td><td>${numExp}</td></tr>
                <tr><td style="padding:4px 0;"><strong>Cliente:</strong></td><td>${clientName}</td></tr>
                <tr><td style="padding:4px 0;"><strong>Ubicación:</strong></td><td>${ubicacion}</td></tr>
                <tr><td style="padding:4px 0;"><strong>Certificador:</strong></td><td>${techName}</td></tr>
            </table>
            
            ${phaseLabel === 'CEE INICIAL' ? `
            <div style="background-color:rgba(16, 185, 129, 0.1); border-left:4px solid #10b981; padding:15px; margin:20px 0;">
                <p style="color:#10b981; margin:0; font-weight:bold;">Desde este momento ya se pueden emitir facturas y pagos.</p>
            </div>
            ` : ''}

            <div style="margin-top:30px; text-align:center;">
                <a href="${portalLink}" style="display:inline-block; padding:12px 24px; background-color:#10b981; color:#000000; font-weight:bold; text-decoration:none; border-radius:10px;">Ver Expediente</a>
            </div>
            <p style="font-size:10px; color:#475569; margin-top:30px; text-align:center;">Notificación automática de BROKERGY ERP</p>
        </div>
    </body>
    </html>
    `;

    return sendMail({ to, subject, html, text: `El justificante de registro del ${phaseLabel} ha sido presentado para el expediente ${numExp} del cliente ${clientName}.` });
};

module.exports = {
    sendMail,
    verifySmtp,
    sendPasswordResetEmail,
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
    sendCeeRegistradoStaffEmail
};
