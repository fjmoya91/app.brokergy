// =============================================================================
// contestadorCerebro — QUÉ le contesta el contestador de WhatsApp a quien escribe
// (fase 2 del agente autónomo, 10/11/2026).
//
// Misma firma que `rondaWhatsappIA.borrador` (la ronda la acepta como `redactar`):
//   redactar(ch, obra, dossier, llegado, cuenta) → { accion, mensaje, acuse, motivo, … }
//
// El prompt reúne lo que ya existe y está medido:
//   · el CONOCIMIENTO del proceso (botPrompt, fuente única);
//   · el DOSSIER de la obra (botContexto: lo que falta, la fase, de quién es la
//     pelota) con los enlaces como MARCAS (rondaWhatsappIA);
//   · lo que acaba de llegar por WhatsApp y aún no está en la app;
//   · la conversación de estos días;
//   · y, encima de todo, CÓMO CONTESTA FRAN: los casos de la skill `contestar-cliente`
//     (lo que le falta → se le pide con su enlace; nuestro terreno → «en revisión»…),
//     de tú, corto, sin emojis y sin presentarse a quien ya nos conoce.
//
// El cerebro: CLAUDE (Sonnet) con la SUSCRIPCIÓN de Fran, en el contenedor
// «asistente» (POST /contestar, un carril aparte de los trabajos de Fran). En el PC,
// para probar, `CONTESTADOR_CLAUDE_LOCAL=true` lo lanza aquí mismo. Si Claude no
// está o falla, GEMINI con el MISMO prompt (respaldo, céntimos), y se dice cuál fue.
//
// REGLA — el código valida y remata: los ENLACES (sustituirEnlaces), los PÁRRAFOS,
// fuera emojis y firmas, y un RESPONDER vacío pasa a ESCALAR.
// =============================================================================

const IA = require('./rondaWhatsappIA');
const { CONOCIMIENTO } = require('./botPrompt');

const URL_ASISTENTE = () => String(process.env.ASISTENTE_URL || '').replace(/\/+$/, '');
const CEREBRO = () => (process.env.CONTESTADOR_CEREBRO === 'gemini' ? 'gemini' : 'claude');
const ACCIONES = new Set(['RESPONDER', 'ESCALAR', 'CALLAR']);

const hoy = () => new Date().toLocaleString('es-ES', {
    timeZone: 'Europe/Madrid', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
});

const SCHEMA = {
    type: 'object',
    properties: {
        accion: { type: 'string', enum: ['RESPONDER', 'ESCALAR', 'CALLAR'] },
        parrafos: { type: 'array', items: { type: 'string' } },
        acuse: { type: 'string' },
        motivo: { type: 'string' },
    },
    required: ['accion', 'parrafos', 'motivo'],
};

/** El prompt entero. Puro: se prueba sin red (scripts/test_contestador_whatsapp.js). */
function construirPrompt(ch, obra, dossier, llegado) {
    if (dossier && llegado?.slots?.size) {
        // Lo que acaba de llegar no se vuelve a pedir, aunque la app aún no lo tenga.
        dossier.pendientes = (dossier.pendientes || []).filter(p => !llegado.slots.has(p.clave));
    }
    const { texto: dossierTexto, enlaces, propuesta } = IA.dossierParaBorrador(ch, obra, dossier);
    const marcas = Object.keys(enlaces).join(', ') || 'ninguna';
    const quien = ch.rol === 'instalador' ? 'una EMPRESA INSTALADORA (habla de las obras de sus clientes)'
        : ch.rol === 'ambos' ? 'un instalador que además es titular de una obra' : 'un CLIENTE particular';

    const prompt = `${CONOCIMIENTO}

# DOSSIER DE ESTA CONVERSACIÓN

${dossierTexto}

# LO QUE HA LLEGADO POR WHATSAPP Y TODAVÍA NO ESTÁ COLOCADO EN LA APP

${llegado?.lineas?.length ? llegado.lineas.map(l => `- ${l}`).join('\n') : '(nada)'}

Esto YA LO TENEMOS: no se lo vuelvas a pedir aunque el dossier lo diera por pendiente.

# LA CONVERSACIÓN DE ESTOS DÍAS (lo más antiguo primero; NOSOTROS = la casa, ELLOS = quien escribe)

${ch.texto}

# TU TAREA AHORA — manda sobre todo lo anterior si choca

Hoy es ${hoy()}. Quien escribe es ${quien}.

Contestas TÚ, AHORA, como FRAN (el ingeniero de BROKERGY que lleva los expedientes), en primera persona.
Lo que escribas en "parrafos" se le manda TAL CUAL por WhatsApp, sin que nadie lo revise: si dudas, ESCALAR.

CÓMO ESCRIBE FRAN (manda sobre «CÓMO HABLAS» de arriba):
- De tú, castellano de España, cercano y CORTO: dos a cinco frases, SEIS LÍNEAS como mucho contando
  los enlaces. Nada de «Estimado cliente». Las plantillas de arriba (las de los recordatorios, con su
  📸 y su lista de lo que falta) NO valen aquí: esto es una respuesta, no un recordatorio.
- Si le falta más de una cosa, pídele solo lo de la fase activa y como mucho DOS, con UN enlace (el de
  subirlo); el resto se le pedirá después. Nunca la lista entera del dossier.
- Sigue el hilo de la conversación. NO te presentes («soy Fran, de BROKERGY»): ya nos conoce, nos ha
  escrito él. Si hoy ya os habéis saludado, ve al grano sin «Hola».
- Saluda con el nombre de pila si el dossier lo da («Hola Ana,»); si no, «Hola,».
- SIN emojis. Sin firma ni «un saludo». Sin disculparte («lo siento», «perdona», «disculpa»): se
  explica y se dice qué sigue. *Negrita* solo para lo que se le pide.
- Contesta a lo que ha preguntado o mandado, y SOLO a eso. No le cuentes todo el expediente.
- Nunca el nombre interno de un estado o de una ficha (PTE FIN EXPTE, TITULAR PTE, S.O., MITECO, lote,
  RES060…), nunca importes, nunca fechas o plazos que no estén en el dossier.
- No empieces con un rótulo («Sobre la obra de CL MAYOR 1 (…):»). Si tiene varias obras y hay que decir de
  cuál hablas, nómbrala dentro de la frase por la calle y el pueblo («lo de la calle Mayor, en Tomelloso»).
  Si está claro de cuál habla, no le preguntes por las otras.
- Si dice que la obra YA ESTÁ HECHA o te pide que mires lo que ha mandado, eso SÍ se contesta (caso D/E o
  el acuse de lo recibido): no es cortesía.

QUÉ SE LE CONTESTA (la primera que encaje):
A. Le falta algo SUYO en la fase activa (el dossier lo dice) → se lo dices y le das la MARCA del enlace.
   Lo que le toca al INSTALADOR (factura, CIFO, RITE, fotos de la obra) no se le pide a un cliente: se le
   dice que estamos esperando la documentación del instalador, sin culpar a nadie.
B. La pelota es NUESTRA (revisión, verificación, administración) y pregunta cómo va → que está en
   revisión; que a los revisores no conviene presionarles, porque cuando se les presiona están saliendo
   desfavorables; que de momento estamos teniendo todos favorables; y que el primer interesado en que
   salga cuanto antes eres tú. Que en cuanto haya novedades le avisas. Si ya se lo dijiste hace poco, no
   copies el párrafo: reconócelo («ya sé que se está haciendo largo…»).
C. Certificado inicial en marcha → estamos con el certificado energético inicial, que es lo primero
   antes de la obra; en cuanto esté registrado le avisas.
D. CEE inicial registrado y obra sin terminar → ya puede hacerse y facturarse la obra; cuando acabe,
   que nos pasen la factura y las fotos (o el instalador) y seguimos.
E. Obra terminada, certificado final → estamos con el certificado final y después lo preparamos para
   mandarlo a revisión.
F. Ya emitido y pendiente de cobro → ha salido favorable y está emitido; estamos con el cobro y le avisas.
- Ha mandado FOTOS o DOCUMENTOS → acusa recibo nombrando lo que es en lenguaje de casa («la foto de la
  pegatina de la caldera, perfecto»). Si con eso aún le falta algo suyo, díselo con su enlace; si no, que
  lo revisas y si falta algo se lo dices. No le pidas lo que acaba de mandar.
- Manda algo de una vivienda u obra que NO está en el dossier (una petición nueva) → acuse en una frase
  («Recibido, lo miro y te digo») y nada más.
- Tiene varias obras y no se sabe de cuál habla → pregúntale cuál (por la dirección o el titular).

"accion" = ESCALAR (no contestas tú: se lo pasas a Fran) cuando:
- pregunta CUÁNTO va a cobrar, cuándo exactamente, por facturas nuestras, IRPF o impuestos;
- se queja, está enfadado o algo ha salido mal; quiere cancelar o cambiar algo (titular, cuenta, la obra);
- pide hablar por teléfono o con una persona, o pregunta si eres una persona o un programa;
- pregunta algo que el dossier no responde, o no está claro de qué obra habla y no se le puede preguntar;
- te pide que REVISES o valores algo que solo puede mirar Fran: un presupuesto, una oferta, unos precios,
  si le compensa una instalación u otra (acuse: «Recibido, lo miro y te digo»). Las fotos y documentos
  que manda para el expediente NO son esto: eso se acusa y se contesta con lo que falta;
- es un asunto legal, fiscal o de otras ayudas.
Al escalar, "parrafos" vacío; "motivo" = lo que Fran tiene que saber para contestar, en una o dos frases;
y "acuse" = UNA frase corta EN LA VOZ DE FRAN para que no se quede sin respuesta mientras él lo mira: «Lo
miro y te digo», «Déjame que lo mire y te cuento», «Recibido, lo miro y te digo» (con su nombre delante si
quieres). Nada más: ni plazo («ahora mismo», «hoy», «en un rato»), ni canal («te llamo»), ni «un
compañero» (Fran lo lleva él). Si no hace falta acuse, "".
Si pregunta si eres una persona o un programa, o pide que le llamen: ESCALAR con "acuse" VACÍO. Le
contesta Fran en persona. Aquí NO vale lo de «di que eres el asistente automático» de arriba, y nunca
digas que eres una persona.

"accion" = CALLAR cuando lo suyo es solo cortesía («gracias», «ok», «perfecto», un emoji), un reenvío o
algo que no va con nosotros. Ante la duda entre CALLAR y contestar a un «vale», CALLAR.

ENLACES: van en el dossier como MARCAS entre llaves (${marcas}). Si hace falta uno, escribe la MARCA tal
cual, sola en su línea; el sistema pone el enlace. NUNCA escribas una dirección web.

FORMATO: devuelve SOLO este JSON, sin nada alrededor:
{"accion": "RESPONDER" | "ESCALAR" | "CALLAR", "parrafos": ["un elemento por párrafo"], "acuse": "", "motivo": "por qué (para nosotros, una frase)"}`;

    return { prompt, enlaces, propuesta };
}

// ─── El remate del código ────────────────────────────────────────────────────
const EMOJI = /[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}\u{FE0F}\u{200D}]/gu;
const FIRMA = /\n+\s*(\*?BROKERGY\b[^\n]*|un saludo[^\n]*|saludos[^\n]*|fran\.?)\s*$/i;
const ACUSE_NO = /compa[ñn]er[oa]|asistente|autom[aá]tic|programa|\bbot\b|ahora mismo|en un rato|\bhoy\b|ma[ñn]ana|te llam|llamar|lo siento|perd[oó]n|disculp/i;
function limpiar(texto) {
    let s = String(texto || '').replace(EMOJI, '').replace(/[ \t]{2,}/g, ' ');
    for (let i = 0; i < 2; i++) s = s.replace(FIRMA, '');
    return s.replace(/^[ \t]+/gm, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n')
        // «Puedes subirlas aquí:» y el enlace, juntos (la marca en su línea dejaba un hueco).
        .replace(/:\n\n(https?:\/\/)/g, ':\n$1')
        .trim();
}

/**
 * Del JSON del modelo a la decisión, validada. Pura.
 * @returns {{ accion, mensaje, acuse, motivo, enlaces, problemas_enlaces }}
 */
function rematar(r, enlaces) {
    const accion = ACCIONES.has(String(r?.accion || '').toUpperCase()) ? String(r.accion).toUpperCase() : 'ESCALAR';
    const { texto, usados, problemas } = IA.sustituirEnlaces(IA.juntarParrafos(r), enlaces);
    const mensaje = accion === 'RESPONDER' ? limpiar(texto) : '';
    // El acuse es una frase y sin enlaces: si trae una URL o es largo, fuera. Y en la voz de
    // Fran: sin «un compañero», sin hablar de asistentes ni de programas y sin plazos (casos
    // inventados del 10/11/2026: «te paso con un compañero», «lo miro ahora mismo»); si los
    // trae, el de siempre.
    let acuse = accion === 'ESCALAR' ? limpiar(String(r?.acuse || '')) : '';
    if (/https?:\/\/|\{ENLACE_/i.test(acuse) || acuse.length > 160) acuse = '';
    if (acuse && ACUSE_NO.test(acuse)) acuse = 'Lo miro y te digo.';
    return {
        accion: accion === 'RESPONDER' && !mensaje ? 'ESCALAR' : accion,
        mensaje,
        acuse,
        motivo: String(r?.motivo || '').trim() || (accion === 'RESPONDER' && !mensaje ? 'el modelo no ha escrito nada' : ''),
        enlaces: usados.map(m => ({ marca: m, url: enlaces[m] })),
        problemas_enlaces: problemas,
    };
}

// ─── Los dos cerebros ────────────────────────────────────────────────────────
async function conClaude(prompt) {
    const url = URL_ASISTENTE();
    if (url) {
        const r = await fetch(`${url}/contestar`, {
            method: 'POST',
            headers: { 'x-internal-key': process.env.INTERNAL_API_KEY || '', 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt }),
            signal: AbortSignal.timeout(Number(process.env.CONTESTADOR_PLAZO_MS || 150_000) + 20_000),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.ok) throw new Error(j.error || `el asistente ha respondido ${r.status}`);
        return j;
    }
    if (process.env.CONTESTADOR_CLAUDE_LOCAL === 'true') {
        const j = await require('../scripts/contestador_claude').pensar(prompt);
        if (!j.ok) throw new Error(j.error || 'Claude no ha devuelto el JSON');
        return j;
    }
    throw new Error('Claude no está en este servidor (sin ASISTENTE_URL)');
}

async function conGemini(prompt, cuenta) {
    const { llamarGemini } = require('./placaOcrService');
    const onUso = (u) => {
        if (!cuenta) return;
        cuenta.llamadas++; cuenta.in += u.in; cuenta.out += u.out + u.think;
        cuenta.usd = (cuenta.usd || 0) + IA.costeLlamada(u);
    };
    return llamarGemini([], { prompt, schema: SCHEMA, etiqueta: 'contestador', pensar: false, deadline: 90_000, maxTokens: 1500, onUso });
}

/**
 * El `redactar` que se le pasa a la ronda. Nunca devuelve sin `accion`.
 */
async function redactar(ch, obra, dossier, llegado, cuenta) {
    const { prompt, enlaces, propuesta } = construirPrompt(ch, obra, dossier, llegado);
    let json = null;
    let cerebro = null;
    let fallo = null;
    if (CEREBRO() === 'claude') {
        try {
            const j = await conClaude(prompt);
            json = j.json;
            cerebro = `claude (${j.modelo || 'sonnet'}, ${j.segundos ?? '?'} s${j.entrada ? `, ${j.entrada} tokens` : ''})`;
        } catch (e) { fallo = e.message; }
    }
    if (!json) {
        json = await conGemini(prompt, cuenta);
        cerebro = `gemini${fallo ? ` (respaldo: ${fallo.slice(0, 120)})` : ''}`;
    }
    return { ...rematar(json, enlaces), con_dossier: !!dossier, propuesta, cerebro, prompt_chars: prompt.length };
}

module.exports = { redactar, construirPrompt, rematar, limpiar, SCHEMA };
