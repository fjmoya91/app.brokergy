import React, { useState, useEffect } from 'react';
import axios from 'axios';

export function AerotermiaMarcaModal({ isOpen, onClose, onUpdated, initialBrandName }) {
    const [marcas, setMarcas] = useState([]);
    const [loading, setLoading] = useState(false);
    const [editing, setEditing] = useState(null); // { nombre, logo, descripcion }
    const [newNombre, setNewNombre] = useState('');
    const [newLogo, setNewLogo] = useState('');
    const [saving, setSaving] = useState(false);

    const fetchMarcas = async () => {
        setLoading(true);
        try {
            const res = await axios.get('/api/aerotermia/marcas');
            setMarcas(res.data);
            return res.data;
        } catch (err) {
            console.error('Error fetching marcas:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            fetchMarcas().then((data) => {
                if (initialBrandName && data) {
                    const found = data.find(m => m.nombre === initialBrandName.toUpperCase());
                    if (found) {
                        setNewNombre(found.nombre);
                        setNewLogo(found.logo);
                    }
                }
            });
        } else {
            // Reset al cerrar
            setNewNombre('');
            setNewLogo('');
        }
    }, [isOpen, initialBrandName]);

    const handleSave = async (payload) => {
        setSaving(true);
        try {
            const res = await axios.post('/api/aerotermia/marcas', payload);
            if (onUpdated) onUpdated(res.data);
            fetchMarcas();
            setEditing(null);
            setNewNombre('');
            setNewLogo('');
        } catch (err) {
            console.error('Error saving marca:', err);
            alert('Error al guardar la marca');
        } finally {
            setSaving(false);
        }
    };

    const handleFileChange = (e, callback) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onloadend = () => callback(reader.result);
        reader.readAsDataURL(file);
    };

    const handleDelete = async (nombre) => {
        if (!window.confirm(`¿Eliminar la marca ${nombre}?`)) return;
        try {
            await axios.delete(`/api/aerotermia/marcas/${nombre}`);
            fetchMarcas();
        } catch (err) {
            console.error('Error deleting marca:', err);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
            <div className="bg-bkg-deep border border-white/[0.08] rounded-[2rem] max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden relative">
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-brand/40 to-transparent"></div>
                
                {/* Header */}
                <div className="p-8 pb-4 flex items-center justify-between">
                    <div>
                        <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Gestionar Marcas</h2>
                        <p className="text-[10px] text-sky-400 font-bold uppercase tracking-widest mt-1">Sincroniza logotipos e identidades</p>
                    </div>
                    <button onClick={onClose} className="p-2 text-white/20 hover:text-white transition-colors">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor font-bold">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-8 pt-4 custom-scrollbar">
                    {/* Nueva Marca Form */}
                    <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6 mb-8">
                        <h3 className="text-xs font-black text-white/40 uppercase tracking-widest mb-4">Nueva Marca o Actualizar Existente</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                            <div>
                                <label className="block text-[10px] text-white/30 uppercase font-black mb-1.5 ml-1">Nombre</label>
                                <input 
                                    type="text" 
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-brand/40"
                                    placeholder="EJ: DAIKIN"
                                    value={newNombre}
                                    onChange={e => setNewNombre(e.target.value.toUpperCase())}
                                />
                            </div>
                            <div className="flex gap-2">
                                <div className="flex-1">
                                    <label className="block text-[10px] text-white/30 uppercase font-black mb-1.5 ml-1">Logo (Archivo)</label>
                                    <input 
                                        type="file" 
                                        accept="image/*"
                                        className="hidden" 
                                        id="logo-upload" 
                                        onChange={e => handleFileChange(e, setNewLogo)}
                                    />
                                    <label htmlFor="logo-upload" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white/60 text-xs cursor-pointer hover:bg-white/10 transition-all flex items-center gap-2">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                        </svg>
                                        Subir Logo
                                    </label>
                                </div>
                                {newLogo && (
                                    <div className="w-10 h-10 rounded-lg bg-white overflow-hidden p-1 shrink-0">
                                        <img src={newLogo} className="w-full h-full object-contain" />
                                    </div>
                                )}
                            </div>
                        </div>
                        <button 
                            disabled={!newNombre || saving}
                            onClick={() => handleSave({ nombre: newNombre, logo: newLogo })}
                            className="w-full mt-4 py-3 bg-brand/10 border border-brand/20 text-brand font-black text-[11px] uppercase tracking-[0.2em] rounded-xl hover:bg-brand/20 transition-all disabled:opacity-30"
                        >
                            {saving ? 'Guardando...' : 'Guardar Marca'}
                        </button>
                    </div>

                    {/* Lista de Marcas */}
                    <div className="space-y-3">
                        <h3 className="text-xs font-black text-white/40 uppercase tracking-widest mb-4">Marcas Configuradas</h3>
                        {loading ? (
                            <div className="py-10 text-center text-white/20 text-xs uppercase tracking-widest font-black">Cargando marcas...</div>
                        ) : marcas.length === 0 ? (
                            <div className="py-10 text-center text-white/10 text-xs italic">No hay marcas configuradas aún</div>
                        ) : marcas.map(m => (
                            <div key={m.nombre} className="group flex items-center gap-4 bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4 hover:border-white/10 transition-all">
                                <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center p-2 shadow-inner shrink-0">
                                    {m.logo ? (
                                        <img src={m.logo} alt={m.nombre} className="w-full h-full object-contain" />
                                    ) : (
                                        <span className="text-black/20 font-black text-xl">{m.nombre.charAt(0)}</span>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className="text-white font-black text-sm uppercase tracking-tight">{m.nombre}</h4>
                                    <p className="text-[9px] text-white/20 uppercase tracking-widest">Registrada en el sistema</p>
                                </div>
                                <div className="flex gap-2">
                                    <button 
                                        onClick={() => { setNewNombre(m.nombre); setNewLogo(m.logo); }}
                                        className="p-2 rounded-lg text-white/10 hover:text-sky-400 hover:bg-sky-500/10 transition-all"
                                        title="Editar"
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                        </svg>
                                    </button>
                                    <button 
                                        onClick={() => handleDelete(m.nombre)}
                                        className="p-2 rounded-lg text-white/10 hover:text-red-400 hover:bg-red-500/10 transition-all"
                                        title="Eliminar"
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="p-8 pt-4">
                    <button onClick={onClose} className="w-full py-4 rounded-2xl border border-white/10 text-white/40 hover:text-white transition-all text-sm font-bold">
                        Cerrar Ventana
                    </button>
                </div>
            </div>
        </div>
    );
}
