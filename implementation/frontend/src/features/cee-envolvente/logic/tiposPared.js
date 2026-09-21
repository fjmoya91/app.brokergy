/**
 * QUÉ es cada pared, y qué se puede hacer con ella.
 *
 * Vive fuera del hook —que importa React y por tanto no se puede cargar desde
 * Node— para que lo que decide el tipo de un cerramiento se pueda comprobar
 * con un test. `usePlanoEnvolvente` lo reexporta, así que quien ya lo importaba
 * de allí sigue igual.
 */

//: El motor emite el nombre LARGO del esquema CE3X
//: (`PARTICION_INTERIOR_VERTICAL`) y la app usa el corto: es el que está en
//: `TIPOS_PARED`, en el color del plano, en la chapa del panel y en lo que se
//: le manda de vuelta al reclasificar. Se traduce en UN solo sitio —por aquí
//: pasa el tipo de todos los muros de la pantalla— porque sin esto la pared
//: contra el garaje que se ha dejado fuera salía gris, sin chapa y sin poder
//: reclasificarse: ninguna comparación casaba.
const TIPO_DEL_MOTOR = { PARTICION_INTERIOR_VERTICAL: 'PARTICION_VERTICAL' };

/** El tipo con el que se va a escribir: manda el certificador sobre Catastro. */
export function tipoDe(m) {
    const t = m?.tipo_manual || m?.tipo;
    return TIPO_DEL_MOTOR[t] || t;
}

//: `fuera` es lo que el motor deja fuera de la envolvente; `excluida`, lo que
//: aparta el certificador. Las dos cosas significan «no va al .cex».
export function esFuera(m) { return !!(m?.fuera || m?.excluida); }

export function esMedianera(m) { return tipoDe(m) === 'MEDIANERA'; }

export function esParticion(m) { return tipoDe(m) === 'PARTICION_VERTICAL'; }

/**
 * ¿Puede esta pared llevar ventanas y puertas?
 *
 * Solo una FACHADA. Una medianera es adiabática —da contra otra vivienda a la
 * misma temperatura— y una partición da a un local sin calefactar: ninguna de
 * las dos lleva huecos, y de hecho un hueco apuntando a un cerramiento que no
 * es exterior deja el `.cex` sin poder escribirse.
 */
export function admiteHuecos(m) {
    return !!m && !esFuera(m) && tipoDe(m) === 'FACHADA';
}
