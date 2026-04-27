import React, { useState } from 'react';

export function QuickNoteModal({ isOpen, onClose, onSave, saving }) {
    const [text, setText] = useState('');

    if (!isOpen) return null;

    const handleSave = () => {
        if (!text.trim()) return;
        onSave(text);
        setText('');
    };

    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-[#0F1013] border border-white/[0.07] rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="px-6 py-5 border-b border-white/[0.07] bg-brand/5">
                    <div className="flex items-center gap-3 text-brand">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                        </svg>
                        <h2 className="text-lg font-black uppercase tracking-tight">Nueva Nota Rápida</h2>
                    </div>
                </div>
                
                <div className="p-6">
                    <textarea
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder="Escribe aquí la nota o comentario para el expediente..."
                        className="w-full bg-white/[0.03] border border-white/10 rounded-xl p-4 text-white text-sm focus:outline-none focus:border-brand/50 min-h-[120px] resize-none"
                        autoFocus
                    />
                    <p className="mt-2 text-[10px] text-white/30 uppercase font-black tracking-widest">
                        Esta nota se guardará en el historial del expediente.
                    </p>
                </div>

                <div className="px-6 py-4 bg-white/[0.02] border-t border-white/[0.07] flex gap-3">
                    <button 
                        onClick={onClose}
                        className="flex-1 px-4 py-2.5 rounded-xl border border-white/10 text-white/50 text-[10px] font-black uppercase tracking-widest hover:text-white hover:border-white/30 transition-all"
                    >
                        Cancelar
                    </button>
                    <button 
                        onClick={handleSave}
                        disabled={saving || !text.trim()}
                        className="flex-1 px-4 py-2.5 rounded-xl bg-brand text-bkg-deep text-[10px] font-black uppercase tracking-widest hover:scale-[1.02] transition-all disabled:opacity-50 disabled:hover:scale-100"
                    >
                        {saving ? 'Guardando...' : 'Guardar Nota'}
                    </button>
                </div>
            </div>
        </div>
    );
}
