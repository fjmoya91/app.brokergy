// ============================================================================
// ¿Con qué PROGRAMA —y qué versión— se hizo este certificado?
// ============================================================================
//
// Desde el 01/10/2026 se certifica con CE3X 3.1 y desde el 08/10/2026 con la
// 3.2, y durante la transición conviven en el MISMO expediente un CEE inicial de
// la 2.3 (o la 3.1) y un final de la 3.2.
// En la rejilla del CEE se pinta una etiqueta junto al .xml para que se vea de
// un vistazo con cuál está hecho cada uno, sin abrir el fichero.
//
// De dónde sale (medido sobre los .xml reales):
//   · esquema v2.0 (CE3X 2.3): <IdentificacionEdificio>…<Procedimiento>CEXv2.3</Procedimiento>
//   · esquema v3.0 (CE3X 3.1 y 3.2): <DatosCertificado><Procedimiento><Nombre>CE3X</Nombre>
//                              <Version>2026.08.20</Version></Procedimiento>
//     — su <Version> es una fecha de COMPILACIÓN, no «3.1»: las dos escriben el
//     mismo esquema, y lo que las separa es esa fecha (medido el 08/10/2026:
//     la 3.1 escribe 2026.08.20 y la 3.2, 2026.10.05; `COMPILACION_32`).
//
// El .xml guardado en la BD está EN MAYÚSCULAS (normalizeData): todo se busca
// sin distinguirlas. Puro y sin DOM: se puede comprobar desde Node.
// ============================================================================

import { versionXmlCee } from '../calculator/logic/xmlCeeV30.js';

/** Desde este día se certifica con CE3X 3.1 (los dos programas conviven antes). */
export const FECHA_CE3X_31 = '2026-10-01';

/** Y desde este, con la 3.2 (decisión del usuario: la 3.1 se desinstala). */
export const FECHA_CE3X_32 = '2026-10-08';

//: La <Version> (fecha de compilación) que escribe CE3X 3.2 en el XML; las
//: anteriores, del mismo esquema v3.0, son de la 3.1.
const COMPILACION_32 = '2026.10.05';

// Qué programa nombra el <Procedimiento>. Solo los que se ven en la práctica:
// uno que no esté aquí se enseña por el esquema, nunca se adivina el nombre.
const PROGRAMAS = [
    [/\bCE3X\b|\bCEX\s*V?\s*\d/i, 'CE3X'],
    [/HULC|LIDER|CALENER/i, 'HULC'],
    [/CERMA/i, 'CERMA'],
    [/\bCE2\b/i, 'CE2'],
    [/SG\s*SAVE/i, 'SG SAVE'],
];

const entre = (texto, tag) => {
    const m = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(texto || '');
    return m ? m[1] : null;
};

/**
 * @param {string} xmlTexto  el .xml crudo (`cee.xml_inicial` / `xml_final`)
 * @param {object} [opts]
 * @param {object} [opts.parsed]        el certificado ya leído (respaldo si no hay texto)
 * @param {string} [opts.fechaEmision]  fecha del certificado (ISO) — para avisar de una
 *                                      2.3 emitida cuando ya tocaba la 3.1
 * @returns {null | { etiqueta, programa, version, esquema, tono, titulo }}
 *   tono: 'actual' (CE3X 3.1) · 'anterior' (CE3X 2.3) · 'aviso' (2.3 emitida desde el
 *         01/10/2026) · 'otro' (otro programa o sin identificar)
 */
export function programaCee(xmlTexto, { parsed = null, fechaEmision = null } = {}) {
    const texto = typeof xmlTexto === 'string' ? xmlTexto : '';
    const esquema = versionXmlCee(texto) || (parsed?.version ? String(parsed.version) : null);
    if (!esquema) return null;
    const v3 = parseFloat(esquema) >= 3;

    // El <Procedimiento>: en el v2.0 es un texto suelto; en el v3.0, <Nombre> + <Version>.
    const proc = entre(texto, 'Procedimiento') || parsed?.identificacion?.procedimiento || '';
    const nombre = entre(proc, 'Nombre');
    const plano = (nombre ? `${nombre} ${entre(proc, 'Version') || ''}` : proc)
        .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    let programa = null;
    for (const [re, n] of PROGRAMAS) if (re.test(plano)) { programa = n; break; }

    // CE3X: «CEXv2.3» / «CE3X v2.3» dicen su versión; el v3.0 no (su <Version> es
    // una fecha), así que ahí manda el esquema. Una mayor de UN dígito: así una
    // fecha «2026.08.20» no se lee como la versión 2026.08.
    let version = null;
    if (programa === 'CE3X' || (!programa && v3)) {
        const m = /CE3?X\s*V?\s*(\d\.\d{1,2})(?![\d.])/i.exec(plano);
        const compilacion = (/(\d{4}\.\d{2}\.\d{2})/.exec(entre(proc, 'Version') || '') || [])[1] || '';
        version = m ? m[1] : (v3 ? (compilacion >= COMPILACION_32 ? '3.2' : '3.1') : null);
        if (!programa) programa = 'CE3X';
    }

    if (programa === 'CE3X' && version) {
        const fecha = String(fechaEmision || parsed?.fechaFirma || '').slice(0, 10);
        const conFecha = /^\d{4}-\d{2}-\d{2}$/.test(fecha);
        //: La vigente es la 3.2; un CEE de la 3.1 emitido antes del 08/10/2026
        //: también lo era cuando se emitió.
        const actual = parseFloat(version) >= 3.2
            || (parseFloat(version) >= 3 && !(conFecha && fecha >= FECHA_CE3X_32));
        const tarde = !actual && conFecha && fecha >= FECHA_CE3X_31;
        const vigente = fecha >= FECHA_CE3X_32 ? '3.2' : '3.1';
        return {
            etiqueta: `CE3X ${version}`,
            programa, version, esquema,
            tono: actual ? 'actual' : (tarde ? 'aviso' : 'anterior'),
            titulo: actual
                ? `Hecho con CE3X ${version} (esquema XML v${esquema}).`
                : tarde
                    ? `Hecho con CE3X ${version} y emitido el ${fecha.split('-').reverse().join('/')}: desde el ${vigente === '3.2' ? '08/10/2026' : '01/10/2026'} se certifica con CE3X ${vigente}.`
                    : `Hecho con CE3X ${version} (esquema XML v${esquema}).`,
        };
    }

    return {
        etiqueta: programa || `XML v${esquema}`,
        programa, version: null, esquema,
        tono: 'otro',
        titulo: programa
            ? `Hecho con ${programa}${plano ? ` (${plano})` : ''} · esquema XML v${esquema}.`
            : `El .xml no dice con qué programa se hizo · esquema v${esquema}.`,
    };
}
