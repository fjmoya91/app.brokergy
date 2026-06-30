import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { fireSuccessConfetti } from '../../expedientes/utils/successConfetti';

// ─────────────────────────────────────────────────────────────────────────────
// Envío unificado de la PROPUESTA al cliente — homogéneo con EnviarAnexosModal /
// Notificar-Validar certificador:
//   1. Elegir destinatario(s): Cliente / Distribuidor / Instalador / Otro.
//   2. Previsualizar/editar el mensaje (se usa como cuerpo del email y caption de WhatsApp).
//   3. Elegir canal: Email, WhatsApp o ambos.
//   4. Overlay de envío con estado por canal + confeti de papeles al terminar.
// Reutiliza los endpoints existentes: /api/pdf/generate, /api/pdf/send-proposal,
// /api/whatsapp/send-media. El PDF es el mismo para todos (se genera una vez).
// ─────────────────────────────────────────────────────────────────────────────

const phoneValid = (ph) => (ph || '').replace(/[^0-9]/g, '').length >= 9;
const MODE_ORDER = ['CLIENTE', 'PARTNER', 'INSTALADOR', 'OTRO'];

// ── Nota adicional: se inserta en el cuerpo tras el "resumen de ayudas".
//    Cada línea se envuelve en *...* por separado: WhatsApp (y el email, que
//    convierte *texto* → <b>) NO aplican negrita a través de saltos de línea,
//    así que un único par de asteriscos alrededor de un bloque multipárrafo
//    saldría literal. Idempotente: stripNote quita la nota previa (bloque de
//    líneas en negrita que arranca en "*Nota adicional:") antes de recomponer.
const isBoldLine = (l) => /^\*.*\*$/.test(l.trim());
const stripNote = (msg) => {
    const lines = (msg || '').split('\n');
    const start = lines.findIndex(l => /^\*Nota adicional:/.test(l.trim()));
    if (start < 0) return (msg || '').replace(/\s+$/, '');
    let end = start;
    for (let i = start + 1; i < lines.length; i++) {
        const l = lines[i].trim();
        if (l === '' || isBoldLine(l)) end = i; else break;
    }
    lines.splice(start, end - start + 1);
    return lines.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '');
};
const composeNote = (base, note) => {
    const clean = stripNote(base);
    const t = (note || '').trim();
    if (!t) return clean;
    // Negrita línea a línea (cada párrafo no vacío). El "label" va pegado a la
    // primera línea con contenido; las líneas en blanco se conservan.
    let labeled = false;
    const block = t.split('\n').map(line => {
        const l = line.trim().replace(/^\*+|\*+$/g, '').trim();
        if (!l) return '';
        if (!labeled) { labeled = true; return `*Nota adicional: ${l}*`; }
        return `*${l}*`;
    }).join('\n');
    const lines = clean.split('\n');
    const resumenIdx = lines.findIndex(l => /Resumen total de las ayudas/i.test(l));
    if (resumenIdx >= 0) { lines.splice(resumenIdx + 1, 0, '', block); return lines.join('\n'); }
    const anchorIdx = lines.findIndex(l => /^(Quedo a|En caso de conformidad|Para avanzar|Siguientes pasos)/i.test(l.trim()));
    if (anchorIdx >= 0) { lines.splice(anchorIdx, 0, block, ''); return lines.join('\n'); }
    return `${clean}\n\n${block}`;
};

export function EnviarPropuestaModal({
    isOpen, onClose,
    numexpte,
    candidates = [],            // [{ mode, label, sublabel, email, phone }]
    buildDefaultMessage,        // (mode, name) => string
    getPdfHtml,                 // () => html (para el PDF de WhatsApp)
    getEmailHtml,               // () => html (para el PDF del email)
    buildSummaryData,           // (mode, name) => summaryData (plantilla email)
    expedienteId,               // id_oportunidad (para marcar ENVIADA)
    onSent,                     // (results) => void  (opcional)
}) {
    const [selectedModes, setSelectedModes] = useState([]);
    const [manualContact, setManualContact] = useState({ name: '', phone: '', email: '' });
    const [channels, setChannels] = useState({ email: true, whatsapp: true });
    const [message, setMessage] = useState('');
    const [extraNote, setExtraNote] = useState('');
    const [noteInMessage, setNoteInMessage] = useState(true);
    const [waReady, setWaReady] = useState(null);
    const [status, setStatus] = useState(null);
    const [sendPhase, setSendPhase] = useState(null);   // null | 'sending' | 'done'
    const [sendResults, setSendResults] = useState([]);
    const [busy, setBusy] = useState(false);
    const userEditedRef = useRef(false);

    const hasOtro = true; // siempre permitimos un contacto manual

    const resolveContact = (mode) => {
        if (mode === 'OTRO') {
            return { mode: 'OTRO', label: (manualContact.name || '').trim() || 'Otro contacto', sublabel: 'Manual', email: (manualContact.email || '').trim(), phone: (manualContact.phone || '').trim() };
        }
        return candidates.find(c => c.mode === mode) || { mode, label: mode, email: '', phone: '' };
    };

    // Destinatario principal (para el mensaje por defecto): el de mayor prioridad seleccionado.
    const primaryMode = MODE_ORDER.find(m => selectedModes.includes(m)) || (candidates[0]?.mode || 'CLIENTE');

    const applyDefaultMessage = (modes) => {
        if (userEditedRef.current) return;
        const pm = MODE_ORDER.find(m => modes.includes(m)) || (candidates[0]?.mode || 'CLIENTE');
        const c = resolveContact(pm);
        let base = buildDefaultMessage ? buildDefaultMessage(pm, c.label) : '';
        if (noteInMessage && extraNote.trim()) base = composeNote(base, extraNote);
        setMessage(base);
    };

    // Nota adicional: refleja en la previsualización (mensaje del destinatario
    // principal) y mantiene el bloque sincronizado al teclear / togglear.
    const handleNoteChange = (val) => {
        setExtraNote(val);
        if (noteInMessage) setMessage(prev => composeNote(prev, val));
    };
    const toggleNoteInMessage = () => {
        setNoteInMessage(prev => {
            const next = !prev;
            setMessage(m => next ? composeNote(m, extraNote) : stripNote(m));
            return next;
        });
    };

    // Inicialización al abrir
    useEffect(() => {
        if (!isOpen) return;
        const start = candidates.some(c => c.mode === 'CLIENTE') ? ['CLIENTE'] : (candidates[0] ? [candidates[0].mode] : []);
        userEditedRef.current = false;
        setSelectedModes(start);
        setManualContact({ name: '', phone: '', email: '' });
        setExtraNote('');
        setNoteInMessage(true);
        const sel = start.map(resolveContact);
        setChannels({ email: sel.some(c => c.email), whatsapp: sel.some(c => phoneValid(c.phone)) });
        const pm = MODE_ORDER.find(m => start.includes(m)) || (candidates[0]?.mode || 'CLIENTE');
        const pc = candidates.find(c => c.mode === pm);
        setMessage(buildDefaultMessage ? buildDefaultMessage(pm, pc?.label || '') : '');
        setStatus(null);
        setSendPhase(null);
        setSendResults([]);
        setBusy(false);
        setWaReady(null);
        axios.get('/api/whatsapp/status').then(r => setWaReady(!!r.data?.ready)).catch(() => setWaReady(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    if (!isOpen) return null;

    const selectedContacts = selectedModes.map(resolveContact);
    const contactPhoneValid = selectedContacts.some(c => phoneValid(c.phone));
    const canEmail = selectedContacts.some(c => c.email);
    const willEmail = channels.email && canEmail;
    const willWhatsapp = channels.whatsapp && contactPhoneValid && waReady !== false;
    const nEmail = selectedContacts.filter(c => c.email).length;
    const nPhone = selectedContacts.filter(c => phoneValid(c.phone)).length;

    const toggleMode = (mode) => {
        setSelectedModes(prev => {
            const next = prev.includes(mode) ? prev.filter(x => x !== mode) : [...prev, mode];
            applyDefaultMessage(next);
            // Reajusta canales disponibles según la nueva selección.
            const sel = next.map(resolveContact);
            setChannels(ch => ({ email: ch.email && sel.some(c => c.email) ? true : (sel.some(c => c.email) ? ch.email : false), whatsapp: sel.some(c => phoneValid(c.phone)) ? ch.whatsapp : false }));
            return next;
        });
    };
    const toggleChannel = (ch) => setChannels(prev => ({ ...prev, [ch]: !prev[ch] }));

    const exitAndClose = () => { setSendPhase(null); if (onClose) onClose(); };

    // ── Orquestador de envío ─────────────────────────────────────────────────
    const handleSend = async () => {
        const doEmail = willEmail;
        const doWa = willWhatsapp;
        if (!selectedContacts.length) { setStatus({ ok: false, text: 'Selecciona al menos un destinatario.' }); return; }
        if (!doEmail && !doWa) { setStatus({ ok: false, text: 'Selecciona al menos un canal disponible.' }); return; }

        setStatus(null);
        setSendResults([]);
        setSendPhase('sending');
        setBusy(true);

        // WhatsApp: generar el PDF UNA sola vez (se reutiliza para todos los destinatarios).
        let waPdf = null, waGenError = null;
        const baseFileName = (expedienteId || numexpte || 'Propuesta').toString().replace(/[^a-zA-Z0-9_\-]/g, '_');
        const filename = `Propuesta_Brokergy_${baseFileName}.pdf`;
        if (doWa) {
            try {
                const gen = await axios.post('/api/pdf/generate', { html: getPdfHtml() }, { timeout: 90000 });
                if (!gen.data?.pdf) throw new Error(gen.data?.message || 'No se pudo generar el PDF');
                waPdf = gen.data.pdf;
            } catch (err) { waPdf = null; waGenError = err.response?.data?.message || err.response?.data?.error || err.message; }
        }

        const emailHtml = doEmail ? getEmailHtml() : null;
        const out = [];
        let clienteOk = false;

        // Mensaje POR destinatario: el principal usa el texto editado en la caja;
        // el resto regenera el suyo (cliente recibe el de cliente, partner el de
        // partner, etc.). La nota adicional se inserta en todos si está marcada.
        const messageFor = (c) => {
            const base = (c.mode === primaryMode)
                ? stripNote(message)
                : (buildDefaultMessage ? buildDefaultMessage(c.mode, c.label) : stripNote(message));
            return noteInMessage ? composeNote(base, extraNote) : base;
        };

        for (const c of selectedContacts) {
            const msg = messageFor(c);
            // EMAIL
            if (doEmail && c.email) {
                try {
                    await axios.post('/api/pdf/send-proposal', {
                        html: emailHtml,
                        to: c.email,
                        userName: c.label,
                        summaryData: buildSummaryData ? buildSummaryData(c.mode, c.label) : { id: numexpte },
                        customMessage: msg,
                    }, { timeout: 90000 });
                    out.push({ channel: 'email', status: 'ok', text: `${c.label} → ${c.email}` });
                    if (c.mode === 'CLIENTE') clienteOk = true;
                } catch (err) {
                    out.push({ channel: 'email', status: 'fail', text: `${c.label}: ${err.response?.data?.message || err.response?.data?.error || err.message}` });
                }
            }
            // WHATSAPP
            if (doWa && phoneValid(c.phone)) {
                if (!waPdf) {
                    out.push({ channel: 'whatsapp', status: 'fail', text: `${c.label}: ${waGenError || 'No se pudo generar el PDF'}` });
                } else {
                    try {
                        await axios.post('/api/whatsapp/send-media', {
                            phone: String(c.phone).replace(/[^0-9]/g, ''),
                            caption: msg,
                            media: { base64: waPdf, filename, mimetype: 'application/pdf' },
                            asDocument: true,
                        });
                        out.push({ channel: 'whatsapp', status: 'ok', text: `${c.label} → ${c.phone}` });
                        if (c.mode === 'CLIENTE') clienteOk = true;
                    } catch (err) {
                        out.push({ channel: 'whatsapp', status: 'fail', text: `${c.label}: ${err.response?.data?.error || err.message}` });
                    }
                }
            }
        }

        const anyOk = out.some(r => r.status === 'ok');

        // Marcar la oportunidad como ENVIADA si la propuesta llegó al cliente.
        if (clienteOk && expedienteId) {
            try { await axios.patch(`/api/oportunidades/${expedienteId}/estado`, { nuevo_estado: 'ENVIADA' }); } catch (e) { /* no romper */ }
        }

        // Guardar la nota adicional en el historial del expediente (siempre que
        // exista, vaya o no en el mensaje). Se registra como comentario.
        if (extraNote.trim() && expedienteId) {
            try { await axios.post(`/api/oportunidades/${expedienteId}/comentarios`, { comentario: `📝 Nota de la propuesta: ${extraNote.trim()}` }); } catch (e) { /* no romper */ }
        }

        setSendResults(out);
        setStatus({ ok: anyOk, text: out.map(r => `${r.status === 'ok' ? '✓' : '✕'} ${r.text}`).join('   ') });
        setSendPhase('done');
        setBusy(false);
        if (anyOk) { fireSuccessConfetti(); if (onSent) onSent(out); }
    };

    const sending = busy && sendPhase === 'sending';

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={onClose}>
            <div className="bg-[#0F1013] border border-white/[0.07] rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
                <div className="px-6 py-5 border-b border-white/[0.07] bg-brand/5 flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-black uppercase tracking-tight text-white">Enviar propuesta</h2>
                        <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest mt-0.5">{numexpte || 'Propuesta'}</p>
                    </div>
                    <button onClick={onClose} className="text-white/30 hover:text-white transition-colors">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                <div className="px-6 py-5 space-y-5 max-h-[74vh] overflow-y-auto custom-scrollbar">
                    {/* Destinatarios */}
                    <div>
                        <label className="block text-[9px] font-black text-white/30 uppercase tracking-[0.2em] mb-2">Destinatarios</label>
                        <p className="text-[9px] text-white/25 px-1 mb-2">Puedes marcar varios.</p>
                        <div className="space-y-2">
                            {candidates.map(c => {
                                const on = selectedModes.includes(c.mode);
                                return (
                                    <button key={c.mode} type="button" onClick={() => toggleMode(c.mode)}
                                        className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${on ? 'border-brand/50 bg-brand/5' : 'border-white/10 bg-white/[0.02] hover:border-white/20'}`}>
                                        <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${on ? 'border-brand bg-brand' : 'border-white/20'}`}>
                                            {on && <svg className="w-3 h-3 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-bold text-white truncate">{c.label}</span>
                                                <span className="text-[9px] uppercase tracking-wider text-white/30 font-bold shrink-0">{c.sublabel}</span>
                                            </div>
                                            <div className="text-[11px] text-white/40 truncate">{c.phone || 'sin teléfono'}{c.email ? ` · ${c.email}` : ''}</div>
                                        </div>
                                    </button>
                                );
                            })}
                            {hasOtro && (
                                <button type="button" onClick={() => toggleMode('OTRO')}
                                    className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${selectedModes.includes('OTRO') ? 'border-brand/50 bg-brand/5' : 'border-white/10 bg-white/[0.02] hover:border-white/20'}`}>
                                    <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${selectedModes.includes('OTRO') ? 'border-brand bg-brand' : 'border-white/20'}`}>
                                        {selectedModes.includes('OTRO') && <svg className="w-3 h-3 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                                    </span>
                                    <span className="text-sm font-bold text-white">Otro contacto…</span>
                                </button>
                            )}
                            {selectedModes.includes('OTRO') && (
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pl-7">
                                    <input value={manualContact.name} onChange={e => setManualContact(m => ({ ...m, name: e.target.value }))} placeholder="Nombre" className="w-full min-w-0 bg-bkg-elevated border border-white/5 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-brand/40 transition-all" />
                                    <input value={manualContact.phone} onChange={e => setManualContact(m => ({ ...m, phone: e.target.value }))} placeholder="Teléfono" className="w-full min-w-0 bg-bkg-elevated border border-white/5 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-brand/40 transition-all" />
                                    <input type="email" value={manualContact.email} onChange={e => setManualContact(m => ({ ...m, email: e.target.value }))} placeholder="Email" className="w-full min-w-0 no-uppercase bg-bkg-elevated border border-white/5 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-brand/40 transition-all" />
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Mensaje (previsualización editable) */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="block text-[9px] font-black text-white/30 uppercase tracking-[0.2em]">Mensaje (email / WhatsApp)</label>
                            {userEditedRef.current && (
                                <button type="button" onClick={() => { userEditedRef.current = false; applyDefaultMessage(selectedModes); }}
                                    className="text-[9px] font-black uppercase tracking-widest text-white/30 hover:text-brand transition-colors">↻ Restablecer</button>
                            )}
                        </div>
                        <textarea
                            value={message}
                            onChange={e => { userEditedRef.current = true; setMessage(e.target.value); }}
                            rows={10}
                            className="w-full no-uppercase bg-bkg-elevated border border-white/5 rounded-xl px-4 py-3 text-white text-[12px] leading-relaxed focus:outline-none focus:border-brand/40 transition-all resize-y"
                        />
                        <p className="mt-1.5 text-[9px] text-white/25">Se usa como cuerpo del email y como mensaje de WhatsApp. Edítalo libremente.</p>
                    </div>

                    {/* Nota adicional */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="block text-[9px] font-black text-white/30 uppercase tracking-[0.2em]">Nota adicional</label>
                            <button type="button" onClick={toggleNoteInMessage}
                                className={`flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest transition-colors ${noteInMessage ? 'text-brand' : 'text-white/30 hover:text-white/60'}`}>
                                <span className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center shrink-0 ${noteInMessage ? 'border-brand bg-brand' : 'border-white/20'}`}>
                                    {noteInMessage && <svg className="w-2.5 h-2.5 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                                </span>
                                Añadir al mensaje
                            </button>
                        </div>
                        <textarea
                            value={extraNote}
                            onChange={e => handleNoteChange(e.target.value)}
                            rows={3}
                            placeholder="Ej: En la parte que indica comercio, debemos justificar con fotos y vídeos que realmente es una vivienda."
                            className="w-full no-uppercase bg-bkg-elevated border border-white/5 rounded-xl px-4 py-3 text-white text-[12px] leading-relaxed focus:outline-none focus:border-brand/40 transition-all resize-y"
                        />
                        <p className="mt-1.5 text-[9px] text-white/25">
                            {noteInMessage
                                ? 'Se inserta en el mensaje tras el resumen de ayudas y se guarda en las notas del expediente.'
                                : 'Solo se guarda en las notas del expediente (no se envía en el mensaje).'}
                        </p>
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
                                    <div className="text-[10px] text-white/40 truncate">{canEmail ? `${nEmail} con email` : 'sin email'}</div>
                                </div>
                            </button>
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

                    {status && !sendPhase && (
                        <p className={`text-[11px] ${status.ok ? 'text-emerald-400' : 'text-red-400'}`}>{status.ok ? '✅' : '❌'} {status.text}</p>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-white/[0.02] border-t border-white/[0.07] flex items-center justify-between gap-3">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-white/25">{selectedContacts.length} dest. · {[willEmail && 'Email', willWhatsapp && 'WhatsApp'].filter(Boolean).join(' + ') || 'sin canal'}</span>
                    <div className="flex items-center gap-3">
                        <button onClick={onClose} className="px-4 py-2.5 rounded-xl border border-white/10 text-white/50 text-[10px] font-black uppercase tracking-widest hover:text-white hover:border-white/30 transition-all">Cerrar</button>
                        <button onClick={handleSend} disabled={busy || !selectedContacts.length || (!willEmail && !willWhatsapp)}
                            title={(!willEmail && !willWhatsapp) ? 'Selecciona al menos un canal disponible' : 'Enviar'}
                            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-brand text-black text-[11px] font-black uppercase tracking-widest hover:brightness-110 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                            {sending
                                ? <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" /></svg>
                                : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>}
                            {sending ? 'Enviando…' : 'Enviar'}
                        </button>
                    </div>
                </div>

                {/* ── OVERLAY DE ENVÍO: enviando → enviado, estado por canal ── */}
                {sendPhase && (() => {
                    const anyOk = sendResults.some(r => r.status === 'ok');
                    const hasFail = sendResults.some(r => r.status === 'fail');
                    const allGood = anyOk && !hasFail;
                    const done = sendPhase === 'done';
                    const tone = !done ? 'brand' : (allGood ? 'emerald' : (anyOk ? 'amber' : 'red'));
                    const glow = { brand: 'bg-brand/20', emerald: 'bg-emerald-500/25', amber: 'bg-amber-500/20', red: 'bg-red-500/20' }[tone];
                    const chMeta = {
                        email: { name: 'Email', path: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
                        whatsapp: { name: 'WhatsApp', path: 'M12 2a10 10 0 00-8.94 14.46L2 22l5.7-1.5A10 10 0 1012 2z' },
                    };
                    const statusMeta = {
                        ok: { color: 'emerald', label: 'Enviado', icon: 'M5 13l4 4L19 7' },
                        fail: { color: 'red', label: 'Error', icon: 'M6 18L18 6M6 6l12 12' },
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
                                            <h3 className="text-xl font-black uppercase tracking-tight text-white">Enviando propuesta…</h3>
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
                                            <h3 className="text-xl font-black uppercase tracking-tight text-white">{allGood ? '¡Propuesta enviada!' : anyOk ? 'Enviado parcialmente' : 'No se pudo enviar'}</h3>
                                            <p className="text-white/40 text-[10px] font-bold uppercase tracking-[0.2em] mt-1">{numexpte}</p>
                                            <div className="mt-6 w-full space-y-2">
                                                {sendResults.map((r, i) => {
                                                    const cm = chMeta[r.channel]; const sm = statusMeta[r.status] || statusMeta.fail;
                                                    return (
                                                        <div key={i} className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${sm.color === 'emerald' ? 'bg-emerald-500/[0.06] border-emerald-400/25' : 'bg-red-500/[0.06] border-red-400/25'}`}>
                                                            <svg className="w-5 h-5 text-white/50 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}><path strokeLinecap="round" strokeLinejoin="round" d={cm.path} /></svg>
                                                            <div className="min-w-0 flex-1 text-left">
                                                                <div className="text-[11px] font-black uppercase tracking-wider text-white">{cm.name}</div>
                                                                <div className="text-[10px] text-white/45 truncate">{r.text}</div>
                                                            </div>
                                                            <span className={`flex items-center gap-1 text-[9px] font-black uppercase tracking-wider shrink-0 ${sm.color === 'emerald' ? 'text-emerald-400' : 'text-red-400'}`}>
                                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d={sm.icon} /></svg>
                                                                {sm.label}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                            <div className="mt-7 w-full flex flex-col gap-2">
                                                <button onClick={exitAndClose} className="w-full py-3 rounded-xl bg-brand text-black text-[11px] font-black uppercase tracking-widest hover:brightness-110 active:scale-95 transition-all">Cerrar</button>
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
}

export default EnviarPropuestaModal;
