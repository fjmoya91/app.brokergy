// ─── Marco.jsx — la cabecera y el pie de la app RITE ────────────────────────
// Sin menú lateral (la app tiene tres pantallas): logo + «RITE» a la izquierda y,
// con cuenta, las memorias que le quedan y su perfil a la derecha.
// ─────────────────────────────────────────────────────────────────────────────
import { Enlace, navegar } from '../../certificadores/router';
import { Papel } from '../../certificadores/ui/piezas';
import { IcoSalir, IcoUsuario } from '../../certificadores/ui/Iconos';
import { LOGO, NOMBRE_APP, WEB_BROKERGY } from '../marca';
import { useRiteAuth } from '../auth/RiteAuth';

export function EtiquetaRite({ soloPc = false }) {
    return <span className={`rt-marca-txt${soloPc ? ' rt-solo-ancho' : ''}`}><i>●</i>Memoria RITE</span>;
}

export function Cabecera({ derecha, enlace = '/', etiquetaSoloPc = false }) {
    return (
        <header className="ca-head">
            <Enlace to={enlace} className="ca-marca" aria-label={`${NOMBRE_APP}, inicio`}>
                <img className="ca-logo" src={LOGO} alt="BROKERGY" width="130" height="26" />
                <EtiquetaRite soloPc={etiquetaSoloPc} />
            </Enlace>
            {derecha}
        </header>
    );
}

export function Pie() {
    return (
        <footer className="ca-cierre">
            <a className="ca-powered" href={WEB_BROKERGY} target="_blank" rel="noopener noreferrer">
                Powered by <img src={LOGO} alt="BROKERGY" width="85" height="17" />
            </a>
            <p className="ca-pie">BROKERGY · Ingeniería energética</p>
        </footer>
    );
}

/** Las pantallas con cuenta: cabecera con el saldo y el perfil. */
export function Marco({ children, ancho = false }) {
    const { cuenta, signOut } = useRiteAuth();
    const creditos = Number(cuenta?.creditos) || 0;
    return (
        <Papel>
            <div className={ancho ? 'ca-col-ancha' : 'ca-col'} style={ancho ? { maxWidth: 760 } : undefined}>
                <Cabecera enlace="/panel" etiquetaSoloPc={!!cuenta} derecha={cuenta && (
                    <div className="rt-nav">
                        <Enlace to="/panel" className={`ca-creditos${creditos ? '' : ' ca-creditos-cero'}`} title="Memorias que te quedan">
                            <b>{creditos}</b> {creditos === 1 ? 'memoria' : 'memorias'}
                        </Enlace>
                        <Enlace to="/perfil" className="ca-icobtn" aria-label="Mi empresa"><IcoUsuario size={19} /></Enlace>
                        <button type="button" className="ca-icobtn ca-solo-pc" aria-label="Salir"
                            onClick={async () => { await signOut(); navegar('/', { replace: true }); }}><IcoSalir size={19} /></button>
                    </div>
                )} />
                {children}
                <Pie />
            </div>
        </Papel>
    );
}
