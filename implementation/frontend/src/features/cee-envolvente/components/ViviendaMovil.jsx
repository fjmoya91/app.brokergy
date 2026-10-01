import { useEffect, useState } from 'react';
import { TIPOS_PARED } from '../logic/tiposPared';
import { areaPoligono } from '../logic/geometriaPlano';
import { lineasResumen, resumenParedes } from '../logic/contornoMovil';
import { IconoDeshacer, IconoPapelera } from './IconosCroquis';

// ============================================================================
// La pestaña VIVIENDA del croquis móvil: delimitar un adosado con el dedo y
// decir contra qué da cada pared.
//
// En una comunidad de adosados Catastro mide el bloque ENTERO (regla 75). Aquí
// se tocan las esquinas de la vivienda y el ORDENADOR aplica el mismo recorte
// que su botón «Delimitar adosado»: vuelve a medir, y lo de fuera pasa a ser la
// casa de al lado (medianera). Después, «Paredes»: se toca una y se dice si da
// al exterior, al vecino o a un local — lo mismo que el «Da contra» del panel
// de la pared en el ordenador, que es quien lo aplica y lo guarda.
//
// Dos sub-pestañas y no una: son dos gestos sobre el mismo plano (un toque pone
// una esquina o elige una pared) y mezclados cada toque sería una adivinanza.
// Arranca en «Paredes» si la vivienda ya está delimitada y en «Contorno» si no.
// ============================================================================

const CONFIRMA_MS = 3000;
const coma = (v, d = 0) => (Number(v) || 0).toFixed(d).replace('.', ',');

//: Cómo se ve cada tipo en el plano del teléfono (`trazoMuro` en la vista):
//: la leyenda tiene que decir lo mismo. La fachada va clara en la leyenda
//: porque el panel es oscuro; en el plano, sobre papel, es oscura.
const MUESTRA = {
    FACHADA: { stroke: '#e2e8f0', dash: false },
    MEDIANERA: { stroke: '#60a5fa', dash: true },
    PARTICION_VERTICAL: { stroke: '#f472b6', dash: false },
};

function Muestra({ tipo }) {
    const m = MUESTRA[tipo] || MUESTRA.FACHADA;
    return (
        <svg width="22" height="8" aria-hidden className="shrink-0">
            <line x1="1" y1="4" x2="21" y2="4" stroke={m.stroke} strokeWidth="3" strokeLinecap="round"
                  strokeDasharray={m.dash ? '5 3' : undefined} />
        </svg>
    );
}

export function ViviendaMovil({
    sub, onSub,
    contorno, recorteHay, muros = [],
    selPared, onElegirPared, onContra, contrasPendientes = new Set(),
    onDeshacer, onBorrar, onDelimitar, onQuitar,
    resultado, aviso, ocupado = false,
}) {
    const [confirma, setConfirma] = useState(null);   // 'borrar' | 'quitar' | null
    useEffect(() => {
        if (!confirma) return undefined;
        const t = setTimeout(() => setConfirma(null), CONFIRMA_MS);
        return () => clearTimeout(t);
    }, [confirma]);

    const pts = contorno?.pts || [];
    const m2 = pts.length >= 3 ? areaPoligono(pts) : 0;
    const resumen = resumenParedes(muros);
    const pared = selPared ? muros.find(m => m.id === selPared) : null;

    return (
        <div className="flex flex-col gap-2">
            <div role="tablist" className="grid grid-cols-2 gap-1 rounded-lg border border-white/10 bg-white/[0.02] p-0.5">
                {[['contorno', 'Contorno'], ['paredes', 'Paredes']].map(([k, t]) => (
                    <button key={k} role="tab" aria-selected={sub === k} onClick={() => onSub(k)}
                            className={`min-h-[36px] rounded-md text-[12.5px] font-bold transition
                                ${sub === k ? 'bg-emerald-600 text-white shadow' : 'text-white/75'}`}>
                        {t}
                    </button>
                ))}
            </div>

            {sub === 'contorno' ? (
                <>
                    <p className="px-1 text-[12.5px] leading-snug text-white/80">
                        Toca las <b className="text-white">esquinas de tu vivienda</b> y cierra tocando la
                        primera. Por la calle y el jardín puedes pasarte: lo que importa son las líneas con
                        las casas de al lado.
                        <span className="block text-[11.5px] text-white/60">
                            Los puntos se pegan a las esquinas y a las paredes · un dedo mueve el plano
                        </span>
                    </p>
                    {recorteHay && (
                        <p className="px-1 text-[11.5px] leading-snug text-emerald-200/90">
                            Ya hay una vivienda delimitada (la línea verde): lo que dibujes la sustituye.
                        </p>
                    )}
                    <p className="px-1 text-[12.5px] font-bold tabular-nums text-white">
                        {!pts.length ? 'Toca la primera esquina'
                            : contorno.cerrado ? `Cerrado · ≈${coma(m2)} m²`
                                : `${pts.length} ${pts.length === 1 ? 'esquina' : 'esquinas'}`
                                  + (pts.length >= 3 ? ` · ≈${coma(m2)} m² · toca la primera para cerrar` : '')}
                    </p>
                    {aviso && <p className="px-1 text-[12.5px] text-amber-200">{aviso}</p>}
                    <div className="flex items-center gap-2">
                        <button onClick={() => {
                                    if (confirma !== 'borrar') { setConfirma('borrar'); return; }
                                    setConfirma(null); onBorrar();
                                }} disabled={!pts.length || ocupado}
                                aria-label={confirma === 'borrar' ? 'Confirmar: borrar el contorno' : 'Borrar el contorno'}
                                className={`flex h-12 shrink-0 items-center justify-center rounded-xl border text-[12.5px]
                                            font-bold disabled:opacity-40
                                            ${confirma === 'borrar' ? 'border-rose-400/70 bg-rose-500/20 px-3 text-rose-200'
                                                                    : 'w-12 border-white/15 bg-white/[0.05] text-white/80'}`}>
                            {confirma === 'borrar' ? '¿Borrar?' : <IconoPapelera />}
                        </button>
                        <button onClick={onDeshacer} disabled={!pts.length || ocupado}
                                aria-label="Quitar la última esquina"
                                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border
                                           border-white/15 bg-white/[0.05] text-white/80 disabled:opacity-40">
                            <IconoDeshacer />
                        </button>
                        <button onClick={onDelimitar} disabled={pts.length < 3 || ocupado}
                                className="h-12 flex-1 rounded-xl bg-emerald-600 text-[15px] font-black text-white
                                           shadow-lg shadow-emerald-950/40 transition active:bg-emerald-700
                                           disabled:opacity-40 disabled:shadow-none">
                            ✓ Delimitar la vivienda
                        </button>
                    </div>
                </>
            ) : (
                <>
                    {resultado && (
                        <div className={`rounded-xl border px-3 py-2 text-[12.5px] leading-snug
                            ${resultado.ok ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-100'
                                           : 'border-amber-400/40 bg-amber-400/10 text-amber-100'}`}>
                            <b>{resultado.ok ? `✓ ${resultado.texto || 'Hecho'}` : 'No ha salido'}</b>
                            {!resultado.ok && resultado.texto && <span className="block">{resultado.texto}</span>}
                        </div>
                    )}
                    {/* Lo que ha salido, de un vistazo: en un adosado entre
                        medianeras, dos medianeras largas y dos fachadas. */}
                    <ul className="space-y-1 px-1 text-[12.5px] text-white/85">
                        {resumen.map(f => (
                            <li key={f.tipo} className={`flex items-center gap-2 ${f.n ? '' : 'opacity-45'}`}>
                                <Muestra tipo={f.tipo} />
                                <span className="font-bold">{f.etiqueta}</span>
                                <span className="text-white/65">
                                    {f.n ? lineasResumen([f])[0] : 'ninguna'}
                                </span>
                            </li>
                        ))}
                    </ul>

                    {pared ? (
                        <div className="rounded-xl border border-violet-400/40 bg-violet-400/[0.07] px-3 py-2.5">
                            <div className="flex items-baseline justify-between gap-2">
                                <b className="truncate text-[14px] text-white">{pared.nombre || pared.id}</b>
                                <span className="shrink-0 text-[12px] tabular-nums text-white/65">
                                    {pared.largo ? `${coma(pared.largo, 2)} m` : ''}
                                </span>
                            </div>
                            <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.08em] text-white/55">
                                Da contra
                                {contrasPendientes.has(pared.id) && (
                                    <span className="ml-2 normal-case tracking-normal text-violet-200">· enviando…</span>
                                )}
                            </p>
                            <div className="mt-1 grid grid-cols-3 gap-1.5">
                                {TIPOS_PARED.map(t => {
                                    const activo = pared.tipo === t.id;
                                    return (
                                        // Sin `title`: la ayuda ya se lee debajo, y con
                                        // él el botón se anunciaba por la ayuda y no
                                        // por lo que dice.
                                        <button key={t.id} onClick={() => onContra(pared.id, t.id)}
                                                aria-pressed={activo}
                                                className={`min-h-[44px] rounded-lg border px-1 text-[12.5px] font-bold leading-tight
                                                    ${activo ? 'border-violet-300 bg-violet-600 text-white'
                                                             : 'border-white/15 bg-white/[0.05] text-white/80'}`}>
                                            {t.etiqueta}
                                        </button>
                                    );
                                })}
                            </div>
                            <p className="mt-1.5 text-[11.5px] leading-snug text-white/65">
                                {(TIPOS_PARED.find(t => t.id === pared.tipo) || {}).ayuda}
                                {pared.catastro && pared.catastro !== pared.tipo && (
                                    <button onClick={() => onContra(pared.id, pared.catastro)}
                                            className="ml-1 text-violet-200 underline">
                                        volver a lo de Catastro
                                    </button>
                                )}
                            </p>
                            <button onClick={() => onElegirPared(null)}
                                    className="mt-1 min-h-[36px] text-[12px] font-bold text-white/60">
                                Cerrar
                            </button>
                        </div>
                    ) : (
                        <p className="px-1 text-[12.5px] text-white/70">
                            <b className="text-white">Toca una pared</b> para decir si da al exterior, al vecino o a un local.
                        </p>
                    )}

                    <div className="flex items-center gap-2 pt-0.5">
                        <button onClick={() => onSub('contorno')} disabled={ocupado}
                                className="min-h-[44px] flex-1 rounded-xl border border-white/15 bg-white/[0.05]
                                           text-[13px] font-bold text-white disabled:opacity-40">
                            ✎ {recorteHay ? 'Redibujar el contorno' : 'Delimitar la vivienda'}
                        </button>
                        {recorteHay && (
                            <button onClick={() => {
                                        if (confirma !== 'quitar') { setConfirma('quitar'); return; }
                                        setConfirma(null); onQuitar();
                                    }} disabled={ocupado}
                                    className={`min-h-[44px] shrink-0 rounded-xl border px-3 text-[13px] font-bold
                                                disabled:opacity-40
                                                ${confirma === 'quitar' ? 'border-rose-400/70 bg-rose-500/20 text-rose-200'
                                                                        : 'border-white/15 bg-white/[0.05] text-white/80'}`}>
                                {confirma === 'quitar' ? '¿Quitar el contorno?' : 'Quitar'}
                            </button>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

export default ViviendaMovil;
