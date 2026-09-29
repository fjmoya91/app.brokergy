import { resumenConfirmacion } from '../logic/confirmacionCliente';

/**
 * «Confirmado por el cliente»: una línea con lo que dijo al aceptar la propuesta
 * (emisores, placas, aires), a la vista en la pestaña CEE.
 *
 * POR QUÉ aquí: es lo que el CEE inicial tiene que recoger como EXISTENTE, y
 * quien encarga o revisa el certificado lo mira en esta pestaña. Estaba solo en
 * el aviso de WhatsApp al staff y en Instalación, y ahí no lo buscaba nadie.
 *
 * Solo lectura. Lo que difiere de la simulación lleva su ⚠ con el motivo; el
 * emisor se corrige en Instalación, que es donde cambia el SCOP.
 */
export function ConfirmadoPorCliente({ confirmacion }) {
    const filas = resumenConfirmacion(confirmacion);
    if (!filas.length) return null;
    return (
        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border
                        border-emerald-500/25 bg-emerald-500/[0.06] px-3 py-2">
            <span className="text-[9px] font-black uppercase tracking-widest text-emerald-400">
                🏠 Confirmado por el cliente
            </span>
            {filas.map(f => (
                <span key={f.tema} className="text-[12px] text-white/75">
                    <b className="text-white/90">{f.tema}:</b> {f.valor}
                    {f.aviso && (
                        <span title={f.aviso} className="ml-1 cursor-help text-amber-400">⚠</span>
                    )}
                </span>
            ))}
        </div>
    );
}

export default ConfirmadoPorCliente;
