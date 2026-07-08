// ============================================================
// signBoxes.js — Recuadros de firma EXACTOS por tipo de documento.
//
// Coordenadas en puntos PDF (origen abajo-izquierda), extraídas de PDFs de
// referencia marcados a mano por el usuario (carpeta `plantillas/CUADRO FIRMA`,
// 2026-07-08) leyendo la anotación "Square" roja con PyMuPDF. Para RES080/RES093
// (sin referencia directa) se derivaron localizando el texto ancla "Firma
// electrónica" en un PDF generado de prueba y aplicando el mismo offset
// anchor→caja medido en la referencia real de RES060 (misma tabla/CSS).
//
// Al pasar `fixedBox` a FirmarConCertificadoModal, el recuadro se sitúa YA
// (sin escanear texto) y el botón "Firmar con Autofirma" queda activo desde el
// primer instante — un solo click. Si el documento cambia de plantilla, estas
// coordenadas hay que re-derivarlas (ver plantillas/CUADRO FIRMA).
//
// `page` es 1-based (misma convención que initialPage/signatureAnchor).
// ============================================================

export const SIGN_BOXES = {
    // Certificado CIFO (RES060), firma del instalador — SubirCifoView.jsx.
    cifo_res060: { page: 2, llx: 318.92, lly: 87.40, urx: 545.74, ury: 147.94 },

    // Anexo I (individual, cliente) — FirmarAnexosView.jsx.
    anexo_i: { page: 3, llx: 57.10, lly: 80.20, urx: 284.57, ury: 155.74 },

    // Anexo de Cesión de Ahorros (individual, cliente) — FirmarAnexosView.jsx.
    anexo_cesion: { page: 2, llx: 25.68, lly: 55.99, urx: 276.72, ury: 166.24 },

    // Anexo I · Listado Cesión (LOTE) — página 1, apaisada. DOS firmas:
    //   _proveedor = columna izquierda (EL PROVEEDOR / BROKERGY), la firma Brokergy antes de enviar.
    //   (por defecto)= columna derecha (el S.O.), la firma el Sujeto Obligado.
    // Riesgo: si el lote crece mucho la tabla podría desbordar a una 2ª página.
    anexo_i_listado: { page: 1, llx: 534.45, lly: 188.32, urx: 736.06, ury: 269.30 },
    anexo_i_listado_proveedor: { page: 1, llx: 129, lly: 188.32, urx: 331, ury: 269.30 },

    // Fichas RES del lote (firma el S.O.) — una por tipo de ficha.
    ficha_res060: { page: 3, llx: 254.12, lly: 709.20, urx: 518.90, ury: 729.20 },
    ficha_res080: { page: 2, llx: 254.12, lly: 523.20, urx: 518.90, ury: 543.20 }, // derivada
    ficha_res093: { page: 3, llx: 254.12, lly: 709.20, urx: 518.90, ury: 729.20 }, // idéntica a RES060

    // Solicitud de Verificación (LOTE, PDF subido) — plantilla externa, página fija
    // en la referencia dada; puede variar si cambia el formato del verificador.
    solicitud_verificacion: { page: 12, llx: 145.46, lly: 450.00, urx: 348.72, ury: 528.20 },
};

// Devuelve la caja de una ficha RES por código ('RES060'|'RES080'|'RES093').
export function fichaSignBox(fichaCode) {
    return SIGN_BOXES[`ficha_${String(fichaCode || '').toLowerCase()}`] || null;
}
