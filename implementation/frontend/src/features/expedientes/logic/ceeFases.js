// ============================================================================
// ceeFases.js — LAS DOS FASES DEL CEE de un expediente: cuál manda, cómo se
// vacía y qué hay que advertir antes de generar un documento.
// ----------------------------------------------------------------------------
// Un expediente tiene dos certificados (inicial y final) y de ellos salen las
// tres cifras que viajan al CIFO y a la ficha RES: demanda de calefacción,
// superficie útil y demanda de ACS. La regla es una sola y no cambia:
//
//     SI HAY CEE FINAL, MANDA EL FINAL; SI NO, EL INICIAL.
//
// Estaba escrita en cuatro sitios y en otros cuatro no estaba: las fichas
// RES060 y RES093 (y sus dos modales) leían `cee.cee_final` a secas, así que un
// expediente sin CEE final —lo normal hasta que la obra termina— imprimía
// D_CAL = 0,00 y D_ACS = 0,00 mientras el CIFO del MISMO expediente salía con
// los del inicial. Dos documentos del mismo expediente contradiciéndose.
//
// Módulo ESM PURO (sin React ni Node): lo importan los módulos del frontend y,
// por import() dinámico, los servicios del backend.
// ============================================================================

import { acsEnAlcance, acsComputaAhorro } from './aerotermiaUnits.js';

// Se re-exporta para que quien pregunte "¿hay que avisar del ACS?" no tenga que
// saber que la respuesta vive con los equipos. La función es UNA.
export { acsEnAlcance };

/** Margen con el que se comparan dos certificados. Por debajo son redondeos del
 *  `.cex`; es el mismo 2 % que aplica el resto de la app. */
export const CEE_TOL = 0.02;

const num = (v) => parseFloat(v) || 0;
const fmt = (v, dec = 2) => num(v).toLocaleString('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: dec });

/** ¿Hay certificado CARGADO en esta fase? Lo que lo prueba es que tenga demanda
 *  de calefacción: un objeto vacío o a medias no alimenta ningún documento. */
export function hayCee(cee, fase = 'final') {
    const obj = (cee || {})[fase === 'final' ? 'cee_final' : 'cee_inicial'];
    return !!obj && num(obj.demandaCalefaccion) > 0;
}

/**
 * El CEE que MANDA en los documentos: el final si está cargado, si no el inicial.
 * @returns {{ base:Object, fase:('final'|'inicial'|null), hayFinal:boolean, hayInicial:boolean, usaInicial:boolean }}
 */
export function ceeBaseDocumento(cee) {
    const c = cee || {};
    const hayFinal = hayCee(c, 'final');
    const hayInicial = hayCee(c, 'inicial');
    const base = hayFinal ? c.cee_final : (c.cee_inicial || c.cee_final || {});
    return {
        base: base || {},
        fase: hayFinal ? 'final' : (hayInicial ? 'inicial' : null),
        hayFinal,
        hayInicial,
        usaInicial: !hayFinal && hayInicial,
    };
}

// ─── Vaciar los datos leídos de una fase ─────────────────────────────────────
// Lo que siembra la lectura de un certificado (processXmlFile en CeeModule, o
// "Cargar CEE" por OCR) NO es solo el objeto parseado: son también el XML crudo
// y las dos fechas. Borrar el fichero del slot no tocaba nada de esto —el
// fichero vive en Drive y el dato en Supabase—, así que un CEE retirado seguía
// mandando en el CIFO, en la ficha y en la economía del expediente.
//
// A `null`, nunca con `delete`: el PUT funde `{ ...existing.cee, ...cee }` y una
// clave ausente conserva el valor viejo (mismo gotcha que `seguimiento`).

/** Claves de `cee` que escribe la lectura de un certificado de esta fase. */
export function camposLeidos(fase = 'final') {
    const suf = fase === 'final' ? 'final' : 'inicial';
    return [`cee_${suf}`, `xml_${suf}`, `fecha_visita_cee_${suf}`, `fecha_firma_cee_${suf}`];
}

/**
 * Patch de `cee` que deja la fase como si nunca se hubiera cargado un CEE.
 *
 * NO toca `emisiones_manual`, `superficie_manual_*` ni `dacs_manual`: eso lo
 * tecleó una persona y no lo puso ningún certificado. Tampoco los `comb_*`, que
 * tienen valor por defecto y se re-siembran con el certificado siguiente.
 */
export function patchVaciarCee(fase = 'final') {
    return camposLeidos(fase).reduce((acc, k) => ({ ...acc, [k]: null }), {});
}

/** Lo que se va a perder al vaciar, para poder enseñarlo antes de confirmar. */
export function resumenCee(cee, fase = 'final') {
    const obj = (cee || {})[fase === 'final' ? 'cee_final' : 'cee_inicial'] || {};
    return {
        demanda: num(obj.demandaCalefaccion),
        acs: num(obj.demandaACS),
        superficie: num(obj.superficieHabitable),
        fichero: obj._fileName || null,
    };
}

/** Texto de la confirmación de vaciado: dice QUÉ se borra, con sus cifras. */
export function textoVaciarCee(cee, fase = 'final') {
    const r = resumenCee(cee, fase);
    const cual = fase === 'final' ? 'CEE FINAL' : 'CEE INICIAL';
    const cifras = [
        r.demanda ? `demanda de calefacción ${fmt(r.demanda)} kWh/m²·año` : null,
        r.acs ? `demanda de ACS ${fmt(r.acs)} kWh/m²·año` : null,
        r.superficie ? `superficie ${fmt(r.superficie)} m²` : null,
    ].filter(Boolean).join(' · ');
    return `Se borran los datos leídos del ${cual}${cifras ? ` (${cifras})` : ''}, `
        + `el XML guardado y sus fechas de visita y firma.\n\n`
        + `A partir de ahora el expediente ${fase === 'final' ? 'volverá a calcularse con el CEE INICIAL' : 'se quedará sin datos de esta fase'}. `
        + `Los ficheros que sigan en Drive no se tocan.`;
}

// ─── Avisos previos a generar un documento ───────────────────────────────────

export const AVISO = {
    SIN_FINAL: 'sin_final',
    SIN_FINAL_ACS: 'sin_final_acs',
    SIN_FINAL_RES080: 'sin_final_res080',
    ACS_DIFIERE: 'acs_difiere',
    CAL_DIFIERE: 'cal_difiere',
    ACS_NO_APLICA: 'acs_no_aplica',
    ACS_SIN_EQUIPO: 'acs_sin_equipo',
};

/**
 * Qué hay que advertir antes de generar el CIFO, la ficha RES o el certificado
 * RES080 de este expediente.
 *
 * Nivel 'warn' = abre el aviso por sí solo. Nivel 'info' = solo acompaña: no
 * merece interrumpir a nadie, pero si el aviso ya se abre, se cuenta.
 *
 * @param {Object} expediente
 * @returns {Array<{ id:string, nivel:('warn'|'info'), texto:string }>}
 */
export function avisosCeeDocumento(expediente) {
    const exp = expediente || {};
    const cee = exp.cee || {};
    const inst = exp.instalacion || {};
    const ficha = String(exp.oportunidades?.ficha || '').toUpperCase()
        || String((String(exp.numero_expediente || '').match(/RES\d{3}|TER\d{3}/i) || [''])[0]).toUpperCase();
    const esRes080 = ficha === 'RES080' || !!cee.is_reforma;

    const { hayFinal, hayInicial } = ceeBaseDocumento(cee);
    const ini = cee.cee_inicial || {};
    const fin = cee.cee_final || {};
    const acs = acsEnAlcance(inst);
    // La D_ACS solo sale del certificado en modo 'xml'. En 'cte' (fórmula por
    // habitaciones) y en 'manual' (TER100) no depende de qué CEE mande, así que
    // avisar de una diferencia entre certificados sería avisar de algo que no
    // entra en el documento.
    const acsDelCee = (cee.acs_method || 'xml') === 'xml';
    const out = [];

    // Sin ningún certificado no hay nada que advertir: eso ya es un dato que
    // FALTA, y como tal lo lista la validación del documento.
    if (!hayFinal && !hayInicial) return out;

    if (!hayFinal) {
        out.push({
            id: AVISO.SIN_FINAL,
            nivel: 'warn',
            texto: `El CEE FINAL no está cargado: el documento se genera con los datos del CEE INICIAL `
                + `(demanda ${fmt(ini.demandaCalefaccion)} kWh/m²·año · ${fmt(ini.superficieHabitable)} m²).`,
        });
        if (acs && acsDelCee) {
            out.push({
                id: AVISO.SIN_FINAL_ACS,
                nivel: 'warn',
                texto: `La demanda de ACS sale también del CEE INICIAL (${fmt(ini.demandaACS)} kWh/m²·año). `
                    + `Es la cifra que SÍ cambia entre los dos certificados: revísala cuando se registre el final.`,
            });
        }
        if (esRes080) {
            out.push({
                id: AVISO.SIN_FINAL_RES080,
                nivel: 'warn',
                texto: `RES080: el ahorro se justifica comparando el CEE inicial con el final. Sin el CEE FINAL, `
                    + `el ahorro que imprima el documento no es el definitivo.`,
            });
        }
    } else if (hayInicial) {
        // Con los dos cargados manda el FINAL. Lo que se advierte es el descuadre.
        const dAcsIni = num(ini.demandaACS);
        const dAcsFin = num(fin.demandaACS);
        if (acs && acsDelCee && dAcsIni > 0 && Math.abs(dAcsFin - dAcsIni) > dAcsIni * CEE_TOL) {
            out.push({
                id: AVISO.ACS_DIFIERE,
                nivel: 'warn',
                texto: `La demanda de ACS del CEE FINAL (${fmt(dAcsFin)}) no coincide con la del INICIAL `
                    + `(${fmt(dAcsIni)} kWh/m²·año). Se usa la del FINAL, que es lo correcto; compruébalo antes de firmar.`,
            });
        }
        const dCalIni = num(ini.demandaCalefaccion);
        const dCalFin = num(fin.demandaCalefaccion);
        if (!esRes080 && dCalIni > 0 && Math.abs(dCalFin - dCalIni) > dCalIni * CEE_TOL) {
            out.push({
                id: AVISO.CAL_DIFIERE,
                nivel: 'warn',
                texto: `La demanda de CALEFACCIÓN del CEE FINAL (${fmt(dCalFin)}) no coincide con la del INICIAL `
                    + `(${fmt(dCalIni)} kWh/m²·año). En esta ficha la actuación no toca la envolvente: debería ser la misma.`,
            });
        }
    }

    // El ACS está DENTRO del alcance (el documento imprime su D_ACS y su SCOP_dhw)
    // pero NO computa en el ahorro, porque no hay equipo de ACS identificado: ni la
    // misma bomba de calor de la calefacción, ni un modelo del catálogo, ni un
    // acumulador con SCOP. Son dos preguntas distintas (`acsEnAlcance` decide si el
    // apartado existe; `acsComputaAhorro`, si suma), y en este estado intermedio el
    // certificado enseña una demanda de ACS que el AE que imprime no incluye.
    if (acs && !acsComputaAhorro(inst)) {
        out.push({
            id: AVISO.ACS_SIN_EQUIPO,
            nivel: 'warn',
            texto: `El ACS consta dentro del alcance —el documento imprimirá su D_ACS y su SCOP_dhw— pero NO está `
                + `computando en el ahorro: falta identificar el equipo en Instalación (la misma bomba de calor, `
                + `o un modelo del catálogo). Si el ACS no entra en la actuación, márcalo allí como que no aplica.`,
        });
    }

    // Nota, no aviso: es el comportamiento correcto y el documento ya lo imprime.
    if (!acs) {
        out.push({
            id: AVISO.ACS_NO_APLICA,
            nivel: 'info',
            texto: `El ACS queda fuera del alcance de la actuación: D_ACS y SCOP_dhw salen impresos como "no aplica".`,
        });
    }

    return out;
}

/** ¿Hay algo que merezca interrumpir antes de generar? */
export function hayAvisosBloqueantes(avisos) {
    return (avisos || []).some(a => a.nivel === 'warn');
}
