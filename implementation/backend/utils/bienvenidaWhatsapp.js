/**
 * bienvenidaWhatsapp (lo puro) — la PRIMERA respuesta a quien escribe por primera vez.
 *
 * Quien nos escribe por WhatsApp preguntando por las ayudas recibe UNA vez, sola, el
 * enlace del formulario «Calcula tu ayuda» (la oportunidad nace del formulario, como
 * cualquier lead web) y el vídeo de las ayudas. El servicio
 * (services/bienvenidaWhatsapp.js) mira la sesión y la BD; aquí está lo que se decide
 * con lo mirado, para poder probarlo sin WhatsApp: el texto y a quién NO se le escribe.
 * El horario es el de la casa (utils/horarioWhatsapp.js, regla 205).
 *
 * REGLA — solo a quien es NUEVO de verdad. Basta una pista de que ya le conocemos
 * para no escribir: está en la app (cliente, partner, usuario, certificador), está en
 * la agenda del móvil, es una cuenta de empresa, ya le hemos escrito, el chat tiene
 * etiquetas o mensajes de antes. Un «no lo he podido comprobar» es un NO.
 */

const TZ = 'Europe/Madrid';

// Lo que puede mandar alguien que pregunta: texto, fotos, notas de voz, un PDF.
// Fuera: tarjetas de contacto (un instalador pasando un cliente), ubicaciones,
// llamadas, avisos del sistema, mensajes borrados.
const TIPOS_ADMITIDOS = new Set(['chat', 'image', 'ptt', 'audio', 'video', 'document']);

/** 9 dígitos finales, o null. */
const nueve = (t) => { const d = String(t || '').replace(/\D/g, ''); return d.length >= 9 ? d.slice(-9) : null; };

/** ¿Móvil español? (34 + 6/7 + 8 cifras, o las 9 cifras a secas). Lo demás no se contesta. */
function esMovilEspanol(numero) {
    const d = String(numero || '').replace(/\D/g, '');
    return /^(34)?[67]\d{8}$/.test(d);
}

/** El enlace del formulario, con `ref=wa` para saber de dónde viene el lead (nunca un dato personal). */
function enlaceFormulario(base = 'https://app.brokergy.es') {
    return `${String(base || 'https://app.brokergy.es').replace(/\/+$/, '')}/calcula-tu-ayuda?ref=wa`;
}

/**
 * El mensaje. Sin emojis y sin presentarse: el cliente ha escrito primero y sabe a
 * quién (feedback de Fran). El formulario es el camino; mandarlo por aquí, la
 * alternativa para quien no quiera rellenarlo.
 */
function textoBienvenida({ enlace = enlaceFormulario() } = {}) {
    return [
        'Hola, gracias por escribirnos.',
        '',
        'Puedes calcular ahora mismo la ayuda que te corresponde, desde el móvil y en un par de minutos:',
        enlace,
        '',
        // Fran (09/11/2026): «lo ideal es que lo hagas cuando estés en casa […] es muy
        // importante que selecciones la vivienda correcta». El botón del formulario dice
        // lo mismo: «Usar mi ubicación (siempre y cuando estés en casa)».
        'Lo ideal es que lo hagas estando en casa: con el botón «Usar mi ubicación» localizamos tu vivienda en el Catastro y sacamos su referencia catastral sin que tengas que buscarla. Es muy importante que selecciones la vivienda correcta (en un piso, tu planta y tu puerta), porque la ayuda se calcula con sus datos.',
        '',
        'Después te hace unas preguntas sobre la caldera y la obra, y al terminar te mandamos la propuesta con tus dos ayudas: el bono CAE y la deducción en la Renta.',
        '',
        'Si lo prefieres, mándanos por aquí la dirección de la vivienda (o su referencia catastral), una foto de la caldera y otra de su placa de características (la pegatina con los datos), y el presupuesto si ya lo tienes, y te lo calculamos nosotros.',
    ].join('\n');
}

// Corto a propósito: con menos de 100 caracteres y sin saltos, `sendMedia` lo deja
// como pie del vídeo en vez de mandarlo como mensaje aparte.
const PIE_VIDEO = 'Y en este vídeo te contamos en dos minutos las ayudas que hay.';

/**
 * ¿Se le escribe? Recibe lo leído del chat y de la BD y devuelve { ok, motivo }.
 *  chat: { numero, enAgenda, esEmpresa, mensajes, propios, primeroSeg, etiquetas }
 *  conocido: texto de dónde está en la app («cliente», «partner»…) o null
 *  prueba: es uno de los teléfonos de prueba (se salta lo de «ya le conocemos»)
 */
function decidir({ chat, conocido = null, prueba = false, ahoraMs = Date.now(), historialMin = 360 } = {}) {
    if (!chat) return { ok: false, motivo: 'no se ha podido leer el chat' };
    if (!chat.numero) return { ok: false, motivo: 'no se sabe su número (no se puede comprobar si es nuevo)' };
    if (!esMovilEspanol(chat.numero)) return { ok: false, motivo: 'no es un móvil español' };
    if (prueba) return { ok: true, motivo: 'teléfono de prueba' };
    if (conocido) return { ok: false, motivo: `ya está en la app (${conocido})` };
    if (chat.enAgenda) return { ok: false, motivo: 'está guardado en la agenda del móvil' };
    if (chat.esEmpresa) return { ok: false, motivo: 'es una cuenta de empresa (WhatsApp Business)' };
    if ((chat.propios || 0) > 0) return { ok: false, motivo: 'ya le hemos escrito en este chat' };
    if ((chat.etiquetas || 0) > 0) return { ok: false, motivo: 'el chat tiene etiquetas' };
    const primero = Number(chat.primeroSeg) || 0;
    if (primero && primero * 1000 < ahoraMs - historialMin * 60_000) {
        return { ok: false, motivo: 'el chat tiene mensajes anteriores' };
    }
    return { ok: true, motivo: 'es la primera vez que escribe' };
}

// ── La hora de Madrid, para el tope del día (el servidor va en UTC) ──────────
function partesMadrid(date = new Date()) {
    const dtf = new Intl.DateTimeFormat('en-US', {
        timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });
    const p = Object.fromEntries(dtf.formatToParts(date).map(x => [x.type, x.value]));
    return { y: +p.year, m: +p.month, d: +p.day, hora: (+p.hour) % 24, minuto: +p.minute, segundo: +p.second };
}

/** Instante UTC de una hora de pared en Madrid (dos pasadas: la segunda corrige el desfase). */
function madridAUtc(y, m, d, hora, minuto = 0) {
    let ts = Date.UTC(y, m - 1, d, hora, minuto);
    for (let i = 0; i < 2; i++) {
        const p = partesMadrid(new Date(ts));
        const comoUtc = Date.UTC(p.y, p.m - 1, p.d, p.hora, p.minuto, p.segundo);
        ts = Date.UTC(y, m - 1, d, hora, minuto) - (comoUtc - ts);
    }
    return new Date(ts);
}

// El horario en que se manda NO está aquí: es la franja de la casa (regla 205,
// utils/horarioWhatsapp.js, `puedeContestar`: quien nos ha escrito, de 7 a 21 h).

/** Medianoche de hoy en Madrid (para el tope del día). */
function inicioDiaMadrid(date = new Date()) {
    const { y, m, d } = partesMadrid(date);
    return madridAUtc(y, m, d, 0, 0);
}

module.exports = {
    TIPOS_ADMITIDOS, PIE_VIDEO, nueve, esMovilEspanol, enlaceFormulario, textoBienvenida, decidir,
    inicioDiaMadrid,
};
