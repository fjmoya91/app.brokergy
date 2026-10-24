// ─── Recuperar — pedir el enlace para cambiar la contraseña ─────────────────
// POST /api/public/certapp/recuperar { email } → siempre { ok } (no se dice si
// el email tiene cuenta). Si se llega con el enlace de recuperación de Supabase
// (`#…type=recovery`), aquí mismo se pone la nueva contraseña.
import { useState } from 'react';
import axios from 'axios';
import { supabase } from '../../services/supabaseClient';
import { API_PUB, mensajeError } from '../api';
import { useCertappAuth } from '../auth/CertappAuth';
import { Enlace, navegar } from '../router';
import { CabeceraPublica, Campo, Firma, Papel } from '../ui/piezas';
import { CheckDibujado, IcoFlecha, Spinner } from '../ui/Iconos';
import { reglasContrasena } from './Activar';

export default function Recuperar() {
    const { recuperando, session, terminarRecuperacion, refrescar } = useCertappAuth();
    const [email, setEmail] = useState('');
    const [p1, setP1] = useState('');
    const [p2, setP2] = useState('');
    const [enviando, setEnviando] = useState(false);
    const [error, setError] = useState(null);
    const [enviado, setEnviado] = useState(false);

    const pedir = async (e) => {
        e.preventDefault();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) { setError('Revisa el email.'); return; }
        setEnviando(true); setError(null);
        try {
            await axios.post(`${API_PUB}/recuperar`, { email: email.trim().toLowerCase() });
            setEnviado(true);
        } catch (err) {
            setError(mensajeError(err, 'No se ha podido enviar. Vuelve a intentarlo.'));
        } finally {
            setEnviando(false);
        }
    };

    const cambiar = async (e) => {
        e.preventDefault();
        const malo = reglasContrasena(p1, p2);
        if (malo) { setError(malo); return; }
        setEnviando(true); setError(null);
        try {
            const { error: err } = await supabase.auth.updateUser({ password: p1 });
            if (err) throw err;
            terminarRecuperacion();
            await refrescar();
            navegar('/panel', { replace: true });
        } catch (err) {
            setError(err?.message && !/fetch/i.test(err.message)
                ? 'El enlace ha caducado. Pide otro desde esta misma página.'
                : 'No hemos podido conectar. Vuelve a intentarlo.');
        } finally {
            setEnviando(false);
        }
    };

    return (
        <Papel>
            <div className="ca-col">
                <CabeceraPublica />
                {recuperando && session ? (
                    <form className="ca-card ca-pad ca-in" onSubmit={cambiar} noValidate>
                        <div className="ca-filete" />
                        <p className="ca-eyebrow">Contraseña</p>
                        <h1 className="ca-display ca-h2" style={{ marginTop: 8 }}>Pon una contraseña <span className="ca-mark">nueva</span></h1>
                        <div style={{ marginTop: 18 }}>
                            <Campo etiqueta="Contraseña nueva" ayuda="Al menos 8 caracteres.">
                                <input className="ca-input" type="password" autoComplete="new-password" value={p1} onChange={e => setP1(e.target.value)} autoFocus />
                            </Campo>
                            <Campo etiqueta="Repítela">
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
                ) : enviado ? (
                    <div className="ca-card ca-pad ca-in">
                        <div className="ca-filete" />
                        <CheckDibujado />
                        <h1 className="ca-display ca-h2" style={{ marginTop: 14 }}>Mira tu <span className="ca-mark">correo</span></h1>
                        <p className="ca-txt">
                            Si <b>{email.trim()}</b> tiene cuenta, te hemos mandado un enlace para poner una contraseña nueva.
                            Puede tardar un par de minutos; mira también en el correo no deseado.
                        </p>
                        <div className="ca-btns"><Enlace to="/entrar" className="ca-btn ca-btn-sec">Volver a entrar</Enlace></div>
                    </div>
                ) : (
                    <form className="ca-card ca-pad ca-in" onSubmit={pedir} noValidate>
                        <div className="ca-filete" />
                        <p className="ca-eyebrow">Contraseña</p>
                        <h1 className="ca-display ca-h2" style={{ marginTop: 8 }}>¿Has olvidado la contraseña?</h1>
                        <p className="ca-txt">Te mandamos un enlace para poner una nueva.</p>
                        <div style={{ marginTop: 18 }}>
                            <Campo etiqueta="Tu email">
                                <input className="ca-input" type="email" inputMode="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} autoFocus />
                            </Campo>
                        </div>
                        {error && <p className="ca-error" role="alert">{error}</p>}
                        <div className="ca-btns">
                            <button type="submit" className="ca-btn ca-btn-pri" disabled={enviando}>
                                {enviando ? <><Spinner /> Enviando…</> : 'Mandarme el enlace'}
                            </button>
                        </div>
                        <div style={{ marginTop: 10 }}><Enlace to="/entrar" className="ca-link ca-link-gris">Volver a entrar</Enlace></div>
                    </form>
                )}
                <Firma />
            </div>
        </Papel>
    );
}
