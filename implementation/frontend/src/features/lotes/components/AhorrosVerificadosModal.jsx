import { useMemo, useState } from 'react';
import axios from 'axios';

// ─────────────────────────────────────────────────────────────────────────────
// Ahorro VERIFICADO por expediente, leído del informe de verificación.
//
// El informe del verificador trae, actuación por actuación, el ahorro que da por
// bueno. Ese número es sobre el que se factura al Sujeto Obligado y sobre el que
// se le paga el bono al cliente — hasta ahora había que copiarlo a mano en cada
// expediente, o no se copiaba y el lote se quedaba sin él.
//
// REGLA — se PROPONE, no se escribe solo. El backend lee y casa contra los
// expedientes del lote; aquí se revisa y se aplica con un clic. Un número que
// nadie ha mirado acaba en una transferencia a un cliente, y una transferencia
// hecha no se deshace. Mismo criterio que las incidencias de las facturas de obra.
//
// REGLA — lo que no casa NO se puede marcar. Si el informe cita una actuación que
// no está en el lote, se enseña en rojo y sin casilla: adivinar a qué expediente
// se parece es la forma de pagarle a un cliente el ahorro de otro.
// ─────────────────────────────────────────────────────────────────────────────

const kwh = (n) => `${Number(n || 0).toLocaleString('es-ES')} kWh`;
const mwh = (n) => `${(Number(n || 0) / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} MWh`;

export function AhorrosVerificadosModal({ lote, propuesta, onClose, onAplicado }) {
    const filas = useMemo(() => propuesta?.filas || [], [propuesta]);
    // Por defecto van marcadas las aplicables. Lo que no casa no se puede marcar.
    const [marcadas, setMarcadas] = useState(() =>
        new Set(filas.filter(f => f.aplicable).map(f => f.expediente_id)));
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState('');
    const [hecho, setHecho] = useState(null);

    const toggle = (id) => setMarcadas(prev => {
        const s = new Set(prev);
        if (s.has(id)) s.delete(id); else s.add(id);
        return s;
    });

    const seleccionadas = filas.filter(f => f.aplicable && marcadas.has(f.expediente_id));
    const sumaSel = seleccionadas.reduce((a, f) => a + (Number(f.ahorro_kwh) || 0), 0);

    const aplicar = async () => {
        if (!seleccionadas.length) return;
        setGuardando(true);
        setError('');
        try {
            const { data } = await axios.post(`/api/lotes/${lote.id}/ahorros-verificados`, {
                filas: seleccionadas.map(f => ({ expediente_id: f.expediente_id, ahorro_kwh: f.ahorro_kwh })),
                informe_expediente_cae: propuesta?.informe?.expediente_cae || null,
                informe_fecha: propuesta?.informe?.fecha_informe || null,
            });
            setHecho(data);
            if (onAplicado) onAplicado(data);
        } catch (err) {
            setError(err.response?.data?.error || 'No se pudieron registrar los ahorros verificados.');
        } finally {
            setGuardando(false);
        }
    };

    const inf = propuesta?.informe || {};

    return (
        <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-6"
            onClick={(e) => { if (e.target === e.currentTarget && !guardando) onClose(); }}>
            <div className="bg-bkg-base border border-white/[0.08] rounded-t-[1.75rem] sm:rounded-[1.75rem] w-full sm:max-w-2xl max-h-[92vh] flex flex-col">

                {/* Cabecera: de qué informe salen estos números. */}
                <div className="p-5 border-b border-white/[0.06] shrink-0">
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30">Ahorro verificado · {lote?.codigo}</p>
                    <h3 className="text-lg font-black text-white mt-1">Lo que dice el informe de verificación</h3>
                    <p className="text-[11px] text-white/40 mt-1">
                        {[inf.expediente_cae, inf.entidad_verificadora, inf.fecha_informe].filter(Boolean).join(' · ') || 'Informe de verificación'}
                    </p>
                    {inf.dictamen && <p className="text-[10px] text-emerald-400/70 mt-1">{inf.dictamen}</p>}
                </div>

                {/* Avisos: todo lo que no encaja se dice ANTES de la lista, no después. */}
                {(propuesta?.avisos || []).length > 0 && (
                    <div className="mx-5 mt-4 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-3 shrink-0">
                        {propuesta.avisos.map((a, i) => (
                            <p key={i} className="text-[11px] text-amber-300/90 leading-snug">⚠ {a}</p>
                        ))}
                    </div>
                )}

                <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-2">
                    {filas.map((f, i) => {
                        const marcada = f.aplicable && marcadas.has(f.expediente_id);
                        const cambia = f.ahorro_actual_kwh != null && f.ahorro_actual_kwh !== f.ahorro_kwh;
                        return (
                            <label key={i}
                                className={`flex items-start gap-3 rounded-xl border p-3 transition-colors ${
                                    !f.aplicable ? 'border-red-500/30 bg-red-500/[0.04] cursor-not-allowed'
                                        : marcada ? 'border-emerald-500/30 bg-emerald-500/[0.05] cursor-pointer'
                                            : 'border-white/[0.06] bg-white/[0.01] cursor-pointer'}`}>
                                <input type="checkbox" disabled={!f.aplicable} checked={marcada}
                                    onChange={() => toggle(f.expediente_id)}
                                    className="mt-0.5 w-4 h-4 accent-emerald-500 shrink-0 disabled:opacity-30" />
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-baseline gap-2 flex-wrap">
                                        <span className="text-[12px] font-black text-white">
                                            {f.numero_expediente || f.expediente_leido || `Actuación ${f.orden}`}
                                        </span>
                                        {f.ficha && <span className="text-[9px] font-black uppercase tracking-wider text-white/30">{f.ficha}</span>}
                                    </div>
                                    {f.titular && <p className="text-[10px] text-white/35 truncate">{f.titular}</p>}
                                    {f.avisos.map((a, j) => (
                                        <p key={j} className={`text-[10px] mt-0.5 ${f.aplicable ? 'text-amber-300/80' : 'text-red-400/90'}`}>⚠ {a}</p>
                                    ))}
                                </div>
                                <div className="text-right shrink-0">
                                    <p className="text-[13px] font-black text-white leading-tight">
                                        {f.ahorro_kwh != null ? kwh(f.ahorro_kwh) : '—'}
                                    </p>
                                    {/* Lo que ya constaba, para ver de un vistazo qué cambia. */}
                                    {cambia && (
                                        <p className="text-[9px] text-amber-300/70 leading-tight">antes {kwh(f.ahorro_actual_kwh)}</p>
                                    )}
                                    {f.ahorro_kwh != null && <p className="text-[9px] text-white/25 leading-tight">{mwh(f.ahorro_kwh)}</p>}
                                </div>
                            </label>
                        );
                    })}

                    {/* Contraste con el total que declara el propio informe: si no
                        cuadra, algo se ha leído mal o el informe se contradice. */}
                    {propuesta?.total?.total != null && (
                        <div className="flex items-center justify-between rounded-xl border border-white/[0.06] px-3 py-2 mt-1">
                            <span className="text-[10px] uppercase tracking-wider font-black text-white/30">Total del informe</span>
                            <span className={`text-[11px] font-black ${propuesta.total.cuadra ? 'text-emerald-400' : 'text-amber-300'}`}>
                                {kwh(propuesta.total.total)}
                                {!propuesta.total.cuadra && <span className="text-white/30 font-normal"> · suma {kwh(propuesta.total.suma)}</span>}
                            </span>
                        </div>
                    )}
                </div>

                {/* Pie: lo que se va a escribir, dicho con todas sus letras. */}
                <div className="p-5 border-t border-white/[0.06] shrink-0 space-y-3">
                    {error && <p className="text-[11px] text-red-400">{error}</p>}
                    {hecho ? (
                        <>
                            <p className="text-[11px] text-emerald-400">
                                ✓ Registrado en {hecho.aplicados?.length || 0} expediente{(hecho.aplicados?.length || 0) === 1 ? '' : 's'}.
                                {(hecho.errores?.length || 0) > 0 && <span className="text-amber-300"> {hecho.errores.length} con error.</span>}
                            </p>
                            <button type="button" onClick={onClose}
                                className="w-full py-3 rounded-xl bg-white/[0.06] text-white text-[12px] font-black uppercase tracking-wider hover:bg-white/[0.1] transition-colors">
                                Cerrar
                            </button>
                        </>
                    ) : (
                        <>
                            <p className="text-[10px] text-white/35 leading-snug">
                                Se escribirá el ahorro verificado de {seleccionadas.length} expediente{seleccionadas.length === 1 ? '' : 's'}
                                {seleccionadas.length > 0 && <> ({kwh(sumaSel)} en total)</>}. Es la cifra sobre la que se factura al
                                Sujeto Obligado y sobre la que se le paga el bono al cliente.
                            </p>
                            <div className="flex gap-2">
                                <button type="button" onClick={onClose} disabled={guardando}
                                    className="flex-1 py-3 rounded-xl bg-white/[0.04] text-white/60 text-[12px] font-black uppercase tracking-wider hover:bg-white/[0.08] transition-colors disabled:opacity-40">
                                    Cancelar
                                </button>
                                <button type="button" onClick={aplicar} disabled={guardando || !seleccionadas.length}
                                    className="flex-[2] py-3 rounded-xl bg-brand text-black text-[12px] font-black uppercase tracking-wider hover:brightness-110 transition-all disabled:opacity-30 disabled:cursor-not-allowed">
                                    {guardando ? 'Registrando…' : `Registrar ${seleccionadas.length || ''} ahorro${seleccionadas.length === 1 ? '' : 's'} verificado${seleccionadas.length === 1 ? '' : 's'}`}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

export default AhorrosVerificadosModal;
