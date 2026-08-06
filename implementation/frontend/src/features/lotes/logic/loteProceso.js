// ─────────────────────────────────────────────────────────────────────────────
// El PROCESO del lote, por fases. Espejo de `backend/services/loteDocs.js`.
//
// El popup del lote se pinta desde aquí: cada fase sabe qué documentos le tocan,
// qué acciones ofrece y por qué está bloqueada. Así el orden de la pantalla es el
// orden real del trámite y no hay que acordarse de qué va antes de qué.
//
//   1. Solicitud al verificador   → se genera, se sube firmada
//   2. Firma del Sujeto Obligado  → Anexo I + fichas RES + solicitud
//   3. Oferta de verificación     → llega del verificador, la firma el S.O.
//   4. Verificación               → inexactitudes, informe, dictamen, factura
//   5. Cobro                      → factura de Brokergy al S.O.
// ─────────────────────────────────────────────────────────────────────────────

// Slots que se suben a mano. `multiple` = admite varios (informes de inexactitudes).
export const SLOTS = {
    solicitud_verificacion: { label: 'Solicitud de Verificación', multiple: false, firmable: true },
    oferta_verificacion:    { label: 'Oferta de verificación', multiple: false, firmable: true },
    informe_inexactitudes:  { label: 'Informe de inexactitudes', multiple: true, firmable: false },
    informe_verificacion:   { label: 'Informe de Verificación', multiple: false, firmable: false },
    dictamen_favorable:     { label: 'Dictamen favorable', multiple: false, firmable: false },
    // La emite el VERIFICADOR al SUJETO OBLIGADO (el S.O. es quien le contrata).
    // No es la de Brokergy al S.O. por la venta de CAEs — esa es la de la fase 5.
    factura_verificador:    { label: 'Factura del verificador al Sujeto Obligado', multiple: false, firmable: false, importe: true },
    // Fase 5 — presentación a MITECO y resolución de la Gestora de Ahorros.
    justificante_miteco:    { label: 'Justificante de subida a MITECO', multiple: false, firmable: false },
    requerimiento_ga:       { label: 'Requerimiento de la G.A.', multiple: true, firmable: false },
    certificado_cae:        { label: 'Certificado CAE emitido', multiple: false, firmable: false },
};

// Documentos que firma el Sujeto Obligado en la fase 2.
const esDocSo = (d) => !!d && (d.key === 'anexo_i' || d.key === 'solicitud_verificacion' || String(d.key || '').startsWith('ficha_'));

/**
 * Lee `lote.documentos_so` y devuelve el estado real del trámite: qué documentos
 * hay, qué fase está en curso y por qué las siguientes están bloqueadas.
 */
export function analizarProceso(lote) {
    const docs = Array.isArray(lote?.documentos_so) ? lote.documentos_so : [];
    const byKey = (k) => docs.find(d => d && d.key === k) || null;
    const porTipo = (t) => docs.filter(d => d && d.tipo === t);

    const solicitud = byKey('solicitud_verificacion');
    const anexo = byKey('anexo_i');
    const fichas = porTipo('ficha_res');
    const oferta = byKey('oferta_verificacion');
    const inexactitudes = porTipo('informe_inexactitudes');
    const informeVerificacion = byKey('informe_verificacion');
    const dictamen = byKey('dictamen_favorable');
    const facturaVerificador = byKey('factura_verificador');
    const justificanteMiteco = byKey('justificante_miteco');
    const requerimientosGa = porTipo('requerimiento_ga');
    const certificadoCae = byKey('certificado_cae');
    const facturaSo = lote?.factura_so || null;

    const docsSo = docs.filter(esDocSo);
    const soEnviado = docsSo.some(d => d.sent_at);
    const soFirmado = docsSo.length > 0 && docsSo.every(d => d.signed_link);
    const ofertaEnviada = !!oferta?.sent_at;
    const ofertaFirmada = !!oferta?.signed_link;
    const verificado = !!informeVerificacion && !!dictamen;
    const caeEmitido = ['CAE EMITIDO – PTE PAGO BROKERGY', 'PTE. PAGO BROKERGY A CLIENTE', 'FINALIZADO']
        .includes(lote?.estado);

    // Una fase está `hecha` cuando su hito se cumplió, y `bloqueada` mientras le
    // falte lo de la fase anterior. La primera no completada es la fase ACTUAL.
    const fases = [
        {
            n: 1,
            titulo: 'Solicitud al verificador',
            hecha: !!solicitud,
            bloqueo: null,
            docs: [solicitud].filter(Boolean),
        },
        {
            n: 2,
            titulo: 'Firma del Sujeto Obligado',
            hecha: soFirmado,
            bloqueo: solicitud ? null : 'Sube antes la solicitud de verificación firmada.',
            docs: [anexo, ...fichas].filter(Boolean),
        },
        {
            n: 3,
            titulo: 'Oferta de verificación',
            hecha: ofertaFirmada,
            bloqueo: soFirmado ? null : 'Se habilita cuando el S.O. firme el Anexo I y las fichas.',
            docs: [oferta].filter(Boolean),
        },
        {
            n: 4,
            titulo: 'Verificación',
            hecha: verificado,
            bloqueo: ofertaFirmada ? null : 'Se habilita cuando el S.O. devuelva la oferta firmada.',
            docs: [...inexactitudes, informeVerificacion, dictamen, facturaVerificador].filter(Boolean),
        },
        {
            n: 5,
            titulo: 'Presentación a MITECO',
            hecha: !!certificadoCae,
            bloqueo: verificado ? null : 'Se habilita cuando la verificación sea favorable.',
            docs: [justificanteMiteco, ...requerimientosGa, certificadoCae].filter(Boolean),
        },
        {
            n: 6,
            titulo: 'Factura de Brokergy al Sujeto Obligado',
            hecha: !!facturaSo?.numero,
            bloqueo: caeEmitido ? null : 'Se habilita en "CAE EMITIDO – PTE PAGO BROKERGY".',
            docs: [],
        },
    ];
    const actual = fases.find(f => !f.hecha && !f.bloqueo) || fases.find(f => !f.hecha) || null;

    return {
        docs, solicitud, anexo, fichas, oferta, inexactitudes,
        informeVerificacion, dictamen, facturaVerificador,
        justificanteMiteco, requerimientosGa, certificadoCae, facturaSo,
        soEnviado, soFirmado, ofertaEnviada, ofertaFirmada, verificado, caeEmitido,
        fases, faseActual: actual ? actual.n : null,
    };
}
