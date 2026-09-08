import React, { useState } from 'react';
import axios from 'axios';
import { SLOTS_INCIDENCIA } from '../logic/incidenciaSlots';
import { useAuth } from '../../../context/AuthContext';

// ============================================================================
// Las incidencias de UN documento, donde está el documento.
// ----------------------------------------------------------------------------
// Hasta ahora la única forma de ver una incidencia era el aviso de la cabecera:
// un contador ("3 GRAVES") que obliga a abrir otra pantalla, leer las tres y
// volver a adivinar a cuál de los ocho documentos se refiere cada una. Este panel
// las enseña EN la fila del documento, con lo que hay que hacer al lado.
//
// REGLA — se distingue lo REGISTRADO de lo DETECTADO. Una incidencia registrada
// la dio de alta alguien y solo se cierra subsanándola; una detectada (las fechas
// del CIFO) se calcula cada vez que se abre la pantalla y se apaga sola al
// corregir el dato. Presentarlas igual haría buscar en la lista de incidencias
// una que no está, o dar por resuelto un descuadre que sigue ahí.
//
// REGLA — se puede RECLASIFICAR, DESCARTAR y BORRAR sin salir de aquí, igual que
// desde el panel de incidencias. Revisar un documento es exactamente el momento
// en que se descubre que una GRAVE era en realidad leve, o que ya no procede:
// obligar a cerrar el visor, abrir otra pantalla, buscar la incidencia entre las
// de todo el expediente y volver, hace que no se reclasifique nunca — y el
// expediente acumula GRAVES que nadie se cree.
//   · La etiqueta de severidad es un TOGGLE (mismo gesto que en IncidenciasModal).
//   · DESCARTAR es subsanar sin escribir el motivo: para la que no procede, donde
//     redactar una explicación cuesta más que el juicio que se está emitiendo.
//   · BORRAR es adminOnly, como su ruta: se lleva la traza por delante.
// ============================================================================

const Chip = ({ children, tono }) => (
    <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest border ${tono}`}>{children}</span>
);

const fecha = (v) => {
    if (!v) return null;
    try { return new Date(v).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }); }
    catch { return null; }
};

export function IncidenciasSlotPanel({ expedienteId, slot, incidencias, onCambio, compacto = false, variant = 'card' }) {
    const { user } = useAuth();
    const [busyId, setBusyId] = useState(null);
    const [resolviendo, setResolviendo] = useState(null); // id de la que se está subsanando
    const [texto, setTexto] = useState('');
    const [error, setError] = useState('');

    if (!incidencias?.length) return null;

    const esAside = variant === 'aside';
    const graves = incidencias.filter(i => i.severidad === 'GRAVE').length;

    const subsanar = async (inc, resolucion) => {
        setBusyId(inc.id); setError('');
        try {
            await axios.patch(`/api/expedientes/${expedienteId}/incidencias/${inc.id}/resolver`, {
                resolucion: (resolucion ?? texto).trim(),
            });
            setResolviendo(null); setTexto('');
            onCambio?.();
        } catch (e) {
            setError(e.response?.data?.error || 'No se pudo marcar como subsanada.');
        } finally { setBusyId(null); }
    };

    // Reclasificar GRAVE ⇄ LEVE pulsando la propia etiqueta. Queda traza en el hilo.
    const toggleSeveridad = async (inc) => {
        const destino = inc.severidad === 'GRAVE' ? 'LEVE' : 'GRAVE';
        setBusyId(inc.id); setError('');
        try {
            await axios.patch(`/api/expedientes/${expedienteId}/incidencias/${inc.id}/severidad`, { severidad: destino });
            onCambio?.();
        } catch (e) {
            setError(e.response?.data?.error || 'No se pudo cambiar la severidad.');
        } finally { setBusyId(null); }
    };

    const borrar = async (inc) => {
        if (!window.confirm('Se borra la incidencia y su hilo de comentarios. Si solo ha dejado de proceder, usa "Descartar" — eso conserva la traza.\n\n¿Borrarla igualmente?')) return;
        setBusyId(inc.id); setError('');
        try {
            await axios.delete(`/api/expedientes/${expedienteId}/incidencias/${inc.id}`);
            onCambio?.();
        } catch (e) {
            setError(e.response?.data?.error || 'No se pudo borrar la incidencia.');
        } finally { setBusyId(null); }
    };

    // Una DETECTADA no está en la base: si se quiere que quede constancia (por
    // ejemplo para justificar ante el verificador que se vio y se decidió algo),
    // se da de alta con un clic, y entonces ya se comporta como cualquier otra.
    const registrar = async (inc) => {
        setBusyId(inc.id); setError('');
        try {
            await axios.post(`/api/expedientes/${expedienteId}/incidencias`, {
                texto: inc.texto,
                severidad: inc.severidad,
                procedencia: 'REVISION_INTERNA',
                tipo: inc.tipo || null,
                slot: inc.slot || slot || null,
            });
            onCambio?.();
        } catch (e) {
            setError(e.response?.data?.error || 'No se pudo registrar la incidencia.');
        } finally { setBusyId(null); }
    };

    const marco = esAside
        ? ''
        : `rounded-2xl border ${graves ? 'border-red-500/40 bg-red-500/[0.07]' : 'border-amber-500/35 bg-amber-500/[0.06]'} ${compacto ? 'p-3' : 'p-4'}`;

    return (
        <div className={marco}>
            <div className="flex items-center gap-2 mb-3">
                <svg className={`w-4 h-4 shrink-0 ${graves ? 'text-red-400' : 'text-amber-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 9v3.5m0 3h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                <p className={`text-[11px] font-black uppercase tracking-widest ${graves ? 'text-red-300' : 'text-amber-300'}`}>
                    {incidencias.length} incidencia{incidencias.length === 1 ? '' : 's'}{esAside ? '' : ` en ${SLOTS_INCIDENCIA[slot] || 'este documento'}`}
                    {graves ? ` · ${graves} grave${graves === 1 ? '' : 's'}` : ''}
                </p>
            </div>

            <ul className={`space-y-2.5 ${esAside ? '' : 'max-h-[38vh] overflow-y-auto custom-scrollbar pr-1'}`}>
                {incidencias.map(inc => {
                    const grave = inc.severidad === 'GRAVE';
                    const busy = busyId === inc.id;
                    return (
                    <li key={inc.id} className={`rounded-xl border p-3 ${grave ? 'border-red-500/25 bg-red-500/[0.05]' : 'border-white/10 bg-black/25'}`}>
                        <div className="flex items-center gap-2 flex-wrap mb-1.5">
                            {inc.detectada ? (
                                <Chip tono={grave
                                    ? 'text-red-300 bg-red-500/15 border-red-500/40'
                                    : 'text-amber-300 bg-amber-500/15 border-amber-500/40'}>{inc.severidad}</Chip>
                            ) : (
                                // La etiqueta de severidad es un TOGGLE: un clic la pasa de GRAVE a LEVE y al revés.
                                <button
                                    type="button"
                                    onClick={() => toggleSeveridad(inc)}
                                    disabled={busy}
                                    title={`Pulsa para reclasificar como ${grave ? 'LEVE' : 'GRAVE'}`}
                                    className={`group inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest border transition-all active:scale-95 disabled:opacity-40 ${
                                        grave
                                            ? 'text-red-300 bg-red-500/15 border-red-500/40 hover:bg-red-500/25'
                                            : 'text-amber-300 bg-amber-500/15 border-amber-500/40 hover:bg-amber-500/25'
                                    }`}
                                >
                                    {inc.severidad}
                                    <svg className="w-2.5 h-2.5 opacity-40 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                                    </svg>
                                </button>
                            )}
                            {inc.detectada
                                ? <Chip tono="text-sky-300 bg-sky-500/10 border-sky-500/30">detectada ahora</Chip>
                                : <Chip tono="text-white/45 bg-white/5 border-white/10">{inc.procedencia?.replace(/_/g, ' ') || 'registrada'}</Chip>}
                            {!inc.detectada && fecha(inc.fecha) && (
                                <span className="text-[9px] text-white/30 font-bold uppercase tracking-widest">{fecha(inc.fecha)}</span>
                            )}
                            {inc.evidencia && (
                                <span className="text-[9px] text-white/45 font-mono bg-white/5 border border-white/10 rounded px-1.5 py-0.5">{inc.evidencia}</span>
                            )}
                        </div>

                        <p className="text-[12px] text-white/75 leading-relaxed whitespace-pre-line">{inc.texto}</p>

                        {inc.detectada ? (
                            <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                                <p className="text-[10px] text-sky-300/70 flex-1 min-w-[180px]">
                                    Se apaga sola en cuanto se corrija el dato. No hay nada que subsanar aquí.
                                </p>
                                <button
                                    onClick={() => registrar(inc)}
                                    disabled={busy}
                                    className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/15 text-white/60 text-[9px] font-black uppercase tracking-widest hover:bg-white/10 hover:text-white transition-all disabled:opacity-40"
                                >
                                    {busy ? 'Registrando…' : 'Dejar constancia'}
                                </button>
                            </div>
                        ) : resolviendo === inc.id ? (
                            <div className="mt-2.5 space-y-2">
                                <textarea
                                    value={texto}
                                    onChange={e => setTexto(e.target.value)}
                                    rows={2}
                                    autoFocus
                                    placeholder="Cómo se ha subsanado (lo leerá quien revise el expediente dentro de tres meses)"
                                    className="w-full bg-black/40 border border-white/15 rounded-xl px-3 py-2 text-[12px] text-white/80 placeholder:text-white/25 focus:border-emerald-500/50 focus:outline-none no-uppercase"
                                />
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => subsanar(inc)}
                                        disabled={busy || !texto.trim()}
                                        className="px-3 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500 hover:text-white transition-all disabled:opacity-40"
                                    >
                                        {busy ? 'Guardando…' : 'Marcar subsanada'}
                                    </button>
                                    <button
                                        onClick={() => { setResolviendo(null); setTexto(''); }}
                                        className="px-3 py-2 rounded-xl border border-white/10 text-white/45 text-[10px] font-black uppercase tracking-widest hover:text-white/70 transition-all"
                                    >
                                        Cancelar
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                                <button
                                    onClick={() => { setResolviendo(inc.id); setTexto(''); }}
                                    disabled={busy}
                                    className="px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[9px] font-black uppercase tracking-widest hover:bg-emerald-500 hover:text-white transition-all disabled:opacity-40"
                                >
                                    Subsanar
                                </button>
                                {/* DESCARTAR — la que no procede se cierra con un clic, sin
                                    obligar a redactar un motivo que nadie va a leer. */}
                                <button
                                    onClick={() => subsanar(inc, 'Descartada al revisar el documento: no procede.')}
                                    disabled={busy}
                                    title="No procede — se cierra dejando la traza"
                                    className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/12 text-white/50 text-[9px] font-black uppercase tracking-widest hover:bg-white/10 hover:text-white/85 transition-all disabled:opacity-40"
                                >
                                    {busy ? '…' : 'Descartar'}
                                </button>
                                {/* Reclasificar también con un botón que lo DICE. El chip de
                                    arriba ya es un toggle, pero un chip que además es botón no
                                    se descubre: lo que se está haciendo al revisar es decidir
                                    si esto es grave o no, y esa decisión merece su propio
                                    control con el destino escrito. */}
                                <button
                                    onClick={() => toggleSeveridad(inc)}
                                    disabled={busy}
                                    title={`Reclasificar como ${grave ? 'LEVE' : 'GRAVE'}`}
                                    className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all disabled:opacity-40 ${
                                        grave
                                            ? 'bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-400 hover:text-bkg-deep'
                                            : 'bg-red-500/10 border-red-500/30 text-red-300 hover:bg-red-500 hover:text-white'
                                    }`}
                                >
                                    {busy ? '…' : (grave ? 'Pasar a leve' : 'Pasar a grave')}
                                </button>
                                {user?.rol === 'ADMIN' && (
                                    <button
                                        onClick={() => borrar(inc)}
                                        disabled={busy}
                                        title="Borrar la incidencia (se pierde la traza)"
                                        className="ml-auto w-7 h-7 rounded-lg border border-red-500/15 text-red-500/60 flex items-center justify-center hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/35 transition-all disabled:opacity-40"
                                    >
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                    </button>
                                )}
                            </div>
                        )}
                    </li>
                    );
                })}
            </ul>

            {error && <p className="mt-2 text-[11px] text-red-400">{error}</p>}
        </div>
    );
}

export default IncidenciasSlotPanel;
