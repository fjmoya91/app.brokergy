// ─── marca.js — el nombre y la marca de la app RITE (rite.brokergy.es) ──────
// Regla 245. Mismo patrón que la app de certificadores («CEE by BROKERGY»).
// El <title> de rite.html va escrito a mano: cambiarlo a la vez.
// ─────────────────────────────────────────────────────────────────────────────
export const NOMBRE_APP = 'RITE by BROKERGY';
export const LEMA = 'La memoria técnica RITE de tu instalación, en minutos';
export const DOMINIO = 'rite.brokergy.es';
export const LOGO = '/logo_brokergy_dark.png';
export const EMAIL_CONTACTO = 'info@brokergy.es';
export const WEB_BROKERGY = 'https://brokergy.es';

/** Provincias donde vale la memoria (plantilla oficial de la JCCM). Espejo de PROVINCIAS_CLM del backend. */
export const PROVINCIAS_CLM = ['ALBACETE', 'CIUDAD REAL', 'CUENCA', 'GUADALAJARA', 'TOLEDO'];

export function tituloPestana(pantalla) {
    return pantalla ? `${pantalla} · ${NOMBRE_APP}` : `${NOMBRE_APP} · ${LEMA}`;
}
