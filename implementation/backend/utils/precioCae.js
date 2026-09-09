// ============================================================================
// precioCae.js — El PRECIO CAE del cliente queda SELLADO en la oportunidad.
// ----------------------------------------------------------------------------
// La calculadora guarda el precio en `inputs.caePriceClient`, pero la economía
// del EXPEDIENTE lee `inputs.cae_client_rate`. Son dos nombres para el mismo
// dato, y por eso el precio que se teclea no llegaba al expediente: caía a su
// respaldo (95 €/MWh, 60 en RES080). Medido el 09/09/2026 sobre producción:
// **66 expedientes** tienen un precio tecleado —de 88 a 150 €/MWh— que su panel
// ignora, y en 48 de ellos eso hace que el panel diga que le debemos al cliente
// MENOS de lo que su propuesta firmada le prometía.
//
// REGLA — el sello se escribe en las oportunidades NUEVAS y, una vez escrito, se
// mantiene al día. Las ANTERIORES no se marcan nunca: su economía se calculó con
// el respaldo, hay expedientes en marcha sobre esas cifras y no pueden moverse
// porque hoy cambie la tarifa. Por eso la condición es "no existía" o "ya lo
// trae", jamás "existe".
//
// REGLA — no hace falta ninguna marca de fecha. La PRESENCIA de la clave ES la
// marca, y además es la que el expediente ya leía: un `cae_client_rate` escrito
// significa "esta oportunidad lleva su precio encima". Una fecha de corte habría
// que explicarla cada vez que alguien lea el código, y se rompe al migrar datos.
//
// REGLA — se mantiene al día, no solo al crear. Si solo se sellara en el alta,
// cambiar el precio después dejaría el sello viejo y el expediente calcularía con
// una tarifa que ya nadie ve en la calculadora — peor que el fallo que arregla.
// ============================================================================

/**
 * Deja `inputs.cae_client_rate` como corresponda, EN EL SITIO (muta `inputs`).
 *
 * @param {object} inputs           `datos_calculo.inputs` que se va a guardar
 * @param {object|null} existingOp  el registro que ya había en BD, o null si es nueva
 * @returns {object} el mismo `inputs`, por comodidad
 */
function sellarPrecioCae(inputs, existingOp) {
    if (!inputs || typeof inputs !== 'object') return inputs;

    const yaSellada = existingOp?.datos_calculo?.inputs?.cae_client_rate !== undefined;
    const precio = parseFloat(inputs.caePriceClient);

    if ((!existingOp || yaSellada) && precio > 0) {
        inputs.cae_client_rate = precio;
    } else if (existingOp && !yaSellada) {
        // Un reguardado de una oportunidad anterior no puede ESTRENAR el sello:
        // eso le cambiaría el bono a un expediente que ya está en marcha.
        delete inputs.cae_client_rate;
    }
    return inputs;
}

module.exports = { sellarPrecioCae };
