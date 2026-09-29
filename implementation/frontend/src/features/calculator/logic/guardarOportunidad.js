/**
 * guardarOportunidad — el cuerpo de `POST /api/oportunidades`, en UN sitio.
 *
 * Lo arma el popup de guardar (SaveOpportunityModal) y también el guardado sin
 * popup que hace ResultsPanel cuando la cifra cambia DENTRO de la propuesta
 * (presupuesto de aerotermia leído del PDF adjunto). Con dos copias del payload,
 * el guardado automático acabaría escribiendo una oportunidad distinta de la que
 * escribe el botón — y no se notaría hasta aceptarla.
 */
export function payloadOportunidad({
    inputs,
    result,
    prescriptorId,
    instaladorId,
    referenciaCliente,
    codClienteInterno,
    nota,
}) {
    // Limpiar 'result' e 'inputs' (anidado) del estado de inputs antes de guardar.
    // Si no se limpia:
    //  - inputs.result quedó residual de una carga previa y crearía inconsistencia
    //    con datos_calculo.result (que es el resultado actual / canónico).
    //  - inputs.inputs causaría recursión tras múltiples saves/loads.
    const { result: _staleResult, inputs: _staleNested, ...cleanInputs } = inputs || {};

    return {
        id_oportunidad: cleanInputs.id_oportunidad, // Pasar el ID para no generar errores 500 o inserciones dobles al editar
        ref_catastral: cleanInputs.rc || 'MANUAL',
        prescriptor_id: prescriptorId || null,
        instalador_asociado_id: instaladorId || null,
        referencia_cliente: referenciaCliente,
        demanda_calefaccion: result?.q_net || 0,
        anio: cleanInputs.anio,
        zona: cleanInputs.zona,
        cliente_id: cleanInputs.cliente_id || null,
        datos_calculo: {
            ...cleanInputs,
            cod_cliente_interno: codClienteInterno,
            inputs: {
                ...cleanInputs,
                cod_cliente_interno: codClienteInterno,
            },
            result,
        },
        nota: (nota || '').trim() || null,
    };
}
