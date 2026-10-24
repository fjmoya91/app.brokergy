// ─── Ficha — /obra/:id ──────────────────────────────────────────────────────
// BORRADOR: el cuestionario por pasos (obra/pasos.js sobre logic/cuestionario.js).
//   · Móvil: un inicio con el avance y los pasos, y UNA pregunta por pantalla
//     (`?q=<paso>:<clave>` en la URL, para que el «atrás» del móvil funcione);
//     tocar una opción avanza sola.
//   · Ordenador: los pasos en una columna, cada uno en su tarjeta, y a la derecha
//     el avance, los pasos y «Generar certificado».
// EN_PREPARACION / LISTO / VALIDADO: ObraCerrada (historial, descargas, validar).
// El guardado es de useObra (autoguardado sin trampa: compara valores).
import { useEffect, useMemo, useRef, useState } from 'react';
import { avance, barrido as calcularBarrido, resumenCuestionario } from '../logic/cuestionario';
import { useCertappAuth } from '../auth/CertappAuth';
import { navegar, useRuta, Enlace } from '../router';
import { useIsMobile } from '../../utils/useIsMobile';
import { ErrorRed, Esqueleto } from '../ui/piezas';
import { IcoAtras, IcoCheck, IcoChevron, IcoFlecha, IcoRecargar, Spinner } from '../ui/Iconos';
import { useObra } from './useObra';
import { PASOS, PASO_POR_ID, contestada, preguntasVisibles, recorrido } from './pasos';
import { Pregunta } from './Pregunta';
import { FotosObra } from './Fotos';
import { Generar } from './Generar';
import { ObraCerrada } from './ObraCerrada';
import { estadoDe, obraParaBarrido } from './comun';

/** Estado de cada paso a partir del barrido: falta (bloquea) · aviso · ok · pendiente. */
function estadoPasos(form, b) {
    const out = {};
    for (const paso of PASOS) {
        const bloq = b.bloqueantes.filter(x => x.paso === paso.id);
        const avis = b.avisos.filter(x => x.paso === paso.id);
        const vis = preguntasVisibles(paso, form);
        const sinContestar = vis.filter(p => p.k && !p.opcional && !contestada(p, form));
        let e = 'ok';
        if (bloq.length) e = 'falta';
        else if (sinContestar.length) e = 'pendiente';
        else if (avis.length) e = 'aviso';
        out[paso.id] = { e, bloq, avis };
    }
    return out;
}

function Guardado({ g, onReintentar }) {
    if (g.estado === 'guardando') return <span className="ca-guardado"><Spinner size={12} /> Guardando…</span>;
    if (g.estado === 'pendiente') return <span className="ca-guardado">Sin guardar…</span>;
    if (g.estado === 'error') {
        return (
            <span className="ca-guardado ca-guardado-error" role="status">
                No se ha guardado. <button type="button" className="ca-link" onClick={onReintentar}>Reintentar</button>
            </span>
        );
    }
    return <span className="ca-guardado"><IcoCheck size={13} /> Guardado</span>;
}

function ChipPaso({ e }) {
    if (e === 'ok') return <span className="ca-chip ca-chip-verde">Hecho</span>;
    if (e === 'falta') return <span className="ca-chip ca-chip-ambar">Falta</span>;
    if (e === 'aviso') return <span className="ca-chip ca-chip-gris">Revisar</span>;
    return null;
}

function ListaPasos({ estados, onPaso, activo }) {
    return (
        <ol className="ca-pasos">
            {PASOS.map((p, i) => {
                const e = estados[p.id]?.e;
                return (
                    <li key={p.id}>
                        <button type="button" onClick={() => onPaso(p.id)}
                            className={`ca-paso-item${e === 'ok' ? ' ca-paso-ok' : e === 'falta' ? ' ca-paso-falta' : ''}${activo === p.id ? ' ca-paso-act' : ''}`}>
                            <span className="ca-paso-n">{e === 'ok' ? <IcoCheck size={14} strokeWidth={3} /> : i + 1}</span>
                            <span><b>{p.titulo}</b><small>{estados[p.id]?.bloq[0]?.texto || p.sub}</small></span>
                            <IcoChevron size={16} />
                        </button>
                    </li>
                );
            })}
        </ol>
    );
}

export default function Ficha({ id }) {
    const o = useObra(id);
    const { query } = useRuta();
    const movil = useIsMobile();
    const { cuenta } = useCertappAuth();
    const qid = query.get('q');
    const [resaltado, setResaltado] = useState(null);
    const timerAvance = useRef(null);
    const ultimo = useRef({ rec: [], qid: null });

    const { obra, form, slots } = o;
    const rec = useMemo(() => (form ? recorrido(form) : []), [form]);
    const vista = useMemo(() => (obra && form ? obraParaBarrido(obra, form, slots) : null), [obra, form, slots]);
    const b = useMemo(() => (vista ? calcularBarrido(vista, cuenta) : { bloqueantes: [], avisos: [], equiposSinFoto: [], listo: false }), [vista, cuenta]);
    const pct = useMemo(() => (vista ? avance(vista) : 0), [vista]);
    const estados = useMemo(() => (form ? estadoPasos(form, b) : {}), [form, b]);
    const resumen = useMemo(() => (vista ? resumenCuestionario(vista) : []), [vista]);

    const idx = qid ? rec.findIndex(r => r.id === qid) : -1;
    const preguntaAbierta = movil && idx >= 0 && obra?.estado === 'BORRADOR';

    const urlQ = (r) => `/obra/${id}?q=${encodeURIComponent(r.id)}`;
    const alInicio = (replace = true) => navegar(`/obra/${id}`, { replace });
    const irIdx = (i) => {
        if (i < 0) { alInicio(); return; }
        if (i >= rec.length) { alInicio(); return; }
        navegar(urlQ(rec[i]), { replace: true });
    };

    /** Lleva a un paso: en el móvil, a su primera pregunta sin contestar; en el ordenador, a su tarjeta. */
    const irAPaso = (pasoId) => {
        if (movil) {
            const delPaso = rec.filter(r => r.paso.id === pasoId);
            const r = delPaso.find(x => !contestada(x.p, form)) || delPaso[0];
            if (r) navegar(urlQ(r));
            return;
        }
        const el = document.getElementById(`paso-${pasoId}`);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            setResaltado(pasoId);
            setTimeout(() => setResaltado(r => (r === pasoId ? null : r)), 2200);
        }
    };
    const continuar = () => {
        const r = rec.find(x => x.p.k && !x.p.opcional && !contestada(x.p, form))
            || rec.find(x => x.p.k && !contestada(x.p, form))
            || rec[0];
        if (r) navegar(urlQ(r));
    };

    // Tocar una opción avanza, pero DESPUÉS de que el formulario cambie: si se
    // contesta «Piso», la siguiente es «¿en qué planta?», que antes no existía.
    // Por eso el temporizador lee el recorrido del ÚLTIMO render (la ref), no el
    // de este cierre; y si mientras tanto se ha ido a otra pregunta, no hace nada.
    useEffect(() => { ultimo.current = { rec, qid }; });
    useEffect(() => () => clearTimeout(timerAvance.current), []);
    const alElegir = () => {
        clearTimeout(timerAvance.current);
        const actual = qid;
        timerAvance.current = setTimeout(() => {
            const { rec: r, qid: q } = ultimo.current;
            if (!actual || q !== actual) return;
            const i = r.findIndex(x => x.id === actual);
            if (i < 0) return;
            const sig = r[i + 1];
            navegar(sig ? `/obra/${id}?q=${encodeURIComponent(sig.id)}` : `/obra/${id}`, { replace: true });
        }, 220);
    };

    // La barra inferior del móvil sube los botones flotantes.
    useEffect(() => {
        if (!preguntaAbierta) return undefined;
        document.documentElement.style.setProperty('--ca-inf', '78px');
        return () => { document.documentElement.style.removeProperty('--ca-inf'); };
    }, [preguntaAbierta]);

    // Una pregunta de la URL que ya no aplica (se cambió una respuesta): al inicio.
    useEffect(() => {
        if (movil && qid && form && obra?.estado === 'BORRADOR' && idx < 0) alInicio();
    }, [movil, qid, idx, form, obra?.estado]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Render ───────────────────────────────────────────────────────────────
    if (o.cargando && !obra) {
        return <div className={movil ? 'ca-col' : 'ca-col-ancha'}><Esqueleto alto={160} /><div style={{ height: 12 }} /><Esqueleto alto={64} n={5} /></div>;
    }
    if (!obra || !form) {
        return <div className="ca-col"><ErrorRed error={o.error} onReintentar={() => o.cargar()} titulo="No hemos podido abrir la obra" /></div>;
    }
    if (obra.estado && obra.estado !== 'BORRADOR') {
        return <ObraCerrada o={o} resumen={resumen} />;
    }

    const ctx = {
        form, obra, slots, editable: o.editable,
        setCampo: o.setCampo, setC: o.setC, setTitular: o.setTitular, setDecision: o.setDecision,
        subir: o.subir, quitar: o.quitar, subiendo: o.subiendo, docsError: o.docsError, recargarDocs: o.recargarDocs,
    };
    const t = form.titular || {};
    const titulo = [t.nombre, t.apellidos].filter(Boolean).join(' ') || form.direccion || obra.numero_expediente || 'Obra';
    const direccion = [form.direccion, [form.codigo_postal, form.municipio].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    const generar = (extra = {}) => (
        <Generar obra={obra} form={form} slots={slots} guardar={o.guardar} onIr={irAPaso}
            onHecho={() => o.cargar({ silencioso: true })} {...extra} />
    );

    // ── Móvil: una pregunta ──────────────────────────────────────────────────
    if (preguntaAbierta) {
        const { paso, p } = rec[idx];
        const delPaso = rec.filter(r => r.paso.id === paso.id);
        const nEnPaso = delPaso.findIndex(r => r.id === qid) + 1;
        const hecha = contestada(p, form);
        const ultima = idx === rec.length - 1;
        const esFotos = p.tipo === 'fotos';
        return (
            <div className="ca-col ca-q">
                <div className="ca-q-top">
                    <button type="button" className="ca-icobtn" onClick={() => alInicio()} aria-label="Volver al resumen de la obra"><IcoAtras /></button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <p className="ca-eyebrow" style={{ margin: 0 }}>{paso.titulo}{delPaso.length > 1 ? ` · ${nEnPaso} de ${delPaso.length}` : ''}</p>
                        <div className="ca-barra" style={{ marginTop: 6 }}><i style={{ width: `${Math.round(100 * (idx + 1) / rec.length)}%` }} /></div>
                    </div>
                    <Guardado g={o.guardado} onReintentar={o.guardar} />
                </div>
                <div className="ca-q-cuerpo ca-in" key={qid}>
                    {esFotos
                        ? <><h2 className="ca-display ca-pregunta">Fotos y documentos</h2><div style={{ marginTop: 16 }}><FotosObra ctx={ctx} obraId={id} /></div></>
                        : <Pregunta p={p} ctx={ctx} pasoId={paso.id} grande onElegido={['opciones', 'sino', 'chips'].includes(p.tipo) ? alElegir : undefined} />}
                </div>
                <div className="ca-inf">
                    <div className="ca-inf-in">
                        <button type="button" className="ca-btn ca-btn-sec" onClick={() => irIdx(idx - 1)} aria-label="Pregunta anterior"><IcoAtras /></button>
                        <button type="button" className="ca-btn ca-btn-pri" onClick={() => irIdx(idx + 1)}>
                            {ultima ? <>Terminar <IcoCheck /></> : (!hecha && p.k) ? <>Saltar <IcoFlecha /></> : <>Siguiente <IcoFlecha /></>}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ── Móvil: el inicio de la obra ──────────────────────────────────────────
    if (movil) {
        const empezada = rec.some(r => r.p.k && contestada(r.p, form) && r.p.k !== 'proposito');
        return (
            <div className="ca-col">
                <section className="ca-card ca-pad ca-in">
                    <div className="ca-filete" />
                    <div className="ca-fila-top">
                        <p className="ca-eyebrow" style={{ margin: 0 }}>{obra.numero_expediente || 'Obra nueva'}</p>
                        <Guardado g={o.guardado} onReintentar={o.guardar} />
                    </div>
                    <h1 className="ca-display ca-h2" style={{ marginTop: 8 }}>{titulo}</h1>
                    {direccion && <p className="ca-sub" style={{ marginTop: 4 }}>{direccion}</p>}
                    <div className="ca-avance" style={{ marginTop: 18 }}><b>{pct}%</b><span>del cuestionario</span></div>
                    <div className="ca-barra" style={{ marginTop: 10 }}><i style={{ width: `${pct}%` }} /></div>
                    <div className="ca-btns">
                        {b.listo
                            ? generar()
                            : <button type="button" className="ca-btn ca-btn-pri" onClick={continuar}>{empezada ? 'Continuar' : 'Empezar'} <IcoFlecha /></button>}
                    </div>
                    {b.listo && (
                        <button type="button" className="ca-link ca-link-gris" style={{ marginTop: 12 }} onClick={continuar}>Seguir completando</button>
                    )}
                    {!b.listo && b.bloqueantes.length > 0 && (
                        <p className="ca-peq" style={{ marginTop: 12 }}>
                            Para pedir el certificado faltan {b.bloqueantes.length} {b.bloqueantes.length === 1 ? 'cosa' : 'cosas'}: te las marcamos abajo.
                        </p>
                    )}
                </section>
                <h2 className="ca-sec">Los pasos</h2>
                <ListaPasos estados={estados} onPaso={irAPaso} />
                {!b.listo && <div className="ca-btns" style={{ marginTop: 16 }}>{generar({ className: 'ca-btn ca-btn-sec' })}</div>}
                <p className="ca-peq" style={{ textAlign: 'center', marginTop: 18 }}>Se guarda solo mientras rellenas.</p>
            </div>
        );
    }

    // ── Ordenador: secciones y lateral ───────────────────────────────────────
    return (
        <div className="ca-col-ancha">
            <header className="ca-ficha-cab ca-in">
                <div>
                    <p className="ca-eyebrow" style={{ margin: 0 }}>{obra.numero_expediente || 'Obra nueva'} · <span className={`ca-chip ${estadoDe(obra.estado).chip}`}>{estadoDe(obra.estado).label}</span></p>
                    <h1 className="ca-display ca-h1" style={{ margin: '8px 0 0' }}>{titulo}</h1>
                    {direccion && <p className="ca-sub" style={{ marginTop: 6 }}>{direccion}</p>}
                </div>
                <Guardado g={o.guardado} onReintentar={o.guardar} />
            </header>

            <div className="ca-ficha">
                <div className="ca-stack">
                    {PASOS.map((paso, i) => {
                        const vis = preguntasVisibles(paso, form);
                        const est = estados[paso.id] || {};
                        return (
                            <section key={paso.id} id={`paso-${paso.id}`} className={`ca-card ca-pad ca-paso-card${resaltado === paso.id ? ' ca-resaltado' : ''}`}>
                                <div className="ca-fila-top">
                                    <div className="ca-paso-cab">
                                        <span className="ca-num3">{i + 1}</span>
                                        <div>
                                            <h2 className="ca-display ca-h3" style={{ margin: 0 }}>{paso.titulo}</h2>
                                            <small className="ca-peq">{paso.sub}</small>
                                        </div>
                                    </div>
                                    <ChipPaso e={est.e} />
                                </div>
                                {est.bloq?.length > 0 && (
                                    <div className="ca-aviso ca-aviso-fuerte" style={{ marginTop: 14 }}>
                                        <span className="ca-ico-tile">!</span>
                                        <div>{est.bloq.map(x => <div key={x.id}>{x.texto}</div>)}</div>
                                    </div>
                                )}
                                <div style={{ marginTop: 18 }}>
                                    {paso.id === 'fotos'
                                        ? <FotosObra ctx={ctx} obraId={id} />
                                        : vis.map((p, j) => (
                                            <div key={p.k || p.tipo}>
                                                {j > 0 && <hr className="ca-sep" />}
                                                <Pregunta p={p} ctx={ctx} pasoId={paso.id} />
                                            </div>
                                        ))}
                                </div>
                            </section>
                        );
                    })}
                </div>

                <aside className="ca-lateral">
                    <section className="ca-card ca-pad">
                        <div className="ca-filete" />
                        <div className="ca-avance"><b>{pct}%</b><span>del cuestionario</span></div>
                        <div className="ca-barra" style={{ marginTop: 10 }}><i style={{ width: `${pct}%` }} /></div>
                        <div className="ca-btns">{generar()}</div>
                        <p className="ca-peq" style={{ marginTop: 10 }}>
                            {b.listo ? 'Ya se puede pedir. Antes te enseñamos lo que conviene completar.' : `Para pedirlo faltan ${b.bloqueantes.length} ${b.bloqueantes.length === 1 ? 'cosa' : 'cosas'}.`}
                        </p>
                    </section>
                    <h2 className="ca-sec" style={{ marginTop: 18 }}>Los pasos</h2>
                    <ListaPasos estados={estados} onPaso={irAPaso} activo={resaltado} />
                    {resumen.length > 0 && (
                        <details className="ca-card ca-pad ca-resumen" style={{ marginTop: 14 }}>
                            <summary>Lo que va a leer la IA</summary>
                            <dl className="ca-dl" style={{ marginTop: 10 }}>
                                {resumen.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
                            </dl>
                        </details>
                    )}
                    <p className="ca-peq" style={{ textAlign: 'center', marginTop: 14 }}>
                        Se guarda solo. <button type="button" className="ca-link ca-link-gris" onClick={() => o.cargar({ silencioso: true })}><IcoRecargar size={13} /> Recargar</button>
                    </p>
                    <p className="ca-peq" style={{ textAlign: 'center' }}><Enlace to="/panel" className="ca-link ca-link-gris">Volver a mis obras</Enlace></p>
                </aside>
            </div>
        </div>
    );
}

export { PASO_POR_ID };
