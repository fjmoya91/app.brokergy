// ─── certapp/beta.js — la lista de espera de la beta (certapp_beta_solicitudes) ─
// Formulario público de cee.brokergy.es. Un email, una solicitud. Se guarda
// también el formulario crudo (`respuestas`): las preguntas cambiarán durante
// la beta.
//
// REGLA — una solicitud que ya existe NO se pisa: el formulario es público y
// cualquiera puede escribir el email de otro. Solo se rellenan los campos que
// estaban VACÍOS y lo demás se guarda en `respuestas.revisiones[]` (las 10
// últimas) para que BROKERGY lo vea. Antes se sobrescribían nombre y teléfono, y
// al invitar el teléfono del atacante pasaba a la cuenta (los WhatsApp, a él).
// Lo hace la RPC `certapp_beta_apuntar` en UNA sentencia.
//
// REGLA — la respuesta es SIEMPRE la misma (`{ ok: true }`): no dice si el email
// ya estaba apuntado.
//
// REGLA — el nombre que va en el email se SANEA (letras, espacios, guiones y
// apóstrofos, ≤ 60): era un hueco para meter un enlace en un correo con nuestra
// marca. Y hay TOPES DIARIOS: emails de confirmación (CERTAPP_BETA_EMAILS_DIA,
// 40: el buzón de Hostinger tiene 100 al día compartidos con el CRM) y WhatsApp
// al equipo, uno por alta hasta CERTAPP_BETA_AVISOS_DIA (10); después, uno que
// lo dice y luego uno cada 25.
//
// Antispam en la ruta (honeypot `web`, form_token firmado con la hora, límite por
// IP de verdad). La IP no se guarda: solo una huella HMAC.
// ─────────────────────────────────────────────────────────────────────────────
const supabase = require('../supabaseClient');
const avisos = require('./avisos');
const tokens = require('./tokens');
const { fallo, errorBd, texto, textoLargo, numero, esEmail, nombreApp, certappUrl, numEnv, inicioDiaMadrid } = require('./comun');

const PERFILES = ['AUTONOMO', 'EMPRESA_PROPIA', 'EMPRESA_SUBCONTRATA', 'OTRO'];
const ESTADOS = ['NUEVA', 'CONTACTADA', 'INVITADA', 'DESCARTADA'];
const MAX_REVISIONES = 10;

const hashIp = (ip) => (ip ? tokens.huella(`ip:${ip}`) : null);

/** Nombre apto para un saludo: solo letras, espacios, guiones y apóstrofos (≤ 60). */
function nombreSeguro(v) {
    return String(v ?? '').normalize('NFC')
        .replace(/[^\p{L}\p{M} '’-]/gu, ' ')
        .replace(/\s+/g, ' ').replace(/^[\s'’-]+|[\s'’-]+$/g, '')
        .slice(0, 60).trim();
}

const lista = (v, max = 20) => (Array.isArray(v) ? v : (typeof v === 'string' && v ? v.split(',') : []))
    .map(s => texto(s, 60)).filter(Boolean).slice(0, max);

/** El formulario crudo, acotado (nada de ficheros ni objetos enormes). */
function crudo(body) {
    try {
        const s = JSON.stringify(body || {});
        if (s.length <= 20000) return JSON.parse(s);
        return { recortado: true, texto: s.slice(0, 20000) };
    } catch { return {}; }
}

/** La fila saneada del formulario (sin escribir nada). Lanza 400 si falta algo. */
function filaDe(body = {}, { ip, userAgent } = {}) {
    const email = String(body.email || '').trim().toLowerCase();
    const nombre = nombreSeguro(body.nombre);
    if (!nombre) throw fallo(400, 'Dinos tu nombre.', 'FALTA_NOMBRE');
    if (!esEmail(email)) throw fallo(400, 'El email no es válido.', 'EMAIL_INVALIDO');
    if (!(body.consentimiento === true || body.consentimiento === 'true' || body.acepta_privacidad === true)) {
        throw fallo(400, 'Para apuntarte tienes que aceptar la política de privacidad.', 'FALTA_CONSENTIMIENTO');
    }
    const perfil = String(body.perfil || '').toUpperCase();
    const coste = numero(body.coste_subcontrata_eur);
    const respuestas = crudo(body);
    // Ni el honeypot ni los tokens del formulario se guardan.
    for (const k of ['web', 'form_token', 'turnstile_token']) delete respuestas[k];
    return {
        nombre,
        email,
        telefono: texto(body.telefono, 30),
        provincia: texto(body.provincia, 60),
        perfil: PERFILES.includes(perfil) ? perfil : null,
        empresa: texto(body.empresa, 160),
        cee_mes: texto(body.cee_mes, 20),
        minutos_cee: texto(body.minutos_cee, 20),
        minutos_presentar: texto(body.minutos_presentar, 20),
        interes_ia_presentar: texto(body.interes_ia_presentar, 10),
        coste_subcontrata_eur: coste != null && coste >= 0 && coste < 100000 ? coste : null,
        software: lista(body.software),
        comunidades: lista(body.comunidades, 25),
        comentarios: textoLargo(body.comentarios, 3000),
        respuestas,
        consentimiento_at: new Date().toISOString(),
        acepta_comunicaciones: body.acepta_comunicaciones === true || body.acepta_comunicaciones === 'true',
        origen: texto(body.origen, 60),
        utm: body.utm && typeof body.utm === 'object' ? crudo(body.utm) : null,
        ip_hash: hashIp(ip),
        user_agent: texto(userAgent, 300),
    };
}

/** Lo que se apunta en `respuestas.revisiones[]` cuando el email ya estaba (compacto). */
function revisionDe(fila) {
    return {
        at: new Date().toISOString(),
        nombre: fila.nombre, telefono: fila.telefono, empresa: fila.empresa, provincia: fila.provincia,
        perfil: fila.perfil, cee_mes: fila.cee_mes,
        comentarios: fila.comentarios ? fila.comentarios.slice(0, 500) : null,
        ip_hash: fila.ip_hash, user_agent: fila.user_agent ? fila.user_agent.slice(0, 120) : null,
    };
}

/** Altas NUEVAS de hoy (hora de Madrid), para los topes. null si no se puede contar. */
async function altasDeHoy() {
    try {
        const { count, error } = await supabase.from('certapp_beta_solicitudes')
            .select('id', { count: 'exact', head: true }).gte('created_at', inicioDiaMadrid());
        if (error) { console.warn('[certapp beta] no puedo contar las altas de hoy:', error.message); return null; }
        return count || 0;
    } catch (e) { console.warn('[certapp beta] no puedo contar las altas de hoy:', e.message); return null; }
}

/**
 * Qué avisos tocan con `n` altas hoy (n incluye la de ahora).
 * @returns {{ email: boolean, whatsapp: 'uno'|'agrupado'|'resumen'|null }}
 */
function avisosQueTocan(n) {
    const maxEmails = numEnv('CERTAPP_BETA_EMAILS_DIA', 40);
    const maxAvisos = numEnv('CERTAPP_BETA_AVISOS_DIA', 10);
    if (n == null) return { email: false, whatsapp: null };   // sin contar, no se manda (cerrado)
    let whatsapp = null;
    if (n <= maxAvisos) whatsapp = 'uno';
    else if (n === maxAvisos + 1) whatsapp = 'agrupado';
    else if (n % 25 === 0) whatsapp = 'resumen';
    return { email: n <= maxEmails, whatsapp };
}

/**
 * Alta en la lista de espera (o revisión de una que ya existe, sin pisarla).
 * @returns {{ ok: true }}   siempre lo mismo
 */
async function apuntar(body = {}, { ip, userAgent } = {}) {
    const fila = filaDe(body, { ip, userAgent });
    const { data: nueva, error } = await supabase.rpc('certapp_beta_apuntar', {
        p_fila: fila, p_revision: revisionDe(fila), p_max_revisiones: MAX_REVISIONES,
    });
    if (error) throw errorBd(error, 'beta: apuntar');
    if (nueva !== true) return { ok: true };   // ya estaba: queda como revisión, sin avisos

    // Avisos (en seco sin CERTAPP_AVISOS_ENABLED). Nunca rompen el alta.
    const n = await altasDeHoy();
    const toca = avisosQueTocan(n);
    const perfilTxt = { AUTONOMO: 'autónomo', EMPRESA_PROPIA: 'empresa con técnicos', EMPRESA_SUBCONTRATA: 'empresa que subcontrata', OTRO: 'otro' }[fila.perfil] || 's/ perfil';
    const cuerpo = {
        uno: `🆕 Nueva solicitud en la beta de la app de certificadores: ${fila.nombre} (${perfilTxt}${fila.provincia ? `, ${fila.provincia}` : ''}${fila.cee_mes ? `, ${fila.cee_mes} CEE/mes` : ''}). ${certappUrl()}/admin/beta`,
        agrupado: `🆕 Ya van ${n} solicitudes hoy en la beta de la app de certificadores: no aviso de cada una más. Están en ${certappUrl()}/admin/beta`,
        resumen: `🆕 Van ${n} solicitudes hoy en la beta de la app de certificadores: ${certappUrl()}/admin/beta`,
    }[toca.whatsapp];
    if (cuerpo) await avisos.avisarEquipo({ asunto: 'Beta de la app de certificadores', cuerpo, soloWhatsapp: true });

    if (toca.email) {
        const p = {
            titulo: 'Estás en la lista de la beta',
            saludo: `Hola ${fila.nombre}:`,
            parrafos: [
                `Gracias por apuntarte a la beta de ${nombreApp()}, la app para hacer los certificados energéticos con IA.`,
                'Estamos dando acceso poco a poco. Cuando te toque te escribiremos a este email con tu enlace para entrar.',
            ],
        };
        await avisos.avisarPersona({ email: fila.email }, {
            asunto: `${p.titulo} — ${nombreApp()}`,
            html: avisos.plantilla({ ...p, preheader: p.parrafos[0] }),
            texto: avisos.textoPlano(p),
        });
    } else {
        console.log(`[certapp beta] tope diario de confirmaciones alcanzado (${n ?? '¿?'} altas hoy): sin email a la nueva solicitud`);
    }
    return { ok: true };
}

module.exports = { apuntar, filaDe, revisionDe, nombreSeguro, avisosQueTocan, hashIp, PERFILES, ESTADOS, MAX_REVISIONES };
