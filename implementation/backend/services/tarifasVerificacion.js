// ─────────────────────────────────────────────────────────────────────────────
// TARIFAS DE VERIFICACIÓN — persistencia por verificador.
//
// Qué cobra cada verificador según el nº de actuaciones que van juntas. Es la
// referencia ORIENTATIVA contra la que se compara luego su oferta y su factura
// (que es lo que de verdad se paga y vive en `lotes.coste_verificacion`).
//
// Se guarda en `app_settings` con la clave `tarifas_verificacion:{id}`, el MISMO
// patrón que las tarifas del certificador (`certificadorFacturacion`): no hace
// falta migración de esquema y el dato es un acuerdo comercial, no una columna
// de la ficha.
//
// La NORMALIZACIÓN no se escribe aquí: es la del módulo puro del frontend, que
// también aplica la pantalla. Con dos copias, una tabla tecleada desordenada se
// guardaría de una forma y se leería de otra.
// ─────────────────────────────────────────────────────────────────────────────

const path = require('path');
const { pathToFileURL } = require('url');
const supabase = require('./supabaseClient');

let _logicaPromise = null;
function loadLogica() {
    if (!_logicaPromise) {
        const url = pathToFileURL(path.join(__dirname, '../../frontend/src/features/lotes/logic/tarifasVerificacion.js')).href;
        _logicaPromise = import(url);
    }
    return _logicaPromise;
}

const settingsKey = (verificadorId) => `tarifas_verificacion:${verificadorId}`;

const VACIO = { tarifas: [], actualizada_at: null, actualizada_por: null };

async function getTarifas(verificadorId) {
    if (!verificadorId) return { ...VACIO };
    const { data, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', settingsKey(verificadorId))
        .maybeSingle();

    // Un fallo de lectura NO puede contestar "no tiene tarifas": eso se lee como
    // un dato ("este verificador no ha pasado precios") y es mentira. Sube.
    if (error) throw new Error(error.message);
    if (!data?.value) return { ...VACIO };

    const { normalizarTarifas } = await loadLogica();
    try {
        return normalizarTarifas(JSON.parse(data.value));
    } catch {
        return { ...VACIO };
    }
}

/**
 * Guarda la lista completa de tarifas de un verificador.
 *
 * Se escribe ENTERA, no por tarifa: la pantalla edita la tabla que tiene
 * delante, y un merge por id dejaría vivas las que alguien acaba de borrar.
 */
async function saveTarifas(verificadorId, body, quien = null) {
    if (!verificadorId) throw new Error('Falta el verificador');
    const { normalizarTarifas } = await loadLogica();

    const limpio = normalizarTarifas(body || {});
    // Una tarifa sin tramos no se guarda (la normalización ya la descarta), pero
    // mandar una lista entera vacía cuando se envió algo casi siempre es un fallo
    // de tecleo —importes en blanco— y no la intención de borrarlo todo.
    const enviadas = Array.isArray(body?.tarifas) ? body.tarifas.length : 0;
    if (enviadas > 0 && limpio.tarifas.length === 0) {
        throw new Error('Ninguna tarifa tiene tramos válidos: cada tramo necesita nº de actuaciones e importe.');
    }

    const value = {
        tarifas: limpio.tarifas,
        actualizada_at: new Date().toISOString(),
        actualizada_por: quien || null,
    };

    const { error } = await supabase.from('app_settings').upsert(
        { key: settingsKey(verificadorId), value: JSON.stringify(value), updated_at: new Date().toISOString() },
        { onConflict: 'key' }
    );
    if (error) throw new Error(error.message);
    return value;
}

module.exports = { getTarifas, saveTarifas, settingsKey };
