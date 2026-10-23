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
//
// `marca`: id de un apoderado al que se le pone una etiqueta (p. ej. «Firmó las
// fichas»), con su texto en `marcaTexto`.
// ─────────────────────────────────────────────────────────────────────────────

export function FirmantePicker({ representantes = [], value, onChange, nota = null, marca = null, marcaTexto = '' }) {
    if (!Array.isArray(representantes) || representantes.length < 2) return null;

    return (
        <div>
            <p className="text-[10px] uppercase tracking-[0.18em] font-black text-white/50 mb-2">
                Firma por el Sujeto Obligado
            </p>
            <div className="space-y-2" role="radiogroup">
                {representantes.map(r => {
                    const checked = r.id === value;
                    return (
                        <label key={r.id}
                            className={`flex items-center gap-3 px-3.5 py-3 rounded-2xl border cursor-pointer transition-colors ${checked
                                ? 'border-brand/45 bg-brand/[0.06]' : 'border-white/[0.09] bg-white/[0.02] hover:border-white/20'}`}>
                            <input type="radio" checked={checked} onChange={() => onChange?.(r.id)}
                                className="w-5 h-5 accent-amber-400 shrink-0" />
                            <div className="min-w-0 flex-1">
                                <p className={`text-[13px] font-bold truncate ${checked ? 'text-white' : 'text-white/75'}`}>{r.nombre || '—'}</p>
                                <p className="text-[11px] text-white/50 truncate">
                                    {r.nif || 'sin NIF'}{r.cargo ? ` · ${r.cargo}` : ''}
                                </p>
                            </div>
                            {marca === r.id && marcaTexto && (
                                <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold border text-cyan-300 border-cyan-400/30 bg-cyan-500/10">
                                    {marcaTexto}
                                </span>
                            )}
                            {r.principal && (
                                <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold border text-white/55 border-white/15 bg-white/[0.03]">
                                    En la ficha
                                </span>
                            )}
                        </label>
                    );
                })}
            </div>
            <p className="mt-2 text-[11px] text-white/45 leading-snug">
                {nota || 'Su nombre y NIF se imprimen en la casilla “Representante del solicitante” de cada ficha.'}
            </p>
        </div>
    );
}

export default FirmantePicker;
