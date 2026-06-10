import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import confetti from 'canvas-confetti';
import { buildAnexoIHtml, buildAnexoCesionHtml, getDualMessage } from '../utils/docGenerators';

// ─────────────────────────────────────────────────────────────────────────────
// Envío unificado de los anexos del cliente (Anexo I + Anexo de Cesión de Ahorros).
// Homogéneo con el popup de envío de la Memoria RITE / CIFO:
//   1. Elegir qué documentos se envían (uno o ambos).
//   2. Elegir destinatario: CLIENTE FINAL o INSTALADOR (con sus contactos).
//   3. Previsualizar/editar el mensaje, que se adapta al destinatario y a los docs.
//   4. Elegir canal: Email, WhatsApp o ambos.
// Reutiliza los endpoints existentes (/api/pdf/send-annex, /api/pdf/generate,
// /api/whatsapp/send-media). Los PDFs se generan a partir de los datos del
// expediente; si el Anexo I se abre desde su preview, se respeta el HTML editado
// en vivo vía `overrides.anexo1`.
// ─────────────────────────────────────────────────────────────────────────────

const DOC_DEFS = {
    anexo1: { key: 'anexo1', label: 'Anexo I', sublabel: 'Declaración Responsable', file: '_Anexo_I.pdf' },
    cesion: { key: 'cesion', label: 'Anexo de Cesión', sublabel: 'Convenio de Cesión CAE', file: '_Anexo_Cesion.pdf' },
};

export function EnviarAnexosModal({ isOpen, onClose, onExit, expediente, results, initialDocs, overrides, onMarkSent, onEditCliente }) {
    const op       = expediente?.oportunidades || {};
    const cli      = expediente?.clientes || {};
    const inst     = expediente?.instalacion || {};
    const pres     = expediente?.prescriptores || {};
    const numexpte = expediente?.numero_expediente || '';

    const opInputs   = op?.datos_calculo?.inputs || {};
    const rateMwh    = parseFloat(inst.economico_override?.cae_client_rate ?? opInputs.cae_client_rate) || 0;
    const aeRaw      = results?.savingsKwh || 0;
    let beneficioRaw = results?.caeBonus;
    if (beneficioRaw == null && aeRaw && rateMwh) beneficioRaw = (aeRaw / 1000) * rateMwh;
    const beneficioStr = beneficioRaw ? Math.round(beneficioRaw).toLocaleString('es-ES', { useGrouping: true }) : '___________';

    const clienteNombre = [cli.nombre_razon_social, cli.apellidos].filter(Boolean).join(' ').trim();
    const firstName     = (cli.nombre_razon_social || '').split(/\s+/)[0] || '';

    // Enlace público donde el destinatario sube los anexos FIRMADOS + foto del DNI
    // por ambas caras. Si la Cesión va firmada a mano, el DNI se anexa a la Cesión.
    // El mismo enlace permite al cliente completar sus datos si faltan.
    const firmaUrl = expediente?.id ? `${window.location.origin}/firmar-anexos/${expediente.id}` : '';

    // Datos del cliente que faltan (mismos que pide la propuesta): email, DNI/CIF e
    // IBAN. Un dato falta solo si NO está en ninguno de sus posibles campos (p.ej.
    // el email puede estar en el titular o en la persona de contacto).
    const faltaEmail = !(cli.email || cli.persona_contacto_email);
    const faltaDni = !(cli.dni || cli.dni_nie);
    const faltaIban = !cli.numero_cuenta || String(cli.numero_cuenta).includes('_');
    // El justificante va junto al IBAN (no se trata como dato suelto que falta).
    const datosFaltan = [faltaEmail && 'email', faltaDni && 'DNI/CIF', faltaIban && 'IBAN'].filter(Boolean);

    // ── Contactos por grupo ──────────────────────────────────────────────────
    const cliContacts = [];
    {
        const cliPhone = cli.tlf || cli.telefono || '';
        if (cliPhone || cli.email) {
            cliContacts.push({ id: 'cli', label: clienteNombre || 'Cliente', sublabel: 'Titular', phone: cliPhone, email: cli.email || '' });
        }
        if (cli.persona_contacto_nombre && (cli.persona_contacto_tlf || cli.persona_contacto_email)) {
            cliContacts.push({ id: 'cli_contacto', label: cli.persona_contacto_nombre, sublabel: 'Persona de contacto', phone: cli.persona_contacto_tlf || '', email: cli.persona_contacto_email || '' });
        }
    }
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
    const phoneValid = (ph) => (ph || '').replace(/[^0-9]/g, '').length >= 9;

    // ── Estado ───────────────────────────────────────────────────────────────
    const [docs, setDocs]               = useState(['anexo1', 'cesion']);
    const [target, setTarget]           = useState('cliente'); // 'cliente' | 'instalador'
    const [selectedIds, setSelectedIds] = useState([]);          // varios destinatarios del grupo activo
    const [manualContact, setManualContact] = useState({ name: '', phone: '', email: '' });
    const [channels, setChannels]       = useState({ email: true, whatsapp: true });
    const [message, setMessage]         = useState('');
    const [waReady, setWaReady]         = useState(null);
    const [status, setStatus]           = useState(null);
    const [sendPhase, setSendPhase]     = useState(null);   // null | 'sending' | 'done'
    const [sendResults, setSendResults] = useState([]);
    const [busy, setBusy]               = useState(false);
    const [pedir, setPedir]             = useState(null); // { ok, text } resultado de "pedir datos"
    const [pedirBusy, setPedirBusy]     = useState(false);
    const userEditedRef = useRef(false);

    // ── Mensaje por defecto (se adapta a destinatario + documentos) ──────────
    const buildDefaultMessage = (tgt, docKeys) => {
        const both = docKeys.includes('anexo1') && docKeys.includes('cesion');
        // Footer con el enlace de subida (mismo para uno o ambos documentos).
        const footerCliente = firmaUrl
            ? `\n\n———\n📎 *Cuando lo tengas firmado, súbelo aquí en 1 clic* (junto con una foto de tu DNI por delante y por detrás):\n${firmaUrl}`
            : '';
        const footerInstalador = firmaUrl
            ? `\n\n———\n📎 *Enlace para subir los documentos firmados + foto del DNI (ambas caras):*\n${firmaUrl}`
            : '';

        if (tgt === 'cliente') {
            if (both) return getDualMessage(firstName, beneficioStr, numexpte) + footerCliente;
            if (docKeys[0] === 'anexo1') {
                return `Buenas tardes, ${firstName}:\n\n`
                    + `Te adjunto el *Anexo I (Declaración Responsable)* de tu expediente *${numexpte}*, necesario para tramitar la ayuda.\n\n`
                    + `*Firma del documento:*\n`
                    + `1. *Firma electrónica* (recomendado si dispones de certificado digital).\n`
                    + `2. *Firma manuscrita*, acompañada del nombre completo, apellidos y DNI escritos a mano, más fotografías del DNI por ambas caras.\n\n`
                    + `Quedamos a la espera del documento firmado.\n\nUn saludo,\n*Brokergy · Ingeniería energética.*`
                    + footerCliente;
            }
            return `Buenas tardes, ${firstName}:\n\n`
                + `Te adjunto el *Anexo de Cesión de Ahorros* de tu expediente *${numexpte}*, imprescindible para gestionar y tramitar la ayuda${beneficioStr && beneficioStr !== '___________' ? ` (importe estimado *${beneficioStr} €*)` : ''}.\n\n`
                + `*Firma del documento:*\n`
                + `1. *Firma electrónica* (recomendado si dispones de certificado digital).\n`
                + `2. *Firma manuscrita*, acompañada del nombre completo, apellidos y DNI escritos a mano, más fotografías del DNI por ambas caras.\n\n`
                + `Quedamos a la espera del documento firmado.\n\nUn saludo,\n*Brokergy · Ingeniería energética.*`
                + footerCliente;
        }
        // Instalador
        const docsLabel = both
            ? 'el *Anexo I (Declaración Responsable)* y el *Anexo de Cesión de Ahorros*'
            : (docKeys[0] === 'anexo1' ? 'el *Anexo I (Declaración Responsable)*' : 'el *Anexo de Cesión de Ahorros*');
        return `¡Hola! 👋\n\n`
            + `Desde *Brokergy* os hacemos llegar ${docsLabel} del expediente *${numexpte}*${clienteNombre ? ` (cliente: *${clienteNombre}*)` : ''}.\n\n`
            + `Por favor, hacedlos llegar al titular para su firma o gestionad la recogida de firma según corresponda.\n\n`
            + `Ambos pueden firmarse de forma *electrónica* (con certificado digital) o *manuscrita* (con nombre, apellidos y DNI a mano + foto del DNI por ambas caras).\n\n`
            + `Quedamos a vuestra disposición para cualquier duda.\n\nUn saludo,\n*Brokergy · Ingeniería energética.*`
            + footerInstalador;
    };

    const pickDefaultIds = (tgt) => {
        if (tgt === 'instalador') {
            const alt = instContacts.filter(c => c.id !== 'rep').map(c => c.id);
            if (pres.contacto_notificaciones_activas && alt.length) return alt;   // todos los contactos de notificación
            return instContacts[0] ? [instContacts[0].id] : [];
        }
        return cliContacts[0] ? [cliContacts[0].id] : [];
    };

    // Inicialización al abrir
    useEffect(() => {
        if (!isOpen) return;
        const startDocs = (Array.isArray(initialDocs) && initialDocs.length) ? initialDocs.filter(k => DOC_DEFS[k]) : ['anexo1', 'cesion'];
        const startTarget = 'cliente';
        const defIds = pickDefaultIds(startTarget);
        const sel = cliContacts.filter(c => defIds.includes(c.id));
        userEditedRef.current = false;
        setDocs(startDocs);
        setTarget(startTarget);
        setSelectedIds(defIds);
        setManualContact({ name: '', phone: '', email: '' });
        setChannels({ email: sel.some(c => c.email), whatsapp: sel.some(c => phoneValid(c.phone)) });
        setMessage(buildDefaultMessage(startTarget, startDocs));
        setStatus(null);
        setSendPhase(null);
        setSendResults([]);
        setBusy(false);
        setPedir(null);
        setPedirBusy(false);
        setWaReady(null);
        axios.get('/api/whatsapp/status').then(r => setWaReady(!!r.data?.ready)).catch(() => setWaReady(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    if (!isOpen) return null;

    const groupContacts = target === 'cliente' ? cliContacts : instContacts;

    const resolveContact = (id) => {
        if (id === 'otro') return { id: 'otro', label: (manualContact.name || '').trim() || 'Otro contacto', phone: (manualContact.phone || '').trim(), email: (manualContact.email || '').trim() };
        return groupContacts.find(c => c.id === id) || { id, label: 'Contacto', phone: '', email: '' };
    };
    const selectedContacts = selectedIds.map(resolveContact);
    const contactPhoneValid = selectedContacts.some(c => phoneValid(c.phone));
    const canEmail = selectedContacts.some(c => c.email);
    const willEmail = channels.email && canEmail;
    const willWhatsapp = channels.whatsapp && contactPhoneValid && waReady !== false;
    const nEmail = selectedContacts.filter(c => c.email).length;
    const nPhone = selectedContacts.filter(c => phoneValid(c.phone)).length;

    // ── Validación blanda (datos incompletos) ────────────────────────────────
    const rc = opInputs.rc || cli.referencia_catastral || inst.ref_catastral;
    const missingAnexoI = (!rc || String(rc).includes('___')) ? ['Referencia Catastral'] : [];
    const hasIban = !!(cli.numero_cuenta && !String(cli.numero_cuenta).includes('_'));
    const hasUtms = !!(inst.coord_x && inst.coord_y && !String(inst.coord_x).includes('_'));
    const missingCesion = [...(!hasIban ? ['IBAN (Nº de cuenta)'] : []), ...(!hasUtms ? ['Coordenadas UTM'] : [])];
    const selectedMissing = [
        ...(docs.includes('anexo1') ? missingAnexoI : []),
        ...(docs.includes('cesion') ? missingCesion : []),
    ];

    // ── Handlers de selección ────────────────────────────────────────────────
    const applyMessage = (tgt, docKeys) => {
        if (!userEditedRef.current) setMessage(buildDefaultMessage(tgt, docKeys));
    };
    const toggleDoc = (k) => {
        setDocs(prev => {
            const next = prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k];
            const ordered = ['anexo1', 'cesion'].filter(x => next.includes(x));
            if (ordered.length) applyMessage(target, ordered);
            return ordered;
        });
    };
    const switchTarget = (tgt) => {
        if (tgt === target) return;
        const defIds = pickDefaultIds(tgt);
        const list = tgt === 'cliente' ? cliContacts : instContacts;
        const sel = list.filter(c => defIds.includes(c.id));
        setTarget(tgt);
        setSelectedIds(defIds);
        setChannels({ email: sel.some(c => c.email), whatsapp: sel.some(c => phoneValid(c.phone)) });
        applyMessage(tgt, docs);
    };
    const toggleContact = (id) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    const toggleChannel = (ch) => setChannels(prev => ({ ...prev, [ch]: !prev[ch] }));

    const exitToExpediente = () => {
        setSendPhase(null);
        if (onExit) onExit(); else if (onClose) onClose();
    };

    // Pedir al cliente que complete sus datos: copia el enlace y, si WhatsApp está
    // conectado y hay teléfono, le manda el mensaje con el enlace.
    const handlePedirDatos = async () => {
        setPedirBusy(true); setPedir(null);
        const phone = cliContacts[0]?.phone || cli.tlf || cli.telefono || '';
        const phoneValid = (phone || '').replace(/[^0-9]/g, '').length >= 9;
        const faltanTxt = datosFaltan.length ? ` (${datosFaltan.join(', ')})` : '';
        const msg = `¡Hola ${firstName}! 👋\n\nPara poder tramitar tu ayuda del expediente *${numexpte}* necesitamos que completes unos datos${faltanTxt} y, si procede, subas el justificante de titularidad bancaria. Es muy rápido, desde aquí:\n${firmaUrl}\n\nGracias 🙌\n*Brokergy*`;
        let copied = false;
        try { await navigator.clipboard.writeText(firmaUrl); copied = true; } catch (e) { copied = false; }
        if (phoneValid && waReady) {
            try {
                await axios.post('/api/whatsapp/send-text', { phone, message: msg });
                setPedir({ ok: true, text: `WhatsApp enviado a ${phone}${copied ? ' · enlace copiado' : ''}` });
            } catch (err) {
                setPedir({ ok: false, text: `${copied ? 'Enlace copiado. ' : ''}No se pudo enviar el WhatsApp: ${err.response?.data?.error || err.message}` });
            }
        } else {
            setPedir({ ok: copied, text: copied ? `Enlace copiado al portapapeles${phoneValid ? ' (WhatsApp no conectado)' : ' (cliente sin teléfono)'} — pégalo donde quieras.` : 'No se pudo copiar el enlace.' });
        }
        setPedirBusy(false);
    };

    // ── Construcción de los documentos seleccionados ─────────────────────────
    const buildDocDefs = () => docs.map(k => {
        if (k === 'anexo1') {
            const html = (overrides && overrides.anexo1) ? overrides.anexo1 : buildAnexoIHtml(expediente, results, {}, true);
            return { key: 'anexo1', label: 'Anexo I', fileName: `${numexpte}${DOC_DEFS.anexo1.file}`, html };
        }
        return { key: 'cesion', label: 'Anexo de Cesión', fileName: `${numexpte}${DOC_DEFS.cesion.file}`, html: buildAnexoCesionHtml(expediente, results) };
    });

    // ── Orquestador de envío ─────────────────────────────────────────────────
    const handleSend = async () => {
        const doEmail = willEmail;
        const doWa = willWhatsapp;
        if (!docs.length) { setStatus({ ok: false, text: 'Selecciona al menos un documento.' }); return; }
        if (!selectedContacts.length) { setStatus({ ok: false, text: 'Selecciona al menos un destinatario.' }); return; }
        if (!doEmail && !doWa) { setStatus({ ok: false, text: 'Selecciona al menos un canal disponible.' }); return; }

        setStatus(null);
        setSendResults([]);
        setSendPhase('sending');
        setBusy(true);

        const docDefs = buildDocDefs();
        const docTypeLabel = docDefs.map(d => d.label).join(' y ');

        // WhatsApp: generar el PDF de cada documento UNA sola vez (se reutiliza para
        // todos los destinatarios marcados).
        let waPdfs = null, waGenError = null;
        if (doWa) {
            try {
                waPdfs = [];
                for (const d of docDefs) {
                    const gen = await axios.post('/api/pdf/generate', { html: d.html });
                    if (!gen.data?.pdf) throw new Error('No se pudo generar el PDF');
                    waPdfs.push({ ...d, base64: gen.data.pdf });
                }
            } catch (err) { waPdfs = null; waGenError = err.response?.data?.message || err.response?.data?.error || err.message; }
        }

        const out = [];
        for (const c of selectedContacts) {
            // EMAIL — una llamada con todos los adjuntos
            if (doEmail && c.email) {
                try {
                    await axios.post('/api/pdf/send-annex', {
                        to: c.email,
                        userName: target === 'cliente' ? (clienteNombre || c.label) : c.label,
                        customMessage: message,
                        summaryData: { id: numexpte, docType: docTypeLabel, userName: clienteNombre || c.label },
                        docs: docDefs.map(d => ({ html: d.html, fileName: d.fileName })),
                    });
                    out.push({ channel: 'email', status: 'ok', text: `${c.label} → ${c.email}` });
                } catch (err) {
                    out.push({ channel: 'email', status: 'fail', text: `${c.label}: ${err.response?.data?.message || err.response?.data?.error || err.message}` });
                }
            }
            // WHATSAPP — el primer documento lleva el mensaje completo
            if (doWa && phoneValid(c.phone)) {
                if (!waPdfs) {
                    out.push({ channel: 'whatsapp', status: 'fail', text: `${c.label}: ${waGenError || 'No se pudo generar el PDF'}` });
                } else {
                    try {
                        for (let i = 0; i < waPdfs.length; i++) {
                            const d = waPdfs[i];
                            await axios.post('/api/whatsapp/send-media', {
                                phone: c.phone,
                                caption: i === 0 ? message : d.label,
                                media: { base64: d.base64, filename: d.fileName, mimetype: 'application/pdf' },
                                asDocument: true,
                            });
                        }
                        out.push({ channel: 'whatsapp', status: 'ok', text: `${c.label} → ${c.phone}` });
                    } catch (err) {
                        out.push({ channel: 'whatsapp', status: 'fail', text: `${c.label}: ${err.response?.data?.message || err.response?.data?.error || err.message}` });
                    }
                }
            }
        }

        const anyOk = out.some(r => r.status === 'ok');

        // Al enviar, guardamos también el borrador en Drive ("6. ANEXOS CAE") para que
        // la página de firma pueda OFRECER la descarga y el expediente refleje "Generado".
        // Best-effort: si Drive falla, el envío sigue siendo válido (la fase de firma se
        // habilita igual por "enviado", y el cliente firma el PDF que recibió).
        const driveLinks = {};
        if (anyOk) {
            const folderId = expediente?.oportunidades?.datos_calculo?.drive_folder_id || expediente?.oportunidades?.datos_calculo?.inputs?.drive_folder_id;
            if (folderId) {
                for (const d of docDefs) {
                    try {
                        const fileName = d.key === 'anexo1' ? `${numexpte} - Anexo I` : `${numexpte} - Anexo Cesion ahorro`;
                        const r = await axios.post('/api/pdf/save-to-drive', { html: d.html, folderId, fileName, subfolderName: '6. ANEXOS CAE' });
                        if (r.data?.driveLink) driveLinks[d.key] = r.data.driveLink;
                    } catch (e) { /* no romper el envío si Drive falla */ }
                }
            }
        }
        if (anyOk && onMarkSent) onMarkSent([...docs], driveLinks);
        setSendResults(out);
        setStatus({ ok: anyOk, text: out.map(r => `${r.status === 'ok' ? '✓' : '✕'} ${r.text}`).join('   ') });
        setSendPhase('done');
        setBusy(false);
        if (anyOk) fireSuccessConfetti();
    };

    // Lluvia de "papeles" al completar (igual que RITE / CIFO)
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

    // ── UI helpers ───────────────────────────────────────────────────────────
    const DocChip = ({ k }) => {
        const def = DOC_DEFS[k];
        const on = docs.includes(k);
        return (
            <button type="button" onClick={() => toggleDoc(k)}
                className={`flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all ${on ? 'border-brand/50 bg-brand/10' : 'border-white/10 bg-white/[0.02] hover:border-white/20'}`}>
                <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${on ? 'border-brand bg-brand' : 'border-white/20'}`}>
                    {on && <svg className="w-3 h-3 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                </span>
                <div className="min-w-0">
                    <div className="text-[11px] font-black uppercase tracking-wider text-white truncate">{def.label}</div>
                    <div className="text-[9px] text-white/40 truncate">{def.sublabel}</div>
                </div>
            </button>
        );
    };

    const sending = busy && sendPhase === 'sending';

    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={onClose}>
            <div className="bg-[#0F1013] border border-white/[0.07] rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
                <div className="px-6 py-5 border-b border-white/[0.07] bg-brand/5 flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-black uppercase tracking-tight text-white">Enviar anexos</h2>
                        <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest mt-0.5">Anexo I + Cesión de Ahorros · {numexpte}</p>
                    </div>
                    <button onClick={onClose} className="text-white/30 hover:text-white transition-colors">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                <div className="px-6 py-5 space-y-5 max-h-[74vh] overflow-y-auto custom-scrollbar">
                    {/* Documentos a enviar */}
                    <div>
                        <label className="block text-[9px] font-black text-white/30 uppercase tracking-[0.2em] mb-2">Documentos a enviar</label>
                        <div className="grid grid-cols-2 gap-2">
                            <DocChip k="anexo1" />
                            <DocChip k="cesion" />
                        </div>
                        {selectedMissing.length > 0 && (
                            <p className="mt-2 text-[10px] text-amber-400/90 leading-snug">
                                ⚠️ Datos incompletos: {selectedMissing.join(', ')}. Puedes enviar igualmente.
                            </p>
                        )}
                    </div>

                    {/* Destinatario: Cliente vs Instalador */}
                    <div>
                        <label className="block text-[9px] font-black text-white/30 uppercase tracking-[0.2em] mb-2">Me dirijo a</label>
                        <div className="grid grid-cols-2 gap-2 mb-3">
                            <button type="button" onClick={() => switchTarget('cliente')}
                                className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${target === 'cliente' ? 'border-brand/50 bg-brand/10 text-brand' : 'border-white/10 bg-white/[0.02] text-white/50 hover:border-white/20'}`}>
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                Cliente final
                            </button>
                            <button type="button" onClick={() => switchTarget('instalador')}
                                className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${target === 'instalador' ? 'border-brand/50 bg-brand/10 text-brand' : 'border-white/10 bg-white/[0.02] text-white/50 hover:border-white/20'}`}>
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-3" /></svg>
                                Instalador
                            </button>
                        </div>

                        <div className="space-y-2">
                            <p className="text-[9px] text-white/25 px-1 -mt-1">Puedes marcar varios destinatarios.</p>
                            {groupContacts.length === 0 && (
                                <p className="text-[10px] text-white/30 italic px-1">Sin contactos guardados para {target === 'cliente' ? 'el cliente' : 'el instalador'}. Usa "Otro contacto…".</p>
                            )}
                            {groupContacts.map(c => {
                                const on = selectedIds.includes(c.id);
                                return (
                                <div key={c.id} className="flex items-center gap-2">
                                    <button type="button" onClick={() => toggleContact(c.id)}
                                        className={`flex-1 min-w-0 flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${on ? 'border-brand/50 bg-brand/5' : 'border-white/10 bg-white/[0.02] hover:border-white/20'}`}>
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
                                    {target === 'cliente' && onEditCliente && (
                                        <button type="button" onClick={() => onEditCliente()} title="Editar datos del cliente"
                                            className="shrink-0 w-10 h-10 flex items-center justify-center rounded-xl border border-white/10 text-white/40 hover:text-brand hover:border-brand/40 hover:bg-brand/5 transition-all active:scale-95">
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                        </button>
                                    )}
                                </div>
                                );
                            })}
                            <button type="button" onClick={() => toggleContact('otro')}
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

                    {/* Aviso: faltan datos del cliente (email/DNI/IBAN/justificante) */}
                    {datosFaltan.length > 0 && (
                        <div className="rounded-xl border border-amber-400/20 bg-amber-500/[0.05] p-3.5 space-y-2.5">
                            <p className="text-[11px] text-amber-300 font-bold leading-snug flex gap-2">
                                <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                                <span>Faltan datos del cliente: <span className="font-black">{datosFaltan.join(', ')}</span>. Estos datos van dentro de los anexos — conviene <span className="font-black">pedirlos primero</span>: el cliente los completa desde el enlace y te avisamos para que le envíes los anexos ya correctos.</span>
                            </p>
                            <div className="grid grid-cols-2 gap-2">
                                <button type="button" onClick={handlePedirDatos} disabled={pedirBusy}
                                    className="flex items-center justify-center gap-2 py-2.5 rounded-lg border border-amber-400/30 bg-amber-500/10 text-amber-300 text-[10px] font-black uppercase tracking-widest hover:bg-amber-500 hover:text-black transition-all disabled:opacity-40">
                                    {pedirBusy
                                        ? <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" /></svg>
                                        : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>}
                                    Pedir datos
                                </button>
                                {onEditCliente && (
                                    <button type="button" onClick={() => onEditCliente()}
                                        className="flex items-center justify-center gap-2 py-2.5 rounded-lg border border-white/15 bg-white/[0.03] text-white/70 text-[10px] font-black uppercase tracking-widest hover:text-white hover:border-white/30 transition-all">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                        Editar datos
                                    </button>
                                )}
                            </div>
                            {pedir && (
                                <p className={`text-[10px] ${pedir.ok ? 'text-emerald-400' : 'text-red-400'}`}>{pedir.ok ? '✅' : '⚠️'} {pedir.text}</p>
                            )}
                        </div>
                    )}

                    {/* Mensaje (previsualización editable) */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="block text-[9px] font-black text-white/30 uppercase tracking-[0.2em]">Mensaje (email / WhatsApp)</label>
                            {userEditedRef.current && (
                                <button type="button" onClick={() => { userEditedRef.current = false; setMessage(buildDefaultMessage(target, docs)); }}
                                    className="text-[9px] font-black uppercase tracking-widest text-white/30 hover:text-brand transition-colors">↻ Restablecer</button>
                            )}
                        </div>
                        <textarea
                            value={message}
                            onChange={e => { userEditedRef.current = true; setMessage(e.target.value); }}
                            rows={10}
                            className="w-full no-uppercase bg-bkg-elevated border border-white/5 rounded-xl px-4 py-3 text-white text-[12px] leading-relaxed focus:outline-none focus:border-brand/40 transition-all resize-y"
                        />
                        <p className="mt-1.5 text-[9px] text-white/25">
                            Dirigido a <span className="text-white/50 font-bold">{target === 'cliente' ? 'el cliente final' : 'el instalador'}</span>. El texto se adapta al destinatario y a los documentos; edítalo libremente.
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
                    <span className="text-[9px] font-bold uppercase tracking-widest text-white/25">{docs.length} doc{docs.length === 1 ? '' : 's'} · {[willEmail && 'Email', willWhatsapp && 'WhatsApp'].filter(Boolean).join(' + ') || 'sin canal'}</span>
                    <div className="flex items-center gap-3">
                        <button onClick={onClose} className="px-4 py-2.5 rounded-xl border border-white/10 text-white/50 text-[10px] font-black uppercase tracking-widest hover:text-white hover:border-white/30 transition-all">Cerrar</button>
                        <button onClick={handleSend} disabled={busy || !docs.length || (!willEmail && !willWhatsapp)}
                            title={(!willEmail && !willWhatsapp) ? 'Selecciona al menos un canal disponible' : (!docs.length ? 'Selecciona al menos un documento' : 'Enviar')}
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
                                            <h3 className="text-xl font-black uppercase tracking-tight text-white">Enviando anexos…</h3>
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
                                            <h3 className="text-xl font-black uppercase tracking-tight text-white">{allGood ? '¡Anexos enviados!' : anyOk ? 'Enviado parcialmente' : 'No se pudo enviar'}</h3>
                                            <p className="text-white/40 text-[10px] font-bold uppercase tracking-[0.2em] mt-1">{numexpte} · {target === 'cliente' ? 'Cliente' : 'Instalador'}</p>
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
                                                <button onClick={exitToExpediente} className="w-full py-3 rounded-xl bg-brand text-black text-[11px] font-black uppercase tracking-widest hover:brightness-110 active:scale-95 transition-all">Volver al expediente</button>
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

export default EnviarAnexosModal;
