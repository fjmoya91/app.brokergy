// ============================================================================
// quienMira.js — QUIÉN tiene delante la ventana de la envolvente, y qué le toca ver.
//
// Los flags de rol de siempre (`getRoleFlags`: ADMIN, TRABAJADOR, CERTIFICADOR)
// más uno que el CRM no tiene: el CERTIFICADOR EXTERNO de la app de
// certificadores (cee.brokergy.es, origen `ext`). No es un `usuarios` ni un
// CERTIFICADOR de BROKERGY —esos son nuestros técnicos—, así que NO puede salir
// como ninguno de los tres: `EnvolventeCertapp` le da a `useAuth()` un usuario
// con `es_certificador_externo` y un rol que `getRoleFlags` no reconoce.
//
// REGLA — al certificador externo no se le enseña NADA interno de BROKERGY: ni la
// carpeta local, ni el enlace al expediente o al encargo, ni la oportunidad, ni
// el rastro del Agente IA o de Claude, ni corregir al titular o al técnico (son
// la ficha de su obra y su perfil, en la app), ni lo que pide una ruta interna
// (PVGIS). Sí el plano, los cerramientos, los huecos, las fotos, las
// instalaciones y generar el `.cex`.
//
// REGLA — en `origen=ext`, quien no es del equipo interno ES externo, lleve o no
// la marca: si un día el usuario compatible llegara sin ella, la ventana no
// puede caer en enseñar lo interno. Un ADMIN de BROKERGY entra como staff.
// ============================================================================

import { getRoleFlags } from '../../../utils/roleFlags';
import { esExt } from './apiEnvolvente';

/**
 * @param {object|null} user  lo que da `useAuth().user`
 * @returns {ReturnType<typeof getRoleFlags> & {
 *   esCertificadorExterno: boolean, veInterno: boolean }}
 */
export function quienMira(user) {
    const flags = getRoleFlags(user);
    const esCertificadorExterno = !flags.isStaff
        && (user?.es_certificador_externo === true || esExt);
    return {
        ...flags,
        esCertificadorExterno,
        //: Lo INTERNO de BROKERGY (carpeta local, Agente IA, Claude, PVGIS…):
        //: solo el equipo, y nunca quien entra como certificador externo.
        veInterno: flags.isStaff && !esCertificadorExterno,
    };
}

export default quienMira;
