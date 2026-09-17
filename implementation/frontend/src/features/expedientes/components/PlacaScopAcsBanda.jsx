import React, { useRef, useState } from 'react';

/**
 * LA BANDA DE LA PLACA DEL ANEXO VI — qué foto se imprime en el certificado.
 *
 * Superficie COMPARTIDA por los dos popups que imprimen ese cálculo: el del CIFO
 * y el del Certificado RES080. Son el mismo gesto sobre el mismo dato, y dos
 * copias divergirían justo en el aviso de que la foto falta.
 *
 * La carga, la elección y la subida viven en `logic/usePlacaScopAcs.js`.
 */
/**
 * La banda del popup: qué foto se imprime, cuál elegir si hay varias y dónde
 * soltar una cuando no hay ninguna. Solo se pinta si el expediente va por el
 * Anexo VI (`placa.aplica`).
 */
export function PlacaScopAcsBanda({ placa, cargando, subiendo, onElegir, onSubir }) {
    const inputRef = useRef(null);
    const [encima, setEncima] = useState(false);
    const [error, setError] = useState(null);

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
                ? <img src={placa.src} alt="" className="w-12 h-12 rounded-lg object-cover border border-white/10 shrink-0" />
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
                {hay && <p className="text-[10px] text-white/35 mt-0.5 truncate">{placa.elegida?.name}</p>}
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
        </div>
    );
}
