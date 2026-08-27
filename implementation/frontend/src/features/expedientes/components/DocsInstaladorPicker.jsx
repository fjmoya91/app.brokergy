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
// ─────────────────────────────────────────────────────────────────────────────
export function DocsInstaladorPicker({ docs = [], bloqueos = {}, pendientes = [], onToggle, origen }) {
    const otro = origen === 'cifo' ? 'rite' : 'cifo';
    const otroPendiente = pendientes.includes(otro);
    const otroBloqueado = !!bloqueos[otro];
    const juntos = docs.includes('cifo') && docs.includes('rite');

    const Chip = ({ k }) => {
        const def = DOCS_INSTALADOR[k];
        const motivo = bloqueos[k];
        const on = docs.includes(k) && !motivo;
        return (
            <button
                type="button"
                onClick={() => !motivo && onToggle(k)}
                disabled={!!motivo}
                title={motivo || def.label}
                className={`flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all ${
                    motivo ? 'border-white/5 bg-white/[0.02] cursor-not-allowed'
                        : on ? 'border-brand/50 bg-brand/10'
                            : 'border-white/10 bg-white/[0.02] hover:border-white/20'}`}
            >
                <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${motivo ? 'border-white/10' : on ? 'border-brand bg-brand' : 'border-white/20'}`}>
                    {on && <svg className="w-3 h-3 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                </span>
                <div className="min-w-0">
                    <div className={`text-[11px] font-black uppercase tracking-wider truncate ${motivo ? 'text-white/30' : 'text-white'}`}>{def.label}</div>
                    <div className={`text-[9px] leading-tight ${motivo ? 'text-amber-400/60' : 'text-white/40'}`}>{motivo || def.sublabel}</div>
                </div>
            </button>
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
            <label className="block text-[9px] font-black text-white/30 uppercase tracking-[0.2em] mb-2">
                Qué le mandamos <span className="text-white/20 normal-case tracking-normal font-bold">· puedes marcar los dos</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
                <Chip k="cifo" />
                <Chip k="rite" />
            </div>
        </div>
    );
}

export default DocsInstaladorPicker;
