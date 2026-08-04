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

// ─── Borrador del cliente invalidado por un rechazo ───────────────────────────
// El cliente NO firma el PDF que le mandamos por WhatsApp: firma el que le sirve
// /firmar-anexos, y ése sale del BORRADOR de Drive (`{doc}_drive_link`). Rechazar
// el firmado no toca ese borrador, así que hasta ahora el cliente volvía al enlace,
// se descargaba el MISMO documento erróneo y lo firmaba otra vez igual de mal
// (caso real: números de serie equivocados en el Anexo I de 26RES060_142).
//
// Un borrador está OBSOLETO mientras el rechazo sea POSTERIOR a la última vez que
// se regeneró (`{doc}_drive_at`, sellado en mergeDocumentacion) o se envió
// (`{doc}_sent_at`). Mientras lo esté, la vista pública ni lo ofrece ni lo sirve:
// la única salida es corregir los datos y reenviar el anexo regenerado.
const BORRADORES_CLIENTE = {
    anexo_i: {
        draft: 'anexo_i_drive_link', sent: 'anexo_i_sent_at', at: 'anexo_i_drive_at',
        signed: 'anexo_i_signed_link', label: 'Anexo I',
    },
    anexo_cesion: {
        draft: 'anexo_cesion_drive_link', sent: 'anexo_cesion_sent_at', at: 'anexo_cesion_drive_at',
        signed: 'anexo_cesion_signed_link', label: 'Anexo de Cesión de Ahorros',
    },
};

const _ts = (v) => { const t = Date.parse(v || ''); return Number.isNaN(t) ? 0 : t; };

/**
 * Estado de rechazo del anexo `which` ('anexo_i' | 'anexo_cesion').
 * Devuelve null si nunca se rechazó. `obsoleto` = el borrador que serviría el
 * enlace público sigue siendo el rechazado (todavía no se ha regenerado/reenviado).
 */
function rechazoBorrador(documentacion, which) {
    const spec = BORRADORES_CLIENTE[which];
    if (!spec) return null;
    const doc = documentacion || {};
    const rechazo = doc.docs_rechazados?.[spec.signed];
    if (!rechazo?.at) return null;
    const ultimaVersion = Math.max(_ts(doc[spec.sent]), _ts(doc[spec.at]));
    return {
        doc: which,
        label: spec.label,
        motivo: rechazo.motivo || '',
        at: rechazo.at,
        obsoleto: _ts(rechazo.at) > ultimaVersion,
    };
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
    BORRADORES_CLIENTE,
    slotValidableDe,
    invalidarValidacionDocs,
    invalidarValidacionCee,
    rechazoBorrador,
};
