/**
 * Mover un hueco de una pared a OTRA.
 *
 * POR QUÉ EXISTE: las ventanas se ponen mirando el plano, y con las dos plantas
 * a la vez y seis fachadas encadenadas es fácil meterla en la pared de al lado.
 * Hasta ahora la única salida era quitarla y volver a teclear sus medidas en la
 * buena — y lo que se teclea dos veces se teclea mal una.
 *
 * La mudanza conserva el hueco ENTERO: su identidad, su nombre, sus medidas,
 * si estaban confirmadas, su carpintería, si se cambia en la reforma y lo que
 * dijo su foto. Lo único que no puede viajar es DÓNDE caía a lo largo del muro.
 */
import { admiteHuecos } from './tiposPared.js';

/**
 * Las paredes a las que se puede mudar un hueco, agrupadas por planta.
 *
 * Solo fachadas y sin la de origen. Una medianera o una partición no llevan
 * huecos, así que ofrecerlas sería ofrecer un destino que deja el `.cex` sin
 * poder escribirse.
 *
 * Van las de TODAS las plantas, no solo la suya: con las dos a la vista en
 * pantalla, equivocarse de planta es justo uno de los errores que esto viene a
 * arreglar. Cada una dice de cuál es.
 */
export function paredesParaHueco(muros, idOrigen) {
    const salida = [];
    for (const m of Object.values(muros || {})) {
        if (!m || m.id === idOrigen || !admiteHuecos(m)) continue;
        salida.push({
            id: m.id,
            nombre: m.nombre_manual || m.id,
            planta: m.planta || '',
            nivel: Number.isFinite(m.nivel) ? m.nivel : 0,
            largo: m.largo,
            huecos: (m.huecos || []).length,
        });
    }
    // Por planta de abajo arriba y, dentro, por nombre: es el orden en que se
    // leen en el plano.
    return salida.sort((a, b) => a.nivel - b.nivel || String(a.nombre).localeCompare(b.nombre));
}

/** Un nombre que no esté cogido por NINGÚN hueco del edificio. */
function nombreLibre(muros, quiere, uid) {
    const usados = new Set();
    for (const m of Object.values(muros || {})) {
        for (const h of m.huecos || []) if (h.uid !== uid) usados.add(h.nombre);
    }
    if (!usados.has(quiere)) return quiere;
    const letra = String(quiere || 'V').replace(/\d+$/, '') || 'V';
    let n = 1;
    while (usados.has(letra + n)) n++;
    return letra + n;
}

/**
 * Devuelve el mapa de muros con el hueco `i` de `origen` puesto en `destino`.
 *
 * Si algo no cuadra —no existe el hueco, el destino no admite huecos, es la
 * misma pared— devuelve el mapa TAL CUAL: una mudanza a medias sería peor que
 * no hacerla.
 */
export function mudarHueco(muros, origen, i, destino) {
    const o = muros?.[origen];
    const d = muros?.[destino];
    const h = o?.huecos?.[i];
    if (!o || !d || !h || origen === destino || !admiteHuecos(d)) return muros;

    const mudado = {
        ...h,
        // El sitio a lo largo del muro es del muro VIEJO: en el nuevo no
        // significa nada, y dejarlo lo pondría en un punto cualquiera. Sin él
        // se coloca solo en el reparto y se arrastra a donde vaya.
        pos: undefined,
        // El nombre viaja con el hueco —es el que se lee en CE3X y el que
        // nombran sus puentes térmicos—, salvo que en el edificio ya lo tenga
        // otro.
        nombre: nombreLibre(muros, h.nombre, h.uid),
        por_que: `movida desde ${o.nombre_manual || o.id}`
            + (h.estado === 'medido' ? ', con sus medidas' : ''),
    };
    const quedan = [...(o.huecos || [])];
    quedan.splice(i, 1);
    return {
        ...muros,
        [origen]: { ...o, huecos: quedan },
        [destino]: { ...d, huecos: [...(d.huecos || []), mudado] },
    };
}
