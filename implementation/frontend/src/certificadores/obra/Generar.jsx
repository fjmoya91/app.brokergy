// ─── Generar — el BARRIDO antes de pedir el certificado y el pedido ─────────
// 1. Se guarda lo pendiente (el servidor mira la obra guardada, no la pantalla).
// 2. Barrido con la MISMA función que el servidor (logic/cuestionario.js):
//    bloqueantes en ámbar FUERTE (nunca rojo), avisos en ámbar, equipos sin placa
//    con «subir ahora / usar genérico».
// 3. POST /obras/:id/generar { genericos } → SendActionOverlay. 402: sin créditos;
//    422: el barrido del servidor (manda el suyo); 409: ya pedido.
import { useMemo, useState } from 'react';
import axios from 'axios';
import SendActionOverlay from '../../components/SendActionOverlay';
import { barrido as calcularBarrido, NOMBRE_EQUIPO } from '../logic/cuestionario';
import { API, mensajeError } from '../api';
import { useCertappAuth } from '../auth/CertappAuth';
import { navegar } from '../router';
import { Hoja } from '../ui/piezas';
import { IcoAlerta, IcoChevron, IcoChispa, Spinner } from '../ui/Iconos';
import { EMAIL_CONTACTO } from '../marca';
import { obraParaBarrido } from './comun';
import { PASO_POR_ID, pasoDelEquipo } from './pasos';

const nombrePaso = (paso) => (paso === 'perfil' ? 'Mi perfil' : PASO_POR_ID[paso]?.titulo || 'Ir');

/** El botón y todo lo que abre. `onIr(paso)` lleva a la pregunta; `onHecho()` recarga la obra. */
export function Generar({ obra, form, slots, guardar, onIr, onHecho, className = 'ca-btn ca-btn-pri', etiqueta = 'Generar certificado' }) {
    const { cuenta, refrescar } = useCertappAuth();
    const [abierta, setAbierta] = useState(false);
    const [preparando, setPreparando] = useState(false);
    const [barridoServ, setBarridoServ] = useState(null);
    const [genericos, setGenericos] = useState({});
    const [fase, setFase] = useState(null);
    const [res, setRes] = useState({ ok: false });
    const [error, setError] = useState(null);

    const local = useMemo(
        () => calcularBarrido(obraParaBarrido(obra, form, slots), cuenta),
        [obra, form, slots, cuenta],
    );
    // Si el servidor dijo que faltaba algo (422), manda lo suyo hasta que se cierre.
    const b = barridoServ || local;
    const creditos = Number(cuenta?.creditos ?? 0);
    const sinCreditos = cuenta && creditos <= 0;
    const avisos = b.avisos.filter(a => !String(a.id).startsWith('placa_'));
    const c = form?.cuestionario || {};

    const abrir = async () => {
        setPreparando(true); setError(null); setBarridoServ(null); setGenericos({});
        const ok = await guardar();
        setPreparando(false);
        if (!ok) { setError('No se han podido guardar los últimos cambios. Revisa la conexión y vuelve a probar.'); }
        setAbierta(true);
    };
    const ir = (paso) => {
        setAbierta(false);
        if (paso === 'perfil') navegar('/perfil?vuelta=' + encodeURIComponent(`/obra/${obra.id}`));
        else onIr(paso);
    };

    const pedir = async () => {
        setAbierta(false);
        setFase('sending'); setError(null);
        try {
            const lista = Object.keys(genericos).filter(k => genericos[k]);
            const { data } = await axios.post(`${API}/obras/${obra.id}/generar`, { genericos: lista });
            setRes({ ok: true, creditos: data?.creditos });
            setFase('done');
            refrescar?.();
        } catch (err) {
            const st = err.response?.status;
            const d = err.response?.data || {};
            if (st === 422 && d.barrido) {
                // El servidor ve algo que la pantalla no: se enseña su barrido.
                setFase(null);
                setBarridoServ(d.barrido);
                setAbierta(true);
                return;
            }
            setRes({
                ok: false,
                error: st === 402
                    ? `No te quedan certificados. Escríbenos a ${EMAIL_CONTACTO} y te damos más.`
                    : st === 409 ? (d.error || 'Este certificado ya está pedido.')
                        : mensajeError(err, 'No se ha podido pedir el certificado. Vuelve a intentarlo.'),
            });
            setFase('done');
        }
    };
    const cerrarOverlay = () => {
        const ok = res.ok;
        setFase(null);
        if (ok || res.error) onHecho?.();
    };

    const pie = (
        <div className="ca-btns">
            <button type="button" className="ca-btn ca-btn-pri" onClick={pedir} disabled={!b.listo || sinCreditos}>
                <IcoChispa /> Pedir el certificado
            </button>
            {cuenta && (
                <p className="ca-peq" style={{ textAlign: 'center', margin: '4px 0 0' }}>
                    {sinCreditos ? 'No te quedan certificados.' : `Gasta 1 de tus ${creditos} certificados. Si no podemos hacerlo, te lo devolvemos.`}
                </p>
            )}
        </div>
    );

    return (
        <>
            <button type="button" className={className} onClick={abrir} disabled={preparando}>
                {preparando ? <><Spinner /> Guardando…</> : <><IcoChispa /> {etiqueta}</>}
            </button>

            <Hoja abierta={abierta} titulo={b.listo ? 'Antes de pedirlo' : 'Falta algo'} onCerrar={() => setAbierta(false)} pie={pie} ancho={560}>
                {error && <div className="ca-aviso ca-aviso-ambar"><span className="ca-ico-tile"><IcoAlerta size={18} /></span><div>{error}</div></div>}

                {b.bloqueantes.length > 0 && (
                    <section>
                        <h3 className="ca-sec">Sin esto no se puede pedir</h3>
                        <ul className="ca-barrido">
                            {b.bloqueantes.map(x => (
                                <li key={x.id} className="ca-aviso ca-aviso-fuerte">
                                    <span className="ca-ico-tile"><IcoAlerta size={18} /></span>
                                    <div>
                                        <span>{x.texto}</span>
                                        <button type="button" className="ca-link" onClick={() => ir(x.paso)}>Ir a arreglarlo <IcoChevron size={14} /></button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </section>
                )}

                {b.equiposSinFoto.length > 0 && (
                    <section>
                        <h3 className="ca-sec">Equipos sin placa</h3>
                        <ul className="ca-barrido">
                            {b.equiposSinFoto.map(e => {
                                const gen = !!genericos[e.equipo];
                                return (
                                    <li key={e.equipo} className="ca-aviso ca-aviso-ambar">
                                        <span className="ca-ico-tile"><IcoAlerta size={18} /></span>
                                        <div>
                                            <span>Falta la placa de {NOMBRE_EQUIPO[e.equipo] || e.equipo}. Con ella el resultado es más fiel.</span>
                                            <div className="ca-chips" style={{ marginTop: 8 }}>
                                                <button type="button" className="ca-chipbtn" onClick={() => ir(pasoDelEquipo(e.equipo, c))}>Subirla ahora</button>
                                                <button type="button" className={`ca-chipbtn${gen ? ' ca-chipbtn-sel' : ''}`} aria-pressed={gen}
                                                    onClick={() => setGenericos(g => ({ ...g, [e.equipo]: !gen }))}>
                                                    Usar un equipo genérico
                                                </button>
                                            </div>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                        <p className="ca-peq" style={{ marginTop: 8 }}>Si no eliges nada, también se usa uno genérico.</p>
                    </section>
                )}

                {avisos.length > 0 && (
                    <section>
                        <h3 className="ca-sec">Se puede pedir, pero mejor si lo completas</h3>
                        <ul className="ca-barrido">
                            {avisos.map(x => (
                                <li key={x.id} className="ca-aviso ca-aviso-ambar">
                                    <span className="ca-ico-tile"><IcoAlerta size={18} /></span>
                                    <div>
                                        <span>{x.texto}</span>
                                        <button type="button" className="ca-link ca-link-gris" onClick={() => ir(x.paso)}>{nombrePaso(x.paso)} <IcoChevron size={14} /></button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </section>
                )}

                {b.listo && !avisos.length && !b.equiposSinFoto.length && (
                    <div className="ca-aviso ca-aviso-ok">
                        <span className="ca-ico-tile"><IcoChispa size={18} /></span>
                        <div><b style={{ display: 'block' }}>Todo listo</b>La IA tiene lo que necesita para preparar el certificado.</div>
                    </div>
                )}

                {sinCreditos && (
                    <div className="ca-aviso ca-aviso-fuerte">
                        <span className="ca-ico-tile"><IcoAlerta size={18} /></span>
                        <div>
                            <b style={{ display: 'block' }}>No te quedan certificados</b>
                            Escríbenos a <a href={`mailto:${EMAIL_CONTACTO}`}>{EMAIL_CONTACTO}</a> y te damos más.
                        </div>
                    </div>
                )}
            </Hoja>

            <SendActionOverlay
                phase={fase}
                ok={res.ok}
                icon="send"
                subtitle={[obra?.numero_expediente, form?.direccion].filter(Boolean).join(' · ')}
                sendingTitle="Pidiendo tu certificado…"
                okTitle="Estamos preparando tu certificado"
                errorTitle="No se ha podido pedir"
                items={res.ok ? [
                    'Te avisaremos por WhatsApp y email cuando esté listo.',
                    ...(res.creditos != null ? [{ texto: `Te quedan ${res.creditos} certificados.`, tono: 'info' }] : []),
                ] : []}
                errorText={res.error}
                onClose={cerrarOverlay}
            />
        </>
    );
}

export default Generar;
