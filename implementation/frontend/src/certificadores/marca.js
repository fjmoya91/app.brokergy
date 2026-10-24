// ─── marca.js — el nombre y la marca de la app de certificadores ─────────────
// El nombre comercial está POR DECIDIR (docs/conocimiento/certificadores-app/).
// Mientras tanto, todo lo que lo enseña lee de aquí: cambiarlo es tocar una línea.
// (El <title> y el manifest de certificadores.html llevan el provisional escrito
// a mano porque se sirven antes de que cargue el JS: cambiarlos a la vez.)
// ─────────────────────────────────────────────────────────────────────────────

/** Nombre de la app (provisional). */
export const NOMBRE_APP = 'BROKERGY CEE';

/** Lo que es, en una línea (cabeceras, título de la pestaña). */
export const LEMA = 'El CEE inicial preparado por IA';

/** Dominio público (enlaces que se comparten: /beta, el del propietario). */
export const DOMINIO = 'cee.brokergy.es';

/** Logo: el rectangular oscuro sobre el papel crema. */
export const LOGO = '/logo_brokergy_dark.png';
export const SELLO = '/logo-brokergy-circular.png';

/** Contacto para dudas y para ejercer los derechos de protección de datos. */
export const EMAIL_CONTACTO = 'info@brokergy.es';

/** Quien firma lo que ve el cliente (estilo «carta de pago»: firma de persona). */
export const FIRMA = {
    nombre: 'Fran Moya',
    cargo: 'CEO de BROKERGY · Ingeniero colegiado nº 1779 COGITI',
};

/** Título de la pestaña: «Pantalla · BROKERGY CEE». */
export function tituloPestana(pantalla) {
    return pantalla ? `${pantalla} · ${NOMBRE_APP}` : `${NOMBRE_APP} · ${LEMA}`;
}
