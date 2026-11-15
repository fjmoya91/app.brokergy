import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
    lecturaCiega, motivoNoElegible, superficieSimulada, construccionesClave, UMBRAL_SE_QUEDA_CORTA,
} from '../logic/estimacionCiega';

// El CEE «A CIEGAS» en Resultados: la cifra de un CEE hecho por programa (motor +
// CE3X 3.2 en el PC, sin IA ni fotos), APARTE de la de la calculadora. Solo el
// equipo interno; la propuesta, el enlace del cliente y el partner no la ven, y
// no cambia nada de lo que se ofrece. Sirve de SEÑAL: si sale > 1,3 veces la de
// la calculadora, la propuesta probablemente se queda corta (Fase 0: 36 de 37).
// Diseño: docs/conocimiento/calculo/cee-a-ciegas-diseno-para-la-oportunidad.md

const fmt = (n, d = 0) => (Number(n) || 0).toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: 'always' });
const fecha = (iso) => { try { return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }); } catch { return ''; } };

export function EstimacionCiega({ inputs, result, ficha }) {
    const id = inputs?.id_oportunidad || null;
    const [datos, setDatos] = useState(null);         // { estimacion, superficie_confirmada }
    const [error, setError] = useState(null);
    const [confirmando, setConfirmando] = useState(false);

    useEffect(() => {
        if (!id) return undefined;
        let vivo = true;
        axios.get(`/api/oportunidades/${encodeURIComponent(id)}/estimacion-ciega`)
            .then(({ data }) => { if (vivo) { setDatos(data); setError(null); } })
            .catch((e) => { if (vivo) setError(e?.response?.data?.error || 'No se ha podido leer la cifra a ciegas.'); });
        return () => { vivo = false; };
    }, [id]);

    if (!id) return null;
    const conConfirmada = { ...inputs, superficie_confirmada: datos?.superficie_confirmada || null };
    const noEntra = motivoNoElegible({ ficha: ficha || inputs?.ficha || 'RES060', inputs, rc: inputs?.rc });
    const est = datos?.estimacion || null;
    const lectura = lecturaCiega(est, { inputs: conConfirmada, rc: inputs?.rc, ahorroCalculadora: result?.savings?.savingsKwh });
    if (noEntra && !est) return null;

    const m2 = superficieSimulada(inputs);
    const confirmar = async () => {
        setConfirmando(true);
        try {
            const { data } = await axios.post(`/api/oportunidades/${encodeURIComponent(id)}/superficie-confirmada`,
                { m2, construcciones: construccionesClave(inputs) });
            setDatos((d) => ({ ...(d || {}), superficie_confirmada: data.superficie_confirmada }));
            setError(null);
        } catch (e) {
            setError(e?.response?.data?.error || 'No se ha podido confirmar la superficie.');
        } finally {
            setConfirmando(false);
        }
    };

    return (
        <div className="mb-4 rounded-xl border border-sky-500/25 bg-sky-500/5 px-4 py-3 text-[12px] leading-relaxed text-slate-300"
             data-testid="estimacion-ciega">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-black uppercase tracking-wider text-sky-300">CEE a ciegas</span>
                <span className="text-[10px] uppercase tracking-widest text-slate-500">solo equipo · no se ofrece</span>
            </div>

            {lectura.estado === 'sin' && (
                <p className="mt-1 text-slate-400">
                    {noEntra ? `No entra: ${noEntra}.` : 'Pendiente del PC: la calcula solo, con CE3X, cuando el vigilante está atendiendo.'}
                </p>
            )}

            {est && lectura.estado !== 'sin' && (
                <>
                    <p className="mt-1">
                        <span className="font-mono text-white">{fmt(est.demanda_ciega, 1)} kWh/m²·año</span>
                        {' × '}{fmt(est.superficie, 1)} m²
                        {' · bono '}<span className="font-mono font-bold text-sky-200">{fmt(est.bono)} €</span>
                        {' · prudente (×'}{fmt(est.coef, 2)}{') '}<span className="font-mono">{fmt(est.bono_prudente)} €</span>
                        <span className="text-slate-500">{' — calculadora: '}{fmt(result?.financials?.caeBonus)} €</span>
                    </p>
                    {lectura.seQuedaCorta && (
                        <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-100">
                            <span className="font-black text-amber-300">⚠ La propuesta probablemente se queda corta</span>
                            {' — '}a ciegas sale {fmt(lectura.ratio, 1)} veces el ahorro de la calculadora (más de {fmt(UMBRAL_SE_QUEDA_CORTA, 1)}).
                            {' '}Conviene hacer el CEE antes de enviarla.
                        </p>
                    )}
                    {lectura.estado === 'desactualizada' && (
                        <p className="mt-1 text-amber-300/90">Hecha con otros datos (superficie, construcciones, caldera o zona): el PC la rehará.</p>
                    )}
                    {lectura.noValida && (
                        <p className="mt-1 text-slate-400">Sin validar: {lectura.noValida}.</p>
                    )}
                    {est.avisos && <p className="mt-1 text-slate-500">{est.avisos}.</p>}
                    <p className="mt-1 text-[10px] text-slate-500">Calificada el {fecha(est.calificado_at)} en {est.equipo || 'el PC'} · {est.version}</p>
                </>
            )}

            {!noEntra && m2 > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                    {lectura.superficieConfirmada ? (
                        <span className="text-emerald-300">
                            ✓ {fmt(lectura.superficieConfirmada.m2)} m² confirmados por {lectura.superficieConfirmada.por} el {fecha(lectura.superficieConfirmada.at)}
                        </span>
                    ) : (
                        <>
                            <span className="text-slate-400">Mira los m² y las construcciones que cuentan:</span>
                            <button type="button" onClick={confirmar} disabled={confirmando}
                                className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-[11px] font-bold text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-50"
                                title="Has mirado los m² y las construcciones que cuentan y son los de la vivienda">
                                {confirmando ? 'Confirmando…' : `✓ Confirmo ${fmt(m2)} m² (estas construcciones)`}
                            </button>
                            {(m2 > 300 || est?.cuerpos_fuera > 0) && (
                                <span className="text-amber-300/90">Míralo antes: {m2 > 300 ? 'más de 300 m²' : ''}{m2 > 300 && est?.cuerpos_fuera ? ' · ' : ''}{est?.cuerpos_fuera ? 'Catastro tiene partes que no son vivienda' : ''}</span>
                            )}
                        </>
                    )}
                </div>
            )}

            {error && <p className="mt-1 text-rose-300">{error}</p>}
        </div>
    );
}
