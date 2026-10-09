import { useMemo, useRef } from 'react';
import { NIVEL_CUBIERTA, TIPOS_EQUIPO, cajaDe, marcasDelPlano, nombreDelSitio, sitioRotuloFaldon,
         tipoEquipo, trazosIcono } from '../logic/equiposPlano';
import { poloInaccesible } from '../logic/rotulosPlano';
import { BotonTira, TiraModo } from './TiraPlano';

// ============================================================================
// Los EQUIPOS sobre el plano: dónde está la caldera que se retira, dónde va la
// máquina nueva, el depósito de ACS y la unidad exterior — y el PLANO DE
// CUBIERTA, con sus tejas, para la unidad exterior que va en el tejado.
//
// Lo que se guarda y cómo (uno por tipo, en el MUNDO, por nivel) vive en
// `logic/equiposPlano.js`, que es también lo que usa el PDF del croquis: el
// icono es el MISMO trazo en la pantalla y en el papel.
//
// Es un MODO, como la pizarra o la cubierta: con un equipo «en la mano», un
// toque sobre el plano lo coloca y arrastrar sigue moviendo el plano. Otro
// toque lo cambia de sitio; la ✕ de su botón lo quita.
// ============================================================================

/** El icono de un tipo, para un botón o una lista (HTML). */
export function IconoEquipo({ tipo, size = 20, className = '' }) {
    const t = tipoEquipo(tipo);
    if (!t) return null;
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"
             className={`shrink-0 ${className}`}>
            <rect width="24" height="24" rx="5.3" fill={t.color} />
            <Trazos tipo={tipo} />
        </svg>
    );
}

function Trazos({ tipo }) {
    return trazosIcono(tipo).map((p, i) => (p.relleno
        ? <path key={i} d={p.d} fill="#fff" />
        : <path key={i} d={p.d} fill="none" stroke="#fff" strokeWidth={p.trazo || 1.5}
                strokeLinecap="round" strokeLinejoin="round" />));
}

/**
 * Los iconos DENTRO del SVG de un plano (en metros del lienzo). `tam` es la
 * letra del plano: el icono mide lo mismo en pantalla se amplíe o no. Llega la
 * maqueta ya hecha (`marcas`, la misma que ha apartado los rótulos del plano) o
 * los equipos para hacerla aquí.
 *
 * Se pinta en DOS pasadas: primero las líneas de los iconos corridos y después
 * los iconos. En una, la línea del equipo nuevo pasaba POR ENCIMA de la llama de
 * la caldera que tiene debajo, y sin la llama la caldera y la máquina nueva solo
 * se distinguían por el rojo y el verde (revisión de diseño, 09/10/2026).
 */
export function MarcasEquipos({ marcas: marcasIn = null, equipos = [], tam, papel = 'rgb(var(--bkg-deep))',
                                elegido = null }) {
    const marcas = marcasIn || marcasDelPlano(equipos, tam);
    if (!marcas.length) return null;
    return (
        <g style={{ pointerEvents: 'none' }}>
            {marcas.filter(m => m.corrida).map(({ e, ancla, pos }) => {
                const t = tipoEquipo(e.tipo);
                return (
                    <g key={`l-${e.tipo}`}>
                        <line x1={ancla[0]} y1={ancla[1]} x2={pos[0]} y2={pos[1]}
                              stroke={t?.color} strokeWidth={tam * 0.12} />
                        <circle cx={ancla[0]} cy={ancla[1]} r={tam * 0.28} fill={t?.color}
                                stroke={papel} strokeWidth={tam * 0.08} />
                    </g>
                );
            })}
            {marcas.map(({ e, pos, lado, fs, ancho, texto }) => {
                const t = tipoEquipo(e.tipo);
                if (!t) return null;
                return (
                    <g key={e.tipo}>
                        {elegido === e.tipo && (
                            <rect x={pos[0] - lado * 0.72} y={pos[1] - lado * 0.72}
                                  width={lado * 1.44} height={lado * 1.44} rx={lado * 0.36}
                                  fill="none" stroke={t.color} strokeWidth={tam * 0.16}
                                  strokeDasharray={`${tam * 0.4} ${tam * 0.25}`} />
                        )}
                        <g transform={`translate(${pos[0] - lado / 2} ${pos[1] - lado / 2})`}>
                            <rect width={lado} height={lado} rx={lado * 0.22} fill={t.color}
                                  stroke={papel} strokeWidth={lado * 0.08} />
                            <g transform={`scale(${lado / 24})`}><Trazos tipo={e.tipo} /></g>
                        </g>
                        <rect x={pos[0] - ancho / 2} y={pos[1] + lado * 0.58}
                              width={ancho} height={fs * 1.35} rx={fs * 0.25}
                              fill={papel} opacity={0.92} />
                        <text x={pos[0]} y={pos[1] + lado * 0.58 + fs * 1.0} fontSize={fs}
                              fontWeight={800} textAnchor="middle" fill={t.color}>
                            {texto}
                        </text>
                    </g>
                );
            })}
        </g>
    );
}

/**
 * La TIRA del modo: qué equipo se tiene en la mano, dónde está ya cada uno
 * (con su ✕) y el plano de cubierta. Va UNA vez, encima de las plantas: el
 * equipo elegido vale para cualquiera de ellas y para la cubierta.
 */
export function EquiposControl({ enMano, onEnMano, equipos = [], plantas = [], verCubierta = false,
                                 onVerCubierta = null, cubiertaFija = false, onQuitar, onCerrar }) {
    const sitio = new Map(equipos.map(e => [e.tipo, e.nivel]));
    const actual = tipoEquipo(enMano) || TIPOS_EQUIPO[0];
    // «Toca en el plano dónde está HOY la caldera…»: la ayuda de cada tipo empieza
    // por «dónde…».
    const instruccion = `Toca en el plano ${actual.ayuda}. Otro toque lo cambia de sitio; arrastrando se mueve el plano. `
        + 'Sale en el plano y el croquis, no en el .cex.';
    return (
        <TiraModo tono="emerald"
                  titulo={<>📍 Equipos</>}
                  contador={`${equipos.length} de ${TIPOS_EQUIPO.length} colocados`}
                  acciones={(
                      <>
                          {onVerCubierta && (
                              <BotonTira tono={verCubierta ? 'emerald' : 'neutro'}
                                         aria-pressed={verCubierta} disabled={cubiertaFija}
                                         onClick={() => onVerCubierta(!verCubierta)}
                                         title={cubiertaFija
                                             ? 'Hay un equipo en la cubierta: su plano se queda a la vista'
                                             : 'Un plano más, la CUBIERTA vista desde arriba con sus tejas: '
                                               + 'para marcar la unidad exterior que va en el tejado'}>
                                  🏠 Plano de cubierta
                              </BotonTira>
                          )}
                          <BotonTira tono="emerald" mayus onClick={onCerrar}>✓ Cerrar</BotonTira>
                      </>
                  )}
                  instruccion={<><b className="text-white">{actual.etiqueta}:</b> {instruccion}</>}>
            <span className="flex min-w-0 flex-wrap items-center gap-1" role="group"
                  aria-label="Qué equipo se coloca">
                {TIPOS_EQUIPO.map((t) => {
                    const activo = t.id === enMano;
                    const n = sitio.get(t.id);
                    const donde = n === undefined ? null : nombreDelSitio(n, plantas);
                    return (
                        <span key={t.id} className="inline-flex h-7 items-center gap-0.5">
                            <button type="button" aria-pressed={activo}
                                    onClick={() => onEnMano(t.id)}
                                    title={`${t.etiqueta}: ${t.ayuda}${donde ? ` · ahora en ${donde}` : ''}`}
                                    className={`inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md border
                                                px-1.5 text-[11px] font-bold transition
                                                ${activo ? 'border-emerald-300 bg-emerald-500/20 text-white'
                                                         : 'border-white/10 bg-white/[0.03] text-white/80 hover:bg-white/[0.07]'}`}>
                                <IconoEquipo tipo={t.id} size={18} />
                                <span>{t.etiqueta}</span>
                                <span className={`text-[10px] font-semibold
                                                  ${donde ? 'text-emerald-300' : 'text-white/40'}`}>
                                    {donde ? `✓ ${donde}` : 'sin poner'}
                                </span>
                            </button>
                            {donde && (
                                <button type="button" onClick={() => onQuitar(t.id)}
                                        aria-label={`Quitar ${t.etiqueta}`} title={`Quitar ${t.etiqueta}`}
                                        className="inline-flex h-7 w-7 items-center justify-center rounded-md
                                                   text-[12px] text-white/50 hover:bg-white/[0.07] hover:text-white">
                                    ✕
                                </button>
                            )}
                        </span>
                    );
                })}
            </span>
        </TiraModo>
    );
}

//: El color de la TEJA: un material, no un dato del plano, así que es el mismo
//: en los dos temas — va con transparencia para que el fondo se note debajo.
const TEJA = { fondo: '#C2643A', linea: '#E7955F' };

/**
 * El PLANO DE CUBIERTA: el tejado visto desde arriba, con sus tejas, para
 * marcar dónde va la unidad exterior. Cada faldón es una edificación de
 * Catastro (la casa, el garaje…) a la altura de su planta más alta, así que
 * el tejado del garaje se ve como uno más bajo junto al de la casa —y más
 * CLARO: se nota la diferencia sin leer el rótulo—.
 *
 * Mismo lienzo que las plantas: lo que se marca aquí cae en el mismo sitio del
 * mundo que lo de debajo.
 */
export function PlanoCubierta({ faldones = [], contexto = null, equipos = [], enMano = null,
                                onPoner = null, alinear = false, plantas = [] }) {
    const svgRef = useRef(null);
    const caja = useMemo(() => cajaDe(faldones, equipos.map(e => e.lienzo)), [faldones, equipos]);
    if (!caja) {
        return (
            <div className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.05] p-4 text-[12px] text-amber-200/80">
                <b className="text-[13px] font-black tracking-wide">CUBIERTA</b>
                <p className="mt-1">No hay contorno del edificio para dibujar el tejado: vuelve a traer la envolvente.</p>
            </div>
        );
    }
    const margen = Math.max(2.5, (caja.x1 - caja.x0) * 0.12);
    const vb = { x: caja.x0 - margen, y: caja.y0 - margen,
                 w: caja.x1 - caja.x0 + 2 * margen, h: caja.y1 - caja.y0 + 2 * margen };
    const tam = Math.max(vb.w, vb.h) / 42;
    const papel = 'rgb(var(--bkg-deep))';
    const marcas = marcasDelPlano(equipos, tam);
    const niveles = new Set(faldones.map(f => f.nivel));
    const arriba = Math.max(...faldones.map(f => f.nivel));
    const uid = 'cub';
    const pulsar = (e) => {
        if (!enMano || !onPoner || !svgRef.current) return;
        const svg = svgRef.current;
        const p = svg.createSVGPoint();
        p.x = e.clientX; p.y = e.clientY;
        const q = p.matrixTransform(svg.getScreenCTM().inverse());
        onPoner(NIVEL_CUBIERTA, [Math.round(q.x * 100) / 100, Math.round(q.y * 100) / 100]);
    };
    const nombreNivel = (n) => nombreDelSitio(n, plantas).toLowerCase();
    return (
        <div className={`rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3
                         ${alinear ? 'row-span-3 grid grid-rows-subgrid gap-y-0' : ''}`}>
            <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                <b className="text-[13px] font-black tracking-wide">CUBIERTA</b>
                <span className="text-[11px] text-white/35">vista desde arriba</span>
            </div>
            <div />
            <div>
                <div className="relative overflow-hidden rounded-xl border border-white/[0.05]"
                     style={{ background: papel }}>
                    <svg ref={svgRef} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
                         className={`block w-full select-none ${enMano ? 'cursor-crosshair' : ''}`}
                         style={{ aspectRatio: `${vb.w} / ${vb.h}`, height: 'auto', minHeight: 260,
                                  maxHeight: 'min(68vh, 900px)' }}
                         onClick={pulsar}>
                        <defs>
                            {/* La TEJA ÁRABE: hileras de arcos, una de cada dos
                                corrida media teja, como se ve un tejado desde
                                arriba en un plano de cubiertas. */}
                            <pattern id={`teja-${uid}`} width="0.5" height="0.5" patternUnits="userSpaceOnUse">
                                <rect width="0.5" height="0.5" fill={TEJA.fondo} opacity="0.32" />
                                <path d="M0 0.25 Q0.125 0.04 0.25 0.25 Q0.375 0.04 0.5 0.25
                                         M-0.125 0.5 Q0 0.29 0.125 0.5 Q0.25 0.29 0.375 0.5 Q0.5 0.29 0.625 0.5"
                                      fill="none" stroke={TEJA.linea} strokeWidth="0.035" opacity="0.9" />
                            </pattern>
                        </defs>
                        {(contexto?.vecinos || []).map((v, i) => (
                            <polygon key={`v${i}`} points={v.map(p => p.join(',')).join(' ')}
                                     fill="var(--text-muted)" fillOpacity={0.12}
                                     stroke="var(--text-muted)" strokeOpacity={0.35} strokeWidth={tam * 0.05} />
                        ))}
                        {faldones.map(f => (
                            <polygon key={f.id} points={f.puntos.map(p => p.join(',')).join(' ')}
                                     fill={`url(#teja-${uid})`} fillOpacity={f.nivel < arriba ? 0.6 : 1}
                                     stroke={TEJA.fondo} strokeWidth={tam * 0.14} strokeLinejoin="round" />
                        ))}
                        {/* Con tejados a distintas alturas, a qué planta cubre
                            cada uno: en su sitio más holgado y, si ahí hay un
                            icono, debajo de su rótulo. Con halo: sobre la teja,
                            sin él, no se leía. */}
                        {niveles.size > 1 && faldones.map((f) => {
                            const texto = `sobre ${nombreNivel(f.nivel)}`;
                            const [x, y] = sitioRotuloFaldon(f.puntos, marcas, poloInaccesible,
                                                             { texto, fs: tam * 0.75 });
                            return (
                                <text key={`t${f.id}`} x={x} y={y} fontSize={tam * 0.75} fontWeight={700}
                                      textAnchor="middle" fill="var(--text-primary)"
                                      stroke={papel} strokeWidth={tam * 0.25} paintOrder="stroke"
                                      strokeLinejoin="round" style={{ pointerEvents: 'none' }}>
                                    {texto}
                                </text>
                            );
                        })}
                        <MarcasEquipos marcas={marcas} tam={tam} papel={papel} elegido={enMano} />
                    </svg>
                </div>
                <p className="mt-2 rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-1.5 text-[11px] text-white/45">
                    {enMano
                        ? `Toca sobre el tejado para poner ${tipoEquipo(enMano)?.etiqueta.toLowerCase() || 'el equipo'}.`
                        : 'El tejado, según las edificaciones de Catastro. Para marcar la unidad exterior, abre «📍 Equipos».'}
                </p>
            </div>
        </div>
    );
}

export default MarcasEquipos;
