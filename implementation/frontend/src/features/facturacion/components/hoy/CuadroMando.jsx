import { useState } from 'react';
import { Importe, Ico, eur, entero, leerLocal, guardarLocal, ErrorApi, AvisoFx, MESES_FX, fechaEs, hoyMadridFx, diasEntreFx } from '../../estilo';
import { GraficoMensual } from './GraficoMensual';
import { Embudo } from './Embudo';
import { ParaHoy } from './ParaHoy';

// ─────────────────────────────────────────────────────────────────────────────
// «Hoy»: el cuadro de mando de Facturación (solo ADMIN), sobre `GET /api/facturacion/cuadro`.
//
// - DOS contribuyentes que no se mezclan: BROKERGY (ING + CAE, por defecto) y Fran, autónomo
//   (FML). La FML NUNCA se suma a lo de BROKERGY: para la sociedad es un GASTO.
// - Las cifras salen TAL CUAL de la API (no se vuelven a sumar aquí): `acumulado`, `cobros`,
//   `presupuestos`, `trimestre`… El único cálculo propio es de presentación (la geometría del
//   gráfico, los pasos del embudo y los días que quedan).
// - Si la API falla (503, red), NUNCA se pinta 0,00 €: un aviso y «Reintentar» (regla 38).
// - Esqueleto solo en la PRIMERA carga; al cambiar de año, lo de antes atenuado.
// - Plegado y contribuyente se recuerdan en localStorage (comodidad: puede fallar).
// ─────────────────────────────────────────────────────────────────────────────

const C = {
    SL: { clave: 'sl', series: ['ING', 'CAE'], corto: 'BROKERGY' },
    AUT: { clave: 'autonomo', series: ['FML'], corto: 'Fran, autónomo' },
};

/** Minigráfico: la línea en el tono apagado; el último punto (el mes en curso), en tinta. */
function Spark({ vals, alta = false }) {
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

/**
 * «3.632 %» o «37 veces»: la variación frente al mismo periodo del año anterior, en frase.
 * Si la API dice que no es comparable (el año anterior tiene ventas CAE de Drive sin leer:
 * en 2025 salía «87 veces»), no presume: su nota en lugar de la cifra.
 */
function tituloVariacion(acum, anio, esteAnio, mesHasta) {
    const periodo = esteAnio ? `de enero a ${MESES_FX[mesHasta]} de ${anio - 1}` : `en ${anio - 1}`;
    if (acum?.comparable === false) return <>Sin comparar con {anio - 1}: {acum.nota_comparacion || 'lo de entonces está incompleto'}</>;
    const v = acum?.variacion_pct;
    if (v == null) return <>Sin facturación {periodo} con la que compararlo</>;
    if (v >= 100) {
        const veces = 1 + v / 100;
        const txt = veces >= 10 ? entero(veces) : veces.toFixed(1).replace('.', ',').replace(',0', '');
        return <><span className="fx-mark">{txt} veces</span> lo facturado {periodo}</>;
    }
    if (v >= 1) return <>Un <span className="fx-mark">{entero(v)} % más</span> que {periodo}</>;
    if (v <= -1) return <>Un {entero(-v)} % menos que {periodo}</>;
    return <>Lo mismo que {periodo}</>;
}

function Kpi({ k, v, nota, nota2, alerta, apagado, onClick, i, title }) {
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

const dias = (n) => `${entero(n)} ${Math.abs(n) === 1 ? 'día' : 'días'}`;

/** Las seis tarjetas, por contribuyente. Cada una lleva al listado ya filtrado. */
function kpisDe(d, emisor, ir) {
    const co = d.cobros || {};
    const pl = co.por_linea || {};
    const p = d.presupuestos || {};
    if (emisor === 'SL') {
        const vieja = (co.vencidas || [])[0];
        const cae = pl.CAE || {};
        const dm = co.dias_medios_cobro || {};
        const pf = p.por_facturar || null;
        return [
            { k: 'Te deben', v: <Importe n={co.pendiente} />, title: 'Con IVA, de todos los años: ING y CAE',
                nota: <>con IVA · <b>{entero(co.n_pendientes)}</b> facturas, de todos los años</>,
                // Las ventas CAE de Drive (autofacturas) están dentro de lo CAE pero no se cobran en Lotes.
                nota2: cae.pendiente ? <>CAE <b>{eur(cae.pendiente, 0)}</b>{co.drive?.pendiente
                    ? <>, de ello <b>{eur(co.drive.pendiente, 0)}</b> de ventas de Drive (se marcan en Para hoy)</>
                    : ': se cobra en Lotes'}</> : null,
                ir: () => ir('facturas', { f: 'por-cobrar', serie: 'ING' }) },
            { k: 'Vencido', v: <Importe n={co.vencido} />, alerta: co.vencido > 0,
                nota: co.n_vencidas ? <><b>{entero(co.n_vencidas)}</b> · la más antigua, hace <b>{dias(vieja?.dias || 0)}</b></> : 'Nada vencido',
                nota2: cae.vencido ? <>CAE <b>{eur(cae.vencido, 0)}</b>, en Lotes</> : null,
                ir: () => ir('facturas', { f: 'vencidas', serie: 'ING' }) },
            { k: `Cobrado en ${d.anio}`, v: <Importe n={co.cobrado} />,
                nota: <>con IVA · ING y CAE</>,
                ir: () => ir('facturas', { f: 'cobradas', serie: 'ING' }) },
            // De la emisión al cobro, en lo cobrado este año (la API: SL, sin la FML). Sustituye al
            // «% de aceptación», que ya da el titular del embudo.
            { k: 'Días medios de cobro', apagado: dm.dias == null, title: 'De la fecha de la factura a la del cobro, en lo cobrado este año (sin la FML)',
                v: dm.dias == null ? '—' : <>{entero(dm.dias)}<span className="fx-kpi-ud">{dm.dias === 1 ? 'día' : 'días'}</span></>,
                nota: dm.dias == null ? <>Nada cobrado en {d.anio} con su fecha</> : <>de la factura al cobro · <b>{entero(dm.n)}</b> {dm.n === 1 ? 'cobrada' : 'cobradas'} en {d.anio}</>,
                nota2: dm.por_linea?.CAE?.dias != null ? <>ING <b>{dias(dm.por_linea.ING?.dias ?? 0)}</b> · CAE <b>{dias(dm.por_linea.CAE.dias)}</b></> : null,
                ir: () => ir('facturas', { f: 'cobradas', serie: 'ING' }) },
            { k: 'Por facturar', apagado: !pf, v: pf ? <Importe n={pf.importe || 0} /> : '—',
                title: 'Presupuestos aceptados, de cualquier año, sin factura todavía. Sin IVA',
                nota: !pf ? 'Sin dato' : pf.n ? <><b>{entero(pf.n)}</b> {pf.n === 1 ? 'aceptado' : 'aceptados'} sin factura · sin IVA</> : 'Todo lo aceptado está facturado',
                nota2: pf?.n ? <>de cualquier año · con IVA <b>{eur(pf.importe_total || 0)}</b></> : null,
                ir: () => ir('presupuestos', { f: 'por-facturar' }) },
            { k: 'Esperando respuesta', v: <Importe n={p.enviados?.importe || 0} />,
                nota: p.enviados?.n ? <><b>{entero(p.enviados.n)}</b> enviados · <b>{entero(p.enviados.vistos || 0)}</b> vistos sin contestar</> : 'Ninguno enviado sin contestar',
                ir: () => ir('presupuestos', { f: 'esperando' }) },
        ];
    }
    const fml = pl.FML || {};
    const lf = d.ventas?.lineas?.FML || {};
    const t = d.trimestre;
    const [ta, tq] = (t?.t || '').split('-T');
    return [
        { k: 'Te debe BROKERGY', v: <Importe n={fml.pendiente || 0} />, nota: <>con IVA y sin la retención · <b>{entero(fml.n_pendientes || 0)}</b> FML</>,
            ir: () => ir('facturas', { f: 'por-cobrar', serie: 'FML' }) },
        { k: 'Vencido', v: <Importe n={fml.vencido || 0} />, alerta: fml.vencido > 0,
            nota: fml.n_vencidas ? <><b>{entero(fml.n_vencidas)}</b> FML pasadas de su vencimiento</> : 'Nada vencido',
            ir: () => ir('facturas', { f: 'vencidas', serie: 'FML' }) },
        { k: `Cobrado en ${d.anio}`, v: <Importe n={fml.cobrado || 0} />, nota: 'lo que la sociedad ya te ha pagado',
            ir: () => ir('facturas', { f: 'cobradas', serie: 'FML' }) },
        { k: 'Facturas emitidas', v: <>{entero(lf.n || 0)}<span className="fx-kpi-ud">FML</span></>, nota: <>en {d.anio}, una por mes</>,
            ir: () => ir('facturas', { f: 'todas', serie: 'FML' }) },
        { k: 'IVA repercutido', v: <Importe n={lf.iva || 0} />, nota: <>en {d.anio} · va a tu 303</>,
            ir: () => ir('trimestres', t?.t ? { t: t.t } : {}) },
        { k: t ? `IRPF retenido · ${tq}T` : 'IRPF retenido', apagado: !t, v: t ? <Importe n={t.autonomo?.retenciones || 0} /> : '—',
            nota: t ? <>en el {tq}T {ta} · lo ingresa BROKERGY en su 111</> : 'Solo en el año en curso',
            ir: () => ir('trimestres', t?.t ? { t: t.t } : {}) },
    ];
}

/** El trimestre en curso del contribuyente elegido (y el anterior, si aún corre su plazo). */
function TrimestreEnCurso({ d, emisor, ir, hoy }) {
    const t = d.trimestre;
    const cab = (h3, pildora) => (
        <div className="fx-card-cab">
            <div><div className="fx-eyebrow">Trimestre en curso</div><h3 className="fx-display fx-h3">{h3}</h3></div>
            {pildora && <span className="fx-pildora">{pildora}</span>}
        </div>
    );
    if (!t) {
        return (
            <article className="fx-card fx-pad fx-trim fx-in" style={{ '--i': 3 }}>
                {cab(`${d.anio}`)}
                <div className="fx-vacio fx-vacio-peq">
                    <span className="fx-tile fx-tile-l fx-tile-crema"><Ico n="calendario" size={22} /></span>
                    <p>El trimestre abierto solo se calcula en el año en curso. Los de {d.anio}, en Trimestres.</p>
                    <button type="button" className="fx-btn fx-btn-sec fx-btn-peq" onClick={() => ir('trimestres', { t: `${d.anio}-T4` })}>Ver los trimestres de {d.anio}</button>
                </div>
            </article>
        );
    }
    const [a, q] = t.t.split('-T');
    const m0 = (Number(q) - 1) * 3;
    const sl = emisor === 'SL';
    const r303 = sl ? t.sl?.resultado_303 : t.autonomo?.resultado_303;
    const g = t.gastos;
    const pz = t.plazo?.plazos || {};
    const mismoDia = pz.m303 && pz.m303 === pz.m111;
    const transcurridos = Math.max(0, diasEntreFx(t.desde, hoy) + 1);
    const total = diasEntreFx(t.desde, t.hasta) + 1;
    const ap = d.a_presentar;
    return (
        <article className="fx-card fx-pad fx-trim fx-in" style={{ '--i': 3 }}>
            {cab(`${q}T ${a} · ${MESES_FX[m0]} – ${MESES_FX[m0 + 2]}`, 'estimado')}
            <p className="fx-trim-k">{sl ? 'BROKERGY' : 'Fran, autónomo'} · modelo 303 · {r303 >= 0 ? 'a ingresar' : 'a compensar'}</p>
            <Importe n={r303 || 0} className="fx-trim-v" />
            <dl className="fx-filas">
                {sl ? (<>
                    <div className="fx-fila"><dt>IVA repercutido<small>de las ventas ING y CAE</small></dt><dd>{eur(t.sl?.iva_repercutido)}</dd></div>
                    {!!t.sl?.iva_isp && <div className="fx-fila"><dt>IVA de la ISP<small>se devenga y se deduce: no suma</small></dt><dd>{eur(t.sl.iva_isp)}</dd></div>}
                    <div className="fx-fila"><dt>IVA soportado deducible<small>{g ? `de ${entero(g.n)} justificantes en Drive y las FML` : 'Drive no respondió'}</small></dt><dd>{eur(-(t.sl?.iva_soportado_deducible || 0))}</dd></div>
                    <div className="fx-fila"><dt>Retenciones · modelo 111<small>de las FML y otros profesionales</small></dt><dd>{eur(t.m111)}</dd></div>
                </>) : (<>
                    <div className="fx-fila"><dt>IVA repercutido<small>de tus FML a la sociedad</small></dt><dd>{eur(t.autonomo?.iva_repercutido)}</dd></div>
                    <div className="fx-fila"><dt>IVA soportado deducible<small>de tus gastos en Drive</small></dt><dd>{eur(-(t.autonomo?.iva_soportado_deducible || 0))}</dd></div>
                    <div className="fx-fila"><dt>IRPF que te retienen<small>lo ingresa BROKERGY en su 111</small></dt><dd>{eur(t.autonomo?.retenciones)}</dd></div>
                    <div className="fx-fila"><dt>Modelo 130<small>el acumulado del año, en Trimestres</small></dt><dd><button type="button" className="fx-link" onClick={() => ir('trimestres', { t: t.t })}>Verlo</button></dd></div>
                </>)}
            </dl>
            {t.parcial && (
                <AvisoFx tono="ambar" accion={g ? <button type="button" className="fx-btn fx-btn-sec fx-btn-peq" onClick={() => ir('trimestres', { t: t.t, f: 'gastos' })}>Leerlos</button> : null}>
                    <b>Provisional.</b>{' '}
                    {g ? <>{entero(g.sin_leer)} {g.sin_leer === 1 ? 'gasto' : 'gastos'} del {q}T sin leer: el IVA soportado aún no está completo.</> : <>Drive no respondió: falta el IVA soportado.</>}
                </AvisoFx>
            )}
            <div className="fx-plazo">
                <span className="fx-tile fx-tile-l fx-tile-naranja"><Ico n="calendario" size={22} /></span>
                <div>
                    <span className="fx-plazo-d">{t.plazo?.dias >= 0 ? `Faltan ${dias(t.plazo.dias)}` : `Plazo pasado hace ${dias(-t.plazo.dias)}`}</span>
                    <small>
                        {mismoDia ? <>El 303 y el 111, hasta el {fechaEs(pz.m303)}.</> : <>El 111 hasta el {fechaEs(pz.m111)} y el 303 hasta el {fechaEs(pz.m303)}.</>}
                    </small>
                    <div className="fx-barra" role="img" aria-label={`Llevas ${transcurridos} de ${total} días del trimestre`}>
                        <i style={{ width: `${Math.min(100, Math.round(transcurridos / total * 100))}%` }} />
                    </div>
                </div>
            </div>
            {ap && (
                <AvisoFx tono={ap.plazo?.dias <= 5 ? 'vence' : 'ambar'}
                    accion={<button type="button" className="fx-btn fx-btn-sec fx-btn-peq" onClick={() => ir('trimestres', { t: ap.t })}>Revisarlo</button>}>
                    <b>El {ap.t.split('-T')[1]}T {ap.t.split('-T')[0]} se presenta hasta el {fechaEs(ap.plazo?.fecha)}</b>: {ap.plazo?.dias >= 0 ? `faltan ${dias(ap.plazo.dias)}` : 'el plazo ya pasó'}.
                </AvisoFx>
            )}
            <div className="fx-trim-pie">
                <span className="fx-trim-nota">Estimado: lo presenta la gestoría.</span>
                <button type="button" className="fx-link" onClick={() => ir('trimestres', { t: t.t })}>Ver el trimestre <Ico n="derecha" size={16} /></button>
            </div>
        </article>
    );
}

function Esqueleto() {
    return (
        <div className="fx-dash" aria-busy="true" aria-label="Cargando el cuadro de mando">
            <div className="fx-card fx-hero">
                <div className="fx-sk fx-sk-linea" style={{ width: '45%' }} />
                <div className="fx-sk fx-sk-cifra" style={{ marginTop: 22, height: 56 }} />
                <div className="fx-sk fx-sk-linea" style={{ marginTop: 18, width: '80%' }} />
                <div className="fx-sk" style={{ marginTop: 18, height: 56 }} />
            </div>
            <div className="fx-kpis">{Array.from({ length: 6 }, (_, i) => <div key={i} className="fx-sk fx-sk-kpi" />)}</div>
            <div className="fx-card fx-pad fx-hoy-area">
                <div className="fx-sk fx-sk-linea" style={{ width: '30%' }} />
                {Array.from({ length: 3 }, (_, i) => <div key={i} className="fx-sk fx-sk-fila" style={{ marginTop: 14 }} />)}
            </div>
            <div className="fx-card fx-pad fx-trim"><div className="fx-sk fx-sk-linea" style={{ width: '40%' }} /><div className="fx-sk fx-sk-cifra" style={{ marginTop: 18 }} /><div className="fx-sk" style={{ marginTop: 18, height: 140 }} /></div>
            <div className="fx-card fx-pad fx-graf"><div className="fx-sk fx-sk-linea" style={{ width: '35%' }} /><div className="fx-sk" style={{ marginTop: 18, height: 210 }} /></div>
            <div className="fx-card fx-pad fx-emb"><div className="fx-sk fx-sk-linea" style={{ width: '35%' }} /><div className="fx-sk" style={{ marginTop: 18, height: 90 }} /></div>
        </div>
    );
}

export function CuadroMando({ estado, anio, setAnio, ir, onNavigate }) {
    const [emisor, setEmisor] = useState(() => (leerLocal('fx-hoy-emisor') === 'AUT' ? 'AUT' : 'SL'));
    const [plegado, setPlegado] = useState(() => leerLocal('fx-hoy-plegado') === '1');
    const { datos: d, error, cargando, prev, recargar } = estado;
    const hoy = hoyMadridFx();
    const anioHoy = Number(hoy.slice(0, 4));
    const anios = [anioHoy, anioHoy - 1, anioHoy - 2];

    const cambiarEmisor = (e) => { setEmisor(e); guardarLocal('fx-hoy-emisor', e); };
    const plegar = () => { setPlegado(p => { guardarLocal('fx-hoy-plegado', p ? '0' : '1'); return !p; }); };

    const c = C[emisor];
    const recargando = !!d && (cargando || d.anio !== anio);
    const esteAnio = d?.anio === anioHoy;
    const mesHasta = d ? Number(String(d.ventas?.acumulado?.hasta || hoy).slice(5, 7)) - 1 : 0;
    const mesHoy = esteAnio ? Number(hoy.slice(5, 7)) - 1 : 11;

    const kpis = d ? kpisDe(d, emisor, ir) : [];
    const acum = d ? (emisor === 'SL' ? d.ventas?.acumulado?.sl : d.ventas?.acumulado?.por_linea?.FML) : null;
    const contrib = d?.ventas?.por_contribuyente?.[c.clave];
    const t = d?.trimestre;
    const r303 = t ? (emisor === 'SL' ? t.sl?.resultado_303 : t.autonomo?.resultado_303) : null;
    const tq = t?.t?.split('-T')[1];

    const tira = d ? [
        { k: 'Facturado', v: eur(acum?.base || 0, 0), hacer: plegar },
        ...(emisor === 'SL'
            ? [{ k: 'Te deben', v: eur(d.cobros?.pendiente || 0, 0), hacer: () => ir('facturas', { f: 'por-cobrar', serie: 'ING' }) },
                { k: 'Vencido', v: eur(d.cobros?.vencido || 0, 0), alerta: d.cobros?.vencido > 0, hacer: () => ir('facturas', { f: 'vencidas', serie: 'ING' }) },
                { k: 'Cobrado', v: eur(d.cobros?.cobrado || 0, 0), hacer: () => ir('facturas', { f: 'cobradas', serie: 'ING' }) }]
            : [{ k: 'Te debe la SL', v: eur(d.cobros?.por_linea?.FML?.pendiente || 0, 0), hacer: () => ir('facturas', { f: 'por-cobrar', serie: 'FML' }) },
                { k: 'Cobrado', v: eur(d.cobros?.por_linea?.FML?.cobrado || 0, 0), hacer: () => ir('facturas', { f: 'cobradas', serie: 'FML' }) }]),
        ...(t ? [{ k: `303 · ${tq}T`, v: eur(r303 || 0, 0), hacer: () => ir('trimestres', { t: t.t }) },
            { k: 'Plazo', v: t.plazo?.dias >= 0 ? `${entero(t.plazo.dias)} días` : 'pasado', hacer: () => ir('trimestres', { t: t.t }) }] : []),
    ] : [];

    return (
        <div className={`fx-hoy${plegado ? ' fx-plegado' : ''}`}>
            <div className="fx-hoy-cab">
                <div className="fx-eyebrow fx-eyebrow-gris">Cuadro de mando · {anio}</div>
                <div className="fx-hoy-ctrl">
                    <div className="fx-seg" role="group" aria-label="Contribuyente">
                        <button type="button" aria-pressed={emisor === 'SL'} onClick={() => cambiarEmisor('SL')} title="Sociedad: ING + CAE">
                            <i className="fx-dot" style={{ '--c': 'var(--s-ing)' }} />BROKERGY
                        </button>
                        <button type="button" aria-pressed={emisor === 'AUT'} onClick={() => cambiarEmisor('AUT')} title="Autónomo: la serie FML">
                            <i className="fx-dot" style={{ '--c': 'var(--s-fml)' }} />Fran, autónomo
                        </button>
                    </div>
                    <select className="fx-select fx-select-peq" aria-label="Año" value={anio} onChange={e => setAnio(Number(e.target.value))}>
                        {anios.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                    <button type="button" className="fx-link" aria-expanded={!plegado} onClick={plegar}>
                        {plegado ? 'Desplegar' : 'Plegar'}<Ico n={plegado ? 'abajo' : 'arriba'} size={16} />
                    </button>
                </div>
            </div>

            {error && <ErrorApi error={error} que="las cifras del cuadro" onReintentar={recargar} className="fx-in" />}
            {error && d && <p className="fx-graf-nota" style={{ margin: '8px 2px 12px' }}>Lo que ves debajo es la última lectura buena de {d.anio}.</p>}

            {!d && cargando && <Esqueleto />}

            {d && (
                <div className={recargando ? 'fx-recargando' : ''} aria-busy={recargando || undefined}>
                    <div className="fx-tira" role="group" aria-label="Resumen del cuadro plegado">
                        {tira.map(x => (
                            <button key={x.k} type="button" className={`fx-tira-item${x.alerta ? ' fx-alerta' : ''}`} onClick={x.hacer}><span>{x.k}</span><b>{x.v}</b></button>
                        ))}
                    </div>
                    <div className="fx-dash">
                        <article className="fx-card fx-hero fx-in" style={{ '--i': 1 }}>
                            <div className="fx-filete-fino" />
                            <div className="fx-hero-top">
                                <span className="fx-eyebrow">Facturado en {d.anio}{emisor === 'AUT' ? ' · FML' : ''}</span>
                                <span className="fx-pildora" title={d.ventas?.base_estimada || ''}>sin IVA</span>
                            </div>
                            <Importe n={acum?.base || 0} className="fx-hero-v" />
                            <p className="fx-hero-tit">{tituloVariacion(acum, d.anio, esteAnio, mesHasta)}</p>
                            <Spark vals={(d.ventas?.meses || []).slice(0, mesHoy + 1).map(m => m?.[c.clave]?.base)} alta />
                            <div className="fx-spark-ejes"><span>ene</span><span>{esteAnio ? `${MESES_FX[mesHoy].slice(0, 3)} · en curso` : 'dic'}</span></div>
                            <p className="fx-hero-pie">
                                {emisor === 'SL' ? (<>
                                    <b>{entero(contrib?.n || 0)} facturas</b> en {d.anio}: ING <b>{eur(d.ventas?.lineas?.ING?.base || 0, 0)}</b> · CAE <b>{eur(d.ventas?.lineas?.CAE?.base || 0, 0)}</b>. La FML de Fran no suma: para la sociedad es gasto.
                                </>) : (<>
                                    <b>{entero(contrib?.n || 0)} facturas FML</b> a la sociedad en {d.anio}. Es otro contribuyente: no suma a lo de BROKERGY.
                                </>)}
                            </p>
                        </article>

                        <div className="fx-kpis">
                            {kpis.map((x, i) => <Kpi key={x.k} {...x} i={i} onClick={x.ir} />)}
                        </div>

                        <article className="fx-card fx-pad fx-hoy-area fx-in" style={{ '--i': 2 }}>
                            <ParaHoy d={d} ir={ir} onNavigate={onNavigate} recargar={recargar} />
                        </article>

                        <TrimestreEnCurso d={d} emisor={emisor} ir={ir} hoy={hoy} />

                        <article className="fx-card fx-pad fx-graf fx-in" style={{ '--i': 4 }}>
                            <GraficoMensual meses={d.ventas?.meses || []} prev={prev?.anio === d.anio - 1 ? prev.meses : null}
                                series={c.series} clave={c.clave} anio={d.anio} mesHoy={mesHoy} lineas={d.ventas?.lineas || {}}
                                quien={c.corto} esteAnio={esteAnio} />
                        </article>

                        <article className="fx-card fx-pad fx-emb fx-in" style={{ '--i': 5 }}>
                            <Embudo p={d.presupuestos} anio={d.anio} emisor={emisor}
                                onEsperando={() => ir('presupuestos', { f: 'esperando' })} onVerSl={() => cambiarEmisor('SL')} />
                        </article>
                    </div>
                </div>
            )}
        </div>
    );
}

export default CuadroMando;
