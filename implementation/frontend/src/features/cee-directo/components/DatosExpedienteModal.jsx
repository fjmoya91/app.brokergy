import { useState } from 'react';
import { DatosExpediente } from './DatosExpediente';

// ─────────────────────────────────────────────────────────────────────────────
// El formulario de datos, en un modal.
//
// El formulario no cambia: es el MISMO componente, con su autoguardado. Lo único
// que cambia es dónde vive — antes ocupaba media ficha del expediente para algo
// que se rellena una vez y luego solo se consulta.
//
// No lleva botón de Guardar porque no lo necesita: se guarda solo mientras
// escribes, y el estado ("Guardando… / ✓ Guardado") va dentro. Se cierra con la
// X, con Escape o pulsando fuera — al no haber nada pendiente de confirmar, un
// clic fuera no puede perder nada.
// ─────────────────────────────────────────────────────────────────────────────

export function DatosExpedienteModal({ isOpen, onClose, expediente, prescriptores, onGuardado, puedeEditar, onAbrirCliente }) {
    // El estado del autoguardado lo emite el formulario y se pinta aquí arriba,
    // donde se ve sin bajar la vista.
    const [estado, setEstado] = useState('guardado');
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex items-end md:items-center justify-center md:p-6"
            onClick={onClose}>
            <div
                onClick={e => e.stopPropagation()}
                onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
                className="bg-bkg-deep border border-white/10 w-full md:max-w-3xl md:rounded-2xl rounded-t-3xl max-h-[92vh] flex flex-col">

                <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06] shrink-0">
                    <div className="min-w-0">
                        <h2 className="text-sm font-black text-white uppercase tracking-widest truncate">
                            {expediente.numero_expediente}
                        </h2>
                        <p className="text-[11px] text-white/35 mt-0.5">Datos del expediente</p>
                    </div>
                    {puedeEditar && (
                        <span className={`ml-auto mr-3 text-[10px] font-black uppercase tracking-widest transition-colors ${
                            estado === 'error' ? 'text-red-400' : estado === 'guardando' ? 'text-white/35' : 'text-emerald-400/70'
                        }`}>
                            {estado === 'error' ? 'Sin guardar' : estado === 'guardando' ? 'Guardando…' : '✓ Guardado'}
                        </span>
                    )}
                    <button onClick={onClose}
                        className="w-9 h-9 shrink-0 rounded-lg hover:bg-white/5 text-white/40 hover:text-white transition-colors text-xl leading-none">
                        ×
                    </button>
                </div>

                <div className="overflow-y-auto p-5"
                    style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}>
                    <DatosExpediente
                        expediente={expediente}
                        prescriptores={prescriptores}
                        puedeEditar={puedeEditar}
                        onGuardado={onGuardado}
                        onAbrirCliente={onAbrirCliente}
                        onEstado={setEstado}
                        sinMarco
                    />
                </div>
            </div>
        </div>
    );
}

export default DatosExpedienteModal;
