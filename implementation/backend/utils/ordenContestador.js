// =============================================================================
// ordenContestador — cómo contesta Fran a una copia del contestador en su grupo
// (Fran, 10/11/2026: «que en lugar de poner manda C4, que solo sea C4. O te pongo
// C4, dile además que no sé qué, y ya lo terminas de redactar»).
//
//   «C4»  · «c4»  · «manda C4» · «vale C4» · «C2 y C4» · «C2, C4»   → MANDAR tal cual
//   «C4, dile además que …» · «C4 pero dile …»                        → con CAMBIOS
//
// Lo PRIMERO lo hace el vigilante sin despertar a Claude (es un botón: no hay nada que
// pensar). Lo SEGUNDO va a Claude, que redacta el texto final con lo que dice Fran y lo
// manda con `contestador.js enviar C4 --si "<literal>" --texto "<final>"`: el mensaje de
// Fran ES el «sí» para ESE envío. Puro: lo prueba scripts/test_contestador_whatsapp.js.
// =============================================================================

const ANTES = '(?:(?:manda(?:lo|r|la)?|env[ií]a(?:lo|la)?|vale|ok|okey|s[ií]|dale|adelante|perfecto)[\\s,.:;!]*)?';
const DESPUES = '(?:[\\s,.]*(?:ok|okey|vale|s[ií]|dale|perfecto|m[aá]nd(?:a|alo|ala)|env[ií]a(?:lo|la)?))?';
const UNO = 'C\\s?(\\d{1,6})';
// Varios: «C2 y C4», «C2, C4» o dos mensajes seguidos («C2» «C4», que el vigilante junta con un espacio).
const SOLO = new RegExp(`^\\s*${ANTES}((?:C\\s?\\d{1,6})(?:\\s*(?:,|y|e|&|\\+)\\s*C?\\s?\\d{1,6}|\\s+C\\s?\\d{1,6})*)${DESPUES}\\s*[.!]*\\s*$`, 'i');
const CON_CAMBIOS = new RegExp(`^\\s*${ANTES}${UNO}\\b[\\s,.:;-]*(\\S.*)$`, 'is');

/**
 * @returns {null | { tipo: 'mandar', ids: number[] } | { tipo: 'cambios', id: number, pide: string }}
 */
function ordenContestador(texto) {
    const s = String(texto || '').trim();
    if (!s || s.length > 1500) return null;
    const solo = s.match(SOLO);
    if (solo) {
        const ids = [...new Set((solo[1].match(/\d{1,6}/g) || []).map(Number).filter(n => n > 0))];
        return ids.length ? { tipo: 'mandar', ids } : null;
    }
    const con = s.match(CON_CAMBIOS);
    if (con && Number(con[1]) > 0) return { tipo: 'cambios', id: Number(con[1]), pide: con[2].trim() };
    return null;
}

module.exports = { ordenContestador };
