// ─── AsistenteView — «Tu asistente», el chat del instalador (fase 6) ─────────
// Fran (22/11/2026): «que se pueda hacer por WhatsApp el presupuesto o a través del
// asistente de la app… debe ser un asistente real, que sea listo y nos vaya adelantando
// cosas, no dando más trabajo, con botones rápidos».
//
// Lo que hace la pantalla (el cerebro está en el servidor, services/asistenteInstalador.js):
//  · Al abrirla, «Te lo he dejado preparado»: lo que le toca (firmar, RITE, factura) y
//    los presupuestos sin bono, cada uno con SU botón. Lo calcula el CÓDIGO, no el modelo.
//  · Se le escribe o se le DICTA (la nota se pasa a WAV aquí y la transcribe el servidor).
//  · La respuesta llega a trozos (NDJSON). Las tarjetas (un presupuesto hecho, una obra)
//    llevan los botones de siempre: «Envíamelo por WhatsApp» es el MISMO de la ficha.
//  · Las sugerencias (chips) son las líneas `>> a | b` del modelo: un toque = esa frase.
//  · La conversación vive en la MEMORIA de la app (`guardado`, un ref de AppInstalador):
//    sobrevive a abrir una obra y volver, pero no a recargar. Nada en el navegador.
import React, { useEffect, useRef, useState } from 'react';
import mascota from '../../../assets/mascota-gota.webp';
import { Icono, iconoDeTarea, eur, BarraPasos, ChipQuien, Esqueleto, AvisoError } from '../ui/piezas';
import { useGuardado } from './PresupuestoForm';
import { aWav, grabadoraDisponible } from '../logic/audioWav';
import { fundirMemoria, historialPara } from '../logic/asistente';

const MAX_SEG = 120;
let SEQ = 0;
const nuevoId = () => `m${Date.now().toString(36)}${(SEQ++).toString(36)}`;

/** «**negrita**» y párrafos; nada de HTML. */
function Texto({ texto }) {
    const parrafos = String(texto || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    return parrafos.map((p, i) => (
        <p key={i}>
            {p.split('\n').map((l, j) => (
                <React.Fragment key={j}>
                    {j > 0 && <br />}
                    {l.split(/(\*\*[^*]+\*\*)/g).map((t, k) => (t.startsWith('**') && t.endsWith('**') && t.length > 4
                        ? <b key={k}>{t.slice(2, -2)}</b> : <React.Fragment key={k}>{t}</React.Fragment>))}
                </React.Fragment>
            ))}
        </p>
    ));
}

/** «te he adelantado 3 cosas» → con el número resaltado en lima. */
function TextoPreparado({ texto }) {
    const partes = String(texto || '').split(/(\d+ cosas?)/);
    return <p>{partes.map((t, i) => (/^\d+ cosas?$/.test(t) ? <span key={i} className="ia-mark"><b>{t}</b></span> : t))}</p>;
}

const ICONO_COSA = (c) => (c.tipo === 'bono' ? 'chispa' : iconoDeTarea(c.accion));

/** «Te lo he dejado preparado»: cada cosa con su botón (el primero, naranja). */
function Preparado({ prep, onCosa, onVerObras, ocupado }) {
    if (!prep?.cosas?.length) return null;
    return (
        <section className="ia-card lista ia-asi-prep" aria-labelledby="ia-asi-prep-tit">
            <p id="ia-asi-prep-tit" className="ia-eyebrow n" style={{ padding: '0 12px 6px' }}>Te lo he dejado preparado</p>
            {prep.cosas.map((c, i) => (
                <div key={c.clave} className={`ia-asi-cosa${i === 0 ? ' primera' : ''}`}>
                    <span className="ia-baldosa"><Icono n={ICONO_COSA(c)} size={22} /></span>
                    <span className="ia-fila-txt">
                        <b>{c.que}</b>
                        {c.por && <span>{c.por}</span>}
                    </span>
                    <button type="button" className={`ia-btn ia-btn-peq ${i === 0 ? 'ia-btn-pri' : 'ia-btn-sec'}`}
                        disabled={ocupado === c.clave} onClick={() => onCosa(c)}>
                        {ocupado === c.clave ? 'Abriendo…' : c.boton}
                    </button>
                </div>
            ))}
            {prep.mas > 0 && onVerObras && (
                <button type="button" className="ia-ver-todas" onClick={onVerObras}>
                    Y {prep.mas} {prep.mas === 1 ? 'cosa más' : 'cosas más'} en tus obras <Icono n="chevron" size={20} className="ia-chev" />
                </button>
            )}
        </section>
    );
}

function Chips({ opciones, onElegir, deshabilitado }) {
    if (!opciones?.length) return null;
    return (
        <div className="ia-asi-chips" role="group" aria-label="Respuestas rápidas">
            {opciones.map((o) => (
                <button key={o} type="button" className="ia-asi-chip" disabled={deshabilitado} onClick={() => onElegir(o)}>{o}</button>
            ))}
        </div>
    );
}

// ── Las tarjetas que pinta el servidor ───────────────────────────────────────
const BOTON_TAREA = { cifo: 'Firmar ahora', rite: 'Subir el RITE', factura: 'Hacer la factura', propuesta: 'Pasársela por WhatsApp' };

function TarjetaPresupuesto({ t, api, onAbrir, onBono }) {
    const p = t.presupuesto || {};
    const guardado = useGuardado();
    const [aviso, setAviso] = useState(null);
    const [wa, setWa] = useState(false);
    const [bono, setBono] = useState(false);
    const mandar = async () => {
        setAviso(null);
        try {
            await guardado.correr(
                { enviando: 'Mandándotelo a tu WhatsApp…', ok: '¡Te lo hemos mandado!', icon: 'send' },
                () => api.presupuestoWhatsapp(p.id),
                {
                    subtitulo: (x) => `Míralo en tu WhatsApp${x?.a ? ` (${x.a})` : ''} y reenvíaselo tal cual a tu cliente.`,
                    alCampo: (e) => {
                        if (e?.response?.data?.code !== 'WHATSAPP_NO_DISPONIBLE' && e?.response?.status !== 409) return false;
                        setAviso(e?.response?.data?.error || 'Ahora mismo no te lo podemos mandar por WhatsApp. Ábrelo y descárgalo.');
                        return true;
                    },
                },
            );
            setWa(true);
        } catch { /* el popup o el aviso ya lo cuentan */ }
    };
    const calcular = async () => {
        setAviso(null);
        setBono(true);
        try { await onBono(p.id); } catch { setAviso('No he podido abrir el cálculo. Ábrelo desde el presupuesto.'); } finally { setBono(false); }
    };
    // Con la casa y el bono en marcha debajo (PasoCasa), el botón del bono lo lleva esa tarjeta.
    const sinBono = !p.simulacion && !p.id_oportunidad && (!t.ver_casa || t.casa?.fase === 'no');
    return (
        <section className="ia-card ia-asi-tarjeta">
            <div className="ia-asi-tarjeta-cab">
                <span className="ia-baldosa"><Icono n="factura" size={22} /></span>
                <div>
                    <p className="ia-eyebrow n">{t.actualizado ? 'Presupuesto cambiado' : 'Presupuesto hecho'}</p>
                    <b>Nº {p.numero}{p.cliente ? ` · ${p.cliente}` : ''}</b>
                    {(p.municipio || p.cliente_creado) && (
                        <span>{[p.municipio, p.cliente_creado ? 'cliente nuevo, dado de alta' : null].filter(Boolean).join(' · ')}</span>
                    )}
                </div>
            </div>
            {p.resumen && <p className="ia-asi-resumen">{p.resumen}</p>}
            <div className="ia-asi-total">
                <span>Total{p.iva_pct != null ? ` con IVA (${p.iva_pct} %)` : ''}</span>
                <b className="ia-display">{eur(p.total)}</b>
            </div>
            {p.base != null && <p className="ia-asi-base">Base {eur(p.base)}</p>}
            {aviso && <div className="ia-aviso tu" role="status">{aviso}</div>}
            <div className="ia-asi-bts">
                <button type="button" className="ia-btn ia-btn-pri" onClick={mandar}>
                    <Icono n="whatsapp" size={22} /> {wa ? 'Mandármelo otra vez' : 'Envíamelo por WhatsApp'}
                </button>
                <button type="button" className="ia-btn ia-btn-sec" onClick={() => onAbrir(p.id)}>
                    <Icono n="factura" size={20} /> Ver el presupuesto
                </button>
                {sinBono && onBono && (
                    <button type="button" className="ia-btn ia-btn-sec" onClick={calcular} disabled={bono}>
                        <Icono n="chispa" size={20} /> {bono ? 'Abriendo…' : 'Calcular el bono CAE'}
                    </button>
                )}
            </div>
            {guardado.overlay}
        </section>
    );
}

// ── La CASA y el BONO, tras el presupuesto (23/11/2026) ──────────────────────
// Fran: «tras el PDF, la fachada del Catastro: ¿es esta la casa? Con el sí, la referencia queda en
// el presupuesto. Después, ¿te calculo el bono? Y solo lo que falte, con botones». Lo decide el
// servidor (`/asistente/paso`, el MISMO motor que el grupo de WhatsApp); aquí solo se pinta, y el
// estado vive en la propia tarjeta (`t.casa`), así sobrevive a abrir una obra y volver.
const empezadas = new Set();      // una búsqueda por tarjeta, también con el doble montaje de React

function PasoCasa({ t, api, onCambiar, onBono }) {
    const p = t.presupuesto || {};
    const casa = t.casa || { fase: 'buscando' };
    const [otro, setOtro] = useState(false);
    const [valor, setValor] = useState('');
    const [ocupado, setOcupado] = useState(null);
    const [fallo, setFallo] = useState(null);
    const [sinFoto, setSinFoto] = useState(false);
    const ultima = useRef(null);

    const pedir = async (cuerpo, clave) => {
        ultima.current = { cuerpo, clave };
        setFallo(null);
        setOcupado(clave);
        try {
            const r = await api.asistentePaso({ presupuesto_id: p.id, dichas: casa.dichas || t.dichas || {}, ...cuerpo });
            setOtro(false); setValor(''); setSinFoto(false);
            onCambiar((x) => ({ ...x, casa: r.casa, ...(r.tarjeta ? { presupuesto: r.tarjeta.presupuesto, actualizado: true } : {}) }));
        } catch (e) {
            setFallo(e?.response?.data?.error || (e?.response ? 'No he podido hacerlo.' : 'Sin conexión.'));
        } finally { setOcupado(null); }
    };
    useEffect(() => {
        if (t.casa || empezadas.has(t.k)) return;
        empezadas.add(t.k);
        pedir({ accion: 'buscar' }, 'buscar');
    }, [t.k]); // eslint-disable-line react-hooks/exhaustive-deps

    const buscarOtro = (ev) => {
        ev.preventDefault();
        const v = valor.trim().toUpperCase().replace(/\s+/g, '');
        if (!v) return;
        pedir(/^[0-9A-Z]{14,}$/.test(v) && /[A-Z]/.test(v) ? { accion: 'buscar', rc: v } : { accion: 'buscar', numero: v }, 'otro');
    };
    const local = (fase) => onCambiar((x) => ({ ...x, casa: { ...casa, fase, aviso: null } }));
    const abrirBono = async () => {
        setFallo(null); setOcupado('abrir');
        try { await onBono(p.id); } catch { setFallo('No he podido abrir el cálculo. Ábrelo desde el presupuesto.'); } finally { setOcupado(null); }
    };

    const vs = casa.viviendas || [];
    const cab = (eyebrow, titulo) => (
        <div className="ia-asi-tarjeta-cab">
            <span className="ia-baldosa"><Icono n={casa.fase === 'vivienda' ? 'inicio' : 'chispa'} size={22} /></span>
            <div><p className="ia-eyebrow n">{eyebrow}</p><b>{titulo}</b></div>
        </div>
    );
    const formOtro = (
        <form className="ia-asi-otro" onSubmit={buscarOtro}>
            <label>
                <span>El número de la calle o la referencia catastral</span>
                <input type="text" value={valor} onChange={(e) => setValor(e.target.value)} maxLength={24} autoComplete="off"
                    inputMode="text" placeholder="Ej.: 4  ·  1234567VJ0002N0001AB" autoFocus />
            </label>
            <button type="submit" className="ia-btn ia-btn-pri" disabled={!valor.trim() || !!ocupado}>
                {ocupado === 'otro' ? 'Buscando…' : 'Buscar'}
            </button>
        </form>
    );
    const avisos = (
        <>
            {casa.aviso && <p className="ia-asi-resumen">{casa.aviso}</p>}
            {fallo && (
                <div className="ia-aviso tu" role="status">
                    {fallo}{' '}
                    {ultima.current && <button type="button" className="ia-asi-enlace" onClick={() => pedir(ultima.current.cuerpo, ultima.current.clave)}>Volver a intentarlo</button>}
                </div>
            )}
        </>
    );

    if (casa.fase === 'buscando') {
        return (
            <section className="ia-card ia-asi-tarjeta ia-asi-casa" aria-busy={!fallo}>
                {cab('La casa', 'Buscándola en el Catastro…')}
                {!fallo && <Esqueleto alto={120} n={1} />}
                {avisos}
                {fallo && <div className="ia-asi-bts"><button type="button" className="ia-btn ia-btn-sec" onClick={() => local('bono')}>Seguir sin la casa</button></div>}
            </section>
        );
    }

    if (casa.fase === 'vivienda') {
        const una = vs.length === 1 ? vs[0] : null;
        return (
            <section className="ia-card ia-asi-tarjeta ia-asi-casa">
                {cab('La casa', una ? '¿Es esta la casa?' : vs.length ? `¿Cuál de estas ${vs.length} viviendas es?` : 'No la encuentro')}
                {casa.foto_rc && !sinFoto && (
                    <img className="ia-asi-fachada" src={api.fotoCasa(casa.foto_rc)} alt="Fachada según el Catastro" onError={() => setSinFoto(true)} />
                )}
                {una && <p className="ia-asi-resumen"><b>Según el Catastro:</b> {una.texto}</p>}
                {!una && vs.length > 0 && casa.donde && <p className="ia-asi-resumen">En {casa.donde}:</p>}
                {avisos}
                {una && !otro && (
                    <div className="ia-asi-bts">
                        <button type="button" className="ia-btn ia-btn-pri" disabled={!!ocupado} onClick={() => pedir({ accion: 'confirmar', rc: una.rc }, 'si')}>
                            <Icono n="ok" size={20} /> {ocupado === 'si' ? 'Apuntándola…' : 'Sí, es esta'}
                        </button>
                        <button type="button" className="ia-btn ia-btn-sec" disabled={!!ocupado} onClick={() => setOtro(true)}>Es otro número</button>
                    </div>
                )}
                {!una && vs.length > 0 && (
                    <div className="ia-asi-opciones" role="group" aria-label="Las viviendas">
                        {vs.map((v) => (
                            <button key={v.rc} type="button" className="ia-asi-opcion" disabled={!!ocupado} onClick={() => pedir({ accion: 'confirmar', rc: v.rc }, v.rc)}>
                                {ocupado === v.rc ? 'Apuntándola…' : v.linea}
                            </button>
                        ))}
                        {!otro && <button type="button" className="ia-asi-opcion sec" disabled={!!ocupado} onClick={() => setOtro(true)}>Es otro número</button>}
                    </div>
                )}
                {(otro || !vs.length) && formOtro}
                {!vs.length && (
                    <div className="ia-asi-bts"><button type="button" className="ia-btn ia-btn-sec" onClick={() => local('bono')}>Seguir sin la casa</button></div>
                )}
            </section>
        );
    }

    if (casa.fase === 'bono') {
        return (
            <section className="ia-card ia-asi-tarjeta ia-asi-casa">
                {cab('El bono', '¿Te calculo el bono energético (CAE) de esta obra?')}
                {avisos}
                <div className="ia-asi-bts">
                    <button type="button" className="ia-btn ia-btn-pri" disabled={!!ocupado} onClick={() => pedir({ accion: 'bono', respuestas: {} }, 'bono')}>
                        <Icono n="chispa" size={20} /> {ocupado === 'bono' ? 'Un momento…' : 'Sí, calcúlamelo'}
                    </button>
                    <button type="button" className="ia-btn ia-btn-sec" disabled={!!ocupado} onClick={() => local('no')}>Ahora no</button>
                </div>
            </section>
        );
    }

    if (casa.fase === 'pregunta') {
        return (
            <section className="ia-card ia-asi-tarjeta ia-asi-casa">
                {cab('Para el bono', casa.texto)}
                {avisos}
                <div className="ia-asi-opciones" role="group" aria-label={casa.texto}>
                    {(casa.opciones || []).map((o) => (
                        <button key={String(o.valor)} type="button" className="ia-asi-opcion" disabled={!!ocupado}
                            onClick={() => pedir({ accion: 'bono', respuestas: { ...(casa.respuestas || {}), [casa.pregunta]: o.valor } }, String(o.valor))}>
                            {ocupado === String(o.valor) ? 'Un momento…' : o.texto}
                        </button>
                    ))}
                </div>
            </section>
        );
    }

    if (casa.fase === 'listo') {
        return (
            <section className="ia-card ia-asi-tarjeta ia-asi-casa">
                {cab('El bono', 'Listo para calcularlo')}
                <p className="ia-asi-resumen">{casa.resumen}{casa.rc ? ` · referencia ${casa.rc}` : ''}</p>
                {t.actualizado && <p className="ia-asi-resumen">Lo he puesto también en el presupuesto: mándatelo otra vez si ya se lo habías pasado.</p>}
                {avisos}
                <div className="ia-asi-bts">
                    <button type="button" className="ia-btn ia-btn-pri" disabled={!!ocupado} onClick={abrirBono}>
                        <Icono n="chispa" size={20} /> {ocupado === 'abrir' ? 'Abriendo…' : 'Calcular el bono CAE'}
                    </button>
                </div>
            </section>
        );
    }

    // «Ahora no»: el botón del bono vuelve a la tarjeta del presupuesto.
    return <p className="ia-asi-otra">Vale. Si luego quieres el bono, lo tienes en el presupuesto.</p>;
}

function TarjetaObra({ t, onTarea, onAbrirObra }) {
    const o = t.obra || {};
    const filas = [
        { tono: 'tu', titulo: 'Te toca', items: o.te_toca },
        { tono: 'nos', titulo: 'Lo llevamos nosotros', items: o.nosotros },
        { tono: 'ok', titulo: 'Hecho', items: o.hecho },
    ].filter((f) => f.items?.length);
    return (
        <section className="ia-card ia-asi-tarjeta">
            <div className="ia-asi-tarjeta-cab">
                <span className="ia-baldosa"><Icono n="obras" size={22} /></span>
                <div>
                    <p className="ia-eyebrow">{o.expediente || o.id}</p>
                    <b>{o.cliente || 'Tu obra'}</b>
                    {o.municipio && <span>{o.municipio}</span>}
                </div>
                <ChipQuien quien={o.quien} />
            </div>
            <BarraPasos paso={o.paso} etiquetas />
            {filas.length > 0 && (
                <div className="ia-asi-filas">
                    {filas.map((f) => (
                        <div key={f.tono} className={`ia-asi-fila ${f.tono}`}>
                            <span>{f.titulo}</span>
                            <b>{f.items.join(' · ')}</b>
                        </div>
                    ))}
                </div>
            )}
            <div className="ia-asi-bts">
                {(o.tareas || []).map((x, i) => (
                    <button key={x.key} type="button" className={`ia-btn ${i === 0 ? 'ia-btn-pri' : 'ia-btn-sec'}`} onClick={() => onTarea(o.id, x)}>
                        <Icono n={iconoDeTarea(x.key)} size={20} /> {BOTON_TAREA[x.key] || x.que}
                    </button>
                ))}
                <button type="button" className="ia-btn ia-btn-sec" onClick={() => onAbrirObra(o.id)}>
                    <Icono n="obras" size={20} /> Ver la obra
                </button>
            </div>
        </section>
    );
}

// ── La pantalla ──────────────────────────────────────────────────────────────
/**
 * guardado: ref de AppInstalador ({ mensajes, memoria }) para que la charla siga al volver.
 * onAbrirAccion(obra, destino) · onAbrirObra(id) · onAbrirPresupuesto(id) · onBono(idPresupuesto) → Promise
 * dictar: abrirla grabando (el botón «Dictar» de Inicio); onDictado() lo consume.
 */
export function AsistenteView({
    api, obras = [], guardado = null, dictar = false, onDictado,
    onVolver, onAbrirAccion, onAbrirObra, onAbrirPresupuesto, onBono = null, onVerObras = null,
}) {
    const [prep, setPrep] = useState(null);          // lo preparado ({ saludo, texto, cosas, mas, sugerencias })
    const [prepError, setPrepError] = useState(null); // null | 'off' | 'red'
    const [prepN, setPrepN] = useState(0);
    const [mensajes, setMensajes] = useState(() => guardado?.current?.mensajes || []);
    const [memoria, setMemoria] = useState(() => guardado?.current?.memoria || {});
    const [texto, setTexto] = useState('');
    const [enCurso, setEnCurso] = useState(false);
    const [grabando, setGrabando] = useState(false);
    const [segundos, setSegundos] = useState(0);
    const [transcribiendo, setTranscribiendo] = useState(false);
    const [aviso, setAviso] = useState(null);
    const [ocupado, setOcupado] = useState(null);
    const corte = useRef(null);
    const rec = useRef(null);
    const reloj = useRef(null);
    const fin = useRef(null);
    const enviarRef = useRef(null);
    const puedeGrabar = grabadoraDisponible();

    // Lo preparado se pide cada vez que se abre (y al empezar de cero).
    useEffect(() => {
        let vivo = true;
        setPrepError(null);
        api.asistente().then((r) => { if (vivo) setPrep(r || {}); })
            .catch((e) => { if (vivo) setPrepError(e?.response?.status === 403 ? 'off' : 'red'); });
        return () => { vivo = false; };
    }, [api, prepN]);

    // La charla se guarda en la memoria de la app (no en el navegador).
    useEffect(() => { if (guardado) guardado.current = { mensajes, memoria }; }, [guardado, mensajes, memoria]);

    // Al salir: se corta lo que esté llegando y se suelta el micrófono.
    useEffect(() => () => {
        corte.current?.abort();
        try { rec.current?.stream?.getTracks?.().forEach((t) => t.stop()); } catch { /* */ }
        clearInterval(reloj.current);
    }, []);

    // Lo último, a la vista.
    // El que se desplaza es <main> (el compositor va pegado abajo dentro de él): hasta el fondo.
    useEffect(() => {
        if (!mensajes.length) return;
        const m = document.getElementById('ia-main');
        if (m?.scrollTo) m.scrollTo({ top: m.scrollHeight, behavior: 'smooth' });
        else fin.current?.scrollIntoView?.({ block: 'end' });
    }, [mensajes, enCurso]);

    const enviar = async (crudo) => {
        const t = String(crudo || '').trim();
        if (!t || enCurso) return;
        setTexto('');
        setAviso(null);
        const yo = { id: nuevoId(), role: 'user', texto: t };
        const el = { id: nuevoId(), role: 'assistant', texto: '', tarjetas: [], opciones: [], paso: null, error: null };
        const hist = [...mensajes, yo];
        setMensajes([...hist, el]);
        setEnCurso(true);
        const ctrl = new AbortController();
        corte.current = ctrl;
        let mem = memoria;
        const toca = (fn) => setMensajes((ms) => ms.map((m) => (m.id === el.id ? fn(m) : m)));
        try {
            await api.asistenteMensaje({ mensajes: historialPara(hist), memoria: mem }, {
                signal: ctrl.signal,
                onEvento: (ev) => {
                    if (ev.t === 'texto') toca((m) => ({ ...m, texto: m.texto + (ev.d || ''), paso: null }));
                    else if (ev.t === 'paso') toca((m) => ({ ...m, paso: ev.texto }));
                    else if (ev.t === 'tarjeta' && ev.tarjeta) toca((m) => ({ ...m, tarjetas: [...m.tarjetas, { ...ev.tarjeta, k: nuevoId() }] }));
                    else if (ev.t === 'memoria') { mem = fundirMemoria(mem, ev.memoria); setMemoria(mem); }
                    else if (ev.t === 'sugerencias') toca((m) => ({ ...m, opciones: ev.opciones || [] }));
                    else if (ev.t === 'error') toca((m) => ({ ...m, error: ev.mensaje || 'No he podido contestarte.' }));
                },
            });
        } catch (e) {
            if (e?.name === 'AbortError') toca((m) => ({ ...m, cortado: true }));
            else toca((m) => ({ ...m, error: e?.status ? (e.message || 'No he podido contestarte.') : 'Sin conexión: escríbemelo otra vez cuando vuelva la cobertura.' }));
        } finally {
            if (corte.current === ctrl) corte.current = null;
            toca((m) => ({ ...m, paso: null }));
            setEnCurso(false);
        }
    };
    enviarRef.current = enviar;

    const pararGrabacion = () => { try { rec.current?.stop(); } catch { /* */ } };
    const grabar = async () => {
        if (grabando) { pararGrabacion(); return; }
        if (enCurso || transcribiendo) return;
        setAviso(null);
        let stream;
        try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch {
            setAviso('No puedo usar el micrófono: dale permiso en el navegador y vuelve a probar. O escríbemelo.');
            return;
        }
        const trozos = [];
        let mr;
        try { mr = new MediaRecorder(stream); } catch {
            stream.getTracks().forEach((x) => x.stop());
            setAviso('Este navegador no deja grabar audio. Escríbemelo.');
            return;
        }
        mr.ondataavailable = (ev) => { if (ev.data?.size) trozos.push(ev.data); };
        mr.onstop = async () => {
            stream.getTracks().forEach((x) => x.stop());
            clearInterval(reloj.current);
            setGrabando(false);
            rec.current = null;
            const blob = new Blob(trozos, { type: mr.mimeType || 'audio/webm' });
            if (blob.size < 1500) { setAviso('No te he oído. Mantén el móvil cerca y vuelve a probar.'); return; }
            setTranscribiendo(true);
            try {
                const wav = await aWav(blob);
                const r = await api.asistenteAudio(wav);
                const t = String(r?.texto || '').trim();
                if (t) enviarRef.current?.(t); else setAviso('No he entendido el audio. Vuelve a probar o escríbemelo.');
            } catch {
                setAviso('No he podido pasar el audio a texto. Vuelve a probar o escríbemelo.');
            } finally { setTranscribiendo(false); }
        };
        rec.current = mr;
        mr.start();
        setSegundos(0);
        setGrabando(true);
        const empezo = Date.now();
        clearInterval(reloj.current);
        reloj.current = setInterval(() => {
            const s = Math.floor((Date.now() - empezo) / 1000);
            setSegundos(s);
            if (s >= MAX_SEG) pararGrabacion();
        }, 250);
    };

    // «Dictar» desde Inicio: se abre grabando (una vez).
    useEffect(() => {
        if (!dictar) return;
        onDictado?.();
        if (puedeGrabar) grabar();
    }, [dictar]); // eslint-disable-line react-hooks/exhaustive-deps

    const deCero = () => {
        corte.current?.abort();
        setMensajes([]);
        setMemoria({});
        setAviso(null);
        setPrepN((n) => n + 1);
    };

    // Una tarjeta cambia su propio estado (la casa y el bono), dentro de su mensaje.
    const cambiarTarjeta = (idMensaje, k, fn) => setMensajes((ms) => ms.map((m) => (m.id !== idMensaje ? m
        : { ...m, tarjetas: m.tarjetas.map((x) => (x.k === k ? fn(x) : x)) })));

    const obraDe = (id) => obras.find((x) => x.id === id || x.numero_expediente === id) || null;
    const tarea = (idObra, t) => {
        const o = obraDe(idObra);
        if (!o) { onAbrirObra?.(idObra); return; }
        onAbrirAccion?.(o, { tipo: 'accion', accion: t.accion, modo: t.modo || null });
    };
    const cosa = async (c) => {
        if (c.tipo === 'tarea') { tarea(c.obra, c); return; }
        if (c.tipo === 'bono' && onBono) {
            setOcupado(c.clave);
            try { await onBono(c.presupuesto); } catch { setAviso('No he podido abrir el cálculo. Ábrelo desde el presupuesto.'); } finally { setOcupado(null); }
        }
    };

    const ultimo = mensajes[mensajes.length - 1];
    const chips = enCurso ? [] : mensajes.length ? (ultimo?.role === 'assistant' ? ultimo.opciones : []) : (prep?.sugerencias || []);
    const ocupadoMic = enCurso || transcribiendo;
    const conTexto = texto.trim().length > 0;
    const mmss = `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, '0')}`;

    if (prepError === 'off') {
        return (
            <div className="ia-pagina estrecha">
                <Cabecera onVolver={onVolver} />
                <section className="ia-card"><div className="ia-vacio">
                    <span className="ia-baldosa"><Icono n="chat" size={22} /></span>
                    <b>El asistente no está disponible ahora mismo</b>
                    <p>Lo puedes hacer todo desde las pantallas de la app. En cuanto vuelva, lo tienes aquí.</p>
                </div></section>
            </div>
        );
    }

    const bienvenida = (
        <div className="ia-asi-yo-no">
            <img className="ia-asi-cara" src={mascota} alt="" />
            <div className="ia-asi-burbuja el">
                {prep ? (
                    <>
                        <p className="ia-asi-saludo ia-display">{prep.saludo}</p>
                        <TextoPreparado texto={prep.texto} />
                    </>
                ) : prepError ? <p>Escríbeme o mándame un audio: un presupuesto, cómo va una obra, el precio de un equipo…</p>
                    : <p className="ia-asi-pensando">Mirando tus obras<span>.</span><span>.</span><span>.</span></p>}
            </div>
        </div>
    );

    return (
        <div className="ia-asi">
            <Cabecera onVolver={onVolver} onDeCero={mensajes.length ? deCero : null} />
            <div className="ia-asi-dos">
                <div className="ia-asi-chat" aria-live="polite">
                    {bienvenida}
                    <div className="ia-asi-solo-movil">
                        {prep ? <Preparado prep={prep} onCosa={cosa} onVerObras={onVerObras} ocupado={ocupado} />
                            : !prepError && <Esqueleto alto={150} n={1} />}
                        {prepError === 'red' && <AvisoError texto="No he podido mirar tus obras ahora." onReintentar={() => setPrepN((n) => n + 1)} />}
                    </div>
                    {mensajes.map((m) => (m.role === 'user' ? (
                        <div key={m.id} className="ia-asi-burbuja yo">{m.texto}</div>
                    ) : (
                        <div key={m.id} className="ia-asi-turno">
                            {(m.texto || m.paso || m.error || !m.tarjetas.length) && (
                                <div className="ia-asi-yo-no">
                                    <img className="ia-asi-cara" src={mascota} alt="" />
                                    <div className="ia-asi-burbuja el">
                                        {m.texto && <Texto texto={m.texto} />}
                                        {m.paso && <p className="ia-asi-paso">{m.paso}</p>}
                                        {!m.texto && !m.paso && !m.error && !m.cortado && <p className="ia-asi-pensando">Pensando<span>.</span><span>.</span><span>.</span></p>}
                                        {m.cortado && !m.texto && <p className="ia-asi-paso">Lo he dejado a medias.</p>}
                                        {m.error && <div className="ia-aviso tu" role="status">{m.error}</div>}
                                    </div>
                                </div>
                            )}
                            {m.tarjetas.map((t) => (t.tipo === 'presupuesto' ? (
                                <React.Fragment key={t.k}>
                                    <TarjetaPresupuesto t={t} api={api} onAbrir={onAbrirPresupuesto} onBono={onBono} />
                                    {t.ver_casa && api.asistentePaso && (
                                        <PasoCasa t={t} api={api} onBono={onBono} onCambiar={(fn) => cambiarTarjeta(m.id, t.k, fn)} />
                                    )}
                                </React.Fragment>
                            ) : t.tipo === 'obra' ? <TarjetaObra key={t.k} t={t} onTarea={tarea} onAbrirObra={onAbrirObra} /> : null))}
                        </div>
                    )))}
                    {!mensajes.length && chips?.length > 0 && <p className="ia-asi-otra">¿O quieres otra cosa?</p>}
                    <Chips opciones={chips} onElegir={enviar} deshabilitado={enCurso} />
                    <div ref={fin} />
                </div>

                <aside className="ia-asi-lado" aria-label="Lo preparado">
                    {prep ? <Preparado prep={prep} onCosa={cosa} onVerObras={onVerObras} ocupado={ocupado} />
                        : !prepError && <Esqueleto alto={200} n={1} />}
                    {prep && !prep.cosas?.length && (
                        <section className="ia-card"><div className="ia-vacio">
                            <span className="ia-baldosa v"><Icono n="ok" size={22} /></span>
                            <b>Nada pendiente</b>
                            <p>Cuando una obra necesite algo de ti, te lo dejo aquí preparado.</p>
                        </div></section>
                    )}
                    {prepError === 'red' && <AvisoError texto="No he podido mirar tus obras ahora." onReintentar={() => setPrepN((n) => n + 1)} />}
                    <section className="ia-card ia-asi-ayuda">
                        <p className="ia-eyebrow">Me puedes pedir</p>
                        <ul>
                            <li><b>«Presupuesto para Carmen López, aerotermia de 8 kW, 9.500 € con IVA»</b></li>
                            <li>«¿Cómo va la obra de Juan?»</li>
                            <li>«¿Cuánto me cuesta la Daikin de 11?»</li>
                            <li>«Bájale 300 € al último»</li>
                        </ul>
                    </section>
                </aside>
            </div>

            <form className="ia-asi-pie" onSubmit={(e) => { e.preventDefault(); if (conTexto) enviar(texto); }}>
                {aviso && <div className="ia-aviso tu ia-asi-aviso" role="status">{aviso}</div>}
                {grabando ? (
                    <div className="ia-asi-grabando" role="status">
                        <span className="ia-asi-punto" aria-hidden="true" />
                        <b>Te escucho… {mmss}</b>
                        <span>Pulsa el botón para terminar</span>
                    </div>
                ) : transcribiendo ? (
                    <div className="ia-asi-grabando" role="status"><b>Pasando tu audio a texto…</b></div>
                ) : (
                    <label className="ia-asi-campo">
                        <span className="ia-visual-oculto">Escríbele a tu asistente</span>
                        <input type="text" value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={1500}
                            placeholder={enCurso ? 'Contestando…' : 'Escríbeme o mándame un audio'} enterKeyHint="send" autoComplete="off" />
                    </label>
                )}
                {enCurso ? (
                    <button type="button" className="ia-asi-boton sec" onClick={() => corte.current?.abort()} aria-label="Parar la respuesta">
                        <Icono n="parar" size={22} />
                    </button>
                ) : conTexto && !grabando ? (
                    <button type="submit" className="ia-asi-boton" aria-label="Enviar"><Icono n="enviar" size={22} /></button>
                ) : puedeGrabar ? (
                    <button type="button" className={`ia-asi-boton${grabando ? ' grabando' : ''}`} onClick={grabar} disabled={ocupadoMic}
                        aria-label={grabando ? 'Terminar el audio' : 'Mandar un audio'}>
                        <Icono n={grabando ? 'parar' : 'mic'} size={24} />
                    </button>
                ) : (
                    <button type="submit" className="ia-asi-boton" disabled aria-label="Enviar"><Icono n="enviar" size={22} /></button>
                )}
            </form>
        </div>
    );
}

function Cabecera({ onVolver, onDeCero = null }) {
    return (
        <header className="ia-asi-cab">
            {onVolver && (
                <button type="button" className="ia-asi-atras" onClick={onVolver} aria-label="Volver a Inicio"><Icono n="atras" size={24} /></button>
            )}
            <img className="ia-asi-cara g" src={mascota} alt="" />
            <div className="ia-asi-cab-txt">
                <h1 className="ia-display">Tu asistente</h1>
                <span>Escríbeme o mándame un audio</span>
            </div>
            {onDeCero && <button type="button" className="ia-link ia-asi-cero" onClick={onDeCero}>Empezar de cero</button>}
        </header>
    );
}
