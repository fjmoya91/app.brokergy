// ─── facturaGestion.js ───────────────────────────────────────────────────────
// FACTURA de los HONORARIOS DE GESTIÓN de la ayuda CAE (fase 7 del lote): al
// cliente que eligió pagarlos con factura, o a su INSTALADOR cuando es él quien
// pide que se le facture. Va a la MISMA serie que las facturas de los CEE
// directos ({YY}ING_{n}, libro de la hoja de AppSheet: facturaSheetService), con
// el artículo que ya existe en su catálogo para esto.
//
// FUENTE ÚNICA de la línea, las observaciones y el texto del mensaje: el backend
// (services/facturaGestionCae.js) lo carga por import() y el popup solo enseña lo
// que le llega. Puro ESM y sin React; por eso los imports llevan `.js`.
// ─────────────────────────────────────────────────────────────────────────────
import { BROKERGY_EMISOR } from '../../cee-directo/logic/ofertaCee.js';
import { eurEs, FIRMA_COBRO } from '../../cobro/logic/cobroForm.js';

/**
 * Artículo de la pestaña ARTÍCULOS de la hoja: «Gestión técnica y administrativa
 * ayuda BONO ENERGÉTICO CAE», 250 € + 21 %. AppSheet pinta la descripción por el
 * ID, así que el concepto del PDF tiene que ser el suyo; esto es el respaldo si la
 * hoja no se puede leer.
 */
export const ARTICULO_GESTION_CAE = {
    id: '529a035b',
    nombre: 'Gestión técnica y administrativa ayuda BONO ENERGÉTICO CAE',
    ivaPct: 21,
};

export const VENCIMIENTO_DIAS_GESTION = 15;

/** La línea de la factura: el artículo del catálogo, por los honorarios del expediente. */
export function lineaGestion(importeSinIva, articulos = []) {
    const a = articulos.find(x => String(x.id) === ARTICULO_GESTION_CAE.id);
    return {
        articulo_id: ARTICULO_GESTION_CAE.id,
        descripcion: a?.nombre || ARTICULO_GESTION_CAE.nombre,
        uds: 1,
        precio: Math.round(Number(importeSinIva) * 100) / 100,
        dtoPct: 0,
        ivaPct: a ? Number(a.iva) * 100 : ARTICULO_GESTION_CAE.ivaPct,
    };
}

/**
 * Observaciones del PDF. Al INSTALADOR se le dice de qué cliente y qué obra es
 * (puede tener varias en el mismo lote); al CLIENTE, que la ayuda sale al cobrarla.
 */
export function observacionesGestion({ destino, expediente, titular, obra } = {}) {
    if (destino === 'instalador') {
        return [
            `Honorarios de gestión de la ayuda CAE (Certificados de Ahorro Energético) del expediente ${expediente || ''}`.trim() + '.',
            titular ? `Cliente: ${titular}${obra ? ` · Obra: ${obra}` : ''}.` : '',
        ].filter(Boolean).join(' ');
    }
    return `Honorarios de gestión de la ayuda CAE (Certificados de Ahorro Energético) del expediente ${expediente || ''}. `
        + 'La ayuda se ingresará una vez abonada la presente factura.';
}

const primerNombre = (s) => String(s || '').trim().split(/\s+/)[0] || '';
const capital = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s);

/**
 * El WhatsApp / email con el que sale la factura (con *negritas* de WhatsApp).
 *
 * REGLA — no se promete fecha de ingreso (como en todo el cobro): se dice que la
 * ayuda sale cuando la factura esté pagada, no cuándo.
 * Al INSTALADOR, tono profesional y sin el nº de expediente (como su aviso de
 * cobro): el cliente se identifica por su nombre y la obra.
 */
export function mensajeFacturaGestion({
    destino, nombre, esEmpresa = false, numero, total, base, expediente, titular, obra, bono,
} = {}) {
    const saludo = nombre && !esEmpresa ? `¡Hola ${capital(primerNombre(nombre))}!` : '¡Hola!';
    // Al instalador, sin emojis: es un partner (el mismo tono que su aviso de cobro).
    const pro = destino === 'instalador';
    const importe = `${pro ? '' : '💶 '}*Importe: ${eurEs(total)}*${base != null ? ` (${eurEs(base)} + IVA)` : ''}`;
    const pago = [
        'Se puede abonar por transferencia a esta cuenta, indicando el nº de factura en el concepto:',
        `${pro ? '' : '🏦 '}${BROKERGY_EMISOR.banco} · *${BROKERGY_EMISOR.iban}*`,
    ];
    if (pro) {
        return [
            saludo,
            '',
            `Os paso la factura *${numero || ''}* de los honorarios de gestión de la ayuda CAE de vuestro cliente *${titular || ''}*${obra ? `, obra de ${obra},` : ','} que nos pedisteis facturar a vuestro nombre.`,
            '',
            importe,
            '',
            ...pago,
            '',
            'En cuanto la recibamos, le ingresamos al cliente su ayuda íntegra. Si nos mandáis el justificante de la transferencia, lo agilizamos.',
            '',
            ...FIRMA_COBRO,
        ].join('\n');
    }
    return [
        saludo,
        '',
        `Como nos pediste, te paso la factura *${numero || ''}* de nuestros honorarios de gestión de tu ayuda CAE${expediente ? ` (expediente ${expediente})` : ''}.`,
        '',
        importe,
        '',
        ...pago,
        '',
        `📌 En cuanto nos llegue el pago te ingresamos tu ayuda *íntegra*${Number(bono) > 0 ? ` (${eurEs(bono)})` : ''}. Si nos mandas por aquí el justificante de la transferencia, lo agilizamos.`,
        '',
        ...FIRMA_COBRO,
    ].join('\n');
}
