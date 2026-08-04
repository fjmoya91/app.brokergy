/**
 * revisionPendienteNotifier — recordatorio al staff de los CEE que el
 * CERTIFICADOR ya ha subido y siguen esperando la revisión de Brokergy.
 *
 * Por qué existe: el certificador sube el .cex, pasa a `PRESENTADO` /
 * `PTE_REVISION` y **ya lo factura**. Si el CEE se queda semanas sin revisar, se
 * paga un trabajo que nadie ha validado y el expediente se atasca sin que nadie
 * lo note — la pelota es de Brokergy y no hay quien la reclame desde fuera.
 *
 * Cómo avisa: un ÚNICO resumen diario (WhatsApp al admin + email al buzón
 * secundario) con todo lo que lleva más de `REVISION_ALERTA_DIAS` días parado,
 * agrupado por certificador. Un mensaje por expediente llenaría el chat.
 *
 * Patrón de arranque idéntico a `marketplaceStatsRefresher`: setInterval simple
 * lanzado desde server.js, no bloqueante, errores registrados y reintento en el
 * siguiente ciclo.
 */

const supabase = require('./supabaseClient');
const emailService = require('./emailService');
const whatsappService = require('./whatsappService');

// El certificador ha entregado y la pelota es de Brokergy. `REVISADO` NO entra:
// ahí ya se le ha dado el visto bueno y espera él (registrar en Industria).
const FASES_ESPERANDO_REVISION = ['PRESENTADO', 'PTE_REVISION'];

const ETIQUETA_FASE = { PRESENTADO: 'Presentado', PTE_REVISION: 'En revisión' };

const DIAS_UMBRAL = Number(process.env.REVISION_ALERTA_DIAS || 2);
const INTERVALO_MS = 6 * 60 * 60 * 1000;        // se comprueba cada 6 h…
const HORA_MIN = Number(process.env.REVISION_ALERTA_HORA_MIN || 8);   // …pero solo
const HORA_MAX = Number(process.env.REVISION_ALERTA_HORA_MAX || 21);  // se manda de día

const CLAVE_ULTIMO_AVISO = 'revision_pendiente_last_notify';

const FRONTEND = () => process.env.FRONTEND_URL || 'https://app.brokergy.es';
const adminPhone = () => process.env.WHATSAPP_ADMIN_CHAT || '34623926179';
const adminEmail = () => process.env.ADMIN_EMAIL || 'franciscojavier.moya.s2e2@gmail.com';

let handle = null;

const diasDesde = (iso) => {
    if (!iso) return null;
    const d = new Date(iso);
    if (isNaN(d)) return null;
    return Math.floor((Date.now() - d.getTime()) / 86400000);
};

// Día natural en Madrid ('YYYY-MM-DD'). El guard de "una vez al día" tiene que ir
// por el calendario del usuario, no por UTC.
const hoyMadrid = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(new Date());
const horaMadrid = () => Number(new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', hour12: false }).format(new Date()));

/**
 * CEE entregados por el certificador y pendientes de revisión desde hace más de
 * `dias` días. Una entrada por FASE (un expediente puede tener el inicial y el
 * final esperando a la vez, aunque es raro).
 */
async function pendientesDeRevision(dias = DIAS_UMBRAL) {
    const { data: exps, error } = await supabase
        .from('expedientes')
        // Nunca `cee` entero: lleva el XML del CEE (~MB). Solo la clave que hace falta.
        .select('id, numero_expediente, estado, cliente_id, seguimiento, instalacion, certificador_id:cee->>certificador_id')
        .or(`seguimiento->>cee_inicial.in.(${FASES_ESPERANDO_REVISION.join(',')}),seguimiento->>cee_final.in.(${FASES_ESPERANDO_REVISION.join(',')})`);

    if (error) throw new Error(error.message);

    const filas = [];
    for (const e of exps || []) {
        const seg = e.seguimiento || {};
        for (const [key, etiquetaFase] of [['cee_inicial', 'CEE inicial'], ['cee_final', 'CEE final']]) {
            const fase = seg[key];
            if (!FASES_ESPERANDO_REVISION.includes(fase)) continue;

            // `_desde` es cuándo entró en el subestado actual; el mapa de
            // timestamps es el respaldo para los expedientes anteriores al sellado.
            const desde = seg[`${key}_desde`] || seg[`${key}_ts`]?.[fase] || null;
            const d = diasDesde(desde);
            // Sin fecha (expedientes anteriores al sellado de timestamps) NO se
            // descarta: un CEE entregado del que no se sabe desde cuándo espera
            // es más sospechoso, no menos. Se avisa marcado como "sin fecha".
            if (d !== null && d < dias) continue;

            filas.push({
                expediente_id: e.id,
                numero_expediente: e.numero_expediente,
                estado: e.estado,
                cliente_id: e.cliente_id,
                certificador_id: e.certificador_id || null,
                fase_key: key,
                fase_label: etiquetaFase,
                subestado: fase,
                desde,
                dias: d,
                sin_fecha: d === null,
                direccion: (e.instalacion?.direccion || '').trim() || null,
                municipio: (e.instalacion?.municipio || '').trim() || null,
            });
        }
    }

    // Lo que más tiempo lleva parado, primero; los de fecha desconocida al final.
    filas.sort((a, b) => (b.dias ?? -1) - (a.dias ?? -1));
    await rellenarNombres(filas);
    return filas;
}

/** Añade nombre de cliente y de certificador con dos consultas, no N. */
async function rellenarNombres(filas) {
    const cliIds = [...new Set(filas.map(f => f.cliente_id).filter(Boolean))];
    if (cliIds.length) {
        const { data } = await supabase
            .from('clientes')
            .select('id_cliente, nombre_razon_social, apellidos, direccion, municipio')
            .in('id_cliente', cliIds);
        const map = Object.fromEntries((data || []).map(c => [c.id_cliente, c]));
        for (const f of filas) {
            const c = map[f.cliente_id];
            if (!c) continue;
            f.cliente_nombre = `${c.nombre_razon_social || ''} ${c.apellidos || ''}`.trim() || null;
            f.direccion = f.direccion || (c.direccion || '').trim() || null;
            f.municipio = f.municipio || (c.municipio || '').trim() || null;
        }
    }

    const certIds = [...new Set(filas.map(f => f.certificador_id).filter(Boolean))];
    if (certIds.length) {
        const { data } = await supabase
            .from('prescriptores')
            .select('id_empresa, razon_social, acronimo')
            .in('id_empresa', certIds);
        const map = Object.fromEntries((data || []).map(p => [String(p.id_empresa), p]));
        for (const f of filas) {
            const p = map[String(f.certificador_id)];
            f.certificador_nombre = p?.razon_social || p?.acronimo || 'Sin certificador asignado';
        }
    }
    for (const f of filas) {
        if (!f.certificador_nombre) f.certificador_nombre = 'Sin certificador asignado';
    }
}

const agrupaPorCertificador = (filas) => {
    const g = new Map();
    for (const f of filas) {
        if (!g.has(f.certificador_nombre)) g.set(f.certificador_nombre, []);
        g.get(f.certificador_nombre).push(f);
    }
    return [...g.entries()];
};

// Algunas direcciones ya traen el municipio dentro ("CL DEPOSITO AGUAS 15(B)
// 13610 CAMPO DE CRIPTANA (CIUDAD REAL)"): no se repite detrás.
const ubicacionDe = (f) => {
    const dir = f.direccion || '';
    const mun = f.municipio || '';
    const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const repetido = mun && norm(dir).includes(norm(mun));
    return [dir, repetido ? null : mun].filter(Boolean).join(', ') || f.cliente_nombre || '—';
};
const linkDe = (f) => `${FRONTEND()}/?exp=${encodeURIComponent(f.numero_expediente || '')}`;
const esperaDe = (f) => (f.sin_fecha ? 'sin fecha de entrega' : `${f.dias} días esperando`);

// Días del más antiguo con fecha conocida (null si ninguno la tiene).
const masAntiguo = (filas) => filas.find(f => !f.sin_fecha)?.dias ?? null;

function construirMensaje(filas) {
    const grupos = agrupaPorCertificador(filas);
    const cuerpo = grupos.map(([cert, items]) => {
        const lineas = items.map(f =>
            `• *${f.numero_expediente}* — ${f.fase_label}\n  ${ubicacionDe(f)}\n  ⏳ ${esperaDe(f)} (${ETIQUETA_FASE[f.subestado] || f.subestado})`
        ).join('\n');
        return `👷 *${cert}* (${items.length})\n${lineas}`;
    }).join('\n\n');

    const viejo = masAntiguo(filas);

    return `⏰ *CEE PENDIENTES DE TU REVISIÓN*

Hay *${filas.length}* certificado${filas.length === 1 ? '' : 's'} que el certificador ya ha entregado y siguen esperando a que los revises (umbral: ${DIAS_UMBRAL} días).${viejo !== null ? `\nEl más antiguo lleva *${viejo} días*.` : ''}

${cuerpo}

Recuerda: te los factura al entregarlos, no al revisarlos.

🔗 ${FRONTEND()}/?tab=expedientes`;
}

function construirHtml(filas) {
    const grupos = agrupaPorCertificador(filas);
    const bloques = grupos.map(([cert, items]) => `
        <h3 style="margin:22px 0 8px;font-size:13px;color:#444">${escapar(cert)} <span style="color:#999;font-weight:normal">(${items.length})</span></h3>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          ${items.map(f => `
            <tr style="border-bottom:1px solid #eee">
              <td style="padding:8px 6px;white-space:nowrap"><a href="${linkDe(f)}" style="color:#ea580c;font-weight:bold;text-decoration:none">${escapar(f.numero_expediente)}</a></td>
              <td style="padding:8px 6px;color:#666">${escapar(f.fase_label)}</td>
              <td style="padding:8px 6px;color:#666">${escapar(ubicacionDe(f))}</td>
              <td style="padding:8px 6px;text-align:right;color:${f.sin_fecha ? '#6b7280' : (f.dias > 14 ? '#dc2626' : '#b45309')};font-weight:bold;white-space:nowrap">${escapar(esperaDe(f))}</td>
            </tr>`).join('')}
        </table>`).join('');

    const viejo = masAntiguo(filas);

    return `<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;">
        <div style="background:linear-gradient(135deg,#f59e0b,#ea580c);padding:20px 28px;">
          <h2 style="margin:0;color:#fff;font-size:16px;">BROKERGY · CEE pendientes de tu revisión</h2>
        </div>
        <div style="padding:24px;background:#fff;color:#222;">
          <p><strong>${filas.length}</strong> certificado${filas.length === 1 ? '' : 's'} que el certificador ya ha entregado siguen esperando tu revisión (umbral: <strong>${DIAS_UMBRAL} días</strong>).${viejo !== null ? ` El más antiguo lleva <strong>${viejo} días</strong>.` : ''}</p>
          <p style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:12px;margin:16px 0">
            El certificador <strong>factura al entregar</strong>, no al revisar: lo que se queda aquí se acaba pagando sin validar.
          </p>
          ${bloques}
          <p style="margin:24px 0">
            <a href="${FRONTEND()}/?tab=expedientes" style="background:#FF6D00;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:bold">Ver los expedientes</a>
          </p>
        </div>
      </div>`;
}

/**
 * Comprueba y avisa. `force` salta el guard de "una vez al día" y la franja
 * horaria (lo usa la ruta manual de prueba).
 */
async function comprobarYAvisar({ force = false } = {}) {
    if (process.env.REVISION_ALERTA_ENABLED === 'false') return { ok: false, reason: 'deshabilitado' };

    if (!force) {
        const h = horaMadrid();
        if (h < HORA_MIN || h >= HORA_MAX) return { ok: false, reason: 'fuera-de-horario' };

        // Un solo aviso por día natural. Persistido: un reinicio del contenedor
        // no puede provocar un segundo mensaje el mismo día.
        const { data } = await supabase.from('app_settings').select('value').eq('key', CLAVE_ULTIMO_AVISO).maybeSingle();
        if (data?.value === hoyMadrid()) return { ok: false, reason: 'ya-avisado-hoy' };
    }

    const filas = await pendientesDeRevision();
    if (!filas.length) {
        console.log('[RevisionPendiente] Nada pendiente por encima del umbral.');
        return { ok: true, enviados: 0, pendientes: 0 };
    }

    const msg = construirMensaje(filas);

    try {
        await whatsappService.sendText(adminPhone(), msg);
    } catch (e) { console.warn('[RevisionPendiente] WhatsApp:', e.message); }

    try {
        await emailService.sendMail({
            to: adminEmail(),
            // Buzón SECUNDARIO: los avisos internos no gastan la cuota del buzón
            // con el que se escribe a clientes e instaladores.
            from: process.env.ALERT_EMAIL_FROM || emailService.getFallbackSender() || undefined,
            subject: `⏰ ${filas.length} CEE pendientes de tu revisión${masAntiguo(filas) !== null ? ` (el más antiguo, ${masAntiguo(filas)} días)` : ''}`,
            html: construirHtml(filas),
            text: msg,
        });
    } catch (e) { console.warn('[RevisionPendiente] Email:', e.message); }

    if (!force) {
        await supabase.from('app_settings').upsert(
            { key: CLAVE_ULTIMO_AVISO, value: hoyMadrid(), updated_at: new Date().toISOString() },
            { onConflict: 'key' }
        );
    }

    console.log(`[RevisionPendiente] Aviso enviado — ${filas.length} CEE pendientes.`);
    return { ok: true, enviados: 1, pendientes: filas.length };
}

function start() {
    if (handle) return;
    if (process.env.REVISION_ALERTA_ENABLED === 'false') {
        console.log('[RevisionPendiente] deshabilitado por configuración.');
        return;
    }
    // Primera comprobación 90 s tras el arranque (deja que WhatsApp levante sesión).
    setTimeout(() => { comprobarYAvisar().catch(e => console.error('[RevisionPendiente]', e.message)); }, 90 * 1000);
    handle = setInterval(() => {
        comprobarYAvisar().catch(e => console.error('[RevisionPendiente]', e.message));
    }, INTERVALO_MS);
    console.log(`[RevisionPendiente] Vigilancia activa (umbral ${DIAS_UMBRAL} días, comprobación cada 6 h, envío ${HORA_MIN}:00-${HORA_MAX}:00).`);
}

const escapar = (s) => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

module.exports = {
    start,
    comprobarYAvisar,
    pendientesDeRevision,
    DIAS_UMBRAL,
};
