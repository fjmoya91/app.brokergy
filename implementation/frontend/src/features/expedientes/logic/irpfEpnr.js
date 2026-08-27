// ─── irpfEpnr.js ─────────────────────────────────────────────────────────────
// ¿El par de certificados sirve para la deducción del IRPF por obras de mejora
// de la eficiencia energética?
//
// Lo que exige la norma (DA 50ª de la Ley del IRPF, introducida por el
// RDL 19/2021) para la deducción de la vivienda: reducir el CONSUMO DE ENERGÍA
// PRIMARIA NO RENOVABLE en al menos un **30 %**, **o** llegar a calificación
// **"A" o "B"** en la escala de ESE MISMO indicador. Basta con una de las dos.
//
// Se compara el CEE de antes con el de después, y los dos datos salen del `.xml`
// del certificado: `<Consumo><EnergiaPrimariaNoRenovable><Global>` para el número
// y `<Calificacion><EnergiaPrimariaNoRenovable><Global>` para la letra.
//
// REGLA — la letra que cuenta es la del CONSUMO DE ENERGÍA PRIMARIA NO RENOVABLE,
// no la de EMISIONES. Un certificado trae las dos y casi nunca coinciden: en el
// CEE medido, D en emisiones y E en consumo. Mirar la de emisiones daría por
// buena una vivienda que no cumple, y al revés.
//
// REGLA — esto INFORMA, no decide. Que el certificado cumpla el requisito
// TÉCNICO no es que el cliente tenga derecho a la deducción: hay plazos de
// expedición, base máxima anual y la situación de cada declaración. Por eso el
// aviso habla del certificado ("el ahorro certificado es del 41,6 %") y nunca
// afirma que le corresponda un dinero.

/** Ahorro mínimo exigido, en % del consumo de energía primaria no renovable. */
export const UMBRAL_AHORRO = 30;

/** Calificaciones que valen por sí solas, sin mirar el ahorro. */
export const LETRAS_QUE_CUMPLEN = ['A', 'B'];

/** Holgura al comparar superficies, la misma que se usa al cruzar los dos CEE. */
const TOLERANCIA_SUPERFICIE = 0.02;

/**
 * Los dos datos que hacen falta de un CEE ya parseado (`parseCeeXml`).
 * Devuelve null si ese certificado no los trae — pasa con los cargados por OCR
 * de un PDF: la tabla de consumo no se imprime con el detalle que hace falta.
 */
export function datosEpnr(cee) {
    if (!cee) return null;
    const consumo = Number(cee.epnrConsumo);
    if (!isFinite(consumo) || consumo <= 0) return null;
    const letra = typeof cee.epnrLetra === 'string' && /^[A-G]$/i.test(cee.epnrLetra)
        ? cee.epnrLetra.toUpperCase() : null;
    return {
        consumo,
        letra,
        escala: cee.epnrEscala || null,
        superficie: Number(cee.superficieHabitable) || null,
    };
}

/**
 * @param {object|null} inicial  CEE de antes de la obra, ya parseado
 * @param {object|null} final    CEE de después
 * @returns {{
 *   estado: 'ok'|'faltan_datos',
 *   falta?: string[],            qué certificado falta, en lenguaje de tarea
 *   cumple?: boolean,
 *   porAhorro?: boolean,
 *   porLetra?: boolean,
 *   ahorroPct?: number,
 *   consumoIni?: number, consumoFin?: number,
 *   letraFin?: string|null,
 *   faltaParaB?: number|null,    kWh/m²·año que sobran para llegar a la B
 *   avisos?: string[]
 * }}
 */
export function comprobarIrpf(inicial, final) {
    const ini = datosEpnr(inicial);
    const fin = datosEpnr(final);

    if (!ini || !fin) {
        const falta = [];
        // Se distingue "no está" de "está pero no sirve": son dos tareas
        // distintas —conseguir el certificado, o conseguir su .xml— y decir
        // solo "faltan datos" manda a buscar lo que ya se tiene.
        if (!ini) falta.push(inicial ? 'El CEE inicial no trae el consumo de energía primaria no renovable: hace falta su .xml (un PDF leído por OCR no lo da).' : 'Falta el CEE inicial.');
        if (!fin) falta.push(final ? 'El CEE final no trae el consumo de energía primaria no renovable: hace falta su .xml (un PDF leído por OCR no lo da).' : 'Falta el CEE final.');
        return { estado: 'faltan_datos', falta };
    }

    // El indicador de la norma es por metro cuadrado, y los dos certificados son
    // de la MISMA vivienda, así que se comparan tal cual vienen.
    const ahorroPct = ((ini.consumo - fin.consumo) / ini.consumo) * 100;
    const porAhorro = ahorroPct >= UMBRAL_AHORRO;
    const porLetra = !!fin.letra && LETRAS_QUE_CUMPLEN.includes(fin.letra);

    const avisos = [];
    // Si las superficies no casan, uno de los dos certificados es de otra cosa —o
    // está mal medido—, y entonces el porcentaje compara dos edificios distintos.
    if (ini.superficie && fin.superficie) {
        const dif = Math.abs(ini.superficie - fin.superficie) / ini.superficie;
        if (dif > TOLERANCIA_SUPERFICIE) {
            avisos.push(`Los dos certificados declaran superficies distintas (${ini.superficie} m² y ${fin.superficie} m²). Compruébalo: el indicador es por metro cuadrado, así que si una de las dos está mal el porcentaje no vale.`);
        }
    }
    if (ahorroPct < 0) {
        avisos.push('El consumo del CEE final es MAYOR que el del inicial. Suele significar que los certificados están intercambiados o que son de viviendas distintas.');
    }

    // Cuánto falta para la B, que es la otra vía. Se dice solo si no cumple ya:
    // es lo que permite decidir si merece la pena una medida más.
    let faltaParaB = null;
    const umbralB = fin.escala?.B;
    if (!porLetra && isFinite(umbralB) && umbralB > 0 && fin.consumo > umbralB) {
        faltaParaB = fin.consumo - umbralB;
    }

    return {
        estado: 'ok',
        cumple: porAhorro || porLetra,
        porAhorro,
        porLetra,
        ahorroPct,
        consumoIni: ini.consumo,
        consumoFin: fin.consumo,
        letraIni: ini.letra,
        letraFin: fin.letra,
        umbralB: isFinite(umbralB) ? umbralB : null,
        faltaParaB,
        avisos,
    };
}
