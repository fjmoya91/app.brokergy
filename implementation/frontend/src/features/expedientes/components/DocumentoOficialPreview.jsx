import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';

/**
 * ────────────────────────────────────────────────────────────────────────────
 * La vista previa del IMPRESO OFICIAL (fichas RES/TER y Anexo I en formato
 * formulario).
 *
 * REGLA — se enseña EL PDF QUE SE VA A ENVIAR, no una maqueta parecida. El
 * documento ya no se redibuja en HTML: se rellena el impreso del Ministerio en el
 * backend, así que la única vista previa honesta es ese mismo PDF. Una réplica en
 * pantalla volvería a abrir la puerta a que lo que se revisa y lo que se manda no
 * sean el mismo documento.
 *
 * El PDF se pide UNA vez por juego de datos (`formulario` se compara serializado):
 * mientras el popup está abierto y nadie toca nada, no se vuelve a generar.
 * ────────────────────────────────────────────────────────────────────────────
 */
export function DocumentoOficialPreview({ formulario, titulo = 'documento', onFallback, nota = null }) {
    const [url, setUrl] = useState(null);
    const [error, setError] = useState('');
    const [cargando, setCargando] = useState(true);
    const urlRef = useRef(null);
    const clave = JSON.stringify(formulario || null);

    useEffect(() => {
        let vivo = true;
        setCargando(true);
        setError('');
        (async () => {
            try {
                const { data } = await axios.post('/api/pdf/generate', { formulario });
                if (!vivo) return;
                if (!data?.pdf) throw new Error('El servidor no devolvió el PDF');
                const bytes = Uint8Array.from(atob(data.pdf), c => c.charCodeAt(0));
                const blobUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
                if (urlRef.current) URL.revokeObjectURL(urlRef.current);
                urlRef.current = blobUrl;
                setUrl(blobUrl);
            } catch (e) {
                if (vivo) setError(e.response?.data?.message || e.message || 'No se pudo preparar el documento');
            } finally {
                if (vivo) setCargando(false);
            }
        })();
        return () => { vivo = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clave]);

    // El blob se libera al desmontar: si no, cada apertura del popup deja en memoria
    // el PDF entero de la anterior.
    useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);

    if (error) {
        return (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-8">
                <div className="text-red-400 text-sm font-black uppercase tracking-wider">No se pudo preparar el {titulo}</div>
                <div className="text-white/40 text-xs max-w-md">{error}</div>
                {onFallback && (
                    <button onClick={onFallback}
                        className="mt-2 px-4 py-2 rounded-xl border border-white/10 text-white/70 text-xs font-black uppercase tracking-wider hover:text-white hover:border-white/30 transition-all">
                        Ver el formato clásico
                    </button>
                )}
            </div>
        );
    }

    return (
        <div className="h-full w-full relative bg-[#16181D] flex flex-col">
            {nota && (
                <div className="shrink-0 px-4 py-2 text-[11px] text-white/40 border-b border-white/[0.06] text-center">{nota}</div>
            )}
            {cargando && (
                <div className="absolute inset-0 flex items-center justify-center gap-3 text-white/40 text-xs uppercase tracking-wider">
                    <div className="w-5 h-5 border-2 border-brand/20 border-t-brand rounded-full animate-spin" />
                    Preparando el {titulo}…
                </div>
            )}
            {url && <iframe title={`Vista previa · ${titulo}`} src={url} className="w-full flex-1 border-0" />}
        </div>
    );
}

/**
 * El conmutador de formato. El OFICIAL es el que se envía; el CLÁSICO es la maqueta
 * HTML de siempre, que se conserva para poder comparar los dos documentos del mismo
 * expediente y como salida si algún día el impreso oficial cambia y deja de casar.
 */
export function FormatoDocumentoSwitch({ formato, onChange, disabled }) {
    const opciones = [
        { id: 'oficial', label: 'Oficial', title: 'El impreso oficial del Ministerio, relleno. Es el que se envía y se firma.' },
        { id: 'clasico', label: 'Clásico', title: 'La maqueta HTML anterior. Se conserva para comparar.' },
    ];
    return (
        <div className="hidden md:flex items-center rounded-xl border border-white/10 overflow-hidden shrink-0" role="group">
            {opciones.map(o => (
                <button key={o.id} type="button" title={o.title} disabled={disabled}
                    onClick={() => onChange(o.id)}
                    className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-wider transition-all disabled:opacity-30 ${
                        formato === o.id ? 'bg-brand/20 text-brand' : 'text-white/35 hover:text-white/70'
                    }`}>
                    {o.label}
                </button>
            ))}
        </div>
    );
}
