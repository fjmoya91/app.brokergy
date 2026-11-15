// ─── marca.js — el nombre y la marca de la app de certificadores ─────────────
// El nombre comercial es «CEE by BROKERGY» (Fran, 24/10/2026); el backend lo lee de CERTAPP_NOMBRE_APP.
// Todo lo que lo enseña lee de aquí: cambiarlo es tocar una línea.
// (El <title> y el manifest de certificadores.html lo llevan escrito
// a mano porque se sirven antes de que cargue el JS: cambiarlos a la vez.)
// ─────────────────────────────────────────────────────────────────────────────

/** Nombre de la app. */
export const NOMBRE_APP = 'CEE by BROKERGY';

/** Lo que es, en una línea (cabeceras, título de la pestaña). */
export const LEMA = 'Tu certificado de eficiencia energética, preparado por IA';

/** Dominio público (enlaces que se comparten: /beta, el del propietario). */
export const DOMINIO = 'cee.brokergy.es';

/** Logo: el rectangular oscuro sobre el papel crema; el blanco, sobre los paneles tinta de la landing. */
export const LOGO = '/logo_brokergy_dark.png';
export const LOGO_CLARO = '/logo_brokergy_white.png';

/** Contacto para dudas y para ejercer los derechos de protección de datos. */
export const EMAIL_CONTACTO = 'info@brokergy.es';

/** El pie de la web: «Powered by BROKERGY», con enlace a la web de la empresa. Hasta el 06/11/2026
 *  firmaba Fran (nombre, cargo y nº de colegiado); lo quitó él: «que no aparezca mi nombre». */
export const WEB_BROKERGY = 'https://brokergy.es';

/** Título de la pestaña: «Pantalla · CEE by BROKERGY». */
export function tituloPestana(pantalla) {
    return pantalla ? `${pantalla} · ${NOMBRE_APP}` : `${NOMBRE_APP} · ${LEMA}`;
}
