// ============================================================================
// AgenteIaEstado.jsx — en qué va el AGENTE IA con este CEE.
//
// La barra de certificadores dice A QUIÉN está encargado; esta línea dice si
// está HECHO, que era la pregunta sin respuesta («se lo pedí a Claude… ¿lo
// hizo?»). Sale del sello `cee.agente_ia[fase]` que escribe la skill al empezar
// y al terminar (services/agenteIa.js), y del certificador asignado:
//
//   · encargado y sin empezar → la frase para pedírselo a Claude, para copiar;
//   · trabajando              → desde cuándo;
//   · terminado               → cuándo, el .cex y la carpeta.
//
// Si el agente solo le preparó el borrador a un TÉCNICO asignado, también se
// dice: el borrador existe aunque la barra nombre a otro.
// ============================================================================
import React, { useState } from 'react';
import { esAgenteIa, fraseParaClaude } from '../../../utils/agenteIa';

const cuando = (iso) => (iso ? new Date(iso).toLocaleString('es-ES', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
}) : '');

function Copiar({ texto }) {
    const [ok, setOk] = useState(null);
    return (
        <button type="button"
            onClick={async () => {
                try { await navigator.clipboard.writeText(texto); setOk(true); setTimeout(() => setOk(null), 1600); }
                catch { setOk(false); }
            }}
            className="shrink-0 text-[9px] font-black uppercase tracking-widest text-white/40 hover:text-brand transition-colors">
            {ok === true ? '✓ copiado' : ok === false ? 'cópialo a mano' : 'copiar'}
        </button>
    );
}

export function AgenteIaEstado({ expediente, certificador, secciones = ['inicial', 'final'] }) {
    const sellos = expediente?.cee?.agente_ia || {};
    const delAgente = esAgenteIa(certificador);
    const numero = expediente?.numero_expediente || '';
    const filas = [];

    for (const fase of secciones) {
        const s = sellos[fase];
        const etiqueta = secciones.length === 1 ? 'CEE' : (fase === 'final' ? 'CEE final' : 'CEE inicial');
        const sub = String(expediente?.seguimiento?.[fase === 'final' ? 'cee_final' : 'cee_inicial'] || '').toUpperCase();
        if (s?.estado === 'terminado') {
            filas.push(
                <div key={fase} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-emerald-400 font-black">✓ {etiqueta}: borrador listo</span>
                    <span className="text-white/40">{cuando(s.terminado_at)}</span>
                    {s.fichero_link && (
                        <a href={s.fichero_link} target="_blank" rel="noopener noreferrer"
                            className="text-brand hover:underline truncate max-w-[22rem] normal-case">📄 {s.fichero || 'abrir el .cex'}</a>
                    )}
                    {s.carpeta_link && (
                        <a href={s.carpeta_link} target="_blank" rel="noopener noreferrer" className="text-white/50 hover:text-brand">📁 carpeta</a>
                    )}
                    {s.delAgente === false && <span className="text-white/40">· preparado para el técnico asignado</span>}
                </div>
            );
        } else if (s?.estado === 'trabajando') {
            filas.push(
                <div key={fase} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-amber-300 font-black">⏳ {etiqueta}: el agente está en ello</span>
                    <span className="text-white/40">desde {cuando(s.empezado_at)}</span>
                </div>
            );
        } else if (delAgente && ['', 'PTE_ENVIO_CERT', 'ASIGNADO', 'EN_TRABAJO', 'PTE_PRESENTACION'].includes(sub)
                   && (fase === 'inicial' || String(expediente?.seguimiento?.cee_inicial || '').toUpperCase() === 'REGISTRADO')) {
            const frase = fraseParaClaude(numero, fase);
            filas.push(
                <div key={fase} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-white/70 font-black">{etiqueta}: encargado, sin empezar</span>
                    <span className="text-white/40">pídeselo en Claude:</span>
                    <code className="rounded bg-black/30 border border-white/10 px-2 py-0.5 text-white/80 normal-case">{frase}</code>
                    <Copiar texto={frase} />
                </div>
            );
        }
    }
    if (!filas.length) return null;

    return (
        <div className="mx-0 mb-3 rounded-xl border border-brand/20 bg-brand/[0.04] px-3 py-2.5 text-[11px] leading-snug">
            <div className="flex items-start gap-2.5">
                <span className="text-base leading-none mt-0.5" aria-hidden>🤖</span>
                <div className="flex-1 min-w-0 space-y-1">
                    <p className="text-[9px] font-black uppercase tracking-widest text-white/35">
                        Agente IA{delAgente ? ' · encargado' : ''}
                    </p>
                    {filas}
                </div>
            </div>
        </div>
    );
}

export default AgenteIaEstado;
