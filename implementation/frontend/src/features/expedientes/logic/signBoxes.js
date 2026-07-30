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
//
// Los decimales de aquí son informativos: Autofirma exige ENTEROS en las coordenadas
// (las lee con Integer.parseInt y, si falla, firma en invisible), así que
// FirmarConCertificadoModal las redondea hacia fuera antes de mandarlas.
// ============================================================

export const SIGN_BOXES = {
    // Certificado CIFO (RES060), firma del instalador — SubirCifoView.jsx.
    cifo_res060: { page: 2, llx: 318.92, lly: 87.40, urx: 545.74, ury: 147.94 },

    // Anexo I (individual, cliente) — FirmarAnexosView.jsx.
    anexo_i: { page: 3, llx: 57.10, lly: 80.20, urx: 284.57, ury: 155.74 },

    // Anexo de Cesión de Ahorros — las DOS columnas de `.conv-sign-grid` (docGenerators.js).
    // Coordenadas medidas sobre un PDF generado real (25RES080_25, 2026-07-27) con PyMuPDF:
    // el `.conv-sign-box` de cada columna ocupa y[51.4, 175.2] pt, y las columnas van de
    // x[27.0, 285.8] y x[309.8, 568.5] (2 columnas iguales, gap 32px, padding 36px sobre
    // 794px de ancho → 0.75 pt/px). Aquí se recortan hacia dentro para no pisar los bordes.
    //   _cesion            = columna izquierda, EL CEDENTE  → la firma el cliente.
    //   _cesion_cesionario = columna derecha,   EL CESIONARIO → la contrafirma de Brokergy.
    anexo_cesion: { page: 2, llx: 27, lly: 52, urx: 285, ury: 175 },
    anexo_cesion_cesionario: { page: 2, llx: 310, lly: 52, urx: 568, ury: 175 },

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
    // TER100: la ficha del terciario tiene tres apartados de cálculo (uno por
    // servicio) y ocupa 5 páginas, con la tabla del representante en la PÁGINA 4.
    // Coordenadas medidas con PyMuPDF sobre el PDF que genera fichaTer100Html.js
    // (localizando "Firma electrónica" y las verticales de su fila): la celda del
    // valor va de x=230 a x=520 y la fila ocupa y[276..297] en coordenadas PDF.
    // Se recorta un punto hacia dentro para no pisar los bordes.
    ficha_ter100: { page: 4, llx: 232, lly: 278, urx: 518, ury: 295 },

    // Solicitud de Verificación (LOTE, PDF subido) — plantilla externa, página fija
    // en la referencia dada; puede variar si cambia el formato del verificador.
    solicitud_verificacion: { page: 12, llx: 145.46, lly: 450.00, urx: 348.72, ury: 528.20 },
};

// Devuelve la caja de una ficha por código ('RES060'|'RES080'|'RES093'|'TER100').
export function fichaSignBox(fichaCode) {
    return SIGN_BOXES[`ficha_${String(fichaCode || '').toLowerCase()}`] || null;
}
