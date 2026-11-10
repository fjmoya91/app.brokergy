import { redondeaScop } from './calculation.js';
import { PROVINCE_CLIMATE_MAP } from '../data/provinceMapping.js';
import { esCalderaBiomasa } from './irpfBiomasa.js';
/**
 * ============================================================================
 * FACTOR MULTIPLICADOR (f_M) — la Resolución PUBLICADA
 * ============================================================================
 *
 * Resolución de 3/11/2026 de la DGPLACE, BOE núm. 278 de 7/11/2026
 * (BOE-A-2026-23367), en vigor el 8/11/2026. Sustituye al borrador de la
 * consulta pública que este fichero calculaba como «FC» (RES060FC, f_C). El
 * nombre del fichero y las exportaciones antiguas se conservan como alias para
 * no romper a quien las importa.
 *
 *   RES060_FM — sustitución de la caldera por bomba de calor hidrónica:
 *     AE = [ (D_cal·S)·(1/η_i − 1/SCOP_bdc) + D_ACS·(1/η_i − 1/SCOP_dhw) ] · f_M
 *
 *   RES090_FM…RES094_FM — hibridación en PARALELO, una ficha por zona
 *   (A3-A4 · B3-B4 · C · D1-D3 · E1), cada una con su tabla de C_b (Anexo V):
 *     AE = [ …el mismo corchete… ] · C_b · f_M
 *
 * REGLA — SIN tope de CEF. El borrador cortaba en 0,70·CEF del CEE inicial; la
 * publicada no. La cifra depende solo del CEE POSTERIOR, y el CEE inicial deja
 * de hacer falta en estas fichas.
 *
 * REGLA — D_cal y S son las del CEE POSTERIOR (su anexo II): la del CEE final si
 * está cargado; si no, la del inicial (en nuestros finales la demanda es la
 * misma, y se dice); sin ninguno, la de la simulación, marcada como estimada.
 * En UNIFAMILIAR, D_cal = mín(D_cal del CEE ; 2 × tabla UNI del Anexo IV). En el
 * resto, la del CEE sin más: las tablas de pisos desaparecen, y con ellas la
 * pregunta de las plantas del edificio (`fcPlantasEdificio` se ignora).
 *
 * REGLA — D_ACS = d_ACS · S: 11 kWh/m²·año (unifamiliar o piso con sistema
 * individual), 16 (edificio con sistema centralizado: `tipoInmueble 'bloque'`).
 *
 * - f_M: 2 unifamiliar · 2,5 piso con sistema individual · 3 edificio con sistema
 *   centralizado. Vulnerable (RD 897/2017), ×1,5 (fichas _FM-S).
 * - η_i: Anexo II. Las dos filas de gas de condensación van AL REVÉS que en la
 *   ficha vigente (83 % antes de 1998, 85 % desde 1998 con encendido automático).
 *   Combustible SÓLIDO (biomasa, carbón): el Anexo II ya no lo trae → no elegible.
 * - SCOP: los MISMOS que el cálculo vigente, para que la comparativa sea limpia.
 * - C_b: aerotermia salvo que el equipo diga geotermia o hidrotérmica.
 * - Nada de esto se enseña sin sus avisos (`avisos`, `elegible`): fechas, cupo,
 *   tramitación y lo que hay que documentar no están en la fórmula.
 */

/** Norma con la que se calcula: distingue lo calculado con el BORRADOR (sin este campo). */
export const FM_NORMATIVA = 'BOE-A-2026-23367';

// Intervalos de año de construcción del Anexo IV (columnas de la tabla)
export const RES060FM_YEARS = ['≤1940', '1941-1960', '1961-1980', '1981-2007', '2008-2012', '2013-2019', '>2019'];

// Provincias en orden INE (código 01..50; Ceuta y Melilla comparten la fila 51).
export const RES060FM_PROVINCES = ['Araba/Álava', 'Albacete', 'Alicante/Alacant', 'Almería', 'Ávila', 'Badajoz', 'Balears, Illes', 'Barcelona', 'Burgos', 'Cáceres', 'Cádiz', 'Castellón/Castelló', 'Ciudad Real', 'Córdoba', 'Coruña, A', 'Cuenca', 'Girona', 'Granada', 'Guadalajara', 'Gipuzkoa', 'Huelva', 'Huesca', 'Jaén', 'León', 'Lleida', 'Rioja, La', 'Lugo', 'Madrid', 'Málaga', 'Murcia', 'Navarra', 'Ourense', 'Asturias', 'Palencia', 'Palmas, Las', 'Pontevedra', 'Salamanca', 'Sta. C. de Tenerife', 'Cantabria', 'Segovia', 'Sevilla', 'Soria', 'Tarragona', 'Teruel', 'Toledo', 'Valencia/Valéncia', 'Valladolid', 'Bizkaia', 'Zamora', 'Zaragoza', 'Ceuta y Melilla'];
// Alias de cuando era el borrador.
export const RES060FC_YEARS = RES060FM_YEARS;
export const RES060FC_PROVINCES = RES060FM_PROVINCES;

// ANEXO IV — Valor de referencia de la demanda de calefacción en edificio
// UNIFAMILIAR (kWh/m²·año): una fila por provincia (orden INE de arriba), una
// columna por intervalo de RES060FM_YEARS. Filas a 0 = la Resolución no publica
// datos (Canarias, Ceuta y Melilla). Cotejada con el BOE el 7/11/2026: idéntica a
// la del borrador. En la publicada SOLO sirve de TOPE (× 2) en unifamiliar.
const ANEXO_IV_UNI = [[240.3, 223.9, 217.4, 138.1, 94.4, 75.5, 68], [204.6, 190, 184.2, 111.8, 73.3, 58.6, 52.8], [84.1, 77.2, 74.4, 40.6, 22.7, 18.2, 16.3], [60.6, 54.9, 52.6, 27.1, 13.9, 11.1, 10], [270.1, 251.9, 244.5, 152.7, 103.8, 83, 74.7], [126.1, 116.8, 113, 66.8, 41.8, 33.4, 30.1], [85.7, 78.7, 75.8, 41.6, 22.9, 18.3, 16.5], [135.4, 125.2, 121.1, 71.4, 45.2, 36.2, 32.5], [269.5, 251.4, 244.1, 152.9, 104.4, 83.5, 75.2], [148, 137.1, 132.6, 79, 51, 40.8, 36.7], [58.5, 53, 50.7, 25.3, 12.8, 10.2, 9.2], [104.8, 96.6, 93.3, 53.3, 31.4, 25.1, 22.6], [176.9, 164.2, 159.1, 96.4, 62.7, 50.2, 45.1], [110.7, 102.2, 98.8, 57, 34.6, 27.7, 24.9], [136.9, 126.5, 122.3, 70.9, 43.1, 34.5, 31], [231.2, 215.2, 208.8, 128.7, 85.9, 68.7, 61.8], [177.9, 164.9, 159.7, 95.4, 62, 49.6, 44.6], [165.4, 153, 148, 88.2, 56.9, 45.5, 41], [216.1, 200.8, 194.7, 118.9, 78.3, 62.6, 56.4], [180.2, 167.3, 162.1, 98, 63.6, 50.9, 45.8], [86.2, 79.1, 76.2, 41.7, 23.5, 18.8, 16.9], [203.5, 189, 183.1, 111, 72.9, 58.3, 52.5], [129.3, 119.7, 115.9, 68.5, 42.8, 34.2, 30.8], [260.5, 242.8, 235.7, 147, 99.7, 79.8, 71.8], [184, 171, 165.7, 100.9, 66.2, 53, 47.7], [201.4, 187.1, 181.4, 110.5, 72.6, 58.1, 52.3], [225, 209.5, 203.3, 125.6, 84.2, 67.4, 60.6], [182.4, 169.1, 163.7, 98.3, 64, 51.2, 46.1], [74.5, 68, 65.4, 34.5, 18.5, 14.8, 13.3], [93.2, 85.7, 82.7, 46.1, 27.3, 21.8, 19.7], [222.3, 207, 200.8, 123.8, 82.7, 66.2, 59.5], [167.2, 155, 150.1, 89.5, 57.4, 45.9, 41.3], [186.3, 173, 167.7, 101.6, 66.1, 52.9, 47.6], [256.4, 238.9, 231.9, 144.3, 97.5, 78, 70.2], [0, 0, 0, 0, 0, 0, 0], [147.6, 136.5, 132.1, 77.3, 47.9, 38.3, 34.5], [240, 223.4, 216.7, 133.9, 89.5, 71.6, 64.4], [0, 0, 0, 0, 0, 0, 0], [154.3, 142.9, 138.3, 81.8, 51.5, 41.2, 37.1], [239, 222.5, 215.9, 133.5, 89.4, 71.5, 64.4], [80.4, 73.6, 71, 39.7, 22.7, 18.2, 16.3], [265.3, 247.3, 240.1, 149.9, 101.8, 81.4, 73.3], [133.9, 123.7, 119.7, 71.2, 44.9, 35.9, 32.3], [243.5, 226.7, 219.9, 135.9, 90.8, 72.6, 65.4], [170.6, 158.3, 153.4, 92.6, 60.2, 48.2, 43.3], [83.2, 76.3, 73.6, 40.2, 22.7, 18.2, 16.3], [230.7, 214.7, 208.3, 128.3, 85.4, 68.3, 61.5], [155.3, 143.9, 139.2, 82.5, 52.4, 41.9, 37.7], [220.1, 204.7, 198.4, 121.6, 80.3, 64.2, 57.8], [169.7, 157.5, 152.6, 92, 59.7, 47.8, 43], [0, 0, 0, 0, 0, 0, 0]];

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
    RES060FM_PROVINCES.forEach((nombre, i) => {
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
 * oportunidades la guardan como «CIUDAD REAL».
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

/**
 * Plantas del EDIFICIO → '1-3' | '4+' | null. Era para elegir la tabla de pisos
 * del borrador, que la publicada quita. Se conserva para leer lo guardado
 * (`inputs.fcPlantasEdificio`) sin romper; el cálculo ya no lo usa.
 */
export function plantasEdificioFc(valor) {
    const s = String(valor ?? '').trim();
    if (s === '1-3' || s === '4+') return s;
    const n = parseInt(s, 10);
    if (Number.isFinite(n) && n > 0) return n >= 4 ? '4+' : '1-3';
    return null;
}

// Tipología → f_M y d_ACS. 'hilera' (adosada) es unifamiliar. El bloque
// (`tipoInmueble 'bloque'`) es el edificio con sistema centralizado aunque su
// `tipo` diga piso. El tipo se compara en minúsculas: `normalizeData` guarda 'PISO'.
export function tipologiaFM({ tipo, bloque }) {
    const t = String(tipo || '').toLowerCase();
    if (bloque) return { clase: 'bloque', fm: 3, dAcs: 16, label: 'Edificio con sistema centralizado' };
    if (t === 'piso') return { clase: 'piso', fm: 2.5, dAcs: 11, label: 'Piso con sistema individual' };
    return { clase: 'unifamiliar', fm: 2, dAcs: 11, label: t === 'hilera' ? 'Unifamiliar (adosada)' : 'Unifamiliar' };
}

// Anexo II publicado: las dos filas de gas de condensación van AL REVÉS que en la
// tabla de la ficha vigente (BOILER_EFFICIENCIES, 85 % y 83 %). El resto coincide.
// Las de combustible SÓLIDO no están: con ellas no se puede pedir.
const ETA_ANEXO_II_FM = { gas_pre98_cond: 0.83, gas_post98_cond_auto: 0.85 };

// Anexo V de cada ficha de hibridación en PARALELO: % de la POTENCIA nominal de la
// bomba sobre la necesaria en proyecto → C_b. Hasta el primer punto, 0; entre
// puntos se interpola linealmente; con el 100 % o más, 1. La columna de
// aerotermia es la del borrador; la de geotermia o hidrotérmica es nueva.
// Cotejadas con el BOE (págs. 31, 40, 49, 58 y 67) el 7/11/2026.
const CB_PARALELO = {
    A: {
        ficha: 'RES090_FM', zonas: 'A3-A4',
        aero: [[0.10, 0], [0.15, 0.4560], [0.20, 0.5730], [0.25, 0.6718], [0.30, 0.7558], [0.35, 0.8213], [0.40, 0.8701], [0.45, 0.9092], [0.50, 0.9392], [0.55, 0.9574], [0.60, 0.9707], [0.65, 0.9805], [0.70, 0.9864], [0.75, 0.9915], [0.80, 0.9940], [0.85, 0.9963], [0.90, 0.9975], [0.95, 0.9987], [1, 1]],
        geo: [[0.10, 0], [0.15, 0.4560], [0.20, 0.5750], [0.25, 0.6743], [0.30, 0.7588], [0.35, 0.8249], [0.40, 0.8741], [0.45, 0.9138], [0.50, 0.9443], [0.55, 0.9629], [0.60, 0.9768], [0.65, 0.9864], [0.70, 0.9918], [0.75, 0.9953], [0.80, 0.9975], [0.85, 0.9988], [0.90, 0.9996], [0.95, 0.9999], [1, 1]],
    },
    B: {
        ficha: 'RES091_FM', zonas: 'B3-B4',
        aero: [[0.10, 0], [0.15, 0.3856], [0.20, 0.4932], [0.25, 0.5889], [0.30, 0.6747], [0.35, 0.7476], [0.40, 0.8057], [0.45, 0.8547], [0.50, 0.8948], [0.55, 0.9220], [0.60, 0.9434], [0.65, 0.9606], [0.70, 0.9722], [0.75, 0.9826], [0.80, 0.9881], [0.85, 0.9935], [0.90, 0.9957], [0.95, 0.9980], [1, 1]],
        geo: [[0.10, 0], [0.15, 0.3885], [0.20, 0.4970], [0.25, 0.5937], [0.30, 0.6805], [0.35, 0.7543], [0.40, 0.8134], [0.45, 0.8634], [0.50, 0.9044], [0.55, 0.9326], [0.60, 0.9550], [0.65, 0.9721], [0.70, 0.9833], [0.75, 0.9907], [0.80, 0.9956], [0.85, 0.9992], [0.90, 0.9992], [0.95, 0.9997], [1, 1]],
    },
    C: {
        ficha: 'RES092_FM', zonas: 'C1-C4',
        aero: [[0.10, 0], [0.15, 0.3527], [0.20, 0.4559], [0.25, 0.5496], [0.30, 0.6331], [0.35, 0.7061], [0.40, 0.7678], [0.45, 0.8190], [0.50, 0.8597], [0.55, 0.8935], [0.60, 0.9180], [0.65, 0.9378], [0.70, 0.9546], [0.75, 0.9656], [0.80, 0.9752], [0.85, 0.9821], [0.90, 0.9876], [0.95, 0.9919], [1, 1]],
        geo: [[0.10, 0], [0.15, 0.3612], [0.20, 0.4672], [0.25, 0.5638], [0.30, 0.6501], [0.35, 0.7260], [0.40, 0.7905], [0.45, 0.8445], [0.50, 0.8880], [0.55, 0.9216], [0.60, 0.9468], [0.65, 0.9655], [0.70, 0.9781], [0.75, 0.9868], [0.80, 0.9929], [0.85, 0.9966], [0.90, 0.9986], [0.95, 0.9996], [1, 1]],
    },
    D: {
        ficha: 'RES093_FM', zonas: 'D1-D3',
        aero: [[0.15, 0], [0.20, 0.3946], [0.25, 0.4828], [0.30, 0.5644], [0.35, 0.6380], [0.40, 0.7022], [0.45, 0.7567], [0.50, 0.8045], [0.55, 0.8457], [0.60, 0.8808], [0.65, 0.9081], [0.70, 0.9299], [0.75, 0.9480], [0.80, 0.9608], [0.85, 0.9707], [0.90, 0.9784], [0.95, 0.9838], [1, 1]],
        geo: [[0.15, 0], [0.20, 0.4192], [0.25, 0.5136], [0.30, 0.6013], [0.35, 0.6810], [0.40, 0.7514], [0.45, 0.8120], [0.50, 0.8638], [0.55, 0.9053], [0.60, 0.9374], [0.65, 0.9603], [0.70, 0.9760], [0.75, 0.9857], [0.80, 0.9922], [0.85, 0.9962], [0.90, 0.9986], [0.95, 0.9997], [1, 1]],
    },
    E: {
        ficha: 'RES094_FM', zonas: 'E1',
        aero: [[0.15, 0], [0.20, 0.3600], [0.25, 0.4398], [0.30, 0.5151], [0.35, 0.5847], [0.40, 0.6479], [0.45, 0.7040], [0.50, 0.7536], [0.55, 0.7974], [0.60, 0.8359], [0.65, 0.8678], [0.70, 0.8952], [0.75, 0.9192], [0.80, 0.9377], [0.85, 0.9527], [0.90, 0.9650], [0.95, 0.9737], [1, 1]],
        geo: [[0.15, 0], [0.20, 0.3890], [0.25, 0.4761], [0.30, 0.5587], [0.35, 0.6355], [0.40, 0.7060], [0.45, 0.7694], [0.50, 0.8241], [0.55, 0.8701], [0.60, 0.9081], [0.65, 0.9385], [0.70, 0.9612], [0.75, 0.9768], [0.80, 0.9874], [0.85, 0.9938], [0.90, 0.9978], [0.95, 0.9995], [1, 1]],
    },
};

const letraZona = (zona) => {
    const l = String(zona || '').trim().toUpperCase().charAt(0);
    return 'ABCDE'.includes(l) && l ? l : null;
};
// Climas α (Canarias): excluidos de la RES060_FM.
const esZonaAlfa = (zona) => /^(α|ALFA|ALPHA)/i.test(String(zona || '').trim());

/** ¿La bomba es de geotermia o hidrotérmica? Solo si el equipo lo dice. */
const esGeoOHidro = (fuente) => /geo|hidro|tierra|agua-agua|agua_agua/i.test(String(fuente || ''));

/**
 * C_b de la ficha FM de la zona (tres decimales, como pide la ficha), o null.
 * `fuente`: la de la bomba; aerotermia salvo que diga geotermia o hidrotérmica.
 */
export function cbParaleloFm(zona, coverage, fuente = 'aerotermia') {
    const t = CB_PARALELO[letraZona(zona)];
    const c = Number(coverage);
    if (!t || !Number.isFinite(c)) return null;
    const p = esGeoOHidro(fuente) ? t.geo : t.aero;
    if (c <= p[0][0]) return 0;
    if (c >= 1) return 1;
    for (let i = 0; i < p.length - 1; i++) {
        const [x0, y0] = p[i];
        const [x1, y1] = p[i + 1];
        if (c <= x1) return Math.round((y0 + ((c - x0) / (x1 - x0)) * (y1 - y0)) * 1000) / 1000;
    }
    return 1;
}
/** Alias de cuando era el borrador (solo aerotermia). */
export const cbParaleloFc = (zona, coverage) => cbParaleloFm(zona, coverage, 'aerotermia');

/**
 * CEF del CEE (kWh/año): Σ <EnergiaFinalVectores> × superficie, en total y solo de
 * calefacción. Era el tope del borrador; la publicada no lo usa. Se conserva
 * porque es un dato del certificado que alguien puede querer enseñar.
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

// ── Plazos y cupo (Resolución, apartados Primero.d-g, Sexto y Séptimo) ─────────
export const FM_INICIO_ACTUACIONES = '2026-03-22';      // factura posterior al 22/03/2026
export const FM_FIN_FACTURAS = '2027-11-30';            // anteriores al 01/12/2027
export const FM_FIN_FACTURAS_CCPP = '2027-12-31';       // CC. PP.: anteriores al 01/01/2028
export const FM_PRESENTACION_DESDE = '2027-01-15';
export const FM_PRESENTACION_HASTA = '2027-12-31';
export const FM_PRESENTACION_HASTA_CCPP = '2028-02-28';
export const FM_CUPO_KWH = 1286876082;                  // 15 % de la obligación de 2026
// Alias de cuando era el borrador.
export const FC_INICIO_ACTUACIONES = FM_INICIO_ACTUACIONES;
export const FC_FIN_ACTUACIONES = FM_FIN_FACTURAS;

const ESTADOS_PRESENTADO = ['SUBIDO A MITECO', 'REQUERIMIENTO G.A.', 'CAE EMITIDO', 'PTE. PAGO BROKERGY A CLIENTE', 'FINALIZADO'];
const ESTADOS_VERIFICACION = ['ENVIADO A VERIFICADOR', 'REQUERIMIENTO VERIFICADOR', 'PTE. SUBIDA MITECO'];

/**
 * Dónde está la tramitación del expediente, a efectos del FM: 'presentado' (ya
 * subido a MITECO con la ficha vigente: lo resuelto no puede volver a pedirlo),
 * 'verificacion' (en lote o en el verificador: aún se puede esperar) o null.
 */
export function tramiteFc(estado, loteId) {
    const e = String(estado || '').toUpperCase().trim();
    if (ESTADOS_PRESENTADO.some((x) => e.startsWith(x))) return 'presentado';
    if (ESTADOS_VERIFICACION.includes(e) || loteId) return 'verificacion';
    return null;
}
export const tramiteFm = tramiteFc;

const fechaEs = (iso) => String(iso || '').slice(0, 10).split('-').reverse().join('/');
const n1 = (v) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(v || 0);
const n0 = (v) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0, useGrouping: true }).format(Math.round(v || 0));
const hoyIso = () => new Date().toISOString().slice(0, 10);
const n2 = (v) => new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v || 0);

/**
 * Lo que hay que hacer cuando la simulación no lleva el ACS. Es la MISMA frase en
 * la tarjeta, el desglose, la columna «Vía FM» y el aviso de la propuesta
 * (Fran, 07/11/2026: «que sea un aviso», y que diga qué hacer).
 */
export const FM_ACS_QUE_HACER = 'La Resolución pide que la aerotermia dé también el ACS (apartado 1 de la ficha). Añade el depósito de ACS al presupuesto para ir por esta vía.';

function textoFaltaAcs(r) {
    if (r.acsSupuesto) {
        return `${FM_ACS_QUE_HACER} La cifra FM ya supone que se añade: D_ACS = ${r.dAcsEspecifica} × ${n0(r.superficie)} m² = ${n0(r.dacs)} kWh/año, con SCOP_dhw ${n2(r.scopAcs)}.`;
    }
    return `${FM_ACS_QUE_HACER} Sin SCOP_dhw del equipo no se ha podido sumar el ACS: la cifra FM es solo la calefacción y subirá al añadirlo.`;
}

/**
 * Avisos del FM, de más a menos grave: 'bloquea' (con esto no se puede pedir),
 * 'aviso' (la cifra o la elegibilidad pueden ser otras) e 'info' (lo que hay que
 * cumplir).
 *
 * REGLA — la cifra del FM no se enseña sin sus avisos: la mitad de lo que decide
 * si se cobra (fechas, cupo, tramitación, vivienda habitual) no está en la fórmula.
 */
function avisosFm(r, ctx) {
    const av = [];
    const add = (tono, texto) => av.push({ tono, texto });
    const z = letraZona(ctx.zona);
    const finFacturas = ctx.comunidad ? FM_FIN_FACTURAS_CCPP : FM_FIN_FACTURAS;
    const finPresentacion = ctx.comunidad ? FM_PRESENTACION_HASTA_CCPP : FM_PRESENTACION_HASTA;
    const hoy = String(ctx.hoy || hoyIso()).slice(0, 10);

    // ── Lo que impide pedirlo ──
    // Terciario (TER100 / TER173): las fichas FM son solo residenciales (Fran, 10/11/2026,
    // 26TER100_OP389: «no debería aparecer nada del multiplicador»).
    if (ctx.terciario) add('bloquea', 'Es del sector TERCIARIO (TER100 / TER173): el factor multiplicador solo tiene fichas residenciales.');
    if (ctx.sinCalefaccion) add('bloquea', 'No hay caldera que sustituir ni hibridar: el factor multiplicador es para cambiar (o hibridar) una caldera existente.');
    else if (r.solido) add('bloquea', 'La caldera es de combustible SÓLIDO (biomasa o carbón): el Anexo II de la Resolución publicada solo trae gas, gasóleo y eléctrica.');
    if (r.conCalefaccion === false) add('bloquea', 'La obra no cambia la calefacción (solo el ACS): el factor multiplicador exige que la bomba dé la calefacción Y el ACS. Va por la ficha vigente.');
    if (ctx.aireAire) add('bloquea', 'La bomba tiene que ser HIDRÓNICA (aire-agua, agua-agua o tierra-agua): con splits o conductos (aire-aire) no entra.');
    if (esZonaAlfa(ctx.zona)) add('bloquea', 'Las instalaciones en climas α están excluidas del factor multiplicador.');
    if (ctx.tramite === 'presentado') add('bloquea', 'Ya se ha presentado a MITECO con la ficha vigente: lo resuelto desde el RDL 7/2026 no puede volver a pedir el factor multiplicador.');
    if (ctx.inicioObra && String(ctx.inicioObra).slice(0, 10) < FM_INICIO_ACTUACIONES) {
        add('bloquea', `La actuación empezó el ${fechaEs(ctx.inicioObra)}: el inicio se justifica con una factura posterior al 22/03/2026.`);
    }
    if (ctx.finObra && String(ctx.finObra).slice(0, 10) > finFacturas) {
        add('bloquea', `La última factura es del ${fechaEs(ctx.finObra)}: tienen que ser anteriores al ${ctx.comunidad ? '01/01/2028 (comunidad de propietarios)' : '01/12/2027'}.`);
    }
    if (hoy > finPresentacion) add('bloquea', `El plazo para presentarlo terminó el ${fechaEs(finPresentacion)}.`);

    // ── Lo que puede cambiar la cifra o la elegibilidad ──
    if (ctx.tramite === 'verificacion') add('aviso', 'Está en un lote o en verificación: si se presenta a MITECO con la ficha vigente y se resuelve, pierde el factor multiplicador (por FM no se presenta hasta el 15/01/2027).');
    if (r.ficha.startsWith('RES060_FM') && (z === 'D' || z === 'E')) {
        const letras = [ctx.ceeFinal?.emisionesLetra, ctx.ceeFinal?.epnrLetra]
            .filter(Boolean).map((l) => String(l).trim().toUpperCase());
        const fg = letras.find((l) => l === 'F' || l === 'G');
        if (fg) add('aviso', `Zona ${ctx.zona} y CEE final con una ${fg}: se puede pedir, pero hay que aportar el documento firmado por el propietario de que se le ha informado de que, por el aislamiento, la bomba podría no rendir lo previsto (doc. 13).`);
        else if (!letras.length) add('info', `Zona ${ctx.zona}: si el CEE final sale con F o G, hará falta el documento firmado por el propietario de que se le ha informado de que la bomba podría no rendir lo previsto (doc. 13).`);
    }
    if (r.dcalFuente === 'simulacion') add('aviso', `Sin CEE cargado: la D_cal (${n1(r.dcalBruta)} kWh/m²) es la de la simulación. La ficha usa la del CEE POSTERIOR, así que la cifra cambiará con él.`);
    if (r.dcalFuente == null) add('aviso', 'Sin CEE ni demanda de la simulación: no hay D_cal con la que calcular.');
    if (r.clase === 'unifamiliar' && r.dcalTope == null && r.dcalBruta > 0) {
        add('aviso', r.provinciaIndex < 0
            ? 'Falta la provincia: no se ha podido aplicar el tope de la D_cal (2 × la tabla del Anexo IV) y la cifra puede estar alta.'
            : `El Anexo IV no trae datos para ${r.provinciaNombre}: no se ha podido aplicar el tope de la D_cal (2 × la tabla) y la cifra puede estar alta.`);
    }
    if (r.clase === 'unifamiliar' && r.anioSupuesto && r.dcalTope != null) add('aviso', 'Falta el año de construcción: el tope de la D_cal (2 × la tabla del Anexo IV) se ha tomado del tramo 1981-2007.');
    if (r.acsSupuesto || r.acsSinScop) add('aviso', textoFaltaAcs(r));
    if (r.etaPorDefecto) add('aviso', 'Rendimiento de caldera «por defecto»: la ficha toma el del Anexo II según el combustible, la antigüedad y el tipo de la caldera. Elige su fila.');
    if (r.hibridacion && ctx.sinZona) add('aviso', 'No consta la zona climática: se ha usado la ficha de la zona D (RES093_FM).');
    // Clima del SCOP: por la FM la calefacción va en el de la ZONA (logic/climaFm.js).
    if (ctx.climaFm?.sinCalido) add('aviso', `La vía vigente está declarada en clima MEDIO, pero por la FM el SCOP de calefacción tiene que ser el de la zona ${ctx.zona || ''} (clima cálido) y no hay SCOP cálido de este equipo en el catálogo. La cifra FM está calculada con el medio y puede salir alta: hace falta el SCOP cálido del fabricante (o el COP nominal × FC × FP).`);
    if (ctx.climaFm?.ajustado) {
        const cbTxt = ctx.climaFm.cbA != null && ctx.climaFm.cbDe != null && ctx.climaFm.cbA !== ctx.climaFm.cbDe
            ? ` y C_b ${(ctx.climaFm.cbDe * 100).toFixed(2).replace('.', ',')} % → ${(ctx.climaFm.cbA * 100).toFixed(2).replace('.', ',')} %`
            : '';
        add('info', `Por la FM el SCOP de calefacción es el de clima CÁLIDO (zona ${ctx.zona || ''}; Anexo I de la ficha FM, sin el «al menos medio» de la vigente): SCOP ${String(ctx.climaFm.de).replace('.', ',')} → ${String(ctx.climaFm.a).replace('.', ',')}${cbTxt}. La vía vigente sigue en medio.`);
    }
    if (r.hibridacion && ctx.cbSinPotencias) add('aviso', 'Faltan las potencias de la bomba o de la caldera: el C_b no sale de la tabla de la ficha y la cifra puede estar alta.');
    if (ctx.combustible === 'electrica') add('aviso', 'Caldera ELÉCTRICA: la ficha la admite («de combustión o eléctrica») y el Anexo II la trae al 100 %, pero el cuerpo de la Resolución habla de combustibles fósiles. No es seguro que se admita.');

    // ── Lo que se ha aplicado y lo que hay que cumplir ──
    if (r.dcalFuente === 'cee_inicial') add('info', `D_cal y superficie del CEE INICIAL: la ficha usa las del CEE posterior, que en nuestros finales son las mismas (la demanda no cambia al cambiar el generador).`);
    if (r.limitadoPorTabla) add('info', `La D_cal del CEE (${n1(r.dcalBruta)} kWh/m²) pasa del tope de unifamiliar: se usa 2 × ${n1(r.dcalRef)} = ${n1(r.dcalTope)} kWh/m² (Anexo IV, ${r.provinciaNombre}, ${r.yearLabel}).`);
    add('info', `Se presenta del 15/01/2027 al ${fechaEs(finPresentacion)}, con la ficha _FM. Cupo de ${n0(FM_CUPO_KWH / 1e6)} GWh (15 % de la obligación de 2026), por orden de fecha de RESOLUCIÓN: no está garantizado. Lo resuelto con la ficha vigente ya no puede pedirlo.`);
    add('info', r.hibridacion
        ? 'Requisitos: modo bivalente PARALELO; certificado de la instalación con los valores de la fórmula; vivienda habitual (facturas del 1/11 al 31/3 del invierno anterior, > 75 kWh/mes); OFERTA de mantenimiento de 2 años con aceptación o desistimiento; baja tensión; puesta en servicio; CEE posterior registrado (no hace falta el inicial); consentimiento del IRPF; Anexo A. Si se cambia también la caldera, fichas técnicas con las potencias a la temperatura de diseño.'
        : 'Requisitos: bomba hidrónica que cubra calefacción y ACS; caldera retirada o en preinstalación sin hibridar; en D y E, sistema de seguridad (p. ej. resistencias) para temperaturas negativas; certificado de inercia según el fabricante (L y L/kW); OFERTA de mantenimiento de 2 años con aceptación o desistimiento; baja tensión cuando aplique; vivienda habitual (facturas del 1/11 al 31/3 del invierno anterior, > 75 kWh/mes); CEE posterior registrado (no hace falta el inicial); consentimiento del IRPF; Anexo A.');

    const orden = { bloquea: 0, aviso: 1, info: 2 };
    return av.sort((a, b) => orden[a.tono] - orden[b.tono]);
}

// D_cal (kWh/m²·año) y S (m²) de un CEE parseado, o null si no declara demanda.
function demandaDeCee(cee) {
    const d = parseFloat(cee?.demandaCalefaccion);
    if (!(d > 0)) return null;
    const s = parseFloat(cee?.superficieHabitable);
    return { d, s: s > 0 ? s : null };
}

/**
 * Calcula los CAE con la ficha FM que toque: RES060_FM, o la RES09x_FM de su zona
 * si hay hibridación. Devuelve null solo si no hay ni superficie ni demanda con
 * las que calcular.
 */
export function calculateRes060FM({
    provinciaCode,      // código INE '01'..'52' o nombre (solo para el tope de unifamiliar)
    anio,               // año de construcción (solo para el tope de unifamiliar)
    tipo,               // 'unifamiliar' | 'piso' | 'hilera' (en cualquier caja)
    bloque = false,     // edificio con sistema centralizado (tipoInmueble 'bloque')
    plantasEdificio: _plantasEdificio = null, // del borrador: ya no se usa
    zona = null,        // zona climática CTE ('D3'…): ficha de hibridación, D/E, α
    superficie,         // S de la simulación (si el CEE no la trae)
    boilerEff,          // η_i del cálculo vigente
    boilerId = null,    // fila de BOILER_EFFICIENCIES (Anexo II)
    scopHeating,        // SCOP_bdc
    scopAcs,            // SCOP_dhw
    changeAcs = false,  // la bomba cubre también el ACS
    changeHeating = true, // la obra cambia la calefacción (en un BLOQUE puede ser solo el ACS)
    dacs: _dacs = null, // del borrador: la publicada usa d_ACS · S
    qCalefaccion = 0,   // demanda de calefacción de la simulación (kWh/año): D_cal estimada
    ceeFinal = null,    // CEE POSTERIOR parseado: su D_cal y su S MANDAN
    ceeInicial = null,  // sin final, el inicial (misma demanda en nuestros finales)
    cef: _cef = null,   // del borrador: sin tope de CEF
    hibridacion = null, // { coverage, refPower, cb } de calculateHybridization, o null
    fuenteBomba = 'aerotermia', // 'geotermia' | 'hidrotermica' solo si el equipo lo dice
    vulnerable = false, // consumidor vulnerable (×1,5, fichas _FM-S)
    contexto = {},      // { sinCalefaccion, combustible, solido, ceeFinal, inicioObra, finObra, tramite, aireAire, comunidad, hoy, climaFm }
}) {
    const tip = tipologiaFM({ tipo, bloque });
    const fm = tip.fm * (vulnerable ? 1.5 : 1);

    // D_cal y S: CEE final → CEE inicial → simulación.
    const cfin = ceeFinal ?? contexto.ceeFinal ?? null;
    const deFinal = demandaDeCee(cfin);
    const deInicial = deFinal ? null : demandaDeCee(ceeInicial);
    const supApp = parseFloat(superficie) || 0;
    const qCal = Math.max(0, parseFloat(qCalefaccion) || 0);
    let dcalBruta = 0;
    let dcalFuente = null;
    let S = supApp;
    if (deFinal) {
        dcalBruta = deFinal.d; dcalFuente = 'cee_final'; S = deFinal.s || supApp;
    } else if (deInicial) {
        dcalBruta = deInicial.d; dcalFuente = 'cee_inicial'; S = deInicial.s || supApp;
    } else if (qCal > 0 && supApp > 0) {
        dcalBruta = qCal / supApp; dcalFuente = 'simulacion';
    }
    if (!(S > 0) && !(dcalBruta > 0)) return null;

    // Tope de UNIFAMILIAR: mín(D_cal ; 2 × tabla UNI del Anexo IV).
    const pi = provIndex(provinciaCode);
    const yiReal = yearIntervalIndex(anio);
    const anioSupuesto = yiReal < 0;
    const yi = anioSupuesto ? 3 : yiReal;
    const dcalRef = pi >= 0 ? (ANEXO_IV_UNI[pi][yi] || 0) : 0;
    const dcalTope = tip.clase === 'unifamiliar' && dcalRef > 0 ? 2 * dcalRef : null;
    const limitadoPorTabla = dcalTope != null && dcalBruta > dcalTope;
    const dcal = limitadoPorTabla ? dcalTope : dcalBruta;

    // η_i (Anexo II) y combustible sólido.
    const etaApp = parseFloat(boilerEff) || 0;
    const id = String(boilerId || '');
    const eta = ETA_ANEXO_II_FM[id] ?? etaApp;
    const solido = !!contexto.solido || id.startsWith('solid_') || contexto.combustible === 'biomasa';
    const etaPorDefecto = id === 'default';

    const scopB = redondeaScop(scopHeating) || 0;
    const scopD = redondeaScop(scopAcs) || 0;
    const conAcs = !!changeAcs;
    // REGLA — sin ACS en la simulación, la vía FM se calcula COMO SI se añadiera
    // (Fran, 07/11/2026: «que sea un aviso»). La Resolución pide que la bomba dé
    // la calefacción Y el ACS, y su fórmula suma D_ACS = d_ACS · S siempre: lo que
    // falta es el depósito en el presupuesto, y el aviso lo dice. Con el SCOP_dhw
    // que traiga la simulación (el del equipo o el de la app); sin ninguno, la
    // cifra se queda en la calefacción y también se dice. No toca la vía vigente
    // (regla 163) ni el bloque que solo cambia el ACS (ese ya va bloqueado).
    const conCalefaccion = changeHeating !== false;
    const acsSupuesto = !conAcs && conCalefaccion && scopD > 0;
    const acsSinScop = !conAcs && conCalefaccion && !(scopD > 0);
    const dacsFm = conAcs || acsSupuesto ? tip.dAcs * S : 0;

    // Hibridación → la ficha de SU zona, con el C_b de SU tabla.
    const esHib = !!hibridacion;
    const sinZona = esHib && !letraZona(zona);
    const zonaCb = sinZona ? 'D' : zona;
    const tablaCb = esHib ? CB_PARALELO[letraZona(zonaCb)] : null;
    let cb = 1;
    let cbSinPotencias = false;
    if (esHib) {
        const deTabla = hibridacion.refPower > 0 ? cbParaleloFm(zonaCb, hibridacion.coverage, fuenteBomba) : null;
        cbSinPotencias = deTabla == null;
        cb = deTabla ?? (Number.isFinite(hibridacion.cb) ? hibridacion.cb : 1);
    }

    // REGLA — una obra que NO cambia la calefacción (bloque con solo el ACS,
    // `changeHeating: false`) no la cuenta: el servicio fuera de alcance se cancela,
    // como en la vía vigente (regla 45). Y no entra en el FM (aviso que bloquea):
    // la ficha publicada exige que la bomba dé la calefacción Y el ACS.
    const dem = conCalefaccion ? dcal * S : 0; // D_cal · S (kWh/año)
    const ahc = eta > 0 && scopB > 0 ? dem * (1 / eta - 1 / scopB) : 0;
    const aha = (conAcs || acsSupuesto) && eta > 0 && scopD > 0 ? dacsFm * (1 / eta - 1 / scopD) : 0;
    const aes = (ahc + aha) * cb;          // corchete × C_b, SIN f_M
    const cae = Math.max(0, aes * fm);

    const fichaBase = esHib ? tablaCb.ficha : 'RES060_FM';
    const r = {
        normativa: FM_NORMATIVA,
        ficha: vulnerable ? `${fichaBase}-S` : fichaBase,
        hibridacion: esHib,
        cb,
        // La cobertura (tanto por uno, 2 decimales, ≤ 1) y el denominador con los que
        // ha salido ESTE C_b: el CIFO FM los imprime en su página del C_b.
        cobertura: esHib ? (Number.isFinite(Number(hibridacion.coverage)) ? Number(hibridacion.coverage) : null) : null,
        refPower: esHib ? (Number(hibridacion.refPower) || 0) : null,
        zonaCb: tablaCb?.zonas || null,
        fuenteBomba: esGeoOHidro(fuenteBomba) ? 'geotermia/hidrotérmica' : 'aerotermia',
        cae,                 // CAE = kWh/año de ahorro computable
        aes,                 // corchete × C_b, sin f_M
        ahc,
        aha,
        dcal,                // D_cal aplicada (kWh/m²·año)
        dcalBruta,           // la del CEE (o la de la simulación)
        dcalFuente,          // 'cee_final' | 'cee_inicial' | 'simulacion' | null
        dcalRef,             // tabla UNI del Anexo IV (0 si no aplica)
        dcalTope,            // 2 × tabla, solo unifamiliar
        limitadoPorTabla,
        dem,
        dacs: dacsFm,
        dAcsEspecifica: tip.dAcs,
        conAcs,              // la simulación lleva el ACS
        acsSupuesto,         // no lo lleva, y la cifra FM lo suma como si se añadiera
        acsSinScop,          // no lo lleva y no hay SCOP_dhw: la cifra es solo la calefacción
        scopAcs: scopD,
        scopHeating: scopB,
        climaFm: contexto.climaFm || null, // por la FM, SCOP de la zona (logic/climaFm.js)
        conCalefaccion,
        fm,
        eta,
        etaApp,
        etaPorDefecto,
        solido,
        superficie: S,
        provinciaIndex: pi,
        provinciaNombre: pi >= 0 ? RES060FM_PROVINCES[pi] : null,
        yearLabel: RES060FM_YEARS[yi],
        anioSupuesto,
        tipologiaLabel: tip.label,
        clase: tip.clase,
        // Compatibilidad con lo que leía el borrador:
        fc: fm,
        q: dcal,
        tope: null,
        limitedByTope: false,
        cef: null,
        cefFuente: null,
        noAnexoData: false,
    };
    r.avisos = avisosFm(r, { ...contexto, ceeFinal: cfin, zona, sinZona, cbSinPotencias });
    r.elegible = !r.avisos.some((a) => a.tono === 'bloquea');
    return r;
}
/** Alias de cuando era el borrador: todas las llamadas antiguas calculan ya lo publicado. */
export const calculateRes060FC = calculateRes060FM;

/**
 * Contexto de elegibilidad desde los inputs de la calculadora / la oportunidad:
 * sin calefacción, combustible de la caldera y si es de combustible sólido. Lo
 * comparten la calculadora y el expediente, que lee los inputs de su oportunidad.
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
    // Combustible SÓLIDO (biomasa o carbón): fuera del Anexo II publicado.
    const solido = id.startsWith('solid_') || combustible === 'biomasa'
        || (!conFila && /carbon|lena|pellet|biomasa|solido/.test(tipo));
    // Sector TERCIARIO (TER100 / TER173): sin ficha FM (`esSectorTerciario`, sin
    // importarlo para no cruzar con expedientes desde el motor del backend).
    const terciario = norm(inputs.sector) === 'terciario';
    return { sinCalefaccion, combustible, solido, terciario };
}
export const contextoCalderaFm = contextoCalderaFc;

/** Emisor aire-aire (splits o conductos): la bomba no es hidrónica. */
export const esEmisorAireAire = (emisor) => ['splits', 'conductos'].includes(String(emisor || '').trim().toLowerCase());
