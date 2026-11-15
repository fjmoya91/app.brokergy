// ─── Encargo — una obra que le encarga BROKERGY desde el CRM ────────────────
// Fran (30/10/2026): «que le pueda asignar al certificador un expediente, que le
// aparezca en su panel y que lo pueda aceptar o declinar». El CRM crea la obra con
// el cliente, la vivienda y las fotos que ya tenía (services/certapp/crm.js) y le
// avisa con el enlace /encargo/:negocio/:id/:fase.
//   PENDIENTE  → Aceptar / Rechazar (con el motivo, que le llega al equipo). Rechazado,
//                vuelve a «sin encargar» en el CRM y la obra se archiva (sale del panel).
//   ACEPTADO   → una línea con el número del CRM y, leído EN VIVO del CRM, en qué
//                punto está: en revisión, visto bueno (ya se puede registrar) o registrado.
// No gasta créditos (lo dice aquí y en «Pedir el certificado»).
// El enlace del aviso (/encargo/:negocio/:id/:fase) lo abre AbrirEncargo: busca SU obra y va a ella.
import { useEffect, useState } from 'react';
import axios from 'axios';
import { API, errorDe, mensajeError } from '../api';
import { Enlace, navegar } from '../router';
import { Aviso, ErrorRed, Esqueleto, Hoja, useToast } from '../ui/piezas';
import { IcoCheck, IcoX, Spinner } from '../ui/Iconos';
import { faseEncargo } from './comun';

// Lo que dice el CRM del certificado que nos ha llegado (crm.resumen → `revision`).
const REVISION = {
    EN_REVISION: { titulo: 'Lo estamos revisando en BROKERGY', texto: 'Espera a nuestro visto bueno antes de presentarlo en el Registro.' },
    VISTO_BUENO: { titulo: 'Visto bueno de BROKERGY', texto: 'Ya puedes presentarlo en el Registro y subir aquí el justificante: nos llega solo.' },
    REGISTRADO: { titulo: 'Registrado', texto: 'El justificante ya está en el expediente de BROKERGY. ¡Gracias!' },
};
// Sin revisión todavía, según en qué punto está la obra.
const SIN_REVISION = {
    BORRADOR: 'Ya lleva los datos del cliente y las fotos que teníamos. Completa lo que falte y pídelo.',
    EN_PREPARACION: 'Lo estamos preparando.',
    LISTO: 'Cuando lo firmes, nos llega a BROKERGY para revisarlo.',
    VALIDADO: 'Firmado: nos llega a BROKERGY para revisarlo.',
};

/** @param {{ o: ReturnType<import('./useObra').useObra> }} p */
export function EncargoBrokergy({ o }) {
    const toast = useToast();
    const [hoja, setHoja] = useState(false);
    const [motivo, setMotivo] = useState('');
    const [enviando, setEnviando] = useState(null); // 'aceptar' | 'rechazar'
    const [error, setError] = useState(null);
    const { obra, encargo } = o;
    const c = encargo || obra?.crm;
    if (!c) return null;

    const numero = c.numero || 'BROKERGY';
    const estado = c.encargo?.estado || 'PENDIENTE';

    const aceptar = async () => {
        setEnviando('aceptar'); setError(null);
        try {
            const { data } = await axios.post(`${API}/obras/${obra.id}/encargo/aceptar`);
            // Sin recargar el formulario (no se pierde lo tecleado): solo el encargo.
            if (data?.obra?.crm) o.setObra(prev => ({ ...prev, crm: data.obra.crm }));
            if (data?.encargo) o.setEncargo(data.encargo);
            toast('Encargo aceptado. Ya puedes empezar.');
        } catch (err) {
            const d = errorDe(err);
            if (d.code === 'ENCARGO_RETIRADO') { toast(d.error || 'Este encargo ya no es tuyo.', 4000); navegar('/panel'); return; }
            setError(mensajeError(err, 'No se ha podido aceptar el encargo.'));
        } finally { setEnviando(null); }
    };

    const rechazar = async () => {
        setEnviando('rechazar'); setError(null);
        try {
            await axios.post(`${API}/obras/${obra.id}/encargo/rechazar`, { motivo: motivo.trim() });
            toast(`Encargo ${numero} rechazado. Se lo hemos dicho al equipo.`, 3500);
            navegar('/panel');
        } catch (err) {
            setError(mensajeError(err, 'No se ha podido rechazar el encargo.'));
            setEnviando(null);
        }
    };

    if (estado !== 'PENDIENTE') {
        const r = REVISION[c.revision];
        return (
            <Aviso tono={c.revision === 'VISTO_BUENO' || c.revision === 'REGISTRADO' ? 'ok' : 'info'} className="ca-in"
                titulo={r ? `${r.titulo} · ${numero}` : `Encargo de BROKERGY · ${numero}`}>
                <span className="ca-peq" style={{ display: 'block' }}>{faseEncargo(c)} · no gasta tus certificados</span>
                {r ? r.texto : (SIN_REVISION[obra.estado] || '')}
            </Aviso>
        );
    }

    return (
        <section className="ca-card ca-pad ca-in ca-encargo" aria-label="Encargo de BROKERGY">
            <div className="ca-filete" />
            <p className="ca-eyebrow" style={{ margin: 0 }}>Encargo de BROKERGY · {numero}</p>
            <h2 className="ca-display ca-h3" style={{ margin: '6px 0 0' }}>Te encargamos el {faseEncargo(c)}</h2>
            <p className="ca-txt" style={{ marginTop: 6 }}>
                Ya lleva los datos del cliente, la vivienda y las fotos que teníamos. Lo que hagas aquí (fotos, el certificado firmado
                y el registro) nos llega solo al expediente. <b>No gasta tus certificados.</b>
            </p>
            {error && <p className="ca-peq ca-falta" role="alert">{error}</p>}
            <div className="ca-btns ca-btns-2">
                <button type="button" className="ca-btn ca-btn-sec" onClick={() => { setError(null); setHoja(true); }} disabled={!!enviando}>
                    <IcoX /> Rechazar
                </button>
                <button type="button" className="ca-btn ca-btn-pri" onClick={aceptar} disabled={!!enviando}>
                    {enviando === 'aceptar' ? <Spinner /> : <IcoCheck />} Aceptar el encargo
                </button>
            </div>

            <Hoja abierta={hoja} titulo="¿Rechazar el encargo?" onCerrar={() => enviando !== 'rechazar' && setHoja(false)}
                pie={(
                    <div className="ca-btns ca-btns-2">
                        <button type="button" className="ca-btn ca-btn-sec" onClick={() => setHoja(false)} disabled={enviando === 'rechazar'}>Cancelar</button>
                        <button type="button" className="ca-btn ca-btn-peligro" onClick={rechazar} disabled={enviando === 'rechazar'}>
                            {enviando === 'rechazar' ? <Spinner /> : <IcoX />} Rechazarlo
                        </button>
                    </div>
                )}>
                <div className="ca-stack">
                    <p className="ca-txt" style={{ margin: 0 }}>
                        Se lo decimos al equipo de BROKERGY para que se lo encargue a otro técnico. La obra sale de tu panel.
                    </p>
                    <label className="ca-campo">
                        <span className="ca-label">¿Por qué? <small>· opcional</small></span>
                        <textarea className="ca-input" rows={3} maxLength={500} value={motivo} onChange={e => setMotivo(e.target.value)}
                            placeholder="Por ejemplo: esa semana no puedo ir, queda lejos…" />
                    </label>
                    {error && <p className="ca-peq ca-falta" role="alert" style={{ margin: 0 }}>{error}</p>}
                </div>
            </Hoja>
        </section>
    );
}

/**
 * /encargo/:negocio/:id/:fase — el enlace del WhatsApp/email del encargo. Busca la
 * obra de ESA cuenta (404 si se entró con otro email) y la abre.
 */
export function AbrirEncargo({ negocio, id, fase }) {
    const [error, setError] = useState(null);
    const [intento, setIntento] = useState(0);
    useEffect(() => {
        let vivo = true;
        axios.get(`${API}/encargo/${encodeURIComponent(negocio)}/${encodeURIComponent(id)}/${encodeURIComponent(fase)}`)
            .then(({ data }) => { if (vivo && data?.obra_id) navegar(`/obra/${data.obra_id}`, { replace: true }); })
            .catch((err) => { if (vivo) setError(err); });
        return () => { vivo = false; };
    }, [negocio, id, fase, intento]);

    if (!error) return <div className="ca-col"><Esqueleto alto={160} /></div>;
    if (errorDe(error).code === 'ENCARGO_NO_ENCONTRADO') {
        return (
            <div className="ca-col">
                <Aviso tono="ambar" titulo="No encuentro ese encargo en tu cuenta" className="ca-in">
                    {errorDe(error).error || '¿Has entrado con el email al que te lo mandamos?'}{' '}
                    Si lo rechazaste, ya no está en tu panel. <Enlace to="/panel" className="ca-link">Ir a mis obras</Enlace>
                </Aviso>
            </div>
        );
    }
    return <div className="ca-col"><ErrorRed error={error} onReintentar={() => { setError(null); setIntento(n => n + 1); }} titulo="No hemos podido abrir el encargo" /></div>;
}

export default EncargoBrokergy;
