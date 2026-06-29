import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';

// ─── WhatsappConnectModal ────────────────────────────────────────────────────
// Puerta de conexión reutilizable: cuando una acción necesita WhatsApp y el
// servicio NO está READY, este modal pregunta si conectar, muestra el QR y
// hace polling del estado. En cuanto pasa a READY llama a onConnected() UNA vez
// (p.ej. para disparar el envío automáticamente).
//
// Props:
//   isOpen, onClose
//   onConnected: () => void   → se llama automáticamente al alcanzar READY
//   actionLabel?: string      → texto del CTA ("Se enviará al conectar")

export function WhatsappConnectModal({ isOpen, onClose, onConnected, actionLabel = 'Al conectar, el mensaje se enviará automáticamente.' }) {
    const [status, setStatus] = useState(null);
    const [qr, setQr] = useState(null);
    const [connecting, setConnecting] = useState(false);
    const [error, setError] = useState(null);
    const firedRef = useRef(false);

    useEffect(() => {
        if (!isOpen) return;
        firedRef.current = false;
        let stop = false;

        const tick = async () => {
            try {
                const { data } = await axios.get('/api/whatsapp/status');
                if (stop) return;
                setStatus(data);
                if (data?.state === 'QR') {
                    try { const q = await axios.get('/api/whatsapp/qr'); if (!stop && q.data?.dataUrl) setQr(q.data.dataUrl); } catch { /* aún no hay QR */ }
                } else if (data?.state === 'READY') {
                    setQr(null);
                    if (!firedRef.current) {
                        firedRef.current = true;
                        onConnected?.();
                    }
                }
            } catch (e) {
                if (!stop) setError(e.response?.data?.error || 'No se pudo consultar el estado de WhatsApp.');
            }
        };

        tick();
        const iv = setInterval(tick, 3000);
        return () => { stop = true; clearInterval(iv); };
    }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!isOpen) return null;

    const state = status?.state || 'UNKNOWN';
    const handleConnect = async () => {
        setConnecting(true); setError(null);
        try { await axios.post('/api/whatsapp/connect'); }
        catch (e) { setError(e.response?.data?.error || 'No se pudo iniciar la conexión.'); }
        finally { setConnecting(false); }
    };

    return (
        <div className="fixed inset-0 z-[650] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fade-in" onClick={onClose}>
            <div className="relative w-full max-w-sm bg-[#0F1013] border border-white/10 rounded-3xl shadow-2xl overflow-hidden animate-scale-in" onClick={e => e.stopPropagation()}>
                <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-64 h-64 rounded-full blur-3xl pointer-events-none bg-emerald-500/20" />
                <div className="relative px-8 py-9 flex flex-col items-center text-center">
                    <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mb-5">
                        <svg className="w-8 h-8 text-emerald-400" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.51 5.26l-.999 3.648 3.978-1.607z"/></svg>
                    </div>

                    <h3 className="text-lg font-black uppercase tracking-tight text-white mb-1">WhatsApp no conectado</h3>
                    <p className="text-white/40 text-[11px] leading-relaxed mb-5">{actionLabel}</p>

                    {error && <div className="w-full mb-4 px-3 py-2 rounded-xl border border-red-400/20 bg-red-500/[0.06] text-[11px] text-red-400">⚠️ {error}</div>}

                    {/* Estado / QR */}
                    {state === 'READY' ? (
                        <div className="flex items-center gap-2 text-emerald-400 text-[12px] font-bold py-4">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                            Conectado · enviando…
                        </div>
                    ) : state === 'QR' && qr ? (
                        <>
                            <img src={qr} alt="QR WhatsApp" className="w-48 h-48 rounded-lg bg-white p-2 mb-3" />
                            <p className="text-white/40 text-[11px]">Escanéalo desde WhatsApp → Dispositivos vinculados. Se enviará solo al conectar.</p>
                        </>
                    ) : (state === 'INITIALIZING' || state === 'AUTHENTICATED' || connecting) ? (
                        <div className="flex items-center gap-2 text-white/40 text-[12px] py-4">
                            <div className="w-4 h-4 border-2 border-white/10 border-t-white/40 rounded-full animate-spin" />
                            Iniciando WhatsApp…
                        </div>
                    ) : (
                        <button onClick={handleConnect} disabled={connecting}
                            className="w-full py-3.5 rounded-xl bg-emerald-500 text-black text-[11px] font-black uppercase tracking-widest hover:brightness-110 active:scale-95 transition-all disabled:opacity-40">
                            Conectar WhatsApp
                        </button>
                    )}

                    <button onClick={onClose} className="mt-5 text-white/30 text-[10px] font-black uppercase tracking-[0.2em] hover:text-white transition-all">
                        Cancelar
                    </button>
                </div>
            </div>
        </div>
    );
}

export default WhatsappConnectModal;
