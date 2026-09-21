/**
 * Leer y escribir un número decimal como lo teclea una persona.
 *
 * POR QUÉ EXISTE: un `<input type="number">` devuelve **cadena vacía** mientras
 * lo escrito no sea un número completo, y `Number('')` es **0**. Medido en el
 * Chrome del certificador (locale español), tecleando en el ancho de una
 * ventana:
 *
 *     «2,2»  -> "2.2"   ✓
 *     «2.2»  -> "2.2"   ✓ … pero al pasar por «2.» devuelve ""  -> 0
 *     «2,»   -> "2"        (se come la coma)
 *     borrar -> ""      -> 0
 *
 * O sea: escribir el decimal con PUNTO metía un 0 a mitad de la escritura, y
 * borrar el campo para reescribirlo lo dejaba en 0 — marcado además como
 * «confirmado por el certificador», porque tocar una medida la da por buena.
 * Una ventana de 0 m² que cuenta como medida buena.
 *
 * Aquí el número se lee del TEXTO, que es lo que la persona ve: la coma y el
 * punto valen igual, y lo que no es un número no vale 0, no vale nada.
 */

/**
 * El número que dice este texto, o `null` si no dice ninguno.
 *
 * `null` NO es 0: es «todavía no hay número». De esa diferencia depende que
 * borrar un campo no escriba un cero.
 */
export function aNumero(texto) {
    if (typeof texto === 'number') return Number.isFinite(texto) ? texto : null;
    if (texto == null) return null;
    const s = String(texto).trim().replace(/\s/g, '').replace(',', '.');
    // Un número y nada más: ni miles, ni letras, ni dos separadores.
    if (!s || !/^-?\d*\.?\d*$/.test(s) || s === '.' || s === '-') return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
}

/**
 * Cómo se escribe un número en castellano: con COMA.
 *
 * Sin rellenar decimales — «1,3», no «1,30»: el campo se está editando y los
 * ceros de más obligan a borrarlos antes de teclear.
 */
export function aTexto(n) {
    if (n == null || n === '') return '';
    const v = typeof n === 'number' ? n : aNumero(n);
    return v == null ? String(n) : String(v).replace('.', ',');
}
