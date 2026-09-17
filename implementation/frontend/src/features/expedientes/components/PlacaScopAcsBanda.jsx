import React, { useRef, useState } from 'react';
import ReactCrop, { centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';

/**
 * LA BANDA DE LA PLACA DEL ANEXO VI — qué foto se imprime en el certificado.
 *
 * Superficie COMPARTIDA por los dos popups que imprimen ese cálculo: el del CIFO
 * y el del Certificado RES080. Son el mismo gesto sobre el mismo dato, y dos
 * copias divergirían justo en el aviso de que la foto falta.
 *
 * Qué se hace aquí: ver cuál se imprime, elegir otra si hay varias, soltar una si
 * no hay ninguna y RECORTARLA — el mismo `ReactCrop` que el Anexo Fotográfico.
 *
 * ⚠️ Al recortar NO se tocan los píxeles: se guarda el RECUADRO (`{x,y,w,h}` en %
 * más la relación de aspecto). Así el original sigue entero en Drive, el recorte
 * se deshace, y el certificado sale igual generándolo desde la app o desde el
 * backend — porque el encuadre vive en el expediente y no en este popup.
 *
 * La carga, la elección, la subida y el guardado del recorte viven en
 * `logic/usePlacaScopAcs.js`.
 */
export function PlacaScopAcsBanda({ placa, cargando, subiendo, onElegir, onSubir, onRecortar }) {
    const inputRef = useRef(null);
    const imgRef = useRef(null);
    const [encima, setEncima] = useState(false);
    const [error, setError] = useState(null);
    const [editando, setEditando] = useState(false);
    const [crop, setCrop] = useState();
    const [hecho, setHecho] = useState();

    if (!placa?.aplica) return null;

    const hay = !!placa.src;
    const tomar = async (file) => {
        setError(null);
        if (!file) return;
        // Solo imágenes: lo que se imprime en el certificado es una foto, y un PDF
        // soltado aquí entraría en el slot y no se podría pintar.
        if (!String(file.type || '').startsWith('image/')) {
            setError('Tiene que ser una foto (JPG o PNG).');
            return;
        }
        const r = await onSubir(file);
        if (!r?.ok) setError(r?.error || 'No se ha podido subir la foto.');
    };

    // Al abrir, se arranca del encuadre GUARDADO si lo hay: quien reabre el editor
    // viene a ajustarlo, no a empezar de cero.
    const cropGuardado = placa.recorte
        ? { unit: '%', x: placa.recorte.x, y: placa.recorte.y, width: placa.recorte.w, height: placa.recorte.h }
        : null;

    const aplicarRecorte = async () => {
        const el = imgRef.current;
        if (!hecho?.width || !el) { setEditando(false); return; }
        // El recuadro viaja en % y con la relación de aspecto de la foto: es lo que
        // el documento necesita para encuadrarla sin tener los píxeles delante.
        const ar = el.naturalWidth / el.naturalHeight;
        await onRecortar({ x: hecho.x, y: hecho.y, w: hecho.width, h: hecho.height, ar });
        setEditando(false);
    };

    return (
        <div
            onDragOver={(e) => { e.preventDefault(); setEncima(true); }}
            onDragLeave={() => setEncima(false)}
            onDrop={(e) => { e.preventDefault(); setEncima(false); tomar(e.dataTransfer.files?.[0]); }}
            className={`flex-shrink-0 px-5 py-3 border-b flex items-start gap-3 transition-colors ${
                encima ? 'bg-brand/10 border-brand/40 border-dashed'
                : hay ? 'bg-emerald-500/[0.05] border-emerald-500/15'
                : 'bg-amber-500/[0.06] border-amber-500/20'}`}
        >
            {hay
                ? (
                    <button
                        onClick={() => { setEditando(true); setCrop(cropGuardado || undefined); setHecho(cropGuardado || undefined); }}
                        title="Recortar la foto"
                        className="relative w-12 h-12 rounded-lg overflow-hidden border border-white/10 shrink-0 group"
                    >
                        <img src={placa.src} alt="" className="w-full h-full object-cover" />
                        <span className="absolute inset-0 bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v12a2 2 0 002 2h12M8 4v8a2 2 0 002 2h8M8 20v-4" /></svg>
                        </span>
                    </button>
                )
                : <svg className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>}

            <div className="min-w-0 flex-1">
                <p className="text-[11px] leading-snug text-white/70">
                    <span className={`font-black uppercase tracking-wider ${hay ? 'text-emerald-400' : 'text-amber-400'}`}>
                        Placa de la unidad exterior
                    </span>
                    {hay
                        ? <> — se imprime junto al cálculo del SCOP<sub>dhw</sub> y ampliada como anexo. De ahí sale el COP que la ficha técnica no siempre publica.</>
                        : <> — {placa.aviso}</>}
                </p>
                {hay && (
                    <p className="text-[10px] text-white/35 mt-0.5 truncate">
                        {placa.elegida?.name}
                        {placa.recorte
                            ? <span className="text-emerald-400/70"> · recortada</span>
                            : <span className="text-white/25"> · pulsa la foto para recortarla</span>}
                    </p>
                )}
                {error && <p className="text-[10px] text-red-300 mt-1">{error}</p>}

                <div className="flex gap-1.5 mt-2 flex-wrap items-center">
                    {/* Con VARIAS se elige: una unidad exterior puede llevar dos etiquetas
                        (datos y refrigerante) y cuál trae el COP lo sabe quien las mira. */}
                    {(placa.candidatas?.length > 1) && placa.candidatas.map(c => (
                        <button key={c.driveId}
                            onClick={() => onElegir(c.driveId)}
                            disabled={cargando || subiendo}
                            title={c.name}
                            className={`px-2.5 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider border transition-all max-w-[220px] truncate disabled:opacity-40 ${c.driveId === placa.elegida?.driveId ? 'border-emerald-400/50 bg-emerald-400/10 text-emerald-300' : 'border-white/10 text-white/40 hover:text-white hover:border-white/30'}`}>
                            {c.name}
                        </button>
                    ))}
                    <button
                        onClick={() => inputRef.current?.click()}
                        disabled={subiendo || cargando}
                        className={`px-2.5 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider border transition-all disabled:opacity-40 ${hay ? 'border-white/10 text-white/40 hover:text-white hover:border-white/30' : 'border-amber-400/50 bg-amber-400/10 text-amber-300 hover:bg-amber-400/20'}`}>
                        {subiendo ? 'Subiendo…' : hay ? '+ Subir otra foto' : '📷 Subir la foto de la placa'}
                    </button>
                    {/* En un PC se arrastra desde la carpeta de descargas; decirlo es lo
                        que hace que se pruebe. */}
                    <span className="hidden md:inline text-[9px] text-white/25">o arrástrala aquí</span>
                </div>
                <input ref={inputRef} type="file" accept="image/*" className="hidden"
                    onChange={(e) => { tomar(e.target.files?.[0]); e.target.value = ''; }} />
            </div>

            {(cargando || subiendo) && <span className="text-[10px] text-white/30 shrink-0">{subiendo ? 'subiendo…' : 'cargando…'}</span>}

            {/* ── EDITOR DE ENCUADRE — mismo gesto que en el Anexo Fotográfico ── */}
            {editando && hay && (
                <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/98 backdrop-blur-2xl p-4 md:p-8"
                     onClick={() => setEditando(false)}>
                    <div className="bg-[#16181D] border border-white/10 rounded-3xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden"
                         onClick={(e) => e.stopPropagation()}>
                        <div className="shrink-0 px-6 py-4 border-b border-white/10 flex justify-between items-center bg-white/[0.02]">
                            <h3 className="text-white font-bold uppercase tracking-widest text-xs">Recortar la placa · {placa.elegida?.name}</h3>
                            <button onClick={() => setEditando(false)} className="text-white/20 hover:text-white transition-colors">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                        {/* min-h-0 deja que el área encoja; la imagen se acota a la altura real
                            del modal → el botón Aplicar queda siempre visible. */}
                        <div className="flex-1 min-h-0 overflow-hidden p-4 md:p-6 flex items-center justify-center bg-black/40">
                            <ReactCrop crop={crop} onChange={(c, pc) => { setCrop(c); setHecho(pc); }} className="max-w-full max-h-full">
                                <img ref={imgRef} src={placa.src} alt="Placa" className="max-w-full object-contain shadow-2xl"
                                     style={{ maxHeight: 'calc(92vh - 210px)' }}
                                     onLoad={(e) => {
                                         const { width, height } = e.currentTarget;
                                         const inicial = cropGuardado
                                             || centerCrop(makeAspectCrop({ unit: '%', width: 90 }, undefined, width, height), width, height);
                                         setCrop(inicial);
                                         setHecho(cropGuardado || undefined);
                                     }} />
                            </ReactCrop>
                        </div>
                        <div className="shrink-0 p-4 md:p-6 bg-black/60 flex flex-col md:flex-row gap-4 justify-between items-center px-8 border-t border-white/10">
                            <span className="text-[10px] uppercase font-black text-white/20 tracking-widest">Arrastra las esquinas · la foto original no se toca</span>
                            <div className="flex gap-3">
                                {placa.recorte && (
                                    <button
                                        onClick={async () => { await onRecortar(null); setEditando(false); }}
                                        className="px-6 py-2 bg-white/5 border border-white/10 text-white/50 text-[11px] font-black rounded-xl uppercase tracking-widest hover:bg-white/10 transition-all"
                                        title="Volver a la foto entera">
                                        Quitar recorte
                                    </button>
                                )}
                                <button onClick={() => setEditando(false)} className="px-8 py-2 bg-white/5 text-white/50 text-[11px] font-black rounded-xl uppercase tracking-widest hover:bg-white/10 transition-all">Cancelar</button>
                                <button onClick={aplicarRecorte} className="px-10 py-2 bg-brand text-black text-[11px] font-black rounded-xl uppercase tracking-widest hover:scale-105 active:scale-95 transition-all">
                                    Aplicar recorte
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
