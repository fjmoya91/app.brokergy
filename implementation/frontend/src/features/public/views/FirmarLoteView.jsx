import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { DynamicNetworkBackground } from '../../../components/DynamicNetworkBackground';
import FirmarConCertificadoModal from '../../expedientes/components/FirmarConCertificadoModal';

const isProd = import.meta.env.PROD;
const API_URL = isProd ? '/api/public' : 'http://localhost:3000/api/public';

// Descarga un PDF (arraybuffer) y lo devuelve en base64 (sin prefijo data:).
async function fetchPdfBase64(url) {
    const { data } = await axios.get(url, { responseType: 'arraybuffer' });
    let binary = '';
    const bytes = new Uint8Array(data);
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
}
// Lee un File a base64 (sin el prefijo data:).
const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = reject;
    r.readAsDataURL(file);
});

export function FirmarLoteView({ loteId }) {
    const [info, setInfo] = useState(null);
    const [loadError, setLoadError] = useState(null);
    const [signQueue, setSignQueue] = useState([]);   // documentos que se están firmando (1 suelto o varios en cadena)
    const [signIndex, setSignIndex] = useState(0);
    const [signPdfB64, setSignPdfB64] = useState(null);
    const [signOpen, setSignOpen] = useState(false);
    const chainRef = useRef(false);                   // true = firma en cadena; false = un solo documento
    const [preparingKey, setPreparingKey] = useState(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [manualBusyKey, setManualBusyKey] = useState(null);
    const [manualKey, setManualKey] = useState(null); // fila con opciones manuales desplegadas

    const loadInfo = () => axios.get(`${API_URL}/lote-firma/${loteId}`)
        .then(r => setInfo(r.data))
        .catch(() => setLoadError('No se ha encontrado el lote o el enlace no es válido.'));

    useEffect(() => { loadInfo(); }, [loteId]);

    const docs = info?.docs || [];
    const total = info?.total || 0;
    const firmados = info?.firmados || 0;
    const todosFirmados = !!info?.todos_firmados;
    const pendientes = docs.filter(d => d.disponible && !d.firmado);
    const busy = saving || !!preparingKey;

    // ── Abrir el modal de firma para un documento concreto ────────────────────
    const openSign = async (item) => {
        setError(null);
        setPreparingKey(item.key);
        try {
            const b64 = await fetchPdfBase64(`${API_URL}/lote-firma/${loteId}/descargar/${item.key}`);
            setSignPdfB64(b64);
            setSignQueue(prev => (chainRef.current ? prev : [item]));
            setSignIndex(prev => (chainRef.current ? prev : 0));
            setSignOpen(true);
        } catch {
            setError('No se pudo cargar el documento para firmar. Inténtalo de nuevo.');
        } finally {
            setPreparingKey(null);
        }
    };

    // Firmar UN documento (elegido por el usuario en la lista).
    const signOne = (item) => {
        chainRef.current = false;
        setSignQueue([item]);
        setSignIndex(0);
        openSign(item);
    };

    // Firmar TODOS los pendientes en cadena.
    const startChain = async () => {
        const q = docs.filter(d => d.disponible && !d.firmado);
        if (!q.length) { setError('No hay documentos pendientes de firmar.'); return; }
        chainRef.current = true;
        setSignQueue(q);
        setSignIndex(0);
        await openSignAt(q, 0);
    };
    const openSignAt = async (queue, idx) => {
        setSignIndex(idx);
        await openSign(queue[idx]);
    };

    // Recibe el PDF firmado → lo guarda y avanza (cadena) o refresca (suelto).
    const handleSigned = async (signedB64) => {
        const item = signQueue[signIndex];
        setSignOpen(false);
        setSignPdfB64(null);
        setSaving(true);
        setError(null);
        try {
            await axios.post(`${API_URL}/lote-firma/${loteId}/firmar`, { docKey: item.key, signedPdfBase64: signedB64 });
            if (chainRef.current && signIndex + 1 < signQueue.length) {
                await openSignAt(signQueue, signIndex + 1);
            } else {
                chainRef.current = false;
                await loadInfo();
            }
        } catch (e) {
            setError(e.response?.data?.error || 'El documento se firmó pero no se pudo guardar. Inténtalo de nuevo.');
        } finally {
            setSaving(false);
        }
    };

    // Cerrar el modal de firma (Cancelar): corta la cadena y vuelve a la lista.
    const closeSign = () => {
        chainRef.current = false;
        setSignOpen(false);
        setSignPdfB64(null);
        setSignQueue([]);
        loadInfo();
    };

    // ── FIRMA MANUAL: subir el PDF firmado de un documento ────────────────────
    const handleManualUpload = async (docKey, file) => {
        if (!file) return;
        if (file.type !== 'application/pdf') { setError('El fichero firmado debe ser un PDF.'); return; }
        setError(null);
        setManualBusyKey(docKey);
        try {
            const base64 = await fileToBase64(file);
            await axios.post(`${API_URL}/lote-firma/${loteId}/firmar`, { docKey, signedPdfBase64: base64 });
            await loadInfo();
        } catch (e) {
            setError(e.response?.data?.error || 'No se pudo subir el documento firmado.');
        } finally {
            setManualBusyKey(null);
        }
    };

    if (!info && !loadError) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center">
                <DynamicNetworkBackground />
                <div className="relative z-10 flex flex-col items-center gap-4">
                    <svg className="w-8 h-8 animate-spin text-brand" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
                    <p className="text-white/40 font-bold uppercase tracking-widest text-xs">Cargando lote...</p>
                </div>
            </div>
        );
    }

    if (loadError) {
        return (
            <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden">
                <DynamicNetworkBackground />
                <div className="w-full max-w-md relative z-10 bg-bkg-surface border border-white/[0.06] rounded-[2.5rem] p-10 text-center backdrop-blur-xl">
                    <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6 border border-red-500/30">
                        <svg className="w-10 h-10 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </div>
                    <h2 className="text-2xl font-black text-white mb-4 tracking-tight">Enlace no válido</h2>
                    <p className="text-white/40 text-sm leading-relaxed">{loadError}</p>
                </div>
            </div>
        );
    }

    // Fila de un documento en la lista.
    const DocRow = ({ d }) => {
        const isPreparing = preparingKey === d.key;
        const isUploading = manualBusyKey === d.key;
        const showManual = manualKey === d.key;
        return (
            <div className={`rounded-2xl border p-3.5 transition-all ${d.firmado ? 'border-emerald-500/25 bg-emerald-500/[0.05]' : 'border-white/[0.07] bg-white/[0.02]'}`}>
                <div className="flex items-center gap-3">
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${d.firmado ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/5 text-white/30'}`}>
                        {d.firmado
                            ? <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                            : <span className="w-1.5 h-1.5 rounded-full bg-white/40" />}
                    </span>
                    <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-bold text-white/85 truncate">{d.label}</p>
                        <p className={`text-[10px] font-black uppercase tracking-wider ${d.firmado ? 'text-emerald-400' : 'text-white/30'}`}>{d.firmado ? 'Firmado ✓' : 'Pendiente de firma'}</p>
                    </div>
                    {!d.firmado ? (
                        <button onClick={() => signOne(d)} disabled={busy || !d.disponible}
                            className="shrink-0 px-4 py-2 rounded-xl bg-gradient-to-r from-brand to-brand-700 text-bkg-deep text-[11px] font-black uppercase tracking-widest hover:brightness-110 active:scale-95 disabled:opacity-40 transition-all flex items-center gap-1.5">
                            {isPreparing
                                ? <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
                                : '🖊️'} Firmar
                        </button>
                    ) : (
                        <button onClick={() => signOne(d)} disabled={busy}
                            className="shrink-0 px-3 py-2 rounded-xl border border-white/10 text-white/50 text-[10px] font-black uppercase tracking-widest hover:text-white hover:border-white/25 disabled:opacity-40 transition-all">
                            Volver a firmar
                        </button>
                    )}
                </div>
                {/* Opciones alternativas (firma a mano): descargar + subir firmado */}
                <div className="mt-2 pl-8">
                    {!showManual ? (
                        <button onClick={() => setManualKey(d.key)} className="text-[10px] font-bold uppercase tracking-wider text-white/30 hover:text-white/60 transition-colors">Firmar a mano ▾</button>
                    ) : (
                        <div className="flex items-center gap-2 flex-wrap">
                            <a href={`${API_URL}/lote-firma/${loteId}/descargar/${d.key}`}
                                className="flex items-center gap-1.5 py-1.5 px-3 rounded-lg border border-white/10 bg-white/[0.02] text-white/60 text-[10px] font-black uppercase tracking-wider hover:border-brand/40 hover:bg-brand/5 transition-all">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" /></svg>
                                Descargar
                            </a>
                            <label className="flex items-center gap-1.5 py-1.5 px-3 rounded-lg border border-dashed border-white/15 text-white/60 text-[10px] font-black uppercase tracking-wider cursor-pointer hover:border-brand/40 hover:text-white/80 transition-all">
                                {isUploading ? 'Subiendo…' : (d.firmado ? 'Reemplazar' : 'Subir firmado')}
                                <input type="file" accept="application/pdf" className="hidden" disabled={isUploading}
                                    onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; handleManualUpload(d.key, f); }} />
                            </label>
                            <button onClick={() => setManualKey(null)} className="text-[10px] font-bold uppercase tracking-wider text-white/25 hover:text-white/50">Ocultar</button>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="h-[100dvh] overflow-y-auto overflow-x-hidden bg-slate-950 flex flex-col items-center p-4 relative selection:bg-brand selection:text-black">
            <DynamicNetworkBackground />
            <div className="w-full max-w-lg relative z-10 px-4 py-10 shrink-0">
                <div className="text-center mb-8 relative">
                    <h1 className="flex items-baseline justify-center gap-x-2 md:gap-x-4 mb-2 relative z-10">
                        <span className="text-white text-2xl md:text-3xl font-medium tracking-tight">Firma del</span>
                        <span className="text-3xl md:text-5xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-brand via-brand to-brand-700 uppercase">Lote</span>
                    </h1>
                    <p className="text-white/60 text-sm">Firma con tu certificado el Anexo I, las fichas RES y la solicitud de verificación.</p>
                </div>

                <div className="bg-bkg-surface shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/[0.06] rounded-[2rem] overflow-hidden backdrop-blur-xl relative">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-brand/40 to-transparent"></div>

                    <div className="px-8 pt-8 pb-5 border-b border-white/[0.06] space-y-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 mb-3">Detalles del lote</p>
                        {[['Lote', info.codigo, 'text-brand font-mono'], ['Sujeto Obligado', info.sujeto_obligado, 'text-white/80'], ['Firmante', info.representante, 'text-white/80']].map(([label, value, cls]) => (
                            <div key={label} className="flex items-center justify-between">
                                <span className="text-[10px] text-white/30 uppercase tracking-widest font-bold">{label}</span>
                                <span className={`text-sm font-bold ${cls}`}>{value || '—'}</span>
                            </div>
                        ))}
                        {/* Progreso */}
                        <div className="pt-2">
                            <div className="flex items-center justify-between mb-1.5">
                                <span className="text-[10px] text-white/30 uppercase tracking-widest font-bold">Firmados</span>
                                <span className="text-[11px] font-black text-white">{firmados} / {total}</span>
                            </div>
                            <div className="h-1.5 w-full bg-white/[0.06] rounded-full overflow-hidden">
                                <div className="h-full bg-gradient-to-r from-brand to-emerald-400 transition-all duration-500" style={{ width: `${total ? (firmados / total) * 100 : 0}%` }} />
                            </div>
                        </div>
                    </div>

                    <div className="p-6 sm:p-8 space-y-4">
                        {todosFirmados ? (
                            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-8 text-center animate-fade-in">
                                <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-4 border border-emerald-500/20">
                                    <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                </div>
                                <h2 className="text-xl font-black text-emerald-400 uppercase tracking-widest mb-3">¡Lote firmado!</h2>
                                <p className="text-white/50 text-sm leading-relaxed">Gracias. Has firmado los <strong className="text-brand">{total}</strong> documentos del lote <strong className="text-brand">{info.codigo}</strong>. Brokergy continuará con la tramitación.</p>
                            </div>
                        ) : (
                            <>
                                <p className="text-white/50 text-[13px] leading-relaxed text-center">
                                    Tienes <strong className="text-white">{pendientes.length}</strong> documento{pendientes.length === 1 ? '' : 's'} pendiente{pendientes.length === 1 ? '' : 's'}. Firma cada uno con tu certificado (Autofirma) — te marcamos dónde firmar y se guarda al instante. Puedes firmarlos <strong className="text-white">uno a uno</strong> o <strong className="text-white">todos en cadena</strong>.
                                </p>

                                {/* Firmar todos en cadena */}
                                {pendientes.length > 1 && (
                                    <button onClick={startChain} disabled={busy}
                                        className="w-full py-3.5 bg-gradient-to-r from-brand to-brand-700 hover:from-brand-400 hover:to-brand-600 text-bkg-deep font-black rounded-xl transition-all shadow-lg shadow-brand/20 disabled:opacity-40 flex items-center justify-center gap-2.5 text-[13px] uppercase tracking-widest">
                                        {busy
                                            ? <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>{saving ? 'Guardando…' : 'Preparando…'}</>
                                            : <>🖊️ Firmar los {pendientes.length} en cadena</>}
                                    </button>
                                )}

                                {error && <p className="text-[12px] text-red-400 text-center">⚠️ {error}</p>}

                                {/* Lista de documentos (seleccionables) */}
                                <div className="space-y-2">
                                    {docs.map(d => <DocRow key={d.key} d={d} />)}
                                </div>
                            </>
                        )}
                    </div>
                </div>

                <p className="text-center mt-8 text-[10px] uppercase font-black tracking-[0.2em] text-white/20">Sistema de Gestión Brokergy &copy; {new Date().getFullYear()}</p>
            </div>

            {/* Modal de firma con Autofirma (recuadro fijo en la zona de firma) */}
            {signOpen && signPdfB64 && (
                <FirmarConCertificadoModal
                    pdfBase64={signPdfB64}
                    title={`Firmar ${signQueue[signIndex]?.label || 'documento'}${chainRef.current && signQueue.length > 1 ? ` (${signIndex + 1}/${signQueue.length})` : ''} · ${info.codigo}`}
                    rubricImageUrl={null}
                    signatureAnchor={signQueue[signIndex]?.anchor}
                    fixedBox={signQueue[signIndex]?.fixedBox}
                    onClose={closeSign}
                    onSigned={handleSigned}
                />
            )}
        </div>
    );
}

export default FirmarLoteView;
