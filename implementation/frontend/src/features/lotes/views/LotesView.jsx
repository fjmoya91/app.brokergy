import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { useModal } from '../../../context/ModalContext';
import { useAuth } from '../../../context/AuthContext';
import { getRoleFlags } from '../../../utils/roleFlags';
import { LoteDetailModal } from '../components/LoteDetailModal';
import { loteEstadoBadge } from '../loteConstants';
import { computeLoteEco } from '../logic/loteEco';

const presName = (p) => p ? (p.acronimo || p.razon_social || '—') : null;
const eur = (n) => (Number(n) || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const mwh = (n) => `${((Number(n) || 0) / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} MWh`;
const kwh = (n) => `${Math.round(Number(n) || 0).toLocaleString('es-ES')} kWh`;

// ─── Modal de creación ──────────────────────────────────────────────────────────
function CrearLoteModal({ soList, onClose, onCreated }) {
    const { showAlert } = useModal();
    const [soId, setSoId] = useState('');
    const [notas, setNotas] = useState('');
    const [saving, setSaving] = useState(false);

    const crear = async () => {
        if (!soId) { showAlert('Selecciona el Sujeto Obligado', 'Falta dato', 'warning'); return; }
        setSaving(true);
        try {
            const { data } = await axios.post('/api/lotes', { sujeto_obligado_id: soId, notas: notas.trim() || null });
            onCreated(data);
        } catch (err) {
            showAlert(err.response?.data?.error || 'Error al crear el lote', 'Error', 'error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[300] flex items-start justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in overflow-y-auto">
            <div className="bg-bkg-deep border border-white/[0.08] rounded-2xl w-full max-w-lg my-12 shadow-2xl">
                <div className="flex items-center justify-between p-6 border-b border-white/[0.06]">
                    <h2 className="text-sm font-black text-white uppercase tracking-wider">Nuevo Lote</h2>
                    <button onClick={onClose} className="p-2 text-white/30 hover:text-white transition-colors">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
                <div className="p-6 space-y-4">
                    <div>
                        <label className="block text-[10px] uppercase tracking-[0.2em] font-black text-white/30 mb-2">Sujeto Obligado</label>
                        <select value={soId} onChange={e => setSoId(e.target.value)}
                            className="w-full bg-bkg-surface border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white focus:border-brand/40 focus:outline-none">
                            <option value="">— Selecciona Sujeto Obligado —</option>
                            {soList.map(p => <option key={p.id_empresa} value={p.id_empresa}>{presName(p)} {p.cif ? `(${p.cif})` : ''}</option>)}
                        </select>
                        {soList.length === 0 && (
                            <p className="text-[11px] text-amber-400/80 mt-2">No hay ningún prescriptor de tipo SUJETO OBLIGADO dado de alta. Créalo primero en Prescriptores.</p>
                        )}
                    </div>
                    <div>
                        <label className="block text-[10px] uppercase tracking-[0.2em] font-black text-white/30 mb-2">Notas (opcional)</label>
                        <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2}
                            className="w-full bg-bkg-surface border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white focus:border-brand/40 focus:outline-none resize-none" />
                    </div>
                    <p className="text-[11px] text-white/30">El lote se crea en <b className="text-white/50">BORRADOR</b>. El año y la CCAA se fijan al añadir el primer expediente; el Verificador se asigna después.</p>
                </div>
                <div className="flex items-center justify-end gap-3 p-6 border-t border-white/[0.06]">
                    <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-white/50 hover:text-white transition-colors">Cancelar</button>
                    <button onClick={crear} disabled={saving || !soId}
                        className="px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest bg-gradient-to-r from-brand to-brand-700 text-bkg-deep disabled:opacity-40 transition-all">
                        {saving ? 'Creando…' : 'Crear Lote'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Vista principal ────────────────────────────────────────────────────────────
export function LotesView({ onNavigate }) {
    const { showAlert } = useModal();
    const { user } = useAuth();
    // Solo ADMIN ve el margen/beneficio de Brokergy. El TRABAJADOR opera lotes sin cifras de venta al S.O.
    const { canSeeMargin } = getRoleFlags(user);
    const [lotes, setLotes] = useState([]);
    const [soList, setSoList] = useState([]);
    const [verList, setVerList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [showCrear, setShowCrear] = useState(false);
    const [detailId, setDetailId] = useState(null);
    const [filtroEstado, setFiltroEstado] = useState('TODO');

    const fetchLotes = useCallback(async () => {
        try {
            const { data } = await axios.get('/api/lotes');
            setLotes(Array.isArray(data) ? data : []);
        } catch (err) {
            setError(err.response?.data?.error || 'Error al cargar los lotes');
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchPrescriptores = useCallback(async () => {
        try {
            const { data } = await axios.get('/api/prescriptores');
            const all = Array.isArray(data) ? data : [];
            setSoList(all.filter(p => p.tipo_empresa === 'SUJETO_OBLIGADO'));
            setVerList(all.filter(p => p.tipo_empresa === 'VERIFICADOR'));
        } catch { /* no bloquear la vista */ }
    }, []);

    useEffect(() => { fetchLotes(); fetchPrescriptores(); }, [fetchLotes, fetchPrescriptores]);

    const stats = useMemo(() => ({
        total: lotes.length,
        borradores: lotes.filter(l => l.estado === 'BORRADOR').length,
        enCurso: lotes.filter(l => l.estado !== 'BORRADOR' && l.estado !== 'FINALIZADO').length,
        finalizados: lotes.filter(l => l.estado === 'FINALIZADO').length,
    }), [lotes]);

    const visibles = useMemo(
        () => filtroEstado === 'TODO' ? lotes : lotes.filter(l => l.estado === filtroEstado),
        [lotes, filtroEstado]
    );

    return (
        <div className="animate-fade-in w-full max-w-[1600px] mx-auto px-6 sm:px-10 py-10 relative z-10">
            {/* Header */}
            <div className="flex items-center justify-between gap-4 flex-wrap mb-8">
                <div>
                    <h1 className="text-2xl font-black text-white tracking-tight">Lotes</h1>
                    <p className="text-sm text-white/40 mt-1">Agrupación de expedientes para envío a Sujeto Obligado y Verificador.</p>
                </div>
                <button onClick={() => setShowCrear(true)}
                    className="flex items-center gap-2 px-5 py-3 rounded-xl text-xs font-black uppercase tracking-widest bg-gradient-to-r from-brand to-brand-700 text-bkg-deep shadow-lg shadow-brand/20 hover:shadow-brand/30 transition-all">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                    Nuevo Lote
                </button>
            </div>

            {/* Stats + filtro */}
            <div className="flex items-center gap-2 flex-wrap mb-6">
                {[
                    ['TODO', `Todos (${stats.total})`],
                    ['BORRADOR', `Borradores (${stats.borradores})`],
                ].map(([val, label]) => (
                    <button key={val} onClick={() => setFiltroEstado(val)}
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-widest border transition-all ${
                            filtroEstado === val ? 'bg-brand/15 text-brand border-brand/30' : 'text-white/40 border-white/10 hover:text-white/70'}`}>
                        {label}
                    </button>
                ))}
                <span className="text-[11px] text-white/30 ml-2">En curso: {stats.enCurso} · Finalizados: {stats.finalizados}</span>
            </div>

            {/* Lista */}
            {loading ? (
                <div className="text-center py-20 text-white/30 text-sm">Cargando lotes…</div>
            ) : error ? (
                <div className="text-center py-20 text-red-400 text-sm">{error}</div>
            ) : visibles.length === 0 ? (
                <div className="text-center py-20 border border-dashed border-white/10 rounded-2xl">
                    <p className="text-white/40 text-sm">No hay lotes todavía.</p>
                    <button onClick={() => setShowCrear(true)} className="mt-3 text-brand text-xs font-black uppercase tracking-widest hover:underline">Crear el primero</button>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {visibles.map(l => { const eco = computeLoteEco(l); return (
                        <button key={l.id} onClick={() => setDetailId(l.id)}
                            className="text-left bg-bkg-surface border border-white/[0.06] rounded-2xl p-5 hover:border-brand/30 hover:bg-bkg-hover transition-all group">
                            <div className="flex items-start justify-between gap-3 mb-3">
                                <div className="min-w-0">
                                    <p className="text-base font-black text-white truncate">{l.codigo || 'LOTE (sin código)'}</p>
                                    <p className="text-[11px] text-white/40 mt-0.5">
                                        {l.anio_actuacion ? `${l.anio_actuacion}` : 'Año pendiente'} · {l.ccaa || 'CCAA pendiente'}
                                    </p>
                                </div>
                                <span className={`shrink-0 text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded border ${loteEstadoBadge(l.estado)}`}>
                                    {l.estado}
                                </span>
                            </div>
                            <div className="grid grid-cols-2 gap-3 text-[11px]">
                                <div>
                                    <p className="text-white/30 uppercase tracking-widest font-black text-[9px]">Sujeto Obligado</p>
                                    <p className="text-white/70 truncate">{presName(l.sujeto_obligado) || '— sin asignar'}</p>
                                </div>
                                <div>
                                    <p className="text-white/30 uppercase tracking-widest font-black text-[9px]">Verificador</p>
                                    <p className="text-white/70 truncate">{presName(l.verificador) || '— sin asignar'}</p>
                                </div>
                            </div>
                            <div className={`grid ${canSeeMargin ? 'grid-cols-3' : 'grid-cols-2'} gap-2 mt-3`}>
                                <div className="bg-bkg-base/40 rounded-lg px-2 py-1.5 text-center">
                                    <p className="text-[8px] uppercase tracking-widest font-black text-white/30">Ahorro</p>
                                    <p className="text-[12px] font-black text-white leading-tight">{mwh(eco.ahorroKwh)}</p>
                                    {eco.hasVerif && <p className="text-[8px] font-black text-amber-300 leading-tight mt-0.5">V: {kwh(eco.ahorroKwhVerif)}</p>}
                                </div>
                                <div className="bg-emerald-500/[0.06] rounded-lg px-2 py-1.5 text-center">
                                    <p className="text-[8px] uppercase tracking-widest font-black text-emerald-300/50">Pago cliente</p>
                                    <p className="text-[12px] font-black text-emerald-300 leading-tight">{eur(eco.pagoCliente)}</p>
                                    {eco.hasVerif && <p className="text-[8px] font-black text-amber-300 leading-tight mt-0.5">V: {eur(eco.pagoClienteVerif)}</p>}
                                </div>
                                {canSeeMargin && (
                                    <div className="bg-brand/[0.06] rounded-lg px-2 py-1.5 text-center">
                                        <p className="text-[8px] uppercase tracking-widest font-black text-brand/50">Beneficio</p>
                                        <p className="text-[12px] font-black text-brand leading-tight">{eur(eco.beneficio)}</p>
                                        {eco.hasVerif && eco.beneficioLoteVerif != null && <p className="text-[8px] font-black text-amber-300 leading-tight mt-0.5">V: {eur(eco.beneficioLoteVerif)}</p>}
                                    </div>
                                )}
                            </div>
                            <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between">
                                <span className={`text-[11px] font-black ${l.num_expedientes > 5 ? 'text-amber-400' : 'text-white/60'}`}>
                                    {l.num_expedientes} / 5 expedientes
                                </span>
                                <span className="text-[11px] text-brand/70 group-hover:text-brand font-black uppercase tracking-widest">Gestionar →</span>
                            </div>
                        </button>
                    ); })}
                </div>
            )}

            {showCrear && (
                <CrearLoteModal
                    soList={soList}
                    onClose={() => setShowCrear(false)}
                    onCreated={(nuevo) => { setShowCrear(false); fetchLotes(); setDetailId(nuevo.id); }}
                />
            )}
            {detailId && (
                <LoteDetailModal
                    loteId={detailId}
                    soList={soList}
                    verList={verList}
                    onClose={() => setDetailId(null)}
                    onChanged={fetchLotes}
                    onNavigateExpediente={(expId) => { setDetailId(null); onNavigate?.('expedientes', { expediente_id: expId }); }}
                />
            )}
        </div>
    );
}
