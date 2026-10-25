// ─── LeerLegal — las condiciones o la privacidad en una ventana ─────────────
// Lo pidió Fran (25/10/2026): leerlas sin salir de la pantalla (antes se abría
// otra pestaña y el formulario de la beta se quedaba atrás). Ventana con scroll
// y «Aceptar» abajo, que vuelve a la misma pantalla. Dentro, el enlace de la una
// a la otra cambia de texto sin cerrar.
//   <LeerLegal que="condiciones" | "privacidad" | null onCerrar onAceptar? />
// Con `onAceptar`, el botón es «Aceptar» (y quien lo usa marca su casilla); sin
// él, «Cerrar» (el perfil, que ya las aceptó).
import { useEffect, useState } from 'react';
import { Hoja } from '../ui/piezas';
import { IcoCheck } from '../ui/Iconos';
import { CONDICIONES_FECHA, TextoCondiciones } from './Condiciones';
import { TextoPrivacidad } from './Privacidad';

export function LeerLegal({ que, onCerrar, onAceptar }) {
    const [actual, setActual] = useState(que);
    useEffect(() => { setActual(que); }, [que]);
    const esCond = actual === 'condiciones';
    const pie = (
        <div className="ca-btns" style={{ marginTop: 0 }}>
            {onAceptar
                ? <button type="button" className="ca-btn ca-btn-pri" onClick={() => { onAceptar(); onCerrar(); }}><IcoCheck /> Aceptar</button>
                : <button type="button" className="ca-btn ca-btn-sec" onClick={onCerrar}>Cerrar</button>}
        </div>
    );
    return (
        <Hoja abierta={!!que} onCerrar={onCerrar} pie={pie} ancho={640}
            titulo={esCond ? 'Condiciones de uso' : 'Privacidad'}>
            {esCond && <p className="ca-eyebrow" style={{ margin: 0 }}>Beta · versión del {CONDICIONES_FECHA}</p>}
            {esCond
                ? <TextoCondiciones onPrivacidad={() => setActual('privacidad')} />
                : <TextoPrivacidad onCondiciones={() => setActual('condiciones')} />}
        </Hoja>
    );
}

export default LeerLegal;
