// ─── agendaWhatsapp.js ───────────────────────────────────────────────────────
// Buscar a alguien en la AGENDA de WhatsApp para darlo de alta como cliente.
//
// Lo de quien pregunta por WhatsApp (un CEE suelto, una aerotermia) ya está en
// el móvil: su nombre como lo guardaste y su número. Teclearlo otra vez en la
// app es donde se cuela la errata del teléfono. Aquí se decide, sin BD ni
// WhatsApp, qué contactos casan con lo escrito y con qué nombre nacería la ficha.
//
// Puro: se prueba desde Node (`node scripts/test_agenda_whatsapp.js`).
//
// REGLAS
//  · El prefijo de la casa ("RES080_87", "CEE_54", "RES060 -") NO es parte del
//    nombre: se quita. Lo que va entre paréntesis al final es quién nos lo trae
//    ("Irene Lopez (Gonzagarri)") y se devuelve aparte, como pista de partner.
//  · El reparto nombre / apellidos es una PROPUESTA (los campos quedan
//    editables): con dos palabras, una y una; con tres, una y dos; con más, dos
//    y el resto ("María José García López").
//  · Un número se busca por sus DÍGITOS, con o sin el 34 delante.
// ─────────────────────────────────────────────────────────────────────────────

const { leerPrefijo } = require('./nombreContactoCliente');

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
// Emojis y marcas invisibles: un pushname es a menudo "Pepi 🌻".
const sinEmojis = (s) => String(s || '').replace(/[\p{Extended_Pictographic}‍️]/gu, '');

/**
 * El nombre con el que nacería la ficha: { completo, nombre, apellidos, partner }.
 * `nombreAgenda` = como lo guardaste tú; `pushname` = como se ha puesto él
 * (solo se usa si en la agenda no hay nada que aprovechar).
 */
function nombreDeContacto(nombreAgenda, pushname = null) {
    let s = sinEmojis(nombreAgenda).trim();
    const p = leerPrefijo(s);
    if (p) s = p.resto;
    let partner = null;
    const m = s.match(/\(([^()]*)\)\s*$/);
    if (m) {
        partner = m[1].replace(/\s+/g, ' ').trim() || null;
        s = s.slice(0, m.index);
    }
    s = s.replace(/[()]/g, ' ').replace(/^[\s\-–·.]+|[\s\-–·.]+$/g, '').replace(/\s+/g, ' ').trim();
    if (!s) s = sinEmojis(pushname).replace(/\s+/g, ' ').trim();
    const palabras = s.split(' ').filter(Boolean);
    const corte = palabras.length >= 4 ? 2 : 1;
    return {
        completo: s,
        nombre: palabras.slice(0, corte).join(' '),
        apellidos: palabras.slice(corte).join(' '),
        partner,
    };
}

/**
 * Une lo leído de WhatsApp: el mismo contacto llega dos veces (su `@c.us` y su
 * `@lid`). Se queda UNO por número, con lo mejor de cada copia. Los que no
 * tienen número visible van aparte, por su id.
 * Entrada: [{ id, numero, nombre, pushname, enAgenda, chat, t }].
 */
function unirAgenda(crudos) {
    const porClave = new Map();
    for (const c of crudos || []) {
        if (!c) continue;
        const numero = String(c.numero || '').replace(/\D/g, '') || null;
        const clave = numero || `id:${c.id}`;
        const prev = porClave.get(clave);
        if (!prev) {
            porClave.set(clave, {
                numero, nombre: c.nombre || null, pushname: c.pushname || null,
                enAgenda: !!c.enAgenda, chat: !!c.chat, t: Number(c.t) || 0,
            });
            continue;
        }
        prev.nombre = prev.nombre || c.nombre || null;
        prev.pushname = prev.pushname || c.pushname || null;
        prev.enAgenda = prev.enAgenda || !!c.enAgenda;
        prev.chat = prev.chat || !!c.chat;
        prev.t = Math.max(prev.t, Number(c.t) || 0);
    }
    return [...porClave.values()];
}

/**
 * Los contactos que casan con lo escrito, los mejores primero.
 * Con 6 dígitos o más se busca por NÚMERO; si no, por palabras (todas tienen
 * que estar en el nombre de la agenda o en el pushname, sin tildes).
 * Primero los guardados en la agenda; dentro, los de conversación más reciente.
 */
function filtrarAgenda(agenda, q, max = 10) {
    const texto = String(q || '').trim();
    const digitos = texto.replace(/\D/g, '');
    let casa;
    if (digitos.length >= 6 && digitos.length >= texto.replace(/[\s+().-]/g, '').length - 1) {
        // "654 54 70 40", "+34 654547040": lo escrito es un número.
        const sin34 = digitos.length > 9 && digitos.startsWith('34') ? digitos.slice(2) : digitos;
        casa = (c) => !!c.numero && c.numero.includes(sin34);
    } else {
        const palabras = norm(texto).split(/\s+/).filter(Boolean);
        if (!palabras.length || norm(texto).length < 3) return [];
        casa = (c) => {
            const pajar = norm(`${c.nombre || ''} ${c.pushname || ''}`);
            return palabras.every(w => pajar.includes(w));
        };
    }
    return (agenda || [])
        .filter(c => (c.nombre || c.pushname) && casa(c))
        .sort((a, b) => (Number(b.enAgenda) - Number(a.enAgenda)) || ((b.t || 0) - (a.t || 0)))
        .slice(0, max);
}

/**
 * Un nº de obra en forma comparable: sin el año, guion = guion bajo y sin ceros
 * a la izquierda. "26RES060_OP212" → "RES060_OP212" · "RES060-08" → "RES060_8"
 * · "2026CEE_054" → "CEE_54". Vale para el prefijo de la agenda y para la BD.
 */
function codigoObra(s) {
    const m = String(s || '').toUpperCase().trim()
        .match(/^(?:\d{2}|\d{4})?((?:RES|TER)\d{3}|CEE)I?[_-](OP)?0*(\d+)$/);
    return m ? `${m[1]}_${m[2] || ''}${m[3]}` : null;
}

/**
 * Qué obra dice el prefijo de la agenda: { tipo, codigo } o null si no lleva
 * número ("RES080", "CEEI"). tipo = 'oportunidad' | 'expediente' | 'cee'.
 */
function obraDelPrefijo(prefijo) {
    const codigo = codigoObra(prefijo);
    if (!codigo) return null;
    if (codigo.startsWith('CEE')) return { tipo: 'cee', codigo };
    return { tipo: codigo.includes('_OP') ? 'oportunidad' : 'expediente', codigo };
}

module.exports = { nombreDeContacto, unirAgenda, filtrarAgenda, codigoObra, obraDelPrefijo, _norm: norm };
