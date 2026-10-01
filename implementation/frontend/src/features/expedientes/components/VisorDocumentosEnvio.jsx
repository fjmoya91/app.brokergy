import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { DocumentoOficialPreview } from './DocumentoOficialPreview';

// ─────────────────────────────────────────────────────────────────────────────
// VisorDocumentosEnvio — revisar lo que se va a mandar SIN salir del envío.
//
// Lo comparten los popups de envío (anexos del cliente · CIFO + RITE al
// instalador). Enseña, en pestañas, el PDF EXACTO que va a salir: cada popup le
// pasa el documento construido con la MISMA función que monta los adjuntos, así
// que lo que se revisa y lo que recibe el destinatario no pueden divergir.
//
// Cada documento es { key, grupo?, titulo, estado, ... } y puede venir:
//   · `fuente`  → { html } | { formulario } (+ annexes): se genera aquí.
//   · `pdf`     → base64 ya generado (la documentación RITE, que el servicio
//                 devuelve de una vez); `pendiente` / `fallo` mientras tanto.
//   · `sinVista`→ texto cuando el documento no se puede pintar (un Word).
// `grupo` es lo que se marca/desmarca: la documentación RITE son dos pestañas
// (borrador del certificado y memoria) y UN solo documento a efectos del envío.
//
// Las pestañas se montan todas a la vez para que cambiar de una a otra no vuelva
// a generar el PDF. Portaleado a body: los popups llevan backdrop-blur y un
// `fixed` dentro se anclaría a ellos (regla 29.b).
// ─────────────────────────────────────────────────────────────────────────────

const ESTADO = {
    sale: { texto: 'Se envía', punto: 'bg-emerald-400', color: 'text-emerald-400/90' },
    fuera: { texto: 'No marcado · no se envía', punto: 'bg-white/25', color: 'text-white/35' },
    bloqueado: { texto: 'No se puede enviar', punto: 'bg-red-400', color: 'text-red-400/80' },
};

const NOTA_POR_DEFECTO = 'Es el PDF exacto que se va a enviar. Lo que escribas con las herramientas del visor (texto, lápiz) no se guarda ni se envía.';

function descargar({ nombre, base64, mimetype }) {
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: mimetype || 'application/octet-stream' }));
    const a = document.createElement('a');
    a.href = url; a.download = nombre; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function VisorDocumentosEnvio({ docs = [], activo, onActivo, onClose, onToggle = null, nota = NOTA_POR_DEFECTO }) {
    // Esc cierra el VISOR y vuelve al envío, no el popup entero.
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose?.(); } };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [onClose]);

    if (!docs.length) return null;
    const actual = docs.find(d => d.key === activo) || docs[0];
    const idx = docs.indexOf(actual);
    const siguiente = docs[idx + 1] || null;
    const grupo = actual.grupo || actual.key;

    return createPortal(
        <div className="fixed inset-0 z-[450] flex items-center justify-center bg-black/90 backdrop-blur-md p-2 sm:p-5">
            <div className="w-full max-w-5xl h-full flex flex-col bg-[#0F1013] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
                {/* Cabecera: una pestaña por documento, con si sale o no */}
                <div className="shrink-0 px-4 sm:px-5 py-3 border-b border-white/[0.07] bg-brand/5 flex items-center gap-3">
                    <div className="flex-1 min-w-0 flex gap-2 overflow-x-auto">
                        {docs.map(d => {
                            const on = d.key === actual.key;
                            const est = ESTADO[d.estado] || ESTADO.fuera;
                            return (
                                <button key={d.key} type="button" onClick={() => onActivo?.(d.key)}
                                    className={`shrink-0 text-left px-3.5 py-2 rounded-xl border transition-all ${on ? 'border-brand/50 bg-brand/10' : 'border-white/10 bg-white/[0.02] hover:border-white/20'}`}>
                                    <div className={`text-[11px] font-black uppercase tracking-wider ${on ? 'text-white' : 'text-white/60'}`}>{d.titulo}</div>
                                    <div className={`text-[9px] font-bold flex items-center gap-1 ${est.color}`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${est.punto}`} />
                                        {est.texto}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                    <button type="button" onClick={onClose} title="Volver al envío (Esc)"
                        className="shrink-0 text-white/40 hover:text-white transition-colors">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                {/* Lo que el documento NO puede decir por sí solo, y lo que va además
                    en otro formato (la memoria RITE también sale en Word, editable). */}
                {(actual.aviso || actual.descargas?.length > 0) && (
                    <div className={`shrink-0 px-5 py-2 border-b border-white/[0.06] text-[11px] leading-snug flex flex-wrap items-center gap-x-4 gap-y-1.5 ${actual.avisoTono === 'rojo' ? 'text-red-400' : 'text-amber-300'}`}>
                        {actual.aviso && <span className="flex-1 min-w-[12rem]">{actual.aviso}</span>}
                        {(actual.descargas || []).map(f => (
                            <button key={f.nombre} type="button" onClick={() => descargar(f)}
                                className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-white/15 text-white/70 text-[10px] font-black uppercase tracking-wider hover:text-white hover:border-white/30 transition-all">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3M6 20h12a2 2 0 002-2V8l-6-6H6a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                                {f.etiqueta || f.nombre}
                            </button>
                        ))}
                    </div>
                )}

                <div className="flex-1 min-h-0 flex flex-col">
                    {docs.map(d => (
                        <div key={d.key} className={d.key === actual.key ? 'flex-1 min-h-0' : 'hidden'}>
                            {d.sinVista ? (
                                <div className="h-full flex items-center justify-center text-center px-8 text-white/50 text-sm leading-relaxed">{d.sinVista}</div>
                            ) : d.pdf !== undefined || d.pendiente || d.fallo ? (
                                <DocumentoOficialPreview pdf={d.pdf ?? null} pendiente={!!d.pendiente} fallo={d.fallo || ''} titulo={d.titulo} nota={nota} />
                            ) : (
                                <DocumentoOficialPreview fuente={d.fuente} titulo={d.titulo} nota={nota} />
                            )}
                        </div>
                    ))}
                </div>

                {/* Pie: incluir/quitar este documento y seguir */}
                <div className="shrink-0 px-4 sm:px-5 py-3 border-t border-white/[0.07] bg-white/[0.02] flex flex-wrap items-center justify-between gap-2">
                    {onToggle && actual.estado !== 'bloqueado' ? (
                        <button type="button" onClick={() => onToggle(grupo)}
                            className={`px-4 py-2.5 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${actual.estado === 'sale' ? 'border-white/10 text-white/50 hover:text-white hover:border-white/30' : 'border-brand/40 text-brand hover:bg-brand/10'}`}>
                            {actual.estado === 'sale' ? 'Quitar del envío' : 'Incluir en el envío'}
                        </button>
                    ) : <span />}
                    <div className="flex items-center gap-2">
                        <button type="button" onClick={onClose}
                            className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${siguiente ? 'border border-white/10 text-white/50 hover:text-white hover:border-white/30' : 'bg-brand text-black hover:brightness-110 active:scale-95'}`}>
                            Volver al envío
                        </button>
                        {siguiente && (
                            <button type="button" onClick={() => onActivo?.(siguiente.key)}
                                className="px-5 py-2.5 rounded-xl bg-brand text-black text-[10px] font-black uppercase tracking-widest hover:brightness-110 active:scale-95 transition-all">
                                Siguiente: {siguiente.titulo} →
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}

export default VisorDocumentosEnvio;
