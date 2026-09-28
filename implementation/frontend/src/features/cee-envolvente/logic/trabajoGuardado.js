/**
 * Poner un TRABAJO guardado encima de los muros recién medidos.
 *
 * Vive fuera de `usePlanoEnvolvente` para poder comprobarlo desde Node: es lo
 * que se ejecuta cada vez que se abre la ventana, se deshace o se vuelve a
 * medir, y un fallo aquí no da error — simplemente deja de aparecer trabajo que
 * sí estaba guardado, y el autoguardado siguiente lo borra de la BD.
 *
 * ORDEN — las paredes DIBUJADAS entran en el mapa ANTES de aplicar nada. Se
 * añadían al final, y como cada paso de abajo comprueba `nuevo[k]`, a una pared
 * dibujada no le llegaba ni su tipo, ni su nombre, ni su U, ni su rumbo, ni sus
 * pilares, ni su «revisada». Medido en 26RES093_9 (25/09/2026): PBX1 pasada a
 * fachada volvía como partición con sus tres ventanas, y el `.cex` dejaba de
 * poder escribirse («un hueco solo va en un cerramiento exterior»).
 *
 * `nuevo` se MODIFICA (es el mapa que la siembra acaba de construir) y se
 * devuelve lo demás que hay que poner en estado. `id` traduce un nombre
 * guardado al de hoy (`lectorDeIds`). Las tres piezas que dependen del hook
 * —cómo es una pared dibujada, cómo se rescata un hueco, cómo se mide— se
 * INYECTAN, para no tener dos versiones de ellas.
 */
export function aplicarTrabajo(nuevo, g, id, { paredDibujada, rescatarHueco, medirPared }) {
    const geometria = { movidas: {}, dibujadas: [] };

    for (const d of g.paredes?.dibujadas || []) {
        if (!d?.id || nuevo[d.id]) continue;
        geometria.dibujadas.push(d);
        nuevo[d.id] = paredDibujada(d);
    }

    const cada = (lista, poner) => {
        for (const k0 of lista || []) {
            const k = id(k0);
            if (k && nuevo[k]) poner(nuevo[k]);
        }
    };
    const cadaValor = (mapa, poner) => {
        for (const [k0, v] of Object.entries(mapa || {})) {
            const k = id(k0);
            if (k && nuevo[k]) poner(nuevo[k], v);
        }
    };

    // Se SUMAN, no se sustituyen: dos paredes viejas pueden acabar en la misma
    // nueva (dos tramos que al volver a medir quedan en uno), y con `=` los
    // huecos de la primera desaparecían al aplicar los de la segunda.
    cadaValor(g.huecos, (m, v) => {
        m.huecos = [...(m.huecos || []), ...(v || []).map(rescatarHueco)];
    });
    cada(g.particiones, m => { m.como_particion = true; });
    cada(g.excluidas, m => { m.excluida = true; });
    cada(g.revisadas, m => { m.revisada = true; });
    cada(g.cambian, m => { m.cambia = true; });
    cadaValor(g.tipos, (m, t) => { m.tipo_manual = t; });
    cadaValor(g.nombres, (m, n) => { m.nombre_manual = n; });
    cadaValor(g.us, (m, u) => { m.u_manual = u; });
    cadaValor(g.orientaciones, (m, o) => { m.orientacion_manual = o; });
    cadaValor(g.pilares, (m, n) => { m.pilares = n; });

    // Las paredes movidas, al nombre de HOY.
    for (const [k0, pts] of Object.entries(g.paredes?.movidas || {})) {
        const k = id(k0);
        if (!k || !nuevo[k]) continue;
        geometria.movidas[k] = pts;
        // La marca y la medida de Catastro se rehacen AQUÍ, no solo al
        // arrastrar: si no, al recargar la pared aparecía movida pero sin
        // decirlo, que es justo lo que no puede pasar con una superficie que va
        // al certificado.
        Object.assign(nuevo[k], {
            movida: true, svg: pts,
            largo_catastro: nuevo[k].largo,
            superficie_catastro: nuevo[k].superficie,
        }, medirPared(pts, nuevo[k].alto));
    }

    return {
        entrada: g.entrada ? id(g.entrada) : null,
        sel: g.sel ? id(g.sel) : null,
        geometria,
        cuerposFuera: Array.isArray(g.cuerpos_fuera) ? g.cuerpos_fuera : [],
        recorte: Array.isArray(g.recorte_vivienda?.poligono)
            && g.recorte_vivienda.poligono.length >= 3 ? g.recorte_vivienda : null,
        zonasFuera: zonasValidas(g.zonas_fuera),
        cubiertas: g.cubierta_reforma && typeof g.cubierta_reforma === 'object'
            ? g.cubierta_reforma : {},
    };
}

/** Las zonas que no cuentan, las que tienen con qué medirse (nivel + vértices). */
export function zonasValidas(zs) {
    return (Array.isArray(zs) ? zs : []).filter(z => z && Number.isInteger(z.nivel)
        && Array.isArray(z.poligono) && z.poligono.length >= 3);
}

// ─── El LIENZO se mueve al volver a medir ────────────────────────────────────
//
// POR QUÉ EXISTE — 26RES080_85 (28/09/2026): el certificador dibujó en la
// planta baja la pared del garaje, luego quitó un almacén… y la pared apareció
// SIETE METROS al oeste de donde la había dibujado. «Las paredes iban a la
// mierda, las ventanas desaparecían.»
//
// El motor encuadra el lienzo en lo que DIBUJA (`x − minx + margen`): al quitar
// un cuerpo, el encuadre cambia y con él el origen de todas las coordenadas del
// plano. Medido en esa casa: la misma fachada, que no había cambiado, pasaba de
// [17,83, 23,29] a [10,52, 22,74] y a [6,94, 15,84]. Lo que se guarda en
// coordenadas del lienzo —las paredes dibujadas y movidas, el polígono de la
// cubierta que se reforma— se quedaba donde estaba, o sea en otro sitio del
// edificio; y la identidad de las paredes (`identidadParedes`), que compara
// trazados en el lienzo, dejaba de casar ninguna.
//
// El trabajo guarda ahora EN QUÉ LIENZO se dibujó (`lienzo_ref`, la traslación
// al mundo que da el propio motor) y al sembrarlo sobre una geometría nueva se
// traslada. Un trabajo de antes no la trae: se da por dibujado en el lienzo que
// se está abriendo, que es lo mismo que se hacía hasta ahora.

/**
 * Cuánto hay que sumar a una coordenada del lienzo VIEJO para llevarla al
 * NUEVO. `null` si no hay nada que mover (o no se sabe).
 *
 * `x_mundo = x + dx` y `y_mundo = y0 − y` (ver `lienzoAMundo`), así que
 * `x' = x + dx_viejo − dx_nuevo` e `y' = y + y0_nuevo − y0_viejo`.
 */
export function deltaLienzo(viejo, nuevo) {
    if (!viejo || !nuevo) return null;
    const d = [Number(viejo.dx) - Number(nuevo.dx), Number(nuevo.y0) - Number(viejo.y0)];
    if (!d.every(Number.isFinite)) return null;
    // Por debajo del milímetro no se ha movido nada: es el redondeo del JSON.
    return Math.abs(d[0]) < 0.001 && Math.abs(d[1]) < 0.001 ? null : d;
}

const r2 = v => Math.round(v * 100) / 100;
const mover = (pts, d) => (Array.isArray(pts)
    ? pts.map(p => (Array.isArray(p) ? [r2(p[0] + d[0]), r2(p[1] + d[1])] : p)) : pts);

/**
 * El trabajo con sus coordenadas del lienzo trasladadas. No toca lo que va en
 * el MUNDO (el contorno de la vivienda y las zonas, que se guardan así desde el
 * principio precisamente por esto) ni nada que no sea geometría.
 */
export function trasladarTrabajo(g, d) {
    if (!g || !d) return g;
    const paredes = g.paredes || {};
    const cubiertas = {};
    for (const [k, c] of Object.entries(g.cubierta_reforma || {})) {
        cubiertas[k] = c && Array.isArray(c.poligono) ? { ...c, poligono: mover(c.poligono, d) } : c;
    }
    return {
        ...g,
        paredes: {
            ...paredes,
            movidas: Object.fromEntries(Object.entries(paredes.movidas || {})
                .map(([k, pts]) => [k, mover(pts, d)])),
            dibujadas: (paredes.dibujadas || []).map(w => (w ? { ...w, svg: mover(w.svg, d) } : w)),
        },
        cubierta_reforma: cubiertas,
    };
}

/** Los muros de una siembra anterior, llevados al lienzo nuevo para compararlos. */
export function trasladarMuros(muros, d) {
    if (!d) return muros;
    return Object.fromEntries(Object.entries(muros || {}).map(([k, m]) => [k, {
        ...m,
        svg: mover(m.svg, d),
        ...(m.svg_catastro ? { svg_catastro: mover(m.svg_catastro, d) } : {}),
    }]));
}
