// ─────────────────────────────────────────────────────────────────────────────
// CobroClientesPanel — fase 7 del lote: "Pago a los clientes".
//
// Cuando el Sujeto Obligado nos paga, toca ingresarle el bono a cada cliente del
// lote. Antes de cada transferencia se le pide que confirme su número de cuenta
// —por seguridad— con el formulario /cobro/:id (que además pregunta cómo quiere
// liquidar la gestión y hace la venta cruzada). Esta pantalla es donde se manda y
// donde se ve, cliente a cliente, en qué punto está:
//
//   sin pedir → pedido (N veces) → ✓ confirmada (o ⚠ cuenta cambiada)
//
// y, para quien transfiere (ADMIN), qué cuenta, qué importe y si antes hay que
// emitirle factura.
//
// REGLA — el texto del mensaje lo compone el BACKEND (cobroService.mensajeCobro,
// fuente única con la ficha y el parte): aquí solo se enseña y se puede retocar.
// REGLA — en el mensaje la cuenta va ENMASCARADA; entera solo detrás del enlace.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import SendActionOverlay from '../../../components/SendActionOverlay';
import { CanalChip } from '../../../components/CanalChip';
import { computeExpedienteFinancials } from '../../expedientes/logic/expedienteFinancials';
import { eurEs } from '../../cobro/logic/cobroForm';

const eur = eurEs;
const fecha = (iso) => (iso ? new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '');
const diasDesde = (iso) => (iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)) : null);

/** En qué punto está el cobro de un cliente, dicho en una chapa. */
function estadoCobro(f) {
    const c = f.cobro || {};
    if (c.completado_at) {
        if (c.iban_cambiado) return { t: '⚠ Cuenta cambiada', c: 'bg-amber-500/15 text-amber-300 border-amber-500/35', orden: 1 };
        return { t: `✓ Confirmada${c.origen === 'tally' ? ' (Tally)' : ''}`, c: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35', orden: 3 };
    }
    if (c.enviado_at) {
        const d = diasDesde(c.enviado_at);
        return {
            t: `Pedido ${d === 0 ? 'hoy' : `hace ${d} d`}${c.veces > 1 ? ` · ×${c.veces}` : ''}`,
            c: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30', orden: 2,
        };
    }
    return { t: 'Sin pedir', c: 'bg-white/[0.04] text-white/45 border-white/15', orden: 0 };
}

export function CobroClientesPanel({ lote, activo, canSeeMargin = false, onChanged }) {
    const [datos, setDatos] = useState(null);
    const [error, setError] = useState('');
    const [cargando, setCargando] = useState(false);
    const [envio, setEnvio] = useState(null);       // filas que se van a pedir (abre el popup)
    const [copiado, setCopiado] = useState(null);

    const cargar = useCallback(async () => {
        if (!lote?.id) return;
        setCargando(true);
        setError('');
        try {
            const { data } = await axios.get(`/api/lotes/${lote.id}/cobros`);
            setDatos(data);
        } catch (e) {
            setError(e.response?.data?.error || 'No se pudo leer el cobro de los clientes.');
        } finally {
            setCargando(false);
        }
    }, [lote?.id]);

    // Se lee siempre (también antes de la fase de pago: así se ve quién ya
    // confirmó en Tally), pero los borradores solo vienen en fase de pago.
    useEffect(() => { cargar(); }, [cargar, lote?.estado]);

    // El bono a ingresar, con la MISMA fórmula que el resumen del lote (sobre el
    // ahorro VERIFICADO si consta). Solo ADMIN: es dinero.
    const bonos = useMemo(() => {
        if (!canSeeMargin) return {};
        const out = {};
        for (const e of (lote?.expedientes || [])) {
            try {
                const f = computeExpedienteFinancials(e);
                const bono = f.caeVerificado ?? f.cae;
                if (bono != null) out[e.id] = { bono, verificado: f.caeVerificado != null };
            } catch { /* un expediente sin datos no tumba la tabla */ }
        }
        return out;
    }, [lote?.expedientes, canSeeMargin]);

    const filas = useMemo(() => (datos?.filas || []).slice()
        .sort((a, b) => estadoCobro(a).orden - estadoCobro(b).orden
            || String(a.numero_expediente).localeCompare(String(b.numero_expediente))), [datos]);
    const pendientes = filas.filter(f => !f.error && !f.cobro?.completado_at);
    const confirmadas = filas.filter(f => f.cobro?.completado_at);
    const conFactura = confirmadas.filter(f => f.cobro?.forma_pago === 'factura');
    const cambiadas = confirmadas.filter(f => f.cobro?.iban_cambiado);

    const copiar = async (f) => {
        if (!f.link) return;
        try {
            await navigator.clipboard.writeText(f.link);
            setCopiado(f.id);
            setTimeout(() => setCopiado(c => (c === f.id ? null : c)), 2200);
        } catch {
            setError('No se pudo copiar el enlace (el navegador no deja usar el portapapeles).');
        }
    };

    if (!datos && cargando) return <p className="text-[10px] text-white/30">Leyendo el cobro de los clientes…</p>;

    return (
        <div className="space-y-2.5">
            {error && <p className="text-[10px] text-red-400">{error}</p>}

            {filas.length > 0 && (
                <p className="text-[10px] text-white/45 leading-snug">
                    <span className="text-emerald-300/90 font-bold">{confirmadas.length} de {filas.length}</span> han confirmado su cuenta
                    {pendientes.length > 0 && <> · <span className="text-white/70">{pendientes.length} pendiente{pendientes.length > 1 ? 's' : ''}</span></>}
                    {cambiadas.length > 0 && <> · <span className="text-amber-300">{cambiadas.length} con la cuenta cambiada</span></>}
                    {conFactura.length > 0 && <> · <span className="text-amber-300">{conFactura.length} quiere{conFactura.length > 1 ? 'n' : ''} factura</span></>}
                </p>
            )}

            {activo && pendientes.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                    <button type="button" onClick={() => setEnvio(pendientes)}
                        className="px-3.5 py-2 rounded-xl bg-brand text-black text-[11px] font-black uppercase tracking-wider hover:brightness-110 transition-all">
                        🏦 Pedir la confirmación de cuenta a {pendientes.length === filas.length ? 'todos' : pendientes.length} ({pendientes.length})
                    </button>
                    <span className="text-[9px] text-white/30">Un WhatsApp de enhorabuena por cliente, con la cuenta que tenemos y su enlace.</span>
                </div>
            )}
            {!activo && (
                <p className="text-[10px] text-white/30 italic">
                    Los mensajes se preparan cuando el lote pase a "PTE. PAGO BROKERGY A CLIENTE".
                </p>
            )}

            <div className="space-y-1.5">
                {filas.map(f => {
                    if (f.error) {
                        return (
                            <div key={f.id} className="p-2.5 rounded-xl border border-red-500/25 bg-red-500/[0.04] text-[10px] text-red-300">
                                {f.numero_expediente}: {f.error}
                            </div>
                        );
                    }
                    const est = estadoCobro(f);
                    const b = bonos[f.id];
                    const descuento = f.cobro?.forma_pago === 'descuento' && f.coste ? f.coste.sin_iva : 0;
                    return (
                        <div key={f.id} className="p-2.5 rounded-xl border border-white/[0.07] bg-white/[0.02]">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[11px] font-black text-white">{f.numero_expediente}</span>
                                <span className="text-[11px] text-white/55 truncate max-w-[16rem]">{f.cliente || '—'}</span>
                                <span className={`ml-auto px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${est.c}`}>{est.t}</span>
                            </div>
                            <div className="mt-1.5 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
                                <p className="text-white/40">
                                    Cuenta: <span className="font-mono text-white/75">{f.iban || f.iban_mascara || 'sin cuenta en la ficha'}</span>
                                    {f.cobro?.iban_cambiado && f.cobro?.iban_anterior_mascara && (
                                        <span className="block text-amber-300/70">antes {f.cobro.iban_anterior_mascara}</span>
                                    )}
                                    {f.justificante_link && (
                                        <a href={f.justificante_link} target="_blank" rel="noreferrer" className="ml-1.5 text-cyan-300/80 hover:underline">justificante</a>
                                    )}
                                </p>
                                <p className="text-white/40">
                                    {f.contacto?.nombre ? `${f.contacto.nombre}` : 'Sin contacto'}
                                    {f.contacto?.tlf ? ` · ${f.contacto.tlf}` : ''}
                                    {f.tercero && <span className="text-white/30"> (persona de contacto)</span>}
                                </p>
                                {f.forma_pago && (
                                    <p className={f.forma_pago.tono === 'aviso' ? 'text-amber-300' : 'text-emerald-300/80'}>
                                        {f.forma_pago.tono === 'aviso' ? '🧾' : '✂️'} {f.forma_pago.texto}
                                    </p>
                                )}
                                {!f.coste && f.cobro?.completado_at && (
                                    <p className="text-white/35">Gestión asumida por Brokergy: no se descuenta nada.</p>
                                )}
                                {canSeeMargin && b && (
                                    <p className="text-white/40">
                                        Bono{b.verificado ? ' verificado' : ' (estimado)'}: <span className="text-white/75">{eur(b.bono)}</span>
                                        {f.cobro?.completado_at && (
                                            <> · a transferir <span className="font-bold text-emerald-300">{eur(b.bono - descuento)}</span>
                                                {f.cobro?.forma_pago === 'factura' && <span className="text-amber-300/80"> tras cobrar la factura</span>}</>
                                        )}
                                    </p>
                                )}
                            </div>
                            {(f.leads || []).length > 0 && (
                                <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                                    {f.leads.map(l => (
                                        <span key={l.id} className="px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-brand/10 text-brand border border-brand/25">
                                            {l.icono} {l.texto}
                                        </span>
                                    ))}
                                </div>
                            )}
                            {activo && (
                                <div className="mt-2 flex items-center gap-2 flex-wrap">
                                    {!f.cobro?.completado_at && (
                                        <button type="button" onClick={() => setEnvio([f])}
                                            className="px-2.5 py-1 rounded-lg border border-white/15 text-[10px] font-bold text-white/70 hover:border-brand/50 hover:text-white transition-all">
                                            {f.cobro?.enviado_at ? '↻ Reenviar' : '📤 Pedir'}
                                        </button>
                                    )}
                                    {f.link && (
                                        <button type="button" onClick={() => copiar(f)}
                                            className="px-2.5 py-1 rounded-lg border border-white/10 text-[10px] font-bold text-white/45 hover:text-white/80 transition-all">
                                            {copiado === f.id ? '✓ Copiado' : '🔗 Copiar enlace'}
                                        </button>
                                    )}
                                    {f.cobro?.enviado_at && (
                                        <span className="text-[9px] text-white/25">
                                            último envío {fecha(f.cobro.enviado_at)}{f.cobro.canales?.length ? ` · ${f.cobro.canales.join(' + ')}` : ''}
                                        </span>
                                    )}
                                    {f.cobro?.completado_at && (
                                        <span className="text-[9px] text-white/25">contestado {fecha(f.cobro.completado_at)}</span>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {envio && (
                <PedirCobroModal
                    filas={envio}
                    onClose={() => setEnvio(null)}
                    onEnviado={() => { cargar(); if (onChanged) onChanged(); }}
                />
            )}
        </div>
    );
}

/**
 * El popup del envío: a quién, por dónde y con qué texto. Se manda de UNO EN UNO
 * por la ruta de siempre (`/api/expedientes/:id/cobro/enviar`), que sella el envío
 * y lo apunta en el historial del expediente: así un envío desde el lote y otro
 * desde el parte dejan el mismo rastro.
 */
function PedirCobroModal({ filas, onClose, onEnviado }) {
    const [marcadas, setMarcadas] = useState(() => new Set(filas.filter(f => f.mensaje).map(f => f.id)));
    const [canales, setCanales] = useState({ whatsapp: true, email: false });
    const [editados, setEditados] = useState({});    // id → texto retocado
    const [abierto, setAbierto] = useState(filas.length === 1 ? filas[0].id : null);
    const [overlay, setOverlay] = useState(null);

    const conTlf = filas.filter(f => f.contacto?.tlf).length;
    const conEmail = filas.filter(f => f.contacto?.email).length;
    const elegidas = filas.filter(f => marcadas.has(f.id));
    const sinCanal = elegidas.filter(f => !((canales.whatsapp && f.contacto?.tlf) || (canales.email && f.contacto?.email)));
    const puede = elegidas.length > 0 && (canales.whatsapp || canales.email) && sinCanal.length < elegidas.length;

    const toggle = (id) => setMarcadas(prev => {
        const s = new Set(prev);
        if (s.has(id)) s.delete(id); else s.add(id);
        return s;
    });

    const enviar = async () => {
        const lista = elegidas.filter(f => !sinCanal.includes(f));
        const items = [];
        let fallos = 0;
        setOverlay({ phase: 'sending', subtitle: `0 de ${lista.length}` });
        for (let i = 0; i < lista.length; i++) {
            const f = lista[i];
            setOverlay({ phase: 'sending', subtitle: `${i + 1} de ${lista.length} · ${f.numero_expediente}` });
            const channels = [
                ...(canales.whatsapp && f.contacto?.tlf ? ['whatsapp'] : []),
                ...(canales.email && f.contacto?.email ? ['email'] : []),
            ];
            try {
                const { data } = await axios.post(`/api/expedientes/${f.id}/cobro/enviar`, {
                    channels,
                    ...(editados[f.id] != null ? { mensaje: editados[f.id] } : {}),
                });
                items.push(`${f.numero_expediente} · ${f.contacto?.nombre || f.cliente || ''} · ${(data.channels || []).join(' + ')}`);
            } catch (e) {
                fallos++;
                items.push({ texto: `${f.numero_expediente}: ${e.response?.data?.error || 'no se pudo enviar'}`, tono: 'aviso' });
            }
        }
        for (const f of sinCanal) {
            items.push({ texto: `${f.numero_expediente}: sin teléfono ni email por el canal elegido — no se le ha mandado`, tono: 'info' });
        }
        setOverlay({
            phase: 'done', ok: fallos < lista.length,
            subtitle: fallos ? `${lista.length - fallos} enviados · ${fallos} con error` : `${lista.length} enviado${lista.length > 1 ? 's' : ''}`,
            items,
        });
        if (onEnviado) onEnviado();
    };

    return createPortal(
        <div className="fixed inset-0 z-[9998] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-6">
            <div className="w-full sm:max-w-2xl max-h-[92dvh] flex flex-col bg-bkg-surface border border-white/10 rounded-t-3xl sm:rounded-3xl overflow-hidden">
                <div className="px-5 pt-5 pb-3 border-b border-white/[0.06] flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-brand">Pago a los clientes</p>
                        <h3 className="text-lg font-black text-white leading-tight mt-0.5">Pedir que confirmen su número de cuenta</h3>
                        <p className="text-[11px] text-white/40 mt-1 leading-snug">
                            Cada cliente recibe la enhorabuena, la cuenta que tenemos (enmascarada) y su enlace, donde la confirma,
                            elige cómo liquidar la gestión y contesta la venta cruzada.
                        </p>
                    </div>
                    <button type="button" onClick={onClose} className="text-white/40 hover:text-white text-xl leading-none px-1">✕</button>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
                    {filas.map(f => {
                        const on = marcadas.has(f.id);
                        const texto = editados[f.id] ?? f.mensaje ?? '';
                        return (
                            <div key={f.id} className={`rounded-2xl border ${on ? 'border-brand/35 bg-brand/[0.04]' : 'border-white/[0.07] bg-white/[0.015]'}`}>
                                <div className="flex items-center gap-2.5 px-3 py-2.5">
                                    <input type="checkbox" checked={on} disabled={!f.mensaje} onChange={() => toggle(f.id)}
                                        className="w-4 h-4 accent-amber-400 shrink-0" />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[12px] font-bold text-white truncate">
                                            {f.numero_expediente} · {f.contacto?.nombre || f.cliente || '—'}
                                        </p>
                                        <p className="text-[10px] text-white/40 truncate">
                                            {[f.contacto?.tlf, f.contacto?.email].filter(Boolean).join(' · ') || 'Sin teléfono ni email'}
                                            {' · '}<span className="font-mono">{f.iban_mascara || 'sin cuenta'}</span>
                                            {f.cobro?.veces > 0 && <span className="text-cyan-300/70"> · ya pedido {f.cobro.veces}×</span>}
                                        </p>
                                    </div>
                                    {f.mensaje && (
                                        <button type="button" onClick={() => setAbierto(a => (a === f.id ? null : f.id))}
                                            className="text-[10px] font-bold text-white/45 hover:text-white shrink-0">
                                            {abierto === f.id ? 'Ocultar' : 'Ver mensaje'}
                                        </button>
                                    )}
                                </div>
                                {abierto === f.id && f.mensaje && (
                                    <div className="px-3 pb-3">
                                        <textarea value={texto} rows={12}
                                            onChange={e => setEditados(p => ({ ...p, [f.id]: e.target.value }))}
                                            className="w-full bg-black/25 border border-white/10 rounded-xl p-3 text-[12px] text-white/85 leading-relaxed outline-none focus:border-brand/50 no-uppercase font-sans" />
                                        {editados[f.id] != null && (
                                            <button type="button" onClick={() => setEditados(p => { const n = { ...p }; delete n[f.id]; return n; })}
                                                className="mt-1 text-[10px] text-white/35 hover:text-white/70">↺ Volver al texto original</button>
                                        )}
                                    </div>
                                )}
                                {!f.mensaje && (
                                    <p className="px-3 pb-2.5 text-[10px] text-white/30 italic">Sin borrador: el lote aún no está en fase de pago.</p>
                                )}
                            </div>
                        );
                    })}
                </div>

                <div className="px-5 py-3 border-t border-white/[0.06] flex items-center gap-2 flex-wrap pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                    <CanalChip canal="whatsapp" nombre="WhatsApp" activo={canales.whatsapp} disponible={conTlf > 0}
                        detalle={`${conTlf} con teléfono`} motivo="Ninguno tiene teléfono"
                        onClick={() => setCanales(c => ({ ...c, whatsapp: !c.whatsapp }))} />
                    <CanalChip canal="email" nombre="Email" activo={canales.email} disponible={conEmail > 0}
                        detalle={`${conEmail} con email`} motivo="Ninguno tiene email"
                        onClick={() => setCanales(c => ({ ...c, email: !c.email }))} />
                    <div className="flex-1" />
                    {sinCanal.length > 0 && puede && (
                        <span className="w-full sm:w-auto text-[10px] text-amber-300/80">
                            ⚠ {sinCanal.length} no {sinCanal.length > 1 ? 'recibirán' : 'recibirá'} nada por el canal elegido
                        </span>
                    )}
                    <button type="button" disabled={!puede} onClick={enviar}
                        className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-brand text-black text-[12px] font-black uppercase tracking-wider disabled:opacity-40 hover:brightness-110 transition-all">
                        Enviar a {elegidas.length - sinCanal.length} cliente{elegidas.length - sinCanal.length === 1 ? '' : 's'}
                    </button>
                </div>
            </div>

            <SendActionOverlay
                phase={overlay?.phase || null}
                ok={!!overlay?.ok}
                subtitle={overlay?.subtitle}
                items={overlay?.items || []}
                sendingTitle="Enviando la enhorabuena…"
                okTitle="Mensajes enviados"
                errorTitle="No se pudo enviar"
                onClose={() => { setOverlay(null); onClose(); }}
            />
        </div>,
        document.body,
    );
}

export default CobroClientesPanel;
