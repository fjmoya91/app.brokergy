// ─── Estado de validación de los documentos del expediente ────────────────────
// Fuente ÚNICA de: qué documentos son validables, cómo se llaman y qué pasa con su
// validación cuando llega una versión NUEVA del fichero.
//
// Ciclo del slot en la app: subido (ámbar) → validado (verde) → rechazado (rojo).
// Al validar, el backend copia el fichero a "10. EXPEDIENTE CAE" (auditoría).
//
// REGLA: subir una versión nueva de un documento YA validado lo devuelve a ámbar.
// Si no, el slot seguiría verde mientras la carpeta de auditoría conserva el fichero
// viejo — exactamente el caso de un instalador que re-sube el CIFO tras un
// requerimiento. Al re-validarlo, la copia previa de "10. EXPEDIENTE CAE" se archiva
// en su subcarpeta OLD y la nueva la sustituye.

const DOCUMENTO_VALIDABLE_LABELS = {
    anexo_i_signed_link: 'Anexo I',
    anexo_cesion_signed_link: 'Anexo Cesión de Ahorro',
    cert_cifo_signed_link: 'Certificado CIFO',
    ficha_res060_signed_link: 'Ficha RES',
    anexo_fotografico_signed_link: 'Anexo Fotográfico',
    cert_rite_signed_link: 'Certificado RITE',
    facturas_combined_link: 'FACTURAS',
};

// Campo escrito → slot validable al que afecta. Solo hace falta declarar los que NO
// coinciden consigo mismos: el Certificado RITE se valida por `cert_rite_signed_link`
// pero puede subirse como enlace manual en `cert_rite_drive_link` (ver
// VALIDAR_LINK_FALLBACK en routes/expedientes.js).
const CAMPO_A_SLOT_VALIDABLE = {
    cert_rite_drive_link: 'cert_rite_signed_link',
};

const slotValidableDe = (campo) => CAMPO_A_SLOT_VALIDABLE[campo] || campo;

/**
 * Devuelve el objeto `documentacion` con la validación/rechazo de los campos dados
 * limpiados, y una entrada de historial por cada documento que estaba validado.
 * Si no había nada que invalidar, devuelve el objeto recibido tal cual.
 *
 * @param {object} documentacion  el objeto YA actualizado con el/los enlaces nuevos
 * @param {string|string[]} campos  campo(s) de documentacion que se acaban de subir
 * @param {{usuario?: string, origen?: string}} opts  quién/por dónde llegó el fichero
 */
function invalidarValidacionDocs(documentacion, campos, opts = {}) {
    const doc = { ...(documentacion || {}) };
    const lista = (Array.isArray(campos) ? campos : [campos]).filter(Boolean);
    if (!lista.length) return doc;

    const validados = { ...(doc.docs_validados || {}) };
    const rechazados = { ...(doc.docs_rechazados || {}) };
    const historial = Array.isArray(doc.historial) ? [...doc.historial] : [];
    let tocado = false;

    for (const campo of lista) {
        const slot = slotValidableDe(campo);
        const validadoEl = validados[slot];
        const estabaRechazado = !!rechazados[slot];
        if (!validadoEl && !estabaRechazado) continue;

        delete validados[slot];
        delete rechazados[slot];
        tocado = true;

        if (validadoEl) {
            const label = DOCUMENTO_VALIDABLE_LABELS[slot] || slot.replace(/_/g, ' ');
            const origen = opts.origen ? ` (${opts.origen})` : '';
            historial.push({
                id: `${Date.now()}_reval_${slot}`,
                tipo: 'doc_nueva_version',
                texto: `Nueva versión de ${label}${origen}: se anula la validación anterior y vuelve a PENDIENTE DE REVISAR.`,
                campo: slot,
                validado_anterior: validadoEl,
                fecha: new Date().toISOString(),
                usuario: opts.usuario || 'SISTEMA',
            });
        }
    }

    if (!tocado) return doc;
    return { ...doc, docs_validados: validados, docs_rechazados: rechazados, historial };
}

/**
 * Igual que `invalidarValidacionDocs` pero para los documentos del CEE, cuyo estado
 * vive en la columna `cee` (`cee.docs_validados['{inicial|final}_{slot}']`).
 */
function invalidarValidacionCee(cee, section, slot) {
    const obj = { ...(cee || {}) };
    const key = `${section}_${slot}`;
    const validados = { ...(obj.docs_validados || {}) };
    if (!validados[key]) return obj;
    delete validados[key];
    return { ...obj, docs_validados: validados };
}

module.exports = {
    DOCUMENTO_VALIDABLE_LABELS,
    CAMPO_A_SLOT_VALIDABLE,
    slotValidableDe,
    invalidarValidacionDocs,
    invalidarValidacionCee,
};
