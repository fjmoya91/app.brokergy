// ─── Flotantes.jsx — incidencias/sugerencias y el asistente (botones flotantes)
// Los dos se PORTALEAN a <body> (regla 29.b).
// «Incidencias y sugerencias» es el aviso GENERAL, de la app en su conjunto: no
// lleva obra (la pantalla sí se guarda). El de un certificado concreto está en la
// ficha de su obra («¿Algo mal en este certificado?», incidencias/Incidencias.jsx).
// El asistente:
//   · dice que es una IA y que puede equivocarse;
//   · enseña el cupo que queda (`GET /asistente/cupo`);
//   · si el servidor dice que está apagado (503) —o la ruta aún no existe—, se
//     esconde: no se ofrece algo que no va a contestar.
// REGLA del documento: el asistente va capado (modelo barato, sin herramientas,
// tope por cuenta y día). Su conocimiento es CE3X y esta app, no BROKERGY.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { API, mensajeError, noDisponible } from '../api';
import { Aviso, Hoja } from '../ui/piezas';
import { IcoChat, IcoChispa, IcoFlecha, Spinner } from '../ui/Iconos';
import { FormIncidencia } from '../incidencias/Incidencias';

/** El cupo puede venir con varios nombres: se normaliza a { quedan, max } o null (apagado). */
function normalizarCupo(d) {
    // GET /asistente/cupo → { disponible, usados_hoy, max_dia, restantes }
    if (!d || d.disponible === false || d.enabled === false || d.activo === false) return null;
    const c = d.cupo && typeof d.cupo === 'object' ? d.cupo : d;
    const quedan = c.quedan ?? c.restantes ?? c.disponibles ?? c.remaining ?? null;
    const max = c.max ?? c.max_dia ?? c.limite ?? c.limit ?? null;
    return { quedan: quedan == null ? null : Number(quedan), max: max == null ? null : Number(max) };
}

function textoRespuesta(d) {
    if (!d) return '';
    if (typeof d === 'string') return d;
    return d.respuesta || d.texto || d.text || d.content || d.mensaje?.content || d.mensaje || '';
}

function Asistente({ abierta, onCerrar, obraId, cupo, setCupo, onApagado }) {
    const [mensajes, setMensajes] = useState([]);
    const [texto, setTexto] = useState('');
    const [pensando, setPensando] = useState(false);
    const [error, setError] = useState(null);
    const finRef = useRef(null);

    useEffect(() => { finRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }); }, [mensajes, pensando]);

    const agotado = cupo?.quedan != null && cupo.quedan <= 0;

    const preguntar = async () => {
        const q = texto.trim();
        if (!q || pensando || agotado) return;
        const nuevos = [...mensajes, { role: 'user', content: q }];
        setMensajes(nuevos); setTexto(''); setPensando(true); setError(null);
        try {
            const { data } = await axios.post(`${API}/asistente`, { mensajes: nuevos.slice(-12), obra_id: obraId || undefined });
            const r = textoRespuesta(data);
            setMensajes(m => [...m, { role: 'assistant', content: r || 'No he sabido contestar a eso. Prueba a preguntarlo de otra forma.' }]);
            const c = normalizarCupo(data?.cupo ? data : null);
            if (c) setCupo(c);
            else if (cupo?.quedan != null) setCupo({ ...cupo, quedan: Math.max(0, cupo.quedan - 1) });
        } catch (err) {
            const st = err.response?.status;
            if (st === 503) { onApagado(); return; }
            if (st === 429) setCupo({ ...(cupo || {}), quedan: 0 });
            setError(st === 429 ? 'Has llegado al tope de preguntas de hoy. Mañana vuelve a estar disponible.' : mensajeError(err));
            setMensajes(m => m.slice(0, -1));
            setTexto(q);
        } finally {
            setPensando(false);
        }
    };

    return (
        <Hoja abierta={abierta} titulo="Asistente" onCerrar={onCerrar}
            pie={(
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                    <textarea className="ca-input" rows={2} value={texto} onChange={e => setTexto(e.target.value)} disabled={agotado}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); preguntar(); } }}
                        placeholder={agotado ? 'Sin preguntas por hoy' : 'Pregunta sobre CE3X o sobre la app'} style={{ minHeight: 56 }} maxLength={2000} />
                    <button type="button" className="ca-btn ca-btn-pri ca-btn-auto" style={{ minHeight: 56, padding: '0 16px' }}
                        onClick={preguntar} disabled={pensando || !texto.trim() || agotado} aria-label="Preguntar">
                        {pensando ? <Spinner /> : <IcoFlecha />}
                    </button>
                </div>
            )}>
            <Aviso tono="info" icono={IcoChispa} titulo="Es una IA y puede equivocarse">
                Sabe de CE3X y de cómo funciona esta app. Comprueba lo importante antes de firmar.
                {cupo?.quedan != null && <> Te quedan <b>{cupo.quedan}</b>{cupo.max ? ` de ${cupo.max}` : ''} preguntas hoy.</>}
            </Aviso>
            <div className="ca-chat" aria-live="polite">
                {mensajes.length === 0 && (
                    <p className="ca-peq" style={{ margin: '4px 4px 0' }}>
                        Por ejemplo: «¿Qué transmitancia pone CE3X por defecto a un muro de 1975?» o «¿Cómo pido las fotos al propietario?»
                    </p>
                )}
                {mensajes.map((m, i) => (
                    <div key={i} className={`ca-msg ${m.role === 'user' ? 'ca-msg-yo' : 'ca-msg-ia'}`}>{m.content}</div>
                ))}
                {pensando && <div className="ca-msg ca-msg-ia"><Spinner size={16} /></div>}
                <div ref={finRef} />
            </div>
            {error && <p className="ca-error">{error}</p>}
        </Hoja>
    );
}

export default function Flotantes({ obraId }) {
    const [abierto, setAbierto] = useState(null);
    // undefined = preguntando · null = apagado (se esconde) · { quedan, max }
    const [cupo, setCupo] = useState(undefined);

    useEffect(() => {
        let vivo = true;
        axios.get(`${API}/asistente/cupo`)
            .then(({ data }) => { if (vivo) setCupo(normalizarCupo(data)); })
            .catch((err) => { if (vivo) setCupo(noDisponible(err) || err.response?.status === 403 ? null : { quedan: null, max: null }); });
        return () => { vivo = false; };
    }, []);

    return (
        <>
            {createPortal(
                <div className="ca-fabs">
                    <button type="button" className="ca-fab ca-fab-peq" onClick={() => setAbierto('feedback')} aria-label="Incidencias y sugerencias">
                        <IcoChat size={18} /><span className="ca-solo-pc">Incidencias y sugerencias</span>
                    </button>
                    {cupo && (
                        <button type="button" className="ca-fab ca-fab-tinta" onClick={() => setAbierto('asistente')} aria-label="Abrir el asistente">
                            <IcoChispa /><span className="ca-solo-pc">Asistente</span>
                        </button>
                    )}
                </div>,
                document.body,
            )}
            <FormIncidencia abierta={abierto === 'feedback'} onCerrar={() => setAbierto(null)} />
            {cupo && (
                <Asistente abierta={abierto === 'asistente'} onCerrar={() => setAbierto(null)} obraId={obraId}
                    cupo={cupo} setCupo={setCupo} onApagado={() => { setAbierto(null); setCupo(null); }} />
            )}
        </>
    );
}
