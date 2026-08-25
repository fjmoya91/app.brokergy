// UserMenu — el menú de la cuenta, donde todo el mundo lo busca.
//
// Cerrar sesión estaba en un botón suelto al final del sidebar y, en pantallas
// cortas, ese botón se quedaba por debajo del borde. Aunque hoy el pie ya no se
// corta, "Salir" al fondo de una barra lateral no es donde nadie lo busca: en
// cualquier app (Gmail, Slack, GitHub, Notion) se pulsa el AVATAR y ahí aparece
// el menú de la cuenta. Este componente es ese menú, y se usa desde los DOS
// sitios donde se ve el avatar: el pie del sidebar y la barra superior del móvil.
//
// REGLA — en móvil es HOJA INFERIOR, no popover anclado. Mismo criterio que el
// resto de la app (TecnicoPicker, los desplegables de la ficha de CEE): un panel
// colgando de un avatar en una pantalla de 375 px se sale o queda ilegible.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useIsMobile } from '../../utils/useIsMobile';

const ANCHO = 268; // px del panel en escritorio

export function UserMenu({ open, onClose, anchorRef, canOpenProfile = false, onProfile }) {
    const { user, signOut } = useAuth();
    const isMobile = useIsMobile();
    const panelRef = useRef(null);
    const [pos, setPos] = useState(null);
    const [saliendo, setSaliendo] = useState(false);

    // Posición en escritorio: se calcula desde el ancla real (el bloque de
    // perfil vive abajo del todo con el sidebar desplegado y arriba en la barra
    // del móvil, así que el menú tiene que saber abrirse hacia los dos lados).
    useLayoutEffect(() => {
        if (!open || isMobile) return;
        const el = anchorRef?.current;
        if (!el) { setPos({ left: 16, top: 16 }); return; }
        const r = el.getBoundingClientRect();
        const alto = panelRef.current?.offsetHeight || 220;
        const hacia_arriba = r.top > window.innerHeight / 2;
        const top = hacia_arriba
            ? Math.max(8, r.top - alto - 8)
            : Math.min(window.innerHeight - alto - 8, r.bottom + 8);
        const left = Math.min(Math.max(8, r.left), window.innerWidth - ANCHO - 8);
        setPos({ left, top });
    }, [open, isMobile, anchorRef]);

    // Escape cierra, como cualquier menú.
    useEffect(() => {
        if (!open) return;
        const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    if (!open) return null;

    const nombre = (user?.acronimo || user?.razon_social || `${user?.nombre || ''} ${user?.apellidos || ''}`).trim() || 'Usuario';
    const rol = (user?.rol || '').toUpperCase();
    const avatarUrl = user?.avatar_url || null;
    const iniciales = user?.acronimo
        ? user.acronimo.substring(0, 2).toUpperCase()
        : `${user?.nombre?.charAt(0) || ''}${user?.apellidos?.charAt(0) || ''}`.toUpperCase() || 'U';

    const cerrarSesion = async () => {
        if (saliendo) return;
        setSaliendo(true);
        try { await signOut(); } finally { onClose?.(); }
    };

    const panelCls = isMobile
        ? 'fixed inset-x-0 bottom-0 z-[401] rounded-t-3xl border-t border-white/10 bg-bkg-deep shadow-2xl animate-slide-up pb-[env(safe-area-inset-bottom)]'
        : 'fixed z-[401] rounded-2xl border border-white/10 bg-bkg-deep shadow-2xl animate-fade-in';

    return (
        <>
            <div
                className="fixed inset-0 z-[400] bg-black/40 md:bg-transparent"
                onClick={onClose}
                aria-hidden="true"
            />
            <div
                ref={panelRef}
                role="menu"
                aria-label="Menú de usuario"
                className={panelCls}
                style={isMobile ? undefined : { width: ANCHO, left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}
            >
                {isMobile && <div className="mx-auto mt-2 mb-1 h-1 w-10 rounded-full bg-white/15" />}

                {/* Quién eres: sin esto, "Cerrar sesión" no dice de qué cuenta se sale */}
                <div className="flex items-center gap-3 p-4 border-b border-white/[0.06]">
                    {avatarUrl ? (
                        <img src={avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover border border-white/10 shrink-0" />
                    ) : (
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand to-brand-700 flex items-center justify-center text-bkg-deep font-black text-xs shrink-0">
                            {iniciales}
                        </div>
                    )}
                    <div className="min-w-0">
                        <p className="text-sm font-black text-white uppercase tracking-tight truncate">{nombre}</p>
                        <p className="text-[11px] text-white/40 font-semibold lowercase truncate">{user?.email}</p>
                        {rol && (
                            <span className="inline-block mt-1 text-[8px] font-black uppercase tracking-[0.2em] text-brand bg-brand/10 border border-brand/20 rounded px-1.5 py-0.5">
                                {rol}
                            </span>
                        )}
                    </div>
                </div>

                <div className="p-2">
                    {canOpenProfile && (
                        <button
                            role="menuitem"
                            onClick={() => { onClose?.(); onProfile?.(); }}
                            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left text-sm font-bold text-white/80 hover:bg-bkg-hover hover:text-white transition-colors"
                        >
                            <svg className="w-5 h-5 shrink-0 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                            Mi perfil
                        </button>
                    )}
                    <button
                        role="menuitem"
                        onClick={cerrarSesion}
                        disabled={saliendo}
                        className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left text-sm font-bold text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors disabled:opacity-60"
                    >
                        <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        {saliendo ? 'Cerrando sesión…' : 'Cerrar sesión'}
                    </button>
                </div>
            </div>
        </>
    );
}

export default UserMenu;
