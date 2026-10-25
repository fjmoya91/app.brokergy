import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import axios from 'axios';
import { useModal } from '../../../context/ModalContext';
import { normalize } from '../../../utils/direccionCatastral';
import { PresupuestoModal, MenuAcciones, ChipPresupuesto, useAvisoFx, abrirPdf, diasDesde, haceTxt, ICO_EXTRA } from './PresupuestoModal';
import { FacturaModal } from './FacturaModal';
import { Ico, eur, ErrorApi, errorDeApi, fechaEs } from '../estilo';
import { useParamsFacturacion } from '../urlFacturacion';

export { MenuAcciones } from './PresupuestoModal';

// ─────────────────────────────────────────────────────────────────────────────
// Presupuestos — el listado de trabajo (estilo «carta de pago», prefijo .fx-).
//
// Cada fila dice lo que toca con ella SIN abrirla: «Enviar» un borrador,
// «Reenviar» uno enviado hace más de 5 días, «Facturar» un aceptado (solo ADMIN),
// y si el cliente lo ha abierto («visto hace N d»). Lo demás, en «···». Un
// aceptado que ya tiene factura dice «facturado · 26ING_88» y ya no ofrece
// «Facturar» (el criterio es el de `facturaService.facturasDelPresupuesto`, que el
// servidor aplica en lote al listar: también cuenta lo emitido desde su CEE).
//
// Se pide la lista ENTERA una vez y se filtra aquí: los contadores de los chips y
// el buscador responden al instante. «Nuevo» y la tecla N están en la cabecera de
// la pestaña; este listado abre el editor cuando llega `nuevo=presupuesto` (o
// `abrir=<id>`) en la URL, y quita el parámetro.
// ─────────────────────────────────────────────────────────────────────────────

const API = '/api/facturacion/presupuestos';
const ESTADOS = ['BORRADOR', 'ENVIADA', 'ACEPTADA', 'RECHAZADA', 'ANULADA'];
const DIAS_REENVIAR = 5;
const POR_PAGINA = 60;

/** Facturado = tiene alguna factura EMITIDA viva (con número). Un borrador de factura aún no cuenta. */
const facturadas = (f) => (f.facturas || []).filter(x => x.numero);
const borradorFactura = (f) => (f.facturas || []).find(x => !x.numero && x.id) || null;
const facturado = (f) => facturadas(f).length > 0;

// «En curso» (por defecto) es lo que espera algo de alguien: el borrador, que lo
// mandemos; el enviado, que conteste el cliente; el aceptado, que se facture.
const CHIPS = [
    { id: 'en-curso', label: 'En curso', titulo: 'En curso', test: f => f.estado === 'BORRADOR' || f.estado === 'ENVIADA' || (f.estado === 'ACEPTADA' && !facturado(f)) },
    { id: 'esperando', label: 'Esperando respuesta', titulo: 'Esperando respuesta', test: f => f.estado === 'ENVIADA' },
    { id: 'por-facturar', label: 'Por facturar', titulo: 'Aceptados por facturar', test: f => f.estado === 'ACEPTADA' && !facturado(f) },
    { id: 'cerrados', label: 'Cerrados', titulo: 'Cerrados', test: f => (f.estado === 'ACEPTADA' && facturado(f)) || f.estado === 'RECHAZADA' || f.estado === 'ANULADA' },
    { id: 'todos', label: 'Todos', titulo: 'Todos los presupuestos', test: () => true },
];
const CHIP_DEFECTO = 'en-curso';

const tiempo = (iso) => { const t = new Date(iso || 0).getTime(); return Number.isFinite(t) ? t : 0; };
const ORDEN = {
    // Lo que lleva más tiempo sin respuesta, arriba: es a quien hay que llamar.
    esperando: (a, b) => tiempo(a.ultimo_envio?.at || a.created_at) - tiempo(b.ultimo_envio?.at || b.created_at),
    'por-facturar': (a, b) => tiempo(a.aceptada_at || a.created_at) - tiempo(b.aceptada_at || b.created_at),
};
const ordenDefecto = (a, b) => tiempo(b.created_at) - tiempo(a.created_at);

const fechaCorta = (iso) => fechaEs(String(iso || '').slice(0, 10));

// El foco en un campo de texto manda: «/» es una letra más.
const escribiendo = (el) => !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

// `puedeFacturar` (solo ADMIN: las facturas son suyas) añade «Facturar» a los aceptados.
export function PresupuestosLista({ prescriptores = [], onNavigate = null, puedeFacturar = false }) {
    const { showConfirm } = useModal();
    const [p, ponerParams] = useParamsFacturacion();
    const [filas, setFilas] = useState([]);
    const [cargado, setCargado] = useState(false);
    const [recargando, setRecargando] = useState(false);
    const [error, setError] = useState(null);
    const [busqueda, setBusqueda] = useState('');
    const [cuantos, setCuantos] = useState(POR_PAGINA);
    // { key, id? } — sin id es uno nuevo. La `key` remonta el editor en cada apertura.
    const [modal, setModal] = useState(null);
    const [menu, setMenu] = useState(null);        // { fila, anchor }
    const [ocupado, setOcupado] = useState(null);  // id de la fila con una acción en marcha
    const [factura, setFactura] = useState(null);  // { key, id, paso?, nota? } — la factura abierta aquí
    const buscadorRef = useRef(null);
    const [toast, avisar] = useAvisoFx();

    const filtro = CHIPS.some(c => c.id === p.f) ? p.f : CHIP_DEFECTO;
    const elegido = CHIPS.some(c => c.id === p.f) && p.f !== CHIP_DEFECTO;

    const cargar = useCallback(async ({ silencioso = false } = {}) => {
        if (silencioso) setRecargando(true);
        try {
            const { data } = await axios.get(API, { params: { estados: ESTADOS.join(',') } });
            setFilas(Array.isArray(data) ? data : []);
            setError(null);
        } catch (err) {
            // Regla 38: lo que ya había se queda; sin datos, ni una cifra.
            setError(errorDeApi(err));
        } finally {
            setCargado(true);
            setRecargando(false);
        }
    }, []);

    useEffect(() => { cargar(); }, [cargar]);

    // La cabecera («+ Nuevo», tecla N) y los enlaces piden abrir por la URL.
    useEffect(() => {
        if (p.nuevo === 'presupuesto') {
            setModal({ key: `nuevo-${Date.now()}` });
            ponerParams({ nuevo: null });
        } else if (p.abrir) {
            setModal({ key: `${p.abrir}-${Date.now()}`, id: p.abrir });
            ponerParams({ abrir: null });
        }
    }, [p.nuevo, p.abrir, ponerParams]);

    const abrir = useCallback((id) => setModal({ key: `${id}-${Date.now()}`, id }), []);

    // «/» = buscar, cuando no se está escribiendo y no hay nada encima.
    useEffect(() => {
        const onKey = (e) => {
            if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
            if (modal || menu || factura || document.querySelector('.fx-capa, .fx-pop')) return;
            if (escribiendo(e.target) || escribiendo(document.activeElement)) return;
            e.preventDefault();
            buscadorRef.current?.focus();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [modal, menu, factura]);

    const nombrePrescriptor = useMemo(() => {
        const m = {};
        for (const x of prescriptores) m[String(x.id_empresa)] = x.acronimo || x.razon_social;
        return m;
    }, [prescriptores]);

    const contadores = useMemo(() => Object.fromEntries(CHIPS.map(c => [c.id, filas.filter(c.test).length])), [filas]);

    const palabras = useMemo(() => normalize(busqueda).split(/\s+/).filter(Boolean), [busqueda]);
    // Una BÚSQUEDA atraviesa el chip por defecto: teclear un número y leer «nada»
    // porque está cerrado es decir que no existe algo que sí existe. Si el chip lo
    // has elegido tú, se respeta. El estado de cada fila dice en qué está.
    const buscaEnTodo = palabras.length > 0 && !elegido;

    const visibles = useMemo(() => {
        const chip = CHIPS.find(c => c.id === (buscaEnTodo ? 'todos' : filtro)) || CHIPS[0];
        return filas
            .filter(chip.test)
            .filter(f => {
                if (!palabras.length) return true;
                const heno = normalize([
                    f.numero, f.cliente_nombre, f.concepto, f.numero_expediente, f.municipio,
                    nombrePrescriptor[String(f.prescriptor_id)], ...(f.facturas || []).map(x => x.numero),
                ].filter(Boolean).join(' '));
                return palabras.every(w => heno.includes(w));
            })
            .sort(ORDEN[buscaEnTodo ? '' : filtro] || ordenDefecto);
    }, [filas, filtro, palabras, buscaEnTodo, nombrePrescriptor]);

    const totales = useMemo(() => ({
        n: visibles.length,
        total: visibles.reduce((s, f) => s + (Number(f.total) || 0), 0),
        neto: visibles.reduce((s, f) => s + (Number(f.neto) || 0), 0),
    }), [visibles]);

    const elegirChip = (id) => { setCuantos(POR_PAGINA); ponerParams({ f: id === CHIP_DEFECTO ? null : id }); };

    // ── Acciones ─────────────────────────────────────────────────────────────

    const textoError = (err, que) => err.response?.data?.error || `No se pudo ${que}.`;

    const verPdf = async (f) => {
        setOcupado(f.id);
        const e = await abrirPdf(`${API}/${f.id}/pdf`, f.numero || 'Presupuesto');
        setOcupado(null);
        if (e) avisar(e, { tono: 'aviso' });
    };

    const copiarEnlace = async (f) => {
        setOcupado(f.id);
        try {
            const { data } = await axios.get(`${API}/${f.id}`);
            const url = data?.url_aceptacion;
            if (!url) { avisar('Todavía no tiene enlace de aceptación: se crea al enviarlo.', { tono: 'aviso' }); return; }
            try {
                await navigator.clipboard.writeText(url);
                avisar(`Enlace de ${f.numero} copiado.`);
            } catch {
                avisar(url, { tono: 'aviso', ms: 0 });   // sin permiso de portapapeles: para copiarlo a mano
            }
        } catch (err) {
            avisar(textoError(err, 'leer el presupuesto'), { tono: 'aviso' });
        } finally { setOcupado(null); }
    };

    const duplicar = async (f) => {
        setOcupado(f.id);
        try {
            const { data } = await axios.post(`${API}/${f.id}/duplicar`);
            cargar({ silencioso: true });
            if (data?.id) {
                avisar(`Duplicado como ${data.numero || 'borrador nuevo'}.`);
                abrir(data.id);
            }
        } catch (err) {
            avisar(textoError(err, 'duplicar'), { tono: 'aviso' });
        } finally { setOcupado(null); }
    };

    const rechazar = async (f) => {
        if (!(await showConfirm(`${f.numero} pasa a «Rechazado»: el cliente ha dicho que no. No se le avisa de nada.`, 'Marcar rechazado', 'warning', { confirmar: 'Marcar rechazado', cancelar: 'No' }))) return;
        setOcupado(f.id);
        try { await axios.post(`${API}/${f.id}/rechazar`); avisar(`${f.numero} marcado como rechazado.`); cargar({ silencioso: true }); }
        catch (err) { avisar(textoError(err, 'marcar como rechazado'), { tono: 'aviso' }); }
        finally { setOcupado(null); }
    };

    const anular = async (f) => {
        if (!(await showConfirm(`El enlace de ${f.numero} dejará de servir para aceptarlo. No se le avisa al cliente.`, 'Anular el presupuesto', 'warning', { confirmar: 'Anular', cancelar: 'No anular' }))) return;
        setOcupado(f.id);
        try { await axios.post(`${API}/${f.id}/anular`); avisar(`${f.numero} anulado.`); cargar({ silencioso: true }); }
        catch (err) { avisar(textoError(err, 'anular'), { tono: 'aviso' }); }
        finally { setOcupado(null); }
    };

    const abrirFactura = (id, opts = {}) => setFactura({ key: `${id}-${Date.now()}`, id, paso: opts.paso || null, nota: opts.nota || null });

    // Facturar un ACEPTADO: el servidor hace el BORRADOR con sus partidas y su
    // cliente (no emite nada) y se abre aquí mismo para revisarlo y emitirlo. Si ya
    // tiene factura, 409: se dice cuál y se pregunta si hacer otra.
    const facturar = async (f) => {
        const pedir = (otraMas) => axios.post(`/api/facturacion/facturas/desde-presupuesto/${f.id}`, otraMas ? { otraMas: true } : {});
        const abrirBorrador = (data) => {
            if (!data?.factura?.id) return;
            cargar({ silencioso: true });
            abrirFactura(data.factura.id, { nota: `Borrador de factura del presupuesto ${f.numero}: sus partidas y su cliente. Revísalo y emítelo.` });
        };
        const fallo = (err) => {
            const m = err.response?.data?.error;
            avisar(/facturas_emitidas|does not exist|schema cache/i.test(String(m || ''))
                ? 'Falta aplicar el esquema de facturas en Supabase (scripts/facturacion_schema.sql).'
                : textoError(err, 'preparar la factura'), { tono: 'aviso' });
        };
        setOcupado(f.id);
        let yaFacturado = null;
        try {
            abrirBorrador((await pedir(false)).data);
        } catch (err) {
            if (err.response?.status === 409) yaFacturado = err.response.data?.error || `El presupuesto ${f.numero} ya tiene factura.`;
            else fallo(err);
        } finally { setOcupado(null); }
        if (!yaFacturado) return;
        const otra = await showConfirm(`${yaFacturado}\n\n¿Hacer OTRA factura de este presupuesto? (p. ej. un segundo pago)`, 'Ya está facturado', 'warning', { confirmar: 'Hacer otra', cancelar: 'No' });
        if (!otra) return;
        setOcupado(f.id);
        try { abrirBorrador((await pedir(true)).data); }
        catch (err) { fallo(err); }
        finally { setOcupado(null); }
    };

    const irAlCee = (e, f) => {
        e?.stopPropagation?.();
        // Con Ctrl/⌘ o la rueda, el navegador abre la pestaña nueva solo.
        if (!onNavigate || e?.ctrlKey || e?.metaKey || e?.shiftKey || e?.button === 1) return;
        e?.preventDefault?.();
        onNavigate('cee-directos', { cee_id: f.cee_directo_id });
    };

    const accionesDe = (f) => {
        const vivo = f.estado === 'BORRADOR' || f.estado === 'ENVIADA';
        const bf = borradorFactura(f);
        return [
            { label: f.estado === 'ANULADA' || f.estado === 'ACEPTADA' || f.estado === 'RECHAZADA' ? 'Abrir' : 'Abrir y editar', icono: 'lapiz', onClick: () => abrir(f.id) },
            { label: 'Ver el PDF', icono: 'pdf', onClick: () => verPdf(f) },
            f.estado === 'ENVIADA' && { label: 'Copiar el enlace de aceptación', icono: 'enlace', onClick: () => copiarEnlace(f) },
            puedeFacturar && f.estado === 'ACEPTADA' && bf && { label: 'Abrir el borrador de factura', icono: 'recibo', onClick: () => abrirFactura(bf.id) },
            puedeFacturar && f.estado === 'ACEPTADA' && !bf && {
                label: facturado(f) ? 'Otra factura de este presupuesto' : 'Facturar', icono: 'recibo', onClick: () => facturar(f),
                detalle: facturado(f) ? `Ya tiene la ${facturadas(f).map(x => x.numero).join(', ')}` : 'Prepara el borrador: no emite nada',
            },
            f.cee_directo_id && { label: `Ir al CEE ${f.numero_expediente || ''}`.trim(), icono: 'carpeta', onClick: () => irAlCee(null, f) },
            { label: 'Duplicar', icono: ICO_EXTRA.copiar, onClick: () => duplicar(f) },
            (f.estado === 'ENVIADA' || vivo) && { sep: true },
            f.estado === 'ENVIADA' && { label: 'Marcar rechazado', icono: 'x', onClick: () => rechazar(f), detalle: 'El cliente ha dicho que no' },
            vivo && { label: 'Anular', icono: 'borrar', peligro: true, onClick: () => anular(f), detalle: 'El enlace deja de servir' },
        ].filter(Boolean);
    };

    /** En el panel de un ACEPTADO, la acción principal: facturarlo, emitir su borrador o abrir su factura. */
    const principalDe = (f) => {
        if (!f || f.estado !== 'ACEPTADA' || !puedeFacturar) return null;
        const cerrarY = (hacer) => () => { setModal(null); hacer(); };
        const fs = facturadas(f).filter(x => x.id);
        if (fs.length) return { etiqueta: `Abrir la factura ${fs[0].numero}`, icono: 'recibo', onClick: cerrarY(() => abrirFactura(fs[0].id)) };
        if (facturado(f)) return null;
        const bf = borradorFactura(f);
        if (bf) return { etiqueta: 'Emitir su factura', icono: 'recibo', onClick: cerrarY(() => abrirFactura(bf.id, { paso: 'emitir' })) };
        return { etiqueta: 'Facturar', icono: 'recibo', onClick: cerrarY(() => facturar(f)) };
    };

    // ── Piezas de cada fila ──────────────────────────────────────────────────

    /** La acción que toca con esta fila, a la vista. */
    const siguiente = (f) => {
        const comun = { type: 'button', disabled: ocupado === f.id, onClick: (e) => e.stopPropagation() };
        if (f.estado === 'BORRADOR') {
            return <button {...comun} className="fx-btn fx-btn-sec fx-btn-peq fx-t-sig" onClick={e => { e.stopPropagation(); abrir(f.id); }}><Ico n="enviar" size={16} />Enviar</button>;
        }
        if (f.estado === 'ENVIADA') {
            const d = diasDesde(f.ultimo_envio?.at);
            if (d != null && d > DIAS_REENVIAR) {
                return <button {...comun} className="fx-btn fx-btn-sec fx-btn-peq fx-t-sig" onClick={e => { e.stopPropagation(); abrir(f.id); }}><Ico n="enviar" size={16} />Reenviar</button>;
            }
            return null;
        }
        if (f.estado === 'ACEPTADA' && !facturado(f)) {
            const bf = borradorFactura(f);
            if (puedeFacturar && bf) {
                return <button {...comun} className="fx-btn fx-btn-sec fx-btn-peq fx-t-sig" onClick={e => { e.stopPropagation(); abrirFactura(bf.id, { paso: 'emitir' }); }}><Ico n="recibo" size={16} />Emitir factura</button>;
            }
            if (puedeFacturar) {
                return (
                    <button {...comun} className="fx-btn fx-btn-sec fx-btn-peq fx-t-sig" onClick={e => { e.stopPropagation(); facturar(f); }}>
                        {ocupado === f.id ? <Ico n="reloj" size={16} className="fx-spin" /> : <Ico n="recibo" size={16} />}Facturar
                    </button>
                );
            }
        }
        return null;
    };

    /** Debajo del estado: cuándo se envió, si lo ha visto, su CEE y su factura. */
    const meta = (f) => {
        const out = [];
        if (f.estado === 'BORRADOR') out.push(<small key="e">sin enviar</small>);
        if (f.estado === 'ENVIADA') {
            const d = diasDesde(f.ultimo_envio?.at);
            if (d != null) out.push(<small key="e">enviado {haceTxt(d)}</small>);
            const v = diasDesde(f.visto_at);
            out.push(v != null
                ? <span key="v" className="fx-visto"><Ico n="check" size={13} sw={3} />visto {haceTxt(v)}</span>
                : <span key="v" className="fx-visto fx-visto-no">no lo ha abierto</span>);
        }
        if (f.estado === 'ACEPTADA' && f.aceptada_at) out.push(<small key="a">aceptado {haceTxt(diasDesde(f.aceptada_at))}</small>);
        if (f.estado === 'RECHAZADA' && f.rechazada_at) out.push(<small key="r">{haceTxt(diasDesde(f.rechazada_at))}</small>);
        if (f.cee_directo_id && f.numero_expediente) {
            out.push(
                <a key="c" className="fx-link-num" href={`/?cee=${encodeURIComponent(f.cee_directo_id)}`} onClick={e => irAlCee(e, f)}
                    title="Abrir el CEE directo">{f.numero_expediente}</a>,
            );
        }
        const fs = facturadas(f);
        if (fs.length) {
            out.push(
                <span key="fx" className="fx-meta-grupo">
                    <small>facturado ·</small>
                    {fs.map(x => (puedeFacturar && x.id ? (
                        <button key={x.numero} type="button" className="fx-link-num" onClick={e => { e.stopPropagation(); abrirFactura(x.id); }}
                            title={x.estado === 'PAGADA' ? 'Cobrada: abrir la factura' : 'Abrir la factura'}>
                            {x.numero}{x.estado === 'PAGADA' ? ' ✓' : ''}<Ico n="derecha" size={12} sw={2.6} />
                        </button>
                    ) : <span key={x.numero} className="fx-link-num fx-mudo">{x.numero}</span>))}
                </span>,
            );
        } else if (borradorFactura(f)) {
            out.push(<small key="bf">factura en borrador</small>);
        }
        return out.length ? <div className="fx-sub-meta">{out}</div> : null;
    };

    const botonMas = (f) => (
        <button type="button" className="fx-ico-btn" aria-label={`Más acciones de ${f.numero || 'este presupuesto'}`} aria-haspopup="menu"
            disabled={ocupado === f.id}
            onClick={e => { e.stopPropagation(); setMenu({ fila: f, anchor: e.currentTarget }); }}>
            {ocupado === f.id ? <Ico n="reloj" size={18} className="fx-spin" /> : <Ico n="mas3" size={20} />}
        </button>
    );

    const teclaFila = (e, f) => { if (e.key === 'Enter' && e.target === e.currentTarget) { e.preventDefault(); abrir(f.id); } };

    // ── Pintar ───────────────────────────────────────────────────────────────

    const chip = CHIPS.find(c => c.id === filtro) || CHIPS[0];
    const pagina = visibles.slice(0, cuantos);
    const sinDatos = !cargado || (error && !filas.length);

    return (
        <section className="fx-card fx-pad fx-lista fx-in" aria-labelledby="fx-presu-tit">
            <div className="fx-lista-cab">
                <div>
                    <div className="fx-eyebrow">Presupuestos</div>
                    <h2 id="fx-presu-tit" className="fx-display fx-h2">{buscaEnTodo ? 'Buscando en todos' : chip.titulo}</h2>
                </div>
                <div className="fx-herr">
                    <label className="fx-buscar">
                        <Ico n="buscar" size={18} />
                        <input ref={buscadorRef} type="search" value={busqueda} className="no-uppercase"
                            onChange={e => { setBusqueda(e.target.value); setCuantos(POR_PAGINA); }}
                            onKeyDown={e => { if (e.key === 'Escape' && busqueda) { e.stopPropagation(); setBusqueda(''); } }}
                            placeholder="Cliente, número, concepto o expediente" aria-label="Buscar presupuestos" />
                        <kbd className="fx-kbd">/</kbd>
                    </label>
                </div>
            </div>

            <div className="fx-chips" role="group" aria-label="Qué presupuestos ver">
                {CHIPS.map(c => (
                    <button key={c.id} type="button" className={`fx-chip-f${c.id === 'por-facturar' && puedeFacturar && contadores[c.id] > 0 && filtro !== c.id ? ' fx-chip-f-alerta' : ''}`}
                        aria-pressed={!buscaEnTodo && filtro === c.id} onClick={() => elegirChip(c.id)}>
                        {c.label}{cargado && !(error && !filas.length) && <b>{contadores[c.id]}</b>}
                    </button>
                ))}
            </div>

            {!sinDatos && (
                <div className="fx-lista-res" aria-live="polite">
                    <span><b>{totales.n}</b> {totales.n === 1 ? 'presupuesto' : 'presupuestos'}</span>
                    <span><b>{eur(totales.total)}</b> con IVA</span>
                    <span>{eur(totales.neto)} de base</span>
                    {buscaEnTodo && <span>· en todos los estados</span>}
                </div>
            )}

            {error && (
                <ErrorApi error={error} que="los presupuestos" onReintentar={() => cargar({ silencioso: true })} className="fx-in" />
            )}

            {!cargado ? (
                <div style={{ display: 'grid', gap: 10, marginTop: 16 }} aria-busy="true" aria-label="Cargando los presupuestos">
                    {[0, 1, 2, 3, 4].map(i => <div key={i} className="fx-sk fx-sk-fila" />)}
                </div>
            ) : error && !filas.length ? null : visibles.length === 0 ? (
                <div className="fx-vacio">
                    <Ico n="recibo" size={30} />
                    <p>
                        {!filas.length ? 'Todavía no hay ningún presupuesto. Créalo con «+ Nuevo» (o la tecla N).'
                            : palabras.length ? `Nada coincide con «${busqueda}»${elegido ? ` en «${chip.label}»` : ''}.`
                                : filtro === 'esperando' ? 'Ningún presupuesto está esperando respuesta.'
                                    : filtro === 'por-facturar' ? 'No hay aceptados sin facturar.'
                                        : 'Nada en este apartado.'}
                    </p>
                    {filas.length > 0 && (palabras.length && elegido ? (
                        <button type="button" className="fx-btn fx-btn-sec" onClick={() => elegirChip('todos')}>Buscar en todos</button>
                    ) : filtro !== 'todos' && !palabras.length ? (
                        <button type="button" className="fx-btn fx-btn-sec" onClick={() => elegirChip('todos')}>Ver todos</button>
                    ) : null)}
                </div>
            ) : (
                <div className={recargando ? 'fx-recargando' : ''}>
                    {/* ── Tabla (PC y tableta) ──────────────────────────── */}
                    <div className="fx-tabla-caja">
                        <table className="fx-tabla">
                            <thead>
                                <tr>
                                    <th scope="col">Nº</th>
                                    <th scope="col" className="fx-col-fecha">Fecha</th>
                                    <th scope="col">Cliente</th>
                                    <th scope="col" className="fx-t-der">Total</th>
                                    <th scope="col">Estado</th>
                                    <th scope="col" className="fx-t-der"><span className="fx-sr">Acciones</span></th>
                                </tr>
                            </thead>
                            <tbody>
                                {pagina.map(f => {
                                    const presc = nombrePrescriptor[String(f.prescriptor_id)];
                                    return (
                                        <tr key={f.id} tabIndex={0} onClick={() => abrir(f.id)} onKeyDown={e => teclaFila(e, f)}
                                            className={`${f.estado === 'ANULADA' ? 'fx-fila-apagada' : ''}${ocupado === f.id ? ' fx-fila-ocupada' : ''}`}
                                            aria-label={`${f.numero || 'Presupuesto'} · ${f.cliente_nombre || 'sin cliente'}`}>
                                            <td>
                                                <span className="fx-nro">{f.numero || '—'}</span>
                                                <div className="fx-t-fecha fx-nro-fecha">{fechaCorta(f.created_at)}</div>
                                            </td>
                                            <td className="fx-t-fecha fx-col-fecha">{fechaCorta(f.created_at)}</td>
                                            <td className="fx-t-cli">
                                                <div className="fx-cli">
                                                    <b>{f.cliente_nombre || '—'}</b>
                                                    <small>{[f.concepto, presc].filter(Boolean).join(' · ') || '—'}</small>
                                                </div>
                                            </td>
                                            <td className="fx-t-imp">{eur(f.total)}<small>{eur(f.neto)} base</small></td>
                                            <td className="fx-t-est">
                                                <ChipPresupuesto estado={f.estado} />
                                                {meta(f)}
                                            </td>
                                            <td className="fx-t-acc" onClick={e => e.stopPropagation()}>
                                                <div>{siguiente(f)}{botonMas(f)}</div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* ── Tarjetas (móvil) ──────────────────────────────── */}
                    <div className="fx-tarjetas">
                        {pagina.map(f => (
                            <article key={f.id} className={`fx-tarjeta${f.estado === 'ANULADA' ? ' fx-fila-apagada' : ''}${ocupado === f.id ? ' fx-fila-ocupada' : ''}`}
                                tabIndex={0} onClick={() => abrir(f.id)} onKeyDown={e => teclaFila(e, f)}
                                aria-label={`${f.numero || 'Presupuesto'} · ${f.cliente_nombre || 'sin cliente'}`}>
                                <div className="fx-tarjeta-top">
                                    <span className="fx-nro">{f.numero || '—'}</span>
                                    <ChipPresupuesto estado={f.estado} />
                                    <span className="fx-t-fecha">{fechaCorta(f.created_at)}</span>
                                </div>
                                <div className="fx-cli">
                                    <b>{f.cliente_nombre || '—'}</b>
                                    {f.concepto && <small>{f.concepto}</small>}
                                </div>
                                <div className="fx-tarjeta-pie">
                                    <div className="fx-tarjeta-izq">
                                        <span className="fx-tarjeta-total">{eur(f.total)}</span>
                                        {meta(f)}
                                    </div>
                                    {siguiente(f)}
                                    {botonMas(f)}
                                </div>
                            </article>
                        ))}
                    </div>

                    {visibles.length > cuantos && (
                        <div className="fx-lista-pie">
                            <span>{cuantos} de {visibles.length}</span>
                            <button type="button" className="fx-btn fx-btn-sec" onClick={() => setCuantos(c => c + POR_PAGINA)}>
                                Ver {Math.min(POR_PAGINA, visibles.length - cuantos)} más
                            </button>
                        </div>
                    )}
                </div>
            )}

            {menu && (
                <MenuAcciones anchor={menu.anchor} titulo={`${menu.fila.numero || ''} · ${menu.fila.cliente_nombre || ''}`}
                    items={accionesDe(menu.fila)} onClose={() => setMenu(null)} />
            )}

            {modal && (
                <PresupuestoModal key={modal.key} isOpen
                    {...(modal.id ? { presupuestoId: modal.id } : {})}
                    principal={principalDe(filas.find(x => x.id === modal.id))}
                    onClose={() => { setModal(null); cargar({ silencioso: true }); }}
                    onSaved={() => cargar({ silencioso: true })}
                    prescriptores={prescriptores} />
            )}

            {factura && (
                <FacturaModal key={factura.key} isOpen facturaId={factura.id} paso={factura.paso} nota={factura.nota}
                    onNavigate={onNavigate}
                    onClose={() => { setFactura(null); cargar({ silencioso: true }); }}
                    onSaved={() => cargar({ silencioso: true })}
                    onAbrir={(id, opts = {}) => abrirFactura(id, opts)} />
            )}

            {toast}
        </section>
    );
}

export default PresupuestosLista;
