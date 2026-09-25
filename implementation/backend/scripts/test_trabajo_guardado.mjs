/**
 * Al reabrir la envolvente, el trabajo guardado vuelve ENTERO — también el de
 * las paredes que dibujó el certificador.
 *
 *   node implementation/backend/scripts/test_trabajo_guardado.mjs
 *
 * El caso que lo motiva (26RES093_9, 25/09/2026): PBX1, una pared dibujada, se
 * pasó a fachada; al recargar volvía como partición con sus tres ventanas, el
 * autoguardado borraba el cambio de la BD y el .cex no se podía escribir.
 */
import { aplicarTrabajo } from '../../frontend/src/features/cee-envolvente/logic/trabajoGuardado.js';
import { lectorDeIds } from '../../frontend/src/features/cee-envolvente/logic/identidadParedes.js';

let fallos = 0;
const ok = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fallos++; };

// Stand-ins de las tres piezas que inyecta el hook (mismo contrato).
const deps = {
    paredDibujada: d => ({ id: d.id, planta: d.planta, tipo: d.tipo || 'PARTICION_VERTICAL',
                           subtipo: 'DIBUJADA', dibujada: true, svg: d.svg, alto: d.alto,
                           svg_catastro: d.svg, huecos: [] }),
    rescatarHueco: h => ({ ...h, tipo: String(h.tipo).toLowerCase() }),
    medirPared: (pts, alto) => {
        const L = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]);
        return { largo: L, superficie: L * alto };
    },
};

const muro = (id, svg, extra = {}) => ({ id, planta: 'PB', tipo: 'FACHADA', svg,
                                         svg_catastro: svg, alto: 2.8, largo: 10,
                                         superficie: 28, huecos: [], ...extra });
const medidos = () => ({
    FBO1: muro('FBO1', [[0, 0], [0, 5]]),
    FBE1: muro('FBE1', [[10, 0], [10, 5]]),
    MBN1: muro('MBN1', [[0, 5], [10, 5]], { tipo: 'MEDIANERA' }),
});

// ── 1. La pared DIBUJADA recupera TODO su trabajo ─────────────────────────────
{
    const g = {
        entrada: 'FBO1', sel: 'PBX1',
        paredes: {
            movidas: {},
            dibujadas: [{ id: 'PBX1', planta: 'PB', nivel: 0, alto: 2.8,
                          tipo: 'PARTICION_VERTICAL', subtipo: 'DIBUJADA',
                          svg: [[12.39, 10.03], [3.06, 7.31]] }],
        },
        huecos: { PBX1: [{ nombre: 'V1', tipo: 'VENTANA' }, { nombre: 'V2', tipo: 'ventana' },
                         { nombre: 'PE', tipo: 'puerta' }] },
        tipos: { PBX1: 'FACHADA' },
        nombres: { PBX1: 'FBX1' },
        orientaciones: { PBX1: 'S' },
        us: { PBX1: 0.45 },
        pilares: { PBX1: 3 },
        revisadas: ['PBX1'],
        cambian: ['PBX1'],
    };
    const nuevo = medidos();
    const r = aplicarTrabajo(nuevo, g, lectorDeIds(nuevo, nuevo), deps);
    const m = nuevo.PBX1;
    ok(!!m, 'la pared dibujada está en el mapa');
    ok(m?.tipo_manual === 'FACHADA', 'conserva su reclasificación a fachada');
    ok(m?.nombre_manual === 'FBX1', 'conserva su nombre (FBX1)');
    ok(m?.orientacion_manual === 'S', 'conserva su rumbo');
    ok(m?.u_manual === 0.45, 'conserva su U');
    ok(m?.pilares === 3, 'conserva sus pilares');
    ok(m?.revisada === true, 'conserva «revisada»');
    ok(m?.cambia === true, 'conserva «CAMBIA»');
    ok(m?.huecos?.length === 3 && m.huecos[0].tipo === 'ventana',
       'conserva sus 3 huecos (y los rescata a minúscula)');
    ok(r.geometria.dibujadas.length === 1, 'la geometría devuelve la dibujada');
    ok(r.sel === 'PBX1' && r.entrada === 'FBO1', 'selección y entrada');
}

// ── 2. Lo de las paredes de Catastro sigue igual ───────────────────────────────
{
    const g = {
        tipos: { FBE1: 'PARTICION_VERTICAL' }, nombres: { FBE1: 'PBE1' },
        excluidas: ['FBO1'], particiones: ['MBN1'],
        paredes: { movidas: { FBE1: [[10, 0], [10, 4]] }, dibujadas: [] },
    };
    const nuevo = medidos();
    const r = aplicarTrabajo(nuevo, g, lectorDeIds(nuevo, nuevo), deps);
    ok(nuevo.FBE1.tipo_manual === 'PARTICION_VERTICAL' && nuevo.FBE1.nombre_manual === 'PBE1',
       'una pared de Catastro conserva su reclasificación y su nombre');
    ok(nuevo.FBO1.excluida === true, 'la apartada sigue apartada');
    ok(nuevo.MBN1.como_particion === true, 'la medianera como partición');
    ok(nuevo.FBE1.movida === true && Math.abs(nuevo.FBE1.largo - 4) < 1e-9
       && nuevo.FBE1.largo_catastro === 10,
       'la movida se vuelve a medir y conserva la medida de Catastro');
    ok(r.geometria.movidas.FBE1?.length === 2, 'la movida vuelve a la geometría');
}

// ── 3. Un nombre RECICLADO al volver a medir se sigue traduciendo ──────────────
{
    // Antes FBE1 era la pared de x=10. Ahora el motor la llama FBE2, y FBE1 es
    // una pared nueva: el trabajo tiene que irse con la pared, no con el nombre.
    const viejos = medidos();
    const nuevo = {
        FBO1: muro('FBO1', [[0, 0], [0, 5]]),
        FBE2: muro('FBE2', [[10, 0], [10, 5]]),
        FBE1: muro('FBE1', [[8, 0], [8, 2]]),
        MBN1: muro('MBN1', [[0, 5], [10, 5]], { tipo: 'MEDIANERA' }),
    };
    const g = { tipos: { FBE1: 'MEDIANERA' }, paredes: { dibujadas: [
        { id: 'PBX1', planta: 'PB', svg: [[1, 1], [4, 1]], alto: 2.8 }] },
                tipos_extra: null };
    g.tipos.PBX1 = 'FACHADA';
    aplicarTrabajo(nuevo, g, lectorDeIds(viejos, nuevo), deps);
    ok(nuevo.FBE2.tipo_manual === 'MEDIANERA' && !nuevo.FBE1.tipo_manual,
       'el trabajo de la pared renombrada va a su nombre nuevo');
    ok(nuevo.PBX1?.tipo_manual === 'FACHADA',
       'y la dibujada conserva lo suyo aunque haya traducción de nombres');
}

// ── 4. Sin nada guardado de dibujadas, no se inventa ninguna ──────────────────
{
    const nuevo = medidos();
    const r = aplicarTrabajo(nuevo, {}, lectorDeIds(nuevo, nuevo), deps);
    ok(Object.keys(nuevo).length === 3 && r.geometria.dibujadas.length === 0,
       'un trabajo vacío no añade paredes');
    ok(r.entrada === null && r.sel === null && Array.isArray(r.cuerposFuera),
       'y devuelve estados vacíos');
}

console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTodo en orden.');
process.exit(fallos ? 1 : 0);
