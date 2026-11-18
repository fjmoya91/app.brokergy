// ─── El COMISIONISTA de una oportunidad: la persona que trajo la obra ────────
//
// Distinto del PARTNER (empresa) del que cuelga: Juanma, ingeniero de LOS SIETE
// HERMANOS, frente a Rufino, comercial de la misma empresa (16/11/2026). Es una
// marca de atribución: no cambia el partner, ni los avisos, ni el bono.
//
// Una sola pieza para los tres sitios donde se elige (fila del listado de
// oportunidades, cabecera del expediente y la calculadora). Solo se pinta al
// EQUIPO INTERNO (quien lo monta lo decide con `isStaff`; el backend lo repite
// con staffOnly); el importe pactado en la obra, solo a ADMIN.
//
// Guarda al momento por `PUT /api/comisionistas/oportunidad/:id`: no depende del
// guardado de la calculadora ni del autoguardado del expediente.
// Ver docs/conocimiento/oportunidades/el-comisionista-de-una-oportunidad.md
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { AISLAR_PORTAL } from '../../components/aislarPortal';
import { useComisionistas, recargarComisionistas } from './useComisionistas';

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const eur = (n) => (n == null || n === '' ? '' : Number(n).toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' €');

const IconoPersona = ({ className = 'w-3 h-3' }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
);

export function ComisionistaSelector({
    idOportunidad,
    value,
    importe,
    onSaved,
    prescriptorId = null,
    prescriptores = [],
    isAdmin = false,
    size = 'sm',
    vacio = '+ Comisionista',
}) {
    const lista = useComisionistas(true);
    const [abierto, setAbierto] = useState(false);
    const [pos, setPos] = useState(null);
    const [buscar, setBuscar] = useState('');
    const [alta, setAlta] = useState(null);        // { nombre, tlf, cargo, prescriptor_id } | null
    const [importeTxt, setImporteTxt] = useState('');
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState('');
    const triggerRef = useRef(null);
    const fondoDown = useRef(false);

    const actual = useMemo(() => lista.find(c => String(c.id) === String(value)) || null, [lista, value]);

    useEffect(() => { setImporteTxt(importe == null ? '' : String(importe).replace('.', ',')); }, [importe, abierto]);

    const abrir = (e) => {
        e.stopPropagation();
        const r = triggerRef.current?.getBoundingClientRect();
        if (r) {
            const ancho = 280;
            const left = Math.max(8, Math.min(r.left, window.innerWidth - ancho - 8));
            const abajo = window.innerHeight - r.bottom > 340;
            setPos({ left, top: abajo ? r.bottom + 4 : null, bottom: abajo ? null : window.innerHeight - r.top + 4, ancho });
        }
        setBuscar(''); setAlta(null); setError('');
        setAbierto(true);
    };
    const cerrar = () => { setAbierto(false); setAlta(null); setError(''); };

    useEffect(() => {
        if (!abierto) return undefined;
        // En CAPTURA: la raíz del portal lleva AISLAR_PORTAL, que corta el
        // keydown antes de que llegue a `window` por burbuja.
        const onKey = (e) => { if (e.key === 'Escape') cerrar(); };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [abierto]);

    const guardar = async (body) => {
        if (!idOportunidad) return false;
        setGuardando(true); setError('');
        try {
            const { data } = await axios.put(`/api/comisionistas/oportunidad/${encodeURIComponent(idOportunidad)}`, body);
            onSaved?.({ comisionista_id: data.comisionista_id || null, comisionista_importe: data.comisionista_importe ?? null });
            recargarComisionistas();   // el nº de obras de cada uno
            return true;
        } catch (err) {
            setError(err?.response?.data?.error || 'No se ha podido guardar.');
            return false;
        } finally {
            setGuardando(false);
        }
    };

    const elegir = async (id) => {
        if (String(id || '') === String(value || '')) { cerrar(); return; }
        if (await guardar({ comisionista_id: id || null })) cerrar();
    };

    const darDeAlta = async () => {
        if (!alta?.nombre?.trim()) { setError('El nombre es obligatorio.'); return; }
        setGuardando(true); setError('');
        try {
            const { data } = await axios.post('/api/comisionistas', {
                nombre: alta.nombre, tlf: alta.tlf, cargo: alta.cargo, prescriptor_id: alta.prescriptor_id || null,
            });
            await recargarComisionistas();
            setGuardando(false);
            if (await guardar({ comisionista_id: data.id })) cerrar();
        } catch (err) {
            setError(err?.response?.data?.error || 'No se ha podido dar de alta.');
            setGuardando(false);
        }
    };

    const guardarImporte = async () => {
        await guardar({ comisionista_importe: importeTxt.trim() === '' ? null : importeTxt.trim() });
    };

    const filtrados = useMemo(() => {
        const q = norm(buscar);
        return lista
            .filter(c => c.activo !== false || String(c.id) === String(value))
            .filter(c => !q || norm(`${c.nombre} ${c.cargo || ''} ${c.tlf || ''}`).includes(q));
    }, [lista, buscar, value]);

    const empresaDe = (id) => {
        const p = prescriptores.find(x => String(x.id_empresa) === String(id));
        return p ? (p.acronimo || p.razon_social) : '';
    };

    const chipSm = size === 'sm';
    const trigger = actual ? (
        <button
            type="button"
            ref={triggerRef}
            onClick={abrir}
            title={`Comisionista: ${actual.nombre}${actual.cargo ? ` · ${actual.cargo}` : ''}${isAdmin && importe != null ? ` · ${eur(importe)} en esta obra` : ''} — la persona que trajo la obra`}
            className={`inline-flex items-center gap-1 max-w-full rounded-full border border-amber-400/40 bg-amber-400/10 text-amber-300 hover:bg-amber-400/20 transition-colors ${chipSm ? 'px-2 py-0.5' : 'px-3 py-1'}`}
        >
            <IconoPersona className={chipSm ? 'w-2.5 h-2.5 shrink-0' : 'w-3 h-3 shrink-0'} />
            <span className={`${chipSm ? 'text-[9px]' : 'text-[10px]'} font-black uppercase tracking-wide truncate`}>{actual.nombre}</span>
            {isAdmin && importe != null && (
                <span className={`${chipSm ? 'text-[9px]' : 'text-[10px]'} font-bold text-amber-200/70 shrink-0`}>· {eur(importe)}</span>
            )}
        </button>
    ) : (
        <button
            type="button"
            ref={triggerRef}
            onClick={abrir}
            title="La persona que trajo esta obra directamente (aparte del partner). Solo lo ve el equipo interno."
            className={`inline-flex items-center gap-1 rounded-full border border-dashed border-white/15 text-white/30 hover:text-amber-300 hover:border-amber-400/40 transition-colors ${chipSm ? 'px-2 py-0.5 text-[9px]' : 'px-3 py-1 text-[10px]'} font-bold uppercase tracking-wide`}
        >
            <IconoPersona className="w-2.5 h-2.5" />
            {value && !actual ? '…' : vacio}
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
                    <div className="text-[9px] font-black uppercase tracking-widest text-amber-300/80">Comisionista de la obra</div>
                    <div className="text-[10px] text-white/35 leading-snug mt-0.5">Quién la trajo, aparte del partner. No cambia avisos ni bono.</div>
                </div>

                {!alta ? (
                    <>
                        <div className="p-2 border-b border-white/[0.05]">
                            <input
                                autoFocus
                                type="text"
                                placeholder="Buscar…"
                                value={buscar}
                                onChange={e => setBuscar(e.target.value)}
                                className="w-full bg-black/40 border border-white/[0.08] rounded-md px-2 py-1.5 text-[11px] text-white focus:outline-none focus:border-amber-400/40"
                            />
                        </div>
                        <div className="max-h-[200px] overflow-y-auto custom-scrollbar p-1">
                            <button
                                type="button"
                                disabled={guardando}
                                onClick={() => elegir(null)}
                                className={`w-full text-left px-2 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-white/[0.05] ${!value ? 'text-amber-300' : 'text-white/45'}`}
                            >
                                Ninguno
                            </button>
                            {filtrados.map(c => (
                                <button
                                    key={c.id}
                                    type="button"
                                    disabled={guardando}
                                    onClick={() => elegir(c.id)}
                                    className={`w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/[0.05] flex items-center justify-between gap-2 ${String(c.id) === String(value) ? 'bg-amber-400/10' : ''}`}
                                >
                                    <span className="flex flex-col min-w-0 leading-tight">
                                        <span className={`text-[11px] font-bold uppercase truncate ${String(c.id) === String(value) ? 'text-amber-300' : 'text-white/80'}`}>{c.nombre}</span>
                                        <span className="text-[9px] text-white/30 uppercase tracking-wide truncate">
                                            {[c.cargo, empresaDe(c.prescriptor_id)].filter(Boolean).join(' · ') || '—'}
                                        </span>
                                    </span>
                                    <span className="text-[9px] text-white/30 shrink-0" title="Obras marcadas como suyas">{c.obras || 0} obra{c.obras === 1 ? '' : 's'}</span>
                                </button>
                            ))}
                            {!filtrados.length && buscar && (
                                <div className="px-2 py-2 text-[10px] text-white/30">Nadie con «{buscar}».</div>
                            )}
                        </div>
                        <div className="p-2 border-t border-white/[0.05]">
                            <button
                                type="button"
                                onClick={() => setAlta({ nombre: buscar.trim(), tlf: '', cargo: '', prescriptor_id: prescriptorId || '' })}
                                className="w-full px-2 py-1.5 rounded-lg border border-dashed border-amber-400/30 text-amber-300/80 hover:bg-amber-400/10 text-[10px] font-black uppercase tracking-widest"
                            >
                                + Dar de alta a otra persona
                            </button>
                        </div>
                        {isAdmin && value && (
                            <div className="p-2.5 border-t border-white/[0.06] bg-black/20">
                                <label className="block text-[9px] font-black uppercase tracking-widest text-white/35 mb-1">Su comisión en esta obra (€ sin IVA)</label>
                                <div className="flex gap-1.5">
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        placeholder="Sin fijar"
                                        value={importeTxt}
                                        onChange={e => setImporteTxt(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') guardarImporte(); }}
                                        className="flex-1 min-w-0 bg-black/40 border border-white/[0.08] rounded-md px-2 py-1.5 text-[11px] text-white focus:outline-none focus:border-amber-400/40"
                                    />
                                    <button
                                        type="button"
                                        disabled={guardando}
                                        onClick={guardarImporte}
                                        className="px-2.5 rounded-md bg-amber-400/20 border border-amber-400/40 text-amber-200 text-[10px] font-black uppercase tracking-wider hover:bg-amber-400/30 disabled:opacity-50"
                                    >
                                        Guardar
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                ) : (
                    <div className="p-2.5 space-y-2">
                        {[
                            ['nombre', 'Nombre *', 'JUANMA'],
                            ['tlf', 'Teléfono', '600000000'],
                            ['cargo', 'Cargo', 'INGENIERO'],
                        ].map(([k, label, ph]) => (
                            <div key={k}>
                                <label className="block text-[9px] font-black uppercase tracking-widest text-white/35 mb-0.5">{label}</label>
                                <input
                                    autoFocus={k === 'nombre'}
                                    type="text"
                                    placeholder={ph}
                                    value={alta[k] || ''}
                                    onChange={e => setAlta(a => ({ ...a, [k]: e.target.value }))}
                                    className="w-full bg-black/40 border border-white/[0.08] rounded-md px-2 py-1.5 text-[11px] text-white focus:outline-none focus:border-amber-400/40"
                                />
                            </div>
                        ))}
                        <div>
                            <label className="block text-[9px] font-black uppercase tracking-widest text-white/35 mb-0.5">Trabaja en</label>
                            <select
                                value={alta.prescriptor_id || ''}
                                onChange={e => setAlta(a => ({ ...a, prescriptor_id: e.target.value }))}
                                className="w-full bg-bkg-deep border border-white/[0.08] rounded-md px-2 py-1.5 text-[11px] text-white focus:outline-none"
                            >
                                <option value="">— Por su cuenta —</option>
                                {prescriptores
                                    .filter(p => !['SUJETO_OBLIGADO', 'VERIFICADOR', 'CERTIFICADOR'].includes(String(p.tipo_empresa || '').toUpperCase()))
                                    .map(p => <option key={p.id_empresa} value={p.id_empresa}>{p.acronimo || p.razon_social}</option>)}
                            </select>
                        </div>
                        <div className="flex gap-1.5 pt-1">
                            <button type="button" onClick={() => setAlta(null)} className="flex-1 py-1.5 rounded-lg border border-white/10 text-white/50 text-[10px] font-black uppercase tracking-widest hover:text-white">Volver</button>
                            <button type="button" disabled={guardando} onClick={darDeAlta} className="flex-1 py-1.5 rounded-lg bg-amber-400/20 border border-amber-400/40 text-amber-200 text-[10px] font-black uppercase tracking-widest hover:bg-amber-400/30 disabled:opacity-50">
                                {guardando ? 'Guardando…' : 'Dar de alta'}
                            </button>
                        </div>
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

// Variante que LEE ella misma el comisionista de la oportunidad (para la
// cabecera del expediente, que no lo trae en su carga).
export function ComisionistaDeOportunidad({ idOportunidad, ...props }) {
    const [estado, setEstado] = useState(null);   // { comisionista_id, comisionista_importe } | null
    useEffect(() => {
        if (!idOportunidad) return undefined;
        let vivo = true;
        axios.get(`/api/comisionistas/oportunidad/${encodeURIComponent(idOportunidad)}`)
            .then(r => { if (vivo) setEstado({ comisionista_id: r.data?.comisionista_id || null, comisionista_importe: r.data?.comisionista_importe ?? null }); })
            .catch(() => { if (vivo) setEstado({ comisionista_id: null, comisionista_importe: null, error: true }); });
        return () => { vivo = false; };
    }, [idOportunidad]);
    if (!idOportunidad || !estado || estado.error) return null;
    return (
        <ComisionistaSelector
            idOportunidad={idOportunidad}
            value={estado.comisionista_id}
            importe={estado.comisionista_importe}
            onSaved={setEstado}
            {...props}
        />
    );
}
