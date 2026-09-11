import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { formatPageRanges } from '../logic/annexPrefs';
import {
    destinosConsolidacion, piezasSueltas, repartoInicial, construirGrupos,
    motivoBloqueo, etiquetaCorta, payloadGrupos,
} from '../logic/fichaConsolidable';

// ============================================================================
// ConsolidarFichaModal — "esto que ya has dado por bueno, guárdalo como LA ficha
//                         de este equipo".
// ----------------------------------------------------------------------------
// El caso que lo justifica: el SCOP se justifica por EPREL, la ficha del
// fabricante no trae la ficha EPREL ni la etiqueta, y alguien las busca y las
// suelta a mano en el gestor de anexos. En cada expediente con ese equipo. Aquí
// se unen en un solo PDF que pasa a ser la ficha del modelo: el siguiente
// expediente la copia entera y no hay nada que volver a buscar.
//
// REGLA — un pack POR EQUIPO. La bomba de calefacción y el equipo de ACS son dos
// modelos distintos del catálogo: la ficha de uno no puede acabar dentro de la
// del otro. Se marca a cuál o cuáles se le guarda, y cada uno arma el suyo.
//
// REGLA — de quién es cada PDF suelto lo dice una PERSONA. Con más de un equipo
// nada viene preasignado: el EPREL puede ser de la bomba, del equipo de ACS, o
// valer para los dos. Adivinarlo por el nombre del fichero es meter la ficha de
// un equipo en el catálogo del otro, y eso baja a todos sus expedientes.
//
// REGLA — el ORDEN no se toca aquí. Es el del gestor de anexos, que es el mismo
// con el que las piezas van dentro del certificado. Reordenarlas en dos sitios
// distintos haría que la ficha suelta y la que va dentro dejaran de coincidir.
// ============================================================================

const Pagina = ({ n, excluidas }) => (
    <span className="text-[9px] font-bold uppercase tracking-wider text-white/25">
        {n === null ? 'Páginas sin calcular' : `${n} págs`}
        {excluidas.length > 0 && (
            <span className="text-red-400/70"> · sin las págs {formatPageRanges(excluidas)}</span>
        )}
    </span>
);

export default function ConsolidarFichaModal({ expediente, attachments, annexPrefs, slots, onHecho, onClose }) {
    const destinos = useMemo(
        () => destinosConsolidacion(attachments, annexPrefs, slots),
        [attachments, annexPrefs, slots]
    );
    const sueltas = useMemo(() => piezasSueltas(attachments, annexPrefs), [attachments, annexPrefs]);
    const varios = destinos.length > 1;

    const [reparto, setReparto] = useState(() => repartoInicial(destinos, sueltas));
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState(null);

    const grupos = useMemo(
        () => construirGrupos(attachments, annexPrefs, destinos, reparto),
        [attachments, annexPrefs, destinos, reparto]
    );
    const bloqueo = motivoBloqueo(grupos);

    const toggleDestino = (id) => setReparto(prev => {
        const marcados = new Set(prev.marcados);
        if (marcados.has(id)) marcados.delete(id); else marcados.add(id);
        // Una pieza asignada a un equipo que se desmarca deja de estar repartida.
        const asignacion = Object.fromEntries(
            Object.entries(prev.asignacion).map(([d, ids]) => [d, ids.filter(x => marcados.has(x))])
        );
        return { marcados, asignacion };
    });

    const asignar = (driveId, valor) => setReparto(prev => ({
        ...prev,
        asignacion: {
            ...prev.asignacion,
            [driveId]: valor === 'ambos' ? [...prev.marcados] : (valor ? [valor] : []),
        },
    }));

    const valorDe = (driveId) => {
        const ids = reparto.asignacion[driveId] || [];
        if (ids.length === 0) return '';
        if (ids.length > 1) return 'ambos';
        return ids[0];
    };

    const guardar = async () => {
        if (bloqueo || guardando) return;
        setGuardando(true);
        setError(null);
        try {
            const { data } = await axios.post(
                `/api/expedientes/${expediente.id}/fichas-tecnicas/consolidar`,
                { grupos: payloadGrupos(grupos) }
            );
            onHecho?.({ ...data, destinos: grupos.map(g => g.destino) });
            onClose?.();
        } catch (err) {
            const d = err.response?.data || {};
            setError(d.message || d.error || err.message);
        } finally {
            setGuardando(false);
        }
    };

    if (destinos.length === 0) return null;

    const marcadosList = destinos.filter(d => reparto.marcados.has(d.id));

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
                        Se unen en <b className="text-white/75">un solo PDF</b>, en el orden del gestor y con las
                        páginas que hayas quitado ya fuera. Ese PDF pasa a ser la ficha técnica del modelo en el
                        catálogo, y cualquier expediente que lleve ese equipo se la copia entera.
                    </p>
                </div>

                <div className="px-7 py-5 grid gap-5 max-h-[60vh] overflow-y-auto custom-scrollbar">
                    {/* ── A qué equipo(s) ─────────────────────────────────── */}
                    <div>
                        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/25 mb-2">
                            {varios ? 'Para qué equipo lo guardas' : 'Modelo al que se le guarda'}
                        </p>
                        <div className="grid gap-2">
                            {destinos.map(d => {
                                const marcado = reparto.marcados.has(d.id);
                                const g = grupos.find(x => x.destino.id === d.id);
                                return (
                                    <label key={d.id}
                                           className={`flex items-start gap-3 p-3 rounded-2xl border transition-all ${marcado ? 'bg-brand/[0.07] border-brand/30' : 'bg-white/[0.02] border-white/5'} ${varios ? 'cursor-pointer' : ''}`}>
                                        <input type="checkbox" checked={marcado}
                                               disabled={!varios}
                                               onChange={() => toggleDestino(d.id)}
                                               className="mt-0.5 w-4 h-4 accent-brand shrink-0 disabled:opacity-60" />
                                        <span className="min-w-0 flex-1">
                                            <span className={`block text-[11px] font-black uppercase tracking-wider truncate ${marcado ? 'text-white/85' : 'text-white/35'}`}>
                                                {d.modeloLabel || d.label}
                                            </span>
                                            <span className="block text-[10px] text-white/35 truncate">{d.label}</span>
                                            <Pagina n={d.paginas} excluidas={d.excluidas} />
                                            {marcado && g && (
                                                <span className="block text-[10px] text-brand/80 font-bold mt-1">
                                                    → {g.piezas.length === 1
                                                        ? 'solo su ficha, recortada'
                                                        : `${g.piezas.length} documentos`}
                                                    {g.paginas !== null && ` · ${g.paginas} págs`}
                                                </span>
                                            )}
                                        </span>
                                    </label>
                                );
                            })}
                        </div>
                        {varios && (
                            <p className="text-[10px] text-amber-300/70 mt-2 leading-snug">
                                Este expediente lleva {destinos.length} equipos y cada uno tiene SU ficha en el
                                catálogo. Nunca se juntan en el mismo documento.
                            </p>
                        )}
                    </div>

                    {/* ── Reparto de los PDFs sueltos ─────────────────────── */}
                    {sueltas.length > 0 && (
                        <div>
                            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/25 mb-2">
                                {varios ? '¿De qué equipo es cada documento?' : 'Qué se une a la ficha'}
                            </p>
                            <div className="grid gap-2">
                                {sueltas.map(p => {
                                    const v = valorDe(p.driveId);
                                    return (
                                        <div key={p.driveId}
                                             className={`flex items-center gap-3 p-3 rounded-2xl border transition-all ${v ? 'bg-white/[0.04] border-white/15' : 'bg-white/[0.02] border-white/5'}`}>
                                            <span className="min-w-0 flex-1">
                                                <span className={`block text-[11px] font-black uppercase tracking-wider truncate ${v ? 'text-white/85' : 'text-white/35'}`}>
                                                    {p.label}
                                                </span>
                                                <Pagina n={p.paginas} excluidas={p.excluidas} />
                                            </span>
                                            {varios ? (
                                                <select
                                                    value={v}
                                                    onChange={e => asignar(p.driveId, e.target.value)}
                                                    className="shrink-0 px-3 py-2 rounded-xl bg-white/[0.05] border border-white/10 text-[10px] font-bold uppercase tracking-wider text-white/80 focus:border-brand outline-none"
                                                >
                                                    <option value="">— No lo incluyas —</option>
                                                    {marcadosList.map(d => (
                                                        <option key={d.id} value={d.id}>{etiquetaCorta(d)}</option>
                                                    ))}
                                                    {marcadosList.length > 1 && <option value="ambos">Los dos</option>}
                                                </select>
                                            ) : (
                                                <input type="checkbox" checked={!!v}
                                                       onChange={() => asignar(p.driveId, v ? '' : destinos[0].id)}
                                                       className="w-4 h-4 accent-brand shrink-0" />
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                            <p className="text-[10px] text-white/30 mt-2">
                                {varios
                                    ? 'Lo que dejes sin asignar se queda como anexo suelto de este expediente, sin entrar en ningún catálogo.'
                                    : 'El orden es el del gestor de anexos — ciérralo y muévelos ahí si quieres otro.'}
                            </p>
                        </div>
                    )}

                    <div className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.06] p-4 grid gap-2">
                        <p className="text-[10px] text-amber-200/80 leading-snug">
                            ⚠ Sustituye la ficha que el catálogo tenga de {marcadosList.length > 1 ? 'esos modelos' : 'ese modelo'}.
                            La anterior queda archivada en OLD.
                        </p>
                        <p className="text-[10px] text-white/40 leading-snug">
                            Este expediente pasa a llevar cada conjunto como una sola ficha: los PDFs que hayas
                            repartido salen de la lista de anexos (el fichero sigue en Drive). Tiene que ser así — si
                            se quedaran, el certificado los llevaría dos veces.
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
                        disabled={!!bloqueo || guardando}
                        title={bloqueo || undefined}
                        className="px-6 py-2.5 rounded-xl bg-brand text-black text-[11px] font-black uppercase tracking-widest shadow-lg shadow-brand/20 active:scale-95 transition-all disabled:opacity-30 disabled:active:scale-100 flex items-center gap-2"
                    >
                        {guardando && (
                            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                        )}
                        {guardando
                            ? 'Uniendo…'
                            : (marcadosList.length > 1 ? `Guardar ${marcadosList.length} fichas` : 'Guardar en el catálogo')}
                    </button>
                </div>
                {bloqueo && !guardando && (
                    <p className="px-7 pb-4 -mt-2 text-[10px] text-amber-300/70 text-right leading-snug bg-black/30">{bloqueo}</p>
                )}
            </div>
        </div>,
        document.body
    );
}
