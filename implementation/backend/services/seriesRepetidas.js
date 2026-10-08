// ============================================================================
// seriesRepetidas.js — ¿este nº de serie ya consta en OTRO expediente?
//
// Lee de TODOS los expedientes solo los nodos de la instalación que llevan una
// serie (regla 22: nunca la `instalacion` entera en un listado) y los cruza con
// `utils/seriesEquipos.js`. Avisa, no bloquea: lo decide una persona.
// ============================================================================

const supabase = require('./supabaseClient');
const { seriesDeInstalacion, seriesCruzadasEnExpediente, cruzarSeries } = require('../utils/seriesEquipos');

const SELECT = [
    'id', 'numero_expediente', 'estado',
    'caldera_antigua_cal:instalacion->caldera_antigua_cal',
    'caldera_antigua_acs:instalacion->caldera_antigua_acs',
    'misma_caldera_acs:instalacion->misma_caldera_acs',
    'aerotermia_cal:instalacion->aerotermia_cal',
    'aerotermia_acs:instalacion->aerotermia_acs',
    'piscina:instalacion->piscina',
].join(', ');

const PAGINA = 1000;

/** Todos los expedientes con sus series. Lanza si la BD falla: con la BD caída no se dice «no hay duplicados» (regla 38). */
async function cargarSeriesDeExpedientes() {
    const filas = [];
    for (let desde = 0; ; desde += PAGINA) {
        const { data, error } = await supabase.from('expedientes').select(SELECT)
            .order('id', { ascending: true }).range(desde, desde + PAGINA - 1);
        if (error) throw error;
        filas.push(...(data || []));
        if (!data || data.length < PAGINA) break;
    }
    return filas.map(f => ({
        id: f.id, numero_expediente: f.numero_expediente, estado: f.estado,
        series: seriesDeInstalacion(f),
    }));
}

/**
 * @param {object} instalacion — la del expediente TAL COMO ESTÁ EN PANTALLA (aún sin guardar)
 * @param {string} excluirId   — el propio expediente
 */
async function buscarSeriesRepetidas(instalacion, excluirId) {
    const propias = seriesDeInstalacion(instalacion);
    if (!propias.length) return { repetidas: [], cruzadas: [] };
    const otros = await cargarSeriesDeExpedientes();
    return {
        repetidas: cruzarSeries(propias, otros, excluirId),
        cruzadas: seriesCruzadasEnExpediente(propias),
    };
}

module.exports = { buscarSeriesRepetidas, cargarSeriesDeExpedientes };
