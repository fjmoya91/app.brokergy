// ============================================================================
// EnvioLoteModal.jsx — un mensaje, varios expedientes.
//
// Es la pantalla donde se despacha un grupo del parte. Repite a propósito las mismas
// decisiones que la página pública de acción (routes/acciones.js), porque el problema
// es el mismo: el mensaje se lee, se retoca y sale a un TERCERO sin vuelta atrás.
//
// PENSADA PARA EL MÓVIL:
//   · UN SOLO EJE DE SCROLL. La lista de expedientes no tiene scroll propio: dos
//     scrolls anidados en una pantalla táctil son una trampa — arrastras el de dentro
//     creyendo que mueves el de fuera, y la última fila siempre aparece cortada.
//   · La cabecera queda FIJA: mientras revisas la lista tienes que seguir viendo A
//     QUIÉN le estás escribiendo.
//   · La barra de acción va abajo y respeta el área segura del iPhone, para que el
//     botón no caiga bajo la barra de gestos.
//   · El mensaje viene PLEGADO: casi nunca se edita y enseñarlo entero solo aleja el
//     botón de enviar.
//   · Al desmarcar un expediente, el mensaje SE REHACE (el backend lo regenera con
//     los que quedan). Si no, el texto seguiría nombrando siete cuando van seis.
//
// El overlay de envío es `SendActionOverlay`, el estándar de la app para todo lo que
// tarda y acaba en éxito o error. Nunca un alert.
// ============================================================================
import React, { useState, useEffect, useMemo, useRef } from 'react';
import axios from 'axios';
import { SendActionOverlay } from '../../../components/SendActionOverlay';

const ROL_TXT = { CERTIFICADOR: 'Certificador', INSTALADOR: 'Instalador', CLIENTE: 'Cliente' };

export function EnvioLoteModal({ grupo, onCerrar, onHecho }) {
    const [cargando, setCargando] = useState(true);
    const [rehaciendo, setRehaciendo] = useState(false);
    const [error, setError] = useState(null);
    const [datos, setDatos] = useState(null);
    const [mensaje, setMensaje] = useState('');
    const [editando, setEditando] = useState(false);
    const [verEntero, setVerEntero] = useState(false);
    const [canales, setCanales] = useState([]);
    const [excluidos, setExcluidos] = useState(() => new Set());
    const [fase, setFase] = useState(null);   // null | 'sending' | 'done'
    const [ok, setOk] = useState(false);
    const [resultado, setResultado] = useState({ items: [], error: '' });

    // Si el usuario ha tocado el texto, no se le pisa nunca: su edición manda sobre
    // cualquier regeneración automática.
    const editadoManual = useRef(false);
    // Todos los expedientes del grupo (los de la respuesta se acotan al pedir).
    const todos = useMemo(() => grupo.expedientes || [], [grupo]);

    const incluidos = useMemo(
        () => todos.filter(e => !excluidos.has(e.expediente_id)),
        [todos, excluidos]);

    // Carga inicial y regeneración al cambiar la selección.
    useEffect(() => {
        let vivo = true;
        const ids = incluidos.map(e => e.expediente_id);
        if (!ids.length) return;
        const primera = !datos;
        (async () => {
            try {
                if (primera) setCargando(true); else setRehaciendo(true);
                const { data } = await axios.get(
                    `/api/seguimiento/lote/${encodeURIComponent(grupo.clave)}`,
                    { params: { ids: ids.join(',') } });
                if (!vivo) return;
                setDatos(data);
                if (!editadoManual.current) setMensaje(data.mensaje);
                if (primera) {
                    // WhatsApp por defecto si hay teléfono: es el canal por el que
                    // realmente contestan. El email queda para quien no lo tiene.
                    setCanales(data.destinatario?.tlf ? ['whatsapp'] : (data.destinatario?.email ? ['email'] : []));
                }
            } catch (e) {
                if (vivo) setError(e.response?.data?.error || e.message);
            } finally {
                if (vivo) { setCargando(false); setRehaciendo(false); }
            }
        })();
        return () => { vivo = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [grupo.clave, excluidos]);

    const toggleExp = (id) => setExcluidos(prev => {
        const s = new Set(prev);
        if (s.has(id)) s.delete(id); else s.add(id);
        return s;
    });

    const toggleCanal = (c) => setCanales(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]);

    const d = datos?.destinatario || grupo.destinatario;
    const puedeEnviar = incluidos.length > 0 && canales.length > 0 && !!mensaje.trim() && !rehaciendo;

    const textoBoton = !incluidos.length ? 'Elige algún expediente'
        : !canales.length ? 'Elige WhatsApp o email'
        : rehaciendo ? 'Actualizando el mensaje…'
        : `Enviar · ${incluidos.length} exp.`;

    const enviar = async () => {
        if (!puedeEnviar) return;
        setFase('sending');
        try {
            const { data } = await axios.post(`/api/seguimiento/lote/${encodeURIComponent(grupo.clave)}/enviar`, {
                canales, mensaje, asunto: datos?.asunto,
                expedientes: incluidos.map(e => e.expediente_id),
            });
            setOk(true);
            setResultado({ items: [data.destinatario, `${data.expedientes} expedientes`, ...(data.canales || [])], error: '' });
        } catch (e) {
            setOk(false);
            setResultado({ items: [], error: e.response?.data?.error || e.message });
        } finally {
            setFase('done');
        }
    };

    const posponer = async () => {
        setFase('sending');
        try {
            const { data } = await axios.post('/api/seguimiento/posponer', {
                tipo: grupo.tipo,
                expedientes: incluidos.map(e => ({ expediente_id: e.expediente_id, scope: e.scope })),
            });
            setOk(true);
            setResultado({ items: [`${data.pospuestos} expedientes`, `No volverán a aparecer en ${data.dias} días`], error: '' });
        } catch (e) {
            setOk(false);
            setResultado({ items: [], error: e.response?.data?.error || e.message });
        } finally {
            setFase('done');
        }
    };

    const cerrarOverlay = () => {
        setFase(null);
        if (ok) onHecho(incluidos.length); else setResultado({ items: [], error: '' });
    };

    return (
        // Nunca se cierra al tocar fuera (regla 10 de la app): dentro puede haber un
        // mensaje a medio redactar, y en un móvil el dedo roza el borde constantemente.
        <div className="fixed inset-0 z-[80] bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-6">
            <div className="w-full sm:max-w-2xl bg-bkg-surface border-t sm:border border-white/10 rounded-t-3xl sm:rounded-3xl shadow-2xl h-[92dvh] sm:h-auto sm:max-h-[88vh] flex flex-col overflow-hidden">

                {/* ── Cabecera fija: a quién le escribes ─────────────────── */}
                <div className="shrink-0 flex items-start gap-3 px-4 pt-4 pb-3 border-b border-white/[0.06]">
                    <div className="flex-1 min-w-0">
                        <h2 className="text-[15px] font-black text-white leading-tight break-words">
                            {d?.nombre || 'Sin nombre'}
                        </h2>
                        <p className="text-[11px] font-bold text-brand mt-0.5">
                            {ROL_TXT[d?.tipo] ? `${ROL_TXT[d.tipo]} · ` : ''}{datos?.etiqueta || grupo.etiqueta}
                        </p>
                    </div>
                    <button onClick={onCerrar} aria-label="Cerrar"
                        className="shrink-0 w-10 h-10 -mt-1 -mr-1 rounded-xl text-white/35 active:bg-white/5 flex items-center justify-center">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                {/* ── Cuerpo: UN solo scroll ─────────────────────────────── */}
                <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 space-y-4">
                    {cargando && (
                        <div className="animate-pulse space-y-3">
                            <div className="h-10 bg-white/5 rounded-xl" />
                            <div className="h-40 bg-white/5 rounded-xl" />
                            <div className="h-28 bg-white/5 rounded-xl" />
                        </div>
                    )}

                    {error && (
                        <div className="rounded-xl border border-red-500/25 bg-red-500/10 p-4">
                            <p className="text-xs font-bold text-red-300 break-words">{error}</p>
                        </div>
                    )}

                    {datos && !cargando && (
                        <>
                            {/* ── Canales, con el dato de contacto a la vista ── */}
                            <div className="flex flex-wrap gap-2">
                                {d?.tlf && (
                                    <Pildora activa={canales.includes('whatsapp')} onClick={() => toggleCanal('whatsapp')}
                                        icono="📱" texto={d.tlf} />
                                )}
                                {d?.email && (
                                    <Pildora activa={canales.includes('email')} onClick={() => toggleCanal('email')}
                                        icono="✉️" texto={d.email} />
                                )}
                                {!d?.tlf && !d?.email && (
                                    <p className="text-xs text-amber-300">No hay teléfono ni email en su ficha.</p>
                                )}
                            </div>

                            {/* ── Expedientes. Sin scroll propio: manda el del modal ── */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-white/35">
                                        Expedientes · {incluidos.length} de {todos.length}
                                    </span>
                                    {excluidos.size > 0 && (
                                        <button onClick={() => setExcluidos(new Set())} className="text-[10px] font-black uppercase tracking-wider text-brand px-2 py-1 -mr-2">
                                            Incluir todos
                                        </button>
                                    )}
                                </div>
                                <div className="space-y-1.5">
                                    {todos.map(e => {
                                        const dentro = !excluidos.has(e.expediente_id);
                                        return (
                                            <label key={e.expediente_id}
                                                className={`flex items-center gap-3 px-3 py-3 rounded-xl border transition-all ${
                                                    dentro ? 'border-white/10 bg-white/[0.03]' : 'border-transparent bg-transparent opacity-35'}`}>
                                                {/* 20px: el mínimo que se acierta con el pulgar. */}
                                                <input type="checkbox" checked={dentro} onChange={() => toggleExp(e.expediente_id)}
                                                    className="w-5 h-5 accent-brand shrink-0" />
                                                <span className="flex-1 min-w-0">
                                                    <span className="block font-black text-brand text-[11px] tabular-nums">{e.numero_expediente}</span>
                                                    <span className="block text-[11px] text-white/45 truncate">{e.cliente_nombre || e.cliente || e.detalle}</span>
                                                </span>
                                                <span className="text-[10px] font-black text-white/30 tabular-nums shrink-0">{e.dias} d</span>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* ── El mensaje, plegado ─────────────────────── */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-white/35">
                                        Mensaje {rehaciendo && <span className="text-brand normal-case tracking-normal font-bold">· actualizando…</span>}
                                    </span>
                                    <div className="flex gap-1">
                                        {!editando && (
                                            <button onClick={() => setVerEntero(v => !v)} className="text-[10px] font-black uppercase tracking-wider text-white/40 px-2 py-1">
                                                {verEntero ? 'Plegar' : 'Ver entero'}
                                            </button>
                                        )}
                                        <button onClick={() => setEditando(v => !v)} className="text-[10px] font-black uppercase tracking-wider text-brand px-2 py-1 -mr-2">
                                            {editando ? '✔ Listo' : '✏️ Editar'}
                                        </button>
                                    </div>
                                </div>
                                {editando ? (
                                    <textarea value={mensaje}
                                        onChange={e => { editadoManual.current = true; setMensaje(e.target.value); }}
                                        rows={14}
                                        className="w-full rounded-xl bg-bkg-deep border border-brand/50 p-3 text-base leading-relaxed text-white/85 focus:outline-none resize-y" />
                                ) : (
                                    <div className={`relative rounded-xl bg-bkg-deep border border-white/[0.06] p-3 text-[13px] leading-relaxed text-white/70 whitespace-pre-wrap break-words ${verEntero ? '' : 'max-h-36 overflow-hidden'}`}>
                                        {mensaje}
                                        {!verEntero && <div className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-bkg-deep to-transparent" />}
                                    </div>
                                )}
                                {editadoManual.current && (
                                    <p className="text-[10px] text-amber-300/70 mt-2">
                                        Texto editado a mano: ya no se actualiza solo al cambiar la selección.
                                    </p>
                                )}
                            </div>
                        </>
                    )}
                </div>

                {/* ── Barra de acción, fija y con área segura del iPhone ── */}
                {datos && (
                    <div className="shrink-0 px-4 pt-3 border-t border-white/[0.06] space-y-2"
                        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}>
                        <button onClick={enviar} disabled={!puedeEnviar}
                            className="w-full py-4 rounded-2xl bg-brand text-bkg-deep font-black text-sm uppercase tracking-wider disabled:opacity-40 transition-opacity active:scale-[0.99]">
                            {textoBoton}
                        </button>
                        <button onClick={posponer} disabled={!incluidos.length}
                            className="w-full py-3 rounded-xl border border-white/10 text-white/45 font-bold text-[11px] uppercase tracking-wider active:bg-white/5 disabled:opacity-30">
                            Ahora no · posponer
                        </button>
                    </div>
                )}
            </div>

            <SendActionOverlay
                phase={fase}
                ok={ok}
                subtitle={`${d?.nombre || ''} · ${incluidos.length} expediente${incluidos.length === 1 ? '' : 's'}`}
                items={resultado.items}
                errorText={resultado.error}
                onClose={cerrarOverlay}
            />
        </div>
    );
}

function Pildora({ activa, onClick, icono, texto }) {
    return (
        <button onClick={onClick}
            className={`inline-flex items-center gap-2 px-3.5 py-2.5 rounded-full border text-[11px] font-bold transition-all ${
                activa ? 'border-brand bg-brand/10 text-brand' : 'border-white/10 text-white/35'}`}>
            <span>{icono}</span>
            <span className="truncate max-w-[180px]">{texto}</span>
        </button>
    );
}
