import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { useModal } from '../../../context/ModalContext';
import { useAuth } from '../../../context/AuthContext';
import { getRoleFlags } from '../../../utils/roleFlags';
import { LOTE_ESTADOS, loteEstadoBadge } from '../loteConstants';
import { computeExpedienteFinancials } from '../../expedientes/logic/expedienteFinancials';
import { computeLoteEco } from '../logic/loteEco';
import { AnexoListadoModal } from './AnexoListadoModal';
import { SolicitudVerificacionModal } from './SolicitudVerificacionModal';
import { FacturaSoModal } from './FacturaSoModal';
import { LoteProcesoFases } from './LoteProcesoFases';
import { LogoEmpresa } from './LogoEmpresa';
import { RequerimientoModal } from './RequerimientoModal';

const presName = (p) => p ? (p.acronimo || p.razon_social || '—') : null;
const eur = (n) => (Number(n) || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const mwh = (n) => `${((Number(n) || 0) / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} MWh`;
// Verificado en kWh (= CAEs): la factura al S.O. se emite medida en kWh.
const kwh = (n) => `${Math.round(Number(n) || 0).toLocaleString('es-ES')} kWh`;

// Tarjeta de expediente compartida (idéntica en la lista del lote y en el picker):
// nº + estado, nombre del cliente, dirección y los 3 importes. `rightAction` = botón
// (× quitar / + añadir). Si `onClick`, el bloque de texto navega al expediente.
function ExpedienteCard({ exp, onClick, rightAction }) {
    const { user } = useAuth();
    const { canSeeMargin } = getRoleFlags(user); // el ▲ beneficio Brokergy solo lo ve el ADMIN
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
                {canSeeMargin && <span className="text-amber-400">▲ {eur(f.profit)}</span>}
            </span>
            {f.savingsKwhVerificado != null && (
                <span className="flex items-center gap-2.5 text-[10px] font-black mt-0.5" title="Ahorro verificado (factura al S.O.)">
                    <span className="text-[8px] uppercase tracking-widest text-amber-400/70">Verif</span>
                    <span className="text-cyan-300">⚡ {kwh(f.savingsKwhVerificado)}</span>
                    <span className="text-emerald-300">{eur(f.caeVerificado)}</span>
                    {canSeeMargin && <span className="text-amber-300">▲ {eur(f.profitVerificado)}</span>}
                </span>
            )}
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

export function LoteDetailModal({ loteId, soList: soListProp, verList: verListProp, onClose, onChanged, onNavigateExpediente }) {
    const { showAlert, showConfirm } = useModal();
    const { user } = useAuth();
    // Solo ADMIN ve el margen (beneficio, oferta €/MWh, coste verif., factura al S.O.).
    // El TRABAJADOR opera el lote (expedientes, SO/verificador, envío) sin ver precios,
    // y no puede borrar el lote (canDelete).
    const { canSeeMargin, canDelete } = getRoleFlags(user);
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
    const [expVerifInput, setExpVerifInput] = useState('');
    // Pestañas: el lote tiene demasiada cosa para una sola columna con scroll.
    const [tab, setTab] = useState('resumen');
    const [showAnexo, setShowAnexo] = useState(false);
    const [showSolicitud, setShowSolicitud] = useState(false);
    const [showFactura, setShowFactura] = useState(false);
    const [showRequerimiento, setShowRequerimiento] = useState(false);
    const [showExpedientes, setShowExpedientes] = useState(true);
    const [soList, setSoList] = useState(soListProp || []);
    const [verList, setVerList] = useState(verListProp || []);

    // Carga SO/Verificador si no se pasan como props (ej. apertura desde expediente).
    useEffect(() => {
        if ((soListProp || []).length || (verListProp || []).length) return;
        axios.get('/api/prescriptores?tipo=SUJETO_OBLIGADO&limit=200')
            .then(r => setSoList(Array.isArray(r.data) ? r.data : (r.data?.data || [])))
            .catch(() => {});
        axios.get('/api/prescriptores?tipo=VERIFICADOR&limit=200')
            .then(r => setVerList(Array.isArray(r.data) ? r.data : (r.data?.data || [])))
            .catch(() => {});
    }, []); // eslint-disable-line

    const isBorrador = lote?.estado === 'BORRADOR';
    // El gating de cada acción (qué se puede hacer y cuándo) lo decide el módulo de
    // fases a partir del papeleo real del lote — ver logic/loteProceso.js.

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
    //   beneficioLote = ofertaLote(€/MWh) × ahorro(MWh) − pagoCliente(€)
    //   beneficioActual = Σ profitBrokergy por expediente (el "antes", sin oferta de lote)
    const eco = useMemo(() => computeLoteEco(lote), [lote?.expedientes, lote?.coste_verificacion, lote?.oferta_lote]);

    // Documentos que han vuelto firmados y nadie ha revisado: es lo que hay que
    // mirar hoy, así que va de contador en la pestaña de Documentación.
    const docsPendientes = useMemo(
        () => (lote?.documentos_so || []).filter(d => d?.signed_link && !d?.validado_at).length,
        [lote?.documentos_so]
    );

    // Sincroniza los inputs manuales (coste, oferta, nº de expte. del verificador)
    // con el lote cargado.
    useEffect(() => {
        setCosteVerifInput(lote?.coste_verificacion ?? '');
        setOfertaInput(lote?.oferta_lote ?? '');
        setExpVerifInput(lote?.expediente_verificador ?? '');
    }, [lote?.id, lote?.coste_verificacion, lote?.oferta_lote, lote?.expediente_verificador]);

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
                <div className="flex items-start justify-between gap-3 p-6 border-b border-white/[0.06]">
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-3 mb-2 min-w-0">
                            <h2 className="text-lg font-black text-white whitespace-nowrap shrink-0">{lote?.codigo || 'LOTE (sin código)'}</h2>
                            {lote && (
                                <select value={lote.estado} disabled={busy} onChange={e => changeEstado(e.target.value)}
                                    className="flex-1 min-w-0 bg-bkg-surface border border-white/[0.08] rounded-xl px-3 py-1.5 text-sm text-white focus:border-brand/40 focus:outline-none">
                                    {LOTE_ESTADOS.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            )}
                        </div>
                        {lote && (
                            <p className="text-[11px] text-white/40">
                                {lote.anio_actuacion ? `Año ${lote.anio_actuacion}` : 'Año pendiente'} · {lote.ccaa || 'CCAA pendiente'} · {(lote.expedientes || []).length}/5 expedientes
                                {lote.expediente_verificador && (
                                    <> · <span className="text-brand/70 font-black" title="Nº de expediente del verificador">⧉ {lote.expediente_verificador}</span></>
                                )}
                            </p>
                        )}
                    </div>
                    <button onClick={onClose} className="p-2 text-white/30 hover:text-white transition-colors shrink-0 mt-1">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                {loading || !lote ? (
                    <div className="p-12 text-center text-white/30 text-sm">Cargando…</div>
                ) : (
                    <div className="p-6">

                        {/* Pestañas — el papeleo, los expedientes y los números no se
                            miran a la vez; juntarlos obligaba a un scroll larguísimo. */}
                        <div className="flex items-center gap-1 border-b border-white/[0.07] mb-5 -mt-1">
                            {[
                                ['resumen', 'Resumen', null],
                                ['expedientes', 'Expedientes', (lote.expedientes || []).length],
                                ['documentacion', 'Documentación', docsPendientes || null],
                            ].map(([id, label, badge]) => (
                                <button key={id} type="button" onClick={() => setTab(id)}
                                    className={`relative px-4 py-2.5 text-[11px] font-black uppercase tracking-wider transition-colors ${
                                        tab === id ? 'text-brand' : 'text-white/35 hover:text-white/70'}`}>
                                    {label}
                                    {badge != null && (
                                        <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[9px] ${
                                            id === 'documentacion' ? 'bg-cyan-500/15 text-cyan-300' : 'bg-white/[0.06] text-white/40'}`}>{badge}</span>
                                    )}
                                    {tab === id && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-brand rounded-full" />}
                                </button>
                            ))}
                        </div>

                        <div className={tab === 'resumen' ? 'space-y-6' : 'hidden'}>

                        {/* Resumen económico del lote (modelo Excel).
                            El TRABAJADOR ve ahorro + pago al cliente, pero NO el margen Brokergy. */}
                        <div className="space-y-3">
                            <div className={`grid ${canSeeMargin ? 'grid-cols-3' : 'grid-cols-2'} gap-2`}>
                                <div className="bg-bkg-surface border border-white/[0.06] rounded-xl px-2 py-2.5 text-center">
                                    <p className="text-[8px] uppercase tracking-widest font-black text-white/30">Ahorro generado</p>
                                    <p className="text-sm sm:text-base font-black text-white mt-0.5 leading-tight">{mwh(eco.ahorroKwh)}</p>
                                    <p className="text-[8px] text-white/25 mt-0.5">estimado</p>
                                    {eco.hasVerif && (
                                        <p className="text-[9px] font-black text-amber-300 mt-0.5 leading-tight" title="Ahorro verificado (base de la factura al S.O., en kWh)">
                                            Verif: {kwh(eco.ahorroKwhVerif)}{!eco.fullyVerif ? ` · ${eco.nVerif}/${eco.nTotal}` : ''}
                                        </p>
                                    )}
                                </div>
                                <div className="bg-emerald-500/[0.06] border border-emerald-500/15 rounded-xl px-2 py-2.5 text-center">
                                    <p className="text-[8px] uppercase tracking-widest font-black text-emerald-300/60">Pago cliente</p>
                                    <p className="text-sm sm:text-base font-black text-emerald-300 mt-0.5 leading-tight">{eur(eco.pagoCliente)}</p>
                                    <p className="text-[8px] text-white/25 mt-0.5">a pagar al cliente</p>
                                    {eco.hasVerif && <p className="text-[9px] font-black text-amber-300 mt-0.5 leading-tight">Verif: {eur(eco.pagoClienteVerif)}</p>}
                                </div>
                                {canSeeMargin && (
                                <div className="bg-brand/[0.06] border border-brand/20 rounded-xl px-2 py-2.5 text-center">
                                    <p className="text-[8px] uppercase tracking-widest font-black text-brand/60">Beneficio lote</p>
                                    <p className="text-sm sm:text-base font-black text-brand mt-0.5 leading-tight">{eco.beneficioLote != null ? eur(eco.beneficioLote) : '—'}</p>
                                    <p className="text-[8px] text-white/25 mt-0.5">con oferta</p>
                                    {eco.hasVerif && eco.beneficioLoteVerif != null && <p className="text-[9px] font-black text-amber-300 mt-0.5 leading-tight">Verif: {eur(eco.beneficioLoteVerif)}</p>}
                                </div>
                                )}
                            </div>

                            {/* Inputs manuales. El coste y la oferta son MARGEN (solo ADMIN);
                                el nº de expediente del verificador es un dato de gestión que
                                ve y edita todo el staff. */}
                            <div className={`grid grid-cols-1 gap-2 ${canSeeMargin ? 'sm:grid-cols-3' : ''}`}>
                                {canSeeMargin && (
                                <div>
                                    <label className="block text-[9px] uppercase tracking-widest font-black text-white/30 mb-1">Coste verificación (€)</label>
                                    <input type="number" value={costeVerifInput} disabled={busy}
                                        onChange={e => setCosteVerifInput(e.target.value)}
                                        onBlur={() => { if (String(costeVerifInput) !== String(lote.coste_verificacion ?? '')) patchLote({ coste_verificacion: costeVerifInput }); }}
                                        placeholder="0"
                                        className="w-full bg-bkg-surface border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white focus:border-brand/40 focus:outline-none" />
                                </div>
                                )}
                                {canSeeMargin && (
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
                                )}
                                <div>
                                    <label className="block text-[9px] uppercase tracking-widest font-black text-white/30 mb-1">Nº expte. verificador</label>
                                    <input type="text" value={expVerifInput} disabled={busy}
                                        onChange={e => setExpVerifInput(e.target.value)}
                                        onBlur={() => { if (expVerifInput.trim() !== String(lote.expediente_verificador ?? '')) patchLote({ expediente_verificador: expVerifInput.trim() }); }}
                                        placeholder="El que nos dé el verificador"
                                        className="w-full bg-bkg-surface border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white placeholder-white/20 focus:border-brand/40 focus:outline-none" />
                                    <p className="text-[9px] text-white/30 mt-1">
                                        {lote.verificador ? `Su referencia en ${presName(lote.verificador)}.` : 'Su referencia en el sistema del verificador.'}
                                    </p>
                                </div>
                            </div>

                            {canSeeMargin && (<>
                            {/* Desglose €/MWh. La VERIFICACIÓN se muestra pero NO resta en
                                nuestro margen: la paga el S.O. (va marcada como suya). */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                {[
                                    { label: 'Cliente', value: eco.mediaCliente, color: 'text-white/70', nota: null },
                                    { label: 'Verificación', value: eco.costeVerifMwh, color: 'text-white/40', nota: 'la paga el S.O.' },
                                    { label: 'Nos paga', value: eco.ofertaLote, color: 'text-white/70', nota: null },
                                    { label: 'Margen', value: eco.margen, color: 'text-emerald-400', nota: null },
                                ].map(({ label, value, color, nota }) => value != null && (
                                    <div key={label} className="bg-white/[0.02] border border-white/[0.05] rounded-xl px-3 py-2 text-center">
                                        <p className="text-[8px] uppercase tracking-widest font-black text-white/25 mb-0.5">{label}</p>
                                        <p className={`text-sm font-black ${color}`}>{value.toLocaleString('es-ES', { maximumFractionDigits: 2 })} <span className="text-[10px] font-normal text-white/30">€/MWh</span></p>
                                        {nota && <p className="text-[8px] text-white/20 mt-0.5">{nota}</p>}
                                    </div>
                                ))}
                            </div>
                            <p className="text-[10px] text-white/30 text-right">Beneficio sin oferta: <b className="text-white/50">{eur(eco.beneficioActual)}</b></p>

                            {/* Lo que le AHORRAMOS al S.O. frente a pagar la equivalencia
                                financiera. Es el argumento con el que se negocia el precio. */}
                            {eco.ahorroSoMwh != null && (
                                <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.05] px-4 py-3">
                                    <div className="flex items-center justify-between gap-3 mb-2">
                                        <p className="text-[9px] font-black text-cyan-300/70 uppercase tracking-[0.2em]">Ahorro que le generamos al S.O.</p>
                                        <p className="text-[9px] text-white/25">Equiv. financiera {eco.equivalenciaFinanciera.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €/MWh</p>
                                    </div>
                                    <div className="flex items-baseline gap-3 flex-wrap">
                                        <span className="text-xl font-black text-cyan-300">{eur(eco.ahorroSoTotal)}</span>
                                        <span className="text-sm font-black text-cyan-300/80">{eco.ahorroSoPct.toLocaleString('es-ES', { maximumFractionDigits: 1 })} %</span>
                                        <span className="text-[11px] text-white/40">
                                            {eco.ahorroSoMwh.toLocaleString('es-ES', { maximumFractionDigits: 2 })} €/MWh
                                        </span>
                                    </div>
                                    <p className="text-[9px] text-white/30 mt-1.5">
                                        {eco.equivalenciaFinanciera.toLocaleString('es-ES', { minimumFractionDigits: 2 })} − ({eco.ofertaLote.toLocaleString('es-ES', { maximumFractionDigits: 2 })} que nos paga + {eco.costeVerifMwh.toLocaleString('es-ES', { maximumFractionDigits: 2 })} de verificación) × {eco.ahorroMwh.toLocaleString('es-ES', { maximumFractionDigits: 1 })} MWh
                                    </p>
                                </div>
                            )}
                            </>)}
                        </div>

                        {/* Destinatarios */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <div className="flex items-center gap-2 mb-2">
                                    <LogoEmpresa p={lote.sujeto_obligado} size={22} />
                                    <label className="block text-[10px] uppercase tracking-[0.2em] font-black text-white/30">Sujeto Obligado</label>
                                </div>
                                <select value={lote.sujeto_obligado_id || ''} disabled={!isBorrador || busy}
                                    onChange={e => patchLote({ sujeto_obligado_id: e.target.value || null })}
                                    className="w-full bg-bkg-surface border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white focus:border-brand/40 focus:outline-none disabled:opacity-60">
                                    <option value="">— sin asignar —</option>
                                    {soList.map(p => <option key={p.id_empresa} value={p.id_empresa}>{presName(p)}</option>)}
                                </select>
                            </div>
                            <div>
                                <div className="flex items-center gap-2 mb-2">
                                    <LogoEmpresa p={lote.verificador} size={22} />
                                    <label className="block text-[10px] uppercase tracking-[0.2em] font-black text-white/30">Verificador</label>
                                    {/* Su nº de expediente, junto a su nombre: es como se
                                        refieren ellos al lote cuando hablamos. */}
                                    {lote.expediente_verificador && (
                                        <span className="text-[10px] font-black text-brand/80 truncate" title="Nº de expediente del verificador">
                                            ⧉ {lote.expediente_verificador}
                                        </span>
                                    )}
                                </div>
                                <select value={lote.verificador_id || ''} disabled={!isBorrador || busy}
                                    onChange={e => patchLote({ verificador_id: e.target.value || null })}
                                    className="w-full bg-bkg-surface border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white focus:border-brand/40 focus:outline-none disabled:opacity-60">
                                    <option value="">— sin asignar —</option>
                                    {verList.map(p => <option key={p.id_empresa} value={p.id_empresa}>{presName(p)}</option>)}
                                </select>
                                {verList.length === 0 && <p className="text-[10px] text-white/30 mt-1">Aún no hay verificadores dados de alta.</p>}
                            </div>
                        </div>

                        {lote.notas && <p className="text-[12px] text-white/40 italic">📝 {lote.notas}</p>}

                        {/* Borrar lote — SOLO ADMIN (el trabajador no borra) */}
                        {isBorrador && canDelete && (
                            <div className="border-t border-white/5 pt-4 flex justify-end">
                                <button onClick={borrarLote} disabled={busy}
                                    className="text-[11px] font-black uppercase tracking-widest text-red-400/70 hover:text-red-400 transition-colors">
                                    Borrar lote
                                </button>
                            </div>
                        )}
                        </div>

                        <div className={tab === 'expedientes' ? 'space-y-6' : 'hidden'}>

                        {/* Expedientes del lote — colapsable */}
                        <div>
                            <button
                                type="button"
                                onClick={() => setShowExpedientes(v => !v)}
                                className="w-full flex items-center justify-between gap-2 group"
                            >
                                <p className="text-[10px] uppercase tracking-[0.2em] font-black text-white/30 group-hover:text-white/50 transition-colors">
                                    Expedientes ({(lote.expedientes || []).length})
                                </p>
                                <svg className={`w-4 h-4 text-white/30 group-hover:text-white/50 transition-all ${showExpedientes ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </button>
                            {showExpedientes && (
                                <div className="mt-2">
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

                        </div>

                        {/* El proceso del lote, por fases: documentos y acciones en el orden
                            real del trámite (solicitud → firma S.O. → oferta → verificación
                            → MITECO → cobro) */}
                        <div className={tab === 'documentacion' ? '' : 'hidden'}>
                            <LoteProcesoFases
                                lote={lote}
                                canSeeMargin={canSeeMargin}
                                onChanged={() => { refresh(); onChanged?.(); }}
                                acciones={{
                                    abrirSolicitud: () => setShowSolicitud(true),
                                    abrirAnexo: () => setShowAnexo(true),
                                    abrirRequerimiento: () => setShowRequerimiento(true),
                                    abrirFactura: () => setShowFactura(true),
                                }}
                            />
                        </div>
                    </div>
                )}
            </div>
            {showAnexo && lote && <AnexoListadoModal lote={lote} onClose={() => setShowAnexo(false)} />}
            {showSolicitud && lote && (
                <SolicitudVerificacionModal
                    lote={lote}
                    onClose={() => setShowSolicitud(false)}
                    onSent={() => { refresh().catch(() => {}); onChanged?.(); }}
                />
            )}
            {showFactura && lote && (
                <FacturaSoModal
                    lote={lote}
                    onClose={() => { setShowFactura(false); refresh().catch(() => {}); onChanged?.(); }}
                    onGenerated={() => { refresh().catch(() => {}); onChanged?.(); }}
                />
            )}
            {showRequerimiento && lote && (
                <RequerimientoModal
                    lote={lote}
                    onClose={() => setShowRequerimiento(false)}
                    onSent={() => { refresh().catch(() => {}); onChanged?.(); }}
                />
            )}
        </div>
    );
}
