// ─────────────────────────────────────────────────────────────────────────────
// Un DOCUMENTO del lote, tal y como viaja al backend.
//
// REGLA — lo que se manda es el documento ENTERO, no una lista de campos escrita
// a mano en cada modal. Un documento puede llegar de tres formas y el backend las
// conoce todas (`pdfService.documentoAPdf`): `pdfBase64` (ya rasterizado y a veces
// ya firmado), `formulario` (el impreso OFICIAL del Ministerio, que rellena el
// backend) o `html` (la maqueta). Cada modal serializaba su propia lista y las dos
// se dejaron fuera `formulario`: desde que las fichas RES pasaron a rellenarse
// sobre el impreso oficial, **la ficha llegaba vacía al backend y no se enviaba**
// — ni en el envío inicial al S.O. ni en el requerimiento, donde el correo salía
// con el Anexo I solo y sin decir que faltaba nada (medido en LOTE-2025-006).
//
// Aquí está la lista una vez. Un campo nuevo se añade aquí y lo heredan las dos
// superficies.
// ─────────────────────────────────────────────────────────────────────────────

export function docParaEnvio(d) {
    const doc = d || {};
    return {
        html: doc.html || null,
        pdfBase64: doc.pdfBase64 || null,
        formulario: doc.formulario || null,
        key: doc.key || null,
        fileName: doc.fileName,
        label: doc.label,
        tipo: doc.tipo,
        expediente_id: doc.expediente_id || null,
        anchor: doc.anchor || null,
        fixedBox: doc.fixedBox || null,
        // Quién debe firmarlo por el S.O.: se sella en `documentos_so` para poder
        // comprobar, cuando vuelva firmado, que lo ha firmado quien tocaba.
        rep_nombre: doc.repNombre || null,
        rep_nif: doc.repNif || null,
    };
}

// ¿Este documento lleva contenido con el que el backend pueda producir un PDF?
// Un documento sin ninguna de las tres formas no se puede enviar, y eso hay que
// decirlo ANTES de mandar el correo, no dejarlo caer en silencio.
export function docTieneContenido(d) {
    const doc = d || {};
    return !!(doc.html || doc.pdfBase64 || doc.formulario);
}

export default docParaEnvio;
