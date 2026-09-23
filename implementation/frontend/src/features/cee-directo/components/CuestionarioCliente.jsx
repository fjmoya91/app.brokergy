import { resumenCuestionario } from '../logic/cuestionarioCee';

// ─────────────────────────────────────────────────────────────────────────────
// Lo que el cliente contestó de climatización al aceptar la oferta. Lo ven el
// equipo Y el técnico: es justo lo que necesita saber antes de la visita
// (caldera y combustible, termo, aires, placas). Sin cuestionario —encargos
// dados de alta a mano o anteriores a esto— no se pinta nada.
// ─────────────────────────────────────────────────────────────────────────────
export function CuestionarioCliente({ cuestionario }) {
    const filas = resumenCuestionario(cuestionario);
    if (!filas.length) return null;
    return (
        <div className="mb-6 rounded-2xl border border-white/[0.06] bg-bkg-surface/60 px-4 py-3">
            <div className="text-[10px] font-black uppercase tracking-widest text-white/35 mb-2">
                La vivienda, según el cliente
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5">
                {filas.map(([k, v]) => (
                    <div key={k} className="text-xs">
                        <span className="text-white/35">{k}: </span>
                        <span className={`text-white/80 ${k === 'Placas fotovoltaicas' && cuestionario?.placas === 'irpf' ? 'text-amber-300' : ''}`}>{v}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default CuestionarioCliente;
