import React, { useState } from 'react';
import { DwellingPicker } from './DwellingPicker';

/**
 * ParcelaCard — lo que se ve cuando la referencia buscada es de PARCELA (14 caracteres)
 * y esa parcela tiene división horizontal: un EDIFICIO, no una vivienda.
 *
 * Hasta 2026-09-11 esa búsqueda no llegaba aquí: el Catastro devuelve la lista de
 * inmuebles (`lrcdnp`) y ningún `bico`, y el servicio moría leyéndolo, así que la app
 * decía "no se pudo completar la búsqueda" — nunca "esto es un bloque de 118 inmuebles".
 *
 * REGLA — la pantalla NO decide por el usuario. La misma referencia sirve para dos
 * trabajos distintos: simular el EDIFICIO COMPLETO (una caldera centralizada, un solo
 * CAE para la comunidad) o entrar a UNA vivienda concreta. Elegir por él sería adivinar
 * cuál de los dos ha venido a hacer, y son propuestas económicamente opuestas.
 *
 * REGLA — el edificio completo es del flujo INTERNO (`permiteBloque`). Un partner o un
 * visitante de la landing que busque su calle tiene que acabar en SU vivienda; ofrecerle
 * simular el bloque entero le daría un bono que no es suyo.
 */
export function ParcelaCard({ parcela, onCalcularBloque, onSelectDwelling, onCancel, permiteBloque = false }) {
    const [rcElegida, setRcElegida] = useState(null);

    if (!parcela) return null;

    const viviendas = parcela.dwellingCount || 0;
    const otros = Math.max(0, (parcela.totalUnits || 0) - viviendas);
    const zona = parcela.climateInfo?.climateZone;
    const n = (v) => (Number(v) || 0).toLocaleString('es-ES');

    const Dato = ({ etiqueta, valor, sufijo }) => (
        <div className="bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3">
            <p className="text-[9px] uppercase tracking-[0.2em] text-white/40 font-black mb-1">{etiqueta}</p>
            <p className="text-white font-black text-lg leading-none">
                {valor}{sufijo && <span className="text-white/50 text-xs font-bold ml-1">{sufijo}</span>}
            </p>
        </div>
    );

    return (
        <div className="bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl">
            <div className="flex items-start gap-4 mb-6">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0 text-2xl">
                    🏢
                </div>
                <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-[0.25em] text-amber-400 font-black mb-1">
                        Edificio completo · división horizontal
                    </p>
                    <h2 className="text-xl sm:text-2xl font-black text-white leading-tight break-words">
                        {parcela.address}
                    </h2>
                    <p className="text-white/50 text-sm mt-1">
                        {[parcela.municipality, parcela.province].filter(Boolean).join(' · ')}
                        {parcela.postalCode ? ` · ${parcela.postalCode}` : ''}
                    </p>
                    {/* Un bloque en esquina tiene dos vías. Esconder la segunda hace dudar
                        de si la referencia encontrada es de verdad la del edificio buscado. */}
                    {Array.isArray(parcela.addresses) && parcela.addresses.length > 1 && (
                        <p className="text-white/40 text-xs mt-1">
                            También da a {parcela.addresses.slice(1).join(' · ')}
                        </p>
                    )}
                    <p className="text-white/30 text-[11px] font-mono mt-2">{parcela.rc}</p>
                </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                <Dato etiqueta="Viviendas" valor={n(viviendas)} />
                <Dato etiqueta="Otros inmuebles" valor={n(otros)} sufijo="garajes, locales…" />
                <Dato etiqueta="Sup. construida viviendas" valor={n(parcela.dwellingSurface)} sufijo="m²" />
                <Dato etiqueta="Año / zona" valor={parcela.yearBuilt || '—'} sufijo={zona ? `· ${zona}` : ''} />
            </div>

            {permiteBloque && (
                <div className="mb-6">
                    <button
                        onClick={() => onCalcularBloque?.(parcela)}
                        className="w-full py-4 px-5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-900 font-black rounded-2xl transition-all shadow-lg shadow-amber-500/20 text-left flex items-center justify-between gap-4"
                    >
                        <span>
                            <span className="block text-base uppercase tracking-tight">Simular el edificio completo</span>
                            <span className="block text-[11px] font-bold text-slate-900/70 normal-case mt-0.5">
                                Instalación centralizada · un solo CAE para la comunidad de propietarios
                            </span>
                        </span>
                        <span className="text-2xl shrink-0">→</span>
                    </button>
                    {/* La superficie del Catastro es CONSTRUIDA y por inmueble; la del cálculo
                        es la útil habitable del certificado del edificio. Decirlo aquí evita
                        que alguien dé por buenos estos 9.913 m² como superficie de cálculo. */}
                    <p className="text-[11px] text-white/40 mt-2 leading-relaxed">
                        Hará falta el <strong className="text-white/60">.xml del certificado energético del edificio</strong>:
                        de él salen la demanda y la superficie útil con las que se calcula el ahorro.
                        La superficie de arriba es la <em>construida</em> del Catastro, que no es la del cálculo.
                    </p>
                </div>
            )}

            <div className="border-t border-white/10 pt-5">
                <p className="text-white/70 text-sm font-bold mb-1">
                    {permiteBloque ? '¿O es para una vivienda concreta?' : 'Elige la vivienda'}
                </p>
                <p className="text-white/40 text-xs mb-1">
                    Esta referencia es la del edificio. Para simular una sola vivienda, selecciónala en la lista.
                </p>
                <DwellingPicker
                    dwellings={parcela.dwellings}
                    selectedRc={rcElegida}
                    onSelect={(d) => { setRcElegida(d?.rc || null); onSelectDwelling?.(d); }}
                />
            </div>

            <button
                onClick={onCancel}
                className="mt-6 text-white/40 hover:text-white/70 text-xs font-bold uppercase tracking-widest transition-colors"
            >
                ← Buscar otra referencia
            </button>
        </div>
    );
}
