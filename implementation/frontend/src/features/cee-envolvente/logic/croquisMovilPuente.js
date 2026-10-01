/**
 * La respuesta de un AJUSTE del croquis, contada al MÓVIL.
 *
 * El ordenador ajusta y vuelve a medir la planta; el teléfono pinta en el
 * lienzo del momento en que se ABRIÓ la sesión (`marco`, ver
 * `useCroquisMovil.js`). Al volver a medir, el motor puede re-encuadrar el
 * lienzo (regla 79), así que lo que se le manda —las zonas que han salido Y las
 * PAREDES NUEVAS— hay que llevarlo a SU lienzo:
 *   · las zonas vienen en el MUNDO (EPSG:25830) y se proyectan con `marco`;
 *   · las paredes vienen en el lienzo NUEVO del ordenador (`marcoNuevo`) y se
 *     trasladan con `deltaLienzo`.
 *
 * Sin las paredes nuevas el teléfono pintaba las zonas ajustadas sobre las
 * paredes de antes: una combinación que no existe (la pared contra el garaje,
 * por ejemplo, no aparecía).
 *
 * Puro y sin React: se prueba desde Node (`scripts/test_croquis_movil_puente.mjs`).
 */
import { deltaLienzo } from './trabajoGuardado.js';

const r2 = v => Math.round(v * 100) / 100;

/**
 * @param r      { ok, texto, lineas, zonasMundo?, muros?, marcoNuevo? } — lo que
 *               devuelve el ajuste del ordenador. `zonasMundo` (aunque sea [])
 *               dice que se ha vuelto a medir.
 * @param marco  { dx, y0 } — el lienzo del teléfono (el de cuando se abrió).
 */
export function respuestaParaElMovil(r, marco) {
    if (!r) return { ok: false, texto: 'No se ha podido ajustar.' };
    const { zonasMundo, muros, marcoNuevo, recorteMundo, ...resto } = r;
    if (!marco || !Array.isArray(zonasMundo)) return resto;
    const salida = {
        ...resto,
        remedido: true,
        zonas: zonasMundo
            .map(z => ({ uso: z.uso, lienzo: alMovil(z.poligono, marco) }))
            .filter(z => z.lienzo.length >= 3),
    };
    // El CONTORNO DE LA VIVIENDA (delimitar un adosado): del mundo al lienzo
    // del teléfono, o `null` si se ha quitado. Sin la clave, no se dice nada.
    if (recorteMundo !== undefined) {
        salida.recorte = Array.isArray(recorteMundo) && recorteMundo.length >= 3
            ? alMovil(recorteMundo, marco) : null;
    }
    if (Array.isArray(muros) && muros.length && marcoNuevo) {
        // Del lienzo nuevo del ordenador al del teléfono. Sin movimiento, tal cual.
        const d = deltaLienzo(marcoNuevo, marco) || [0, 0];
        salida.muros = muros
            .filter(m => (m?.svg || []).length >= 2)
            // El trazo se traslada; lo demás (su id, su nombre, sus medidas, si
            // admite ventanas) viaja tal cual: el teléfono lo usa para hacerle la foto.
            .map(m => ({ ...m, svg: m.svg.map(([x, y]) => [r2(x + d[0]), r2(y + d[1])]) }));
    }
    return salida;
}

/** Del MUNDO (EPSG:25830) al lienzo del teléfono. */
function alMovil(pts, marco) {
    return (pts || []).map(([X, Y]) => [r2(X - marco.dx), r2(marco.y0 - Y)]);
}

/**
 * La planta ENTERA para el teléfono, cuando esta ventana ha vuelto a medir por
 * su cuenta (delimitar desde aquí, quitar un cuerpo…): las paredes y la
 * propuesta vienen en el lienzo de AHORA y se trasladan al del teléfono; las
 * zonas y el contorno vienen en el mundo.
 *
 * @param p      { muros, zonasMundo, recorteMundo, propuesta } — lienzo de ahora / mundo
 * @param marcoAhora  el lienzo de la geometría que hay en pantalla
 * @param marco       el lienzo del teléfono (el de cuando se abrió la sesión)
 */
export function planoParaElMovil(p, marcoAhora, marco) {
    if (!p || !marco || !marcoAhora) return null;
    const d = deltaLienzo(marcoAhora, marco) || [0, 0];
    const mover = (pts) => (pts || []).map(([x, y]) => [r2(x + d[0]), r2(y + d[1])]);
    return {
        muros: (p.muros || []).filter(m => (m?.svg || []).length >= 2)
            .map(m => ({ ...m, svg: mover(m.svg) })),
        zonas: (p.zonasMundo || []).map(z => ({ uso: z.uso, lienzo: alMovil(z.poligono, marco) }))
            .filter(z => z.lienzo.length >= 3),
        recorte: Array.isArray(p.recorteMundo) && p.recorteMundo.length >= 3
            ? alMovil(p.recorteMundo, marco) : null,
        ...(Array.isArray(p.propuesta)
            ? { propuesta: p.propuesta.map(t => ({ ...t, pts: mover(t.pts) })) } : {}),
    };
}

export default respuestaParaElMovil;
