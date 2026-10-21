import { redondeaScop } from './calculation.js';
import { PROVINCE_CLIMATE_MAP } from '../data/provinceMapping.js';
import { esCalderaBiomasa } from './irpfBiomasa.js';
/**
 * ============================================================================
 * FICHAS CON FACTOR DE CORRECCIÓN (BORRADOR DGPLACE) — CAEs CON f_C
 * ============================================================================
 *
 * Borrador en consulta pública: «Propuesta de Resolución DGPLACE bombas de
 * calor» (173 págs.), que trae la RES060FC, la RES062FC y la familia
 * RES090FC…RES099FC. Aquí se calculan las dos que nos tocan:
 *
 *   RES060FC — sustitución de la caldera por bomba de calor:
 *     AE  = mín( AES ; 0,70 · CEF ) · f_C
 *     AES = (D_CAL·S)·(1/η_i − 1/SCOP_bdc) + D_ACS·(1/η_i − 1/SCOP_dhw)
 *
 *   RES090FC…RES094FC — hibridación en PARALELO, UNA FICHA POR ZONA
 *   (A3-A4 · B3-B4 · C · D1-D3 · E1), cada una con su tabla de C_b (Anexo V):
 *     AE  = mín( AES ; 0,70 · CEF_calefacción ) · f_C
 *     AES = (D_CAL·S)·(1/η_i − 1/SCOP_bdc)·C_b + D_ACS·(1/η_i − 1/SCOP_dhw)·C_b
 *
 * REGLA — el f_C se aplica UNA vez. La RES060FC escribe además un «· f_C» al
 * final de su AES (el ACS saldría multiplicado por f_C²), pero las otras once
 * fichas del MISMO borrador lo aplican una sola vez sobre el mínimo: es una
 * errata. Hasta el 21/10/2026 se respetaba el literal y el FC salía un 9 % más
 * alto en el conjunto de los expedientes.
 *
 * REGLA — la demanda es la del ANEXO IV (provincia + año de construcción +
 * tipología), no la del CEE: ese es el cambio de la ficha nueva. El CEE solo
 * entra por el TOPE, y entra por su CONSUMO de energía final (CEF), que es el del
 * CEE INICIAL: Σ <EnergiaFinalVectores> × superficie. Sin CEE se estima con la
 * demanda de la app ÷ η de la tabla, y se dice: CE3X declara las calderas viejas
 * al 25-69 %, así que el CEF real sale de mediana 1,45 veces el estimado.
 *
 * REGLA — en una HIBRIDACIÓN la ficha es la de su zona, no la RES060FC (que exige
 * retirar la caldera o dejarla en preinstalación sin hibridar), y el tope es el
 * CEF de CALEFACCIÓN, no el total.
 *
 * - η_i: la del cálculo vigente, salvo las dos filas de gas de condensación, que
 *   el Anexo II del borrador da al revés que la tabla de la ficha vigente.
 * - SCOP: los MISMOS que el cálculo vigente, para que la comparativa sea limpia.
 * - Nada de esto es firme: devuelve también los avisos de elegibilidad
 *   (`avisos`, `elegible`) para que ninguna pantalla enseñe la cifra sin ellos.
 */

// Intervalos de año de construcción del Anexo IV (columnas de las tablas)
export const RES060FC_YEARS = ['≤1940', '1941-1960', '1961-1980', '1981-2007', '2008-2012', '2013-2019', '>2019'];

// Provincias en orden INE (código 01..50; Ceuta y Melilla comparten la fila 51).
export const RES060FC_PROVINCES = ['Araba/Álava', 'Albacete', 'Alicante/Alacant', 'Almería', 'Ávila', 'Badajoz', 'Balears, Illes', 'Barcelona', 'Burgos', 'Cáceres', 'Cádiz', 'Castellón/Castelló', 'Ciudad Real', 'Córdoba', 'Coruña, A', 'Cuenca', 'Girona', 'Granada', 'Guadalajara', 'Gipuzkoa', 'Huelva', 'Huesca', 'Jaén', 'León', 'Lleida', 'Rioja, La', 'Lugo', 'Madrid', 'Málaga', 'Murcia', 'Navarra', 'Ourense', 'Asturias', 'Palencia', 'Palmas, Las', 'Pontevedra', 'Salamanca', 'Sta. C. de Tenerife', 'Cantabria', 'Segovia', 'Sevilla', 'Soria', 'Tarragona', 'Teruel', 'Toledo', 'Valencia/Valéncia', 'Valladolid', 'Bizkaia', 'Zamora', 'Zaragoza', 'Ceuta y Melilla'];

// ANEXO IV — Demanda de calefacción (kWh/m²·año). Una fila por provincia (orden
// INE de arriba), una columna por intervalo de RES060FC_YEARS. Filas a 0 = la
// propuesta no publica datos (Canarias, Ceuta y Melilla).
const ANEXO_IV = {
    // Vivienda unifamiliar
    UNI: [[240.3, 223.9, 217.4, 138.1, 94.4, 75.5, 68], [204.6, 190, 184.2, 111.8, 73.3, 58.6, 52.8], [84.1, 77.2, 74.4, 40.6, 22.7, 18.2, 16.3], [60.6, 54.9, 52.6, 27.1, 13.9, 11.1, 10], [270.1, 251.9, 244.5, 152.7, 103.8, 83, 74.7], [126.1, 116.8, 113, 66.8, 41.8, 33.4, 30.1], [85.7, 78.7, 75.8, 41.6, 22.9, 18.3, 16.5], [135.4, 125.2, 121.1, 71.4, 45.2, 36.2, 32.5], [269.5, 251.4, 244.1, 152.9, 104.4, 83.5, 75.2], [148, 137.1, 132.6, 79, 51, 40.8, 36.7], [58.5, 53, 50.7, 25.3, 12.8, 10.2, 9.2], [104.8, 96.6, 93.3, 53.3, 31.4, 25.1, 22.6], [176.9, 164.2, 159.1, 96.4, 62.7, 50.2, 45.1], [110.7, 102.2, 98.8, 57, 34.6, 27.7, 24.9], [136.9, 126.5, 122.3, 70.9, 43.1, 34.5, 31], [231.2, 215.2, 208.8, 128.7, 85.9, 68.7, 61.8], [177.9, 164.9, 159.7, 95.4, 62, 49.6, 44.6], [165.4, 153, 148, 88.2, 56.9, 45.5, 41], [216.1, 200.8, 194.7, 118.9, 78.3, 62.6, 56.4], [180.2, 167.3, 162.1, 98, 63.6, 50.9, 45.8], [86.2, 79.1, 76.2, 41.7, 23.5, 18.8, 16.9], [203.5, 189, 183.1, 111, 72.9, 58.3, 52.5], [129.3, 119.7, 115.9, 68.5, 42.8, 34.2, 30.8], [260.5, 242.8, 235.7, 147, 99.7, 79.8, 71.8], [184, 171, 165.7, 100.9, 66.2, 53, 47.7], [201.4, 187.1, 181.4, 110.5, 72.6, 58.1, 52.3], [225, 209.5, 203.3, 125.6, 84.2, 67.4, 60.6], [182.4, 169.1, 163.7, 98.3, 64, 51.2, 46.1], [74.5, 68, 65.4, 34.5, 18.5, 14.8, 13.3], [93.2, 85.7, 82.7, 46.1, 27.3, 21.8, 19.7], [222.3, 207, 200.8, 123.8, 82.7, 66.2, 59.5], [167.2, 155, 150.1, 89.5, 57.4, 45.9, 41.3], [186.3, 173, 167.7, 101.6, 66.1, 52.9, 47.6], [256.4, 238.9, 231.9, 144.3, 97.5, 78, 70.2], [0, 0, 0, 0, 0, 0, 0], [147.6, 136.5, 132.1, 77.3, 47.9, 38.3, 34.5], [240, 223.4, 216.7, 133.9, 89.5, 71.6, 64.4], [0, 0, 0, 0, 0, 0, 0], [154.3, 142.9, 138.3, 81.8, 51.5, 41.2, 37.1], [239, 222.5, 215.9, 133.5, 89.4, 71.5, 64.4], [80.4, 73.6, 71, 39.7, 22.7, 18.2, 16.3], [265.3, 247.3, 240.1, 149.9, 101.8, 81.4, 73.3], [133.9, 123.7, 119.7, 71.2, 44.9, 35.9, 32.3], [243.5, 226.7, 219.9, 135.9, 90.8, 72.6, 65.4], [170.6, 158.3, 153.4, 92.6, 60.2, 48.2, 43.3], [83.2, 76.3, 73.6, 40.2, 22.7, 18.2, 16.3], [230.7, 214.7, 208.3, 128.3, 85.4, 68.3, 61.5], [155.3, 143.9, 139.2, 82.5, 52.4, 41.9, 37.7], [220.1, 204.7, 198.4, 121.6, 80.3, 64.2, 57.8], [169.7, 157.5, 152.6, 92, 59.7, 47.8, 43], [0, 0, 0, 0, 0, 0, 0]],
    // Piso en bloque de 1-3 plantas
    P13: [[173, 163.1, 116.3, 85.4, 58.6, 46.9, 42.2], [145.6, 136.9, 95.2, 68.7, 45.9, 36.7, 33], [56.9, 52.7, 32.7, 21.3, 11.5, 9.2, 8.3], [39.4, 36.2, 21.6, 13.2, 6.2, 5, 4.5], [195.1, 184.1, 131.7, 97.2, 67.2, 53.8, 48.4], [88.6, 83, 56.2, 39.2, 24.3, 19.4, 17.5], [58.1, 53.9, 33.6, 21.5, 11.6, 9.3, 8.4], [94.5, 88.4, 60.3, 42.4, 26.4, 21.1, 19], [194.8, 183.9, 132.1, 97.7, 68, 54.4, 49], [104.1, 97.5, 67.1, 47.8, 30.6, 24.5, 22], [37.6, 34.2, 20, 12.1, 5.8, 4.6, 4.2], [72.4, 67.5, 44, 29.5, 17, 13.6, 12.2], [125.7, 118.1, 82, 58.8, 38.9, 31.1, 28], [76.9, 71.8, 47.4, 32.5, 19.7, 15.8, 14.2], [95.1, 88.9, 59.1, 40.2, 24, 19.2, 17.3], [165.8, 156.2, 110.4, 80.5, 54.2, 43.4, 39], [125.6, 117.8, 80.8, 58.1, 38.6, 30.9, 27.8], [116.1, 108.8, 74.7, 53.5, 34.8, 27.8, 25.1], [154.2, 145.1, 101.5, 73.4, 49.4, 39.5, 35.6], [127.8, 120.1, 83.3, 59.4, 38.5, 30.8, 27.7], [58.4, 54.1, 33.7, 22.1, 11.9, 9.5, 8.6], [144.8, 136, 94.5, 68.4, 45.8, 36.6, 33], [90.9, 85.1, 57.6, 40.2, 24.5, 19.6, 17.6], [187.9, 177.3, 126.7, 93.4, 64.4, 51.5, 46.4], [131.1, 123.3, 86, 62, 41.5, 33.2, 29.9], [143.5, 134.9, 94.2, 67.9, 45.6, 36.5, 32.8], [161.4, 152.1, 107.8, 78.7, 53.3, 42.6, 38.4], [128.9, 120.8, 83.7, 60, 39.2, 31.4, 28.2], [49.6, 45.7, 27.4, 17.4, 8.6, 6.9, 6.2], [63.7, 59.2, 38.1, 25.7, 14.3, 11.4, 10.3], [159.4, 150.1, 106.2, 77.3, 52.1, 41.7, 37.5], [117.9, 110.5, 75.6, 53.6, 34.9, 27.9, 25.1], [132.3, 124.3, 86.4, 61.7, 40, 32, 28.8], [184.7, 174.2, 124.2, 91.4, 62.7, 50.2, 45.1], [0, 0, 0, 0, 0, 0, 0], [103.1, 96.4, 64.8, 44.7, 27.9, 22.3, 20.1], [172.3, 162.4, 114.9, 83.9, 56.8, 45.4, 40.9], [0, 0, 0, 0, 0, 0, 0], [108.3, 101.4, 68.8, 48, 30.2, 24.2, 21.7], [171.6, 161.7, 114.6, 83.8, 56.8, 45.4, 40.9], [54.7, 50.8, 32.5, 21.4, 12.3, 9.8, 8.9], [191.5, 180.7, 129.3, 95.4, 65.9, 52.7, 47.4], [94, 88.1, 60, 42.2, 26.1, 20.9, 18.8], [174.9, 164.8, 116.6, 85.2, 57.6, 46.1, 41.5], [121, 113.7, 78.6, 56.4, 37.3, 29.8, 26.9], [56.3, 52.1, 32.4, 21.3, 11.3, 9, 8.1], [165.4, 155.8, 109.9, 80.1, 53.8, 43, 38.7], [109, 102.2, 69.5, 48.9, 31.8, 25.4, 22.9], [157.3, 148.1, 103.9, 75.3, 50.4, 40.3, 36.3], [120.3, 113, 78, 56, 36.9, 29.5, 26.6], [0, 0, 0, 0, 0, 0, 0]],
    // Piso en bloque de ≥4 plantas
    P4: [[126, 116.6, 102.2, 63.6, 43.6, 34.9, 31.4], [107.7, 95.3, 84.9, 50.2, 33.6, 26.9, 24.2], [42.9, 32.8, 30.3, 13.3, 6.6, 5.3, 4.8], [30.4, 21.6, 20.2, 7.3, 2.8, 2.2, 2], [143.4, 131.9, 116.4, 72.9, 50.5, 40.4, 36.4], [65.6, 56.3, 50.4, 26.9, 16.5, 13.2, 11.9], [43.7, 33.7, 31.1, 13.3, 6.5, 5.2, 4.7], [70.4, 60.4, 54, 29.4, 17.4, 13.9, 12.5], [142.4, 132.3, 116.1, 73.6, 51.4, 41.1, 37], [77, 67.2, 59.8, 33.8, 21, 16.8, 15.1], [29.2, 20.1, 18.8, 6.9, 2.6, 2.1, 1.9], [54.3, 44.1, 40.2, 19.2, 10.4, 8.3, 7.5], [92.9, 82.2, 73.1, 42.5, 27.9, 22.3, 20.1], [57.4, 47.5, 43, 22, 13.1, 10.5, 9.4], [69.5, 59.3, 52.6, 26.9, 15.9, 12.7, 11.4], [121.8, 110.6, 97.7, 59.2, 40, 32, 28.8], [92.9, 80.9, 72.1, 42.2, 27.8, 22.2, 20], [86.7, 74.9, 67, 38.3, 24.4, 19.5, 17.6], [114, 101.7, 90.4, 53.9, 36.2, 29, 26.1], [92.9, 83.5, 73.4, 42.4, 27.5, 22, 19.8], [44.2, 33.8, 31.3, 13.7, 7.2, 5.8, 5.2], [107.2, 94.7, 84.4, 49.9, 33.6, 26.9, 24.2], [67.7, 57.7, 51.9, 27.4, 16.3, 13, 11.7], [137.8, 126.9, 111.8, 69.8, 48.2, 38.6, 34.7], [96.8, 86.1, 76.5, 45.3, 30.1, 24.1, 21.7], [105.2, 94.4, 83.4, 49.8, 33.5, 26.8, 24.1], [117.7, 108, 94.8, 58.1, 39.1, 31.3, 28.2], [95.8, 83.8, 74.6, 43.1, 28.1, 22.5, 20.2], [37.8, 27.5, 25.7, 10.1, 4.6, 3.7, 3.3], [48, 38.2, 34.6, 16.4, 8.8, 7, 6.3], [116.4, 106.4, 93.5, 56.8, 38.5, 30.8, 27.7], [86.3, 75.8, 67.1, 38.4, 24.9, 19.9, 17.9], [96.5, 86.6, 76.3, 44.1, 28, 22.4, 20.2], [135.7, 124.5, 109.8, 68.1, 46.7, 37.4, 33.6], [0, 0, 0, 0, 0, 0, 0], [75.6, 64.9, 57.7, 31, 19.1, 15.3, 13.8], [127, 115.1, 101.9, 61.9, 41.7, 33.4, 30], [0, 0, 0, 0, 0, 0, 0], [79, 69, 61, 33.5, 21.1, 16.9, 15.2], [126.1, 114.8, 101.4, 61.9, 41.8, 33.4, 30.1], [41.1, 32.6, 29.8, 13.9, 7.6, 6.1, 5.5], [140.5, 129.5, 114.1, 71.4, 49.4, 39.5, 35.6], [69.7, 60.1, 53.8, 29.1, 17.3, 13.8, 12.5], [129.1, 116.8, 103.5, 62.8, 42.6, 34.1, 30.7], [89.4, 78.8, 70.1, 40.9, 26.6, 21.3, 19.2], [42.3, 32.5, 29.9, 13.1, 6.5, 5.2, 4.7], [121.8, 110.1, 97.5, 58.7, 39.7, 31.8, 28.6], [79.4, 69.7, 61.5, 34.9, 22.4, 17.9, 16.1], [116, 104.1, 92.3, 54.9, 37, 29.6, 26.6], [89, 78.2, 69.7, 40.5, 26.3, 21, 18.9], [0, 0, 0, 0, 0, 0, 0]]
};

/** Código INE ('01'..'52') → índice de fila del Anexo IV. -1 si no válido. */
export function provIndexFromCode(code) {
    const s = String(code ?? '').trim();
    if (!/^\d{1,2}$/.test(s)) return -1;
    const n = parseInt(s, 10);
    if (n < 1 || n > 52) return -1;
    return n >= 51 ? 50 : n - 1; // Ceuta (51) y Melilla (52) comparten fila
}

const normNombre = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z]/g, '');

// Nombre de provincia (en cualquiera de sus formas) → índice del Anexo IV.
const PROVINCIA_POR_NOMBRE = (() => {
    const m = new Map();
    RES060FC_PROVINCES.forEach((nombre, i) => {
        for (const parte of nombre.split('/')) {
            const coma = parte.match(/^(.*),\s*(.*)$/); // «Coruña, A» → «A Coruña»
            for (const v of coma ? [coma[1], `${coma[2]} ${coma[1]}`] : [parte]) m.set(normNombre(v), i);
        }
    });
    for (const [code, d] of Object.entries(PROVINCE_CLIMATE_MAP)) {
        const i = provIndexFromCode(code);
        if (i >= 0) m.set(normNombre(d.name), i);
    }
    // Los nombres en castellano que no salen de ninguna de las dos listas.
    [['ALAVA', 0], ['GUIPUZCOA', 19], ['VIZCAYA', 47], ['GERONA', 16], ['LERIDA', 24], ['ORENSE', 31],
        ['BALEARES', 6], ['ISLASBALEARES', 6], ['LACORUNA', 14], ['SANTACRUZDETENERIFE', 37],
        ['CEUTA', 50], ['MELILLA', 50]].forEach(([k, i]) => m.set(k, i));
    return m;
})();

/**
 * Provincia → índice del Anexo IV, o -1. Acepta el código INE o el NOMBRE: 68
 * oportunidades la guardan como «CIUDAD REAL» y, con solo el código, se quedaban
 * sin cifra y sin decir por qué.
 */
export function provIndex(valor) {
    const i = provIndexFromCode(valor);
    if (i >= 0) return i;
    return PROVINCIA_POR_NOMBRE.get(normNombre(valor)) ?? -1;
}

/** Año de construcción → índice del intervalo del Anexo IV, o -1 si no consta. */
export function yearIntervalIndex(anio) {
    const y = parseInt(anio, 10);
    if (!Number.isFinite(y) || y < 1000 || y > 2100) return -1;
    if (y <= 1940) return 0;
    if (y <= 1960) return 1;
    if (y <= 1980) return 2;
    if (y <= 2007) return 3;
    if (y <= 2012) return 4;
    if (y <= 2019) return 5;
    return 6;
}

/** Plantas del EDIFICIO (no de la vivienda) → '1-3' | '4+' | null si no consta. */
export function plantasEdificioFc(valor) {
    const s = String(valor ?? '').trim();
    if (s === '1-3' || s === '4+') return s;
    const n = parseInt(s, 10);
    if (Number.isFinite(n) && n > 0) return n >= 4 ? '4+' : '1-3';
    return null;
}

// Tipología → tabla del Anexo IV y f_C. 'hilera' (adosada) es unifamiliar. El
// piso y el bloque van por la tabla de su EDIFICIO (1-3 o ≥4 plantas): la de ≥4
// da hasta un 28 % menos, así que sin el dato se usa la de 1-3 y se avisa con la
// cifra de la otra. El tipo se compara en minúsculas: `normalizeData` guarda
// 'PISO', y en mayúsculas un piso cobraba como unifamiliar.
function tipologiaFC({ tipo, bloque, plantasEdificio }) {
    const t = String(tipo || '').toLowerCase();
    const pl = plantasEdificioFc(plantasEdificio);
    const table = pl === '4+' ? 'P4' : 'P13';
    const edificio = pl === '4+' ? '4 o más plantas' : '1-3 plantas';
    if (bloque) return { clase: 'bloque', table, fc: 3, label: `Bloque colectivo (${edificio})`, faltanPlantas: !pl };
    if (t === 'piso') return { clase: 'piso', table, fc: 2.5, label: `Piso (edificio de ${edificio})`, faltanPlantas: !pl };
    return { clase: 'unifamiliar', table: 'UNI', fc: 2, label: t === 'hilera' ? 'Unifamiliar (adosada)' : 'Unifamiliar', faltanPlantas: false };
}

// Anexo II del borrador: las dos filas de gas de condensación van AL REVÉS que en
// la tabla de la ficha vigente (BOILER_EFFICIENCIES, 85 % y 83 %). El resto coincide.
const ETA_ANEXO_II_FC = { gas_pre98_cond: 0.83, gas_post98_cond_auto: 0.85 };

// Anexo V de cada ficha de hibridación en PARALELO (aerotermia): % de la potencia
// de la bomba sobre la necesaria → C_b. Hasta el primer punto, 0; entre puntos se
// interpola linealmente; con el 100 % o más, 1. La de D1-D3 es la BIVALENCE_TABLE
// de la ficha vigente más el tramo del 95 al 100 %.
const CB_PARALELO = {
    A: { ficha: 'RES090FC', zonas: 'A3-A4', puntos: [[0.10, 0], [0.15, 0.4560], [0.20, 0.5730], [0.25, 0.6718], [0.30, 0.7558], [0.35, 0.8213], [0.40, 0.8701], [0.45, 0.9092], [0.50, 0.9392], [0.55, 0.9574], [0.60, 0.9707], [0.65, 0.9805], [0.70, 0.9864], [0.75, 0.9915], [0.80, 0.9940], [0.85, 0.9963], [0.90, 0.9975], [0.95, 0.9987], [1, 1]] },
    B: { ficha: 'RES091FC', zonas: 'B3-B4', puntos: [[0.10, 0], [0.15, 0.3856], [0.20, 0.4932], [0.25, 0.5889], [0.30, 0.6747], [0.35, 0.7476], [0.40, 0.8057], [0.45, 0.8547], [0.50, 0.8948], [0.55, 0.9220], [0.60, 0.9434], [0.65, 0.9606], [0.70, 0.9722], [0.75, 0.9826], [0.80, 0.9881], [0.85, 0.9935], [0.90, 0.9957], [0.95, 0.9980], [1, 1]] },
    C: { ficha: 'RES092FC', zonas: 'C1-C4', puntos: [[0.10, 0], [0.15, 0.3527], [0.20, 0.4559], [0.25, 0.5496], [0.30, 0.6331], [0.35, 0.7061], [0.40, 0.7678], [0.45, 0.8190], [0.50, 0.8597], [0.55, 0.8935], [0.60, 0.9180], [0.65, 0.9378], [0.70, 0.9546], [0.75, 0.9656], [0.80, 0.9752], [0.85, 0.9821], [0.90, 0.9876], [0.95, 0.9919], [1, 1]] },
    D: { ficha: 'RES093FC', zonas: 'D1-D3', puntos: [[0.15, 0], [0.20, 0.3946], [0.25, 0.4828], [0.30, 0.5644], [0.35, 0.6380], [0.40, 0.7022], [0.45, 0.7567], [0.50, 0.8045], [0.55, 0.8457], [0.60, 0.8808], [0.65, 0.9081], [0.70, 0.9299], [0.75, 0.9480], [0.80, 0.9608], [0.85, 0.9707], [0.90, 0.9784], [0.95, 0.9838], [1, 1]] },
    E: { ficha: 'RES094FC', zonas: 'E1', puntos: [[0.15, 0], [0.20, 0.3600], [0.25, 0.4398], [0.30, 0.5151], [0.35, 0.5847], [0.40, 0.6479], [0.45, 0.7040], [0.50, 0.7536], [0.55, 0.7974], [0.60, 0.8359], [0.65, 0.8678], [0.70, 0.8952], [0.75, 0.9192], [0.80, 0.9377], [0.85, 0.9527], [0.90, 0.9650], [0.95, 0.9737], [1, 1]] },
};

const letraZona = (zona) => {
    const l = String(zona || '').trim().toUpperCase().charAt(0);
    return 'ABCDE'.includes(l) && l ? l : null;
};

/** C_b de la ficha FC de la zona (tres decimales, como pide la ficha), o null. */
export function cbParaleloFc(zona, coverage) {
    const t = CB_PARALELO[letraZona(zona)];
    const c = Number(coverage);
    if (!t || !Number.isFinite(c)) return null;
    const p = t.puntos;
    if (c <= p[0][0]) return 0;
    if (c >= 1) return 1;
    for (let i = 0; i < p.length - 1; i++) {
        const [x0, y0] = p[i];
        const [x1, y1] = p[i + 1];
        if (c <= x1) return Math.round((y0 + ((c - x0) / (x1 - x0)) * (y1 - y0)) * 1000) / 1000;
    }
    return 1;
}

/**
 * CEF del CEE INICIAL (kWh/año): Σ <EnergiaFinalVectores> × superficie, en total y
 * solo de calefacción. null si el certificado no lo declara (un CEE leído por OCR).
 */
export function cefDelCee(cee) {
    const vec = cee?.energiaFinalVectores;
    const S = parseFloat(cee?.superficieHabitable) || 0;
    if (!vec || typeof vec !== 'object' || !(S > 0)) return null;
    let total = 0;
    let calefaccion = 0;
    for (const v of Object.values(vec)) {
        total += Number(v?.global) || 0;
        calefaccion += Number(v?.calefaccion) || 0;
    }
    if (!(total > 0)) return null;
    return { total: total * S, calefaccion: calefaccion * S };
}

// ── Elegibilidad (borrador de Resolución, apartados Primero y Cuarto) ──────────
export const FC_INICIO_ACTUACIONES = '2026-03-22';
export const FC_FIN_ACTUACIONES = '2027-11-30';

const ESTADOS_PRESENTADO = ['SUBIDO A MITECO', 'REQUERIMIENTO G.A.', 'CAE EMITIDO', 'PTE. PAGO BROKERGY A CLIENTE', 'FINALIZADO'];
const ESTADOS_VERIFICACION = ['ENVIADO A VERIFICADOR', 'REQUERIMIENTO VERIFICADOR', 'PTE. SUBIDA MITECO'];

/**
 * Dónde está la tramitación del expediente, a efectos del FC: 'presentado' (ya
 * subido a MITECO con la ficha vigente: lo resuelto no puede volver a pedirlo),
 * 'verificacion' (en lote o en el verificador: aún se puede esperar) o null.
 */
export function tramiteFc(estado, loteId) {
    const e = String(estado || '').toUpperCase().trim();
    if (ESTADOS_PRESENTADO.some((x) => e.startsWith(x))) return 'presentado';
    if (ESTADOS_VERIFICACION.includes(e) || loteId) return 'verificacion';
    return null;
}

const fechaEs = (iso) => String(iso || '').slice(0, 10).split('-').reverse().join('/');
const n1 = (v) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(v || 0);

/**
 * Avisos del FC, de más a menos grave: 'bloquea' (con esto no se puede pedir),
 * 'aviso' (la cifra puede ser otra) e 'info' (lo que hay que cumplir).
 *
 * REGLA — la cifra del FC no se enseña sin sus avisos: es un borrador y la
 * mitad de lo que decide si se cobra (fechas, letra del CEE, inercia, vivienda
 * habitual) no está en la fórmula.
 */
function avisosFc(r, ctx) {
    const av = [];
    const add = (tono, texto) => av.push({ tono, texto });
    const z = letraZona(ctx.zona);

    if (ctx.sinCalefaccion) add('bloquea', 'No hay caldera que sustituir ni hibridar: el factor de corrección es para cambiar (o hibridar) una caldera existente.');
    if (ctx.tramite === 'presentado') add('bloquea', 'Ya se ha presentado a MITECO con la ficha vigente: lo resuelto desde el RDL 7/2026 no puede volver a pedir el factor de corrección.');
    if (ctx.inicioObra && String(ctx.inicioObra).slice(0, 10) < FC_INICIO_ACTUACIONES) {
        add('bloquea', `La actuación empezó el ${fechaEs(ctx.inicioObra)}: solo entran las iniciadas desde el 22/03/2026, con facturas posteriores a esa fecha.`);
    }
    if (ctx.finObra && String(ctx.finObra).slice(0, 10) > FC_FIN_ACTUACIONES) {
        add('bloquea', `La última factura es del ${fechaEs(ctx.finObra)}: tienen que ser anteriores al 01/12/2027.`);
    }
    if (r.ficha === 'RES060FC' && (z === 'D' || z === 'E')) {
        const letras = [ctx.ceeFinal?.emisionesLetra, ctx.ceeFinal?.epnrLetra]
            .filter(Boolean).map((l) => String(l).trim().toUpperCase());
        const fuera = letras.filter((l) => l === 'F' || l === 'G');
        if (fuera.length) add('bloquea', `En zona ${ctx.zona} el CEE tiene que acreditar una letra de la A a la E, y el CEE final tiene una ${fuera[0]}.`);
        else if (!letras.length) add('info', `En zona ${ctx.zona} el CEE tiene que quedar con una letra de la A a la E (aún no hay CEE final con la que comprobarlo).`);
    }

    if (ctx.tramite === 'verificacion') add('aviso', 'Está en un lote o en verificación: si se sube a MITECO con la ficha vigente antes de 2027, pierde el factor de corrección.');
    if (r.anioSupuesto) add('aviso', 'Falta el año de construcción: se ha tomado el tramo 1981-2007 del Anexo IV, y con el año real la demanda puede ser muy distinta.');
    if (r.faltanPlantas) add('aviso', `Falta cuántas plantas tiene el edificio: se ha usado la tabla de 1-3 plantas (${n1(r.q)} kWh/m²); con 4 o más serían ${n1(r.qOtraTabla)} kWh/m².`);
    if (r.cefFuente === 'estimado') {
        if (r.limitedByTope) add('aviso', 'Lo limita el tope del 70 % y el CEF está ESTIMADO (demanda ÷ η de la tabla). La ficha pide el del CEE inicial, que en nuestros certificados sale de mediana 1,45 veces mayor: con el CEE cargado la cifra puede subir.');
        else add('info', 'CEF estimado (demanda ÷ η de la tabla): la ficha pide el del CEE inicial. Aquí no limita.');
    }
    if (r.cefFuente == null) add('aviso', 'Sin consumo de partida no se puede aplicar el tope del 70 %: la cifra puede estar alta.');
    if (r.hibridacion && ctx.sinZona) add('aviso', 'No consta la zona climática: se ha usado la ficha de la zona D (RES093FC).');
    if (r.hibridacion && ctx.cbSinPotencias) add('aviso', 'Faltan las potencias de la bomba o de la caldera: el C_b no sale de la tabla de la ficha y la cifra puede estar alta.');
    if (ctx.combustible === 'biomasa' || ctx.combustible === 'electrica') {
        const cual = ctx.combustible === 'biomasa' ? 'una caldera de biomasa' : 'una caldera eléctrica';
        add('aviso', `La Resolución habla de calderas de combustible FÓSIL y la ficha, «de combustión o eléctrica»: con ${cual} no es seguro que se admita.`);
    }
    if (r.clase === 'piso') add('info', 'f_C de piso: 2,5 en la ficha y 2 en el cuerpo de la Resolución. Se usa 2,5.');

    add('info', 'Se presenta del 02/01/2027 al 01/01/2028, pidiéndolo expresamente en la solicitud. Hay un cupo (10 % de las obligaciones de 2027) que se reparte por orden de resolución: no está garantizado.');
    add('info', r.hibridacion
        ? 'Requisitos: funcionamiento bivalente en paralelo; depósito de inercia de 15 L por kW de la bomba (salvo bloques centralizados); contrato de mantenimiento; vivienda habitual (facturas del 1/11 al 31/3 del invierno anterior con más de 75 kWh/mes de media); consentimiento informado sobre el IRPF.'
        : 'Requisitos: bomba hidrónica (aire-agua, agua-agua o tierra-agua); depósito de inercia de 15 L por kW; contrato de mantenimiento de 2 años; certificado de baja tensión con el aumento de potencia; CEE final registrado; vivienda habitual (facturas del 1/11 al 31/3 del invierno anterior con más de 75 kWh/mes de media); consentimiento informado sobre el IRPF. Si la caldera se queda, en preinstalación y sin hibridar.');

    const orden = { bloquea: 0, aviso: 1, info: 2 };
    return av.sort((a, b) => orden[a.tono] - orden[b.tono]);
}

/**
 * Calcula los CAEs según la ficha con factor de corrección que toque: RES060FC,
 * o la RES09xFC de su zona si hay hibridación. Devuelve null sin provincia (el
 * Anexo IV es por provincia).
 */
export function calculateRes060FC({
    provinciaCode,      // código INE '01'..'52' o nombre de la provincia
    anio,               // año de construcción
    tipo,               // 'unifamiliar' | 'piso' | 'hilera' (en cualquier caja)
    bloque = false,     // edificio completo (tipoInmueble 'bloque')
    plantasEdificio = null, // '1-3' | '4+' | nº de plantas del EDIFICIO (piso y bloque)
    zona = null,        // zona climática CTE ('D3'…): ficha de hibridación y letra del CEE
    superficie,         // S (m²) — la misma que usa el cálculo actual
    boilerEff,          // η_i del cálculo vigente
    boilerId = null,    // fila de BOILER_EFFICIENCIES (para el Anexo II del borrador)
    scopHeating,        // SCOP_bdc
    scopAcs,            // SCOP_dhw
    changeAcs = false,  // incluir ACS en el ahorro
    dacs = 2731.4,      // D_ACS (kWh/año)
    qCalefaccion = 0,   // demanda de calefacción de la app (kWh/año): solo para ESTIMAR el CEF
    ceeInicial = null,  // CEE inicial parseado: su consumo de energía final ES el CEF
    cef = null,         // CEF ya resuelto (kWh/año), si se quiere forzar
    hibridacion = null, // { coverage, refPower, cb } de calculateHybridization, o null
    vulnerable = false, // consumidor vulnerable severo (×1,5, fichas -S)
    contexto = {},      // { sinCalefaccion, combustible, ceeFinal, inicioObra, finObra, tramite }
}) {
    const pi = provIndex(provinciaCode);
    if (pi < 0) return null;

    const yiReal = yearIntervalIndex(anio);
    const anioSupuesto = yiReal < 0;
    const yi = anioSupuesto ? 3 : yiReal;
    const tip = tipologiaFC({ tipo, bloque, plantasEdificio });
    const q = ANEXO_IV[tip.table][pi][yi] || 0;
    const qOtraTabla = tip.faltanPlantas ? (ANEXO_IV.P4[pi][yi] || 0) : null;
    const fc = tip.fc * (vulnerable ? 1.5 : 1);

    const S = parseFloat(superficie) || 0;
    const etaApp = parseFloat(boilerEff) || 0;
    const eta = ETA_ANEXO_II_FC[boilerId] ?? etaApp;
    const scopB = redondeaScop(scopHeating) || 0;
    const scopD = redondeaScop(scopAcs) || 0;
    const dacsNum = Math.max(0, parseFloat(dacs) || 0);

    // Hibridación → la ficha de SU zona, con el C_b de SU tabla.
    const esHib = !!hibridacion;
    const sinZona = esHib && !letraZona(zona);
    const zonaCb = sinZona ? 'D' : zona;
    const tablaCb = esHib ? CB_PARALELO[letraZona(zonaCb)] : null;
    let cb = 1;
    let cbSinPotencias = false;
    if (esHib) {
        const deTabla = hibridacion.refPower > 0 ? cbParaleloFc(zonaCb, hibridacion.coverage) : null;
        cbSinPotencias = deTabla == null;
        cb = deTabla ?? (Number.isFinite(hibridacion.cb) ? hibridacion.cb : 1);
    }

    const dem = q * S; // D_CAL · S (kWh/año)
    const ahc = eta > 0 && scopB > 0 ? dem * (1 / eta - 1 / scopB) : 0;
    const aha = changeAcs && eta > 0 && scopD > 0 ? dacsNum * (1 / eta - 1 / scopD) : 0;
    const aes = (ahc + aha) * cb;

    // CEF: el del CEE inicial; sin él, estimado con la demanda y el η de la app.
    const delCee = cefDelCee(ceeInicial);
    const qCal = Math.max(0, parseFloat(qCalefaccion) || 0);
    let cefTotal = null;
    let cefCal = null;
    let cefFuente = null;
    if (cef != null && parseFloat(cef) > 0) {
        cefTotal = cefCal = parseFloat(cef);
        cefFuente = 'dado';
    } else if (delCee) {
        cefTotal = delCee.total;
        cefCal = delCee.calefaccion;
        cefFuente = 'cee';
    } else if (etaApp > 0 && qCal > 0) {
        cefTotal = (qCal + dacsNum) / etaApp;
        cefCal = qCal / etaApp;
        cefFuente = 'estimado';
    }
    const cefAplicado = esHib ? cefCal : cefTotal;
    const tope = cefAplicado > 0 ? 0.70 * cefAplicado : null;
    const limitedByTope = tope != null && aes > tope;
    const cae = Math.max(0, (limitedByTope ? tope : aes) * fc);

    const r = {
        ficha: esHib ? tablaCb.ficha : 'RES060FC',
        hibridacion: esHib,
        cb,
        zonaCb: tablaCb?.zonas || null,
        cae,                 // CAEs = kWh/año de ahorro computable
        aes,                 // techo técnico, SIN f_C
        ahc,
        aha,
        tope,
        limitedByTope,       // true → manda el 70 %·CEF; false → techo técnico
        q,                   // valor Anexo IV (kWh/m²·año)
        qOtraTabla,
        dem,
        fc,
        eta,
        etaApp,
        superficie: S,
        cef: cefAplicado,
        cefTotal,
        cefCalefaccion: cefCal,
        cefFuente,           // 'cee' | 'estimado' | 'dado' | null
        provinciaIndex: pi,
        provinciaNombre: RES060FC_PROVINCES[pi],
        yearLabel: RES060FC_YEARS[yi],
        anioSupuesto,
        tipologiaLabel: tip.label,
        clase: tip.clase,
        faltanPlantas: tip.faltanPlantas,
        // Provincias sin datos en el Anexo IV del borrador (Canarias, Ceuta y Melilla)
        noAnexoData: q <= 0,
    };
    r.avisos = avisosFc(r, { ...contexto, zona, sinZona, cbSinPotencias });
    r.elegible = !r.avisos.some((a) => a.tono === 'bloquea');
    return r;
}

/**
 * Contexto de elegibilidad desde los inputs de la calculadora / la oportunidad:
 * sin calefacción y combustible de la caldera. Lo comparten la calculadora y el
 * expediente, que lee los inputs de su oportunidad.
 *
 * REGLA — manda la FILA DE CALDERA elegida (`rendimiento_id` / `boilerId`); el
 * desplegable de tipo solo cuenta cuando no hay ninguna. 24 oportunidades dicen
 * «No tiene Calefacción» en el tipo con una caldera de gasóleo o de gas elegida
 * en el rendimiento: leído a pelo, el FC las daba a todas por no elegibles.
 */
export function contextoCalderaFc(inputs = {}, rendimientoId = null) {
    const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    const id = rendimientoId || inputs.boilerId || '';
    const conFila = id && id !== 'default';
    const tipo = norm(inputs.boilerHeatingType);
    const sinCalefaccion = id === 'sin_calefaccion' || (!conFila && tipo === 'no tiene calefaccion');
    let combustible = 'fosil';
    if (id === 'electric' || (!conFila && (tipo === 'electricidad' || tipo === 'termo'))) combustible = 'electrica';
    else if ((!conFila || id.startsWith('solid_')) && esCalderaBiomasa({ ...inputs, boilerId: id })) combustible = 'biomasa';
    return { sinCalefaccion, combustible };
}
