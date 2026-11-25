// ─── App.jsx — las pantallas de la app RITE, por ruta (regla 245) ───────────
//   PÚBLICA   /            portada y entrar (Google o enlace al email)
//   SESIÓN    /alta        los datos de la empresa (la primera vez)
//   CUENTA    /panel · /memoria/:id · /perfil
// Enrutado a mano por pathname, con el router de la app de certificadores.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect } from 'react';
import { casar, Enlace, navegar, useRuta } from '../certificadores/router';
import { CSS } from '../certificadores/ui/estilo';
import { ErrorRed, Esqueleto, Papel, ToastProvider } from '../certificadores/ui/piezas';
import { useRiteAuth } from './auth/RiteAuth';
import { tituloPestana } from './marca';
import { CSS_RITE } from './ui/estilo';
import { Cabecera } from './ui/Marco';
import Inicio from './pantallas/Inicio';
import Panel from './pantallas/Panel';
import Memoria from './pantallas/Memoria';
import { Alta, Perfil } from './pantallas/Empresa';

function Cargando() {
    return <Papel><div className="ca-col"><Cabecera /><Esqueleto alto={180} /><Esqueleto alto={90} n={2} /></div></Papel>;
}

/** Navega en un efecto (nunca durante el render). */
function Redirigir({ to }) {
    useEffect(() => { navegar(to, { replace: true }); }, [to]);
    return <Cargando />;
}

function Tarjeta({ eyebrow, titulo, children }) {
    return (
        <Papel>
            <div className="ca-col">
                <Cabecera />
                <div className="ca-card ca-pad ca-in">
                    <div className="ca-filete" />
                    {eyebrow && <p className="ca-eyebrow">{eyebrow}</p>}
                    <h1 className="ca-display ca-h2" style={{ marginTop: 10 }}>{titulo}</h1>
                    {children}
                </div>
            </div>
        </Papel>
    );
}

/** Puerta: `sesion` (solo el alta) o `cuenta`. Con el servidor caído, se dice y se reintenta (regla 38). */
function Protegida({ acceso, children }) {
    const { session, cuenta, loading, errorMe, sinCuenta, refrescar, signOut, email } = useRiteAuth();
    const { completa } = useRuta();
    if (loading) return <Cargando />;
    if (!session) return <Redirigir to={`/?vuelta=${encodeURIComponent(completa)}`} />;
    if (errorMe && errorMe.status !== 403) {
        return (
            <Papel><div className="ca-col"><Cabecera />
                <ErrorRed titulo="No hemos podido cargar tu cuenta" error={errorMe.mensaje} onReintentar={refrescar} />
            </div></Papel>
        );
    }
    if (acceso === 'sesion') return cuenta ? <Redirigir to="/panel" /> : children;
    if (!cuenta) {
        if (sinCuenta) return <Redirigir to="/alta" />;
        return (
            <Tarjeta eyebrow="Acceso" titulo="Esta cuenta no tiene acceso">
                <p className="ca-txt">{errorMe?.mensaje || 'Tu usuario no tiene una cuenta activa en la app RITE.'}</p>
                {email && <p className="ca-peq" style={{ marginTop: 10 }}>Has entrado como <b>{email}</b>.</p>}
                <div className="ca-btns">
                    <button type="button" className="ca-btn ca-btn-sec" onClick={async () => { await signOut(); navegar('/'); }}>Salir y entrar con otra cuenta</button>
                </div>
            </Tarjeta>
        );
    }
    return children;
}

function resolver(path) {
    let p;
    if (path === '/') return { id: 'inicio' };
    if (path === '/alta') return { id: 'alta', acceso: 'sesion', titulo: 'Alta' };
    if (path === '/panel') return { id: 'panel', acceso: 'cuenta', titulo: 'Mis memorias' };
    if (path === '/perfil') return { id: 'perfil', acceso: 'cuenta', titulo: 'Mi empresa' };
    if ((p = casar('/memoria/:id', path))) return { id: 'memoria', acceso: 'cuenta', params: p, titulo: 'Memoria' };
    return { id: '404', titulo: 'No encontrada' };
}

function PortadaOPanel({ query }) {
    const { session, cuenta, loading, sinCuenta } = useRiteAuth();
    if (session && loading) return <Cargando />;
    if (session && cuenta) return <Redirigir to={query.get('vuelta') || '/panel'} />;
    if (sinCuenta) return <Redirigir to="/alta" />;
    return <Inicio query={query} />;
}

export default function App() {
    const { path, query } = useRuta();
    const ruta = resolver(path);
    useEffect(() => { document.title = tituloPestana(ruta.titulo); }, [ruta.titulo]);

    let pantalla;
    switch (ruta.id) {
        case 'inicio': pantalla = <PortadaOPanel query={query} />; break;
        case 'alta': pantalla = <Alta />; break;
        case 'panel': pantalla = <Panel />; break;
        case 'perfil': pantalla = <Perfil />; break;
        case 'memoria': pantalla = <Memoria key={ruta.params.id} id={ruta.params.id} pasoInicial={query.get('paso')} />; break;
        default:
            pantalla = (
                <Tarjeta eyebrow="Error 404" titulo="Esta página no existe">
                    <p className="ca-txt">Puede que el enlace esté mal copiado.</p>
                    <div className="ca-btns"><Enlace to="/" className="ca-btn ca-btn-pri">Ir al inicio</Enlace></div>
                </Tarjeta>
            );
    }
    return (
        <ToastProvider>
            <style>{CSS + CSS_RITE}</style>
            {ruta.acceso ? <Protegida acceso={ruta.acceso}>{pantalla}</Protegida> : pantalla}
        </ToastProvider>
    );
}
