// ─────────────────────────────────────────────────────────────────────────────
// FacturaGestionModal — la FACTURA de los honorarios de gestión de la ayuda CAE,
// desde la fila de un cliente en la fase 7 del lote. Solo ADMIN.
//
// Primero se ELIGE a quién se factura —el CLIENTE o su INSTALADOR, que muchas
// veces pide que se le facture a él— y después se emite contra el libro de
// facturas de la hoja de AppSheet (misma serie {YY}ING_{n} que los CEE directos)
// y se envía con el mensaje a la vista. Con la factura ya emitida, el popup sirve
// para verla y reenviarla.
//
// REGLA — el texto y la línea los compone el BACKEND (logic/facturaGestion.js,
// fuente única): aquí se enseñan y se pueden retocar.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import SendActionOverlay from '../../../components/SendActionOverlay';
import { CanalChip } from '../../../components/CanalChip';
import { eurEs } from '../../cobro/logic/cobroForm';

const CAMPOS = [
    ['razon_social', 'Nombre / razón social', 'sm:col-span-2'],
    ['cif', 'NIF / CIF', ''],
    ['direccion', 'Dirección', 'sm:col-span-2'],
    ['cp', 'C.P.', ''],
    ['municipio', 'Municipio', ''],
    ['provincia', 'Provincia', ''],
];

export function FacturaGestionModal({ lote, f, onClose, onHecho }) {
    const [b, setB] = useState(null);
    const [error, setError] = useState('');
    const [destino, setDestino] = useState(null);
    const [receptor, setReceptor] = useState({});      // datos editados de a quién se factura
    const [fecha, setFecha] = useState('');
    const [observaciones, setObservaciones] = useState('');
    const [canales, setCanales] = useState({ whatsapp: true, email: false });
    const [tlf, setTlf] = useState('');
    const [email, setEmail] = useState('');
    const [mensaje, setMensaje] = useState('');
    const [overlay, setOverlay] = useState(null);

    const base = `/api/lotes/${lote.id}/cobros/${f.id}/factura-gestion`;

    // Al elegir destino se cargan SUS datos, su contacto, sus observaciones y su mensaje.
    const elegir = (data, k) => {
        if (!data || !k) return;
        const d = data.porDestino?.[k];
        setDestino(k);
        setReceptor(data.registro ? (data.registro.receptor || {}) : (data.destinatarios?.[k] || {}));
        setObservaciones(data.registro ? (data.registro.observaciones || '') : (d?.observaciones || ''));
        setMensaje(d?.mensaje || '');
        setTlf(d?.contacto?.tlf || '');
        setEmail(d?.contacto?.email || '');
        setCanales({ whatsapp: !!d?.contacto?.tlf, email: !d?.contacto?.tlf && !!d?.contacto?.email });
    };

    useEffect(() => {
        let vivo = true;
        axios.get(base).then(({ data }) => {
            if (!vivo) return;
            setB(data);
            setFecha(data.fecha);
            elegir(data, data.registro?.destino || data.destinoDefecto);
        }).catch(e => vivo && setError(e.response?.data?.error || 'No se pudo preparar la factura.'));
        return () => { vivo = false; };
    }, [base]);

    const emitida = b?.registro || null;
    const faltan = ['razon_social', 'cif'].filter(k => !String(receptor[k] || '').trim());
    const hayCanal = (canales.whatsapp && tlf.trim()) || (canales.email && email.trim());
    const puedeEmitir = b && !b.bloqueo && !b.errorHoja && destino && !faltan.length && b.total > 0;

    const enviarBody = () => ({
        canales: [...(canales.whatsapp && tlf.trim() ? ['whatsapp'] : []), ...(canales.email && email.trim() ? ['email'] : [])],
        tlf: tlf.trim(), email: email.trim(), mensaje,
    });

    const lineasResultado = (envio) => {
        if (!envio) return [];
        if (envio.error) return [{ texto: `No se envió: ${envio.error}`, tono: 'aviso' }];
        return Object.entries(envio.resultados || {}).map(([k, r]) => r.ok
            ? `${k === 'whatsapp' ? 'WhatsApp' : 'Email'} → ${r.to}`
            : { texto: `${k === 'whatsapp' ? 'WhatsApp' : 'Email'}: ${r.error}`, tono: 'aviso' });
    };

    const emitir = async (conEnvio) => {
        setOverlay({ phase: 'sending', subtitle: conEnvio ? 'Reservando el número, generando el PDF y enviando…' : 'Reservando el número y generando el PDF…' });
        try {
            const { data } = await axios.post(base, {
                destino, fecha, observaciones, receptor,
                ...(conEnvio ? { enviar: { ...enviarBody(), numero_previsto: b.proximoNumero } } : {}),
            });
            const items = [
                `Factura ${data.numero} · ${eurEs(data.total)} · a ${data.receptor}`,
                data.pdf ? 'PDF en la carpeta FACTURAS de AppSheet' : { texto: `Sin PDF: ${data.errorPdf}. Se rehace con el mismo número desde «Ver PDF».`, tono: 'aviso' },
                // Las otras dos copias: contabilidad (ventas, por mes) y la carpeta del expediente.
                ...(data.pdf ? [
                    data.pdf.contabilidad?.ruta ? `Copia en contabilidad: ${data.pdf.contabilidad.ruta}`
                        : { texto: `Sin copia en contabilidad: ${data.pdf.contabilidad?.error || 'desconocido'}`, tono: 'aviso' },
                    data.pdf.expediente?.id ? 'Copia en «5. FACTURAS» del expediente'
                        : { texto: `Sin copia en el expediente: ${data.pdf.expediente?.error || 'desconocido'}`, tono: 'aviso' },
                ] : []),
                ...(data.clienteCreadoEnHoja ? [{ texto: 'Dado de alta en CLIENTES de la hoja (no estaba)', tono: 'info' }] : []),
                ...lineasResultado(data.envio),
            ];
            setOverlay({ phase: 'done', ok: true, subtitle: `Factura ${data.numero}`, items });
            if (onHecho) onHecho();
        } catch (e) {
            setOverlay({ phase: 'done', ok: false, subtitle: e.response?.data?.error || 'No se pudo emitir la factura', items: [] });
        }
    };

    const reenviar = async () => {
        setOverlay({ phase: 'sending', subtitle: `Enviando la factura ${emitida.numero}…` });
        try {
            const { data } = await axios.post(`${base}/enviar`, enviarBody());
            const items = lineasResultado(data);
            setOverlay({ phase: 'done', ok: (data.canalesOk || []).length > 0, subtitle: `Factura ${emitida.numero}`, items });
            if (onHecho) onHecho();
        } catch (e) {
            setOverlay({ phase: 'done', ok: false, subtitle: e.response?.data?.error || 'No se pudo enviar', items: [] });
        }
    };

    const verPdf = async () => {
        try {
            const { data } = await axios.get(`${base}/pdf`, { responseType: 'blob' });
            window.open(URL.createObjectURL(data), '_blank', 'noopener');
        } catch {
            setError('No se pudo abrir el PDF.');
        }
    };

    const dest = b?.destinatarios || {};
    const tarjeta = (k, titulo) => {
        const d = dest[k];
        const on = destino === k;
        return (
            <button key={k} type="button" disabled={!d || !!emitida} onClick={() => elegir(b, k)}
                className={`text-left px-3 py-2.5 rounded-2xl border transition-all disabled:cursor-default ${on
                    ? 'border-brand/60 bg-brand/[0.08]' : d ? 'border-white/10 hover:border-white/25' : 'border-white/[0.06] opacity-40'}`}>
                <span className="block text-[9px] font-black uppercase tracking-widest text-white/40">{titulo}</span>
                <span className="block text-[12px] font-bold text-white mt-0.5 truncate">{d?.razon_social || (k === 'instalador' ? 'Sin instalador asignado' : 'Sin cliente')}</span>
                {d && <span className="block text-[10px] text-white/40 truncate">{d.cif || 'SIN NIF'}{d.municipio ? ` · ${d.municipio}` : ''}</span>}
            </button>
        );
    };

    return createPortal(
        <div className="fixed inset-0 z-[9998] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-6">
            <div className="w-full sm:max-w-2xl max-h-[92dvh] flex flex-col bg-bkg-surface border border-white/10 rounded-t-3xl sm:rounded-3xl overflow-hidden">
                <div className="px-5 pt-5 pb-3 border-b border-white/[0.06] flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-brand">Pago a los clientes</p>
                        <h3 className="text-lg font-black text-white leading-tight mt-0.5">
                            {emitida ? `Factura ${emitida.numero}` : 'Factura de la gestión'}
                        </h3>
                        <p className="text-[11px] text-white/45 mt-1 leading-snug">{f.numero_expediente} · {f.cliente || '—'}</p>
                    </div>
                    <button type="button" onClick={onClose} className="text-white/40 hover:text-white text-xl leading-none px-1">✕</button>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3.5">
                    {error && <p className="text-[11px] text-red-400">{error}</p>}
                    {!b && !error && <p className="text-[11px] text-white/40">Leyendo el libro de facturas…</p>}
                    {b?.bloqueo && !emitida && <p className="rounded-xl border border-amber-400/30 bg-amber-400/[0.06] px-3 py-2 text-[11px] text-amber-200">{b.bloqueo}</p>}
                    {b?.errorHoja && !emitida && <p className="rounded-xl border border-red-400/30 bg-red-400/[0.06] px-3 py-2 text-[11px] text-red-300">El libro de facturas no responde: {b.errorHoja}</p>}

                    {b && (
                        <>
                            <div>
                                <p className="text-[9px] font-black uppercase tracking-widest text-white/35 mb-1.5">{emitida ? 'Facturada a' : '¿A quién se le factura?'}</p>
                                <div className="grid grid-cols-2 gap-2">
                                    {tarjeta('cliente', 'El cliente')}
                                    {tarjeta('instalador', 'El instalador')}
                                </div>
                            </div>

                            {!emitida && destino && (
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                    {CAMPOS.map(([k, label, span]) => (
                                        <label key={k} className={`block ${span}`}>
                                            <span className={`block text-[9px] font-bold uppercase tracking-wider mb-0.5 ${['razon_social', 'cif'].includes(k) && !String(receptor[k] || '').trim() ? 'text-red-300' : 'text-white/35'}`}>{label}</span>
                                            <input value={receptor[k] || ''} onChange={e => setReceptor(r => ({ ...r, [k]: e.target.value }))}
                                                className="w-full bg-black/25 border border-white/10 rounded-lg px-2.5 py-1.5 text-[11px] text-white/85 outline-none focus:border-brand/50" />
                                        </label>
                                    ))}
                                </div>
                            )}

                            <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 space-y-1">
                                {(b.lineas || []).map((l, i) => (
                                    <div key={i} className="flex items-baseline gap-2 text-[11px]">
                                        <span className="flex-1 text-white/80">{l.descripcion}</span>
                                        <span className="font-mono text-white/70">{eurEs(l.precio)}</span>
                                    </div>
                                ))}
                                <div className="flex items-baseline gap-2 text-[10px] text-white/40 pt-1 border-t border-white/[0.06]">
                                    <span className="flex-1">Base {eurEs(b.neto)} · IVA {eurEs(b.iva)}</span>
                                    <span className="text-[13px] font-black text-white">{eurEs(b.total)}</span>
                                </div>
                                <p className="text-[10px] text-white/35">
                                    {emitida
                                        ? `Emitida el ${new Date(emitida.emitida_at).toLocaleDateString('es-ES')} · ${emitida.estado === 'PAGADA' ? '✓ cobrada' : 'pendiente de cobro'}`
                                        : `Nº que le tocaría: ${b.proximoNumero || '—'} (serie del libro de AppSheet)`}
                                </p>
                            </div>

                            {!emitida && (
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                    <label className="block">
                                        <span className="block text-[9px] font-bold uppercase tracking-wider text-white/35 mb-0.5">Fecha</span>
                                        <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
                                            className="w-full bg-black/25 border border-white/10 rounded-lg px-2.5 py-1.5 text-[11px] text-white/85 outline-none focus:border-brand/50" />
                                    </label>
                                    <label className="block sm:col-span-2">
                                        <span className="block text-[9px] font-bold uppercase tracking-wider text-white/35 mb-0.5">Observaciones (salen en la factura)</span>
                                        <textarea value={observaciones} rows={2} onChange={e => setObservaciones(e.target.value)}
                                            className="w-full bg-black/25 border border-white/10 rounded-lg px-2.5 py-1.5 text-[11px] text-white/85 outline-none focus:border-brand/50 no-uppercase" />
                                    </label>
                                </div>
                            )}

                            <div>
                                <p className="text-[9px] font-black uppercase tracking-widest text-white/35 mb-1.5">Envío</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                                    <input value={tlf} onChange={e => setTlf(e.target.value)} placeholder="Teléfono (WhatsApp)"
                                        className="bg-black/25 border border-white/10 rounded-lg px-2.5 py-1.5 text-[11px] text-white/85 outline-none focus:border-brand/50" />
                                    <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email"
                                        className="bg-black/25 border border-white/10 rounded-lg px-2.5 py-1.5 text-[11px] text-white/85 outline-none focus:border-brand/50 no-uppercase" />
                                </div>
                                {destino === 'instalador' && b.porDestino?.instalador?.contacto?.general && (
                                    <p className="text-[10px] text-amber-300/80 mb-1.5">El instalador no tiene contacto comercial marcado: va al canal general de la empresa.</p>
                                )}
                                <textarea value={mensaje} rows={10} onChange={e => setMensaje(e.target.value)}
                                    className="w-full bg-black/25 border border-white/10 rounded-xl p-3 text-[12px] text-white/85 leading-relaxed outline-none focus:border-brand/50 no-uppercase font-sans" />
                            </div>
                        </>
                    )}
                </div>

                <div className="px-5 py-3 border-t border-white/[0.06] flex items-center gap-2 flex-wrap pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                    <CanalChip canal="whatsapp" nombre="WhatsApp" activo={canales.whatsapp} disponible={!!tlf.trim()}
                        detalle={tlf || 'sin teléfono'} motivo="Sin teléfono" onClick={() => setCanales(c => ({ ...c, whatsapp: !c.whatsapp }))} />
                    <CanalChip canal="email" nombre="Email" activo={canales.email} disponible={!!email.trim()}
                        detalle={email || 'sin email'} motivo="Sin email" onClick={() => setCanales(c => ({ ...c, email: !c.email }))} />
                    <div className="flex-1" />
                    {emitida ? (
                        <>
                            <button type="button" onClick={verPdf}
                                className="px-4 py-2.5 rounded-xl border border-white/15 text-[12px] font-bold text-white/75 hover:text-white">Ver PDF</button>
                            <button type="button" disabled={!hayCanal} onClick={reenviar}
                                className="px-5 py-2.5 rounded-xl bg-brand text-black text-[12px] font-black uppercase tracking-wider disabled:opacity-40 hover:brightness-110">
                                Reenviar
                            </button>
                        </>
                    ) : (
                        <>
                            <button type="button" disabled={!puedeEmitir} onClick={() => emitir(false)}
                                className="px-4 py-2.5 rounded-xl border border-white/15 text-[12px] font-bold text-white/75 hover:text-white disabled:opacity-40">
                                Solo emitir
                            </button>
                            <button type="button" disabled={!puedeEmitir || !hayCanal} onClick={() => emitir(true)}
                                className="px-5 py-2.5 rounded-xl bg-brand text-black text-[12px] font-black uppercase tracking-wider disabled:opacity-40 hover:brightness-110">
                                Emitir y enviar
                            </button>
                        </>
                    )}
                </div>
            </div>

            <SendActionOverlay
                phase={overlay?.phase || null}
                ok={!!overlay?.ok}
                subtitle={overlay?.subtitle}
                items={overlay?.items || []}
                sendingTitle={emitida ? 'Enviando la factura…' : 'Emitiendo la factura…'}
                okTitle={emitida ? 'Factura enviada' : 'Factura emitida'}
                errorTitle="No se pudo completar"
                onClose={() => { const ok = overlay?.ok; setOverlay(null); if (ok) onClose(); }}
            />
        </div>,
        document.body,
    );
}

export default FacturaGestionModal;
