// La chapa «EN LOTE» del listado, con el lote debajo. Es fija: un expediente
// loteado lo mueve su lote (el cambio de estado del lote lo arrastra); el
// estado se sigue pudiendo tocar a mano desde la ficha. Ver logic/enLote.js.
export default function EstadoEnLote({ expediente, className = '' }) {
    const lote = expediente?.lote || null;
    return (
        <div
            className={`flex flex-col items-stretch gap-0.5 ${className}`}
            title={`${expediente?.estado || ''} · en ${lote?.codigo || 'un lote'}${lote?.estado ? ` (${lote.estado})` : ''}`}
        >
            <span className="text-[9px] font-black uppercase tracking-wider text-center rounded-lg px-2 py-1 leading-tight border bg-indigo-500/10 text-indigo-300 border-indigo-500/30">
                En lote
            </span>
            {lote?.codigo && (
                <span className="text-[9px] text-center leading-tight truncate">
                    <span className="font-mono font-black text-indigo-400">{lote.codigo}</span>
                    {lote.estado && <span className="text-white/30 uppercase tracking-wide"> · {lote.estado}</span>}
                </span>
            )}
        </div>
    );
}
