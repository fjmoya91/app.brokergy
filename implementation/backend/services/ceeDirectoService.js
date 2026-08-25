// ─── ceeDirectoService.js ────────────────────────────────────────────────────
// Carga, guardado y reglas de negocio de los CEE contratados sueltos.
//
// Todo lo que escribe una fila de `cee_directos` pasa por aquí, y no por las
// rutas: así el sellado del estado, los timestamps del seguimiento y el historial
// no dependen de que quien escriba la ruta se acuerde de hacerlos. Es la lección
// del CAE, donde el `estado` lo escriben seis sitios distintos y hubo que
// inventar `avanzarEstado()` para que ninguno lo hiciera retroceder.

const crypto = require('crypto');
const supabase = require('./supabaseClient');
const { applyStatus } = require('./seguimientoTracking');
const estados = require('../utils/ceeDirectoEstados');
const ceeDirectoFolders = require('./ceeDirectoFolders');

const TABLA = 'cee_directos';

// Columnas del listado. NUNCA se piden `cee` ni `documentacion` enteros sobre
// muchas filas (regla 22): el XML de un CEE son megas y Postgres descomprime la
// columna JSONB ENTERA en cuanto la consulta la toca, aunque solo pida un
// subcampo. Del JSONB solo viajan los cuatro escalares que pinta la tabla.
const SELECT_LISTA = `
    id, numero_expediente, anio, correlativo, nombre, alcance, estado, origen,
    cliente_id, prescriptor_id, direccion, municipio, provincia, ccaa,
    drive_folder_link, cobrado, cobrado_at, created_at, updated_at,
    duplicado_historico,
    seguimiento,
    cee_certificador:cee->>certificador_id,
    cee_fecha_visita_ini:cee->cee_inicial->>fechaVisita,
    cee_fecha_firma_ini:cee->cee_inicial->>fechaFirma
`.replace(/\s+/g, ' ').trim();

/** Formato del número: `{AAAA}CEE_{n}`. Año a CUATRO dígitos — no es el del CAE. */
function formatNumero(anio, correlativo) {
    return `${anio}CEE_${correlativo}`;
}

/**
 * Siguiente número libre. El correlativo es GLOBAL: no se reinicia en enero
 * (2025CEE_44 → 2026CEE_45), solo cambia el prefijo del año.
 * El bloqueo de tabla vive en la RPC, no aquí: dos altas a la vez leyendo
 * `MAX+1` desde Node sacarían el mismo número.
 */
async function siguienteNumero(anio) {
    const year = anio || new Date().getFullYear();
    const { data, error } = await supabase.rpc('cee_directo_siguiente_correlativo');
    if (error) throw new Error(`No se pudo calcular el siguiente número: ${error.message}`);
    const correlativo = data;
    return { anio: year, correlativo, numero: formatNumero(year, correlativo) };
}

/**
 * ¿Está ese número ya usado? Se comprueba SIEMPRE antes de un alta manual: el
 * histórico ya arrastra un `2025CEE_18` duplicado y repetirlo a partir de ahora
 * es un error, no una peculiaridad que haya que tolerar.
 */
async function numeroEnUso(numero) {
    const { data } = await supabase
        .from(TABLA)
        .select('id, nombre')
        .eq('numero_expediente', numero)
        .limit(1);
    return data && data.length ? data[0] : null;
}

/** Token del enlace del cliente. 32 hex, como `upload_token` en el CAE. */
function nuevoPortalToken() {
    return crypto.randomBytes(16).toString('hex');
}

/**
 * Carga una fila por UUID o por número de expediente.
 * Aceptar el número es lo que permite que un enlace de un mensaje viejo
 * (`.../2026CEE_55`) siga abriendo el expediente correcto.
 */
async function cargar(idOrNumero, { conRelaciones = true } = {}) {
    let { data: row } = await supabase.from(TABLA).select('*').eq('id', idOrNumero).maybeSingle();
    if (!row) {
        const { data: byNum } = await supabase.from(TABLA).select('*')
            .eq('numero_expediente', idOrNumero).maybeSingle();
        row = byNum;
    }
    if (!row) return null;
    if (!conRelaciones) return row;

    const [{ data: cliente }, { data: prescriptor }, { data: certificador }] = await Promise.all([
        row.cliente_id
            ? supabase.from('clientes').select('*').eq('id_cliente', row.cliente_id).maybeSingle()
            : Promise.resolve({ data: null }),
        row.prescriptor_id
            // OJO: `prescriptores` NO tiene columna `telefono` — es `tlf`. Pedirla
            // hacía fallar el select ENTERO y el partner llegaba como null, así que
            // la ficha decía "Directo" en un expediente que sí lo tenía.
            // `*` y no una lista: la tabla no guarda blobs y así no se vuelve a
            // romper por pedir un campo que no existe.
            ? supabase.from('prescriptores').select('*').eq('id_empresa', row.prescriptor_id).maybeSingle()
            : Promise.resolve({ data: null }),
        row.cee?.certificador_id
            ? supabase.from('prescriptores').select('*').eq('id_empresa', row.cee.certificador_id).maybeSingle()
            : Promise.resolve({ data: null })
    ]);

    return { ...row, cliente, prescriptor, certificador };
}

/**
 * Guarda cambios sellando lo que no debe olvidarse nunca:
 *   · los timestamps de cada transición de subestado (`applyStatus`),
 *   · el `estado` derivado de esos subestados.
 *
 * `patch.seguimiento` se FUNDE con lo guardado, no lo sustituye: el módulo CEE
 * autoguarda y manda el objeto que tenía en pantalla, que puede ir un refetch por
 * detrás. Un reemplazo perdería el subestado que acabe de sellar otra ruta.
 */
async function guardar(id, patch, { seguimientoPrev = null } = {}) {
    const actual = seguimientoPrev !== null
        ? { seguimiento: seguimientoPrev }
        : await supabase.from(TABLA).select('seguimiento, alcance, cee').eq('id', id).maybeSingle().then(r => r.data || {});

    const update = { ...patch };

    if (patch.seguimiento) {
        const prev = actual.seguimiento || {};
        const next = { ...prev, ...patch.seguimiento };
        // Sella el timestamp de cada fase que haya cambiado de verdad.
        for (const key of ['cee_inicial', 'cee_final']) {
            if (patch.seguimiento[key] && patch.seguimiento[key] !== prev[key]) {
                applyStatus(next, key, patch.seguimiento[key]);
            }
        }
        update.seguimiento = next;
    }

    // El estado NO se acepta del cliente: se deriva. Es lo que garantiza que la
    // pastilla del listado y el subestado del módulo no puedan contradecirse.
    const paraDerivar = {
        alcance: patch.alcance || actual.alcance,
        seguimiento: update.seguimiento || actual.seguimiento
    };
    update.estado = estados.deriveEstado(paraDerivar);
    update.updated_at = new Date().toISOString();
    delete update.id;
    delete update.created_at;

    const { data, error } = await supabase.from(TABLA).update(update).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    return data;
}

/**
 * Añade una entrada al historial con una sola escritura de `documentacion`.
 *
 * ⚠️ Va por la RPC de MERGE y no por un read-modify-write del objeto entero:
 * validar un CEE, sellar una fecha de registro y anotar un envío pueden caer en
 * el mismo segundo, y el último en escribir se llevaría por delante lo de los
 * otros dos (misma razón que la regla 19 en `reforma_uploads`).
 *
 * El historial se guarda en MAYÚSCULAS igual que en el CAE — hay barridos que
 * lo leen así; comparar sin normalizar la caja es el gotcha de siempre.
 */
async function anotarHistorial(id, entrada) {
    const { data: row } = await supabase.from(TABLA).select('documentacion').eq('id', id).maybeSingle();
    const doc = row?.documentacion || {};
    const historial = Array.isArray(doc.historial) ? [...doc.historial] : [];
    historial.push({ fecha: new Date().toISOString(), ...entrada });
    // jsonb_set del campo `historial` completo: es una lista, no un objeto, así
    // que el MERGE `||` de merge_cee_directo_doc_json no sirve para esto.
    const { error } = await supabase
        .from(TABLA)
        .update({ documentacion: { ...doc, historial }, updated_at: new Date().toISOString() })
        .eq('id', id);
    if (error) console.error('[cee-directo historial]', error.message);
    return historial;
}

/** Merge atómico de un objeto dentro de `documentacion` (recordatorios, sellos…). */
async function mergeDoc(id, field, value) {
    const { error } = await supabase.rpc('merge_cee_directo_doc_json', {
        p_id: id, p_field: field, p_value: value
    });
    if (error) throw new Error(error.message);
}

/** Escribe un escalar en `documentacion` sin tocar el resto. */
async function setDocField(id, field, value) {
    const { error } = await supabase.rpc('set_cee_directo_doc_field', {
        p_id: id, p_field: field, p_value: value == null ? null : String(value)
    });
    if (error) throw new Error(error.message);
}

/**
 * Cambia el alcance del encargo.
 *
 * Ampliar (ÚNICO → DOBLE) es libre: el encargo ha crecido.
 *
 * Reducir (DOBLE → ÚNICO) solo si la fase final está VIRGEN — sin subestado
 * avanzado y sin ningún fichero en su carpeta. Hace falta poder corregir un
 * alcance mal puesto (los 55 importados lo dedujeron de cómo estaba la carpeta,
 * y ahí se puede fallar), pero nunca esconder un certificado ya emitido: si hay
 * algo en la fase final, la app se niega y dice qué hay.
 *
 * La carpeta de Drive NO se toca al reducir. `2. CEE FINAL` se queda vacía: es
 * más barato ignorar una carpeta de más que borrar una que resultara tener algo.
 */
async function cambiarAlcance(id, nuevoAlcance) {
    const row = await cargar(id, { conRelaciones: false });
    if (!row) throw new Error('Expediente no encontrado');
    const destino = String(nuevoAlcance).toUpperCase() === 'DOBLE' ? 'DOBLE' : 'UNICO';
    if (destino === row.alcance) return row;

    if (destino === 'DOBLE') {
        // La carpeta se reorganiza ANTES de tocar la BD: si Drive falla, el encargo
        // sigue siendo ÚNICO y la pantalla lo dice, en vez de quedar en un estado que
        // promete una carpeta de CEE FINAL que no existe.
        await ceeDirectoFolders.asegurarSubcarpetas(row.drive_folder_id, 'DOBLE');
        return guardar(id, { alcance: 'DOBLE' });
    }

    const sub = String(row.seguimiento?.cee_final || 'PTE_ENVIO_CERT').toUpperCase();
    if (sub !== 'PTE_ENVIO_CERT') {
        throw new Error(`El CEE final ya está en marcha (${sub}). No se puede quitar del encargo.`);
    }
    if (row.drive_folder_id) {
        const uploads = require('./ceeDirectoUploadService');
        const enDrive = await uploads.scanSection(row, 'final');
        const nombres = Object.values(enDrive).map(f => f.name);
        if (nombres.length) {
            throw new Error(`La carpeta del CEE final tiene ficheros (${nombres.join(', ')}). No se puede quitar del encargo.`);
        }
    }

    // Se limpia el subestado de la fase que deja de existir: dejarlo puesto haría
    // que `deriveEstado` siguiera contando con una fase que ya no se pinta.
    const seguimiento = { ...(row.seguimiento || {}) };
    delete seguimiento.cee_final;
    delete seguimiento.cee_final_desde;
    return guardar(id, { alcance: 'UNICO', seguimiento }, { seguimientoPrev: row.seguimiento });
}

/** Compat: ampliar a doble sigue siendo la operación más común. */
const ampliarADoble = (id) => cambiarAlcance(id, 'DOBLE');

module.exports = {
    TABLA,
    SELECT_LISTA,
    formatNumero,
    siguienteNumero,
    numeroEnUso,
    nuevoPortalToken,
    cargar,
    guardar,
    anotarHistorial,
    mergeDoc,
    setDocField,
    ampliarADoble,
    cambiarAlcance
};
