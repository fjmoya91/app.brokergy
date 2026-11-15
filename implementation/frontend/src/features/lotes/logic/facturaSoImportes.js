// ============================================================
// facturaSoImportes.js — los IMPORTES de nuestra factura de CAE al S.O.
//
// Aparte de `facturaSoHtml.js` (que arrastra logos y tipografías) para que la
// lógica que no pinta —el envío de las facturas en bloque, `peticionesSo.js`— y
// sus pruebas en Node usen el MISMO redondeo que la factura que se genera.
// `facturaSoHtml.js` los reexporta: quien ya los importaba de allí no cambia.
// ============================================================

// Importes derivados (base, IVA 21%, total) a partir de unidades (kWh) y precio (€/kWh).
export function computeFacturaAmounts({ unidadesKwh, precioKwh }) {
    const u = Number(unidadesKwh) || 0;
    const p = Number(precioKwh) || 0;
    const base = Math.round(u * p * 100) / 100;
    const iva = Math.round(base * 0.21 * 100) / 100;
    const total = Math.round((base + iva) * 100) / 100;
    return { base, iva, total };
}

// Precio €/kWh por defecto a partir de la oferta del lote (€/MWh).
export function defaultPrecioKwh(lote) {
    const oferta = lote && lote.oferta_lote != null && lote.oferta_lote !== '' ? Number(lote.oferta_lote) : null;
    return oferta != null ? oferta / 1000 : 0;
}
