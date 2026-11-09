// ============================================================================
// viaFm.js (frontend) — ESPEJO MÍNIMO de backend/utils/viaFm.js para lo que
// imprimen los documentos del LOTE (listado de actuaciones y solicitud de
// verificación): si el número es de la vía del FACTOR MULTIPLICADOR y qué ficha
// oficial le toca. Todo lo demás de la vía (qué documentos pide, la vivienda
// habitual…) lo resuelve el backend y llega por `GET /api/expedientes/:id/via-fm`.
//
// `test_via_fm.mjs` compara las dos copias: si divergen, falla.
// Detalle: docs/conocimiento/expedientes/la-via-del-factor-multiplicador-en-el-expediente.md
// ============================================================================

/** 26RES060FM_12 / 26RES093FM_3: «FM» pegado a la ficha; mismo contador que la vigente (Fran, 09/11/2026). */
export const esNumeroFm = (numero) => /^\d{2}(RES060|RES080|RES093)FM_\d+$/i.test(String(numero || '').trim());

const FICHA_HIBRIDACION_FM = {
    A: { ficha: 'RES090_FM', zonas: 'A3 o A4' },
    B: { ficha: 'RES091_FM', zonas: 'B3 o B4' },
    C: { ficha: 'RES092_FM', zonas: 'C1, C2, C3 o C4' },
    D: { ficha: 'RES093_FM', zonas: 'D1, D2 o D3' },
    E: { ficha: 'RES094_FM', zonas: 'E1' },
};

const letraZona = (zona) => {
    const l = String(zona || '').trim().toUpperCase().charAt(0);
    return 'ABCDE'.includes(l) && l ? l : null;
};

/** Mismo contrato que el backend: { codigo, titulo, sinZona, version }. */
export function fichaOficialFm({ hibridacion = false, zona = null, vulnerable = false } = {}) {
    let codigo;
    let titulo;
    let sinZona = false;
    if (hibridacion) {
        const z = letraZona(zona);
        sinZona = !z;
        const t = FICHA_HIBRIDACION_FM[z || 'D'];
        codigo = t.ficha;
        titulo = `Hibridación en modo paralelo de caldera/s de combustión con bomba de calor de accionamiento eléctrico en edificios residenciales ubicados en la zona climática ${t.zonas} con coeficiente corrector con factor de multiplicador aplicable`;
        if (vulnerable) titulo += ', en vivienda habitada por un consumidor vulnerable';
    } else {
        codigo = 'RES060_FM';
        titulo = vulnerable
            ? 'Sustitución de caldera por bomba de calor de accionamiento eléctrico con coeficiente corrector con factor multiplicador cuando habiten consumidores vulnerables'
            : 'Sustitución de caldera por bomba de calor de accionamiento eléctrico con coeficiente corrector con factor multiplicador aplicable';
    }
    if (vulnerable) codigo += '-S';
    return { codigo, titulo, sinZona, version: 'V1.0' };
}

// ── El CONSENTIMIENTO INFORMADO del punto 12 de las fichas FM ───────────────
// La ficha pide que el beneficiario declare, por escrito, que ha sido informado
// de dos cosas: que el incentivo es un aumento patrimonial que tributa en el IRPF
// y que el ahorro depende de cómo funcione la bomba de calor. Fran (07/11/2026):
// «eso puede ser una cláusula del Convenio CAE y también aparecer en la propuesta
// que se le envía» — SOLO en los FM. Los tres textos salen de aquí:
//   · el Convenio de Cesión (docGenerators.buildAnexoCesionHtml), que es lo que FIRMA;
//   · la nota de la portada de la propuesta (ProposalModal), si va por la vía FM;
//   · la línea del mensaje de envío, junto al aviso del factor multiplicador.

/** Lo que se acepta, en dos letras. `esEmpresa`: sociedades, «impuesto que le corresponda». */
const puntosFm = ({ esEmpresa = false } = {}) =>
    `a) el incentivo producirá un aumento patrimonial que supondrá un incremento en el IRPF${esEmpresa ? ' (o en el impuesto sobre la renta que le corresponda)' : ''}; y b) el ahorro dependerá de las condiciones de funcionamiento de la bomba de calor`;

/** La cláusula del Convenio, con un cedente («El Cedente ha sido informado…»). */
export function textoConsentimientoFm({ codigo = 'RES060_FM', esEmpresa = false } = {}) {
    return `El Cedente ha sido informado del ahorro energético y económico derivado del cambio de su caldera por una bomba de calor (ficha ${codigo}, con factor multiplicador) y acepta que: ${puntosFm({ esEmpresa })}.`;
}

/** Con VARIOS cedentes: el «Cuarto» del EXPONEN, en plural. */
export function textoConsentimientoFmVarios({ codigo = 'RES060_FM', esEmpresa = false } = {}) {
    return `los Cedentes han sido informados del ahorro energético y económico derivado del cambio de la caldera por una bomba de calor (ficha ${codigo}, con factor multiplicador) y aceptan que: ${puntosFm({ esEmpresa })}.`;
}

/** Nota al pie de la portada de la propuesta (vía FM elegida). */
export const NOTA_FM_PROPUESTA = 'Si el bono se tramita por la vía del factor multiplicador, la ficha exige que el titular acepte por escrito, en el Convenio de Cesión, que el incentivo es un aumento patrimonial que tributa en su IRPF y que el ahorro dependerá de las condiciones de funcionamiento de la bomba de calor.';

/**
 * La línea del mensaje de envío. `trasAviso`: va justo después del párrafo del
 * factor multiplicador (`avisoFc.lineaFactorCorreccion`) y se apoya en él («esa
 * vía»); sin él, la propuesta ya va por la vía FM y se dice entera.
 */
export function lineaConsentimientoFm({ tuteo = true, trasAviso = true } = {}) {
    const quien = tuteo ? 'que firmes que te hemos informado' : 'que el cliente firme que ha sido informado';
    const su = tuteo ? 'tu' : 'su';
    const arranque = trasAviso
        ? 'Si se tramita por esa vía, la ficha pide además'
        : `ℹ️ *Vía del factor multiplicador.* ${tuteo ? 'Tu bono' : 'El bono del cliente'} se tramitará por esa vía, y la ficha pide`;
    return `${arranque} ${quien} de dos cosas: que el bono es un aumento patrimonial que tributa en ${su} IRPF, y que el ahorro dependerá de las condiciones de funcionamiento de la bomba de calor. Va como cláusula en el Convenio de Cesión.`;
}

/**
 * La ficha oficial de un expediente del lote, o null si no va por la vía FM.
 * `e`: el expediente con `documentacion.via_fm` y, si los hay, `cee`/oportunidad
 * para la zona (solo cuenta en la hibridación).
 */
export function fichaOficialDeExpediente(e = {}) {
    if (!esNumeroFm(e.numero_expediente)) return null;
    const via = e.documentacion?.via_fm || {};
    const zona = e.oportunidades?.datos_calculo?.zona || e.oportunidad?.datos_calculo?.zona
        || e.datos_calculo?.zona || e.cee?.cee_inicial?.zonaClimatica || null;
    return fichaOficialFm({ hibridacion: /RES093FM_/i.test(e.numero_expediente), zona, vulnerable: via.vulnerable === true });
}
