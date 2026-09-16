// ─────────────────────────────────────────────────────────────────────────────
// Los apartados de CE3X, en el orden y con los nombres de CE3X.
//
// POR QUÉ: quien usa esta pantalla lleva años tecleando certificados en CE3X, y
// su cabeza va por sus seis pestañas —administrativos, generales, envolvente,
// instalaciones, medidas, económico—. Enseñar aquí esa misma barra no es imitar
// por imitar: es que sepa DÓNDE está y qué le falta sin tener que aprenderse
// otra forma de ordenar lo mismo.
//
// REGLA — la línea de estado dice la VERDAD del expediente, no un rótulo fijo.
// Una barra en la que todo pone siempre lo mismo no se lee a la segunda vez. Lo
// que se enseña sale de lo que la ficha y el plano ya saben (ver
// `pestanasCe3x()` en `EnvolventeView`), nunca de un texto escrito aquí.
//
// REGLA — una pestaña sin pantalla propia LLEVA AL BLOQUE QUE SÍ EXISTE, nunca
// se queda muerta. Aquí solo la envolvente tiene superficie propia; las demás
// abren y desplazan hasta su bloque de la ficha. Una pestaña que no hace nada al
// pulsarla se lee como que la app está rota.
// ─────────────────────────────────────────────────────────────────────────────

//: Los tonos de la línea de estado. Son tres y significan tres cosas distintas:
//: hecho · hay que mirarlo · no depende de ti.
const TONO = {
    ok: 'text-emerald-400',
    aviso: 'text-brand',
    apagado: 'text-white/30',
};

export function PestanasCe3x({ pestanas = [], activa = 'envolvente', onIr, deshacer }) {
    if (!pestanas.length) return null;
    return (
        // Se desplaza en horizontal antes que apilarse: en una tablet, seis
        // pestañas en dos filas dejan de leerse como una barra de apartados.
        <nav aria-label="Apartados de CE3X"
             className="flex items-stretch gap-0.5 overflow-x-auto border-b border-white/[0.07]
                        bg-bkg-deep/95 px-3 backdrop-blur">
            {pestanas.map(p => (
                <button key={p.id} onClick={() => onIr?.(p.id)}
                        title={p.ayuda}
                        aria-current={activa === p.id ? 'page' : undefined}
                        className={`flex shrink-0 flex-col gap-0.5 whitespace-nowrap border-b-2
                                    px-3 py-2.5 text-left transition-colors
                            ${activa === p.id
                                ? 'border-brand bg-white/[0.05]'
                                : 'border-transparent hover:bg-white/[0.03]'}`}>
                    <span className={`text-[12px] ${activa === p.id
                            ? 'font-extrabold text-brand'
                            : 'font-semibold text-white/50'}`}>
                        {p.etiqueta}
                    </span>
                    <span className={`text-[9.5px] font-bold uppercase tracking-[0.12em]
                                      ${activa === p.id && p.tono === 'aviso'
                                        ? 'text-brand' : TONO[p.tono] || TONO.apagado}`}>
                        {p.estado}
                    </span>
                </button>
            ))}

            {/* Lo último de CE3X es exportar; aquí es generar el fichero que se
                abre con él. Va a la derecha porque es el final del recorrido —y
                es una ventana más, así que también se marca cuando está puesta. */}
            <div className="ml-auto flex shrink-0 items-center gap-2 py-1.5 pl-3">
                {/* DESHACER. Va aquí y no en la cabecera del plano porque el
                    resbalón se comete en cualquiera de las ventanas —apartar una
                    pared, pero también teclear un dato en Instalaciones— y la
                    cabecera solo se ve en la del plano. Aquí está siempre. */}
                {deshacer && (
                    <div className="flex items-center gap-0.5">
                        <Paso onClick={deshacer.deshacer} puede={deshacer.puedeDeshacer}
                              titulo="Deshacer el último cambio (Ctrl+Z)" etiqueta="Deshacer">
                            <path strokeLinecap="round" strokeLinejoin="round"
                                  d="M9 14 4 9l5-5" />
                            <path strokeLinecap="round" strokeLinejoin="round"
                                  d="M4 9h9a7 7 0 0 1 0 14h-3" />
                        </Paso>
                        <Paso onClick={deshacer.rehacer} puede={deshacer.puedeRehacer}
                              titulo="Rehacer (Ctrl+Mayús+Z)">
                            <path strokeLinecap="round" strokeLinejoin="round"
                                  d="m15 14 5-5-5-5" />
                            <path strokeLinecap="round" strokeLinejoin="round"
                                  d="M20 9h-9a7 7 0 0 0 0 14h3" />
                        </Paso>
                    </div>
                )}
                <button onClick={() => onIr?.('cex')}
                        aria-current={activa === 'cex' ? 'page' : undefined}
                        className={`rounded-lg border px-3 py-2 text-[11px] font-black
                                    uppercase tracking-widest
                            ${activa === 'cex'
                                ? 'border-brand bg-brand/15 text-brand'
                                : 'border-white/10 bg-white/[0.05] hover:border-brand/50 hover:text-brand'}`}>
                    Generar .cex
                </button>
            </div>
        </nav>
    );
}

/**
 * Un paso atrás o adelante.
 *
 * Deshabilitado y no escondido: que el botón esté ahí en gris es lo que dice que
 * ya no queda nada que deshacer. Uno que aparece y desaparece obliga a buscarlo.
 */
function Paso({ onClick, puede, titulo, etiqueta, children }) {
    return (
        <button type="button" onClick={onClick} disabled={!puede} title={titulo}
                aria-label={titulo}
                className={`flex items-center gap-1.5 rounded-lg border px-2 py-2 text-[11px]
                            font-black uppercase tracking-widest transition-colors
                    ${puede
                        ? 'border-white/10 bg-white/[0.05] text-white/70 hover:border-brand/50 hover:text-brand'
                        : 'cursor-not-allowed border-white/[0.06] text-white/20'}`}>
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24"
                 stroke="currentColor" strokeWidth={2}>
                {children}
            </svg>
            {etiqueta && <span className="hidden lg:inline">{etiqueta}</span>}
        </button>
    );
}

export default PestanasCe3x;
