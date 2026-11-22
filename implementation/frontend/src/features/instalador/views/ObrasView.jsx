// ─── Obras — la lista, y en el ordenador la obra al lado (prototipos «Obras» y «PC») ──
// Recuerda búsqueda, filtro y la obra elegida al volver (regla 193, `memoriaVista`,
// clave `instalador-obras`): se guarda CÓMO se mira, nunca lo que se mira.
import React, { useEffect, useState } from 'react';
import { useVistaGuardada, useGuardarVista, useScrollLista } from '../../../utils/memoriaVista';
import { Icono, ChipQuien, BarraPasos, Buscador, Esqueleto, AvisoError, eur, iconoDeTarea } from '../ui/piezas';
import { ETAPAS, QUIENES, ORDENES, filtrosIniciales, filtrarObras, cuentasFiltros, hayFiltros, TEXTO_QUIEN } from '../logic/obras';
import { Destino, VERBO } from './Tarea';
import { CuentasCliente } from './ObraView';

/** ¿Pantalla de ordenador? (desde 1024 px: lista + obra al lado). */
export function useEsPC() {
    const consulta = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(min-width: 1024px)') : null);
    const [pc, setPc] = useState(() => !!consulta()?.matches);
    useEffect(() => {
        const mq = consulta();
        if (!mq) return undefined;
        const f = () => setPc(mq.matches);
        mq.addEventListener?.('change', f);
        return () => mq.removeEventListener?.('change', f);
    }, []);
    return pc;
}

/** Un desplegable con forma de botón de filtro: se ve lo elegido, no la palabra «Seleccionar». */
function Desplegable({ etiqueta, valor, opciones, onCambio }) {
    const actual = opciones.find((o) => o.v === valor) || opciones[0];
    const puesto = valor && opciones[0]?.v === '' ? true : false;
    return (
        <label className={`ia-desple${puesto ? ' puesto' : ''}`}>
            <span className="sr">{etiqueta}</span>
            <span aria-hidden="true">{puesto ? actual.t.replace(/ · \d+$/, '') : etiqueta === 'Ordenar' ? actual.t : etiqueta}</span>
            <Icono n="chevron" size={16} />
            <select value={valor} onChange={(e) => onCambio(e.target.value)} aria-label={etiqueta}>
                {opciones.map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}
            </select>
        </label>
    );
}

/** La tarjeta de una obra (también en la ficha del cliente). */
export function TarjetaObra({ obra: o, onClick, seleccionada, conAccion = true }) {
    const t = o.tareas?.[0];
    return (
        <button type="button" className="ia-obra" onClick={onClick} aria-pressed={seleccionada === undefined ? undefined : !!seleccionada}>
            <span className="ia-obra-a">
                <span>
                    <b>{o.cliente}</b>
                    <span className="donde">{[o.direccion, o.municipio].filter(Boolean).join(' · ') || o.tipo}</span>
                </span>
                {o.bono != null && (
                    <span className="ia-obra-bono"><b>{eur(o.bono)}</b><span>bono del cliente</span></span>
                )}
            </span>
            <BarraPasos paso={o.paso} />
            <span className="ia-obra-c">
                <span><b>Paso {o.paso} de 5</b> · {o.fase}</span>
                <ChipQuien quien={o.quien} />
            </span>
            {conAccion && t && (
                <span className="ia-obra-accion">
                    <span>{t.que}{o.tareas.length > 1 ? ` · y ${o.tareas.length - 1} más` : ''}</span>
                    <Icono n="chevron" size={20} />
                </span>
            )}
        </button>
    );
}

export function ObrasView({ datos, cargando, error, onReintentar, cargarDetalle, onAbrirObra, onAbrirOportunidad, onAbrirAccion, onNueva }) {
    const memoria = useVistaGuardada('instalador-obras');
    const [q, setQ] = useState(memoria.q ?? '');
    const [f0] = useState(() => filtrosIniciales(memoria));
    const [etapa, setEtapa] = useState(f0.etapa);
    const [quien, setQuien] = useState(f0.quien);
    const [pueblo, setPueblo] = useState(f0.pueblo);
    const [tipo, setTipo] = useState(f0.tipo);
    const [orden, setOrden] = useState(f0.orden);
    const [sel, setSel] = useState(memoria.sel ?? null);
    useGuardarVista('instalador-obras', { q, etapa, quien, pueblo, tipo, orden, sel });
    const pc = useEsPC();

    const obras = datos?.obras || [];
    const f = { q, etapa, quien, pueblo, tipo, orden };
    const vistas = filtrarObras(obras, f);
    const cuentas = cuentasFiltros(obras, f);
    const lista = useScrollLista('instalador-obras', false, !cargando && vistas.length > 0);
    const r = datos?.resumen;
    const quitar = () => { setEtapa('todas'); setQuien(null); setPueblo(null); setTipo(null); setQ(''); };

    // En el ordenador siempre hay una obra a la derecha: la elegida, o la primera.
    const elegida = pc ? (vistas.find((o) => o.id === sel) || vistas[0] || null) : null;

    const pulsar = (o) => {
        if (pc) { setSel(o.id); return; }
        lista.recordar();
        onAbrirObra(o);
    };

    const filtros = (
        <div className="ia-filtros-todo">
            <div className="ia-filtros" role="group" aria-label="Qué obras ver">
                {ETAPAS.map((e) => (
                    <button key={e.key} type="button" className="ia-filtro" aria-pressed={etapa === e.key} title={e.ayuda}
                        onClick={() => setEtapa(e.key)}>
                        {e.texto} <span className="n">{cuentas.etapa[e.key] ?? 0}</span>
                    </button>
                ))}
            </div>
            <div className="ia-filtros ia-filtros-2" role="group" aria-label="Quién la tiene">
                {QUIENES.filter((x) => cuentas.quien[x.key] || quien === x.key).map((x) => (
                    <button key={x.key} type="button" className={`ia-filtro peq ${x.key}`} aria-pressed={quien === x.key}
                        onClick={() => setQuien(quien === x.key ? null : x.key)}>
                        {x.texto} <span className="n">{cuentas.quien[x.key]}</span>
                    </button>
                ))}
                {(cuentas.pueblos.length > 1 || pueblo) && (
                    <Desplegable etiqueta="Pueblo" valor={pueblo || ''} onCambio={(v) => setPueblo(v || null)}
                        opciones={[{ v: '', t: 'Todos los pueblos' }, ...cuentas.pueblos.map((p) => ({ v: p.v, t: `${p.v} · ${p.n}` }))]} />
                )}
                {(cuentas.tipos.length > 1 || tipo) && (
                    <Desplegable etiqueta="Tipo" valor={tipo || ''} onCambio={(v) => setTipo(v || null)}
                        opciones={[{ v: '', t: 'Todos los tipos' }, ...cuentas.tipos.map((p) => ({ v: p.v, t: `${p.v} · ${p.n}` }))]} />
                )}
                <Desplegable etiqueta="Ordenar" valor={orden} onCambio={setOrden}
                    opciones={ORDENES.map((o) => ({ v: o.key, t: o.texto }))} />
                {hayFiltros(f) && (
                    <button type="button" className="ia-quitar" onClick={quitar}>Quitar filtros</button>
                )}
            </div>
        </div>
    );
    const buscador = <Buscador valor={q} onCambio={setQ} placeholder="Busca por cliente o pueblo" etiqueta="Buscar obra" />;

    return (
        <div ref={lista.ancla}>
            <div className="ia-lista-cab con-pc">
                <div className="ia-titulo">
                    <h1 className="ia-display">Obras</h1>
                    {r && <span>{r.total} en total</span>}
                </div>
                {buscador}
                {filtros}
            </div>
            <div className="ia-pc-cab">
                <h1 className="ia-display">Obras</h1>
                {buscador}
                <div className="ia-pc-filtros">{filtros}</div>
            </div>

            {cargando ? <div style={{ padding: '4px 16px' }}><Esqueleto alto={150} n={3} /></div>
                : error ? <div style={{ padding: '4px 16px' }}><AvisoError onReintentar={onReintentar} /></div>
                : !obras.length ? (
                    <div style={{ padding: '4px 16px' }}>
                        <div className="ia-card"><div className="ia-vacio">
                            <b>Aún no tienes obras</b>
                            <p>Cuando calcules la ayuda de una obra, aparecerá aquí con su bono y por dónde va.</p>
                            <button type="button" className="ia-btn ia-btn-pri" style={{ width: '100%', marginTop: 6 }} onClick={onNueva}>
                                <Icono n="mas" size={22} grosor={2.4} /> Calcular la ayuda de una obra
                            </button>
                        </div></div>
                    </div>
                ) : (
                    <div className="ia-split">
                        <div className="ia-obras">
                            {vistas.length === 0 && (
                                <div className="ia-nada">
                                    <p>No hay ninguna obra con eso.</p>
                                    <button type="button" className="ia-btn ia-btn-sec ia-btn-peq" onClick={quitar}>Quitar filtros y búsqueda</button>
                                </div>
                            )}
                            {vistas.map((o) => (
                                <TarjetaObra key={o.id} obra={o} onClick={() => pulsar(o)} seleccionada={pc ? elegida?.id === o.id : undefined} />
                            ))}
                        </div>
                        {pc && elegida && (
                            <section className="ia-panel" aria-label={`Obra de ${elegida.cliente}`}>
                                <PanelObra key={elegida.id} obra={elegida} cargarDetalle={cargarDetalle}
                                    onAbrirObra={onAbrirObra} onAbrirOportunidad={onAbrirOportunidad} onAbrirAccion={onAbrirAccion} />
                            </section>
                        )}
                    </div>
                )}
        </div>
    );
}

/** La obra a la derecha, en el ordenador (prototipo «PC»). Pide su detalle. */
function PanelObra({ obra, cargarDetalle, onAbrirObra, onAbrirOportunidad, onAbrirAccion }) {
    const [det, setDet] = useState(null);
    const [fallo, setFallo] = useState(false);
    useEffect(() => {
        let vivo = true;
        cargarDetalle(obra.id).then((d) => { if (vivo) setDet(d); }).catch(() => { if (vivo) setFallo(true); });
        return () => { vivo = false; };
    }, [obra.id, cargarDetalle]);

    const o = det || obra;
    const t = o.tareas?.[0];
    const fac = o.factura;
    return (
        <div className="ia-card ia-panel-card">
            <div className="ia-panel-cab">
                <div>
                    <p className="ia-eyebrow">{o.tipo}{o.numero_expediente ? ` · ${o.numero_expediente}` : ''}</p>
                    <h2 className="ia-display">{o.cliente}</h2>
                    <p>{o.direccion_completa || [o.direccion, o.municipio].filter(Boolean).join(' · ')}</p>
                </div>
                {o.bono != null && <div className="ia-panel-bono"><b>{eur(o.bono)}</b><span>bono del cliente</span></div>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <BarraPasos paso={o.paso} grande etiquetas />
            </div>
            {t ? (
                <div className="ia-panel-toca">
                    <div><span>Te toca a ti{o.tareas.length > 1 ? ` · ${o.tareas.length} cosas` : ''}</span><b>{t.que}</b></div>
                    <Destino destino={t.destino} onAbrirOportunidad={onAbrirOportunidad}
                        onAccion={onAbrirAccion ? (d) => onAbrirAccion(o, d) : undefined} className="ia-btn ia-btn-pri ia-btn-peq">
                        <Icono n={iconoDeTarea(t.key)} size={20} /> {VERBO[t.key] || 'Hacerlo'}
                    </Destino>
                </div>
            ) : (
                <div className="ia-aviso">{TEXTO_QUIEN[o.quien]}</div>
            )}
            <div className="ia-tres">
                <div><span>Tu presupuesto</span><b>{o.presupuesto?.importe ? eur(o.presupuesto.importe) : det ? 'Sin presupuesto' : fallo ? '—' : '…'}</b></div>
                <div><span>Tu factura</span><b>{o.papeles ? (o.papeles.find((p) => p.key === 'factura')?.estado || (fac?.n ? 'Subida' : 'Sin hacer')) : fallo ? '—' : '…'}</b></div>
                <div><span>Todo lo de la obra</span><b>{o.papeles ? `${o.papeles_listos} de ${o.papeles_total ?? o.papeles.length} listos` : fallo ? '—' : '…'}</b></div>
            </div>
            {det?.cuentas && <CuentasCliente cuentas={det.cuentas} compacta />}
            {fallo && <p className="ia-pequeno">No hemos podido traer el detalle ahora mismo. Ábrela entera para volver a intentarlo.</p>}
            <button type="button" className="ia-btn ia-btn-sec" onClick={() => onAbrirObra(o)}>
                Abrir la obra entera <Icono n="chevron" size={20} />
            </button>
        </div>
    );
}
