/**
 * La columna «Vía FM» de la tabla de Oportunidades (solo ADMIN).
 *
 * Enseña lo que saldría pidiendo la actuación por la ficha del FACTOR
 * MULTIPLICADOR (Resolución DGPLACE 3/11/2026, BOE-A-2026-23367) frente a la
 * ficha vigente: MWh, bono y la diferencia, y si se podría pedir. Lee el
 * resumen en escalares `datos_calculo.via_fm` (logic/viaFm.js), que el listado
 * trae sin el JSONB entero (regla 22) y que el backend quita a quien no es ADMIN.
 *
 * El violeta es el de los chips «FM» de la calculadora: la misma vía, el mismo color.
 */
import React from 'react';
import { FM_ACS_QUE_HACER } from '../../calculator/logic/res060fc';

// La simulación no lleva el ACS: la MISMA frase que la tarjeta y la propuesta.
const ACS_TXT = {
    supuesto: `⚠ Falta el ACS. ${FM_ACS_QUE_HACER} La cifra FM ya supone que se añade.`,
    sin_scop: `⚠ Falta el ACS. ${FM_ACS_QUE_HACER} Sin SCOP_dhw, la cifra FM es solo la calefacción.`,
};

const eur = (v) => (Number(v) || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const mwh = (v) => `${(Number(v) || 0).toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MWh`;
const conSigno = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${eur(Math.abs(v))}`;

const DCAL_TXT = {
    cee_final: 'D_cal del CEE final',
    cee_inicial: 'D_cal del CEE inicial',
    simulacion: 'D_cal ESTIMADA (sin CEE)',
};

/**
 * En qué situación está una oportunidad respecto a la vía FM. Lo usa el filtro.
 * 'sin' · 'no_aplica' · 'no_elegible' · 'gana' · 'pierde' · 'igual'
 */
export function estadoViaFm(via) {
    if (!via) return 'sin';
    if (via.aplica === false) return 'no_aplica';
    if (via.elegible === false) return 'no_elegible';
    const d = (Number(via.eur_fm) || 0) - (Number(via.eur_vigente) || 0);
    if (d >= 1) return 'gana';
    if (d <= -1) return 'pierde';
    return 'igual';
}

export const FILTRO_VIA_FM = [
    { value: '', label: 'Todas' },
    { value: 'gana', label: 'FM da más' },
    { value: 'elegible', label: 'Elegibles' },
    { value: 'no_elegible', label: 'No elegibles' },
    { value: 'falta_acs', label: 'Elegibles a falta del ACS' },
    { value: 'sin', label: 'Sin calcular' },
];

export function pasaFiltroViaFm(via, filtro) {
    if (!filtro) return true;
    const e = estadoViaFm(via);
    if (filtro === 'elegible') return e === 'gana' || e === 'pierde' || e === 'igual';
    if (filtro === 'falta_acs') return !!via?.acs && (e === 'gana' || e === 'pierde' || e === 'igual');
    return e === filtro;
}

function tituloViaFm(via) {
    if (!via) return 'Sin calcular: se guarda al guardar la oportunidad en la calculadora (o con el relleno de las antiguas).';
    const l = [
        `Vigente: ${mwh(via.mwh_vigente)} · ${eur(via.eur_vigente)}`,
        `Vía FM (${via.ficha || 'FM'}): ${mwh(via.mwh_fm)} · ${eur(via.eur_fm)}`,
    ];
    // Solo viene si la vía FM tiene su propio €/MWh (`caePriceClientFm`).
    if (via.precio_fm) l.push(`Precio: ${via.precio_fm} €/MWh por FM · ${via.precio_vigente} €/MWh vigente`);
    if (via.aplica === false) l.push(`No aplica: ${via.no_aplica}`);
    else {
        l.push(`Diferencia: ${conSigno((Number(via.eur_fm) || 0) - (Number(via.eur_vigente) || 0))}`);
        if (via.elegible === false) l.push(`No se puede pedir: ${via.motivo || 'ver avisos en la calculadora'}`);
    }
    // Sin ACS en la simulación (Fran, 07/11/2026: aviso, no bloqueo).
    if (via.acs) l.push(ACS_TXT[via.acs] || ACS_TXT.supuesto);
    if (via.dcal) l.push(DCAL_TXT[via.dcal] || via.dcal);
    // RES080_FM sin los dos CEE simulados (bomba sola / todo menos la bomba).
    if (via.estimada) l.push('CEE simulados ESTIMADOS desde el inicial y el final');
    if (via.n_avisos) l.push(`${via.n_avisos} aviso${via.n_avisos === 1 ? '' : 's'} que mirar (en la calculadora)`);
    if (via.calculado) l.push(`Calculado el ${via.calculado.split('-').reverse().join('/')}`);
    return l.join('\n');
}

/** Celda de la tabla (escritorio). */
export function ViaFmCelda({ via }) {
    if (!via) return <span className="text-white/20 text-xs" title={tituloViaFm(via)}>—</span>;
    if (via.aplica === false) {
        return <span className="text-[10px] text-white/30 italic" title={tituloViaFm(via)}>no aplica</span>;
    }
    const aprox = via.dcal === 'simulacion' || via.estimada ? '≈' : '';
    const noElegible = via.elegible === false;
    const dif = (Number(via.eur_fm) || 0) - (Number(via.eur_vigente) || 0);
    return (
        <div className="flex flex-col gap-0.5" title={tituloViaFm(via)}>
            <span className={`text-[11px] font-black text-violet-400 font-mono tabular-nums ${noElegible ? 'line-through opacity-50' : ''}`}>
                {aprox}{mwh(via.mwh_fm)}
            </span>
            <span className={`text-[11px] font-black text-violet-400 font-mono tabular-nums ${noElegible ? 'line-through opacity-50' : ''}`}>
                {aprox}{eur(via.eur_fm)}
            </span>
            {noElegible ? (
                <span className="self-start px-1.5 py-px rounded text-[8px] font-black uppercase tracking-wider border border-amber-500/30 bg-amber-500/10 text-amber-400">
                    No elegible
                </span>
            ) : (
                <span className={`text-[10px] font-black font-mono tabular-nums ${dif >= 1 ? 'text-emerald-400' : dif <= -1 ? 'text-white/35' : 'text-white/25'}`}>
                    {Math.abs(dif) < 1 ? '= vigente' : conSigno(dif)}
                </span>
            )}
            {via.acs && !noElegible && (
                <span className="self-start px-1.5 py-px rounded text-[8px] font-black uppercase tracking-wider border border-amber-500/30 bg-amber-500/10 text-amber-400">
                    Falta ACS
                </span>
            )}
        </div>
    );
}

/** Lo mismo en una línea, para la tarjeta del móvil. */
export function ViaFmChip({ via }) {
    if (!via || via.aplica === false) return null;
    const aprox = via.dcal === 'simulacion' || via.estimada ? '≈' : '';
    const noElegible = via.elegible === false;
    const dif = (Number(via.eur_fm) || 0) - (Number(via.eur_vigente) || 0);
    return (
        <span className="inline-flex items-center gap-1 font-black" title={tituloViaFm(via)}>
            <span className="text-violet-400/60 text-[9px]">FM</span>
            <span className={`text-violet-400 ${noElegible ? 'line-through opacity-50' : ''}`}>{aprox}{eur(via.eur_fm)}</span>
            {noElegible
                ? <span className="text-amber-400 text-[9px] uppercase">no elegible</span>
                : Math.abs(dif) >= 1 && <span className={dif > 0 ? 'text-emerald-400' : 'text-white/35'}>({conSigno(dif)})</span>}
            {via.acs && !noElegible && <span className="text-amber-400 text-[9px] uppercase">falta ACS</span>}
        </span>
    );
}
