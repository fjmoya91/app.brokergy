import React from 'react';
import { createPortal } from 'react-dom';
import { precioCaeFm, precioCaeRes080 } from '../logic/calculation';

// Popup de desglose de la vía del FACTOR MULTIPLICADOR (Resolución publicada,
// BOE-A-2026-23367): RES060_FM, o la RES09x_FM de la zona si hay hibridación
// (logic/res060fc.js; conserva el nombre de cuando era el borrador «FC»).
// Estilo del prototipo `prototypes/calculadora-cae-res060fc`: panel oscuro, acento
// naranja→lima, número en degradado, badge de DÓNDE sale la D_cal (CEE final,
// inicial o estimada), comparativa con barras, desglose del cálculo y los AVISOS de
// elegibilidad, que van siempre con la cifra (cupo, fechas, requisitos). Solo lectura.
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
    const acsIncluido = fc.conAcs ?? (inputs?.changeAcs || inputs?.incluir_acs);
    // Sin ACS en la simulación, la vía FM lo suma COMO SI se añadiera (logic/res060fc.js).
    const acsSupuesto = !acsIncluido && !!fc.acsSupuesto;
    const acsEnCifra = acsIncluido || acsSupuesto;
    const avisos = fc.avisos || [];
    // De dónde sale la D_cal: la ficha usa la del CEE POSTERIOR.
    const dcalDe = {
        cee_final: 'del CEE final',
        cee_inicial: 'del CEE inicial',
        simulacion: 'estimada (sin CEE)',
    }[fc.dcalFuente] || 'sin dato';
    // RES080_FM (logic/res080fm.js): el ahorro del RES080 × el cociente de los simulados.
    const es080 = fc.ficha === 'RES080_FM';
    const simDe = (f) => ({ cee: 'su CEE', kwh: 'tecleado' }[f] || (fc.estimada ? 'estimado' : 'sin dato'));
    const dcalDelCee = es080 ? !fc.estimada : (fc.dcalFuente === 'cee_final' || fc.dcalFuente === 'cee_inicial');
    const n3 = (v) => new Intl.NumberFormat('es-ES', { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(v || 0);

    const entradas = es080 ? [
        ['Tipología', fc.tipologiaLabel],
        ['Superficie', `${n0(fc.superficie)} m²`],
        ['D_cal previo', `${n1(fc.dcalInicial)} kWh/m²`],
        ['D_cal posterior', `${n1(fc.dcalFinal)} kWh/m²`],
        ['Precio CAE', precioCaeRes080(inputs) ? `${n0(precioCaeRes080(inputs))} €/MWh` : '—'],
    ] : [
        ['Provincia', fc.provinciaNombre || '—'],
        ['Año', fc.clase !== 'unifamiliar' ? '—' : (fc.anioSupuesto ? `${fc.yearLabel} (supuesto)` : fc.yearLabel)],
        ['Tipología', fc.tipologiaLabel],
        ['Superficie', `${n0(fc.superficie)} m²`],
        ['SCOP calef.', n2(parseFloat(inputs?.scopHeating) || 0)],
        ['SCOP ACS', acsEnCifra ? `${n2(fc.scopAcs || parseFloat(inputs?.scopAcs) || 0)}${acsSupuesto ? ' (supuesto)' : ''}` : '—'],
        ['d_ACS', acsEnCifra ? `${fc.dAcsEspecifica} kWh/m²${acsSupuesto ? ' (supuesto)' : ''}` : 'sin ACS'],
        // El de la vía FM: su casilla, y sin teclear el general (precioCaeFm).
        ['Precio CAE', `${n0(precioCaeFm(inputs))} €/MWh`],
    ];

    const rows = es080 ? [
        ['EF_i · CEE previo', `${n0(fc.efI)} kWh/año`],
        ['EF_f · CEE posterior', `${n0(fc.efF)} kWh/año`],
        ['EF_i − EF_f (el ahorro RES080 vigente)', `${n0(fc.ahorroVigente)} kWh/año`],
        [`EF_simBC · solo la bomba (${simDe(fc.simBCFuente)})`, `${n0(fc.efSimBC)} kWh/año`],
        [`EF_simRest · todo menos la bomba (${simDe(fc.simRestFuente)})`, `${n0(fc.efSimRest)} kWh/año`],
        ['f_M', n2(fc.fm)],
        ['(f_M·EF_simBC + EF_simRest) / (EF_simBC + EF_simRest)', fc.factor ? n3(fc.factor) : '—'],
        ...(fc.factorAhorros ? [['Referencia: ponderando con los ahorros', `${n3(fc.factorAhorros)} · ${n0(fc.caeAhorros)} kWh`]] : []),
    ] : [
        [`D_cal (${dcalDe})`, `${n1(fc.dcalBruta)} kWh/m²·año`],
        ...(fc.dcalTope != null ? [[`Tope unifamiliar: 2 × Anexo IV (${n1(fc.dcalRef)})`, `${n1(fc.dcalTope)} kWh/m²·año${fc.limitadoPorTabla ? ' · aplicado' : ''}`]] : []),
        [`η_i caldera (Anexo II publicado)${fc.etaApp && Math.abs(fc.eta - fc.etaApp) > 1e-9 ? ` · vigente ${n0(fc.etaApp * 100)} %` : ''}`, `${n0(fc.eta * 100)} %`],
        [`f_M${fc.ficha?.endsWith('-S') ? ' (vulnerable × 1,5)' : ''}`, n2(fc.fm)],
        ['D_cal × S', `${n0(fc.dem)} kWh/año`],
        [`D_ACS (${acsEnCifra ? `${fc.dAcsEspecifica} × S${acsSupuesto ? ', si se añade el ACS' : ''}` : 'sin ACS'})`, `${n0(fc.dacs)} kWh/año`],
        ['Ahorro calefacción', `${n0(fc.ahc)} kWh/año`],
        ['Ahorro ACS', `${n0(fc.aha)} kWh/año`],
        ...(fc.hibridacion ? [[`C_b (Anexo V, zona ${fc.zonaCb}, ${fc.fuenteBomba})`, n3(fc.cb)]] : []),
        [fc.hibridacion ? 'Ahorro × C_b (sin f_M)' : 'Ahorro (sin f_M)', `${n0(fc.aes)} kWh/año`],
    ];
    const TONO = {
        bloquea: { c: '#f87171', bg: 'rgba(248,113,113,0.10)', t: 'No se puede pedir' },
        aviso: { c: ORANGE, bg: 'rgba(243,146,0,0.10)', t: 'Ojo' },
        info: { c: INK_MUTED, bg: 'rgba(255,255,255,0.03)', t: 'A cumplir' },
    };

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
                        Vía FM · {fc.ficha || 'RES060_FM'}
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
                        <div className="flex flex-wrap gap-1.5 mt-2">
                            <div
                                className="inline-block px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest"
                                style={{ background: dcalDelCee ? LIME : ORANGE, color: dcalDelCee ? '#1b2b06' : '#2b1600' }}
                            >
                                {es080 ? (fc.estimada ? 'SIMULADOS ESTIMADOS' : 'SIMULADOS DE LOS CEE') : `D_CAL ${dcalDe.toUpperCase()}`}
                            </div>
                            {fc.limitadoPorTabla && (
                                <div className="inline-block px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest" style={{ background: ORANGE, color: '#2b1600' }}>
                                    TOPE 2×ANEXO IV
                                </div>
                            )}
                            {fc.elegible === false && (
                                <div className="inline-block px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest" style={{ background: '#f87171', color: '#2b0606' }}>
                                    NO ELEGIBLE
                                </div>
                            )}
                        </div>
                    </div>

                    {/* LO QUE IMPIDE PEDIRLO o cambia la cifra: antes que la comparativa */}
                    {avisos.some((a) => a.tono !== 'info') && (
                        <div className="space-y-1.5">
                            {avisos.filter((a) => a.tono !== 'info').map((a, i) => (
                                <div key={i} className="rounded-lg px-3 py-2 text-[11px] leading-snug" style={{ background: TONO[a.tono].bg, borderLeft: `3px solid ${TONO[a.tono].c}`, color: '#ffffff' }}>
                                    <b style={{ color: TONO[a.tono].c }}>{TONO[a.tono].t}: </b>{a.texto}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* COMPARATIVA (lo primero que importa: cuánto sube vs la ficha vigente) */}
                    <div className="rounded-xl p-3.5" style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${LINE}` }}>
                        <div className="flex items-center justify-between mb-2.5">
                            <span className="text-[9px] font-black uppercase tracking-[0.2em]" style={{ color: LIME }}>vs ficha vigente</span>
                            <span className="text-lg font-black tabular-nums" style={{ color: diffEur >= 0 ? LIME : '#f87171' }}>
                                {ratio > 0 ? `${n2(ratio)}×` : '—'}
                            </span>
                        </div>
                        <div className="space-y-1.5">
                            <div className="flex items-center gap-2">
                                <span className="text-[9px] font-bold uppercase tracking-widest w-14 shrink-0" style={{ color: INK_MUTED }}>FM</span>
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
                        <h4 className="text-[9px] font-black uppercase tracking-[0.2em] mb-2" style={{ color: ORANGE }}>{es080 ? 'Entradas' : 'Entradas del expediente'}</h4>
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
                            <span className="text-[10px] font-mono" style={{ color: INK_MUTED }}>
                                {es080 ? `${n0(fc.ahorroVigente)} × ${fc.factor ? n3(fc.factor) : '—'}` : `${n0(fc.aes)} × ${n2(fc.fm)}`} = {n0(fc.cae)} kWh
                            </span>
                            <span className="text-base font-black" style={{ color: LIME }}>{n0(fcEur)} €</span>
                        </div>
                    </div>

                    {/* LO QUE HAY QUE CUMPLIR (siempre) */}
                    {avisos.some((a) => a.tono === 'info') && (
                        <div>
                            <h4 className="text-[9px] font-black uppercase tracking-[0.2em] mb-1.5" style={{ color: ORANGE }}>Lo que pide la Resolución</h4>
                            <ul className="space-y-1">
                                {avisos.filter((a) => a.tono === 'info').map((a, i) => (
                                    <li key={i} className="text-[10.5px] leading-snug" style={{ color: INK_MUTED }}>· {a.texto}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <p className="text-[9.5px] italic leading-relaxed" style={{ color: INK_MUTED }}>
                        {es080 ? (
                            <><b style={{ color: dcalDelCee ? LIME : ORANGE }}>{dcalDelCee ? 'Simulados de los CEE' : 'Simulados estimados'}:</b>{' '}
                            {dcalDelCee
                                ? 'EF_simBC y EF_simRest salen de los dos CEE simulados (docs. 10 y 11), con la misma herramienta que el previo.'
                                : 'sin los dos CEE simulados se estiman desde el previo y el posterior: la bomba con la demanda del previo, la envolvente con la caldera del previo. La cifra cambiará con ellos.'}{' '}
                            Fórmula LITERAL de la Resolución (pondera con consumos: FAQ 4).{' '}</>
                        ) : (<><b style={{ color: dcalDelCee ? LIME : ORANGE }}>{dcalDelCee ? 'D_cal del CEE' : 'D_cal estimada'}:</b>{' '}
                        {dcalDelCee
                            ? 'la ficha toma la D_cal y la S del CEE posterior (el final; sin él, el inicial, que en nuestros finales es la misma).'
                            : 'sin CEE cargado se usa la demanda de la simulación; la cifra cambiará con el CEE.'}{' '}
                        Sin tope de CEF y con el mismo SCOP que el cálculo vigente.</>)} Resolución publicada en el BOE del 7/11/2026 (BOE-A-2026-23367): se presenta desde el 15/01/2027, con cupo por orden de resolución.
                    </p>
                </div>
            </div>
        </div>
    );

    return createPortal(modal, document.body);
}
