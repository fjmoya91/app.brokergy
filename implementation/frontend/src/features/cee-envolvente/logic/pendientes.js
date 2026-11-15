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
import { esFuera, esMedianera } from './tiposPared.js';

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

/**
 * TODO LO QUE FALTA para generar, en UNA lista (2026-10-29, lo pidió Fran).
 *
 * La tira de estado decía lo mismo en seis píldoras (la entrada, «8/25 paredes
 * miradas», «12 medidas por confirmar», la carpintería…) y lo de las otras
 * pestañas solo se veía en su segunda línea de la barra de apartados. Ahora es
 * UN número —«Faltan N para generar»— que se abre en una lista donde cada línea
 * lleva a lo suyo: su pared, su hueco o su pestaña.
 *
 * Mismo criterio que lo que ya se contaba, para que el número y la lista no
 * digan cosas distintas: las paredes sin mirar son las de `resumen.sinTocar`,
 * las medidas las de `pendientesDe` y las pestañas, las de `construirPestanas`.
 * `bloquea` es lo que PARA el `.cex` (sin entrada, una fachada sin rumbo, un
 * «! falta…» de otra pestaña); lo demás se puede generar y se revisa después.
 *
 * @param {object} p
 * @param {object} p.muros, p.lucernarios, p.plantas, p.nombreDe  como en `pendientesDe`
 * @param {string|null} p.entrada            la pared por la que se entra
 * @param {boolean} p.ventanas               ¿se dijo cómo son las ventanas?
 * @param {Array} p.pestanas                 las de `construirPestanas`
 * @param {Function} p.necesitaRumbo         `necesitaRumbo` del plano (vive en el hook)
 * @returns {{ items: Array, bloquean: number }}
 */
export function faltaParaGenerar({ muros, lucernarios, plantas, nombreDe = (m) => m?.id,
                                   entrada, ventanas, pestanas, necesitaRumbo = () => false }) {
    const orden = new Map((plantas || []).map((p, i) => [p.id, i]));
    const nombrePlanta = (id) => (plantas || []).find(p => p.id === id)?.nombre || id;
    const porPlano = (a, b) => (orden.get(a.planta) ?? 99) - (orden.get(b.planta) ?? 99)
        || String(a.id).localeCompare(String(b.id), 'es', { numeric: true });
    const vivas = Object.values(muros || {}).filter(m => !esFuera(m)).sort(porPlano);
    const items = [];

    if (!entrada) {
        items.push({ clave: 'entrada', grupo: 'bloquea', texto: 'Señala por dónde se entra',
                     detalle: 'pulsa la pared de la puerta principal en el plano', ir: null });
    }
    for (const m of vivas.filter(necesitaRumbo)) {
        items.push({ clave: `rumbo|${m.id}`, grupo: 'bloquea', texto: `${nombreDe(m) || m.id}: hacia dónde da`,
                     detalle: `${nombrePlanta(m.planta)} · fachada sin rumbo`, ir: { muro: m.id, planta: m.planta } });
    }
    for (const p of pestanas || []) {
        if (p.id === 'envolvente' || p.tono !== 'aviso') continue;
        items.push({ clave: `pestana|${p.id}`, grupo: String(p.estado || '').startsWith('!') ? 'bloquea' : 'aviso',
                     texto: `${p.etiqueta}: ${String(p.estado || '').replace(/^!\s*/, '')}`,
                     detalle: p.ayuda || null, ir: { apartado: p.id } });
    }
    if (!ventanas) {
        items.push({ clave: 'ventanas', grupo: 'aviso', texto: 'Di cómo son las ventanas',
                     detalle: 'vidrio, marco y persiana: de ahí sale la U de cada hueco', ir: { ventanas: true } });
    }
    for (const m of vivas) {
        if (esMedianera(m) || m.revisada || (m.huecos || []).length) continue;
        items.push({ clave: `pared|${m.id}`, grupo: 'pared', texto: nombreDe(m) || m.id,
                     detalle: nombrePlanta(m.planta), ir: { muro: m.id, planta: m.planta } });
    }
    for (const it of pendientesDe(muros, lucernarios, plantas, nombreDe)) {
        items.push({ clave: `medida|${it.clave}`, grupo: 'medida', texto: it.hueco, medida: it,
                     detalle: `${it.plantaNombre} · ${it.pared}`, ir: { muro: it.muro, planta: it.planta } });
    }
    return { items, bloquean: items.filter(i => i.grupo === 'bloquea').length };
}

/** El sello del Agente IA de una fase, o null. Vive en `cee.agente_ia[fase]`. */
export function selloAgente(expediente, fase = 'inicial') {
    const s = expediente?.cee?.agente_ia?.[fase === 'final' ? 'final' : 'inicial'];
    return s && (s.estado === 'terminado' || s.fichero) ? s : null;
}
