/**
 * Dónde vive la documentación. Por defecto, la de la OPORTUNIDAD del CAE. Los CEE
 * directos pasan la suya (`API_DOCS_CEE_DIRECTO`): mismas rutas, otra base — así
 * el gestor es EL MISMO en los dos negocios, que es lo que se pidió, y no una
 * copia que acabe divergiendo. Lo que un negocio no tiene (el escaparate de
 * instaladores) se apaga con su bandera.
 */
export const API_DOCS_OPORTUNIDAD = {
    admin: '/api/oportunidades', public: '/api/public/reforma-docs', thumb: '/api/public/reforma-thumb', escaparate: true,
    // «Traer del WhatsApp» (rutas `/whatsapp-media/*`). Los CEE directos aún no
    // las tienen: sin la bandera, el botón no se pinta.
    whatsapp: true,
};
// La app del INSTALADOR (fase 2): las mismas rutas `reforma-docs` despachadas con
// SESIÓN (routes/instaladorApp.js). El navegador no recibe el upload_token sino una
// LLAVE para las miniaturas (`sesion`), y no se construye ninguna dirección de Drive
// (`sinDrive`, regla 1): los PDF se abren por `fichero`, también con la llave.
export const API_DOCS_INSTALADOR = {
    admin: null, public: '/api/instalador-app/docs', thumb: '/api/instalador-app/thumb', fichero: '/api/instalador-app/fichero',
    escaparate: false, whatsapp: false, sesion: true, sinDrive: true,
};
export const API_DOCS_CEE_DIRECTO = {
    admin: '/api/cee-directos', public: '/api/public/cee-directo-docs', thumb: '/api/public/cee-directo-thumb', escaparate: false,
    // Un CEE suelto no tiene obra: una sola fase, sin "antes" ni "después".
    unaFase: true,
};
