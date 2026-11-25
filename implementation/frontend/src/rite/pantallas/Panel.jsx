// ─── Panel.jsx — mis memorias RITE ──────────────────────────────────────────
// La lista de la cuenta (las que hace el instalador y las que le deja hechas
// BROKERGY, que no le gastan memorias) y «Nueva memoria».
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react';
import { API, axios, fecha, mensajeError, useCarga } from '../api';
import { Enlace, navegar } from '../../certificadores/router';
import { Aviso, ErrorRed, Esqueleto } from '../../certificadores/ui/piezas';
import { IcoChevron, IcoDoc, IcoMas, Spinner } from '../../certificadores/ui/Iconos';
import { useRiteAuth } from '../auth/RiteAuth';
import { Marco } from '../ui/Marco';

export const ESTADOS = {
    BORRADOR: { txt: 'Borrador', chip: 'ca-chip-gris' },
    GENERADA: { txt: 'Lista para firmar', chip: 'ca-chip-verde' },
    FIRMADA: { txt: 'Firmada', chip: 'ca-chip-verde' },
    PRESENTADA: { txt: 'Presentada', chip: 'ca-chip-tinta' },
    ANULADA: { txt: 'Anulada', chip: 'ca-chip-gris' },
};

export default function Panel() {
    const { cuenta } = useRiteAuth();
    const { datos, error, cargando, recargar } = useCarga(() => axios.get(`${API}/memorias`).then(r => r.data?.memorias || []));
    const [creando, setCreando] = useState(false);
    const [errorNueva, setErrorNueva] = useState(null);
    const creditos = Number(cuenta?.creditos) || 0;

    const nueva = async () => {
        setCreando(true); setErrorNueva(null);
        try {
            const { data } = await axios.post(`${API}/memorias`, { datos: {} });
            navegar(`/memoria/${data.memoria.id}`);
        } catch (err) {
            setErrorNueva(mensajeError(err, 'No hemos podido empezar la memoria.'));
            setCreando(false);
        }
    };

    return (
        <Marco>
            <div className="ca-in">
                <p className="ca-eyebrow">{cuenta?.empresa || 'Tu empresa'}</p>
                <h1 className="ca-display ca-h2" style={{ margin: '8px 2px 0' }}>Tus memorias RITE</h1>
            </div>
            <div className="ca-btns ca-in ca-in-2">
                <button type="button" className="ca-btn ca-btn-pri" onClick={nueva} disabled={creando}>
                    {creando ? <Spinner /> : <IcoMas size={19} sw={2.4} />} Nueva memoria
                </button>
            </div>
            {!creditos && (
                <div style={{ marginTop: 12 }}>
                    <Aviso titulo="No te quedan memorias">
                        Puedes prepararla igual; para generarla escríbenos y te cargamos más. Volver a generar una que ya hiciste no gasta.
                    </Aviso>
                </div>
            )}
            {errorNueva && <div style={{ marginTop: 12 }}><Aviso titulo="No ha podido ser">{errorNueva}</Aviso></div>}

            <p className="ca-sec">Memorias</p>
            {cargando && !datos && <Esqueleto alto={68} n={3} />}
            {error && !datos && <ErrorRed error={error} onReintentar={recargar} />}
            {datos && !datos.length && (
                <div className="ca-card ca-pad ca-vacio">
                    <span className="ca-ico-tile ca-tile-crema"><IcoDoc /></span>
                    <h2 className="ca-display ca-h3" style={{ marginTop: 12 }}>Aún no hay ninguna</h2>
                    <p className="ca-txt">Empieza con la referencia catastral de la vivienda: lo demás te lo vamos pidiendo.</p>
                </div>
            )}
            {datos?.length > 0 && (
                <div className="ca-stack" style={{ marginTop: 0 }}>
                    {datos.map(m => {
                        const e = ESTADOS[m.estado] || ESTADOS.BORRADOR;
                        return (
                            <Enlace key={m.id} to={`/memoria/${m.id}`} className="ca-fila">
                                <span className="ca-ico-tile ca-tile-crema"><IcoDoc size={19} /></span>
                                <span>
                                    <b>{m.nombre || 'Memoria sin titular'}</b>
                                    <small>{m.numero} · {m.municipio || 'Sin vivienda'} · {fecha(m.updated_at || m.created_at)}</small>
                                </span>
                                <div className={`ca-chip ${e.chip}`} style={{ flex: 'none' }}>{e.txt}</div>
                                <IcoChevron size={18} />
                            </Enlace>
                        );
                    })}
                </div>
            )}
        </Marco>
    );
}
