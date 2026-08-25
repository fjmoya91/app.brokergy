/**
 * botVinculos — qué obra corresponde a cada chat de WhatsApp.
 *
 * El teléfono dice QUIÉN escribe; no dice DE QUÉ. Medido el 2026-08-25 sobre
 * expedientes vivos: 219 de 257 teléfonos resuelven a uno solo, pero el peor
 * caso son 38 obras en el mismo chat — un instalador. Ahí adivinar es apostar.
 *
 * Este módulo guarda y ordena las pistas. NO decide solo: devuelve lo que sabe
 * y con qué confianza, y quien decide si eso basta es `botContexto`.
 *
 * ─── LAS TRES PROCEDENCIAS, DE MÁS A MENOS FIABLE ────────────────────────────
 *
 *   manual        Lo ha fijado una persona desde la ficha. Es una decisión
 *                 tomada: no caduca y no la degrada nada automático.
 *   conversacion  El propio cliente ha dicho de qué obra habla. Vale para el
 *                 rato siguiente, no para siempre: mañana escribe por otra.
 *   envio         Le hemos escrito nosotros desde ese expediente. La pista más
 *                 débil y la más abundante — cada aviso que la app YA manda
 *                 enseña algo sin que nadie haga nada.
 */

const supabase = require('./supabaseClient');

const num = (v, def) => (Number.isFinite(Number(v)) ? Number(v) : def);

// Cuánto dura cada pista. La de conversación es corta a propósito: "la de
// Tomelloso" contesta a la pregunta de HOY, y darle una semana de vigencia
// haría que el bot respondiera por la obra equivocada el lunes siguiente.
const VIGENCIA_H = {
    conversacion: num(process.env.BOT_VINCULO_CONVERSACION_H, 8),
    envio: num(process.env.BOT_VINCULO_ENVIO_H, 72),
};

const CHAT_SUFIJO = '@c.us';

/**
 * '612 34 56 78' o '34612345678@c.us' → '34612345678@c.us'. null si no es un
 * teléfono.
 *
 * Mismo criterio que `whatsappService.normalizePhone`: nueve dígitos se toman
 * por un número nacional y se les pone el 34; con prefijo, entre 10 y 15. Un
 * "123" NO es un teléfono, y sin esta comprobación se guardaba tal cual —el
 * navegador ya lo filtraba, pero una validación que solo vive en el cliente no
 * es una validación: la ruta la puede llamar cualquiera.
 */
function aChatId(telefonoOChat) {
    const t = String(telefonoOChat || '').trim();
    if (!t) return null;
    if (t.includes('@')) return t;
    let d = t.replace(/\D/g, '');
    if (d.length === 9) d = '34' + d;
    if (!/^\d{10,15}$/.test(d)) return null;
    return `${d}${CHAT_SUFIJO}`;
}

/**
 * Registra que este chat tiene algo que ver con esta oportunidad.
 *
 * Pensado para llamarse a lo bruto desde cualquier envío: es idempotente, hace
 * UPSERT y **nunca lanza**. Un fallo aquí no puede tumbar el envío de un aviso
 * al cliente — el vínculo es una comodidad, el aviso es el trabajo.
 */
async function sembrar(telefonoOChat, oportunidadId, origen = 'envio', nota = null) {
    const chat = aChatId(telefonoOChat);
    if (!chat || !oportunidadId) return false;
    try {
        const { error } = await supabase.rpc('wa_vinculo_touch', {
            p_chat: chat,
            p_opp: oportunidadId,
            p_origen: origen,
            p_fijado: origen === 'manual',
            p_nota: nota,
        });
        if (error) throw new Error(error.message);
        return true;
    } catch (e) {
        console.warn('[bot/vinculos] sembrar:', e.message);
        return false;
    }
}

/**
 * Igual que `sembrar`, pero para colgar de un envío sin esperarlo ni encadenar
 * su fallo. Es la forma en que se llama desde las rutas: `setImmediate` y a
 * otra cosa, como el sincronizador de carpetas de Drive.
 */
function sembrarEnDiferido(telefonoOChat, oportunidadId, origen = 'envio') {
    if (!telefonoOChat || !oportunidadId) return;
    setImmediate(() => { sembrar(telefonoOChat, oportunidadId, origen).catch(() => {}); });
}

/**
 * Fija a mano el vínculo (desde la ficha del expediente). Gana a todo lo demás.
 * A diferencia de `sembrar`, este SÍ propaga el error: aquí hay una persona
 * esperando a que se guarde y tiene que enterarse si no se ha guardado.
 */
async function fijar(telefonoOChat, oportunidadId, nota = null) {
    const chat = aChatId(telefonoOChat);
    if (!chat) {
        // Se marca como error de DATO, no de servidor: la ruta lo traduce a un
        // 400. Un teléfono mal tecleado no es una avería nuestra, y devolver 500
        // hace que parezca que la app se ha roto cuando lo único que hay que
        // hacer es corregir el número.
        const e = new Error('Ese número no parece un teléfono. Escríbelo con los 9 dígitos (o con prefijo internacional).');
        e.datoInvalido = true;
        throw e;
    }
    if (!oportunidadId) throw new Error('Falta la oportunidad');
    const { error } = await supabase.rpc('wa_vinculo_touch', {
        p_chat: chat, p_opp: oportunidadId, p_origen: 'manual', p_fijado: true, p_nota: nota,
    });
    if (error) throw new Error(error.message);
    return { chat_id: chat, oportunidad_id: oportunidadId };
}

/** Quita un vínculo (el manual o cualquiera). */
async function soltar(telefonoOChat, oportunidadId) {
    // Aquí NO se normaliza contra el formato de un teléfono válido: hay que
    // poder borrar precisamente lo que se guardó mal. Basta con que sea un
    // chatId reconocible.
    const t = String(telefonoOChat || '').trim();
    const chat = t.includes('@') ? t : `${t.replace(/\D/g, '')}${CHAT_SUFIJO}`;
    if (!t || !oportunidadId) throw new Error('Faltan datos');
    const { error } = await supabase.from('whatsapp_chat_expediente')
        .delete().eq('chat_id', chat).eq('oportunidad_id', oportunidadId);
    if (error) throw new Error(error.message);
    return true;
}

/**
 * Lo que sabemos de este chat, ya ordenado por fiabilidad y frescura.
 *
 * Devuelve `[{ oportunidad_id, origen, fijado, vigente, visto_at }]`. `vigente`
 * es la mitad importante: un vínculo caducado sigue siendo un dato (sirve para
 * enseñarlo en la ficha) pero NO puede decidir por su cuenta a quién se le
 * contesta.
 */
async function pistas(telefonoOChat) {
    const chat = aChatId(telefonoOChat);
    if (!chat) return [];
    const { data, error } = await supabase
        .from('whatsapp_chat_expediente')
        .select('oportunidad_id, origen, fijado, visto_at, veces, nota')
        .eq('chat_id', chat)
        .order('fijado', { ascending: false })
        .order('visto_at', { ascending: false })
        .limit(50);
    if (error) {
        console.warn('[bot/vinculos] pistas:', error.message);
        return [];
    }
    const ahora = Date.now();
    return (data || []).map(v => {
        const horas = (ahora - new Date(v.visto_at).getTime()) / 3600000;
        const limite = VIGENCIA_H[v.origen];
        return { ...v, vigente: v.fijado || !Number.isFinite(limite) || horas <= limite, horas };
    });
}

/** Chats vinculados a una oportunidad, para enseñarlos en su ficha. */
async function chatsDe(oportunidadId) {
    if (!oportunidadId) return [];
    const { data, error } = await supabase
        .from('whatsapp_chat_expediente')
        .select('chat_id, origen, fijado, visto_at, veces, nota')
        .eq('oportunidad_id', oportunidadId)
        .order('fijado', { ascending: false })
        .order('visto_at', { ascending: false });
    if (error) {
        console.warn('[bot/vinculos] chatsDe:', error.message);
        return [];
    }
    return (data || []).map(v => ({ ...v, telefono: String(v.chat_id).replace(CHAT_SUFIJO, '') }));
}

/**
 * Elige UNA oportunidad de entre las candidatas, o null si no hay pista
 * suficiente.
 *
 * `candidatas` son los asuntos que el teléfono ya resolvió: una pista que
 * apunte a algo que no está en esa lista se ignora, porque significa que ese
 * expediente ya no es de esta persona o está cerrado.
 *
 * REGLA — solo deciden las pistas VIGENTES. Un "hablamos de esto hace tres
 * semanas" no puede hacer que hoy se le conteste por la obra equivocada; para
 * eso está preguntar, que no cuesta nada.
 */
async function elegir(telefonoOChat, candidatas = [], { permitirEnvio = true } = {}) {
    if (candidatas.length <= 1) return null;      // no hay nada que elegir
    const validas = new Set(candidatas);
    const lista = await pistas(telefonoOChat);

    const fijada = lista.find(v => v.fijado && validas.has(v.oportunidad_id));
    if (fijada) return { oportunidad_id: fijada.oportunidad_id, motivo: 'fijado', origen: 'manual' };

    // `permitirEnvio: false` deja fuera la pista débil. Es lo que se hace con
    // los INSTALADORES: haberles mandado un aviso desde una obra no dice por
    // cuál de sus treinta preguntan hoy.
    const orden = permitirEnvio ? ['conversacion', 'envio'] : ['conversacion'];

    // Entre las vigentes gana la procedencia más fiable y, a igualdad, la más
    // reciente — que es el orden en el que ya vienen.
    for (const origen of orden) {
        const v = lista.find(x => x.vigente && x.origen === origen && validas.has(x.oportunidad_id));
        if (v) return { oportunidad_id: v.oportunidad_id, motivo: origen, origen, horas: v.horas };
    }
    return null;
}

module.exports = {
    sembrar, sembrarEnDiferido, fijar, soltar,
    pistas, chatsDe, elegir, aChatId,
    _VIGENCIA_H: VIGENCIA_H,
};
