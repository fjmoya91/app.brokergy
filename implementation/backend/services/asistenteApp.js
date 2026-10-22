// ─── El ASISTENTE DENTRO DE LA APP ────────────────────────────────────────────
//
// El botón flotante de la app abre un chat que contesta sobre la cartera con datos
// EN VIVO y enlaza al expediente, la oportunidad o el CEE de los que habla.
//
// Va por la API de Anthropic (ANTHROPIC_API_KEY, pago por uso), NO por el token de
// la suscripción de Fran que usa el Claude del WhatsApp (contenedor «asistente»):
//   - un popup tiene que contestar en segundos; `claude -p` tarda de 20 s a minutos;
//   - aquí el modelo SOLO puede llamar a las herramientas de abajo, que LEEN; el del
//     WhatsApp corre como root con todos los permisos y no se abre a una página web;
//   - la suscripción es personal; la API vale para cualquiera del equipo.
//
// Lo PESADO (generar un CEE, revisarlo, justificar o auditar un expediente…) no lo
// hace: lo PROPONE (una línea `>> ENCARGO …`, ver `leerMarcas`), a la persona le
// sale un botón «Encargar», y
// solo si lo pulsa se le pasa al Claude del WhatsApp por `asistenteCanal.pedirTarea`
// —el mismo camino que la pizarra de la envolvente—, que trabaja con la suscripción
// de Fran y contesta por el grupo «BROKERGY - CHAT».
//
// El historial lo guarda el navegador y llega en cada pregunta SOLO como texto:
// nada de bloques de herramientas ni de razonamiento entre una pregunta y otra.

const fs = require('fs');
const path = require('path');
const AnthropicMod = require('@anthropic-ai/sdk');
const supabase = require('./supabaseClient');
const radar = require('./seguimientoRadar');
const { materialCee } = require('../utils/materialCee');

const Anthropic = AnthropicMod.default || AnthropicMod;

const MODELO = process.env.ASISTENTE_APP_MODELO || 'claude-opus-5-5';
// Chat con herramientas: con esfuerzo bajo contesta antes y gasta menos. Se sube
// con ASISTENTE_APP_ESFUERZO si las respuestas se quedan cortas.
const ESFUERZO = process.env.ASISTENTE_APP_ESFUERZO || 'low';
const MAX_VUELTAS = 8;              // llamadas al modelo por pregunta (cada herramienta, una vuelta)
const MAX_MENSAJES = 30;            // historial que se admite del navegador
const MAX_CHARS_MENSAJE = 8000;
const MAX_CHARS_RESULTADO = 40_000; // lo que devuelve una herramienta al modelo
const DIR_CONSUMO = path.join(__dirname, '..', 'scratch', 'asistente-app');
// El manual es docs/conocimiento. En el VPS el backend se construye desde
// ./implementation y no lo tiene: va montado de solo lectura (CONOCIMIENTO_DIR).
const DIR_MANUAL = process.env.CONOCIMIENTO_DIR || path.join(__dirname, '..', '..', '..', 'docs', 'conocimiento');

// $ por millón de tokens: entrada, salida, lectura de caché. Solo para el «≈ x $» del
// pie de cada respuesta; la factura de verdad es la de la consola de Anthropic.
const PRECIOS = {
    'claude-opus-5-5': [4, 20, 0.20],
    'claude-sonnet-5-5': [2, 10, 0.20],
    'claude-haiku-5-5': [0.10, 0.50, 0.01],
};

let cliente = null;
function anthropic() {
    if (!process.env.ANTHROPIC_API_KEY) return null;
    if (!cliente) cliente = new Anthropic({ maxRetries: 2, timeout: 120_000 });
    return cliente;
}

// ─── Utilidades ───────────────────────────────────────────────────────────────
const sinTildes = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const recortar = (s, n) => { const t = String(s ?? ''); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
// «26res060 208», «26RES060-208» → «26RES060208» / «26RES060_208». El modelo ya los
// normaliza al llamar; esto solo quita lo que estorba.
const normNumero = (s) => String(s || '').trim().toUpperCase().replace(/\s+/g, '').replace(/-/g, '_');

const enlaceExpediente = (id, numero) => `[${numero}](?exp=${id})`;
const enlaceOportunidad = (idOp) => `[${idOp}](?op=${encodeURIComponent(idOp)})`;
const enlaceCee = (id, numero) => `[${numero}](?cee=${id})`;

function nombreCliente(c) {
    if (!c) return null;
    return [c.nombre_razon_social, c.apellidos].filter(Boolean).join(' ').trim() || null;
}

async function clientesPorId(ids) {
    const unicos = [...new Set(ids.filter(Boolean))];
    if (!unicos.length) return new Map();
    const { data, error } = await supabase.from('clientes')
        .select('id_cliente, nombre_razon_social, apellidos, municipio').in('id_cliente', unicos.slice(0, 100));
    if (error) throw new Error(error.message);
    return new Map((data || []).map(c => [c.id_cliente, c]));
}

// Un comodín por cada vocal y cada «n»: `ilike` distingue tildes («SÁNCHEZ» no casa
// con «sanchez»), así que se busca «s_nch_z» y luego se afina en memoria sin tildes.
const comodin = (palabra) => palabra.replace(/[aeioun]/g, '_');

// ─── El radar del parte (una lectura por minuto como mucho) ───────────────────
let cacheRadar = { t: 0, filas: null, promesa: null };
async function filasRadar() {
    if (cacheRadar.filas && Date.now() - cacheRadar.t < 60_000) return cacheRadar.filas;
    if (cacheRadar.promesa) return cacheRadar.promesa;
    cacheRadar.promesa = radar.escanear()
        .then(filas => { cacheRadar = { t: Date.now(), filas, promesa: null }; return filas; })
        .catch(e => { cacheRadar.promesa = null; throw e; });
    return cacheRadar.promesa;
}

const filaRadar = (f) => ({
    numero: f.numero_expediente,
    cliente: f.cliente_nombre || null,
    detalle: recortar(f.detalle, 220),
    dias: f.dias,
    vencida: !!f.vencida,
    accion: f.accion?.label || null,
    ...(f.material ? { material_cee: { listo: f.material.listo, faltan: f.material.faltan } } : {}),
    enlace: enlaceExpediente(f.expediente_id, f.numero_expediente),
});

// ¿Hay con qué levantar el CEE inicial? El MISMO criterio que el parte y la petición al
// cliente (utils/materialCee.js): vídeo de la vivienda o fachada (+ patios), y la
// caldera con su placa salvo que la vivienda no tenga calefacción.
function materialParaElCee(uploads, calderaAntigua) {
    const m = materialCee(uploads || {}, { caldera_antigua_cal: calderaAntigua || null });
    return {
        listo: m.listo,
        faltan: m.faltan,
        vivienda: m.vivienda,
        caldera: m.caldera.aplica ? `${m.caldera.fotos} foto(s)` : 'no aplica (sin calefacción)',
        placa_caldera: m.placa.aplica ? `${m.placa.fotos} foto(s)` : 'no aplica (sin calefacción)',
        nota: 'Cuenta lo registrado en la app (documentos de la oportunidad), no Drive: una foto copiada a mano en la carpeta sin registrar no sale. Vivienda «parcial» = fachada sin patios, que vale para encargar (no toda casa tiene patio).',
    };
}

// ─── Resolver un número ───────────────────────────────────────────────────────
const LIGERO_EXP = 'id, numero_expediente, estado, prioridad, cliente_id, id_oportunidad_ref, lote_id, '
    + 'fecha_fin_cifo, motivo_rechazo, created_at, updated_at';

async function resolverExpediente(numero) {
    const s = normNumero(numero);
    if (!s) return { error: 'Falta el número del expediente.' };
    const exacto = await supabase.from('expedientes').select(LIGERO_EXP).eq('numero_expediente', s).limit(1);
    if (exacto.error) throw new Error(exacto.error.message);
    if (exacto.data?.length) return { exp: exacto.data[0] };
    const soloNumero = /^\d+$/.test(s);
    const { data, error } = await supabase.from('expedientes').select(LIGERO_EXP)
        .ilike('numero_expediente', soloNumero ? `%_${s}` : `%${s}%`).limit(20);
    if (error) throw new Error(error.message);
    const cand = soloNumero ? (data || []).filter(e => e.numero_expediente.endsWith(`_${s}`)) : (data || []);
    if (!cand.length) return { error: `No hay ningún expediente que sea «${numero}».` };
    if (cand.length > 1) {
        return { ambiguo: cand.map(e => enlaceExpediente(e.id, e.numero_expediente)),
                 error: `Hay ${cand.length} expedientes que encajan con «${numero}»: pregunta cuál.` };
    }
    return { exp: cand[0] };
}

// Expediente, oportunidad (…_OP246) o CEE directo (2026CEE_64): lo que se puede encargar.
async function resolverReferencia(referencia) {
    const s = normNumero(referencia);
    if (/OP\d+$/.test(s)) {
        const { data, error } = await supabase.from('oportunidades').select('id_oportunidad')
            .ilike('id_oportunidad', `%${s}`).limit(5);
        if (error) throw new Error(error.message);
        const cand = (data || []).filter(o => o.id_oportunidad.toUpperCase().endsWith(s));
        if (cand.length !== 1) return { error: cand.length ? `Hay varias oportunidades «${referencia}»: dime el número completo.` : `No hay ninguna oportunidad «${referencia}».` };
        return { tipo: 'oportunidad', numero: cand[0].id_oportunidad, enlace: enlaceOportunidad(cand[0].id_oportunidad) };
    }
    if (/CEE_?\d+$/.test(s)) {
        const { data, error } = await supabase.from('cee_directos').select('id, numero_expediente')
            .ilike('numero_expediente', `%${s.replace(/CEE_?/, 'CEE_')}`).limit(5);
        if (error) throw new Error(error.message);
        if ((data || []).length !== 1) return { error: data?.length ? `Hay varios CEE «${referencia}»: dime el número completo.` : `No hay ningún CEE directo «${referencia}».` };
        return { tipo: 'cee_directo', numero: data[0].numero_expediente, enlace: enlaceCee(data[0].id, data[0].numero_expediente) };
    }
    const r = await resolverExpediente(s);
    if (!r.exp) return { error: r.error, ambiguo: r.ambiguo };
    return { tipo: 'expediente', id: r.exp.id, numero: r.exp.numero_expediente, enlace: enlaceExpediente(r.exp.id, r.exp.numero_expediente) };
}

// ─── Lo que tiene abierto en la pantalla ──────────────────────────────────────
// El popup manda en cada pregunta qué hay abierto en la app (`{ tab, exp, cee, op }`,
// los mismos ids que los deep-links). Aquí se resuelve a su número y su cliente: el
// modelo nunca ve un uuid, y si el id no existe (o no es de nada) no hay contexto.
const PESTANAS = {
    expedientes: 'Expedientes', 'cee-directos': 'CEE directos', oportunidades: 'Oportunidades',
    seguimiento: 'Seguimiento (el parte diario)', dashboard: 'Cuadro de mando', clientes: 'Clientes',
    lotes: 'Lotes', prescriptores: 'Partners',
};
const idValido = (v) => (typeof v === 'string' && /^[\w-]{1,64}$/.test(v) ? v : null);

async function describirPantalla(pantalla) {
    const p = pantalla && typeof pantalla === 'object' ? pantalla : {};
    const pestana = PESTANAS[p.tab] || null;
    try {
        if (idValido(p.exp)) {
            const { data } = await supabase.from('expedientes')
                .select('id, numero_expediente, estado, cliente_id').eq('id', p.exp).maybeSingle();
            if (data) {
                const cli = (await clientesPorId([data.cliente_id])).get(data.cliente_id);
                return { tipo: 'expediente', numero: data.numero_expediente, cliente: nombreCliente(cli), estado: data.estado,
                         enlace: enlaceExpediente(data.id, data.numero_expediente), pestana };
            }
        }
        if (idValido(p.cee)) {
            const { data } = await supabase.from('cee_directos')
                .select('id, numero_expediente, estado, nombre').eq('id', p.cee).maybeSingle();
            if (data) return { tipo: 'CEE directo', numero: data.numero_expediente, cliente: data.nombre || null, estado: data.estado,
                               enlace: enlaceCee(data.id, data.numero_expediente), pestana };
        }
        if (idValido(p.op)) {
            const { data } = await supabase.from('oportunidades')
                .select('id_oportunidad, estado, referencia_cliente').eq('id_oportunidad', p.op).maybeSingle();
            if (data) return { tipo: 'oportunidad', numero: data.id_oportunidad, cliente: data.referencia_cliente || null, estado: data.estado,
                               enlace: enlaceOportunidad(data.id_oportunidad), pestana: 'la calculadora de la oportunidad' };
        }
    } catch (e) {
        // Un id raro (p. ej. no es un uuid) hace fallar el `eq`: sin contexto, no sin respuesta.
        console.warn('[asistente-app] pantalla:', e.message);
    }
    return pestana ? { tipo: null, pestana } : null;
}

// Va delante de la ÚLTIMA pregunta (no en las instrucciones, que van cacheadas).
function notaPantalla(d) {
    if (!d) return null;
    if (!d.tipo) return `[La app te dice, no lo ha escrito él: está en la pantalla ${d.pestana}, sin nada abierto.]`;
    const quien = [d.cliente, d.estado ? `estado ${d.estado}` : null].filter(Boolean).join(', ');
    return `[La app te dice, no lo ha escrito él: tiene ABIERTO en pantalla ${d.tipo === 'oportunidad' ? 'la' : 'el'} ${d.tipo} ${d.numero}${quien ? ` (${quien})` : ''} → ${d.enlace}]`;
}

// ─── El manual (docs/conocimiento), troceado por apartados ────────────────────
const VACIAS = new Set(('que como cual cuales para por con sin los las del una uno unos unas este esta esto ese esa eso '
    + 'hay hace hacer tiene tengo ser son esta estan pero mas muy cuando donde quien algo app brokergy se le lo la el '
    + 'de en y a o u al su sus mi me te nos ya no si es').split(' '));
let manual = null;

function cargarManual() {
    if (manual) return manual;
    const apartados = [];
    const leer = (dir) => {
        let entradas = [];
        try { entradas = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of entradas) {
            const ruta = path.join(dir, e.name);
            if (e.isDirectory()) { leer(ruta); continue; }
            if (!e.name.endsWith('.md')) continue;
            const rel = path.relative(DIR_MANUAL, ruta).split(path.sep).join('/');
            const texto = fs.readFileSync(ruta, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
            let titulo = rel;
            let actual = [];
            const cerrar = () => {
                const cuerpo = actual.join('\n').trim();
                if (cuerpo.length >= 60) apartados.push({ documento: `docs/conocimiento/${rel}`, titulo, texto: cuerpo, norm: sinTildes(`${titulo}\n${cuerpo}`) });
                actual = [];
            };
            for (const linea of texto.split('\n')) {
                const h = /^#{1,3}\s+(.*)$/.exec(linea);
                if (h) { cerrar(); titulo = h[1].trim(); }
                actual.push(linea);
            }
            cerrar();
        }
    };
    leer(DIR_MANUAL);
    manual = apartados;
    return manual;
}

function buscarEnManual(consulta, cuantos = 4) {
    const apartados = cargarManual();
    if (!apartados.length) return { error: 'El manual (docs/conocimiento) no está disponible en este servidor.' };
    const terminos = [...new Set(sinTildes(consulta).split(/[^a-z0-9_]+/).filter(w => w.length >= 3 && !VACIAS.has(w)))];
    if (!terminos.length) return { error: 'Dime de qué tema: con palabras concretas (p. ej. «radar parte», «CEE final placas»).' };
    // Cada término pesa más cuanto más raro es (un «idf» de andar por casa).
    const peso = Object.fromEntries(terminos.map(t => {
        const df = apartados.reduce((n, a) => n + (a.norm.includes(t) ? 1 : 0), 0);
        return [t, df ? Math.log(apartados.length / df) + 0.1 : 0];
    }));
    const puntuados = apartados.map(a => {
        let p = 0;
        for (const t of terminos) {
            if (!peso[t]) continue;
            const veces = Math.min(5, a.norm.split(t).length - 1);
            if (!veces) continue;
            p += peso[t] * (1 + Math.log(veces)) * (sinTildes(a.titulo).includes(t) ? 3 : 1);
        }
        return { a, p };
    }).filter(x => x.p > 0).sort((x, y) => y.p - x.p).slice(0, cuantos);
    if (!puntuados.length) return { encontrados: 0, nota: 'Nada en el manual con esas palabras.' };
    return {
        encontrados: puntuados.length,
        apartados: puntuados.map(({ a }) => ({ documento: a.documento, apartado: a.titulo, texto: recortar(a.texto, 2600) })),
    };
}

// ─── Lo que se puede ENCARGAR al Claude del WhatsApp ──────────────────────────
// Un catálogo cerrado: el texto que le llega lo compone el SERVIDOR, no el modelo.
const TAREAS = {
    cee_inicial: {
        etiqueta: 'Generar el CEE inicial',
        que: 'el CEE inicial',
        instruccion: (n) => `Genera el CEE INICIAL de ${n} con la skill generar-cee-inicial (desde sus fotos o su vídeo). Lo que no se pueda saber no se inventa: si faltan fotos o datos, prepárame el WhatsApp para pedirlos, en seco.`,
    },
    cee_final: {
        etiqueta: 'Generar el CEE final',
        que: 'el CEE final',
        instruccion: (n) => `Genera el CEE FINAL de ${n} con la skill generar-cee-final.`,
    },
    revisar_cee: {
        etiqueta: 'Revisar el CEE entregado',
        que: 'la revisión del CEE',
        instruccion: (n) => `Revisa el CEE que ha entregado el técnico en ${n} con la skill revisar-cee y dame el veredicto con la evidencia. No des el visto bueno ni avises al certificador.`,
    },
    justificar: {
        etiqueta: 'Justificar el expediente',
        que: 'la justificación',
        instruccion: (n) => `Justifica el expediente ${n} con la skill justificar-expediente y déjalo preparado para firma.`,
    },
    auditar: {
        etiqueta: 'Auditar el expediente',
        que: 'la auditoría',
        instruccion: (n) => `Audita el expediente ${n} con la skill auditar-expediente y dame el veredicto (APTO / NO APTO) con lo que haya que corregir.`,
    },
    anexo_fotografico: {
        etiqueta: 'Generar el anexo fotográfico',
        que: 'el anexo fotográfico',
        instruccion: (n) => `Genera el anexo fotográfico de ${n} con la skill generar-anexo-fotografico.`,
    },
    cifo: {
        etiqueta: 'Generar el CIFO',
        que: 'el CIFO',
        instruccion: (n) => `Genera el CIFO de ${n} con la skill generar-anexo-cifo.`,
    },
    otra: {
        etiqueta: 'Otra tarea',
        que: 'lo que me has pedido',
        instruccion: (n, detalle) => `${detalle} (sobre ${n}).`,
    },
    // Esta NO va al Claude del WhatsApp: va a la cola del PC de Fran (scripts/asistente_pc.js), que es
    // quien tiene CE3X, el certificado y su Chrome con AutoFirma y la tarjeta. La tarjeta lleva LA
    // pregunta del pago (la misma que por WhatsApp) y el clic en «Presentar y pagar» es el «sí».
    presentar: {
        etiqueta: 'Presentar el CEE en el Registro',
        que: 'la presentación del CEE',
        pc: true,
    },
};

// La pregunta, la tasa y la tarjeta de presentar: la fuente es la misma que la del WhatsApp.
const presentarPc = () => require('../scripts/asistente_pc');

function nombreDe(usuario) {
    const p = usuario?.perfilCompleto || {};
    return [p.nombre, p.apellidos].filter(Boolean).join(' ').trim() || usuario?.email || 'alguien del equipo';
}

/**
 * «Presentar y pagar» pulsado: se vuelve a comprobar el CEE (que exista, que no esté registrado ni
 * a medias del Agente IA), se compone LA pregunta y el clic queda como la respuesta. Va a la cola del
 * PC por el vigilante (asistenteCanal.encargarAlPc).
 */
async function encargarPresentacion({ referencia, usuario }) {
    const pc = presentarPc();
    let c;
    try { c = await pc.localizarCee(referencia); } catch (e) { return { ok: false, codigo: 400, motivo: e.message }; }
    const cuando = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const r = await require('./asistenteCanal').encargarAlPc({
        numero: c.numero, fase: c.fase, titular: c.titular, importe: pc.TASA, tarjeta: pc.TARJETA,
        pregunta: pc.preguntaPresentar(c),
        respuesta: `Ha pulsado «Presentar y pagar ${pc.TASA} €» en esa misma pregunta, en el asistente de la app (${nombreDe(usuario)}, ${cuando}).`,
    });
    if (!r.ok) return { ok: false, codigo: 503, motivo: r.motivo };
    console.log(`[asistente-app] Presentación encargada al PC: ${c.numero} (${c.fase}) · ${nombreDe(usuario)}`);
    return { ok: true, referencia: c.numero, etiqueta: TAREAS.presentar.etiqueta, duplicado: r.duplicado, pc: r.pc, enCola: false };
}

/** Lo que hace el botón «Encargar»: valida otra vez y se lo pasa al Claude del WhatsApp. */
async function encargar({ referencia, tarea, detalle, usuario }) {
    const def = TAREAS[tarea];
    if (!def) return { ok: false, codigo: 400, motivo: 'Tarea desconocida.' };
    const det = String(detalle || '').trim().slice(0, 1500);
    if (tarea === 'otra' && !det) return { ok: false, codigo: 400, motivo: 'Falta decir qué tiene que hacer.' };
    if (def.pc) return encargarPresentacion({ referencia, usuario });
    const ref = await resolverReferencia(referencia);
    if (ref.error) return { ok: false, codigo: 400, motivo: ref.error };
    // Un CEE que el Agente IA YA está haciendo no se encarga otra vez: la cola del
    // vigilante solo junta lo que aún no ha cogido, y un segundo clic lo repetiría.
    if (ref.tipo === 'expediente' && (tarea === 'cee_inicial' || tarea === 'cee_final')) {
        const fase = tarea === 'cee_inicial' ? 'inicial' : 'final';
        const { data } = await supabase.from('expedientes').select('agente:cee->agente_ia').eq('id', ref.id).maybeSingle();
        const marca = data?.agente?.[fase];
        if (marca?.estado === 'trabajando') {
            const desde = marca.empezado_at
                ? new Date(marca.empezado_at).toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' })
                : null;
            return { ok: false, codigo: 409, motivo: `El CEE ${fase} de ${ref.numero} ya se está preparando${desde ? ` (desde las ${desde})` : ''}. Te avisaremos por WhatsApp cuando esté listo.` };
        }
    }
    const texto = [
        `Encargo desde el ASISTENTE DE LA APP: lo pide ${nombreDe(usuario)} y lo ha confirmado pulsando «Encargar».`,
        def.instruccion(ref.numero, det),
        det && tarea !== 'otra' ? `Indicaciones: ${det}` : '',
        'Al acabar, cuéntalo por aquí. Lo dudoso se pregunta, y nada sale a terceros sin el «sí» de Fran.',
    ].filter(Boolean).join(' ');
    const { pedirTarea, estadoAsistente } = require('./asistenteCanal');
    // ¿Está ya con otro trabajo? Entonces este espera su turno, y la tarjeta lo dice.
    const antes = await estadoAsistente();
    const r = await pedirTarea({
        texto,
        clave: `app-asistente:${ref.numero}:${tarea}`,
        acuse: `Me pongo con ${def.que} de ${ref.numero} (me lo has pedido desde la app). Te aviso cuando esté listo.`,
    });
    if (!r.ok) return { ok: false, codigo: 503, motivo: r.motivo };
    console.log(`[asistente-app] Encargo a Claude: ${def.etiqueta} · ${ref.numero} · ${nombreDe(usuario)}`);
    return { ok: true, referencia: ref.numero, etiqueta: def.etiqueta, enCola: !!antes.trabajando };
}

// ─── Las herramientas ─────────────────────────────────────────────────────────
// `pantalla`: no consulta nada, pinta algo en el popup (botones). Si en una vuelta
// el modelo SOLO llama a estas y ya ha escrito su respuesta, no se le vuelve a
// llamar: no hay nada que leer y sería una vuelta (y un coste) de más.
const LIFECYCLE = 'numero_expediente, estado_actual, dias_en_estado_actual, responsable_bloqueo, campos_pendientes, '
    + 'seguimiento_cee_inicial, seguimiento_cee_final, cee_ini_visita_ok, cee_ini_firma_ok, cee_ini_registro_ok, '
    + 'cee_fin_visita_ok, cee_fin_firma_ok, cee_fin_registro_ok, num_facturas, cert_inst_pruebas_ok, cert_inst_firma_ok, '
    + 'anexo_i_generado, anexo_i_enviado, anexo_i_firmado, cesion_generada, cesion_enviada, cesion_firmada, '
    + 'ficha_res_generada, ficha_res_enviada, ficha_res_firmada, cifo_generado, cifo_enviado, cifo_firmado, '
    + 'rite_aportado, foto_generada, foto_enviada, foto_firmada, historial_json';

const HERRAMIENTAS = [
    {
        name: 'buscar',
        description: 'Busca expedientes CAE, oportunidades y CEE directos por NÚMERO (26RES060_208, 26RES060_OP246, 2026CEE_64, o solo «208») o por NOMBRE del cliente. Devuelve estado y enlace de cada uno. Úsalo primero cuando no tengas el número exacto.',
        input_schema: {
            type: 'object',
            properties: { texto: { type: 'string', description: 'Número normalizado (26RES060_208, 26RES060_OP246, 2026CEE_64, «208») o nombre/apellidos del cliente.' } },
            required: ['texto'],
        },
        paso: (i) => `Buscando «${recortar(i.texto, 40)}»…`,
        async run({ texto }) {
            const q = String(texto || '').trim();
            if (q.length < 2) return { error: 'Dame al menos dos letras o un número.' };
            const s = normNumero(q);
            const res = [];
            let clientes = new Map();
            if (/\d/.test(s)) {
                const soloNumero = /^\d+$/.test(s);
                const [e, o, c] = await Promise.all([
                    supabase.from('expedientes').select('id, numero_expediente, estado, cliente_id')
                        .ilike('numero_expediente', soloNumero ? `%_${s}` : `%${s}%`).limit(20),
                    supabase.from('oportunidades').select('id_oportunidad, estado, referencia_cliente, prescriptor, cliente_id')
                        .ilike('id_oportunidad', soloNumero ? `%OP${s}` : `%${s}%`).limit(20),
                    supabase.from('cee_directos').select('id, numero_expediente, estado, nombre, municipio')
                        .ilike('numero_expediente', soloNumero ? `%_${s}` : `%${s}%`).limit(20),
                ]);
                for (const r of [e, o, c]) if (r.error) throw new Error(r.error.message);
                const fin = (v, pre) => !soloNumero || v.toUpperCase().endsWith(`${pre}${s}`);
                const exps = (e.data || []).filter(x => fin(x.numero_expediente, '_'));
                const ops = (o.data || []).filter(x => fin(x.id_oportunidad, 'OP'));
                clientes = await clientesPorId([...exps, ...ops].map(x => x.cliente_id));
                for (const x of exps) res.push({ tipo: 'expediente', numero: x.numero_expediente, estado: x.estado, cliente: nombreCliente(clientes.get(x.cliente_id)), enlace: enlaceExpediente(x.id, x.numero_expediente) });
                for (const x of ops) res.push({ tipo: 'oportunidad', numero: x.id_oportunidad, estado: x.estado, cliente: x.referencia_cliente || nombreCliente(clientes.get(x.cliente_id)), partner: x.prescriptor || null, enlace: enlaceOportunidad(x.id_oportunidad) });
                for (const x of (c.data || []).filter(x => fin(x.numero_expediente, '_'))) res.push({ tipo: 'cee_directo', numero: x.numero_expediente, estado: x.estado, cliente: x.nombre, municipio: x.municipio, enlace: enlaceCee(x.id, x.numero_expediente) });
            } else {
                const palabras = sinTildes(q).split(/[^a-z0-9]+/).filter(w => w.length >= 3).sort((a, b) => b.length - a.length);
                if (!palabras.length) return { error: 'Dame un nombre o un apellido de al menos tres letras.' };
                const w = comodin(palabras[0]);
                const encaja = (t) => { const n = sinTildes(t); return palabras.every(p => n.includes(p)); };
                const [cl, opRef, ceeNom] = await Promise.all([
                    supabase.from('clientes').select('id_cliente, nombre_razon_social, apellidos, municipio')
                        .or(`nombre_razon_social.ilike.%${w}%,apellidos.ilike.%${w}%`).limit(80),
                    supabase.from('oportunidades').select('id_oportunidad, estado, referencia_cliente, prescriptor, cliente_id')
                        .ilike('referencia_cliente', `%${w}%`).limit(40),
                    supabase.from('cee_directos').select('id, numero_expediente, estado, nombre, municipio, cliente_id')
                        .ilike('nombre', `%${w}%`).limit(20),
                ]);
                for (const r of [cl, opRef, ceeNom]) if (r.error) throw new Error(r.error.message);
                const delCliente = (cl.data || []).filter(c => encaja(nombreCliente(c)));
                clientes = new Map(delCliente.map(c => [c.id_cliente, c]));
                const ids = [...clientes.keys()].slice(0, 40);
                const [e, o, c] = ids.length ? await Promise.all([
                    supabase.from('expedientes').select('id, numero_expediente, estado, cliente_id').in('cliente_id', ids).limit(40),
                    supabase.from('oportunidades').select('id_oportunidad, estado, referencia_cliente, prescriptor, cliente_id').in('cliente_id', ids).limit(40),
                    supabase.from('cee_directos').select('id, numero_expediente, estado, nombre, municipio, cliente_id').in('cliente_id', ids).limit(20),
                ]) : [{ data: [] }, { data: [] }, { data: [] }];
                for (const r of [e, o, c]) if (r.error) throw new Error(r.error.message);
                for (const x of e.data || []) res.push({ tipo: 'expediente', numero: x.numero_expediente, estado: x.estado, cliente: nombreCliente(clientes.get(x.cliente_id)), enlace: enlaceExpediente(x.id, x.numero_expediente) });
                const opsVistas = new Set();
                for (const x of [...(o.data || []), ...(opRef.data || []).filter(x => encaja(x.referencia_cliente))]) {
                    if (opsVistas.has(x.id_oportunidad)) continue;
                    opsVistas.add(x.id_oportunidad);
                    res.push({ tipo: 'oportunidad', numero: x.id_oportunidad, estado: x.estado, cliente: x.referencia_cliente || nombreCliente(clientes.get(x.cliente_id)), partner: x.prescriptor || null, enlace: enlaceOportunidad(x.id_oportunidad) });
                }
                const ceeVistos = new Set();
                for (const x of [...(c.data || []), ...(ceeNom.data || []).filter(x => encaja(x.nombre))]) {
                    if (ceeVistos.has(x.id)) continue;
                    ceeVistos.add(x.id);
                    res.push({ tipo: 'cee_directo', numero: x.numero_expediente, estado: x.estado, cliente: x.nombre, municipio: x.municipio, enlace: enlaceCee(x.id, x.numero_expediente) });
                }
            }
            if (!res.length) return { encontrados: 0, nota: `Nada que encaje con «${q}».` };
            return { encontrados: res.length, resultados: res.slice(0, 25), mas: Math.max(0, res.length - 25) };
        },
    },
    {
        name: 'estado_expediente',
        description: 'Todo lo que hay que saber de UN expediente CAE para decir en qué está y qué le falta: estado y días en él, de quién es la pelota, el CEE inicial y final, si ya hay MATERIAL para hacer el CEE inicial (vídeo o fotos de la vivienda, caldera y su placa), documentos generados/enviados/firmados, lo que le falta por pistas (certificador, cliente, instalador), en qué bloque del parte diario está atascado, incidencias abiertas y el último historial.',
        input_schema: {
            type: 'object',
            properties: { numero: { type: 'string', description: 'Número del expediente, p. ej. 26RES060_208 (o solo 208).' } },
            required: ['numero'],
        },
        paso: (i) => `Mirando el expediente ${recortar(i.numero, 30)}…`,
        async run({ numero }) {
            const r = await resolverExpediente(numero);
            if (!r.exp) return r;
            const e = r.exp;
            const [vida, pend, pistas, cli, inc, filas] = await Promise.all([
                supabase.from('v_expedientes_lifecycle').select(LIFECYCLE).eq('numero_expediente', e.numero_expediente).maybeSingle(),
                supabase.from('v_expedientes_pendientes').select('partner_nombre, partner_acronimo, anomalias_docs').eq('id', e.id).maybeSingle(),
                supabase.from('v_expedientes_pistas').select('*').eq('numero_expediente', e.numero_expediente).maybeSingle(),
                e.cliente_id ? supabase.from('clientes').select('nombre_razon_social, apellidos, municipio, provincia').eq('id_cliente', e.cliente_id).maybeSingle() : { data: null },
                // Una sola fila: leer estos trozos del JSONB es barato (regla 22 va de listados).
                supabase.from('expedientes')
                    .select('incidencias:documentacion->incidencias, caldera:instalacion->caldera_antigua_cal, agente:cee->agente_ia, oportunidades(uploads:datos_calculo->reforma_uploads)')
                    .eq('id', e.id).maybeSingle(),
                filasRadar().catch(() => null),
            ]);
            for (const x of [vida, pend, pistas, cli, inc]) if (x.error) throw new Error(x.error.message);
            const ciclo = { ...(vida.data || {}) };
            const historial = Array.isArray(ciclo.historial_json) ? ciclo.historial_json : [];
            delete ciclo.historial_json;
            const incidencias = Array.isArray(inc.data?.incidencias) ? inc.data.incidencias : [];
            const abiertas = incidencias.filter(i => i.estado !== 'SUBSANADA');
            return {
                expediente: e.numero_expediente,
                enlace: enlaceExpediente(e.id, e.numero_expediente),
                estado: e.estado,
                prioridad: e.prioridad || null,
                oportunidad: e.id_oportunidad_ref ? enlaceOportunidad(e.id_oportunidad_ref) : null,
                cliente: cli.data ? { nombre: nombreCliente(cli.data), municipio: cli.data.municipio, provincia: cli.data.provincia } : null,
                partner: pend.data?.partner_nombre || null,
                en_lote: !!e.lote_id,
                rechazo: e.motivo_rechazo || null,
                alta: e.created_at, ultimo_cambio: e.updated_at,
                ciclo_de_vida: ciclo,
                material_cee_inicial: materialParaElCee(inc.data?.oportunidades?.uploads, inc.data?.caldera),
                // { inicial: { estado: 'trabajando' | …, empezado_at } }: el Claude del WhatsApp
                // (el «Agente IA») con ese CEE entre manos. Entonces no se vuelve a proponer.
                agente_ia: inc.data?.agente || null,
                anomalias_documentos: pend.data?.anomalias_docs || [],
                pistas: pistas.data || null,
                en_el_parte: filas
                    ? filas.filter(f => f.expediente_id === e.id).map(f => ({ bloque: radar.BLOQUES[f.bloque]?.titulo || f.bloque, ...filaRadar(f) }))
                    : 'el parte no se ha podido leer ahora',
                incidencias_abiertas: abiertas.slice(0, 10).map(i => ({ texto: recortar(i.texto, 300), severidad: i.severidad, desde: i.fecha })),
                incidencias_total: incidencias.length,
                ultimo_historial: historial.slice(-6).map(h => recortar(typeof h === 'string' ? h : JSON.stringify(h), 240)),
            };
        },
    },
    {
        name: 'pendientes',
        description: `Lo atascado de TODA la cartera según el radar del parte diario (el mismo criterio que la pantalla Seguimiento), agrupado por bloques. Úsalo para «¿qué tengo hoy?», «¿qué hay sin encargar?», «¿qué falta por revisar?». Bloques: ${Object.entries(radar.BLOQUES).map(([k, d]) => `${k} = ${d.titulo}`).join(' · ')}.`,
        input_schema: {
            type: 'object',
            properties: {
                bloque: { type: 'string', description: 'Clave de un bloque (p. ej. SIN_ENCARGAR) o palabras de su título.' },
                expediente: { type: 'string', description: 'Solo las líneas de ese expediente.' },
                solo_vencidas: { type: 'boolean', description: 'Solo lo que ya ha pasado de plazo.' },
                limite: { type: 'integer', description: 'Líneas por bloque (por defecto 8).' },
            },
        },
        paso: (i) => (i.expediente ? `Mirando el parte de ${recortar(i.expediente, 30)}…` : 'Repasando el parte de hoy…'),
        async run({ bloque, expediente, solo_vencidas, limite = 8 }) {
            let filas = await filasRadar();
            if (expediente) {
                const s = normNumero(expediente);
                filas = filas.filter(f => f.numero_expediente === s || f.numero_expediente.endsWith(`_${s}`));
            }
            if (solo_vencidas) filas = filas.filter(f => f.vencida);
            let grupos = radar.agruparPorBloque(filas);
            if (bloque) {
                const b = sinTildes(bloque);
                grupos = grupos.filter(g => sinTildes(g.bloque) === b || sinTildes(g.def.titulo).includes(b));
            }
            const n = Math.max(1, Math.min(40, Number(limite) || 8));
            return {
                total: filas.length,
                vencidas: filas.filter(f => f.vencida).length,
                bloques: grupos.map(g => ({
                    clave: g.bloque, titulo: g.def.titulo, total: g.filas.length,
                    vencidas: g.filas.filter(f => f.vencida).length,
                    lineas: g.filas.slice(0, n).map(filaRadar),
                    mas: Math.max(0, g.filas.length - n),
                })),
            };
        },
    },
    {
        name: 'que_falta',
        description: 'Qué falta en la cartera por las tres pistas que avanzan EN PARALELO: CEE final (certificador), anexos de firma (cliente) y CIFO (instalador), con los días que lleva cada una esperando. Úsalo para «¿qué le pido al instalador?», «¿qué está en nuestro tejado?».',
        input_schema: {
            type: 'object',
            properties: {
                esperando_a: { type: 'string', enum: ['CERTIFICADOR', 'CLIENTE', 'INSTALADOR'] },
                dias_minimos: { type: 'integer' },
                solo_nuestro_tejado: { type: 'boolean', description: 'Solo lo que depende de BROKERGY.' },
                limite: { type: 'integer', description: 'Por defecto 25.' },
            },
        },
        paso: () => 'Mirando qué falta…',
        async run({ esperando_a, dias_minimos, solo_nuestro_tejado, limite = 25 }) {
            let q = supabase.from('v_expedientes_pistas').select('*')
                .order('dias_esperando_max', { ascending: false }).limit(Math.min(60, Number(limite) || 25));
            if (esperando_a) q = q.contains('esperando_a', [esperando_a]);
            if (dias_minimos != null) q = q.gte('dias_esperando_max', dias_minimos);
            const { data, error } = await q;
            if (error) throw new Error(error.message);
            let filas = data || [];
            if (solo_nuestro_tejado) filas = filas.filter(f => (f.nos_toca_a_nosotros || []).length > 0);
            const ids = filas.length ? await supabase.from('expedientes').select('id, numero_expediente')
                .in('numero_expediente', filas.map(f => f.numero_expediente)) : { data: [] };
            if (ids.error) throw new Error(ids.error.message);
            const idDe = new Map((ids.data || []).map(x => [x.numero_expediente, x.id]));
            return {
                leyenda: { SIN_EMITIR: 'ni generado', SIN_ENVIAR: 'generado, sigue en nuestra mesa', ESPERANDO: 'lo tiene el otro desde hace N días', OK: 'hecho' },
                total: filas.length,
                expedientes: filas.map(f => ({ ...f, enlace: idDe.has(f.numero_expediente) ? enlaceExpediente(idDe.get(f.numero_expediente), f.numero_expediente) : f.numero_expediente })),
            };
        },
    },
    {
        name: 'resumen',
        description: 'Resumen global de la cartera viva: cuántos expedientes activos, por estado, de quién es la pelota y cuántos llevan más de 15 y 30 días parados. Para «¿cómo vamos?».',
        input_schema: { type: 'object', properties: {} },
        paso: () => 'Haciendo el resumen de la cartera…',
        async run() {
            const { data, error } = await supabase.from('v_expedientes_pendientes')
                .select('estado_actual, responsable_bloqueo, dias_en_estado_actual, numero_expediente');
            if (error) throw new Error(error.message);
            const porEstado = {}; const porResponsable = {}; const mas15 = []; const mas30 = [];
            for (const x of data || []) {
                porEstado[x.estado_actual] = (porEstado[x.estado_actual] || 0) + 1;
                porResponsable[x.responsable_bloqueo] = (porResponsable[x.responsable_bloqueo] || 0) + 1;
                if (x.dias_en_estado_actual > 30) mas30.push(x.numero_expediente);
                else if (x.dias_en_estado_actual > 15) mas15.push(x.numero_expediente);
            }
            return { activos: (data || []).length, por_estado: porEstado, por_responsable: porResponsable, parados_mas_15_dias: mas15, parados_mas_30_dias: mas30 };
        },
    },
    {
        name: 'por_partner',
        description: 'Expedientes vivos de un partner o instalador (por nombre o acrónimo), con estado, días y de quién es la pelota.',
        input_schema: {
            type: 'object',
            properties: { partner: { type: 'string', description: 'Nombre o acrónimo del partner.' } },
            required: ['partner'],
        },
        paso: (i) => `Mirando los expedientes de ${recortar(i.partner, 30)}…`,
        async run({ partner }) {
            const p = String(partner || '').replace(/[,()%*:"'\\]/g, ' ').trim();
            if (p.length < 2) return { error: 'Dime el nombre o el acrónimo del partner.' };
            const { data, error } = await supabase.from('v_expedientes_pendientes')
                .select('id, numero_expediente, estado_actual, dias_en_estado_actual, responsable_bloqueo, cliente_nombre, partner_nombre, partner_acronimo')
                .or(`partner_nombre.ilike.%${p}%,partner_acronimo.ilike.%${p}%`)
                .order('dias_en_estado_actual', { ascending: false }).limit(60);
            if (error) throw new Error(error.message);
            return {
                total: (data || []).length,
                expedientes: (data || []).map(x => ({
                    enlace: enlaceExpediente(x.id, x.numero_expediente), estado: x.estado_actual, dias: x.dias_en_estado_actual,
                    pelota: x.responsable_bloqueo, cliente: x.cliente_nombre, partner: x.partner_acronimo || x.partner_nombre,
                })),
            };
        },
    },
    {
        name: 'consultar_manual',
        description: 'Busca en el manual de la app (docs/conocimiento: lo decidido, cómo funciona cada pantalla y por qué) para preguntas tipo «¿cómo funciona…?», «¿por qué…?», «¿qué se hace cuando…?». Contesta con lo que diga y cita el documento.',
        input_schema: {
            type: 'object',
            properties: { consulta: { type: 'string', description: 'Palabras clave concretas, p. ej. «radar parte diario bloques», «CEE final placas existentes».' } },
            required: ['consulta'],
        },
        paso: (i) => `Consultando el manual: «${recortar(i.consulta, 40)}»…`,
        async run({ consulta }) { return buscarEnManual(consulta); },
    },
    {
        name: 'estado_del_asistente',
        description: 'Dice si el Claude del WhatsApp (el que hace los encargos) está conectado y si está trabajando ahora mismo.',
        input_schema: { type: 'object', properties: {} },
        paso: () => 'Preguntando al Claude del WhatsApp…',
        async run() { return require('./asistenteCanal').estadoAsistente(); },
    },
];
const POR_NOMBRE = Object.fromEntries(HERRAMIENTAS.map(h => [h.name, h]));
// Lo que viaja a la API: sin `run` ni `paso`. Mismo orden siempre (caché).
const HERRAMIENTAS_API = HERRAMIENTAS.map(({ name, description, input_schema }) => ({ name, description, input_schema }));

// ─── Los BOTONES van en el TEXTO, no en herramientas ─────────────────────────
// Con Opus 5.5 el texto que el modelo escribe ANTES de llamar a una herramienta (a
// partir de la segunda vuelta) vuelve como nota de progreso OCULTA: si los botones
// fueran herramientas, la respuesta escrita justo antes se perdía (medido el
// 19/10/2026: «¿qué tengo pendiente de revisar?» acababa sin una sola línea). Así que
// el modelo termina su respuesta con líneas `>> …` y aquí se convierten en botones:
//   >> Opción uno | Opción dos            → botones de respuesta rápida
//   >> ENCARGO cee_inicial 26RES093_15    → tarjeta con el botón «Encargar»
//   >> ENCARGO otra 26RES060_208 | qué tiene que hacer
// El popup no pinta las líneas `>>`; el texto entero vuelve en el historial.
function leerMarcas(texto) {
    const opciones = [];
    const encargos = [];
    for (const linea of String(texto || '').split('\n')) {
        const l = linea.trim();
        if (!l.startsWith('>>')) continue;
        const cuerpo = l.slice(2).trim();
        const m = /^ENCARGO\s+([a-z_]+)\s+([^\s|]+)\s*(?:\|\s*(.+))?$/i.exec(cuerpo);
        if (m) encargos.push({ tarea: m[1].toLowerCase(), referencia: m[2], detalle: (m[3] || '').trim() || null });
        else opciones.push(...cuerpo.split('|').map(o => recortar(o.trim(), 70)).filter(Boolean));
    }
    return { opciones: [...new Set(opciones)].slice(0, 4), encargos: encargos.slice(0, 2) };
}

// Los encargos se validan ANTES de pintar el botón: que no salga «Encargar» para un
// expediente que no existe o una tarea que no está en el catálogo.
async function emitirMarcas(texto, emitir) {
    const { opciones, encargos } = leerMarcas(texto);
    let asistente = null;
    for (const e of encargos) {
        const def = TAREAS[e.tarea];
        if (!def || (e.tarea === 'otra' && !e.detalle)) { console.warn('[asistente-app] encargo mal propuesto:', e); continue; }
        // eslint-disable-next-line no-await-in-loop
        const ref = await resolverReferencia(e.referencia).catch(err => ({ error: err.message }));
        if (ref.error) { console.warn('[asistente-app] encargo sin referencia válida:', e.referencia, ref.error); continue; }
        // Presentar: la tarjeta ES la pregunta del pago, así que se compone aquí, con el CEE comprobado
        // (no se ofrece si está registrado o el Agente IA aún lo está haciendo).
        let presentacion = null;
        if (def.pc) {
            try {
                const pc = presentarPc();
                // eslint-disable-next-line no-await-in-loop
                const c = await pc.localizarCee(ref.numero);
                presentacion = { pregunta: pc.preguntaPresentar(c), importe: pc.TASA, tarjeta: pc.TARJETA, fase: c.fase };
            } catch (err) { console.warn('[asistente-app] presentar no procede:', ref.numero, err.message); continue; }
        }
        // eslint-disable-next-line no-await-in-loop
        if (!asistente) asistente = await require('./asistenteCanal').estadoAsistente();
        emitir({ t: 'encargo', referencia: ref.numero, enlace: ref.enlace, tarea: e.tarea, etiqueta: def.etiqueta, que: def.que,
                 detalle: e.detalle ? e.detalle.slice(0, 1500) : null, asistente, ...(presentacion ? { presentacion } : {}) });
    }
    if (opciones.length) emitir({ t: 'sugerencias', opciones });
}

function textoSistema(usuario) {
    const hoy = new Date().toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid', weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
    return `Eres el asistente que vive dentro de la app de BROKERGY: el CRM de rehabilitación energética y Certificados de Ahorro Energético (CAE). El circuito es oportunidad → propuesta → expediente (CEE inicial, obra, CEE final, documentos para firma, CIFO) → lote al Sujeto Obligado → cobro; aparte están los CEE directos (certificados sueltos).

Hablas con ${nombreDe(usuario)} (${usuario?.rol_nombre || 'equipo'}). Hoy es ${hoy}.

Cómo trabajas:
- Contestas con datos EN VIVO de tus herramientas, nunca de memoria. Si no lo dicen, di que no lo sabes. No inventes importes, fechas ni nombres.
- Los números llegan dictados o a medias: normalízalos al llamar («26 RES 060 208» → 26RES060_208, «la OP 246» → OP246, «el 208» → 208). Si hay varios que encajan, enséñalos con su enlace y pregunta cuál.
- Cada vez que nombres un expediente, oportunidad o CEE, pon su ENLACE tal cual te lo da la herramienta (markdown): al pulsarlo se abre en la app.
- Para «¿cómo funciona…?» o «¿por qué…?» sobre la app, usa consultar_manual y cita el documento.

LA PANTALLA. La última pregunta puede llegar con una nota entre corchetes «[La app te dice… tiene ABIERTO en pantalla el expediente …]»: es lo que está mirando AHORA, no algo que haya escrito. Si dice «este», «aquí», «el que tengo abierto», o da una orden sin número («genera el CIFO», «haz el CEE final»), es ESE. Si nombra otro número, manda el que nombra. No repitas la nota ni le digas que «la app te lo ha dicho»: úsala y ya.

ÓRDENES. Si te pide HACER algo del catálogo de encargos («genera el CIFO», «hazme el CEE final», «revisa el CEE», «termina / cierra / justifica el expediente» = justificar, «audítalo», «el anexo fotográfico», «preséntalo»), no le preguntes si está seguro: mira el expediente con estado_expediente (para no proponer algo ya en marcha o imposible), di en una o dos líneas cómo está lo que hace falta para eso y saca la tarjeta con >> ENCARGO. Si falta algo que lo impide de verdad (p. ej. no hay CEE que presentar), dilo y no la saques.

Al revisar un expediente: una línea con el estado y la fase; lo que le falta y de quién es la pelota, con los días; las incidencias abiertas si las hay; y termina preguntando qué quiere hacer, con 2-4 opciones.

BOTONES. Consulta primero todo lo que necesites y escribe la respuesta entera al final. Para poner botones, acaba la respuesta con estas líneas (el popup no las enseña como texto, las convierte en botones):
>> Opción uno | Opción dos | Opción tres
  (respuestas rápidas: frases cortas, como las diría la persona; al pulsar una se envía tal cual)
>> ENCARGO <tarea> <referencia>
>> ENCARGO otra <referencia> | qué tiene que hacer
  (tarjeta con el botón «Encargar»; como mucho DOS líneas ENCARGO por respuesta; tareas:${Object.entries(TAREAS).map(([k, v]) => `${k} = ${v.etiqueta.toLowerCase()}`).join(' · ')}; referencia = expediente 26RES060_208, oportunidad 26RES060_OP246 o CEE directo 2026CEE_64, el número completo)

PRESENTAR un CEE en el Registro de la JCCM (>> ENCARGO presentar <referencia>) no lo hace el Claude del WhatsApp sino el PC de Fran (califica en CE3X, firma con su certificado y paga la tasa con su tarjeta): propónlo cuando el CEE esté terminado y sin registrar. La tarjeta ya le enseña la pregunta del pago (tasa y tarjeta) y el botón es «Presentar y pagar»; tú no repitas importes ni digas que está presentado.

Tú no cambias nada ni envías nada a nadie. El trabajo pesado (generar el CEE inicial o final, revisar un CEE entregado, justificar o auditar un expediente, el anexo fotográfico, el CIFO…) lo hace el Claude del WhatsApp: propónlo con una línea >> ENCARGO cuando te lo pidan o cuando sea el paso obvio. Le sale un botón «Encargar» y solo se hace si lo pulsa; gasta de la suscripción de Fran, tarda minutos y el resultado llega por el grupo «BROKERGY - CHAT». Nunca digas que algo está encargado o hecho: di que tiene el botón debajo. Si te preguntan qué está haciendo ese Claude, usa estado_del_asistente. El «Agente IA» de la barra de certificadores es ese mismo Claude: un CEE que haga por encargo queda a su nombre y, al terminar, pasa a «pendiente de revisión». Si estado_expediente dice que el agente_ia ya está «trabajando» en ese CEE, NO lo propongas otra vez: di que se está preparando y que se le avisará por WhatsApp cuando esté listo. Encargarle un CEE a un técnico de carne y hueso se hace en la pantalla del expediente, no desde aquí.

Estilo: castellano, breve y directo, como un compañero de la oficina. Listas cortas, negrita solo para lo importante, sin títulos grandes. Fechas en dd/mm/aaaa. Sin emojis de robot ni firmas.`;
}

// ─── El historial que manda el navegador: solo texto, alternado, acaba en «user» ──
function limpiarHistorial(mensajes) {
    if (!Array.isArray(mensajes) || !mensajes.length) throw new Error('No hay ninguna pregunta.');
    const out = [];
    for (const m of mensajes.slice(-MAX_MENSAJES)) {
        const role = m?.role === 'assistant' ? 'assistant' : (m?.role === 'user' ? 'user' : null);
        const texto = typeof m?.content === 'string' ? m.content.trim().slice(0, MAX_CHARS_MENSAJE) : '';
        if (!role || !texto) continue;
        if (out.length && out[out.length - 1].role === role) out[out.length - 1].content += `\n\n${texto}`;
        else out.push({ role, content: texto });
    }
    while (out.length && out[0].role !== 'user') out.shift();
    if (!out.length || out[out.length - 1].role !== 'user') throw new Error('El último mensaje tiene que ser una pregunta.');
    return out;
}

function costeUsd(modelo, uso) {
    const p = PRECIOS[modelo];
    if (!p) return null;
    const [ent, sal, lec] = p;
    return (uso.entrada * ent + uso.cache_escritura * ent * 1.25 + uso.cache_lectura * lec + uso.salida * sal) / 1e6;
}

function apuntarConsumo(linea) {
    try {
        fs.mkdirSync(DIR_CONSUMO, { recursive: true });
        fs.appendFileSync(path.join(DIR_CONSUMO, 'consumo.jsonl'), `${JSON.stringify(linea)}\n`);
    } catch (e) { console.warn('[asistente-app] no se pudo apuntar el consumo:', e.message); }
}

function mensajeDeError(e) {
    if (e instanceof Anthropic.AuthenticationError) return 'La clave de la API de Anthropic no vale (ANTHROPIC_API_KEY).';
    if (e instanceof Anthropic.PermissionDeniedError) return 'La clave de la API no tiene permiso para este modelo.';
    if (e instanceof Anthropic.RateLimitError) return 'La API de Anthropic va saturada ahora mismo; prueba en un minuto.';
    if (e instanceof Anthropic.APIConnectionError) return 'No hay conexión con la API de Anthropic.';
    if (e instanceof Anthropic.APIError) return `La API de Anthropic ha fallado (${e.status ?? 'sin código'}).`;
    return `Algo ha fallado: ${e.message}`;
}

/**
 * Contesta UNA pregunta (con el historial de texto de antes) y va emitiendo eventos:
 *   { t: 'paso', texto }          — qué herramienta está usando («Mirando el expediente…»)
 *   { t: 'texto', d }             — trozo de la respuesta, según se escribe
 *   { t: 'encargo', … }           — botón «Encargar» (proponer_encargo)
 *   { t: 'sugerencias', opciones }
 *   { t: 'error', mensaje }
 *   { t: 'fin', uso }             — tokens y coste aproximado
 */
async function conversar({ mensajes, pantalla, usuario, emitir, signal }) {
    const api = anthropic();
    if (!api) { emitir({ t: 'error', mensaje: 'Falta ANTHROPIC_API_KEY en el .env del servidor: el asistente no puede contestar.' }); return; }
    let historial;
    try { historial = limpiarHistorial(mensajes); } catch (e) { emitir({ t: 'error', mensaje: e.message }); return; }
    const nota = notaPantalla(await describirPantalla(pantalla));
    if (nota) {
        const ultima = historial[historial.length - 1];
        ultima.content = `${nota}\n\n${ultima.content}`;
    }

    const sistema = textoSistema(usuario);
    const uso = { entrada: 0, salida: 0, cache_lectura: 0, cache_escritura: 0, vueltas: 0 };
    const ctx = { emitir, usuario };
    const inicio = Date.now();
    let huboTexto = false;
    let textoTotal = '';
    let terminado = false;
    let modeloUsado = MODELO;
    try {
        for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta += 1) {
            let textoEnEstaVuelta = false;
            const stream = api.beta.messages.stream({
                model: MODELO,
                max_tokens: 16000,
                // Si el modelo declina por sus filtros de seguridad, la API reintenta sola
                // con el modelo de respaldo que toque (en vez de dejar la respuesta vacía).
                betas: ['server-side-fallback-2026-07-01'],
                fallbacks: 'default',
                output_config: { effort: ESFUERZO },
                cache_control: { type: 'ephemeral' },
                system: sistema,
                tools: HERRAMIENTAS_API,
                messages: historial,
            }, { signal });
            stream.on('text', (d) => {
                if (!textoEnEstaVuelta && huboTexto) { emitir({ t: 'texto', d: '\n\n' }); textoTotal += '\n\n'; }
                textoEnEstaVuelta = true;
                huboTexto = true;
                textoTotal += d;
                emitir({ t: 'texto', d });
            });
            // eslint-disable-next-line no-await-in-loop
            const msg = await stream.finalMessage();
            modeloUsado = msg.model || modeloUsado;
            uso.vueltas += 1;
            uso.entrada += msg.usage?.input_tokens || 0;
            uso.salida += msg.usage?.output_tokens || 0;
            uso.cache_lectura += msg.usage?.cache_read_input_tokens || 0;
            uso.cache_escritura += msg.usage?.cache_creation_input_tokens || 0;

            if (msg.stop_reason === 'refusal') {
                emitir({ t: 'texto', d: `${huboTexto ? '\n\n' : ''}Esto no te lo puedo contestar.` });
                break;
            }
            const usos = msg.content.filter(b => b.type === 'tool_use');
            if (!usos.length) { terminado = true; break; }
            if (msg.stop_reason === 'max_tokens') { emitir({ t: 'error', mensaje: 'La respuesta se ha cortado por larga.' }); break; }

            for (const u of usos) {
                const h = POR_NOMBRE[u.name];
                if (h?.paso) emitir({ t: 'paso', texto: h.paso(u.input || {}) });
            }
            // eslint-disable-next-line no-await-in-loop
            const resultados = await Promise.all(usos.map(async (u) => {
                const h = POR_NOMBRE[u.name];
                if (!h) return { type: 'tool_result', tool_use_id: u.id, is_error: true, content: `No existe la herramienta ${u.name}.` };
                try {
                    const salida = await h.run(u.input || {}, ctx);
                    let texto = JSON.stringify(salida);
                    if (texto.length > MAX_CHARS_RESULTADO) texto = `${texto.slice(0, MAX_CHARS_RESULTADO)} …[RECORTADO: pide menos, con filtros]`;
                    return { type: 'tool_result', tool_use_id: u.id, content: texto, ...(salida?.error ? { is_error: true } : {}) };
                } catch (e) {
                    console.warn(`[asistente-app] ${u.name}:`, e.message);
                    return { type: 'tool_result', tool_use_id: u.id, is_error: true, content: `Ha fallado la consulta: ${e.message}` };
                }
            }));
            historial.push({ role: 'assistant', content: msg.content });
            historial.push({ role: 'user', content: resultados });
        }
        if (!terminado && !huboTexto) emitir({ t: 'error', mensaje: 'Se ha quedado sin terminar (demasiadas consultas seguidas). Pregúntamelo más concreto.' });
        if (terminado) await emitirMarcas(textoTotal, emitir);
    } catch (e) {
        if (signal?.aborted || e instanceof Anthropic.APIUserAbortError) return;   // cerró el popup: no se sigue gastando
        console.error('[asistente-app]', e);
        emitir({ t: 'error', mensaje: mensajeDeError(e) });
    }
    const coste = costeUsd(modeloUsado, uso);
    apuntarConsumo({ t: new Date().toISOString(), usuario: usuario?.email || null, modelo: modeloUsado, ...uso, coste_usd: coste, ms: Date.now() - inicio });
    emitir({ t: 'fin', uso: { ...uso, modelo: modeloUsado, coste_usd: coste } });
}

function configuracion() {
    return { disponible: !!process.env.ANTHROPIC_API_KEY, modelo: MODELO, esfuerzo: ESFUERZO, tareas: Object.fromEntries(Object.entries(TAREAS).map(([k, v]) => [k, v.etiqueta])) };
}

module.exports = { conversar, encargar, configuracion, buscarEnManual, describirPantalla, HERRAMIENTAS, TAREAS, _resolverReferencia: resolverReferencia, _notaPantalla: notaPantalla };
