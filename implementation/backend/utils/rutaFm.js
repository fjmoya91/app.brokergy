'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// Elegir (o quitar) la VÍA del FACTOR MULTIPLICADOR de una OPORTUNIDAD:
// `inputs.ruta_fm`, regla 200. Fuente única del conmutador de la calculadora
// (`POST /api/oportunidades/:id/ruta-fm`) y del script (`alta_oportunidad.js`,
// plan `ruta_fm` y orden `recalcular --ruta-fm`), para que lo hecho desde
// aquí quede exactamente igual que pulsado en la app.
//
// REGLA — se vuelve a calcular en el servidor la elegibilidad sobre la simulación
// GUARDADA (`viaFmDe`) y no se activa si ya hay expediente, si no hay cálculo FM,
// si no aplica o si no es elegible. Se escribe con la RPC `oportunidad_merge_inputs`
// y se anota en el historial.
// ─────────────────────────────────────────────────────────────────────────────
const supabase = require('../services/supabaseClient');
const { viaFmDe } = require('./viaFmAlGuardar');

class RutaFmError extends Error {
    constructor(status, message) { super(message); this.status = status; }
}

async function anotar(oportunidadUuid, texto, usuario) {
    const { data } = await supabase.from('oportunidades').select('datos_calculo').eq('id', oportunidadUuid).maybeSingle();
    const dc = data?.datos_calculo || {};
    const hist = Array.isArray(dc.historial) ? dc.historial : [];
    hist.push({ id: `${Date.now()}_ruta_fm`, tipo: 'comentario', texto, fecha: new Date().toISOString(), usuario: usuario || 'Sistema' });
    await supabase.from('oportunidades').update({ datos_calculo: { ...dc, historial: hist } }).eq('id', oportunidadUuid);
}

/**
 * @param {string} id        uuid o nº de oportunidad (26RES060_OP387)
 * @param {boolean} activar
 * @param {object} [o]  `usuario` (historial), `escribir` (sin él solo comprueba)
 * @returns {{ ruta_fm, antes, cambia, ficha?, acs?, op }}
 * @throws {RutaFmError} con `status` (404, 409, 503) y el motivo
 */
async function cambiarRutaFm(id, activar, { usuario = null, escribir = true } = {}) {
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const q = supabase.from('oportunidades').select('id, id_oportunidad, datos_calculo');
    const { data: op, error } = await (UUID_RE.test(String(id)) ? q.eq('id', id) : q.eq('id_oportunidad', id))
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (error) throw new RutaFmError(503, 'No se ha podido leer la oportunidad.');
    if (!op) throw new RutaFmError(404, 'Oportunidad no encontrada.');

    const { data: exp, error: eErr } = await supabase
        .from('expedientes').select('numero_expediente').eq('oportunidad_id', op.id).maybeSingle();
    if (eErr) throw new RutaFmError(503, 'No se ha podido comprobar si ya es expediente.');
    if (exp) {
        throw new RutaFmError(409, `Ya es el expediente ${exp.numero_expediente}: la vía se cambia en su pestaña «Vía FM», que le da el número de la otra serie.`);
    }

    const antes = op.datos_calculo?.inputs?.ruta_fm === true;
    let via = null;
    if (activar) {
        via = await viaFmDe(op.datos_calculo);
        if (!via) throw new RutaFmError(409, 'La simulación guardada no tiene cálculo de la vía FM (faltan la superficie o la demanda). Guárdala y vuelve a probar.');
        if (via.aplica === false) throw new RutaFmError(409, `No aplica: ${via.no_aplica}.`);
        if (via.elegible === false) throw new RutaFmError(409, `No es elegible: ${via.motivo || 'ver los avisos de la vía FM'}`);
    }
    const cambia = antes !== activar;
    if (cambia && escribir) {
        const { error: mErr } = await supabase.rpc('oportunidad_merge_inputs', { p_id: op.id, p_patch: { ruta_fm: activar } });
        if (mErr) throw new RutaFmError(503, 'No se ha podido guardar la vía.');
        try {
            await anotar(op.id, activar
                ? `Vía del FACTOR MULTIPLICADOR elegida (${via?.ficha || 'FM'})${via?.acs ? ' — falta añadir el ACS al presupuesto' : ''}: al aceptar, el expediente se numera en su serie (…FM_N).`
                : 'Vuelve a la ficha VIGENTE: al aceptar, el expediente se numera en su serie de siempre.', usuario);
        } catch (e) { /* la línea del historial no puede tumbar el cambio */ }
    }
    return { ruta_fm: activar, antes, cambia, op: { id: op.id, id_oportunidad: op.id_oportunidad },
             ...(via ? { ficha: via.ficha, acs: via.acs || null } : {}) };
}

module.exports = { cambiarRutaFm, RutaFmError };
