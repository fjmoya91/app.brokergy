// ─────────────────────────────────────────────────────────────────────────────
// Las dos URL de un inmueble: su ficha en el Catastro y dónde está.
//
// Van aparte del componente porque son PURAS —se prueban con un `node -e`— y
// porque lo que no puede divergir es justo esto: la URL de la Sede parte la
// referencia en dos trozos de 7 caracteres, y una partida distinta NO da error,
// abre la ficha de OTRO inmueble.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * La ficha del inmueble en la Sede Electrónica del Catastro.
 *
 * `rc1` y `rc2` son los dos primeros bloques de 7 de la referencia (la parcela)
 * y `RCCompleta` la de 20 (el inmueble). Los tres: con solo la parcela, la Sede
 * abre el listado del edificio y hay que buscar el piso a mano.
 */
export function enlaceSedeCatastro(rc) {
    const limpia = String(rc || '').trim().toUpperCase().replace(/\s/g, '');
    if (limpia.length < 14) return null;
    return 'https://www1.sedecatastro.gob.es/CYCBienInmueble/OVCListaBienes.aspx'
         + `?rc1=${limpia.substring(0, 7)}&rc2=${limpia.substring(7, 14)}`
         + `&RCCompleta=${limpia}`;
}

/** Dónde está, en Google Maps. Por DIRECCIÓN y no por coordenadas: es lo que
 *  se lee en la calle al llegar a una visita. */
export function enlaceMaps(direccion) {
    const texto = String(direccion || '').trim();
    if (!texto) return null;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(texto)}`;
}

/**
 * Lo que hace falta para los dos enlaces de un CLIENTE.
 *
 * La referencia catastral no es del cliente sino de lo que se le tramita: se
 * toma la de su oportunidad más reciente y, si no tiene, la de su CEE directo
 * más reciente (las listas ya llegan ordenadas así del backend). La dirección,
 * la de su ficha: es la que se enseña al lado del botón.
 */
export function inmuebleDeCliente(cliente, { oportunidades, ceeDirectos } = {}) {
    if (!cliente) return { rc: null, direccion: null };
    const ops = oportunidades ?? cliente.oportunidades ?? cliente.oportunidades_vinculadas ?? [];
    const cees = ceeDirectos ?? cliente.cee_directos ?? cliente.cee_directos_vinculados ?? [];
    const rc = [...ops, ...cees].map(x => x?.ref_catastral).find(r => String(r || '').trim().length >= 14) || null;
    const localidad = [cliente.codigo_postal, cliente.municipio].filter(Boolean).join(' ');
    const direccion = [cliente.direccion, localidad, cliente.provincia].filter(Boolean).join(', ') || null;
    return { rc, direccion };
}

export default { enlaceSedeCatastro, enlaceMaps, inmuebleDeCliente };
