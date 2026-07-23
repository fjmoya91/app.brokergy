// ============================================================================
// dashboardAgg.js — Motor del Cuadro de Mando.
//
// Traduce la cartera de expedientes a las cifras que se negocian fuera:
//   · con el SUJETO OBLIGADO → cuántos MWh/GWh tenemos comprometidos,
//   · con el GESTOR          → cuánto vamos a facturar y cuánto margen queda.
//
// NO recalcula economía: delega en computeExpedienteFinancials, el mismo helper
// que usa el listado de Expedientes. Si los números del panel no cuadran con los
// del listado, es un bug del helper, no de dos matemáticas distintas.
// ============================================================================
import { computeExpedienteFinancials } from '../../expedientes/logic/expedienteFinancials';
import { getFicha, getCCAA, getAnioPrevision, getCifoYear, normalizeCcaa, CCAA_MAP, pad2 } from '../../expedientes/logic/expedienteTaxonomia';

// Precio de venta al Sujeto Obligado por defecto, €/MWh. Es el mismo default que
// aplica calculateFinancials cuando la oportunidad no trae `cae_so_rate`.
export const PRECIO_SO_DEFAULT = 160;
export const PRECIO_SO_DEFAULT_RES080 = 140;

// ─── Fases del ciclo de vida ─────────────────────────────────────────────────
// El orden es el del embudo: de arriba (recién aceptado) a abajo (cobrado).
//
// OJO — un expediente SOLO existe si su oportunidad fue ACEPTADA. Por eso aquí
// no hay ninguna fase de "captación": eso pertenece al mundo de las
// oportunidades. Todo lo que hay en este panel está ya en marcha.
//
// Las listas cubren tanto los estados de EXPEDIENTE_ESTADOS (el desplegable del
// detalle) como los del lifecycle documentado en CLAUDE.md ('REVISADO Y LISTO
// (INICIAL)', 'EN TRABAJO (CEE INICIAL)'…), que conviven en la BD. Si falta
// alguno, el expediente cae en la primera fase y se cuenta como no reconocido
// para que se vea, en vez de desaparecer en una fase que no le toca.
//
// `fiabilidad` separa "lo que espero" de "lo que tengo firmado": al Sujeto
// Obligado se le comprometen los GWh de las fases avanzadas; los de las
// tempranas son previsión y pueden caerse.
export const FASES = [
    {
        id: 'CEE_INICIAL',
        label: 'CEE inicial',
        desc: 'Tramitando el certificado energético de partida',
        fiabilidad: 'prevision',
        color: 'slate',
        estados: [
            'PTE. CEE INICIAL', 'EN CERTIFICADOR CEE INICIAL', 'EN TRABAJO (CEE INICIAL)',
            'PENDIENTE REVISIÓN (INICIAL)', 'REVISADO Y LISTO (INICIAL)', 'PENDIENTE REVISAR EXPTE'
        ]
    },
    {
        id: 'OBRA',
        label: 'En obra',
        desc: 'CEE inicial resuelto: la instalación está por ejecutar o en curso',
        fiabilidad: 'prevision',
        color: 'amber',
        estados: ['PTE. FIN OBRA']
    },
    {
        id: 'CIERRE',
        label: 'Cierre y documentación',
        desc: 'Obra terminada: CEE final, anexos y CIFO en trámite',
        fiabilidad: 'probable',
        color: 'blue',
        estados: [
            'PTE. CEE FINAL', 'EN CERTIFICADOR CEE FINAL', 'EN TRABAJO (CEE FINAL)',
            'PENDIENTE REVISIÓN (FINAL)', 'REVISADO Y LISTO (FINAL)',
            'PTE FIRMA ANEXOS', 'PTE. CIFO BROKERGY', 'PTE FIRMA CIFO', 'PTE FIN EXPTE'
        ]
    },
    {
        id: 'LISTO',
        label: 'Listo para lote',
        desc: 'Documentación completa, pendiente de agrupar en lote',
        fiabilidad: 'firme',
        color: 'violet',
        estados: ['DOC. COMPLETA', 'DOC. COMPLETA APPSHEET']
    },
    {
        id: 'VERIFICACION',
        label: 'En verificación',
        desc: 'Enviado a verificador o en trámite MITECO',
        fiabilidad: 'firme',
        color: 'pink',
        estados: ['ENVIADO A VERIFICADOR', 'REQUERIMIENTO VERIFICADOR', 'PTE. SUBIDA MITECO', 'REQUERIMIENTO G.A.']
    },
    {
        id: 'EMITIDO',
        label: 'CAE emitido',
        desc: 'Certificados emitidos: pendiente de cobro o ya cerrado',
        fiabilidad: 'cobrable',
        color: 'emerald',
        // Ojo con el guion: 'CAE EMITIDO – PTE PAGO BROKERGY' lleva guion largo (U+2013).
        estados: ['CAE EMITIDO – PTE PAGO BROKERGY', 'PTE. PAGO BROKERGY A CLIENTE', 'FINALIZADO']
    }
];

// Fases cuyo volumen se puede COMPROMETER ante el Sujeto Obligado sin apostar:
// de documentación completa en adelante.
export const FASES_COMPROMETIBLES = ['LISTO', 'VERIFICACION', 'EMITIDO'];

// ─── Captación: lo que pasa ANTES de que exista el expediente ────────────────
// Vive en `oportunidades`, no en `expedientes`. Al aceptarse una oportunidad se
// crea su expediente y pasa al embudo de arriba, así que estas dos listas nunca
// se solapan: ACEPTADA y RECHAZADA quedan fuera a propósito (la primera ya está
// contada como expediente; la segunda está perdida).
export const FASES_CAPTACION = [
    { id: 'LEAD',       label: 'Lead',              desc: 'Entró por la landing, sin trabajar todavía', color: 'slate',  estados: ['LEAD'] },
    { id: 'PTE_ENVIAR', label: 'Propuesta por enviar', desc: 'Calculada pero aún no enviada al cliente', color: 'amber', estados: ['PTE ENVIAR'] },
    { id: 'EN_CURSO',   label: 'En elaboración',    desc: 'Trabajándose la propuesta',                   color: 'blue',   estados: ['EN CURSO'] },
    { id: 'ENVIADA',    label: 'Enviada',           desc: 'En manos del cliente, esperando respuesta',   color: 'violet', estados: ['ENVIADA'] }
];

const FASE_POR_ESTADO_OP = FASES_CAPTACION.reduce((acc, f) => {
    f.estados.forEach(e => { acc[e] = f.id; });
    return acc;
}, {});

export const getEstadoOportunidad = (op) => (op?.datos_calculo?.estado || 'PTE ENVIAR').toUpperCase();
// Una oportunidad cuenta como captación viva mientras no esté aceptada ni
// rechazada. Si ya tiene expediente, se excluye aunque su estado diga otra cosa:
// mandan los hechos, no la etiqueta (hay 2 ENVIADA con expediente creado).
export const esCaptacionViva = (op, idsConExpediente) =>
    !!FASE_POR_ESTADO_OP[getEstadoOportunidad(op)] && !idsConExpediente.has(String(op.id));

const ESTADO_DEFAULT = 'PTE. CEE INICIAL';
const FASE_POR_ESTADO = FASES.reduce((acc, f) => {
    f.estados.forEach(e => { acc[e] = f.id; });
    return acc;
}, {});

export const getEstado = (exp) => exp.estado || ESTADO_DEFAULT;
export const esEstadoReconocido = (exp) => !!FASE_POR_ESTADO[getEstado(exp)];
// Un estado desconocido cae en la PRIMERA fase (la menos comprometida) en vez de
// desaparecer del panel. Se marca como no reconocido para poder avisar: meterlo
// callando en una fase avanzada inflaría lo que se promete al Sujeto Obligado.
export const getFaseId = (exp) => FASE_POR_ESTADO[getEstado(exp)] || FASES[0].id;

// ─── Precio de venta guardado en cada expediente ─────────────────────────────
// Espejo de expedienteFinancials: el override de la instalación manda sobre el
// input de la oportunidad, y el default depende de la ficha.
export function getPrecioSOGuardado(exp) {
    const overrides = exp.instalacion?.economico_override || {};
    if (overrides.cae_so_rate != null && overrides.cae_so_rate !== '') return parseFloat(overrides.cae_so_rate);
    const ficha = getFicha(exp);
    if (ficha === 'RES080') return PRECIO_SO_DEFAULT_RES080;
    const opRate = parseFloat(exp.oportunidades?.datos_calculo?.inputs?.cae_so_rate);
    return opRate || PRECIO_SO_DEFAULT;
}

// Días transcurridos desde una fecha ISO. null si no hay fecha utilizable.
export function diasDesde(iso) {
    if (!iso) return null;
    const t = new Date(iso).getTime();
    if (isNaN(t)) return null;
    return Math.floor((Date.now() - t) / 86400000);
}

// ─── Fila del panel: un expediente ya "resuelto" ─────────────────────────────
// Se calcula UNA vez por expediente (no por cambio de filtro ni de precio), que
// es lo caro: computeExpedienteFinancials reejecuta el motor de cálculo.
export function buildRow(exp) {
    const fin = computeExpedienteFinancials(exp);
    // El ahorro VERIFICADO por el verificador manda sobre el estimado en cuanto
    // existe: es la cifra que acabará en la factura al Sujeto Obligado.
    const esVerificado = fin.savingsKwhVerificado != null;
    const kwh = (esVerificado ? fin.savingsKwhVerificado : fin.savingsKwh) || 0;
    const cae = (esVerificado ? fin.caeVerificado : fin.cae) || 0;
    const profit = esVerificado ? fin.profitVerificado : fin.profit;

    return {
        id: exp.id,
        numero: exp.numero_expediente || '—',
        cliente: [exp.clientes?.nombre_razon_social, exp.clientes?.apellidos].filter(Boolean).join(' ') || '—',
        estado: getEstado(exp),
        faseId: getFaseId(exp),
        estadoReconocido: esEstadoReconocido(exp),
        // Señales para la bandeja de "requiere tu atención".
        prioridad: exp.prioridad || 'NORMAL',
        incidenciasAbiertas: exp.incidencias_abiertas || 0,
        diasSinMovimiento: diasDesde(exp.updated_at || exp.created_at),
        // Sin año de CIFO no se puede agrupar en lote (el lote va por año + CCAA),
        // así que un expediente con la documentación lista pero sin esta fecha se
        // queda atascado sin que nada lo delate.
        tieneAnioCifo: getCifoYear(exp) != null,
        ficha: fin.ficha || getFicha(exp),
        anio: getAnioPrevision(exp),
        // Normalizada: si no, 'MADRID' y 'Madrid' cuentan como dos comunidades.
        ccaa: normalizeCcaa(getCCAA(exp)),
        certificadorId: exp.cee?.certificador_id ? String(exp.cee.certificador_id) : null,
        instaladorId: (exp.instalacion?.instalador_id || exp.oportunidades?.prescriptor_id)
            ? String(exp.instalacion?.instalador_id || exp.oportunidades?.prescriptor_id) : null,
        mwh: kwh / 1000,
        cae,                                   // lo que se paga al cliente (precio ya ofertado, NO se simula)
        profit: profit == null ? null : profit, // null = rol sin permiso para ver margen
        precioSOGuardado: getPrecioSOGuardado(exp),
        esVerificado,
        esEstimadoHeredado: !!fin.estimadoGuardado,
        sinEconomia: kwh === 0
    };
}

// ─── Fila de una oportunidad en captación ────────────────────────────────────
// Misma forma que buildRow para poder reutilizar agregar()/repricearFila() tal
// cual. Aquí NO se recalcula nada: una oportunidad no tiene CEE ni instalación,
// así que su economía es la que se le presentó al cliente (el snapshot guardado).
export function buildRowOportunidad(op) {
    const dc = op.datos_calculo || {};
    const fin = dc.result?.financials || {};
    const sav = dc.result?.savings || {};
    const inputs = dc.inputs || {};

    const kwh = fin.ahorroKwh ?? sav.savingsKwh ?? dc.result?.savingsKwh ?? 0;
    const cod = pad2(inputs.provincia);
    const anioCreacion = op.created_at ? new Date(op.created_at).getFullYear() : null;

    return {
        id: op.id,
        numero: op.id_oportunidad || '—',
        cliente: op.referencia_cliente || '—',
        estado: getEstadoOportunidad(op),
        faseId: FASE_POR_ESTADO_OP[getEstadoOportunidad(op)] || 'PTE_ENVIAR',
        estadoReconocido: true,
        // Misma forma que buildRow. Una oportunidad no genera avisos de bandeja
        // (no tiene incidencias ni prioridad ni CIFO), pero conviene que las dos
        // filas sean intercambiables para poder reutilizar agregar()/repricear().
        prioridad: 'NORMAL',
        incidenciasAbiertas: 0,
        diasSinMovimiento: diasDesde(op.created_at),
        tieneAnioCifo: false,
        ficha: op.ficha || 'RES060',
        anio: anioCreacion && !isNaN(anioCreacion) ? anioCreacion : null,
        ccaa: normalizeCcaa((cod && CCAA_MAP[cod]) || '—'),
        certificadorId: null,          // una oportunidad todavía no tiene certificador
        instaladorId: (op.instalador_asociado_id || op.prescriptor_id)
            ? String(op.instalador_asociado_id || op.prescriptor_id) : null,
        mwh: (Number(kwh) || 0) / 1000,
        cae: Number(fin.caeBonus) || 0,
        profit: fin.profitBrokergy == null ? null : Number(fin.profitBrokergy),
        precioSOGuardado: parseFloat(inputs.cae_so_rate) || PRECIO_SO_DEFAULT,
        esVerificado: false,
        esEstimadoHeredado: true,      // por definición: es la estimación de la propuesta
        sinEconomia: !kwh
    };
}

export function agregarPorFaseCaptacion(rows, precioVenta) {
    return FASES_CAPTACION.map(fase => {
        const propias = rows.filter(r => r.faseId === fase.id);
        return { fase, ...agregar(propias, precioVenta), subEstados: agregarPorEstado(propias, precioVenta) };
    });
}

// ─── Simulación de precio ────────────────────────────────────────────────────
// calculateFinancials calcula profit = MWh × (precioSO − precioCliente − …) − costes,
// es decir LINEAL en el precio de venta con pendiente MWh. Por eso reprecipar es
// exacto (no una aproximación): basta desplazar el beneficio por el delta.
//
// Única excepción conocida: si Brokergy asume los certificados, calculateFinancials
// aplica un suelo (Math.max(-coste, …)) que solo se activa con beneficios negativos,
// escenario que exigiría vender por debajo de lo pagado al cliente.
export function repricearFila(row, precioVenta) {
    const facturacion = row.mwh * precioVenta;
    const profit = row.profit == null ? null : row.profit + row.mwh * (precioVenta - row.precioSOGuardado);
    return { facturacion, profit };
}

// ─── Agregación ──────────────────────────────────────────────────────────────
export function agregar(rows, precioVenta) {
    const base = {
        count: 0, mwh: 0, facturacion: 0, cae: 0, profit: 0,
        profitDisponible: false, sinMargen: 0, verificados: 0, heredados: 0,
        sinEconomia: 0, sinClasificar: 0
    };
    return rows.reduce((acc, row) => {
        const { facturacion, profit } = repricearFila(row, precioVenta);
        acc.count += 1;
        acc.mwh += row.mwh;
        acc.facturacion += facturacion;
        acc.cae += row.cae;
        // Los expedientes sin margen calculable se EXCLUYEN de la suma, no la
        // anulan: con 200+ expedientes basta uno incompleto para que el total
        // se quede en blanco, que es justo cuando el dato hace más falta.
        // `sinMargen` los cuenta para poder avisar de sobre cuántos se calcula.
        if (profit == null) acc.sinMargen += 1;
        else { acc.profit += profit; acc.profitDisponible = true; }
        if (row.esVerificado) acc.verificados += 1;
        if (row.esEstimadoHeredado) acc.heredados += 1;
        if (row.sinEconomia) acc.sinEconomia += 1;
        if (row.estadoReconocido === false) acc.sinClasificar += 1;
        return acc;
    }, base);
}

// Totales por fase, en el orden del embudo. Incluye las fases vacías para que el
// embudo no cambie de forma al filtrar (un hueco informa tanto como una barra).
export function agregarPorFase(rows, precioVenta) {
    return FASES.map(fase => {
        const propias = rows.filter(r => r.faseId === fase.id);
        return { fase, ...agregar(propias, precioVenta), subEstados: agregarPorEstado(propias, precioVenta) };
    });
}

// Desglose de una fase en los estados REALES que la componen, para poder abrir
// una fase y ver de qué está hecha sin salir del panel. Solo devuelve los que
// tienen expedientes: listar estados a cero solo añade ruido.
export function agregarPorEstado(rows, precioVenta) {
    const mapa = new Map();
    rows.forEach(r => {
        if (!mapa.has(r.estado)) mapa.set(r.estado, []);
        mapa.get(r.estado).push(r);
    });
    return Array.from(mapa.entries())
        .map(([estado, group]) => ({ estado, ...agregar(group, precioVenta) }))
        .sort((a, b) => b.count - a.count);
}

// Agrupación genérica por un eje (año, CCAA, ficha, certificador…), ordenada de
// mayor a menor facturación: lo que más pesa, primero.
export function agregarPor(rows, precioVenta, keyFn, labelFn = String) {
    const mapa = new Map();
    rows.forEach(row => {
        const key = keyFn(row) ?? '—';
        if (!mapa.has(key)) mapa.set(key, []);
        mapa.get(key).push(row);
    });
    return Array.from(mapa.entries())
        .map(([key, group]) => ({ key, label: labelFn(key), ...agregar(group, precioVenta) }))
        .sort((a, b) => b.facturacion - a.facturacion);
}

// ─── Formato ─────────────────────────────────────────────────────────────────
// Mismas firmas que LotesView/ExpedientesView para que las cifras se lean igual
// en toda la app.
export const eur = (n) => (Number(n) || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
export const mwh = (n) => `${(Number(n) || 0).toLocaleString('es-ES', { maximumFractionDigits: 1 })} MWh`;
export const num = (n, dec = 0) => (Number(n) || 0).toLocaleString('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: dec });

// Por encima de 1 GWh la cifra en MWh deja de leerse de un vistazo, que es justo
// lo que pide el panel. Es también la unidad en la que se habla con el S.O.
export function energiaCorta(mwhValue) {
    const v = Number(mwhValue) || 0;
    if (Math.abs(v) >= 1000) return { valor: num(v / 1000, 2), unidad: 'GWh' };
    return { valor: num(v, 1), unidad: 'MWh' };
}
