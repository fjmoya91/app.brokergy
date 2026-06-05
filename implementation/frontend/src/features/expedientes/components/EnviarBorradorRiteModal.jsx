import React, { useEffect, useState } from 'react';
import axios from 'axios';

// Modal para enviar al INSTALADOR la Memoria RITE (.docx) + el Borrador del
// Certificado (.pdf) por Email y/o WhatsApp, con un mensaje editable.
export function EnviarBorradorRiteModal({ isOpen, onClose, expediente, defaultMessage, onSent }) {
    const pres = expediente?.prescriptores || {};
    const useContact = pres.contacto_notificaciones_activas === true || pres.contacto_notificaciones_activas === 'true';
    const email = (useContact ? (pres.email_contacto || pres.email) : pres.email) || '';
    const tlf = (useContact ? (pres.tlf_contacto || pres.tlf || pres.telefono) : (pres.tlf || pres.telefono)) || '';
    const nombre = pres.nombre_responsable || pres.nombre_contacto || pres.razon_social || 'Instalador';

    const [message, setMessage] = useState(defaultMessage || '');
    const [sendEmail, setSendEmail] = useState(!!email);
    const [sendWa, setSendWa] = useState(false);
    const [waReady, setWaReady] = useState(null); // null=desconocido
    const [sending, setSending] = useState(false);
    const [result, setResult] = useState(null);

    useEffect(() => {
        if (!isOpen) return;
        setMessage(defaultMessage || '');
        setSendEmail(!!email);
        setSendWa(false);
        setResult(null);
        axios.get('/api/whatsapp/status')
            .then(r => setWaReady(!!r.data?.ready))
            .catch(() => setWaReady(false));
    }, [isOpen, defaultMessage, email]);

    if (!isOpen) return null;

    const handleSend = async () => {
        const channels = [];
        if (sendEmail) channels.push('email');
        if (sendWa) channels.push('whatsapp');
        if (!channels.length) { setResult({ error: 'Selecciona al menos un canal.' }); return; }
        setSending(true);
        setResult(null);
        try {
            const { data } = await axios.post(`/api/expedientes/${expediente.id}/memoria-rite/send`, { channels, message });
            setResult(data);
            const anyOk = data?.email?.ok || data?.whatsapp?.ok;
            if (anyOk && onSent) onSent();
        } catch (err) {
            setResult({ error: err.response?.data?.error || err.message });
        } finally {
            setSending(false);
        }
    };

    const Channel = ({ checked, onChange, label, sub, disabled, disabledReason }) => (
        <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(!checked)}
            className={`flex-1 flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                disabled
                    ? 'border-white/5 bg-white/[0.02] opacity-50 cursor-not-allowed'
                    : checked
                        ? 'border-brand/40 bg-brand/10'
                        : 'border-white/10 bg-white/[0.02] hover:border-white/20'
            }`}
        >
            <div className={`w-5 h-5 mt-0.5 rounded-md border flex items-center justify-center flex-shrink-0 ${checked && !disabled ? 'bg-brand border-brand' : 'border-white/20'}`}>
                {checked && !disabled && (
                    <svg className="w-3.5 h-3.5 text-bkg-deep" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                )}
            </div>
            <div className="min-w-0">
                <p className="text-xs font-black text-white uppercase tracking-wide">{label}</p>
                <p className="text-[10px] text-white/40 truncate">{disabled ? disabledReason : sub}</p>
            </div>
        </button>
    );

    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-[#0F1013] border border-white/[0.07] rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="px-6 py-5 border-b border-white/[0.07] bg-brand/5 flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-black uppercase tracking-tight text-white">Enviar al instalador</h2>
                        <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest mt-0.5">Memoria + Borrador certificado RITE</p>
                    </div>
                    <button onClick={onClose} className="text-white/30 hover:text-white transition-colors">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
                    <div className="text-[11px] text-white/50">
                        Destinatario: <span className="text-white font-bold">{nombre}</span>
                    </div>

                    <div className="flex gap-3">
                        <Channel checked={sendEmail} onChange={setSendEmail} label="Email" sub={email || 'sin email'} disabled={!email} disabledReason="El instalador no tiene email" />
                        <Channel checked={sendWa} onChange={setSendWa} label="WhatsApp" sub={tlf || 'sin teléfono'} disabled={!tlf || waReady === false} disabledReason={!tlf ? 'El instalador no tiene teléfono' : 'WhatsApp no conectado'} />
                    </div>

                    <div>
                        <label className="block text-[9px] font-black text-white/30 uppercase tracking-[0.2em] mb-2">Mensaje</label>
                        <textarea
                            value={message}
                            onChange={e => setMessage(e.target.value)}
                            rows={11}
                            className="w-full bg-bkg-elevated border border-white/5 rounded-xl px-4 py-3 text-white text-[12px] leading-relaxed focus:outline-none focus:border-brand/40 transition-all resize-y"
                        />
                    </div>

                    {result && (
                        <div className="space-y-1 text-[11px]">
                            {result.error && <p className="text-red-400">❌ {result.error}</p>}
                            {result.email && <p className={result.email.ok ? 'text-emerald-400' : 'text-red-400'}>{result.email.ok ? `✅ Email enviado a ${result.email.to}` : `❌ Email: ${result.email.error}`}</p>}
                            {result.whatsapp && <p className={result.whatsapp.ok ? 'text-emerald-400' : 'text-red-400'}>{result.whatsapp.ok ? `✅ WhatsApp enviado a ${result.whatsapp.phone}` : `❌ WhatsApp: ${result.whatsapp.error}`}</p>}
                        </div>
                    )}
                </div>

                <div className="px-6 py-4 bg-white/[0.02] border-t border-white/[0.07] flex gap-3">
                    <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-white/10 text-white/50 text-[10px] font-black uppercase tracking-widest hover:text-white hover:border-white/30 transition-all">
                        Cerrar
                    </button>
                    <button onClick={handleSend} disabled={sending || (!sendEmail && !sendWa)} className="flex-1 px-4 py-2.5 rounded-xl bg-brand text-bkg-deep text-[10px] font-black uppercase tracking-widest hover:bg-brand/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                        {sending ? 'Enviando…' : 'Enviar'}
                    </button>
                </div>
            </div>
        </div>
    );
}
