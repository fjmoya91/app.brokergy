// ─── seguimientoDiario — el parte diario de expedientes atascados ─────────────
//
// UN solo mensaje al día (WhatsApp + email) con todo lo que lleva parado más de la
// cuenta, y en cada línea el enlace que lo desbloquea. Sustituye al aviso suelto de
// "CEE pendientes de revisión", que ahora es uno de sus bloques.
//
// Por qué uno y no siete: los avisos separados compiten entre sí y acaban ignorados
// todos. El parte es una lista de trabajo, no una notificación.
//
// LOS DOS CANALES NO LLEVAN LO MISMO, a propósito:
//  · WhatsApp → el titular (cuánto hay en cada bloque) y SOLO lo accionable de un
//    clic, con tope. Un WhatsApp de 77 líneas no lo lee nadie y encima WhatsApp lo
//    parte por la mitad al pasar de ~4.000 caracteres.
//  · Email → el parte completo, agrupado y con su botón por línea.
// El WhatsApp lleva enlace al parte completo en web, así que no se pierde nada.
//
// Patrón de arranque idéntico a `marketplaceStatsRefresher`: setInterval desde
// server.js, no bloqueante, errores registrados y reintento en el ciclo siguiente.

const supabase = require('./supabaseClient');
const emailService = require('./emailService');
const whatsappService = require('./whatsappService');
const radar = require('./seguimientoRadar');
const { urlAccion, firmarAccion } = require('../utils/accionToken');

const INTERVALO_MS = 6 * 60 * 60 * 1000;                                  // se comprueba cada 6 h…
const HORA_MIN = Number(process.env.REVISION_ALERTA_HORA_MIN || 8);       // …y solo se manda de día
const HORA_MAX = Number(process.env.REVISION_ALERTA_HORA_MAX || 21);
// Cuántas acciones caben en el WhatsApp antes de que el móvil lo pliegue tras un
// "Leer más". El resto va en el email y en el parte web, que no tienen ese problema.
const WA_MAX_ACCIONES = Number(process.env.PARTE_WA_MAX_ACCIONES || 8);

const CLAVE_ULTIMO_AVISO = 'seguimiento_parte_last_notify';

const FRONTEND = () => process.env.FRONTEND_URL || 'https://app.brokergy.es';
const adminPhone = () => process.env.WHATSAPP_ADMIN_CHAT || '34623926179';
const adminEmail = () => process.env.ADMIN_EMAIL || 'franciscojavier.moya.s2e2@gmail.com';

let handle = null;

const hoyMadrid = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(new Date());
const horaMadrid = () => Number(new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', hour12: false }).format(new Date()));

const escapar = (s) => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// Algunas direcciones ya traen el municipio dentro ("CL DEPOSITO AGUAS 15 13610
// CAMPO DE CRIPTANA (CIUDAD REAL)"): no se repite detrás.
const ubicacion = (f) => {
    const dir = f.direccion || '';
    const mun = f.municipio || '';
    const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const repetido = mun && norm(dir).includes(norm(mun));
    return [dir, repetido ? null : mun].filter(Boolean).join(', ') || f.cliente_nombre || '—';
};

const espera = (f) => (f.sin_fecha ? 'sin fecha' : `${f.dias} día${f.dias === 1 ? '' : 's'}`);

const linkExpediente = (f) => `${FRONTEND()}/?exp=${encodeURIComponent(f.numero_expediente || '')}`;

/**
 * Enlace de la línea. Si la acción es automatizable y no está silenciada por un aviso
 * reciente, va el enlace FIRMADO a la página de confirmación; si no, el expediente.
 */
function enlaceDe(f) {
    const sil = radar.silenciadaPor(f);
    if (f.accion && f.accion.tipo !== 'ver' && !sil) {
        return { url: urlAccion(f.accion.tipo, f.expediente_id, f.accion.scope), label: f.accion.label, accionable: true };
    }
    return { url: linkExpediente(f), label: sil ? `Abrir (${sil})` : (f.accion?.label || 'Abrir el expediente'), accionable: false };
}

// ─── WhatsApp ─────────────────────────────────────────────────────────────────

function construirWa(grupos, total, urlParte) {
    const resumen = grupos
        .map(g => `${g.def.emoji} ${g.def.titulo}: *${g.filas.length}*`)
        .join('\n');

    // Solo lo que se resuelve con un clic desde aquí, lo más grave primero.
    const accionables = grupos.flatMap(g => g.filas.map(f => ({ f, g })))
        .filter(({ f }) => f.accion && f.accion.tipo !== 'ver' && !radar.silenciadaPor(f));

    const muestra = accionables.slice(0, WA_MAX_ACCIONES).map(({ f, g }) => {
        const { url, label } = enlaceDe(f);
        return `${g.def.emoji} *${f.numero_expediente}* · ${espera(f)}\n   ${ubicacion(f)}\n   ${f.detalle}\n   👉 ${label}:\n   ${url}`;
    }).join('\n\n');

    const restantes = accionables.length - Math.min(accionables.length, WA_MAX_ACCIONES);

    return `📋 *PARTE DE SEGUIMIENTO*
_${new Intl.DateTimeFormat('es-ES', { dateStyle: 'full', timeZone: 'Europe/Madrid' }).format(new Date())}_

*${total}* expediente${total === 1 ? '' : 's'} parado${total === 1 ? '' : 's'} por encima de su plazo:

${resumen}
${accionables.length ? `
━━━━━━━━━━━━━━━━━━━━
*SE RESUELVEN DESDE AQUÍ* (pulsa y confirma)

${muestra}${restantes > 0 ? `\n\n_… y ${restantes} más en el parte completo._` : ''}
` : ''}
━━━━━━━━━━━━━━━━━━━━
📄 Parte completo:
${urlParte}

🔗 ${FRONTEND()}/?tab=expedientes`;
}

// ─── Email ────────────────────────────────────────────────────────────────────

function filaHtml(f) {
    const { url, label, accionable } = enlaceDe(f);
    const color = f.sin_fecha ? '#6b7280' : (f.dias > 30 ? '#dc2626' : f.dias > 14 ? '#ea580c' : '#b45309');
    const boton = accionable
        ? `<a href="${url}" style="display:inline-block;background:#FF6D00;color:#fff;padding:7px 14px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:12px;white-space:nowrap">${escapar(label)}</a>`
        : `<a href="${url}" style="color:#64748b;text-decoration:none;font-size:12px;white-space:nowrap">${escapar(label)} →</a>`;
    return `<tr style="border-bottom:1px solid #eee">
        <td style="padding:10px 6px;white-space:nowrap;vertical-align:top">
          <a href="${linkExpediente(f)}" style="color:#ea580c;font-weight:bold;text-decoration:none">${escapar(f.numero_expediente)}</a>
        </td>
        <td style="padding:10px 6px;color:#333;vertical-align:top">
          ${escapar(f.detalle)}<br/><span style="color:#94a3b8;font-size:12px">${escapar(ubicacion(f))}</span>
        </td>
        <td style="padding:10px 6px;text-align:right;color:${color};font-weight:bold;white-space:nowrap;vertical-align:top">${escapar(espera(f))}</td>
        <td style="padding:10px 6px;text-align:right;vertical-align:top">${boton}</td>
      </tr>`;
}

function construirHtml(grupos, total, urlParte) {
    const bloques = grupos.map(g => `
        <h3 style="margin:28px 0 4px;font-size:14px;color:#111">${g.def.emoji} ${escapar(g.def.titulo)}
          <span style="color:#94a3b8;font-weight:normal">(${g.filas.length})</span></h3>
        ${g.def.nota ? `<p style="margin:0 0 10px;font-size:12px;color:#64748b">${escapar(g.def.nota)}</p>` : ''}
        <table style="width:100%;border-collapse:collapse;font-size:13px">${g.filas.map(filaHtml).join('')}</table>`).join('');

    const indice = grupos.map(g =>
        `<li style="margin-bottom:4px">${g.def.emoji} ${escapar(g.def.titulo)} — <strong>${g.filas.length}</strong></li>`).join('');

    return `<div style="font-family:Arial,sans-serif;max-width:760px;margin:0 auto;">
        <div style="background:linear-gradient(135deg,#f59e0b,#ea580c);padding:22px 28px;">
          <h2 style="margin:0;color:#fff;font-size:17px;">BROKERGY · Parte de seguimiento</h2>
          <p style="margin:4px 0 0;color:#fff;opacity:.9;font-size:12px">${escapar(new Intl.DateTimeFormat('es-ES', { dateStyle: 'full', timeZone: 'Europe/Madrid' }).format(new Date()))}</p>
        </div>
        <div style="padding:24px;background:#fff;color:#222;">
          <p style="margin:0 0 12px"><strong>${total}</strong> expediente${total === 1 ? '' : 's'} ${total === 1 ? 'está parado' : 'están parados'} por encima de su plazo.</p>
          <ul style="margin:0 0 8px;padding-left:18px;font-size:13px;color:#334155">${indice}</ul>
          <p style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:12px;margin:16px 0;font-size:13px">
            Los botones naranjas <strong>preparan el mensaje</strong> al certificador, al cliente o al instalador:
            se abre una página con el texto ya redactado y lo envías tú desde ahí. No se manda nada con solo pulsar.
          </p>
          ${bloques}
          <p style="margin:28px 0 8px">
            <a href="${urlParte}" style="background:#111827;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:bold">Ver el parte en el navegador</a>
          </p>
          <p style="font-size:11px;color:#94a3b8;margin-top:20px">Los enlaces de acción caducan a los 14 días. Pasado ese plazo, entra en la app.</p>
        </div>
      </div>`;
}

// ─── Envío ────────────────────────────────────────────────────────────────────

/**
 * Genera el parte. `preview: true` lo construye SIN enviar (para probarlo y para la
 * página web del parte).
 */
async function generarParte() {
    const filas = await radar.escanear();
    const grupos = radar.agruparPorBloque(filas);
    // El parte en web se firma para el día en curso: es un enlace de lectura, no de
    // acción, pero tampoco tiene que quedar accesible eternamente.
    const { query } = firmarAccion('parte', 'global');
    const urlParte = `${FRONTEND()}/api/acciones/parte/global?${query}`;
    return {
        filas, grupos, total: filas.length, urlParte,
        wa: construirWa(grupos, filas.length, urlParte),
        html: construirHtml(grupos, filas.length, urlParte),
    };
}

/**
 * Comprueba y manda el parte.
 * @param {{force?: boolean}} opts  `force` salta el guard diario y la franja horaria.
 */
async function comprobarYAvisar({ force = false } = {}) {
    if (process.env.REVISION_ALERTA_ENABLED === 'false') return { ok: false, reason: 'deshabilitado' };

    if (!force) {
        const h = horaMadrid();
        if (h < HORA_MIN || h >= HORA_MAX) return { ok: false, reason: 'fuera-de-horario' };
        // Un solo parte por día natural. Persistido: un reinicio del contenedor no
        // puede provocar un segundo mensaje el mismo día.
        const { data } = await supabase.from('app_settings').select('value').eq('key', CLAVE_ULTIMO_AVISO).maybeSingle();
        if (data?.value === hoyMadrid()) return { ok: false, reason: 'ya-avisado-hoy' };
    }

    const parte = await generarParte();
    if (!parte.total) {
        console.log('[Parte] Nada atascado por encima del umbral.');
        return { ok: true, enviados: 0, total: 0 };
    }

    try {
        await whatsappService.sendText(adminPhone(), parte.wa);
    } catch (e) { console.warn('[Parte] WhatsApp:', e.message); }

    try {
        await emailService.sendMail({
            to: adminEmail(),
            // Buzón SECUNDARIO: los avisos internos no gastan la cuota del buzón con el
            // que se escribe a clientes e instaladores.
            from: process.env.ALERT_EMAIL_FROM || emailService.getFallbackSender() || undefined,
            subject: `📋 Parte de seguimiento — ${parte.total} expediente${parte.total === 1 ? '' : 's'} parado${parte.total === 1 ? '' : 's'}`,
            html: parte.html,
            text: parte.wa,
        });
    } catch (e) { console.warn('[Parte] Email:', e.message); }

    if (!force) {
        await supabase.from('app_settings').upsert(
            { key: CLAVE_ULTIMO_AVISO, value: hoyMadrid(), updated_at: new Date().toISOString() },
            { onConflict: 'key' }
        );
    }

    console.log(`[Parte] Enviado — ${parte.total} expedientes atascados.`);
    return { ok: true, enviados: 1, total: parte.total };
}

function start() {
    if (handle) return;
    if (process.env.REVISION_ALERTA_ENABLED === 'false') {
        console.log('[Parte] deshabilitado por configuración.');
        return;
    }
    // Primera comprobación 90 s tras el arranque (deja que WhatsApp levante sesión).
    setTimeout(() => { comprobarYAvisar().catch(e => console.error('[Parte]', e.message)); }, 90 * 1000);
    handle = setInterval(() => {
        comprobarYAvisar().catch(e => console.error('[Parte]', e.message));
    }, INTERVALO_MS);
    console.log(`[Parte] Vigilancia activa (comprobación cada 6 h, envío ${HORA_MIN}:00-${HORA_MAX}:00).`);
}

module.exports = { start, comprobarYAvisar, generarParte };
