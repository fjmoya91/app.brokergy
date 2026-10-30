// ─── Generar — la última fase: el BARRIDO y el pedido ───────────────────────
// Es la fase 6 de la ficha (obra/fasesFicha.js), en la página: nada de ventanas.
// 1. Las medidas de mejora (marcadas las sugeridas) y las notas para la IA.
// 2. Barrido con la MISMA función que el servidor (logic/cuestionario.js): lo
//    que bloquea (solo referencia, dirección, titular y para qué) en ámbar
//    FUERTE, nunca rojo; los equipos sin placa con «subirla / genérico»; y lo
//    que completará la IA, plegado (no asusta: se puede pedir igual).
// 3. Se guarda lo pendiente (el servidor mira la obra guardada, no la pantalla)
//    y POST /obras/:id/generar { genericos } → SendActionOverlay. 402: sin
//    créditos; 422: el barrido del servidor (manda el suyo); 409: ya pedido.
// Un encargo de BROKERGY (obra/Encargo.jsx) no gasta créditos y se acepta antes de pedirlo.
import { useMemo, useState } from 'react';
import axios from 'axios';
import SendActionOverlay from '../../components/SendActionOverlay';
import { barrido as calcularBarrido, NOMBRE_EQUIPO } from '../logic/cuestionario';
import { API, mensajeError } from '../api';
import { useCertappAuth } from '../auth/CertappAuth';
import { navegar } from '../router';
import { IcoAlerta, IcoChevron, IcoChispa, Spinner } from '../ui/Iconos';
import { EMAIL_CONTACTO } from '../marca';
import { obraParaBarrido } from './comun';
import { FASE_POR_ID, faseDePaso } from './fasesFicha';
import { PASO_POR_ID } from './pasos';
import { Medidas, Pregunta } from './Pregunta';

/**
 * @param ctx     el de la ficha (form, setC… para medidas y notas)
 * @param onIr    (fase) => abre esa fase
 * @param onHecho () => recarga la obra (ya pedida, pasa a solo lectura)
 */
export function PedirCertificado({ ctx, guardar, onIr, onHecho }) {
    const { obra, form, slots } = ctx;
    const { cuenta, refrescar } = useCertappAuth();
    const [barridoServ, setBarridoServ] = useState(null);
    const [genericos, setGenericos] = useState({});
    const [fase, setFase] = useState(null);
    const [res, setRes] = useState({ ok: false });
    const [error, setError] = useState(null);
    const [guardando, setGuardando] = useState(false);

    const local = useMemo(
        () => calcularBarrido(obraParaBarrido(obra, form, slots), cuenta),
        [obra, form, slots, cuenta],
    );
    // Si el servidor dijo que faltaba algo (422), manda lo suyo mientras no se cambie nada.
    const b = barridoServ && barridoServ.form === form ? barridoServ.barrido : local;
    const creditos = Number(cuenta?.creditos ?? 0);
    // Un encargo de BROKERGY no gasta créditos, pero se acepta antes (409 ENCARGO_SIN_ACEPTAR).
    const deBrokergy = !!obra?.crm;
    const sinAceptar = deBrokergy && obra.crm.encargo?.estado !== 'ACEPTADO';
    const sinCreditos = !deBrokergy && cuenta && creditos <= 0;
    const avisos = b.avisos.filter(a => !String(a.id).startsWith('placa_'));

    const ir = (paso) => {
        if (paso === 'perfil') navegar('/perfil?vuelta=' + encodeURIComponent(`/obra/${obra.id}`));
        else onIr(faseDePaso(paso));
    };
    // Lo que se arregla en esta misma pantalla (o lo saca la IA) no lleva enlace.
    const lleva = (paso) => paso === 'perfil' || faseDePaso(paso) !== 'generar';

    const pedir = async () => {
        setError(null); setGuardando(true);
        const ok = await guardar();
        setGuardando(false);
        if (!ok) { setError('No se han podido guardar los últimos cambios. Revisa la conexión y vuelve a probar.'); return; }
        setFase('sending');
        try {
            const lista = Object.keys(genericos).filter(k => genericos[k]);
            const { data } = await axios.post(`${API}/obras/${obra.id}/generar`, { genericos: lista });
            setRes({ ok: true, creditos: data?.creditos, encargo: !!data?.encargo });
            setFase('done');
            refrescar?.();
        } catch (err) {
            const st = err.response?.status;
            const d = err.response?.data || {};
            if (st === 422 && d.barrido) {
                // El servidor ve algo que la pantalla no: se enseña su barrido.
                setFase(null);
                setBarridoServ({ form, barrido: d.barrido });
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

    return (
        <div className="ca-stack">
            <section>
                <h3 className="ca-sec" style={{ marginTop: 0 }}>Medidas de mejora</h3>
                <Medidas ctx={ctx} />
            </section>
            <Pregunta p={PASO_POR_ID.notas.preguntas[0]} ctx={ctx} pasoId="notas" />

            {b.bloqueantes.length > 0 && (
                <section>
                    <h3 className="ca-sec">Sin esto no se puede pedir</h3>
                    <ul className="ca-barrido">
                        {b.bloqueantes.map(x => (
                            <li key={x.id} className="ca-aviso ca-aviso-fuerte">
                                <span className="ca-ico-tile"><IcoAlerta size={18} /></span>
                                <div>
                                    <span>{x.texto}</span>
                                    {lleva(x.paso) && (
                                        <button type="button" className="ca-link" onClick={() => ir(x.paso)}>
                                            Ir a {FASE_POR_ID[faseDePaso(x.paso)]?.titulo.toLowerCase() || 'arreglarlo'} <IcoChevron size={14} />
                                        </button>
                                    )}
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
                                            <button type="button" className="ca-chipbtn" onClick={() => onIr('fotos')}>Subirla ahora</button>
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
                <details className="ca-plegado">
                    <summary>
                        <span><b>La IA completará {avisos.length} {avisos.length === 1 ? 'cosa' : 'cosas'}</b>
                            <small>Se puede pedir igual. Si quieres afinarlas, ábrelas.</small></span>
                        <IcoChevron size={16} />
                    </summary>
                    <ul className="ca-barrido" style={{ marginTop: 10 }}>
                        {avisos.map(x => (
                            <li key={x.id} className="ca-aviso ca-aviso-ambar">
                                <span className="ca-ico-tile"><IcoAlerta size={18} /></span>
                                <div>
                                    <span>{x.texto}</span>
                                    {lleva(x.paso) && (
                                        <button type="button" className="ca-link ca-link-gris" onClick={() => ir(x.paso)}>
                                            {x.paso === 'perfil' ? 'Mi perfil' : FASE_POR_ID[faseDePaso(x.paso)]?.titulo || 'Ir'} <IcoChevron size={14} />
                                        </button>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ul>
                </details>
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
            {error && <div className="ca-aviso ca-aviso-ambar"><span className="ca-ico-tile"><IcoAlerta size={18} /></span><div>{error}</div></div>}

            <div className="ca-btns" style={{ marginTop: 4 }}>
                <button type="button" className="ca-btn ca-btn-pri" onClick={pedir} disabled={!b.listo || sinCreditos || sinAceptar || guardando}>
                    {guardando ? <><Spinner /> Guardando…</> : <><IcoChispa /> Pedir el certificado</>}
                </button>
                {deBrokergy ? (
                    <p className="ca-peq" style={{ textAlign: 'center', margin: '4px 0 0' }}>
                        {sinAceptar ? 'Acepta primero el encargo (arriba).' : `Encargo de BROKERGY ${obra.crm.numero || ''}: no gasta tus certificados.`}
                    </p>
                ) : cuenta && (
                    <p className="ca-peq" style={{ textAlign: 'center', margin: '4px 0 0' }}>
                        {sinCreditos ? 'No te quedan certificados.' : `Gasta 1 de tus ${creditos} certificados. Si no podemos hacerlo, te lo devolvemos.`}
                    </p>
                )}
            </div>

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
                    ...(res.encargo ? [{ texto: 'Es un encargo de BROKERGY: no ha gastado ninguno de tus certificados.', tono: 'info' }]
                        : res.creditos != null ? [{ texto: `Te quedan ${res.creditos} certificados.`, tono: 'info' }] : []),
                ] : []}
                errorText={res.error}
                onClose={cerrarOverlay}
            />
        </div>
    );
}

export default PedirCertificado;
