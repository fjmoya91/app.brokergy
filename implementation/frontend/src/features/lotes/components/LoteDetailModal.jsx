import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { useModal } from '../../../context/ModalContext';
import { LOTE_ESTADOS, loteEstadoBadge } from '../loteConstants';
import { computeExpedienteFinancials } from '../../expedientes/logic/expedienteFinancials';
import { AnexoListadoModal } from './AnexoListadoModal';
import { SolicitudVerificacionModal } from './SolicitudVerificacionModal';

const presName = (p) => p ? (p.acronimo || p.razon_social || '—') : null;
const eur = (n) => (Number(n) || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const mwh = (n) => `${((Number(n) || 0) / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} MWh`;

// Tarjeta de expediente compartida (idéntica en la lista del lote y en el picker):
// nº + estado, nombre del cliente, dirección y los 3 importes. `rightAction` = botón
// (× quitar / + añadir). Si `onClick`, el bloque de texto navega al expediente.
function ExpedienteCard({ exp, onClick, rightAction }) {
    const f = computeExpedienteFinancials(exp);
    const inner = (
        <>
            <span className="block truncate">
                <span className="text-sm font-bold text-white group-hover:text-brand transition-colors">{exp.numero_expediente}</span>
                {exp.estado && <span className="text-[11px] text-white/40 ml-2">{exp.estado}</span>}
            </span>
            {exp.cliente_nombre && <span className="block text-[11px] text-white/60 truncate">{exp.cliente_nombre}</span>}
            {exp.cliente_direccion && <span className="block text-[10px] text-white/35 truncate">{exp.cliente_direccion}</span>}
            <span className="flex items-center gap-2.5 text-[10px] font-black mt-1">
                <span className="text-cyan-400">⚡ {mwh(f.savingsKwh)}</span>
                <span className="text-emerald-400">{eur(f.cae)}</span>
                <span className="text-amber-400">▲ {eur(f.profit)}</span>
            </span>
        </>
    );
    return (
        <div className="flex items-center justify-between gap-3 bg-bkg-surface border border-white/[0.06] rounded-xl px-4 py-2.5">
            {onClick
                ? <button type="button" onClick={onClick} className="text-left min-w-0 flex-1 group">{inner}</button>
                : <div className="min-w-0 flex-1">{inner}</div>}
            {rightAction}
        </div>
    );
}

export function LoteDetailModal({ loteId, soList, verList, onClose, onChanged, onNavigateExpediente }) {
    const { showAlert, showConfirm } = useModal();
    const [lote, setLote] = useState(null);
    const [loading, setLoading] = useState(true);
    const [elegibles, setElegibles] = useState([]);
    const [loadingEleg, setLoadingEleg] = useState(false);
    const [sugerencias, setSugerencias] = useState([]);
    const [busy, setBusy] = useState(false);
    const [fCcaa, setFCcaa] = useState('');
    const [fAnio, setFAnio] = useState('');
    const [fSearch, setFSearch] = useState('');
    const [costeVerifInput, setCosteVerifInput] = useState('');
    const [ofertaInput, setOfertaInput] = useState('');
    const [showAnexo, setShowAnexo] = useState(false);
    const [showSolicitud, setShowSolicitud] = useState(false);

    const isBorrador = lote?.estado === 'BORRADOR';

    const refresh = useCallback(async () => {
        const { data } = await axios.get(`/api/lotes/${loteId}`);
        setLote(data);
        return data;
    }, [loteId]);

    useEffect(() => {
        setLoading(true);
        refresh().catch(() => showAlert('No se pudo cargar el lote', 'Error', 'error')).finally(() => setLoading(false));
    }, [refresh, showAlert]);

    const fetchElegibles = useCallback(async () => {
        setLoadingEleg(true);
        try {
            const { data } = await axios.get('/api/lotes/elegibles');
            setElegibles(Array.isArray(data) ? data : []);
        } catch { setElegibles([]); } finally { setLoadingEleg(false); }
    }, []);

    useEffect(() => {
        if (lote && lote.estado === 'BORRADOR') fetchElegibles();
    }, [lote?.estado, fetchElegibles]);

    // ─── Filtros del selector de expedientes (CCAA + año + búsqueda por nombre/nº) ─
    const norm = (s) => (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const ccaaOpts = useMemo(() => [...new Set(elegibles.map(e => e.ccaa).filter(Boolean))].sort(), [elegibles]);
    const anioOpts = useMemo(() => [...new Set(elegibles.map(e => e.anio_actuacion).filter(Boolean))].sort((a, b) => b - a), [elegibles]);
    const loteTieneClaves = !!(lote && lote.anio_actuacion);
    // Si el lote ya tiene claves, manda el lote; si no, mandan los filtros del usuario.
    const effCcaa = loteTieneClaves ? lote.ccaa : fCcaa;
    const effAnio = loteTieneClaves ? lote.anio_actuacion : (fAnio ? Number(fAnio) : null);
    const elegiblesVisibles = useMemo(() => elegibles.filter(e => {
        if (effCcaa && norm(e.ccaa) !== norm(effCcaa)) return false;
        if (effAnio && e.anio_actuacion !== effAnio) return false;
        if (fSearch && !norm(`${e.numero_expediente} ${e.cliente_nombre || ''}`).includes(norm(fSearch))) return false;
        return true;
    }), [elegibles, effCcaa, effAnio, fSearch]); // eslint-disable-line

    // Resumen económico del lote (modelo del Excel del usuario).
    //   beneficioLote = ofertaLote(€/MWh) × ahorro(MWh) − pagoCliente(€) − costeVerif(€)
    //   beneficioActual = Σ profitBrokergy por expediente (el "antes", sin oferta de lote)
    const eco = useMemo(() => {
        const exps = (lote && lote.expedientes) || [];
        const base = exps.reduce((a, e) => {
            const f = computeExpedienteFinancials(e);
            a.ahorroKwh += f.savingsKwh || 0;
            a.pagoCliente += f.cae || 0;
            a.beneficioActual += f.profit || 0;
            return a;
        }, { ahorroKwh: 0, pagoCliente: 0, beneficioActual: 0 });
        const ahorroMwh = base.ahorroKwh / 1000;
        const costeVerif = Number(lote?.coste_verificacion) || 0;
        const ofertaLote = (lote?.oferta_lote != null && lote?.oferta_lote !== '') ? Number(lote.oferta_lote) : null;
        const mediaCliente = ahorroMwh > 0 ? base.pagoCliente / ahorroMwh : 0;
        const costeVerifMwh = ahorroMwh > 0 ? costeVerif / ahorroMwh : 0;
        const totalMwh = mediaCliente + costeVerifMwh;
        const margen = ofertaLote != null ? ofertaLote - totalMwh : null;
        const beneficioLote = ofertaLote != null ? (ofertaLote * ahorroMwh - base.pagoCliente - costeVerif) : null;
        return { ...base, ahorroMwh, costeVerif, ofertaLote, mediaCliente, costeVerifMwh, totalMwh, margen, beneficioLote };
    }, [lote?.expedientes, lote?.coste_verificacion, lote?.oferta_lote]);

    // Sincroniza los inputs de coste/oferta con el lote cargado.
    useEffect(() => {
        setCosteVerifInput(lote?.coste_verificacion ?? '');
        setOfertaInput(lote?.oferta_lote ?? '');
    }, [lote?.id, lote?.coste_verificacion, lote?.oferta_lote]);

    // ─── Acciones ────────────────────────────────────────────────────────────────
    const patchLote = async (patch) => {
        setBusy(true);
        try { await axios.patch(`/api/lotes/${loteId}`, patch); await refresh(); onChanged?.(); }
        catch (err) { showAlert(err.response?.data?.error || 'Error al actualizar', 'Error', 'error'); }
        finally { setBusy(false); }
    };

    const addExpediente = async (expId, force = false) => {
        if (!expId) return;
        setBusy(true);
        try {
            const { data } = await axios.post(`/api/lotes/${loteId}/expedientes`, { expediente_id: expId, force });
            if (data.requiresConfirmation) {
                setBusy(false);
                const ok = await showConfirm(data.warning, 'Lote casi lleno', 'warning');
                if (ok) return addExpediente(expId, true);
                return;
            }
            setSugerencias(data.sugerencias || []);
            await refresh();
            fetchElegibles();
            onChanged?.();
        } catch (err) {
            showAlert(err.response?.data?.error || 'No se pudo añadir el expediente', 'Error', 'error');
        } finally { setBusy(false); }
    };

    const removeExpediente = async (expId) => {
        setBusy(true);
        try {
            await axios.delete(`/api/lotes/${loteId}/expedientes/${expId}`);
            await refresh();
            fetchElegibles();
            onChanged?.();
        } catch (err) { showAlert(err.response?.data?.error || 'Error al quitar', 'Error', 'error'); }
        finally { setBusy(false); }
    };

    const changeEstado = async (nuevo_estado) => {
        if (!nuevo_estado || nuevo_estado === lote.estado) return;
        setBusy(true);
        try { await axios.patch(`/api/lotes/${loteId}/estado`, { nuevo_estado }); await refresh(); onChanged?.(); }
        catch (err) { showAlert(err.response?.data?.error || 'No se pudo cambiar el estado', 'Error', 'error'); }
        finally { setBusy(false); }
    };

    const borrarLote = async () => {
        const ok = await showConfirm('¿Seguro que quieres borrar este lote? Los expedientes quedarán sin lote (no se borran).', 'Borrar lote', 'warning');
        if (!ok) return;
        setBusy(true);
        try { await axios.delete(`/api/lotes/${loteId}`); onChanged?.(); onClose(); }
        catch (err) { showAlert(err.response?.data?.error || 'No se pudo borrar', 'Error', 'error'); setBusy(false); }
    };

    return (
        <div className="fixed inset-0 z-[310] flex items-start justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in overflow-y-auto">
            <div className="bg-bkg-deep border border-white/[0.08] rounded-2xl w-full max-w-2xl my-8 shadow-2xl">

                {/* Header */}
                <div className="flex items-center justify-between gap-3 p-6 border-b border-white/[0.06]">
                    <div className="min-w-0">
                        <div className="flex items-center gap-3">
                            <h2 className="text-lg font-black text-white truncate">{lote?.codigo || 'LOTE (sin código)'}</h2>
                            {lote && <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded border ${loteEstadoBadge(lote.estado)}`}>{lote.estado}</span>}
                        </div>
                        {lote && (
                            <p className="text-[11px] text-white/40 mt-1">
                                {lote.anio_actuacion ? `Año ${lote.anio_actuacion}` : 'Año pendiente'} · {lote.ccaa || 'CCAA pendiente'} · {(lote.expedientes || []).length}/5 expedientes
                            </p>
                        )}
                    </div>
                    <button onClick={onClose} className="p-2 text-white/30 hover:text-white transition-colors shrink-0">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                {loading || !lote ? (
                    <div className="p-12 text-center text-white/30 text-sm">Cargando…</div>
                ) : (
                    <div className="p-6 space-y-6">

                        {/* Resumen económico del lote (modelo Excel) */}
                        <div className="space-y-3">
                            <div className="grid grid-cols-3 gap-2">
                                <div className="bg-bkg-surface border border-white/[0.06] rounded-xl px-2 py-2.5 text-center">
                                    <p className="text-[8px] uppercase tracking-widest font-black text-white/30">Ahorro generado</p>
                                    <p className="text-sm sm:text-base font-black text-white mt-0.5 leading-tight">{mwh(eco.ahorroKwh)}</p>
                                </div>
                                <div className="bg-emerald-500/[0.06] border border-emerald-500/15 rounded-xl px-2 py-2.5 text-center">
                                    <p className="text-[8px] uppercase tracking-widest font-black text-emerald-300/60">Pago cliente</p>
                                    <p className="text-sm sm:text-base font-black text-emerald-300 mt-0.5 leading-tight">{eur(eco.pagoCliente)}</p>
                                    <p className="text-[8px] text-white/25 mt-0.5">a pagar al cliente</p>
                                </div>
                                <div className="bg-brand/[0.06] border border-brand/20 rounded-xl px-2 py-2.5 text-center">
                                    <p className="text-[8px] uppercase tracking-widest font-black text-brand/60">Beneficio lote</p>
                                    <p className="text-sm sm:text-base font-black text-brand mt-0.5 leading-tight">{eco.beneficioLote != null ? eur(eco.beneficioLote) : '—'}</p>
                                    <p className="text-[8px] text-white/25 mt-0.5">con oferta</p>
                                </div>
                            </div>

                            {/* Inputs manuales: coste de verificación (€) + oferta del lote (€/MWh) */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <div>
                                    <label className="block text-[9px] uppercase tracking-widest font-black text-white/30 mb-1">Coste verificación (€)</label>
                                    <input type="number" value={costeVerifInput} disabled={busy}
                                        onChange={e => setCosteVerifInput(e.target.value)}
                                        onBlur={() => { if (String(costeVerifInput) !== String(lote.coste_verificacion ?? '')) patchLote({ coste_verificacion: costeVerifInput }); }}
                                        placeholder="0"
                                        className="w-full bg-bkg-surface border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white focus:border-brand/40 focus:outline-none" />
                                </div>
                                <div>
                                    <label className="block text-[9px] uppercase tracking-widest font-black text-white/30 mb-1">Oferta lote (€/MWh)</label>
                                    <input type="number" value={ofertaInput} disabled={busy}
                                        onChange={e => setOfertaInput(e.target.value)}
                                        onBlur={() => { if (String(ofertaInput) !== String(lote.oferta_lote ?? '')) patchLote({ oferta_lote: ofertaInput }); }}
                                        placeholder="—"
                                        className="w-full bg-bkg-surface border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white focus:border-brand/40 focus:outline-none" />
                                    {lote.sujeto_obligado?.precio_referencia != null && (
                                        <p className="text-[9px] text-white/30 mt-1">Ref. S.O.: {Number(lote.sujeto_obligado.precio_referencia).toLocaleString('es-ES')} €/MWh</p>
                                    )}
                                </div>
                            </div>

                            {/* Desglose €/MWh + beneficio actual (sin oferta de lote) */}
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-white/40 bg-white/[0.02] border border-white/[0.05] rounded-xl px-3 py-2">
                                <span>Cliente <b className="text-white/60">{eco.mediaCliente.toLocaleString('es-ES', { maximumFractionDigits: 2 })}</b> €/MWh</span>
                                <span>· Verif. <b className="text-white/60">{eco.costeVerifMwh.toLocaleString('es-ES', { maximumFractionDigits: 2 })}</b> €/MWh</span>
                                <span>· Total <b className="text-white/60">{eco.totalMwh.toLocaleString('es-ES', { maximumFractionDigits: 2 })}</b> €/MWh</span>
                                {eco.margen != null && <span>· Margen <b className="text-emerald-400">{eco.margen.toLocaleString('es-ES', { maximumFractionDigits: 2 })}</b> €/MWh</span>}
                                <span className="ml-auto">Beneficio actual (sin oferta): <b className="text-white/60">{eur(eco.beneficioActual)}</b></span>
                            </div>
                        </div>

                        {/* Destinatarios */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[10px] uppercase tracking-[0.2em] font-black text-white/30 mb-2">Sujeto Obligado</label>
                                <select value={lote.sujeto_obligado_id || ''} disabled={!isBorrador || busy}
                                    onChange={e => patchLote({ sujeto_obligado_id: e.target.value || null })}
                                    className="w-full bg-bkg-surface border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white focus:border-brand/40 focus:outline-none disabled:opacity-60">
                                    <option value="">— sin asignar —</option>
                                    {soList.map(p => <option key={p.id_empresa} value={p.id_empresa}>{presName(p)}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-[10px] uppercase tracking-[0.2em] font-black text-white/30 mb-2">Verificador</label>
                                <select value={lote.verificador_id || ''} disabled={!isBorrador || busy}
                                    onChange={e => patchLote({ verificador_id: e.target.value || null })}
                                    className="w-full bg-bkg-surface border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white focus:border-brand/40 focus:outline-none disabled:opacity-60">
                                    <option value="">— sin asignar —</option>
                                    {verList.map(p => <option key={p.id_empresa} value={p.id_empresa}>{presName(p)}</option>)}
                                </select>
                                {verList.length === 0 && <p className="text-[10px] text-white/30 mt-1">Aún no hay verificadores dados de alta.</p>}
                            </div>
                        </div>

                        {/* Expedientes del lote */}
                        <div>
                            <p className="text-[10px] uppercase tracking-[0.2em] font-black text-white/30 mb-2">Expedientes ({(lote.expedientes || []).length})</p>
                            {(lote.expedientes || []).length === 0 ? (
                                <p className="text-[12px] text-white/30 italic py-3">Sin expedientes. Añade el primero abajo; fijará el año y la CCAA del lote.</p>
                            ) : (
                                <div className="space-y-2">
                                    {lote.expedientes.map(e => (
                                        <ExpedienteCard
                                            key={e.id}
                                            exp={e}
                                            onClick={() => onNavigateExpediente?.(e.id)}
                                            rightAction={isBorrador ? (
                                                <button onClick={() => removeExpediente(e.id)} disabled={busy} title="Quitar del lote"
                                                    className="p-1.5 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-all shrink-0">
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                                                </button>
                                            ) : null}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Añadir expediente (solo BORRADOR) */}
                        {isBorrador && (
                            <div className="border-t border-white/5 pt-5">
                                <p className="text-[10px] uppercase tracking-[0.2em] font-black text-white/30 mb-2">Añadir expediente</p>

                                {/* Filtros CCAA + Año (solo si el lote aún no tiene claves; si las tiene, manda el lote) */}
                                {!loteTieneClaves ? (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        <select value={fCcaa} onChange={e => setFCcaa(e.target.value)}
                                            className="bg-bkg-surface border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white focus:border-brand/40 focus:outline-none">
                                            <option value="">Todas las CCAA</option>
                                            {ccaaOpts.map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                        <select value={fAnio} onChange={e => setFAnio(e.target.value)}
                                            className="bg-bkg-surface border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white focus:border-brand/40 focus:outline-none">
                                            <option value="">Todos los años</option>
                                            {anioOpts.map(a => <option key={a} value={a}>{a}</option>)}
                                        </select>
                                    </div>
                                ) : (
                                    <p className="text-[10px] text-white/30">Filtrado al año <b className="text-white/50">{lote.anio_actuacion}</b> · <b className="text-white/50">{lote.ccaa}</b> del lote.</p>
                                )}

                                {/* Buscador por nombre o nº de expediente */}
                                <input value={fSearch} onChange={e => setFSearch(e.target.value)}
                                    placeholder="Buscar por nº de expediente o nombre…"
                                    className="w-full mt-2 bg-bkg-surface border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/25 focus:border-brand/40 focus:outline-none" />

                                {/* Lista con scroll: una fila por expediente con su botón Añadir */}
                                <div className="mt-2 max-h-64 overflow-y-auto space-y-1.5 pr-1">
                                    {loadingEleg ? (
                                        <p className="text-[12px] text-white/30 py-4 text-center">Cargando expedientes elegibles…</p>
                                    ) : elegiblesVisibles.length === 0 ? (
                                        <p className="text-[12px] text-white/30 py-4 text-center">{elegibles.length ? 'Ningún expediente coincide con el filtro.' : 'No hay expedientes elegibles (con CIFO y sin lote).'}</p>
                                    ) : elegiblesVisibles.map(x => (
                                        <ExpedienteCard
                                            key={x.id}
                                            exp={x}
                                            rightAction={(
                                                <button onClick={() => addExpediente(x.id)} disabled={busy}
                                                    className="shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-widest bg-brand/15 text-brand border border-brand/30 hover:bg-brand/25 disabled:opacity-40 transition-all">
                                                    + Añadir
                                                </button>
                                            )}
                                        />
                                    ))}
                                </div>
                                <p className="text-[10px] text-white/30 mt-1.5">{elegiblesVisibles.length} elegibles · solo con CIFO (año de actuación) y sin lote.</p>

                                {sugerencias.length > 0 && (
                                    <div className="mt-3 bg-amber-500/5 border border-amber-500/20 rounded-xl p-3">
                                        <p className="text-[11px] text-amber-300/90 font-bold mb-1.5">💡 Mismo instalador, sin lotear ({sugerencias.length}):</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {sugerencias.map(s => (
                                                <button key={s.id} onClick={() => addExpediente(s.id)} disabled={busy}
                                                    className="text-[11px] px-2 py-1 rounded-lg bg-amber-500/10 text-amber-300 border border-amber-500/20 hover:bg-amber-500/20 transition-all">
                                                    + {s.numero_expediente}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Documentos del lote */}
                        <div className="border-t border-white/5 pt-5">
                            <p className="text-[10px] uppercase tracking-[0.2em] font-black text-white/30 mb-2">Documentos</p>
                            <div className="flex flex-wrap gap-2">
                                <button onClick={() => setShowAnexo(true)} disabled={!(lote.expedientes || []).length}
                                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest bg-brand/15 text-brand border border-brand/30 hover:bg-brand/25 disabled:opacity-40 transition-all">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                    Anexo I · Cesión (S.O.)
                                </button>
                                <button onClick={() => setShowSolicitud(true)} disabled={!(lote.expedientes || []).length}
                                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest bg-brand/15 text-brand border border-brand/30 hover:bg-brand/25 disabled:opacity-40 transition-all">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
                                    Solicitud Verificación
                                </button>
                            </div>
                        </div>

                        {/* Estado del lote */}
                        <div className="border-t border-white/5 pt-5">
                            <p className="text-[10px] uppercase tracking-[0.2em] font-black text-white/30 mb-2">Estado del lote</p>
                            <div className="flex items-center gap-2">
                                <select value={lote.estado} disabled={busy} onChange={e => changeEstado(e.target.value)}
                                    className="flex-1 bg-bkg-surface border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white focus:border-brand/40 focus:outline-none">
                                    {LOTE_ESTADOS.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>
                            <p className="text-[10px] text-white/30 mt-2">Para pasar a “Enviado a verificador” el lote necesita Verificador y al menos un expediente.</p>
                        </div>

                        {lote.notas && <p className="text-[12px] text-white/40 italic">📝 {lote.notas}</p>}

                        {/* Borrar */}
                        {isBorrador && (
                            <div className="border-t border-white/5 pt-4 flex justify-end">
                                <button onClick={borrarLote} disabled={busy}
                                    className="text-[11px] font-black uppercase tracking-widest text-red-400/70 hover:text-red-400 transition-colors">
                                    Borrar lote
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
            {showAnexo && lote && <AnexoListadoModal lote={lote} onClose={() => setShowAnexo(false)} />}
            {showSolicitud && lote && <SolicitudVerificacionModal lote={lote} onClose={() => setShowSolicitud(false)} />}
        </div>
    );
}
