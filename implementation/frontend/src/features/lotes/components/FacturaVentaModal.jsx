// ─────────────────────────────────────────────────────────────────────────────
// FacturaVentaModal — la FACTURA de VENTA DEL AHORRO de un cliente EMPRESA, desde
// su fila en la fase 7 del lote. Solo ADMIN.
//
// Una empresa no recibe la ayuda sin más: nos VENDE el ahorro y el pago lo
// justifica su factura (como la Parroquia de San José Obrero, 25TER100_1). Tres
// caminos, se elige uno:
//   · AUTOFACTURA (recomendada): la expedimos en su nombre (art. 5 RD 1619/2012).
//     Se le manda un enlace; allí acepta el acuerdo, se expide y la acepta.
//   · LA EMITE ÉL: se le manda un MODELO relleno y, cuando nos llega su factura,
//     se sube aquí.
//   · NO PROCEDE: entidad sin actividad empresarial; se paga como a un particular.
//
// REGLA — líneas, importes y mensajes los compone el BACKEND
// (logic/facturaVentaAhorro.js, fuente única): aquí se enseñan y se retocan.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import SendActionOverlay from '../../../components/SendActionOverlay';
import { CanalChip } from '../../../components/CanalChip';
import { eurEs } from '../../cobro/logic/cobroForm';
import { ESTADOS_VENTA } from '../logic/facturaVentaAhorro';

const MODOS = [
    { k: 'autofactura', t: 'Autofactura', sub: 'La expedimos nosotros en su nombre; solo la acepta en su enlace', rec: true },
    { k: 'cliente', t: 'La emite él', sub: 'Se le manda un modelo relleno y nos manda su factura' },
    { k: 'no_procede', t: 'No procede', sub: 'Entidad sin actividad empresarial: se le paga sin factura' },
];

const fechaHora = (iso) => (iso ? new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');

export function FacturaVentaModal({ lote, f, onClose, onHecho }) {
    const [b, setB] = useState(null);
    const [error, setError] = useState('');
    const [modo, setModo] = useState(null);
    const [ivaPct, setIvaPct] = useState(null);
    const [canales, setCanales] = useState({ whatsapp: true, email: false });
    const [tlf, setTlf] = useState('');
    const [email, setEmail] = useState('');
    const [mensaje, setMensaje] = useState('');
    const [motivoNP, setMotivoNP] = useState('');
    const [recibida, setRecibida] = useState({ file: null, numero: '', total: '' });
    const [overlay, setOverlay] = useState(null);

    const base = `/api/lotes/${lote.id}/cobros/${f.id}/factura-venta`;

    const cargar = useCallback(async (m, iva) => {
        setError('');
        try {
            const { data } = await axios.get(base, { params: { modo: m || undefined, iva: iva ?? undefined } });
            setB(data);
            const mm = m || (data.registro?.estado === 'NO_PROCEDE' ? 'no_procede' : data.modo);
            setModo(mm);
            setIvaPct(data.ivaPct);
            setMensaje(data.mensajes?.[mm === 'cliente' ? 'cliente' : 'autofactura'] || '');
            setTlf(t => t || data.contacto?.tlf || '');
            setEmail(e => e || data.contacto?.email || '');
            setCanales(c => (c.touched ? c : { whatsapp: !!data.contacto?.tlf, email: !data.contacto?.tlf && !!data.contacto?.email }));
            setRecibida(r => ({ ...r, total: r.total || String(data.total ?? '').replace('.', ',') }));
        } catch (e) {
            setError(e.response?.data?.error || 'No se pudo preparar la factura.');
        }
    }, [base]);

    useEffect(() => { cargar(null, null); }, [cargar]);

    const reg = b?.registro || null;
    const expedida = !!reg?.numero;
    const lista = reg && ['ACEPTADA', 'RECIBIDA', 'NO_PROCEDE'].includes(reg.estado);
    const hayCanal = (canales.whatsapp && tlf.trim()) || (canales.email && email.trim());

    const cambiarModo = (m) => { if (expedida && m !== 'autofactura') return; setModo(m); if (m !== 'no_procede') cargar(m, ivaPct); };
    const cambiarIva = (v) => { setIvaPct(v); cargar(modo === 'no_procede' ? null : modo, v); };

    const ejecutar = async (titulo, fn, items = (d) => []) => {
        setOverlay({ phase: 'sending', subtitle: titulo });
        try {
            const r = await fn();
            setOverlay({ phase: 'done', ok: true, subtitle: titulo, items: items(r?.data) });
            if (onHecho) onHecho();
        } catch (e) {
            setOverlay({ phase: 'done', ok: false, subtitle: e.response?.data?.error || 'No se pudo completar', items: [] });
        }
    };

    const pedir = () => ejecutar(
        modo === 'autofactura' ? 'Enviando el enlace de la autofactura…' : 'Enviando el modelo de factura…',
        () => axios.post(`${base}/pedir`, {
            modo, ivaPct,
            canales: [...(canales.whatsapp && tlf.trim() ? ['whatsapp'] : []), ...(canales.email && email.trim() ? ['email'] : [])],
            tlf: tlf.trim(), email: email.trim(), mensaje,
        }),
        (d) => Object.entries(d?.resultados || {}).map(([k, r]) => r.ok
            ? `${k === 'whatsapp' ? 'WhatsApp' : 'Email'} → ${r.to}`
            : { texto: `${k === 'whatsapp' ? 'WhatsApp' : 'Email'}: ${r.error}`, tono: 'aviso' }),
    );

    const rehacer = () => ejecutar('Rehaciendo la autofactura con el mismo número…',
        () => axios.post(`${base}/rehacer`, { ivaPct }),
        (d) => [`${d.numero} · ${eurEs(d.total)} · pendiente de que la acepte`, { texto: 'Reenvíale el enlace para que la acepte', tono: 'info' }]);

    const subirRecibida = () => {
        const fd = new FormData();
        fd.append('factura', recibida.file);
        fd.append('numero', recibida.numero);
        fd.append('total', recibida.total);
        return ejecutar('Guardando su factura…', () => axios.post(`${base}/recibida`, fd),
            (d) => [`Factura ${d.numero_cliente || ''} · ${eurEs(d.total)} en «5. FACTURAS»`,
                ...(d.descuadre ? [{ texto: `No cuadra con lo calculado (${eurEs(d.descuadre.esperado)}): se le transfiere lo de SU factura`, tono: 'aviso' }] : [])]);
    };

    const noProcede = (si) => ejecutar(si ? 'Marcando «no procede»…' : 'Deshaciendo «no procede»…',
        () => axios.post(`${base}/no-procede`, { noProcede: si, motivo: motivoNP }),
        () => [si ? 'Se le pagará sin factura, como a un particular' : 'Vuelve a necesitar factura']);

    const verPdf = async (modelo) => {
        try {
            const { data } = await axios.get(`${base}/pdf`, { params: modelo ? { modelo: 1 } : {}, responseType: 'blob' });
            window.open(URL.createObjectURL(data), '_blank', 'noopener');
        } catch { setError('No se pudo abrir el PDF.'); }
    };

    const input = 'bg-black/25 border border-white/10 rounded-lg px-2.5 py-1.5 text-[11px] text-white/85 outline-none focus:border-brand/50';

    return createPortal(
        <div className="fixed inset-0 z-[9998] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-6">
            <div className="w-full sm:max-w-2xl max-h-[92dvh] flex flex-col bg-bkg-surface border border-white/10 rounded-t-3xl sm:rounded-3xl overflow-hidden">
                <div className="px-5 pt-5 pb-3 border-b border-white/[0.06] flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-brand">Pago a los clientes · empresa</p>
                        <h3 className="text-lg font-black text-white leading-tight mt-0.5">
                            {expedida ? `Autofactura ${reg.numero}` : 'Factura de venta del ahorro'}
                        </h3>
                        <p className="text-[11px] text-white/45 mt-1 leading-snug">
                            {f.numero_expediente} · {b?.cliente?.razon_social || f.cliente || '—'}{b?.cliente?.cif ? ` · ${b.cliente.cif}` : ''}
                        </p>
                    </div>
                    <button type="button" onClick={onClose} className="text-white/40 hover:text-white text-xl leading-none px-1">✕</button>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3.5">
                    {error && <p className="text-[11px] text-red-400">{error}</p>}
                    {!b && !error && <p className="text-[11px] text-white/40">Preparando la factura…</p>}

                    {b && (
                        <>
                            <p className="text-[11px] text-white/55 leading-relaxed">
                                Una empresa nos <b className="text-white/80">vende</b> el ahorro: para pagarle hace falta su factura (base = lo que se le iba a transferir, con el IVA encima). Se le transfiere el <b className="text-white/80">total</b>, y hasta tenerla no entra en la remesa.
                            </p>

                            {reg?.estado && (
                                <div className={`rounded-xl border px-3 py-2.5 text-[11px] space-y-0.5 ${lista ? 'border-emerald-400/30 bg-emerald-400/[0.05] text-emerald-200' : reg.estado === 'RECHAZADA' ? 'border-amber-400/35 bg-amber-400/[0.06] text-amber-200' : 'border-cyan-400/25 bg-cyan-400/[0.04] text-cyan-200'}`}>
                                    <p className="font-black">{ESTADOS_VENTA[reg.estado] || reg.estado}{reg.numero ? ` · ${reg.numero}` : ''}{reg.total != null && reg.estado !== 'NO_PROCEDE' ? ` · ${eurEs(reg.total)}` : ''}</p>
                                    {reg.pedida_at && <p className="text-white/50">Pedida {fechaHora(reg.pedida_at)} ({reg.modo === 'autofactura' ? 'autofactura' : 'la emite él'})</p>}
                                    {reg.acuerdo?.at && <p className="text-white/50">Acuerdo de facturación aceptado {fechaHora(reg.acuerdo.at)} por {reg.acuerdo.nombre} ({reg.acuerdo.dni})</p>}
                                    {reg.aceptada_at && <p className="text-white/50">Factura aceptada {fechaHora(reg.aceptada_at)} por {reg.aceptada_por?.nombre}</p>}
                                    {reg.estado === 'RECHAZADA' && reg.rechazo && <p>Dice: «{reg.rechazo.motivo}». Corrige la ficha si hace falta y rehazla.</p>}
                                    {reg.recibida?.at && <p className="text-white/50">Su factura {reg.recibida.numero || ''} subida {fechaHora(reg.recibida.at)}{reg.descuadre ? ` · ⚠ esperábamos ${eurEs(reg.descuadre.esperado)}` : ''}</p>}
                                    {reg.no_procede && <p className="text-white/50">No procede: {reg.no_procede.motivo}</p>}
                                </div>
                            )}

                            {b.bloqueo && !lista && <p className="rounded-xl border border-amber-400/30 bg-amber-400/[0.06] px-3 py-2 text-[11px] text-amber-200">{b.bloqueo}</p>}

                            {!lista && (
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                    {MODOS.map(m => (
                                        <button key={m.k} type="button" disabled={expedida && m.k !== 'autofactura'} onClick={() => cambiarModo(m.k)}
                                            className={`text-left px-3 py-2.5 rounded-2xl border transition-all disabled:opacity-35 disabled:cursor-default ${modo === m.k ? 'border-brand/60 bg-brand/[0.08]' : 'border-white/10 hover:border-white/25'}`}>
                                            <span className="block text-[12px] font-bold text-white">{m.t}{m.rec && <span className="ml-1.5 text-[9px] font-black uppercase tracking-wider text-emerald-300">recomendada</span>}</span>
                                            <span className="block text-[10px] text-white/45 leading-snug mt-0.5">{m.sub}</span>
                                        </button>
                                    ))}
                                </div>
                            )}

                            {modo !== 'no_procede' && (
                                <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 space-y-1">
                                    {(b.lineas || []).map((l, i) => (
                                        <div key={i} className="text-[11px]">
                                            <div className="flex items-baseline gap-2">
                                                <span className="flex-1 text-white/80">{l.descripcion}</span>
                                                <span className="font-mono text-white/70">{eurEs(l.precio)}</span>
                                            </div>
                                            {l.detalle && <p className="text-[10px] text-white/40 whitespace-pre-line">{l.detalle}</p>}
                                        </div>
                                    ))}
                                    <div className="flex items-center gap-2 text-[10px] text-white/40 pt-1 border-t border-white/[0.06]">
                                        <span className="flex-1">Base {eurEs(b.neto)} · IVA {eurEs(b.iva)}</span>
                                        <label className="flex items-center gap-1">
                                            IVA
                                            <select value={String(ivaPct ?? 21)} disabled={reg?.estado === 'ACEPTADA'} onChange={e => cambiarIva(Number(e.target.value))}
                                                className="bg-black/40 border border-white/10 rounded-md px-1.5 py-0.5 text-[10px] text-white/80 [color-scheme:dark]">
                                                <option value="21">21 %</option>
                                                <option value="0">0 % (no sujeta)</option>
                                            </select>
                                        </label>
                                        <span className="text-[13px] font-black text-white">{eurEs(b.total)}</span>
                                    </div>
                                    {expedida && Number(reg.total) !== Number(b.total) && reg.estado !== 'ACEPTADA' && (
                                        <p className="text-[10px] text-amber-300/90">La expedida es de {eurEs(reg.total)}: «Rehacer» la deja en {eurEs(b.total)} con el mismo número.</p>
                                    )}
                                </div>
                            )}

                            {modo === 'no_procede' && !lista && (
                                <label className="block">
                                    <span className="block text-[9px] font-bold uppercase tracking-wider text-white/35 mb-0.5">Por qué no procede (queda en el expediente)</span>
                                    <input value={motivoNP} onChange={e => setMotivoNP(e.target.value)} placeholder="Comunidad de propietarios sin actividad empresarial"
                                        className={`w-full ${input} no-uppercase`} />
                                </label>
                            )}

                            {modo === 'cliente' && !lista && (
                                <div className="rounded-xl border border-white/10 px-3 py-2.5 space-y-2">
                                    <p className="text-[9px] font-black uppercase tracking-widest text-white/35">¿Ya nos ha mandado su factura?</p>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                        <input type="file" accept="application/pdf" onChange={e => setRecibida(r => ({ ...r, file: e.target.files?.[0] || null }))}
                                            className="sm:col-span-3 text-[11px] text-white/60" />
                                        <input value={recibida.numero} onChange={e => setRecibida(r => ({ ...r, numero: e.target.value }))} placeholder="Su nº de factura" className={input} />
                                        <input value={recibida.total} onChange={e => setRecibida(r => ({ ...r, total: e.target.value }))} placeholder="Total con IVA" className={input} />
                                        <button type="button" disabled={!recibida.file || !recibida.total} onClick={subirRecibida}
                                            className="px-3 py-1.5 rounded-lg border border-emerald-400/40 text-emerald-300 text-[11px] font-bold hover:bg-emerald-400/10 disabled:opacity-40">
                                            ✓ Subir su factura
                                        </button>
                                    </div>
                                </div>
                            )}

                            {modo !== 'no_procede' && !lista && (
                                <div>
                                    <p className="text-[9px] font-black uppercase tracking-widest text-white/35 mb-1.5">
                                        {modo === 'autofactura' ? 'Mensaje con el enlace para aceptar' : 'Mensaje con el modelo adjunto'}
                                    </p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                                        <input value={tlf} onChange={e => setTlf(e.target.value)} placeholder="Teléfono (WhatsApp)" className={input} />
                                        <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" className={`${input} no-uppercase`} />
                                    </div>
                                    <textarea value={mensaje} rows={11} onChange={e => setMensaje(e.target.value)}
                                        className="w-full bg-black/25 border border-white/10 rounded-xl p-3 text-[12px] text-white/85 leading-relaxed outline-none focus:border-brand/50 no-uppercase font-sans" />
                                </div>
                            )}
                        </>
                    )}
                </div>

                <div className="px-5 py-3 border-t border-white/[0.06] flex items-center gap-2 flex-wrap pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                    {modo !== 'no_procede' && !lista && (
                        <>
                            <CanalChip canal="whatsapp" nombre="WhatsApp" activo={canales.whatsapp} disponible={!!tlf.trim()}
                                detalle={tlf || 'sin teléfono'} motivo="Sin teléfono" onClick={() => setCanales(c => ({ ...c, whatsapp: !c.whatsapp, touched: true }))} />
                            <CanalChip canal="email" nombre="Email" activo={canales.email} disponible={!!email.trim()}
                                detalle={email || 'sin email'} motivo="Sin email" onClick={() => setCanales(c => ({ ...c, email: !c.email, touched: true }))} />
                        </>
                    )}
                    <div className="flex-1" />
                    {b && modo !== 'no_procede' && (
                        <button type="button" onClick={() => verPdf(!expedida)}
                            className="px-4 py-2.5 rounded-xl border border-white/15 text-[12px] font-bold text-white/75 hover:text-white">
                            {expedida ? 'Ver PDF' : 'Ver modelo'}
                        </button>
                    )}
                    {reg?.estado === 'NO_PROCEDE' && (
                        <button type="button" onClick={() => noProcede(false)} className="px-4 py-2.5 rounded-xl border border-white/15 text-[12px] font-bold text-white/75 hover:text-white">Deshacer «no procede»</button>
                    )}
                    {modo === 'no_procede' && !lista && (
                        <button type="button" disabled={motivoNP.trim().length < 5} onClick={() => noProcede(true)}
                            className="px-5 py-2.5 rounded-xl bg-brand text-black text-[12px] font-black uppercase tracking-wider disabled:opacity-40 hover:brightness-110">Marcar «no procede»</button>
                    )}
                    {expedida && ['PENDIENTE_ACEPTACION', 'RECHAZADA'].includes(reg.estado) && (
                        <button type="button" onClick={rehacer} className="px-4 py-2.5 rounded-xl border border-amber-400/40 text-[12px] font-bold text-amber-200 hover:bg-amber-400/10">Rehacer</button>
                    )}
                    {modo !== 'no_procede' && !lista && (
                        <button type="button" disabled={!b || !!b.bloqueo || !hayCanal || !(b.total > 0)} onClick={pedir}
                            className="px-5 py-2.5 rounded-xl bg-brand text-black text-[12px] font-black uppercase tracking-wider disabled:opacity-40 hover:brightness-110">
                            {reg?.pedida_at ? 'Reenviar' : modo === 'autofactura' ? 'Enviar enlace' : 'Enviar modelo'}
                        </button>
                    )}
                </div>
            </div>

            <SendActionOverlay
                phase={overlay?.phase || null}
                ok={!!overlay?.ok}
                subtitle={overlay?.subtitle}
                items={overlay?.items || []}
                sendingTitle="Un momento…"
                okTitle="Hecho"
                errorTitle="No se pudo completar"
                onClose={() => { const ok = overlay?.ok; setOverlay(null); if (ok) onClose(); }}
            />
        </div>,
        document.body,
    );
}

export default FacturaVentaModal;
