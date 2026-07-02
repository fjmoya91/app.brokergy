// TrabajadorDetailModal — Ficha de un TRABAJADOR gestionada por el ADMIN.
// Mismo patrón que PrescriptorDetailModal / AdminProfileModal: vista de lectura +
// edición en línea, foto, cambio de contraseña y toggle de acceso a la app.
// El admin edita a OTRO usuario (PATCH /api/usuarios/:id), no a sí mismo.
import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

function FV({ label, value, lower = false }) {
    if (value == null || value === '' || value === '--' || value === '—') return null;
    return (
        <div className="min-w-0">
            <p className="text-[9.5px] uppercase tracking-[0.16em] font-bold text-white/35 mb-1">{label}</p>
            <p className={['text-[13.5px] leading-snug font-semibold text-white/90', lower ? 'lowercase break-all' : 'uppercase break-words'].join(' ')}>{value}</p>
        </div>
    );
}
function SecIcon({ d }) {
    return <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d={d} /></svg>;
}
function Section({ title, iconPath, children }) {
    return (
        <section className="rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4 sm:px-5 py-4">
            <div className="flex items-center gap-2.5 mb-4">
                {iconPath && <span className="grid place-items-center w-6 h-6 rounded-lg bg-white/[0.04] text-white/45 shrink-0"><SecIcon d={iconPath} /></span>}
                <h3 className="text-[10px] uppercase tracking-[0.18em] font-black text-white/45 whitespace-nowrap">{title}</h3>
                <span className="flex-1 h-px bg-gradient-to-r from-white/[0.08] to-transparent" />
            </div>
            {children}
        </section>
    );
}
function FI({ label, required, children }) {
    return (
        <div>
            <label className="block text-[10px] uppercase tracking-widest font-black text-white/40 mb-1.5">{label}{required && <span className="text-brand ml-0.5">*</span>}</label>
            {children}
        </div>
    );
}
function Inp({ className = '', uppercase = false, onChange, ...props }) {
    const h = uppercase && onChange ? (e) => { e.target.value = e.target.value.toUpperCase(); onChange(e); } : onChange;
    return <input className={`w-full bg-bkg-surface border border-white/[0.08] rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand/40 transition-all ${uppercase ? 'uppercase' : ''} ${className}`} onChange={h} {...props} />;
}

export function TrabajadorDetailModal({ isOpen, trabajador, onClose, onUpdated }) {
    const seed = (t) => ({
        nombre: t?.nombre || '', apellidos: t?.apellidos || '', email: t?.email || '',
        tlf: t?.tlf || '', nif: t?.nif || '', ccaa: t?.ccaa || '', provincia: t?.provincia || '',
        municipio: t?.municipio || '', codigo_postal: t?.codigo_postal || '', direccion: t?.direccion || '',
        avatar_url: t?.avatar_url || '', password: '', confirm_password: '',
    });
    const [form, setForm] = useState(seed(trabajador));
    const [editing, setEditing] = useState(false);
    const [loading, setLoading] = useState(false);
    const [togglingAccess, setTogglingAccess] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState(null);
    const [showPwd, setShowPwd] = useState(false);
    const [showConfirmPwd, setShowConfirmPwd] = useState(false);
    const [activo, setActivo] = useState(!!trabajador?.activo);
    const avatarInputRef = useRef(null);

    useEffect(() => {
        if (!isOpen) return;
        setEditing(false); setSaved(false); setError(null); setShowPwd(false); setShowConfirmPwd(false);
        setForm(seed(trabajador));
        setActivo(!!trabajador?.activo);
    }, [isOpen, trabajador?.id_usuario]);

    if (!isOpen || !trabajador) return null;

    const upd = (patch) => setForm(f => ({ ...f, ...patch }));
    const displayName = [form.nombre, form.apellidos].filter(Boolean).join(' ').toUpperCase() || (trabajador.email || 'TRABAJADOR');
    const avatar = form.avatar_url || '';
    const tieneDireccion = trabajador.ccaa || trabajador.provincia || trabajador.municipio || trabajador.codigo_postal || trabajador.direccion;

    const handleAvatarChange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onloadend = () => upd({ avatar_url: reader.result });
        reader.readAsDataURL(file);
    };

    const handleSave = async () => {
        setError(null);
        if (!form.nombre?.trim()) { setError('El nombre es obligatorio.'); return; }
        if (form.password) {
            if (form.password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres.'); return; }
            if (form.password !== form.confirm_password) { setError('Las contraseñas no coinciden.'); return; }
        }
        setLoading(true);
        try {
            const payload = {
                nombre: form.nombre.trim(), apellidos: form.apellidos.trim() || null,
                email: form.email.trim().toLowerCase() || null, tlf: form.tlf.trim() || null,
                nif: form.nif.trim().toUpperCase() || null, ccaa: form.ccaa.trim() || null,
                provincia: form.provincia.trim() || null, municipio: form.municipio.trim() || null,
                codigo_postal: form.codigo_postal.trim() || null, direccion: form.direccion.trim() || null,
                avatar_url: form.avatar_url || null,
                ...(form.password ? { password: form.password } : {}),
            };
            const { data } = await axios.patch(`/api/usuarios/${trabajador.id_usuario}`, payload);
            setEditing(false); setSaved(true);
            upd({ password: '', confirm_password: '' });
            setTimeout(() => setSaved(false), 3000);
            onUpdated?.(data);
        } catch (err) {
            setError(err.response?.data?.error || 'Error al guardar los cambios');
        } finally {
            setLoading(false);
        }
    };

    const toggleAccess = async () => {
        setTogglingAccess(true); setError(null);
        try {
            const { data } = await axios.patch(`/api/usuarios/${trabajador.id_usuario}/activo`, { activar: !activo });
            setActivo(!!data.activo);
            onUpdated?.({ ...trabajador, ...data });
        } catch (err) {
            setError(err.response?.data?.error || 'Error al cambiar el acceso');
        } finally {
            setTogglingAccess(false);
        }
    };

    const handleCancel = () => { setEditing(false); setError(null); setForm(seed(trabajador)); };

    return (
        <div className="fixed inset-0 z-[300] flex items-start justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in overflow-y-auto">
            <div className="bg-bkg-deep border border-white/[0.08] rounded-2xl w-full max-w-lg my-8 shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between gap-3 flex-wrap p-6 border-b border-white/[0.06]">
                    <div className="flex items-center gap-3 min-w-0">
                        <div
                            onClick={editing ? () => avatarInputRef.current?.click() : undefined}
                            title={editing ? 'Cambiar foto' : undefined}
                            className={`w-14 h-14 rounded-full border overflow-hidden shrink-0 relative group ${editing ? 'cursor-pointer border-brand/40' : 'border-white/10'}`}
                        >
                            {avatar ? (
                                <img src={avatar} alt="avatar" className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full bg-gradient-to-br from-brand/30 to-brand-700/20 flex items-center justify-center">
                                    <span className="text-brand font-black text-base">{displayName.charAt(0)}</span>
                                </div>
                            )}
                            {editing && (
                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-0.5">
                                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                    <span className="text-[8px] text-white font-black uppercase tracking-wider">Foto</span>
                                </div>
                            )}
                        </div>
                        <input ref={avatarInputRef} type="file" accept="image/png,image/jpeg,image/gif,image/svg+xml,image/webp" onChange={handleAvatarChange} className="hidden" />
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <h2 className="text-lg font-black text-white uppercase tracking-wide leading-tight">{displayName}</h2>
                                <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border bg-sky-500/10 text-sky-300 border-sky-500/20">TRABAJADOR</span>
                            </div>
                            <p className="text-[11px] text-white/35 font-semibold mt-0.5 tracking-wide break-all">{trabajador.email}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {saved && <span className="text-xs text-emerald-400 font-black uppercase tracking-widest animate-fade-in">✓ Guardado</span>}
                        {!editing && (
                            <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand/10 border border-brand/20 text-brand text-xs font-black uppercase tracking-widest hover:bg-brand/20 transition-all">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                Editar
                            </button>
                        )}
                        <button onClick={onClose} className="p-2 text-white/30 hover:text-white transition-colors rounded-lg hover:bg-white/5">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                </div>

                {/* Acceso a la app (toggle) */}
                <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-white/[0.06] bg-white/[0.015]">
                    <div>
                        <p className="text-[11px] uppercase tracking-widest font-black text-white/50">Acceso a la app</p>
                        <p className="text-[11px] text-white/35 mt-0.5">
                            {activo ? 'El trabajador puede iniciar sesión.' : 'El trabajador NO puede iniciar sesión.'}
                        </p>
                    </div>
                    <button
                        onClick={toggleAccess}
                        disabled={togglingAccess}
                        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${activo ? 'bg-emerald-500' : 'bg-white/15'}`}
                        title={activo ? 'Desactivar acceso' : 'Activar acceso'}
                    >
                        <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${activo ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    {error && <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">{error}</div>}

                    {!editing && (
                        <div className="space-y-4">
                            <Section title="Datos Personales" iconPath="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                                    <FV label="Nombre" value={trabajador.nombre} />
                                    <FV label="Apellidos" value={trabajador.apellidos} />
                                    <FV label="Email" value={trabajador.email} lower />
                                    <FV label="Teléfono" value={trabajador.tlf} />
                                    <FV label="NIF / DNI" value={trabajador.nif} />
                                </div>
                            </Section>
                            {tieneDireccion && (
                                <Section title="Dirección" iconPath="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                                        <FV label="CCAA" value={trabajador.ccaa} />
                                        <FV label="Provincia" value={trabajador.provincia} />
                                        <FV label="Municipio" value={trabajador.municipio} />
                                        <FV label="CP" value={trabajador.codigo_postal} />
                                        {trabajador.direccion && <div className="col-span-1 sm:col-span-2"><FV label="Dirección" value={trabajador.direccion} /></div>}
                                    </div>
                                </Section>
                            )}
                        </div>
                    )}

                    {editing && (
                        <div className="space-y-6">
                            <Section title="Datos Personales" iconPath="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <FI label="Nombre" required><Inp value={form.nombre} onChange={e => upd({ nombre: e.target.value })} /></FI>
                                    <FI label="Apellidos"><Inp value={form.apellidos} onChange={e => upd({ apellidos: e.target.value })} /></FI>
                                    <FI label="Email"><Inp type="email" value={form.email} onChange={e => upd({ email: e.target.value })} /></FI>
                                    <FI label="Teléfono"><Inp value={form.tlf} onChange={e => upd({ tlf: e.target.value })} /></FI>
                                    <FI label="NIF / DNI"><Inp uppercase value={form.nif} onChange={e => upd({ nif: e.target.value })} /></FI>
                                </div>
                                <p className="text-[10px] text-white/30 mt-3 leading-relaxed">Cambiar el email modifica también el correo de acceso del trabajador.</p>
                            </Section>

                            <Section title="Dirección" iconPath="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <FI label="CCAA"><Inp value={form.ccaa} onChange={e => upd({ ccaa: e.target.value })} /></FI>
                                    <FI label="Provincia"><Inp value={form.provincia} onChange={e => upd({ provincia: e.target.value })} /></FI>
                                    <FI label="Municipio"><Inp value={form.municipio} onChange={e => upd({ municipio: e.target.value })} /></FI>
                                    <FI label="Código Postal"><Inp value={form.codigo_postal} maxLength={5} onChange={e => upd({ codigo_postal: e.target.value })} /></FI>
                                    <div className="sm:col-span-2"><FI label="Dirección"><Inp uppercase value={form.direccion} onChange={e => upd({ direccion: e.target.value })} /></FI></div>
                                </div>
                            </Section>

                            <Section title="Seguridad" iconPath="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <FI label="Nueva contraseña">
                                        <div className="relative">
                                            <Inp type={showPwd ? 'text' : 'password'} value={form.password} placeholder="Mínimo 6 caracteres" autoComplete="new-password" onChange={e => upd({ password: e.target.value })} className="pr-10" />
                                            <button type="button" onClick={() => setShowPwd(s => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-white/30 hover:text-white/70">{showPwd ? '🙈' : '👁'}</button>
                                        </div>
                                    </FI>
                                    <FI label="Repetir contraseña">
                                        <div className="relative">
                                            <Inp type={showConfirmPwd ? 'text' : 'password'} value={form.confirm_password} placeholder="Repite la contraseña" autoComplete="new-password" onChange={e => upd({ confirm_password: e.target.value })} className="pr-10" />
                                            <button type="button" onClick={() => setShowConfirmPwd(s => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-white/30 hover:text-white/70">{showConfirmPwd ? '🙈' : '👁'}</button>
                                        </div>
                                    </FI>
                                </div>
                                <p className="text-[10px] text-white/30 mt-3 leading-relaxed">Déjalo en blanco si no quieres cambiar la contraseña.</p>
                            </Section>

                            <div className="flex items-center justify-end gap-2 pt-1">
                                <button onClick={handleCancel} disabled={loading} className="px-4 py-2.5 rounded-xl border border-white/10 text-white/60 text-xs font-black uppercase tracking-widest hover:bg-white/5 hover:text-white transition-all disabled:opacity-50">Cancelar</button>
                                <button onClick={handleSave} disabled={loading} className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand to-brand-700 text-bkg-deep text-xs font-black uppercase tracking-widest shadow-lg shadow-brand/20 hover:opacity-90 transition-all disabled:opacity-50">{loading ? 'Guardando...' : 'Guardar cambios'}</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
