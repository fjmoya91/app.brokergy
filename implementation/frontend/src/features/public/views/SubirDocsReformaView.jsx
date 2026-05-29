/**
 * SubirDocsReformaView — página pública del enlace único de documentación.
 *
 * URL: /subir-docs/:uuid?token=...
 *
 * Dos pestañas: ANTES y DESPUÉS de la obra. La pestaña DESPUÉS se mantiene
 * bloqueada hasta que la propuesta esté ACEPTADA (ya hay expediente), para no
 * abrumar al inicio. Cada slot admite varias fotos (perspectivas), con miniatura
 * de Drive (clic = ver en grande, sin salir de la página) y opción de borrar.
 * En móvil el input ofrece cámara directamente.
 */

import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { DynamicNetworkBackground } from '../../../components/DynamicNetworkBackground';

// Estilos por estado de cada slot
const ESTADO_UI = {
    pendiente: { ring: 'border-white/10 bg-white/[0.03]', chip: null },
    subida:    { ring: 'border-sky-400/40 bg-sky-400/[0.06]', chip: { txt: 'Recibida · en revisión', cls: 'bg-sky-400/15 text-sky-300' } },
    validada:  { ring: 'border-emerald-400/40 bg-emerald-400/[0.06]', chip: { txt: '✓ Validada', cls: 'bg-emerald-400/15 text-emerald-300' } },
    rechazada: { ring: 'border-red-400/40 bg-red-400/[0.06]', chip: { txt: '✗ Vuelve a subirla', cls: 'bg-red-400/15 text-red-300' } },
};

const isImageThumb = (it) => !!(it.thumb || it.driveId);
const driveImgUrl = (driveId, size) => (driveId ? `https://lh3.googleusercontent.com/d/${driveId}=w${size}` : null);

/**
 * Imagen de un documento subido.
 *  - Si hay `localUrl` (recién subido en esta sesión): se muestra al instante
 *    desde el fichero local. Cero espera, sin depender de Drive.
 *  - Si no (cargado del servidor): usa la miniatura de Drive (lh3). Tras subir,
 *    Drive tarda unos segundos en generarla, así que reintentamos con backoff
 *    y mostramos "procesando…" en vez de un icono roto. Como último recurso
 *    cae al endpoint /thumbnail de Drive.
 */
function DriveImg({ localUrl, driveId, thumb, size = 400, fit = 'cover', alt = '' }) {
    const remote = driveImgUrl(driveId, size) || thumb || null;
    const [attempt, setAttempt] = useState(0);
    const [loaded, setLoaded] = useState(false);
    const [dead, setDead] = useState(false);

    useEffect(() => { setAttempt(0); setLoaded(false); setDead(false); }, [localUrl, remote]);

    if (!localUrl && !remote) {
        return <div className="absolute inset-0 flex items-center justify-center bg-white/5 text-white/30 text-[9px]">—</div>;
    }

    let src;
    if (localUrl) {
        src = localUrl;
    } else if (attempt < 6) {
        src = attempt === 0 ? remote : `${remote}${remote.includes('?') ? '&' : '?'}cb=${attempt}`;
    } else if (driveId) {
        // Último recurso: endpoint /thumbnail (otra ruta de Drive)
        src = `https://drive.google.com/thumbnail?id=${driveId}&sz=w${size}&cb=${attempt}`;
    } else {
        src = remote;
    }

    return (
        <>
            <img
                src={src}
                alt={alt}
                className={`w-full h-full object-${fit}`}
                onLoad={() => setLoaded(true)}
                onError={() => {
                    if (localUrl) { setDead(true); return; }
                    if (attempt < 8) setTimeout(() => setAttempt(a => a + 1), 1200 * (attempt + 1));
                    else setDead(true);
                }}
            />
            {!loaded && !dead && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/5 text-[9px] text-white/40 animate-pulse pointer-events-none">procesando…</div>
            )}
            {dead && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/5 text-[9px] text-white/40 pointer-events-none">no disponible</div>
            )}
        </>
    );
}

export function SubirDocsReformaView({ uuid, token }) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [info, setInfo] = useState(null);          // { id_oportunidad, cliente, aceptada, slots: [...] }
    const [tab, setTab] = useState('ANTES');
    const [busySlot, setBusySlot] = useState(null);
    const [slotError, setSlotError] = useState({});
    const [lightbox, setLightbox] = useState(null);  // { url, label }

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

    const patchSlot = (key, fn) => {
        setInfo(prev => ({ ...prev, slots: prev.slots.map(s => (s.key === key ? fn(s) : s)) }));
    };

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
                // Previsualización local instantánea (el fichero ya está en el navegador):
                // evita esperar a que Drive genere la miniatura.
                const localUrl = file.type?.startsWith('image/') ? URL.createObjectURL(file) : null;
                const entry = { name: res.data.name, link: res.data.link, thumb: res.data.thumb, driveId: res.data.driveId, localUrl, at: new Date().toISOString() };
                patchSlot(slot.key, s => ({
                    ...s,
                    estado: res.data.estado || 'subida',
                    items: s.multiple ? [...(s.items || []), entry] : [entry],
                }));
                if (!slot.multiple) break;
            }
        } catch (err) {
            setSlotError(prev => ({ ...prev, [slot.key]: err.response?.data?.error || 'No se pudo subir. Inténtalo de nuevo.' }));
        } finally {
            setBusySlot(null);
        }
    };

    const deleteItem = async (slot, item) => {
        setBusySlot(slot.key);
        setSlotError(prev => ({ ...prev, [slot.key]: null }));
        try {
            await axios.delete(`/api/public/reforma-docs/${uuid}/${slot.key}`, { params: { token, name: item.name } });
            patchSlot(slot.key, s => {
                const items = (s.items || []).filter(it => it.name !== item.name);
                return { ...s, items, estado: items.length ? s.estado : 'pendiente' };
            });
        } catch (err) {
            setSlotError(prev => ({ ...prev, [slot.key]: err.response?.data?.error || 'No se pudo borrar. Inténtalo de nuevo.' }));
        } finally {
            setBusySlot(null);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-950 relative overflow-hidden flex items-center justify-center">
                <DynamicNetworkBackground />
                <div className="relative z-10 animate-pulse text-amber-500 font-bold tracking-widest text-sm uppercase">Cargando…</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-slate-950 relative overflow-hidden flex items-center justify-center px-4">
                <DynamicNetworkBackground />
                <div className="relative z-10 max-w-md text-center">
                    <div className="text-6xl mb-5">🔒</div>
                    <h1 className="text-2xl font-black text-white mb-3">Enlace no válido</h1>
                    <p className="text-white/60 text-sm">{error}</p>
                </div>
            </div>
        );
    }

    const slots = info?.slots || [];
    const aceptada = !!info?.aceptada;
    const antes = slots.filter(s => s.fase === 'ANTES');
    const despues = slots.filter(s => s.fase === 'DESPUES');
    const reqAntes = antes.filter(s => s.required);
    const reqDone = reqAntes.filter(s => s.items?.length).length;
    const allReqDone = reqAntes.length > 0 && reqDone === reqAntes.length;

    const activeSlots = tab === 'ANTES' ? antes : despues;

    const renderSlot = (slot) => {
        const items = slot.items || [];
        const done = items.length > 0;
        const busy = busySlot === slot.key;
        const estado = slot.estado || (done ? 'subida' : 'pendiente');
        const ui = ESTADO_UI[estado] || ESTADO_UI.pendiente;
        return (
            <div key={slot.key} className={`p-4 md:p-5 rounded-2xl border-2 transition-all ${done ? ui.ring : slot.required ? 'border-amber-400/30 bg-amber-400/[0.04]' : 'border-white/10 bg-white/[0.03]'}`}>
                <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                        <p className="font-black text-white text-sm md:text-base flex items-center gap-2 flex-wrap">
                            {slot.label}
                            {slot.required && !done && <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-400/15 text-amber-300">Obligatorio</span>}
                            {ui.chip && <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${ui.chip.cls}`}>{ui.chip.txt}</span>}
                        </p>
                        {slot.help && <p className="text-white/45 text-xs mt-1 leading-snug">{slot.help}</p>}
                        {estado === 'rechazada' && slot.motivo && (
                            <p className="text-red-300/90 text-xs mt-2">Motivo: {slot.motivo}</p>
                        )}

                        {/* Miniaturas de lo subido (clic = ver en grande, ✕ = borrar) */}
                        {items.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-2">
                                {items.map((it, i) => (
                                    <div key={i} className="relative group">
                                        {isImageThumb(it) ? (
                                            <button
                                                onClick={() => setLightbox({ localUrl: it.localUrl, driveId: it.driveId, thumb: it.thumb, label: slot.label })}
                                                className="relative w-16 h-16 rounded-lg overflow-hidden border border-white/10 hover:border-amber-400/60 transition-all block"
                                                title="Ver en grande"
                                            >
                                                <DriveImg localUrl={it.localUrl} driveId={it.driveId} thumb={it.thumb} size={400} fit="cover" />
                                            </button>
                                        ) : (
                                            <div className="w-16 h-16 rounded-lg border border-white/10 bg-white/[0.04] flex flex-col items-center justify-center text-white/50" title={it.name}>
                                                <span className="text-lg">📄</span>
                                                <span className="text-[8px] mt-0.5 px-1 truncate max-w-[56px]">{it.name.split('.').pop()}</span>
                                            </div>
                                        )}
                                        <button
                                            onClick={() => deleteItem(slot, it)}
                                            disabled={busy}
                                            title="Borrar"
                                            className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-xs font-black flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-all disabled:opacity-50"
                                        >✕</button>
                                    </div>
                                ))}
                            </div>
                        )}
                        {slotError[slot.key] && <p className="text-red-400 text-xs mt-2">{slotError[slot.key]}</p>}
                    </div>

                    <label className={`shrink-0 cursor-pointer px-4 py-2.5 rounded-xl font-black uppercase tracking-widest text-[11px] transition-all ${busy ? 'bg-white/10 text-white/40' : done ? 'bg-white/[0.06] text-white/70 hover:bg-white/[0.1] border border-white/10' : 'bg-gradient-to-r from-amber-500 to-amber-400 text-bkg-deep shadow-lg shadow-amber-500/20'}`}>
                        {busy ? '…' : done ? (slot.multiple ? '+ Añadir' : 'Cambiar') : 'Subir'}
                        <input
                            type="file"
                            accept={slot.accept}
                            capture={slot.accept?.startsWith('image/') ? 'environment' : undefined}
                            {...(slot.multiple ? { multiple: true } : {})}
                            disabled={busy}
                            onChange={e => { uploadFiles(slot, e.target.files); e.target.value = ''; }}
                            className="hidden"
                        />
                    </label>
                </div>
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-slate-950 text-white relative overflow-x-hidden px-4 py-6 md:py-10">
            <DynamicNetworkBackground />
            <div className="relative z-10 max-w-2xl mx-auto">
                {/* Header */}
                <header className="text-center mb-6">
                    <div className="text-2xl md:text-3xl font-black tracking-tight mb-3">
                        <span className="text-white">BROKER</span><span className="text-amber-400">GY</span>
                    </div>
                    <h1 className="text-2xl md:text-4xl font-black text-white tracking-tight leading-tight">Documentación de tu expediente</h1>
                    <p className="text-white/60 text-sm md:text-base mt-3">
                        Expediente <span className="font-mono text-amber-400 font-bold">{info.id_oportunidad}</span>
                        {info.cliente ? <> · {info.cliente}</> : null}
                    </p>
                </header>

                {/* Tabs ANTES / DESPUÉS */}
                <div className="grid grid-cols-2 gap-2 mb-6 p-1 bg-white/[0.03] rounded-2xl border border-white/10">
                    <button
                        onClick={() => setTab('ANTES')}
                        className={`py-3 rounded-xl font-black uppercase tracking-widest text-xs transition-all ${tab === 'ANTES' ? 'bg-gradient-to-r from-amber-500 to-amber-400 text-bkg-deep shadow-lg shadow-amber-500/20' : 'text-white/50 hover:text-white/80'}`}
                    >
                        📋 Antes de la obra
                    </button>
                    <button
                        onClick={() => aceptada && setTab('DESPUES')}
                        disabled={!aceptada}
                        title={aceptada ? '' : 'Se activa al aceptar la propuesta'}
                        className={`py-3 rounded-xl font-black uppercase tracking-widest text-xs transition-all flex items-center justify-center gap-1.5 ${tab === 'DESPUES' ? 'bg-gradient-to-r from-amber-500 to-amber-400 text-bkg-deep shadow-lg shadow-amber-500/20' : aceptada ? 'text-white/50 hover:text-white/80' : 'text-white/25 cursor-not-allowed'}`}
                    >
                        {aceptada ? '🔧' : '🔒'} Después de la obra
                    </button>
                </div>

                {/* Contenido de la pestaña activa */}
                {tab === 'ANTES' ? (
                    <section>
                        <div className="mb-4 p-4 bg-amber-400/[0.06] border border-amber-400/20 rounded-2xl text-sm text-white/70 leading-relaxed">
                            📸 Haz estas fotos durante la visita. Las marcadas como <strong className="text-amber-300">obligatorias</strong> son imprescindibles para empezar tu expediente.
                            {reqAntes.length > 0 && (
                                <span className="block mt-2 text-xs font-black uppercase tracking-widest text-white/50">
                                    Obligatorias: {reqDone}/{reqAntes.length}
                                </span>
                            )}
                        </div>
                        {allReqDone && (
                            <div className="mb-4 p-3 bg-emerald-400/[0.08] border border-emerald-400/30 rounded-xl text-sm text-emerald-300 font-bold text-center">
                                ✓ ¡Listo! Ya tenemos lo imprescindible. Puedes añadir más fotos si quieres.
                            </div>
                        )}
                        <div className="space-y-3">{antes.map(renderSlot)}</div>
                    </section>
                ) : (
                    <section>
                        <div className="mb-4 p-4 bg-white/[0.04] border border-white/10 rounded-2xl text-sm text-white/70 leading-relaxed">
                            🔧 Sube las fotos de la instalación <strong className="text-white">ya terminada</strong>. Puedes ir añadiéndolas según avance la obra.
                        </div>
                        <div className="space-y-3">{despues.map(renderSlot)}</div>
                    </section>
                )}

                {/* Aviso de fase DESPUÉS bloqueada (solo en pestaña ANTES, si aún no aceptada) */}
                {tab === 'ANTES' && !aceptada && (
                    <div className="mt-4 p-4 bg-white/[0.02] border border-white/10 rounded-2xl text-xs text-white/40 leading-relaxed text-center">
                        🔒 La fase <strong className="text-white/60">Después de la obra</strong> se activará cuando se acepte la propuesta. Entonces podrás subir las fotos de la instalación terminada desde este mismo enlace.
                    </div>
                )}

                <div className="mt-4 p-4 bg-white/[0.02] border border-white/10 rounded-2xl text-xs text-white/45 leading-relaxed text-center">
                    Puedes volver a este enlace cuando quieras. Un técnico de Brokergy revisará cada foto: si alguna no se ve bien, te avisaremos para repetirla.
                </div>

                <footer className="mt-10 pt-6 border-t border-white/5 text-center">
                    <p className="text-white/20 text-[10px] uppercase tracking-[0.2em] font-bold">Brokergy · Ingeniería Energética</p>
                </footer>
            </div>

            {/* Lightbox "ver en grande" (sin acceso a Drive) */}
            {lightbox && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/95 backdrop-blur-sm p-4 cursor-zoom-out" onClick={() => setLightbox(null)}>
                    <div className="relative w-[88vw] max-w-3xl" onClick={e => e.stopPropagation()}>
                        <div className="relative w-full h-[78vh] rounded-xl overflow-hidden bg-black/40 shadow-2xl flex items-center justify-center">
                            <DriveImg localUrl={lightbox.localUrl} driveId={lightbox.driveId} thumb={lightbox.thumb} size={1600} fit="contain" alt={lightbox.label} />
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-4">
                            <span className="text-white/70 text-sm font-bold">{lightbox.label}</span>
                            <button onClick={() => setLightbox(null)} className="text-white/50 text-xs font-bold uppercase tracking-widest hover:text-white">Cerrar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default SubirDocsReformaView;
