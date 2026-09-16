/**
 * Utilidad para normalizar datos antes de persistirlos en la BD.
 * Reglas:
 * 1. Todos los strings pasan a MAYÚSCULAS.
 * 2. Si la clave es 'email', pasa a minúsculas.
 * 3. Se eliminan espacios en blanco extra (trim).
 */
// `tipo_equipo_nuevo` va aquí por el mismo motivo que `tipo_emisor` / `metodo_scop`:
// son ENUMS en minúscula que la app compara con === ('termo_electrico'). Subirlos a
// MAYÚSCULAS los rompe (los lectores caían al valor por defecto).
// `fotovoltaica` va aquí por lo mismo: su `estado` es un enum en minúscula
// ('si' | 'futuro' | 'no') que la app compara con ===. Blacklistear la clave del
// objeto protege el sub-árbol entero de una vez.
// `envolvente` (cee.envolvente) igual, y ahí llegó a REVENTAR la pantalla: sus
// huecos llevan `tipo: 'ventana'` y `estado: 'medido'`, y en MAYÚSCULAS
// `POR_DEFECTO['VENTANA']` es undefined — duplicar un hueco tumbaba la ventana
// entera de la envolvente. Lo escribe una RPC que NO normaliza, pero el detalle
// del expediente reenvía `cee` completa al autoguardar y se lo llevaba por
// delante. Medido en 26RES060_186.
//
// `subvenciones` (documentacion.subvenciones) va aquí por lo MISMO, y costaba un
// dato que el titular firma: los ids del bono social son enums en minúscula
// ('electrico_vulnerable') y `leerSubvenciones` descarta lo que no case EXACTO,
// así que se marcaba el bono, se guardaba como 'ELECTRICO_VULNERABLE' y al releer
// desaparecía — el Anexo I imprimía «Ninguno de los anteriores». Medido en
// 26RES060_165, que lo tenía guardado en MAYÚSCULAS. Lo mismo con
// `fondo_nacional`, que se compara con === 'si' y viaja al verificador en la
// solicitud (`SE_fondo_nacional`): en MAYÚSCULAS se le declaraba 'no'.
//
// `placa_ocr` / `placas_ocr` son la HUELLA de lo que leyó el lector de placas:
// qué se transcribió, de qué fotos y qué campos se escribieron. Sus claves son
// técnicas (`caldera.marca`) y el popup las traduce a un rótulo buscándolas en
// un mapa, así que en MAYÚSCULAS (`CALDERA.MARCA`) dejaba de encontrarlas — y de
// paso convertía la línea literal de la placa, que es la EVIDENCIA, en algo que
// ya no es lo que pone la etiqueta. Medido en 26RES060_167.
const BLACKLIST = ['id', 'id_oportunidad', 'id_cliente', 'password', 'token', 'reformaType', 'method', 'type', 'icon', 'link', 'url', 'ficha', 'tipo_emisor', 'tipo_equipo_nuevo', 'metodo_scop', 'hibridacion_metodo', 'rendimiento_id', 'comb_', 'datos_calculo', 'fotovoltaica', 'envolvente', 'placa_ocr', 'placas_ocr', 'subvenciones'];

function normalizeData(obj) {
    if (!obj || typeof obj !== 'object') return obj;

    const normalized = Array.isArray(obj) ? [] : {};

    for (const key in obj) {
        let value = obj[key];

        if (BLACKLIST.some(b => key.toLowerCase().includes(b.toLowerCase()))) {
            normalized[key] = value;
            continue;
        }

        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (key.toLowerCase().includes('email')) {
                normalized[key] = trimmed.toLowerCase();
            } else if (/^https?:\/\//i.test(trimmed) || /^data:/i.test(trimmed)) {
                // URLs y data-URIs nunca se normalizan: son case-sensitive.
                //  · URLs: los IDs/tokens del path (p. ej. Drive fileIds:
                //    /file/d/1Tq6-tZiUj... ≠ /file/d/1TQ6-TZIUJ...).
                //  · data:...;base64,... : el payload base64 es case-sensitive;
                //    subirlo a MAYÚSCULAS corrompe la imagen (bug fotos del Anexo
                //    Fotográfico que dejaban de renderizar). Ver photo_attachments.
                normalized[key] = trimmed;
            } else {
                normalized[key] = trimmed.toUpperCase();
            }
        } else if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
            normalized[key] = normalizeData(value);
        } else {
            normalized[key] = value;
        }
    }

    return normalized;
}


// ---------------------------------------------------------------------------
// TABLA `clientes` — normalización EXPLÍCITA, campo a campo
// ---------------------------------------------------------------------------
// Por qué no basta con `normalizeData` (2026-09-15):
//
//  a) `apellidos` NUNCA se normalizaba. La BLACKLIST lleva 'id' y se compara con
//     `includes`, así que "apellIDos" —y `representante_apellidos`— casaban y
//     quedaban exentos. No se puede arreglar ahí: cambiar 'id' a comparación
//     exacta dejaría de proteger `driveId`, `cliente_id` o `aerotermia_db_id`, y
//     un fileId de Drive en MAYÚSCULAS rompe el enlace (ver la nota de las URLs).
//
//  b) Las escrituras PÚBLICAS a `clientes` no pasaban por `normalizeData`: el
//     funnel de captación (`leadService`), el formulario de aceptación de la
//     propuesta, el de cobro y el de datos de los anexos. Por ahí entraba el
//     nombre tal y como lo teclea el cliente, así que la base se volvía a
//     ensuciar sola con cada lead nuevo (medido: 72 de 379 fichas).
//
// REGLA — se normaliza el OBJETO QUE VA A LA BD, justo antes del insert/update,
// nunca el body de la petición: así da igual por qué ruta se entre, y una ruta
// nueva que escriba en `clientes` solo tiene que llamar aquí.
const CLIENTE_MAYUSCULAS = [
    'nombre_razon_social', 'apellidos',
    'representante_nombre', 'representante_apellidos', 'representante_dni',
    'persona_contacto_nombre',
    'dni', 'direccion', 'municipio', 'provincia', 'ccaa', 'codigo_postal',
    'numero_cuenta',
];
const CLIENTE_MINUSCULAS = ['email', 'persona_contacto_email'];
const CLIENTE_SOLO_TRIM = ['tlf', 'persona_contacto_tlf'];

/**
 * Deja un patch/payload de `clientes` como lo guarda la app: MAYÚSCULAS y sin
 * espacios sobrantes, con los emails en minúsculas.
 *
 * Solo toca las claves que estén PRESENTES y sean string: un `undefined` sigue
 * siendo undefined (los UPDATE parciales se construyen con `!== undefined`) y un
 * `null` sigue siendo null. Es idempotente, así que puede aplicarse encima de un
 * valor que la ruta ya hubiera limpiado por su cuenta.
 *
 * ⚠️ No convierte '' a null: `nombre_razon_social` no puede quedar nulo por un
 * campo que llegara en blanco, y esa validación es de cada ruta.
 */
function normalizeCliente(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;
    const out = { ...payload };

    for (const k of CLIENTE_MAYUSCULAS) {
        if (typeof out[k] === 'string') out[k] = out[k].trim().toUpperCase();
    }
    for (const k of CLIENTE_MINUSCULAS) {
        if (typeof out[k] === 'string') out[k] = out[k].trim().toLowerCase();
    }
    for (const k of CLIENTE_SOLO_TRIM) {
        if (typeof out[k] === 'string') out[k] = out[k].trim();
    }
    return out;
}

module.exports = { normalizeData, normalizeCliente };
