// ============================================================================
// seriesEquipos.js — los Nº DE SERIE de un expediente, para AVISAR de duplicados.
//
// Un nº de serie identifica UNA máquina. La caldera que se retira y la bomba de
// calor que se pone solo pueden justificar UN ahorro: si su serie ya consta en
// otro expediente, o se ha copiado mal (OCR, plantilla, copiar-pegar) o se está
// presentando dos veces la misma actuación. No se bloquea —puede haber una
// explicación (un expediente RECHAZADO que se rehace)—, se AVISA.
//
// Fuente única de: qué campos son nº de serie, cómo se comparan (`normSerie`) y
// qué valores no son un nº de serie aunque estén escritos («NO LEGIBLE»: medido
// el 08/10/2026, 25 expedientes lo tienen en la caldera y casarían entre sí).
// La usan la ruta `POST /:id/series-repetidas` y `scripts/auditar_series_repetidas.js`.
// ============================================================================

const sinTildes = (s) => String(s ?? '').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Solo letras y dígitos: «IN2601309004-053» y «IN 2601309004 053» son la misma serie. */
const normSerie = (s) => sinTildes(s).replace(/[^A-Z0-9]/g, '');

// Lo que se escribe en la casilla cuando NO hay serie. Se busca DENTRO del valor
// normalizado («NO LEGIBLE (PLACA QUEMADA)» también vale): ninguna serie real
// contiene estas palabras.
const MARCADORES_SIN_SERIE = /LEGIBLE|NOSEVE|NOVISIBLE|SINPLACA|SINSERIE|SINNUMERO|SINDATO|NOPROCEDE|NOCONSTA|NOAPLICA|NOTIENE|DESCONOCID|PENDIENTE|BORRAD/;

/**
 * ¿Se puede comparar como nº de serie? Fuera: vacíos, menos de 4 caracteres
 * («N/A», «S/N», «-»), un mismo carácter repetido («0000», «XXXXXX») y los
 * marcadores de «no hay serie».
 */
function esSerieComparable(serie) {
    const n = normSerie(serie);
    if (n.length < 4) return false;
    if (/^(.)\1+$/.test(n)) return false;
    return !MARCADORES_SIN_SERIE.test(n);
}

const serieDe = (u) => String(u?.numero_serie || u?.n_serie_ext || '').trim();

/** ¿La columna de calefacción declara «sin generador»? Mismo criterio que `materialCee.js` (regla 8.d). */
const sinGenerador = (cal) =>
    cal?.rendimiento_id === 'sin_calefaccion'
    || String(cal?.tipo_equipo || '').trim().toUpperCase() === 'NO TIENE CALEFACCIÓN';

/**
 * Todos los nº de serie comparables de una `instalacion`, con su papel.
 * `grupo` separa lo que se RETIRA (caldera) de lo que se PONE (aerotermia): una
 * misma serie en los dos grupos del mismo expediente es un dato cruzado.
 * @returns {Array<{ rol, grupo: 'existente'|'nuevo', etiqueta, serie, norm }>}
 */
function seriesDeInstalacion(inst) {
    const out = [];
    const add = (rol, grupo, etiqueta, serie) => {
        const s = String(serie ?? '').trim();
        if (esSerieComparable(s)) out.push({ rol, grupo, etiqueta, serie: s, norm: normSerie(s) });
    };
    if (!inst || typeof inst !== 'object') return out;

    const cal = inst.caldera_antigua_cal;
    if (cal && !sinGenerador(cal)) add('caldera_cal', 'existente', 'Caldera existente', serieDe(cal));
    // Con `misma_caldera_acs` el nodo de ACS es un resto: lo que vale es la de calefacción.
    if (inst.misma_caldera_acs === false) {
        add('caldera_acs', 'existente', 'Equipo existente de ACS', serieDe(inst.caldera_antigua_acs));
    }

    const unidades = (aero, rol, etiqueta) => {
        if (!aero || typeof aero !== 'object') return;
        const extras = Array.isArray(aero.equipos_extra) ? aero.equipos_extra : [];
        const cascada = extras.some(u => serieDe(u));
        add(rol, 'nuevo', cascada ? `${etiqueta} · Ud. 1` : etiqueta, serieDe(aero));
        add(`${rol}_int`, 'nuevo', `${etiqueta} · ud. interior`, aero.numero_serie_ud_interior);
        extras.forEach((u, i) => add(`${rol}_ud${i + 2}`, 'nuevo', `${etiqueta} · Ud. ${i + 2}`, serieDe(u)));
    };
    unidades(inst.aerotermia_cal, 'aerotermia_cal', 'Aerotermia nueva');
    // El nodo de ACS puede ser un CLON del de calefacción (regla 49): su serie se
    // repite a propósito y se junta abajo por `norm`, no se avisa.
    unidades(inst.aerotermia_acs, 'aerotermia_acs', 'Equipo nuevo de ACS');
    if (inst.piscina?.activa) add('piscina', 'nuevo', 'Equipo de piscina', serieDe(inst.piscina?.equipo));

    // Una serie que sale en dos papeles del MISMO grupo (el clon de ACS, la
    // ud. interior de un monobloc, que es la misma) es una sola máquina.
    const vistos = new Map();
    for (const s of out) {
        const k = `${s.grupo}|${s.norm}`;
        if (!vistos.has(k)) vistos.set(k, s);
    }
    return [...vistos.values()];
}

/**
 * Dentro de UN expediente: una serie que es a la vez de lo que se retira y de lo
 * que se pone. Casi siempre el lector de placas o una copia la ha cruzado.
 */
function seriesCruzadasEnExpediente(series) {
    const existentes = new Map(series.filter(s => s.grupo === 'existente').map(s => [s.norm, s]));
    return series
        .filter(s => s.grupo === 'nuevo' && existentes.has(s.norm))
        .map(s => ({ serie: s.serie, norm: s.norm, etiquetas: [existentes.get(s.norm).etiqueta, s.etiqueta] }));
}

/**
 * Cruza las series de un expediente con las de los demás.
 * @param {Array} propias  — `seriesDeInstalacion(...)` del expediente que se mira
 * @param {Array<{ id, numero_expediente, estado, series }>} otros
 * @param {string} [excluirId] — el propio expediente
 * @returns {Array<{ serie, norm, etiqueta, en: Array<{ id, numero_expediente, estado, etiquetas }> }>}
 */
function cruzarSeries(propias, otros, excluirId = null) {
    const indice = new Map();
    for (const o of otros) {
        if (excluirId && String(o.id) === String(excluirId)) continue;
        for (const s of o.series || []) {
            if (!indice.has(s.norm)) indice.set(s.norm, new Map());
            const porExp = indice.get(s.norm);
            if (!porExp.has(o.id)) porExp.set(o.id, { id: o.id, numero_expediente: o.numero_expediente, estado: o.estado || null, etiquetas: [] });
            const e = porExp.get(o.id);
            if (!e.etiquetas.includes(s.etiqueta)) e.etiquetas.push(s.etiqueta);
        }
    }
    const res = [];
    const hechas = new Set();
    for (const s of propias) {
        if (hechas.has(s.norm) || !indice.has(s.norm)) continue;
        hechas.add(s.norm);
        const etiquetas = propias.filter(p => p.norm === s.norm).map(p => p.etiqueta);
        res.push({
            serie: s.serie, norm: s.norm, etiqueta: etiquetas.join(' / '),
            en: [...indice.get(s.norm).values()]
                .sort((a, b) => String(a.numero_expediente).localeCompare(String(b.numero_expediente), 'es', { numeric: true })),
        });
    }
    return res;
}

module.exports = { normSerie, esSerieComparable, seriesDeInstalacion, seriesCruzadasEnExpediente, cruzarSeries };
