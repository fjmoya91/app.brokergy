// ─── Activar — /activar?token= : la invitación, poner la contraseña ─────────
// GET /api/public/certapp/activar/:token → { tipo: activar|recuperar, email, nombre, preexistente }
// POST /activar { token, password } → { ok, email }. Sirve también para «He olvidado la
// contraseña»: el backend manda este mismo enlace con `&recuperar=1`.
// Hecho esto, se entra solo con esa contraseña y se va al panel.
import { useEffect, useState } from 'react';
import axios from 'axios';
import { API_PUB, mensajeError } from '../api';
import { useCertappAuth } from '../auth/CertappAuth';
import { Enlace, navegar } from '../router';
import { CabeceraPublica, Campo, Esqueleto, Firma, Papel } from '../ui/piezas';
import { CheckDibujado, IcoFlecha, Spinner } from '../ui/Iconos';

export function reglasContrasena(p, p2) {
    if (String(p || '').length < 8) return 'La contraseña tiene que tener al menos 8 caracteres.';
    if (p2 != null && p !== p2) return 'Las dos contraseñas no coinciden.';
    return null;
}

export default function Activar({ query }) {
    const token = query.get('token') || '';
    const { signIn } = useCertappAuth();
    const [info, setInfo] = useState(null);       // { email, nombre }
    const [errorCarga, setErrorCarga] = useState(null);
    const [cargando, setCargando] = useState(true);
    const [p1, setP1] = useState('');
    const [p2, setP2] = useState('');
    const [enviando, setEnviando] = useState(false);
    const [error, setError] = useState(null);
    const [hecho, setHecho] = useState(false);
    // El enlace de «He olvidado la contraseña» es el mismo /activar con `&recuperar=1`.
    const recuperar = info?.tipo === 'recuperar' || query.get('recuperar') === '1';

    useEffect(() => {
        let vivo = true;
        if (!token) { setCargando(false); setErrorCarga('Al enlace le falta el código. Ábrelo desde el mensaje de la invitación.'); return undefined; }
        axios.get(`${API_PUB}/activar/${encodeURIComponent(token)}`)
            .then(({ data }) => { if (vivo) setInfo(data?.cuenta || data || {}); })
            .catch((err) => {
                if (!vivo) return;
                const st = err.response?.status;
                // 400 TOKEN_INVALIDO (usado o roto) · 410 TOKEN_CADUCADO · 403 CERTAPP_BLOQUEADA
                setErrorCarga(st === 404 || st === 410 || st === 400
                    ? `${err.response?.data?.error || 'Este enlace ya se ha usado o ha caducado.'} Si aún no tienes contraseña, pide otro en «He olvidado la contraseña».`
                    : mensajeError(err, 'No hemos podido comprobar el enlace.'));
            })
            .finally(() => { if (vivo) setCargando(false); });
        return () => { vivo = false; };
    }, [token]);

    const guardar = async (e) => {
        e.preventDefault();
        const malo = reglasContrasena(p1, p2);
        if (malo) { setError(malo); return; }
        setEnviando(true); setError(null);
        try {
            const { data } = await axios.post(`${API_PUB}/activar`, { token, password: p1 });
            const email = data?.email || info?.email;
            setHecho(true);
            if (email) {
                const r = await signIn(email, p1);
                if (r.ok) { navegar('/panel?bienvenida=1', { replace: true }); return; }
            }
        } catch (err) {
            if (err.response?.status === 409 && err.response?.data?.code === 'USAR_PASSWORD_EXISTENTE') {
                // Ya tenía usuario (p. ej. del CRM): su contraseña es la de siempre.
                setInfo(i => ({ ...(i || {}), preexistente: true }));
                return;
            }
            setError(mensajeError(err, 'No se ha podido guardar la contraseña.'));
        } finally {
            setEnviando(false);
        }
    };

    return (
        <Papel>
            <div className="ca-col">
                <CabeceraPublica />
                {cargando ? <Esqueleto alto={280} /> : errorCarga ? (
                    <div className="ca-card ca-pad ca-in">
                        <div className="ca-filete" />
                        <p className="ca-eyebrow">Invitación</p>
                        <h1 className="ca-display ca-h2" style={{ marginTop: 8 }}>No podemos usar este enlace</h1>
                        <p className="ca-txt">{errorCarga}</p>
                        <div className="ca-btns">
                            <Enlace to="/entrar" className="ca-btn ca-btn-pri">Ya tengo contraseña: entrar</Enlace>
                            <Enlace to="/recuperar" className="ca-btn ca-btn-sec">He olvidado la contraseña</Enlace>
                        </div>
                    </div>
                ) : info?.preexistente ? (
                    <div className="ca-card ca-pad ca-in">
                        <div className="ca-filete" />
                        <p className="ca-eyebrow ca-eyebrow-verde">Tienes plaza en la beta</p>
                        <h1 className="ca-display ca-h2" style={{ marginTop: 8 }}>Entra con tu <span className="ca-mark">contraseña</span> de siempre</h1>
                        <p className="ca-txt">
                            {info?.email ? <><b>{info.email}</b> ya</> : 'Tu email ya'} tenía usuario con BROKERGY: entra con la misma contraseña que usas allí.
                        </p>
                        <div className="ca-btns"><Enlace to="/entrar" className="ca-btn ca-btn-pri">Entrar <IcoFlecha /></Enlace></div>
                    </div>
                ) : hecho ? (
                    <div className="ca-card ca-pad ca-in">
                        <div className="ca-filete" />
                        <CheckDibujado />
                        <h1 className="ca-display ca-h2" style={{ marginTop: 14 }}>Contraseña <span className="ca-mark">guardada</span></h1>
                        <p className="ca-txt">Ya puedes entrar con tu email y la contraseña que acabas de poner.</p>
                        <div className="ca-btns"><Enlace to="/entrar" className="ca-btn ca-btn-pri">Entrar <IcoFlecha /></Enlace></div>
                    </div>
                ) : (
                    <form className="ca-card ca-pad ca-in" onSubmit={guardar} noValidate>
                        <div className="ca-filete" />
                        <p className="ca-eyebrow ca-eyebrow-verde">{recuperar ? 'Cambiar la contraseña' : 'Tienes plaza en la beta'}</p>
                        <h1 className="ca-display ca-h2" style={{ marginTop: 8 }}>
                            {recuperar ? <>Pon una contraseña <span className="ca-mark">nueva</span></>
                                : info?.nombre ? <>Hola, <span className="ca-mark">{String(info.nombre).split(' ')[0]}</span></> : <>Activa tu <span className="ca-mark">cuenta</span></>}
                        </h1>
                        <p className="ca-txt">{recuperar ? 'La de antes deja de valer' : 'Pon una contraseña para entrar'}{info?.email ? <> con <b>{info.email}</b></> : ''}.</p>
                        <div style={{ marginTop: 18 }}>
                            {info?.email && <input type="email" autoComplete="username" value={info.email} readOnly hidden />}
                            <Campo etiqueta="Contraseña" ayuda="Al menos 8 caracteres.">
                                <input className="ca-input" type="password" autoComplete="new-password" value={p1} onChange={e => setP1(e.target.value)} autoFocus />
                            </Campo>
                            <Campo etiqueta="Repite la contraseña">
                                <input className="ca-input" type="password" autoComplete="new-password" value={p2} onChange={e => setP2(e.target.value)} />
                            </Campo>
                        </div>
                        {error && <p className="ca-error" role="alert">{error}</p>}
                        <div className="ca-btns">
                            <button type="submit" className="ca-btn ca-btn-pri" disabled={enviando}>
                                {enviando ? <><Spinner /> Guardando…</> : <>Guardar y entrar <IcoFlecha /></>}
                            </button>
                        </div>
                    </form>
                )}
                <Firma />
            </div>
        </Papel>
    );
}
