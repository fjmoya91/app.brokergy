/**
 * avisoCeeInicial — el aviso de que el CEE Inicial lo presenta BROKERGY, y de
 * que la obra NO se puede facturar hasta que llega un mensaje NUEVO
 * confirmándolo.
 *
 * FUENTE ÚNICA: antes vivía enterrado, con matices distintos según el caso,
 * dentro de la propia frase de "aceptar la propuesta" en las quince ramas de
 * ProposalModal.jsx — fácil de leer por encima y perder, que es como acaba
 * gente empezando la obra o aceptando facturas antes de que el CEE Inicial
 * esté presentado. Con una copia sola, se retoca aquí y llega igual a las
 * quince (y al email, que reutiliza el mismo texto).
 *
 * REGLA — deja claro DE QUIÉN es cada tarea. Presentar el CEE es cosa
 * nuestra; decir solo "no factures hasta que el CEE esté presentado" suena a
 * que el cliente tiene que gestionarlo él. Lo que tiene que hacer es aceptar,
 * darnos sus datos y mandarnos la documentación — con eso ya nos encargamos
 * nosotros de todo lo demás.
 *
 * REGLA — no se factura hasta que llega un mensaje NUEVO confirmándolo, no
 * "cuando el cliente calcule que ya está". Dejar la fecha en sus manos es
 * pedirle que adivine en qué punto va un trámite que no puede ver; el aviso
 * lo mandamos nosotros en cuanto el CEE Inicial queda presentado, y hasta
 * entonces la obra no se factura.
 */

/**
 * @param {boolean} tuteo  true = cliente (tú); false = partner/instalador
 *                         (vosotros, hablando en tercera persona del cliente).
 */
export function lineaAvisoCeeInicial({ tuteo = true } = {}) {
    if (tuteo) {
        return '⚠️ *De presentar el Certificado de Eficiencia Energética (CEE) nos encargamos nosotros*, pero solo podemos hacerlo con tu aceptación, tus datos y la documentación que te pediremos ya en nuestras manos. Hasta que no te enviemos un *nuevo mensaje confirmándotelo*, _no dejes que te presenten ninguna factura de la obra_ — es la condición para no perder la ayuda.\n\nSi pasan unos días sin noticias nuestras, o si tenéis prisa por facturar, escríbenos sin problema: hablando se entiende la gente, y preferimos que nos preguntes a que se cuele una factura antes de tiempo.';
    }
    return '⚠️ *De presentar el Certificado de Eficiencia Energética (CEE) nos encargamos nosotros*, pero solo podemos hacerlo con la aceptación, los datos y la documentación del cliente ya en nuestras manos. Hasta que no os enviemos un *nuevo mensaje confirmándolo*, que no le presentéis ninguna factura de la obra — es la condición para no perder la ayuda.\n\nSi pasan unos días sin noticias nuestras, o si tenéis prisa por facturar, escribidnos sin problema: hablando se entiende la gente, y preferimos que nos preguntéis a que se cuele una factura antes de tiempo.';
}
