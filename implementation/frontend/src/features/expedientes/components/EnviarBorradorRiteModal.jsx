import React, { useEffect, useState } from 'react';
import axios from 'axios';
import confetti from 'canvas-confetti';

// Documentación RITE: Memoria (.docx + .pdf) + Borrador del Certificado (.pdf).
// Acciones: Descargar · Subir a Drive · Enviar al instalador (Email / WhatsApp /
// ambos) eligiendo el destinatario entre los contactos del instalador.
// Homogéneo con el popup de envío del Certificado CIFO.
export function EnviarBorradorRiteModal({ isOpen, onClose, expediente, defaultMessage, onSent, onUploaded }) {
    const pres = expediente?.prescriptores || {};
    const numexpte = expediente?.numero_expediente || '';

    // Lluvia de "papeles/documentos" al completar el envío: usamos emojis de
    // documento como formas de confeti (shapeFromText). Caída suave tipo papel.
    // Respeta prefers-reduced-motion (mismo patrón que el CIFO / LandingResultView).
    const fireSuccessConfetti = () => {
        if (typeof window === 'undefined') return;
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
        const scalar = 3.6;
        let shapes;
        try {
            shapes = ['📄', '📃', '📑', '📋'].map(text => confetti.shapeFromText({ text, scalar }));
        } catch { shapes = undefined; }
        const burst = (x, delay = 0) => setTimeout(() => {
            confetti({
                particleCount: 22,
                spread: 65,
                startVelocity: 34,
                gravity: 0.8,
                decay: 0.92,
                ticks: 220,
                scalar,
                origin: { x, y: 0.5 },
                zIndex: 10000,
                disableForReducedMotion: true,
                ...(shapes ? { shapes, flat: true } : { colors: ['#f2a640', '#34d399', '#fcd34d', '#ffffff'] }),
            });
        }, delay);
        burst(0.2, 0); burst(0.8, 140); burst(0.5, 300);
    };

    // Contactos disponibles del perfil del instalador (puede haber varios):
    // representante/empresa + cada persona de contacto de notificaciones.
    const instContacts = [];
    {
        const repName = [pres.nombre_responsable, pres.apellidos_responsable].filter(Boolean).join(' ') || pres.razon_social || 'Instalador';
        const repPhone = pres.tlf || pres.telefono || '';
        if (repPhone || pres.email) {
            instContacts.push({ id: 'rep', label: repName, sublabel: pres.es_autonomo ? 'Autónomo' : 'Representante legal', phone: repPhone, email: pres.email || '' });
        }
        const arr = Array.isArray(pres.contactos_notificacion) ? pres.contactos_notificacion : [];
        if (arr.length) {
            arr.forEach((c, i) => {
                if (c && (c.tlf || c.email)) instContacts.push({ id: `c${i}`, label: c.nombre || 'Contacto', sublabel: 'Persona de contacto', phone: c.tlf || '', email: c.email || '' });
            });
        } else if (pres.nombre_contacto && (pres.tlf_contacto || pres.email_contacto)) {
            instContacts.push({ id: 'contacto', label: pres.nombre_contacto, sublabel: 'Persona de contacto', phone: pres.tlf_contacto || '', email: pres.email_contacto || '' });
        }
    }
    const altIds = instContacts.filter(c => c.id !== 'rep').map(c => c.id);

    const [message, setMessage] = useState(defaultMessage || '');
    const [waReady, setWaReady] = useState(null);
    const [busy, setBusy] = useState(null);       // 'download' | 'drive' | 'send'
    const [status, setStatus] = useState(null);    // { ok, text }
    const [selectedIds, setSelectedIds] = useState([]);   // varios destinatarios
    const [manualContact, setManualContact] = useState({ name: '', phone: '', email: '' });
    const [channels, setChannels] = useState({ email: true, whatsapp: true });
    const [sendPhase, setSendPhase] = useState(null);       // null | 'sending' | 'done' → overlay de envío
    const [sendResults, setSendResults] = useState([]);     // [{ channel, status: 'ok'|'fail'|'unavailable', text }]

    useEffect(() => {
        if (!isOpen) return;
        setMessage(defaultMessage || '');
        setStatus(null);
        setBusy(null);
        setSendPhase(null);
        setSendResults([]);
        // Por defecto: si la redirección está activa, preseleccionar TODOS los contactos
        // de notificación; si no, el representante (o el primero disponible).
        const defIds = (pres.contacto_notificaciones_activas && altIds.length) ? altIds : (instContacts[0] ? [instContacts[0].id] : []);
        const sel = instContacts.filter(c => defIds.includes(c.id));
        setSelectedIds(defIds);
        setManualContact({ name: '', phone: '', email: '' });
        setChannels({ email: sel.some(c => c.email), whatsapp: sel.some(c => (c.phone || '').replace(/[^0-9]/g, '').length >= 9) });
        setWaReady(null);
        axios.get('/api/whatsapp/status').then(r => setWaReady(!!r.data?.ready)).catch(() => setWaReady(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, defaultMessage]);

    if (!isOpen) return null;

    const phoneValid = (ph) => (ph || '').replace(/[^0-9]/g, '').length >= 9;
    const resolveContact = (id) => {
        if (id === 'otro') return { id: 'otro', label: (manualContact.name || '').trim() || 'Otro contacto', phone: (manualContact.phone || '').trim(), email: (manualContact.email || '').trim() };
        return instContacts.find(c => c.id === id) || { id, label: 'Contacto', phone: '', email: '' };
    };
    const selectedContacts = selectedIds.map(resolveContact);
    const toggleSelected = (id) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

    const canEmail = selectedContacts.some(c => c.email);
    const contactPhoneValid = selectedContacts.some(c => phoneValid(c.phone));
    const willEmail = channels.email && canEmail;
    const willWhatsapp = channels.whatsapp && contactPhoneValid && waReady !== false;
    const nEmail = selectedContacts.filter(c => c.email).length;
    const nPhone = selectedContacts.filter(c => phoneValid(c.phone)).length;
    const sending = busy === 'send';

    const toggleChannel = (ch) => setChannels(prev => ({ ...prev, [ch]: !prev[ch] }));

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

    // Cierra el overlay + el modal RITE → vuelve al expediente.
    const exitToExpediente = () => {
        setSendPhase(null);
        if (onClose) onClose();
    };

    // Orquestador único: envía por los canales seleccionados (email, whatsapp o ambos)
    // al contacto elegido. El backend genera los ficheros frescos y los adjunta.
    const handleSend = async () => {
        const doEmail = willEmail;
        const doWa = willWhatsapp;
        if (!selectedContacts.length) { setStatus({ ok: false, text: 'Selecciona al menos un destinatario.' }); return; }
        if (!doEmail && !doWa) { setStatus({ ok: false, text: 'Selecciona al menos un canal disponible.' }); return; }
        setStatus(null);
        setSendResults([]);
        setSendPhase('sending');
        setBusy('send');

        const recipients = selectedContacts.map(c => ({
            nombre: c.label,
            email: doEmail ? (c.email || '') : '',
            phone: doWa ? (c.phone || '') : '',
        }));
        const chans = [doEmail && 'email', doWa && 'whatsapp'].filter(Boolean);

        let data = null, reqError = null;
        try {
            const resp = await axios.post(`/api/expedientes/${expediente.id}/memoria-rite/send`, {
                channels: chans, message, recipients,
            });
            data = resp.data;
        } catch (err) {
            reqError = err.response?.data?.error || err.message;
        } finally {
            setBusy(null);
        }

        // Aplanar a filas (destinatario × canal). El backend devuelve `results`
        // en el mismo orden que `recipients`.
        const results = [];
        const byIdx = data?.results || [];
        selectedContacts.forEach((c, idx) => {
            const r = byIdx[idx] || {};
            if (doEmail && c.email) {
                if (reqError) results.push({ channel: 'email', status: 'fail', text: `${c.label}: ${reqError}` });
                else results.push({ channel: 'email', status: r.email?.ok ? 'ok' : 'fail', text: r.email?.ok ? `${c.label} → ${r.email.to}` : `${c.label}: ${r.email?.error || 'no enviado'}` });
            }
            if (doWa && phoneValid(c.phone)) {
                if (reqError) results.push({ channel: 'whatsapp', status: 'fail', text: `${c.label}: ${reqError}` });
                else results.push({ channel: 'whatsapp', status: r.whatsapp?.ok ? 'ok' : 'fail', text: r.whatsapp?.ok ? `${c.label} → ${r.whatsapp.phone}` : `${c.label}: ${r.whatsapp?.error || 'no enviado'}` });
            }
        });

        // Si la documentación RITE llegó al instalador por al menos un canal,
        // registramos la fecha de envío (documentacion.borrador_cert_sent_at).
        const anyOk = results.some(r => r.status === 'ok');
        if (anyOk && onSent) onSent();
        setSendResults(results);
        setStatus({ ok: anyOk, text: results.map(r => `${r.status === 'ok' ? '✓' : '✕'} ${r.text}`).join('   ') });
        setSendPhase('done');
        if (anyOk) fireSuccessConfetti();
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
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={onClose}>
            <div className="bg-[#0F1013] border border-white/[0.07] rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
                <div className="px-6 py-5 border-b border-white/[0.07] bg-brand/5 flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-black uppercase tracking-tight text-white">Documentación RITE</h2>
                        <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest mt-0.5">Memoria (Word + PDF) + Borrador certificado</p>
                    </div>
                    <button onClick={onClose} className="text-white/30 hover:text-white transition-colors">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                <div className="px-6 py-5 space-y-5 max-h-[74vh] overflow-y-auto custom-scrollbar">
                    {/* Acciones sobre los documentos */}
                    <div>
                        <label className="block text-[9px] font-black text-white/30 uppercase tracking-[0.2em] mb-2">Documentos</label>
                        <div className="grid grid-cols-2 gap-2">
                            <Action id="download" onClick={handleDownload} label="Descargar" sub="3 archivos"
                                icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" /></svg>} />
                            <Action id="drive" onClick={handleDrive} label="Subir a Drive" sub="7. LEGALIZACIÓN"
                                icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.9A5 5 0 1115.9 6 4.5 4.5 0 0117 15M12 12v6m0-6l-2 2m2-2l2 2" /></svg>} />
                        </div>
                    </div>

                    {/* Destinatario(s) — se puede marcar más de uno */}
                    <div>
                        <label className="block text-[9px] font-black text-white/30 uppercase tracking-[0.2em] mb-2">Destinatarios <span className="text-white/20 normal-case tracking-normal font-bold">· puedes marcar varios</span></label>
                        <div className="space-y-2">
                            {instContacts.map(c => {
                                const on = selectedIds.includes(c.id);
                                return (
                                    <button key={c.id} type="button" onClick={() => toggleSelected(c.id)}
                                        className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${on ? 'border-brand/50 bg-brand/5' : 'border-white/10 bg-white/[0.02] hover:border-white/20'}`}>
                                        <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${on ? 'border-brand bg-brand' : 'border-white/20'}`}>
                                            {on && <svg className="w-3 h-3 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-bold text-white truncate">{c.label}</span>
                                                <span className="text-[9px] uppercase tracking-wider text-white/30 font-bold shrink-0">{c.sublabel}</span>
                                            </div>
                                            <div className="text-[11px] text-white/40 truncate">
                                                {c.phone || 'sin teléfono'}{c.email ? ` · ${c.email}` : ''}
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                            {/* Otro contacto manual */}
                            <button type="button" onClick={() => toggleSelected('otro')}
                                className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${selectedIds.includes('otro') ? 'border-brand/50 bg-brand/5' : 'border-white/10 bg-white/[0.02] hover:border-white/20'}`}>
                                <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${selectedIds.includes('otro') ? 'border-brand bg-brand' : 'border-white/20'}`}>
                                    {selectedIds.includes('otro') && <svg className="w-3 h-3 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                                </span>
                                <span className="text-sm font-bold text-white">Otro contacto…</span>
                            </button>
                            {selectedIds.includes('otro') && (
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pl-7">
                                    <input value={manualContact.name} onChange={e => setManualContact(m => ({ ...m, name: e.target.value }))} placeholder="Nombre" className="w-full min-w-0 bg-bkg-elevated border border-white/5 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-brand/40 transition-all" />
                                    <input value={manualContact.phone} onChange={e => setManualContact(m => ({ ...m, phone: e.target.value }))} placeholder="Teléfono" className="w-full min-w-0 bg-bkg-elevated border border-white/5 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-brand/40 transition-all" />
                                    <input type="email" value={manualContact.email} onChange={e => setManualContact(m => ({ ...m, email: e.target.value }))} placeholder="Email" className="w-full min-w-0 no-uppercase bg-bkg-elevated border border-white/5 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-brand/40 transition-all" />
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Mensaje (email / whatsapp) */}
                    <div>
                        <label className="block text-[9px] font-black text-white/30 uppercase tracking-[0.2em] mb-2">Mensaje (email / WhatsApp)</label>
                        <textarea
                            value={message}
                            onChange={e => setMessage(e.target.value)}
                            rows={10}
                            className="w-full no-uppercase bg-bkg-elevated border border-white/5 rounded-xl px-4 py-3 text-white text-[12px] leading-relaxed focus:outline-none focus:border-brand/40 transition-all resize-y"
                        />
                    </div>

                    {/* Canal de envío (email / whatsapp / ambos) */}
                    <div>
                        <label className="block text-[9px] font-black text-white/30 uppercase tracking-[0.2em] mb-2">Enviar por</label>
                        <div className="grid grid-cols-2 gap-2">
                            {/* Email */}
                            <button type="button" disabled={!canEmail} onClick={() => toggleChannel('email')}
                                className={`flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all ${!canEmail ? 'opacity-40 cursor-not-allowed border-white/10 bg-white/[0.02]' : (channels.email ? 'border-brand/50 bg-brand/10' : 'border-white/10 bg-white/[0.02] hover:border-white/20')}`}>
                                <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${willEmail ? 'border-brand bg-brand' : 'border-white/20'}`}>
                                    {willEmail && <svg className="w-3 h-3 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                                </span>
                                <div className="min-w-0">
                                    <div className="text-[11px] font-black uppercase tracking-wider text-white">Email</div>
                                    <div className="text-[10px] text-white/40 truncate">{canEmail ? `${nEmail} con email` : 'sin email'}</div>
                                </div>
                            </button>
                            {/* WhatsApp */}
                            <button type="button" disabled={!contactPhoneValid || waReady === false} onClick={() => toggleChannel('whatsapp')}
                                className={`flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all ${(!contactPhoneValid || waReady === false) ? 'opacity-40 cursor-not-allowed border-white/10 bg-white/[0.02]' : (channels.whatsapp ? 'border-emerald-400/50 bg-emerald-400/10' : 'border-white/10 bg-white/[0.02] hover:border-white/20')}`}>
                                <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${willWhatsapp ? 'border-emerald-400 bg-emerald-400' : 'border-white/20'}`}>
                                    {willWhatsapp && <svg className="w-3 h-3 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                                </span>
                                <div className="min-w-0">
                                    <div className="text-[11px] font-black uppercase tracking-wider text-white">WhatsApp</div>
                                    <div className="text-[10px] text-white/40 truncate">{!contactPhoneValid ? 'sin teléfono' : (waReady === false ? 'no conectado' : `${nPhone} con teléfono`)}</div>
                                </div>
                            </button>
                        </div>
                    </div>

                    {status && (
                        <p className={`text-[11px] ${status.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                            {status.ok ? '✅' : '❌'} {status.text}
                        </p>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-white/[0.02] border-t border-white/[0.07] flex items-center justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2.5 rounded-xl border border-white/10 text-white/50 text-[10px] font-black uppercase tracking-widest hover:text-white hover:border-white/30 transition-all">
                        Cerrar
                    </button>
                    <button onClick={handleSend} disabled={sending || busy === 'download' || busy === 'drive' || (!willEmail && !willWhatsapp)}
                        title={(!willEmail && !willWhatsapp) ? 'Selecciona al menos un canal disponible' : 'Enviar'}
                        className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-brand text-black text-[11px] font-black uppercase tracking-widest hover:brightness-110 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                        {sending
                            ? <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" /></svg>
                            : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>}
                        {sending ? 'Enviando…' : 'Enviar'}
                    </button>
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
                                            <h3 className="text-xl font-black uppercase tracking-tight text-white">Enviando Memoria RITE…</h3>
                                            <p className="text-white/40 text-[10px] font-bold uppercase tracking-[0.2em] mt-1">{numexpte}</p>
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
                                            <h3 className="text-xl font-black uppercase tracking-tight text-white">{allGood ? '¡Memoria RITE enviada!' : anyOk ? 'Enviado parcialmente' : 'No se pudo enviar'}</h3>
                                            <p className="text-white/40 text-[10px] font-bold uppercase tracking-[0.2em] mt-1">{numexpte}</p>
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
                                                <button onClick={exitToExpediente} className="w-full py-3 rounded-xl bg-brand text-black text-[11px] font-black uppercase tracking-widest hover:brightness-110 active:scale-95 transition-all">
                                                    Volver al expediente
                                                </button>
                                                <button onClick={() => setSendPhase(null)} className="w-full py-2.5 rounded-xl border border-white/10 text-white/40 text-[10px] font-black uppercase tracking-widest hover:text-white hover:border-white/30 transition-all">
                                                    Seguir aquí
                                                </button>
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
}
