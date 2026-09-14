// ─────────────────────────────────────────────────────────────────────────────
// TARIFAS DE VERIFICACIÓN — el listado de precios de un verificador.
//
// Lo que cobra según cuántas actuaciones van juntas, tal y como él lo pasa: por
// TRAMOS, con escalón. Es una referencia ORIENTATIVA — sirve para mirar una
// oferta o una factura y saber si cuadra, no para contabilizar nada.
//
// Vive en la VISTA de la ficha (no en su modo edición) y se edita desde aquí
// mismo: es un dato que se consulta antes de mandar un lote a verificar, y
// tener que entrar en "Editar" para leerlo lo escondería.
//
// La decisión de qué cuesta qué es del módulo puro `lotes/logic/tarifasVerificacion`,
// el MISMO que aplica el lote al comparar. Si la pantalla interpolara por su
// cuenta, la ficha diría un precio y el lote otro.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { FICHAS, fichaColor } from '../../expedientes/logic/expedienteTaxonomia';
import { estimar, normalizarTramos, porActuacion } from '../../lotes/logic/tarifasVerificacion';

const eur = (n, dec = 0) => (Number(n) || 0).toLocaleString('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: dec });
const uid = () => `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// Plantilla de una tarifa nueva: dos tramos vacíos, porque una tabla de un solo
// tramo no tiene escalón y el escalón es lo que se viene a registrar aquí.
const tarifaNueva = () => ({
    id: uid(), nombre: '', fichas: [], nota: '',
    tramos: [{ actuaciones: '', importe: '' }, { actuaciones: '', importe: '' }],
});

export default function TarifasVerificacionPanel({ verificadorId, nombreVerificador }) {
    const [datos, setDatos] = useState(null);      // null = aún cargando
    const [error, setError] = useState('');
    const [editando, setEditando] = useState(false);
    const [borrador, setBorrador] = useState([]);
    const [guardando, setGuardando] = useState(false);

    const cargar = useCallback(async () => {
        if (!verificadorId) return;
        try {
            const { data } = await axios.get(`/api/prescriptores/${verificadorId}/tarifas-verificacion`);
            setDatos(data || { tarifas: [] });
            setError('');
        } catch (e) {
            // Un fallo de lectura NO se pinta como "no tiene tarifas": es una
            // cifra que se va a usar para negociar y no puede faltar en silencio.
            setDatos({ tarifas: [] });
            setError(e.response?.data?.error || 'No se pudieron leer las tarifas.');
        }
    }, [verificadorId]);

    useEffect(() => { cargar(); }, [cargar]);

    const tarifas = datos?.tarifas || [];

    const abrirEdicion = () => {
        setBorrador(tarifas.length
            ? tarifas.map(t => ({ ...t, tramos: t.tramos.map(x => ({ ...x })) }))
            : [tarifaNueva()]);
        setEditando(true);
        setError('');
    };

    const guardar = async () => {
        setGuardando(true); setError('');
        try {
            const { data } = await axios.put(`/api/prescriptores/${verificadorId}/tarifas-verificacion`, { tarifas: borrador });
            setDatos(data);
            setEditando(false);
        } catch (e) {
            setError(e.response?.data?.error || 'No se pudieron guardar las tarifas.');
        } finally { setGuardando(false); }
    };

    const updT = (i, patch) => setBorrador(b => b.map((t, k) => (k === i ? { ...t, ...patch } : t)));
    const updTramo = (i, j, patch) => setBorrador(b => b.map((t, k) => (k !== i ? t : {
        ...t, tramos: t.tramos.map((tr, m) => (m === j ? { ...tr, ...patch } : tr)),
    })));

    if (!verificadorId) return null;

    return (
        <section className="rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4 sm:px-5 py-4">
            <div className="flex items-center gap-2.5 mb-4">
                <span className="grid place-items-center w-6 h-6 rounded-lg bg-white/[0.04] text-white/45 shrink-0">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m-6 4h6m-6 4h4M5 5a2 2 0 012-2h10a2 2 0 012 2v14a2 2 0 01-2 2H7a2 2 0 01-2-2V5z" />
                    </svg>
                </span>
                <h3 className="text-[10px] uppercase tracking-[0.18em] font-black text-white/45 whitespace-nowrap">Tarifas de verificación</h3>
                <span className="flex-1 h-px bg-gradient-to-r from-white/[0.08] to-transparent" />
                {!editando && (
                    <button type="button" onClick={abrirEdicion}
                        className="text-[9px] font-black uppercase tracking-widest text-white/40 hover:text-brand shrink-0">
                        {tarifas.length ? 'Editar' : '+ Añadir'}
                    </button>
                )}
            </div>

            {/* Para qué sirve esto, dicho una vez. Sin la palabra ORIENTATIVA, una
                tabla de precios en una ficha se lee como lo que se paga. */}
            <p className="text-[11px] text-white/30 mb-3 leading-relaxed">
                Lo que cobra {nombreVerificador ? <span className="text-white/50">{nombreVerificador}</span> : 'el verificador'} según
                cuántas actuaciones van juntas. Es una referencia <span className="text-white/50">orientativa</span> para
                contrastar su oferta y su factura — lo que de verdad se paga se registra en cada lote. Importes sin IVA.
            </p>

            {editando ? (
                <EditorTarifas
                    borrador={borrador} setBorrador={setBorrador}
                    updT={updT} updTramo={updTramo}
                    guardando={guardando} error={error}
                    onGuardar={guardar}
                    onCancelar={() => { setEditando(false); setError(''); }}
                />
            ) : datos === null ? (
                <p className="text-[11px] text-white/25">Cargando…</p>
            ) : error ? (
                <div className="px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-400/25">
                    <p className="text-[11px] text-amber-300">{error}</p>
                    <button type="button" onClick={cargar} className="text-[9px] font-black uppercase tracking-widest text-amber-400/80 hover:text-amber-300 mt-1">Reintentar</button>
                </div>
            ) : !tarifas.length ? (
                <p className="text-[11px] text-white/30">
                    Sin tarifas registradas. Cuando el verificador pase sus precios, anótalos aquí
                    y los lotes podrán contrastar contra ellos lo que acabe pidiendo.
                </p>
            ) : (
                <div className="space-y-3">
                    {tarifas.map((t) => <TarifaLeida key={t.id} tarifa={t} />)}
                    {datos.actualizada_at && (
                        <p className="text-[10px] text-white/20">
                            Actualizada el {new Date(datos.actualizada_at).toLocaleDateString('es-ES')}
                            {datos.actualizada_por ? ` por ${datos.actualizada_por}` : ''}.
                        </p>
                    )}
                </div>
            )}
        </section>
    );
}

// ─── Una tarifa, en lectura ──────────────────────────────────────────────────
function TarifaLeida({ tarifa }) {
    // La calculadora arranca en el tamaño de lote habitual (5, que es el máximo
    // de un lote). Es la pregunta que se hace de verdad al abrir esto.
    const [n, setN] = useState('5');
    const estimacion = useMemo(() => estimar(tarifa, n), [tarifa, n]);

    return (
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 space-y-2.5">
            <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[12px] font-black text-white">{tarifa.nombre}</span>
                {tarifa.fichas.map(f => (
                    <span key={f} className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ${fichaColor(f).chip}`}>{f}</span>
                ))}
                {!tarifa.fichas.length && (
                    <span className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-white/[0.06] text-white/35">Todas las fichas</span>
                )}
            </div>

            <div className="overflow-x-auto -mx-1 px-1">
                <table className="w-full text-[11px]">
                    <thead>
                        <tr className="text-[8px] uppercase tracking-widest font-black text-white/30">
                            <th className="text-left pb-1.5 font-black">Actuaciones</th>
                            <th className="text-right pb-1.5 font-black">Importe</th>
                            <th className="text-right pb-1.5 font-black">€ / actuación</th>
                        </tr>
                    </thead>
                    <tbody>
                        {tarifa.tramos.map((tr) => (
                            <tr key={tr.actuaciones} className="border-t border-white/[0.05]">
                                <td className="py-1.5 text-white/70 font-semibold">{tr.actuaciones}</td>
                                <td className="py-1.5 text-right text-white font-black">{eur(tr.importe)} €</td>
                                {/* El €/actuación es la columna con la que de verdad se
                                    compara: un total de 2.000 € no dice nada sin saber
                                    cuántas actuaciones cubre. */}
                                <td className="py-1.5 text-right text-brand/80 font-black">{eur(porActuacion(tr))} €</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {tarifa.nota && <p className="text-[10px] text-white/30 italic">{tarifa.nota}</p>}

            {/* Calculadora. La tabla tiene cuatro filas y las actuaciones reales
                casi nunca caen justo en una de ellas. */}
            <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-white/[0.05]">
                <span className="text-[9px] uppercase tracking-widest font-black text-white/30">Para</span>
                <input type="number" min="1" value={n} onChange={e => setN(e.target.value)}
                    className="w-16 bg-bkg-surface border border-white/[0.08] rounded-lg px-2 py-1 text-[12px] text-white text-center focus:border-brand/40 focus:outline-none" />
                <span className="text-[9px] uppercase tracking-widest font-black text-white/30">actuaciones</span>
                {estimacion ? (
                    <span className="text-[12px] font-black text-white ml-auto">
                        {eur(estimacion.importe)} €
                        <span className="text-white/35 font-bold"> · {eur(estimacion.porActuacion)} €/act.</span>
                    </span>
                ) : <span className="text-[11px] text-white/25 ml-auto">—</span>}
            </div>
            {estimacion?.base === 'interpolado' && (
                <p className="text-[10px] text-white/25">
                    Interpolado entre los tramos de {estimacion.tramoBajo.actuaciones} y {estimacion.tramoAlto.actuaciones}.
                </p>
            )}
            {estimacion?.fueraDeTabla && <p className="text-[10px] text-amber-400/80">⚠ {estimacion.aviso}</p>}
        </div>
    );
}

// ─── Edición ─────────────────────────────────────────────────────────────────
function EditorTarifas({ borrador, setBorrador, updT, updTramo, guardando, error, onGuardar, onCancelar }) {
    return (
        <div className="space-y-3">
            {borrador.map((t, i) => {
                const limpios = normalizarTramos(t.tramos);
                return (
                    <div key={t.id} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 space-y-2.5">
                        <div className="flex items-center gap-2">
                            <input value={t.nombre} onChange={e => updT(i, { nombre: e.target.value })}
                                placeholder="Nombre (ej. Actuaciones en lote)"
                                className="flex-1 bg-bkg-surface border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-[12px] text-white placeholder:text-white/20 focus:border-brand/40 focus:outline-none" />
                            {borrador.length > 1 && (
                                <button type="button" onClick={() => setBorrador(b => b.filter((_, k) => k !== i))}
                                    className="text-[9px] font-black uppercase tracking-widest text-white/25 hover:text-red-400 shrink-0">Quitar</button>
                            )}
                        </div>

                        {/* A qué fichas aplica. Sin marcar ninguna vale para todas: es
                            lo correcto para quien solo tiene una tarifa, que no debería
                            tener que enumerar las cinco para que se le aplique. */}
                        <div>
                            <p className="text-[9px] uppercase tracking-widest font-black text-white/30 mb-1.5">Aplica a</p>
                            <div className="flex flex-wrap gap-1.5">
                                {FICHAS.map(f => {
                                    const on = t.fichas?.includes(f);
                                    return (
                                        <button key={f} type="button"
                                            onClick={() => updT(i, { fichas: on ? t.fichas.filter(x => x !== f) : [...(t.fichas || []), f] })}
                                            className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded border transition-all ${on ? `${fichaColor(f).badge}` : 'border-white/[0.08] text-white/25 hover:text-white/50'}`}>
                                            {f}
                                        </button>
                                    );
                                })}
                            </div>
                            {!t.fichas?.length && <p className="text-[10px] text-white/25 mt-1">Sin marcar ninguna, vale para cualquier ficha.</p>}
                        </div>

                        <div className="space-y-1.5">
                            <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-2 text-[8px] uppercase tracking-widest font-black text-white/30">
                                <span>Actuaciones</span><span>Importe (€, sin IVA)</span><span className="w-16 text-right">€/act.</span><span className="w-8" />
                            </div>
                            {t.tramos.map((tr, j) => {
                                const pa = (Number(tr.actuaciones) > 0 && tr.importe !== '' && tr.importe != null)
                                    ? Number(tr.importe) / Number(tr.actuaciones) : null;
                                return (
                                    <div key={j} className="grid grid-cols-[1fr_1fr_auto_auto] gap-2 items-center">
                                        <input type="number" min="1" value={tr.actuaciones ?? ''} onChange={e => updTramo(i, j, { actuaciones: e.target.value })}
                                            placeholder="5"
                                            className="bg-bkg-surface border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-[12px] text-white placeholder:text-white/20 focus:border-brand/40 focus:outline-none" />
                                        <input type="number" min="0" step="0.01" value={tr.importe ?? ''} onChange={e => updTramo(i, j, { importe: e.target.value })}
                                            placeholder="2000"
                                            className="bg-bkg-surface border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-[12px] text-white placeholder:text-white/20 focus:border-brand/40 focus:outline-none" />
                                        {/* El €/actuación se ve MIENTRAS se teclea: es donde
                                            se nota un cero de más antes de guardarlo. */}
                                        <span className="w-16 text-right text-[11px] font-black text-brand/70">{pa != null ? `${eur(pa)} €` : '—'}</span>
                                        <button type="button" disabled={t.tramos.length <= 1}
                                            onClick={() => updT(i, { tramos: t.tramos.filter((_, m) => m !== j) })}
                                            className="w-8 text-[12px] text-white/20 hover:text-red-400 disabled:opacity-20">✕</button>
                                    </div>
                                );
                            })}
                            <button type="button" onClick={() => updT(i, { tramos: [...t.tramos, { actuaciones: '', importe: '' }] })}
                                className="text-[9px] font-black uppercase tracking-widest text-white/35 hover:text-brand">+ Añadir tramo</button>
                        </div>

                        <input value={t.nota || ''} onChange={e => updT(i, { nota: e.target.value })}
                            placeholder="Nota (de dónde sale, desde cuándo vale…)"
                            className="w-full bg-bkg-surface border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-[11px] text-white placeholder:text-white/20 focus:border-brand/40 focus:outline-none" />

                        {limpios.length < 1 && <p className="text-[10px] text-amber-400/80">⚠ Esta tarifa no tiene ningún tramo completo: no se guardará.</p>}
                    </div>
                );
            })}

            <button type="button" onClick={() => setBorrador(b => [...b, tarifaNueva()])}
                className="text-[9px] font-black uppercase tracking-widest text-white/35 hover:text-brand">+ Otra tarifa</button>

            {error && <p className="text-[11px] text-red-400">{error}</p>}

            <div className="flex items-center gap-2 pt-1">
                <button type="button" disabled={guardando} onClick={onGuardar}
                    className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border border-brand/30 bg-brand/10 text-brand disabled:opacity-40">
                    {guardando ? 'Guardando…' : 'Guardar tarifas'}
                </button>
                <button type="button" disabled={guardando} onClick={onCancelar}
                    className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border border-white/[0.08] text-white/40 hover:text-white disabled:opacity-40">
                    Cancelar
                </button>
            </div>
        </div>
    );
}
