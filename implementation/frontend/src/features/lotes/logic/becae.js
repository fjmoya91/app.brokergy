// ─────────────────────────────────────────────────────────────────────────────
// Qué paso toca en beCAE (Marwen) para un lote. Puro: lo prueba
// backend/scripts/test_becae_acciones.mjs. Lo pinta `BecaeEnVivo`.
//
// Se cruzan los documentos que HAY en beCAE (`becae.documentos`, de su API) con
// los que hay en el LOTE (`analizarProceso`). Sale solo lo que toca, en el orden
// del trámite:
//   1. traer_solicitud  beCAE ofrece la solicitud y el lote no tiene la del verificador
//   2. subir_solicitud  el S.O. la firmó y beCAE no la tiene
//   3. subir_zip        beCAE no tiene documentación y aún no hay oferta
//   4. traer_oferta     beCAE tiene la oferta y el lote no
//   5. subir_oferta     el S.O. firmó la oferta y beCAE no la tiene (= ACEPTARLA)
//   6. inexactitudes    el expediente está En resolución / HDTED
// ─────────────────────────────────────────────────────────────────────────────

// Lotes en los que ya no hay nada que mirar en beCAE: no se consulta solo al abrir.
export const ESTADOS_LOTE_SIN_BECAE = ['BORRADOR', 'FINALIZADO', 'PTE. PAGO BROKERGY A CLIENTE', 'CAE EMITIDO – PTE PAGO BROKERGY'];

export function accionesBecae({ becae, p, solicitudApp = false, inexConsultables = false } = {}) {
    if (!becae || !p) return [];
    const docs = Array.isArray(becae.documentos) ? becae.documentos : [];
    // El backend ya normaliza el tipo (marwenService.tipoCanonico); esto cubre lo
    // sellado antes en el lote con el nombre de beCAE (`solicitud_sin_firmar`).
    const tipo = (t) => String(t || '').toLowerCase().replace(/_sin_firmar$/, '');
    const hay = (t) => docs.some(d => d && tipo(d.type) === t);
    const out = [];

    const solicitudFirmadaLote = !!p.solicitud?.signed_link;
    if (hay('solicitud') && !solicitudFirmadaLote && (!p.solicitud || solicitudApp)) {
        out.push({ id: 'traer_solicitud', etiqueta: '⬇ Traer la solicitud de beCAE', tono: 'amber',
            ayuda: 'La guarda en la fase 1 como la del verificador: es la que firma el S.O. con el Anexo I.' });
    }
    if (solicitudFirmadaLote && !solicitudApp && !hay('solicitud_firmada')) {
        out.push({ id: 'subir_solicitud', etiqueta: '⬆ Subir a beCAE la solicitud firmada', tono: 'amber',
            ayuda: 'La que firmó el S.O. en la fase 2.' });
    }
    if (!hay('documento_adjunto') && !hay('oferta') && becae.num_solicitud) {
        out.push({ id: 'subir_zip', etiqueta: '⬆ Subir a beCAE los ZIP de las actuaciones', tono: hay('solicitud_firmada') ? 'amber' : 'brand',
            ayuda: 'Los E{n}.zip que genera el paquete de la fase 3. Con la solicitud firmada y la documentación, Marwen prepara la oferta.' });
    }
    if (hay('oferta') && !p.oferta) {
        out.push({ id: 'traer_oferta', etiqueta: '⬇ Traer la oferta de beCAE', tono: 'amber',
            ayuda: 'La guarda en la fase 3 (con su importe) y propone mandarla al S.O. para que la firme.' });
    }
    if (hay('oferta') && p.ofertaFirmada && !hay('oferta_firmada')) {
        out.push({ id: 'subir_oferta', etiqueta: '⬆ Aceptar la oferta en beCAE (subir la firmada)', tono: 'amber',
            ayuda: 'Subir la oferta firmada por el S.O. equivale a aceptarla.' });
    }
    if (inexConsultables || ['En resolución', 'HDTED'].includes(becae.estado_expediente)) {
        out.push({ id: 'inexactitudes', etiqueta: '⌕ Registrar las inexactitudes de beCAE', tono: 'brand',
            ayuda: 'Las lee de la API (sin leer el PDF) y las cuelga como incidencias, sobre el último informe subido. Marwen limita estas consultas.' });
    }
    return out;
}
