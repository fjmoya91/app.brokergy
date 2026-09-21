/**
 * El trabajo sigue a la PARED, no a su nombre.
 *
 * POR QUÉ EXISTE: el nombre de un cerramiento (`FBS1`, `FBS2`…) lo numera el
 * motor por el ORDEN en que recorre el contorno de la planta. Al volver a
 * medir el edificio con un cuerpo menos, ese contorno cambia y los números se
 * reciclan: medido en 2370310VJ4027S al quitar el aparcamiento, `FBS1` pasaba
 * de ser la pared de 6,90 m a una de 1,03 m, `FBS2` heredaba los 6,90 y `FBS3`
 * los 3,40.
 *
 * Como TODO el trabajo del certificador va por ese nombre —las ventanas, las
 * medidas confirmadas, la U de cada pared, lo reclasificado, los pilares, la
 * entrada—, al quitar un cuerpo su trabajo saltaba a paredes que no eran. Y en
 * silencio: la ventana aparecía en otra fachada y nadie lo relacionaba con
 * haber pulsado «quitar el garaje».
 *
 * Aquí se casa cada pared VIEJA con la NUEVA que ocupa su mismo sitio, y de ahí
 * sale la traducción de nombres que se aplica al resembrar.
 */

//: Cuánto se pueden separar dos extremos para darlos por el mismo punto. La
//: geometría la produce el mismo motor con las mismas coordenadas, así que la
//: diferencia real es cero: esto solo absorbe el redondeo del JSON.
const CERCA = 0.02;

const lejos = (a, b) => Math.abs(a[0] - b[0]) > CERCA || Math.abs(a[1] - b[1]) > CERCA;

/** ¿Los dos trazados son el mismo? Da igual en qué sentido se hayan recorrido. */
export function mismoTrazado(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length < 2 || b.length < 2) return false;
    const [a1, a2] = [a[0], a[a.length - 1]];
    const [b1, b2] = [b[0], b[b.length - 1]];
    return (!lejos(a1, b1) && !lejos(a2, b2)) || (!lejos(a1, b2) && !lejos(a2, b1));
}

//: El trazado con el que se compara es SIEMPRE el de Catastro, nunca el que el
//: certificador haya movido a mano: si se comparara el movido, una pared
//: desplazada no casaría con la suya y su trabajo se daría por perdido.
const trazado = m => m?.svg_catastro || m?.svg;

/**
 * Cómo se llama ahora cada pared que antes se llamaba de otra forma.
 *
 * Devuelve `{ traduce, perdidos }`:
 *  · `traduce` solo lleva los nombres que CAMBIAN de pared. Lo que sigue en su
 *    sitio no entra: la inmensa mayoría de las veces esto está vacío y no
 *    toca nada.
 *  · `perdidos` son las paredes que ya no existen —se fueron con su cuerpo—.
 *    Su trabajo se queda sin destino, que es lo correcto: no puede acabar en
 *    la pared que ha heredado su nombre.
 *
 * REGLA — solo se traduce con UN candidato. Dos paredes nuevas sobre el mismo
 * trazado no deberían existir, y ante la duda es mejor perder el trabajo de
 * una pared que ponérselo a la que no es.
 */
export function traduccionDeIds(viejos, nuevos) {
    const traduce = {};
    const perdidos = [];
    const deLaApp = m => m?.subtipo === 'DIBUJADA';

    const libres = Object.values(nuevos || {}).filter(m => !deLaApp(m));
    const anteriores = Object.values(viejos || {}).filter(m => !deLaApp(m));

    for (const [id, viejo] of Object.entries(viejos || {})) {
        // Las que dibujó una persona llevan su propio id y no las numera el
        // motor: no se reciclan nunca.
        if (deLaApp(viejo)) continue;
        const enSuNombre = nuevos?.[id];
        if (enSuNombre && mismoTrazado(trazado(viejo), trazado(enSuNombre))) continue;

        // ¿Está esta pared, tal cual, con otro nombre?
        const iguales = libres.filter(m => mismoTrazado(trazado(viejo), trazado(m)));
        if (iguales.length === 1) {
            if (iguales[0].id !== id) traduce[id] = iguales[0].id;
            continue;
        }
        if (!enSuNombre) { perdidos.push(id); continue; }

        // Su nombre sigue existiendo pero encima hay otro trazado. Hay dos
        // casos y se distinguen por una pregunta: ¿esa pared YA ESTABA antes
        // con otro nombre?
        //  · SÍ  -> el nombre se ha RECICLADO (al quitar un cuerpo, `FBS3`
        //           pasó a ser la que era `FBS2`). El trabajo no puede
        //           quedarse ahí: se iría a una pared que no es.
        //  · NO  -> es la MISMA pared, medida de otra forma: la fachada que
        //           se recorta al sacar el garaje sigue siendo esa fachada, y
        //           su trabajo se queda con ella.
        const reciclado = anteriores.some(
            m => m.id !== id && mismoTrazado(trazado(m), trazado(enSuNombre)));
        if (reciclado) perdidos.push(id);
    }
    return { traduce, perdidos };
}

/**
 * La función con la que se lee un nombre guardado: devuelve el de HOY, o
 * `null` si esa pared ya no existe.
 */
export function lectorDeIds(viejos, nuevos) {
    const { traduce, perdidos } = traduccionDeIds(viejos, nuevos);
    const fuera = new Set(perdidos);
    return (id) => (fuera.has(id) ? null : (traduce[id] || id));
}
