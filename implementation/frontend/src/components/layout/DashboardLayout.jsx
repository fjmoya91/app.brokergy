import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';

export function DashboardLayout({ children, activeTab, onTabChange }) {
    const { user, signOut } = useAuth();
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

    return (
        <div className="flex h-screen w-full relative bg-slate-950 overflow-hidden">
            {/* ====== SIDEBAR ====== */}
            <aside className={`bg-[#0A0D14] border-r border-white/5 flex flex-col h-full flex-shrink-0 z-20 transition-all duration-300 ease-in-out ${isSidebarCollapsed ? 'w-20' : 'w-[280px]'}`}>
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
                        className="absolute -right-3 top-10 w-6 h-6 rounded-full bg-[#0A0D14] border border-white/10 flex items-center justify-center text-white/40 hover:text-[#FFA000] hover:border-[#FFA000]/50 transition-all duration-300 z-50 shadow-[0_2px_8px_rgba(0,0,0,0.4)] group active:scale-90"
                        title={isSidebarCollapsed ? "Mostrar menú" : "Ocultar menú"}
                    >
                        <svg 
                            className={`w-3.5 h-3.5 transition-transform duration-300 ${isSidebarCollapsed ? '' : ''}`} 
                            fill="none" 
                            viewBox="0 0 24 24" 
                            stroke="currentColor"
                        >
                            {isSidebarCollapsed ? (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
                            ) : (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" />
                            )}
                        </svg>
                        
                        {/* Subtle Hover Glow */}
                        <div className="absolute inset-0 rounded-full bg-amber-500/0 group-hover:bg-amber-500/5 transition-colors duration-300 -z-10"></div>
                    </button>
                </div>

                {/* Tabs */}
                <nav className="flex-1 px-4 space-y-3">
                    <button
                        onClick={() => onTabChange('oportunidades')}
                        className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all ${
                            activeTab === 'oportunidades'
                                ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 shadow-lg shadow-orange-500/20'
                                : 'text-white/50 hover:bg-white/5 hover:text-white'
                        } ${isSidebarCollapsed ? 'justify-center px-0' : ''}`}
                    >
                        <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                        </svg>
                        {!isSidebarCollapsed && <span>Oportunidades</span>}
                    </button>
                    
                    {user?.rol === 'ADMIN' && (
                        <button
                            onClick={() => onTabChange('prescriptores')}
                            className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all ${
                                activeTab === 'prescriptores'
                                    ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 shadow-lg shadow-orange-500/20'
                                    : 'text-white/50 hover:bg-white/5 hover:text-white border border-transparent'
                            } ${isSidebarCollapsed ? 'justify-center px-0' : ''}`}
                        >
                            <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                            {!isSidebarCollapsed && <span>Prescriptores</span>}
                        </button>
                    )}
                </nav>

                {/* ====== USER PROFILE AT BOTTOM ====== */}
                <div className="p-4 mt-auto space-y-3">
                    <div className={`border border-white/5 bg-white/[0.02] rounded-2xl p-4 shadow-lg ${isSidebarCollapsed ? 'flex items-center justify-center px-0' : ''}`}>
                        {!isSidebarCollapsed && (
                            <>
                                <div className="text-[10px] text-white/40 uppercase font-black tracking-[0.2em] mb-2.5">Usuario</div>
                                <div className="flex flex-col gap-1 overflow-hidden">
                                    <span className="text-sm font-black text-amber-500 uppercase tracking-tight truncate" title={user?.razon_social || user?.nombre}>
                                        {user?.razon_social || `${user?.nombre || ''} ${user?.apellidos || ''}`.trim() || 'Usuario'}
                                    </span>
                                    {user?.razon_social && (
                                        <span className="text-[9px] font-black text-white/30 uppercase tracking-widest bg-white/5 px-1.5 py-0.5 rounded border border-white/[0.03] self-start truncate max-w-full">
                                            {user?.nombre} {user?.apellidos}
                                        </span>
                                    )}
                                    {!user?.razon_social && (
                                        <span className="text-[9px] font-black text-white/30 uppercase tracking-widest bg-white/5 px-1.5 py-0.5 rounded border border-white/[0.03] self-start truncate">
                                            {user?.rol || 'ADMIN'}
                                        </span>
                                    )}
                                </div>
                            </>
                        )}
                        {isSidebarCollapsed && (
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-slate-950 font-black text-xs" title={`${user?.nombre} ${user?.apellidos}`}>
                                {user?.nombre?.charAt(0)}{user?.apellidos?.charAt(0)}
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
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-amber-500/5 rounded-full blur-[120px] pointer-events-none"></div>
                {children}
            </main>
        </div>
    );
}
