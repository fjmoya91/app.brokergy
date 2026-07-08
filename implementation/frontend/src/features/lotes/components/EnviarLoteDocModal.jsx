import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import confetti from 'canvas-confetti';

// ─────────────────────────────────────────────────────────────────────────────
// Modal REUTILIZABLE de envío de documentos de un LOTE.
//
// Mismo look & feel que EnviarAnexosModal (contenedor bg-[#0F1013], cabecera
// bg-brand/5, toggles de canal Email/WhatsApp, textarea de mensaje y, sobre todo,
// el OVERLAY "Enviando → Enviado" con confeti). A diferencia del de anexos, este
// modal es GENÉRICO: NO depende de expediente/cliente/instalador. El llamante le
// pasa ya construidos los documentos (`docs`), el destinatario por defecto, el
// teléfono y el mensaje.
//
// Props:
//   onClose         () => void
//   title           string  → título de la cabecera
//   subtitle        string  → subtítulo de la cabecera
//   defaultEmail    string  → email destinatario por defecto
//   defaultPhone    string  → teléfono (WhatsApp) por defecto
//   defaultMessage  string  → mensaje por defecto (editable)
//   summaryData     { id, docType }  → se pasa TAL CUAL a /api/pdf/send-annex
//                                       (el backend usa summaryData.id)
//   docs            [{ html, fileName, label }]  → documentos ya construidos
//
// Envío:
//   - Email: UNA llamada a /api/pdf/send-annex con todos los adjuntos.
//   - WhatsApp: genera cada PDF (/api/pdf/generate) y los manda uno a uno
//     (/api/whatsapp/send-media). El primer doc lleva el mensaje completo.
//
// El modal se renderiza en un PORTAL (document.body) con z-index alto para
// quedar por encima del modal del lote (z-[320]).
// ─────────────────────────────────────────────────────────────────────────────

const phoneValid = (ph) => (ph || '').replace(/[^0-9]/g, '').length >= 9;

// Props extra (opcionales, no rompen usos previos):
//   extraBody        ReactNode → contenido adicional en el cuerpo (p.ej. slot para
//                    subir la Solicitud de Verificación en el envío al S.O.).
//   onSendOverride   async ({ email, phone, channels, message }) => [{channel,status,text}]
//                    → si se pasa, SUSTITUYE el envío por defecto (send-annex /
//                    whatsapp) por la lógica del llamante (p.ej. /api/lotes/:id/enviar-so).
//   onBeforeSend     async () => boolean → validación previa (p.ej. confirmar si falta
//                    la solicitud). Si devuelve false, el envío se cancela.
export function EnviarLoteDocModal({ onClose, title, subtitle, defaultEmail = '', defaultPhone = '', defaultMessage = '', summaryData, docs, extraBody = null, onSendOverride = null, onBeforeSend = null }) {
    const docList = Array.isArray(docs) ? docs : [];

    // ── Estado ───────────────────────────────────────────────────────────────
    const [email, setEmail]       = useState(defaultEmail || '');
    const [phone, setPhone]       = useState(defaultPhone || '');
    const [message, setMessage]   = useState(defaultMessage || '');
    const [channels, setChannels] = useState({ email: true, whatsapp: false });
    const [waReady, setWaReady]   = useState(null);
    const [status, setStatus]     = useState(null);
    const [sendPhase, setSendPhase]     = useState(null);   // null | 'sending' | 'done'
    const [sendResults, setSendResults] = useState([]);
    const [busy, setBusy]               = useState(false);
    const userEditedRef = useRef(false);

    // Estado WhatsApp al abrir
    useEffect(() => {
        axios.get('/api/whatsapp/status').then(r => setWaReady(!!r.data?.ready)).catch(() => setWaReady(false));
    }, []);

    // ── Derivados de disponibilidad de canal ─────────────────────────────────
    const emailValid     = !!(email || '').trim();
    const phoneOk        = phoneValid(phone);
    const canEmail       = emailValid;
    const canWhatsapp    = phoneOk && waReady !== false;
    const willEmail      = channels.email && canEmail;
    const willWhatsapp   = channels.whatsapp && canWhatsapp;

    const toggleChannel = (ch) => {
        if (ch === 'email' && !canEmail) return;
        if (ch === 'whatsapp' && !canWhatsapp) return;
        setChannels(prev => ({ ...prev, [ch]: !prev[ch] }));
    };

    // ── Orquestador de envío ─────────────────────────────────────────────────
    const handleSend = async () => {
        const doEmail = willEmail;
        const doWa = willWhatsapp;
        if (!docList.length) { setStatus({ ok: false, text: 'No hay documentos que enviar.' }); return; }
        if (!doEmail && !doWa) { setStatus({ ok: false, text: 'Selecciona al menos un canal disponible.' }); return; }
        if (doEmail && !emailValid) { setStatus({ ok: false, text: 'Introduce un email de destinatario.' }); return; }
        if (doWa && !phoneOk) { setStatus({ ok: false, text: 'Introduce un teléfono válido.' }); return; }

        // Validación previa del llamante (p.ej. confirmar si falta la solicitud de verificación).
        if (onBeforeSend) {
            const ok = await onBeforeSend();
            if (!ok) return;
        }

        setStatus(null);
        setSendResults([]);
        setSendPhase('sending');
        setBusy(true);

        const out = [];

        if (onSendOverride) {
            // ── Envío delegado en el llamante (p.ej. /api/lotes/:id/enviar-so) ───
            try {
                const res = await onSendOverride({ email: email.trim(), phone: phone.trim(), channels: { email: doEmail, whatsapp: doWa }, message });
                if (Array.isArray(res)) out.push(...res);
            } catch (err) {
                out.push({ channel: doEmail ? 'email' : 'whatsapp', status: 'fail', text: err.response?.data?.error || err.response?.data?.message || err.message });
            }
        } else {
            // ── EMAIL — una sola llamada con todos los adjuntos ──────────────────
            if (doEmail) {
                try {
                    await axios.post('/api/pdf/send-annex', {
                        to: email.trim(),
                        customMessage: message,
                        summaryData,
                        docs: docList.map(d => ({ html: d.html, fileName: d.fileName })),
                    });
                    out.push({ channel: 'email', status: 'ok', text: `→ ${email.trim()}` });
                } catch (err) {
                    out.push({ channel: 'email', status: 'fail', text: err.response?.data?.message || err.response?.data?.error || err.message });
                }
            }

            // ── WHATSAPP — generar cada PDF y mandarlos uno a uno ────────────────
            if (doWa) {
                try {
                    for (let i = 0; i < docList.length; i++) {
                        const d = docList[i];
                        const gen = await axios.post('/api/pdf/generate', { html: d.html });
                        if (!gen.data?.pdf) throw new Error('No se pudo generar el PDF');
                        await axios.post('/api/whatsapp/send-media', {
                            phone: phone.trim(),
                            caption: i === 0 ? message : (d.label || d.fileName),
                            media: { base64: gen.data.pdf, filename: d.fileName, mimetype: 'application/pdf' },
                            asDocument: true,
                        });
                    }
                    out.push({ channel: 'whatsapp', status: 'ok', text: `→ ${phone.trim()}` });
                } catch (err) {
                    out.push({ channel: 'whatsapp', status: 'fail', text: err.response?.data?.message || err.response?.data?.error || err.message });
                }
            }
        }

        const anyOk = out.some(r => r.status === 'ok');
        setSendResults(out);
        setStatus({ ok: anyOk, text: out.map(r => `${r.status === 'ok' ? '✓' : '✕'} ${r.text}`).join('   ') });
        setSendPhase('done');
        setBusy(false);
        if (anyOk) fireSuccessConfetti();
    };

    // Lluvia de "papeles" al completar (igual que anexos / RITE / CIFO)
    const fireSuccessConfetti = () => {
        if (typeof window === 'undefined') return;
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
        const scalar = 3.6;
        let shapes;
        try { shapes = ['📄', '📃', '📑', '📋'].map(text => confetti.shapeFromText({ text, scalar })); } catch { shapes = undefined; }
        const burst = (x, delay = 0) => setTimeout(() => {
            confetti({ particleCount: 22, spread: 65, startVelocity: 34, gravity: 0.8, decay: 0.92, ticks: 220, scalar, origin: { x, y: 0.5 }, zIndex: 10000, disableForReducedMotion: true, ...(shapes ? { shapes, flat: true } : { colors: ['#f2a640', '#34d399', '#fcd34d', '#ffffff'] }) });
        }, delay);
        burst(0.2, 0); burst(0.8, 140); burst(0.5, 300);
    };

    const sending = busy && sendPhase === 'sending';

    const modal = (
        <div className="fixed inset-0 z-[330] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={onClose}>
            <div className="bg-[#0F1013] border border-white/[0.07] rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
                {/* Cabecera */}
                <div className="px-6 py-5 border-b border-white/[0.07] bg-brand/5 flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-black uppercase tracking-tight text-white">{title || 'Enviar documento'}</h2>
                        {subtitle && <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest mt-0.5">{subtitle}</p>}
                    </div>
                    <button onClick={onClose} className="text-white/30 hover:text-white transition-colors">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                {/* Cuerpo */}
                <div className="px-6 py-5 space-y-5 max-h-[74vh] overflow-y-auto custom-scrollbar">
                    {/* Destinatario (email) */}
                    <div>
                        <label className="block text-[9px] font-black text-white/30 uppercase tracking-[0.2em] mb-2">Destinatario (email)</label>
                        <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="correo@dominio.com"
                            className="w-full lowercase bg-bkg-elevated border border-white/5 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-brand/40 transition-all" />
                    </div>

                    {/* Teléfono (WhatsApp) */}
                    <div>
                        <label className="block text-[9px] font-black text-white/30 uppercase tracking-[0.2em] mb-2">Teléfono (WhatsApp)</label>
                        <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="600 000 000"
                            className="w-full bg-bkg-elevated border border-white/5 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-brand/40 transition-all" />
                        <p className="mt-1 text-[9px] text-white/25">Solo relevante si marcas el canal WhatsApp.</p>
                    </div>

                    {/* Canal de envío */}
                    <div>
                        <label className="block text-[9px] font-black text-white/30 uppercase tracking-[0.2em] mb-2">Enviar por</label>
                        <div className="grid grid-cols-2 gap-2">
                            <button type="button" disabled={!canEmail} onClick={() => toggleChannel('email')}
                                className={`flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all ${!canEmail ? 'opacity-40 cursor-not-allowed border-white/10 bg-white/[0.02]' : (channels.email ? 'border-brand/50 bg-brand/10' : 'border-white/10 bg-white/[0.02] hover:border-white/20')}`}>
                                <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${willEmail ? 'border-brand bg-brand' : 'border-white/20'}`}>
                                    {willEmail && <svg className="w-3 h-3 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                                </span>
                                <div className="min-w-0">
                                    <div className="text-[11px] font-black uppercase tracking-wider text-white">Email</div>
                                    <div className="text-[10px] text-white/40 truncate">{canEmail ? 'con email' : 'sin email'}</div>
                                </div>
                            </button>
                            <button type="button" disabled={!canWhatsapp} onClick={() => toggleChannel('whatsapp')}
                                className={`flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all ${!canWhatsapp ? 'opacity-40 cursor-not-allowed border-white/10 bg-white/[0.02]' : (channels.whatsapp ? 'border-emerald-400/50 bg-emerald-400/10' : 'border-white/10 bg-white/[0.02] hover:border-white/20')}`}>
                                <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${willWhatsapp ? 'border-emerald-400 bg-emerald-400' : 'border-white/20'}`}>
                                    {willWhatsapp && <svg className="w-3 h-3 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                                </span>
                                <div className="min-w-0">
                                    <div className="text-[11px] font-black uppercase tracking-wider text-white">WhatsApp</div>
                                    <div className="text-[10px] text-white/40 truncate">{!phoneOk ? 'sin teléfono' : (waReady === false ? 'no conectado' : 'con teléfono')}</div>
                                </div>
                            </button>
                        </div>
                    </div>

                    {/* Mensaje (editable) */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="block text-[9px] font-black text-white/30 uppercase tracking-[0.2em]">Mensaje (email / WhatsApp)</label>
                            {userEditedRef.current && (
                                <button type="button" onClick={() => { userEditedRef.current = false; setMessage(defaultMessage || ''); }}
                                    className="text-[9px] font-black uppercase tracking-widest text-white/30 hover:text-brand transition-colors">↻ Restablecer</button>
                            )}
                        </div>
                        <textarea
                            value={message}
                            onChange={e => { userEditedRef.current = true; setMessage(e.target.value); }}
                            rows={10}
                            className="w-full normal-case bg-bkg-elevated border border-white/5 rounded-xl px-4 py-3 text-white text-[12px] leading-relaxed focus:outline-none focus:border-brand/40 transition-all resize-y"
                        />
                    </div>

                    {/* Contenido extra del llamante (p.ej. slot de la Solicitud de Verificación) */}
                    {extraBody}

                    {/* Adjuntos */}
                    <p className="text-[10px] text-white/40">
                        📎 Adjuntos: <span className="text-white/70 font-bold">{docList.length}</span> documento{docList.length === 1 ? '' : 's'}.
                    </p>

                    {status && !sendPhase && (
                        <p className={`text-[11px] ${status.ok ? 'text-emerald-400' : 'text-red-400'}`}>{status.ok ? '✅' : '❌'} {status.text}</p>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-white/[0.02] border-t border-white/[0.07] flex items-center justify-between gap-3">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-white/25">{docList.length} doc{docList.length === 1 ? '' : 's'} · {[willEmail && 'Email', willWhatsapp && 'WhatsApp'].filter(Boolean).join(' + ') || 'sin canal'}</span>
                    <div className="flex items-center gap-3">
                        <button onClick={onClose} className="px-4 py-2.5 rounded-xl border border-white/10 text-white/50 text-[10px] font-black uppercase tracking-widest hover:text-white hover:border-white/30 transition-all">Cerrar</button>
                        <button onClick={handleSend} disabled={busy || !docList.length || (!willEmail && !willWhatsapp)}
                            title={(!willEmail && !willWhatsapp) ? 'Selecciona al menos un canal disponible' : (!docList.length ? 'No hay documentos' : 'Enviar')}
                            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-brand text-black text-[11px] font-black uppercase tracking-widest hover:brightness-110 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                            {sending
                                ? <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" /></svg>
                                : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>}
                            {sending ? 'Enviando…' : 'Enviar'}
                        </button>
                    </div>
                </div>

                {/* ── OVERLAY DE ENVÍO (wow): enviando → enviado, estado por canal ── */}
                {sendPhase && (() => {
                    const anyOk = sendResults.some(r => r.status === 'ok');
                    const hasFail = sendResults.some(r => r.status === 'fail');
                    const hasUnavail = sendResults.some(r => r.status === 'unavailable');
                    const allGood = anyOk && !hasFail && !hasUnavail;
                    const done = sendPhase === 'done';
                    const tone = !done ? 'brand' : (allGood ? 'emerald' : (anyOk ? 'amber' : 'red'));
                    const glow = { brand: 'bg-brand/20', emerald: 'bg-emerald-500/25', amber: 'bg-amber-500/20', red: 'bg-red-500/20' }[tone];
                    const chMeta = {
                        email:    { name: 'Email',    path: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
                        whatsapp: { name: 'WhatsApp', path: 'M12 2a10 10 0 00-8.94 14.46L2 22l5.7-1.5A10 10 0 1012 2z' },
                    };
                    const statusMeta = {
                        ok:          { color: 'emerald', label: 'Enviado',       icon: 'M5 13l4 4L19 7' },
                        fail:        { color: 'red',     label: 'Error',         icon: 'M6 18L18 6M6 6l12 12' },
                        unavailable: { color: 'amber',   label: 'No disponible', icon: 'M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z' },
                    };
                    return (
                        <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fade-in">
                            <div className="relative w-full max-w-md bg-[#0F1013] border border-white/10 rounded-3xl shadow-2xl overflow-hidden animate-scale-in">
                                <div className={`absolute -top-28 left-1/2 -translate-x-1/2 w-80 h-80 rounded-full blur-3xl pointer-events-none ${glow}`} />
                                <div className="relative px-8 py-9 flex flex-col items-center text-center">
                                    {!done ? (
                                        <>
                                            <div className="relative w-24 h-24 mb-6 flex items-center justify-center">
                                                <span className="absolute inset-0 rounded-full bg-brand/20 animate-ping" />
                                                <span className="absolute inset-4 rounded-full bg-brand/20 animate-ping" style={{ animationDelay: '0.5s' }} />
                                                <div className="relative w-16 h-16 rounded-full bg-brand/15 border border-brand/40 flex items-center justify-center">
                                                    <svg className="w-8 h-8 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} style={{ animation: 'float 1.8s ease-in-out infinite' }}><path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                                                </div>
                                            </div>
                                            <h3 className="text-xl font-black uppercase tracking-tight text-white">Enviando…</h3>
                                            {subtitle && <p className="text-white/40 text-[10px] font-bold uppercase tracking-[0.2em] mt-1">{subtitle}</p>}
                                            <div className="mt-6 w-full space-y-2">
                                                {willEmail && (
                                                    <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/10">
                                                        <svg className="w-4 h-4 animate-spin text-brand shrink-0" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" /></svg>
                                                        <span className="text-[11px] font-bold text-white/70 uppercase tracking-wider">Enviando email…</span>
                                                    </div>
                                                )}
                                                {willWhatsapp && (
                                                    <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/10">
                                                        <svg className="w-4 h-4 animate-spin text-emerald-400 shrink-0" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" /></svg>
                                                        <span className="text-[11px] font-bold text-white/70 uppercase tracking-wider">Enviando WhatsApp…</span>
                                                    </div>
                                                )}
                                            </div>
                                            <p className="mt-6 text-[10px] text-white/25 uppercase tracking-widest font-bold">No cierres esta ventana</p>
                                        </>
                                    ) : (
                                        <>
                                            <div className="relative w-24 h-24 mb-6 flex items-center justify-center">
                                                <span className={`absolute inset-0 rounded-full animate-ping ${tone === 'emerald' ? 'bg-emerald-500/20' : tone === 'amber' ? 'bg-amber-500/20' : 'bg-red-500/20'}`} />
                                                <div className={`relative w-20 h-20 rounded-full flex items-center justify-center border-2 ${tone === 'emerald' ? 'bg-emerald-500/15 border-emerald-400/50 text-emerald-400' : tone === 'amber' ? 'bg-amber-500/15 border-amber-400/50 text-amber-400' : 'bg-red-500/15 border-red-400/50 text-red-400'}`}>
                                                    <svg className="w-10 h-10 animate-scale-in" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d={anyOk ? 'M5 13l4 4L19 7' : 'M6 18L18 6M6 6l12 12'} /></svg>
                                                </div>
                                            </div>
                                            <h3 className="text-xl font-black uppercase tracking-tight text-white">{allGood ? '¡Enviado!' : anyOk ? 'Enviado parcialmente' : 'No se pudo enviar'}</h3>
                                            {subtitle && <p className="text-white/40 text-[10px] font-bold uppercase tracking-[0.2em] mt-1">{subtitle}</p>}
                                            <div className="mt-6 w-full space-y-2">
                                                {sendResults.map((r, i) => {
                                                    const cm = chMeta[r.channel]; const sm = statusMeta[r.status];
                                                    return (
                                                        <div key={i} className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${sm.color === 'emerald' ? 'bg-emerald-500/[0.06] border-emerald-400/25' : sm.color === 'amber' ? 'bg-amber-500/[0.06] border-amber-400/25' : 'bg-red-500/[0.06] border-red-400/25'}`}>
                                                            <svg className="w-5 h-5 text-white/50 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}><path strokeLinecap="round" strokeLinejoin="round" d={cm.path} /></svg>
                                                            <div className="min-w-0 flex-1 text-left">
                                                                <div className="text-[11px] font-black uppercase tracking-wider text-white">{cm.name}</div>
                                                                <div className="text-[10px] text-white/45 truncate">{r.text}</div>
                                                            </div>
                                                            <span className={`flex items-center gap-1 text-[9px] font-black uppercase tracking-wider shrink-0 ${sm.color === 'emerald' ? 'text-emerald-400' : sm.color === 'amber' ? 'text-amber-400' : 'text-red-400'}`}>
                                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d={sm.icon} /></svg>
                                                                {sm.label}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                            <div className="mt-7 w-full flex flex-col gap-2">
                                                <button onClick={onClose} className="w-full py-3 rounded-xl bg-brand text-black text-[11px] font-black uppercase tracking-widest hover:brightness-110 active:scale-95 transition-all">Cerrar</button>
                                                <button onClick={() => setSendPhase(null)} className="w-full py-2.5 rounded-xl border border-white/10 text-white/40 text-[10px] font-black uppercase tracking-widest hover:text-white hover:border-white/30 transition-all">Seguir aquí</button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })()}
            </div>
        </div>
    );

    return createPortal(modal, document.body);
}

export default EnviarLoteDocModal;
