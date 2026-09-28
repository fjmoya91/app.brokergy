/**
 * Lo que NO es vivienda dentro de UNA planta (el garaje de la planta baja de
 * una casa de dos plantas). Ver `components/PanelZonas.jsx` y
 * `pipeline.leer_zonas` en el motor.
 *
 * Vive aparte del componente para que el plano, la ventana y el panel lo lean
 * de un solo sitio (y porque un `.jsx` que exporta constantes rompe el
 * refresco en caliente).
 */

//: Lo que puede ser una zona. Solo pone NOMBRE: en CE3X las tres se escriben
//: igual. Los valores son los que acepta el motor (`pipeline.USOS_ZONA`) y el
//: backend (`USOS_ZONA` en `routes/ceeEnvolvente.js`).
export const USOS_ZONA = ['GARAJE', 'ALMACEN', 'ESPACIO NO HABITABLE'];

export const ETIQUETA_USO_ZONA = {
    GARAJE: 'Garaje', ALMACEN: 'Almacén', 'ESPACIO NO HABITABLE': 'Otro no habitable',
};
