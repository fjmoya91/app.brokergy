// ─────────────────────────────────────────────────────────────────────────────
// PagoClientesModals — lo que viene DESPUÉS de que los clientes confirmen su
// cuenta, en la fase 7 del lote ("Pago a los clientes"):
//
//   RemesaSepaModal       → el fichero SEPA para BBVA net cash (una transferencia
//                           por cuenta, con el formato que BBVA ya aceptó)
//   JustificanteModal     → el PDF del banco con la transferencia hecha
//   AvisoTransferenciaModal → a cada cliente, que ya está transferido, y la
//                           petición de reseña en Google PROGRAMADA para cuando
//                           el dinero ya debería haber llegado
//
// Todo es ADMIN (cuentas e importes). Los textos los compone el BACKEND
// (pagoClientesService.borradoresAviso → cobroForm.js): aquí se enseñan y se
// pueden retocar antes de mandar.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import SendActionOverlay from '../../../components/SendActionOverlay';
import { CanalChip } from '../../../components/CanalChip';
import { eurEs } from '../../cobro/logic/cobroForm';

const eur = eurEs;

/** ISO → valor de un <input type="datetime-local"> (hora local del navegador). */
function isoALocal(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

const fechaLarga = (v) => {
    const d = v ? new Date(v) : null;
    return d && !Number.isNaN(d.getTime())
        ? d.toLocaleString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
        : '—';
};

function Marco({ titulo, subtitulo, explicacion, onClose, children, pie }) {
    return (
        <div className="fixed inset-0 z-[9998] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-6">
            <div className="w-full sm:max-w-2xl max-h-[92dvh] flex flex-col bg-bkg-surface border border-white/10 rounded-t-3xl sm:rounded-3xl overflow-hidden">
                <div className="px-5 pt-5 pb-3 border-b border-white/[0.06] flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-brand">{subtitulo}</p>
                        <h3 className="text-lg font-black text-white leading-tight mt-0.5">{titulo}</h3>
                        {explicacion && <p className="text-[11px] text-white/40 mt-1 leading-snug">{explicacion}</p>}
                    </div>
                    <button type="button" onClick={onClose} className="text-white/40 hover:text-white text-xl leading-none px-1">✕</button>
                </div>
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">{children}</div>
                <div className="px-5 py-3 border-t border-white/[0.06] flex items-center gap-2 flex-wrap pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                    {pie}
                </div>
            </div>
        </div>
    );
}

// ─── 1 · La remesa SEPA ──────────────────────────────────────────────────────
export function RemesaSepaModal({ lote, onClose, onHecho }) {
    const [datos, setDatos] = useState(null);
    const [error, setError] = useState('');
    const [facturaCobrada, setFacturaCobrada] = useState([]);
    const [marcadas, setMarcadas] = useState(null);
    const [fecha, setFecha] = useState('');
    const [generando, setGenerando] = useState(false);
    const [hecho, setHecho] = useState(null);

    useEffect(() => {
        let vivo = true;
        axios.get(`/api/lotes/${lote.id}/remesa-sepa`, { params: { factura_cobrada: facturaCobrada.join(',') } })
            .then(({ data }) => {
                if (!vivo) return;
                setDatos(data);
                setFecha(f => f || data.fecha_ejecucion);
                // Por defecto: los que se pueden ordenar y aún NO se han transferido.
                setMarcadas(prev => {
                    const base = new Set(data.filas.filter(f => f.incluible && !f.transferencia).map(f => f.id));
                    if (!prev) return base;
                    const s = new Set([...prev].filter(id => data.filas.find(f => f.id === id)?.incluible));
                    for (const id of facturaCobrada) if (base.has(id)) s.add(id);
                    return s;
                });
            })
            .catch(e => vivo && setError(e.response?.data?.error || 'No se pudo preparar la remesa.'));
        return () => { vivo = false; };
    }, [lote.id, facturaCobrada]);

    const filas = datos?.filas || [];
    const elegidas = filas.filter(f => marcadas?.has(f.id) && f.incluible);
    const total = elegidas.reduce((s, f) => s + (f.importe || 0), 0);
    const nTransf = elegidas.reduce((s, f) => s + (f.pagos?.length || 0), 0);
    const yaEnRemesa = elegidas.filter(f => f.remesa && !f.transferencia);
    const yaTransferidas = elegidas.filter(f => f.transferencia);

    const toggle = (id) => setMarcadas(prev => {
        const s = new Set(prev);
        if (s.has(id)) s.delete(id); else s.add(id);
        return s;
    });

    const generar = async () => {
        setGenerando(true);
        setError('');
        try {
            const { data } = await axios.post(`/api/lotes/${lote.id}/remesa-sepa`, {
                ids: elegidas.map(f => f.id), factura_cobrada: facturaCobrada, fecha_ejecucion: fecha,
            });
            // Descarga del fichero: es lo que se sube a BBVA net cash.
            const url = URL.createObjectURL(new Blob([data.xml], { type: 'application/xml' }));
            const a = document.createElement('a');
            a.href = url;
            a.download = data.file_name;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 5000);
            setHecho(data);
            if (onHecho) onHecho();
        } catch (e) {
            setError(e.response?.data?.error || 'No se pudo generar la remesa.');
        } finally {
            setGenerando(false);
        }
    };

    return createPortal(
        <Marco
            subtitulo="Pago a los clientes"
            titulo="Remesa de transferencias SEPA"
            explicacion="Un fichero para subir a BBVA net cash (Ficheros → Transferencias SEPA), con el mismo formato que la remesa del 02/10/2026: una transferencia por cuenta de cliente."
            onClose={onClose}
            pie={hecho ? (
                <>
                    <p className="text-[11px] text-emerald-300 flex-1">
                        ✓ Descargado <span className="font-mono">{hecho.file_name}</span> · {hecho.n} transferencia{hecho.n === 1 ? '' : 's'} · {eur(hecho.total)}
                        {hecho.link && <a href={hecho.link} target="_blank" rel="noreferrer" className="ml-2 text-cyan-300/80 hover:underline">en Drive</a>}
                    </p>
                    <button type="button" onClick={onClose}
                        className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-brand text-black text-[12px] font-black uppercase tracking-wider">Hecho</button>
                </>
            ) : (
                <>
                    <label className="text-[10px] text-white/45 flex items-center gap-2">
                        Fecha de ejecución
                        <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
                            className="bg-black/25 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-white" />
                    </label>
                    <div className="flex-1" />
                    {error && <span className="w-full text-[10px] text-red-400 whitespace-pre-line">{error}</span>}
                    <button type="button" disabled={!elegidas.length || generando || !fecha} onClick={generar}
                        className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-brand text-black text-[12px] font-black uppercase tracking-wider disabled:opacity-40 hover:brightness-110 transition-all">
                        {generando ? 'Generando…' : `⬇ Descargar remesa · ${eur(total)}`}
                    </button>
                </>
            )}
        >
            {!datos && !error && <p className="text-[11px] text-white/35">Preparando la remesa…</p>}
            {datos && (
                <p className="text-[10px] text-white/40">
                    Cargo en <span className="font-mono text-white/70">{datos.ordenante.iban.replace(/(.{4})(?=.)/g, '$1 ')}</span> ({datos.ordenante.bic}) ·
                    ordenante {datos.ordenante.nif}{datos.ordenante.sufijo}
                </p>
            )}
            {filas.map(f => {
                const on = !!marcadas?.has(f.id) && f.incluible;
                return (
                    <div key={f.id} className={`rounded-2xl border px-3 py-2.5 ${on ? 'border-brand/35 bg-brand/[0.04]' : 'border-white/[0.07] bg-white/[0.015]'}`}>
                        <div className="flex items-center gap-2.5">
                            <input type="checkbox" checked={on} disabled={!f.incluible} onChange={() => toggle(f.id)}
                                className="w-4 h-4 accent-amber-400 shrink-0" />
                            <div className="min-w-0 flex-1">
                                <p className="text-[12px] font-bold text-white truncate">{f.numero_expediente} · {f.cliente || '—'}</p>
                                {f.incluible ? (
                                    <p className="text-[10px] text-white/45">
                                        Ayuda {eur(f.bono)}{f.descuento ? ` − honorarios ${eur(f.descuento)}` : ''}
                                        {f.forma_pago === 'asumida' && ' · gestión asumida por Brokergy'}
                                        {f.forma_pago === 'factura' && ' · factura ya cobrada'}
                                    </p>
                                ) : (
                                    <p className="text-[10px] text-amber-300/80">{f.motivo}</p>
                                )}
                            </div>
                            {f.incluible && <span className="text-[13px] font-black text-emerald-300 shrink-0">{eur(f.importe)}</span>}
                        </div>
                        {f.incluible && (f.pagos || []).map((p, i) => (
                            <p key={i} className="mt-1 ml-6 text-[10px] text-white/50">
                                → {p.nombre} · <span className="font-mono text-white/70">{p.iban.replace(/(.{4})(?=.)/g, '$1 ')}</span>
                                {f.pagos.length > 1 && <> · {String(p.cuota_pct).replace('.', ',')} % · <span className="text-white/75">{eur(p.importe)}</span></>}
                            </p>
                        ))}
                        {f.aviso && <p className="mt-1 ml-6 text-[10px] text-amber-300">⚠ {f.aviso}</p>}
                        {f.transferencia && <p className="mt-1 ml-6 text-[10px] text-cyan-300/80">Ya transferido el {new Date(f.transferencia.at).toLocaleDateString('es-ES')}</p>}
                        {!f.transferencia && f.remesa && <p className="mt-1 ml-6 text-[10px] text-cyan-300/70">Ya va en la remesa {f.remesa.msg_id} ({new Date(f.remesa.at).toLocaleDateString('es-ES')}): generarla otra vez la sustituye</p>}
                        {f.factura_pendiente && (
                            <label className="mt-1.5 ml-6 flex items-center gap-1.5 text-[10px] text-white/55">
                                <input type="checkbox" className="accent-amber-400" checked={facturaCobrada.includes(f.id)}
                                    onChange={e => setFacturaCobrada(prev => (e.target.checked ? [...prev, f.id] : prev.filter(x => x !== f.id)))} />
                                La factura ya está cobrada: ingresar la ayuda entera
                            </label>
                        )}
                    </div>
                );
            })}
            {yaTransferidas.length > 0 && (
                <p className="text-[10px] text-amber-300">⚠ {yaTransferidas.map(f => f.numero_expediente).join(', ')} ya {yaTransferidas.length > 1 ? 'están transferidos' : 'está transferido'}: se le{yaTransferidas.length > 1 ? 's' : ''} pagaría dos veces.</p>
            )}
            {yaEnRemesa.length > 0 && (
                <p className="text-[10px] text-white/40">Si ya subiste la remesa anterior al banco, no subas esta también con los mismos clientes.</p>
            )}
            {elegidas.length > 0 && (
                <p className="text-[11px] text-white/60">
                    <span className="font-black text-white">{nTransf} transferencia{nTransf === 1 ? '' : 's'}</span> por <span className="font-black text-emerald-300">{eur(total)}</span>.
                    En el concepto de cada una: «AYUDA CAE nº-de-expediente BROKERGY».
                </p>
            )}
        </Marco>,
        document.body,
    );
}

// ─── 2 · El justificante del banco ───────────────────────────────────────────
export function JustificanteModal({ lote, filas, onClose, onSubido }) {
    // Por defecto, los que van en una remesa y aún no tienen la transferencia.
    const candidatas = filas.filter(f => f.pago?.remesa);
    const [marcadas, setMarcadas] = useState(() => new Set(candidatas.filter(f => !f.pago?.transferencia).map(f => f.id)));
    const [fichero, setFichero] = useState(null);
    const [subiendo, setSubiendo] = useState(false);
    const [error, setError] = useState('');

    const subir = async () => {
        if (!fichero) return;
        setSubiendo(true);
        setError('');
        try {
            const base64 = await new Promise((resolve, reject) => {
                const r = new FileReader();
                r.onload = () => resolve(r.result);
                r.onerror = () => reject(new Error('No se pudo leer el fichero'));
                r.readAsDataURL(fichero);
            });
            const ids = [...marcadas];
            await axios.post(`/api/lotes/${lote.id}/transferencia`, { base64, fileName: fichero.name, ids });
            onSubido(ids);
        } catch (e) {
            setError(e.response?.data?.error || e.message || 'No se pudo subir el justificante.');
            setSubiendo(false);
        }
    };

    return createPortal(
        <Marco
            subtitulo="Pago a los clientes"
            titulo="Justificante de la transferencia"
            explicacion="El PDF que da BBVA con la remesa ejecutada. Se guarda en la documentación del lote y NO se le manda a ningún cliente: lleva las cuentas e importes de todos."
            onClose={onClose}
            pie={(
                <>
                    <label className="flex-1 min-w-0 cursor-pointer rounded-xl border border-dashed border-white/20 hover:border-brand/50 px-3 py-2 text-[11px] text-white/60 truncate">
                        <input type="file" accept="application/pdf" className="hidden" onChange={e => setFichero(e.target.files?.[0] || null)} />
                        {fichero ? `📄 ${fichero.name}` : '📎 Elegir el PDF del banco…'}
                    </label>
                    {error && <span className="w-full text-[10px] text-red-400">{error}</span>}
                    <button type="button" disabled={!fichero || !marcadas.size || subiendo} onClick={subir}
                        className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-brand text-black text-[12px] font-black uppercase tracking-wider disabled:opacity-40 hover:brightness-110 transition-all">
                        {subiendo ? 'Subiendo…' : 'Subir y preparar los avisos'}
                    </button>
                </>
            )}
        >
            <p className="text-[11px] text-white/50">¿A qué clientes corresponde?</p>
            {candidatas.map(f => (
                <label key={f.id} className="flex items-center gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2 text-[12px] text-white">
                    <input type="checkbox" className="w-4 h-4 accent-amber-400" checked={marcadas.has(f.id)}
                        onChange={() => setMarcadas(prev => { const s = new Set(prev); if (s.has(f.id)) s.delete(f.id); else s.add(f.id); return s; })} />
                    <span className="font-bold">{f.numero_expediente}</span>
                    <span className="text-white/55 truncate">{f.cliente}</span>
                    {f.pago?.remesa?.importe != null && <span className="ml-auto text-emerald-300 font-bold">{eur(f.pago.remesa.importe)}</span>}
                    {f.pago?.transferencia && <span className="text-[9px] text-cyan-300/80">ya subido</span>}
                </label>
            ))}
            {!candidatas.length && <p className="text-[11px] text-amber-300">Ningún cliente va en una remesa todavía: genera antes la remesa SEPA.</p>}
        </Marco>,
        document.body,
    );
}

// ─── 3 · Aviso de transferencia + reseña programada ──────────────────────────
export function AvisoTransferenciaModal({ lote, filas, onClose, onEnviado }) {
    const [borr, setBorr] = useState({});           // id → borradores del backend
    const [txt, setTxt] = useState({});             // id → { transferencia, resena }
    const [resenaOn, setResenaOn] = useState({});   // id → bool
    const [resenaAt, setResenaAt] = useState({});   // id → datetime-local
    const [abierto, setAbierto] = useState(filas.length === 1 ? filas[0].id : null);
    const [canales, setCanales] = useState({ whatsapp: true, email: false });
    const [overlay, setOverlay] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => {
        let vivo = true;
        (async () => {
            for (const f of filas) {
                try {
                    const { data } = await axios.get(`/api/lotes/${lote.id}/transferencia/${f.id}/borradores`);
                    if (!vivo) return;
                    setBorr(p => ({ ...p, [f.id]: data }));
                    setTxt(p => ({ ...p, [f.id]: { transferencia: data.transferencia, resena: data.resena || '' } }));
                    setResenaOn(p => ({ ...p, [f.id]: !!data.resena }));
                    setResenaAt(p => ({ ...p, [f.id]: isoALocal(data.resena_at) }));
                } catch (e) {
                    if (vivo) setError(e.response?.data?.error || 'No se pudieron preparar los mensajes.');
                }
            }
        })();
        return () => { vivo = false; };
    }, [lote.id, filas]);

    const listas = filas.filter(f => borr[f.id]);
    const conTlf = listas.filter(f => borr[f.id].contacto?.tlf).length;
    const conEmail = listas.filter(f => borr[f.id].contacto?.email).length;
    const algunaResenaApagada = listas.some(f => resenaOn[f.id] && !borr[f.id].resena_activa);
    const puede = listas.length > 0 && (canales.whatsapp || canales.email);

    const enviar = async () => {
        const items = [];
        let fallos = 0;
        setOverlay({ phase: 'sending', subtitle: `0 de ${listas.length}` });
        for (let i = 0; i < listas.length; i++) {
            const f = listas[i];
            const b = borr[f.id];
            setOverlay({ phase: 'sending', subtitle: `${i + 1} de ${listas.length} · ${f.numero_expediente}` });
            const channels = [
                ...(canales.whatsapp && b.contacto?.tlf ? ['whatsapp'] : []),
                ...(canales.email && b.contacto?.email ? ['email'] : []),
            ];
            if (!channels.length) {
                items.push({ texto: `${f.numero_expediente}: sin teléfono ni email por el canal elegido — no se le ha mandado`, tono: 'info' });
                continue;
            }
            try {
                const at = new Date(resenaAt[f.id]);
                const programar = !!resenaOn[f.id] && !!txt[f.id]?.resena && !Number.isNaN(at.getTime());
                const { data } = await axios.post(`/api/lotes/${lote.id}/transferencia/${f.id}/avisar`, {
                    channels,
                    mensaje: txt[f.id]?.transferencia,
                    resena: programar ? { programar: true, at: at.toISOString(), mensaje: txt[f.id].resena } : null,
                });
                items.push(`${f.numero_expediente} · ${b.contacto?.nombre || f.cliente || ''} · ${(data.channels || []).join(' + ')}${data.resena ? ` · reseña el ${fechaLarga(data.resena.programada_para)}` : ''}`);
            } catch (e) {
                fallos++;
                items.push({ texto: `${f.numero_expediente}: ${e.response?.data?.error || 'no se pudo enviar'}`, tono: 'aviso' });
            }
        }
        setOverlay({
            phase: 'done', ok: fallos < listas.length,
            subtitle: fallos ? `${listas.length - fallos} avisados · ${fallos} con error` : `${listas.length} avisado${listas.length > 1 ? 's' : ''}`,
            items,
        });
        if (onEnviado) onEnviado();
    };

    return createPortal(
        <>
            <Marco
                subtitulo="Pago a los clientes"
                titulo="Avisar de la transferencia"
                explicacion="A cada cliente: que ya está transferido, cuánto, a qué cuenta (enmascarada) y con qué concepto. Y, programada, la petición de reseña en Google para cuando el dinero ya le haya llegado."
                onClose={onClose}
                pie={(
                    <>
                        <CanalChip canal="whatsapp" nombre="WhatsApp" activo={canales.whatsapp} disponible={conTlf > 0}
                            detalle={`${conTlf} con teléfono`} motivo="Ninguno tiene teléfono"
                            onClick={() => setCanales(c => ({ ...c, whatsapp: !c.whatsapp }))} />
                        <CanalChip canal="email" nombre="Email" activo={canales.email} disponible={conEmail > 0}
                            detalle={`${conEmail} con email`} motivo="Ninguno tiene email"
                            onClick={() => setCanales(c => ({ ...c, email: !c.email }))} />
                        <div className="flex-1" />
                        {error && <span className="w-full text-[10px] text-red-400">{error}</span>}
                        <button type="button" disabled={!puede} onClick={enviar}
                            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-brand text-black text-[12px] font-black uppercase tracking-wider disabled:opacity-40 hover:brightness-110 transition-all">
                            Avisar a {listas.length} cliente{listas.length === 1 ? '' : 's'}
                        </button>
                    </>
                )}
            >
                {algunaResenaApagada && (
                    <p className="text-[10px] text-amber-300 leading-snug">
                        ⚠ El despachador de reseñas está APAGADO en este servidor (RESENA_PROGRAMADA_ENABLED): se quedará programada,
                        pero solo saldrá desde un servidor que lo tenga encendido (el de producción).
                    </p>
                )}
                {filas.map(f => {
                    const b = borr[f.id];
                    const t = txt[f.id] || {};
                    return (
                        <div key={f.id} className="rounded-2xl border border-brand/25 bg-brand/[0.03]">
                            <div className="flex items-center gap-2.5 px-3 py-2.5">
                                <div className="min-w-0 flex-1">
                                    <p className="text-[12px] font-bold text-white truncate">{f.numero_expediente} · {b?.contacto?.nombre || f.cliente || '—'}</p>
                                    <p className="text-[10px] text-white/40 truncate">
                                        {b ? ([b.contacto?.tlf, b.contacto?.email].filter(Boolean).join(' · ') || 'Sin teléfono ni email') : 'Preparando…'}
                                        {b && (resenaOn[f.id]
                                            ? <span className="text-emerald-300/80"> · reseña el {fechaLarga(resenaAt[f.id])}</span>
                                            : <span className="text-white/30"> · sin reseña{b.resena_motivo ? ` (${b.resena_motivo})` : ''}</span>)}
                                    </p>
                                </div>
                                {b && (
                                    <button type="button" onClick={() => setAbierto(a => (a === f.id ? null : f.id))}
                                        className="text-[10px] font-bold text-white/45 hover:text-white shrink-0">
                                        {abierto === f.id ? 'Ocultar' : 'Ver mensajes'}
                                    </button>
                                )}
                            </div>
                            {abierto === f.id && b && (
                                <div className="px-3 pb-3 space-y-2">
                                    <p className="text-[9px] font-black uppercase tracking-widest text-white/40">Ahora · transferencia hecha</p>
                                    <textarea value={t.transferencia || ''} rows={8}
                                        onChange={e => setTxt(p => ({ ...p, [f.id]: { ...p[f.id], transferencia: e.target.value } }))}
                                        className="w-full bg-black/25 border border-white/10 rounded-xl p-3 text-[12px] text-white/85 leading-relaxed outline-none focus:border-brand/50 no-uppercase font-sans" />
                                    {b.resena ? (
                                        <>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <label className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-white/40">
                                                    <input type="checkbox" className="accent-amber-400" checked={!!resenaOn[f.id]}
                                                        onChange={e => setResenaOn(p => ({ ...p, [f.id]: e.target.checked }))} />
                                                    Programada · reseña en Google
                                                </label>
                                                <input type="datetime-local" value={resenaAt[f.id] || ''} disabled={!resenaOn[f.id]}
                                                    onChange={e => setResenaAt(p => ({ ...p, [f.id]: e.target.value }))}
                                                    className="bg-black/25 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-white disabled:opacity-40" />
                                            </div>
                                            {resenaOn[f.id] && (
                                                <textarea value={t.resena || ''} rows={11}
                                                    onChange={e => setTxt(p => ({ ...p, [f.id]: { ...p[f.id], resena: e.target.value } }))}
                                                    className="w-full bg-black/25 border border-white/10 rounded-xl p-3 text-[12px] text-white/85 leading-relaxed outline-none focus:border-brand/50 no-uppercase font-sans" />
                                            )}
                                        </>
                                    ) : (
                                        <p className="text-[10px] text-white/35 italic">Sin reseña: {b.resena_motivo}</p>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </Marco>
            <SendActionOverlay
                phase={overlay?.phase || null}
                ok={!!overlay?.ok}
                subtitle={overlay?.subtitle}
                items={overlay?.items || []}
                sendingTitle="Avisando de la transferencia…"
                okTitle="Clientes avisados"
                errorTitle="No se pudo avisar"
                onClose={() => { setOverlay(null); onClose(); }}
            />
        </>,
        document.body,
    );
}

// ─── 5 · Avisar a los INSTALADORES de que sus clientes ya han cobrado ─────────
// UN mensaje por instalador y lote, a su contacto COMERCIAL. Solo se puede mandar
// cuando TODOS sus clientes del lote están transferidos (el texto dice «ya hemos
// abonado»). El texto lo compone el backend (cobroForm, fuente única); aquí se
// revisa y se retoca.
export function AvisoInstaladoresModal({ lote, onClose, onEnviado }) {
    const [datos, setDatos] = useState(null);
    const [txt, setTxt] = useState({});             // instalador_id → mensaje
    const [marcados, setMarcados] = useState({});   // instalador_id → bool
    const [abierto, setAbierto] = useState(null);
    const [canales, setCanales] = useState({ whatsapp: true, email: true });
    const [overlay, setOverlay] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => {
        let vivo = true;
        axios.get(`/api/lotes/${lote.id}/aviso-instaladores`)
            .then(({ data }) => {
                if (!vivo) return;
                setDatos(data);
                const t = {}; const m = {};
                for (const g of data.grupos || []) {
                    if (!g.instalador_id) continue;
                    t[g.instalador_id] = g.mensaje || '';
                    // Por defecto: los que se pueden mandar y aún no se han avisado.
                    m[g.instalador_id] = g.listo && !g.avisado_at;
                }
                setTxt(t); setMarcados(m);
                const primero = (data.grupos || []).find(g => g.listo && !g.avisado_at);
                if (primero) setAbierto(primero.instalador_id);
            })
            .catch(e => { if (vivo) setError(e.response?.data?.error || 'No se pudieron preparar los avisos.'); });
        return () => { vivo = false; };
    }, [lote.id]);

    const grupos = datos?.grupos || [];
    const elegidos = grupos.filter(g => g.listo && marcados[g.instalador_id]);
    const conTlf = elegidos.filter(g => g.contacto?.tlf).length;
    const conEmail = elegidos.filter(g => g.contacto?.email).length;
    const puede = elegidos.length > 0 && (canales.whatsapp || canales.email);

    const enviar = async () => {
        const items = [];
        let fallos = 0;
        for (let i = 0; i < elegidos.length; i++) {
            const g = elegidos[i];
            setOverlay({ phase: 'sending', subtitle: `${i + 1} de ${elegidos.length} · ${g.instalador}` });
            const channels = [
                ...(canales.whatsapp && g.contacto?.tlf ? ['whatsapp'] : []),
                ...(canales.email && g.contacto?.email ? ['email'] : []),
            ];
            if (!channels.length) {
                items.push({ texto: `${g.instalador}: sin teléfono ni email por el canal elegido — no se le ha mandado`, tono: 'info' });
                continue;
            }
            try {
                const { data } = await axios.post(`/api/lotes/${lote.id}/aviso-instaladores/${g.instalador_id}`, {
                    channels, mensaje: txt[g.instalador_id],
                });
                items.push(`${g.instalador} · ${data.contacto} · ${(data.channels || []).join(' + ')}`);
            } catch (e) {
                fallos++;
                items.push({ texto: `${g.instalador}: ${e.response?.data?.error || 'no se pudo enviar'}`, tono: 'aviso' });
            }
        }
        setOverlay({
            phase: 'done', ok: fallos < elegidos.length,
            subtitle: fallos ? `${elegidos.length - fallos} avisados · ${fallos} con error` : `${elegidos.length} instalador${elegidos.length > 1 ? 'es' : ''} avisado${elegidos.length > 1 ? 's' : ''}`,
            items,
        });
        if (onEnviado) onEnviado();
    };

    return createPortal(
        <>
            <Marco
                subtitulo="Pago a los clientes"
                titulo="Avisar a los instaladores"
                explicacion="Un mensaje por instalador, a su contacto comercial: qué clientes suyos ya han cobrado, con su dirección y su ayuda. Solo se puede mandar cuando todos sus clientes del lote están transferidos."
                onClose={onClose}
                pie={(
                    <>
                        <CanalChip canal="whatsapp" nombre="WhatsApp" activo={canales.whatsapp} disponible={conTlf > 0}
                            detalle={`${conTlf} con teléfono`} motivo="Ninguno tiene teléfono"
                            onClick={() => setCanales(c => ({ ...c, whatsapp: !c.whatsapp }))} />
                        <CanalChip canal="email" nombre="Email" activo={canales.email} disponible={conEmail > 0}
                            detalle={`${conEmail} con email`} motivo="Ninguno tiene email"
                            onClick={() => setCanales(c => ({ ...c, email: !c.email }))} />
                        <div className="flex-1" />
                        {error && <span className="w-full text-[10px] text-red-400">{error}</span>}
                        <button type="button" disabled={!puede} onClick={enviar}
                            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-brand text-black text-[12px] font-black uppercase tracking-wider disabled:opacity-40 hover:brightness-110 transition-all">
                            Avisar a {elegidos.length} instalador{elegidos.length === 1 ? '' : 'es'}
                        </button>
                    </>
                )}
            >
                {!datos && !error && <p className="text-[11px] text-white/40">Preparando los mensajes…</p>}
                {grupos.map(g => {
                    const id = g.instalador_id || 'sin';
                    const total = g.items.reduce((s, i) => s + (Number(i.ayuda) || 0), 0);
                    return (
                        <div key={id} className={`rounded-2xl border ${g.listo ? 'border-brand/25 bg-brand/[0.03]' : 'border-white/[0.07] bg-white/[0.02]'}`}>
                            <div className="flex items-center gap-2.5 px-3 py-2.5">
                                {g.instalador_id && (
                                    <input type="checkbox" className="accent-amber-400" disabled={!g.listo}
                                        checked={!!marcados[g.instalador_id]}
                                        onChange={e => setMarcados(p => ({ ...p, [g.instalador_id]: e.target.checked }))} />
                                )}
                                <div className="min-w-0 flex-1">
                                    <p className="text-[12px] font-bold text-white truncate">
                                        {g.instalador} · {g.items.length} cliente{g.items.length === 1 ? '' : 's'} · {eur(total)}
                                    </p>
                                    <p className="text-[10px] text-white/40 truncate">
                                        {g.contacto ? (
                                            <>{g.contacto.general ? 'Canal general' : (g.contacto.nombre || 'Contacto')}
                                                {' · '}{[g.contacto.tlf, g.contacto.email].filter(Boolean).join(' · ') || 'sin teléfono ni email'}</>
                                        ) : '—'}
                                        {g.avisado_at && <span className="text-emerald-300/80"> · avisado el {fechaLarga(g.avisado_at)}</span>}
                                    </p>
                                    {g.motivo && <p className="text-[10px] text-amber-300/80">{g.motivo}</p>}
                                </div>
                                {g.instalador_id && (
                                    <button type="button" onClick={() => setAbierto(a => (a === g.instalador_id ? null : g.instalador_id))}
                                        className="text-[10px] font-bold text-white/45 hover:text-white shrink-0">
                                        {abierto === g.instalador_id ? 'Ocultar' : 'Ver mensaje'}
                                    </button>
                                )}
                            </div>
                            {abierto === g.instalador_id && g.instalador_id && (
                                <div className="px-3 pb-3">
                                    <textarea value={txt[g.instalador_id] || ''} rows={16} readOnly={!g.listo}
                                        onChange={e => setTxt(p => ({ ...p, [g.instalador_id]: e.target.value }))}
                                        className="w-full bg-black/25 border border-white/10 rounded-xl p-3 text-[12px] text-white/85 leading-relaxed outline-none focus:border-brand/50 no-uppercase font-sans read-only:opacity-60" />
                                </div>
                            )}
                        </div>
                    );
                })}
            </Marco>
            <SendActionOverlay
                phase={overlay?.phase || null}
                ok={!!overlay?.ok}
                subtitle={overlay?.subtitle}
                items={overlay?.items || []}
                sendingTitle="Avisando a los instaladores…"
                okTitle="Instaladores avisados"
                errorTitle="No se pudo avisar"
                onClose={() => { setOverlay(null); onClose(); }}
            />
        </>,
        document.body,
    );
}

export default RemesaSepaModal;
