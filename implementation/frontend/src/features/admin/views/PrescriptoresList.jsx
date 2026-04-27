// Prescriptores Management View - Updated 2026-03-26
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../../../context/AuthContext';
import { PrescriptorDetailModal } from './PrescriptorDetailModal';


export function PrescriptoresList() {
    const { user, refreshProfile } = useAuth();
    const isDistributor = user?.rol?.toUpperCase() === 'DISTRIBUIDOR';
    const [prescriptores, setPrescriptores] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

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

    useEffect(() => { fetchData(); }, []);

    // Modal de detalle / creación (patrón clientes)
    const [modalPrescriptor, setModalPrescriptor] = useState(null);

    const handleNew = () => {
        setModalPrescriptor({}); // objeto vacío = nuevo partner
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
                    setModalPrescriptor(null);
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


    // Filter logic
    const [searchTerm, setSearchTerm] = useState('');
    const [searchCIF, setSearchCIF] = useState('');
    const [filterTipo, setFilterTipo] = useState('TODO'); // 'TODO', 'DISTRIBUIDOR', 'INSTALADOR', 'CERTIFICADOR'

    const filteredPrescriptores = prescriptores.filter(p => {
        // No mostrar al propio distribuidor en la lista si es el rol actual
        if (user?.rol?.toUpperCase() === 'DISTRIBUIDOR' && p.id_empresa === user?.prescriptor_id) return false;

        const displayName = (p.acronimo || p.razon_social || '').toLowerCase();
        const matchesName = displayName.includes(searchTerm.toLowerCase());
        const matchesCIF = (p.cif || '').toLowerCase().includes(searchCIF.toLowerCase());
        const matchesTipo = filterTipo === 'TODO' || p.tipo_empresa === filterTipo;
        return matchesName && matchesCIF && matchesTipo;
    });

    // Ajustar estadísticas para excluir al propio distribuidor si aplica
    const visiblePrescriptores = prescriptores.filter(p => {
        if (user?.rol?.toUpperCase() === 'DISTRIBUIDOR' && p.id_empresa === user?.prescriptor_id) return false;
        return true;
    });

    const stats = {
        total: visiblePrescriptores.length,
        distribuidores: visiblePrescriptores.filter(p => p.tipo_empresa === 'DISTRIBUIDOR').length,
        instaladores: visiblePrescriptores.filter(p => p.tipo_empresa === 'INSTALADOR').length,
        certificadores: visiblePrescriptores.filter(p => p.tipo_empresa === 'CERTIFICADOR').length,
        conRite: visiblePrescriptores.filter(p => p.tiene_carnet_rite).length
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
                        {user?.rol?.toUpperCase() === 'ADMIN' ? 'Gestión de Prescriptores' : 'Mis Partners Asociados'}
                    </h2>
                    <p className="text-white/40 text-xs mt-2 ml-16 font-medium uppercase tracking-widest">Panel de control de entidades colaboradoras y partners B2B</p>
                </div>
                {user?.rol?.toUpperCase() === 'ADMIN' && (
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
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    {[
                        { label: 'Total Partners', value: stats.total, color: 'text-white', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857', id: 'TODO' },
                        { label: 'Distribuidores', value: stats.distribuidores, color: 'text-amber-500', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4', id: 'DISTRIBUIDOR' },
                        { label: 'Instaladores', value: stats.instaladores, color: 'text-cyan-400', icon: 'M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 11-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 011-1h1a2 2 0 100-4H7a1 1 0 01-1-1V7a1 1 0 011-1h3a1 1 0 001-1V4z', id: 'INSTALADOR' },
                        { label: 'Certificadores', value: stats.certificadores, color: 'text-emerald-400', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z', id: 'CERTIFICADOR' }
                    ].map((s, i) => {
                        const isActive = filterTipo === s.id;
                        return (
                            <div 
                                key={i} 
                                onClick={() => setFilterTipo(s.id === filterTipo ? 'TODO' : s.id)}
                                className={`cursor-pointer bg-white/[0.03] border transition-all group rounded-2xl p-4 ${isActive ? 'border-brand ring-1 ring-brand/20 bg-brand/[0.05] shadow-[0_0_20px_rgba(255,165,0,0.1)]' : 'border-white/[0.06] hover:border-white/10'}`}
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <div className={`w-8 h-8 rounded-lg ${isActive ? 'bg-brand' : s.color.replace('text-', 'bg-') + '/10'} flex items-center justify-center transition-all group-hover:scale-110`}>
                                        <svg className={`w-4 h-4 ${isActive ? 'text-black font-bold' : s.color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={isActive ? 3 : 2} d={s.icon} />
                                        </svg>
                                    </div>
                                    <span className={`text-xl font-black ${isActive ? 'text-brand' : s.color}`}>{s.value}</span>
                                </div>
                                <span className={`text-[10px] uppercase font-bold tracking-widest ${isActive ? 'text-brand' : 'text-white/30'}`}>{s.label}</span>
                            </div>
                        );
                    })}
            </div>

            {error && <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl mb-6 text-sm flex items-center gap-2"><svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>{error}</div>}


            <div className="rounded-2xl border border-white/[0.06] overflow-hidden bg-white/[0.01] backdrop-blur-sm">
                 <table className="w-full text-left border-collapse">
                     <thead>
                          <tr className="bg-white/[0.03]">
                             <th className="p-4 text-[10px] uppercase tracking-[0.2em] text-white/30 border-b border-white/[0.06]">Razón Social / Partner</th>
                             <th className="p-4 text-[10px] uppercase tracking-[0.2em] text-white/30 border-b border-white/[0.06]">Identificación</th>
                             {!isDistributor && (
                                 <>
                                     <th className="p-4 text-[10px] uppercase tracking-[0.2em] text-white/30 border-b border-white/[0.06] hidden sm:table-cell">Especialidad</th>
                                     <th className="p-4 text-[10px] uppercase tracking-[0.2em] text-white/30 border-b border-white/[0.06]">Contacto Principal</th>
                                     <th className="p-4 text-[10px] uppercase tracking-[0.2em] text-white/30 border-b border-white/[0.06] text-right">Antigüedad</th>
                                     <th className="p-4 text-[10px] uppercase tracking-[0.2em] text-white/30 border-b border-white/[0.06] text-right">Acciones</th>
                                 </>
                             )}
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
                             <td className="p-2.5 border-b border-white/[0.06]">
                                 <input 
                                     type="text" 
                                     placeholder="CIF..."
                                     value={searchCIF}
                                     onChange={e => setSearchCIF(e.target.value)}
                                     className="w-full bg-black/40 border border-white/[0.08] rounded-xl px-3 py-1.5 text-[10px] text-cyan-400 placeholder:text-white/10 focus:outline-none focus:border-cyan-500/30 transition-all font-mono uppercase"
                                 />
                             </td>
                             {!isDistributor && (
                                 <>
                                     <td className="p-2.5 border-b border-white/[0.06] hidden sm:table-cell"></td>
                                     <td className="p-2.5 border-b border-white/[0.06]"></td>
                                     <td className="p-2.5 border-b border-white/[0.06]"></td>
                                     <td className="p-2.5 border-b border-white/[0.06]"></td>
                                 </>
                             )}
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
                            <tr key={p.id_empresa} onClick={() => setModalPrescriptor(p)} className="hover:bg-white/[0.05] hover:bg-gradient-to-r hover:from-white/[0.02] hover:to-transparent transition-all cursor-pointer group">
                                <td className="p-4">
                                    <div className="flex items-center gap-3">
                                        {p.logo_empresa ? (
                                            <div className="w-8 h-8 rounded-lg border border-white/5 bg-white/5 flex items-center justify-center shrink-0 overflow-hidden"><img src={p.logo_empresa} alt="logo" className="w-full h-full object-cover"/></div>
                                        ) : (
                                            <div className="w-8 h-8 rounded-lg border border-white/5 bg-white/5 flex items-center justify-center shrink-0 font-bold text-white/20 text-xs uppercase">{p.razon_social ? p.razon_social.substring(0,2) : ''}</div>
                                        )}
                                        <div>
                                            <div className="font-bold text-sm text-white/90 truncate max-w-[450px] flex items-center gap-2 uppercase">
                                                {p.acronimo || p.razon_social || '-'}
                                                {p.acronimo && <span className="text-[10px] text-white/20 font-normal normal-case">({p.razon_social})</span>}
                                            </div>
                                            <div className="flex gap-2 items-center mt-1">
                                                {p.es_autonomo && <span className="text-[8px] tracking-wider uppercase bg-fuchsia-500/10 text-fuchsia-400 px-1.5 py-0.5 rounded border border-fuchsia-500/20">AUTÓNOMO</span>}
                                                <span className="text-[9px] text-white/30 md:hidden">{p.cif}</span>
                                            </div>
                                        </div>
                                    </div>
                                </td>
                                <td className="p-4 text-xs font-mono text-cyan-400">{p.cif || '-'}</td>
                                {user?.rol?.toUpperCase() === 'ADMIN' && (
                                    <>
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
                                                        <span className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border ${p.usuarios.activo ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400/70 border-red-500/20'}`}>
                                                            {p.usuarios.activo ? 'ACTIVO' : 'INACTIVO'}
                                                        </span>
                                                    </div>
                                                    <div className="text-[10px] text-white/40 font-mono mt-0.5 ml-5">{p.usuarios.email}</div>
                                                </div>
                                            ) : (
                                                <span className="text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border bg-white/5 text-white/25 border-white/10">SIN ACCESO</span>
                                            )}
                                        </td>
                                        <td className="p-4 text-xs font-mono text-white/20 text-right">{new Date(p.created_at).toLocaleDateString()}</td>
                                        <td className="p-4 text-right" onClick={e => e.stopPropagation()}>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleDelete(p.id_empresa, e); }}
                                                className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-500/40 hover:text-red-500 rounded-lg transition-all"
                                                disabled={deleting}
                                                title="Eliminar partner"
                                            >
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                            </button>
                                        </td>
                                    </>
                                )}
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

            {/* Modal de detalle / edición / creación de prescriptor */}
            <PrescriptorDetailModal
                isOpen={!!modalPrescriptor}
                prescriptor={modalPrescriptor}
                onClose={() => setModalPrescriptor(null)}
                onCreated={(newP) => {
                    setPrescriptores(prev => [newP, ...prev]);
                    setModalPrescriptor(null);
                }}
                onUpdated={(updated) => {
                    setPrescriptores(prev => prev.map(p => p.id_empresa === updated.id_empresa ? { ...p, ...updated } : p));
                    setModalPrescriptor(prev => prev?.id_empresa ? { ...prev, ...updated } : null);
                }}
            />

        </div>
    );
}

