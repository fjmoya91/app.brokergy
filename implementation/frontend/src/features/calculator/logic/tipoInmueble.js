// ============================================================================
// tipoInmueble.js — FUENTE ÚNICA de qué es el objeto de la simulación: una VIVIENDA
// o un BLOQUE de viviendas (el edificio completo).
// ----------------------------------------------------------------------------
// La app nació para una vivienda: una superficie, una caldera, un titular. Un bloque
// con instalación centralizada es el mismo negocio y la MISMA ficha —la RES060 dice
// literalmente "Sustitución de la caldera de combustión en un EDIFICIO de uso
// residencial privado […] para calefacción Y/O agua caliente sanitaria", y sus
// variables hablan de "demanda […] del EDIFICIO o vivienda"—, pero cambia tres cosas
// que estaban dadas por supuestas:
//
//   1. La DEMANDA y la SUPERFICIE salen del certificado del edificio, no de una
//      estimación por envolvente: el motor de `calculateDemand` modela UNA vivienda
//      (fachadas, patios, planta) y aplicado a un bloque no significa nada.
//   2. El ahorro puede alcanzar SOLO el ACS. Hasta ahora la calefacción se sumaba
//      siempre; en un bloque es habitual que la caldera centralizada dé solo el agua
//      caliente y que cada vivienda tenga su calefacción.
//   3. El titular es la COMUNIDAD DE PROPIETARIOS: un CIF, un IBAN, un convenio de
//      cesión. El bono CAE es uno solo, y la deducción del IRPF la aplica cada
//      propietario en su declaración.
//
// Módulo ESM PURO (sin React ni Node) para poder importarlo desde los dos lados.
// ============================================================================

export const TIPO_INMUEBLE = { VIVIENDA: 'vivienda', BLOQUE: 'bloque' };

/** ¿La simulación es de un edificio completo? */
export function esBloque(inputs = {}) {
    return inputs?.tipoInmueble === TIPO_INMUEBLE.BLOQUE;
}

/**
 * Clasifica el `<TipoDeEdificio>` que declara el .xml del certificado.
 *
 * REGLA — se compara por SUBCADENA normalizada, no contra una lista de cadenas
 * exactas. El enum del esquema oficial se escribe de varias formas según la
 * herramienta que genere el XML ("BloqueViviendaCompleto", "BloqueDeViviendasCompleto",
 * "Bloque de viviendas completo"), y de los 462 certificados reales de la carpeta de
 * casos NINGUNO es de bloque completo: no hay forma de verificar hoy la cadena exacta,
 * así que casarla a ciegas es apostar a que el primer bloque real la escriba igual.
 * Lo que sí es estable es que diga "bloque" y "completo".
 *
 * Ante la duda devuelve null —"no consta"—, que NO es lo mismo que "es una vivienda":
 * un tipo desconocido no puede apagar ni encender nada por su cuenta.
 */
export function clasificarTipoEdificio(raw) {
    const t = String(raw || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z]/g, '');
    if (!t) return null;
    if (t.includes('bloque') && t.includes('completo')) return TIPO_INMUEBLE.BLOQUE;
    if (t.includes('bloque')) return TIPO_INMUEBLE.VIVIENDA;      // vivienda individual en bloque
    if (t.includes('unifamiliar')) return TIPO_INMUEBLE.VIVIENDA;
    if (t.includes('terciario')) return 'terciario';
    return null;
}

/** Etiqueta legible del tipo declarado por el certificado, para poder enseñarlo. */
export function etiquetaTipoEdificio(raw) {
    switch (clasificarTipoEdificio(raw)) {
        case TIPO_INMUEBLE.BLOQUE: return 'Bloque de viviendas completo';
        case TIPO_INMUEBLE.VIVIENDA: return 'Vivienda';
        case 'terciario': return 'Edificio o local de uso terciario';
        default: return raw ? String(raw) : null;
    }
}

/**
 * ¿El certificado cargado contradice el objeto declarado en la simulación?
 *
 * No decide nada por su cuenta: devuelve el aviso para que lo lea una persona. Un CEE
 * de una vivienda suelta aplicado a un bloque da una demanda de ACS ~100 veces menor
 * que la real, y al revés infla el ahorro de un piso con el del edificio entero — las
 * dos cosas acaban firmadas en una propuesta.
 */
export function avisoTipoEdificio(inputs = {}, ceeShape = null) {
    const declarado = clasificarTipoEdificio(ceeShape?.tipoEdificio);
    if (!declarado) return null;
    const bloque = esBloque(inputs);
    if (declarado === TIPO_INMUEBLE.BLOQUE && !bloque) {
        return 'El certificado cargado es de un BLOQUE DE VIVIENDAS COMPLETO, pero la simulación es de una vivienda. Su demanda y su superficie son las del edificio entero.';
    }
    if (declarado === TIPO_INMUEBLE.VIVIENDA && bloque) {
        return 'El certificado cargado es de UNA VIVIENDA, pero la simulación es del edificio completo. Para un bloque hace falta el certificado del edificio.';
    }
    if (declarado === 'terciario' && bloque) {
        return 'El certificado cargado es de uso TERCIARIO, no residencial: revisa el sector de la simulación.';
    }
    return null;
}

/**
 * El requisito que condiciona la deducción del IRPF por obras en el EDIFICIO (60 %,
 * DA 50ª LIRPF): reducir al menos un 30 % el consumo de energía primaria no renovable,
 * o alcanzar la letra A o B en ESE indicador — acreditado con los certificados de
 * antes y después del edificio.
 *
 * Aquí solo se enuncia: comprobarlo exige el certificado POSTERIOR, que en una
 * simulación todavía no existe (lo hace `logic/irpfEpnr.js` sobre el expediente).
 * Se enuncia igualmente porque una propuesta que promete 9.000 € por vivienda sin
 * decir de qué depende se lee como un derecho adquirido.
 */
export const IRPF_EDIFICIO_REQUISITO =
    'La deducción exige que el certificado posterior acredite una reducción de al menos el 30 % '
    + 'del consumo de energía primaria no renovable del edificio, o alcanzar la letra A o B en ese '
    + 'indicador. Con una actuación solo sobre el ACS hay que comprobarlo antes de prometerla.';
