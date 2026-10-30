/**
 * QUÉ HA CAMBIADO al volver a medir (2026-10-29, lo pidió Fran: «que la
 * usabilidad sea la mejor posible»).
 *
 * Quitar un cuerpo, una zona o delimitar el adosado vuelve a medir el edificio,
 * y el motor recicla los nombres de las paredes (ver `identidadParedes.js`).
 * El trabajo ya seguía a cada pared por su trazado, pero en pantalla no se
 * decía nada: aparecían paredes nuevas, otras se llamaban distinto y unas
 * ventanas se quedaban sin pared, todo a la vez y en silencio. Esto lo resume
 * para RESALTARLO unos segundos en el plano y decirlo en una línea.
 *
 * Puro: sin React. ⚠️ Los imports llevan `.js` (Node lo exige; Vite no).
 *
 * @param {object} viejos     las paredes de antes, ya en el lienzo de hoy
 * @param {object} nuevo      las de ahora, por id
 * @param {object} traduce    `traduccionDeIds(...).traduce`: id de antes → id de hoy
 * @param {Array}  perdidos   ids de antes que ya no están
 * @returns {null|{ nuevas: string[], renombradas: {id, de, a}[], huecosSinPared: number }}
 *          `null` si no había nada antes (abrir la ventana no es «cambiar») o
 *          si no ha cambiado nada.
 */
export function cambiosAlMedir(viejos, nuevo, traduce = {}, perdidos = []) {
    const antes = Object.keys(viejos || {});
    if (!antes.length) return null;
    const sinSitio = new Set(perdidos);
    const destinos = new Set();
    const renombradas = [];
    for (const k of antes) {
        if (sinSitio.has(k)) continue;
        const t = traduce[k] || k;
        if (!nuevo[t]) continue;
        destinos.add(t);
        // Por el NOMBRE DE CATASTRO (el id), que es lo que recicla el motor: el
        // nombre puesto a mano lo conserva el trabajo, que va detrás.
        if (t !== k) renombradas.push({ id: t, de: k, a: t });
    }
    const nuevas = Object.keys(nuevo || {}).filter(id => !destinos.has(id))
        .sort((x, y) => String(x).localeCompare(String(y), 'es', { numeric: true }));
    const huecosSinPared = perdidos.reduce((s, k) => s + ((viejos[k]?.huecos || []).length), 0);
    if (!nuevas.length && !renombradas.length && !huecosSinPared) return null;
    return { nuevas, renombradas, huecosSinPared };
}

/** Las paredes que se resaltan: las nuevas y las que han cambiado de nombre. */
export function paredesResaltadas(cambios) {
    if (!cambios) return new Set();
    return new Set([...cambios.nuevas, ...cambios.renombradas.map(r => r.id)]);
}

/** Una línea en palabras, para el aviso de la ventana. */
export function textoCambios(cambios, max = 4) {
    if (!cambios) return '';
    const lista = (xs) => (xs.length > max ? `${xs.slice(0, max).join(', ')} y ${xs.length - max} más` : xs.join(', '));
    const partes = [];
    if (cambios.nuevas.length) {
        partes.push(`${cambios.nuevas.length === 1 ? 'una pared nueva' : `${cambios.nuevas.length} paredes nuevas`}`
                    + ` (${lista(cambios.nuevas)})`);
    }
    if (cambios.renombradas.length) {
        partes.push(lista(cambios.renombradas.map(r => `${r.de} ahora es ${r.a}`)));
    }
    if (cambios.huecosSinPared) {
        partes.push(cambios.huecosSinPared === 1 ? 'un hueco se ha quedado sin pared'
            : `${cambios.huecosSinPared} huecos se han quedado sin pared`);
    }
    return partes.join(' · ');
}
