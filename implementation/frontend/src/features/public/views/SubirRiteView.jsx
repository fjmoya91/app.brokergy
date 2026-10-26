import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { SubirRiteCard } from '../components/SubirRiteCard';
import { MarcoInstalador, CargandoInstalador, EnlaceNoValido, DatosObra, CheckDibujado } from '../components/MarcoInstalador';

const isProd = import.meta.env.PROD;
const API_URL = isProd ? '/api/public' : 'http://localhost:3000/api/public';

// Página de SOLO el RITE. Sigue viva porque su enlace ya viaja en mensajes
// enviados; la superficie de subida es la MISMA que usa /instalador/:id — ver
// SubirRiteCard.
//
// Estilo «carta de pago» (regla 164), con el marco de MarcoInstalador.
// Demo sin API: /subir-rite/demo (con `?sin-memoria` o `?subido`).
const DEMO_ID = 'demo';
function infoDemo() {
    const q = new URLSearchParams(window.location.search);
    return {
        numero_expediente: '26RES060_241', cliente: 'MARÍA GARCÍA LÓPEZ', instalador: 'INSTALACIONES EJEMPLO SL',
        pide_memoria: !q.has('sin-memoria'), certificado_subido: q.has('subido'), memoria_subida: false,
    };
}

export function SubirRiteView({ expedienteId }) {
    const esDemo = expedienteId === DEMO_ID;
    const [info, setInfo] = useState(() => (esDemo ? infoDemo() : null));
    const [loadError, setLoadError] = useState(null);
    const [done, setDone] = useState(false);

    const loadInfo = () => {
        if (esDemo) return;
        axios.get(`${API_URL}/rite-upload/${expedienteId}`)
            .then(r => setInfo(r.data))
            .catch(() => setLoadError('No se ha encontrado el expediente o el enlace no es válido.'));
    };

    useEffect(() => {
        if (esDemo) return;
        axios.get(`${API_URL}/rite-upload/${expedienteId}`)
            .then(r => setInfo(r.data))
            .catch(() => setLoadError('No se ha encontrado el expediente o el enlace no es válido.'));
    }, [expedienteId, esDemo]);

    if (!info && !loadError) return <CargandoInstalador />;
    if (loadError) return <EnlaceNoValido texto={loadError} />;

    return (
        <MarcoInstalador numero={info.numero_expediente} demo={esDemo}>
            {done ? (
                <>
                    <div className="in-in" style={{ marginTop: 6 }}><CheckDibujado /></div>
                    <h1 className="in-display in-h1 in-in">RITE <span className="in-mark">recibido</span></h1>
                    <p className="in-sub in-in in-in-2">
                        Gracias. Seguimos nosotros con la tramitación del expediente <b>{info.numero_expediente}</b>.
                    </p>
                    <div className="in-btns in-in in-in-2" style={{ marginTop: 22 }}>
                        <button className="in-btn in-btn-sec" onClick={() => { setDone(false); loadInfo(); }}>Subir o reemplazar otro documento</button>
                    </div>
                </>
            ) : (
                <>
                    <p className="in-eyebrow in-in" style={{ margin: '18px 2px 0' }}>Para el instalador</p>
                    <h1 className="in-display in-h1 in-in">Envíanos el <span className="in-mark">RITE</span></h1>
                    {/* El subtítulo dice lo MISMO que las casillas de abajo: sin memoria
                        generada solo se pide el certificado, y anunciar aquí un documento
                        que luego no aparece hace buscarlo. */}
                    <p className="in-sub in-in in-in-2">
                        {info.pide_memoria ? 'La memoria técnica firmada y el certificado RITE tramitado de esta obra.' : 'El certificado RITE tramitado de esta obra.'}
                    </p>
                </>
            )}
            <div className="in-stack in-in in-in-2">
                {!done && (
                    <div className="in-card">
                        <div className="in-filete-fino" />
                        {/* `pideMemoria` viene del backend (mismo dato que
                            /instalador/:id): sin él, esta página ofrecía SIEMPRE la
                            casilla de la memoria firmada aunque nunca hubiéramos
                            generado ninguna, y el instalador acababa dejando ahí el
                            certificado — que es el campo de la memoria. */}
                        <SubirRiteCard expedienteId={expedienteId} demo={esDemo} info={info} pideMemoria={!!info.pide_memoria} onDone={() => { setDone(true); loadInfo(); }} />
                    </div>
                )}
                <DatosObra filas={[['Cliente', info.cliente], ['Instalador', info.instalador]]} />
            </div>
        </MarcoInstalador>
    );
}
