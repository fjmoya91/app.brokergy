/**
 * «Vía de tramitación»: el CONMUTADOR para acogerse al FACTOR MULTIPLICADOR antes
 * de aceptar (Fran: «la app deberá poder acogerse a este factor multiplicador si el
 * cliente cumple»).
 *
 * REGLA — escribe `inputs.ruta_fm`, NUNCA `via_fm` (regla 200: `financialScrub`
 * borra toda clave `via_fm` a quien no es ADMIN). Lo guarda su propia ruta
 * (`POST /api/oportunidades/:id/ruta-fm`, solo el equipo interno), que vuelve a
 * comprobar en el servidor que la simulación GUARDADA es elegible; el guardado de
 * la calculadora no la toca (`conservarRutaFm`). Al aceptar, el expediente sale de
 * su serie (26RES060FM_N).
 *
 * REGLA — si no se puede activar, se queda DESHABILITADO y dice por qué: sin
 * guardar, con cambios sin guardar, sin cálculo FM, no elegible (lo que bloquea),
 * o ya expediente (la vía se cambia en su pestaña «Vía FM», que renumera).
 * Apagarla se puede siempre antes del expediente.
 *
 * Solo el equipo interno, y sin importes: el € de cada vía es de ADMIN (regla 102)
 * y ya está en la tarjeta «Vía FM».
 */
import React, { useState } from 'react';
import axios from 'axios';
import { FM_ACS_QUE_HACER } from '../logic/res060fc';

const cierto = (v) => v === true || v === 'true' || v === 1 || v === '1';

export function ConmutadorViaFm({ inputs, result, onInputChange, sinGuardar = false, expediente = null, conTarjetaFm = false }) {
    const [enviando, setEnviando] = useState(false);
    const [error, setError] = useState(null);

    // Donde la vía FM no existe, no hay nada que elegir.
    if (String(inputs?.sector || '').toLowerCase() === 'terciario') return null;
    if (cierto(inputs?.isReforma) && inputs?.comparativaReforma === false) return null;

    const fc = result?.res060fc || null;
    const activa = inputs?.ruta_fm === true;
    const bloquea = (fc?.avisos || []).find((a) => a.tono === 'bloquea');
    const faltaAcs = !!(fc?.acsSupuesto || fc?.acsSinScop);
    const ficha = fc?.ficha || (cierto(inputs?.hibridacion) ? 'RES093_FM' : 'RES060_FM');
    const serie = `${new Date().getFullYear().toString().slice(-2)}${cierto(inputs?.hibridacion) ? 'RES093' : 'RES060'}FM`;

    // Por qué no se puede pulsar (null = se puede).
    let motivo = null;
    if (expediente) motivo = `Ya es el expediente ${expediente.numero_expediente || ''}: la vía se cambia en su pestaña «Vía FM», que le da el número de la otra serie.`;
    else if (!inputs?.id_oportunidad) motivo = 'Guarda antes la oportunidad: la vía se elige sobre lo guardado.';
    else if (!activa && sinGuardar) motivo = 'Hay cambios sin guardar: guarda la simulación y elige la vía sobre lo guardado.';
    else if (!activa && !fc) motivo = 'Faltan la superficie y una demanda de calefacción para calcular la vía FM.';
    else if (!activa && fc.elegible === false) motivo = `No es elegible: ${bloquea?.texto || 'ver los avisos de la vía FM'}`;

    const cambiar = async () => {
        if (motivo || enviando) return;
        setEnviando(true);
        setError(null);
        try {
            const { data } = await axios.post(`/api/oportunidades/${encodeURIComponent(inputs.id_oportunidad)}/ruta-fm`, { activar: !activa });
            onInputChange((prev) => ({ ...prev, ruta_fm: data?.ruta_fm === true }));
        } catch (e) {
            setError(e?.response?.data?.error || 'No se ha podido cambiar la vía.');
        } finally {
            setEnviando(false);
        }
    };

    return (
        <div className={`mt-4 glass-card px-4 py-3 ${activa ? 'border-violet-400/50 shadow-[0_0_20px_rgba(139,92,246,0.15)]' : 'border-violet-500/20'}`} data-testid="conmutador-via-fm">
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <div className="text-[10px] font-black uppercase tracking-widest text-violet-300">Vía de tramitación</div>
                    <div className="text-sm font-bold text-white">
                        {activa ? <>Factor multiplicador · <span className="text-violet-300">{ficha}</span></> : 'Ficha vigente'}
                    </div>
                    <div className="text-[11px] text-slate-400">
                        {activa ? `Al aceptar, el expediente sale de la serie ${serie}_N.` : 'Al aceptar, numeración de siempre.'}
                    </div>
                </div>
                <button
                    type="button"
                    role="switch"
                    aria-checked={activa}
                    aria-label="Acogerse al factor multiplicador"
                    onClick={cambiar}
                    disabled={!!motivo || enviando}
                    title={motivo || (activa ? 'Volver a la ficha vigente' : `Acogerse al factor multiplicador (${ficha})`)}
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${activa ? 'bg-violet-500 border-violet-300' : 'bg-white/10 border-white/20 hover:border-violet-400/60'}`}
                >
                    <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${activa ? 'translate-x-6' : 'translate-x-1'} ${enviando ? 'animate-pulse' : ''}`} />
                </button>
            </div>

            {motivo && <p className="mt-2 text-[11px] leading-snug text-slate-400">{motivo}</p>}
            {activa && !expediente && fc?.elegible === false && (
                <p className="mt-2 text-[11px] leading-snug px-3 py-1.5 rounded-lg border-l-2 bg-amber-500/10 border-amber-400 text-amber-100">
                    Marcada la vía FM, pero con la simulación de ahora no es elegible: {bloquea?.texto || 'ver los avisos'} Apágala o corrige la simulación antes de aceptar.
                </p>
            )}
            {/* El aviso del ACS, aquí solo si no hay tarjeta «Vía FM» debajo que ya lo diga (29.d). */}
            {faltaAcs && fc?.elegible !== false && (!conTarjetaFm || activa) && (
                <p className="mt-2 text-[11px] leading-snug px-3 py-1.5 rounded-lg border-l-2 bg-amber-500/10 border-amber-400 text-amber-100">
                    Falta el ACS. {FM_ACS_QUE_HACER}
                </p>
            )}
            {error && <p className="mt-2 text-[11px] leading-snug text-red-300">{error}</p>}
        </div>
    );
}
