// ─── Marco.jsx — la cáscara de las pantallas con sesión ─────────────────────
// EN EL PC (desde 1024 px), MENÚ LATERAL fijo (Fran, 26/10/2026: «no me gusta
// trabajar con tanto scroll, quiero una vista más de aplicación, con una ventana
// lateral tipo menú»; elegida la alternativa A del diseño): Nueva obra · Mis
// obras · Incidencias · Mis gastos · Mi perfil · Administración, los créditos y
// cerrar sesión. Con una obra abierta, debajo de «Mis obras» salen SUS PARTES
// (las de la obra entregada o las fases del borrador): la pantalla las cuenta con
// `useMenuObra` (ui/menuObra.js) y cada una se abre en su sitio, sin bajar.
// EN EL MÓVIL Y LA TABLETA, la barra de arriba de siempre (logo, créditos, menú en
// una hoja); las partes de la obra van en la barra de abajo de cada pantalla.
// Más los botones flotantes de incidencias y del asistente.
import { useState } from 'react';
import { Enlace, navegar } from '../router';
import { useCertappAuth } from '../auth/CertappAuth';
import { LOGO, NOMBRE_APP } from '../marca';
import { EtiquetaIa, Hoja, Papel } from './piezas';
import { IcoCasa, IcoChat, IcoCheck, IcoChevron, IcoEscudo, IcoLista, IcoMas, IcoMenu, IcoSalir, IcoUsuario } from './Iconos';
import { MenuObraCtx } from './menuObra';
import Flotantes from '../widgets/Flotantes';

function MenuObra({ nav }) {
    return (
        <div className="ca-menu-obra">
            <p className="ca-menu-obra-tit">{nav.numero && <span>{nav.numero}</span>}{nav.titulo}</p>
            {nav.items.map(it => (
                <Enlace key={it.id} to={it.to} className={`ca-menu-sub${it.act ? ' ca-menu-sub-act' : ''}`} aria-current={it.act ? 'page' : undefined}>
                    {it.num != null && (
                        <span className={`ca-menu-n${it.hecho ? ' ca-menu-n-ok' : ''}${it.act && !it.hecho ? ' ca-menu-n-act' : ''}`} aria-hidden="true">
                            {it.hecho ? <IcoCheck size={12} sw={3} /> : it.num}
                        </span>
                    )}
                    <span className="ca-menu-sub-txt">{it.label}</span>
                    {it.n != null && <small>{it.n}</small>}
                </Enlace>
            ))}
        </div>
    );
}

function MenuLateral({ activo, obraNav, onSalir }) {
    const { cuenta, esAdmin, email } = useCertappAuth();
    const creditos = Number(cuenta?.creditos ?? 0);
    const it = (id) => `ca-menu-it${activo === id ? ' ca-menu-act' : ''}`;
    return (
        <aside className="ca-menu-lat" aria-label="Menú">
            <Enlace to={cuenta ? '/panel' : '/admin'} className="ca-marca ca-menu-marca" aria-label={`${NOMBRE_APP}, inicio`}>
                <img className="ca-logo" src={LOGO} alt="BROKERGY" width="130" height="26" />
            </Enlace>
            <EtiquetaIa />
            {cuenta && <Enlace to="/obra/nueva" className="ca-btn ca-btn-pri ca-menu-nueva"><IcoMas /> Nueva obra</Enlace>}
            <nav className="ca-menu-nav" aria-label="Principal">
                {cuenta && <Enlace to="/panel" className={it('panel')}><IcoCasa size={18} /> Mis obras</Enlace>}
                {cuenta && obraNav && <MenuObra nav={obraNav} />}
                {cuenta && <Enlace to="/incidencias" className={it('incidencias')}><IcoChat size={18} /> Incidencias</Enlace>}
                {cuenta && <Enlace to="/gastos" className={it('gastos')}><IcoLista size={18} /> Mis gastos</Enlace>}
                {cuenta && <Enlace to="/perfil" className={it('perfil')}><IcoUsuario size={18} /> Mi perfil</Enlace>}
                {esAdmin && <Enlace to="/admin" className={it('admin')}><IcoEscudo size={18} /> Administración</Enlace>}
            </nav>
            <div className="ca-menu-pie">
                {cuenta && (
                    <Enlace to="/gastos" className={`ca-menu-creditos${creditos > 0 ? '' : ' ca-menu-creditos-cero'}`} title="Certificados que te quedan · Mis gastos">
                        <b>{creditos}</b><span>{creditos === 1 ? 'certificado' : 'certificados'}<br />disponibles</span>
                    </Enlace>
                )}
                {email && <p className="ca-menu-yo" title={email}>{email}</p>}
                <button type="button" className="ca-menu-it" onClick={onSalir}><IcoSalir size={18} /> Cerrar sesión</button>
            </div>
        </aside>
    );
}

export function Marco({ activo, obraId, children }) {
    const { cuenta, esAdmin, email, signOut } = useCertappAuth();
    const [menu, setMenu] = useState(false);
    const [obraNav, setObraNav] = useState(null);
    const creditos = Number(cuenta?.creditos ?? 0);

    const ir = (to) => { setMenu(false); navegar(to); };
    const salir = async () => { setMenu(false); await signOut(); navegar('/'); };

    return (
        <Papel halo={false}>
            <MenuObraCtx.Provider value={setObraNav}>
                <div className="ca-shell">
                    <MenuLateral activo={activo} obraNav={obraNav} onSalir={salir} />
                    <div className="ca-shell-cuerpo">
                        <header className="ca-bar">
                            <div className="ca-bar-in">
                                <Enlace to={cuenta ? '/panel' : '/admin'} className="ca-marca" aria-label={`${NOMBRE_APP}, inicio`}>
                                    <img className="ca-logo" src={LOGO} alt="BROKERGY" width="130" height="26" />
                                    <EtiquetaIa />
                                </Enlace>
                                <nav className="ca-nav" aria-label="Principal">
                                    {cuenta && <Enlace to="/panel" className={activo === 'panel' ? 'ca-nav-act' : ''}>Mis obras</Enlace>}
                                    {cuenta && <Enlace to="/incidencias" className={activo === 'incidencias' ? 'ca-nav-act' : ''}>Incidencias</Enlace>}
                                    {cuenta && <Enlace to="/perfil" className={activo === 'perfil' ? 'ca-nav-act' : ''}>Mi perfil</Enlace>}
                                    {esAdmin && <Enlace to="/admin" className={activo === 'admin' ? 'ca-nav-act' : ''}>Administración</Enlace>}
                                </nav>
                                <span className="ca-bar-esp" />
                                {cuenta && (
                                    <Enlace to="/gastos" className={`ca-creditos${creditos > 0 ? '' : ' ca-creditos-cero'}`}
                                        title="Certificados que te quedan · Mis gastos">
                                        <b>{creditos}</b> {creditos === 1 ? 'crédito' : 'créditos'}
                                    </Enlace>
                                )}
                                <button type="button" className="ca-icobtn" onClick={() => setMenu(true)} aria-label="Abrir el menú"><IcoMenu /></button>
                            </div>
                        </header>

                        {/* Con los botones flotantes, sitio debajo para que el final de la página no quede tapado. */}
                        <div className={cuenta ? 'ca-con-fabs' : undefined}>{children}</div>
                    </div>
                </div>
            </MenuObraCtx.Provider>

            <Hoja abierta={menu} titulo="Menú" onCerrar={() => setMenu(false)}>
                {email && <p className="ca-peq" style={{ margin: '0 4px' }}>Has entrado como <b>{email}</b></p>}
                {cuenta && (
                    <>
                        <button type="button" className="ca-fila" onClick={() => ir('/panel')}>
                            <span className="ca-ico-tile ca-tile-crema"><IcoCasa /></span>
                            <span><b>Mis obras</b><small>Tus certificados y en qué punto están</small></span>
                            <IcoChevron />
                        </button>
                        <button type="button" className="ca-fila" onClick={() => ir('/obra/nueva')}>
                            <span className="ca-ico-tile ca-tile-naranja"><IcoMas /></span>
                            <span><b>Nueva obra</b><small>Desde la referencia catastral</small></span>
                            <IcoChevron />
                        </button>
                        <button type="button" className="ca-fila" onClick={() => ir('/gastos')}>
                            <span className="ca-ico-tile ca-tile-crema"><IcoLista /></span>
                            <span><b>Mis gastos</b><small>Tus certificados: cuántos te quedan y en qué obras los has usado</small></span>
                            <IcoChevron />
                        </button>
                        <button type="button" className="ca-fila" onClick={() => ir('/incidencias')}>
                            <span className="ca-ico-tile ca-tile-crema"><IcoChat /></span>
                            <span><b>Mis incidencias</b><small>Lo que nos has contado y lo que te hemos respondido</small></span>
                            <IcoChevron />
                        </button>
                        <button type="button" className="ca-fila" onClick={() => ir('/perfil')}>
                            <span className="ca-ico-tile ca-tile-crema"><IcoUsuario /></span>
                            <span><b>Mi perfil</b><small>Tus datos de técnico, que salen en el .cex</small></span>
                            <IcoChevron />
                        </button>
                    </>
                )}
                {esAdmin && (
                    <button type="button" className="ca-fila" onClick={() => ir('/admin')}>
                        <span className="ca-ico-tile ca-tile-tinta"><IcoEscudo /></span>
                        <span><b>Administración</b><small>Lista de espera, cuentas, obras e incidencias</small></span>
                        <IcoChevron />
                    </button>
                )}
                <button type="button" className="ca-fila" onClick={salir}>
                    <span className="ca-ico-tile ca-tile-crema"><IcoSalir /></span>
                    <span><b>Cerrar sesión</b><small>En este dispositivo</small></span>
                </button>
            </Hoja>

            {cuenta && <Flotantes obraId={obraId} />}
        </Papel>
    );
}

export default Marco;
