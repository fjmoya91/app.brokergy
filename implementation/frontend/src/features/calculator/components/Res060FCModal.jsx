import React from 'react';
import { createPortal } from 'react-dom';

// Popup de desglose de la ficha RES060FC (propuesta de nueva normativa).
// Estilo del prototipo `prototypes/calculadora-cae-res060fc`: panel oscuro, acento
// naranja→lima, número en degradado, badge TECHO TÉCNICO / TOPE 70%·CEF, comparativa
// con barras y desglose del cálculo. Solo lectura.
//
// Se renderiza por PORTAL a document.body: cualquier ancestro con `backdrop-filter`
// (p. ej. el panel económico sticky del expediente) crea un containing block que
// atraparía el `position: fixed` y dejaría el modal recortado y sin scroll. El portal
// lo saca de ahí para que se posicione respecto a la ventana.

const ORANGE = '#F39200';
const LIME = '#A9CF3D';
const PANEL = '#20242a';
const GRAD = 'linear-gradient(90deg, #F39200, #A9CF3D)';
const INK_MUTED = '#aab0a2';
const LINE = 'rgba(255,255,255,0.10)';

const n0 = (v) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(Math.round(v || 0));
const n1 = (v) => new Intl.NumberFormat('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v || 0);
const n2 = (v) => new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v || 0);

function GradientText({ children, style, className }) {
    return (
        <span className={className} style={{ background: GRAD, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', ...style }}>
            {children}
        </span>
    );
}

export function Res060FCModal({ isOpen, onClose, result, inputs }) {
    if (!isOpen || !result?.res060fc) return null;

    const fc = result.res060fc;
    const fin = result.financialsRes060FC;
    const actKwh = result.savings?.savingsKwh || 0;
    const actEur = result.financials?.caeBonus || 0;
    const fcEur = fin?.caeBonus || 0;
    const fcProfit = fin?.profitBrokergy;
    const actProfit = result.financials?.profitBrokergy;
    const mx = Math.max(fc.cae, actKwh, 1);
    const ratio = actKwh > 0 ? fc.cae / actKwh : 0;
    const diffKwh = fc.cae - actKwh;
    const diffEur = fcEur - actEur;
    const acsIncluido = inputs?.changeAcs || inputs?.incluir_acs;

    const entradas = [
        ['Provincia', fc.provinciaNombre],
        ['Año', fc.yearLabel],
        ['Tipología', fc.tipologiaLabel],
        ['Superficie', `${n0(fc.superficie)} m²`],
        ['SCOP calef.', n2(parseFloat(inputs?.scopHeating) || 0)],
        ['SCOP ACS', acsIncluido ? n2(parseFloat(inputs?.scopAcs) || 0) : '—'],
        ['D_ACS', `${n0(parseFloat(inputs?.dacs) || 2731.4)} kWh`],
        ['Precio CAE', `${n0(parseFloat(inputs?.caePriceClient) || 0)} €/MWh`],
    ];

    const rows = [
        ['Valor Anexo IV', `${n1(fc.q)} kWh/m²·año`],
        ['η_i caldera (Anexo II)', `${n0(fc.eta * 100)} %`],
        ['f_C aplicado', n2(fc.fc)],
        ['Demanda (Anexo IV × S)', `${n0(fc.dem)} kWh/año`],
        ['Ahorro calefacción', `${n0(fc.ahc)} kWh/año`],
        ['Ahorro ACS × f_C', `${n0(fc.ahaFC)} kWh/año`],
        ['AES (techo técnico)', `${n0(fc.aes)} kWh/año`],
        ['CEF previo (consumo actual)', `${n0(fc.cef)} kWh/año`],
        ['Tope 0,70·CEF', `${n0(fc.tope)} kWh/año`],
    ];

    const modal = (
        <div
            className="fixed inset-0 z-[9999] flex items-start justify-center overflow-y-auto animate-fade-in"
            style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)', padding: '3.5vh 16px 32px' }}
            onClick={onClose}
        >
            <div
                className="rounded-2xl overflow-hidden shadow-2xl relative animate-scale-up w-full max-w-md my-auto"
                style={{ background: PANEL, boxShadow: '0 24px 80px rgba(0,0,0,0.6)' }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Acento superior naranja → lima */}
                <div style={{ height: 4, background: GRAD }} />

                {/* Header */}
                <div className="px-5 py-3 flex justify-between items-center" style={{ borderBottom: `1px solid ${LINE}` }}>
                    <h3 className="font-black uppercase tracking-widest flex items-center gap-2.5 text-[13px]" style={{ color: '#ffffff' }}>
                        <span className="w-6 h-6 rounded-md flex items-center justify-center text-xs" style={{ background: GRAD }}>⚡</span>
                        Ficha RES060FC
                    </h3>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-full hover:bg-white/10 transition-all hover:rotate-90"
                        style={{ color: INK_MUTED }}
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="p-5 space-y-5">
                    {/* HERO: número grande + badge + comparación inmediata */}
                    <div>
                        <div className="flex items-baseline gap-2 flex-wrap">
                            <GradientText style={{ fontSize: '34px', fontWeight: 800, lineHeight: 1 }} className="tabular-nums">
                                {n0(fc.cae)}
                            </GradientText>
                            <span className="text-[11px] font-bold uppercase" style={{ color: 'rgba(255,255,255,0.7)' }}>kWh/año</span>
                            <span className="text-lg font-black tabular-nums ml-1" style={{ color: LIME }}>· {n0(fcEur)} €</span>
                        </div>
                        <div
                            className="inline-block mt-2 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest"
                            style={{ background: fc.limitedByTope ? ORANGE : LIME, color: fc.limitedByTope ? '#2b1600' : '#1b2b06' }}
                        >
                            {fc.limitedByTope ? 'TOPE 70%·CEF' : 'TECHO TÉCNICO'}
                        </div>
                    </div>

                    {/* COMPARATIVA (lo primero que importa: cuánto sube vs RES060 actual) */}
                    <div className="rounded-xl p-3.5" style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${LINE}` }}>
                        <div className="flex items-center justify-between mb-2.5">
                            <span className="text-[9px] font-black uppercase tracking-[0.2em]" style={{ color: LIME }}>vs RES060 actual</span>
                            <span className="text-lg font-black tabular-nums" style={{ color: diffEur >= 0 ? LIME : '#f87171' }}>
                                {ratio > 0 ? `${n2(ratio)}×` : '—'}
                            </span>
                        </div>
                        <div className="space-y-1.5">
                            <div className="flex items-center gap-2">
                                <span className="text-[9px] font-bold uppercase tracking-widest w-14 shrink-0" style={{ color: INK_MUTED }}>FC</span>
                                <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.10)' }}>
                                    <div style={{ height: '100%', borderRadius: 8, background: GRAD, width: `${(100 * fc.cae / mx)}%` }} />
                                </div>
                                <span className="text-[11px] font-black tabular-nums w-24 text-right" style={{ color: '#ffffff' }}>{n0(fc.cae / 1000)} <span style={{ color: LIME }}>· {n0(fcEur)}€</span></span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-[9px] font-bold uppercase tracking-widest w-14 shrink-0" style={{ color: INK_MUTED }}>Actual</span>
                                <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.10)' }}>
                                    <div style={{ height: '100%', borderRadius: 8, background: '#9aa08c', width: `${(100 * actKwh / mx)}%` }} />
                                </div>
                                <span className="text-[11px] font-black tabular-nums w-24 text-right" style={{ color: 'rgba(255,255,255,0.7)' }}>{n0(actKwh / 1000)} · {n0(actEur)}€</span>
                            </div>
                        </div>
                        <div className="mt-2.5 pt-2.5 text-[10px] font-bold text-center" style={{ borderTop: `1px solid ${LINE}`, color: diffEur >= 0 ? LIME : '#f87171' }}>
                            {diffKwh >= 0 ? '+' : ''}{n0(diffKwh)} kWh/año · {diffEur >= 0 ? '+' : ''}{n0(diffEur)} € de bono al cliente
                        </div>
                        {fcProfit !== undefined && actProfit !== undefined && (
                            <div className="mt-1.5 text-[10px] font-bold text-center" style={{ color: INK_MUTED }}>
                                Ganancia Brokergy: <span style={{ color: '#ffffff' }}>{n0(fcProfit)} €</span> <span style={{ color: 'rgba(255,255,255,0.4)' }}>(actual {n0(actProfit)} €)</span>
                            </div>
                        )}
                    </div>

                    {/* ENTRADAS (chips compactos) */}
                    <div>
                        <h4 className="text-[9px] font-black uppercase tracking-[0.2em] mb-2" style={{ color: ORANGE }}>Entradas del expediente</h4>
                        <div className="grid grid-cols-4 gap-x-3 gap-y-2">
                            {entradas.map(([k, v]) => (
                                <div key={k}>
                                    <div className="text-[8px] font-bold uppercase tracking-wide truncate" style={{ color: INK_MUTED }}>{k}</div>
                                    <div className="text-[11px] font-bold tabular-nums truncate" style={{ color: '#ffffff' }} title={String(v)}>{v}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* DESGLOSE (tabla condensada) */}
                    <div>
                        <h4 className="text-[9px] font-black uppercase tracking-[0.2em] mb-1.5" style={{ color: ORANGE }}>Desglose del cálculo</h4>
                        <table className="w-full text-[12px]">
                            <tbody>
                                {rows.map(([k, v]) => (
                                    <tr key={k} style={{ borderBottom: `1px solid ${LINE}` }}>
                                        <td className="py-1.5 pr-2" style={{ color: INK_MUTED }}>{k}</td>
                                        <td className="py-1.5 text-right font-mono font-bold tabular-nums whitespace-nowrap" style={{ color: '#ffffff' }}>{v}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <div className="mt-2 flex items-baseline justify-between gap-3 flex-wrap">
                            <span className="text-[10px] font-mono" style={{ color: INK_MUTED }}>mín({n0(fc.aes)} ; {n0(fc.tope)}) × {n2(fc.fc)}</span>
                            <span className="text-base font-black" style={{ color: LIME }}>= {n0(fcEur)} €</span>
                        </div>
                    </div>

                    <p className="text-[9.5px] italic leading-relaxed" style={{ color: INK_MUTED }}>
                        <b style={{ color: fc.limitedByTope ? ORANGE : LIME }}>{fc.limitedByTope ? 'Tope 70%·CEF' : 'Techo técnico'}:</b>{' '}
                        {fc.limitedByTope
                            ? 'lo limita el consumo real (CEF); mejorar SCOP o demanda no da más CAE.'
                            : 'importan demanda, superficie, η y SCOP.'}{' '}
                        Demanda del Anexo IV con el mismo η y SCOP que el cálculo actual. Borrador en consulta pública: puede cambiar.
                    </p>
                </div>
            </div>
        </div>
    );

    return createPortal(modal, document.body);
}
