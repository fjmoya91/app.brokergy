// ============================================================================
// apiEnvolvente.js — a qué NEGOCIO pertenece el expediente de esta ventana.
//
// La envolvente vale para los dos: el expediente CAE y el CEE contratado suelto
// (`cee_directos`). Para el motor, la ficha y el plano son el mismo edificio;
// lo único que cambia es en qué TABLA se escribe lo que el certificador señala
// y en qué carpeta de Drive acaba el `.cex`. Eso lo decide el backend, y se lo
// tiene que decir quien llama.
//
// REGLA — el origen sale de la URL de ESTA ventana (`?origen=cee`), no se deduce del
// expediente cargado. Son dos tablas y el mismo UUID no vale en las dos, así
// que una suposición aquí escribe el trabajo en el negocio equivocado. Es el
// mismo criterio que `?cee=` frente a `?exp=` en los enlaces de los mensajes.
//
// No es estado de la app: es la dirección que se ha abierto, y `/envolvente/:id`
// es una VENTANA PROPIA dedicada a un solo expediente —no un modal dentro del
// dashboard—, así que no cambia mientras la pestaña viva. Si algún día esta
// vista se montara dentro de la app, el origen tendría que pasar por props.
// ============================================================================

const BASE = '/api/cee-envolvente';

export const ORIGEN = (() => {
    try {
        //: `origen=cee`, y NO `?cee=`: ese otro parámetro ya significa «abre este
        //: CEE directo» en el dashboard y lleva un id dentro. Dos cosas distintas
        //: con el mismo nombre acaban leyéndose la una por la otra.
        return new URLSearchParams(window.location.search).get('origen') === 'cee'
            ? 'cee' : 'cae';
    } catch {
        return 'cae';
    }
})();

/** ¿Esta ventana está sobre un CEE contratado suelto? */
export const esCeeDirecto = ORIGEN === 'cee';

/**
 * La URL de una ruta de la envolvente, con el origen puesto.
 *
 * `api(id)` → `/api/cee-envolvente/<id>`
 * `api(id, 'fotos', { clave })` → `…/<id>/fotos?clave=FBS3&origen=cee`
 */
export function api(id, ruta = '', params = null) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params || {})) {
        if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    }
    if (ORIGEN === 'cee') qs.set('origen', ORIGEN);
    const cola = qs.toString();
    return `${BASE}/${id}${ruta ? `/${ruta}` : ''}${cola ? `?${cola}` : ''}`;
}

/** Lo que hay que añadir al CUERPO de un POST/PUT para que el backend lo sepa. */
export const cuerpoOrigen = ORIGEN === 'cee' ? { origen: ORIGEN } : {};

export default api;
