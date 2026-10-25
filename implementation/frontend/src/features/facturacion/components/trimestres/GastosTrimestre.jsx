import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../../../context/AuthContext';
import { getRoleFlags } from '../../../../utils/roleFlags';
import SendActionOverlay from '../../../../components/SendActionOverlay';
import { Ico, eur, entero, fechaEs, MESES_FX, ErrorApi, AvisoFx, DialogoFx, errorDeApi, useToastFx } from '../../estilo';
import { CobroDialog } from '../FacturaModal';

// ─────────────────────────────────────────────────────────────────────────────
// Los justificantes de gasto del trimestre (`GET /gastos?t=`), por línea (CAE, ING, FML) y
// mes, con su estado: SIN_LEER · LEIDO (por revisar) · REVISADO · CAMBIADO (el PDF cambió
// después de leerlo) · APP (las FML: sus cifras salen de la app, no se leen) · ERROR.
//
// - «Leer N gastos con IA» (`POST /gastos/leer`) GASTA Gemini: se pide confirmación diciendo
//   cuántos, y se repite por tandas mientras `quedan > 0` (SendActionOverlay, con «Parar»).
//   Nunca se lee al abrir la pantalla.
// - Corregir (`PUT /gastos/:fileId`) manda solo lo que se ha cambiado; vacío = «lo que diga
//   el código». Lo leído viaja con el fichero (appProperties de Drive), no hay tabla.
// - Una factura en otra moneda se pasa a euros al cambio del BCE de su fecha (lo hace el
//   servidor, art. 79.Once LIVA); solo si no hay cambio pide en la fila lo cargado en la tarjeta.
// - La cuota de autónomos y la del colegio (BANCO · ESTIMADA) las pone el servidor desde los
//   extractos de «EXTRACTOS Y RECIBOS / 02. AUTÓNOMO»: no tienen fichero, ni se corrigen ni se
//   revisan; el botón abre el extracto o el recibo del que salen.
// - Las ventas CAE que solo están en Drive (autofacturas de Iberdrola/Naturgy, `ventas_cae`)
//   se leen con el mismo botón y se corrigen por la misma ruta (responde `{ venta }`). Su
//   COBRO se marca aquí («Cobrada», el CobroDialog de las ING) por
//   `POST /ventas-drive/:fileId/cobro`, que lo anota en el propio fichero.
// - El enlace al PDF de Drive, solo para ADMIN.
// - Totales: los de la API (`totales.sl` / `totales.autonomo`); aquí no se suma nada.
// ─────────────────────────────────────────────────────────────────────────────

const ORDEN_LINEA = ['CAE', 'ING', 'FML'];
const NOMBRE_LINEA = { CAE: 'CAE · servicios CAE (sociedad)', ING: 'ING · ingeniería (sociedad)', FML: 'FML · el autónomo' };
const ESTADO = {
    SIN_LEER: { texto: 'Sin leer', chip: 'gris' },
    LEIDO: { texto: 'Por revisar', chip: 'ambar' },
    REVISADO: { texto: 'Revisado', chip: 'ok' },
    CAMBIADO: { texto: 'Cambió el PDF', chip: 'ambar' },
    APP: { texto: 'De la app', chip: 'pizarra' },
    BANCO: { texto: 'Del banco', chip: 'pizarra' },
    ESTIMADA: { texto: 'Estimada', chip: 'ambar' },
    ERROR: { texto: 'Error al leer', chip: 'vence' },
};
const FILTROS = [
    { id: 'todos', label: 'Todos', ok: () => true },
    { id: 'sin-leer', label: 'Sin leer', ok: g => ['SIN_LEER', 'CAMBIADO', 'ERROR'].includes(g.estado) },
    { id: 'revisar', label: 'Por revisar', ok: g => g.estado === 'LEIDO' || g.estado === 'ESTIMADA' },
    { id: 'revisados', label: 'Revisados', ok: g => ['REVISADO', 'APP', 'BANCO'].includes(g.estado) },
];
/** «AAAA-MM» del mes en que se agrupa: el de la carpeta de Drive. Las FML de la app no traen
 *  `anio_carpeta`/`mes_carpeta`, pero sí `carpeta` («… / 2026 / 7. JULIO») o su fecha. */
const mesDe = (g) => {
    if (g.anio_carpeta && g.mes_carpeta) return `${g.anio_carpeta}-${String(g.mes_carpeta).padStart(2, '0')}`;
    const c = String(g.carpeta || '').match(/(\d{4})\s*\/\s*(\d{1,2})\./);
    if (c) return `${c[1]}-${c[2].padStart(2, '0')}`;
    const f = String(g.datos?.fecha || g.fecha || '');
    const iso = f.match(/^(\d{4})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}`;
    const es = f.match(/^\d{1,2}\/(\d{1,2})\/(\d{4})/);
    return es ? `${es[2]}-${es[1].padStart(2, '0')}` : '9999-99';
};
const nombreMes = (m) => (m === '9999-99' ? 'Sin mes' : `${MESES_FX[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`);
const CAMPOS = [
    { k: 'fecha', label: 'Fecha', ph: 'dd/mm/aaaa' },
    { k: 'proveedor', label: 'Proveedor' },
    { k: 'nif', label: 'NIF del proveedor' },
    { k: 'numero', label: 'Nº de factura' },
    { k: 'base', label: 'Base', num: true },
    { k: 'iva_pct', label: '% de IVA', num: true },
    { k: 'cuota', label: 'Cuota de IVA', num: true },
    { k: 'irpf', label: 'Retención', num: true },
    { k: 'suplidos', label: 'Suplidos', num: true },
    { k: 'total', label: 'Total', num: true },
    { k: 'moneda', label: 'Moneda', ph: 'EUR' },
];
const AJUSTES = [
    { k: 'deducible_pct', label: '% de IVA deducible', num: true },
    { k: 'irpf_deducible_pct', label: '% deducible en el IRPF', num: true },
];
/** Una venta CAE de Drive: lo que dice la factura (el cliente es quien COMPRA, aunque la expida él). */
const CAMPOS_VENTA = [
    { k: 'fecha', label: 'Fecha', ph: 'dd/mm/aaaa' },
    { k: 'cliente', label: 'Cliente (quien compra)' },
    { k: 'nif', label: 'NIF del cliente' },
    { k: 'numero', label: 'Nº de factura' },
    { k: 'base', label: 'Base', num: true },
    { k: 'iva_pct', label: '% de IVA', num: true },
    { k: 'cuota', label: 'Cuota de IVA', num: true },
    { k: 'total', label: 'Total', num: true },
];
const DOC_VENTA = { FACTURA: 'Factura', RECTIFICATIVA: 'Rectificativa', JUSTIFICANTE_PAGO: 'Justificante de pago (no cuenta)', OTRO: 'Otro documento (no cuenta)' };

const txtNum = (v) => (v == null || v === '' ? '' : String(v).replace('.', ','));
const valorInicial = (g, venta = false) => {
    const d = g.datos || {}, a = g.ajustes || {};
    const x = {};
    (venta ? CAMPOS_VENTA : CAMPOS).forEach(c => { x[c.k] = c.k === 'fecha' ? (d.fecha ? fechaEs(d.fecha) : '') : c.num ? txtNum(d[c.k]) : (d[c.k] ?? ''); });
    if (venta) { x.documento = d.documento || ''; return x; }
    x.total_eur = txtNum(d.total_eur);
    x.tipo = a.tipo || '';
    x.actividad = a.actividad || '';
    AJUSTES.forEach(c => { x[c.k] = txtNum(a[c.k]); });
    return x;
};
/** Sin leer, lo único que hay es el nombre del fichero: «AAAA-MM-DD - PROVEEDOR - Nº - concepto.pdf». */
function delNombre(nombre) {
    const base = String(nombre || '').replace(/\.[a-z0-9]{2,4}$/i, '');
    const m = /^(\d{4}-\d{2}-\d{2})\s*-\s*([^-]+?)(?:\s*-\s*(.+))?$/.exec(base);
    if (!m) return { titulo: nombre, detalle: null };
    return { titulo: m[2].trim(), detalle: [fechaEs(m[1]), m[3]?.trim()].filter(Boolean).join(' · ') };
}
const necesitaEuros = (g) => g.fiscal?.moneda && g.fiscal.moneda !== 'EUR' && !g.fiscal.cambio && g.datos?.total_eur == null && g.estado !== 'SIN_LEER';
/** «20 USD · cambio BCE 03/07: 1,1448» */
const textoCambio = (f, d) => (f.cambio
    ? `${String(d.total ?? '').replace('.', ',')} ${f.moneda} · cambio BCE ${fechaEs(f.cambio.fecha)}: ${String(f.cambio.valor).replace('.', ',')}${f.dif_cambio ? ` · comisión ${eur(f.dif_cambio)}` : ''}`
    : null);

/** El editor de una fila: lo leído y los ajustes que mandan sobre el criterio del código.
 *  Con `venta`, los campos de una factura de venta y sin «cómo cuenta» (cuenta como venta CAE). */
function Editor({ g, venta = false, tipos, actividades, onGuardar, onCancelar, ocupado }) {
    const [v, setV] = useState(() => valorInicial(g, venta));
    const ini = useRef(valorInicial(g, venta));
    const cambia = (k) => (e) => setV(x => ({ ...x, [k]: e.target.value }));
    const cambios = () => Object.fromEntries(Object.entries(v).filter(([k, x]) => x !== ini.current[k]));
    const otraMoneda = (v.moneda || 'EUR').toUpperCase() !== 'EUR';
    const campo = (c) => (
        <label key={c.k} className="fx-campo">
            <span>{c.label}</span>
            <input className={`fx-input${c.num ? ' fx-num' : ''}`} value={v[c.k]} onChange={cambia(c.k)} placeholder={c.ph || ''}
                inputMode={c.num ? 'decimal' : undefined} autoComplete="off" disabled={ocupado} />
        </label>
    );
    return (
        <div className="fx-seccion">
            <div className="fx-sec-tit">Lo que dice el documento</div>
            <div className="fx-rejilla">
                {venta && (
                    <label className="fx-campo">
                        <span>Documento</span>
                        <select className="fx-select" value={v.documento} onChange={cambia('documento')} disabled={ocupado}>
                            <option value="">—</option>
                            {Object.entries(DOC_VENTA).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
                        </select>
                    </label>
                )}
                {(venta ? CAMPOS_VENTA : CAMPOS).map(campo)}
                {otraMoneda && campo({ k: 'total_eur', label: 'Cargado en la tarjeta (€)', num: true })}
            </div>
            {!venta && <>
            <div className="fx-sec-tit" style={{ marginTop: 18 }}>Cómo cuenta (vacío = lo que diga el código)</div>
            <div className="fx-rejilla">
                <label className="fx-campo">
                    <span>Tipo</span>
                    <select className="fx-select" value={v.tipo} onChange={cambia('tipo')} disabled={ocupado}>
                        <option value="">Lo del código: {g.fiscal?.tipo_texto || '—'}</option>
                        {Object.entries(tipos || {}).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
                    </select>
                </label>
                <label className="fx-campo">
                    <span>Actividad</span>
                    <select className="fx-select" value={v.actividad} onChange={cambia('actividad')} disabled={ocupado}>
                        <option value="">Lo del código: {g.actividad || '—'}</option>
                        {(actividades || []).map(a => <option key={a} value={a}>{a === 'COMUN' ? 'Común (las dos)' : a}</option>)}
                    </select>
                </label>
                {AJUSTES.map(campo)}
            </div>
            </>}
            <div className="fx-gs-ed-pie">
                <button type="button" className="fx-btn fx-btn-sec fx-btn-peq" onClick={onCancelar} disabled={ocupado}>Cancelar</button>
                <button type="button" className="fx-btn fx-btn-sec fx-btn-peq" onClick={() => onGuardar(cambios(), false)} disabled={ocupado}>Guardar</button>
                <button type="button" className="fx-btn fx-btn-tinta fx-btn-peq" onClick={() => onGuardar(cambios(), true)} disabled={ocupado}>
                    <Ico n="check" size={16} />Guardar y dar por revisado
                </button>
            </div>
        </div>
    );
}

/** Una fila: proveedor, cómo cuenta, total, estado y sus acciones. */
function Gasto({ g, esAdmin, abierto, onAbrir, ocupado, onPut, tipos, actividades }) {
    const [eurTxt, setEurTxt] = useState('');
    const f = g.fiscal || {};
    const d = g.datos || {};
    const e = ESTADO[g.estado] || { texto: g.estado, chip: 'gris' };
    const leido = g.estado !== 'SIN_LEER';
    // La cuota de autónomos o del colegio: sin fichero propio, sale del extracto del banco.
    const cuota = !g.fileId && (g.estado === 'BANCO' || g.estado === 'ESTIMADA');
    const avisos = [
        ...(g.error_lectura ? [`No se pudo leer: ${g.error_lectura}`] : []),
        ...(f.avisos || []),
        ...(g.fecha_fuera ? ['Fecha de otro trimestre: cuenta en el más tardío entre el de su carpeta y el de su fecha'] : []),
        ...(g.estado === 'ESTIMADA' ? ['Estimada: falta el extracto del banco de ese mes en «EXTRACTOS Y RECIBOS / 02. AUTÓNOMO»'] : []),
    ];
    const euros = necesitaEuros(g);
    const nom = delNombre(g.nombre);
    return (
        <li className="fx-gs">
            <div className="fx-gs-prov">
                <b title={g.nombre}>{d.proveedor || nom.titulo}</b>
                <small title={g.nombre}>{cuota ? [fechaEs(d.fecha), d.concepto].filter(Boolean).join(' · ')
                    : d.proveedor ? [d.numero, fechaEs(d.fecha)].filter(Boolean).join(' · ') || g.nombre : nom.detalle || g.carpeta}</small>
            </div>
            <div className="fx-gs-meta">
                {cuota ? <>{f.tipo_texto}<br />Sin IVA · gasto del IRPF al {f.irpf_deducible_pct ?? 100} %</>
                    : leido ? <>{f.tipo_texto}{g.actividad ? ` · ${g.actividad === 'COMUN' ? 'común' : g.actividad}` : ''}<br />IVA deducible {eur(f.iva_deducible || 0)}{f.deducible_pct != null && f.deducible_pct !== 100 ? ` (${f.deducible_pct} %)` : ''}{f.isp_cuota ? ` · ISP ${eur(f.isp_cuota)}` : ''}</> : 'Aún sin leer: no cuenta'}
            </div>
            <div className="fx-gs-total">
                {f.total != null ? eur(f.total) : '—'}
                <small>{f.total != null ? `base ${eur(f.base || 0)}` : leido ? 'sin importe' : 'sin leer'}</small>
                {f.cambio && <small title="Art. 79.Once de la Ley del IVA: el cambio vigente el día de la factura">{textoCambio(f, d)}</small>}
            </div>
            <div className="fx-gs-est"><span className={`fx-chip fx-chip-${e.chip}`}>{e.texto}</span></div>
            {(avisos.length > 0 || euros) && (
                <ul className="fx-gs-av">
                    {avisos.map((a, i) => <li key={i}><Ico n="alerta" size={14} />{a}</li>)}
                </ul>
            )}
            <div className="fx-gs-acc">
                {euros && (
                    <form className="fx-gs-euros" onSubmit={ev => { ev.preventDefault(); if (eurTxt.trim()) onPut({ total_eur: eurTxt.trim() }); }}
                        style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <input className="fx-input fx-num" style={{ width: 132, minHeight: 40 }} inputMode="decimal" placeholder={`€ de ${f.moneda}`}
                            aria-label={`Lo cargado en la tarjeta, en euros (la factura viene en ${f.moneda})`} value={eurTxt} onChange={ev => setEurTxt(ev.target.value)} disabled={ocupado} />
                        <button type="submit" className="fx-btn fx-btn-tinta fx-btn-peq" disabled={ocupado || !eurTxt.trim()}>Guardar €</button>
                    </form>
                )}
                {esAdmin && g.link && (
                    <a className="fx-btn fx-btn-sec fx-btn-peq" href={g.link} target="_blank" rel="noopener noreferrer"
                        title={cuota ? `Abrir en Drive el ${g.justificante?.tipo === 'RECIBO' ? 'recibo' : 'extracto'} del que sale` : 'Abrir el PDF en Drive'}>
                        <Ico n="enlace" size={16} />{cuota ? (g.justificante?.tipo === 'RECIBO' ? 'Recibo' : 'Extracto') : 'PDF'}
                    </a>
                )}
                {g.estado !== 'APP' && !cuota && leido && (
                    <button type="button" className="fx-btn fx-btn-sec fx-btn-peq" aria-expanded={abierto} onClick={onAbrir} disabled={ocupado}>
                        <Ico n="lapiz" size={16} />{abierto ? 'Cerrar' : 'Corregir'}
                    </button>
                )}
                {(g.estado === 'LEIDO' || g.estado === 'CAMBIADO') && (
                    <button type="button" className="fx-btn fx-btn-tinta fx-btn-peq" onClick={() => onPut({ revisado: true })} disabled={ocupado}>
                        <Ico n="check" size={16} />{ocupado ? 'Guardando…' : 'Revisado'}
                    </button>
                )}
                {g.estado === 'REVISADO' && (
                    <button type="button" className="fx-link" onClick={() => onPut({ revisado: false })} disabled={ocupado}>Quitar revisado</button>
                )}
            </div>
            {abierto && (
                <div className="fx-gs-ed">
                    <Editor g={g} tipos={tipos} actividades={actividades} ocupado={ocupado}
                        onCancelar={onAbrir} onGuardar={(cambios, revisado) => onPut({ ...cambios, ...(revisado ? { revisado: true } : {}) }, true)} />
                </div>
            )}
        </li>
    );
}

/**
 * Una venta CAE que solo está en Drive (autofactura de Iberdrola/Naturgy…): leída, es venta de
 * la SL. Su cobro se marca aquí («Cobrada», con su fecha) y va al propio fichero de Drive.
 */
function VentaCae({ f, desde, hasta, esAdmin, abierto, onAbrir, ocupado, onPut, onCobrada, onQuitarCobro }) {
    const d = f.datos || {};
    const v = f.venta;
    const e = ESTADO[f.estado] || { texto: f.estado, chip: 'gris' };
    const leida = f.estado !== 'SIN_LEER';
    const noEsVenta = d.documento && !['FACTURA', 'RECTIFICATIVA'].includes(d.documento);
    const avisos = [
        ...(f.error_lectura ? [`No se pudo leer: ${f.error_lectura}`] : []),
        ...(leida && !v && ['LEIDO', 'REVISADO'].includes(f.estado)
            ? [noEsVenta ? `Leído como «${DOC_VENTA[d.documento] || d.documento}»: no es una venta y no cuenta` : 'Le falta la fecha o la base: no cuenta hasta corregirlo'] : []),
        ...(v && !v.cliente ? ['Sin cliente: corrígelo para el libro'] : []),
        ...(v && (v.fecha < desde || v.fecha > hasta) ? [`Fecha ${fechaEs(v.fecha)}: cuenta en el trimestre de su fecha, no en este`] : []),
    ];
    return (
        <li className="fx-gs">
            <div className="fx-gs-prov">
                <b title={f.nombre}>{d.cliente || delNombre(f.nombre).titulo}</b>
                <small title={f.nombre}>{leida ? [d.numero, fechaEs(d.fecha), d.autofactura ? 'autofactura' : null].filter(Boolean).join(' · ') || f.nombre : f.carpeta}</small>
            </div>
            <div className="fx-gs-meta">
                {v ? <>Venta CAE de la sociedad{v.autofactura ? ' (la expide el cliente)' : ''}<br />IVA repercutido {eur(v.cuota)} · {v.cobro?.estado === 'COBRADA' ? `cobrada el ${fechaEs(v.cobro.fecha)}` : 'cobro sin marcar'}</>
                    : leida ? 'No cuenta' : 'Aún sin leer: no cuenta'}
            </div>
            <div className="fx-gs-total">
                {v ? eur(v.total) : d.total != null ? eur(d.total) : '—'}
                <small>{v ? `base ${eur(v.base)}` : leida ? 'no cuenta' : 'sin leer'}</small>
            </div>
            <div className="fx-gs-est"><span className={`fx-chip fx-chip-${e.chip}`}>{e.texto}</span></div>
            {avisos.length > 0 && (
                <ul className="fx-gs-av">
                    {avisos.map((a, i) => <li key={i}><Ico n="alerta" size={14} />{a}</li>)}
                </ul>
            )}
            <div className="fx-gs-acc">
                {esAdmin && f.link && (
                    <a className="fx-btn fx-btn-sec fx-btn-peq" href={f.link} target="_blank" rel="noopener noreferrer" title="Abrir el PDF en Drive">
                        <Ico n="enlace" size={16} />PDF
                    </a>
                )}
                {leida && (
                    <button type="button" className="fx-btn fx-btn-sec fx-btn-peq" aria-expanded={abierto} onClick={onAbrir} disabled={ocupado}>
                        <Ico n="lapiz" size={16} />{abierto ? 'Cerrar' : 'Corregir'}
                    </button>
                )}
                {(f.estado === 'LEIDO' || f.estado === 'CAMBIADO') && (
                    <button type="button" className="fx-btn fx-btn-tinta fx-btn-peq" onClick={() => onPut({ revisado: true })} disabled={ocupado}>
                        <Ico n="check" size={16} />{ocupado ? 'Guardando…' : 'Revisado'}
                    </button>
                )}
                {f.estado === 'REVISADO' && (
                    <button type="button" className="fx-link" onClick={() => onPut({ revisado: false })} disabled={ocupado}>Quitar revisado</button>
                )}
                {esAdmin && v && v.cobro?.estado !== 'COBRADA' && (
                    <button type="button" className="fx-btn fx-btn-sec fx-btn-peq" onClick={onCobrada} disabled={ocupado}>
                        <Ico n="euro" size={16} />Cobrada
                    </button>
                )}
                {esAdmin && v?.cobro?.estado === 'COBRADA' && (
                    <button type="button" className="fx-link" onClick={onQuitarCobro} disabled={ocupado}>Quitar el cobro</button>
                )}
            </div>
            {abierto && (
                <div className="fx-gs-ed">
                    <Editor g={f} venta ocupado={ocupado}
                        onCancelar={onAbrir} onGuardar={(cambios, revisado) => onPut({ ...cambios, ...(revisado ? { revisado: true } : {}) }, true)} />
                </div>
            )}
        </li>
    );
}

export function GastosTrimestre({ t, etiqueta, onCambio }) {
    const { user } = useAuth();
    const { isAdmin } = getRoleFlags(user);
    const [st, setSt] = useState({ datos: null, error: null, cargando: true });
    const [filtro, setFiltro] = useState('todos');
    const [abierto, setAbierto] = useState(null);
    const [ocupado, setOcupado] = useState(null);
    const [confirmar, setConfirmar] = useState(false);
    const [ov, setOv] = useState({ phase: null });
    const [cobroVenta, setCobroVenta] = useState(null);     // la venta CAE de Drive del CobroDialog
    const parar = useRef(false);
    const [toast, avisar] = useToastFx();

    // La fila de una venta CAE de Drive vuelve como `{ venta }` (de PUT /gastos y de la ruta del cobro).
    const ponerVenta = (fileId, venta) => setSt(s => ({ ...s, datos: { ...s.datos, ventas_cae: (s.datos?.ventas_cae || []).map(x => (x.fileId === fileId ? { ...x, ...venta } : x)) } }));
    const quitarCobro = async (f) => {
        setOcupado(f.fileId);
        try {
            const { data } = await axios.post(`/api/facturacion/ventas-drive/${encodeURIComponent(f.fileId)}/cobro`, { cobrada: false });
            if (data?.venta) ponerVenta(f.fileId, data.venta);
            onCambio?.();
            avisar('Cobro quitado: vuelve a «Te deben»');
        } catch (err) {
            avisar(`No se pudo quitar el cobro: ${errorDeApi(err).texto}`, 'aviso');
        } finally { setOcupado(null); }
    };

    const cargar = useCallback(async () => {
        setSt(s => ({ ...s, cargando: true, error: null }));
        try {
            const { data } = await axios.get('/api/facturacion/gastos', { params: { t } });
            setSt({ datos: data, error: null, cargando: false });
        } catch (err) {
            setSt(s => ({ ...s, cargando: false, error: errorDeApi(err) }));
        }
    }, [t]);
    useEffect(() => { const h = setTimeout(cargar, 0); return () => clearTimeout(h); }, [cargar]);

    const put = async (g, cambios, cerrar = false) => {
        if (!Object.keys(cambios).length) { setAbierto(null); return; }
        setOcupado(g.fileId);
        try {
            const { data } = await axios.put(`/api/facturacion/gastos/${encodeURIComponent(g.fileId)}`, cambios);
            const nuevo = data?.gasto;
            if (nuevo) setSt(s => ({ ...s, datos: { ...s.datos, filas: (s.datos?.filas || []).map(x => (x.fileId === g.fileId ? { ...x, ...nuevo } : x)) } }));
            // Una venta CAE de Drive vuelve como `{ venta }`, con su venta ya recalculada.
            if (data?.venta) ponerVenta(g.fileId, data.venta);
            if (cerrar) setAbierto(null);
            onCambio?.();
            avisar(cambios.revisado === true ? 'Dado por revisado' : cambios.revisado === false ? 'Vuelve a «por revisar»' : 'Corrección guardada en el fichero');
        } catch (err) {
            avisar(`No se pudo guardar: ${errorDeApi(err).texto}`, 'aviso');
        } finally { setOcupado(null); }
    };

    const n = st.datos?.resumen?.sin_leer || 0;
    const leer = async () => {
        setConfirmar(false);
        parar.current = false;
        setOv({ phase: 'sending', subtitle: `${etiqueta} · ${n} por leer` });
        let leidos = 0, errores = 0, ventas = 0, quedan = n, vueltas = 0, fallo = null;
        try {
            for (;;) {
                const { data } = await axios.post('/api/facturacion/gastos/leer', { t });
                const l = (data?.leidos || []).length, e = (data?.errores || []).length;
                leidos += l; errores += e; ventas += data?.ventas?.leidas || 0; quedan = data?.quedan || 0; vueltas += 1;
                setOv(o => ({ ...o, subtitle: `${leidos} leídos · quedan ${quedan}` }));
                if (!quedan || parar.current || (!l && !e) || vueltas >= 40) break;
            }
        } catch (err) { fallo = errorDeApi(err); }
        setOv({
            phase: 'done', ok: !fallo || leidos > 0, subtitle: etiqueta,
            errorText: fallo ? fallo.texto : '',
            items: [
                `${entero(leidos)} ${leidos === 1 ? 'justificante leído' : 'justificantes leídos'}: quedan por revisar`,
                ...(ventas ? [`${entero(ventas)} de ellos, ventas CAE de Drive (autofacturas): ya cuentan como ingreso de la sociedad`] : []),
                ...(errores ? [{ texto: `${entero(errores)} no se pudieron leer: salen con «Error al leer»`, tono: 'aviso' }] : []),
                ...(quedan ? [{ texto: `${entero(quedan)} sin leer todavía${parar.current ? ' (parado a mano)' : ''}`, tono: 'info' }] : []),
                ...(fallo && leidos ? [{ texto: `La última tanda falló: ${fallo.texto}`, tono: 'aviso' }] : []),
            ],
        });
        if (leidos || errores) { cargar(); onCambio?.(); }
    };

    if (st.error && !st.datos) return <ErrorApi error={st.error} que="los gastos del trimestre" onReintentar={cargar} />;
    if (!st.datos) {
        return (
            <div className="fx-card fx-pad" aria-busy="true">
                <p className="fx-espera-txt"><Ico n="reintentar" size={18} className="fx-spin" />Listando los justificantes de Drive…</p>
                {[0, 1, 2, 3, 4].map(i => <div key={i} className="fx-sk fx-sk-fila" style={{ marginTop: 12 }} />)}
            </div>
        );
    }

    const D = st.datos;
    const r = D.resumen || {};
    const filas = (D.filas || []).filter(FILTROS.find(x => x.id === filtro).ok);
    const lineas = [...new Set([...ORDEN_LINEA, ...filas.map(g => g.linea)])].filter(l => filas.some(g => g.linea === l));
    const tot = D.totales || {};

    return (
        <div className={`fx-pila${st.cargando ? ' fx-recargando' : ''}`}>
            {st.error && <ErrorApi error={st.error} que="los gastos del trimestre" onReintentar={cargar} />}
            <article className="fx-card fx-pad fx-in" style={{ '--i': 1 }}>
                <div className="fx-card-cab">
                    <div>
                        <div className="fx-eyebrow">Gastos · {etiqueta}</div>
                        <h3 className="fx-display fx-h3">{entero(r.n || 0)} justificantes{n ? <> · <span className="fx-mark">{entero(n)} por leer</span></> : null}</h3>
                    </div>
                    <button type="button" className="fx-btn fx-btn-pri" onClick={() => setConfirmar(true)} disabled={!n || !isAdmin}>
                        <Ico n="leer" size={18} />{n ? `Leer ${entero(n)} con IA` : 'Todo leído'}
                    </button>
                </div>
                <div className="fx-gs-res" style={{ marginTop: 12 }}>
                    <span className="fx-chip fx-chip-gris">{entero(r.sin_leer || 0)} sin leer{(D.vecinos_sin_leer || []).length ? ` · ${entero(D.vecinos_sin_leer.length)} del mes anterior` : ''}</span>
                    <span className={`fx-chip ${r.leidos ? 'fx-chip-ambar' : 'fx-chip-gris'}`}>{entero(r.leidos || 0)} por revisar</span>
                    <span className="fx-chip fx-chip-ok">{entero(r.revisados || 0)} revisados</span>
                    <span className="fx-chip fx-chip-pizarra">{entero(r.app || 0)} de la app</span>
                    {!!r.banco && <span className="fx-chip fx-chip-pizarra">{entero(r.banco)} del banco</span>}
                    {!!r.estimadas && <span className="fx-chip fx-chip-ambar">{entero(r.estimadas)} estimadas</span>}
                    {!!r.cambiados && <span className="fx-chip fx-chip-ambar">{entero(r.cambiados)} cambiados</span>}
                    {!!r.errores && <span className="fx-chip fx-chip-vence">{entero(r.errores)} con error</span>}
                </div>
                <div className="fx-pq-res">
                    <div className="fx-pq-dato"><span>Sociedad · base</span><b>{eur(tot.sl?.base || 0, 0)}</b><small>IVA deducible {eur(tot.sl?.iva_deducible || 0)}</small></div>
                    <div className="fx-pq-dato"><span>Autónomo · base</span><b>{eur(tot.autonomo?.base || 0, 0)}</b><small>IVA deducible {eur(tot.autonomo?.iva_deducible || 0)}</small></div>
                </div>
                {n > 0 && (
                    <p className="fx-nombre-fiscal" style={{ marginTop: 12 }}>
                        Lo sin leer no cuenta todavía. Leerlo usa Gemini (de pago, unos segundos por PDF); lo leído se guarda en el propio fichero de Drive y no se vuelve a leer.
                    </p>
                )}
            </article>

            {(D.vecinos_sin_leer || []).length > 0 && (
                <AvisoFx tono="ambar" className="fx-gs-vecinos">
                    <b>{entero(D.vecinos_sin_leer.length)} justificantes sin leer en la carpeta del mes anterior.</b> Los que tengan fecha de este trimestre contarán aquí al leerlos (se leen con los demás).
                    <details style={{ marginTop: 6 }}>
                        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Ver cuáles</summary>
                        <ul className="fx-gs-av" style={{ color: 'inherit', marginTop: 6 }}>
                            {D.vecinos_sin_leer.map(v => (
                                <li key={v.fileId}>
                                    {isAdmin && v.link ? <a href={v.link} target="_blank" rel="noopener noreferrer">{v.nombre}</a> : v.nombre}
                                </li>
                            ))}
                        </ul>
                    </details>
                </AvisoFx>
            )}
            {(D.sin_carpeta || []).map(c => <AvisoFx key={c} tono="crema">No existe la carpeta {c}.</AvisoFx>)}
            {(D.avisos_cuotas || []).length > 0 && (
                <AvisoFx tono="ambar">
                    <b>Cuota de autónomos y colegio.</b>
                    <ul className="fx-gs-av" style={{ color: 'inherit', marginTop: 6 }}>
                        {D.avisos_cuotas.map((a, i) => <li key={i}>{a.texto}</li>)}
                    </ul>
                </AvisoFx>
            )}

            <article className="fx-card fx-pad fx-in" style={{ '--i': 2 }}>
                <div className="fx-gs-herr">
                    <div className="fx-seg" role="group" aria-label="Qué gastos ver">
                        {FILTROS.map(x => <button key={x.id} type="button" aria-pressed={filtro === x.id} onClick={() => setFiltro(x.id)}>{x.label}</button>)}
                    </div>
                </div>
                {filas.length === 0 ? (
                    <div className="fx-vacio fx-vacio-peq">
                        <span className="fx-tile fx-tile-l fx-tile-crema"><Ico n="filtro" size={22} /></span>
                        <p>{filtro === 'todos' ? 'No hay justificantes en las carpetas de este trimestre.' : 'Ninguno en este estado.'}</p>
                    </div>
                ) : lineas.map(l => {
                    const deLinea = filas.filter(g => g.linea === l);
                    const meses = [...new Set(deLinea.map(mesDe))].sort();
                    return (
                        <section key={l} className="fx-gs-grupo">
                            <div className="fx-gs-grupo-cab">
                                <h3 className="fx-display fx-h3" style={{ fontSize: 22 }}><i className="fx-dot" style={{ '--c': `var(--s-${l.toLowerCase()})` }} />{NOMBRE_LINEA[l] || l}</h3>
                                <p>{entero(deLinea.length)} {deLinea.length === 1 ? 'justificante' : 'justificantes'}</p>
                            </div>
                            {meses.map(m => (
                                <div key={m}>
                                    <p className="fx-gs-mes">{nombreMes(m)}</p>
                                    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                                        {deLinea.filter(g => mesDe(g) === m).map(g => (
                                            <Gasto key={g.fileId || g.nombre} g={g} esAdmin={isAdmin} tipos={D.tipos} actividades={D.actividades}
                                                abierto={!!g.fileId && abierto === g.fileId} onAbrir={() => setAbierto(a => (a === g.fileId ? null : g.fileId))}
                                                ocupado={!!g.fileId && ocupado === g.fileId} onPut={(c, cerrar) => put(g, c, cerrar)} />
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </section>
                    );
                })}
            </article>

            {(D.ventas_cae || []).length > 0 && (
                <article className="fx-card fx-pad fx-in" style={{ '--i': 3 }}>
                    <div className="fx-gs-grupo-cab">
                        <div>
                            <div className="fx-eyebrow">Ingresos · {etiqueta}</div>
                            <h3 className="fx-display fx-h3" style={{ fontSize: 22 }}><i className="fx-dot" style={{ '--c': 'var(--s-cae)' }} />Ventas CAE de Drive <span className="fx-mark">fuera de la app</span></h3>
                        </div>
                        <p>{entero(D.ventas_cae.length)} {D.ventas_cae.length === 1 ? 'factura' : 'facturas'}{r.ventas_sin_leer ? ` · ${entero(r.ventas_sin_leer)} sin leer` : ''}</p>
                    </div>
                    <p className="fx-nombre-fiscal" style={{ margin: '4px 0 8px' }}>
                        Las autofacturas (Iberdrola, Naturgy…) las expide el cliente en nombre de BROKERGY (art. 5 del RD 1619/2012): son ventas de la sociedad. Leídas, cuentan en el 303 y en el cuadro de mando; hasta marcarlas «Cobrada» salen en «Te deben».
                    </p>
                    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                        {D.ventas_cae.map(f => (
                            <VentaCae key={f.fileId} f={f} desde={D.desde} hasta={D.hasta} esAdmin={isAdmin}
                                abierto={abierto === f.fileId} onAbrir={() => setAbierto(a => (a === f.fileId ? null : f.fileId))}
                                ocupado={ocupado === f.fileId} onPut={(c, cerrar) => put(f, c, cerrar)}
                                onCobrada={() => setCobroVenta(f)} onQuitarCobro={() => quitarCobro(f)} />
                        ))}
                    </ul>
                </article>
            )}

            {confirmar && (
                <DialogoFx antetitulo={`Gastos · ${etiqueta}`} titulo={`¿Leer ${entero(n)} justificantes con IA?`} onClose={() => setConfirmar(false)}
                    pie={<>
                        <button type="button" className="fx-btn fx-btn-sec" onClick={() => setConfirmar(false)}>Cancelar</button>
                        <button type="button" className="fx-btn fx-btn-pri" onClick={leer} data-autofoco><Ico n="leer" size={18} />Leer los {entero(n)}</button>
                    </>}>
                    <p className="fx-sub" style={{ marginTop: 0 }}>
                        Gemini leerá <b>{entero(n)}</b> PDF (de pago: unos segundos y ~900 tokens cada uno){r.ventas_sin_leer ? <>, de ellos <b>{entero(r.ventas_sin_leer)}</b> {r.ventas_sin_leer === 1 ? 'factura' : 'facturas'} de venta CAE de Drive</> : null}. Va por tandas y se puede parar.
                    </p>
                    <AvisoFx tono="crema" icono="info">
                        No mueve ni cambia los ficheros: lo leído se anota en el propio fichero de Drive. El modelo solo copia las cifras; qué se deduce lo decide la app.
                    </AvisoFx>
                </DialogoFx>
            )}
            {cobroVenta && (
                <CobroDialog
                    factura={{ id: cobroVenta.fileId, numero: cobroVenta.venta?.numero || cobroVenta.nombre, total: cobroVenta.venta?.total, cliente_nombre: cobroVenta.venta?.cliente || '', estado: 'EMITIDA' }}
                    url={`/api/facturacion/ventas-drive/${encodeURIComponent(cobroVenta.fileId)}/cobro`}
                    ayuda="Es una venta CAE que solo está en Drive: el cobro se anota en el propio fichero (no hay factura en la app)."
                    onClose={() => setCobroVenta(null)}
                    onHecho={(data) => {
                        if (data?.venta) ponerVenta(cobroVenta.fileId, data.venta);
                        avisar(`${cobroVenta.venta?.numero || cobroVenta.nombre} marcada como cobrada`);
                        setCobroVenta(null); onCambio?.();
                    }} />
            )}
            <SendActionOverlay phase={ov.phase} ok={ov.ok} subtitle={ov.subtitle} items={ov.items || []} errorText={ov.errorText}
                icon="read" sendingTitle="Leyendo los gastos…" okTitle="Gastos leídos" errorTitle="No se pudieron leer"
                cancelar={ov.phase === 'sending' ? { etiqueta: 'Parar', pedida: !!ov.parando, onClick: () => { parar.current = true; setOv(o => ({ ...o, parando: true })); }, aviso: 'Se para al acabar la tanda en curso' } : null}
                onClose={() => setOv({ phase: null })} />
            {toast}
        </div>
    );
}

export default GastosTrimestre;
