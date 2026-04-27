import React, { createContext, useContext, useState, useCallback } from 'react';

const ModalContext = createContext();

export const useModal = () => {
    const context = useContext(ModalContext);
    if (!context) {
        throw new Error('useModal must be used within a ModalProvider');
    }
    return context;
};

export const ModalProvider = ({ children }) => {
    const [modal, setModal] = useState({
        isOpen: false,
        type: 'alert', // 'alert' or 'confirm'
        title: '',
        message: '',
        onConfirm: null,
        onCancel: null,
        confirmText: 'Aceptar',
        cancelText: 'Cancelar',
        variant: 'info' // 'info', 'warning', 'error', 'success'
    });

    const showAlert = useCallback((message, title = 'Aviso', variant = 'info') => {
        return new Promise((resolve) => {
            setModal({
                isOpen: true,
                type: 'alert',
                title,
                message,
                variant,
                confirmText: 'Aceptar',
                onConfirm: () => {
                    setModal(prev => ({ ...prev, isOpen: false }));
                    resolve();
                }
            });
        });
    }, []);

    const showConfirm = useCallback((message, title = 'Confirmar', variant = 'warning') => {
        return new Promise((resolve) => {
            setModal({
                isOpen: true,
                type: 'confirm',
                title,
                message,
                variant,
                confirmText: 'Confirmar',
                cancelText: 'Cancelar',
                onConfirm: () => {
                    setModal(prev => ({ ...prev, isOpen: false }));
                    resolve(true);
                },
                onCancel: () => {
                    setModal(prev => ({ ...prev, isOpen: false }));
                    resolve(false);
                }
            });
        });
    }, []);

    return (
        <ModalContext.Provider value={{ showAlert, showConfirm }}>
            {children}
            {modal.isOpen && (
                <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className={`bg-slate-900 rounded-2xl max-w-md w-full p-8 border ${
                        modal.variant === 'error' ? 'border-red-500/30' : 
                        modal.variant === 'warning' ? 'border-amber-500/30' : 
                        modal.variant === 'success' ? 'border-emerald-500/30' : 
                        'border-blue-500/30'
                    } shadow-2xl relative animate-in zoom-in-95 duration-200`}>
                        
                        <div className={`absolute top-0 left-0 w-full h-1.5 rounded-t-2xl ${
                            modal.variant === 'error' ? 'bg-red-500' : 
                            modal.variant === 'warning' ? 'bg-amber-500' : 
                            modal.variant === 'success' ? 'bg-emerald-500' : 
                            'bg-blue-500'
                        }`}></div>

                        <div className="flex flex-col items-center text-center">
                            <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 border ${
                                modal.variant === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-500' : 
                                modal.variant === 'warning' ? 'bg-amber-500/10 border-amber-500/20 text-amber-500' : 
                                modal.variant === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' : 
                                'bg-blue-500/10 border-blue-500/20 text-blue-500'
                            }`}>
                                {modal.variant === 'error' && (
                                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                )}
                                {modal.variant === 'warning' && (
                                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                )}
                                {modal.variant === 'success' && (
                                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                )}
                                {modal.variant === 'info' && (
                                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                )}
                            </div>

                            <h3 className="text-2xl font-bold text-white mb-2">{modal.title}</h3>
                            <p className="text-slate-400 mb-8 text-sm whitespace-pre-wrap leading-relaxed">
                                {modal.message}
                            </p>

                            <div className="flex gap-3 w-full">
                                {modal.type === 'confirm' && (
                                    <button
                                        className="flex-1 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold rounded-xl transition-all"
                                        onClick={modal.onCancel}
                                    >
                                        {modal.cancelText}
                                    </button>
                                )}
                                <button
                                    className={`py-3 font-black rounded-xl transition-all shadow-lg ${
                                        modal.type === 'confirm' ? 'flex-[1.5]' : 'w-full'
                                    } ${
                                        modal.variant === 'error' ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-500/20' : 
                                        modal.variant === 'warning' ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-500/20' : 
                                        modal.variant === 'success' ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/20' : 
                                        'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/20'
                                    }`}
                                    onClick={modal.onConfirm}
                                >
                                    {modal.confirmText}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </ModalContext.Provider>
    );
};
