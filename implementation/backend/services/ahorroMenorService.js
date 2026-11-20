// ============================================================================
// ahorroMenorService.js — DECIDIR qué se le paga a un cliente cuyo ahorro
// verificado ha salido MENOR que el declarado (regla 226, Fran 18/11/2026).
// ----------------------------------------------------------------------------
// La cuenta (pura) está en frontend/src/features/lotes/logic/ahorroMenor.js. Aquí
// se escribe la decisión:
//   · `documentacion.cobro.ahorro_menor` (RPC de merge, por `cobroService.sellar`):
//     la decisión con sus cifras CONGELADAS, quién y cuándo.
//   · con 'acordado', `instalacion.economico_override.cae_client_rate` = el precio
//     que hace que el bono sobre el verificado sea el declarado. Así el margen que
//     cuentan el panel económico, el lote y la factura es el de verdad.
//
// REGLA — solo ADMIN y solo ANTES de la remesa: con la remesa generada el importe ya
// viaja en un fichero del banco.
//
// REGLA — cambiar de opinión deshace lo anterior: de 'acordado' a 'verificado' el
// precio vuelve EXACTAMENTE al que había (o se quita, si no había ninguno tecleado).
// ============================================================================

const supabase = require('./supabaseClient');
const cobroService = require('./cobroService');

const nowIso = () => new Date().toISOString();

class ErrorDecision extends Error {
    constructor(status, msg) { super(msg); this.status = status; }
}

/** Una copia del expediente con el precio al cliente fijado (o quitado con null). */
function conPrecio(exp, precio) {
    const inst = { ...(exp.instalacion || {}) };
    const over = { ...(inst.economico_override || {}) };
    if (precio == null) delete over.cae_client_rate; else over.cae_client_rate = precio;
    inst.economico_override = over;
    return { ...exp, instalacion: inst };
}

/**
 * Lo que costaría cada decisión, sin escribir nada: el precio nuevo con 'acordado'
 * y lo que se le pagaría en cada caso. Lo usa la ruta para enseñarlo y `decidir`.
 */
async function simular(exp) {
    const { computeExpedienteFinancials } = await cobroService.loadFinancials();
    const { estadoAhorroMenor, precioParaAcordado } = await cobroService.loadAhorroMenor();
    const previa = exp?.documentacion?.cobro?.ahorro_menor || null;
    const est = estadoAhorroMenor(computeExpedienteFinancials(exp), previa);
    if (!est) return null;

    // El precio de PARTIDA: el que había antes de una decisión 'acordado' anterior.
    const overrideActual = exp?.instalacion?.economico_override?.cae_client_rate;
    const overrideAntes = previa?.decision === 'acordado'
        ? (previa.precio_override_antes ?? null)
        : (overrideActual != null && overrideActual !== '' ? Number(overrideActual) : null);
    const base = conPrecio(exp, overrideAntes);

    const bonoVerifA = (p) => Number(computeExpedienteFinancials(conPrecio(base, p))?.caeVerificado) || 0;
    const bonoBase = Number(computeExpedienteFinancials(base)?.caeVerificado) || 0;
    // El precio efectivo de hoy (el que da el bono base), por la misma vía.
    const precioAntes = precioParaAcordado(bonoVerifA, 100, bonoBase);
    const precioNuevo = precioParaAcordado(bonoVerifA, 100, est.bono_declarado);
    const comprobado = precioNuevo != null ? Math.round(bonoVerifA(precioNuevo) * 100) / 100 : null;
    return {
        ...est,
        precio_antes: precioAntes != null ? Math.round(precioAntes * 100) / 100 : null,
        precio_nuevo: precioNuevo,
        precio_override_antes: overrideAntes,
        // Si el precio resuelto no da el bono declarado (economía rara), no se ofrece.
        acordado_posible: comprobado != null && Math.abs(comprobado - est.bono_declarado) < 0.01,
    };
}

/**
 * Escribe la decisión de UN expediente del lote.
 * @param {'acordado'|'verificado'} decision
 */
async function decidir(loteId, expId, decision, { usuario = 'ADMIN' } = {}) {
    if (!['acordado', 'verificado'].includes(decision)) throw new ErrorDecision(400, 'Decisión no válida');
    const exp = await cobroService.cargarExpediente(expId);
    if (!exp || exp.lote_id !== loteId) throw new ErrorDecision(404, 'El expediente no es de este lote');
    const cobro = exp.documentacion?.cobro || {};
    if (cobro.remesa || cobro.transferencia) {
        throw new ErrorDecision(409, 'Ya tiene la remesa generada: el importe ya va en el fichero del banco.');
    }
    const sim = await simular(exp);
    if (!sim) throw new ErrorDecision(409, 'Su ahorro verificado no es menor que el declarado: no hay nada que decidir.');
    if (decision === 'acordado' && !sim.acordado_posible) {
        throw new ErrorDecision(422, 'No se ha podido calcular el precio que da el bono declarado: fíjalo a mano en el Económico.');
    }

    // El precio: 'acordado' lo sube; 'verificado' deja el de antes (deshaciendo un
    // 'acordado' anterior). Se relee `instalacion` justo antes de escribir.
    const previa = cobro.ahorro_menor || null;
    const precioFinal = decision === 'acordado' ? sim.precio_nuevo
        : (previa?.decision === 'acordado' ? sim.precio_override_antes : undefined);
    if (precioFinal !== undefined) {
        const { data: fresh, error } = await supabase.from('expedientes').select('instalacion').eq('id', exp.id).maybeSingle();
        if (error || !fresh) throw new Error(error?.message || 'No se pudo leer el expediente');
        const instalacion = conPrecio({ instalacion: fresh.instalacion }, precioFinal).instalacion;
        const { error: e2 } = await supabase.from('expedientes')
            .update({ instalacion, updated_at: nowIso() }).eq('id', exp.id);
        if (e2) throw new Error(e2.message);
    }

    const sello = {
        decision,
        kwh_declarado: sim.kwh_declarado,
        kwh_verificado: sim.kwh_verificado,
        bono_declarado: sim.bono_declarado,
        bono_verificado: sim.bono_verificado,
        bono_a_pagar: decision === 'acordado' ? sim.bono_declarado : sim.bono_verificado,
        precio_antes: sim.precio_antes,
        precio_nuevo: decision === 'acordado' ? sim.precio_nuevo : null,
        precio_override_antes: sim.precio_override_antes,
        por: usuario,
        at: nowIso(),
    };
    await cobroService.sellar(exp.id, { ahorro_menor: sello });

    // Al historial del lote: es una decisión de dinero.
    const eur = (v) => `${Number(v).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
    const { data: lote } = await supabase.from('lotes').select('historial').eq('id', loteId).maybeSingle();
    const historial = Array.isArray(lote?.historial) ? [...lote.historial] : [];
    historial.push({
        id: `${Date.now()}_ahorro_menor`, tipo: 'sistema',
        texto: `${exp.numero_expediente}: verificado ${sim.kwh_verificado.toLocaleString('es-ES')} de ${sim.kwh_declarado.toLocaleString('es-ES')} kWh. `
            + (decision === 'acordado'
                ? `Se le paga lo ACORDADO (${eur(sim.bono_declarado)}): precio ${sim.precio_antes} → ${Math.round(sim.precio_nuevo * 100) / 100} €/MWh.`
                : `Se le paga sobre lo VERIFICADO (${eur(sim.bono_verificado)}, ${eur(sim.diferencia)} menos).`),
        fecha: nowIso(), usuario,
    });
    await supabase.from('lotes').update({ historial, updated_at: nowIso() }).eq('id', loteId);
    // …y al del EXPEDIENTE, que es donde cambia el precio (trazabilidad, 20/11/2026).
    await require('./loteVerificados').anotarHistorialExpediente(exp.id, {
        usuario, tipo: 'verificacion', origen: 'AHORRO_MENOR', decision,
        texto: historial[historial.length - 1].texto.replace(`${exp.numero_expediente}: `, 'Verificado MENOR que lo declarado: ')
            + (decision === 'acordado' ? ' (cambia el precio por MWh del cliente).' : ''),
    });
    return sello;
}

module.exports = { simular, decidir, conPrecio, ErrorDecision };
