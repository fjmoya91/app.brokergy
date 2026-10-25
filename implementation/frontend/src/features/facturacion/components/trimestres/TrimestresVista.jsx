import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Ico, Importe, eur, entero, fechaEs, hoyMadridFx, diasEntreFx, MESES_FX, MESES_CORTOS_FX, ErrorApi, AvisoFx, errorDeApi, tonoDeApi } from '../../estilo';
import { useParamsFacturacion } from '../../urlFacturacion';
import { GastosTrimestre } from './GastosTrimestre';
import { PaqueteGestoria } from './PaqueteGestoria';

// ─────────────────────────────────────────────────────────────────────────────
// Trimestres (solo ADMIN): el cierre de cada trimestre, ESTIMADO (lo presenta la gestoría).
//
// - `?t=AAAA-Tn` elige el trimestre; `?f=resumen|gastos|paquete` la vista (el `f` de esta
//   subpestaña; en los listados es el chip). Sin `t`: el último trimestre CERRADO mientras
//   corre su plazo y, pasado el plazo, el que está en curso.
// - Resumen: `GET /trimestre?t=` (5-10 s: lee Drive). Dos contribuyentes que NO se mezclan:
//   la SOCIEDAD (ventas ING + CAE, gastos, 303 con ISP, 111, candidatos al 349) y el
//   AUTÓNOMO (ventas FML, gastos, 303, 130). Más la lista del SOP, los huecos de serie y lo
//   pendiente de cobro. Las cifras son las de la API, tal cual.
// - Gastos y Paquete, en sus componentes. Corregir un gasto invalida el resumen guardado.
// ─────────────────────────────────────────────────────────────────────────────

const VISTAS = [
    { id: 'resumen', label: 'Resumen' },
    { id: 'gastos', label: 'Gastos' },
    { id: 'paquete', label: 'Paquete' },
];
const RE_T = /^(\d{4})-T([1-4])$/;

/** Fechas de un trimestre y sus plazos (calendario de la AEAT: el 4T, hasta el 30 de enero; el 111, el 20). */
function datosTrimestre(t) {
    const m = RE_T.exec(t || '');
    if (!m) return null;
    const anio = Number(m[1]), q = Number(m[2]);
    const m0 = (q - 1) * 3;
    const fin = new Date(Date.UTC(anio, m0 + 3, 0)).toISOString().slice(0, 10);
    const plazo303 = q === 4 ? `${anio + 1}-01-30` : `${anio}-${String(m0 + 4).padStart(2, '0')}-20`;
    return { t, anio, q, m0, desde: `${anio}-${String(m0 + 1).padStart(2, '0')}-01`, hasta: fin, plazo303 };
}
const trimestreDe = (iso) => `${iso.slice(0, 4)}-T${Math.floor((Number(iso.slice(5, 7)) - 1) / 3) + 1}`;
const anterior = (t) => { const d = datosTrimestre(t); return d.q === 1 ? `${d.anio - 1}-T4` : `${d.anio}-T${d.q - 1}`; };

/** Sin `t`: el anterior si aún corre su plazo; si no, el que está en curso. */
function trimestrePorDefecto(hoy = hoyMadridFx()) {
    const enCurso = trimestreDe(hoy);
    const prev = datosTrimestre(anterior(enCurso));
    return prev.plazo303 >= hoy ? prev.t : enCurso;
}

function estadoDe(d, hoy) {
    if (d.desde > hoy) return { clave: 'futuro', texto: 'Aún no ha empezado', chip: 'gris' };
    if (d.hasta >= hoy) return { clave: 'curso', texto: 'En curso', chip: 'tinta' };
    if (d.plazo303 >= hoy) return { clave: 'presentar', texto: `Por presentar · hasta el ${fechaEs(d.plazo303).slice(0, 5)}`, chip: 'ambar' };
    return { clave: 'cerrado', texto: 'Plazo cerrado', chip: 'gris' };
}

function Fila({ k, nota, v, total = false, title }) {
    return (
        <div className={`fx-fila${total ? ' fx-fila-total' : ''}`} title={title}>
            <dt>{k}{nota && <small>{nota}</small>}</dt><dd>{v}</dd>
        </div>
    );
}

function Modelo303({ m, ventas, drive }) {
    if (!m) return null;
    const isp = m.isp || {};
    return (
        <dl className="fx-filas">
            <Fila k="Base de las ventas" nota={`${entero(ventas?.n || 0)} facturas`} v={eur(m.devengado?.base)} />
            {!!drive?.leidas && <Fila k="De ellas, ventas CAE de Drive" nota={`${entero(drive.leidas)} leídas del PDF (autofacturas)`} v={eur(drive.base)} />}
            {(m.devengado?.por_tipo || []).map(x => <Fila key={x.tipo} k={`IVA repercutido al ${x.tipo} %`} v={eur(x.cuota)} />)}
            {!!m.no_sujeto_suplidos && <Fila k="Suplidos (tasas)" nota="no sujetos: no llevan IVA" v={eur(m.no_sujeto_suplidos)} />}
            {!!isp.cuota && <Fila k="IVA de la ISP, devengado" nota={`sobre ${eur(isp.base)} de servicios de fuera`} v={eur(isp.cuota)} />}
            <Fila k="IVA soportado deducible" nota="de los gastos de Drive y las FML" v={eur(-(m.deducible?.interior || 0))} />
            {!!m.deducible?.isp && <Fila k="IVA de la ISP, deducido" nota="se devenga y se deduce: no suma" v={eur(-m.deducible.isp)} />}
            <Fila total k={`Modelo 303 · ${m.resultado >= 0 ? 'a ingresar' : 'a compensar'}`} v={eur(m.resultado)} />
        </dl>
    );
}

function Lista({ items, vacio }) {
    if (!items?.length) return <p className="fx-nombre-fiscal">{vacio}</p>;
    return <ul className="fx-ls">{items}</ul>;
}

function Sociedad({ d }) {
    const v = d.ventas?.sl?.totales, g = d.gastos?.sl?.totales;
    const r = d.m303?.sl?.resultado;
    const act = g?.por_actividad || {};
    return (
        <article className="fx-card fx-pad fx-in" style={{ '--i': 2 }}>
            <div className="fx-filete-fino" />
            <div className="fx-card-cab">
                <div>
                    <div className="fx-eyebrow"><i className="fx-dot" style={{ '--c': 'var(--s-ing)' }} />Sociedad · ING + CAE</div>
                    <h3 className="fx-display fx-h3">BROKERGY</h3>
                    {d.contribuyentes?.sl?.nombre && <p className="fx-nombre-fiscal">{d.contribuyentes.sl.nombre}</p>}
                </div>
                <span className="fx-pildora">estimado</span>
            </div>
            <p className="fx-trim-k">Modelo 303 · {r >= 0 ? 'a ingresar' : 'a compensar'}</p>
            <Importe n={r || 0} className="fx-trim-v fx-cifra-m" />
            <Modelo303 m={d.m303?.sl} ventas={v} drive={d.ventas_cae_drive} />

            <p className="fx-sub-tit">Modelo 111 · retenciones a profesionales</p>
            <Importe n={d.m111?.retencion || 0} className="fx-trim-v fx-cifra-m" />
            <Lista vacio="Ninguna retención este trimestre." items={(d.m111?.perceptores || []).map(p => (
                <li key={`${p.perceptor}-${p.origen}`} className="fx-ls-item">
                    <span className="fx-tile fx-tile-crema"><Ico n="recibo" size={16} /></span>
                    <div><b>{p.perceptor}</b><small>{entero(p.n)} {p.n === 1 ? 'factura' : 'facturas'} · base {eur(p.base)}{p.origen ? ` · ${p.origen}` : ''}</small></div>
                    <span className="fx-ls-imp">{eur(p.retencion)}</span>
                </li>
            ))} />

            <p className="fx-sub-tit">Candidatos al 349 · operaciones con la UE</p>
            <Lista vacio="Ningún proveedor de la UE con NIF-IVA este trimestre." items={(d.m349?.candidatos || []).map(c => (
                <li key={`${c.nif}-${c.proveedor}`} className="fx-ls-item">
                    <span className="fx-tile fx-tile-crema"><Ico n="banco" size={16} /></span>
                    <div><b>{c.proveedor}</b><small>{c.nif} · {c.pais} · {entero(c.n)} {c.n === 1 ? 'factura' : 'facturas'}</small></div>
                    <span className="fx-ls-imp">{eur(c.base)}</span>
                </li>
            ))} />

            <p className="fx-sub-tit">Gastos de la sociedad</p>
            <dl className="fx-filas">
                <Fila k="Justificantes" nota="leídos de Drive y las FML de la app" v={entero(g?.n || 0)} />
                <Fila k="Base" v={eur(g?.base)} />
                <Fila k="IVA deducible" v={eur(g?.iva_deducible)} />
                {Object.entries(act).map(([a, x]) => (
                    <Fila key={a} k={a === 'COMUN' ? 'Comunes (las dos actividades)' : `Actividad ${a}`} nota={`${entero(x.n)} justificantes`} v={eur(x.base)} />
                ))}
                {!!g?.inversiones && <Fila k="Inversiones" nota="300 € o más: inmovilizado" v={eur(g.inversiones)} />}
            </dl>
        </article>
    );
}

function Autonomo({ d }) {
    const v = d.ventas?.autonomo?.totales, g = d.gastos?.autonomo?.totales;
    const r = d.m303?.autonomo?.resultado;
    const a = d.m130?.acumulado;
    return (
        <article className="fx-card fx-pad fx-in" style={{ '--i': 3 }}>
            <div className="fx-card-cab">
                <div>
                    <div className="fx-eyebrow"><i className="fx-dot" style={{ '--c': 'var(--s-fml)' }} />Autónomo · serie FML</div>
                    <h3 className="fx-display fx-h3">Fran, autónomo</h3>
                    <p className="fx-nombre-fiscal">Factura solo a la sociedad: lo que aquí es venta, allí es gasto.</p>
                </div>
                <span className="fx-pildora">estimado</span>
            </div>
            <p className="fx-trim-k">Modelo 303 · {r >= 0 ? 'a ingresar' : 'a compensar'}</p>
            <Importe n={r || 0} className="fx-trim-v fx-cifra-m" />
            <Modelo303 m={d.m303?.autonomo} ventas={v} />

            <p className="fx-sub-tit">Modelo 130 · pago fraccionado del IRPF</p>
            <Importe n={a?.resultado || 0} className="fx-trim-v fx-cifra-m" />
            {a && (
                <dl className="fx-filas">
                    <Fila k="Ingresos del año" nota={`acumulado hasta el ${a.t?.split('-T')[1]}T`} v={eur(a.ingresos)} />
                    <Fila k="Gastos del año" v={eur(-(a.gastos || 0))} />
                    <Fila k="Rendimiento" v={eur(a.rendimiento)} />
                    <Fila k={`${entero(d.m130?.pct || 20)} % del rendimiento`} v={eur(a.cuota)} />
                    <Fila k="Retenciones que te han hecho" nota="las de tus FML" v={eur(-(a.retenciones || 0))} />
                    <Fila k="Pagos de trimestres anteriores" v={eur(-(a.pagos_anteriores || 0))} />
                    <Fila total k="Modelo 130 · a ingresar" v={eur(a.resultado)} />
                </dl>
            )}
            {d.m130?.nota && <AvisoFx tono="crema" style={{ marginTop: 12 }}>{d.m130.nota}</AvisoFx>}

            <p className="fx-sub-tit">Gastos del autónomo</p>
            <dl className="fx-filas">
                <Fila k="Justificantes" nota="leídos de Drive, y la cuota de autónomos y del colegio del banco" v={entero(g?.n || 0)} />
                <Fila k="Base" v={eur(g?.base)} />
                <Fila k="IVA deducible" v={eur(g?.iva_deducible)} />
                {!!g?.gasto_irpf && <Fila k="Gasto deducible en el IRPF" v={eur(g.gasto_irpf)} />}
            </dl>
        </article>
    );
}

function Checklist({ items }) {
    if (!items?.length) return null;
    const ok = items.filter(c => c.ok === true).length;
    return (
        <article className="fx-card fx-pad fx-in" style={{ '--i': 4 }} id="fx-checklist">
            <div className="fx-card-cab">
                <div>
                    <div className="fx-eyebrow">Lista del cierre (SOP)</div>
                    <h3 className="fx-display fx-h3"><span className={ok === items.length ? 'fx-mark' : undefined}>{ok}</span> de {items.length} comprobadas</h3>
                </div>
            </div>
            <ul className="fx-ls">
                {items.map(c => (
                    <li key={c.clave} className="fx-ls-item">
                        <span className={`fx-tile ${c.ok === true ? 'fx-tile-verde' : c.ok === false ? 'fx-tile-ambar' : 'fx-tile-gris'}`}>
                            <Ico n={c.ok === true ? 'check' : c.ok === false ? 'alerta' : 'info'} size={16} />
                        </span>
                        <div><b>{c.texto}</b>{c.detalle && <small>{c.detalle}</small>}</div>
                        <span className={`fx-chip ${c.ok === true ? 'fx-chip-ok' : c.ok === false ? 'fx-chip-ambar' : 'fx-chip-gris'}`}>
                            {c.ok === true ? 'Bien' : c.ok === false ? 'Falta' : 'A mano'}
                        </span>
                    </li>
                ))}
            </ul>
        </article>
    );
}

function Pendientes({ items, ir }) {
    const [todas, setTodas] = useState(false);
    const lista = items || [];
    const vistas = todas ? lista : lista.slice(0, 6);
    const vencidas = lista.filter(p => p.vencida).length;
    return (
        <article className="fx-card fx-pad fx-in" style={{ '--i': 5 }}>
            <div className="fx-card-cab">
                <div>
                    <div className="fx-eyebrow">Pendiente de cobro al cierre</div>
                    <h3 className="fx-display fx-h3">{lista.length ? <>{entero(lista.length)} {lista.length === 1 ? 'factura' : 'facturas'}{vencidas ? <>, {entero(vencidas)} vencidas</> : null}</> : 'Todo cobrado'}</h3>
                </div>
            </div>
            {lista.length === 0 ? <p className="fx-nombre-fiscal">No queda nada por cobrar de lo emitido hasta el cierre.</p> : (<>
                <ul className="fx-ls">
                    {vistas.map(p => (
                        <li key={`${p.linea}-${p.numero}`} className="fx-ls-item">
                            <span className={`fx-tile ${p.vencida ? 'fx-tile-vence' : 'fx-tile-crema'}`}><Ico n={p.vencida ? 'alerta' : 'reloj'} size={16} /></span>
                            <div>
                                <b className="fx-mono">{p.numero}</b>
                                <small>{p.cliente} · {p.contribuyente === 'AUTONOMO' ? 'autónomo' : 'sociedad'}{p.vencida ? ` · vencida hace ${entero(p.dias_vencida)} días` : ` · vence el ${fechaEs(p.vencimiento)}`}</small>
                            </div>
                            <span className="fx-ls-imp">{eur(p.total)}</span>
                        </li>
                    ))}
                </ul>
                <div className="fx-ph-pie">
                    {lista.length > 6 ? (
                        <button type="button" className="fx-link" aria-expanded={todas} onClick={() => setTodas(v => !v)}>
                            {todas ? 'Ver menos' : `Ver las ${entero(lista.length)}`}<Ico n={todas ? 'arriba' : 'abajo'} size={16} />
                        </button>
                    ) : <span />}
                    <button type="button" className="fx-link" onClick={() => ir('facturas', { f: 'por-cobrar' })}>Ir a Facturas<Ico n="derecha" size={16} /></button>
                </div>
            </>)}
        </article>
    );
}

function Esperando({ texto }) {
    return (
        <div aria-busy="true">
            <p className="fx-espera-txt"><Ico n="reintentar" size={18} className="fx-spin" />{texto}</p>
            <div className="fx-dos">
                {[0, 1].map(i => (
                    <div key={i} className="fx-card fx-pad">
                        <div className="fx-sk fx-sk-linea" style={{ width: '40%' }} />
                        <div className="fx-sk fx-sk-cifra" style={{ marginTop: 18 }} />
                        {[0, 1, 2, 3].map(j => <div key={j} className="fx-sk fx-sk-fila" style={{ marginTop: 12 }} />)}
                    </div>
                ))}
            </div>
        </div>
    );
}

const AVISOS_VISIBLES = 3;

function Resumen({ st, recargar, ir, setVista }) {
    const [todos, setTodos] = useState(false);
    if (st?.error && !st.datos) return <ErrorApi error={st.error} que="las cifras del trimestre" onReintentar={recargar} />;
    if (!st?.datos) return <Esperando texto="Leyendo las carpetas de Drive y las facturas del trimestre… (5-10 s)" />;
    const d = st.datos;
    const accionAviso = (f) => {
        if (!f) return null;
        if (f.vista === 'gastos') return { texto: 'Ver los gastos', hacer: () => setVista('gastos', f.t) };
        if (f.vista === 'trimestre' && f.checklist) return { texto: 'Ver la lista', hacer: () => document.getElementById('fx-checklist')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) };
        if (f.vista === 'trimestre') return { texto: 'Verlo', hacer: () => ir('trimestres', { t: f.t }) };
        if (f.vista === 'facturas') return { texto: 'Ver facturas', hacer: () => ir('facturas', { ...(f.serie ? { serie: f.serie } : {}), f: 'todas' }) };
        return null;
    };
    const avisos = (d.avisos || []).slice().sort((a, b) => ({ rojo: 0, ambar: 1 }[a.tono] ?? 2) - ({ rojo: 0, ambar: 1 }[b.tono] ?? 2));
    return (
        <div className={`fx-pila${st.cargando ? ' fx-recargando' : ''}`}>
            {st.error && <ErrorApi error={st.error} que="las cifras del trimestre" onReintentar={recargar} />}
            {avisos.length > 0 && (
                <div className="fx-pila">
                    {(todos ? avisos : avisos.slice(0, AVISOS_VISIBLES)).map((a, i) => {
                        const acc = accionAviso(a.filtro);
                        return (
                            <AvisoFx key={i} tono={tonoDeApi(a.tono)} className="fx-in" style={{ '--i': Math.min(i, 4) }}
                                accion={acc ? <button type="button" className="fx-btn fx-btn-sec fx-btn-peq" onClick={acc.hacer}>{acc.texto}</button> : null}>
                                {a.texto}
                            </AvisoFx>
                        );
                    })}
                    {avisos.length > AVISOS_VISIBLES && (
                        <button type="button" className="fx-link" aria-expanded={todos} onClick={() => setTodos(v => !v)}>
                            {todos ? 'Ver menos avisos' : `Ver los ${entero(avisos.length)} avisos`}<Ico n={todos ? 'arriba' : 'abajo'} size={16} />
                        </button>
                    )}
                </div>
            )}
            <div className="fx-dos">
                <Sociedad d={d} />
                <Autonomo d={d} />
            </div>
            <div className="fx-dos">
                <Checklist items={d.checklist} />
                <Pendientes items={d.pendientes_cobro} ir={ir} />
            </div>
            <p className="fx-graf-nota">{d.nota || 'Estimación para preparar el cierre: los modelos los presenta la gestoría.'}</p>
        </div>
    );
}

export function TrimestresVista({ ir }) {
    const [params, poner] = useParamsFacturacion();
    const hoy = hoyMadridFx();
    const anioHoy = Number(hoy.slice(0, 4));
    const t = RE_T.test(params.t || '') ? params.t : trimestrePorDefecto(hoy);
    const vista = VISTAS.some(v => v.id === params.f) ? params.f : 'resumen';
    const dt = datosTrimestre(t);

    // El resumen de cada trimestre se guarda mientras la vista vive (5-10 s cada uno).
    const [cache, setCache] = useState({});
    const pedido = useRef({});
    const cargar = useCallback(async (tt) => {
        const n = (pedido.current[tt] || 0) + 1;
        pedido.current[tt] = n;
        setCache(c => ({ ...c, [tt]: { ...(c[tt] || {}), cargando: true, error: null } }));
        try {
            const { data } = await axios.get('/api/facturacion/trimestre', { params: { t: tt } });
            if (pedido.current[tt] !== n) return;
            setCache(c => ({ ...c, [tt]: { datos: data, cargando: false, error: null } }));
        } catch (err) {
            if (pedido.current[tt] !== n) return;
            setCache(c => ({ ...c, [tt]: { ...(c[tt] || {}), cargando: false, error: errorDeApi(err) } }));
        }
    }, []);
    const pedidos = useRef(new Set());
    useEffect(() => {
        if (vista !== 'resumen' || pedidos.current.has(t)) return undefined;
        const h = setTimeout(() => { pedidos.current.add(t); cargar(t); }, 0);
        return () => clearTimeout(h);
    }, [t, vista, cargar]);
    // Un gasto corregido o leído cambia el resumen: se vuelve a pedir al volver a él.
    const invalidar = useCallback((tt) => {
        pedidos.current.delete(tt);
        setCache(c => { const x = { ...c }; delete x[tt]; return x; });
    }, []);

    // Si se llegó sin `t` (o sin vista), se dejan en la URL: el enlace se puede pegar tal cual.
    useEffect(() => {
        if (params.t !== t || (params.f && params.f !== vista)) poner({ t, f: vista === 'resumen' ? null : vista });
    }, [params.t, params.f, t, vista, poner]);

    const elegir = (tt) => poner({ t: tt });
    const setVista = (v, tt) => poner({ f: v === 'resumen' ? null : v, ...(tt ? { t: tt } : {}) });
    const cambiarAnio = (a) => {
        const actual = trimestreDe(hoy);
        elegir(a === anioHoy ? trimestrePorDefecto(hoy) : `${a}-T4` > actual ? actual : `${a}-T4`);
    };

    if (!dt) return null;
    const st = cache[t];
    const est = estadoDe(dt, hoy);
    const diasPlazo = diasEntreFx(hoy, dt.plazo303);
    const anios = [anioHoy, anioHoy - 1];

    return (
        <div className="fx-pila">
            <div className="fx-tri-cab fx-in">
                <div>
                    <div className="fx-eyebrow fx-eyebrow-gris">Trimestres · estimado, lo presenta la gestoría</div>
                    <h2 className="fx-display fx-h2">{dt.q}T {dt.anio} · {MESES_FX[dt.m0]} – {MESES_FX[dt.m0 + 2]}</h2>
                </div>
                <select className="fx-select fx-select-peq" aria-label="Año" value={dt.anio} onChange={e => cambiarAnio(Number(e.target.value))}>
                    {anios.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
            </div>

            <div className="fx-tris" role="group" aria-label={`Trimestres de ${dt.anio}`}>
                {[1, 2, 3, 4].map(q => {
                    const d = datosTrimestre(`${dt.anio}-T${q}`);
                    const e = estadoDe(d, hoy);
                    return (
                        <button key={q} type="button" className={`fx-tri fx-in${e.clave === 'curso' ? ' fx-tri-curso' : ''}`} style={{ '--i': q }}
                            aria-pressed={d.t === t} disabled={e.clave === 'futuro'} onClick={() => elegir(d.t)}>
                            <span className="fx-tri-n">{q}T</span>
                            <span className="fx-tri-m">{MESES_CORTOS_FX[d.m0]} – {MESES_CORTOS_FX[d.m0 + 2]}</span>
                            <span className={`fx-chip fx-chip-${e.chip}`}>{e.texto}</span>
                        </button>
                    );
                })}
            </div>

            <div className="fx-plazos" aria-label="Plazos">
                <span className={`fx-chip fx-chip-${est.chip}`}>{est.texto}</span>
                <span className="fx-chip fx-chip-borde">303 y 130 hasta el {fechaEs(dt.plazo303)}</span>
                {dt.q === 4 && <span className="fx-chip fx-chip-borde">111 hasta el {fechaEs(`${dt.anio + 1}-01-20`)}</span>}
                {est.clave !== 'futuro' && est.clave !== 'cerrado' && (
                    <span className={`fx-chip ${diasPlazo <= 5 ? 'fx-chip-vence' : 'fx-chip-gris'}`}>{diasPlazo >= 0 ? `faltan ${entero(diasPlazo)} días` : 'plazo pasado'}</span>
                )}
            </div>

            <div className="fx-seg fx-tri-vistas" role="group" aria-label="Qué ver del trimestre">
                {VISTAS.map(v => (
                    <button key={v.id} type="button" aria-pressed={vista === v.id} onClick={() => setVista(v.id)}>{v.label}</button>
                ))}
            </div>

            {vista === 'resumen' && <Resumen st={st} recargar={() => cargar(t)} ir={ir} setVista={setVista} />}
            {vista === 'gastos' && <GastosTrimestre key={t} t={t} etiqueta={`${dt.q}T ${dt.anio}`} onCambio={() => invalidar(t)} />}
            {vista === 'paquete' && <PaqueteGestoria key={t} t={t} etiqueta={`${dt.q}T ${dt.anio} (${MESES_CORTOS_FX[dt.m0]}-${MESES_CORTOS_FX[dt.m0 + 2]})`} />}
            {vista !== 'resumen' && <p className="fx-graf-nota">Estimación para preparar el cierre: los modelos los presenta la gestoría.</p>}
        </div>
    );
}

export default TrimestresVista;
