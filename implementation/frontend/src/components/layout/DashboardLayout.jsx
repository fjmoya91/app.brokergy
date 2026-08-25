import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { buildAccentVars } from '../../utils/partnerTheme';
import { PrescriptorDetailModal } from '../../features/admin/views/PrescriptorDetailModal';
import { AdminProfileModal } from '../../features/admin/views/AdminProfileModal';
import { SidebarNetworkBackground } from '../SidebarNetworkBackground';
import { ThemeToggle } from '../ThemeToggle';
import { UserMenu } from './UserMenu';
import { getRoleFlags } from '../../utils/roleFlags';

export function DashboardLayout({ children, activeTab, onTabChange }) {
    const { user, signOut } = useAuth();

    // Cache de roles para lógica más limpia e infalible
    const userRole = (user?.rol || '').toUpperCase();
    // isStaff = equipo interno (ADMIN + TRABAJADOR); canSeeMargin/canDelete = solo ADMIN.
    const { isAdmin, isCertificador, isStaff, isTrabajador } = getRoleFlags(user);
    const isPartner = ['DISTRIBUIDOR', 'INSTALADOR', 'PARTNER'].includes(userRole) || [2, 3].includes(user?.id_rol ? Number(user.id_rol) : null);

    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false); // Drawer off-canvas (solo móvil)
    const [wwaState, setWwaState] = useState('DISCONNECTED'); // DISCONNECTED | READY | QR | INITIALIZING | AUTH_FAILED

    // Ficha propia del partner (para abrir su perfil + teñir el portal con su color de marca)
    const [miPrescriptor, setMiPrescriptor] = useState(null);
    const [showProfile, setShowProfile] = useState(false);
    // "Mi perfil" para usuarios internos (ADMIN/CERTIFICADOR), que no tienen ficha de prescriptor
    const [showAdminProfile, setShowAdminProfile] = useState(false);
    // Menú de la cuenta (Mi perfil / Cerrar sesión). Se abre desde el avatar, que
    // es donde se busca en cualquier app; hay DOS anclas porque hay dos avatares:
    // el del pie del sidebar (escritorio y drawer) y el de la barra del móvil.
    const [userMenu, setUserMenu] = useState(null); // null | 'sidebar' | 'topbar'
    const perfilRef = useRef(null);
    const topbarAvatarRef = useRef(null);

    // El partner abre su ficha de prescriptor; los usuarios internos
    // (ADMIN/TRABAJADOR/CERTIFICADOR) abren su "Mi perfil" (tabla usuarios).
    const canOpenPartnerProfile = isPartner && !!miPrescriptor;
    const canOpenAdminProfile = (isStaff || isCertificador) && !!user?.id_usuario;
    const canOpenProfile = canOpenPartnerProfile || canOpenAdminProfile;
    const openProfile = () => {
        if (canOpenPartnerProfile) setShowProfile(true);
        else if (canOpenAdminProfile) setShowAdminProfile(true);
    };
    // MI ficha se pide POR SU ID, nunca buscándola en el listado.
    //
    // Esto era `GET /api/prescriptores` + `find(...) || r.data[0]`, y ese `[0]`
    // abría la ficha de OTRA empresa: para un DISTRIBUIDOR el listado devuelve
    // a propósito SUS INSTALADORES y NO su propia ficha (routes/prescriptores.js
    // filtra por `distribuidor_instalador`), así que el `find` no encontraba nada
    // y el fallback servía el primer instalador asociado como si fuera su perfil.
    useEffect(() => {
        if (!isPartner || !user?.prescriptor_id) { setMiPrescriptor(null); return; }
        axios.get(`/api/prescriptores/${user.prescriptor_id}`)
            .then(r => setMiPrescriptor(r.data || null))
            .catch(() => setMiPrescriptor(null));
    }, [isPartner, user?.prescriptor_id]);

    // Tema de marca del portal: si el partner tiene color de landing, tiñe los
    // botones/acentos del portal con su color (mismo mecanismo que la landing).
    const accentVars = isPartner ? buildAccentVars(miPrescriptor?.landing_color_primary) : null;

    // Navegación en móvil: cambia de pestaña y cierra el drawer.
    // En desktop el drawer no existe, así que setMobileMenuOpen(false) es inocuo.
    const go = (tab) => {
        onTabChange(tab);
        setMobileMenuOpen(false);
    };

    // Navegación que ABRE OTRA PESTAÑA del navegador (misma sesión: el token vive
    // en localStorage del mismo origen). Se usa en Aerotermia porque el catálogo se
    // consulta MIENTRAS se edita un expediente (confirmar modelo, SCOP, ficha
    // técnica): navegar en la misma pestaña perdería los cambios sin guardar.
    // La pestaña destino se abre por deep-link ?tab=<tab>, que App.jsx ya entiende.
    // En la app nativa (Capacitor) no hay pestañas → se navega en sitio, como siempre.
    const goNewTab = (tab) => {
        if (window.Capacitor?.isNativePlatform?.()) { go(tab); return; }
        const win = window.open(`${window.location.origin}/?tab=${tab}`, '_blank');
        if (!win) { go(tab); return; } // popup bloqueado → comportamiento de siempre
        setMobileMenuOpen(false);
    };

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
        <div className={`flex h-screen w-full relative bg-bkg-base overflow-hidden ${accentVars ? 'partner-accent' : ''}`}
            style={accentVars || undefined}>
            {/* ====== BACKDROP MÓVIL (solo cuando el drawer está abierto) ====== */}
            {mobileMenuOpen && (
                <div
                    className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm animate-fade-in"
                    onClick={() => setMobileMenuOpen(false)}
                    aria-hidden="true"
                />
            )}

            {/* ====== SIDEBAR ====== */}
            {/* Desktop: en el flujo flex, ancho fijo/colapsable (igual que siempre).
                Móvil (max-md): drawer fijo off-canvas que se desliza con mobileMenuOpen. */}
            <aside className={`relative bg-bkg-deep border-r border-white/[0.06] flex flex-col h-full flex-shrink-0 z-20 transition-all duration-300 ease-in-out ${isSidebarCollapsed ? 'w-20' : 'w-[280px]'} max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-50 max-md:w-[280px] max-md:shadow-2xl ${mobileMenuOpen ? 'max-md:translate-x-0' : 'max-md:-translate-x-full'}`}>
                {/* Fondo sutil de "red de partículas" (continuidad de marca con el login).
                    Se tiñe con el color del partner si lo tiene; para admin es ámbar Brokergy. */}
                <SidebarNetworkBackground color={isPartner ? (miPrescriptor?.landing_color_primary || null) : null} />

                {/* ====== LOGO SECTION ====== */}
                {/* El logo ocupaba 176 px —el 19 % de una pantalla de 918— y era la
                    causa principal de que el menú no cupiera. Se queda en ~104: sigue
                    siendo lo primero que se ve, pero esto es una herramienta de
                    trabajo y el sitio lo necesitan las pestañas. */}
                <div className={`relative z-10 p-3 ${isSidebarCollapsed ? 'sm:p-2' : 'sm:p-4'} flex items-center justify-center shrink-0`}>
                    <div className={`w-full flex items-center justify-center transition-all ${isSidebarCollapsed ? 'h-10 w-10' : 'h-20 [@media(max-height:820px)]:h-12'} relative`}>
                        {isStaff ? (
                            user?.avatar_url ? (
                                <img
                                    src={user.avatar_url}
                                    alt="Foto de perfil"
                                    className={`object-cover rounded-full border border-white/10 transition-transform group-hover:scale-105 ${isSidebarCollapsed ? 'h-10 w-10' : 'h-20 w-20 [@media(max-height:820px)]:h-12 [@media(max-height:820px)]:w-12'}`}
                                />
                            ) : (
                                <img
                                    src="/logo-brokergy-admin.png"
                                    alt="Brokergy Admin"
                                    className="max-w-full max-h-full object-contain transition-transform group-hover:scale-105"
                                />
                            )
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
                        className="max-md:hidden absolute -right-3 top-6 w-7 h-7 rounded-full bg-bkg-deep border border-white/10 flex items-center justify-center text-white/40 hover:text-brand hover:border-brand/50 transition-all duration-300 z-50 shadow-[0_2px_10px_rgba(0,0,0,0.5)] group active:scale-90"
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

                {/* ====== NAVEGACIÓN ======
                    Lista DECLARATIVA, no diez botones copiados. Cuando eran copias
                    había que tocarlas una a una para cualquier cambio, y la última
                    (CEE directos) nació ya distinta de sus hermanas.

                    Dos problemas resueltos aquí:

                    1) SE CORTABA EL PIE. El <aside> mide lo que la pantalla (918 px
                       medidos) y su contenido pedía 1035: el perfil y "Salir" caían
                       fuera y NO había forma de llegar a ellos, porque nada tenía
                       scroll. Ahora el nav es la única zona que scrollea —`min-h-0`
                       + `overflow-y-auto`; sin `min-h-0` un hijo `flex-1` no puede
                       encoger y sigue empujando el pie fuera de la vista.

                    2) DIEZ ENTRADAS PLANAS no se escanean. Se agrupan por para-qué
                       sirven: lo del día arriba, la cartera, las fichas y los
                       ajustes. Los rótulos SOLO salen si el menú es largo — a un
                       partner con tres entradas, tres cabeceras le estorban. */}
                <nav className="relative z-10 flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pb-2 space-y-1">
                    {(() => {
                        const rol = (user?.rol || '').toUpperCase();
                        const esDistribuidor = rol === 'DISTRIBUIDOR';

                        // `ver` reproduce EXACTAMENTE la condición que tenía cada botón
                        // antes. Este cambio no toca ningún permiso.
                        const ENTRADAS = [
                            { id: 'dashboard', grupo: 'hoy', label: 'Cuadro de mando', ver: isAdmin,
                              title: 'Cómo va el negocio: volumen, facturación y margen',
                              d: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },

                            { id: 'seguimiento', grupo: 'hoy', label: 'Seguimiento', ver: isStaff,
                              title: 'Todo lo que lleva parado más de la cuenta, y a quién hay que escribir',
                              d: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },

                            { id: 'oportunidades', grupo: 'cartera', label: 'Oportunidades', ver: !isCertificador,
                              d: 'M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4' },

                            { id: 'expedientes', grupo: 'cartera', label: 'Expedientes', ver: isStaff || isCertificador,
                              d: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },

                            { id: 'lotes', grupo: 'cartera', label: 'Lotes', ver: isStaff,
                              d: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10' },

                            { id: 'clientes', grupo: 'fichas', label: 'Clientes', ver: !isCertificador && !esDistribuidor,
                              d: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },

                            { id: 'prescriptores', grupo: 'fichas', label: esDistribuidor ? 'Instaladores' : 'Prescriptores', ver: isStaff || esDistribuidor,
                              d: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z' },

                            // Se abre FUERA para no perder el expediente que estés
                            // editando; de ahí el distintivo de enlace externo.
                            { id: 'aerotermia', grupo: 'fichas', label: 'Aerotermia', ver: rol === 'ADMIN', nuevaPestana: true,
                              title: 'Abre el catálogo de aerotermia en una pestaña nueva (no pierdes el expediente que estés editando)',
                              d: 'M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2v-4M9 21H5a2 2 0 01-2-2v-4m0 0h18' },

                            { id: 'usuarios', grupo: 'ajustes', label: 'Usuarios', ver: isAdmin,
                              d: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
                        ].filter(e => e.ver);

                        const GRUPOS = [
                            { id: 'hoy', rotulo: null },   // lo primero que se abre: no necesita nombre
                            { id: 'cartera', rotulo: 'Cartera' },
                            { id: 'fichas', rotulo: 'Fichas' },
                            { id: 'ajustes', rotulo: 'Ajustes' },
                        ];

                        // Con pocas entradas los rótulos son ruido: un partner ve tres
                        // opciones y no tiene nada que agrupar.
                        const conRotulos = ENTRADAS.length > 6 && !isSidebarCollapsed;

                        return GRUPOS.map(g => {
                            const items = ENTRADAS.filter(e => e.grupo === g.id);
                            if (!items.length) return null;
                            return (
                                <div key={g.id} className="space-y-1">
                                    {conRotulos && g.rotulo && (
                                        <div className="px-4 pt-3 pb-1 text-[9px] font-black uppercase tracking-[0.2em] text-white/20">
                                            {g.rotulo}
                                        </div>
                                    )}
                                    {/* Colapsado no cabe el rótulo, pero la separación
                                        entre grupos sí se conserva: es lo que hace
                                        reconocible la forma del menú de un vistazo. */}
                                    {isSidebarCollapsed && g.rotulo && (
                                        <div className="mx-auto my-2 h-px w-8 bg-white/[0.08]" />
                                    )}
                                    {items.map(e => {
                                        const activo = activeTab === e.id;
                                        return (
                                            <button
                                                key={e.id}
                                                onClick={() => (e.nuevaPestana ? goNewTab(e.id) : go(e.id))}
                                                title={e.title || e.label}
                                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-black text-xs uppercase tracking-wider transition-all ${
                                                    activo
                                                        ? 'bg-gradient-to-r from-brand to-brand-700 text-bkg-deep shadow-lg shadow-brand/20'
                                                        : 'text-white/50 hover:bg-bkg-hover hover:text-white border border-transparent'
                                                } ${isSidebarCollapsed ? 'justify-center px-0' : ''}`}
                                            >
                                                <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d={e.d} />
                                                </svg>
                                                {!isSidebarCollapsed && (
                                                    <>
                                                        <span className="truncate">{e.label}</span>
                                                        {e.nuevaPestana && (
                                                            <svg className="w-3 h-3 flex-shrink-0 opacity-50 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                                            </svg>
                                                        )}
                                                    </>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            );
                        });
                    })()}
                </nav>

                {/* ====== WHATSAPP SECTION ====== */}
                {user?.rol === 'ADMIN' && (
                    <div className="relative z-10 px-4 pb-2 shrink-0">
                        <button
                            onClick={() => go('whatsapp')}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-black text-xs uppercase tracking-wider transition-all relative ${
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
                {/* `shrink-0`: el pie es lo último que puede encogerse. Antes, sin
                    scroll en el nav, era justo lo que se salía de la pantalla. */}
                <div className={`relative z-10 p-3 mt-auto shrink-0 flex gap-2 ${isSidebarCollapsed ? 'flex-col items-center' : 'items-center'}`}>
                    {(() => {
                        const avatarUrl = user?.avatar_url;
                        return (
                    // Pulsar aquí abre el MENÚ DE LA CUENTA (Mi perfil / Cerrar
                    // sesión), no la ficha directamente: es la convención de
                    // cualquier app y es lo que hace encontrable el cierre de
                    // sesión sin depender de un botón al fondo de la barra.
                    <button
                        ref={perfilRef}
                        type="button"
                        onClick={() => setUserMenu('sidebar')}
                        aria-haspopup="menu"
                        aria-expanded={userMenu === 'sidebar'}
                        title="Mi cuenta"
                        className={`text-left border border-white/[0.06] bg-bkg-surface rounded-2xl p-3 shadow-lg cursor-pointer hover:border-brand/30 hover:bg-bkg-hover transition-all group ${isSidebarCollapsed ? 'w-full flex items-center justify-center px-0' : 'flex-1 min-w-0'}`}>
                        {!isSidebarCollapsed && (
                            <>
                                <div className="text-[10px] text-white/40 uppercase font-black tracking-[0.2em] mb-1.5 flex items-center justify-between">
                                    <span className="sr-only">Usuario</span>
                                    {/* Chevron, no lápiz: esto abre un menú, no un formulario */}
                                    <svg className="w-3.5 h-3.5 text-white/30 group-hover:text-brand transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
                                    </svg>
                                </div>
                                <div className="flex items-center gap-3 overflow-hidden">
                                    {avatarUrl && (
                                        <img src={avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover border border-white/10 shrink-0" />
                                    )}
                                    <div className="flex flex-col gap-1 overflow-hidden min-w-0">
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
                                </div>
                            </>
                        )}
                        {isSidebarCollapsed && (
                            avatarUrl ? (
                                <img src={avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover border border-white/10" title={user?.acronimo || `${user?.nombre} ${user?.apellidos}`} />
                            ) : (
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand to-brand-700 flex items-center justify-center text-bkg-deep font-black text-[10px]" title={user?.acronimo || `${user?.nombre} ${user?.apellidos}`}>
                                    {user?.acronimo ? user.acronimo.substring(0, 2).toUpperCase() : `${user?.nombre?.charAt(0) || ''}${user?.apellidos?.charAt(0) || ''}`}
                                </div>
                            )
                        )}
                    </button>
                        );
                    })()}
                    <ThemeToggle collapsed className="flex-shrink-0" />

                    {/* Aquí ya NO hay botón de "Cerrar sesión".
                        Con el menú de la cuenta encima, eran tres accesos a lo
                        mismo en cien píxeles (el bloque de arriba lo abre, y el
                        menú vuelve a ofrecerlo) — y el menú, que se despliega
                        hacia arriba, tapaba el botón mientras estaba abierto.
                        La salida vive donde se busca: en el avatar. El selector
                        de tema se queda porque es de un clic y se usa a diario;
                        dentro del menú costaría dos. */}
                </div>
            </aside>

            {/* ====== MAIN CONTENT ====== */}
            {/* max-md:overflow-x-hidden — en móvil ningún contenido provoca scroll horizontal
                de página (evita que aparezca la barra y "descoloque" al hacer scroll vertical).
                Las tablas que necesitan scroll-x tienen su propio contenedor overflow-x-auto. */}
            <main className="flex-1 overflow-y-auto max-md:overflow-x-hidden h-full relative">
                {/* ====== TOP BAR MÓVIL (hamburguesa + logo) — solo en móvil ====== */}
                <div className="md:hidden sticky top-0 z-30 flex items-center gap-3 h-14 px-3 bg-bkg-deep/95 backdrop-blur-md border-b border-white/[0.06]">
                    <button
                        onClick={() => setMobileMenuOpen(true)}
                        className="w-10 h-10 flex items-center justify-center rounded-xl text-white/70 hover:text-brand hover:bg-white/5 active:scale-90 transition-all"
                        aria-label="Abrir menú"
                    >
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                        </svg>
                    </button>
                    {/* El avatar de la barra ABRE EL MENÚ DE LA CUENTA. En el móvil
                        cerrar sesión estaba a dos pasos escondidos: abrir el cajón
                        lateral y bajar hasta el fondo. Aquí está donde se toca. */}
                    <button
                        ref={topbarAvatarRef}
                        type="button"
                        onClick={() => setUserMenu('topbar')}
                        aria-haspopup="menu"
                        aria-expanded={userMenu === 'topbar'}
                        aria-label="Mi cuenta"
                        className="flex items-center gap-2 min-w-0 flex-1 rounded-xl px-1 py-1 -mx-1 active:scale-95 transition-transform"
                    >
                        {isStaff ? (
                            user?.avatar_url ? (
                                <img src={user.avatar_url} alt="Foto de perfil" className="h-8 w-8 object-cover rounded-full border border-white/10" />
                            ) : (
                                <img src="/logo-brokergy-admin.png" alt="Brokergy" className="h-7 w-auto object-contain" />
                            )
                        ) : user?.logo_empresa ? (
                            <img src={user.logo_empresa} alt="" className="h-7 w-auto max-w-[140px] object-contain" />
                        ) : (
                            <span className="text-sm font-black uppercase tracking-wider text-brand truncate">
                                {(user?.acronimo || user?.razon_social || 'Brokergy')}
                            </span>
                        )}
                        <svg className="w-3.5 h-3.5 text-white/30 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>
                    {/* Selector de tema (acceso rápido en móvil) */}
                    <ThemeToggle collapsed className="w-9 h-9 flex-shrink-0" />
                </div>

                {/* Subtle Background Accent */}
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-brand/[0.03] rounded-full blur-[120px] pointer-events-none"></div>
                {children}
            </main>

            {/* ====== MENÚ DE LA CUENTA ====== */}
            <UserMenu
                open={!!userMenu}
                onClose={() => setUserMenu(null)}
                anchorRef={userMenu === 'topbar' ? topbarAvatarRef : perfilRef}
                canOpenProfile={canOpenProfile}
                onProfile={openProfile}
            />

            {/* ====== MI PERFIL (partner) ====== */}
            {showProfile && miPrescriptor && (
                <PrescriptorDetailModal
                    isOpen={showProfile}
                    prescriptor={miPrescriptor}
                    onClose={() => setShowProfile(false)}
                    onUpdated={(updated) => setMiPrescriptor(updated)}
                    onSignOut={signOut}
                />
            )}

            {/* ====== MI PERFIL (usuario interno: ADMIN / CERTIFICADOR) ====== */}
            {showAdminProfile && (
                <AdminProfileModal
                    isOpen={showAdminProfile}
                    onClose={() => setShowAdminProfile(false)}
                />
            )}
        </div>
    );
}
