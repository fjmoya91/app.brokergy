// ─── Entrar — con Google, con un enlace al email o con contraseña ───────────
// · `?t=…`        el enlace del email: se canjea por la sesión y dentro.
// · `?con=google` vuelta de Google: con cuenta, dentro; sin cuenta, al
//                 formulario de la beta para darse de alta (`/beta?con=google`).
// · Lo normal: «Continuar con Google» o «Mándame un enlace» (POST /enlace, que
//   responde siempre lo mismo). La contraseña, plegada: la tiene quien se la puso.
import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { API_PUB, mensajeError } from '../api';
import { useCertappAuth } from '../auth/CertappAuth';
import { Enlace, navegar } from '../router';
import { CabeceraPublica, Campo, CargandoPantalla, Firma, Papel } from '../ui/piezas';
import { CheckDibujado, IcoFlecha, Spinner } from '../ui/Iconos';
import { BotonGoogle, RayaO } from './BotonGoogle';
import { useGoogleActivo } from './googleActivo';

/** Solo se vuelve a rutas internas (nada de `//otro-sitio`). */
function vueltaSegura(v) {
    return v && v.startsWith('/') && !v.startsWith('//') ? v : null;
}
const emailValido = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || '').trim());

export default function Entrar({ query }) {
    const { session, cuenta, esAdmin, loading, sinCuenta, errorMe, signIn, entrarConEnlace } = useCertappAuth();
    const googleActivo = useGoogleActivo();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [conPassword, setConPassword] = useState(false);
    const [ver, setVer] = useState(false);
    const [enviando, setEnviando] = useState(false);
    const [error, setError] = useState(null);
    const [enviadoA, setEnviadoA] = useState(null);
    const [canjeando, setCanjeando] = useState(() => !!query.get('t'));
    const vuelta = vueltaSegura(query.get('vuelta'));
    const t = query.get('t');
    const canjeado = useRef(false);

    // El enlace del email: una sola vez (el token es de un solo uso).
    useEffect(() => {
        if (!t || canjeado.current) return;
        canjeado.current = true;
        (async () => {
            const r = await entrarConEnlace(t);
            if (r.ok && (r.me?.cuenta || r.me?.esAdmin)) {
                // La primera vez (la cuenta aún PENDIENTE), con la bienvenida del panel.
                const panel = r.me.cuenta?.estado === 'PENDIENTE' ? '/panel?bienvenida=1' : '/panel';
                navegar(vuelta || (r.me.cuenta ? panel : '/admin'), { replace: true });
                return;
            }
            setCanjeando(false);
            setError(r.ok ? 'Este usuario no tiene cuenta en la app.' : r.error);
            window.history.replaceState({}, '', '/entrar');   // que recargar no gaste otro intento
        })();
    }, [t, entrarConEnlace, vuelta]);

    // Con sesión ya abierta (o de vuelta de Google), aquí no se hace nada.
    useEffect(() => {
        if (t || loading || !session) return;
        if (cuenta) navegar(vuelta || '/panel', { replace: true });
        else if (esAdmin) navegar(vuelta || '/admin', { replace: true });
        else if (sinCuenta) navegar('/beta?con=google', { replace: true });
    }, [t, loading, session, cuenta, esAdmin, sinCuenta, vuelta]);

    const pedirEnlace = async (e) => {
        e.preventDefault();
        if (!emailValido(email)) { setError('Revisa el email: así no te llegaría.'); return; }
        setEnviando(true); setError(null);
        try {
            await axios.post(`${API_PUB}/enlace`, { email: email.trim().toLowerCase() });
            setEnviadoA(email.trim().toLowerCase());
        } catch (err) {
            setError(mensajeError(err, 'No se ha podido enviar. Vuelve a intentarlo.'));
        } finally { setEnviando(false); }
    };

    const entrar = async (e) => {
        e.preventDefault();
        if (!email.trim() || !password) { setError('Escribe tu email y tu contraseña.'); return; }
        setEnviando(true); setError(null);
        const r = await signIn(email, password);
        setEnviando(false);
        if (!r.ok) { setError(r.error); return; }
        if (r.me?.cuenta) navegar(vuelta || '/panel', { replace: true });
        else if (r.me?.esAdmin) navegar(vuelta || '/admin', { replace: true });
        else navegar(vuelta || '/panel', { replace: true }); // la puerta dirá qué pasa
    };

    // Cargando, o con sesión y a punto de irse a su sitio (el efecto de arriba).
    const yendo = !t && !!session && !!(cuenta || esAdmin || sinCuenta);
    if (canjeando || (loading && query.get('con') === 'google') || yendo) return <CargandoPantalla />;
    // Con sesión pero sin poder saber quién es (servidor caído): se dice, sin echarle.
    const errorSesion = session && errorMe && !sinCuenta ? errorMe.mensaje : null;

    if (enviadoA) {
        return (
            <Papel>
                <div className="ca-col">
                    <CabeceraPublica />
                    <div className="ca-card ca-pad ca-in">
                        <div className="ca-filete" />
                        <CheckDibujado />
                        <p className="ca-eyebrow ca-eyebrow-verde" style={{ marginTop: 16 }}>Enviado</p>
                        <h1 className="ca-display ca-h2" style={{ marginTop: 8 }}>Mira tu <span className="ca-mark">email</span></h1>
                        <p className="ca-txt">
                            Si <b>{enviadoA}</b> tiene cuenta, te acabamos de mandar un enlace para entrar. Caduca en 1 hora y
                            sirve una vez. Si no lo ves, mira en la carpeta de spam.
                        </p>
                        <div className="ca-btns">
                            <button type="button" className="ca-btn ca-btn-sec" onClick={() => setEnviadoA(null)}>Usar otro email</button>
                        </div>
                        <p className="ca-peq" style={{ marginTop: 10 }}>¿Aún no tienes cuenta? <Enlace to="/beta?origen=entrar">Créala gratis</Enlace>.</p>
                    </div>
                    <Firma />
                </div>
            </Papel>
        );
    }

    return (
        <Papel>
            <div className="ca-col">
                <CabeceraPublica />
                <form className="ca-card ca-pad ca-in" onSubmit={conPassword ? entrar : pedirEnlace} noValidate>
                    <div className="ca-filete" />
                    <p className="ca-eyebrow">Tu cuenta</p>
                    <h1 className="ca-display ca-h2" style={{ marginTop: 8 }}>Entrar</h1>
                    {googleActivo && (
                        <>
                            <div style={{ marginTop: 18 }}>
                                <BotonGoogle vuelta={`/entrar?con=google${vuelta ? `&vuelta=${encodeURIComponent(vuelta)}` : ''}`} onError={setError} />
                            </div>
                            <RayaO texto="o con tu email" />
                        </>
                    )}
                    <Campo etiqueta="Email">
                        <input className="ca-input" type="email" inputMode="email" autoComplete="username" value={email}
                            onChange={e => setEmail(e.target.value)} />
                    </Campo>
                    {conPassword && (
                        <Campo etiqueta="Contraseña">
                            <div style={{ position: 'relative' }}>
                                <input className="ca-input" type={ver ? 'text' : 'password'} autoComplete="current-password" value={password}
                                    onChange={e => setPassword(e.target.value)} style={{ paddingRight: 84 }} autoFocus />
                                <button type="button" className="ca-link" onClick={() => setVer(v => !v)}
                                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 13 }}>
                                    {ver ? 'Ocultar' : 'Ver'}
                                </button>
                            </div>
                        </Campo>
                    )}
                    {(error || errorSesion) && <p className="ca-error" role="alert">{error || errorSesion}</p>}
                    <div className="ca-btns">
                        <button type="submit" className="ca-btn ca-btn-pri" disabled={enviando}>
                            {enviando
                                ? <><Spinner /> {conPassword ? 'Entrando…' : 'Enviando…'}</>
                                : conPassword ? <>Entrar <IcoFlecha /></> : <>Mándame un enlace para entrar <IcoFlecha /></>}
                        </button>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                        {conPassword
                            ? <Enlace to="/recuperar" className="ca-link ca-link-gris">He olvidado la contraseña</Enlace>
                            : <button type="button" className="ca-link ca-link-gris" onClick={() => { setConPassword(true); setError(null); }}>Entrar con contraseña</button>}
                        <Enlace to="/beta?origen=entrar" className="ca-link ca-link-gris">Aún no tengo cuenta</Enlace>
                    </div>
                </form>
                <Firma />
            </div>
        </Papel>
    );
}
