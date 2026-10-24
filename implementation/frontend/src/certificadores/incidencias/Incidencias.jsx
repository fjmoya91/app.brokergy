// ─── Incidencias — lo que el certificador nos cuenta y lo que le respondemos ─
// Fran, 24/10/2026: «que el certificador nos pueda dejar incidencias para
// mejorar, tanto en cada CEE porque puede haber algo puntual como en general en
// la app». Piezas:
//   · FormIncidencia: el formulario (una Hoja). Desde el botón flotante es general;
//     desde una obra lleva la obra puesta y el tipo «Algo no va» (ERROR).
//   · ItemIncidencia: una incidencia con su estado en palabras llanas y la
//     respuesta de BROKERGY.
//   · IncidenciasObra: el acceso «¿Algo mal en este certificado? Avísanos» de la
//     ficha de la obra y, debajo, las de esa obra.
// API: POST /api/certapp/feedback · GET /api/certapp/feedback[?obra_id=] → { incidencias }.
// El estado lo decide el equipo en el admin; aquí solo se lee (tipos y estados en comun.js).
import { useEffect, useState } from 'react';
import axios from 'axios';
import { API, comoLista, fecha, mensajeError, useCarga } from '../api';
import { Enlace } from '../router';
import { Hoja, useToast } from '../ui/piezas';
import { IcoAlerta, IcoChevron, Spinner } from '../ui/Iconos';
import { TIPOS, estadoInc, tipoDe } from './comun';

/* ── El formulario ────────────────────────────────────────────────────────── */
export function FormIncidencia({ abierta, onCerrar, obraId, numero, tipoInicial = 'SUGERENCIA', onEnviada, verLista = true }) {
    const toast = useToast();
    const [tipo, setTipo] = useState(tipoInicial);
    const [texto, setTexto] = useState('');
    const [enviando, setEnviando] = useState(false);
    const [error, setError] = useState(null);

    // Cada vez que se abre: el tipo de partida (desde una obra, «Algo no va») y sin el error de antes.
    useEffect(() => { if (abierta) { setTipo(tipoInicial); setError(null); } }, [abierta, tipoInicial]);

    const enviar = async () => {
        if (texto.trim().length < 3) { setError('Cuéntanos un poco más.'); return; }
        setEnviando(true); setError(null);
        try {
            const { data } = await axios.post(`${API}/feedback`, {
                tipo,
                texto: texto.trim(),
                pantalla: `${window.location.pathname}${window.location.search} · ${document.title}`,
                obra_id: obraId || undefined,
            });
            setTexto('');
            onCerrar();
            toast(obraId ? 'Recibido. Te contestamos aquí y por email.' : 'Gracias. Te contestamos en «Mis incidencias».');
            onEnviada?.(data?.incidencia || null);
        } catch (err) {
            setError(mensajeError(err, 'No se ha podido enviar. Vuelve a intentarlo.'));
        } finally {
            setEnviando(false);
        }
    };

    const placeholder = tipo === 'ERROR'
        ? (obraId ? 'Qué está mal y dónde lo has visto (un dato, una foto, el resultado…)' : 'Qué estabas haciendo y qué ha pasado')
        : 'Qué cambiarías o qué echas de menos';

    return (
        <Hoja abierta={abierta} titulo={obraId ? 'Algo mal en este certificado' : 'Incidencias y sugerencias'} onCerrar={onCerrar}
            pie={(
                <button type="button" className="ca-btn ca-btn-pri" onClick={enviar} disabled={enviando}>
                    {enviando ? <><Spinner /> Enviando…</> : 'Enviar'}
                </button>
            )}>
            {obraId ? (
                <p className="ca-txt" style={{ marginTop: 0 }}>
                    Cuéntanos qué está mal{numero ? <> en <b>{numero}</b></> : ' en esta obra'}. Lo revisamos y te contestamos aquí y por email.
                </p>
            ) : (
                <p className="ca-txt" style={{ marginTop: 0 }}>
                    Estamos en <b>beta</b>: lo que no funcione, te sobre o eches de menos nos ayuda. Si es de un certificado concreto,
                    mejor desde su obra («¿Algo mal en este certificado?»).
                </p>
            )}
            <div className="ca-chips" role="radiogroup" aria-label="Tipo">
                {TIPOS.map(t => (
                    <button key={t.value} type="button" role="radio" aria-checked={tipo === t.value}
                        className={`ca-chipbtn${tipo === t.value ? ' ca-chipbtn-sel' : ''}`} onClick={() => setTipo(t.value)}>
                        {t.label}
                    </button>
                ))}
            </div>
            <label className="ca-campo">
                <span className="ca-label">Cuéntanos</span>
                <textarea className="ca-input" rows={5} value={texto} onChange={e => setTexto(e.target.value)} maxLength={3000} placeholder={placeholder} />
            </label>
            {error && <p className="ca-error" role="alert">{error}</p>}
            {verLista && (
                <p className="ca-peq" style={{ margin: '4px 2px 0' }}>
                    Lo que nos mandes y lo que te contestemos lo tienes en{' '}
                    <Enlace to="/incidencias" className="ca-link" onClick={onCerrar}>Mis incidencias</Enlace>.
                </p>
            )}
        </Hoja>
    );
}

/* ── Una incidencia ───────────────────────────────────────────────────────── */
export function ItemIncidencia({ f, conObra = true, resaltada = false }) {
    const e = estadoInc(f.estado);
    return (
        <article id={`inc-${f.id}`} className={`ca-inc${resaltada ? ' ca-resaltado' : ''}`}>
            <div className="ca-inc-top">
                <span className={`ca-chip ${e.chip}`}>{e.label}</span>
                <span className="ca-peq" title={fecha(f.created_at, true)}>{fecha(f.created_at)}</span>
            </div>
            <p className="ca-inc-txt">{f.texto}</p>
            <p className="ca-inc-meta">
                {tipoDe(f.tipo)}
                {conObra && (f.obra_id
                    ? <> · <Enlace to={`/obra/${f.obra_id}`} className="ca-link ca-inc-obra">{f.numero_expediente || 'Ver la obra'}</Enlace></>
                    : ' · De la app en general')}
            </p>
            {f.respuesta ? (
                <div className="ca-inc-resp">
                    <p className="ca-eyebrow ca-eyebrow-verde">Respuesta de BROKERGY{f.respuesta_at ? ` · ${fecha(f.respuesta_at)}` : ''}</p>
                    <p className="ca-inc-resp-txt">{f.respuesta}</p>
                </div>
            ) : (
                <p className="ca-peq ca-inc-espera">{e.espera}</p>
            )}
        </article>
    );
}

/* ── En la ficha de la obra ───────────────────────────────────────────────── */
export function IncidenciasObra({ obraId, numero, className = '' }) {
    const [abierta, setAbierta] = useState(false);
    const { datos, error, recargar } = useCarga(async () => {
        const { data } = await axios.get(`${API}/feedback`, { params: { obra_id: obraId } });
        return comoLista(data, 'incidencias');
    }, [obraId]);
    const lista = datos || [];

    return (
        <div className={className}>
            <button type="button" className="ca-fila" onClick={() => setAbierta(true)}>
                <span className="ca-ico-tile ca-tile-naranja" aria-hidden="true"><IcoAlerta /></span>
                <span><b>¿Algo mal en este certificado? Avísanos</b><small>Un dato, una foto, el resultado… Te contestamos aquí y por email.</small></span>
                <IcoChevron />
            </button>
            {lista.length > 0 && (
                <>
                    <h2 className="ca-sec">Lo que nos has contado de esta obra</h2>
                    <div className="ca-inc-lista">
                        {lista.map(f => <ItemIncidencia key={f.id} f={f} conObra={false} />)}
                    </div>
                </>
            )}
            {error && !datos && (
                <p className="ca-peq" style={{ margin: '8px 4px 0' }}>
                    No hemos podido cargar lo que nos has contado de esta obra.{' '}
                    <button type="button" className="ca-link" onClick={() => recargar()}>Reintentar</button>
                </p>
            )}
            <FormIncidencia abierta={abierta} onCerrar={() => setAbierta(false)} obraId={obraId} numero={numero} tipoInicial="ERROR"
                onEnviada={() => recargar({ silencioso: true })} />
        </div>
    );
}
