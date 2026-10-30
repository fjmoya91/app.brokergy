/**
 * QUÉ deshace «Deshacer» (2026-10-29, lo pidió Fran: «que la usabilidad sea la
 * mejor posible»).
 *
 * El botón decía «Deshacer» y nada más: con el autoguardado, quien duda de si
 * deshacer es porque no recuerda qué fue lo último, y pulsarlo a ciegas para
 * verlo es justo lo que no se quiere. Esto compara las dos FOTOS de la pila de
 * `useDeshacer` (trabajo + ajustes) y lo dice en palabras: «V3 movida de FBE1 a
 * FBE3», «FBE2 apartada», «cómo son las ventanas».
 *
 * Se calcula al MOVERSE por la pila (`sitio` en useDeshacer), no al pintar:
 * la pila es un `ref` y leerla al pintar no se puede; la pila no cambia de forma.
 *
 * Puro: sin React. ⚠️ Los imports llevan `.js` (Node lo exige; Vite no).
 */

//: Las listas de paredes del trabajo: qué se dice al entrar y al salir una. En
//: este orden, que es el de lo que más importa saber que se deshace: «revisada»
//: suele ir de la mano de otra cosa (Intro tras poner los huecos) y va la última.
const LISTAS = {
    excluidas: ['apartada', 'devuelta a la envolvente'],
    particiones: ['pasada a partición', 'ya no es partición'],
    cambian: ['marcada «CAMBIA»', 'ya no CAMBIA'],
    revisadas: ['dada por revisada', 'ya no está revisada'],
};

//: Lo demás del trabajo, por su clave, cuando no hay nada más fino que decir.
const CLAVES = {
    tipos: 'el tipo de una pared', nombres: 'el nombre de una pared', us: 'la U de una pared',
    orientaciones: 'el rumbo de una pared', pilares: 'los pilares de una pared',
    paredes: 'una pared dibujada o movida', cuerpos_fuera: 'lo que cuenta como vivienda',
    recorte_vivienda: 'el contorno del adosado', zonas_fuera: 'las zonas que no son vivienda',
    cubierta_reforma: 'la cubierta', lucernarios: 'los lucernarios',
    huecos_sin_pared: 'los huecos sin pared', pizarra: 'lo dibujado en la pizarra',
    equipos_plano: 'los equipos del plano',
};

//: Los ajustes de la ficha que tienen nombre propio; el resto, genérico.
const AJUSTES = {
    ventanas: 'cómo son las ventanas', medidas: 'las medidas de mejora',
    medidas_libres: 'las medidas de mejora', tipo_ce3x: 'el tipo de edificio',
};

const igual = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Los huecos de un trabajo por su `uid` (o pared+nombre si no lo traen). */
function huecosPorUid(trabajo) {
    const out = new Map();
    for (const [pared, lista] of Object.entries(trabajo?.huecos || {})) {
        for (const h of lista || []) out.set(h.uid || `${pared}|${h.nombre}`, { pared, h });
    }
    return out;
}

function cambiosDeHuecos(antes, despues) {
    const a = huecosPorUid(antes), d = huecosPorUid(despues);
    const out = [];
    for (const [k, { pared, h }] of d) {
        const v = a.get(k);
        if (!v) { out.push(`${h.nombre} añadida a ${pared}`); continue; }
        if (v.pared !== pared) { out.push(`${h.nombre} movida de ${v.pared} a ${pared}`); continue; }
        if (igual(v.h, h)) continue;
        if (v.h.estado !== 'medido' && h.estado === 'medido' && v.h.ancho === h.ancho && v.h.alto === h.alto) {
            out.push(`${h.nombre} dada por buena`);
        } else if (v.h.ancho !== h.ancho || v.h.alto !== h.alto) {
            out.push(`medidas de ${h.nombre}`);
        } else {
            out.push(`${h.nombre} en ${pared}`);
        }
    }
    for (const [k, { pared, h }] of a) if (!d.has(k)) out.push(`${h.nombre} quitada de ${pared}`);
    return out;
}

/**
 * Lo que cambia de `antes` a `despues`, en palabras. Lista vacía si nada.
 * @param {{trabajo, ajustes}} antes
 * @param {{trabajo, ajustes}} despues
 */
export function cambiosEntre(antes, despues) {
    const ta = antes?.trabajo || {}, td = despues?.trabajo || {};
    const out = [...cambiosDeHuecos(ta, td)];
    if (ta.entrada !== td.entrada) {
        out.push(td.entrada ? `la entrada por ${td.entrada}` : 'la entrada');
    }
    for (const [k, [entra, sale]] of Object.entries(LISTAS)) {
        const a = new Set(ta[k] || []), d = new Set(td[k] || []);
        for (const id of d) if (!a.has(id)) out.push(`${id} ${entra}`);
        for (const id of a) if (!d.has(id)) out.push(`${id} ${sale}`);
    }
    const vistas = new Set(['huecos', 'entrada', 'sel', 'lienzo_ref', ...Object.keys(LISTAS)]);
    const claves = new Set([...Object.keys(ta), ...Object.keys(td)]);
    for (const k of claves) {
        if (vistas.has(k) || igual(ta[k], td[k])) continue;
        const texto = CLAVES[k];
        if (!texto) continue;
        // Con nombre de pared si el cambio es de UNA pared (tipo, nombre, U…).
        const ids = [...new Set([...Object.keys(ta[k] || {}), ...Object.keys(td[k] || {})])]
            .filter(id => !igual(ta[k]?.[id], td[k]?.[id]));
        const deUna = /de una pared$/.test(texto) && ids.length === 1 && !Array.isArray(td[k]);
        out.push(deUna ? texto.replace('una pared', ids[0]) : texto);
    }
    const aa = antes?.ajustes || {}, ad = despues?.ajustes || {};
    const ajustes = new Set();
    for (const k of new Set([...Object.keys(aa), ...Object.keys(ad)])) {
        if (!igual(aa[k], ad[k])) ajustes.add(AJUSTES[k] || 'los datos de la ficha');
    }
    return [...out, ...ajustes];
}

/** En una línea, con tope: «V3 movida de FBE1 a FBE3 · FBE2 apartada y 2 más». */
export function describirPaso(antes, despues, max = 2) {
    const lista = cambiosEntre(antes, despues);
    if (!lista.length) return null;
    return lista.length > max
        ? `${lista.slice(0, max).join(' · ')} y ${lista.length - max} más`
        : lista.join(' · ');
}
