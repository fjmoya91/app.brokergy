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
import { RemesaSepaModal, JustificanteModal, AvisoTransferenciaModal, AvisoInstaladoresModal } from './PagoClientesModals';
import { FacturaGestionModal } from './FacturaGestionModal';
import { resumenPago } from '../logic/pagoClientes';

const eur = eurEs;
const fecha = (iso) => (iso ? new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '');
const diasDesde = (iso) => (iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)) : null);

/** En qué punto está el cobro de un cliente, dicho en una chapa. */
function estadoCobro(f) {
    const c = f.cobro || {};
    if (c.completado_at) {
        if (c.iban_cambiado) return { t: '⚠ Cuenta cambiada', c: 'bg-amber-500/15 text-amber-300 border-amber-500/35', orden: 1 };
        return { t: `✓ Confirmada${c.origen === 'tally' ? ' (Tally)' : c.origen === 'manual' ? ' a mano' : ''}`, c: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35', orden: 3 };
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
    // Después de confirmar: remesa SEPA → justificante → aviso (+ reseña programada).
    const [remesa, setRemesa] = useState(false);
    const [justif, setJustif] = useState(false);
    const [aviso, setAviso] = useState(null);       // filas a las que se avisa (abre el popup)
    const [avisoInst, setAvisoInst] = useState(false); // aviso a los instaladores (abre el popup)

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
    const pago = resumenPago(filas);
    const todasConfirmadas = filas.length > 0 && pendientes.length === 0;
    const refrescar = () => { cargar(); if (onChanged) onChanged(); };

    // Regalarle la gestión (o deshacerlo). Solo ADMIN: es dinero. La remesa, el
    // formulario y los mensajes lo leen del expediente (`contextoCobro`).
    const [regalando, setRegalando] = useState(null);
    const regalarGestion = async (f, bonificada) => {
        setRegalando(f.id);
        setError('');
        try {
            await axios.post(`/api/lotes/${lote.id}/cobros/${f.id}/gestion-bonificada`, { bonificada });
            await cargar();
        } catch (e) {
            setError(e.response?.data?.error || 'No se pudo cambiar la gestión del cliente.');
        } finally {
            setRegalando(null);
        }
    };

    // Confirmar la cuenta POR el cliente (el que desconfía del enlace y lo dice por
    // teléfono). Solo ADMIN: es la cuenta a la que se transfiere.
    const [validar, setValidar] = useState(null);   // fila que se valida (abre el popup)
    // La factura de los honorarios de gestión (al cliente o a su instalador). Solo ADMIN.
    const [facturaG, setFacturaG] = useState(null); // fila cuya factura se emite / reenvía
    const [cobrandoF, setCobrandoF] = useState(null);
    const marcarFacturaPagada = async (f, pagada) => {
        setCobrandoF(f.id);
        setError('');
        try {
            await axios.post(`/api/lotes/${lote.id}/cobros/${f.id}/factura-gestion/pagada`, { pagada });
            refrescar();
        } catch (e) {
            setError(e.response?.data?.error || 'No se pudo marcar la factura.');
        } finally {
            setCobrandoF(null);
        }
    };
    const deshacerValidacion = async (f) => {
        if (!window.confirm(`¿Deshacer la confirmación a mano de ${f.numero_expediente}?`)) return;
        setError('');
        try {
            await axios.post(`/api/lotes/${lote.id}/cobros/${f.id}/validar-manual`, { validar: false });
            refrescar();
        } catch (e) {
            setError(e.response?.data?.error || 'No se pudo deshacer la validación.');
        }
    };

    const cancelarResena = async (f) => {
        try {
            await axios.post(`/api/lotes/${lote.id}/transferencia/${f.id}/resena/cancelar`);
            cargar();
        } catch (e) {
            setError(e.response?.data?.error || 'No se pudo cancelar la reseña.');
        }
    };

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
                    {pago.transferidas.length > 0 && <> · <span className="text-cyan-300">{pago.transferidas.length} transferido{pago.transferidas.length > 1 ? 's' : ''}</span></>}
                    {pago.resenasProg.length > 0 && <> · <span className="text-white/60">{pago.resenasProg.length} reseña{pago.resenasProg.length > 1 ? 's' : ''} programada{pago.resenasProg.length > 1 ? 's' : ''}</span></>}
                </p>
            )}

            {/* Cuando han confirmado TODOS, se dice: es el momento de la remesa. */}
            {activo && todasConfirmadas && pago.transferidas.length < filas.length && (
                <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/[0.06] px-3 py-2 text-[11px] text-emerald-200 leading-snug">
                    ✅ <span className="font-bold">Han confirmado todos.</span>{' '}
                    {canSeeMargin ? 'Ya puedes generar la remesa SEPA para BBVA.' : 'Ya se puede preparar la transferencia (la hace un administrador).'}
                </div>
            )}

            {activo && canSeeMargin && confirmadas.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                    <button type="button" onClick={() => setRemesa(true)}
                        className={`px-3.5 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all ${todasConfirmadas && !pago.enRemesa.length
                            ? 'bg-brand text-black hover:brightness-110' : 'border border-white/15 text-white/75 hover:border-brand/50 hover:text-white'}`}>
                        🏦 Remesa SEPA (BBVA)
                    </button>
                    {pago.enRemesa.length > 0 && (
                        <button type="button" onClick={() => setJustif(true)}
                            className={`px-3.5 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all ${pago.enRemesa.length > pago.transferidas.length
                                ? 'bg-brand text-black hover:brightness-110' : 'border border-white/15 text-white/75 hover:border-brand/50 hover:text-white'}`}>
                            📎 Subir justificante de la transferencia
                        </button>
                    )}
                    {pago.sinAvisar.length > 0 && (
                        <button type="button" onClick={() => setAviso(pago.sinAvisar)}
                            className="px-3.5 py-2 rounded-xl bg-brand text-black text-[11px] font-black uppercase tracking-wider hover:brightness-110 transition-all">
                            📣 Avisar de la transferencia ({pago.sinAvisar.length})
                        </button>
                    )}
                    {pago.transferidas.length > 0 && (
                        <button type="button" onClick={() => setAvisoInst(true)}
                            title="Un mensaje por instalador: qué clientes suyos ya han cobrado"
                            className="px-3.5 py-2 rounded-xl border border-white/15 text-white/75 text-[11px] font-black uppercase tracking-wider hover:border-brand/50 hover:text-white transition-all">
                            📣 Avisar a los instaladores
                        </button>
                    )}
                    {!todasConfirmadas && (
                        <span className="text-[9px] text-white/30">Aún faltan {pendientes.length} por confirmar: la remesa solo lleva a los que ya lo han hecho.</span>
                    )}
                </div>
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
                                {!f.coste && !f.gestion_bonificada && f.cobro?.completado_at && (
                                    <p className="text-white/35">Gestión asumida por Brokergy: no se descuenta nada.</p>
                                )}
                                {/* La gestión REGALADA: no se le cobra y los mensajes se lo dicen. */}
                                {canSeeMargin && f.gestion_bonificada && (
                                    <p className="sm:col-span-2 text-fuchsia-200/90">
                                        🎁 Gestión regalada: no se le cobran los {eur(f.gestion_bonificada.importe)} y el mensaje se lo dice.
                                        {!f.pago?.remesa && (
                                            <button type="button" disabled={regalando === f.id} onClick={() => regalarGestion(f, false)}
                                                className="ml-2 text-white/40 hover:text-white underline disabled:opacity-40">
                                                {regalando === f.id ? '…' : 'Deshacer'}
                                            </button>
                                        )}
                                        {f.cobro?.enviado_at && f.gestion_bonificada.at && f.gestion_bonificada.at > f.cobro.enviado_at && (
                                            <span className="block text-amber-300/80">Se le pidió la cuenta antes del regalo: reenvíale el mensaje para que lo sepa.</span>
                                        )}
                                    </p>
                                )}
                                {canSeeMargin && f.coste && !f.pago?.remesa && !f.factura_gestion && (
                                    <p className="sm:col-span-2 flex items-center gap-1.5 flex-wrap">
                                        <button type="button" disabled={regalando === f.id} onClick={() => regalarGestion(f, true)}
                                            title="No se le cobran los honorarios de gestión: la remesa no los descuenta y el mensaje se lo cuenta como un regalo"
                                            className="px-2 py-0.5 rounded-md border border-fuchsia-400/30 text-fuchsia-200/80 text-[10px] font-bold hover:bg-fuchsia-400/10 disabled:opacity-40 transition-all">
                                            {regalando === f.id ? 'Guardando…' : `🎁 No cobrarle la gestión (${eur(f.coste.sin_iva)})`}
                                        </button>
                                        <button type="button" onClick={() => setFacturaG(f)}
                                            title="Factura de los honorarios de gestión, al cliente o a su instalador, en la serie del libro de AppSheet"
                                            className={`px-2 py-0.5 rounded-md border text-[10px] font-bold transition-all ${f.cobro?.forma_pago === 'factura'
                                                ? 'border-amber-400/50 text-amber-200 bg-amber-400/10 hover:bg-amber-400/20' : 'border-white/15 text-white/60 hover:text-white hover:border-white/30'}`}>
                                            🧾 Emitir factura de la gestión ({eur(f.coste.total)})
                                        </button>
                                    </p>
                                )}
                                {/* La factura de gestión ya EMITIDA: a quién, estado, y cobrarla. */}
                                {f.factura_gestion && (
                                    <p className="sm:col-span-2 text-[10px] text-white/55 flex items-center gap-1.5 flex-wrap">
                                        <span className={`px-1.5 py-0.5 rounded-md border ${f.factura_gestion.estado === 'PAGADA'
                                            ? 'border-emerald-400/30 text-emerald-300' : 'border-amber-400/35 text-amber-200'}`}>
                                            🧾 Factura {f.factura_gestion.numero}
                                            {f.factura_gestion.total != null ? ` · ${eur(f.factura_gestion.total)}` : ''}
                                            {' · '}{f.factura_gestion.estado === 'PAGADA' ? '✓ cobrada' : 'pendiente de cobro'}
                                        </span>
                                        <span className="text-white/40">
                                            a {f.factura_gestion.destino === 'instalador' ? 'el instalador' : 'el cliente'}
                                            {f.factura_gestion.receptor ? ` (${f.factura_gestion.receptor})` : ''}
                                            {f.factura_gestion.enviada_at ? ` · enviada ${fecha(f.factura_gestion.enviada_at)}` : ' · sin enviar'}
                                        </span>
                                        {canSeeMargin && (
                                            <>
                                                <button type="button" onClick={() => setFacturaG(f)} className="text-white/45 hover:text-white underline">Ver / reenviar</button>
                                                {!f.pago?.remesa && (
                                                    <button type="button" disabled={cobrandoF === f.id}
                                                        onClick={() => marcarFacturaPagada(f, f.factura_gestion.estado !== 'PAGADA')}
                                                        className={f.factura_gestion.estado === 'PAGADA' ? 'text-white/35 hover:text-white underline' : 'px-1.5 py-0.5 rounded-md border border-emerald-400/40 text-emerald-300 font-bold hover:bg-emerald-400/10'}>
                                                        {cobrandoF === f.id ? '…' : f.factura_gestion.estado === 'PAGADA' ? 'Desmarcar cobrada' : '✓ Marcar cobrada'}
                                                    </button>
                                                )}
                                            </>
                                        )}
                                    </p>
                                )}
                                {/* VARIOS CEDENTES con cuenta propia: el ingreso se parte. */}
                                {Array.isArray(f.reparto) && f.reparto.length > 1 && (
                                    <div className="sm:col-span-2 rounded-lg border border-amber-400/25 bg-amber-400/[0.05] px-2.5 py-1.5 space-y-0.5">
                                        <p className="text-[9px] font-black uppercase tracking-widest text-amber-300/80">El ingreso se reparte en {f.reparto.length} cuentas</p>
                                        {f.reparto.map((g, k) => (
                                            <p key={k} className="text-white/55">
                                                {g.cedentes.join(' + ')} · {String(g.cuota_pct).replace('.', ',')} %
                                                {' · '}<span className="font-mono text-white/75">{g.iban || g.iban_mascara || 'sin cuenta'}</span>
                                                {canSeeMargin && b && f.cobro?.completado_at && (
                                                    <> · <span className="font-bold text-emerald-300">{eur((b.bono - descuento) * g.cuota_pct / 100)}</span></>
                                                )}
                                            </p>
                                        ))}
                                    </div>
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
                            <EstadoPago f={f} admin={canSeeMargin} onAvisar={() => setAviso([f])} onCancelarResena={() => cancelarResena(f)} />
                            {activo && (
                                <div className="mt-2 flex items-center gap-2 flex-wrap">
                                    {!f.cobro?.completado_at && (
                                        <button type="button" onClick={() => setEnvio([f])}
                                            className="px-2.5 py-1 rounded-lg border border-white/15 text-[10px] font-bold text-white/70 hover:border-brand/50 hover:text-white transition-all">
                                            {f.cobro?.enviado_at ? '↻ Reenviar' : '📤 Pedir'}
                                        </button>
                                    )}
                                    {canSeeMargin && !f.cobro?.completado_at && (
                                        <button type="button" onClick={() => setValidar(f)}
                                            title="El cliente la ha confirmado por teléfono (o desconfía del enlace): se marca como confirmada y entra en la remesa"
                                            className="px-2.5 py-1 rounded-lg border border-emerald-400/30 text-[10px] font-bold text-emerald-300/85 hover:bg-emerald-400/10 transition-all">
                                            ✓ Validar a mano
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
                                    {f.cobro?.completado_at && f.cobro.origen !== 'manual' && (
                                        <span className="text-[9px] text-white/25">contestado {fecha(f.cobro.completado_at)}</span>
                                    )}
                                    {f.cobro?.completado_at && f.cobro.origen === 'manual' && (
                                        <span className="text-[9px] text-white/35">
                                            validada a mano {fecha(f.cobro.completado_at)}
                                            {f.cobro.validado_manual?.por ? ` por ${f.cobro.validado_manual.por}` : ''}
                                            {f.cobro.validado_manual?.nota ? ` · ${f.cobro.validado_manual.nota}` : ''}
                                            {canSeeMargin && !f.pago?.remesa && (
                                                <button type="button" onClick={() => deshacerValidacion(f)}
                                                    className="ml-1.5 text-white/40 hover:text-white underline">Deshacer</button>
                                            )}
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {remesa && <RemesaSepaModal lote={lote} onClose={() => setRemesa(false)} onHecho={refrescar} />}
            {justif && (
                <JustificanteModal lote={lote} filas={filas} onClose={() => setJustif(false)}
                    onSubido={(ids) => {
                        setJustif(false);
                        refrescar();
                        // Subido el justificante, lo siguiente es avisar: se abre ya.
                        setAviso(filas.filter(f => ids.includes(f.id)));
                    }} />
            )}
            {avisoInst && <AvisoInstaladoresModal lote={lote} onClose={() => setAvisoInst(false)} onEnviado={refrescar} />}
            {aviso && aviso.length > 0 && (
                <AvisoTransferenciaModal lote={lote} filas={aviso} onClose={() => setAviso(null)} onEnviado={refrescar} />
            )}

            {facturaG && (
                <FacturaGestionModal lote={lote} f={facturaG}
                    onClose={() => setFacturaG(null)}
                    onHecho={refrescar} />
            )}

            {validar && (
                <ValidarCuentaModal lote={lote} f={validar}
                    onClose={() => setValidar(null)}
                    onHecho={() => { setValidar(null); refrescar(); }} />
            )}

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

/** Remesa → transferido → avisado → reseña, en una línea por cliente. */
function EstadoPago({ f, admin, onAvisar, onCancelarResena }) {
    const p = f.pago || {};
    if (!p.remesa && !p.transferencia) return null;
    const r = p.resena;
    return (
        <div className="mt-1.5 flex items-center gap-1.5 flex-wrap text-[9px]">
            {p.remesa && (
                <span className="px-1.5 py-0.5 rounded-md border border-white/15 text-white/55">
                    🏦 Remesa {fecha(p.remesa.at)}{admin && p.remesa.importe != null ? ` · ${eur(p.remesa.importe)}` : ''}
                </span>
            )}
            {p.transferencia ? (
                <span className="px-1.5 py-0.5 rounded-md border border-cyan-400/30 text-cyan-300">
                    💸 Transferido {fecha(p.transferencia.at)}
                    {p.transferencia.justificante_link && (
                        <a href={p.transferencia.justificante_link} target="_blank" rel="noreferrer" className="ml-1 underline">justificante</a>
                    )}
                </span>
            ) : (
                <span className="px-1.5 py-0.5 rounded-md border border-white/10 text-white/35">falta el justificante</span>
            )}
            {p.transferencia && (p.transferencia.aviso_at
                ? <span className="px-1.5 py-0.5 rounded-md border border-emerald-400/30 text-emerald-300">✓ Avisado {fecha(p.transferencia.aviso_at)}</span>
                : admin && <button type="button" onClick={onAvisar} className="px-1.5 py-0.5 rounded-md border border-brand/40 text-brand font-bold hover:bg-brand/10">📣 Avisar</button>)}
            {r?.enviada_at && <span className="px-1.5 py-0.5 rounded-md border border-emerald-400/30 text-emerald-300">⭐ Reseña pedida {fecha(r.enviada_at)}</span>}
            {r && !r.enviada_at && !r.cancelada_at && r.programada_para && (
                <span className="px-1.5 py-0.5 rounded-md border border-white/15 text-white/60">
                    ⭐ Reseña el {new Date(r.programada_para).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    {admin && <button type="button" onClick={onCancelarResena} className="ml-1 text-white/40 hover:text-red-300" title="No pedirla">✕</button>}
                </span>
            )}
            {r?.cancelada_at && <span className="px-1.5 py-0.5 rounded-md border border-white/10 text-white/30">reseña cancelada</span>}
            {r?.error && !r.enviada_at && <span className="px-1.5 py-0.5 rounded-md border border-red-400/30 text-red-300">⚠ reseña: {r.error}</span>}
        </div>
    );
}

/**
 * Validar A MANO la cuenta de un cliente: el que desconfía del enlace («¿esto es un
 * timo?») y la confirma por teléfono. Se sella como si hubiera contestado
 * (`origen: 'manual'`, con quién y la nota) y así entra en la remesa. Solo la cuenta
 * que YA consta: una distinta se cambia antes en la ficha, con su justificante.
 */
function ValidarCuentaModal({ lote, f, onClose, onHecho }) {
    // Con la factura de gestión ya emitida, la forma de pago es esa (la fija el servidor).
    const pideForma = !!f.coste && !f.gestion_bonificada && !f.factura_gestion;
    const [forma, setForma] = useState(pideForma ? 'descuento' : null);
    const [nota, setNota] = useState('Confirmada por teléfono con el cliente');
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState('');
    const sinCuenta = !f.iban && !f.iban_mascara;

    const confirmar = async () => {
        setGuardando(true);
        setError('');
        try {
            await axios.post(`/api/lotes/${lote.id}/cobros/${f.id}/validar-manual`, {
                validar: true, nota, ...(pideForma ? { forma_pago: forma } : {}),
            });
            onHecho();
        } catch (e) {
            setError(e.response?.data?.error || 'No se pudo validar la cuenta.');
            setGuardando(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[9998] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-6">
            <div className="w-full sm:max-w-md bg-bkg-surface border border-white/10 rounded-t-3xl sm:rounded-3xl overflow-hidden">
                <div className="px-5 pt-5 pb-3 border-b border-white/[0.06] flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-brand">Pago a los clientes</p>
                        <h3 className="text-lg font-black text-white leading-tight mt-0.5">Validar la cuenta a mano</h3>
                        <p className="text-[11px] text-white/45 mt-1 leading-snug">
                            {f.numero_expediente} · {f.cliente || '—'}
                        </p>
                    </div>
                    <button type="button" onClick={onClose} className="text-white/40 hover:text-white text-xl leading-none px-1">✕</button>
                </div>

                <div className="px-5 py-4 space-y-3">
                    <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5">
                        <p className="text-[9px] font-black uppercase tracking-widest text-white/35">Cuenta que consta en la ficha</p>
                        <p className="font-mono text-[13px] text-white mt-0.5">{f.iban || f.iban_mascara || 'sin cuenta en la ficha'}</p>
                        {Array.isArray(f.reparto) && f.reparto.length > 1 && (
                            <p className="text-[10px] text-amber-300/80 mt-1">El ingreso se reparte en {f.reparto.length} cuentas: se validan todas las de la ficha.</p>
                        )}
                    </div>
                    <p className="text-[11px] text-white/50 leading-snug">
                        Úsalo solo si el cliente te ha confirmado ESTA cuenta (por teléfono, en persona…). Queda marcada como
                        confirmada a tu nombre y entra en la remesa SEPA. Si te da otra cuenta, cámbiala antes en su ficha
                        con el justificante de titularidad.
                    </p>

                    {pideForma && (
                        <div>
                            <p className="text-[9px] font-black uppercase tracking-widest text-white/35 mb-1.5">
                                Cómo liquida la gestión ({eur(f.coste.sin_iva)} + IVA)
                            </p>
                            <div className="grid grid-cols-2 gap-2">
                                {[
                                    { v: 'descuento', t: '✂️ Descontada del ingreso', d: `se le descuentan ${eur(f.coste.sin_iva)}` },
                                    { v: 'factura', t: '🧾 Con factura', d: `${eur(f.coste.total)}, antes del ingreso` },
                                ].map(o => (
                                    <button key={o.v} type="button" onClick={() => setForma(o.v)}
                                        className={`text-left px-3 py-2 rounded-xl border transition-all ${forma === o.v
                                            ? 'border-brand/60 bg-brand/[0.08] text-white' : 'border-white/10 text-white/60 hover:border-white/25'}`}>
                                        <span className="block text-[11px] font-bold">{o.t}</span>
                                        <span className="block text-[9px] text-white/40 mt-0.5">{o.d}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-white/35 mb-1.5">Cómo se ha confirmado</p>
                        <input type="text" value={nota} maxLength={300} onChange={e => setNota(e.target.value)}
                            className="w-full bg-black/25 border border-white/10 rounded-xl px-3 py-2 text-[12px] text-white/85 outline-none focus:border-brand/50 no-uppercase" />
                    </div>

                    {error && <p className="text-[11px] text-red-400">{error}</p>}
                </div>

                <div className="px-5 py-3 border-t border-white/[0.06] flex items-center gap-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                    <button type="button" onClick={onClose}
                        className="px-4 py-2.5 rounded-xl border border-white/15 text-[12px] font-bold text-white/70 hover:text-white">Cancelar</button>
                    <div className="flex-1" />
                    <button type="button" disabled={guardando || sinCuenta || (pideForma && !forma)} onClick={confirmar}
                        className="px-5 py-2.5 rounded-xl bg-emerald-400 text-black text-[12px] font-black uppercase tracking-wider disabled:opacity-40 hover:brightness-110 transition-all">
                        {guardando ? 'Guardando…' : '✓ Confirmar la cuenta'}
                    </button>
                </div>
            </div>
        </div>,
        document.body,
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
