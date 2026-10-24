// ─── Entrar — email y contraseña (Supabase Auth) ────────────────────────────
import { useEffect, useState } from 'react';
import { useCertappAuth } from '../auth/CertappAuth';
import { Enlace, navegar } from '../router';
import { CabeceraPublica, Campo, Firma, Papel } from '../ui/piezas';
import { IcoFlecha, Spinner } from '../ui/Iconos';

/** Solo se vuelve a rutas internas (nada de `//otro-sitio`). */
function vueltaSegura(v) {
    return v && v.startsWith('/') && !v.startsWith('//') ? v : null;
}

export default function Entrar({ query }) {
    const { session, cuenta, esAdmin, loading, signIn } = useCertappAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [ver, setVer] = useState(false);
    const [enviando, setEnviando] = useState(false);
    const [error, setError] = useState(null);
    const vuelta = vueltaSegura(query.get('vuelta'));

    // Con sesión ya abierta, aquí no se hace nada.
    useEffect(() => {
        if (loading || !session) return;
        if (cuenta) navegar(vuelta || '/panel', { replace: true });
        else if (esAdmin) navegar(vuelta || '/admin', { replace: true });
    }, [loading, session, cuenta, esAdmin, vuelta]);

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

    return (
        <Papel>
            <div className="ca-col">
                <CabeceraPublica />
                <form className="ca-card ca-pad ca-in" onSubmit={entrar} noValidate>
                    <div className="ca-filete" />
                    <p className="ca-eyebrow">Tu cuenta</p>
                    <h1 className="ca-display ca-h2" style={{ marginTop: 8 }}>Entrar</h1>
                    <div style={{ marginTop: 18 }}>
                        <Campo etiqueta="Email">
                            <input className="ca-input" type="email" inputMode="email" autoComplete="username" value={email}
                                onChange={e => setEmail(e.target.value)} autoFocus />
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
                    </div>
                    {error && <p className="ca-error" role="alert">{error}</p>}
                    <div className="ca-btns">
                        <button type="submit" className="ca-btn ca-btn-pri" disabled={enviando}>
                            {enviando ? <><Spinner /> Entrando…</> : <>Entrar <IcoFlecha /></>}
                        </button>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                        <Enlace to="/recuperar" className="ca-link ca-link-gris">He olvidado la contraseña</Enlace>
                        <Enlace to="/beta" className="ca-link ca-link-gris">Aún no tengo cuenta</Enlace>
                    </div>
                </form>
                <Firma />
            </div>
        </Papel>
    );
}
