// ─── bandejaWhatsapp.js ──────────────────────────────────────────────────────
// ¿Este último mensaje PIDE respuesta? Puro: se prueba desde Node
// (`node scripts/test_agenda_whatsapp.js`).
//
// Medido el 13/10/2026 en la bandeja real: de 117 chats «sin contestar» más de
// 2 h, la cabeza de la lista eran «De acuerdo, muchas gracias», «Perfecto»,
// «muchas gracias Fran»… Son el cierre de una conversación: no esperan nada.
// Se apartan (no se esconden: un «gracias» puede ir con una foto que sí hay que
// mirar, y por eso solo cuentan los mensajes de TEXTO cortos y sin pregunta).
// ─────────────────────────────────────────────────────────────────────────────

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Palabras de cortesía y acuse. Un mensaje es «de cortesía» si, quitando estas
// palabras, signos y emojis, no queda NADA más que un nombre corto.
const CORTESIA = [
    'ok', 'okey', 'okay', 'vale', 'valee', 'perfecto', 'perfect', 'genial', 'estupendo', 'fenomenal', 'guay',
    'gracias', 'muchas', 'mil', 'muchisimas', 'grasias', 'thanks', 'de', 'acuerdo', 'entendido', 'recibido',
    'un', 'saludo', 'saludos', 'abrazo', 'igualmente', 'buenas', 'noches', 'buen', 'dia', 'finde', 'fin', 'semana',
    'bien', 'muy', 'si', 'claro', 'nada', 'a', 'ti', 'usted', 'vosotros', 'hasta', 'luego', 'pronto', 'manana',
    'listo', 'hecho', 'ya', 'esta', 'apuntado', 'visto', 'oki', 'okis', 'bueno', 'pues', 'y', 'por', 'todo', 'tu', 'te',
];
const CORTESIA_SET = new Set(CORTESIA);

/**
 * true si el mensaje NO pide respuesta: un sticker, una reacción, o un texto
 * corto sin pregunta hecho solo de cortesía («Perfecto», «muchas gracias Fran»).
 */
function esCortesia({ tipo, texto }) {
    if (tipo === 'sticker' || tipo === 'reaction') return true;
    if (tipo !== 'chat') return false;
    const t = String(texto || '').trim();
    if (!t || t.length > 60 || t.includes('?') || t.includes('¿')) return false;
    const palabras = norm(t).replace(/[\p{Extended_Pictographic}‍️]/gu, ' ').replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);
    if (!palabras.length) return true;    // solo emojis («👍», «🙏»)
    const resto = palabras.filter(w => !CORTESIA_SET.has(w));
    // Se admite UNA palabra suelta que no es de cortesía: el nombre («gracias Fran»).
    return resto.length === 0 || (resto.length === 1 && palabras.length >= 2);
}

module.exports = { esCortesia };
