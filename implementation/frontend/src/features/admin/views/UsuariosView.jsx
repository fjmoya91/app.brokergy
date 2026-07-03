import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { TrabajadorDetailModal } from './TrabajadorDetailModal';

// ─────────────────────────────────────────────────────────────────────────────
// Panel de USUARIOS INTERNOS (solo ADMIN).
// Alta y gestión de TRABAJADORES: operan como el ADMIN pero NO ven el margen /
// beneficio de Brokergy y NO pueden borrar.
// ─────────────────────────────────────────────────────────────────────────────
export function UsuariosView() {
    const [usuarios, setUsuarios] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({ nombre: '', apellidos: '', email: '', password: '', nif: '', tlf: '', avatar_url: '' });
    const [selected, setSelected] = useState(null);
    const avatarInputRef = useRef(null);

    const handleAvatarChange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onloadend = () => setForm(f => ({ ...f, avatar_url: reader.result }));
        reader.readAsDataURL(file);
    };

    const load = async () => {
        setLoading(true);
        try {
            const res = await axios.get('/api/usuarios');
            setUsuarios(res.data || []);
            setError(null);
        } catch (e) {
            setError(e.response?.data?.error || 'Error al cargar los usuarios');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const resetForm = () => setForm({ nombre: '', apellidos: '', email: '', password: '', nif: '', tlf: '', avatar_url: '' });

    const handleCreate = async (e) => {
        e.preventDefault();
        setSaving(true);
        setError(null);
        try {
            await axios.post('/api/usuarios', form);
            resetForm();
            setShowForm(false);
            await load();
        } catch (e) {
            setError(e.response?.data?.error || 'Error al crear el trabajador');
        } finally {
            setSaving(false);
        }
    };

    // Cuando el modal actualiza un trabajador (datos o acceso), refrescamos la lista
    // y sincronizamos el trabajador seleccionado para que el modal muestre lo último.
    const handleUpdated = (updated) => {
        if (updated?.id_usuario) {
            setUsuarios(prev => prev.map(u => u.id_usuario === updated.id_usuario ? { ...u, ...updated } : u));
            setSelected(prev => prev && prev.id_usuario === updated.id_usuario ? { ...prev, ...updated } : prev);
        }
        load();
    };

    const roleBadge = (rol) => {
        const isAdmin = rol === 'ADMIN';
        return (
            <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full border ${
                isAdmin ? 'bg-brand/10 text-brand border-brand/20' : 'bg-sky-500/10 text-sky-300 border-sky-500/20'
            }`}>{rol || 'S/R'}</span>
        );
    };

    return (
        <div className="animate-fade-in w-full max-w-[1200px] mx-auto px-6 sm:px-10 py-10 relative z-10">
            <header className="flex flex-wrap items-center justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                        <span className="text-white">Usuarios</span> <span className="text-gradient">internos</span>
                    </h1>
                    <p className="text-white/50 text-sm mt-2 max-w-2xl">
                        Los <strong className="text-white/80">trabajadores</strong> operan igual que un administrador,
                        pero <strong className="text-white/80">no ven el beneficio de Brokergy</strong> ni pueden borrar
                        registros. El borrado y los ajustes globales quedan reservados al administrador.
                    </p>
                </div>
                <button
                    onClick={() => { setShowForm(v => !v); setError(null); }}
                    className="flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-brand to-brand-700 text-bkg-deep font-black text-xs uppercase tracking-widest shadow-lg shadow-brand/20 hover:brightness-110 transition-all"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    Nuevo trabajador
                </button>
            </header>

            {error && (
                <div className="mb-6 bg-red-500/10 border border-red-500/20 rounded-2xl p-4 text-red-300 text-sm">{error}</div>
            )}

            {showForm && (
                <form onSubmit={handleCreate} className="mb-8 bg-bkg-surface border border-white/[0.06] rounded-3xl p-6 shadow-xl">
                    <h2 className="text-white font-black uppercase tracking-widest text-xs mb-5">Alta de trabajador</h2>

                    {/* Foto (opcional) — clic en el círculo para subirla */}
                    <div className="flex items-center gap-4 mb-6">
                        <div
                            onClick={() => avatarInputRef.current?.click()}
                            title="Subir foto"
                            className="w-16 h-16 rounded-full border border-brand/40 overflow-hidden shrink-0 relative group cursor-pointer"
                        >
                            {form.avatar_url ? (
                                <img src={form.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full bg-gradient-to-br from-brand/30 to-brand-700/20 flex items-center justify-center">
                                    <span className="text-brand font-black text-lg">{(form.nombre || '?').charAt(0).toUpperCase()}</span>
                                </div>
                            )}
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-0.5">
                                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                <span className="text-[8px] text-white font-black uppercase tracking-wider">Foto</span>
                            </div>
                        </div>
                        <input ref={avatarInputRef} type="file" accept="image/png,image/jpeg,image/gif,image/svg+xml,image/webp" onChange={handleAvatarChange} className="hidden" />
                        <div className="text-[11px] text-white/40 leading-relaxed">
                            <p className="font-black uppercase tracking-widest text-white/50 mb-0.5">Foto (opcional)</p>
                            Haz clic en el círculo para subir una imagen.{form.avatar_url && <button type="button" onClick={() => setForm(f => ({ ...f, avatar_url: '' }))} className="ml-2 text-red-400/70 hover:text-red-400 font-black uppercase tracking-widest">Quitar</button>}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Field label="Nombre *" value={form.nombre} onChange={v => setForm(f => ({ ...f, nombre: v }))} required />
                        <Field label="Apellidos" value={form.apellidos} onChange={v => setForm(f => ({ ...f, apellidos: v }))} />
                        <Field label="Email *" type="email" value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} required />
                        <Field label="Contraseña * (mín. 6)" type="password" value={form.password} onChange={v => setForm(f => ({ ...f, password: v }))} required />
                        <Field label="NIF/DNI" value={form.nif} onChange={v => setForm(f => ({ ...f, nif: v }))} />
                        <Field label="Teléfono" value={form.tlf} onChange={v => setForm(f => ({ ...f, tlf: v }))} />
                    </div>
                    <div className="flex items-center gap-3 mt-6">
                        <button
                            type="submit"
                            disabled={saving}
                            className="px-5 py-3 rounded-xl bg-gradient-to-r from-brand to-brand-700 text-bkg-deep font-black text-xs uppercase tracking-widest disabled:opacity-50"
                        >
                            {saving ? 'Creando…' : 'Crear trabajador'}
                        </button>
                        <button
                            type="button"
                            onClick={() => { setShowForm(false); resetForm(); setError(null); }}
                            className="px-5 py-3 rounded-xl bg-bkg-hover border border-white/10 text-white/60 font-black text-xs uppercase tracking-widest hover:text-white"
                        >
                            Cancelar
                        </button>
                    </div>
                </form>
            )}

            <div className="bg-bkg-surface border border-white/[0.06] rounded-3xl overflow-hidden shadow-xl">
                {loading ? (
                    <div className="p-10 text-center text-white/40 text-sm">Cargando…</div>
                ) : usuarios.length === 0 ? (
                    <div className="p-10 text-center text-white/40 text-sm">No hay usuarios internos todavía.</div>
                ) : (
                    <table className="w-full text-left">
                        <thead>
                            <tr className="text-[10px] uppercase tracking-widest text-white/40 border-b border-white/[0.06]">
                                <th className="px-5 py-4 font-black">Nombre</th>
                                <th className="px-5 py-4 font-black">Email</th>
                                <th className="px-5 py-4 font-black">Rol</th>
                                <th className="px-5 py-4 font-black">Estado</th>
                                <th className="px-5 py-4 font-black text-right">Acción</th>
                            </tr>
                        </thead>
                        <tbody>
                            {usuarios.map(u => {
                                const isTrab = u.rol_nombre === 'TRABAJADOR';
                                return (
                                <tr
                                    key={u.id_usuario}
                                    onClick={isTrab ? () => setSelected(u) : undefined}
                                    className={`border-b border-white/[0.04] transition-colors ${isTrab ? 'cursor-pointer hover:bg-bkg-hover/50' : ''}`}
                                >
                                    <td className="px-5 py-4 text-white/90 text-sm font-bold">
                                        <div className="flex items-center gap-3">
                                            {u.avatar_url
                                                ? <img src={u.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover border border-white/10 shrink-0" />
                                                : <span className="w-8 h-8 rounded-full bg-gradient-to-br from-brand/30 to-brand-700/20 flex items-center justify-center text-brand font-black text-xs shrink-0">{(u.nombre || u.email || '?').charAt(0).toUpperCase()}</span>}
                                            <span>{[u.nombre, u.apellidos].filter(Boolean).join(' ') || '—'}</span>
                                        </div>
                                    </td>
                                    <td className="px-5 py-4 text-white/60 text-sm">{u.email || '—'}</td>
                                    <td className="px-5 py-4">{roleBadge(u.rol_nombre)}</td>
                                    <td className="px-5 py-4">
                                        <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full border ${
                                            u.activo ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' : 'bg-red-500/10 text-red-300 border-red-500/20'
                                        }`}>{u.activo ? 'Activo' : 'Inactivo'}</span>
                                    </td>
                                    <td className="px-5 py-4 text-right">
                                        {isTrab ? (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setSelected(u); }}
                                                className="px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest border border-brand/20 text-brand hover:bg-brand/10 transition-all"
                                            >
                                                Ver / editar
                                            </button>
                                        ) : (
                                            <span className="text-[10px] text-white/25 uppercase tracking-widest">—</span>
                                        )}
                                    </td>
                                </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            <TrabajadorDetailModal
                isOpen={!!selected}
                trabajador={selected}
                onClose={() => setSelected(null)}
                onUpdated={handleUpdated}
            />
        </div>
    );
}

function Field({ label, value, onChange, type = 'text', required = false }) {
    return (
        <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-black uppercase tracking-widest text-white/40">{label}</span>
            <input
                type={type}
                value={value}
                required={required}
                onChange={e => onChange(e.target.value)}
                className="bg-bkg-elevated border border-white/10 rounded-xl px-4 py-3 text-sm text-white/90 focus:border-brand/50 focus:outline-none transition-colors"
            />
        </label>
    );
}
