/**
 * ============================================================================
 * FICHA RES060FC (PROPUESTA) — CAEs MÁXIMOS CON FACTOR DE CORRECCIÓN
 * ============================================================================
 *
 * Adaptación del prototipo `prototypes/calculadora-cae-res060fc` a la app.
 *
 * Fórmula del borrador:
 *   AE_TOTAL = Mínimo( AES ; 0,70 · CEF ) × f_C
 *   AES      = (D_CAL · S)·(1/η_i − 1/SCOP_bdc) + [ D_ACS·(1/η_i − 1/SCOP_dhw) ]·f_C
 *
 * - D_CAL sale del ANEXO IV (kWh/m²·año) por provincia + intervalo de año de
 *   construcción + tipología. NO usa la demanda estimada/CEE de la app: ese es
 *   precisamente el cambio de la ficha nueva.
 * - η_i y SCOPs: los MISMOS que el cálculo RES060 actual de la app (a propósito,
 *   igual que hace el prototipo, para que la comparativa sea limpia).
 * - El f_C multiplica el término de ACS dentro de AES Y de nuevo todo el mínimo.
 *   Es el literal del borrador (probable errata) y se respeta a propósito.
 * - CEF = consumo de energía final previo (kWh/año). La app lo deriva del
 *   consumo actual calculado (calefacción + ACS con la caldera vieja).
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
    const n = parseInt(code, 10);
    if (!Number.isFinite(n) || n < 1 || n > 52) return -1;
    return n >= 51 ? 50 : n - 1; // Ceuta (51) y Melilla (52) comparten fila
}

/** Año de construcción → índice del intervalo del Anexo IV. */
export function yearIntervalIndex(anio) {
    const y = parseInt(anio, 10);
    if (!Number.isFinite(y) || y <= 0) return 3; // fallback razonable: 1981-2007
    if (y <= 1940) return 0;
    if (y <= 1960) return 1;
    if (y <= 1980) return 2;
    if (y <= 2007) return 3;
    if (y <= 2012) return 4;
    if (y <= 2019) return 5;
    return 6;
}

// Tipología de la app → tabla del Anexo IV y f_C de la ficha.
// 'hilera' (adosada) es unifamiliar a efectos de la ficha. Para 'piso' usamos la
// tabla de bloques de 1-3 plantas (la app no registra las plantas del edificio);
// f_C de piso = 2,5 según la ficha (2 en el cuerpo de la Resolución).
function tipologiaFC(tipo) {
    if (tipo === 'piso') return { table: 'P13', fc: 2.5, label: 'Piso en bloque (1-3 pl.)' };
    return { table: 'UNI', fc: 2, label: tipo === 'hilera' ? 'Unifamiliar (adosada)' : 'Unifamiliar' };
}

/**
 * Calcula los CAEs máximos según la propuesta de ficha RES060FC.
 * Devuelve null si no hay provincia (el Anexo IV es por provincia).
 */
export function calculateRes060FC({
    provinciaCode,   // código INE '01'..'52' (inputs.provincia)
    anio,            // año de construcción
    tipo,            // 'unifamiliar' | 'piso' | 'hilera'
    superficie,      // S (m²) — la misma que usa el cálculo actual
    boilerEff,       // η_i de la caldera sustituida (Anexo II)
    scopHeating,     // SCOP_bdc
    scopAcs,         // SCOP_dhw
    changeAcs = false, // incluir ACS en el ahorro
    dacs = 2731.4,   // D_ACS (kWh/año)
    cef = 0,         // consumo de energía final previo (kWh/año)
    vulnerable = false // consumidor vulnerable severo (×1,5)
}) {
    const pi = provIndexFromCode(provinciaCode);
    if (pi < 0) return null;

    const yi = yearIntervalIndex(anio);
    const { table, fc: fcBase, label: tipologiaLabel } = tipologiaFC(tipo);
    const q = ANEXO_IV[table][pi][yi] || 0;
    const fc = fcBase * (vulnerable ? 1.5 : 1);

    const S = parseFloat(superficie) || 0;
    const eta = parseFloat(boilerEff) || 0;
    const scopB = parseFloat(scopHeating) || 0;
    const scopD = parseFloat(scopAcs) || 0;
    const cefNum = Math.max(0, parseFloat(cef) || 0);

    const dem = q * S; // D_CAL · S (kWh/año)
    const ahc = eta > 0 && scopB > 0 ? dem * (1 / eta - 1 / scopB) : 0;
    const ahaFC = (changeAcs && eta > 0 && scopD > 0 ? dacs * (1 / eta - 1 / scopD) : 0) * fc;
    const aes = ahc + ahaFC;
    const tope = 0.70 * cefNum;
    const cae = Math.max(0, Math.min(aes, tope) * fc);

    return {
        cae,                 // CAEs = kWh/año de ahorro computable
        aes,
        tope,
        limitedByTope: aes > tope, // true → manda el 70%·CEF; false → techo técnico
        q,                   // valor Anexo IV (kWh/m²·año)
        dem,
        ahc,
        ahaFC,
        fc,
        eta,
        superficie: S,
        cef: cefNum,
        provinciaIndex: pi,
        provinciaNombre: RES060FC_PROVINCES[pi],
        yearLabel: RES060FC_YEARS[yi],
        tipologiaLabel,
        // Provincias sin datos en el Anexo IV del borrador (Canarias, Ceuta y Melilla)
        noAnexoData: q <= 0,
    };
}
