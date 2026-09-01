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
const eur = (n) => `${Number(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

// El mismo modal sirve para los DOS documentos que traen cifras, porque el gesto
// es idéntico —revisar lo leído, casado contra los expedientes, y aplicarlo— y lo
// único que cambia es QUÉ número se escribe. Dos modales gemelos acabarían
// divergiendo justo en la parte delicada, que es la de los avisos.
const MODOS = {
    informe: {
        titulo: 'Lo que dice el informe de verificación',
        rotulo: 'Ahorro e inversión verificados',
        ruta: (id) => `/api/lotes/${id}/ahorros-verificados`,
        // El informe trae las DOS cifras y las dos se aplican de una vez: eran dos
        // revisiones para dos números que vienen en el mismo papel.
        valor: (f) => (f.ahorro_kwh != null ? kwh(f.ahorro_kwh) : '—'),
        sub: (f) => (f.inversion_eur != null ? `inversión ${eur(f.inversion_eur)}` : (f.ahorro_kwh != null ? mwh(f.ahorro_kwh) : null)),
        antes: (f) => (f.ahorro_actual_kwh != null && f.ahorro_actual_kwh !== f.ahorro_kwh ? `antes ${kwh(f.ahorro_actual_kwh)}` : null),
        pie: (n, filas) => `Se escribirá el ahorro verificado de ${n} expediente${n === 1 ? '' : 's'}`
            + (n ? ` (${kwh(filas.reduce((a, f) => a + (Number(f.ahorro_kwh) || 0), 0))} en total)` : '')
            + (filas.some(f => f.inversion_eur != null) ? ', y su inversión' : '')
            + '. Es la cifra sobre la que se factura al Sujeto Obligado y sobre la que se le paga el bono al cliente.',
        boton: (n) => `Registrar ${n || ''} expediente${n === 1 ? '' : 's'}`,
    },
    dictamen: {
        titulo: 'Lo que dice el dictamen de verificación',
        rotulo: 'Inversión definitiva',
        ruta: (id) => `/api/lotes/${id}/dictamen/aplicar`,
        valor: (f) => (f.inversion_eur != null ? eur(f.inversion_eur) : '—'),
        sub: (f) => (f.ahorro_kwh != null ? kwh(f.ahorro_kwh) : null),
        antes: (f) => (f.inversion_actual_eur != null && Math.abs(f.inversion_actual_eur - f.inversion_eur) >= 0.01
            ? `antes ${eur(f.inversion_actual_eur)}` : null),
        pie: (n, filas) => `Se escribirá la inversión definitiva de ${n} expediente${n === 1 ? '' : 's'}`
            + (n ? ` (${eur(filas.reduce((a, f) => a + (Number(f.inversion_eur) || 0), 0))} en total)` : '')
            + '. Manda sobre la declarada al principio: es la que el organismo de verificación ha dado por buena.',
        boton: (n) => `Registrar ${n || ''} inversi${n === 1 ? 'ón' : 'ones'}`,
    },
};

export function AhorrosVerificadosModal({ lote, propuesta, modo = 'informe', onClose, onAplicado }) {
    const cfg = MODOS[modo] || MODOS.informe;
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

    const aplicar = async () => {
        if (!seleccionadas.length) return;
        setGuardando(true);
        setError('');
        try {
            const cuerpo = modo === 'dictamen'
                ? {
                    filas: seleccionadas.map(f => ({
                        expediente_id: f.expediente_id, inversion_eur: f.inversion_eur, vida_util: f.vida_util,
                    })),
                    numero_dictamen: propuesta?.dictamen?.numero_dictamen || null,
                    fecha_emision: propuesta?.dictamen?.fecha_emision || null,
                }
                : {
                    filas: seleccionadas.map(f => ({
                        expediente_id: f.expediente_id, ahorro_kwh: f.ahorro_kwh,
                        inversion_eur: f.inversion_eur ?? null, vida_util: f.vida_util ?? null,
                    })),
                    informe_expediente_cae: propuesta?.informe?.expediente_cae || null,
                    informe_fecha: propuesta?.informe?.fecha_informe || null,
                };
            const { data } = await axios.post(cfg.ruta(lote.id), cuerpo);
            setHecho(data);
            if (onAplicado) onAplicado(data);
        } catch (err) {
            setError(err.response?.data?.error || 'No se pudo registrar lo leído.');
        } finally {
            setGuardando(false);
        }
    };

    // La cabecera identifica el documento del que salen las cifras, sea cual sea.
    const inf = propuesta?.informe || propuesta?.dictamen || {};

    return (
        <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-6"
            onClick={(e) => { if (e.target === e.currentTarget && !guardando) onClose(); }}>
            <div className="bg-bkg-base border border-white/[0.08] rounded-t-[1.75rem] sm:rounded-[1.75rem] w-full sm:max-w-2xl max-h-[92vh] flex flex-col">

                {/* Cabecera: de qué documento salen estos números. */}
                <div className="p-5 border-b border-white/[0.06] shrink-0">
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30">{cfg.rotulo} · {lote?.codigo}</p>
                    <h3 className="text-lg font-black text-white mt-1">{cfg.titulo}</h3>
                    <p className="text-[11px] text-white/40 mt-1">
                        {[inf.numero_dictamen, inf.expediente_cae, inf.entidad_verificadora || inf.organismo,
                          inf.fecha_informe || inf.fecha_emision].filter(Boolean).join(' · ') || cfg.titulo}
                    </p>
                    {(inf.dictamen || inf.decision) && (
                        <p className="text-[10px] text-emerald-400/70 mt-1">{inf.dictamen || inf.decision}</p>
                    )}
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
                        const antes = cfg.antes(f);
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
                                    <p className="text-[13px] font-black text-white leading-tight">{cfg.valor(f)}</p>
                                    {/* Lo que ya constaba, para ver de un vistazo qué cambia. */}
                                    {antes && <p className="text-[9px] text-amber-300/70 leading-tight">{antes}</p>}
                                    {cfg.sub(f) && <p className="text-[9px] text-white/25 leading-tight">{cfg.sub(f)}</p>}
                                </div>
                            </label>
                        );
                    })}

                    {/* Contraste con el total que declara el propio documento: si no
                        cuadra, algo se ha leído mal o el documento se contradice. */}
                    {propuesta?.total?.total != null && (
                        <div className="flex items-center justify-between rounded-xl border border-white/[0.06] px-3 py-2 mt-1">
                            <span className="text-[10px] uppercase tracking-wider font-black text-white/30">
                                Total del {modo === 'dictamen' ? 'dictamen' : 'informe'}
                            </span>
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
                                {cfg.pie(seleccionadas.length, seleccionadas)}
                            </p>
                            <div className="flex gap-2">
                                <button type="button" onClick={onClose} disabled={guardando}
                                    className="flex-1 py-3 rounded-xl bg-white/[0.04] text-white/60 text-[12px] font-black uppercase tracking-wider hover:bg-white/[0.08] transition-colors disabled:opacity-40">
                                    Cancelar
                                </button>
                                <button type="button" onClick={aplicar} disabled={guardando || !seleccionadas.length}
                                    className="flex-[2] py-3 rounded-xl bg-brand text-black text-[12px] font-black uppercase tracking-wider hover:brightness-110 transition-all disabled:opacity-30 disabled:cursor-not-allowed">
                                    {guardando ? 'Registrando…' : cfg.boton(seleccionadas.length)}
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
