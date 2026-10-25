/* eslint-disable react-refresh/only-export-components -- además del editor exporta las piezas que usa el listado (chip de estado, diálogos de cobro y rectificación, a dónde se va para cobrar): el fast refresh recarga la página entera al tocarlo, y da igual */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import axios from 'axios';
import { useModal } from '../../../context/ModalContext';
import { VistaPreviaA4 } from '../../cee-directo/components/VistaPreviaA4';
import { ClientePicker } from '../../cee-directo/components/ClientePicker';
import { CampoDecimal } from '../../../components/CampoDecimal';
import { SendActionOverlay } from '../../../components/SendActionOverlay';
import {
    BuscadorArticulos, FilaLinea, Dialogo, PanelFx, MenuAcciones, MasOpciones, CanalesEnvio,
    canalesIniciales, recordarCanales, useAvisoFx, abrirPdf, ICO_EXTRA, sinCifras,
} from './PresupuestoModal';
import { EmisoresModal } from './EmisoresModal';
import { lineasDeArticulo, totalesLineas, MAX_LINEAS } from '../logic/presupuesto';
import {
    SERIES, calcularFactura, revisarParaEmitir, estadoVisible, payloadPdf, buildFacturaHtml, validarNif,
    sanearCliente, hoyIso, isoAEs, sumarDias, yyDe, VENCIMIENTO_DIAS, MAX_OBS_FACTURA, lineasRectificativa, nombrePdfFactura,
} from '../logic/factura';
import { Ico, Importe, eur, AvisoFx } from '../estilo';

export { Dialogo } from './PresupuestoModal';

// ─────────────────────────────────────────────────────────────────────────────
// El EDITOR de facturas (estilo «carta de pago»): nueva, borrador, emitir,
// enviar, cobrar, duplicar y rectificar, en un panel lateral.
//
// Pensado para tardar segundos, como el de presupuestos (del que reutiliza el
// buscador de artículos y la partida compacta): la serie se elige UNA vez (es un
// chip de la cabecera), el cliente con el foco puesto, «Añadir partida» y Enter, y
// el total —con la retención si es FML— se ve mientras se escribe. Lo de menos uso
// (fechas, vencimiento, IRPF, expediente, observaciones) va plegado en «Más
// opciones» con su resumen. Las cifras, los avisos para emitir y la vista previa
// del PDF salen de `logic/factura.js`: los mismos que usa el servidor al emitir.
//
// REGLA — borrador → emitir → enviar son TRES gestos. Guardar deja un BORRADOR
// (sin número, no sale nada). EMITIR le pone el número (se enseña ANTES, en la
// cabecera y en la pregunta) y desde ahí no se borra ni se cambia: se RECTIFICA
// (art. 15 RD 1619/2012). ENVIAR es otro «sí», con el mensaje entero a la vista.
//
// Lo que se toque de los datos fiscales del cliente vale SOLO para esta factura:
// la ficha del cliente no se cambia. Facturas: solo ADMIN (lo corta el backend).
// ─────────────────────────────────────────────────────────────────────────────

const API = '/api/facturacion';

const FISCAL_VACIO = { razon_social: '', cif: '', direccion: '', cp: '', municipio: '', provincia: '', tlf: '', email: '' };
const fiscalDe = (c = {}) => Object.fromEntries(Object.keys(FISCAL_VACIO).map(k => [k, c?.[k] == null ? '' : String(c[k])]));
// Lo mismo que `clienteDeFicha` del backend: la ficha tal como va a la factura.
const fiscalDeFicha = (c = {}) => ({
    razon_social: `${c.nombre_razon_social || ''} ${c.es_empresa ? '' : (c.apellidos || '')}`.trim(),
    cif: c.dni || '', direccion: c.direccion || '', cp: c.codigo_postal || '', municipio: c.municipio || '',
    provincia: c.provincia || '', tlf: c.tlf || c.telefono || '', email: c.email || '',
});
// La FML es la factura de Fran a la sociedad: su cliente es BROKERGY, el emisor de la ING.
const fiscalDeEmisor = (e = {}) => ({
    razon_social: e.razon_social || '', cif: e.nif || '', direccion: e.direccion || '', cp: e.cp || '',
    municipio: e.municipio || '', provincia: e.provincia || '', tlf: e.tlf || '', email: e.email || '',
});

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const mesDe = (iso) => { const [y, m] = String(iso || '').split('-').map(Number); return y && m ? `${MESES[m - 1]} ${y}` : ''; };
const fechaOk = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const fmtPct = (n) => `${Number(n || 0).toLocaleString('es-ES', { maximumFractionDigits: 2 })} %`;
const fmtMomento = (iso) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
};
const unicos = (xs) => [...new Set(xs.filter(Boolean))];

const nuevaClave = () => Math.random().toString(36).slice(2, 10);
const lineaLibre = (descripcion, uds = 1) => ({
    key: nuevaClave(), articulo_id: null, appsheet_id: null, variante_id: null,
    descripcion, detalle: '', uds, precio: 0, dtoPct: 0, ivaPct: 21, suplido: false, genera: null, arrastrada_de: null,
});

const TIPO_TXT = { F1: 'Factura', R1: 'Rectificativa R1', R4: 'Rectificativa R4' };
const ORIGEN_TXT = { CEE_DIRECTO: 'CEE directo', GESTION_CAE: 'Gestión CAE', APPSHEET: 'AppSheet' };
const COLOR_SERIE = { ING: 'var(--s-ing)', FML: 'var(--s-fml)' };

// ── Piezas que comparte con el listado ──────────────────────────────────────

/**
 * Las facturas que emite OTRO módulo se cobran (y se rehacen) desde su
 * expediente, que tiene su candado de cobro y su remesa: el backend da 409 al
 * cobro y al PDF. Esto dice de dónde, para no dejar un botón que no funciona.
 */
export function cobroExterno(f = {}) {
    if (f.origen === 'CEE_DIRECTO') return `Se cobra desde el CEE directo${f.expediente ? ` ${f.expediente}` : ''}`;
    if (f.origen === 'GESTION_CAE') return `Se cobra desde la gestión CAE del expediente${f.expediente ? ` ${f.expediente}` : ''}`;
    return null;
}

/**
 * Lo que añade al aviso el cobro de una factura de un CEE directo: cobrarla cobra
 * su CEE, y con el certificado registrado eso lanza la entrega al cliente.
 */
export function textoCobroCee(r) {
    if (!r?.cee?.expediente) return '';
    if (!r.cee.cobrado) return ` ${r.cee.expediente} vuelve a «sin cobrar».`;
    return r.cee.entrega?.length
        ? ` ${r.cee.expediente} queda cobrado y se lanza la entrega de los certificados.`
        : ` ${r.cee.expediente} queda cobrado: los certificados se entregarán al registrarse.`;
}

/** El enlace al sitio donde se cobra una factura de otro módulo (o null). */
export function hrefOrigen(f = {}) {
    if (f.origen === 'CEE_DIRECTO' && f.cee_directo_id) return `/?cee=${encodeURIComponent(f.cee_directo_id)}`;
    if (f.origen === 'GESTION_CAE' && f.expediente) return `/?exp=${encodeURIComponent(f.expediente)}`;
    return null;
}
export const textoOrigen = (f = {}) => (f.origen === 'CEE_DIRECTO' ? 'Ir al CEE' : 'Ir al expediente');

/**
 * Ir a cobrarla allí. Dentro de la app (onNavigate) si se puede; con Ctrl/⌘ o la
 * rueda, el enlace normal en otra pestaña.
 */
export function irAlOrigen(f, onNavigate, e = null) {
    const href = hrefOrigen(f);
    if (!href) return;
    if (e && (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1)) return;      // lo hace el <a>
    e?.preventDefault?.();
    if (onNavigate && f.origen === 'CEE_DIRECTO') onNavigate('cee-directos', { cee_id: f.cee_directo_id });
    else if (onNavigate) onNavigate('expedientes', { expediente_id: f.expediente });
    else window.location.href = href;
}

/** Estado de una factura: icono + palabra (nunca solo color). */
const EST_FACTURA = {
    BORRADOR: { clase: 'borrador', icono: 'lapiz' },
    PENDIENTE: { clase: 'emitida', icono: 'reloj', texto: 'Pendiente' },
    VENCIDA: { clase: 'vencida', icono: 'alerta' },
    PAGADA: { clase: 'cobrada', icono: 'check' },
    RECTIFICADA: { clase: 'rectificada', icono: 'rect' },
    EMITIDA: { clase: 'emitida', icono: 'check' },
};
export function ChipEstado({ factura, className = '' }) {
    const v = factura?.visible || estadoVisible(factura || {});
    const e = EST_FACTURA[v.clave] || EST_FACTURA.EMITIDA;
    return <span className={`fx-est fx-est-${e.clase} ${className}`}><Ico n={e.icono} sw={2.6} />{e.texto || v.texto}</span>;
}

export function EtiquetaOrigen({ origen }) {
    const t = ORIGEN_TXT[origen];
    if (!t) return null;
    return <span className="fx-chip fx-chip-gris">{t}</span>;
}

/**
 * Marcar cobrada (o cambiar la fecha del cobro de una ya cobrada). Hoy por defecto.
 * Desde el listado el cobro de hoy es un toque; esto es para elegir otra fecha.
 * `url` y `ayuda` lo reutilizan para las ventas CAE de Drive (autofacturas), cuyo
 * cobro va a `POST /ventas-drive/:fileId/cobro` (acepta el mismo `{ pagada, fecha }`).
 */
export function CobroDialog({ factura, onClose, onHecho, url = null, ayuda = 'Se marca también en el libro de facturas de AppSheet, si la factura está en él.' }) {
    const hoy = hoyIso();
    const cambiar = factura.estado === 'PAGADA';
    const [fecha, setFecha] = useState(cambiar && fechaOk(factura.fecha_pago) ? factura.fecha_pago : hoy);
    const [ocupado, setOcupado] = useState(false);
    const [error, setError] = useState(null);
    const ayer = sumarDias(hoy, -1);
    const venc = factura.vencimiento;

    const marcar = async () => {
        if (!fechaOk(fecha)) return;
        setOcupado(true); setError(null);
        try {
            const { data } = await axios.post(url || `${API}/facturas/${factura.id}/cobro`, { pagada: true, fecha });
            onHecho?.(data);
        } catch (err) {
            setError(err.response?.data?.error || 'No se pudo marcar como cobrada.');
            setOcupado(false);
        }
    };

    return (
        <Dialogo antetitulo={cambiar ? 'Cambiar la fecha del cobro' : 'Cobro'} tono="verde" titulo={cambiar ? '¿Cuándo se cobró?' : 'Marcar cobrada'}
            onClose={onClose} ocupado={ocupado}
            pie={(
                <>
                    <button type="button" className="fx-btn fx-btn-sec" onClick={onClose} disabled={ocupado}>Cancelar</button>
                    <button type="button" className="fx-btn fx-btn-pri" onClick={marcar} disabled={ocupado || !fechaOk(fecha)} data-autofoco>
                        {ocupado ? 'Marcando…' : <><Ico n="check" size={18} sw={2.6} />{cambiar ? 'Guardar la fecha' : 'Marcar cobrada'}</>}
                    </button>
                </>
            )}>
            <div className="fx-dlg-cifra">
                <span className="fx-nro">{factura.numero || ''}</span>
                <Importe n={factura.total} />
                <p>{factura.cliente_nombre || factura.cliente?.razon_social || ''}{venc ? ` · ${venc < hoy ? 'venció' : 'vence'} el ${isoAEs(venc)}` : ''}</p>
            </div>
            <div className="fx-campo">
                <span>Fecha del cobro</span>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <input type="date" value={fecha} max={hoy} onChange={e => setFecha(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') marcar(); }}
                        className="fx-input" style={{ flex: '1 1 170px', width: 'auto' }} aria-label="Fecha del cobro" />
                    <div className="fx-seg" role="group" aria-label="Atajos de fecha">
                        <button type="button" aria-pressed={fecha === hoy} onClick={() => setFecha(hoy)}>Hoy</button>
                        <button type="button" aria-pressed={fecha === ayer} onClick={() => setFecha(ayer)}>Ayer</button>
                    </div>
                </div>
            </div>
            {ayuda && <p className="fx-ayuda">{ayuda}</p>}
            {error && <AvisoFx tono="ambar">{error}</AvisoFx>}
        </Dialogo>
    );
}

/**
 * RECTIFICAR una factura emitida: qué partidas (todas marcadas: anularla entera es
 * lo normal), el motivo —una vez, obligatorio, sale en la rectificativa— y el tipo
 * (R4 por defecto; R1 solo para impagos, descuentos o devoluciones, art. 80 LIVA).
 * Crea el BORRADOR de la rectificativa con esas partidas en negativo.
 */
export function RectificarDialog({ factura, onClose, onHecho }) {
    const [lineas, setLineas] = useState(() => (Array.isArray(factura.lineas) ? factura.lineas : null));
    const [errorLineas, setErrorLineas] = useState(null);
    const [sel, setSel] = useState(() => new Set((Array.isArray(factura.lineas) ? factura.lineas : []).map((l, i) => l.key || String(i))));
    const [motivo, setMotivo] = useState('');
    const [tipo, setTipo] = useState('R4');
    const [verTipo, setVerTipo] = useState(false);
    const [ocupado, setOcupado] = useState(false);
    const [error, setError] = useState(null);

    // El listado no trae las partidas: se leen de la factura.
    useEffect(() => {
        if (Array.isArray(factura.lineas)) return;
        let vivo = true;
        axios.get(`${API}/facturas/${factura.id}`).then(({ data }) => {
            if (!vivo) return;
            const ls = Array.isArray(data?.lineas) ? data.lineas : [];
            setLineas(ls);
            setSel(new Set(ls.map((l, i) => l.key || String(i))));
        }).catch(err => { if (vivo) setErrorLineas(err.response?.data?.error || 'No se pudieron leer las partidas de la factura.'); });
        return () => { vivo = false; };
    }, [factura.id, factura.lineas]);

    const filas = useMemo(() => totalesLineas(lineas || []).lineas.map((l, i) => ({ ...l, _k: l.key || String(i) })), [lineas]);
    const elegidas = filas.filter(l => sel.has(l._k));
    const todas = filas.length > 0 && elegidas.length === filas.length;
    const algunas = elegidas.length > 0 && !todas;
    const importe = useMemo(() => calcularFactura({ lineas: lineasRectificativa(elegidas), irpfPct: factura.irpf_pct }).total, [elegidas, factura.irpf_pct]);
    const alternar = (k) => setSel(s => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
    const alternarTodas = () => setSel(todas ? new Set() : new Set(filas.map(l => l._k)));

    const crear = async () => {
        if (!motivo.trim() || !elegidas.length) return;
        setOcupado(true); setError(null);
        try {
            const cuerpo = { motivo: motivo.trim(), tipo };
            // Todas: el servidor las pone él (las mismas, en negativo). Solo unas: van ya en negativo.
            if (!todas) cuerpo.lineas = lineasRectificativa(elegidas.map(({ _k, ...l }) => sinCifras({ ...l, key: _k })));
            const { data } = await axios.post(`${API}/facturas/${factura.id}/rectificar`, cuerpo);
            onHecho?.(data.factura, { parcial: !todas });
        } catch (err) {
            setError(err.response?.data?.error || 'No se pudo preparar la rectificativa.');
            setOcupado(false);
        }
    };

    const motivoTxt = !elegidas.length ? 'Marca alguna partida' : !motivo.trim() ? 'Escribe el motivo' : null;
    return (
        <Dialogo antetitulo={`Rectificar · ${factura.numero || ''}`} titulo={todas ? 'Anular la factura entera' : 'Rectificar una parte'} ancho
            subtitulo={`${factura.cliente_nombre || factura.cliente?.razon_social || ''} · ${eur(factura.total)}. Nace como BORRADOR: no tiene número ni sale nada hasta que la emitas.`}
            onClose={onClose} ocupado={ocupado} cerrarFuera={!motivo.trim()}
            pie={(
                <>
                    <button type="button" className="fx-btn fx-btn-sec" onClick={onClose} disabled={ocupado}>Cancelar</button>
                    <button type="button" className="fx-btn fx-btn-pri" onClick={crear} disabled={ocupado || !!motivoTxt || !lineas}>
                        {ocupado ? 'Preparando…' : motivoTxt || <><Ico n="rect" size={18} />Preparar la rectificativa · {eur(importe)}</>}
                    </button>
                </>
            )}>
            <div>
                <h3 className="fx-sec-tit">Qué se rectifica</h3>
                {errorLineas ? <AvisoFx tono="ambar">{errorLineas}</AvisoFx> : !lineas ? (
                    <div className="fx-cargando" style={{ padding: 20 }}><Ico n="reloj" size={22} className="fx-spin" />Leyendo las partidas…</div>
                ) : (
                    <div className="fx-checks">
                        <label className="fx-check fx-check-todas">
                            <input type="checkbox" checked={todas} ref={el => { if (el) el.indeterminate = algunas; }} onChange={alternarTodas} />
                            <span><b>Todas las partidas</b><small>{todas ? `Al emitirla, ${factura.numero} queda «Rectificada».` : 'Desmarca lo que no se corrige.'}</small></span>
                            <b>{eur(-Math.abs(Number(factura.total) || 0))}</b>
                        </label>
                        {filas.map(l => (
                            <label key={l._k} className="fx-check">
                                <input type="checkbox" checked={sel.has(l._k)} onChange={() => alternar(l._k)} />
                                <span>{l.descripcion}<small>{String(l.uds).replace('.', ',')} × {eur(l.precio)}{l.suplido ? ' · suplido' : ` · IVA ${l.ivaPct} %`}</small></span>
                                <b>{eur(-Math.abs(l.importe))}</b>
                            </label>
                        ))}
                    </div>
                )}
            </div>
            <label className="fx-campo">
                <span>Motivo · obligatorio, sale en la factura rectificativa</span>
                <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={3} maxLength={500} autoFocus data-autofoco
                    placeholder="p. ej. Error en el NIF del cliente · Se facturó de más una tasa" className="fx-area no-uppercase" />
            </label>
            {!verTipo ? (
                <p className="fx-ayuda">
                    Rectificativa <b>{tipo}</b>{tipo === 'R4' ? ' (error u otra causa)' : ' (impago, descuento o devolución)'}.{' '}
                    <button type="button" className="fx-link" style={{ minHeight: 0, fontSize: 'inherit' }} onClick={() => setVerTipo(true)}>¿Es un impago, un descuento o una devolución?</button>
                </p>
            ) : (
                <div style={{ display: 'grid', gap: 8 }}>
                    <button type="button" className="fx-opcion" aria-pressed={tipo === 'R4'} onClick={() => setTipo('R4')}>
                        <i /><span><b>R4 · Error u otra causa</b><small>Lo normal: un dato o un importe mal puestos.</small></span>
                    </button>
                    <button type="button" className="fx-opcion" aria-pressed={tipo === 'R1'} onClick={() => setTipo('R1')}>
                        <i /><span><b>R1 · Impago, descuento o devolución posterior</b><small>Los casos del art. 80 LIVA.</small></span>
                    </button>
                </div>
            )}
            {error && <AvisoFx tono="ambar">{error}</AvisoFx>}
        </Dialogo>
    );
}

// ── El editor ───────────────────────────────────────────────────────────────

/** A qué bloque del editor va un error o un aviso de `revisarParaEmitir` (o del servidor). */
const bloqueDe = (t) => (/partida|importe|suplido|IVA/i.test(t) ? 'partidas'
    : /rectific|motivo/i.test(t) ? 'rect'
        : /fecha|vencim/i.test(t) ? 'mas'
            : /NIF|CIF|cliente|domicilio|raz[oó]n social|nombre/i.test(t) ? 'cliente'
                : 'general');

/**
 * @param facturaId  abre una existente (sin él, una nueva)
 * @param inicial    para una nueva: { serie: 'ING'|'FML' }
 * @param paso       al abrir: 'envio' → directa al envío (una emitida) · 'emitir' → directa a
 *                   la pregunta de emitir (un borrador) · 'cobro' → el diálogo del cobro
 * @param nota       una línea que se enseña arriba (p. ej. qué hacer en una rectificativa parcial)
 * @param onAbrir    (id, { paso, nota }) abre OTRA factura en su lugar (la duplicada, la rectificativa…)
 * @param onNavigate el de la app: «Ir al CEE / al expediente» de una factura de otro módulo
 */
export function FacturaModal({ isOpen, onClose, onSaved, onAbrir, facturaId = null, inicial = null, paso = null, nota = null, onNavigate = null }) {
    const { showConfirm } = useModal();
    const serieInicial = SERIES[inicial?.serie] ? inicial.serie : 'ING';

    const [cargando, setCargando] = useState(!!facturaId);
    const [errorCarga, setErrorCarga] = useState(null);
    const [catalogo, setCatalogo] = useState([]);
    const [errorCatalogo, setErrorCatalogo] = useState(null);
    const [emisores, setEmisores] = useState(null);         // null = sin leer todavía
    const [waReady, setWaReady] = useState(null);

    // La fila tal como la devuelve el servidor (lo que no se edita: número,
    // estado, historial, emisor de la emitida…).
    const [id, setId] = useState(facturaId);
    const [doc, setDoc] = useState(null);
    const [rectificada, setRectificada] = useState(null);   // { id, numero, fecha } de la original

    const [serie, setSerie] = useState(serieInicial);
    const [lineas, setLineas] = useState([]);
    const [focoPrecio, setFocoPrecio] = useState(null);
    const [lineaAbierta, setLineaAbierta] = useState(null);
    const [irpfPct, setIrpfPct] = useState(SERIES[serieInicial].irpfPct);
    const [irpfTocado, setIrpfTocado] = useState(false);
    const [fecha, setFecha] = useState(hoyIso());
    const [vencimiento, setVencimiento] = useState('');
    const [vencTocado, setVencTocado] = useState(false);
    const [fechaOperacion, setFechaOperacion] = useState('');
    const [observaciones, setObservaciones] = useState('');
    const [obsTocado, setObsTocado] = useState(false);
    const [expediente, setExpediente] = useState('');
    const [motivoRect, setMotivoRect] = useState('');
    const [verMas, setVerMas] = useState(false);
    const [verHist, setVerHist] = useState(false);

    // Cliente: 'buscar' (aún no hay) · 'ficha' (de la app) · 'nuevo' (tecleado;
    // con `crearFicha` nace su ficha al guardar, con el alta rápida).
    const [modoCliente, setModoCliente] = useState('buscar');
    const [clienteId, setClienteId] = useState(null);
    const [fiscal, setFiscal] = useState(FISCAL_VACIO);
    const [fiscalTocado, setFiscalTocado] = useState(false);
    const [clienteCambiado, setClienteCambiado] = useState(false);
    const [crearFicha, setCrearFicha] = useState(true);
    const [verFiscal, setVerFiscal] = useState(false);
    const [deEmisor, setDeEmisor] = useState(false);        // FML: el cliente puesto es la sociedad

    const [sucio, setSucio] = useState(false);
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState(null);               // lo que falló al guardar/emitir/…, junto al pie
    const [erroresServidor, setErroresServidor] = useState(null);
    const [intentado, setIntentado] = useState(false);      // se pulsó «Emitir»: se marcan los bloques
    const [errorPdf, setErrorPdf] = useState(null);
    const [preview, setPreview] = useState(false);
    const [dialogo, setDialogo] = useState(null);           // 'cobro' | 'rectificar'
    const [verEmisores, setVerEmisores] = useState(false);
    const [preguntando, setPreguntando] = useState(false);
    const [menuPie, setMenuPie] = useState(null);
    const [menuSerie, setMenuSerie] = useState(null);
    const [previsto, setPrevisto] = useState({ clave: null, numero: null, cargando: false });
    const [preparando, setPreparando] = useState(false);

    // Envío (solo una emitida): su propio diálogo, con el mensaje entero.
    const [verEnvio, setVerEnvio] = useState(false);
    const [envio, setEnvio] = useState({ cargando: false, error: null, adjunto: '' });
    const [email, setEmail] = useState('');
    const [tlf, setTlf] = useState('');
    const [usaEmail, setUsaEmail] = useState(false);
    const [usaWa, setUsaWa] = useState(false);
    const [mensaje, setMensaje] = useState('');
    const [nombreDestino, setNombreDestino] = useState('');
    const [editarDestino, setEditarDestino] = useState(false);

    // Overlay estándar: emitir y enviar.
    const [fase, setFase] = useState(null);
    const [resultado, setResultado] = useState({ ok: false, items: [], text: '', tipo: 'enviar', id: null, numero: null });

    const pasoHecho = useRef(false);
    const clienteRef = useRef(null);
    const partidasRef = useRef(null);
    const buscadorRef = useRef(null);
    const masRef = useRef(null);
    const rectRef = useRef(null);
    const errorRef = useRef(null);
    const emitirRef = useRef(null);
    const [toast, avisar] = useAvisoFx();

    // ── Carga ────────────────────────────────────────────────────────────────

    useEffect(() => {
        if (!isOpen) return;
        axios.get(`${API}/articulos`).then(r => setCatalogo(Array.isArray(r.data) ? r.data : (r.data?.articulos || [])))
            .catch(err => setErrorCatalogo(err.response?.data?.error || 'No se pudo leer el catálogo de artículos'));
        axios.get(`${API}/emisores`).then(r => setEmisores(Array.isArray(r.data) ? r.data : [])).catch(() => setEmisores([]));
        axios.get('/api/whatsapp/status').then(r => setWaReady(!!r.data?.ready)).catch(() => setWaReady(false));
    }, [isOpen]);

    /** Lo que devuelve el servidor manda: número, estado, cliente resuelto, cifras. */
    const absorber = useCallback((d) => {
        if (!d) return;
        setDoc(d); setId(d.id);
        setSerie(SERIES[d.serie] ? d.serie : 'ING');
        setLineas((Array.isArray(d.lineas) ? d.lineas : []).map(l => ({ ...l, key: l.key || nuevaClave() })));
        setIrpfPct(Number(d.irpf_pct) || 0); setIrpfTocado(true);
        setFecha(d.fecha || hoyIso());
        const vAuto = d.fecha && d.vencimiento === sumarDias(d.fecha, VENCIMIENTO_DIAS);
        setVencimiento(d.vencimiento || ''); setVencTocado(!vAuto);
        setFechaOperacion(d.fecha_operacion || '');
        setObservaciones(d.observaciones ?? ''); setObsTocado(true);
        setExpediente(d.expediente || '');
        setMotivoRect(d.motivo_rectificacion || '');
        setClienteId(d.cliente_id || null);
        setFiscal(fiscalDe(d.cliente || {}));
        setModoCliente(d.cliente_id ? 'ficha' : (d.cliente?.razon_social ? 'nuevo' : 'buscar'));
        setCrearFicha(false); setFiscalTocado(false); setClienteCambiado(false); setDeEmisor(false);
        setSucio(false);
    }, []);

    const cargarDetalle = useCallback(async (fid, { silencioso = false } = {}) => {
        if (!silencioso) setCargando(true);
        try {
            const { data } = await axios.get(`${API}/facturas/${fid}`);
            absorber(data);
            setErrorCarga(null);
            return data;
        } catch (err) {
            if (!silencioso) setErrorCarga(err.response?.data?.error || 'No se pudo abrir la factura');
            return null;
        } finally {
            if (!silencioso) setCargando(false);
        }
    }, [absorber]);

    useEffect(() => {
        if (!isOpen || !facturaId) return;
        cargarDetalle(facturaId);
    }, [isOpen, facturaId, cargarDetalle]);

    // La factura a la que rectifica: su número y su fecha van en el PDF.
    const rectificaId = doc?.rectifica_id || null;
    useEffect(() => {
        if (!rectificaId) { setRectificada(null); return; }
        let vivo = true;
        axios.get(`${API}/facturas/${rectificaId}`)
            .then(r => { if (vivo) setRectificada({ id: rectificaId, numero: r.data?.numero || null, fecha: r.data?.fecha || null }); })
            .catch(() => { if (vivo) setRectificada({ id: rectificaId, numero: null, fecha: null }); });
        return () => { vivo = false; };
    }, [rectificaId]);

    // ── Derivados ────────────────────────────────────────────────────────────

    const estado = doc?.estado || null;                 // null = nueva, sin guardar
    const tipo = doc?.tipo || 'F1';
    const esRect = tipo !== 'F1';
    const editable = !cargando && !errorCarga && (!estado || estado === 'BORRADOR');
    const emitida = !!estado && estado !== 'BORRADOR';
    const externo = cobroExterno(doc || {});
    const origenApp = !doc?.origen || doc.origen === 'APP';

    const emisorSerie = useMemo(() => (emisores || []).find(e => e.serie === serie) || null, [emisores, serie]);
    const emisorIng = useMemo(() => (emisores || []).find(e => e.serie === 'ING') || null, [emisores]);
    const emisorPdf = emitida ? (doc?.emisor || emisorSerie) : (emisorSerie || (doc?.serie === serie ? doc?.emisor : null));
    const irpfEfectivo = irpfTocado ? irpfPct : Number(emisorSerie?.irpf_pct ?? SERIES[serie].irpfPct) || 0;
    const obsEfectivas = obsTocado ? observaciones : (emisorSerie?.observaciones || '');
    const vencEfectivo = vencTocado ? vencimiento : (fechaOk(fecha) ? sumarDias(fecha, VENCIMIENTO_DIAS) : '');

    const porId = useMemo(() => new Map(catalogo.map(a => [String(a.id), a])), [catalogo]);
    const filas = useMemo(() => totalesLineas(lineas).lineas, [lineas]);
    const calc = useMemo(() => calcularFactura({ lineas, irpfPct: irpfEfectivo }), [lineas, irpfEfectivo]);
    const clienteFiscal = useMemo(() => sanearCliente(fiscal), [fiscal]);

    const borrador = useMemo(() => ({
        serie, tipo, numero: doc?.numero || null,
        fecha, vencimiento: vencEfectivo || null, fecha_operacion: fechaOperacion.trim() || null,
        cliente: clienteFiscal, lineas, irpf_pct: irpfEfectivo, observaciones: obsEfectivas,
        expediente: expediente.trim() || null,
        rectifica_numero: doc?.rectifica_numero || rectificada?.numero || null,
        motivo_rectificacion: motivoRect, total: calc.total,
    }), [serie, tipo, doc?.numero, doc?.rectifica_numero, rectificada?.numero, fecha, vencEfectivo, fechaOperacion, clienteFiscal, lineas, irpfEfectivo, obsEfectivas, expediente, motivoRect, calc.total]);

    const revision = useMemo(() => revisarParaEmitir(borrador), [borrador]);

    // El número que le tocará, a la vista ANTES de emitir (el de la hoja para una
    // ordinaria, el de la tabla para una rectificativa). Leer la hoja tarda: se pide
    // al abrir, no al pulsar. El de verdad se reserva al emitir.
    const claveProximo = isOpen && editable && fechaOk(fecha) ? `${serie}|${tipo}|${fecha}` : null;
    useEffect(() => {
        if (!claveProximo) return;
        let vivo = true;
        const [s, t, f] = claveProximo.split('|');
        setPrevisto({ clave: claveProximo, numero: null, cargando: true });
        axios.get(`${API}/facturas/proximo`, { params: { serie: s, tipo: t, fecha: f } })
            .then(r => { if (vivo) setPrevisto({ clave: claveProximo, numero: r.data?.numero || null, cargando: false }); })
            .catch(() => { if (vivo) setPrevisto({ clave: claveProximo, numero: null, cargando: false }); });
        return () => { vivo = false; };
    }, [claveProximo]);

    // FML nueva: el cliente es la sociedad (los datos del emisor ING). Se ve y se cambia.
    useEffect(() => {
        if (!isOpen || facturaId || id || serie !== 'FML' || modoCliente !== 'buscar' || clienteCambiado || !emisorIng?.razon_social) return;
        setFiscal(fiscalDeEmisor(emisorIng));
        setModoCliente('nuevo'); setCrearFicha(false); setDeEmisor(true);
    }, [isOpen, facturaId, id, serie, modoCliente, clienteCambiado, emisorIng]);

    // ── Acciones ─────────────────────────────────────────────────────────────

    // Mientras la pregunta está abierta, el Esc es suyo (es su «no»): no puede
    // cerrar también el editor.
    const preguntar = useCallback(async (...args) => {
        setPreguntando(true);
        try { return await showConfirm(...args); } finally { setPreguntando(false); }
    }, [showConfirm]);

    const cerrar = useCallback(async () => {
        if (fase) return;
        if (editable && sucio) {
            const ok = await preguntar('Lo que has cambiado desde el último guardado se pierde.', 'Cerrar sin guardar', 'warning', { confirmar: 'Cerrar sin guardar', cancelar: 'Seguir editando' });
            if (!ok) return;
        }
        onClose?.();
    }, [fase, editable, sucio, preguntar, onClose]);

    const abrirEnvio = useCallback(async (fid) => {
        setVerEnvio(true); setEditarDestino(false);
        setEnvio({ cargando: true, error: null, adjunto: '' });
        try {
            const { data } = await axios.get(`${API}/facturas/${fid}/mensaje`);
            const d = data?.destino || {};
            setEmail(d.email || ''); setTlf(d.tlf || ''); setNombreDestino(d.nombre || '');
            const c = canalesIniciales({ email: d.email, tlf: d.tlf, waReady });
            setUsaEmail(c.usaEmail); setUsaWa(c.usaWa);
            setMensaje(data?.mensaje || '');
            setEnvio({ cargando: false, error: null, adjunto: data?.adjunto || '' });
        } catch (err) {
            setEnvio({ cargando: false, error: err.response?.data?.error || 'No se pudo preparar el mensaje.', adjunto: '' });
        }
    }, [waReady]);

    // Con WhatsApp desconectado no puede quedar marcado.
    useEffect(() => {
        if (waReady !== false || !usaWa) return;
        setUsaWa(false);
        if (/\S+@\S+\.\S+/.test(email)) setUsaEmail(true);
    }, [waReady, usaWa, email]);

    // ── Edición (funciones normales: van antes del `return null` solo para que el
    //    paso «emitir» del listado pueda llamar a `emitir` desde un efecto) ─────

    // Lo que dijo el servidor al intentar emitir deja de valer en cuanto se cambia
    // algo (si no, «Emitir» se quedaría bloqueado con un error ya arreglado).
    const tocar = () => { setSucio(true); setError(null); setErroresServidor(null); };

    const cambiarSerie = (s) => {
        if (s === serie || !editable) return;
        const obsDefViejas = emisorSerie?.observaciones || '';
        setSerie(s);
        setIrpfTocado(false);   // la retención la pone la serie (FML 15 %, ING 0)
        if (!obsTocado || observaciones === obsDefViejas) setObsTocado(false);
        // El cliente «sociedad» puesto para la FML no vale para una ING.
        if (deEmisor && s !== 'FML') { setFiscal(FISCAL_VACIO); setModoCliente('buscar'); setDeEmisor(false); }
        tocar();
    };

    const udsNuevas = (ls) => (esRect ? ls.map(l => ({ ...l, uds: -Math.abs(Number(l.uds) || 1) })) : ls);
    const anadirArticulo = (art, variante) => {
        if (lineas.length >= MAX_LINEAS) return;
        setLineas(ls => [...ls, ...udsNuevas(lineasDeArticulo(art, catalogo, { varianteId: variante?.id ?? null }))]);
        tocar();
    };
    // De «Partida nueva» sin guardar en el catálogo: con su precio e IVA, o a por el precio.
    const anadirLibre = (texto, datos = null) => {
        if (lineas.length >= MAX_LINEAS) return;
        const l = { ...lineaLibre(texto, esRect ? -1 : 1), ...(datos || {}) };
        setLineas(ls => [...ls, l]);
        if (!(Number(l.precio) > 0) && !l.suplido) { setFocoPrecio(l.key); setLineaAbierta(l.key); }
        tocar();
    };
    const anadirCreado = (art) => {
        setCatalogo(c => [...c, art]);
        anadirArticulo(art);
    };
    const cambiarLinea = (key, patch) => { setLineas(ls => ls.map(l => (l.key === key ? { ...l, ...patch } : l))); tocar(); };
    const quitarLinea = (key) => { setLineas(ls => ls.filter(l => l.key !== key && l.arrastrada_de !== key)); setLineaAbierta(null); tocar(); };
    const moverLinea = (i, d) => {
        setLineas(ls => {
            const j = i + d;
            if (j < 0 || j >= ls.length) return ls;
            const c = [...ls];
            [c[i], c[j]] = [c[j], c[i]];
            return c;
        });
        tocar();
    };
    // En una rectificativa el signo de todas se cambia de una vez.
    const invertirSigno = () => { setLineas(ls => ls.map(l => ({ ...l, uds: -(Number(l.uds) || 0) }))); tocar(); };

    const cambiarFiscal = (k, v) => { setFiscal(f => ({ ...f, [k]: v })); setFiscalTocado(true); setDeEmisor(false); tocar(); };

    const irAPartidas = () => { if (!lineas.length) setTimeout(() => buscadorRef.current?.focus(), 60); };
    const elegirFicha = (c) => {
        if (!c) return;
        const f = fiscalDeFicha(c);
        setClienteId(c.id_cliente); setFiscal(f);
        setModoCliente('ficha'); setClienteCambiado(true); setFiscalTocado(false); setDeEmisor(false);
        // Si a la ficha le falta lo que una factura no puede no llevar, se abre ya.
        const faltaAlgo = !f.cif || !f.direccion || !f.municipio;
        setVerFiscal(faltaAlgo);
        tocar();
        if (!faltaAlgo) irAPartidas();
    };
    const nuevoRapido = ({ nombre, tlf: t }) => {
        setFiscal({ ...FISCAL_VACIO, razon_social: nombre || '', tlf: t || '' });
        setClienteId(null); setModoCliente('nuevo'); setCrearFicha(true); setDeEmisor(false);
        setClienteCambiado(true); setFiscalTocado(true);
        tocar();
    };
    const teclearAMano = () => {
        setFiscal(FISCAL_VACIO); setClienteId(null);
        setModoCliente('nuevo'); setCrearFicha(false); setDeEmisor(false);
        setClienteCambiado(true); setFiscalTocado(true);
        tocar();
    };
    const cambiarCliente = () => {
        setModoCliente('buscar'); setClienteId(null); setFiscal(FISCAL_VACIO); setDeEmisor(false);
        setVerFiscal(false); setClienteCambiado(true); setFiscalTocado(false);
        tocar();
    };

    const hayCliente = modoCliente === 'ficha' ? !!clienteId : modoCliente === 'nuevo' && !!fiscal.razon_social.trim();
    const hayPartidas = lineas.some(l => String(l.descripcion || '').trim());
    const puedeGuardar = editable && hayCliente && hayPartidas && !guardando && !fase;

    /** Lo que se guarda (el servidor sanea las líneas y recalcula las cifras). */
    const datos = () => {
        const d = {
            serie,
            lineas: lineas.map(sinCifras),
            irpf_pct: irpfEfectivo,
            fecha, vencimiento: vencEfectivo || null,
            fecha_operacion: fechaOperacion.trim() || null,
            expediente: expediente.trim() || null,
        };
        // Nueva y sin tocar: el servidor pone las del emisor de la serie.
        if (obsTocado || id) d.observaciones = obsEfectivas;
        if (esRect) d.motivo_rectificacion = motivoRect.trim();
        const f = Object.fromEntries(Object.entries(fiscal).map(([k, v]) => [k, String(v || '').trim()]));
        if (!id || clienteCambiado || deEmisor) {
            if (modoCliente === 'ficha') {
                d.cliente_id = clienteId;
                if (fiscalTocado) d.cliente = f;
            } else if (crearFicha) {
                d.cliente_nuevo = { nombre: f.razon_social, tlf: f.tlf || null, email: f.email || null };
                d.cliente = f;
            } else {
                d.cliente_id = null;
                d.cliente = f;
            }
        } else if (fiscalTocado) {
            d.cliente = f;
        }
        return d;
    };

    const textoError = (err, que) => err.response?.data?.error || (err.response ? `No se pudo ${que} (error ${err.response.status}).` : 'No hay conexión con el servidor.');
    const mostrarError = (texto) => {
        setError(texto);
        setTimeout(() => errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 40);
    };

    const guardar = async ({ silencioso = false } = {}) => {
        const eraNueva = !id;
        setGuardando(true);
        if (!silencioso) setError(null);
        try {
            let f;
            if (eraNueva) ({ data: { factura: f } } = await axios.post(`${API}/facturas`, datos()));
            else ({ data: f } = await axios.put(`${API}/facturas/${id}`, datos()));
            absorber(f);
            if (!silencioso) avisar(eraNueva ? 'Guardada como borrador: no tiene número ni se ha enviado nada.' : 'Cambios guardados.');
            onSaved?.(f);
            return f;
        } catch (err) {
            mostrarError(textoError(err, 'guardar el borrador'));
            return null;
        } finally {
            setGuardando(false);
        }
    };

    // Lo que falta para emitir: ni un botón muerto, se salta al bloque y se marca.
    const erroresVer = unicos([...revision.errores, ...(erroresServidor?.errores || [])]);
    const avisosVer = unicos([...revision.avisos, ...(erroresServidor?.avisos || [])]);
    const sinEmisor = editable && !!emisores && (!emisorSerie || emisorSerie.activo === false);
    const falta = !hayCliente ? { bloque: 'cliente', texto: 'Elige el cliente' }
        : !hayPartidas ? { bloque: 'partidas', texto: 'Añade una partida' }
            : erroresVer.length ? { bloque: bloqueDe(erroresVer[0]), texto: erroresVer.length > 1 ? `Faltan ${erroresVer.length} cosas` : 'Revisa lo que falta' }
                : null;

    const saltarA = (bloque) => {
        setIntentado(true);
        if (bloque === 'mas') setVerMas(true);
        if (bloque === 'cliente' && modoCliente !== 'buscar') setVerFiscal(true);
        const ref = { cliente: clienteRef, partidas: partidasRef, mas: masRef, rect: rectRef }[bloque] || errorRef;
        setTimeout(() => {
            ref.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
            const campo = bloque === 'partidas' && !hayPartidas ? buscadorRef.current
                : ref.current?.querySelector?.('input:not([type=checkbox]), textarea');
            campo?.focus?.({ preventScroll: true });
        }, 80);
    };

    const emitir = async () => {
        setErroresServidor(null); setError(null);
        if (falta) { saltarA(falta.bloque); return; }
        if (sinEmisor) { setVerEmisores(true); return; }
        // El número que tocará: ya pedido al abrir; si no llegó, se pide ahora.
        let numeroPrevisto = previsto.clave === claveProximo ? previsto.numero : null;
        if (!numeroPrevisto) {
            setPreparando(true);
            try { numeroPrevisto = (await axios.get(`${API}/facturas/proximo`, { params: { serie, tipo, fecha } })).data?.numero || null; }
            catch { /* sin el número: se dice igual qué serie es */ }
            finally { setPreparando(false); }
        }
        const cabecera = numeroPrevisto
            ? `Se emitirá como la ${numeroPrevisto}.`
            : esRect ? `Se emitirá con el siguiente número de rectificativa de la serie ${serie} (R-${yyDe(fecha)}${serie}_…).`
                : `Se emitirá con el siguiente número de la serie ${serie}.`;
        const avisos = avisosVer.length ? `\n\nOjo:\n${avisosVer.map(a => `• ${a}`).join('\n')}` : '';
        const ok = await preguntar(
            `${cabecera}\n${clienteFiscal.razon_social} · ${eur(calc.total)}\n\nUna factura emitida no se borra ni se cambia: se rectifica. Enviarla al cliente es otro paso.${avisos}`,
            esRect ? 'Emitir la rectificativa' : 'Emitir la factura', 'warning',
            { confirmar: numeroPrevisto ? `Emitir ${numeroPrevisto}` : 'Emitir', cancelar: 'Todavía no' },
        );
        if (!ok) return;

        let fid = id;
        if (!fid || sucio) {
            const f = await guardar({ silencioso: true });
            if (!f) return;
            fid = f.id;
        }
        setResultado({ ok: false, items: [], text: '', tipo: 'emitir', id: fid, numero: null });
        setFase('sending');
        try {
            const { data } = await axios.post(`${API}/facturas/${fid}/emitir`, {}, { timeout: 180000 });
            if (data.factura) absorber(data.factura);
            setErrorPdf(data.errorPdf || null);
            setIntentado(false);
            const items = [
                { texto: `${data.numero} · ${eur(data.total)}`, tono: 'ok' },
                ...(data.avisos || []).map(a => ({ texto: a, tono: 'aviso' })),
                ...(data.errorPdf ? [{ texto: `El PDF no se ha generado (${data.errorPdf}). La factura YA está emitida: rehaz el PDF desde la factura.`, tono: 'aviso' }] : []),
                { texto: 'Todavía no se le ha enviado al cliente.', tono: 'info' },
            ];
            setResultado({ ok: true, items, text: '', tipo: 'emitir', id: fid, numero: data.numero });
            setFase('done');
            onSaved?.(data.factura || null);
        } catch (err) {
            const r = err.response?.data;
            if (r?.errores?.length || r?.avisos?.length) { setErroresServidor({ errores: r.errores || [], avisos: r.avisos || [] }); setIntentado(true); }
            const text = !err.response
                ? 'No ha llegado la respuesta del servidor. Puede que se haya emitido igualmente: se vuelve a leer la factura antes de reintentar.'
                : [...(r?.errores?.length ? r.errores : [r?.error || `No se pudo emitir (error ${err.response.status}).`]),
                    ...(r?.avisos || []).map(a => `Aviso: ${a}`)].join('\n');
            setResultado({ ok: false, items: [], text, tipo: 'emitir', id: fid, numero: null });
            setFase('done');
            cargarDetalle(fid, { silencioso: true });
            onSaved?.(null);
        }
    };

    // El paso que pide el listado («Emitir» de un borrador, «Enviar» o «Cobrar» de
    // una emitida), una sola vez y con la factura ya leída.
    useEffect(() => { emitirRef.current = emitir; });
    useEffect(() => {
        if (!isOpen || !paso || pasoHecho.current || !doc?.id) return;
        if (paso === 'envio' && doc.estado !== 'BORRADOR') { pasoHecho.current = true; abrirEnvio(doc.id); }
        else if (paso === 'cobro' && doc.estado === 'EMITIDA') { pasoHecho.current = true; setDialogo('cobro'); }
        else if (paso === 'emitir' && doc.estado === 'BORRADOR' && emisores) { pasoHecho.current = true; emitirRef.current?.(); }
    }, [isOpen, paso, doc, emisores, abrirEnvio]);

    if (!isOpen) return null;

    // ── El resto de acciones (solo con el editor abierto) ───────────────────

    const canEmail = usaEmail && /\S+@\S+\.\S+/.test(email);
    const canWa = usaWa && !!waReady && tlf.replace(/\D/g, '').length >= 9;
    const canales = [...(canWa ? ['whatsapp'] : []), ...(canEmail ? ['email'] : [])];

    const enviar = async () => {
        setResultado({ ok: false, items: [], text: '', tipo: 'enviar', id, numero: doc?.numero || null });
        setFase('sending');
        try {
            const { data } = await axios.post(`${API}/facturas/${id}/enviar`, { canales, email: email.trim(), tlf: tlf.trim(), mensaje }, { timeout: 120000 });
            const items = Object.entries(data.resultados || {}).map(([k, r]) => ({
                texto: r.ok ? `${k === 'email' ? 'Email' : 'WhatsApp'} → ${r.to}` : `${k === 'email' ? 'Email' : 'WhatsApp'}: ${r.error}`,
                tono: r.ok ? 'ok' : 'aviso',
            }));
            recordarCanales(Object.entries(data.resultados || {}).filter(([, r]) => r.ok).map(([k]) => k));
            setResultado(x => ({ ...x, ok: true, items, text: '' }));
            setFase('done');
            onSaved?.(null);
        } catch (err) {
            const r = err.response?.data;
            const det = r?.resultados ? Object.entries(r.resultados).map(([k, v]) => `${k === 'email' ? 'Email' : 'WhatsApp'}: ${v.error || 'ok'}`).join('\n') : '';
            const base = textoError(err, 'enviar');
            setResultado(x => ({ ...x, ok: false, items: [], text: [base, det].filter(Boolean).join('\n') }));
            setFase('done');
        }
    };

    const cerrarOverlay = () => {
        const { ok, tipo: t } = resultado;
        setFase(null);
        if (ok && t === 'enviar') { setVerEnvio(false); onClose?.(); }
        else if (t === 'enviar') cargarDetalle(id, { silencioso: true });
    };

    const deshacerCobro = async () => {
        const ok = await preguntar(`${doc.numero} vuelve a «pendiente de cobro» (y en la hoja de AppSheet, a ENVIADA).`, 'Deshacer el cobro', 'warning', { confirmar: 'Deshacer el cobro', cancelar: 'Dejarla cobrada' });
        if (!ok) return;
        setGuardando(true);
        try {
            const { data } = await axios.post(`${API}/facturas/${id}/cobro`, { pagada: false });
            await cargarDetalle(id, { silencioso: true });
            avisar((data?.avisoHoja ? `Cobro deshecho. ${data.avisoHoja}` : 'Cobro deshecho: vuelve a estar pendiente.') + textoCobroCee(data), { tono: data?.avisoHoja ? 'aviso' : 'ok' });
            onSaved?.(null);
        } catch (err) {
            mostrarError(textoError(err, 'deshacer el cobro'));
        } finally { setGuardando(false); }
    };

    const rehacerPdf = async () => {
        setGuardando(true);
        try {
            await axios.post(`${API}/facturas/${id}/pdf`, {}, { timeout: 120000 });
            setErrorPdf(null);
            avisar('PDF rehecho y archivado, con el mismo número.');
            cargarDetalle(id, { silencioso: true });
        } catch (err) {
            mostrarError(textoError(err, 'rehacer el PDF'));
        } finally { setGuardando(false); }
    };

    const abrirOtra = (fid, opts = {}) => {
        if (onAbrir) onAbrir(fid, opts);
        else { setVerEnvio(false); cargarDetalle(fid); }
    };

    const duplicar = async () => {
        setGuardando(true);
        try {
            const { data } = await axios.post(`${API}/facturas/${id}/duplicar`);
            onSaved?.(data.factura);
            abrirOtra(data.factura.id, { nota: `Copia de ${doc.numero || 'un borrador'}: borrador nuevo con fecha de hoy y el mes del concepto avanzado. Revísalo y emítelo.` });
        } catch (err) {
            mostrarError(textoError(err, 'duplicar'));
        } finally { setGuardando(false); }
    };

    const borrar = async () => {
        const ok = await preguntar('El borrador se borra del todo. No tiene número, así que no deja hueco en la serie.', 'Borrar el borrador', 'warning', { confirmar: 'Borrar', cancelar: 'No borrar' });
        if (!ok) return;
        setGuardando(true);
        try {
            await axios.delete(`${API}/facturas/${id}`);
            onSaved?.(null);
            onClose?.();
        } catch (err) {
            mostrarError(textoError(err, 'borrar'));
            setGuardando(false);
        }
    };

    const verPdfArchivado = async () => {
        const e = await abrirPdf(`${API}/facturas/${id}/pdf`, doc?.numero || 'Factura');
        if (e) mostrarError(e);
    };

    // «Descargar PDF» del visor: una emitida baja SU PDF archivado (el que recibe el
    // cliente); un borrador, lo que hay ahora en el editor, pintado por el servidor y sin guardar.
    const descargarPdf = async () => {
        try {
            const r = emitida
                ? await axios.get(`${API}/facturas/${id}/pdf`, { responseType: 'blob', timeout: 90000 })
                : await axios.post(`${API}/facturas/vista-previa/pdf`, { ...borrador, id }, { responseType: 'blob', timeout: 90000 });
            const u = URL.createObjectURL(new Blob([r.data], { type: 'application/pdf' }));
            const a = document.createElement('a');
            a.href = u; a.download = nombrePdfFactura(emitida ? doc?.numero : null, borrador.cliente?.razon_social);
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(u), 60000);
            return null;
        } catch (err) {
            let texto = 'No se pudo preparar el PDF.';
            try { const j = JSON.parse(await err.response?.data?.text?.()); if (j?.error) texto = j.error; } catch { /* sin cuerpo legible */ }
            return texto;
        }
    };

    // ── Pintar ───────────────────────────────────────────────────────────────

    const hayIrpf = calc.irpf !== 0;     // en una rectificativa de FML, la retención también va en negativo
    const totalFactura = Math.round((calc.neto + calc.iva) * 100) / 100;
    const titulo = doc?.numero
        ? doc.numero
        : estado ? (esRect ? 'Borrador de rectificativa' : 'Borrador de factura') : 'Nueva factura';
    const puedeCobrar = emitida && !externo && doc?.estado === 'EMITIDA' && Number(doc?.total) > 0;
    const puedeDescobrar = emitida && !externo && doc?.estado === 'PAGADA';
    const puedeRectificar = emitida && tipo === 'F1' && doc?.estado !== 'RECTIFICADA';
    const historial = Array.isArray(doc?.historial) ? [...doc.historial].reverse() : [];
    const ultimoEnvio = Array.isArray(doc?.envios) && doc.envios.length ? doc.envios[doc.envios.length - 1] : null;
    const marca = intentado || !!erroresServidor;
    // Sin cliente o sin partidas basta UNA frase en su bloque: los «falta el NIF», «no tiene
    // importe»… que vienen detrás dirían lo mismo tres veces.
    const tapado = (b) => (b === 'cliente' && !hayCliente) || (b === 'partidas' && !hayPartidas);
    const errDe = (b) => (marca && !tapado(b) ? erroresVer.filter(t => bloqueDe(t) === b) : []);
    const avDe = (b) => (tapado(b) ? [] : avisosVer.filter(t => bloqueDe(t) === b));
    const lineaFiscal = (c) => [c.direccion, [c.cp, c.municipio].filter(Boolean).join(' '), c.provincia ? `(${c.provincia})` : ''].filter(Boolean).join(', ');
    const enviadaYa = !!doc?.enviada_at || !!ultimoEnvio;

    const listaErrores = (b) => {
        const es = errDe(b), avs = avDe(b);
        if (!es.length && !avs.length) return null;
        return (
            <div style={{ display: 'grid', gap: 4, marginTop: 10 }}>
                {es.map(t => <p key={t} className="fx-error"><Ico n="alerta" size={15} />{t}</p>)}
                {avs.map(t => <p key={t} className="fx-ayuda fx-ayuda-ico"><Ico n="info" size={14} />{t}</p>)}
            </div>
        );
    };

    // ··· del pie
    const items = editable ? [
        { label: id ? 'Guardar cambios' : 'Guardar borrador', icono: ICO_EXTRA.guardar, onClick: () => guardar(), disabled: !puedeGuardar || (!!id && !sucio), detalle: 'Sin número: no sale nada' },
        modoCliente === 'buscar' && { label: 'Cliente sin ficha: teclear sus datos', icono: ICO_EXTRA.persona, onClick: teclearAMano },
        id && { label: 'Duplicar', icono: ICO_EXTRA.copiar, onClick: duplicar, disabled: guardando },
        { label: `Datos del emisor ${serie}`, icono: 'ajustes', onClick: () => setVerEmisores(true) },
        id && { sep: true },
        id && { label: 'Borrar el borrador', icono: 'borrar', peligro: true, onClick: borrar, disabled: guardando },
    ] : emitida ? [
        { label: 'Abrir el PDF archivado', icono: 'pdf', onClick: verPdfArchivado },
        { label: enviadaYa ? 'Reenviar al cliente' : 'Enviar al cliente', icono: 'enviar', onClick: () => abrirEnvio(id) },
        puedeCobrar && { label: 'Marcar cobrada', icono: 'check', onClick: () => setDialogo('cobro') },
        puedeDescobrar && { label: 'Cambiar la fecha del cobro', icono: 'calendario', onClick: () => setDialogo('cobro') },
        puedeDescobrar && { label: 'Deshacer el cobro', icono: ICO_EXTRA.deshacer, onClick: deshacerCobro, disabled: guardando },
        externo && hrefOrigen(doc) && { label: textoOrigen(doc), icono: 'carpeta', detalle: externo, onClick: () => { onClose?.(); irAlOrigen(doc, onNavigate); } },
        { sep: true },
        puedeRectificar && { label: 'Rectificar', icono: 'rect', onClick: () => setDialogo('rectificar'), disabled: guardando, detalle: 'Una emitida no se cambia: se rectifica' },
        { label: 'Duplicar', icono: ICO_EXTRA.copiar, onClick: duplicar, disabled: guardando },
        origenApp && { label: 'Rehacer el PDF', icono: 'reintentar', onClick: rehacerPdf, disabled: guardando, detalle: 'El mismo número' },
    ] : [];
    const itemsMenu = items.filter(Boolean);

    let principal = null;
    if (editable) {
        principal = (
            <button type="button" className="fx-btn fx-btn-pri" onClick={emitir} disabled={guardando || !!fase || preparando}>
                {preparando ? <><Ico n="reloj" size={18} className="fx-spin" />Preparando…</>
                    : falta ? <><Ico n="alerta" size={18} />{falta.texto}</>
                        : sinEmisor ? <><Ico n="alerta" size={18} />Falta el emisor {serie}</>
                            : <><Ico n="recibo" size={18} />Emitir{previsto.numero && previsto.clave === claveProximo ? ` ${previsto.numero}` : ''} · {eur(calc.total)}</>}
            </button>
        );
    } else if (emitida && origenApp && !enviadaYa && doc?.estado !== 'RECTIFICADA') {
        principal = <button type="button" className="fx-btn fx-btn-pri" onClick={() => abrirEnvio(id)}><Ico n="enviar" size={18} />Enviar al cliente</button>;
    } else if (puedeCobrar) {
        principal = <button type="button" className="fx-btn fx-btn-pri" onClick={() => setDialogo('cobro')}><Ico n="check" size={18} sw={2.6} />Marcar cobrada</button>;
    } else if (emitida) {
        principal = <button type="button" className="fx-btn fx-btn-pri" onClick={verPdfArchivado}><Ico n="pdf" size={18} />Ver el PDF</button>;
    }
    const pie = (cargando || errorCarga) ? null : (
        <>
            {itemsMenu.length > 0 && (
                <button type="button" className="fx-btn fx-pie-mas" aria-label="Más acciones" aria-haspopup="menu"
                    onClick={e => setMenuPie(e.currentTarget)}><Ico n="mas3" size={22} /></button>
            )}
            {(emitida || (editable && hayPartidas)) && (
                <button type="button" className="fx-btn fx-btn-sec fx-pie-ver" onClick={() => setPreview(true)} aria-label="Vista previa del PDF">
                    <Ico d={ICO_EXTRA.ojo} size={18} /><span>Vista previa</span>
                </button>
            )}
            {principal}
        </>
    );

    const chipSerie = (
        <span className="fx-chip fx-chip-borde fx-serie-chip"><span className="fx-dot" style={{ '--c': COLOR_SERIE[serie] }} />{serie} · {SERIES[serie]?.nombre}</span>
    );
    const chips = (
        <>
            {doc && <ChipEstado factura={doc} />}
            {editable && !esRect ? (
                <button type="button" className="fx-chip fx-chip-borde fx-serie-chip" style={{ cursor: 'pointer', background: '#fff' }}
                    aria-haspopup="menu" aria-label={`Serie ${serie}: cambiar`} onClick={e => setMenuSerie(e.currentTarget)}>
                    <span className="fx-dot" style={{ '--c': COLOR_SERIE[serie] }} />{serie} · {SERIES[serie]?.nombre}<Ico n="abajo" size={12} sw={2.6} />
                </button>
            ) : chipSerie}
            {esRect && <span className="fx-chip fx-chip-pizarra">{TIPO_TXT[tipo]}</span>}
            <EtiquetaOrigen origen={doc?.origen} />
            {doc?.verifactu_activo && emitida && <span className="fx-chip fx-chip-ok">VERI*FACTU</span>}
            {sucio && editable && <span className="fx-chip fx-chip-ambar">Sin guardar</span>}
        </>
    );
    const sub = editable ? (
        previsto.cargando && previsto.clave === claveProximo ? 'Mirando qué número le toca…'
            : previsto.numero && previsto.clave === claveProximo ? <>Se emitirá como <b>{previsto.numero}</b>. Guardar no emite nada; emitida, ya no se cambia: se rectifica.</>
                : 'Guardar no emite nada. Emitir le pone número y desde ahí ya no se cambia: se rectifica.'
    ) : emitida ? (
        <>Emitida el {isoAEs(doc?.fecha)}
            {doc?.estado === 'PAGADA' && doc?.fecha_pago ? <> · <b>cobrada el {isoAEs(doc.fecha_pago)}</b></> : doc?.vencimiento && Number(doc?.total) > 0 ? <> · vence el {isoAEs(doc.vencimiento)}</> : null}
            {ultimoEnvio ? <> · enviada el {fmtMomento(ultimoEnvio.at)}</> : enviadaYa ? ' · enviada' : origenApp ? <> · <b>sin enviar</b></> : null}
        </>
    ) : null;

    const resumenMas = [
        `Fecha ${isoAEs(fecha) || '—'}`,
        (!esRect || calc.total > 0) && vencEfectivo ? `vence ${isoAEs(vencEfectivo)}` : null,
        irpfEfectivo ? `IRPF ${fmtPct(irpfEfectivo)}` : null,
        expediente ? `exp. ${expediente}` : null,
        fechaOperacion ? fechaOperacion : null,
        obsEfectivas ? 'con observaciones' : null,
    ].filter(Boolean).join(' · ');

    const formFiscal = (
        <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
            <label className="fx-campo"><span>Nombre o razón social</span>
                <input value={fiscal.razon_social} onChange={e => cambiarFiscal('razon_social', e.target.value)} disabled={!editable}
                    className="fx-input" autoFocus={modoCliente === 'nuevo' && !fiscal.razon_social} autoComplete="off" />
            </label>
            <div className="fx-fila2">
                <label className="fx-campo"><span>NIF / CIF{fiscal.cif.trim() && validarNif(fiscal.cif).valido ? ` · ${validarNif(fiscal.cif).tipo} correcto` : ''}</span>
                    <input value={fiscal.cif} onChange={e => cambiarFiscal('cif', e.target.value.toUpperCase())} disabled={!editable}
                        className={`fx-input fx-mono${marca && !fiscal.cif.trim() ? ' fx-mal' : ''}`} autoComplete="off" />
                </label>
                <label className="fx-campo"><span>Teléfono</span>
                    <input value={fiscal.tlf} onChange={e => cambiarFiscal('tlf', e.target.value)} disabled={!editable} type="tel" inputMode="tel" className="fx-input" autoComplete="off" />
                </label>
            </div>
            {fiscal.cif.trim() && !validarNif(fiscal.cif).valido && (
                <p className="fx-error"><Ico n="alerta" size={15} />No cuadra la letra o el dígito de control (si es extranjero, puede ser normal).</p>
            )}
            <label className="fx-campo"><span>Dirección</span>
                <input value={fiscal.direccion} onChange={e => cambiarFiscal('direccion', e.target.value)} disabled={!editable} className="fx-input" autoComplete="off" />
            </label>
            <div className="fx-fila2">
                <label className="fx-campo"><span>CP</span>
                    <input value={fiscal.cp} onChange={e => cambiarFiscal('cp', e.target.value)} disabled={!editable} inputMode="numeric" className="fx-input" autoComplete="off" />
                </label>
                <label className="fx-campo"><span>Municipio</span>
                    <input value={fiscal.municipio} onChange={e => cambiarFiscal('municipio', e.target.value)} disabled={!editable} className="fx-input" autoComplete="off" />
                </label>
            </div>
            <div className="fx-fila2">
                <label className="fx-campo"><span>Provincia</span>
                    <input value={fiscal.provincia} onChange={e => cambiarFiscal('provincia', e.target.value)} disabled={!editable} className="fx-input" autoComplete="off" />
                </label>
                <label className="fx-campo"><span>Email</span>
                    <input value={fiscal.email} onChange={e => cambiarFiscal('email', e.target.value)} disabled={!editable} type="email" className="fx-input no-uppercase" autoComplete="off" />
                </label>
            </div>
        </div>
    );

    const faltaNif = !fiscal.cif.trim();
    const faltaDom = !fiscal.direccion.trim() || !fiscal.municipio.trim();
    const bloqueCliente = (
        <section ref={clienteRef} className={`fx-seccion${errDe('cliente').length || (marca && !hayCliente) ? ' fx-seccion-mal' : ''}`}>
            <div className="fx-sec-cab">
                <h3 className="fx-sec-tit">Cliente</h3>
                {editable && modoCliente !== 'buscar' && <button type="button" className="fx-link" onClick={cambiarCliente}>Cambiar</button>}
            </div>
            {marca && !hayCliente && <p className="fx-error" style={{ marginBottom: 10 }}><Ico n="alerta" size={15} />Elige el cliente: búscalo, o da de alta uno nuevo.</p>}
            {editable && modoCliente === 'buscar' ? (
                <>
                    <ClientePicker tema="fx" cliente={null} onChange={elegirFicha} onNuevoRapido={nuevoRapido} autoFocus={!facturaId}
                        placeholder="¿A quién se factura? Nombre, NIF o móvil" />
                    <button type="button" className="fx-link" style={{ marginTop: 6, fontSize: 13 }} onClick={teclearAMano}>Sin ficha: teclear sus datos fiscales</button>
                </>
            ) : modoCliente === 'ficha' || !editable || deEmisor ? (
                <>
                    <div className="fx-ficha">
                        <div>
                            <b>{fiscal.razon_social || '—'}</b>
                            <small>
                                {faltaNif ? <span className="fx-ficha-falta">Sin NIF</span> : <span className="fx-mono">{fiscal.cif}</span>}
                                {' · '}
                                {faltaDom ? <span className="fx-ficha-falta">sin domicilio</span> : lineaFiscal(fiscal)}
                            </small>
                            {(fiscal.tlf || fiscal.email) && <small>{[fiscal.tlf, fiscal.email].filter(Boolean).join(' · ')}</small>}
                            {deEmisor && <small>La FML se factura a la sociedad: son los datos del emisor ING.</small>}
                            {!editable && clienteId && <small>Datos fiscales tal como quedaron en la factura.</small>}
                        </div>
                        {editable && (
                            faltaNif || faltaDom
                                ? <button type="button" className="fx-btn fx-btn-sec fx-btn-peq" onClick={() => setVerFiscal(true)}>{faltaNif ? 'Añadir NIF' : 'Añadir domicilio'}</button>
                                : <button type="button" className="fx-link" onClick={() => setVerFiscal(v => !v)}>{verFiscal ? 'Ocultar' : 'Datos fiscales'}</button>
                        )}
                    </div>
                    {editable && verFiscal && (
                        <>
                            {formFiscal}
                            <p className="fx-ayuda" style={{ marginTop: 8 }}>Lo que cambies aquí vale solo para esta factura: la ficha del cliente no se toca.</p>
                        </>
                    )}
                </>
            ) : (
                <>
                    {formFiscal}
                    {(!id || clienteCambiado) && (
                        <label className="fx-check" style={{ marginTop: 10, border: '1px solid var(--linea)', borderRadius: 14 }}>
                            <input type="checkbox" checked={crearFicha} onChange={e => { setCrearFicha(e.target.checked); setClienteCambiado(true); tocar(); }} />
                            <span>Darlo de alta como cliente en la app<small>Con su nombre, teléfono y email.</small></span>
                        </label>
                    )}
                </>
            )}
            {listaErrores('cliente')}
        </section>
    );

    const bloquePartidas = (
        <section ref={partidasRef} className={`fx-seccion${errDe('partidas').length || (marca && !hayPartidas) ? ' fx-seccion-mal' : ''}`}>
            <div className="fx-sec-cab">
                <h3 className="fx-sec-tit">Partidas</h3>
                {editable && esRect && lineas.length > 0 && <button type="button" className="fx-link" onClick={invertirSigno}>± Cambiar el signo</button>}
                {!esRect && lineas.length > 0 && editable && <span className="fx-ayuda">{lineas.length} · toca una para cambiarla</span>}
            </div>
            {marca && !hayPartidas && <p className="fx-error" style={{ marginBottom: 10 }}><Ico n="alerta" size={15} />Añade al menos una partida.</p>}
            {editable && errorCatalogo && <AvisoFx tono="ambar">{errorCatalogo}. Puedes escribir partidas libres.</AvisoFx>}
            {editable && esRect && <p className="fx-ayuda" style={{ marginBottom: 10 }}>Lo que se devuelve va en negativo (−1 × precio). Las partidas nuevas entran ya en negativo.</p>}
            <div className="fx-lineas">
                {filas.map((l, i) => (
                    <FilaLinea key={l.key || i} l={l} art={porId.get(String(l.articulo_id))} editable={editable}
                        focoPrecio={focoPrecio === l.key} permiteNegativo={esRect}
                        abierta={lineaAbierta === l.key} onAlternar={() => setLineaAbierta(k => (k === l.key ? null : l.key))}
                        onCambiar={p => cambiarLinea(l.key, p)} onQuitar={() => quitarLinea(l.key)}
                        onSubir={() => moverLinea(i, -1)} onBajar={() => moverLinea(i, 1)}
                        primera={i === 0} ultima={i === filas.length - 1} />
                ))}
                {!filas.length && <div className="fx-lineas-vacio">{editable ? 'Todavía no hay partidas. Escribe abajo y pulsa Enter.' : 'Sin partidas.'}</div>}
            </div>
            {editable && (
                <div style={{ marginTop: 10 }}>
                    <BuscadorArticulos catalogo={catalogo} onElegir={anadirArticulo} onLibre={anadirLibre} onCreado={anadirCreado} entradaRef={buscadorRef}
                        autoFocus={false} bloqueado={lineas.length >= MAX_LINEAS} />
                </div>
            )}
            {listaErrores('partidas')}
        </section>
    );

    const bloqueTotal = (
        <div className="fx-totales fx-total-caja">
            <dl className="fx-filas">
                <div className="fx-fila"><dt>Base imponible{calc.descuento > 0 ? <small>con −{eur(calc.descuento)} de descuento</small> : null}</dt><dd>{eur(calc.neto - calc.suplidos)}</dd></div>
                <div className="fx-fila"><dt>IVA</dt><dd>{eur(calc.iva)}</dd></div>
                {calc.suplidos ? <div className="fx-fila"><dt>Suplidos<small>tasas, sin IVA</small></dt><dd>{eur(calc.suplidos)}</dd></div> : null}
                {hayIrpf && <div className="fx-fila"><dt>Total factura</dt><dd>{eur(totalFactura)}</dd></div>}
                {hayIrpf && <div className="fx-fila"><dt>Retención IRPF<small>{fmtPct(calc.irpfPct)}</small></dt><dd>{eur(-calc.irpf)}</dd></div>}
            </dl>
            <div className="fx-total-grande"><span>{hayIrpf ? 'Total a pagar' : 'Total'}</span><Importe n={calc.total} /></div>
        </div>
    );

    const bloqueMas = editable ? (
        <div ref={masRef} className={errDe('mas').length ? 'fx-seccion-mal' : ''} style={{ borderRadius: 20 }}>
            <MasOpciones resumen={resumenMas} abierto={verMas} onAlternar={() => setVerMas(v => !v)}>
                <div className="fx-fila2">
                    <label className="fx-campo"><span>Fecha</span>
                        <input type="date" value={fecha} onChange={e => { setFecha(e.target.value); tocar(); }} className="fx-input" />
                    </label>
                    {/* Lo que se devuelve no vence: sin importe a cobrar, sin vencimiento. */}
                    {(!esRect || calc.total > 0) ? (
                        <label className="fx-campo">
                            <span>Vencimiento{vencTocado && <> · <button type="button" className="fx-link" style={{ minHeight: 0, fontSize: 'inherit' }} onClick={() => { setVencTocado(false); tocar(); }}>a {VENCIMIENTO_DIAS} días</button></>}</span>
                            <input type="date" value={vencEfectivo} min={fechaOk(fecha) ? fecha : undefined}
                                onChange={e => { setVencimiento(e.target.value); setVencTocado(true); tocar(); }} className="fx-input" />
                        </label>
                    ) : (
                        <div className="fx-campo"><span>Vencimiento</span><p className="fx-ayuda" style={{ minHeight: 46, display: 'flex', alignItems: 'center' }}>Sin vencimiento (a devolver)</p></div>
                    )}
                </div>
                <div className="fx-fila2" style={{ marginTop: 12 }}>
                    <label className="fx-campo"><span>Retención IRPF %</span>
                        <CampoDecimal valor={irpfEfectivo} onCambio={n => { setIrpfPct(Math.min(100, n)); setIrpfTocado(true); tocar(); }}
                            alVaciar={() => { setIrpfPct(0); setIrpfTocado(true); tocar(); }} className="fx-input fx-num" />
                    </label>
                    <label className="fx-campo"><span>Nº de expediente</span>
                        <input value={expediente} onChange={e => { setExpediente(e.target.value.toUpperCase()); tocar(); }} placeholder="opcional" className="fx-input fx-mono" />
                    </label>
                </div>
                <label className="fx-campo" style={{ marginTop: 12 }}>
                    <span>Fecha de operación · solo si no es la de la factura
                        {fechaOk(fecha) && fechaOperacion.trim() !== mesDe(fecha) && (
                            <> · <button type="button" className="fx-link" style={{ minHeight: 0, fontSize: 'inherit' }} onClick={() => { setFechaOperacion(mesDe(fecha)); tocar(); }}>«{mesDe(fecha)}»</button></>
                        )}
                    </span>
                    <input value={fechaOperacion} onChange={e => { setFechaOperacion(e.target.value); tocar(); }} maxLength={60}
                        placeholder="p. ej. octubre 2026" className="fx-input no-uppercase" />
                </label>
                <label className="fx-campo" style={{ marginTop: 12 }}>
                    <span>Observaciones que salen en el PDF</span>
                    <textarea value={obsEfectivas} rows={3} maxLength={MAX_OBS_FACTURA}
                        onChange={e => { setObservaciones(e.target.value); setObsTocado(true); tocar(); }} className="fx-area no-uppercase" />
                </label>
                {listaErrores('mas')}
            </MasOpciones>
        </div>
    ) : (
        <section className="fx-seccion">
            <h3 className="fx-sec-tit">Datos de la factura</h3>
            <dl className="fx-datos">
                {[
                    ['Fecha', isoAEs(fecha) || '—'],
                    ['Vencimiento', isoAEs(doc?.vencimiento) || '—'],
                    ['Cobrada el', doc?.fecha_pago ? isoAEs(doc.fecha_pago) : '—'],
                    ['Expediente', expediente || '—'],
                    ...(fechaOperacion ? [['Fecha de operación', fechaOperacion]] : []),
                    ...(hayIrpf ? [['IRPF', fmtPct(calc.irpfPct)]] : []),
                    ['Serie', `${serie} · ${SERIES[serie]?.nombre || ''}`],
                    ...(ultimoEnvio ? [['Último envío', `${fmtMomento(ultimoEnvio.at)} · ${(ultimoEnvio.canales || []).join(' y ')}`]] : []),
                ].map(([k, v]) => (
                    <div key={k} className="fx-dato"><dt>{k}</dt><dd>{v}</dd></div>
                ))}
            </dl>
            {obsEfectivas && <p className="fx-msg" style={{ marginTop: 12 }}>{obsEfectivas}</p>}
        </section>
    );

    const htmlPreview = preview ? buildFacturaHtml(payloadPdf(borrador, emisorPdf, { rectificada })) : '';

    return (
        <>
            <PanelFx antetitulo={esRect ? 'Factura rectificativa' : 'Factura'} titulo={titulo} chips={chips} sub={sub}
                onCerrar={cerrar} pie={pie}
                bloqueado={preguntando || preview || !!fase || !!dialogo || verEmisores || verEnvio || !!menuPie || !!menuSerie}>
                {cargando ? (
                    <div className="fx-cargando"><Ico n="reloj" size={28} className="fx-spin" />Abriendo la factura…</div>
                ) : errorCarga ? (
                    <AvisoFx tono="ambar">{errorCarga}</AvisoFx>
                ) : (
                    <>
                        {nota && <AvisoFx tono="crema">{nota}</AvisoFx>}

                        {sinEmisor && (
                            <AvisoFx tono="ambar" accion={<button type="button" className="fx-btn fx-btn-sec fx-btn-peq" onClick={() => setVerEmisores(true)}>Darlos de alta</button>}>
                                Faltan los datos del emisor de la serie {serie}: sin ellos no se puede emitir, y la vista previa sale con los de BROKERGY.
                            </AvisoFx>
                        )}

                        {/* Rectificativa: a qué rectifica y por qué */}
                        {esRect && (
                            <section ref={rectRef} className={`fx-seccion${errDe('rect').length ? ' fx-seccion-mal' : ''}`}>
                                <h3 className="fx-sec-tit">Qué rectifica</h3>
                                <p className="fx-ayuda" style={{ fontSize: 14 }}>
                                    {TIPO_TXT[tipo]} de la factura{' '}
                                    {rectificada?.id
                                        ? <button type="button" className="fx-link-num" onClick={() => abrirOtra(rectificada.id)}>{doc?.rectifica_numero || rectificada.numero || 'original'}</button>
                                        : <b className="fx-mono">{doc?.rectifica_numero || '—'}</b>}
                                    {rectificada?.fecha ? <> del {isoAEs(rectificada.fecha)}</> : null}
                                </p>
                                {editable ? (
                                    <label className="fx-campo" style={{ marginTop: 10 }}>
                                        <span>Motivo de la rectificación · obligatorio</span>
                                        <textarea value={motivoRect} onChange={e => { setMotivoRect(e.target.value); tocar(); }} rows={2} maxLength={500}
                                            className={`fx-area no-uppercase${marca && !motivoRect.trim() ? ' fx-mal' : ''}`} style={{ minHeight: 64 }} />
                                    </label>
                                ) : (
                                    <p className="fx-ayuda" style={{ marginTop: 6 }}><b>Motivo:</b> {doc?.motivo_rectificacion || '—'}</p>
                                )}
                                {listaErrores('rect')}
                            </section>
                        )}

                        {/* Una emitida: lo que le ha pasado después */}
                        {emitida && Array.isArray(doc?.rectificativas) && doc.rectificativas.length > 0 && (
                            <AvisoFx tono="crema" icono="rect">
                                {doc.estado === 'RECTIFICADA' ? 'Rectificada por ' : 'Tiene rectificativas: '}
                                {doc.rectificativas.map((r, i) => (
                                    <span key={r.id}>{i > 0 ? ', ' : ''}<button type="button" className="fx-link-num" onClick={() => abrirOtra(r.id)}>{r.numero || 'borrador'}</button> ({eur(r.total)})</span>
                                ))}
                            </AvisoFx>
                        )}
                        {emitida && externo && (
                            <AvisoFx tono="crema" accion={hrefOrigen(doc) ? (
                                <a className="fx-btn fx-btn-sec fx-btn-peq" href={hrefOrigen(doc)} onClick={e => { if (!(e.ctrlKey || e.metaKey || e.shiftKey)) onClose?.(); irAlOrigen(doc, onNavigate, e); }}>
                                    {textoOrigen(doc)}<Ico n="derecha" size={16} />
                                </a>
                            ) : null}>
                                {externo}. El PDF también se rehace desde allí.
                            </AvisoFx>
                        )}
                        {emitida && errorPdf && origenApp && (
                            <AvisoFx tono="ambar" accion={<button type="button" className="fx-btn fx-btn-sec fx-btn-peq" onClick={rehacerPdf} disabled={guardando}>Rehacer el PDF</button>}>
                                La factura está emitida pero su PDF no se generó ({errorPdf}).
                            </AvisoFx>
                        )}

                        {bloqueCliente}
                        {bloquePartidas}
                        {bloqueTotal}
                        {bloqueMas}

                        {marca && errDe('general').length > 0 && (
                            <AvisoFx tono="ambar">{errDe('general').map(t => <div key={t}>{t}</div>)}</AvisoFx>
                        )}

                        {historial.length > 0 && (
                            <MasOpciones titulo="Historial" resumen={`${historial.length} ${historial.length === 1 ? 'anotación' : 'anotaciones'} · la última, ${fmtMomento(historial[0]?.fecha)}`}
                                abierto={verHist} onAlternar={() => setVerHist(v => !v)}>
                                <ol className="fx-hist">
                                    {historial.map((h, i) => (
                                        <li key={`${h.fecha}-${i}`}>
                                            <time>{fmtMomento(h.fecha)}</time>
                                            <span>{h.texto}</span>
                                            {h.usuario && <small>{h.usuario}</small>}
                                        </li>
                                    ))}
                                </ol>
                            </MasOpciones>
                        )}

                        {error && <div ref={errorRef}><AvisoFx tono="ambar" role="alert">{error}</AvisoFx></div>}
                        {!error && <div ref={errorRef} />}
                    </>
                )}
            </PanelFx>

            {menuPie && <MenuAcciones anchor={menuPie} items={itemsMenu} titulo={doc?.numero || (editable ? 'Borrador' : 'Factura')} onClose={() => setMenuPie(null)} />}
            {menuSerie && (
                <MenuAcciones anchor={menuSerie} titulo="Serie" onClose={() => setMenuSerie(null)}
                    items={Object.keys(SERIES).map(s => ({
                        label: `${s} · ${SERIES[s].nombre}`, detalle: SERIES[s].descripcion,
                        icono: s === serie ? 'check' : 'recibo', onClick: () => cambiarSerie(s),
                    }))} />
            )}

            {preview && (
                <VistaPreviaA4 titulo="Vista previa de la factura" onClose={() => setPreview(false)} capa="z-[870]"
                    rotulo={doc?.numero ? `${esRect ? 'Rectificativa' : 'Factura'} ${doc.numero}` : 'Vista previa · borrador, sin número'}
                    html={htmlPreview} onDescargar={descargarPdf} />
            )}

            {dialogo === 'cobro' && doc && (
                <CobroDialog factura={doc} onClose={() => setDialogo(null)}
                    onHecho={async (r) => {
                        setDialogo(null);
                        await cargarDetalle(id, { silencioso: true });
                        avisar((r?.avisoHoja ? `Marcada como cobrada. ${r.avisoHoja}` : `${doc.numero}: cobrada el ${isoAEs(r?.fecha_pago)}.`) + textoCobroCee(r), { tono: r?.avisoHoja ? 'aviso' : 'ok' });
                        onSaved?.(null);
                    }} />
            )}
            {dialogo === 'rectificar' && doc && (
                <RectificarDialog factura={doc} onClose={() => setDialogo(null)}
                    onHecho={(f, { parcial }) => {
                        setDialogo(null);
                        onSaved?.(f);
                        abrirOtra(f.id, {
                            nota: parcial
                                ? `Rectificación parcial de ${doc.numero}: el borrador lleva solo las partidas marcadas, en negativo. Revisa los importes y emítela.`
                                : `Rectificativa de ${doc.numero}: anula la factura entera. Revísala y emítela; al emitirla, ${doc.numero} queda «Rectificada».`,
                        });
                    }} />
            )}

            {verEmisores && (
                <EmisoresModal isOpen serieInicial={serie} onClose={() => setVerEmisores(false)}
                    onSaved={(e) => setEmisores(es => [...(es || []).filter(x => x.serie !== e.serie), e])} />
            )}

            {verEnvio && doc && (
                <Dialogo antetitulo="Enviar al cliente" titulo={`Enviar ${doc.numero || ''}`} ancho ocupado={!!fase} cerrarFuera={false}
                    subtitulo={`${nombreDestino || clienteFiscal.razon_social || ''} · ${eur(doc.total)}${ultimoEnvio ? ` · ya se envió el ${fmtMomento(ultimoEnvio.at)}` : ''}`}
                    onClose={() => setVerEnvio(false)}
                    pie={(
                        <>
                            <button type="button" className="fx-btn fx-btn-sec" onClick={() => setVerEnvio(false)} disabled={!!fase} data-autofoco>Ahora no</button>
                            <button type="button" className="fx-btn fx-btn-pri" onClick={enviar}
                                disabled={!canales.length || envio.cargando || !!envio.error || !mensaje.trim() || !!fase}>
                                {!canales.length ? 'Marca un canal con destinatario'
                                    : <><Ico n="enviar" size={18} />Enviar {canales.length === 2 ? 'por WhatsApp y email' : canales[0] === 'whatsapp' ? 'por WhatsApp' : 'por email'}</>}
                            </button>
                        </>
                    )}>
                    {envio.cargando ? (
                        <div className="fx-cargando" style={{ padding: 28 }}><Ico n="reloj" size={24} className="fx-spin" />Preparando el mensaje…</div>
                    ) : envio.error ? (
                        <AvisoFx tono="ambar" accion={<button type="button" className="fx-btn fx-btn-sec fx-btn-peq" onClick={() => abrirEnvio(id)}><Ico n="reintentar" size={16} />Reintentar</button>}>{envio.error}</AvisoFx>
                    ) : (
                        <>
                            <CanalesEnvio email={email} tlf={tlf} usaEmail={usaEmail} usaWa={usaWa} waReady={waReady} bloqueado={!!fase}
                                onEmail={() => setUsaEmail(v => !v)} onWa={() => setUsaWa(v => !v)} />
                            {editarDestino || (!email && !tlf) ? (
                                <div className="fx-fila2">
                                    <label className="fx-campo"><span>Móvil (WhatsApp)</span>
                                        <input value={tlf} onChange={e => { setTlf(e.target.value); if (e.target.value.replace(/\D/g, '').length >= 9 && waReady) setUsaWa(true); }}
                                            type="tel" inputMode="tel" placeholder="600 11 22 33" className="fx-input" />
                                    </label>
                                    <label className="fx-campo"><span>Email</span>
                                        <input value={email} onChange={e => { setEmail(e.target.value); if (/\S+@\S+\.\S+/.test(e.target.value)) setUsaEmail(true); }}
                                            type="email" placeholder="correo@cliente.es" className="fx-input no-uppercase" />
                                    </label>
                                </div>
                            ) : (
                                <p className="fx-ayuda">Para <b>{nombreDestino || clienteFiscal.razon_social}</b> · <button type="button" className="fx-link" style={{ minHeight: 0, fontSize: 'inherit' }} onClick={() => setEditarDestino(true)}>Cambiar el destinatario</button></p>
                            )}
                            <label className="fx-campo">
                                <span>El mensaje, con el PDF adjunto{envio.adjunto ? ` (${envio.adjunto})` : ''}. Sale tal cual lo dejes aquí.</span>
                                <textarea value={mensaje} rows={11} onChange={e => setMensaje(e.target.value)} className="fx-area fx-area-msg no-uppercase" aria-label="Mensaje al cliente" />
                            </label>
                        </>
                    )}
                </Dialogo>
            )}

            {toast}

            <SendActionOverlay
                phase={fase}
                ok={resultado.ok}
                subtitle={`${resultado.numero || doc?.numero || (esRect ? 'Rectificativa' : 'Factura')} · ${clienteFiscal.razon_social || ''}`}
                items={resultado.items}
                errorText={resultado.text}
                icon={resultado.tipo === 'emitir' ? 'upload' : 'send'}
                sendingTitle={resultado.tipo === 'emitir' ? 'Emitiendo la factura…' : 'Enviando la factura…'}
                okTitle={resultado.tipo === 'emitir' ? `${resultado.numero || 'Factura'} emitida` : '¡Factura enviada!'}
                errorTitle={resultado.tipo === 'emitir' ? 'No se ha emitido' : 'No se pudo enviar'}
                accion={resultado.tipo === 'emitir' && resultado.ok
                    ? { etiqueta: 'Enviarla al cliente', onClick: () => { setFase(null); abrirEnvio(resultado.id); } }
                    : null}
                onClose={cerrarOverlay}
            />
        </>
    );
}

export default FacturaModal;
