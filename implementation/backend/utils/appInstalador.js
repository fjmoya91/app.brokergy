// ─── App del INSTALADOR (fase 1): quién entra y cómo se lee una OBRA ─────────
//
// Fran, 21/11/2026: una app nueva SOLO para el rol INSTALADOR, mobile first y para
// gente sin experiencia digital. Se abre por BETA (el primero, RCA): el resto de
// partners y el equipo interno siguen EXACTAMENTE igual.
//
// Este módulo es la FUENTE ÚNICA de dos decisiones:
//   1. `enBetaInstalador(user)` — quién ve la app nueva. El backend lo convierte en
//      `app_instalador` de GET /api/usuarios/me y el frontend SOLO lee ese campo: no
//      se añade otra definición de «partner» en el navegador (ya hay cuatro).
//   2. La tabla estado → PASO (1–5) y QUIÉN tiene la pelota de una obra
//      (oportunidad + expediente = UNA obra). Documentada en
//      docs/conocimiento/instalador-app/app-del-instalador-fase-1.md.
//
// Módulo PURO (sin Supabase): lo prueba scripts/test_app_instalador.js.

const { rankEstado } = require('./expedienteEstados');
const { estadoDesdeExpediente } = require('./estadoOportunidad');

// ── 1. El interruptor de la beta ─────────────────────────────────────────────
// `APP_INSTALADOR_BETA` = los `id_empresa` de `prescriptores` en beta, separados por
// comas. Sin variable, nadie entra (la app nueva está APAGADA por defecto).
function empresasEnBeta(env = process.env) {
    return String(env.APP_INSTALADOR_BETA || '')
        .split(/[\s,;]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
}

/**
 * ¿Ve este usuario la app nueva del instalador?
 * Solo un usuario con rol INSTALADOR, con empresa, y con esa empresa en la beta.
 * El DISTRIBUIDOR nunca (decisión de Fran: sigue con la interfaz de siempre), ni el
 * equipo interno, ni el certificador.
 */
function enBetaInstalador(user, env = process.env) {
    if (!user || !user.id_usuario || !user.prescriptor_id) return false;
    if (String(user.rol_nombre || '').toUpperCase() !== 'INSTALADOR') return false;
    return empresasEnBeta(env).includes(String(user.prescriptor_id).toLowerCase());
}

// ── 2. Paso de la obra y quién tiene la pelota ───────────────────────────────
const PASOS = ['Simulada', 'Propuesta enviada', 'Aceptada', 'En trámite', 'Cobrada'];

// Estados de CAPTACIÓN (oportunidad sin expediente) → paso y quién.
// `EN CURSO` sin expediente = la propuesta la está preparando BROKERGY.
const CAPTACION = {
    'LEAD': { paso: 1, quien: 'tu' },
    'PTE ENVIAR': { paso: 1, quien: 'tu' },
    'EN CURSO': { paso: 1, quien: 'nos' },
    'ENVIADA': { paso: 2, quien: 'cli' },
    'PRE-ACEPTADO': { paso: 2, quien: 'cli' },
    // ACEPTADA sin expediente dura segundos (el trigger crea el expediente).
    'ACEPTADA': { paso: 3, quien: 'nos' },
};

/** ¿Hay huella de obra HECHA? El MISMO criterio que el radar (`detectarFinObra`). */
function obraHecha(e = {}) {
    return !!e.fin_obra || (e.n_facturas > 0) || !!e.cifo_enviado || !!e.cifo_borrador || !!e.rite_recibido;
}

/** CEE inicial registrado: la obra ya se puede hacer (y facturar). */
function ceeInicialRegistrado(e = {}) {
    return !!e.fecha_reg_ini || e.seg_cee_ini === 'REGISTRADO' || rankEstado(e.estado) >= rankEstado('PTE. FIN OBRA');
}

/**
 * Las TAREAS del instalador en una obra con expediente. Sale de `estadoInstalador`
 * (logic/instaladorPendientes.js), la MISMA función que la página /instalador/:id:
 *   · firmar el certificado de la instalación (CIFO): hay borrador, se lo hemos
 *     mandado (o pedido de nuevo), no está recibido y no está rechazado sin corregir;
 *   · subir la legalización RITE: no la tenemos y ya se la hemos pedido;
 *   · la factura de la obra: no hay ninguna y el CEE inicial está registrado.
 * Solo si ESTA empresa es la instaladora de la obra: un instalador que trae la obra
 * pero no la instala no tiene nada que firmar.
 *
 * @param {object} e   el expediente en escalares (ver routes/instaladorApp.js)
 * @param {object} est el resultado de `estadoInstalador(doc)`
 */
function tareasDeExpediente(e, est, { esInstaladora = true } = {}) {
    if (!esInstaladora || !est) return [];
    if (e.estado === 'FINALIZADO' || e.estado === 'RECHAZADO') return [];
    const t = [];
    const cifo = est.cifo || {};
    if (cifo.borrador && !cifo.recibido && !cifo.bloqueado && (cifo.sentAt || cifo.refirma)) {
        t.push({ key: 'cifo', que: cifo.refirma ? 'Vuelve a firmar el certificado de la instalación' : 'Firma el certificado de la instalación' });
    }
    const rite = est.rite || {};
    if (!rite.recibido && (rite.sentAt || cifo.sentAt)) {
        t.push({ key: 'rite', que: 'Sube la legalización RITE' });
    }
    if (!(e.n_facturas > 0) && ceeInicialRegistrado(e)) {
        t.push({ key: 'factura', que: 'Haz la factura de la obra' });
    }
    return t;
}

/** ¿El cliente tiene algo enviado a firmar sin devolver? (Anexo I / Convenio de Cesión). */
function esperaAlCliente(e = {}) {
    const pend = (sent, signed) => !!sent && !signed;
    return pend(e.anexo_i_sent, e.anexo_i_signed) || pend(e.anexo_cesion_sent, e.anexo_cesion_signed);
}

/**
 * Paso (1–5) y quién de una obra.
 * Coherente con `estadoDesdeExpediente` (utils/estadoOportunidad.js):
 *   estado visible ACEPTADA → paso 3 · EN CURSO → 3 (obra por hacer) o 4 (obra hecha)
 *   · FINALIZADO → 5 · RECHAZADA → fuera de la app (null).
 *
 * @returns {{paso:number, fase:string, quien:'tu'|'nos'|'cli'|'fin', tareas:Array}|null}
 */
function pasoDeObra({ estadoCaptacion, exp = null, est = null, esInstaladora = true }) {
    if (!exp) {
        const c = CAPTACION[String(estadoCaptacion || 'PTE ENVIAR').toUpperCase()];
        if (!c) return null; // RECHAZADA u otro: no es una obra en marcha
        const tareas = c.quien === 'tu' ? [{ key: 'propuesta', que: 'Envía la propuesta al cliente' }] : [];
        return { paso: c.paso, fase: PASOS[c.paso - 1], quien: c.quien, tareas };
    }
    const visible = estadoDesdeExpediente({ estado: exp.estado, cee: { certificador_id: exp.certificador_id } });
    if (visible === 'RECHAZADA') return null;
    if (visible === 'FINALIZADO') return { paso: 5, fase: PASOS[4], quien: 'fin', tareas: [] };

    let paso = 3;
    if (visible === 'EN CURSO' && (rankEstado(exp.estado) >= rankEstado('PTE. CEE FINAL') || obraHecha(exp))) paso = 4;

    const tareas = tareasDeExpediente(exp, est, { esInstaladora });
    const quien = tareas.length ? 'tu' : esperaAlCliente(exp) ? 'cli' : 'nos';
    return { paso, fase: PASOS[paso - 1], quien, tareas };
}

// ── 3. Las cuentas del cliente ───────────────────────────────────────────────
/**
 * Línea a línea, con las MISMAS cifras de `calculateFinancials` (las del «Coste
 * final» de la propuesta). El total es la suma de lo impreso, redondeado a euros.
 * Mismo cálculo que `cuentasCliente` de la página de la oportunidad del partner.
 */
function cuentasCliente(f) {
    const r = (n) => Math.round(Number(n) || 0);
    const obra = r(f?.presupuestoTotal ?? f?.presupuesto);
    if (!(obra > 0)) return null;
    const lineas = [
        { k: 'obra', texto: 'Presupuesto de la obra', eur: obra },
        { k: 'bono', texto: 'Bono CAE', eur: -r(f.caeBonus) },
    ];
    if (r(f.irpfCaeAmount) > 0) lineas.push({ k: 'irpfbono', texto: 'IRPF a pagar por el bono', eur: r(f.irpfCaeAmount) });
    if (r(f.irpfDeduction) > 0) lineas.push({ k: 'irpf', texto: 'Deducción en la Renta, hasta', eur: -r(f.irpfDeduction) });
    if (r(f.caeMaintenanceCost) > 0) lineas.push({ k: 'gestion', texto: 'Gestión del expediente', eur: r(f.caeMaintenanceCost) });
    const total = Math.max(0, lineas.reduce((s, l) => s + l.eur, 0));
    return { obra, lineas, total };
}

/**
 * Qué economía manda para el BONO de la obra:
 *  · sin expediente, la de la página de la oportunidad del partner: la de la reforma
 *    solo si la propuesta va SOLO con la reforma (`comparativaReforma === false`);
 *  · con expediente, la ACEPTADA, por `propuestaGuardada` (la misma que el portal del
 *    cliente y el panel del expediente): en un RES080, la de la reforma.
 */
function financialsDeLaObra({ fin, fin080, kwh080, isReforma, comparativaReforma, conExpediente, esRes080, propuestaGuardada }) {
    if (!conExpediente) {
        const soloReforma = !!(isReforma && fin080 && comparativaReforma === false);
        return (soloReforma ? fin080 : fin) || {};
    }
    const op = { datos_calculo: { result: { financials: fin || {}, financialsRes080: fin080 || null, res080: { ahorroEnergiaFinalTotal: kwh080 } } } };
    return propuestaGuardada(op, !!esRes080).financials || {};
}

module.exports = {
    empresasEnBeta, enBetaInstalador, PASOS, CAPTACION,
    obraHecha, ceeInicialRegistrado, tareasDeExpediente, esperaAlCliente, pasoDeObra,
    cuentasCliente, financialsDeLaObra,
};
