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

// ── Lo que dice: quien ya ha hablado con nosotros se nota en el primer mensaje ──
// Medido el 10/11/2026 en el modo copia: «Hola Fran, soy Santiago Carmena, te llamé
// ayer. Te mando la documentación» era un número que no estaba en ningún sitio,
// pero NO era nuevo: había llamado por teléfono. Lo mismo con quien viene «de parte
// de» un instalador: ese lead es del partner, y lo lleva Fran a mano para
// asignárselo (por el formulario con `ref=wa` quedaría sin partner).
const sinTildes = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const YA_NOS_CONOCE = [
    [/\bfran(cisco)?\b/, 'se dirige a Fran por su nombre'],
    [/\bte (he )?llam(e|ado)\b|\bos (he )?llam(e|ado)\b|\bme llamast(e|eis)\b|\b(lo que )?hemos hablado\b|\bhablamos\b|\bhable con(tigo| vosotros)\b|\blo hablado\b|\bsegun (lo )?hablado\b|\bcomo (te |os )?(dije|comente|quedamos)\b|\bquedamos en\b|\blo que me (pediste|pedisteis|has pedido|habeis pedido)\b/, 'habla de una conversación anterior'],
    [/\bde parte de\b|\b(me )?(ha|han) (pasado|dado|facilitado) (tu|vuestro|este) (numero|telefono|contacto|whatsapp)\b|\btu (numero|telefono|contacto) me lo (ha|han) (pasado|dado)\b/, 'viene de parte de alguien'],
    // Los botones de WhatsApp de brokergy.es que NO son de un cliente (10/11/2026): las
    // páginas de instaladores y de distribuidores. El del ESCAPARATE («he visto a X en
    // brokergy.es…») sí es de un cliente, pero tiene su propio camino: `deEscaparate`.
    [/\bsoy (instalador|distribuidor)\b/, 'es un instalador o un distribuidor'],
];

/** Si el texto de la ráfaga dice que ya nos conoce, el motivo; si no, null. */
function yaNosConoce(texto) {
    const t = sinTildes(texto);
    if (!t.trim()) return null;
    for (const [re, motivo] of YA_NOS_CONOCE) if (re.test(t)) return motivo;
    return null;
}

// ── El ESCAPARATE: quien escribe desde la ficha de un instalador de brokergy.es ──
// La ficha (brokergy-web: src/data/red.js y encuentra-tu-instalador/[slug].astro) abre
// WhatsApp con «Hola, he visto a {nombre} en brokergy.es y me gustaría que me hiciera la
// obra. ¿Me calculáis la ayuda? Mi casa está en …». Ese lead es del INSTALADOR: se le
// avisa a él, y al cliente se le dice que le llamará y se le da el formulario con un
// `ref` que lleva al instalador (10/11/2026, Fran, el caso de Natalia y Gonzagarri).

/** Lo que dice el mensaje del escaparate, o null: { nombre, municipio, presupuesto }. */
function deEscaparate(texto) {
    const t = String(texto || '').replace(/\s+/g, ' ');
    const m = t.match(/\bhe visto a (.{2,80}?) en brokergy\.es\b/i);
    if (!m) return null;
    const casa = t.match(/\bmi casa est[aá] en ([^.?!¿¡\n]{2,60})/i);
    return {
        nombre: m[1].trim(),
        municipio: casa ? casa[1].trim().replace(/[,;:]+$/, '') : null,
        presupuesto: /presupuesto/i.test(t),
    };
}

// Lo que se le quita a un nombre de empresa para compararlo o para nombrarla al cliente.
const FORMA_JURIDICA = /[\s,]+(s\.?\s?l\.?\s?u\.?|s\.?\s?l\.?\s?l\.?|s\.?\s?l\.?|s\.?\s?a\.?\s?u\.?|s\.?\s?a\.?|s\.?\s?c\.?|c\.?\s?b\.?|s\.?\s?coop\.?|sociedad limitada( unipersonal)?|sociedad anonima)\s*$/i;
/** El nombre sin la forma jurídica: «GONZAGARRI S.L» → «GONZAGARRI», «Calefacciones X, S.L.U.» → «Calefacciones X». */
function sinFormaJuridica(nombre) {
    let s = String(nombre || '').trim();
    for (let i = 0; i < 2; i++) s = s.replace(FORMA_JURIDICA, '').trim();
    return s.replace(/[\s,.;:-]+$/, '');
}
/** Clave para casar el nombre escrito con la ficha: sin tildes, sin forma jurídica, solo letras y cifras. */
const claveNombre = (nombre) => sinTildes(sinFormaJuridica(nombre)).replace(/[^a-z0-9]/g, '');

/**
 * El instalador de la ficha, entre los partners: el nombre de la web es
 * `acronimo || razon_social` (brokergy-web: scripts/red.mjs). Solo vale UNO; con
 * ninguno o con varios, { ok: false } y lo lleva Fran.
 */
function elegirInstalador(nombre, prescriptores = []) {
    const k = claveNombre(nombre);
    if (!k || k.length < 3) return { ok: false, motivo: `no se entiende el nombre del instalador («${nombre}»)` };
    const nombres = (p) => [p.acronimo || p.razon_social, p.razon_social, p.acronimo].filter(Boolean).map(claveNombre);
    const unicosDe = (lista) => [...new Map(lista.map(p => [p.id_empresa, p])).values()];
    let unicos = unicosDe((prescriptores || []).filter(p => nombres(p).includes(k)));
    // La web acorta el nombre de algún autónomo («JOSÉ ÁLVAREZ» es «JOSÉ ÁLVAREZ ALMARCHA»,
    // medido el 10/11/2026 sobre los 73 del escaparate): si nada casa entero, vale el
    // COMIENZO del nombre, con 8 letras o más y de una sola ficha.
    if (!unicos.length && k.length >= 8) unicos = unicosDe((prescriptores || []).filter(p => nombres(p).some(n => n.startsWith(k))));
    if (unicos.length === 1) return { ok: true, partner: unicos[0] };
    return { ok: false, motivo: unicos.length ? `«${nombre}» casa con ${unicos.length} fichas de partner` : `«${nombre}» no casa con ninguna ficha de partner` };
}

const primeraMayuscula = (s) => String(s || '').toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());

/**
 * A quién del instalador se le avisa: su contacto de avisos COMERCIAL (el de los
 * leads), si no el de contacto, el responsable o el de la empresa. Solo un móvil
 * español. Devuelve { tel9, nombre } o null.
 */
function contactoAviso(p) {
    if (!p) return null;
    const cands = [];
    if (p.contacto_notificaciones_activas !== false && Array.isArray(p.contactos_notificacion)) {
        const lista = p.contactos_notificacion.filter(c => c && c.tlf);
        const comercial = lista.filter(c => !Array.isArray(c.roles) || !c.roles.length || c.roles.includes('comercial'));
        for (const c of [...comercial, ...lista]) cands.push({ tlf: c.tlf, nombre: c.nombre });
    }
    cands.push({ tlf: p.tlf_contacto, nombre: p.nombre_contacto }, { tlf: p.tlf_responsable, nombre: p.nombre_responsable }, { tlf: p.tlf, nombre: null });
    for (const c of cands) {
        if (!c.tlf || !esMovilEspanol(c.tlf)) continue;
        const nombre = String(c.nombre || '').trim().split(/\s+/)[0] || '';
        return { tel9: nueve(c.tlf), nombre: /^\p{L}{2,20}$/u.test(nombre) ? primeraMayuscula(nombre) : null };
    }
    return null;
}

/** «605 29 24 29». */
const telBonito = (t9) => { const d = nueve(t9) || ''; return d.length === 9 ? `${d.slice(0, 3)} ${d.slice(3, 5)} ${d.slice(5, 7)} ${d.slice(7)}` : d; };

/** El enlace del formulario para un lead del escaparate: `ref=esc-<fila>` lleva al instalador (nunca un dato personal). */
function enlaceEscaparate(base, id) {
    return `${String(base || 'https://app.brokergy.es').replace(/\/+$/, '')}/calcula-tu-ayuda?ref=esc-${Number(id)}`;
}

/** Al CLIENTE que escribe desde la ficha de un instalador (el texto que Fran aprobó el 10/11/2026). */
function textoEscaparateCliente({ instalador, enlace }) {
    const quien = sinFormaJuridica(instalador) || 'el instalador';
    return [
        'Hola, gracias por escribirnos.',
        '',
        `Le hemos pasado tu contacto a ${quien} para que te llamen, vean la obra y te hagan el presupuesto.`,
        '',
        'Mientras tanto, puedes calcular ya la ayuda que te corresponde, desde el móvil y en un par de minutos:',
        enlace,
        '',
        'Lo ideal es que lo hagas estando en casa: con el botón «Usar mi ubicación» localizamos tu vivienda en el Catastro. Es muy importante que selecciones la vivienda correcta (en un piso, tu planta y tu puerta), porque la ayuda se calcula con sus datos.',
        '',
        `Con eso tendrás una primera cifra, y cuando ${quien} tenga el presupuesto la afinamos.`,
        '',
        'Si lo prefieres, mándanos por aquí la dirección de la vivienda, una foto de la caldera y otra de su placa de características (la pegatina con los datos), y te lo calculamos nosotros.',
    ].join('\n');
}

/** Al INSTALADOR: le ha entrado un cliente por su ficha. Neutro (no sabemos si es él o ella). */
function textoAvisoInstalador({ contacto, municipio, presupuesto, nombreCliente, tel9 }) {
    const quien = [nombreCliente, telBonito(tel9)].filter(Boolean).join(', ');
    return [
        `Hola${contacto ? ` ${contacto}` : ''}, nos ha entrado por la web una petición para vosotros: un cliente${municipio ? ` de ${municipio}` : ''} os ha visto en brokergy.es, en el buscador de instaladores, y quiere que le hagáis la obra.${presupuesto ? ' Pide presupuesto.' : ''}`,
        '',
        quien,
        '',
        'Si te parece bien, llámale tú para ver la obra y preparar el presupuesto. Nosotros le calculamos ya la ayuda y, en cuanto tengas el presupuesto, nos lo pasas y la afinamos.',
    ].join('\n');
}

/**
 * ¿Se le escribe? Recibe lo leído del chat y de la BD y devuelve { ok, motivo }.
 *  chat: { numero, enAgenda, esEmpresa, mensajes, propios, primeroSeg, etiquetas }
 *  conocido: texto de dónde está en la app («cliente», «partner»…) o null
 *  prueba: es uno de los teléfonos de prueba (se salta lo de «ya le conocemos»)
 *  texto: lo que ha escrito en la ráfaga (cuerpo y pies de foto), para `yaNosConoce`
 */
function decidir({ chat, conocido = null, prueba = false, ahoraMs = Date.now(), historialMin = 360, texto = '' } = {}) {
    if (!chat) return { ok: false, motivo: 'no se ha podido leer el chat' };
    if (!chat.numero) return { ok: false, motivo: 'no se sabe su número (no se puede comprobar si es nuevo)' };
    if (!esMovilEspanol(chat.numero)) return { ok: false, motivo: 'no es un móvil español' };
    // Del escaparate o no, los filtros son los MISMOS: solo cambia lo que se le manda.
    const escaparate = deEscaparate(texto);
    const conEsc = (r) => (escaparate && r.ok ? { ...r, escaparate } : r);
    if (prueba) return conEsc({ ok: true, motivo: 'teléfono de prueba' });
    if (conocido) return { ok: false, motivo: `ya está en la app (${conocido})` };
    const dice = yaNosConoce(texto);
    if (dice) return { ok: false, motivo: `ya ha hablado con nosotros: ${dice}` };
    if (chat.enAgenda) return { ok: false, motivo: 'está guardado en la agenda del móvil' };
    if (chat.esEmpresa) return { ok: false, motivo: 'es una cuenta de empresa (WhatsApp Business)' };
    if ((chat.propios || 0) > 0) return { ok: false, motivo: 'ya le hemos escrito en este chat' };
    if ((chat.etiquetas || 0) > 0) return { ok: false, motivo: 'el chat tiene etiquetas' };
    const primero = Number(chat.primeroSeg) || 0;
    if (primero && primero * 1000 < ahoraMs - historialMin * 60_000) {
        return { ok: false, motivo: 'el chat tiene mensajes anteriores' };
    }
    return conEsc({ ok: true, motivo: escaparate ? `escribe desde la ficha de «${escaparate.nombre}» en brokergy.es` : 'es la primera vez que escribe' });
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
    yaNosConoce, inicioDiaMadrid,
    // El escaparate
    deEscaparate, sinFormaJuridica, claveNombre, elegirInstalador, contactoAviso, telBonito,
    enlaceEscaparate, textoEscaparateCliente, textoAvisoInstalador,
};
