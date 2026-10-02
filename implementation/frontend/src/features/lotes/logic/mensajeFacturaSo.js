// ─────────────────────────────────────────────────────────────────────────────
// El mensaje con el que se le manda al Sujeto Obligado la factura de Brokergy
// por la venta de los ahorros del lote (los CAE ya emitidos).
//
// Además de los datos de la factura, dice LO QUE SE HA AHORRADO con el lote: la
// alternativa del S.O. a comprarnos el ahorro es aportar al Fondo Nacional de
// Eficiencia Energética por su equivalencia financiera, y lo que le ha costado de
// verdad es nuestra factura más la verificación, que contrata él. Es el mismo
// argumento que lleva el correo de las facturas del verificador
// (`peticionesSo.js`), y se cuenta igual: sin IVA, porque el S.O. se lo deduce.
//
// Puro y sin imports: la equivalencia financiera llega por parámetro.
// ─────────────────────────────────────────────────────────────────────────────

// Formato español a mano: `toLocaleString('es-ES')` NO agrupa los números de cuatro
// cifras ("4883 €"), y en un correo con importes de cinco al lado se lee como una errata.
function num(n, d = 0) {
    const v = Number(n || 0);
    const [ent, dec] = Math.abs(v).toFixed(d).split('.');
    const miles = ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${v < 0 ? '-' : ''}${miles}${dec ? `,${dec}` : ''}`;
}
const eur0 = (n) => `${num(n, 0)} €`;
const eur2 = (n) => `${num(n, 2)} €`;
const precio = (n) => {
    const v = Number(n || 0);
    const d = Math.round(v * 1e4) % 10 ? 4 : 3;   // 0,175 · 0,1745
    return num(v, d);
};

/**
 * Lo que le ha supuesto el lote al S.O. frente a la equivalencia financiera.
 * `base` es nuestra factura SIN IVA; `costeVerif`, la del verificador sin IVA.
 * Devuelve null si no hay con qué calcularlo.
 */
export function ahorroSoFactura({ unidadesKwh, base, costeVerif, equivalencia }) {
    const mwh = (Number(unidadesKwh) || 0) / 1000;
    if (!(mwh > 0) || !(Number(base) > 0) || !(Number(equivalencia) > 0)) return null;
    const alternativa = mwh * Number(equivalencia);
    const verif = Number(costeVerif) > 0 ? Number(costeVerif) : 0;
    const coste = Number(base) + verif;
    const ahorro = alternativa - coste;
    return {
        mwh, alternativa, verif, coste, ahorro,
        pct: alternativa > 0 ? (ahorro / alternativa) * 100 : null,
        costeMwh: coste / mwh,
    };
}

export function mensajeFacturaSo({
    saludo = 'Buenos días,', codigoLote, numero, caeInicial, caeFinal,
    unidadesKwh, precioKwh, base, total, costeVerif, equivalencia,
}) {
    const kwh = Math.round(Number(unidadesKwh) || 0);
    const a = ahorroSoFactura({ unidadesKwh, base, costeVerif, equivalencia });

    // El ahorro va en UNA línea y sin desglose (decisión del usuario, 2026-10-02):
    // es la cifra que se quiere que vean. El desglose está en la ventana de la factura.
    const lineaAhorro = a && a.ahorro > 0
        ? `
- Ahorro neto que os ha supuesto con este lote: ${eur0(a.ahorro)}.`
        : '';

    return `${saludo}

Os adjunto la factura ${numero || ''} correspondiente a la venta de los ahorros energéticos del lote ${codigoLote || ''}, cuyos Certificados de Ahorro Energético (CAE) ya están emitidos.

- Códigos CAE: del ${caeInicial || '—'} al ${caeFinal || '—'}
- Volumen: ${num(kwh)} kWh (${num(kwh)} CAE)
- Precio: ${precio(precioKwh)} €/kWh
- Importe total: ${eur2(total)} (IVA 21 % incluido)${lineaAhorro}

Cuando podáis, haced el pago por transferencia a la cuenta indicada en la factura. Quedamos a vuestra disposición para cualquier aclaración.

Un saludo,
BROKERGY · Ingeniería Energética`;
}
