import React, { useCallback, useState } from 'react';
import { extractCeeFromFiles } from './ceeExtract';
import { demandaCal, superficie as ceeSuperficie } from './ceeAvisos';

/**
 * CeeDropZone — UNA zona de suelta para UN certificado (inicial o final).
 *
 * Se usa dos veces en la puerta de "Nueva simulación" (una por certificado) y hace
 * ella misma la extracción (`extractCeeFromFiles`: .xml/.cex exacto, PDF/fotos por
 * OCR), así que el padre solo recibe el objeto ya normalizado.
 *
 * Props:
 *   titulo, subtitulo  — cabecera de la tarjeta.
 *   tono               — 'inicial' (ámbar) | 'final' (esmeralda). Distinguirlos por
 *                        color evita el error de soltar el certificado en el hueco
 *                        equivocado, que es el fallo caro de esta pantalla.
 *   data               — CEE ya cargado (o null).
 *   onLoaded(data)     — se ha leído un certificado.
 *   onClear()          — quitar el cargado.
 *   disabled           — no admite ficheros (p.ej. mientras el otro está leyendo).
 */
// Clases COMPLETAS, nunca compuestas por interpolación: Tailwind genera el CSS
// escaneando el código fuente, y `border-${x}-500` no existe como texto → no se
// genera la regla y el borde sale sin color.
const TONOS = {
    inicial: {
        borde: 'border-amber-500/50', bordeActivo: 'border-amber-400', bordeHover: 'hover:border-amber-500/50',
        fondoActivo: 'bg-amber-500/10', texto: 'text-amber-400', chip: 'bg-amber-500/15 text-amber-300',
        spinner: 'border-t-amber-400',
    },
    final: {
        borde: 'border-emerald-500/50', bordeActivo: 'border-emerald-400', bordeHover: 'hover:border-emerald-500/50',
        fondoActivo: 'bg-emerald-500/10', texto: 'text-emerald-400', chip: 'bg-emerald-500/15 text-emerald-300',
        spinner: 'border-t-emerald-400',
    },
};

export default function CeeDropZone({ titulo, subtitulo, tono = 'inicial', data, onLoaded, onClear, disabled = false }) {
    const [estado, setEstado] = useState('vacio'); // vacio | leyendo | error
    const [msg, setMsg] = useState('');
    const [error, setError] = useState(null);
    const [fileNames, setFileNames] = useState([]);
    const [dragging, setDragging] = useState(false);
    const t = TONOS[tono] || TONOS.inicial;

    const handleFiles = useCallback(async (fileList) => {
        const files = Array.from(fileList || []);
        if (!files.length) return;
        setError(null);
        setFileNames(files.map(f => f.name));
        setEstado('leyendo');
        try {
            const { data: cee } = await extractCeeFromFiles(files, { onMessage: setMsg });
            // Los ficheros originales viajan con el CEE: tras crear la oportunidad se
            // suben a su slot de Drive. Antes se descartaban y había que volver a
            // subirlos a mano desde la pantalla de documentación.
            onLoaded?.({ ...cee, _files: files });
            setEstado('vacio');
        } catch (e) {
            const m = e?.response?.data?.error || e?.message || 'Error desconocido';
            console.error('[CeeDropZone]', m);
            setError('No se pudo leer: ' + m + '. Si el XML no vale, prueba con el PDF.');
            setEstado('error');
        }
    }, [onLoaded]);

    // ── Cargado: resumen de lo leído ────────────────────────────────────────
    if (data) {
        const dem = demandaCal(data);
        const sup = ceeSuperficie(data);
        return (
            <div className={`rounded-2xl border-2 ${t.borde} bg-white/[0.03] p-5`}>
                <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                        <div className={`text-[10px] font-black uppercase tracking-widest ${t.texto}`}>{titulo}</div>
                        <div className="text-white font-bold text-sm mt-0.5">Certificado cargado</div>
                    </div>
                    <button
                        type="button"
                        onClick={onClear}
                        className="text-white/30 hover:text-red-400 text-[10px] font-black uppercase tracking-widest transition-colors"
                    >
                        Quitar
                    </button>
                </div>
                <div className="flex flex-wrap gap-2 mb-3">
                    <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold ${t.chip}`}>
                        {data.source === 'xml' ? 'XML (exacto)' : 'OCR (IA)'}
                    </span>
                    {data.fecha_certificado && (
                        <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-white/[0.06] text-white/60">{data.fecha_certificado}</span>
                    )}
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                    <Dato k="Demanda calefacción" v={dem != null ? `${dem} kWh/m²·año` : '—'} destacado />
                    <Dato k="Superficie" v={sup != null ? `${sup} m²` : '—'} />
                    <Dato k="Ref. catastral" v={data.referencia_catastral || '—'} ancho />
                    <Dato k="Dirección" v={data.identificacion?.direccion || '—'} ancho />
                </dl>
            </div>
        );
    }

    // ── Leyendo ─────────────────────────────────────────────────────────────
    if (estado === 'leyendo') {
        return (
            <div className={`rounded-2xl border-2 border-dashed ${t.borde} bg-white/[0.02] p-8 flex flex-col items-center justify-center gap-4 min-h-[220px]`}>
                <div className="relative w-12 h-12">
                    <div className="absolute inset-0 border-4 border-white/10 rounded-full" />
                    <div className={`absolute inset-0 border-4 border-transparent rounded-full animate-spin ${t.spinner}`} />
                </div>
                <div className="text-white/70 font-bold tracking-widest text-[11px] uppercase animate-pulse text-center">{msg || 'Procesando…'}</div>
                {fileNames.length > 0 && <div className="text-white/35 text-[11px] text-center truncate max-w-full">{fileNames.join(', ')}</div>}
            </div>
        );
    }

    // ── Vacío ───────────────────────────────────────────────────────────────
    return (
        <label
            className={`rounded-2xl p-7 text-center transition-all border-2 border-dashed min-h-[220px] flex flex-col items-center justify-center gap-2 ${
                disabled ? 'opacity-40 cursor-not-allowed border-white/10' :
                dragging ? `${t.bordeActivo} ${t.fondoActivo} scale-[1.02] cursor-pointer` : `border-white/15 bg-white/[0.02] ${t.bordeHover} cursor-pointer`
            }`}
            onDragOver={(e) => { if (disabled) return; e.preventDefault(); if (!dragging) setDragging(true); }}
            onDragEnter={(e) => { if (disabled) return; e.preventDefault(); setDragging(true); }}
            onDragLeave={(e) => { e.preventDefault(); setDragging(false); }}
            onDrop={(e) => { if (disabled) return; e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
        >
            <input
                type="file"
                multiple
                disabled={disabled}
                accept="application/pdf,image/*,.xml,.cex"
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
            />
            <div className={`text-[10px] font-black uppercase tracking-widest ${t.texto}`}>{titulo}</div>
            <svg className={`w-10 h-10 my-1 ${dragging ? t.texto : 'text-white/25'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.9A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <div className="text-white font-bold text-sm">{dragging ? 'Suelta para subir' : 'Arrastra aquí o haz clic'}</div>
            <div className="text-white/35 text-[11px] leading-snug px-2">{subtitulo}</div>
            <div className="text-white/25 text-[10px] mt-1">.xml · .cex · PDF · JPG/PNG</div>
            {error && <div className="mt-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-[11px] text-left">{error}</div>}
        </label>
    );
}

function Dato({ k, v, ancho, destacado }) {
    return (
        <div className={ancho ? 'col-span-2' : ''}>
            <dt className="text-[9px] uppercase tracking-widest text-white/30 font-bold">{k}</dt>
            <dd className={`truncate ${destacado ? 'text-white font-bold' : 'text-white/70'}`}>{v}</dd>
        </div>
    );
}
