import React, { useState, useEffect } from 'react';
import axios from 'axios';

/**
 * Vista para restablecer la contraseña.
 * Se accede desde el enlace del email: /reset-password?token=xxx
 */
export function ResetPasswordView({ token, onBackToLogin }) {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [verifying, setVerifying] = useState(true);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(false);
    const [tokenValid, setTokenValid] = useState(false);
    const [email, setEmail] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    // Verificar token al montar
    useEffect(() => {
        if (!token) {
            setError('No se proporcionó un token válido.');
            setVerifying(false);
            return;
        }

        const verify = async () => {
            try {
                const res = await axios.get(`/api/auth/verify-token?token=${token}`);
                if (res.data.valid) {
                    setTokenValid(true);
                    setEmail(res.data.email);
                } else {
                    setError(res.data.error || 'Enlace inválido.');
                }
            } catch (err) {
                setError('No se pudo verificar el enlace. Puede haber expirado.');
            } finally {
                setVerifying(false);
            }
        };

        verify();
    }, [token]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);

        if (password.length < 6) {
            setError('La contraseña debe tener al menos 6 caracteres.');
            return;
        }
        if (password !== confirmPassword) {
            setError('Las contraseñas no coinciden.');
            return;
        }

        setLoading(true);
        try {
            const res = await axios.post('/api/auth/reset-password', {
                token,
                password,
            });

            if (res.data.success) {
                setSuccess(true);
            }
        } catch (err) {
            setError(err.response?.data?.error || 'Error al actualizar la contraseña.');
        } finally {
            setLoading(false);
        }
    };

    // Loading state while verifying token
    if (verifying) {
        return (
            <div className="w-full max-w-md relative z-10 px-4">
                <div className="text-center mb-10">
                    <h1 className="flex items-baseline justify-center gap-x-2 md:gap-x-4 mb-2">
                        <span className="text-white text-3xl md:text-4xl font-medium tracking-tight">Portal</span>
                        <span className="text-4xl md:text-6xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-brand via-brand to-brand-700">
                            BROKERGY
                        </span>
                    </h1>
                </div>
                <div className="bg-bkg-surface shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/[0.06] rounded-[2rem] p-10 backdrop-blur-xl text-center">
                    <div className="inline-flex items-center gap-3">
                        <svg className="w-6 h-6 animate-spin text-brand" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span className="text-white/60">Verificando enlace...</span>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full max-w-md relative z-10 px-4">
            {/* Decorative */}
            <div className="text-center mb-10 relative">
                <div className="absolute -top-24 -left-24 w-64 h-64 bg-amber-500/10 rounded-full blur-[100px] pointer-events-none animate-pulse"></div>
                
                <h1 className="flex items-baseline justify-center gap-x-2 md:gap-x-4 mb-2 relative z-10">
                    <span className="text-white text-3xl md:text-4xl font-medium tracking-tight">Portal</span>
                    <span className="text-4xl md:text-6xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-brand via-brand to-brand-700">
                        BROKERGY
                    </span>
                </h1>
                <p className="text-white/60 text-sm md:text-base relative z-10">
                    Restablecer contraseña
                </p>
            </div>

            <div className="relative group">
                <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-orange-600/10 rounded-full blur-[100px] pointer-events-none animate-pulse" style={{ animationDelay: '2s' }}></div>
                <div className="bg-bkg-surface shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/[0.06] rounded-[2rem] p-10 relative overflow-hidden backdrop-blur-xl">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-brand/40 to-transparent"></div>

                    {/* Success state */}
                    {success && (
                        <div className="text-center animate-fade-in">
                            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                                <svg className="w-10 h-10 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                            <h2 className="text-2xl font-black text-white mb-3 tracking-tight">
                                ¡Contraseña Actualizada!
                            </h2>
                            <p className="text-white/50 text-sm mb-8">
                                Tu contraseña ha sido cambiada correctamente. Ya puedes acceder con tu nueva contraseña.
                            </p>
                            <button
                                onClick={onBackToLogin}
                                className="w-full py-3.5 bg-gradient-to-r from-brand to-brand-700 hover:from-brand-400 hover:to-brand-600 text-bkg-deep font-bold rounded-xl transition-all shadow-lg shadow-brand/20 flex items-center justify-center gap-2"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                                </svg>
                                Ir al Login
                            </button>
                        </div>
                    )}

                    {/* Error state (invalid/expired token) */}
                    {!tokenValid && !success && (
                        <div className="text-center animate-fade-in">
                            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                                <svg className="w-10 h-10 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                                </svg>
                            </div>
                            <h2 className="text-2xl font-black text-white mb-3 tracking-tight">
                                Enlace No Válido
                            </h2>
                            <p className="text-white/50 text-sm mb-8">
                                {error}
                            </p>
                            <button
                                onClick={onBackToLogin}
                                className="w-full py-3.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2"
                            >
                                Volver al Login
                            </button>
                        </div>
                    )}

                    {/* Reset form */}
                    {tokenValid && !success && (
                        <>
                            <div className="text-center mb-8">
                                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-brand/10 border border-brand/20 flex items-center justify-center">
                                    <svg className="w-8 h-8 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                                    </svg>
                                </div>
                                <h2 className="text-2xl font-black text-white mb-2 tracking-tight">
                                    Nueva Contraseña
                                </h2>
                                <p className="text-white/40 text-sm">
                                    Establece una nueva contraseña para <strong className="text-white/70">{email}</strong>
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

                            <form onSubmit={handleSubmit} className="space-y-5">
                                <div>
                                    <label className="block text-sm font-semibold text-white/60 mb-1.5" htmlFor="new-password">
                                        Nueva contraseña
                                    </label>
                                    <div className="relative">
                                        <input
                                            id="new-password"
                                            type={showPassword ? 'text' : 'password'}
                                            required
                                            minLength={6}
                                            className="no-uppercase w-full bg-bkg-elevated border border-white/[0.1] rounded-xl px-4 py-3 pr-12 text-white placeholder-white/30 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-colors"
                                            placeholder="Mínimo 6 caracteres"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            disabled={loading}
                                            autoFocus
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                                            tabIndex={-1}
                                        >
                                            {showPassword ? (
                                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                                                </svg>
                                            ) : (
                                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                </svg>
                                            )}
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-white/60 mb-1.5" htmlFor="confirm-password">
                                        Confirmar contraseña
                                    </label>
                                    <input
                                        id="confirm-password"
                                        type={showPassword ? 'text' : 'password'}
                                        required
                                        minLength={6}
                                        className="no-uppercase w-full bg-bkg-elevated border border-white/[0.1] rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-colors"
                                        placeholder="Repite la nueva contraseña"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        disabled={loading}
                                    />
                                    {confirmPassword && password !== confirmPassword && (
                                        <p className="mt-1.5 text-xs text-red-400 flex items-center gap-1">
                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                            Las contraseñas no coinciden
                                        </p>
                                    )}
                                    {confirmPassword && password === confirmPassword && password.length >= 6 && (
                                        <p className="mt-1.5 text-xs text-emerald-400 flex items-center gap-1">
                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                            </svg>
                                            Las contraseñas coinciden
                                        </p>
                                    )}
                                </div>

                                {/* Password strength indicator */}
                                {password && (
                                    <div className="space-y-1.5">
                                        <div className="flex gap-1.5">
                                            <div className={`h-1 flex-1 rounded-full transition-colors ${password.length >= 6 ? 'bg-red-400' : 'bg-white/10'}`}></div>
                                            <div className={`h-1 flex-1 rounded-full transition-colors ${password.length >= 8 ? 'bg-amber-400' : 'bg-white/10'}`}></div>
                                            <div className={`h-1 flex-1 rounded-full transition-colors ${password.length >= 10 && /[A-Z]/.test(password) && /\d/.test(password) ? 'bg-emerald-400' : 'bg-white/10'}`}></div>
                                        </div>
                                        <p className="text-[11px] text-white/30">
                                            {password.length < 6 ? 'Muy corta' : 
                                             password.length < 8 ? 'Aceptable' :
                                             password.length >= 10 && /[A-Z]/.test(password) && /\d/.test(password) ? 'Fuerte' : 'Buena'}
                                        </p>
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={loading || password.length < 6 || password !== confirmPassword}
                                    className="w-full py-3.5 mt-2 bg-gradient-to-r from-brand to-brand-700 hover:from-brand-400 hover:to-brand-600 text-bkg-deep font-bold rounded-xl transition-all shadow-lg shadow-brand/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {loading && (
                                        <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                    )}
                                    {loading ? 'Actualizando...' : 'Actualizar Contraseña'}
                                </button>
                            </form>
                        </>
                    )}
                </div>

                <p className="text-center mt-8 text-[10px] uppercase font-black tracking-[0.2em] text-white/20">
                    Sistema de Gestión Brokergy &copy; {new Date().getFullYear()}
                </p>
            </div>
        </div>
    );
}
