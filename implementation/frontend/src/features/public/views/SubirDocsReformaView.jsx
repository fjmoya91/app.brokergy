/**
 * SubirDocsReformaView — página pública del enlace único de subida de
 * documentación para los leads del formulario /reforma.
 *
 * URL: /subir-docs/:uuid?token=...
 *
 * Pide al backend los SLOTS aplicables a ese lead (según sus respuestas) y
 * muestra una tarjeta por slot. Cada slot permite subir foto/documento; en
 * móvil el input ofrece cámara o galería. Cada fichero se sube al backend y
 * va a la carpeta Drive del lead, nombrado por la clave del slot.
 */

import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';

export function SubirDocsReformaView({ uuid, token }) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [info, setInfo] = useState(null);          // { id_oportunidad, cliente, slots, uploaded }
    const [busySlot, setBusySlot] = useState(null);  // slot.key en subida
    const [slotError, setSlotError] = useState({});  // { [slotKey]: msg }

    useEffect(() => {
        let cancel = false;
        (async () => {
            try {
                const res = await axios.get(`/api/public/reforma-docs/${uuid}`, { params: { token } });
                if (!cancel) setInfo(res.data);
            } catch (err) {
                if (!cancel) setError(err.response?.data?.error || 'No pudimos cargar tu solicitud. Comprueba el enlace.');
            } finally {
                if (!cancel) setLoading(false);
            }
        })();
        return () => { cancel = true; };
    }, [uuid, token]);

    const uploadFiles = async (slot, fileList) => {
        const files = Array.from(fileList || []);
        if (!files.length) return;
        setBusySlot(slot.key);
        setSlotError(prev => ({ ...prev, [slot.key]: null }));
        try {
            for (const file of files) {
                const form = new FormData();
                form.append('file', file);
                const res = await axios.post(
                    `/api/public/reforma-docs/${uuid}/${slot.key}`,
                    form,
                    { params: { token }, headers: { 'Content-Type': 'multipart/form-data' } }
                );
                // Actualizar estado local con lo subido
                setInfo(prev => {
                    const uploaded = { ...(prev.uploaded || {}) };
                    const entry = { name: res.data.name, link: res.data.link, at: new Date().toISOString() };
                    uploaded[slot.key] = slot.multiple ? [...(uploaded[slot.key] || []), entry] : [entry];
                    return { ...prev, uploaded };
                });
                if (!slot.multiple) break; // single-slot: solo el primero
            }
        } catch (err) {
            setSlotError(prev => ({ ...prev, [slot.key]: err.response?.data?.error || 'No se pudo subir. Inténtalo de nuevo.' }));
        } finally {
            setBusySlot(null);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center">
                <div className="animate-pulse text-amber-500 font-bold tracking-widest text-sm uppercase">Cargando…</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
                <div className="max-w-md text-center">
                    <div className="text-6xl mb-5">🔒</div>
                    <h1 className="text-2xl font-black text-white mb-3">Enlace no válido</h1>
                    <p className="text-white/60 text-sm">{error}</p>
                </div>
            </div>
        );
    }

    const slots = info?.slots || [];
    const totalRequired = slots.filter(s => s.required).length;
    const doneRequired = slots.filter(s => s.required && (info.uploaded?.[s.key]?.length)).length;

    return (
        <div className="min-h-screen bg-slate-950 text-white px-4 py-6 md:py-10">
            <div className="max-w-2xl mx-auto">
                {/* Header */}
                <header className="text-center mb-8">
                    <div className="text-2xl md:text-3xl font-black tracking-tight mb-3">
                        <span className="text-white">BROKER</span><span className="text-amber-400">GY</span>
                    </div>
                    <h1 className="text-2xl md:text-4xl font-black text-white tracking-tight leading-tight">Sube tu documentación</h1>
                    <p className="text-white/60 text-sm md:text-base mt-3">
                        Solicitud <span className="font-mono text-amber-400 font-bold">{info.id_oportunidad}</span>
                        {info.cliente ? <> · {info.cliente}</> : null}
                    </p>
                    <p className="text-white/45 text-xs mt-2">Puedes hacerlo desde el móvil: al pulsar te dejará usar la <strong className="text-white/70">cámara</strong> o elegir de la <strong className="text-white/70">galería</strong>.</p>
                    {totalRequired > 0 && (
                        <p className="text-white/40 text-[11px] mt-3 font-bold uppercase tracking-widest">Obligatorios: {doneRequired}/{totalRequired}</p>
                    )}
                </header>

                {/* Slots */}
                <div className="space-y-3">
                    {slots.map(slot => {
                        const items = info.uploaded?.[slot.key] || [];
                        const done = items.length > 0;
                        const busy = busySlot === slot.key;
                        return (
                            <div key={slot.key} className={`p-5 rounded-2xl border-2 transition-all ${done ? 'border-emerald-400/40 bg-emerald-400/[0.06]' : slot.required ? 'border-amber-400/30 bg-amber-400/[0.04]' : 'border-white/10 bg-white/[0.03]'}`}>
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1 min-w-0">
                                        <p className="font-black text-white text-sm md:text-base flex items-center gap-2">
                                            {done && <span className="text-emerald-400">✓</span>}
                                            {slot.label}
                                            {slot.required && !done && <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-400/15 text-amber-300">Obligatorio</span>}
                                        </p>
                                        {slot.help && <p className="text-white/45 text-xs mt-1 leading-snug">{slot.help}</p>}
                                        {items.length > 0 && (
                                            <ul className="mt-2 space-y-1">
                                                {items.map((it, i) => (
                                                    <li key={i} className="text-emerald-300/80 text-xs flex items-center gap-1.5">
                                                        <span>📎</span><span className="truncate">{it.name}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                        {slotError[slot.key] && <p className="text-red-400 text-xs mt-2">{slotError[slot.key]}</p>}
                                    </div>

                                    <label className={`shrink-0 cursor-pointer px-4 py-2.5 rounded-xl font-black uppercase tracking-widest text-[11px] transition-all ${busy ? 'bg-white/10 text-white/40' : done ? 'bg-white/[0.06] text-white/70 hover:bg-white/[0.1] border border-white/10' : 'bg-gradient-to-r from-amber-500 to-amber-400 text-bkg-deep shadow-lg shadow-amber-500/20'}`}>
                                        {busy ? 'Subiendo…' : done ? (slot.multiple ? '+ Añadir' : 'Cambiar') : 'Subir'}
                                        <input
                                            type="file"
                                            accept={slot.accept}
                                            {...(slot.multiple ? { multiple: true } : {})}
                                            disabled={busy}
                                            onChange={e => { uploadFiles(slot, e.target.files); e.target.value = ''; }}
                                            className="hidden"
                                        />
                                    </label>
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="mt-8 p-4 bg-white/[0.02] border border-white/10 rounded-2xl text-xs text-white/45 leading-relaxed text-center">
                    Puedes volver a este enlace cuando quieras para añadir más documentos. Cuando lo tengamos todo, un técnico de Brokergy revisará tu caso.
                </div>

                <footer className="mt-10 pt-6 border-t border-white/5 text-center">
                    <p className="text-white/20 text-[10px] uppercase tracking-[0.2em] font-bold">Brokergy · Ingeniería Energética</p>
                </footer>
            </div>
        </div>
    );
}

export default SubirDocsReformaView;
