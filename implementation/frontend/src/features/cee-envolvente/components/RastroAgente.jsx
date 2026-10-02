// ─────────────────────────────────────────────────────────────────────────────
// Lo que hizo el AGENTE IA y lo que queda POR CONFIRMAR, dentro de la ventana.
//
// El agente guarda su trabajo con la MISMA forma que la ventana, así que todo
// lo suyo se abre y se cambia aquí. Lo que faltaba era ENTENDERLO: cuándo lo
// hizo, qué avisó y dónde está lo pendiente. El «4 medidas por confirmar» de
// la cabecera era un número sin salida; ahora lleva a cada una.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react';

const fmt = (n) => (Number.isFinite(Number(n)) ? Number(n).toFixed(2).replace('.', ',') : '—');
const fecha = (iso) => {
    if (!iso) return null;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null
        : d.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

/**
 * La banda «Lo ha preparado el Agente IA». Una línea; los avisos, a demanda.
 * Desaparece cuando todo está confirmado y no quedan avisos: entonces ya es
 * trabajo revisado, no un borrador de la máquina.
 */
export function BandaAgenteIa({ sello, pendientes, onPendientes, onCroquis, croquis }) {
    const [abierta, setAbierta] = useState(null);     // null | 'avisos' | 'decisiones'
    if (!sello) return null;
    const avisos = sello.avisos || [];
    const decisiones = sello.decisiones || [];
    const alternar = (que) => setAbierta(v => (v === que ? null : que));
    return (
        <div className="rounded-lg border border-violet-400/35 bg-violet-400/[0.07] px-3 py-2 text-[12px] text-white/80">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span className="font-bold text-violet-200">🤖 Lo ha preparado el Agente IA</span>
                {fecha(sello.terminado_at) && <span className="text-white/50">{fecha(sello.terminado_at)}</span>}
                {pendientes > 0 && (
                    <button type="button" onClick={onPendientes}
                            className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5
                                       font-bold text-amber-200 hover:brightness-125">
                        {pendientes} por confirmar →
                    </button>
                )}
                {decisiones.length > 0 && (
                    <button type="button" onClick={() => alternar('decisiones')}
                            className="text-violet-200/90 underline-offset-2 hover:underline">
                        🧭 Cómo lo ha hecho ({decisiones.length}) {abierta === 'decisiones' ? '▾' : '▸'}
                    </button>
                )}
                {avisos.length > 0 && (
                    <button type="button" onClick={() => alternar('avisos')}
                            className="text-amber-200/90 underline-offset-2 hover:underline">
                        ⚠ {avisos.length} aviso{avisos.length === 1 ? '' : 's'} {abierta === 'avisos' ? '▾' : '▸'}
                    </button>
                )}
                <span className="ml-auto flex flex-wrap items-center gap-2">
                    <button type="button" onClick={onCroquis} disabled={croquis === 'haciendo'}
                            className="rounded-md border border-white/15 px-2 py-0.5 font-bold
                                       hover:bg-white/[0.06] disabled:opacity-50">
                        {croquis === 'haciendo' ? 'Preparando el croquis…' : '📐 Croquis PDF'}
                    </button>
                    {sello.fichero_link && (
                        <a href={sello.fichero_link} target="_blank" rel="noreferrer"
                           className="rounded-md border border-white/15 px-2 py-0.5 font-bold hover:bg-white/[0.06]">
                            📄 .cex
                        </a>
                    )}
                    {sello.carpeta_link && (
                        <a href={sello.carpeta_link} target="_blank" rel="noreferrer"
                           className="rounded-md border border-white/15 px-2 py-0.5 font-bold hover:bg-white/[0.06]">
                            📁 Carpeta
                        </a>
                    )}
                </span>
            </div>
            {abierta && (
                <ul className="mt-2 flex flex-col gap-1 border-t border-white/10 pt-2">
                    {(abierta === 'avisos' ? avisos : decisiones).map((a, i) => (
                        <li key={i} className={`border-l-2 pl-2 text-[11.5px] leading-snug text-white/75
                                                ${abierta === 'avisos' ? 'border-amber-400/60' : 'border-violet-400/60'}`}>{a}</li>
                    ))}
                </ul>
            )}
            <p className="mt-1 text-[11px] text-white/45">
                Todo lo suyo está en el plano y se cambia como cualquier otra cosa: se guarda solo.
                Luego «Generar .cex» lo vuelve a escribir (y rehace el croquis).
            </p>
        </div>
    );
}

/**
 * La LISTA de lo pendiente: cada línea lleva a su pared (o a su planta, si es
 * un lucernario). Se confirma en el panel de la pared con «✓ OK».
 */
export function ListaPendientes({ items, onIr, onCerrar }) {
    if (!items?.length) {
        return (
            <div className="rounded-lg border border-emerald-400/30 bg-emerald-400/[0.06] px-3 py-2 text-[12px] text-emerald-200">
                ✓ No queda nada por confirmar.
                <button type="button" onClick={onCerrar} className="ml-3 text-white/50 hover:text-white/80">cerrar</button>
            </div>
        );
    }
    return (
        <div className="rounded-lg border border-amber-400/35 bg-amber-400/[0.05] px-3 py-2 text-[12px]">
            <div className="mb-1.5 flex items-center gap-2">
                <b className="text-amber-200">Por confirmar · {items.length}</b>
                <span className="text-white/45">pulsa uno para ir a su pared; en su panel, «✓ OK» lo da por bueno</span>
                <button type="button" onClick={onCerrar} className="ml-auto text-white/50 hover:text-white/80">✕</button>
            </div>
            <ul className="grid grid-cols-1 gap-1 md:grid-cols-2">
                {items.map(it => (
                    <li key={it.clave}>
                        <button type="button" onClick={() => onIr(it)}
                                className="w-full rounded-md border border-white/10 bg-white/[0.02] px-2 py-1.5 text-left
                                           hover:border-amber-400/50 hover:bg-amber-400/[0.08]">
                            <span className="font-bold text-amber-200">{it.hueco}</span>
                            <span className="text-white/70"> · {it.lucernario ? 'lucernario' : it.tipo === 'puerta' ? 'puerta' : 'ventana'}
                                {' '}{fmt(it.ancho)} × {fmt(it.alto)} m</span>
                            <span className="text-white/45"> · {it.plantaNombre} · {it.pared}</span>
                            {it.por_que && <span className="block text-[11px] leading-snug text-white/40">{it.por_que}</span>}
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
}
