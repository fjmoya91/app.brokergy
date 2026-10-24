// ─── CertappAuth.jsx — la sesión de la app de certificadores ────────────────
// Mismo Supabase Auth que el CRM, pero un certificador externo NO es un
// `usuarios`: su perfil sale de `/api/certapp/me` (`certapp_cuentas`), nunca de
// la tabla del CRM. Por eso esto NO importa el AuthContext del CRM ni nada de su
// DashboardLayout: el interceptor del CRM cierra la sesión ante cualquier 401 y
// su perfil se lee de `usuarios`, que un certificador no tiene.
//
// Contrato (lo usan otros agentes, p. ej. la envolvente):
//   useCertappAuth() → { session, token, cuenta, esAdmin, loading,
//                        signIn(email, password), signOut(), refrescar() }
//   + `axios.defaults.headers.common.Authorization = 'Bearer …'` con la sesión,
//     porque la envolvente (del CRM) llama con el axios global.
//
// REGLA — `signOut` limpia la sesión local PASE LO QUE PASE (la misma del menú
// del CRM): si Supabase no contesta, el usuario igualmente sale.
// REGLA — con el servidor caído (503 / sin red) NO se trata como «sin cuenta»:
// se dice que no se ha podido cargar y se ofrece reintentar (regla 38).
// ─────────────────────────────────────────────────────────────────────────────
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { supabase } from '../../services/supabaseClient';
import { API, errorDe, mensajeError } from '../api';
import { demoActiva } from '../dev/flag';

const Ctx = createContext(null);

// El enlace de «cambiar la contraseña» de Supabase llega con `#…type=recovery` en
// la URL; supabase-js lo consume y lo borra al arrancar, así que se mira ANTES.
const LLEGO_DE_RECUPERACION = typeof window !== 'undefined' && /type=recovery/.test(window.location.hash || '');

function sesionDemo() {
    try { return JSON.parse(sessionStorage.getItem('certapp_demo_sesion') || 'null'); } catch { return null; }
}

function borrarRastroSupabase() {
    try {
        Object.keys(window.localStorage)
            .filter(k => /^sb-.*-auth-token/.test(k))
            .forEach(k => window.localStorage.removeItem(k));
    } catch { /* noop */ }
}

export function CertappAuthProvider({ children }) {
    const demo = demoActiva();
    const [session, setSession] = useState(null);
    const [cuenta, setCuenta] = useState(null);
    const [esAdmin, setEsAdmin] = useState(false);
    const [loading, setLoading] = useState(true);
    // { status, code, mensaje } cuando /me no ha podido decir quién es (403: sin
    // cuenta en la app · 503/sin red: no se sabe, reintentar)
    const [errorMe, setErrorMe] = useState(null);
    const [recuperando, setRecuperando] = useState(LLEGO_DE_RECUPERACION);
    const tokenRef = useRef(null);
    const userIdRef = useRef(null);

    const ponerToken = useCallback((t) => {
        tokenRef.current = t || null;
        if (t) axios.defaults.headers.common.Authorization = `Bearer ${t}`;
        else delete axios.defaults.headers.common.Authorization;
    }, []);

    const limpiarLocal = useCallback(async () => {
        if (!demo) {
            try { await supabase.auth.signOut({ scope: 'local' }); } catch { /* sale igual */ }
            borrarRastroSupabase();
        } else {
            try { sessionStorage.removeItem('certapp_demo_sesion'); } catch { /* noop */ }
        }
        ponerToken(null);
        userIdRef.current = null;
        setSession(null);
        setCuenta(null);
        setEsAdmin(false);
        setErrorMe(null);
    }, [demo, ponerToken]);

    const cargarMe = useCallback(async (reintentoInicial = true) => {
        if (!tokenRef.current) {
            setCuenta(null); setEsAdmin(false); setErrorMe(null);
            return null;
        }
        // `pedir` se llama a sí misma una vez tras renovar el token.
        const pedir = async (reintento) => { try {
            const { data } = await axios.get(`${API}/me`);
            setCuenta(data?.cuenta || null);
            setEsAdmin(!!data?.esAdmin);
            setErrorMe(null);
            return data;
        } catch (err) {
            const st = err.response?.status;
            const { code } = errorDe(err);
            if (st === 401) {
                // El token puede haber caducado justo ahora: se intenta renovar una vez.
                if (reintento && !demo) {
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
            setEsAdmin(false);
            setErrorMe({
                status: st || 0,
                code: code || null,
                mensaje: st === 403
                    ? (errorDe(err).error || 'Esta cuenta no tiene acceso a la app de certificadores.')
                    : mensajeError(err, 'No hemos podido cargar tu cuenta.'),
            });
            return null;
        } };
        return pedir(reintentoInicial);
    }, [demo, limpiarLocal, ponerToken]);

    // Arranque: la sesión guardada y, con ella, quién es.
    useEffect(() => {
        let vivo = true;
        (async () => {
            let s = null;
            if (demo) s = sesionDemo();
            else {
                try { ({ data: { session: s } } = await supabase.auth.getSession()); } catch { s = null; }
            }
            if (!vivo) return;
            setSession(s);
            ponerToken(s?.access_token);
            userIdRef.current = s?.user?.id || null;
            if (s) await cargarMe();
            if (vivo) setLoading(false);
        })();
        if (demo) return () => { vivo = false; };

        const { data: sub } = supabase.auth.onAuthStateChange((evento, s) => {
            if (!vivo) return;
            if (evento === 'PASSWORD_RECOVERY') setRecuperando(true);
            if (evento === 'SIGNED_OUT') {
                ponerToken(null); userIdRef.current = null;
                setSession(null); setCuenta(null); setEsAdmin(false); setErrorMe(null);
                return;
            }
            if (s?.access_token) {
                ponerToken(s.access_token);
                setSession(s);
                // Otro usuario (o el primero tras el enlace de recuperación): quién es.
                // Fuera del callback: Supabase pide no encadenar llamadas dentro de él.
                if (s.user?.id && s.user.id !== userIdRef.current) {
                    userIdRef.current = s.user.id;
                    setTimeout(() => { if (vivo) cargarMe(); }, 0);
                }
            }
        });
        return () => { vivo = false; sub?.subscription?.unsubscribe(); };
    }, [demo, cargarMe, ponerToken]);

    const signIn = useCallback(async (email, password) => {
        const correo = String(email || '').trim().toLowerCase();
        if (demo) {
            const s = { access_token: 'demo', user: { id: 'demo', email: correo } };
            try { sessionStorage.setItem('certapp_demo_sesion', JSON.stringify(s)); } catch { /* noop */ }
            setSession(s); ponerToken('demo'); userIdRef.current = 'demo';
            const me = await cargarMe();
            return { ok: true, me };
        }
        try {
            const { data, error } = await supabase.auth.signInWithPassword({ email: correo, password });
            if (error) {
                const msg = /invalid login|invalid credentials/i.test(error.message)
                    ? 'El email o la contraseña no son correctos.'
                    : /email not confirmed/i.test(error.message)
                        ? 'Tu cuenta aún no está activada. Usa el enlace de la invitación.'
                        : 'No hemos podido entrar. Vuelve a intentarlo.';
                return { ok: false, error: msg };
            }
            setSession(data.session);
            ponerToken(data.session?.access_token);
            userIdRef.current = data.session?.user?.id || null;
            const me = await cargarMe();
            return { ok: true, me };
        } catch {
            return { ok: false, error: 'No hemos podido conectar. Revisa la conexión y vuelve a intentarlo.' };
        }
    }, [demo, cargarMe, ponerToken]);

    const signOut = useCallback(async () => {
        await limpiarLocal();
    }, [limpiarLocal]);

    const refrescar = useCallback(() => cargarMe(), [cargarMe]);

    const valor = useMemo(() => ({
        session,
        token: session?.access_token || null,
        email: session?.user?.email || cuenta?.email || null,
        cuenta,
        esAdmin,
        loading,
        errorMe,
        recuperando,
        terminarRecuperacion: () => setRecuperando(false),
        signIn,
        signOut,
        refrescar,
    }), [session, cuenta, esAdmin, loading, errorMe, recuperando, signIn, signOut, refrescar]);

    return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useCertappAuth() {
    const c = useContext(Ctx);
    if (!c) throw new Error('useCertappAuth debe usarse dentro de <CertappAuthProvider>');
    return c;
}

export default CertappAuthProvider;
