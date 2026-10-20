// =============================================================================
// rondaWhatsappIA — lo que la RONDA DE WHATSAPP le pregunta a Gemini (2026-10-19)
// -----------------------------------------------------------------------------
// Dos preguntas por chat, y ninguna decide nada sola:
//  · ANALIZAR: a qué obra va cada adjunto, qué es, qué preguntaron sin respuesta,
//    qué se prometió y una línea por obra para el historial.
//  · BORRADOR: lo que se le contestaría, como Fran, para que él lo revise.
// El modelo mira y redacta; el CÓDIGO valida (un código de obra fuera de la lista
// es «dudoso»), pone los ENLACES y junta los PÁRRAFOS. Todo lo de aquí está medido
// en dos pasadas en seco sobre 120 chats reales (ver la documentación de la ronda).
//
// Puro salvo `analizar` y `borrador`, que llaman a Gemini por el lector de
// siempre (`placaOcrService.llamarGemini`). Probado en scripts/test_ronda_whatsapp.js.
// =============================================================================

const { llamarGemini } = require('./placaOcrService');
const { CONOCIMIENTO, redactarDossier } = require('./botPrompt');

const corta = (s, n) => {
    const t = String(s || '').replace(/\s+/g, ' ').trim();
    return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
const fecha = (t) => new Date(t * 1000).toLocaleString('es-ES', {
    timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
});
const hoyISO = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });

// ─────────────────────────────────────────────────────────────────────────────
// Lo que manda la APP no lo ha escrito una persona
// ─────────────────────────────────────────────────────────────────────────────
// Sus textos quedan en `whatsapp_queue`. Lo que dicen son plantillas («dejaremos
// preparada la parte técnica para el IRPF»): leído como promesa, infla la lista
// de «prometiste». Medido: 37 de 72 promesas «nuestras» eran eso. Respaldo: la
// firma corporativa, que solo la llevan los avisos.
const huella = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 120);
const FIRMA_APP = /BROKERGY\s*[—·-]\s*Ingenier[ií]a Energ[eé]tica/i;
const esAutomatico = (m, envios) => !!(m && m.de_mi && m.tipo === 'chat'
    && ((envios && envios.has(huella(m.texto))) || FIRMA_APP.test(m.texto || '')));

// ─────────────────────────────────────────────────────────────────────────────
// Los ENLACES los pone el código, nunca el modelo
// ─────────────────────────────────────────────────────────────────────────────
// Medido en la primera pasada: de 41 enlaces copiados por el modelo, 7 salieron
// ROTOS (token recortado, un dígito cambiado, el token omitido) y 4 con el
// «¡Gracias» pegado. El modelo escribe una MARCA y aquí se cambia por la URL,
// sola en su línea. Cualquier otra URL que escriba se quita y se avisa.
function sustituirEnlaces(texto, enlaces) {
    let s = String(texto || '');
    const usados = [];
    const problemas = [];
    for (const [marca, url] of Object.entries(enlaces || {})) {
        if (!s.includes(marca)) continue;
        usados.push(marca);
        s = s.split(marca).join(`\n${url}\n`);
    }
    const reales = new Set(Object.values(enlaces || {}));
    s = s.replace(/https?:\/\/[^\s]+/g, (u) => {
        if (reales.has(u)) return u;
        problemas.push(`URL escrita por el modelo, quitada: ${corta(u, 60)}`);
        return '';
    });
    s = s.replace(/\{ENLACE_[A-Z_]+\}/g, (m) => { problemas.push(`marca sin enlace: ${m}`); return ''; });
    s = s.replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    return { texto: s, usados, problemas };
}

/** Los enlaces del dossier pasan a MARCAS; devuelve el mapa marca → URL. */
function enlacesAMarcas(dossier) {
    const enlaces = {};
    if (!dossier?.enlaces) return enlaces;
    const e = dossier.enlaces;
    const marca = (clave, url) => { if (!url) return null; enlaces[`{${clave}}`] = url; return `{${clave}}`; };
    dossier.enlaces = {
        aceptar_propuesta: marca('ENLACE_ACEPTAR', e.aceptar_propuesta),
        subir_documentacion: marca('ENLACE_SUBIR', e.subir_documentacion),
        firmar_anexos: marca('ENLACE_FIRMAR', e.firmar_anexos),
        ver_mi_expediente: marca('ENLACE_MI_EXPEDIENTE', e.ver_mi_expediente),
    };
    return enlaces;
}

/** Los PÁRRAFOS los junta el código: 28 de 47 borradores salían pegados. */
const juntarParrafos = (r) => (Array.isArray(r?.parrafos) ? r.parrafos : [String(r?.mensaje || '')])
    .map(p => String(p || '').trim()).filter(Boolean).join('\n\n');

// Una oportunidad sin expediente solo tiene propuesta QUE ACEPTAR si se le ENVIÓ.
// En la primera pasada, 4 borradores le daban el enlace de aceptar a quien todavía
// no tenía propuesta (PTE ENVIAR): ese enlace le abre algo a medias.
function estadoPropuesta(obra) {
    if (!obra || obra.tipo !== 'oportunidad') return null;
    const e = String(obra.estado || '').toUpperCase();
    if (e === 'ENVIADA') return 'ENVIADA';
    if (e === 'ACEPTADA') return 'ACEPTADA_SIN_EXPEDIENTE';
    return 'SIN_ENVIAR';   // PTE ENVIAR, LEAD, sin estado
}

// ─────────────────────────────────────────────────────────────────────────────
// Lo que CUESTA cada modelo, y cuánto se le deja PENSAR
// ─────────────────────────────────────────────────────────────────────────────
// USD por millón de tokens (entrada · salida con el razonamiento), nivel de pago,
// de ai.google.dev/gemini-api/docs/pricing el 19/10/2026. ⚠️ Los 3.6/3.8 Flash
// DOBLAN su precio el 01/01/2027. El modo por lotes (Batch) cobra la mitad.
const PRECIOS = {
    'gemini-2.5-flash': [0.30, 2.50],
    'gemini-2.5-flash-lite': [0.10, 0.40],
    'gemini-3.1-flash-lite': [0.25, 1.50],
    'gemini-3.5-flash-lite': [0.30, 2.50],
    'gemini-3.6-flash': [0.75, 3.75],
    'gemini-3.8-flash': [0.75, 3.75],
};
/** Coste en USD de una llamada. Un modelo que no está en la tabla se estima con el 2.5 Flash. */
function costeLlamada(u) {
    const [pin, pout] = PRECIOS[String(u.modelo || '').replace(/^models\//, '')] || PRECIOS['gemini-2.5-flash'];
    return (u.in * pin + (u.out + u.think) * pout) / 1e6;
}

/**
 * Cuánto se le deja PENSAR al analizar un chat. Medido el 19/10/2026: el
 * razonamiento era el 60 % de todo el gasto de la ronda (2.300 tokens de media
 * por chat, cobrados a precio de salida). Con UNA sola obra no hay nada que
 * deducir —todo va a esa obra—; con varias, un tope corto para casar el adjunto
 * con su obra por la RC, el titular o la dirección.
 */
function pensamientoPara({ obras = [], conAdjuntos = false }) {
    if (obras.length <= 1) return 0;
    return conAdjuntos ? 1024 : 512;
}

// ─────────────────────────────────────────────────────────────────────────────
// Gemini: una respuesta cortada (bucle) o un 5xx se reintenta UNA vez
// ─────────────────────────────────────────────────────────────────────────────
// Medido: 3 de 77 borradores se cortaban por el tope de salida; con otra
// temperatura el bucle no se repite (5 reintentos, 1 fallo de 87).
const REINTENTABLE = /tope de salida|bucle|plazo|Gemini (429|5\d\d)|no devolvi|JSON/i;
async function gemini(partes, opciones, cuenta) {
    const onUso = (u) => {
        if (!cuenta) return;
        cuenta.llamadas++; cuenta.in += u.in; cuenta.out += u.out + u.think; cuenta.think = (cuenta.think || 0) + u.think;
        cuenta.usd = (cuenta.usd || 0) + costeLlamada(u);
    };
    try {
        return await llamarGemini(partes, { ...opciones, onUso });
    } catch (e) {
        if (!REINTENTABLE.test(e.message)) throw e;
        if (cuenta) cuenta.reintentos++;
        return llamarGemini(partes, { ...opciones, onUso, temperatura: 0.4 });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// La conversación, como la lee el modelo
// ─────────────────────────────────────────────────────────────────────────────
const MEDIA = new Set(['image', 'document', 'ptt', 'audio', 'video']);

function transcripcion(ms, numeros, envios) {
    const L = [];
    for (const m of ms) {
        const auto = esAutomatico(m, envios);
        const quien = m.de_mi ? (auto ? 'NOSOTROS (aviso automático de la app)' : 'NOSOTROS') : 'ELLOS';
        let txt;
        if (m.tipo === 'chat') txt = corta(m.texto, auto ? 350 : (m.de_mi ? 600 : 1500));
        else if (numeros.has(m.id)) txt = `[ADJUNTO #${numeros.get(m.id)} · ${m.tipo === 'image' ? 'foto' : `documento ${m.nombre_archivo || m.filename || ''}`}]${m.texto ? ` ${corta(m.texto, 300)}` : ''}`;
        else if (m._transcripcion) txt = `[NOTA DE VOZ] «${corta(m._transcripcion, 1500)}»`;
        else if (m._video) txt = '[VÍDEO]';
        else if (m._colocada) txt = `[ADJUNTO ya colocado antes en la app: ${m._colocada.slot || 'sin apartado'}]`;
        else if (MEDIA.has(m.tipo)) txt = `[${m.tipo}${m.de_mi ? '' : ' no leído'}]${m.texto ? ` ${corta(m.texto, 200)}` : ''}`;
        else if (m.tipo === 'vcard' || m.tipo === 'multi_vcard') txt = `[CONTACTO] ${(m.contactos || []).map(c => c.nombre).join(', ')}`;
        else if (m.tipo === 'location') txt = '[UBICACIÓN]';
        else if (m.tipo === 'sticker') txt = '[sticker]';
        else txt = `[${m.tipo}]`;
        if (m.citado) txt = `(respondiendo a «${corta(m.citado, 120)}») ${txt}`;
        L.push(`[${fecha(m.t)}] ${quien}: ${txt}`);
    }
    return L.join('\n');
}

/** Los adjuntos que ve el modelo, numerados y dentro del presupuesto de bytes. */
function prepararPartes(adjuntos, { presupuestoBytes = 14 * 1024 * 1024, maxPdfBytes = 6 * 1024 * 1024 } = {}) {
    const partes = [];
    const numeros = new Map();
    let bytes = 0;
    let n = 0;
    for (const m of adjuntos) {
        if (!m._fichero) continue;
        const f = m._fichero;
        const esPdf = /pdf$/.test(f.mimetype);
        const esImg = /^image\//.test(f.mimetype);
        if (!esPdf && !esImg) { m._error = `tipo ${f.mimetype} no se lee`; continue; }
        if (esPdf && f.buffer.length > maxPdfBytes) { m._error = 'PDF demasiado grande para leerlo aquí'; continue; }
        if (bytes + f.buffer.length > presupuestoBytes) { m._error = 'no cabía en la llamada'; continue; }
        n++;
        numeros.set(m.id, n);
        m._n = n;
        bytes += f.buffer.length;
        partes.push({ texto: `ADJUNTO #${n} (${esImg ? 'foto' : 'documento'}, ${fecha(m.t)}${m.texto ? `, con el texto «${corta(m.texto, 120)}»` : ''}):` });
        partes.push({ buffer: f.buffer, mimeType: f.mimetype });
    }
    return { partes, numeros };
}

// ─────────────────────────────────────────────────────────────────────────────
// ANALIZAR
// ─────────────────────────────────────────────────────────────────────────────
const TIPOS_ADJ = ['FACTURA', 'JUSTIFICANTE_PAGO', 'PRESUPUESTO', 'CERTIFICADO_RITE', 'MEMORIA_RITE', 'CIFO_O_ANEXO_FIRMADO', 'CEE',
    'DNI', 'JUSTIFICANTE_TITULARIDAD', 'FOTO_OBRA', 'FOTO_PLACA', 'CAPTURA_CATASTRO', 'PLANO_CROQUIS',
    'OTRO_DOCUMENTO', 'NO_RELACIONADO'];

const SCHEMA_ANALISIS = {
    type: 'object',
    properties: {
        adjuntos: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    n: { type: 'integer' },
                    obra: { type: 'string' },
                    tipo: { type: 'string', enum: TIPOS_ADJ },
                    que_es: { type: 'string' },
                    confianza: { type: 'string', enum: ['alta', 'media', 'baja'] },
                    por_que_esa_obra: { type: 'string' },
                },
                required: ['n', 'obra', 'tipo', 'que_es', 'confianza'],
            },
        },
        preguntas_sin_contestar: {
            type: 'array',
            items: { type: 'object', properties: { obra: { type: 'string' }, pregunta: { type: 'string' }, fecha: { type: 'string' } }, required: ['pregunta'] },
        },
        promesas: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    quien: { type: 'string', enum: ['NOSOTROS', 'ELLOS'] },
                    obra: { type: 'string' }, que: { type: 'string' },
                    para_cuando: { type: 'string' }, cumplida: { type: 'boolean' },
                    origen: { type: 'string', enum: ['PERSONA', 'AVISO_AUTOMATICO'] },
                },
                required: ['quien', 'que', 'origen'],
            },
        },
        resumen_por_obra: {
            type: 'array',
            items: { type: 'object', properties: { obra: { type: 'string' }, texto: { type: 'string' } }, required: ['obra', 'texto'] },
        },
        obra_de_la_conversacion: { type: 'string' },
        espera_respuesta: { type: 'boolean' },
        por_que_espera: { type: 'string' },
    },
    required: ['adjuntos', 'preguntas_sin_contestar', 'promesas', 'resumen_por_obra', 'obra_de_la_conversacion', 'espera_respuesta'],
};

function lineaObra(o) {
    return `- ${o.codigo} · ${o.tipo === 'expediente' ? 'expediente' : o.tipo === 'cee' ? 'CEE directo' : 'oportunidad (propuesta)'}`
        + ` · ${o.estado || 'sin estado'} · titular ${o.cliente || '¿?'}`
        + `${o.municipio ? ` · ${o.municipio}` : ''}${o.direccion ? ` · ${corta(o.direccion, 60)}` : ''}`
        + `${o.referencia && o.referencia !== o.cliente ? ` · ref. «${corta(o.referencia, 50)}»` : ''}${o.rc ? ` · RC ${o.rc}` : ''}`;
}

function quienEs(personas) {
    return personas.map(p => (p.tipo === 'cliente'
        ? `${p.nombre} (cliente, ${p.via})`
        : `${p.nombre}${p.persona ? ` — ${p.persona}` : ''} (${p.rol === 'CERTIFICADOR' ? 'técnico certificador' : 'empresa instaladora'})`)).join('; ');
}

/** El código VALIDA lo que devuelve el modelo: un código fuera de la lista es dudoso. */
function validarAnalisis(r, obras) {
    const validos = new Set(obras.map(o => o.codigo));
    const limpia = (c) => { const t = String(c || '').trim(); return validos.has(t) || t === 'NUEVA' ? t : ''; };
    for (const a of r.adjuntos || []) a.obra = limpia(a.obra);
    for (const p of r.preguntas_sin_contestar || []) p.obra = limpia(p.obra);
    for (const p of r.promesas || []) p.obra = limpia(p.obra);
    for (const p of r.resumen_por_obra || []) p.obra = limpia(p.obra);
    r.obra_de_la_conversacion = limpia(r.obra_de_la_conversacion);
    // Lo de una plantilla de la app no es una promesa de nadie: fuera, contado.
    const todas = r.promesas || [];
    r.promesas = todas.filter(p => !(p.quien === 'NOSOTROS' && p.origen === 'AVISO_AUTOMATICO'));
    r.promesas_descartadas = todas.length - r.promesas.length;
    return r;
}

async function analizar({ texto, obras, rol, personas, dias }, partes, cuenta, { modelo, pensamiento } = {}) {
    const prompt = `Eres el ayudante de oficina de BROKERGY, una ingeniería que tramita Certificados de Ahorro
Energético (CAE) por cambiar calderas por aerotermia, reformas de envolvente y certificados energéticos
(CEE). Repasas un chat de WhatsApp de los últimos ${dias} días entre BROKERGY («NOSOTROS») y
«ELLOS» para dejar constancia en la app de lo que ha llegado. No contestas a nadie: ordenas.

QUIÉN ES «ELLOS»: ${quienEs(personas)}.
${rol === 'instalador' ? 'Es una empresa instaladora: su chat mezcla VARIAS obras.' : ''}${rol === 'certificador' ? 'Es un técnico certificador: su chat mezcla VARIAS obras.' : ''}

SUS OBRAS ABIERTAS CON NOSOTROS (lista CERRADA; usa el CÓDIGO tal cual, el primero de cada línea):
${obras.map(lineaObra).join('\n') || '(ninguna)'}

LA CONVERSACIÓN (lo más antiguo primero):
${texto}

Después de este texto van los ADJUNTOS que ELLOS han mandado, cada uno precedido de su número.
Hoy es ${hoyISO()}.

DEVUELVE:
1. "adjuntos": UNO por cada ADJUNTO #n que te paso, con:
   - "obra": el CÓDIGO de la lista al que pertenece. Mira el texto de alrededor, el nombre, la dirección,
     la referencia catastral o lo que se vea en el propio adjunto (una factura lleva el nombre del cliente y la
     dirección). Con UNA sola obra en la lista es esa, salvo que el adjunto no tenga nada que ver con una obra.
     Si con varias no se puede saber, "" (dudoso): quien revisa detecta antes un hueco que un acierto falso.
     "NUEVA" si es claramente de un cliente u obra que NO está en la lista (una petición nueva, otra vivienda).
   - "tipo", "que_es" (frase corta y concreta: «placa de la unidad exterior Panasonic», «factura de la
     instalación de la aerotermia», «foto del hueco de la caldera retirada»), "confianza" y
     "por_que_esa_obra" (una frase).
2. "preguntas_sin_contestar": lo que ELLOS preguntan o piden y NOSOTROS no hemos respondido DESPUÉS en el chat.
   Con su obra (código o "") y la fecha (AAAA-MM-DD). Un saludo o un «gracias» no es una pregunta.
3. "promesas": lo que alguien dijo que haría («el viernes te mando la factura», «mañana te lo miro»), con
   "quien" (NOSOTROS o ELLOS), la obra, "para_cuando" (AAAA-MM-DD si se puede deducir; "" si no),
   "cumplida" (true si en el propio chat se ve que ya lo hizo) y "origen". Una promesa es lo que una
   PERSONA dice que va a hacer: lo que pone un mensaje marcado «aviso automático de la app» es una
   plantilla que describe el proceso, NO una promesa; si la apuntas, "origen" = AVISO_AUTOMATICO.
4. "resumen_por_obra": UNA línea por obra tocada, para el HISTORIAL de esa obra, en tercera persona y
   concreta: qué ha mandado, qué ha preguntado, qué ha quedado en hacer cada uno. Sin saludos ni adornos.
   Con "obra" = "" para lo que no se puede asignar y "NUEVA" para una petición nueva que no está en la lista.
5. "obra_de_la_conversacion": el código si TODO lo de estos días es de una sola obra; "" si mezcla o no se sabe.
6. "espera_respuesta": true si lo último relevante es de ELLOS y espera algo de NOSOTROS (una respuesta,
   un acuse de recibo de lo que ha mandado, una gestión). false si lo último es nuestro o si lo suyo es
   solo cortesía («gracias», «perfecto», un emoji). "por_que_espera": una frase.

REGLAS: no inventes códigos (uno que no esté en la lista es ""). No pongas importes en "que_es" ni en el
resumen. Lo que no se pueda saber, vacío.`;

    const pensar = pensamiento ?? pensamientoPara({ obras, conAdjuntos: partes.length > 0 });
    const r = await gemini(partes, {
        prompt, schema: SCHEMA_ANALISIS, etiqueta: 'ronda-analisis', pensar, deadline: 180_000, maxTokens: 16000,
        ...(modelo ? { modelo } : {}),
    }, cuenta);
    return validarAnalisis(r, obras);
}

// ─────────────────────────────────────────────────────────────────────────────
// BORRADOR — con el conocimiento y el dossier del bot (fuente única)
// ─────────────────────────────────────────────────────────────────────────────
const SCHEMA_BORRADOR = {
    type: 'object',
    properties: {
        accion: { type: 'string', enum: ['RESPONDER', 'ESCALAR', 'CALLAR'] },
        // PÁRRAFOS y no un texto: medido, en 28 de 47 borradores el modelo pegaba los
        // párrafos sin salto ni espacio («¡Hola Paloma!Sobre la obra…»).
        parrafos: { type: 'array', items: { type: 'string' }, description: 'El mensaje, un elemento por párrafo (el saludo es uno). Vacío si no es RESPONDER.' },
        motivo: { type: 'string' },
    },
    required: ['accion', 'parrafos', 'motivo'],
};

/** El dossier en texto, o la versión SIN enlaces cuando no hay propuesta que aceptar. */
function textoDossier(ctx, obra, propuesta, persona) {
    const ref = obra ? (obra.referencia || obra.cliente || obra.codigo) : '';
    if (propuesta === 'SIN_ENVIAR') {
        return `Quien escribe: ${persona}. Su vivienda (${ref}) es una SIMULACIÓN que TODAVÍA NO SE LE HA ENVIADO `
            + 'como propuesta: la estamos preparando nosotros.\n'
            + 'NO le pidas que acepte nada ni le des ningún enlace: no tiene propuesta que aceptar. Si ha mandado '
            + 'documentación, acusa recibo y dile que con eso le preparamos la propuesta. Si pregunta por importes, '
            + 'plazos o cuándo le llega, ESCALA.';
    }
    if (propuesta === 'ACEPTADA_SIN_EXPEDIENTE') {
        return `Quien escribe: ${persona}. Ya ACEPTÓ la propuesta de su vivienda (${ref}) y estamos abriendo su `
            + 'expediente. NO le pidas que la acepte ni le des enlaces. Si ha mandado documentación, acusa recibo; '
            + 'si pregunta otra cosa, ESCALA.';
    }
    return redactarDossier(ctx);
}

/**
 * @param {object} ch      { texto, personas, rol, obras }
 * @param {object} obra    la obra sobre la que se contesta (o null si no se sabe)
 * @param {object} dossier de `botContexto._dossierDeAsunto(…, { soloLectura: true })`, o null
 * @param {object} llegado { slots: Set, lineas: [] } — lo que acaba de llegar y ya tenemos
 */
/**
 * El dossier del borrador en TEXTO, con los enlaces ya cambiados por MARCAS.
 * Fuente única para el borrador de Gemini y para la ronda hecha por Claude Code
 * (`ronda_cc.js dossier`), que lo lee y redacta él.
 * @returns {{ texto, enlaces, propuesta }}  `enlaces`: marca → URL
 */
function dossierParaBorrador(ch, obra, dossier) {
    const rolBot = ch.rol === 'certificador' ? 'instalador' : (ch.rol === 'ambos' ? 'ambos' : ch.rol);
    const nombres = [...new Set((ch.personas || []).map(p => p.nombre).filter(Boolean))];
    const propuesta = estadoPropuesta(obra);
    const enlaces = enlacesAMarcas(dossier);
    const candidatas = (ch.obras || []).filter(o => o.tipo !== 'cee').slice(0, 12);
    const ctx = {
        conocido: true,
        identidades: (ch.personas || []).map(p => ({ tipo: p.tipo === 'cliente' ? 'cliente' : 'instalador', id: p.id, nombre: p.nombre })),
        rol: rolBot,
        nombre: nombres.length === 1 ? nombres[0] : null,
        ambiguo: !dossier && !propuesta && candidatas.length > 1,
        elegidoPor: dossier && ch.obras.length > 1 ? 'conversacion' : null,
        otrosAsuntos: dossier && ch.obras.length > 1
            ? ch.obras.filter(o => o.codigo !== obra.codigo).slice(0, 4).map(o => ({ referencia: o.referencia || o.cliente, numero_expediente: o.codigo }))
            : [],
        asuntos: dossier ? [dossier] : candidatas.map(o => ({
            referencia: o.referencia || o.cliente, numero_expediente: o.tipo === 'expediente' ? o.codigo : null,
            id_oportunidad: o.id_oportunidad, fase: o.tipo === 'expediente' ? 'EN_TRAMITE' : 'SIN_ACEPTAR',
        })),
    };
    const persona = nombres.length === 1 ? nombres[0] : 'esta persona';
    let texto = textoDossier(ctx, obra, propuesta, persona);
    if (obra?.tipo === 'cee') texto += `\n\nEs un CERTIFICADO ENERGÉTICO suelto (${obra.codigo}, ${obra.estado}), no un expediente CAE.`;
    return { texto, enlaces, propuesta };
}

async function borrador(ch, obra, dossier, llegado, cuenta, { modelo } = {}) {
    if (dossier && llegado.slots.size) {
        // Lo que acaba de llegar no se vuelve a pedir, aunque la app aún no lo tenga.
        dossier.pendientes = (dossier.pendientes || []).filter(p => !llegado.slots.has(p.clave));
    }
    const { texto: dossierTexto, enlaces, propuesta } = dossierParaBorrador(ch, obra, dossier);

    const prompt = `${CONOCIMIENTO}

# DOSSIER DE ESTA CONVERSACIÓN

${dossierTexto}

# LO QUE HA LLEGADO POR WHATSAPP Y TODAVÍA NO ESTÁ COLOCADO EN LA APP

${llegado.lineas.length ? llegado.lineas.map(l => `- ${l}`).join('\n') : '(nada)'}

Esto YA LO TENEMOS: no se lo vuelvas a pedir aunque el dossier lo diera por pendiente.

# LA CONVERSACIÓN DE ESTOS DÍAS (lo más antiguo primero)

${ch.texto}

# TU TAREA AHORA — manda sobre todo lo anterior si choca

No contestas tú: preparas un BORRADOR que Fran revisará antes de que salga. Escribes COMO FRAN, en
primera persona, cercano y breve, como se escribe por WhatsApp; sin firma, sin emojis de robot y sin
repetir lo que ya se ha dicho en el chat.
- Si ha mandado documentación o fotos: acusa recibo nombrando lo recibido en lenguaje de casa. Si con eso
  le queda algo pendiente de SU parte en la fase activa, díselo con el enlace del dossier; si ya no le
  falta nada, díselo («con esto está todo por tu parte, ahora nos toca a nosotros»).
- Si pregunta algo que el dossier responde: contéstalo, y SOLO eso, en 2-4 frases. No le cuentes el
  estado del expediente ni le recuerdes otras cosas si no las ha preguntado.
- Si habla de dinero, de cuándo cobra, se queja, quiere cambiar algo de la obra, o el dossier no da la
  respuesta: "accion" = ESCALAR, "parrafos" vacío, y en "motivo" lo que Fran tiene que saber para contestar.
- Si lo suyo es cortesía o no hay nada que contestar: "accion" = CALLAR.
- Nunca importes, ni fechas que no estén en el dossier, ni nombres internos de estados o de fichas.
- Si tiene varias obras y no se sabe de cuál habla, pregúntaselo.
- ENLACES: en el dossier van como MARCAS entre llaves (${Object.keys(enlaces).join(', ') || 'ninguna'}). Si hace
  falta uno, escribe la MARCA tal cual y el sistema pondrá el enlace. NUNCA escribas una dirección web.`;

    // Tope de 1.500: un WhatsApp nunca pasa de unos cientos de tokens, y medido, un
    // bucle llegaba a los 4.000 antes de cortarse (el reintento lo arregla igual).
    const r = await gemini([], {
        prompt, schema: SCHEMA_BORRADOR, etiqueta: 'ronda-borrador', pensar: false, deadline: 90_000, maxTokens: 1500,
        ...(modelo ? { modelo } : {}),
    }, cuenta);
    const accion = ['RESPONDER', 'ESCALAR', 'CALLAR'].includes(r.accion) ? r.accion : 'ESCALAR';
    const { texto, usados, problemas } = sustituirEnlaces(juntarParrafos(r), enlaces);
    return {
        accion: accion === 'RESPONDER' && !texto ? 'ESCALAR' : accion,
        mensaje: accion === 'RESPONDER' ? texto : '',
        motivo: String(r.motivo || '').trim(),
        con_dossier: !!dossier,
        propuesta,
        enlaces: usados.map(m => ({ marca: m, url: enlaces[m] })),
        problemas_enlaces: problemas,
    };
}

module.exports = {
    analizar, borrador, prepararPartes, transcripcion,
    // Puros, para las pruebas y el orquestador:
    huella, esAutomatico, sustituirEnlaces, enlacesAMarcas, juntarParrafos, estadoPropuesta,
    validarAnalisis, lineaObra, corta, fecha, MEDIA, TIPOS_ADJ,
    PRECIOS, costeLlamada, pensamientoPara, textoDossier, dossierParaBorrador, quienEs,
};
