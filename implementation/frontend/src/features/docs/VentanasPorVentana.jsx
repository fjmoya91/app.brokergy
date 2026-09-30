/**
 * VentanasPorVentana — las fotos de las ventanas, una tarjeta por ventana.
 *
 * Sustituye, SOLO en los dos apartados de ventanas, a la casilla de siempre
 * (todas las fotos a un montón). Cada ventana es una tarjeta: su foto de antes y,
 * en el después, la de la ventana nueva con la VIEJA al lado ("así estaba"), que
 * es lo que permite a cualquiera —el cliente, el carpintero o nosotros— saber de
 * qué ventana es la foto que está haciendo. Mobile first: el enlace se usa de pie
 * en la obra, con el pulgar.
 *
 * Las reglas (qué es una ventana, cómo se numera y se rotula) están en
 * `logic/ventanasObra.js`; aquí solo se pintan. El componente no sube ni pinta
 * miniaturas por su cuenta: se lo pide al gestor (DocsManager), que es quien sabe
 * subir por el enlace o por la sesión y quien tiene el visor y la validación.
 */

import React, { useMemo, useState } from 'react';
import {
    ventanasDe, siguienteId, idsParaTanda, progresoDespues, rotuloVentana, NOMBRES_RAPIDOS,
} from './logic/ventanasObra';

export function VentanasPorVentana({
    slot,                 // el apartado de esta tarjeta (antes o después)
    otro = null,          // el apartado pareja (para ver "así estaba" / emparejar)
    clientView = false,
    busy = false,         // subiendo a este apartado
    textoSubiendo = () => 'Subiendo…',
    onSubir,              // (files, { ventana, nombre } | { porFichero: [ids] } | null) => Promise<bool>
    renderFoto,           // (slot, item) => nodo: la miniatura con sus controles
    renderMini,           // (slot, item) => nodo: miniatura pequeña, sin controles
    onRenombrar,          // (ventanaId, nombre) => Promise
    onAsignar,            // (slot, item, ventanaId|null, nombre) => Promise
}) {
    const esDespues = slot.fase === 'DESPUES';

    // Ventanas añadidas en pantalla que aún no tienen foto.
    const [borradores, setBorradores] = useState([]);
    const [editando, setEditando] = useState(null);   // id de la ventana cuyo nombre se edita
    const [nombreTmp, setNombreTmp] = useState('');
    const [subiendoA, setSubiendoA] = useState(null); // id de la ventana que está subiendo ('__todas' = la tanda)
    const [colocando, setColocando] = useState(null); // nombre de la foto que se está colocando
    const [error, setError] = useState(null);

    const { ventanas, sinVentana } = useMemo(() => (esDespues
        ? ventanasDe(otro?.items || [], slot.items || [], borradores)
        : ventanasDe(slot.items || [], otro?.items || [], borradores)),
    [esDespues, slot.items, otro?.items, borradores]);
    const propias = esDespues ? sinVentana.despues : sinVentana.antes;

    // Sin ninguna ventana todavía se enseña ya la PRIMERA, lista para su foto: un
    // "Añadir ventana" delante del primer botón es un paso que no aporta nada.
    const lista = ventanas.length ? ventanas : [{ id: 'V1', n: 1, nombre: null, antes: [], despues: [] }];
    const prog = esDespues ? progresoDespues(ventanas) : null;

    const anadir = () => {
        const id = siguienteId(lista);
        // La "Ventana 1" que se enseña sola mientras no hay ninguna es provisional:
        // al añadir la segunda tiene que quedarse, no desaparecer.
        const primera = ventanas.length ? [] : [{ id: 'V1', nombre: null }];
        setBorradores(prev => [...prev, ...primera, { id, nombre: null }]);
        setEditando(id);
        setNombreTmp('');
    };

    const guardarNombre = async (v, nombre) => {
        const limpio = String(nombre || '').trim();
        setEditando(null);
        const tieneFotos = v.antes.length || v.despues.length;
        // Una ventana sin fotos solo existe en pantalla: su nombre viaja con la
        // primera foto. Con fotos, se escribe en todas (en los dos apartados).
        setBorradores(prev => {
            const sin = prev.filter(b => b.id !== v.id);
            return tieneFotos ? sin : [...sin, { id: v.id, nombre: limpio || null }];
        });
        if (tieneFotos && limpio !== (v.nombre || '')) {
            try { await onRenombrar(v.id, limpio); } catch (e) { setError(e.response?.data?.error || 'No se pudo guardar el nombre.'); }
        }
    };

    const subir = async (v, files) => {
        if (!files?.length) return;
        setError(null);
        setSubiendoA(v.id);
        try {
            await onSubir(Array.from(files), { ventana: v.id, nombre: v.nombre || '' });
        } finally {
            setSubiendoA(null);
        }
    };

    // «Subir todas a la vez». En el ANTES cada foto pasa a ser una ventana nueva
    // (lo normal es una foto por ventana); en el DESPUÉS no hay forma de saber de
    // cuál es cada una, así que entran sin ventana y se colocan tocando la foto
    // de cómo estaba (abajo).
    const subirTodas = async (files) => {
        if (!files?.length) return;
        setError(null);
        setSubiendoA('__todas');
        const lista = Array.from(files);
        try {
            await onSubir(lista, esDespues ? null : { porFichero: idsParaTanda(ventanas, lista.length) });
        } finally {
            setSubiendoA(null);
        }
    };

    const colocar = async (it, id, nombre) => {
        setError(null);
        setColocando(it.name);
        try { await onAsignar(slot, it, id, nombre || ''); }
        catch (err) { setError(err.response?.data?.error || 'No se pudo guardar.'); }
        finally { setColocando(null); }
    };

    // Las del antes que llegaron sueltas (repartidor, WhatsApp): una ventana cada una.
    const cadaUnaEsUnaVentana = async () => {
        const ids = idsParaTanda(ventanas, propias.length);
        // En serie: cada una reescribe el apartado entero, y a la vez se pisarían.
        for (let i = 0; i < propias.length; i++) {
            await colocar(propias[i], ids[i], '');
        }
    };

    const textoBoton = (v) => {
        const tiene = esDespues ? v.despues.length : v.antes.length;
        if (tiene) return '+ Otra foto de esta ventana';
        if (esDespues) return clientView ? '📷 Foto de la ventana nueva' : 'Subir foto nueva';
        return clientView ? '📷 Foto de esta ventana' : 'Subir foto';
    };

    const cabecera = (v) => (
        <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex items-center gap-2">
                <span className="shrink-0 w-7 h-7 rounded-lg bg-white/[0.08] text-white/80 text-xs font-black flex items-center justify-center">{v.n}</span>
                <span className="text-sm font-black text-white truncate">{rotuloVentana(v.id, v.nombre)}</span>
            </div>
            {editando !== v.id && (
                <button type="button" onClick={() => { setEditando(v.id); setNombreTmp(v.nombre || ''); }}
                    className="shrink-0 min-h-[44px] md:min-h-0 px-2.5 text-[11px] font-bold text-white/45 hover:text-white underline underline-offset-2">
                    {v.nombre ? 'Cambiar' : '¿Dónde está?'}
                </button>
            )}
        </div>
    );

    const editorNombre = (v) => editando === v.id && (
        <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
            <p className="text-[11px] text-white/50 mb-2">¿En qué habitación está? (opcional)</p>
            <div className="flex flex-wrap gap-2">
                {NOMBRES_RAPIDOS.map(n => (
                    <button key={n} type="button" onClick={() => guardarNombre(v, n)}
                        className="min-h-[40px] md:min-h-0 px-3 py-1.5 rounded-lg border border-white/15 text-xs font-bold text-white/75 hover:border-amber-400/60 hover:text-white transition-all">
                        {n}
                    </button>
                ))}
            </div>
            <div className="mt-2 flex gap-2">
                <input value={nombreTmp} onChange={e => setNombreTmp(e.target.value)} maxLength={40}
                    onKeyDown={e => { if (e.key === 'Enter') guardarNombre(v, nombreTmp); }}
                    placeholder="Otro sitio (p. ej. dormitorio pequeño)"
                    className="no-uppercase flex-1 min-w-0 min-h-[44px] md:min-h-0 bg-white/[0.06] border-2 border-white/10 focus:border-amber-400 rounded-xl px-3 py-2 text-white text-base md:text-sm outline-none" />
                <button type="button" onClick={() => guardarNombre(v, nombreTmp)}
                    className="shrink-0 min-h-[44px] md:min-h-0 px-4 rounded-xl bg-amber-500 text-black text-xs font-black uppercase tracking-wider">
                    OK
                </button>
            </div>
        </div>
    );

    return (
        <div className="space-y-3">
            {esDespues && prog.total > 0 && (
                <p className={`text-xs font-black ${prog.faltan ? 'text-amber-300' : 'text-emerald-300'}`}>
                    {prog.faltan
                        ? `${prog.hechas} de ${prog.total} ventanas con su foto nueva`
                        : `✓ Las ${prog.total} ventanas tienen su foto nueva`}
                </p>
            )}

            {lista.map(v => {
                const fotos = esDespues ? v.despues : v.antes;
                const hecha = fotos.length > 0;
                const cargando = busy && subiendoA === v.id;
                return (
                    <div key={v.id} className={`rounded-2xl border-2 p-3 md:p-4 transition-all ${hecha ? 'border-emerald-400/30 bg-emerald-400/[0.04]' : 'border-white/10 bg-white/[0.03]'}`}>
                        {cabecera(v)}
                        {editorNombre(v)}

                        {/* En el DESPUÉS, la ventana VIEJA al lado: es lo que dice de qué
                            ventana es la foto que se está haciendo. */}
                        {esDespues && v.antes.length > 0 && (
                            <div className="mt-3 flex items-center gap-2">
                                <span className="text-[10px] font-black uppercase tracking-wider text-white/40 shrink-0">Así estaba</span>
                                <div className="flex gap-1.5 overflow-x-auto">
                                    {v.antes.slice(0, 3).map((it, i) => <React.Fragment key={i}>{renderMini(otro, it)}</React.Fragment>)}
                                </div>
                            </div>
                        )}

                        {fotos.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-3">
                                {fotos.map((it, i) => <React.Fragment key={it.name || i}>{renderFoto(slot, it)}</React.Fragment>)}
                            </div>
                        )}

                        <label className={`mt-3 flex items-center justify-center min-h-[48px] md:min-h-[40px] cursor-pointer rounded-xl text-center text-xs font-black uppercase tracking-widest transition-all ${cargando ? 'bg-white/10 text-white/40' : hecha ? 'border border-white/10 bg-white/[0.05] text-white/65 hover:bg-white/[0.1]' : 'bg-gradient-to-r from-amber-500 to-amber-400 text-black shadow-lg shadow-amber-500/20'}`}>
                            {cargando ? textoSubiendo() : textoBoton(v)}
                            <input type="file" accept={slot.accept} multiple disabled={busy}
                                onChange={e => { subir(v, e.target.files); e.target.value = ''; }}
                                className="hidden" />
                        </label>
                    </div>
                );
            })}

            <button type="button" onClick={anadir} disabled={busy}
                className="w-full min-h-[48px] md:min-h-[40px] rounded-2xl border-2 border-dashed border-white/15 text-xs font-black uppercase tracking-widest text-white/55 hover:border-amber-400/50 hover:text-amber-300 transition-all disabled:opacity-40">
                + Añadir otra ventana
            </button>

            {/* Para quien ya tiene las fotos hechas y no quiere ir una a una. Va
                DESPUÉS y en segundo plano, con la explicación delante: lo ideal
                sigue siendo cada foto en su ventana. */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3 md:p-4">
                <p className="text-xs text-white/60 leading-relaxed">
                    <strong className="text-white/85">Lo ideal es subir cada foto en su ventana</strong>, así sabemos cuál es cuál.
                    {' '}{esDespues
                        ? 'Si prefieres subirlas todas juntas, después te preguntaremos a cuál corresponde cada una.'
                        : 'Si prefieres subirlas todas juntas, cada foto contará como una ventana distinta.'}
                </p>
                <label className={`mt-3 flex items-center justify-center min-h-[48px] md:min-h-[40px] cursor-pointer rounded-xl border border-white/15 text-center text-xs font-black uppercase tracking-widest transition-all ${busy ? 'text-white/35' : 'text-white/70 hover:bg-white/[0.06] hover:text-white'}`}>
                    {busy && subiendoA === '__todas' ? textoSubiendo() : '📷 Subir todas a la vez'}
                    <input type="file" accept={slot.accept} multiple disabled={busy}
                        onChange={e => { subirTodas(e.target.files); e.target.value = ''; }}
                        className="hidden" />
                </label>
            </div>

            {/* Fotos que llegaron sin decir de qué ventana son (por la casilla de
                siempre, del repartidor, del WhatsApp o de antes de esto). Se enseñan
                y se pueden colocar: ninguna foto se queda escondida. */}
            {propias.length > 0 && (
                <div className="rounded-2xl border-2 border-amber-400/25 bg-amber-400/[0.04] p-3 md:p-4">
                    <p className="text-xs font-black text-amber-200">
                        {propias.length === 1 ? '1 foto sin ventana asignada' : `${propias.length} fotos sin ventana asignada`}
                    </p>
                    <p className="text-[11px] text-white/45 mt-0.5">
                        {esDespues ? 'Toca cómo estaba la ventana que corresponde a cada foto.' : 'Dinos de qué ventana es cada una.'}
                    </p>
                    {!esDespues && propias.length > 1 && (
                        <button type="button" onClick={cadaUnaEsUnaVentana} disabled={!!colocando || busy}
                            className="mt-2 min-h-[44px] md:min-h-0 px-3 py-1.5 rounded-lg border border-amber-400/40 text-amber-200 text-[11px] font-black uppercase tracking-wider hover:bg-amber-400/10 transition-all disabled:opacity-40">
                            Cada foto es una ventana distinta
                        </button>
                    )}
                    <div className="mt-3 space-y-3">
                        {esDespues && propias.map((it, i) => {
                            const conAntes = lista.filter(v => v.antes.length);
                            return (
                                <div key={it.name || i} className={`rounded-xl border border-white/10 bg-black/20 p-2.5 ${colocando === it.name ? 'opacity-50' : ''}`}>
                                    <div className="flex items-center gap-3">
                                        {renderMini(slot, it)}
                                        <p className="text-xs font-bold text-white/70">¿Cuál de estas era?</p>
                                    </div>
                                    <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                                        {(conAntes.length ? conAntes : lista).map(v => (
                                            <button key={v.id} type="button" disabled={!!colocando}
                                                onClick={() => colocar(it, v.id, v.nombre)}
                                                className="shrink-0 w-20 rounded-lg border-2 border-white/10 hover:border-emerald-400/70 bg-white/[0.03] overflow-hidden text-left transition-all disabled:opacity-40">
                                                <div className="w-full h-16 flex items-center justify-center">
                                                    {v.antes[0] ? renderMini(otro, v.antes[0], { soloImagen: true }) : <span className="text-xl">🪟</span>}
                                                </div>
                                                <span className="block px-1.5 pt-1 text-[10px] font-black text-white/75 truncate">Ventana {v.n}</span>
                                                <span className="block px-1.5 pb-1 text-[10px] text-white/45 truncate">{v.nombre || ' '}</span>
                                            </button>
                                        ))}
                                        <button type="button" disabled={!!colocando}
                                            onClick={() => colocar(it, siguienteId(lista), '')}
                                            className="shrink-0 w-20 rounded-lg border-2 border-dashed border-white/15 hover:border-amber-400/60 text-[10px] font-black text-white/55 px-1.5 transition-all disabled:opacity-40">
                                            Otra ventana
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                        {!esDespues && propias.map((it, i) => (
                            <div key={it.name || i} className="flex items-center gap-3">
                                {renderMini(slot, it)}
                                <select defaultValue=""
                                    onChange={async e => {
                                        const val = e.target.value;
                                        if (!val) return;
                                        setError(null);
                                        const id = val === '__nueva' ? siguienteId(lista) : val;
                                        const v = lista.find(x => x.id === id);
                                        try { await onAsignar(slot, it, id, v?.nombre || ''); }
                                        catch (err) { setError(err.response?.data?.error || 'No se pudo guardar.'); }
                                    }}
                                    className="no-uppercase flex-1 min-w-0 min-h-[44px] md:min-h-0 bg-white/[0.06] border-2 border-white/10 focus:border-amber-400 rounded-xl px-3 py-2 text-white text-base md:text-sm font-bold outline-none">
                                    <option value="">¿Qué ventana es?</option>
                                    {lista.filter(v => v.antes.length || v.despues.length).map(v => (
                                        <option key={v.id} value={v.id}>{rotuloVentana(v.id, v.nombre)}</option>
                                    ))}
                                    <option value="__nueva">Una ventana nueva</option>
                                </select>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {error && <p className="text-xs text-red-300 font-bold">{error}</p>}
        </div>
    );
}

export default VentanasPorVentana;
