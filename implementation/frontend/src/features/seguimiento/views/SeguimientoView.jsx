// ============================================================================
// SeguimientoView.jsx — la cola de trabajo diaria del equipo.
//
// POR QUÉ NO VA DENTRO DEL CUADRO DE MANDO, aunque fuera lo primero que se pensó:
//   · El cuadro de mando responde "cómo va el negocio" (GWh, margen, embudo). Esto
//     responde "qué hago yo ahora". Son dos modos mentales y dos frecuencias: el
//     primero se mira una vez por semana, éste cada mañana.
//   · El cuadro de mando es ADMIN-only porque agrega importes y margen. El parte NO
//     lleva ni un euro, así que el TRABAJADOR lo ve igual — y es justo quien más lo
//     necesita, porque es su lista de tareas.
//   · Ya carga expedientes + oportunidades + partners + lotes. Colgarle esto encima
//     habría empeorado la pantalla más pesada de la app.
//
// DOS LECTURAS de los mismos datos, y el orden importa:
//   · DESPACHAR (por destinatario) — por defecto. Agrupa por persona a la que hay que
//     escribir: un certificador con 7 expedientes es UNA tarjeta y UN mensaje.
//   · REVISAR (por bloque) — el diagnóstico: qué tipo de atasco hay y cuánto.
// Se entra a trabajar, no a mirar; por eso manda la primera.
// ============================================================================
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { useModal } from '../../../context/ModalContext';
import { EnvioLoteModal } from '../components/EnvioLoteModal';

// Tono por bloque. El color es información: dice cuánto duele, no adorna.
const TONO = {
    RECHAZO_SIN_REENVIAR: { txt: 'text-rose-400', bg: 'bg-rose-500/10', bd: 'border-rose-500/25', dot: 'bg-rose-500' },
    REVISION: { txt: 'text-red-400', bg: 'bg-red-500/10', bd: 'border-red-500/25', dot: 'bg-red-500' },
    OBRA_SIN_CERRAR: { txt: 'text-amber-500', bg: 'bg-amber-600/10', bd: 'border-amber-600/25', dot: 'bg-amber-600' },
    REGISTRO: { txt: 'text-orange-400', bg: 'bg-orange-500/10', bd: 'border-orange-500/25', dot: 'bg-orange-500' },
    CERT_SIN_ENTREGAR: { txt: 'text-fuchsia-400', bg: 'bg-fuchsia-500/10', bd: 'border-fuchsia-500/25', dot: 'bg-fuchsia-500' },
    SIN_ENCARGAR: { txt: 'text-slate-300', bg: 'bg-slate-500/10', bd: 'border-slate-500/25', dot: 'bg-slate-400' },
    MIGRADO_SIN_REVISAR: { txt: 'text-violet-400', bg: 'bg-violet-500/10', bd: 'border-violet-500/25', dot: 'bg-violet-500' },
    FIRMA_PENDIENTE: { txt: 'text-yellow-400', bg: 'bg-yellow-500/10', bd: 'border-yellow-500/25', dot: 'bg-yellow-500' },
    FIN_OBRA: { txt: 'text-sky-400', bg: 'bg-sky-500/10', bd: 'border-sky-500/25', dot: 'bg-sky-500' },
};
const tono = (b) => TONO[b] || TONO.SIN_ENCARGAR;

// La antigüedad se lee de un vistazo por el color, sin comparar números.
const colorDias = (d, sinFecha) =>
    sinFecha ? 'text-white/30' : d > 60 ? 'text-red-400' : d > 30 ? 'text-orange-400' : d > 14 ? 'text-amber-400' : 'text-white/50';

const ROL_ICONO = { CERTIFICADOR: '📐', INSTALADOR: '🔧', CLIENTE: '🏠' };

export function SeguimientoView() {
    const { showAlert } = useModal();
    const [datos, setDatos] = useState(null);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState(null);
    const [modo, setModo] = useState('despachar');
    const [grupoAbierto, setGrupoAbierto] = useState(null);
    const [bloquesAbiertos, setBloquesAbiertos] = useState(() => new Set());
    const [filtro, setFiltro] = useState('');

    const cargar = useCallback(async () => {
        try {
            setCargando(true);
            setError(null);
            const { data } = await axios.get('/api/seguimiento/parte');
            setDatos(data);
        } catch (e) {
            setError(e.response?.data?.error || e.message);
        } finally {
            setCargando(false);
        }
    }, []);

    useEffect(() => { cargar(); }, [cargar]);

    const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const grupos = useMemo(() => {
        const g = datos?.por_destinatario || [];
        if (!filtro.trim()) return g;
        const q = norm(filtro);
        // Busca por destinatario Y por nº de expediente: unas veces se llega por
        // "¿qué le debo a Lanuza?" y otras por "¿qué pasa con el 26RES060_104?".
        return g.filter(x => norm(x.destinatario?.nombre).includes(q)
            || x.expedientes.some(e => norm(e.numero_expediente).includes(q) || norm(e.cliente_nombre).includes(q)));
    }, [datos, filtro]);

    const toggleBloque = (b) => setBloquesAbiertos(prev => {
        const s = new Set(prev);
        if (s.has(b)) s.delete(b); else s.add(b);
        return s;
    });

    const mandarParte = async () => {
        try {
            const { data } = await axios.post('/api/seguimiento/enviar-parte');
            showAlert(data.ok && data.enviados
                ? { tipo: 'success', titulo: 'Parte enviado', mensaje: `Te lo hemos mandado por WhatsApp y email (${data.total} expedientes).` }
                : { tipo: 'info', titulo: 'Sin novedades', mensaje: data.reason === 'deshabilitado' ? 'Los avisos están deshabilitados en este entorno.' : 'No hay nada por encima del umbral.' });
        } catch (e) {
            showAlert({ tipo: 'error', titulo: 'No se ha podido enviar', mensaje: e.response?.data?.error || e.message });
        }
    };

    if (cargando) {
        return (
            <div className="p-4 sm:p-6 max-w-[1400px] mx-auto">
                <div className="animate-pulse space-y-3">
                    <div className="h-8 w-64 bg-white/5 rounded-lg" />
                    <div className="h-24 bg-white/5 rounded-2xl" />
                    {[...Array(5)].map((_, i) => <div key={i} className="h-20 bg-white/5 rounded-2xl" />)}
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-6 max-w-[1400px] mx-auto">
                <div className="rounded-2xl border border-red-500/25 bg-red-500/10 p-6 text-center">
                    <p className="text-sm font-bold text-red-300">No se ha podido cargar el parte</p>
                    <p className="text-xs text-white/40 mt-1">{error}</p>
                    <button onClick={cargar} className="mt-4 px-4 py-2 rounded-xl bg-brand text-bkg-deep text-xs font-black uppercase tracking-wider">Reintentar</button>
                </div>
            </div>
        );
    }

    const totalAcc = datos?.accionables || 0;
    const nGrupos = datos?.grupos_envio || 0;

    return (
        <div className="p-4 sm:p-6 max-w-[1400px] mx-auto space-y-5">
            {/* ── Cabecera ─────────────────────────────────────────────── */}
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">Seguimiento</h1>
                    <p className="text-xs text-white/40 mt-1">
                        Todo lo que lleva parado más de la cuenta, y a quién hay que escribir.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={cargar} title="Volver a escanear la cartera"
                        className="px-3 py-2 rounded-xl border border-white/10 text-white/50 hover:text-white hover:border-white/25 text-[11px] font-black uppercase tracking-wider transition-colors">
                        Actualizar
                    </button>
                    <button onClick={mandarParte} title="Mándate el parte por WhatsApp y email ahora mismo"
                        className="px-3 py-2 rounded-xl border border-white/10 text-white/50 hover:text-white hover:border-white/25 text-[11px] font-black uppercase tracking-wider transition-colors">
                        Enviármelo
                    </button>
                </div>
            </div>

            {/* ── Titular ──────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Cifra valor={datos?.total || 0} label="Expedientes parados" tono="text-white" />
                <Cifra valor={totalAcc} label="Se resuelven escribiendo" tono="text-brand" />
                <Cifra valor={nGrupos} label="Mensajes que hacen falta" tono="text-emerald-400"
                    pie={totalAcc > nGrupos ? `${totalAcc - nGrupos} menos que uno a uno` : null} />
                <Cifra valor={(datos?.total || 0) - totalAcc} label="Los resuelves tú" tono="text-amber-400"
                    pie="No hay a quién escribir" />
            </div>

            {/* ── Selector de modo ─────────────────────────────────────── */}
            <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-xl border border-white/10 p-1 bg-bkg-surface/40">
                    {[['despachar', 'Despachar', nGrupos], ['revisar', 'Revisar todo', datos?.total || 0]].map(([id, txt, n]) => (
                        <button key={id} onClick={() => setModo(id)}
                            className={`px-4 py-2 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all ${
                                modo === id ? 'bg-brand text-bkg-deep shadow-lg shadow-brand/20' : 'text-white/40 hover:text-white/70'}`}>
                            {txt} <span className="opacity-60">({n})</span>
                        </button>
                    ))}
                </div>
                {modo === 'despachar' && (
                    <input value={filtro} onChange={e => setFiltro(e.target.value)}
                        placeholder="Filtrar por destinatario, cliente o nº de expediente…"
                        className="flex-1 min-w-[220px] px-3.5 py-2.5 rounded-xl bg-bkg-surface/60 border border-white/10 text-sm text-white placeholder:text-white/25 focus:border-brand/50 focus:outline-none" />
                )}
            </div>

            {/* ── Contenido ────────────────────────────────────────────── */}
            {modo === 'despachar' ? (
                grupos.length === 0 ? (
                    <Vacio
                        titulo={filtro ? 'Nada con ese filtro' : 'No hay nada que reclamar'}
                        texto={filtro ? 'Prueba con otro nombre o número.' : 'Todo lo pendiente está o en tu tejado o ya reclamado.'} />
                ) : (
                    <div className="space-y-2.5">
                        {grupos.map(g => <TarjetaGrupo key={g.clave} g={g} onAbrir={() => setGrupoAbierto(g)} />)}
                    </div>
                )
            ) : (
                <div className="space-y-2.5">
                    {(datos?.por_bloque || []).map(b => (
                        <BloqueDiagnostico key={b.bloque} b={b}
                            abierto={bloquesAbiertos.has(b.bloque)} onToggle={() => toggleBloque(b.bloque)} />
                    ))}
                </div>
            )}

            {grupoAbierto && (
                <EnvioLoteModal
                    grupo={grupoAbierto}
                    onCerrar={() => setGrupoAbierto(null)}
                    onHecho={() => { setGrupoAbierto(null); cargar(); }}
                />
            )}
        </div>
    );
}

// ─── Piezas ──────────────────────────────────────────────────────────────────

function Cifra({ valor, label, tono, pie }) {
    return (
        <div className="rounded-2xl border border-white/[0.06] bg-bkg-surface/60 p-4">
            <div className={`text-3xl font-black tabular-nums leading-none ${tono}`}>{valor}</div>
            <div className="text-[9px] uppercase tracking-widest font-black text-white/35 mt-2 leading-tight">{label}</div>
            {pie && <div className="text-[9px] font-bold text-white/20 mt-1">{pie}</div>}
        </div>
    );
}

function Vacio({ titulo, texto }) {
    return (
        <div className="rounded-2xl border border-white/[0.06] bg-bkg-surface/60 py-14 text-center">
            <div className="w-11 h-11 mx-auto mb-3 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
            </div>
            <p className="text-[11px] font-black uppercase tracking-widest text-emerald-400/70">{titulo}</p>
            <p className="text-[11px] font-bold text-white/25 mt-1.5">{texto}</p>
        </div>
    );
}

/** Una persona a la que escribir, con todo lo que se le debe reclamar de una vez. */
function TarjetaGrupo({ g, onAbrir }) {
    const t = tono(g.bloque);
    const n = g.total;
    return (
        <button onClick={onAbrir}
            className={`w-full text-left rounded-2xl border ${t.bd} bg-bkg-surface/60 hover:bg-bkg-hover/40 p-4 transition-all group`}>
            <div className="flex items-start gap-3.5">
                <span className={`w-10 h-10 shrink-0 rounded-xl ${t.bg} flex items-center justify-center text-lg`}>
                    {ROL_ICONO[g.destinatario?.tipo] || '👤'}
                </span>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-black text-white text-sm truncate">{g.destinatario?.nombre || 'Sin nombre'}</span>
                        {/* El contador es la razón de ser de esta pantalla: dice cuántos
                            mensajes te ahorras. Por eso va destacado y no de adorno. */}
                        <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black ${t.bg} ${t.txt} tabular-nums`}>
                            {n} {n === 1 ? 'expediente' : 'expedientes'}
                        </span>
                        <span className={`text-[10px] font-black tabular-nums ${colorDias(g.dias)}`}>· {g.dias} d</span>
                    </div>
                    <div className={`text-[11px] font-bold ${t.txt} mt-0.5`}>{g.etiqueta}</div>
                    <div className="flex flex-wrap gap-1 mt-2">
                        {g.expedientes.slice(0, 8).map(e => (
                            <span key={e.expediente_id} className="px-1.5 py-0.5 rounded-md bg-white/[0.04] text-[10px] font-bold text-white/45 tabular-nums">
                                {e.numero_expediente}
                            </span>
                        ))}
                        {n > 8 && <span className="px-1.5 py-0.5 text-[10px] font-bold text-white/25">+{n - 8}</span>}
                    </div>
                </div>
                <span className="shrink-0 px-3 py-2 rounded-xl bg-brand/10 text-brand text-[10px] font-black uppercase tracking-wider group-hover:bg-brand group-hover:text-bkg-deep transition-all whitespace-nowrap">
                    {n === 1 ? 'Escribir' : `1 mensaje`}
                </span>
            </div>
        </button>
    );
}

/** Un tipo de atasco, con todas sus filas. Vista de diagnóstico. */
function BloqueDiagnostico({ b, abierto, onToggle }) {
    const t = tono(b.bloque);
    return (
        <div className="rounded-2xl border border-white/[0.06] bg-bkg-surface/60 overflow-hidden">
            <button onClick={onToggle} className="w-full flex items-center gap-3 p-4 hover:bg-bkg-hover/30 transition-colors text-left">
                <span className={`w-2.5 h-2.5 rounded-full ${t.dot} shrink-0`} />
                <span className="font-black text-white text-sm flex-1">{b.titulo}</span>
                <span className={`px-2.5 py-1 rounded-lg text-[11px] font-black ${t.bg} ${t.txt} tabular-nums`}>{b.total}</span>
                <svg className={`w-4 h-4 text-white/30 transition-transform ${abierto ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
                </svg>
            </button>
            {abierto && (
                <div className="border-t border-white/[0.06]">
                    {b.nota && <p className="px-4 pt-3 text-[11px] text-white/35 leading-relaxed">{b.nota}</p>}
                    <div className="p-2 space-y-1">
                        {b.filas.map((f, i) => (
                            <a key={`${f.expediente_id}-${i}`} href={`/?exp=${encodeURIComponent(f.numero_expediente)}`}
                                className="flex items-center gap-3 px-2.5 py-2 rounded-xl hover:bg-bkg-hover/40 transition-colors group">
                                <span className="font-black text-brand text-[11px] tabular-nums w-[110px] shrink-0">{f.numero_expediente}</span>
                                <span className="flex-1 min-w-0">
                                    <span className="block text-[11px] text-white/70 truncate">{f.detalle}</span>
                                    <span className="block text-[10px] text-white/25 truncate">{f.cliente_nombre || f.municipio || '—'}</span>
                                </span>
                                {f.silenciada && (
                                    <span className="px-2 py-0.5 rounded-md bg-white/[0.04] text-[9px] font-bold text-white/35 whitespace-nowrap">{f.silenciada}</span>
                                )}
                                <span className={`text-[11px] font-black tabular-nums shrink-0 ${colorDias(f.dias, f.sin_fecha)}`}>
                                    {f.sin_fecha ? 'sin fecha' : `${f.dias} d`}
                                </span>
                            </a>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
