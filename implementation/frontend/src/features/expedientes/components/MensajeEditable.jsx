import React, { useState } from 'react';
import { useIsMobile } from '../../../utils/useIsMobile';

// ─────────────────────────────────────────────────────────────────────────────
// El mensaje que se le manda al técnico certificador, en los popups del módulo
// CEE (encargo al asignar, visto bueno al validar).
//
// En ESCRITORIO es el mismo `textarea` de siempre, con las mismas clases.
//
// En MÓVIL viene PLEGADO: nueve renglones a 16px son media pantalla de un texto
// que casi nunca se edita, y empujaban el botón de enviar fuera del alcance del
// pulgar. Se enseñan las primeras líneas con un degradado y se despliega o se
// edita a demanda — mismo patrón que la página de acciones del parte diario.
// ─────────────────────────────────────────────────────────────────────────────
export function MensajeEditable({
    value,
    onChange,
    disabled = false,
    rows = 8,
    maxLength,
    placeholder = '',
    focusClass = 'focus:border-brand/40',
    className = '',
}) {
    const isMobile = useIsMobile();
    const [editando, setEditando] = useState(false);
    const [verEntero, setVerEntero] = useState(false);

    if (!isMobile) {
        return (
            <textarea
                value={value}
                onChange={e => onChange(e.target.value)}
                disabled={disabled}
                placeholder={placeholder}
                rows={rows}
                maxLength={maxLength}
                className={`w-full bg-black/30 border border-white/10 rounded-xl p-3 text-sm leading-relaxed text-white normal-case placeholder:text-white/20 focus:outline-none ${focusClass} resize-none ${className}`}
            />
        );
    }

    return (
        <div className={className}>
            <div className="flex items-center justify-end gap-1 mb-1.5">
                {!editando && (
                    <button
                        type="button"
                        onClick={() => setVerEntero(v => !v)}
                        className="text-[10px] font-black uppercase tracking-wider text-white/40 px-2 py-1.5"
                    >{verEntero ? 'Plegar' : 'Ver entero'}</button>
                )}
                <button
                    type="button"
                    onClick={() => setEditando(v => !v)}
                    disabled={disabled}
                    className="text-[10px] font-black uppercase tracking-wider text-brand px-2 py-1.5 -mr-2 disabled:opacity-40"
                >{editando ? '✔ Listo' : '✏️ Editar'}</button>
            </div>

            {editando ? (
                <textarea
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    disabled={disabled}
                    placeholder={placeholder}
                    rows={12}
                    maxLength={maxLength}
                    className={`w-full bg-black/30 border border-brand/50 rounded-xl p-3 text-base leading-relaxed text-white normal-case placeholder:text-white/20 focus:outline-none ${focusClass} resize-y`}
                />
            ) : (
                <div className={`relative rounded-xl bg-black/30 border border-white/10 p-3 text-[13px] leading-relaxed text-white/70 normal-case whitespace-pre-wrap break-words ${verEntero ? '' : 'max-h-36 overflow-hidden'}`}>
                    {value || <span className="text-white/20">{placeholder}</span>}
                    {!verEntero && <div className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />}
                </div>
            )}
        </div>
    );
}

export default MensajeEditable;
