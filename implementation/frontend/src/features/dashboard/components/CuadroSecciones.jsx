// Las secciones del cuadro de mando de dirección (DashboardView). Pintan lo que
// devuelven /api/cuadro-mando/negocio y /finanzas TAL CUAL: aquí no se rehace
// ninguna cuenta de dinero, solo la presentación (anchos de barra, sumas de una
// tubería ya calculada por fila). El criterio de cada cifra está en
// services/cuadroDireccion.js y docs/conocimiento/cuadro-mando/.
import { useState } from 'react';
import { Importe, Ico, eur, entero, AvisoFx, MESES_FX, MESES_CORTOS_FX, fechaEs } from '../../facturacion/estilo';
import { GraficoMensual } from '../../facturacion/components/hoy/GraficoMensual';
import { pct, energia, enlace, fuenteEstructura, mesesTexto } from '../logic/cuadroFormato';

const numEs = (v, dec = 1) => (v == null || isNaN(v) ? '—' : Number(v).toLocaleString('es-ES', { maximumFractionDigits: dec }));
const ext = { target: '_blank', rel: 'noopener noreferrer' };
const plural = (n, s, p = `${s}s`) => `${entero(n)} ${Number(n) === 1 ? s : p}`;

/** Minigráfico (mismo dibujo que el de Facturación): el último punto, en tinta. */
export function Spark({ vals, alta = false }) {
    const v = (vals || []).map(x => Number(x) || 0);
    if (v.length < 2) return null;
    const mx = Math.max(...v), mn = Math.min(0, ...v);
    const rango = (mx - mn) || 1;
    const pts = v.map((x, i) => [i / (v.length - 1) * 100, 100 - ((x - mn) / rango) * 88 - 6]);
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ');
    const u = pts[pts.length - 1];
    return (
        <div className={`fx-spark${alta ? ' fx-spark-alta' : ''}`} aria-hidden="true">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none">
                <path className="fx-sp-a" d={`${d} L${u[0]},100 L${pts[0][0]},100 Z`} />
                <path className="fx-sp-l" d={d} />
            </svg>
            <i style={{ left: `${u[0]}%`, top: `${u[1]}%` }} />
        </div>
    );
}

export function CabSeccion({ eyebrow, titulo, children, accion = null }) {
    return (
        <div className="cm-sec-cab">
            <div>
                <div className="fx-eyebrow">{eyebrow}</div>
                <h2 className="fx-display fx-h2">{titulo}</h2>
                {children && <p>{children}</p>}
            </div>
            {accion}
        </div>
    );
}

function Kpi({ k, v, nota, nota2, alerta, apagado, onClick, i = 0, title }) {
    return (
        <button type="button" className={`fx-kpi fx-in${alerta ? ' fx-kpi-alerta' : ''}${apagado ? ' fx-kpi-apagado' : ''}`}
            style={{ '--i': i + 2 }} onClick={onClick} title={title}>
            <span className="fx-kpi-k">{k}</span>
            <span className="fx-kpi-v">{v}</span>
            {nota && <span className="fx-kpi-nota">{nota}</span>}
            {nota2 && <span className="fx-kpi-nota">{nota2}</span>}
        </button>
    );
}

const Sk = ({ h = 120, w = '100%', r = 20 }) => <div className="fx-sk" style={{ height: h, width: w, borderRadius: r }} />;

export function EsqueletoTarjeta({ alto = 220 }) {
    return (
        <div className="fx-card fx-pad" aria-busy="true">
            <div className="fx-sk fx-sk-linea" style={{ width: '35%' }} />
            <div className="fx-sk fx-sk-cifra" style={{ marginTop: 16 }} />
            <div className="fx-sk" style={{ marginTop: 16, height: alto - 90 }} />
        </div>
    );
}

// ════════════════════════════════════════════════════════════════════════════
// ARRIBA: el EBITDA y las seis cifras
// ════════════════════════════════════════════════════════════════════════════
function variacionTexto(acum, anio) {
    if (!acum) return null;
    if (acum.comparable === false) return `sin comparar con ${anio - 1}`;
    const v = acum.variacion_pct;
    if (v == null) return null;
    if (v >= 100) { const veces = 1 + v / 100; return `${veces >= 10 ? entero(veces) : numEs(veces, 1)} veces lo de ${anio - 1}`; }
    return `${v >= 0 ? '+' : '−'}${numEs(Math.abs(v), 0)} % frente a ${anio - 1}`;
}

export function Arriba({ f, esteAnio, mesHoy, ir }) {
    if (!f) {
        return (
            <div className="cm-top" aria-busy="true" aria-label="Calculando las cifras de la empresa">
                <div className="fx-card fx-pad cm-sk-hero">
                    <div className="fx-sk fx-sk-linea" style={{ width: '40%' }} />
                    <div className="fx-sk fx-sk-cifra" style={{ marginTop: 22, height: 60 }} />
                    <div className="fx-sk fx-sk-linea" style={{ marginTop: 18, width: '75%' }} />
                    <div className="fx-sk" style={{ marginTop: 18, height: 56 }} />
                    <p className="cm-act">Leyendo la facturación y los gastos de Drive: tarda unos segundos la primera vez.</p>
                </div>
                <div className="cm-kpis">{Array.from({ length: 6 }, (_, i) => <Sk key={i} h={128} />)}</div>
            </div>
        );
    }
    const p = f.pyg;
    const c = f.caja;
    const pr = f.prevision;
    const acum = f.ventas?.acumulado?.sl;
    const hasta = esteAnio ? mesHoy : 11;
    const serie = (p.meses || []).slice(0, hasta + 1).reduce((acc, m) => [...acc, (acc[acc.length - 1] || 0) + m.ebitda], []);
    const kpis = [
        { k: `Facturado ${f.anio}`, v: <Importe n={p.ingresos} dec={0} />, ir: 'resultados',
            nota: variacionTexto(acum, f.anio) || 'sin IVA', nota2: <>CAE <b>{eur(p.ingresosCae, 0)}</b> · servicios <b>{eur(p.ingresosIng, 0)}</b></> },
        { k: 'Margen bruto', v: <Importe n={p.margenBruto} dec={0} />, ir: 'resultados',
            nota: <><b>{pct(p.margenBrutoPct)}</b> de lo facturado</>, nota2: 'tras bonos, comisiones, ITP y técnicos' },
        { k: 'Te deben', v: <Importe n={c.teDeben} dec={0} />, ir: 'caja', alerta: c.vencido > 0 && c.vencido / Math.max(1, c.teDeben) > 0.15,
            nota: <>con IVA · {plural(c.nTeDeben, 'factura')}</>, nota2: c.vencido > 0 ? <>vencido <b>{eur(c.vencido, 0)}</b></> : 'nada vencido' },
        { k: 'Circulante neto', v: <Importe n={c.circulante} dec={0} />, ir: 'caja',
            nota: 'lo que te deben, menos bonos e impuestos por pagar', nota2: c.bonosPorPagar > 0 ? <>bonos por pagar <b>{eur(c.bonosPorPagar, 0)}</b></> : null },
        { k: 'Cartera ponderada', v: <Importe n={pr.cartera} dec={0} />, ir: 'prevision',
            nota: <>margen <b>{eur(pr.carteraMargen, 0)}</b></>, nota2: 'lo que hay en marcha, por lo que suele salir' },
        pr.cierreAnio
            ? { k: `Cierre ${f.anio}`, v: <Importe n={pr.cierreAnio.esperado ?? pr.cierreAnio.seguro} dec={0} />, ir: 'prevision',
                nota: 'facturado + por facturar + lo enviado que llega al 31/12',
                nota2: <>seguro <b>{eur(pr.cierreAnio.seguro, 0)}</b>{pr.cierreAnio.maximo > (pr.cierreAnio.esperado ?? 0) + 1 ? <> · hasta <b>{eur(pr.cierreAnio.maximo, 0)}</b></> : null}</> }
            : { k: 'Bonos por pagar', v: <Importe n={c.bonosPorPagar} dec={0} />, ir: 'caja', nota: 'de lotes facturados o cobrados' },
    ];
    return (
        <div className="cm-top">
            <article className="fx-card fx-hero cm-hero fx-in" style={{ '--i': 1 }}>
                <div className="fx-filete-fino" />
                <div className="fx-hero-top">
                    <span className="fx-eyebrow">EBITDA · {f.anio}{esteAnio ? ` · a ${fechaEs(f.hoy).slice(0, 5)}` : ''}</span>
                    {p.fiable ? <span className="fx-pildora">sin IVA · estimado</span> : <span className="fx-chip fx-chip-ambar">provisional</span>}
                </div>
                <Importe n={p.ebitda} dec={0} className="fx-hero-v" />
                <p className="fx-hero-tit">
                    {p.ebitdaPct != null
                        ? <>Un <span className="fx-mark">{pct(p.ebitdaPct)}</span> de lo facturado queda como resultado de explotación</>
                        : <>Sin facturación en {f.anio} todavía</>}
                </p>
                <Spark vals={serie} alta />
                <div className="fx-spark-ejes"><span>ene</span><span>{esteAnio ? `${MESES_CORTOS_FX[mesHoy]} · acumulado` : 'dic'}</span></div>
                <ul className="cm-ec">
                    <li><span>Facturado (sin IVA)</span><b>{eur(p.ingresos, 0)}</b></li>
                    <li><span>− Coste directo (bonos, comisiones, ITP, técnicos)</span><b>{eur(-p.costeDirecto, 0)}</b></li>
                    <li><span>− Estructura ({fuenteEstructura(p.gastos, { corta: true })})</span><b>{eur(-p.estructura, 0)}</b></li>
                    <li className="cm-ec-tot"><span>= EBITDA</span><b>{eur(p.ebitda, 0)}</b></li>
                </ul>
                {!p.fiable && (
                    <AvisoFx tono="ambar" accion={<a className="fx-btn fx-btn-sec fx-btn-peq" href={enlace('?tab=facturacion&sub=trimestres')} {...ext}>Leerlos</a>}>
                        <b>{plural(p.gastos.sinLeer, 'factura de gasto', 'facturas de gasto')} sin leer en Drive.</b> No restan todavía: el EBITDA real será menor.
                        {!p.gastos.drive && ' Drive no respondió para algún trimestre.'}
                    </AvisoFx>
                )}
            </article>
            <div className="cm-kpis">
                {kpis.map((x, i) => <Kpi key={x.k} {...x} i={i} onClick={() => ir(x.ir)} />)}
            </div>
        </div>
    );
}

// ════════════════════════════════════════════════════════════════════════════
// REQUIERE TU ATENCIÓN
// ════════════════════════════════════════════════════════════════════════════
export function Atencion({ items, cargandoFinanzas }) {
    const [todo, setTodo] = useState(false);
    const CORTE = 6;
    const vis = todo ? items : items.slice(0, CORTE);
    return (
        <article className="fx-card fx-pad fx-in" style={{ '--i': 3 }}>
            <div className="fx-card-cab">
                <div>
                    <div className="fx-eyebrow">Requiere tu atención</div>
                    <h3 className="fx-display fx-h3">{items.length ? plural(items.length, 'cosa', 'cosas') : 'Nada pendiente'}</h3>
                </div>
                {cargandoFinanzas && <span className="fx-pildora">faltan las de facturación…</span>}
            </div>
            {!items.length ? (
                <div className="fx-vacio fx-vacio-peq">
                    <span className="fx-tile fx-tile-l fx-tile-verde"><Ico n="check" size={22} /></span>
                    <p>Ni lotes por facturar, ni bonos por pagar, ni facturas vencidas.</p>
                </div>
            ) : (
                <ul className="cm-ls cm-ls-fila">
                    {vis.map((a, i) => (
                        <li key={a.clave || i}>
                            <span className={`fx-tile fx-tile-${a.tono === 'vence' ? 'vence' : a.tono === 'ambar' ? 'ambar' : 'gris'}`}><Ico n={a.tono === 'gris' ? 'info' : 'alerta'} size={18} /></span>
                            <span className="cm-ls-tit">{a.texto}</span>
                            <span className="cm-ls-imp">{a.importe ? eur(a.importe, 0) : ''}</span>
                            {a.link ? <a className="fx-link cm-ls-acc" href={enlace(a.link)} {...ext} title="Se abre en otra pestaña"><span>Ver</span><Ico n="enlace" size={15} /></a> : <span className="cm-ls-acc" />}
                        </li>
                    ))}
                </ul>
            )}
            {items.length > CORTE && (
                <button type="button" className="fx-link cm-mas" aria-expanded={todo} onClick={() => setTodo(v => !v)}>
                    {todo ? 'Ver menos' : `Ver las ${items.length}`}<Ico n={todo ? 'arriba' : 'abajo'} size={16} />
                </button>
            )}
        </article>
    );
}

// ════════════════════════════════════════════════════════════════════════════
// SALUD
// ════════════════════════════════════════════════════════════════════════════
const TONO_TXT = { ok: 'Bien', ambar: 'Vigilar', gris: 'Para saber' };

export function Salud({ f }) {
    if (!f) return <div className="cm-salud">{Array.from({ length: 8 }, (_, i) => <Sk key={i} h={132} />)}</div>;
    return (
        <div className="cm-salud">
            {f.salud.map((s, i) => (
                <div key={s.id} className={`cm-ind cm-ind-${s.tono} fx-in`} style={{ '--i': i + 1 }}>
                    <span className="cm-ind-k">{s.label}</span>
                    <span className="cm-ind-v">
                        {s.valor == null ? '—' : s.unidad === '€/mes' ? eur(s.valor, 0) : <>{s.mas ? '+' : ''}{numEs(s.valor, s.unidad === '%' ? 1 : 0)}<small>{s.unidad === '%' ? ' %' : ` ${s.unidad}`}</small></>}
                        {s.unidad === '€/mes' && s.valor != null && <small> /mes</small>}
                    </span>
                    <span className={`fx-chip fx-chip-${s.tono === 'ok' ? 'ok' : s.tono === 'ambar' ? 'ambar' : 'gris'}`}>{TONO_TXT[s.tono] || 'Para saber'}</span>
                    <span className="cm-ind-n">{s.nota}</span>
                </div>
            ))}
        </div>
    );
}

// ════════════════════════════════════════════════════════════════════════════
// CUENTA DE RESULTADOS
// ════════════════════════════════════════════════════════════════════════════
function BarrasEbitda({ meses, mesHoy, esteAnio }) {
    const w = 600, h = 170, pl = 6, pr = 6, pt = 14, pb = 22;
    const vals = meses.map(m => m.ebitda);
    const max = Math.max(1, ...vals.map(Math.abs));
    const hayNeg = vals.some(v => v < 0);
    const cero = hayNeg ? pt + (h - pt - pb) * (Math.max(...vals, 0) / (Math.max(...vals, 0) + Math.abs(Math.min(...vals, 0)) || 1)) : h - pb;
    const escala = hayNeg ? (h - pt - pb) / ((Math.max(...vals, 0) + Math.abs(Math.min(...vals, 0))) || 1) : (h - pt - pb) / max;
    const slot = (w - pl - pr) / 12, bw = Math.min(26, slot * 0.6);
    const etiqueta = `EBITDA de cada mes: ${meses.map((m, i) => `${MESES_FX[i]} ${eur(m.ebitda, 0)}`).join(', ')}`;
    return (
        <svg className="cm-barras" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={etiqueta}>
            <line className="cm-b-cero" x1={pl} x2={w - pr} y1={cero} y2={cero} />
            {meses.map((m, i) => {
                const fut = esteAnio && i > mesHoy;
                const alto = Math.max(fut ? 0 : 2, Math.abs(m.ebitda) * escala);
                const x = pl + i * slot + (slot - bw) / 2;
                const y = m.ebitda >= 0 ? cero - alto : cero;
                return (
                    <g key={i}>
                        <rect x={x} y={y} width={bw} height={fut ? 0 : alto} rx="4" className={m.ebitda >= 0 ? 'cm-b-pos' : 'cm-b-neg'} style={{ '--i': i }}>
                            <title>{`${MESES_FX[i]}: EBITDA ${eur(m.ebitda, 0)} · facturado ${eur(m.ingresos, 0)} · estructura ${eur(m.estructura, 0)}`}</title>
                        </rect>
                        <text x={x + bw / 2} y={h - 6} textAnchor="middle" className={esteAnio && i === mesHoy ? 'cm-b-hoy' : ''}>{MESES_CORTOS_FX[i].slice(0, 1).toUpperCase()}</text>
                    </g>
                );
            })}
        </svg>
    );
}

export function Resultados({ f, esteAnio, mesHoy }) {
    if (!f) return <div className="cm-rej cm-rej-57"><EsqueletoTarjeta alto={420} /><EsqueletoTarjeta alto={420} /></div>;
    const p = f.pyg;
    const cb = p.cobertura;
    const io = p.ingPorOrigen || {};
    return (
        <div className="cm-rej cm-rej-57">
            <article className="fx-card fx-pad cm-pyg fx-in" style={{ '--i': 1 }}>
                <div className="fx-card-cab">
                    <div>
                        <div className="fx-eyebrow">Cuenta de resultados · {f.anio}</div>
                        <h3 className="fx-display fx-h3">De lo facturado al EBITDA</h3>
                    </div>
                    <span className="fx-pildora">sin IVA</span>
                </div>
                <dl className="fx-filas">
                    <div className="fx-fila"><dt>Venta de ahorro CAE<small>{plural(cb.nVentas, 'factura')} a Sujetos Obligados</small></dt><dd>{eur(p.ingresosCae, 0)}</dd></div>
                    <div className="fx-fila"><dt>Servicios (serie ING)<small>todo lo que no es venta de CAE</small></dt><dd>{eur(p.ingresosIng, 0)}</dd></div>
                    {io.CEE > 0 && <div className="fx-fila cm-fila-sub"><dt>CEE directos</dt><dd className="cm-menos">{eur(io.CEE, 0)}</dd></div>}
                    {io.GESTION_CAE > 0 && <div className="fx-fila cm-fila-sub"><dt>Honorarios de gestión CAE</dt><dd className="cm-menos">{eur(io.GESTION_CAE, 0)}</dd></div>}
                    {io.OTROS > 0 && <div className="fx-fila cm-fila-sub"><dt>Informes, ingeniería y otros</dt><dd className="cm-menos">{eur(io.OTROS, 0)}</dd></div>}
                    <div className="fx-fila cm-fila-res"><dt>Ingresos</dt><dd>{eur(p.ingresos, 0)}</dd></div>
                    <div className="fx-fila"><dt>Coste directo del CAE<small>bonos a clientes, comisiones de partner, ITP y certificados, expediente a expediente</small></dt><dd>{eur(-p.costeDirectoCae, 0)}</dd></div>
                    <div className="fx-fila"><dt>Técnicos de los CEE directos<small>{plural(cb.nCeeFact, 'CEE facturado', 'CEE facturados')} × {eur(cb.costeUnitCee, 2)}</small></dt><dd>{eur(-p.costeCee, 0)}</dd></div>
                    <div className="fx-fila cm-fila-res"><dt>Margen bruto<small>{pct(p.margenBrutoPct)} de los ingresos</small></dt><dd>{eur(p.margenBruto, 0)}</dd></div>
                    <div className="fx-fila"><dt>Estructura<small>{fuenteEstructura(p.gastos)}{p.fml > 0 ? `, con la FML de Fran (${eur(p.fml, 0)})` : ''}{p.gastos.sinLeer ? ` · ${entero(p.gastos.sinLeer)} sin leer` : ''}</small></dt><dd>{eur(-p.estructura, 0)}</dd></div>
                    {(p.gastos.trimestres || []).map(q => {
                        const est = q.enCurso && p.gastos.estimado ? p.gastos.estimado : null;
                        const que = q.error ? 'Drive no respondió'
                            : q.fuente === 'LIBRO' ? 'libro de la gestoría'
                                : est ? 'en curso, estimado'
                                    : `leído en Drive${q.sinLeer && !q.enCurso ? ` · ${entero(q.sinLeer)} sin leer` : ''}`;
                        const det = [est ? `${mesesTexto(est.meses)} a la media de los cerrados (${eur(est.mediaMensual, 0)}/mes)` : null,
                            q.enCurso && q.sinLeer ? `${plural(q.sinLeer, 'factura', 'facturas')} sin leer todavía` : null].filter(Boolean).join(' · ');
                        return (
                            <div key={q.t} className="fx-fila cm-fila-sub">
                                <dt>{q.t.slice(-2)} · {que}{det ? <small>{det}</small> : null}</dt>
                                <dd className="cm-menos">{q.error ? '—' : eur(-((q.base || 0) + (est?.importe || 0)), 0)}</dd>
                            </div>
                        );
                    })}
                    <div className="fx-fila cm-fila-ebitda"><dt>EBITDA<small>{pct(p.ebitdaPct)} de los ingresos</small></dt><dd>{eur(p.ebitda, 0)}</dd></div>
                    {p.inversiones > 0 && <div className="fx-fila"><dt>Inversiones del año<small>fuera del EBITDA</small></dt><dd className="cm-menos">{eur(p.inversiones, 0)}</dd></div>}
                </dl>
                <details className="cm-como">
                    <summary><Ico n="info" size={18} />Cómo se calcula<Ico n="abajo" size={16} /></summary>
                    <ul>
                        <li><b>Ingresos</b>: lo facturado por la sociedad (series ING y CAE, más las ventas CAE de Drive), sin IVA ni suplidos. La FML de Fran no es ingreso: es un gasto de la sociedad.</li>
                        <li><b>Coste directo del CAE</b>: cada venta se casa con su lote ({entero(cb.nCasadas)} de {entero(cb.nVentas)}) y lleva el margen que calculan sus expedientes al precio real de esa factura. Lo que no casa con ningún lote ({eur(cb.caeSinCasar, 0)}, ventas antiguas por Drive) lleva el margen medio ({pct(1 - cb.pctCosteMedio)}).</li>
                        <li><b>Técnicos de los CEE directos</b>: el honorario medio sellado al conciliar las facturas de los certificadores, por cada CEE facturado. Las tasas del registro son suplidos que paga el cliente: no son ingreso ni coste.</li>
                        <li><b>Estructura</b>: los trimestres cerrados salen del libro maestro que se entrega a la gestoría{p.gastos.libro?.nombre ? <> («{p.gastos.libro.nombre}»{p.gastos.libro.cuadra ? ', que cuadra con su RESUMEN' : ''})</> : ''}; si un trimestre no está en el libro, de la lectura de Drive. Con el IVA que no se deduce y sin lo que ya está arriba o no es gasto: los bonos a clientes{p.gastos.bonosLibro > 0 ? ` (${eur(p.gastos.bonosLibro, 0)} en el libro, por fecha de pago)` : ''}, los certificadores y las tasas del registro de los CEE del CAE ({eur(p.gastos.certificadores, 0)}) y las inversiones ({eur(p.inversiones, 0)}). El trimestre en curso cuenta cada mes con lo leído o, si es menos, con la media mensual de los cerrados: las facturas de un mes llegan después.</li>
                        <li>Es una estimación de gestión, no la contabilidad oficial: la cierra la gestoría.</li>
                    </ul>
                </details>
            </article>
            <div className="cm-rej">
                <article className="fx-card fx-pad fx-graf fx-in" style={{ '--i': 2 }}>
                    <GraficoMensual meses={f.ventas?.meses || []} prev={null} series={['ING', 'CAE']} clave="sl" anio={f.anio}
                        mesHoy={mesHoy} lineas={f.ventas?.lineas || {}} quien="BROKERGY" esteAnio={esteAnio} />
                </article>
                <article className="fx-card fx-pad fx-in" style={{ '--i': 3 }}>
                    <div className="fx-eyebrow">EBITDA de cada mes</div>
                    <h3 className="fx-display fx-h3">Los meses que se factura un lote tiran del año</h3>
                    <BarrasEbitda meses={p.meses} mesHoy={mesHoy} esteAnio={esteAnio} />
                    <ul className="cm-ley">
                        <li><i style={{ '--c': 'var(--s-cae)' }} />mes con resultado</li>
                        <li><i style={{ '--c': 'var(--o1)' }} />la estructura pesa más que lo facturado</li>
                    </ul>
                </article>
            </div>
        </div>
    );
}

// ════════════════════════════════════════════════════════════════════════════
// CAJA Y CIRCULANTE
// ════════════════════════════════════════════════════════════════════════════
export function Caja({ f }) {
    if (!f) return <div className="cm-rej cm-rej-2"><EsqueletoTarjeta alto={360} /><EsqueletoTarjeta alto={360} /></div>;
    const c = f.caja;
    const t = c.trimestre || {};
    return (
        <div className="cm-rej cm-rej-2">
            <article className="fx-card fx-pad fx-in" style={{ '--i': 1 }}>
                <div className="fx-eyebrow">Circulante neto</div>
                <h3 className="fx-display fx-h3">Lo que te deben, menos lo que ya debes tú</h3>
                <Importe n={c.circulante} dec={0} className="cm-caja-v" />
                <dl className="fx-filas">
                    <div className="fx-fila"><dt>Te deben<small>con IVA · {plural(c.nTeDeben, 'factura')} sin cobrar, de cualquier año</small></dt><dd>{eur(c.teDeben, 0)}</dd></div>
                    <div className="fx-fila"><dt>Bonos por pagar a clientes<small>de lotes ya facturados{c.bonosPorPagarCobrados > 0 ? `; ${eur(c.bonosPorPagarCobrados, 0)} de lotes ya COBRADOS` : ''}</small></dt><dd>{eur(-c.bonosPorPagar, 0)}</dd></div>
                    <div className="fx-fila"><dt>IVA a ingresar · modelo 303<small>{t.etiqueta || 'trimestre en curso'}{t.parcial ? ', provisional' : ''}</small></dt><dd>{eur(-c.ivaAPagar, 0)}</dd></div>
                    {c.retenciones > 0 && <div className="fx-fila"><dt>Retenciones · modelo 111</dt><dd>{eur(-c.retenciones, 0)}</dd></div>}
                    <div className="fx-fila cm-fila-res"><dt>Circulante neto</dt><dd>{eur(c.circulante, 0)}</dd></div>
                </dl>
                <p className="fx-graf-nota">No es el saldo del banco (la app no lo lee): es lo que quedará cuando se cobre lo pendiente y se pague lo comprometido.</p>
            </article>
            <article className="fx-card fx-pad fx-in" style={{ '--i': 2 }}>
                <div className="fx-eyebrow">Cobros</div>
                <h3 className="fx-display fx-h3">{c.diasCobro != null ? <>Se cobra en <span className="fx-mark">{plural(c.diasCobro, 'día')}</span> de media</> : 'Sin cobros con fecha este año'}</h3>
                <div className="cm-mini">
                    <div><span>Cobrado en {f.anio}</span><b>{eur(c.cobradoAnio, 0)}</b><small>con IVA</small></div>
                    <div><span>Vencido</span><b>{eur(c.vencido, 0)}</b><small>{c.nVencidas ? plural(c.nVencidas, 'factura') : 'nada vencido'}</small></div>
                    <div><span>Te debe el CAE</span><b>{eur(c.porLinea?.CAE?.pendiente || 0, 0)}</b><small>se cobra en Lotes</small></div>
                    <div><span>Próximo plazo</span><b>{t.plazo?.dias != null ? `${entero(t.plazo.dias)} días` : '—'}</b><small>{t.plazo ? `modelo ${t.plazo.modelo}, ${fechaEs(t.plazo.fecha)}` : ''}</small></div>
                </div>
                {c.vencidas?.length > 0 && (<>
                    <div className="fx-sub-tit">Las más antiguas sin cobrar</div>
                    <ul className="cm-ls cm-ls-sin-tile">
                        {c.vencidas.slice(0, 5).map(v => (
                            <li key={v.id || v.numero}>
                                <span className="cm-ls-tit"><span className="fx-mono">{v.numero}</span> · {v.cliente}</span>
                                <span className="cm-ls-imp">{eur(v.total, 0)}</span>
                                <span className="cm-ls-det">vencida hace {plural(v.dias, 'día')}</span>
                                <a className="fx-link cm-ls-acc" href={enlace(v.linea === 'CAE' ? '?tab=lotes' : '?tab=facturacion&sub=facturas&f=vencidas')} {...ext}>Ver<Ico n="enlace" size={15} /></a>
                            </li>
                        ))}
                    </ul>
                </>)}
            </article>
        </div>
    );
}

// ════════════════════════════════════════════════════════════════════════════
// PREVISIÓN
// ════════════════════════════════════════════════════════════════════════════
const COLOR_TRAMO = { POR_FACTURAR: 'var(--s-cae)', MITECO: 'var(--s-cae)', VERIFICADOR: '#5d7f1c', LOTE: '#7d9a35', CIERRE: 'var(--o3)', OBRA: 'var(--o2)', CAPTACION: 'var(--o1)' };

export function Prevision({ f }) {
    if (!f) return <div className="cm-rej cm-rej-75"><EsqueletoTarjeta alto={480} /><EsqueletoTarjeta alto={300} /></div>;
    const pr = f.prevision;
    const max = Math.max(1, ...pr.tramos.map(t => t.bruto || 0));
    const ca = pr.cierreAnio;
    const esperado = ca ? (ca.esperado ?? ca.posible) : 0;
    const maximo = ca ? (ca.maximo ?? ca.posible) : 0;
    const maxCierre = ca ? Math.max(maximo, esperado, ca.seguro, ca.ytd, 1) : 1;
    const dF = ca?.diasFactura;
    const enCamino = ca?.lotes || [];
    const entran = enCamino.filter(l => l.entra);
    const pasan = enCamino.filter(l => !l.entra);
    return (
        <div className="cm-rej cm-rej-75">
            <article className="fx-card fx-pad fx-in" style={{ '--i': 1 }}>
                <div className="fx-card-cab">
                    <div>
                        <div className="fx-eyebrow">Cartera CAE · lo que viene</div>
                        <h3 className="fx-display fx-h3"><Importe n={pr.carteraCae} dec={0} /> ponderados</h3>
                    </div>
                    <span className="fx-pildora">margen {eur(pr.carteraMargen, 0)}</span>
                </div>
                <ul className="cm-ley">
                    <li><i style={{ '--c': '#e4ded2' }} />lo que valdría si sale todo</li>
                    <li><i style={{ '--c': 'var(--s-cae)' }} />lo que se espera, por lo que suele salir</li>
                </ul>
                <ul className="cm-esc">
                    {pr.tramos.map(t => (
                        <li key={t.id} className="cm-tramo">
                            <span className="cm-tramo-tit">{t.label}<span className="fx-chip fx-chip-gris">{t.horizonte}</span></span>
                            <span className="cm-tramo-v">{eur(t.base, 0)}<small>{t.bruto > t.base + 1 ? `de ${eur(t.bruto, 0)}` : 'al 100 %'}</small></span>
                            <span className="cm-pista" aria-hidden="true">
                                <i className="cm-p-bruto" style={{ width: `${(t.bruto / max) * 100}%` }} />
                                <i className="cm-p-pond" style={{ width: `${(t.base / max) * 100}%`, '--c': COLOR_TRAMO[t.id] }} />
                            </span>
                            <span className="cm-tramo-n">
                                {t.nExp ? <><b>{plural(t.nExp, 'expediente')}</b>{t.n ? ` en ${plural(t.n, 'lote')}` : ''} · {energia(t.mwh)} · </> : 'Nada aquí ahora · '}
                                {t.nota}
                            </span>
                        </li>
                    ))}
                </ul>
            </article>
            <div className="cm-rej">
                {ca && (
                    <article className="fx-card fx-pad fx-in" style={{ '--i': 2 }}>
                        <div className="fx-eyebrow">Cierre de {f.anio}</div>
                        <h3 className="fx-display fx-h3">Cómo acabará el año</h3>
                        <Importe n={esperado} dec={0} className="cm-cierre-v" />
                        <div className="cm-cierre-barra" role="img" aria-label={`Facturado ${eur(ca.ytd, 0)}, seguro ${eur(ca.seguro, 0)}, esperado ${eur(esperado, 0)}, máximo ${eur(maximo, 0)}`}>
                            <i style={{ width: `${(maximo / maxCierre) * 100}%`, background: '#e4ded2' }} />
                            <i style={{ width: `${(esperado / maxCierre) * 100}%`, background: 'var(--s-cae)' }} />
                            <i style={{ width: `${(ca.seguro / maxCierre) * 100}%`, background: 'var(--o2)' }} />
                            <i style={{ width: `${(ca.ytd / maxCierre) * 100}%`, background: 'var(--tinta)' }} />
                        </div>
                        <dl className="fx-filas">
                            <div className="fx-fila"><dt>Ya facturado</dt><dd>{eur(ca.ytd, 0)}</dd></div>
                            <div className="fx-fila"><dt>+ lo que ya se puede facturar<small>CAE emitido, presupuestos aceptados y CEE terminados</small></dt><dd>{eur(ca.seguro - ca.ytd, 0)}</dd></div>
                            <div className="fx-fila"><dt>+ lo enviado que se factura antes del 31/12<small>{plural(entran.length, 'lote')} · {dF?.mediana != null ? `${dF.mediana} días del envío al verificador a la factura (mediana de ${dF.n} lotes)` : 'sin histórico: a 60 días del envío'}</small></dt><dd>{eur(esperado - ca.seguro, 0)}</dd></div>
                            <div className="fx-fila cm-fila-res"><dt>Esperado</dt><dd>{eur(esperado, 0)}</dd></div>
                            {maximo > esperado + 1 && <div className="fx-fila"><dt>+ si el resto de lo enviado se adelanta<small>{plural(pasan.length, 'lote')} que tocan en {Number(f.anio) + 1} · hasta {eur(maximo, 0)}</small></dt><dd className="cm-menos">{eur(maximo - esperado, 0)}</dd></div>}
                        </dl>
                        {enCamino.length > 0 && (
                            <details className="cm-como">
                            <summary><Ico n="info" size={18} />Lote a lote: {entran.length} entran{pasan.length ? `, ${pasan.length} pasan a ${Number(f.anio) + 1}` : ''}<Ico n="abajo" size={16} /></summary>
                            <ul className="cm-lotes">
                                {enCamino.map(l => (
                                    <li key={l.codigo} className="cm-lote">
                                        <span className="cm-lote-cod" title={l.codigo}>{l.codigo}</span>
                                        <span className="cm-lote-det">{l.etapa === 'MITECO' ? 'En el Ministerio' : 'En el verificador'} · {plural(l.nExp, 'expediente')}{l.fechaEnvio ? ` · enviado el ${fechaEs(l.fechaEnvio).slice(0, 5)}` : ''} · factura hacia el {fechaEs(l.fechaPrevista).slice(0, 5)}{l.estado ? ` · «${l.estado}»` : ''}</span>
                                        <span className="cm-lote-imp">{eur(l.base, 0)}<small>margen {eur(l.margen, 0)}</small></span>
                                        <span className={`fx-chip ${l.entra ? 'fx-chip-ok' : 'fx-chip-gris'} cm-lote-est`}>{l.entra ? `entra en ${f.anio}` : `pasa a ${Number(f.anio) + 1}`}</span>
                                    </li>
                                ))}
                            </ul>
                            </details>
                        )}
                    </article>
                )}
                <article className="fx-card fx-pad fx-in" style={{ '--i': 3 }}>
                    <div className="fx-eyebrow">Servicios · lo que viene</div>
                    <h3 className="fx-display fx-h3"><Importe n={pr.carteraIng} dec={0} /> ponderados</h3>
                    <dl className="fx-filas">
                        {pr.tramosIng.map(t => (
                            <div key={t.id} className="fx-fila">
                                <dt>{t.label}<small>{t.id.startsWith('PRES') ? plural(t.n, 'presupuesto') : plural(t.n, 'CEE', 'CEE')}{t.prob < 1 ? ` · al ${pct(t.prob, 0)}, lo que se suele aceptar` : ''}</small></dt>
                                <dd>{eur(t.base, 0)}</dd>
                            </div>
                        ))}
                    </dl>
                    <p className="fx-graf-nota">
                        Medido en la propia app: el verificador deja el {pct(pr.ratioVerificado ?? 1, 0)} del ahorro estimado, se rechaza el {pct(pr.tasaRechazo, 1)} de los expedientes
                        {pr.conversion != null ? ` y convierte el ${pct(pr.conversion, 0)} de las propuestas (menos cuanto más antiguas)` : ''}.
                        {pr.mesesCubiertos != null && <> La cartera pondera {pr.mesesCubiertos >= 99 ? 'más de 99' : entero(pr.mesesCubiertos)} meses de estructura.</>}
                    </p>
                </article>
            </div>
        </div>
    );
}

// ════════════════════════════════════════════════════════════════════════════
// NEGOCIO CAE: de la propuesta al cobro
// ════════════════════════════════════════════════════════════════════════════
const sumaFilas = (fs) => fs.reduce((a, f) => { a.n++; a.mwh += f.mwh || 0; a.eur += (f.mwh || 0) * (f.precioSOGuardado || 0); return a; }, { n: 0, mwh: 0, eur: 0 });

function tuberiaCae(n) {
    const sinLote = (id) => n.filas.filter(f => !f.loteId && f.faseId === id);
    const fase = (id) => n.fases.find(x => x.id === id) || { label: id, desc: '', estados: [] };
    const capt = sumaFilas(n.captacion);
    return [
        { titulo: 'Captación', filas: [{ id: 'CAPTACION', label: 'Propuestas vivas', desc: 'Leads y propuestas sin aceptar todavía', ...capt, unidad: 'propuesta', href: '?tab=oportunidades', c: 'var(--o1)' }] },
        { titulo: 'Expedientes', filas: ['CEE_INICIAL', 'OBRA', 'CIERRE', 'LISTO'].map(id => ({
            id, label: fase(id).label, desc: fase(id).desc, ...sumaFilas(sinLote(id)), unidad: 'expediente',
            href: `?tab=expedientes&estados=${encodeURIComponent(fase(id).estados.join(','))}`, c: 'var(--o3)',
        })) },
        { titulo: 'Lotes', filas: n.etapas.map(e => ({ id: e.id, label: e.label, desc: e.desc, n: e.n, nExp: e.nExp, mwh: e.mwh, eur: e.base, unidad: 'lote', href: '?tab=lotes', c: 'var(--s-cae)', bonos: e.bonosPendientes })) },
    ];
}

export function NegocioCae({ n }) {
    const [etapa, setEtapa] = useState('ACTIVOS');
    if (!n) return <div className="cm-rej cm-rej-57"><EsqueletoTarjeta alto={520} /><EsqueletoTarjeta alto={520} /></div>;
    const grupos = tuberiaCae(n);
    const max = Math.max(1, ...grupos.flatMap(g => g.filas.map(f => f.eur || 0)));
    const lotes = n.lotes.filter(l => (etapa === 'ACTIVOS' ? l.etapa !== 'CERRADO' : l.etapa === etapa));
    const cuenta = (id) => n.lotes.filter(l => l.etapa === id).length;
    return (
        <div className="cm-rej cm-rej-57">
            <article className="fx-card fx-pad fx-in" style={{ '--i': 1 }}>
                <div className="fx-eyebrow">De la propuesta al cobro</div>
                <h3 className="fx-display fx-h3">Dónde está cada euro del CAE</h3>
                <p className="fx-graf-nota" style={{ marginTop: 6 }}>Facturación al precio de cada lote (o al guardado en cada expediente, si aún no tiene lote). Sin ponderar.</p>
                {grupos.map(g => (
                    <div key={g.titulo}>
                        <div className="cm-tubo-grupo">{g.titulo}</div>
                        <ul className="cm-esc" style={{ marginTop: 0 }}>
                            {g.filas.map(r => (
                                <li key={r.id} className="cm-tramo">
                                    <span className="cm-tramo-tit"><a className="fx-link" style={{ minHeight: 0 }} href={enlace(r.href)} {...ext}>{r.label}</a></span>
                                    <span className="cm-tramo-v">{eur(r.eur || 0, 0)}<small>{energia(r.mwh)}</small></span>
                                    <span className="cm-pista" aria-hidden="true"><i className="cm-p-pond" style={{ width: `${((r.eur || 0) / max) * 100}%`, '--c': r.c }} /></span>
                                    <span className="cm-tramo-n">
                                        <b>{plural(r.n, r.unidad)}</b>{r.unidad === 'lote' && r.nExp ? ` · ${plural(r.nExp, 'expediente')}` : ''}
                                        {r.bonos > 0 ? <> · bonos por pagar <b>{eur(r.bonos, 0)}</b></> : ''} · {r.desc}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </article>
            <article className="fx-card fx-pad fx-in" style={{ '--i': 2 }}>
                <div className="fx-card-cab">
                    <div>
                        <div className="fx-eyebrow">Lotes</div>
                        <h3 className="fx-display fx-h3">{plural(n.lotes.filter(l => l.etapa !== 'CERRADO').length, 'lote abierto', 'lotes abiertos')}</h3>
                    </div>
                    <a className="fx-link" href={enlace('?tab=lotes')} {...ext}>Ir a Lotes<Ico n="enlace" size={15} /></a>
                </div>
                <div className="fx-chips" role="group" aria-label="Filtrar los lotes por etapa">
                    <button type="button" className="fx-chip-f" aria-pressed={etapa === 'ACTIVOS'} onClick={() => setEtapa('ACTIVOS')}>Abiertos <b>{n.lotes.filter(l => l.etapa !== 'CERRADO').length}</b></button>
                    {n.etapas.filter(e => e.n > 0).map(e => (
                        <button key={e.id} type="button" className={`fx-chip-f${['POR_FACTURAR', 'POR_PAGAR'].includes(e.id) ? ' fx-chip-f-alerta' : ''}`} aria-pressed={etapa === e.id} onClick={() => setEtapa(e.id)}>
                            {e.label} <b>{cuenta(e.id)}</b>
                        </button>
                    ))}
                </div>
                {!lotes.length ? <div className="fx-vacio fx-vacio-peq"><p>Ningún lote en esta etapa.</p></div> : (
                    <ul className="cm-lotes">
                        {lotes.map(l => {
                            const et = n.etapas.find(e => e.id === l.etapa);
                            const tono = l.etapa === 'POR_FACTURAR' || l.etapa === 'POR_PAGAR' ? 'ambar' : l.etapa === 'CERRADO' ? 'ok' : l.etapa === 'POR_COBRAR' ? 'pizarra' : 'gris';
                            return (
                                <li key={l.id} className="cm-lote">
                                    <span className="cm-lote-cod" title={l.codigo}>{l.codigo}</span>
                                    <span className="cm-lote-det">
                                        {l.so || 'Sin S.O.'} · {plural(l.nExp, 'expediente')} · {energia(l.mwh)}
                                        {l.factura?.numero ? ` · ${l.factura.numero}` : ''}
                                        {l.etapa === 'POR_PAGAR' ? ` · faltan ${eur(l.bonosPendientes, 0)} de bonos (${l.nPagados}/${l.nExp} pagados)` : ''}
                                        {l.etapa !== 'CERRADO' && l.estado ? ` · «${l.estado}»` : ''}
                                    </span>
                                    <span className="cm-lote-imp">{l.base != null ? eur(l.base, 0) : '—'}<small>{l.fuente === 'factura' ? 'facturado' : l.fuente === 'verificado' ? 'verificado' : 'estimado'}</small><small>margen {eur(l.margen, 0)}</small></span>
                                    <span className={`fx-chip fx-chip-${tono} cm-lote-est`}>{et?.label || l.etapa}</span>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </article>
        </div>
    );
}

// ════════════════════════════════════════════════════════════════════════════
// OTROS SERVICIOS: CEE directos, informes, presupuestos · y la captación
// ════════════════════════════════════════════════════════════════════════════
export function OtrosServicios({ n, f }) {
    if (!n) return <div className="cm-rej cm-rej-2"><EsqueletoTarjeta alto={420} /><EsqueletoTarjeta alto={420} /></div>;
    const c = n.cee;
    const maxG = Math.max(1, ...c.grupos.filter(g => g.id !== 'FINALIZADO').map(g => g.n));
    const p = f?.presupuestos;
    const inf = n.informes;
    return (
        <div className="cm-rej cm-rej-2">
            <article className="fx-card fx-pad fx-in" style={{ '--i': 1 }}>
                <div className="fx-card-cab">
                    <div>
                        <div className="fx-eyebrow">CEE directos · {String(c.hoy).slice(0, 4)}</div>
                        <h3 className="fx-display fx-h3"><Importe n={c.facturadoAnio} dec={0} /> facturados</h3>
                    </div>
                    <a className="fx-link" href={enlace('?tab=cee-directos')} {...ext}>Ir a CEE<Ico n="enlace" size={15} /></a>
                </div>
                <div className="cm-mini">
                    <div><span>Facturas</span><b>{entero(c.nFacturasAnio)}</b><small>ticket medio {c.ticketMedio != null ? eur(c.ticketMedio, 0) : '—'}{c.facturadoAnterior ? ` · ${eur(c.facturadoAnterior, 0)} en ${Number(String(c.hoy).slice(0, 4)) - 1}` : ''}</small></div>
                    <div><span>Margen por CEE</span><b>{c.margenMedio != null ? eur(c.margenMedio, 0) : '—'}</b><small>{c.costeTecnicoMedio != null ? `menos el técnico, ${eur(c.costeTecnicoMedio, 0)} de media (${plural(c.nCosteTecnico, 'conciliado', 'conciliados')})` : 'sin facturas de técnico conciliadas'}</small></div>
                    <div><span>Por facturar</span><b>{eur(c.porFacturar.importe, 0)}</b><small>{c.porFacturar.n ? `${plural(c.porFacturar.n, 'terminado', 'terminados')} sin factura` : 'todo facturado'}</small></div>
                    <div><span>Por cobrar</span><b>{eur(c.porCobrar.importe, 0)}</b><small>{c.porCobrar.n ? `${plural(c.porCobrar.n, 'factura')} sin IVA` : 'todo cobrado'}</small></div>
                </div>
                <div className="fx-sub-tit">En marcha</div>
                <div className="cm-grupos">
                    {c.grupos.filter(g => g.id !== 'FINALIZADO').map(g => (
                        <div key={g.id} className="cm-grupo">
                            <div className="cm-grupo-top"><span>{g.label}</span><b>{entero(g.n)}</b></div>
                            <div className="fx-pista"><i style={{ width: `${(g.n / maxG) * 100}%`, background: 'var(--o2)' }} /></div>
                        </div>
                    ))}
                </div>
                <p className="fx-graf-nota">
                    {plural(c.altasAnio, 'encargo')} este año, {plural(c.terminadosAnio, 'registrado')}.
                    {c.diasMedianaEntrega != null && <> Del alta al registro, {plural(c.diasMedianaEntrega, 'día')} (mediana).</>}
                    {c.restosMigracion > 0 && <> {plural(c.restosMigracion, 'histórico')} de AppSheet de años pasados sin terminar no cuenta{c.restosMigracion === 1 ? '' : 'n'}.</>}
                </p>
                {c.topPartners?.length > 0 && (
                    <div className="cm-chips">
                        {c.topPartners.map(t => <span key={t.id || 'directo'} className="fx-chip fx-chip-gris">{t.nombre} · {entero(t.n)}</span>)}
                    </div>
                )}
            </article>
            <div className="cm-rej">
                <article className="fx-card fx-pad fx-in" style={{ '--i': 2 }}>
                    <div className="fx-card-cab">
                        <div>
                            <div className="fx-eyebrow">Presupuestos de servicios</div>
                            <h3 className="fx-display fx-h3">{p ? <>Se acepta el <span className="fx-mark">{pct(p.tasa_aceptacion, 0)}</span></> : 'Cargando…'}</h3>
                        </div>
                        <a className="fx-link" href={enlace('?tab=facturacion&sub=presupuestos')} {...ext}>Ver<Ico n="enlace" size={15} /></a>
                    </div>
                    {p ? (
                        <dl className="fx-filas">
                            <div className="fx-fila"><dt>Enviados, esperando respuesta<small>{plural(p.enviados?.n || 0, 'presupuesto')}</small></dt><dd>{eur(p.enviados?.importe || 0, 0)}</dd></div>
                            <div className="fx-fila"><dt>Aceptados<small>{plural(p.aceptados?.n || 0, 'presupuesto')}</small></dt><dd>{eur(p.aceptados?.importe || 0, 0)}</dd></div>
                            <div className="fx-fila"><dt>Aceptados sin facturar<small>{plural(p.por_facturar?.n || 0, 'presupuesto')}</small></dt><dd>{eur(p.por_facturar?.importe || 0, 0)}</dd></div>
                        </dl>
                    ) : <div className="fx-sk" style={{ height: 120, marginTop: 14 }} />}
                </article>
                {inf && (
                    <article className="fx-card fx-pad fx-in" style={{ '--i': 3 }}>
                        <div className="fx-eyebrow">Informes técnicos y CIT</div>
                        <h3 className="fx-display fx-h3">{inf.vivos ? plural(inf.vivos, 'informe en marcha', 'informes en marcha') : 'Ninguno en marcha'}</h3>
                        <div className="cm-chips">
                            {Object.entries(inf.porEstado).map(([e, k]) => <span key={e} className="fx-chip fx-chip-gris">{e.toLowerCase()} · {entero(k)}</span>)}
                        </div>
                        <p className="fx-graf-nota">{plural(inf.total, 'informe')} en total, {entero(inf.delAnio)} de este año. Memorias de Ayuntamiento, legalizaciones y CIT: se facturan en la serie ING.</p>
                    </article>
                )}
            </div>
        </div>
    );
}

export function Captacion({ n }) {
    if (!n) return <EsqueletoTarjeta alto={320} />;
    const o = n.oportunidades;
    const porFase = n.fasesCaptacion.map(fc => {
        const fs = n.captacion.filter(c => c.faseId === fc.id);
        const a = sumaFilas(fs);
        const pond = fs.reduce((s, f) => s + (f.mwh || 0) * (f.precioSOGuardado || 0) * (f.probConversion ?? o.conversion ?? 0), 0);
        return { ...fc, ...a, pond };
    }).filter(x => x.n > 0);
    const max = Math.max(1, ...porFase.map(x => x.eur));
    const mesHoy = Number(String(n.hoy).slice(5, 7)) - 1;
    return (
        <article className="fx-card fx-pad fx-in" style={{ '--i': 1 }}>
            <div className="fx-card-cab">
                <div>
                    <div className="fx-eyebrow">Captación CAE</div>
                    <h3 className="fx-display fx-h3">{plural(n.captacion.length, 'propuesta viva', 'propuestas vivas')}</h3>
                </div>
                <a className="fx-link" href={enlace('?tab=oportunidades')} {...ext}>Ir a Oportunidades<Ico n="enlace" size={15} /></a>
            </div>
            <div className="cm-rej cm-rej-2" style={{ marginTop: 6 }}>
                <ul className="cm-esc">
                    {porFase.map(x => (
                        <li key={x.id} className="cm-tramo">
                            <span className="cm-tramo-tit"><a className="fx-link" style={{ minHeight: 0 }} href={enlace(`?tab=oportunidades&opestado=${encodeURIComponent(x.estados[0])}`)} {...ext}>{x.label}</a></span>
                            <span className="cm-tramo-v">{eur(x.eur, 0)}<small>{x.pond ? `se esperan ${eur(x.pond, 0)}` : ''}</small></span>
                            <span className="cm-pista" aria-hidden="true">
                                <i className="cm-p-bruto" style={{ width: `${(x.eur / max) * 100}%` }} />
                                <i className="cm-p-pond" style={{ width: `${(x.pond / max) * 100}%`, '--c': 'var(--o2)' }} />
                            </span>
                            <span className="cm-tramo-n"><b>{plural(x.n, 'propuesta')}</b> · {energia(x.mwh)} · {x.desc}</span>
                        </li>
                    ))}
                </ul>
                <div>
                    <div className="fx-sub-tit" style={{ marginTop: 6 }}>Altas por mes · {String(n.hoy).slice(0, 4)}</div>
                    <Spark vals={(o.altasMes || []).slice(0, mesHoy + 1)} alta />
                    <div className="fx-spark-ejes"><span>ene</span><span>{MESES_CORTOS_FX[mesHoy]} · {entero(o.altasMes?.[mesHoy] || 0)} este mes</span></div>
                    <div className="fx-sub-tit">Cuánto convierte una propuesta</div>
                    <div className="cm-chips">
                        {(o.convPorEdad || []).filter(c => c.tasa != null).map(c => (
                            <span key={c.desde} className={`fx-chip ${c.tasa >= 0.5 ? 'fx-chip-ok' : c.tasa >= 0.2 ? 'fx-chip-gris' : 'fx-chip-ambar'}`}>
                                {c.desde ? `con ${c.desde} días` : 'recién hecha'} · {pct(c.tasa, 0)}
                            </span>
                        ))}
                    </div>
                    <p className="fx-graf-nota">
                        De las propuestas de hace 2 a 14 meses, acabó en expediente el <b>{pct(o.conversion, 0)}</b> ({entero(o.convertidas)} de {entero(o.cohorte)}).
                        Una propuesta sin respuesta pasados 3 meses casi no convierte: conviene llamar antes.
                    </p>
                </div>
            </div>
        </article>
    );
}
