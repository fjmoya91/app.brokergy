// El TITULAR PROVISIONAL: cuando el alta llega del chat de un instalador sin el
// nombre del cliente, la ficha nace con la DIRECCIÓN como nombre («CL GOYA 15 -
// MOTILLA DEL PALANCAR»). Con eso no se saluda («¡Hola *Cl*!», 26RES060_313,
// 25/11/2026) y con eso no se pueden generar los anexos: hay que pedirle al
// cliente su nombre tal como aparece en el DNI.

// Tipos de vía del Catastro y sus abreviaturas, al principio y seguidos de espacio.
const PREFIJO_VIA = /^(?:cl|c\/|calle|av|avd|avda|avenida|pz|pza|plaza|ctra|cr|carretera|cm|camino|ps|pso|paseo|tr|trva|traves[ií]a|pol|pg|pol[ií]gono|urb|ur|urbanizaci[oó]n|ds|diseminado|lg|lugar|paraje|pj|pasaje|gta|glorieta|bo|barrio|rd|ronda)\.?(?:\s|\/)/i;

/** ¿El «nombre» de la ficha es en realidad una dirección? */
function pareceDireccion(nombre) {
    const v = String(nombre || '').trim();
    if (!v) return false;
    if (PREFIJO_VIA.test(v)) return true;
    // «GOYA 15 - MOTILLA DEL PALANCAR»: número de portal y « - » con el municipio.
    return /\d/.test(v) && /\s[-–]\s/.test(v);
}

/**
 * Lo que le falta a la ficha del titular para formalizar el expediente (los anexos
 * van con su nombre y su DNI). Lo que ya está no se pide.
 * @param {{nombre_razon_social?, apellidos?, dni?, es_empresa?}} cli
 * @param {string} [referencia]  `oportunidades.referencia_cliente` (en un alta sin titular, la dirección)
 * @returns {string[]}  frases para el agente
 */
function faltaDelTitular(cli, referencia = '') {
    if (!cli) return ['no hay ficha de cliente'];
    const nombre = String(cli.nombre_razon_social || '').trim();
    const ref = String(referencia || '').trim().toUpperCase();
    const falta = [];
    if (!nombre || pareceDireccion(nombre) || (ref && nombre.toUpperCase() === ref && pareceDireccion(ref))) {
        falta.push(`el NOMBRE: la ficha tiene «${nombre || 'nada'}», que es la dirección (alta sin titular): pídele su nombre y apellidos como en el DNI`);
    } else if (!cli.es_empresa && !String(cli.apellidos || '').trim()) {
        falta.push('los APELLIDOS del titular');
    }
    if (!String(cli.dni || '').trim()) falta.push(`el ${cli.es_empresa ? 'CIF' : 'DNI'} del titular`);
    return falta;
}

module.exports = { pareceDireccion, faltaDelTitular };
