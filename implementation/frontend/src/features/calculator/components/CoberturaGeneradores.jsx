import React from 'react';
import { pctTexto } from '../logic/coberturaGeneradores';

// ─────────────────────────────────────────────────────────────────────────────
// Qué parte de cada demanda cubre cada generador del CEE, deducido del .xml
// (energía final × rendimiento estacional ÷ demanda), con el SISTEMA POR DEFECTO de
// CE3X —lo que no cubre ningún generador declarado— dicho con su nombre. Va debajo de
// la tabla del ahorro «por vector»: es lo que explica por qué en «otros combustibles»
// aparece un gas natural sin caldera de gas (26RES080_78: estufa de pellets al 40 % de
// la calefacción y el 60 % restante, gas natural por defecto de CE3X al 92 %).
// Misma fuente que el certificado RES080: `results.cobertura` de calculation.js.
// ─────────────────────────────────────────────────────────────────────────────

const fDec = (v, d = 2) => (v === null || v === undefined || !Number.isFinite(Number(v)))
    ? '—'
    : Number(v).toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });

function Fase({ titulo, cob, emiOtrosDeclaradas, acento }) {
    if (!cob?.servicios?.length) return null;
    const filas = cob.servicios.flatMap((s) => s.filas.map((f, i) => ({ ...f, servicio: s, primera: i === 0, n: s.filas.length })));
    const emiOtros = filas.filter((f) => f.vector !== 'Electricidad peninsular' && f.emisiones !== null)
        .reduce((a, f) => a + f.emisiones, 0);
    const hayOtros = filas.some((f) => f.vector !== 'Electricidad peninsular');
    return (
        <div className="rounded-xl overflow-hidden border border-slate-300">
            <div className={`px-3 py-2 text-[10px] font-black uppercase tracking-widest ${acento}`}>{titulo}</div>
            <div className="overflow-x-auto">
                <table className="w-full border-collapse text-[11px] min-w-[640px]">
                    <thead>
                        <tr className="bg-slate-800 text-white/80 uppercase text-[9px] tracking-wider">
                            <th className="text-left px-3 py-2">Servicio</th>
                            <th className="text-left px-3 py-2">Generador</th>
                            <th className="text-left px-3 py-2">Vector</th>
                            <th className="px-2 py-2 text-center">% demanda</th>
                            <th className="px-2 py-2 text-center">Rend. estac.</th>
                            <th className="px-2 py-2 text-center">E. final<br />kWh/m²·año</th>
                            <th className="px-2 py-2 text-center">Factor<br />de paso</th>
                            <th className="px-2 py-2 text-center">Emisiones<br />kgCO₂/m²·año</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filas.map((f, i) => (
                            <tr key={i} className={`border-b border-slate-200 ${f.porDefecto ? 'bg-amber-50' : 'bg-white'}`}>
                                {f.primera && (
                                    <td rowSpan={f.n} className="px-3 py-1.5 align-top font-bold text-slate-700 bg-slate-50 border-r border-slate-200">
                                        {f.servicio.etiqueta}
                                        <div className="font-normal text-[10px] text-slate-500">demanda {fDec(f.servicio.demanda)}</div>
                                        {f.servicio.cuadra === false && (
                                            <div className="font-bold text-[10px] text-red-600">suma {pctTexto(f.servicio.suma)}</div>
                                        )}
                                    </td>
                                )}
                                <td className="px-3 py-1.5 text-slate-800">
                                    {f.porDefecto
                                        ? <span className="font-bold text-amber-800">{f.generador}</span>
                                        : (f.generador || '—')}
                                </td>
                                <td className="px-3 py-1.5 text-slate-600">{f.vector}</td>
                                <td className={`px-2 py-1.5 text-center font-mono font-black ${f.porDefecto ? 'text-amber-800' : 'text-slate-900'}`}>{pctTexto(f.pct)}</td>
                                <td className="px-2 py-1.5 text-center font-mono text-slate-700">{f.eta ? `${fDec(f.eta * 100, 1)} %` : '—'}</td>
                                <td className="px-2 py-1.5 text-center font-mono text-slate-800">{fDec(f.energia)}</td>
                                <td className="px-2 py-1.5 text-center font-mono text-slate-500">{fDec(f.factor, 3)}</td>
                                <td className="px-2 py-1.5 text-center font-mono text-slate-800">{fDec(f.emisiones)}</td>
                            </tr>
                        ))}
                        {hayOtros && (
                            <tr className="bg-slate-100">
                                <td colSpan={7} className="px-3 py-1.5 text-right text-[10px] text-slate-600">
                                    Emisiones por otros combustibles (suma) · el certificado declara {fDec(emiOtrosDeclaradas)}
                                </td>
                                <td className="px-2 py-1.5 text-center font-mono font-black text-slate-900">{fDec(emiOtros)}</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export function CoberturaGeneradores({ res080 }) {
    const cob = res080?.cobertura;
    if (!cob || (!cob.inicial && !cob.final)) return null;
    const decl = res080?.contraste?.declaradas || {};

    // Lo que hay que leer antes que la tabla: qué parte de la calefacción (o del frío)
    // no la cubre ningún equipo y la pone CE3X por defecto.
    const avisos = [];
    for (const [fase, c] of [['inicial', cob.inicial], ['final', cob.final]]) {
        for (const s of c?.servicios || []) {
            for (const f of s.filas.filter((x) => x.porDefecto)) {
                avisos.push(`CEE ${fase} · ${s.etiqueta.toLowerCase()}: ${pctTexto(f.pct)} sin generador declarado → ${f.generador.replace(/^Sistema ficticio por defecto · /, '').toLowerCase()} (${f.vector}${f.eta ? `, ${fDec(f.eta * 100, 0)} %` : ''})`);
            }
        }
    }

    return (
        <div className="mt-6 space-y-3">
            <div className="text-[10px] font-black text-white/70 uppercase tracking-widest">Demanda cubierta por cada generador · leída del .xml</div>
            <p className="text-[11px] text-white/50 leading-relaxed">
                % = energía final del vector × rendimiento estacional ÷ demanda del servicio. Lo que no cubre
                ningún generador declarado lo calcula CE3X con su <b className="text-white/80">sistema ficticio por defecto</b> (calefacción:
                caldera de gas natural al 92 %; refrigeración: máquina frigorífica eléctrica de rendimiento 2,0). Ese
                consumo forma parte de la energía final del certificado y <b className="text-white/80">entra en el ahorro</b>.
            </p>
            {avisos.length > 0 && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-0.5">
                    <div className="text-[10px] font-black text-amber-300 uppercase tracking-widest mb-1">Sistema ficticio por defecto</div>
                    {avisos.map((a, i) => <div key={i} className="text-[11px] text-white/70">{a}</div>)}
                </div>
            )}
            <Fase titulo="CEE inicial · antes de la actuación" cob={cob.inicial} emiOtrosDeclaradas={decl.otrosIni} acento="bg-slate-700 text-white" />
            <Fase titulo="CEE final · después de la actuación" cob={cob.final} emiOtrosDeclaradas={decl.otrosFin} acento="bg-lime-400 text-slate-900" />
        </div>
    );
}
