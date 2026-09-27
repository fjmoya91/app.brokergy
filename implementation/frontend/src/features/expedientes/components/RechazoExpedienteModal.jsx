import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
    RECHAZADO_POR, MOTIVOS_RECHAZO, MOTIVO_RECHAZO_MIN,
} from '../logic/rechazoExpediente';

// Confirmación de RECHAZO de un expediente.
//
// Se abre al elegir RECHAZADO en cualquier selector de estado (fila del listado,
// tarjeta móvil o detalle). Cancelar no toca NADA: el cambio de estado no se ha
// mandado todavía, así que el selector vuelve solo a su valor.
//
// Portaleado a `document.body` (regla 29.b): el listado y el detalle llevan
// `backdrop-filter`, y un `position: fixed` dentro de ellos se recortaría.
// No se cierra al pulsar fuera: se rellena un motivo que no queremos perder.
export default function RechazoExpedienteModal({ expediente, onCancel, onConfirm }) {
    const [por, setPor] = useState('');
    const [cat, setCat] = useState('');
    const [motivo, setMotivo] = useState('');
    const [adjunto, setAdjunto] = useState('');
    const [enviando, setEnviando] = useState(false);
    const [error, setError] = useState(null);

    const largo = motivo.trim().length;
    const adjuntoOk = !adjunto.trim() || /^https?:\/\/\S+$/i.test(adjunto.trim());
    const valido = por && cat && largo >= MOTIVO_RECHAZO_MIN && adjuntoOk;

    const confirmar = async () => {
        if (!valido || enviando) return;
        setEnviando(true);
        setError(null);
        try {
            await onConfirm({
                rechazado_por: por,
                motivo_rechazo_cat: cat,
                motivo_rechazo: motivo.trim(),
                rechazo_adjunto_url: adjunto.trim() || null,
            });
        } catch (err) {
            setError(err?.response?.data?.error || err?.message || 'No se pudo rechazar el expediente.');
            setEnviando(false);
        }
    };

    const campo = 'w-full bg-black/40 border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-red-500/50 transition-colors';
    const rotulo = 'block text-[10px] font-black uppercase tracking-wider text-white/50 mb-1.5';

    return createPortal(
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm max-md:items-end max-md:p-0">
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="rechazo-titulo"
                className="w-full max-w-lg bg-bkg-surface border border-red-500/30 rounded-2xl shadow-2xl max-md:rounded-b-none max-md:max-h-[92vh] flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                <div className="px-5 pt-5 pb-3 border-b border-white/[0.06]">
                    <h2 id="rechazo-titulo" className="text-base font-black uppercase tracking-tight text-red-400">
                        Rechazar expediente
                    </h2>
                    <p className="text-xs text-white/50 mt-1">
                        {expediente?.numero_expediente || 'Expediente'}
                        {expediente?.estado ? <> · ahora en <span className="text-white/70 font-bold">{expediente.estado}</span></> : null}
                    </p>
                    <p className="text-[11px] text-white/40 mt-2 leading-relaxed">
                        Deja de contar en el resumen y en el parte diario. Se guarda el estado actual
                        para poder reabrirlo más adelante.
                    </p>
                </div>

                <div className="px-5 py-4 space-y-4 overflow-y-auto">
                    <div>
                        <label className={rotulo} htmlFor="rech-por">¿Quién lo rechaza? *</label>
                        <select id="rech-por" value={por} onChange={e => setPor(e.target.value)} className={campo}>
                            <option value="" className="bg-bkg-deep">— Elige —</option>
                            {RECHAZADO_POR.map(o => <option key={o.value} value={o.value} className="bg-bkg-deep">{o.label}</option>)}
                        </select>
                    </div>

                    <div>
                        <label className={rotulo} htmlFor="rech-cat">Categoría del motivo *</label>
                        <select id="rech-cat" value={cat} onChange={e => setCat(e.target.value)} className={campo}>
                            <option value="" className="bg-bkg-deep">— Elige —</option>
                            {MOTIVOS_RECHAZO.map(o => <option key={o.value} value={o.value} className="bg-bkg-deep">{o.label}</option>)}
                        </select>
                    </div>

                    <div>
                        <label className={rotulo} htmlFor="rech-motivo">Motivo *</label>
                        <textarea
                            id="rech-motivo"
                            rows={4}
                            value={motivo}
                            onChange={e => setMotivo(e.target.value)}
                            placeholder="Qué ha pasado, con el detalle suficiente para entenderlo dentro de tres meses."
                            className={`${campo} resize-y no-uppercase`}
                        />
                        <p className={`text-[10px] mt-1 ${largo >= MOTIVO_RECHAZO_MIN ? 'text-white/30' : 'text-amber-400/80'}`}>
                            {largo >= MOTIVO_RECHAZO_MIN
                                ? `${largo} caracteres`
                                : `Mínimo ${MOTIVO_RECHAZO_MIN} caracteres · faltan ${MOTIVO_RECHAZO_MIN - largo}`}
                        </p>
                    </div>

                    <div>
                        <label className={rotulo} htmlFor="rech-adj">Enlace al documento del rechazo (opcional)</label>
                        <input
                            id="rech-adj"
                            type="url"
                            value={adjunto}
                            onChange={e => setAdjunto(e.target.value)}
                            placeholder="https://drive.google.com/…"
                            className={`${campo} no-uppercase`}
                        />
                        {!adjuntoOk && (
                            <p className="text-[10px] mt-1 text-amber-400/80">Tiene que ser un enlace que empiece por http:// o https://</p>
                        )}
                    </div>

                    {error && (
                        <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">{error}</div>
                    )}
                </div>

                <div className="px-5 py-4 border-t border-white/[0.06] flex items-center justify-end gap-2 max-md:pb-[max(1rem,env(safe-area-inset-bottom))]">
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={enviando}
                        className="px-4 py-2.5 rounded-xl border border-white/10 text-white/60 hover:text-white hover:border-white/20 text-xs font-black uppercase tracking-wider transition-colors disabled:opacity-40"
                    >
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={confirmar}
                        disabled={!valido || enviando}
                        className="px-4 py-2.5 rounded-xl bg-red-500/90 hover:bg-red-500 text-white text-xs font-black uppercase tracking-wider transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                        {enviando ? 'Rechazando…' : 'Rechazar expediente'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
