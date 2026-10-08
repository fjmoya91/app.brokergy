// ─── autoconsumoMensual.js ───────────────────────────────────────────────────
// El AUTOCONSUMO fotovoltaico MES A MES que se declara en CE3X 3.2: cada mes, lo
// MENOR entre lo que producen las placas (PVGIS) y lo que el edificio consume de
// electricidad ese mes en los servicios del certificado.
//
// Por qué (CE3X 3.2 y su «Ampliación del manual de usuario», 08/10/2026):
//   · la fotovoltaica va SIEMPRE en «Generación renovable eléctrica», con la
//     potencia pico y el autoconsumo mensual (manual, 7.1); «Contribuciones
//     energéticas» no debe usarse para ella;
//   · el autoconsumo que cuenta es el de los usos EPB —calefacción,
//     refrigeración, ACS y, fuera del residencial privado, iluminación—, y lo
//     calcula el técnico: CE3X no lo hace por él;
//   · CE3X solo usa el TOTAL anual (medido: el mismo total repartido en verano,
//     en invierno o plano da la MISMA calificación), pero AVISA de cada mes en
//     que el autoconsumo pasa del consumo eléctrico de ese mes, con su consumo.
//     Medido en 2026CEE_58: la curva de PVGIS de 8.170 kWh dejaba seis meses
//     avisados (junio: 777 kWh frente a 109 de consumo).
//
// REGLA — cada mes, mín(producción PVGIS, consumo del mes) (decisión del usuario,
// 08/10/2026: «si la producción supera la de autoconsumo permitida se pone la de
// autoconsumo, si no la producción PVGIS; la máxima se obtiene del XML»).
//
// REGLA — el consumo del mes sale del XML y se reparte como lo reparte CE3X. El
// XML trae el consumo eléctrico ANUAL de cada servicio (kWh/m²·año) y la
// superficie de cálculo; CE3X lo reparte por meses así (medido con su propio
// código, coincide a menos del 0,5 % con sus avisos):
//     consumo(mes) = S · (Cal · cCal[mes] + Ref · cRef[mes] + (ACS + Ilu) · días/365)
// donde cCal y cRef son el reparto mensual de SU demanda de calefacción y de
// refrigeración. Ese reparto depende sobre todo del clima: aquí va la MEDIA por
// zona climática medida con CE3X 3.2 (`PERFILES`, con cuántos edificios). En el
// PC, el oráculo lo AJUSTA con el consumo exacto que calcula CE3X para ese
// edificio (`cexAPdf.js`, `cex_a_xml.py` con AJUSTAR_AUTOCONSUMO): la app propone
// y CE3X tiene la última palabra.
//
// Puro, sin imports: lo usan la ficha del `.cex` (también desde el backend), la
// barra ⚡ y su test.
// ─────────────────────────────────────────────────────────────────────────────

export const DIAS_MES = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

//: El reparto de ACS (y de iluminación) de CE3X: los días de cada mes / 365.
export const REPARTO_DIAS = DIAS_MES.map(d => d / 365);

//: El reparto MENSUAL de la demanda de calefacción (`cal`) y de refrigeración
//: (`ref`) con el que CE3X 3.2 reparte su consumo (sus `coeficientesCal` y
//: `coeficientesRef`), por zona climática. MEDIDO con el propio CE3X 3.2 el
//: 08/10/2026 (oráculo, `tools/oraculo_ce3x/perfil_mensual.py`): 14 viviendas
//: reales de D3, de 50 a 815 m², calculadas en cada una de las doce zonas
//: peninsulares; aquí, la media. Depende sobre todo del clima: 11 viviendas
//: reales de D2 dan el mismo reparto de calefacción que las de D3 pasadas a D2
//: (máx. 0,002 de diferencia). Entre edificios de una misma zona cambia algo:
//: hasta 0,03 en calefacción y 0,13 en refrigeración en un mes —por eso en el
//: PC manda el consumo exacto de CE3X—.
export const PERFILES = {
    A3: { cal: [0.2664, 0.1921, 0.1424, 0.0626, 0.002, 0, 0, 0, 0, 0, 0.0998, 0.2347],
          ref: [0.005, 0.0082, 0.0176, 0.0344, 0.0944, 0.0997, 0.301, 0.2906, 0.0768, 0.0573, 0.0101, 0.0049] },
    A4: { cal: [0.2667, 0.1923, 0.1425, 0.0626, 0.002, 0, 0, 0, 0, 0, 0.0989, 0.2349],
          ref: [0.0031, 0.0051, 0.011, 0.0214, 0.0587, 0.1008, 0.3525, 0.3217, 0.0814, 0.0348, 0.0065, 0.003] },
    B3: { cal: [0.2509, 0.1812, 0.1355, 0.067, 0.0039, 0, 0, 0, 0, 0.0017, 0.1256, 0.2341],
          ref: [0.003, 0.0058, 0.0137, 0.0286, 0.0843, 0.1071, 0.3189, 0.3114, 0.0812, 0.037, 0.0063, 0.0027] },
    B4: { cal: [0.251, 0.1809, 0.1354, 0.0669, 0.004, 0, 0, 0, 0, 0.0017, 0.126, 0.2341],
          ref: [0.0018, 0.0035, 0.0083, 0.0173, 0.0509, 0.1046, 0.3713, 0.329, 0.0863, 0.0219, 0.0037, 0.0016] },
    C1: { cal: [0.2011, 0.1525, 0.1248, 0.0842, 0.0277, 0.0345, 0.0004, 0.0005, 0.0235, 0.0323, 0.1283, 0.1901],
          ref: [0.0037, 0.0081, 0.0268, 0.0548, 0.1509, 0.1232, 0.2799, 0.2232, 0.0711, 0.0474, 0.0079, 0.003] },
    C2: { cal: [0.2119, 0.1607, 0.1316, 0.0888, 0.0292, 0.0052, 0, 0, 0.0032, 0.0335, 0.1356, 0.2004],
          ref: [0.002, 0.0043, 0.0142, 0.029, 0.0792, 0.1172, 0.3723, 0.2824, 0.0681, 0.0257, 0.0041, 0.0016] },
    C3: { cal: [0.2137, 0.1621, 0.1327, 0.0896, 0.0295, 0, 0, 0, 0, 0.0341, 0.1364, 0.202],
          ref: [0.001, 0.0022, 0.0072, 0.0147, 0.0401, 0.1204, 0.3637, 0.3427, 0.0924, 0.0128, 0.0021, 0.0008] },
    C4: { cal: [0.2136, 0.162, 0.1326, 0.0895, 0.0295, 0, 0, 0, 0, 0.0342, 0.1367, 0.2018],
          ref: [0.0006, 0.0012, 0.0041, 0.0085, 0.0231, 0.1111, 0.3913, 0.3598, 0.0915, 0.0072, 0.0012, 0.0004] },
    D1: { cal: [0.1954, 0.1461, 0.1242, 0.0823, 0.0309, 0.0249, 0.0003, 0.0003, 0.0169, 0.0503, 0.1369, 0.1916],
          ref: [0.0022, 0.0075, 0.0222, 0.0494, 0.1485, 0.1245, 0.2921, 0.2357, 0.0734, 0.0376, 0.0052, 0.0017] },
    D2: { cal: [0.2028, 0.1516, 0.1289, 0.0855, 0.0321, 0.0037, 0, 0, 0.0023, 0.0523, 0.1418, 0.199],
          ref: [0.0011, 0.0039, 0.0114, 0.0254, 0.0758, 0.1203, 0.3773, 0.2937, 0.0681, 0.0193, 0.0028, 0.0009] },
    D3: { cal: [0.204, 0.1525, 0.1297, 0.086, 0.0323, 0, 0, 0, 0, 0.0525, 0.1431, 0.1999],
          ref: [0.0006, 0.002, 0.0058, 0.0129, 0.0384, 0.1198, 0.3641, 0.3506, 0.0944, 0.0096, 0.0013, 0.0005] },
    E1: { cal: [0.1789, 0.1423, 0.1278, 0.0952, 0.0508, 0.0191, 0.0002, 0.0002, 0.0126, 0.0667, 0.1328, 0.1733],
          ref: [0.002, 0.005, 0.016, 0.0348, 0.1019, 0.1409, 0.3244, 0.2617, 0.0821, 0.0252, 0.0041, 0.0017] },
};

//: Sin zona conocida, la de casi todos nuestros expedientes.
export const ZONA_POR_DEFECTO = 'D3';

/** El perfil de una zona («D3», «d3», «α3»…) y si es el suyo o el más cercano. */
export function perfilDeZona(zona) {
    const z = String(zona || '').trim().toUpperCase()
        .replace(/^Α/, 'A').replace(/^ALFA/, 'A');
    if (PERFILES[z]) return { ...PERFILES[z], zona: z, exacta: true };
    // Las de Canarias (A1c…) y las α: la misma letra con el verano más cercano.
    const m = z.match(/^([A-E])(\d)/);
    if (m) {
        const mismas = Object.keys(PERFILES).filter(k => k[0] === m[1])
            .sort((a, b) => Math.abs(Number(a[1]) - Number(m[2])) - Math.abs(Number(b[1]) - Number(m[2])));
        if (mismas.length) return { ...PERFILES[mismas[0]], zona: mismas[0], exacta: false };
    }
    return { ...PERFILES[ZONA_POR_DEFECTO], zona: ZONA_POR_DEFECTO, exacta: false };
}

/**
 * El consumo eléctrico de cada mes en los servicios del certificado, en kWh.
 *
 * La iluminación es EPB solo fuera del residencial privado (manual de la 3.2,
 * 7.1), y en una vivienda el XML ya la trae a 0: se suma siempre.
 *
 * @param {object} c  `leerConsumoElectricoDeTexto(xml)`: `{ cal, ref, acs, ilu }`
 *                    en kWh/m²·año, `superficie` (m²) y `zona`
 * @returns {{ meses: number[], anual: number, zona: string, exacta: boolean }|null}
 */
export function consumoElectricoMensual(c) {
    const S = Number(c?.superficie);
    if (!c || !(S > 0)) return null;
    const p = perfilDeZona(c.zona);
    const n = (v) => Math.max(0, Number(v) || 0);
    const meses = DIAS_MES.map((_, i) => S * (
        n(c.cal) * p.cal[i] + n(c.ref) * p.ref[i]
        + (n(c.acs) + n(c.ilu)) * REPARTO_DIAS[i]));
    const anual = meses.reduce((a, b) => a + b, 0);
    if (!(anual > 0)) return null;
    return { meses: meses.map(v => Math.round(v * 100) / 100), anual: Math.round(anual),
             zona: p.zona, exacta: p.exacta };
}

/**
 * Lo que se declara cada mes: lo menor entre lo producido y lo permitido.
 *
 * Los meses recortados se quedan en el kWh ENTERO de debajo: CE3X avisa con
 * «supera», y redondear hacia arriba volvería a disparar el aviso.
 *
 * @param {number[]} produccion  los doce kWh de PVGIS (los de los kWp de la obra)
 * @param {number[]|null} permitido los doce kWh de consumo (o null: sin XML no
 *                    se limita, y lo dice quien llama)
 * @returns {{ meses: number[], anual: number, recortados: number[] }}
 */
export function autoconsumoMensual(produccion, permitido) {
    const prod = (produccion || []).map(v => Math.max(0, Number(v) || 0));
    if (prod.length !== 12) return null;
    const recortados = [];
    const meses = prod.map((p, i) => {
        const tope = Array.isArray(permitido) && permitido.length === 12 ? Number(permitido[i]) : null;
        if (tope !== null && Number.isFinite(tope) && p > tope) {
            recortados.push(i);
            return Math.max(0, Math.floor(tope));
        }
        return p;
    });
    return { meses, anual: meses.reduce((a, b) => a + b, 0), recortados };
}

export const NOMBRES_MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
                            'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
