// Lista los nº de serie (caldera que se retira, aerotermia que se pone) que
// constan en MÁS DE UN expediente, y los que en un mismo expediente son a la vez
// de la caldera y de la aerotermia. SOLO LEE.
//   node implementation/backend/scripts/auditar_series_repetidas.js
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { cargarSeriesDeExpedientes } = require('../services/seriesRepetidas');
const { seriesCruzadasEnExpediente } = require('../utils/seriesEquipos');

(async () => {
    const exps = await cargarSeriesDeExpedientes();
    const porSerie = new Map();
    for (const e of exps) {
        for (const s of e.series) {
            if (!porSerie.has(s.norm)) porSerie.set(s.norm, []);
            porSerie.get(s.norm).push(`${e.numero_expediente} (${s.etiqueta}${e.estado ? ` · ${e.estado}` : ''})`);
        }
    }
    const repetidas = [...porSerie.entries()]
        .filter(([, en]) => new Set(en.map(x => x.split(' ')[0])).size > 1);
    console.log(`${exps.length} expedientes · ${porSerie.size} series distintas`);
    console.log(`\nRepetidas entre expedientes: ${repetidas.length}`);
    for (const [norm, en] of repetidas) console.log(`  ${norm}\n    ${en.join('\n    ')}`);

    const cruzadas = exps.flatMap(e => seriesCruzadasEnExpediente(e.series)
        .map(c => `${e.numero_expediente}: ${c.serie} (${c.etiquetas.join(' = ')})`));
    console.log(`\nCaldera = aerotermia dentro del mismo expediente: ${cruzadas.length}`);
    for (const c of cruzadas) console.log(`  ${c}`);
})().catch(err => { console.error(err.message || err); process.exit(1); });
