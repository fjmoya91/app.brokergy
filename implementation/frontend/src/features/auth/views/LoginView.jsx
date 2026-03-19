import React, { useState } from 'react';
import { useAuth } from '../../../context/AuthContext';

export function LoginView({ onBack, onSuccess }) {
    const { signIn, resetPassword, loading } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isResetMode, setIsResetMode] = useState(false);
    const [localLoading, setLocalLoading] = useState(false);
    const [error, setError] = useState(null);
    const [msg, setMsg] = useState(null);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setMsg(null);
        setLocalLoading(true);

        try {
            const cleanEmail = email.trim();
            const cleanPassword = password.trim();

            if (isResetMode) {
                const { error: resetErr } = await resetPassword(cleanEmail);
                if (resetErr) throw resetErr;
                setMsg('Te hemos enviado un enlace para recuperar tu contraseña.');
            } else {
                const { error: signErr } = await signIn(cleanEmail, cleanPassword);
                if (signErr) throw signErr;
                if (onSuccess) onSuccess();
            }
        } catch (err) {
            console.error('Error Auth:', err);
            setError(err.message || 'Error en la autenticación. Revisa las credenciales.');
        } finally {
            setLocalLoading(false);
        }
    };

    return (
        <div className="w-full max-w-md relative z-10 px-4">

                <div className="text-center mb-10 relative">
                    {/* Decorative background elements inside the title area too? No, mainly around card */}
                    <div className="absolute -top-24 -left-24 w-64 h-64 bg-amber-500/10 rounded-full blur-[100px] pointer-events-none animate-pulse"></div>
                    
                    <h1 className="flex items-baseline justify-center gap-x-2 md:gap-x-4 mb-2 relative z-10">
                         <span className="text-white text-3xl md:text-4xl font-medium tracking-tight">Portal</span>
                         <span className="text-4xl md:text-6xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-brand via-brand to-brand-700">
                              BROKERGY
                         </span>
                         <span className="text-[10px] font-bold text-white/20 self-center mt-1">v2.0</span>
                    </h1>
                    <p className="text-white/60 text-sm md:text-base relative z-10">
                         Acceso exclusivo para prescriptores y administradores.
                    </p>
                </div>

                <div className="relative group">
                    <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-orange-600/10 rounded-full blur-[100px] pointer-events-none animate-pulse" style={{ animationDelay: '2s' }}></div>
                    <div className="bg-bkg-surface shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/[0.06] rounded-[2rem] p-10 relative overflow-hidden backdrop-blur-xl">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-brand/40 to-transparent"></div>

                    {onBack && (
                         <button
                            onClick={onBack}
                            className="mb-6 flex items-center gap-2 text-white/60 hover:text-white transition-colors group"
                         >
                             <svg className="w-5 h-5 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                             </svg>
                             Volver
                         </button>
                    )}



                    <div className="text-center mb-8">
                        <h2 className="text-3xl font-black text-white mb-2 tracking-tight">
                            {isResetMode ? 'Recuperar Acceso' : 'Iniciar Sesión'}
                        </h2>
                        <p className="text-white/40 text-sm">
                            {isResetMode 
                                ? 'Introduce tu email para resetear la contraseña.' 
                                : 'Accede a tu panel para gestionar tus simulaciones.'}
                        </p>
                    </div>

                    {error && (
                        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm flex gap-3 items-start">
                            <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span>{error}</span>
                        </div>
                    )}
                    
                    {msg && (
                        <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-sm flex gap-3 items-start">
                            <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            <span>{msg}</span>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label className="block text-sm font-semibold text-white/60 mb-1.5" htmlFor="email">Email de acceso</label>
                            <input
                                id="email"
                                type="email"
                                required
                                className="w-full bg-bkg-elevated border border-white/[0.1] rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-colors"
                                placeholder="mi@email.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                disabled={localLoading || loading}
                            />
                        </div>

                        {!isResetMode && (
                            <div>
                                <div className="flex justify-between items-center mb-1.5">
                                    <label className="block text-sm font-semibold text-white/60" htmlFor="password">Contraseña</label>
                                    <button
                                        type="button"
                                        onClick={() => setIsResetMode(true)}
                                        className="text-xs text-brand hover:text-brand-300 transition-colors"
                                    >
                                        ¿Olvidaste tu contraseña?
                                    </button>
                                </div>
                                <input
                                    id="password"
                                    type="password"
                                    required
                                    className="w-full bg-bkg-elevated border border-white/[0.1] rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-colors"
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    disabled={localLoading || loading}
                                />
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={localLoading || loading}
                            className="w-full py-3.5 mt-2 bg-gradient-to-r from-brand to-brand-700 hover:from-brand-400 hover:to-brand-600 text-bkg-deep font-bold rounded-xl transition-all shadow-lg shadow-brand/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {(localLoading || loading) && (
                                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                            )}
                            {isResetMode ? 'Enviar instrucciones' : 'Acceder al Portal'}
                        </button>

                        {isResetMode && (
                             <button
                                type="button"
                                onClick={() => { setIsResetMode(false); setMsg(null); setError(null); }}
                                className="w-full py-3 text-white/30 text-xs font-black uppercase tracking-widest hover:text-white transition-colors"
                            >
                                Volver al login
                            </button>
                        )}
                    </form>
                </div>
                
                <p className="text-center mt-8 text-[10px] uppercase font-black tracking-[0.2em] text-white/20">
                    Sistema de Gestión Brokergy &copy; {new Date().getFullYear()}
                </p>
            </div>
        </div>
    );
}
