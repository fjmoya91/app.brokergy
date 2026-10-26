// ─── App.jsx — las pantallas de la app de certificadores, por ruta ──────────
// Enrutado a mano por pathname (como el CRM). Tres vistas:
//   PÚBLICA      /, /beta, /entrar, /activar, /recuperar, /privacidad, /condiciones
//   CLIENTE      /subir/:id?token=  (el propietario sube fotos sin cuenta)
//   CERTIFICADOR /panel, /obra/nueva, /obra/:id, /obra/:id/envolvente, /perfil
//   ADMIN        /admin, /admin/{beta|cuentas|obras|sugerencias}, /admin/obras/:id
// ─────────────────────────────────────────────────────────────────────────────
import { Suspense, useEffect } from 'react';
import { lazyWithReload } from '../utils/lazyWithReload';
import { casar, DEL_CRM, navegar, useRuta } from './router';
import { useCertappAuth } from './auth/CertappAuth';
import { CSS } from './ui/estilo';
import { CabeceraPublica, CargandoPantalla, Esqueleto, ErrorRed, Papel, ToastProvider } from './ui/piezas';
import { Marco } from './ui/Marco';
import { tituloPestana } from './marca';
import { demoActiva } from './dev/flag';
import { Enlace } from './router';

import Landing from './publico/Landing';
import Beta from './publico/Beta';
import Entrar from './publico/Entrar';
import Activar from './publico/Activar';
import Recuperar from './publico/Recuperar';
import Privacidad from './publico/Privacidad';
import Condiciones from './publico/Condiciones';
import SubirCliente from './publico/SubirCliente';
import Panel from './panel/Panel';
import NuevaObra from './obra/NuevaObra';
import Ficha from './obra/Ficha';
import Perfil from './perfil/Perfil';
import MisIncidencias from './incidencias/MisIncidencias';
import MisGastos from './gastos/MisGastos';

// Lo pesado o lo que es de otros, en diferido.
// REGLA — lo diferido, SIEMPRE con lazyWithReload, nunca con `lazy` a secas: una pestaña abierta antes
// de un deploy pide trozos que ya no existen (404, «Failed to fetch dynamically imported module») y
// la pantalla se quedaba en «Algo ha fallado». Así se recarga sola una vez (Fran, 25/10/2026,
// «Abrir envolvente» desde el admin tras dos deploys de otras sesiones).
const EnvolventeCertapp = lazyWithReload(() => import('./envolvente/EnvolventeCertapp.jsx'), { name: 'certapp:envolvente' });
const Admin = lazyWithReload(() => import('./admin/Admin.jsx'), { name: 'certapp:admin' });

/** Navega en un efecto (nunca durante el render). */
function Redirigir({ to }) {
    useEffect(() => { navegar(to, { replace: true }); }, [to]);
    return <CargandoPantalla />;
}

function SinAcceso({ titulo, texto, accion }) {
    const { signOut, email } = useCertappAuth();
    return (
        <Papel>
            <div className="ca-col">
                <CabeceraPublica />
                <div className="ca-card ca-pad ca-in">
                    <div className="ca-filete" />
                    <p className="ca-eyebrow">Acceso</p>
                    <h1 className="ca-display ca-h2" style={{ marginTop: 10 }}>{titulo}</h1>
                    <p className="ca-txt">{texto}</p>
                    {email && <p className="ca-peq" style={{ marginTop: 10 }}>Has entrado como <b>{email}</b>.</p>}
                    <div className="ca-btns">
                        {accion}
                        <button type="button" className="ca-btn ca-btn-sec" onClick={async () => { await signOut(); navegar('/'); }}>
                            Salir y entrar con otra cuenta
                        </button>
                    </div>
                </div>
            </div>
        </Papel>
    );
}

/** Puerta de las pantallas con sesión. `acceso`: cuenta · admin · sesion. */
function Protegida({ acceso, children }) {
    const { session, cuenta, esAdmin, loading, errorMe, refrescar, signOut } = useCertappAuth();
    const { completa } = useRuta();
    if (loading) return <CargandoPantalla />;
    if (!session) return <Redirigir to={`/entrar?vuelta=${encodeURIComponent(completa)}`} />;
    if (errorMe && errorMe.status !== 403) {
        return (
            <Papel>
                <div className="ca-col">
                    <CabeceraPublica />
                    <ErrorRed titulo="No hemos podido cargar tu cuenta" error={errorMe.mensaje} onReintentar={refrescar} />
                    <div className="ca-btns">
                        <button type="button" className="ca-link ca-link-gris" onClick={async () => { await signOut(); navegar('/'); }}>Cerrar sesión</button>
                    </div>
                </div>
            </Papel>
        );
    }
    if (acceso === 'cuenta' && !cuenta) {
        if (esAdmin) {
            return (
                <SinAcceso titulo="Este usuario es de administración"
                    texto="Has entrado con un usuario de BROKERGY. Las obras de cada certificador se ven desde el panel de administración."
                    accion={<button type="button" className="ca-btn ca-btn-pri" onClick={() => navegar('/admin')}>Ir a la administración</button>} />
            );
        }
        if (errorMe?.code === 'CERTAPP_SIN_CUENTA') {
            // Sesión de Google sin alta todavía: le falta el formulario (dos minutos).
            return (
                <SinAcceso titulo="Aún no tienes cuenta"
                    texto="Contesta unas preguntas sobre cómo trabajas (dos minutos) y entras al momento, con tu primer certificado gratis."
                    accion={<button type="button" className="ca-btn ca-btn-pri" onClick={() => navegar('/beta?con=google')}>Crear mi cuenta</button>} />
            );
        }
        return (
            <SinAcceso titulo="Esta cuenta no tiene acceso"
                texto={errorMe?.mensaje || 'Tu usuario no tiene una cuenta de certificador activa.'}
                accion={<button type="button" className="ca-btn ca-btn-pri" onClick={() => navegar('/beta')}>Crear mi cuenta</button>} />
        );
    }
    if (acceso === 'admin' && !esAdmin) {
        return (
            <SinAcceso titulo="Solo para administración"
                texto="Esta parte es del equipo de BROKERGY."
                accion={cuenta ? <button type="button" className="ca-btn ca-btn-pri" onClick={() => navegar('/panel')}>Ir a mis obras</button> : null} />
        );
    }
    if (acceso === 'sesion' && !cuenta && !esAdmin) {
        return <SinAcceso titulo="Esta cuenta no tiene acceso" texto={errorMe?.mensaje || 'Tu usuario no tiene una cuenta de certificador activa.'} />;
    }
    return children;
}

function NoEncontrada() {
    return (
        <Papel>
            <div className="ca-col">
                <CabeceraPublica />
                <div className="ca-card ca-pad ca-in">
                    <div className="ca-filete" />
                    <p className="ca-eyebrow">Error 404</p>
                    <h1 className="ca-display ca-h2" style={{ marginTop: 10 }}>Esta página no existe</h1>
                    <p className="ca-txt">Puede que el enlace esté mal copiado o que la página se haya movido.</p>
                    <div className="ca-btns"><Enlace to="/" className="ca-btn ca-btn-pri">Ir al inicio</Enlace></div>
                </div>
            </div>
        </Papel>
    );
}

/**
 * Una página del CRM (p. ej. /croquis-movil/:token) a la que se ha llegado sin
 * recargar: se recarga UNA vez para que el servidor dé el HTML del CRM. Si aun
 * así vuelve aquí (servidor mal configurado), no se entra en bucle: se enseña
 * el enlace.
 */
function PaginaDelCrm() {
    useEffect(() => {
        const clave = `certapp_crm_${window.location.pathname}`;
        let ya = false;
        try { ya = sessionStorage.getItem(clave) === '1'; sessionStorage.setItem(clave, '1'); } catch { /* sin storage */ }
        if (!ya) window.location.replace(window.location.href);
    }, []);
    return (
        <Papel>
            <div className="ca-col">
                <CabeceraPublica />
                <div className="ca-card ca-pad ca-in">
                    <div className="ca-filete" />
                    <h1 className="ca-display ca-h2">Abriendo…</h1>
                    <p className="ca-txt">Si no se abre sola, <a href={window.location.href}>pulsa aquí</a>.</p>
                </div>
            </div>
        </Papel>
    );
}

function resolver(path) {
    let p;
    if (path === '/') return { id: 'inicio' };
    if (path === '/beta') return { id: 'beta', titulo: 'Beta para certificadores' };
    if (path === '/entrar') return { id: 'entrar', titulo: 'Entrar' };
    if (path === '/activar') return { id: 'activar', titulo: 'Activa tu cuenta' };
    if (path === '/recuperar') return { id: 'recuperar', titulo: 'Recuperar la contraseña' };
    if (path === '/privacidad') return { id: 'privacidad', titulo: 'Privacidad' };
    if (path === '/condiciones') return { id: 'condiciones', titulo: 'Condiciones de uso' };
    if ((p = casar('/subir/:id', path))) return { id: 'subir', params: p, titulo: 'Subir fotos' };
    if (path === '/panel') return { id: 'panel', acceso: 'cuenta', titulo: 'Mis obras' };
    if (path === '/obra/nueva') return { id: 'nueva', acceso: 'cuenta', titulo: 'Nueva obra' };
    if ((p = casar('/obra/:id/envolvente', path))) return { id: 'envolvente', acceso: 'sesion', params: p, titulo: 'Envolvente' };
    if ((p = casar('/obra/:id', path))) return { id: 'obra', acceso: 'cuenta', params: p, titulo: 'Obra' };
    if (path === '/perfil') return { id: 'perfil', acceso: 'cuenta', titulo: 'Mi perfil' };
    if (path === '/incidencias') return { id: 'incidencias', acceso: 'cuenta', titulo: 'Mis incidencias' };
    if (path === '/gastos') return { id: 'gastos', acceso: 'cuenta', titulo: 'Mis gastos' };
    // /admin, /admin/beta, /admin/cuentas, /admin/obras, /admin/obras/:id, /admin/sugerencias
    // (las da por hechas el backend en sus avisos); las pestañas las resuelve Admin.
    if (path === '/admin' || path.startsWith('/admin/')) return { id: 'admin', acceso: 'admin', titulo: 'Administración' };
    // Una página del CRM que llegó aquí (p. ej. por el historial): que la sirva el CRM.
    if (DEL_CRM.test(path)) return { id: 'crm', titulo: '' };
    return { id: '404', titulo: 'No encontrada' };
}

function Inicio() {
    const { session, cuenta, esAdmin, loading } = useCertappAuth();
    if (session && loading) return <CargandoPantalla />;
    if (session && cuenta) return <Redirigir to="/panel" />;
    if (session && esAdmin) return <Redirigir to="/admin" />;
    return <Landing />;
}

export default function App() {
    const { path, query } = useRuta();
    const ruta = resolver(path);
    const demo = demoActiva();

    useEffect(() => { document.title = tituloPestana(ruta.titulo); }, [ruta.titulo]);

    let pantalla;
    switch (ruta.id) {
        case 'inicio': pantalla = <Inicio />; break;
        case 'beta': pantalla = <Beta query={query} />; break;
        case 'entrar': pantalla = <Entrar query={query} />; break;
        case 'activar': pantalla = <Activar query={query} />; break;
        case 'recuperar': pantalla = <Recuperar />; break;
        case 'privacidad': pantalla = <Privacidad />; break;
        case 'condiciones': pantalla = <Condiciones />; break;
        case 'subir': pantalla = <SubirCliente id={ruta.params.id} token={query.get('token') || ''} />; break;
        case 'panel': pantalla = <Marco activo="panel"><Panel /></Marco>; break;
        case 'nueva': pantalla = <Marco activo="panel"><NuevaObra /></Marco>; break;
        case 'obra': pantalla = <Marco activo="panel" obraId={ruta.params.id}><Ficha key={ruta.params.id} id={ruta.params.id} /></Marco>; break;
        case 'perfil': pantalla = <Marco activo="perfil"><Perfil /></Marco>; break;
        case 'incidencias': pantalla = <Marco activo="incidencias"><MisIncidencias /></Marco>; break;
        case 'gastos': pantalla = <Marco activo="gastos"><MisGastos /></Marco>; break;
        case 'admin':
            pantalla = (
                <Marco activo="admin" ancho>
                    <Suspense fallback={<div className="ca-col-ancha"><Esqueleto alto={140} n={3} /></div>}><Admin /></Suspense>
                </Marco>
            );
            break;
        case 'envolvente':
            // La envolvente es del CRM (otro agente): ocupa la pantalla entera y lee
            // `?origen=ext` del location al cargar su módulo.
            pantalla = (
                <Suspense fallback={<CargandoPantalla />}>
                    <EnvolventeCertapp obraId={ruta.params.id} id={ruta.params.id} />
                </Suspense>
            );
            break;
        case 'crm': pantalla = <PaginaDelCrm />; break;
        default: pantalla = <NoEncontrada />;
    }

    return (
        <ToastProvider>
            <style>{CSS}</style>
            {demo && <div className="ca-demo" aria-hidden="true">Demo · datos simulados</div>}
            {ruta.acceso ? <Protegida acceso={ruta.acceso}>{pantalla}</Protegida> : pantalla}
        </ToastProvider>
    );
}
