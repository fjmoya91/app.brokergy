import React, { useState, useCallback } from 'react';
import { extractCeeFromFiles } from './ceeExtract';

/**
 * CeeUploadModal — Popup compacto para CARGAR un CEE (soltar fichero) y devolver sus datos
 * normalizados, reutilizando la MISMA extracción que "Nueva simulación" (XML exacto u OCR IA).
 *
 * Pensado para superponerse a otros modales (z alto). No muestra pantalla de revisión: los
 * datos se vuelcan a la superficie que lo abre (p. ej. la tabla de emisiones, que ya es editable).
 *
 * Props:
 *   isOpen            — visibilidad.
 *   onClose()         — cerrar sin cargar.
 *   title             — título del popup (p. ej. "Cargar CEE inicial").
 *   subtitle          — texto de ayuda opcional.
 *   onLoaded(data)    — datos del CEE normalizados (forma de emptyCeeData()). El consumidor
 *                       decide qué hacer con ellos (rellenar columna inicial/final, etc.).
 */
export default function CeeUploadModal({ isOpen, onClose, title = 'Cargar CEE', subtitle, onLoaded }) {
  const [stage, setStage] = useState('upload'); // upload | processing
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState('');
  const [fileNames, setFileNames] = useState([]);
  const [isDragging, setIsDragging] = useState(false);

  const reset = useCallback(() => {
    setStage('upload'); setError(null); setMsg(''); setFileNames([]); setIsDragging(false);
  }, []);

  const handleFiles = useCallback(async (fileList) => {
    setError(null);
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    setFileNames(files.map((f) => f.name));
    try {
      setStage('processing');
      const { data } = await extractCeeFromFiles(files, { onMessage: setMsg });
      onLoaded?.(data);
      reset();
      onClose?.();
    } catch (e) {
      const m = e?.response?.data?.error || e?.message || 'Error desconocido';
      console.error('[CeeUploadModal] error:', m);
      setError('No se pudo leer el CEE: ' + m + '. Si es XML inválido, prueba con el PDF (OCR).');
      setStage('upload');
    }
  }, [onLoaded, onClose, reset]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in"
      onClick={() => { if (stage !== 'processing') { reset(); onClose?.(); } }}
    >
      <div
        className="bg-white rounded-3xl overflow-hidden shadow-2xl relative animate-scale-up w-full max-w-lg border border-white/20"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-7 py-5 bg-slate-900 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <span className="text-amber-500 text-xl">📄</span>
            <h3 className="text-white font-black uppercase tracking-widest text-sm">{title}</h3>
          </div>
          {stage !== 'processing' && (
            <button onClick={() => { reset(); onClose?.(); }} className="p-2 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-all hover:rotate-90">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          )}
        </div>

        <div className="p-7">
          {subtitle && <p className="text-[12px] text-slate-500 mb-4 leading-relaxed">{subtitle}</p>}

          {stage === 'processing' ? (
            <div className="flex flex-col items-center justify-center py-10 gap-5">
              <div className="relative w-14 h-14">
                <div className="absolute inset-0 border-4 border-amber-500/15 rounded-full" />
                <div className="absolute inset-0 border-4 border-transparent border-t-amber-500 rounded-full animate-spin" />
              </div>
              <div className="text-slate-600 font-bold tracking-widest text-xs uppercase animate-pulse text-center">{msg || 'Procesando…'}</div>
              {fileNames.length > 0 && <div className="text-slate-400 text-[11px] text-center">{fileNames.join(', ')}</div>}
            </div>
          ) : (
            <>
              {error && <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-[12px]">{error}</div>}
              <label
                className={`block cursor-pointer rounded-2xl p-9 text-center transition-all border-2 border-dashed ${
                  isDragging ? 'border-amber-400 bg-amber-50 scale-[1.01]' : 'border-slate-300 bg-slate-50 hover:border-amber-400'
                }`}
                onDragOver={(e) => { e.preventDefault(); if (!isDragging) setIsDragging(true); }}
                onDragEnter={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
                onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files); }}
              >
                <input type="file" multiple accept="application/pdf,image/*,.xml,.cex" className="hidden" onChange={(e) => handleFiles(e.target.files)} />
                <div className="flex flex-col items-center gap-2 pointer-events-none">
                  <svg className={`w-12 h-12 transition-all ${isDragging ? 'text-amber-500 -translate-y-1' : 'text-amber-500/60'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.9A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                  <div className="text-slate-800 font-bold text-[15px]">{isDragging ? 'Suelta para subir' : 'Arrastra aquí o haz clic'}</div>
                  <div className="text-slate-400 text-[11px]">.xml · .cex · PDF · JPG/PNG (varias fotos se unen)</div>
                </div>
              </label>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
