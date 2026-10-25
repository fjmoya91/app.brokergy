import { useState } from 'react';
import axios from 'axios';
import { Ico, eur, entero, fechaEs, tonoDeApi, errorDeApi, useToastFx } from '../../estilo';
import { CobroDialog } from '../FacturaModal';

// ─────────────────────────────────────────────────────────────────────────────
// «Para hoy»: lo que pide un gesto, una fila por cosa y UN botón por fila
// (Cobrada · Facturar · Prepararla · Emitir · Revisar). Sale de `cuadro.cobros.vencidas` (las
// facturas ING vencidas, una a una) y de `cuadro.avisos` (con su `filtro`, que dice adónde ir).
//
// - «Cobrada» abre el CobroDialog con el `id` que trae la vencida. Solo en las que se cobran
//   AQUÍ: las de un LOTE (CAE) se cobran desde Lotes («Ir a Lotes») y las de un CEE directo o de
//   la gestión CAE, desde su expediente («Revisar» lleva al listado de vencidas).
// - Las ventas CAE que solo están en Drive (autofacturas, `cobros.drive.pendientes`) sí se
//   cobran AQUÍ: «Cobrada» abre el mismo CobroDialog contra `POST /ventas-drive/:fileId/cobro`
//   (el cobro va en el propio fichero de Drive). Ámbar: no tienen vencimiento, pero sin marcar
//   su cobro salen en «Te deben» para siempre.
// - Un lote que ya está en «PTE. PAGO A CLIENTE» (o FINALIZADO) con su factura sin cobrar
//   (aviso con `filtro.motivo` COBRO_SIN_MARCAR) es UNA fila ámbar: si esa factura también está
//   vencida, la fila de la vencida no se repite. «Ir a Lotes»: se marca en el Resumen del lote.
// - «Facturar»: una fila por presupuesto ACEPTADO sin factura (`presupuestos.por_facturar`, de
//   cualquier año); lo abre en Presupuestos (`abrir`), donde se factura.
// - «Prepararla» (la FML del mes que falta): abre el borrador FML que ya haya o DUPLICA la última
//   FML emitida (`POST /facturas/:id/duplicar` → BORRADOR con el mes siguiente) y lo abre. No
//   emite ni envía nada: emitir es otro gesto, en el editor.
// - Los demás botones solo cambian la vista (ponerParams), nunca escriben.
// ─────────────────────────────────────────────────────────────────────────────

// Primero lo VENCE agrupado o de Lotes (una CAE pesa más que una factura suelta), luego las
// vencidas una a una, lo ámbar y lo informativo.
// Dentro de lo ámbar, primero lo que es dinero que casi seguro ya entró (`pri`: el lote que
// avanzó sin marcar el cobro).
const peso = (x) => (x.tono === 'vence' ? (x.suelta ? 1 : 0) : x.pri ? 1.5 : { ambar: 2, ok: 3, crema: 4 }[x.tono] ?? 5);
const ICONO_TONO = { vence: 'alerta', ambar: 'alerta', ok: 'check', crema: 'info' };
const CORTE = 6;
/** Dónde se cobra una factura que no se cobra aquí (su `origen`). */
const SE_COBRA_EN = { LOTE: 'lotes', CEE_DIRECTO: 'expediente', GESTION_CAE: 'expediente' };
const dondeSeCobra = (v) => SE_COBRA_EN[v.origen] || (!v.origen && v.linea === 'CAE' ? 'lotes' : null);
/** Fecha en Madrid de un instante ISO («2026-10-22T21:34Z» → «22/10/2026»). */
const diaMadrid = (ts) => {
    const t = Date.parse(ts || '');
    return Number.isNaN(t) ? '' : fechaEs(new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(new Date(t)));
};

export function ParaHoy({ d, ir, onNavigate, recargar }) {
    const [todas, setTodas] = useState(false);
    const [ocupado, setOcupado] = useState(null);     // la clave de la fila que está trabajando
    const [cobro, setCobro] = useState(null);         // la factura del CobroDialog
    const [toast, avisar] = useToastFx();

    const co = d.cobros || {};
    const vencidas = co.vencidas || [];
    const deLotes = vencidas.filter(v => dondeSeCobra(v) === 'lotes');
    const sueltas = vencidas.filter(v => dondeSeCobra(v) !== 'lotes');
    const nVencIng = co.por_linea?.ING?.n_vencidas || 0;
    const nVencCae = co.por_linea?.CAE?.n_vencidas || 0;
    const vencIngVistas = sueltas.filter(v => v.linea === 'ING').length;

    const prepararFml = async (clave) => {
        setOcupado(clave);
        try {
            const { data } = await axios.get('/api/facturacion/facturas', { params: { serie: 'FML' } });
            const fs = data?.facturas || [];
            const borrador = fs.find(f => f.estado === 'BORRADOR');
            if (borrador) {
                ir('facturas', { serie: 'FML', f: 'por-emitir', abrir: borrador.id });
                avisar('Ya había un borrador FML: te lo abro para revisarlo y emitirlo');
                return;
            }
            // El listado viene por fecha, la más reciente primero. Una rectificativa no sirve de modelo.
            const ultima = fs.find(f => f.estado !== 'BORRADOR' && f.estado !== 'ANULADA' && !String(f.numero || '').toUpperCase().startsWith('R-'));
            if (!ultima) { ir('facturas', { nuevo: 'FML' }); return; }
            const { data: dup } = await axios.post(`/api/facturacion/facturas/${ultima.id}/duplicar`);
            const id = dup?.factura?.id;
            ir('facturas', { serie: 'FML', f: 'por-emitir', ...(id ? { abrir: id } : {}) });
            avisar(`Borrador FML preparado a partir de ${ultima.numero}: revísalo y emítelo`);
        } catch (err) {
            avisar(`No se pudo preparar la FML: ${errorDeApi(err).texto}`, 'aviso');
        } finally { setOcupado(null); }
    };

    // ── las filas ──
    const filas = [];
    const titVencida = (v) => <><span className="fx-mono">{v.numero}</span> · {v.cliente || 'sin cliente'}</>;
    const hace = (v) => <>Venció el {fechaEs(v.vencimiento)} · hace {entero(v.dias)} {v.dias === 1 ? 'día' : 'días'}</>;
    // Las facturas de lote que ya salen como «el lote avanzó sin marcar el cobro»: una fila, no dos.
    const avisoLote = (d.avisos || []).filter(a => a.filtro?.motivo === 'COBRO_SIN_MARCAR');
    const yaEnAviso = new Set(avisoLote.flatMap(a => [a.filtro.factura_id, a.filtro.factura]).filter(Boolean));
    const vencidaDe = (a) => deLotes.find(v => v.id === a.filtro.factura_id || v.numero === a.filtro.factura) || null;
    deLotes.filter(v => !yaEnAviso.has(v.id) && !yaEnAviso.has(v.numero)).forEach(v => {
        filas.push({
            clave: `l-${v.id || v.numero}`, tono: 'vence', icono: 'euro',
            tit: titVencida(v), det: <>{hace(v)} · se cobra desde Lotes</>, imp: v.total,
            boton: 'Ir a Lotes', hacer: () => onNavigate?.('lotes'),
        });
    });
    sueltas.forEach(v => {
        const clave = `v-${v.id || v.numero}`;
        const fila = { clave, tono: 'vence', icono: 'euro', suelta: true, tit: titVencida(v), det: hace(v), imp: v.total };
        if (dondeSeCobra(v) === 'expediente') {
            Object.assign(fila, { det: <>{hace(v)} · se cobra desde su expediente</>, boton: 'Revisar', hacer: () => ir('facturas', { f: 'vencidas', serie: v.linea }) });
        } else if (v.id) {
            // Lo que pide el CobroDialog, sacado de la propia vencida: sin buscarla antes.
            Object.assign(fila, { boton: 'Cobrada', hacer: () => setCobro({ factura: { id: v.id, numero: v.numero, total: v.total, vencimiento: v.vencimiento, cliente_nombre: v.cliente, estado: 'EMITIDA' } }) });
        } else {
            Object.assign(fila, { boton: 'Revisar', hacer: () => ir('facturas', { f: 'vencidas', serie: v.linea }) });
        }
        filas.push(fila);
    });
    (co.drive?.pendientes || []).forEach(v => {
        filas.push({
            clave: `dr-${v.fileId}`, tono: 'ambar', icono: 'euro',
            tit: <><span className="fx-mono">{v.numero}</span> · {v.cliente || 'sin cliente'}</>,
            det: <>{v.autofactura ? 'Autofactura' : 'Venta CAE'} de Drive del {fechaEs(v.fecha)} · su cobro no está marcado</>, imp: v.total,
            boton: 'Cobrada', hacer: () => setCobro({
                factura: { id: v.fileId, numero: v.numero, total: v.total, cliente_nombre: v.cliente, estado: 'EMITIDA' },
                url: `/api/facturacion/ventas-drive/${encodeURIComponent(v.fileId)}/cobro`,
                ayuda: 'Es una venta CAE que solo está en Drive: el cobro se anota en el propio fichero (no hay factura en la app).',
            }),
        });
    });
    (d.presupuestos?.por_facturar?.presupuestos || []).forEach(p => {
        filas.push({
            clave: `pf-${p.id}`, tono: 'ambar', icono: 'recibo',
            tit: <><span className="fx-mono">{p.numero}</span> · aceptado y sin facturar</>,
            det: <>{p.aceptada_at ? `Aceptado el ${diaMadrid(p.aceptada_at)} · ` : ''}sin IVA</>, imp: p.importe ?? null,
            boton: 'Facturar', hacer: () => ir('presupuestos', { abrir: p.id }),
        });
    });
    (d.avisos || []).forEach((a, i) => {
        const f = a.filtro || null;
        const clave = `a-${i}`;
        const fila = { clave, tono: tonoDeApi(a.tono), tit: a.texto, det: null, imp: null };
        if (f?.motivo === 'COBRO_SIN_MARCAR') {
            const venc = vencidaDe(a);
            Object.assign(fila, {
                icono: 'euro', imp: f.total ?? null, pri: true,
                det: <>{venc ? <>{hace(venc)} · </> : null}¿Lo ha pagado el S.O.? Márcalo en el Resumen del lote</>,
                boton: 'Ir a Lotes', hacer: () => onNavigate?.('lotes'),
            });
        } else if (f?.vista === 'facturas' && f.estado === 'VENCIDA') {
            if (sueltas.length) return;          // ya están una a una arriba
            Object.assign(fila, { boton: 'Revisar', hacer: () => ir('facturas', { f: 'vencidas', serie: 'ING' }) });
        } else if (f?.vista === 'lotes') {
            if (deLotes.length && deLotes.length >= nVencCae) return;   // ya están una a una arriba
            Object.assign(fila, { det: 'Las facturas CAE se cobran desde Lotes', boton: 'Revisar', hacer: () => onNavigate?.('lotes') });
        } else if (f?.vista === 'facturas' && f.estado === 'BORRADOR') {
            Object.assign(fila, { det: 'Hasta emitirlas no tienen número ni cuentan', boton: 'Emitir', hacer: () => ir('facturas', { f: 'por-emitir' }) });
        } else if (f?.vista === 'facturas' && f.serie === 'FML' && /^Falta la factura FML/i.test(a.texto || '')) {
            Object.assign(fila, { det: 'Se duplica la última FML con el mes siguiente; luego la revisas y la emites', boton: 'Prepararla', hacer: () => prepararFml(clave) });
        } else if (f?.vista === 'facturas' && f.serie) {
            Object.assign(fila, { boton: 'Revisar', hacer: () => ir('facturas', { serie: f.serie, f: 'todas' }) });
        } else if (f?.vista === 'facturas') {
            Object.assign(fila, { boton: 'Revisar', hacer: () => ir('facturas', f.estado ? { f: 'todas' } : {}) });
        } else if (f?.vista === 'presupuestos') {
            Object.assign(fila, { boton: 'Revisar', hacer: () => ir('presupuestos', { f: 'esperando' }) });
        } else if (f?.vista === 'gastos') {
            Object.assign(fila, { det: 'En Trimestres › Gastos', boton: 'Revisar', hacer: () => ir('trimestres', { t: f.t, f: 'gastos' }) });
        } else if (f?.vista === 'trimestre') {
            Object.assign(fila, { boton: 'Revisar', hacer: () => ir('trimestres', { t: f.t }) });
        }
        filas.push(fila);
    });
    filas.sort((a, b) => peso(a) - peso(b));

    const visibles = todas ? filas : filas.slice(0, CORTE);
    const n = filas.length;

    return (<>
        <div className="fx-card-cab">
            <div>
                <div className="fx-eyebrow">Para hoy</div>
                <h3 className="fx-display fx-h3">
                    {n ? <>{n === 1 ? 'Una cosa' : `${entero(n)} cosas`} que piden <span className="fx-mark">un gesto</span></> : <>Nada pendiente <span className="fx-mark">hoy</span></>}
                </h3>
            </div>
        </div>
        {n === 0 ? (
            <div className="fx-vacio fx-vacio-peq">
                <span className="fx-tile fx-tile-l fx-tile-verde"><Ico n="check" size={22} /></span>
                <p>Ni facturas vencidas, ni borradores, ni plazos a punto de cerrar.</p>
            </div>
        ) : (
            <ul className="fx-ph-lista">
                {visibles.map(x => (
                    <li key={x.clave} className="fx-ph">
                        <span className={`fx-tile fx-tile-${x.tono === 'crema' ? 'gris' : x.tono}`}><Ico n={x.icono || ICONO_TONO[x.tono] || 'info'} size={18} /></span>
                        <div className="fx-ph-tit" title={typeof x.tit === 'string' ? x.tit : undefined}>{x.tit}</div>
                        {x.det && <div className="fx-ph-det">{x.det}</div>}
                        {x.imp != null && <div className="fx-ph-imp">{eur(x.imp)}</div>}
                        {x.boton && (
                            <div className="fx-ph-acc">
                                <button type="button" className="fx-btn fx-btn-peq fx-btn-sec"
                                    onClick={x.hacer} disabled={!!ocupado} aria-busy={ocupado === x.clave || undefined}>
                                    {ocupado === x.clave ? 'Un momento…' : x.boton}
                                </button>
                            </div>
                        )}
                    </li>
                ))}
            </ul>
        )}
        {(n > CORTE || nVencIng > vencIngVistas) && (
            <div className="fx-ph-pie">
                {n > CORTE ? (
                    <button type="button" className="fx-link" aria-expanded={todas} onClick={() => setTodas(v => !v)}>
                        {todas ? 'Ver menos' : `Ver las ${entero(n)}`}<Ico n={todas ? 'arriba' : 'abajo'} size={16} />
                    </button>
                ) : <span />}
                {nVencIng > vencIngVistas && (
                    <button type="button" className="fx-link" onClick={() => ir('facturas', { f: 'vencidas', serie: 'ING' })}>
                        Las {entero(nVencIng)} vencidas, en Facturas<Ico n="derecha" size={16} />
                    </button>
                )}
            </div>
        )}

        {cobro && (
            <CobroDialog factura={cobro.factura} url={cobro.url} {...(cobro.ayuda ? { ayuda: cobro.ayuda } : {})} onClose={() => setCobro(null)}
                onHecho={() => { setCobro(null); avisar(`${cobro.factura.numero} marcada como cobrada`); recargar?.(); }} />
        )}
        {toast}
    </>);
}

export default ParaHoy;
