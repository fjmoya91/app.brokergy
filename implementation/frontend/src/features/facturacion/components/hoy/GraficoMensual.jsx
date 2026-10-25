import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Ico, eur, entero, MESES_FX, MESES_CORTOS_FX } from '../../estilo';

// ─────────────────────────────────────────────────────────────────────────────
// Facturado por mes, sin IVA: columnas apiladas por serie (ING abajo, FML, CAE arriba), una
// sola escala y el año anterior como una MARCA fina del mismo mes. SVG propio, sin librería
// (docs del diseño, §6). Se dibuja con el ancho MEDIDO (ResizeObserver: el menú lateral cambia
// el ancho sin `resize`). Cada mes es enfocable: el desglose sale al pasar, al tocar o con el
// teclado (← →), y «Ver como tabla» da los mismos datos para leer o copiar.
//
// Las cifras son las de la API (`ventas.meses[i][serie].base` y el total del contribuyente,
// `ventas.meses[i][sl|autonomo].base`); aquí solo se calcula la geometría.
// ─────────────────────────────────────────────────────────────────────────────

const ORDEN = ['ING', 'FML', 'CAE'];
const COLOR = { ING: 'var(--s-ing)', FML: 'var(--s-fml)', CAE: 'var(--s-cae)' };
const INICIAL = ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

/** El techo de la escala: 4 rayas en 1/2/2,5/5 × 10ⁿ. */
function techo(v) {
    if (v <= 0) return 1000;
    const p = 10 ** Math.floor(Math.log10(v / 4));
    for (const m of [1, 2, 2.5, 5, 10]) if (m * p * 4 >= v) return m * p * 4;
    return 10 * p * 4;
}
/** «12,5 k», «1,2 M». */
function corto(v) {
    if (!v) return '0';
    const f = (x) => String(Math.round(x * 10) / 10).replace('.', ',');
    if (Math.abs(v) >= 1e6) return `${f(v / 1e6)} M`;
    if (Math.abs(v) >= 1e3) return `${f(v / 1e3)} k`;
    return String(Math.round(v));
}
const Punto = ({ s }) => <i className="fx-dot" style={{ '--c': COLOR[s] }} />;

export function GraficoMensual({ meses, prev, series, clave, anio, mesHoy, lineas, quien, esteAnio }) {
    const caja = useRef(null);
    const tip = useRef(null);
    const [ancho, setAncho] = useState(0);
    const [activo, setActivo] = useState(null);
    const [tabla, setTabla] = useState(false);

    useEffect(() => {
        const el = caja.current;
        if (!el) return undefined;
        const medir = () => setAncho(Math.round(el.clientWidth || 0));
        const t = setTimeout(medir, 0);
        if (typeof ResizeObserver === 'undefined') return () => clearTimeout(t);
        const ro = new ResizeObserver(medir);
        ro.observe(el);
        return () => { clearTimeout(t); ro.disconnect(); };
    }, []);

    const orden = ORDEN.filter(s => series.includes(s));
    const datos = Array.from({ length: 12 }, (_, i) => {
        const m = meses[i] || {};
        const p = prev?.[i]?.[clave]?.base;
        const fila = { i, futuro: esteAnio && i > mesHoy, total: Number(m[clave]?.base) || 0, prev: p == null ? null : Number(p) || 0 };
        orden.forEach(s => { fila[s] = Number(m[s]?.base) || 0; });
        return fila;
    });

    const w = Math.max(280, ancho || 0);
    const h = w < 480 ? 210 : 250, pl = 40, pr = 6, pt = 20, pb = 26;
    const ph = h - pt - pb, slot = (w - pl - pr) / 12, bw = Math.min(24, Math.max(10, slot * 0.56));
    const max = techo(Math.max(0, ...datos.map(m => m.total), ...datos.map(m => m.prev || 0)));
    const y = (v) => pt + ph - (v / max) * ph;
    const vivos = datos.filter(m => !m.futuro);
    const mMax = vivos.reduce((a, b) => (b.total > a.total ? b : a), vivos[0] || datos[0]);
    const etiquetar = new Set([mMax?.i, esteAnio ? mesHoy : -1]);
    const hayPrev = !!prev && datos.some(m => m.prev);

    // El desglose, al lado de la columna y DENTRO del gráfico (la tarjeta recorta lo que sale).
    useLayoutEffect(() => {
        const el = tip.current;
        if (!el || activo == null) return;
        const x0 = pl + activo * slot, x1 = x0 + slot;
        const tw = el.offsetWidth;
        const izq = x1 + 6 + tw <= w ? x1 + 6 : Math.max(0, x0 - 6 - tw);
        el.style.left = `${izq}px`;
        el.style.top = `${pt}px`;
    }, [activo, w, slot]);

    const tecla = (e, i) => {
        if (e.key === 'Escape') { setActivo(null); e.currentTarget.blur(); return; }
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        const j = Math.max(0, Math.min(11, i + (e.key === 'ArrowRight' ? 1 : -1)));
        caja.current?.querySelector(`[data-mes="${j}"]`)?.focus();
    };

    const varPrev = (m) => (m.prev ? (m.total - m.prev) / m.prev : null);
    const mA = activo == null ? null : datos[activo];
    const titulo = orden.length > 1 ? `${anio}, ${orden.join(' y ')}` : `${anio}, la serie ${orden[0]}`;
    const futuros = esteAnio && mesHoy < 11 ? MESES_FX.slice(mesHoy + 1) : [];

    return (
        <>
            <div className="fx-graf-cab">
                <div>
                    <div className="fx-eyebrow">Facturado por mes · sin IVA · {quien}</div>
                    <h3 className="fx-display fx-h3">{titulo}</h3>
                </div>
                <button type="button" className="fx-link" aria-expanded={tabla} onClick={() => setTabla(v => !v)}>
                    <Ico n="tabla" size={18} />{tabla ? 'Ver el gráfico' : 'Ver como tabla'}
                </button>
            </div>
            <ul className="fx-ley">
                {orden.map(s => <li key={s}><Punto s={s} />{s} <b>{eur(lineas?.[s]?.base || 0, 0)}</b></li>)}
                {hayPrev && <li><span className="fx-ley-linea" />{anio - 1}, el mismo mes</li>}
            </ul>

            <div className="fx-graf-caja" ref={caja} hidden={tabla} onMouseLeave={() => setActivo(null)}>
                {ancho > 0 && (
                    <svg className={`fx-graf-svg${activo != null ? ' fx-g-activo' : ''}`} width={w} height={h} viewBox={`0 0 ${w} ${h}`}
                        role="img" aria-label={`Facturado por mes en ${anio} por serie${hayPrev ? `, con ${anio - 1} de referencia` : ''}. Los mismos datos, en «Ver como tabla».`}>
                        {[0, 1, 2, 3, 4].map(k => {
                            const v = (max / 4) * k, yy = Math.round(y(v)) + 0.5;
                            return (
                                <g key={k}>
                                    <line className={k ? 'fx-g-rej' : 'fx-g-base'} x1={pl} x2={w - pr} y1={yy} y2={yy} />
                                    <text x={pl - 8} y={yy + 4} textAnchor="end">{corto(v)}</text>
                                </g>
                            );
                        })}
                        {datos.map(m => {
                            const i = m.i;
                            const x = pl + i * slot + (slot - bw) / 2;
                            const visibles = orden.filter(s => m[s] > 0);
                            let acc = 0;
                            const segs = visibles.map((s, j) => {
                                const y0 = y(acc), y1 = y(acc + m[s]); acc += m[s];
                                const yb = j > 0 ? y0 - 2 : y0;           // 2 px de papel entre tramos
                                const alto = yb - y1;
                                if (alto <= 0.5) return null;
                                const r = j === visibles.length - 1 ? Math.min(4, alto, bw / 2) : 0;  // punta redondeada
                                const d = r
                                    ? `M${x},${yb} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + bw - r} Q${x + bw},${y1} ${x + bw},${y1 + r} V${yb} Z`
                                    : `M${x},${yb} V${y1} H${x + bw} V${yb} Z`;
                                return <path key={s} className={`fx-g-seg fx-m-${s.toLowerCase()}`} style={{ '--i': i }} d={d} />;
                            });
                            const yp = m.prev ? y(m.prev) : null;
                            const et = !m.futuro && etiquetar.has(i) && m.total > 0;
                            const aria = m.futuro
                                ? `${MESES_FX[i]}: aún no ha llegado${m.prev != null ? `; en ${anio - 1}, ${eur(m.prev)}` : ''}`
                                : `${MESES_FX[i]}: ${orden.map(s => `${s} ${eur(m[s])}`).join(', ')}; total ${eur(m.total)}${m.prev != null ? `; ${anio - 1}, ${eur(m.prev)}` : ''}`;
                            return (
                                <g key={i} className={`fx-g-col${activo === i ? ' fx-on' : ''}`} data-mes={i} tabIndex={0} aria-label={aria}
                                    onMouseEnter={() => setActivo(i)} onFocus={() => setActivo(i)} onClick={() => setActivo(i)}
                                    onBlur={() => setActivo(a => (a === i ? null : a))} onKeyDown={e => tecla(e, i)}>
                                    <rect className="fx-g-hit" x={pl + i * slot} y={pt - 6} width={slot} height={ph + 6} rx="8" />
                                    {segs}
                                    {yp != null && (<>
                                        <line className="fx-m-prev-halo" x1={x - 4} x2={x + bw + 4} y1={yp} y2={yp} />
                                        <line className="fx-m-prev" x1={x - 4} x2={x + bw + 4} y1={yp} y2={yp} />
                                    </>)}
                                    {et && <text className="fx-g-et" x={x + bw / 2} y={Math.min(y(m.total), yp ?? 1e9) - 7} textAnchor="middle">{corto(m.total)}</text>}
                                    <text className={esteAnio && i === mesHoy ? 'fx-g-mes-hoy' : m.futuro ? 'fx-g-futuro' : ''} x={x + bw / 2} y={h - 8} textAnchor="middle">
                                        {slot >= 40 ? MESES_CORTOS_FX[i] : INICIAL[i]}
                                    </text>
                                </g>
                            );
                        })}
                    </svg>
                )}
                {mA && (
                    <div className="fx-tip" ref={tip} role="status">
                        <div className="fx-tip-t">{MESES_FX[mA.i].replace(/^./, c => c.toUpperCase())} {anio}{esteAnio && mA.i === mesHoy ? ' · en curso' : ''}</div>
                        {mA.futuro ? (
                            <div>Aún no ha llegado.{mA.prev != null && <> En {anio - 1}: <b>{eur(mA.prev)}</b></>}</div>
                        ) : (<>
                            {orden.slice().reverse().map(s => (
                                <div key={s} className="fx-tip-f"><span><Punto s={s} />{s}</span><b>{eur(mA[s])}</b></div>
                            ))}
                            {orden.length > 1 && <div className="fx-tip-f fx-tip-tot"><span>Total</span><b>{eur(mA.total)}</b></div>}
                            {mA.prev != null && (
                                <div className={`fx-tip-f${orden.length > 1 ? '' : ' fx-tip-tot'}`}><span>{anio - 1}</span>
                                    <b>{eur(mA.prev)}{varPrev(mA) != null && ` · ${varPrev(mA) >= 0 ? '+' : '−'}${entero(Math.abs(varPrev(mA) * 100))} %`}</b>
                                </div>
                            )}
                        </>)}
                    </div>
                )}
            </div>

            {tabla && (
                <div className="fx-caja-scroll" style={{ marginTop: 14 }}>
                    <table className="fx-tabla">
                        <caption className="fx-sr">Facturado por mes en {anio}, sin IVA</caption>
                        <thead>
                            <tr>
                                <th scope="col">Mes</th>
                                {orden.map(s => <th key={s} scope="col" className="fx-t-der">{s}</th>)}
                                {orden.length > 1 && <th scope="col" className="fx-t-der">Total</th>}
                                {prev && <th scope="col" className="fx-t-der">{anio - 1}</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {datos.map(m => (
                                <tr key={m.i} style={{ cursor: 'default' }}>
                                    <td style={{ fontWeight: 600 }}>{MESES_FX[m.i]}</td>
                                    {orden.map(s => <td key={s} className="fx-t-imp">{m.futuro ? '—' : eur(m[s])}</td>)}
                                    {orden.length > 1 && <td className="fx-t-imp">{m.futuro ? '—' : eur(m.total)}</td>}
                                    {prev && <td className="fx-t-imp" style={{ fontWeight: 500 }}>{m.prev == null ? '—' : eur(m.prev)}</td>}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <p className="fx-graf-nota">
                Pasa el dedo o el ratón por un mes para ver el desglose.
                {futuros.length > 0 && <> {futuros.length === 1 ? `${futuros[0].replace(/^./, c => c.toUpperCase())}, en blanco: aún no ha llegado.` : `De ${futuros[0]} a ${futuros[futuros.length - 1]}, en blanco: aún no han llegado.`}</>}
            </p>
        </>
    );
}

export default GraficoMensual;
