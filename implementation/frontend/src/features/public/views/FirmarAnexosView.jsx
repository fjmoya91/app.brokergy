import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { DynamicNetworkBackground } from '../../../components/DynamicNetworkBackground';
import FirmarConCertificadoModal from '../../expedientes/components/FirmarConCertificadoModal';
import { SIGN_BOXES } from '../../expedientes/logic/signBoxes';

const isProd = import.meta.env.PROD;
const API_URL = isProd ? '/api/public' : 'http://localhost:3000/api/public';

const PDF_AND_IMG = 'application/pdf,image/*';

// Descarga un PDF (arraybuffer) y lo devuelve en base64 (sin prefijo data:).
async function fetchPdfBase64(url) {
    const { data } = await axios.get(url, { responseType: 'arraybuffer' });
    let binary = '';
    const bytes = new Uint8Array(data);
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
}
const b64ToBlob = (b64) => new Blob([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], { type: 'application/pdf' });

// Zona de arrastrar y soltar (acepta PDF o imagen) con feedback + estado "ya subido".
function DropZone({ title, desc, file, onPick, alreadyUploaded, accept = PDF_AND_IMG }) {
    const ref = useRef();
    const [dragging, setDragging] = useState(false);
    const replaced = alreadyUploaded && !file;
    return (
        <div>
            <p className="text-[11px] font-black text-white uppercase tracking-wide mb-1">{title}</p>
            <p className="text-white/35 text-[11px] mb-2 leading-snug">{desc}</p>
            <input ref={ref} type="file" accept={accept} className="hidden" onChange={e => onPick(e.target.files?.[0])} />
            <div className="group">
                <div
                    onClick={() => ref.current?.click()}
                    onDragEnter={e => { e.preventDefault(); setDragging(true); }}
                    onDragOver={e => { e.preventDefault(); if (!dragging) setDragging(true); }}
                    onDragLeave={e => { e.preventDefault(); if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false); }}
                    onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) onPick(f); }}
                    className={`cursor-pointer border-2 border-dashed rounded-xl p-5 text-center transition-all duration-150 ${
                        dragging
                            ? 'border-brand bg-brand/20 scale-[1.02] shadow-[0_0_25px_rgba(232,115,28,0.25)]'
                            : file
                                ? 'border-brand/40 bg-brand/5'
                                : replaced
                                    ? 'border-emerald-500/30 bg-emerald-500/5'
                                    : 'border-white/10 group-hover:border-brand/40 group-hover:bg-brand/5'
                    }`}
                >
                    {dragging ? (
                        <div className="space-y-1 py-1 pointer-events-none">
                            <svg className="w-7 h-7 text-brand mx-auto animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                            <p className="text-brand font-black text-xs uppercase tracking-widest">Suelta aquí</p>
                        </div>
                    ) : file ? (
                        <div className="space-y-1">
                            <svg className="w-7 h-7 text-brand mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                            <p className="text-brand font-bold text-xs truncate px-2">{file.name}</p>
                            <p className="text-white/30 text-[10px]">{(file.size / 1024).toFixed(0)} KB · pulsa para cambiar</p>
                        </div>
                    ) : replaced ? (
                        <div className="space-y-1">
                            <svg className="w-7 h-7 text-emerald-400 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                            <p className="text-emerald-400 font-bold text-xs">Ya recibido ✓</p>
                            <p className="text-white/30 text-[10px]">Pulsa o arrastra para reemplazarlo</p>
                        </div>
                    ) : (
                        <div className="space-y-1">
                            <svg className="w-7 h-7 text-white/20 group-hover:text-brand mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                            <p className="text-xs text-white/40 font-medium">Pulsa o arrastra (PDF o foto)</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// Campo de texto reutilizable (a nivel de módulo para no remontar y perder foco).
function Campo({ label, value, onChange, type = 'text', placeholder, uppercase, full, mono, center }) {
    return (
        <div className={full ? 'sm:col-span-2' : ''}>
            <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-1">{label}</label>
            <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
                className={`w-full bg-bkg-elevated border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm focus:outline-none focus:border-brand/50 transition-all ${mono ? 'font-mono text-base tracking-[0.15em]' : ''} ${center ? 'text-center' : ''} ${uppercase ? '' : 'no-uppercase'}`} />
        </div>
    );
}

export function FirmarAnexosView({ expedienteId }) {
    const [info, setInfo] = useState(null);
    const [loadError, setLoadError] = useState(null);
    const [anexoI, setAnexoI] = useState(null);
    const [cesion, setCesion] = useState(null);
    const [cesionFirma, setCesionFirma] = useState('manuscrita'); // 'manuscrita' | 'electronica'
    const [dniFrontal, setDniFrontal] = useState(null);
    const [dniTrasero, setDniTrasero] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [done, setDone] = useState(false);
    const [uploadError, setUploadError] = useState(null);
    // ── Firma DIGITAL (Autofirma) de ambos anexos en secuencia ────────────────
    const [modo, setModo] = useState(null);            // null | 'digital' | 'manual'
    const [signQueue, setSignQueue] = useState([]);    // [{which,label,anchor}]
    const [signIndex, setSignIndex] = useState(0);
    const [signPdfB64, setSignPdfB64] = useState(null);
    const [signOpen, setSignOpen] = useState(false);
    const [signedFiles, setSignedFiles] = useState({}); // { anexo_i, cesion } base64 firmados
    const [prepError, setPrepError] = useState(null);
    const [preparing, setPreparing] = useState(false);

    // ── Sección "Completa tus datos" (email/DNI/IBAN + justificante bancario) ──
    const [datos, setDatos] = useState({ email: '', telefono: '', nombre_razon_social: '', apellidos: '', dni_cif: '', iban: '' });
    const [justificante, setJustificante] = useState(null);
    const [savingDatos, setSavingDatos] = useState(false);
    const [datosMsg, setDatosMsg] = useState(null); // { ok, text }

    const loadInfo = () => axios.get(`${API_URL}/anexos-upload/${expedienteId}`)
        .then(r => setInfo(r.data))
        .catch(() => setLoadError('No se ha encontrado el expediente o el enlace no es válido.'));

    useEffect(() => { loadInfo(); }, [expedienteId]);

    // Precarga los valores actuales del cliente cuando llega la info.
    useEffect(() => {
        const d = info?.datos_cliente;
        if (d) setDatos({ email: d.email || '', telefono: d.telefono || '', nombre_razon_social: d.nombre_razon_social || '', apellidos: d.apellidos || '', dni_cif: d.dni || '', iban: d.iban || '' });
    }, [info]);

    const pickFile = (f, setter) => {
        if (!f) return;
        const ok = f.type === 'application/pdf' || (f.type || '').startsWith('image/');
        if (!ok) { setUploadError('Solo se admiten archivos PDF o imágenes (foto/escaneo).'); return; }
        setUploadError(null);
        setter(f);
    };

    // ── Guardar datos del cliente (validación tipo propuesta) ──────────────────
    const dc = info?.datos_cliente || {};
    // El gate de fase mira solo los datos que ALIMENTAN los anexos (email/DNI/IBAN/tlf).
    // El justificante va junto con el IBAN (igual que la propuesta); no bloquea por sí solo.
    const faltanDatos = !!(dc.falta_email || dc.falta_dni || dc.falta_iban || !dc.telefono);
    const setDato = (k, v) => setDatos(prev => ({ ...prev, [k]: v }));
    // Fase 3 (firma): en cuanto los anexos se han ENVIADO al cliente (o generado en Drive).
    const anexosListos = !!(info?.anexo_i_enviado || info?.anexo_cesion_enviado || info?.anexo_i_disponible || info?.anexo_cesion_disponible);
    const hayDescarga = !!(info?.anexo_i_disponible || info?.anexo_cesion_disponible);
    const descargarUrl = (which) => `${API_URL}/anexos-upload/${expedienteId}/descargar/${which}`;

    const handleGuardarDatos = async () => {
        const errs = [];
        if (dc.falta_email) {
            if (!datos.email.trim()) errs.push('email');
            else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datos.email.trim())) errs.push('un email válido');
        }
        if (!dc.telefono && !datos.telefono.trim()) errs.push('teléfono');
        if (dc.falta_dni && !datos.dni_cif.trim()) errs.push('DNI/CIF');
        if (dc.falta_iban) {
            const c = datos.iban.replace(/\s+/g, '').toUpperCase();
            if (!c) errs.push('IBAN');
            else if (!/^ES\d{22}$/.test(c)) errs.push('un IBAN válido (ES + 22 dígitos)');
        }
        if (dc.falta_iban && !justificante && !dc.justificante_subido) errs.push('el justificante de titularidad bancaria');
        if (errs.length) { setDatosMsg({ ok: false, text: 'Falta o es incorrecto: ' + errs.join(', ') + '.' }); return; }

        setSavingDatos(true); setDatosMsg(null);
        try {
            const fd = new FormData();
            fd.append('email', datos.email);
            fd.append('telefono', datos.telefono);
            fd.append('nombre_razon_social', datos.nombre_razon_social);
            fd.append('apellidos', datos.apellidos);
            fd.append('dni_cif', datos.dni_cif);
            fd.append('iban', datos.iban);
            if (justificante) fd.append('justificante', justificante);
            const { data } = await axios.post(`${API_URL}/anexos-datos/${expedienteId}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
            setDatosMsg({ ok: true, text: '¡Datos guardados! Gracias.' });
            if (data?.datos_cliente) setInfo(prev => ({ ...prev, datos_cliente: data.datos_cliente }));
            setJustificante(null);
        } catch (e) {
            setDatosMsg({ ok: false, text: e.response?.data?.error || 'No se pudieron guardar los datos. Inténtalo de nuevo.' });
        } finally {
            setSavingDatos(false);
        }
    };

    // El DNI es obligatorio cuando la Cesión va firmada a mano (manuscrita), para anexarlo.
    const cesionManuscrita = !!cesion && cesionFirma === 'manuscrita';
    const dniRequerido = cesionManuscrita;
    const faltaDni = dniRequerido && (!dniFrontal || !dniTrasero);
    const algoQueSubir = anexoI || cesion || dniFrontal || dniTrasero;
    const puedeEnviar = algoQueSubir && !faltaDni && !uploading;

    const handleSubmit = async () => {
        if (!puedeEnviar) return;
        setUploading(true);
        setUploadError(null);
        try {
            const form = new FormData();
            if (anexoI) form.append('anexo_i', anexoI);
            if (cesion) { form.append('anexo_cesion', cesion); form.append('cesion_firma', cesionFirma); }
            if (dniFrontal) form.append('dni_frontal', dniFrontal);
            if (dniTrasero) form.append('dni_trasero', dniTrasero);
            await axios.post(`${API_URL}/anexos-upload/${expedienteId}`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
            setDone(true);
        } catch (e) {
            setUploadError(e.response?.data?.error || 'Error al subir los documentos. Inténtalo de nuevo.');
        } finally {
            setUploading(false);
        }
    };

    // ── FIRMA DIGITAL: firma Anexo I y Cesión con Autofirma, uno tras otro ─────
    const openSignAt = async (queue, idx) => {
        setPrepError(null);
        setPreparing(true);
        try {
            const item = queue[idx];
            const b64 = await fetchPdfBase64(`${API_URL}/anexos-upload/${expedienteId}/descargar/${item.which}`);
            setSignPdfB64(b64);
            setSignIndex(idx);
            setSignOpen(true);
        } catch {
            setPrepError('No se pudo cargar el documento para firmar. Inténtalo de nuevo.');
        } finally {
            setPreparing(false);
        }
    };

    const startDigital = async () => {
        const q = [];
        if (info.anexo_i_disponible) q.push({ which: 'anexo_i', label: 'Anexo I', anchor: ['fdo.:^above', 'fdo.^above', 'firma del propietario'], fixedBox: SIGN_BOXES.anexo_i });
        if (info.anexo_cesion_disponible) q.push({ which: 'cesion', label: 'Anexo de Cesión de Ahorros', anchor: ['el cedente@2', 'cedente@2', 'el cedente', 'cedente'], fixedBox: SIGN_BOXES.anexo_cesion });
        if (!q.length) { setPrepError('No hay anexos disponibles para firmar todavía.'); return; }
        setSignedFiles({});
        setSignQueue(q);
        await openSignAt(q, 0);
    };

    // Recibe el PDF firmado (base64) del documento actual → siguiente o enviar.
    const handleAnexoSigned = async (signedB64) => {
        const item = signQueue[signIndex];
        const acc = { ...signedFiles, [item.which]: signedB64 };
        setSignedFiles(acc);
        setSignOpen(false);
        setSignPdfB64(null);
        if (signIndex + 1 < signQueue.length) {
            // Firmar el siguiente anexo.
            await openSignAt(signQueue, signIndex + 1);
            return;
        }
        // Todos firmados → enviar.
        setUploading(true);
        setUploadError(null);
        try {
            const form = new FormData();
            if (acc.anexo_i) form.append('anexo_i', b64ToBlob(acc.anexo_i), `${info.numero_expediente} - Anexo I_fdo.pdf`);
            if (acc.cesion) { form.append('anexo_cesion', b64ToBlob(acc.cesion), `${info.numero_expediente} - Anexo Cesion_fdo.pdf`); form.append('cesion_firma', 'electronica'); }
            await axios.post(`${API_URL}/anexos-upload/${expedienteId}`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
            setDone(true);
        } catch (e) {
            setUploadError(e.response?.data?.error || 'Los anexos se firmaron pero no se pudieron enviar. Inténtalo de nuevo.');
        } finally {
            setUploading(false);
        }
    };

    if (!info && !loadError) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center">
                <DynamicNetworkBackground />
                <div className="relative z-10 flex flex-col items-center gap-4">
                    <svg className="w-8 h-8 animate-spin text-brand" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
                    <p className="text-white/40 font-bold uppercase tracking-widest text-xs">Cargando expediente...</p>
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

    return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden selection:bg-brand selection:text-black">
            <DynamicNetworkBackground />
            <div className="w-full max-w-lg relative z-10 px-4 py-10">
                <div className="text-center mb-8 relative">
                    <h1 className="flex items-baseline justify-center gap-x-2 md:gap-x-4 mb-2 relative z-10">
                        {faltanDatos ? (
                            <>
                                <span className="text-white text-2xl md:text-3xl font-medium tracking-tight">Completa tus</span>
                                <span className="text-3xl md:text-5xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-brand via-brand to-brand-700 uppercase">Datos</span>
                            </>
                        ) : (
                            <>
                                <span className="text-white text-2xl md:text-3xl font-medium tracking-tight">Firma de</span>
                                <span className="text-3xl md:text-5xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-brand via-brand to-brand-700 uppercase">Anexos</span>
                            </>
                        )}
                    </h1>
                    <p className="text-white/60 text-sm">{faltanDatos ? 'Solo necesitamos un par de datos para preparar tus anexos.' : 'Sube los anexos firmados y la foto de tu DNI por ambas caras.'}</p>
                </div>

                <div className="bg-bkg-surface shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/[0.06] rounded-[2rem] overflow-hidden backdrop-blur-xl relative">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-brand/40 to-transparent"></div>

                    <div className="px-8 pt-8 pb-5 border-b border-white/[0.06] space-y-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 mb-3">Detalles del expediente</p>
                        {[['Expediente', info.numero_expediente, 'text-brand font-mono'], ['Cliente', info.cliente, 'text-white/80']].map(([label, value, cls]) => (
                            <div key={label} className="flex items-center justify-between">
                                <span className="text-[10px] text-white/30 uppercase tracking-widest font-bold">{label}</span>
                                <span className={`text-sm font-bold ${cls}`}>{value || '—'}</span>
                            </div>
                        ))}
                    </div>

                    <div className="p-8 space-y-5">
                        {done ? (
                            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-8 text-center animate-fade-in">
                                <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-4 border border-emerald-500/20">
                                    <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                </div>
                                <h2 className="text-xl font-black text-emerald-400 uppercase tracking-widest mb-3">¡Documentación recibida!</h2>
                                <p className="text-white/50 text-sm leading-relaxed">Gracias. El equipo de Brokergy continuará con la tramitación del expediente <strong className="text-brand">{info.numero_expediente}</strong>.</p>
                                <button onClick={() => { setDone(false); setAnexoI(null); setCesion(null); setDniFrontal(null); setDniTrasero(null); loadInfo(); }} className="mt-6 text-[11px] text-brand/70 hover:text-brand font-black uppercase tracking-widest underline underline-offset-4">Subir o reemplazar otro documento</button>
                            </div>
                        ) : faltanDatos ? (
                            /* ── FASE 1: Completa tus datos (los anexos llegan después) ── */
                            <>
                                <p className="text-white/45 text-sm leading-relaxed">
                                    Para tramitar tu ayuda necesitamos primero un par de datos. <strong className="text-white">En cuanto los recibamos, prepararemos tus anexos y te los enviaremos para que los firmes</strong> desde este mismo enlace.
                                </p>
                                <div className="rounded-2xl border border-amber-400/20 bg-amber-500/[0.05] p-5 space-y-4">
                                    <div>
                                        <p className="text-[11px] font-black uppercase tracking-[0.15em] text-amber-300">Completa tus datos</p>
                                        <p className="text-white/45 text-[11px] mt-1 leading-snug">Solo te pedimos lo que falta.</p>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        {dc.falta_email && <Campo label="Email *" type="email" value={datos.email} onChange={v => setDato('email', v)} placeholder="tucorreo@email.com" />}
                                        {!dc.telefono && <Campo label="Teléfono *" type="tel" value={datos.telefono} onChange={v => setDato('telefono', v)} placeholder="600 000 000" />}
                                        {dc.falta_dni && <Campo label="DNI / CIF *" value={datos.dni_cif} onChange={v => setDato('dni_cif', v)} placeholder="00000000A" uppercase />}
                                        {dc.falta_iban && <Campo label="IBAN (nº de cuenta) *" value={datos.iban} onChange={v => setDato('iban', v)} placeholder="ES00 0000 0000 0000 0000 0000" uppercase full mono center />}
                                    </div>
                                    {dc.falta_iban && (
                                        <DropZone file={justificante} onPick={f => pickFile(f, setJustificante)} alreadyUploaded={dc.justificante_subido} accept="image/*,application/pdf"
                                            title="Justificante de titularidad bancaria *" desc="Documento del banco donde se vea tu nombre y el IBAN (PDF o foto)." />
                                    )}
                                    {datosMsg && (
                                        <p className={`text-[11px] font-medium ${datosMsg.ok ? 'text-emerald-400' : 'text-red-400'}`}>{datosMsg.ok ? '✅' : '⚠️'} {datosMsg.text}</p>
                                    )}
                                    <button onClick={handleGuardarDatos} disabled={savingDatos}
                                        className="w-full py-3 bg-amber-500/15 border border-amber-400/30 text-amber-300 font-black rounded-xl uppercase tracking-widest text-xs hover:bg-amber-500 hover:text-bkg-deep transition-all disabled:opacity-40 flex items-center justify-center gap-2">
                                        {savingDatos ? (<><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>Guardando...</>) : 'Enviar mis datos'}
                                    </button>
                                </div>
                            </>
                        ) : !anexosListos ? (
                            /* ── FASE 2: datos recibidos, preparando anexos ── */
                            <div className="text-center py-6 space-y-4 animate-fade-in">
                                <div className="w-16 h-16 rounded-full bg-brand/10 flex items-center justify-center mx-auto border border-brand/20">
                                    <svg className="w-8 h-8 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                </div>
                                <h2 className="text-lg font-black text-white uppercase tracking-widest">¡Datos recibidos!</h2>
                                <p className="text-white/50 text-sm leading-relaxed max-w-sm mx-auto">Ya tenemos tus datos. Estamos preparando tus anexos y <strong className="text-white">te avisaremos en breve</strong> para que los firmes desde este mismo enlace.</p>
                                <button onClick={() => loadInfo()} className="text-[11px] text-brand/70 hover:text-brand font-black uppercase tracking-widest underline underline-offset-4">Actualizar</button>
                            </div>
                        ) : (
                            /* ── FASE 3: Firma de anexos — elegir modo ── */
                            <>
                                {/* Selector de modo de firma */}
                                {modo === null && (
                                    <div className="space-y-4 animate-fade-in">
                                        <p className="text-white/50 text-sm leading-relaxed text-center">Elige cómo quieres firmar tus anexos. <strong className="text-white">Lo más rápido es con certificado digital.</strong></p>
                                        <button onClick={() => { setModo('digital'); startDigital(); }} disabled={preparing}
                                            className="w-full text-left rounded-2xl border border-brand/40 bg-brand/[0.06] p-5 hover:bg-brand/[0.1] transition-all disabled:opacity-50">
                                            <div className="flex items-center gap-3">
                                                <div className="w-11 h-11 rounded-xl bg-brand/15 flex items-center justify-center shrink-0">
                                                    <svg className="w-6 h-6 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-sm font-black text-white uppercase tracking-wide">Firma digital <span className="text-brand">· recomendado</span></p>
                                                    <p className="text-white/45 text-[12px] leading-snug mt-0.5">{preparing ? 'Preparando documentos…' : 'Firma aquí mismo con tu certificado (Autofirma). Te marcamos dónde firmar. Sin descargar nada.'}</p>
                                                </div>
                                            </div>
                                        </button>
                                        <button onClick={() => setModo('manual')}
                                            className="w-full text-left rounded-2xl border border-white/10 bg-white/[0.02] p-5 hover:border-white/20 transition-all">
                                            <div className="flex items-center gap-3">
                                                <div className="w-11 h-11 rounded-xl bg-white/5 flex items-center justify-center shrink-0">
                                                    <svg className="w-6 h-6 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-sm font-black text-white uppercase tracking-wide">Firma a mano</p>
                                                    <p className="text-white/45 text-[12px] leading-snug mt-0.5">Descarga los anexos, fírmalos a mano y súbelos con la foto de tu DNI por ambas caras.</p>
                                                </div>
                                            </div>
                                        </button>
                                        {prepError && <p className="text-[12px] text-red-400 text-center">⚠️ {prepError}</p>}
                                    </div>
                                )}

                                {/* Modo DIGITAL: firma con Autofirma */}
                                {modo === 'digital' && (
                                    <div className="space-y-4 animate-fade-in">
                                        <div className="rounded-2xl border border-brand/20 bg-brand/[0.05] p-5">
                                            <p className="text-[11px] font-black uppercase tracking-[0.15em] text-brand mb-2">Firma digital con certificado</p>
                                            <p className="text-white/50 text-sm leading-relaxed">Se abrirá tu <strong className="text-white">Anexo I</strong> y tu <strong className="text-white">Anexo de Cesión</strong>, uno tras otro. En cada uno te <strong className="text-white">marcamos con un destello dónde firmar</strong>. Solo pulsa <strong className="text-white">Firmar con Autofirma</strong> y elige tu certificado. Necesitas tener Autofirma instalado.</p>
                                        </div>
                                        {prepError && <p className="text-[12px] text-red-400 text-center">⚠️ {prepError}</p>}
                                        <button onClick={startDigital} disabled={preparing || uploading}
                                            className="w-full py-4 bg-gradient-to-r from-brand to-brand-700 hover:from-brand-400 hover:to-brand-600 text-bkg-deep font-black rounded-xl transition-all shadow-lg shadow-brand/20 disabled:opacity-40 flex items-center justify-center gap-3 text-sm uppercase tracking-widest">
                                            {(preparing || uploading) ? (<><svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>{uploading ? 'Enviando…' : 'Preparando…'}</>) : (<>🖊️ Firmar ahora con Autofirma</>)}
                                        </button>
                                        <button onClick={() => { setModo(null); setPrepError(null); }} className="w-full text-[11px] text-white/40 hover:text-white/70 font-black uppercase tracking-widest">← Otra forma de firmar</button>
                                    </div>
                                )}

                                {modo === 'manual' && (
                                <>
                                <button onClick={() => setModo(null)} className="text-[11px] text-white/40 hover:text-white/70 font-black uppercase tracking-widest mb-1">← Otra forma de firmar</button>
                                {/* Paso 1 · Descargar para firmar */}
                                <div className="rounded-2xl border border-brand/15 bg-brand/[0.04] p-4 space-y-3">
                                    <div>
                                        <p className="text-[11px] font-black uppercase tracking-[0.15em] text-brand">1 · Firma tus anexos</p>
                                        <p className="text-white/40 text-[11px] mt-1 leading-snug">
                                            {hayDescarga
                                                ? 'Descarga tus anexos, fírmalos (con certificado digital o a mano) y vuelve aquí para subirlos.'
                                                : 'Firma el anexo que te enviamos por WhatsApp/email (con certificado digital o a mano) y súbelo aquí abajo.'}
                                        </p>
                                    </div>
                                    {hayDescarga && (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                            {info.anexo_i_disponible && (
                                                <a href={descargarUrl('anexo_i')} className="flex items-center justify-center gap-2 py-3 rounded-xl border border-white/10 bg-white/[0.02] text-white/80 text-[11px] font-black uppercase tracking-wider hover:border-brand/40 hover:bg-brand/5 transition-all">
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" /></svg>
                                                    Anexo I
                                                </a>
                                            )}
                                            {info.anexo_cesion_disponible && (
                                                <a href={descargarUrl('cesion')} className="flex items-center justify-center gap-2 py-3 rounded-xl border border-white/10 bg-white/[0.02] text-white/80 text-[11px] font-black uppercase tracking-wider hover:border-brand/40 hover:bg-brand/5 transition-all">
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" /></svg>
                                                    Anexo Cesión
                                                </a>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <p className="text-white/40 text-sm leading-relaxed">
                                    <strong className="text-white">2 · Sube los anexos firmados</strong> y la foto de tu DNI por ambas caras. Vale el PDF firmado o una foto/escaneo nítido.
                                </p>

                                <DropZone file={anexoI} onPick={f => pickFile(f, setAnexoI)} alreadyUploaded={info.anexo_i_firmado} title="Anexo I firmado" desc="La Declaración Responsable que te enviamos, firmada." />

                                <DropZone file={cesion} onPick={f => pickFile(f, setCesion)} alreadyUploaded={info.anexo_cesion_firmado} title="Anexo de Cesión de Ahorros firmado" desc="El Convenio de Cesión que te enviamos, firmado." />

                                {/* Tipo de firma de la Cesión */}
                                {cesion && (
                                    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3 animate-fade-in">
                                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">¿Cómo has firmado la Cesión?</p>
                                        <div className="grid grid-cols-2 gap-2">
                                            <button type="button" onClick={() => setCesionFirma('electronica')}
                                                className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border text-center transition-all ${cesionFirma === 'electronica' ? 'border-brand/50 bg-brand/10' : 'border-white/10 bg-white/[0.02] hover:border-white/20'}`}>
                                                <svg className="w-5 h-5 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                <span className="text-[11px] font-black uppercase tracking-wider text-white">Electrónica</span>
                                                <span className="text-[9px] text-white/40 leading-tight">Con certificado digital</span>
                                            </button>
                                            <button type="button" onClick={() => setCesionFirma('manuscrita')}
                                                className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border text-center transition-all ${cesionFirma === 'manuscrita' ? 'border-brand/50 bg-brand/10' : 'border-white/10 bg-white/[0.02] hover:border-white/20'}`}>
                                                <svg className="w-5 h-5 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                                <span className="text-[11px] font-black uppercase tracking-wider text-white">A mano</span>
                                                <span className="text-[9px] text-white/40 leading-tight">Manuscrita y escaneada</span>
                                            </button>
                                        </div>
                                        {cesionManuscrita && (
                                            <p className="text-[11px] text-amber-300/90 leading-relaxed flex gap-2">
                                                <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                Al ser firma a mano, necesitamos la foto del DNI por ambas caras. La adjuntaremos automáticamente al Anexo de Cesión.
                                            </p>
                                        )}
                                    </div>
                                )}

                                {/* DNI por ambas caras */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <DropZone file={dniFrontal} onPick={f => pickFile(f, setDniFrontal)} alreadyUploaded={info.dni_subido} accept="image/*,application/pdf"
                                        title={`DNI — cara delantera${dniRequerido ? ' *' : ''}`} desc="Foto nítida del DNI por delante." />
                                    <DropZone file={dniTrasero} onPick={f => pickFile(f, setDniTrasero)} alreadyUploaded={info.dni_subido} accept="image/*,application/pdf"
                                        title={`DNI — cara trasera${dniRequerido ? ' *' : ''}`} desc="Foto nítida del DNI por detrás." />
                                </div>

                                {faltaDni && (
                                    <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-300 text-[11px] font-medium flex gap-2 items-center">
                                        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                                        Para la firma a mano de la Cesión, sube el DNI por la cara delantera y la trasera.
                                    </div>
                                )}

                                {uploadError && (
                                    <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-[11px] font-medium flex gap-2 items-center">
                                        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                        {uploadError}
                                    </div>
                                )}

                                <button
                                    onClick={handleSubmit}
                                    disabled={!puedeEnviar}
                                    className="w-full py-4 bg-gradient-to-r from-brand to-brand-700 hover:from-brand-400 hover:to-brand-600 text-bkg-deep font-black rounded-xl transition-all shadow-lg shadow-brand/20 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-3 text-sm uppercase tracking-widest"
                                >
                                    {uploading ? (
                                        <><svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>Subiendo...</>
                                    ) : (
                                        <>Enviar documentación<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg></>
                                    )}
                                </button>
                                <p className="text-[10px] text-white/20 text-center uppercase tracking-wider font-bold">PDF o foto · puedes subir lo que tengas</p>
                                </>
                                )}
                            </>
                        )}
                    </div>
                </div>

                <p className="text-center mt-8 text-[10px] uppercase font-black tracking-[0.2em] text-white/20">Sistema de Gestión Brokergy &copy; {new Date().getFullYear()}</p>
            </div>

            {/* Modal de firma con Autofirma (destello en la zona de firma) */}
            {signOpen && signPdfB64 && (
                <FirmarConCertificadoModal
                    pdfBase64={signPdfB64}
                    title={`Firmar ${signQueue[signIndex]?.label || 'documento'}${signQueue.length > 1 ? ` (${signIndex + 1}/${signQueue.length})` : ''} · ${info.numero_expediente}`}
                    rubricImageUrl={null}
                    signatureAnchor={signQueue[signIndex]?.anchor}
                    fixedBox={signQueue[signIndex]?.fixedBox}
                    onClose={() => { setSignOpen(false); setSignPdfB64(null); }}
                    onSigned={handleAnexoSigned}
                />
            )}
        </div>
    );
}

export default FirmarAnexosView;
