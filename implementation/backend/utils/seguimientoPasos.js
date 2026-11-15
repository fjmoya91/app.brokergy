// ============================================================================
// seguimientoPasos.js — CUÁNDO toca el siguiente mensaje del SEGUIMIENTO y cuál
// es (fuente única de la cadencia; puro, sin red ni BD).
//
// Fran (15/11/2026): «el objetivo es que no se quede nada pendiente». Dos
// seguimientos, cada uno con su escalera de toques en DÍAS HÁBILES (de lunes a
// viernes, sin los festivos nacionales) y siempre a media mañana (10:00 de
// Madrid): un recordatorio a las 7:00 o en domingo se lee como presión.
//
//   · PROPUESTA (simulación ENVIADA): «¿la has visto?» a los 2 días hábiles del
//     envío, «¿cómo lo ves?» a los 5 más y, a los 7 más sin respuesta, se le dice
//     que la dejamos aparcada y la oportunidad se CIERRA. Lo enviado hace más de
//     30 días y nunca seguido (el atrasado) empieza por un REPASO único y cierra a
//     los 7. Si dice que sí de palabra, PRE-ACEPTADO y se le recuerda el enlace de
//     aceptación (ACEPTAR, dos veces como mucho). Si lo deja para más adelante,
//     RETOMAR en la fecha que dé (o en 30 días).
//   · CEE_INICIAL (aceptada, CEE inicial sin encargar y sin el material): el
//     PEDIDO si nadie lo ha pedido, y luego R1 (+2), R2 (+3, con por qué importa),
//     R3 (+3, al OTRO lado: al instalador si se le pedía al cliente, o al revés),
//     R4 (+5) y, de ahí en adelante, un recordatorio corto cada 10 días hábiles con
//     aviso a Fran (FRAN), hasta `MAX_TOQUES_CEE`.
//
// REGLA — la cadencia vive AQUÍ, no en el prompt ni repartida por el servicio.
// ============================================================================

const { partesMadrid } = require('./horarioWhatsapp');

const num = (v, d) => { const n = Number(v); return Number.isFinite(n) && n >= 0 && v !== '' && v != null ? n : d; };
const HORA_TOQUE = () => num(process.env.SEGUIMIENTO_HORA, 10);
const DIAS_ATRASADA = () => num(process.env.SEGUIMIENTO_DIAS_ATRASADA, 30);
const MAX_TOQUES_CEE = () => num(process.env.SEGUIMIENTO_MAX_TOQUES_CEE, 8);
const MAX_ACEPTAR = 2;

/**
 * Fases y lo que viene después. `tras` = días hábiles desde el toque anterior (o desde
 * la base, para la primera). `cierra`: tras mandarla, el seguimiento se cierra.
 */
const PLAN = {
    PROPUESTA: {
        PRIMERO: { tras: 2, siguiente: 'SEGUNDO' },
        SEGUNDO: { tras: 5, siguiente: 'CIERRE' },
        CIERRE: { tras: 7, siguiente: null, cierra: true },
        REPASO: { tras: 0, siguiente: 'CIERRE' },
        ACEPTAR: { tras: 3, siguiente: 'ACEPTAR' },
        RETOMAR: { tras: 0, siguiente: 'CIERRE' },
        // Contestó, pero sin decir si sigue (y ya se le había preguntado dos veces): antes de
        // aparcarla, UNA pregunta directa. Un «no he sabido nada» a quien sí contestó es falso.
        PREGUNTA: { tras: 5, siguiente: 'CIERRE' },
    },
    CEE_INICIAL: {
        PEDIDO: { tras: 0, siguiente: 'R1' },
        R1: { tras: 2, siguiente: 'R2' },
        R2: { tras: 3, siguiente: 'R3' },
        R3: { tras: 3, siguiente: 'R4' },
        R4: { tras: 5, siguiente: 'FRAN' },
        FRAN: { tras: 10, siguiente: 'FRAN' },
    },
};

// Festivos NACIONALES (mes-día). Los autonómicos y locales no: un recordatorio el día de
// la Virgen de su pueblo es un mal menor; uno el 25 de diciembre, no.
const FESTIVOS = new Set(['01-01', '01-06', '05-01', '08-15', '10-12', '11-01', '12-06', '12-08', '12-25']);

/** Año, mes y día en Madrid. */
function ymdMadrid(d) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(d).map(x => [x.type, x.value]));
    return { y: Number(p.year), m: Number(p.month), d: Number(p.day) };
}

/** El instante de las `hora`:00 de Madrid de ese día (con su horario de verano o de invierno). */
function aLasMadrid({ y, m, d }, hora) {
    // Se parte de esa hora en UTC y se corrige por lo que Madrid marca en ese momento.
    let t = Date.UTC(y, m - 1, d, hora, 0, 0);
    for (let i = 0; i < 2; i++) {
        const h = partesMadrid(new Date(t)).h;
        t -= (h - hora) * 3_600_000;
    }
    return new Date(t);
}

const diaSemana = ({ y, m, d }) => new Date(Date.UTC(y, m - 1, d)).getUTCDay();   // 0 = domingo
const esHabil = (f) => {
    const ds = diaSemana(f);
    const md = `${String(f.m).padStart(2, '0')}-${String(f.d).padStart(2, '0')}`;
    return ds !== 0 && ds !== 6 && !FESTIVOS.has(md);
};
const masUnDia = ({ y, m, d }) => ymdMadrid(new Date(Date.UTC(y, m - 1, d, 12) + 86_400_000));

/**
 * `n` días hábiles después de `desde`, a la hora del toque. Con n = 0, el mismo día si
 * es hábil y aún no ha pasado la hora; si no, el siguiente hábil. Puro.
 */
function habilesDespues(desde, n, hora = HORA_TOQUE()) {
    const base = desde instanceof Date ? desde : new Date(desde);
    let f = ymdMadrid(base);
    if (n <= 0) {
        if (esHabil(f) && aLasMadrid(f, hora) >= base) return aLasMadrid(f, hora);
        f = masUnDia(f);
        while (!esHabil(f)) f = masUnDia(f);
        return aLasMadrid(f, hora);
    }
    let quedan = n;
    while (quedan > 0) {
        f = masUnDia(f);
        if (esHabil(f)) quedan -= 1;
    }
    return aLasMadrid(f, hora);
}

/** ¿Es atrasada? (enviada hace más de `DIAS_ATRASADA` días, o sin fecha). */
const esAtrasada = (baseAt, ahora = new Date()) => !baseAt
    || (ahora.getTime() - Date.parse(baseAt)) > DIAS_ATRASADA() * 86_400_000;

/**
 * La PRIMERA fase de un seguimiento que nace y cuándo toca. Puro.
 * @param {'PROPUESTA'|'CEE_INICIAL'} tipo
 * @param {{ baseAt?: string|null, preAceptado?: boolean, pedidoAt?: string|null, creadoAt?: string|null }} o
 */
function primerPaso(tipo, { baseAt = null, preAceptado = false, pedidoAt = null, creadoAt = null } = {}, ahora = new Date()) {
    if (tipo === 'PROPUESTA') {
        if (preAceptado) return { fase: 'ACEPTAR', proximo: habilesDespues(baseAt && !esAtrasada(baseAt, ahora) ? new Date(baseAt) : ahora, PLAN.PROPUESTA.ACEPTAR.tras) };
        if (esAtrasada(baseAt, ahora)) return { fase: 'REPASO', proximo: habilesDespues(ahora, 0) };
        // Si a la base + 2 ya ha pasado (se enciende con propuestas de hace días), mañana mismo.
        const p = habilesDespues(new Date(baseAt), PLAN.PROPUESTA.PRIMERO.tras);
        return { fase: 'PRIMERO', proximo: p < ahora ? habilesDespues(ahora, 0) : p };
    }
    // CEE_INICIAL: si ya se le pidió (el agente de la aceptación), el primero es un recordatorio.
    if (pedidoAt) {
        const p = habilesDespues(new Date(pedidoAt), PLAN.CEE_INICIAL.R1.tras);
        return { fase: 'R1', proximo: p < ahora ? habilesDespues(ahora, 0) : p };
    }
    // Recién aceptada: se le deja un día hábil al agente de la aceptación, que lo está mirando.
    const c = creadoAt ? new Date(creadoAt) : ahora;
    const p = habilesDespues(c, 1);
    return { fase: 'PEDIDO', proximo: p < ahora ? habilesDespues(ahora, 0) : p };
}

/**
 * Lo que viene tras MANDAR la fase `fase`. Puro.
 * @returns {{ fase: string|null, proximo: Date|null, cierra: boolean }}
 */
function trasToque(tipo, fase, { toques = 0, ahora = new Date() } = {}) {
    const plan = PLAN[tipo] || {};
    const f = plan[fase];
    if (!f) return { fase: null, proximo: null, cierra: true };
    if (f.cierra) return { fase: null, proximo: null, cierra: true };
    // ACEPTAR, dos veces como mucho: después el cierre normal.
    if (tipo === 'PROPUESTA' && fase === 'ACEPTAR' && toques + 1 >= MAX_ACEPTAR) {
        return { fase: 'CIERRE', proximo: habilesDespues(ahora, PLAN.PROPUESTA.CIERRE.tras), cierra: false };
    }
    if (tipo === 'CEE_INICIAL' && toques + 1 >= MAX_TOQUES_CEE()) {
        // Agotado: deja de escribir; sigue abierto para que Fran lo vea en el resumen.
        return { fase: 'AGOTADO', proximo: null, cierra: false };
    }
    const sig = f.siguiente;
    return { fase: sig, proximo: habilesDespues(ahora, plan[sig].tras), cierra: false };
}

// Lo que el contestador saca de la respuesta a un seguimiento de propuesta.
const RESULTADOS = new Set(['SIGUE', 'NO_SIGUE', 'PENSANDO', 'MAS_ADELANTE']);

/**
 * Qué se hace con lo que ha contestado a un seguimiento de PROPUESTA. Puro.
 * @param {{ resultado: string, cuando?: string|null }} r   `cuando`: AAAA-MM-DD
 * @returns {{ estado: 'ABIERTO'|'CERRADO', fase: string|null, proximo: Date|null,
 *             resultado: string, oportunidad: 'PRE-ACEPTADO'|'RECHAZADA'|null }}
 */
function trasRespuestaPropuesta(r, { ahora = new Date() } = {}) {
    const res = String(r?.resultado || '').toUpperCase();
    if (res === 'SIGUE') return { estado: 'ABIERTO', fase: 'ACEPTAR', proximo: habilesDespues(ahora, PLAN.PROPUESTA.ACEPTAR.tras), resultado: 'SIGUE', oportunidad: 'PRE-ACEPTADO', toques: 0 };
    if (res === 'NO_SIGUE') return { estado: 'CERRADO', fase: null, proximo: null, resultado: 'NO_SIGUE', oportunidad: 'RECHAZADA' };
    if (res === 'MAS_ADELANTE') {
        const f = /^\d{4}-\d{2}-\d{2}$/.test(String(r?.cuando || '')) ? new Date(`${r.cuando}T05:00:00Z`) : null;
        const cuando = f && f > ahora ? habilesDespues(f, 0) : habilesDespues(new Date(ahora.getTime() + 30 * 86_400_000), 0);
        return { estado: 'ABIERTO', fase: 'RETOMAR', proximo: cuando, resultado: 'MAS_ADELANTE', oportunidad: null };
    }
    // PENSANDO (o una duda ya contestada): sin presión, un «¿cómo lo ves?» a los 5 días hábiles.
    return { estado: 'ABIERTO', fase: 'SEGUNDO', proximo: habilesDespues(ahora, PLAN.PROPUESTA.SEGUNDO.tras), resultado: 'PENSANDO', oportunidad: null };
}

/**
 * Contestó y nadie sacó un resultado (contestador apagado, o no lo tenía claro): la
 * escalera SIGUE, con un respiro. Puro.
 */
function trasRespuestaSinResultado(tipo, fase, { ahora = new Date() } = {}) {
    if (tipo === 'PROPUESTA') {
        const sig = ['PRIMERO', 'REPASO', 'RETOMAR'].includes(fase) ? 'SEGUNDO' : fase === 'ACEPTAR' ? 'ACEPTAR' : 'PREGUNTA';
        return { fase: sig, proximo: habilesDespues(ahora, PLAN.PROPUESTA[sig].tras || 5) };
    }
    // CEE: lo que ha mandado lo mira el agente de la aceptación; el recordatorio, en 3 días hábiles.
    return { fase: fase === 'PEDIDO' ? 'R1' : fase, proximo: habilesDespues(ahora, 3) };
}

module.exports = {
    PLAN, RESULTADOS, FESTIVOS, MAX_ACEPTAR, MAX_TOQUES_CEE, HORA_TOQUE, DIAS_ATRASADA,
    habilesDespues, esAtrasada, primerPaso, trasToque, trasRespuestaPropuesta, trasRespuestaSinResultado,
    ymdMadrid, aLasMadrid, esHabil,
};
