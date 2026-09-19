// pilaresFachada.js — cuántos pilares se PROPONEN en un paño de fachada.
//
// ⚠️ ESPEJO de `pilares_de()` en `cee-engine/tools/puentes.py`. Es el número
// que la pantalla enseña y el que el motor escribe en el `.cex`: si los dos se
// separan, el panel dice 3 y el certificado lleva 4, y eso no falla — solo
// miente. Lo vigila `tests/test_puentes.py`, que lee ESTE fichero.
//
// El número real lo cuenta quien tiene la fachada delante; esto solo evita
// arrancar en blanco. Por eso se puede corregir pared por pared, y un 0 los
// quita.

//: Cada cuántos metros hay un pilar cuando nadie los ha contado. Es la luz
//: habitual de una vivienda y la separación mediana de los 32 .cex del corpus
//: que llevan pilares integrados.
export const SEPARACION_PILARES_M = 3.5;

//: Menos de dos no tiene un paño: uno en cada extremo.
export const PILARES_MINIMO = 2;

export function pilaresEstimados(largo) {
    const L = Number(largo);
    if (!Number.isFinite(L) || L <= 0) return 0;
    return Math.max(PILARES_MINIMO, redondeoBancario(L / SEPARACION_PILARES_M));
}

//: Python redondea el 0,5 al PAR más cercano (`round(2.5) === 2`) y JavaScript
//: siempre hacia arriba. Sobre un largo de 8,75 m eso es un pilar de
//: diferencia entre lo que se ve y lo que se escribe.
function redondeoBancario(x) {
    const abajo = Math.floor(x);
    const resto = x - abajo;
    if (Math.abs(resto - 0.5) > 1e-9) return Math.round(x);
    return abajo % 2 === 0 ? abajo : abajo + 1;
}
