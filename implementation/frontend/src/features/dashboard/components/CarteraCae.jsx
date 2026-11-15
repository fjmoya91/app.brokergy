// «Análisis de la cartera CAE»: lo que era el cuadro de mando antiguo, plegado al
// final del de dirección. Filtra los expedientes vivos (sin rechazados) por año,
// ficha, CCAA, instalador, certificador y fase, los REPRECIA a un precio de venta
// que se puede tocar (simulación: no cambia nada guardado) y saca el ranking y el
// CSV. Las cuentas son las de dashboardAgg (las mismas del listado de Expedientes).
import { useMemo, useState } from 'react';
import { Ico, eur, entero, leerLocal, guardarLocal } from '../../facturacion/estilo';
import { agregar, agregarPor, repricearFila, PRECIO_SO_DEFAULT } from '../logic/dashboardAgg';
import { FICHAS } from '../../expedientes/logic/expedienteTaxonomia';
import { energia, enlace } from '../logic/cuadroFormato';

// Clave nueva: el cuadro antiguo guardaba SIEMPRE su precio (160), y entonces nunca se veía el de mercado.
const PRECIO_STORAGE_KEY = 'brokergy-cuadro-precio-so';
const SIN = '__sin__';
const EJES = [
    { id: 'instalador', label: 'Instalador', key: r => r.instaladorId || SIN },
    { id: 'certificador', label: 'Certificador', key: r => r.certificadorId || SIN },
    { id: 'ccaa', label: 'CCAA', key: r => r.ccaa || '—' },
    { id: 'ficha', label: 'Ficha', key: r => r.ficha || '—' },
    { id: 'fase', label: 'Fase', key: r => r.faseId },
];

/** Precio medio de los lotes abiertos con precio, ponderado por MWh: lo que hoy se está vendiendo. */
function precioDeMercado(lotes) {
    let mwh = 0, eurs = 0;
    for (const l of lotes || []) {
        if (l.etapa === 'CERRADO' || !(l.precio > 0) || !(l.mwh > 0)) continue;
        mwh += l.mwh; eurs += l.mwh * l.precio;
    }
    return mwh > 0 ? Math.round(eurs / mwh) : PRECIO_SO_DEFAULT;
}

export function CarteraCae({ n }) {
    const [abierto, setAbierto] = useState(false);
    const [filtro, setFiltro] = useState({ anio: '', ficha: '', ccaa: '', inst: '', cert: '', fase: '' });
    const [eje, setEje] = useState('instalador');
    const [precioTxt, setPrecioTxt] = useState(() => leerLocal(PRECIO_STORAGE_KEY, ''));
    const mercado = useMemo(() => precioDeMercado(n?.lotes), [n]);
    const precio = Number(String(precioTxt).replace(',', '.')) > 0 ? Number(String(precioTxt).replace(',', '.')) : mercado;
    const filas = useMemo(() => n?.filas || [], [n]);
    const nombre = (id) => (id && id !== SIN ? n?.nombres?.[id] || '—' : id === SIN ? 'Sin asignar' : '—');
    const faseLabel = (id) => n?.fases?.find(f => f.id === id)?.label || id;

    const opciones = useMemo(() => {
        const cuenta = (fn) => { const m = new Map(); for (const r of filas) { const k = fn(r); if (k) m.set(k, (m.get(k) || 0) + 1); } return m; };
        const ord = (m, lab = String) => [...m.entries()].map(([v, c]) => ({ v, l: lab(v), c })).sort((a, b) => a.l.localeCompare(b.l, 'es'));
        const nom = (id) => n?.nombres?.[id] || '—';
        return {
            anio: [...cuenta(r => r.anio && String(r.anio)).entries()].map(([v, c]) => ({ v, l: v, c })).sort((a, b) => b.v.localeCompare(a.v)),
            ficha: FICHAS.map(f => ({ v: f, l: f, c: filas.filter(r => r.ficha === f).length })).filter(x => x.c),
            ccaa: ord(cuenta(r => (r.ccaa && r.ccaa !== '—' ? r.ccaa : null))),
            inst: ord(cuenta(r => r.instaladorId), nom),
            cert: ord(cuenta(r => r.certificadorId), nom),
            fase: (n?.fases || []).map(f => ({ v: f.id, l: f.label, c: filas.filter(r => r.faseId === f.id).length })).filter(x => x.c),
        };
    }, [filas, n]);

    const filtradas = useMemo(() => filas.filter(r =>
        (!filtro.anio || String(r.anio) === filtro.anio) &&
        (!filtro.ficha || r.ficha === filtro.ficha) &&
        (!filtro.ccaa || r.ccaa === filtro.ccaa) &&
        (!filtro.inst || r.instaladorId === filtro.inst) &&
        (!filtro.cert || r.certificadorId === filtro.cert) &&
        (!filtro.fase || r.faseId === filtro.fase)
    ), [filas, filtro]);

    const total = useMemo(() => agregar(filtradas, precio), [filtradas, precio]);
    const ejeDef = EJES.find(e => e.id === eje) || EJES[0];
    const ranking = useMemo(() => agregarPor(filtradas, precio, ejeDef.key, (k) => (eje === 'fase' ? faseLabel(k) : ['instalador', 'certificador'].includes(eje) ? nombre(k) : k)).slice(0, 8),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [filtradas, precio, eje, n]);
    const top = useMemo(() => filtradas
        .map(r => ({ r, ...repricearFila(r, precio) }))
        .filter(x => x.profit != null)
        .sort((a, b) => b.profit - a.profit)
        .slice(0, 8), [filtradas, precio]);

    const hayFiltro = Object.values(filtro).some(Boolean);
    const maxRank = Math.max(1, ...ranking.map(x => x.facturacion));

    const exportarCsv = () => {
        const cab = ['Expediente', 'Cliente', 'Estado', 'Fase', 'Ficha', 'Año', 'CCAA', 'Certificador', 'Instalador', 'Lote', 'MWh', `Facturacion a ${precio} €/MWh`, 'PagoCliente', 'Margen'];
        const lineas = filtradas.map(r => {
            const { facturacion, profit } = repricearFila(r, precio);
            const v = [r.numero, r.cliente, r.estado, faseLabel(r.faseId), r.ficha, r.anio ?? '', r.ccaa, nombre(r.certificadorId), nombre(r.instaladorId), r.loteCodigo || '',
                (r.mwh || 0).toFixed(3), facturacion.toFixed(2), (r.cae || 0).toFixed(2), profit == null ? '' : profit.toFixed(2)];
            // Separador ';' y coma decimal: es lo que Excel en español abre sin asistente.
            return v.map((x, i) => `"${(i >= 10 ? String(x).replace('.', ',') : String(x)).replace(/"/g, '""')}"`).join(';');
        });
        const csv = '﻿' + [cab.join(';'), ...lineas].join('\n');
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = `cartera-cae-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    const sel = (clave, etiqueta, ops) => (
        <label className="fx-campo">
            <span className="fx-eyebrow-gris">{etiqueta}</span>
            <select className="fx-select" value={filtro[clave]} onChange={e => setFiltro(f => ({ ...f, [clave]: e.target.value }))}>
                <option value="">Todos</option>
                {ops.map(o => <option key={o.v} value={o.v}>{o.l} ({entero(o.c)})</option>)}
            </select>
        </label>
    );

    return (
        <section className="cm-sec" id="cm-cartera" aria-labelledby="cm-cartera-t">
            <button type="button" className="cm-plegable" aria-expanded={abierto} aria-controls="cm-cartera-cuerpo" onClick={() => setAbierto(v => !v)}>
                <span>
                    <span className="fx-eyebrow">Análisis de la cartera CAE</span>
                    <span id="cm-cartera-t" className="fx-display fx-h3" style={{ display: 'block', marginTop: 4 }}>Filtra, simula el precio y exporta</span>
                    <small>{entero(filas.length)} expedientes vivos · por instalador, certificador, CCAA, ficha o fase · a Excel</small>
                </span>
                <Ico n={abierto ? 'arriba' : 'abajo'} size={22} />
            </button>
            {abierto && (
                <div id="cm-cartera-cuerpo" className="fx-card fx-pad" style={{ marginTop: 12 }}>
                    <div className="cm-filtros">
                        {sel('anio', 'Año', opciones.anio)}
                        {sel('ficha', 'Ficha', opciones.ficha)}
                        {sel('ccaa', 'CCAA', opciones.ccaa)}
                        {sel('inst', 'Instalador', opciones.inst)}
                        {sel('cert', 'Certificador', opciones.cert)}
                        {sel('fase', 'Fase', opciones.fase)}
                    </div>
                    <div className="cm-precio">
                        <label htmlFor="cm-precio-so" style={{ fontWeight: 700, fontSize: 14 }}>Precio de venta</label>
                        <input id="cm-precio-so" className="fx-input" inputMode="decimal" value={precioTxt} placeholder={String(mercado)}
                            onChange={e => { setPrecioTxt(e.target.value); guardarLocal(PRECIO_STORAGE_KEY, e.target.value); }} aria-describedby="cm-precio-nota" />
                        <span>€/MWh</span>
                        <span id="cm-precio-nota">Vacío = <b>{mercado} €/MWh</b>, lo que pagan de media los lotes abiertos. Es una simulación: no cambia nada guardado.</span>
                        {hayFiltro && <button type="button" className="fx-btn fx-btn-sec fx-btn-peq" onClick={() => setFiltro({ anio: '', ficha: '', ccaa: '', inst: '', cert: '', fase: '' })}>Quitar filtros</button>}
                    </div>

                    <div className="cm-mini" style={{ marginTop: 16 }}>
                        <div><span>Expedientes</span><b>{entero(total.count)}</b><small>{total.verificados ? `${entero(total.verificados)} con ahorro verificado` : 'ahorro estimado'}</small></div>
                        <div><span>Ahorro</span><b>{energia(total.mwh)}</b><small>a vender al S.O.</small></div>
                        <div><span>Facturación</span><b>{eur(total.facturacion, 0)}</b><small>a {precio} €/MWh, sin IVA</small></div>
                        <div><span>Margen</span><b>{total.profitDisponible ? eur(total.profit, 0) : '—'}</b><small>{total.sinMargen ? `${entero(total.sinMargen)} sin margen calculable` : `bonos a clientes ${eur(total.cae, 0)}`}</small></div>
                    </div>

                    <div className="cm-rej cm-rej-2" style={{ marginTop: 6 }}>
                        <div>
                            <div className="fx-sub-tit">Reparto por</div>
                            <div className="cm-seg-scroll" style={{ marginTop: 8 }}>
                                <div className="fx-seg" role="group" aria-label="Agrupar la cartera por">
                                    {EJES.map(e => <button key={e.id} type="button" aria-pressed={eje === e.id} onClick={() => setEje(e.id)}>{e.label}</button>)}
                                </div>
                            </div>
                            {!ranking.length ? <p className="fx-graf-nota">Nada con estos filtros.</p> : (
                                <ol className="cm-rank">
                                    {ranking.map(x => (
                                        <li key={x.key}>
                                            <span className="cm-rank-n" title={x.label}>{x.label}</span>
                                            <span className="cm-rank-v">{eur(x.facturacion, 0)}</span>
                                            <span className="fx-pista"><i style={{ width: `${(x.facturacion / maxRank) * 100}%`, background: 'var(--o2)' }} /></span>
                                            <span className="cm-rank-d">{entero(x.count)} exp. · {energia(x.mwh)}{x.profitDisponible ? ` · margen ${eur(x.profit, 0)}` : ''}</span>
                                        </li>
                                    ))}
                                </ol>
                            )}
                        </div>
                        <div>
                            <div className="fx-sub-tit">Los que más margen dejan</div>
                            {!top.length ? <p className="fx-graf-nota">Ninguno con margen calculable.</p> : (
                                <ol className="cm-rank">
                                    {top.map(({ r, profit, facturacion }) => (
                                        <li key={r.id}>
                                            <span className="cm-rank-n"><a className="fx-link" style={{ minHeight: 0 }} href={enlace(`?tab=expedientes&exp=${encodeURIComponent(r.id)}`)} target="_blank" rel="noopener noreferrer">{r.numero}</a> · {r.cliente}</span>
                                            <span className="cm-rank-v">{eur(profit, 0)}</span>
                                            <span className="cm-rank-d">{faseLabel(r.faseId)}{r.loteCodigo ? ` · ${r.loteCodigo}` : ''} · {energia(r.mwh)} · factura {eur(facturacion, 0)}</span>
                                        </li>
                                    ))}
                                </ol>
                            )}
                        </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                        <button type="button" className="fx-btn fx-btn-sec" onClick={exportarCsv} disabled={!filtradas.length}>
                            <Ico n="tabla" size={18} />Exportar a Excel ({entero(filtradas.length)})
                        </button>
                    </div>
                </div>
            )}
        </section>
    );
}
