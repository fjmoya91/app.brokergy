// Prescriptores Management View - Updated 2026-03-15
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { supabase } from '../../../services/supabaseClient';
import { useAuth } from '../../../context/AuthContext';

// --- Constantes de Localización ---
const CCAA_PROVINCIAS = {
    "Andalucía": ["Almería", "Cádiz", "Córdoba", "Granada", "Huelva", "Jaén", "Málaga", "Sevilla"],
    "Aragón": ["Huesca", "Teruel", "Zaragoza"],
    "Asturias": ["Asturias"],
    "Baleares": ["Baleares"],
    "Canarias": ["Las Palmas", "Santa Cruz de Tenerife"],
    "Cantabria": ["Cantabria"],
    "Castilla-La Mancha": ["Albacete", "Ciudad Real", "Cuenca", "Guadalajara", "Toledo"],
    "Castilla y León": ["Ávila", "Burgos", "León", "Palencia", "Salamanca", "Segovia", "Soria", "Valladolid", "Zamora"],
    "Cataluña": ["Barcelona", "Gerona", "Lérida", "Tarragona"],
    "Extremadura": ["Badajoz", "Cáceres"],
    "Galicia": ["La Coruña", "Lugo", "Orense", "Pontevedra"],
    "Madrid": ["Madrid"],
    "Murcia": ["Murcia"],
    "Navarra": ["Navarra"],
    "País Vasco": ["Álava", "Guipúzcoa", "Vizcaya"],
    "La Rioja": ["La Rioja"],
    "Ceuta": ["Ceuta"],
    "Melilla": ["Melilla"]
};

export function PrescriptoresList() {
    const { user, refreshProfile } = useAuth();
    const [prescriptores, setPrescriptores] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Form stuff
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [availableMunicipios, setAvailableMunicipios] = useState([]);
    
    const [formData, setFormData] = useState({
        es_autonomo: false,
        nuevo_usuario: true, // Por defecto crearemos el usuario para el super formulario
        // Datos Empresa
        razon_social: '',
        acronimo: '',
        cif: '',
        email: '',
        tlf: '',
        ccaa: '',
        provincia: '',
        municipio: '',
        direccion: '',
        codigo_postal: '',
        tipo_empresa: 'DISTRIBUIDOR',
        marca_referencia: '',
        marca_secundaria: '',
        tiene_carnet_rite: false,
        numero_carnet_rite: '',
        cargo: 'REPRESENTANTE LEGAL',
        logo_empresa: '', // base64
        // Datos Usuario (Si nuevo_usuario)
        usuario_nombre: '',
        usuario_apellidos: '',
        usuario_email: '',
        usuario_password: '', // temporal, luego pueden recuperar clave
        usuario_nif: '',
        usuario_tlf: '',
        usuario_confirm_password: ''
    });

    const [availableProvinces, setAvailableProvinces] = useState([]);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        fetchData();
    }, []);

    // Actualizar provincias cuando cambie la CCAA
    useEffect(() => {
        if (formData.ccaa) {
            setAvailableProvinces(CCAA_PROVINCIAS[formData.ccaa] || []);
            // Si la provincia actual no está en la nueva lista, la limpiamos
            if (!CCAA_PROVINCIAS[formData.ccaa]?.includes(formData.provincia)) {
                setFormData(prev => ({ ...prev, provincia: '', municipio: '' }));
            }
        } else {
            setAvailableProvinces([]);
            setFormData(prev => ({ ...prev, provincia: '', municipio: '' }));
        }
    }, [formData.ccaa]);

    // Actualizar municipios cuando cambie la provincia
    useEffect(() => {
        if (formData.provincia) {
            axios.get(`/api/catastro/municipios?provincia=${encodeURIComponent(formData.provincia)}`)
                .then(res => setAvailableMunicipios(res.data))
                .catch(err => console.error('Error fetching municipios:', err));
        } else {
            setAvailableMunicipios([]);
        }
    }, [formData.provincia]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await axios.get('/api/prescriptores');
            setPrescriptores(res.data);
            setError(null);
        } catch (err) {
            console.error(err);
            setError('Error al cargar la lista de prescriptores.');
        } finally {
            setLoading(false);
        }
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setFormData(prev => ({ ...prev, logo_empresa: reader.result }));
            };
            reader.readAsDataURL(file);
        }
    };

    const handleEdit = (p) => {
        setEditingId(p.id_empresa);
        setFormData({
            es_autonomo: p.es_autonomo || false,
            nuevo_usuario: false, // En edición, no tocamos usuario base
            razon_social: p.razon_social || '',
            acronimo: p.acronimo || '',
            cif: p.cif || '',
            email: p.email || '',
            tlf: p.tlf || '',
            ccaa: p.ccaa || '',
            provincia: p.provincia || '',
            municipio: p.municipio || '',
            direccion: p.direccion || '',
            codigo_postal: p.codigo_postal || '',
            tipo_empresa: p.tipo_empresa || 'DISTRIBUIDOR',
            marca_referencia: p.marca_referencia || '',
            marca_secundaria: p.marca_secundaria || '',
            tiene_carnet_rite: p.tiene_carnet_rite || false,
            numero_carnet_rite: p.numero_carnet_rite || '',
            cargo: p.cargo || 'REPRESENTANTE LEGAL',
            logo_empresa: p.logo_empresa || '',
            
            // Info solo-lectura
            usuario_nombre: p.usuarios?.nombre || '',
            usuario_apellidos: p.usuarios?.apellidos || '',
            usuario_email: p.usuarios?.email || '',
            usuario_nif: p.usuarios?.nif || '',
            usuario_password: '', // Vacío para indicar que se puede cambiar
            usuario_confirm_password: '',
            usuario_tlf: p.usuarios?.tlf || p.tlf || ''
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
        setShowForm(true);
    };

    const handleNew = () => {
        setEditingId(null);
        setFormData({
            es_autonomo: false, nuevo_usuario: true,
            razon_social: '',
            acronimo: '',
            cif: '', email: '', tlf: '', ccaa: '', provincia: '',
            municipio: '', direccion: '', codigo_postal: '', tipo_empresa: 'DISTRIBUIDOR',
            marca_referencia: '', marca_secundaria: '', tiene_carnet_rite: false,
            numero_carnet_rite: '', cargo: 'REPRESENTANTE LEGAL', logo_empresa: '',
            usuario_nombre: '', usuario_apellidos: '', usuario_email: '', usuario_password: '',
            usuario_nif: '', usuario_tlf: '', usuario_confirm_password: ''
        });
        setShowForm(!showForm);
    };

    const [deleting, setDeleting] = useState(false);
    const [modalConfig, setModalConfig] = useState({
        show: false,
        title: '',
        message: '',
        type: 'confirm',
        onConfirm: null,
        confirmLabel: 'Aceptar',
        cancelLabel: 'Cancelar'
    });

    const handleDelete = async (id, e) => {
        if (e) e.stopPropagation();
        
        const pres = prescriptores.find(p => p.id_empresa === id);
        const name = pres?.acronimo || pres?.razon_social || 'esta entidad';

        setModalConfig({
            show: true,
            type: 'confirm',
            title: '⚠️ ¿ELIMINAR PERMANENTEMENTE?',
            message: `Vas a borrar a "${name.toUpperCase()}". Esta acción eliminará la empresa, su usuario de acceso y no se podrá deshacer.`,
            confirmLabel: 'SÍ, ELIMINAR',
            cancelLabel: 'CANCELAR',
            onConfirm: async () => {
                setDeleting(true);
                setModalConfig(prev => ({ ...prev, show: false }));
                try {
                    await axios.delete(`/api/prescriptores/${id}`);
                    setShowForm(false);
                    setEditingId(null);
                    fetchData();
                    
                    // Mostrar éxito tras borrar
                    setModalConfig({
                        show: true,
                        type: 'success',
                        title: 'ELIMINADO',
                        message: 'La entidad ha sido borrada correctamente.',
                        confirmLabel: 'ENTENDIDO',
                        onConfirm: () => setModalConfig(prev => ({ ...prev, show: false }))
                    });
                } catch (err) {
                    console.error(err);
                    setError(err.response?.data?.error || 'Error al eliminar el prescriptor.');
                } finally {
                    setDeleting(false);
                }
            }
        });
    };

    const handleSave = async (e) => {
        e.preventDefault();

        // Validación de contraseña
        if (formData.usuario_password || !editingId) {
            if (formData.usuario_password !== formData.usuario_confirm_password) {
                setError('Las contraseñas no coinciden.');
                return;
            }
            if (!editingId && formData.usuario_password.length < 6) {
                setError('La contraseña debe tener al menos 6 caracteres.');
                return;
            }
        }

        setSaving(true);
        setError(null);
        console.log('Guardando partner:', { ...formData, logo_empresa: formData.logo_empresa ? `SI (${formData.logo_empresa.length} chars)` : 'NO' });
        try {
            if (editingId) {
                // Actualizar entidad existente
                await axios.patch(`/api/prescriptores/${editingId}`, formData);
                setModalConfig({
                    show: true,
                    type: 'success',
                    title: '✅ ACTUALIZADO',
                    message: 'La información de la entidad ha sido actualizada correctamente.',
                    confirmLabel: 'ENTENDIDO',
                    onConfirm: () => setModalConfig(prev => ({ ...prev, show: false }))
                });
            } else {
                // El payload va al nuevo endpoint avanzado
                await axios.post('/api/prescriptores/avanzado', formData);
                setModalConfig({
                    show: true,
                    type: 'success',
                    title: '✅ ALTA CORRECTA',
                    message: 'El nuevo partner y su usuario han sido creados correctamente.',
                    confirmLabel: 'ENTENDIDO',
                    onConfirm: () => setModalConfig(prev => ({ ...prev, show: false }))
                });
            }
            setShowForm(false);
            setEditingId(null);
            fetchData();
            // Si el usuario editado es el mismo que está logueado, refrescamos su perfil global
            if (editingId === user?.prescriptor_id || !editingId) {
                refreshProfile();
            }
            // Reset form
            setFormData({
                es_autonomo: false, nuevo_usuario: true,
                razon_social: '', acronimo: '', cif: '', email: '', tlf: '', ccaa: '',
                municipio: '', direccion: '', codigo_postal: '', tipo_empresa: 'DISTRIBUIDOR',
                marca_referencia: '', marca_secundaria: '', tiene_carnet_rite: false,
                numero_carnet_rite: '', cargo: 'REPRESENTANTE LEGAL', logo_empresa: '',
                usuario_nombre: '', usuario_apellidos: '', usuario_email: '', usuario_password: '',
                usuario_nif: '', usuario_tlf: '', usuario_confirm_password: ''
            });
        } catch (err) {
            console.error(err);
            setError(err.response?.data?.error || `Error al ${editingId ? 'actualizar' : 'crear'} el prescriptor.`);
        } finally {
            setSaving(false);
        }
    };

    // Filter logic
    const [searchTerm, setSearchTerm] = useState('');
    const [searchCIF, setSearchCIF] = useState('');

    const filteredPrescriptores = prescriptores.filter(p => {
        const displayName = (p.acronimo || p.razon_social || '').toLowerCase();
        const matchesName = displayName.includes(searchTerm.toLowerCase());
        const matchesCIF = (p.cif || '').toLowerCase().includes(searchCIF.toLowerCase());
        return matchesName && matchesCIF;
    });

    const stats = {
        total: prescriptores.length,
        distribuidores: prescriptores.filter(p => p.tipo_empresa === 'DISTRIBUIDOR').length,
        instaladores: prescriptores.filter(p => p.tipo_empresa === 'INSTALADOR').length,
        certificadores: prescriptores.filter(p => p.tipo_empresa === 'CERTIFICADOR').length,
        conRite: prescriptores.filter(p => p.tiene_carnet_rite).length
    };

    return (
        <div className="animate-fade-in w-full text-white pt-10 pb-20 px-2 md:px-6">
            <header className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-2xl md:text-3xl font-black flex items-center gap-4 text-white tracking-tight">
                        <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                            <svg className="w-6 h-6 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                        </div>
                        Gestión de Prescriptores
                    </h2>
                    <p className="text-white/40 text-xs mt-2 ml-16 font-medium uppercase tracking-widest">Panel de control de entidades colaboradoras y partners B2B</p>
                </div>
                {user?.rol === 'ADMIN' && !showForm && (
                    <button 
                         onClick={handleNew}
                         className="px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black font-black uppercase tracking-widest text-[10px] rounded-2xl shadow-xl shadow-amber-500/20 transition-all flex items-center gap-2 active:scale-95 whitespace-nowrap"
                    >
                         <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
                         </svg>
                         NUEVO PARTNER
                    </button>
                )}
            </header>

            {/* Stats Overview */}
            {!showForm && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    {[
                        { label: 'Total Partners', value: stats.total, color: 'text-white', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857' },
                        { label: 'Distribuidores', value: stats.distribuidores, color: 'text-amber-500', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
                        { label: 'Instaladores', value: stats.instaladores, color: 'text-cyan-400', icon: 'M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 11-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 011-1h1a2 2 0 100-4H7a1 1 0 01-1-1V7a1 1 0 011-1h3a1 1 0 001-1V4z' },
                        { label: 'Certificadores', value: stats.certificadores, color: 'text-emerald-400', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' }
                    ].map((s, i) => (
                        <div key={i} className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4 hover:border-white/10 transition-all group">
                            <div className="flex items-center justify-between mb-2">
                                <div className={`w-8 h-8 rounded-lg ${s.color.replace('text-', 'bg-')}/10 flex items-center justify-center transition-all group-hover:scale-110`}>
                                    <svg className={`w-4 h-4 ${s.color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={s.icon} />
                                    </svg>
                                </div>
                                <span className={`text-xl font-black ${s.color}`}>{s.value}</span>
                            </div>
                            <span className="text-[10px] uppercase font-bold text-white/30 tracking-widest">{s.label}</span>
                        </div>
                    ))}
                </div>
            )}



            {error && <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl mb-6 text-sm flex items-center gap-2"><svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>{error}</div>}

            {showForm && (
                <div className="p-6 bg-bkg-surface shadow-2xl shadow-black/50 border border-brand/20 rounded-2xl mb-8 animate-slide-down relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-brand to-brand-700"></div>
                     
                    <form onSubmit={handleSave} className="relative">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                             <h3 className="text-xl font-black text-brand flex items-center gap-2">
                                 <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
                                 {editingId ? 'Edición de Entidad y Representante' : 'Alta de Nuevo Partner B2B'}
                             </h3>
                             <div className="flex items-center gap-3">
                                    <button 
                                        type="button" 
                                        onClick={() => setShowForm(false)} 
                                        className="px-6 py-3 bg-white/[0.05] border border-white/10 hover:bg-white/[0.08] text-white font-black uppercase tracking-widest text-[10px] rounded-xl transition-all"
                                        disabled={saving || deleting}
                                    >
                                        DESCARTAR
                                    </button>
                                    
                                    {editingId && (
                                        <button 
                                            type="button" 
                                            onClick={() => handleDelete(editingId)} 
                                            className="p-3 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-red-500 rounded-xl transition-all group"
                                            title="Eliminar partner permanentemente"
                                            disabled={saving || deleting}
                                        >
                                            {deleting ? (
                                                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                            ) : (
                                                <svg className="w-5 h-5 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                            )}
                                        </button>
                                    )}
                                <button 
                                    type="submit" 
                                    disabled={saving} 
                                    className="px-6 py-3 bg-gradient-to-r from-brand to-brand-700 hover:from-brand-400 hover:to-brand-600 text-bkg-deep font-black uppercase tracking-widest text-[10px] rounded-xl shadow-lg shadow-brand/20 transition-all flex items-center gap-2 active:scale-95 whitespace-nowrap"
                                >
                                    {saving ? (
                                        <><svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> GUARDANDO... </>
                                    ) : editingId ? (
                                        <>ACTUALIZAR ENTIDAD</>
                                    ) : (
                                        <>PROCEDER ALTA</>
                                    )}
                                </button>
                             </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        
                        {/* 1. SWITCH PRINCIPAL Y DATOS BÁSICOS CONTACTO */}
                        <div className="lg:col-span-3 grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* Toggle Autónomo */}
                            <div className="p-4 bg-white/[0.03] border border-white/10 rounded-2xl hover:bg-white/[0.05] transition-colors flex items-center h-full">
                                <label className="flex items-center gap-4 cursor-pointer w-full">
                                    <div className="relative h-6 w-11 shrink-0">
                                        <input 
                                            type="checkbox" id="es_autonomo" 
                                            checked={formData.es_autonomo}
                                            onChange={(e) => setFormData({...formData, es_autonomo: e.target.checked})}
                                            className="sr-only peer"
                                        />
                                        <div className="w-full h-full bg-white/10 border border-white/5 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-brand/50 rounded-full peer peer-checked:after:translate-x-[20px] after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand shadow-inner"></div>
                                    </div>
                                    <div>
                                        <span className="font-black text-white text-xs uppercase tracking-wider block">Es Trabajador Autónomo</span>
                                        <span className="text-[10px] text-white/30 block mt-0.5 font-medium">Marcas esta opción si no actúas como empresa / sociedad</span>
                                    </div>
                                </label>
                            </div>

                            {/* Email Único (Acceso y Contacto) */}
                            <div className="lg:col-span-1">
                                <label className="block text-[10px] uppercase font-black text-white/40 mb-2 ml-1 tracking-widest">Email (Acceso y Contacto) <span className="text-brand">*</span></label>
                                <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                                    </span>
                                    <input 
                                        required type="email" 
                                        value={formData.usuario_email} 
                                        onChange={e => {
                                            const val = e.target.value;
                                            setFormData(prev => ({ ...prev, usuario_email: val, email: val }));
                                        }} 
                                        className="w-full bg-bkg-deep border border-white/10 rounded-xl pl-11 pr-4 py-3 text-sm focus:border-brand focus:bg-bkg-elevated outline-none transition-all placeholder:text-white/10"
                                        placeholder="ejemplo@entidad.com"
                                    />
                                </div>
                            </div>

                            {/* Teléfono Único */}
                            <div className="lg:col-span-1">
                                <label className="block text-[10px] uppercase font-black text-white/40 mb-2 ml-1 tracking-widest">Teléfono Directo</label>
                                <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                                    </span>
                                    <input 
                                        type="text" 
                                        value={formData.usuario_tlf} 
                                        onChange={e => {
                                            const val = e.target.value;
                                            setFormData(prev => ({ ...prev, usuario_tlf: val, tlf: val }));
                                        }} 
                                        className="w-full bg-bkg-deep border border-white/10 rounded-xl pl-11 pr-4 py-3 text-sm focus:border-brand focus:bg-bkg-elevated outline-none transition-all placeholder:text-white/10" 
                                        placeholder="+34 600 000 000"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* 2. DATOS DE ENTIDAD O PROFESIONAL */}
                        <div className="lg:col-span-3 p-6 bg-bkg-base/50 border border-white/5 rounded-2xl">
                             <h4 className="text-xs uppercase tracking-[0.2em] text-brand font-black mb-6 flex items-center gap-3">
                                <span className="w-2 h-2 rounded-full bg-brand shadow-[0_0_10px_rgba(255,160,0,0.5)]"></span> 
                                {formData.es_autonomo ? 'Identidad del Profesional Autónomo' : 'Información Mercantil de la Entidad'}
                             </h4>
                             
                             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                {formData.es_autonomo ? (
                                    <>
                                        <div className="lg:col-span-1">
                                            <label className="block text-[10px] uppercase font-black text-white/50 mb-2 ml-1 tracking-widest">Nombre <span className="text-brand">*</span></label>
                                            <input required type="text" value={formData.usuario_nombre} onChange={e => setFormData({...formData, usuario_nombre: e.target.value})} className="w-full bg-bkg-deep border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-brand focus:bg-bkg-elevated outline-none transition-all uppercase" placeholder="JUAN"/>
                                        </div>
                                        <div className="lg:col-span-2">
                                            <label className="block text-[10px] uppercase font-black text-white/50 mb-2 ml-1 tracking-widest">Apellidos <span className="text-brand">*</span></label>
                                            <input required type="text" value={formData.usuario_apellidos} onChange={e => setFormData({...formData, usuario_apellidos: e.target.value})} className="w-full bg-bkg-deep border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-brand focus:bg-bkg-elevated outline-none transition-all uppercase" placeholder="PÉREZ GARCÍA"/>
                                        </div>
                                        <div className="lg:col-span-1">
                                            <label className="block text-[10px] uppercase font-black text-white/50 mb-2 ml-1 tracking-widest">DNI / NIE <span className="text-brand">*</span></label>
                                            <input required type="text" value={formData.usuario_nif} onChange={e => setFormData({...formData, usuario_nif: e.target.value})} className="w-full bg-bkg-deep border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-brand focus:bg-bkg-elevated outline-none transition-all uppercase font-mono" placeholder="12345678Z"/>
                                        </div>

                                    </>
                                ) : (
                                    <>
                                        <div className="lg:col-span-2">
                                            <label className="block text-[10px] uppercase font-black text-white/50 mb-2 ml-1 tracking-widest">Razón Social <span className="text-brand">*</span></label>
                                            <input required type="text" value={formData.razon_social} onChange={e => setFormData({...formData, razon_social: e.target.value})} className="w-full bg-bkg-deep border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-brand focus:bg-bkg-elevated outline-none transition-all uppercase" placeholder="EMPRESA SL"/>
                                        </div>
                                        <div className="lg:col-span-1">
                                            <label className="block text-[10px] uppercase font-black text-white/50 mb-2 ml-1 tracking-widest">Acrónimo / Marca</label>
                                            <input type="text" value={formData.acronimo} onChange={e => setFormData({...formData, acronimo: e.target.value})} className="w-full bg-bkg-deep border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-brand focus:bg-bkg-elevated outline-none transition-all uppercase" placeholder="MARCA"/>
                                        </div>
                                        <div className="lg:col-span-1">
                                            <label className="block text-[10px] uppercase font-black text-white/50 mb-2 ml-1 tracking-widest">CIF Entidad <span className="text-brand">*</span></label>
                                            <input required type="text" value={formData.cif} onChange={e => setFormData({...formData, cif: e.target.value})} className="w-full bg-bkg-deep border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-brand focus:bg-bkg-elevated outline-none transition-all uppercase" placeholder="B12345678"/>
                                        </div>
                                    </>
                                )}
                             </div>
                        </div>

                        {/* 3. PERSONA REPRESENTANTE (Solo si NO es autónomo) */}
                        {!formData.es_autonomo && (
                            <div className="lg:col-span-3 p-6 bg-bkg-base/50 border border-white/5 rounded-2xl">
                                <h4 className="text-xs uppercase tracking-[0.2em] text-brand font-black mb-6 flex items-center gap-3">
                                    <span className="w-2 h-2 rounded-full bg-brand shadow-[0_0_10px_rgba(255,160,0,0.5)]"></span> 
                                    Persona de Contacto / Representante
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                    <div>
                                        <label className="block text-[10px] uppercase font-black text-white/50 mb-2 ml-1 tracking-widest">Nombre <span className="text-brand">*</span></label>
                                        <input required type="text" value={formData.usuario_nombre} onChange={e => setFormData({...formData, usuario_nombre: e.target.value})} className="w-full bg-bkg-deep border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-brand focus:bg-bkg-elevated outline-none transition-all uppercase" placeholder="PEDRO"/>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] uppercase font-black text-white/50 mb-2 ml-1 tracking-widest">Apellidos</label>
                                        <input type="text" value={formData.usuario_apellidos} onChange={e => setFormData({...formData, usuario_apellidos: e.target.value})} className="w-full bg-bkg-deep border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-brand focus:bg-bkg-elevated outline-none transition-all uppercase" placeholder="GONZÁLEZ"/>
                                    </div>
                                    <div className="lg:col-span-2">
                                        <label className="block text-[10px] uppercase font-black text-white/50 mb-2 ml-1 tracking-widest">Cargo en la Entidad</label>
                                        <input type="text" value={formData.cargo} onChange={e => setFormData({...formData, cargo: e.target.value})} className="w-full bg-bkg-deep border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-brand focus:bg-bkg-elevated outline-none transition-all uppercase" placeholder="GERENTE / PROPIETARIO"/>
                                    </div>

                                </div>
                            </div>
                        )}

                        {/* 4. SEGURIDAD Y ACCESO */}
                        <div className="lg:col-span-3 p-6 bg-brand/[0.02] border border-brand/10 rounded-2xl">
                             <h4 className="text-xs uppercase tracking-[0.2em] text-brand font-black mb-6 flex items-center gap-3">
                                <span className="w-2 h-2 rounded-full bg-brand shadow-[0_0_10px_rgba(255,160,0,0.5)]"></span> 
                                Seguridad y Acceso al Portal
                             </h4>
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-[10px] uppercase font-black text-white/40 mb-2 ml-1 tracking-widest">
                                        {editingId ? 'Nueva Contraseña (opcional)' : <><span className="text-brand">*</span> Contraseña de Acceso</>}
                                    </label>
                                    <div className="relative">
                                        <input 
                                            required={!editingId} 
                                            type={formData.show_password ? "text" : "password"} 
                                            value={formData.usuario_password} 
                                            onChange={e => setFormData({...formData, usuario_password: e.target.value})} 
                                            className="w-full bg-bkg-deep border border-brand/20 rounded-xl px-4 py-3 text-sm focus:border-brand focus:bg-bkg-elevated outline-none transition-all font-mono text-brand placeholder:text-brand/10" 
                                            placeholder={editingId ? "Dejar en blanco para no cambiar" : "••••••••"}
                                        />
                                        <button 
                                            type="button"
                                            onClick={() => setFormData(prev => ({ ...prev, show_password: !prev.show_password }))}
                                            className="absolute right-4 top-1/2 -translate-y-1/2 text-amber-500/30 hover:text-amber-500 transition-colors"
                                        >
                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                {formData.show_password ? (
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.888 9.888L21 21m-2.222-2.222L3 3" />
                                                ) : (
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                )}
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-[10px] uppercase font-black text-white/40 mb-2 ml-1 tracking-widest">Confirmar Contraseña {!!formData.usuario_password && <span className="text-brand">*</span>}</label>
                                    <input 
                                        required={!!formData.usuario_password} 
                                        type={formData.show_password ? "text" : "password"} 
                                        value={formData.usuario_confirm_password} 
                                        onChange={e => setFormData({...formData, usuario_confirm_password: e.target.value})} 
                                        className={`w-full bg-bkg-deep border rounded-xl px-4 py-3 text-sm focus:bg-bkg-elevated outline-none transition-all font-mono placeholder:text-white/5 ${
                                            formData.usuario_password && formData.usuario_password !== formData.usuario_confirm_password 
                                            ? 'border-red-500/50 text-red-400 focus:border-red-500' 
                                            : 'border-white/10 text-white focus:border-brand'
                                        }`} 
                                        placeholder="••••••••"
                                    />
                                    {formData.usuario_password && formData.usuario_confirm_password && formData.usuario_password !== formData.usuario_confirm_password && (
                                        <p className="text-[9px] text-red-500 font-bold mt-1.5 ml-1 uppercase tracking-wider">Las contraseñas no coinciden</p>
                                    )}
                                </div>
                             </div>
                        </div>

                        {/* 5. UBICACIÓN */}
                        <div className="lg:col-span-3 p-6 bg-bkg-base/50 border border-white/5 rounded-2xl">
                            <h4 className="text-xs uppercase tracking-[0.2em] text-brand font-black mb-6 flex items-center gap-3">
                                <span className="w-2 h-2 rounded-full bg-brand shadow-[0_0_10px_rgba(255,160,0,0.5)]"></span> 
                                Localización y Sede
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                <div>
                                    <label className="block text-[10px] uppercase font-black text-white/50 mb-2 ml-1 tracking-widest">CCAA</label>
                                    <select value={formData.ccaa} onChange={e => setFormData({...formData, ccaa: e.target.value})} className="w-full bg-bkg-deep border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-brand transition-all appearance-none cursor-pointer uppercase">
                                        <option value="">-- SELECCIONAR --</option>
                                        {Object.keys(CCAA_PROVINCIAS).sort().map(ccaa => (
                                            <option key={ccaa} value={ccaa}>{ccaa}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] uppercase font-black text-white/50 mb-2 ml-1 tracking-widest">Provincia</label>
                                    <select value={formData.provincia} onChange={e => setFormData({...formData, provincia: e.target.value})} disabled={!formData.ccaa} className="w-full bg-bkg-deep border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-brand outline-none text-white disabled:opacity-30 appearance-none cursor-pointer uppercase">
                                        <option value="">-- SELECCIONAR --</option>
                                        {availableProvinces.map(prov => (
                                            <option key={prov} value={prov}>{prov}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] uppercase font-black text-white/50 mb-2 ml-1 tracking-widest">Municipio / Población</label>
                                    <select disabled={availableMunicipios.length === 0} value={formData.municipio} onChange={e => setFormData({...formData, municipio: e.target.value})} className="w-full bg-bkg-deep border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-brand outline-none text-white disabled:opacity-30 appearance-none cursor-pointer uppercase">
                                        <option value="">{availableMunicipios.length === 0 ? '-- PRIMERO PROVINCIA --' : '-- SELECCIONAR --'}</option>
                                        {availableMunicipios.map(muni => (
                                            <option key={`${muni.provCode}-${muni.munCode}`} value={muni.name}>{muni.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] uppercase font-black text-white/50 mb-2 ml-1 tracking-widest">Cód. Postal</label>
                                    <input type="text" value={formData.codigo_postal} onChange={e => setFormData({...formData, codigo_postal: e.target.value})} className="w-full bg-bkg-deep border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-brand focus:bg-bkg-elevated outline-none transition-all uppercase" placeholder="41001"/>
                                </div>
                                <div className="lg:col-span-4">
                                     <label className="block text-[10px] uppercase font-black text-white/50 mb-2 ml-1 tracking-widest">Dirc. Fiscal / Social</label>
                                     <input type="text" value={formData.direccion} onChange={e => setFormData({...formData, direccion: e.target.value})} className="w-full bg-bkg-deep border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-brand focus:bg-bkg-elevated outline-none transition-all uppercase" placeholder="CALLE EJEMPLO, 1, 1ºA"/>
                                 </div>
                            </div>
                        </div>

                        {/* 6. ESPECIALIDAD */}
                        <div className="lg:col-span-3 p-6 bg-brand/[0.01] border border-brand/10 rounded-2xl">
                            <h4 className="text-xs uppercase tracking-[0.2em] text-brand font-black mb-6 flex items-center gap-3">
                                <span className="w-2 h-2 rounded-full bg-brand shadow-[0_0_10px_rgba(255,160,0,0.5)]"></span> 
                                Especialidad y Homologaciones
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
                                <div>
                                    <label className="block text-[10px] uppercase font-black text-white/40 mb-2 ml-1 tracking-widest">Rol del Partner <span className="text-brand">*</span></label>
                                    <select value={formData.tipo_empresa} onChange={e => setFormData({...formData, tipo_empresa: e.target.value})} className="w-full bg-brand/10 border border-brand/20 rounded-xl px-4 py-3 text-sm text-brand font-black outline-none cursor-pointer appearance-none uppercase">
                                        <option value="DISTRIBUIDOR">DISTRIBUIDOR</option>
                                        <option value="INSTALADOR">INSTALADOR</option>
                                        <option value="CERTIFICADOR">CERTIFICADOR</option>
                                        <option value="CLIENTE">CLIENTE PARTICULAR</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-[10px] uppercase font-black text-white/40 mb-2 ml-1 tracking-widest">Marca Ref. Principal</label>
                                    <input type="text" value={formData.marca_referencia} onChange={e => setFormData({...formData, marca_referencia: e.target.value})} className="w-full bg-bkg-deep border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-brand focus:bg-bkg-elevated outline-none transition-all uppercase" placeholder="DAIKIN / VAILLANT..."/>
                                </div>
                                <div>
                                    <label className="block text-[10px] uppercase font-black text-white/40 mb-2 ml-1 tracking-widest">Marca Secundaria</label>
                                    <input type="text" value={formData.marca_secundaria} onChange={e => setFormData({...formData, marca_secundaria: e.target.value})} className="w-full bg-bkg-deep border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-brand focus:bg-bkg-elevated outline-none transition-all uppercase" placeholder="MITSUBISHI..."/>
                                </div>

                                {formData.tipo_empresa === 'INSTALADOR' && (
                                     <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-6 p-6 bg-brand/5 border border-brand/10 rounded-2xl mt-2">
                                         <label className="flex items-center gap-4 cursor-pointer group p-2">
                                            <div className="relative h-5 w-9 shrink-0">
                                                <input 
                                                    type="checkbox" id="tiene_rite" 
                                                    checked={formData.tiene_carnet_rite}
                                                    onChange={(e) => setFormData({...formData, tiene_carnet_rite: e.target.checked})}
                                                    className="sr-only peer"
                                                />
                                                <div className="w-full h-full bg-black/50 border border-white/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-[16px] after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                                            </div>
                                            <span className="font-black text-white text-[10px] uppercase block tracking-widest leading-none">
                                                Dispone de Carnet Oficial
                                            </span>
                                         </label>
                                         <div className="md:col-span-2">
                                            <label className="block text-[10px] uppercase font-black text-white/40 mb-2 ml-1 tracking-widest">Número de Registro / Colegiado</label>
                                            <input disabled={!formData.tiene_carnet_rite} type="text" value={formData.numero_carnet_rite} onChange={e => setFormData({...formData, numero_carnet_rite: e.target.value})} className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500 transition-all uppercase disabled:opacity-20" placeholder="RITE-XXXXX / COL-XXXXX"/>
                                         </div>
                                     </div>
                                )}

                                <div className="md:col-span-3 mt-4 flex items-center gap-6">
                                    <div className="w-20 h-20 shrink-0 rounded-2xl border-2 border-dashed border-white/10 bg-black/20 overflow-hidden flex items-center justify-center relative group">
                                        {formData.logo_empresa ? (
                                            <img src={formData.logo_empresa} alt="Logo" className="w-full h-full object-contain p-2" />
                                        ) : (
                                            <svg className="w-8 h-8 text-white/10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                        )}
                                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-[10px] font-black uppercase text-white tracking-widest pointer-events-none">Subir</div>
                                    </div>
                                    <div className="flex-1">
                                         <label className="block text-[10px] uppercase font-black text-white/40 mb-3 ml-1 tracking-widest">Logotipo Corporativo (Transparencia recomendada)</label>
                                         <input type="file" accept="image/png, image/jpeg, image/svg+xml" onChange={handleFileChange} className="block w-full text-[10px] text-white/30 file:mr-6 file:py-3 file:px-6 file:rounded-xl file:border-0 file:text-[10px] file:font-black file:uppercase file:tracking-widest file:bg-amber-500 file:text-black hover:file:bg-amber-400 transition-all cursor-pointer"/>
                                    </div>
                                </div>
                            </div>
                        </div>



                        </div>
                     </form>
                </div>
            )}

            <div className="rounded-2xl border border-white/[0.06] overflow-hidden bg-white/[0.01] backdrop-blur-sm">
                 <table className="w-full text-left border-collapse">
                     <thead>
                         <tr className="bg-white/[0.03]">
                             <th className="p-4 text-[10px] uppercase tracking-[0.2em] text-white/30 border-b border-white/[0.06]">Razón Social / Partner</th>
                             <th className="p-4 text-[10px] uppercase tracking-[0.2em] text-white/30 border-b border-white/[0.06] hidden md:table-cell">Identificación</th>
                             <th className="p-4 text-[10px] uppercase tracking-[0.2em] text-white/30 border-b border-white/[0.06] hidden sm:table-cell">Especialidad</th>
                             <th className="p-4 text-[10px] uppercase tracking-[0.2em] text-white/30 border-b border-white/[0.06]">Contacto Principal</th>
                             <th className="p-4 text-[10px] uppercase tracking-[0.2em] text-white/30 border-b border-white/[0.06] text-right">Antigüedad</th>
                             <th className="p-4 text-[10px] uppercase tracking-[0.2em] text-white/30 border-b border-white/[0.06] text-right">Acciones</th>
                         </tr>
                         {/* Filter Row */}
                         <tr className="bg-white/[0.01]">
                             <td className="p-2.5 border-b border-white/[0.06]">
                                 <input 
                                     type="text" 
                                     placeholder="Filtrar por nombre..."
                                     value={searchTerm}
                                     onChange={e => setSearchTerm(e.target.value)}
                                     className="w-full bg-black/40 border border-white/[0.08] rounded-xl px-3 py-1.5 text-[10px] text-white placeholder:text-white/10 focus:outline-none focus:border-amber-500/30 transition-all font-mono"
                                 />
                             </td>
                             <td className="p-2.5 border-b border-white/[0.06] hidden md:table-cell">
                                 <input 
                                     type="text" 
                                     placeholder="CIF..."
                                     value={searchCIF}
                                     onChange={e => setSearchCIF(e.target.value)}
                                     className="w-full bg-black/40 border border-white/[0.08] rounded-xl px-3 py-1.5 text-[10px] text-cyan-400 placeholder:text-white/10 focus:outline-none focus:border-cyan-500/30 transition-all font-mono uppercase"
                                 />
                             </td>
                             <td className="p-2.5 border-b border-white/[0.06] hidden sm:table-cell"></td>
                             <td className="p-2.5 border-b border-white/[0.06]"></td>
                             <td className="p-2.5 border-b border-white/[0.06]"></td>
                             <td className="p-2.5 border-b border-white/[0.06]"></td>
                         </tr>
                     </thead>
                     <tbody className="divide-y divide-white/[0.04]">
                        {loading ? (
                            <tr><td colSpan="5" className="p-16 text-center text-white/10 text-sm italic">Sincronizando con el servidor central...</td></tr>
                        ) : filteredPrescriptores.length === 0 ? (
                            <tr>
                                <td colSpan="5" className="p-16 text-center">
                                    <div className="flex flex-col items-center gap-3">
                                        <div className="w-12 h-12 rounded-full bg-white/[0.03] flex items-center justify-center border border-white/[0.06]">
                                            <svg className="w-6 h-6 text-white/10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                            </svg>
                                        </div>
                                        <span className="text-white/20 text-sm font-medium">No se encontraron entidades con los criterios actuales</span>
                                    </div>
                                </td>
                            </tr>
                        ) : filteredPrescriptores.map(p => (
                            <tr key={p.id_empresa} onClick={() => handleEdit(p)} className="hover:bg-white/[0.05] hover:bg-gradient-to-r hover:from-white/[0.02] hover:to-transparent transition-all cursor-pointer group">
                                <td className="p-4">
                                    <div className="flex items-center gap-3">
                                        {p.logo_empresa ? (
                                            <div className="w-8 h-8 rounded-lg border border-white/5 bg-white/5 flex items-center justify-center shrink-0 overflow-hidden"><img src={p.logo_empresa} alt="logo" className="w-full h-full object-cover"/></div>
                                        ) : (
                                            <div className="w-8 h-8 rounded-lg border border-white/5 bg-white/5 flex items-center justify-center shrink-0 font-bold text-white/20 text-xs uppercase">{p.razon_social ? p.razon_social.substring(0,2) : ''}</div>
                                        )}
                                        <div>
                                            <div className="font-bold text-sm text-white/90 truncate max-w-[200px] flex items-center gap-2 uppercase">
                                                {p.acronimo || p.razon_social || '-'}
                                                {p.acronimo && <span className="text-[9px] text-white/20 font-normal">({p.razon_social})</span>}
                                            </div>
                                            <div className="flex gap-2 items-center mt-1">
                                                {p.es_autonomo && <span className="text-[8px] tracking-wider uppercase bg-fuchsia-500/10 text-fuchsia-400 px-1.5 py-0.5 rounded border border-fuchsia-500/20">AUTÓNOMO</span>}
                                                <span className="text-[9px] text-white/30 md:hidden">{p.cif}</span>
                                            </div>
                                        </div>
                                    </div>
                                </td>
                                <td className="p-4 text-xs font-mono text-cyan-400 hidden md:table-cell">{p.cif || '-'}</td>
                                <td className="p-4 hidden sm:table-cell">
                                    <span className={`text-[9px] uppercase tracking-widest font-black border px-2 py-1 rounded-lg inline-block ${
                                        p.tipo_empresa === 'ADMIN' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
                                        p.tipo_empresa === 'DISTRIBUIDOR' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                                        p.tipo_empresa === 'INSTALADOR' ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' :
                                        p.tipo_empresa === 'CERTIFICADOR' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-400/20' :
                                        'bg-white/5 text-white/40 border-white/10'
                                    }`}>
                                        {p.tipo_empresa === 'CLIENTE' ? 'CLIENTE PARTICULAR' : p.tipo_empresa}
                                    </span>
                                </td>
                                <td className="p-4">
                                    {p.usuarios ? (
                                        <div>
                                            <div className="text-xs font-bold text-white/80 flex items-center gap-1.5 hover:text-cyan-400 transition-colors">
                                                <svg className="w-3.5 h-3.5 text-cyan-500/50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                                {p.usuarios.nombre} {p.usuarios.apellidos || ''}
                                            </div>
                                            <div className="text-[10px] text-white/40 font-mono mt-0.5 ml-5">{p.usuarios.email}</div>
                                        </div>
                                    ) : (
                                        <span className="text-amber-500/50 italic text-xs">Sin vincular</span>
                                    )}
                                </td>
                                <td className="p-4 text-xs font-mono text-white/20 text-right">{new Date(p.created_at).toLocaleDateString()}</td>
                                <td className="p-4 text-right">
                                     <button 
                                         onClick={(e) => handleDelete(p.id_empresa, e)}
                                         className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-500/40 hover:text-red-500 rounded-lg transition-all"
                                         disabled={deleting}
                                         title="Eliminar partner"
                                     >
                                         <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                     </button>
                                </td>
                            </tr>
                        ))}
                     </tbody>
                 </table>
            </div>

            {/* Custom Modal Premium */}
            {modalConfig.show && (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
                    <div className={`relative w-full max-w-md bg-bkg-surface border shadow-2xl rounded-2xl overflow-hidden animate-slide-up ${modalConfig.type === 'confirm' ? 'border-red-500/30' : 'border-brand/30'}`}>
                        {/* Header decorativo */}
                        <div className={`h-1.5 w-full bg-gradient-to-r ${modalConfig.type === 'confirm' ? 'from-red-600 to-red-400' : 'from-brand to-brand-700'}`}></div>
                        
                        <div className="p-8">
                            <div className="flex flex-col items-center text-center">
                                {/* Icono */}
                                <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-6 ${modalConfig.type === 'confirm' ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 'bg-brand/10 text-brand border border-brand/20'}`}>
                                    {modalConfig.type === 'confirm' ? (
                                        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                    ) : (
                                        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                    )}
                                </div>

                                <h3 className="text-xl font-black text-white mb-3 tracking-tight uppercase">
                                    {modalConfig.title}
                                </h3>
                                
                                <p className="text-white/50 text-sm leading-relaxed mb-8">
                                    {modalConfig.message}
                                </p>

                                <div className="flex w-full gap-3">
                                    {modalConfig.type === 'confirm' && (
                                        <button 
                                            onClick={() => setModalConfig(prev => ({ ...prev, show: false }))}
                                            className="flex-1 py-3.5 px-6 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-white text-[10px] font-black uppercase tracking-[0.2em] transition-all"
                                        >
                                            {modalConfig.cancelLabel}
                                        </button>
                                    )}
                                    <button 
                                        onClick={modalConfig.onConfirm}
                                        className={`flex-1 py-3.5 px-6 rounded-xl font-black text-[10px] uppercase tracking-[0.2em] transition-all shadow-lg active:scale-95 ${
                                            modalConfig.type === 'confirm' 
                                                ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-600/20' 
                                                : 'bg-gradient-to-r from-brand to-brand-700 hover:from-brand-400 hover:to-brand-600 text-black shadow-brand/20'
                                        }`}
                                    >
                                        {modalConfig.confirmLabel}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}

