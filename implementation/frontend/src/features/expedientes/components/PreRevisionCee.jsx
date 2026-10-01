// ============================================================================
// PreRevisionCee — la REVISIÓN PREVIA que ve el CERTIFICADOR al subir su .xml
// o su .cex, para que corrija lo suyo antes de que llegue a Brokergy.
//
// El juicio NO se hace aquí: es el MISMO de la lupa de Fran
// (`services/cee/revisionCee.js`), y el backend devuelve solo la parte del
// técnico (`services/cee/revisionTecnico.js` → `vistaTecnico`): sus puntos —la
// demanda y la superficie frente a la simulación, como algo que REVISAR—, sin lo
// que es de Brokergy y con los consejos escritos para él.
//
// Lo usan las DOS superficies por las que sube el técnico: el módulo CEE de la
// app (con su sesión) y su enlace público `/subir-cee` (con su token). Por eso
// la petición llega hecha en `pedir`: esta pieza no sabe de rutas ni de tokens.
//
// REGLA — nunca dice "APTO". Dice "no hemos visto nada que corregir": el visto
// bueno es de Brokergy, y hay comprobaciones que el técnico no ve.
// ============================================================================
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const TONO = {
    corregir: { texto: 'text-red-400', caja: 'border-red-500/30 bg-red-500/[0.07]', icono: '✗' },
    revisar: { texto: 'text-amber-400', caja: 'border-amber-500/30 bg-amber-500/[0.07]', icono: '!' },
    bien: { texto: 'text-emerald-400', caja: 'border-emerald-500/30 bg-emerald-500/[0.07]', icono: '✓' },
};
const TONO_PUNTO = {
    falla: { texto: 'text-red-400', caja: 'border-red-500/25 bg-red-500/[0.05]', icono: '✗' },
    aviso: { texto: 'text-amber-400', caja: 'border-amber-500/25 bg-amber-500/[0.05]', icono: '!' },
    no_comprobable: { texto: 'text-white/55', caja: 'border-white/10 bg-white/[0.03]', icono: '?' },
};

const hace = (iso) => {
    if (!iso) return '';
    const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (min < 1) return 'ahora mismo';
    if (min < 60) return `hace ${min} min`;
    const h = Math.round(min / 60);
    if (h < 24) return `hace ${h} h`;
    return `hace ${Math.round(h / 24)} días`;
};

function Punto({ p }) {
    const t = TONO_PUNTO[p.estado] || TONO_PUNTO.no_comprobable;
    return (
        <div className={`rounded-xl border px-3 py-2.5 text-left ${t.caja}`}>
            <p className="text-[12px] font-bold text-white flex gap-2">
                <span className={`${t.texto} font-black w-3 shrink-0`}>{t.icono}</span>{p.titulo}
            </p>
            {p.dice && <p className="text-[11px] text-white/75 mt-1 pl-5 break-words"><span className="text-white/45">Tu certificado · </span>{p.dice}</p>}
            {p.esperado && <p className="text-[11px] text-white/75 pl-5 break-words"><span className="text-white/45">Debería · </span>{p.esperado}</p>}
            {p.detalle && <p className="text-[11px] text-white/60 mt-1 pl-5 break-words">→ {p.detalle}</p>}
        </div>
    );
}

/** El icono de la lupa, animado mientras revisa. */
function Lupa({ girando }) {
    return (
        <svg className={`w-5 h-5 ${girando ? 'animate-pulse' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z" />
        </svg>
    );
}

/**
 * @param {() => Promise<{tecnico, at, fuentes}>} pedir  lanza la revisión
 * @param {boolean} [auto]      revisar al montar (por defecto sí)
 * @param {object}  [inicial]   una revisión ya guardada ({ at, tecnico }) para
 *                              enseñarla sin volver a revisar
 * @param {(estado) => void} [onResultado]  'corregir' | 'revisar' | 'bien' | null
 */
export default function PreRevisionCee({ pedir, auto = true, inicial = null, onResultado }) {
    const [datos, setDatos] = useState(inicial);
    const [cargando, setCargando] = useState(false);
    const [error, setError] = useState('');
    const [verSinComprobar, setVerSinComprobar] = useState(false);
    // `onResultado` suele llegar como flecha en línea: por ref, para que su
    // identidad no vuelva a disparar la revisión.
    const avisar = useRef(onResultado);
    avisar.current = onResultado;

    const revisar = async () => {
        setCargando(true); setError('');
        try {
            const d = await pedir();
            setDatos(d);
            avisar.current?.(d?.tecnico?.estado || null);
        } catch (e) {
            setError(e?.response?.data?.error || e?.message || 'No se ha podido revisar.');
            avisar.current?.(null);
        } finally {
            setCargando(false);
        }
    };

    // Diferido y cancelable: en modo estricto React monta dos veces, y sin el
    // `clearTimeout` saldrían DOS revisiones (dos descargas de Drive y dos
    // lecturas del motor) por abrir una vez (mismo patrón que RevisionCeeModal).
    useEffect(() => {
        if (!auto) { if (inicial?.tecnico) avisar.current?.(inicial.tecnico.estado); return undefined; }
        const t = setTimeout(revisar, 0);
        return () => clearTimeout(t);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const v = datos?.tecnico || null;
    const tono = v ? TONO[v.estado] : null;

    return (
        <div className="w-full text-left">
            {cargando && (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5 flex items-center gap-3">
                    <span className="text-brand"><Lupa girando /></span>
                    <div className="min-w-0">
                        <p className="text-[12px] font-bold text-white">Revisando lo que has subido…</p>
                        <p className="text-[11px] text-white/55">Tarda unos segundos: se lee tu .xml y tu .cex.</p>
                    </div>
                </div>
            )}

            {!cargando && error && (
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.07] px-4 py-3">
                    <p className="text-[12px] font-bold text-amber-300">No se ha podido revisar ahora</p>
                    <p className="text-[11px] text-white/65 mt-0.5">{error}</p>
                    <button type="button" onClick={revisar}
                        className="mt-2 text-[10px] font-black uppercase tracking-widest text-amber-300 hover:text-amber-200">
                        ↻ Reintentar
                    </button>
                </div>
            )}

            {!cargando && !error && v && (
                <div className="space-y-2">
                    <div className={`rounded-2xl border px-4 py-3 flex items-start gap-3 ${tono.caja}`}>
                        <span className={`${tono.texto} text-lg font-black leading-none mt-0.5 w-4 text-center`}>{tono.icono}</span>
                        <div className="min-w-0 flex-1">
                            <p className={`text-[13px] font-black ${tono.texto}`}>{v.titular}</p>
                            <p className="text-[11px] text-white/55 mt-0.5">
                                Revisión automática{datos.at ? ` · ${hace(datos.at)}` : ''}. El visto bueno lo da Brokergy.
                            </p>
                        </div>
                    </div>

                    {v.corregir.map((p, i) => <Punto key={`c-${p.id}-${i}`} p={p} />)}
                    {v.revisar.map((p, i) => <Punto key={`r-${p.id}-${i}`} p={p} />)}

                    {v.sinComprobar.length > 0 && (
                        <div>
                            <button type="button" onClick={() => setVerSinComprobar((x) => !x)}
                                className="text-[10px] font-black uppercase tracking-widest text-white/50 hover:text-white/80">
                                {verSinComprobar ? '▾' : '▸'} {v.sinComprobar.length} {v.sinComprobar.length === 1 ? 'punto' : 'puntos'} sin comprobar automáticamente
                            </button>
                            {verSinComprobar && (
                                <div className="space-y-2 mt-2">{v.sinComprobar.map((p, i) => <Punto key={`s-${p.id}-${i}`} p={p} />)}</div>
                            )}
                        </div>
                    )}

                    <div className="flex items-center justify-between gap-3 pt-0.5">
                        <p className="text-[10px] text-white/45">
                            {v.correctos != null ? `✓ ${v.correctos} comprobaciones correctas` : ''}
                        </p>
                        <button type="button" onClick={revisar}
                            className="text-[10px] font-black uppercase tracking-widest text-white/55 hover:text-white shrink-0">
                            ↻ Volver a revisar
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

/**
 * La última revisión previa, abierta desde la chapa del certificador en la
 * rejilla del CEE. Portaleada a `document.body` (regla 29.b): la rejilla vive
 * dentro de tarjetas con `backdrop-filter`, que recortarían un `fixed`.
 */
export function PreRevisionModal({ fase, numExp, inicial, pedir, onClose }) {
    return createPortal(
        <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/75 backdrop-blur-sm animate-fade-in p-4 max-md:p-0 max-md:items-end"
            onClick={onClose}>
            <div className="bg-bkg-deep border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col overflow-hidden max-md:rounded-b-none max-md:rounded-t-3xl max-md:max-h-[92dvh]"
                onClick={(e) => e.stopPropagation()}>
                <div className="px-6 pt-5 pb-3 border-b border-white/[0.06] shrink-0">
                    <h4 className="text-sm font-black text-white uppercase tracking-widest">Revisión de tu CEE {fase === 'final' ? 'final' : 'inicial'}</h4>
                    <p className="text-[10px] text-white/45">Expediente {numExp}</p>
                </div>
                <div className="flex-1 overflow-y-auto overscroll-contain custom-scrollbar px-6 py-4">
                    <PreRevisionCee pedir={pedir} auto={!inicial?.tecnico} inicial={inicial?.tecnico ? inicial : null} />
                </div>
                <div className="px-6 py-3 border-t border-white/[0.06] shrink-0 flex justify-end max-md:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                    <button type="button" onClick={onClose}
                        className="px-4 py-2.5 rounded-xl text-white/60 text-[10px] font-black uppercase tracking-widest hover:text-white">
                        Cerrar
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
}
