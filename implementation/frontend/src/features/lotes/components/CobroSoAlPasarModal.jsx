import React, { useState } from 'react';
import { createPortal } from 'react-dom';

// ─────────────────────────────────────────────────────────────────────────────
// «¿Ha pagado el S.O.?», pedido JUSTO al pasar el lote a «PTE. PAGO BROKERGY A
// CLIENTE» (o a FINALIZADO) con la factura al S.O. emitida y sin cobrar.
//
// Pasar a ese estado ES decir que el Sujeto Obligado nos ha pagado. Si el cobro no
// se marca, la factura sigue EMITIDA y el cuadro de mando de Facturación la cuenta
// en «Te deben»: el 25/10/2026, F-2026CAE_8, _9 y _10 (LOTE-2026-004, LOTE-2025-003,
// LOTE-2025-001) salían como 183.805 € pendientes aunque los lotes ya se habían
// movido a mano. Se pide la fecha del ingreso en el momento en que se sabe.
//
// Salida siempre: «Todavía no ha pagado» mueve el lote igual (el cuadro lo avisará
// en ámbar hasta marcarlo) y «Cancelar» no mueve nada. Solo ADMIN: el cobro es
// dinero de Brokergy y su ruta es adminOnly.
// ─────────────────────────────────────────────────────────────────────────────

const hoyIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const eur2 = (n) => (Number(n) || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function CobroSoAlPasarModal({ lote, nuevoEstado, total, onCobrar, onSinCobrar, onClose }) {
    const [fecha, setFecha] = useState(hoyIso);
    const [ocupado, setOcupado] = useState(null);       // 'cobrar' | 'sin'
    const [error, setError] = useState('');
    const f = lote?.factura_so || {};

    const hacer = async (que) => {
        if (ocupado) return;
        if (que === 'cobrar' && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) { setError('Indica la fecha del ingreso.'); return; }
        setError(''); setOcupado(que);
        try {
            if (que === 'cobrar') await onCobrar(fecha);
            else await onSinCobrar();
        } catch (err) {
            setError(err?.response?.data?.error || err?.message || 'No se pudo completar.');
            setOcupado(null);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[330] flex items-start justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in overflow-y-auto"
            role="dialog" aria-modal="true" aria-labelledby="cobro-so-al-pasar-tit">
            <div className="bg-bkg-deep border border-white/[0.08] rounded-2xl w-full max-w-md my-12 shadow-2xl">

                <div className="flex items-start justify-between gap-3 p-5 border-b border-white/[0.06]">
                    <div className="min-w-0">
                        <h3 id="cobro-so-al-pasar-tit" className="text-base font-black text-white">¿Ha pagado el S.O. la {f.numero || 'factura'}?</h3>
                        <p className="text-[11px] text-white/40 mt-0.5">
                            {lote?.codigo || 'Lote'} → <span className="text-emerald-300 font-bold">{nuevoEstado}</span>
                        </p>
                    </div>
                    <button type="button" onClick={onClose} disabled={!!ocupado} aria-label="Cancelar"
                        className="p-1.5 text-white/30 hover:text-white transition-colors shrink-0 disabled:opacity-30">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    <p className="text-[12px] text-white/55 leading-relaxed">
                        Pasar a este estado es decir que el Sujeto Obligado ya ha ingresado la factura.
                        Marca aquí la fecha del ingreso: si no, la factura sigue como pendiente de cobro en Facturación.
                    </p>

                    {total != null && (
                        <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
                            <p className="text-[9px] uppercase tracking-[0.2em] font-black text-white/40">Ingreso a cotejar</p>
                            <p className="text-xl font-black text-white mt-0.5">{eur2(total)} <span className="text-[10px] font-black text-white/35 uppercase">con IVA</span></p>
                        </div>
                    )}

                    <label className="block">
                        <span className="block text-[9px] uppercase tracking-widest font-black text-white/30 mb-1">Fecha del ingreso</span>
                        <input type="date" value={fecha} max={hoyIso()} disabled={!!ocupado} onChange={e => setFecha(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') hacer('cobrar'); }}
                            className="w-full bg-bkg-surface border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white focus:border-emerald-400/40 focus:outline-none [color-scheme:dark]" />
                    </label>

                    {error && <p className="text-[11px] text-amber-300">⚠️ {error}</p>}

                    <div className="flex flex-col gap-2 pt-1">
                        <button type="button" onClick={() => hacer('cobrar')} disabled={!!ocupado || !fecha} autoFocus
                            className="w-full px-4 py-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 text-sm font-black hover:bg-emerald-500/30 transition-colors disabled:opacity-50">
                            {ocupado === 'cobrar' ? 'Marcando…' : 'Cobrada: marcarla y pasar el lote'}
                        </button>
                        <button type="button" onClick={() => hacer('sin')} disabled={!!ocupado}
                            className="w-full px-4 py-2 rounded-xl bg-white/[0.04] border border-white/[0.10] text-white/70 text-xs font-black hover:bg-white/[0.08] transition-colors disabled:opacity-50">
                            {ocupado === 'sin' ? 'Pasando…' : 'Todavía no ha pagado: pasar el lote igual'}
                        </button>
                        <button type="button" onClick={onClose} disabled={!!ocupado}
                            className="self-center text-[11px] font-black uppercase tracking-wider text-white/35 hover:text-white/70 disabled:opacity-30 transition-colors mt-1">
                            Cancelar (no cambia el estado)
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}

export default CobroSoAlPasarModal;
