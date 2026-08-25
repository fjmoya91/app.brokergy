import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

// ─────────────────────────────────────────────────────────────────────────────
// Qué ha pasado con este encargo: enviado, aceptado, rechazado y cuándo.
//
// No es un adorno: sin esto, "¿se lo llegué a mandar?" y "¿me contestó?" se
// respondían buscando en el correo. Y cuando un técnico dice que no, lo que hace
// falta a la vez es saber a quién NO volver a ofrecérselo.
//
// Sale de los sellos que ya se escriben (`cee.ack_*`, `seguimiento.*_ts`) y del
// historial. NO hay tabla aparte a propósito: una bitácora paralela se
// desincroniza de lo que de verdad ocurrió en cuanto una escritura falla.
// ─────────────────────────────────────────────────────────────────────────────

const API = '/api/cee-directos';

const COLOR = {
    enviado:   'text-blue-400 border-blue-500/25 bg-blue-500/[0.06]',
    aceptado:  'text-emerald-400 border-emerald-500/25 bg-emerald-500/[0.06]',
    rechazado: 'text-amber-400 border-amber-500/30 bg-amber-500/[0.07]',
    contacto:  'text-white/45 border-white/10 bg-white/[0.02]',
    estado:    'text-white/45 border-white/10 bg-white/[0.02]',
};

const ICONO = { enviado: '📤', aceptado: '✅', rechazado: '⚠️', contacto: '💬', estado: '•' };

const fecha = (iso) => {
    try {
        return new Date(iso).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
    } catch { return ''; }
};

export function Trazabilidad({ id, refrescar = 0 }) {
    const [datos, setDatos] = useState(null);
    const [abierto, setAbierto] = useState(false);

    const cargar = useCallback(() => {
        axios.get(`${API}/${id}/trazabilidad`)
            .then(r => setDatos(r.data))
            .catch(() => setDatos(null));
    }, [id]);

    useEffect(() => { cargar(); }, [cargar, refrescar]);

    if (!datos) return null;

    const { hitos = [], esperandoAcuse, respuesta, rechazos = [] } = datos;
    // Los tres últimos bastan para el vistazo diario; el resto, a demanda. Una
    // lista de veinte líneas en la ficha vuelve a ser el muro que quitamos.
    const visibles = abierto ? hitos : hitos.slice(0, 3);

    return (
        <div className="mt-6 rounded-2xl border border-white/[0.06] bg-bkg-surface/40 p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
                <h3 className="text-xs font-black text-white uppercase tracking-widest border-l-2 border-brand pl-4">
                    Seguimiento del encargo
                </h3>
                {hitos.length > 3 && (
                    <button onClick={() => setAbierto(v => !v)}
                        className="text-[10px] font-black uppercase tracking-widest text-white/35 hover:text-white transition-colors">
                        {abierto ? 'Ver menos' : `Ver los ${hitos.length}`}
                    </button>
                )}
            </div>

            {/* Lo que está esperando AHORA, arriba y en una línea: es la pregunta
                que se hace uno al abrir la ficha. */}
            {esperandoAcuse && (
                <div className="mb-4 rounded-xl border border-blue-500/25 bg-blue-500/[0.06] px-4 py-3 text-[11px] text-blue-300">
                    Encargo enviado — <strong>esperando que el técnico confirme</strong> si lo coge.
                </div>
            )}
            {respuesta === 'rechaza' && (
                <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/[0.07] px-4 py-3 text-[11px] text-amber-300">
                    El último técnico no pudo cogerlo. El expediente está <strong>pendiente de encargar</strong> otra vez.
                </div>
            )}

            {hitos.length === 0 ? (
                <p className="text-[11px] text-white/25">Todavía no se le ha encargado a nadie.</p>
            ) : (
                <div className="space-y-2">
                    {visibles.map((h, i) => (
                        <div key={i} className={`flex items-start gap-3 rounded-xl border px-4 py-2.5 ${COLOR[h.tipo] || COLOR.estado}`}>
                            <span className="text-sm shrink-0 leading-5">{ICONO[h.tipo] || '•'}</span>
                            <div className="min-w-0 flex-1">
                                <div className="text-[12px] leading-snug">{h.texto}</div>
                                <div className="text-[10px] opacity-50 mt-0.5">{fecha(h.fecha)}</div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* A quién NO volver a ofrecérselo. Es la mitad del valor de registrar
                un rechazo: sin esta lista se le vuelve a mandar al mismo. */}
            {rechazos.length > 0 && (
                <div className="mt-4 pt-4 border-t border-white/[0.06]">
                    <div className="text-[9px] font-black uppercase tracking-widest text-white/25 mb-2">
                        Ya han dicho que no
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {rechazos.map((r, i) => (
                            <span key={i} title={r.motivo || 'Sin motivo indicado'}
                                className="inline-flex items-center px-2.5 py-1 rounded-lg border border-white/10 bg-white/[0.02] text-[11px] text-white/50">
                                {r.nombre}{r.motivo ? ` · ${r.motivo}` : ''}
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

export default Trazabilidad;
