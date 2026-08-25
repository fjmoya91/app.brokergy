/**
 * botWhatsapp — decide CUÁNDO contesta el bot, y se asegura de que no meta la
 * pata. El QUÉ contesta está en `botCerebro` + `botPrompt`.
 *
 * Contesta por la MISMA sesión de WhatsApp del VPS con la que ya salen los
 * avisos de la app, y solo en los chats que lleven la etiqueta configurada
 * (por defecto "MOIA"). Las etiquetas solo existen en WhatsApp Business, que
 * es lo que hay conectado.
 *
 * ─── POR QUÉ HAY TANTO FRENO ──────────────────────────────────────────────
 * Esta no es una API oficial: es la cuenta REAL de la empresa pilotada por un
 * Chrome. Si esa cuenta se bloquea, se cae con ella todo lo automático que
 * depende de ella (el parte diario, los encargos al certificador, la entrega
 * de los CEE directos). Un bot que contesta en dos segundos, a cualquier hora
 * y a todo el mundo es exactamente el patrón que se detecta. De ahí:
 *
 *   · Solo chats ETIQUETADOS, y en pruebas solo los de la lista blanca.
 *   · Solo en HORARIO laboral. Fuera de él NO se responde — pero tampoco se
 *     pierde: el mensaje espera a la próxima apertura.
 *   · VENTANA DE SILENCIO antes de contestar: se agrupa lo que el cliente
 *     escriba seguido y se responde UNA vez.
 *   · Si un HUMANO ha escrito en ese chat, el bot calla.
 *   · TOPE DIARIO de respuestas.
 *   · Interruptor general apagado por defecto.
 */

const supabase = require('./supabaseClient');
const whatsappService = require('./whatsappService');
const botContexto = require('./botContexto');
const botCerebro = require('./botCerebro');
const botVinculos = require('./botVinculos');
const emailService = require('./emailService');
// Las etiquetas de WhatsApp son de WhatsApp, no del bot: su lectura y escritura
// (y el porqué de no usar la librería) viven en su propio módulo, que comparte
// con la ficha del cliente. Aquí solo se sabe CUÁL de ellas nos enciende.
const waLabels = require('./whatsappLabels');

// ───────────────────────────────────────────────────────────────────────────
// CONFIGURACIÓN
// ───────────────────────────────────────────────────────────────────────────

const num = (v, def) => (Number.isFinite(Number(v)) ? Number(v) : def);
const bool = (v, def) => (v === undefined || v === '' ? def : String(v).toLowerCase() === 'true');

const CONFIG = {
    // Apagado por defecto. En LOCAL esto responde a CLIENTES REALES: mientras
    // no se ponga a true a propósito, el bot no abre la boca.
    enabled: bool(process.env.BOT_WHATSAPP_ENABLED, false),
    etiqueta: process.env.BOT_WHATSAPP_ETIQUETA || 'MOIA',
    // Lista blanca de chats para la fase de prueba: '34612345678@c.us,...'.
    // Vacía = todos los chats etiquetados. Se comprueba ADEMÁS de la etiqueta.
    chatsPrueba: (process.env.BOT_WHATSAPP_CHATS_PRUEBA || '')
        .split(',').map(s => s.trim()).filter(Boolean),
    // Salir del modo prueba y atender a TODOS los chats etiquetados. Se escribe
    // a propósito: sin esto, encender el bot y olvidarse de la lista blanca lo
    // soltaría sobre toda la cartera de golpe.
    todosLosEtiquetados: bool(process.env.BOT_WHATSAPP_TODOS, false),
    horaDesde: num(process.env.BOT_WHATSAPP_HORA_DESDE, 8),
    horaHasta: num(process.env.BOT_WHATSAPP_HORA_HASTA, 20),
    // Ventana de silencio. Un cliente manda "Buenas tardes" · "¿Qué
    // documentación tenemos que aportar?" · "Gracias" en el mismo minuto (caso
    // real): contestar al primero es contestar a un saludo.
    ventanaMs: num(process.env.BOT_WHATSAPP_VENTANA_MS, 25_000),
    // Si un humano ha escrito hace menos de esto, el bot no interrumpe.
    silencioHumanoMin: num(process.env.BOT_WHATSAPP_SILENCIO_HUMANO_MIN, 30),
    maxDia: num(process.env.BOT_WHATSAPP_MAX_DIA, 40),
    // Cuántos turnos anteriores del chat se le recuerdan al cerebro.
    historialTurnos: num(process.env.BOT_WHATSAPP_HISTORIAL, 4),
    intervaloBarridoMs: num(process.env.BOT_WHATSAPP_BARRIDO_MS, 30_000),
};

const adminPhone = () => process.env.WHATSAPP_ADMIN_CHAT || '34623926179';
const adminEmail = () => process.env.ADMIN_EMAIL || 'franciscojavier.moya.s2e2@gmail.com';
const FRONTEND = () => process.env.FRONTEND_URL || 'https://app.brokergy.es';

// ───────────────────────────────────────────────────────────────────────────
// HORARIO (Europe/Madrid)
// ---------------------------------------------------------------------------
// El servidor va en UTC y España cambia de hora dos veces al año: calcular el
// horario laboral con `getHours()` haría que el bot empezara a las 09:00 medio
// año y a las 10:00 el otro. Se resuelve siempre contra el huso, nunca contra
// la hora del proceso.
// ───────────────────────────────────────────────────────────────────────────

const TZ = 'Europe/Madrid';

/** Desfase de Madrid respecto a UTC, en minutos, para un instante dado. */
function offsetMadrid(date) {
    const dtf = new Intl.DateTimeFormat('en-US', {
        timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });
    const p = Object.fromEntries(dtf.formatToParts(date).map(x => [x.type, x.value]));
    // `hour` puede venir como '24' a medianoche en algunos ICU.
    const h = Number(p.hour) % 24;
    const asUTC = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), h, Number(p.minute), Number(p.second));
    return (asUTC - date.getTime()) / 60000;
}

/** Partes de la fecha en Madrid: { y, m, d, hora, minuto }. */
function partesMadrid(date = new Date()) {
    const dtf = new Intl.DateTimeFormat('en-US', {
        timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false,
    });
    const p = Object.fromEntries(dtf.formatToParts(date).map(x => [x.type, x.value]));
    return {
        y: Number(p.year), m: Number(p.month), d: Number(p.day),
        hora: Number(p.hour) % 24, minuto: Number(p.minute),
    };
}

/** Instante UTC que corresponde a una hora de pared en Madrid. */
function madridAUtc(y, m, d, hora, minuto = 0) {
    let ts = Date.UTC(y, m - 1, d, hora, minuto);
    // Dos pasadas: la primera estima el desfase, la segunda lo corrige. Solo
    // difiere en el salto de hora, donde el peor caso es abrir una hora antes
    // o después un domingo de madrugada.
    for (let i = 0; i < 2; i++) {
        ts = Date.UTC(y, m - 1, d, hora, minuto) - offsetMadrid(new Date(ts)) * 60000;
    }
    return new Date(ts);
}

function enHorario(date = new Date()) {
    const { hora } = partesMadrid(date);
    return hora >= CONFIG.horaDesde && hora < CONFIG.horaHasta;
}

/**
 * Próximo instante en el que el bot puede hablar. Si estamos dentro del
 * horario, ahora mismo; si no, la apertura de hoy o la de mañana.
 */
function proximaApertura(date = new Date()) {
    if (enHorario(date)) return date;
    const { y, m, d, hora } = partesMadrid(date);
    if (hora < CONFIG.horaDesde) return madridAUtc(y, m, d, CONFIG.horaDesde, 0);
    // Ya ha cerrado: mañana. Se compone sumando un día en UTC y releyendo el
    // día natural en Madrid, para no tener que saber cuántos días tiene el mes.
    const manana = partesMadrid(new Date(date.getTime() + 24 * 3600 * 1000));
    return madridAUtc(manana.y, manana.m, manana.d, CONFIG.horaDesde, 0);
}

// ───────────────────────────────────────────────────────────────────────────
// ETIQUETAS
// ---------------------------------------------------------------------------
// Toda lectura de etiquetas cruza el puente de Puppeteer, y ese Chrome es el
// mismo del que depende TODA la app para enviar WhatsApp. Así que: se pregunta
// por CHAT (nunca se lista la etiqueta entera para decidir un mensaje), se
// cachea, se de-duplican las consultas simultáneas y ninguna llamada va sin
// plazo.
// ───────────────────────────────────────────────────────────────────────────

// TTL distintos a propósito. El POSITIVO puede ser largo: una etiqueta rara vez
// se quita. El NEGATIVO tiene que ser corto, porque es el que decide cuánto
// tardas en ver efecto después de etiquetar un chat — con 5 minutos parece que
// no funciona y acabas reiniciando el backend para nada.
const ETIQUETA_TTL_SI_MS = 5 * 60 * 1000;
const ETIQUETA_TTL_NO_MS = 60 * 1000;

// chatId → { etiquetado: boolean, at: number }
const cacheChat = new Map();
// chatId → Promise en vuelo. Sin esto, tres mensajes seguidos del mismo cliente
// disparan tres consultas idénticas a Puppeteer a la vez.
const consultasEnVuelo = new Map();

// Última lectura conocida del estado de la etiqueta, para el panel y para
// distinguir "no etiquetado" de "no he podido comprobarlo".
let etiquetaCache = { id: null, chats: new Set(), at: 0, error: null };

/**
 * Corta cualquier espera contra Puppeteer.
 *
 * REGLA — NINGUNA llamada al cliente crudo va sin plazo. Si Chrome se atasca,
 * una promesa que no resuelve nunca deja colgado el barrido (`barriendo` se
 * queda en true) y el bot muere en silencio: no contesta y no avisa. Con plazo,
 * lo peor que pasa es que ese mensaje se reintente en el barrido siguiente.
 */
function conPlazo(promesa, ms, etiqueta) {
    let t;
    return Promise.race([
        promesa,
        new Promise((_, rechaza) => {
            t = setTimeout(() => {
                const e = new Error(`Timeout en ${etiqueta} (${ms / 1000}s)`);
                // Marcado para poder distinguirlo de un fallo de código. Un
                // plazo agotado significa que el navegador NO responde, y
                // reintentar por otra vía es esperar otro plazo entero contra el
                // mismo Chrome muerto.
                e.plazoAgotado = true;
                rechaza(e);
            }, ms);
        }),
    ]).finally(() => clearTimeout(t));
}

const PLAZO_WA_MS = num(process.env.BOT_WHATSAPP_PLAZO_WA_MS, 15_000);

// ─── Lectura de etiquetas, por nuestra cuenta ────────────────────────────────
//
// `getLabels()` / `getChatLabels()` de whatsapp-web.js pasan por
// `getLabelModel()`, que hace `label.serialize()` y lee `label.hexColor`.
// WhatsApp cambió ese modelo y la llamada revienta con un error minificado —
// medido el 2026-08-25 contra una cuenta Business con 16 etiquetas: la
// colección se lee perfectamente (`Label.getModelsArray()` devuelve las 16) y
// lo que falla es serializarlas.
//
// Aquí se lee lo ÚNICO que hace falta —el id y el nombre— sin serializar nada.
// La librería sigue como respaldo por si un día WhatsApp cambia al revés y es
// el acceso directo el que deja de valer.
//
// Es deuda a propósito: en cuanto whatsapp-web.js publique el arreglo, esto se
// puede borrar y volver a `client.getLabels()`.

/** [{ id, name }] de todas las etiquetas de la cuenta. */
async function leerEtiquetas() {
    return waLabels.listar();
}

/** Ids de las etiquetas de UN chat. */
async function leerEtiquetasDeChat(client, chatId) {
    try {
        const ids = await conPlazo(client.pupPage.evaluate((id) => {
            const C = window.require('WAWebCollections');
            const chat = C && C.Chat && C.Chat.get(id);
            if (!chat) return null;
            return (chat.labels || []).map(String);
        }, chatId), PLAZO_WA_MS, 'etiquetas del chat');
        if (ids) return ids;
    } catch (e) {
        console.warn('[bot/wa] etiquetas del chat:', e.message);
        if (e.plazoAgotado) throw e;
    }
    const labels = await conPlazo(client.getChatLabels(chatId), PLAZO_WA_MS, 'getChatLabels');
    return (labels || []).map(l => String(l.id));
}

/** Chats que llevan una etiqueta, por su id. Solo ids: nada de hidratar Chats. */
async function leerChatsDeEtiqueta(client, labelId) {
    return conPlazo(client.pupPage.evaluate((id) => {
        const C = window.require('WAWebCollections');
        const label = C && C.Label && C.Label.get(id);
        if (!label || !label.labelItemCollection) return [];
        return label.labelItemCollection.getModelsArray()
            .filter(i => i.parentType === 'Chat')
            .map(i => String(i.parentId));
    }, labelId), PLAZO_WA_MS, 'chats de la etiqueta');
}

// ─── @lid: el chat ya no se llama como el número ─────────────────────────────
//
// WhatsApp está migrando los identificadores de `34612345678@c.us` (el número a
// la vista) a `71159068520593@lid`, un identificador opaco que no lo revela.
// Medido el 2026-08-25: el chat etiquetado de la cuenta llegaba como `@lid`, así
// que dar por hecho el formato viejo deja al bot sordo justo con los chats que
// ya han migrado — y son cada vez más.
//
// El número sigue haciendo falta: es lo único con lo que se puede buscar a esta
// persona en la base de datos. `getContactLidAndPhone` lo resuelve, y se cachea
// de por vida del proceso porque un lid no cambia de dueño.

const telefonoPorChat = new Map();

/** Número de teléfono (sin '+') de un chat, sea `@c.us` o `@lid`. */
async function telefonoDeChat(chatId) {
    const id = String(chatId || '');
    if (!id) return null;
    if (id.endsWith('@c.us')) return id.replace('@c.us', '');
    if (telefonoPorChat.has(id)) return telefonoPorChat.get(id);

    const client = whatsappService.getClient?.();
    if (!client?.getContactLidAndPhone) return null;
    try {
        const res = await conPlazo(client.getContactLidAndPhone([id]), PLAZO_WA_MS, 'getContactLidAndPhone');
        const pn = res?.[0]?.pn ? String(res[0].pn).replace(/@.*$/, '') : null;
        // Solo se cachea lo RESUELTO. Un null puede ser un fallo pasajero, y
        // cachearlo dejaría a ese chat sin identificar para siempre.
        if (pn) telefonoPorChat.set(id, pn);
        return pn;
    } catch (e) {
        console.warn(`[bot/wa] no se pudo resolver el teléfono de ${id}:`, e.message);
        return null;
    }
}

/**
 * ¿Está este chat en la lista blanca de pruebas?
 *
 * Se compara por las DOS caras: el identificador tal cual y el teléfono. Así la
 * variable de entorno se puede escribir como el número (que es lo que uno sabe)
 * aunque el chat viaje como `@lid` (que es lo que uno no sabe).
 */
async function enListaDePrueba(chatId) {
    if (!CONFIG.chatsPrueba.length) return true;
    if (CONFIG.chatsPrueba.includes(chatId)) return true;
    const tel = await telefonoDeChat(chatId);
    if (!tel) return false;
    const nueve = tel.slice(-9);
    return CONFIG.chatsPrueba.some(c => c.replace(/\D/g, '').slice(-9) === nueve);
}

/**
 * Pone o quita NUESTRA etiqueta en un chat. La mecánica (y el porqué de no usar
 * la librería) vive en `whatsappLabels`: aquí solo se sabe CUÁL es la nuestra.
 */
async function cambiarEtiquetaDelChat(chatId, { quitar = false } = {}) {
    const client = whatsappService.getClient?.();
    if (!client) throw new Error('WhatsApp no está conectado.');
    const { id: labelId, total } = await idDeNuestraEtiqueta(client);
    if (!labelId) {
        throw new Error(total
            ? `No existe la etiqueta "${CONFIG.etiqueta}" (la cuenta tiene ${total}). Créala en WhatsApp o revisa cómo está escrita.`
            : 'Esta cuenta de WhatsApp no tiene etiquetas. Solo existen en WhatsApp Business.');
    }
    await waLabels.alternar(chatId, labelId, { quitar });
    // La caché de este chat deja de valer en cuanto se toca su etiqueta.
    cacheChat.delete(chatId);
    etiquetaCache = { ...etiquetaCache, at: 0 };
    return { etiquetado: !quitar };
}

const chatIdDeTelefono = (telefono) => waLabels.chatIdDeTelefono(telefono);

/** Cuántas etiquetas ve WhatsApp ahora mismo (0 = aún no ha cargado, o ninguna). */
async function totalDeEtiquetas() {
    try { return (await waLabels.listar()).length; }
    catch (e) {
        // Se dice POR QUÉ. Tragarse este error hacía que cualquier fallo de
        // lectura se anunciara como "WhatsApp aún no ha cargado sus etiquetas",
        // que es una explicación tranquilizadora y falsa: el bot se quedaba
        // reintentando para siempre sin que nada apuntara a la causa.
        console.warn('[bot/wa] no se pudieron contar las etiquetas:', e.message);
        return 0;
    }
}

/** Id de la etiqueta configurada, o null. */
async function idDeNuestraEtiqueta(client) {
    const objetivo = String(CONFIG.etiqueta).trim().toLowerCase();
    const todas = await leerEtiquetas();
    const l = todas.find(x => x.name.trim().toLowerCase() === objetivo);
    return { id: l ? l.id : null, total: todas.length };
}

/**
 * ¿Lleva este chat la etiqueta?
 *
 * Se pregunta POR CHAT (`getChatLabels`), no listando la etiqueta entera.
 * `getChatsByLabelId` termina en `Promise.all(chatIds.map(getChatById))`, o sea
 * que hidrata un objeto Chat completo por cada chat etiquetado: con 50 chats
 * son 50 evaluaciones en el mismo Chrome del que depende TODA la app para
 * enviar. Esto es una sola evaluación, y solo del chat que acaba de escribir.
 */
async function consultarEtiquetaDeChat(chatId) {
    const client = whatsappService.getClient?.();
    if (!client) {
        etiquetaCache = { ...etiquetaCache, error: 'WhatsApp no conectado' };
        throw new Error('WhatsApp no conectado');
    }
    // Se compara por ID, no por nombre: las etiquetas del chat vienen como ids
    // y resolverlas a nombre exigiría serializar cada una — que es justo lo que
    // está roto. El id de la nuestra se resuelve una vez y se cachea.
    if (!etiquetaCache.id) {
        const { id, total } = await idDeNuestraEtiqueta(client);
        if (!id && total === 0) {
            // Cero etiquetas suele ser "WhatsApp aún no las ha cargado", no
            // "esta cuenta no tiene". No se cachea: se vuelve a preguntar.
            etiquetaCache = { ...etiquetaCache, at: 0, error: 'WhatsApp aún no ha cargado las etiquetas.' };
            return false;
        }
        if (!id) {
            etiquetaCache = {
                id: null, chats: new Set(), at: Date.now(),
                error: total
                    ? `No existe la etiqueta "${CONFIG.etiqueta}" (la cuenta tiene ${total}). Revisa cómo está escrita.`
                    : `No existe la etiqueta "${CONFIG.etiqueta}" en esta cuenta de WhatsApp `
                      + `(recuerda: las etiquetas solo existen en WhatsApp Business)`,
            };
            return false;
        }
        etiquetaCache = { ...etiquetaCache, id, error: null };
    }
    const ids = await leerEtiquetasDeChat(client, chatId);
    etiquetaCache = { ...etiquetaCache, error: null };
    return ids.includes(etiquetaCache.id);
}

async function estaEtiquetado(chatId) {
    const cacheado = cacheChat.get(chatId);
    if (cacheado) {
        const ttl = cacheado.etiquetado ? ETIQUETA_TTL_SI_MS : ETIQUETA_TTL_NO_MS;
        if (Date.now() - cacheado.at < ttl) return cacheado.etiquetado;
    }

    // De-dupe: si ya hay una consulta en vuelo para este chat, se comparte.
    if (consultasEnVuelo.has(chatId)) return consultasEnVuelo.get(chatId);

    const promesa = (async () => {
        try {
            const etiquetado = await consultarEtiquetaDeChat(chatId);
            cacheChat.set(chatId, { etiquetado, at: Date.now() });
            return etiquetado;
        } catch (e) {
            // Un fallo de lectura NO es un "no". Se registra en `etiquetaCache.error`
            // para que `despachar` sepa que no debe descartar el mensaje, y se
            // devuelve false para no contestar a ciegas: ante la duda, callar.
            etiquetaCache = { ...etiquetaCache, error: `No se pudieron leer las etiquetas: ${e.message}` };
            console.warn('[bot/wa] getChatLabels:', e.message);
            return false;
        } finally {
            consultasEnVuelo.delete(chatId);
        }
    })();

    consultasEnVuelo.set(chatId, promesa);
    return promesa;
}

/**
 * Lista completa de chats con la etiqueta. SOLO para el panel de administración
 * y bajo petición expresa: es la llamada cara descrita arriba, y no hace falta
 * para decidir si se contesta a un chat concreto.
 */
async function refrescarEtiqueta({ force = false } = {}) {
    if (!force && Date.now() - etiquetaCache.at < ETIQUETA_TTL_SI_MS) return etiquetaCache;

    const client = whatsappService.getClient?.();
    if (!client) {
        etiquetaCache = { ...etiquetaCache, error: 'WhatsApp no conectado' };
        return etiquetaCache;
    }
    try {
        const todas = await leerEtiquetas();
        const objetivo = String(CONFIG.etiqueta).trim().toLowerCase();
        const label = todas.find(l => l.name.trim().toLowerCase() === objetivo);
        if (!label) {
            // Las etiquetas solo existen en WhatsApp Business. Si la cuenta
            // conectada fuera personal, aquí no habría ninguna y hay que
            // decirlo con esas palabras, no dejar un "0 chats" que no explica nada.
            etiquetaCache = {
                id: null, chats: new Set(), at: Date.now(),
                error: `No existe la etiqueta "${CONFIG.etiqueta}" en esta cuenta de WhatsApp `
                    + `(recuerda: las etiquetas solo existen en WhatsApp Business)`,
            };
            return etiquetaCache;
        }
        const chats = await leerChatsDeEtiqueta(client, label.id);
        etiquetaCache = {
            id: label.id,
            chats: new Set(chats || []),
            at: Date.now(),
            error: null,
        };
        // Al refrescar a mano se tira la caché por chat: es lo que hace el botón
        // "refrescar etiqueta" del panel, y su sentido es ver el efecto YA.
        if (force) cacheChat.clear();
        console.log(`[bot/wa] Etiqueta "${CONFIG.etiqueta}" → ${etiquetaCache.chats.size} chat(s).`);
    } catch (e) {
        etiquetaCache = { ...etiquetaCache, at: Date.now(), error: `No se pudieron leer las etiquetas: ${e.message}` };
        console.warn('[bot/wa] getLabels:', e.message);
    }
    return etiquetaCache;
}

// ───────────────────────────────────────────────────────────────────────────
// ENTRADA — un mensaje acaba de llegar
// ───────────────────────────────────────────────────────────────────────────

/** Normaliza para comparar textos (respuestas del bot vs. mensajes del chat). */
const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();

// ───────────────────────────────────────────────────────────────────────────
// FIRMA
// ---------------------------------------------------------------------------
// Se pone AQUÍ y no se le deja al modelo. Aunque el prompt la pide, la escribe
// distinta cada vez —con guion o sin él, en negrita o en dos renglones sueltos—
// y esa es la línea que identifica el mensaje como nuestro: en un chat donde
// unas veces contesta una persona y otras el asistente, la firma es lo único
// constante. Un texto con firma propia no se duplica.
// ───────────────────────────────────────────────────────────────────────────

/**
 * A dónde se le escribe a este chat.
 *
 * REGLA — se envía al TELÉFONO, nunca al `@lid`. Medido el 25/08/2026: los
 * mensajes dirigidos a `71159068520593@lid` se quedaban en la cola con otro
 * error minificado ("t") y agotaban los 5 reintentos, mientras que el MISMO
 * texto al número de siempre salía a la primera. El `@lid` sirve para RECONOCER
 * quién escribe —es como llega el mensaje— pero no para contestarle.
 *
 * Sin teléfono resuelto se cae al identificador original: más vale intentarlo y
 * que falle que no intentarlo.
 */
const destinoDe = (fila) => fila.telefono || fila.chat_id;

const FIRMA = '*BROKERGY — Ingeniería Energética*';

function asegurarFirma(texto) {
    const t = String(texto || '').trimEnd();
    if (!t) return t;
    // Se quitan las variantes que haya escrito el modelo (con o sin negrita,
    // con guion o raya, en una línea o en dos) antes de poner la buena.
    const limpio = t
        .replace(/\n*\s*\*?BROKERGY\*?\s*[—–-]?\s*\n?\s*\*?(?:Ingenier[íi]a\s+Energ[ée]tica)?\*?\s*$/i, '')
        .replace(/\n*\s*(?:Un saludo|Saludos|Gracias)[,.]?\s*$/i, '')
        .trimEnd();
    return `${limpio}\n\n${FIRMA}`;
}

/**
 * Se engancha a `client.on('message')`. Debe ser BARATO y no lanzar nunca:
 * cuelga del bucle de eventos de la sesión de WhatsApp que usa toda la app.
 */
async function onMensajeEntrante(msg) {
    try {
        if (!CONFIG.enabled) return;

        const chatId = msg?.from || '';
        // Grupos (`@g.us`), estados y difusiones fuera: el bot habla de un
        // expediente concreto con una persona concreta. Se admiten las dos
        // formas de identificar a una persona — el número de siempre y el `@lid`
        // nuevo — porque WhatsApp está migrando de la primera a la segunda.
        if (!chatId.endsWith('@c.us') && !chatId.endsWith('@lid')) return;
        if (msg.fromMe) return;
        if (msg.isStatus) return;

        // LISTA BLANCA de tipos, no lista negra. WhatsApp emite en los chats
        // sus propias notificaciones de sistema ('e2e_notification',
        // 'notification_template', cambios de número, "los mensajes temporales
        // se han desactivado"…), y todas llegan por este mismo evento con el
        // cuerpo vacío. Con una lista negra, cualquier tipo nuevo que Meta
        // añada mañana despertaría al bot para contestar a un mensaje que el
        // cliente no ha escrito.
        const tipo = msg.type || 'chat';
        if (!TIPOS_ADMITIDOS.has(tipo)) return;

        // El contenido de una foto o un audio no se interpreta, pero SÍ se
        // registra que ha llegado: el asistente tiene que poder decir "he
        // recibido tu foto, le echa un vistazo un compañero" en vez de
        // contestar como si no hubiera pasado nada. Con pie de foto se
        // conservan las dos cosas — el pie suele ser la pregunta de verdad.
        const cuerpo = String(msg.body || '').trim();
        const nota = tipo !== 'chat' ? `[el cliente ha enviado ${descripcionAdjunto(tipo)}]` : '';
        const texto = [nota, cuerpo].filter(Boolean).join(' ');
        if (!texto) return;

        // Los descartes se DICEN. Un mensaje ignorado en silencio es
        // indistinguible de un bot roto: el 25/08/2026 se perdieron veinte
        // minutos buscando una avería que no existía — el chat simplemente no
        // estaba en la lista blanca de pruebas, y nada lo contaba.
        if (!await enListaDePrueba(chatId)) {
            console.log(`[bot/wa] ${chatId} escribió, pero NO está en BOT_WHATSAPP_CHATS_PRUEBA. Se ignora.`);
            return;
        }
        if (!await estaEtiquetado(chatId)) {
            console.log(`[bot/wa] ${chatId} escribió, pero su chat no lleva la etiqueta "${CONFIG.etiqueta}". Se ignora.`);
            return;
        }

        // El teléfono es lo único con lo que se puede buscar a esta persona en
        // la base. Sin él no hay dossier posible: se registra igual (para que
        // quede constancia y se pueda escalar) pero el cerebro lo verá como un
        // número desconocido.
        const telefono = await telefonoDeChat(chatId);
        if (!telefono) console.warn(`[bot/wa] ${chatId} sin teléfono resoluble; se atenderá como desconocido.`);

        await encolar({
            chatId,
            telefono,
            nombre: msg._data?.notifyName || null,
            texto,
            waId: msg.id?._serialized || null,
        });
    } catch (e) {
        console.error('[bot/wa] onMensajeEntrante:', e.message);
    }
}

const ADJUNTOS = {
    image: 'una foto', video: 'un vídeo', ptt: 'un audio', audio: 'un audio',
    document: 'un documento', location: 'una ubicación',
};
// Lo que se admite como "algo que ha escrito o mandado una persona". Los
// stickers quedan fuera a propósito: son la versión emoji de un "ok" y no
// merecen ni una respuesta ni un turno del asistente.
const TIPOS_ADMITIDOS = new Set(['chat', ...Object.keys(ADJUNTOS)]);
const descripcionAdjunto = (t) => ADJUNTOS[t] || 'un archivo';

/**
 * Registra el mensaje. Si el chat ya tiene una fila PENDIENTE, se le concatena
 * y se reinicia la ventana: son la misma pregunta partida en trozos.
 */
// Candado por chat. `encolar` es un leer-y-luego-escribir, y los mensajes que
// hay que agrupar son justamente los que llegan a la vez: dos que entren en el
// mismo instante leen los dos "no hay fila abierta", insertan los dos, y el
// cliente recibe DOS respuestas a la misma pregunta. Basta con un candado en
// memoria porque la sesión de WhatsApp es un singleton atado a un teléfono:
// solo hay un proceso escuchando ese chat.
const candados = new Map();

function conCandado(clave, tarea) {
    const anterior = candados.get(clave) || Promise.resolve();
    // Se encadena sobre el anterior pase lo que pase: si una tarea falla, la
    // siguiente tiene que ejecutarse igual, no quedarse esperando para siempre.
    const actual = anterior.catch(() => {}).then(tarea);
    candados.set(clave, actual);
    actual.catch(() => {}).finally(() => {
        // Se limpia solo si nadie se ha encadenado detrás, para no dejar el Map
        // creciendo con un candado por cada chat que haya escrito alguna vez.
        if (candados.get(clave) === actual) candados.delete(clave);
    });
    return actual;
}

function encolar(datos) {
    return conCandado(datos.chatId, () => encolarSinCandado(datos));
}

async function encolarSinCandado({ chatId, telefono, nombre, texto, waId }) {
    const cuando = new Date();
    // Lo que llega fuera de horario no se descarta: espera a la apertura. El
    // cliente escribió a las 22:10 y merece respuesta a las 08:00, no silencio.
    const after = new Date(Math.max(
        cuando.getTime() + CONFIG.ventanaMs,
        proximaApertura(cuando).getTime(),
    ));

    const { data: abierta } = await supabase
        .from('whatsapp_bot_mensajes')
        .select('id, pregunta, mensajes_n')
        .eq('chat_id', chatId)
        .eq('estado', 'PENDIENTE')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (abierta) {
        await supabase.from('whatsapp_bot_mensajes').update({
            pregunta: `${abierta.pregunta}\n${texto}`,
            mensajes_n: (abierta.mensajes_n || 1) + 1,
            ultimo_wa_id: waId,
            responder_after: after.toISOString(),
        }).eq('id', abierta.id);
        return;
    }

    await supabase.from('whatsapp_bot_mensajes').insert({
        chat_id: chatId,
        telefono,
        contacto_nombre: nombre,
        pregunta: texto,
        ultimo_wa_id: waId,
        estado: 'PENDIENTE',
        responder_after: after.toISOString(),
    });
}

// ───────────────────────────────────────────────────────────────────────────
// RECUPERAR LO QUE LLEGÓ CON EL BACKEND PARADO
// ---------------------------------------------------------------------------
// El listener de WhatsApp solo existe mientras el proceso está vivo. Los
// mensajes que entran durante un reinicio —y en producción hay uno en CADA
// deploy— llegan al móvil pero NO pasan por aquí: no queda ni rastro de ellos
// en la app, y el cliente se queda esperando una respuesta que nadie sabe que
// debe. Es el peor tipo de fallo, porque no se parece a un fallo.
//
// Al arrancar se repasan los chats etiquetados y se recoge lo que quedó sin
// atender. Con freno, porque despertar de golpe conversaciones viejas es peor
// que el problema que se arregla:
//
//   · Solo mensajes de las últimas horas (BOT_RECUPERAR_HORAS).
//   · Solo si NADIE contestó después — ni el bot ni una persona.
//   · Solo si no está ya registrado en la bandeja.
//   · Y con un tope de chats, para no encolar media cartera de una vez.
// ───────────────────────────────────────────────────────────────────────────

const RECUPERAR = {
    activo: bool(process.env.BOT_RECUPERAR, true),
    horas: num(process.env.BOT_RECUPERAR_HORAS, 6),
    maxChats: num(process.env.BOT_RECUPERAR_MAX_CHATS, 25),
};

let recuperado = false;

async function recuperarPerdidos() {
    if (recuperado || !RECUPERAR.activo) return;
    recuperado = true;

    const client = whatsappService.getClient?.();
    if (!client) { recuperado = false; return; }

    const et = await refrescarEtiqueta({ force: true });
    if (!et.id || !et.chats.size) { recuperado = false; return; }

    const corte = Date.now() - RECUPERAR.horas * 3600_000;
    let recogidos = 0;

    for (const chatId of [...et.chats].slice(0, RECUPERAR.maxChats)) {
        try {
            const msgs = await ultimosMensajes(client, chatId, 15);
            if (!msgs?.length) continue;

            // De atrás hacia delante hasta el último mensaje NUESTRO: lo que
            // haya después es lo que quedó sin contestar. Si el último de todos
            // es nuestro, este chat está atendido y no hay nada que hacer.
            const pendientes = [];
            for (let i = msgs.length - 1; i >= 0; i--) {
                if (msgs[i].fromMe) break;
                pendientes.unshift(msgs[i]);
            }
            if (!pendientes.length) continue;

            const ultimo = pendientes[pendientes.length - 1];
            if ((ultimo.timestamp || 0) * 1000 < corte) continue;   // demasiado viejo

            // ¿Ya está en la bandeja? Se compara por fecha: cualquier fila de
            // ese chat creada DESPUÉS del mensaje significa que el listener sí
            // lo vio. Comparar por texto sería frágil (el cliente repite).
            const desde = new Date(((pendientes[0].timestamp || 0) * 1000) - 60_000).toISOString();
            const { data: yaHay } = await supabase
                .from('whatsapp_bot_mensajes')
                .select('id')
                .eq('chat_id', chatId)
                .gte('created_at', desde)
                .limit(1);
            if (yaHay?.length) continue;

            const texto = pendientes.map(m => m.body).filter(Boolean).join('\n').trim();
            if (!texto) continue;

            const telefono = await telefonoDeChat(chatId);
            await encolar({ chatId, telefono, nombre: null, texto, waId: null });
            recogidos++;
            console.log(`[bot/wa] Recuperado un mensaje sin atender de ${telefono || chatId}: `
                + `"${texto.replace(/\s+/g, ' ').slice(0, 60)}"`);
        } catch (e) {
            console.warn(`[bot/wa] recuperando ${chatId}:`, e.message);
        }
    }

    if (recogidos) {
        console.log(`[bot/wa] ${recogidos} mensaje(s) recuperados tras el arranque.`);
    }
}

// ───────────────────────────────────────────────────────────────────────────
// PURGA DE LA BANDEJA
// ---------------------------------------------------------------------------
// La bandeja crece con cada mensaje y nadie la vacía. No es un volumen que
// vaya a tumbar nada por sí solo, pero una tabla que solo crece acaba siendo un
// problema el día que a alguien se le ocurre listarla entera. Se conserva lo
// que sirve para auditar (qué le dijo el bot a quién) y se tira lo viejo.
// ───────────────────────────────────────────────────────────────────────────

const PURGA_DIAS = num(process.env.BOT_PURGA_DIAS, 120);
const PURGA_CADA_MS = 12 * 3600_000;
let ultimaPurga = 0;

async function purgarBandeja() {
    if (Date.now() - ultimaPurga < PURGA_CADA_MS) return;
    ultimaPurga = Date.now();
    try {
        const limite = new Date(Date.now() - PURGA_DIAS * 86400_000).toISOString();
        const { error, count } = await supabase
            .from('whatsapp_bot_mensajes')
            .delete({ count: 'exact' })
            .lt('created_at', limite)
            // Lo PENDIENTE no se toca aunque sea viejo: si algo lleva ahí
            // atascado meses, borrarlo es esconder el problema.
            .neq('estado', 'PENDIENTE');
        if (error) throw new Error(error.message);
        if (count) console.log(`[bot/wa] Purgados ${count} mensajes de más de ${PURGA_DIAS} días.`);
    } catch (e) {
        console.warn('[bot/wa] purga de la bandeja:', e.message);
    }
}

// ───────────────────────────────────────────────────────────────────────────
// BARRIDO — despachar lo que ya toca
// ───────────────────────────────────────────────────────────────────────────

let barriendo = false;
let barriendoDesde = 0;

// ─── Comprobación de arranque ────────────────────────────────────────────────
// La PRIMERA vez que WhatsApp queda listo se mira si la etiqueta existe de
// verdad y cuántos chats la llevan, y se deja dicho en el log.
//
// Sin esto, una etiqueta mal escrita (o una cuenta que no sea Business, donde
// las etiquetas ni existen) se manifiesta como "escribo y no contesta nadie":
// el síntoma es el mismo que si el bot estuviera apagado, y no hay nada en
// ningún sitio que lo explique. Es la avería más probable de todas y la única
// que se puede detectar sola.
let comprobado = false;

/**
 * Por qué han fallado las etiquetas, en cristiano.
 *
 * `getLabels()` de whatsapp-web.js entra en las tripas de WhatsApp Web
 * (`window.require('WAWebCollections').Label`) y, cuando algo no encaja, lo que
 * sube es el nombre minificado de una variable: un error que pone "r" y ya. Con
 * eso no se puede arreglar nada, y las dos causas reales son muy distintas —
 * una cuenta que no es Business (donde las etiquetas ni existen) o un cambio de
 * WhatsApp que ha roto la librería—, así que se preguntan por separado.
 */
async function diagnosticarEtiquetas() {
    const client = whatsappService.getClient?.();
    if (!client?.pupPage) return ['No hay sesión de WhatsApp viva para diagnosticar.'];
    try {
        const d = await conPlazo(client.pupPage.evaluate(() => {
            const out = { colecciones: false, label: false, n: null, business: null, error: null };
            try {
                const C = window.require('WAWebCollections');
                out.colecciones = !!C;
                out.label = !!(C && C.Label);
                if (C?.Label?.getModelsArray) out.n = C.Label.getModelsArray().length;
            } catch (e) { out.error = String(e && e.message || e); }
            try {
                const me = window.require('WAWebUserPrefsMeUser');
                out.business = window.Store?.Conn?.isBusinessAccount ?? (me ? null : null);
            } catch (_) { /* no siempre está */ }
            return out;
        }), PLAZO_WA_MS, 'diagnóstico de etiquetas');

        const lineas = [];
        if (!d.colecciones) {
            lineas.push('WhatsApp Web ha cambiado por dentro y la librería no encuentra sus módulos.');
            lineas.push('Suele arreglarse actualizando whatsapp-web.js (npm i whatsapp-web.js@latest).');
        } else if (!d.label) {
            lineas.push('La cuenta conectada NO tiene etiquetas: las etiquetas solo existen en');
            lineas.push('WhatsApp BUSINESS. Comprueba que el móvil vinculado es el de la empresa.');
        } else if (d.n === 0) {
            lineas.push('La cuenta es Business pero no hay ninguna etiqueta creada todavía.');
        } else {
            lineas.push(`La cuenta tiene ${d.n} etiqueta(s), así que el fallo es al leerlas.`);
            lineas.push('Probablemente un cambio de WhatsApp Web: actualiza whatsapp-web.js.');
        }
        if (d.error) lineas.push(`Detalle: ${d.error}`);
        return lineas;
    } catch (e) {
        return [`No se pudo diagnosticar: ${e.message}`];
    }
}

async function comprobarEtiquetaAlConectar() {
    if (comprobado) return;
    const et = await refrescarEtiqueta({ force: true });

    // ⚠️ NO se da por comprobado hasta que la respuesta sea CONCLUYENTE.
    //
    // WhatsApp Web tarda en cargar sus colecciones: durante los primeros
    // segundos tras el `ready`, `Label.getModelsArray()` devuelve una lista
    // VACÍA aunque la cuenta tenga 16 etiquetas. Marcando la comprobación como
    // hecha antes de mirar el resultado, ese vacío quedaba grabado y el bot se
    // pasaba toda la sesión creyendo que la cuenta no tiene etiquetas — sin
    // contestar a nadie y diciendo en el log algo que no era verdad.
    const sinEtiquetas = !et.id && !et.error;
    const noCargado = !et.id && /no existe la etiqueta/i.test(et.error || '') && !etiquetaCache.chats.size;
    if (sinEtiquetas || noCargado) {
        const total = await totalDeEtiquetas();
        if (total === 0) {
            console.log('[bot/wa] WhatsApp aún no ha cargado sus etiquetas; se reintenta en el siguiente barrido.');
            // La caché tampoco puede quedarse con el "no": se tira para que la
            // siguiente consulta vuelva a preguntar de verdad.
            etiquetaCache = { id: null, chats: new Set(), at: 0, error: null };
            return;
        }
    }
    comprobado = true;
    if (et.error) {
        console.warn(`[bot/wa] ⚠️  ${et.error}`);
        for (const linea of await diagnosticarEtiquetas()) console.warn(`[bot/wa]    ${linea}`);
        console.warn('[bot/wa]    El bot NO podrá contestar hasta que esto se resuelva.');
        return;
    }
    if (!et.chats.size) {
        console.warn(`[bot/wa] ⚠️  La etiqueta "${CONFIG.etiqueta}" existe pero no la lleva ningún chat.`);
        return;
    }
    // Se resuelve el teléfono de cada uno: un `@lid` a secas no le dice nada a
    // nadie, y lo que hay que poder comprobar de un vistazo es SI ES EL CHAT
    // QUE CREÍAS.
    const conTelefono = [];
    for (const chat of et.chats) {
        const tel = await telefonoDeChat(chat).catch(() => null);
        conTelefono.push(tel ? `${tel} (${chat})` : chat);
    }
    console.log(`[bot/wa] Etiqueta "${CONFIG.etiqueta}" OK · ${et.chats.size} chat(s): ${conTelefono.join(', ')}`);

    // Tener las dos cosas bien por separado y mal en conjunto —la etiqueta en un
    // chat y la lista blanca apuntando a otro— es el error que cuesta media hora
    // encontrar, porque el síntoma es "no contesta" y todo parece correcto.
    for (const chat of CONFIG.chatsPrueba) {
        const ok = await enListaDePruebaCubre(chat, et.chats);
        console.log(ok
            ? `[bot/wa] Chat de prueba ${chat}: etiquetado ✔ — listo para responder.`
            : `[bot/wa] ⚠️  Chat de prueba ${chat} NO tiene la etiqueta "${CONFIG.etiqueta}". No se le contestará.`);
    }
}

/** ¿Alguno de los chats etiquetados es el de la lista blanca? (compara por teléfono). */
async function enListaDePruebaCubre(entrada, chatsEtiquetados) {
    if (chatsEtiquetados.has(entrada)) return true;
    const nueve = String(entrada).replace(/\D/g, '').slice(-9);
    if (!nueve) return false;
    for (const chat of chatsEtiquetados) {
        const tel = await telefonoDeChat(chat).catch(() => null);
        if (tel && tel.slice(-9) === nueve) return true;
    }
    return false;
}

// Si un barrido se queda colgado, el bot deja de contestar PARA SIEMPRE y sin
// decir nada. Todas las llamadas a Puppeteer llevan plazo y Gemini lleva el
// suyo, así que no debería pasar; este es el cinturón por si aparece una espera
// nueva sin plazo. Se elige holgado a propósito: cortar un barrido legítimo a
// mitad es peor que esperar un minuto de más.
const BARRIDO_MAX_MS = num(process.env.BOT_WHATSAPP_BARRIDO_MAX_MS, 5 * 60 * 1000);

// Cuánto se espera cuando el modelo dice que hemos gastado la cuota. Google
// suele pedir ~50 s en el plan gratuito; se deja margen de sobra porque no
// corre prisa: el cliente ya está esperando su respuesta desde hace la ventana
// de silencio, y un minuto más no cambia nada.
const REINTENTO_CUOTA_MS = num(process.env.BOT_WHATSAPP_REINTENTO_CUOTA_MS, 2 * 60 * 1000);

async function barrer() {
    if (!CONFIG.enabled) return;
    if (barriendo) {
        if (Date.now() - barriendoDesde < BARRIDO_MAX_MS) return;
        console.error(`[bot/wa] Barrido colgado más de ${BARRIDO_MAX_MS / 1000}s; se libera el cerrojo.`);
        barriendo = false;
    }
    if (!whatsappService.getStatus?.()?.ready) return;
    await comprobarEtiquetaAlConectar().catch(e => console.warn('[bot/wa] comprobación inicial:', e.message));
    // Lo que entró mientras el proceso estaba caído (un deploy, un reinicio).
    await recuperarPerdidos().catch(e => console.warn('[bot/wa] recuperación:', e.message));
    purgarBandeja().catch(() => {});
    barriendo = true;
    barriendoDesde = Date.now();
    try {
        const { data: filas, error } = await supabase
            .from('whatsapp_bot_mensajes')
            .select('*')
            .eq('estado', 'PENDIENTE')
            .lte('responder_after', new Date().toISOString())
            .order('responder_after', { ascending: true })
            .limit(10);
        if (error) { console.error('[bot/wa] barrer:', error.message); return; }

        // UNA fila por chat y vuelta. Con el candado de `encolar` no debería
        // haber dos abiertas del mismo chat, pero si por lo que sea las hubiera
        // (una escritura desde otro sitio, un arrastre de una versión anterior),
        // despacharlas seguidas le manda al cliente dos respuestas a la vez.
        const vistos = new Set();
        for (const fila of filas || []) {
            if (vistos.has(fila.chat_id)) continue;
            vistos.add(fila.chat_id);
            try { await despachar(fila); }
            catch (e) {
                // CUOTA AGOTADA (429) no es un fallo del expediente: es que
                // hemos pedido demasiado seguido. Escalarlo le mandaría al
                // cliente un "te contesta un compañero" y a ti un aviso, cuando
                // lo único que hace falta es esperar un minuto. Se reprograma.
                if (e.status === 429) {
                    const cuando = new Date(Date.now() + REINTENTO_CUOTA_MS);
                    console.warn(`[bot/wa] cuota del modelo agotada; #${fila.id} se reintenta a las `
                        + cuando.toISOString());
                    await supabase.from('whatsapp_bot_mensajes')
                        .update({ responder_after: cuando.toISOString() })
                        .eq('id', fila.id);
                    // Y se corta el barrido entero: los siguientes chocarían
                    // con la misma cuota y gastarían intentos para nada.
                    break;
                }
                console.error(`[bot/wa] despachar #${fila.id}:`, e.message);
                // Un fallo del modelo o de la red no puede dejar al cliente sin
                // respuesta ni reintentarse en bucle: se escala a una persona,
                // que es lo que se haría si el bot no existiera.
                try { await escalar(fila, null, `Error del asistente: ${e.message}`); }
                catch (e2) {
                    // Si ni siquiera se puede escalar (Supabase caído, WhatsApp
                    // caído), la fila NO puede quedarse PENDIENTE para siempre
                    // reintentándose cada 30 s: se cierra y queda constancia.
                    console.error(`[bot/wa] tampoco se pudo escalar #${fila.id}:`, e2.message);
                    await cerrar(fila, { estado: 'DESCARTADO', motivo: `Error irrecuperable: ${e.message}` })
                        .catch(() => {});
                }
            }
        }
    } finally {
        barriendo = false;
    }
}

async function cerrar(fila, campos) {
    await supabase.from('whatsapp_bot_mensajes')
        .update({ respondido_at: new Date().toISOString(), ...campos })
        .eq('id', fila.id);
}

async function despachar(fila) {
    // ── Comprobaciones que pueden haber cambiado desde que entró el mensaje ──
    if (!enHorario()) {
        // Ha cerrado mientras esperaba (mensaje a las 19:59 con ventana de 25 s
        // no, pero sí uno que se quedó atrás por una caída de WhatsApp).
        await supabase.from('whatsapp_bot_mensajes')
            .update({ responder_after: proximaApertura().toISOString() })
            .eq('id', fila.id);
        return;
    }
    if (!await estaEtiquetado(fila.chat_id)) {
        // "No está etiquetado" y "no he podido comprobarlo" no son lo mismo. Si
        // la sesión se ha caído entre el barrido y esta comprobación, la lista
        // de chats viene vacía y descartar aquí tiraría a la basura la pregunta
        // de un cliente que sí estaba etiquetado. Se reintenta en el siguiente
        // barrido, cuando WhatsApp vuelva.
        if (etiquetaCache.error) {
            console.warn(`[bot/wa] #${fila.id} en espera: ${etiquetaCache.error}`);
            return;
        }
        return cerrar(fila, { estado: 'DESCARTADO', motivo: `El chat ya no tiene la etiqueta ${CONFIG.etiqueta}.` });
    }
    if (await respondidasHoy() >= CONFIG.maxDia) {
        await avisarStaff(fila, `⚠️ El bot ha llegado al tope de ${CONFIG.maxDia} respuestas hoy y ha dejado de contestar.`);
        return cerrar(fila, { estado: 'DESCARTADO', motivo: 'Tope diario alcanzado.' });
    }
    const humano = await humanoHaIntervenido(fila);
    if (humano) {
        return cerrar(fila, { estado: 'DESCARTADO', motivo: humano });
    }

    // ── Contexto + cerebro ──────────────────────────────────────────────────
    let ctx = await botContexto.construirContexto(fila.telefono);
    const historial = await historialDe(fila.chat_id, fila.id);
    let decision = await botCerebro.pensar(ctx, fila.pregunta, historial);

    // ── El cliente ha dicho de qué obra habla ───────────────────────────────
    // Se APRENDE (para el rato siguiente) y se VUELVE A PENSAR con el dossier ya
    // resuelto, en la misma vuelta. Si no, a "la de Tomelloso, ¿qué me falta?"
    // habría que contestarle "vale, ¿y qué necesitas?" y hacerle repetir la
    // pregunta que acaba de hacer.
    if (ctx.ambiguo && decision.elegido) {
        const elegido = ctx.asuntos[decision.elegido - 1];
        if (elegido?.oportunidad_id) {
            await botVinculos.sembrar(fila.chat_id, elegido.oportunidad_id, 'conversacion');
            ctx = await botContexto.construirContexto(fila.telefono);
            if (!ctx.ambiguo) {
                console.log(`[bot/wa] ${fila.chat_id} aclaró que habla de `
                    + `${elegido.referencia || elegido.numero_expediente}.`);
                decision = await botCerebro.pensar(ctx, fila.pregunta, historial);
            }
        }
    }

    const resumen = resumirContexto(ctx);

    if (decision.accion === 'CALLAR') {
        return cerrar(fila, { estado: 'DESCARTADO', motivo: decision.motivo || 'No procedía contestar.', contexto: resumen });
    }
    if (decision.accion === 'ESCALAR') {
        return escalar(fila, decision, decision.motivo, resumen);
    }

    // ── RESPONDER ───────────────────────────────────────────────────────────
    const texto = asegurarFirma(decision.mensaje);
    const envio = await whatsappService.sendText(destinoDe(fila), texto);
    await cerrar(fila, {
        estado: 'RESPONDIDO',
        respuesta: texto,
        // `sendText` ENCOLA: dice que sí mucho antes de que WhatsApp haya
        // entregado nada. Se guarda el id de la cola para poder comprobar
        // después si el mensaje llegó de verdad o murió reintentando — sin esto,
        // un RESPONDIDO no distingue "contestado" de "encolado y fallido", que
        // es justo la confusión que hubo el 25/08/2026.
        contexto: { ...resumen, cola_id: envio?.id ?? null },
        oportunidad_id: resumen.oportunidad_id || null,
        expediente_id: resumen.expediente_id || null,
        numero_expediente: resumen.numero_expediente || null,
    });
    console.log(`[bot/wa] Respondido a ${fila.chat_id} (${resumen.numero_expediente || 'sin expediente'}).`);
}

/**
 * Lo que se guarda del dossier: identificadores y un recuento. Ni los enlaces
 * con token, ni la lista entera del checklist — es una tabla de log, no una
 * copia del expediente.
 */
function resumirContexto(ctx) {
    const a = ctx?.asuntos?.[0] || null;
    return {
        conocido: !!ctx?.conocido,
        rol: ctx?.rol || null,
        ambiguo: !!ctx?.ambiguo,
        asuntos_n: ctx?.asuntos?.length || 0,
        numero_expediente: a?.numero_expediente || null,
        elegido_por: ctx?.elegidoPor || null,
        oportunidad_id: a?.oportunidad_id || null,
        expediente_id: a?.expediente_id || null,
        fase: a?.fase || null,
        estado_expediente: a?.estado_expediente || null,
        pendientes_n: a?.pendientes?.length || 0,
        pendientes: (a?.pendientes || []).map(p => p.clave),
    };
}

/** Cuántas respuestas ha mandado el bot en el día natural de Madrid. */
async function respondidasHoy() {
    const { y, m, d } = partesMadrid();
    const desde = madridAUtc(y, m, d, 0, 0).toISOString();
    const { count } = await supabase
        .from('whatsapp_bot_mensajes')
        .select('id', { count: 'exact', head: true })
        .in('estado', ['RESPONDIDO', 'ESCALADO'])
        .gte('respondido_at', desde);
    return count || 0;
}

/**
 * ¿Se ha metido una persona en la conversación?
 *
 * Si alguien del equipo está hablando con ese cliente, el bot no interrumpe:
 * dos respuestas distintas a la misma pregunta es peor que ninguna.
 *
 * La dificultad es que los mensajes del bot TAMBIÉN son `fromMe`. Se
 * distinguen por el texto: lo que el bot manda queda registrado aquí, así que
 * un `fromMe` que no case con ninguna respuesta suya de las últimas 24 h es de
 * una persona (o un aviso automático de la app, que para el caso vale igual:
 * si acaba de salir algo por ese chat, mejor esperar).
 */
async function humanoHaIntervenido(fila) {
    const client = whatsappService.getClient?.();
    if (!client) return null;
    try {
        const msgs = await ultimosMensajes(client, fila.chat_id, 15);
        const salidos = (msgs || []).filter(m => m.fromMe);
        if (!salidos.length) return null;

        const desde = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
        const { data: mias } = await supabase
            .from('whatsapp_bot_mensajes')
            .select('respuesta')
            .eq('chat_id', fila.chat_id)
            .not('respuesta', 'is', null)
            .gte('created_at', desde);
        const textosBot = new Set((mias || []).map(r => norm(r.respuesta)));

        const corte = Date.now() - CONFIG.silencioHumanoMin * 60_000;
        const llegada = new Date(fila.created_at).getTime();
        for (const m of salidos) {
            const ts = (m.timestamp || 0) * 1000;
            if (textosBot.has(norm(m.body))) continue;          // es del propio bot
            if (ts >= llegada) return 'Un compañero contestó antes que el bot.';
            if (ts >= corte) return `Hay una conversación abierta con una persona (último mensaje nuestro hace menos de ${CONFIG.silencioHumanoMin} min).`;
        }
        return null;
    } catch (e) {
        console.warn('[bot/wa] humanoHaIntervenido:', e.message);
        return null;   // ante un fallo de lectura, no bloqueamos la respuesta
    }
}

/**
 * Últimos mensajes de un chat, como `[{ fromMe, body, timestamp }]`.
 *
 * `getChatById().fetchMessages()` de la librería vuelve a pasar por el
 * `serialize()` que WhatsApp rompió — medido: fallaba con el mismo error "r" y
 * dejaba `humanoHaIntervenido` devolviendo siempre null. Eso NO se nota: el bot
 * sigue contestando, solo que deja de respetar al compañero que ya estaba
 * hablando con ese cliente, que es justo lo que no se puede permitir.
 */
async function ultimosMensajes(client, chatId, limite) {
    try {
        const crudos = await conPlazo(client.pupPage.evaluate((id, n) => {
            const C = window.require('WAWebCollections');
            const chat = C && C.Chat && C.Chat.get(id);
            if (!chat || !chat.msgs) return null;
            const lista = chat.msgs.getModelsArray ? chat.msgs.getModelsArray() : [];
            return lista.slice(-n).map(m => ({
                fromMe: !!(m.id && m.id.fromMe),
                body: String(m.body || m.caption || ''),
                timestamp: Number(m.t) || 0,
            }));
        }, chatId, limite), PLAZO_WA_MS, 'últimos mensajes del chat');
        if (crudos) return crudos;
    } catch (e) {
        console.warn('[bot/wa] últimos mensajes del chat:', e.message);
        if (e.plazoAgotado) throw e;
    }
    const chat = await conPlazo(client.getChatById(chatId), PLAZO_WA_MS, 'getChatById');
    const msgs = await conPlazo(chat.fetchMessages({ limit: limite }), PLAZO_WA_MS, 'fetchMessages');
    return (msgs || []).map(m => ({ fromMe: !!m.fromMe, body: String(m.body || ''), timestamp: Number(m.timestamp) || 0 }));
}

/** Turnos anteriores del chat, del más antiguo al más reciente. */
async function historialDe(chatId, excluirId) {
    const { data } = await supabase
        .from('whatsapp_bot_mensajes')
        .select('pregunta, respuesta, estado, created_at')
        .eq('chat_id', chatId)
        .neq('id', excluirId)
        .in('estado', ['RESPONDIDO', 'ESCALADO'])
        .order('created_at', { ascending: false })
        .limit(CONFIG.historialTurnos);
    return (data || []).reverse();
}

// ───────────────────────────────────────────────────────────────────────────
// ESCALADO
// ───────────────────────────────────────────────────────────────────────────

async function escalar(fila, decision, motivo, resumen = null) {
    const mensaje = asegurarFirma(decision?.mensaje || botCerebro.MENSAJE_ESCALADO);
    // Al cliente se le contesta SIEMPRE algo. Dejarle sin respuesta mientras se
    // avisa por dentro es lo mismo que ignorarle: él no ve nuestro aviso.
    let envio = null;
    try { envio = await whatsappService.sendText(destinoDe(fila), mensaje); }
    catch (e) { console.error('[bot/wa] no se pudo avisar al cliente:', e.message); }

    await avisarStaff(fila, null, motivo, resumen);

    await cerrar(fila, {
        estado: 'ESCALADO',
        respuesta: mensaje,
        motivo: motivo || 'Sin motivo declarado.',
        contexto: { ...(resumen || {}), cola_id: envio?.id ?? null },
        numero_expediente: resumen?.numero_expediente || null,
    });
    console.log(`[bot/wa] ESCALADO ${fila.chat_id}: ${motivo || '—'}`);
}

/** Aviso al staff por WhatsApp + email. Nunca revienta el despacho. */
async function avisarStaff(fila, titular = null, motivo = null, resumen = null) {
    const quien = fila.contacto_nombre || fila.telefono;
    const exp = resumen?.numero_expediente ? ` · Exp. *${resumen.numero_expediente}*` : '';
    const cuerpo = titular || [
        `🤖 *El bot necesita que contestes tú*`,
        ``,
        `De: *${quien}* (+${fila.telefono})${exp}`,
        motivo ? `Motivo: ${motivo}` : null,
        ``,
        `Lo que ha escrito:`,
        `_${String(fila.pregunta).slice(0, 700)}_`,
        ``,
        `👉 https://wa.me/${fila.telefono}`,
        resumen?.numero_expediente ? `📁 ${FRONTEND()}` : null,
    ].filter(v => v !== null).join('\n');

    try { await whatsappService.sendText(adminPhone(), cuerpo); }
    catch (e) { console.error('[bot/wa] aviso WhatsApp al staff:', e.message); }

    try {
        await emailService.sendMail({
            to: adminEmail(),
            subject: titular
                ? '[Bot WhatsApp] Aviso'
                : `[Bot WhatsApp] Contesta tú — ${quien}${resumen?.numero_expediente ? ` (${resumen.numero_expediente})` : ''}`,
            text: cuerpo.replace(/\*/g, '').replace(/_/g, ''),
            from: process.env.ALERT_EMAIL_FROM || emailService.getFallbackSender() || undefined,
        });
    } catch (e) { console.error('[bot/wa] aviso email al staff:', e.message); }
}

// ───────────────────────────────────────────────────────────────────────────
// ARRANQUE
// ───────────────────────────────────────────────────────────────────────────

let timer = null;

function start() {
    if (timer) return;
    if (!CONFIG.enabled) {
        console.log('[bot/wa] Bot de WhatsApp APAGADO (BOT_WHATSAPP_ENABLED != true).');
        return;
    }
    // SALVAGUARDA — encender el bot sin lista blanca lo suelta sobre TODOS los
    // chats etiquetados a la vez. Salir del modo prueba tiene que ser una
    // decisión escrita, no lo que pasa por defecto al poner `enabled=true` y
    // olvidarse de rellenar la otra variable.
    if (!CONFIG.chatsPrueba.length && !CONFIG.todosLosEtiquetados) {
        console.warn('[bot/wa] Bot HABILITADO pero SIN ARRANCAR: no hay chats de prueba.\n'
            + '         · Para probar:  BOT_WHATSAPP_CHATS_PRUEBA=34XXXXXXXXX@c.us\n'
            + '         · Para soltarlo sobre todos los etiquetados: BOT_WHATSAPP_TODOS=true');
        return;
    }
    whatsappService.onMessage(onMensajeEntrante);
    timer = setInterval(() => barrer().catch(e => console.error('[bot/wa] barrido:', e.message)),
        CONFIG.intervaloBarridoMs);
    if (timer.unref) timer.unref();
    console.log(`[bot/wa] Bot ACTIVO · etiqueta "${CONFIG.etiqueta}" · `
        + `${CONFIG.horaDesde}:00-${CONFIG.horaHasta}:00 Madrid · `
        + `${CONFIG.chatsPrueba.length ? `SOLO ${CONFIG.chatsPrueba.length} chat(s) de prueba` : 'todos los etiquetados'}`);
}

function stop() {
    if (timer) { clearInterval(timer); timer = null; }
}

/** Estado para el panel de administración. */
async function estado() {
    const et = await refrescarEtiqueta();
    const { y, m, d } = partesMadrid();
    const desde = madridAUtc(y, m, d, 0, 0).toISOString();
    const { data: hoy } = await supabase
        .from('whatsapp_bot_mensajes')
        .select('estado')
        .gte('created_at', desde);
    const cuenta = (e) => (hoy || []).filter(r => r.estado === e).length;
    return {
        activo: CONFIG.enabled && !!timer,
        etiqueta: CONFIG.etiqueta,
        etiquetaEncontrada: !!et.id,
        chatsEtiquetados: et.chats.size,
        // Los chatId concretos. Es lo que hay que copiar en
        // BOT_WHATSAPP_CHATS_PRUEBA, y averiguarlo a mano es adivinar el formato
        // ('34' + número + '@c.us'). Se listan como mucho 20: con la etiqueta
        // puesta en media cartera, la respuesta dejaría de ser legible.
        chatsEtiquetadosIds: [...et.chats].slice(0, 20),
        error: et.error,
        enHorario: enHorario(),
        horario: `${CONFIG.horaDesde}:00-${CONFIG.horaHasta}:00 (Madrid)`,
        proximaApertura: enHorario() ? null : proximaApertura().toISOString(),
        chatsPrueba: CONFIG.chatsPrueba,
        alcance: CONFIG.chatsPrueba.length
            ? `solo ${CONFIG.chatsPrueba.length} chat(s) de prueba`
            : (CONFIG.todosLosEtiquetados ? 'todos los chats etiquetados' : 'ninguno (falta lista de prueba)'),
        maxDia: CONFIG.maxDia,
        hoy: {
            respondidos: cuenta('RESPONDIDO'),
            escalados: cuenta('ESCALADO'),
            descartados: cuenta('DESCARTADO'),
            pendientes: cuenta('PENDIENTE'),
        },
    };
}

module.exports = {
    start, stop, estado, barrer, asegurarFirma,
    cambiarEtiquetaDelChat, chatIdDeTelefono, telefonoDeChat,
    onMensajeEntrante, refrescarEtiqueta, estaEtiquetado,
    /** Tira la caché de etiquetas por chat. Para el panel y las pruebas. */
    _limpiarCacheEtiquetas: () => { cacheChat.clear(); consultasEnVuelo.clear(); },
    /** Para las pruebas: permite volver a ejecutar la recuperación de arranque. */
    _resetRecuperacion: () => { recuperado = false; },
    _recuperarPerdidos: () => recuperarPerdidos(),
    _config: CONFIG,
    _enHorario: enHorario,
    _proximaApertura: proximaApertura,
    _partesMadrid: partesMadrid,
};
