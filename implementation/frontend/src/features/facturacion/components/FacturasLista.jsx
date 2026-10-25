import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import axios from 'axios';
import { useModal } from '../../../context/ModalContext';
import { FacturaModal, ChipEstado, EtiquetaOrigen, CobroDialog, RectificarDialog, cobroExterno, hrefOrigen, irAlOrigen, textoOrigen, textoCobroCee } from './FacturaModal';
import { MenuAcciones, useAvisoFx, abrirPdf, ICO_EXTRA } from './PresupuestoModal';
import { SERIES, normalizarTexto } from '../logic/factura';
import { Ico, Importe, eur, ErrorApi, errorDeApi, fechaEs, hoyMadridFx, diasEntreFx, AvisoFx } from '../estilo';
import { useParamsFacturacion } from '../urlFacturacion';

// ─────────────────────────────────────────────────────────────────────────────
// Facturas — el listado de trabajo (solo ADMIN; estilo «carta de pago», .fx-).
//
// Cada fila enseña lo que toca con ella: «Emitir» un borrador, «Enviar» una
// emitida que aún no ha salido, «✓ Cobrada» una pendiente (un toque, con fecha de
// HOY y un aviso con «Deshacer» y «Cambiar fecha»), o «Ir al CEE / al expediente»
// si la emitió otro módulo (se cobra allí, con su candado). Lo demás, en «···».
//
// «Por cobrar» no tiene año: lo que se debe se debe aunque sea de diciembre. Va de
// la más antigua a la más nueva, con «emitida hace N d», y arriba lo que te deben
// en total y por antigüedad (0-30 · 31-60 · 61-90 · más de 90 días). El periodo
// solo sale en Cobradas, Rectificativas y Todas.
//
// Se pide el listado ENTERO una vez (sin año ni serie: son ~cientos de filas sin
// líneas, regla 22) y se filtra aquí. Con la BD caída no se pinta ni un 0,00 €
// (regla 38): el aviso y «Reintentar»; si ya había datos, se quedan.
//
// «Nuevo» y la tecla N están en la cabecera de la pestaña: este listado abre el
// editor cuando llega `nuevo=ING|FML` (o `abrir=<id>`) por la URL y quita el
// parámetro. El periodo va en `t` (AAAA · AAAA-Tn · todo).
// ─────────────────────────────────────────────────────────────────────────────

const API = '/api/facturacion';
const POR_PAGINA = 60;
const ESQUEMA_TXT = 'Falta aplicar el esquema de facturas en Supabase (scripts/facturacion_schema.sql).';
const esErrorEsquema = (m) => /facturas_emitidas|facturacion_emisores|does not exist|schema cache/i.test(String(m || ''));

const clave = (f) => f.visible?.clave || f.estado;
const pendiente = (f) => clave(f) === 'PENDIENTE' || clave(f) === 'VENCIDA';
const t0 = (iso) => { const t = new Date(iso || 0).getTime(); return Number.isFinite(t) ? t : 0; };
const porFechaDesc = (a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')) || t0(b.created_at) - t0(a.created_at);

const CHIPS = [
    { id: 'por-emitir', label: 'Por emitir', titulo: 'Borradores por emitir', test: f => f.estado === 'BORRADOR', orden: (a, b) => t0(b.created_at) - t0(a.created_at) },
    { id: 'por-cobrar', label: 'Por cobrar', titulo: 'Te deben', test: pendiente, orden: (a, b) => String(a.fecha || '').localeCompare(String(b.fecha || '')) },
    { id: 'vencidas', label: 'Vencidas', titulo: 'Vencidas', test: f => clave(f) === 'VENCIDA', orden: (a, b) => String(a.vencimiento || '').localeCompare(String(b.vencimiento || '')) },
    { id: 'cobradas', label: 'Cobradas', titulo: 'Cobradas', test: f => f.estado === 'PAGADA', orden: (a, b) => String(b.fecha_pago || b.fecha || '').localeCompare(String(a.fecha_pago || a.fecha || '')), periodo: f => f.fecha_pago || f.fecha },
    { id: 'rectificativas', label: 'Rectificativas', titulo: 'Rectificativas y rectificadas', test: f => f.estado === 'RECTIFICADA' || (f.tipo && f.tipo !== 'F1'), orden: porFechaDesc, periodo: f => f.fecha },
    { id: 'todas', label: 'Todas', titulo: 'Todas las facturas', test: () => true, orden: porFechaDesc, periodo: f => f.fecha },
];
const CHIP_DEFECTO = 'por-cobrar';

const TRAMOS = [
    { id: 't30', txt: '0-30 días', de: 0, a: 30, color: '#9bbf5a' },
    { id: 't60', txt: '31-60 días', de: 31, a: 60, color: '#f0b13f' },
    { id: 't90', txt: '61-90 días', de: 61, a: 90, color: '#e08a1e', alerta: true },
    { id: 'tmas', txt: 'Más de 90', de: 91, a: Infinity, color: '#b5560c', alerta: true },
];

const COLOR_SERIE = { ING: 'var(--s-ing)', FML: 'var(--s-fml)' };
const TRIM_TXT = ['1.er trimestre', '2.º trimestre', '3.er trimestre', '4.º trimestre'];
const fechaCorta = (iso) => (iso ? fechaEs(String(iso).slice(0, 10)).replace(/\/(\d{2})(\d{2})$/, '/$2') : '');
const dias = (n) => (n === 0 ? 'hoy' : n === 1 ? 'ayer' : `hace ${n} d`);

const escribiendo = (el) => !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

/** ¿Está la fecha en el periodo? `t`: AAAA · AAAA-Tn · todo. */
function enPeriodo(iso, t) {
    if (!t || t === 'todo') return true;
    const s = String(iso || '');
    if (/^\d{4}$/.test(t)) return s.startsWith(t);
    const m = /^(\d{4})-T([1-4])$/.exec(t);
    if (!m) return true;
    const mes = Number(s.slice(5, 7));
    return s.startsWith(m[1]) && Math.ceil(mes / 3) === Number(m[2]);
}
const textoPeriodo = (t) => (!t || t === 'todo' ? 'desde siempre' : /^\d{4}$/.test(t) ? `en ${t}` : `en el ${t.slice(5)} de ${t.slice(0, 4)}`);

/**
 * @param onNavigate el de la app: «Ir al CEE / al expediente» de las facturas que se
 *                   cobran en otro módulo (sin él, el enlace normal `/?cee=` · `/?exp=`)
 */
export function FacturasLista({ onNavigate = null }) {
    const { showConfirm } = useModal();
    const [p, ponerParams] = useParamsFacturacion();
    const [datos, setDatos] = useState(null);           // { facturas, resumen } — null = sin leer
    const [recargando, setRecargando] = useState(false);
    const [error, setError] = useState(null);
    const [busqueda, setBusqueda] = useState('');
    const [cuantos, setCuantos] = useState(POR_PAGINA);
    // { key, id?, inicial?, paso?, nota? } — sin id es una nueva. La `key` remonta el editor.
    const [editor, setEditor] = useState(null);
    const [menu, setMenu] = useState(null);             // { fila, anchor }
    const [dialogo, setDialogo] = useState(null);       // { tipo: 'cobro'|'rectificar', fila }
    const [ocupado, setOcupado] = useState(null);       // id de la fila con una acción en marcha
    const buscadorRef = useRef(null);
    const [toast, avisar] = useAvisoFx();
    const hoy = hoyMadridFx();
    const anioActual = hoy.slice(0, 4);

    const filtro = CHIPS.some(c => c.id === p.f) ? p.f : CHIP_DEFECTO;
    const elegido = CHIPS.some(c => c.id === p.f) && p.f !== CHIP_DEFECTO;
    const serie = SERIES[p.serie] ? p.serie : null;
    const periodo = p.t && (p.t === 'todo' || /^\d{4}(-T[1-4])?$/.test(p.t)) ? p.t : anioActual;

    const cargar = useCallback(async () => {
        setRecargando(true);
        try {
            const { data } = await axios.get(`${API}/facturas`);
            setDatos({ facturas: Array.isArray(data?.facturas) ? data.facturas : [], resumen: data?.resumen || null });
            setError(null);
        } catch (err) {
            const e = errorDeApi(err);
            setError(esErrorEsquema(e.texto) ? { status: 500, texto: ESQUEMA_TXT } : e);
        } finally {
            setRecargando(false);
        }
    }, []);

    useEffect(() => { cargar(); }, [cargar]);

    // La cabecera («+ Nuevo ▾», tecla N) y los enlaces piden abrir por la URL.
    useEffect(() => {
        if (SERIES[p.nuevo]) {
            setEditor({ key: `nueva-${Date.now()}`, inicial: { serie: p.nuevo } });
            ponerParams({ nuevo: null });
        } else if (p.abrir) {
            setEditor({ key: `${p.abrir}-${Date.now()}`, id: p.abrir });
            ponerParams({ abrir: null });
        }
    }, [p.nuevo, p.abrir, ponerParams]);

    const abrir = useCallback((id, opts = {}) => setEditor({ key: `${id}-${Date.now()}`, id, paso: opts.paso || null, nota: opts.nota || null }), []);

    // «/» = buscar, cuando no se está escribiendo y no hay nada encima.
    useEffect(() => {
        const onKey = (e) => {
            if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
            if (editor || menu || dialogo || document.querySelector('.fx-capa, .fx-pop')) return;
            if (escribiendo(e.target) || escribiendo(document.activeElement)) return;
            e.preventDefault();
            buscadorRef.current?.focus();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [editor, menu, dialogo]);

    const todas = useMemo(() => datos?.facturas || [], [datos]);
    const deSerie = useMemo(() => (serie ? todas.filter(f => f.serie === serie) : todas), [todas, serie]);

    const palabras = useMemo(() => normalizarTexto(busqueda).split(/\s+/).filter(Boolean), [busqueda]);
    // Una BÚSQUEDA atraviesa el chip por defecto y el periodo: un número que no sale
    // «porque es de otro año» parece que no existe. Si el chip lo has elegido tú, se respeta.
    const buscaEnTodo = palabras.length > 0 && !elegido;
    const chip = CHIPS.find(c => c.id === (buscaEnTodo ? 'todas' : filtro)) || CHIPS[1];
    const conPeriodo = !!chip.periodo && !buscaEnTodo;

    const contadores = useMemo(() => Object.fromEntries(CHIPS.map(c => [
        c.id, deSerie.filter(f => c.test(f) && (!c.periodo || enPeriodo(c.periodo(f), periodo))).length,
    ])), [deSerie, periodo]);

    const visibles = useMemo(() => deSerie
        .filter(chip.test)
        .filter(f => !conPeriodo || enPeriodo(chip.periodo(f), periodo))
        .filter(f => {
            if (!palabras.length) return true;
            const heno = normalizarTexto([f.numero, f.cliente_nombre, f.cliente_nif, f.concepto, f.expediente, f.rectifica_numero].filter(Boolean).join(' '));
            return palabras.every(w => heno.includes(w));
        })
        .sort(chip.orden), [deSerie, chip, conPeriodo, periodo, palabras]);

    // Lo que te deben: se cuenta sobre las mismas filas que se enseñan (por la serie
    // elegida), por antigüedad desde la fecha de la factura.
    const deben = useMemo(() => {
        const pend = deSerie.filter(pendiente);
        const tramos = TRAMOS.map(t => ({ ...t, n: 0, total: 0 }));
        let total = 0, vencido = 0, nVencidas = 0, masAntigua = 0;
        for (const f of pend) {
            const d = Math.max(0, diasEntreFx(String(f.fecha || hoy).slice(0, 10), hoy) || 0);
            const tr = tramos.find(t => d >= t.de && d <= t.a) || tramos[tramos.length - 1];
            tr.n++; tr.total += Number(f.total) || 0;
            total += Number(f.total) || 0;
            if (clave(f) === 'VENCIDA') { vencido += Number(f.total) || 0; nVencidas++; }
            masAntigua = Math.max(masAntigua, d);
        }
        return { n: pend.length, total: Math.round(total * 100) / 100, vencido: Math.round(vencido * 100) / 100, nVencidas, masAntigua, tramos };
    }, [deSerie, hoy]);

    const anios = useMemo(() => {
        const s = new Set([anioActual]);
        for (const f of todas) if (/^\d{4}/.test(String(f.fecha || ''))) s.add(String(f.fecha).slice(0, 4));
        return [...s].sort().reverse();
    }, [todas, anioActual]);

    const sumaVisibles = useMemo(() => visibles.filter(f => f.estado !== 'BORRADOR').reduce((s, f) => s + (Number(f.total) || 0), 0), [visibles]);

    const ponerFiltro = (cambios) => { setCuantos(POR_PAGINA); ponerParams(cambios); };
    const elegirChip = (id) => ponerFiltro({ f: id === CHIP_DEFECTO ? null : id });

    // ── Acciones ─────────────────────────────────────────────────────────────

    const textoError = (err, que) => err.response?.data?.error || (err.response ? `No se pudo ${que}.` : 'No hay conexión con el servidor.');

    /** Pone la fila como queda tras una acción, sin esperar a releer la lista. */
    const parchear = (id, cambios) => setDatos(d => (d ? { ...d, facturas: d.facturas.map(f => (f.id === id ? { ...f, ...cambios } : f)) } : d));

    const deshacerCobro = async (f) => {
        setOcupado(f.id);
        try {
            const { data } = await axios.post(`${API}/facturas/${f.id}/cobro`, { pagada: false });
            parchear(f.id, { estado: 'EMITIDA', fecha_pago: null, visible: f.visible });
            avisar(data?.avisoHoja ? `Cobro deshecho. ${data.avisoHoja}` : `${f.numero} vuelve a «pendiente de cobro».`, { tono: data?.avisoHoja ? 'aviso' : 'ok' });
            cargar();
        } catch (err) {
            avisar(textoError(err, 'deshacer el cobro'), { tono: 'aviso' });
        } finally { setOcupado(null); }
    };

    /** «✓ Cobrada» de la fila: con fecha de HOY, sin preguntar; el aviso deja deshacerlo o cambiar la fecha. */
    const cobrarHoy = async (f) => {
        setOcupado(f.id);
        try {
            const { data } = await axios.post(`${API}/facturas/${f.id}/cobro`, { pagada: true, fecha: hoy });
            const fecha = data?.fecha_pago || hoy;
            const cobrada = { ...f, estado: 'PAGADA', fecha_pago: fecha, visible: { clave: 'PAGADA', texto: 'Cobrada' } };
            parchear(f.id, { estado: 'PAGADA', fecha_pago: fecha, visible: cobrada.visible });
            avisar(`${f.numero} · ${eur(f.total)}: cobrada hoy.${data?.avisoHoja ? ` ${data.avisoHoja}` : ''}${textoCobroCee(data)}`, {
                tono: data?.avisoHoja ? 'aviso' : 'ok',
                acciones: [
                    { label: 'Cambiar fecha', onClick: () => setDialogo({ tipo: 'cobro', fila: cobrada }) },
                    { label: 'Deshacer', onClick: () => deshacerCobro(f) },
                ],
            });
            cargar();
        } catch (err) {
            avisar(textoError(err, 'marcarla cobrada'), { tono: 'aviso' });
        } finally { setOcupado(null); }
    };

    const verPdf = async (f) => {
        setOcupado(f.id);
        const e = await abrirPdf(`${API}/facturas/${f.id}/pdf`, f.numero || 'Factura');
        setOcupado(null);
        if (e) avisar(e, { tono: 'aviso' });
    };

    const duplicar = async (f) => {
        setOcupado(f.id);
        try {
            const { data } = await axios.post(`${API}/facturas/${f.id}/duplicar`);
            cargar();
            if (data?.factura?.id) abrir(data.factura.id, { nota: `Copia de ${f.numero || 'un borrador'}: borrador nuevo con fecha de hoy y el mes del concepto avanzado. Revísalo y emítelo.` });
        } catch (err) {
            avisar(textoError(err, 'duplicar'), { tono: 'aviso' });
        } finally { setOcupado(null); }
    };

    const borrar = async (f) => {
        if (!(await showConfirm('El borrador se borra del todo. No tiene número, así que no deja hueco en la serie.', 'Borrar el borrador', 'warning', { confirmar: 'Borrar', cancelar: 'No borrar' }))) return;
        setOcupado(f.id);
        try {
            await axios.delete(`${API}/facturas/${f.id}`);
            avisar('Borrador borrado.');
            cargar();
        } catch (err) {
            avisar(textoError(err, 'borrar el borrador'), { tono: 'aviso' });
        } finally { setOcupado(null); }
    };

    const accionesDe = (f) => {
        const borrador = f.estado === 'BORRADOR';
        const externo = cobroExterno(f);
        const app = !f.origen || f.origen === 'APP';
        const cobrable = !externo && pendiente(f) && Number(f.total) > 0;
        return [
            { label: borrador ? 'Abrir y editar' : 'Abrir', icono: 'lapiz', onClick: () => abrir(f.id) },
            borrador && { label: 'Emitir…', icono: 'recibo', onClick: () => abrir(f.id, { paso: 'emitir' }), detalle: 'Le pone el número; antes se pregunta' },
            !borrador && { label: 'Ver el PDF', icono: 'pdf', onClick: () => verPdf(f) },
            !borrador && app && f.estado !== 'RECTIFICADA' && { label: f.enviada_at ? 'Reenviar al cliente…' : 'Enviar al cliente…', icono: 'enviar', onClick: () => abrir(f.id, { paso: 'envio' }) },
            cobrable && { label: 'Cobrada otro día…', icono: 'calendario', onClick: () => setDialogo({ tipo: 'cobro', fila: f }) },
            !externo && f.estado === 'PAGADA' && { label: 'Cambiar la fecha del cobro', icono: 'calendario', onClick: () => setDialogo({ tipo: 'cobro', fila: f }) },
            !externo && f.estado === 'PAGADA' && { label: 'Deshacer el cobro', icono: ICO_EXTRA.deshacer, onClick: () => deshacerCobro(f) },
            externo && hrefOrigen(f) && { label: textoOrigen(f), icono: 'carpeta', detalle: externo, onClick: () => irAlOrigen(f, onNavigate) },
            { sep: true },
            ['EMITIDA', 'PAGADA'].includes(f.estado) && (f.tipo || 'F1') === 'F1' && { label: 'Rectificar…', icono: 'rect', onClick: () => setDialogo({ tipo: 'rectificar', fila: f }), detalle: 'Una emitida no se cambia: se rectifica' },
            { label: 'Duplicar', icono: ICO_EXTRA.copiar, onClick: () => duplicar(f) },
            borrador && { label: 'Borrar el borrador', icono: 'borrar', peligro: true, onClick: () => borrar(f) },
        ].filter(Boolean);
    };

    // ── Piezas de cada fila ──────────────────────────────────────────────────

    /** La acción que toca con esta fila, a la vista. */
    const siguiente = (f) => {
        const ocup = ocupado === f.id;
        const para = (fn) => (e) => { e.stopPropagation(); fn(); };
        if (f.estado === 'BORRADOR') {
            return <button type="button" className="fx-btn fx-btn-sec fx-btn-peq fx-t-sig" disabled={ocup} onClick={para(() => abrir(f.id, { paso: 'emitir' }))}><Ico n="recibo" size={16} />Emitir</button>;
        }
        const externo = cobroExterno(f);
        if (externo && pendiente(f)) {
            const href = hrefOrigen(f);
            if (!href) return null;
            return (
                <a className="fx-btn fx-btn-sec fx-btn-peq fx-t-sig" href={href} title={externo}
                    onClick={e => { e.stopPropagation(); irAlOrigen(f, onNavigate, e); }}>
                    {textoOrigen(f)}<Ico n="derecha" size={15} />
                </a>
            );
        }
        const app = !f.origen || f.origen === 'APP';
        if (app && !f.enviada_at && f.estado !== 'RECTIFICADA' && (pendiente(f) || clave(f) === 'EMITIDA')) {
            return <button type="button" className="fx-btn fx-btn-sec fx-btn-peq fx-t-sig" disabled={ocup} onClick={para(() => abrir(f.id, { paso: 'envio' }))}><Ico n="enviar" size={16} />Enviar</button>;
        }
        if (pendiente(f) && Number(f.total) > 0) {
            return (
                <button type="button" className="fx-btn fx-btn-ok fx-btn-peq fx-t-sig" disabled={ocup} onClick={para(() => cobrarHoy(f))}
                    title="Con fecha de hoy. Luego se puede deshacer o cambiar la fecha.">
                    {ocup ? <Ico n="reloj" size={16} className="fx-spin" /> : <Ico n="check" size={16} sw={2.8} />}Cobrada
                </button>
            );
        }
        return null;
    };

    /** El número (o «Borrador»), con el punto de su serie. */
    const numeroDe = (f) => (
        <span className={`fx-nro${f.numero ? '' : ' fx-nro-borr'}`}>
            <span className="fx-dot" style={{ '--c': COLOR_SERIE[f.serie] }} aria-hidden="true" />
            {f.numero || `Borrador ${f.serie || ''}`}
        </span>
    );

    /** Cuándo vence, cuándo se cobró, desde cuándo se debe. */
    const cobroDe = (f) => {
        const k = clave(f);
        if (k === 'BORRADOR') return <span className="fx-cobro">sin número</span>;
        if (k === 'PAGADA') return <span className="fx-cobro fx-cobro-ok">cobrada {fechaCorta(f.fecha_pago)}</span>;
        if (k === 'RECTIFICADA') return <span className="fx-cobro">rectificada</span>;
        if (!pendiente(f)) return <span className="fx-cobro">—</span>;
        const emitida = Math.max(0, diasEntreFx(String(f.fecha).slice(0, 10), hoy) || 0);
        if (k === 'VENCIDA') {
            const v = Math.max(0, diasEntreFx(String(f.vencimiento).slice(0, 10), hoy) || 0);
            return <span className="fx-cobro fx-cobro-vence">venció {dias(v)}<small>emitida {dias(emitida)}</small></span>;
        }
        return <span className="fx-cobro">emitida {dias(emitida)}{f.vencimiento ? <small>vence el {fechaCorta(f.vencimiento)}</small> : null}</span>;
    };

    const botonMas = (f) => (
        <button type="button" className="fx-ico-btn" aria-label={`Más acciones de ${f.numero || 'este borrador'}`} aria-haspopup="menu"
            disabled={ocupado === f.id} onClick={e => { e.stopPropagation(); setMenu({ fila: f, anchor: e.currentTarget }); }}>
            <Ico n="mas3" size={20} />
        </button>
    );

    const teclaFila = (e, f) => { if (e.key === 'Enter' && e.target === e.currentTarget) { e.preventDefault(); abrir(f.id); } };

    // ── Pintar ───────────────────────────────────────────────────────────────

    const pagina = visibles.slice(0, cuantos);
    const sinDatos = !datos;
    const enPorCobrar = !buscaEnTodo && filtro === 'por-cobrar';
    const verVencidas = !buscaEnTodo && !['por-cobrar', 'vencidas'].includes(filtro) && deben.nVencidas > 0;

    const opcionesPeriodo = [
        ...anios.flatMap(a => [
            { v: a, t: a === anioActual ? `Este año (${a})` : a },
            ...(a === anioActual ? [1, 2, 3, 4].filter(q => q <= Math.ceil(Number(hoy.slice(5, 7)) / 3)).map(q => ({ v: `${a}-T${q}`, t: `${TRIM_TXT[q - 1]} de ${a}` })) : []),
        ]),
        { v: 'todo', t: 'Desde siempre' },
    ];

    return (
        <section className="fx-card fx-pad fx-lista fx-in" aria-labelledby="fx-fact-tit">
            <div className="fx-lista-cab">
                <div>
                    <div className="fx-eyebrow">Facturas{serie ? ` · ${serie}` : ''}</div>
                    <h2 id="fx-fact-tit" className="fx-display fx-h2">{buscaEnTodo ? 'Buscando en todas' : chip.titulo}</h2>
                </div>
                <div className="fx-herr">
                    <label className="fx-buscar">
                        <Ico n="buscar" size={18} />
                        <input ref={buscadorRef} type="search" value={busqueda} className="no-uppercase"
                            onChange={e => { setBusqueda(e.target.value); setCuantos(POR_PAGINA); }}
                            onKeyDown={e => { if (e.key === 'Escape' && busqueda) { e.stopPropagation(); setBusqueda(''); } }}
                            placeholder="Número, cliente, NIF, concepto o expediente" aria-label="Buscar facturas" />
                        <kbd className="fx-kbd">/</kbd>
                    </label>
                    {conPeriodo && (
                        <select className="fx-select fx-select-peq" value={periodo} aria-label="Periodo"
                            onChange={e => ponerFiltro({ t: e.target.value === anioActual ? null : e.target.value })}>
                            {opcionesPeriodo.map(o => <option key={o.v} value={o.v}>{o.t}</option>)}
                        </select>
                    )}
                </div>
            </div>

            <div className="fx-lista-filtros">
                <div className="fx-chips" role="group" aria-label="Qué facturas ver">
                    {CHIPS.map(c => (
                        <button key={c.id} type="button"
                            className={`fx-chip-f${filtro !== c.id && contadores[c.id] > 0 && (c.id === 'vencidas' || c.id === 'por-emitir') ? ' fx-chip-f-alerta' : ''}`}
                            aria-pressed={!buscaEnTodo && filtro === c.id} onClick={() => elegirChip(c.id)}>
                            {c.label}{!sinDatos && <b>{contadores[c.id]}</b>}
                        </button>
                    ))}
                    <span className="fx-chip-sep" aria-hidden="true" />
                    {Object.keys(SERIES).map(s => (
                        <button key={s} type="button" className="fx-chip-f" aria-pressed={serie === s}
                            title={`${s} · ${SERIES[s].nombre}`} onClick={() => ponerFiltro({ serie: serie === s ? null : s })}>
                            <span className="fx-dot" style={{ '--c': COLOR_SERIE[s] }} aria-hidden="true" />{s}
                        </button>
                    ))}
                </div>
            </div>

            {error && <ErrorApi error={error} que="las facturas" onReintentar={cargar} />}

            {/* «Te deben»: solo con datos (con la BD caída, ni un 0,00 €) */}
            {enPorCobrar && !sinDatos && deben.n > 0 && (
                <div className="fx-deben" aria-label="Lo que te deben, por antigüedad">
                    <div className="fx-deben-top">
                        <Importe n={deben.total} />
                        <p>
                            <b>{deben.n} {deben.n === 1 ? 'factura' : 'facturas'}</b> sin cobrar{serie ? ` de la serie ${serie}` : ''}
                            {deben.nVencidas > 0 && <> · <b>{eur(deben.vencido)} vencido</b> en {deben.nVencidas}</>}
                            {' '}· la más antigua, emitida {dias(deben.masAntigua)}
                        </p>
                    </div>
                    <div className="fx-tramos-barra" aria-hidden="true">
                        {deben.tramos.filter(t => t.total > 0).map(t => (
                            <i key={t.id} style={{ width: `${(t.total / deben.total) * 100}%`, background: t.color }} />
                        ))}
                    </div>
                    <div className="fx-tramos">
                        {deben.tramos.map(t => (
                            <div key={t.id} className={`fx-tramo${t.alerta && t.n ? ' fx-tramo-alerta' : ''}`}>
                                <span><i className="fx-dot" style={{ '--c': t.color }} />{t.txt}</span>
                                <b>{eur(t.total)}</b>
                                <small>{t.n ? `${t.n} ${t.n === 1 ? 'factura' : 'facturas'}` : 'ninguna'}</small>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {verVencidas && !sinDatos && (
                <AvisoFx tono="vence" style={{ marginTop: 12 }}
                    accion={<button type="button" className="fx-btn fx-btn-sec fx-btn-peq" onClick={() => elegirChip('vencidas')}>Ver las vencidas</button>}>
                    <b>{deben.nVencidas} {deben.nVencidas === 1 ? 'factura vencida' : 'facturas vencidas'}</b> · {eur(deben.vencido)} sin cobrar{serie ? ` (${serie})` : ''}.
                </AvisoFx>
            )}

            {!sinDatos && visibles.length > 0 && !enPorCobrar && (
                <div className="fx-lista-res" aria-live="polite">
                    <span><b>{visibles.length}</b> {visibles.length === 1 ? 'factura' : 'facturas'}{conPeriodo ? ` ${textoPeriodo(periodo)}` : ''}</span>
                    {filtro !== 'por-emitir' && <span><b>{eur(sumaVisibles)}</b> emitido</span>}
                    {buscaEnTodo && <span>· en todas y desde siempre</span>}
                </div>
            )}

            {sinDatos && !error ? (
                <div style={{ display: 'grid', gap: 10, marginTop: 16 }} aria-busy="true" aria-label="Cargando las facturas">
                    {[0, 1, 2, 3, 4].map(i => <div key={i} className="fx-sk fx-sk-fila" />)}
                </div>
            ) : sinDatos ? null : visibles.length === 0 ? (
                <div className="fx-vacio">
                    <Ico n={filtro === 'por-cobrar' ? 'check' : 'recibo'} size={30} />
                    <p>
                        {!todas.length ? 'Todavía no hay ninguna factura. Créala con «+ Nuevo» (o la tecla N), o importa el libro de AppSheet desde ⚙ Ajustes.'
                            : palabras.length ? `Nada coincide con «${busqueda}»${elegido ? ` en «${chip.label}»` : ''}.`
                                : filtro === 'por-cobrar' ? `Nadie te debe nada${serie ? ` en la serie ${serie}` : ''}.`
                                    : filtro === 'vencidas' ? 'Ninguna factura vencida.'
                                        : filtro === 'por-emitir' ? 'No hay borradores por emitir.'
                                            : `Ninguna ${textoPeriodo(periodo)}.`}
                    </p>
                    {todas.length > 0 && (palabras.length && elegido ? (
                        <button type="button" className="fx-btn fx-btn-sec" onClick={() => elegirChip('todas')}>Buscar en todas</button>
                    ) : conPeriodo && periodo !== 'todo' ? (
                        <button type="button" className="fx-btn fx-btn-sec" onClick={() => ponerFiltro({ t: 'todo' })}>Ver desde siempre</button>
                    ) : filtro !== 'todas' && !palabras.length ? (
                        <button type="button" className="fx-btn fx-btn-sec" onClick={() => elegirChip('todas')}>Ver todas</button>
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
                                    <th scope="col" className="fx-col-cobro">Cobro</th>
                                    <th scope="col" className="fx-t-der"><span className="fx-sr">Acciones</span></th>
                                </tr>
                            </thead>
                            <tbody>
                                {pagina.map(f => (
                                    <tr key={f.id} tabIndex={0} onClick={() => abrir(f.id)} onKeyDown={e => teclaFila(e, f)}
                                        className={`${f.estado === 'RECTIFICADA' ? 'fx-fila-apagada' : ''}${ocupado === f.id ? ' fx-fila-ocupada' : ''}`}
                                        aria-label={`${f.numero || 'Borrador'} · ${f.cliente_nombre || 'sin cliente'}`}>
                                        <td>
                                            {numeroDe(f)}
                                            <div className="fx-t-fecha fx-nro-fecha">{fechaCorta(f.fecha)}</div>
                                        </td>
                                        <td className="fx-t-fecha fx-col-fecha">{fechaCorta(f.fecha)}</td>
                                        <td className="fx-t-cli">
                                            <div className="fx-cli">
                                                <b>{f.cliente_nombre || '—'}</b>
                                                <small>{[f.tipo && f.tipo !== 'F1' ? `${f.tipo} de ${f.rectifica_numero || '—'}` : null, f.concepto, f.expediente].filter(Boolean).join(' · ') || '—'}</small>
                                            </div>
                                        </td>
                                        <td className="fx-t-imp">{eur(f.total)}{Number(f.irpf) ? <small>con −{eur(f.irpf)} IRPF</small> : null}</td>
                                        <td>
                                            <ChipEstado factura={f} />
                                            {/* El origen solo cuando cambia dónde se cobra (lo importado de AppSheet es casi todo: sería ruido) */}
                                            {cobroExterno(f) && <div style={{ marginTop: 4 }}><EtiquetaOrigen origen={f.origen} /></div>}
                                            <div className="fx-cobro-bajo">{cobroDe(f)}</div>
                                        </td>
                                        <td className="fx-col-cobro">{cobroDe(f)}</td>
                                        <td className="fx-t-acc" onClick={e => e.stopPropagation()}>
                                            <div>{siguiente(f)}{botonMas(f)}</div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* ── Tarjetas (móvil) ──────────────────────────────── */}
                    <div className="fx-tarjetas">
                        {pagina.map(f => (
                            <article key={f.id} className={`fx-tarjeta${f.estado === 'RECTIFICADA' ? ' fx-fila-apagada' : ''}${ocupado === f.id ? ' fx-fila-ocupada' : ''}`}
                                tabIndex={0} onClick={() => abrir(f.id)} onKeyDown={e => teclaFila(e, f)}
                                aria-label={`${f.numero || 'Borrador'} · ${f.cliente_nombre || 'sin cliente'}`}>
                                <div className="fx-tarjeta-top">
                                    {numeroDe(f)}
                                    <ChipEstado factura={f} />
                                    <span className="fx-t-fecha">{fechaCorta(f.fecha)}</span>
                                </div>
                                <div className="fx-cli">
                                    <b>{f.cliente_nombre || '—'}</b>
                                    {(f.concepto || f.rectifica_numero) && <small>{[f.tipo && f.tipo !== 'F1' ? `${f.tipo} de ${f.rectifica_numero || '—'}` : null, f.concepto].filter(Boolean).join(' · ')}</small>}
                                </div>
                                <div className="fx-tarjeta-pie">
                                    <div className="fx-tarjeta-izq">
                                        <span className="fx-tarjeta-total">{eur(f.total)}</span>
                                        {cobroDe(f)}
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
                <MenuAcciones anchor={menu.anchor} titulo={`${menu.fila.numero || 'Borrador'} · ${menu.fila.cliente_nombre || ''}`}
                    items={accionesDe(menu.fila)} onClose={() => setMenu(null)} />
            )}

            {dialogo?.tipo === 'cobro' && (
                <CobroDialog factura={dialogo.fila} onClose={() => setDialogo(null)}
                    onHecho={(r) => {
                        const f = dialogo.fila;
                        setDialogo(null);
                        parchear(f.id, { estado: 'PAGADA', fecha_pago: r?.fecha_pago || f.fecha_pago, visible: { clave: 'PAGADA', texto: 'Cobrada' } });
                        avisar((r?.avisoHoja ? `${f.numero}: cobrada. ${r.avisoHoja}` : `${f.numero}: cobrada el ${fechaEs(String(r?.fecha_pago || '').slice(0, 10))}.`) + textoCobroCee(r), { tono: r?.avisoHoja ? 'aviso' : 'ok' });
                        cargar();
                    }} />
            )}
            {dialogo?.tipo === 'rectificar' && (
                <RectificarDialog factura={dialogo.fila} onClose={() => setDialogo(null)}
                    onHecho={(nueva, { parcial }) => {
                        const f = dialogo.fila;
                        setDialogo(null);
                        cargar();
                        abrir(nueva.id, {
                            nota: parcial
                                ? `Rectificación parcial de ${f.numero}: el borrador lleva solo las partidas marcadas, en negativo. Revisa los importes y emítela.`
                                : `Rectificativa de ${f.numero}: anula la factura entera. Revísala y emítela; al emitirla, ${f.numero} queda «Rectificada».`,
                        });
                    }} />
            )}

            {editor && (
                <FacturaModal key={editor.key} isOpen facturaId={editor.id || null} inicial={editor.inicial || null}
                    paso={editor.paso || null} nota={editor.nota || null} onNavigate={onNavigate}
                    onClose={() => { setEditor(null); cargar(); }}
                    onSaved={() => cargar()}
                    onAbrir={(id, opts = {}) => abrir(id, opts)} />
            )}

            {toast}
        </section>
    );
}

export default FacturasLista;
