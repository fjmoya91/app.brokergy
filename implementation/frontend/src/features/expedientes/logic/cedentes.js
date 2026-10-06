// ─── cedentes.js ─────────────────────────────────────────────────────────────
// QUIÉN CEDE el ahorro de un expediente y en qué proporción. Fuente ÚNICA para
// el Convenio de Cesión, el Anexo I, el formulario de aceptación, la ficha del
// cliente, el control de facturas y el pago del bono.
//
// QUÉ ES UN CEDENTE. El propietario inicial del ahorro es quien LLEVA A CABO LA
// INVERSIÓN (RD 36/2023, art. 2.f), no quien figura en la escritura: por eso un
// copropietario de la vivienda solo es cedente si PAGA la obra (`cedente: true`,
// y la factura va también a su nombre). El titular de la ficha lo es siempre.
//
// REGLA — con UN solo cedente nada cambia: los documentos salen exactamente
// igual que antes de que existiera esto. Lo de "varios" se activa solo cuando
// algún copropietario está marcado como cedente.
//
// REGLA — el reparto es por CUOTA de inversión. El titular se queda con el resto
// (100 − Σ cuotas de los demás). Sin cuotas declaradas, a partes iguales.
//
// REGLA — el pago va por defecto a UNA sola cuenta (la del titular), con efectos
// liberatorios frente a todos (crédito solidario, arts. 1137 y 1142 CC). Solo si
// un cedente declara SU cuenta se le ingresa su parte aparte.
//
// Puro y sin dependencias: lo importan el frontend y, por ESM, el backend.
// ─────────────────────────────────────────────────────────────────────────────

const limpiaIban = (v) => String(v || '').replace(/\s+/g, '').toUpperCase();
const ibanValido = (v) => { const i = limpiaIban(v); return i.length >= 15 && !i.includes('_'); };
const red2 = (n) => Math.round(n * 100) / 100;

/** Formatea una cuota: 50 → "50", 33.33 → "33,33". */
export const cuotaTxt = (n) => (n == null ? '' : red2(n).toLocaleString('es-ES', { maximumFractionDigits: 2 }));

/**
 * Los cedentes del cliente, el titular primero.
 *
 * @param {object} cliente  fila de `clientes` (con `copropietarios`)
 * @returns {Array<{ id, rol, es_empresa, nombre, nombre_razon_social, apellidos,
 *   dni, representante_nombre, representante_apellidos, representante_dni,
 *   email, tlf, iban, cuenta_propia, cuota_pct }>}
 */
export function cedentesDe(cliente) {
    const c = cliente || {};
    const otros = (Array.isArray(c.copropietarios) ? c.copropietarios : []).filter(p => p && p.cedente);
    const titular = {
        id: 'titular', rol: 'titular',
        es_empresa: !!c.es_empresa,
        nombre_razon_social: c.nombre_razon_social || '',
        apellidos: c.es_empresa ? '' : (c.apellidos || ''),
        dni: c.dni_nie || c.dni || '',
        representante_nombre: c.representante_nombre || '',
        representante_apellidos: c.representante_apellidos || '',
        representante_dni: c.representante_dni || '',
        email: c.email || '', tlf: c.tlf || c.telefono || '',
        iban: limpiaIban(c.numero_cuenta),
        cuenta_propia: true,
    };
    const resto = otros.map(p => ({
        id: p.id, rol: 'copropietario',
        es_empresa: !!p.es_empresa,
        nombre_razon_social: p.nombre || '',
        apellidos: p.es_empresa ? '' : (p.apellidos || ''),
        dni: p.dni || '',
        representante_nombre: '', representante_apellidos: '', representante_dni: '',
        email: p.email || '', tlf: p.tlf || '',
        iban: limpiaIban(p.iban),
        cuenta_propia: ibanValido(p.iban),
        cuota_declarada: typeof p.cuota_pct === 'number' && p.cuota_pct > 0 ? p.cuota_pct : null,
    }));
    const lista = [titular, ...resto].map(x => ({
        ...x,
        nombre: [x.nombre_razon_social, x.apellidos].filter(Boolean).join(' '),
    }));
    // Cuotas: las declaradas se respetan; las que falten se reparten a partes
    // iguales entre los que no la tienen (titular incluido).
    if (lista.length === 1) {
        lista[0].cuota_pct = 100;
        return lista;
    }
    const declaradas = resto.filter(x => x.cuota_declarada != null);
    const sumaDecl = declaradas.reduce((s, x) => s + x.cuota_declarada, 0);
    const sinCuota = lista.filter(x => x.rol === 'titular' || x.cuota_declarada == null);
    const parte = sinCuota.length ? Math.max(0, 100 - sumaDecl) / sinCuota.length : 0;
    for (const x of lista) {
        x.cuota_pct = red2(x.rol !== 'titular' && x.cuota_declarada != null ? x.cuota_declarada : parte);
        delete x.cuota_declarada;
    }
    return lista;
}

/** ¿Hay más de un cedente? Es lo que activa el formato "varios" de los documentos. */
export const variosCedentes = (cliente) => cedentesDe(cliente).length > 1;

/**
 * A qué cuentas se paga el bono y qué parte va a cada una. Los cedentes sin
 * cuenta propia cobran en la del titular (la cuenta designada).
 *
 * @param {object} cliente
 * @param {number} [importe]  el bono total, para repartirlo en euros
 * @returns {Array<{ iban, cuota_pct, importe, cedentes: string[] }>}
 */
export function repartoPago(cliente, importe = null) {
    const ced = cedentesDe(cliente);
    const designada = ced[0].iban;
    const grupos = new Map();
    for (const x of ced) {
        const iban = (x.rol !== 'titular' && x.cuenta_propia) ? x.iban : designada;
        const g = grupos.get(iban) || { iban, cuota_pct: 0, cedentes: [] };
        g.cuota_pct = red2(g.cuota_pct + x.cuota_pct);
        g.cedentes.push(x.nombre);
        grupos.set(iban, g);
    }
    return [...grupos.values()].map(g => ({
        ...g,
        importe: importe != null ? red2(importe * g.cuota_pct / 100) : null,
    }));
}

/**
 * Qué falta para que el reparto sea válido. Las cuotas de los otros cedentes no
 * pueden dejar al titular sin parte: el titular es quien acepta y firma, así que
 * también invierte.
 * @returns {string|null}
 */
export function problemaCuotas(cliente) {
    const otros = (Array.isArray(cliente?.copropietarios) ? cliente.copropietarios : []).filter(p => p?.cedente);
    const suma = otros.reduce((s, p) => s + (typeof p.cuota_pct === 'number' ? p.cuota_pct : 0), 0);
    if (suma >= 100) return 'Las partes de los demás propietarios suman el 100 % o más: el titular también tiene que tener su parte.';
    return null;
}
