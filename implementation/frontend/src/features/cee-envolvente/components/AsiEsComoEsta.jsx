import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

// ============================================================================
// «✓ ASÍ ES COMO ESTÁ»: dar el plano por bueno y, si se quiere, pedirle a Claude
// que rehaga el CEE sobre él.
//
// Es la otra mitad de la PIZARRA. Lo que se dibuja a mano se aplica al momento
// (y se guarda solo); este botón es el que dice «ya está, esto es la realidad»
// —con lo dibujado o tal cual— y el que pone a trabajar a la IA. Por eso
// enseña la LISTA DE CAMBIOS en palabras antes de confirmar: es lo que va a
// leer Claude, y lo que queda en el historial del expediente.
//
// Va PORTALEADO a `body` (regla 29.b): la ventana tiene `backdrop-blur` y un
// `fixed` dentro se recortaría a ella. En el móvil es hoja inferior.
// ============================================================================

const fechaCorta = (iso) => {
    if (!iso) return '';
    try {
        return new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch { return ''; }
};

export function AsiEsComoEstaModal({ abierto, cambios = [], fase = 'inicial', puedeClaude = false,
                                     onCerrar, onConfirmar }) {
    const [nota, setNota] = useState('');
    const [claude, setClaude] = useState(puedeClaude);
    const [enviando, setEnviando] = useState(false);
    const [resultado, setResultado] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!abierto) return;
        setNota(''); setClaude(puedeClaude); setResultado(null); setError(null); setEnviando(false);
    }, [abierto, puedeClaude]);

    useEffect(() => {
        if (!abierto) return undefined;
        const esc = (e) => { if (e.key === 'Escape' && !enviando) onCerrar?.(); };
        window.addEventListener('keydown', esc);
        return () => window.removeEventListener('keydown', esc);
    }, [abierto, enviando, onCerrar]);

    if (!abierto) return null;

    const confirmar = async () => {
        setEnviando(true); setError(null);
        try {
            const r = await onConfirmar({ nota: nota.trim(), avisarClaude: puedeClaude && claude });
            setResultado(r);
        } catch (e) {
            setError(e?.response?.data?.error || e?.message || 'No se ha podido guardar la revisión.');
        } finally {
            setEnviando(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/70 backdrop-blur-sm md:items-center md:p-4"
             onClick={() => { if (!enviando) onCerrar?.(); }}>
            <div role="dialog" aria-modal="true" aria-label="Así es como está"
                 onClick={e => e.stopPropagation()}
                 className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-white/10
                            bg-bkg-surface shadow-2xl md:max-w-lg md:rounded-2xl"
                 style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
                <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-white/20 md:hidden" />
                <div className="border-b border-white/[0.06] px-4 py-3">
                    <h2 className="text-[16px] font-black text-white">✓ Así es como está</h2>
                    <p className="mt-0.5 text-[12.5px] leading-snug text-white/65">
                        Das por bueno el plano de la envolvente{fase ? ` (CEE ${fase})` : ''}. Lo que has dibujado a mano
                        <b className="text-white"> manda</b>: la IA no lo quitará ni lo cambiará.
                    </p>
                </div>

                {resultado ? (
                    <div className="flex flex-col gap-3 px-4 py-4">
                        {/* Desde el TELÉFONO lo que vuelve es lo que contesta el ordenador, en
                            una frase (`texto`): la revisión la guarda él. */}
                        {resultado.texto ? (
                            <p className={`rounded-lg px-3 py-2 text-[13px] leading-snug
                                           ${resultado.ok === false ? 'bg-amber-400/10 text-amber-100'
                                                                    : 'bg-emerald-400/10 text-emerald-100'}`}>
                                {resultado.ok === false ? '' : '✓ '}{resultado.texto}
                            </p>
                        ) : (
                            <p className="rounded-lg bg-emerald-400/10 px-3 py-2 text-[13px] leading-snug text-emerald-100">
                                ✓ Revisión guardada{resultado.revision?.n ? ` (nº ${resultado.revision.n})` : ''} y anotada en el historial.
                            </p>
                        )}
                        {resultado.claude?.pedido && (
                            <p className="rounded-lg bg-violet-500/15 px-3 py-2 text-[13px] leading-snug text-violet-100">
                                🤖 Claude se ha puesto a rehacer el CEE con tus cambios. Te contestará por WhatsApp
                                cuando acabe. Mientras tanto, mejor no toques el plano: lo que escriba él lo verás al recargar.
                            </p>
                        )}
                        {resultado.claude && !resultado.claude.pedido && (
                            <p className="rounded-lg bg-amber-400/10 px-3 py-2 text-[13px] leading-snug text-amber-100">
                                Claude no se ha enterado: {resultado.claude.motivo || 'el asistente no responde'}.
                                Pídeselo tú: «rehaz el CEE con mis cambios del plano».
                            </p>
                        )}
                        {resultado.agente && (
                            <p className="text-[12px] text-white/60">
                                El Agente IA lo tiene en su cola como «corregido a mano · rehacer».
                            </p>
                        )}
                        <button onClick={onCerrar}
                                className="min-h-[44px] rounded-xl bg-white/10 text-[14px] font-bold text-white hover:bg-white/15">
                            Cerrar
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="flex-1 overflow-y-auto px-4 py-3">
                            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-white/50">
                                {cambios.length
                                    ? `Lo que has cambiado (${cambios.length})`
                                    : 'No has dibujado cambios'}
                            </p>
                            {cambios.length ? (
                                <ul className="mt-1 space-y-1 text-[12.5px] leading-snug text-white/85">
                                    {cambios.map((c, i) => (
                                        <li key={i} className="flex gap-2">
                                            <span className="shrink-0 tabular-nums text-white/40">{fechaCorta(c.at)}</span>
                                            <span>{c.texto}</span>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="mt-1 text-[12.5px] text-white/70">
                                    Das el plano por bueno tal y como está.
                                </p>
                            )}

                            <label className="mt-3 block text-[12px] font-bold text-white/80" htmlFor="nota-asi-es">
                                Algo más que deba saber{puedeClaude ? ' Claude' : ''} (opcional)
                            </label>
                            <textarea id="nota-asi-es" value={nota} onChange={e => setNota(e.target.value)}
                                      rows={3} maxLength={1000}
                                      placeholder="p. ej. la ventana del baño es de 60 × 60; el patio de atrás está cubierto"
                                      className="no-uppercase mt-1 w-full rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2
                                                 text-[16px] text-white placeholder:text-white/35 md:text-[13px]" />

                            {puedeClaude && (
                                <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-lg border border-violet-400/30
                                                  bg-violet-500/[0.07] px-3 py-2.5">
                                    <input type="checkbox" checked={claude} onChange={e => setClaude(e.target.checked)}
                                           className="mt-0.5 h-5 w-5 shrink-0 accent-violet-500" />
                                    <span className="text-[12.5px] leading-snug text-white/85">
                                        <b className="text-white">Pedirle a Claude que rehaga el CEE ahora.</b>
                                        <span className="block text-white/60">
                                            Medirá con las fotos lo que nace por confirmar (las ventanas y puertas que has
                                            dibujado) y volverá a escribir el .cex, sin quitar ni cambiar lo que has puesto.
                                        </span>
                                    </span>
                                </label>
                            )}
                            {error && <p className="mt-2 text-[12.5px] text-rose-300">{error}</p>}
                        </div>
                        <div className="flex gap-2 border-t border-white/[0.06] px-4 py-3">
                            <button onClick={onCerrar} disabled={enviando}
                                    className="min-h-[44px] rounded-xl border border-white/15 px-4 text-[13px] font-bold
                                               text-white/75 disabled:opacity-40">
                                Seguir dibujando
                            </button>
                            <button onClick={confirmar} disabled={enviando}
                                    className="min-h-[44px] flex-1 rounded-xl bg-emerald-600 text-[14px] font-black text-white
                                               shadow-lg shadow-emerald-950/40 disabled:opacity-50">
                                {enviando ? 'Guardando…' : '✓ Así es como está'}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>,
        document.body,
    );
}

/**
 * La franja de la revisión a mano: en qué está («Claude lo está rehaciendo»,
 * «rehecho»), con la salida de recargar el plano cuando ha terminado.
 */
export function BandaRevision({ revision, onRecargar, onAbrir }) {
    if (!revision) return null;
    const n = (revision.cambios || []).length;
    const base = `Plano corregido a mano el ${fechaCorta(revision.at)}${revision.por ? ` por ${revision.por}` : ''}`
        + ` · ${n ? `${n} ${n === 1 ? 'cambio' : 'cambios'}` : 'dado por bueno tal cual'}`;
    if (revision.estado === 'PEDIDO') {
        return (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-violet-400/40 bg-violet-500/[0.08]
                            px-3 py-2 text-[12.5px] text-violet-100">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-violet-300" />
                <span><b>🤖 Claude está rehaciendo el CEE {revision.fase}</b> · {base}.
                    <span className="text-violet-200/70"> Mejor no toques el plano hasta que termine.</span></span>
            </div>
        );
    }
    if (revision.estado === 'REHECHO') {
        return (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-400/40 bg-emerald-400/[0.07]
                            px-3 py-2 text-[12.5px] text-emerald-100">
                <span><b>✓ CEE {revision.fase} rehecho con tus cambios</b> el {fechaCorta(revision.rehecho_at)}
                    {revision.fichero ? ` · ${revision.fichero}` : ''}. <span className="text-emerald-200/70">({base})</span></span>
                {onRecargar && (
                    <button onClick={onRecargar}
                            className="ml-auto min-h-[36px] rounded-lg border border-emerald-400/50 px-3 text-[12px] font-bold
                                       text-emerald-100 hover:bg-emerald-400/15">
                        Ver lo que ha hecho
                    </button>
                )}
            </div>
        );
    }
    return (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03]
                        px-3 py-2 text-[12.5px] text-white/75">
            <span>✏️ {base}.{revision.claude && !revision.claude.pedido
                ? <span className="text-amber-200"> Claude no se enteró: {revision.claude.motivo}</span> : null}</span>
            {onAbrir && (
                <button onClick={onAbrir}
                        className="ml-auto min-h-[36px] rounded-lg border border-white/15 px-3 text-[12px] font-bold
                                   text-white/80 hover:bg-white/10">
                    Volver a confirmar
                </button>
            )}
        </div>
    );
}

export default AsiEsComoEstaModal;
