// =============================================================================
// memoriaWhatsapp — leer y apuntar la MEMORIA de un chat en `wa_memoria` (22/11/2026).
// Lo puro (límites, limpieza, cómo lo lee el modelo, la orden «nota …») está en
// utils/memoriaWhatsapp.js. Aquí solo la tabla: UNA fila por teléfono, leída por su clave.
//
// Ligero por construcción: cada respuesta del contestador lee UNA fila (PK) y, si apunta algo,
// escribe esa misma fila; la ficha no pasa de 15 hechos de 200 caracteres (≈ 4 KB, y un CHECK
// en la tabla lo asegura). Nunca se trae la tabla entera.
// =============================================================================

const supabase = require('./supabaseClient');
const M = require('../utils/memoriaWhatsapp');

const ult9 = (t) => String(t || '').replace(/\D/g, '').slice(-9);

/**
 * Los hechos de un teléfono. Un fallo de lectura NO para la respuesta (la memoria es contexto, no
 * un dato que se le diga al cliente): devuelve `{ hechos: [], error }` y quien llama lo apunta.
 */
async function leer(tel) {
    const tel9 = ult9(tel);
    if (tel9.length !== 9) return { hechos: [] };
    const { data, error } = await supabase.from('wa_memoria').select('hechos').eq('tel9', tel9).maybeSingle();
    if (error) return { hechos: [], error: error.message };
    return { hechos: Array.isArray(data?.hechos) ? data.hechos : [] };
}

/**
 * Apunta hechos nuevos en la ficha de un teléfono (lee la fila y la reescribe con `fusionar`: la
 * escribe un solo proceso, el backend, y el contestador va chat a chat).
 * @returns {Promise<{ anadidos: number, hechos: Array }>}
 */
async function anotar(tel, textos, { obra = null, por = 'contestador', ahora = new Date() } = {}) {
    const tel9 = ult9(tel);
    if (tel9.length !== 9) throw new Error('teléfono no válido');
    const lista = (Array.isArray(textos) ? textos : [textos]).filter(Boolean);
    if (!lista.length) return { anadidos: 0, hechos: [] };
    const { hechos: actuales, error } = await leer(tel9);
    if (error) throw new Error(`la base de datos no responde (${error})`);
    const r = M.fusionar(actuales, lista, { ahora, obra, por });
    // Sin nada nuevo no se escribe (lo caducado se cae en la próxima escritura).
    if (!r.anadidos) return { anadidos: 0, hechos: actuales };
    const { error: e2 } = await supabase.from('wa_memoria')
        .upsert({ tel9, hechos: r.hechos, updated_at: ahora.toISOString() }, { onConflict: 'tel9' });
    if (e2) throw new Error(e2.message);
    return r;
}

module.exports = { leer, anotar };
