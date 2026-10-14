import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { SendActionOverlay } from '../../../components/SendActionOverlay';

// ─── El PROCEDIMIENTO del encargo, paso a paso ───────────────────────────────
// Presupuesto aceptado → CEE firmado y revisado → factura (con el enlace del
// justificante) → cobro (el cliente sube el justificante y tú lo confirmas) →
// registro → entrega; y en un DOBLE: obra terminada (factura de la instalación)
// → CEE final → entrega del final. Lo define `services/ceeDirectoProceso.js`
// (`GET /:id/proceso`); aquí solo se pinta, con el gesto del paso que toca.
//
// Los enlaces que te llegan por WhatsApp abren el gesto directamente:
//   `?cee=<id>&facturar=1` → «Generar factura» · `?cee=<id>&cobro=1` → «Confirmar cobro».
// Se leen al CARGAR el módulo (App reescribe la URL al abrir la ficha) y se
// consumen una vez, como el `&avisar=` de la entrega.

const API = '/api/cee-directos';

let gestoPendiente = (() => {
    try {
        const p = new URLSearchParams(window.location.search);
        const cee = p.get('cee');
        if (!cee) return null;
        if (p.get('facturar')) return { cee, gesto: 'facturar' };
        if (p.get('cobro')) return { cee, gesto: 'cobro' };
        return null;
    } catch { return null; }
})();

const eur = (n) => (n == null ? '' : `${Number(n).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`);

const QUIEN = { BROKERGY: 'Nuestra', CERTIFICADOR: 'Técnico', PRESENTADOR: 'Quien presenta', CLIENTE: 'Cliente' };

const ESTILO = {
    hecho: { punto: 'bg-emerald-500 text-bkg-deep', texto: 'text-white/70', icono: '✓' },
    toca: { punto: 'bg-brand text-bkg-deep ring-4 ring-brand/20', texto: 'text-white', icono: '!' },
    espera: { punto: 'bg-amber-500/20 text-amber-300 border border-amber-500/40', texto: 'text-white/80', icono: '…' },
    pendiente: { punto: 'bg-white/[0.04] text-white/25 border border-white/10', texto: 'text-white/35', icono: '' },
    na: { punto: 'bg-white/[0.04] text-white/25 border border-white/10', texto: 'text-white/30', icono: '–' },
};

// `cobroAbierto` / `onCobro`: el popup «Confirmar cobro» lo abre también el botón
// «Marcar cobrado» de la cabecera (la ficha lleva ese estado), para que marcar
// pagado diga SIEMPRE qué va a pasar con el certificado.
export function ProcesoCee({ id, refrescar, isAdmin, onFacturar, onCambio, cobroAbierto = false, onCobro }) {
    const [datos, setDatos] = useState(null);
    const [recarga, setRecarga] = useState(0);
    const [copiado, setCopiado] = useState(null);
    // El gesto del enlace del aviso, si es de ESTA ficha. Se LEE al montar (sin
    // consumirlo: StrictMode repite el inicializador) y se consume en el efecto.
    const [gesto] = useState(() => (gestoPendiente && String(gestoPendiente.cee) === String(id) ? gestoPendiente.gesto : null));
    const cobro = cobroAbierto;
    const setCobro = (v) => onCobro?.(v);

    useEffect(() => {
        let vivo = true;
        axios.get(`${API}/${id}/proceso`)
            .then(({ data }) => { if (vivo) setDatos(data); })
            .catch(() => { if (vivo) setDatos(null); });
        return () => { vivo = false; };
    }, [id, refrescar, recarga]);
    const cargar = useCallback(() => setRecarga(n => n + 1), []);

    // Llegada desde el enlace del aviso: se abre el gesto una vez y se limpia la URL.
    useEffect(() => {
        if (!gesto) return;
        gestoPendiente = null;
        try {
            const u = new URL(window.location.href);
            u.searchParams.delete('facturar'); u.searchParams.delete('cobro');
            window.history.replaceState(window.history.state, '', u);
        } catch { /* sin URL que limpiar */ }
        if (!isAdmin) return;
        if (gesto === 'facturar') onFacturar?.();
        else if (gesto === 'cobro') onCobro?.(true);
    }, [gesto, isAdmin, onFacturar, onCobro]);

    if (!datos) return null;

    const sig = datos.siguiente;
    const copiar = async (clave, texto) => {
        try { await navigator.clipboard.writeText(texto); setCopiado(clave); setTimeout(() => setCopiado(null), 1800); }
        catch { /* contexto no seguro */ }
    };

    return (
        <div className="mb-5 rounded-2xl border border-white/[0.06] bg-bkg-surface/40 p-4 md:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h3 className="text-xs font-black text-white uppercase tracking-widest border-l-2 border-brand pl-4">Procedimiento</h3>
                {isAdmin && datos.enlaces && (
                    <div className="flex flex-wrap gap-2">
                        {datos.enlaces.pago && (
                            <button type="button" onClick={() => copiar('pago', datos.enlaces.pago)}
                                title="El enlace donde el cliente sube el justificante de la transferencia"
                                className="min-h-[36px] px-3 rounded-lg border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/45 hover:text-white hover:border-white/25">
                                {copiado === 'pago' ? '✓ Copiado' : '🔗 Enlace del justificante'}
                            </button>
                        )}
                        {datos.enlaces.facturaInstalacion && (
                            <button type="button" onClick={() => copiar('obra', datos.enlaces.facturaInstalacion)}
                                title="El enlace donde el cliente sube la factura de la instalación (abre el CEE final)"
                                className="min-h-[36px] px-3 rounded-lg border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/45 hover:text-white hover:border-white/25">
                                {copiado === 'obra' ? '✓ Copiado' : '🔗 Enlace de la factura de obra'}
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Los pasos: en fila en el escritorio, en columna en el móvil. */}
            <ol className="grid gap-3 md:gap-2 md:grid-flow-col md:auto-cols-fr">
                {datos.pasos.map((p, i) => {
                    const e = ESTILO[p.estado] || ESTILO.pendiente;
                    return (
                        <li key={p.clave} className="flex md:flex-col items-start gap-3 md:gap-2 min-w-0">
                            <div className="flex md:w-full items-center gap-2 shrink-0">
                                <span className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black shrink-0 ${e.punto}`}>
                                    {e.icono || i + 1}
                                </span>
                                <span className="hidden md:block flex-1 h-px bg-white/[0.08]" />
                            </div>
                            <div className="min-w-0">
                                <div className={`text-[11px] font-black uppercase tracking-wide leading-tight ${e.texto}`}>{p.titulo}</div>
                                {p.detalle && <div className="text-[10px] text-white/40 mt-0.5 leading-snug normal-case">{p.detalle}</div>}
                                {p.quien && p.estado !== 'hecho' && (
                                    <div className="text-[9px] text-white/30 mt-0.5 uppercase tracking-widest">Pelota: {QUIEN[p.quien] || p.quien}</div>
                                )}
                            </div>
                        </li>
                    );
                })}
            </ol>

            {/* Lo que toca hoy, con su gesto. */}
            {sig && (
                <div className={`mt-4 rounded-xl border px-4 py-3 flex flex-wrap items-center justify-between gap-3 ${
                    sig.estado === 'toca' ? 'border-brand/40 bg-brand/[0.06]' : 'border-white/[0.08] bg-white/[0.02]'}`}>
                    <div className="min-w-0 text-[11px] normal-case leading-snug">
                        <span className="font-black uppercase tracking-widest text-[10px] text-white/50 mr-2">Ahora</span>
                        <span className="text-white/85">{sig.titulo}{sig.detalle ? ` — ${sig.detalle}` : ''}</span>
                    </div>
                    {isAdmin && sig.accion === 'facturar' && (
                        <button type="button" onClick={onFacturar}
                            className="min-h-[44px] px-4 rounded-xl bg-brand text-bkg-deep text-[10px] font-black uppercase tracking-widest hover:bg-brand-700">
                            🧾 {datos.factura ? 'Enviar la factura' : 'Emitir y enviar la factura'}
                        </button>
                    )}
                    {isAdmin && sig.accion === 'cobro' && (
                        <button type="button" onClick={() => setCobro(true)}
                            className="min-h-[44px] px-4 rounded-xl bg-brand text-bkg-deep text-[10px] font-black uppercase tracking-widest hover:bg-brand-700">
                            💶 Confirmar cobro
                        </button>
                    )}
                    {sig.accion === 'encargar_final' && (
                        <span className="text-[10px] text-white/45 normal-case">Encárgalo en la fila «CEE final» del módulo, aquí debajo.</span>
                    )}
                </div>
            )}

            {isAdmin && (
                <ConfirmarCobroModal isOpen={cobro} onClose={() => setCobro(false)} id={id} datos={datos}
                    onConfirmado={() => { cargar(); onCambio?.(); }} />
            )}
        </div>
    );
}

/**
 * «Confirmar cobro»: el justificante que ha subido el cliente a la vista y UN
 * clic. Es el mismo «Marcar cobrado» de la cabecera (PATCH /:id/cobrado): la
 * factura pasa a PAGADA en la hoja y, con el registro subido, la entrega sale sola.
 */
function ConfirmarCobroModal({ isOpen, onClose, id, datos, onConfirmado }) {
    const [overlay, setOverlay] = useState({ phase: null });
    if (!isOpen) return null;

    const fac = datos?.factura;
    const just = datos?.justificantes || [];
    const registrado = datos?.pasos?.find(p => p.clave === 'registro')?.estado === 'hecho';

    const confirmar = async () => {
        setOverlay({ phase: 'sending' });
        try {
            await axios.patch(`${API}/${id}/cobrado`, { cobrado: true });
            setOverlay({
                phase: 'done', ok: true,
                items: [
                    { texto: 'Expediente marcado como cobrado', tono: 'ok' },
                    ...(fac ? [{ texto: `Factura ${fac.numero} → PAGADA en el libro de facturas`, tono: 'ok' }] : []),
                    registrado
                        ? { texto: 'Está registrado: el certificado le sale solo (firmado, registro y etiqueta)', tono: 'ok' }
                        : { texto: 'Aún sin registrar: le saldrá solo en cuanto se suba el justificante de registro', tono: 'info' },
                ],
            });
            onConfirmado?.();
        } catch (e) {
            setOverlay({ phase: 'done', ok: false, errorText: e.response?.data?.error || 'No se pudo marcar como cobrado' });
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[540] flex items-center justify-center max-md:items-end bg-black/70 backdrop-blur-sm p-4 max-md:p-0" onClick={onClose}>
            <div className="bg-bkg-deep border border-white/10 rounded-2xl max-md:rounded-b-none max-md:rounded-t-3xl w-full max-w-md shadow-2xl flex flex-col max-h-[92vh]"
                 onClick={e => e.stopPropagation()}>
                <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-white/[0.06] shrink-0">
                    <div className="min-w-0">
                        <h3 className="text-sm font-black text-white uppercase tracking-widest">💶 Confirmar cobro</h3>
                        <p className="text-[10px] text-white/40 normal-case mt-1 leading-snug">
                            {fac ? `Factura ${fac.numero} · ${eur(fac.total)}` : 'Sin factura emitida desde la app'}
                        </p>
                    </div>
                    <button type="button" onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-white/5 text-white/40">✕</button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    <div>
                        <div className="text-[9px] font-black text-white/50 uppercase tracking-widest mb-1.5">Justificante que ha subido</div>
                        {just.length ? (
                            <ul className="space-y-1.5">
                                {just.map(j => (
                                    <li key={j.name}>
                                        <a href={j.link} target="_blank" rel="noreferrer"
                                           className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5 text-[11px] text-white/80 hover:border-brand/40 normal-case">
                                            <span className="truncate">📎 {j.name}</span>
                                            <span className="text-[10px] text-white/35 shrink-0">{j.at ? new Date(j.at).toLocaleDateString('es-ES') : ''} · Abrir</span>
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-[11px] text-white/40 normal-case">
                                No ha subido ningún justificante. Si te ha llegado por otro lado (WhatsApp, el banco), puedes confirmar igual.
                            </p>
                        )}
                    </div>
                    <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.05] px-4 py-3 text-[11px] text-amber-200/90 normal-case leading-snug">
                        Compruébalo en el banco antes de confirmar: al confirmarlo, el certificado le sale solo al cliente
                        {registrado ? ' ahora mismo.' : ' en cuanto esté registrado.'}
                    </div>
                </div>

                <div className="px-5 py-4 border-t border-white/[0.06] shrink-0 flex gap-2">
                    <button type="button" onClick={onClose}
                        className="min-h-[44px] px-4 rounded-xl border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white">
                        Ahora no
                    </button>
                    <button type="button" onClick={confirmar} disabled={overlay.phase === 'sending'}
                        className="flex-1 min-h-[44px] px-4 rounded-xl bg-brand text-bkg-deep text-[10px] font-black uppercase tracking-widest hover:bg-brand-700 disabled:opacity-40">
                        Confirmar cobro
                    </button>
                </div>
            </div>

            <SendActionOverlay
                phase={overlay.phase}
                ok={overlay.ok}
                items={overlay.items}
                errorText={overlay.errorText}
                subtitle={fac ? `Factura ${fac.numero}` : ''}
                sendingTitle="Marcando como cobrado…"
                okTitle="Cobro confirmado"
                errorTitle="No se ha podido confirmar"
                onClose={() => { const ok = overlay.ok; setOverlay({ phase: null }); if (ok) onClose?.(); }}
            />
        </div>,
        document.body
    );
}

export default ProcesoCee;
