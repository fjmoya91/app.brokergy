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
// (La app de certificadores la monta en `/obra/:id/envolvente?origen=ext` y
// carga este módulo en diferido, ya con esa dirección puesta: ver
// `src/certificadores/envolvente/EnvolventeCertapp.jsx`.)
//
// REGLA — un origen DESCONOCIDO es un error, nunca 'cae' por defecto (2026-10-24,
// app de certificadores). Sin `?origen=` es el CAE de siempre (`/envolvente/:id`);
// con uno que no se conoce, `ORIGEN` es `null` y la ventana no carga nada: una
// errata en la dirección escribiría el trabajo en un expediente CAE.
// ============================================================================

const BASE = '/api/cee-envolvente';

//: Los cuatro negocios de esta ventana:
//:  · `cae` — el expediente CAE (sin `?origen=`).
//:  · `cee` — un CEE contratado suelto (`cee_directos`).
//:  · `op`  — una OPORTUNIDAD aún sin aceptar: la envolvente se empieza desde la
//:           calculadora y el trabajo pasa al expediente al aceptarla.
//:  · `ext` — la obra de un certificador EXTERNO (app de certificadores,
//:           `certapp_obras`): un CEE suelto de alcance único.
export const ORIGENES = ['cae', 'cee', 'op', 'ext'];

//: Lo que trae la dirección, tal cual. `origen=cee`, y NO `?cee=`: ese otro
//: parámetro ya significa «abre este CEE directo» en el dashboard y lleva un id
//: dentro. Dos cosas distintas con el mismo nombre acaban leyéndose la una por
//: la otra.
const PEDIDO = (() => {
    try {
        return new URLSearchParams(window.location.search).get('origen');
    } catch {
        return null;
    }
})();

export const ORIGEN = PEDIDO == null || PEDIDO === ''
    ? 'cae'
    : (ORIGENES.includes(PEDIDO) ? PEDIDO : null);

/** El `?origen=` que no se conoce (para decirlo en la pantalla), o null. */
export const ORIGEN_DESCONOCIDO = ORIGEN ? null : String(PEDIDO);

/** ¿Esta ventana está sobre un CEE contratado suelto? */
export const esCeeDirecto = ORIGEN === 'cee';

/** ¿Esta ventana está sobre una OPORTUNIDAD (todavía sin expediente)? */
export const esOportunidad = ORIGEN === 'op';

/**
 * ¿Esta ventana está sobre la obra de un certificador EXTERNO (app de
 * certificadores)? Se comporta como un CEE suelto de ALCANCE ÚNICO: sin fase
 * final y sin leer la placa (esa ruta escribe en la instalación de un expediente
 * CAE). Lo interno de BROKERGY lo decide además quién mira (`quienMira.js`).
 */
export const esExt = ORIGEN === 'ext';

/** ¿Un CEE SUELTO —sin expediente de obra detrás—? El directo y el externo. */
export const esCeeSuelto = esCeeDirecto || esExt;

//: Lo que viaja al backend. Con un origen desconocido se manda TAL CUAL para que
//: el backend lo rechace, nunca se omite: omitirlo es pedir el CAE.
const ORIGEN_AL_BACKEND = ORIGEN || ORIGEN_DESCONOCIDO;

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
    if (ORIGEN_AL_BACKEND !== 'cae') qs.set('origen', ORIGEN_AL_BACKEND);
    const cola = qs.toString();
    return `${BASE}/${id}${ruta ? `/${ruta}` : ''}${cola ? `?${cola}` : ''}`;
}

/** Lo que hay que añadir al CUERPO de un POST/PUT para que el backend lo sepa. */
export const cuerpoOrigen = ORIGEN_AL_BACKEND !== 'cae' ? { origen: ORIGEN_AL_BACKEND } : {};

export default api;
