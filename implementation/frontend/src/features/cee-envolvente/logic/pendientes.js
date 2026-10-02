/**
 * LO POR CONFIRMAR de la envolvente, como LISTA a la que se puede ir.
 *
 * La cabecera ya contaba «4 medidas por confirmar», pero era un número sin
 * salida: para encontrarlas había que recorrer las paredes una a una buscando
 * la raya ámbar. Esto devuelve cada una con su planta y su pared, para que la
 * ventana lleve a ella de un clic. Es la MISMA cuenta que `resumen.dudosos`
 * (`estado !== 'medido'`, huecos y lucernarios): si divergieran, el número diría
 * una cosa y la lista otra.
 *
 * Puro: sin React. ⚠️ Los imports llevan `.js` (Node lo exige; Vite no).
 */
import { esFuera } from './tiposPared.js';

/**
 * @param {object} muros         los del plano (`plano.muros`)
 * @param {object} lucernarios   `{ planta: [hueco] }`
 * @param {Array}  plantas       `plano.plantas` (para el orden y el nombre)
 * @param {Function} nombreDe    cómo se llama la pared en CE3X
 */
export function pendientesDe(muros, lucernarios, plantas, nombreDe = (m) => m?.id) {
    const orden = new Map((plantas || []).map((p, i) => [p.id, i]));
    const nombrePlanta = (id) => (plantas || []).find(p => p.id === id)?.nombre || id;
    const out = [];
    for (const m of Object.values(muros || {})) {
        if (esFuera(m)) continue;
        for (const h of m.huecos || []) {
            if (h.estado === 'medido') continue;
            out.push({
                clave: `${m.id}|${h.uid || h.nombre}`, planta: m.planta, plantaNombre: nombrePlanta(m.planta),
                muro: m.id, pared: nombreDe(m) || m.id, hueco: h.nombre, tipo: h.tipo,
                ancho: h.ancho, alto: h.alto, por_que: h.por_que || null, lucernario: false,
            });
        }
    }
    for (const [planta, lista] of Object.entries(lucernarios || {})) {
        for (const h of lista || []) {
            if (h.estado === 'medido') continue;
            out.push({
                clave: `L|${planta}|${h.uid || h.nombre}`, planta, plantaNombre: nombrePlanta(planta),
                muro: null, pared: 'cubierta', hueco: h.nombre, tipo: 'lucernario',
                ancho: h.ancho, alto: h.alto, por_que: h.por_que || null, lucernario: true,
            });
        }
    }
    return out.sort((a, b) => (orden.get(a.planta) ?? 99) - (orden.get(b.planta) ?? 99)
        || String(a.pared).localeCompare(String(b.pared)) || String(a.hueco).localeCompare(String(b.hueco)));
}

/** El sello del Agente IA de una fase, o null. Vive en `cee.agente_ia[fase]`. */
export function selloAgente(expediente, fase = 'inicial') {
    const s = expediente?.cee?.agente_ia?.[fase === 'final' ? 'final' : 'inicial'];
    return s && (s.estado === 'terminado' || s.fichero) ? s : null;
}
