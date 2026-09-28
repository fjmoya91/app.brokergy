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
    // REGLA — solo se casa dentro de la MISMA planta. La fachada de una casa de
    // dos plantas tiene EL MISMO trazado en la baja y en la primera (una encima
    // de otra), así que comparando solo trazados, al recortar la de la baja su
    // trabajo saltaba a la de ARRIBA: medido en 26RES080_85, la ventana de la
    // fachada de la calle de la planta baja acababa en F1SE1 («se vuelven a
    // pillar todos los muros de planta baja, de planta primera, las ventanas»).
    const misma = (a, b) => (a?.planta ?? null) === (b?.planta ?? null);

    for (const [id, viejo] of Object.entries(viejos || {})) {
        // Las que dibujó una persona llevan su propio id y no las numera el
        // motor: no se reciclan nunca.
        if (deLaApp(viejo)) continue;
        const enSuNombre = nuevos?.[id];
        if (enSuNombre && mismoTrazado(trazado(viejo), trazado(enSuNombre))) continue;

        // ¿Está esta pared, tal cual, con otro nombre?
        const iguales = libres.filter(m => misma(m, viejo)
                                           && mismoTrazado(trazado(viejo), trazado(m)));
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
            m => m.id !== id && misma(m, enSuNombre)
                 && mismoTrazado(trazado(m), trazado(enSuNombre)));
        if (reciclado) perdidos.push(id);
    }

    // Lo que ha cambiado de nombre Y de forma a la vez. Al quitar el garaje de
    // una casa, la fachada de la calle pasa de 13,38 a 10,48 m y además se
    // renumera: ninguna de las dos reglas de arriba la reconoce, y sus ventanas
    // se perdían («las ventanas desaparecían», 26RES080_85). Si en la MISMA
    // planta hay UNA sola pared nueva que va por la misma línea y comparte con
    // ella al menos `SOLAPE_MIN` de la MÁS LARGA de las dos, es esa pared
    // recortada. De la más larga, no de la más corta: el trocito de 1,03 m que
    // queda de una fachada de 7,30 m que se fue con el garaje (26RES060_195)
    // es otra pared, y no puede heredar las ventanas del garaje.
    const reconocidos = [];
    for (const id of perdidos) {
        const viejo = viejos[id];
        const candidatas = libres.filter(m => misma(m, viejo)
            && solape(trazado(viejo), trazado(m)) >= SOLAPE_MIN);
        if (candidatas.length === 1) {
            if (candidatas[0].id !== id) traduce[id] = candidatas[0].id;
            reconocidos.push(id);
        }
    }
    return { traduce, perdidos: perdidos.filter(id => !reconocidos.includes(id)) };
}

//: Cuánto tienen que compartir dos paredes COLINEALES, en tanto por uno de la
//: más LARGA, para darlas por la misma pared recortada. Medido: la fachada que
//: pierde el garaje comparte el 78 % (10,48 de 13,38), dos tramos que se funden
//: el 84 %, y el resto de una fachada que se fue con el garaje, el 14 %.
export const SOLAPE_MIN = 0.5;
//: Lo que pueden desviarse de la misma línea: dos centímetros de redondeo y el
//: grosor de una aguja; una pared paralela a medio metro es otra pared.
const FUERA_DE_LINEA = 0.10;
const NO_PARALELAS = 0.05;          // seno del ángulo entre las dos (≈3°)

/**
 * Qué parte de la MÁS LARGA de las dos comparten, si van por la misma línea
 * (0 si no). Se miden los extremos: las paredes del motor son rectas.
 */
export function solape(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length < 2 || b.length < 2) return 0;
    const [a1, a2] = [a[0], a[a.length - 1]];
    const [b1, b2] = [b[0], b[b.length - 1]];
    const ax = a2[0] - a1[0], ay = a2[1] - a1[1];
    const bx = b2[0] - b1[0], by = b2[1] - b1[1];
    const La = Math.hypot(ax, ay), Lb = Math.hypot(bx, by);
    if (!La || !Lb) return 0;
    if (Math.abs(ax * by - ay * bx) / (La * Lb) > NO_PARALELAS) return 0;
    const aLinea = p => Math.abs((p[0] - a1[0]) * ay - (p[1] - a1[1]) * ax) / La;
    if (aLinea(b1) > FUERA_DE_LINEA || aLinea(b2) > FUERA_DE_LINEA) return 0;
    const t = p => ((p[0] - a1[0]) * ax + (p[1] - a1[1]) * ay) / La;
    const lo = Math.max(0, Math.min(t(b1), t(b2)));
    const hi = Math.min(La, Math.max(t(b1), t(b2)));
    return Math.max(0, hi - lo) / Math.max(La, Lb);
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
