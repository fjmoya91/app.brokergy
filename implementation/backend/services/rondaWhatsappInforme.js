// =============================================================================
// rondaWhatsappInforme — lo que la RONDA DE WHATSAPP cuenta, y por dónde (2026-10-19)
// -----------------------------------------------------------------------------
// Tres salidas de los MISMOS datos, y no llevan lo mismo a propósito (mismo
// criterio que el parte diario):
//  · WHATSAPP al chat del asistente: CORTO. El parte diario se apagó por RUIDO
//    (decisión del usuario): diez líneas, lo que se puede hacer hoy, y el resto
//    «en tu correo». Sin nada nuevo, no hay mensaje.
//  · EMAIL: el informe entero, chat por chat.
//  · MARKDOWN: el mismo informe en un fichero, para leerlo con Claude o la ruta.
//
// FASE 1 (en seco): el WhatsApp NO invita a contestar. El asistente lee los
// últimos mensajes de su chat como contexto: un «sí C1» de Fran a un resumen que
// lo ofreciera podría leerse como permiso para mandar un borrador a un cliente.
// Hasta que exista ese paso, el resumen solo informa y lo dice.
//
// Puro: sin BD ni WhatsApp. Probado en scripts/test_ronda_whatsapp.js.
// =============================================================================

const { corta } = require('./rondaWhatsappIA');

const escapar = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const tapa = (tel) => (tel ? `···${String(tel).slice(-3)}` : '—');
const nombreCorto = (c) => corta(String(c.titulo || '').split(' — ')[0], 40);
const fechaLarga = (iso) => new Intl.DateTimeFormat('es-ES', { dateStyle: 'full', timeZone: 'Europe/Madrid' })
    .format(iso ? new Date(iso) : new Date());

const DESTINO_DOC = {
    FACTURA: 'Facturas (OCR de facturas)', JUSTIFICANTE_PAGO: 'Justificante de pago (junto a su factura)', PRESUPUESTO: '0. PRESUPUESTO', CERTIFICADO_RITE: 'RITE (OCR del certificado)',
    MEMORIA_RITE: 'Memoria RITE', CIFO_O_ANEXO_FIRMADO: 'Documento firmado (revisar cuál)', CEE: 'CEE (módulo CEE)',
    DNI: 'DNI del titular', JUSTIFICANTE_TITULARIDAD: 'Justificante de titularidad (OCR)', CAPTURA_CATASTRO: 'Catastro / RC',
    PLANO_CROQUIS: 'Planos / croquis (para el CEE)', OTRO_DOCUMENTO: 'Otros (lo decide una persona)',
};

// ─────────────────────────────────────────────────────────────────────────────
// Lo que se saca de los chats, una vez, para las tres salidas
// ─────────────────────────────────────────────────────────────────────────────
function puntos(res) {
    const hoy = res.fecha;
    const chats = res.chats || [];
    const conBorrador = chats.filter(c => c.borrador && c.borrador.accion !== 'CALLAR');
    const promesasNuestras = chats.flatMap(c => (c.analisis?.promesas || [])
        .filter(p => p.quien === 'NOSOTROS' && !p.cumplida).map(p => ({ c, p })));
    // Las VENCIDAS (fecha de hoy o anterior) primero: son las que ya se están incumpliendo.
    const vencidas = promesasNuestras.filter(({ p }) => p.para_cuando && p.para_cuando <= hoy);
    return {
        sinEnviar: res.resumen.sinEnviar || [],
        escalar: chats.filter(c => c.borrador?.accion === 'ESCALAR'),
        responder: chats.filter(c => c.borrador?.accion === 'RESPONDER'),
        conBorrador,
        nuevas: chats.filter(c => c.nuevas),
        promesasNuestras,
        vencidas,
        obrasConAdjuntos: new Set(chats.flatMap(c => c.obrasTocadas || [])).size,
        adjuntosObra: chats.reduce((s, c) => s + (c.adjuntosObra || 0), 0),
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// WHATSAPP — corto
// ─────────────────────────────────────────────────────────────────────────────
/** El resumen para el chat del asistente, o null si no hay nada que contar. */
function resumenWhatsapp(res) {
    const r = res.resumen;
    const p = puntos(res);
    const hayAlgo = r.activos > 0 && (p.adjuntosObra || r.preguntas || p.conBorrador.length || p.nuevas.length || p.sinEnviar.length || r.sinAnalizar);
    if (!hayAlgo) return null;

    const L = [];
    L.push(`🌙 *Ronda de WhatsApp* · ${fechaLarga(res.generada_at)}`);
    // Lo incompleto se dice ARRIBA: un resumen a medias leído como entero es peor que ninguno.
    if (r.sinAnalizar) L.push(`⚠️ *Incompleto:* ${res.aviso || `${r.sinAnalizar} chats se han quedado sin analizar.`}`);
    L.push(`${res.ventana}: ${r.activos} chats · ${r.adjuntos} adjuntos (${r.asignados} con su obra${r.dudosos ? `, ${r.dudosos} dudosos` : ''}) · ${r.preguntas} preguntas sin contestar`);

    const tu = [];
    if (p.sinEnviar.length) tu.push(`· ${p.sinEnviar.length} propuesta${p.sinEnviar.length === 1 ? '' : 's'} sin enviar y el cliente escribiendo: ${p.sinEnviar.slice(0, 3).join(', ')}${p.sinEnviar.length > 3 ? '…' : ''}`);
    for (const { c, p: pr } of (p.vencidas.length ? p.vencidas : p.promesasNuestras).slice(0, 2)) {
        tu.push(`· Prometiste: ${corta(pr.que, 60)}${pr.obra ? ` (${pr.obra})` : ` (${nombreCorto(c)})`}`);
    }
    if (p.escalar.length) {
        tu.push(`· ${p.escalar.length} para ti: ${p.escalar.slice(0, 2).map(c => `${nombreCorto(c)} (${corta(c.borrador.motivo, 45)})`).join(' · ')}`);
    }
    if (tu.length) { L.push(''); L.push('🔴 *Eres tú*'); L.push(...tu); }
    if (p.adjuntosObra) { L.push(''); L.push(`🟡 *Por colocar:* ${p.adjuntosObra} adjuntos en ${p.obrasConAdjuntos} obras`); }
    if (p.nuevas.length) L.push(`🆕 *Peticiones nuevas:* ${p.nuevas.slice(0, 3).map(nombreCorto).join(' · ')}`);
    if (p.responder.length) L.push(`💬 *Borradores listos:* ${p.responder.length}`);
    L.push('');
    L.push('_En prueba: solo informa. No coloca nada, no anota y no escribe a nadie. El detalle, en tu correo._');
    return L.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// MARKDOWN — el informe entero
// ─────────────────────────────────────────────────────────────────────────────
function informeMarkdown(res) {
    const r = res.resumen;
    const L = [];
    L.push('# Ronda de WhatsApp');
    L.push('');
    L.push(`${fechaLarga(res.generada_at)} · ${res.ventana.toLowerCase()} · **en seco**: no se ha colocado, anotado ni enviado nada.`);
    L.push('');
    if (r.sinAnalizar) { L.push(`> ⚠️ **Incompleto:** ${res.aviso || `${r.sinAnalizar} chats se han quedado sin analizar.`}`); L.push(''); }
    L.push('| | |');
    L.push('|---|---|');
    L.push(`| Chats con mensajes nuevos | **${r.activos}** (de ${r.conChat} leídos; ${r.telefonos} teléfonos con algo vivo) |`);
    L.push(`| Quiénes | ${Object.entries(r.porRol).map(([k, v]) => `${v} ${k}`).join(' · ') || '—'} |`);
    L.push(`| Adjuntos nuevos | **${r.adjuntos}**: ${r.cont.fotos} fotos, ${r.cont.documentos} documentos, ${r.cont.audios} audios transcritos, ${r.cont.videos} vídeos · ya colocados antes: ${r.cont.yaColocadas} |`);
    L.push(`| Con su obra | **${r.asignados}** (${r.asignadosAlta} con confianza alta) · dudosos: **${r.dudosos}** · de una petición nueva: ${r.nuevas} · no relacionados: ${r.noRelacionados} |`);
    L.push(`| Fotos con apartado propuesto | ${r.conSlot} de ${r.fotosEnObra} (${r.slotHueco} rellenan un hueco que la app da por pendiente) |`);
    L.push(`| Preguntas sin contestar | **${r.preguntas}** |`);
    L.push(`| Promesas | suyas: ${r.promesasEllos} (sin cumplir: ${r.promesasEllosPend}) · nuestras: ${r.promesasNos} (sin cumplir: **${r.promesasNosPend}**) · descartadas por ser de un aviso automático: ${r.promesasDescartadas} |`);
    L.push(`| Borradores | responder: **${r.borr.RESPONDER}** · para ti: **${r.borr.ESCALAR}** · callar: ${r.borr.CALLAR} · a mano: ${r.borr.MANO} |`);
    L.push(`| Enlaces en los borradores | ${r.enlaces}, todos puestos por el código · problemas: **${r.problemasEnlaces}** |`);
    L.push(`| Propuestas sin enviar con el cliente escribiendo | **${r.sinEnviar.length}**${r.sinEnviar.length ? ` (${r.sinEnviar.join(', ')})` : ''} |`);
    L.push(`| Coste | ${res.modelo ? `${res.modelo} · ` : ''}${res.coste.llamadas} llamadas · ${res.coste.think || 0} tokens pensados · ≈ ${res.coste.eur.toFixed(3)} € · ${res.coste.reintentos} reintentos · ${res.tiempos.min} min${r.soloCortesia ? ` · ${r.soloCortesia} chats de solo cortesía, sin analizar` : ''} |`);
    if (res.fallos.length) L.push(`| Fallos de lectura | ${res.fallos.length} (al final) |`);
    L.push('');
    const wa = resumenWhatsapp(res);
    if (wa) {
        L.push('## El WhatsApp de la mañana');
        L.push('');
        L.push('```');
        L.push(wa.replace(/\*/g, ''));
        L.push('```');
        L.push('');
    }
    L.push('## Chat por chat');
    L.push('');
    L.push('Primero los que más trabajo quitan: adjuntos por colocar y preguntas sin contestar.');
    for (const c of res.chats) {
        L.push('');
        L.push(`### ${c.ref} · ${c.titulo}`);
        L.push('');
        L.push(`${c.rolTexto} · teléfono ${tapa(c.telefono)} · ${c.mensajes} mensajes (${c.suyos} suyos) · último: ${c.ultimo}`);
        if (c.obras.length) L.push(`Obras abiertas: ${c.obras.slice(0, 8).map(o => `${o.codigo} (${o.estado || '—'})`).join(', ')}${c.obras.length > 8 ? `, y ${c.obras.length - 8} más` : ''}`);
        if (c.error) { L.push(''); L.push(`⚠️ ${c.error}`); continue; }
        const a = c.analisis;
        if (c.filas.length) {
            L.push('');
            L.push('| # | Cuándo | Qué es | Obra | Dónde iría | Confianza |');
            L.push('|---|---|---|---|---|---|');
            for (const f of c.filas) L.push(`| ${f.n} | ${f.cuando} | ${f.que} | ${f.obra === 'NUEVA' ? '**petición nueva**' : (f.obra || '**dudoso**')} | ${f.donde} | ${f.confianza} |`);
        }
        if (c.sinLeer.length) L.push(`\nNo leídos: ${c.sinLeer.join(' · ')}`);
        if (a?.resumen_por_obra?.length) {
            L.push('');
            L.push('**Al historial:**');
            for (const h of a.resumen_por_obra) L.push(`- ${h.obra || '(sin obra)'}: ${h.texto}`);
        }
        if (a?.preguntas_sin_contestar?.length) {
            L.push('');
            L.push('**Sin contestar:**');
            for (const p of a.preguntas_sin_contestar) L.push(`- ${p.fecha ? `${p.fecha} · ` : ''}${p.obra ? `${p.obra} · ` : ''}${p.pregunta}`);
        }
        if (a?.promesas?.length) {
            L.push('');
            L.push('**Promesas:**');
            for (const p of a.promesas) L.push(`- ${p.quien === 'NOSOTROS' ? 'Nosotros' : 'Ellos'}${p.obra ? ` (${p.obra})` : ''}: ${p.que}${p.para_cuando ? ` · para ${p.para_cuando}` : ''}${p.cumplida ? ' · ✔ cumplida' : ''}`);
        }
        const b = c.borrador;
        if (b) {
            L.push('');
            if (b.propuesta === 'SIN_ENVIAR') L.push(`⚠️ **${c.obraBorrador}: la propuesta está sin enviar** y el cliente está escribiendo. ¿La envías?`);
            if (b.problemas_enlaces?.length) L.push(`⚠️ Enlaces: ${b.problemas_enlaces.join(' · ')}`);
            if (b.accion === 'RESPONDER') {
                L.push(`**Borrador ${c.ref}** (${deDonde(c)}):`);
                L.push('');
                for (const linea of b.mensaje.split('\n')) L.push(`> ${linea}`);
            } else if (b.accion === 'ESCALAR') L.push(`**${c.ref} · para ti:** ${b.motivo}`);
            else if (b.accion === 'MANO') L.push(`**${c.ref} · a mano:** ${b.motivo}`);
            else L.push(`**${c.ref} · no hace falta contestar:** ${b.motivo}`);
        }
    }
    if (res.fallos.length) {
        L.push('');
        L.push('## Fallos de lectura');
        L.push('');
        for (const f of res.fallos) L.push(`- ${tapa(f.tel)}: ${f.error}`);
    }
    return L.join('\n');
}

function deDonde(c) {
    const b = c.borrador;
    if (b.con_dossier) return `con el dossier de ${c.obraBorrador}${b.enlaces?.length ? ` · enlaces puestos por el código: ${b.enlaces.map(e => e.marca).join(', ')}` : ''}`;
    if (b.propuesta) return `${c.obraBorrador}, propuesta ${b.propuesta === 'SIN_ENVIAR' ? 'sin enviar' : 'aceptada, sin expediente'}`;
    return 'sin dossier: no se sabe la obra';
}

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL — el informe entero, legible en el móvil
// ─────────────────────────────────────────────────────────────────────────────
const S = {
    caja: 'background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;margin:0 0 12px',
    h2: 'font-size:15px;margin:18px 0 8px;color:#111827',
    tdk: 'padding:4px 8px 4px 0;color:#6b7280;vertical-align:top;white-space:nowrap',
    td: 'padding:4px 0;color:#111827',
    th: 'text-align:left;padding:4px 6px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-weight:600',
    tdc: 'padding:4px 6px;border-bottom:1px solid #f3f4f6;vertical-align:top',
    cita: 'margin:6px 0 0;padding:8px 10px;background:#f0fdf4;border-left:3px solid #16a34a;border-radius:4px;white-space:pre-wrap',
    aviso: 'margin:6px 0 0;padding:6px 10px;background:#fef3c7;border-left:3px solid #d97706;border-radius:4px',
};
const linea = (k, v) => `<tr><td style="${S.tdk}">${escapar(k)}</td><td style="${S.td}">${v}</td></tr>`;

function informeHtml(res) {
    const r = res.resumen;
    const p = puntos(res);
    const H = [];
    H.push('<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:14px;line-height:1.45;background:#f9fafb;padding:16px;color:#111827">');
    H.push('<div style="background:#0f766e;color:#fff;border-radius:10px;padding:14px 16px;margin:0 0 12px">');
    H.push('<div style="font-size:18px;font-weight:700">🌙 Ronda de WhatsApp</div>');
    H.push(`<div style="opacity:.9;font-size:12px;margin-top:2px">${escapar(fechaLarga(res.generada_at))} · ${escapar(res.ventana.toLowerCase())} · en seco</div>`);
    H.push('</div>');
    if (r.sinAnalizar) {
        H.push(`<div style="${S.aviso};margin:0 0 12px"><b>⚠️ Incompleto:</b> ${escapar(res.aviso || `${r.sinAnalizar} chats se han quedado sin analizar.`)}</div>`);
    }

    H.push(`<div style="${S.caja}"><table style="border-collapse:collapse;font-size:13px">`);
    H.push(linea('Chats con mensajes nuevos', `<b>${r.activos}</b> de ${r.conChat} leídos`));
    H.push(linea('Adjuntos nuevos', `<b>${r.adjuntos}</b> · ${r.asignados} con su obra · ${r.dudosos} dudosos · ${r.nuevas} de peticiones nuevas`));
    H.push(linea('Preguntas sin contestar', `<b>${r.preguntas}</b>`));
    H.push(linea('Borradores', `${r.borr.RESPONDER} para contestar · ${r.borr.ESCALAR} para ti`));
    H.push(linea('Prometiste y sigue pendiente', `${r.promesasNosPend}`));
    H.push(linea('Coste', `≈ ${res.coste.eur.toFixed(3)} € · ${res.tiempos.min} min${res.modelo ? ` · ${escapar(res.modelo)}` : ''}`));
    H.push('</table><div style="margin-top:8px;color:#6b7280;font-size:12px">En prueba: nada de esto se ha colocado, anotado ni enviado.</div></div>');

    if (p.sinEnviar.length || p.vencidas.length || p.escalar.length) {
        H.push(`<h2 style="${S.h2}">🔴 Eres tú</h2><div style="${S.caja}"><ul style="margin:0;padding-left:18px">`);
        if (p.sinEnviar.length) H.push(`<li>${p.sinEnviar.length} propuesta(s) sin enviar y el cliente escribiendo: <b>${escapar(p.sinEnviar.join(', '))}</b></li>`);
        for (const { c, p: pr } of p.vencidas) H.push(`<li>Prometiste: ${escapar(pr.que)} <span style="color:#6b7280">(${escapar(pr.obra || nombreCorto(c))} · para ${escapar(pr.para_cuando)})</span></li>`);
        for (const c of p.escalar) H.push(`<li><b>${escapar(c.ref)} · ${escapar(nombreCorto(c))}</b>: ${escapar(c.borrador.motivo)}</li>`);
        H.push('</ul></div>');
    }

    H.push(`<h2 style="${S.h2}">Chat por chat</h2>`);
    for (const c of res.chats) {
        H.push(`<div style="${S.caja}">`);
        H.push(`<div style="font-weight:700">${escapar(c.ref)} · ${escapar(c.titulo)}</div>`);
        H.push(`<div style="color:#6b7280;font-size:12px">${escapar(c.rolTexto)} · ${c.mensajes} mensajes (${c.suyos} suyos) · último ${escapar(c.ultimo)}</div>`);
        if (c.obras.length) H.push(`<div style="color:#6b7280;font-size:12px">Obras: ${escapar(c.obras.slice(0, 6).map(o => o.codigo).join(', '))}${c.obras.length > 6 ? ` y ${c.obras.length - 6} más` : ''}</div>`);
        if (c.error) { H.push(`<div style="${S.aviso}">${escapar(c.error)}</div></div>`); continue; }
        if (c.filas.length) {
            H.push(`<table style="border-collapse:collapse;font-size:12px;margin-top:8px;width:100%"><tr><th style="${S.th}">Qué es</th><th style="${S.th}">Obra</th><th style="${S.th}">Dónde iría</th></tr>`);
            for (const f of c.filas) {
                const obra = f.obra === 'NUEVA' ? '<b>petición nueva</b>' : (f.obra ? escapar(f.obra) : '<b style="color:#b45309">dudoso</b>');
                H.push(`<tr><td style="${S.tdc}">${escapar(f.que)}<div style="color:#9ca3af">${escapar(f.cuando)}</div></td><td style="${S.tdc}">${obra}</td><td style="${S.tdc}">${escapar(f.donde).replace(/\*\*/g, '')}</td></tr>`);
            }
            H.push('</table>');
        }
        const a = c.analisis;
        if (a?.resumen_por_obra?.length) {
            H.push('<div style="margin-top:8px;font-weight:600;font-size:12px">Al historial</div><ul style="margin:2px 0 0;padding-left:18px">');
            for (const h of a.resumen_por_obra) H.push(`<li>${escapar(h.obra || 'sin obra')}: ${escapar(h.texto)}</li>`);
            H.push('</ul>');
        }
        if (a?.preguntas_sin_contestar?.length) {
            H.push('<div style="margin-top:8px;font-weight:600;font-size:12px">Sin contestar</div><ul style="margin:2px 0 0;padding-left:18px">');
            for (const q of a.preguntas_sin_contestar) H.push(`<li>${escapar([q.fecha, q.obra].filter(Boolean).join(' · '))}${q.fecha || q.obra ? ' · ' : ''}${escapar(q.pregunta)}</li>`);
            H.push('</ul>');
        }
        if (a?.promesas?.length) {
            H.push('<div style="margin-top:8px;font-weight:600;font-size:12px">Promesas</div><ul style="margin:2px 0 0;padding-left:18px">');
            for (const q of a.promesas) H.push(`<li>${q.quien === 'NOSOTROS' ? 'Nosotros' : 'Ellos'}${q.obra ? ` (${escapar(q.obra)})` : ''}: ${escapar(q.que)}${q.para_cuando ? ` · para ${escapar(q.para_cuando)}` : ''}${q.cumplida ? ' · ✔' : ''}</li>`);
            H.push('</ul>');
        }
        const b = c.borrador;
        if (b) {
            if (b.propuesta === 'SIN_ENVIAR') H.push(`<div style="${S.aviso}"><b>${escapar(c.obraBorrador)}</b>: la propuesta está sin enviar y el cliente está escribiendo.</div>`);
            if (b.accion === 'RESPONDER') {
                H.push(`<div style="margin-top:8px;font-weight:600;font-size:12px">Borrador ${escapar(c.ref)} <span style="font-weight:400;color:#6b7280">(${escapar(deDonde(c))})</span></div>`);
                H.push(`<div style="${S.cita}">${escapar(b.mensaje)}</div>`);
            } else if (b.accion === 'ESCALAR') H.push(`<div style="${S.aviso}"><b>Para ti:</b> ${escapar(b.motivo)}</div>`);
            else if (b.accion === 'MANO') H.push(`<div style="${S.aviso}"><b>A mano:</b> ${escapar(b.motivo)}</div>`);
        }
        H.push('</div>');
    }
    H.push('</div>');
    return H.join('\n');
}

function asuntoEmail(res) {
    const r = res.resumen;
    return `🌙 Ronda de WhatsApp — ${r.activos} chats, ${r.adjuntos} adjuntos, ${r.preguntas} preguntas sin contestar`;
}

module.exports = { resumenWhatsapp, informeMarkdown, informeHtml, asuntoEmail, puntos, DESTINO_DOC, tapa };
