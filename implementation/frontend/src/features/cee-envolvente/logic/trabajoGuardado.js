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

    cadaValor(g.huecos, (m, v) => { m.huecos = (v || []).map(rescatarHueco); });
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
        cubiertas: g.cubierta_reforma && typeof g.cubierta_reforma === 'object'
            ? g.cubierta_reforma : {},
    };
}
