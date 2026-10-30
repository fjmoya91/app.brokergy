// ─────────────────────────────────────────────────────────────────────────────
// OBLIGACIÓN del Sujeto Obligado y lo DISPONIBLE para ofrecerle — la «Vista S.O.»
// de la pestaña Lotes (28/10/2026).
//
// La obligación de cada año (cuota del Anexo II, % al Fondo, lo que ya compró a
// otros) se guarda en `app_settings` como `obligacion_so:{id}`, el mismo patrón
// que las tarifas del verificador: es un dato de negocio que nos da el S.O., no
// una columna de su ficha, y no hace falta migración.
//
// La NORMALIZACIÓN y las cuentas son las del módulo puro del frontend
// (`lotes/logic/obligacionSo.js`), importado por ESM.
// ─────────────────────────────────────────────────────────────────────────────
const path = require('path');
const { pathToFileURL } = require('url');
const supabase = require('./supabaseClient');
const { economiaDe, SELECT_EXP } = require('./economiaCae');
const { rankEstado, ESTADO_RECHAZADO } = require('../utils/expedienteEstados');

let _logica = null;
const logica = () => (_logica ||= import(pathToFileURL(path.join(__dirname, '../../frontend/src/features/lotes/logic/obligacionSo.js')).href));

const settingsKey = (soId) => `obligacion_so:${soId}`;
const error = (msg, status = 400) => Object.assign(new Error(msg), { status });

async function getObligacion(soId) {
    const { normalizarObligacion } = await logica();
    const { data, error: e } = await supabase.from('app_settings').select('value').eq('key', settingsKey(soId)).maybeSingle();
    // Un fallo de lectura no puede contestar «no tiene obligación»: se leería
    // como un dato. Sube como 503.
    if (e) throw error(`No se pudo leer la BD: ${e.message}`, 503);
    if (!data?.value) return normalizarObligacion({});
    try { return normalizarObligacion(JSON.parse(data.value)); } catch { return normalizarObligacion({}); }
}

/** Se escribe ENTERA: la pantalla edita lo que tiene delante. */
async function saveObligacion(soId, body, quien = null) {
    const { normalizarObligacion } = await logica();
    const limpio = normalizarObligacion(body || {});
    const value = { anios: limpio.anios, asignacion: limpio.asignacion, actualizada_at: new Date().toISOString(), actualizada_por: quien };
    const { error: e } = await supabase.from('app_settings').upsert(
        { key: settingsKey(soId), value: JSON.stringify(value), updated_at: new Date().toISOString() },
        { onConflict: 'key' });
    if (e) throw error(`No se pudo guardar: ${e.message}`, 503);
    return normalizarObligacion(value);
}

// Por cercanía al CAE. Lo que ya pasó por verificación SIN lote (53 FINALIZADO
// y 2 en pago el 28/10/2026) se vendió antes de la app, por otra vía: no es
// disponible.
const R = (e) => rankEstado(e);
function etapaDisponible(estado) {
    const r = R(estado);
    if (r >= R('ENVIADO A VERIFICADOR')) return null;
    if (r >= R('DOC. COMPLETA')) return 'LISTO';
    if (r >= R('PTE. CEE FINAL')) return 'CERRANDO';
    if (r === R('PTE. FIN OBRA')) return 'OBRA';
    return 'ANTES';
}

/**
 * Lo que tenemos SIN lote (y sin rechazar), por etapa, con su ahorro: el
 * verificado si lo hay y si no el estimado (el del CEE o el de la propuesta).
 * No lleva importes: solo kWh, que es lo que se le ofrece al S.O.
 */
async function disponible() {
    const { data, error: e } = await supabase.from('expedientes').select(SELECT_EXP)
        .is('lote_id', null).or(`estado.is.null,estado.neq.${ESTADO_RECHAZADO}`)
        .order('numero_expediente').limit(5000);
    if (e) throw error(`No se pudo leer la BD: ${e.message}`, 503);
    const ecos = await economiaDe(data || []);

    const etapas = {};
    for (const x of ecos) {
        const et = etapaDisponible(x.estado);
        if (!et) continue;
        const kwh = x.ahorro_verificado_kwh ?? x.ahorro_kwh ?? 0;
        const g = (etapas[et] ||= { n: 0, kwh: 0, n_sin_cifra: 0, expedientes: [] });
        g.n++;
        g.kwh += kwh;
        if (x.origen_cifra == null) g.n_sin_cifra++;
        g.expedientes.push({ numero: x.numero, ficha: x.ficha, estado: x.estado, kwh, origen: x.ahorro_verificado_kwh != null ? 'VERIFICADO' : x.origen_cifra });
    }
    for (const g of Object.values(etapas)) g.expedientes.sort((a, b) => (b.kwh || 0) - (a.kwh || 0));
    return { etapas, calculado_at: new Date().toISOString() };
}

module.exports = { getObligacion, saveObligacion, disponible, etapaDisponible, settingsKey };
