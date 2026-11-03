import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { Ico, eur, entero, ErrorApi, errorDeApi, fechaEs, AvisoFx } from '../estilo';
import { useParamsFacturacion, ponerParams } from '../urlFacturacion';

// ─────────────────────────────────────────────────────────────────────────────
// Precios de obra — a cuánto se cobra cada partida en las facturas de obra de los
// expedientes, computara o no para el CAE (regla 189). La de siempre es la
// FOTOVOLTAICA: €/kWp por instalador y por fecha, para la venta cruzada de placas.
// Solo ADMIN (importes). Los datos los junta `GET /api/facturacion/estudio-precios`
// (backend/services/estudioPrecios.js); aquí no se vuelve a sumar nada.
// En la URL: `f` = la partida (sin él, FOTOVOLTAICA) y `t` = el año (sin él, todos).
// Ver docs/conocimiento/facturas/facturas-de-la-obra-ocr-y-filtro-previo-de-incidencias.md
// ─────────────────────────────────────────────────────────────────────────────

const ETIQUETA = {
    FOTOVOLTAICA: 'Fotovoltaica', AEROTERMIA: 'Aerotermia', ACS: 'ACS', EMISORES: 'Emisores',
    VENTANAS: 'Ventanas', CUBIERTA: 'Cubierta', FACHADA: 'Fachada', SUELO: 'Suelo',
};
const ORIGEN = { DESGLOSE: 'leída en la factura', MANUAL: 'tecleada a mano', FACTURA: 'factura entera' };
const ANIO_0 = 2024;

const eurKwp = (n) => (n == null ? '—' : `${entero(n)} €/kWp`);
const kw = (n) => (n ? `${String(Math.round(n * 100) / 100).replace('.', ',')} kWp` : '—');

function Kpi({ k, v, nota }) {
    return (
        <div className="fx-kpi" style={{ cursor: 'default' }}>
            <span className="fx-kpi-k">{k}</span>
            <span className="fx-kpi-v">{v}</span>
            {nota && <span className="fx-kpi-nota">{nota}</span>}
        </div>
    );
}

export function EstudioPrecios({ onNavigate }) {
    const [params] = useParamsFacturacion();
    const partida = ETIQUETA[params.f] ? params.f : 'FOTOVOLTAICA';
    const anio = /^\d{4}$/.test(params.t || '') ? params.t : '';
    const fv = partida === 'FOTOVOLTAICA';

    const [datos, setDatos] = useState(null);
    const [error, setError] = useState(null);
    const [cargando, setCargando] = useState(false);
    const pedido = useRef(0);

    const cargar = useCallback(async () => {
        const n = ++pedido.current;
        setCargando(true);
        setError(null);
        try {
            const { data } = await axios.get('/api/facturacion/estudio-precios', {
                params: { partida, ...(anio ? { desde: `${anio}-01-01`, hasta: `${anio}-12-31` } : {}) },
            });
            if (n !== pedido.current) return;
            setDatos(data);
        } catch (err) {
            if (n !== pedido.current) return;
            // Regla 38: con la BD caída, ni un 0 € ni las cifras de otro filtro.
            setDatos(null);
            setError(errorDeApi(err));
        } finally {
            if (n === pedido.current) setCargando(false);
        }
    }, [partida, anio]);
    useEffect(() => { cargar(); }, [cargar]);

    const abrir = (f) => onNavigate?.('expedientes', { expediente_id: f.expediente_id });
    const anios = [];
    for (let a = new Date().getFullYear(); a >= ANIO_0; a--) anios.push(String(a));

    const t = datos?.total;
    const sinKwp = fv && t ? t.n - t.n_con_kwp : 0;

    return (
        <section className="fx-card fx-pad fx-lista fx-in" aria-labelledby="fx-precios-tit">
            <div className="fx-lista-cab">
                <div>
                    <div className="fx-eyebrow">Precios de obra · facturas de los expedientes</div>
                    <h2 id="fx-precios-tit" className="fx-display fx-h2">{fv ? 'A cuánto se cobran las placas' : `A cuánto se cobra: ${ETIQUETA[partida].toLowerCase()}`}</h2>
                </div>
                <div className="fx-herr">
                    <select className="fx-select fx-select-peq" value={partida} aria-label="Partida"
                        onChange={e => ponerParams({ f: e.target.value === 'FOTOVOLTAICA' ? null : e.target.value })}>
                        {Object.keys(ETIQUETA).map(p => <option key={p} value={p}>{ETIQUETA[p]}</option>)}
                    </select>
                    <select className="fx-select fx-select-peq" value={anio} aria-label="Año de la factura"
                        onChange={e => ponerParams({ t: e.target.value || null })}>
                        <option value="">Desde siempre</option>
                        {anios.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                </div>
            </div>

            {error && <ErrorApi error={error} que="los precios" onReintentar={cargar} />}

            {!datos && !error ? (
                <div className="fx-kpis" style={{ marginTop: 16 }} aria-busy="true" aria-label="Cargando los precios">
                    {[0, 1, 2].map(i => <div key={i} className="fx-sk fx-sk-kpi" />)}
                </div>
            ) : !datos ? null : t.n === 0 ? (
                <div className="fx-vacio">
                    <Ico n="recibo" size={30} />
                    <p>
                        Todavía no hay ninguna partida de {ETIQUETA[partida].toLowerCase()} en las facturas de obra{anio ? ` de ${anio}` : ''}.
                        {' '}Sale de las facturas que se suben al expediente: el OCR separa cada partida
                        {fv ? ' y lee los kWp de los módulos' : ''}; en una factura antigua se añade a mano con «+ Parte no subvencionable».
                    </p>
                    {anio && <button type="button" className="fx-btn fx-btn-sec" onClick={() => ponerParams({ t: null })}>Ver desde siempre</button>}
                </div>
            ) : (
                <div className={cargando ? 'fx-recargando' : ''}>
                    <div className="fx-kpis" style={{ marginTop: 16 }}>
                        {fv ? (
                            <>
                                <Kpi k="€/kWp (mediana)" v={eurKwp(t.eur_kwp_mediana)}
                                    nota={t.n_con_kwp ? `de ${entero(t.eur_kwp_min)} a ${entero(t.eur_kwp_max)} €/kWp` : 'ninguna con kWp todavía'} />
                                <Kpi k="€/kWp (medio)" v={eurKwp(t.eur_kwp_medio)} nota="lo pagado entre los kWp instalados" />
                                <Kpi k="Instalaciones" v={entero(t.n)}
                                    nota={[t.kwp ? kw(t.kwp) : null, `${eur(t.importe, 0)} sin IVA`].filter(Boolean).join(' · ')} />
                            </>
                        ) : (
                            <>
                                <Kpi k="Partidas" v={entero(t.n)} nota={anio ? `facturadas en ${anio}` : 'desde siempre'} />
                                <Kpi k="Importe" v={eur(t.importe, 0)} nota="sin IVA" />
                                <Kpi k="Media" v={eur(t.importe / t.n, 0)} nota="por factura" />
                            </>
                        )}
                    </div>

                    {sinKwp > 0 && (
                        <AvisoFx tono="ambar" style={{ marginTop: 12 }}>
                            <b>{sinKwp === 1 ? '1 factura sin kWp' : `${sinKwp} facturas sin kWp`}</b>: no cuentan en el €/kWp.
                            {' '}Se teclean en el expediente, Documentación › Facturas › «Potencia de las placas».
                        </AvisoFx>
                    )}

                    {datos.por_instalador.length > 0 && (
                        <>
                            <h3 className="fx-sec-tit" style={{ marginTop: 22 }}>Por instalador</h3>
                            <div className="fx-tabla-caja">
                                <table className="fx-tabla">
                                    <thead>
                                        <tr>
                                            <th scope="col">Instalador</th>
                                            <th scope="col" className="fx-t-der">Facturas</th>
                                            {fv && <th scope="col" className="fx-t-der">kWp</th>}
                                            <th scope="col" className="fx-t-der">{fv ? '€/kWp' : 'Importe'}</th>
                                            <th scope="col" className="fx-col-fecha">Última</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {datos.por_instalador.map(g => (
                                            <tr key={`${g.emisor_nif || ''}${g.emisor}`}>
                                                <td className="fx-t-cli"><div className="fx-cli"><b>{g.emisor}</b>{g.emisor_nif && <small>{g.emisor_nif}</small>}</div></td>
                                                <td className="fx-t-imp">{g.n}</td>
                                                {fv && <td className="fx-t-imp">{kw(g.kwp)}</td>}
                                                <td className="fx-t-imp">
                                                    {fv ? eurKwp(g.eur_kwp_mediana) : eur(g.importe)}
                                                    {fv && g.n_con_kwp > 1 && <small>de {entero(g.eur_kwp_min)} a {entero(g.eur_kwp_max)}</small>}
                                                    {fv && g.n_con_kwp < g.n && <small>{g.n - g.n_con_kwp} sin kWp</small>}
                                                </td>
                                                <td className="fx-t-fecha fx-col-fecha">{fechaEs(g.ultima)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <ul className="fx-ls fx-tarjetas">
                                {datos.por_instalador.map(g => (
                                    <li key={`${g.emisor_nif || ''}${g.emisor}`} className="fx-ls-item">
                                        <div>
                                            <b>{g.emisor}</b>
                                            <small>{g.n} {g.n === 1 ? 'factura' : 'facturas'}{fv && g.kwp ? ` · ${kw(g.kwp)}` : ''} · última {fechaEs(g.ultima) || '—'}</small>
                                        </div>
                                        <span className="fx-ls-imp">
                                            {fv ? eurKwp(g.eur_kwp_mediana) : eur(g.importe)}
                                            {fv && g.n_con_kwp < g.n && <small>{g.n - g.n_con_kwp} sin kWp</small>}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </>
                    )}

                    <h3 className="fx-sec-tit" style={{ marginTop: 40 }}>Factura a factura</h3>
                    <div className="fx-tabla-caja">
                        <table className="fx-tabla">
                            <thead>
                                <tr>
                                    <th scope="col" className="fx-col-fecha">Fecha</th>
                                    <th scope="col">Expediente · instalador</th>
                                    <th scope="col" className="fx-t-der">Importe</th>
                                    {fv && <th scope="col" className="fx-t-der">€/kWp</th>}
                                    <th scope="col">Para el CAE</th>
                                </tr>
                            </thead>
                            <tbody>
                                {datos.filas.map((f, i) => (
                                    <tr key={`${f.expediente_id}-${f.factura_idx}-${i}`} tabIndex={0} onClick={() => abrir(f)}
                                        onKeyDown={e => { if (e.key === 'Enter') abrir(f); }}
                                        aria-label={`${f.numero_expediente} · abrir el expediente`}>
                                        <td className="fx-t-fecha fx-col-fecha">{fechaEs(f.fecha) || '—'}</td>
                                        <td className="fx-t-cli">
                                            <div className="fx-cli">
                                                <b>{f.numero_expediente}<span className="fx-t-fecha fx-nro-fecha"> · {fechaEs(f.fecha) || 'sin fecha'}</span></b>
                                                <small>{[f.emisor || 'sin emisor', f.numero_factura ? `fra. ${f.numero_factura}` : null, ORIGEN[f.origen]].filter(Boolean).join(' · ')}</small>
                                            </div>
                                        </td>
                                        <td className="fx-t-imp">
                                            {eur(f.importe)}
                                            {f.importe !== f.base_factura && <small>de {eur(f.base_factura)}</small>}
                                        </td>
                                        {fv && (
                                            <td className="fx-t-imp">
                                                {eurKwp(f.eur_kwp)}
                                                <small>{f.kwp ? kw(f.kwp) : 'sin kWp'}</small>
                                            </td>
                                        )}
                                        <td>
                                            <span className={`fx-chip ${f.computa ? 'fx-chip-ok' : 'fx-chip-gris'}`}>{f.computa ? 'Computa' : 'Fuera'}</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {/* Móvil: tarjetas, como en Facturas */}
                    <div className="fx-tarjetas">
                        {datos.filas.map((f, i) => (
                            <article key={`${f.expediente_id}-${f.factura_idx}-${i}`} className="fx-tarjeta" tabIndex={0}
                                onClick={() => abrir(f)} onKeyDown={e => { if (e.key === 'Enter') abrir(f); }}
                                aria-label={`${f.numero_expediente} · abrir el expediente`}>
                                <div className="fx-tarjeta-top">
                                    <b>{f.numero_expediente}</b>
                                    <span className={`fx-chip ${f.computa ? 'fx-chip-ok' : 'fx-chip-gris'}`}>{f.computa ? 'Computa' : 'Fuera'}</span>
                                    <span className="fx-t-fecha">{fechaEs(f.fecha) || 'sin fecha'}</span>
                                </div>
                                <div className="fx-cli">
                                    <b>{f.emisor || 'Sin emisor'}</b>
                                    <small>{[f.numero_factura ? `fra. ${f.numero_factura}` : null, ORIGEN[f.origen]].filter(Boolean).join(' · ')}</small>
                                </div>
                                <div className="fx-tarjeta-pie">
                                    <div className="fx-tarjeta-izq">
                                        <span className="fx-tarjeta-total">{eur(f.importe)}</span>
                                        {fv && <span>{f.kwp ? `${kw(f.kwp)} · ${eurKwp(f.eur_kwp)}` : 'sin kWp'}</span>}
                                    </div>
                                </div>
                            </article>
                        ))}
                    </div>
                    <p className="fx-trim-nota" style={{ marginTop: 34 }}>
                        Importes sin IVA. Cuentan todas las facturas de obra subidas a los expedientes, también lo que no
                        computa para el CAE; el €/kWp, solo las que traen kWp.
                    </p>
                </div>
            )}
        </section>
    );
}
