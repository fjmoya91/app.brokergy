// ─── Inicio.jsx — la portada de rite.brokergy.es y la entrada ───────────────
// Lo que hace la app, en una tarjeta, y entrar con Google o con un enlace al
// email (sirve igual para darse de alta). Los textos dicen SOLO lo que la app
// hace (como la landing de cee.brokergy.es).
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react';
import { Aviso, Campo, Papel } from '../../certificadores/ui/piezas';
import { IcoCasa, IcoCheck, IcoChispa, IcoDoc, IcoEnviar, Spinner } from '../../certificadores/ui/Iconos';
import { useRiteAuth } from '../auth/RiteAuth';
import { Cabecera, Pie } from '../ui/Marco';

const PASOS = [
    { Ico: IcoCasa, t: 'La vivienda, del Catastro', d: 'Con la referencia catastral: dirección, superficie, plantas y zona climática.' },
    { Ico: IcoChispa, t: 'El equipo, del catálogo', d: 'Busca la aerotermia por marca o modelo: potencias y refrigerante ya puestos.' },
    { Ico: IcoCheck, t: 'Las estancias, rápido o con radiadores', d: 'Te las proponemos por la superficie o metes los elementos de cada radiador, y la potencia sale de ahí.' },
    { Ico: IcoDoc, t: 'Lista para firmar', d: 'Memoria en Word y PDF, borrador del certificado de la instalación y la guía para darla de alta.' },
];

export default function Inicio({ query }) {
    const { entrarConGoogle, entrarConEmail } = useRiteAuth();
    const [email, setEmail] = useState('');
    const [estado, setEstado] = useState({ enviando: false, enviado: false, error: null, google: false });
    const vuelta = query?.get('vuelta') || '/panel';

    const google = async () => {
        setEstado(e => ({ ...e, google: true, error: null }));
        const r = await entrarConGoogle(vuelta);
        if (!r.ok) setEstado(e => ({ ...e, google: false, error: r.error }));
    };
    const enlace = async (ev) => {
        ev.preventDefault();
        setEstado(e => ({ ...e, enviando: true, error: null }));
        const r = await entrarConEmail(email, vuelta);
        setEstado(e => ({ ...e, enviando: false, enviado: r.ok, error: r.ok ? null : r.error }));
    };

    return (
        <Papel>
            <div className="ca-col">
                <Cabecera />
                <p className="ca-eyebrow ca-in">Para empresas instaladoras</p>
                <h1 className="ca-display ca-h1 ca-in" style={{ fontSize: 38, lineHeight: 1.14 }}>La memoria RITE de tu aerotermia, <span className="ca-mark">en minutos</span></h1>
                <p className="ca-sub ca-in ca-in-2">
                    Referencia catastral, equipo y estancias. Te la dejamos lista para firmar y presentar. Tu primera memoria es <b>gratis</b>.
                </p>

                <section className="ca-card ca-pad ca-in ca-in-3" style={{ marginTop: 22 }} id="entrar">
                    <div className="ca-filete" />
                    <h2 className="ca-display ca-h3">Entra o date de alta</h2>
                    <p className="ca-txt">Con tu cuenta de Google o con un enlace a tu email. Sin contraseñas.</p>
                    {estado.enviado ? (
                        <Aviso tono="ok" titulo="Te hemos mandado un enlace" className="ca-in">
                            Abre el email que te ha llegado a <b>{email.trim().toLowerCase()}</b> y pulsa el enlace para entrar. Si no lo ves, mira en el correo no deseado.
                        </Aviso>
                    ) : (
                        <>
                            <div className="ca-btns">
                                <button type="button" className="ca-btn ca-btn-pri" onClick={google} disabled={estado.google}>
                                    {estado.google ? <Spinner /> : <span aria-hidden="true" style={{ fontWeight: 800 }}>G</span>} Continuar con Google
                                </button>
                            </div>
                            <form onSubmit={enlace}>
                                <Campo etiqueta="O con tu email" id="rt-email">
                                    <input id="rt-email" className="ca-input" type="email" inputMode="email" autoComplete="email"
                                        placeholder="tu@empresa.es" value={email} onChange={e => setEmail(e.target.value)} />
                                </Campo>
                                <div className="ca-btns">
                                    <button type="submit" className="ca-btn ca-btn-sec" disabled={estado.enviando || !email.trim()}>
                                        {estado.enviando ? <Spinner /> : <IcoEnviar size={18} />} Mandarme el enlace
                                    </button>
                                </div>
                            </form>
                        </>
                    )}
                    {estado.error && <div style={{ marginTop: 12 }}><Aviso className="ca-in" titulo="No ha podido ser">{estado.error}</Aviso></div>}
                </section>

                <p className="ca-sec">Cómo funciona</p>
                <div className="ca-datos ca-in ca-in-4">
                    {PASOS.map(({ Ico, t, d }) => (
                        <div className="ca-dato" key={t}>
                            <span className="ca-ico-tile ca-tile-crema"><Ico size={19} /></span>
                            <div><b>{t}</b><small>{d}</small></div>
                        </div>
                    ))}
                </div>

                <div style={{ marginTop: 14 }}><Aviso tono="info" className="ca-in" titulo="De momento, Castilla-La Mancha">
                    La memoria sale en la plantilla oficial de la Junta (JCCM). Si la vivienda está en otra comunidad, la app te lo dice antes de generar.
                </Aviso></div>
                <Pie />
            </div>
        </Papel>
    );
}
