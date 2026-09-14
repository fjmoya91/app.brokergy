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

export function PestanasCe3x({ pestanas = [], activa = 'envolvente', onIr }) {
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
            <div className="ml-auto flex shrink-0 items-center py-1.5 pl-3">
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

export default PestanasCe3x;
