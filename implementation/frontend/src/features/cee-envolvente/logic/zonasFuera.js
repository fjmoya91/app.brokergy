/**
 * Lo que NO es vivienda dentro de UNA planta (el garaje de la planta baja de
 * una casa de dos plantas). Ver `components/PanelZonas.jsx` y
 * `pipeline.leer_zonas` en el motor.
 *
 * Vive aparte del componente para que el plano, la ventana y el panel lo lean
 * de un solo sitio (y porque un `.jsx` que exporta constantes rompe el
 * refresco en caliente).
 */

//: Lo que puede ser una zona. Los tres primeros solo ponen NOMBRE: en CE3X se
//: escriben igual (la pared contra ellos, partición vertical; el forjado de
//: encima, suelo sobre espacio no habitable). El PORCHE ABIERTO es otra cosa:
//: es EXTERIOR —la pared detrás de él sale fachada y el forjado de encima,
//: suelo en contacto con el aire— (26RES060_OP246). Los valores son los que
//: acepta el motor (`pipeline.USOS_ZONA`) y el backend (`USOS_ZONA` en
//: `routes/ceeEnvolvente.js`).
export const USOS_ZONA = ['GARAJE', 'ALMACEN', 'ESPACIO NO HABITABLE', 'PORCHE'];

export const ETIQUETA_USO_ZONA = {
    GARAJE: 'Garaje', ALMACEN: 'Almacén', 'ESPACIO NO HABITABLE': 'Otro no habitable',
    PORCHE: 'Porche abierto',
};

//: El color de cada uso en el CROQUIS a mano alzada: el mismo en la mancha del
//: plano y en su botón, para que se vea con qué se está pintando.
export const COLOR_CROQUIS = {
    GARAJE: '#a855f7', PORCHE: '#22c55e', ALMACEN: '#f59e0b', 'ESPACIO NO HABITABLE': '#94a3b8',
};

/**
 * Lo que declara Catastro en una planta, dicho para leerlo de un vistazo:
 * «Aparcamiento 122 m² · Porche 36 m²». Sin el coeficiente de cómputo que
 * Catastro pega al uso («PORCHE 100%»): se leía como una cifra más y partía la
 * línea. m² sin decimales: el croquis los AJUSTA, no los mide.
 */
export function textoCatastro(lista = []) {
    return (lista || []).map((c) => {
        const u = String(c?.uso || '').replace(/\s*\d+(?:[.,]\d+)?\s*%\s*$/, '').trim().toLowerCase();
        return `${u.charAt(0).toUpperCase()}${u.slice(1)} ${Math.round(Number(c?.superficie) || 0)} m²`;
    }).join(' · ');
}

/** El uso de una línea del resultado («Garaje 121 m²…»), para pintarla con su color. */
export function usoDeLinea(linea) {
    const l = String(linea || '').toLowerCase();
    return Object.keys(ETIQUETA_USO_ZONA).find(u => l.startsWith(ETIQUETA_USO_ZONA[u].toLowerCase())) || null;
}
