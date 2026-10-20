// ============================================================================
// comparar.mjs — lo que ha dejado el agente frente al CEE inicial del TÉCNICO.
//
// El del agente: el XML que CE3X 3.2 saca de su copia local (`aplicar
// --calificar`, en la caché de la pasada), leído con el MISMO lector de la app
// (`services/cee/xmlCeeV30.js`). El del técnico: `cee.cee_inicial` de la BD,
// que es lo que la app leyó de su XML al cargarlo. Solo LECTURA.
//
// Ojo al leerlo: muchos de los del técnico son de CE3X 2.3 y de antes de la
// Guía de transmitancias del 08/10/2026, así que la DEMANDA y la LETRA pueden
// diferir por criterio, no por error. Lo que mide al agente es la GEOMETRÍA:
// superficie, y huecos (cuántos y cuántos m² por orientación).
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { BACK } from './herramientas.mjs';

const require = createRequire(import.meta.url);
require(require.resolve('dotenv', { paths: [BACK] })).config({ path: path.join(BACK, '.env'), quiet: true });

let _sb = null;
const sb = () => (_sb ||= require(path.join(BACK, 'services', 'supabaseClient')));
const { leerXmlCeeV30 } = require(path.join(BACK, 'services', 'cee', 'xmlCeeV30'));

const ORI = s => String(s || '?').toUpperCase().replace(/[^A-Z]/g, '') || '?';
const r2 = n => (n === null || n === undefined || Number.isNaN(n) ? null : Math.round(n * 100) / 100);
const dif = (a, b) => (a == null || b == null || !b ? null : r2(((a - b) / b) * 100));

function porOrientacion(huecos) {
    const out = {};
    for (const h of huecos || []) {
        const k = ORI(h.orientacion);
        out[k] = r2((out[k] || 0) + (Number(h.superficie) || 0));
    }
    return out;
}

/** El XML del agente: el `… CEE INICIAL_REVISAR.xml` de la caché de la pasada. */
export function xmlDelAgente(dirPasada) {
    const cache = path.join(dirPasada, 'tmp', 'brokergy-cee-inicial');
    if (!fs.existsSync(cache)) return null;
    const xs = fs.readdirSync(cache).filter(f => /CEE INICIAL_REVISAR\.xml$/i.test(f));
    if (!xs.length) return null;
    const f = xs.map(n => path.join(cache, n)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
    // La codificación la dice su cabecera (`encoding="…"`); sin ella, UTF-8.
    const buf = fs.readFileSync(f);
    const enc = /encoding="([^"]+)"/i.exec(buf.subarray(0, 200).toString('latin1'))?.[1] || 'utf-8';
    return { ruta: f, texto: new TextDecoder(/8859|latin/i.test(enc) ? 'latin1' : 'utf-8').decode(buf) };
}

export async function ceeDelTecnico(clave) {
    const { data, error } = await sb().from('expedientes').select('cee->cee_inicial').eq('numero_expediente', clave).maybeSingle();
    if (error) throw new Error(`BD: ${error.message}`);
    return data?.cee_inicial || null;
}

export async function compararPasada(dirPasada, clave) {
    const gt = await ceeDelTecnico(clave);
    const x = xmlDelAgente(dirPasada);
    if (!x) return { clave, agente: null, motivo: 'el agente no dejó XML calificado' };
    let a;
    try { a = leerXmlCeeV30(x.texto); } catch (e) { return { clave, agente: null, motivo: `XML ilegible: ${e.message}` }; }
    const huecosA = (a.envolvente?.huecos || []).filter(h => String(h.tipo || 'hueco').toLowerCase() === 'hueco');
    const huecosT = gt?.huecos || [];
    const sumA = r2(huecosA.reduce((s, h) => s + (Number(h.superficie) || 0), 0));
    const sumT = r2(huecosT.reduce((s, h) => s + (Number(h.superficie) || 0), 0));
    const fila = {
        clave,
        xml: x.ruta,
        superficie: { agente: r2(a.superficieUtil), tecnico: r2(gt?.superficieHabitable), dif_pct: dif(a.superficieUtil, gt?.superficieHabitable) },
        huecos_n: { agente: huecosA.length, tecnico: huecosT.length },
        huecos_m2: { agente: sumA, tecnico: sumT, dif_pct: dif(sumA, sumT) },
        huecos_por_orientacion: { agente: porOrientacion(huecosA), tecnico: porOrientacion(huecosT) },
        demanda_cal: { agente: r2(a.demanda?.cal), tecnico: r2(gt?.demandaCalefaccion), dif_pct: dif(a.demanda?.cal, gt?.demandaCalefaccion) },
        demanda_acs: { agente: r2(a.demanda?.acs), tecnico: r2(gt?.demandaACS), dif_pct: dif(a.demanda?.acs, gt?.demandaACS) },
        epnr: { agente: r2(a.epnr?.tot), tecnico: r2(gt?.epnrConsumo), dif_pct: dif(a.epnr?.tot, gt?.epnrConsumo) },
        letra_emisiones: { agente: a.calificacion?.emisiones || null, tecnico: gt?.emisionesLetra || null },
        letra_epnr: { agente: a.calificacion?.epnr || null, tecnico: gt?.epnrLetra || null },
        medidas: (a.medidas || []).map(m => m.nombre),
    };
    return fila;
}

/** Una línea legible por pasada, para la tabla del final. */
export function lineaComparacion(c) {
    if (!c?.superficie) return `${c?.clave}: — (${c?.motivo || 'sin datos'})`;
    const p = v => (v == null ? '—' : `${v > 0 ? '+' : ''}${v}%`);
    return [
        `sup ${c.superficie.agente}/${c.superficie.tecnico} (${p(c.superficie.dif_pct)})`,
        `huecos ${c.huecos_n.agente}/${c.huecos_n.tecnico} · ${c.huecos_m2.agente}/${c.huecos_m2.tecnico} m² (${p(c.huecos_m2.dif_pct)})`,
        `dem.cal ${c.demanda_cal.agente}/${c.demanda_cal.tecnico} (${p(c.demanda_cal.dif_pct)})`,
        `letra ${c.letra_emisiones.agente}/${c.letra_emisiones.tecnico}`,
        `medidas ${c.medidas.length}`,
    ].join(' · ');
}
