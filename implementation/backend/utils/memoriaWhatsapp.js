// =============================================================================
// memoriaWhatsapp — la MEMORIA de un chat: lo que conviene saber la próxima vez y no está en la app
// (Fran, 22/11/2026: «quiero que mi chat tenga memoria de algún modo», sin petar Supabase).
//
// Una ficha por teléfono (`wa_memoria`), con unos pocos HECHOS cortos y fechados:
//   { f: 'AAAA-MM-DD', t: 'Escribe Paqui, no Carolina: llamarla Paqui.', o: '26RES080_57' | null, p: 'contestador' | 'fran' }
// Los apunta el contestador (el campo «recordar» de su misma respuesta: ninguna llamada de más) y
// Fran desde su grupo («nota 26RES060_281: hablado por teléfono…»). El contestador la lee al
// contestar, como contexto: si choca con el dossier, manda el dossier.
//
// Los LÍMITES los pone el código, no el modelo: 15 hechos, 200 caracteres cada uno, 120 días, y
// fuera lo que parezca un IBAN, un DNI, un teléfono, un correo o un enlace. Puro: lo prueba
// scripts/test_contestador_whatsapp.js.
// =============================================================================

const MAX_HECHOS = 15;
const MAX_CHARS = 200;
const DIAS = 120;

// Lo que no se guarda nunca en la memoria (el repo es público, la tabla no; pero no hace falta).
const SENSIBLE = [
    /\bES\d{2}(?:[ -]?\d{4}){5}\b/gi,                 // IBAN
    /\b\d{8}[A-HJ-NP-TV-Z]\b/gi,                       // DNI
    /\b[XYZ]\d{7}[A-HJ-NP-TV-Z]\b/gi,                  // NIE
    /(?:\+?34[ -]?)?\b[6789]\d{2}[ -]?\d{3}[ -]?\d{3}\b/g, // teléfono
    /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g,                   // correo
    /https?:\/\/\S+/gi,                                // enlace
    /\b\d{16,}\b/g,                                    // tarjetas y cuentas sueltas
];

/** Un hecho, limpio: una línea, sin datos sensibles, ≤ 200 caracteres. '' si no queda nada. Pura. */
function limpiarHecho(texto) {
    let s = String(texto || '').replace(/[\r\n\t]+/g, ' ');
    for (const re of SENSIBLE) s = s.replace(re, '[…]');
    s = s.replace(/\s{2,}/g, ' ').trim();
    if (s.length > MAX_CHARS) s = `${s.slice(0, MAX_CHARS - 1).replace(/\s+\S*$/, '')}…`;
    // Lo que no dice nada (solo el marcador o dos palabras) no se guarda.
    return s.replace(/\[…\]/g, '').replace(/[\s.,;:-]/g, '').length >= 8 ? s : '';
}

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9ñ ]/g, ' ').replace(/\s+/g, ' ').trim();
const diaDe = (d) => new Date(d).toISOString().slice(0, 10);

/**
 * Lo que había + lo nuevo → la ficha nueva. Lo repetido no se duplica (se queda el más nuevo), lo
 * de más de 120 días se cae, y si pasan de 15 se quitan los más viejos. Lo más nuevo, al final. Pura.
 * @param {Array} actuales  hechos guardados
 * @param {string[]} textos  lo que se quiere apuntar
 * @param {{ ahora?: Date, obra?: string|null, por?: string }} o
 */
function fusionar(actuales, textos, { ahora = new Date(), obra = null, por = 'contestador' } = {}) {
    const limite = diaDe(ahora.getTime() - DIAS * 86_400_000);
    const viejos = (Array.isArray(actuales) ? actuales : [])
        .filter(h => h && typeof h.t === 'string' && h.t && String(h.f || '') >= limite);
    // Lo que ya está apuntado (igual salvo tildes y puntuación) no se vuelve a escribir.
    const claves = new Set(viejos.map(h => norm(h.t)));
    const nuevos = [];
    for (const t of (textos || []).map(limpiarHecho).filter(Boolean)) {
        if (claves.has(norm(t))) continue;
        claves.add(norm(t));
        nuevos.push({ f: diaDe(ahora), t, o: obra || null, p: por === 'fran' ? 'fran' : 'contestador' });
    }
    const caducados = (Array.isArray(actuales) ? actuales.length : 0) - viejos.length;
    return { hechos: [...viejos, ...nuevos].slice(-MAX_HECHOS), anadidos: nuevos.length, caducados };
}

/** La ficha, como la lee el modelo. '' si no hay nada. Pura. */
function paraPrompt(hechos) {
    const lista = (Array.isArray(hechos) ? hechos : []).filter(h => h?.t);
    if (!lista.length) return '';
    const fecha = (f) => { const [, m, d] = String(f || '').split('-'); return d && m ? `${d}/${m}` : '?'; };
    return lista.map(h => `- ${fecha(h.f)}${h.p === 'fran' ? ' (Fran)' : ''}${h.o ? ` · ${h.o}` : ''}: ${h.t}`).join('\n');
}

/**
 * La orden de Fran en su grupo: «nota 26RES060_281: hablado por teléfono, ya lo tiene claro».
 * También «nota C812: …» (el chat de esa respuesta) o «nota 629123456: …». Pura.
 * @returns {null | { destino: { tipo: 'obra'|'turno'|'tel', valor: string }, texto: string }}
 */
function ordenNota(texto) {
    const s = String(texto || '').trim();
    if (!s || s.length > 600) return null;
    const m = s.match(/^\s*(?:nota|apunta|recuerda|memoria)\s+(?:de\s+|en\s+|a\s+|para\s+)?(?:la\s+|el\s+)?(\d{2}(?:RES|TER|CEE)\d{2,3}_(?:OP)?\d{1,4}|\d{4}CEE_\d{1,5}|C\s?\d{1,6}|(?:\+?34\s?)?[6789]\d{2}\s?\d{3}\s?\d{3})\s*[:,.-]\s*(\S[\s\S]*)$/i);
    if (!m) return null;
    const ref = m[1].replace(/\s+/g, '').toUpperCase();
    const destino = /^C\d+$/.test(ref) ? { tipo: 'turno', valor: ref.slice(1) }
        : /^(?:\+?34)?[6789]\d{8}$/.test(ref) ? { tipo: 'tel', valor: ref.slice(-9) }
            : { tipo: 'obra', valor: ref };
    const t = m[2].trim();
    return t.length >= 4 ? { destino, texto: t } : null;
}

module.exports = { limpiarHecho, fusionar, paraPrompt, ordenNota, MAX_HECHOS, MAX_CHARS, DIAS };
