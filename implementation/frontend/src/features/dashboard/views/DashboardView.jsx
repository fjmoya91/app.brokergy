// ============================================================================
// DashboardView.jsx — Cuadro de mando de DIRECCIÓN. Pantalla de inicio del ADMIN.
//
// «El cerebro de la empresa, de un golpe»: arriba el EBITDA y las seis cifras
// que importan; luego lo que pide atención, la salud (ratios de CFO), la cuenta
// de resultados, la caja, la previsión, el negocio CAE de la propuesta al cobro,
// los otros servicios (CEE directos, informes, presupuestos) y, plegado, el
// análisis de la cartera CAE que era el cuadro antiguo.
//
// Dos lecturas en paralelo, con su caché en el servidor:
//   GET /api/cuadro-mando/negocio   (~2 s)  → se pinta en cuanto llega
//   GET /api/cuadro-mando/finanzas  (~10 s la primera vez: lee los gastos de Drive)
// Aquí NO se hace ninguna cuenta de dinero: todo viene calculado de
// services/cuadroDireccion.js. El criterio de cada cifra y lo medido:
// docs/conocimiento/cuadro-mando/. Estética: el kit crema de Facturación (regla 164).
// ============================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../../context/AuthContext';
import { CSS, Ico, eur, ErrorApi, errorDeApi, useToastFx, hoyMadridFx, fechaEs } from '../../facturacion/estilo';
import { CSS_CUADRO } from '../cuadroEstilo';
import {
    Arriba, Atencion, Salud, Resultados, Caja, Prevision, NegocioCae, OtrosServicios, Captacion,
    CabSeccion,
} from '../components/CuadroSecciones';
import { juntarAtencion, pct, energia } from '../logic/cuadroFormato';
import { CarteraCae } from '../components/CarteraCae';

const SECCIONES = [
    { id: 'resumen', label: 'Resumen' },
    { id: 'salud', label: 'Salud' },
    { id: 'resultados', label: 'Resultados' },
    { id: 'caja', label: 'Caja' },
    { id: 'prevision', label: 'Previsión' },
    { id: 'cae', label: 'Negocio CAE' },
    { id: 'servicios', label: 'Otros servicios' },
    { id: 'cartera', label: 'Cartera' },
];

const nombreDePila = (u) => {
    const n = String(u?.nombre || u?.email || '').trim().split(/[\s@.]+/)[0] || '';
    return n ? n.charAt(0).toUpperCase() + n.slice(1).toLowerCase() : '';
};
const fechaLarga = () => new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Madrid' }).format(new Date());
const horaDe = (iso) => (iso ? new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }).format(new Date(iso)) : '');
const sinMovimiento = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Una lectura con su estado; al recargar se QUEDA lo anterior en pantalla (atenuado). */
function useLectura() {
    const [st, setSt] = useState({ datos: null, error: null, cargando: true });
    const turno = useRef(0);
    const leer = useCallback(async (url, params) => {
        const mio = ++turno.current;
        setSt(s => ({ ...s, cargando: true, error: null }));
        try {
            const { data } = await axios.get(url, { params });
            if (mio === turno.current) setSt({ datos: data, error: null, cargando: false });
        } catch (e) {
            if (mio === turno.current) setSt(s => ({ ...s, error: errorDeApi(e), cargando: false }));
        }
    }, []);
    return [st, leer];
}

export function DashboardView() {
    const { user } = useAuth();
    const hoy = hoyMadridFx();
    const anioHoy = Number(hoy.slice(0, 4));
    const mesHoy = Number(hoy.slice(5, 7)) - 1;
    const [anio, setAnio] = useState(anioHoy);
    const [neg, leerNeg] = useLectura();
    const [fin, leerFin] = useLectura();
    const [activa, setActiva] = useState('resumen');
    const [toast, avisar] = useToastFx();
    const nav = useRef(null);

    const cargarNegocio = useCallback((forzar) => leerNeg('/api/cuadro-mando/negocio', forzar ? { forzar: 1 } : {}), [leerNeg]);
    const cargarFinanzas = useCallback((a, forzar) => leerFin('/api/cuadro-mando/finanzas', { anio: a, ...(forzar ? { forzar: 1 } : {}) }), [leerFin]);
    useEffect(() => { cargarNegocio(false); }, [cargarNegocio]);
    useEffect(() => { cargarFinanzas(anio, false); }, [anio, cargarFinanzas]);

    const n = neg.datos;
    const f = fin.datos && fin.datos.anio === anio ? fin.datos : null;
    const esteAnio = anio === anioHoy;
    const atencion = useMemo(() => juntarAtencion(n, f), [n, f]);

    // La sección que se está leyendo se marca en la barra de arriba.
    useEffect(() => {
        if (typeof IntersectionObserver === 'undefined') return undefined;
        const els = SECCIONES.map(s => document.getElementById(`cm-${s.id}`)).filter(Boolean);
        const vistas = new Map();
        const io = new IntersectionObserver((entradas) => {
            for (const e of entradas) vistas.set(e.target.id, e.isIntersecting);
            const primera = SECCIONES.find(s => vistas.get(`cm-${s.id}`));
            if (primera) setActiva(primera.id);
        }, { rootMargin: '-130px 0px -55% 0px', threshold: 0 });
        els.forEach(el => io.observe(el));
        return () => io.disconnect();
    }, [n, f]);
    // En el móvil la barra se desliza sola para que la pestaña marcada se vea.
    useEffect(() => {
        const caja = nav.current;
        const b = caja?.querySelector('[aria-current="true"]');
        if (!caja || !b) return;
        const izq = b.offsetLeft - 16, der = b.offsetLeft + b.offsetWidth + 16;
        if (izq < caja.scrollLeft) caja.scrollLeft = izq;
        else if (der > caja.scrollLeft + caja.clientWidth) caja.scrollLeft = der - caja.clientWidth;
    }, [activa]);

    const ir = (id) => {
        const el = document.getElementById(`cm-${id}`);
        if (!el) return;
        setActiva(id);
        el.scrollIntoView({ behavior: sinMovimiento() ? 'auto' : 'smooth', block: 'start' });
    };
    const actualizar = () => { cargarNegocio(true); cargarFinanzas(anio, true); };

    const copiarResumen = async () => {
        const L = [`BROKERGY · cuadro de mando a ${fechaEs(hoy)}`];
        if (f) {
            const p = f.pyg, c = f.caja, pr = f.prevision;
            L.push('', `Facturado ${f.anio}: ${eur(p.ingresos, 0)} sin IVA (CAE ${eur(p.ingresosCae, 0)} · servicios ${eur(p.ingresosIng, 0)})`,
                `Margen bruto: ${eur(p.margenBruto, 0)} (${pct(p.margenBrutoPct)})`,
                `EBITDA: ${eur(p.ebitda, 0)} (${pct(p.ebitdaPct)})${p.fiable ? '' : ` · provisional, ${p.gastos.sinLeer} gastos sin leer`}`,
                `Te deben: ${eur(c.teDeben, 0)} con IVA · vencido ${eur(c.vencido, 0)}`,
                `Bonos por pagar: ${eur(c.bonosPorPagar, 0)} · IVA del trimestre: ${eur(c.ivaAPagar, 0)}`,
                `Circulante neto: ${eur(c.circulante, 0)}`,
                `Cartera ponderada: ${eur(pr.cartera, 0)} · margen ${eur(pr.carteraMargen, 0)}`);
            if (pr.cierreAnio) L.push(`Cierre ${f.anio}: ${eur(pr.cierreAnio.seguro, 0)}, hasta ${eur(pr.cierreAnio.posible, 0)} si el MITECO emite antes del 31/12`);
        }
        if (n) {
            L.push('', 'Lotes:');
            for (const e of n.etapas.filter(x => x.n > 0)) L.push(`· ${e.label}: ${e.n} (${e.nExp} exp., ${energia(e.mwh)}, ${eur(e.base, 0)})`);
            L.push('', `CEE directos ${String(n.cee.hoy).slice(0, 4)}: ${eur(n.cee.facturadoAnio, 0)} en ${n.cee.nFacturasAnio} facturas · por facturar ${eur(n.cee.porFacturar.importe, 0)} · por cobrar ${eur(n.cee.porCobrar.importe, 0)}`);
        }
        if (atencion.length) { L.push('', 'Atención:'); for (const a of atencion) L.push(`· ${a.texto}${a.importe ? ` (${eur(a.importe, 0)})` : ''}`); }
        try { await navigator.clipboard.writeText(L.join('\n')); avisar('Resumen copiado: pégalo donde quieras'); }
        catch { avisar('El navegador no deja copiar aquí', 'aviso'); }
    };

    const recargando = (neg.cargando && !!n) || (fin.cargando && !!fin.datos);
    const nombre = nombreDePila(user);
    const errF = fin.error && !f;
    const errorFinanzas = <ErrorApi error={fin.error} que="las cifras económicas" onReintentar={() => cargarFinanzas(anio, false)} />;
    const errorNegocio = <ErrorApi error={neg.error} que="el negocio en marcha" onReintentar={() => cargarNegocio(false)} />;

    return (
        <div className="fx cm">
            <style>{CSS + CSS_CUADRO}</style>
            <div className="fx-filete-top" />
            <div className="fx-halo" aria-hidden="true" />
            <div className="fx-col">
                <header className="cm-cab fx-in">
                    <div>
                        <div className="fx-eyebrow">Dirección · {fechaLarga()}</div>
                        <h1 className="fx-display fx-h1">Cuadro de <span className="fx-mark">mando</span></h1>
                        <p className="fx-sub">
                            {nombre ? <>Hola, <b>{nombre}</b>. </> : null}
                            Toda la empresa en una pantalla: lo que has facturado y lo que te queda, la caja, lo que viene y lo que hay que mover hoy.
                        </p>
                        <p className="cm-act" aria-live="polite">
                            {recargando ? 'Recalculando…'
                                : n || f ? <>Calculado a las {horaDe(f?.generado || n?.generado)}. El año cambia la cuenta de resultados; el negocio en marcha es siempre el de hoy.</> : 'Calculando…'}
                        </p>
                    </div>
                    <div className="cm-cab-acc">
                        <select className="fx-select fx-select-peq" value={anio} onChange={e => setAnio(Number(e.target.value))} aria-label="Año de la cuenta de resultados">
                            {[anioHoy, anioHoy - 1, anioHoy - 2].map(a => <option key={a} value={a}>{a}</option>)}
                        </select>
                        <button type="button" className="fx-btn fx-btn-sec" onClick={actualizar} disabled={neg.cargando || fin.cargando}>
                            <Ico n="reintentar" size={18} />Actualizar
                        </button>
                        <button type="button" className="fx-btn fx-btn-sec" onClick={copiarResumen} disabled={!n && !f}>
                            <Ico n="lista" size={18} />Copiar<span className="cm-solo-ancho">&nbsp;resumen</span>
                        </button>
                    </div>
                </header>

                <nav ref={nav} className="fx-tabs cm-nav" aria-label="Secciones del cuadro de mando">
                    {SECCIONES.map(s => (
                        <button key={s.id} type="button" className="fx-tab" aria-current={activa === s.id ? 'true' : undefined} onClick={() => ir(s.id)}>{s.label}</button>
                    ))}
                </nav>

                <div className={recargando ? 'fx-recargando' : undefined}>
                    <section className="cm-sec" id="cm-resumen" aria-label="Resumen">
                        {errF ? errorFinanzas : <Arriba f={f} esteAnio={esteAnio} mesHoy={mesHoy} ir={ir} />}
                        <div style={{ marginTop: 14 }}>
                            {neg.error && !n ? errorNegocio : <Atencion items={atencion} cargandoFinanzas={!f && !errF} />}
                        </div>
                    </section>

                    <section className="cm-sec" id="cm-salud" aria-labelledby="cm-salud-t">
                        <CabSeccion eyebrow="Salud de la empresa" titulo={<span id="cm-salud-t">Los ratios de un vistazo</span>}>
                            En verde lo que va bien, en ámbar lo que hay que vigilar. En gris, lo que no se puede juzgar todavía (por ejemplo, con gastos sin leer).
                        </CabSeccion>
                        {errF ? errorFinanzas : <Salud f={f} />}
                    </section>

                    <section className="cm-sec" id="cm-resultados" aria-labelledby="cm-resultados-t">
                        <CabSeccion eyebrow={`Resultados · ${anio}`} titulo={<span id="cm-resultados-t">Lo facturado y lo que queda</span>}>
                            Cuenta de resultados de gestión, sin IVA: cada venta de CAE lleva el coste real de sus expedientes.
                        </CabSeccion>
                        {errF ? errorFinanzas : <Resultados f={f} esteAnio={esteAnio} mesHoy={mesHoy} />}
                    </section>

                    <section className="cm-sec" id="cm-caja" aria-labelledby="cm-caja-t">
                        <CabSeccion eyebrow="Caja" titulo={<span id="cm-caja-t">Lo que entra y lo que tienes que pagar</span>} />
                        {errF ? errorFinanzas : <Caja f={f} />}
                    </section>

                    <section className="cm-sec" id="cm-prevision" aria-labelledby="cm-prevision-t">
                        <CabSeccion eyebrow="Previsión" titulo={<span id="cm-prevision-t">Lo que viene, ponderado por lo que suele salir</span>}>
                            Cada tramo lleva su probabilidad medida en la app: lo que deja el verificador, los rechazos y lo que convierte una propuesta según su edad.
                        </CabSeccion>
                        {errF ? errorFinanzas : <Prevision f={f} />}
                    </section>

                    <section className="cm-sec" id="cm-cae" aria-labelledby="cm-cae-t">
                        <CabSeccion eyebrow="Negocio CAE" titulo={<span id="cm-cae-t">De la propuesta al cobro</span>}>
                            {n ? <>{n.expedientes.vivos} expedientes vivos ({n.expedientes.listos} listos para lote) y {n.lotes.filter(l => l.etapa !== 'CERRADO').length} lotes abiertos. Se rechaza el {pct(n.expedientes.tasaRechazo)}.</> : 'Cargando la cartera…'}
                        </CabSeccion>
                        {neg.error && !n ? errorNegocio : (<>
                            <NegocioCae n={n} />
                            <div style={{ marginTop: 14 }}><Captacion n={n} /></div>
                        </>)}
                    </section>

                    <section className="cm-sec" id="cm-servicios" aria-labelledby="cm-servicios-t">
                        <CabSeccion eyebrow="Otros servicios" titulo={<span id="cm-servicios-t">CEE directos, informes y presupuestos</span>}>
                            Lo que no es venta de CAE: se factura en la serie ING.
                        </CabSeccion>
                        {neg.error && !n ? errorNegocio : <OtrosServicios n={n} f={f} />}
                    </section>

                    {n && <CarteraCae n={n} />}
                </div>
                <p className="cm-act" style={{ margin: '28px 2px 8px' }}>
                    Cifras de gestión calculadas por la app con los datos de hoy (sin IVA salvo donde se dice). No sustituyen a la contabilidad de la gestoría.
                </p>
            </div>
            {toast}
        </div>
    );
}
