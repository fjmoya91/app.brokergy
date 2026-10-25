import { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../../../context/AuthContext';
import { getRoleFlags } from '../../../utils/roleFlags';
import { normalize } from '../../../utils/direccionCatastral';
import { aNumero, aTexto } from '../../../utils/numeroDecimal';
import { Ico, eur, ErrorApi, errorDeApi, AvisoFx } from '../estilo';

// ─────────────────────────────────────────────────────────────────────────────
// Artículos — el catálogo del que sale cada línea de un presupuesto (estilo
// «carta de pago», .fx-: una tarjeta por familia; en PC, una tabla densa).
//
// Se edita EN LA MISMA TABLA (solo ADMIN; el resto lo ve): cada campo se guarda
// al salir de él, y los interruptores y desplegables al cambiarlos. Se manda el
// artículo ENTERO (PUT), y solo si ha cambiado algo de verdad: el guardián
// compara VALORES, no «¿he tocado el campo?» (la trampa del autoguardado de los
// CEE directos). Cada fila dice si está guardando, guardada o con error.
//
// Un artículo no se borra: hay presupuestos que lo usan. Se da de BAJA
// (`activo:false`) y deja de ofrecerse, pero los presupuestos viejos lo conservan.
//
// - VARIANTES: el mismo concepto a distinto precio (legalización FV: vivienda
//   250 € / nave 450 €). El `id` de la variante lo pone el navegador.
// - ARRASTRA: lo que se añade solo al elegirlo (el CEE inicial y final arrastra
//   la tasa de CLM ×2).
// - GENERA: si al aceptarse el presupuesto abre un expediente de CEE directo.
// - Un artículo activo a 0 € (y sin variante con precio) lleva una marca ámbar:
//   en un presupuesto saldría gratis. Arriba, el aviso de cuántos hay.
// ─────────────────────────────────────────────────────────────────────────────

const API = '/api/facturacion/articulos';

const FAMILIAS = ['CEE', 'Tasas', 'Legalización', 'Subvenciones', 'Ingeniería', 'CAE', 'Consultoría', 'Otros'];
const famKey = (f) => normalize(f || 'Otros');
const KEYS_CONOCIDAS = FAMILIAS.map(famKey);

const GENERA = [
    { v: '', label: 'No' },
    { v: 'CEE_UNICO', label: 'CEE único' },
    { v: 'CEE_DOBLE', label: 'CEE inicial + final' },
];
const generaDe = (g) => (g === 'CEE_UNICO' || g === 'CEE_DOBLE' ? g : '');
const IVAS = [21, 10, 4, 0];

// `crypto.randomUUID` solo existe en contexto seguro (https o localhost): por la
// IP de la red local no está, y el botón no puede fallar por eso.
const nuevoId = () => {
    try { if (window.crypto?.randomUUID) return window.crypto.randomUUID().slice(0, 8); } catch { /* sin crypto */ }
    return Math.random().toString(16).slice(2, 10).padEnd(8, '0');
};

// Lo que se manda al servidor: el artículo entero, limpio. Las variantes sin
// nombre y las partidas sin artículo son líneas a medio escribir: no se guardan.
const limpiar = (a) => {
    const { _key, ...resto } = a;
    return {
        ...resto,
        nombre: (a.nombre || '').trim(),
        familia: a.familia || 'OTROS',
        precio: aNumero(a.precio) ?? 0,
        iva_pct: aNumero(a.iva_pct) ?? 0,
        suplido: !!a.suplido,
        variantes: (a.variantes || [])
            .filter(v => (v.nombre || '').trim())
            .map(v => ({ id: v.id || nuevoId(), nombre: v.nombre.trim(), precio: aNumero(v.precio) ?? 0 })),
        arrastra: (a.arrastra || [])
            .filter(x => x.articulo_id != null && x.articulo_id !== '')
            .map(x => ({ articulo_id: x.articulo_id, uds: aNumero(x.uds) ?? 1 })),
        genera: generaDe(a.genera) || null,
        activo: a.activo !== false,
    };
};

const ordenar = (a, b) => {
    const oa = a.orden == null ? Infinity : Number(a.orden);
    const ob = b.orden == null ? Infinity : Number(b.orden);
    if (oa !== ob) return oa - ob;
    const ua = Number(a.usos) || 0, ub = Number(b.usos) || 0;
    if (ua !== ub) return ub - ua;
    return (a.nombre || '').localeCompare(b.nombre || '', 'es');
};

/** Activo y sin precio (ni el suyo ni el de ninguna variante): en un presupuesto saldría a 0 €. */
const sinPrecio = (a) => a.activo !== false && !(aNumero(a.precio) > 0)
    && !(a.variantes || []).some(v => aNumero(v.precio) > 0);

// ── Campos que guardan al salir ─────────────────────────────────────────────
// Mientras NO se edita enseñan el valor guardado; al entrar copian ese valor a
// su propio texto, y lo entregan al salir (o con Enter). Escape deshace lo
// escrito y sale sin guardar. Así no hay que sincronizar nada con un efecto.
// `multilinea`: el concepto del PDF puede pasar de 90 caracteres y en una caja de
// una línea no se leería entero; se pinta como un textarea que crece con el texto
// (pero Enter sigue siendo «guardar», no un salto de línea).
// `no-uppercase`: index.css pone en MAYÚSCULAS todo input; un concepto se ve como
// sale en el PDF.
function CampoTexto({ value, onCommit, placeholder, caja = false, autoFocus = false, multilinea = false, etiqueta }) {
    const [txt, setTxt] = useState('');
    const [editando, setEditando] = useState(false);
    const cancelar = useRef(false);
    const ref = useRef(null);
    const mostrado = editando ? txt : (value ?? '');
    useLayoutEffect(() => {
        const el = ref.current;
        if (!multilinea || !el) return;
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight}px`;
    }, [mostrado, multilinea]);
    const onFocus = () => { setTxt(value ?? ''); setEditando(true); cancelar.current = false; };
    const onChange = e => { setTxt(e.target.value); setEditando(true); };
    const onBlur = () => {
        setEditando(false);
        if (cancelar.current) { cancelar.current = false; return; }
        if (txt !== (value ?? '')) onCommit(txt);
    };
    const onKeyDown = e => {
        if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
        if (e.key === 'Escape') { e.stopPropagation(); cancelar.current = true; e.currentTarget.blur(); }
    };
    const cls = `fx-art-inline${caja ? ' fx-art-caja' : ''} no-uppercase`;
    return multilinea ? (
        <textarea ref={ref} rows={1} value={mostrado} autoFocus={autoFocus} placeholder={placeholder} aria-label={etiqueta}
            onFocus={onFocus} onChange={onChange} onBlur={onBlur} onKeyDown={onKeyDown} className={cls} />
    ) : (
        <input value={mostrado} autoFocus={autoFocus} placeholder={placeholder} aria-label={etiqueta}
            onFocus={onFocus} onChange={onChange} onBlur={onBlur} onKeyDown={onKeyDown} className={cls} />
    );
}

function CampoNumero({ value, onCommit, sufijo, caja = false, permitirVacio = false, etiqueta }) {
    const [txt, setTxt] = useState('');
    const [editando, setEditando] = useState(false);
    const cancelar = useRef(false);
    return (
        <div className="fx-art-suf">
            <input
                value={editando ? txt : aTexto(value)}
                inputMode="decimal"
                aria-label={etiqueta}
                onFocus={e => { setTxt(aTexto(value)); setEditando(true); cancelar.current = false; e.target.select(); }}
                onChange={e => { setTxt(e.target.value); setEditando(true); }}
                onBlur={() => {
                    setEditando(false);
                    if (cancelar.current) { cancelar.current = false; return; }
                    const n = aNumero(txt);
                    // Lo que no es un número no vale 0: se queda lo que había.
                    if (n == null && !(permitirVacio && !txt.trim())) return;
                    if (n !== (aNumero(value) ?? null)) onCommit(n);
                }}
                onKeyDown={e => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                    if (e.key === 'Escape') { e.stopPropagation(); cancelar.current = true; e.currentTarget.blur(); }
                }}
                className={`fx-art-inline fx-art-num${caja ? ' fx-art-caja' : ''}`}
            />
            {sufijo && <span>{sufijo}</span>}
        </div>
    );
}

const Et = ({ children }) => <span className="fx-art-et">{children}</span>;

// ── Una fila del catálogo ───────────────────────────────────────────────────
function FilaArticulo({ art, esAdmin, opcionesFamilia, opcionesArrastra, nombreDe, expandido, onToggle, onGuardado, resaltado }) {
    // El borrador es de la fila: lo que se ve es lo que se ha escrito, y se manda
    // entero. El listado del padre solo se actualiza con lo que devuelve el servidor.
    const [draft, setDraft] = useState(art);
    const draftRef = useRef(art);
    const ultimoRef = useRef(JSON.stringify(limpiar(art)));
    const enVuelo = useRef(false);
    const pendiente = useRef(false);
    const okTimer = useRef(null);
    const filaRef = useRef(null);
    const [estado, setEstado] = useState(null); // { tono: 'guardando'|'ok'|'error', texto }
    const [focoVariante, setFocoVariante] = useState(null);

    useEffect(() => () => clearTimeout(okTimer.current), []);
    useEffect(() => {
        if (resaltado) filaRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, [resaltado]);

    const guardar = async () => {
        if (!esAdmin) return;
        const payload = limpiar(draftRef.current);
        const json = JSON.stringify(payload);
        if (json === ultimoRef.current) return;
        if (!payload.nombre) { setEstado({ tono: 'error', texto: 'El nombre no puede quedar vacío.' }); return; }
        if (enVuelo.current) { pendiente.current = true; return; }
        enVuelo.current = true;
        setEstado({ tono: 'guardando' });
        try {
            const { data } = await axios.put(`${API}/${encodeURIComponent(payload.id)}`, payload);
            ultimoRef.current = json;
            onGuardado(art._key, data && typeof data === 'object' ? data : payload);
            setEstado({ tono: 'ok' });
            clearTimeout(okTimer.current);
            okTimer.current = setTimeout(() => setEstado(e => (e?.tono === 'ok' ? null : e)), 2500);
        } catch (err) {
            const st = err.response?.status;
            setEstado({
                tono: 'error',
                texto: st === 403 ? 'Solo un administrador puede cambiar el catálogo.'
                    : err.response?.data?.error || 'No se pudo guardar.',
            });
        } finally {
            enVuelo.current = false;
            if (pendiente.current) { pendiente.current = false; guardar(); }
        }
    };

    const cambiar = (patch) => {
        const next = { ...draftRef.current, ...patch };
        draftRef.current = next;
        setDraft(next);
        guardar();
    };

    const variantes = draft.variantes || [];
    const arrastra = draft.arrastra || [];
    // Siempre sobre el borrador VIVO (la ref), no sobre el del render: un blur y un
    // clic seguidos caen en el mismo ciclo y el segundo pisaría al primero.
    const vivas = () => draftRef.current.variantes || [];
    const partidas = () => draftRef.current.arrastra || [];
    const setVariante = (i, patch) => cambiar({ variantes: vivas().map((v, j) => (j === i ? { ...v, ...patch } : v)) });
    const quitarVariante = (i) => cambiar({ variantes: vivas().filter((_, j) => j !== i) });
    const setArrastra = (i, patch) => cambiar({ arrastra: partidas().map((x, j) => (j === i ? { ...x, ...patch } : x)) });
    const quitarArrastra = (i) => cambiar({ arrastra: partidas().filter((_, j) => j !== i) });
    const anadirVariante = () => {
        const id = nuevoId();
        setFocoVariante(id);
        cambiar({ variantes: [...vivas(), { id, nombre: '', precio: aNumero(draftRef.current.precio) ?? 0 }] });
    };

    const activo = draft.activo !== false;
    const genera = generaDe(draft.genera);
    const nVar = variantes.filter(v => (v.nombre || '').trim()).length;
    const nArr = arrastra.filter(x => x.articulo_id != null && x.articulo_id !== '').length;
    const cero = sinPrecio(draft);

    const indicador = estado?.tono === 'guardando' ? (
        <span className="fx-art-estado" role="status">Guardando…</span>
    ) : estado?.tono === 'ok' ? (
        <span className="fx-art-estado fx-ok" role="status"><Ico n="check" size={13} sw={3} /> Guardado</span>
    ) : estado?.tono === 'error' ? (
        <button type="button" onClick={guardar} title={estado.texto} className="fx-art-estado fx-mal fx-link" style={{ minHeight: 0, fontSize: 12 }}>
            Error · reintentar
        </button>
    ) : null;

    return (
        <div ref={filaRef} className={`fx-art${!activo ? ' fx-art-baja' : ''}${resaltado ? ' fx-art-resaltado' : expandido ? ' fx-art-abierto' : ''}`}>
            <div className="fx-art-fila">
                <button type="button" className="fx-ico-btn" onClick={onToggle} aria-expanded={expandido}
                    aria-label={expandido ? 'Cerrar el detalle' : 'Familia, orden, variantes y lo que arrastra'}>
                    <Ico n="derecha" size={16} sw={2.6} style={{ transition: 'transform .2s', transform: expandido ? 'rotate(90deg)' : 'none' }} />
                </button>

                <div style={{ minWidth: 0 }}>
                    {esAdmin ? (
                        <CampoTexto multilinea value={draft.nombre} onCommit={v => cambiar({ nombre: v })} placeholder="Concepto tal como sale en el PDF" etiqueta="Concepto" />
                    ) : (
                        <div className="fx-art-inline" style={{ fontWeight: 600 }}>{draft.nombre}</div>
                    )}
                    {(nVar > 0 || nArr > 0 || Number(draft.usos) > 0 || cero) && (
                        <div className="fx-art-meta">
                            {cero && <span className="fx-art-cero"><Ico n="alerta" size={12} sw={2.6} />Sin precio: saldría a 0 €</span>}
                            {(nVar > 0 || nArr > 0 || Number(draft.usos) > 0) && (
                                <button type="button" onClick={onToggle}>
                                    {[nVar > 0 && `${nVar} ${nVar === 1 ? 'variante' : 'variantes'}`, nArr > 0 && `arrastra ${nArr}`,
                                        Number(draft.usos) > 0 && `${draft.usos} ${Number(draft.usos) === 1 ? 'uso' : 'usos'}`].filter(Boolean).join(' · ')}
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* Móvil: precio · IVA · suplido en una fila; PC: cada uno en su columna. */}
                <div className="fx-art-resto">
                    <div>
                        <Et>Precio sin IVA</Et>
                        {esAdmin ? (
                            <CampoNumero value={draft.precio} onCommit={n => cambiar({ precio: n ?? 0 })} sufijo="€" etiqueta="Precio sin IVA" />
                        ) : (
                            <div className="fx-art-inline fx-art-num">{eur(draft.precio)}</div>
                        )}
                    </div>
                    <div>
                        <Et>IVA</Et>
                        {esAdmin ? (
                            <select value={String(aNumero(draft.iva_pct) ?? 0)} disabled={!!draft.suplido} aria-label="IVA"
                                onChange={e => cambiar({ iva_pct: Number(e.target.value) })}
                                className="fx-select" title={draft.suplido ? 'Un suplido va sin IVA' : undefined}>
                                {[...new Set([...IVAS, aNumero(draft.iva_pct) ?? 0])].map(v => <option key={v} value={String(v)}>{aTexto(v)} %</option>)}
                            </select>
                        ) : (
                            <div className="fx-art-inline">{aTexto(draft.iva_pct ?? 0)} %</div>
                        )}
                    </div>
                    <label className="fx-art-check" title="Suplido: se cobra por cuenta del cliente (una tasa), sin IVA">
                        <Et>Suplido</Et>
                        {esAdmin ? (
                            <input type="checkbox" checked={!!draft.suplido} aria-label="Suplido"
                                // Un suplido no lleva IVA: al marcarlo, el IVA pasa a 0.
                                onChange={e => cambiar(e.target.checked ? { suplido: true, iva_pct: 0 } : { suplido: false })} />
                        ) : (
                            <span>{draft.suplido ? 'Sí' : '—'}</span>
                        )}
                    </label>
                </div>

                {/* Móvil: «abre expediente» · activo · estado; PC: sus columnas. */}
                <div className="fx-art-resto2">
                    <div>
                        <Et>Abre expediente CEE</Et>
                        {esAdmin ? (
                            <select value={genera} onChange={e => cambiar({ genera: e.target.value || null })} className="fx-select" aria-label="Abre expediente CEE">
                                {GENERA.map(g => <option key={g.v} value={g.v}>{g.label}</option>)}
                            </select>
                        ) : (
                            <div className="fx-art-inline">{GENERA.find(g => g.v === genera)?.label}</div>
                        )}
                    </div>
                    <label className="fx-art-check" title="Desmarcado = dado de baja: no se ofrece en presupuestos nuevos">
                        <Et>Activo</Et>
                        {esAdmin ? (
                            <input type="checkbox" checked={activo} onChange={e => cambiar({ activo: e.target.checked })} aria-label="Activo" />
                        ) : (
                            <span>{activo ? 'Sí' : 'No'}</span>
                        )}
                    </label>
                    <div style={{ minWidth: 60, alignSelf: 'center' }}>{indicador}</div>
                </div>
            </div>

            {/* ── Detalle: familia, orden, variantes y arrastra ───────────── */}
            {expandido && (
                <div className="fx-art-det">
                    <div style={{ display: 'grid', gap: 14 }}>
                        <div className="fx-art-sub" style={{ gridTemplateColumns: 'minmax(0,1fr) 112px' }}>
                            <div>
                                <h4>Familia</h4>
                                {esAdmin ? (
                                    <select value={opcionesFamilia.find(o => famKey(o.value) === famKey(draft.familia))?.value ?? draft.familia ?? ''}
                                        onChange={e => cambiar({ familia: e.target.value })} className="fx-select" aria-label="Familia">
                                        {opcionesFamilia.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                    </select>
                                ) : <div className="fx-art-inline">{draft.familia || 'Otros'}</div>}
                            </div>
                            <div>
                                <h4>Orden</h4>
                                {esAdmin ? (
                                    <CampoNumero value={draft.orden ?? null} permitirVacio caja onCommit={n => cambiar({ orden: n })} etiqueta="Orden" />
                                ) : <div className="fx-art-inline fx-art-num">{draft.orden ?? '—'}</div>}
                            </div>
                        </div>

                        <div>
                            <h4>Variantes <span>— el mismo concepto a otro precio</span></h4>
                            {variantes.length === 0 && <p className="fx-ayuda">Sin variantes: se usa el precio por defecto.</p>}
                            <div style={{ display: 'grid', gap: 6 }}>
                                {variantes.map((v, i) => (
                                    <div key={v.id || i} className="fx-art-sub">
                                        {esAdmin ? (
                                            <>
                                                <CampoTexto value={v.nombre} caja placeholder="p. ej. Vivienda unifamiliar" etiqueta="Nombre de la variante"
                                                    autoFocus={focoVariante === v.id}
                                                    onCommit={val => setVariante(i, { nombre: val })} />
                                                <CampoNumero value={v.precio} caja sufijo="€" etiqueta="Precio de la variante"
                                                    onCommit={n => setVariante(i, { precio: n ?? 0 })} />
                                                <button type="button" className="fx-ico-btn fx-pl-quitar" onClick={() => quitarVariante(i)} aria-label="Quitar la variante"><Ico n="x" size={16} /></button>
                                            </>
                                        ) : (
                                            <>
                                                <div className="fx-art-inline">{v.nombre}</div>
                                                <div className="fx-art-inline fx-art-num">{eur(v.precio)}</div>
                                                <span />
                                            </>
                                        )}
                                    </div>
                                ))}
                            </div>
                            {esAdmin && <button type="button" className="fx-link" onClick={anadirVariante}><Ico n="mas" size={16} />Añadir variante</button>}
                        </div>
                    </div>

                    <div>
                        <h4>Arrastra <span>— partidas que se añaden solas al elegirlo</span></h4>
                        {arrastra.length === 0 && <p className="fx-ayuda">No arrastra nada.</p>}
                        <div style={{ display: 'grid', gap: 6 }}>
                            {arrastra.map((x, i) => (
                                <div key={i} className="fx-art-sub">
                                    {esAdmin ? (
                                        <>
                                            <select value={x.articulo_id == null ? '' : String(x.articulo_id)} className="fx-select" aria-label="Artículo que arrastra"
                                                onChange={e => {
                                                    const op = opcionesArrastra.flatMap(g => g.items).find(o => String(o.id) === e.target.value);
                                                    setArrastra(i, { articulo_id: op ? op.id : '' });
                                                }}>
                                                <option value="">Elige el artículo…</option>
                                                {opcionesArrastra.map(g => (
                                                    <optgroup key={g.label} label={g.label}>
                                                        {g.items.filter(o => String(o.id) !== String(draft.id)).map(o => (
                                                            <option key={o.id} value={String(o.id)}>{o.nombre}{o.activo === false ? ' (de baja)' : ''}</option>
                                                        ))}
                                                    </optgroup>
                                                ))}
                                            </select>
                                            <CampoNumero value={x.uds} caja sufijo="ud" etiqueta="Unidades"
                                                onCommit={n => setArrastra(i, { uds: n ?? 1 })} />
                                            <button type="button" className="fx-ico-btn fx-pl-quitar" onClick={() => quitarArrastra(i)} aria-label="Quitar la partida"><Ico n="x" size={16} /></button>
                                        </>
                                    ) : (
                                        <>
                                            <div className="fx-art-inline">{nombreDe(x.articulo_id)}</div>
                                            <div className="fx-art-inline fx-art-num">×{aTexto(x.uds)}</div>
                                            <span />
                                        </>
                                    )}
                                </div>
                            ))}
                        </div>
                        {esAdmin && (
                            <button type="button" className="fx-link" onClick={() => cambiar({ arrastra: [...partidas(), { articulo_id: '', uds: 1 }] })}>
                                <Ico n="mas" size={16} />Añadir partida
                            </button>
                        )}
                        {estado?.tono === 'error' && <p className="fx-error" style={{ marginTop: 10 }}><Ico n="alerta" size={15} />{estado.texto}</p>}
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Alta de un artículo ─────────────────────────────────────────────────────
// Con botón «Crear», no al salir del campo: un artículo a medio escribir no debe
// nacer en el catálogo. Las variantes y lo que arrastra se añaden ya en su fila.
function NuevoArticulo({ opcionesFamilia, onCreado, onCancelar }) {
    const [f, setF] = useState(() => ({ nombre: '', familia: opcionesFamilia[0]?.value || 'CEE', precio: '', iva_pct: 21, suplido: false, genera: '' }));
    const [enviando, setEnviando] = useState(false);
    const [error, setError] = useState(null);

    const crear = async () => {
        const nombre = f.nombre.trim();
        if (!nombre) { setError('Escribe el concepto.'); return; }
        const precio = aNumero(f.precio);
        if (f.precio !== '' && precio == null) { setError('El precio no es un número.'); return; }
        setEnviando(true); setError(null);
        try {
            const { data } = await axios.post(API, {
                nombre, familia: f.familia, precio: precio ?? 0, iva_pct: f.suplido ? 0 : Number(f.iva_pct),
                suplido: f.suplido, variantes: [], arrastra: [], genera: f.genera || null, activo: true,
            });
            onCreado(data);
        } catch (err) {
            setError(err.response?.status === 403 ? 'Solo un administrador puede dar de alta artículos.'
                : err.response?.data?.error || 'No se pudo crear el artículo.');
        } finally { setEnviando(false); }
    };

    return (
        <section className="fx-card fx-pad fx-art-nuevo fx-in" aria-label="Nuevo artículo">
            <div className="fx-eyebrow">Nuevo artículo</div>
            <div className="fx-rejilla" style={{ marginTop: 12 }}>
                <label className="fx-campo" style={{ gridColumn: '1 / -1' }}>
                    <span>Concepto · sale así en el PDF</span>
                    <input autoFocus value={f.nombre} onChange={e => setF({ ...f, nombre: e.target.value })}
                        onKeyDown={e => { if (e.key === 'Enter') crear(); if (e.key === 'Escape') onCancelar(); }}
                        className="fx-input no-uppercase" placeholder="p. ej. Legalización de instalación solar fotovoltaica" />
                </label>
                <label className="fx-campo">
                    <span>Familia</span>
                    <select value={f.familia} onChange={e => setF({ ...f, familia: e.target.value })} className="fx-select">
                        {opcionesFamilia.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                </label>
                <label className="fx-campo">
                    <span>Precio sin IVA (€)</span>
                    <input value={f.precio} inputMode="decimal" onChange={e => setF({ ...f, precio: e.target.value })}
                        onKeyDown={e => { if (e.key === 'Enter') crear(); }} className="fx-input fx-num" placeholder="0" />
                </label>
                <label className="fx-campo">
                    <span>IVA</span>
                    <select value={String(f.suplido ? 0 : f.iva_pct)} disabled={f.suplido} onChange={e => setF({ ...f, iva_pct: Number(e.target.value) })} className="fx-select">
                        {IVAS.map(v => <option key={v} value={String(v)}>{v} %</option>)}
                    </select>
                </label>
                <label className="fx-campo">
                    <span>Abre expediente CEE</span>
                    <select value={f.genera} onChange={e => setF({ ...f, genera: e.target.value })} className="fx-select">
                        {GENERA.map(g => <option key={g.v} value={g.v}>{g.label}</option>)}
                    </select>
                </label>
            </div>
            <label className="fx-check" style={{ marginTop: 12, border: '1px solid var(--linea)', borderRadius: 14 }}>
                <input type="checkbox" checked={f.suplido} onChange={e => setF({ ...f, suplido: e.target.checked })} />
                <span>Suplido<small>Se cobra por cuenta del cliente (una tasa): sin IVA y sin descuento.</small></span>
            </label>
            {error && <p className="fx-error" style={{ marginTop: 10 }}><Ico n="alerta" size={15} />{error}</p>}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
                <button type="button" className="fx-btn fx-btn-pri" onClick={crear} disabled={enviando}>
                    {enviando ? 'Creando…' : <><Ico n="check" size={18} />Crear el artículo</>}
                </button>
                <button type="button" className="fx-btn fx-btn-sec" onClick={onCancelar} disabled={enviando}>Cancelar</button>
            </div>
        </section>
    );
}

export function ArticulosCatalogo() {
    const { user } = useAuth();
    const { isAdmin: esAdmin } = getRoleFlags(user);
    const [lista, setLista] = useState([]);
    const [cargado, setCargado] = useState(false);
    const [error, setError] = useState(null);
    const [busqueda, setBusqueda] = useState('');
    const [verBajas, setVerBajas] = useState(false);
    const [abierto, setAbierto] = useState(null);     // _key de la fila desplegada
    const [creando, setCreando] = useState(false);
    const [resaltado, setResaltado] = useState(null);
    // Lo que se da de baja en esta visita sigue a la vista (atenuado) hasta
    // recargar: que una fila desaparezca al desmarcar «activo» parece un borrado.
    const [mantener, setMantener] = useState(() => new Set());
    const resaltadoTimer = useRef(null);

    const cargar = useCallback(async () => {
        try {
            const { data } = await axios.get(API, { params: { todos: 1 } });
            setLista((Array.isArray(data) ? data : []).map(a => ({ ...a, _key: String(a.id) })));
            setError(null);
        } catch (err) {
            setError(errorDeApi(err));    // lo que ya hubiera se queda (regla 38)
        } finally { setCargado(true); }
    }, []);

    useEffect(() => { cargar(); }, [cargar]);
    useEffect(() => () => clearTimeout(resaltadoTimer.current), []);

    const onGuardado = useCallback((key, data) => {
        setLista(l => l.map(x => (x._key === key ? { ...x, ...data, _key: key } : x)));
        if (data?.activo === false) setMantener(s => (s.has(key) ? s : new Set(s).add(key)));
    }, []);

    const onCreado = (data) => {
        if (!data?.id) { cargar(); setCreando(false); return; }
        const key = String(data.id);
        setLista(l => [...l, { ...data, _key: key }]);
        setCreando(false);
        setAbierto(key);
        setResaltado(key);
        clearTimeout(resaltadoTimer.current);
        resaltadoTimer.current = setTimeout(() => setResaltado(null), 2500);
    };

    // Las familias que ya existen en los datos mandan sobre cómo se escriben
    // (si el servidor guarda «TASAS», se sigue guardando «TASAS»).
    const opcionesFamilia = useMemo(() => {
        const raw = {};
        for (const a of lista) { const k = famKey(a.familia); if (!raw[k] && a.familia) raw[k] = a.familia; }
        // Sin ejemplo en los datos, en MAYÚSCULAS: como `FAMILIAS` de logic/presupuesto.js.
        const conocidas = FAMILIAS.map(f => ({ value: raw[famKey(f)] || f.toUpperCase(), label: f }));
        const otras = Object.entries(raw).filter(([k]) => !KEYS_CONOCIDAS.includes(k)).map(([, v]) => ({ value: v, label: v }));
        return [...conocidas, ...otras];
    }, [lista]);

    const grupos = useMemo(() => {
        const palabras = normalize(busqueda).split(/\s+/).filter(Boolean);
        const visibles = lista.filter(a => {
            if (a.activo === false && !verBajas && !mantener.has(a._key) && !palabras.length) return false;
            if (!palabras.length) return true;
            const heno = normalize([a.nombre, a.familia, ...(a.variantes || []).map(v => v.nombre)].filter(Boolean).join(' '));
            return palabras.every(w => heno.includes(w));
        });
        const porFam = new Map();
        for (const a of visibles) {
            const k = famKey(a.familia);
            if (!porFam.has(k)) porFam.set(k, []);
            porFam.get(k).push(a);
        }
        const claves = [...porFam.keys()].sort((x, y) => {
            const ix = KEYS_CONOCIDAS.indexOf(x), iy = KEYS_CONOCIDAS.indexOf(y);
            return (ix < 0 ? 99 : ix) - (iy < 0 ? 99 : iy) || x.localeCompare(y);
        });
        return claves.map(k => ({
            key: k,
            label: FAMILIAS[KEYS_CONOCIDAS.indexOf(k)] || porFam.get(k)[0].familia,
            items: porFam.get(k).sort(ordenar),
        }));
    }, [lista, busqueda, verBajas, mantener]);

    // Para el selector de «arrastra»: todo el catálogo, por familias.
    const opcionesArrastra = useMemo(() => {
        const porFam = new Map();
        for (const a of [...lista].sort(ordenar)) {
            const k = famKey(a.familia);
            if (!porFam.has(k)) porFam.set(k, { label: FAMILIAS[KEYS_CONOCIDAS.indexOf(k)] || a.familia || 'Otros', items: [] });
            porFam.get(k).items.push({ id: a.id, nombre: a.nombre, activo: a.activo });
        }
        return [...porFam.entries()]
            .sort(([x], [y]) => ((KEYS_CONOCIDAS.indexOf(x) + 1 || 99) - (KEYS_CONOCIDAS.indexOf(y) + 1 || 99)))
            .map(([, g]) => g);
    }, [lista]);

    const nombreDe = useCallback((id) => lista.find(a => String(a.id) === String(id))?.nombre || '(artículo desconocido)', [lista]);

    const bajas = useMemo(() => lista.filter(a => a.activo === false).length, [lista]);
    const aCero = useMemo(() => lista.filter(sinPrecio), [lista]);
    const nActivos = lista.length - bajas;

    const irAlPrimeroACero = () => {
        const a = aCero[0];
        if (!a) return;
        setBusqueda('');
        setAbierto(a._key);
        setResaltado(a._key);
        clearTimeout(resaltadoTimer.current);
        resaltadoTimer.current = setTimeout(() => setResaltado(null), 2500);
    };

    return (
        <div>
            <section className="fx-card fx-pad fx-lista fx-in" aria-labelledby="fx-art-tit">
                <div className="fx-lista-cab">
                    <div>
                        <div className="fx-eyebrow">Catálogo</div>
                        <h2 id="fx-art-tit" className="fx-display fx-h2">Artículos</h2>
                    </div>
                    <div className="fx-herr">
                        <label className="fx-buscar">
                            <Ico n="buscar" size={18} />
                            <input type="search" value={busqueda} onChange={e => setBusqueda(e.target.value)} className="no-uppercase"
                                placeholder="Buscar un artículo o una variante" aria-label="Buscar artículos" />
                        </label>
                        {bajas > 0 && (
                            <button type="button" className="fx-chip-f" aria-pressed={verBajas} onClick={() => setVerBajas(v => !v)}>
                                De baja<b>{bajas}</b>
                            </button>
                        )}
                        {esAdmin && !creando && (
                            <button type="button" className="fx-btn fx-btn-sec" onClick={() => setCreando(true)}>
                                <Ico n="mas" size={18} />Nuevo artículo
                            </button>
                        )}
                    </div>
                </div>

                {cargado && !error && (
                    <div className="fx-lista-res">
                        <span><b>{nActivos}</b> {nActivos === 1 ? 'artículo activo' : 'artículos activos'}</span>
                        {bajas > 0 && <span>{bajas} de baja</span>}
                        <span>{esAdmin ? 'Cada cambio se guarda al salir del campo.' : 'Solo un administrador puede cambiar el catálogo.'}</span>
                    </div>
                )}

                {aCero.length > 0 && (
                    <AvisoFx tono="ambar"
                        accion={esAdmin ? <button type="button" className="fx-btn fx-btn-sec fx-btn-peq" onClick={irAlPrimeroACero}>Ponerle precio</button> : null}>
                        <b>{aCero.length === 1 ? '1 artículo sin precio' : `${aCero.length} artículos sin precio`}</b>: en un presupuesto saldría{aCero.length === 1 ? '' : 'n'} a 0 €.
                        {' '}{aCero.slice(0, 3).map(a => `«${a.nombre}»`).join(', ')}{aCero.length > 3 ? '…' : ''}
                    </AvisoFx>
                )}

                {error && <ErrorApi error={error} que="los artículos" onReintentar={cargar} />}
            </section>

            {creando && <div style={{ marginTop: 16 }}><NuevoArticulo opcionesFamilia={opcionesFamilia} onCreado={onCreado} onCancelar={() => setCreando(false)} /></div>}

            {!cargado ? (
                <div className="fx-card fx-pad" style={{ display: 'grid', gap: 10, marginTop: 16 }} aria-busy="true" aria-label="Cargando los artículos">
                    {[0, 1, 2, 3].map(i => <div key={i} className="fx-sk fx-sk-fila" />)}
                </div>
            ) : error && !lista.length ? null : grupos.length === 0 ? (
                <div className="fx-card fx-vacio" style={{ marginTop: 16 }}>
                    <Ico n="lista" size={30} />
                    <p>{lista.length ? `Ningún artículo coincide con «${busqueda}».` : 'El catálogo está vacío.'}</p>
                </div>
            ) : (
                <div style={{ marginTop: 16 }}>
                    {grupos.map((g, i) => (
                        <section key={g.key} className="fx-card fx-art-grupo fx-in" style={{ '--i': Math.min(i + 1, 6) }} aria-label={g.label}>
                            <div className="fx-art-grupo-cab">
                                <h3>{g.label}</h3>
                                <small>{g.items.length} {g.items.length === 1 ? 'artículo' : 'artículos'}</small>
                            </div>
                            <div className="fx-art-th" aria-hidden="true">
                                <span />
                                <span>Concepto</span>
                                <span style={{ textAlign: 'right' }}>Precio s/IVA</span>
                                <span>IVA</span>
                                <span style={{ textAlign: 'center' }}>Suplido</span>
                                <span>Abre expediente</span>
                                <span style={{ textAlign: 'center' }}>Activo</span>
                                <span />
                            </div>
                            {g.items.map(a => (
                                <FilaArticulo
                                    key={a._key}
                                    art={a}
                                    esAdmin={esAdmin}
                                    opcionesFamilia={opcionesFamilia}
                                    opcionesArrastra={opcionesArrastra}
                                    nombreDe={nombreDe}
                                    expandido={abierto === a._key}
                                    onToggle={() => setAbierto(k => (k === a._key ? null : a._key))}
                                    onGuardado={onGuardado}
                                    resaltado={resaltado === a._key}
                                />
                            ))}
                        </section>
                    ))}
                </div>
            )}
        </div>
    );
}

export default ArticulosCatalogo;
