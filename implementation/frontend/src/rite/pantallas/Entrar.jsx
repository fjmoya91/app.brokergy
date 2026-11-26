// ─── Entrar — la entrada de rite.brokergy.es, como la de cee.brokergy.es ─────
// Fran, 26/11/2026: «quiero que sea como la app cee.brokergy». Google, o email y
// CONTRASEÑA (la misma cuenta de Supabase que el CRM: el equipo entra con su
// usuario de app.brokergy.es), y para quien no tiene contraseña, el enlace al
// email. Con sesión, la portada redirige sola (al panel o a /admin).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { Campo, Papel } from '../../certificadores/ui/piezas';
import { CheckDibujado, IcoFlecha, Spinner } from '../../certificadores/ui/Iconos';
import { LogoGoogle, RayaO } from '../../certificadores/publico/BotonGoogle';
import { useGoogleActivo } from '../../certificadores/publico/googleActivo';
import { Enlace, navegar } from '../../certificadores/router';
import { useRiteAuth } from '../auth/RiteAuth';
import { Cabecera, Pie } from '../ui/Marco';

/** Solo se vuelve a rutas internas (nada de `//otro-sitio`). */
function vueltaSegura(v) {
    return v && v.startsWith('/') && !v.startsWith('//') ? v : null;
}

export default function Entrar({ query }) {
    const { session, cuenta, equipo, loading, sinCuenta, entrarConGoogle, entrarConEmail, entrarConPassword } = useRiteAuth();
    const googleActivo = useGoogleActivo();
    const vuelta = vueltaSegura(query?.get('vuelta'));
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [ver, setVer] = useState(false);
    const [enviando, setEnviando] = useState(false);
    const [google, setGoogle] = useState(false);
    const [error, setError] = useState(null);
    const [enviadoA, setEnviadoA] = useState(null);

    // Con sesión (o de vuelta de Google o del enlace), cada uno a su sitio.
    useEffect(() => {
        if (loading || !session) return;
        if (cuenta) navegar(vuelta || '/panel', { replace: true });
        else if (equipo) navegar(vuelta || '/admin', { replace: true });
        else if (sinCuenta) navegar('/alta', { replace: true });
    }, [loading, session, cuenta, equipo, sinCuenta, vuelta]);

    const conGoogle = async () => {
        setGoogle(true); setError(null);
        const r = await entrarConGoogle(`/entrar${vuelta ? `?vuelta=${encodeURIComponent(vuelta)}` : ''}`);
        if (!r.ok) { setGoogle(false); setError(r.error); }
    };

    const entrar = async (e) => {
        e.preventDefault();
        if (!email.trim() || !password) { setError('Escribe tu email y tu contraseña.'); return; }
        setEnviando(true); setError(null);
        const r = await entrarConPassword(email, password);
        setEnviando(false);
        if (!r.ok) setError(r.error);
        // Con ok, el efecto de arriba lleva al panel o a la administración.
    };

    const pedirEnlace = async () => {
        setEnviando(true); setError(null);
        const r = await entrarConEmail(email, `/entrar${vuelta ? `?vuelta=${encodeURIComponent(vuelta)}` : ''}`);
        setEnviando(false);
        if (r.ok) setEnviadoA(email.trim().toLowerCase()); else setError(r.error);
    };

    if (enviadoA) {
        return (
            <Papel>
                <div className="ca-col">
                    <Cabecera />
                    <div className="ca-card ca-pad ca-in">
                        <div className="ca-filete" />
                        <CheckDibujado />
                        <p className="ca-eyebrow ca-eyebrow-verde" style={{ marginTop: 16 }}>Enviado</p>
                        <h1 className="ca-display ca-h2" style={{ marginTop: 8 }}>Mira tu <span className="ca-mark">email</span></h1>
                        <p className="ca-txt">
                            Te acabamos de mandar a <b>{enviadoA}</b> un enlace para entrar. Púlsalo desde este mismo
                            navegador. Si no lo ves, mira en la carpeta de spam.
                        </p>
                        <div className="ca-btns">
                            <button type="button" className="ca-btn ca-btn-sec" onClick={() => setEnviadoA(null)}>Volver</button>
                        </div>
                    </div>
                    <Pie />
                </div>
            </Papel>
        );
    }

    return (
        <Papel>
            <div className="ca-col">
                <Cabecera />
                <form className="ca-card ca-pad ca-in" onSubmit={entrar} noValidate>
                    <div className="ca-filete" />
                    <p className="ca-eyebrow">Tu cuenta</p>
                    <h1 className="ca-display ca-h2" style={{ marginTop: 8 }}>Entrar</h1>
                    {googleActivo && (
                        <>
                            <div style={{ marginTop: 18 }}>
                                <button type="button" className="ca-btn ca-btn-sec" onClick={conGoogle} disabled={google} style={{ fontWeight: 600 }}>
                                    {google ? <Spinner /> : <LogoGoogle />} {google ? 'Abriendo Google…' : 'Continuar con Google'}
                                </button>
                            </div>
                            <RayaO texto="o con tu email" />
                        </>
                    )}
                    <Campo etiqueta="Email">
                        <input className="ca-input" type="email" inputMode="email" autoComplete="username" value={email}
                            onChange={e => setEmail(e.target.value)} />
                    </Campo>
                    <Campo etiqueta="Contraseña">
                        <div style={{ position: 'relative' }}>
                            <input className="ca-input" type={ver ? 'text' : 'password'} autoComplete="current-password" value={password}
                                onChange={e => setPassword(e.target.value)} style={{ paddingRight: 84 }} />
                            <button type="button" className="ca-link" onClick={() => setVer(v => !v)}
                                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 13 }}>
                                {ver ? 'Ocultar' : 'Ver'}
                            </button>
                        </div>
                    </Campo>
                    {error && <p className="ca-error" role="alert">{error}</p>}
                    <div className="ca-btns">
                        <button type="submit" className="ca-btn ca-btn-pri" disabled={enviando}>
                            {enviando ? <><Spinner /> Entrando…</> : <>Entrar <IcoFlecha /></>}
                        </button>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                        <button type="button" className="ca-link ca-link-gris" disabled={enviando}
                            onClick={() => (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim()) ? pedirEnlace() : setError('Escribe tu email y te mandamos un enlace para entrar sin contraseña.'))}>
                            Entrar sin contraseña
                        </button>
                        <Enlace to="/" className="ca-link ca-link-gris">Aún no tengo cuenta</Enlace>
                    </div>
                </form>
                <Pie />
            </div>
        </Papel>
    );
}
