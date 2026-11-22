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

/**
 * Fase 6: ¿tiene el ASISTENTE (el chat de la app)? Con la beta, encendido salvo
 * `ASISTENTE_INSTALADOR_ENABLED=false`, y solo si el servidor tiene la llave de la
 * API de Claude. Lo lee `/api/usuarios/me` (`asistente_instalador`) y la ruta.
 */
function asistenteEncendido(user, env = process.env) {
    if (!enBetaInstalador(user, env)) return false;
    return env.ASISTENTE_INSTALADOR_ENABLED !== 'false' && !!String(env.ANTHROPIC_API_KEY || '').trim();
}

// ── 2. Paso de la obra y quién tiene la pelota ───────────────────────────────
const PASOS = ['Simulada', 'Propuesta enviada', 'Aceptada', 'En trámite', 'Cobrada'];

// Estados de CAPTACIÓN (oportunidad sin expediente) → paso y quién.
// Sin enviar (LEAD, PTE ENVIAR, EN CURSO) = la propuesta la prepara y la manda
// BROKERGY: el instalador NO puede enviarla (los botones del popup son de ADMIN y
// `send-proposal` / `send-media` son `staffOClaveInterna`, regla 102). Hasta el
// 21/11/2026 esto decía `tu` con la tarea «Envía la propuesta al cliente», que le
// llevaba a una calculadora sin botón de enviar.
// ENVIADA: `cli`, SALVO que solo le haya llegado al instalador (regla 136): entonces
// le toca a él pasársela a su cliente (ver `pasoDeObra`).
const CAPTACION = {
    'LEAD': { paso: 1, quien: 'nos' },
    'PTE ENVIAR': { paso: 1, quien: 'nos' },
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
function pasoDeObra({ estadoCaptacion, exp = null, est = null, esInstaladora = true, entrega = null }) {
    if (!exp) {
        const c = CAPTACION[String(estadoCaptacion || 'PTE ENVIAR').toUpperCase()];
        if (!c) return null; // RECHAZADA u otro: no es una obra en marcha
        // Enviada SOLO al instalador (lo normal con los partners, regla 136): la
        // pelota la tiene él hasta que se la pase a su cliente.
        const soloEl = c.paso === 2 && !!entrega && entrega.instalador && !entrega.cliente;
        if (soloEl) return { paso: 2, fase: PASOS[1], quien: 'tu', tareas: [{ key: 'propuesta', que: 'Pásale la propuesta a tu cliente' }] };
        return { paso: c.paso, fase: PASOS[c.paso - 1], quien: c.quien, tareas: [] };
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

// ── 4. TODO lo de la obra, en el orden en que pasa ───────────────────────────
// Fran, 21/11/2026: «hay que darle una vuelta a la vista de las obras, para ver todo,
// la factura, etc.». UNA lista para CUALQUIER obra —con expediente o sin él—, de la
// propuesta al cobro: lo hecho, lo que le toca, lo que llevamos nosotros y lo que
// «aún no toca». Antes, una obra sin expediente se abría en la calculadora de
// siempre y no enseñaba nada de esto.
//
// Tonos: `ok` (hecho) · `tu` (le toca a él) · `nos` (lo llevamos nosotros o se espera
// al cliente) · `luego` (aún no toca) · `info` (un sitio al que entrar: no cuenta).
// `accion` = la pantalla de la obra que abre la fila (null = no se abre).
const miles = (n) => `${String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')} €`;

/**
 * @param {object} o
 *   paso, quien            — de `pasoDeObra`
 *   conExpediente, esInstaladora
 *   presupuesto            — { importe, estimado }
 *   exp                    — el expediente en escalares (o null)
 *   est                    — `estadoInstalador(doc)` (o null)
 *   fac                    — { n, validadas } de sus facturas
 *   cobrado                — hay transferencia al cliente
 */
function caminoDeObra({ paso, quien, conExpediente, esInstaladora, presupuesto, exp = null, est = null, fac = null, cobrado = false, presupuestoApp = null }) {
    const e = exp || {};
    const cifo = est?.cifo || {};
    const rite = est?.rite || {};
    const f = fac || { n: 0, validadas: 0 };
    const filas = [];
    const pon = (key, nombre, estado, tono, accion = null) => filas.push({ key, nombre, estado, tono, accion });

    // 1 · La propuesta
    if (conExpediente || paso >= 3) pon('propuesta', 'La propuesta', 'Aceptada por tu cliente', 'ok', 'propuesta');
    else if (paso === 2 && quien === 'tu') pon('propuesta', 'La propuesta', 'Te la hemos mandado: pásasela a tu cliente', 'tu', 'propuesta');
    else if (paso === 2) pon('propuesta', 'La propuesta', 'Enviada · falta que tu cliente la acepte', 'nos', 'propuesta');
    else pon('propuesta', 'La propuesta', 'La estamos preparando nosotros', 'nos', 'propuesta');

    // 2 · Su presupuesto
    const imp = Number(presupuesto?.importe) > 0 ? miles(presupuesto.importe) : null;
    if (imp && !presupuesto.estimado) pon('presupuesto', 'Tu presupuesto', imp, 'ok', 'presupuesto');
    else if (imp) pon('presupuesto', 'Tu presupuesto', `${imp} · estimado: sube el tuyo`, 'tu', 'presupuesto');
    else pon('presupuesto', 'Tu presupuesto', 'Falta: súbelo cuando lo tengas', 'tu', 'presupuesto');
    // El que hizo EN LA APP y ligó a esta obra: se dice cuál (nº y total con IVA). Es
    // un añadido (`detalle`), no cambia el estado: el importe que manda es el del cálculo.
    if (presupuestoApp?.numero) {
        // A mano y no con toLocaleString: en «es-ES» 9200 sale «9200,00», sin el punto de miles.
        const [ent, dec] = Math.abs(Number(presupuestoApp.total) || 0).toFixed(2).split('.');
        const t = Number(presupuestoApp.total) > 0 ? ` · ${ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec} €` : '';
        filas[filas.length - 1].detalle = `Presupuesto ${presupuestoApp.numero}${t}`;
    }

    // 3 · El certificado energético de antes de la obra
    const iniOk = !!(e.fecha_reg_ini || e.seg_cee_ini === 'REGISTRADO');
    pon('cee_ini', 'Certificado energético inicial',
        !conExpediente ? 'Cuando tu cliente acepte' : iniOk ? 'Registrado' : 'Lo hacemos nosotros',
        !conExpediente ? 'luego' : iniOk ? 'ok' : 'nos');

    // 4 · La factura de la obra
    const toca = conExpediente && ceeInicialRegistrado(e);
    if (f.n) pon('factura', 'Tu factura', f.validadas === f.n ? (f.n === 1 ? 'Revisada' : `${f.n} revisadas`) : 'Subida · la estamos revisando', f.validadas === f.n ? 'ok' : 'nos', 'factura');
    else if (toca && esInstaladora) pon('factura', 'Tu factura', 'Todavía no está hecha', 'tu', 'factura');
    else if (toca) pon('factura', 'Factura de la obra', 'La hace la empresa que instala', 'nos');
    else pon('factura', 'Tu factura', 'Se hace al terminar la obra', 'luego');

    // 5 y 6 · Lo que firma y sube la empresa que INSTALA
    if (!conExpediente) {
        pon('cifo', 'Certificado de la instalación', 'Al terminar la obra', 'luego');
        pon('rite', 'Legalización RITE', 'Al terminar la obra', 'luego');
    } else if (esInstaladora) {
        const pideFirma = !!(cifo.borrador && (cifo.sentAt || cifo.refirma));
        pon('cifo', 'Certificado de la instalación',
            cifo.recibido ? 'Firmado' : cifo.bloqueado ? 'Lo estamos corrigiendo' : pideFirma ? 'Falta tu firma' : 'Lo preparamos nosotros',
            cifo.recibido ? 'ok' : (pideFirma && !cifo.bloqueado) ? 'tu' : 'nos', 'cifo');
        const pideRite = !!(rite.sentAt || cifo.sentAt);
        pon('rite', 'Legalización RITE',
            rite.recibido ? 'Recibida' : pideRite ? 'Falta que la subas' : 'Aún no toca',
            rite.recibido ? 'ok' : pideRite ? 'tu' : 'luego', 'rite');
    }

    // 7 · Las fotos (un sitio al que entrar: lo que falta lo dice su pantalla)
    pon('fotos', 'Fotos de la obra', 'Súbelas aquí y mira qué falta', 'info', 'docs');

    // 8 · El certificado energético de después
    const finOk = !!(e.fecha_reg_fin || e.seg_cee_fin === 'REGISTRADO');
    pon('cee_fin', 'Certificado energético final',
        !conExpediente ? 'Al terminar la obra' : finOk ? 'Registrado' : paso >= 4 ? 'Lo hacemos nosotros' : 'Al terminar la obra',
        !conExpediente ? 'luego' : finOk ? 'ok' : paso >= 4 ? 'nos' : 'luego');

    // 9 · El bono
    const pagado = cobrado || paso === 5;
    pon('bono', 'El bono de tu cliente', pagado ? 'Cobrado' : paso >= 4 ? 'Lo estamos tramitando' : 'Cuando esté todo presentado', pagado ? 'ok' : paso >= 4 ? 'nos' : 'luego');

    const cuentan = filas.filter(x => x.tono !== 'info');
    return { filas, listos: cuentan.filter(x => x.tono === 'ok').length, total: cuentan.length };
}

module.exports = {
    empresasEnBeta, enBetaInstalador, asistenteEncendido, PASOS, CAPTACION, caminoDeObra,
    obraHecha, ceeInicialRegistrado, tareasDeExpediente, esperaAlCliente, pasoDeObra,
    cuentasCliente, financialsDeLaObra,
};
