/**
 * LAS CIFRAS QUE IMPRIME LA PROPUESTA — y lo que cuestan nuestros servicios.
 *
 * Fuente ÚNICA para la portada, la tabla del desglose, la cláusula 2 de las
 * condiciones y los mensajes de envío (ProposalModal). Probado en:
 *   node implementation/backend/scripts/test_cifras_propuesta.mjs
 *
 * REGLA — cada TOTAL es la suma de las cifras IMPRESAS. `calculateFinancials`
 * trabaja con decimales y la propuesta redondea cada línea por su cuenta, así que
 * el cliente sumaba lo que veía y no le cuadraba: 26RES060_OP279 imprimía
 * «CAE 5.161 € + IRPF 5.772 €» y una ayuda total de 10.932 € (22/10/2026). Aquí se
 * redondea cada componente UNA vez y los totales (ayuda, % cubierto, inversión
 * neta) se recomponen a partir de ellos. No toca la economía del expediente ni lo
 * que se guarda: es solo lo que se le enseña al cliente.
 *
 * REGLA — lo que se le descuenta del bono es `caeMaintenanceCost`, el MISMO importe
 * que dice el Convenio de Cesión y que se le cobra al final (250 € sin IVA por
 * defecto; 0 € con «Descuento Certificados»). La cláusula 2 imprimía su propia
 * cuenta —220 + 32,78 € «+ IVA»— mientras la tabla de la portada decía 250 €: tres
 * cifras para lo mismo. La TARIFA (702,78 € + IVA) solo es lo que se cobraría sin
 * promoción, y por eso es también la penalización de la cláusula 4.
 */

/** Tarifa de los servicios, sin promoción (base imponible, sin IVA). */
export const TARIFA_SERVICIOS = [
    { clave: 'cee', concepto: 'Certificados de Eficiencia Energética (inicial + final)', importe: 220 },
    { clave: 'tasas', concepto: 'Tasas de registro de los certificados', importe: 32.78 },
    { clave: 'gestion', concepto: 'Gestión técnica y administrativa del expediente CAE', importe: 450 },
];
export const TARIFA_TOTAL = Math.round(TARIFA_SERVICIOS.reduce((s, l) => s + l.importe, 0) * 100) / 100;

const r = (v) => Math.round(Number(v) || 0);

/**
 * Una rama de `calculateFinancials` (financials o financialsRes080) con las cifras
 * que se imprimen: componentes redondeados a euros y totales recompuestos.
 */
export function cifrasPropuesta(fin) {
    if (!fin) return fin;
    const owners = Math.max(1, parseInt(fin.numOwners, 10) || 1);
    const presupuesto = r(fin.presupuesto);
    const presupuestoFotovoltaica = r(fin.presupuestoFotovoltaica);
    const presupuestoTotal = presupuesto + presupuestoFotovoltaica;
    const caeBonus = r(fin.caeBonus);
    const irpfCaeAmount = r(fin.irpfCaeAmount);
    const caeNeto = Math.max(0, caeBonus - irpfCaeAmount);
    const irpfDeductionPerOwner = r(fin.irpfDeductionPerOwner ?? (Number(fin.irpfDeduction) || 0) / owners);
    const irpfDeduction = irpfDeductionPerOwner * owners;
    const caeMaintenanceCost = r(fin.caeMaintenanceCost);
    const totalBeneficioFiscal = caeNeto + irpfDeduction;
    // Sin presupuesto no hay base: se deja el % que diera el cálculo (no se imprime).
    const porcentajeCubierto = presupuestoTotal > 0
        ? Math.min(100, (totalBeneficioFiscal / presupuestoTotal) * 100)
        : fin.porcentajeCubierto;
    const costeFinal = Math.max(0, presupuestoTotal + caeMaintenanceCost - totalBeneficioFiscal);
    return {
        ...fin,
        presupuesto,
        presupuestoFotovoltaica,
        presupuestoTotal,
        caeBonus,
        irpfCaeAmount,
        caeNeto,
        irpfDeductionPerOwner,
        irpfDeduction,
        caeMaintenanceCost,
        totalBeneficioFiscal,
        totalAyuda: totalBeneficioFiscal,
        porcentajeCubierto,
        costeFinal,
    };
}

/**
 * Lo que cuestan nuestros servicios en ESTA propuesta.
 *
 * `colaborador` es el nombre de la empresa con la que se co-marca la propuesta
 * (instalador o prescriptor; nunca BROKERGY). Con «Descuento Certificados» activo
 * y un colaborador, la bonificación se le atribuye a él: es el argumento comercial
 * de la propuesta conjunta.
 */
export function costesServicio({ fin, descuentoCertificados = false, colaborador = null } = {}) {
    const aPagar = r(fin?.caeMaintenanceCost);
    const descuento = Math.max(0, Math.round((TARIFA_TOTAL - aPagar) * 100) / 100);
    const gratis = aPagar === 0;
    const porColaboracion = !!(descuentoCertificados && colaborador);
    return {
        lineas: TARIFA_SERVICIOS,
        tarifa: TARIFA_TOTAL,
        aPagar,
        descuento,
        gratis,
        porColaboracion,
        // Rótulo de la bonificación, el mismo en la portada y en las condiciones.
        promocion: porColaboracion
            ? `Bonificación por la colaboración con ${colaborador}`
            : 'Promoción BROKERGY',
    };
}
