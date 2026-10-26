import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FirmarCifoCard } from '../components/FirmarCifoCard';
import { MarcoInstalador, CargandoInstalador, EnlaceNoValido, DatosObra, CheckDibujado } from '../components/MarcoInstalador';

const isProd = import.meta.env.PROD;
const API_URL = isProd ? '/api/public' : 'http://localhost:3000/api/public';

// Página de SOLO el CIFO. Sigue viva porque su enlace ya viaja en mensajes
// enviados (y en los recordatorios del parte diario); la superficie donde se
// firma es la MISMA que usa /instalador/:id — ver FirmarCifoCard.
//
// Estilo «carta de pago» (regla 164), con el marco de MarcoInstalador.
// Demo sin API: /subir-cifo/demo (con `?refirma` o `?bloqueado`).
const DEMO_ID = 'demo';
function infoDemo() {
    const q = new URLSearchParams(window.location.search);
    return {
        numero_expediente: '26RES060_241', cliente: 'MARÍA GARCÍA LÓPEZ', instalador: 'INSTALACIONES EJEMPLO SL',
        refirma: q.has('refirma'), bloqueado: q.has('bloqueado'),
        rechazo: q.has('bloqueado') ? { motivo: 'la fecha de fin de obra no coincide con la factura' } : null,
    };
}

export function SubirCifoView({ expedienteId }) {
    const esDemo = expedienteId === DEMO_ID;
    const [info, setInfo] = useState(() => (esDemo ? infoDemo() : null));
    const [loadError, setLoadError] = useState(null);
    const [done, setDone] = useState(false);

    useEffect(() => {
        if (esDemo) return;
        axios.get(`${API_URL}/cifo-upload/${expedienteId}`)
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
                    <h1 className="in-display in-h1 in-in">CIFO <span className="in-mark">recibido</span></h1>
                    <p className="in-sub in-in in-in-2">
                        El <b>Certificado CIFO firmado</b> del expediente <b>{info.numero_expediente}</b> ya está con nosotros.
                        Seguimos con la tramitación; puedes cerrar esta página.
                    </p>
                </>
            ) : (
                <>
                    <p className="in-eyebrow in-in" style={{ margin: '18px 2px 0' }}>Para el instalador</p>
                    <h1 className="in-display in-h1 in-in">
                        {info.refirma ? 'Firma de nuevo' : 'Firma el'} <span className="in-mark">CIFO</span>
                    </h1>
                    <p className="in-sub in-in in-in-2">
                        El Certificado de Instalación y Fin de Obra de esta obra. Se firma aquí mismo con tu certificado electrónico.
                    </p>
                </>
            )}
            <div className="in-stack in-in in-in-2">
                {!done && (
                    <div className="in-card">
                        <div className="in-filete-fino" />
                        <FirmarCifoCard expedienteId={expedienteId} demo={esDemo} info={info} onDone={() => setDone(true)} />
                    </div>
                )}
                <DatosObra filas={[['Cliente', info.cliente], ['Instalador', info.instalador]]} />
            </div>
        </MarcoInstalador>
    );
}
