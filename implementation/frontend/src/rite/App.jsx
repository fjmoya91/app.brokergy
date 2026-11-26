// ─── App.jsx — las pantallas de la app RITE, por ruta (regla 245) ───────────
//   PÚBLICA   /            portada y alta (Google o enlace al email)
//             /entrar      entrar como en cee.brokergy.es: Google o email y contraseña
//                          (el equipo, con su usuario del CRM), o el enlace al email
//   SESIÓN    /alta        los datos de la empresa (la primera vez)
//   CUENTA    /panel · /memoria/:id · /perfil
//   ENLACE    /completar/:token   el instalador completa, sin cuenta, la memoria que le
//                                 ha preparado BROKERGY (y la envía)
//   EQUIPO    /admin · /admin/cuentas · /admin/memoria/:id   (sesión de BROKERGY)
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
import Entrar from './pantallas/Entrar';
import Panel from './pantallas/Panel';
import Memoria, { fuenteDe } from './pantallas/Memoria';
import { Alta, Perfil } from './pantallas/Empresa';
import { AdminInicio, AdminMemoria } from './pantallas/Admin';
import { MarcoEnlace } from './ui/Marco';

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

/** Puerta: `sesion` (solo el alta), `cuenta` o `equipo` (BROKERGY). Con el servidor caído, se dice y se reintenta (regla 38). */
function Protegida({ acceso, children }) {
    const { session, cuenta, equipo, loading, errorMe, sinCuenta, refrescar, signOut, email } = useRiteAuth();
    const { completa } = useRuta();
    if (loading) return <Cargando />;
    if (!session) return <Redirigir to={`/entrar?vuelta=${encodeURIComponent(completa)}`} />;
    if (errorMe && errorMe.status !== 403) {
        return (
            <Papel><div className="ca-col"><Cabecera />
                <ErrorRed titulo="No hemos podido cargar tu cuenta" error={errorMe.mensaje} onReintentar={refrescar} />
            </div></Papel>
        );
    }
    if (acceso === 'equipo') {
        if (equipo) return children;
        return (
            <Tarjeta eyebrow="Acceso" titulo="Solo para el equipo de BROKERGY">
                <p className="ca-txt">La administración de la app RITE es del equipo de BROKERGY.</p>
                {email && <p className="ca-peq" style={{ marginTop: 10 }}>Has entrado como <b>{email}</b>.</p>}
                <div className="ca-btns">
                    {cuenta && <Enlace to="/panel" className="ca-btn ca-btn-pri">Ir a mis memorias</Enlace>}
                    <button type="button" className="ca-btn ca-btn-sec" onClick={async () => { await signOut(); navegar('/entrar'); }}>Salir y entrar con otra cuenta</button>
                </div>
            </Tarjeta>
        );
    }
    if (equipo && !cuenta) return <Redirigir to="/admin" />;
    if (acceso === 'sesion') return cuenta ? <Redirigir to="/panel" /> : children;
    if (!cuenta) {
        if (sinCuenta) return <Redirigir to="/alta" />;
        return (
            <Tarjeta eyebrow="Acceso" titulo="Esta cuenta no tiene acceso">
                <p className="ca-txt">{errorMe?.mensaje || 'Tu usuario no tiene una cuenta activa en la app RITE.'}</p>
                {email && <p className="ca-peq" style={{ marginTop: 10 }}>Has entrado como <b>{email}</b>.</p>}
                <div className="ca-btns">
                    <button type="button" className="ca-btn ca-btn-sec" onClick={async () => { await signOut(); navegar('/entrar'); }}>Salir y entrar con otra cuenta</button>
                </div>
            </Tarjeta>
        );
    }
    return children;
}

function resolver(path) {
    let p;
    if (path === '/') return { id: 'inicio' };
    if (path === '/entrar') return { id: 'entrar', titulo: 'Entrar' };
    if (path === '/alta') return { id: 'alta', acceso: 'sesion', titulo: 'Alta' };
    if (path === '/panel') return { id: 'panel', acceso: 'cuenta', titulo: 'Mis memorias' };
    if (path === '/perfil') return { id: 'perfil', acceso: 'cuenta', titulo: 'Mi empresa' };
    if ((p = casar('/memoria/:id', path))) return { id: 'memoria', acceso: 'cuenta', params: p, titulo: 'Memoria' };
    if ((p = casar('/completar/:token', path))) return { id: 'completar', params: p, titulo: 'Completar la memoria' };
    if (path === '/admin' || path === '/admin/cuentas') return { id: 'admin', acceso: 'equipo', titulo: 'Administración' };
    if ((p = casar('/admin/memoria/:id', path))) return { id: 'admin-memoria', acceso: 'equipo', params: p, titulo: 'Memoria' };
    return { id: '404', titulo: 'No encontrada' };
}

function PortadaOPanel({ query }) {
    const { session, cuenta, equipo, loading, sinCuenta } = useRiteAuth();
    if (session && loading) return <Cargando />;
    if (session && cuenta) return <Redirigir to={query.get('vuelta') || '/panel'} />;
    if (session && equipo) return <Redirigir to={query.get('vuelta') || '/admin'} />;
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
        case 'entrar': pantalla = <Entrar query={query} />; break;
        case 'alta': pantalla = <Alta />; break;
        case 'panel': pantalla = <Panel />; break;
        case 'perfil': pantalla = <Perfil />; break;
        case 'memoria': pantalla = <Memoria key={ruta.params.id} fuente={fuenteDe('cuenta', ruta.params.id)} pasoInicial={query.get('paso')} />; break;
        case 'completar':
            pantalla = (
                <Memoria key={ruta.params.token} fuente={fuenteDe('enlace', ruta.params.token)} pasoInicial={query.get('paso')}
                    Envoltorio={MarcoEnlace} volver={null}
                    extra={({ info }) => info?.empresa ? <p className="ca-peq ca-in" style={{ margin: '-6px 2px 14px' }}>Para <b>{info.empresa}</b>. Tus datos de empresa los pone BROKERGY.</p> : null} />
            );
            break;
        case 'admin': pantalla = <AdminInicio pestana={path === '/admin/cuentas' ? 'cuentas' : 'memorias'} />; break;
        case 'admin-memoria': pantalla = <AdminMemoria key={ruta.params.id} id={ruta.params.id} pasoInicial={query.get('paso')} />; break;
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
