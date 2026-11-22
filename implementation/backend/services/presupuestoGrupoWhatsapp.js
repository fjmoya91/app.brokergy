// =============================================================================
// presupuestoGrupoWhatsapp — el agente de PRESUPUESTOS del grupo de WhatsApp del
// instalador (22/11/2026, Fran: beta con RCA, grupo «RCA - BROKERGY»).
//
// El instalador escribe (o manda un audio) en el grupo que comparte con BROKERGY:
// «hazme un presupuesto para Antonio González, aerotermia Panasonic de 9 kW, 9.200
// más IVA». La app le contesta EN EL GRUPO con el PDF (con, de pie, el mensaje para
// que lo reenvíe a su cliente) y una burbuja para él. Si lo pide, la simulación del
// bono CAE: confirmando antes la VIVIENDA con la foto de la fachada del Catastro, y
// encargándosela al Claude del WhatsApp de Fran con un texto que compone el CÓDIGO.
//
// Cómo va:
//  1. El listener (`whatsappService.onMessage`) solo mira los GRUPOS de
//     `PRESUPUESTO_WA_GRUPOS` y, en ellos, a los AUTORES autorizados (teléfonos de la
//     ficha del instalador y `PRESUPUESTO_WA_PROBADORES`). Lo nuestro y lo de otros
//     miembros se ignora en silencio. Un audio se transcribe (Gemini).
//  2. FILTRO BARATO antes de gastar un modelo: un pedido ABIERTO de ese autor movido
//     en la última hora, o el texto habla de presupuesto / simulación / bono / CAE /
//     propuesta. Si no, nada. Se espera a que la RÁFAGA calle y cada mensaje se trata
//     UNA vez (memoria + columna `mensajes` del pedido).
//  3. EL CEREBRO solo EXTRAE (`presupuestoPedidoCerebro`). LA CONVERSACIÓN la lleva el
//     CÓDIGO: una máquina de estados sobre `instalador_wa_pedidos` (una fila ABIERTA por
//     grupo + autor; caduca a las 24 h).
//
// SALVAGUARDAS:
//  - Solo se escribe al chatId del GRUPO configurado (jamás a un número de un mensaje).
//  - Franja de la casa (`utils/horarioWhatsapp`, regla 205): fuera, se programa.
//  - `PRESUPUESTO_WA_MODO=copia` (por defecto): no se escribe en el grupo NI se guarda
//    nada (ni cliente, ni presupuesto, ni encargo): se compone igual, se apunta en el log
//    y se le copia a Fran a su canal. `real` para escribir.
//  - Tope diario de presupuestos por grupo (`PRESUPUESTO_WA_TOPE_DIA`, 20).
//  - Un fallo del cerebro o de la BD → UN «Ahora mismo no puedo hacerlo…» y aviso al
//    equipo, nunca un presupuesto a medias.
//  - Los envíos, por `sendText`/`sendMedia` de whatsappService (marcarPropio + ACK).
//  - Sin emojis, de tú, frases cortas.
//
// `procesar({ chatId, autorTel, mensajes, ahora, deps })` es el motor y se puede correr
// SIN WhatsApp (pruebas: scripts/test_presupuesto_grupo_whatsapp.js; banco con el
// cerebro real: scripts/probar_presupuesto_wa.js).
// =============================================================================

const path = require('path');
const { pathToFileURL } = require('url');
const horario = require('../utils/horarioWhatsapp');

// ─── Configuración (se lee cada vez: las pruebas la cambian) ────────────────
const num = (v, d) => { const n = Number(v); return v !== '' && v != null && Number.isFinite(n) && n >= 0 ? n : d; };
const ult9 = (t) => { const d = String(t || '').replace(/@.*/, '').replace(/\D/g, ''); return d.length >= 9 ? d.slice(-9) : null; };

function config(env = process.env) {
    const grupos = new Map();
    for (const par of String(env.PRESUPUESTO_WA_GRUPOS || '').split(/[;\n]+/)) {
        const [chat, emp] = par.split('=').map(s => String(s || '').trim());
        if (/@g\.us$/.test(chat) && /^[0-9a-f-]{36}$/i.test(emp)) grupos.set(chat, emp);
    }
    return {
        activo: env.PRESUPUESTO_WA_ENABLED === 'true',
        modo: env.PRESUPUESTO_WA_MODO === 'real' ? 'real' : 'copia',
        grupos,
        probadores: new Set(String(env.PRESUPUESTO_WA_PROBADORES || '').split(/[,;\s]+/).map(ult9).filter(Boolean)),
        soloProbadores: env.PRESUPUESTO_WA_SOLO_PROBADORES === 'true',
        topeDia: num(env.PRESUPUESTO_WA_TOPE_DIA, 20),
        rafagaMs: num(env.PRESUPUESTO_WA_RAFAGA_S, 8) * 1000,
        copiaA: env.PRESUPUESTO_WA_COPIA_A || env.ASISTENTE_WHATSAPP_GRUPO || null,
        avisosA: env.PRESUPUESTO_WA_AVISOS_A || env.WHATSAPP_ADMIN_CHAT || env.ASISTENTE_WHATSAPP_GRUPO || null,
    };
}

const ABIERTO_MIN = 60;            // un pedido movido en la última hora: lo que diga es la respuesta
const CADUCA_H = 24;
const PALABRAS = /\b(presupuest\w*|pptos?|presus?|simulaci\w*|simula\w*|bono|cae|propuesta)\b/i;

const MSG = {
    cliente: '¿Para qué cliente es? Dime nombre y apellidos, teléfono y la dirección de la obra (y el DNI si lo tienes).',
    fallo: 'Ahora mismo no puedo hacerlo, te lo hacemos nosotros en un rato.',
    cancelar: 'Vale, lo dejo.',
    direccion: '¿En qué dirección es la obra? Dime calle, número y municipio.',
    noEncuentro: 'No encuentro esa dirección en el Catastro. Pásame la referencia catastral o la dirección completa con el municipio.',
    numeroCorrecto: 'Dime el número correcto de la calle o pásame la referencia catastral.',
    caldera: '¿Qué caldera tiene ahora la casa: gasóleo, gas natural, propano, eléctrica, leña, pellets o no tiene?',
    audio: 'No he podido escuchar el audio. ¿Me lo mandas otra vez o me lo escribes?',
    confirmada: 'Vivienda confirmada. Ya lo tenemos en BROKERGY para calcular el bono; en cuanto esté te pasamos la propuesta para tu cliente.',
};

// ─── La lógica pura del presupuesto (ESM, la misma que la app) ───────────────
let _logica = null;
function logica() {
    if (!_logica) _logica = import(pathToFileURL(path.join(__dirname, '../../frontend/src/features/instalador/logic/presupuesto.js')).href);
    return _logica;
}

const limpio = (v) => (v === null || v === undefined ? '' : String(v).replace(/[\u0000-\u001f\u007f`]+/g, ' ').replace(/\s+/g, ' ').trim());
const idDe = (c) => c?.id_cliente ?? c?.id ?? null;
const nombreDe = (c) => limpio([c?.nombre || c?.nombre_razon_social, c?.apellidos].filter(Boolean).join(' '));
const titulo = (s) => limpio(s).toLowerCase().replace(/(^|[\s-])([a-záéíóúñü])/g, (m, a, b) => a + b.toUpperCase());
const mascara = (t) => { const d = String(t || '').replace(/\D/g, ''); return d.length >= 3 ? `···${d.slice(-3)}` : ''; };
const hoy = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(d);
const eleccionDe = (txt) => { const m = /^\s*(?:el|la|opci[oó]n|n[uú]mero|n[ºo°])?\s*(\d{1,2})\s*[.)ºª]?\s*$/i.exec(String(txt || '')); return m ? Number(m[1]) : null; };

// ─── El estado del pedido (puro) ─────────────────────────────────────────────

/** Mezcla lo extraído en lo que ya se sabía: lo dicho ahora MANDA; lo no dicho no borra. Pura. */
function fusionar(p, ext) {
    const n = JSON.parse(JSON.stringify(p || {}));
    n.cliente = n.cliente || {};
    for (const [k, v] of Object.entries(ext.cliente || {})) if (v) n.cliente[k] = v;
    n.obra = n.obra || {};
    const o = ext.obra || {};
    if (o.tipo === 'aerotermia_acs') { n.obra.tipo = 'aerotermia'; n.obra.acs = true; } else if (o.tipo) n.obra.tipo = o.tipo;
    const eq = o.equipo || {};
    n.obra.equipo = { ...(n.obra.equipo || {}) };
    for (const k of ['marca', 'modelo', 'potencia_kw']) if (eq[k] !== null && eq[k] !== undefined) n.obra.equipo[k] = eq[k];
    if (o.caldera?.combustible) n.obra.caldera = { combustible: o.caldera.combustible };
    if (o.acs === true || o.acs === false) n.obra.acs = o.acs;
    if (o.emisor) n.obra.emisor = o.emisor;
    for (const k of ['direccion', 'municipio', 'descripcion']) if (o[k]) n.obra[k] = o[k];
    if ((o.extras || []).length || (o.extras_quitar || []).length) {
        const lista = Array.isArray(n.obra.extras) ? n.obra.extras.filter(Boolean) : [];
        for (const e of o.extras || []) {
            const i = lista.findIndex(x => x.clave === e.clave);
            if (i >= 0) lista[i] = { ...lista[i], ...e }; else lista.push(e);
        }
        n.obra.extras = lista.filter(x => !(o.extras_quitar || []).some(q => q.clave === x.clave));
        n.quitados = [...new Set([...(n.quitados || []), ...(o.extras_quitar || []).map(q => q.clave)])]
            .filter(k => !(o.extras || []).some(e => e.clave === k));
    }
    if (ext.importe !== null && ext.importe !== undefined) { n.importe = ext.importe; n.con_iva = !!ext.con_iva; }
    if (['simulacion', 'ambos'].includes(ext.quiere)) n.quiere_sim = true;
    return n;
}

/** ¿Ha dicho algo que sirva? Pura. */
function hayAlgo(ext) {
    if (!ext) return false;
    if (ext.quiere !== 'nada') return true;
    const o = ext.obra || {};
    return Object.values(ext.cliente || {}).some(Boolean) || !!o.tipo || Object.values(o.equipo || {}).some(v => v !== null)
        || !!o.caldera?.combustible || o.acs !== null || !!o.emisor || (o.extras || []).length > 0 || (o.extras_quitar || []).length > 0
        || !!o.direccion || !!o.descripcion || ext.importe !== null || !!ext.respuesta_vivienda || !!ext.eleccion
        || !!ext.numero_otro || !!ext.referencia_catastral;
}

/** Lo que falta de la OBRA para hacer el presupuesto, en una frase. Pura. */
function faltaObra(p) {
    const o = p.obra || {};
    const falta = [];
    if (!o.tipo) falta.push('qué obra es (cambio de caldera por aerotermia, solo agua caliente, aire acondicionado u otra)');
    else if (o.tipo === 'otro' && !o.descripcion) falta.push('qué incluye la obra');
    if (!(p.importe > 0)) falta.push('el precio (y si es con el IVA incluido o más IVA)');
    return falta.length ? `Para hacerlo me falta ${falta.join(' y ')}.` : null;
}

/** Si no dice el tipo pero sí un equipo o la caldera que se quita, es una aerotermia (lo decide la casa). Pura. */
function conTipoPorDefecto(p) {
    const o = p.obra || {};
    if (!o.tipo && (o.equipo?.marca || o.equipo?.modelo || o.caldera?.combustible)) return { ...p, obra: { ...o, tipo: 'aerotermia' } };
    return p;
}

/** Lo que se le pasa al cerebro como «pedido en curso»: lo que sabemos y qué le preguntamos. Pura. */
function resumenParaCerebro(fila) {
    if (!fila) return null;
    const p = fila.pedido || {};
    return {
        cliente: p.cliente || null,
        obra: p.obra || null,
        importe: p.importe ?? null,
        con_iva: p.con_iva ?? null,
        presupuesto_hecho: p.presupuesto ? p.presupuesto.numero : null,
        le_hemos_preguntado: fila.espera ? `${fila.espera}${p.pregunta ? ` (${p.pregunta})` : ''}` : (p.pregunta || null),
        lista_numerada: p.lista ? p.lista.map((x, i) => `${i + 1}) ${x}`) : null,
    };
}

/** La entrada del servicio de presupuestos. Pura. */
function entradaDe(p, opciones, ahora) {
    const o = p.obra || {};
    const obra = {
        tipo: o.tipo,
        direccion: o.direccion || p.cliente?.direccion || '',
        codigo_postal: o.codigo_postal || p.cliente?.codigo_postal || '',
        municipio: o.municipio || p.cliente?.municipio || '',
        provincia: o.provincia || p.cliente?.provincia || '',
        equipo: { aerotermia_id: null, marca: o.equipo?.marca || '', modelo: o.equipo?.modelo || '', potencia_kw: o.equipo?.potencia_kw ?? null },
        caldera: { combustible: o.caldera?.combustible || null },
        acs: o.acs === true,
        emisor: o.emisor || 'radiadores',
        extras: o.extras || [],
        descripcion: o.descripcion || '',
        ...(p.vivienda?.rc ? { ref_catastral: p.vivienda.rc } : {}),
    };
    return {
        numero: p.presupuesto?.numero || opciones?.numero,
        fecha: p.presupuesto?.fecha || opciones?.fecha || hoy(ahora),
        ...(p.cliente_id ? { cliente_id: p.cliente_id } : { cliente: { ...p.cliente } }),
        obra,
        modo: 'total',
        total: String(p.importe),
        con_iva: !!p.con_iva,
        iva_pct: opciones?.iva_pct ?? 21,
        notas: opciones?.notas ?? '',
        validez_dias: opciones?.validez_dias ?? 30,
    };
}

/** La burbuja para el instalador tras el PDF. Pura. */
function burbuja(fila, { eur, actualizado = false, conSimulacion = false }) {
    const quien = titulo(nombreDe(fila.cliente)) || 'tu cliente';
    const cifras = `${eur(fila.base)} + IVA = ${eur(fila.total)}`;
    return [
        `Presupuesto ${fila.numero} ${actualizado ? 'actualizado ' : ''}para ${quien}: ${cifras}.`,
        'Reenvíaselo tal cual.',
        'Si quieres cambiar algo, dímelo aquí («ponle 9.500», «añade depósito de inercia») o cámbialo en la app.',
        conSimulacion ? 'Ahora miro la vivienda para calcular el bono CAE.' : (actualizado ? null : '¿Te calculo también el bono CAE de esta obra?'),
    ].filter(Boolean).join(' ');
}

/**
 * El ENCARGO de la simulación para el Claude del WhatsApp de Fran (`/tarea`). Lo compone el
 * CÓDIGO con lo de la BD y con campos cortos ya validados: NUNCA el texto libre del instalador.
 * Pura.
 */
function textoSimulacion({ partner, cliente, vivienda, obra, presupuesto, eur, combustibles }) {
    const s = (v, n = 120) => limpio(v).replace(/["'$\\]/g, '').slice(0, n);
    const comb = (combustibles || []).find(c => c.clave === obra?.caldera?.combustible);
    const acs = obra?.acs === true ? 'sí, la aerotermia da también el agua caliente' : 'no lo ha dicho: sin ACS (regla 163)';
    const eq = obra?.equipo || {};
    return [
        'SIMULACIÓN PEDIDA POR UN INSTALADOR desde su grupo de WhatsApp (la ha preparado el agente de presupuestos; este texto lo compone el código, no el instalador).',
        `- Partner: ${s(partner.nombre)} (id_empresa ${s(partner.id, 40)}).`,
        `- Cliente: ${s(nombreDe(cliente))}${cliente?.dni || cliente?.nif ? ` · DNI ${s(cliente.dni || cliente.nif, 12)}` : ''}${cliente?.tlf ? ` · tlf ${s(cliente.tlf, 16)}` : ''}${cliente?.direccion ? ` · ${s(cliente.direccion)}${cliente.municipio ? `, ${s(cliente.municipio, 60)}` : ''}` : ''}.`,
        `- Vivienda CONFIRMADA por el instalador con la foto del Catastro: RC ${s(vivienda.rc, 20)} (${s(vivienda.direccion)}${vivienda.municipio ? `, ${s(vivienda.municipio, 60)}` : ''}).`,
        `- Caldera que se quita: ${comb ? comb.texto.toLowerCase() : 'no la ha dicho'}. Emisor: ${s(obra?.emisor || 'radiadores', 20)}. ACS: ${acs}.`,
        `- Aerotermia: ${[s(eq.marca, 60), s(eq.modelo, 60)].filter(Boolean).join(' ') || 'sin marca ni modelo'}${eq.potencia_kw ? ` de ${eq.potencia_kw} kW` : ''}.`,
        `- Presupuesto ${s(presupuesto.numero, 20)} (id ${s(presupuesto.id, 40)}): ${eur(presupuesto.total)} con IVA (${eur(presupuesto.base)} + IVA).`,
        '',
        `Hazlo con la skill alta-oportunidad: plan con esa "rc", la caldera, el partner, el cliente y "presupuesto": { "importe_con_iva": ${Number(presupuesto.total) || 0} }; primero en seco y luego --escribir. Si la RC ya tiene oportunidad, no crees otra.`,
        `Al terminar, liga el presupuesto a la oportunidad: \`node scripts/presupuesto_instalador_cli.js vincular ${s(presupuesto.id, 40)} <id_oportunidad> --escribir\`.`,
        'Después, el aviso de siempre a Fran con el resumen (`node scripts/asistente_whatsapp.js avisar <OP> --a partner --enviar`). La propuesta NO se envía sin su «sí» para esa oportunidad. Al instalador no le escribas: ya le hemos dicho que lo calculamos.',
    ].join('\n');
}

// ─── El motor ────────────────────────────────────────────────────────────────

/**
 * Un turno de la conversación: los mensajes (ya en texto) de UN autor en UN grupo.
 *
 * deps (todas inyectables):
 *   cerebro.extraer({ mensajes, pedido, catalogos }) → { ok, datos }
 *   presupuestos: { opcionesNuevo, resolverCliente, crear, actualizar, pdfDe }
 *   vivienda: { candidatos, porRc, fachada, describir, cambiarNumero }
 *   oportunidadesDeLaRc(rc) → []
 *   pedirTarea({ texto, clave }) → { ok, motivo? }
 *   enviar: { texto(chatId, t), documento(chatId, { buffer, filename, mimetype }, { caption, textoDespues }),
 *             imagen(chatId, { buffer, filename, mimetype }, { caption }) }
 *   copiar(texto)          — a Fran, en modo copia
 *   avisarEquipo(texto)
 *   pedidos: { abierto(chatId, autor), crear(fila), guardar(id, cambios), presupuestosHoy(chatId) }
 *   vistos: Set            — ids ya tratados (memoria del proceso)
 *   prescriptor: { id, nombre } (opcional; si no, de opcionesNuevo)
 *   cfg: lo de `config()`
 *
 * @returns {Promise<object>} lo que ha pasado (para el log, las pruebas y el banco)
 */
async function procesar({ chatId, autorTel, mensajes = [], ahora = new Date(), deps = {} }) {
    const cfg = deps.cfg || config();
    const L = deps.logica || await logica();
    const out = { enviados: [], copias: [], avisos: [], encargo: null, extraccion: null };
    const prescriptorId = cfg.grupos.get(chatId);
    if (!prescriptorId) return { ...out, ignorado: 'grupo no configurado' };
    const autor = ult9(autorTel);
    if (!autor) return { ...out, ignorado: 'autor sin teléfono' };
    if (deps.autorizado) {
        let ok = false;
        try { ok = await deps.autorizado(prescriptorId, autor); } catch { ok = false; }   // sin poder comprobarlo, no
        if (!ok) return { ...out, ignorado: 'autor no autorizado' };
    }

    // Lo ya tratado, fuera (memoria del proceso; luego, la columna del pedido).
    const vistos = deps.vistos || new Set();
    let nuevos = mensajes.filter(m => m && m.id && !vistos.has(m.id) && limpio(m.texto));
    if (!nuevos.length) return { ...out, ignorado: 'ya tratado' };

    if (!horario.puedeContestar(ahora)) {
        return { ...out, programado: horario.siguienteApertura(ahora).toISOString() };
    }

    // Enviar: SOLO al grupo configurado, y en copia, a nadie de fuera.
    const enviar = async (tipo, contenido, opts = {}) => {
        if (!cfg.grupos.has(chatId)) throw new Error('destino no permitido');
        const registro = { tipo, chatId, texto: tipo === 'texto' ? contenido : opts.caption || null, despues: opts.textoDespues || null, archivo: contenido?.filename || null };
        out.enviados.push(registro);
        if (cfg.modo !== 'real') {
            registro.copia = true;
            const t = [
                `*Presupuesto por WhatsApp (modo copia) · grupo ${chatId}*`,
                'Le mandaría al grupo:',
                ...(registro.archivo ? [`[${tipo === 'documento' ? 'PDF' : 'foto'} ${registro.archivo}]`] : []),
                ...[registro.texto, registro.despues].filter(Boolean).map(x => String(x).split('\n').map(l => `> ${l}`).join('\n')),
            ].join('\n');
            console.log('[presupuesto-wa]', t);
            out.copias.push(t);
            if (deps.copiar) await deps.copiar(t).catch(e => console.warn('[presupuesto-wa] copia a Fran:', e.message));
            // El PDF y la foto también le llegan a Fran (solo a SU chat de copias), para verlos de verdad.
            if (registro.archivo && deps.copiarArchivo) {
                await deps.copiarArchivo(tipo, contenido, opts).catch(e => console.warn('[presupuesto-wa] copia del archivo a Fran:', e.message));
            }
            return;
        }
        if (tipo === 'texto') await deps.enviar.texto(chatId, contenido);
        else if (tipo === 'documento') await deps.enviar.documento(chatId, contenido, opts);
        else await deps.enviar.imagen(chatId, contenido, opts);
    };
    const decir = (t) => enviar('texto', t);
    const avisar = async (t) => {
        out.avisos.push(t);
        if (deps.avisarEquipo) await deps.avisarEquipo(t).catch(e => console.warn('[presupuesto-wa] aviso al equipo:', e.message));
    };

    let fila = null;
    try {
        fila = await deps.pedidos.abierto(chatId, autor);
        if (fila && ahora - new Date(fila.created_at) > CADUCA_H * 3_600_000) {
            await deps.pedidos.guardar(fila.id, { estado: 'CADUCADO' });
            fila = null;
        }
    } catch (e) {
        // Sin BD no se puede ni saber si es la respuesta a algo: solo si pide un presupuesto, el «no puedo».
        if (nuevos.some(m => PALABRAS.test(m.texto))) return fallo(`no he podido leer el pedido (${e.message})`);
        return { ...out, ignorado: 'BD caída y sin palabras clave' };
    }
    const tratadosFila = new Set(fila?.mensajes || []);
    nuevos = nuevos.filter(m => !tratadosFila.has(m.id));
    if (!nuevos.length) return { ...out, ignorado: 'ya tratado' };

    // FILTRO BARATO: es la respuesta a lo que le preguntamos, o habla de presupuestos.
    const reciente = fila && (ahora - new Date(fila.updated_at || fila.created_at)) <= ABIERTO_MIN * 60_000;
    if (!reciente && !nuevos.some(m => PALABRAS.test(m.texto))) {
        return { ...out, ignorado: 'sin palabras clave ni pedido abierto' };
    }
    for (const m of nuevos) vistos.add(m.id);
    const ids = nuevos.map(m => m.id);

    async function fallo(motivo) {
        const p = fila?.pedido || {};
        const yaAvisado = p.fallo_at && (ahora - new Date(p.fallo_at)) < 3_600_000;
        if (!yaAvisado) {
            await decir(MSG.fallo).catch(() => {});
            await avisar(`Presupuesto por WhatsApp: no he podido atender al instalador del grupo ${chatId} (···${autor.slice(-3)}). Motivo: ${motivo}. Hay que hacérselo a mano.`);
            if (fila) await deps.pedidos.guardar(fila.id, { pedido: { ...p, fallo_at: ahora.toISOString() } }).catch(() => {});
        }
        return { ...out, fallo: motivo, estado: fila?.estado || null };
    }

    // EL CEREBRO: solo extrae.
    const catalogos = { TIPOS_OBRA: L.TIPOS_OBRA, COMBUSTIBLES: L.COMBUSTIBLES, EMISORES: L.EMISORES, EXTRAS: L.EXTRAS.map(e => ({ clave: e.clave, etiqueta: e.etiqueta, litros: e.litros || null })) };
    const r = await deps.cerebro.extraer({ mensajes: nuevos, pedido: resumenParaCerebro(fila), catalogos });
    if (!r?.ok) return fallo(`el cerebro ha fallado (${r?.error || 'sin respuesta'})`);
    const ext = r.datos;
    out.extraccion = ext;
    if (!ext.eleccion && nuevos.length === 1) ext.eleccion = eleccionDe(nuevos[0].texto);

    if (!fila && (ext.quiere === 'nada' || ext.quiere === 'cancelar' || ext.quiere === 'confirmar')) {
        return { ...out, ignorado: 'nada que hacer' };
    }
    if (fila && !hayAlgo(ext)) {
        await deps.pedidos.guardar(fila.id, { mensajes: [...tratadosFila, ...ids].slice(-200), updated_at: ahora.toISOString() }).catch(() => {});
        return { ...out, ignorado: 'nada nuevo', estado: fila.estado };
    }

    // Un presupuesto NUEVO para OTRO cliente cuando el de este pedido ya está hecho: pedido nuevo.
    if (fila?.pedido?.presupuesto && ['presupuesto', 'ambos'].includes(ext.quiere) && ext.cliente?.nombre
        && limpio(ext.cliente.nombre).toLowerCase() !== limpio(fila.pedido.cliente?.nombre || fila.pedido.cliente?.nombre_razon_social).toLowerCase()) {
        await deps.pedidos.guardar(fila.id, { estado: 'HECHO' }).catch(() => {});
        fila = null;
    }

    try {
        if (!fila) {
            fila = await deps.pedidos.crear({ chat_id: chatId, autor, prescriptor_id: prescriptorId, estado: 'ABIERTO', espera: null, pedido: {}, mensajes: [], created_at: ahora.toISOString(), updated_at: ahora.toISOString() });
        }
    } catch (e) {
        return fallo(`no he podido apuntar el pedido (${e.message})`);
    }

    let p = fusionar(fila.pedido, ext);
    let espera = fila.espera || null;
    let estado = 'ABIERTO';
    let presupuestoId = fila.presupuesto_id || p.presupuesto?.id || null;
    const guardar = async () => {
        fila.pedido = p; fila.espera = espera; fila.estado = estado;
        await deps.pedidos.guardar(fila.id, {
            pedido: p, espera, estado, presupuesto_id: cfg.modo === 'real' ? presupuestoId : null,
            mensajes: [...tratadosFila, ...ids].slice(-200), updated_at: ahora.toISOString(),
        });
    };
    const preguntar = async (t, e, extra = {}) => { espera = e; Object.assign(p, extra); await guardar(); await decir(t); return { ...out, estado, espera }; };
    // En COPIA no se guarda nada: ni cliente, ni presupuesto (no se gasta número). Se calcula y se
    // compone igual, para que Fran vea lo que habría salido.
    const S = cfg.modo === 'real' || deps.presupuestos?.sinGuardar ? deps.presupuestos : servicioSinGuardar(deps.presupuestos, L);
    if (!S) return fallo('el servicio de presupuestos no está en este servidor');
    const opciones = async () => (p.opciones ||= await S.opcionesNuevo({ prescriptorId }).then(o => ({
        numero: o.numero, fecha: o.fecha, iva_pct: o.iva_pct, notas: o.notas, validez_dias: o.validez_dias, emisor: o.emisor?.nombre || null,
    })));

    try {
        if (ext.quiere === 'cancelar') {
            estado = 'CANCELADO'; espera = null;
            await guardar(); await decir(MSG.cancelar);
            return { ...out, estado };
        }

        // ── 1. El PRESUPUESTO ────────────────────────────────────────────────
        if (!p.presupuesto) {
            // 1a. El CLIENTE, antes de nada.
            if (!p.cliente_id && !p.cliente_listo) {
                if (espera === 'cliente' && p.candidatos?.length && ext.eleccion) {
                    const c = p.candidatos[ext.eleccion - 1];
                    if (!c) return preguntar(`Dime un número del 1 al ${p.candidatos.length}, o su DNI o teléfono si es otro.`, 'cliente');
                    const rc = await S.resolverCliente({ prescriptorId, clienteId: c.id });
                    p.cliente_id = idDe(rc.cliente) || c.id; p.cliente = { ...p.cliente, ...soloDatos(rc.cliente) };
                    delete p.candidatos; delete p.lista;
                } else {
                    const c = p.cliente || {};
                    if (!c.nombre) return preguntar(MSG.cliente, 'cliente');
                    if (!c.tlf && !c.direccion && !c.dni) return preguntar(`Me falta el teléfono o la dirección de ${titulo(nombreDe(c))} para darlo de alta.`, 'cliente');
                    const rc = await S.resolverCliente({ prescriptorId, cliente: c });
                    if (rc.candidatos?.length > 1) {
                        p.candidatos = rc.candidatos.slice(0, 9).map(x => ({ id: idDe(x), nombre: nombreDe(x), municipio: x.municipio || null, tlf: mascara(x.tlf) }));
                        p.lista = p.candidatos.map(x => `${titulo(x.nombre)}${x.municipio ? ` (${titulo(x.municipio)}${x.tlf ? `, ${x.tlf}` : ''})` : x.tlf ? ` (${x.tlf})` : ''}`);
                        return preguntar(`Tengo varios clientes con ese nombre:\n${p.lista.map((x, i) => `${i + 1}) ${x}`).join('\n')}\n¿Cuál es? Contesta con el número, o dime su DNI o teléfono si es otro.`, 'cliente');
                    }
                    p.cliente_id = idDe(rc.cliente);
                    p.cliente = { ...c, ...soloDatos(rc.cliente) };
                    p.cliente_creado = !!rc.creado;
                    if (!p.cliente_id) p.cliente_listo = true;      // sin guardar (modo copia / banco): con los datos tal cual
                }
                espera = null;
            }

            // 1b. La OBRA y el IMPORTE, de una vez.
            p = conTipoPorDefecto(p);
            const falta = faltaObra(p);
            if (falta) return preguntar(falta, !p.obra?.tipo ? 'obra' : 'importe');
            // Lo que va marcado por defecto (retirar la caldera en una sustitución) + lo que ha dicho,
            // salvo lo que haya pedido quitar.
            const dichos = p.obra.extras || [];
            p.obra.extras = [...dichos, ...L.extrasPorDefecto(p.obra)
                .filter(d => !dichos.some(x => x.clave === d.clave) && !(p.quitados || []).includes(d.clave))];

            // 1c. Tope diario.
            const hechos = await deps.pedidos.presupuestosHoy(chatId);
            if (hechos >= cfg.topeDia) {
                estado = 'HECHO'; espera = null; await guardar();
                await decir('Hoy ya llevamos muchos presupuestos por aquí; este te lo hacemos nosotros en un rato.');
                await avisar(`Presupuesto por WhatsApp: el grupo ${chatId} ha llegado al tope del día (${cfg.topeDia}). Hay que hacer este a mano: ${titulo(nombreDe(p.cliente))}, ${L.eur(p.importe)}${p.con_iva ? ' con IVA' : ' + IVA'}.`);
                return { ...out, estado, tope: true };
            }

            // 1d. Se CREA, se compone el PDF y va al grupo.
            const op = await opciones();
            let entrada = entradaDe(p, op, ahora);
            let filaP;
            try {
                filaP = await S.crear({ prescriptorId, usuarioId: null, origen: 'whatsapp', entrada });
            } catch (e) {
                if (e.status === 409 && e.code === 'NUMERO_REPETIDO' && e.sugerido) {
                    entrada = { ...entrada, numero: e.sugerido };
                    filaP = await S.crear({ prescriptorId, usuarioId: null, origen: 'whatsapp', entrada });
                } else throw e;
            }
            const { buffer } = await S.pdfDe(prescriptorId, filaP);
            p.presupuesto = { id: filaP.id, numero: filaP.numero, fecha: filaP.fecha, at: ahora.toISOString(), base: filaP.base, total: filaP.total };
            p.entrada = entrada;
            presupuestoId = filaP.id;
            p.pregunta = p.quiere_sim ? null : 'bono';
            espera = null;
            await guardar();
            await enviarPdf(filaP, buffer, { conSimulacion: !!p.quiere_sim });
            if (!p.quiere_sim) return { ...out, estado, presupuesto: filaP };
        } else if (ext.quiere === 'cambiar' || (!espera && !p.simulacion_pedida && cambiaElPresupuesto(ext))) {
            // ── 5. CAMBIAR el presupuesto reciente (mismo nº) ──────────────────
            if (ahora - new Date(p.presupuesto.at) > CADUCA_H * 3_600_000) {
                return preguntar('Ese presupuesto ya tiene más de un día: cámbialo en la app, o pídeme uno nuevo.', null);
            }
            const op = await opciones();
            const entrada = { ...entradaDe(p, op, ahora), numero: p.presupuesto.numero, fecha: p.presupuesto.fecha };
            const filaP = await S.actualizar({ prescriptorId, id: p.presupuesto.id, entrada });
            const { buffer } = await S.pdfDe(prescriptorId, filaP);
            p.presupuesto = { ...p.presupuesto, base: filaP.base, total: filaP.total, at: ahora.toISOString() };
            p.entrada = entrada;
            await guardar();
            await enviarPdf(filaP, buffer, { actualizado: true });
            return { ...out, estado, presupuesto: filaP, actualizado: true };
        }

        // ── 2. La SIMULACIÓN ────────────────────────────────────────────────
        if (p.pregunta === 'bono' && !p.quiere_sim) {
            const si = ['confirmar', 'simulacion', 'ambos'].includes(ext.quiere) || ext.respuesta_vivienda === 'si';
            if (!si) {
                if (ext.respuesta_vivienda === 'no') { p.pregunta = null; await guardar(); await decir('Vale.'); }
                else await guardar();
                return { ...out, estado };
            }
            p.quiere_sim = true;
        }
        if (!p.quiere_sim) { await guardar(); return { ...out, estado }; }
        p.pregunta = null;
        return await pasoVivienda();
    } catch (e) {
        return fallo(String(e.message || e).slice(0, 200));
    }

    // ── helpers con el contexto del turno ───────────────────────────────────
    async function enviarPdf(filaP, buffer, { actualizado = false, conSimulacion = false } = {}) {
        const op = await opciones();
        const caption = L.mensajeParaCliente({ cliente: filaP.cliente, obra: filaP.obra, total: filaP.total, emisor: op.emisor || deps.prescriptor?.nombre || '' });
        const nombreFich = `Presupuesto ${String(filaP.numero).replace(/\//g, '-')} - ${titulo(nombreDe(filaP.cliente)) || 'Cliente'}.pdf`.replace(/[\\:*?"<>|]/g, '');
        await enviar('documento', { buffer, filename: nombreFich, mimetype: 'application/pdf' }, {
            caption, textoDespues: burbuja(filaP, { eur: L.eur, actualizado, conSimulacion }),
        });
    }

    async function pasoVivienda() {
        const V = deps.vivienda;
        if (!p.vivienda?.confirmada) {
            const cands = p.viviendas || null;
            let elegida = null;
            if (espera === 'vivienda' && cands?.length) {
                if (ext.eleccion && cands[ext.eleccion - 1]) elegida = cands[ext.eleccion - 1];
                else if ((ext.respuesta_vivienda === 'si' || ext.quiere === 'confirmar') && cands.length === 1 && !ext.numero_otro && !ext.referencia_catastral) elegida = cands[0];
            }
            if (!elegida) {
                let res;
                const baseDir = p.vivienda_dir || p.obra?.direccion || p.cliente?.direccion || null;
                const muni = p.obra?.municipio || p.cliente?.municipio || null;
                if (ext.referencia_catastral) res = await V.porRc(ext.referencia_catastral);
                else if (ext.numero_otro && baseDir) { p.vivienda_dir = V.cambiarNumero(baseDir, ext.numero_otro); res = await V.candidatos({ direccion: p.vivienda_dir, municipio: muni, provincia: p.cliente?.provincia }); }
                else if (espera === 'vivienda' && cands?.length && ext.respuesta_vivienda === 'no') return preguntar(MSG.numeroCorrecto, 'vivienda');
                else if (espera === 'vivienda' && cands?.length) { await guardar(); return { ...out, estado, espera }; }
                else if (!baseDir) return preguntar(MSG.direccion, 'vivienda');
                else { p.vivienda_dir = baseDir; res = await V.candidatos({ direccion: baseDir, municipio: muni, provincia: p.cliente?.provincia }); }

                if (!res || res.tipo === 'ninguna') { p.viviendas = null; return preguntar(MSG.noEncuentro, 'vivienda'); }
                const foto = res.rcFachada ? await V.fachada(res.rcFachada) : null;
                let texto;
                if (res.tipo === 'una') {
                    p.viviendas = [res.vivienda];
                    texto = `Según el Catastro es ${V.describir(res.vivienda)}. ¿Es esta la casa? Contesta SÍ, o dime el número correcto o pásame la referencia catastral.`;
                } else {
                    p.viviendas = res.viviendas;
                    const donde = [res.direccion || res.viviendas[0].direccion, res.viviendas[0].municipio].filter(Boolean).join(', ');
                    texto = `Según el Catastro, en ${limpio(donde).replace(/\s+\d{5}\b.*$/, '')} hay ${res.viviendas.length} viviendas:\n`
                        + res.viviendas.map((v, i) => `${i + 1}) ${v.planta}${v.superficie ? ` · ${v.superficie} m²` : ''}`).join('\n')
                        + '\n¿Cuál es? Contesta con el número, o dime el número correcto de la calle o la referencia catastral.';
                }
                p.lista = p.viviendas.length > 1 ? p.viviendas.map(v => `${v.planta}${v.superficie ? ` · ${v.superficie} m²` : ''}`) : null;
                espera = 'vivienda';
                await guardar();
                if (foto) await enviar('imagen', { buffer: foto.buffer, mimetype: foto.mimetype, filename: `fachada_${res.rcFachada}.jpg` }, { caption: texto });
                else await decir(texto);
                return { ...out, estado, espera, candidatos: p.viviendas };
            }
            p.vivienda = { ...elegida, confirmada: true };
            delete p.viviendas; delete p.lista;
            espera = null;
            // ¿Esa casa ya la tenemos? Entonces no se duplica.
            const previas = await deps.oportunidadesDeLaRc(p.vivienda.rc);
            if (previas?.length) {
                const ops = previas.slice(0, 3).map(o => o.id_oportunidad).filter(Boolean).join(', ');
                estado = 'HECHO'; await guardar();
                await decir(`Esa casa ya la tenemos calculada (${ops}). La miramos y te decimos.`);
                await avisar(`Presupuesto por WhatsApp: el instalador del grupo ${chatId} ha pedido el bono de una vivienda que YA tiene oportunidad (${ops}, RC ${p.vivienda.rc}). Presupuesto ${p.presupuesto.numero} (id ${p.presupuesto.id}). No se ha encargado otra simulación; mira si hay que ligarlo: node scripts/presupuesto_instalador_cli.js vincular ${p.presupuesto.id} <id_oportunidad> --escribir`);
                return { ...out, estado, duplicada: previas };
            }
        }
        // La caldera que se quita (para el bono hace falta).
        if ((p.obra?.tipo || 'aerotermia') === 'aerotermia' && !p.obra?.caldera?.combustible) return preguntar(MSG.caldera, 'caldera');

        // Vivienda confirmada: se apunta en el presupuesto y se ENCARGA.
        const op = await opciones();
        const entrada = {
            ...entradaDe(p, op, ahora), numero: p.presupuesto.numero, fecha: p.presupuesto.fecha,
            simulacion: { estado: 'PEDIDA', por: 'whatsapp', rc: p.vivienda.rc, direccion_catastro: V_desc(p.vivienda), pedida_at: ahora.toISOString() },
        };
        const filaP = await S.actualizar({ prescriptorId, id: p.presupuesto.id, entrada });
        const texto = textoSimulacion({
            partner: { id: prescriptorId, nombre: op.emisor || deps.prescriptor?.nombre || prescriptorId },
            cliente: { ...(filaP?.cliente || {}), ...p.cliente }, vivienda: p.vivienda, obra: p.obra,
            presupuesto: { id: p.presupuesto.id, numero: p.presupuesto.numero, base: filaP?.base ?? p.presupuesto.base, total: filaP?.total ?? p.presupuesto.total },
            eur: L.eur, combustibles: L.COMBUSTIBLES,
        });
        out.encargo = { texto, clave: `sim-ppto:${p.presupuesto.id}`, ok: false };
        if (cfg.modo === 'real') {
            const t = await deps.pedirTarea({ texto, clave: out.encargo.clave });
            out.encargo.ok = !!t?.ok; out.encargo.motivo = t?.motivo || null;
            if (!t?.ok) await avisar(`Presupuesto por WhatsApp: no he podido encargar la simulación (${t?.motivo || 'sin respuesta'}). Hay que hacerla a mano con esto:\n${texto}`);
        } else {
            out.encargo.motivo = 'modo copia: no se encarga';
            out.copias.push(`Encargaría al asistente:\n${texto}`);
            if (deps.copiar) await deps.copiar(`*Presupuesto por WhatsApp (modo copia)* — encargaría la simulación:\n${texto}`).catch(() => {});
        }
        p.simulacion_pedida = true;
        estado = 'HECHO'; espera = null;
        await guardar();
        await decir(MSG.confirmada);
        return { ...out, estado };
    }
    function V_desc(v) { return [limpio(v.direccion), v.municipio].filter(Boolean).join(', '); }
}

/** ¿Lo que ha dicho cambia el presupuesto ya hecho? (importe, extras, equipo). Pura. */
function cambiaElPresupuesto(ext) {
    const o = ext.obra || {};
    return ext.importe !== null || (o.extras || []).length > 0 || (o.extras_quitar || []).length > 0
        || !!o.equipo?.marca || !!o.equipo?.modelo || o.equipo?.potencia_kw !== null && o.equipo?.potencia_kw !== undefined;
}

/** De la ficha del cliente, solo los datos que se imprimen / encargan (nada de ids internos ni JSONB). */
function soloDatos(c) {
    if (!c) return {};
    const nombre = c.nombre || c.nombre_razon_social || null;
    const r = { nombre, apellidos: c.apellidos || null, dni: c.dni || c.nif || null, tlf: c.tlf || c.telefono || null, direccion: c.direccion || null, codigo_postal: c.codigo_postal || null, municipio: c.municipio || null, provincia: c.provincia || null };
    return Object.fromEntries(Object.entries(r).filter(([, v]) => v));
}

// ─── El servicio «sin guardar» (modo copia y banco) ─────────────────────────
/**
 * El servicio de presupuestos que NO escribe: cliente tal cual (sin buscar ni dar de alta),
 * presupuesto calculado con la lógica de la app pero sin guardarlo ni gastar número, y el PDF
 * compuesto por el servicio real si existe (solo lee la plantilla y la ficha del instalador).
 */
function servicioSinGuardar(real, L, { pdfSimulado = false } = {}) {
    let n = 0;
    const filas = new Map();
    const calcular = (entrada, id) => {
        const conceptos = Array.isArray(entrada.conceptos) && entrada.conceptos.length ? entrada.conceptos : L.conceptosDe(entrada.obra);
        const c = L.calcularPresupuesto({ conceptos, modo: entrada.modo, total: entrada.total, partidas: entrada.partidas, iva_pct: entrada.iva_pct, con_iva: entrada.con_iva });
        if (c.errores.length) throw Object.assign(new Error(c.errores.join(' ')), { status: 400 });
        return {
            id, numero: entrada.numero, fecha: entrada.fecha, estado: 'EMITIDO', origen: 'whatsapp',
            cliente: entrada.cliente || {}, obra: entrada.obra, lineas: c.lineas, modo: c.modo, notas: entrada.notas,
            validez_dias: entrada.validez_dias, base: c.base, iva_pct: c.iva_pct, iva: c.iva, total: c.total,
            simulacion: entrada.simulacion || null, seco: true,
        };
    };
    return {
        sinGuardar: true,
        async opcionesNuevo(a) {
            if (real?.opcionesNuevo) return real.opcionesNuevo(a);
            return { numero: L.siguienteNumero([], String(new Date().getFullYear()).slice(-2)), fecha: hoy(new Date()), iva_pct: 21, notas: 'El presupuesto no incluye la alimentación eléctrica.', validez_dias: 30, emisor: { nombre: 'INSTALADOR (simulado)' } };
        },
        async resolverCliente({ cliente, clienteId }) {
            return { cliente: clienteId ? { id_cliente: clienteId } : { ...cliente }, creado: !clienteId, sinGuardar: true };
        },
        async crear({ entrada }) {
            const f = calcular(entrada, `seco-${++n}`);
            filas.set(f.id, f);
            return f;
        },
        async actualizar({ id, entrada }) {
            const f = calcular(entrada, id);
            filas.set(id, f);
            return f;
        },
        async pdfDe(prescriptorId, presu) {
            if (!pdfSimulado && real?.pdfDe) return real.pdfDe(prescriptorId, presu);
            return { buffer: Buffer.from(`%PDF-1.4\n% presupuesto simulado ${presu.numero}\n`), desborda: false, numeroLargo: false, simulado: true };
        },
        _filas: filas,
    };
}

// ─── Las dependencias de verdad ─────────────────────────────────────────────
function pedidosSupabase(supabase) {
    const COLS = 'id, chat_id, autor, prescriptor_id, estado, espera, pedido, presupuesto_id, mensajes, created_at, updated_at';
    const err = (e) => Object.assign(new Error(e.message), { status: 503 });
    return {
        async abierto(chatId, autor) {
            const { data, error } = await supabase.from('instalador_wa_pedidos').select(COLS)
                .eq('chat_id', chatId).eq('autor', autor).eq('estado', 'ABIERTO')
                .order('updated_at', { ascending: false }).limit(1);
            if (error) throw err(error);
            return data?.[0] || null;
        },
        async crear(fila) {
            const { data, error } = await supabase.from('instalador_wa_pedidos').insert(fila).select(COLS).single();
            if (error) throw err(error);
            return data;
        },
        async guardar(id, cambios) {
            const { error } = await supabase.from('instalador_wa_pedidos').update({ updated_at: new Date().toISOString(), ...cambios }).eq('id', id);
            if (error) throw err(error);
        },
        async presupuestosHoy(chatId) {
            const { count, error } = await supabase.from('instalador_wa_pedidos').select('id', { count: 'exact', head: true })
                .eq('chat_id', chatId).not('presupuesto_id', 'is', null).gte('created_at', new Date(Date.now() - 24 * 3_600_000).toISOString());
            if (error) throw err(error);
            return count || 0;
        },
    };
}

// `actualizar` del servicio recalcula desde la entrada y NO escribe la columna `simulacion`: la marca
// de «simulación pedida» se escribe aparte, en el mismo presupuesto y solo del mismo instalador.
function conSimulacion(real, supabase) {
    if (!real) return real;
    return {
        ...real,
        async actualizar(a) {
            const fila = await real.actualizar(a);
            const sim = a?.entrada?.simulacion;
            if (sim && fila?.id) {
                const r = await supabase.from('instalador_presupuestos').update({ simulacion: sim })
                    .eq('id', fila.id).eq('prescriptor_id', a.prescriptorId).select('id').maybeSingle();
                if (r.error) throw Object.assign(new Error(`no he podido marcar la simulación (${r.error.message})`), { status: 503 });
                fila.simulacion = sim;
            }
            return fila;
        },
    };
}

function depsReales(cfg = config()) {
    const supabase = require('./supabaseClient');
    const wa = require('./whatsappService');
    const V = require('./viviendaCandidata');
    let real = null;
    try { real = require('./presupuestoInstaladorService'); } catch (e) { console.warn('[presupuesto-wa] sin servicio de presupuestos:', e.message); }
    return {
        cfg,
        cerebro: require('./presupuestoPedidoCerebro'),
        presupuestos: conSimulacion(real, supabase), // en copia, `procesar` lo envuelve en el «sin guardar»
        autorizado: (pid, tel) => autorizado(pid, tel, cfg),
        vivienda: V,
        oportunidadesDeLaRc: (rc) => require('../utils/altaOportunidad').oportunidadesDeLaRc(supabase, rc),
        pedirTarea: (a) => require('./asistenteCanal').pedirTarea(a),
        enviar: {
            texto: (chatId, t) => wa.sendText(chatId, t),
            documento: (chatId, f, { caption, textoDespues }) => wa.sendMedia(chatId, { base64: f.buffer.toString('base64'), mimetype: f.mimetype, filename: f.filename },
                { caption, asDocument: true, splitCaption: false, textoDespues }),
            imagen: (chatId, f, { caption }) => wa.sendMedia(chatId, { base64: f.buffer.toString('base64'), mimetype: f.mimetype, filename: f.filename },
                { caption, asDocument: false, splitCaption: false }),
        },
        copiar: cfg.copiaA ? (t) => wa.sendText(cfg.copiaA, t) : null,
        copiarArchivo: cfg.copiaA ? (tipo, f, { caption } = {}) => wa.sendMedia(cfg.copiaA,
            { base64: f.buffer.toString('base64'), mimetype: f.mimetype, filename: f.filename },
            { caption, asDocument: tipo === 'documento', splitCaption: false }) : null,
        avisarEquipo: cfg.avisosA ? (t) => wa.sendText(cfg.avisosA, t) : null,
        pedidos: pedidosSupabase(supabase),
        vistos,
        _real: real,
    };
}

// ─── El listener ────────────────────────────────────────────────────────────
const vistos = new Set();
const recordarVisto = (id) => { vistos.add(id); if (vistos.size > 3000) vistos.delete(vistos.values().next().value); };
const telPorAutor = new Map();         // @lid → 9 dígitos (un lid no cambia de dueño)
const autorizadosCache = new Map();    // id_empresa → { at, tels:Set }
const rafagas = new Map();             // chat|tel → { mensajes, timer }
const candados = new Map();

async function telefonoDelAutor(autor) {
    const a = String(autor || '');
    if (a.endsWith('@c.us')) return ult9(a);
    if (!a.endsWith('@lid')) return null;
    if (telPorAutor.has(a)) return telPorAutor.get(a);
    const client = require('./whatsappService').getClient?.();
    if (!client?.getContactLidAndPhone) return null;
    try {
        const r = await Promise.race([client.getContactLidAndPhone([a]), new Promise((_, rej) => setTimeout(() => rej(new Error('plazo')), 15_000))]);
        const t = ult9(r?.[0]?.pn?._serialized || r?.[0]?.pn || '');
        if (t) telPorAutor.set(a, t);         // solo lo resuelto: un fallo pasajero se reintenta
        return t;
    } catch { return null; }
}

/** Los teléfonos que pueden pedir en el grupo de ESE instalador (su ficha), 10 min en memoria. */
async function telefonosDeLaFicha(prescriptorId) {
    const c = autorizadosCache.get(prescriptorId);
    if (c && Date.now() - c.at < 10 * 60_000) return c.tels;
    const supabase = require('./supabaseClient');
    const { data, error } = await supabase.from('prescriptores')
        .select('tlf, tlf_responsable, tlf_contacto, contactos_notificacion').eq('id_empresa', prescriptorId).maybeSingle();
    if (error) throw new Error(error.message);
    const tels = new Set([data?.tlf, data?.tlf_responsable, data?.tlf_contacto,
        ...(Array.isArray(data?.contactos_notificacion) ? data.contactos_notificacion.map(x => x?.tlf) : [])].map(ult9).filter(Boolean));
    autorizadosCache.set(prescriptorId, { at: Date.now(), tels });
    return tels;
}

async function autorizado(prescriptorId, tel9, cfg) {
    if (cfg.probadores.has(tel9)) return true;
    if (cfg.soloProbadores) return false;
    return (await telefonosDeLaFicha(prescriptorId)).has(tel9);
}

const esAudio = (msg) => ['ptt', 'audio'].includes(String(msg?.type || ''));

/**
 * El id del mensaje en texto, como lo escribe WhatsApp Web: `fromMe_remote_id[_participant]`
 * (`false_1203…@g.us_3AA9…_7115…@lid`). En un grupo con `@lid` la clave que llega al listener NO
 * trae `_serialized` (el `serialize()` roto) y `String(msg.id)` daba «[object Object]»: con ese id
 * `_BAJAR` no encontraba el audio y TODOS los mensajes compartían la misma marca de «visto»
 * (22/11/2026). Sin las partes, '' — y el mensaje no se trata.
 */
function idDelMensaje(msg) {
    const k = msg?.id;
    if (!k) return '';
    if (typeof k === 'string') return k;
    if (typeof k._serialized === 'string' && k._serialized) return k._serialized;
    const jid = (x) => (typeof x === 'string' ? x
        : x?._serialized ? String(x._serialized)
            : x?.user && x?.server ? `${x.user}@${x.server}` : '');
    const remote = jid(k.remote) || String(msg.from || '');
    if (!k.id || !remote) return '';
    const participante = jid(k.participant) || (remote.endsWith('@g.us') ? String(msg.author || '') : '');
    return [String(!!k.fromMe), remote, String(k.id), ...(participante ? [participante] : [])].join('_');
}

/**
 * Baja el audio de la sesión con `whatsappMedia._BAJAR` (WhatsApp Web DIRECTO, en la fila de las
 * demás lecturas y con plazo). NUNCA `msg.downloadMedia()` de la librería: pasa por el `serialize()`
 * que WhatsApp rompió (regla 68.b) — el 22/11/2026 el primer audio de Fran en el grupo murió ahí.
 */
/* eslint-disable no-undef */
/** En la página: el id en texto del mensaje de ESE chat cuyo id corto es `corto` (o null). */
function BUSCAR_ID(corto, chat) {
    const C = window.require('WAWebCollections');
    const m = C.Msg.getModelsArray().find(x => x.id && x.id.id === corto && String(x.id.remote) === chat);
    return m ? String(m.id) : null;
}
/* eslint-enable no-undef */

async function bajarAudio(msgId, { corto = null, chat = null } = {}) {
    const wm = require('./whatsappMedia');
    const client = wm._clienteWa();
    if (!client) throw new Error('WhatsApp no conectado');
    const plazo = (p, que) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`plazo al ${que}`)), 90_000))]);
    let r = await wm._enSerie(() => plazo(client.pupPage.evaluate(wm._BAJAR, msgId, 16 * 1024 * 1024), 'bajar el audio'));
    if (r?.error === 'no_encontrado' && corto && chat) {
        // La clave del listener no siempre casa con la de la página: se busca por su id corto en ESE chat.
        const otro = await wm._enSerie(() => plazo(client.pupPage.evaluate(BUSCAR_ID, corto, chat), 'buscar el audio'));
        if (otro && otro !== msgId) r = await wm._enSerie(() => plazo(client.pupPage.evaluate(wm._BAJAR, otro, 16 * 1024 * 1024), 'bajar el audio'));
    }
    if (!r || r.error) throw new Error(`no se pudo bajar (${r?.error || 'sin respuesta'}${r?.detalle ? `: ${r.detalle}` : ''})`);
    return { buffer: Buffer.from(r.data, 'base64'), mimetype: String(r.mimetype || '').split(';')[0].trim() };
}

/** La FORMA de la clave del mensaje, para el log (sin teléfonos ni ids). */
function formaDeLaClave(k) {
    if (!k || typeof k !== 'object') return typeof k;
    return Object.keys(k).map(c => `${c}:${k[c] && typeof k[c] === 'object' ? `{${Object.keys(k[c]).join(',')}}` : typeof k[c]}`).join(' ');
}

async function textoDe(msg, id) {
    const tipo = String(msg.type || '');
    if (tipo === 'chat') return String(msg.body || '');
    if (esAudio(msg)) {
        const corto = typeof msg.id?.id === 'string' ? msg.id.id : null;
        const { buffer, mimetype } = await bajarAudio(id, { corto, chat: String(msg.from || '') }).catch((e) => {
            e.message = `${e.message} · clave ${formaDeLaClave(msg.id)}`;
            throw e;
        });
        return require('./whatsappConversacion').transcribirBuffer(buffer, mimetype || 'audio/ogg');
    }
    return String(msg.body || '');        // el pie de una foto o un documento, si lo lleva
}

function conCandado(clave, tarea) {
    const antes = candados.get(clave) || Promise.resolve();
    const ahora = antes.then(tarea, tarea);
    candados.set(clave, ahora.catch(() => {}));
    return ahora;
}

async function alMensaje(msg) {
    try {
        const cfg = config();
        if (!cfg.activo || !msg || msg.fromMe || msg.isStatus) return;
        const chatId = String(msg.from || '');
        const prescriptorId = cfg.grupos.get(chatId);
        if (!prescriptorId) return;
        const id = idDelMensaje(msg);
        if (!id || vistos.has(id)) return;
        const tel = await telefonoDelAutor(msg.author);
        if (!tel || !(await autorizado(prescriptorId, tel, cfg))) return;      // otros miembros: silencio
        let fallo = null;
        const texto = limpio(await textoDe(msg, id).catch((e) => { fallo = e; return ''; }));
        if (!texto) {
            if (fallo && esAudio(msg)) {
                // Un audio que no se puede escuchar no se calla: se le pide por escrito (en copia, a Fran).
                console.warn(`[presupuesto-wa] audio ${id} sin transcribir: ${fallo.message}`);
                recordarVisto(id);
                const t = MSG.audio;
                if (cfg.modo === 'real') await require('./whatsappService').sendText(chatId, t).catch(e => console.warn('[presupuesto-wa] aviso de audio:', e.message));
                else if (cfg.copiaA) await require('./whatsappService').sendText(cfg.copiaA, `*Presupuesto por WhatsApp (modo copia) · grupo ${chatId}*\nEl audio no se ha podido escuchar (${fallo.message}). Le diría:\n> ${t}`).catch(() => {});
            }
            return;
        }
        const clave = `${chatId}|${tel}`;
        const r = rafagas.get(clave) || { mensajes: [] };
        r.mensajes.push({ id, texto });
        if (r.timer) clearTimeout(r.timer);
        r.timer = setTimeout(() => despachar(clave, chatId, tel), cfg.rafagaMs);
        rafagas.set(clave, r);
    } catch (e) {
        console.warn('[presupuesto-wa] mensaje entrante:', e.message);
    }
}

function despachar(clave, chatId, tel) {
    const r = rafagas.get(clave);
    rafagas.delete(clave);
    if (!r?.mensajes?.length) return;
    conCandado(clave, async () => {
        const cfg = config();
        const deps = depsReales(cfg);
        const res = await procesar({ chatId, autorTel: tel, mensajes: r.mensajes, ahora: new Date(), deps });
        if (res.programado) {
            // Fuera de la franja: se vuelve a intentar a la apertura (los mensajes no se han dado por tratados).
            const ms = Math.min(Math.max(new Date(res.programado) - Date.now(), 60_000), 12 * 3_600_000);
            setTimeout(() => {
                const otra = rafagas.get(clave) || { mensajes: [] };
                otra.mensajes = [...r.mensajes, ...otra.mensajes];
                rafagas.set(clave, otra);
                despachar(clave, chatId, tel);
            }, ms);
        }
        for (const m of r.mensajes) if (!res.programado) recordarVisto(m.id);
        console.log(`[presupuesto-wa] ${chatId} ···${tel.slice(-3)}: ${res.ignorado || res.fallo || res.programado || `${res.estado || ''}${res.espera ? ` (espera ${res.espera})` : ''}`}${res.enviados.length ? ` · ${res.enviados.length} envío(s)${cfg.modo !== 'real' ? ' en COPIA' : ''}` : ''}`);
    }).catch(e => console.warn('[presupuesto-wa] turno fallido:', e.message));
}

function start() {
    const cfg = config();
    if (!cfg.activo) { console.log('[presupuesto-wa] Apagado (PRESUPUESTO_WA_ENABLED).'); return; }
    if (!cfg.grupos.size) { console.log('[presupuesto-wa] Sin grupos (PRESUPUESTO_WA_GRUPOS): no escucha.'); return; }
    require('./whatsappService').onMessage(alMensaje);
    console.log(`[presupuesto-wa] Escuchando ${cfg.grupos.size} grupo(s) en modo ${cfg.modo.toUpperCase()}`
        + `${cfg.soloProbadores ? ', solo probadores' : ''}; tope ${cfg.topeDia}/día; cerebro ${require('./presupuestoPedidoCerebro').proveedor()}.`);
}

module.exports = {
    start, procesar, config, servicioSinGuardar, pedidosSupabase, logica,
    // Puros, para las pruebas:
    idDelMensaje, fusionar, faltaObra, entradaDe, burbuja, textoSimulacion, hayAlgo, eleccionDe, resumenParaCerebro, PALABRAS, MSG,
    _alMensaje: alMensaje,
};
