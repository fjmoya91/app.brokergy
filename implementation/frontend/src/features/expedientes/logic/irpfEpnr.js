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

const m2 = (v) => Number(v).toLocaleString('es-ES', { maximumFractionDigits: 2 });
const fechaEs = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/**
 * Los dos datos que hacen falta de un CEE ya parseado (`parseCeeXml`, o un PDF
 * leído por OCR y pasado por `ceeToXmlShape`, que deja los MISMOS campos).
 * Devuelve null si ese certificado no los trae — pasa con los PDF cargados
 * antes de que el lector supiera leer este dato (2026-10-01).
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
        fecha: /^\d{4}-\d{2}-\d{2}/.test(cee.fechaFirma || '') ? cee.fechaFirma.slice(0, 10) : null,
    };
}

// Qué se le dice a quien mira cuando falta uno de los dos datos. Se distingue
// "no se ha cargado" de "se cargó pero no trae el dato": son dos tareas distintas
// y decir solo "falta el CEE" manda a buscar un certificado que casi siempre YA
// se tiene.
//
// ⚠️ Que el `.xml` esté en la carpeta de Drive NO basta: el dato sale de
// parsearlo, y eso solo ocurre al subirlo por la casilla .XML de la rejilla.
// Decir "falta el CEE inicial" delante de una carpeta que lo tiene es
// exactamente el mensaje que hace perder el rato.
const pedirXml = (fase) => `Falta cargar el .xml del CEE ${fase} en la casilla .XML de la rejilla. Tenerlo en la carpeta de Drive no basta: el consumo sale de leer el fichero.`;
const sinDato = (fase) => `El CEE ${fase} se cargó de un PDF y no trae leído su consumo de energía primaria no renovable. Vuelve a cargarlo con «Cargar CEE por fichero» (el lector ya lo saca del PDF) o sube su .xml.`;

/** Los textos de siempre: las dos fases de un expediente (CAE o CEE directo doble). */
export const FALTA_DOS_FASES = {
    inicial: { no_cargado: pedirXml('inicial'), sin_dato: sinDato('inicial') },
    final: { no_cargado: pedirXml('final'), sin_dato: sinDato('final') },
};

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
export function comprobarIrpf(inicial, final, {
    falta: textosFalta = FALTA_DOS_FASES,
    // Cómo se llama cada certificado en los avisos. En un CEE directo de un solo
    // certificado el de antes es el que trajo el cliente (de otro técnico) y el
    // de después es el nuestro: llamarlos "inicial" y "final" confunde, porque el
    // nuestro vive en la fase que el módulo llama inicial.
    rotulos = { inicial: 'CEE inicial', final: 'CEE final' },
} = {}) {
    const ini = datosEpnr(inicial);
    const fin = datosEpnr(final);

    if (!ini || !fin) {
        const falta = [];
        const texto = (fase, cargado) => textosFalta[fase]?.[cargado ? 'sin_dato' : 'no_cargado']
            || FALTA_DOS_FASES[fase][cargado ? 'sin_dato' : 'no_cargado'];
        if (!ini) falta.push(texto('inicial', !!inicial));
        if (!fin) falta.push(texto('final', !!final));
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
            avisos.push(`Los dos certificados declaran superficies distintas (${m2(ini.superficie)} m² y ${m2(fin.superficie)} m²). Compruébalo: el indicador es por metro cuadrado, así que si una de las dos está mal el porcentaje no vale.`);
        }
    }
    if (ahorroPct < 0) {
        avisos.push(`El consumo del ${rotulos.final} es MAYOR que el del ${rotulos.inicial}. Suele significar que los certificados están intercambiados o que son de viviendas distintas.`);
    }
    // El de antes tiene que ser ANTERIOR: si no, lo que se está comparando no es
    // la vivienda antes y después de la obra.
    if (ini.fecha && fin.fecha && ini.fecha > fin.fecha) {
        avisos.push(`El ${rotulos.inicial} (${fechaEs(ini.fecha)}) es POSTERIOR al ${rotulos.final} (${fechaEs(fin.fecha)}). Comprueba que no están intercambiados.`);
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
        fechaIni: ini.fecha,
        fechaFin: fin.fecha,
        letraFin: fin.letra,
        umbralB: isFinite(umbralB) ? umbralB : null,
        faltaParaB,
        avisos,
    };
}
