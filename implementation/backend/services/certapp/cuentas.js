// ─── certapp/cuentas.js — alta, activación y recuperación de las cuentas ─────
//
// Un certificador externo es un usuario de Supabase Auth (el MISMO Auth que el
// CRM) + una fila de `certapp_cuentas`. NO es un `usuarios`: no entra en el CRM.
//
// Alta (lo hace un ADMIN desde el panel, desde una solicitud de la beta o suelta):
//   1. createUser con una contraseña ALEATORIA que no se guarda (email confirmado,
//      sin el email de invitación de Supabase).
//   2. Fila PENDIENTE con los créditos de la beta.
//   3. Enlace firmado `/activar?token=` (14 días) para que ponga SU contraseña;
//      se devuelve al admin y, con los avisos encendidos, se le manda por email.
//
// REGLA — si ya existe un usuario de Auth con ese email (p. ej. alguien del
// equipo, o un técnico de BROKERGY), NO se le cambia la contraseña ni se crea
// otro: se vincula y entra con la suya de siempre (`prefs.auth_preexistente`).
// Activar y recuperar NUNCA tocan la contraseña de un usuario así: es la misma
// con la que entra en app.brokergy.es.
//
// REGLA — si el alta falla a medias, se deshace (el usuario de Auth recién
// creado se borra), como en routes/usuarios.js.
// ─────────────────────────────────────────────────────────────────────────────
const crypto = require('crypto');
const supabase = require('../supabaseClient');
const tokens = require('./tokens');
const drive = require('./drive');
const avisos = require('./avisos');
const { fallo, errorBd, texto, esEmail, certappUrl, nombreApp, numEnv, cuentaPublica, nombreCompleto } = require('./comun');

const normEmail = (e) => String(e || '').trim().toLowerCase();

/** Busca un usuario de Auth por email (listUsers paginado; la API no filtra por email). */
async function usuarioAuthPorEmail(email) {
    const objetivo = normEmail(email);
    for (let page = 1; page <= 50; page++) {
        const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) throw new Error(`Auth no responde: ${error.message}`);
        const users = data?.users || [];
        const u = users.find(x => normEmail(x.email) === objetivo);
        if (u) return u;
        if (users.length < 1000) return null;
    }
    return null;
}

async function cuentaPorEmail(email) {
    const { data, error } = await supabase.from('certapp_cuentas').select('*').eq('email', normEmail(email)).maybeSingle();
    if (error) throw errorBd(error, 'cuenta por email');
    return data || null;
}

async function cuentaPorId(id) {
    const { data, error } = await supabase.from('certapp_cuentas').select('*').eq('id', id).maybeSingle();
    if (error) throw errorBd(error, 'cuenta por id');
    return data || null;
}

const enlaceActivar = (cuenta) => `${certappUrl()}/activar?token=${encodeURIComponent(tokens.firmarCuenta('a', cuenta.id, cuenta.prefs?.pwd_nonce))}`;
const enlaceRecuperar = (cuenta) => `${certappUrl()}/activar?token=${encodeURIComponent(tokens.firmarCuenta('r', cuenta.id, cuenta.prefs?.pwd_nonce))}&recuperar=1`;
const enlaceEntrar = () => `${certappUrl()}/entrar`;

/** Email de bienvenida con el enlace (o, si ya tenía usuario, con «entra con tu contraseña»). */
async function mandarInvitacion(cuenta, { enlace, preexistente }) {
    const saludo = cuenta.nombre ? `Hola ${cuenta.nombre}:` : 'Hola:';
    const p = preexistente
        ? {
            titulo: `Ya tienes acceso a ${nombreApp()}`,
            parrafos: [
                'Te hemos dado acceso a la beta de la app de certificados energéticos de BROKERGY.',
                'Tu email ya tenía un usuario con nosotros: entra con la contraseña de siempre.',
                `Tienes ${cuenta.creditos} certificados para probarla.`,
            ],
            boton: { href: enlace, label: 'Entrar' },
        }
        : {
            titulo: `Bienvenido a ${nombreApp()}`,
            parrafos: [
                'Te hemos dado acceso a la beta de la app de certificados energéticos de BROKERGY.',
                `Pon tu contraseña con el botón y entra. Tienes ${cuenta.creditos} certificados para probarla.`,
            ],
            boton: { href: enlace, label: 'Poner mi contraseña' },
            nota: 'El enlace caduca en 14 días y sirve una sola vez.',
        };
    return avisos.avisarPersona({ email: cuenta.email }, {
        asunto: p.titulo,
        html: avisos.plantilla({ ...p, saludo, preheader: p.parrafos[0] }),
        texto: avisos.textoPlano({ ...p, saludo }),
    });
}

/**
 * Crea (o reinvita) la cuenta de un certificador.
 * @returns {{ cuenta, enlace, preexistente, reinvitada, email: { canales, seco? }, drive }}
 */
async function crearCuenta(datos = {}, { por = 'ADMIN', solicitud = null } = {}) {
    const email = normEmail(datos.email);
    if (!esEmail(email)) throw fallo(400, 'El email no es válido.', 'EMAIL_INVALIDO');
    const creditos = Number.isInteger(Number(datos.creditos)) && Number(datos.creditos) >= 0
        ? Math.min(Number(datos.creditos), 1000) : numEnv('CERTAPP_CREDITOS_BETA', 5);

    // ¿Ya tiene cuenta en la app? Pendiente → se le vuelve a dar el enlace; activa → 409.
    const yaCuenta = await cuentaPorEmail(email);
    if (yaCuenta) {
        if (yaCuenta.estado !== 'PENDIENTE') {
            throw fallo(409, 'Ese email ya tiene una cuenta activa en la app.', 'CUENTA_YA_EXISTE', { cuenta: cuentaPublica(yaCuenta) });
        }
        const preexistente = !!yaCuenta.prefs?.auth_preexistente;
        const enlace = preexistente ? enlaceEntrar() : enlaceActivar(yaCuenta);
        if (solicitud?.id && !yaCuenta.beta_solicitud_id) {
            await supabase.from('certapp_cuentas').update({ beta_solicitud_id: solicitud.id }).eq('id', yaCuenta.id);
        }
        const email_ = await mandarInvitacion(yaCuenta, { enlace, preexistente });
        return { cuenta: cuentaPublica(yaCuenta), enlace, preexistente, reinvitada: true, email: email_, drive: null };
    }

    // 1. El usuario de Auth (o el que ya había con ese email)
    let authId = null;
    let creadoAhora = false;
    let preexistente = false;
    const { data: authRes, error: authErr } = await supabase.auth.admin.createUser({
        email,
        password: crypto.randomBytes(24).toString('base64url'),   // aleatoria, no se guarda
        email_confirm: true,
        user_metadata: { origen: 'certapp', nombre: texto(datos.nombre, 80), apellidos: texto(datos.apellidos, 120) },
    });
    if (authErr) {
        if (!/already been registered|already registered|already exists|email_exists/i.test(`${authErr.message} ${authErr.code || ''}`)) {
            throw fallo(502, `El sistema de cuentas no responde: ${authErr.message}`, 'AUTH_FALLO');
        }
        const u = await usuarioAuthPorEmail(email);
        if (!u) throw fallo(502, 'El email ya está registrado pero no encuentro su usuario. Vuelve a intentarlo.', 'AUTH_FALLO');
        authId = u.id;
        preexistente = true;
    } else {
        authId = authRes.user.id;
        creadoAhora = true;
    }

    // 2. La fila de la cuenta (si falla, se deshace lo de Auth)
    const fila = {
        auth_user_id: authId,
        email,
        nombre: texto(datos.nombre, 80),
        apellidos: texto(datos.apellidos, 120),
        telefono: texto(datos.telefono, 30),
        empresa: texto(datos.empresa, 160),
        provincia: texto(datos.provincia, 60),
        estado: 'PENDIENTE',
        creditos,
        beta_solicitud_id: solicitud?.id || null,
        prefs: {
            pwd_nonce: tokens.nuevoNonce(),
            auth_preexistente: preexistente || undefined,
            invitada_at: new Date().toISOString(),
            invitada_por: por,
        },
    };
    const { data: cuenta, error: insErr } = await supabase.from('certapp_cuentas').insert(fila).select('*').single();
    if (insErr) {
        if (creadoAhora) {
            await supabase.auth.admin.deleteUser(authId).catch(e => console.error('[certapp] rollback de Auth fallido:', e.message));
        }
        if (insErr.code === '23505') throw fallo(409, 'Ese email ya tiene una cuenta en la app.', 'CUENTA_YA_EXISTE');
        throw errorBd(insErr, 'crear cuenta');
    }

    // 3. Carpeta de Drive (no bloquea) y el enlace
    const carpeta = await drive.asegurarCarpetaCuenta(cuenta);
    const enlace = preexistente ? enlaceEntrar() : enlaceActivar(cuenta);
    const email_ = await mandarInvitacion(cuenta, { enlace, preexistente });
    return { cuenta: cuentaPublica(cuenta), enlace, preexistente, reinvitada: false, email: email_, drive: carpeta };
}

/** Rota el nonce: los enlaces de activar/recuperar emitidos dejan de valer. */
async function rotarNonce(cuenta, extra = {}) {
    const prefs = { ...(cuenta.prefs || {}), pwd_nonce: tokens.nuevoNonce(), ...extra };
    const { error } = await supabase.from('certapp_cuentas').update({ prefs }).eq('id', cuenta.id);
    if (error) throw errorBd(error, 'rotar nonce');
    return prefs;
}

const MENSAJE_TOKEN = {
    formato: 'El enlace no es válido. Pide otro.',
    firma: 'Este enlace ya se ha usado o no es válido. Pide otro.',
    caducado: 'El enlace ha caducado. Pide otro.',
};

async function cuentaDelToken(token) {
    const datos = tokens.leerCuenta(token);
    if (!datos) throw fallo(400, MENSAJE_TOKEN.formato, 'TOKEN_INVALIDO');
    const cuenta = await cuentaPorId(datos.cuentaId);
    if (!cuenta) throw fallo(400, MENSAJE_TOKEN.formato, 'TOKEN_INVALIDO');
    const v = tokens.verificarCuenta(datos, cuenta.prefs?.pwd_nonce);
    if (!v.ok) throw fallo(v.motivo === 'caducado' ? 410 : 400, MENSAJE_TOKEN[v.motivo], v.motivo === 'caducado' ? 'TOKEN_CADUCADO' : 'TOKEN_INVALIDO');
    if (cuenta.estado === 'BLOQUEADA') throw fallo(403, 'Esta cuenta está bloqueada. Escríbenos si crees que es un error.', 'CERTAPP_BLOQUEADA');
    return { cuenta, tipo: datos.tipo };
}

/** GET /activar/:token — a quién es el enlace (para la pantalla de poner la contraseña). */
async function infoActivacion(token) {
    const { cuenta, tipo } = await cuentaDelToken(token);
    return {
        ok: true,
        tipo: tipo === 'r' ? 'recuperar' : 'activar',
        email: cuenta.email,
        nombre: cuenta.nombre || null,
        preexistente: !!cuenta.prefs?.auth_preexistente,
    };
}

/** POST /activar — pone la contraseña (invitación o recuperación). */
async function activar(token, password) {
    const pwd = String(password || '');
    if (pwd.length < 8) throw fallo(400, 'La contraseña tiene que tener al menos 8 caracteres.', 'PASSWORD_CORTA');
    if (pwd.length > 72) throw fallo(400, 'La contraseña es demasiado larga (máximo 72 caracteres).', 'PASSWORD_LARGA');
    const { cuenta, tipo } = await cuentaDelToken(token);
    if (cuenta.prefs?.auth_preexistente) {
        throw fallo(409, 'Tu email ya tenía un usuario con nosotros: entra con tu contraseña de siempre.', 'USAR_PASSWORD_EXISTENTE');
    }
    if (!cuenta.auth_user_id) throw fallo(409, 'La cuenta no tiene usuario. Escríbenos.', 'SIN_USUARIO');
    const { error } = await supabase.auth.admin.updateUserById(cuenta.auth_user_id, { password: pwd });
    if (error) throw fallo(502, `No se ha podido guardar la contraseña: ${error.message}`, 'AUTH_FALLO');
    await rotarNonce(cuenta, tipo === 'a' ? { activada_at: new Date().toISOString() } : { recuperada_at: new Date().toISOString() });
    if (cuenta.estado === 'PENDIENTE') {
        await supabase.from('certapp_cuentas').update({ estado: 'ACTIVA' }).eq('id', cuenta.id);
    }
    require('../../middleware/certappAuth').olvidarCuenta(cuenta.id);
    return { ok: true, email: cuenta.email };
}

/**
 * POST /recuperar — manda el enlace si hay una cuenta que se pueda recuperar.
 * Responde SIEMPRE lo mismo (no se confirma qué emails tienen cuenta).
 */
async function recuperar(email) {
    const e = normEmail(email);
    if (!esEmail(e)) return { ok: true };
    const cuenta = await cuentaPorEmail(e);
    if (!cuenta || cuenta.estado === 'BLOQUEADA') return { ok: true };
    if (cuenta.prefs?.auth_preexistente) {
        // Su contraseña es la del CRM: aquí no se toca.
        console.log(`[certapp] recuperar ${e}: usuario preexistente, no se manda enlace`);
        return { ok: true };
    }
    if (!cuenta.prefs?.pwd_nonce) cuenta.prefs = await rotarNonce(cuenta);
    const enlace = enlaceRecuperar(cuenta);
    const p = {
        titulo: 'Cambia tu contraseña',
        saludo: cuenta.nombre ? `Hola ${cuenta.nombre}:` : 'Hola:',
        parrafos: ['Nos has pedido cambiar la contraseña de tu cuenta. Si no has sido tú, no hagas nada.'],
        boton: { href: enlace, label: 'Poner una contraseña nueva' },
        nota: 'El enlace caduca en 2 horas y sirve una sola vez.',
    };
    await avisos.avisarPersona({ email: cuenta.email }, {
        asunto: `${p.titulo} — ${nombreApp()}`,
        html: avisos.plantilla({ ...p, preheader: p.parrafos[0] }),
        texto: avisos.textoPlano(p),
    });
    return { ok: true };
}

// ── Perfil ──────────────────────────────────────────────────────────────────
const PERFIL = {
    nombre: 80, apellidos: 120, nif: 20, telefono: 30, empresa: 160, empresa_nif: 20,
    titulacion: 120, num_colegiado: 40, colegio: 160, provincia: 60, municipio: 80,
    direccion: 200, codigo_postal: 10,
};

/** PUT /me — lista blanca; el email, los créditos y el estado no se tocan aquí. */
async function actualizarPerfil(cuentaId, body = {}) {
    const patch = {};
    for (const [k, max] of Object.entries(PERFIL)) {
        if (k in body) {
            let v = texto(body[k], max);
            if (v && ['nif', 'empresa_nif'].includes(k)) v = v.toUpperCase().replace(/[\s.-]/g, '');
            patch[k] = v;
        }
    }
    if (!Object.keys(patch).length) throw fallo(400, 'No hay nada que guardar.', 'SIN_CAMBIOS');
    const { data, error } = await supabase.from('certapp_cuentas').update(patch).eq('id', cuentaId).select('*').single();
    if (error) throw errorBd(error, 'perfil');
    require('../../middleware/certappAuth').olvidarCuenta(cuentaId);
    return data;
}

/** Último acceso (best-effort, como mucho una escritura cada 10 min por cuenta). */
const ultimoApunte = new Map();
function apuntarAcceso(cuenta) {
    if (!cuenta?.id) return;
    const ahora = Date.now();
    if ((ultimoApunte.get(cuenta.id) || 0) > ahora - 10 * 60000) return;
    ultimoApunte.set(cuenta.id, ahora);
    supabase.from('certapp_cuentas').update({ ultimo_acceso_at: new Date(ahora).toISOString() }).eq('id', cuenta.id)
        .then(({ error }) => { if (error) console.warn('[certapp] último acceso:', error.message); });
}

module.exports = {
    crearCuenta, infoActivacion, activar, recuperar, actualizarPerfil, apuntarAcceso,
    cuentaPorId, cuentaPorEmail, usuarioAuthPorEmail, normEmail, nombreCompleto,
};
