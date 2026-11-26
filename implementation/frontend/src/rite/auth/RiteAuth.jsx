// ─── RiteAuth.jsx — la sesión de la app RITE (rite.brokergy.es) ─────────────
// Regla 245. Mismo Supabase Auth que el CRM, pero una empresa instaladora de la
// app NO es un `usuarios`: su cuenta sale de `/api/riteapp/me` (`riteapp_cuentas`).
// Calcado de certificadores/auth/CertappAuth.jsx, sin contraseña:
//   · Google: signInWithOAuth vuelve con la sesión en la URL (detectSessionInUrl).
//   · Email: un enlace mágico de Supabase (signInWithOtp), que vuelve igual.
// Si la sesión aún no tiene cuenta, `/me` da 403 RITEAPP_SIN_CUENTA → `sinCuenta`,
// y se le lleva al alta (`/alta`). Si BROKERGY le había preparado una cuenta con ese
// email, el alta la ADOPTA (routes/riteapp.js).
//
// REGLA — `signOut` limpia la sesión local PASE LO QUE PASE.
// Una sesión del EQUIPO de BROKERGY (fila en `usuarios`, ADMIN o TRABAJADOR) no
// tiene cuenta de instalador: con el SIN_CUENTA se pregunta `/api/riteapp-admin/yo`
// y, si es del equipo, `equipo` = { rol, nombre, esAdmin } y entra a /admin.
//
// REGLA — con el servidor caído (503 / sin red) NO se trata como «sin cuenta»:
// se dice que no se ha podido cargar y se ofrece reintentar (regla 38).
// ─────────────────────────────────────────────────────────────────────────────
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { supabase } from '../../services/supabaseClient';
import { API, errorDe, mensajeError } from '../api';

const Ctx = createContext(null);

function borrarRastroSupabase() {
    try {
        Object.keys(window.localStorage)
            .filter(k => /^sb-.*-auth-token/.test(k))
            .forEach(k => window.localStorage.removeItem(k));
    } catch { /* noop */ }
}

export function RiteAuthProvider({ children }) {
    const [session, setSession] = useState(null);
    const [cuenta, setCuenta] = useState(null);
    const [loading, setLoading] = useState(true);
    const [errorMe, setErrorMe] = useState(null);   // { status, code, mensaje }
    const [equipo, setEquipo] = useState(null);     // { rol, nombre, esAdmin } si es del equipo de BROKERGY
    const tokenRef = useRef(null);
    const userIdRef = useRef(null);

    const ponerToken = useCallback((t) => {
        tokenRef.current = t || null;
        if (t) axios.defaults.headers.common.Authorization = `Bearer ${t}`;
        else delete axios.defaults.headers.common.Authorization;
    }, []);

    const limpiarLocal = useCallback(async () => {
        try { await supabase.auth.signOut({ scope: 'local' }); } catch { /* sale igual */ }
        borrarRastroSupabase();
        ponerToken(null);
        userIdRef.current = null;
        setSession(null);
        setCuenta(null);
        setEquipo(null);
        setErrorMe(null);
    }, [ponerToken]);

    const cargarMe = useCallback(async () => {
        if (!tokenRef.current) { setCuenta(null); setEquipo(null); setErrorMe(null); return null; }
        /** ¿Es del equipo de BROKERGY? Solo se pregunta cuando no hay cuenta de instalador. */
        const mirarEquipo = async () => {
            try {
                const { data } = await axios.get('/api/riteapp-admin/yo');
                setEquipo(data?.ok ? { rol: data.rol, nombre: data.nombre, esAdmin: !!data.esAdmin } : null);
            } catch { setEquipo(null); }
        };
        const pedir = async (reintento) => {
            try {
                const { data } = await axios.get(`${API}/me`);
                setCuenta(data?.cuenta || null);
                setEquipo(null);
                setErrorMe(null);
                return data;
            } catch (err) {
                const st = err.response?.status;
                if (st === 401) {
                    if (reintento) {
                        try {
                            const { data: r } = await supabase.auth.refreshSession();
                            if (r?.session?.access_token) {
                                ponerToken(r.session.access_token);
                                setSession(r.session);
                                return pedir(false);
                            }
                        } catch { /* cae a cerrar */ }
                    }
                    await limpiarLocal();
                    return null;
                }
                setCuenta(null);
                if (st === 403 && errorDe(err).code === 'RITEAPP_SIN_CUENTA') await mirarEquipo(); else setEquipo(null);
                setErrorMe({
                    status: st || 0,
                    code: errorDe(err).code || null,
                    mensaje: st === 403 ? (errorDe(err).error || 'Esta cuenta no tiene acceso a la app RITE.') : mensajeError(err, 'No hemos podido cargar tu cuenta.'),
                });
                return null;
            }
        };
        return pedir(true);
    }, [limpiarLocal, ponerToken]);

    useEffect(() => {
        let vivo = true;
        (async () => {
            let s = null;
            try { ({ data: { session: s } } = await supabase.auth.getSession()); } catch { s = null; }
            if (!vivo) return;
            setSession(s);
            ponerToken(s?.access_token);
            userIdRef.current = s?.user?.id || null;
            if (s) await cargarMe();
            if (vivo) setLoading(false);
        })();
        const { data: sub } = supabase.auth.onAuthStateChange((evento, s) => {
            if (!vivo) return;
            if (evento === 'SIGNED_OUT') {
                ponerToken(null); userIdRef.current = null;
                setSession(null); setCuenta(null); setEquipo(null); setErrorMe(null);
                return;
            }
            if (s?.access_token) {
                ponerToken(s.access_token);
                setSession(s);
                if (s.user?.id && s.user.id !== userIdRef.current) {
                    userIdRef.current = s.user.id;
                    setTimeout(() => { if (vivo) cargarMe(); }, 0);
                }
            }
        });
        return () => { vivo = false; sub?.subscription?.unsubscribe(); };
    }, [cargarMe, ponerToken]);

    /** «Continuar con Google». `vuelta`: ruta interna a la que vuelve con la sesión. */
    const entrarConGoogle = useCallback(async (vuelta = '/panel') => {
        try {
            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: { redirectTo: `${window.location.origin}${vuelta}`, queryParams: { prompt: 'select_account' } },
            });
            if (error) return { ok: false, error: 'No hemos podido abrir Google. Vuelve a intentarlo o entra con tu email.' };
            return { ok: true };
        } catch {
            return { ok: false, error: 'No hemos podido conectar. Revisa la conexión y vuelve a intentarlo.' };
        }
    }, []);

    /**
     * Email y contraseña, como cee.brokergy.es: la MISMA cuenta de Supabase que el CRM,
     * así que el equipo de BROKERGY entra con su usuario de app.brokergy.es (Fran, 26/11/2026).
     */
    const entrarConPassword = useCallback(async (email, password) => {
        const correo = String(email || '').trim().toLowerCase();
        if (!correo || !password) return { ok: false, error: 'Escribe tu email y tu contraseña.' };
        try {
            const { data, error } = await supabase.auth.signInWithPassword({ email: correo, password });
            if (error) {
                const msg = /invalid login|invalid credentials/i.test(error.message)
                    ? 'El email o la contraseña no son correctos. Si no tienes contraseña, pide el enlace a tu email.'
                    : /email not confirmed/i.test(error.message)
                        ? 'Tu cuenta aún no está activada. Pide el enlace a tu email.'
                        : 'No hemos podido entrar. Vuelve a intentarlo.';
                return { ok: false, error: msg };
            }
            ponerToken(data.session?.access_token);
            userIdRef.current = data.session?.user?.id || null;
            setSession(data.session);
            await cargarMe();
            return { ok: true };
        } catch {
            return { ok: false, error: 'No hemos podido conectar. Revisa la conexión y vuelve a intentarlo.' };
        }
    }, [cargarMe, ponerToken]);

    /** Enlace para entrar al email (sirve para darse de alta y para volver). */
    const entrarConEmail = useCallback(async (email, vuelta = '/panel') => {
        const correo = String(email || '').trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo)) return { ok: false, error: 'Revisa el email: no parece correcto.' };
        try {
            const { error } = await supabase.auth.signInWithOtp({
                email: correo,
                options: { emailRedirectTo: `${window.location.origin}${vuelta}`, shouldCreateUser: true },
            });
            if (error) {
                return { ok: false, error: /rate|seconds/i.test(error.message) ? 'Ya te hemos mandado un enlace hace un momento. Espera un minuto y vuelve a pedirlo.' : 'No hemos podido mandar el enlace. Vuelve a intentarlo.' };
            }
            return { ok: true };
        } catch {
            return { ok: false, error: 'No hemos podido conectar. Revisa la conexión y vuelve a intentarlo.' };
        }
    }, []);

    const signOut = useCallback(() => limpiarLocal(), [limpiarLocal]);
    const refrescar = useCallback(() => cargarMe(), [cargarMe]);

    const valor = useMemo(() => ({
        session,
        email: session?.user?.email || cuenta?.email || null,
        nombreSesion: session?.user?.user_metadata?.full_name || '',
        cuenta,
        loading,
        errorMe,
        equipo,
        sinCuenta: !!session && !cuenta && !equipo && errorMe?.code === 'RITEAPP_SIN_CUENTA',
        entrarConGoogle,
        entrarConEmail,
        entrarConPassword,
        signOut,
        refrescar,
        ponerCuenta: setCuenta,
    }), [session, cuenta, equipo, loading, errorMe, entrarConGoogle, entrarConEmail, entrarConPassword, signOut, refrescar]);

    return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useRiteAuth() {
    const c = useContext(Ctx);
    if (!c) throw new Error('useRiteAuth debe usarse dentro de <RiteAuthProvider>');
    return c;
}
