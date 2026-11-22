// ─── direccion.js — dónde está el instalador, en la DIRECCIÓN (fase 5) ───────
// Recargar la página o pulsar «atrás» en el móvil le deja donde estaba, y un enlace
// directo («mira esta obra») abre ahí tras iniciar sesión. Viajan SOLO estas claves,
// todas sin datos personales: la pantalla, el nº de la obra (el mismo que ya sale en
// la app y en los papeles), la acción abierta dentro de ella, el id interno del
// cliente y el id del equipo del catálogo. Nunca un nombre, una dirección, un DNI ni
// un token. Lo que no casa con su forma se ignora.
//
//   /?seccion=obras&obra=26RES060_OP901&accion=cifo
//   /?seccion=clientes&cliente=<id_cliente>
//   /?seccion=catalogo&equipo=101
//   /?seccion=pagina
//   /?seccion=asistente   (fase 6: la charla NO viaja; recargar la empieza de cero)
//   /?seccion=presupuestos&presupuesto=<uuid>   (o `presupuesto=nuevo`: el formulario vacío)
//
// El resto de la dirección (lo de quien nos aloja: `op`, o lo del banco de pruebas)
// no se toca: se leen y escriben solo estas claves.

export const CLAVES = ['seccion', 'obra', 'accion', 'cliente', 'equipo', 'presupuesto'];
export const SECCIONES = ['inicio', 'obras', 'clientes', 'catalogo', 'pagina', 'presupuestos', 'asistente'];
export const ACCIONES = ['propuesta', 'presupuesto', 'factura', 'cifo', 'rite', 'fm_decl', 'docs'];

const forma = {
    obra: /^[A-Za-z0-9_-]{1,60}$/,
    cliente: /^[A-Za-z0-9-]{1,64}$/,
    equipo: /^[A-Za-z0-9_-]{1,40}$/,
    // El id del presupuesto (uuid) o «nuevo». Nunca su número ni su cliente.
    presupuesto: /^(nuevo|[A-Za-z0-9-]{1,64})$/,
};

/** Lee el estado de una cadena `?…` (o de un URLSearchParams). */
export function leerDireccion(search) {
    const p = search instanceof URLSearchParams ? search : new URLSearchParams(String(search || ''));
    const v = (k) => {
        const x = (p.get(k) || '').trim();
        return x && forma[k].test(x) ? x : null;
    };
    const obra = v('obra');
    const cliente = obra ? null : v('cliente');
    const equipo = obra || cliente ? null : v('equipo');
    const presupuesto = obra || cliente || equipo ? null : v('presupuesto');
    const accionRaw = (p.get('accion') || '').trim();
    const accion = obra && ACCIONES.includes(accionRaw) ? accionRaw : null;
    let seccion = SECCIONES.includes(p.get('seccion')) ? p.get('seccion') : null;
    // La ficha manda sobre la pantalla: una obra se ve desde Obras, etc.
    if (obra) seccion = 'obras';
    else if (cliente) seccion = 'clientes';
    else if (equipo) seccion = 'catalogo';
    else if (presupuesto) seccion = 'presupuestos';
    return { seccion: seccion || 'inicio', obra, accion, cliente, equipo, presupuesto };
}

/** El estado de la app → sus claves (sin las vacías; «inicio» no se escribe). */
export function clavesDe({ seccion, ficha }) {
    const out = {};
    if (ficha?.tipo === 'obra' && ficha.obra?.id) {
        out.seccion = 'obras';
        out.obra = String(ficha.obra.id);
        if (ficha.accion?.accion && ACCIONES.includes(ficha.accion.accion)) out.accion = ficha.accion.accion;
    } else if (ficha?.tipo === 'cliente' && ficha.cliente?.id_cliente != null) {
        out.seccion = 'clientes';
        out.cliente = String(ficha.cliente.id_cliente);
    } else if (ficha?.tipo === 'equipo' && ficha.equipo?.id != null) {
        out.seccion = 'catalogo';
        out.equipo = String(ficha.equipo.id);
    } else if (ficha?.tipo === 'presupuesto' && ficha.id) {
        // Cambiar uno o hacer otro igual se abre encima de su ficha: en la dirección,
        // la ficha (al recargar se vuelve a ella). Lo tecleado no viaja nunca.
        out.seccion = 'presupuestos';
        out.presupuesto = String(ficha.id);
    } else if (seccion && seccion !== 'inicio' && SECCIONES.includes(seccion)) {
        out.seccion = seccion;
    }
    // Lo que no casa con su forma no se escribe (nunca un dato raro en la barra).
    for (const k of ['obra', 'cliente', 'equipo', 'presupuesto']) if (out[k] && !forma[k].test(out[k])) delete out[k];
    return out;
}

/** La dirección actual con SOLO nuestras claves cambiadas. */
export function urlCon(href, claves) {
    const url = new URL(href);
    for (const k of CLAVES) url.searchParams.delete(k);
    for (const k of CLAVES) if (claves[k]) url.searchParams.set(k, claves[k]);
    return `${url.pathname}${url.search}${url.hash}`;
}

/** Escribe en el historial (replace por defecto; push para una ficha nueva). */
export function escribir(claves, { push = false, estado } = {}) {
    try {
        const destino = urlCon(window.location.href, claves);
        const st = estado !== undefined ? estado : window.history.state;
        if (push) window.history.pushState(st, '', destino);
        else if (destino !== `${window.location.pathname}${window.location.search}${window.location.hash}`) window.history.replaceState(st, '', destino);
        else if (estado !== undefined) window.history.replaceState(st, '', destino);
    } catch { /* sin historial (un iframe raro): la app sigue sin recordar */ }
}
