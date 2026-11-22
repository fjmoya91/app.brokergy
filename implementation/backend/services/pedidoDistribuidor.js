// ─── El PEDIDO del instalador al comercial de su distribuidor (22/11/2026) ─────
//
// Fran: «que de un modelo pueda ver el precio de cada distribuidor con el que trabaja,
// elegir a quién se lo compra y que se lo pida al comercial automáticamente».
//
// El instalador pulsa «Pedir a …» en la ficha del equipo, VE el mensaje entero (la
// previa no escribe ni envía nada) y lo manda. Sale desde el WhatsApp de BROKERGY al
// comercial del distribuidor (el primer contacto de su ficha) y, si tiene correo, por
// email; al instalador le llega copia por WhatsApp. Queda apuntado en
// `instalador_pedidos` con el texto EXACTO y los canales que salieron.
//
// ⚠️ Sale a TERCEROS: solo con `PEDIDOS_DISTRIBUIDOR_ENABLED=true` (apagado en local,
// donde se escribe en la BD de producción). Apagado, «enviar» devuelve el borrador
// `en_seco` y NO escribe nada.
// Ver docs/conocimiento/instalador-app/catalogo-por-distribuidor.md.
const supabase = require('./supabaseClient');

const activo = () => String(process.env.PEDIDOS_DISTRIBUIDOR_ENABLED || '').toLowerCase() === 'true';
const OBRA_RE = /^[\p{L}0-9 _./-]{1,60}$/u;
const SEL_EMPRESA = 'id_empresa, acronimo, razon_social, tipo_empresa, nombre_contacto, tlf_contacto, email_contacto, contactos_notificacion, tlf, email';

const nombreEmpresa = (p) => p?.acronimo || p?.razon_social || '';
const eur = (n) => `${Number(n).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' })} €`;
const fecha = (iso) => { const [a, m, d] = String(iso || '').slice(0, 10).split('-'); return a && m && d ? `${d}/${m}/${a}` : ''; };
const nombrePila = (s) => String(s || '').trim().split(/\s+/)[0] || '';

/** El comercial del distribuidor: el primer contacto con teléfono o correo de su ficha. */
function comercialDe(p) {
    const lista = Array.isArray(p?.contactos_notificacion) ? p.contactos_notificacion : [];
    const c = lista.find((x) => x && (x.tlf || x.email)) || null;
    return {
        nombre: c?.nombre || p?.nombre_contacto || null,
        tlf: c?.tlf || p?.tlf_contacto || p?.tlf || null,
        email: c?.email || p?.email_contacto || p?.email || null,
    };
}

/** El teléfono del instalador, para que el comercial le conteste a él. */
const contactoInstalador = (p) => ({ nombre: nombreEmpresa(p), tlf: comercialDe(p).tlf });

/** Valida lo que manda el navegador. Devuelve { error } o los datos limpios. */
function datosDelPedido(body) {
    const cantidad = Number(body?.cantidad ?? 1);
    if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 50) return { error: 'La cantidad tiene que ser de 1 a 50.', code: 'CANTIDAD_NO_VALIDA' };
    const obra = String(body?.obra || '').trim().replace(/\s+/g, ' ');
    if (obra && !OBRA_RE.test(obra)) return { error: 'La obra es un número o una referencia corta (sin símbolos raros).', code: 'OBRA_NO_VALIDA' };
    const nota = String(body?.nota || '').trim().replace(/\r\n?/g, '\n').slice(0, 500);
    return { cantidad, obra: obra || null, nota: nota || null, distribuidor_id: String(body?.distribuidor_id || '') };
}

/** El texto EXACTO que sale (sin emojis; WhatsApp en negrita con *…*). */
function mensajePedido({ instalador, distribuidor, comercial, equipo, cantidad, obra, nota, tarifa }) {
    const refs = [equipo.referencias?.exterior && `ud. exterior ${equipo.referencias.exterior}`, equipo.referencias?.interior && `ud. interior ${equipo.referencias.interior}`]
        .filter(Boolean).join(' · ');
    const lineas = [
        `Hola${comercial?.nombre ? ` ${nombrePila(comercial.nombre)}` : ''}, *${instalador.nombre}* os hace este pedido a través de BROKERGY:`,
        '',
        `- Equipo: *${equipo.marca} ${equipo.nombre}*${refs ? ` (${refs})` : ''}`,
        `- Cantidad: ${cantidad}`,
        obra ? `- Obra: ${obra}` : null,
        tarifa ? `- Precio de vuestra tarifa: ${eur(tarifa.precio)} sin IVA${tarifa.desde ? ` (desde el ${fecha(tarifa.desde)})` : ''}` : null,
        nota ? `- Nota: ${nota}` : null,
        '',
        instalador.tlf
            ? `Para confirmar plazo y precio, contestad directamente a ${instalador.nombre} en el ${instalador.tlf}.`
            : `Para confirmar plazo y precio, contestad a ${instalador.nombre}.`,
        '',
        'BROKERGY',
    ];
    return lineas.filter((l) => l !== null).join('\n');
}

const mensajeCopia = ({ distribuidor, comercial, texto }) =>
    `Copia del pedido que hemos mandado a ${comercial?.nombre ? `${comercial.nombre} (${distribuidor})` : distribuidor}:\n\n${texto}`;

const asunto = ({ instalador, equipo, cantidad }) => `Pedido de ${instalador.nombre}: ${cantidad} × ${equipo.marca} ${equipo.nombre}`;

function htmlDe(texto) {
    const esc = texto.replace(/\*/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
    return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#222;font-size:15px;line-height:24px">${esc}</div>`;
}

/**
 * Lo manda por los canales que tenga el comercial y la copia al instalador.
 * Best-effort por canal; devuelve los canales que SALIERON al comercial.
 */
async function enviar({ comercial, instalador, distribuidor, texto, asuntoCorreo }, deps = {}) {
    const wa = deps.whatsapp || require('./whatsappService');
    const mail = deps.email || require('./emailService');
    const canales = [];
    if (comercial.tlf) {
        try { await wa.sendText(comercial.tlf, texto); canales.push('WhatsApp'); }
        catch (e) { console.warn('[pedido distribuidor] WA:', e.message); }
    }
    if (comercial.email) {
        try { await mail.sendMail({ to: comercial.email, subject: asuntoCorreo, text: texto.replace(/\*/g, ''), html: htmlDe(texto) }); canales.push('Email'); }
        catch (e) { console.warn('[pedido distribuidor] email:', e.message); }
    }
    if (canales.length && instalador.tlf) {
        try { await wa.sendText(instalador.tlf, mensajeCopia({ distribuidor, comercial, texto })); }
        catch (e) { console.warn('[pedido distribuidor] copia:', e.message); }
    }
    return canales;
}

/** Las dos fichas (instalador y distribuidor) en una lectura. */
async function fichas(instaladorId, distribuidorId) {
    const { data, error } = await supabase.from('prescriptores').select(SEL_EMPRESA).in('id_empresa', [instaladorId, distribuidorId]);
    if (error) { const e = new Error(error.message); e.bdCaida = true; throw e; }
    return {
        inst: (data || []).find((p) => p.id_empresa === instaladorId) || null,
        dist: (data || []).find((p) => p.id_empresa === distribuidorId && String(p.tipo_empresa).toUpperCase() === 'DISTRIBUIDOR') || null,
    };
}

module.exports = { activo, comercialDe, contactoInstalador, datosDelPedido, mensajePedido, mensajeCopia, asunto, enviar, fichas, nombreEmpresa };
