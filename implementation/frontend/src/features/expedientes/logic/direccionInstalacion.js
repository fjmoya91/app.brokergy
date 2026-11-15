/**
 * ¿La dirección de la INSTALACIÓN es la del CLIENTE? — fuente única (2026-10-20).
 *
 * El botón «¿Misma dirección que el cliente?» de Instalación dice SÍ por defecto, y
 * hasta hoy, con SÍ, los documentos imprimían la dirección del CATASTRO guardada en
 * la oportunidad, no la del cliente: si se corregía la ficha del cliente, el
 * expediente no se enteraba y había que pulsar «No» y teclearla otra vez.
 *
 * REGLA — con SÍ manda la dirección del CLIENTE, en vivo. Se cambia en su ficha y
 * cambia en todos los documentos de sus expedientes. Solo si el cliente no tiene
 * dirección se cae a la de la instalación / el Catastro.
 *
 * REGLA — SÍ solo se pone cuando ES la misma vivienda. Un cliente que vive en otra
 * casa (26RES060_89: domicilio CL León Felipe 15, obra en AV Juan XXIII 19) nace en
 * «No» con la dirección del Catastro (`mismaVivienda`, en el alta del expediente), y
 * los que ya estaban en «Sí» siendo otra casa se pasaron a «No» conservando lo que
 * imprimían (scripts/direccion_instalacion_otra_casa.mjs).
 *
 * Módulo PURO (sin React ni axios): lo cargan el frontend y el backend por import().
 */

const limpio = (v) => (v === null || v === undefined ? '' : String(v).trim());

/** ¿El expediente declara que la instalación está en el domicilio del cliente? */
export function usaDireccionCliente(inst) {
    const v = inst?.misma_direccion;
    if (v === false) return false;
    const s = limpio(v).toUpperCase();
    return !(s === 'NO' || s === 'FALSE');
}

/**
 * Los campos del cliente como dirección de la instalación, o null si su ficha no
 * tiene calle (entonces no hay nada que «seguir»).
 */
export function direccionDelCliente(cli) {
    const calle = limpio(cli?.direccion);
    if (!calle) return null;
    return {
        calle,
        cp: limpio(cli.codigo_postal),
        municipio: limpio(cli.municipio),
        provincia: limpio(cli.provincia),
        ccaa: limpio(cli.ccaa),
    };
}

const sinTildes = (s) => limpio(s).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const TIPOS_VIA = new Set([
    'CL', 'C', 'CALLE', 'AV', 'AVD', 'AVDA', 'AVENIDA', 'PJ', 'PASAJE', 'PZ', 'PZA', 'PL', 'PLAZA',
    'ER', 'CR', 'CRTA', 'CTRA', 'CARRETERA', 'PS', 'PASEO', 'TR', 'TRAVESIA', 'UR', 'URB',
    'URBANIZACION', 'DS', 'DISEMINADO', 'PG', 'POLIGONO', 'CM', 'CAMINO', 'RD', 'RONDA', 'GV',
    'BO', 'BARRIO', 'PQ', 'PARQUE', 'GL', 'GLORIETA', 'CJ', 'CALLEJON',
]);
const VACIAS = new Set(['DE', 'DEL', 'LA', 'LAS', 'LOS', 'EL', 'Y']);
// Lo que el Catastro pega detrás de la calle (Es:1 Pl:04 Pt:0A) y no es nombre.
const CORTE = new Set(['ES', 'PL', 'PT', 'BL', 'N', 'NO', 'NUM', 'NUMERO', 'S', 'SN', 'KM']);

/** El NOMBRE de la calle, sin tipo de vía, número, notas ni piso: «CORBATAS». */
export function nombreDeCalle(direccion) {
    const s = sinTildes(direccion)
        .replace(/\([^)]*\)/g, ' ')      // notas: «(42 EN CATASTRO)», «(CINCO CASAS)»
        .split(',')[0]                    // lo de detrás de la coma es número/piso/CP
        .replace(/[^A-Z0-9]+/g, ' ')
        .trim();
    const fuera = [];
    for (const t of s.split(' ').filter(Boolean)) {
        if (/\d/.test(t)) break;
        if (fuera.length && CORTE.has(t)) break;
        if (!fuera.length && TIPOS_VIA.has(t)) continue;
        if (VACIAS.has(t)) continue;
        fuera.push(t);
    }
    return fuera.join(' ');
}

// «SOLANA (LA)», «LA SOLANA» y «La Solana» son el mismo municipio: fuera el
// artículo, esté delante o entre paréntesis detrás.
const nombreDeMunicipio = (m) => sinTildes(m)
    .replace(/[^A-Z]+/g, ' ')
    .split(' ')
    .filter(t => t && !VACIAS.has(t))
    .join('');

/**
 * ¿Son la MISMA vivienda? Compara el nombre de la calle (uno dentro del otro vale:
 * «CINCO C DON QUIJOTE» ⊃ «DON QUIJOTE») y, si las dos lo dicen, el municipio.
 * El NÚMERO no decide: en la ficha del cliente se escribe el número real y el
 * Catastro trae otro («CL CORBATAS 66 (42 EN CATASTRO)»).
 *
 * @returns {boolean|null} null = no se puede decir (falta una de las dos calles).
 * Ante la duda dice «distinta»: el error barato es dejar la del Catastro.
 */
export function mismaVivienda(a, b) {
    const ca = nombreDeCalle(a?.direccion);
    const cb = nombreDeCalle(b?.direccion);
    if (!ca || !cb) return null;
    const ma = nombreDeMunicipio(a?.municipio);
    const mb = nombreDeMunicipio(b?.municipio);
    if (ma && mb && ma !== mb) return false;
    const pa = ` ${ca} `, pb = ` ${cb} `;
    return pa.includes(pb) || pb.includes(pa);
}
