/**
 * Un CUERPO del edificio, PLANTA A PLANTA.
 *
 * POR QUÉ EXISTE: Catastro dibuja el edificio en partes y un garaje adosado
 * con vivienda encima es UNA parte de DOS plantas — el prisma entero—, pero
 * solo declara APARCAMIENTO en la baja. Arriba ese mismo cuerpo es la casa.
 *
 * Dejarlo fuera «entero» le quitaba a la planta primera su superficie y sus
 * fachadas reales a la calle (medido en 2370310VJ4027S: 19 m² y dos fachadas),
 * y pintarlo ahí como «NO CUENTA» es lo que llevó a apartar a mano una fachada
 * de verdad. El motor ya lo resuelve por nivel y manda `niveles_fuera`; esto
 * es lo mismo dicho para la pantalla.
 *
 * Vive FUERA del `.jsx` porque lo leen dos superficies —el plano y los textos
 * del popup— y porque así se puede comprobar desde Node
 * (`scripts/test_cuerpo_por_planta.mjs`).
 */

/** ¿Este cuerpo sobra en ESTE nivel? Sin `niveles_fuera`, sobra en todos. */
export function sobraEn(cuerpo, nivel) {
    const ns = cuerpo?.niveles_fuera;
    return !Array.isArray(ns) || ns.includes(nivel);
}

/**
 * Los cuerpos de una planta, con lo que hay que pintar YA RESUELTO.
 *
 * `fueraAqui` es «el certificador lo ha sacado Y aquí es donde sobra», y
 * `sospechosoAqui`, «Catastro dice que aquí no se vive y todavía cuenta». Las
 * dos son de ESTA planta: el mismo cuerpo puede sobrar abajo y ser la vivienda
 * arriba, y con la marca global se pintaba igual en las dos.
 */
export function cuerposDeLaPlanta(cuerpos, nivel) {
    return (cuerpos || [])
        .filter(c => !Array.isArray(c.niveles) || c.niveles.includes(nivel))
        .map((c) => {
            const sobra = sobraEn(c, nivel);
            return {
                ...c,
                fueraAqui: !!c.fuera && sobra,
                sospechosoAqui: c.habitable === false && sobra && !c.fuera,
            };
        });
}

/**
 * Cómo se llama una planta cuando hay que decirla dentro de una frase.
 *
 * El motor dice lo mismo en su diagnóstico (`_nombre_nivel` en `pipeline.py`):
 * si aquí se dijera de otra forma, la pantalla y el `.cex` contarían lo mismo
 * con dos nombres.
 */
export function nombreDeNivel(n) {
    if (n === 0) return 'la planta baja';
    return n < 0 ? `el sótano ${Math.abs(n)}` : `la planta ${n}`;
}

/**
 * EN QUÉ PLANTAS sobra este cuerpo, dicho para leerlo. Vacío si sobra en
 * todas las que ocupa: ahí no hay nada que matizar.
 *
 * Es la mitad de la explicación. Decir solo «se quita» hacía pensar que el
 * cuerpo se iba entero, que es lo que llevó a apartar a mano una fachada de la
 * planta de arriba.
 */
export function dondeSobra(c) {
    const ns = c?.niveles_fuera;
    if (!Array.isArray(ns) || !ns.length) return '';
    if (!Array.isArray(c.niveles) || ns.length >= c.niveles.length) return '';
    return ns.map(nombreDeNivel).join(' y ');
}

/** Y en cuáles SIGUE contando como vivienda. */
export function dondeSigue(c) {
    const ns = c?.niveles_fuera;
    if (!Array.isArray(ns) || !Array.isArray(c.niveles)) return '';
    return c.niveles.filter(n => !ns.includes(n)).map(nombreDeNivel).join(' y ');
}
