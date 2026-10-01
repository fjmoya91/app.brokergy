import React from 'react';
import { DOCS_INSTALADOR } from '../logic/instaladorPendientes';

// ─────────────────────────────────────────────────────────────────────────────
// DocsInstaladorPicker — "¿qué le mandamos al instalador?"
//
// Mismo gesto que el selector de Anexo I + Cesión con el cliente: dos casillas,
// y lo que no se puede mandar se dice POR QUÉ en vez de desaparecer. Lo comparten
// el popup del CIFO y el de la Memoria RITE, así que las dos entradas ofrecen
// exactamente lo mismo y con las mismas palabras.
//
// REGLA — el aviso de "tampoco tenemos lo otro" va ARRIBA y en ámbar. Es el dato
// que cambia la decisión (mandar uno o los dos) y llega antes de que nadie haya
// leído el mensaje; escondido debajo del textarea no lo lee nadie.
//
// Props:
//   docs        string[]  seleccionados ('cifo' | 'rite')
//   bloqueos    { cifo?: string, rite?: string }  motivo por el que NO se puede
//   pendientes  string[]  lo que aún no tenemos (para el aviso)
//   onToggle(key)
//   onVer(key)  opcional: abre el visor con el documento TAL Y COMO va a salir.
//               Sin él, las tarjetas son las de siempre.
// ─────────────────────────────────────────────────────────────────────────────
export function DocsInstaladorPicker({ docs = [], bloqueos = {}, pendientes = [], onToggle, onVer = null, origen }) {
    const otro = origen === 'cifo' ? 'rite' : 'cifo';
    const otroPendiente = pendientes.includes(otro);
    const otroBloqueado = !!bloqueos[otro];
    const juntos = docs.includes('cifo') && docs.includes('rite');

    const Chip = ({ k }) => {
        const def = DOCS_INSTALADOR[k];
        const motivo = bloqueos[k];
        const on = docs.includes(k) && !motivo;
        // Marcar y VER son dos botones hermanos (un <button> no puede ir dentro
        // de otro). Lo que no se puede mandar tampoco se ve: no hay documento.
        const puedeVer = !!onVer && !motivo;
        return (
            <div className={`flex items-stretch rounded-xl border transition-all overflow-hidden ${
                motivo ? 'border-white/5 bg-white/[0.02]'
                    : on ? 'border-brand/50 bg-brand/10'
                        : 'border-white/10 bg-white/[0.02] hover:border-white/20'}`}>
                <button
                    type="button"
                    onClick={() => !motivo && onToggle(k)}
                    disabled={!!motivo}
                    title={motivo || def.label}
                    className={`flex-1 min-w-0 flex items-center gap-2.5 p-3 text-left ${motivo ? 'cursor-not-allowed' : ''}`}
                >
                    <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${motivo ? 'border-white/10' : on ? 'border-brand bg-brand' : 'border-white/20'}`}>
                        {on && <svg className="w-3 h-3 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                    </span>
                    <div className="min-w-0">
                        <div className={`text-[11px] font-black uppercase tracking-wider truncate ${motivo ? 'text-white/30' : 'text-white'}`}>{def.label}</div>
                        <div className={`text-[9px] leading-tight ${motivo ? 'text-amber-400/60' : 'text-white/40'}`}>{motivo || def.sublabel}</div>
                    </div>
                </button>
                {puedeVer && (
                    <button type="button" onClick={() => onVer(k)} title={`Ver ${def.label} tal y como se va a enviar`}
                        className={`shrink-0 flex flex-col items-center justify-center gap-0.5 px-3 border-l text-[8px] font-black uppercase tracking-wider transition-colors ${on ? 'border-brand/30 text-brand/80 hover:text-brand hover:bg-brand/10' : 'border-white/10 text-white/40 hover:text-white hover:bg-white/[0.04]'}`}>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                        Ver
                    </button>
                )}
            </div>
        );
    };

    return (
        <div>
            {/* El aviso solo aparece cuando de verdad falta lo otro. Enseñarlo
                siempre lo convertiría en ruido y dejaría de leerse. */}
            {otroPendiente && (
                <div className={`mb-3 p-3 rounded-xl border flex items-start gap-2.5 ${juntos ? 'bg-emerald-500/[0.06] border-emerald-400/25' : 'bg-amber-500/[0.06] border-amber-400/25'}`}>
                    <svg className={`w-4 h-4 shrink-0 mt-0.5 ${juntos ? 'text-emerald-400' : 'text-amber-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d={juntos ? 'M5 13l4 4L19 7' : 'M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z'} />
                    </svg>
                    <p className={`text-[11px] leading-relaxed ${juntos ? 'text-emerald-300/90' : 'text-amber-300/90'}`}>
                        {juntos
                            ? <>Va todo en <strong className="font-bold">un solo mensaje y un solo enlace</strong>: el instalador firma el CIFO y sube el RITE desde la misma página.</>
                            : otroBloqueado
                                ? <>Tampoco tenemos {otro === 'cifo' ? 'el Certificado CIFO firmado' : 'la legalización RITE'}, pero hoy no se puede mandar: {bloqueos[otro].toLowerCase()}.</>
                                : <>Tampoco tenemos {otro === 'cifo' ? <><strong className="font-bold">el Certificado CIFO firmado</strong></> : <><strong className="font-bold">la legalización RITE</strong></>}. Puedes pedírselo en este mismo mensaje y te ahorras un aviso más adelante.</>}
                    </p>
                </div>
            )}
            <div className="flex items-center justify-between gap-3 mb-2">
                <label className="block text-[9px] font-black text-white/30 uppercase tracking-[0.2em]">
                    Qué le mandamos <span className="text-white/20 normal-case tracking-normal font-bold">· puedes marcar los dos</span>
                </label>
                {/* Revisar ANTES de enviar sin salir de aquí. */}
                {onVer && (
                    <button type="button" onClick={() => onVer(docs.find(k => !bloqueos[k]) || 'cifo')}
                        className="shrink-0 flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-brand/80 hover:text-brand transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                        Revisar documentos
                    </button>
                )}
            </div>
            <div className="grid grid-cols-2 gap-2">
                <Chip k="cifo" />
                <Chip k="rite" />
            </div>
        </div>
    );
}

export default DocsInstaladorPicker;
