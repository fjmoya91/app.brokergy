import React from 'react';

const AppConfirm = ({ isOpen, title, message, onConfirm, onCancel, confirmText = "Confirmar", cancelText = "Cancelar", type = "info" }) => {
    if (!isOpen) return null;

    const icon = type === 'warning' ? (
        <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-500 mb-4">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
        </div>
    ) : (
        <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-500 mb-4">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
        </div>
    );

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
            <div className="glass-card max-w-sm w-full p-8 border border-white/20 shadow-2xl animate-scale-in bg-[#1c1e26]">
                <div className="flex flex-col items-center text-center">
                    {confirmText || cancelText ? icon : (
                        <div className="w-12 h-12 border-4 border-primary-500/30 border-t-primary-500 rounded-full animate-spin mb-6"></div>
                    )}
                    <h3 className="text-2xl font-bold text-white mb-3">{title}</h3>
                    <div className="text-white/80 text-base leading-relaxed mb-6 whitespace-pre-wrap">{message}</div>
                    
                    <div className="flex w-full gap-3">
                        {cancelText && (
                            <button 
                                onClick={onCancel}
                                className="flex-1 px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white font-medium transition-all"
                            >
                                {cancelText}
                            </button>
                        )}
                        {confirmText && (
                            <button 
                                onClick={onConfirm}
                                className={`flex-1 px-4 py-3 rounded-xl font-bold text-white transition-all ${
                                    type === 'warning' ? 'bg-amber-600 hover:bg-amber-500' : 'bg-primary-600 hover:bg-primary-500'
                                }`}
                            >
                                {confirmText}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AppConfirm;
