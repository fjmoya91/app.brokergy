// ============================================================================
// Aviso de Nº DE SERIE REPETIDO en la Instalación.
//
// Un nº de serie identifica UNA máquina: si la caldera que se retira o la
// aerotermia que se pone ya constan en otro expediente, o se ha copiado mal o
// se está presentando dos veces la misma actuación. Se AVISA debajo de la
// casilla, mientras se teclea; no se bloquea nada.
//
// Qué es serie y cómo se compara lo decide el servidor
// (`backend/utils/seriesEquipos.js`, ruta `POST /:id/series-repetidas`); aquí
// solo se pinta. `normSerie` es la misma normalización, para encontrar la
// casilla a la que corresponde cada respuesta.
// ============================================================================
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import axios from 'axios';

const normSerie = (s) => String(s ?? '').trim().toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]/g, '');

const Ctx = createContext(null);

// Solo los nodos que llevan serie: lo mismo que lee el servidor.
const nodosConSerie = (inst) => ({
    caldera_antigua_cal: inst?.caldera_antigua_cal,
    caldera_antigua_acs: inst?.caldera_antigua_acs,
    misma_caldera_acs: inst?.misma_caldera_acs,
    aerotermia_cal: inst?.aerotermia_cal,
    aerotermia_acs: inst?.aerotermia_acs,
    piscina: inst?.piscina,
});

// La firma de lo que importa: solo se vuelve a preguntar si cambia una serie.
const firmaSeries = (inst) => {
    const s = [];
    const de = (u) => u && s.push(u.numero_serie || u.n_serie_ext || '', u.numero_serie_ud_interior || '');
    de(inst?.caldera_antigua_cal);
    de(inst?.caldera_antigua_acs);
    de(inst?.aerotermia_cal);
    (inst?.aerotermia_cal?.equipos_extra || []).forEach(de);
    de(inst?.aerotermia_acs);
    (inst?.aerotermia_acs?.equipos_extra || []).forEach(de);
    de(inst?.piscina?.equipo);
    s.push(String(inst?.misma_caldera_acs), String(inst?.caldera_antigua_cal?.rendimiento_id), String(inst?.piscina?.activa));
    return s.join('|');
};

/**
 * Pregunta al servidor (con 700 ms de calma tras la última tecla) y reparte la
 * respuesta a las casillas. `activo` = false para quien no es staff: la
 * respuesta nombra expedientes ajenos.
 */
export function SeriesRepetidasProvider({ expedienteId, instalacion, activo, children }) {
    const [res, setRes] = useState(null);
    const firma = firmaSeries(instalacion);

    useEffect(() => {
        if (!activo || !expedienteId) return undefined;
        let vivo = true;
        const t = setTimeout(() => {
            axios.post(`/api/expedientes/${expedienteId}/series-repetidas`, { instalacion: nodosConSerie(instalacion) })
                .then(r => { if (vivo) setRes(r.data || null); })
                // Si no se puede comprobar no se dice nada: ni «repetida» ni «todo bien».
                .catch(() => { if (vivo) setRes(null); });
        }, 700);
        return () => { vivo = false; clearTimeout(t); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activo, expedienteId, firma]);

    const valor = useMemo(() => {
        const porNorm = new Map();
        for (const r of res?.repetidas || []) porNorm.set(r.norm, { ...porNorm.get(r.norm), repetida: r });
        for (const c of res?.cruzadas || []) porNorm.set(c.norm, { ...porNorm.get(c.norm), cruzada: c });
        return { porNorm, total: (res?.repetidas?.length || 0) + (res?.cruzadas?.length || 0) };
    }, [res]);

    return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

/** Debajo de la casilla del nº de serie. No pinta nada si la serie no se repite. */
export function AvisoSerieRepetida({ serie }) {
    const ctx = useContext(Ctx);
    const aviso = ctx?.porNorm.get(normSerie(serie));
    if (!aviso) return null;
    const { repetida, cruzada } = aviso;
    return (
        <div className="mt-1 space-y-0.5">
            {repetida && (
                <p className="text-[10px] text-amber-400 leading-snug normal-case tracking-normal">
                    ⚠ Este nº de serie ya consta en{' '}
                    {repetida.en.map((e, i) => (
                        <span key={e.id}>
                            {i > 0 && ', '}
                            <a href={`/?exp=${encodeURIComponent(e.numero_expediente || e.id)}`} target="_blank" rel="noreferrer"
                               className="font-bold underline decoration-amber-400/40 hover:decoration-amber-400">
                                {e.numero_expediente}
                            </a>
                            <span className="text-amber-400/70"> ({e.etiquetas.join(' / ')}{e.estado ? ` · ${e.estado}` : ''})</span>
                        </span>
                    ))}
                    . Comprueba la placa: una máquina solo justifica un ahorro.
                </p>
            )}
            {cruzada && (
                <p className="text-[10px] text-amber-400 leading-snug normal-case tracking-normal">
                    ⚠ La misma serie está en «{cruzada.etiquetas[0]}» y en «{cruzada.etiquetas[1]}»: la caldera
                    que se retira y el equipo nuevo no pueden ser la misma máquina.
                </p>
            )}
        </div>
    );
}

/** Resumen en la cabecera de Instalación, para que no pase desapercibido con la sección plegada. */
export function ResumenSeriesRepetidas() {
    const ctx = useContext(Ctx);
    if (!ctx?.total) return null;
    return (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2 text-[11px] text-amber-300 leading-snug">
            ⚠ {ctx.total === 1 ? 'Hay 1 nº de serie' : `Hay ${ctx.total} nº de serie`} que ya
            {ctx.total === 1 ? ' consta' : ' constan'} en otro expediente o se repite entre la caldera y el equipo
            nuevo. El detalle, debajo de cada casilla.
        </div>
    );
}
