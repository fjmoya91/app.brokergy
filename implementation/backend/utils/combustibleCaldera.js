// ============================================================================
// combustibleCaldera.js — con QUÉ quema la caldera que declara el expediente.
//
// Vivía dentro de `placaOcrService`, que es donde nació (regla 27.d). Se sacó
// al necesitarla la segunda superficie —la revisión del CEE, que cruza este
// combustible con el `<VectorEnergetico>` del certificado—: requerir aquel
// módulo para usar ocho líneas puras arrastra el cliente de Gemini, Drive, el
// transporter de correo y el supervisor de WhatsApp, que se levantan al
// importarlo. Con dos copias, además, el mismo expediente podría decir gasóleo
// por un lado y gas por el otro.
//
// `placaOcrService` la sigue exportando: quien ya la pedía allí no se entera.
// ============================================================================

/**
 * El combustible del expediente, desde su fila de rendimiento.
 *
 * ⚠️ `BOILER_EFFICIENCIES` no tiene fila de GLP ni distingue carbón de
 * biomasa: esas dos las desempata lo que declaró la oportunidad
 * (`inputs.fuelType`). Sin fila de rendimiento no se adivina ninguno.
 */
function combustibleDeclarado(instalacion = {}, inputs = {}) {
    const id = String(instalacion?.caldera_antigua_cal?.rendimiento_id || '');
    if (id.startsWith('gas_')) return inputs?.fuelType === 'glp' ? 'glp' : 'gas_natural';
    if (id.startsWith('oil_')) return 'gasoleo';
    if (id === 'electric') return 'electricidad';
    // solid_*: la tabla no distingue carbón de biomasa; lo dice la oportunidad.
    if (id.startsWith('solid_')) return inputs?.fuelType === 'pellets' ? 'pellets' : 'carbon';
    return null;
}

/**
 * La FAMILIA de un combustible.
 *
 * Hace falta porque la tabla del Anexo VIII NO distingue dentro de la familia:
 * `gas_*` cubre el gas natural y el GLP con la misma fila y el mismo η, y
 * `solid_*` cubre el carbón y la biomasa. Así que comparar el combustible del
 * expediente con el `<VectorEnergetico>` del certificado letra por letra da
 * falsos positivos — medido sobre los 115 expedientes con `.xml` en la BD:
 *
 *   · 25RES060_67  solid_man_no_cal ↔ BiomasaPellet  → la MISMA fila: correcto
 *   · 26RES060_181 gas_pre98_mural  ↔ GLP            → la MISMA fila: solo aviso
 *   · 26RES080_41  gas_post98_auto  ↔ GasoleoC       → OTRA fila: eso sí falla
 *   · 26RES080_83  gas_post98_auto  ↔ GasoleoC       → OTRA fila: eso sí falla
 *
 * Los dos primeros no mueven ni el rendimiento ni el ahorro; los dos últimos
 * cambian la fila del Anexo VIII, y con ella el ahorro que firma el CIFO.
 */
const FAMILIA_DE_COMBUSTIBLE = {
    gas_natural: 'gas',
    glp: 'gas',
    gasoleo: 'liquido',
    pellets: 'solido',
    carbon: 'solido',
    biomasa: 'solido',
    electricidad: 'electricidad',
    biocarburante: 'liquido',
};

const NOMBRE_FAMILIA = {
    solido: 'combustible sólido',
    liquido: 'combustible líquido',
    gas: 'gas',
    electricidad: 'electricidad',
};

const familiaCombustible = (c) => FAMILIA_DE_COMBUSTIBLE[c] || null;

module.exports = {
    combustibleDeclarado,
    familiaCombustible,
    FAMILIA_DE_COMBUSTIBLE,
    NOMBRE_FAMILIA,
};
