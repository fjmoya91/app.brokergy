import React from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Quién FIRMA por el Sujeto Obligado.
//
// Una empresa puede tener varios apoderados —en INTERNACIONAL DE ALCOHOLES firman
// el administrador y el director de operaciones— y cuál de ellos firma cada lote
// lo decide una persona: su nombre y su NIF van IMPRESOS en la casilla
// "Representante del solicitante" de cada ficha RES y en la solicitud de emisión.
// Con uno solo declarado no hay nada que elegir y el selector no se pinta: una
// pregunta cuya respuesta no puede cambiar se contesta sin leerla.
//
// Los firmantes se declaran en la FICHA del S.O. (el principal en su bloque de
// siempre; los demás, en "Otros apoderados"), nunca aquí.
// ─────────────────────────────────────────────────────────────────────────────

export function FirmantePicker({ representantes = [], value, onChange, nota = null }) {
    if (!Array.isArray(representantes) || representantes.length < 2) return null;

    return (
        <div>
            <label className="block text-[9px] uppercase tracking-widest font-black text-white/30 mb-2">
                Firma por el Sujeto Obligado
            </label>
            <div className="space-y-1.5">
                {representantes.map(r => {
                    const checked = r.id === value;
                    return (
                        <label key={r.id}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-all ${checked ? 'border-brand/40 bg-brand/5' : 'border-white/[0.06] bg-bkg-surface hover:border-white/15'}`}>
                            <input type="radio" checked={checked} onChange={() => onChange?.(r.id)}
                                className="w-4 h-4 accent-brand shrink-0" />
                            <div className="min-w-0 flex-1">
                                <p className="text-[12px] font-bold text-white truncate">{r.nombre || '—'}</p>
                                <p className="text-[10px] text-white/40 truncate">
                                    {r.nif || 'sin NIF'}{r.cargo ? ` · ${r.cargo}` : ''}
                                </p>
                            </div>
                            {r.principal && (
                                <span className="shrink-0 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider border text-white/40 border-white/10 bg-white/[0.03]">
                                    En la ficha
                                </span>
                            )}
                        </label>
                    );
                })}
            </div>
            <p className="mt-1.5 text-[10px] text-white/30">
                {nota || 'Su nombre y NIF se imprimen en la casilla “Representante del solicitante” de cada ficha.'}
            </p>
        </div>
    );
}

export default FirmantePicker;
