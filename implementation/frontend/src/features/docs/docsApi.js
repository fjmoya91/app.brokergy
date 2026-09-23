/**
 * Dónde vive la documentación. Por defecto, la de la OPORTUNIDAD del CAE. Los CEE
 * directos pasan la suya (`API_DOCS_CEE_DIRECTO`): mismas rutas, otra base — así
 * el gestor es EL MISMO en los dos negocios, que es lo que se pidió, y no una
 * copia que acabe divergiendo. Lo que un negocio no tiene (el escaparate de
 * instaladores) se apaga con su bandera.
 */
export const API_DOCS_OPORTUNIDAD = {
    admin: '/api/oportunidades', public: '/api/public/reforma-docs', thumb: '/api/public/reforma-thumb', escaparate: true,
};
export const API_DOCS_CEE_DIRECTO = {
    admin: '/api/cee-directos', public: '/api/public/cee-directo-docs', thumb: '/api/public/cee-directo-thumb', escaparate: false,
    // Un CEE suelto no tiene obra: una sola fase, sin "antes" ni "después".
    unaFase: true,
};
