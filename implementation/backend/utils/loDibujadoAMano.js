// ─────────────────────────────────────────────────────────────────────────────
// Lo dibujado A MANO en la pizarra del plano MANDA sobre lo que proponga la IA.
//
// POR QUÉ EXISTE. La skill `generar-cee-inicial` monta el plano con lo que ve
// en las fotos y en Catastro; cuando quien conoce la vivienda lo corrige en la
// PIZARRA de la envolvente y pulsa «Así es como está», le pide a la IA que
// rehaga el CEE SOBRE SUS CAMBIOS. Si en esa pasada la IA volviera a poner su
// plan encima —sus huecos, sus tipos de pared—, deshacería en silencio justo lo
// que una persona acaba de corregir. Este módulo es el que lo impide: lo comprueba
// el CÓDIGO, no la buena voluntad de quien escribe el plan.
//
// Qué cuenta como tocado a mano:
//   · las paredes de `trabajo.pizarra.tocadas` (las reclasificadas, dibujadas,
//     apartadas o con huecos puestos o quitados en la pizarra);
//   · las paredes que tienen algún hueco con `origen: 'pizarra'`.
//
// Lo que SÍ se puede hacer sobre ellas: MEDIR sus huecos (`plan.medir`), que es
// justo lo que la pizarra deja pendiente —dice que hay una ventana y dónde, no
// cuánto mide—. Para pisarlo de verdad hace falta `"forzar_mano": true`, y eso
// lo decide una persona.
//
// PURO (sin BD ni red): `node implementation/backend/scripts/test_lo_dibujado.js`.
// ─────────────────────────────────────────────────────────────────────────────

/** Las paredes que ha tocado una persona en la pizarra. */
function paredesTocadas(prev) {
    const out = new Set(Array.isArray(prev?.pizarra?.tocadas) ? prev.pizarra.tocadas.map(String) : []);
    for (const [id, hs] of Object.entries(prev?.huecos || {})) {
        if ((hs || []).some(h => h?.origen === 'pizarra')) out.add(String(id));
    }
    return out;
}

const igual = (a, b) => String(a ?? '') === String(b ?? '');

/**
 * Comprueba que el plan no deshace lo dibujado a mano. LANZA con el porqué si
 * lo hace (salvo `plan.forzar_mano`) y devuelve los avisos de lo que deja pasar.
 */
function respetarLoDibujado(plan, prev) {
    const tocadas = paredesTocadas(prev);
    if (!plan || !tocadas.size) return [];
    if (plan.forzar_mano) {
        return [`«forzar_mano»: el plan PISA lo dibujado a mano en ${[...tocadas].join(', ')}. `
            + 'Que lo sepa quien lo dibujó.'];
    }
    const problemas = [];
    const lista = (ids) => ids.map(String).filter(id => tocadas.has(id));

    if (plan.reemplazar) {
        problemas.push('«reemplazar» quitaría los huecos dibujados a mano (en '
            + `${[...tocadas].join(', ')}).`);
    }
    const conHuecos = lista(Object.keys(plan.huecos || {}));
    if (conHuecos.length) {
        problemas.push(`los huecos de ${conHuecos.join(', ')} los ha puesto o quitado una persona en la pizarra: `
            + 'no se vuelven a poner desde el plan (para medirlos, «medir»).');
    }
    const tipos = Object.entries(plan.tipos || {})
        .filter(([id, t]) => tocadas.has(String(id)) && !igual(t, prev?.tipos?.[id]));
    if (tipos.length) {
        problemas.push(`el tipo de ${tipos.map(([id]) => id).join(', ')} lo ha decidido una persona `
            + '(muro exterior, medianera o partición): no se cambia desde el plan.');
    }
    if (Array.isArray(plan.excluidas)) {
        const antes = new Set((prev?.excluidas || []).map(String));
        const ahora = new Set(plan.excluidas.map(String));
        const devueltas = [...antes].filter(id => tocadas.has(id) && !ahora.has(id));
        const apartadas = [...ahora].filter(id => tocadas.has(id) && !antes.has(id));
        if (devueltas.length) problemas.push(`${devueltas.join(', ')} las ha apartado una persona («no existe»): no se devuelven.`);
        if (apartadas.length) problemas.push(`${apartadas.join(', ')} las ha tocado una persona: no se apartan desde el plan.`);
    }
    if (problemas.length) {
        const e = new Error('El plan deshace lo que una persona ha dibujado a mano en la pizarra del plano:\n  · '
            + `${problemas.join('\n  · ')}\n`
            + 'Respétalo (quítalo del plan) o, si de verdad hay que cambiarlo, pregúntaselo y pon "forzar_mano": true.');
        e.loDibujado = true;
        throw e;
    }
    return [];
}

/**
 * Pone la MEDIDA a huecos que ya están (por su nombre), sin quitar ni añadir
 * ninguno: `{ "FBS1": { "V3": { "ancho": 1.2, "alto": 1.1, "por_que": "…",
 * "estado": "medido" } } }`. Una medida de una foto nace POR CONFIRMAR salvo que
 * el plan diga «medido».
 *
 * @returns {{ huecos, hechos: string[], avisos: string[] }}
 */
function medirHuecos(huecos, medir) {
    const out = { ...(huecos || {}) };
    const hechos = [], avisos = [];
    for (const [pared, porNombre] of Object.entries(medir || {})) {
        const lista = out[pared];
        if (!Array.isArray(lista)) { avisos.push(`«medir»: la pared ${pared} no tiene huecos guardados.`); continue; }
        const nuevos = lista.map(h => ({ ...h }));
        for (const [nombre, m] of Object.entries(porNombre || {})) {
            const h = nuevos.find(x => String(x?.nombre) === String(nombre));
            if (!h) { avisos.push(`«medir»: ${pared} no tiene un hueco ${nombre}.`); continue; }
            const ancho = Number(m?.ancho), alto = Number(m?.alto);
            if (!(ancho > 0) && !(alto > 0)) { avisos.push(`«medir»: ${pared} ${nombre} sin medida.`); continue; }
            if (ancho > 0) h.ancho = Math.round(ancho * 100) / 100;
            if (alto > 0) h.alto = Math.round(alto * 100) / 100;
            h.estado = m?.estado === 'medido' ? 'medido' : 'dudoso';
            h.por_que = m?.por_que || (h.origen === 'pizarra'
                ? 'dibujada a mano; medida de las fotos: confírmala'
                : 'medida de las fotos: confírmala');
            hechos.push(`${pared} ${nombre}: ${String(h.ancho).replace('.', ',')} × ${String(h.alto).replace('.', ',')} m`
                + (h.estado === 'medido' ? '' : ' (por confirmar)'));
        }
        out[pared] = nuevos;
    }
    return { huecos: out, hechos, avisos };
}

module.exports = { paredesTocadas, respetarLoDibujado, medirHuecos };
