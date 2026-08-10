// ============================================================================
// EnvioLoteModal.jsx — un mensaje, varios expedientes.
//
// Es la pantalla donde se despacha un grupo del parte. Repite a propósito las mismas
// decisiones que la página pública de acción (routes/acciones.js), porque el problema
// es el mismo: el mensaje se lee, se retoca y sale a un TERCERO sin vuelta atrás.
//
//   · El mensaje viene PLEGADO. Casi nunca se edita; enseñarlo entero solo aleja el
//     botón de enviar.
//   · Los expedientes se pueden DESMARCAR uno a uno — si de los siete de un
//     certificador hay uno que no toca reclamar, se quita y el mensaje se rehace sin
//     él en el momento.
//   · El botón dice a quién y por dónde. Es la única acción irreversible.
//
// El overlay de envío es `SendActionOverlay`, el estándar de la app para todo lo que
// tarda y acaba en éxito o error. Nunca un alert.
// ============================================================================
import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { SendActionOverlay } from '../../../components/SendActionOverlay';

const ROL_TXT = { CERTIFICADOR: 'Certificador', INSTALADOR: 'Instalador', CLIENTE: 'Cliente' };

export function EnvioLoteModal({ grupo, onCerrar, onHecho }) {
    const [cargando, setCargando] = useState(true);
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

    useEffect(() => {
        let vivo = true;
        (async () => {
            try {
                const { data } = await axios.get(`/api/seguimiento/lote/${encodeURIComponent(grupo.clave)}`);
                if (!vivo) return;
                setDatos(data);
                setMensaje(data.mensaje);
                // WhatsApp por defecto si hay teléfono: es el canal por el que
                // realmente contestan. El email queda para quien no lo tiene.
                setCanales(data.destinatario?.tlf ? ['whatsapp'] : (data.destinatario?.email ? ['email'] : []));
            } catch (e) {
                if (vivo) setError(e.response?.data?.error || e.message);
            } finally {
                if (vivo) setCargando(false);
            }
        })();
        return () => { vivo = false; };
    }, [grupo.clave]);

    const incluidos = useMemo(
        () => (datos?.expedientes || []).filter(e => !excluidos.has(e.expediente_id)),
        [datos, excluidos]);

    const toggleExp = (id) => setExcluidos(prev => {
        const s = new Set(prev);
        if (s.has(id)) s.delete(id); else s.add(id);
        return s;
    });

    const toggleCanal = (c) => setCanales(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]);

    const puedeEnviar = incluidos.length > 0 && canales.length > 0 && !!mensaje.trim();

    const textoBoton = !incluidos.length ? 'Elige algún expediente'
        : !canales.length ? 'Elige WhatsApp o email'
        : `Enviar a ${ROL_TXT[datos?.destinatario?.tipo] || 'destinatario'} · ${incluidos.length} exp.`;

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
        if (ok) onHecho(); else setResultado({ items: [], error: '' });
    };

    const d = datos?.destinatario;

    return (
        // Nunca se cierra al clicar fuera (regla 10 de la app): dentro hay un mensaje
        // que puedes haber estado redactando.
        <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-6">
            <div className="w-full sm:max-w-2xl bg-bkg-surface border border-white/10 rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] flex flex-col">

                {/* ── Cabecera ──────────────────────────────────────────── */}
                <div className="flex items-start gap-3 p-5 border-b border-white/[0.06]">
                    <div className="flex-1 min-w-0">
                        <h2 className="text-base font-black text-white truncate">{d?.nombre || grupo.destinatario?.nombre}</h2>
                        <p className="text-[11px] font-bold text-brand mt-0.5">{datos?.etiqueta || grupo.etiqueta}</p>
                    </div>
                    <button onClick={onCerrar} className="shrink-0 w-8 h-8 rounded-lg text-white/30 hover:text-white hover:bg-white/5 flex items-center justify-center transition-colors">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    {cargando && <div className="animate-pulse space-y-3"><div className="h-10 bg-white/5 rounded-xl" /><div className="h-28 bg-white/5 rounded-xl" /></div>}

                    {error && (
                        <div className="rounded-xl border border-red-500/25 bg-red-500/10 p-4">
                            <p className="text-xs font-bold text-red-300">{error}</p>
                        </div>
                    )}

                    {datos && (
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

                            {/* ── Expedientes incluidos ───────────────────── */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-white/35">
                                        Expedientes · {incluidos.length} de {datos.expedientes.length}
                                    </span>
                                    {excluidos.size > 0 && (
                                        <button onClick={() => setExcluidos(new Set())} className="text-[10px] font-black uppercase tracking-wider text-brand">
                                            Incluir todos
                                        </button>
                                    )}
                                </div>
                                <div className="space-y-1 max-h-52 overflow-y-auto pr-1">
                                    {datos.expedientes.map(e => {
                                        const dentro = !excluidos.has(e.expediente_id);
                                        return (
                                            <label key={e.expediente_id}
                                                className={`flex items-center gap-3 px-3 py-2 rounded-xl border cursor-pointer transition-all ${
                                                    dentro ? 'border-white/10 bg-white/[0.03]' : 'border-transparent bg-transparent opacity-40'}`}>
                                                <input type="checkbox" checked={dentro} onChange={() => toggleExp(e.expediente_id)}
                                                    className="w-4 h-4 accent-brand shrink-0" />
                                                <span className="font-black text-brand text-[11px] tabular-nums shrink-0 w-[104px]">{e.numero_expediente}</span>
                                                <span className="flex-1 min-w-0 text-[11px] text-white/50 truncate">{e.cliente || e.detalle}</span>
                                                <span className="text-[10px] font-black text-white/30 tabular-nums shrink-0">{e.dias} d</span>
                                            </label>
                                        );
                                    })}
                                </div>
                                {excluidos.size > 0 && (
                                    <p className="text-[10px] text-amber-300/70 mt-2">
                                        Los excluidos seguirán apareciendo en el parte: no se les avisa ni se posponen.
                                    </p>
                                )}
                            </div>

                            {/* ── El mensaje, plegado ─────────────────────── */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-white/35">Mensaje</span>
                                    <div className="flex gap-3">
                                        {!editando && (
                                            <button onClick={() => setVerEntero(v => !v)} className="text-[10px] font-black uppercase tracking-wider text-white/40 hover:text-white">
                                                {verEntero ? 'Plegar' : 'Ver entero'}
                                            </button>
                                        )}
                                        <button onClick={() => setEditando(v => !v)} className="text-[10px] font-black uppercase tracking-wider text-brand">
                                            {editando ? '✔ Listo' : '✏️ Editar'}
                                        </button>
                                    </div>
                                </div>
                                {editando ? (
                                    <textarea value={mensaje} onChange={e => setMensaje(e.target.value)} rows={14}
                                        className="w-full rounded-xl bg-bkg-deep border border-brand/50 p-3 text-[13px] leading-relaxed text-white/85 font-mono focus:outline-none resize-y" />
                                ) : (
                                    <div className={`relative rounded-xl bg-bkg-deep border border-white/[0.06] p-3 text-[13px] leading-relaxed text-white/70 whitespace-pre-wrap break-words ${verEntero ? '' : 'max-h-32 overflow-hidden'}`}>
                                        {mensaje}
                                        {!verEntero && <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-bkg-deep to-transparent" />}
                                    </div>
                                )}
                                {excluidos.size > 0 && !editando && (
                                    <p className="text-[10px] text-white/30 mt-2">
                                        El texto todavía nombra los {datos.expedientes.length} expedientes. Edítalo si quitas alguno.
                                    </p>
                                )}
                            </div>
                        </>
                    )}
                </div>

                {/* ── Barra de acción ───────────────────────────────────── */}
                {datos && (
                    <div className="p-4 border-t border-white/[0.06] space-y-2">
                        <button onClick={enviar} disabled={!puedeEnviar}
                            className="w-full py-3.5 rounded-xl bg-brand text-bkg-deep font-black text-sm uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed transition-opacity">
                            {textoBoton}
                        </button>
                        <button onClick={posponer} disabled={!incluidos.length}
                            className="w-full py-2.5 rounded-xl border border-white/10 text-white/45 hover:text-white/80 font-bold text-[11px] uppercase tracking-wider transition-colors disabled:opacity-30">
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
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-full border text-[11px] font-bold transition-all ${
                activa ? 'border-brand bg-brand/10 text-brand' : 'border-white/10 text-white/35 hover:text-white/60'}`}>
            <span>{icono}</span>
            <span className="truncate max-w-[190px]">{texto}</span>
        </button>
    );
}
