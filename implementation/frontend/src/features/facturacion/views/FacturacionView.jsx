import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { useAuth } from '../../../context/AuthContext';
import { getRoleFlags } from '../../../utils/roleFlags';
import { PresupuestosLista } from '../components/PresupuestosLista';
import { ArticulosCatalogo } from '../components/ArticulosCatalogo';
import { FacturasLista } from '../components/FacturasLista';
import { CuadroMando } from '../components/hoy/CuadroMando';
import { TrimestresVista } from '../components/trimestres/TrimestresVista';
import { AjustesFacturacion } from '../components/AjustesFacturacion';
import { CSS, Ico, leerLocal, guardarLocal, errorDeApi, hoyMadridFx } from '../estilo';
import { CSS_LISTAS } from '../estiloListas';
import { useParamsFacturacion, ponerParams, leerParams } from '../urlFacturacion';

// ─────────────────────────────────────────────────────────────────────────────
// Facturación — el ARMAZÓN de la pestaña, en el estilo «carta de pago» (regla 164: la
// única pantalla del CRM en crema; el menú lateral sigue oscuro). Prefijo `.fx-`, sin
// Tailwind dentro. Ver docs/conocimiento/facturacion/cuadro-de-mando-y-trimestres-en-pantalla.md
//
//   Hoy · Presupuestos · Facturas · Trimestres · Artículos
//
// - El ADMIN abre en «Hoy» (el cuadro de mando) y lo ve todo. El TRABAJADOR ve Presupuestos
//   y Artículos, y abre en Presupuestos: las facturas y lo fiscal son importes de BROKERGY.
// - Todo lo que se ve vive en la URL (`sub`, `f`, `serie`, `t`, `nuevo`, `abrir`; contrato en
//   urlFacturacion.js): un KPI que se pulsa deja el listado filtrado, y cualquier vista se
//   puede pegar en un WhatsApp. Al salir de la pestaña se limpian esos parámetros.
// - La última subpestaña se recuerda en localStorage (una comodidad: puede fallar).
// - «+ Nuevo ▾» (tecla N): Presupuesto · Factura ING · Factura FML. El listado de destino
//   abre su editor en blanco al ver `nuevo` y quita el parámetro.
// ─────────────────────────────────────────────────────────────────────────────

const TODAS = [
    { id: 'hoy', label: 'Hoy', admin: true },
    { id: 'presupuestos', label: 'Presupuestos' },
    { id: 'facturas', label: 'Facturas', admin: true },
    { id: 'trimestres', label: 'Trimestres', admin: true },
    { id: 'articulos', label: 'Artículos' },
];
const PARAMS = ['sub', 'f', 'serie', 't', 'nuevo', 'abrir'];
const CLAVE_SUB = 'fx-sub';

const escribiendo = (el) => !!el?.closest?.('input, textarea, select, [contenteditable="true"], [contenteditable=""]');
const nombreDePila = (u) => {
    const n = String(u?.nombre || u?.email || '').trim().split(/[\s@.]+/)[0] || '';
    return n ? n.charAt(0).toUpperCase() + n.slice(1).toLowerCase() : '';
};
const fechaLarga = () => new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', timeZone: 'Europe/Madrid' }).format(new Date());

/**
 * El cuadro de mando vive aquí (y no en «Hoy») para no pedirlo otra vez al volver de otra
 * subpestaña y para poner los contadores en las pestañas. Solo se pide si se ha entrado en «Hoy».
 * El año anterior se pide aparte, sin esperar, solo para la marca fina del gráfico.
 */
function useCuadro(activo, anio) {
    const [st, setSt] = useState({ datos: null, anio: null, error: null, cargando: false, prev: null });
    const pedido = useRef(0);
    const cargar = useCallback(async (a) => {
        const n = ++pedido.current;
        setSt(s => ({ ...s, cargando: true, error: null }));
        try {
            const { data } = await axios.get('/api/facturacion/cuadro', { params: { anio: a } });
            if (n !== pedido.current) return;
            setSt(s => ({ ...s, datos: data, anio: a, error: null, cargando: false, prev: s.prev?.anio === a - 1 ? s.prev : null }));
            if (a - 1 >= 2020) {
                axios.get('/api/facturacion/cuadro', { params: { anio: a - 1 } })
                    .then(r => { if (n === pedido.current) setSt(s => ({ ...s, prev: { anio: a - 1, meses: r.data?.ventas?.meses || null } })); })
                    .catch(() => { /* sin la marca de 2025: el gráfico sale igual */ });
            }
        } catch (err) {
            if (n !== pedido.current) return;
            // Regla 38: si falla, NUNCA cifras de otro año ni un cero; las del mismo año se quedan.
            setSt(s => ({ ...s, cargando: false, error: errorDeApi(err), datos: s.anio === a ? s.datos : null, anio: s.anio === a ? s.anio : null }));
        }
    }, []);
    // Una vez por año (y al volver a «Hoy» no se repite). Si falla, NO se reintenta solo: lo
    // hace el botón «Reintentar» (un bucle de reintentos contra una BD caída la remata).
    const pedidoAnio = useRef(null);
    useEffect(() => {
        if (!activo || pedidoAnio.current === anio) return;
        const t = setTimeout(() => { pedidoAnio.current = anio; cargar(anio); }, 0);
        return () => clearTimeout(t);
    }, [activo, anio, cargar]);
    return { ...st, recargar: () => cargar(anio) };
}

/** El menú de «+ Nuevo ▾»: flota junto al botón, se da la vuelta si no cabe abajo. */
function MenuNuevo({ anchor, items, onClose }) {
    const caja = useRef(null);
    // Se coloca midiendo el DOM (sin estado): primero invisible, luego en su sitio.
    useLayoutEffect(() => {
        const el = caja.current;
        if (!el) return;
        const r = anchor.getBoundingClientRect();
        const w = Math.min(300, window.innerWidth - 24);
        el.style.width = `${w}px`;
        const h = el.offsetHeight || 200;
        const left = Math.max(12, Math.min(r.right - w, window.innerWidth - w - 12));
        const abajo = r.bottom + 8 + h <= window.innerHeight;
        el.style.left = `${left}px`;
        el.style.top = `${abajo ? r.bottom + 8 : Math.max(12, r.top - 8 - h)}px`;
        el.style.visibility = 'visible';
    }, [anchor]);
    useEffect(() => {
        caja.current?.querySelector('.fx-pop-item')?.focus();
        const fuera = (e) => { if (!caja.current?.contains(e.target) && !anchor.contains(e.target)) onClose(); };
        const tecla = (e) => {
            if (e.key === 'Escape') { e.stopPropagation(); onClose(); anchor.focus(); return; }
            if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
            e.preventDefault();
            const bs = [...(caja.current?.querySelectorAll('.fx-pop-item') || [])];
            const i = bs.indexOf(document.activeElement);
            bs[(i + (e.key === 'ArrowDown' ? 1 : -1) + bs.length) % bs.length]?.focus();
        };
        document.addEventListener('mousedown', fuera);
        window.addEventListener('keydown', tecla, true);
        const cerrar = () => onClose();
        window.addEventListener('resize', cerrar);
        return () => { document.removeEventListener('mousedown', fuera); window.removeEventListener('keydown', tecla, true); window.removeEventListener('resize', cerrar); };
    }, [anchor, onClose]);
    return createPortal(
        <div ref={caja} className="fx-pop" role="menu" aria-label="Nuevo" style={{ left: -9999, top: 0, visibility: 'hidden' }}>
            <div className="fx-pop-tit">Nuevo</div>
            {items.map(it => (
                <button key={it.id} type="button" role="menuitem" className="fx-pop-item" onClick={() => { onClose(); it.hacer(); }}>
                    <Ico n={it.icono} size={18} />
                    <span>{it.texto}<small>{it.nota}</small></span>
                </button>
            ))}
        </div>,
        document.body,
    );
}

export function FacturacionView({ onNavigate }) {
    const { user } = useAuth();
    const { isStaff, isAdmin } = getRoleFlags(user);
    const subs = TODAS.filter(s => !s.admin || isAdmin);
    const [params] = useParamsFacturacion();
    const [guardada] = useState(() => leerLocal(CLAVE_SUB));
    const valida = (s) => subs.some(x => x.id === s);
    const activa = valida(params.sub) ? params.sub : valida(guardada) ? guardada : (isAdmin ? 'hoy' : 'presupuestos');

    const [prescriptores, setPrescriptores] = useState([]);
    const [menu, setMenu] = useState(null);          // el botón «+ Nuevo» (ancla del menú)
    const [ajustes, setAjustes] = useState(false);
    const [anio, setAnio] = useState(() => Number(hoyMadridFx().slice(0, 4)));
    const botonNuevo = useRef(null);
    const cerrarMenu = useCallback(() => setMenu(null), []);
    const cuadro = useCuadro(isAdmin && activa === 'hoy', anio);

    // La subpestaña elegida va a la URL (si se llegó sin `sub`, o con una que este rol no ve).
    useEffect(() => {
        if (params.sub !== activa) ponerParams({ sub: activa });
        guardarLocal(CLAVE_SUB, activa);
    }, [activa, params.sub]);

    // Al salir de la pestaña, fuera sus parámetros (si no, se quedan pegados en la barra).
    // En diferido: el doble montaje de StrictMode no puede borrar el `f` de un enlace pegado.
    const vivo = useRef(false);
    useEffect(() => {
        vivo.current = true;
        return () => {
            vivo.current = false;
            setTimeout(() => {
                if (vivo.current) return;
                const u = new URL(window.location);
                PARAMS.forEach(k => u.searchParams.delete(k));
                window.history.replaceState(window.history.state, '', u);
            }, 0);
        };
    }, []);

    // Los mismos prescriptores que pide CeeDirectosView: el editor del presupuesto los
    // necesita para el desplegable de «quién nos lo trae».
    useEffect(() => {
        if (!isStaff) return;
        axios.get('/api/prescriptores').then(r => setPrescriptores(r.data || [])).catch(() => setPrescriptores([]));
    }, [isStaff]);

    /** Ir a una subpestaña (con su filtro). Cambiar de subpestaña limpia los filtros de la otra. */
    const ir = useCallback((sub, extra = {}) => {
        const cambia = sub !== leerParams().sub;
        ponerParams({ sub, ...(cambia ? { f: null, serie: null, t: null } : {}), nuevo: null, abrir: null, ...extra });
    }, []);

    const itemsNuevo = [
        { id: 'presupuesto', icono: 'recibo', texto: 'Presupuesto', nota: 'Serie P-ING, nace borrador', hacer: () => ir('presupuestos', { nuevo: 'presupuesto' }) },
        ...(isAdmin ? [
            { id: 'ING', icono: 'pdf', texto: 'Factura ING', nota: 'BROKERGY, ingeniería', hacer: () => ir('facturas', { nuevo: 'ING' }) },
            { id: 'FML', icono: 'pdf', texto: 'Factura FML', nota: 'Fran a la sociedad, con su 15 % de IRPF', hacer: () => ir('facturas', { nuevo: 'FML' }) },
        ] : []),
    ];
    const abrirNuevo = () => {
        if (itemsNuevo.length === 1) { itemsNuevo[0].hacer(); return; }
        setMenu(m => (m ? null : botonNuevo.current));
    };

    // Tecla N: «+ Nuevo», salvo escribiendo o con un diálogo abierto.
    const abrirNuevoRef = useRef(abrirNuevo);
    useEffect(() => { abrirNuevoRef.current = abrirNuevo; });
    useEffect(() => {
        const h = (e) => {
            if ((e.key !== 'n' && e.key !== 'N') || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
            if (escribiendo(e.target) || document.querySelector('.fx-capa, .fx-pop, [role="dialog"]')) return;
            e.preventDefault();
            abrirNuevoRef.current();
        };
        window.addEventListener('keydown', h);
        return () => window.removeEventListener('keydown', h);
    }, []);

    // Flechas entre pestañas (patrón de pestañas WAI-ARIA).
    const teclaPestanas = (e) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
        e.preventDefault();
        const i = subs.findIndex(s => s.id === activa);
        const j = e.key === 'Home' ? 0 : e.key === 'End' ? subs.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + subs.length) % subs.length;
        ir(subs[j].id);
        setTimeout(() => document.getElementById(`fx-tab-${subs[j].id}`)?.focus(), 0);
    };

    // Contadores de las pestañas: solo con el cuadro ya traído (nunca un 0 inventado).
    const d = cuadro.datos;
    const contador = (id) => {
        if (!d) return null;
        if (id === 'facturas') { const n = d.cobros?.por_linea?.ING?.n_vencidas; return n ? { n, alerta: true, title: `${n} facturas ING vencidas sin cobrar` } : null; }
        if (id === 'presupuestos') { const n = d.presupuestos?.enviados?.n; return n ? { n, title: `${n} presupuestos enviados esperando respuesta` } : null; }
        if (id === 'trimestres' && d.trimestre?.t) { const [a, q] = d.trimestre.t.split('-T'); return { n: `${q}T`, title: `Trimestre en curso: ${q}T ${a}` }; }
        return null;
    };

    const nombre = nombreDePila(user);
    return (
        <div className="fx">
            <style>{CSS + CSS_LISTAS}</style>
            <div className="fx-filete-top" />
            <div className="fx-halo" aria-hidden="true" />
            <div className="fx-col">
                <header className="fx-cab fx-in">
                    <div>
                        <div className="fx-eyebrow">{isAdmin ? 'Administración' : 'Presupuestos y catálogo'}</div>
                        <h1 className="fx-display fx-h1">Facturación</h1>
                        <p className="fx-sub">
                            {nombre ? <>Hola, <b>{nombre}</b>. </> : null}
                            {isAdmin ? <>Así va el año a <b>{fechaLarga()}</b>.</> : 'Los presupuestos y el catálogo de artículos del equipo.'}
                        </p>
                    </div>
                    <div className="fx-cab-acc fx-cab-nuevo">
                        <button ref={botonNuevo} type="button" className="fx-btn fx-btn-pri" onClick={abrirNuevo}
                            aria-haspopup={itemsNuevo.length > 1 ? 'menu' : undefined} aria-expanded={itemsNuevo.length > 1 ? !!menu : undefined}
                            aria-keyshortcuts="N">
                            <Ico n="mas" size={18} sw={2.4} />
                            {itemsNuevo.length > 1 ? 'Nuevo' : 'Nuevo presupuesto'}
                            {itemsNuevo.length > 1 && <Ico n="abajo" size={16} sw={2.4} className="fx-nuevo-flecha" />}
                            <kbd className="fx-kbd">N</kbd>
                        </button>
                        {isAdmin && (
                            <button type="button" className="fx-btn fx-btn-sec fx-btn-icono" onClick={() => setAjustes(true)} aria-label="Ajustes de facturación" title="Ajustes">
                                <Ico n="ajustes" size={20} />
                            </button>
                        )}
                    </div>
                </header>

                <nav className="fx-tabs" role="tablist" aria-label="Apartados de Facturación" onKeyDown={teclaPestanas}>
                    {subs.map(s => {
                        const c = contador(s.id);
                        const sel = activa === s.id;
                        return (
                            <button key={s.id} id={`fx-tab-${s.id}`} type="button" role="tab" className="fx-tab"
                                aria-selected={sel} aria-controls="fx-panel" tabIndex={sel ? 0 : -1} onClick={() => ir(s.id)}>
                                {s.label}
                                {c && <span className={`fx-tab-n${c.alerta && !sel ? ' fx-tab-n-alerta' : ''}`} title={c.title}>{c.n}</span>}
                            </button>
                        );
                    })}
                </nav>

                <section id="fx-panel" className="fx-tabpanel" role="tabpanel" aria-labelledby={`fx-tab-${activa}`}>
                    {activa === 'hoy' && isAdmin && (
                        <CuadroMando estado={cuadro} anio={anio} setAnio={setAnio} ir={ir} onNavigate={onNavigate} />
                    )}
                    {activa === 'presupuestos' && (
                        <PresupuestosLista prescriptores={prescriptores} onNavigate={onNavigate} puedeFacturar={isAdmin} />
                    )}
                    {activa === 'facturas' && isAdmin && <FacturasLista onNavigate={onNavigate} />}
                    {activa === 'trimestres' && isAdmin && <TrimestresVista ir={ir} />}
                    {activa === 'articulos' && <ArticulosCatalogo />}
                </section>
            </div>

            {menu && <MenuNuevo anchor={menu} items={itemsNuevo} onClose={cerrarMenu} />}
            {ajustes && isAdmin && <AjustesFacturacion onClose={() => setAjustes(false)} />}
        </div>
    );
}

export default FacturacionView;
