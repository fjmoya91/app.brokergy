import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { formatPageRanges } from '../logic/annexPrefs';
import { destinosConsolidacion, piezasParaConsolidar, paginasDelConjunto } from '../logic/fichaConsolidable';

// ============================================================================
// ConsolidarFichaModal — "esto que ya has dado por bueno, guárdalo como LA ficha
//                         de este modelo".
// ----------------------------------------------------------------------------
// El caso que lo justifica: el SCOP se justifica por EPREL, la ficha del
// fabricante no trae la ficha EPREL ni la etiqueta, y alguien las busca y las
// suelta a mano en el gestor de anexos. En cada expediente con ese equipo. Aquí
// se unen las tres en un solo PDF que pasa a ser la ficha del modelo: el
// siguiente expediente la copia entera y no hay nada que volver a buscar.
//
// REGLA — se PROPONE y se REVISA; el botón no es un atajo. Lo que se guarda va a
// un catálogo COMPARTIDO y se adjuntará a todos los expedientes que lleven ese
// modelo, así que la pantalla enseña qué modelo, qué piezas, en qué orden y
// cuántas páginas salen — que es lo que se comprobaría abriendo el PDF.
//
// REGLA — el ORDEN no se toca aquí. Es el del gestor de anexos, que es el mismo
// con el que las piezas van dentro del certificado. Reordenarlas en dos sitios
// distintos haría que la ficha suelta y la que va dentro dejaran de coincidir.
// ============================================================================

const Fila = ({ pieza, marcada, onToggle }) => (
    <label className={`flex items-start gap-3 p-3 rounded-2xl border transition-all ${pieza.fija ? 'bg-brand/5 border-brand/30' : marcada ? 'bg-white/[0.04] border-white/15 cursor-pointer' : 'bg-white/[0.02] border-white/5 cursor-pointer'}`}>
        <input
            type="checkbox"
            checked={marcada}
            disabled={pieza.fija}
            onChange={onToggle}
            className="mt-0.5 w-4 h-4 accent-brand shrink-0 disabled:opacity-60"
        />
        <span className="min-w-0 flex-1">
            <span className={`block text-[11px] font-black uppercase tracking-wider truncate ${marcada ? 'text-white/85' : 'text-white/35'}`}>
                {pieza.label}
            </span>
            <span className="block text-[10px] text-white/35 truncate">{pieza.nombre}</span>
            <span className="block text-[9px] font-bold uppercase tracking-wider text-white/25 mt-0.5">
                {pieza.fija && <span className="text-brand/70">La ficha que se sustituye · </span>}
                {pieza.paginas === null ? 'Páginas sin calcular' : `${pieza.paginas} págs`}
                {pieza.excluidas.length > 0 && (
                    <span className="text-red-400/70"> · sin las págs {formatPageRanges(pieza.excluidas)}</span>
                )}
            </span>
        </span>
    </label>
);

/**
 * @param {object}   expediente
 * @param {Array}    attachments  anexos YA ordenados y filtrados (como se pintan)
 * @param {object}   annexPrefs
 * @param {Array}    slots        `resolveFichaSlots` / `resolveAllFichaSlots`
 * @param {Function} onHecho      recibe el parte del backend
 * @param {Function} onClose
 */
export default function ConsolidarFichaModal({ expediente, attachments, annexPrefs, slots, onHecho, onClose }) {
    const destinos = useMemo(
        () => destinosConsolidacion(attachments, slots).filter(d => d.tieneFichero),
        [attachments, slots]
    );
    const [destinoId, setDestinoId] = useState(() => destinos[0]?.id || null);
    const destino = destinos.find(d => d.id === destinoId) || null;

    const piezas = useMemo(
        () => piezasParaConsolidar(attachments, annexPrefs, { destinoId, destinos }),
        [attachments, annexPrefs, destinoId, destinos]
    );

    // El marcado se guarda por driveId y se rearma cuando cambia el destino: al
    // cambiar de modelo, lo que estaba marcado para el anterior deja de valer.
    const [marcadas, setMarcadas] = useState(() => new Set());
    const [destinoAplicado, setDestinoAplicado] = useState(null);
    if (destinoAplicado !== destinoId) {
        setDestinoAplicado(destinoId);
        setMarcadas(new Set(piezas.filter(p => p.porDefecto).map(p => p.driveId)));
    }

    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState(null);

    const seleccionadas = piezas.filter(p => marcadas.has(p.driveId));
    const paginas = paginasDelConjunto(piezas, marcadas);
    const suficientes = seleccionadas.length >= 2;

    const toggle = (driveId) => setMarcadas(prev => {
        const next = new Set(prev);
        if (next.has(driveId)) next.delete(driveId); else next.add(driveId);
        return next;
    });

    const guardar = async () => {
        if (!destino || !suficientes || guardando) return;
        setGuardando(true);
        setError(null);
        try {
            const { data } = await axios.post(
                `/api/expedientes/${expediente.id}/fichas-tecnicas/consolidar`,
                {
                    type: destino.type,
                    piezas: seleccionadas.map(p => ({ driveId: p.driveId, excludedPages: p.excluidas })),
                }
            );
            onHecho?.({ ...data, destino });
            onClose?.();
        } catch (err) {
            const d = err.response?.data || {};
            setError(d.message || d.error || err.message);
        } finally {
            setGuardando(false);
        }
    };

    if (!destino) return null;

    return createPortal(
        <div className="fixed inset-0 z-[320] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm"
             onClick={onClose}
             onDragOver={e => e.preventDefault()}
             onDrop={e => e.preventDefault()}>
            <div className="w-full max-w-lg bg-[#16181D] border border-white/10 rounded-3xl shadow-2xl overflow-hidden"
                 onClick={e => e.stopPropagation()}>

                <div className="px-7 pt-6 pb-4 border-b border-white/5">
                    <h3 className="text-white font-black uppercase tracking-widest text-xs">
                        Guardar el conjunto como ficha del modelo
                    </h3>
                    <p className="text-[11px] text-white/45 mt-2 leading-snug">
                        Se unen en <b className="text-white/75">un solo PDF</b>, en este mismo orden, y pasa a ser la
                        ficha técnica del modelo en el catálogo. A partir de ahora, cualquier expediente que
                        lleve ese equipo se la copia entera — ya no hay que volver a buscar el EPREL ni la
                        etiqueta.
                    </p>
                </div>

                <div className="px-7 py-5 grid gap-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
                    {/* Destino: con un solo modelo no es una pregunta, es un dato. */}
                    <div>
                        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/25 mb-2">Modelo al que se le guarda</p>
                        {destinos.length === 1 ? (
                            <div className="px-4 py-3 rounded-2xl bg-white/[0.03] border border-white/10">
                                <span className="block text-[11px] font-black uppercase tracking-wider text-white/80 truncate">
                                    {destino.modeloLabel || destino.label}
                                </span>
                                <span className="block text-[10px] text-white/35 truncate">{destino.label}</span>
                            </div>
                        ) : (
                            <select
                                value={destinoId}
                                onChange={e => setDestinoId(e.target.value)}
                                className="w-full px-4 py-3 rounded-2xl bg-white/[0.03] border border-white/10 text-[11px] font-bold text-white/80 focus:border-brand outline-none"
                            >
                                {destinos.map(d => (
                                    <option key={d.id} value={d.id}>
                                        {d.modeloLabel ? `${d.modeloLabel} — ${d.label}` : d.label}
                                    </option>
                                ))}
                            </select>
                        )}
                        {destinos.length > 1 && (
                            <p className="text-[10px] text-amber-300/70 mt-2 leading-snug">
                                Este expediente lleva {destinos.length} modelos distintos. Marca solo los PDFs que
                                justifican <b>éste</b>: la app no puede saber de cuál es cada uno, y una ficha EPREL
                                guardada en el modelo equivocado se adjunta luego a todos sus expedientes.
                            </p>
                        )}
                    </div>

                    <div>
                        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/25 mb-2">Qué se une, y en qué orden</p>
                        <div className="grid gap-2">
                            {piezas.map(p => (
                                <Fila key={p.driveId} pieza={p} marcada={marcadas.has(p.driveId)} onToggle={() => toggle(p.driveId)} />
                            ))}
                        </div>
                        <p className="text-[10px] text-white/30 mt-2">
                            El orden es el del gestor de anexos — ciérralo y muévelos ahí si quieres otro.
                            {paginas !== null && (
                                <> La ficha quedará en <b className="text-white/60">{paginas} páginas</b>.</>
                            )}
                        </p>
                    </div>

                    <div className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.06] p-4 grid gap-2">
                        <p className="text-[10px] text-amber-200/80 leading-snug">
                            ⚠ Sustituye la ficha que el catálogo tenga de ese modelo. La anterior queda archivada
                            en OLD.
                        </p>
                        <p className="text-[10px] text-white/40 leading-snug">
                            Este expediente pasa a llevar el conjunto como una sola ficha: los PDFs sueltos salen
                            de la lista de anexos (el fichero sigue en Drive). Tiene que ser así — si se quedaran,
                            el certificado los llevaría dos veces.
                        </p>
                    </div>

                    {error && (
                        <p className="text-[11px] text-red-400 bg-red-500/10 border border-red-400/30 rounded-2xl p-3 leading-snug">{error}</p>
                    )}
                </div>

                <div className="px-7 py-4 border-t border-white/5 flex items-center justify-end gap-3 bg-black/30">
                    <button onClick={onClose} disabled={guardando}
                            className="px-4 py-2 rounded-xl text-[11px] font-black uppercase text-white/30 hover:text-white/60 transition-all disabled:opacity-30">
                        Cancelar
                    </button>
                    <button
                        onClick={guardar}
                        disabled={!suficientes || guardando}
                        title={suficientes ? undefined : 'Marca al menos otro documento además de la ficha'}
                        className="px-6 py-2.5 rounded-xl bg-brand text-black text-[11px] font-black uppercase tracking-widest shadow-lg shadow-brand/20 active:scale-95 transition-all disabled:opacity-30 disabled:active:scale-100 flex items-center gap-2"
                    >
                        {guardando && (
                            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                        )}
                        {guardando ? 'Uniendo…' : 'Guardar en el catálogo'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
