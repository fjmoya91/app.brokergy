// ============================================================================
// ceeIa.js — la COLA de CEE que se generan con IA (agente por la API de Claude).
//
// El botón CE3X (calculadora y módulo CEE) pregunta cómo hacer el CEE inicial:
// con IA o a mano en la envolvente. La app no lo genera ella: el agente
// necesita el motor, CE3X 3.2 y la llave de la API, y eso está en el PC. Así
// que aquí se APUNTA el encargo (`cee_ia_trabajos`) y el vigilante del PC
// (`tools/banco-cee-api/banco.mjs atender`) lo toma, corre el agente —que
// escribe el .cex, el XML, el PDF y avisa al equipo como siempre— y va dejando
// aquí su progreso y su coste.
//
// REGLAS (ver «Generar el CEE con IA desde el botón CE3X» en docs/conocimiento/cee-generacion):
//   · Un CEE tiene como mucho UN trabajo vivo por fase (índice único parcial).
//   · «Ya lo ha hecho la IA» lo dice el SELLO del `.cex` (`cex_sello.inicial`
//     con `autor = 'skill generar-cee-inicial'`), el mismo que lee la ventana:
//     si después alguien lo regeneró desde la envolvente, el `.cex` ya no es
//     el de la IA y deja de decirse.
//   · Pedirlo otra vez cuando ya está hecho es una decisión: se pide `rehacer`.
//   · Una oportunidad ya ACEPTADA no se pide: su CEE vive en el expediente.
//   · Solo la fase INICIAL (la skill que corre el agente es generar-cee-inicial).
//   · POR DÓNDE (24/10/2026): por defecto lo hace el Claude del WhatsApp con la
//     SUSCRIPCIÓN de Fran (la misma skill; 0 $ de la API). `CEE_IA_VIA=api`
//     vuelve a la cola del PC, que corre el agente por la API (~1,2–4 $ por CEE).
// ============================================================================

const supabase = require('./supabaseClient');

const AUTOR_IA = 'skill generar-cee-inicial';
const VIVOS = ['EN_COLA', 'EN_CURSO'];
//: El vigilante late cada ~30 s; sin latido en 2 min se da por apagado.
const VIGILANTE_VIVO_MS = 2 * 60_000;
//: Un trabajo EN_CURSO sin latido en 10 min: el PC se ha parado a medias.
const ATASCADO_MS = 10 * 60_000;
const via = () => (process.env.CEE_IA_VIA === 'api' ? 'api' : 'whatsapp');
//: Quien lo hace cuando va por la suscripción: es el `equipo` del trabajo.
const EQUIPO_WA = 'Claude del WhatsApp';
//: El Claude del WhatsApp no late: su encargo se da por perdido si en 3 h no
//: ha aparecido el `.cex` de la IA (su tope por trabajo es de 2 h).
const PLAZO_WA_MS = 3 * 3600_000;
const esDeWhatsapp = (t) => t?.equipo === EQUIPO_WA;
const COLUMNAS = 'id, negocio, ref_id, clave, fase, estado, modelo, esfuerzo, tope_usd, rehacer, pedido_por, '
    + 'pedido_at, tomado_at, equipo, latido_at, terminado_at, cancelar, cancelado_por, progreso, resultado, error';

const esUuid = (v) => /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(String(v || ''));
const NEGOCIOS = ['cae', 'cee', 'op'];

function fallo(status, error, extra = {}) {
    return Object.assign(new Error(error), { status, extra });
}

// ─── Lo que se decide (puro: lo prueba test_cee_ia.js) ───────────────────────

/**
 * ¿El `.cex` inicial que hay es el de la IA, y lleva PDF?
 * @param {object|null} sello  `cex_sello.inicial`
 * @param {object|null} ag     `agente_ia.inicial` (solo CAE y CEE directos)
 */
function generadoPorIa(sello, ag = null) {
    const deIa = sello?.autor === AUTOR_IA;
    if (!deIa) return { hecho: false };
    const cal = sello.calificacion || null;
    return {
        hecho: true,
        at: sello.at || ag?.terminado_at || null,
        pdf: !sello.por_calificar && !!cal,
        por_calificar: !!sello.por_calificar,
        calificacion: cal ? {
            emisiones: cal.emisiones ?? null, emisiones_letra: cal.emisiones_letra || null,
            epnr: cal.epnr ?? null, epnr_letra: cal.epnr_letra || null,
        } : null,
        medidas: (sello.medidas || []).map(m => m?.nombre).filter(Boolean),
        fichero: ag?.fichero || sello.nombre || null,
        fichero_link: ag?.fichero_link || null,
        carpeta_link: ag?.carpeta_link || null,
        avisos: Array.isArray(ag?.avisos) ? ag.avisos.length : 0,
    };
}

/** El vigilante del PC: ¿está atendiendo? */
function estadoVigilante(fila, ahora = Date.now()) {
    if (!fila) return { vivo: false, visto_at: null, equipo: null, listo: false, motivo: 'Nunca se ha encendido en ningún PC.' };
    const vivo = ahora - new Date(fila.visto_at).getTime() < VIGILANTE_VIVO_MS;
    return { vivo, visto_at: fila.visto_at, equipo: fila.equipo, listo: vivo && fila.listo !== false,
             motivo: !vivo ? 'El PC que atiende la cola no da señales.' : (fila.listo === false ? (fila.motivo || 'No está listo.') : null) };
}

/** Un trabajo EN_CURSO cuyo PC ha dejado de latir. */
function atascado(t, ahora = Date.now()) {
    if (!t || t.estado !== 'EN_CURSO') return false;
    if (esDeWhatsapp(t)) return ahora - new Date(t.tomado_at || t.pedido_at).getTime() > PLAZO_WA_MS;
    const ultimo = new Date(t.latido_at || t.tomado_at || t.pedido_at).getTime();
    return ahora - ultimo > ATASCADO_MS;
}

// ─── Lectura (solo escalares por JSON path, regla 22) ────────────────────────

/**
 * La fila del CEE, con lo justo. `id` vale el uuid o la clave legible.
 * Una oportunidad ACEPTADA devuelve `expediente` (su CEE vive allí).
 */
async function filaDe(negocio, id) {
    if (!NEGOCIOS.includes(negocio)) throw fallo(400, 'Negocio desconocido.');
    if (negocio === 'op') {
        const { data, error } = await supabase.from('oportunidades')
            .select('id, id_oportunidad, sello:datos_calculo->envolvente_cee->cex_sello->inicial')
            .eq(esUuid(id) ? 'id' : 'id_oportunidad', id).maybeSingle();
        if (error) throw fallo(503, 'No se puede leer la oportunidad ahora mismo.');
        if (!data) throw fallo(404, 'No encuentro esa oportunidad.');
        const { data: exp } = await supabase.from('expedientes')
            .select('id, numero_expediente').eq('oportunidad_id', data.id).maybeSingle();
        return { negocio, ref_id: data.id, clave: data.id_oportunidad, sello: data.sello || null, ag: null,
                 subestado: null, expediente: exp || null };
    }
    const tabla = negocio === 'cee' ? 'cee_directos' : 'expedientes';
    const { data, error } = await supabase.from(tabla)
        .select('id, numero_expediente, sub:seguimiento->>cee_inicial, '
                + 'sello:cee->cex_sello->inicial, ag:cee->agente_ia->inicial')
        .eq(esUuid(id) ? 'id' : 'numero_expediente', id).maybeSingle();
    if (error) throw fallo(503, 'No se puede leer el expediente ahora mismo.');
    if (!data) throw fallo(404, 'No encuentro ese expediente.');
    return { negocio, ref_id: data.id, clave: data.numero_expediente, sello: data.sello || null,
             ag: data.ag || null, subestado: data.sub ? String(data.sub).toUpperCase() : null, expediente: null };
}

async function ultimoTrabajo(negocio, refId, fase = 'inicial') {
    const { data, error } = await supabase.from('cee_ia_trabajos').select(COLUMNAS)
        .eq('negocio', negocio).eq('ref_id', refId).eq('fase', fase)
        .order('pedido_at', { ascending: false }).limit(1);
    if (error) throw fallo(503, 'No se puede leer la cola de la IA ahora mismo.');
    return data?.[0] || null;
}

async function vigilante() {
    if (via() === 'whatsapp') {
        const a = await require('./asistenteCanal').estadoAsistente();
        return { via: 'whatsapp', vivo: a.conectado, listo: a.conectado, equipo: EQUIPO_WA,
                 visto_at: a.conectado ? new Date().toISOString() : null, trabajando: !!a.trabajando,
                 motivo: a.conectado ? null : (a.motivo || 'El Claude del WhatsApp no responde.') };
    }
    const { data, error } = await supabase.from('cee_ia_vigilantes').select('*')
        .order('visto_at', { ascending: false }).limit(1);
    if (error) throw fallo(503, 'No se puede leer el estado del PC ahora mismo.');
    return estadoVigilante(data?.[0] || null);
}

/** Todo lo que necesita el botón CE3X para decidir qué enseñar. */
async function estado(negocio, id) {
    const f = await filaDe(negocio, id);
    let [trabajo, vig] = await Promise.all([ultimoTrabajo(f.negocio, f.ref_id), vigilante()]);
    const ia = generadoPorIa(f.sello, f.ag);
    trabajo = await cerrarSiYaEsta(trabajo, ia);
    return {
        negocio: f.negocio, ref_id: f.ref_id, clave: f.clave,
        via: via(),
        expediente: f.expediente,
        subestado: f.subestado,
        ia,
        trabajo: trabajo ? { ...trabajo, atascado: atascado(trabajo) } : null,
        vigilante: vig,
    };
}

/**
 * El Claude del WhatsApp no escribe en esta tabla: su encargo se da por HECHO
 * cuando aparece un `.cex` de la IA posterior a la petición (el sello).
 */
async function cerrarSiYaEsta(t, ia) {
    if (!esDeWhatsapp(t) || t.estado !== 'EN_CURSO' || !ia.hecho || !ia.at) return t;
    if (new Date(ia.at).getTime() < new Date(t.pedido_at).getTime()) return t;
    const { data } = await supabase.from('cee_ia_trabajos')
        .update({ estado: 'HECHO', terminado_at: ia.at, resultado: { via: 'whatsapp' } })
        .eq('id', t.id).eq('estado', 'EN_CURSO').select(COLUMNAS);
    return data?.[0] || t;
}

/** El texto del encargo: lo compone el SERVIDOR, el mismo que el del asistente de la app. */
function textoEncargo({ clave, usuario, rehacer }) {
    const { TAREAS } = require('./asistenteApp');
    return [
        `Encargo desde el BOTÓN CE3X de la app («Generar con IA»): lo pide ${usuario || 'alguien del equipo'}.`,
        TAREAS.cee_inicial.instruccion(clave),
        rehacer ? 'Ya había un CEE inicial hecho por la IA y se pide REHACERLO: el anterior va a OLD.' : '',
        'Al acabar, cuéntalo por aquí. Lo dudoso se pregunta, y nada sale a terceros sin el «sí» de Fran.',
    ].filter(Boolean).join(' ');
}

// ─── Escritura ───────────────────────────────────────────────────────────────

/**
 * Apunta el encargo. 409 si ya hay uno vivo (`EN_MARCHA`), si la IA ya lo hizo
 * y no se pide `rehacer` (`YA_GENERADO`) o si es una oportunidad aceptada.
 */
async function pedir({ negocio, id, usuario, rehacer = false, fase = 'inicial' }) {
    if (fase !== 'inicial') throw fallo(400, 'Con IA solo se genera el CEE INICIAL.');
    const f = await filaDe(negocio, id);
    if (f.expediente) {
        throw fallo(409, `Esta oportunidad ya es el expediente ${f.expediente.numero_expediente}: pídelo desde su módulo CEE.`,
                    { code: 'ACEPTADA', expediente: f.expediente });
    }
    if (f.subestado === 'REGISTRADO') {
        throw fallo(409, 'El CEE inicial ya está REGISTRADO: no se vuelve a generar.', { code: 'REGISTRADO' });
    }
    const vivo = await ultimoTrabajo(f.negocio, f.ref_id);
    if (vivo && VIVOS.includes(vivo.estado) && !atascado(vivo)) {
        throw fallo(409, 'Ya hay una generación con IA en marcha para este CEE.', { code: 'EN_MARCHA', trabajo: vivo });
    }
    const ia = generadoPorIa(f.sello, f.ag);
    if (ia.hecho && !rehacer) {
        throw fallo(409, 'Este CEE ya lo ha generado la IA. Para hacerlo otra vez, pide «rehacer».', { code: 'YA_GENERADO', ia });
    }
    // Un trabajo atascado (el PC se paró a medias) deja sitio al nuevo.
    if (vivo && atascado(vivo)) {
        await supabase.from('cee_ia_trabajos').update({
            estado: 'ERROR', terminado_at: new Date().toISOString(),
            error: esDeWhatsapp(vivo) ? 'En 3 h no apareció el .cex de la IA: se ha vuelto a pedir.'
                : 'El PC dejó de dar señales a medias: se ha vuelto a pedir.',
        }).eq('id', vivo.id).eq('estado', 'EN_CURSO');
    }
    const porWhatsapp = via() === 'whatsapp';
    const ahora = new Date().toISOString();
    // Por la suscripción la fila se apunta ya EN_CURSO: la toma el Claude del
    // WhatsApp, no el PC. Va ANTES del encargo para que el índice único impida
    // pedirlo dos veces.
    const { data, error } = await supabase.from('cee_ia_trabajos').insert({
        negocio: f.negocio, ref_id: f.ref_id, clave: f.clave, fase,
        rehacer: !!(ia.hecho && rehacer), pedido_por: usuario || null,
        ...(porWhatsapp ? { estado: 'EN_CURSO', equipo: EQUIPO_WA, tomado_at: ahora, latido_at: ahora, tope_usd: 0,
                            progreso: { via: 'whatsapp' } } : {}),
    }).select(COLUMNAS).single();
    if (error) {
        if (error.code === '23505') throw fallo(409, 'Ya hay una generación con IA en marcha para este CEE.', { code: 'EN_MARCHA' });
        throw fallo(503, 'No se ha podido apuntar el encargo ahora mismo.');
    }
    if (!porWhatsapp) return data;
    const r = await require('./asistenteCanal').pedirTarea({
        texto: textoEncargo({ clave: f.clave, usuario, rehacer: data.rehacer }),
        clave: `ce3x:${f.clave}:cee_inicial`,
        acuse: `Me pongo con el CEE inicial de ${f.clave} (me lo han pedido con el botón CE3X de la app). Te aviso cuando esté listo.`,
    });
    if (!r.ok) {
        await supabase.from('cee_ia_trabajos')
            .update({ estado: 'ERROR', terminado_at: new Date().toISOString(), error: r.motivo })
            .eq('id', data.id);
        throw fallo(503, `No se ha podido encargar al Claude del WhatsApp: ${r.motivo}`);
    }
    return data;
}

/** En cola se retira; en curso se le pide al PC que pare el agente. */
async function cancelar(trabajoId, usuario) {
    if (!esUuid(trabajoId)) throw fallo(400, 'Trabajo desconocido.');
    const { data: t, error } = await supabase.from('cee_ia_trabajos').select(COLUMNAS).eq('id', trabajoId).maybeSingle();
    if (error) throw fallo(503, 'No se puede leer la cola de la IA ahora mismo.');
    if (!t) throw fallo(404, 'No encuentro ese trabajo.');
    // Al Claude del WhatsApp no se le para desde aquí: se retira de la app (deja pedirlo otra vez).
    if (esDeWhatsapp(t) && t.estado === 'EN_CURSO') {
        const { data } = await supabase.from('cee_ia_trabajos')
            .update({ estado: 'CANCELADO', cancelado_por: usuario || null, terminado_at: new Date().toISOString(),
                      error: 'Retirado de la app. Si el Claude del WhatsApp ya había empezado, termina igual: para pararlo, díselo por el chat.' })
            .eq('id', t.id).eq('estado', 'EN_CURSO').select(COLUMNAS);
        return data?.[0] || t;
    }
    if (t.estado === 'EN_COLA') {
        const { data } = await supabase.from('cee_ia_trabajos')
            .update({ estado: 'CANCELADO', cancelado_por: usuario || null, terminado_at: new Date().toISOString() })
            .eq('id', t.id).eq('estado', 'EN_COLA').select(COLUMNAS);
        if (data?.[0]) return data[0];
        // Lo acaba de tomar el PC: se le pide que pare.
    }
    if (['EN_COLA', 'EN_CURSO'].includes(t.estado)) {
        const { data } = await supabase.from('cee_ia_trabajos')
            .update({ cancelar: true, cancelado_por: usuario || null })
            .eq('id', t.id).select(COLUMNAS);
        return data?.[0] || t;
    }
    throw fallo(409, 'Ese trabajo ya ha terminado.');
}

module.exports = {
    estado, pedir, cancelar, filaDe, vigilante,
    // puros (pruebas)
    generadoPorIa, estadoVigilante, atascado, textoEncargo, AUTOR_IA, VIGILANTE_VIVO_MS, ATASCADO_MS, COLUMNAS,
    EQUIPO_WA, PLAZO_WA_MS,
};
