/**
 * DocsAdminModal — superficie de documentación dentro del panel (modo admin).
 *
 * Reemplaza al antiguo SubirFotosModal. Usa el mismo núcleo <DocsManager> que el
 * enlace público, pero autenticado: el admin puede subir, ver y VALIDAR/RECHAZAR
 * foto a foto. El instalador (no admin) puede subir y ver, sin validar.
 */

import React from 'react';
import { useAuth } from '../../../context/AuthContext';
import { DocsManager } from '../../docs/DocsManager';

export function DocsAdminModal({ isOpen, onClose, idOportunidad }) {
    const { user } = useAuth();
    if (!isOpen) return null;

    const canValidate = (user?.rol || user?.rol_nombre || '').toUpperCase() === 'ADMIN';

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md" onClick={onClose}>
            <div className="bg-[#0F1013] border border-white/10 rounded-3xl overflow-hidden shadow-2xl relative max-w-2xl w-full flex flex-col max-h-[92vh]" onClick={e => e.stopPropagation()}>
                <div className="px-6 py-4 bg-slate-900 border-b border-white/10 flex justify-between items-center shrink-0">
                    <h3 className="text-white font-black uppercase tracking-widest flex items-center gap-3 text-base">
                        <span className="text-amber-400 text-xl">📸</span>
                        Documentación del expediente
                    </h3>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-all">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                <div className="p-5 md:p-6 overflow-y-auto bg-[#0F1013] flex-1 text-white">
                    {idOportunidad ? (
                        <DocsManager mode="admin" idOrUuid={idOportunidad} embedded canValidate={canValidate} />
                    ) : (
                        <p className="text-white/50 text-sm text-center py-10">Guarda la oportunidad antes de gestionar su documentación.</p>
                    )}
                </div>
            </div>
        </div>
    );
}

export default DocsAdminModal;
