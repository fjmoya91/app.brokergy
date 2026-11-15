// ─────────────────────────────────────────────────────────────────────────────
// «Faltan N para generar»: UN número en la tira de estado y, al pulsarlo, la
// lista de lo que falta, donde cada línea lleva a lo suyo (2026-10-29).
//
// Sustituye a la barra «8/25 paredes miradas», a «12 medidas por confirmar» y a
// los avisos sueltos de entrada y carpintería: decían lo mismo en cuatro sitios
// y lo de las otras pestañas no salía en ninguno. La lista la compone
// `faltaParaGenerar` (`logic/pendientes.js`); aquí solo se pinta.
// ─────────────────────────────────────────────────────────────────────────────

const fmt = (n) => (Number.isFinite(Number(n)) ? Number(n).toFixed(2).replace('.', ',') : '—');

/**
 * La píldora. Lleva dentro la barra de progreso de las paredes (lo mirado frente
 * a lo que hay que mirar), que es la respuesta a «¿cuánto me queda?».
 */
export function PildoraFalta({ falta, resumen, abierta, onAlternar }) {
    const n = falta.items.length;
    const total = resumen.paredes || 0;
    const miradas = Math.max(0, total - (resumen.sinTocar || 0));
    const pct = total ? Math.round((miradas / total) * 100) : 0;
    const listo = n === 0;
    const color = listo ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200'
        : falta.bloquean ? 'border-red-400/45 bg-red-400/10 text-red-100'
        : 'border-amber-400/45 bg-amber-400/10 text-amber-100';
    return (
        <button type="button" onClick={onAlternar} aria-expanded={abierta}
                title={listo ? 'Todo mirado y confirmado' : 'Ver qué falta e ir a cada cosa'}
                className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 leading-none
                            hover:brightness-125 ${color}`}>
            {total > 0 && (
                <span className="h-1.5 w-14 overflow-hidden rounded-full bg-white/10"
                      title={`${miradas} de ${total} paredes miradas`}>
                    <span className={`block h-full rounded-full ${pct >= 100 ? 'bg-emerald-400' : 'bg-brand'}`}
                          style={{ width: `${pct}%` }} />
                </span>
            )}
            {listo ? <b>✓ Listo para generar</b>
                : falta.bloquean
                    ? <span><b>Faltan {n}</b> para generar
                        <span className="opacity-70"> · {falta.bloquean} lo {falta.bloquean === 1 ? 'impide' : 'impiden'}</span></span>
                    : <span><b>Quedan {n}</b> por revisar</span>}
            {!listo && <span className="opacity-60">{abierta ? '▴' : '▾'}</span>}
        </button>
    );
}

const GRUPOS = [
    ['bloquea', 'Impide generar', 'text-red-200'],
    ['aviso', 'Por completar', 'text-amber-200'],
    ['pared', 'Paredes sin mirar', 'text-white/80'],
    ['medida', 'Medidas por confirmar', 'text-amber-200'],
];

/** La lista, agrupada. Cada línea es un botón que lleva a lo suyo (`onIr`). */
export function ListaFalta({ falta, onIr, onCerrar }) {
    if (!falta.items.length) {
        return (
            <div className="rounded-lg border border-emerald-400/30 bg-emerald-400/[0.06] px-3 py-2 text-[12px] text-emerald-200">
                ✓ No falta nada: todas las paredes miradas y todas las medidas confirmadas.
                <button type="button" onClick={onCerrar} className="ml-3 text-white/50 hover:text-white/80">cerrar</button>
            </div>
        );
    }
    return (
        <div className="space-y-2 rounded-lg border border-white/12 bg-white/[0.03] px-3 py-2 text-[12px]">
            <div className="flex items-center gap-2">
                <b className="text-white/90">Lo que falta · {falta.items.length}</b>
                <span className="text-white/45">pulsa una línea para ir a ella · en el plano, Intro da la pared por revisada</span>
                <button type="button" onClick={onCerrar} className="ml-auto text-white/50 hover:text-white/80">✕</button>
            </div>
            {GRUPOS.map(([grupo, titulo, color]) => {
                const lista = falta.items.filter(i => i.grupo === grupo);
                if (!lista.length) return null;
                return (
                    <section key={grupo}>
                        <div className={`mb-1 text-[10.5px] font-bold uppercase tracking-wide ${color}`}>
                            {titulo} · {lista.length}
                        </div>
                        {/* Las paredes sin mirar son un nombre: van en fichas, no en
                            renglones (diecisiete renglones empujaban el plano). */}
                        {grupo === 'pared' ? (
                            <div className="flex flex-wrap gap-1">
                                {lista.map(it => (
                                    <button key={it.clave} type="button" onClick={() => onIr(it)}
                                            title={it.detalle}
                                            className="rounded-md border border-white/10 bg-white/[0.02] px-2 py-1
                                                       font-bold text-white/80 hover:border-brand/60 hover:bg-brand/10">
                                        {it.texto}
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <ul className="grid grid-cols-1 gap-1 md:grid-cols-2 xl:grid-cols-3 min-[1700px]:grid-cols-4">
                                {lista.map(it => (
                                    <li key={it.clave}>
                                        <button type="button" onClick={() => onIr(it)} disabled={!it.ir}
                                                className="w-full rounded-md border border-white/10 bg-white/[0.02] px-2 py-1.5
                                                           text-left enabled:hover:border-amber-400/50 enabled:hover:bg-amber-400/[0.08]">
                                            <span className={`font-bold ${color}`}>{it.texto}</span>
                                            {it.medida && (
                                                <span className="text-white/70"> · {it.medida.lucernario ? 'lucernario'
                                                    : it.medida.tipo === 'puerta' ? 'puerta' : 'ventana'}
                                                    {' '}{fmt(it.medida.ancho)} × {fmt(it.medida.alto)} m</span>
                                            )}
                                            {it.detalle && <span className="text-white/45"> · {it.detalle}</span>}
                                            {it.medida?.por_que && (
                                                <span className="block text-[11px] leading-snug text-white/40">{it.medida.por_que}</span>
                                            )}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                );
            })}
        </div>
    );
}
