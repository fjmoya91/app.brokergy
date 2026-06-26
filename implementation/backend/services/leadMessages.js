/**
 * leadMessages — Redacción de los mensajes que recibe el cliente al terminar
 *                el funnel de la landing (WhatsApp + email) y el one-pager PDF
 *                que se adjunta en WhatsApp.
 *
 * Lógica comercial (decidida 2026-06-25):
 *   - El BONO CAE manda. Si el cliente pidió "que un técnico lo revise" O el
 *     bono CAE neto es < 1.000 €, NO se muestran cifras flojas: se envía un
 *     mensaje SUAVE ("un técnico revisará tu expediente y te contactará").
 *   - Si pidió WhatsApp/email y el CAE ≥ 1.000 € → PROPUESTA COMPLETA con
 *     cifras + (en WhatsApp) PDF adjunto.
 *   - El copy se ramifica reforma (RES080) vs aerotermia (RES060).
 *   - El ahorro anual solo se muestra como € si ≥ 200 €/año; por debajo se
 *     sustituye por un beneficio cualitativo (confort + CO₂ evitado).
 *   - Co-branding: si el lead vino de la landing de un partner, el mensaje lo
 *     menciona ("BROKERGY, partner energético de {Instalador}"). El contacto y
 *     la gestión siguen siendo de Brokergy.
 *
 * Sin dependencias pesadas en carga: pdfService (puppeteer) se requiere de
 * forma perezosa dentro de generateProposalPdfBase64().
 */

// Umbrales comerciales (configurables)
const CAE_PDF_THRESHOLD = 1000;     // bono CAE neto a partir del cual se manda propuesta completa + PDF
const AHORRO_LOW_THRESHOLD = 200;   // €/año por debajo del cual el ahorro se muestra cualitativo

const fmtEur = (n) =>
    `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(Math.abs(Number(n) || 0))} €`;

const firstName = (nombre) => (String(nombre || '').trim().split(/\s+/)[0] || 'cliente');

// Producto según ficha: reforma integral (RES080) vs cambio a aerotermia (RES060)
const productNoun = (isReforma) => (isReforma ? 'tu reforma' : 'el cambio a aerotermia');

// "dejas de depender ___" — frase gramatical (con la preposición fusionada:
// del/de la/de los) a partir del label de combustible. Uso: `depender ${frase}`.
const FUEL_DEPEND = {
    'Gas Natural': 'del gas natural',
    'Gasóleo Calefacción': 'del gasóleo',
    'GLP (Propano)': 'del gas propano (GLP)',
    'Electricidad': 'de la electricidad',
    'Carbón': 'del carbón',
    'Biomasa (Pellets)': 'de los pellets',
    'Biomasa (Leña/Hueso)': 'de la leña',
};
const fuelDependPhrase = (fuelLabel) => FUEL_DEPEND[fuelLabel] || 'de tu sistema actual';

const co2Text = (co2) => {
    const n = Number(co2) || 0;
    if (n < 0.1) return '';
    return ` (evitas ~${n.toLocaleString('es-ES', { maximumFractionDigits: 1 })} t de CO₂ al año)`;
};

// Línea de urgencia opcional según caldera antigua / prisa del cliente
function urgencyLine(edadCaldera, timeline) {
    if (edadCaldera === '>20') {
        return '⏳ Con una caldera de más de 20 años, el cambio se amortiza mucho antes y reduces el riesgo de una avería en pleno invierno.';
    }
    if (timeline === 'urgente' || timeline === '1_mes') {
        return '⏳ Como nos has indicado que tienes algo de prisa, le damos prioridad a tu caso.';
    }
    return null;
}

/**
 * Decide el tipo de mensaje a enviar.
 * @returns {'completa'|'suave'}
 */
function pickMessageType({ wantsTecnico, caeNeto }) {
    if (wantsTecnico) return 'suave';
    return (Number(caeNeto) || 0) >= CAE_PDF_THRESHOLD ? 'completa' : 'suave';
}

// Firma del mensaje (Brokergy puro o co-branding con el partner)
function signatureLines(partner) {
    if (partner && partner.nombre) {
        return [
            'Un saludo,',
            `*${partner.nombre}* · en colaboración con *BROKERGY*`,
            `${partner.tel ? partner.tel + ' · ' : ''}info@brokergy.es`,
        ];
    }
    return [
        'Un saludo,',
        '*BROKERGY — Ingeniería Energética*',
        'info@brokergy.es · 623 926 179',
    ];
}

/**
 * Construye el texto de WhatsApp (sirve también como caption del PDF).
 */
function buildWhatsAppMessage({
    type, nombre, idOportunidad, isReforma,
    cae = 0, irpf = 0, neta = 0, ahorro = 0,
    fuelLabel = null, co2 = 0,
    uploadLink = null, presupuestoEstimado = false,
    partner = null, edadCaldera = null, timeline = null,
}) {
    const fn = firstName(nombre);
    const prod = productNoun(isReforma);
    const lines = [];

    // ── Intro ──
    lines.push(`¡Hola ${fn}! 👋`);
    lines.push('');

    if (type === 'suave') {
        if (partner && partner.nombre) {
            lines.push(`Te escribimos de BROKERGY, partner energético de *${partner.nombre}*. Hemos recibido tu solicitud para ${prod} (Ref. *${idOportunidad}*). ¡Gracias!`);
        } else {
            lines.push(`Hemos recibido tu solicitud para ${prod} (Ref. *${idOportunidad}*). ¡Gracias!`);
        }
        lines.push('');
        lines.push('Un técnico especialista revisará tu expediente y te contactará lo antes posible para darte una propuesta de ayudas a tu medida.');
        if (uploadLink) {
            lines.push('');
            lines.push('📸 Mientras tanto, puedes adelantar el proceso subiendo unas fotos de tu vivienda e instalación actual (2 min desde el móvil):');
            lines.push(uploadLink);
        }
        lines.push('');
        signatureLines(partner).forEach(l => lines.push(l));
        return lines.join('\n');
    }

    // ── PROPUESTA COMPLETA ──
    if (partner && partner.nombre) {
        lines.push(`Te escribimos de BROKERGY, partner energético de *${partner.nombre}*, sobre la simulación que solicitaste a través de ${partner.nombre} para ${prod} (Ref. *${idOportunidad}*).`);
    } else {
        lines.push(`Te escribimos de BROKERGY. Hemos calculado tu simulación de ayudas para ${prod} (Ref. *${idOportunidad}*).`);
    }
    lines.push('');
    lines.push('🔹 *Resumen de tus ayudas:*');
    lines.push('');
    lines.push(`✅ Bono Energético BROKERGY (CAE): *${fmtEur(cae)}* — garantizado por nosotros.`);
    if (Number(irpf) > 0) {
        lines.push('');
        lines.push(`✅ Deducción estimada en tu IRPF: *${fmtEur(irpf)}*, si puedes acogerte a ella (dejamos toda la parte técnica lista para que la solicites).`);
    }
    lines.push('');
    lines.push(`💡 *Total de ayudas: hasta ${fmtEur(Number(cae) + Number(irpf))}.*`);
    lines.push(`🏠 *Inversión neta tras ayudas: ${fmtEur(neta)}.*`);

    if (Number(ahorro) >= AHORRO_LOW_THRESHOLD) {
        lines.push(`⚡ *Ahorro estimado en factura: ${fmtEur(ahorro)} al año.*`);
    } else {
        lines.push(`🌱 Además, ganas en confort estable todo el año y dejas de depender ${fuelDependPhrase(fuelLabel)} y de sus subidas de precio${co2Text(co2)}.`);
    }

    const urg = urgencyLine(edadCaldera, timeline);
    if (urg) {
        lines.push('');
        lines.push(urg);
    }

    if (uploadLink) {
        lines.push('');
        lines.push('📸 Para cerrar tu propuesta definitiva solo necesitamos unas fotos de tu vivienda e instalación actual. 2 minutos desde el móvil:');
        lines.push(uploadLink);
    }

    lines.push('');
    lines.push('Ayudas garantizadas por Brokergy, especialistas en rehabilitación energética. ✅');
    lines.push('');
    signatureLines(partner).forEach(l => lines.push(l));

    if (presupuestoEstimado) {
        lines.push('');
        lines.push('ℹ️ La inversión neta es orientativa: la hemos calculado con un presupuesto estimado de 15.000 €. Se ajustará con el presupuesto real de tu instalador.');
    }

    return lines.join('\n');
}

/**
 * HTML del one-pager A4 (propuesta) que se adjunta en WhatsApp (modo completa).
 */
function buildProposalPdfHtml({
    nombre, idOportunidad, isReforma,
    cae = 0, irpf = 0, neta = 0, ahorro = 0,
    fuelLabel = null, co2 = 0,
    presupuestoEstimado = false, partner = null,
}) {
    const fn = firstName(nombre);
    const total = Number(cae) + Number(irpf);
    const prod = isReforma ? 'tu reforma energética' : 'el cambio a aerotermia';
    const fecha = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
    const ahorroRow = Number(ahorro) >= AHORRO_LOW_THRESHOLD
        ? `<tr>
             <td style="padding:12px 18px;font-size:13px;color:#475569;border-top:1px solid #e2e8f0;">Ahorro estimado ${isReforma ? 'en factura' : 'en calefacción'}</td>
             <td style="padding:12px 18px;font-size:13px;font-weight:700;color:#2563eb;text-align:right;border-top:1px solid #e2e8f0;">${fmtEur(ahorro)}/año</td>
           </tr>`
        : '';
    const irpfRow = Number(irpf) > 0
        ? `<tr>
             <td style="padding:12px 18px;font-size:13px;color:#475569;border-top:1px solid #e2e8f0;">Deducción estimada en el IRPF</td>
             <td style="padding:12px 18px;font-size:13px;font-weight:700;color:#059669;text-align:right;border-top:1px solid #e2e8f0;">${fmtEur(irpf)}</td>
           </tr>`
        : '';
    const cobrand = (partner && partner.nombre)
        ? `<div style="font-size:12px;color:#64748b;margin-top:4px;">en colaboración con <strong>${partner.nombre}</strong></div>`
        : '';
    const cualitativo = Number(ahorro) < AHORRO_LOW_THRESHOLD
        ? `<p style="margin:14px 0 0;font-size:12px;color:#475569;line-height:1.6;">
             Además, ganas en confort estable todo el año y dejas de depender ${fuelDependPhrase(fuelLabel)} y de sus subidas de precio${co2Text(co2)}.
           </p>`
        : '';
    const notaPresupuesto = presupuestoEstimado
        ? `<p style="margin:8px 0 0;font-size:10px;color:#94a3b8;line-height:1.5;">
             * La inversión neta es orientativa: calculada con un presupuesto estimado de 15.000 €. Se ajustará con el presupuesto real de tu instalador.
           </p>`
        : '';

    return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
  <div style="width:794px;min-height:1123px;box-sizing:border-box;padding:56px 56px 40px;">
    <!-- Header -->
    <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #f59e0b;padding-bottom:18px;">
      <div>
        <div style="font-size:30px;font-weight:900;letter-spacing:-1px;">BROKER<span style="color:#f59e0b">GY</span></div>
        <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:2px;font-weight:700;">Ingeniería Energética</div>
        ${cobrand}
      </div>
      <div style="text-align:right;font-size:12px;color:#64748b;">
        <div>Ref. <strong style="color:#0f172a;font-family:monospace;">${idOportunidad}</strong></div>
        <div>${fecha}</div>
      </div>
    </div>

    <!-- Título -->
    <h1 style="font-size:24px;font-weight:900;margin:34px 0 6px;">Hola, ${fn} 👋</h1>
    <p style="font-size:15px;color:#475569;margin:0 0 28px;">Esta es tu estimación de ayudas para ${prod}.</p>

    <!-- Cifras clave -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:26px;">
      <tr>
        <td width="48%" style="background:#ecfdf5;border:2px solid #a7f3d0;border-radius:16px;padding:22px;text-align:center;">
          <div style="font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:1.5px;color:#059669;margin-bottom:8px;">Ayuda total estimada</div>
          <div style="font-size:34px;font-weight:900;color:#059669;">${fmtEur(total)}</div>
          <div style="font-size:11px;color:#10b981;margin-top:4px;">incluye CAE${Number(irpf) > 0 ? ' + IRPF' : ''}</div>
        </td>
        <td width="4%"></td>
        <td width="48%" style="background:#fffbeb;border:2px solid #fde68a;border-radius:16px;padding:22px;text-align:center;">
          <div style="font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:1.5px;color:#d97706;margin-bottom:8px;">Tu inversión neta</div>
          <div style="font-size:34px;font-weight:900;color:#d97706;">${fmtEur(neta)}${presupuestoEstimado ? '<span style="font-size:18px;">*</span>' : ''}</div>
          <div style="font-size:11px;color:#f59e0b;margin-top:4px;">tras todas las ayudas</div>
        </td>
      </tr>
    </table>

    <!-- Desglose -->
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;border-collapse:separate;">
      <tr style="background:#fff7ed;">
        <td style="padding:11px 18px;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:1.5px;color:#d97706;">Concepto</td>
        <td style="padding:11px 18px;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:1.5px;color:#d97706;text-align:right;">Importe</td>
      </tr>
      <tr>
        <td style="padding:12px 18px;font-size:13px;color:#475569;">Bono Energético CAE <span style="color:#94a3b8;">(garantizado por Brokergy)</span></td>
        <td style="padding:12px 18px;font-size:13px;font-weight:700;color:#059669;text-align:right;">${fmtEur(cae)}</td>
      </tr>
      ${irpfRow}
      ${ahorroRow}
      <tr style="background:#f8fafc;">
        <td style="padding:13px 18px;font-size:14px;font-weight:900;color:#0f172a;border-top:2px solid #e2e8f0;">Ayuda total estimada</td>
        <td style="padding:13px 18px;font-size:16px;font-weight:900;color:#059669;text-align:right;border-top:2px solid #e2e8f0;">${fmtEur(total)}</td>
      </tr>
    </table>
    ${cualitativo}
    ${notaPresupuesto}

    <!-- Siguiente paso -->
    <div style="margin-top:30px;background:#fffbeb;border:1px solid #fde68a;border-radius:14px;padding:20px;">
      <p style="margin:0;font-size:13px;color:#475569;line-height:1.6;">
        Un técnico de Brokergy revisará tu expediente y te contactará para concretar la propuesta definitiva.
        Para afinarla, puedes enviarnos unas fotos de tu vivienda e instalación actual.
      </p>
    </div>

    <!-- Footer -->
    <div style="margin-top:40px;padding-top:18px;border-top:1px solid #e2e8f0;text-align:center;">
      <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:2px;font-weight:700;">Brokergy · info@brokergy.es · 623 926 179</div>
      <div style="font-size:10px;color:#cbd5e1;margin-top:6px;">Estimación teórica sujeta a verificación técnica. El bono CAE está garantizado por Brokergy.</div>
    </div>
  </div>
</body></html>`;
}

/**
 * Genera el PDF de propuesta (one-pager) y lo devuelve en base64.
 * Lanza si puppeteer falla — el llamante debe hacer fallback a texto.
 */
async function generateProposalPdfBase64(args) {
    const { getBrowser } = require('./pdfService');
    const html = buildProposalPdfHtml(args);
    let browser = null;
    let page = null;
    try {
        browser = await getBrowser();
        page = await browser.newPage();
        await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 2 });
        await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await new Promise(r => setTimeout(r, 300));
        try { await page.evaluate(() => document.fonts.ready); } catch (_) { /* noop */ }
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: 0, right: 0, bottom: 0, left: 0 },
        });
        return Buffer.from(pdfBuffer).toString('base64');
    } finally {
        if (page) { try { await page.close(); } catch (_) { /* noop */ } }
        if (browser) { try { await browser.close(); } catch (_) { /* noop */ } }
    }
}

module.exports = {
    CAE_PDF_THRESHOLD,
    AHORRO_LOW_THRESHOLD,
    fmtEur,
    firstName,
    productNoun,
    fuelDependPhrase,
    co2Text,
    urgencyLine,
    pickMessageType,
    buildWhatsAppMessage,
    buildProposalPdfHtml,
    generateProposalPdfBase64,
};
