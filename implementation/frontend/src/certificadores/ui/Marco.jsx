// ─── Marco.jsx — la cáscara de las pantallas con sesión ─────────────────────
// Barra de arriba (logo, Mis obras · Incidencias · Perfil · Administración,
// créditos que quedan —llevan a «Mis gastos»—, menú) + los botones flotantes de
// incidencias y del asistente.
import { useState } from 'react';
import { Enlace, navegar } from '../router';
import { useCertappAuth } from '../auth/CertappAuth';
import { LOGO, NOMBRE_APP } from '../marca';
import { EtiquetaIa, Hoja, Papel } from './piezas';
import { IcoCasa, IcoChat, IcoChevron, IcoEscudo, IcoLista, IcoMas, IcoMenu, IcoSalir, IcoUsuario } from './Iconos';
import Flotantes from '../widgets/Flotantes';

export function Marco({ activo, obraId, children }) {
    const { cuenta, esAdmin, email, signOut } = useCertappAuth();
    const [menu, setMenu] = useState(false);
    const creditos = Number(cuenta?.creditos ?? 0);

    const ir = (to) => { setMenu(false); navegar(to); };

    return (
        <Papel halo={false}>
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
                <button type="button" className="ca-fila" onClick={async () => { setMenu(false); await signOut(); navegar('/'); }}>
                    <span className="ca-ico-tile ca-tile-crema"><IcoSalir /></span>
                    <span><b>Cerrar sesión</b><small>En este dispositivo</small></span>
                </button>
            </Hoja>

            {cuenta && <Flotantes obraId={obraId} />}
        </Papel>
    );
}

export default Marco;
