// ─── Varios INSTALADORES piden la MISMA obra ────────────────────────────────
//
// Chip de la cabecera de la calculadora: «2 INSTALADORES · para ISM». Abre la
// lista en orden (1º, 2º…), con la fecha, el presupuesto de cada uno y las
// versiones de la propuesta que se le han mandado; desde ahí se añade otro y se
// elige PARA QUIÉN se prepara la propuesta: eso pone su presupuesto en la
// calculadora y su marca en la propuesta (co-branding y fila PARTNER del envío).
// El bono CAE no se toca: es el mismo para todos (lo vigila el backend al
// registrar la versión). Solo equipo interno.
//
// Caso de origen: 26RES060_OP360 (25/11/2026). Ver
// docs/conocimiento/oportunidades/varios-instaladores-piden-la-misma-obra.md

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { AISLAR_PORTAL } from '../../components/aislarPortal';

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const eur = (n, dec = 2) => (n == null || n === '' ? '—' : Number(n).toLocaleString('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: 'always' }) + ' €');
const fechaCorta = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' });
};
const A_QUIEN = { CLIENTE: 'cliente', TITULAR: 'titular', PARTNER: 'instalador', INSTALADOR: 'instalador', OTRO: 'otro' };
const leerImporte = (txt) => {
    const t = String(txt || '').trim();
    if (!t) return null;
    const n = parseFloat(t.replace(/\s|€/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : NaN;
};

const IconoGrupo = ({ className = 'w-3 h-3' }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
);

/**
 * @param idOportunidad   nº legible (26RES060_OP360)
 * @param partnerActivo   inputs.partner_propuesta_id (o null = el de la oportunidad)
 * @param presupuestoActual inputs.presupuesto (para avisar si no casa con el del elegido)
 * @param onElegir        ({ prescriptor_id, presupuesto, presupuesto_estimado, nombre, esElPrimero }) => void
 */
export function SolicitudesPartner({ idOportunidad, partnerActivo = null, presupuestoActual = null, onElegir }) {
    const [datos, setDatos] = useState(null);          // respuesta de la ruta
    const [abierto, setAbierto] = useState(false);
    const [pos, setPos] = useState(null);
    const [alta, setAlta] = useState(null);            // { prescriptor_id, presupuesto, presupuesto_ref, recibida_at, buscar }
    const [instaladores, setInstaladores] = useState(null);
    const [editando, setEditando] = useState(null);    // { id, presupuesto, presupuesto_ref }
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState('');
    const triggerRef = useRef(null);
    const fondoDown = useRef(false);

    const cargar = useCallback(() => {
        if (!idOportunidad) return;
        axios.get(`/api/solicitudes-partner/oportunidad/${encodeURIComponent(idOportunidad)}`)
            .then(r => setDatos(r.data || null))
            .catch(() => setDatos(null));
    }, [idOportunidad]);
    useEffect(() => { cargar(); }, [cargar]);

    const lista = useMemo(() => datos?.solicitudes || [], [datos]);
    const primero = datos?.prescriptor_id || lista[0]?.prescriptor_id || null;
    const activoId = String(partnerActivo || primero || '').toLowerCase();
    const activo = lista.find(s => s.prescriptor_id === activoId) || null;
    const varios = lista.length > 1;

    const abrir = (e) => {
        e.stopPropagation();
        const r = triggerRef.current?.getBoundingClientRect();
        if (r) {
            const ancho = 360;
            const left = Math.max(8, Math.min(r.left, window.innerWidth - ancho - 8));
            const abajo = window.innerHeight - r.bottom > 420;
            setPos({ left, top: abajo ? r.bottom + 4 : null, bottom: abajo ? null : window.innerHeight - r.top + 4, ancho });
        }
        setAlta(null); setEditando(null); setError('');
        setAbierto(true);
        cargar();
    };
    const cerrar = () => { setAbierto(false); setAlta(null); setEditando(null); setError(''); };

    useEffect(() => {
        if (!abierto) return undefined;
        const onKey = (e) => { if (e.key === 'Escape') cerrar(); };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [abierto]);

    const empezarAlta = () => {
        setAlta({ prescriptor_id: '', presupuesto: '', presupuesto_ref: '', recibida_at: new Date().toISOString().slice(0, 10), buscar: '' });
        if (!instaladores) {
            axios.get('/api/solicitudes-partner/instaladores')
                .then(r => setInstaladores(r.data || []))
                .catch(() => setError('No se pudo leer la lista de instaladores.'));
        }
    };

    const guardarAlta = async () => {
        if (!alta?.prescriptor_id) { setError('Elige el instalador.'); return; }
        const imp = leerImporte(alta.presupuesto);
        if (Number.isNaN(imp)) { setError('El presupuesto no es un importe válido.'); return; }
        setGuardando(true); setError('');
        try {
            const { data } = await axios.post(`/api/solicitudes-partner/oportunidad/${encodeURIComponent(idOportunidad)}`, {
                prescriptor_id: alta.prescriptor_id,
                presupuesto: imp,
                presupuesto_ref: alta.presupuesto_ref || null,
                recibida_at: alta.recibida_at || null,
            });
            setDatos(data); setAlta(null);
        } catch (err) {
            setError(err?.response?.data?.error || 'No se pudo guardar.');
        } finally { setGuardando(false); }
    };

    const guardarEdicion = async () => {
        const imp = leerImporte(editando.presupuesto);
        if (Number.isNaN(imp)) { setError('El presupuesto no es un importe válido.'); return; }
        setGuardando(true); setError('');
        try {
            const { data } = await axios.patch(`/api/solicitudes-partner/${editando.id}`, {
                presupuesto: imp, presupuesto_estimado: false, presupuesto_ref: editando.presupuesto_ref || null,
            });
            setDatos(data); setEditando(null);
        } catch (err) {
            setError(err?.response?.data?.error || 'No se pudo guardar.');
        } finally { setGuardando(false); }
    };

    const quitar = async (s) => {
        if (!s.id || !window.confirm(`¿Quitar a ${s.nombre} de la lista? Sus propuestas ya enviadas siguen en el historial.`)) return;
        setGuardando(true); setError('');
        try {
            const { data } = await axios.delete(`/api/solicitudes-partner/${s.id}`);
            setDatos(data);
        } catch (err) {
            setError(err?.response?.data?.error || 'No se pudo quitar.');
        } finally { setGuardando(false); }
    };

    const elegir = (s) => {
        onElegir?.({
            prescriptor_id: s.prescriptor_id,
            presupuesto: s.presupuesto,
            presupuesto_estimado: !!s.presupuesto_estimado,
            nombre: s.nombre,
            esElPrimero: s.prescriptor_id === primero,
        });
        cerrar();
    };

    const filtrados = useMemo(() => {
        if (!alta || !instaladores) return [];
        const ya = new Set(lista.map(s => s.prescriptor_id));
        const q = norm(alta.buscar);
        return instaladores
            .filter(p => !ya.has(p.id))
            .filter(p => !q || norm(`${p.nombre} ${p.razon_social || ''}`).includes(q))
            .slice(0, 40);
    }, [alta, instaladores, lista]);

    if (!idOportunidad || !datos) return null;

    // El presupuesto de la calculadora no es el del instalador elegido: se dice.
    const descuadre = varios && activo && activo.presupuesto != null && presupuestoActual != null
        && Math.abs(Number(activo.presupuesto) - Number(presupuestoActual)) > 0.5;

    const trigger = varios ? (
        <button
            type="button"
            ref={triggerRef}
            onClick={abrir}
            title={`Esta obra la han pedido ${lista.length} instaladores. La propuesta se prepara ahora para ${activo?.nombre || '—'}.`}
            className={`inline-flex items-center gap-1.5 max-w-full rounded-full border px-3 py-1 transition-colors ${descuadre ? 'border-amber-400/60 bg-amber-400/15 text-amber-200' : 'border-sky-400/40 bg-sky-400/10 text-sky-300 hover:bg-sky-400/20'}`}
        >
            <IconoGrupo className="w-3 h-3 shrink-0" />
            <span className="text-[10px] font-black uppercase tracking-wide shrink-0">{lista.length} instaladores</span>
            <span className="text-[10px] font-bold uppercase tracking-wide truncate opacity-80">· para {activo?.nombre || '—'}</span>
        </button>
    ) : (
        <button
            type="button"
            ref={triggerRef}
            onClick={abrir}
            title="¿Otro instalador ha pedido esta misma obra? Apúntalo aquí con su presupuesto. Solo lo ve el equipo interno."
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-white/15 text-white/30 hover:text-sky-300 hover:border-sky-400/40 transition-colors px-3 py-1 text-[10px] font-bold uppercase tracking-wide"
        >
            <IconoGrupo className="w-2.5 h-2.5" />
            + Instalador
        </button>
    );

    const popover = abierto && pos && createPortal(
        <div
            {...AISLAR_PORTAL}
            className="fixed inset-0 z-[9990]"
            onMouseDown={(e) => { fondoDown.current = e.target === e.currentTarget; }}
            onMouseUp={(e) => { if (fondoDown.current && e.target === e.currentTarget) cerrar(); fondoDown.current = false; }}
        >
            <div
                className="fixed bg-bkg-surface border border-white/10 rounded-xl shadow-2xl overflow-hidden"
                style={{ left: pos.left, top: pos.top ?? undefined, bottom: pos.bottom ?? undefined, width: pos.ancho }}
            >
                <div className="px-3 pt-2.5 pb-2 border-b border-white/[0.06]">
                    <div className="text-[9px] font-black uppercase tracking-widest text-sky-300/80">Instaladores que piden esta obra</div>
                    <div className="text-[10px] text-white/35 leading-snug mt-0.5">
                        En el orden en que llegaron. El bono CAE es el MISMO para todos: solo cambia el presupuesto.
                    </div>
                </div>

                {!alta ? (
                    <>
                        <div className="max-h-[320px] overflow-y-auto custom-scrollbar p-1.5 space-y-1">
                            {lista.map(s => {
                                const esActivo = s.prescriptor_id === activoId;
                                return (
                                    <div key={s.prescriptor_id} className={`rounded-lg px-2.5 py-2 border ${esActivo ? 'border-sky-400/40 bg-sky-400/[0.07]' : 'border-white/[0.05] bg-white/[0.02]'}`}>
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="flex items-center gap-1.5 min-w-0">
                                                <span className="text-[10px] font-black text-sky-300/80 shrink-0">{s.orden}º</span>
                                                <span className={`text-[11px] font-bold uppercase truncate ${esActivo ? 'text-sky-200' : 'text-white/80'}`}>{s.nombre}</span>
                                            </span>
                                            <span className="text-[9px] text-white/35 shrink-0">{fechaCorta(s.recibida_at)}</span>
                                        </div>

                                        {editando?.id && editando.id === s.id ? (
                                            <div className="flex gap-1.5 mt-1.5">
                                                <input autoFocus type="text" inputMode="decimal" placeholder="Presupuesto con IVA" value={editando.presupuesto}
                                                    onChange={e => setEditando(x => ({ ...x, presupuesto: e.target.value }))}
                                                    onKeyDown={e => { if (e.key === 'Enter') guardarEdicion(); }}
                                                    className="flex-1 min-w-0 bg-black/40 border border-white/[0.08] rounded-md px-2 py-1 text-[11px] text-white focus:outline-none focus:border-sky-400/40" />
                                                <input type="text" placeholder="Nº presupuesto" value={editando.presupuesto_ref}
                                                    onChange={e => setEditando(x => ({ ...x, presupuesto_ref: e.target.value }))}
                                                    className="w-[96px] bg-black/40 border border-white/[0.08] rounded-md px-2 py-1 text-[11px] text-white focus:outline-none focus:border-sky-400/40" />
                                                <button type="button" disabled={guardando} onClick={guardarEdicion}
                                                    className="px-2 rounded-md bg-sky-400/20 border border-sky-400/40 text-sky-200 text-[9px] font-black uppercase disabled:opacity-50">OK</button>
                                            </div>
                                        ) : (
                                            <div className="flex items-center justify-between gap-2 mt-0.5">
                                                <span className="text-[10px] text-white/55">
                                                    Presupuesto <b className="text-white/80">{eur(s.presupuesto)}</b>
                                                    {s.presupuesto_estimado && <span className="text-amber-300/80"> (estimado)</span>}
                                                    {s.presupuesto_ref && <span className="text-white/30"> · {s.presupuesto_ref}</span>}
                                                </span>
                                                {s.id && (
                                                    <button type="button" onClick={() => setEditando({ id: s.id, presupuesto: s.presupuesto == null ? '' : String(s.presupuesto).replace('.', ','), presupuesto_ref: s.presupuesto_ref || '' })}
                                                        className="text-[9px] font-bold uppercase text-white/30 hover:text-sky-300 shrink-0">Editar</button>
                                                )}
                                            </div>
                                        )}

                                        <div className="text-[9px] text-white/40 mt-1 leading-snug">
                                            {s.versiones.length ? s.versiones.map(v => (
                                                <span key={v.v} className="inline-block mr-2" title={v.fecha ? new Date(v.fecha).toLocaleString('es-ES') : ''}>
                                                    v{v.v} · {fechaCorta(v.fecha)} · {v.enlace ? 'por enlace' : `al ${(v.a.map(m => A_QUIEN[m] || m.toLowerCase()).join(' + ')) || '—'}`}
                                                    {v.caeBonus != null && <> · bono {eur(v.caeBonus, 0)}</>}
                                                    {v.aceptada && <b className="text-emerald-300"> · ACEPTADA</b>}
                                                </span>
                                            )) : <span className="italic">Sin propuesta enviada todavía.</span>}
                                        </div>

                                        <div className="flex gap-1.5 mt-1.5">
                                            {esActivo && descuadre ? (
                                                <button type="button" onClick={() => elegir(s)}
                                                    className="flex-1 py-1 rounded-md bg-amber-400/15 border border-amber-400/40 text-amber-200 text-[9px] font-black uppercase tracking-widest hover:bg-amber-400/25">
                                                    Aplicar su presupuesto a la calculadora
                                                </button>
                                            ) : esActivo ? (
                                                <span className="flex-1 text-center py-1 rounded-md text-[9px] font-black uppercase tracking-widest text-sky-300/80 border border-sky-400/20">
                                                    La propuesta se prepara para este
                                                </span>
                                            ) : (
                                                <button type="button" onClick={() => elegir(s)}
                                                    className="flex-1 py-1 rounded-md bg-sky-400/15 border border-sky-400/40 text-sky-200 text-[9px] font-black uppercase tracking-widest hover:bg-sky-400/25">
                                                    Preparar la propuesta para este
                                                </button>
                                            )}
                                            {s.id && s.orden > 1 && (
                                                <button type="button" disabled={guardando} onClick={() => quitar(s)}
                                                    className="px-2 rounded-md border border-white/10 text-white/35 hover:text-amber-300 text-[9px] font-black uppercase">Quitar</button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="p-2 border-t border-white/[0.05]">
                            <button type="button" onClick={empezarAlta}
                                className="w-full px-2 py-1.5 rounded-lg border border-dashed border-sky-400/30 text-sky-300/80 hover:bg-sky-400/10 text-[10px] font-black uppercase tracking-widest">
                                + Otro instalador pide esta obra
                            </button>
                        </div>
                    </>
                ) : (
                    <div className="p-2.5 space-y-2">
                        <div>
                            <label className="block text-[9px] font-black uppercase tracking-widest text-white/35 mb-0.5">Instalador *</label>
                            <input autoFocus type="text" placeholder="Buscar…" value={alta.buscar}
                                onChange={e => setAlta(a => ({ ...a, buscar: e.target.value }))}
                                className="w-full bg-black/40 border border-white/[0.08] rounded-md px-2 py-1.5 text-[11px] text-white focus:outline-none focus:border-sky-400/40" />
                            <div className="max-h-[150px] overflow-y-auto custom-scrollbar mt-1 space-y-0.5">
                                {!instaladores && <div className="px-2 py-1 text-[10px] text-white/30">Cargando…</div>}
                                {filtrados.map(p => (
                                    <button key={p.id} type="button" onClick={() => setAlta(a => ({ ...a, prescriptor_id: p.id }))}
                                        className={`w-full text-left px-2 py-1 rounded-md text-[10px] uppercase ${alta.prescriptor_id === p.id ? 'bg-sky-400/15 text-sky-200 font-bold' : 'text-white/65 hover:bg-white/[0.05]'}`}>
                                        {p.nombre}{p.razon_social && p.razon_social !== p.nombre ? <span className="text-white/30"> · {p.razon_social}</span> : null}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="flex gap-1.5">
                            <div className="flex-1">
                                <label className="block text-[9px] font-black uppercase tracking-widest text-white/35 mb-0.5">Presupuesto con IVA</label>
                                <input type="text" inputMode="decimal" placeholder="11.868,70" value={alta.presupuesto}
                                    onChange={e => setAlta(a => ({ ...a, presupuesto: e.target.value }))}
                                    className="w-full bg-black/40 border border-white/[0.08] rounded-md px-2 py-1.5 text-[11px] text-white focus:outline-none focus:border-sky-400/40" />
                            </div>
                            <div className="w-[110px]">
                                <label className="block text-[9px] font-black uppercase tracking-widest text-white/35 mb-0.5">Su nº</label>
                                <input type="text" placeholder="26-000305" value={alta.presupuesto_ref}
                                    onChange={e => setAlta(a => ({ ...a, presupuesto_ref: e.target.value }))}
                                    className="w-full bg-black/40 border border-white/[0.08] rounded-md px-2 py-1.5 text-[11px] text-white focus:outline-none focus:border-sky-400/40" />
                            </div>
                        </div>
                        <div>
                            <label className="block text-[9px] font-black uppercase tracking-widest text-white/35 mb-0.5">Nos llegó el</label>
                            <input type="date" value={alta.recibida_at}
                                onChange={e => setAlta(a => ({ ...a, recibida_at: e.target.value }))}
                                className="w-full bg-bkg-deep border border-white/[0.08] rounded-md px-2 py-1.5 text-[11px] text-white focus:outline-none [color-scheme:dark]" />
                        </div>
                        <div className="flex gap-1.5 pt-1">
                            <button type="button" onClick={() => setAlta(null)} className="flex-1 py-1.5 rounded-lg border border-white/10 text-white/50 text-[10px] font-black uppercase tracking-widest hover:text-white">Volver</button>
                            <button type="button" disabled={guardando} onClick={guardarAlta} className="flex-1 py-1.5 rounded-lg bg-sky-400/20 border border-sky-400/40 text-sky-200 text-[10px] font-black uppercase tracking-widest hover:bg-sky-400/30 disabled:opacity-50">
                                {guardando ? 'Guardando…' : 'Añadir'}
                            </button>
                        </div>
                    </div>
                )}
                {descuadre && !alta && (
                    <div className="px-3 py-2 text-[10px] text-amber-200 bg-amber-500/10 border-t border-amber-500/20">
                        La calculadora tiene {eur(presupuestoActual)} y el presupuesto de {activo.nombre} es {eur(activo.presupuesto)}. Vuelve a elegirlo para aplicarlo.
                    </div>
                )}
                {error && <div className="px-3 py-2 text-[10px] text-amber-300 bg-amber-500/10 border-t border-amber-500/20">{error}</div>}
            </div>
        </div>,
        document.body
    );

    return (
        <span className="inline-flex max-w-full" onClick={e => e.stopPropagation()}>
            {trigger}
            {popover}
        </span>
    );
}

export default SolicitudesPartner;
