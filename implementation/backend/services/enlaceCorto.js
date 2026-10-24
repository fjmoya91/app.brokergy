// ============================================================================
// enlaceCorto.js — enlaces CORTOS para los mensajes al cliente (24/10/2026).
// ----------------------------------------------------------------------------
// `app.brokergy.es/cobro/7e74…/recibido?token=0258…` en un WhatsApp parece un
// timo, y hay clientes que ya lo han dicho («¿esto es un timo?»). El corto,
// `app.brokergy.es/r/K7M2Q9XA`, se resuelve aquí y la página lo redirige.
//
// Se guardan en `app_settings` (clave `r:<código>`), sin tabla nueva.
//
// REGLA — el código ES el secreto: lleva a la misma página que el token largo. Por
// eso son 8 caracteres de un alfabeto de 31 (sin 0/O/1/I/L: se dictan por
// teléfono) ≈ 40 bits, y la ruta que los resuelve tiene freno por IP.
//
// REGLA — solo se redirige DENTRO de la app: el destino se guarda como ruta
// relativa (`/cobro/…`) y lo que no empieza por `/` se rechaza al resolver.
// ============================================================================

const crypto = require('crypto');
const supabase = require('./supabaseClient');

const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const LARGO = 8;
const CLAVE = (codigo) => `r:${codigo}`;
const BASE = () => (process.env.APP_URL || process.env.FRONTEND_URL || 'https://app.brokergy.es').replace(/\/$/, '');

function nuevoCodigo() {
    const bytes = crypto.randomBytes(LARGO);
    let s = '';
    for (let i = 0; i < LARGO; i++) s += ALFABETO[bytes[i] % ALFABETO.length];
    return s;
}

const valido = (codigo) => new RegExp(`^[${ALFABETO}]{${LARGO}}$`).test(String(codigo || ''));

/** Quita el dominio: lo que se guarda es la ruta dentro de la app. */
function rutaDe(destino) {
    const s = String(destino || '');
    const sinDominio = s.replace(/^https?:\/\/[^/]+/i, '');
    if (!sinDominio.startsWith('/') || sinDominio.startsWith('//')) throw new Error('El destino de un enlace corto tiene que ser una ruta de la app');
    return sinDominio;
}

/** Crea el enlace corto de `destino` y devuelve `{ codigo, url }`. */
async function crear(destino, { expedienteId = null, tipo = null } = {}) {
    const ruta = rutaDe(destino);
    for (let intento = 0; intento < 4; intento++) {
        const codigo = nuevoCodigo();
        const { data: ya } = await supabase.from('app_settings').select('key').eq('key', CLAVE(codigo)).maybeSingle();
        if (ya) continue;
        const { error } = await supabase.from('app_settings').insert({
            key: CLAVE(codigo),
            value: JSON.stringify({ destino: ruta, expediente_id: expedienteId, tipo, at: new Date().toISOString() }),
        });
        if (error) throw new Error(`No se pudo crear el enlace corto: ${error.message}`);
        return { codigo, url: `${BASE()}/r/${codigo}` };
    }
    throw new Error('No se pudo crear el enlace corto');
}

/** La ruta de la app a la que lleva `codigo`, o null. */
async function resolver(codigo) {
    if (!valido(codigo)) return null;
    const { data } = await supabase.from('app_settings').select('value').eq('key', CLAVE(codigo)).maybeSingle();
    if (!data?.value) return null;
    try {
        const v = JSON.parse(data.value);
        return typeof v.destino === 'string' && v.destino.startsWith('/') && !v.destino.startsWith('//') ? v.destino : null;
    } catch { return null; }
}

module.exports = { crear, resolver, valido, nuevoCodigo, rutaDe, LARGO, ALFABETO };
