/**
 * Poner en el plano los huecos que se han revisado en el TELÉFONO (la foto de
 * una pared, en el croquis móvil).
 *
 * Por la MISMA función que el popup de la foto del ordenador
 * (`aplicaHuecosLeidos`): nacen en ámbar, por confirmar, y no pisan lo que ya
 * hay salvo que allí se haya pedido sustituirlo. El uid lo fijó el teléfono, así
 * que la marca de la foto (dónde está cada hueco) casa con el hueco sin
 * preguntar nada: la escribe quien llama (`ponerMarcas`), que es quien tiene la
 * sesión.
 *
 * @param plano   lo que devuelve `usePlanoEnvolvente`
 * @param pedido  { pared, huecos, reemplaza, drive_id } (ver `croquisMovil.pedirHuecos`)
 * @returns       { ok, texto, pared, total } — lo que se le cuenta al teléfono
 */
import { admiteHuecos } from './tiposPared.js';

export async function ponerHuecosDelMovil(plano, pedido, { ponerMarcas = null } = {}) {
    const m = plano?.muros?.[pedido?.pared];
    if (!m) return { ok: false, texto: 'Esa pared ya no está en el plano del ordenador.' };
    const nombre = plano.nombreDe(m);
    if (!admiteHuecos(m)) return { ok: false, texto: `${nombre} no es una fachada: ahí no van ventanas.` };
    const huecos = Array.isArray(pedido.huecos) ? pedido.huecos : [];
    if (!huecos.length) return { ok: false, texto: 'No ha llegado ningún hueco.' };

    const previos = pedido.reemplaza ? 0 : (m.huecos || []).length;
    plano.aplicaHuecosLeidos(m.id, huecos, { de: `la foto de ${nombre} (móvil)`, reemplaza: !!pedido.reemplaza });

    const marcas = huecos.filter(h => h.box).map(h => ({ uid: h.uid, box: h.box, de: 'lectura' }));
    if (pedido.drive_id && marcas.length && ponerMarcas) {
        // La marca es la comodidad; los huecos ya están puestos.
        try { await ponerMarcas({ clave: m.id, drive_id: pedido.drive_id, marcas, fundir: true }); }
        catch { /* sigue */ }
    }
    const n = huecos.length;
    return {
        ok: true, pared: m.id, total: previos + n,
        texto: `${n} ${n === 1 ? 'hueco puesto' : 'huecos puestos'} en ${nombre}`
            + (pedido.reemplaza ? ' (sustituyen a los que había)' : '') + ', en ámbar para confirmar.',
    };
}

export default ponerHuecosDelMovil;
