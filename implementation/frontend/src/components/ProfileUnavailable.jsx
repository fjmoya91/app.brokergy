import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

// Pantalla para cuando la sesión es válida pero NO hemos podido leer el perfil
// (rol, empresa, logo). Existe porque la alternativa era peor que un error: la app
// montaba el dashboard con el usuario pelado de Supabase y, sin rol ni empresa,
// enseñaba "USUARIO", el logo de relleno, un menú recortado y una cartera a cero.
// Todo con apariencia de dato bueno — el partner lo lee como que ha perdido su
// trabajo, no como que la base de datos está tosiendo.
//
// Por eso aquí se dice las dos cosas que hacen falta: que es TEMPORAL y que sus
// datos siguen ahí. Y un solo botón, porque la salida real es reintentar.
const ProfileUnavailable = ({ mensaje }) => {
    const { retryProfile, signOut } = useAuth();
    const [reintentando, setReintentando] = useState(false);

    const reintentar = async () => {
        setReintentando(true);
        try { await retryProfile(); } finally { setReintentando(false); }
    };

    return (
        <div className="flex items-center justify-center min-h-[70vh] px-4">
            <div className="w-full max-w-md rounded-3xl border border-white/[0.06] bg-bkg-surface/40 p-8 text-center shadow-2xl shadow-black/30">
                <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-500/20 bg-amber-500/10">
                    <svg className="h-6 w-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                    </svg>
                </div>

                <h1 className="text-lg font-black uppercase tracking-widest text-white">No hemos podido cargar tu perfil</h1>

                <p className="mt-3 text-sm leading-relaxed text-white/50">
                    {mensaje || 'Es un problema temporal de conexión con nuestros servidores.'}
                    {' '}Tus oportunidades y expedientes <span className="text-white/80">siguen ahí</span>: no se ha perdido nada.
                </p>

                <button
                    onClick={reintentar}
                    disabled={reintentando}
                    className="mt-7 w-full rounded-2xl bg-brand px-5 py-3.5 text-xs font-black uppercase tracking-widest text-black transition-opacity disabled:opacity-50"
                >
                    {reintentando ? 'Reintentando…' : 'Reintentar'}
                </button>

                <button
                    onClick={signOut}
                    className="mt-3 w-full py-2 text-[10px] font-black uppercase tracking-widest text-white/25 transition-colors hover:text-white/50"
                >
                    Cerrar sesión
                </button>
            </div>
        </div>
    );
};

export default ProfileUnavailable;
