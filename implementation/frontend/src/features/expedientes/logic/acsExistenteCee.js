// ============================================================
// acsExistenteCee.js — qué produce el ACS ANTES de la obra, según el CEE INICIAL
// (CAE-1991, 10/11/2026).
//
// En 26RES060_168 el CEE inicial declaraba el ACS con un termo eléctrico (efecto
// Joule) y la app calculaba ese ACS con la η de la caldera de gasóleo: el CIFO decía
// 30.771 kWh/año en vez de 30.190 y Marwen lo levantó (inexactitud nº 3). Desde
// entonces el ACS lleva su propio rendimiento (`etaAcsExistente` en calculation.js),
// pero alguien tiene que DECLARAR el termo en Instalación. Esto lo PROPONE al ver el
// CEE, nunca lo escribe solo: de ese dato cuelga el ahorro firmado.
//
// De dónde se lee, por orden:
//   1. los generadores del `.xml` crudo (`<InstalacionesACS>` en v2.0, los de servicio
//      ACS en v3.0), si el detalle trae el texto;
//   2. si no, lo que el parser guardó: `combustibleACS` + `rendimientoACS` (en %).
// Un termo de efecto Joule es: generador eléctrico con rendimiento 1 (100 %), o
// rotulado «Efecto Joule». Dos sistemas de ACS distintos (termo y caldera) no se
// resuelven aquí: se AVISA, porque cuál pesa más lo dice el certificado, no la app.
// ============================================================
import { leerGeneradoresDeTexto, esVectorElectrico } from '../../calculator/logic/coberturaGeneradores.js';

const esJoule = (g) => /joule/i.test(`${g.tipo || ''} ${g.nombre || ''}`)
    || (esVectorElectrico(g.vector) && g.eta != null && Math.abs(g.eta - 1) < 0.015);

/**
 * @param ceeInicial  `cee.cee_inicial` (lo que guardó el parser)
 * @param xmlTexto    `cee.xml_inicial` (texto crudo), si se tiene
 * @returns {{ termo: boolean, dosSistemas: boolean, fuente: 'xml'|'cee'|null, detalle: string }}
 */
export function acsExistenteDelCee(ceeInicial, xmlTexto) {
    const nada = { termo: false, dosSistemas: false, fuente: null, detalle: '' };
    let gens = [];
    try { gens = leerGeneradoresDeTexto(xmlTexto).filter(g => g.servicios.includes('acs') && !g.ficticio); } catch { gens = []; }
    if (gens.length) {
        const joule = gens.filter(esJoule);
        const otros = gens.filter(g => !esJoule(g));
        const detalle = gens.map(g => `${g.nombre || g.tipo || 'Generador'}${g.eta ? ` (${Math.round(g.eta * 100)} %)` : ''}`).join(' + ');
        return {
            termo: joule.length > 0 && otros.length === 0,
            dosSistemas: joule.length > 0 && otros.length > 0,
            fuente: 'xml',
            detalle,
        };
    }
    if (!ceeInicial) return nada;
    const comb = String(ceeInicial.combustibleACS || '');
    const rend = Number(ceeInicial.rendimientoACS);
    if (!comb) return nada;
    const termo = /^ELECTRICIDAD/i.test(comb.trim()) && Number.isFinite(rend) && Math.abs(rend - 100) < 1.5;
    return { termo, dosSistemas: false, fuente: 'cee', detalle: `${comb}${Number.isFinite(rend) ? ` · ${rend} %` : ''}` };
}

/** Lo que se escribe en Instalación al aceptar la propuesta. */
export const ACS_TERMO_ELECTRICO = { rendimiento_id: 'electric', tipo_equipo: 'TERMO ELÉCTRICO' };

/**
 * ¿Hay que proponer el termo? Solo si el CEE inicial lo dice, el ACS entra en la
 * actuación y en Instalación aún no está declarado así.
 */
export function proponerTermoAcs(inst, info) {
    if (!info?.termo || !inst?.cambio_acs) return false;
    return !(inst.misma_caldera_acs === false && inst.caldera_antigua_acs?.rendimiento_id === 'electric');
}
