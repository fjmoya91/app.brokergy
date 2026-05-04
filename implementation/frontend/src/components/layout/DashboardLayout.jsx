import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';

export function DashboardLayout({ children, activeTab, onTabChange }) {
    const { user, signOut } = useAuth();
    
    // Cache de roles para lógica más limpia e infalible
    const userRole = (user?.rol || '').toUpperCase();
    const userRoleId = user?.id_rol ? Number(user.id_rol) : null;
    const isAdmin = userRole === 'ADMIN' || userRoleId === 1;
    const isCertificador = userRole === 'CERTIFICADOR' || userRoleId === 4;
    const isPartner = ['DISTRIBUIDOR', 'INSTALADOR', 'PARTNER'].includes(userRole) || [2, 3].includes(userRoleId);

    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [wwaState, setWwaState] = useState('DISCONNECTED'); // DISCONNECTED | READY | QR | INITIALIZING | AUTH_FAILED

    // Polling del estado de WhatsApp (solo ADMIN).
    // Intervalo reducido de 5s → 30s el 2026-04-29 para recortar el egress de Supabase:
    // cada request pasa por el middleware de auth (DB hit), y 720 req/hora por usuario
    // estaban contribuyendo a superar el límite de 5.5 GB del plan Free.
    // El indicador verde/rojo puede tardar hasta 30s en actualizarse; es aceptable
    // porque el admin solo necesita saber el estado aproximado desde el sidebar.
    useEffect(() => {
        const userRole = (user?.rol || '').toUpperCase();
        const userRoleId = user?.id_rol ? Number(user.id_rol) : null;
        if (userRole !== 'ADMIN' && userRoleId !== 1) return;

        const pollWwa = async () => {
            try {
                const res = await axios.get('/api/whatsapp/status');
                setWwaState(res.data?.state || 'DISCONNECTED');
            } catch (_) {
                setWwaState('DISCONNECTED');
            }
        };

        pollWwa();
        const interval = setInterval(pollWwa, 30000);
        return () => clearInterval(interval);
    }, [user?.rol, user?.id_rol]);

    return (
        <div className="flex h-screen w-full relative bg-bkg-base overflow-hidden">
            {/* ====== SIDEBAR ====== */}
            <aside className={`bg-bkg-deep border-r border-white/[0.06] flex flex-col h-full flex-shrink-0 z-20 transition-all duration-300 ease-in-out ${isSidebarCollapsed ? 'w-20' : 'w-[280px]'}`}>
                {/* ====== LOGO SECTION ====== */}
                <div className={`p-4 ${isSidebarCollapsed ? 'sm:p-2' : 'sm:p-6'} flex items-center justify-center relative`}>
                    <div className={`w-full flex items-center justify-center transition-all ${isSidebarCollapsed ? 'h-10 w-10' : 'h-32'} relative`}>
                        {user?.rol?.toUpperCase() === 'ADMIN' ? (
                            <img 
                                src="/logo-brokergy-admin.png" 
                                alt="Brokergy Admin" 
                                className="max-w-full max-h-full object-contain transition-transform group-hover:scale-105"
                            />
                        ) : user?.logo_empresa ? (
                            <img 
                                src={user.logo_empresa} 
                                alt="Logo Partner" 
                                className="max-w-full max-h-full object-contain transition-transform group-hover:scale-105"
                            />
                        ) : (
                            <div className="w-full h-full rounded-2xl bg-white/[0.02] border border-white/5 flex flex-col items-center justify-center gap-2 opacity-20">
                                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                {!isSidebarCollapsed && <span className="text-[10px] font-black uppercase tracking-widest text-center px-2">Logo Partner</span>}
                            </div>
                        )}
                    </div>

                    {/* sidebarToggle - Professional SaaS Floating Toggle */}
                    <button 
                        onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                        className="absolute -right-3 top-8 w-7 h-7 rounded-full bg-bkg-deep border border-white/10 flex items-center justify-center text-white/40 hover:text-brand hover:border-brand/50 transition-all duration-300 z-50 shadow-[0_2px_10px_rgba(0,0,0,0.5)] group active:scale-90"
                        title={isSidebarCollapsed ? "Mostrar menú" : "Ocultar menú"}
                    >
                        <svg 
                            className="w-4 h-4 transition-transform duration-300" 
                            viewBox="0 0 24 24" 
                            fill="none" 
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round" 
                            strokeLinejoin="round"
                        >
                            <rect x="3" y="3" width="18" height="18" rx="2" />
                            <path d="M9 3V21" />
                        </svg>
                        
                        {/* Subtle Hover Glow */}
                        <div className="absolute inset-0 rounded-full bg-brand/0 group-hover:bg-brand/5 transition-colors duration-300 -z-10"></div>
                    </button>
                </div>

                {/* Tabs */}
                <nav className="flex-1 px-4 space-y-3">
                    {!isCertificador && (
                        <button
                            onClick={() => onTabChange('oportunidades')}
                            className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all ${
                                activeTab === 'oportunidades'
                                    ? 'bg-gradient-to-r from-brand to-brand-700 text-bkg-deep shadow-lg shadow-brand/20'
                                    : 'text-white/50 hover:bg-bkg-hover hover:text-white'
                            } ${isSidebarCollapsed ? 'justify-center px-0' : ''}`}
                        >
                            <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                            </svg>
                            {!isSidebarCollapsed && <span>Oportunidades</span>}
                        </button>
                    )}

                    {!isCertificador && user?.rol !== 'DISTRIBUIDOR' && (
                        <button
                            onClick={() => onTabChange('clientes')}
                            className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all ${
                                activeTab === 'clientes'
                                    ? 'bg-gradient-to-r from-brand to-brand-700 text-bkg-deep shadow-lg shadow-brand/20'
                                    : 'text-white/50 hover:bg-bkg-hover hover:text-white border border-transparent'
                            } ${isSidebarCollapsed ? 'justify-center px-0' : ''}`}
                        >
                            <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            {!isSidebarCollapsed && <span>Clientes</span>}
                        </button>
                    )}

                    {(user?.rol?.toUpperCase() === 'ADMIN' || user?.rol?.toUpperCase() === 'DISTRIBUIDOR') && (
                        <button
                            onClick={() => onTabChange('prescriptores')}
                            className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all ${
                                activeTab === 'prescriptores'
                                    ? 'bg-gradient-to-r from-brand to-brand-700 text-bkg-deep shadow-lg shadow-brand/20'
                                    : 'text-white/50 hover:bg-bkg-hover hover:text-white border border-transparent'
                            } ${isSidebarCollapsed ? 'justify-center px-0' : ''}`}
                        >
                            <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                            {!isSidebarCollapsed && <span>{user?.rol?.toUpperCase() === 'DISTRIBUIDOR' ? 'Instaladores' : 'Prescriptores'}</span>}
                        </button>
                    )}

                    {user?.rol?.toUpperCase() === 'ADMIN' && (
                        <button
                            onClick={() => onTabChange('aerotermia')}
                            className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all ${
                                activeTab === 'aerotermia'
                                    ? 'bg-gradient-to-r from-brand to-brand-700 text-bkg-deep shadow-lg shadow-brand/20'
                                    : 'text-white/50 hover:bg-bkg-hover hover:text-white border border-transparent'
                            } ${isSidebarCollapsed ? 'justify-center px-0' : ''}`}
                        >
                            <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2v-4M9 21H5a2 2 0 01-2-2v-4m0 0h18" />
                            </svg>
                            {!isSidebarCollapsed && <span>Aerotermia</span>}
                        </button>
                    )}

                    {(isAdmin || isCertificador) && (
                        <button
                            onClick={() => onTabChange('expedientes')}
                            className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all ${
                                activeTab === 'expedientes'
                                    ? 'bg-gradient-to-r from-brand to-brand-700 text-bkg-deep shadow-lg shadow-brand/20'
                                    : 'text-white/50 hover:bg-bkg-hover hover:text-white border border-transparent'
                            } ${isSidebarCollapsed ? 'justify-center px-0' : ''}`}
                        >
                            <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            {!isSidebarCollapsed && <span>Expedientes</span>}
                        </button>
                    )}
                </nav>

                {/* ====== WHATSAPP SECTION ====== */}
                {user?.rol === 'ADMIN' && (
                    <div className="px-4 pb-2">
                        <button
                            onClick={() => onTabChange('whatsapp')}
                            className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all relative ${
                                activeTab === 'whatsapp'
                                    ? wwaState === 'READY'
                                        ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-bkg-deep shadow-lg shadow-emerald-500/20'
                                        : 'bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg shadow-red-500/20'
                                    : wwaState === 'READY'
                                        ? 'text-emerald-400 hover:bg-emerald-500/10 border border-emerald-500/20 hover:border-emerald-500/40'
                                        : 'text-red-400 hover:bg-red-500/10 border border-red-500/20 hover:border-red-500/40'
                            } ${isSidebarCollapsed ? 'justify-center px-0' : ''}`}
                            title={wwaState === 'READY' ? 'WhatsApp conectado' : 'WhatsApp desconectado'}
                        >
                            {/* Logo WhatsApp */}
                            <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.999-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                            </svg>
                            {!isSidebarCollapsed && <span>WhatsApp</span>}
                            {/* Indicador de estado */}
                            {!isSidebarCollapsed && (
                                <span className={`ml-auto text-[8px] font-black px-1.5 py-0.5 rounded-full ${
                                    wwaState === 'READY'
                                        ? 'bg-emerald-500/30 text-emerald-300'
                                        : 'bg-red-500/30 text-red-300'
                                }`}>
                                    {wwaState === 'READY' ? 'ACTIVO' : 'INACTIVO'}
                                </span>
                            )}
                        </button>
                    </div>
                )}

                {/* ====== USER PROFILE AT BOTTOM ====== */}
                <div className="p-4 mt-auto space-y-3">
                    <div className={`border border-white/[0.06] bg-bkg-surface rounded-2xl p-4 shadow-lg ${isSidebarCollapsed ? 'flex items-center justify-center px-0' : ''}`}>
                        {!isSidebarCollapsed && (
                            <>
                                <div className="text-[10px] text-white/40 uppercase font-black tracking-[0.2em] mb-2.5">Usuario</div>
                                <div className="flex flex-col gap-1 overflow-hidden">
                                    <span className="text-sm font-black text-brand uppercase tracking-tight truncate" title={user?.acronimo || user?.razon_social || user?.nombre}>
                                        {(user?.acronimo || user?.razon_social || `${user?.nombre || ''} ${user?.apellidos || ''}`).trim().toUpperCase() || 'USUARIO'}
                                    </span>
                                    {user?.razon_social && (
                                        <div className="flex flex-col gap-1">
                                            <span className="text-[9px] font-black text-white/30 lowercase tracking-widest bg-bkg-elevated px-1.5 py-0.5 rounded border border-white/[0.06] self-start truncate max-w-full">
                                                {user?.email}
                                            </span>
                                            {/* Tag de rol auxiliar para depuración, solo si no es ADMIN puro */}
                                            {userRole !== 'ADMIN' && (
                                                <span className="text-[7px] font-black text-brand/40 uppercase tracking-[0.2em] self-start">
                                                    {userRole || 'S/R'}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                    {!user?.razon_social && (
                                        <span className="text-[9px] font-black text-brand uppercase tracking-widest bg-brand/10 px-1.5 py-0.5 rounded border border-brand/20 self-start truncate">
                                            {userRole || 'USUARIO'}
                                        </span>
                                    )}
                                </div>
                            </>
                        )}
                        {isSidebarCollapsed && (
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand to-brand-700 flex items-center justify-center text-bkg-deep font-black text-[10px]" title={user?.acronimo || `${user?.nombre} ${user?.apellidos}`}>
                                {user?.acronimo ? user.acronimo.substring(0, 2).toUpperCase() : `${user?.nombre?.charAt(0) || ''}${user?.apellidos?.charAt(0) || ''}`}
                            </div>
                        )}
                    </div>

                    <button 
                        onClick={signOut}
                        className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl bg-[#1A0E12]/50 hover:bg-[#1A0E12] border border-red-500/10 hover:border-red-500/30 text-red-500 group transition-all ${isSidebarCollapsed ? 'justify-center px-0' : 'justify-start'}`}
                    >
                        <svg className="w-5 h-5 transition-transform group-hover:-translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        {!isSidebarCollapsed && <span className="font-bold uppercase tracking-wider text-[11px]">Salir</span>}
                    </button>
                </div>
            </aside>

            {/* ====== MAIN CONTENT ====== */}
            <main className="flex-1 overflow-y-auto h-full relative">
                {/* Subtle Background Accent */}
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-brand/[0.03] rounded-full blur-[120px] pointer-events-none"></div>
                {children}
            </main>
        </div>
    );
}
