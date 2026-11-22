// La sección «Impuestos» del cuadro de mando: lo que hay que apartar para Hacienda,
// el Impuesto de Sociedades estimado y el IVA y las retenciones de cada trimestre.
// Pinta f.impuestos TAL CUAL (lo calcula services/impuestosEmpresa.js): aquí no se
// hace ninguna cuenta de dinero. El diálogo «Datos fiscales» edita lo que la app no
// puede saber (régimen, Impuesto de años anteriores, importes ya pagados), que se
// guarda en el servidor (PUT /api/cuadro-mando/impuestos/datos, solo ADMIN).
// Doc: docs/conocimiento/cuadro-mando/los-impuestos-en-el-cuadro-de-mando.md
import { useEffect, useState } from 'react';
import axios from 'axios';
import { Importe, Ico, eur, entero, AvisoFx, DialogoFx, ErrorApi, errorDeApi, fechaEs, hoyMadridFx, diasEntreFx } from '../../facturacion/estilo';
import { EsqueletoTarjeta } from './CuadroSecciones';

const MES_PLAZO = { '04': 'abril', '07': 'julio', '10': 'octubre', '12': 'diciembre', '01': 'enero' };
const PERIODO_202 = { '1P': 'abril', '2P': 'octubre', '3P': 'diciembre' };
const FUENTE = { CONFIRMADO: 'confirmado', LIBRO: 'según el libro de la gestoría', APP: 'estimado con lo facturado y lo leído', CALCULADO: 'calculado', ESTIMADO: 'estimado' };
const dd = (iso) => fechaEs(iso).slice(0, 5);

function ChipEstado({ q }) {
    const conf = q.sl303.fuente === 'CONFIRMADO';
    if (q.estado === 'PASADO') return <span className={`fx-chip ${conf ? 'fx-chip-ok' : 'fx-chip-gris'}`}>{conf ? 'Pagado' : 'Cerrado'}</span>;
    if (q.estado === 'POR_PRESENTAR') return <span className="fx-chip fx-chip-ambar">Vence el {dd(q.plazos.m303)}</span>;
    if (q.estado === 'EN_CURSO') return <span className="fx-chip fx-chip-pizarra">En curso</span>;
    return <span className="fx-chip fx-chip-borde">Por venir</span>;
}

function Valor({ x, aPagar = null }) {
    if (x.importe == null) return <dd className="cm-menos">—</dd>;
    return <dd>{eur(aPagar ?? x.importe, 0)}</dd>;
}

function Trimestre({ q, i }) {
    const s = q.sl303;
    const notas = [];
    if (s.importe != null) notas.push(FUENTE[s.fuente] + (s.fuente === 'CONFIRMADO' && s.fecha ? ` (${dd(s.fecha)})` : '') + (s.parcial ? ', con gastos sin leer' : ''));
    if (s.aCompensar > 0) notas.push(`sale a devolver ${eur(s.aCompensar, 0)}: se compensa en los siguientes`);
    if (s.compensado > 0) notas.push(`ya descontados ${eur(s.compensado, 0)} a compensar de antes (resultado ${eur(s.importe, 0)})`);
    return (
        <div className={`cm-trim cm-trim-${q.estado.toLowerCase()} fx-in`} style={{ '--i': i + 1 }}>
            <div className="cm-trim-cab">
                <b>{q.t.slice(-2)}</b><span>{q.etiqueta.match(/\((.+)\)/)?.[1] || ''}</span>
                <ChipEstado q={q} />
            </div>
            <dl>
                <div><dt>IVA · 303</dt><Valor x={s} aPagar={s.aPagar} /></div>
                {notas.length > 0 && <small>{notas.join(' · ')}</small>}
                <div><dt>Retenciones · 111</dt><Valor x={q.m111} /></div>
                <div className="cm-trim-aut"><dt>Tu IVA de autónomo</dt><Valor x={q.aut303} /></div>
            </dl>
            {q.estado !== 'FUTURO' && <p className="cm-trim-pie">303 hasta el {fechaEs(q.plazos.m303)}{q.plazos.m111 !== q.plazos.m303 ? ` · 111 hasta el ${fechaEs(q.plazos.m111)}` : ''}</p>}
        </div>
    );
}

export function Impuestos({ f, onGuardado }) {
    const [datos, setDatos] = useState(false);
    if (!f) return <div className="cm-rej cm-rej-57"><EsqueletoTarjeta alto={380} /><EsqueletoTarjeta alto={380} /></div>;
    const im = f.impuestos;
    if (!im) return null;
    const s = im.sociedades;
    const hoy = hoyMadridFx();
    const esteAnio = Number(hoy.slice(0, 4)) === f.anio;
    const p202 = s.pagos202;
    const ap = s.aIngresar;
    return (
        <>
            <div className="cm-rej cm-rej-57">
                <article className="fx-card fx-pad fx-in" style={{ '--i': 1 }}>
                    <div className="fx-card-cab">
                        <div>
                            <div className="fx-eyebrow">La sociedad · lo que queda por pagar</div>
                            <h3 className="fx-display fx-h3">Próximos pagos a Hacienda</h3>
                        </div>
                        <button type="button" className="fx-btn fx-btn-sec fx-btn-peq" onClick={() => setDatos(true)}><Ico n="ajustes" size={16} />Datos fiscales</button>
                    </div>
                    <Importe n={im.apartar} dec={0} className="cm-caja-v" />
                    {im.proximos.length ? (
                        <ul className="cm-lotes">
                            {im.proximos.map(x => {
                                const dias = diasEntreFx(hoy, x.fecha);
                                return (
                                    <li key={`${x.modelo}-${x.fecha}`} className="cm-lote">
                                        <span className="cm-lote-cod">{fechaEs(x.fecha)} · modelo {x.modelo}</span>
                                        <span className="cm-lote-det">{x.concepto} · {FUENTE[x.fuente] || 'estimado'}{x.aplazable ? ` · se puede aplazar ${x.aplazable} meses sin garantías` : ''}</span>
                                        <span className="cm-lote-imp">{eur(x.importe, 0)}<small>{dias === 0 ? 'hoy' : `en ${entero(dias)} días`}</small></span>
                                        <span className={`fx-chip ${dias <= 20 ? 'fx-chip-ambar' : x.estimado ? 'fx-chip-gris' : 'fx-chip-ok'} cm-lote-est`}>{x.estimado ? 'estimado' : 'confirmado'}</span>
                                    </li>
                                );
                            })}
                        </ul>
                    ) : <p className="fx-graf-nota">Nada pendiente de este año.</p>}
                    {im.autonomo.length > 0 && (<>
                        <div className="fx-sub-tit">Tú, como autónomo</div>
                        <ul className="cm-lotes">
                            {im.autonomo.map(x => (
                                <li key={`a-${x.fecha}`} className="cm-lote">
                                    <span className="cm-lote-cod">{fechaEs(x.fecha)} · modelo {x.modelo}</span>
                                    <span className="cm-lote-det">{x.concepto} · {FUENTE[x.fuente] || 'estimado'}</span>
                                    <span className="cm-lote-imp">{eur(x.importe, 0)}</span>
                                </li>
                            ))}
                        </ul>
                    </>)}
                    <p className="fx-graf-nota">El IVA y las retenciones de los trimestres sin pagar, los pagos a cuenta que quedan y el Impuesto de Sociedades del año. {im.nota}</p>
                </article>

                <article className="fx-card fx-pad fx-in cm-is" style={{ '--i': 2 }}>
                    <div className="fx-card-cab">
                        <div>
                            <div className="fx-eyebrow">Impuesto de Sociedades · {f.anio}</div>
                            <h3 className="fx-display fx-h3">{s.presentado ? 'Presentado' : esteAnio ? 'Sobre el resultado previsto al 31/12' : 'Sobre el resultado del año'}</h3>
                        </div>
                        <span className="fx-pildora">{s.presentado ? 'modelo 200' : 'estimado'}</span>
                    </div>
                    <dl className="fx-filas">
                        <div className="fx-fila">
                            <dt>{s.presentado ? 'Base imponible' : 'Resultado previsto (base)'}
                                <small>{s.presentado ? FUENTE.CONFIRMADO : esteAnio
                                    ? `EBITDA de hoy ${eur(s.baseHoy, 0)} + margen de lo que se factura antes del 31/12 ${eur(s.margenPendiente, 0)} − estructura de los meses que faltan ${eur(s.estructuraRestante, 0)}`
                                    : 'el EBITDA del año'}</small>
                            </dt>
                            <dd>{eur(s.basePrevista, 0)}</dd>
                        </div>
                        <div className="fx-fila"><dt>Tipo<small>{s.tipo.etiqueta}</small></dt><dd>{s.tipo.tramos.length > 1 ? `${s.tipo.tramos[0].pct}/${s.tipo.tramos[1].pct} %` : `${s.tipo.pct} %`}</dd></div>
                        <div className="fx-fila cm-fila-res"><dt>Cuota del Impuesto</dt><dd>{eur(s.cuotaPrevista, 0)}</dd></div>
                        {p202.exento
                            ? <div className="fx-fila cm-fila-sub"><dt>Sin pagos a cuenta<small>{p202.nota}</small></dt><dd className="cm-menos">0 €</dd></div>
                            : p202.filas.map(x => (
                                <div key={x.periodo} className="fx-fila cm-fila-sub">
                                    <dt>− Pago a cuenta de {PERIODO_202[x.periodo]} (202)<small>{x.importe == null ? x.nota : `${FUENTE[x.fuente]}${x.fuente === 'CALCULADO' ? `: ${x.nota}` : x.nota ? `: ${x.nota}` : ''}${x.fuente === 'CALCULADO' && x.pasado ? ' · no consta pagado' : ''}`}</small></dt>
                                    <dd className="cm-menos">{x.importe == null ? '—' : eur(-x.importe, 0)}</dd>
                                </div>
                            ))}
                        <div className="fx-fila cm-fila-res">
                            <dt>{ap.importe >= 0 ? `A ingresar en ${MES_PLAZO[ap.vence.slice(5, 7)] || 'julio'} de ${ap.vence.slice(0, 4)}` : 'A devolver'}
                                <small>{ap.fuente === 'CONFIRMADO' ? 'ingresado' : `hasta el ${fechaEs(ap.vence)}`}{ap.aplazable ? ` · se puede aplazar ${ap.aplazable} meses sin garantías (empresa emergente, Ley 28/2022 art. 8)` : ''}</small>
                            </dt>
                            <dd>{eur(Math.abs(ap.importe), 0)}</dd>
                        </div>
                        <div className="fx-fila cm-fila-ebitda"><dt>Resultado después de impuestos<small>{esteAnio && !s.presentado ? 'previsto al cierre' : 'del año'}</small></dt><dd>{eur(s.neto.previsto, 0)}</dd></div>
                    </dl>
                    {esteAnio && !s.presentado && <p className="fx-graf-nota">Con lo que llevas hoy ({eur(s.baseHoy, 0)} de base) el Impuesto sería de {eur(s.cuotaHoy, 0)}. La base es el resultado de gestión: sin amortizaciones, resultado financiero ni ajustes fiscales; la cierra la gestoría.</p>}
                    {s.tipo.nota && <p className="fx-graf-nota">{s.tipo.nota}</p>}
                    {(im.datos.vacio || im.errorDatos) && (
                        <AvisoFx tono="ambar" accion={<button type="button" className="fx-btn fx-btn-sec fx-btn-peq" onClick={() => setDatos(true)}>Añadirlos</button>}>
                            {im.errorDatos ? <><b>No se han podido leer los datos fiscales.</b> El Impuesto sale sin su régimen ni los pagos a cuenta.</> : <><b>Faltan los datos fiscales.</b> Sin el régimen ni el Impuesto del año anterior, sale al tipo de reducida dimensión y sin pagos a cuenta.</>}
                        </AvisoFx>
                    )}
                </article>
            </div>

            <article className="fx-card fx-pad fx-in" style={{ '--i': 3, marginTop: 14 }}>
                <div className="fx-card-cab">
                    <div>
                        <div className="fx-eyebrow">IVA y retenciones · {f.anio}</div>
                        <h3 className="fx-display fx-h3">Trimestre a trimestre</h3>
                    </div>
                    <span className="fx-pildora">303 · 111</span>
                </div>
                <div className="cm-trims">
                    {im.trimestres.map((q, i) => <Trimestre key={q.t} q={q} i={i} />)}
                </div>
                <p className="fx-graf-nota">
                    En el año, la sociedad: IVA {eur(im.totales.sl303, 0)} y retenciones {eur(im.totales.m111, 0)}; tú, como autónomo: IVA {eur(im.totales.aut303, 0)}.
                    {im.porCompensar > 0 ? ` Quedan ${eur(im.porCompensar, 0)} de IVA a compensar.` : ''}
                    {' '}Un trimestre cerrado sale del RESUMEN del libro de la gestoría; el en curso, de lo facturado y los gastos leídos (el detalle, en Facturación → Trimestres).
                </p>
            </article>

            {datos && <DatosFiscales onClose={() => setDatos(false)} onGuardado={() => { setDatos(false); onGuardado?.(); }} />}
        </>
    );
}

// ════════════════════════════════════════════════════════════════════════════
// DATOS FISCALES: lo que la app no puede saber
// ════════════════════════════════════════════════════════════════════════════
const TIPOS = [['STARTUP', 'Empresa emergente (15 %)'], ['NUEVA_CREACION', 'Nueva creación (15 %)'], ['MICRO', 'Microempresa'], ['ERD', 'Reducida dimensión'], ['GENERAL', 'General (25 %)']];
const MODELOS = [['303', '303 · IVA'], ['111', '111 · retenciones'], ['202', '202 · pago a cuenta']];
const PERIODOS = { 303: ['T1', 'T2', 'T3', 'T4'], 111: ['T1', 'T2', 'T3', 'T4'], 202: ['1P', '2P', '3P'] };
const aTexto = (v) => (v == null ? '' : String(v).replace('.', ','));
// «1.234,56» o «1234.56» → 1234.56 (solo se interpreta lo tecleado; las cuentas, en el servidor).
const aNumero = (v) => {
    const t = String(v ?? '').trim().replace(/[€\s]/g, '');
    if (!t) return null;
    const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
    return Number.isFinite(n) ? n : null;
};

function Campo({ label, todo = false, children }) {
    return <label className={`fx-campo${todo ? ' cm-df-todo' : ''}`}><span>{label}</span>{children}</label>;
}

function DatosFiscales({ onClose, onGuardado }) {
    const anioHoy = Number(hoyMadridFx().slice(0, 4));
    const [st, setSt] = useState({ cargando: true, error: null, guardando: false, errorGuardar: null });
    const [reg, setReg] = useState([]);
    const [isAnt, setIsAnt] = useState([]);
    const [pagos, setPagos] = useState([]);

    useEffect(() => {
        let vivo = true;
        axios.get('/api/cuadro-mando/impuestos/datos').then(({ data }) => {
            if (!vivo) return;
            setReg((data.regimen || []).map(x => ({ ...x, pct: aTexto(x.pct), sin_202: (x.sin_202 || []).join(', '), aplazable: (x.aplazable || []).join(', '), nota: x.nota || '' })));
            setIsAnt((data.is_anteriores || []).map(x => ({ ...x, base: aTexto(x.base), cuota: aTexto(x.cuota), ingresado: aTexto(x.ingresado), cifra_negocios: aTexto(x.cifra_negocios), fecha: x.fecha || '', nota: x.nota || '' })));
            setPagos((data.pagos || []).map(x => ({ ...x, importe: aTexto(x.importe), fecha: x.fecha || '', nota: x.nota || '' })));
            setSt(s => ({ ...s, cargando: false }));
        }).catch(e => { if (vivo) setSt(s => ({ ...s, cargando: false, error: errorDeApi(e) })); });
        return () => { vivo = false; };
    }, []);

    const cambia = (set, i, k) => (e) => { const v = e.target.value; set(xs => xs.map((x, j) => (j === i ? { ...x, [k]: v } : x))); };
    const quita = (set, i) => () => set(xs => xs.filter((_, j) => j !== i));

    const guardar = async () => {
        setSt(s => ({ ...s, guardando: true, errorGuardar: null }));
        const body = {
            regimen: reg.map(x => ({ ...x, desde: Number(x.desde), hasta: Number(x.hasta || x.desde), pct: aNumero(x.pct) })),
            is_anteriores: isAnt.map(x => ({ ...x, anio: Number(x.anio), base: aNumero(x.base), cuota: aNumero(x.cuota), ingresado: aNumero(x.ingresado), cifra_negocios: aNumero(x.cifra_negocios), fecha: x.fecha || null })),
            pagos: pagos.map(x => ({ ...x, anio: Number(x.anio), importe: aNumero(x.importe), fecha: x.fecha || null })),
        };
        try {
            await axios.put('/api/cuadro-mando/impuestos/datos', body);
            onGuardado();
        } catch (e) { setSt(s => ({ ...s, guardando: false, errorGuardar: errorDeApi(e) })); }
    };

    const pie = (
        <>
            <button type="button" className="fx-btn fx-btn-sec" onClick={onClose} disabled={st.guardando}>Cancelar</button>
            <button type="button" className="fx-btn fx-btn-pri" onClick={guardar} disabled={st.cargando || !!st.error || st.guardando}>{st.guardando ? 'Guardando…' : 'Guardar'}</button>
        </>
    );
    return (
        <DialogoFx titulo="Datos fiscales" antetitulo="Impuestos · lo que la app no sabe" onClose={onClose} ocupado={st.guardando} pie={pie}>
            {st.cargando ? <div className="fx-sk" style={{ height: 220, borderRadius: 16 }} />
                : st.error ? <ErrorApi error={st.error} que="los datos fiscales" />
                    : (
                        <div className="cm-df">
                            <p className="fx-graf-nota" style={{ marginTop: 0 }}>Se guardan en el servidor, no en el código. Con ellos el cuadro calcula el tipo del Impuesto de Sociedades, los pagos a cuenta y lo ya pagado.</p>

                            <div className="fx-sub-tit">Régimen del Impuesto de Sociedades</div>
                            {reg.map((x, i) => (
                                <div key={i} className="cm-df-fila">
                                    <Campo label="Desde"><input className="fx-input fx-num" inputMode="numeric" value={x.desde ?? ''} onChange={cambia(setReg, i, 'desde')} /></Campo>
                                    <Campo label="Hasta"><input className="fx-input fx-num" inputMode="numeric" value={x.hasta ?? ''} onChange={cambia(setReg, i, 'hasta')} /></Campo>
                                    <Campo label="Régimen" todo><select className="fx-select no-uppercase" value={x.tipo || ''} onChange={cambia(setReg, i, 'tipo')}>{TIPOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></Campo>
                                    <Campo label="Tipo %"><input className="fx-input fx-num" inputMode="decimal" value={x.pct} onChange={cambia(setReg, i, 'pct')} placeholder="ley" /></Campo>
                                    <Campo label="Años sin 202"><input className="fx-input" value={x.sin_202} onChange={cambia(setReg, i, 'sin_202')} placeholder="2027, 2028" /></Campo>
                                    <Campo label="Años aplazables"><input className="fx-input" value={x.aplazable} onChange={cambia(setReg, i, 'aplazable')} placeholder="2026, 2027" /></Campo>
                                    <Campo label="Nota" todo><input className="fx-input no-uppercase" value={x.nota} onChange={cambia(setReg, i, 'nota')} /></Campo>
                                    <button type="button" className="fx-btn fx-btn-sec fx-btn-peq cm-df-quita" onClick={quita(setReg, i)} aria-label="Quitar este régimen"><Ico n="borrar" size={16} /></button>
                                </div>
                            ))}
                            <button type="button" className="fx-link cm-mas" onClick={() => setReg(xs => [...xs, { desde: anioHoy, hasta: anioHoy, tipo: 'STARTUP', pct: '15', sin_202: '', aplazable: '', nota: '' }])}><Ico n="mas" size={16} />Añadir régimen</button>

                            <div className="fx-sub-tit">Impuesto de años anteriores (modelo 200)</div>
                            {isAnt.map((x, i) => (
                                <div key={i} className="cm-df-fila">
                                    <Campo label="Año"><input className="fx-input fx-num" inputMode="numeric" value={x.anio ?? ''} onChange={cambia(setIsAnt, i, 'anio')} /></Campo>
                                    <Campo label="Base imponible"><input className="fx-input fx-num" inputMode="decimal" value={x.base} onChange={cambia(setIsAnt, i, 'base')} /></Campo>
                                    <Campo label="Cuota (casilla 599)"><input className="fx-input fx-num" inputMode="decimal" value={x.cuota} onChange={cambia(setIsAnt, i, 'cuota')} /></Campo>
                                    <Campo label="Ingresado"><input className="fx-input fx-num" inputMode="decimal" value={x.ingresado} onChange={cambia(setIsAnt, i, 'ingresado')} /></Campo>
                                    <Campo label="Cifra de negocios"><input className="fx-input fx-num" inputMode="decimal" value={x.cifra_negocios} onChange={cambia(setIsAnt, i, 'cifra_negocios')} /></Campo>
                                    <Campo label="Fecha de pago"><input className="fx-input" type="date" value={x.fecha} onChange={cambia(setIsAnt, i, 'fecha')} /></Campo>
                                    <Campo label="Nota" todo><input className="fx-input no-uppercase" value={x.nota} onChange={cambia(setIsAnt, i, 'nota')} /></Campo>
                                    <button type="button" className="fx-btn fx-btn-sec fx-btn-peq cm-df-quita" onClick={quita(setIsAnt, i)} aria-label="Quitar este año"><Ico n="borrar" size={16} /></button>
                                </div>
                            ))}
                            <button type="button" className="fx-link cm-mas" onClick={() => setIsAnt(xs => [...xs, { anio: anioHoy - 1, base: '', cuota: '', ingresado: '', cifra_negocios: '', fecha: '', nota: '' }])}><Ico n="mas" size={16} />Añadir año</button>

                            <div className="fx-sub-tit">Importes ya presentados o liquidados</div>
                            {pagos.map((x, i) => (
                                <div key={i} className="cm-df-fila">
                                    <Campo label="Año"><input className="fx-input fx-num" inputMode="numeric" value={x.anio ?? ''} onChange={cambia(setPagos, i, 'anio')} /></Campo>
                                    <Campo label="Modelo"><select className="fx-select no-uppercase" value={x.modelo} onChange={(e) => { const m = e.target.value; setPagos(xs => xs.map((y, j) => (j === i ? { ...y, modelo: m, periodo: PERIODOS[m][0], contribuyente: m === '303' ? y.contribuyente : 'SL' } : y))); }}>{MODELOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></Campo>
                                    <Campo label="Periodo"><select className="fx-select no-uppercase" value={x.periodo} onChange={cambia(setPagos, i, 'periodo')}>{(PERIODOS[x.modelo] || []).map(p => <option key={p} value={p}>{p}</option>)}</select></Campo>
                                    <Campo label="De"><select className="fx-select no-uppercase" value={x.contribuyente} onChange={cambia(setPagos, i, 'contribuyente')} disabled={x.modelo !== '303'}><option value="SL">Sociedad</option><option value="AUTONOMO">Autónomo</option></select></Campo>
                                    <Campo label="Importe"><input className="fx-input fx-num" inputMode="decimal" value={x.importe} onChange={cambia(setPagos, i, 'importe')} /></Campo>
                                    <Campo label="Fecha"><input className="fx-input" type="date" value={x.fecha} onChange={cambia(setPagos, i, 'fecha')} /></Campo>
                                    <Campo label="Nota" todo><input className="fx-input no-uppercase" value={x.nota} onChange={cambia(setPagos, i, 'nota')} placeholder="cargo del banco, carta de pago…" /></Campo>
                                    <button type="button" className="fx-btn fx-btn-sec fx-btn-peq cm-df-quita" onClick={quita(setPagos, i)} aria-label="Quitar este importe"><Ico n="borrar" size={16} /></button>
                                </div>
                            ))}
                            <button type="button" className="fx-link cm-mas" onClick={() => setPagos(xs => [...xs, { anio: anioHoy, modelo: '202', periodo: '3P', contribuyente: 'SL', importe: '', fecha: '', nota: '' }])}><Ico n="mas" size={16} />Añadir importe</button>
                            {st.errorGuardar && (
                                <div ref={el => el?.scrollIntoView?.({ block: 'center' })}>
                                    <AvisoFx tono="ambar" role="alert" className="cm-df-err">
                                        <b>No se han guardado los datos fiscales.</b> {st.errorGuardar.status === 503 ? 'La base de datos no responde ahora mismo: prueba en un momento.' : st.errorGuardar.status ? st.errorGuardar.texto : 'Sin conexión con el servidor.'}
                                    </AvisoFx>
                                </div>
                            )}
                        </div>
                    )}
        </DialogoFx>
    );
}
