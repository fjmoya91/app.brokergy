import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { EncargarPresentacionModal } from '../../expedientes/components/EncargarPresentacionModal';

// ─── Los CEE de Fran sin registrar: encargárselos a EVA ─────────────────────
// La tarjeta «Eva» de Despachar (bloque REGISTRO, `aEva` en seguimientoRadar.js).
// No es un mensaje en bloque: cada CEE sale con SU encargo —correo con el borrador
// y los tres ficheros, y su enlace revocable— por el MISMO popup que el módulo CEE
// (`EncargarPresentacionModal`). Aquí solo se listan y se van despachando uno a uno.
//
// Los ya encargados vuelven a salir pasados unos días: «Volver a enviar» le manda
// otro correo, y el popup avisa de que el enlace anterior deja de valer.

export function PresentarEvaModal({ grupo, onCerrar, onHecho }) {
    const [abierto, setAbierto] = useState(null);          // { expediente_id, scope, numero_expediente }
    const [enviados, setEnviados] = useState(() => new Set());
    const lista = [...(grupo.expedientes || []), ...(grupo.opcionales || [])];
    const clave = (e) => `${e.expediente_id}:${e.scope}`;

    const cerrar = () => (enviados.size ? onHecho(enviados.size) : onCerrar());

    return createPortal(
        <>
            <div className="fixed inset-0 z-[80] bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-6" onClick={cerrar}>
                <div className="w-full sm:max-w-xl bg-bkg-surface border-t sm:border border-white/10 rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[88dvh] flex flex-col overflow-hidden"
                    onClick={e => e.stopPropagation()}>
                    <div className="flex items-start gap-3 px-5 py-4 border-b border-white/[0.06] shrink-0">
                        <div className="flex-1 min-w-0">
                            <h3 className="font-black text-white text-[15px] leading-tight">Enviar a presentar a {grupo.destinatario?.nombre || 'Eva'}</h3>
                            <p className="text-[11px] text-white/40 mt-1 leading-snug">
                                CEE de Fran con el visto bueno y sin registrar. Cada uno sale con su correo: el borrador
                                del Registro, el .cex, el .xml y el PDF firmado.
                            </p>
                        </div>
                        <button type="button" onClick={cerrar}
                            className="w-9 h-9 shrink-0 flex items-center justify-center rounded-xl hover:bg-white/5 text-white/40">✕</button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
                        {lista.map(e => {
                            const hecho = enviados.has(clave(e));
                            return (
                                <div key={clave(e)} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${e.vencida ? 'bg-white/[0.03]' : 'bg-white/[0.015] opacity-70'}`}>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-black text-brand text-[11px] tabular-nums">{e.numero_expediente}</span>
                                            <span className="text-[10px] font-bold text-white/30">{e.scope === 'final' ? 'CEE final' : 'CEE inicial'}</span>
                                            {!e.vencida && <span className="text-[9px] font-black uppercase tracking-wider text-white/25">en plazo</span>}
                                        </div>
                                        <div className="text-[10px] text-white/35 truncate">{e.cliente_nombre || e.municipio || '—'}</div>
                                    </div>
                                    {hecho ? (
                                        <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 whitespace-nowrap">✓ Hecho</span>
                                    ) : (
                                        <button type="button" onClick={() => setAbierto(e)}
                                            className="px-3 py-2 rounded-xl border border-brand/40 bg-brand/15 text-brand text-[10px] font-black uppercase tracking-wider hover:bg-brand hover:text-black transition-colors whitespace-nowrap">
                                            ✉ Enviar
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    <div className="flex justify-end px-5 py-3.5 border-t border-white/[0.06] shrink-0 max-md:pb-[max(0.875rem,env(safe-area-inset-bottom))]">
                        <button type="button" onClick={cerrar}
                            className="px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-white/60 hover:text-white">
                            {enviados.size ? `Hecho (${enviados.size})` : 'Cerrar'}
                        </button>
                    </div>
                </div>
            </div>

            {abierto && (
                <EncargarPresentacionModal isOpen
                    onClose={() => setAbierto(null)}
                    apiBase="/api/expedientes"
                    expedienteId={abierto.expediente_id}
                    fase={abierto.scope}
                    onEnviado={() => setEnviados(s => new Set(s).add(clave(abierto)))} />
            )}
        </>,
        document.body,
    );
}

export default PresentarEvaModal;
