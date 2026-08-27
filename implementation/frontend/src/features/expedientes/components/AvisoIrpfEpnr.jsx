import { useMemo } from 'react';
import { parseEpnrFromXml } from '../../calculator/logic/xmlCeeParser';
import { comprobarIrpf, UMBRAL_AHORRO } from '../logic/irpfEpnr';

// ─────────────────────────────────────────────────────────────────────────────
// ¿Los dos certificados valen para la deducción del IRPF?
//
// Se pinta solo cuando el expediente tiene las DOS fases: sin el CEE de después
// no hay nada que comparar, y un recuadro diciendo "faltan datos" en un
// expediente que aún no ha empezado la obra es ruido.
//
// REGLA — el dato se recalcula del `.xml` GUARDADO cuando el CEE parseado no lo
// trae. Los certificados subidos antes de que existiera esta comprobación tienen
// en `cee_inicial`/`cee_final` un objeto sin el consumo de energía primaria no
// renovable; el `.xml` crudo sí sigue en `xml_inicial`/`xml_final`. Sin este
// rescate, la comprobación solo funcionaría con lo que se suba a partir de hoy y
// no serviría para ninguno de los expedientes que ya hay.
// ─────────────────────────────────────────────────────────────────────────────

const n2 = (v) => Number(v).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** El CEE parseado; si le falta el dato nuevo, se vuelve a leer del .xml guardado. */
function conEpnr(parseado, xmlCrudo) {
    if (parseado?.epnrConsumo) return parseado;
    if (!xmlCrudo || typeof xmlCrudo !== 'string') return parseado;
    // `parseEpnrFromXml` y no `parseCeeXml`: aquel exige demanda de calefacción y
    // lanza si no la encuentra, y busca los tags con mayúsculas exactas — el XML
    // guardado viene entero en mayúsculas, así que no lo puede releer.
    const re = parseEpnrFromXml(xmlCrudo);
    if (!re.epnrConsumo) return parseado;
    // Solo se aporta lo que faltaba: lo ya guardado manda, porque puede haberse
    // corregido a mano después de subir el fichero.
    return {
        ...(parseado || {}),
        epnrConsumo: re.epnrConsumo,
        epnrLetra: re.epnrLetra,
        epnrEscala: re.epnrEscala,
        superficieHabitable: parseado?.superficieHabitable ?? re.superficieHabitable,
    };
}

const Cifra = ({ rotulo, valor, unidad, letra }) => (
    <div className="min-w-0">
        <div className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-1">{rotulo}</div>
        <div className="text-lg font-black text-white leading-none">
            {valor}
            {unidad && <span className="text-[10px] font-bold text-white/35 ml-1">{unidad}</span>}
        </div>
        {letra && (
            <div className="mt-1.5 inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-black bg-white/10 text-white/70">
                {letra}
            </div>
        )}
    </div>
);

export function AvisoIrpfEpnr({ cee }) {
    const r = useMemo(() => {
        const ini = conEpnr(cee?.cee_inicial, cee?.xml_inicial);
        const fin = conEpnr(cee?.cee_final, cee?.xml_final);
        return comprobarIrpf(ini, fin);
    }, [cee?.cee_inicial, cee?.cee_final, cee?.xml_inicial, cee?.xml_final]);

    if (r.estado === 'faltan_datos') {
        return (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-5 py-4">
                <div className="text-[10px] font-black uppercase tracking-widest text-white/35 mb-2">
                    Deducción IRPF · consumo de energía primaria no renovable
                </div>
                <ul className="space-y-1">
                    {r.falta.map((f, i) => (
                        <li key={i} className="text-xs text-white/45 flex gap-2">
                            <span className="text-white/20">·</span><span>{f}</span>
                        </li>
                    ))}
                </ul>
            </div>
        );
    }

    const ok = r.cumple;
    return (
        <div className={`rounded-2xl border px-5 py-4 ${ok
            ? 'border-emerald-500/30 bg-emerald-500/[0.07]'
            : 'border-amber-500/30 bg-amber-500/[0.07]'}`}>

            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-white/35 mb-1.5">
                        Deducción IRPF · consumo de energía primaria no renovable
                    </div>
                    <div className={`text-sm font-black ${ok ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {ok ? '✅ Los certificados CUMPLEN el requisito' : '⚠️ Los certificados NO cumplen el requisito'}
                    </div>
                    {/* POR QUÉ cumple, no solo que cumple: son dos vías y saber
                        cuál se ha usado es lo que hace falta si mañana alguien
                        pregunta, o si el certificado final cambia. */}
                    <div className="text-xs text-white/50 mt-1">
                        {ok ? (
                            <>Vale por {r.porAhorro && r.porLetra
                                ? <>las dos vías: <b className="text-white/70">ahorro del {n2(r.ahorroPct)} %</b> y <b className="text-white/70">letra {r.letraFin}</b></>
                                : r.porAhorro
                                    ? <>el <b className="text-white/70">ahorro del {n2(r.ahorroPct)} %</b> (se exige {UMBRAL_AHORRO} %)</>
                                    : <>la <b className="text-white/70">calificación {r.letraFin}</b> del certificado final</>}
                            </>
                        ) : (
                            <>Se exige un ahorro del {UMBRAL_AHORRO} % —hay {n2(r.ahorroPct)} %— o letra A/B
                            {r.letraFin ? <> —hay {r.letraFin}—</> : null}.
                            {r.faltaParaB != null && <> Para la B habría que bajar otros <b className="text-white/70">{n2(r.faltaParaB)} kWh/m²·año</b>.</>}</>
                        )}
                    </div>
                </div>

                <div className="flex items-start gap-6">
                    <Cifra rotulo="Antes" valor={n2(r.consumoIni)} unidad="kWh/m²·año" letra={r.letraIni} />
                    <div className="text-white/20 text-lg font-black pt-4">→</div>
                    <Cifra rotulo="Después" valor={n2(r.consumoFin)} unidad="kWh/m²·año" letra={r.letraFin} />
                    <Cifra rotulo="Ahorro" valor={`${n2(r.ahorroPct)} %`} />
                </div>
            </div>

            {r.avisos.length > 0 && (
                <ul className="mt-3 pt-3 border-t border-white/10 space-y-1">
                    {r.avisos.map((a, i) => (
                        <li key={i} className="text-[11px] text-amber-300/80 flex gap-2">
                            <span>⚠️</span><span>{a}</span>
                        </li>
                    ))}
                </ul>
            )}

            {/* El certificado cumple un requisito técnico; el derecho a la
                deducción depende además de plazos, base máxima y de la
                declaración de cada uno. Decirlo evita que esto se lea como un
                consejo fiscal, que no lo es. */}
            <p className="mt-3 text-[10px] text-white/25 leading-relaxed">
                Comprobación técnica sobre los certificados (DA 50ª Ley del IRPF): ahorro ≥ {UMBRAL_AHORRO} % en
                consumo de energía primaria no renovable o calificación A/B en ese indicador. No valora plazos,
                base máxima ni la situación fiscal del cliente.
            </p>
        </div>
    );
}

export default AvisoIrpfEpnr;
