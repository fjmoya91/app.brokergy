/**
 * botContexto — de un número de teléfono a "qué le pasa a esta persona".
 *
 * El bot de WhatsApp no puede contestar "qué documentación hay que aportar"
 * en abstracto: lo que hace falta depende de la ficha (RES060/080/093/TER100),
 * de si la propuesta está aceptada, de si el CEE inicial está registrado, de si
 * la obra ya se ha hecho y de qué se ha subido ya. Este módulo reúne todo eso
 * en un DOSSIER, y el cerebro se limita a redactarlo.
 *
 * REGLA — aquí no se decide NADA que ya esté decidido en otro sitio. El "qué
 * falta" sale de `buildChecklistData` (el mismo barrido que ve el admin) y de
 * `v_expedientes_lifecycle`; los enlaces, de `ensureUploadLink`. Si el bot
 * calculara su propia versión de lo que falta, acabaría diciéndole al cliente
 * algo distinto de lo que dice la app, y la app es la que tiene razón.
 *
 * REGLA — el dossier NO lleva dinero. Ni bono, ni inversión, ni margen. Una
 * cifra dicha de más por una máquina es una cifra que el cliente da por
 * comprometida; de dinero se escala a una persona (ver `botCerebro`).
 */

const supabase = require('./supabaseClient');
const reformaUploadService = require('./reformaUploadService');
const botVinculos = require('./botVinculos');

// El barrido "qué falta" vive en la ruta de expedientes y está expuesto ahí
// para quien lo necesite sin pasar por HTTP (lo usa también el MCP). Se pide
// PEREZOSAMENTE: `routes/expedientes` arrastra medio backend, y cargarlo desde
// un servicio en tiempo de `require` monta un ciclo con lo que él mismo importa.
let _buildChecklistData = null;
const buildChecklistData = (...args) => {
    if (!_buildChecklistData) _buildChecklistData = require('../routes/expedientes').buildChecklistData;
    return _buildChecklistData(...args);
};

const FRONTEND = () => process.env.FRONTEND_URL || 'https://app.brokergy.es';

// ───────────────────────────────────────────────────────────────────────────
// ÍNDICE DE TELÉFONOS
// ---------------------------------------------------------------------------
// Los teléfonos están escritos a mano y de mil maneras ("+34 612 34 56 78",
// "612345678", "0034612345678"). Lo único comparable son los ÚLTIMOS 9 dígitos.
//
// Se trae la tabla entera y se indexa en memoria porque es diminuta (357
// clientes + 77 prescriptores, medido) y porque un `ilike '%...%'` sobre un
// teléfono formateado no casaría de todos modos. Caché corta: un cliente dado
// de alta hace un minuto tiene que poder escribir.
// ───────────────────────────────────────────────────────────────────────────

const INDICE_TTL_MS = 5 * 60 * 1000;
let indiceCache = null;
let indiceAt = 0;

/** Últimos 9 dígitos de un teléfono, o null si no hay suficientes. */
function last9(tlf) {
    const d = String(tlf || '').replace(/\D/g, '');
    return d.length >= 9 ? d.slice(-9) : null;
}

/** Añade `valor` al índice bajo la clave de cada teléfono que se le pase. */
function indexar(mapa, telefonos, valor) {
    for (const t of telefonos) {
        const k = last9(t);
        if (!k) continue;
        if (!mapa.has(k)) mapa.set(k, []);
        // Un mismo teléfono puede estar en varias columnas de la misma fila
        // (tlf y persona_contacto_tlf iguales): no se duplica la entrada.
        const ya = mapa.get(k).some(v => v.tipo === valor.tipo && v.id === valor.id);
        if (!ya) mapa.get(k).push(valor);
    }
}

async function construirIndice() {
    const mapa = new Map();

    const [{ data: clientes }, { data: partners }] = await Promise.all([
        supabase.from('clientes')
            .select('id_cliente, nombre_razon_social, apellidos, tlf, persona_contacto_tlf, persona_contacto_nombre'),
        supabase.from('prescriptores')
            // OJO: `prescriptores` NO tiene columna `telefono` — es `tlf`.
            .select('id_empresa, razon_social, acronimo, tlf, tlf_contacto, landing_telefono_contacto, contactos_notificacion'),
    ]);

    for (const c of clientes || []) {
        indexar(mapa, [c.tlf, c.persona_contacto_tlf], {
            tipo: 'cliente',
            id: c.id_cliente,
            nombre: [c.nombre_razon_social, c.apellidos].filter(Boolean).join(' ').trim() || null,
        });
    }
    for (const p of partners || []) {
        const extras = Array.isArray(p.contactos_notificacion)
            ? p.contactos_notificacion.map(c => c?.tlf).filter(Boolean)
            : [];
        indexar(mapa, [p.tlf, p.tlf_contacto, p.landing_telefono_contacto, ...extras], {
            tipo: 'instalador',
            id: p.id_empresa,
            nombre: p.razon_social || p.acronimo || null,
        });
    }
    return mapa;
}

async function getIndice({ force = false } = {}) {
    if (!force && indiceCache && Date.now() - indiceAt < INDICE_TTL_MS) return indiceCache;
    indiceCache = await construirIndice();
    indiceAt = Date.now();
    return indiceCache;
}

/** Invalida la caché del índice (alta de cliente, cambio de teléfono). */
function invalidarIndice() { indiceCache = null; }

/**
 * ¿Quién es este número? Puede devolver VARIOS: un instalador y un cliente
 * pueden compartir teléfono, y hay teléfonos repetidos entre clientes (medido:
 * uno figura en 5 fichas). La ambigüedad se resuelve más arriba preguntando,
 * nunca adivinando.
 */
async function quienEs(telefono) {
    const k = last9(telefono);
    if (!k) return [];
    const indice = await getIndice();
    return indice.get(k) || [];
}

// ───────────────────────────────────────────────────────────────────────────
// EXPEDIENTES Y OPORTUNIDADES DE ESA PERSONA
// ───────────────────────────────────────────────────────────────────────────

// Una oportunidad ya cerrada en rechazo no es un asunto vivo; una FINALIZADA
// tampoco tiene "siguiente paso" que contar.
const OPP_MUERTAS = new Set(['RECHAZADA']);

/**
 * Asuntos abiertos de un cliente: sus oportunidades y, si la aceptó, el
 * expediente que nació de ella.
 *
 * Nunca se piden `datos_calculo` ni `documentacion` enteros en un listado
 * (regla 22): `datos_calculo` llega a 5,3 MB y basta con el estado.
 */
async function asuntosDeCliente(clienteId) {
    const { data: opps } = await supabase
        .from('oportunidades')
        .select('id, id_oportunidad, referencia_cliente, ficha, created_at, datos_calculo->estado')
        .eq('cliente_id', clienteId)
        .order('created_at', { ascending: false })
        .limit(20);

    const { data: exps } = await supabase
        .from('expedientes')
        .select('id, numero_expediente, oportunidad_id, estado, created_at')
        .eq('cliente_id', clienteId)
        .order('created_at', { ascending: false })
        .limit(20);

    return juntar(opps, exps);
}

/**
 * Asuntos de un instalador. Un partner puede tener decenas: se traen los más
 * recientes y, si hay más de uno vivo, el bot pedirá de qué cliente se trata.
 */
async function asuntosDeInstalador(prescriptorId) {
    const { data: opps } = await supabase
        .from('oportunidades')
        .select('id, id_oportunidad, referencia_cliente, ficha, cliente_id, created_at, datos_calculo->estado')
        .or(`instalador_asociado_id.eq.${prescriptorId},prescriptor_id.eq.${prescriptorId}`)
        .order('created_at', { ascending: false })
        .limit(30);

    const ids = (opps || []).map(o => o.id);
    let exps = [];
    if (ids.length) {
        const { data } = await supabase
            .from('expedientes')
            .select('id, numero_expediente, oportunidad_id, estado, created_at')
            .in('oportunidad_id', ids);
        exps = data || [];
    }
    return juntar(opps, exps);
}

/** Cruza oportunidades con sus expedientes y descarta lo cerrado. */
function juntar(opps, exps) {
    const porOpp = new Map((exps || []).map(e => [e.oportunidad_id, e]));
    return (opps || [])
        .filter(o => !OPP_MUERTAS.has(String(o.estado || '').toUpperCase()))
        .map(o => ({
            oportunidad_id: o.id,
            id_oportunidad: o.id_oportunidad || null,
            referencia: o.referencia_cliente || null,
            ficha: o.ficha || null,
            estado_oportunidad: o.estado || null,
            expediente: porOpp.get(o.id) || null,
        }));
}

// ───────────────────────────────────────────────────────────────────────────
// EL DOSSIER
// ───────────────────────────────────────────────────────────────────────────

/**
 * Traduce el barrido interno a algo que se le pueda decir a un cliente.
 *
 * `traducir` cambia la etiqueta TÉCNICA por la de lenguaje de casa. El barrido
 * lo escribe un ingeniero para el admin ("Placa de la unidad interior /
 * DEPOSITO ACS") y con esos nombres casan el Anexo Fotográfico y el CIFO, así
 * que no se tocan; pero soltárselos tal cual a un propietario por WhatsApp es
 * pedirle algo que no sabe identificar. La tabla buena ya existe y es fuente
 * única (`LABEL_CLIENTE` en reformaUploadService, vía `labelCliente`).
 *
 * Se conserva `responsable` porque es la mitad de la respuesta: "falta la
 * factura" y "la factura la sube tu instalador" son mensajes muy distintos, y
 * pedirle al cliente algo que no le toca es la forma más rápida de perder su
 * confianza en lo que se le pide de verdad.
 */
function pendientesParaCliente(checklist, traducir = (k, l) => l) {
    const out = [];
    for (const g of checklist?.grupos || []) {
        // BROKERGY y CERTIFICADOR son cosa nuestra: se cuentan como "en marcha",
        // no como algo que el cliente tenga que hacer.
        if (g.responsable === 'BROKERGY' || g.responsable === 'CERTIFICADOR') continue;
        for (const i of g.items || []) {
            if (i.presente || i.subida) continue;
            if (i.waived || i.no_procede) continue;
            // Lo opcional no se le nombra: alarga el mensaje y hace parecer
            // obligatorio lo que no lo es.
            if (i.required === false) continue;
            // `datos_personales` lo completamos nosotros desde la ficha.
            if (i.key === 'datos_personales') continue;
            out.push({
                clave: i.key,
                que: traducir(i.key, i.label),
                fase: i.fase || null,                 // ANTES | DESPUES | null
                responsable: g.responsable === 'CUALQUIERA'
                    ? (i.fase === 'DESPUES' ? 'CLIENTE_O_INSTALADOR' : 'CLIENTE')
                    : g.responsable,
                bloqueado: i.bloqueado ? (i.nota || 'aún no se puede pedir') : null,
                detalle: i.detalle || null,
            });
        }
    }
    return out;
}

/**
 * Dossier de UN asunto concreto. Es lo que lee el cerebro.
 *
 * Dos ramas, porque son dos conversaciones distintas:
 *   · Sin expediente → la propuesta no está aceptada. Lo único que hay que
 *     contar es cómo aceptarla; hablarle de fotos de la caldera antes de eso
 *     es adelantarle trabajo que todavía no sirve para nada.
 *   · Con expediente → el trámite está vivo y hay un checklist real.
 */
async function dossierDeAsunto(asunto) {
    const base = {
        // `oportunidad_id` / `expediente_id` NO se le enseñan al asistente
        // (`redactarDossier` no los imprime): son para el log, que sin ellos no
        // permite abrir el expediente sobre el que se contestó.
        oportunidad_id: asunto.oportunidad_id || null,
        expediente_id: asunto.expediente?.id || null,
        // El número de la OPORTUNIDAD (26RES060_OP167). Es el que aparece en la
        // propuesta que se le mandó, así que es por el que pregunta antes de que
        // exista expediente. Sin él en el dossier, el bot no puede reconocer su
        // propio identificador y escala una pregunta que sabía contestar.
        id_oportunidad: asunto.id_oportunidad || null,
        ficha: asunto.ficha || null,
        referencia: asunto.referencia || null,
        numero_expediente: asunto.expediente?.numero_expediente || null,
        estado_oportunidad: asunto.estado_oportunidad || null,
    };

    // ── Rama A: todavía no hay expediente ──────────────────────────────────
    if (!asunto.expediente) {
        return {
            ...base,
            fase: 'SIN_ACEPTAR',
            enlaces: {
                aceptar_propuesta: `${FRONTEND()}/firma/${asunto.oportunidad_id}`,
            },
            siguiente_paso: 'Aceptar la propuesta. Hasta que no se acepta no se '
                + 'genera el número de expediente y no se puede iniciar el trámite.',
            pendientes: [],
        };
    }

    const exp = asunto.expediente;

    // Fila completa + cliente: `buildChecklistData` los necesita tal cual.
    // Es UN expediente, así que aquí sí se puede traer entero (regla 22 aplica
    // a los LISTADOS); aun así se dejan fuera los XML del CEE, que son megas.
    const { data: expRow } = await supabase
        .from('expedientes')
        .select('id, numero_expediente, oportunidad_id, cliente_id, estado, documentacion, instalacion, seguimiento')
        .eq('id', exp.id)
        .maybeSingle();
    if (!expRow) return { ...base, fase: 'DESCONOCIDA', pendientes: [], enlaces: {} };

    const [{ data: cli }, { data: opp }, { data: lc }] = await Promise.all([
        expRow.cliente_id
            ? supabase.from('clientes').select('*').eq('id_cliente', expRow.cliente_id).maybeSingle()
            : Promise.resolve({ data: null }),
        expRow.oportunidad_id
            ? supabase.from('oportunidades').select('id, ficha, datos_calculo').eq('id', expRow.oportunidad_id).maybeSingle()
            : Promise.resolve({ data: null }),
        supabase.from('v_expedientes_lifecycle')
            .select('estado_actual, dias_en_estado_actual, responsable_bloqueo')
            .eq('numero_expediente', expRow.numero_expediente)
            .maybeSingle(),
    ]);

    let checklist = null;
    try {
        checklist = await buildChecklistData(expRow, cli, opp);
    } catch (e) {
        console.warn('[bot/contexto] checklist:', e.message);
    }

    // Diccionario técnico → lenguaje de casa. Sale del MISMO checklist podado
    // que ve el cliente en su enlace de subida, así que el bot le nombra las
    // fotos exactamente igual que la pantalla a la que se le manda. Si falla,
    // se cae a las etiquetas técnicas: peor redactado, pero nunca en blanco.
    let traducir = (k, l) => l;
    if (opp) {
        try {
            const slots = await reformaUploadService.checklistForOportunidad({
                id: expRow.oportunidad_id, datos_calculo: opp.datos_calculo,
            });
            const mapa = new Map(slots.map(sl => [sl.key, sl.labelCliente || sl.label]));
            traducir = (k, l) => mapa.get(k) || l;
        } catch (e) {
            console.warn('[bot/contexto] labels de cliente:', e.message);
        }
    }

    // El enlace de subida es el MISMO que usan los avisos de la app
    // (/subir-docs/:uuid?token=). Nunca se fabrica una URL aquí: el token se
    // siembra de forma idempotente y una URL inventada es un enlace roto en
    // manos del cliente.
    let enlaceSubida = null;
    if (expRow.oportunidad_id) {
        try { enlaceSubida = await reformaUploadService.ensureUploadLink(expRow.oportunidad_id); }
        catch (e) { console.warn('[bot/contexto] ensureUploadLink:', e.message); }
    }

    const seg = expRow.seguimiento || {};
    const ceeIniRegistrado = String(seg.cee_inicial || '').toUpperCase() === 'REGISTRADO';

    return {
        ...base,
        fase: 'EN_TRAMITE',
        estado_expediente: lc?.estado_actual || expRow.estado || null,
        dias_en_estado: lc?.dias_en_estado_actual ?? null,
        // De quién es la pelota ahora mismo. Es lo que decide si la respuesta es
        // "te toca a ti" o "lo tenemos nosotros y no tienes que hacer nada".
        esperando_a: lc?.responsable_bloqueo || null,
        cee_inicial_registrado: ceeIniRegistrado,
        // Con el CEE inicial registrado ya se puede ejecutar y facturar la obra.
        // Es la pregunta más repetida después de "qué documentación", así que
        // viaja como dato y no como algo a deducir.
        obra_puede_ejecutarse: ceeIniRegistrado,
        // FASE ACTIVA. Igual que en el enlace de subida, las dos fases no se
        // mezclan: pedirle hoy la placa de la máquina nueva a quien todavía no
        // puede ni empezar la obra es darle una tarea imposible, y una lista
        // con tareas imposibles hace que deje de mirar la lista entera.
        fase_activa: ceeIniRegistrado ? 'DESPUES' : 'ANTES',
        pendientes: pendientesParaCliente(checklist, traducir),
        enlaces: {
            subir_documentacion: enlaceSubida,
            firmar_anexos: `${FRONTEND()}/firmar-anexos/${expRow.id}`,
            ver_mi_expediente: enlaceSubida
                ? enlaceSubida.replace('/subir-docs/', '/mi-expediente/')
                : null,
        },
    };
}

/**
 * El nombre de quien escribe, o null si las fichas no se ponen de acuerdo.
 * Se comparan normalizados para que "JUAN" y "Juan" no cuenten como dos.
 */
function nombreInequivoco(identidades) {
    const nombres = new Set(
        identidades.map(i => String(i.nombre || '').trim().toLowerCase()).filter(Boolean)
    );
    if (nombres.size !== 1) return null;
    return identidades.find(i => i.nombre)?.nombre || null;
}

/**
 * Punto de entrada: teléfono → todo lo que el bot puede saber de quien escribe.
 *
 * `ambiguo` es tan importante como el dossier: con dos asuntos vivos, contestar
 * por el primero es contestar por el equivocado la mitad de las veces. El
 * cerebro lo usa para preguntar de qué obra se trata en vez de acertar a ciegas.
 */
async function construirContexto(telefono) {
    const identidades = await quienEs(telefono);
    if (!identidades.length) {
        return { conocido: false, identidades: [], asuntos: [], ambiguo: false };
    }

    const asuntos = [];
    for (const ident of identidades) {
        const lista = ident.tipo === 'cliente'
            ? await asuntosDeCliente(ident.id)
            : await asuntosDeInstalador(ident.id);
        for (const a of lista) asuntos.push({ ...a, quien: ident });
    }

    // Dedupe: un instalador que además figura como cliente de su propia obra
    // traería el mismo asunto dos veces.
    const vistos = new Set();
    const unicos = asuntos.filter(a => {
        if (vistos.has(a.oportunidad_id)) return false;
        vistos.add(a.oportunidad_id);
        return true;
    });

    // Quien escribe: el tono y lo que se le puede pedir cambian. A un
    // instalador se le habla de facturas, RITE y CIFO; a un cliente, de
    // fotos y firmas.
    const rol = identidades.some(i => i.tipo === 'instalador') && !identidades.some(i => i.tipo === 'cliente')
        ? 'instalador'
        : (identidades.some(i => i.tipo === 'instalador') ? 'ambos' : 'cliente');

    // ── ¿De cuál de todas habla? ────────────────────────────────────────────
    // Con varios asuntos vivos se mira lo que ya sabemos de ese chat.
    //
    // REGLA — con un INSTALADOR no se adivina por "le escribimos desde esta
    // obra". Un instalador tiene decenas de obras vivas (medido: 38 en un mismo
    // chat) y que le hayamos mandado un aviso el martes no dice nada sobre por
    // cuál pregunta hoy. Se le pregunta, que es lo que haría cualquiera.
    // Sí valen las otras dos pistas: lo FIJADO a mano es una decisión tomada, y
    // lo que él mismo acaba de decir en esta conversación es la respuesta
    // literal a esa pregunta — volver a preguntársela sería insufrible.
    let elegido = null;
    if (unicos.length > 1) {
        elegido = await botVinculos.elegir(telefono, unicos.map(a => a.oportunidad_id), {
            permitirEnvio: rol === 'cliente',
        });
    }

    const candidatos = elegido
        ? unicos.filter(a => a.oportunidad_id === elegido.oportunidad_id)
        : unicos;

    // Solo se monta el dossier COMPLETO cuando queda UNO: cada dossier son
    // varias consultas más el barrido, y con 38 asuntos de un instalador eso es
    // una tormenta de consultas para acabar preguntando cuál es.
    const ambiguo = candidatos.length > 1;
    const dossieres = ambiguo
        ? candidatos.map(a => ({
            oportunidad_id: a.oportunidad_id,
            id_oportunidad: a.id_oportunidad,
            ficha: a.ficha,
            referencia: a.referencia,
            numero_expediente: a.expediente?.numero_expediente || null,
            estado_oportunidad: a.estado_oportunidad,
            fase: a.expediente ? 'EN_TRAMITE' : 'SIN_ACEPTAR',
        }))
        : await Promise.all(candidatos.map(dossierDeAsunto));

    return {
        conocido: true,
        identidades,
        rol,
        // El nombre SOLO si es inequívoco.
        //
        // Un teléfono puede figurar en muchas fichas: el de este cliente sale en
        // DIEZ (medido el 25/08/2026), porque es el contacto de varias obras y
        // de varias empresas. Coger el primero saludó a Fran como "Rafael", que
        // es un cliente distinto. Equivocarse de nombre es peor que no usar
        // ninguno: delata que no sabes con quién hablas, y en el segundo
        // mensaje ya nadie se cree lo que le cuentas del resto.
        nombre: nombreInequivoco(identidades),
        ambiguo,
        // De dónde salió la elección cuando había varias. Viaja al prompt para
        // que el bot lo DIGA ("sobre la obra de X…"): una suposición que no se
        // anuncia es una suposición que el cliente no puede corregir, y acaba
        // contestando por la obra equivocada sin que nadie se entere.
        elegidoPor: elegido?.motivo || null,
        // Los otros asuntos que había, para poder ofrecer el cambio.
        otrosAsuntos: elegido
            ? unicos.filter(a => a.oportunidad_id !== elegido.oportunidad_id)
                .map(a => ({ referencia: a.referencia, numero_expediente: a.expediente?.numero_expediente || null }))
            : [],
        asuntos: dossieres,
    };
}

module.exports = {
    construirContexto,
    quienEs,
    invalidarIndice,
    last9,
    // Expuestos para las pruebas y para el panel del bot.
    _dossierDeAsunto: dossierDeAsunto,
    _pendientesParaCliente: pendientesParaCliente,
};
