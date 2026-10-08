// ─────────────────────────────────────────────────────────────────────────────
// Las dos URL de un inmueble: su ficha en el Catastro y dónde está.
//
// Van aparte del componente porque son PURAS —se prueban con un `node -e`— y
// porque lo que no puede divergir es justo esto: todos los iconos del Catastro
// de la app tienen que llevar al MISMO sitio.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * La ficha del inmueble en la Sede Electrónica del Catastro.
 *
 * Pasa por `/api/catastro/sede/:rc`, que redirige a la ficha DIRECTA
 * (`OVCConCiud.aspx` con su delegación, su municipio y la referencia de 20) o, si
 * es una parcela con varios inmuebles, a su lista. El enlace de antes, el atajo
 * `OVCListaBienes.aspx?rc1=&rc2=`, lo resuelve la propia Sede y su respuesta
 * depende del navegador: en el de Fran contestaba "No hay inmuebles en la
 * ubicación seleccionada" y en uno limpio abría la ficha (07/10/2026,
 * 7847709VJ9374N0001DD). Los códigos no se guardan en la app: los pone el backend
 * con una consulta al Catastro, cacheada. Es el MISMO enlace que el «Ver en
 * Catastro» de la página del encargo del técnico (`comoLlegar`).
 */
export function enlaceSedeCatastro(rc) {
    const limpia = String(rc || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    // Una referencia tiene 14 (la parcela) o 20 caracteres; lo que no cabe ahí
    // no es una referencia, y la ruta lo rechazaría: mejor sin botón.
    if (limpia.length < 14 || limpia.length > 20) return null;
    return `/api/catastro/sede/${limpia}`;
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
