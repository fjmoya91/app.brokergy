// ============================================================
// regageJustificante.js — el nº de REGISTRO del justificante del MITECO
//
// La sede del MITECO devuelve, al presentar la solicitud de emisión de CAE, un
// «JUSTIFICANTE DEL REGISTRO» con «Número de registro: REGAGE26e00088163268».
// Ese número es como el Gestor Autonómico cita el lote en sus requerimientos, y
// es lo único que los casa con el lote (ver scripts/lotes_registro_miteco.sql).
//
// Se lee del PDF tal cual, SIN modelo de IA ni gasto de tokens: el número va en
// claro en el contenido (a veces comprimido con Flate), así que basta inflar los
// streams y buscarlo. Probado con los seis justificantes de LOTE-2025-002…009.
// ============================================================

const zlib = require('zlib');

// REGAGE + año (2 cifras) + «e» + 11 cifras. Se exige el formato para no coger
// una mención suelta de la palabra.
const RE_REGAGE = /REGAGE\d{2}[a-z]\d{8,14}/gi;

/**
 * Los nº de registro REGAGE que aparecen en un PDF.
 * @param {Buffer} buffer
 * @returns {string[]} sin repetir, en el orden en que aparecen
 */
function regagesDePdf(buffer) {
    if (!Buffer.isBuffer(buffer) || !buffer.length) return [];
    const texto = buffer.toString('latin1');
    const vistos = [...(texto.match(RE_REGAGE) || [])];
    const reStream = /stream\r?\n/g;
    let m;
    while ((m = reStream.exec(texto))) {
        const ini = m.index + m[0].length;
        const fin = texto.indexOf('endstream', ini);
        if (fin < 0) break;
        try {
            const plano = zlib.inflateSync(buffer.subarray(ini, fin)).toString('latin1');
            vistos.push(...(plano.match(RE_REGAGE) || []));
        } catch { /* no es Flate, o es una imagen: no lleva el número */ }
    }
    // El prefijo en mayúsculas y la letra del medio como la escribe la sede («e»).
    const norm = vistos.map(v => `REGAGE${v.slice(6, 8)}${v.slice(8, 9).toLowerCase()}${v.slice(9)}`);
    return [...new Set(norm)];
}

/**
 * El nº de registro del justificante, o null si no hay UNO solo: con dos números
 * distintos no se adivina cuál es el de la solicitud.
 */
function leerRegage(buffer) {
    const r = regagesDePdf(buffer);
    return r.length === 1 ? r[0] : null;
}

module.exports = { leerRegage, regagesDePdf };
