import React, { useEffect, useState } from 'react';
import axios from 'axios';

// Acciones sobre la Memoria RITE (.docx) + Borrador del Certificado (.pdf):
// Descargar · Subir a Drive · Email · WhatsApp. Email/WhatsApp van al contacto
// de notificaciones del partner (si está activo) con el mensaje editable.
export function EnviarBorradorRiteModal({ isOpen, onClose, expediente, defaultMessage, onSent, onUploaded }) {
    const pres = expediente?.prescriptores || {};
    const useContact = pres.contacto_notificaciones_activas === true || pres.contacto_notificaciones_activas === 'true';
    const email = (useContact ? (pres.email_contacto || pres.email) : pres.email) || '';
    const tlf = (useContact ? (pres.tlf_contacto || pres.tlf || pres.telefono) : (pres.tlf || pres.telefono)) || '';
    const nombre = (useContact ? (pres.nombre_contacto || pres.razon_social) : (pres.nombre_responsable || pres.razon_social)) || 'Instalador';

    const [message, setMessage] = useState(defaultMessage || '');
    const [waReady, setWaReady] = useState(null);
    const [busy, setBusy] = useState(null);       // 'download' | 'drive' | 'email' | 'whatsapp'
    const [status, setStatus] = useState(null);    // { ok, text }

    useEffect(() => {
        if (!isOpen) return;
        setMessage(defaultMessage || '');
        setStatus(null);
        setBusy(null);
        axios.get('/api/whatsapp/status').then(r => setWaReady(!!r.data?.ready)).catch(() => setWaReady(false));
    }, [isOpen, defaultMessage]);

    if (!isOpen) return null;

    const downloadOne = (f) => {
        const bytes = Uint8Array.from(atob(f.base64), c => c.charCodeAt(0));
        const url = URL.createObjectURL(new Blob([bytes], { type: f.mimetype || 'application/octet-stream' }));
        const a = document.createElement('a');
        a.href = url; a.download = f.name; document.body.appendChild(a); a.click();
        document.body.removeChild(a); URL.revokeObjectURL(url);
    };

    const handleDownload = async () => {
        setBusy('download'); setStatus(null);
        try {
            const { data } = await axios.post(`/api/expedientes/${expediente.id}/memoria-rite/files`);
            // 3 ficheros: Memoria (Word) + Memoria (PDF) + Borrador (PDF). La guía JE6 no.
            const files = (data?.files || []).filter(f => {
                const n = (f.name || '').toUpperCase();
                return n.endsWith('.DOCX')
                    || n.includes('BORRADOR_CERTIFICADO')
                    || (n.includes('MEMORIA_RITE') && n.endsWith('.PDF'));
            });
            files.forEach((f, i) => setTimeout(() => downloadOne(f), i * 250));
            setStatus({ ok: true, text: 'Documentos descargados ✓' });
        } catch (err) {
            setStatus({ ok: false, text: err.response?.data?.error || err.message });
        } finally { setBusy(null); }
    };

    const handleDrive = async () => {
        setBusy('drive'); setStatus(null);
        try {
            const { data } = await axios.post(`/api/expedientes/${expediente.id}/memoria-rite/generate`);
            if (onUploaded) onUploaded(data);
            setStatus({ ok: true, text: 'Subido a Drive (7. LEGALIZACION RITE) ✓' });
        } catch (err) {
            const resp = err.response?.data;
            setStatus({ ok: false, text: resp?.error || resp?.details || err.message });
        } finally { setBusy(null); }
    };

    const sendChannel = async (channel) => {
        setBusy(channel); setStatus(null);
        try {
            const { data } = await axios.post(`/api/expedientes/${expediente.id}/memoria-rite/send`, { channels: [channel], message });
            const r = channel === 'email' ? data?.email : data?.whatsapp;
            if (r?.ok) {
                if (onSent) onSent();
                setStatus({ ok: true, text: channel === 'email' ? `Email enviado a ${r.to} ✓` : `WhatsApp enviado a ${r.phone} ✓` });
            } else {
                setStatus({ ok: false, text: r?.error || 'No se pudo enviar' });
            }
        } catch (err) {
            setStatus({ ok: false, text: err.response?.data?.error || err.message });
        } finally { setBusy(null); }
    };

    const Action = ({ id, onClick, label, sub, disabled, disabledReason, icon }) => (
        <button
            type="button"
            disabled={disabled || (busy && busy !== id)}
            onClick={onClick}
            title={disabled ? disabledReason : label}
            className={`flex flex-col items-center justify-center gap-1.5 py-3 px-2 rounded-xl border transition-all ${
                disabled
                    ? 'border-white/5 bg-white/[0.02] opacity-40 cursor-not-allowed'
                    : 'border-white/10 bg-white/[0.02] hover:border-brand/40 hover:bg-brand/5 active:scale-95'
            }`}
        >
            <span className="text-brand">
                {busy === id ? (
                    <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" /></svg>
                ) : icon}
            </span>
            <span className="text-[10px] font-black uppercase tracking-wide text-white/80">{label}</span>
            <span className="text-[8px] text-white/30 truncate max-w-full">{disabled ? disabledReason : sub}</span>
        </button>
    );

    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-[#0F1013] border border-white/[0.07] rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="px-6 py-5 border-b border-white/[0.07] bg-brand/5 flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-black uppercase tracking-tight text-white">Documentación RITE</h2>
                        <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest mt-0.5">Memoria (Word + PDF) + Borrador certificado</p>
                    </div>
                    <button onClick={onClose} className="text-white/30 hover:text-white transition-colors">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                <div className="px-6 py-5 space-y-4 max-h-[72vh] overflow-y-auto custom-scrollbar">
                    <div className="text-[11px] text-white/50">
                        Para el instalador: <span className="text-white font-bold">{nombre}</span>
                        {(email || tlf) && <span className="text-white/30"> · {[email, tlf].filter(Boolean).join(' · ')}</span>}
                    </div>

                    {/* 4 acciones */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <Action id="download" onClick={handleDownload} label="Descargar" sub="3 archivos"
                            icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" /></svg>} />
                        <Action id="drive" onClick={handleDrive} label="Subir a Drive" sub="7. LEGALIZACIÓN"
                            icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.9A5 5 0 1115.9 6 4.5 4.5 0 0117 15M12 12v6m0-6l-2 2m2-2l2 2" /></svg>} />
                        <Action id="email" onClick={() => sendChannel('email')} label="Email" sub={email || 'sin email'} disabled={!email} disabledReason="Sin email"
                            icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>} />
                        <Action id="whatsapp" onClick={() => sendChannel('whatsapp')} label="WhatsApp" sub={tlf || 'sin teléfono'} disabled={!tlf || waReady === false} disabledReason={!tlf ? 'Sin teléfono' : 'WA no conectado'}
                            icon={<svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.945C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.519 5.26l-.999 3.648 3.97-1.607zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" /></svg>} />
                    </div>

                    {/* Mensaje (email / whatsapp) */}
                    <div>
                        <label className="block text-[9px] font-black text-white/30 uppercase tracking-[0.2em] mb-2">Mensaje (email / WhatsApp)</label>
                        <textarea
                            value={message}
                            onChange={e => setMessage(e.target.value)}
                            rows={10}
                            className="w-full bg-bkg-elevated border border-white/5 rounded-xl px-4 py-3 text-white text-[12px] leading-relaxed focus:outline-none focus:border-brand/40 transition-all resize-y"
                        />
                    </div>

                    {status && (
                        <p className={`text-[11px] ${status.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                            {status.ok ? '✅' : '❌'} {status.text}
                        </p>
                    )}
                </div>

                <div className="px-6 py-4 bg-white/[0.02] border-t border-white/[0.07] flex justify-end">
                    <button onClick={onClose} className="px-5 py-2.5 rounded-xl border border-white/10 text-white/50 text-[10px] font-black uppercase tracking-widest hover:text-white hover:border-white/30 transition-all">
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );
}
