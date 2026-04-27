import React, { useState, useEffect } from 'react';
import axios from 'axios';

/**
 * Modal reutilizable para enviar un mensaje WhatsApp desde cualquier módulo.
 *
 * Props:
 *   - open: boolean
 *   - onClose: () => void
 *   - phone: string (teléfono del destinatario; admite +34..., 34..., 9 dígitos)
 *   - defaultMessage?: string
 *   - attachment?: { base64: string, filename: string, mimetype?: string }  // PDF opcional
 *   - onSent?: (result) => void
 *
 * El modal NO se cierra al clicar fuera (patrón de la app).
 */
export function SendWhatsappModal({ open, onClose, phone, defaultMessage = '', attachment = null, onSent }) {
    const [message, setMessage] = useState(defaultMessage);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState(null);
    const [result, setResult] = useState(null);
    const [status, setStatus] = useState(null);

    useEffect(() => {
        if (open) {
            setMessage(defaultMessage);
            setError(null);
            setResult(null);
            axios.get('/api/whatsapp/status').then(r => setStatus(r.data)).catch(() => setStatus(null));
        }
    }, [open, defaultMessage]);

    if (!open) return null;

    const ready = status?.ready === true;

    const handleSend = async () => {
        setSending(true);
        setError(null);
        try {
            if (attachment?.base64) {
                const r = await axios.post('/api/whatsapp/send-media', {
                    phone,
                    caption: message || undefined,
                    media: {
                        base64: attachment.base64,
                        filename: attachment.filename,
                        mimetype: attachment.mimetype || 'application/pdf',
                    },
                    asDocument: true,
                });
                setResult(r.data);
                onSent?.(r.data);
            } else {
                const r = await axios.post('/api/whatsapp/send-text', {
                    phone,
                    message,
                });
                setResult(r.data);
                onSent?.(r.data);
            }
        } catch (err) {
            setError(err.response?.data?.error || err.message);
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="bg-slate-900 rounded-2xl max-w-lg w-full border border-emerald-500/20 shadow-2xl relative">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-t-2xl"></div>

                <div className="p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xl font-bold text-white flex items-center gap-2">
                            <span className="text-2xl">💬</span> Enviar WhatsApp
                        </h3>
                        <button onClick={onClose} className="text-white/40 hover:text-white text-xl leading-none">×</button>
                    </div>

                    {!ready && (
                        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs mb-4">
                            El canal de WhatsApp no está conectado. Ve a <strong>WhatsApp</strong> en el menú lateral y vincula el dispositivo antes de enviar.
                        </div>
                    )}

                    <div className="mb-4">
                        <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-1.5">Destinatario</label>
                        <div className="px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-white font-mono text-sm">
                            {phone || <span className="text-red-400">(sin teléfono)</span>}
                        </div>
                    </div>

                    {attachment && (
                        <div className="mb-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center gap-3">
                            <span className="text-2xl">📎</span>
                            <div className="flex-1 min-w-0">
                                <div className="text-[10px] font-black uppercase tracking-widest text-blue-300 mb-0.5">Adjunto</div>
                                <div className="text-white text-sm truncate">{attachment.filename}</div>
                            </div>
                        </div>
                    )}

                    <div className="mb-4">
                        <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-1.5">
                            {attachment ? 'Mensaje (caption del adjunto)' : 'Mensaje'}
                        </label>
                        <textarea
                            value={message}
                            onChange={e => setMessage(e.target.value)}
                            rows={5}
                            className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-white text-sm resize-none focus:border-emerald-500/50 focus:outline-none"
                            placeholder="Escribe el mensaje..."
                        />
                    </div>

                    {error && (
                        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-xs">
                            {error}
                        </div>
                    )}

                    {result && (
                        <div className="mb-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs">
                            ✓ Enviado correctamente.
                        </div>
                    )}

                    <div className="flex gap-3 justify-end">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold text-xs uppercase tracking-wider"
                        >
                            Cerrar
                        </button>
                        <button
                            onClick={handleSend}
                            disabled={sending || !ready || !phone || (!message && !attachment)}
                            className="px-5 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-900 font-black text-xs uppercase tracking-wider disabled:opacity-40"
                        >
                            {sending ? 'Enviando...' : 'Enviar'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default SendWhatsappModal;
