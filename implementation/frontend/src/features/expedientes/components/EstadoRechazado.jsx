import React from 'react';
import { claseEstado, tooltipRechazo, etiquetaMotivoRechazo } from '../logic/rechazoExpediente';

// Lo que sustituye al selector de estado cuando el expediente está RECHAZADO:
// el badge en rojo con el motivo en su tooltip y un botón "Reabrir".
//
// No es un <select> a propósito: de RECHAZADO solo se sale reabriendo, que
// devuelve el estado previo guardado. Ofrecer el resto de estados sería
// ofrecer algo que el backend va a rechazar (PUT → 409).
export default function EstadoRechazado({ expediente, onReabrir, reabriendo = false, puedeReabrir = true, className = '' }) {
    const tip = tooltipRechazo(expediente);
    return (
        <div className={`flex items-center gap-1.5 min-w-0 ${className}`} onClick={e => e.stopPropagation()}>
            <span
                title={tip}
                aria-label={tip}
                tabIndex={0}
                className={`inline-flex items-center gap-1 min-w-0 text-[9px] font-black uppercase tracking-wider border rounded-lg px-2 py-1 leading-tight cursor-help ${claseEstado('RECHAZADO')}`}
            >
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                <span className="truncate">
                    Rechazado
                    {expediente?.motivo_rechazo_cat && (
                        <span className="font-bold text-red-300/70 normal-case tracking-normal"> · {etiquetaMotivoRechazo(expediente.motivo_rechazo_cat)}</span>
                    )}
                </span>
            </span>
            {puedeReabrir && onReabrir && (
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onReabrir(expediente); }}
                    disabled={reabriendo}
                    title={expediente?.estado_previo_rechazo
                        ? `Reabrir: vuelve a «${expediente.estado_previo_rechazo}»`
                        : 'Reabrir el expediente'}
                    className="shrink-0 text-[9px] font-black uppercase tracking-wider rounded-lg px-2 py-1 border border-white/10 text-white/60 hover:text-white hover:border-brand transition-colors disabled:opacity-40"
                >
                    {reabriendo ? '…' : 'Reabrir'}
                </button>
            )}
        </div>
    );
}
