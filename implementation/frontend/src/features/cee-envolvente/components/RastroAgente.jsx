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
 * «Lo ha preparado el Agente IA», como UNA píldora de la tira de estado.
 *
 * POR QUÉ NO ES UNA BANDA (2026-10-08): era una franja entera encima de la tira
 * de estado, y las dos decían lo mismo —«12 por confirmar →» en la banda y
 * «12 medidas por confirmar ▾» en la tira—, con un párrafo fijo debajo que se
 * leía la primera vez y después solo empujaba el plano hacia abajo. Lo que
 * hace falta ver de un vistazo es QUE lo hizo el agente, CUÁNDO y si dejó
 * AVISOS; el resto (cómo lo hizo, sus avisos uno a uno, el .cex y la carpeta)
 * se abre debajo con `DetalleAgenteIa`. Lo pendiente lo cuenta la tira, una vez.
 */
export function PildoraAgenteIa({ sello, abierto, onAlternar }) {
    if (!sello) return null;
    const avisos = sello.avisos?.length || 0;
    return (
        <button type="button" onClick={onAlternar} aria-expanded={!!abierto}
                title="Lo que hizo el Agente IA: cómo lo ha hecho, sus avisos, el .cex y la carpeta"
                className="inline-flex items-center gap-1.5 rounded-full border border-violet-400/40
                           bg-violet-400/10 px-2.5 py-1 leading-none text-violet-100
                           transition hover:brightness-125">
            <span aria-hidden>🤖</span>
            <b className="font-bold text-violet-200">Agente IA</b>
            {fecha(sello.terminado_at) && <span className="text-white/50">{fecha(sello.terminado_at)}</span>}
            {avisos > 0 && (
                <span className="font-bold text-amber-200" title={`${avisos} aviso${avisos === 1 ? '' : 's'} del agente`}>
                    ⚠ {avisos}
                </span>
            )}
            <span className="text-white/45">{abierto ? '▾' : '▸'}</span>
        </button>
    );
}

/**
 * Lo del agente, ABIERTO: cómo lo ha hecho, sus avisos, el `.cex` y la carpeta.
 * Se abre desde `PildoraAgenteIa` y vive donde la lista de pendientes: debajo
 * de la tira, sin mover nada de lo que hay encima.
 */
export function DetalleAgenteIa({ sello, onCerrar }) {
    const avisos = sello?.avisos || [];
    const decisiones = sello?.decisiones || [];
    // Se abre en los AVISOS si los hay: es lo que hay que mirar antes de nada.
    const [ver, setVer] = useState(() => (avisos.length ? 'avisos' : decisiones.length ? 'decisiones' : null));
    if (!sello) return null;
    const lista = ver === 'avisos' ? avisos : ver === 'decisiones' ? decisiones : [];
    return (
        <div className="rounded-lg border border-violet-400/35 bg-violet-400/[0.06] px-3 py-2 text-[12px] text-white/80">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <b className="text-violet-200">🤖 Lo ha preparado el Agente IA</b>
                {fecha(sello.terminado_at) && <span className="text-white/50">{fecha(sello.terminado_at)}</span>}
                {decisiones.length > 0 && (
                    <button type="button" onClick={() => setVer(v => (v === 'decisiones' ? null : 'decisiones'))}
                            className={`underline-offset-2 hover:underline ${ver === 'decisiones' ? 'font-bold text-violet-100' : 'text-violet-200/90'}`}>
                        🧭 Cómo lo ha hecho ({decisiones.length}) {ver === 'decisiones' ? '▾' : '▸'}
                    </button>
                )}
                {avisos.length > 0 && (
                    <button type="button" onClick={() => setVer(v => (v === 'avisos' ? null : 'avisos'))}
                            className={`underline-offset-2 hover:underline ${ver === 'avisos' ? 'font-bold text-amber-100' : 'text-amber-200/90'}`}>
                        ⚠ {avisos.length} aviso{avisos.length === 1 ? '' : 's'} {ver === 'avisos' ? '▾' : '▸'}
                    </button>
                )}
                <span className="ml-auto flex flex-wrap items-center gap-2">
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
                    <button type="button" onClick={onCerrar} aria-label="Cerrar"
                            className="px-1 text-white/50 hover:text-white/80">✕</button>
                </span>
            </div>
            {lista.length > 0 && (
                <ul className="mt-2 flex max-h-64 flex-col gap-1 overflow-y-auto border-t border-white/10 pt-2">
                    {lista.map((a, i) => (
                        <li key={i} className={`border-l-2 pl-2 text-[11.5px] leading-snug text-white/75
                                                ${ver === 'avisos' ? 'border-amber-400/60' : 'border-violet-400/60'}`}>{a}</li>
                    ))}
                </ul>
            )}
            <p className="mt-1.5 text-[11px] text-white/45">
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
            {/* A todo el ancho caben tres o cuatro columnas: en dos, doce
                pendientes eran seis renglones que empujaban el plano. */}
            <ul className="grid grid-cols-1 gap-1 md:grid-cols-2 xl:grid-cols-3 min-[1700px]:grid-cols-4">
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
