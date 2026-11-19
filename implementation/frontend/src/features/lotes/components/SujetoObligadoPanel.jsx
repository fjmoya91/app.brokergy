import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import {
    CSS as CSS_FX, Ico, AvisoFx, ErrorApi, errorDeApi, DialogoFx, useToastFx, eur,
} from '../../facturacion/estilo';
import {
    computeVistaSo, aniosElegibles, normalizarObligacion, planParaCubrir, PCT_FONDO_DEFECTO,
} from '../logic/obligacionSo';
import { EQUIVALENCIA_FINANCIERA } from '../logic/loteEco';
import {
    num, gwh, mwh, pct, presName, COLOR, COLOR_OFERTA, FUENTE, chipEstado, CSS_SO, logoEsClaro,
    SITUACION_REGISTRO, COLOR_REGISTRO, fechaEs,
} from './vistaSoEstilo';

/** El chip de dónde está el lote en la cuenta del S.O. (null si no hay certificado). */
export function ChipRegistro({ r }) {
    const s = r ? SITUACION_REGISTRO[r.situacion] : null;
    if (!s) return null;
    const vence = r.situacion === 'EN_SU_CUENTA' && r.vence ? ` · vence ${r.vence.slice(0, 4)}` : '';
    const ayuda = r.nuevo ? 'Resuelto después del certificado: el MITECO lo inscribe en su cuenta al resolver' : s.ayuda;
    return <span className={`fx-chip so-lote-reg ${s.chip}`} title={`${ayuda}${r.expediente ? ` · ${r.expediente}` : ''}`}>{s.txt}{vence}</span>;
}

// ─────────────────────────────────────────────────────────────────────────────
// «Vista S.O.»: la pestaña Lotes mirada como la mira el Sujeto Obligado. Cuánto
// tiene que cubrir este año, cuánto ya tiene (de otros y nuestro, por etapas),
// cuánto le falta y cuánto de eso le podemos llevar con lo que hay sin lotear.
// Las cuentas: logic/obligacionSo.js. Ver docs/conocimiento/lotes/la-vista-del-sujeto-obligado.md.
//
// Estilo de la pestaña Facturación (regla 164, Fran 28/10/2026: «que se parezca a
// Facturación»): monta el CSS `.fx-` de facturacion/estilo.jsx y añade lo suyo con
// prefijo `.so-`. Nada de Tailwind dentro de `.fx`.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Editar la obligación de un año ─────────────────────────────────────────────
function EditarObligacionModal({ so, anio, actual, onClose, onSave }) {
    const [f, setF] = useState(() => ({
        obligacion_gwh: actual?.obligacion_gwh ?? '',
        pct_fondo: actual?.pct_fondo ?? PCT_FONDO_DEFECTO,
        otros_gwh: actual?.otros_gwh ?? '',
        equivalencia_mwh: actual?.equivalencia_mwh ?? EQUIVALENCIA_FINANCIERA,
        ventas_gwh: actual?.ventas_gwh ?? '',
        fuente: actual?.fuente ?? `Anexo II de la Orden de obligaciones de ${anio}`,
        notas: actual?.notas ?? '',
    }));
    const [saving, setSaving] = useState(false);
    const set = (k) => (e) => setF(s => ({ ...s, [k]: e.target.value }));
    const n = (v) => Number(String(v).replace(',', '.'));
    const cubrible = n(f.obligacion_gwh) * (1 - n(f.pct_fondo) / 100);

    // Función y no componente: un componente declarado aquí dentro se monta de
    // nuevo a cada tecla y el input pierde el foco.
    const campo = (k, label, ayuda) => (
        <label key={k} className="fx-campo">
            <span>{label}</span>
            <input className="fx-input fx-num" value={f[k]} onChange={set(k)} inputMode="decimal" />
            {ayuda && <small className="so-ayuda">{ayuda}</small>}
        </label>
    );

    const guardar = async () => { setSaving(true); try { await onSave(f); } finally { setSaving(false); } };

    return (
        <DialogoFx antetitulo={`${presName(so)} · Anexo II`} titulo={`Obligación ${anio}`} onClose={onClose} ocupado={saving}
            pie={<>
                <button type="button" className="fx-btn fx-btn-sec" onClick={onClose} disabled={saving}>Cancelar</button>
                <button type="button" className="fx-btn fx-btn-pri" onClick={guardar} disabled={saving || !(n(f.obligacion_gwh) > 0)}>
                    {saving ? <><Ico n="reintentar" size={18} className="fx-spin" />Guardando…</> : <><Ico n="check" size={18} />Guardar</>}
                </button>
            </>}>
            <div className="so-dos">
                {campo('obligacion_gwh', 'Cuota de ahorro (GWh)', 'La del Anexo II de la Orden')}
                {campo('pct_fondo', 'Mínimo al Fondo (%)', 'Lo que paga sí o sí al FNEE')}
                {campo('otros_gwh', 'Comprado a otros (GWh)', 'CAE de otros agentes, lo que dice él')}
                {campo('equivalencia_mwh', 'Equivalencia (€/MWh)')}
                {campo('ventas_gwh', 'Ventas computables (GWh)', 'Solo informativo')}
            </div>
            <div className="fx-dlg-cifra">
                <div className="fx-eyebrow fx-eyebrow-verde">Cubrible con CAE</div>
                <span className="fx-importe" style={{ fontSize: 40 }}>
                    {Number.isFinite(cubrible) && cubrible > 0 ? <>{num(cubrible)}<small>&nbsp;GWh</small></> : '—'}
                </span>
                <p>La cuota menos el mínimo al Fondo.</p>
            </div>
            <label className="fx-campo">
                <span>Fuente</span>
                <input className="fx-input" value={f.fuente} onChange={set('fuente')} />
            </label>
            <label className="fx-campo">
                <span>Notas</span>
                <textarea className="fx-area" value={f.notas} onChange={set('notas')} rows={2}
                    placeholder="p. ej. «los 9 GWh de otros, según nos dijo en octubre»" />
            </label>
        </DialogoFx>
    );
}

// ─── La barra de la cuota: fondo · otros · lo nuestro por etapas · lo que falta ─
function BarraObligacion({ ob, etapas }) {
    const total = Math.max(ob.obligacion_gwh, ob.fondoGwh + ob.otros_gwh + ob.brokergyGwh);
    const w = (g) => `${Math.max(0, g / total * 100)}%`;
    const tramos = [
        { id: 'FONDO', g: ob.fondoGwh, t: `Al Fondo (${pct(ob.pct_fondo)})`, cls: 'so-fondo' },
        { id: 'OTROS', g: ob.otros_gwh, t: 'Comprado a otros' },
        ...etapas.map(e => ({ id: e.id, g: e.kwh / 1e6, t: e.titulo })),
    ].filter(t => t.g > 0);
    return (
        <div>
            <div className="so-barra" role="img"
                aria-label={[...tramos.map(t => `${t.t}: ${gwh(t.g)}`), ob.faltaGwh > 0 ? `le falta ${gwh(ob.faltaGwh)}` : null].filter(Boolean).join('; ')}>
                {tramos.map((t, i) => (
                    <i key={t.id} title={`${t.t} · ${gwh(t.g)}`} className={t.cls || ''}
                        style={{ width: w(t.g), '--c': COLOR[t.id], animationDelay: `${i * 60}ms` }} />
                ))}
                {ob.faltaGwh > 0 && (
                    <i className="so-falta" title={`Le falta · ${gwh(ob.faltaGwh)}`} style={{ width: w(ob.faltaGwh), animationDelay: `${tramos.length * 60}ms` }}>
                        falta {gwh(ob.faltaGwh)}
                    </i>
                )}
            </div>
            <div className="so-escala"><span>0</span><span>{gwh(total)}</span></div>
            <ul className="fx-ley so-ley">
                {tramos.map(t => (
                    <li key={t.id}><span className={`fx-dot ${t.cls || ''}`} style={{ '--c': COLOR[t.id] }} />{t.t} <b>{gwh(t.g)}</b></li>
                ))}
                {ob.faltaGwh > 0 && <li><span className="fx-dot so-falta" />Le falta <b>{gwh(ob.faltaGwh)}</b></li>}
            </ul>
        </div>
    );
}

// ─── Lo que comparten la Vista S.O. y la página del propio S.O. (/so/:token) ───
// La cifra de lo que falta, las seis cuentas y la barra de la cuota.
const kpi = (k, valor, ud, nota, extra = '') => (
    <div className={`fx-kpi so-kpi ${extra}`}>
        <span className="fx-kpi-k">{k}</span>
        <span className="fx-kpi-v fx-num">{valor}{ud && <span className="fx-kpi-ud">{ud}</span>}</span>
        {nota && <span className="fx-kpi-nota">{nota}</span>}
    </div>
);

// `conPrecio`: enseña también a cuánto le sale el CAE (€/MWh). Solo la vista
// interna y solo ADMIN: al S.O. no se le enseña de momento (Fran, 05/11/2026), y
// el enlace público ni lo recibe.
export function ResumenObligacion({ ob, anio, etapas, editar = null, sinObligacion = null, notas = false, conPrecio = false, registro = null, style }) {
    return (
        <>
            <div className="so-dash" style={style}>
                <section className="fx-card fx-hero so-hero fx-in" style={{ '--i': 2 }} aria-label={`Obligación ${anio}`}>
                    <div className="fx-filete-fino" />
                    <div className="fx-hero-top">
                        <span className="fx-eyebrow">Obligación {anio}</span>
                        {editar}
                    </div>
                    {ob ? (
                        <>
                            <div className="fx-importe fx-hero-v">
                                {num(ob.faltaGwh > 0 ? ob.faltaGwh : ob.sobraGwh)}<small>GWh</small>
                            </div>
                            <p className="fx-hero-tit">
                                {ob.faltaGwh > 0
                                    ? <>le faltan por cubrir con CAE, aunque se emita todo lo de BROKERGY</>
                                    : <>le sobran: con lo de otros y lo de BROKERGY cubre su obligación</>}
                            </p>
                            {ob.faltaGwh > 0 && (
                                <p className="fx-hero-pie">Si no los compra, ≈ <b>{eur(ob.faltaEur, 0)}</b> al Fondo a {num(ob.equivalencia_mwh, 3)} €/MWh.</p>
                            )}
                            <div className="so-asegurado">
                                <div className="so-asegurado-top">
                                    <span>Asegurado hoy <span className="so-ayuda">(otros + lo de BROKERGY ya emitido)</span></span>
                                    <b>{pct(ob.pctAsegurado)}</b>
                                </div>
                                <div className="fx-barra"><i style={{ width: `${Math.min(100, ob.pctAsegurado)}%`, backgroundSize: `${100 / Math.max(ob.pctAsegurado, 1) * 100}% 100%` }} /></div>
                                {/* Asegurado no es cumplido: lo emitido está en su cuenta y cuenta cuando lo LIQUIDA. */}
                                {registro && registro.liquidadoKwh != null && (
                                    <p className="so-ayuda" style={{ margin: '8px 0 0', fontSize: 12.5 }}>
                                        Según el MITECO ({fechaEs(registro.fechaCertificado)}): <b style={{ color: 'var(--tinta)' }}>{gwh(registro.totalKwh / 1e6)}</b> en
                                        su cuenta y <b style={{ color: 'var(--tinta)' }}>{gwh(registro.liquidadoKwh / 1e6)}</b> liquidados contra {anio}.
                                    </p>
                                )}
                            </div>
                            {(ob.fuente || (notas && ob.notas)) && (
                                <p className="fx-hero-pie">{[ob.fuente, notas ? ob.notas : null].filter(Boolean).join(' · ')}</p>
                            )}
                        </>
                    ) : sinObligacion}
                </section>

                {ob && (
                    <div className="fx-kpis so-kpis fx-in" style={{ '--i': 3 }}>
                        {kpi('Obligación', num(ob.obligacion_gwh), 'GWh', <>{eur(ob.obligacionEur, 0)}</>)}
                        {kpi(`Mínimo al Fondo · ${pct(ob.pct_fondo)}`, num(ob.fondoGwh), 'GWh', <>{eur(ob.fondoEur, 0)}, sí o sí</>, 'fx-kpi-apagado')}
                        {kpi('Cubrible con CAE', num(ob.cubribleGwh), 'GWh', <>{eur(ob.cubribleEur, 0)}</>)}
                        {kpi('Comprado a otros', num(ob.otros_gwh), 'GWh', 'de otros agentes')}
                        {kpi('Con BROKERGY', num(ob.brokergyGwh), 'GWh', <>
                            <b>{gwh(ob.emitidoGwh)}</b> ya emitidos
                            {/* El €/MWh solo llega en la vista INTERNA: al S.O. el servidor
                                le pasa solo el ahorro (`CAMPOS_OBLIGACION`, Fran 05/11/2026). */}
                            {((conPrecio && ob.costeCaeMwh > 0) || ob.ahorroCaeEur > 0) && (
                                <span className="so-precio-cae"
                                    title={conPrecio && ob.costeCaeMwh > 0
                                        ? `Solo lo ve nuestro equipo: lo que paga por cada MWh, sin IVA (nuestra factura más la verificación), sobre los ${ob.costeCaeLotes} lotes con la verificación ya facturada (${gwh(ob.costeCaeGwh)}). Aportarlo al Fondo cuesta ${num(ob.equivalencia_mwh, 3)} €/MWh.`
                                        : `Lo que os ahorráis frente a aportarlo al Fondo Nacional (${num(ob.equivalencia_mwh, 3)} €/MWh), con los lotes que ya tienen la verificación facturada.`}>
                                    {conPrecio && ob.costeCaeMwh > 0 && <>CAE a <b>{num(ob.costeCaeMwh, 2)} €/MWh</b> con verificación · </>}
                                    {ob.ahorroCaeEur > 0 && <>Ahorro frente al Fondo: <b>{eur(ob.ahorroCaeEur, 0)}</b></>}
                                </span>
                            )}
                        </>, 'so-kpi-marca')}
                        {kpi('Cubierto si se emite todo', pct(ob.pctCubierto), null, <>otros + todo lo de BROKERGY</>)}
                    </div>
                )}
            </div>

            {ob && (
                <section className="fx-card fx-pad fx-in" style={{ '--i': 4, marginTop: 14 }} aria-label="La cuota, tramo a tramo">
                    <div className="fx-card-cab">
                        <div>
                            <div className="fx-eyebrow fx-eyebrow-gris">La cuota, tramo a tramo</div>
                            <h2 className="fx-display fx-h3">{gwh(ob.obligacion_gwh)} de obligación</h2>
                        </div>
                        {ob.ventas_gwh ? <span className="fx-pildora">ventas computables {gwh(ob.ventas_gwh)}</span> : null}
                    </div>
                    <BarraObligacion ob={ob} etapas={etapas} />
                </section>
            )}
        </>
    );
}

/** Los lotes por etapa vista desde el S.O.; `filaLote` pinta cada lote y `children` va al final. */
export function EtapasLotes({ etapas, brokergyGwh, anio, filaLote, children = null }) {
    return (
        <section className="so-seccion">
            <div className="so-seccion-cab">
                <div>
                    <div className="fx-eyebrow">Lo que le llevamos para {anio}</div>
                    <h2 className="fx-display fx-h2">{gwh(brokergyGwh)} en {etapas.reduce((s, e) => s + e.lotes.length, 0)} lotes</h2>
                    <p>Cada lote con su cifra más firme: CAE de la resolución → nuestra factura → verificado → estimado.</p>
                </div>
            </div>
            <div className="so-etapas">
                {etapas.map((e, i) => {
                    const nReq = e.lotes.filter(l => l.requerimiento).length;
                    return (
                        <div key={e.id} className="fx-card fx-pad fx-in" style={{ '--i': 5 + i }}>
                            <div className="so-etapa-k">
                                <span className="fx-dot" style={{ '--c': COLOR[e.id] }} />
                                <span className="fx-kpi-k">{e.titulo}</span>
                            </div>
                            <div className="fx-importe so-etapa-v">{num(e.kwh / 1e6)}<small>GWh</small></div>
                            <div className="so-etapa-n">
                                <span>{e.lotes.length} lote{e.lotes.length === 1 ? '' : 's'} · {e.sub}</span>
                                {nReq > 0 && <span className="fx-chip fx-chip-ambar"><Ico n="alerta" />{nReq} con requerimiento</span>}
                            </div>
                            {e.lotes.length > 0
                                ? <ul className="so-lotes">{e.lotes.map(filaLote)}</ul>
                                : <p className="so-vacio">Ninguno ahora mismo.</p>}
                        </div>
                    );
                })}
            </div>
            {children}
        </section>
    );
}

// ─── Su cuenta en el REGISTRO NACIONAL DE CAE (19/11/2026) ──────────────────────
// Del certificado del MITECO al S.O.: lo que tiene inscrito sin liquidar, lo que
// está por resolver y lo liquidado contra el año. Que un lote salga FAVORABLE es el
// final para nosotros, pero el CAE solo cuenta para su obligación cuando ÉL lo
// liquida (Fran: «puede ser que para nosotros sea resolución favorable, pero luego
// los tienen que liquidar ellos»). Se pinta como CAMINO: lo que está en la
// Administración → en su cuenta → liquidado, y el último paso es SUYO.
// La comparten la Vista S.O. y la página del propio S.O. (`nombre` es el suyo).
export function RegistroCae({ reg, anio, nombre, paraElSo = false, accion = null }) {
    const [verTramos, setVerTramos] = useState(false);
    if (!reg) return null;
    const g = (kwh) => num((kwh || 0) / 1e6);
    const liquidado = reg.liquidadoKwh;
    const tramos = [...reg.tramos].sort((a, b) => a.vence.localeCompare(b.vence) || String(a.expediente).localeCompare(String(b.expediente)));
    const otrosDif = reg.otrosDeclaradoKwh != null ? reg.otrosKwh - reg.otrosDeclaradoKwh : null;

    const paso = (n, c, titulo, kwh, quien, pie, lista = null, extra = '') => (
        <div className={`fx-card fx-pad so-paso fx-in ${extra}`} style={{ '--i': 5 + n, '--c': c }}>
            <div className="so-etapa-k">
                <span className="so-paso-n">{n}</span>
                <span className="fx-kpi-k">{titulo}</span>
                <span className="so-paso-quien">{quien}</span>
            </div>
            <div className="fx-importe so-etapa-v">{kwh == null ? '—' : g(kwh)}{kwh != null && <small>GWh</small>}</div>
            <div className="so-reparto">{pie}</div>
            {lista && lista.length > 0 && <ul>{lista}</ul>}
        </div>
    );
    const filaL = (cod, kwh, extra) => (
        <li key={cod + (extra || '')}><b>{cod}</b><span>{extra ? `${extra} · ` : ''}{mwh(kwh)}</span></li>
    );

    return (
        <section className="so-seccion" aria-label="Cuenta en el Registro Nacional de CAE">
            <div className="so-seccion-cab">
                <div>
                    <div className="fx-eyebrow">Su cuenta en el Registro Nacional de CAE</div>
                    <h2 className="fx-display fx-h2">
                        {gwh(reg.totalKwh / 1e6)} a su nombre, <span className="fx-mark">
                            {liquidado == null ? 'liquidado: sin dato' : liquidado > 0 ? `${gwh(liquidado / 1e6)} liquidados` : 'nada liquidado'}</span>{liquidado != null ? ` contra ${anio}` : ''}
                    </h2>
                    <p>
                        Certificado del MITECO del <b>{fechaEs(reg.fechaCertificado)}</b>
                        {reg.fechaDatos ? <>, con los CAE inscritos a <b>{fechaEs(reg.fechaDatos)}</b></> : null}
                        {reg.fechaPendientes ? <> y las solicitudes a <b>{fechaEs(reg.fechaPendientes)}</b></> : null}.
                        {' '}La resolución favorable deja el CAE en su cuenta; para que cuente en la obligación{' '}
                        {nombre} tiene que solicitar su liquidación.
                    </p>
                </div>
                {accion}
            </div>

            <div className="so-camino">
                {paso(1, COLOR_REGISTRO.PRESENTADO, 'Recién presentados', reg.presentados.reduce((s, x) => s + x.kwh, 0), 'Administración',
                    reg.presentados.length
                        ? <>Lotes de BROKERGY con nº de registro que aún no figuraban en el certificado.</>
                        : <>Nada presentado después del certificado.</>,
                    reg.presentados.map(x => filaL(x.codigo, x.kwh)))}
                {paso(2, COLOR_REGISTRO.PTE, 'Pendientes de resolución', reg.pendientesKwh, 'Administración',
                    <>{reg.pendientes.length} solicitud{reg.pendientes.length === 1 ? '' : 'es'} de emisión sin resolver
                        {reg.pendientes.length && reg.pendientes.every(p => p.lote) ? ', todas de BROKERGY' : ''}.</>,
                    reg.pendientes.map(p => filaL(p.lote || p.expediente, p.kwh || 0, p.lote ? p.expediente : 'otro agente')))}
                {paso(3, COLOR_REGISTRO.CUENTA, 'En su cuenta, sin liquidar', reg.totalKwh, 'Inscritos',
                    <><b>{g(reg.brokergyKwh)} GWh</b> de BROKERGY ({reg.nBrokergy} tramos) y <b>{g(reg.otrosKwh)} GWh</b> de otros agentes ({reg.nOtros}).
                        {reg.nuevos?.length > 0 && <> Incluye <b>{g(reg.nuevosKwh)} GWh</b> resueltos después del certificado.</>}
                        {reg.pctCubribleEnCuenta != null && <> Es el <b>{pct(reg.pctCubribleEnCuenta)}</b> de lo que puede cubrir con CAE.</>}</>,
                    (reg.nuevos || []).map(x => filaL(x.codigo, x.kwh, x.fechaResolucion ? `resuelto el ${fechaEs(x.fechaResolucion)}` : 'resuelto después')))}
                {paso(4, COLOR_REGISTRO.LIQUIDADO, `Liquidado contra ${anio}`, liquidado, `Le toca a ${nombre}`,
                    liquidado == null ? <>El certificado no lo dice.</>
                        : liquidado > 0 ? <>Ya cuenta para la obligación de {anio}.</>
                            : <>Ningún CAE liquidado todavía contra {anio}: lo inscrito aún <b>no cuenta</b> para la obligación.</>,
                    null, 'so-paso-suyo')}
            </div>

            <div className="so-venc" aria-label="Vencimientos">
                {reg.porVencimiento.map(v => (
                    <span key={v.anio} className={v.anio === anio ? 'so-venc-ya' : ''}
                        title={`${v.n} tramos · ${g(v.brokergyKwh)} GWh de BROKERGY`}>
                        Vencen el 31/12/{v.anio} <b>{g(v.kwh)} GWh</b>
                    </span>
                ))}
            </div>

            {reg.venceKwh > 0 && (
                <AvisoFx tono="vence" className="so-of-pie">
                    <b>{gwh(reg.venceKwh / 1e6)} vencen el 31/12/{anio}</b> ({reg.nVence} tramo{reg.nVence === 1 ? '' : 's'}
                    {reg.venceBrokergyKwh > 0 ? `, ${g(reg.venceBrokergyKwh)} GWh de BROKERGY` : ', ninguno de BROKERGY'}):
                    {' '}o se liquidan contra la obligación de {anio}, o se pierden.
                </AvisoFx>
            )}
            {reg.noConstan.length > 0 && (
                <AvisoFx tono="ambar" className="so-of-pie">
                    <b>{reg.noConstan.map(x => x.codigo).join(' · ')}</b>: {reg.noConstan.length === 1 ? 'lo damos' : 'los damos'} por emitido{reg.noConstan.length === 1 ? '' : 's'} y no
                    {reg.noConstan.length === 1 ? ' figura' : ' figuran'} entre los CAE sin liquidar del certificado. O ya se liquidó, o algo no cuadra.
                </AvisoFx>
            )}
            {!paraElSo && otrosDif != null && (
                Math.abs(otrosDif) < 1000
                    ? <AvisoFx tono="ok" className="so-of-pie">Lo de otros agentes en su cuenta (<b>{g(reg.otrosKwh)} GWh</b>) cuadra con lo que nos dijo que había comprado.</AvisoFx>
                    : <AvisoFx tono="ambar" className="so-of-pie">En su cuenta hay <b>{g(reg.otrosKwh)} GWh</b> de otros agentes y nos dijo <b>{g(reg.otrosDeclaradoKwh)} GWh</b>: {otrosDif > 0 ? 'tiene más de lo que dijo' : 'falta por inscribir parte de lo que compró'}.</AvisoFx>
            )}

            <div className="so-fuera">
                <button type="button" className="fx-link" aria-expanded={verTramos} onClick={() => setVerTramos(v => !v)}>
                    <Ico d={verTramos ? 'M6 9l6 6 6-6' : 'M9 6l6 6-6 6'} size={16} sw={2.4} />
                    Los {reg.nTramos} tramos inscritos, por vencimiento
                </button>
                {verTramos && (
                    <div className="fx-card fx-pad" style={{ marginTop: 10 }}>
                        <div className="fx-tabla-caja" style={{ marginTop: 0 }}>
                            <table className="fx-tabla so-tramos">
                                <thead><tr><th>Vence</th><th>Expediente de emisión</th><th className="so-num">CAE</th><th>De</th></tr></thead>
                                <tbody>
                                    {tramos.map(t => (
                                        <tr key={t.inicial || t.expediente} className={t.lote ? 'so-nuestro' : ''}>
                                            <td>{fechaEs(t.vence)}</td>
                                            <td className="so-mono" title={`${t.inicial} → ${t.final}`}>{t.expediente}</td>
                                            <td className="so-num">{t.total.toLocaleString('es-ES')}</td>
                                            <td className="so-de">{t.lote ? `BROKERGY · ${t.lote}` : 'otro agente'}{t.nuevo ? ' · después del certificado' : ''}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </section>
    );
}

// ─── Subir el certificado del MITECO (solo ADMIN): primero se LEE, luego se guarda ─
function SubirRegistroModal({ so, onClose, onGuardado }) {
    const [excel, setExcel] = useState(null);
    const [pdf, setPdf] = useState(null);
    const [leido, setLeido] = useState(null);
    const [ocupado, setOcupado] = useState(false);
    const [err, setErr] = useState(null);
    const base = `/api/lotes/obligacion-so/${so.id_empresa}/registro`;
    const enviar = async (guardar) => {
        setOcupado(true); setErr(null);
        try {
            const fd = new FormData();
            fd.append('excel', excel);
            if (pdf) fd.append('pdf', pdf);
            const { data } = await axios.post(guardar ? `${base}?guardar=1` : base, fd);
            if (guardar) onGuardado(data); else setLeido(data);
        } catch (e) {
            setErr(e.response?.data?.error || 'No se ha podido leer');
        } finally { setOcupado(false); }
    };
    const r = leido?.registro;
    const total = r ? r.tramos.reduce((s, t) => s + t.total, 0) : 0;
    return (
        <DialogoFx antetitulo={`${presName(so)} · certificado del MITECO`} titulo="Su cuenta en el Registro" onClose={onClose} ocupado={ocupado}
            pie={<>
                <button type="button" className="fx-btn fx-btn-sec" onClick={onClose} disabled={ocupado}>Cancelar</button>
                {r ? (
                    <button type="button" className="fx-btn fx-btn-pri" onClick={() => enviar(true)} disabled={ocupado}>
                        <Ico n="check" size={18} />Guardar
                    </button>
                ) : (
                    <button type="button" className="fx-btn fx-btn-pri" onClick={() => enviar(false)} disabled={ocupado || !excel}>
                        <Ico n="leer" size={18} />{ocupado ? 'Leyendo…' : 'Leer'}
                    </button>
                )}
            </>}>
            <p className="so-ayuda" style={{ fontSize: 13.5, color: 'var(--gris)' }}>
                El Excel de los tramos inscritos sin liquidar y el PDF del certificado (fechas, solicitudes sin resolver y lo
                liquidado). Sustituye al que hubiera: cada certificado es la foto completa de su cuenta.
            </p>
            <label className="fx-campo">
                <span>Excel de tramos (.xlsx)</span>
                <input className="fx-input" type="file" accept=".xlsx" onChange={e => { setExcel(e.target.files?.[0] || null); setLeido(null); }} />
            </label>
            <label className="fx-campo">
                <span>Certificado (.pdf)</span>
                <input className="fx-input" type="file" accept=".pdf" onChange={e => { setPdf(e.target.files?.[0] || null); setLeido(null); }} />
            </label>
            {err && <AvisoFx tono="ambar">{err}</AvisoFx>}
            {r && (
                <div className="fx-dlg-cifra">
                    <div className="fx-eyebrow fx-eyebrow-verde">Leído · sin guardar</div>
                    <span className="fx-importe" style={{ fontSize: 40 }}>{num(total / 1e6)}<small>&nbsp;GWh</small></span>
                    <p>
                        {r.tramos.length} tramos · {r.pendientes.length} solicitudes sin resolver
                        {r.liquidado ? ` · liquidado contra ${r.liquidado.anio}: ${num((r.liquidado.kwh || 0) / 1e6)} GWh` : ''}
                        {r.fecha_certificado ? ` · certificado del ${fechaEs(r.fecha_certificado)}` : ''}
                    </p>
                </div>
            )}
            {leido?.avisos?.map(a => <AvisoFx key={a} tono="ambar">{a}</AvisoFx>)}
        </DialogoFx>
    );
}

// ─── El ENLACE de solo lectura para el S.O. (solo ADMIN) ────────────────────────
function EnlaceSoModal({ so, onClose, avisar }) {
    const [estado, setEstado] = useState({ cargando: true, enlace: null, error: null });
    const [ocupado, setOcupado] = useState(false);
    // «Cambiar» y «Quitar» dejan muerto el enlace que ya tenga: se piden dos veces.
    const [confirmar, setConfirmar] = useState(null);
    const base = `/api/lotes/obligacion-so/${so.id_empresa}/enlace`;

    useEffect(() => {
        let vivo = true;
        axios.get(base)
            .then(({ data }) => vivo && setEstado({ cargando: false, enlace: data?.enlace || null, error: null }))
            .catch(err => vivo && setEstado({ cargando: false, enlace: null, error: errorDeApi(err) }));
        return () => { vivo = false; };
    }, [base]);

    const url = estado.enlace ? `${window.location.origin}/so/${estado.enlace.token}` : null;
    const hacer = async (accion) => {
        setOcupado(true);
        try {
            const { data } = accion === 'quitar' ? await axios.delete(base) : await axios.post(base);
            setEstado({ cargando: false, enlace: data?.enlace || null, error: null });
            setConfirmar(null);
            avisar(accion === 'quitar' ? 'Enlace quitado: el anterior ya no abre' : accion === 'cambiar' ? 'Enlace nuevo: el anterior ya no abre' : 'Enlace creado');
        } catch (err) {
            avisar(err.response?.data?.error || 'No se ha podido', 'aviso');
        } finally { setOcupado(false); }
    };
    const copiar = () => navigator.clipboard?.writeText(url)
        .then(() => avisar('Enlace copiado'))
        .catch(() => avisar('No se ha podido copiar: selecciónalo a mano', 'aviso'));

    return (
        <DialogoFx antetitulo={`${presName(so)} · solo lectura`} titulo="Enlace para el S.O." onClose={onClose} ocupado={ocupado}
            pie={url ? (
                confirmar ? (
                    <>
                        <button type="button" className="fx-btn fx-btn-sec" onClick={() => setConfirmar(null)} disabled={ocupado}>No</button>
                        <button type="button" className="fx-btn fx-btn-pri" onClick={() => hacer(confirmar)} disabled={ocupado}>
                            {confirmar === 'quitar' ? 'Sí, quitarlo' : 'Sí, hacer uno nuevo'}
                        </button>
                    </>
                ) : (
                    <>
                        <button type="button" className="fx-btn fx-btn-sec" onClick={() => setConfirmar('quitar')} disabled={ocupado}>Quitar</button>
                        <button type="button" className="fx-btn fx-btn-sec" onClick={() => setConfirmar('cambiar')} disabled={ocupado}>Cambiar</button>
                        <a className="fx-btn fx-btn-sec" href={url} target="_blank" rel="noreferrer">Abrir</a>
                        <button type="button" className="fx-btn fx-btn-pri" onClick={copiar}><Ico n="check" size={18} />Copiar</button>
                    </>
                )
            ) : (
                <>
                    <button type="button" className="fx-btn fx-btn-sec" onClick={onClose} disabled={ocupado}>Cerrar</button>
                    <button type="button" className="fx-btn fx-btn-pri" onClick={() => hacer('crear')} disabled={ocupado || estado.cargando || !!estado.error}>
                        <Ico n="mas" size={18} />Crear el enlace
                    </button>
                </>
            )}>
            <p className="so-ayuda" style={{ fontSize: 13.5, color: 'var(--gris)' }}>
                Una página en tiempo real con su obligación, nuestros lotes por etapa (código, estado, actuaciones y MWh) y, de lo
                que no está en ningún lote, solo el total. Sin clientes ni importes nuestros. La ve quien tenga el enlace: si
                llega a quien no debe, cámbialo y el anterior deja de abrir.
            </p>
            {estado.error ? <ErrorApi error={estado.error} que="el enlace" />
                : estado.cargando ? <div className="fx-sk fx-sk-linea" />
                    : url ? (
                        <>
                            <input className="fx-input so-enlace" readOnly value={url} onFocus={e => e.target.select()} aria-label="Enlace" />
                            {confirmar && (
                                <AvisoFx tono="ambar">
                                    {confirmar === 'quitar' ? 'El enlace dejará de abrir para quien lo tenga.' : 'Se hace uno nuevo y el que tenga dejará de abrir.'}
                                </AvisoFx>
                            )}
                            <p className="so-ayuda">Creado el {new Date(estado.enlace.creado_at).toLocaleDateString('es-ES')}{estado.enlace.creado_por ? ` por ${estado.enlace.creado_por}` : ''}.</p>
                        </>
                    ) : <p className="so-ayuda">Todavía no tiene enlace.</p>}
        </DialogoFx>
    );
}

export function SujetoObligadoPanel({
    lotes, soList, canEdit = false, onAbrirLote, cargando = false, errorLotes = null, onModo, onNuevoLote,
}) {
    const [toast, avisar] = useToastFx();

    // Los S.O. con algún lote, el que más tiene primero (hoy INTERALCO).
    const sos = useMemo(() => {
        const cuenta = {};
        for (const l of lotes) if (l.sujeto_obligado_id) cuenta[l.sujeto_obligado_id] = (cuenta[l.sujeto_obligado_id] || 0) + 1;
        return [...soList]
            .map(p => ({ ...p, nLotes: cuenta[p.id_empresa] || 0 }))
            .sort((a, b) => b.nLotes - a.nLotes || presName(a).localeCompare(presName(b), 'es'));
    }, [lotes, soList]);

    const [soId, setSoId] = useState(null);
    const so = sos.find(p => p.id_empresa === soId) || sos[0] || null;
    const [anio, setAnio] = useState(new Date().getFullYear());
    // La obligación se guarda con el S.O. al que pertenece: al cambiar de S.O. la
    // anterior deja de valer sola, sin vaciarla a mano dentro de un efecto.
    const [cfg, setCfg] = useState({ id: null, data: null, error: null });
    const config = cfg.id === so?.id_empresa ? cfg.data : null;
    const cfgError = cfg.id === so?.id_empresa ? cfg.error : null;
    const setConfig = (data) => setCfg({ id: so?.id_empresa, data, error: null });
    const [disp, setDisp] = useState(null);
    const [dispError, setDispError] = useState(null);
    // El certificado del MITECO con su cuenta del Registro, ligado a su S.O. como la obligación.
    const [reg, setReg] = useState({ id: null, data: null });
    const registro = reg.id === so?.id_empresa ? reg.data : null;
    const [subiendoRegistro, setSubiendoRegistro] = useState(false);
    const [editando, setEditando] = useState(false);
    const [abierto, setAbierto] = useState(null); // etapa de lo disponible desplegada
    const [verFuera, setVerFuera] = useState(false);
    const [recarga, setRecarga] = useState(0);
    // El logo que no carga se quita (ligado al S.O.: al cambiar de S.O. se vuelve a intentar).
    const [logoFallaDe, setLogoFallaDe] = useState(null);
    const logoFalla = logoFallaDe != null && logoFallaDe === so?.id_empresa;
    const setLogoFalla = () => setLogoFallaDe(so?.id_empresa ?? null);
    const [logoFondo, setLogoFondo] = useState({ id: null, oscuro: false });

    useEffect(() => {
        const id = so?.id_empresa;
        if (!id) return;
        let vivo = true;
        axios.get(`/api/lotes/obligacion-so/${id}`)
            .then(({ data }) => vivo && setCfg({ id, data: normalizarObligacion(data), error: null }))
            .catch(err => vivo && setCfg({ id, data: null, error: errorDeApi(err) }));
        return () => { vivo = false; };
    }, [so?.id_empresa, recarga]);
    useEffect(() => {
        const id = so?.id_empresa;
        if (!id) return;
        let vivo = true;
        // Sin certificado (o sin poder leerlo) la vista sigue como antes: es un añadido.
        axios.get(`/api/lotes/obligacion-so/${id}/registro`)
            .then(({ data }) => vivo && setReg({ id, data: data?.registro || null }))
            .catch(() => vivo && setReg({ id, data: null }));
        return () => { vivo = false; };
    }, [so?.id_empresa, recarga]);
    useEffect(() => {
        let vivo = true;
        axios.get('/api/lotes/disponible')
            .then(({ data }) => vivo && (setDisp(data), setDispError(null)))
            .catch(err => vivo && setDispError(errorDeApi(err)));
        return () => { vivo = false; };
    }, [recarga]);

    const anios = useMemo(() => aniosElegibles(config, lotes, so?.id_empresa), [config, lotes, so?.id_empresa]);
    const vista = useMemo(
        () => (so ? computeVistaSo({ lotes, soId: so.id_empresa, anio, config, disponible: disp, registro }) : null),
        [lotes, so, anio, config, disp, registro]);
    // El certificado es una foto de UN año: con otro año elegido no se pinta.
    const regDelAnio = vista?.registro && vista.registro.anioRegistro === anio ? vista.registro : null;
    const plan = useMemo(
        () => (vista?.oferta && vista.obligacion ? planParaCubrir(vista.oferta, vista.obligacion.faltaGwh) : null),
        [vista]);
    const [verEnlace, setVerEnlace] = useState(false);

    const guardar = async (siguiente) => {
        try {
            const { data } = await axios.put(`/api/lotes/obligacion-so/${so.id_empresa}`, siguiente);
            setConfig(normalizarObligacion(data));
            return true;
        } catch (err) {
            avisar(err.response?.data?.error || 'No se ha podido guardar', 'aviso');
            return false;
        }
    };
    const guardarAnio = async (f) => {
        const ok = await guardar({ ...config, anios: { ...(config?.anios || {}), [anio]: f } });
        if (ok) { setEditando(false); avisar(`Obligación ${anio} guardada`); }
    };
    const asignar = async (loteId, valor) => {
        const asignacion = { ...(config?.asignacion || {}) };
        if (valor === 'AUTO') delete asignacion[loteId]; else asignacion[loteId] = valor;
        if (await guardar({ ...config, asignacion })) avisar(valor === 'NO' ? 'El lote ya no cuenta' : 'Año del lote cambiado');
    };

    const ob = vista?.obligacion;

    // Dos renglones: código y MWh arriba; estado, de dónde sale la cifra y para
    // qué año cuenta, abajo.
    const filaLote = (l) => (
        <li key={l.id} className="so-lote" role="button" tabIndex={0} title={`Abrir ${l.codigo}`}
            onClick={() => onAbrirLote?.(l.id)}
            onKeyDown={e => { if (e.key === 'Enter' && e.target === e.currentTarget) onAbrirLote?.(l.id); }}>
            <span className="so-lote-cod">{l.codigo}</span>
            <span className="so-lote-mwh">{mwh(l.kwh)}</span>
            <span className="so-lote-pie">
                <span className={`fx-chip ${chipEstado(l)}`} title={l.estado}>{l.estado}</span>
                {regDelAnio && <ChipRegistro r={l.registro} />}
                <span className="so-fuente">{FUENTE[l.fuente]}</span>
                {canEdit ? (
                    <select className="fx-select so-anio" value={l.manual || 'AUTO'} aria-label={`Año de obligación de ${l.codigo}`}
                        onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()} onChange={e => asignar(l.id, e.target.value)}
                        title="Para qué año de obligación cuenta este lote">
                        <option value="AUTO">{l.anioAuto} (auto)</option>
                        {[l.anioAuto - 1, l.anioAuto + 1].map(a => <option key={a} value={String(a)}>{a}</option>)}
                        <option value="NO">No cuenta</option>
                    </select>
                ) : l.anio !== anio && (
                    <span className="so-anio-txt">{l.anio ? `cuenta para ${l.anio}` : 'no cuenta'}</span>
                )}
            </span>
        </li>
    );

    const cabecera = (
        <header className="fx-cab fx-in">
            <div>
                <div className="fx-eyebrow">Lotes · vista del Sujeto Obligado</div>
                <div className="so-tit">
                    <h1 className="fx-display fx-h1">Cómo va <span className="fx-mark">{so ? presName(so) : 'el S.O.'}</span></h1>
                    {so?.logo_empresa && !logoFalla && (
                        <span className={`so-logo ${logoFondo.id === so.id_empresa && logoFondo.oscuro ? 'so-logo-oscuro' : ''}`}>
                            <img src={so.logo_empresa} alt={`Logo de ${presName(so)}`} onError={() => setLogoFalla(true)}
                                onLoad={e => setLogoFondo({ id: so.id_empresa, oscuro: logoEsClaro(e.currentTarget) })} />
                        </span>
                    )}
                </div>
                <p className="fx-sub">
                    {so ? <>{so.razon_social || presName(so)}{so.cif ? <> · NIF <b>{so.cif}</b></> : null}. </> : null}
                    Su obligación del año, lo que ya tiene y lo que le podemos llevar.
                </p>
            </div>
            <div className="fx-cab-acc">
                <div className="fx-seg" role="group" aria-label="Vista">
                    <button type="button" aria-pressed="false" onClick={() => onModo?.('LOTES')}><Ico n="lista" size={16} />Lotes</button>
                    <button type="button" aria-pressed="true"><Ico n="tabla" size={16} />Vista S.O.</button>
                </div>
                {canEdit && so && (
                    <button type="button" className="fx-btn fx-btn-sec" onClick={() => setVerEnlace(true)} title={`Página de solo lectura para ${presName(so)}`}>
                        <Ico n="info" size={18} />Enlace para {presName(so)}
                    </button>
                )}
                {onNuevoLote && (
                    <button type="button" className="fx-btn fx-btn-sec" onClick={onNuevoLote}><Ico n="mas" size={18} />Nuevo lote</button>
                )}
            </div>
        </header>
    );

    let cuerpo;
    if (errorLotes) {
        cuerpo = <AvisoFx tono="ambar"><b>No se han podido traer los lotes.</b> {errorLotes}</AvisoFx>;
    } else if (cargando) {
        cuerpo = (
            <div className="so-dash">
                <div className="fx-sk" style={{ height: 300, borderRadius: 24 }} />
                <div className="fx-kpis so-kpis">{[0, 1, 2, 3, 4, 5].map(i => <div key={i} className="fx-sk fx-sk-kpi" />)}</div>
            </div>
        );
    } else if (!so) {
        cuerpo = (
            <div className="fx-card fx-vacio">
                <span className="fx-tile fx-tile-l fx-tile-crema"><Ico n="info" size={22} /></span>
                <p>No hay ningún Sujeto Obligado dado de alta.</p>
            </div>
        );
    } else {
        // Un expediente del plan: nº, MWh y ficha; si está por terminar, su estado
        // (es lo que dice qué le falta); y sus incidencias leves, si tiene.
        const tileExp = (x, meta = false) => {
            const leves = Number(x.incidencias?.leves) || 0;
            return (
                <div key={x.numero} className={`so-exp ${meta ? 'so-exp-meta' : ''}`} title={`${x.estado} · ${x.origen || 'sin cifra'}`}>
                    <b>{x.numero}</b>
                    <small>{mwh(x.kwh)} · {x.ficha}</small>
                    {x.estado !== 'DOC. COMPLETA' && <small>{x.estado}</small>}
                    {leves > 0 && <small className="so-exp-inc">⚠ {leves} leve{leves === 1 ? '' : 's'}</small>}
                </div>
            );
        };
        cuerpo = (
            <>
                {/* Selector de S.O. y año */}
                <div className="fx-hoy-cab fx-in" style={{ '--i': 1 }}>
                    <div className="fx-chips" style={{ margin: 0 }}>
                        {sos.filter(p => p.nLotes > 0 || p.id_empresa === so.id_empresa).map(p => (
                            <button key={p.id_empresa} type="button" className="fx-chip-f" aria-pressed={p.id_empresa === so.id_empresa}
                                onClick={() => setSoId(p.id_empresa)}>
                                {presName(p)}<b>{p.nLotes}</b>
                            </button>
                        ))}
                    </div>
                    <div className="fx-seg" role="group" aria-label="Año de la obligación">
                        {anios.map(a => (
                            <button key={a} type="button" aria-pressed={a === anio} onClick={() => setAnio(a)}>{a}</button>
                        ))}
                    </div>
                </div>

                {cfgError && <ErrorApi error={cfgError} que="la obligación" onReintentar={() => setRecarga(r => r + 1)} className="fx-in" />}

                {/* La obligación del año: la cifra protagonista, sus cuentas y la barra */}
                <ResumenObligacion ob={ob} anio={anio} etapas={vista?.etapas || []} style={{ marginTop: cfgError ? 14 : 0 }}
                    notas conPrecio={canEdit} registro={regDelAnio}
                    editar={canEdit && config && ob ? (
                        <button type="button" className="fx-btn fx-btn-sec fx-btn-peq" onClick={() => setEditando(true)}>
                            <Ico n="lapiz" size={16} />Editar
                        </button>
                    ) : null}
                    sinObligacion={config ? (
                        <div className="fx-vacio fx-vacio-peq" style={{ justifyItems: 'start', textAlign: 'left', padding: '18px 0 4px' }}>
                            <p>Sin la obligación de {anio}. {canEdit ? 'Ponla con los datos del Anexo II de la Orden: cuota, % al Fondo y lo que ya tiene comprado a otros.' : 'La pone un administrador con los datos del Anexo II.'}</p>
                            {canEdit && (
                                <button type="button" className="fx-btn fx-btn-pri" onClick={() => setEditando(true)}>
                                    <Ico n="mas" size={18} />Poner la obligación
                                </button>
                            )}
                        </div>
                    ) : !cfgError && (
                        <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
                            <div className="fx-sk fx-sk-cifra" /><div className="fx-sk fx-sk-linea" /><div className="fx-sk fx-sk-linea" style={{ width: '70%' }} />
                        </div>
                    )} />

                {/* Lo que dice el MITECO de su cuenta: inscrito, por resolver y liquidado */}
                {regDelAnio ? (
                    <RegistroCae reg={regDelAnio} anio={anio} nombre={presName(so)}
                        accion={canEdit ? (
                            <button type="button" className="fx-btn fx-btn-sec fx-btn-peq" onClick={() => setSubiendoRegistro(true)}>
                                <Ico n="leer" size={16} />Nuevo certificado
                            </button>
                        ) : null} />
                ) : canEdit && ob && (
                    <AvisoFx tono="crema" icono="info" className="so-of-pie" style={{ marginTop: 14 }}
                        accion={<button type="button" className="fx-btn fx-btn-sec fx-btn-peq" onClick={() => setSubiendoRegistro(true)}><Ico n="leer" size={16} />Subir certificado</button>}>
                        Sin el certificado del MITECO de {anio}: con él se ve lo que {presName(so)} tiene de verdad en su cuenta, lo que vence y lo que ha liquidado.
                    </AvisoFx>
                )}

                {/* Lo nuestro con él, por etapas */}
                {vista && (
                    <EtapasLotes etapas={vista.etapas} brokergyGwh={vista.brokergyGwh} anio={anio} filaLote={filaLote}>
                        {vista.fuera.length > 0 && (
                            <div className="so-fuera">
                                <button type="button" className="fx-link" aria-expanded={verFuera} onClick={() => setVerFuera(v => !v)}>
                                    <Ico d={verFuera ? 'M6 9l6 6 6-6' : 'M9 6l6 6-6 6'} size={16} sw={2.4} />
                                    {vista.fuera.length} lote{vista.fuera.length === 1 ? '' : 's'} de {presName(so)} que cuentan para otro año o no cuentan
                                </button>
                                {verFuera && (
                                    <div className="fx-card fx-pad" style={{ marginTop: 10 }}>
                                        <ul className="so-lotes" style={{ marginTop: 0, borderTop: 0 }}>{vista.fuera.map(filaLote)}</ul>
                                    </div>
                                )}
                            </div>
                        )}
                    </EtapasLotes>
                )}

                {/* Con qué se cubre lo que le falta: lo listo y lo que hay que cerrar */}
                {ob?.faltaGwh > 0 && plan && (
                    <section className="so-seccion" aria-label="Para cubrir lo que le falta">
                        <div className="so-seccion-cab">
                            <div>
                                <div className="fx-eyebrow">Para cubrir lo que le falta</div>
                                <h2 className="fx-display fx-h2">
                                    {plan.bastaConLoListo ? 'Con lo listo, basta'
                                        : plan.alcanza ? <>Lo listo y <span className="fx-mark">{plan.nACerrar} por cerrar</span></>
                                            : 'Con lo cerrado no llega'}
                                </h2>
                                <p>
                                    {plan.bastaConLoListo
                                        ? <>Lo listo (DOC. COMPLETA) suma <b>{gwh(plan.kwhListos / 1e6)}</b> y le faltan <b>{gwh(ob.faltaGwh)}</b>: basta con lotearlo.</>
                                        : plan.alcanza
                                            ? <>Lo listo (DOC. COMPLETA) suma <b>{gwh(plan.kwhListos / 1e6)}</b> de los <b>{gwh(ob.faltaGwh)}</b> que le faltan. Terminando los <b>{plan.nACerrar}</b> de más MWh que ya tienen la obra hecha (resaltados) se llega a <b>{gwh(plan.kwhAlcanzado / 1e6)}</b>.</>
                                            : <>Ni loteando lo listo ni terminando todo lo que tiene la obra hecha se llega: <b>{gwh(plan.kwhAlcanzado / 1e6)}</b> de <b>{gwh(ob.faltaGwh)}</b>.</>}
                                    {' '}De lo que aún se está cerrando, lo que tiene incidencias graves abiertas no cuenta.
                                </p>
                            </div>
                        </div>
                        <div className="so-plan">
                            <div className="fx-card fx-pad fx-in" style={{ '--i': 9 }}>
                                <div className="so-etapa-k"><span className="fx-dot" style={{ '--c': COLOR_OFERTA.LISTO }} /><span className="fx-kpi-k">Listos para lotear</span></div>
                                <div className="fx-importe so-etapa-v">{num(plan.kwhListos / 1e6)}<small>GWh</small></div>
                                <div className="so-etapa-n">{plan.listos.length} expedientes en DOC. COMPLETA · se lotean ya</div>
                                {plan.listos.length > 0
                                    ? <div className="so-exps">{plan.listos.map(x => tileExp(x))}</div>
                                    : <p className="so-vacio">Ninguno ahora mismo.</p>}
                            </div>
                            <div className="fx-card fx-pad fx-in" style={{ '--i': 10 }}>
                                <div className="so-etapa-k"><span className="fx-dot" style={{ '--c': COLOR_OFERTA.CERRANDO }} /><span className="fx-kpi-k">Obra hecha: por terminar</span></div>
                                <div className="fx-importe so-etapa-v">{num((plan.kwhAlcanzado - plan.kwhListos) / 1e6)}<small>GWh</small></div>
                                <div className="so-etapa-n">
                                    {plan.nACerrar > 0 ? `${plan.nACerrar} para llegar` : 'No hace falta ninguno'} · {plan.cerrando.length} sin graves en total
                                </div>
                                {plan.cerrando.length > 0
                                    ? <div className="so-exps">{plan.cerrando.map(x => tileExp(x, plan.aCerrar.has(x.numero)))}</div>
                                    : <p className="so-vacio">Ninguno ahora mismo.</p>}
                            </div>
                        </div>
                        {plan.listosConGraves.length > 0 && (
                            <AvisoFx tono="ambar" className="so-of-pie">
                                <b>{plan.listosConGraves.map(x => x.numero).join(' · ')}</b>: en DOC. COMPLETA pero con incidencias graves aún abiertas. Cuentan como listos; si ya están resueltas, ciérralas en el expediente.
                            </AvisoFx>
                        )}
                        {plan.conGraves.length > 0 && (
                            <AvisoFx tono="ambar" className="so-of-pie">
                                <b>{plan.conGraves.length} por terminar con incidencias graves no cuentan</b> ({gwh(plan.conGraves.reduce((s, x) => s + (x.kwh || 0), 0) / 1e6)}):{' '}
                                {plan.conGraves.map(x => x.numero).join(' · ')}. Subsanadas, entrarían.
                            </AvisoFx>
                        )}
                    </section>
                )}

                {/* Lo que le podemos ofrecer */}
                <section className="so-seccion">
                    <div className="so-seccion-cab">
                        <div>
                            <div className="fx-eyebrow fx-eyebrow-verde">Lo que tengo para ofrecerle</div>
                            <h2 className="fx-display fx-h2">{vista?.oferta ? `${gwh(vista.oferta.totalGwh)} sin lotear` : 'Sin lotear'}</h2>
                            <p>Expedientes sin lote ni rechazo, de más cerca a más lejos del CAE{ob?.faltaGwh > 0 ? ', acumulados frente a lo que le falta' : ''}.</p>
                        </div>
                    </div>
                    <div className="fx-card fx-pad fx-in" style={{ '--i': 9 }}>
                        {dispError ? (
                            <ErrorApi error={dispError} que="lo disponible" onReintentar={() => setRecarga(r => r + 1)} />
                        ) : !vista?.oferta ? (
                            <div style={{ display: 'grid', gap: 10 }}>{[0, 1, 2, 3].map(i => <div key={i} className="fx-sk fx-sk-fila" />)}</div>
                        ) : (
                            <>
                                <ul className="so-of" style={{ marginTop: 0, borderTop: 0 }}>
                                    {vista.oferta.filas.map(f => (
                                        <li key={f.id}>
                                            <button type="button" className="so-of-btn" aria-expanded={abierto === f.id}
                                                onClick={() => setAbierto(a => a === f.id ? null : f.id)}>
                                                <Ico d="M9 6l6 6-6 6" size={18} sw={2.4} />
                                                <span className="so-of-tit"><span className="fx-dot" style={{ '--c': COLOR_OFERTA[f.id] }} />{f.titulo}</span>
                                                <span className="so-of-det">{f.n} expedientes · {f.sub}</span>
                                                <span className="so-of-v fx-num">{num(f.gwh)}<small>GWh</small></span>
                                                {ob && ob.faltaGwh > 0 && (
                                                    <span className="so-of-pista">
                                                        <span className="fx-pista" style={{ display: 'block' }}>
                                                            <i style={{ width: `${f.pctDeLoQueFalta}%`, background: COLOR_OFERTA[f.id] }} />
                                                        </span>
                                                        <small>acumulado <b>{gwh(f.acumGwh)}</b> · <b>{pct(f.pctDeLoQueFalta)}</b> de lo que le falta</small>
                                                    </span>
                                                )}
                                            </button>
                                            {abierto === f.id && (
                                                <div className="so-exps">
                                                    {f.expedientes.map(x => (
                                                        <div key={x.numero} className="so-exp" title={`${x.estado} · ${x.origen || 'sin cifra'}`}>
                                                            <b>{x.numero}</b>
                                                            <small>{mwh(x.kwh)} · {x.ficha}</small>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                                <AvisoFx tono="crema" icono="info" className="so-of-pie">
                                    Es el mismo volumen para cualquier Sujeto Obligado: si se lo ofreces a dos, se cuenta dos veces.
                                </AvisoFx>
                            </>
                        )}
                    </div>
                </section>
            </>
        );
    }

    return (
        <div className="fx">
            <style>{CSS_FX + CSS_SO}</style>
            <div className="fx-filete-top" />
            <div className="fx-halo" aria-hidden="true" />
            <div className="fx-col">
                {cabecera}
                {cuerpo}
            </div>
            {editando && so && (
                <EditarObligacionModal so={so} anio={anio} actual={config?.anios?.[anio]}
                    onClose={() => setEditando(false)} onSave={guardarAnio} />
            )}
            {verEnlace && so && <EnlaceSoModal so={so} onClose={() => setVerEnlace(false)} avisar={avisar} />}
            {subiendoRegistro && so && (
                <SubirRegistroModal so={so} onClose={() => setSubiendoRegistro(false)}
                    onGuardado={(data) => {
                        setReg({ id: so.id_empresa, data: data.registro });
                        setSubiendoRegistro(false);
                        avisar('Certificado del MITECO guardado');
                    }} />
            )}
            {toast}
        </div>
    );
}

export default SujetoObligadoPanel;
